import { normalizeMerchant } from './normalize.js';
import { categorize } from './categorize.js';

export const MATCH_WINDOW_DAYS = 3;

// "12,50", "12.5", "1 234,56 €" → 1250, 123456 ; null si invalide ou nul.
export function parseAmountCents(text) {
  const clean = String(text ?? '').replace(/[\s €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents > 0 ? cents : null;
}

let seq = 0;

// Opération saisie à la main. `categoryId` vide = catégorie automatique (règles puis mots-clés).
export function buildManualTransaction({ amountCents, label, date, categoryId = '' }, rules, now = new Date().toISOString()) {
  const rawLabel = String(label ?? '').trim();
  const base = { date, amountCents, rawLabel, merchant: normalizeMerchant(rawLabel), importedAt: now, manualEntry: true };
  const category = categoryId ? { categoryId, categorySource: 'manual' } : categorize(base, rules);
  return { id: `manual|${now}|${++seq}`, ...base, ...category };
}

const DAY_MS = 86_400_000;
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

// Rapproche chaque ligne bancaire fraîchement importée d'une saisie manuelle du même montant
// (±MATCH_WINDOW_DAYS). La ligne bancaire fait foi ; elle hérite de la catégorie choisie à la main.
// Retourne les lignes bancaires mises à jour et les ids des saisies à supprimer.
export function reconcile(manuals, added, { windowDays = MATCH_WINDOW_DAYS } = {}) {
  const free = manuals.filter((m) => m.manualEntry);
  const removedIds = [];
  const result = added.map((bank) => {
    let best = -1;
    let bestGap = Infinity;
    free.forEach((m, i) => {
      if (m.amountCents !== bank.amountCents) return;
      const gap = Math.abs(dayNumber(m.date) - dayNumber(bank.date));
      if (gap <= windowDays && gap < bestGap) { best = i; bestGap = gap; }
    });
    if (best < 0) return bank;
    const [manual] = free.splice(best, 1);
    removedIds.push(manual.id);
    return manual.categorySource === 'manual' ? { ...bank, categoryId: manual.categoryId, categorySource: 'manual' } : bank;
  });
  return { added: result, removedIds };
}
