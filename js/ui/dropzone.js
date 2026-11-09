/**
 * Zone de dépôt unique : fichiers CSV et/ou dossier complet (export
 * Samsung Health), par glisser-déposer ou sélecteur. Le type de chaque
 * fichier est reconnu ensuite par son contenu.
 */
(function (SP) {
  'use strict';

  const { escapeHtml, fmt } = SP.core.utils;

  const TYPE_LABELS = { composition: 'Pesées / composition', measurements: 'Mensurations' };

  // Sous-dossiers de l'export Samsung Health sans données exploitées (détails binaires / JSON) :
  // inutile de parcourir leurs dizaines de milliers de fichiers.
  const SKIPPED_DIRS = new Set(['jsons', 'files']);

  /** Liste les fichiers d'une entrée glissée (fichier ou dossier, récursif). */
  function collectEntry(entry, out) {
    if (entry.isFile) {
      return new Promise((resolve) => entry.file((f) => resolve(out.push(f)), () => resolve()));
    }
    if (!entry.isDirectory || SKIPPED_DIRS.has(entry.name)) return Promise.resolve();
    const reader = entry.createReader();
    return new Promise((resolve) => {
      const children = [];
      // readEntries renvoie les entrées par paquets : on lit jusqu'à épuisement
      const readBatch = () =>
        reader.readEntries(
          (batch) => {
            if (!batch.length) {
              Promise.all(children.map((c) => collectEntry(c, out))).then(resolve);
              return;
            }
            children.push(...batch);
            readBatch();
          },
          () => resolve()
        );
      readBatch();
    });
  }

  async function filesFromDrop(dataTransfer) {
    const items = [...(dataTransfer.items || [])];
    const entries = items.map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);
    if (!entries.length) return [...(dataTransfer.files || [])];
    const out = [];
    await Promise.all(entries.map((e) => collectEntry(e, out)));
    return out;
  }

  /** Fichiers d'un dossier choisi : on écarte d'emblée les sous-dossiers ignorés. */
  function filesFromFolderInput(input) {
    return [...input.files].filter((f) => {
      const parts = (f.webkitRelativePath || '').split('/').slice(1, -1);
      return !parts.some((p) => SKIPPED_DIRS.has(p));
    });
  }

  /**
   * @param {{zone: HTMLElement, input: HTMLInputElement, folderInput?: HTMLInputElement,
   *          folderButton?: HTMLElement, onFiles: (files: File[]) => void}} opts
   */
  function bind({ zone, input, folderInput, folderButton, onFiles }) {
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
    zone.addEventListener('drop', async (e) => {
      if (!e.dataTransfer) return;
      const files = await filesFromDrop(e.dataTransfer);
      if (files.length) onFiles(files);
    });
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.value = ''; // permet de re-sélectionner les mêmes fichiers
      if (files.length) onFiles(files);
    });
    if (folderInput && folderButton) {
      folderButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        folderInput.click();
      });
      folderInput.addEventListener('change', () => {
        const files = filesFromFolderInput(folderInput);
        folderInput.value = '';
        if (files.length) onFiles(files);
      });
    }

    // Empêche le navigateur d'ouvrir un fichier lâché à côté de la zone
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  function statusItem(ok, name, detail) {
    return `<div class="file-status__item ${ok ? 'is-ok' : 'is-error'}">
      <span class="file-status__dot" aria-hidden="true"></span>
      <span class="file-status__name">${escapeHtml(name)}</span>
      <span class="${ok ? 'secondary' : ''}">${ok ? '✓ ' : '✕ '}${detail}</span>
    </div>`;
  }

  /**
   * @param {HTMLElement} host
   * @param {object[]} files  fichiers de pesées / mensurations
   * @param {object|null} exportInfo  { tables, ignored } de l'export santé
   */
  function renderStatus(host, files, exportInfo = null) {
    let html = files
      .map((f) => statusItem(!f.error, f.name, f.error ? escapeHtml(f.error) : `${TYPE_LABELS[f.type]} · ${f.count} relevés`))
      .join('');
    if (exportInfo && exportInfo.tables.length) {
      const ok = exportInfo.tables.filter((t) => !t.error);
      const total = ok.reduce((s, t) => s + t.count, 0);
      html += statusItem(
        true,
        'Export santé (Samsung Health)',
        `${ok.length} tables lues · ${fmt(total, 0)} relevés${exportInfo.ignored ? ` · ${fmt(exportInfo.ignored, 0)} fichiers sans intérêt ignorés` : ''}`
      );
      exportInfo.tables
        .filter((t) => t.error)
        .forEach((t) => {
          html += statusItem(false, t.name, escapeHtml(t.error));
        });
      html += `<details class="file-status__details"><summary>Détail des tables lues</summary><ul>${ok
        .map((t) => `<li>${escapeHtml(t.label)} : ${fmt(t.count, 0)}</li>`)
        .join('')}</ul></details>`;
    }
    host.innerHTML = html;
  }

  /** Progression de lecture de l'export. */
  function renderProgress(host, done, total, label) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    host.innerHTML = `<p class="muted">Lecture de l'export santé : ${escapeHtml(label || '…')} (${done}/${total})</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>`;
  }

  SP.ui.dropzone = { bind, renderStatus, renderProgress };
})(window.SP);
