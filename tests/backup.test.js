import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, BACKUP_VERSION } from '../src/core/backup.js';

const T = { id: 'x#1', date: '2026-10-01', amountCents: -100, rawLabel: 'A', merchant: 'A', categoryId: 'autre', categorySource: 'default', importedAt: 'now' };

test('aller-retour complet', () => {
  const data = { transactions: [T], rules: new Map([['A', 'courses']]), categories: [{ id: 'autre', name: 'Autre', color: '#a0a0a0', icon: '❔', order: 0 }], settings: { columnMapping: { sep: ';' } } };
  const backup = buildBackup(data, '2026-10-24T00:00:00.000Z');
  assert.equal(backup.version, BACKUP_VERSION);
  assert.equal(backup.app, 'budget');
  assert.deepEqual(backup.rules, [{ merchant: 'A', categoryId: 'courses' }]);
  const back = parseBackup(JSON.stringify(backup));
  assert.deepEqual(back.transactions, [T]);
  assert.deepEqual([...back.rules], [['A', 'courses']]);
  assert.deepEqual(back.categories, data.categories);
  assert.deepEqual(back.settings, data.settings);
});

test('refuse les fichiers invalides', () => {
  for (const text of ['pas du json', 'null', '{"version":2,"transactions":[]}', JSON.stringify({ version: 1, transactions: [{ ...T, amountCents: 1.5 }] }), JSON.stringify({ version: 1, transactions: [{ id: 'a' }] })]) {
    assert.throws(() => parseBackup(text), { code: 'BAD_BACKUP' }, text);
  }
});

test('champs facultatifs absents', () => {
  const back = parseBackup(JSON.stringify({ version: 1, transactions: [] }));
  assert.deepEqual(back.categories, []);
  assert.deepEqual(back.settings, {});
  assert.equal(back.rules.size, 0);
});
