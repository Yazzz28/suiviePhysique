/**
 * Graphiques de la section Mensurations.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, withAlpha, isFiniteNumber, escapeHtml } = SP.core.utils;
  const { CM_ZONES, ZONES } = SP.parsers.measurements;
  const theme = SP.charts.theme;
  const { lineChart } = SP.charts.composition;

  const GROUPS = {
    torso: { label: 'Tronc', keys: ['chest', 'waist', 'abdomen', 'hip'] },
    upper: { label: 'Haut du corps', keys: ['neck', 'shoulder', 'bicepsL', 'bicepsR'] },
    legs: { label: 'Jambes', keys: ['thighL', 'thighR', 'calfL', 'calfR'] },
  };

  let activeGroup = 'torso';

  const zoneLabel = (key) => (ZONES.find((z) => z.key === key) || { label: key }).label;

  /** Une petite carte + mini-graphe par zone. */
  function renderMultiples({ measurements }) {
    const host = document.getElementById('meas-multiples');
    if (!host) return;
    const t = theme.tokens();
    const a = measurements[0];
    const b = measurements[measurements.length - 1];

    host.innerHTML = CM_ZONES.map((z) => {
      const d = a && b && isFiniteNumber(b[z.key]) && isFiniteNumber(a[z.key]) ? b[z.key] - a[z.key] : null;
      const cls = d === null || Math.abs(d) < 0.05 ? 'delta--flat' : d < 0 ? 'delta--good' : 'delta--bad';
      return `
        <div class="card multiple">
          <div class="multiple__head">
            <span class="multiple__name">${escapeHtml(z.label)}</span>
            <span class="delta ${cls}">${d === null ? '' : (d < 0 ? '▼ ' : d > 0 ? '▲ ' : '') + fmtDelta(d, 1) + ' cm'}</span>
          </div>
          <div class="multiple__value">${b ? fmt(b[z.key], 1) : '—'} <span class="kpi__unit">cm</span></div>
          <div class="chart-box chart-box--mini"><canvas id="c-mm-${z.key}" aria-label="Évolution ${escapeHtml(z.label)}"></canvas></div>
        </div>`;
    }).join('');

    CM_ZONES.forEach((z) => {
      const rows = measurements.filter((m) => isFiniteNumber(m[z.key]));
      if (!rows.length) return;
      const values = rows.map((r) => r[z.key]);
      const pad = Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.25);
      theme.create(`c-mm-${z.key}`, {
        type: 'line',
        data: {
          datasets: [
            {
              label: z.label,
              data: rows.map((r) => ({ x: r.date.getTime(), y: r[z.key] })),
              borderColor: t.series[0],
              backgroundColor: withAlpha(t.series[0], 0.1),
              fill: 'start',
              pointRadius: 2.5,
            },
          ],
        },
        options: {
          parsing: false,
          animation: false,
          scales: {
            x: { type: 'linear', display: false, min: rows[0].date.getTime(), max: rows[rows.length - 1].date.getTime() },
            y: { display: false, min: Math.min(...values) - pad, max: Math.max(...values) + pad },
          },
          plugins: { tooltip: theme.timeTooltip('cm', 1) },
          layout: { padding: { top: 4, bottom: 2, left: 3, right: 3 } },
        },
      });
    });
  }

  /** Graphe groupé (≤ 4 séries) avec sélecteur de groupe. */
  function renderGroup({ measurements }) {
    const t = theme.tokens();
    const group = GROUPS[activeGroup];
    lineChart(
      'c-meas-group',
      measurements,
      group.keys.map((k, i) => ({ key: k, label: zoneLabel(k), color: t.series[i] })),
      { unit: 'cm', decimals: 1, legendId: 'lg-meas-group' }
    );
    document.querySelectorAll('#meas-group-switch button').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.group === activeGroup));
    });
  }

  function bindGroupSwitch(getCtx) {
    const host = document.getElementById('meas-group-switch');
    if (!host || host.dataset.bound) return;
    host.dataset.bound = '1';
    host.innerHTML = Object.entries(GROUPS)
      .map(([k, g]) => `<button type="button" data-group="${k}" aria-pressed="${k === activeGroup}">${g.label}</button>`)
      .join('');
    host.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-group]');
      if (!btn) return;
      activeGroup = btn.dataset.group;
      renderGroup(getCtx());
    });
  }

  /** Radar départ vs actuel. */
  function renderRadar({ measurements }) {
    if (measurements.length < 1) return;
    const t = theme.tokens();
    const a = measurements[0];
    const b = measurements[measurements.length - 1];
    const keys = CM_ZONES.map((z) => z.key);
    const ds = (rec, label, color, fillAlpha) => ({
      label,
      data: keys.map((k) => rec[k]),
      borderColor: color,
      backgroundColor: withAlpha(color, fillAlpha),
      pointBackgroundColor: color,
      pointRadius: 2.5,
      borderWidth: 2,
    });
    theme.create('c-meas-radar', {
      type: 'radar',
      data: {
        labels: CM_ZONES.map((z) => z.label),
        datasets: [
          ds(a, `Départ (${fmtDate(a.date)})`, t.series[1], 0.06),
          ds(b, `Actuel (${fmtDate(b.date)})`, t.series[0], 0.16),
        ],
      },
      options: {
        // « monotone » (défaut global) n'est pas compatible avec un axe radial
        elements: { line: { cubicInterpolationMode: 'default', tension: 0 } },
        scales: {
          r: {
            grid: { color: t.grid },
            angleLines: { color: t.grid },
            pointLabels: { color: t.textSecondary, font: { size: 10 } },
            ticks: { display: false },
            beginAtZero: false,
            suggestedMin: 20,
          },
        },
        plugins: {
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label} : ${fmt(ctx.parsed.r, 1)} cm` } },
        },
      },
    });
    theme.setLegend('lg-meas-radar', [
      { label: `Départ (${fmtDate(a.date)})`, color: t.series[1] },
      { label: `Actuel (${fmtDate(b.date)})`, color: t.series[0] },
    ]);
  }

  /** Barres divergentes : variation par zone, triées. */
  function renderDeltaBars({ measurements }) {
    if (measurements.length < 2) return;
    const t = theme.tokens();
    const a = measurements[0];
    const b = measurements[measurements.length - 1];
    const rows = CM_ZONES.map((z) => ({ label: z.label, d: b[z.key] - a[z.key], from: a[z.key], to: b[z.key] }))
      .filter((r) => isFiniteNumber(r.d))
      .sort((x, y) => x.d - y.d);
    theme.create('c-meas-delta', {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.label),
        datasets: [
          {
            label: 'Variation',
            data: rows.map((r) => r.d),
            backgroundColor: rows.map((r) => (r.d <= 0 ? t.down : t.up)),
            barThickness: 14,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: theme.valueScale({ ticks: { callback: (v) => fmtDelta(v, 0) + ' cm' } }),
          y: { grid: { display: false }, border: { display: false } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const r = rows[ctx.dataIndex];
                return ` ${fmt(r.from, 1)} → ${fmt(r.to, 1)} cm (${fmtDelta(r.d, 1)} cm)`;
              },
            },
          },
        },
      },
    });
  }

  /** Asymétries gauche - droite. */
  function renderAsymmetry({ measurements }) {
    const t = theme.tokens();
    const pairs = SP.analysis.metrics.SIDE_PAIRS;
    const chart = lineChart(
      'c-asym',
      measurements,
      pairs.map((p, i) => ({ key: p.key, label: p.label, color: t.series[i] })),
      { unit: 'cm', decimals: 1, legendId: 'lg-asym' }
    );
    if (chart) {
      chart.options.scales.y.ticks.callback = (v, _i, ticks) => fmtDelta(v, theme.tickDecimals(ticks)) + ' cm';
      chart.options.plugins.tooltip.callbacks.label = (ctx) =>
        ` ${ctx.dataset.label} : ${fmtDelta(ctx.parsed.y, 1)} cm (${ctx.parsed.y > 0 ? 'gauche' : ctx.parsed.y < 0 ? 'droite' : 'égal'} plus gros)`;
      chart.update('none');
    }
  }

  /** Somme de toutes les circonférences. */
  function renderTotal({ measurements }) {
    const rows = measurements.map((m) => ({
      date: m.date,
      total: CM_ZONES.reduce((s, z) => s + (isFiniteNumber(m[z.key]) ? m[z.key] : 0), 0),
    }));
    lineChart('c-meas-total', rows, [{ key: 'total', label: 'Total des tours', entity: 'weight' }], {
      unit: 'cm',
      decimals: 1,
    });
  }

  function renderRatios({ measurements, daily }) {
    const t = theme.tokens();
    lineChart('c-whtr', measurements, [{ key: 'whtr', label: 'Taille / hauteur', color: t.series[0] }], {
      decimals: 3,
      yExtra: { suggestedMin: 0.45 },
      bands: [
        { from: 0, to: 0.5, color: withAlpha(t.good, 0.1), label: 'Sain < 0,50' },
        { from: 0.5, to: 0.6, color: withAlpha(t.warning, 0.12), label: 'Risque accru' },
        { from: 0.6, to: 2, color: withAlpha(t.critical, 0.1), label: 'Risque élevé' },
      ],
    });
    lineChart(
      'c-whr',
      measurements,
      [
        { key: 'whr', label: 'RTH (balance)', color: t.series[0] },
        { key: 'whrCalc', label: 'Taille / hanches (calculé)', color: t.series[1] },
      ],
      { decimals: 2, legendId: 'lg-whr' }
    );
    lineChart(
      'c-shape',
      measurements,
      [
        { key: 'shoulderWaist', label: 'Épaules / taille', color: t.series[0] },
        { key: 'chestWaist', label: 'Poitrine / taille', color: t.series[1] },
      ],
      { decimals: 2, legendId: 'lg-shape' }
    );

    // Navy vs balance : même unité (%), un seul axe.
    const rows = [
      ...measurements.filter((m) => isFiniteNumber(m.navyFat)).map((m) => ({ date: m.date, navyFat: m.navyFat })),
      ...daily.filter((d) => isFiniteNumber(d.fatPct)).map((d) => ({ date: d.date, fatPct: d.fatPct })),
    ].sort((x, y) => x.date - y.date);
    lineChart(
      'c-navy',
      rows,
      [
        { key: 'fatPct', label: 'Balance (impédancemètre)', color: t.series[1] },
        { key: 'navyFat', label: 'Formule US Navy (mètre ruban)', color: t.series[6] },
      ],
      { unit: '%', decimals: 1, legendId: 'lg-navy' }
    );
  }

  let ctxRef = null;

  function render(ctx) {
    ctxRef = ctx;
    if (!ctx.measurements.length) return;
    bindGroupSwitch(() => ctxRef);
    renderMultiples(ctx);
    renderGroup(ctx);
    renderRadar(ctx);
    renderDeltaBars(ctx);
    renderAsymmetry(ctx);
    renderTotal(ctx);
    renderRatios(ctx);
  }

  SP.charts.measurements = { render };
})(window.SP);
