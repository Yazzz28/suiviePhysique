/**
 * Cartes KPI du résumé : valeur actuelle, variation sur la période, contexte.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, first, last, isFiniteNumber } = SP.core.utils;
  const { trends } = SP.analysis;

  /**
   * better : 'down' = une baisse est positive, 'up' = une hausse est positive.
   */
  const DEFS = [
    { key: 'weight', label: 'Poids', unit: 'kg', decimals: 1, better: 'down', src: 'composition' },
    { key: 'fatKg', label: 'Masse grasse', unit: 'kg', decimals: 1, better: 'down', src: 'composition' },
    { key: 'fatPct', label: 'Graisse corporelle', unit: '%', decimals: 1, better: 'down', src: 'composition' },
    { key: 'muscleKg', label: 'Masse musculaire', unit: 'kg', decimals: 1, better: 'up', src: 'composition' },
    { key: 'leanKg', label: 'Masse maigre', unit: 'kg', decimals: 1, better: 'up', src: 'composition' },
    { key: 'bmi', label: 'IMC', unit: '', decimals: 1, better: 'down', src: 'composition' },
    { key: 'visceral', label: 'Graisse viscérale', unit: '', decimals: 0, better: 'down', src: 'composition' },
    { key: 'bmr', label: 'Métabolisme de base', unit: 'kcal', decimals: 0, better: null, src: 'composition' },
    { key: 'waist', label: 'Tour de taille', unit: 'cm', decimals: 1, better: 'down', src: 'measurements' },
    { key: 'abdomen', label: "Tour d'abdomen", unit: 'cm', decimals: 1, better: 'down', src: 'measurements' },
    { key: 'hip', label: 'Tour de hanches', unit: 'cm', decimals: 1, better: 'down', src: 'measurements' },
    { key: 'whtr', label: 'Taille / hauteur', unit: '', decimals: 2, better: 'down', src: 'measurements' },
  ];

  function deltaClass(d, better) {
    if (!isFiniteNumber(d) || Math.abs(d) < 1e-9 || !better) return 'delta--flat';
    const good = better === 'down' ? d < 0 : d > 0;
    return good ? 'delta--good' : 'delta--bad';
  }

  function card({ label, value, unit, decimals, delta, deltaUnit, better, meta }) {
    const cls = deltaClass(delta, better);
    const arrow = !isFiniteNumber(delta) || Math.abs(delta) < 1e-9 ? '' : delta < 0 ? '▼' : '▲';
    return `<div class="card kpi">
      <span class="kpi__label">${label}</span>
      <span class="kpi__value">${fmt(value, decimals)}<span class="kpi__unit">${unit}</span></span>
      ${
        isFiniteNumber(delta)
          ? `<span class="delta ${cls}">${arrow} ${fmtDelta(delta, decimals)}${deltaUnit !== undefined ? deltaUnit : unit ? ' ' + unit : ''}</span>`
          : ''
      }
      ${meta ? `<span class="kpi__meta">${meta}</span>` : ''}
    </div>`;
  }

  function render(host, { composition, daily, measurements, settings }) {
    const html = [];
    DEFS.forEach((def) => {
      const list = def.src === 'composition' ? composition : measurements;
      const a = first(list, def.key);
      const b = last(list, def.key);
      if (!b) return;
      html.push(
        card({
          ...def,
          value: b[def.key],
          delta: a && a !== b ? b[def.key] - a[def.key] : null,
          meta: a && a !== b ? `depuis le ${fmtDate(a.date)} (${fmt(a[def.key], def.decimals)})` : fmtDate(b.date),
        })
      );
    });

    // Rythme récent
    const recent = trends.recentTrend(daily, 'weight', 14);
    if (recent) {
      html.push(
        card({
          label: 'Rythme (14 j)',
          value: recent.slopePerWeek,
          unit: 'kg/sem',
          decimals: 2,
          meta: `R² ${fmt(recent.r2, 2)} — tendance linéaire`,
        })
      );
    }

    // Objectif
    if (isFiniteNumber(settings.targetWeight)) {
      const tr = trends.trend(daily, 'weight');
      const lw = last(composition, 'weight');
      const proj = tr && lw ? trends.projectTarget(tr, lw.date, settings.targetWeight) : null;
      html.push(
        `<div class="card kpi"><span class="kpi__label">Objectif ${fmt(settings.targetWeight, 1)} kg</span>
          <span class="kpi__value">${lw ? fmt(lw.weight - settings.targetWeight, 1) : '—'}<span class="kpi__unit">kg restants</span></span>
          <span class="kpi__meta">${proj ? 'Projection : ' + fmtDate(proj.date, 'long') : 'Pas de projection possible'}</span></div>`
      );
    }

    // Assiduité
    const adh = trends.adherence(daily);
    if (adh) {
      html.push(
        `<div class="card kpi"><span class="kpi__label">Pesées</span>
          <span class="kpi__value">${adh.days}<span class="kpi__unit">/ ${adh.span} j</span></span>
          <span class="kpi__meta">${Math.round(adh.rate * 100)} % d'assiduité · série max ${adh.bestStreak} j</span></div>`
      );
    }

    host.innerHTML = html.join('');
  }

  SP.ui.kpiCards = { render };
})(window.SP);
