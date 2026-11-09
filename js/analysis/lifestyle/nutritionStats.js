/**
 * Statistiques nutritionnelles sur les jours de saisie complète
 * (voir energyBalance.js pour la classification des jours).
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber } = SP.core.utils;
  const { MEAL_TYPES } = SP.parsers.samsung.sources;

  const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };
  const MEAL_ORDER = [100001, 100004, 100002, 100005, 100003, 100006];

  function normalizeName(name) {
    return String(name).replace(/\s+/g, ' ').trim();
  }

  /**
   * @param {object[]} days   jours classés (logStatus) par energy.analyze
   * @param {object[]} foods  aliments saisis dans la période
   * @param {number|null} refWeight  poids de référence (kg) pour les g/kg
   */
  function analyze(days, foods, refWeight) {
    const complete = days.filter((d) => d.logStatus === 'complete');
    if (!complete.length) return null;
    const avg = (key) => mean(complete.map((d) => d[key]));

    const macros = { protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') };
    const macroKcal = Object.fromEntries(Object.entries(macros).map(([k, g]) => [k, isFiniteNumber(g) ? g * KCAL_PER_G[k] : 0]));
    const macroTotal = macroKcal.protein + macroKcal.carbs + macroKcal.fat;
    const energyShare = Object.fromEntries(Object.entries(macroKcal).map(([k, v]) => [k, macroTotal ? (v / macroTotal) * 100 : null]));

    // Protéines en g/kg, jour par jour (poids du jour, sinon poids de référence)
    const proteinPerKg = complete
      .filter((d) => isFiniteNumber(d.protein))
      .map((d) => {
        const w = isFiniteNumber(d.weight) ? d.weight : refWeight;
        return { date: d.date, value: isFiniteNumber(w) ? d.protein / w : null };
      })
      .filter((p) => isFiniteNumber(p.value));

    // kcal moyennes par repas (sur les jours complets)
    const meals = MEAL_ORDER.map((type) => {
      const total = complete.reduce((s, d) => s + (d.kcalByMeal[type] || 0), 0);
      const daysWith = complete.filter((d) => d.kcalByMeal[type]).length;
      return { type, label: MEAL_TYPES[type], perDay: total / complete.length, frequency: daysWith / complete.length };
    }).filter((m) => m.perDay > 0);

    // Jour de la semaine (lundi = 0)
    const weekday = Array.from({ length: 7 }, (_, i) => {
      const list = complete.filter((d) => (d.date.getDay() + 6) % 7 === i);
      return { index: i, kcal: mean(list.map((d) => d.kcalIn)), n: list.length };
    });

    // Aliments les plus caloriques sur la période
    const byName = new Map();
    (foods || []).forEach((f) => {
      const name = normalizeName(f.name);
      const cur = byName.get(name.toLowerCase()) || { name, kcal: 0, count: 0 };
      cur.kcal += f.kcal;
      cur.count++;
      byName.set(name.toLowerCase(), cur);
    });
    const topFoods = [...byName.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 15);
    const foodsKcal = [...byName.values()].reduce((s, f) => s + f.kcal, 0);

    return {
      completeDays: complete.length,
      kcal: avg('kcalIn'),
      macros,
      energyShare,
      fiber: avg('fiber'),
      sugar: avg('sugar'),
      satFat: avg('satFat'),
      sodium: avg('sodium'),
      proteinPerKg,
      proteinPerKgMean: mean(proteinPerKg.map((p) => p.value)),
      meals,
      weekday,
      topFoods,
      foodsKcal,
    };
  }

  SP.analysis.lifestyle.nutrition = { analyze, KCAL_PER_G };
})(window.SP);
