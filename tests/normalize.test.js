import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMerchant, foldUpper } from '../src/core/normalize.js';

test('foldUpper retire accents et espaces multiples', () => {
  assert.equal(foldUpper('  Café   de la  Gare '), 'CAFE DE LA GARE');
});

const CASES = [
  ['CARTE X1234 12/10 CARREFOUR CITY LYON', 'CARREFOUR CITY'],
  ['CARTE X9876 03/11 UBER *EATS PARIS', 'UBER EATS'],
  ['PRLV SEPA FREE MOBILE ECH/101026 ID EMETTEUR/FR12ZZZ123456 MDT/ABC REF/XYZ', 'FREE MOBILE'],
  ['VIR RECU 1234567 DE: CAF DU RHONE MOTIF: ALLOCATION REF: 999', 'CAF DU RHONE'],
  ['VIR RECU DE: ACME MOTIF: SALAIRE', 'ACME'],
  ['VIR EUROPEEN EMIS POUR: LUCAS MARTIN MOTIF: CADEAU', 'LUCAS MARTIN'],
  ['CARTE X1234 RETRAIT DAB 12/10 14H30 LYON', 'RETRAIT DAB'],
  ['CARTE X1234 12/10 SNCF INTERNET', 'SNCF INTERNET'],
  ['CARTE X1234 12/10 CARREFOUR CARREFOUR CITY LYON', 'CARREFOUR CITY'],
  ['Café de la Gare', 'CAFE DE LA GARE'],
  ['000001 PRLV SEPA SPOTIFY', 'SPOTIFY'],
  ['CARTE X1234 05/10 NETFLIX.COM', 'NETFLIX.COM'],
  ['CARTE X1234 06/10 BOULANGERIE PAUL MARCHE DES HALLES LYON', 'BOULANGERIE PAUL MARCHE DES'],
];

for (const [raw, expected] of CASES) {
  test(`normalise « ${raw} »`, () => assert.equal(normalizeMerchant(raw), expected));
}

test('ne renvoie jamais une chaîne vide', () => {
  assert.equal(normalizeMerchant('CARTE X1234 12/10'), 'CARTE X1234 12/10');
});
