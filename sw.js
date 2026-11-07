/**
 * Service worker minimal — AUCUN cache.
 *
 * Il existe uniquement pour rendre l'application installable (PWA).
 * Pas de gestionnaire « fetch » : toutes les requêtes passent directement
 * par le réseau, comme sans service worker. Rien n'est stocké.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  // Purge défensive : supprime tout cache qui aurait pu exister.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
