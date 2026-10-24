import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CATEGORIES } from '../src/core/categories.js';
import { defaultCategory, categorize, applyRule, setManual, FALLBACK_CATEGORY } from '../src/core/categorize.js';
import { normalizeMerchant } from '../src/core/normalize.js';

test('15 catégories par défaut bien formées', () => {
  assert.equal(DEFAULT_CATEGORIES.length, 15);
  const ids = DEFAULT_CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, 15);
  for (const id of ['autre', 'revenus', 'remboursements', 'courses']) assert.ok(ids.includes(id), id);
  DEFAULT_CATEGORIES.forEach((c, i) => {
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
    assert.equal(c.order, i);
    assert.ok(c.name && c.icon);
  });
  assert.equal(FALLBACK_CATEGORY, 'autre');
});

const CASES = [
  ['CARTE X1234 12/10 CARREFOUR CITY LYON', -2345, 'courses'],
  ['CARTE X1234 14/10 UBER *EATS PARIS', -1890, 'resto'],
  ['CARTE X1234 15/10 UBER BV PARIS', -1200, 'transports'],
  ['PRLV SEPA FREE MOBILE ECH/101026', -1599, 'factures'],
  ['CARTE X1234 RETRAIT DAB 12/10 LYON', -4000, 'retraits'],
  ['PRLV SEPA CROUS LYON', -38000, 'logement'],
  ['CARTE X1234 03/10 CROUS RESTO U', -330, 'resto'],
  ['CARTE X1234 05/10 NETFLIX.COM', -1399, 'abonnements'],
  ['CARTE X1234 05/10 AMAZON PRIME', -699, 'abonnements'],
  ['CARTE X1234 06/10 AMAZON PAYMENTS', -2599, 'shopping'],
  ['CARTE X1234 07/10 BOULANGERIE PAUL', -450, 'courses'],
  ['CARTE X1234 07/10 PHARMACIE DU CENTRE', -890, 'sante'],
  ['CARTE X1234 08/10 PATHE BELLECOUR', -1100, 'loisirs'],
  ['CARTE X1234 08/10 CVEC', -10300, 'etudes'],
  ['VIR EUROPEEN EMIS POUR: LUCAS MARTIN', -2000, 'virements'],
  ['VIR RECU DE: CAF DU RHONE MOTIF: APL', 18200, 'revenus'],
  ['VIR RECU DE: ACME MOTIF: SALAIRE', 85000, 'revenus'],
  ['REMBOURSEMENT CPAM', 2500, 'remboursements'],
  ['CARTE X1234 08/10 AMAZON PAYMENTS', 2599, 'remboursements'],
  ['CARTE X1234 09/10 TRUC INCONNU', -1000, 'autre'],
  ['Café de la Gare', -350, 'resto'],
];

for (const [rawLabel, amountCents, expected] of CASES) {
  test(`« ${rawLabel} » (${amountCents}) → ${expected}`, () => {
    assert.equal(defaultCategory({ rawLabel, merchant: normalizeMerchant(rawLabel), amountCents }), expected);
  });
}

const tx = (over) => ({ id: 'a', date: '2026-10-01', amountCents: -1000, rawLabel: 'CARTE X1234 01/10 LIDL', merchant: 'LIDL', categoryId: 'courses', categorySource: 'default', ...over });

test('categorize : manuel > règle > défaut', () => {
  const rules = new Map([['LIDL', 'loisirs']]);
  assert.deepEqual(categorize(tx({ categorySource: 'manual', categoryId: 'sante' }), rules), { categoryId: 'sante', categorySource: 'manual' });
  assert.deepEqual(categorize(tx(), rules), { categoryId: 'loisirs', categorySource: 'rule' });
  assert.deepEqual(categorize(tx(), new Map()), { categoryId: 'courses', categorySource: 'default' });
});

test('applyRule respecte le manuel sauf includeId et garde les références', () => {
  const list = [tx({ id: '1' }), tx({ id: '2', categorySource: 'manual', categoryId: 'sante' }), tx({ id: '3', merchant: 'AUCHAN' })];
  const out = applyRule(list, 'LIDL', 'loisirs');
  assert.deepEqual(out.map((t) => [t.categoryId, t.categorySource]), [['loisirs', 'rule'], ['sante', 'manual'], ['courses', 'default']]);
  assert.equal(out[1], list[1]);
  assert.equal(out[2], list[2]);
  const forced = applyRule(list, 'LIDL', 'loisirs', { includeId: '2' });
  assert.deepEqual([forced[1].categoryId, forced[1].categorySource], ['loisirs', 'rule']);
});

test('setManual marque une seule opération', () => {
  const list = [tx({ id: '1' }), tx({ id: '2' })];
  const out = setManual(list, '2', 'sante');
  assert.equal(out[0], list[0]);
  assert.deepEqual([out[1].categoryId, out[1].categorySource], ['sante', 'manual']);
});
