/**
 * Tableaux de données brutes (vue tabulaire accessible des graphiques).
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, isFiniteNumber, escapeHtml } = SP.core.utils;
  const { CM_ZONES } = SP.parsers.measurements;
  const { LABELS } = SP.parsers.composition;

  const COMPOSITION_COLUMNS = [
    'weight', 'bmi', 'fatPct', 'fatKg', 'muscleKg', 'skeletalKg', 'leanKg', 'waterPct',
    'proteinPct', 'boneKg', 'subcutPct', 'visceral', 'bmr', 'metaAge',
  ];

  /** Classe de cellule selon la variation vs ligne précédente (baisse = vert). */
  function trendClass(curr, prev, invert = false) {
    if (!isFiniteNumber(curr) || !isFiniteNumber(prev) || Math.abs(curr - prev) < 1e-9) return '';
    const down = curr < prev;
    return (invert ? !down : down) ? 'cell-down' : 'cell-up';
  }

  function renderMeasurements(host, measurements, quality) {
    if (!host) return;
    if (!measurements.length) {
      host.innerHTML = '<p class="muted">Aucune mensuration.</p>';
      return;
    }
    const head = `<tr><th>Date</th>${CM_ZONES.map((z) => `<th>${escapeHtml(z.label)}</th>`).join('')}<th>RTH</th><th>Navy %</th></tr>`;
    const rows = measurements
      .map((m, i) => {
        const prev = measurements[i - 1];
        const cells = CM_ZONES.map((z) => {
          if (quality && quality.isFlagged(m.date, z.key)) {
            return `<td class="cell-flag" title="Valeur douteuse (écart à la tendance)">⚠ ${fmt(m[z.key], 1)}</td>`;
          }
          return `<td class="${prev ? trendClass(m[z.key], prev[z.key]) : ''}">${fmt(m[z.key], 1)}</td>`;
        }).join('');
        return `<tr><td>${fmtDate(m.date, 'weekday')}</td>${cells}<td>${fmt(m.whr, 2)}</td><td>${fmt(m.navyFat, 1)}</td></tr>`;
      })
      .reverse()
      .join('');

    const a = measurements[0];
    const b = measurements[measurements.length - 1];
    const total =
      measurements.length > 1
        ? `<tr><td><strong>Δ total</strong></td>${CM_ZONES.map((z) => {
            const d = isFiniteNumber(a[z.key]) && isFiniteNumber(b[z.key]) ? b[z.key] - a[z.key] : null;
            return `<td class="${trendClass(b[z.key], a[z.key])}"><strong>${d === null ? '—' : fmtDelta(d, 1)}</strong></td>`;
          }).join('')}<td></td><td></td></tr>`
        : '';

    host.innerHTML = `<div class="table-wrap table-scroll"><table class="data-table"><thead>${head}</thead><tbody>${total}${rows}</tbody></table></div>`;
  }

  function renderComposition(host, composition) {
    if (!host) return;
    if (!composition.length) {
      host.innerHTML = '<p class="muted">Aucune pesée.</p>';
      return;
    }
    const cols = COMPOSITION_COLUMNS.filter((k) => composition.some((r) => isFiniteNumber(r[k])));
    const head = `<tr><th>Date</th><th>Heure</th>${cols
      .map((k) => `<th>${escapeHtml(LABELS[k].label)}${LABELS[k].unit ? ` (${LABELS[k].unit})` : ''}</th>`)
      .join('')}</tr>`;
    const invert = new Set(['muscleKg', 'skeletalKg', 'leanKg', 'waterPct', 'proteinPct', 'boneKg']);
    const rows = composition
      .map((r, i) => {
        const prev = composition[i - 1];
        return `<tr><td>${fmtDate(r.date, 'weekday')}</td><td>${fmtDate(r.date, 'time')}</td>${cols
          .map(
            (k) =>
              `<td class="${prev ? trendClass(r[k], prev[k], invert.has(k)) : ''}">${fmt(r[k], LABELS[k].decimals)}</td>`
          )
          .join('')}</tr>`;
      })
      .reverse()
      .join('');
    host.innerHTML = `<div class="table-wrap table-scroll"><table class="data-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  }

  SP.ui.tables = { renderMeasurements, renderComposition };
})(window.SP);
