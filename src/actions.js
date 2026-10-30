import { planImport } from './core/import.js';
import { buildManualTransaction } from './core/manual.js';
import { applyRule, setManual } from './core/categorize.js';
import { demoTransactions } from './core/demo.js';
import { buildBackup, parseBackup } from './core/backup.js';
import { DEFAULT_CATEGORIES } from './core/categories.js';
import { listMonths } from './core/stats.js';
import { ImportError } from './core/errors.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function createActions(ctx) {
  const { state } = ctx;
  const latestMonth = () => listMonths(state.transactions)[0] ?? ctx.today().slice(0, 7);

  async function save(fn) {
    try {
      await fn();
    } catch (e) {
      ctx.banner('Impossible d’enregistrer sur cet appareil (stockage plein ou navigation privée). Exporte une sauvegarde depuis l’onglet Import.');
      throw new Error('Enregistrement impossible sur cet appareil.', { cause: e });
    }
  }

  async function importBytes(bytes, { mapping, cols } = {}) {
    const real = state.transactions.filter((t) => !t.demo);
    const demoIds = state.transactions.filter((t) => t.demo).map((t) => t.id);
    const plan = planImport(bytes, {
      mapping, rules: state.rules, existingIds: new Set(real.map((t) => t.id)), manualEntries: real.filter((t) => t.manualEntry),
    });
    const gone = new Set(plan.reconciledIds);
    await save(() => ctx.store.putTransactions(plan.added, { removeIds: [...demoIds, ...gone] }));
    if (mapping) {
      const saved = { ...mapping, cols: cols ?? mapping.cols };
      await save(() => ctx.store.putSetting('columnMapping', saved));
      state.settings.columnMapping = saved;
    }
    state.transactions = [...real.filter((t) => !gone.has(t.id)), ...plan.added];
    state.month = latestMonth();
    state.openCategory = null;
    state.pendingMapping = null;
    state.lastSummary = {
      added: plan.added.length, duplicates: plan.duplicateCount, skipped: plan.skipped,
      uncategorized: plan.uncategorizedCount, removedDemo: demoIds.length, reconciled: gone.size,
    };
    globalThis.navigator?.storage?.persist?.().catch(() => {});
    return state.lastSummary;
  }

  async function importFile(file) {
    if (file.size > MAX_FILE_BYTES) throw new ImportError('TOO_BIG', 'Fichier trop volumineux (10 Mo maximum).');
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      return await importBytes(bytes);
    } catch (e) {
      if (!(e instanceof ImportError) || e.code !== 'NO_HEADER') throw e;
      const saved = state.settings.columnMapping;
      const cols = Math.max(0, ...e.details.preview.map((r) => r.length));
      if (saved && saved.cols === cols) {
        try { return await importBytes(bytes, { mapping: saved }); } catch (e2) { if (!(e2 instanceof ImportError)) throw e2; }
      }
      state.pendingMapping = { bytes, filename: file.name, preview: e.details.preview, sep: e.details.sep };
      return null;
    }
  }

  async function recategorize(txId, categoryId, { all }) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return 0;
    const next = all
      ? applyRule(state.transactions, tx.merchant, categoryId, { includeId: txId })
      : setManual(state.transactions, txId, categoryId);
    const changed = next.filter((t, i) => t !== state.transactions[i]);
    await save(async () => {
      if (all) await ctx.store.putRule(tx.merchant, categoryId);
      await ctx.store.putTransactions(changed);
    });
    if (all) state.rules.set(tx.merchant, categoryId);
    state.transactions = next;
    return changed.length;
  }

  async function addManual(entry) {
    const tx = buildManualTransaction(entry, state.rules);
    const demoIds = state.transactions.filter((t) => t.demo).map((t) => t.id);
    await save(() => ctx.store.putTransactions([tx], { removeIds: demoIds }));
    state.transactions = [...state.transactions.filter((t) => !t.demo), tx];
    state.month = tx.date.slice(0, 7);
    state.openCategory = null;
    return tx;
  }

  async function deleteManual(txId) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx?.manualEntry) return;
    await save(() => ctx.store.deleteTransactions([txId]));
    state.transactions = state.transactions.filter((t) => t.id !== txId);
    state.month = latestMonth();
    state.openCategory = null;
  }

  async function loadDemo() {
    if (state.transactions.some((t) => !t.demo)) throw new Error('Tu as déjà des opérations réelles.');
    const txs = demoTransactions(ctx.today(), state.rules);
    await save(() => ctx.store.putTransactions(txs, { removeIds: state.transactions.map((t) => t.id) }));
    state.transactions = txs;
    state.month = latestMonth();
    state.openCategory = null;
  }

  async function removeDemo() {
    const ids = state.transactions.filter((t) => t.demo).map((t) => t.id);
    await save(() => ctx.store.deleteTransactions(ids));
    state.transactions = state.transactions.filter((t) => !t.demo);
    state.month = latestMonth();
    state.openCategory = null;
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(buildBackup(state), null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `budget-sauvegarde-${ctx.today()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function readBackup(file) {
    if (file.size > MAX_FILE_BYTES * 5) throw new ImportError('TOO_BIG', 'Fichier trop volumineux.');
    return parseBackup(await file.text());
  }

  async function applyBackup(data) {
    const categories = data.categories.length ? data.categories : DEFAULT_CATEGORIES;
    await save(() => ctx.store.replaceAll({ ...data, categories }));
    Object.assign(state, { ...data, categories, openCategory: null, lastSummary: null, pendingMapping: null });
    state.month = latestMonth();
  }

  async function clearAll() {
    await save(async () => {
      await ctx.store.clearAll();
      await ctx.store.putCategories(DEFAULT_CATEGORIES);
    });
    Object.assign(state, { transactions: [], rules: new Map(), categories: DEFAULT_CATEGORIES, settings: {}, openCategory: null, lastSummary: null, pendingMapping: null });
    state.month = latestMonth();
  }

  async function saveCategory(id, patch) {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v === 'string' && v.trim()));
    const current = state.categories.find((c) => c.id === id);
    if (!current || !Object.keys(clean).length) return;
    const updated = { ...current, ...clean };
    await save(() => ctx.store.putCategories([updated]));
    state.categories = state.categories.map((c) => (c.id === id ? updated : c));
  }

  return { importBytes, importFile, addManual, deleteManual, recategorize, loadDemo, removeDemo, downloadBackup, readBackup, applyBackup, clearAll, saveCategory };
}
