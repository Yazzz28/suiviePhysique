/**
 * Section Activité : pas, minutes actives, inactivité, étages, séances par
 * semaine et par type, VO2max, pas par jour de semaine.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDate, isFiniteNumber, withAlpha, escapeHtml } = SP.core.utils;
  const theme = SP.charts.theme;
  const kit = SP.charts.kit;

  function renderSteps({ lifestyle }) {
    const t = theme.tokens();
    const a = lifestyle.activity;
    const rows = lifestyle.days.filter((d) => !d.partial && isFiniteNumber(d.steps));
    kit.toggleCard('c-steps', rows.length > 0);
    if (!rows.length) return;
    kit.dailyBars('c-steps', rows, {
      accessor: (d) => d.steps,
      label: 'Pas',
      unit: '',
      color: t.series[2],
      barColor: (d) => withAlpha(t.series[2], d.steps >= a.stepGoal ? 0.85 : 0.4),
      legendId: 'lg-steps',
      legendExtra: [
        { label: 'Pas', color: withAlpha(t.series[2], 0.4), box: true },
        { label: `Objectif atteint (${fmt(a.goalDays, 0)} j)`, color: withAlpha(t.series[2], 0.85), box: true },
      ],
      refs: [{ label: `Objectif ${fmt(a.stepGoal, 0)} pas`, value: a.stepGoal, color: t.textSecondary }],
    });
  }

  function renderActive({ lifestyle }) {
    const t = theme.tokens();
    const rows = lifestyle.days.filter((d) => !d.partial);
    const hasActive = rows.some((d) => isFiniteNumber(d.activeMin));
    kit.toggleCard('c-active-min', hasActive);
    if (hasActive) kit.dailyBars('c-active-min', rows, { accessor: (d) => d.activeMin, label: 'Minutes actives', unit: 'min', color: t.series[2] });

    const hasFloors = rows.some((d) => isFiniteNumber(d.floors) && d.floors > 0);
    kit.toggleCard('c-floors', hasFloors);
    if (hasFloors) kit.dailyBars('c-floors', rows, { accessor: (d) => d.floors, label: 'Étages', unit: '', color: t.series[5] });
  }

  function renderSessions({ lifestyle }) {
    const t = theme.tokens();
    const a = lifestyle.activity;
    kit.toggleCard('c-sessions-week', a.weeks.length > 0);
    if (!a.weeks.length) return;
    const palette = [t.series[2], t.series[0], t.series[6], t.series[3], t.series[4], t.axis];
    const datasets = a.types.map((type, i) => ({
      label: type,
      data: a.weeks.map((w) => w.minutes[type] || 0),
      backgroundColor: type === 'Autres' ? t.axis : palette[i % (palette.length - 1)],
      borderRadius: 0,
      maxBarThickness: 32,
    }));
    theme.setLegend('lg-sessions-week', datasets.map((d) => ({ label: d.label, color: d.backgroundColor, box: true })));
    theme.create('c-sessions-week', {
      type: 'bar',
      data: { labels: a.weeks.map((w) => fmtDate(w.date)), datasets },
      options: {
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 10 } },
          y: theme.valueScale({ stacked: true, beginAtZero: true, ticks: { callback: (v) => fmt(v, 0) + ' min' } }),
        },
        plugins: {
          tooltip: {
            mode: 'index',
            intersect: false,
            filter: (item) => item.parsed.y > 0,
            callbacks: {
              title: (items) => `Semaine du ${fmtDate(a.weeks[items[0].dataIndex].date, 'long')}`,
              label: (ctx) => ` ${ctx.dataset.label} : ${fmt(ctx.parsed.y, 0)} min`,
              footer: (items) => {
                const w = a.weeks[items[0].dataIndex];
                return `${w.count} séance(s) · ${fmt(w.kcal, 0)} kcal`;
              },
            },
          },
        },
      },
    });
  }

  function renderVo2({ lifestyle }) {
    const t = theme.tokens();
    const pts = lifestyle.activity.vo2.map((p) => ({ x: p.date.getTime(), y: p.value }));
    kit.toggleCard('c-vo2', pts.length > 0);
    if (pts.length) kit.lines('c-vo2', [{ label: 'VO2max estimée', data: pts, color: t.series[6], points: true }], { unit: 'ml/kg/min', decimals: 1 });
  }

  function renderWeekday({ lifestyle }) {
    const t = theme.tokens();
    const w = lifestyle.activity.weekday;
    const has = w.some((x) => isFiniteNumber(x.steps));
    kit.toggleCard('c-steps-weekday', has);
    if (has) kit.weekdayBars('c-steps-weekday', w.map((x) => ({ value: x.steps, n: x.n })), { label: 'Pas', unit: '', color: t.series[2] });
  }

  function renderSessionsTable({ lifestyle }) {
    const host = document.getElementById('sessions-table');
    if (!host) return;
    const list = lifestyle.activity.recent;
    kit.toggleCard('sessions-table', list.length > 0);
    if (!list.length) return;
    host.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Date</th><th>Activité</th><th>Durée</th><th>kcal</th><th>FC moy.</th><th>FC max</th><th>Distance</th></tr></thead>
      <tbody>${list
        .map(
          (s) => `<tr><td>${fmtDate(s.date, 'weekday')}</td><td>${escapeHtml(s.typeLabel)}</td><td>${kit.fmtDuration(s.durationMin)}</td>
            <td>${fmt(s.kcal, 0)}</td><td>${fmt(s.meanHr, 0)}</td><td>${fmt(s.maxHr, 0)}</td>
            <td>${isFiniteNumber(s.distance) ? fmt(s.distance / 1000, 2) + ' km' : '—'}</td></tr>`
        )
        .join('')}</tbody></table></div>`;
  }

  function render(ctx) {
    renderSteps(ctx);
    renderActive(ctx);
    renderSessions(ctx);
    renderVo2(ctx);
    renderWeekday(ctx);
    renderSessionsTable(ctx);
  }

  SP.charts.activity = { render };
})(window.SP);
