/**
 * Carte « Lecture du jour » : la dernière pesée située dans la fluctuation
 * normale autour de la tendance, avec une interprétation et un repère pour demain.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, clamp } = SP.core.utils;

  /** Échelle de −2,5σ à +2,5σ autour de la tendance → position en %. */
  const SPAN_SD = 2.5;
  const toPct = (z) => ((clamp(z, -SPAN_SD, SPAN_SD) + SPAN_SD) / (2 * SPAN_SD)) * 100;

  function verdict(r) {
    const strength = r.level === 'strong' ? 'Nettement' : 'Un peu';
    if (r.level === 'normal') {
      return `Dans ta fluctuation normale (±${fmt(r.sd, 2)} kg autour de la tendance) : rien à interpréter, c'est la tendance qui compte.`;
    }
    if (r.direction === 'below') {
      return (
        `${strength} plus bas que ta tendance. Une baisse aussi rapide vient le plus souvent de l'eau ou du transit ` +
        `(repas léger, sport, chaleur) : ne t'attends pas à la garder entièrement demain. Ta tendance réelle est d'environ ${fmt(r.trend, 1)} kg.`
      );
    }
    return (
      `${strength} plus haut que ta tendance. Ce n'est pas de la graisse : en prendre 1 kg demande un excédent de plusieurs milliers de kcal. ` +
      `Le plus souvent : repas salé ou riche en glucides, transit, sport intense, manque de sommeil. Ça redescend en général en 1 à 3 jours.`
    );
  }

  function render(host, reading) {
    if (!host) return;
    const card = host.closest('.card');
    if (!reading) {
      if (card) card.classList.add('hidden');
      return;
    }
    if (card) card.classList.remove('hidden');
    const r = reading;
    const tone = r.level === 'normal' ? 'delta--flat' : r.direction === 'below' ? 'delta--good' : 'delta--bad';
    const prev = r.previous
      ? `<li>${fmtDelta(r.weight - r.previous.weight, 2)} kg par rapport à la pesée précédente (${fmtDate(r.previous.date)}${
          r.previous.gap > 1 ? `, ${r.previous.gap} jours avant` : ''
        })</li>`
      : '';
    host.innerHTML = `
      <div class="reading__main">
        <span class="reading__value">${fmt(r.weight, 1)}<span class="kpi__unit">kg</span></span>
        <span class="delta ${tone}">${fmtDelta(r.deviation, 2)} kg vs tendance (${fmt(r.trend, 1)} kg)</span>
        <span class="kpi__meta">Pesée du ${fmtDate(r.date, 'weekday')}</span>
      </div>
      <div class="reading-scale" role="img" aria-label="Position de la pesée par rapport à la fluctuation normale">
        <span class="reading-scale__normal" style="left:${toPct(-1)}%;right:${100 - toPct(1)}%"></span>
        <span class="reading-scale__center" style="left:${toPct(0)}%"></span>
        <span class="reading-scale__marker" style="left:${toPct(r.z)}%"></span>
      </div>
      <div class="reading-scale__labels"><span>${fmt(r.trend - SPAN_SD * r.sd, 1)}</span><span>zone normale</span><span>${fmt(r.trend + SPAN_SD * r.sd, 1)}</span></div>
      <p class="reading__verdict">${verdict(r)}</p>
      <ul class="reading__facts">
        ${prev}
        <li>Demain, une pesée entre <strong>${fmt(r.tomorrow.low, 1)} et ${fmt(r.tomorrow.high, 1)} kg</strong> serait normale.</li>
        <li>Tendance des ${r.windowDays} derniers jours : ${fmtDelta(r.slopePerWeek, 2)} kg/semaine (calculée sans la pesée du jour).</li>
      </ul>`;
  }

  SP.ui.dailyReadingCard = { render };
})(window.SP);
