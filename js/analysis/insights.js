/**
 * Génère des phrases d'analyse lisibles à partir des données.
 * Chaque insight : { tone: 'good'|'warn'|'bad'|'info', icon, html }.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, daysBetween, isFiniteNumber, first, last } = SP.core.utils;
  const { trends, metrics, milestones } = SP.analysis;
  const { ENERGY, RATE_WINDOW_DAYS } = SP.analysis.projection;

  function build({ composition, daily, measurements, settings, projection, records, quality, lifestyle }) {
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

    pushRecentComposition(push, daily);
    pushStagnation(push, daily);
    pushRate(push, daily);
    pushNextMilestone(push, records);
    pushQuality(push, quality, settings);
    if (lifestyle) pushLifestyle(push, lifestyle);

    return out;
  }

  /**
   * Analyses croisées avec l'export santé (nutrition, activité, sommeil).
   * Formulées comme des constats : aucune relation de cause n'est affirmée.
   */
  function pushLifestyle(push, ls) {
    const e = ls.energy;
    if (isFiniteNumber(e.meanBalance) && isFiniteNumber(e.impliedBalance) && e.counts.complete >= 7) {
      const gap = e.impliedBalance - e.meanBalance;
      const coherent = Math.abs(gap) < 250;
      push(
        coherent ? 'good' : 'info',
        '⚖',
        `Bilan énergétique : <strong>${fmtDelta(e.meanBalance, 0)} kcal/j</strong> d'après tes repas saisis et la montre, ` +
          `<strong>${fmtDelta(e.impliedBalance, 0)} kcal/j</strong> d'après ta courbe de poids. ` +
          (coherent
            ? 'Les deux concordent : ta saisie et l’estimation de la montre sont cohérentes.'
            : gap > 0
              ? 'Ta perte réelle est moins rapide que prévu : une partie des repas n’est peut-être pas saisie, ou la montre surestime ta dépense.'
              : 'Ta perte réelle est plus rapide que prévu : la montre sous-estime peut-être ta dépense, ou une partie de la perte est de l’eau.')
      );
    }
    const n = ls.nutrition;
    if (n && isFiniteNumber(n.proteinPerKgMean)) {
      const low = n.proteinPerKgMean < 1.6;
      push(
        low ? 'warn' : 'good',
        '🥩',
        `Protéines : <strong>${fmt(n.proteinPerKgMean, 2)} g/kg</strong> de poids par jour en moyenne (${fmt(n.macros.protein, 0)} g). ` +
          (low
            ? 'En perte de poids, 1,6 à 2,2 g/kg aident à préserver le muscle.'
            : 'Dans la zone recommandée en perte de poids (1,6 à 2,2 g/kg).')
      );
    }
    const a = ls.activity;
    if (isFiniteNumber(a.stepsMean) && a.stepDays >= 7) {
      push(
        a.stepsMean >= a.stepGoal ? 'good' : 'info',
        '👟',
        `<strong>${fmt(a.stepsMean, 0)} pas/jour</strong> en moyenne, objectif de ${fmt(a.stepGoal, 0)} atteint ${a.goalDays} jours sur ${a.stepDays}` +
          (a.sessionsCount ? ` · ${a.sessionsCount} séances (${fmt(a.sessionsMinutes / 60, 1)} h).` : '.')
      );
    }
    const sl = ls.sleep;
    if (sl && sl.nights >= 5) {
      const h = Math.floor(sl.durationMean / 60);
      const m = Math.round(sl.durationMean - h * 60);
      push(
        sl.durationMean >= 420 ? 'good' : 'warn',
        '☾',
        `Sommeil : <strong>${h} h ${String(m).padStart(2, '0')}</strong> par nuit en moyenne sur ${sl.nights} nuits, ` +
          `${sl.shortNights} sous 7 h` +
          (isFiniteNumber(sl.bedtimeSd) ? `, heure de coucher variable de ± ${fmt(sl.bedtimeSd * 60, 0)} min.` : '.')
      );
    }
    const c = ls.correlations;
    const top = c && c.withWeight.find((w) => Math.abs(w.r) >= 0.3);
    if (top) {
      push(
        'info',
        '↔',
        `Lien le plus marqué avec la variation de poids du lendemain : <strong>${top.variable.label.toLowerCase()}</strong> ` +
          `(r = ${fmtDelta(top.r, 2)} sur ${top.n} jours) : ${top.r > 0 ? 'quand il augmente, le poids du lendemain a tendance à monter' : 'quand il augmente, le poids du lendemain a tendance à baisser'}. ` +
          `Effet le plus souvent lié à l'eau et au contenu digestif, pas à la graisse.`
      );
    }
  }

  /** Part de masse maigre dans la perte récente : alerte perte musculaire. */
  function pushRecentComposition(push, daily) {
    const rc = milestones.recentComposition(daily);
    if (!rc || !(rc.dWeight <= -0.8) || !isFiniteNumber(rc.leanShare)) return;
    const pct = Math.round(rc.leanShare * 100);
    const tone = pct >= 40 ? 'bad' : pct >= 30 ? 'warn' : 'good';
    const advice =
      pct >= 30
        ? ` Pour préserver le muscle : environ 1,6 g de protéines par kg de poids et par jour, et de la musculation 2 à 3 fois par semaine.`
        : '';
    push(
      tone,
      '💪',
      `Sur les ${rc.windowDays} derniers jours, <strong>${pct} % de la perte vient de la masse maigre</strong> ` +
        `(${fmtDelta(rc.dLean, 1)} kg, dont ${fmtDelta(rc.dMuscle, 1)} kg de muscle selon la balance, eau comprise).` +
        (pct >= 40 ? ' C\'est au-dessus du seuil d\'alerte de 40 %.' : pct >= 30 ? ' C\'est proche du seuil d\'alerte de 40 %.' : '') +
        advice
    );
  }

  /** Stagnation : pas de nouveau plus bas depuis N jours, rétention d'eau ou vrai plateau. */
  function pushStagnation(push, daily) {
    const s = milestones.stagnation(daily);
    if (!s || !s.stalled) return;
    // Pas de diagnostic « rétention d'eau » : le % d'eau de la balance monte
    // mécaniquement quand le % de gras baisse, ce n'est pas un indicateur fiable.
    let detail = ' Une stagnation de 1 à 2 semaines est fréquente (eau, transit, cycle de sommeil) et se débloque souvent seule.';
    if (isFiniteNumber(s.fatDelta)) {
      detail +=
        s.fatDelta < -0.2
          ? ` La balance indique que la masse grasse baisse encore (${fmtDelta(s.fatDelta, 1)} kg) : plutôt bon signe.`
          : ` La masse grasse ne baisse plus non plus (${fmtDelta(s.fatDelta, 1)} kg selon la balance) : si ça dure au-delà de 2 semaines, l'apport ou l'activité est à réajuster.`;
    }
    push(
      'warn',
      '⏸',
      `<strong>Aucun nouveau plus bas depuis ${s.days} jours</strong> (moyenne 7 j, plus bas ${fmt(s.lowest, 1)} kg le ${fmtDate(s.since)}).` + detail
    );
  }

  /** Rythme relatif en % du poids par semaine. */
  function pushRate(push, daily) {
    const rows = milestones.relativeRate(daily, SP.analysis.projection.RATE_WINDOW_DAYS);
    if (!rows.length) return;
    const pct = rows[rows.length - 1].pct;
    const tone = pct >= 0.5 && pct <= 1 ? 'good' : pct > 1 ? 'warn' : 'info';
    const comment =
      pct > 1
        ? 'un peu au-dessus de la zone conseillée (0,5 à 1 %) : surveille la perte de muscle.'
        : pct >= 0.5
          ? 'dans la zone conseillée (0,5 à 1 %).'
          : pct > 0
            ? 'sous la zone habituelle (0,5 à 1 %) : perte lente.'
            : 'pas de perte sur la période récente.';
    push(tone, '%', `Rythme actuel : <strong>${fmt(pct, 2)} % du poids par semaine</strong>, ${comment}`);
  }

  /** Prochain palier ou catégorie d'IMC. */
  function pushNextMilestone(push, records) {
    if (!records) return;
    const next = [...records.paliers.map((p) => ({ ...p, label: `${fmt(p.weight, 0)} kg` })), ...records.bmi.map((b) => ({ ...b, label: `IMC < ${fmt(b.value, 0)} (${fmt(b.weight, 1)} kg)` }))]
      .filter((m) => !m.date && !m.touched && m.projected)
      .sort((a, b) => a.projected.date - b.projected.date)[0];
    if (!next) return;
    push('info', '🏁', `Prochain jalon : <strong>${next.label}</strong>, prévu vers le ${fmtDate(next.projected.date, 'long')}.`);
  }

  /** Mesures douteuses détectées. */
  function pushQuality(push, quality, settings) {
    if (!quality || !quality.flags.length) return;
    const sessions = new Map();
    quality.flags.forEach((f) => sessions.set(f.date.getTime(), (sessions.get(f.date.getTime()) || 0) + 1));
    const worst = [...sessions.entries()].sort((a, b) => b[1] - a[1])[0];
    push(
      'warn',
      '⚠',
      `<strong>${quality.flags.length} mensuration(s) douteuse(s)</strong> (écart à la tendance supérieur à l'erreur normale d'un mètre ruban)` +
        (worst[1] >= 3 ? `, dont ${worst[1]} sur le relevé du ${fmtDate(new Date(worst[0]), 'long')}, probablement à refaire` : '') +
        `. ${settings.excludeOutliers ? 'Elles sont exclues des graphiques.' : 'Elles sont incluses dans les graphiques.'}`
    );
  }

  SP.analysis.insights = { build };
})(window.SP);
