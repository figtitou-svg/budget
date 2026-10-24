import { test } from 'node:test';
import assert from 'node:assert/strict';
import { donutSvg, stackedBarsSvg } from '../src/ui/charts.js';

const count = (s, needle) => s.split(needle).length - 1;

test('donut : une piste et un arc par part', () => {
  const svg = donutSvg([{ value: 1, color: '#111111', label: 'A' }, { value: 3, color: '#222222', label: 'B' }, { value: 0, color: '#333333', label: 'C' }], { size: 200, thickness: 30, label: '40 €' });
  assert.equal(count(svg, '<circle'), 3);
  const C = 2 * Math.PI * 85;
  assert.ok(svg.includes(`stroke-dasharray="${(C / 4).toFixed(3)} ${(C * 3 / 4).toFixed(3)}"`));
  assert.ok(svg.includes('40 €'));
});

test('donut vide et textes échappés', () => {
  const svg = donutSvg([], { label: '<b>' });
  assert.equal(count(svg, '<circle'), 1);
  assert.ok(svg.includes('&lt;b&gt;'));
  assert.ok(!svg.includes('<b>'));
});

test('barres empilées', () => {
  const svg = stackedBarsSvg({ labels: ['a', 'b'], series: [{ values: [100, 50], color: '#111111', title: 'X' }], width: 200, height: 134 });
  // hauteur utile = 134 - 10 - 24 = 100 → la plus haute barre fait 100
  assert.ok(svg.includes('height="100.0"'));
  assert.ok(svg.includes('height="50.0"'));
  assert.equal(count(svg, 'avg-line'), 0);
  const withAvg = stackedBarsSvg({ labels: ['a'], series: [{ values: [100], color: '#111111' }], averageCents: 50, width: 200, height: 134 });
  assert.equal(count(withAvg, 'avg-line'), 1);
  assert.ok(withAvg.includes('y1="60.0"'));
});

test('barres sans données', () => {
  const svg = stackedBarsSvg({ labels: ['a', 'b'], series: [] });
  assert.equal(count(svg, '<rect'), 0);
  assert.equal(count(svg, 'bar-label'), 2);
});
