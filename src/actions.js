import { planImport } from './core/import.js';
import { parseSyncResponse, planSync } from './core/sync.js';
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
    const plan = planImport(bytes, { mapping, rules: state.rules, existingIds: new Set(real.map((t) => t.id)), apiEntries: real });
    await save(() => ctx.store.putTransactions(plan.added, { removeIds: demoIds }));
    if (mapping) {
      const saved = { ...mapping, cols: cols ?? mapping.cols };
      await save(() => ctx.store.putSetting('columnMapping', saved));
      state.settings.columnMapping = saved;
    }
    state.transactions = [...real, ...plan.added];
    state.month = latestMonth();
    state.openCategory = null;
    state.pendingMapping = null;
    state.lastSummary = {
      added: plan.added.length, duplicates: plan.duplicateCount, skipped: plan.skipped,
      uncategorized: plan.uncategorizedCount, removedDemo: demoIds.length,
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

  const syncConfig = () => {
    const cfg = state.settings.sync;
    if (!cfg?.url || !cfg?.token) throw new Error('Renseigne d’abord l’adresse du serveur et le jeton.');
    return cfg;
  };

  async function syncFetch(path, init = {}) {
    const cfg = syncConfig();
    let res;
    try {
      res = await fetch(`${cfg.url}${path}`, { ...init, headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' } });
    } catch (e) {
      throw new Error('Serveur de synchronisation injoignable.', { cause: e });
    }
    if (res.status === 401) throw new Error('Le serveur refuse le jeton : vérifie-le dans la section Synchronisation.');
    if (res.status === 400) throw new Error('La connexion à la banque a échoué ou a expiré : recommence « Connecter ma banque ».');
    if (!res.ok) throw new Error(`Le serveur de synchronisation a répondu une erreur (${res.status}).`);
    return res.json();
  }

  async function saveSyncConfig({ url, token }) {
    const clean = String(url ?? '').trim().replace(/\/+$/, '');
    if (!/^https:\/\/[^\s/]+/.test(clean) && !/^http:\/\/localhost(:\d+)?$/.test(clean)) throw new Error('L’adresse doit commencer par https://');
    if (!String(token ?? '').trim()) throw new Error('Le jeton est obligatoire.');
    const cfg = { url: clean, token: String(token).trim() };
    await save(() => ctx.store.putSetting('sync', cfg));
    state.settings.sync = cfg;
    state.syncStatus = null;
    if (state.pendingLink) await completeLink();
  }

  async function clearSyncConfig() {
    await save(() => ctx.store.putSetting('sync', null));
    delete state.settings.sync;
    state.syncStatus = null;
  }

  // Récupère les nouvelles opérations auprès du serveur (qui limite lui-même ses appels à la banque).
  async function syncNow() {
    const data = parseSyncResponse(await syncFetch('/api/transactions'));
    let added = 0;
    if (data.status === 'ok') {
      const real = state.transactions.filter((t) => !t.demo);
      const demoIds = state.transactions.filter((t) => t.demo).map((t) => t.id);
      const fresh = planSync(data.rows, { rules: state.rules, existingIds: new Set(real.map((t) => t.id)) });
      if (fresh.length || demoIds.length) {
        await save(() => ctx.store.putTransactions(fresh, { removeIds: demoIds }));
        state.transactions = [...real, ...fresh];
        state.month = latestMonth();
        state.openCategory = null;
      }
      added = fresh.length;
    }
    state.syncStatus = { status: data.status, warning: data.warning, updatedAt: data.updatedAt, nextRefreshAt: data.nextRefreshAt, consentExpiresAt: data.consentExpiresAt, added, checkedAt: Date.now() };
    return state.syncStatus;
  }

  // Retour de la banque : l'adresse de l'app contenait ?code=…&state=… à échanger contre une session.
  async function completeLink() {
    const link = state.pendingLink;
    if (!link) return null;
    syncConfig(); // sans serveur configuré, on garde le code en attente
    state.pendingLink = null;
    await syncFetch('/api/session', { method: 'POST', body: JSON.stringify(link) });
    return syncNow();
  }

  // Ouvre la page de consentement de la banque ; on y revient sur l'app, puis syncNow() finalise.
  async function connectBank() {
    const { link } = await syncFetch('/api/link', { method: 'POST' });
    if (typeof link !== 'string' || !/^https:\/\//.test(link)) throw new Error('Le serveur n’a pas renvoyé de lien de connexion.');
    globalThis.location.assign(link);
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
    const settings = state.settings.sync ? { ...data.settings, sync: state.settings.sync } : data.settings;
    await save(() => ctx.store.replaceAll({ ...data, settings, categories }));
    Object.assign(state, { ...data, settings, categories, openCategory: null, lastSummary: null, pendingMapping: null });
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

  return { importBytes, importFile, syncNow, connectBank, completeLink, saveSyncConfig, clearSyncConfig, recategorize, loadDemo, removeDemo, downloadBackup, readBackup, applyBackup, clearAll, saveCategory };
}
