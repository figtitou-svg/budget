import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSyncResponse, planSync, dropApiDuplicates } from '../src/core/sync.js';
import { planImport } from '../src/core/import.js';
import { buildBackup } from '../src/core/backup.js';

const NOW = '2026-10-30T08:00:00.000Z';
const row = (id, date, amountCents, rawLabel) => ({ id, date, amountCents, rawLabel });
const latin1 = (s) => new Uint8Array(Buffer.from(s, 'latin1'));

test('parseSyncResponse valide la forme de la réponse', () => {
  assert.equal(parseSyncResponse({ status: 'ok', rows: [row('1', '2026-10-01', -100, 'X')] }).status, 'ok');
  assert.equal(parseSyncResponse({ status: 'pending', rows: [] }).rows.length, 0);
  for (const bad of [null, {}, { status: 'ok' }, { status: 'weird', rows: [] }, { status: 'ok', rows: [{ id: 1 }] }, { status: 'ok', rows: [row('1', 'hier', -1, 'X')] }]) {
    assert.throws(() => parseSyncResponse(bad), /inattendue/);
  }
});

test('planSync : ids stables, catégorisation, pas de ré-ajout', () => {
  const rows = [row('A', '2026-10-12', -2345, 'CARTE X1234 12/10 CARREFOUR CITY'), row('B', '2026-10-11', 12000, 'VIR RECU DE: CAF DU RHONE')];
  const added = planSync(rows, { importedAt: NOW });
  assert.equal(added[0].id, 'api|A');
  assert.equal(added[0].source, 'api');
  assert.equal(added[0].categoryId, 'courses');
  assert.equal(added[1].categoryId, 'revenus');
  assert.equal(planSync(rows, { existingIds: new Set(['api|A']) }).length, 1);
  assert.equal(planSync(rows, { rules: new Map([['CARREFOUR CITY', 'loisirs']]) })[0].categoryId, 'loisirs');
});

test('dropApiDuplicates : même montant à ±3 jours, une ligne absorbée par opération synchronisée', () => {
  const api = planSync([row('A', '2026-10-12', -500, 'X'), row('B', '2026-10-20', -500, 'Y')]);
  const csv = [row('c1', '2026-10-11', -500, 'CSV 1'), row('c2', '2026-10-12', -500, 'CSV 2'), row('c3', '2026-09-01', -500, 'CSV 3'), row('c4', '2026-10-12', -501, 'CSV 4')];
  const { added, matched } = dropApiDuplicates(api, csv);
  assert.equal(matched, 1); // A n'absorbe qu'une ligne (la plus tôt rencontrée) ; B est hors fenêtre
  assert.deepEqual(added.map((r) => r.id), ['c2', 'c3', 'c4']);
});

test('dropApiDuplicates ignore les opérations qui ne viennent pas de la synchro', () => {
  const manualLike = [{ id: 'm', date: '2026-10-12', amountCents: -500, source: undefined }];
  assert.equal(dropApiDuplicates(manualLike, [row('c', '2026-10-12', -500, 'X')]).matched, 0);
});

test('planImport : un relevé CSV ne double pas ce qui a déjà été synchronisé', () => {
  const csv = [
    "Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise",
    '12/10/2026;CARTE X1234 12/10 CARREFOUR;CARTE X1234 12/10 CARREFOUR CITY LYON;-23,45;EUR',
    '05/10/2026;CARTE X1234 05/10 TRUC;CARTE X1234 05/10 TRUC;-7,00;EUR',
  ].join('\r\n');
  const api = planSync([row('A', '2026-10-12', -2345, 'CARREFOUR CITY')], { importedAt: NOW });
  const plan = planImport(latin1(csv), { importedAt: NOW, apiEntries: api });
  assert.equal(plan.added.length, 1);
  assert.equal(plan.added[0].amountCents, -700);
  assert.equal(plan.duplicateCount, 1);
});

test('la sauvegarde n’exporte jamais le jeton de synchronisation', () => {
  const backup = buildBackup({ transactions: [], rules: new Map(), categories: [], settings: { sync: { url: 'https://x', token: 'SECRET' }, columnMapping: { a: 1 } } }, NOW);
  assert.equal(JSON.stringify(backup).includes('SECRET'), false);
  assert.deepEqual(backup.settings, { columnMapping: { a: 1 } });
});
