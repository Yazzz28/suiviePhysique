/**
 * Heatmap calendrier : un carré par jour, couleur = variation vs pesée précédente.
 * Montre à la fois la régularité (jours vides) et le sens des variations.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, dayKey, isFiniteNumber } = SP.core.utils;
  const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  const BUCKETS = [
    { max: -0.5, varName: '--div-down', label: '≤ −0,5' },
    { max: -0.05, varName: '--div-down-soft', label: 'baisse' },
    { max: 0.05, varName: '--div-mid', label: 'stable' },
    { max: 0.5, varName: '--div-up-soft', label: 'hausse' },
    { max: Infinity, varName: '--div-up', label: '≥ +0,5' },
  ];

  function bucketFor(delta) {
    return BUCKETS.find((b) => delta <= b.max);
  }

  function render({ daily }) {
    const host = document.getElementById('calendar');
    if (!host) return;
    const rows = daily.filter((d) => isFiniteNumber(d.weight));
    if (!rows.length) {
      host.innerHTML = '';
      return;
    }

    const byDay = new Map();
    rows.forEach((d, i) => {
      const prev = rows[i - 1];
      byDay.set(dayKey(d.date), { ...d, delta: prev ? d.weight - prev.weight : null });
    });

    const first = rows[0].date;
    const lastDate = rows[rows.length - 1].date;
    const months = [];
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    while (cursor <= lastDate) {
      months.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }

    host.innerHTML = months
      .map((m) => {
        const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const offset = (m.getDay() + 6) % 7;
        let cells = DOW.map((d) => `<div class="calendar__dow">${d}</div>`).join('');
        cells += '<div class="calendar__cell is-empty"></div>'.repeat(offset);
        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(m.getFullYear(), m.getMonth(), day);
          const rec = byDay.get(dayKey(date));
          if (rec) {
            const bucket = rec.delta === null ? BUCKETS[2] : bucketFor(rec.delta);
            const strong = bucket === BUCKETS[0] || bucket === BUCKETS[4];
            const tip = `${fmtDate(date, 'weekday')} — ${fmt(rec.weight, 2)} kg${
              rec.delta === null ? '' : ` (${fmtDelta(rec.delta, 2)} kg)`
            }${rec.count > 1 ? ` · ${rec.count} pesées` : ''}`;
            cells += `<div class="calendar__cell has-data" style="background:var(${bucket.varName});${
              strong ? 'color:#fff' : ''
            }" data-tip="${tip}" aria-label="${tip}">${day}</div>`;
          } else {
            cells += `<div class="calendar__cell" aria-label="${fmtDate(date, 'weekday')} — pas de pesée">${day}</div>`;
          }
        }
        return `<div class="calendar__month"><h4>${fmtDate(m, 'month')}</h4><div class="calendar__grid">${cells}</div></div>`;
      })
      .join('');

    const scale = document.getElementById('calendar-scale');
    if (scale) {
      scale.innerHTML =
        '<span>Variation vs pesée précédente :</span>' +
        BUCKETS.map((b) => `<span class="box" style="background:var(${b.varName})"></span><span>${b.label}</span>`).join('') +
        '<span class="box" style="background:var(--surface-2);margin-left:8px"></span><span>pas de pesée</span>';
    }

    SP.ui.tooltip.bind(host, '[data-tip]');
  }

  SP.charts.calendar = { render };
})(window.SP);
