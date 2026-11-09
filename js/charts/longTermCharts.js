/**
 * Historique long terme : moyennes mensuelles sur tout l'export, un petit
 * graphique par métrique (indépendant du filtre de période).
 */
(function (SP) {
  'use strict';

  const { fmt, isFiniteNumber, escapeHtml } = SP.core.utils;
  const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const theme = SP.charts.theme;
  const kit = SP.charts.kit;

  const COLORS = { weight: 0, steps: 2, hrRest: 7, stressAvg: 1, sleepHours: 6, kcalIn: 3 };

  function render({ lifestyle }) {
    const host = document.getElementById('history-grid');
    if (!host) return;
    const h = lifestyle.history;
    if (!h || !h.metrics.length) {
      host.innerHTML = '';
      return;
    }
    const t = theme.tokens();
    host.innerHTML = h.metrics
      .map(
        (m) => `<div class="card"><div class="card__head"><div><h3>${escapeHtml(m.label)}</h3>
          <p class="card__sub">Moyenne mensuelle${m.unit ? ', ' + escapeHtml(m.unit) : ''} · ${h.series[m.key].length} mois</p></div></div>
          <div class="chart-box chart-box--short"><canvas id="c-lt-${m.key}"></canvas></div></div>`
      )
      .join('');
    h.metrics.forEach((m) => {
      const data = h.series[m.key].map((p) => ({ x: p.date.getTime(), y: p.value, n: p.n }));
      kit.lines(`c-lt-${m.key}`, [{ label: m.label, data, color: t.series[COLORS[m.key]], spanGaps: false, points: data.length < 30 }], {
        unit: m.unit,
        decimals: m.decimals,
        x: {
          // Une graduation au 1er janvier de chaque année
          afterBuildTicks: (axis) => {
            const ticks = [];
            for (let y = new Date(axis.min).getFullYear() + 1; y <= new Date(axis.max).getFullYear(); y++) ticks.push({ value: new Date(y, 0, 1).getTime() });
            axis.ticks = ticks;
          },
          ticks: { maxRotation: 0, autoSkipPadding: 8, callback: (v) => String(new Date(v).getFullYear()) },
        },
        tooltip: {
          callbacks: {
            title: (items) => (items.length ? MONTH.format(new Date(items[0].parsed.x)) : ''),
            label: (ctx) => ` ${fmt(ctx.parsed.y, m.decimals)}${m.unit ? ' ' + m.unit : ''} (${isFiniteNumber(ctx.raw.n) ? ctx.raw.n : '?'} relevés)`,
          },
        },
      });
    });
  }

  SP.charts.longTerm = { render };
})(window.SP);
