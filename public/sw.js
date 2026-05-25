/**
 * Kinética — Service Worker
 * Estrategia: Cache-First para shell estático, Network-First para APIs.
 * Sprint 1: shell offline básico.
 */

const CACHE_NAME = 'kinetica-shell-v1';

// Assets críticos del shell que se cachean en install.
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  // Nota: Next.js genera chunks con hash; el shell se cachea via precache
  // del propio framework en builds de producción. Este SW es un layer ligero
  // encima para controlar comportamiento offline de la app.
];

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  // @ts-ignore — event.waitUntil es válido en ServiceWorkerGlobalScope
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  // @ts-ignore — skipWaiting
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activando...');
  // @ts-ignore
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // @ts-ignore — claim clients inmediatamente
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // @ts-ignore
  const request = event.request;
  const url = new URL(request.url);

  // Solo interceptar peticiones GET dentro del mismo origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Estrategia Cache-First para shell estático (HTML, CSS, JS, fonts, icons)
  if (
    request.destination === 'document' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    request.destination === 'image'
  ) {
    // @ts-ignore
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(request)
          .then((response) => {
            // Cachear respuestas válidas
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
            return response;
          })
          .catch(() => {
            // Si falla y es una navegación, mostrar fallback offline
            if (request.destination === 'document') {
              return caches.match('/');
            }
            return new Response('Offline', { status: 503 });
          });
      })
    );
    return;
  }

  // APIs y demás: Network-First
  // @ts-ignore
  event.respondWith(
    fetch(request)
      .then((response) => {
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});
