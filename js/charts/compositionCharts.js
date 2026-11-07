/**
 * Graphiques de la section Composition corporelle.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, withAlpha, isFiniteNumber } = SP.core.utils;
  const theme = SP.charts.theme;

  /**
   * Courbe temporelle générique.
   * series : [{ key, label, entity? , color? }]
   */
  function lineChart(canvasId, records, series, { unit = '', decimals = 1, legendId, bands, yExtra = {}, stepped } = {}) {
    const t = theme.tokens();
    const rows = records.filter((r) => series.some((s) => isFiniteNumber(r[s.key])));
    if (!rows.length) return null;
    const datasets = series.map((s) => {
      const color = s.color || theme.colorFor(s.entity || s.key, t);
      return {
        label: s.label,
        data: rows.filter((r) => isFiniteNumber(r[s.key])).map((r) => ({ x: r.date.getTime(), y: r[s.key] })),
        borderColor: color,
        backgroundColor: color,
        stepped: stepped ? 'middle' : false,
        pointRadius: rows.length < 15 ? 3 : 0,
      };
    });
    if (legendId) theme.setLegend(legendId, series.map((s, i) => ({ label: s.label, color: datasets[i].borderColor })));
    return theme.create(canvasId, {
      type: 'line',
      data: { datasets },
      options: {
        parsing: false,
        scales: {
          x: theme.timeScale(rows[0].date.getTime(), rows[rows.length - 1].date.getTime()),
          y: theme.valueScale({
            ...yExtra,
            ticks: { maxTicksLimit: 6, callback: (v, _i, ticks) => fmt(v, theme.tickDecimals(ticks)) + (unit ? ' ' + unit : '') },
          }),
        },
        plugins: { tooltip: theme.timeTooltip(unit, decimals), spBands: bands ? { bands } : undefined },
      },
    });
  }

  /** Variation cumulée (kg) de chaque compartiment depuis la 1re pesée complète. */
  function renderDeltas({ daily }) {
    const full = daily.filter((r) => r.hasComposition);
    if (full.length < 2) return;
    const base = full[0];
    const keys = [
      { key: 'weight', label: 'Poids' },
      { key: 'fatKg', label: 'Masse grasse' },
      { key: 'muscleKg', label: 'Muscle' },
      { key: 'waterKg', label: 'Eau' },
    ];
    const rows = full.map((r) => {
      const o = { date: r.date };
      keys.forEach(({ key }) => (o['d_' + key] = r[key] - base[key]));
      return o;
    });
    const chart = lineChart(
      'c-comp-delta',
      rows,
      keys.map((k) => ({ key: 'd_' + k.key, label: k.label, entity: k.key })),
      { unit: 'kg', decimals: 2, legendId: 'lg-comp-delta' }
    );
    if (chart) {
      chart.options.scales.y.ticks.callback = (v, _i, ticks) => fmtDelta(v, theme.tickDecimals(ticks)) + ' kg';
      chart.options.plugins.tooltip.callbacks.label = (ctx) => ` ${ctx.dataset.label} : ${fmtDelta(ctx.parsed.y, 2)} kg`;
      chart.update('none');
    }
  }

  /** Barres empilées : graisse + muscle + os = poids. */
  function renderStack({ daily }) {
    const t = theme.tokens();
    const full = daily.filter((r) => r.hasComposition);
    if (!full.length) return;
    const parts = [
      { key: 'fatKg', label: 'Graisse' },
      { key: 'muscleKg', label: 'Muscle (eau incluse)' },
      { key: 'boneKg', label: 'Os' },
    ];
    theme.create('c-comp-stack', {
      type: 'bar',
      data: {
        labels: full.map((r) => fmtDate(r.date)),
        datasets: parts.map((p) => ({
          label: p.label,
          data: full.map((r) => r[p.key]),
          backgroundColor: theme.colorFor(p.key, t),
          borderColor: t.surface,
          borderWidth: { top: 2 },
          borderSkipped: false,
          borderRadius: 0,
          maxBarThickness: 22,
        })),
      },
      options: {
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 10 } },
          y: theme.valueScale({ stacked: true, ticks: { callback: (v) => v + ' kg' } }),
        },
        plugins: {
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              title: (items) => fmtDate(full[items[0].dataIndex].date, 'weekday'),
              label: (ctx) => ` ${ctx.dataset.label} : ${fmt(ctx.parsed.y, 2)} kg`,
              footer: (items) => `Total : ${fmt(full[items[0].dataIndex].weight, 2)} kg`,
            },
          },
        },
      },
    });
    theme.setLegend(
      'lg-comp-stack',
      parts.map((p) => ({ label: p.label, color: theme.colorFor(p.key, t), box: true }))
    );
  }

  /** Barres segmentées 100 % : répartition départ vs actuel. */
  function renderSplit({ daily }) {
    const t = theme.tokens();
    const full = daily.filter((r) => r.hasComposition);
    if (full.length < 1) return;
    const a = full[0];
    const b = full[full.length - 1];
    const parts = [
      { key: 'fatKg', label: 'Graisse' },
      { key: 'muscleKg', label: 'Muscle' },
      { key: 'boneKg', label: 'Os' },
    ];
    const pct = (r, k) => (r[k] / r.weight) * 100;
    theme.create('c-comp-split', {
      type: 'bar',
      data: {
        labels: [`Départ (${fmtDate(a.date)})`, `Actuel (${fmtDate(b.date)})`],
        datasets: parts.map((p) => ({
          label: p.label,
          data: [pct(a, p.key), pct(b, p.key)],
          backgroundColor: theme.colorFor(p.key, t),
          borderColor: t.surface,
          borderWidth: { right: 2 },
          borderSkipped: false,
          borderRadius: 0,
          barThickness: 34,
          _kg: [a[p.key], b[p.key]],
        })),
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: theme.valueScale({ stacked: true, min: 0, max: 100, ticks: { callback: (v) => v + ' %' } }),
          y: { stacked: true, grid: { display: false }, border: { display: false } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label} : ${fmt(ctx.parsed.x, 1)} % (${fmt(ctx.dataset._kg[ctx.dataIndex], 2)} kg)`,
            },
          },
        },
      },
      plugins: [
        {
          id: 'segLabels',
          afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            ctx.save();
            ctx.font = '600 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            chart.data.datasets.forEach((ds, di) => {
              chart.getDatasetMeta(di).data.forEach((bar, i) => {
                const w = Math.abs(bar.x - bar.base);
                if (w < 44) return;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(fmt(ds.data[i], 1) + ' %', bar.base + (bar.x - bar.base) / 2, bar.y);
              });
            });
            ctx.restore();
          },
        },
      ],
    });
    theme.setLegend(
      'lg-comp-split',
      parts.map((p) => ({ label: p.label, color: theme.colorFor(p.key, t), box: true }))
    );
  }

  function render(ctx) {
    const t = theme.tokens();
    const rows = ctx.daily.filter((r) => r.hasComposition);
    renderDeltas(ctx);
    renderStack(ctx);
    renderSplit(ctx);

    lineChart('c-fat-kg', rows, [{ key: 'fatKg', label: 'Masse grasse' }], { unit: 'kg', decimals: 2 });
    lineChart('c-fat-pct', rows, [{ key: 'fatPct', label: 'Graisse corporelle' }], { unit: '%', decimals: 1 });
    lineChart(
      'c-muscle',
      rows,
      [
        { key: 'muscleKg', label: 'Masse musculaire' },
        { key: 'skeletalKg', label: 'Muscle squelettique' },
      ],
      { unit: 'kg', decimals: 2, legendId: 'lg-muscle' }
    );
    lineChart('c-lean', rows, [{ key: 'leanKg', label: 'Masse maigre' }], { unit: 'kg', decimals: 2 });
    lineChart(
      'c-ffmi',
      rows,
      [
        { key: 'ffmi', label: 'FFMI', color: t.series[6] },
        { key: 'ffmiNorm', label: 'FFMI normalisé (1,80 m)', color: t.series[0] },
      ],
      { decimals: 2, legendId: 'lg-ffmi' }
    );
    const vis = rows.map((r) => r.visceral).filter(isFiniteNumber);
    lineChart('c-visceral', rows, [{ key: 'visceral', label: 'Graisse viscérale', color: t.series[1] }], {
      decimals: 0,
      stepped: true,
      yExtra: vis.length ? { min: Math.max(0, Math.min(...vis) - 3), max: Math.max(...vis) + 3 } : {},
      bands: [
        { from: 0, to: 9.5, color: withAlpha(t.good, 0.1), label: 'Normal' },
        { from: 9.5, to: 14.5, color: withAlpha(t.warning, 0.12), label: 'Élevé' },
        { from: 14.5, to: 60, color: withAlpha(t.critical, 0.1), label: 'Très élevé' },
      ],
    });
    lineChart('c-subcut', rows, [{ key: 'subcutPct', label: 'Gras sous-cutané', color: t.series[1] }], {
      unit: '%',
      decimals: 1,
    });
    lineChart('c-water', rows, [{ key: 'waterPct', label: 'Eau corporelle' }], { unit: '%', decimals: 1 });
    lineChart('c-protein', rows, [{ key: 'proteinPct', label: 'Protéines' }], { unit: '%', decimals: 1 });
    lineChart('c-bone', rows, [{ key: 'boneKg', label: 'Masse osseuse' }], { unit: 'kg', decimals: 2 });
    lineChart('c-bmr', rows, [{ key: 'bmr', label: 'Métabolisme de base', color: t.series[0] }], {
      unit: 'kcal',
      decimals: 0,
    });
    lineChart('c-meta-age', rows, [{ key: 'metaAge', label: 'Âge métabolique', color: t.series[0] }], {
      unit: 'ans',
      decimals: 0,
      stepped: true,
    });
  }

  SP.charts.composition = { render, lineChart };
})(window.SP);
