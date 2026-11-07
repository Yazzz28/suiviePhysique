/**
 * Enregistrement du service worker (installation PWA, sans cache).
 * Ignoré en file:// où les service workers ne sont pas disponibles.
 */
(function () {
  'use strict';

  const supported = 'serviceWorker' in navigator && /^https?:$/.test(window.location.protocol);
  if (!supported) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('[SuiviPhysique] Service worker non enregistré :', err);
    });
  });
})();
