/**
 * Deux vues du tableau de bord, comme deux pages :
 * - « Essentiel » (par défaut) : seules les cartes marquées `data-essential` ;
 * - « Toutes les analyses » : tout (adresse #analyses, le bouton retour ramène à l'Essentiel).
 *
 * Une seule page HTML : les données n'étant jamais enregistrées, changer de
 * fichier obligerait à les réimporter. Le rapport PDF imprime toujours tout.
 */
(function (SP) {
  'use strict';

  const root = document.documentElement;
  const HASH_FULL = '#analyses';
  let view = 'essential';

  function fromHash() {
    const h = window.location.hash;
    if (h === HASH_FULL) return 'full';
    if (!h || h === '#' || h === '#essentiel') return 'essential';
    return null; // ancre de section (#section-…) : on garde la vue courante
  }

  /** Sections et liens de navigation sans carte visible : masqués en vue Essentiel. */
  function apply() {
    const essential = view === 'essential' && !root.classList.contains('is-printing');
    document.querySelectorAll('#dashboard .section').forEach((section) => {
      const visible = !essential || !!section.querySelector('[data-essential]:not(.hidden)');
      section.classList.toggle('view-hidden', !visible);
      const link = document.querySelector(`.app-nav__link[href="#${section.id}"]`);
      if (link) link.classList.toggle('view-hidden', !visible);
    });
    document.querySelectorAll('[data-view]').forEach((btn) => {
      if (btn.closest('.view-switch')) btn.setAttribute('aria-pressed', String(btn.dataset.view === view));
    });
  }

  /**
   * @param {'essential'|'full'} next
   * @param {{render?: boolean}} opts  render : redessiner (les graphiques masqués n'ont pas de taille)
   */
  function set(next, { render = true } = {}) {
    view = next === 'full' ? 'full' : 'essential';
    root.classList.toggle('view-essential', view === 'essential');
    if (render && SP.app && SP.core.state.hasData()) SP.app.renderAll();
    else apply();
  }

  function go(next) {
    if (next === view) return;
    if (next === 'full') {
      window.location.hash = HASH_FULL; // entrée d'historique : le retour ramène à l'Essentiel
    } else if (window.location.hash === HASH_FULL) {
      window.history.pushState(null, '', window.location.pathname + window.location.search);
      set('essential');
    } else {
      set('essential');
    }
    window.scrollTo({ top: 0 });
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      e.preventDefault();
      go(btn.dataset.view);
    });
    window.addEventListener('hashchange', () => {
      const next = fromHash();
      if (next && next !== view) set(next);
    });
    window.addEventListener('popstate', () => {
      const next = fromHash();
      if (next && next !== view) set(next);
    });
    set(fromHash() || 'essential', { render: false });
  }

  SP.ui.viewSwitch = { bind, set, apply, current: () => view };
})(window.SP);
