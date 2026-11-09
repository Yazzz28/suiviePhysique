/**
 * Projection du poids par bilan énergétique (modèle à apport constant).
 *
 * Pourquoi pas une droite : la dépense énergétique baisse avec le poids
 * (le métabolisme de base diminue à chaque kg perdu). À apport alimentaire
 * constant, le déficit se réduit donc progressivement et la perte ralentit.
 *
 * Modèle (simplification du modèle de K. Hall, NIH) :
 *   ρ · dx/dt = D0 − c · x          x = kg perdus depuis aujourd'hui
 *   D0 = déficit actuel (kcal/j) = rythme récent × ρ
 *   c  = baisse de la dépense TOTALE par kg perdu ≈ 22 kcal/j/kg
 *        (Hall et al., Lancet 2011 : métabolisme de base + coût de l'activité
 *        + adaptation métabolique). La seule pente du métabolisme de base
 *        (≈ 10 kcal/kg, mesurée par la balance) sous-estimerait le ralentissement.
 *   ρ  = énergie par kg perdu, selon la part de gras / masse maigre perdue
 * Solution : x(t) = (D0 / c) · (1 − e^(−c·t/ρ))  → plateau à w0 − D0/c.
 *
 * Hypothèse assumée : apport alimentaire et activité constants à partir
 * d'aujourd'hui. Le plateau est une asymptote théorique, pas une prédiction.
 */
(function (SP) {
  'use strict';

  const { linearRegression, isFiniteNumber, clamp, DAY_MS } = SP.core.utils;
  const { trends, metrics } = SP.analysis;

  /** Énergie stockée par kg de tissu (Hall, 2008). */
  const ENERGY = { fatKcalPerKg: 9440, leanKcalPerKg: 1816 };

  /** Baisse de dépense totale par kg perdu (kcal/j/kg) — Hall et al., Lancet 2011. */
  const EXPENDITURE_DROP_PER_KG = 22;

  /** Repli si la balance ne fournit pas de BMR exploitable (Mifflin-St Jeor : 10 kcal/kg). */
  const DEFAULT_BMR_SLOPE = 10;

  /** Part de gras par défaut dans la perte si la composition est inconnue. */
  const DEFAULT_FAT_SHARE = 0.75;

  /** Fenêtre (jours) servant à estimer le rythme actuel. */
  const RATE_WINDOW_DAYS = 21;


  /** kcal par kg perdu, selon la part de gras de la perte observée. */
  function energyDensity(composition) {
    const br = metrics.changeBreakdown(composition);
    const share = br && br.dWeight < 0 && isFiniteNumber(br.fatShare) ? clamp(br.fatShare, 0, 1) : DEFAULT_FAT_SHARE;
    return { rho: share * ENERGY.fatKcalPerKg + (1 - share) * ENERGY.leanKcalPerKg, fatShare: share };
  }

  /** Pente du métabolisme de base en fonction du poids (kcal/j par kg), pour information. */
  function bmrSlope(composition) {
    const pts = composition
      .filter((r) => isFiniteNumber(r.bmr) && isFiniteNumber(r.weight))
      .map((r) => ({ x: r.weight, y: r.bmr }));
    const reg = pts.length >= 5 ? linearRegression(pts) : null;
    if (!reg || reg.slope <= 0) return { value: DEFAULT_BMR_SLOPE, measured: false };
    return { value: clamp(reg.slope, 5, 25), measured: true };
  }

  /**
   * Construit le modèle à partir des pesées.
   * Retourne null si la tendance n'est pas à la baisse (pas de projection de perte).
   */
  /** Quantile ~80 % (bilatéral) de la loi normale : fourchette « probable ». */
  const RANGE_Z = 1.28;

  /** Modèle à partir d'un rythme donné (kg/j, négatif) et du poids lissé actuel. */
  function fromRate({ slopePerDay, t0, w0, rho, fatShare, beta }) {
    if (!(slopePerDay < 0)) return null;
    const c = EXPENDITURE_DROP_PER_KG;
    const D0 = -slopePerDay * rho;
    const plateau = w0 - D0 / c;
    const tau = rho / c; // constante de temps (jours)

    const weightAtDays = (days) => w0 - (D0 / c) * (1 - Math.exp(-days / tau));

    /** Jours pour atteindre `target` (null si sous le plateau ou au-dessus du poids actuel). */
    const daysTo = (target) => {
      if (!isFiniteNumber(target) || target >= w0) return null;
      const ratio = 1 - ((w0 - target) * c) / D0;
      if (ratio <= 0) return null;
      return -tau * Math.log(ratio);
    };

    /** Même rythme mais sans ralentissement (pour comparaison). */
    const linearDaysTo = (target) => (isFiniteNumber(target) && target < w0 ? (w0 - target) / -slopePerDay : null);

    /** Vitesse attendue (kg/semaine, négative) après `days` jours. */
    const speedAtDays = (days) => slopePerDay * 7 * Math.exp(-days / tau);

    /** Points de la courbe projetée, de t0 à t0 + days. */
    const curve = (days, stepDays = 2) => {
      const out = [];
      for (let d = 0; d <= days; d += stepDays) out.push({ x: t0.getTime() + d * DAY_MS, y: weightAtDays(d) });
      return out;
    };

    return {
      t0,
      w0,
      deficit: D0,
      ratePerWeek: slopePerDay * 7,
      rho,
      fatShare,
      bmrSlope: beta.value,
      bmrMeasured: beta.measured,
      expenditureDropPerKg: c,
      plateau,
      tau,
      weightAtDays,
      speedAtDays,
      daysTo,
      linearDaysTo,
      dateFor: (target) => {
        const d = daysTo(target);
        return d === null ? null : { date: new Date(t0.getTime() + d * DAY_MS), days: d };
      },
      curve,
    };
  }

  /**
   * Construit le modèle à partir des pesées, avec une fourchette (≈ 80 %)
   * issue de l'incertitude du rythme récent : `fast` / `slow`.
   * Retourne null si la tendance n'est pas à la baisse.
   */
  function build({ daily, composition, w0 }) {
    const rate = trends.recentTrend(daily, 'weight', RATE_WINDOW_DAYS) || trends.trend(daily, 'weight');
    if (!rate || rate.slopePerDay >= 0 || !daily.length) return null;

    const t0 = daily[daily.length - 1].date;
    const base = {
      t0,
      // Poids lissé actuel : la tendance affichée si elle est fournie (courbe continue), sinon la régression récente
      w0: isFiniteNumber(w0) ? w0 : rate.at(t0),
      ...energyDensity(composition),
      beta: bmrSlope(composition),
    };
    const model = fromRate({ ...base, slopePerDay: rate.slopePerDay });
    const se = isFiniteNumber(rate.seSlopePerDay) ? rate.seSlopePerDay : 0;
    model.fast = fromRate({ ...base, slopePerDay: rate.slopePerDay - RANGE_Z * se });
    model.slow = fromRate({ ...base, slopePerDay: rate.slopePerDay + RANGE_Z * se }); // null si le rythme lent n'est plus une perte

    /** Fourchette de dates pour une cible : { early, late } (late null = peut ne jamais être atteint). */
    /**
     * Scénario à déficit choisi (kcal/j, ex. dépense réelle − apport prévu),
     * avec le même modèle et le même point de départ. null si pas de déficit.
     */
    model.scenario = (deficit) => (isFiniteNumber(deficit) && deficit > 0 ? fromRate({ ...base, slopePerDay: -deficit / base.rho }) : null);

    model.rangeFor = (target) => ({
      early: model.fast ? model.fast.dateFor(target) : null,
      late: model.slow ? model.slow.dateFor(target) : null,
    });
    return model;
  }

  SP.analysis.projection = { build, ENERGY, RATE_WINDOW_DAYS, EXPENDITURE_DROP_PER_KG, RANGE_Z };
})(window.SP);
