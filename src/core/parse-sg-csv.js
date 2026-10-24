import { ImportError } from './errors.js';

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2019`]/g, "'").toLowerCase().trim();
const squash = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function detectSeparator(lines) {
  const sample = lines.slice(0, 30).join('\n');
  if (sample.includes(';')) return ';';
  if (sample.includes('\t')) return '\t';
  return ',';
}

export function splitCsvLine(line, sep) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim().replace(/^=/, ''));
}

export function parseAmount(input) {
  if (input == null) return null;
  let s = String(input).replace(/[\s\u00a0\u202f€]/g, '').replace(/EUR$/i, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const m = s.match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] || '').padEnd(2, '0'));
  return m[1] === '-' ? -cents : cents;
}

export function parseDate(input) {
  const s = String(input ?? '').trim();
  let y, m, d, r;
  if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/))) {
    d = +r[1]; m = +r[2]; y = r[3].length === 2 ? 2000 + +r[3] : +r[3];
  } else if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    y = +r[1]; m = +r[2]; d = +r[3];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function detectColumns(cells) {
  const f = cells.map(fold);
  const find = (re, exclude) => f.findIndex((c) => re.test(c) && !(exclude && exclude.test(c)));
  let date = find(/date (de l'|d')?operation/);
  if (date < 0) date = find(/date de comptabilisation/);
  if (date < 0) date = find(/^date/, /valeur/);
  const labels = f.map((c, i) => (/libelle|detail/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (date < 0 || labels.length === 0) return null;
  const amount = find(/montant/);
  if (amount >= 0) return { date, labels, amount };
  const debit = find(/debit/);
  const credit = find(/credit/);
  if (debit >= 0 || credit >= 0) return { date, labels, debit: debit >= 0 ? debit : null, credit: credit >= 0 ? credit : null };
  return null;
}

export function joinLabels(parts) {
  const clean = parts.map((p, i) => ({ i, t: String(p ?? '').replace(/\s+/g, ' ').trim() })).filter((x) => x.t);
  const kept = [];
  for (const p of [...clean].sort((a, b) => b.t.length - a.t.length)) if (!kept.some((o) => squash(o.t).includes(squash(p.t)))) kept.push(p);
  return kept.sort((a, b) => a.i - b.i).map((x) => x.t).join(' ');
}

export function rowFromCells(cells, m) {
  const date = parseDate(cells[m.date]);
  let amountCents;
  if (m.amount != null) amountCents = parseAmount(cells[m.amount]);
  else {
    const debit = m.debit != null ? parseAmount(cells[m.debit]) : null;
    const credit = m.credit != null ? parseAmount(cells[m.credit]) : null;
    amountCents = debit == null && credit == null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
  }
  const rawLabel = joinLabels(m.labels.map((i) => cells[i]));
  if (!date || amountCents == null || amountCents === 0 || !rawLabel) return null;
  return { date, amountCents, rawLabel };
}

export function parseSgCsv(text, { mapping } = {}) {
  const lines = text.split(/\r\n|\n|\r/);
  const sep = mapping?.sep ?? detectSeparator(lines);
  const table = lines.map((l) => splitCsvLine(l, sep));
  let m = mapping ?? null;
  let start = 0;
  if (!m) {
    const h = table.findIndex((cells) => cells.length >= 3 && detectColumns(cells));
    if (h < 0) {
      const preview = table.filter((c) => c.length >= 3 && c.some(Boolean)).slice(0, 8);
      if (!preview.length) throw new ImportError('NOT_STATEMENT', 'Ce fichier ne ressemble pas à un relevé bancaire (CSV ou OFX).');
      throw new ImportError('NO_HEADER', 'Colonnes du relevé non reconnues.', { sep, preview });
    }
    m = detectColumns(table[h]);
    start = h + 1;
  }
  const rows = [];
  let skipped = 0;
  for (const cells of table.slice(start)) {
    if (cells.every((c) => c === '')) continue;
    const row = rowFromCells(cells, m);
    if (row) rows.push(row); else skipped++;
  }
  if (!rows.length) throw new ImportError('NO_ROWS', 'Aucune opération trouvée dans ce fichier.');
  return { rows, skipped };
}
