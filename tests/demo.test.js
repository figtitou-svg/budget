import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoRows, demoTransactions } from '../src/core/demo.js';

test('déterministe', () => {
  assert.deepEqual(demoRows('2026-10', { maxDay: 24 }), demoRows('2026-10', { maxDay: 24 }));
  assert.notDeepEqual(demoRows('2026-10', { seed: 1 }), demoRows('2026-10', { seed: 2 }));
});

test('six mois, rien dans le futur', () => {
  const rows = demoRows('2026-10', { maxDay: 24 });
  const months = new Set(rows.map((r) => r.date.slice(0, 7)));
  assert.deepEqual([...months].sort(), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.ok(rows.every((r) => r.date <= '2026-10-24'));
  assert.ok(rows.every((r) => Number.isInteger(r.amountCents) && r.amountCents !== 0));
});

test('toutes catégorisées et marquées démo', () => {
  const txs = demoTransactions('2026-10-24', new Map(), 'now');
  assert.ok(txs.length > 60);
  assert.ok(txs.every((t) => t.demo === true));
  assert.deepEqual(txs.filter((t) => t.categoryId === 'autre').map((t) => t.rawLabel), []);
  assert.ok(new Set(txs.map((t) => t.categoryId)).size >= 8);
  assert.equal(new Set(txs.map((t) => t.id)).size, txs.length);
});
