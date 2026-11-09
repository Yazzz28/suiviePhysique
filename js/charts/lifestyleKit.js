/**
 * Briques communes aux graphiques « mode de vie » : barres journalières +
 * moyenne 7 jours, courbes, lignes de référence, barres par jour de semaine.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDate, mean, isFiniteNumber, withAlpha, DAY_MS } = SP.core.utils;
  const theme = SP.charts.theme;

  const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  /** Points { x, y } d'une métrique journalière (y = accessor(day)). */
  function points(days, accessor) {
    return days
      .map((d) => ({ x: d.date.getTime(), y: accessor(d) }))
      .filter((p) => isFiniteNumber(p.y));
  }

  /** Moyenne glissante sur 7 jours calendaires (au moins 3 valeurs). */
  function rolling7(pts) {
    return pts
      .map((p, i) => {
        const win = [];
        for (let j = i; j >= 0 && pts[j].x > p.x - 7 * DAY_MS + DAY_MS / 2; j--) win.push(pts[j].y);
        return { x: p.x, y: win.length >= 3 ? mean(win) : null };
      })
      .filter((p) => p.y !== null);
  }

  function refLine(label, value, minX, maxX, color) {
    return {
      type: 'line',
      label,
      data: [
        { x: minX, y: value },
        { x: maxX, y: value },
      ],
      borderColor: color,
      borderDash: [5, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
      order: 0,
      isRef: true,
    };
  }

  /**
   * Infobulle temporelle alignée sur l'abscisse (les séries n'ont pas toutes
   * les mêmes jours) ; les lignes de référence n'y figurent pas.
   */
  function xTooltip(unit, decimals) {
    return { ...theme.timeTooltip(unit, decimals), mode: 'x', filter: (item) => !item.dataset.isRef };
  }

  function tickFormatter(unit) {
    return (v, _i, ticks) => fmt(v, theme.tickDecimals(ticks)) + (unit ? ' ' + unit : '');
  }

  /**
   * Barres journalières + moyenne 7 j (+ lignes de référence).
   * @param {string} canvasId
   * @param {object[]} days
   * @param {object} o  { accessor, label, unit, decimals, color, barColor?(day), refs?: [{label, value, color}], legendId, yMin }
   */
  function dailyBars(canvasId, days, o) {
    const t = theme.tokens();
    const rows = days.filter((d) => isFiniteNumber(o.accessor(d)));
    if (!rows.length) return null;
    const pts = rows.map((d) => ({ x: d.date.getTime(), y: o.accessor(d) }));
    const avg = rolling7(pts);
    const minX = pts[0].x - DAY_MS / 2;
    const maxX = pts[pts.length - 1].x + DAY_MS / 2;
    const color = o.color || t.series[0];
    const datasets = [
      {
        type: 'bar',
        label: o.label,
        data: pts,
        backgroundColor: o.barColor ? rows.map((d) => o.barColor(d, t)) : withAlpha(color, 0.45),
        borderRadius: 2,
        barPercentage: 0.9,
        categoryPercentage: 1,
        order: 2,
      },
    ];
    if (avg.length > 2 && o.average !== false) {
      datasets.push({ type: 'line', label: 'Moyenne 7 j', data: avg, borderColor: color, borderWidth: 2, order: 1 });
    }
    (o.refs || []).forEach((r) => datasets.push(refLine(r.label, r.value, minX, maxX, r.color || t.textSecondary)));
    if (o.legendId) {
      theme.setLegend(o.legendId, [
        // Barres colorées par jour : c'est l'appelant qui décrit les couleurs (legendExtra)
        ...(o.barColor ? [] : [{ label: o.label, color: withAlpha(color, 0.45), box: true }]),
        ...(avg.length > 2 && o.average !== false ? [{ label: 'Moyenne 7 j', color }] : []),
        ...(o.legendExtra || []),
        ...(o.refs || []).map((r) => ({ label: r.label, color: r.color || t.textSecondary, dashed: true })),
      ]);
    }
    return theme.create(canvasId, {
      type: 'bar',
      data: { datasets },
      options: {
        parsing: false,
        scales: {
          x: theme.timeScale(minX, maxX, { offset: false }),
          y: theme.valueScale({ min: o.yMin, beginAtZero: o.yMin === undefined, ticks: { maxTicksLimit: 6, callback: tickFormatter(o.unit) } }),
        },
        plugins: { tooltip: xTooltip(o.unit, o.decimals || 0) },
      },
    });
  }

  /**
   * Courbes temporelles.
   * @param {object[]} series  [{ label, data: [{x,y}], color, dashed?, fill?, points? }]
   */
  function lines(canvasId, series, o = {}) {
    const all = series.flatMap((s) => s.data);
    if (!all.length) return null;
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const datasets = series.map((s) => ({
      label: s.label,
      data: s.data,
      borderColor: s.color,
      backgroundColor: s.fill ? withAlpha(s.color, 0.12) : s.color,
      fill: s.fill || false,
      borderDash: s.dashed ? [5, 4] : undefined,
      borderWidth: s.dashed ? 1.5 : 2,
      pointRadius: s.points || s.data.length < 15 ? 3 : 0,
      showLine: s.showLine !== false,
      spanGaps: s.spanGaps !== undefined ? s.spanGaps : 3 * DAY_MS,
    }));
    if (o.legendId) theme.setLegend(o.legendId, series.map((s) => ({ label: s.label, color: s.color, dashed: !!s.dashed })));
    return theme.create(canvasId, {
      type: 'line',
      data: { datasets },
      options: {
        parsing: false,
        scales: {
          x: theme.timeScale(minX, maxX, o.x || {}),
          y: theme.valueScale({ ...(o.y || {}), ticks: { maxTicksLimit: 6, callback: o.tick || tickFormatter(o.unit) } }),
        },
        plugins: {
          tooltip: o.tooltip || xTooltip(o.unit, o.decimals === undefined ? 0 : o.decimals),
          spBands: o.bands ? { bands: o.bands } : undefined,
        },
      },
    });
  }

  /** Barres par jour de semaine (lundi -> dimanche). */
  function weekdayBars(canvasId, values, o) {
    const t = theme.tokens();
    if (!values.some((v) => isFiniteNumber(v.value))) return null;
    const avg = mean(values.map((v) => v.value));
    return theme.create(canvasId, {
      type: 'bar',
      data: {
        labels: WEEKDAYS,
        datasets: [
          {
            label: o.label,
            data: values.map((v) => v.value),
            backgroundColor: values.map((v) => (isFiniteNumber(v.value) && v.value >= avg ? o.color || t.series[0] : withAlpha(o.color || t.series[0], 0.5))),
            borderRadius: 4,
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: theme.valueScale({ beginAtZero: true, ticks: { maxTicksLimit: 5, callback: tickFormatter(o.unit) } }),
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${fmt(ctx.parsed.y, o.decimals || 0)}${o.unit ? ' ' + o.unit : ''} (${values[ctx.dataIndex].n} jours)`,
            },
          },
        },
      },
    });
  }

  /** Masque la carte d'un graphique quand il n'y a pas de données. */
  function toggleCard(canvasOrHostId, visible) {
    const el = document.getElementById(canvasOrHostId);
    const card = el && el.closest('.card');
    if (card) card.classList.toggle('hidden', !visible);
  }

  /** Durée en minutes -> « 7 h 18 ». */
  function fmtDuration(min) {
    if (!isFiniteNumber(min)) return '—';
    const h = Math.floor(min / 60);
    const m = Math.round(min - h * 60);
    return m === 60 ? `${h + 1} h` : `${h} h ${String(m).padStart(2, '0')}`;
  }

  /** Heure décimale (éventuellement > 24) -> « 23:32 ». */
  function fmtClock(hours) {
    if (!isFiniteNumber(hours)) return '—';
    const h = ((Math.floor(hours) % 24) + 24) % 24;
    const m = Math.round((hours - Math.floor(hours)) * 60);
    return `${String(m === 60 ? (h + 1) % 24 : h).padStart(2, '0')}:${String(m === 60 ? 0 : m).padStart(2, '0')}`;
  }

  SP.charts.kit = { WEEKDAYS, points, rolling7, refLine, xTooltip, dailyBars, lines, weekdayBars, toggleCard, fmtDuration, fmtClock, fmtDate };
})(window.SP);
