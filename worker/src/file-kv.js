import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Remplaçant minimal du KV de Cloudflare : un seul fichier JSON, écrit de façon atomique
// (fichier temporaire puis renommage) pour qu'une coupure ne laisse jamais un fichier tronqué.
export function createFileKv(path) {
  let data = null;
  let queue = Promise.resolve();

  async function load() {
    if (data) return data;
    try {
      data = JSON.parse(await readFile(path, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error(`Fichier de données illisible (${path}) : ${e.message}`, { cause: e });
      data = {};
    }
    return data;
  }

  return {
    async get(key) {
      const all = await load();
      return key in all ? JSON.parse(all[key]) : null;
    },
    // Les écritures sont mises en file : elles s'exécutent une par une, dans l'ordre.
    put(key, value) {
      const run = async () => {
        const all = await load();
        all[key] = value;
        await mkdir(dirname(path), { recursive: true });
        const tmp = `${path}.tmp`;
        await writeFile(tmp, JSON.stringify(all), { mode: 0o600 });
        await rename(tmp, path);
      };
      queue = queue.then(run, run);
      return queue;
    },
  };
}
