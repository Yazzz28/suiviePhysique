/**
 * Sommeil, stress et cœur : moyennes, régularité, phases, carte horaire du stress.
 */
(function (SP) {
  'use strict';

  const { mean, stdDev, isFiniteNumber } = SP.core.utils;

  const SLEEP_TARGET_MIN = 420; // 7 h : seuil bas recommandé pour un adulte
  const HYPNOGRAM_NIGHTS = 7;

  function sleep(days) {
    const nights = days.filter((d) => isFiniteNumber(d.sleepMin));
    if (!nights.length) return null;
    const staged = nights.filter((d) => d.stages);
    const stageMean = (k) => mean(staged.map((d) => d.stages[k]));
    return {
      nights: nights.length,
      durationMean: mean(nights.map((d) => d.sleepMin)),
      scoreMean: mean(nights.map((d) => d.sleepScore)),
      efficiencyMean: mean(nights.map((d) => d.sleepEff)),
      bedtimeMean: mean(nights.map((d) => d.bedtime)),
      bedtimeSd: stdDev(nights.map((d) => d.bedtime)),
      waketimeMean: mean(nights.map((d) => d.waketime)),
      waketimeSd: stdDev(nights.map((d) => d.waketime)),
      shortNights: nights.filter((d) => d.sleepMin < SLEEP_TARGET_MIN).length,
      debtMin: nights.reduce((s, d) => s + Math.max(0, SLEEP_TARGET_MIN - d.sleepMin), 0),
      stages: staged.length
        ? { awake: stageMean('awake'), light: stageMean('light'), deep: stageMean('deep'), rem: stageMean('rem'), nights: staged.length }
        : null,
      hypnogram: staged.slice(-HYPNOGRAM_NIGHTS),
    };
  }

  /**
   * Stress moyen par jour de semaine × heure (lundi = 0).
   * @param {object[]} records  relevés horaires de stress dans la période
   */
  function stressGrid(records) {
    const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sum: 0, n: 0 })));
    (records || []).forEach((r) => {
      if (r.score === 0 && !r.max) return;
      const c = cells[(r.date.getDay() + 6) % 7][r.date.getHours()];
      c.sum += r.score;
      c.n++;
    });
    return cells.map((row) => row.map((c) => (c.n ? { value: c.sum / c.n, n: c.n } : null)));
  }

  function stressAndHeart(days, stressRecords) {
    const pick = (k) => days.filter((d) => isFiniteNumber(d[k]));
    const stressDays = pick('stressAvg');
    const hrDays = pick('hrRest');
    if (!stressDays.length && !hrDays.length) return null;
    return {
      stressMean: mean(stressDays.map((d) => d.stressAvg)),
      stressDays: stressDays.length,
      grid: stressGrid(stressRecords),
      hrRestMean: mean(hrDays.map((d) => d.hrRest)),
      hrAvgMean: mean(pick('hrAvg').map((d) => d.hrAvg)),
      sleepHrMean: mean(pick('sleepHr').map((d) => d.sleepHr)),
      sleepHrvMean: mean(pick('sleepHrv').map((d) => d.sleepHrv)),
    };
  }

  SP.analysis.lifestyle.sleepStress = { sleep, stressAndHeart, stressGrid, SLEEP_TARGET_MIN };
})(window.SP);
