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

  const PROTEIN_MEAL_G = 25; // repère : ~25-30 g par repas pour stimuler la synthèse musculaire
  const MIN_MEAL_KCAL = 150; // en dessous : collation légère, boisson
  const MIN_FOOD_KCAL = 200; // kcal consommées sur la période pour juger un aliment

  /**
   * Qualité protéique : protéines par repas et densité protéique des aliments
   * (g de protéines pour 100 kcal, valeur indépendante de la portion).
   * @param {object[]} meals     repas de la période (nutriments par repas)
   * @param {object[]} foods     aliments saisis de la période
   * @param {object[]} foodInfo  fiches aliments (valeurs de référence)
   */
  function proteinQuality(meals, foods, foodInfo) {
    const big = (meals || []).filter((m) => m.kcal >= MIN_MEAL_KCAL && isFiniteNumber(m.protein));
    if (!big.length) return null;
    const byType = MEAL_ORDER.map((type) => {
      const list = big.filter((m) => m.mealType === type);
      return {
        type,
        label: MEAL_TYPES[type],
        protein: mean(list.map((m) => m.protein)),
        reached: list.filter((m) => m.protein >= PROTEIN_MEAL_G).length,
        n: list.length,
      };
    }).filter((t) => t.n > 0);

    // Densité protéique par aliment consommé
    const info = new Map((foodInfo || []).map((f) => [f.id, f]));
    const agg = new Map();
    (foods || []).forEach((f) => {
      const ref = info.get(f.foodInfoId);
      if (!ref || !isFiniteNumber(ref.protein)) return;
      const key = normalizeName(f.name).toLowerCase();
      const cur = agg.get(key) || { name: normalizeName(f.name), kcal: 0, count: 0, density: (ref.protein * 100) / ref.kcal };
      cur.kcal += f.kcal;
      cur.count++;
      agg.set(key, cur);
    });
    const eaten = [...agg.values()].filter((f) => f.kcal >= MIN_FOOD_KCAL);
    const best = [...eaten].sort((a, b) => b.density - a.density).slice(0, 6);
    const traps = eaten.filter((f) => f.density < 4).sort((a, b) => b.kcal - a.kcal).slice(0, 6);

    // Repas les plus protéinés pour leurs calories, avec leurs aliments
    const foodsByMeal = new Map();
    (foods || []).forEach((f) => {
      const k = `${SP.core.utils.dayKey(f.date)}|${f.mealType}`;
      if (!foodsByMeal.has(k)) foodsByMeal.set(k, []);
      foodsByMeal.get(k).push(normalizeName(f.name));
    });
    const bestMeals = [...big]
      .filter((m) => m.protein >= PROTEIN_MEAL_G)
      .sort((a, b) => b.protein / b.kcal - a.protein / a.kcal)
      .slice(0, 5)
      .map((m) => ({
        date: m.date,
        label: MEAL_TYPES[m.mealType] || m.title,
        kcal: m.kcal,
        protein: m.protein,
        foods: [...new Set(foodsByMeal.get(`${SP.core.utils.dayKey(m.date)}|${m.mealType}`) || [])],
      }));

    return {
      threshold: PROTEIN_MEAL_G,
      meals: big.length,
      reached: big.filter((m) => m.protein >= PROTEIN_MEAL_G).length,
      byType,
      best,
      traps,
      bestMeals,
    };
  }

  SP.analysis.lifestyle.nutrition = { analyze, proteinQuality, KCAL_PER_G, PROTEIN_MEAL_G };
})(window.SP);
