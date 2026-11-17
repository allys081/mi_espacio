/* Mi Espacio · código común: service worker + IndexedDB para fotos + respaldo total + avisos con Deshacer + barra inferior */
(function () {
  var s = document.currentScript;
  var base = s ? s.src.replace(/app\.js.*$/, '') : './';

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', function () {
      navigator.serviceWorker.register(base + 'sw.js?v=5').then(function (reg) {
        if (reg && reg.update) reg.update().catch(function () {});
      }).catch(function () {});
    });
  }

  // Todas las claves que usa el proyecto
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

  /* ── IndexedDB para fotos (así dejan de consumir el límite de 5 MB de localStorage) ── */
  var DB_NAME = 'mi_espacio_fotos_db', STORE = 'fotos';
  var memFotos = {}; // caché en memoria para lectura síncrona inmediata
  var fotosBytesTotal = 0;
  var dbProm = null;

  function abrirDB() {
    if (dbProm) return dbProm;
    dbProm = new Promise(function (ok) {
      if (!window.indexedDB) return ok(null);
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = function (e) { ok(e.target.result); };
        req.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
    return dbProm;
  }

  function recalcularBytesFotos() {
    var chars = 0;
    Object.keys(memFotos).forEach(function (k) {
      if (typeof memFotos[k] === 'string') chars += memFotos[k].length;
    });
    fotosBytesTotal = chars;
  }

  var fotosReadyProm = abrirDB().then(function (db) {
    if (!db) return;
    return new Promise(function (ok) {
      try {
        var tx = db.transaction(STORE, 'readonly');
        var st = tx.objectStore(STORE);
        var reqK = st.getAllKeys();
        var reqV = st.getAll();
        tx.oncomplete = function () {
          var ks = reqK.result || [], vs = reqV.result || [];
          for (var i = 0; i < ks.length; i++) memFotos[ks[i]] = vs[i];
          recalcularBytesFotos();
          migrarFotosLocalStorage();
          dispatchEvent(new CustomEvent('miespacio:fotos-listas'));
          ok();
        };
        tx.onerror = function () { ok(); };
      } catch (e) { ok(); }
    });
  });

  function guardarFoto(id, dataUrl) {
    if (!id) return '';
    if (!dataUrl) {
      delete memFotos[id];
      recalcularBytesFotos();
      abrirDB().then(function (db) {
        if (!db) return;
        try { var tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); } catch (e) {}
      });
      return '';
    }
    if (String(dataUrl).indexOf('idb:') === 0) return dataUrl;
    memFotos[id] = dataUrl;
    recalcularBytesFotos();
    abrirDB().then(function (db) {
      if (!db) return;
      try { var tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(dataUrl, id); } catch (e) {}
    });
    return 'idb:' + id;
  }

  function obtenerFoto(ref) {
    if (!ref || typeof ref !== 'string') return null;
    if (ref.indexOf('idb:') === 0) {
      var id = ref.slice(4);
      return memFotos[id] || null;
    }
    return ref;
  }

  // Migra automáticamente fotos base64 guardadas en org_cajas, org_compras y estacion_cosas a IndexedDB
  function migrarFotosLocalStorage() {
    try {
      // 1. org_cajas
      var cajas = JSON.parse(localStorage.getItem('org_cajas') || 'null');
      var modCajas = false;
      if (Array.isArray(cajas)) {
        cajas.forEach(function (c) {
          if (c && typeof c.foto === 'string' && c.foto.indexOf('data:') === 0) {
            c.foto = guardarFoto('caja_' + c.id, c.foto);
            modCajas = true;
          }
          (c && c.items || []).forEach(function (it) {
            if (it && typeof it.foto === 'string' && it.foto.indexOf('data:') === 0) {
              it.foto = guardarFoto('obj_' + it.id, it.foto);
              modCajas = true;
            }
          });
        });
        if (modCajas) localStorage.setItem('org_cajas', JSON.stringify(cajas));
      }
      // 2. org_compras
      var compras = JSON.parse(localStorage.getItem('org_compras') || 'null');
      var modComp = false;
      if (Array.isArray(compras)) {
        compras.forEach(function (c) {
          (c && c.items || []).forEach(function (p) {
            if (p && typeof p.foto === 'string' && p.foto.indexOf('data:') === 0) {
              p.foto = guardarFoto('prod_' + p.id, p.foto);
              modComp = true;
            }
            if (p && typeof p.fotoTienda === 'string' && p.fotoTienda.indexOf('data:') === 0) {
              p.fotoTienda = guardarFoto('tienda_' + p.id, p.fotoTienda);
              modComp = true;
            }
          });
        });
        if (modComp) localStorage.setItem('org_compras', JSON.stringify(compras));
      }
      // 3. estacion_cosas
      var cosas = JSON.parse(localStorage.getItem('estacion_cosas') || 'null');
      var modCosas = false;
      if (cosas && typeof cosas === 'object') {
        ['renaico', 'hualqui'].forEach(function (lug) {
          (cosas[lug] || []).forEach(function (cs) {
            if (cs && typeof cs.foto === 'string' && cs.foto.indexOf('data:') === 0) {
              cs.foto = guardarFoto('cosa_' + cs.id, cs.foto);
              modCosas = true;
            }
          });
        });
        if (modCosas) localStorage.setItem('estacion_cosas', JSON.stringify(cosas));
      }
    } catch (e) {}
  }

  function exportar(filtro) {
    var datos = {};
    claves().forEach(function (k) {
      if (!filtro || filtro.test(k)) datos[k] = localStorage.getItem(k);
    });
    var fotos = {};
    if (!filtro) {
      Object.keys(memFotos).forEach(function (k) { fotos[k] = memFotos[k]; });
    }
    return { app: 'mi-espacio', version: 5, fecha: new Date().toISOString(), datos: datos, fotos: fotos };
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

  function leerArchivo(file, filtro) {
    return new Promise(function (ok, fail) {
      var r = new FileReader();
      r.onerror = function () { fail(new Error('No pude leer el archivo.')); };
      r.onload = function () {
        try {
          var o = JSON.parse(r.result), d = null;
          if (o && o.datos && typeof o.datos === 'object') d = o.datos;
          else if (o && (o.estacion_detallada_data || o.org_cajas)) d = o;
          if (!d) throw new Error('Formato no reconocido.');
          var out = {};
          Object.keys(d).forEach(function (k) {
            if (PREF.test(k) && (!filtro || filtro.test(k)) && typeof d[k] === 'string') out[k] = d[k];
          });
          if (!Object.keys(out).length) throw new Error('El archivo no trae datos de esta sección.');
          if (o && o.fotos && typeof o.fotos === 'object') {
            Object.keys(o.fotos).forEach(function (id) { guardarFoto(id, o.fotos[id]); });
          }
          ok(out);
        } catch (e) { fail(e); }
      };
      r.readAsText(file);
    });
  }

  function aplicar(datos) {
    Object.keys(datos).forEach(function (k) { localStorage.setItem(k, datos[k]); });
    migrarFotosLocalStorage();
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
    // También suma fotos base64 que aún estén inline
    var fBytes = Math.round(fotosBytesTotal * 0.75);
    return {
      bytes: bytes,
      limite: limite,
      pct: Math.min(100, Math.round(bytes / limite * 100)),
      fotosBytes: fBytes
    };
  }

  function leerJSON(k, d) {
    try {
      var v = JSON.parse(localStorage.getItem(k));
      return v !== null && v !== undefined ? v : d;
    } catch (e) { return d; }
  }

  /* ── Aviso inferior con botón "Deshacer" por 6 segundos (reemplaza confirm) ── */
  var undoTimer = null, currentUndoFn = null;
  function mostrarToast(texto, onUndo, ms) {
    var box = document.getElementById('mi-undo-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'mi-undo-toast';
      box.style.cssText = 'position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translate(-50%,16px);width:min(92vw,420px);background:var(--text,#efeaf7);color:var(--bg,#14121a);padding:11px 15px;border-radius:14px;font:700 .84rem "Plus Jakarta Sans",system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 10px 28px rgba(0,0,0,.35);z-index:250;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s';
      document.body.appendChild(box);
    }
    clearTimeout(undoTimer);
    currentUndoFn = typeof onUndo === 'function' ? onUndo : null;
    var dur = ms || (currentUndoFn ? 6000 : 2500);
    box.innerHTML = '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
      String(texto).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; }) +
      '</span>' +
      (currentUndoFn ? '<button type="button" id="mi-undo-btn" style="background:none;border:0;color:var(--g1,#7c5cd6);font:800 .84rem inherit;cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:4px 6px;border-radius:8px;white-space:nowrap"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>Deshacer</button>' : '');
    box.style.opacity = '1';
    box.style.transform = 'translate(-50%,0)';
    box.style.pointerEvents = 'auto';
    var btn = document.getElementById('mi-undo-btn');
    if (btn) {
      btn.onclick = function () {
        clearTimeout(undoTimer);
        box.style.opacity = '0';
        box.style.transform = 'translate(-50%,16px)';
        box.style.pointerEvents = 'none';
        if (currentUndoFn) { var fn = currentUndoFn; currentUndoFn = null; fn(); }
      };
    }
    undoTimer = setTimeout(function () {
      box.style.opacity = '0';
      box.style.transform = 'translate(-50%,16px)';
      box.style.pointerEvents = 'none';
      currentUndoFn = null;
    }, dur);
  }

  function respaldoViejo() {
    var t = leerJSON('portada_ultimo_respaldo', null);
    if (!t) return false;
    var d = Math.floor((Date.now() - new Date(t)) / 864e5);
    return d >= 30;
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
    actualizarNav: actualizarNav,
    toast: mostrarToast,
    respaldoViejo: respaldoViejo,
    fotos: {
      guardar: guardarFoto,
      obtener: obtenerFoto,
      listo: fotosReadyProm
    }
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
