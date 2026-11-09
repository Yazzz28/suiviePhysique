/**
 * Utilitaires purs : formatage, dates, statistiques.
 */
(function (SP) {
  'use strict';

  const DAY_MS = 86400000;
  const nfCache = new Map();

  function numberFormat(decimals) {
    if (!nfCache.has(decimals)) {
      nfCache.set(
        decimals,
        new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      );
    }
    return nfCache.get(decimals);
  }

  /** Formate un nombre en français ("89,90"). */
  function fmt(value, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return numberFormat(decimals).format(value);
  }

  /** Formate un delta signé avec le vrai signe moins ("−1,2"). */
  function fmtDelta(value, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const rounded = Number(value.toFixed(decimals));
    if (rounded === 0) return '±' + numberFormat(decimals).format(0);
    const sign = rounded > 0 ? '+' : '−';
    return sign + numberFormat(decimals).format(Math.abs(rounded));
  }

  const dateFormats = {
    short: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }),
    long: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    weekday: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
    month: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }),
    time: new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  };

  function fmtDate(date, style = 'short') {
    if (!(date instanceof Date)) date = new Date(date);
    return dateFormats[style].format(date);
  }

  /** Clé jour locale "2026-11-07". */
  function dayKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function daysBetween(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS); // arrondi : absorbe les changements d'heure
  }

  /** Lundi de la semaine de la date (clé de regroupement hebdo). */
  function weekStart(date) {
    const d = startOfDay(date);
    const shift = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - shift);
    return d;
  }

  function mean(values) {
    const v = values.filter(isFiniteNumber);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  }

  function stdDev(values) {
    const v = values.filter(isFiniteNumber);
    if (v.length < 2) return null;
    const m = mean(v);
    return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
  }

  function isFiniteNumber(x) {
    return typeof x === 'number' && Number.isFinite(x);
  }

  /**
   * Régression linéaire moindres carrés sur des points {x, y}.
   * Retourne { slope, intercept, r2 } ou null.
   */
  function linearRegression(points) {
    const pts = points.filter((p) => isFiniteNumber(p.x) && isFiniteNumber(p.y));
    const n = pts.length;
    if (n < 2) return null;
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    pts.forEach((p) => {
      sxx += (p.x - mx) ** 2;
      sxy += (p.x - mx) * (p.y - my);
      syy += (p.y - my) ** 2;
    });
    if (sxx === 0) return null;
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
    // Erreur standard de la pente (incertitude du rythme)
    const residual = Math.max(0, syy - slope * sxy);
    const seSlope = n > 2 ? Math.sqrt(residual / (n - 2) / sxx) : null;
    return { slope, intercept, r2, seSlope, n };
  }

  /**
   * Moyenne glissante temporelle : pour chaque point, moyenne des valeurs
   * des `windowDays` derniers jours (inclus).
   */
  function rollingMean(records, key, windowDays = 7) {
    return records.map((rec, i) => {
      const windowStart = startOfDay(rec.date);
      windowStart.setDate(windowStart.getDate() - (windowDays - 1));
      const values = [];
      for (let j = i; j >= 0 && records[j].date >= windowStart; j--) {
        if (isFiniteNumber(records[j][key])) values.push(records[j][key]);
      }
      return { x: rec.date.getTime(), y: mean(values) };
    });
  }

  function first(records, key) {
    return records.find((r) => isFiniteNumber(r[key])) || null;
  }

  function last(records, key) {
    for (let i = records.length - 1; i >= 0; i--) {
      if (isFiniteNumber(records[i][key])) return records[i];
    }
    return null;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Interpolation de couleurs hex. */
  function mixHex(a, b, t) {
    const pa = hexToRgb(a);
    const pb = hexToRgb(b);
    const c = pa.map((v, i) => Math.round(lerp(v, pb[i], t)));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '').trim();
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }

  function withAlpha(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Résout le système linéaire A·x = b (élimination de Gauss, pivot partiel).
   * Retourne null si la matrice est singulière.
   */
  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let sum = M[r][n];
      for (let k = r + 1; k < n; k++) sum -= M[r][k] * x[k];
      x[r] = sum / M[r][r];
    }
    return x;
  }

  /** Échappement HTML pour l'injection de texte venant des fichiers. */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  SP.core.utils = {
    DAY_MS,
    fmt,
    fmtDelta,
    fmtDate,
    dayKey,
    startOfDay,
    daysBetween,
    weekStart,
    mean,
    stdDev,
    isFiniteNumber,
    linearRegression,
    rollingMean,
    first,
    last,
    clamp,
    lerp,
    mixHex,
    hexToRgb,
    withAlpha,
    escapeHtml,
    solveLinear,
  };
})(window.SP);
