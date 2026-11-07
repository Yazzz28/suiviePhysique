/**
 * Métriques dérivées : taille déduite, FFMI, ratios morphologiques,
 * estimation US Navy, asymétries, agrégats journaliers.
 */
(function (SP) {
  'use strict';

  const { mean, isFiniteNumber, dayKey, startOfDay } = SP.core.utils;

  /** Taille (cm) déduite de poids / IMC : médiane des √(poids/IMC). */
  function deriveHeightCm(composition) {
    const estimates = composition
      .filter((r) => isFiniteNumber(r.weight) && isFiniteNumber(r.bmi) && r.bmi > 0)
      .map((r) => Math.sqrt(r.weight / r.bmi) * 100)
      .sort((a, b) => a - b);
    if (!estimates.length) return null;
    const mid = Math.floor(estimates.length / 2);
    const median = estimates.length % 2 ? estimates[mid] : (estimates[mid - 1] + estimates[mid]) / 2;
    return Math.round(median * 2) / 2; // arrondi au demi-cm
  }

  /** Fat-Free Mass Index (+ version normalisée à 1,80 m). */
  function ffmi(leanKg, heightCm) {
    if (!isFiniteNumber(leanKg) || !isFiniteNumber(heightCm)) return { raw: null, normalized: null };
    const h = heightCm / 100;
    const raw = leanKg / (h * h);
    return { raw, normalized: raw + 6.1 * (1.8 - h) };
  }

  /** % de graisse estimé par la formule US Navy (mensurations en cm). */
  function navyBodyFat(m, heightCm, sex) {
    if (!m || !isFiniteNumber(heightCm)) return null;
    const log = Math.log10;
    if (sex === 'female') {
      const waist = m.waist;
      if (![waist, m.hip, m.neck].every(isFiniteNumber)) return null;
      const v = waist + m.hip - m.neck;
      if (v <= 0) return null;
      return 495 / (1.29579 - 0.35004 * log(v) + 0.221 * log(heightCm)) - 450;
    }
    const waist = isFiniteNumber(m.abdomen) ? m.abdomen : m.waist; // tour de nombril chez l'homme
    if (![waist, m.neck].every(isFiniteNumber)) return null;
    const v = waist - m.neck;
    if (v <= 0) return null;
    return 495 / (1.0324 - 0.19077 * log(v) + 0.15456 * log(heightCm)) - 450;
  }

  function ratio(a, b) {
    return isFiniteNumber(a) && isFiniteNumber(b) && b !== 0 ? a / b : null;
  }

  function diff(a, b) {
    return isFiniteNumber(a) && isFiniteNumber(b) ? a - b : null;
  }

  function enrichComposition(records, heightCm) {
    const h2 = isFiniteNumber(heightCm) ? (heightCm / 100) ** 2 : null;
    return records.map((r) => {
      const f = ffmi(r.leanKg, heightCm);
      const fatFree = isFiniteNumber(r.fatKg) ? r.weight - r.fatKg : null;
      const fmi = h2 && isFiniteNumber(r.fatKg) ? r.fatKg / h2 : null; // indice de masse grasse
      return { ...r, ffmi: f.raw, ffmiNorm: f.normalized, fatFree, fmi };
    });
  }

  /**
   * Body Roundness Index (Thomas et al., 2013) — tour de taille et taille, mêmes unités.
   * Environ 1 (très mince) à 16+ ; au-delà de ~5-6, risque cardio-métabolique accru.
   */
  function bodyRoundnessIndex(waistCm, heightCm) {
    if (!isFiniteNumber(waistCm) || !isFiniteNumber(heightCm)) return null;
    const e = 1 - (waistCm / (2 * Math.PI)) ** 2 / (0.5 * heightCm) ** 2;
    return e > 0 ? 364.2 - 365.5 * Math.sqrt(e) : null;
  }

  /** A Body Shape Index (Krakauer, 2012) : TT / (IMC^(2/3) · taille^(1/2)), en mètres. */
  function bodyShapeIndex(waistCm, bmi, heightCm) {
    if (![waistCm, bmi, heightCm].every(isFiniteNumber) || bmi <= 0) return null;
    return waistCm / 100 / (Math.pow(bmi, 2 / 3) * Math.sqrt(heightCm / 100));
  }

  /**
   * Poids (moyenne 7 j) le plus proche d'une date, dans une tolérance de `maxDays`.
   * Sert à associer un poids à chaque relevé de mensurations.
   */
  function weightLookup(daily, maxDays = 3) {
    const smooth = SP.core.utils.rollingMean(daily, 'weight', 7);
    return (date) => {
      let best = null;
      let bestGap = Infinity;
      smooth.forEach((p) => {
        const gap = Math.abs(p.x - date.getTime()) / 86400000;
        if (gap < bestGap && isFiniteNumber(p.y)) {
          best = p.y;
          bestGap = gap;
        }
      });
      return bestGap <= maxDays ? best : null;
    };
  }

  function enrichMeasurements(records, heightCm, sex, weightAt = () => null) {
    const h2 = isFiniteNumber(heightCm) ? (heightCm / 100) ** 2 : null;
    return records.map((m) => {
      const weight = weightAt(m.date);
      const bmi = h2 && isFiniteNumber(weight) ? weight / h2 : null;
      return {
        ...m,
        weight,
        bri: bodyRoundnessIndex(m.waist, heightCm),
        absi: bodyShapeIndex(m.waist, bmi, heightCm),
        whtr: ratio(m.waist, heightCm),
        abdomenHeight: ratio(m.abdomen, heightCm),
        whrCalc: ratio(m.waist, m.hip),
        shoulderWaist: ratio(m.shoulder, m.waist),
        chestWaist: ratio(m.chest, m.waist),
        navyFat: navyBodyFat(m, heightCm, sex),
        asymBiceps: diff(m.bicepsL, m.bicepsR),
        asymThigh: diff(m.thighL, m.thighR),
        asymCalf: diff(m.calfL, m.calfR),
        bicepsAvg: mean([m.bicepsL, m.bicepsR]),
        thighAvg: mean([m.thighL, m.thighR]),
        calfAvg: mean([m.calfL, m.calfR]),
      };
    });
  }

  /**
   * Centimètres perdus par kg perdu, zone par zone : pente de la régression
   * tour = f(poids) sur les relevés qui ont un poids associé (≥ 3 points).
   */
  function cmPerKg(measurements, zones) {
    return zones
      .map((z) => {
        const pts = measurements
          .filter((m) => isFiniteNumber(m.weight) && isFiniteNumber(m[z.key]))
          .map((m) => ({ x: m.weight, y: m[z.key] }));
        const reg = pts.length >= 3 ? SP.core.utils.linearRegression(pts) : null;
        return reg ? { ...z, slope: reg.slope, r2: reg.r2, n: pts.length } : null;
      })
      .filter(Boolean);
  }

  /** Une ligne par jour (moyenne si plusieurs pesées le même jour). */
  function dailyAverages(records) {
    const groups = new Map();
    records.forEach((r) => {
      const k = dayKey(r.date);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    return [...groups.values()].map((list) => {
      const out = { date: startOfDay(list[0].date), count: list.length };
      Object.keys(list[0]).forEach((key) => {
        if (key === 'date') return;
        if (typeof list[0][key] === 'number' || list[0][key] === null) {
          out[key] = mean(list.map((r) => r[key]));
        } else {
          out[key] = list[list.length - 1][key];
        }
      });
      return out;
    });
  }

  /**
   * Décomposition de la variation de poids entre la première et la dernière
   * pesée complète : part de gras / muscle / os / eau.
   */
  function changeBreakdown(composition) {
    const full = composition.filter((r) => r.hasComposition);
    if (full.length < 2) return null;
    const a = full[0];
    const b = full[full.length - 1];
    const d = (k) => diff(b[k], a[k]);
    const dWeight = d('weight');
    const dFat = d('fatKg');
    const dLean = d('leanKg');
    return {
      from: a,
      to: b,
      dWeight,
      dFat,
      dLean,
      dMuscle: d('muscleKg'),
      dSkeletal: d('skeletalKg'),
      dBone: d('boneKg'),
      dWater: d('waterKg'),
      dProtein: d('proteinKg'),
      fatShare: dWeight ? dFat / dWeight : null,
      leanShare: dWeight ? dLean / dWeight : null,
    };
  }

  /** Paires gauche/droite pour l'analyse d'asymétrie. */
  const SIDE_PAIRS = [
    { key: 'asymBiceps', label: 'Biceps', left: 'bicepsL', right: 'bicepsR' },
    { key: 'asymThigh', label: 'Cuisses', left: 'thighL', right: 'thighR' },
    { key: 'asymCalf', label: 'Mollets', left: 'calfL', right: 'calfR' },
  ];

  SP.analysis.metrics = {
    deriveHeightCm,
    ffmi,
    navyBodyFat,
    enrichComposition,
    enrichMeasurements,
    dailyAverages,
    changeBreakdown,
    bodyRoundnessIndex,
    bodyShapeIndex,
    weightLookup,
    cmPerKg,
    SIDE_PAIRS,
  };
})(window.SP);
