/* Service Worker — JarvyLlanoski
   Estrategia: Network-first para HTML/JS/CSS (siempre actualizado),
   cache como fallback si no hay internet.
*/
const V = 'jarvy-20260522s';
const SHELL = [
  './index.html',
  './app.js',
  './print.js',
  './suppliers.js',
  './config-ui.js',
  './tasks.js',
  './activity.js',
  './ui.js',
  './config.js',
  './cloud.js',
  './firebase-app.js',
  './firebase-firestore.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  /* Firestore/Firebase, QR API y CDN: solo red, sin cache */
  if (url.includes('googleapis.com') || url.includes('firebase') ||
      url.includes('qrserver.com') || url.includes('cloudflare') ||
      url.includes('fonts.g')) {
    e.respondWith(fetch(e.request));
    return;
  }
  /* App shell: red primero, actualiza cache, fallback a cache */
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(V).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

/* Notifica a todas las pestañas cuando hay una nueva versión */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
