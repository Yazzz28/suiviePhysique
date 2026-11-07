/**
 * Dynamique de la perte : déficit estimé, vitesse observée vs attendue,
 * distribution des variations quotidiennes.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, mean, stdDev, withAlpha, DAY_MS } = SP.core.utils;
  const { trends } = SP.analysis;
  const theme = SP.charts.theme;

  // Même fenêtre que le modèle de projection : les courbes observée et attendue se raccordent.
  const ROLLING_WINDOW_DAYS = SP.analysis.projection.RATE_WINDOW_DAYS;

  /** Déficit calorique estimé au fil du temps (rythme glissant × énergie par kg). */
  function renderDeficit({ daily, projection }) {
    const t = theme.tokens();
    const rolling = trends.rollingTrend(daily, 'weight', ROLLING_WINDOW_DAYS);
    if (!rolling.length || !projection) return;
    const rho = projection.rho;
    const data = rolling.map((r) => ({ x: r.date.getTime(), y: -r.slopePerDay * rho }));
    const avg = mean(data.map((d) => d.y));
    theme.create('c-deficit', {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Déficit estimé',
            data,
            borderColor: t.series[1],
            backgroundColor: withAlpha(t.series[1], 0.12),
            fill: 'origin',
          },
        ],
      },
      options: {
        parsing: false,
        scales: {
          x: theme.timeScale(data[0].x, data[data.length - 1].x),
          y: theme.valueScale({ ticks: { callback: (v) => fmt(v, 0) + ' kcal' } }),
        },
        plugins: {
          tooltip: {
            ...theme.timeTooltip('kcal/j', 0),
            callbacks: {
              ...theme.timeTooltip().callbacks,
              label: (ctx) => ` Déficit : ${fmt(ctx.parsed.y, 0)} kcal/jour`,
            },
          },
        },
      },
    });
    const sub = document.getElementById('deficit-sub');
    if (sub) {
      sub.textContent = `kcal/jour, rythme glissant ${ROLLING_WINDOW_DAYS} j × ${fmt(rho, 0)} kcal/kg · moyenne ${fmt(avg, 0)} kcal/j`;
    }
  }

  /** Vitesse de perte observée (glissante) et vitesse attendue par le modèle. */
  function renderSpeed({ daily, projection }) {
    const t = theme.tokens();
    const rolling = trends.rollingTrend(daily, 'weight', ROLLING_WINDOW_DAYS);
    if (!rolling.length) return;
    const observed = rolling.map((r) => ({ x: r.date.getTime(), y: r.slopePerWeek }));
    const datasets = [
      { label: `Observée (${ROLLING_WINDOW_DAYS} j glissants)`, data: observed, borderColor: t.series[0] },
    ];
    let maxMs = observed[observed.length - 1].x;
    if (projection) {
      const horizon = 90;
      const expected = [];
      for (let d = 0; d <= horizon; d += 3) {
        expected.push({ x: projection.t0.getTime() + d * DAY_MS, y: projection.speedAtDays(d) });
      }
      maxMs = expected[expected.length - 1].x;
      datasets.push({
        label: 'Attendue (modèle, apport constant)',
        data: expected,
        borderColor: t.textSecondary,
        borderDash: [5, 4],
        borderWidth: 1.5,
        tension: 0,
      });
    }
    theme.setLegend(
      'lg-speed',
      datasets.map((d) => ({ label: d.label, color: d.borderColor, dashed: !!d.borderDash }))
    );
    theme.create('c-speed', {
      type: 'line',
      data: { datasets },
      options: {
        parsing: false,
        scales: {
          x: theme.timeScale(observed[0].x, maxMs),
          y: theme.valueScale({ ticks: { callback: (v, _i, ticks) => fmtDelta(v, theme.tickDecimals(ticks)) + ' kg/sem' } }),
        },
        plugins: {
          tooltip: {
            ...theme.timeTooltip(),
            callbacks: {
              ...theme.timeTooltip().callbacks,
              label: (ctx) => ` ${ctx.dataset.label} : ${fmtDelta(ctx.parsed.y, 2)} kg/sem`,
            },
          },
        },
      },
    });
  }

  /** Histogramme des variations d'un jour à l'autre (jours consécutifs uniquement). */
  function renderHistogram({ daily }) {
    const t = theme.tokens();
    const deltas = trends
      .dayOverDay(daily, 'weight')
      .filter((d) => d.gap === 1)
      .map((d) => d.delta);
    if (deltas.length < 3) return;
    const BIN = 0.2;
    const lo = Math.floor(Math.min(...deltas) / BIN) * BIN;
    const hi = Math.ceil(Math.max(...deltas) / BIN) * BIN;
    // Bornes calculées par index et arrondies (évite 0 → -2e-16 par cumul flottant)
    const round = (v) => Math.round(v * 1000) / 1000;
    const bins = [];
    const n = Math.round((hi - lo) / BIN);
    for (let i = 0; i < n; i++) bins.push({ from: round(lo + i * BIN), to: round(lo + (i + 1) * BIN), count: 0 });
    deltas.forEach((d) => {
      const i = Math.min(bins.length - 1, Math.floor((d - lo) / BIN + 1e-9));
      bins[i].count++;
    });
    const sd = stdDev(deltas);
    const m = mean(deltas);
    theme.create('c-dod-hist', {
      type: 'bar',
      data: {
        labels: bins.map((b) => fmtDelta(b.from + BIN / 2, 1)),
        datasets: [
          {
            label: 'Jours',
            data: bins.map((b) => b.count),
            backgroundColor: bins.map((b) => (b.to <= 0 ? t.down : b.from >= 0 ? t.up : t.axis)),
            borderRadius: 3,
            categoryPercentage: 0.92,
            barPercentage: 0.96,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 6 } },
          y: theme.valueScale({ ticks: { precision: 0, callback: (v) => v } }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => {
                const b = bins[items[0].dataIndex];
                return `De ${fmtDelta(b.from, 1)} à ${fmtDelta(b.to, 1)} kg`;
              },
              label: (ctx) => ` ${ctx.parsed.y} jour(s)`,
            },
          },
        },
      },
    });
    const sub = document.getElementById('dod-hist-sub');
    if (sub) {
      sub.textContent =
        `${deltas.length} variations d'un jour à l'autre · moyenne ${fmtDelta(m, 2)} kg · ` +
        `fluctuation normale ±${fmt(sd, 2)} kg (1 écart-type)`;
    }
  }

  function render(ctx) {
    renderDeficit(ctx);
    renderSpeed(ctx);
    renderHistogram(ctx);
  }

  SP.charts.dynamics = { render };
})(window.SP);
