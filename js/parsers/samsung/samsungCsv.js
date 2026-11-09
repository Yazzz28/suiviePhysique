/**
 * Lecture générique d'un CSV d'export Samsung Health.
 *
 * Format constaté :
 *   ligne 1 : métadonnées « com.samsung.health.weight,7013001,13 »
 *   ligne 2 : en-têtes, parfois préfixés (« com.samsung.health.sleep.start_time »)
 *   ensuite : une ligne par relevé, séparateur « , », virgule finale.
 * Les horodatages (start_time, end_time) sont en UTC ; la colonne time_offset
 * (« UTC+0100 ») donne le décalage local au moment de la mesure.
 */
(function (SP) {
  'use strict';

  const TABLE_PREFIX = 'com.samsung.';

  /** Nom de table lu dans la ligne de métadonnées (ou null si ce n'est pas un export Samsung). */
  function tableName(text) {
    const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    const end = text.indexOf(',', start);
    const name = text.slice(start, end > 0 ? end : start + 120).trim();
    return name.startsWith(TABLE_PREFIX) ? name : null;
  }

  /**
   * Découpe le texte CSV en lignes de cellules (gère guillemets, virgules
   * et retours à la ligne dans les champs).
   */
  function parseRows(text, from) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = from; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i++;
          } else quoted = false;
        } else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') {
        row.push(cell);
        cell = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        cell = '';
      } else cell += c;
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  /** { table, header (noms courts), rows } */
  function parse(text) {
    const table = tableName(text);
    if (!table) return null;
    const firstBreak = text.indexOf('\n');
    if (firstBreak < 0) return { table, header: [], rows: [] };
    const all = parseRows(text, firstBreak + 1);
    const header = (all.shift() || []).map((h) => h.trim().split('.').pop());
    return { table, header, rows: all };
  }

  /** « 2026-11-09 05:48:56.000 » (UTC) + « UTC+0100 » -> Date à l'heure locale de la mesure. */
  function parseUtc(raw, offset) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw);
    if (!m) return null;
    let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    const o = /UTC([+-])(\d{2})(\d{2})/.exec(offset || '');
    if (!o) return new Date(ms); // pas de décalage connu : heure locale du navigateur
    ms += (o[1] === '-' ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3])) * 60000;
    const w = new Date(ms);
    // Heure « murale » au moment de la mesure, exprimée comme date locale
    return new Date(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds());
  }

  /** « 2026-11-08 00:00:00.000 » ou horodatage ms -> jour local (minuit). */
  function parseDay(raw) {
    if (/^\d{10,}$/.test(raw)) {
      const d = new Date(Number(raw));
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /**
   * Parcourt les lignes avec un accesseur par nom de colonne et retourne
   * les enregistrements produits par `fn` (null = ligne ignorée).
   */
  function map(parsed, fn) {
    const idx = new Map();
    parsed.header.forEach((h, i) => {
      if (!idx.has(h)) idx.set(h, i);
    });
    const r = {
      row: null,
      has: (k) => idx.has(k),
      str(k) {
        const i = idx.get(k);
        const v = i === undefined ? undefined : r.row[i];
        return v === undefined ? '' : v.trim();
      },
      num(k) {
        const s = r.str(k);
        if (s === '') return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      },
      time: (k) => parseUtc(r.str(k), r.str('time_offset')),
      day: (k) => parseDay(r.str(k)),
    };
    const out = [];
    for (const row of parsed.rows) {
      r.row = row;
      const rec = fn(r);
      if (rec) out.push(rec);
    }
    return out;
  }

  SP.parsers.samsung = SP.parsers.samsung || {};
  SP.parsers.samsung.csv = { TABLE_PREFIX, tableName, parse, parseUtc, parseDay, map };
})(window.SP);
