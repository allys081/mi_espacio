/* Mi Espacio · código común: service worker + respaldo total + barra inferior */
(function () {
  var s = document.currentScript;
  var base = s ? s.src.replace(/app\.js.*$/, '') : './';

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', function () {
      navigator.serviceWorker.register(base + 'sw.js?v=4').then(function (reg) {
        if (reg && reg.update) reg.update().catch(function () {});
      }).catch(function () {});
    });
  }

  // Todas las claves que usa el proyecto (ver README, sección "Datos")
  var PREF = /^(org_|vista_|color_|estacion_|malla|app_|portada_)/;

  function claves() {
    var k = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var n = localStorage.key(i);
        if (PREF.test(n)) k.push(n);
      }
    } catch (e) {}
    return k;
  }

  function exportar(filtro) {
    var datos = {};
    claves().forEach(function (k) {
      if (!filtro || filtro.test(k)) datos[k] = localStorage.getItem(k);
    });
    return { app: 'mi-espacio', version: 4, fecha: new Date().toISOString(), datos: datos };
  }

  function descargar(obj, nombre) {
    var blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function fechaArchivo() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  // Lee un archivo de respaldo y devuelve {clave: valor}.
  function leerArchivo(file, filtro) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onerror = function () { fail(new Error('No pude leer el archivo.')); };
      r.onload = function () {
        try {
          var o = JSON.parse(r.result), d = null;
          if (o && o.datos && typeof o.datos === 'object') d = o.datos;
          else if (o && (o.estacion_detallada_data || o.org_cajas)) d = o; // claves sueltas
          if (!d) throw new Error('Formato no reconocido.');
          var out = {};
          Object.keys(d).forEach(function (k) {
            if (PREF.test(k) && (!filtro || filtro.test(k)) && typeof d[k] === 'string') out[k] = d[k];
          });
          if (!Object.keys(out).length) throw new Error('El archivo no trae datos de esta sección.');
          ok(out);
        } catch (e) { fail(e); }
      };
      r.readAsText(file);
    });
  }

  function aplicar(datos) {
    Object.keys(datos).forEach(function (k) { localStorage.setItem(k, datos[k]); });
  }

  function uso() {
    var chars = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        chars += k.length + (localStorage.getItem(k) || '').length;
      }
    } catch (e) {}
    var bytes = chars * 2, limite = 5 * 1024 * 1024;
    return { bytes: bytes, limite: limite, pct: Math.min(100, Math.round(bytes / limite * 100)) };
  }

  function leerJSON(k, d) {
    try {
      var v = JSON.parse(localStorage.getItem(k));
      return v !== null && v !== undefined ? v : d;
    } catch (e) { return d; }
  }

  function actualizarNav() {
    try {
      // 1. Organizador: productos por reponer
      var comp = leerJSON('org_compras', []);
      var nInv = 0;
      (Array.isArray(comp) ? comp : []).forEach(function (c) {
        (c && c.items || []).forEach(function (p) {
          if (p && p.tieneRepuesto === 'no') nInv++;
        });
      });
      var bInv = document.getElementById('b-inv');
      if (bInv) {
        bInv.textContent = nInv || '';
        bInv.classList.toggle('on', nInv > 0);
      }

      // 2. Traslado: tareas por empacar
      var dat = leerJSON('estacion_detallada_data', null);
      var cats = leerJSON('estacion_categorias', null);
      var nTra = 0;
      if (dat && cats && Array.isArray(dat.renaico) && Array.isArray(cats.renaico)) {
        nTra = dat.renaico.filter(function (it) {
          var c = cats.renaico.find(function (x) { return x.key === it.cat; });
          return c && c.packing && !it.checked;
        }).length;
      }
      var bTra = document.getElementById('b-tra');
      if (bTra) {
        bTra.textContent = nTra || '';
        bTra.classList.toggle('on', nTra > 0);
      }

      // 3. Instituto: eventos en los próximos 7 días
      var hoy = new Date();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var hoyStr = hoy.getFullYear() + '-' + pad(hoy.getMonth() + 1) + '-' + pad(hoy.getDate());
      var toU = function (str) {
        var a = String(str).split('-').map(Number);
        return Date.UTC(a[0], a[1] - 1, a[2]);
      };
      var uHoy = toU(hoyStr);
      var cal = leerJSON('estacion_cal_items_v2', []);
      var nIns = (Array.isArray(cal) ? cal : []).filter(function (x) {
        if (!x || x.checked || !x.evalDate) return false;
        var d = Math.round((toU(x.evalDate) - uHoy) / 864e5);
        return d >= 0 && d <= 7;
      }).length;
      var bIns = document.getElementById('b-ins');
      if (bIns) {
        bIns.textContent = nIns || '';
        bIns.classList.toggle('on', nIns > 0);
      }
    } catch (e) {}
  }

  window.MiEspacio = {
    claves: claves,
    exportar: exportar,
    descargar: descargar,
    fechaArchivo: fechaArchivo,
    leerArchivo: leerArchivo,
    aplicar: aplicar,
    uso: uso,
    actualizarNav: actualizarNav
  };

  /* Barra inferior común (todas las páginas menos la portada, que trae la suya) */
  function montarNav() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', montarNav); return; }
    var f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (f === '' || f === 'index.html') {
      actualizarNav();
      return;
    }
    if (document.querySelector('nav.mi-nav')) {
      actualizarNav();
      return;
    }
    var org = /^(organizador|cajas|compras|ahorros)(\.html)?$/.test(f);
    var I = {
      home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
      box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
      tren: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l2-4M15 21l-2-4"/>',
      inst: '<path d="M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6"/>',
      gorro: '<path d="M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>'
    };
    var T = [
      ['index.html', 'Inicio', 'home', false, ''],
      ['organizador.html', 'Organizador', 'box', org, 'b-inv'],
      ['traslado.html', 'Traslado', 'tren', /^traslado(\.html)?$/.test(f), 'b-tra'],
      ['instituto.html', 'Instituto', 'inst', /^instituto(\.html)?$/.test(f), 'b-ins'],
      ['malla.html', 'Malla', 'gorro', /^malla(\.html)?$/.test(f), '']
    ];
    var css = document.createElement('style');
    css.textContent =
      'body{padding-bottom:calc(150px + env(safe-area-inset-bottom,0px)) !important}' +
      '.fab,.fab-bar{bottom:calc(88px + env(safe-area-inset-bottom,0px)) !important}' +
      'nav.mi-nav{position:fixed;left:0;right:0;bottom:0;z-index:45;padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));pointer-events:none}' +
      'nav.mi-nav div{pointer-events:auto;max-width:440px;margin:0 auto;display:flex;background:var(--card,#fffdf9);border:1px solid var(--border,#eadfd2);border-radius:22px;box-shadow:0 6px 22px rgba(0,0,0,.18);padding:6px}' +
      '[data-theme=dark] nav.mi-nav div{background:#1e1b27;border-color:#2d2939;color:#efeaf7}' +
      '[data-theme=dark] nav.mi-nav a{color:#a39cb3}' +
      '[data-theme=dark] nav.mi-nav a.on{background:#2b2445;color:#c4b5fd}' +
      'nav.mi-nav a{flex:1;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font:700 .62rem "Plus Jakarta Sans",system-ui,sans-serif;color:var(--muted,#7a685d);text-decoration:none;border-radius:16px;position:relative}' +
      'nav.mi-nav a.on{background:color-mix(in srgb,var(--p,var(--g1,#7c5cd6)) 18%,var(--card,#fffdf9));color:var(--p,var(--g1,#7c5cd6))}' +
      'nav.mi-nav svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
      'nav.mi-nav a b{position:absolute;top:2px;left:calc(50% + 4px);min-width:16px;height:16px;border-radius:99px;background:var(--p,var(--g1,#7c5cd6));color:#fff;font-size:.6rem;display:none;align-items:center;justify-content:center;padding:0 4px;line-height:1}' +
      '[data-theme=dark] nav.mi-nav a b{color:#14121a;font-weight:800}' +
      'nav.mi-nav a b.on{display:flex}';
    document.head.appendChild(css);
    var n = document.createElement('nav');
    n.className = 'mi-nav';
    n.setAttribute('aria-label', 'Navegación principal');
    n.innerHTML = '<div>' + T.map(function (t) {
      return '<a href="' + t[0] + '"' + (t[3] ? ' class="on"' : '') + '><svg viewBox="0 0 24 24" aria-hidden="true">' + I[t[2]] + '</svg>' + t[1] + (t[4] ? '<b id="' + t[4] + '"></b>' : '') + '</a>';
    }).join('') + '</div>';
    document.body.appendChild(n);
    actualizarNav();
  }

  montarNav();
  addEventListener('pageshow', actualizarNav);
  addEventListener('storage', actualizarNav);
  document.addEventListener('click', function () { setTimeout(actualizarNav, 60); });
})();
