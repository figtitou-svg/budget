import { decodeBytes } from './decode.js';
import { parseSgCsv } from './parse-sg-csv.js';
import { isOfx, parseOfx } from './parse-ofx.js';
import { normalizeMerchant } from './normalize.js';
import { categorize, FALLBACK_CATEGORY } from './categorize.js';
import { assignIds, splitNew } from './dedupe.js';
import { ImportError } from './errors.js';
import { dropApiDuplicates } from './sync.js';

export function parseStatement(bytes, { mapping } = {}) {
  const text = decodeBytes(bytes);
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 2000))) {
    throw new ImportError('NOT_TEXT', 'Ce fichier n’est pas un relevé CSV ou OFX.');
  }
  if (!text.trim()) throw new ImportError('EMPTY', 'Le fichier est vide.');
  return isOfx(text) ? parseOfx(text) : parseSgCsv(text, { mapping });
}

// Point d'entrée commun à toute source de lignes {date, amountCents, rawLabel}.
export function toTransactions(rows, rules, importedAt) {
  return assignIds(rows).map((r) => {
    const base = { ...r, merchant: normalizeMerchant(r.rawLabel), importedAt };
    return { ...base, ...categorize(base, rules) };
  });
}

export function planImport(bytes, { mapping, rules = new Map(), existingIds = new Set(), apiEntries = [], importedAt = new Date().toISOString() } = {}) {
  const { rows, skipped } = parseStatement(bytes, { mapping });
  const split = splitNew(toTransactions(rows, rules, importedAt), existingIds);
  const { added, matched } = dropApiDuplicates(apiEntries, split.added);
  return {
    added,
    duplicateCount: split.duplicates.length + matched,
    skipped,
    uncategorizedCount: added.filter((t) => t.categoryId === FALLBACK_CATEGORY).length,
  };
}
