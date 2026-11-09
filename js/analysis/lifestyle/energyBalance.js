/**
 * Bilan énergétique : apport saisi vs dépense estimée par la montre, et
 * dépense « adaptative » déduite de la courbe de poids.
 *
 * Dépense adaptative = apport moyen − (pente du poids × énergie par kg).
 * C'est la dépense qui explique ta perte réelle avec ce que tu as saisi :
 * si elle est bien plus haute que celle de la montre, une partie de l'apport
 * n'est probablement pas saisie (ou la montre sous-estime ta dépense).
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber, linearRegression, DAY_MS } = SP.core.utils;

  const DEFAULT_RHO = 7700; // kcal par kg de poids perdu (valeur usuelle)
  const COMPLETE_SHARE_OF_REST = 0.5; // apport < 50 % de la dépense de repos : saisie probablement incomplète
  const ROLLING_DAYS = 21;
  const LOG_GAP_DAYS = 7; // une semaine sans aucune saisie = fin d'une période de saisie régulière
  const MIN_WINDOW_COMPLETE = 7;

  function median(values) {
    const v = values.filter(isFiniteNumber).sort((a, b) => a - b);
    if (!v.length) return null;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  /** Seuil sous lequel une journée saisie est considérée incomplète. */
  function completeThreshold(days) {
    const rest = median(days.filter((d) => !d.partial).map((d) => d.rest));
    return isFiniteNumber(rest) ? rest * COMPLETE_SHARE_OF_REST : 800;
  }

  function weightSlope(days) {
    const pts = days.filter((d) => isFiniteNumber(d.weight));
    if (pts.length < 5) return null;
    const t0 = pts[0].date.getTime();
    const reg = linearRegression(pts.map((d) => ({ x: (d.date.getTime() - t0) / DAY_MS, y: d.weight })));
    return reg ? { slopePerDay: reg.slope, n: pts.length, r2: reg.r2 } : null;
  }

  /**
   * Période de saisie régulière en cours : jours qui suivent la dernière
   * semaine entière sans aucune saisie. Comparer apport et poids n'a de sens
   * que là où les repas sont saisis.
   */
  function loggingWindow(days) {
    let run = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      run = days[i].logStatus === 'none' ? run + 1 : 0;
      if (run >= LOG_GAP_DAYS) {
        const window = days.slice(i + run);
        // Commence au premier jour saisi
        const first = window.findIndex((d) => d.logStatus !== 'none');
        return first < 0 ? [] : window.slice(first);
      }
    }
    const first = days.findIndex((d) => d.logStatus !== 'none');
    return first < 0 ? [] : days.slice(first);
  }

  /**
   * @param {object[]} days  table journalière (dailyLifestyle.build)
   * @param {{rho?: number}} opts  énergie par kg (modèle de projection si disponible)
   */
  function analyze(days, { rho } = {}) {
    const energyPerKg = isFiniteNumber(rho) ? rho : DEFAULT_RHO;
    const full = days.filter((d) => !d.partial);
    const threshold = completeThreshold(days);
    full.forEach((d) => {
      d.logStatus = !isFiniteNumber(d.kcalIn) ? 'none' : d.kcalIn >= threshold ? 'complete' : 'partial';
      d.balance = d.logStatus === 'complete' && isFiniteNumber(d.tdee) ? d.kcalIn - d.tdee : null;
    });
    // Synthèse calculée sur la période de saisie régulière (sinon : toute la période)
    let window = loggingWindow(full);
    if (window.filter((d) => d.logStatus === 'complete').length < MIN_WINDOW_COMPLETE) window = full;
    const complete = window.filter((d) => d.logStatus === 'complete');
    const withTdee = window.filter((d) => isFiniteNumber(d.tdee));
    const balanced = complete.filter((d) => isFiniteNumber(d.balance));

    const meanIntake = mean(complete.map((d) => d.kcalIn));
    const meanTdee = mean(withTdee.map((d) => d.tdee));
    const meanBalance = mean(balanced.map((d) => d.balance));
    const slope = weightSlope(window);
    const impliedBalance = slope ? slope.slopePerDay * energyPerKg : null; // < 0 = déficit
    const adaptiveTdee = isFiniteNumber(meanIntake) && isFiniteNumber(impliedBalance) ? meanIntake - impliedBalance : null;

    return {
      rho: energyPerKg,
      threshold,
      days: full,
      window: window.length ? { from: window[0].date, to: window[window.length - 1].date, whole: window === full } : null,
      counts: {
        days: window.length,
        logged: window.filter((d) => d.logStatus !== 'none').length,
        complete: complete.length,
        incomplete: window.filter((d) => d.logStatus === 'partial').length,
      },
      meanIntake,
      meanTdee,
      meanBalance,
      weightSlope: slope,
      impliedBalance,
      adaptiveTdee,
      cumulative: cumulative(window, energyPerKg, meanBalance),
      rolling: rolling(full, energyPerKg),
    };
  }

  /**
   * Variation de poids prédite par le bilan saisi (jours complets ; jours non
   * saisis = bilan moyen imputé) vs variation réelle (moyenne 7 j des pesées).
   */
  function cumulative(days, rho, meanBalance) {
    if (!isFiniteNumber(meanBalance)) return [];
    const firstWeight = days.find((d) => isFiniteNumber(d.weight));
    if (!firstWeight) return [];
    const start = days.indexOf(firstWeight);
    let predicted = 0;
    let base = null; // première moyenne 7 j : même lissage au départ et à l'arrivée
    const out = [];
    for (let i = start; i < days.length; i++) {
      const d = days[i];
      if (i > start) predicted += (isFiniteNumber(d.balance) ? d.balance : meanBalance) / rho;
      const avg = mean(days.slice(Math.max(start, i - 6), i + 1).map((x) => x.weight));
      if (base === null && isFiniteNumber(avg)) base = avg;
      out.push({ date: d.date, predicted, actual: isFiniteNumber(avg) ? avg - base : null });
    }
    return out;
  }

  /** Dépense adaptative glissante (21 j) vs dépense moyenne de la montre sur la même fenêtre. */
  function rolling(days, rho) {
    const out = [];
    days.forEach((d, i) => {
      const win = days.slice(Math.max(0, i - ROLLING_DAYS + 1), i + 1);
      if (win.length < ROLLING_DAYS) return;
      const complete = win.filter((x) => x.logStatus === 'complete');
      const slope = weightSlope(win);
      const watch = mean(win.map((x) => x.tdee));
      if (complete.length < 7 || !slope || slope.n < 8) {
        if (isFiniteNumber(watch)) out.push({ date: d.date, adaptive: null, watch });
        return;
      }
      out.push({ date: d.date, adaptive: mean(complete.map((x) => x.kcalIn)) - slope.slopePerDay * rho, watch });
    });
    return out;
  }

  SP.analysis.lifestyle.energy = { analyze, DEFAULT_RHO, ROLLING_DAYS, COMPLETE_SHARE_OF_REST };
})(window.SP);
