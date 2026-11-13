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
