import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, assignIds, splitNew } from '../src/core/dedupe.js';

const row = (date, amountCents, rawLabel) => ({ date, amountCents, rawLabel });

test('fingerprint ignore casse et espaces', () => {
  assert.equal(fingerprint(row('2026-10-01', -250, 'Café  du  coin ')), fingerprint(row('2026-10-01', -250, 'CAFÉ DU COIN')));
  assert.notEqual(fingerprint(row('2026-10-01', -250, 'A')), fingerprint(row('2026-10-01', -251, 'A')));
});

test('assignIds numérote les occurrences identiques', () => {
  const ids = assignIds([row('2026-10-01', -250, 'CAFE'), row('2026-10-01', -250, 'CAFE'), row('2026-10-02', -250, 'CAFE')]).map((r) => r.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids[0].endsWith('#1'));
  assert.ok(ids[1].endsWith('#2'));
  assert.ok(ids[2].endsWith('#1'));
});

test('relevés qui se chevauchent : seul le nouveau passe', () => {
  const a = row('2026-10-01', -1000, 'A'), b = row('2026-10-02', -250, 'CAFE'), c = row('2026-10-03', -500, 'C');
  const first = assignIds([a, b, b]);
  const existing = new Set(first.map((t) => t.id));
  const { added, duplicates } = splitNew(assignIds([b, b, c]), existing);
  assert.deepEqual(added.map((t) => t.rawLabel), ['C']);
  assert.equal(duplicates.length, 2);
});
