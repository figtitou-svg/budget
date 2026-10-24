import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthOf, shiftMonth, listMonths, monthSummary, transactionsFor, trend } from '../src/core/stats.js';

const tx = (date, amountCents, categoryId) => ({ id: `${date}${amountCents}${categoryId}`, date, amountCents, categoryId, merchant: 'X', rawLabel: 'X' });
const DATA = [
  tx('2026-10-02', -3000, 'courses'), tx('2026-10-05', -1000, 'resto'), tx('2026-10-09', -1000, 'courses'),
  tx('2026-10-01', 50000, 'revenus'), tx('2026-09-15', -2000, 'courses'), tx('2026-08-20', -6000, 'resto'),
];

test('monthOf et shiftMonth', () => {
  assert.equal(monthOf('2026-10-02'), '2026-10');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2025-12', 1), '2026-01');
  assert.equal(shiftMonth('2026-10', -12), '2025-10');
  assert.equal(shiftMonth('2026-10', 0), '2026-10');
});

test('listMonths du plus récent au plus ancien', () => {
  assert.deepEqual(listMonths(DATA), ['2026-10', '2026-09', '2026-08']);
  assert.deepEqual(listMonths([]), []);
});

test('monthSummary', () => {
  const s = monthSummary(DATA, '2026-10');
  assert.equal(s.spentCents, 5000);
  assert.equal(s.incomeCents, 50000);
  assert.equal(s.balanceCents, 45000);
  assert.equal(s.count, 4);
  assert.deepEqual(s.expenses, [
    { categoryId: 'courses', totalCents: 4000, count: 2, share: 0.8 },
    { categoryId: 'resto', totalCents: 1000, count: 1, share: 0.2 },
  ]);
  assert.deepEqual(s.income, [{ categoryId: 'revenus', totalCents: 50000, count: 1, share: 1 }]);
  const empty = monthSummary(DATA, '2026-07');
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.expenses, []);
});

test('transactionsFor trie par date décroissante', () => {
  assert.deepEqual(transactionsFor(DATA, '2026-10', 'courses', 'out').map((t) => t.date), ['2026-10-09', '2026-10-02']);
  assert.deepEqual(transactionsFor(DATA, '2026-10', 'revenus', 'in').map((t) => t.amountCents), [50000]);
  assert.deepEqual(transactionsFor(DATA, '2026-10', 'revenus', 'out'), []);
});

test('trend sur 3 mois', () => {
  const t = trend(DATA, '2026-10', 3);
  assert.deepEqual(t.months, ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(t.totals, [6000, 2000, 5000]);
  assert.deepEqual(t.series.map((s) => [s.categoryId, s.values, s.total]), [['resto', [6000, 0, 1000], 7000], ['courses', [0, 2000, 4000], 6000]]);
  assert.equal(t.averageCents, 4000);
  assert.equal(t.currentCents, 5000);
  assert.equal(t.deltaCents, 1000);
});

test('trend sur 6 mois ignore les mois avant les premières données', () => {
  const t = trend(DATA, '2026-10', 6);
  assert.equal(t.months[0], '2026-05');
  assert.equal(t.averageCents, 4000);
});

test('trend filtré sur une catégorie', () => {
  const t = trend(DATA, '2026-10', 3, 'courses');
  assert.deepEqual(t.totals, [0, 2000, 4000]);
  assert.equal(t.averageCents, 1000);
  assert.equal(t.deltaCents, 3000);
});

test('trend sans historique', () => {
  const t = trend([tx('2026-10-02', -3000, 'courses')], '2026-10', 6);
  assert.equal(t.averageCents, null);
  assert.equal(t.deltaCents, null);
  assert.equal(t.currentCents, 3000);
});
