/**
 * Génère des phrases d'analyse lisibles à partir des données.
 * Chaque insight : { tone: 'good'|'warn'|'bad'|'info', icon, html }.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, daysBetween, isFiniteNumber, first, last } = SP.core.utils;
  const { trends, metrics } = SP.analysis;
  const { ENERGY, RATE_WINDOW_DAYS } = SP.analysis.projection;

  function build({ composition, daily, measurements, settings, projection }) {
    const out = [];
    const push = (tone, icon, html) => out.push({ tone, icon, html });

    // --- Poids global
    const w0 = first(composition, 'weight');
    const w1 = last(composition, 'weight');
    if (w0 && w1 && w0 !== w1) {
      const d = w1.weight - w0.weight;
      const days = Math.max(1, daysBetween(w0.date, w1.date));
      const pct = (d / w0.weight) * 100;
      push(
        d < 0 ? 'good' : 'warn',
        d < 0 ? '↓' : '↑',
        `<strong>${fmtDelta(d, 1)} kg</strong> en ${days} jours (${fmtDelta(pct, 1)} %), ` +
          `de ${fmt(w0.weight, 1)} à ${fmt(w1.weight, 1)} kg, soit ${fmtDelta((d / days) * 7, 2)} kg/semaine en moyenne.`
      );
    }

    // --- Rythme récent vs global
    const global = trends.trend(daily, 'weight');
    const recent = trends.recentTrend(daily, 'weight', 14);
    if (global && recent && daily.length > 6) {
      const faster = Math.abs(recent.slopePerWeek) > Math.abs(global.slopePerWeek);
      push(
        'info',
        '≈',
        `Tendance des 14 derniers jours : <strong>${fmtDelta(recent.slopePerWeek, 2)} kg/sem.</strong> ` +
          `(tendance globale ${fmtDelta(global.slopePerWeek, 2)} kg/sem.) — le rythme ${faster ? "s'accélère" : 'ralentit'}.`
      );
    }

    // --- Composition de la perte
    const br = metrics.changeBreakdown(composition);
    if (br && br.dWeight < 0 && isFiniteNumber(br.fatShare)) {
      const fatPct = Math.round(br.fatShare * 100);
      const tone = fatPct >= 60 ? 'good' : fatPct >= 40 ? 'warn' : 'bad';
      push(
        tone,
        '◐',
        `Sur ${fmtDelta(br.dWeight, 1)} kg perdus (pesées complètes), <strong>${fmtDelta(br.dFat, 1)} kg de gras</strong> ` +
          `(${fatPct} %) et ${fmtDelta(br.dLean, 1)} kg de masse maigre, dont ${fmtDelta(br.dWater, 1)} kg d'eau et ` +
          `${fmtDelta(br.dMuscle, 1)} kg de muscle.`
      );
      // Énergie réellement perdue : gras (9 440 kcal/kg) + masse maigre (1 816 kcal/kg)
      const kcal = -br.dFat * ENERGY.fatKcalPerKg - br.dLean * ENERGY.leanKcalPerKg;
      const days = Math.max(1, daysBetween(br.from.date, br.to.date));
      if (kcal > 0) {
        push(
          'info',
          '🔥',
          `L'énergie perdue (gras + masse maigre) représente environ <strong>${fmt(kcal, 0)} kcal</strong>, ` +
            `soit un déficit moyen d'environ ${fmt(kcal / days, 0)} kcal/jour sur la période.`
        );
      }
    }

    // --- Graisse viscérale
    const v0 = first(composition, 'visceral');
    const v1 = last(composition, 'visceral');
    if (v0 && v1) {
      const tone = v1.visceral <= 9 ? 'good' : v1.visceral <= 14 ? 'warn' : 'bad';
      push(
        tone,
        '◎',
        `Graisse viscérale : <strong>${fmt(v1.visceral, 0)}</strong> (départ ${fmt(v0.visceral, 0)}). ` +
          `Repère : ≤ 9 normal, 10-14 élevé, ≥ 15 très élevé.`
      );
    }

    // --- Projection (bilan énergétique, non linéaire)
    if (projection) {
      const halfLife = Math.round(projection.tau * Math.LN2);
      push(
        'info',
        '⚖',
        `Déficit actuel estimé : <strong>≈ ${fmt(projection.deficit, 0)} kcal/jour</strong> (rythme des ${RATE_WINDOW_DAYS} derniers jours). ` +
          `Chaque kg perdu réduit ta dépense d'environ ${fmt(projection.expenditureDropPerKg, 0)} kcal/jour ` +
          `(dont ≈ ${fmt(projection.bmrSlope, 0)} via le métabolisme de base${projection.bmrMeasured ? ' mesuré par ta balance' : ''}) : ` +
          `à apport constant, la perte ralentit et la moitié du chemin restant vers l'équilibre théorique ` +
          `(≈ ${fmt(projection.plateau, 0)} kg) serait parcourue en ≈ ${halfLife} jours.`
      );
    }
    if (isFiniteNumber(settings.targetWeight) && w1) {
      const target = projection ? projection.dateFor(settings.targetWeight) : null;
      if (target) {
        const linearDays = projection.linearDaysTo(settings.targetWeight);
        const range = projection.rangeFor(settings.targetWeight);
        const rangeText = range.early
          ? ` Fourchette probable : du ${fmtDate(range.early.date, 'long')} ` +
            (range.late ? `au ${fmtDate(range.late.date, 'long')}.` : `à jamais, si le rythme faiblit trop.`)
          : '';
        push(
          'info',
          '⚑',
          `À apport constant, objectif de <strong>${fmt(settings.targetWeight, 1)} kg</strong> atteint vers le ` +
            `<strong>${fmtDate(target.date, 'long')}</strong> (≈ ${Math.round(target.days)} jours)` +
            (linearDays
              ? `, soit ${Math.round(target.days - linearDays)} jours de plus qu'en gardant le rythme actuel sans ralentissement.`
              : '.') +
            rangeText
        );
      } else if (projection && settings.targetWeight < projection.w0) {
        push(
          'warn',
          '⚑',
          `À apport constant, le poids se stabiliserait vers ${fmt(projection.plateau, 0)} kg, au-dessus de l'objectif de ` +
            `${fmt(settings.targetWeight, 1)} kg : il faudra réduire encore l'apport ou augmenter l'activité.`
        );
      } else if (!projection) {
        push('warn', '⚑', `La tendance actuelle ne mène pas à l'objectif de ${fmt(settings.targetWeight, 1)} kg.`);
      }
    }

    // --- Mensurations
    if (measurements.length >= 2) {
      const a = measurements[0];
      const b = measurements[measurements.length - 1];
      const zones = SP.parsers.measurements.CM_ZONES.map((z) => ({ ...z, d: b[z.key] - a[z.key] })).filter((z) =>
        isFiniteNumber(z.d)
      );
      const total = zones.filter((z) => z.d < 0).reduce((s, z) => s + z.d, 0);
      const best = zones.slice().sort((x, y) => x.d - y.d)[0];
      if (best) {
        push(
          best.d < 0 ? 'good' : 'warn',
          '📏',
          `<strong>${fmtDelta(total, 1)} cm</strong> cumulés sur les zones en baisse. Plus forte baisse : ` +
            `<strong>${best.label.toLowerCase()} ${fmtDelta(best.d, 1)} cm</strong> (${fmtDate(a.date)} → ${fmtDate(b.date)}).`
        );
      }
      if (isFiniteNumber(b.whtr)) {
        const tone = b.whtr < 0.5 ? 'good' : b.whtr < 0.6 ? 'warn' : 'bad';
        push(
          tone,
          '⌀',
          `Rapport tour de taille / taille : <strong>${fmt(b.whtr, 2)}</strong> (départ ${fmt(a.whtr, 2)}). ` +
            `Cible santé : &lt; 0,50.`
        );
      }
      if (isFiniteNumber(b.navyFat)) {
        const scale = last(composition, 'fatPct');
        push(
          'info',
          '≋',
          `Estimation US Navy (cou + ${settings.sex === 'female' ? 'taille + hanches' : 'abdomen'}) : ` +
            `<strong>${fmt(b.navyFat, 1)} % de graisse</strong>` +
            (scale ? `, à comparer aux ${fmt(scale.fatPct, 1)} % de la balance.` : '.')
        );
      }
    }

    // --- Régularité
    const adh = trends.adherence(daily);
    if (adh && adh.span > 3) {
      push(
        adh.rate >= 0.8 ? 'good' : 'warn',
        '✓',
        `Assiduité : <strong>${adh.days} pesées sur ${adh.span} jours</strong> (${Math.round(adh.rate * 100)} %), ` +
          `meilleure série ${adh.bestStreak} jours consécutifs.`
      );
    }

    return out;
  }

  SP.analysis.insights = { build };
})(window.SP);
