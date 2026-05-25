'use client';

import { useEffect } from 'react';

/**
 * Registra el Service Worker de la PWA.
 * Se monta en el layout raíz para que corra en todas las rutas.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registrado:', registration.scope);
        })
        .catch((error) => {
          console.error('[PWA] Error registrando Service Worker:', error);
        });
    }
  }, []);

  return null;
}
