/**
 * Export d'un SVG de silhouette en image PNG, généré dans le navigateur
 * (aucun envoi, rien n'est stocké : téléchargement direct).
 *
 * Les styles venant des feuilles CSS et des variables (thème clair/sombre)
 * n'existent pas dans une image isolée : on les recopie donc en attributs
 * avant la conversion.
 */
(function (SP) {
  'use strict';

  const STYLE_PROPS = [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'stroke-linejoin',
    'opacity',
    'font-size',
    'font-family',
    'font-weight',
    'text-anchor',
  ];

  /** Pixels par unité SVG (1 unité = 1 cm) : ~ 1 400 px de haut pour une personne. */
  const SCALE = 8;

  function inlineStyles(source, clone) {
    const srcNodes = [source, ...source.querySelectorAll('*')];
    const dstNodes = [clone, ...clone.querySelectorAll('*')];
    srcNodes.forEach((node, i) => {
      const cs = getComputedStyle(node);
      const style = STYLE_PROPS.map((prop) => `${prop}:${cs.getPropertyValue(prop)}`).join(';');
      dstNodes[i].setAttribute('style', style);
      dstNodes[i].removeAttribute('class');
      dstNodes[i].removeAttribute('data-tip');
    });
  }

  function toPng(svgEl, filename) {
    const box = svgEl.viewBox.baseVal;
    if (!box || !box.width) return;
    const clone = svgEl.cloneNode(true);
    inlineStyles(svgEl, clone);

    const width = Math.round(box.width * SCALE);
    const height = Math.round(box.height * SCALE);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', width);
    clone.setAttribute('height', height);

    // Fond opaque à la couleur de la carte (lisible hors de l'app)
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', box.x);
    bg.setAttribute('y', box.y);
    bg.setAttribute('width', box.width);
    bg.setAttribute('height', box.height);
    bg.setAttribute('fill', getComputedStyle(document.documentElement).getPropertyValue('--surface-1').trim() || '#ffffff');
    clone.insertBefore(bg, clone.firstChild);

    const svgUrl = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
    );
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      console.error('[SuiviPhysique] Export PNG impossible');
    };
    img.src = svgUrl;
  }

  /** Délégation : tout bouton [data-export="<id du svg>"] exporte ce SVG. */
  function bind(container) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-export]');
      if (!btn) return;
      const svg = document.getElementById(btn.dataset.export);
      if (svg) toPng(svg, btn.dataset.filename || 'silhouette.png');
    });
  }

  SP.silhouette.exportPng = { toPng, bind };
})(window.SP);
