/**
 * Modèle de silhouette (vue de face) à partir des mensurations.
 *
 * Unités : centimètres. Repère : x = 0 au centre, y = 0 au sommet du crâne,
 * y = taille au sol. Côté x > 0 = gauche de la personne (vue de face).
 *
 * Principe : chaque tour (circonférence) est converti en demi-largeur de face
 * en assimilant la section à une ellipse de rapport profondeur/largeur connu :
 *   C ≈ π·(a + b) avec b = r·a   =>   a = C / (π·(1 + r))
 * Membres : section circulaire (a = C / 2π).
 *
 * Toutes les géométries ont le même nombre de points dans le même ordre,
 * ce qui permet l'interpolation (animation) entre deux dates.
 */
(function (SP) {
  'use strict';

  const { lerp, isFiniteNumber } = SP.core.utils;
  const { CM_ZONES } = SP.parsers.measurements;

  /** Rapport profondeur / largeur des sections du tronc. */
  // (sections plus « rectangulaires » qu'une ellipse : rapports effectifs calibrés
  //  pour retrouver des largeurs de face réalistes)
  const DEPTH_RATIO = { neck: 0.9, shoulder: 0.6, chest: 0.85, waist: 0.85, abdomen: 0.95, hip: 0.85 };

  /** Hauteurs anatomiques (fraction de la taille depuis le sol). */
  const F = {
    headCenter: 0.935,
    neck: 0.85,
    trap: 0.83,
    shoulder: 0.805,
    deltoid: 0.775,
    armpit: 0.755,
    chest: 0.725,
    biceps: 0.7,
    elbow: 0.63,
    waist: 0.625,
    forearm: 0.585,
    abdomen: 0.585,
    hip: 0.515,
    wrist: 0.485,
    crotch: 0.475,
    hand: 0.44,
    thigh: 0.43,
    fingertip: 0.4,
    knee: 0.285,
    calf: 0.205,
    ankle: 0.05,
    floor: 0,
  };

  const ellipseHalf = (c, key) => c / (Math.PI * (1 + DEPTH_RATIO[key]));
  const radius = (c) => c / (2 * Math.PI);

  /**
   * Comble les valeurs manquantes d'un relevé avec la valeur la plus proche
   * dans le temps (pour ne jamais casser le contour).
   */
  function fillGaps(records) {
    return records.map((rec, i) => {
      const out = { ...rec };
      CM_ZONES.forEach(({ key }) => {
        if (isFiniteNumber(out[key])) return;
        for (let d = 1; d < records.length; d++) {
          const prev = records[i - d];
          const next = records[i + d];
          if (prev && isFiniteNumber(prev[key])) return void (out[key] = prev[key]);
          if (next && isFiniteNumber(next[key])) return void (out[key] = next[key]);
        }
      });
      return out;
    });
  }

  /** Demi-largeurs du tronc pour un relevé. */
  function torsoWidths(m) {
    return {
      neck: ellipseHalf(m.neck, 'neck'),
      shoulder: ellipseHalf(m.shoulder, 'shoulder'),
      chest: ellipseHalf(m.chest, 'chest'),
      waist: ellipseHalf(m.waist, 'waist'),
      abdomen: ellipseHalf(m.abdomen, 'abdomen'),
      hip: ellipseHalf(m.hip, 'hip'),
    };
  }

  /** Interpolation linéaire d'une demi-largeur de tronc à la hauteur f. */
  function torsoHalfAt(stops, f) {
    for (let i = 0; i < stops.length - 1; i++) {
      const [f1, w1] = stops[i];
      const [f2, w2] = stops[i + 1];
      if (f <= f1 && f >= f2) return lerp(w1, w2, (f1 - f) / (f1 - f2));
    }
    return f > stops[0][0] ? stops[0][1] : stops[stops.length - 1][1];
  }

  /**
   * Points d'un côté (sign = +1 : côté gauche de la personne, à droite à l'écran),
   * du cou jusqu'à l'entrejambe.
   */
  function sidePoints(m, H, sign) {
    const side = sign > 0 ? 'L' : 'R';
    const W = torsoWidths(m);
    const y = (f) => H * (1 - f);
    const P = (x, f) => [sign * x, y(f)];

    // --- Jambes
    const thighC = m['thigh' + side];
    const calfC = m['calf' + side];
    const thighA = thighC / (Math.PI * 1.9);
    const legCx = Math.max(thighA * 0.55, W.hip - thighA * 0.92);
    const kneeCx = legCx * 0.8;
    const calfCx = legCx * 0.78;
    const ankleCx = legCx * 0.74;
    const calfR = radius(calfC);
    const kneeR = calfR * 0.8;
    const ankleR = Math.max(2.6, calfR * 0.48);

    // Profil du tronc (pour dégager les bras)
    const torsoStops = [
      [F.armpit, W.chest * 0.98],
      [F.chest, W.chest],
      [F.waist, W.waist],
      [F.abdomen, W.abdomen],
      [F.hip, W.hip],
      [F.crotch, Math.max(W.hip * 0.98, legCx + thighA * 0.98)],
      [F.thigh, legCx + thighA],
    ];

    // --- Bras en deux segments : bras incliné juste assez pour dégager le tronc,
    //     avant-bras le plus vertical possible (pose en « A » légère).
    const bicepsR = radius(m['biceps' + side]);
    const armR = {
      deltoid: bicepsR * 1.12,
      biceps: bicepsR,
      elbow: bicepsR * 0.74,
      forearm: bicepsR * 0.86,
      wrist: bicepsR * 0.52,
      hand: bicepsR * 0.66,
    };
    const jointX = W.shoulder - bicepsR * 0.95;
    const jointF = F.shoulder;
    const need = (part, f, gap) => torsoHalfAt(torsoStops, f) + armR[part] + gap;

    let upperSlope = 6; // cm d'écart latéral par unité de fraction de hauteur
    [['biceps', F.biceps, 0.8], ['elbow', F.elbow, 1.4]].forEach(([part, f, gap]) => {
      upperSlope = Math.max(upperSlope, (need(part, f, gap) - jointX) / (jointF - f));
    });
    const elbowX = jointX + upperSlope * (jointF - F.elbow);
    let lowerSlope = 0;
    [['forearm', F.forearm, 1.8], ['wrist', F.wrist, 2.6], ['hand', F.hand, 2.8]].forEach(([part, f, gap]) => {
      lowerSlope = Math.max(lowerSlope, (need(part, f, gap) - elbowX) / (F.elbow - f));
    });
    const axis = (f) =>
      f >= F.elbow ? jointX + upperSlope * (jointF - f) : elbowX + lowerSlope * (F.elbow - f);

    const armOuter = [
      P(axis(F.deltoid) + armR.deltoid, F.deltoid),
      P(axis(F.biceps) + armR.biceps, F.biceps),
      P(axis(F.elbow) + armR.elbow, F.elbow),
      P(axis(F.forearm) + armR.forearm, F.forearm),
      P(axis(F.wrist) + armR.wrist, F.wrist),
      P(axis(F.hand) + armR.hand, F.hand),
      P(axis(F.fingertip) + armR.wrist * 0.3, F.fingertip),
    ];
    const armInner = [
      P(axis(F.hand) - armR.hand, F.hand),
      P(axis(F.wrist) - armR.wrist, F.wrist),
      P(axis(F.forearm) - armR.forearm, F.forearm),
      P(axis(F.elbow) - armR.elbow, F.elbow),
      P(axis(F.biceps) - armR.biceps, F.biceps),
    ];

    const points = [
      P(W.neck, F.neck),
      P(W.neck + (W.shoulder - W.neck) * 0.55, F.trap),
      P(W.shoulder, F.shoulder),
      ...armOuter,
      ...armInner,
      P(W.chest * 0.98, F.armpit),
      P(W.chest, F.chest),
      P(W.waist, F.waist),
      P(W.abdomen, F.abdomen),
      P(W.hip, F.hip),
      P(legCx + thighA, F.thigh),
      P(kneeCx + kneeR, F.knee),
      P(calfCx + calfR * 1.05, F.calf),
      P(ankleCx + ankleR, F.ankle),
      P(ankleCx + ankleR + 3.2, F.floor + 0.004),
      P(Math.max(0.6, ankleCx - ankleR - 1.2), F.floor + 0.004),
      P(Math.max(0.6, ankleCx - ankleR), F.ankle),
      P(Math.max(0.8, calfCx - calfR * 0.95), F.calf),
      P(Math.max(0.8, kneeCx - kneeR), F.knee),
      P(Math.max(0.3, legCx - thighA), F.thigh),
    ];

    // Repères pour étiquettes / heatmap
    const levels = {
      neck: { y: y(F.neck), x: sign * W.neck },
      shoulder: { y: y(F.shoulder), x: sign * W.shoulder },
      chest: { y: y(F.chest), x: sign * W.chest },
      waist: { y: y(F.waist), x: sign * W.waist },
      abdomen: { y: y(F.abdomen), x: sign * W.abdomen },
      hip: { y: y(F.hip), x: sign * W.hip },
      ['biceps' + side]: { y: y(F.biceps), x: sign * (axis(F.biceps) + armR.biceps), armInner: sign * (axis(F.biceps) - armR.biceps) },
      ['thigh' + side]: { y: y(F.thigh), x: sign * (legCx + thighA) },
      ['calf' + side]: { y: y(F.calf), x: sign * (calfCx + calfR * 1.05) },
    };

    return { points, levels, armInnerAt: (f) => sign * (axis(f) - armR.biceps) };
  }

  /** Géométrie complète d'un relevé. */
  function build(m, heightCm) {
    const H = heightCm;
    const W = torsoWidths(m);
    const left = sidePoints(m, H, 1); // côté gauche de la personne (x > 0)
    const right = sidePoints(m, H, -1);

    // Tête : ellipse fixe, raccordée au cou
    const head = { cx: 0, cy: H * (1 - F.headCenter), rx: H * 0.048, ry: H * 0.066 };
    const neckX = Math.min(W.neck * 0.92, head.rx * 0.9);
    const theta0 = Math.asin(neckX / head.rx);
    const headPts = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      // de -theta0 (côté x<0) en passant par le haut jusqu'à +theta0
      const th = -theta0 - (i / steps) * (2 * Math.PI - 2 * theta0);
      headPts.push([head.cx + head.rx * Math.sin(th), head.cy + head.ry * Math.cos(th)]);
    }

    // Contour fermé : tête -> côté gauche (x>0) vers le bas -> entrejambe -> côté droit vers le haut
    const crotch = [0, H * (1 - F.crotch)];
    const outline = [...headPts, ...left.points, crotch, ...right.points.slice().reverse()];

    return {
      outline,
      head,
      height: H,
      // levels : repères côté écran droit (gauche de la personne) ; levelsOpp : côté écran gauche
      levels: left.levels,
      levelsOpp: right.levels,
      F,
      date: m.date,
      source: m,
    };
  }

  /** Interpolation entre deux géométries (même topologie). */
  function interpolate(a, b, t) {
    return {
      ...b,
      outline: a.outline.map((p, i) => [lerp(p[0], b.outline[i][0], t), lerp(p[1], b.outline[i][1], t)]),
    };
  }

  SP.silhouette.model = { build, fillGaps, interpolate, F };
})(window.SP);
