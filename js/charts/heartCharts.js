/**
 * Section Stress & cœur : stress quotidien, carte heure × jour de semaine,
 * fréquence cardiaque de repos, constantes (SpO2, respiration, température
 * cutanée, indice AGE, pression artérielle moyenne) et mesures ponctuelles.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDate, isFiniteNumber, withAlpha, escapeHtml } = SP.core.utils;
  const theme = SP.charts.theme;
  const kit = SP.charts.kit;

  const MOODS = { 1: 'Très mauvaise', 2: 'Mauvaise', 3: 'Neutre', 4: 'Bonne', 5: 'Très bonne' };

  function renderStress({ lifestyle }) {
    const t = theme.tokens();
    const rows = lifestyle.days.filter((d) => isFiniteNumber(d.stressAvg));
    kit.toggleCard('c-stress', rows.length > 0);
    if (!rows.length) return;
    const avg = rows.map((d) => ({ x: d.date.getTime(), y: d.stressAvg }));
    kit.lines(
      'c-stress',
      [
        { label: 'Stress moyen du jour', data: avg, color: t.series[7], points: true, showLine: false },
        { label: 'Moyenne 7 j', data: kit.rolling7(avg), color: t.series[7] },
      ],
      {
        legendId: 'lg-stress',
        y: { min: 0, suggestedMax: 60 },
        bands: [
          { from: 0, to: 25, color: withAlpha(t.good, 0.08), label: 'Bas' },
          { from: 50, to: 100, color: withAlpha(t.warning, 0.1), label: 'Élevé' },
        ],
      }
    );
  }

  /** Carte de chaleur du stress moyen : jours de semaine × heures. */
  function renderStressGrid({ lifestyle }) {
    const host = document.getElementById('stress-grid');
    if (!host) return;
    const sh = lifestyle.stressHeart;
    const grid = sh ? sh.grid : null;
    const has = grid && grid.some((row) => row.some(Boolean));
    kit.toggleCard('stress-grid', !!has);
    if (!has) return;
    // Échelle jusqu'au 95e centile : une heure extrême isolée n'écrase pas les autres
    const values = grid.flat().filter(Boolean).map((c) => c.value).sort((a, b) => a - b);
    const max = Math.max(1, values[Math.floor((values.length - 1) * 0.95)]);
    const steps = ['--seq-100', '--seq-250', '--seq-400', '--seq-550', '--seq-700'];
    const colorFor = (v) => `var(${steps[Math.min(steps.length - 1, Math.floor((v / max) * steps.length))]})`;
    let html = '<div class="heatgrid__corner"></div>';
    for (let h = 0; h < 24; h++) html += `<div class="heatgrid__hour">${h % 3 === 0 ? h + 'h' : ''}</div>`;
    grid.forEach((row, i) => {
      html += `<div class="heatgrid__day">${kit.WEEKDAYS[i]}</div>`;
      row.forEach((c, h) => {
        const tip = c ? `${kit.WEEKDAYS[i]} ${h}h-${h + 1}h : stress moyen ${fmt(c.value, 0)} (${c.n} mesures)` : `${kit.WEEKDAYS[i]} ${h}h : pas de mesure`;
        html += `<div class="heatgrid__cell" style="${c ? `background:${colorFor(c.value)}` : ''}" data-tip="${tip}" aria-label="${tip}"></div>`;
      });
    });
    host.innerHTML = `<div class="heatgrid">${html}</div>
      <div class="calendar__scale"><span>Stress moyen :</span>${steps
        .map((s, i) => `<span class="box" style="background:var(${s})"></span><span>${i === 0 ? 'bas' : i === steps.length - 1 ? '≥ ' + fmt(max, 0) : ''}</span>`)
        .join('')}</div>`;
    SP.ui.tooltip.bind(host, '[data-tip]');
  }

  function renderHeartRate({ lifestyle }) {
    const t = theme.tokens();
    const rest = kit.points(lifestyle.days, (d) => d.hrRest);
    const avg = kit.points(lifestyle.days, (d) => d.hrAvg);
    kit.toggleCard('c-hr', rest.length > 0);
    if (!rest.length) return;
    kit.lines(
      'c-hr',
      [
        { label: 'FC de repos estimée', data: rest, color: t.series[7], points: true, showLine: false },
        { label: 'Repos, moyenne 7 j', data: kit.rolling7(rest), color: t.series[7] },
        { label: 'FC moyenne du jour', data: avg, color: t.textSecondary, dashed: true },
      ],
      { unit: 'bpm', legendId: 'lg-hr' }
    );
  }

  /** Petits multiples des constantes mesurées par la montre. */
  function renderVitals({ lifestyle }) {
    const t = theme.tokens();
    const v = lifestyle.vitals;
    const specs = [
      { id: 'c-spo2', list: v.spo2, label: 'SpO2', unit: '%', decimals: 0, color: t.series[0] },
      { id: 'c-resp', list: v.respiration, label: 'Respiration (sommeil)', unit: '/min', decimals: 1, color: t.series[2] },
      { id: 'c-skin', list: v.skinTemp, label: 'Température cutanée', unit: '°C', decimals: 1, color: t.series[1] },
      { id: 'c-age', list: v.ageIndex, label: 'Indice AGE', unit: '', decimals: 0, color: t.series[6] },
      { id: 'c-map', list: v.arterialPressure, label: 'Pression artérielle moyenne', unit: 'mmHg', decimals: 0, color: t.series[7] },
    ];
    specs.forEach((s) => {
      const pts = (s.list || []).map((p) => ({ x: p.date.getTime(), y: p.value }));
      kit.toggleCard(s.id, pts.length > 0);
      if (pts.length) kit.lines(s.id, [{ label: s.label, data: pts, color: s.color, points: true }], { unit: s.unit, decimals: s.decimals });
    });
  }

  /** Mesures rares : tension, antioxydants, humeur, caféine (liste). */
  function renderSpot({ lifestyle }) {
    const host = document.getElementById('vitals-list');
    if (!host) return;
    const v = lifestyle.vitals;
    const items = [];
    const day = (d) => d.toLocaleDateString('fr-FR');
    v.bloodPressure.slice(-3).forEach((b) => items.push([day(b.date), 'Tension', `${fmt(b.systolic, 0)}/${fmt(b.diastolic, 0)} mmHg`]));
    v.antioxidant.slice(-3).forEach((a) => items.push([day(a.date), 'Antioxydants', fmt(a.value, 0)]));
    v.mood.slice(-3).forEach((m) => items.push([day(m.date), 'Humeur', MOODS[m.value] || fmt(m.value, 0)]));
    v.caffeine.slice(-2).forEach((c) => items.push([day(c.date), 'Caféine', `${fmt(c.value, 0)} mg`]));
    kit.toggleCard('vitals-list', items.length > 0);
    host.innerHTML = items.length
      ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Mesure</th><th>Valeur</th></tr></thead><tbody>${items
          .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div><p class="muted rank-list__note">Dernières mesures ponctuelles, toutes dates confondues.</p>`
      : '';
  }

  function render(ctx) {
    renderStress(ctx);
    renderStressGrid(ctx);
    renderHeartRate(ctx);
    renderVitals(ctx);
    renderSpot(ctx);
  }

  SP.charts.heart = { render };
})(window.SP);
