/**
 * Section « Tailles de vêtements » : une carte par vêtement avec la taille
 * conseillée, sa position dans la fourchette, la mesure qui décide,
 * l'évolution depuis le premier relevé et l'estimation à l'objectif de poids.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDate, isFiniteNumber, escapeHtml } = SP.core.utils;
  const { sizing } = SP.analysis;

  /** Échelle visuelle : taille précédente, conseillée, suivante + repère de position. */
  function scaleHtml(fit, label) {
    const { chart, index, position, outOfRange } = fit;
    const cells = [index - 1, index, index + 1].map((i) => {
      if (i < 0 || i >= chart.length) return '<span class="size-scale__cell is-empty"></span>';
      const s = chart[i];
      const current = i === index;
      const marker = current
        ? `<span class="size-scale__marker" style="left:${(position * 100).toFixed(1)}%"></span>`
        : '';
      return `<span class="size-scale__cell${current ? ' is-current' : ''}">${marker}<span>${escapeHtml(label(s.label))}</span></span>`;
    });
    const note =
      outOfRange === 'above'
        ? '<span class="size-scale__note">au-delà du barème</span>'
        : outOfRange === 'below'
          ? '<span class="size-scale__note">en dessous du barème</span>'
          : '';
    return `<div class="size-scale" aria-hidden="true">${cells.join('')}</div>${note}`;
  }

  /** Conseil « entre deux tailles » ; `suppress` évite un conseil contredit par un autre. */
  function nearHint(fit, label, suppress) {
    const next = fit.chart[fit.index + 1];
    const prev = fit.chart[fit.index - 1];
    if (fit.near && fit.near === suppress) return null;
    if (fit.near === 'up' && next) {
      return `Haut de fourchette : la taille au-dessus (${escapeHtml(label(next.label))}) peut être plus confortable selon la coupe.`;
    }
    if (fit.near === 'down' && prev) {
      return `Bas de fourchette : la taille en dessous (${escapeHtml(label(prev.label))}) peut aussi aller, surtout en coupe ample.`;
    }
    return null;
  }

  function basisHtml(rec, label) {
    return rec.all
      .map((c) => {
        const text = `${escapeHtml(c.label)} ${fmt(c.value, 1)} cm → ${escapeHtml(label(c.fit.size.label))}`;
        return c === rec.limiting && rec.all.length > 1 ? `<strong>${text}</strong>` : text;
      })
      .join(' · ');
  }

  function trendHtml(current, { before, beforeDate, after, afterLabel }) {
    const parts = [];
    const b = before && before.find((r) => r.id === current.id);
    const a = after && after.find((r) => r.id === current.id);
    if (b) parts.push(`${fmtDate(beforeDate)} : <strong>${escapeHtml(b.size)}</strong>`);
    parts.push(`aujourd'hui : <strong>${escapeHtml(current.size)}</strong>`);
    if (a) parts.push(`${afterLabel} : <strong>≈ ${escapeHtml(a.size)}</strong>`);
    return parts.length > 1 ? `<p class="size-card__trend">${parts.join(' → ')}</p>` : '';
  }

  function card(rec, trend) {
    const label = rec.formatLabel || ((l) => l); // ex. jean : FR 54 → W44
    const hints = [nearHint(rec.limiting.fit, label, rec.suppressNear), ...(rec.hints || [])].filter(Boolean);
    return `<div class="card size-card">
      <span class="size-card__garment">${escapeHtml(rec.garment)}</span>
      <div class="size-card__size">${escapeHtml(rec.size)}</div>
      ${rec.alt ? `<p class="size-card__alt">${escapeHtml(rec.alt)}</p>` : ''}
      ${scaleHtml(rec.limiting.fit, label)}
      <p class="size-card__basis">${basisHtml(rec, label)}</p>
      ${hints.map((h) => `<p class="size-card__hint">${h}</p>`).join('')}
      ${trend}
    </div>`;
  }

  function render({ measurements, daily, settings }) {
    const host = document.getElementById('size-cards');
    if (!host) return;
    const latest = measurements[measurements.length - 1];
    const first = measurements[0];
    if (!latest) {
      host.innerHTML = '';
      return;
    }
    const opts = { sex: settings.sex, heightCm: settings.heightCm, rise: settings.rise };
    const now = sizing.recommend(latest, opts);

    const before = first !== latest ? sizing.recommend(first, opts) : null;
    const lastWeight = isFiniteNumber(latest.weight)
      ? latest.weight
      : daily.length
        ? daily[daily.length - 1].weight
        : null;
    const predicted = sizing.predictAtWeight(latest, lastWeight, settings.targetWeight);
    const after = predicted ? sizing.recommend(predicted, opts) : null;

    const trendCtx = { before, beforeDate: first.date, after, afterLabel: `à ${fmt(settings.targetWeight, 0)} kg` };
    host.innerHTML = now.map((rec) => card(rec, trendHtml(rec, trendCtx))).join('');

    const sub = document.getElementById('sizes-sub');
    if (sub) {
      sub.textContent =
        `D'après le relevé du ${fmtDate(latest.date, 'long')}. ` +
        (predicted
          ? `L'estimation à ${fmt(settings.targetWeight, 0)} kg suppose une baisse typique de chaque tour (≈ 1 cm de ventre par kg).`
          : 'Saisis un objectif de poids pour estimer tes tailles futures.');
    }
  }

  SP.ui.sizeCards = { render };
})(window.SP);
