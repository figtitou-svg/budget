import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBytes } from '../src/core/decode.js';

test('décode l’UTF-8', () => {
  assert.equal(decodeBytes(new TextEncoder().encode('Libellé')), 'Libellé');
});
test('replie sur Windows-1252 quand l’UTF-8 est invalide', () => {
  assert.equal(decodeBytes(Buffer.from("Détail de l'écriture", 'latin1')), "Détail de l'écriture");
});
test('décode le symbole euro en Windows-1252', () => {
  assert.equal(decodeBytes(Uint8Array.from([0x31, 0x30, 0x20, 0x80])), '10 €');
});
test('retire le BOM UTF-8', () => {
  assert.equal(decodeBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41])), 'A');
});
test('accepte un ArrayBuffer', () => {
  assert.equal(decodeBytes(new TextEncoder().encode('ok').buffer), 'ok');
});
