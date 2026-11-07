/**
 * Qualité des mensurations : repère les valeurs douteuses (erreur de position
 * du mètre ruban, faute de frappe) pour pouvoir les exclure des tendances.
 *
 * Méthode : pour chaque zone, tendance robuste de Theil-Sen (médiane des pentes
 * entre toutes les paires de relevés, insensible à quelques valeurs aberrantes),
 * puis écart de chaque relevé à cette tendance. Un relevé est douteux si l'écart
 * dépasse ce qu'un mètre ruban bien placé peut expliquer pour cette zone.
 */
(function (SP) {
  'use strict';

  const { isFiniteNumber, DAY_MS } = SP.core.utils;
  const { CM_ZONES } = SP.parsers.measurements;

  /** Écart toléré à la tendance (cm), selon la taille et la difficulté de la zone. */
  const TOLERANCE_CM = {
    neck: 1.5,
    shoulder: 4,
    chest: 4,
    waist: 4,
    abdomen: 4,
    hip: 4,
    thighL: 4,
    thighR: 4,
    bicepsL: 2.5,
    bicepsR: 2.5,
    calfL: 2.5,
    calfR: 2.5,
  };

  const MIN_POINTS = 4;

  function median(values) {
    const v = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  /** Droite de Theil-Sen : pente = médiane des pentes par paires, ordonnée = médiane des résidus. */
  function theilSen(points) {
    const slopes = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        if (dx !== 0) slopes.push((points[j].y - points[i].y) / dx);
      }
    }
    if (!slopes.length) return null;
    const slope = median(slopes);
    const intercept = median(points.map((p) => p.y - slope * p.x));
    return { slope, intercept, at: (x) => intercept + slope * x };
  }

  /**
   * Analyse toutes les zones.
   * Retourne { flags: [{ date, key, label, value, expected, deviation }], isFlagged(date, key) }.
   */
  function analyze(measurements) {
    const flags = [];
    if (measurements.length >= MIN_POINTS) {
      const t0 = measurements[0].date.getTime();
      CM_ZONES.forEach((z) => {
        const pts = measurements
          .filter((m) => isFiniteNumber(m[z.key]))
          .map((m) => ({ x: (m.date.getTime() - t0) / DAY_MS, y: m[z.key], date: m.date }));
        if (pts.length < MIN_POINTS) return;
        const line = theilSen(pts);
        if (!line) return;
        const tolerance = TOLERANCE_CM[z.key] || 4;
        pts.forEach((p) => {
          const expected = line.at(p.x);
          const deviation = p.y - expected;
          if (Math.abs(deviation) > tolerance) {
            flags.push({ date: p.date, key: z.key, label: z.label, value: p.y, expected, deviation, tolerance });
          }
        });
      });
    }
    const index = new Set(flags.map((f) => `${f.date.getTime()}|${f.key}`));
    return {
      flags,
      isFlagged: (date, key) => index.has(`${date.getTime()}|${key}`),
    };
  }

  /** Copie des relevés où les valeurs douteuses sont remplacées par null. */
  function clean(measurements, quality) {
    return measurements.map((m) => {
      const out = { ...m };
      CM_ZONES.forEach((z) => {
        if (quality.isFlagged(m.date, z.key)) out[z.key] = null;
      });
      return out;
    });
  }

  SP.analysis.quality = { analyze, clean, TOLERANCE_CM };
})(window.SP);
