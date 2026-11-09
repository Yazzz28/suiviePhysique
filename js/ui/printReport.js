/**
 * Rapport imprimable / PDF.
 *
 * Le rapport EST le tableau de bord, mis en page pour l'impression : toute
 * nouvelle section ou nouveau graphique y figure automatiquement, sans
 * maintenance séparée. Le mode impression :
 * - ajoute la classe `is-printing` (mise en page A4, contrôles masqués : voir css/print.css) ;
 * - force le thème clair et redessine les graphiques à la largeur de la page,
 *   sans animation et en haute résolution ;
 * - remplit la page de garde (période, réglages, sommaire généré depuis les sections).
 * Fonctionne avec le bouton « Rapport PDF » et avec Ctrl+P.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDate, escapeHtml } = SP.core.utils;
  const root = document.documentElement;

  let printing = false;
  let savedTheme;

  function fillCover() {
    const cover = document.getElementById('report-cover');
    if (!cover) return;
    const st = SP.core.state.get();
    const v = SP.core.state.view();
    const dates = [...v.composition, ...v.measurements].map((r) => r.date.getTime());
    if (v.lifestyleRange) dates.push(v.lifestyleRange.from.getTime(), v.lifestyleRange.to.getTime());
    const exportDays = v.lifestyleRange ? Math.round((v.lifestyleRange.to - v.lifestyleRange.from) / 86400000) : 0;
    const period = dates.length
      ? `du ${fmtDate(new Date(Math.min(...dates)), 'long')} au ${fmtDate(new Date(Math.max(...dates)), 'long')}`
      : '—';
    const periodLabel = SP.core.state.PERIODS[st.period].label;

    // Sommaire : sections visibles, dans l'ordre de la page
    const sections = [...document.querySelectorAll('#dashboard .section:not(.hidden) h2')].map((h) => h.textContent.trim());

    const s = st.settings;
    const settings = [
      `Taille : ${fmt(s.heightCm, 1)} cm`,
      `Objectif : ${s.targetWeight ? fmt(s.targetWeight, 1) + ' kg' : 'non défini'}`,
      `Formules : ${s.sex === 'female' ? 'femme' : 'homme'}`,
      `Mensurations douteuses : ${s.excludeOutliers ? 'exclues' : 'incluses'}`,
    ];

    cover.innerHTML = `
      <h1>Suivi Physique : rapport</h1>
      <p class="report-cover__meta">Généré le ${fmtDate(new Date(), 'long')} · données ${period} (filtre « ${escapeHtml(periodLabel)} »)</p>
      <p class="report-cover__meta">${v.composition.length} pesées${v.compositionSource === 'export' ? ' (export santé)' : ''} · ${v.measurements.length} relevés de mensurations${
        exportDays ? ` · ${exportDays} jours de données santé (nutrition, activité, sommeil, stress, cœur)` : ''
      } · ${settings.map(escapeHtml).join(' · ')}</p>
      <h2>Sommaire</h2>
      <ol class="report-cover__toc">${sections.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ol>
      <p class="report-cover__note">Données traitées localement dans le navigateur. Composition corporelle mesurée par impédancemétrie,
        dépense énergétique estimée par la montre, corrélations et projections : à interpréter comme des tendances, pas comme des mesures exactes.</p>`;
  }

  /** Passe en mode impression (idempotent). */
  function enter() {
    if (printing || document.getElementById('dashboard').classList.contains('hidden')) return;
    printing = true;
    SP.silhouette.view.stop();
    savedTheme = root.dataset.theme;
    root.dataset.theme = 'light';
    root.classList.add('is-printing');
    SP.charts.theme.setPrintMode(true);
    SP.app.renderAll();
    fillCover(); // après le rendu : le sommaire reflète les sections réellement visibles
  }

  /** Revient à l'affichage normal (idempotent). */
  function exit() {
    if (!printing) return;
    printing = false;
    root.classList.remove('is-printing');
    if (savedTheme === undefined) delete root.dataset.theme;
    else root.dataset.theme = savedTheme;
    SP.charts.theme.setPrintMode(false);
    SP.app.renderAll();
  }

  function bind(button) {
    window.addEventListener('beforeprint', enter);
    window.addEventListener('afterprint', exit);
    if (button) {
      button.addEventListener('click', () => {
        enter();
        // Laisse le navigateur appliquer la mise en page avant d'ouvrir l'impression
        requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
      });
    }
  }

  SP.ui.printReport = { bind, enter, exit };
})(window.SP);
