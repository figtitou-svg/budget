import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));

test('le service worker précache tous les fichiers de l’app', () => {
  const sw = read('sw.js').toString();
  const src = readdirSync(new URL('src/', root), { recursive: true })
    .filter((f) => f.endsWith('.js'))
    .map((f) => `./src/${f.replaceAll('\\', '/')}`);
  const files = [...src, './', './index.html', './styles.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
  for (const f of files) assert.ok(sw.includes(`'${f}'`), `manquant dans sw.js : ${f}`);
});

test('chaque entrée du précache existe sur le disque', () => {
  const sw = read('sw.js').toString();
  const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'(\.[^']*)'/g)].map((m) => m[1]);
  assert.ok(assets.length > 20);
  for (const a of assets) assert.ok(existsSync(new URL(a === './' ? 'index.html' : a, root)), `absent du disque : ${a}`);
});

test('manifeste valide et icônes PNG aux bonnes dimensions', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of m.icons) {
    assert.ok(existsSync(new URL(icon.src, root)), icon.src);
    const png = read(icon.src);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const [w, h] = icon.sizes.split('x').map(Number);
    assert.equal(png.readUInt32BE(16), w);
    assert.equal(png.readUInt32BE(20), h);
  }
});
