/**
 * Kinética — Service Worker Kill Switch
 * Este SW desregistra cualquier SW anterior y limpia caches.
 * Usar durante debugging de redirect loops.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// No interceptar NINGÚN fetch — pasar todo al network
self.addEventListener('fetch', (event) => {
  // No hacer nada, dejar que el navegador maneje la petición normalmente
});
