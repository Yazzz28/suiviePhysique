/**
 * Point d'entrée des analyses « mode de vie » : assemble la table journalière
 * de la période et toutes les statistiques dérivées pour le rendu.
 */
(function (SP) {
  'use strict';

  const { dayKey, isFiniteNumber, DAY_MS } = SP.core.utils;
  const L = SP.analysis.lifestyle;

  const STREAK_GAP_DAYS = 45; // une pause plus longue = nouveau suivi

  /** Pesées d'une source donnée au format du parseur de pesées (mêmes clés partout). */
  const COMPOSITION_KEYS = SP.parsers.composition.FIELDS.map((f) => f.key);

  /**
   * Pesées Samsung utilisées quand aucun fichier de pesées n'est importé :
   * suivi actuel (depuis la dernière pause de plus de 45 jours), la balance
   * connectée prime sur les saisies et la montre le même jour.
   */
  function fallbackComposition(weights, heightCm) {
    if (!weights || !weights.length) return [];
    let start = 0;
    for (let i = 1; i < weights.length; i++) {
      if ((weights[i].date - weights[i - 1].date) / DAY_MS > STREAK_GAP_DAYS) start = i;
    }
    const recent = weights.slice(start);
    const scaleDays = new Set(recent.filter((w) => w.source === 'scale').map((w) => dayKey(w.date)));
    return recent
      .filter((w) => w.source === 'scale' || !scaleDays.has(dayKey(w.date)))
      .map((w) => {
        const rec = { date: w.date };
        COMPOSITION_KEYS.forEach((k) => {
          rec[k] = null;
        });
        rec.weight = w.weight;
        rec.fatPct = w.fatPct;
        rec.fatKg = isFiniteNumber(w.fatKg) ? w.fatKg : isFiniteNumber(w.fatPct) ? (w.weight * w.fatPct) / 100 : null;
        rec.leanKg = isFiniteNumber(w.leanKg) ? w.leanKg : isFiniteNumber(rec.fatKg) ? w.weight - rec.fatKg : null;
        rec.skeletalKg = w.skeletalKg;
        rec.waterKg = w.waterKg;
        rec.bmr = w.bmr;
        const h = isFiniteNumber(heightCm) ? heightCm : w.heightCm;
        rec.bmi = isFiniteNumber(h) ? w.weight / (h / 100) ** 2 : null;
        rec.hasComposition = isFiniteNumber(rec.fatPct);
        return rec;
      });
  }

  /** Taille la plus récente déclarée dans l'export (profil ou pesées). */
  function latestHeight(data) {
    const list = (data.heights || []).filter((h) => h.value > 100);
    if (list.length) return list[list.length - 1].value;
    const w = (data.weights || []).filter((x) => x.heightCm > 100);
    return w.length ? w[w.length - 1].heightCm : null;
  }

  /** Date la plus récente de l'export (sert à repérer la journée incomplète). */
  function latestDate(data) {
    let max = 0;
    ['steps', 'expenditure', 'stress', 'heartRate', 'meals'].forEach((k) => {
      const list = data[k];
      if (list && list.length) max = Math.max(max, list[list.length - 1].date.getTime());
    });
    return max ? new Date(max) : null;
  }

  function inRange(list, from, to) {
    return (list || []).filter((r) => r.date >= from && r.date <= to);
  }

  /** Premier jour de l'export (historique long terme). */
  function earliestDate(data) {
    let min = Infinity;
    ['steps', 'weights', 'expenditure', 'heartRate', 'stress', 'sleeps'].forEach((k) => {
      const list = data[k];
      if (list && list.length) min = Math.min(min, list[0].date.getTime());
    });
    return Number.isFinite(min) ? new Date(min) : null;
  }

  /**
   * @param {object} p
   * @param {object} p.data        tables Samsung
   * @param {{from: Date, to: Date}} p.range  période affichée
   * @param {object[]} p.allDaily  pesées journalières (toutes)
   * @param {number|null} p.rho    énergie par kg (modèle de projection)
   */
  function build({ data, range, allDaily, rho }) {
    const latest = latestDate(data);
    const partialKey = latest ? dayKey(latest) : null;
    const to = latest && latest < range.to ? latest : range.to;
    const weightByDay = new Map((allDaily || []).filter((d) => isFiniteNumber(d.weight)).map((d) => [dayKey(d.date), d.weight]));

    const days = L.daily.build(data, { from: range.from, to, partialKey }, weightByDay);
    const energy = L.energy.analyze(days, { rho });
    const lastWeight = [...(allDaily || [])].reverse().find((d) => isFiniteNumber(d.weight));
    const foods = inRange(data.foods, range.from, to);
    const sessions = inRange(data.sessions, range.from, to);
    const stress = inRange(data.stress, range.from, to);

    // Historique complet (indépendant de la période)
    const first = earliestDate(data);
    let history = null;
    if (first && latest) {
      const allDays = L.daily.build(data, { from: first, to: latest, partialKey }, weightByDay);
      L.energy.analyze(allDays, { rho }); // classe les jours de saisie complète
      history = L.longTerm.monthly(allDays, data.weights);
    }

    return {
      range: { from: range.from, to },
      partialKey,
      days,
      energy,
      nutrition: L.nutrition.analyze(days, foods, lastWeight ? lastWeight.weight : null),
      activity: L.activity.analyze(days, sessions),
      sleep: L.sleepStress.sleep(days),
      stressHeart: L.sleepStress.stressAndHeart(days, stress),
      correlations: L.correlations.analyze(days),
      vitals: {
        spo2: inRange(data.spo2, range.from, to),
        respiration: inRange(data.respiration, range.from, to),
        skinTemp: inRange(data.skinTemp, range.from, to),
        ageIndex: inRange(data.ageIndex, range.from, to),
        arterialPressure: inRange(data.arterialPressure, range.from, to),
        antioxidant: data.antioxidant || [],
        bloodPressure: data.bloodPressure || [],
        mood: data.mood || [],
        caffeine: data.caffeine || [],
      },
      history,
      has: {
        nutrition: days.some((d) => isFiniteNumber(d.kcalIn)),
        energy: days.some((d) => isFiniteNumber(d.tdee)),
        activity: days.some((d) => isFiniteNumber(d.steps)) || sessions.length > 0,
        sleep: days.some((d) => isFiniteNumber(d.sleepMin)),
        heart: days.some((d) => isFiniteNumber(d.stressAvg) || isFiniteNumber(d.hrRest)),
      },
    };
  }

  L.fallbackComposition = fallbackComposition;
  L.latestHeight = latestHeight;
  L.latestDate = latestDate;
  L.build = build;
})(window.SP);
