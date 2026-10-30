import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmountCents, buildManualTransaction, reconcile } from '../src/core/manual.js';
import { planImport } from '../src/core/import.js';

const NOW = '2026-10-24T08:00:00.000Z';
const latin1 = (s) => new Uint8Array(Buffer.from(s, 'latin1'));

test('parseAmountCents accepte virgule, point, espaces, €', () => {
  assert.equal(parseAmountCents('12,50'), 1250);
  assert.equal(parseAmountCents('12.5'), 1250);
  assert.equal(parseAmountCents('1 234,56 €'), 123456);
  assert.equal(parseAmountCents('3'), 300);
  for (const bad of ['', 'abc', '0', '-5', '1,234', '1,2,3', null]) assert.equal(parseAmountCents(bad), null, String(bad));
});

test('saisie : catégorie automatique, règle apprise ou choix manuel', () => {
  const auto = buildManualTransaction({ amountCents: -850, label: 'Uber Eats', date: '2026-10-24' }, new Map(), NOW);
  assert.equal(auto.categoryId, 'resto');
  assert.equal(auto.categorySource, 'default');
  assert.equal(auto.manualEntry, true);
  const ruled = buildManualTransaction({ amountCents: -850, label: 'Uber Eats', date: '2026-10-24' }, new Map([['UBER EATS', 'loisirs']]), NOW);
  assert.equal(ruled.categoryId, 'loisirs');
  const chosen = buildManualTransaction({ amountCents: -850, label: 'Truc', date: '2026-10-24', categoryId: 'sante' }, new Map(), NOW);
  assert.deepEqual([chosen.categoryId, chosen.categorySource], ['sante', 'manual']);
  assert.notEqual(auto.id, ruled.id);
});

const manual = (date, amountCents, label, categoryId) => buildManualTransaction({ date, amountCents, label, categoryId }, new Map(), NOW);
const bank = (date, amountCents, id = date) => ({ id, date, amountCents, rawLabel: 'CARTE X1234 TRUC', merchant: 'TRUC', categoryId: 'autre', categorySource: 'default' });

test('rapprochement : même montant, ±3 jours, la banque fait foi', () => {
  const m = manual('2026-10-10', -1250, 'Boulangerie', 'courses');
  const { added, removedIds } = reconcile([m], [bank('2026-10-12', -1250)]);
  assert.deepEqual(removedIds, [m.id]);
  assert.equal(added[0].id, '2026-10-12');
  assert.deepEqual([added[0].categoryId, added[0].categorySource], ['courses', 'manual']);
});

test('rapprochement : catégorie auto non recopiée, hors fenêtre ou autre montant ignorés', () => {
  const auto = manual('2026-10-10', -1250, 'Truc');
  assert.equal(reconcile([auto], [bank('2026-10-11', -1250)]).added[0].categorySource, 'default');
  assert.equal(reconcile([auto], [bank('2026-10-14', -1250)]).removedIds.length, 0);
  assert.equal(reconcile([auto], [bank('2026-10-10', -1251)]).removedIds.length, 0);
});

test('rapprochement : une saisie ne sert qu’une fois, la plus proche gagne', () => {
  const a = manual('2026-10-10', -500, 'A');
  const b = manual('2026-10-12', -500, 'B');
  const { removedIds } = reconcile([a, b], [bank('2026-10-12', -500, 'x'), bank('2026-10-10', -500, 'y')]);
  assert.deepEqual(new Set(removedIds), new Set([a.id, b.id]));
  const single = reconcile([a], [bank('2026-10-10', -500, 'x'), bank('2026-10-10', -500, 'y')]);
  assert.equal(single.removedIds.length, 1);
});

test('planImport retire les saisies correspondant au relevé', () => {
  const csv = [
    "Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise",
    '12/10/2026;CARTE X1234 12/10 CARREFOUR;CARTE X1234 12/10 CARREFOUR CITY LYON;-23,45;EUR',
  ].join('\r\n');
  const m = manual('2026-10-11', -2345, 'Carrefour', 'courses');
  const other = manual('2026-10-11', -999, 'Autre');
  const plan = planImport(latin1(csv), { importedAt: NOW, manualEntries: [m, other] });
  assert.deepEqual(plan.reconciledIds, [m.id]);
  assert.equal(plan.added.length, 1);
  assert.equal(plan.added[0].categorySource, 'manual');
});
