/**
 * Vue Silhouette : orchestration des modes (superposition / comparaison),
 * curseur temporel, lecture animée, filmstrip, carte de chaleur, détail chiffré.
 */
(function (SP) {
  'use strict';

  const { fmt, fmtDelta, fmtDate, lerp, isFiniteNumber, escapeHtml } = SP.core.utils;
  const { model, renderer, profile, exportPng } = SP.silhouette;
  const { CM_ZONES } = SP.parsers.measurements;
  const theme = SP.charts.theme;

  const TWEEN_MS = 900;

  const view = {
    geoms: [],
    profiles: [],
    splitPct: 50,
    selected: 0,
    mode: 'overlay',
    playing: false,
    rafId: null,
    bound: false,
  };

  const $ = (id) => document.getElementById(id);

  function interpolateGeom(a, b, t) {
    const g = model.interpolate(a, b, t);
    const source = { ...b.source };
    CM_ZONES.forEach(({ key }) => {
      if (isFiniteNumber(a.source[key]) && isFiniteNumber(b.source[key])) source[key] = lerp(a.source[key], b.source[key], t);
    });
    // Repères interpolés pour les étiquettes
    const lerpLevels = (la, lb) => {
      const out = {};
      Object.keys(lb).forEach((k) => {
        out[k] = { ...lb[k] };
        if (la[k]) {
          out[k].x = lerp(la[k].x, lb[k].x, t);
          out[k].y = lerp(la[k].y, lb[k].y, t);
          if (la[k].armInner !== undefined) out[k].armInner = lerp(la[k].armInner, lb[k].armInner, t);
        }
      });
      return out;
    };
    return {
      ...g,
      source,
      levels: lerpLevels(a.levels, b.levels),
      levelsOpp: lerpLevels(a.levelsOpp, b.levelsOpp),
      date: new Date(lerp(a.date.getTime(), b.date.getTime(), t)),
    };
  }

  /** Avant / après à rideau : premier relevé vs relevé sélectionné. */
  function drawSplit(current) {
    const svg = $('sil-split');
    if (!svg || !view.geoms.length) return;
    renderer.split(svg, view.geoms[0], current || view.geoms[view.selected], view.splitPct, {
      tokens: theme.tokens(),
      F: model.F,
    });
  }

  /** Vue de profil, dans le même mode que la vue de face. */
  function drawProfile(overrideProfile) {
    const svg = $('sil-profile');
    if (!svg || !view.profiles.length) return;
    const tokens = theme.tokens();
    const F = model.F;
    if (view.mode === 'overlay') {
      renderer.overlay(svg, view.profiles, { selected: view.selected, override: overrideProfile, tokens, F });
    } else {
      const current = overrideProfile || view.profiles[view.selected];
      renderer.compare(svg, view.profiles[0], current, { tokens, F, labels: false });
    }
  }

  function draw(override, overrideProfile) {
    const svg = $('sil-stage');
    const heatSvg = $('sil-heat');
    if (!svg || !view.geoms.length) return;
    const tokens = theme.tokens();
    const F = model.F;
    const current = override || view.geoms[view.selected];
    const first = view.geoms[0];

    if (view.mode === 'overlay') {
      renderer.overlay(svg, view.geoms, { selected: view.selected, override, tokens, F });
    } else {
      renderer.compare(svg, first, current, { tokens, F });
    }
    drawProfile(overrideProfile);
    drawSplit(current);
    if (heatSvg) {
      renderer.heat(heatSvg, first, current, { tokens, F, uid: 'main' });
      SP.ui.tooltip.bind(heatSvg, '[data-tip]');
    }

    $('sil-date').textContent = fmtDate(current.date, 'long');
    $('sil-caption').textContent =
      view.mode === 'overlay'
        ? `${view.geoms.length} relevés superposés — le contour plein correspond au ${fmtDate(current.date, 'long')}.`
        : `Pointillés : ${fmtDate(first.date, 'long')} — plein : ${fmtDate(current.date, 'long')}.`;
    renderDetail(first, current);
    updateFilmstripActive();
  }

  function renderDetail(a, b) {
    const host = $('sil-detail');
    if (!host) return;
    const rows = CM_ZONES.map((z) => {
      const va = a.source[z.key];
      const vb = b.source[z.key];
      const d = isFiniteNumber(va) && isFiniteNumber(vb) ? vb - va : null;
      const cls = d === null || Math.abs(d) < 0.05 ? '' : d < 0 ? 'cell-down' : 'cell-up';
      return `<tr><td>${escapeHtml(z.label)}</td><td>${fmt(va, 1)}</td><td>${fmt(vb, 1)}</td><td class="${cls}">${
        d === null ? '—' : fmtDelta(d, 1)
      }</td><td class="${cls}">${d === null || !va ? '—' : fmtDelta((d / va) * 100, 1) + ' %'}</td></tr>`;
    }).join('');
    host.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Zone (cm)</th><th>${fmtDate(a.date)}</th><th>${fmtDate(b.date)}</th><th>Δ cm</th><th>Δ %</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderFilmstrip() {
    const host = $('sil-film');
    if (!host) return;
    const tokens = theme.tokens();
    const n = view.geoms.length;
    host.innerHTML = view.geoms
      .map(
        (g, i) =>
          `<button type="button" class="filmstrip__item" data-index="${i}" aria-label="Silhouette du ${fmtDate(g.date, 'long')}">
             <svg></svg><span>${fmtDate(g.date)}</span>
           </button>`
      )
      .join('');
    host.querySelectorAll('.filmstrip__item').forEach((btn, i) => {
      renderer.mini(btn.querySelector('svg'), view.geoms[i], view.geoms, {
        color: renderer.timeColor(n > 1 ? i / (n - 1) : 1, tokens),
        tokens,
        F: model.F,
      });
    });
  }

  function updateFilmstripActive() {
    document.querySelectorAll('#sil-film .filmstrip__item').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.index) === view.selected);
    });
  }

  function select(index) {
    stop();
    view.selected = Math.max(0, Math.min(view.geoms.length - 1, index));
    $('sil-slider').value = String(view.selected);
    draw();
  }

  function play() {
    if (view.geoms.length < 2) return;
    view.playing = true;
    $('sil-play').textContent = '❚❚ Pause';
    let from = view.selected >= view.geoms.length - 1 ? 0 : view.selected;
    let start = null;
    const step = (ts) => {
      if (!view.playing) return;
      if (start === null) start = ts;
      const t = Math.min(1, (ts - start) / TWEEN_MS);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const to = from + 1;
      view.selected = t < 0.5 ? from : to;
      $('sil-slider').value = String(view.selected);
      draw(
        interpolateGeom(view.geoms[from], view.geoms[to], eased),
        model.interpolate(view.profiles[from], view.profiles[to], eased)
      );
      if (t >= 1) {
        from = to;
        start = null;
        if (from >= view.geoms.length - 1) {
          view.selected = from;
          stop();
          draw();
          return;
        }
      }
      view.rafId = requestAnimationFrame(step);
    };
    view.rafId = requestAnimationFrame(step);
  }

  function stop() {
    view.playing = false;
    if (view.rafId) cancelAnimationFrame(view.rafId);
    view.rafId = null;
    const btn = $('sil-play');
    if (btn) btn.textContent = '▶ Lecture';
  }

  function bind() {
    if (view.bound) return;
    view.bound = true;
    $('sil-split-range').addEventListener('input', (e) => {
      view.splitPct = Number(e.target.value);
      drawSplit();
    });
    exportPng.bind($('section-silhouette'));
    $('sil-slider').addEventListener('input', (e) => select(Number(e.target.value)));
    $('sil-play').addEventListener('click', () => (view.playing ? stop() : play()));
    $('sil-film').addEventListener('click', (e) => {
      const btn = e.target.closest('.filmstrip__item');
      if (btn) select(Number(btn.dataset.index));
    });
    $('sil-mode').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      view.mode = btn.dataset.mode;
      document.querySelectorAll('#sil-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      draw();
    });
  }

  function renderTimelineLegend() {
    const host = $('sil-timeline-legend');
    if (!host || !view.geoms.length) return;
    const tokens = theme.tokens();
    const stops = [0, 0.33, 0.66, 1].map((t) => renderer.timeColor(t, tokens)).join(',');
    host.innerHTML = `<span>${fmtDate(view.geoms[0].date)}</span><span class="timeline-legend__bar" style="background:linear-gradient(90deg,${stops})"></span><span>${fmtDate(
      view.geoms[view.geoms.length - 1].date
    )}</span>`;
    const heatLegend = $('sil-heat-legend');
    if (heatLegend) {
      const d = [-6, -3, 0, 3, 6].map((p) => renderer.divergingColor(p, tokens)).join(',');
      heatLegend.innerHTML = `<span>−6 %</span><span class="timeline-legend__bar" style="background:linear-gradient(90deg,${d})"></span><span>+6 %</span>`;
    }
  }

  function render({ measurements, settings }) {
    stop();
    const section = $('section-silhouette');
    const heightCm = settings.heightCm;
    if (!measurements.length || !isFiniteNumber(heightCm)) {
      view.geoms = [];
      return;
    }
    bind();
    const filled = model.fillGaps(measurements);
    const ref = model.reference(filled); // squelette commun : seuls les tissus varient
    view.geoms = filled.map((m) => model.build(m, heightCm, ref));
    view.profiles = filled.map((m) => profile.build(m, heightCm));
    view.selected = view.geoms.length - 1;
    const slider = $('sil-slider');
    slider.max = String(view.geoms.length - 1);
    slider.value = String(view.selected);
    slider.disabled = view.geoms.length < 2;
    $('sil-play').disabled = view.geoms.length < 2;
    if (section) section.dataset.count = String(view.geoms.length);
    renderTimelineLegend();
    renderFilmstrip();
    draw();
  }

  SP.silhouette.view = { render, stop };
})(window.SP);
