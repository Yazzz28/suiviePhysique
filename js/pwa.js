/**
 * Enregistrement du service worker (app installable et utilisable hors ligne)
 * et bandeau « nouvelle version disponible ».
 * Ignoré en file:// où les service workers ne sont pas disponibles.
 */
(function () {
  'use strict';

  const supported = 'serviceWorker' in navigator && /^https?:$/.test(window.location.protocol);
  if (!supported) return;

  let reloadRequested = false;

  /** Bandeau non bloquant : l'utilisateur choisit quand recharger. */
  function showUpdateBanner(worker) {
    if (document.getElementById('update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `
      <span>Nouvelle version disponible. Les fichiers chargés devront être redéposés après le rechargement.</span>
      <span class="update-banner__actions">
        <button type="button" class="btn btn--primary" data-action="reload">Recharger</button>
        <button type="button" class="btn" data-action="later">Plus tard</button>
      </span>`;
    banner.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'reload') {
        reloadRequested = true;
        worker.postMessage('SKIP_WAITING');
      }
      banner.remove();
    });
    document.body.appendChild(banner);
  }

  // Recharge uniquement quand l'utilisateur l'a demandé (pas lors de la 1re installation).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker);
          });
        });

        // Vérifie les mises à jour quand l'app revient au premier plan (utile une fois installée).
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        });
      })
      .catch((err) => console.warn('[SuiviPhysique] Service worker non enregistré :', err));
  });
})();
