/**
 * Modèles CSV vides à télécharger, générés à la volée dans le navigateur
 * (aucun fichier stocké). En-têtes issus des parsers : source unique de vérité.
 *
 * Choix de format : séparateur « ; » et BOM UTF-8 pour qu'Excel (FR) ouvre
 * directement le fichier en colonnes avec les accents corrects.
 */
(function (SP) {
  'use strict';

  const SEPARATOR = ';';
  const BOM = '﻿';

  const TEMPLATES = {
    composition: {
      filename: 'modele-pesees.csv',
      header: () => SP.parsers.composition.TEMPLATE_HEADER,
    },
    measurements: {
      filename: 'modele-mensurations.csv',
      header: () => SP.parsers.measurements.TEMPLATE_HEADER,
    },
  };

  function toCsv(header) {
    const escape = (cell) => (/[;"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
    return BOM + header.map(escape).join(SEPARATOR) + '\r\n';
  }

  function download(type) {
    const tpl = TEMPLATES[type];
    if (!tpl) return;
    const blob = new Blob([toCsv(tpl.header())], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = tpl.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bind(container) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-template]');
      if (btn) download(btn.dataset.template);
    });
  }

  SP.ui.templates = { bind, download, toCsv };
})(window.SP);
