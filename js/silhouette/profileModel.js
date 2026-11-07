/**
 * Silhouette de profil (vue de côté, face tournée vers la droite).
 *
 * Chaque tour est une ellipse ; de profil on voit sa profondeur
 * (= 2 × demi-largeur × rapport de profondeur, comme la vue de face).
 * Cette profondeur est répartie devant / derrière l'axe du corps selon
 * l'anatomie, puis placée sur des repères qui donnent les courbes naturelles :
 * cyphose du haut du dos, lordose lombaire, fessiers, ventre, genou, mollet.
 * Le bras (épaisseur tirée du tour de biceps) est une forme à part, dessinée
 * par-dessus le tronc.
 *
 * Repère : x > 0 = avant, y = 0 au sommet du crâne, y = taille au sol.
 * Toutes les géométries ont la même topologie (interpolation possible).
 */
(function (SP) {
  'use strict';

  const { mean, lerp } = SP.core.utils;
  const { torsoWidths, radius, DEPTH_RATIO } = SP.silhouette.model;

  /** Part de la profondeur située devant l'axe du corps. */
  // Hanches : 45 % devant / 55 % derrière → saillie fessière ≈ 5-7 cm au-delà du creux lombaire
  const FRONT_SHARE = { neck: 0.42, chest: 0.48, waist: 0.5, abdomen: 0.6, hip: 0.45 };

  /**
   * Tête de profil, coordonnées pour 170 cm (mises à l'échelle) relatives au
   * centre du crâne : de la base du crâne (arrière) au dessous du menton.
   */
  const HEAD = [
    [-7.0, 5.5], // base du crâne
    [-9.2, -0.5], // occiput
    [-7.2, -8.5],
    [-0.5, -12.2], // sommet
    [7.5, -9.0], // front
    [9.8, -4.5], // arcade
    [11.6, 0.3], // nez
    [9.9, 2.4],
    [10.0, 4.6], // lèvres
    [8.8, 8.6], // menton
    [4.5, 9.8], // sous le menton
  ];

  /** Axe du bras : [fraction de hauteur, décalage x] de l'épaule au bout des doigts. */
  const ARM_AXIS = [
    [0.82, -2.0],
    [0.7, -2.2],
    [0.63, -1.6],
    [0.485, 1.2],
    [0.4, 2.2],
  ];

  function armAxisX(f) {
    for (let i = 0; i < ARM_AXIS.length - 1; i++) {
      const [f1, x1] = ARM_AXIS[i];
      const [f2, x2] = ARM_AXIS[i + 1];
      if (f <= f1 && f >= f2) return lerp(x1, x2, (f1 - f) / (f1 - f2));
    }
    return ARM_AXIS[ARM_AXIS.length - 1][1];
  }

  function build(m, heightCm) {
    const H = heightCm;
    const k = H / 170;
    const y = (f) => H * (1 - f);
    const P = (x, f) => [x, y(f)];

    // Profondeurs du tronc, réparties devant / derrière
    const W = torsoWidths(m);
    const depth = (key) => 2 * W[key] * DEPTH_RATIO[key];
    const front = (key) => depth(key) * FRONT_SHARE[key];
    const back = (key) => depth(key) * (1 - FRONT_SHARE[key]);

    // Membres : moyenne gauche / droite
    const thighR = radius(mean([m.thighL, m.thighR]));
    const calfR = radius(mean([m.calfL, m.calfR]));
    const bicepsR = radius(mean([m.bicepsL, m.bicepsR]));
    const kneeR = calfR * 0.8;
    const ankleR = Math.max(2.6, calfR * 0.48);
    const thighCx = 1.5;
    const kneeCx = 2;
    const heel = 6 * k;
    const toes = H * 0.152 - heel;

    // Avant : du cou aux orteils
    const frontSide = [
      P(depth('neck') * FRONT_SHARE.neck, 0.85),
      P(front('chest') * 0.72, 0.815), // creux sus-sternal
      P(front('chest'), 0.74), // poitrine
      P(front('chest') * 0.95, 0.69), // sous la poitrine
      P(front('waist'), 0.635),
      P(lerp(front('waist'), front('abdomen'), 0.6), 0.6),
      P(front('abdomen'), 0.565), // ventre
      P(lerp(front('abdomen'), front('hip'), 0.45), 0.52), // bas-ventre
      P(Math.max(front('hip') * 0.88, thighCx + thighR), 0.475), // pubis : jamais en retrait de la cuisse
      P(thighCx + thighR, 0.42), // quadriceps
      P(kneeCx + kneeR * 1.1, 0.32),
      P(kneeCx + kneeR * 1.15, 0.285), // rotule
      P(1 + calfR * 0.62, 0.2), // tibia
      P(ankleR * 0.8, 0.06),
      P(ankleR + 5 * k, 0.03), // cou-de-pied
      P(toes, 0.004), // orteils
    ];

    // Arrière : du talon à la nuque
    const backSide = [
      P(-heel, 0.004),
      P(-heel * 1.03, 0.03), // talon
      P(-ankleR * 0.75, 0.07), // tendon d'Achille
      P(-calfR * 0.9, 0.15),
      P(-calfR * 1.35, 0.22), // mollet
      P(-kneeR * 0.8, 0.285), // creux du genou
      P(thighCx - thighR * 0.95, 0.37), // ischio-jambiers
      P(-back('hip') * 0.82, 0.445), // pli fessier
      P(-back('hip'), 0.495), // fessiers (point le plus saillant)
      P(-lerp(back('abdomen') * 0.9, back('hip'), 0.5), 0.54), // haut des fessiers
      P(-back('abdomen') * 0.9, 0.585), // creux lombaire (lordose)
      P(-back('waist') * 0.95, 0.625),
      P(-back('chest'), 0.7),
      P(-back('chest') * 1.03, 0.77), // omoplates (cyphose)
      P(-back('chest') * 0.75, 0.815), // trapèzes
      P(-depth('neck') * (1 - FRONT_SHARE.neck), 0.85), // nuque
    ];

    // Tête, mise à l'échelle et centrée au-dessus du cou
    const hx = 1 * k;
    const hy = 12.2 * k;
    const head = HEAD.map(([dx, dy]) => [hx + dx * k, hy + dy * k]);

    // Bras : épaisseur selon le biceps, le long de l'axe
    const r = {
      top: bicepsR * 0.55,
      deltoid: bicepsR * 1.15,
      biceps: bicepsR,
      elbow: bicepsR * 0.72,
      forearm: bicepsR * 0.85,
      wrist: bicepsR * 0.45,
      hand: bicepsR * 0.6,
    };
    const A = (f, dx) => P(armAxisX(f) + dx, f);
    const arm = [
      A(0.82, r.top),
      A(0.78, r.deltoid * 0.9),
      A(0.7, r.biceps),
      A(0.63, r.elbow),
      A(0.585, r.forearm),
      A(0.485, r.wrist),
      A(0.44, r.hand),
      A(0.4, 0),
      A(0.44, -r.hand),
      A(0.485, -r.wrist),
      A(0.585, -r.forearm),
      A(0.63, -r.elbow),
      A(0.7, -r.biceps * 1.1), // triceps
      A(0.78, -r.deltoid),
      A(0.82, -r.top),
    ];

    return {
      outline: [...frontSide, ...backSide, ...head],
      parts: [arm],
      height: H,
      date: m.date,
      source: m,
    };
  }

  SP.silhouette.profile = { build };
})(window.SP);
