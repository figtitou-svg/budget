// Version « VM » du serveur de synchronisation : mêmes routes que le Worker Cloudflare,
// servies par Node (aucune dépendance). À placer derrière un reverse proxy HTTPS.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { handle } from './src/index.js';
import { createFileKv } from './src/file-kv.js';

// Corps des requêtes POST (petits JSON seulement).
async function readBody(req, limit = 16 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Requête trop volumineuse');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createApp(env, { fetchFn = fetch, now = () => Date.now() } = {}) {
  // Les requêtes passent une par une : deux lectures simultanées ne peuvent pas
  // consommer deux fois le quota quotidien de la banque.
  let queue = Promise.resolve();
  const serialize = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  return http.createServer(async (req, res) => {
    try {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers, body: hasBody ? await readBody(req) : undefined });
      const response = await serialize(() => handle(request, env, { now: now(), fetchFn }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"internal"}');
    }
  });
}

export function envFromProcess(p = process.env) {
  const missing = ['EB_APP_ID', 'APP_TOKEN', 'APP_URL', 'APP_ORIGIN'].filter((k) => !p[k]);
  if (!p.EB_PRIVATE_KEY && !p.EB_PRIVATE_KEY_FILE) missing.push('EB_PRIVATE_KEY_FILE');
  if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')}`);
  return {
    EB_APP_ID: p.EB_APP_ID,
    EB_PRIVATE_KEY: p.EB_PRIVATE_KEY || readFileSync(p.EB_PRIVATE_KEY_FILE, 'utf8'),
    APP_TOKEN: p.APP_TOKEN,
    APP_URL: p.APP_URL, APP_ORIGIN: p.APP_ORIGIN,
    MIN_REFRESH_MINUTES: p.MIN_REFRESH_MINUTES ?? '360',
    ASPSP_NAME: p.ASPSP_NAME || undefined,
    ACCOUNT_TAGS: p.ACCOUNT_TAGS || undefined,
    BUDGET: createFileKv(p.DATA_FILE ?? new URL('./data/state.json', import.meta.url).pathname),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 8787);
  let env;
  try {
    env = envFromProcess();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  createApp(env).listen(port, host, () => console.log(`budget-sync à l'écoute sur http://${host}:${port}`));
}
