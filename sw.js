/* Mi Espacio · service worker
   - Páginas y código: primero la red (así ves siempre la versión nueva) y, sin internet, lo guardado.
   - Tipografías de Google: se guardan la primera vez y se reutilizan. */
const VERSION = 'mi-espacio-v1';
const PRECACHE = [
  './', 'index.html', 'organizador.html', 'cajas.html', 'compras.html', 'ahorros.html', 'traslado.html', 'instituto.html', 'malla.html',
  'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
    );
    return;
  }

  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => {
        const red = fetch(req).then(res => {
          const copia = res.clone();
          caches.open(VERSION).then(c => c.put(req, copia));
          return res;
        }).catch(() => hit);
        return hit || red;
      })
    );
  }
});
