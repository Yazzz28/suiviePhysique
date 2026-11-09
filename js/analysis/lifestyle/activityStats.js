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

  SP.analysis.lifestyle.activity = { analyze, STEP_GOAL };
})(window.SP);
