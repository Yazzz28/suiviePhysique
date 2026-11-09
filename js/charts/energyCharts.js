/**
 * Section Bilan énergétique : apport vs dépense, bilan quotidien, perte
 * prédite par la saisie vs perte réelle, dépense adaptative vs montre.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, isFiniteNumber, withAlpha, DAY_MS } = SP.core.utils;
  const theme = SP.charts.theme;
  const kit = SP.charts.kit;

  function kpi(label, value, unit, meta) {
    return `<div class="card kpi"><span class="kpi__label">${label}</span>
      <span class="kpi__value">${value}<span class="kpi__unit">${unit}</span></span>
      ${meta ? `<span class="kpi__meta">${meta}</span>` : ''}</div>`;
  }

  function renderKpis({ lifestyle }) {
    const host = document.getElementById('energy-kpis');
    if (!host) return;
    const e = lifestyle.energy;
    const c = e.counts;
    const html = [];
    const since = e.window && !e.window.whole ? ` depuis le ${fmtDate(e.window.from)}` : '';
    if (isFiniteNumber(e.meanIntake))
      html.push(kpi('Apport moyen saisi', fmt(e.meanIntake, 0), 'kcal/j', `${c.complete} jours pris en compte sur ${c.days}${since}`));
    if (isFiniteNumber(e.meanTdee)) html.push(kpi('Dépense moyenne (montre)', fmt(e.meanTdee, 0), 'kcal/j', 'Repos + activité + digestion'));
    if (isFiniteNumber(e.meanBalance))
      html.push(kpi('Bilan saisi', fmtDelta(e.meanBalance, 0), 'kcal/j', e.meanBalance < 0 ? 'Déficit d’après la saisie et la montre' : 'Surplus d’après la saisie et la montre'));
    if (isFiniteNumber(e.impliedBalance))
      html.push(kpi('Bilan déduit du poids', fmtDelta(e.impliedBalance, 0), 'kcal/j', `Pente ${fmtDelta(e.weightSlope.slopePerDay * 7, 2)} kg/sem. × ${fmt(e.rho, 0)} kcal/kg`));
    if (isFiniteNumber(e.adaptiveTdee))
      html.push(
        kpi(
          'Dépense réelle estimée',
          fmt(e.adaptiveTdee, 0),
          'kcal/j',
          isFiniteNumber(e.meanTdee) ? `${fmtDelta(e.adaptiveTdee - e.meanTdee, 0)} kcal vs la montre` : 'Apport saisi − bilan déduit du poids'
        )
      );
    if (c.days)
      html.push(
        kpi(
          'Régularité de saisie',
          fmt((c.reliable / c.days) * 100, 0),
          '%',
          `${c.incomplete} jour(s) probablement incomplet(s) (< ${fmt(e.threshold, 0)} kcal), ${e.includeIncomplete ? 'intégrés' : 'exclus'}${since}`
        )
      );
    const note = document.getElementById('energy-window');
    if (note) {
      note.textContent = since
        ? `Synthèse et perte prédite calculées sur ta période de saisie régulière (${fmtDate(e.window.from, 'long')} → ${fmtDate(e.window.to, 'long')}) : avant, trop peu de repas saisis pour comparer.`
        : '';
    }
    host.innerHTML = html.join('');
  }

  function renderEnergy({ lifestyle }) {
    const t = theme.tokens();
    const rows = lifestyle.energy.days.filter((d) => isFiniteNumber(d.tdee));
    kit.toggleCard('c-energy', rows.length > 0);
    if (!rows.length) return;
    const minX = rows[0].date.getTime() - DAY_MS / 2;
    const maxX = rows[rows.length - 1].date.getTime() + DAY_MS / 2;
    const bar = (label, key, color) => ({
      type: 'bar',
      label,
      data: rows.map((d) => ({ x: d.date.getTime(), y: d[key] })),
      backgroundColor: color,
      barPercentage: 0.9,
      categoryPercentage: 1,
      borderRadius: 0,
      stack: 'out',
      order: 2,
    });
    const intake = rows.filter((d) => d.logStatus === 'complete').map((d) => ({ x: d.date.getTime(), y: d.kcalIn }));
    const datasets = [
      bar('Repos', 'rest', withAlpha(t.series[0], 0.35)),
      bar('Activité', 'active', withAlpha(t.series[0], 0.65)),
      bar('Digestion', 'tef', withAlpha(t.series[0], 0.9)),
      { type: 'line', label: 'Apport saisi', data: intake, borderColor: t.series[1], backgroundColor: t.series[1], pointRadius: 3, showLine: true, spanGaps: 3 * DAY_MS, order: 1 },
    ];
    theme.setLegend('lg-energy', [
      { label: 'Dépense : repos', color: withAlpha(t.series[0], 0.35), box: true },
      { label: 'activité', color: withAlpha(t.series[0], 0.65), box: true },
      { label: 'digestion', color: withAlpha(t.series[0], 0.9), box: true },
      { label: 'Apport saisi (jours complets)', color: t.series[1] },
    ]);
    theme.create('c-energy', {
      type: 'bar',
      data: { datasets },
      options: {
        parsing: false,
        scales: {
          x: { ...theme.timeScale(minX, maxX), stacked: true },
          y: theme.valueScale({ stacked: true, beginAtZero: true, ticks: { callback: (v) => fmt(v, 0) + ' kcal' } }),
        },
        plugins: {
          tooltip: {
            ...kit.xTooltip('kcal', 0),
            callbacks: {
              ...kit.xTooltip('kcal', 0).callbacks,
              footer: (items) => {
                if (!items.length) return '';
                const d = rows.find((r) => r.date.getTime() === items[0].parsed.x);
                if (!d) return '';
                const out = [`Dépense totale : ${fmt(d.tdee, 0)} kcal`];
                if (isFiniteNumber(d.balance)) out.push(`Bilan du jour : ${fmtDelta(d.balance, 0)} kcal`);
                else if (d.lowLog) out.push('Saisie probablement incomplète');
                return out;
              },
            },
          },
        },
      },
    });
  }

  function renderBalance({ lifestyle }) {
    const t = theme.tokens();
    const rows = lifestyle.energy.days.filter((d) => isFiniteNumber(d.balance));
    kit.toggleCard('c-balance', rows.length > 0);
    if (!rows.length) return;
    kit.dailyBars('c-balance', rows, {
      accessor: (d) => d.balance,
      label: 'Bilan du jour',
      unit: 'kcal',
      color: t.textSecondary,
      barColor: (d) => (d.balance < 0 ? t.down : t.up),
      yMin: undefined,
      legendId: 'lg-balance',
      legendExtra: [
        { label: 'Déficit', color: t.down, box: true },
        { label: 'Surplus', color: t.up, box: true },
      ],
    });
  }

  function renderCumulative({ lifestyle }) {
    const t = theme.tokens();
    const cum = lifestyle.energy.cumulative;
    kit.toggleCard('c-balance-cumul', cum.length > 1);
    if (cum.length < 2) return;
    kit.lines(
      'c-balance-cumul',
      [
        { label: 'Prédite par la saisie', data: cum.map((c) => ({ x: c.date.getTime(), y: c.predicted })), color: t.series[1], dashed: true },
        { label: 'Réelle (moyenne 7 j des pesées)', data: cum.filter((c) => isFiniteNumber(c.actual)).map((c) => ({ x: c.date.getTime(), y: c.actual })), color: t.series[0] },
      ],
      { unit: 'kg', decimals: 1, legendId: 'lg-balance-cumul', tick: (v) => fmtDelta(v, 0) + ' kg' }
    );
    const last = cum[cum.length - 1];
    const sub = document.getElementById('balance-cumul-sub');
    if (sub && isFiniteNumber(last.actual)) {
      sub.textContent = `Au ${fmtDate(last.date, 'long')} : ${fmtDelta(last.predicted, 1)} kg prédits par l'apport saisi et la dépense de la montre, ${fmtDelta(last.actual, 1)} kg réels. Jours non saisis : bilan moyen appliqué.`;
    }
  }

  function renderTdee({ lifestyle }) {
    const t = theme.tokens();
    const rows = lifestyle.energy.rolling;
    const adaptive = rows.filter((r) => isFiniteNumber(r.adaptive)).map((r) => ({ x: r.date.getTime(), y: r.adaptive }));
    const watch = rows.filter((r) => isFiniteNumber(r.watch)).map((r) => ({ x: r.date.getTime(), y: r.watch }));
    kit.toggleCard('c-tdee', adaptive.length > 1 || watch.length > 1);
    if (adaptive.length < 2 && watch.length < 2) return;
    kit.lines(
      'c-tdee',
      [
        { label: 'Montre (moyenne 21 j)', data: watch, color: t.series[0] },
        { label: 'Déduite du poids et de la saisie (21 j)', data: adaptive, color: t.series[6] },
      ],
      { unit: 'kcal', decimals: 0, legendId: 'lg-tdee' }
    );
  }

  function render(ctx) {
    renderKpis(ctx);
    renderEnergy(ctx);
    renderBalance(ctx);
    renderCumulative(ctx);
    renderTdee(ctx);
  }

  SP.charts.energy = { render };
})(window.SP);
