/**
 * Rythmes de vie : horaires des repas, lien repas tardifs → sommeil, nuits
 * courtes → lendemain, décalage du week-end, stress → alimentation.
 *
 * Toutes les comparaisons affichent le nombre de jours de chaque groupe ;
 * en dessous de MIN_GROUP jours, le résultat est signalé comme non concluant.
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber, dayKey } = SP.core.utils;

  const MIN_GROUP = 5;
  const LATE_MEAL_HOUR = 21;
  const SHORT_NIGHT_MIN = 390; // 6 h 30
  const GOOD_NIGHT_MIN = 420; // 7 h
  const MIN_MEAL_KCAL = 50; // en dessous : boisson, condiment… pas un repas
  const SNACK_TYPES = [100004, 100005, 100006];

  const hourOf = (d) => d.getHours() + d.getMinutes() / 60;

  /** Groupe comparatif { n, values…, enough } */
  function group(list, fields) {
    const out = { n: list.length, enough: list.length >= MIN_GROUP };
    Object.entries(fields).forEach(([k, f]) => {
      out[k] = mean(list.map(f));
    });
    return out;
  }

  /**
   * @param {object[]} days   table journalière de la période (jours classés)
   * @param {object[]} meals  repas de la période
   */
  function analyze(days, meals) {
    // Premier et dernier repas de chaque jour
    const mealTimes = new Map();
    (meals || []).forEach((m) => {
      if (m.kcal < MIN_MEAL_KCAL) return;
      const k = dayKey(m.date);
      const h = hourOf(m.date);
      const cur = mealTimes.get(k) || { first: h, last: h };
      cur.first = Math.min(cur.first, h);
      cur.last = Math.max(cur.last, h);
      mealTimes.set(k, cur);
    });
    const windows = days
      .filter((d) => !d.partial && mealTimes.has(d.key) && d.logStatus === 'complete')
      .map((d) => ({ date: d.date, ...mealTimes.get(d.key), hours: mealTimes.get(d.key).last - mealTimes.get(d.key).first }));

    // Dernier repas (jour J) → nuit suivante (rattachée au jour J+1)
    const late = [];
    const early = [];
    days.forEach((d, i) => {
      const t = mealTimes.get(d.key);
      const next = days[i + 1];
      if (!t || !next || !isFiniteNumber(next.sleepScore)) return;
      (t.last >= LATE_MEAL_HOUR ? late : early).push(next);
    });
    const sleepFields = { score: (d) => d.sleepScore, minutes: (d) => d.sleepMin };

    // Nuit (rattachée au jour du réveil) → ce jour-là
    const shortNights = days.filter((d) => !d.partial && isFiniteNumber(d.sleepMin) && d.sleepMin < SHORT_NIGHT_MIN);
    const goodNights = days.filter((d) => !d.partial && isFiniteNumber(d.sleepMin) && d.sleepMin >= GOOD_NIGHT_MIN);
    const nextDayFields = {
      kcal: (d) => (d.logStatus === 'complete' ? d.kcalIn : null),
      steps: (d) => d.steps,
      stress: (d) => d.stressAvg,
    };

    // Décalage du week-end : milieu de sommeil (heures) des nuits de semaine vs week-end
    const mid = (d) => {
      const wake = d.waketime < d.bedtime - 12 ? d.waketime + 24 : d.waketime;
      return (d.bedtime + wake) / 2;
    };
    const nights = days.filter((d) => isFiniteNumber(d.bedtime) && isFiniteNumber(d.waketime));
    const weekendNights = nights.filter((d) => [0, 6].includes(d.date.getDay())); // réveil samedi / dimanche
    const weekNights = nights.filter((d) => ![0, 6].includes(d.date.getDay()));
    const jetlag =
      weekendNights.length >= 2 && weekNights.length >= 3
        ? { hours: mean(weekendNights.map(mid)) - mean(weekNights.map(mid)), nWeek: weekNights.length, nWeekend: weekendNights.length }
        : null;

    // Stress du jour (tiers bas / haut) → alimentation
    const stressDays = days.filter((d) => !d.partial && isFiniteNumber(d.stressAvg) && d.logStatus === 'complete');
    let stress = null;
    if (stressDays.length >= 2 * MIN_GROUP) {
      const sorted = [...stressDays].sort((a, b) => a.stressAvg - b.stressAvg);
      const third = Math.floor(sorted.length / 3);
      const fields = {
        stress: (d) => d.stressAvg,
        kcal: (d) => d.kcalIn,
        snacks: (d) => SNACK_TYPES.reduce((s, t) => s + (d.kcalByMeal[t] || 0), 0),
        lateShare: (d) => (mealTimes.has(d.key) && mealTimes.get(d.key).last >= LATE_MEAL_HOUR ? 1 : 0),
      };
      stress = { low: group(sorted.slice(0, third), fields), high: group(sorted.slice(-third), fields) };
    }

    return {
      windows,
      windowMean: mean(windows.map((w) => w.hours)),
      firstMean: mean(windows.map((w) => w.first)),
      lastMean: mean(windows.map((w) => w.last)),
      lateMeal: { late: group(late, sleepFields), early: group(early, sleepFields), hour: LATE_MEAL_HOUR },
      nights: { short: group(shortNights, nextDayFields), good: group(goodNights, nextDayFields) },
      jetlag,
      stress,
      minGroup: MIN_GROUP,
    };
  }

  SP.analysis.lifestyle.rhythms = { analyze, MIN_GROUP, LATE_MEAL_HOUR };
})(window.SP);
