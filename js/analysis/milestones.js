/**
 * Jalons et bilans : records, paliers de poids, catégories d'IMC franchies,
 * stagnation, rythme relatif, bilan mensuel, composition récente de la perte.
 *
 * Les franchissements utilisent la moyenne glissante 7 jours : une seule
 * pesée basse (eau, transit) ne compte pas comme un palier atteint.
 */
(function (SP) {
  'use strict';

  const { rollingMean, isFiniteNumber, daysBetween, mean, DAY_MS } = SP.core.utils;
  const { trends, metrics } = SP.analysis;

  const PALIER_STEP_KG = 5;
  const STAGNATION_DAYS = 10;
  const RECENT_WINDOW_DAYS = 28;

  /** Catégories d'IMC (OMS), de la plus haute à la plus basse. */
  const BMI_THRESHOLDS = [
    { value: 40, label: 'Obésité III → II' },
    { value: 35, label: 'Obésité II → I' },
    { value: 30, label: 'Obésité → surpoids' },
    { value: 25, label: 'Surpoids → normal' },
  ];

  /** Série lissée { date, w } (moyenne 7 jours) à partir des moyennes journalières. */
  function smoothed(daily) {
    return rollingMean(daily, 'weight', 7)
      .map((p, i) => ({ date: daily[i].date, w: p.y }))
      .filter((p) => isFiniteNumber(p.w));
  }

  /** Première date où la série lissée passe sous `threshold`. */
  function crossingDate(series, threshold) {
    const hit = series.find((p) => p.w <= threshold);
    return hit ? hit.date : null;
  }

  /** Records, paliers de 5 kg et catégories d'IMC (sur toutes les pesées). */
  function records(allDaily, { heightCm, projection } = {}) {
    const series = smoothed(allDaily);
    if (series.length < 2) return null;
    const raw = allDaily.filter((d) => isFiniteNumber(d.weight));
    const low = raw.reduce((a, b) => (b.weight < a.weight ? b : a));
    const high = raw.reduce((a, b) => (b.weight > a.weight ? b : a));
    const start = raw[0].weight;
    const current = series[series.length - 1].w;

    // Paliers de 5 kg sous le poids de départ : tous ceux atteints + les 2 suivants
    const paliers = [];
    let upcoming = 0;
    for (let p = Math.ceil(start / PALIER_STEP_KG) * PALIER_STEP_KG - PALIER_STEP_KG; p > 0 && upcoming < 2; p -= PALIER_STEP_KG) {
      const date = crossingDate(series, p);
      const projected = !date && projection ? projection.dateFor(p) : null;
      if (!date) upcoming++;
      paliers.push({ weight: p, date, projected });
    }

    // Catégories d'IMC franchies / à venir
    const h2 = isFiniteNumber(heightCm) ? (heightCm / 100) ** 2 : null;
    const bmi = h2
      ? BMI_THRESHOLDS.filter((t) => t.value * h2 < start).map((t) => {
          const weight = t.value * h2;
          const date = crossingDate(series, weight);
          const projected = !date && projection ? projection.dateFor(weight) : null;
          return { ...t, weight, date, projected };
        })
      : [];

    return { low, high, start, current, paliers, bmi };
  }

  /** Stagnation : jours écoulés depuis le dernier plus bas de la moyenne 7 jours. */
  function stagnation(daily) {
    const series = smoothed(daily);
    if (series.length < 2) return null;
    let best = series[0];
    series.forEach((p) => {
      if (p.w < best.w - 0.05) best = p;
    });
    const last = series[series.length - 1];
    const days = daysBetween(best.date, last.date);

    // Distinguer rétention d'eau et vrai plateau : évolution eau % et gras % depuis le plus bas
    const since = daily.filter((d) => d.date >= best.date && d.hasComposition);
    let water = null;
    let fat = null;
    if (since.length >= 2) {
      water = since[since.length - 1].waterPct - since[0].waterPct;
      fat = since[since.length - 1].fatKg - since[0].fatKg;
    }
    return { days, since: best.date, lowest: best.w, stalled: days >= STAGNATION_DAYS, waterDelta: water, fatDelta: fat };
  }

  /** Rythme relatif : % du poids perdu par semaine (positif = perte), tendance glissante. */
  function relativeRate(daily, windowDays) {
    const series = smoothed(daily);
    const byTime = new Map(series.map((p) => [p.date.getTime(), p.w]));
    return trends
      .rollingTrend(daily, 'weight', windowDays)
      .map((r) => {
        const w = byTime.get(r.date.getTime());
        return w ? { date: r.date, pct: (-r.slopePerWeek / w) * 100 } : null;
      })
      .filter(Boolean);
  }

  /** Part de masse maigre dans la perte sur les dernières semaines. */
  function recentComposition(daily) {
    if (!daily.length) return null;
    const lastDate = daily[daily.length - 1].date;
    const from = lastDate.getTime() - (RECENT_WINDOW_DAYS - 1) * DAY_MS;
    const recent = daily.filter((d) => d.date.getTime() >= from);
    const br = metrics.changeBreakdown(recent);
    return br ? { ...br, windowDays: RECENT_WINDOW_DAYS } : null;
  }

  /** Bilan par mois civil. */
  function monthly(daily, measurements) {
    const series = smoothed(daily);
    const months = new Map();
    daily.forEach((d) => {
      const key = `${d.date.getFullYear()}-${d.date.getMonth()}`;
      if (!months.has(key)) months.set(key, { month: new Date(d.date.getFullYear(), d.date.getMonth(), 1), days: [] });
      months.get(key).days.push(d);
    });
    const list = [...months.values()].sort((a, b) => a.month - b.month);
    const smoothAt = (date) => {
      const p = series.filter((s) => s.date <= date).pop();
      return p ? p.w : null;
    };
    const lastMeasureBefore = (date) => measurements.filter((m) => m.date <= date && isFiniteNumber(m.waist)).pop() || null;

    return list.map((m, i) => {
      const first = m.days[0];
      const last = m.days[m.days.length - 1];
      const prevEnd = i > 0 ? list[i - 1].days[list[i - 1].days.length - 1] : null;
      // Référence de départ : fin du mois précédent si disponible (pas de trou entre deux mois)
      const startW = prevEnd ? smoothAt(prevEnd.date) : smoothAt(first.date);
      const endW = smoothAt(last.date);
      const comp = m.days.filter((d) => d.hasComposition);
      const prevComp = prevEnd ? list[i - 1].days.filter((d) => d.hasComposition).pop() : null;
      const compStart = prevComp || comp[0];
      const compEnd = comp[comp.length - 1];
      const monthEnd = new Date(m.month.getFullYear(), m.month.getMonth() + 1, 0, 23, 59);
      const waistEnd = lastMeasureBefore(monthEnd);
      const waistStart = i > 0 ? lastMeasureBefore(new Date(m.month.getTime() - 1)) : measurements[0] || null;
      const span = daysBetween(prevEnd ? prevEnd.date : first.date, last.date) || 1;
      const calendarSpan = daysBetween(first.date, last.date) + 1;
      return {
        month: m.month,
        weighIns: m.days.length,
        adherence: m.days.length / calendarSpan,
        startWeight: startW,
        endWeight: endW,
        dWeight: isFiniteNumber(startW) && isFiniteNumber(endW) ? endW - startW : null,
        ratePct: isFiniteNumber(startW) && isFiniteNumber(endW) ? ((startW - endW) / startW / (span / 7)) * 100 : null,
        dFat: compStart && compEnd && compStart !== compEnd ? compEnd.fatKg - compStart.fatKg : null,
        dLean: compStart && compEnd && compStart !== compEnd ? compEnd.leanKg - compStart.leanKg : null,
        waist: waistEnd ? waistEnd.waist : null,
        dWaist: waistEnd && waistStart && waistEnd !== waistStart ? waistEnd.waist - waistStart.waist : null,
        avgFatPct: mean(comp.map((d) => d.fatPct)),
      };
    });
  }

  SP.analysis.milestones = {
    records,
    stagnation,
    relativeRate,
    recentComposition,
    monthly,
    STAGNATION_DAYS,
    RECENT_WINDOW_DAYS,
  };
})(window.SP);
