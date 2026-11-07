/**
 * Filtre de période (contrôle segmenté) — pilote tous les graphiques.
 */
(function (SP) {
  'use strict';

  const state = SP.core.state;

  function render(host) {
    const current = state.get().period;
    host.innerHTML = Object.entries(state.PERIODS)
      .map(([k, p]) => `<button type="button" data-period="${k}" aria-pressed="${k === current}">${p.label}</button>`)
      .join('');
  }

  function bind(host) {
    render(host);
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-period]');
      if (!btn) return;
      state.setPeriod(btn.dataset.period);
      render(host);
    });
  }

  SP.ui.dateFilter = { bind, render };
})(window.SP);
