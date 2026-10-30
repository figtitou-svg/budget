import { openStore, memoryStore } from './store.js';
import { DEFAULT_CATEGORIES } from './core/categories.js';
import { listMonths } from './core/stats.js';
import { createActions } from './actions.js';
import { createSheets } from './ui/sheet.js';
import { renderMonth } from './ui/month.js';
import { renderTrends } from './ui/trends.js';
import { renderImport } from './ui/import.js';
import { openAddExpense } from './ui/add-expense.js';

const VIEWS = { mois: renderMonth, evolution: renderTrends, import: renderImport };

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const state = {
  transactions: [], rules: new Map(), categories: [], settings: {},
  month: localToday().slice(0, 7), openCategory: null,
  trendWindow: 6, trendCategory: '', lastSummary: null, pendingMapping: null,
};

const root = document.getElementById('view');
let toastTimer;

const ctx = {
  state,
  store: null,
  today: localToday,
  sheet: createSheets(document),
  render() {
    const hash = location.hash.slice(1);
    const tab = VIEWS[hash] ? hash : 'mois';
    document.querySelectorAll('.tabs a').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.getElementById('fab').hidden = tab !== 'mois';
    root.onclick = null;
    root.onchange = null;
    VIEWS[tab](root, ctx);
  },
  toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  },
  banner(message) {
    const el = document.getElementById('banner');
    el.textContent = message;
    el.hidden = false;
  },
  async run(fn, message) {
    try {
      const result = await fn();
      const text = typeof message === 'function' ? message(result) : message;
      if (text) ctx.toast(text);
    } catch (e) {
      console.error(e);
      ctx.toast(e?.message || 'Une erreur est survenue.');
    }
    ctx.render();
  },
};
ctx.actions = createActions(ctx);
globalThis.__budget = ctx; // inspection depuis la console

async function init() {
  try {
    ctx.store = await openStore();
    Object.assign(state, await ctx.store.loadAll());
  } catch (e) {
    console.error(e);
    ctx.store = memoryStore();
    ctx.banner('Stockage indisponible : tes données ne seront pas conservées après fermeture.');
  }
  if (!state.categories.length) {
    state.categories = DEFAULT_CATEGORIES;
    await ctx.store.putCategories(DEFAULT_CATEGORIES).catch((e) => console.error(e));
  }
  state.month = listMonths(state.transactions)[0] ?? state.month;
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); ctx.render(); });
  ctx.render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.error('Service worker', e));
  }
}

document.getElementById('fab').addEventListener('click', () => openAddExpense(ctx));

init();
