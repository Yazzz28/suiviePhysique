/**
 * Section Corrélations : matrice des coefficients (bleu = varient en sens
 * inverse, rouge = dans le même sens) et nuages de points des liens les plus
 * marqués avec la variation de poids du lendemain.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, isFiniteNumber, withAlpha, escapeHtml } = SP.core.utils;
  const theme = SP.charts.theme;
  const kit = SP.charts.kit;
  const { strength } = SP.analysis.lifestyle.correlations;

  const SCATTERS = ['c-corr-1', 'c-corr-2', 'c-corr-3'];

  function cellStyle(r) {
    if (!isFiniteNumber(r)) return '';
    const a = Math.min(1, Math.abs(r));
    const v = r < 0 ? '--div-down' : '--div-up';
    // Mélange vers la couleur neutre selon la force du lien
    return `background: color-mix(in srgb, var(${v}) ${Math.round(a * 85)}%, var(--div-mid));${a > 0.55 ? 'color:#fff;' : ''}`;
  }

  function renderMatrix({ lifestyle }) {
    const host = document.getElementById('corr-matrix');
    if (!host) return;
    const c = lifestyle.correlations;
    if (!c) {
      host.innerHTML = '<p class="muted">Pas assez de jours en commun pour calculer des corrélations (minimum 10).</p>';
      return;
    }
    const head = c.columns.map((col) => `<th scope="col">${escapeHtml(col.short)}</th>`).join('');
    const body = c.vars
      .map(
        (v, i) =>
          `<tr><th scope="row">${escapeHtml(v.label)}</th>${c.matrix[i]
            .map((cell, j) => {
              if (c.columns[j] === v) return '<td class="corr__self">—</td>';
              if (!isFiniteNumber(cell.r)) return `<td class="corr__na" data-tip="Moins de ${c.minN} jours en commun (${cell.n})">·</td>`;
              const tip = `${v.short} × ${c.columns[j].short} : r = ${fmtDelta(cell.r, 2)} (${strength(cell.r)}, ${cell.n} jours)`;
              return `<td style="${cellStyle(cell.r)}" data-tip="${escapeHtml(tip)}">${fmtDelta(cell.r, 2)}</td>`;
            })
            .join('')}</tr>`
      )
      .join('');
    host.innerHTML = `<div class="table-wrap"><table class="corr"><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    SP.ui.tooltip.bind(host, '[data-tip]');
  }

  function renderScatters({ lifestyle }) {
    const t = theme.tokens();
    const c = lifestyle.correlations;
    const top = c ? c.withWeight.slice(0, SCATTERS.length) : [];
    SCATTERS.forEach((id, i) => {
      const item = top[i];
      kit.toggleCard(id, !!item);
      if (!item) return;
      const pts = item.pairs.map(([x, y]) => ({ x, y }));
      const title = document.getElementById(`${id}-title`);
      if (title) title.textContent = `${item.variable.label} → poids du lendemain`;
      const sub = document.getElementById(`${id}-sub`);
      if (sub) sub.textContent = `r = ${fmtDelta(item.r, 2)} · ${strength(item.r)} · ${item.n} jours`;
      // Droite de régression
      const reg = SP.core.utils.linearRegression(pts);
      const xs = pts.map((p) => p.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const datasets = [{ type: 'scatter', label: 'Jours', data: pts, backgroundColor: withAlpha(t.series[0], 0.55), pointRadius: 4, pointHoverRadius: 6 }];
      if (reg) {
        datasets.push({
          type: 'line',
          label: 'Tendance',
          data: [
            { x: minX, y: reg.intercept + reg.slope * minX },
            { x: maxX, y: reg.intercept + reg.slope * maxX },
          ],
          borderColor: item.r < 0 ? t.down : t.up,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
        });
      }
      theme.create(id, {
        type: 'scatter',
        data: { datasets },
        options: {
          parsing: false,
          scales: {
            x: theme.valueScale({ type: 'linear', grid: { display: false }, ticks: { maxTicksLimit: 5, callback: (v) => fmt(v, 0) } }),
            y: theme.valueScale({ ticks: { callback: (v) => fmt(v, 1) + ' kg' } }),
          },
          plugins: {
            tooltip: {
              filter: (it) => it.datasetIndex === 0,
              callbacks: { label: (ctx) => ` ${item.variable.short} ${fmt(ctx.parsed.x, 0)} → ${fmt(ctx.parsed.y, 2)} kg le lendemain` },
            },
          },
        },
      });
    });
  }

  function render(ctx) {
    renderMatrix(ctx);
    renderScatters(ctx);
  }

  SP.charts.correlations = { render };
})(window.SP);
