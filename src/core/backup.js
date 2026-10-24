import { ImportError } from './errors.js';

export const BACKUP_VERSION = 1;

export function buildBackup({ transactions, rules, categories, settings }, exportedAt = new Date().toISOString()) {
  return {
    app: 'budget',
    version: BACKUP_VERSION,
    exportedAt,
    transactions,
    rules: [...rules].map(([merchant, categoryId]) => ({ merchant, categoryId })),
    categories,
    settings,
  };
}

const isTx = (t) => t && typeof t.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isInteger(t.amountCents)
  && typeof t.rawLabel === 'string' && typeof t.merchant === 'string' && typeof t.categoryId === 'string';

export function parseBackup(text) {
  const bad = () => new ImportError('BAD_BACKUP', 'Ce fichier n’est pas une sauvegarde valide de l’app.');
  let data;
  try { data = JSON.parse(text); } catch { throw bad(); }
  if (!data || data.version !== BACKUP_VERSION || !Array.isArray(data.transactions) || !data.transactions.every(isTx)) throw bad();
  const rules = data.rules ?? [];
  const categories = data.categories ?? [];
  if (!Array.isArray(rules) || !Array.isArray(categories)) throw bad();
  if (!categories.every((c) => c && typeof c === 'object' && typeof c.id === 'string')) throw bad();
  return {
    transactions: data.transactions,
    rules: new Map(rules.filter((r) => r && r.merchant && r.categoryId).map((r) => [r.merchant, r.categoryId])),
    categories,
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
  };
}
