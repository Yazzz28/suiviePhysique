/**
 * Panneaux de synthèse : jalons (records, paliers, IMC), bilan mensuel,
 * qualité des mensurations.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, isFiniteNumber, escapeHtml } = SP.core.utils;

  /** Statut d'un jalon : confirmé, touché, prévu, ou hors de portée de la projection. */
  function milestoneStatus(item, current) {
    if (item.date) return `<span class="milestone__status is-done">✓ confirmé le ${fmtDate(item.date)}</span>`;
    if (item.touched) {
      return `<span class="milestone__status is-touched">touché le ${fmtDate(item.touched)} · moy. 7 j ${fmt(current, 1)} kg</span>`;
    }
    if (item.projected) return `<span class="milestone__status">prévu vers le ${fmtDate(item.projected.date)}</span>`;
    return '<span class="milestone__status muted">au-delà de la projection</span>';
  }

  function renderMilestones(host, rec) {
    if (!host) return;
    if (!rec) {
      host.innerHTML = '<p class="muted">Pas assez de pesées.</p>';
      return;
    }
    const rows = [
      ...rec.paliers.map((p) => ({ label: `Palier ${fmt(p.weight, 0)} kg`, ...p })),
      ...rec.bmi.map((b) => ({ label: `IMC < ${fmt(b.value, 0)} (${fmt(b.weight, 1)} kg)`, title: b.label, ...b })),
    ];
    host.innerHTML = `
      <div class="records">
        <div><span class="kpi__label">Plus bas</span><strong>${fmt(rec.low.weight, 1)} kg</strong><span class="kpi__meta">${fmtDate(rec.low.date)}</span></div>
        <div><span class="kpi__label">Plus haut</span><strong>${fmt(rec.high.weight, 1)} kg</strong><span class="kpi__meta">${fmtDate(rec.high.date)}</span></div>
        <div><span class="kpi__label">Perdu depuis le départ</span><strong>${fmtDelta(rec.current - rec.start, 1)} kg</strong><span class="kpi__meta">moyenne 7 j</span></div>
      </div>
      <ul class="milestones">
        ${rows
          .map(
            (r) =>
              `<li class="milestone${r.date ? ' is-done' : r.touched ? ' is-touched' : ''}"${r.title ? ` title="${escapeHtml(r.title)}"` : ''}>
                 <span class="milestone__dot" aria-hidden="true"></span>
                 <span class="milestone__label">${escapeHtml(r.label)}</span>
                 ${milestoneStatus(r, rec.current)}
               </li>`
          )
          .join('')}
      </ul>
      <p class="chart-hint">« Touché » : une pesée passe sous le seuil. « Confirmé » : la moyenne 7 jours aussi. Dates prévues selon la projection (apport constant).</p>`;
  }

  function signedCell(value, decimals, unit, goodWhenNegative = true) {
    if (!isFiniteNumber(value)) return '<td>—</td>';
    const cls = Math.abs(value) < 0.05 ? '' : (value < 0) === goodWhenNegative ? 'cell-down' : 'cell-up';
    return `<td class="${cls}">${fmtDelta(value, decimals)}${unit ? ' ' + unit : ''}</td>`;
  }

  function renderMonthly(host, months) {
    if (!host) return;
    if (!months.length) {
      host.innerHTML = '<p class="muted">Pas assez de pesées.</p>';
      return;
    }
    const rows = months
      .map(
        (m) => `<tr>
          <td>${fmtDate(m.month, 'month')}</td>
          <td>${fmt(m.endWeight, 1)} kg</td>
          ${signedCell(m.dWeight, 1, 'kg')}
          <td>${isFiniteNumber(m.ratePct) ? fmt(m.ratePct, 2) + ' %' : '—'}</td>
          ${signedCell(m.dFat, 1, 'kg')}
          ${signedCell(m.dLean, 1, 'kg', false)}
          <td>${isFiniteNumber(m.waist) ? fmt(m.waist, 1) + ' cm' : '—'}</td>
          ${signedCell(m.dWaist, 1, 'cm')}
          <td>${m.weighIns} (${Math.round(m.adherence * 100)} %)</td>
        </tr>`
      )
      .reverse()
      .join('');
    host.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Mois</th><th>Poids fin</th><th>Δ poids</th><th>Rythme / sem.</th><th>Δ gras</th><th>Δ maigre</th><th>Taille</th><th>Δ taille</th><th>Pesées</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="chart-hint">Poids en moyenne 7 jours, de la fin du mois précédent à la fin du mois. Le premier mois peut être partiel.</p>`;
  }

  function renderQuality(host, quality, excluded) {
    if (!host) return;
    if (!quality.flags.length) {
      host.innerHTML = '<p class="secondary">✓ Aucune mesure douteuse : tous les relevés suivent une tendance cohérente.</p>';
      return;
    }
    const byDate = new Map();
    quality.flags.forEach((f) => {
      const k = f.date.getTime();
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k).push(f);
    });
    const sessions = [...byDate.entries()].sort((a, b) => a[0] - b[0]);
    host.innerHTML = `
      <p class="secondary">${quality.flags.length} valeur(s) s'écartent de la tendance plus qu'un mètre ruban bien placé ne l'explique
        (tolérance 1,5 à 4 cm selon la zone). ${excluded ? 'Elles sont <strong>exclues</strong> des graphiques et de la silhouette.' : 'Elles sont <strong>incluses</strong> dans les graphiques.'}</p>
      <ul class="quality-list">
        ${sessions
          .map(([k, list]) => {
            const date = new Date(k);
            const warn = list.length >= 3 ? ' <span class="badge">relevé à refaire ?</span>' : '';
            return `<li><strong>${fmtDate(date, 'long')}</strong>${warn}<br>
              ${list
                .map(
                  (f) =>
                    `${escapeHtml(f.label)} ${fmt(f.value, 1)} cm <span class="muted">(tendance ${fmt(f.expected, 1)}, écart ${fmtDelta(f.deviation, 1)})</span>`
                )
                .join(' · ')}</li>`;
          })
          .join('')}
      </ul>
      <p class="chart-hint">Pour des mesures fiables : même heure, debout, pieds joints, mètre à l'horizontale ; pour les cuisses, toujours à la même hauteur du sol.</p>`;
  }

  SP.ui.summaryPanels = { renderMilestones, renderMonthly, renderQuality };
})(window.SP);
