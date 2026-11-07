/**
 * Silhouette de profil (vue de côté, face tournée vers la droite).
 *
 * Même principe que la vue de face : chaque tour est une ellipse ; la vue de
 * profil montre sa profondeur (demi-profondeur = demi-largeur × rapport de
 * profondeur). La profondeur est ensuite répartie devant / derrière l'axe du
 * corps selon l'anatomie : le ventre avance, les fessiers et les mollets reculent.
 * Les bras sont masqués (ils se superposeraient au tronc).
 *
 * Repère : x > 0 = avant, y = 0 au sommet du crâne, y = taille au sol.
 * Toutes les géométries ont la même topologie (interpolation possible).
 */
(function (SP) {
  'use strict';

  const { mean } = SP.core.utils;
  const { torsoWidths, radius, DEPTH_RATIO, F } = SP.silhouette.model;

  /** Part de la profondeur située devant l'axe du corps, par niveau. */
  const FRONT_SHARE = { neck: 0.5, chest: 0.55, waist: 0.5, abdomen: 0.58, hip: 0.42 };

  function build(m, heightCm) {
    const H = heightCm;
    const y = (f) => H * (1 - f);
    const W = torsoWidths(m);
    const depth = (key) => 2 * W[key] * DEPTH_RATIO[key];
    const front = (key) => depth(key) * FRONT_SHARE[key];
    const back = (key) => -depth(key) * (1 - FRONT_SHARE[key]);

    // Membres : moyenne gauche / droite (une seule jambe visible de profil)
    const thighR = radius(mean([m.thighL, m.thighR]));
    const calfR = radius(mean([m.calfL, m.calfR]));
    const kneeR = calfR * 0.8;
    const ankleR = Math.max(2.6, calfR * 0.48);
    const footLength = H * 0.15;

    // Tête : ellipse légèrement avancée, du menton à la nuque en passant par le sommet
    const head = { cx: 1.2, cy: H * (1 - 0.935), rx: H * 0.06, ry: H * 0.066 };
    const headPts = [];
    const from = (60 * Math.PI) / 180; // menton (avant-bas)
    const to = (-240 * Math.PI) / 180; // nuque (arrière-bas)
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const th = from + (i / steps) * (to - from);
      headPts.push([head.cx + head.rx * Math.cos(th), head.cy + head.ry * Math.sin(th)]);
    }

    // Dos : de la nuque au talon
    const backSide = [
      [back('neck'), y(F.neck)],
      [back('chest') * 0.95, y(F.shoulder)],
      [back('chest'), y(F.chest)],
      [back('waist'), y(F.waist)],
      [back('abdomen'), y(F.abdomen)],
      [back('hip'), y(F.hip)],
      [back('hip') * 0.85, y(F.crotch)],
      [-thighR, y(F.thigh)],
      [-kneeR * 0.9, y(F.knee)],
      [-calfR * 1.25, y(F.calf)],
      [-ankleR, y(F.ankle)],
      [-ankleR - 2.5, y(0.004)], // talon
    ];

    // Avant : des orteils au cou
    const frontSide = [
      [footLength - ankleR - 2.5, y(0.004)], // orteils
      [ankleR + 2, y(0.03)], // cou-de-pied
      [ankleR, y(F.ankle)],
      [calfR * 0.75, y(F.calf)],
      [kneeR * 1.1, y(F.knee)],
      [thighR, y(F.thigh)],
      [front('hip') * 0.95, y(F.crotch)],
      [front('hip'), y(F.hip)],
      [front('abdomen'), y(F.abdomen)],
      [front('waist'), y(F.waist)],
      [front('chest'), y(F.chest)],
      [front('chest') * 0.85, y(F.shoulder)],
      [front('neck'), y(F.neck)],
    ];

    return {
      outline: [...headPts, ...backSide, ...frontSide],
      height: H,
      date: m.date,
      source: m,
    };
  }

  SP.silhouette.profile = { build };
})(window.SP);
