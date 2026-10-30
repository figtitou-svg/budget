// Version « VM » du serveur de synchronisation : mêmes routes que le Worker Cloudflare,
// servies par Node (aucune dépendance). À placer derrière un reverse proxy HTTPS.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { handle } from './src/index.js';
import { createFileKv } from './src/file-kv.js';

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
      const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers });
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
  const missing = ['GC_SECRET_ID', 'GC_SECRET_KEY', 'APP_TOKEN', 'APP_URL', 'APP_ORIGIN'].filter((k) => !p[k]);
  if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')}`);
  return {
    GC_SECRET_ID: p.GC_SECRET_ID, GC_SECRET_KEY: p.GC_SECRET_KEY, APP_TOKEN: p.APP_TOKEN,
    APP_URL: p.APP_URL, APP_ORIGIN: p.APP_ORIGIN,
    MIN_REFRESH_MINUTES: p.MIN_REFRESH_MINUTES ?? '360',
    INSTITUTION_ID: p.INSTITUTION_ID || undefined,
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
