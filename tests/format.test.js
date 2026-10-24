import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEuros, formatMonth, formatMonthShort, formatDay, formatPercent, escapeHtml } from '../src/ui/format.js';

const plain = (s) => s.replace(/\s/g, ' ').replace(/−/g, '-');

test('euros', () => {
  assert.equal(plain(formatEuros(-2345)), '-23,45 €');
  assert.equal(plain(formatEuros(123456)), '1 234,56 €');
  assert.equal(plain(formatEuros(500, { signed: true })), '+5,00 €');
  assert.equal(plain(formatEuros(0, { signed: true })), '0,00 €');
});

test('mois et jours', () => {
  assert.equal(formatMonth('2026-10'), 'octobre 2026');
  assert.equal(formatMonthShort('2026-10'), 'oct.');
  assert.equal(formatDay('2026-10-12'), '12 oct.');
});

test('pourcentages', () => {
  assert.equal(plain(formatPercent(0.8)), '80 %');
  assert.equal(plain(formatPercent(0.003)), '<1 %');
  assert.equal(plain(formatPercent(0)), '0 %');
});

test('escapeHtml', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});
