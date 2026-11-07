/**
 * Zone de dépôt : drag & drop + sélecteur de fichiers, affichage du statut.
 */
(function (SP) {
  'use strict';

  const { escapeHtml } = SP.core.utils;

  const TYPE_LABELS = { composition: 'Pesées / composition', measurements: 'Mensurations' };

  function bind({ zone, input, onFiles }) {
    const stop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ['dragenter', 'dragover'].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        stop(e);
        zone.classList.add('is-over');
      })
    );
    ['dragleave', 'dragend', 'drop'].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        stop(e);
        zone.classList.remove('is-over');
      })
    );
    zone.addEventListener('drop', (e) => {
      const files = [...(e.dataTransfer ? e.dataTransfer.files : [])];
      if (files.length) onFiles(files);
    });
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.value = ''; // permet de re-sélectionner les mêmes fichiers
      if (files.length) onFiles(files);
    });

    // Empêche le navigateur d'ouvrir un fichier lâché à côté de la zone
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  function renderStatus(host, files) {
    host.innerHTML = files
      .map((f) => {
        const ok = !f.error;
        const detail = ok ? `${TYPE_LABELS[f.type]} · ${f.count} relevés` : escapeHtml(f.error);
        return `<div class="file-status__item ${ok ? 'is-ok' : 'is-error'}">
          <span class="file-status__dot" aria-hidden="true"></span>
          <span class="file-status__name">${escapeHtml(f.name)}</span>
          <span class="${ok ? 'secondary' : ''}">${ok ? '✓ ' : '✕ '}${detail}</span>
        </div>`;
      })
      .join('');
  }

  SP.ui.dropzone = { bind, renderStatus };
})(window.SP);
