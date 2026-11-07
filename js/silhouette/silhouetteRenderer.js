/**
 * Rendu SVG des silhouettes : contour lissé (Catmull-Rom -> Bézier),
 * superposition, comparaison annotée, carte de chaleur des variations.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, mixHex, withAlpha, isFiniteNumber, clamp } = SP.core.utils;
  const NS = 'http://www.w3.org/2000/svg';
  const LABEL_GAP = 8; // hauteur d'une étiquette sur deux lignes (unités SVG = cm)

  /** Zones annotées : clé, libellé, côté d'affichage (+1 droite écran, -1 gauche). */
  const LABEL_ZONES = [
    { key: 'neck', label: 'Cou', side: 1 },
    { key: 'shoulder', label: 'Épaules', side: 1 },
    { key: 'chest', label: 'Poitrine', side: 1 },
    { key: 'bicepsL', label: 'Biceps G', side: 1 },
    { key: 'waist', label: 'Taille', side: 1 },
    { key: 'abdomen', label: 'Abdomen', side: 1 },
    { key: 'hip', label: 'Hanches', side: 1 },
    { key: 'thighL', label: 'Cuisse G', side: 1 },
    { key: 'calfL', label: 'Mollet G', side: 1 },
    { key: 'bicepsR', label: 'Biceps D', side: -1 },
    { key: 'thighR', label: 'Cuisse D', side: -1 },
    { key: 'calfR', label: 'Mollet D', side: -1 },
  ];

  function el(name, attrs = {}, parent) {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v !== undefined && v !== null) node.setAttribute(k, v);
    });
    if (parent) parent.appendChild(node);
    return node;
  }

  /** Spline Catmull-Rom fermée convertie en chemin Bézier cubique. */
  function smoothPath(points, tension = 0.5) {
    const n = points.length;
    const k = tension / 3;
    const p = (i) => points[(i + n) % n];
    let d = `M${p(0)[0].toFixed(2)},${p(0)[1].toFixed(2)}`;
    for (let i = 0; i < n; i++) {
      const p0 = p(i - 1);
      const p1 = p(i);
      const p2 = p(i + 1);
      const p3 = p(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
      const c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
      d += `C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    return d + 'Z';
  }

  /** Boîte englobante commune à plusieurs géométries. */
  function bounds(geoms) {
    let minX = Infinity;
    let maxX = -Infinity;
    let H = 0;
    geoms.forEach((g) => {
      g.outline.forEach(([x]) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      });
      H = Math.max(H, g.height);
    });
    const half = Math.max(Math.abs(minX), Math.abs(maxX));
    return { half, H };
  }

  function prepare(svg, geoms, { labelSpace = 0 } = {}) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const { half, H } = bounds(geoms);
    const w = half + 4 + labelSpace;
    svg.setAttribute('viewBox', `${(-w).toFixed(1)} -4 ${(2 * w).toFixed(1)} ${(H + 8).toFixed(1)}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return { half, H, w };
  }

  /** Lignes de repère horizontales discrètes (sol, hauteurs clés). */
  function drawGuides(svg, H, half, F) {
    const g = el('g', { 'aria-hidden': 'true' }, svg);
    [F.shoulder, F.waist, F.hip, F.knee].forEach((f) => {
      const y = H * (1 - f);
      el('line', { x1: -half - 2, x2: half + 2, y1: y, y2: y, class: 'sil-level' }, g);
    });
    el('line', { x1: -half - 2, x2: half + 2, y1: H, y2: H, class: 'sil-level', style: 'stroke:var(--axis)' }, g);
  }

  /** Couleur d'une date dans la rampe séquentielle (ancien clair -> récent foncé). */
  function timeColor(t, tokens) {
    const ramp = [tokens.seq[1], tokens.seq[2], tokens.seq[3], tokens.seq[4]];
    const pos = clamp(t, 0, 1) * (ramp.length - 1);
    const i = Math.min(ramp.length - 2, Math.floor(pos));
    return mixHex(ramp[i], ramp[i + 1], pos - i);
  }

  /**
   * Superposition de toutes les dates. `selected` = index mis en avant.
   * `override` = géométrie interpolée (animation) remplaçant la sélection.
   */
  function overlay(svg, geoms, { selected, override, tokens, F }) {
    const { half, H } = prepare(svg, geoms);
    drawGuides(svg, H, half, F);
    const n = geoms.length;
    geoms.forEach((g, i) => {
      if (i === selected) return;
      const color = timeColor(n > 1 ? i / (n - 1) : 1, tokens);
      el('path', { d: smoothPath(g.outline), class: 'sil-outline', style: `stroke:${color};opacity:0.85` }, svg).appendChild(
        titleNode(g)
      );
    });
    const focus = override || geoms[selected];
    if (focus) {
      const color = timeColor(n > 1 ? selected / (n - 1) : 1, tokens);
      el(
        'path',
        {
          d: smoothPath(focus.outline),
          class: 'sil-fill',
          style: `fill:${withAlpha(color, 0.16)};stroke:${color};stroke-width:0.7`,
        },
        svg
      );
    }
  }

  function titleNode(g) {
    const t = document.createElementNS(NS, 'title');
    t.textContent = SP.core.utils.fmtDate(g.date, 'long');
    return t;
  }

  /** Comparaison annotée départ vs sélection. */
  function compare(svg, a, b, { tokens, F }) {
    const { half, H } = prepare(svg, [a, b], { labelSpace: 30 });
    drawGuides(svg, H, half, F);
    el('path', { d: smoothPath(a.outline), class: 'sil-outline', style: `stroke:${tokens.series[1]};stroke-width:0.55;stroke-dasharray:1.6 1.1` }, svg);
    el('path', { d: smoothPath(b.outline), class: 'sil-fill', style: `fill:${withAlpha(tokens.series[0], 0.18)};stroke:${tokens.series[0]};stroke-width:0.7` }, svg);
    drawLabels(svg, a, b, half);
  }

  function zoneAnchor(geom, zone) {
    return zone.side > 0 ? geom.levels[zone.key] : geom.levelsOpp[zone.key];
  }

  function drawLabels(svg, a, b, half) {
    const g = el('g', { class: 'sil-labels' }, svg);
    const placed = { 1: [], '-1': [] };
    LABEL_ZONES.forEach((zone) => {
      const anchorB = zoneAnchor(b, zone);
      const anchorA = zoneAnchor(a, zone);
      if (!anchorB) return;
      const vA = a.source[zone.key];
      const vB = b.source[zone.key];
      if (!isFiniteNumber(vB)) return;
      const d = isFiniteNumber(vA) ? vB - vA : null;
      const s = zone.side;
      const outerX = s > 0 ? Math.max(anchorB.x, anchorA ? anchorA.x : -Infinity) : Math.min(anchorB.x, anchorA ? anchorA.x : Infinity);
      // Anti-collision verticale simple
      let y = anchorB.y;
      placed[s].forEach((py) => {
        if (Math.abs(py - y) < LABEL_GAP) y = py + LABEL_GAP;
      });
      placed[s].push(y);
      const colX = s * (half + 6);
      el('line', { x1: outerX + s * 0.8, y1: anchorB.y, x2: colX - s * 1, y2: y, style: 'stroke:var(--axis);stroke-width:0.18' }, g);
      el('circle', { cx: outerX, cy: anchorB.y, r: 0.55, style: 'fill:var(--text-secondary)' }, g);
      const anchor = s > 0 ? 'start' : 'end';
      el('text', { x: colX, y: y - 0.6, 'text-anchor': anchor, class: 'sil-label' }, g).textContent = zone.label;
      const cls = d === null || Math.abs(d) < 0.05 ? 'sil-label sil-label--strong' : d < 0 ? 'sil-label sil-label--down' : 'sil-label sil-label--up';
      el('text', { x: colX, y: y + 2.9, 'text-anchor': anchor, class: cls }, g).textContent =
        `${fmt(vB, 1)} cm` + (d === null ? '' : ` (${fmtDelta(d, 1)})`);
    });
  }

  /** Couleur divergente pour une variation relative (%). */
  function divergingColor(pct, tokens, limit = 6) {
    const t = clamp(Math.abs(pct) / limit, 0, 1);
    const end = pct < 0 ? tokens.down : tokens.up;
    return mixHex(tokens.mid, end, t);
  }

  /**
   * Carte de chaleur : silhouette actuelle découpée en bandes colorées selon la
   * variation relative de chaque zone (bleu = baisse, rouge = hausse).
   */
  function heat(svg, a, b, { tokens, F, uid = 'heat' }) {
    const { half, H } = prepare(svg, [a, b]);
    const y = (f) => H * (1 - f);
    const clipId = `clip-${uid}`;
    const defs = el('defs', {}, svg);
    const clip = el('clipPath', { id: clipId }, defs);
    el('path', { d: smoothPath(b.outline) }, clip);

    const pct = (key) => {
      const va = a.source[key];
      const vb = b.source[key];
      return isFiniteNumber(va) && isFiniteNumber(vb) && va ? ((vb - va) / va) * 100 : null;
    };
    const W = half + 4;
    const g = el('g', { 'clip-path': `url(#${clipId})` }, svg);
    el('rect', { x: -W, y: 0, width: 2 * W, height: H, style: `fill:${tokens.mid}` }, g);

    // Bandes du tronc et des jambes (gauche/droite séparées pour les membres)
    const bands = [
      { key: 'neck', from: 0.87, to: 0.83, label: 'Cou' },
      { key: 'shoulder', from: 0.83, to: 0.765, label: 'Épaules' },
      { key: 'chest', from: 0.765, to: 0.675, label: 'Poitrine' },
      { key: 'waist', from: 0.675, to: 0.605, label: 'Taille' },
      { key: 'abdomen', from: 0.605, to: 0.55, label: 'Abdomen' },
      { key: 'hip', from: 0.55, to: 0.465, label: 'Hanches' },
      { key: 'thighL', keyR: 'thighR', from: 0.465, to: 0.33, label: 'Cuisses' },
      { key: 'calfL', keyR: 'calfR', from: 0.27, to: 0.1, label: 'Mollets' },
    ];
    bands.forEach((band) => {
      const yTop = y(band.from);
      const h = y(band.to) - yTop;
      if (band.keyR) {
        addRect(g, 0, yTop, W, h, pct(band.key), tokens, `${band.label} G`);
        addRect(g, -W, yTop, W, h, pct(band.keyR), tokens, `${band.label} D`);
      } else {
        addRect(g, -W, yTop, 2 * W, h, pct(band.key), tokens, band.label);
      }
    });

    // Bras (au-delà du bord interne du biceps)
    const armTop = y(0.79);
    const armH = y(0.6) - armTop;
    const innerL = b.levels.bicepsL ? b.levels.bicepsL.armInner : half * 0.6;
    const innerR = b.levelsOpp.bicepsR ? b.levelsOpp.bicepsR.armInner : -half * 0.6;
    addRect(g, innerL, armTop, W - innerL, armH, pct('bicepsL'), tokens, 'Biceps G');
    addRect(g, -W, armTop, W + innerR, armH, pct('bicepsR'), tokens, 'Biceps D');

    // Avant-bras et mains : pas de mesure -> teinte neutre (au-delà du bord des cuisses)
    const handTop = y(0.6);
    const handH = y(0.36) - handTop;
    const legOuter = (lv, side) => Math.max(Math.abs(lv.hip.x), Math.abs(lv['thigh' + side].x)) + 1;
    const outerL = legOuter(b.levels, 'L');
    const outerR = legOuter(b.levelsOpp, 'R');
    el('rect', { x: outerL, y: handTop, width: W - outerL, height: handH, style: `fill:${tokens.mid}` }, g);
    el('rect', { x: -W, y: handTop, width: W - outerR, height: handH, style: `fill:${tokens.mid}` }, g);

    el('path', { d: smoothPath(b.outline), class: 'sil-outline', style: 'stroke:var(--text-secondary);stroke-width:0.4' }, svg);
    el('path', { d: smoothPath(a.outline), class: 'sil-outline', style: 'stroke:var(--text-muted);stroke-width:0.3;stroke-dasharray:1.2 1' }, svg);
  }

  function addRect(parent, x, yTop, w, h, pct, tokens, label) {
    if (w <= 0 || h <= 0) return;
    const fill = pct === null ? tokens.mid : divergingColor(pct, tokens);
    const r = el('rect', { x, y: yTop, width: w, height: h, style: `fill:${fill}` }, parent);
    r.setAttribute('data-tip', pct === null ? `${label} : pas de données` : `${label} : ${fmtDelta(pct, 1)} %`);
  }

  /** Mini silhouette (filmstrip). */
  function mini(svg, geom, refGeoms, { color, tokens, F }) {
    const { half, H } = prepare(svg, refGeoms);
    drawGuides(svg, H, half, F);
    el('path', { d: smoothPath(geom.outline), class: 'sil-fill', style: `fill:${withAlpha(color, 0.2)};stroke:${color};stroke-width:0.8` }, svg);
  }

  SP.silhouette.renderer = { overlay, compare, heat, mini, timeColor, divergingColor, smoothPath };
})(window.SP);
