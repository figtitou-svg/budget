import { normalizeMerchant } from './normalize.js';
import { categorize } from './categorize.js';

export const API_SOURCE = 'api';
export const MATCH_WINDOW_DAYS = 3;

const STATUSES = new Set(['ok', 'not_linked', 'pending', 'expired']);
const isRow = (r) => r && typeof r.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isInteger(r.amountCents) && typeof r.rawLabel === 'string';

// Réponse du serveur de synchronisation → objet validé (jette si le format n'est pas celui attendu).
export function parseSyncResponse(data) {
  if (!data || !STATUSES.has(data.status) || !Array.isArray(data.rows) || !data.rows.every(isRow)) {
    throw new Error('Réponse inattendue du serveur de synchronisation.');
  }
  return data;
}

// Lignes de la banque → opérations de l'app, avec un id stable (celui de la banque).
export function planSync(rows, { rules = new Map(), existingIds = new Set(), importedAt = new Date().toISOString() } = {}) {
  return rows
    .map((r) => ({ id: `api|${r.id}`, date: r.date, amountCents: r.amountCents, rawLabel: r.rawLabel, merchant: normalizeMerchant(r.rawLabel), importedAt, source: API_SOURCE }))
    .filter((t) => !existingIds.has(t.id))
    .map((t) => ({ ...t, ...categorize(t, rules) }));
}

const DAY_MS = 86_400_000;
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

// Quand un relevé CSV recouvre des opérations déjà synchronisées, ses lignes sont des doublons
// (libellés différents, donc empreintes différentes) : même montant à ±3 jours = même opération.
// La ligne synchronisée est conservée ; chaque ligne synchronisée n'absorbe qu'une ligne du relevé.
export function dropApiDuplicates(apiTxs, added, { windowDays = MATCH_WINDOW_DAYS } = {}) {
  const free = apiTxs.filter((t) => t.source === API_SOURCE);
  const kept = [];
  let matched = 0;
  for (const row of added) {
    let best = -1;
    let bestGap = Infinity;
    free.forEach((a, i) => {
      if (a.amountCents !== row.amountCents) return;
      const gap = Math.abs(dayNumber(a.date) - dayNumber(row.date));
      if (gap <= windowDays && gap < bestGap) { best = i; bestGap = gap; }
    });
    if (best < 0) { kept.push(row); continue; }
    free.splice(best, 1);
    matched++;
  }
  return { added: kept, matched };
}
