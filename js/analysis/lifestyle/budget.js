/**
 * Budget calorique et adaptation métabolique.
 *
 * Budget : apport quotidien qui mène à l'objectif à la date cible, avec le même
 * modèle de bilan énergétique que la projection (Hall) :
 *   x(t) = (D0 / c)·(1 − e^(−c·t/ρ))  ⇒  D0 = c·Δ / (1 − e^(−c·t/ρ))
 *   apport = dépense réelle estimée − D0
 *
 * Adaptation : la dépense baisse normalement d'environ 22 kcal/j par kg perdu
 * (métabolisme + coût du mouvement). On compare la dépense réelle estimée
 * (apport saisi − bilan déduit du poids, 21 j glissants) à cette baisse
 * attendue : un écart négatif marqué = le corps économise plus que prévu.
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber, DAY_MS, startOfDay } = SP.core.utils;
  const { EXPENDITURE_DROP_PER_KG } = SP.analysis.projection;

  const SAFE_RATE_PCT = 1; // % du poids par semaine au-delà duquel le rythme est jugé rapide
  /** Apport minimal usuellement conseillé sans suivi médical (kcal/j). */
  const INTAKE_FLOOR = { male: 1500, female: 1200 };

  /**
   * @param {object} p
   * @param {number} p.weightNow   poids lissé actuel
   * @param {number|null} p.target objectif (kg)
   * @param {Date|null} p.targetDate
   * @param {number|null} p.tdee   dépense réelle estimée (kcal/j)
   * @param {number} p.rho         énergie par kg
   * @param {string} p.sex         'male' | 'female' (plancher d'apport)
   */
  function budget({ weightNow, target, targetDate, tdee, rho, sex, today }) {
    if (!isFiniteNumber(tdee) || !isFiniteNumber(weightNow)) return null;
    const c = EXPENDITURE_DROP_PER_KG;
    // Fourchette conseillée : 0,5 à 1 % du poids par semaine au départ
    const intakeForRate = (pct) => tdee - ((weightNow * pct) / 100 / 7) * rho;
    const out = {
      tdee,
      recommended: { low: intakeForRate(1), high: intakeForRate(0.5) },
      maintenance: tdee,
    };
    if (!isFiniteNumber(target) || !(targetDate instanceof Date) || target >= weightNow) return out;
    const days = (startOfDay(targetDate) - startOfDay(today || new Date())) / DAY_MS;
    if (days <= 0) return { ...out, plan: { invalid: 'past' } };
    const delta = weightNow - target;
    const deficit = (c * delta) / (1 - Math.exp((-c * days) / rho));
    const intake = tdee - deficit;
    const startRatePct = ((deficit / rho) * 7 * 100) / weightNow;
    out.plan = {
      days,
      delta,
      deficit,
      intake,
      startRatePerWeek: (deficit / rho) * 7,
      startRatePct,
      tooFast: startRatePct > SAFE_RATE_PCT,
      floor: INTAKE_FLOOR[sex] || INTAKE_FLOOR.male,
      belowFloor: intake < (INTAKE_FLOOR[sex] || INTAKE_FLOOR.male),
    };
    return out;
  }

  /**
   * @param {object[]} rolling  energy.rolling ({ date, adaptive })
   * @param {object[]} days     table journalière (poids)
   */
  function adaptation(rolling, days) {
    const pts = rolling.filter((r) => isFiniteNumber(r.adaptive));
    if (pts.length < 2) return null;
    const weightAt = (date) => {
      const win = days.filter((d) => isFiniteNumber(d.weight) && Math.abs(d.date - date) <= 3.5 * DAY_MS);
      return win.length ? mean(win.map((d) => d.weight)) : null;
    };
    const base = pts.find((p) => isFiniteNumber(weightAt(p.date)));
    if (!base) return null;
    const w0 = weightAt(base.date);
    const series = pts
      .map((p) => {
        const w = weightAt(p.date);
        if (!isFiniteNumber(w)) return null;
        return { date: p.date, adaptive: p.adaptive, expected: base.adaptive - EXPENDITURE_DROP_PER_KG * (w0 - w) };
      })
      .filter(Boolean);
    if (series.length < 2) return null;
    const last = series[series.length - 1];
    return { series, gap: last.adaptive - last.expected, from: base.date, lost: w0 - weightAt(last.date) };
  }

  SP.analysis.lifestyle.budget = { budget, adaptation, SAFE_RATE_PCT, INTAKE_FLOOR };
})(window.SP);
