/* Mi Espacio · código común: service worker + respaldo total */
(function () {
  var s = document.currentScript;
  var base = s ? s.src.replace(/app\.js.*$/, '') : '/';

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', function () {
      navigator.serviceWorker.register(base + 'sw.js').catch(function () {});
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
    return { app: 'mi-espacio', version: 2, fecha: new Date().toISOString(), datos: datos };
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

  window.MiEspacio = {
    claves: claves,
    exportar: exportar,
    descargar: descargar,
    fechaArchivo: fechaArchivo,
    leerArchivo: leerArchivo,
    aplicar: aplicar,
    uso: uso
  };
})();

/* ===== Tema común, "Cambiar tema" y barra inferior ===== */
(function () {
  var L = null; try { L = window.localStorage; } catch (e) {}
  if (!L) return;
var EST_THEMES = [
      { id:'rubi',    n:'Mocha rubí',            d:'rubí intenso, lavanda y café blanco',         h:342, s:34, a:['#9b2f55','#e58aa5'], b:['#7a5bb5','#c6b2ee'], sw:['#7a3149','#e7a3b5','#c8b6e2','#efe6e4','#6b4a40'], g:['#4a2236','#a24a68'], m:'dark' },
      { id:'flores',  n:'Felicidad de las flores', d:'pétalos de rosa y burbujas de melocotón',     h:350, s:62, a:['#d02a66','#ff7ea5'], b:['#b9501f','#ffb592'], sw:['#ff5c8a','#ff9a6c','#c9b0ff','#fff0f0'],         g:['#ff5c93','#ff8a6a'], m:'light' },
      { id:'matcha',  n:'Miel de matcha',          d:'hojas de salvia, chorrito de miel tibia',     h:140, s:26, a:['#37744f','#8fd3a2'], b:['#946400','#f3cb55'], sw:['#2f6b4f','#0d3b2e','#c79a5a','#f5c518'],         g:['#1f5a40','#e5b817'], m:'light' },
      { id:'niebla',  n:'Niebla de lavanda',       d:'resplandor púrpura después de medianoche',    h:262, s:26, a:['#6a4cb0','#b9a0f7'], b:['#7a6a9c','#d0c8e8'], sw:['#2a2438','#4a4160','#8f86a8','#d6d0e3'],         g:['#2d2640','#cfc9dc'], m:'dark' },
      { id:'sorbete', n:'Sorbete bañado por el sol', d:'coral, mermelada de tomate y cielo',         h:18,  s:78, a:['#cc4126','#ff8f6b'], b:['#1c7aa0','#74d2ef'], sw:['#fff1c9','#ffd27a','#ff7a59','#d63a3a','#4ec3e0'], g:['#ffc370','#e0402e'], m:'light' },
      { id:'peonia',  n:'Latte de peonía',         d:'colorete, palo de rosa y crema de vainilla',   h:10,  s:42, a:['#b04f69','#eaa3b6'], b:['#587a48','#b9cf9f'], sw:['#fff3dc','#f6c1cf','#b1c08e','#b6bfd8'],         g:['#f0b9c8','#3b3447'], m:'light' },
      { id:'limon',   n:'Brisa de limón',          d:'lino azul cielo, piedra lunar y azafrán',     h:195, s:42, a:['#1a7385','#72d3e3'], b:['#9a6c00','#f7c84a'], sw:['#bfe6ee','#76b9c4','#f2b83a','#1d3a40'],         g:['#a9dbe6','#e4b94a'], m:'light' },
      { id:'acero',   n:'Acero de medianoche',     d:'noche azul tinta y niebla plateada',            h:210, s:38, a:['#2c5a85','#92bde3'], b:['#566b7b','#bac6d1'], sw:['#0e1d27','#274255','#4c6677','#9fb2bd','#c5d0d6'], g:['#0c1a24','#6f8794'], m:'dark' },
      { id:'bryn',    n:'El hogar de Bryn',        d:'pino intenso, musgo y chocolate negro',        h:112, s:24, a:['#46692f','#a0c97e'], b:['#774526','#d6a579'], sw:['#17301c','#2e5a2a','#4f6b33','#5a3a28','#7a5a40'], g:['#1f3a1f','#6b4a30'], m:'dark' },
      { id:'lila',    n:'Sueño diurno de lila',    d:'bruma color lavanda, convertida en luz del día.', h:265, s:46, a:['#7752d0','#ab8ffb'], b:['#86449f','#d6a9ee'], sw:['#efe7ff','#cdb9f0','#a98ad8','#7a55b8','#3d2a66'], g:['#e3d6fa','#7a55b8'], m:'light' },
      { id:'violeta', n:'Latte violeta',           d:'flores de lila sobre crema de vainilla',        h:38,  s:55, a:['#7747b3','#bd9ef0'], b:['#8c6d1f','#edda9c'], sw:['#fff1d6','#f0dfa0','#d3b8ec','#9a6fc9','#3b2a5a'], g:['#f6e7c3','#9a6fc9'], m:'light' },
      { id:'melocoton', n:'Ensueño melocotón', d:'lápiz labial color baya, caramelo y jazmín', h:338, s:60, a:['#c32a62', '#e68aab'], b:['#916630', '#dbbb94'], sw:['#fef9f4', '#fce7d6', '#fae0e5', '#c32a62', '#43192c'], g:['#fcede5', '#cc4678'], m:'light',
        pal:{'m': 'light', 'bg': '#fdefe4', 'bg1': '#fef4ec', 'card': '#fef9f4', 'soft': '#fce7d6', 'border': '#e6cec2', 'text': '#43192c', 'muted': '#927780'} },
      { id:'kuro', n:'Beso Kuro', d:'violeta intenso, lila y un poco de rosa', h:253, s:60, a:['#504282', '#aaa0cf'], b:['#913084', '#db94d2'], sw:['#fdfbff', '#eeeafa', '#e5e0f6', '#504282', '#231a42'], g:['#eeebfa', '#685a94'], m:'light',
        pal:{'m': 'light', 'bg': '#f5f2fc', 'bg1': '#f9f7fe', 'card': '#fdfbff', 'soft': '#eeeafa', 'border': '#d6d1e4', 'text': '#231a42', 'muted': '#7f7891'} },
      { id:'orquidea', n:'Orquídea rosada', d:'pétalos de orquídea, malva y crema rosada', h:299, s:60, a:['#98499a', '#d09ed1'], b:['#91303b', '#db949c'], sw:['#fefbfc', '#fae6f1', '#f4dff1', '#98499a', '#3a2044'], g:['#f9edf5', '#a860a8'], m:'light',
        pal:{'m': 'light', 'bg': '#fceff6', 'bg1': '#fdf6f9', 'card': '#fefbfc', 'soft': '#fae6f1', 'border': '#e3cedc', 'text': '#3a2044', 'muted': '#8c7c91'} },
      { id:'ciruela', n:'Ciruela clara', d:'ciruela madura, rosa empolvado y crema', h:305, s:37, a:['#6b3366', '#d19ecc'], b:['#913130', '#db9494'], sw:['#fefbfd', '#f1e5ee', '#efdeea', '#6b3366', '#3c1e3a'], g:['#f7ecf2', '#824d7b'], m:'light',
        pal:{'m': 'light', 'bg': '#f7eff5', 'bg1': '#fbf6f9', 'card': '#fefbfd', 'soft': '#f1e5ee', 'border': '#dbcdd8', 'text': '#3c1e3a', 'muted': '#8d7b8c'} },
      { id:'primavera', n:'Flores de primavera', d:'flores de cerezo, cielo y hojas nuevas', h:340, s:40, a:['#a2557a', '#e3a3c0'], b:['#5f8a3c', '#b3d18a'], sw:['#b77090', '#ecc7d5', '#cfdce9', '#82b0d3', '#9ab36f'], g:['#dcb1c5', '#99b68d'], m:'light',
        pal:{'m': 'light', 'bg': '#fbf0f4', 'bg1': '#fdf7f9', 'card': '#fffbfc', 'soft': '#f5e3eb', 'border': '#e6cfda', 'text': '#3a2833', 'muted': '#8d8187'} },
      { id:'framcafe', n:'Frambuesa y café', d:'café con leche y un toque de frambuesa', h:341, s:48, a:['#a44764', '#d49bad'], b:['#916b30', '#dbbf94'], sw:['#fffaf7', '#f0e0dd', '#f7dbe2', '#a44764', '#45262f'], g:['#f7e9e8', '#b05e75'], m:'light',
        pal:{'m': 'light', 'bg': '#f7ece9', 'bg1': '#fbf4f0', 'card': '#fffaf7', 'soft': '#f0e0dd', 'border': '#dbcac8', 'text': '#45262f', 'muted': '#937f83'} },
      { id:'supernova', n:'Supernova de medianoche', d:'noche oscura y violeta y luz de estrellas', h:268, s:50, a:['#4a5182', '#a2a7ca'], b:['#7d3091', '#cc94db'], sw:['#100121', '#110427', '#19123f', '#a2a7ca', '#eae7f4'], g:['#05040d', '#8d90b3'], m:'dark',
        pal:{'m': 'dark', 'bg': '#100121', 'bg1': '#110325', 'card': '#110427', 'soft': '#19123f', 'border': '#363058', 'text': '#eae7f4', 'muted': '#9790a4'} },
      { id:'ciruelahumo', n:'Ciruela humo', d:'ciruela grisácea y rosa empolvado', h:262, s:24, a:['#804c67', '#c8a2b6'], b:['#915630', '#dbb094'], sw:['#2b2830', '#36323a', '#3e3441', '#c8a2b6', '#ede6ed'], g:['#28232a', '#b291a4'], m:'dark',
        pal:{'m': 'dark', 'bg': '#2b2830', 'bg1': '#322e36', 'card': '#36323a', 'soft': '#3e3441', 'border': '#564d59', 'text': '#ede6ed', 'muted': '#a39ea5'} },
      { id:'pizarra', n:'Pizarra y lavanda', d:'gris pizarra con lavanda apagada', h:240, s:24, a:['#534983', '#afa8cf'], b:['#913088', '#db94d4'], sw:['#2b2b36', '#323642', '#36344c', '#afa8cf', '#e8e9ef'], g:['#252531', '#9b95b9'], m:'dark',
        pal:{'m': 'dark', 'bg': '#2b2b36', 'bg1': '#2f323d', 'card': '#323642', 'soft': '#36344c', 'border': '#4f4d63', 'text': '#e8e9ef', 'muted': '#a0a1a9'} },
      { id:'frampastel', n:'Frambuesa pastel', d:'frambuesa suave sobre una noche de ciruela', h:324, s:26, a:['#9b316f', '#d883b5'], b:['#915030', '#dbab94'], sw:['#2e1f28', '#392632', '#4c2d41', '#d883b5', '#f1e8ef'], g:['#2c1c27', '#c376a4'], m:'dark',
        pal:{'m': 'dark', 'bg': '#2e1f28', 'bg1': '#35232e', 'card': '#392632', 'soft': '#4c2d41', 'border': '#634759', 'text': '#f1e8ef', 'muted': '#a79ca3'} },
      { id:'indigo', n:'Índigo lunar', d:'índigo suave bajo la luz de la luna', h:234, s:27, a:['#2b32a1', '#8c91e0'], b:['#843091', '#d194db'], sw:['#222436', '#2b2c42', '#2f3061', '#8c91e0', '#e6ebf6'], g:['#1f1f36', '#7c82cc'], m:'dark',
        pal:{'m': 'dark', 'bg': '#222436', 'bg1': '#27293d', 'card': '#2b2c42', 'soft': '#2f3061', 'border': '#494a76', 'text': '#e6ebf6', 'muted': '#9c9fad'} },
      { id:'orquideanoc', n:'Orquídea nocturna', d:'orquídea pastel sobre ciruela muy oscura', h:291, s:27, a:['#873696', '#c98ad5'], b:['#913048', '#db94a5'], sw:['#2f2331', '#3a293e', '#472f4f', '#c98ad5', '#f3e8f4'], g:['#2b1e2f', '#b37dbf'], m:'dark',
        pal:{'m': 'dark', 'bg': '#2f2331', 'bg1': '#362739', 'card': '#3a293e', 'soft': '#472f4f', 'border': '#5f4966', 'text': '#f3e8f4', 'muted': '#a99daa'} }
    ];
    var EST_ACC_MIGRA = { violeta:'lila', rosa:'peonia', celeste:'limon', agua:'matcha' };
    function estHsl(h, s, l) { return 'hsl(' + Math.round(h) + ',' + Math.round(s) + '%,' + l + '%)'; }
    function estLum(hex) {
      var c = [1,3,5].map(function (i) { var v = parseInt(hex.substr(i,2),16)/255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); });
      return .2126*c[0] + .7152*c[1] + .0722*c[2];
    }
    function estHue(hex) {
      var r=parseInt(hex.substr(1,2),16)/255, g=parseInt(hex.substr(3,2),16)/255, b=parseInt(hex.substr(5,2),16)/255;
      var mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn, h=0;
      if (d) { h = mx===r ? ((g-b)/d)%6 : mx===g ? (b-r)/d+2 : (r-g)/d+4; h*=60; if (h<0) h+=360; }
      return h;
    }
    function estTheme(id) {
      if (EST_ACC_MIGRA[id]) id = EST_ACC_MIGRA[id];
      for (var i = 0; i < EST_THEMES.length; i++) if (EST_THEMES[i].id === id) return EST_THEMES[i];
      return EST_THEMES[9];
    }
    function estApplyTheme(id, mode) {
      var T = estTheme(id), dark = mode === 'dark', st = document.documentElement.style;
      var p = dark ? T.a[1] : T.a[0], g = dark ? T.b[1] : T.b[0], hp = estHue(p), hg = estHue(g);
      var sl = Math.min(T.s, 60), sd = Math.min(T.s * .6, 30);
      var v = dark ? {
        '--bg': estHsl(T.h, sd, 7), '--card': estHsl(T.h, sd, 10.5), '--card-elevated': estHsl(T.h, sd, 15),
        '--border': estHsl(T.h, sd, 22), '--text': estHsl(T.h, 30, 94), '--muted': estHsl(T.h, 12, 66),
        '--p-soft': estHsl(hp, 30, 22), '--gold-soft': estHsl(hg, 28, 20)
      } : {
        '--bg': estHsl(T.h, sl * .8, 96), '--card': estHsl(T.h, sl, 99), '--card-elevated': estHsl(T.h, sl * .9, 92.5),
        '--border': estHsl(T.h, sl * .8, 85), '--text': estHsl(T.h, 38, 14), '--muted': estHsl(T.h, 14, 38),
        '--p-soft': estHsl(hp, 60, 92), '--gold-soft': estHsl(hg, 62, 91)
      };
      var P = T.pal && T.pal.m === (dark ? 'dark' : 'light') ? T.pal : null;
      if (P) { v['--bg'] = P.bg; v['--card'] = P.card; v['--card-elevated'] = P.soft; v['--border'] = P.border; v['--text'] = P.text; v['--muted'] = P.muted; }
      v['--p'] = p; v['--gold'] = g;
      v['--on-p'] = estLum(p) > .38 ? '#14121a' : '#ffffff';
      for (var k in v) st.setProperty(k, v[k]);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.tema = T.id;
      var m = document.getElementById('metaThemeColor');
      if (m) m.setAttribute('content', dark ? estHsl(T.h, sd, 7) : estHsl(T.h, sl * .8, 96));
      return T;
    }

  var MODO = { oscuro: 'dark', claro: 'light', auto: 'auto' };
  function sistemaOscuro() { return matchMedia('(prefers-color-scheme: dark)').matches; }
  function modoGuardado() { var a = L.getItem('app_tema') || 'auto'; return a; }
  function esOscuro() {
    var m = modoGuardado();
    return m === 'oscuro' || (m === 'auto' && sistemaOscuro());
  }
  // Las dos claves de tema (app_tema y estacion_tema) se mantienen iguales.
  var setOrig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setOrig.call(this, k, v);
    if (this !== L) return;
    if (k === 'app_tema') setOrig.call(L, 'estacion_tema', MODO[v] || 'auto');
    else if (k === 'estacion_tema') setOrig.call(L, 'app_tema', v === 'light' ? 'claro' : v === 'dark' ? 'oscuro' : 'auto');
  };

  // Colores neutros (fondo, tarjetas, texto) del tema elegido, para todas las páginas.
  function aplicarNeutros() {
    var T = estTheme(L.getItem('estacion_acento') || 'lila');
    var dark = document.documentElement.dataset.theme === 'dark';
    var sl = Math.min(T.s, 60), sd = Math.min(T.s * .6, 30);
    var bg  = dark ? estHsl(T.h, sd, 7)  : estHsl(T.h, sl * .8, 96);
    var bg1 = dark ? estHsl(T.h, sd, 12) : estHsl(T.h, sl * .8, 92);
    var card = dark ? estHsl(T.h, sd, 10.5) : estHsl(T.h, sl, 99);
    var bord = dark ? estHsl(T.h, sd, 22) : estHsl(T.h, sl * .8, 85);
    var text = dark ? estHsl(T.h, 30, 94) : estHsl(T.h, 38, 14);
    var mute = dark ? estHsl(T.h, 12, 66) : estHsl(T.h, 14, 38);
    var soft = dark ? estHsl(T.h, sd, 15) : estHsl(T.h, sl * .9, 92.5);
    var P = T.pal && T.pal.m === (dark ? 'dark' : 'light') ? T.pal : null;
    if (P) { bg = P.bg; bg1 = P.bg1; card = P.card; bord = P.border; text = P.text; mute = P.muted; soft = P.soft; }
    var v = { '--bg': bg, '--bg1': bg1, '--bg2': bg, '--card': card, '--border': bord, '--text': text, '--title': text,
      '--muted': mute, '--soft': soft, '--hover': soft, '--arrow': mute,
      '--card-bg': card, '--card-border': bord, '--text-main': text, '--text-muted': mute,
      '--bg-gradient': 'linear-gradient(180deg,' + bg1 + ' 0%,' + bg + ' 100%)' };
    var st = document.documentElement.style;
    for (var k in v) st.setProperty(k, v[k]);
    document.documentElement.dataset.tema = T.id;
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', bg);
  }
  function repintarPagina() {
    var dark = esOscuro();
    try { if (window.aplicarTema) window.aplicarTema(); } catch (e) {}
    try { if (window.aplicar) window.aplicar(); } catch (e) {}
    try { if (window.applyTheme) window.applyTheme(dark ? 'dark' : 'light'); } catch (e) {}
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    aplicarNeutros();
  }
  function elegirModo(m) { L.setItem('app_tema', m); repintarPagina(); }
  function elegirTema(id) {
    L.setItem('estacion_acento', id);
    try { if (window.setTema) window.setTema(id); } catch (e) {}
    repintarPagina();
  }

  // ----- Ventana "Cambiar tema"
  function abrirTema() {
    if (document.getElementById('meTema')) return;
    var dark = document.documentElement.dataset.theme === 'dark';
    var T = estTheme(L.getItem('estacion_acento') || 'lila');
    var cs = getComputedStyle(document.documentElement);
    var card = cs.getPropertyValue('--card').trim() || '#1e1b27', tx = cs.getPropertyValue('--text').trim() || '#efeaf7',
        mu = cs.getPropertyValue('--muted').trim() || '#a39cb3', bd = cs.getPropertyValue('--border').trim() || '#2d2939';
    var acc = dark ? T.a[1] : T.a[0];
    var modo = modoGuardado();
    var ov = document.createElement('div'); ov.id = 'meTema';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(8,6,14,.62);display:flex;align-items:center;justify-content:center;padding:18px;font-family:system-ui,sans-serif';
    var seg = ['auto', 'claro', 'oscuro'].map(function (m) {
      var nom = { auto: 'Automático', claro: 'Claro', oscuro: 'Oscuro' }[m], on = m === modo;
      return '<button data-m="' + m + '" style="flex:1;height:44px;border-radius:11px;border:1.5px solid ' + (on ? acc : bd) + ';background:' + (on ? acc + '33' : 'transparent') + ';color:' + tx + ';font:700 13px system-ui">' + nom + '</button>';
    }).join('');
    var lista = EST_THEMES.map(function (t) {
      var on = t.id === T.id;
      return '<button data-t="' + t.id + '" style="display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:6px 8px;border-radius:12px;border:1.5px solid ' + (on ? acc : 'transparent') + ';background:transparent;color:' + tx + ';text-align:left;font:inherit">' +
        '<span style="width:44px;height:32px;border-radius:9px;flex:none;background:linear-gradient(135deg,' + t.g[0] + ',' + t.g[1] + ')"></span>' +
        '<span style="flex:1;min-width:0"><b style="display:block;font-size:14px">' + t.n + '</b><span style="display:block;font-size:11.5px;color:' + mu + '">' + t.d + '</span></span>' +
        (on ? '<i class=ic-check style="color:' + acc + '"></i>' : '') + '</button>';
    }).join('');
    ov.innerHTML = '<div style="width:100%;max-width:420px;max-height:88vh;display:flex;flex-direction:column;background:' + card + ';color:' + tx + ';border:1px solid ' + bd + ';border-radius:24px;padding:18px;box-shadow:0 20px 50px rgba(0,0,0,.5)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b style="font-size:19px;font-family:Georgia,serif">Cambiar tema</b><button data-x style="width:44px;height:44px;border:0;background:none;color:' + mu + '"><i class=ic-cerrar></i></button></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' + seg + '</div>' +
      '<div style="overflow:auto;flex:1;margin:0 -4px;padding:0 4px">' + lista + '</div>' +
      '<div style="font-size:12px;color:' + mu + ';margin-top:10px">Se aplica a todas las páginas. Cada sección mantiene su color de acento.</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-x]')) { ov.remove(); return; }
      var m = e.target.closest('[data-m]'), t = e.target.closest('[data-t]');
      if (m) { elegirModo(m.dataset.m); ov.remove(); abrirTema(); }
      else if (t) { elegirTema(t.dataset.t); ov.remove(); abrirTema(); }
    });
  }
  // Los botones de tema de cada página abren esta ventana.
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#btn-tema, #btnThemeToggle, #btnTemas')) {
      e.preventDefault(); e.stopImmediatePropagation(); abrirTema();
    }
  }, true);

  // ----- Barra inferior
  var PAGINAS = [['index.html', 'Inicio', 'casa'], ['organizador.html', 'Organizador', 'caja'], ['traslado.html', 'Traslado', 'tren'], ['instituto.html', 'Instituto', 'escuela'], ['malla.html', 'Malla', 'birrete']];
  var GRUPO = { 'cajas.html': 'organizador.html', 'compras.html': 'organizador.html', 'ahorros.html': 'organizador.html' };
  function dock() {
    var f = (location.pathname.split('/').pop() || 'index.html'); if (f === '') f = 'index.html';
    if (f === 'index.html' || document.getElementById('meDock')) return;
    var act = GRUPO[f] || f;
    var n = document.createElement('nav'); n.id = 'meDock'; n.setAttribute('aria-label', 'Secciones');
    n.innerHTML = PAGINAS.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[0] === act ? ' class="on" aria-current="page"' : '') + '><i class=ic-' + p[2] + '></i><span>' + p[1] + '</span></a>';
    }).join('');
    var st = document.createElement('style');
    st.textContent = '#meDock{position:fixed;left:12px;right:12px;bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:900;display:flex;justify-content:space-around;padding:8px 6px;border-radius:22px;background:color-mix(in srgb,var(--card,#1e1b27) 94%,transparent);border:1px solid var(--border,#2d2939);box-shadow:0 10px 30px rgba(0,0,0,.28);backdrop-filter:blur(14px);max-width:560px;margin:0 auto}' +
      '#meDock a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-height:48px;padding:6px 2px;border-radius:15px;font:700 10.5px/1.1 system-ui,sans-serif;color:var(--muted,#a39cb3);text-decoration:none}' +
      '#meDock a i{width:1.5em;height:1.5em}#meDock a.on{color:var(--text,#fff);background:color-mix(in srgb,var(--p,#7c5cd6) 22%,transparent)}' +
      'body.me-con-dock{padding-bottom:96px!important}';
    document.head.appendChild(st); document.body.appendChild(n); document.body.classList.add('me-con-dock');
    // Botones flotantes y avisos suben para no quedar tapados por la barra.
    document.querySelectorAll('body *').forEach(function (el) {
      if (el === n || n.contains(el)) return;
      var c = getComputedStyle(el);
      if (c.position === 'fixed' && el.getBoundingClientRect().top > 200 && parseFloat(c.bottom) < 60 && el.getBoundingClientRect().height < 120)
        el.style.setProperty('bottom', (parseFloat(c.bottom) + 78) + 'px', 'important');
    });
  }

  function iniciar() {
    new MutationObserver(function () { aplicarNeutros(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    var st = document.createElement('style'); st.textContent = '#btnTemas{display:none!important}.ic-check{display:inline-block;width:1.15em;height:1.15em;vertical-align:-.2em;background:currentColor;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}.ic-check{--m:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27black%27 stroke-width=%272.4%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M5 12l5 5 9-10%27/%3E%3C/svg%3E")}';
    document.head.appendChild(st);
    aplicarNeutros(); dock();
  }
  window.MiEspacio = window.MiEspacio || {};
  window.MiEspacio.abrirTema = abrirTema;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();

/* ===== Ventanas propias: reemplazan confirm() y alert() =====
   MiEspacio.confirmar({ titulo, texto, ok, cancelar, peligro }) -> Promise<boolean>
   MiEspacio.avisar(texto, titulo) -> Promise<void> */
(function () {
  function css(n, d) { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d; } catch (e) { return d; } }

  function dialogo(o) {
    o = o || {};
    return new Promise(function (listo) {
      var card = css('--card', '#1e1b27'), tx = css('--text', '#efeaf7'), mu = css('--muted', '#a39cb3'),
          bd = css('--border', '#2d2939'), p = css('--p', '#7c5cd6'), onp = css('--on-p', '#ffffff'), bad = css('--bad', '#e5484d');
      var prev = document.activeElement;
      var ov = document.createElement('div');
      ov.className = 'me-dlg';
      ov.setAttribute('role', 'alertdialog');
      ov.setAttribute('aria-modal', 'true');
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147482000;background:rgba(8,6,14,.62);display:flex;align-items:center;justify-content:center;padding:18px;font-family:system-ui,sans-serif';

      var box = document.createElement('div');
      box.style.cssText = 'width:100%;max-width:380px;background:' + card + ';color:' + tx + ';border:1px solid ' + bd + ';border-radius:22px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.5)';

      var h = document.createElement('div');
      h.style.cssText = 'font:700 1.12rem Georgia,serif;margin-bottom:8px';
      h.textContent = o.titulo || 'Confirmar';
      var t = document.createElement('div');
      t.style.cssText = 'font-size:.92rem;line-height:1.45;color:' + mu + ';white-space:pre-line;overflow-wrap:anywhere';
      t.textContent = o.texto || '';
      var fila = document.createElement('div');
      fila.style.cssText = 'display:flex;gap:8px;margin-top:18px;justify-content:flex-end';

      function boton(txt, primario, peligro) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = txt;
        b.style.cssText = 'min-height:44px;min-width:44px;padding:0 18px;border-radius:12px;font:700 .88rem system-ui,sans-serif;cursor:pointer;' +
          (primario ? 'border:0;background:' + (peligro ? bad : p) + ';color:' + (peligro ? '#fff' : onp) : 'border:1.5px solid ' + bd + ';background:transparent;color:' + tx);
        return b;
      }

      var bCan = o.cancelar === false ? null : boton(o.cancelar || 'Cancelar', false);
      var bOk = boton(o.ok || (bCan ? 'Aceptar' : 'Entendido'), true, !!o.peligro);
      if (bCan) fila.appendChild(bCan);
      fila.appendChild(bOk);
      box.appendChild(h); box.appendChild(t); box.appendChild(fila);
      ov.appendChild(box);

      function cerrar(v) {
        document.removeEventListener('keydown', tecla, true);
        ov.remove();
        try { if (prev && prev.focus) prev.focus(); } catch (e) {}
        listo(v);
      }
      function tecla(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(false); }
      }
      bOk.onclick = function () { cerrar(true); };
      if (bCan) bCan.onclick = function () { cerrar(false); };
      ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(!bCan); });
      document.addEventListener('keydown', tecla, true);
      document.body.appendChild(ov);
      // En acciones peligrosas el foco empieza en "Cancelar" para no borrar por un toque de más.
      (o.peligro && bCan ? bCan : bOk).focus();
    });
  }

  window.MiEspacio = window.MiEspacio || {};
  window.MiEspacio.confirmar = dialogo;
  window.MiEspacio.avisar = function (texto, titulo) {
    return dialogo({ titulo: titulo || 'Aviso', texto: texto, ok: 'Entendido', cancelar: false });
  };
})();
