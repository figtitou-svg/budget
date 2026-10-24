const DB_NAME = 'budget';
const DB_VERSION = 1;
const STORES = ['transactions', 'rules', 'categories', 'settings'];

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error('Écriture annulée'));
});

class Store {
  constructor(db) { this.db = db; }

  async loadAll() {
    const tx = this.db.transaction(STORES, 'readonly');
    const os = (n) => tx.objectStore(n);
    const [transactions, rules, categories, keys, values] = await Promise.all([
      req(os('transactions').getAll()), req(os('rules').getAll()), req(os('categories').getAll()),
      req(os('settings').getAllKeys()), req(os('settings').getAll()),
    ]);
    return {
      transactions,
      rules: new Map(rules.map((r) => [r.merchant, r.categoryId])),
      categories: categories.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
      settings: Object.fromEntries(keys.map((k, i) => [k, values[i]])),
    };
  }

  async #write(stores, fn) {
    const tx = this.db.transaction(stores, 'readwrite');
    const finished = done(tx);
    try { fn(tx); } catch (e) { finished.catch(() => {}); tx.abort(); throw e; }
    await finished;
  }

  // Ajouts et suppressions dans une seule transaction : tout ou rien.
  putTransactions(list, { removeIds = [] } = {}) {
    return this.#write(['transactions'], (tx) => {
      const s = tx.objectStore('transactions');
      removeIds.forEach((id) => s.delete(id));
      list.forEach((t) => s.put(t));
    });
  }

  deleteTransactions(ids) {
    return this.#write(['transactions'], (tx) => ids.forEach((id) => tx.objectStore('transactions').delete(id)));
  }

  putRule(merchant, categoryId) {
    return this.#write(['rules'], (tx) => tx.objectStore('rules').put({ merchant, categoryId }));
  }

  putCategories(list) {
    return this.#write(['categories'], (tx) => list.forEach((c) => tx.objectStore('categories').put(c)));
  }

  putSetting(key, value) {
    return this.#write(['settings'], (tx) => tx.objectStore('settings').put(value, key));
  }

  replaceAll({ transactions, rules, categories, settings }) {
    return this.#write(STORES, (tx) => {
      STORES.forEach((n) => tx.objectStore(n).clear());
      transactions.forEach((t) => tx.objectStore('transactions').put(t));
      for (const [merchant, categoryId] of rules) tx.objectStore('rules').put({ merchant, categoryId });
      categories.forEach((c) => tx.objectStore('categories').put(c));
      for (const [k, v] of Object.entries(settings)) tx.objectStore('settings').put(v, k);
    });
  }

  clearAll() {
    return this.#write(STORES, (tx) => STORES.forEach((n) => tx.objectStore(n).clear()));
  }
}

export async function openStore() {
  if (!globalThis.indexedDB) throw new Error('IndexedDB indisponible');
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore('transactions', { keyPath: 'id' }).createIndex('date', 'date');
    db.createObjectStore('rules', { keyPath: 'merchant' });
    db.createObjectStore('categories', { keyPath: 'id' });
    db.createObjectStore('settings');
  };
  return new Store(await req(open));
}

// Utilisé quand IndexedDB est inaccessible (navigation privée stricte) : l'app marche, sans persistance.
export function memoryStore() {
  const noop = async () => {};
  return {
    loadAll: async () => ({ transactions: [], rules: new Map(), categories: [], settings: {} }),
    putTransactions: noop, deleteTransactions: noop, putRule: noop, putCategories: noop,
    putSetting: noop, replaceAll: noop, clearAll: noop,
  };
}
