/**
 * Aides de bas niveau pour lire les exports CSV.
 */
(function (SP) {
  'use strict';

  function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  function splitLines(text) {
    return stripBom(text)
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
  }

  /** Découpe une ligne CSV simple (gère les guillemets). */
  function splitCsvLine(line, separator = ',') {
    const out = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (c === separator && !quoted) {
        out.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    out.push(current);
    return out.map((cell) => cell.trim());
  }

  /** Détecte le séparateur d'une ligne d'en-tête (« ; » pour Excel FR, « , » sinon). */
  function detectSeparator(line) {
    const count = (c) => line.split(c).length - 1;
    return count(';') > count(',') ? ';' : ',';
  }

  /** "89.90" -> 89.9 ; "--", "" -> null ; gère aussi la virgule décimale. */
  function parseNumber(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s || /^-+$/.test(s)) return null;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  /** Normalise un libellé : minuscules, sans accents ni ponctuation superflue. */
  function normalizeLabel(label) {
    return String(label)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’']/g, ' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Construit une Date locale à partir de "2026.11.07" / "2026-11-07" / "2026/11/07"
   * et d'une heure optionnelle "07:09:21".
   */
  function parseDateTime(datePart, timePart) {
    const raw = String(datePart).trim();
    let ymd = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (!ymd) {
      // Format français jj/mm/aaaa (saisie Excel)
      const dmy = raw.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
      if (dmy) ymd = [dmy[0], dmy[3], dmy[2], dmy[1]];
    }
    if (!ymd) return null;
    // L'heure peut être dans sa propre colonne ou collée à la date
    const t = String(timePart || raw.replace(ymd[0], '')).trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const date = new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
      t ? Number(t[1]) : 0,
      t ? Number(t[2]) : 0,
      t && t[3] ? Number(t[3]) : 0
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  SP.parsers.csvUtils = {
    stripBom,
    splitLines,
    splitCsvLine,
    detectSeparator,
    parseNumber,
    normalizeLabel,
    parseDateTime,
  };
})(window.SP);
