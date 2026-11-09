/**
 * Activité : pas, minutes actives, séances par type, VO2max.
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber, weekStart, dayKey } = SP.core.utils;

  const STEP_GOAL = 10000;
  const MAX_TYPES = 5; // au-delà : regroupés dans « Autres »

  /**
   * @param {object[]} days      table journalière
   * @param {object[]} sessions  séances de la période
   */
  function analyze(days, sessions) {
    const full = days.filter((d) => !d.partial);
    const stepDays = full.filter((d) => isFiniteNumber(d.steps));
    const list = sessions || [];

    // Types les plus pratiqués (en minutes)
    const minutesByType = new Map();
    list.forEach((s) => minutesByType.set(s.typeLabel, (minutesByType.get(s.typeLabel) || 0) + s.durationMin));
    const ranked = [...minutesByType.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
    const types = ranked.slice(0, MAX_TYPES);
    const groupOf = (label) => (types.includes(label) ? label : 'Autres');
    if (ranked.length > MAX_TYPES) types.push('Autres');

    // Minutes par semaine et par type
    const weeks = new Map();
    list.forEach((s) => {
      const k = dayKey(weekStart(s.date));
      if (!weeks.has(k)) weeks.set(k, { date: weekStart(s.date), minutes: {}, kcal: 0, count: 0 });
      const w = weeks.get(k);
      const g = groupOf(s.typeLabel);
      w.minutes[g] = (w.minutes[g] || 0) + s.durationMin;
      w.kcal += isFiniteNumber(s.kcal) ? s.kcal : 0;
      w.count++;
    });

    const weekday = Array.from({ length: 7 }, (_, i) => {
      const l = stepDays.filter((d) => (d.date.getDay() + 6) % 7 === i);
      return { index: i, steps: mean(l.map((d) => d.steps)), n: l.length };
    });

    const best = stepDays.reduce((b, d) => (!b || d.steps > b.steps ? d : b), null);

    return {
      stepGoal: STEP_GOAL,
      stepsMean: mean(stepDays.map((d) => d.steps)),
      stepDays: stepDays.length,
      goalDays: stepDays.filter((d) => d.steps >= STEP_GOAL).length,
      bestDay: best,
      activeMinMean: mean(full.map((d) => d.activeMin)),
      distanceMean: mean(full.map((d) => d.distanceKm)),
      floorsMean: mean(full.map((d) => d.floors)),
      types,
      weeks: [...weeks.values()].sort((a, b) => a.date - b.date),
      weekday,
      sessionsCount: list.length,
      sessionsMinutes: list.reduce((s, x) => s + x.durationMin, 0),
      vo2: list.filter((s) => isFiniteNumber(s.vo2max)).map((s) => ({ date: s.date, value: s.vo2max })),
      recent: list.slice(-12).reverse(),
    };
  }

  /**
   * Mouvement spontané : pas hors séances, semaine par semaine, à côté de
   * l'apport moyen de la semaine. En régime, le corps a tendance à réduire ce
   * mouvement sans qu'on s'en rende compte : un lien positif (moins manger,
   * moins bouger) signale cette compensation. Le bilan n'est pas utilisé ici :
   * il contient déjà la dépense due aux pas (lien mécanique).
   */
  function spontaneous(days, sessions) {
    const sessionSteps = new Map();
    (sessions || []).forEach((s) => {
      if (!isFiniteNumber(s.steps)) return;
      const k = dayKey(s.date);
      sessionSteps.set(k, (sessionSteps.get(k) || 0) + s.steps);
    });
    const weeks = new Map();
    days.forEach((d) => {
      if (d.partial || !isFiniteNumber(d.steps)) return;
      const k = dayKey(weekStart(d.date));
      if (!weeks.has(k)) weeks.set(k, { date: weekStart(d.date), steps: [], intake: [] });
      const w = weeks.get(k);
      w.steps.push(Math.max(0, d.steps - (sessionSteps.get(d.key) || 0)));
      if (d.logStatus === 'complete') w.intake.push(d.kcalIn);
    });
    const list = [...weeks.values()]
      .filter((w) => w.steps.length >= 4)
      .sort((a, b) => a.date - b.date)
      .map((w) => ({ date: w.date, steps: mean(w.steps), intake: w.intake.length >= 3 ? mean(w.intake) : null }));
    if (list.length < 3) return null;
    const pairs = list.filter((w) => isFiniteNumber(w.intake)).map((w) => [w.intake, w.steps]);
    const half = Math.floor(list.length / 2);
    return {
      weeks: list,
      r: pairs.length >= 6 ? SP.analysis.lifestyle.correlations.pearson(pairs) : null,
      nPairs: pairs.length,
      firstHalf: mean(list.slice(0, half).map((w) => w.steps)),
      secondHalf: mean(list.slice(half).map((w) => w.steps)),
    };
  }

  SP.analysis.lifestyle.activity = { analyze, spontaneous, STEP_GOAL };
})(window.SP);
