import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileKv } from '../worker/src/file-kv.js';
import { createApp, envFromProcess } from '../worker/node-server.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'budget-kv-'));

test('file-kv : persiste entre deux instances, sans fichier temporaire résiduel', async () => {
  const path = join(tmp(), 'sous', 'state.json');
  const a = createFileKv(path);
  assert.equal(await a.get('x'), null);
  await a.put('x', JSON.stringify({ n: 1 }));
  await a.put('y', JSON.stringify([2]));
  const b = createFileKv(path);
  assert.deepEqual(await b.get('x'), { n: 1 });
  assert.deepEqual(await b.get('y'), [2]);
  assert.deepEqual(readdirSync(join(path, '..')), ['state.json']);
});

test('file-kv : écritures simultanées toutes conservées', async () => {
  const path = join(tmp(), 'state.json');
  const kv = createFileKv(path);
  await Promise.all(Array.from({ length: 20 }, (_, i) => kv.put(`k${i}`, JSON.stringify(i))));
  const again = createFileKv(path);
  for (let i = 0; i < 20; i++) assert.equal(await again.get(`k${i}`), i);
});

test('file-kv : fichier corrompu → erreur explicite, pas d’écrasement silencieux', async () => {
  const path = join(tmp(), 'state.json');
  writeFileSync(path, '{pas du json');
  await assert.rejects(createFileKv(path).get('x'), /illisible/);
  assert.equal(readFileSync(path, 'utf8'), '{pas du json');
});

test('envFromProcess refuse de démarrer sans secrets', () => {
  assert.throws(() => envFromProcess({ APP_URL: 'x' }), /GC_SECRET_ID.*GC_SECRET_KEY.*APP_TOKEN/);
  const env = envFromProcess({ GC_SECRET_ID: 'i', GC_SECRET_KEY: 'k', APP_TOKEN: 't', APP_URL: 'https://a/', APP_ORIGIN: 'https://a', DATA_FILE: join(tmp(), 's.json') });
  assert.equal(env.MIN_REFRESH_MINUTES, '360');
});

test('serveur HTTP : auth, CORS et une seule lecture banque pour deux requêtes simultanées', async () => {
  const bank = [];
  const fetchFn = async (url) => {
    const path = url.replace('https://bankaccountdata.gocardless.com/api/v2', '');
    bank.push(path);
    const r = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
    if (path.startsWith('/token/')) return r({ access: 'A', access_expires: 86400 });
    if (path.startsWith('/institutions/')) return r([{ id: 'SOCIETE_GENERALE_SOGEFRPP', name: 'Société Générale' }]);
    if (path === '/requisitions/') return r({ id: 'REQ', link: 'https://bank.example/c', status: 'CR' }, 201);
    if (path.startsWith('/requisitions/REQ')) return r({ status: 'LN', accounts: ['ACC'] });
    if (path.startsWith('/accounts/ACC/')) {
      await new Promise((ok) => setTimeout(ok, 30)); // laisse la 2e requête arriver pendant la lecture
      return r({ transactions: { booked: [{ transactionId: 'T1', bookingDate: '2026-10-12', transactionAmount: { amount: '-5.00', currency: 'EUR' }, remittanceInformationUnstructured: 'X' }] } });
    }
    return r({}, 404);
  };
  const env = envFromProcess({ GC_SECRET_ID: 'i', GC_SECRET_KEY: 'k', APP_TOKEN: 'secret', APP_URL: 'https://app/', APP_ORIGIN: 'https://app', DATA_FILE: join(tmp(), 's.json') });
  const server = createApp(env, { fetchFn });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, token = 'secret', method = 'GET') => fetch(base + path, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  try {
    assert.equal((await get('/api/status', '')).status, 401);
    assert.equal((await get('/api/status', 'wrong')).status, 401);
    const pre = await fetch(`${base}/api/transactions`, { method: 'OPTIONS' });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://app');
    assert.equal((await (await get('/api/link', 'secret', 'POST')).json()).link, 'https://bank.example/c');
    const [a, b] = await Promise.all([get('/api/transactions'), get('/api/transactions')]);
    assert.equal((await a.json()).rows.length, 1);
    assert.equal((await b.json()).rows.length, 1);
    assert.equal(bank.filter((p) => p.includes('/accounts/')).length, 1);
  } finally {
    server.close();
  }
});
