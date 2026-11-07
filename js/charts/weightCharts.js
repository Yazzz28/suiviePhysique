/**
 * Graphiques de la section Poids.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, rollingMean, withAlpha, isFiniteNumber } = SP.core.utils;
  const { trends } = SP.analysis;
  const theme = SP.charts.theme;

  const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  /** Courbe principale : pesées, moyenne 7 j, tendance, projection, objectif. */
  function renderMain({ composition, daily, settings, projection }) {
    const t = theme.tokens();
    const pts = composition.filter((r) => isFiniteNumber(r.weight));
    if (!pts.length) return;

    const tr = trends.trend(daily, 'weight');
    const lastDate = pts[pts.length - 1].date;
    const firstMs = pts[0].date.getTime();
    let maxMs = lastDate.getTime();

    const datasets = [
      {
        label: 'Pesée',
        data: pts.map((r) => ({ x: r.date.getTime(), y: r.weight })),
        borderColor: 'transparent',
        backgroundColor: withAlpha(t.series[0], 0.55),
        pointRadius: 3.5,
        pointHoverRadius: 6,
        showLine: false,
        order: 2,
      },
      {
        label: 'Moyenne 7 j',
        data: rollingMean(daily, 'weight', 7),
        borderColor: t.series[0],
        borderWidth: 2.5,
        order: 1,
      },
    ];

    const legend = [
      { label: 'Pesée', color: withAlpha(t.series[0], 0.55), box: true },
      { label: 'Moyenne glissante 7 j', color: t.series[0] },
    ];

    if (tr) {
      datasets.push({
        label: 'Tendance',
        data: [
          { x: firstMs, y: tr.at(new Date(firstMs)) },
          { x: lastDate.getTime(), y: tr.at(lastDate) },
        ],
        borderColor: t.textSecondary,
        borderWidth: 1.5,
        tension: 0,
        order: 3,
      });
      legend.push({ label: `Tendance linéaire observée (${fmtDelta(tr.slopePerWeek, 2)} kg/sem.)`, color: t.textSecondary });
    }

    // Projection non linéaire : bilan énergétique à apport constant (voir analysis/projection.js)
    if (projection) {
      const target = projection.dateFor(settings.targetWeight);
      const horizon = target ? Math.min(365, Math.max(21, target.days * 1.15)) : 90;
      const curve = projection.curve(Math.ceil(horizon));
      maxMs = Math.max(maxMs, curve[curve.length - 1].x);
      datasets.push({
        label: 'Projection',
        data: curve,
        borderColor: t.textSecondary,
        borderWidth: 1.5,
        borderDash: [5, 4],
        tension: 0,
        order: 3,
      });
      legend.push({ label: 'Projection (bilan énergétique)', color: t.textSecondary, dashed: true });
    }

    if (isFiniteNumber(settings.targetWeight)) {
      datasets.push({
        label: 'Objectif',
        data: [
          { x: firstMs, y: settings.targetWeight },
          { x: maxMs, y: settings.targetWeight },
        ],
        borderColor: t.good,
        borderWidth: 1.5,
        borderDash: [2, 3],
        tension: 0,
        order: 4,
      });
      legend.push({ label: `Objectif ${fmt(settings.targetWeight, 1)} kg`, color: t.good, dashed: true });
    }

    theme.setLegend('lg-weight-main', legend);

    const zoom = window.ChartZoom || (window.Chart && window.Chart.registry.plugins.get('zoom'))
      ? {
          zoom: {
            wheel: { enabled: true, modifierKey: 'ctrl' },
            pinch: { enabled: true },
            drag: { enabled: true, backgroundColor: withAlpha(t.series[0], 0.12) },
            mode: 'x',
          },
          pan: { enabled: true, mode: 'x', modifierKey: 'shift' },
        }
      : undefined;

    const chart = theme.create('c-weight-main', {
      type: 'line',
      data: { datasets },
      options: {
        parsing: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: theme.timeScale(firstMs, maxMs),
          y: theme.valueScale({ ticks: { callback: (v) => fmt(v, 0) + ' kg', maxTicksLimit: 7 } }),
        },
        plugins: {
          tooltip: {
            mode: 'nearest',
            intersect: false,
            callbacks: {
              title: (items) => (items.length ? fmtDate(new Date(items[0].parsed.x), 'weekday') + ' ' + fmtDate(new Date(items[0].parsed.x), 'time') : ''),
              label: (ctx) => ` ${ctx.dataset.label} : ${fmt(ctx.parsed.y, 2)} kg`,
            },
          },
          zoom,
        },
      },
    });

    const reset = document.getElementById('btn-reset-zoom');
    if (reset && chart) reset.onclick = () => chart.resetZoom && chart.resetZoom();
  }

  /** Perte cumulée depuis la première pesée de la période. */
  function renderCumulative({ daily }) {
    const t = theme.tokens();
    const pts = daily.filter((d) => isFiniteNumber(d.weight));
    if (pts.length < 2) return;
    const base = pts[0].weight;
    const data = pts.map((d) => ({ x: d.date.getTime(), y: d.weight - base }));
    theme.create('c-weight-cumul', {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Variation cumulée',
            data,
            borderColor: t.series[0],
            backgroundColor: withAlpha(t.series[0], 0.12),
            fill: 'origin',
            pointRadius: 0,
          },
        ],
      },
      options: {
        parsing: false,
        scales: {
          x: theme.timeScale(data[0].x, data[data.length - 1].x),
          y: theme.valueScale({ ticks: { callback: (v) => fmtDelta(v, 0) + ' kg' } }),
        },
        plugins: {
          tooltip: {
            ...theme.timeTooltip('kg', 2),
            callbacks: {
              ...theme.timeTooltip().callbacks,
              label: (ctx) => ` Depuis le départ : ${fmtDelta(ctx.parsed.y, 2)} kg`,
            },
          },
        },
      },
    });
  }

  /** IMC avec zones OMS. */
  function renderBmi({ composition }) {
    const t = theme.tokens();
    const pts = composition.filter((r) => isFiniteNumber(r.bmi));
    if (!pts.length) return;
    const values = pts.map((r) => r.bmi);
    const min = Math.floor(Math.min(...values) - 1.5);
    const max = Math.ceil(Math.max(...values) + 1.5);
    const tint = (c, a) => withAlpha(c, a);
    theme.create('c-bmi', {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'IMC',
            data: pts.map((r) => ({ x: r.date.getTime(), y: r.bmi })),
            borderColor: t.series[0],
          },
        ],
      },
      options: {
        parsing: false,
        scales: {
          x: theme.timeScale(pts[0].date.getTime(), pts[pts.length - 1].date.getTime()),
          y: theme.valueScale({ min, max }),
        },
        plugins: {
          tooltip: theme.timeTooltip('', 1),
          spBands: {
            bands: [
              { from: 0, to: 18.5, color: tint(t.series[0], 0.05), label: 'Maigreur' },
              { from: 18.5, to: 25, color: tint(t.good, 0.1), label: 'Normal' },
              { from: 25, to: 30, color: tint(t.warning, 0.1), label: 'Surpoids' },
              { from: 30, to: 35, color: tint(t.serious, 0.1), label: 'Obésité I' },
              { from: 35, to: 40, color: tint(t.critical, 0.1), label: 'Obésité II' },
              { from: 40, to: 80, color: tint(t.critical, 0.16), label: 'Obésité III' },
            ],
          },
        },
      },
    });
  }

  /** Barres divergentes : variation entre deux pesées successives. */
  function renderDayOverDay({ daily }) {
    const t = theme.tokens();
    const dod = trends.dayOverDay(daily, 'weight');
    if (!dod.length) return;
    theme.create('c-weight-dod', {
      type: 'bar',
      data: {
        labels: dod.map((d) => fmtDate(d.date)),
        datasets: [
          {
            label: 'Variation',
            data: dod.map((d) => d.delta),
            backgroundColor: dod.map((d) => (d.delta <= 0 ? t.down : t.up)),
            borderRadius: 3,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 10 } },
          y: theme.valueScale({ ticks: { callback: (v) => fmtDelta(v, 1) } }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => fmtDate(dod[items[0].dataIndex].date, 'weekday'),
              label: (ctx) => {
                const d = dod[ctx.dataIndex];
                return ` ${fmtDelta(d.delta, 2)} kg${d.gap > 1 ? ` en ${d.gap} jours` : ''}`;
              },
            },
          },
        },
      },
    });
    theme.setLegend('lg-weight-dod', [
      { label: 'Baisse', color: t.down, box: true },
      { label: 'Hausse', color: t.up, box: true },
    ]);
  }

  /** Moyenne hebdomadaire et variation vs semaine précédente. */
  function renderWeekly({ daily }) {
    const t = theme.tokens();
    const weeks = trends.weekly(daily, 'weight').filter((w) => w.delta !== null);
    if (!weeks.length) return;
    theme.create('c-weight-weekly', {
      type: 'bar',
      data: {
        labels: weeks.map((w) => 'Sem. ' + fmtDate(w.week)),
        datasets: [
          {
            label: 'Variation hebdo',
            data: weeks.map((w) => w.delta),
            backgroundColor: weeks.map((w) => (w.delta <= 0 ? t.down : t.up)),
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 8 } },
          y: theme.valueScale({ ticks: { callback: (v) => fmtDelta(v, 1) + ' kg' } }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => 'Semaine du ' + fmtDate(weeks[items[0].dataIndex].week, 'long'),
              label: (ctx) => {
                const w = weeks[ctx.dataIndex];
                return [` Moyenne : ${fmt(w.avg, 2)} kg`, ` vs sem. préc. : ${fmtDelta(w.delta, 2)} kg`, ` ${w.count} pesée(s)`];
              },
            },
          },
        },
      },
    });
  }

  /** Variation moyenne selon le jour de la semaine. */
  function renderWeekday({ daily }) {
    const t = theme.tokens();
    const effect = trends.weekdayEffect(trends.dayOverDay(daily, 'weight'));
    if (!effect.some((e) => e.count)) return;
    theme.create('c-weekday', {
      type: 'bar',
      data: {
        labels: WEEKDAYS,
        datasets: [
          {
            label: 'Variation moyenne',
            data: effect.map((e) => e.avg),
            backgroundColor: effect.map((e) => (e.avg === null ? t.grid : e.avg <= 0 ? t.down : t.up)),
            maxBarThickness: 32,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: theme.valueScale({ ticks: { callback: (v) => fmtDelta(v, 2) } }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const e = effect[ctx.dataIndex];
                return e.avg === null ? ' Pas de données' : [` ${fmtDelta(e.avg, 2)} kg en moyenne`, ` sur ${e.count} jour(s)`];
              },
            },
          },
        },
      },
    });
  }

  /** Nuage : heure de pesée vs écart à la moyenne 7 jours. */
  function renderWeighTime({ composition, daily }) {
    const t = theme.tokens();
    const avg = rollingMean(daily, 'weight', 7);
    const avgByDay = new Map(avg.map((p) => [SP.core.utils.dayKey(new Date(p.x)), p.y]));
    const pts = composition
      .filter((r) => isFiniteNumber(r.weight))
      .map((r) => {
        const ref = avgByDay.get(SP.core.utils.dayKey(r.date));
        return { x: r.date.getHours() + r.date.getMinutes() / 60, y: ref ? r.weight - ref : null, date: r.date, w: r.weight };
      })
      .filter((p) => p.y !== null);
    if (!pts.length) return;
    theme.create('c-weigh-time', {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Pesée',
            data: pts,
            backgroundColor: withAlpha(t.series[0], 0.6),
            pointRadius: 4.5,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        scales: {
          x: theme.valueScale({
            type: 'linear',
            min: Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))) - 1),
            max: Math.min(24, Math.ceil(Math.max(...pts.map((p) => p.x))) + 1),
            grid: { display: false },
            ticks: { stepSize: 1, callback: (v) => v + 'h' },
          }),
          y: theme.valueScale({ ticks: { callback: (v) => fmtDelta(v, 1) } }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => fmtDate(items[0].raw.date, 'weekday') + ' à ' + fmtDate(items[0].raw.date, 'time'),
              label: (ctx) => [` ${fmt(ctx.raw.w, 2)} kg`, ` Écart moyenne 7 j : ${fmtDelta(ctx.raw.y, 2)} kg`],
            },
          },
        },
      },
    });
  }

  function render(ctx) {
    renderMain(ctx);
    renderCumulative(ctx);
    renderBmi(ctx);
    renderDayOverDay(ctx);
    renderWeekly(ctx);
    renderWeekday(ctx);
    renderWeighTime(ctx);
  }

  SP.charts.weight = { render };
})(window.SP);
