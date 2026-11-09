/**
 * Réception des fichiers partagés depuis Android (Mes fichiers › Partager ›
 * Suivi Physique), une fois l'app installée.
 *
 * Le service worker reçoit le partage (POST share-target), garde les fichiers
 * en mémoire quelques instants et redirige vers « ./?partage=1 ». La page les
 * lui demande ici puis les traite comme un import normal. Rien n'est écrit
 * sur le disque ni dans le cache.
 */
(function (SP) {
  'use strict';

  const PARAM = 'partage';
  const TIMEOUT_MS = 8000;

  /**
   * @param {(files: File[]) => void} onFiles
   * @param {(message: string) => void} onError
   */
  function init(onFiles, onError) {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM)) return;
    // L'adresse redevient propre : un rechargement ne redemande pas le partage
    url.searchParams.delete(PARAM);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);

    if (!('serviceWorker' in navigator)) {
      onError('Partage non disponible dans ce navigateur.');
      return;
    }

    const timer = setTimeout(
      () => onError("Les fichiers partagés n'ont pas été reçus. Recommence le partage, ou utilise « Importer un dossier »."),
      TIMEOUT_MS
    );

    navigator.serviceWorker.addEventListener('message', function listener(event) {
      if (!event.data || event.data.type !== 'SHARED_FILES') return;
      navigator.serviceWorker.removeEventListener('message', listener);
      clearTimeout(timer);
      const files = event.data.files || [];
      if (files.length) onFiles(files);
      else onError("Aucun fichier reçu. Recommence le partage, ou utilise « Importer un dossier ».");
    });

    navigator.serviceWorker.ready.then((registration) => {
      const worker = navigator.serviceWorker.controller || registration.active;
      if (worker) worker.postMessage({ type: 'GET_SHARED_FILES' });
    });
  }

  SP.ui.shareReceiver = { init, PARAM };
})(window.SP);
