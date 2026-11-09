/**
 * Graphiques de la section Poids.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, rollingMean, withAlpha, isFiniteNumber } = SP.core.utils;
  const { trends } = SP.analysis;
  const theme = SP.charts.theme;

  const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const PALIER_KG = 5;
  const WEEKEND_MAX_DAYS = 120;
  const GAP_DAYS = 10;

  /**
   * Courbe principale :
   * - pesées + tendance lissée sans retard (régression locale) et sa bande de fluctuation normale ;
   * - projection par bilan énergétique partant exactement de la tendance, avec la zone
   *   probable des pesées (incertitude du rythme + fluctuation quotidienne) ;
   * - scénario « si tu manges X kcal/j » (export santé + apport prévu) ;
   * - repères : paliers de 5 kg et objectif sur la projection, aujourd'hui, record, week-ends.
   */
  function renderMain({ composition, daily, settings, projection, weightTrend, lifestyle }) {
    const t = theme.tokens();
    const pts = composition.filter((r) => isFiniteNumber(r.weight));
    if (!pts.length) return;

    const firstMs = pts[0].date.getTime();
    const lastMs = pts[pts.length - 1].date.getTime();
    let maxMs = lastMs;
    const sd = weightTrend ? weightTrend.sd : 0;
    const datasets = [];
    const legend = [];
    const markers = []; // points remarquables (paliers, objectif, record)

    datasets.push({
      label: 'Pesée',
      data: pts.map((r) => ({ x: r.date.getTime(), y: r.weight })),
      borderColor: 'transparent',
      backgroundColor: withAlpha(t.series[0], 0.45),
      pointRadius: 3,
      pointHoverRadius: 6,
      showLine: false,
      order: 2,
    });
    legend.push({ label: 'Pesée', color: withAlpha(t.series[0], 0.45), box: true });

    if (weightTrend) {
      // Coupure de la tendance quand il manque plus de 10 jours de pesées : pas de courbe inventée dans le vide
      const trendPts = [];
      weightTrend.points.forEach((p, i) => {
        const prev = weightTrend.points[i - 1];
        if (prev && p.date - prev.date > GAP_DAYS * 86400000) trendPts.push({ x: (p.date.getTime() + prev.date.getTime()) / 2, y: null });
        trendPts.push({ x: p.date.getTime(), y: p.value });
      });
      const bandColor = withAlpha(t.series[0], 0.1);
      datasets.push(
        { label: 'Fluctuation basse', data: trendPts.map((p) => ({ x: p.x, y: p.y === null ? null : p.y - sd })), borderColor: 'transparent', backgroundColor: bandColor, pointRadius: 0, isBand: true, order: 6 },
        { label: 'Fluctuation haute', data: trendPts.map((p) => ({ x: p.x, y: p.y === null ? null : p.y + sd })), borderColor: 'transparent', backgroundColor: bandColor, fill: '-1', pointRadius: 0, isBand: true, order: 6 },
        { label: 'Tendance', data: trendPts, borderColor: t.series[0], borderWidth: 2.5, pointRadius: 0, order: 1 }
      );
      legend.push({ label: 'Tendance lissée', color: t.series[0] });
      legend.push({ label: `Fluctuation normale (± ${fmt(sd, 1)} kg)`, color: bandColor, box: true });
    }

    // Record : poids le plus bas de la période
    const record = pts.reduce((m, r) => (r.weight < m.weight ? r : m), pts[0]);
    markers.push({ x: record.date.getTime(), y: record.weight, kind: 'record', label: `Record : ${fmt(record.weight, 2)} kg` });

    let projectionCurve = null;
    if (projection) {
      const target = isFiniteNumber(settings.targetWeight) ? projection.dateFor(settings.targetWeight) : null;
      const horizon = Math.ceil(target ? Math.min(365, Math.max(30, target.days * 1.15)) : 90);
      projectionCurve = projection.curve(horizon);
      maxMs = Math.max(maxMs, projectionCurve[projectionCurve.length - 1].x);

      // Zone probable des pesées : rythme rapide / lent (≈ 80 %) élargi de la fluctuation quotidienne
      const fast = projection.fast ? projection.fast.curve(horizon) : projectionCurve;
      const slow = projection.slow ? projection.slow.curve(horizon) : projectionCurve.map((p) => ({ x: p.x, y: projection.w0 }));
      const zone = withAlpha(t.textSecondary, 0.1);
      datasets.push(
        { label: 'Zone basse', data: fast.map((p) => ({ x: p.x, y: p.y - sd })), borderColor: 'transparent', backgroundColor: zone, pointRadius: 0, tension: 0, isBand: true, order: 7 },
        { label: 'Zone haute', data: slow.map((p) => ({ x: p.x, y: p.y + sd })), borderColor: 'transparent', backgroundColor: zone, fill: '-1', pointRadius: 0, tension: 0, isBand: true, order: 7 },
        { label: 'Projection', data: projectionCurve, borderColor: t.textSecondary, borderWidth: 1.8, borderDash: [5, 4], pointRadius: 0, tension: 0, order: 3 }
      );
      legend.push({ label: `Projection au rythme actuel (${fmtDelta(projection.ratePerWeek, 2)} kg/sem.)`, color: t.textSecondary, dashed: true });
      legend.push({ label: 'Zone probable des pesées', color: zone, box: true });

      // Paliers de 5 kg et objectif atteints par la projection
      const lowest = Math.max(projection.plateau, isFiniteNumber(settings.targetWeight) ? settings.targetWeight : -Infinity);
      for (let k = Math.floor(projection.w0 / PALIER_KG) * PALIER_KG; k > lowest; k -= PALIER_KG) {
        const d = projection.dateFor(k);
        if (d && d.days <= horizon) markers.push({ x: d.date.getTime(), y: k, kind: 'palier', label: `${fmt(k, 0)} kg vers le ${fmtDate(d.date, 'long')}` });
      }
      if (target && target.days <= horizon) {
        markers.push({ x: target.date.getTime(), y: settings.targetWeight, kind: 'target', label: `Objectif ${fmt(settings.targetWeight, 1)} kg vers le ${fmtDate(target.date, 'long')}` });
      }

      // Scénario : apport prévu, avec la dépense réelle estimée (export santé)
      const tdee = lifestyle && lifestyle.energy ? lifestyle.energy.adaptiveTdee : null;
      if (isFiniteNumber(settings.plannedIntake) && isFiniteNumber(tdee)) {
        const scenario = projection.scenario(tdee - settings.plannedIntake);
        if (scenario) {
          datasets.push({
            label: `Si tu manges ${fmt(settings.plannedIntake, 0)} kcal/j`,
            data: scenario.curve(horizon),
            borderColor: t.series[6],
            borderWidth: 1.8,
            borderDash: [2, 3],
            pointRadius: 0,
            tension: 0,
            order: 3,
          });
          legend.push({ label: `Si tu manges ${fmt(settings.plannedIntake, 0)} kcal/j (${fmtDelta(scenario.ratePerWeek, 2)} kg/sem. au départ)`, color: t.series[6], dashed: true });
        }
      }
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
        pointRadius: 0,
        tension: 0,
        isBand: true,
        order: 4,
      });
      legend.push({ label: `Objectif ${fmt(settings.targetWeight, 1)} kg`, color: t.good, dashed: true });
    }

    const markerColor = { record: t.series[1], palier: t.textSecondary, target: t.good };
    datasets.push({
      label: 'Repères',
      data: markers.map((m) => ({ x: m.x, y: m.y, label: m.label })),
      backgroundColor: markers.map((m) => markerColor[m.kind]),
      borderColor: t.surface,
      borderWidth: 1.5,
      pointStyle: markers.map((m) => (m.kind === 'record' ? 'star' : m.kind === 'target' ? 'rectRot' : 'circle')),
      pointRadius: markers.map((m) => (m.kind === 'palier' ? 4 : 6)),
      pointHoverRadius: 8,
      showLine: false,
      order: 0,
    });
    legend.push({ label: 'Record', color: t.series[1], box: true });
    if (markers.some((m) => m.kind === 'palier')) legend.push({ label: 'Paliers de 5 kg', color: t.textSecondary, box: true });

    const spanDays = (maxMs - firstMs) / 86400000;
    if (spanDays <= WEEKEND_MAX_DAYS) legend.push({ label: 'Week-ends', color: withAlpha(t.textSecondary, 0.07), box: true });
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
            filter: (item) => !item.dataset.isBand,
            callbacks: {
              title: (items) => (items.length ? fmtDate(new Date(items[0].parsed.x), 'weekday') : ''),
              label: (ctx) => (ctx.raw && ctx.raw.label ? ` ${ctx.raw.label}` : ` ${ctx.dataset.label} : ${fmt(ctx.parsed.y, 2)} kg`),
            },
          },
          spVLines: projection ? { lines: [{ x: lastMs, label: "Aujourd'hui", color: t.textSecondary }] } : undefined,
          spWeekends: spanDays <= WEEKEND_MAX_DAYS ? { color: withAlpha(t.textSecondary, 0.07) } : undefined,
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
