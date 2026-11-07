/**
 * Tooltip HTML léger pour les visuels non Chart.js (heatmap, silhouette).
 * Lit l'attribut data-tip de l'élément survolé.
 */
(function (SP) {
  'use strict';

  let el = null;

  function ensure() {
    if (!el) {
      el = document.createElement('div');
      el.className = 'viz-tooltip';
      el.setAttribute('role', 'tooltip');
      document.body.appendChild(el);
    }
    return el;
  }

  function show(text, x, y) {
    const tip = ensure();
    tip.textContent = text;
    tip.classList.add('is-visible');
    const rect = tip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - rect.width - 8, x + 14);
    const top = y + rect.height + 20 > window.innerHeight ? y - rect.height - 10 : y + 14;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${top}px`;
  }

  function hide() {
    if (el) el.classList.remove('is-visible');
  }

  /** Délégation d'événements : un seul listener par conteneur. */
  function bind(container, selector) {
    if (container.dataset.tipBound) return;
    container.dataset.tipBound = '1';
    container.addEventListener('pointermove', (e) => {
      const target = e.target.closest(selector);
      if (target && container.contains(target)) show(target.getAttribute('data-tip'), e.clientX, e.clientY);
      else hide();
    });
    container.addEventListener('pointerleave', hide);
  }

  SP.ui.tooltip = { show, hide, bind };
})(window.SP);
