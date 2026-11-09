/**
 * Table journalière unifiée « mode de vie » : une ligne par jour calendaire,
 * avec apport (nutrition), dépense, activité, sommeil, stress et cœur.
 *
 * Le dernier jour de l'export est marqué `partial` (export fait en cours de
 * journée) : il est exclu des moyennes d'apport, de dépense et de pas.
 */
(function (SP) {
  'use strict';

  const { dayKey, startOfDay, mean, isFiniteNumber, DAY_MS } = SP.core.utils;

  const MAIN_SLEEP_MIN = 180; // en dessous : sieste
  const MIN_HR_HOURS = 8; // heures mesurées nécessaires pour estimer la FC de repos

  function groupByDay(list) {
    const map = new Map();
    (list || []).forEach((r) => {
      const k = dayKey(r.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    return map;
  }

  const sum = (list, key) => list.reduce((s, r) => s + (isFiniteNumber(r[key]) ? r[key] : 0), 0);
  const sumOrNull = (list, key) => (list.some((r) => isFiniteNumber(r[key])) ? sum(list, key) : null);

  /** Heure décimale ; les heures avant midi sont décalées de 24 h (coucher à 1 h -> 25). */
  function bedHour(date) {
    const h = date.getHours() + date.getMinutes() / 60;
    return h < 12 ? h + 24 : h;
  }

  const hourOf = (date) => date.getHours() + date.getMinutes() / 60;

  /** Nuit principale de chaque jour de réveil (la plus longue) + minutes de sieste. */
  function sleepByWakeDay(sleeps) {
    const out = new Map();
    groupByDay(sleeps).forEach((list, k) => {
      const main = list.filter((s) => s.durationMin >= MAIN_SLEEP_MIN).sort((a, b) => b.durationMin - a.durationMin)[0] || null;
      const napMin = list.filter((s) => s !== main).reduce((s, x) => s + x.durationMin, 0);
      out.set(k, { main, napMin });
    });
    return out;
  }

  /** Minutes par phase pour chaque nuit (clé = identifiant de la nuit). */
  function stagesBySleep(stages) {
    const map = new Map();
    (stages || []).forEach((s) => {
      if (!map.has(s.sleepId)) map.set(s.sleepId, { awake: 0, light: 0, deep: 0, rem: 0, segments: [] });
      const m = map.get(s.sleepId);
      m[s.stage] += (s.end - s.start) / 60000;
      m.segments.push(s);
    });
    return map;
  }

  /**
   * @param {object} data      tables Samsung normalisées
   * @param {{from: Date, to: Date, partialKey: string}} range
   * @param {Map<string, number>} weightByDay  poids moyen du jour (pesées)
   */
  function build(data, range, weightByDay = new Map()) {
    const by = {
      meals: groupByDay(data.meals),
      expenditure: groupByDay(data.expenditure),
      steps: groupByDay(data.steps),
      activity: groupByDay(data.activity),
      floors: groupByDay(data.floors),
      sessions: groupByDay(data.sessions),
      stress: groupByDay(data.stress),
      heartRate: groupByDay(data.heartRate),
      vitality: groupByDay(data.vitality),
      water: groupByDay(data.water),
    };
    const sleeps = sleepByWakeDay(data.sleeps);
    const stages = stagesBySleep(data.stages);

    const days = [];
    for (let t = startOfDay(range.from).getTime(); t <= range.to.getTime(); t += DAY_MS) {
      const date = startOfDay(new Date(t + DAY_MS / 2)); // robuste aux changements d'heure
      const k = dayKey(date);
      const day = { date, key: k, partial: k === range.partialKey };

      const meals = by.meals.get(k) || [];
      day.mealsCount = meals.length;
      day.kcalIn = meals.length ? sum(meals, 'kcal') : null;
      ['protein', 'carbs', 'fat', 'satFat', 'sugar', 'fiber', 'sodium'].forEach((key) => {
        day[key] = meals.length ? sumOrNull(meals, key) : null;
      });
      // Total nul en fibres / sucres / sodium = nutriment non renseigné dans les aliments saisis
      ['satFat', 'sugar', 'fiber', 'sodium'].forEach((key) => {
        if (day[key] === 0) day[key] = null;
      });
      day.kcalByMeal = {};
      meals.forEach((m) => {
        day.kcalByMeal[m.mealType] = (day.kcalByMeal[m.mealType] || 0) + m.kcal;
      });

      const exp = (by.expenditure.get(k) || [])[0];
      day.rest = exp ? exp.rest : null;
      day.active = exp ? exp.active : null;
      day.tef = exp ? exp.tef : null;
      day.tdee = exp ? exp.rest + exp.active + exp.tef : null;

      const st = (by.steps.get(k) || [])[0];
      day.steps = st ? st.steps : null;
      day.distanceKm = st && isFiniteNumber(st.distance) ? st.distance / 1000 : null;
      const act = (by.activity.get(k) || [])[0];
      day.activeMin = act ? act.activeMin : null;
      const fl = (by.floors.get(k) || [])[0];
      day.floors = fl ? fl.value : null;

      const sessions = by.sessions.get(k) || [];
      day.sessionsCount = sessions.length;
      day.sessionsMin = sessions.length ? sum(sessions, 'durationMin') : null;
      day.exerciseKcal = sessions.length ? sum(sessions, 'kcal') : null;

      const sl = sleeps.get(k);
      const main = sl && sl.main;
      day.sleepMin = main ? main.durationMin : null;
      day.napMin = sl ? sl.napMin : null;
      day.sleepScore = main ? main.score : null;
      day.sleepEff = main ? main.efficiency : null;
      day.sleepMental = main ? main.mental : null;
      day.sleepPhysical = main ? main.physical : null;
      day.bedtime = main ? bedHour(main.start) : null;
      day.waketime = main ? hourOf(main.end) : null;
      day.sleepStart = main ? main.start : null;
      day.sleepEnd = main ? main.end : null;
      day.stages = main && stages.get(main.id) ? stages.get(main.id) : null;

      // Stress : on écarte les heures sans mesure (score et max à 0)
      const stress = (by.stress.get(k) || []).filter((s) => !(s.score === 0 && !s.max));
      day.stressAvg = stress.length ? mean(stress.map((s) => s.score)) : null;
      day.stressMax = stress.length ? Math.max(...stress.map((s) => s.max || s.score)) : null;

      const hr = by.heartRate.get(k) || [];
      day.hrAvg = hr.length ? mean(hr.map((h) => h.hr)) : null;
      day.hrRest = hr.length >= MIN_HR_HOURS ? Math.min(...hr.map((h) => h.hr)) : null;

      const vit = (by.vitality.get(k) || [])[0];
      day.vitality = vit ? vit.total : null;
      day.sleepHr = vit ? vit.sleepHr : null;
      day.sleepHrv = vit ? vit.sleepHrv : null;

      const water = by.water.get(k) || [];
      day.waterMl = water.length ? sum(water, 'value') : null;

      day.weight = weightByDay.has(k) ? weightByDay.get(k) : null;
      days.push(day);
    }
    return days;
  }

  /** Jours exploitables pour une métrique (hors jour partiel pour les cumuls journaliers). */
  function usable(days, key, { allowPartial = false } = {}) {
    return days.filter((d) => isFiniteNumber(d[key]) && (allowPartial || !d.partial));
  }

  SP.analysis.lifestyle = SP.analysis.lifestyle || {};
  SP.analysis.lifestyle.daily = { build, usable, bedHour, MAIN_SLEEP_MIN };
})(window.SP);
