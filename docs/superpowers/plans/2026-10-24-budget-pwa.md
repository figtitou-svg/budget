# Budget PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une PWA mobile hors-ligne qui importe un relevé Société Générale (CSV/OFX), catégorise automatiquement les opérations et montre la répartition du mois et l'évolution mois par mois.

**Architecture:** Site statique en modules ES, sans build. Toute la logique métier vit dans `src/core/` (pure, testée avec `node --test`). L'interface (`src/ui/`, `src/app.js`, `src/actions.js`) lit/écrit l'état en mémoire et le persiste dans IndexedDB via `src/store.js`. Un service worker met tout en cache pour l'usage hors-ligne.

**Tech Stack:** JavaScript (ES2022, modules), HTML, CSS, IndexedDB, Service Worker, SVG fait main pour les graphiques, Node 24 (`node --test`, `node:zlib`) pour tests et scripts. Aucune dépendance npm.

**Spec:** `docs/superpowers/specs/2026-10-24-budget-pwa-design.md`

## Global Constraints

- Aucune dépendance npm, aucune étape de build, aucun CDN : l'app doit marcher hors-ligne telle quelle et être publiable sur GitHub Pages dans un sous-dossier → **tous les chemins sont relatifs** (`./…`), jamais `/…`.
- **Écart assumé à la spec §2** : pas de Chart.js. Donut et barres empilées sont générés en SVG par `src/ui/charts.js` (pur, testé). Moins de poids, zéro téléchargement.
- `src/core/` n'accède jamais à `window`, `document`, `indexedDB`, `navigator`.
- Montants toujours en **centimes entiers signés** (`amountCents`, négatif = dépense). Dates toujours des chaînes `YYYY-MM-DD`, mois `YYYY-MM`. Jamais d'objet `Date` local pour les calculs (seulement `Date.UTC` dans `parseDate`/formatage).
- Interface en français, mobile d'abord (≥ 360 px), cibles tactiles ≥ 44 px, thème clair/sombre selon le système.
- Toute chaîne venant d'un fichier importé passe par `escapeHtml` avant d'entrer dans du HTML.
- Tests : `npm test` (= `node --test`) depuis la racine ; fichiers `tests/*.test.js`, style `node:test` + `node:assert/strict`.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Serveur local de dev : `node scripts/serve.mjs` sur le port 4173 (config `.claude/launch.json` nommée `budget`).

**User decisions (already made):**
- Priorité : « savoir où part l'argent » (pas de budgets/abonnements en v1).
- Banque : Société Générale ; import CSV + OFX ; pas de temps réel en v1 (connecteur DSP2 plus tard, avec l'utilisateur).
- Usage : téléphone surtout.
- Vues : répartition du mois + évolution mois par mois.
- Approche : PWA JavaScript pur, sans build.

## Review Focus

1. **Relevé SG réel au format légèrement différent** (cellules `="…"`, montants suffixés ` EUR`, colonnes Débit/Crédit, libellés en double) → détection automatique ou écran de correspondance ; rien n'est écrit si la lecture échoue. Tests : Task 2 (guillemets/EUR, débit/crédit, NO_HEADER) et Task 7 (mapping).
2. **Réimport de relevés qui se chevauchent** → zéro doublon, mais deux achats identiques le même jour restent deux opérations. Tests : Task 6 et Task 7.
3. **Fichier exporté en Windows-1252** (accents, `€`) → décodé correctement. Tests : Task 1 et Task 7.
4. **Mauvais fichier choisi** (PDF, image, fichier vide) → message clair `NOT_TEXT`/`EMPTY`, aucune écriture. Test : Task 7.
5. **Changement d'année et remboursements carte** → `shiftMonth` franchit décembre/janvier ; une opération carte positive est un remboursement, pas une dépense. Tests : Task 8 et Task 5.

## File Structure

```
package.json, .gitignore, .claude/launch.json
index.html, styles.css, manifest.webmanifest, sw.js
icons/icon.svg, icon-192.png, icon-512.png, icon-maskable-512.png
scripts/serve.mjs        serveur statique de dev
scripts/make-icons.mjs   génère les PNG d'icônes (zlib)
scripts/make-fixtures.mjs génère des relevés SG fictifs pour tests navigateur
src/core/errors.js       ImportError (code, message, details)
src/core/decode.js       octets → texte (UTF-8 puis Windows-1252)
src/core/parse-sg-csv.js CSV SG → lignes {date, amountCents, rawLabel}
src/core/parse-ofx.js    OFX → lignes
src/core/normalize.js    libellé → commerçant
src/core/categories.js   catégories par défaut
src/core/categorize.js   catégorisation, règles, saisie manuelle
src/core/dedupe.js       empreintes, ids, séparation des doublons
src/core/mapping.js      rôles de colonnes choisis → mapping
src/core/import.js       pipeline octets → transactions à ajouter
src/core/stats.js        résumé du mois, mois, tendance
src/core/backup.js       export/import JSON
src/core/demo.js         données de démo déterministes
src/ui/format.js         euros, mois, dates, %, escapeHtml
src/ui/charts.js         SVG donut + barres empilées
src/ui/sheet.js          feuille modale + confirmation
src/ui/month.js          écran Mois
src/ui/category-sheet.js choix de catégorie d'une opération
src/ui/trends.js         écran Évolution
src/ui/import.js         écran Import + réglages
src/store.js             IndexedDB (+ repli mémoire)
src/actions.js           actions métier côté navigateur
src/app.js               état, routage, rendu
tests/*.test.js, tests/fixtures/
README.md, RAPPORT.md
```

Transaction (forme unique partout) :
```js
{ id, date, amountCents, rawLabel, merchant, categoryId, categorySource /* 'default'|'rule'|'manual' */, importedAt, demo? }
```

---

### Task 0: Scaffolding du projet

**Goal:** Squelette du dépôt : `package.json`, serveur de dev, config de prévisualisation, classe d'erreur partagée et premier test vert.

**Files:**
- Create: `package.json`, `.gitignore`, `.claude/launch.json`, `scripts/serve.mjs`, `src/core/errors.js`
- Test: `tests/errors.test.js`

**Acceptance Criteria:**
- [ ] `npm test` passe (1 test) depuis la racine
- [ ] `node scripts/serve.mjs` sert `index.html` absent → 404 texte, et refuse `..` (403/404)
- [ ] `ImportError` expose `code`, `message`, `details`, `name === 'ImportError'`

**Verify:** `npm test` → `# pass 1`, `# fail 0`

**Steps:**

- [ ] **Step 1: Créer `package.json` et `.gitignore`**

```json
{
  "name": "budget",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Où part mon argent — PWA hors-ligne pour relevés Société Générale",
  "scripts": {
    "test": "node --test",
    "serve": "node scripts/serve.mjs",
    "icons": "node scripts/make-icons.mjs",
    "fixtures": "node scripts/make-fixtures.mjs"
  }
}
```

`.gitignore` :
```
node_modules/
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Écrire le test qui échoue** — `tests/errors.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImportError } from '../src/core/errors.js';

test('ImportError porte un code, un message et des détails', () => {
  const e = new ImportError('NO_ROWS', 'Aucune opération', { a: 1 });
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'ImportError');
  assert.equal(e.code, 'NO_ROWS');
  assert.equal(e.message, 'Aucune opération');
  assert.deepEqual(e.details, { a: 1 });
  assert.deepEqual(new ImportError('X', 'y').details, {});
});
```

- [ ] **Step 3: Lancer** `npm test` → FAIL (`Cannot find module …errors.js`)

- [ ] **Step 4: Implémenter** `src/core/errors.js`

```js
export class ImportError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.details = details;
  }
}
```

- [ ] **Step 5: Serveur de dev** `scripts/serve.mjs`

```js
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(process.argv[2] ?? '.');
const PORT = Number(process.env.PORT ?? 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.csv': 'text/csv; charset=windows-1252',
  '.ofx': 'application/x-ofx',
  '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (path !== ROOT && !path.startsWith(ROOT + sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Interdit');
      return;
    }
    if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }).end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
}).listen(PORT, () => console.log(`Budget sur http://localhost:${PORT}`));
```

`.claude/launch.json` :
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "budget", "runtimeExecutable": "node", "runtimeArgs": ["scripts/serve.mjs"], "port": 4173 }
  ]
}
```

- [ ] **Step 6: Lancer** `npm test` → PASS (1 test)

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore .claude/launch.json scripts/serve.mjs src/core/errors.js tests/errors.test.js
git commit -m "chore: squelette du projet, serveur de dev, ImportError" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Décodage des octets

**Goal:** `decodeBytes` transforme les octets d'un fichier en texte, en UTF-8 ou en Windows-1252 si l'UTF-8 est invalide, sans BOM.

**Files:**
- Create: `src/core/decode.js`
- Test: `tests/decode.test.js`

**Acceptance Criteria:**
- [ ] UTF-8 valide décodé tel quel ; Latin-1/Windows-1252 (`é` = 0xE9, `€` = 0x80) décodé correctement
- [ ] BOM UTF-8 retiré ; accepte `Uint8Array` et `ArrayBuffer`

**Verify:** `node --test tests/decode.test.js` → 5 pass

**Steps:**

- [ ] **Step 1: Test** `tests/decode.test.js`

```js
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
```

- [ ] **Step 2: Lancer** `node --test tests/decode.test.js` → FAIL (module introuvable)

- [ ] **Step 3: Implémenter** `src/core/decode.js`

```js
export function decodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = new TextDecoder('utf-8').decode(u8);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(u8);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}
```

- [ ] **Step 4: Lancer** → PASS (5)

- [ ] **Step 5: Commit**

```bash
git add src/core/decode.js tests/decode.test.js
git commit -m "feat(core): décodage UTF-8 / Windows-1252" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lecture du CSV Société Générale

**Goal:** `parseSgCsv(text, { mapping })` extrait `{ rows: [{date, amountCents, rawLabel}], skipped }` d'un export CSV SG (ou de tout CSV avec un mapping fourni), et lève `ImportError` `NO_HEADER` (avec aperçu) ou `NO_ROWS`.

**Files:**
- Create: `src/core/parse-sg-csv.js`
- Test: `tests/parse-sg-csv.test.js`

**Acceptance Criteria:**
- [ ] `parseAmount` : `-23,45`→-2345, `1 234,56`→123456, `1.234,56`→123456, `12.5`→1250, `+3`→300, `1 000,00`→100000, `-5,20 EUR`→-520, `''`/`abc`→null
- [ ] `parseDate` : `12/10/2026`→`2026-10-12`, `1/2/26`→`2026-02-01`, `2026-10-12`→idem, `31/02/2026`→null
- [ ] Format SG classique (lignes de compte avant l'en-tête, `Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise`) → 3 lignes, libellé = le plus complet
- [ ] Format Débit/Crédit avec « Date opération » prioritaire sur « Date de comptabilisation »
- [ ] Cellules `="…"` et `;` entre guillemets gérés
- [ ] En-tête introuvable → `NO_HEADER` avec `details.sep` et `details.preview` ; avec `mapping` → lignes lues ; aucune ligne → `NO_ROWS`

**Verify:** `node --test tests/parse-sg-csv.test.js` → tout passe

**Steps:**

- [ ] **Step 1: Test** `tests/parse-sg-csv.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseDate, splitCsvLine, detectColumns, joinLabels, parseSgCsv } from '../src/core/parse-sg-csv.js';

test('parseAmount lit les formats français et anglais', () => {
  const cases = [['-23,45', -2345], ['1 234,56', 123456], ['1.234,56', 123456], ['12.5', 1250], ['+3', 300],
    ['1 000,00', 100000], ['-5,20 EUR', -520], ['12,00 €', 1200], ['', null], ['abc', null], [undefined, null]];
  for (const [input, expected] of cases) assert.equal(parseAmount(input), expected, String(input));
});

test('parseDate normalise en YYYY-MM-DD et rejette les dates impossibles', () => {
  assert.equal(parseDate('12/10/2026'), '2026-10-12');
  assert.equal(parseDate('1/2/26'), '2026-02-01');
  assert.equal(parseDate('2026-10-12'), '2026-10-12');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('13/13/2026'), null);
  assert.equal(parseDate('x'), null);
});

test('splitCsvLine gère guillemets, ="…" et séparateur dans un champ', () => {
  assert.deepEqual(splitCsvLine('="12/10/2026";"CARTE X1234 LIDL; LYON";"a ""b"""', ';'),
    ['12/10/2026', 'CARTE X1234 LIDL; LYON', 'a "b"']);
});

test('joinLabels garde le libellé le plus complet et ajoute les compléments', () => {
  assert.equal(joinLabels(['CARTE X1234 12/10 CARREFOUR', 'CARTE X1234 12/10 CARREFOUR CITY LYON']), 'CARTE X1234 12/10 CARREFOUR CITY LYON');
  assert.equal(joinLabels(['UBER EATS', 'CARTE X1234 14/10 UBER *EATS PARIS']), 'CARTE X1234 14/10 UBER *EATS PARIS');
  assert.equal(joinLabels(['PRLV SEPA', 'FREE MOBILE']), 'PRLV SEPA FREE MOBILE');
  assert.equal(joinLabels(['', '  ']), '');
});

const SG_CLASSIQUE = [
  '="000123456789";Compte Bancaire;Solde au 24/10/2026;1 234,56 EUR',
  '',
  "Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise",
  '12/10/2026;CARTE X1234 12/10 CARREFOUR;CARTE X1234 12/10 CARREFOUR CITY LYON;-23,45;EUR',
  '11/10/2026;VIR RECU 1234567;VIR RECU 1234567 DE: CAF DU RHONE MOTIF: ALLOCATION;120,00;EUR',
  '10/10/2026;PRLV SEPA FREE MOBILE;PRLV SEPA FREE MOBILE ECH/101026 ID EMETTEUR/FR12ZZZ;-15,99;EUR',
  '',
].join('\r\n');

test('lit le format SG classique', () => {
  const { rows, skipped } = parseSgCsv(SG_CLASSIQUE);
  assert.equal(skipped, 0);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { date: '2026-10-12', amountCents: -2345, rawLabel: 'CARTE X1234 12/10 CARREFOUR CITY LYON' });
  assert.equal(rows[1].amountCents, 12000);
  assert.equal(rows[2].rawLabel, 'PRLV SEPA FREE MOBILE ECH/101026 ID EMETTEUR/FR12ZZZ');
});

test('lit le format Débit/Crédit et préfère la date d’opération', () => {
  const text = [
    'Date de comptabilisation;Libellé simplifié;Libellé opération;Référence;Débit;Crédit;Date opération',
    '15/10/2026;UBER EATS;CARTE X1234 14/10 UBER *EATS PARIS;REF1;-18,90;;14/10/2026',
    '16/10/2026;SALAIRE;VIR RECU DE: ACME MOTIF: SALAIRE;REF2;;850,00;16/10/2026',
    'Solde au 16/10/2026;;;;;;',
  ].join('\n');
  const { rows, skipped } = parseSgCsv(text);
  assert.equal(skipped, 1);
  assert.deepEqual(rows[0], { date: '2026-10-14', amountCents: -1890, rawLabel: 'CARTE X1234 14/10 UBER *EATS PARIS' });
  assert.deepEqual(rows[1], { date: '2026-10-16', amountCents: 85000, rawLabel: 'VIR RECU DE: ACME MOTIF: SALAIRE' });
});

test('débit positif est quand même une dépense', () => {
  const text = 'Date;Libellé;Débit;Crédit\n01/10/2026;LOYER;380,00;';
  assert.equal(parseSgCsv(text).rows[0].amountCents, -38000);
});

test('cellules entre guillemets et montants suffixés EUR', () => {
  const text = ['"Date";"Libellé";"Montant"', '="12/10/2026";"CARTE X1234 12/10 LIDL; LYON";"-5,20 EUR"'].join('\n');
  assert.deepEqual(parseSgCsv(text).rows, [{ date: '2026-10-12', amountCents: -520, rawLabel: 'CARTE X1234 12/10 LIDL; LYON' }]);
});

test('detectColumns renvoie null sans colonne date', () => {
  assert.equal(detectColumns(['Jour', 'Opération', 'Valeur']), null);
  assert.deepEqual(detectColumns(['Date', 'Libellé', 'Montant']), { date: 0, labels: [1], amount: 2 });
});

test('en-tête inconnu → NO_HEADER avec aperçu', () => {
  const text = 'Jour;Opération;Valeur\n12/10/2026;LIDL;-5,00\n13/10/2026;SNCF;-20,00';
  assert.throws(() => parseSgCsv(text), (e) => {
    assert.equal(e.code, 'NO_HEADER');
    assert.equal(e.details.sep, ';');
    assert.equal(e.details.preview.length, 3);
    assert.deepEqual(e.details.preview[1], ['12/10/2026', 'LIDL', '-5,00']);
    return true;
  });
});

test('avec un mapping, lit les lignes et ignore l’en-tête', () => {
  const text = 'Jour;Opération;Valeur\n12/10/2026;LIDL;-5,00\n13/10/2026;SNCF;-20,00';
  const { rows, skipped } = parseSgCsv(text, { mapping: { sep: ';', date: 0, labels: [1], amount: 2 } });
  assert.equal(rows.length, 2);
  assert.equal(skipped, 1);
  assert.deepEqual(rows[1], { date: '2026-10-13', amountCents: -2000, rawLabel: 'SNCF' });
});

test('aucune ligne exploitable → NO_ROWS', () => {
  assert.throws(() => parseSgCsv('Date;Libellé;Montant\n'), { code: 'NO_ROWS' });
});
```

- [ ] **Step 2: Lancer** `node --test tests/parse-sg-csv.test.js` → FAIL (module introuvable)

- [ ] **Step 3: Implémenter** `src/core/parse-sg-csv.js`

```js
import { ImportError } from './errors.js';

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase().trim();
const squash = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function detectSeparator(lines) {
  const sample = lines.slice(0, 30).join('\n');
  if (sample.includes(';')) return ';';
  if (sample.includes('\t')) return '\t';
  return ',';
}

export function splitCsvLine(line, sep) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim().replace(/^=/, ''));
}

export function parseAmount(input) {
  if (input == null) return null;
  let s = String(input).replace(/[\s  €]/g, '').replace(/EUR$/i, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const m = s.match(/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] || '').padEnd(2, '0'));
  return m[1] === '-' ? -cents : cents;
}

export function parseDate(input) {
  const s = String(input ?? '').trim();
  let y, m, d, r;
  if ((r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/))) {
    d = +r[1]; m = +r[2]; y = r[3].length === 2 ? 2000 + +r[3] : +r[3];
  } else if ((r = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
    y = +r[1]; m = +r[2]; d = +r[3];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function detectColumns(cells) {
  const f = cells.map(fold);
  const find = (re, exclude) => f.findIndex((c) => re.test(c) && !(exclude && exclude.test(c)));
  let date = find(/date (de l'|d')?operation/);
  if (date < 0) date = find(/date de comptabilisation/);
  if (date < 0) date = find(/^date/, /valeur/);
  const labels = f.map((c, i) => (/libelle|detail/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (date < 0 || labels.length === 0) return null;
  const amount = find(/montant/);
  if (amount >= 0) return { date, labels, amount };
  const debit = find(/debit/);
  const credit = find(/credit/);
  if (debit >= 0 || credit >= 0) return { date, labels, debit: debit >= 0 ? debit : null, credit: credit >= 0 ? credit : null };
  return null;
}

export function joinLabels(parts) {
  const clean = parts.map((p) => String(p ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const out = [];
  for (const p of clean) if (!out.some((o) => squash(o).includes(squash(p)))) out.push(p);
  return out.join(' ');
}

export function rowFromCells(cells, m) {
  const date = parseDate(cells[m.date]);
  let amountCents;
  if (m.amount != null) amountCents = parseAmount(cells[m.amount]);
  else {
    const debit = m.debit != null ? parseAmount(cells[m.debit]) : null;
    const credit = m.credit != null ? parseAmount(cells[m.credit]) : null;
    amountCents = debit == null && credit == null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
  }
  const rawLabel = joinLabels(m.labels.map((i) => cells[i]));
  if (!date || amountCents == null || amountCents === 0 || !rawLabel) return null;
  return { date, amountCents, rawLabel };
}

export function parseSgCsv(text, { mapping } = {}) {
  const lines = text.split(/\r\n|\n|\r/);
  const sep = mapping?.sep ?? detectSeparator(lines);
  const table = lines.map((l) => splitCsvLine(l, sep));
  let m = mapping ?? null;
  let start = 0;
  if (!m) {
    const h = table.findIndex((cells) => cells.length >= 3 && detectColumns(cells));
    if (h < 0) {
      const preview = table.filter((c) => c.length >= 3 && c.some(Boolean)).slice(0, 8);
      throw new ImportError('NO_HEADER', 'Colonnes du relevé non reconnues.', { sep, preview });
    }
    m = detectColumns(table[h]);
    start = h + 1;
  }
  const rows = [];
  let skipped = 0;
  for (const cells of table.slice(start)) {
    if (cells.every((c) => c === '')) continue;
    const row = rowFromCells(cells, m);
    if (row) rows.push(row); else skipped++;
  }
  if (!rows.length) throw new ImportError('NO_ROWS', 'Aucune opération trouvée dans ce fichier.');
  return { rows, skipped };
}
```

- [ ] **Step 4: Lancer** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/parse-sg-csv.js tests/parse-sg-csv.test.js
git commit -m "feat(core): lecture du CSV Société Générale" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lecture de l'OFX

**Goal:** `parseOfx(text)` lit les blocs `<STMTTRN>` (SGML sans balises fermantes ou XML) et `isOfx(text)` détecte le format.

**Files:**
- Create: `src/core/parse-ofx.js`
- Test: `tests/parse-ofx.test.js`

**Acceptance Criteria:**
- [ ] SGML : 2 opérations, date `DTPOSTED` avec heure/fuseau tronquée, montant `-23.45` et `120,00`
- [ ] XML : entités `&amp;` décodées
- [ ] Aucun bloc → `NO_ROWS` ; `isOfx` vrai pour `OFXHEADER` ou `<OFX>`, faux pour un CSV

**Verify:** `node --test tests/parse-ofx.test.js` → tout passe

**Steps:**

- [ ] **Step 1: Test** `tests/parse-ofx.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOfx, parseOfx } from '../src/core/parse-ofx.js';

const SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261012
<TRNAMT>-23.45
<FITID>1
<NAME>CARTE X1234 12/10 CARREFOUR
<MEMO>CARREFOUR CITY LYON
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261011120000[+1:CET]
<TRNAMT>120,00
<NAME>VIR RECU DE: CAF DU RHONE
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('détecte l’OFX', () => {
  assert.equal(isOfx(SGML), true);
  assert.equal(isOfx('<?xml version="1.0"?><OFX></OFX>'), true);
  assert.equal(isOfx('Date;Libellé;Montant'), false);
});

test('lit l’OFX SGML', () => {
  const { rows, skipped } = parseOfx(SGML);
  assert.equal(skipped, 0);
  assert.deepEqual(rows, [
    { date: '2026-10-12', amountCents: -2345, rawLabel: 'CARTE X1234 12/10 CARREFOUR CARREFOUR CITY LYON' },
    { date: '2026-10-11', amountCents: 12000, rawLabel: 'VIR RECU DE: CAF DU RHONE' },
  ]);
});

test('lit l’OFX XML et décode les entités', () => {
  const xml = '<OFX><STMTTRN><DTPOSTED>20260930</DTPOSTED><TRNAMT>-9.99</TRNAMT><NAME>NETFLIX &amp; CO</NAME></STMTTRN>'
    + '<STMTTRN><DTPOSTED>20260931</DTPOSTED><TRNAMT>-1.00</TRNAMT><NAME>BAD DATE</NAME></STMTTRN></OFX>';
  const { rows, skipped } = parseOfx(xml);
  assert.deepEqual(rows, [{ date: '2026-09-30', amountCents: -999, rawLabel: 'NETFLIX & CO' }]);
  assert.equal(skipped, 1);
});

test('sans opération → NO_ROWS', () => {
  assert.throws(() => parseOfx('<OFX></OFX>'), { code: 'NO_ROWS' });
});
```

- [ ] **Step 2: Lancer** → FAIL (module introuvable)

- [ ] **Step 3: Implémenter** `src/core/parse-ofx.js`

```js
import { ImportError } from './errors.js';
import { parseAmount, parseDate, joinLabels } from './parse-sg-csv.js';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };
const decodeEntities = (s) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (e) => ENTITIES[e]);

export function isOfx(text) {
  return /OFXHEADER|<OFX>/i.test(text.slice(0, 2000));
}

export function parseOfx(text) {
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const rows = [];
  let skipped = 0;
  for (const block of blocks) {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
      return m ? decodeEntities(m[1].trim()) : '';
    };
    const dt = get('DTPOSTED').match(/^(\d{4})(\d{2})(\d{2})/);
    const date = dt ? parseDate(`${dt[1]}-${dt[2]}-${dt[3]}`) : null;
    const amountCents = parseAmount(get('TRNAMT'));
    const rawLabel = joinLabels([get('NAME'), get('MEMO')]);
    if (!date || amountCents == null || amountCents === 0 || !rawLabel) { skipped++; continue; }
    rows.push({ date, amountCents, rawLabel });
  }
  if (!rows.length) throw new ImportError('NO_ROWS', 'Aucune opération trouvée dans ce fichier.');
  return { rows, skipped };
}
```

Note : `joinLabels` trie par longueur décroissante ; `'CARTE X1234 12/10 CARREFOUR'` (27) passe avant `'CARREFOUR CITY LYON'` (19), d'où le libellé attendu du test.

- [ ] **Step 4: Lancer** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/parse-ofx.js tests/parse-ofx.test.js
git commit -m "feat(core): lecture de l'OFX" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Normalisation des libellés en commerçants

**Goal:** `normalizeMerchant(rawLabel)` renvoie un nom de commerçant court et stable (majuscules, sans accents, sans préfixes bancaires, références, dates ni ville finale) ; `foldUpper` est réutilisé par la catégorisation.

**Files:**
- Create: `src/core/normalize.js`
- Test: `tests/normalize.test.js`

**Acceptance Criteria:**
- [ ] Tous les cas du tableau de test donnent le résultat attendu
- [ ] Un libellé qui serait vidé par le nettoyage renvoie le libellé replié d'origine

**Verify:** `node --test tests/normalize.test.js` → tout passe

**Steps:**

- [ ] **Step 1: Test** `tests/normalize.test.js`

```js
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
```

- [ ] **Step 2: Lancer** → FAIL (module introuvable)

- [ ] **Step 3: Implémenter** `src/core/normalize.js`

```js
const CITIES = new Set(['PARIS', 'LYON', 'MARSEILLE', 'TOULOUSE', 'NICE', 'NANTES', 'STRASBOURG', 'MONTPELLIER',
  'BORDEAUX', 'LILLE', 'RENNES', 'REIMS', 'GRENOBLE', 'VILLEURBANNE', 'ROUEN', 'TOURS', 'DIJON', 'ANGERS', 'METZ',
  'NANCY', 'CLERMONT', 'CAEN', 'BREST', 'LIMOGES', 'AMIENS', 'PERPIGNAN', 'BESANCON', 'ORLEANS', 'FR', 'FRA', 'FRANCE']);

export function foldUpper(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

const isNoise = (w) => /^\d{1,2}\/\d{2}(\/\d{2,4})?$/.test(w) || /^\d{1,2}H\d{2}$/.test(w) || /\d{4,}/.test(w) || /^\d+$/.test(w);

export function normalizeMerchant(rawLabel) {
  const original = foldUpper(rawLabel);
  let s = original.replace(/^\d{4,}\s+/, '');
  s = s.replace(/^(CARTE|CB)\s+X?\d{4}\s+(\d{2}\/\d{2}(\/\d{2,4})?\s+)?/, '');
  if (/^RETRAIT\b|\bRETRAIT DAB\b/.test(s)) return 'RETRAIT DAB';
  const party = s.match(/\b(?:DE|POUR):\s*(.+?)(?=\s+(?:MOTIF|REF|ID|DATE|DE|POUR|LIB)\s*[:/]|$)/);
  if (/^(VIR|VIREMENT|AVOIR)\b/.test(s) && party) s = party[1];
  s = s.replace(/^(PRLV SEPA|PRELEVEMENT(?: EUROPEEN)?|VIR(?:EMENT)?(?: EUROPEEN| SEPA| INST(?:ANTANE)?)*(?: RECU| EMIS| RE)?|AVOIR|REMISE CHEQUE|CHEQUE)\s+/, '');
  s = s.split(/\s+(?:ECH\/|ID EMETTEUR|MDT\/|REF[:/]|MOTIF:|DATE:|LIB:)/)[0];
  s = s.replace(/\*/g, ' ');
  let words = s.split(' ').filter((w) => w && !isNoise(w));
  words = words.filter((w, i) => w !== words[i - 1]);
  while (words.length > 1 && CITIES.has(words[words.length - 1])) words.pop();
  const out = words.slice(0, 4).join(' ').replace(/[^A-Z0-9&' -]+$/, '').trim();
  return out || original;
}
```

Vérification mentale du cas « CARREFOUR CARREFOUR CITY LYON » : mots `CARREFOUR, CARREFOUR, CITY, LYON` → doublon adjacent retiré → `CARREFOUR CITY LYON` → ville retirée → `CARREFOUR CITY`.

- [ ] **Step 4: Lancer** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/normalize.js tests/normalize.test.js
git commit -m "feat(core): normalisation des libellés en commerçants" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Catégories et catégorisation

**Goal:** Liste des 15 catégories par défaut, catégorisation automatique par mots-clés (dépenses/recettes séparées), priorité manuel > règle > défaut, application d'une règle à un commerçant et saisie manuelle.

**Files:**
- Create: `src/core/categories.js`, `src/core/categorize.js`
- Test: `tests/categorize.test.js`

**Acceptance Criteria:**
- [ ] `DEFAULT_CATEGORIES` : 15 entrées `{id, name, color (#rrggbb), icon, order}` aux ids uniques, dont `autre`, `revenus`, `remboursements`
- [ ] Chaque ligne du tableau de test reçoit la catégorie attendue (dont carte positive → `remboursements`, inconnu → `autre`)
- [ ] `categorize` : `manual` conservé, règle prioritaire sur le défaut
- [ ] `applyRule` ne touche pas les `manual` sauf `includeId`, et garde les mêmes références pour les opérations inchangées ; `setManual` marque `manual`

**Verify:** `node --test tests/categorize.test.js` → tout passe

**Steps:**

- [ ] **Step 1: Test** `tests/categorize.test.js`

```js
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
```

- [ ] **Step 2: Lancer** → FAIL (modules introuvables)

- [ ] **Step 3: Implémenter** `src/core/categories.js`

```js
export const DEFAULT_CATEGORIES = [
  { id: 'courses', name: 'Courses', color: '#2e9e5b', icon: '🛒' },
  { id: 'resto', name: 'Resto & livraison', color: '#e8833a', icon: '🍔' },
  { id: 'transports', name: 'Transports', color: '#3a7be8', icon: '🚆' },
  { id: 'logement', name: 'Logement', color: '#8a5cd6', icon: '🏠' },
  { id: 'factures', name: 'Factures & télécom', color: '#5c6bc0', icon: '📱' },
  { id: 'sante', name: 'Santé', color: '#e05a7a', icon: '💊' },
  { id: 'shopping', name: 'Shopping', color: '#d6a03a', icon: '🛍️' },
  { id: 'loisirs', name: 'Loisirs & sorties', color: '#c94fc9', icon: '🎉' },
  { id: 'abonnements', name: 'Abonnements', color: '#26a6a6', icon: '🔁' },
  { id: 'etudes', name: 'Études', color: '#7a8c2e', icon: '🎓' },
  { id: 'retraits', name: 'Retraits', color: '#8d8d8d', icon: '💶' },
  { id: 'virements', name: 'Virements émis', color: '#6d7f99', icon: '↗️' },
  { id: 'revenus', name: 'Revenus', color: '#1f8a70', icon: '💰' },
  { id: 'remboursements', name: 'Remboursements', color: '#4caf8a', icon: '↩️' },
  { id: 'autre', name: 'Autre', color: '#a0a0a0', icon: '❔' },
].map((c, order) => ({ ...c, order }));

export const INCOME_CATEGORY_IDS = ['revenus', 'remboursements'];
```

- [ ] **Step 4: Implémenter** `src/core/categorize.js`

```js
import { foldUpper } from './normalize.js';

export const FALLBACK_CATEGORY = 'autre';

// Évalué dans l'ordre : la première règle qui correspond gagne.
const OUT = [
  ['retraits', /\bRETRAIT\b|\bDAB\b/],
  ['abonnements', /NETFLIX|SPOTIFY|DEEZER|DISNEY|\bCANAL|PRIME ?VIDEO|AMAZON PRIME|APPLE\.COM|ITUNES|GOOGLE ?PLAY|YOUTUBE|ICLOUD|CHATGPT|OPENAI|ANTHROPIC|BASIC ?FIT|FITNESS PARK|NEONESS|KEEP ?COOL|PLAYSTATION|XBOX|NINTENDO|TWITCH|AUDIBLE/],
  ['courses', /CARREFOUR|\bLIDL\b|AUCHAN|LECLERC|INTERMARCHE|MONOPRIX|FRANPRIX|\bCASINO\b|SUPER U\b|HYPER U\b|\bU EXPRESS|\bALDI\b|\bNETTO\b|PICARD|BIOCOOP|\bG20\b|\bSPAR\b|\bPROXI\b|NATURALIA|GRAND FRAIS|BOULANGERIE|PRIMEUR|BOUCHERIE/],
  ['resto', /UBER ?\*? ?EATS|DELIVEROO|JUST ?EAT|MC ?DO|BURGER KING|\bKFC\b|\bQUICK\b|DOMINO|PIZZ|SUSHI|STARBUCKS|RESTAU|BRASSERIE|\bCAFE\b|KEBAB|TACOS|CROUS RESTO|IZLY/],
  ['transports', /\bSNCF\b|OUIGO|\bTCL\b|\bRATP\b|NAVIGO|TISSEO|BLABLACAR|\bUBER\b|\bBOLT\b|HEETCH|TOTAL ?ENERGIES|\bESSO\b|\bSHELL\b|\bBP\b|\bAVIA\b|PEAGE|\bAPRR\b|\bSANEF\b|\bLIME\b|\bDOTT\b|VELO'?V|VELIB|FLIXBUS|AIR FRANCE|EASYJET|RYANAIR|TRANSAVIA|PARKING|INDIGO/],
  ['logement', /LOYER|FONCIA|NEXITY|CITYA|\bORPI\b|\bCROUS\b|STUDEFI|STUDEA|LOGITEL|AGENCE IMMO/],
  ['factures', /\bFREE\b|\bORANGE\b|\bSFR\b|BOUYGUES|\bSOSH\b|RED BY|\bEDF\b|ENGIE|\bEAU\b|VEOLIA|\bSUEZ\b|ASSURANCE|\bMAIF\b|\bMACIF\b|MATMUT|\bAXA\b|\bGMF\b|COTISATION|FRAIS BANCAIRE|COMMISSION/],
  ['sante', /PHARMA|\bPHIE\b|DOCTOLIB|MEDECIN|DENTISTE|OPTIC|MUTUELLE|LABORATOIRE|HOPITAL|CLINIQUE|KINE/],
  ['etudes', /\bINSA\b|UNIVERSITE|\bCVEC\b|SCOLARITE|LIBRAIRIE|GIBERT|PAPETERIE|BUREAU VALLEE/],
  ['loisirs', /CINEMA|PATHE|\bUGC\b|GAUMONT|\bMK2\b|TICKETMASTER|\bBAR\b|\bPUB\b|BOWLING|STEAM|EPIC GAMES|THEATRE|CONCERT|MUSEE|SHOTGUN|WEEZEVENT|BILLETWEB|FNAC SPECTACLE/],
  ['shopping', /AMAZON|\bAMZN\b|\bFNAC\b|DARTY|DECATHLON|\bZARA\b|\bH ?& ?M\b|PRIMARK|KIABI|CELIO|UNIQLO|SHEIN|ZALANDO|VINTED|LEBONCOIN|\bIKEA\b|\bACTION\b|CDISCOUNT|\bBOULANGER\b|SEPHORA|NOCIBE|ALIEXPRESS|\bTEMU\b|LEROY MERLIN|CASTORAMA/],
  ['virements', /\bVIR\b|VIREMENT|LYDIA|PAYPAL|SUMERIA|\bWERO\b|PAYLIB/],
];

const IN = [
  ['remboursements', /REMBOURSEMENT|\bREMB\b|\bAVOIR\b|\bCPAM\b|AMELI|MUTUELLE|REFUND|ANNULATION/],
  ['remboursements', /^CARTE\b|\bCB\b/],
  ['revenus', /SALAIRE|\bPAIE\b|\bCAF\b|\bCROUS\b|BOURSE|\bAPL\b|POLE EMPLOI|FRANCE TRAVAIL|INDEMNIT|INTERETS|\bVIR\b|VIREMENT|LYDIA|PAYPAL|\bWERO\b|SUMERIA/],
];

export function defaultCategory({ rawLabel, merchant = '', amountCents }) {
  const text = `${foldUpper(rawLabel)} ${merchant}`;
  for (const [id, re] of amountCents < 0 ? OUT : IN) if (re.test(text)) return id;
  return FALLBACK_CATEGORY;
}

export function categorize(tx, rules) {
  if (tx.categorySource === 'manual') return { categoryId: tx.categoryId, categorySource: 'manual' };
  const ruled = rules.get(tx.merchant);
  if (ruled) return { categoryId: ruled, categorySource: 'rule' };
  return { categoryId: defaultCategory(tx), categorySource: 'default' };
}

export function applyRule(transactions, merchant, categoryId, { includeId } = {}) {
  return transactions.map((t) => {
    if (t.merchant !== merchant) return t;
    if (t.categorySource === 'manual' && t.id !== includeId) return t;
    if (t.categoryId === categoryId && t.categorySource === 'rule') return t;
    return { ...t, categoryId, categorySource: 'rule' };
  });
}

export function setManual(transactions, id, categoryId) {
  return transactions.map((t) => (t.id === id ? { ...t, categoryId, categorySource: 'manual' } : t));
}
```

- [ ] **Step 5: Lancer** → PASS. Si un cas du tableau échoue, corriger l'expression ou l'ordre dans `OUT`/`IN` (pas le test), relancer tous les tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/categories.js src/core/categorize.js tests/categorize.test.js
git commit -m "feat(core): catégories par défaut et catégorisation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Doublons

**Goal:** Empreinte stable d'une opération, ids `empreinte#n` par rang d'occurrence dans un fichier, et séparation nouveautés / doublons.

**Files:**
- Create: `src/core/dedupe.js`
- Test: `tests/dedupe.test.js`

**Acceptance Criteria:**
- [ ] `fingerprint` ignore casse et espaces multiples du libellé
- [ ] Deux lignes identiques d'un même fichier → `#1` et `#2`
- [ ] Relevés qui se chevauchent `[a, b, b]` puis `[b, b, c]` → seul `c` est nouveau

**Verify:** `node --test tests/dedupe.test.js` → tout passe

**Steps:**

- [ ] **Step 1: Test** `tests/dedupe.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, assignIds, splitNew } from '../src/core/dedupe.js';

const row = (date, amountCents, rawLabel) => ({ date, amountCents, rawLabel });

test('fingerprint ignore casse et espaces', () => {
  assert.equal(fingerprint(row('2026-10-01', -250, 'Café  du  coin ')), fingerprint(row('2026-10-01', -250, 'CAFÉ DU COIN')));
  assert.notEqual(fingerprint(row('2026-10-01', -250, 'A')), fingerprint(row('2026-10-01', -251, 'A')));
});

test('assignIds numérote les occurrences identiques', () => {
  const ids = assignIds([row('2026-10-01', -250, 'CAFE'), row('2026-10-01', -250, 'CAFE'), row('2026-10-02', -250, 'CAFE')]).map((r) => r.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids[0].endsWith('#1'));
  assert.ok(ids[1].endsWith('#2'));
  assert.ok(ids[2].endsWith('#1'));
});

test('relevés qui se chevauchent : seul le nouveau passe', () => {
  const a = row('2026-10-01', -1000, 'A'), b = row('2026-10-02', -250, 'CAFE'), c = row('2026-10-03', -500, 'C');
  const first = assignIds([a, b, b]);
  const existing = new Set(first.map((t) => t.id));
  const { added, duplicates } = splitNew(assignIds([b, b, c]), existing);
  assert.deepEqual(added.map((t) => t.rawLabel), ['C']);
  assert.equal(duplicates.length, 2);
});
```

- [ ] **Step 2: Lancer** → FAIL

- [ ] **Step 3: Implémenter** `src/core/dedupe.js`

```js
export function fingerprint({ date, amountCents, rawLabel }) {
  return `${date}|${amountCents}|${String(rawLabel).toUpperCase().replace(/\s+/g, ' ').trim()}`;
}

export function assignIds(rows) {
  const counts = new Map();
  return rows.map((r) => {
    const fp = fingerprint(r);
    const n = (counts.get(fp) ?? 0) + 1;
    counts.set(fp, n);
    return { ...r, id: `${fp}#${n}` };
  });
}

export function splitNew(transactions, existingIds) {
  const added = [];
  const duplicates = [];
  for (const t of transactions) (existingIds.has(t.id) ? duplicates : added).push(t);
  return { added, duplicates };
}
```

Note : `toUpperCase` de `'Café'` donne `'CAFÉ'`, identique au second libellé du test.

- [ ] **Step 4: Lancer** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/dedupe.js tests/dedupe.test.js
git commit -m "feat(core): détection des doublons" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pipeline d'import et correspondance de colonnes

**Goal:** `planImport(bytes, opts)` transforme un fichier en opérations prêtes à enregistrer (commerçant, catégorie, id) en séparant les doublons ; `buildMapping(roles, sep)` transforme les choix de l'écran de correspondance en mapping. C'est aussi le point d'entrée d'un futur connecteur : `toTransactions(rows, rules, importedAt)`.

**Files:**
- Create: `src/core/import.js`, `src/core/mapping.js`
- Test: `tests/import.test.js`, `tests/mapping.test.js`

**Acceptance Criteria:**
- [ ] CSV SG encodé en Latin-1 → 3 opérations ajoutées avec commerçant et catégorie
- [ ] Réimport du même fichier avec `existingIds` → 0 ajout, 3 doublons
- [ ] Règle apprise appliquée (`categorySource: 'rule'`)
- [ ] PDF/binaire → `NOT_TEXT` ; fichier vide → `EMPTY` ; OFX reconnu
- [ ] `buildMapping` : erreurs claires sans date / sans libellé / sans montant ; mapping montant ou débit/crédit sinon

**Verify:** `node --test tests/import.test.js tests/mapping.test.js` → tout passe

**Steps:**

- [ ] **Step 1: Tests** `tests/import.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, parseStatement, toTransactions } from '../src/core/import.js';

const SG = [
  '="000123456789";Compte Bancaire;Solde au 24/10/2026;1 234,56 EUR',
  "Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise",
  '12/10/2026;CARTE X1234 12/10 CARREFOUR;CARTE X1234 12/10 CARREFOUR CITY LYON;-23,45;EUR',
  '11/10/2026;VIR RECU 1234567;VIR RECU 1234567 DE: CAF DU RHONE MOTIF: ALLOCATION;120,00;EUR',
  '10/10/2026;CARTE X1234 10/10 TRUC;CARTE X1234 10/10 TRUC BIZARRE;-7,00;EUR',
].join('\r\n');
const latin1 = (s) => new Uint8Array(Buffer.from(s, 'latin1'));
const NOW = '2026-10-24T08:00:00.000Z';

test('importe un CSV SG en Latin-1', () => {
  const plan = planImport(latin1(SG), { importedAt: NOW });
  assert.equal(plan.added.length, 3);
  assert.equal(plan.duplicateCount, 0);
  assert.equal(plan.uncategorizedCount, 1);
  const [carrefour, caf] = plan.added;
  assert.equal(carrefour.merchant, 'CARREFOUR CITY');
  assert.equal(carrefour.categoryId, 'courses');
  assert.equal(carrefour.categorySource, 'default');
  assert.equal(carrefour.importedAt, NOW);
  assert.match(carrefour.id, /^2026-10-12\|-2345\|.+#1$/);
  assert.equal(caf.categoryId, 'revenus');
});

test('réimporter le même relevé n’ajoute rien', () => {
  const first = planImport(latin1(SG), { importedAt: NOW });
  const again = planImport(latin1(SG), { existingIds: new Set(first.added.map((t) => t.id)) });
  assert.equal(again.added.length, 0);
  assert.equal(again.duplicateCount, 3);
});

test('applique les règles apprises', () => {
  const plan = planImport(latin1(SG), { rules: new Map([['CARREFOUR CITY', 'loisirs']]) });
  assert.equal(plan.added[0].categoryId, 'loisirs');
  assert.equal(plan.added[0].categorySource, 'rule');
});

test('refuse un fichier binaire et un fichier vide', () => {
  assert.throws(() => parseStatement(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02])), { code: 'NOT_TEXT' });
  assert.throws(() => parseStatement(new Uint8Array()), { code: 'EMPTY' });
  assert.throws(() => parseStatement(new TextEncoder().encode('  \n ')), { code: 'EMPTY' });
});

test('reconnaît l’OFX', () => {
  const ofx = 'OFXHEADER:100\n<OFX><STMTTRN><DTPOSTED>20261001<TRNAMT>-9.99<NAME>NETFLIX.COM</STMTTRN></OFX>';
  const plan = planImport(new TextEncoder().encode(ofx));
  assert.equal(plan.added.length, 1);
  assert.equal(plan.added[0].categoryId, 'abonnements');
});

test('passe le mapping au lecteur CSV', () => {
  const bytes = new TextEncoder().encode('Jour;Opération;Valeur\n12/10/2026;LIDL;-5,00');
  assert.throws(() => planImport(bytes), { code: 'NO_HEADER' });
  const plan = planImport(bytes, { mapping: { sep: ';', date: 0, labels: [1], amount: 2 } });
  assert.equal(plan.added[0].categoryId, 'courses');
  assert.equal(plan.skipped, 1);
});

test('toTransactions est réutilisable par une autre source', () => {
  const [t] = toTransactions([{ date: '2026-10-01', amountCents: -1599, rawLabel: 'PRLV SEPA FREE MOBILE' }], new Map(), NOW);
  assert.deepEqual(Object.keys(t).sort(), ['amountCents', 'categoryId', 'categorySource', 'date', 'id', 'importedAt', 'merchant', 'rawLabel']);
  assert.equal(t.categoryId, 'factures');
});
```

`tests/mapping.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMapping } from '../src/core/mapping.js';

test('mapping avec montant', () => {
  assert.deepEqual(buildMapping(['date', 'label', '', 'amount', 'label'], ';'),
    { mapping: { sep: ';', date: 0, labels: [1, 4], amount: 3 } });
});
test('mapping débit / crédit', () => {
  assert.deepEqual(buildMapping(['label', 'date', 'debit', 'credit'], ','),
    { mapping: { sep: ',', date: 1, labels: [0], debit: 2, credit: 3 } });
  assert.deepEqual(buildMapping(['label', 'date', 'debit'], ';').mapping.credit, null);
});
test('erreurs explicites', () => {
  assert.equal(buildMapping(['label', 'amount'], ';').error, 'Choisis la colonne Date.');
  assert.equal(buildMapping(['date', 'amount'], ';').error, 'Choisis au moins une colonne Libellé.');
  assert.equal(buildMapping(['date', 'label'], ';').error, 'Choisis la colonne Montant (ou Débit / Crédit).');
});
```

- [ ] **Step 2: Lancer** `node --test tests/import.test.js tests/mapping.test.js` → FAIL

- [ ] **Step 3: Implémenter** `src/core/mapping.js`

```js
export function buildMapping(roles, sep) {
  const first = (role) => roles.indexOf(role);
  const all = (role) => roles.map((r, i) => (r === role ? i : -1)).filter((i) => i >= 0);
  const date = first('date');
  const labels = all('label');
  if (date < 0) return { error: 'Choisis la colonne Date.' };
  if (!labels.length) return { error: 'Choisis au moins une colonne Libellé.' };
  if (first('amount') >= 0) return { mapping: { sep, date, labels, amount: first('amount') } };
  const debit = first('debit');
  const credit = first('credit');
  if (debit >= 0 || credit >= 0) return { mapping: { sep, date, labels, debit: debit >= 0 ? debit : null, credit: credit >= 0 ? credit : null } };
  return { error: 'Choisis la colonne Montant (ou Débit / Crédit).' };
}
```

- [ ] **Step 4: Implémenter** `src/core/import.js`

```js
import { decodeBytes } from './decode.js';
import { parseSgCsv } from './parse-sg-csv.js';
import { isOfx, parseOfx } from './parse-ofx.js';
import { normalizeMerchant } from './normalize.js';
import { categorize, FALLBACK_CATEGORY } from './categorize.js';
import { assignIds, splitNew } from './dedupe.js';
import { ImportError } from './errors.js';

export function parseStatement(bytes, { mapping } = {}) {
  const text = decodeBytes(bytes);
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 2000))) {
    throw new ImportError('NOT_TEXT', 'Ce fichier n’est pas un relevé CSV ou OFX.');
  }
  if (!text.trim()) throw new ImportError('EMPTY', 'Le fichier est vide.');
  return isOfx(text) ? parseOfx(text) : parseSgCsv(text, { mapping });
}

// Point d'entrée commun à toute source de lignes {date, amountCents, rawLabel}.
export function toTransactions(rows, rules, importedAt) {
  return assignIds(rows).map((r) => {
    const base = { ...r, merchant: normalizeMerchant(r.rawLabel), importedAt };
    return { ...base, ...categorize(base, rules) };
  });
}

export function planImport(bytes, { mapping, rules = new Map(), existingIds = new Set(), importedAt = new Date().toISOString() } = {}) {
  const { rows, skipped } = parseStatement(bytes, { mapping });
  const { added, duplicates } = splitNew(toTransactions(rows, rules, importedAt), existingIds);
  return {
    added,
    duplicateCount: duplicates.length,
    skipped,
    uncategorizedCount: added.filter((t) => t.categoryId === FALLBACK_CATEGORY).length,
  };
}
```

Note : `\u0009`–`\u000d` (tabulation, retours à la ligne) restent autorisés ; le test du fichier vide `'  \n '` passe donc à `EMPTY`.

- [ ] **Step 5: Lancer** → PASS, puis `npm test` → tout vert

- [ ] **Step 6: Commit**

```bash
git add src/core/import.js src/core/mapping.js tests/import.test.js tests/mapping.test.js
git commit -m "feat(core): pipeline d'import et correspondance de colonnes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Statistiques

**Goal:** Résumé d'un mois (dépensé, reçu, solde, répartition par catégorie), liste des mois, navigation entre mois, opérations d'une catégorie, et tendance sur N mois avec moyenne et écart.

**Files:**
- Create: `src/core/stats.js`
- Test: `tests/stats.test.js`

**Acceptance Criteria:**
- [ ] `monthSummary` octobre : dépensé 5000, reçu 50000, solde 45000, courses 80 % / resto 20 %
- [ ] `shiftMonth` franchit les années dans les deux sens
- [ ] `trend` : mois croissants, séries triées par total, moyenne des mois précédents à partir du premier mois avec des données, écart du dernier mois ; moyenne `null` sans historique

**Verify:** `node --test tests/stats.test.js` → tout passe

**Steps:**

- [ ] **Step 1: Test** `tests/stats.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthOf, shiftMonth, listMonths, monthSummary, transactionsFor, trend } from '../src/core/stats.js';

const tx = (date, amountCents, categoryId) => ({ id: `${date}${amountCents}${categoryId}`, date, amountCents, categoryId, merchant: 'X', rawLabel: 'X' });
const DATA = [
  tx('2026-10-02', -3000, 'courses'), tx('2026-10-05', -1000, 'resto'), tx('2026-10-09', -1000, 'courses'),
  tx('2026-10-01', 50000, 'revenus'), tx('2026-09-15', -2000, 'courses'), tx('2026-08-20', -6000, 'resto'),
];

test('monthOf et shiftMonth', () => {
  assert.equal(monthOf('2026-10-02'), '2026-10');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2025-12', 1), '2026-01');
  assert.equal(shiftMonth('2026-10', -12), '2025-10');
  assert.equal(shiftMonth('2026-10', 0), '2026-10');
});

test('listMonths du plus récent au plus ancien', () => {
  assert.deepEqual(listMonths(DATA), ['2026-10', '2026-09', '2026-08']);
  assert.deepEqual(listMonths([]), []);
});

test('monthSummary', () => {
  const s = monthSummary(DATA, '2026-10');
  assert.equal(s.spentCents, 5000);
  assert.equal(s.incomeCents, 50000);
  assert.equal(s.balanceCents, 45000);
  assert.equal(s.count, 4);
  assert.deepEqual(s.expenses, [
    { categoryId: 'courses', totalCents: 4000, count: 2, share: 0.8 },
    { categoryId: 'resto', totalCents: 1000, count: 1, share: 0.2 },
  ]);
  assert.deepEqual(s.income, [{ categoryId: 'revenus', totalCents: 50000, count: 1, share: 1 }]);
  const empty = monthSummary(DATA, '2026-07');
  assert.equal(empty.count, 0);
  assert.deepEqual(empty.expenses, []);
});

test('transactionsFor trie par date décroissante', () => {
  assert.deepEqual(transactionsFor(DATA, '2026-10', 'courses', 'out').map((t) => t.date), ['2026-10-09', '2026-10-02']);
  assert.deepEqual(transactionsFor(DATA, '2026-10', 'revenus', 'in').map((t) => t.amountCents), [50000]);
  assert.deepEqual(transactionsFor(DATA, '2026-10', 'revenus', 'out'), []);
});

test('trend sur 3 mois', () => {
  const t = trend(DATA, '2026-10', 3);
  assert.deepEqual(t.months, ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(t.totals, [6000, 2000, 5000]);
  assert.deepEqual(t.series.map((s) => [s.categoryId, s.values, s.total]), [['resto', [6000, 0, 1000], 7000], ['courses', [0, 2000, 4000], 6000]]);
  assert.equal(t.averageCents, 4000);
  assert.equal(t.currentCents, 5000);
  assert.equal(t.deltaCents, 1000);
});

test('trend sur 6 mois ignore les mois avant les premières données', () => {
  const t = trend(DATA, '2026-10', 6);
  assert.equal(t.months[0], '2026-05');
  assert.equal(t.averageCents, 4000);
});

test('trend filtré sur une catégorie', () => {
  const t = trend(DATA, '2026-10', 3, 'courses');
  assert.deepEqual(t.totals, [0, 2000, 4000]);
  assert.equal(t.averageCents, 1000);
  assert.equal(t.deltaCents, 3000);
});

test('trend sans historique', () => {
  const t = trend([tx('2026-10-02', -3000, 'courses')], '2026-10', 6);
  assert.equal(t.averageCents, null);
  assert.equal(t.deltaCents, null);
  assert.equal(t.currentCents, 3000);
});
```

- [ ] **Step 2: Lancer** → FAIL

- [ ] **Step 3: Implémenter** `src/core/stats.js`

```js
export const monthOf = (date) => date.slice(0, 7);

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function listMonths(txs) {
  return [...new Set(txs.map((t) => monthOf(t.date)))].sort().reverse();
}

function groupByCategory(list, total) {
  const map = new Map();
  for (const t of list) {
    const g = map.get(t.categoryId) ?? { categoryId: t.categoryId, totalCents: 0, count: 0 };
    g.totalCents += Math.abs(t.amountCents);
    g.count++;
    map.set(t.categoryId, g);
  }
  return [...map.values()]
    .sort((a, b) => b.totalCents - a.totalCents)
    .map((g) => ({ ...g, share: total ? g.totalCents / total : 0 }));
}

export function monthSummary(txs, month) {
  const inMonth = txs.filter((t) => monthOf(t.date) === month);
  const out = inMonth.filter((t) => t.amountCents < 0);
  const inc = inMonth.filter((t) => t.amountCents > 0);
  const spentCents = out.reduce((s, t) => s - t.amountCents, 0);
  const incomeCents = inc.reduce((s, t) => s + t.amountCents, 0);
  return {
    month,
    spentCents,
    incomeCents,
    balanceCents: incomeCents - spentCents,
    count: inMonth.length,
    expenses: groupByCategory(out, spentCents),
    income: groupByCategory(inc, incomeCents),
  };
}

export function transactionsFor(txs, month, categoryId, sign) {
  return txs
    .filter((t) => monthOf(t.date) === month && t.categoryId === categoryId && (sign === 'out' ? t.amountCents < 0 : t.amountCents > 0))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function trend(txs, endMonth, count, categoryId = null) {
  const months = Array.from({ length: count }, (_, i) => shiftMonth(endMonth, i - count + 1));
  const index = new Map(months.map((m, i) => [m, i]));
  const byCat = new Map();
  for (const t of txs) {
    if (t.amountCents >= 0 || (categoryId && t.categoryId !== categoryId)) continue;
    const i = index.get(monthOf(t.date));
    if (i === undefined) continue;
    const values = byCat.get(t.categoryId) ?? Array(count).fill(0);
    values[i] -= t.amountCents;
    byCat.set(t.categoryId, values);
  }
  const series = [...byCat]
    .map(([id, values]) => ({ categoryId: id, values, total: values.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  const totals = months.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const firstMonth = listMonths(txs).at(-1);
  const previous = months.slice(0, -1).map((m, i) => [m, totals[i]]).filter(([m]) => firstMonth && m >= firstMonth);
  const averageCents = previous.length ? Math.round(previous.reduce((s, [, v]) => s + v, 0) / previous.length) : null;
  const currentCents = totals[count - 1];
  return { months, series, totals, averageCents, currentCents, deltaCents: averageCents == null ? null : currentCents - averageCents };
}
```

- [ ] **Step 4: Lancer** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/stats.js tests/stats.test.js
git commit -m "feat(core): statistiques mensuelles et tendance" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Sauvegarde JSON et données de démo

**Goal:** Construire et valider une sauvegarde JSON versionnée ; générer six mois de données de démo réalistes et déterministes, toutes catégorisées.

**Files:**
- Create: `src/core/backup.js`, `src/core/demo.js`
- Test: `tests/backup.test.js`, `tests/demo.test.js`

**Acceptance Criteria:**
- [ ] Aller-retour `buildBackup` → `JSON.stringify` → `parseBackup` restitue opérations, règles (Map), catégories, réglages
- [ ] JSON invalide, mauvaise version ou opération incomplète → `ImportError` `BAD_BACKUP`
- [ ] Démo : même graine → mêmes données ; 6 mois se terminant au mois de `today` ; aucune date après `today` ; aucune opération `autre` ; toutes marquées `demo: true` ; au moins 8 catégories utilisées

**Verify:** `node --test tests/backup.test.js tests/demo.test.js` → tout passe

**Steps:**

- [ ] **Step 1: Tests** `tests/backup.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, BACKUP_VERSION } from '../src/core/backup.js';

const T = { id: 'x#1', date: '2026-10-01', amountCents: -100, rawLabel: 'A', merchant: 'A', categoryId: 'autre', categorySource: 'default', importedAt: 'now' };

test('aller-retour complet', () => {
  const data = { transactions: [T], rules: new Map([['A', 'courses']]), categories: [{ id: 'autre', name: 'Autre', color: '#a0a0a0', icon: '❔', order: 0 }], settings: { columnMapping: { sep: ';' } } };
  const backup = buildBackup(data, '2026-10-24T00:00:00.000Z');
  assert.equal(backup.version, BACKUP_VERSION);
  assert.equal(backup.app, 'budget');
  assert.deepEqual(backup.rules, [{ merchant: 'A', categoryId: 'courses' }]);
  const back = parseBackup(JSON.stringify(backup));
  assert.deepEqual(back.transactions, [T]);
  assert.deepEqual([...back.rules], [['A', 'courses']]);
  assert.deepEqual(back.categories, data.categories);
  assert.deepEqual(back.settings, data.settings);
});

test('refuse les fichiers invalides', () => {
  for (const text of ['pas du json', 'null', '{"version":2,"transactions":[]}', JSON.stringify({ version: 1, transactions: [{ ...T, amountCents: 1.5 }] }), JSON.stringify({ version: 1, transactions: [{ id: 'a' }] })]) {
    assert.throws(() => parseBackup(text), { code: 'BAD_BACKUP' }, text);
  }
});

test('champs facultatifs absents', () => {
  const back = parseBackup(JSON.stringify({ version: 1, transactions: [] }));
  assert.deepEqual(back.categories, []);
  assert.deepEqual(back.settings, {});
  assert.equal(back.rules.size, 0);
});
```

`tests/demo.test.js` :

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoRows, demoTransactions } from '../src/core/demo.js';

test('déterministe', () => {
  assert.deepEqual(demoRows('2026-10', { maxDay: 24 }), demoRows('2026-10', { maxDay: 24 }));
  assert.notDeepEqual(demoRows('2026-10', { seed: 1 }), demoRows('2026-10', { seed: 2 }));
});

test('six mois, rien dans le futur', () => {
  const rows = demoRows('2026-10', { maxDay: 24 });
  const months = new Set(rows.map((r) => r.date.slice(0, 7)));
  assert.deepEqual([...months].sort(), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.ok(rows.every((r) => r.date <= '2026-10-24'));
  assert.ok(rows.every((r) => Number.isInteger(r.amountCents) && r.amountCents !== 0));
});

test('toutes catégorisées et marquées démo', () => {
  const txs = demoTransactions('2026-10-24', new Map(), 'now');
  assert.ok(txs.length > 60);
  assert.ok(txs.every((t) => t.demo === true));
  assert.deepEqual(txs.filter((t) => t.categoryId === 'autre').map((t) => t.rawLabel), []);
  assert.ok(new Set(txs.map((t) => t.categoryId)).size >= 8);
  assert.equal(new Set(txs.map((t) => t.id)).size, txs.length);
});
```

- [ ] **Step 2: Lancer** → FAIL

- [ ] **Step 3: Implémenter** `src/core/backup.js`

```js
import { ImportError } from './errors.js';

export const BACKUP_VERSION = 1;

export function buildBackup({ transactions, rules, categories, settings }, exportedAt = new Date().toISOString()) {
  return {
    app: 'budget',
    version: BACKUP_VERSION,
    exportedAt,
    transactions,
    rules: [...rules].map(([merchant, categoryId]) => ({ merchant, categoryId })),
    categories,
    settings,
  };
}

const isTx = (t) => t && typeof t.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isInteger(t.amountCents)
  && typeof t.rawLabel === 'string' && typeof t.merchant === 'string' && typeof t.categoryId === 'string';

export function parseBackup(text) {
  const bad = () => new ImportError('BAD_BACKUP', 'Ce fichier n’est pas une sauvegarde valide de l’app.');
  let data;
  try { data = JSON.parse(text); } catch { throw bad(); }
  if (!data || data.version !== BACKUP_VERSION || !Array.isArray(data.transactions) || !data.transactions.every(isTx)) throw bad();
  const rules = data.rules ?? [];
  const categories = data.categories ?? [];
  if (!Array.isArray(rules) || !Array.isArray(categories)) throw bad();
  return {
    transactions: data.transactions,
    rules: new Map(rules.filter((r) => r && r.merchant && r.categoryId).map((r) => [r.merchant, r.categoryId])),
    categories,
    settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
  };
}
```

- [ ] **Step 4: Implémenter** `src/core/demo.js`

```js
import { toTransactions } from './import.js';
import { shiftMonth } from './stats.js';

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoRows(endMonth, { months = 6, seed = 42, maxDay = 28 } = {}) {
  const rnd = mulberry32(seed);
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const euros = (a, b) => -Math.round((a + rnd() * (b - a)) * 100);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const rows = [];
  for (let k = months - 1; k >= 0; k--) {
    const month = shiftMonth(endMonth, -k);
    const last = k === 0 ? Math.min(maxDay, 28) : 28;
    const dd = (d) => `${String(d).padStart(2, '0')}/${month.slice(5)}`;
    const add = (day, amountCents, label) => {
      if (day > last) return;
      rows.push({ date: `${month}-${String(day).padStart(2, '0')}`, amountCents, rawLabel: label });
    };
    const card = (day, amountCents, shop) => add(day, amountCents, `CARTE X1234 ${dd(day)} ${shop}`);

    add(1, 45000, 'VIR RECU 4512 DE: PARENTS MOTIF: VIREMENT MENSUEL');
    add(5, 18200, 'VIR RECU 7781 DE: CAF DU RHONE MOTIF: APL');
    add(3, -38000, 'PRLV SEPA CROUS LYON ECH/030 ID EMETTEUR/FR45ZZZ001');
    add(8, -1599, 'PRLV SEPA FREE MOBILE ECH/080 ID EMETTEUR/FR12ZZZ123456');
    card(12, -1199, 'SPOTIFY');
    card(15, -1399, 'NETFLIX.COM');
    card(2, -2520, 'TCL AGENCE');
    for (let i = int(6, 9); i > 0; i--) card(int(1, 28), euros(8, 55), pick(['CARREFOUR CITY LYON', 'LIDL', 'MONOPRIX LYON', 'AUCHAN', 'BOULANGERIE PAUL']));
    for (let i = int(2, 6); i > 0; i--) card(int(1, 28), euros(6, 24), pick(['UBER *EATS PARIS', 'DELIVEROO', 'MCDONALDS', 'CROUS RESTO U']));
    for (let i = int(1, 2); i > 0; i--) card(int(1, 28), euros(8, 30), pick(['PATHE BELLECOUR', 'BAR LE COMPTOIR', 'BOWLING STAR']));
    for (let i = int(0, 2); i > 0; i--) card(int(1, 28), euros(15, 60), pick(['AMAZON PAYMENTS', 'DECATHLON', 'FNAC']));
    if (rnd() < 0.5) card(int(1, 28), euros(20, 70), 'SNCF INTERNET');
    if (rnd() < 0.4) card(int(1, 28), euros(5, 25), 'PHARMACIE DU CENTRE');
    if (rnd() < 0.5) add(int(1, 28), pick([-2000, -4000]), `CARTE X1234 RETRAIT DAB ${dd(int(1, 28))} LYON`);
    if (rnd() < 0.5) add(int(1, 28), euros(10, 30), 'VIR EUROPEEN EMIS POUR: LUCAS MARTIN MOTIF: CADEAU');
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function demoTransactions(today, rules, importedAt = new Date().toISOString()) {
  const rows = demoRows(today.slice(0, 7), { maxDay: Number(today.slice(8, 10)) });
  return toTransactions(rows, rules, importedAt).map((t) => ({ ...t, demo: true }));
}
```

Note : `euros()` renvoie déjà un montant négatif ; seuls les deux virements reçus sont positifs. Si un libellé de démo finit en `autre`, corriger `demo.js` ou `categorize.js` (le test liste les libellés fautifs).

- [ ] **Step 5: Lancer** → PASS, puis `npm test`

- [ ] **Step 6: Commit**

```bash
git add src/core/backup.js src/core/demo.js tests/backup.test.js tests/demo.test.js
git commit -m "feat(core): sauvegarde JSON et données de démo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Formatage et graphiques SVG

**Goal:** Fonctions pures de formatage français (euros, mois, jours, pourcentages, échappement HTML) et générateurs SVG (donut, barres empilées avec ligne de moyenne).

**Files:**
- Create: `src/ui/format.js`, `src/ui/charts.js`
- Test: `tests/format.test.js`, `tests/charts.test.js`

**Acceptance Criteria:**
- [ ] `formatEuros(-2345)` → `-23,45 €` (espaces insécables normalisés pour le test), `{ signed: true }` affiche `+`
- [ ] `formatMonth('2026-10')` → `octobre 2026` ; `formatMonthShort` → `oct.` ; `formatDay('2026-10-12')` → `12 oct.`
- [ ] `escapeHtml` échappe `& < > " '`
- [ ] Donut : un arc par part non nulle + une piste ; total nul → piste seule ; textes échappés
- [ ] Barres : la plus haute colonne occupe toute la hauteur utile ; ligne de moyenne présente seulement si fournie

**Verify:** `node --test tests/format.test.js tests/charts.test.js` → tout passe

**Steps:**

- [ ] **Step 1: Tests** `tests/format.test.js`

```js
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
```

`tests/charts.test.js` :

```js
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
```

- [ ] **Step 2: Lancer** → FAIL

- [ ] **Step 3: Implémenter** `src/ui/format.js`

```js
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const EUR_SIGNED = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' });
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });
const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const utc = (y, m, d = 1) => new Date(Date.UTC(y, m - 1, d));

export function formatEuros(cents, { signed = false } = {}) {
  return (signed ? EUR_SIGNED : EUR).format(cents / 100);
}

export function formatMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return MONTH.format(utc(y, m));
}

export function formatMonthShort(month) {
  const [y, m] = month.split('-').map(Number);
  return MONTH_SHORT.format(utc(y, m));
}

export function formatDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return DAY.format(utc(y, m, d));
}

export function formatPercent(share) {
  if (share > 0 && share < 0.005) return '<1 %';
  return `${Math.round(share * 100)} %`;
}

const HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML[c]);
}
```

- [ ] **Step 4: Implémenter** `src/ui/charts.js`

```js
import { escapeHtml } from './format.js';

export function donutSvg(slices, { size = 200, thickness = 30, label = '', sublabel = '' } = {}) {
  const c = size / 2;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  const arcs = total > 0
    ? slices.filter((s) => s.value > 0).map((s) => {
      const len = (s.value / total) * C;
      const arc = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${escapeHtml(s.color)}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(3)} ${(C - len).toFixed(3)}" stroke-dashoffset="${(-offset).toFixed(3)}"><title>${escapeHtml(s.label)}</title></circle>`;
      offset += len;
      return arc;
    }).join('')
    : '';
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeHtml(`${label} ${sublabel}`.trim())}">`
    + `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${thickness}"/>`
    + `<g transform="rotate(-90 ${c} ${c})">${arcs}</g>`
    + `<text x="${c}" y="${c - 2}" text-anchor="middle" class="donut-label">${escapeHtml(label)}</text>`
    + `<text x="${c}" y="${c + 20}" text-anchor="middle" class="donut-sublabel">${escapeHtml(sublabel)}</text></svg>`;
}

export function stackedBarsSvg({ labels, series, averageCents = null, width = 340, height = 200 }) {
  const padTop = 10;
  const padBottom = 24;
  const padX = 4;
  const plotH = height - padTop - padBottom;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const max = Math.max(1, ...totals, averageCents ?? 0);
  const slot = (width - padX * 2) / Math.max(1, labels.length);
  const barW = Math.max(4, slot * 0.6);
  let body = '';
  labels.forEach((label, i) => {
    const x = padX + i * slot + (slot - barW) / 2;
    let y = padTop + plotH;
    for (const s of series) {
      const v = s.values[i];
      if (!v) continue;
      const h = (v / max) * plotH;
      y -= h;
      body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${escapeHtml(s.color)}"><title>${escapeHtml(s.title ?? '')}</title></rect>`;
    }
    body += `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" class="bar-label">${escapeHtml(label)}</text>`;
  });
  if (averageCents != null) {
    const y = padTop + plotH - (averageCents / max) * plotH;
    body += `<line x1="${padX}" x2="${width - padX}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="avg-line"/>`;
  }
  return `<svg class="bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="Dépenses par mois">${body}</svg>`;
}
```

Vérification du test de moyenne : max = 100, plotH = 100, y = 10 + 100 − 50 = 60.

- [ ] **Step 5: Lancer** → PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/format.js src/ui/charts.js tests/format.test.js tests/charts.test.js
git commit -m "feat(ui): formatage français et graphiques SVG" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Infrastructure navigateur (stockage, feuilles, actions, page, styles)

**Goal:** Tout ce dont les écrans ont besoin : persistance IndexedDB (avec repli mémoire), feuille modale et confirmation, actions métier (import, recatégorisation, démo, sauvegarde, effacement, catégories), page HTML et feuille de style mobile.

**Files:**
- Create: `src/store.js`, `src/ui/sheet.js`, `src/actions.js`, `index.html`, `styles.css`

**Acceptance Criteria:**
- [ ] `node --check` passe sur `src/store.js`, `src/ui/sheet.js`, `src/actions.js`
- [ ] `npm test` reste vert
- [ ] `index.html` charge `styles.css`, `manifest.webmanifest`, `src/app.js` en chemins relatifs, contient `#banner`, `#view`, `nav.tabs` (3 liens `#mois`, `#evolution`, `#import`), `dialog#sheet`, `dialog#confirm`, `#toast`

**Verify:** `node --check src/store.js && node --check src/ui/sheet.js && node --check src/actions.js && npm test` → aucune erreur, tests verts

**Steps:**

- [ ] **Step 1: `src/store.js`**

```js
const DB_NAME = 'budget';
const DB_VERSION = 1;
const STORES = ['transactions', 'rules', 'categories', 'settings'];

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error('Écriture annulée'));
});

class Store {
  constructor(db) { this.db = db; }

  async loadAll() {
    const tx = this.db.transaction(STORES, 'readonly');
    const os = (n) => tx.objectStore(n);
    const [transactions, rules, categories, keys, values] = await Promise.all([
      req(os('transactions').getAll()), req(os('rules').getAll()), req(os('categories').getAll()),
      req(os('settings').getAllKeys()), req(os('settings').getAll()),
    ]);
    return {
      transactions,
      rules: new Map(rules.map((r) => [r.merchant, r.categoryId])),
      categories: categories.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
      settings: Object.fromEntries(keys.map((k, i) => [k, values[i]])),
    };
  }

  async #write(stores, fn) {
    const tx = this.db.transaction(stores, 'readwrite');
    fn(tx);
    await done(tx);
  }

  // Ajouts et suppressions dans une seule transaction : tout ou rien.
  putTransactions(list, { removeIds = [] } = {}) {
    return this.#write(['transactions'], (tx) => {
      const s = tx.objectStore('transactions');
      removeIds.forEach((id) => s.delete(id));
      list.forEach((t) => s.put(t));
    });
  }

  deleteTransactions(ids) {
    return this.#write(['transactions'], (tx) => ids.forEach((id) => tx.objectStore('transactions').delete(id)));
  }

  putRule(merchant, categoryId) {
    return this.#write(['rules'], (tx) => tx.objectStore('rules').put({ merchant, categoryId }));
  }

  putCategories(list) {
    return this.#write(['categories'], (tx) => list.forEach((c) => tx.objectStore('categories').put(c)));
  }

  putSetting(key, value) {
    return this.#write(['settings'], (tx) => tx.objectStore('settings').put(value, key));
  }

  replaceAll({ transactions, rules, categories, settings }) {
    return this.#write(STORES, (tx) => {
      STORES.forEach((n) => tx.objectStore(n).clear());
      transactions.forEach((t) => tx.objectStore('transactions').put(t));
      for (const [merchant, categoryId] of rules) tx.objectStore('rules').put({ merchant, categoryId });
      categories.forEach((c) => tx.objectStore('categories').put(c));
      for (const [k, v] of Object.entries(settings)) tx.objectStore('settings').put(v, k);
    });
  }

  clearAll() {
    return this.#write(STORES, (tx) => STORES.forEach((n) => tx.objectStore(n).clear()));
  }
}

export async function openStore() {
  if (!globalThis.indexedDB) throw new Error('IndexedDB indisponible');
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore('transactions', { keyPath: 'id' }).createIndex('date', 'date');
    db.createObjectStore('rules', { keyPath: 'merchant' });
    db.createObjectStore('categories', { keyPath: 'id' });
    db.createObjectStore('settings');
  };
  return new Store(await req(open));
}

// Utilisé quand IndexedDB est inaccessible (navigation privée stricte) : l'app marche, sans persistance.
export function memoryStore() {
  const noop = async () => {};
  return {
    loadAll: async () => ({ transactions: [], rules: new Map(), categories: [], settings: {} }),
    putTransactions: noop, deleteTransactions: noop, putRule: noop, putCategories: noop,
    putSetting: noop, replaceAll: noop, clearAll: noop,
  };
}
```

- [ ] **Step 2: `src/ui/sheet.js`**

```js
import { escapeHtml } from './format.js';

export function createSheets(doc = document) {
  const sheet = doc.getElementById('sheet');
  const confirmDialog = doc.getElementById('confirm');

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) sheet.close();
  });

  function open(html, onMount) {
    const body = doc.createElement('div');
    body.className = 'sheet-body';
    body.innerHTML = `${html}<button type="button" class="btn ghost" data-close>Fermer</button>`;
    sheet.replaceChildren(body);
    sheet.showModal();
    const close = () => sheet.close();
    onMount?.(body, close);
    return close;
  }

  function confirm(message, yes = 'Confirmer', no = 'Annuler') {
    return new Promise((resolve) => {
      confirmDialog.innerHTML = `<form method="dialog" class="sheet-body"><p>${escapeHtml(message)}</p>`
        + `<div class="row"><button class="btn" value="no">${escapeHtml(no)}</button>`
        + `<button class="btn primary" value="yes">${escapeHtml(yes)}</button></div></form>`;
      confirmDialog.returnValue = '';
      confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'yes'), { once: true });
      confirmDialog.showModal();
    });
  }

  return { open, confirm };
}
```

- [ ] **Step 3: `src/actions.js`**

```js
import { planImport } from './core/import.js';
import { applyRule, setManual } from './core/categorize.js';
import { demoTransactions } from './core/demo.js';
import { buildBackup, parseBackup } from './core/backup.js';
import { DEFAULT_CATEGORIES } from './core/categories.js';
import { listMonths } from './core/stats.js';
import { ImportError } from './core/errors.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function createActions(ctx) {
  const { state } = ctx;
  const latestMonth = () => listMonths(state.transactions)[0] ?? ctx.today().slice(0, 7);

  async function save(fn) {
    try {
      await fn();
    } catch (e) {
      ctx.banner('Impossible d’enregistrer sur cet appareil (stockage plein ou navigation privée). Exporte une sauvegarde depuis l’onglet Import.');
      throw new Error('Enregistrement impossible sur cet appareil.', { cause: e });
    }
  }

  async function importBytes(bytes, { mapping } = {}) {
    const real = state.transactions.filter((t) => !t.demo);
    const demoIds = state.transactions.filter((t) => t.demo).map((t) => t.id);
    const plan = planImport(bytes, { mapping, rules: state.rules, existingIds: new Set(real.map((t) => t.id)) });
    await save(() => ctx.store.putTransactions(plan.added, { removeIds: demoIds }));
    if (mapping) {
      await save(() => ctx.store.putSetting('columnMapping', mapping));
      state.settings.columnMapping = mapping;
    }
    state.transactions = [...real, ...plan.added];
    state.month = latestMonth();
    state.openCategory = null;
    state.pendingMapping = null;
    state.lastSummary = {
      added: plan.added.length, duplicates: plan.duplicateCount, skipped: plan.skipped,
      uncategorized: plan.uncategorizedCount, removedDemo: demoIds.length,
    };
    globalThis.navigator?.storage?.persist?.().catch(() => {});
    return state.lastSummary;
  }

  async function importFile(file) {
    if (file.size > MAX_FILE_BYTES) throw new ImportError('TOO_BIG', 'Fichier trop volumineux (10 Mo maximum).');
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      return await importBytes(bytes);
    } catch (e) {
      if (!(e instanceof ImportError) || e.code !== 'NO_HEADER') throw e;
      const saved = state.settings.columnMapping;
      if (saved) {
        try { return await importBytes(bytes, { mapping: saved }); } catch (e2) { if (!(e2 instanceof ImportError)) throw e2; }
      }
      state.pendingMapping = { bytes, filename: file.name, preview: e.details.preview, sep: e.details.sep };
      return null;
    }
  }

  async function recategorize(txId, categoryId, { all }) {
    const tx = state.transactions.find((t) => t.id === txId);
    if (!tx) return 0;
    const next = all
      ? applyRule(state.transactions, tx.merchant, categoryId, { includeId: txId })
      : setManual(state.transactions, txId, categoryId);
    const changed = next.filter((t, i) => t !== state.transactions[i]);
    await save(async () => {
      if (all) await ctx.store.putRule(tx.merchant, categoryId);
      await ctx.store.putTransactions(changed);
    });
    if (all) state.rules.set(tx.merchant, categoryId);
    state.transactions = next;
    return changed.length;
  }

  async function loadDemo() {
    if (state.transactions.some((t) => !t.demo)) throw new Error('Tu as déjà des opérations réelles.');
    const txs = demoTransactions(ctx.today(), state.rules);
    await save(() => ctx.store.putTransactions(txs, { removeIds: state.transactions.map((t) => t.id) }));
    state.transactions = txs;
    state.month = latestMonth();
    state.openCategory = null;
  }

  async function removeDemo() {
    const ids = state.transactions.filter((t) => t.demo).map((t) => t.id);
    await save(() => ctx.store.deleteTransactions(ids));
    state.transactions = state.transactions.filter((t) => !t.demo);
    state.month = latestMonth();
    state.openCategory = null;
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(buildBackup(state), null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `budget-sauvegarde-${ctx.today()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function readBackup(file) {
    if (file.size > MAX_FILE_BYTES * 5) throw new ImportError('TOO_BIG', 'Fichier trop volumineux.');
    return parseBackup(await file.text());
  }

  async function applyBackup(data) {
    const categories = data.categories.length ? data.categories : DEFAULT_CATEGORIES;
    await save(() => ctx.store.replaceAll({ ...data, categories }));
    Object.assign(state, { ...data, categories, openCategory: null, lastSummary: null, pendingMapping: null });
    state.month = latestMonth();
  }

  async function clearAll() {
    await save(async () => {
      await ctx.store.clearAll();
      await ctx.store.putCategories(DEFAULT_CATEGORIES);
    });
    Object.assign(state, { transactions: [], rules: new Map(), categories: DEFAULT_CATEGORIES, settings: {}, openCategory: null, lastSummary: null, pendingMapping: null });
    state.month = latestMonth();
  }

  async function saveCategory(id, patch) {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v === 'string' && v.trim()));
    const current = state.categories.find((c) => c.id === id);
    if (!current || !Object.keys(clean).length) return;
    const updated = { ...current, ...clean };
    await save(() => ctx.store.putCategories([updated]));
    state.categories = state.categories.map((c) => (c.id === id ? updated : c));
  }

  return { importBytes, importFile, recategorize, loadDemo, removeDemo, downloadBackup, readBackup, applyBackup, clearAll, saveCategory };
}
```

- [ ] **Step 4: `index.html`**

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Budget</title>
  <meta name="description" content="Où part ton argent : import du relevé SG, catégories automatiques, évolution mois par mois.">
  <meta name="theme-color" content="#1f8a70">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="icons/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="icons/icon-192.png">
  <link rel="stylesheet" href="styles.css">
  <script type="module" src="src/app.js"></script>
</head>
<body>
  <div id="banner" class="banner" role="alert" hidden></div>
  <main id="view" class="view"></main>
  <nav class="tabs" aria-label="Navigation principale">
    <a href="#mois" data-tab="mois">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9h9A9 9 0 1 1 12 3z" fill="currentColor" opacity=".35"/><path d="M14 2.2A9 9 0 0 1 21.8 10H14z" fill="currentColor"/></svg>
      Mois
    </a>
    <a href="#evolution" data-tab="evolution">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="4" height="10" rx="1" fill="currentColor"/><rect x="10" y="6" width="4" height="15" rx="1" fill="currentColor"/><rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor"/></svg>
      Évolution
    </a>
    <a href="#import" data-tab="import">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l5 5h-3v7h-4V8H7z" fill="currentColor"/><rect x="4" y="18" width="16" height="3" rx="1" fill="currentColor"/></svg>
      Import
    </a>
  </nav>
  <dialog id="sheet" class="sheet"></dialog>
  <dialog id="confirm" class="sheet"></dialog>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
</body>
</html>
```

- [ ] **Step 5: `styles.css`**

```css
:root {
  --bg: #f6f7f4; --surface: #ffffff; --surface-2: #eef1ec; --text: #17201b; --muted: #5d6b63; --border: #dfe4dd;
  --accent: #1f8a70; --accent-ink: #ffffff; --pos: #1f8a70; --neg: #c2413b; --track: #e6ebe4;
  --shadow: 0 1px 2px rgb(0 0 0 / .06), 0 4px 16px rgb(0 0 0 / .05);
  --radius: 16px; --tabs-h: 64px;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101512; --surface: #18201b; --surface-2: #212a24; --text: #e8eee9; --muted: #9aa8a0; --border: #2b352f;
    --accent: #3cb391; --accent-ink: #06130e; --pos: #4cc29f; --neg: #ff7a72; --track: #26302a; --shadow: none;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--text); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
.view { max-width: 560px; margin: 0 auto; padding: calc(16px + env(safe-area-inset-top)) 16px calc(var(--tabs-h) + 24px + env(safe-area-inset-bottom)); }
h1 { font-size: 1.35rem; margin: 0; }
h2 { font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 24px 0 8px; }
a { color: var(--accent); }
.muted { color: var(--muted); }
.small { font-size: .85rem; }
.pos { color: var(--pos); }
.neg { color: var(--neg); }
.error { color: var(--neg); }

.banner { background: var(--neg); color: #fff; padding: calc(10px + env(safe-area-inset-top)) 16px 10px; font-size: .9rem; }

.month-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px; }
.month-nav h1::first-letter { text-transform: uppercase; }
.icon-btn { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 1.6rem; line-height: 1; cursor: pointer; }
.icon-btn:disabled { opacity: .35; cursor: default; }

.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.card { background: var(--surface); border-radius: var(--radius); padding: 12px; box-shadow: var(--shadow); min-width: 0; }
.card span { display: block; font-size: .75rem; color: var(--muted); }
.card strong { display: block; font-size: clamp(.9rem, 4vw, 1.15rem); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }

.donut-wrap { display: flex; justify-content: center; margin: 20px 0 4px; }
.donut { width: min(220px, 70vw); height: auto; }
.donut-label { font-size: 20px; font-weight: 700; fill: var(--text); }
.donut-sublabel { font-size: 12px; fill: var(--muted); }

.cat-list, .tx-list, .legend, .cat-edit { list-style: none; margin: 0; padding: 0; }
.cat-list { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.cat-row + .cat-row { border-top: 1px solid var(--border); }
.cat-btn { width: 100%; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto auto; grid-template-areas: "dot name amount share" "bar bar bar bar"; align-items: center; gap: 6px 10px; padding: 12px 14px; background: none; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; min-height: 56px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex: none; }
.cat-btn .dot { grid-area: dot; }
.cat-name { grid-area: name; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-amount { grid-area: amount; font-variant-numeric: tabular-nums; font-weight: 600; }
.cat-share { grid-area: share; color: var(--muted); font-size: .8rem; min-width: 3.2em; text-align: right; }
.bar { grid-area: bar; height: 4px; background: var(--track); border-radius: 2px; overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 2px; }
.tx-list { background: var(--surface-2); }
.tx { width: 100%; display: grid; grid-template-columns: 4.4em minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 48px; padding: 8px 14px; background: none; border: 0; border-top: 1px solid var(--border); color: inherit; font: inherit; font-size: .92rem; text-align: left; cursor: pointer; }
.tx-date { color: var(--muted); font-size: .8rem; }
.tx-merchant { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tx-amount { font-variant-numeric: tabular-nums; }
.tx-amount.pos { color: var(--pos); }

.tabs { position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; background: var(--surface); border-top: 1px solid var(--border); padding-bottom: env(safe-area-inset-bottom); z-index: 10; }
.tabs a { flex: 1; max-width: 187px; height: var(--tabs-h); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--muted); text-decoration: none; font-size: .75rem; font-weight: 600; }
.tabs a svg { width: 24px; height: 24px; }
.tabs a[aria-current="page"] { color: var(--accent); }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 18px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
.btn.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
.btn.danger { color: var(--neg); }
.btn.big { width: 100%; min-height: 64px; font-size: 1.1rem; }
.btn.ghost { border: 0; background: none; color: var(--muted); }
.btn:disabled { opacity: .45; cursor: default; }
.file-btn { position: relative; }
.file-btn:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.stack { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }

.empty { text-align: center; padding: 48px 8px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.empty .btn { width: 100%; max-width: 320px; }
.empty-icon { font-size: 3rem; }
.empty-month { text-align: center; color: var(--muted); padding: 32px 0; }
.page-head { margin-bottom: 16px; }

.controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.seg { display: inline-flex; background: var(--surface-2); border-radius: 12px; padding: 3px; }
.seg button { border: 0; background: none; color: var(--muted); font: inherit; font-weight: 600; padding: 8px 14px; border-radius: 9px; cursor: pointer; min-height: 40px; }
.seg button[aria-pressed="true"] { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
select, input[type="text"] { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 10px; min-height: 44px; padding: 0 10px; }
.controls select { flex: 1; min-width: 0; }
.chart { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); padding: 12px 8px 4px; margin-bottom: 12px; }
.bars { width: 100%; height: auto; display: block; }
.bar-label { font-size: 11px; fill: var(--muted); }
.avg-line { stroke: var(--text); stroke-width: 1.5; stroke-dasharray: 4 4; opacity: .6; }
.legend li { display: flex; align-items: center; gap: 10px; padding: 8px 2px; border-bottom: 1px solid var(--border); }
.legend li span:last-child { margin-left: auto; font-variant-numeric: tabular-nums; }

.summary, .help, .mapping { background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); padding: 12px 16px; margin-top: 16px; }
.summary h2 { margin-top: 4px; }
.summary ul, .help ol { padding-left: 20px; margin: 0; }
.help summary { cursor: pointer; font-weight: 600; min-height: 32px; }
.cat-edit li { display: flex; gap: 8px; align-items: center; padding: 4px 0; }
.cat-edit input[type="text"] { flex: 1; min-width: 0; }
.cat-edit input[type="color"] { width: 44px; height: 44px; border: 0; padding: 0; background: none; }
.cat-edit .icon { width: 1.6em; text-align: center; }
.table-scroll { overflow-x: auto; margin: 8px -16px; padding: 0 16px; }
table { border-collapse: collapse; font-size: .8rem; }
th, td { border: 1px solid var(--border); padding: 4px 6px; white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis; text-align: left; }
th select { min-height: 36px; font-size: .8rem; }

.sheet { border: 0; padding: 0; width: 100%; max-width: 560px; margin: auto auto 0; border-radius: 20px 20px 0 0; background: var(--surface); color: var(--text); max-height: 85vh; }
.sheet::backdrop { background: rgb(0 0 0 / .4); }
.sheet-body { padding: 20px 16px calc(16px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 10px; margin: 0; }
.sheet-body h2 { font-size: 1.1rem; color: var(--text); text-transform: none; letter-spacing: 0; margin: 0; }
.sheet-body p { margin: 0; }
.raw { font-family: ui-monospace, Consolas, monospace; font-size: .75rem; color: var(--muted); word-break: break-word; }
.cat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.chip { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: inherit; font: inherit; font-size: .88rem; text-align: left; cursor: pointer; }
.chip.selected { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }

.toast { position: fixed; left: 50%; bottom: calc(var(--tabs-h) + 16px + env(safe-area-inset-bottom)); transform: translate(-50%, 20px); background: var(--text); color: var(--bg); padding: 10px 16px; border-radius: 12px; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; max-width: calc(100% - 32px); z-index: 20; font-size: .9rem; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
```

- [ ] **Step 6: Vérifier** `node --check src/store.js && node --check src/ui/sheet.js && node --check src/actions.js && npm test` → aucune erreur

- [ ] **Step 7: Commit**

```bash
git add src/store.js src/ui/sheet.js src/actions.js index.html styles.css
git commit -m "feat(ui): stockage IndexedDB, feuilles modales, actions, page et styles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Application et écran Mois

**Goal:** `src/app.js` (état, routage par hash, toasts, bannière, démarrage) et l'écran Mois complet : état vide, navigation entre mois, cartes Dépensé/Reçu/Solde, donut, catégories dépliables, choix de catégorie d'une opération avec proposition de règle.

**Files:**
- Create: `src/app.js`, `src/ui/month.js`, `src/ui/category-sheet.js`

**Acceptance Criteria:**
- [ ] Au premier chargement (base vide) : état vide avec « Importer un relevé » et « Essayer avec des données de démo »
- [ ] Démo chargée → mois courant affiché, total du donut = carte Dépensé, flèche › désactivée sur le dernier mois, ‹ désactivée sur le premier
- [ ] Tap catégorie → liste des opérations ; tap opération → feuille de catégories ; choix + « Oui, toutes » → règle enregistrée, toutes les opérations du commerçant déplacées, persistant après rechargement
- [ ] Aucune erreur dans la console

**Verify:** `npm test` vert, puis dans le navigateur intégré (`preview_start` nommé `budget`, viewport `mobile`) : parcours des critères ci-dessus, `read_console_messages` avec `onlyErrors` → vide

**Steps:**

- [ ] **Step 1: `src/app.js`**

```js
import { openStore, memoryStore } from './store.js';
import { DEFAULT_CATEGORIES } from './core/categories.js';
import { listMonths } from './core/stats.js';
import { createActions } from './actions.js';
import { createSheets } from './ui/sheet.js';
import { renderMonth } from './ui/month.js';

const VIEWS = { mois: renderMonth };

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const state = {
  transactions: [], rules: new Map(), categories: [], settings: {},
  month: localToday().slice(0, 7), openCategory: null,
  trendWindow: 6, trendCategory: '', lastSummary: null, pendingMapping: null,
};

const root = document.getElementById('view');
let toastTimer;

const ctx = {
  state,
  store: null,
  today: localToday,
  sheet: createSheets(document),
  render() {
    const hash = location.hash.slice(1);
    const tab = VIEWS[hash] ? hash : 'mois';
    document.querySelectorAll('.tabs a').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    root.onclick = null;
    root.onchange = null;
    VIEWS[tab](root, ctx);
  },
  toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  },
  banner(message) {
    const el = document.getElementById('banner');
    el.textContent = message;
    el.hidden = false;
  },
  async run(fn, message) {
    try {
      const result = await fn();
      const text = typeof message === 'function' ? message(result) : message;
      if (text) ctx.toast(text);
    } catch (e) {
      console.error(e);
      ctx.toast(e?.message || 'Une erreur est survenue.');
    }
    ctx.render();
  },
};
ctx.actions = createActions(ctx);
globalThis.__budget = ctx; // inspection depuis la console

async function init() {
  try {
    ctx.store = await openStore();
    Object.assign(state, await ctx.store.loadAll());
  } catch (e) {
    console.error(e);
    ctx.store = memoryStore();
    ctx.banner('Stockage indisponible : tes données ne seront pas conservées après fermeture.');
  }
  if (!state.categories.length) {
    state.categories = DEFAULT_CATEGORIES;
    await ctx.store.putCategories(DEFAULT_CATEGORIES).catch((e) => console.error(e));
  }
  state.month = listMonths(state.transactions)[0] ?? state.month;
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); ctx.render(); });
  ctx.render();
}

init();
```

- [ ] **Step 2: `src/ui/category-sheet.js`**

```js
import { escapeHtml, formatDay, formatEuros } from './format.js';

export function openCategoryPicker(ctx, txId) {
  const { state } = ctx;
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return;
  const others = state.transactions.filter((t) => t.merchant === tx.merchant && t.id !== tx.id).length;
  const chips = state.categories.map((c) => `<button type="button" class="chip${c.id === tx.categoryId ? ' selected' : ''}" data-cat="${escapeHtml(c.id)}">`
    + `<span class="dot" style="background:${escapeHtml(c.color)}"></span>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</button>`).join('');
  ctx.sheet.open(
    `<h2>${escapeHtml(tx.merchant)}</h2>`
    + `<p class="muted">${formatDay(tx.date)} · ${formatEuros(tx.amountCents, { signed: true })}</p>`
    + `<p class="raw">${escapeHtml(tx.rawLabel)}</p>`
    + `<div class="cat-grid">${chips}</div>`,
    (body, close) => {
      body.addEventListener('click', async (e) => {
        const chip = e.target.closest('[data-cat]');
        if (!chip) return;
        const categoryId = chip.dataset.cat;
        close();
        const name = state.categories.find((c) => c.id === categoryId)?.name ?? categoryId;
        const question = others > 0
          ? `Ranger aussi les ${others} autres opérations « ${tx.merchant} » dans ${name}, ainsi que les prochaines ?`
          : `Ranger aussi les prochaines opérations « ${tx.merchant} » dans ${name} ?`;
        const all = await ctx.sheet.confirm(question, 'Oui, toutes', 'Seulement celle-ci');
        ctx.run(() => ctx.actions.recategorize(tx.id, categoryId, { all }), all ? `Règle enregistrée pour ${tx.merchant}` : 'Catégorie modifiée');
      });
    },
  );
}
```

- [ ] **Step 3: `src/ui/month.js`**

```js
import { monthSummary, shiftMonth, transactionsFor, listMonths } from '../core/stats.js';
import { donutSvg } from './charts.js';
import { formatEuros, formatMonth, formatDay, formatPercent, escapeHtml } from './format.js';
import { openCategoryPicker } from './category-sheet.js';

function renderEmpty(root, ctx) {
  root.innerHTML = `<section class="empty">
    <div class="empty-icon" aria-hidden="true">📊</div>
    <h1>Où part ton argent ?</h1>
    <p class="muted">Importe ton relevé Société Générale (CSV ou OFX) pour voir tes dépenses par catégorie, mois par mois.</p>
    <a class="btn primary" href="#import">Importer un relevé</a>
    <button type="button" class="btn" data-action="demo">Essayer avec des données de démo</button>
  </section>`;
  root.onclick = (e) => {
    if (e.target.closest('[data-action="demo"]')) ctx.run(() => ctx.actions.loadDemo(), 'Données de démo chargées');
  };
}

export function renderMonth(root, ctx) {
  const { state } = ctx;
  if (!state.transactions.length) return renderEmpty(root, ctx);

  const byId = new Map(state.categories.map((c) => [c.id, c]));
  const cat = (id) => byId.get(id) ?? { id, name: id, color: '#999999', icon: '•' };
  const months = listMonths(state.transactions);
  const s = monthSummary(state.transactions, state.month);

  const txList = (list) => `<ul class="tx-list">${list.map((t) => `<li><button type="button" class="tx" data-action="tx" data-id="${escapeHtml(t.id)}">`
    + `<span class="tx-date">${formatDay(t.date)}</span>`
    + `<span class="tx-merchant">${escapeHtml(t.merchant)}${t.categorySource === 'manual' ? ' ✎' : ''}</span>`
    + `<span class="tx-amount${t.amountCents > 0 ? ' pos' : ''}">${formatEuros(t.amountCents, { signed: true })}</span></button></li>`).join('')}</ul>`;

  const row = (g, sign) => {
    const c = cat(g.categoryId);
    const key = `${sign}:${g.categoryId}`;
    const open = state.openCategory === key;
    return `<li class="cat-row"><button type="button" class="cat-btn" data-action="toggle" data-key="${escapeHtml(key)}" aria-expanded="${open}">`
      + `<span class="dot" style="background:${escapeHtml(c.color)}"></span>`
      + `<span class="cat-name">${escapeHtml(c.icon)} ${escapeHtml(c.name)} <span class="muted small">· ${g.count}</span></span>`
      + `<span class="cat-amount">${formatEuros(g.totalCents)}</span>`
      + `<span class="cat-share">${formatPercent(g.share)}</span>`
      + `<span class="bar"><span style="width:${(g.share * 100).toFixed(1)}%;background:${escapeHtml(c.color)}"></span></span></button>`
      + `${open ? txList(transactionsFor(state.transactions, state.month, g.categoryId, sign)) : ''}</li>`;
  };

  const details = s.count === 0
    ? '<p class="empty-month">Aucune opération ce mois-ci.</p>'
    : `<section class="donut-wrap">${donutSvg(
      s.expenses.map((g) => ({ value: g.totalCents, color: cat(g.categoryId).color, label: cat(g.categoryId).name })),
      { label: formatEuros(s.spentCents), sublabel: 'dépensés' },
    )}</section>
      ${s.expenses.length ? `<h2>Dépenses</h2><ul class="cat-list">${s.expenses.map((g) => row(g, 'out')).join('')}</ul>` : ''}
      ${s.income.length ? `<h2>Entrées</h2><ul class="cat-list">${s.income.map((g) => row(g, 'in')).join('')}</ul>` : ''}`;

  root.innerHTML = `<header class="month-nav">
      <button type="button" class="icon-btn" data-action="prev" aria-label="Mois précédent" ${state.month > months.at(-1) ? '' : 'disabled'}>‹</button>
      <h1>${formatMonth(state.month)}</h1>
      <button type="button" class="icon-btn" data-action="next" aria-label="Mois suivant" ${state.month < months[0] ? '' : 'disabled'}>›</button>
    </header>
    <section class="cards">
      <div class="card"><span>Dépensé</span><strong>${formatEuros(s.spentCents)}</strong></div>
      <div class="card"><span>Reçu</span><strong class="pos">${formatEuros(s.incomeCents)}</strong></div>
      <div class="card"><span>Solde</span><strong class="${s.balanceCents >= 0 ? 'pos' : 'neg'}">${formatEuros(s.balanceCents, { signed: true })}</strong></div>
    </section>
    ${details}`;

  root.onclick = (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'prev' || action === 'next') {
      state.month = shiftMonth(state.month, action === 'prev' ? -1 : 1);
      state.openCategory = null;
      ctx.render();
    } else if (action === 'toggle') {
      state.openCategory = state.openCategory === el.dataset.key ? null : el.dataset.key;
      ctx.render();
    } else if (action === 'tx') {
      openCategoryPicker(ctx, el.dataset.id);
    }
  };
}
```

- [ ] **Step 4: Vérifier** `npm test` → vert. Lancer `preview_start` (`budget`), `resize_window` preset `mobile`, ouvrir `http://localhost:4173/`. Le manifeste et les icônes n'existent pas encore (Task 15) : une 404 sur `manifest.webmanifest`/`icons/*` est attendue à ce stade, toute autre erreur console est un bug.
  - État vide visible → cliquer « Essayer avec des données de démo » → toast, écran du mois courant.
  - Vérifier par `javascript_tool` : `const s = __budget.state; s.transactions.length > 60` et que le texte du donut égale la carte Dépensé.
  - Cliquer ‹ jusqu'au premier mois → ‹ désactivé ; › jusqu'au dernier → › désactivé.
  - Déplier « Courses », cliquer une opération, choisir « Loisirs & sorties », « Oui, toutes » → toast « Règle enregistrée… » ; recharger la page → la catégorie a tenu (`__budget.state.rules.size === 1`).
  - `read_console_messages` `onlyErrors: true` → seulement les 404 attendues.

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/ui/month.js src/ui/category-sheet.js
git commit -m "feat(ui): application et écran Mois" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Écran Évolution

**Goal:** Barres empilées par catégorie sur 6 ou 12 mois, filtre par catégorie, cartes mois courant / moyenne / écart et légende avec totaux.

**Files:**
- Create: `src/ui/trends.js`
- Modify: `src/app.js` (import + entrée `evolution` dans `VIEWS`)

**Acceptance Criteria:**
- [ ] Onglet Évolution : 6 barres par défaut, bouton « 12 mois » → 12 barres
- [ ] Filtre « Courses » → seule la couleur Courses apparaît, la moyenne et l'écart changent
- [ ] Sans données : message et lien vers l'import

**Verify:** navigateur intégré, viewport mobile : `#evolution` → `document.querySelectorAll('.bars .bar-label').length === 6`, puis 12 après clic ; filtre vérifié ; console sans erreur nouvelle

**Steps:**

- [ ] **Step 1: `src/ui/trends.js`**

```js
import { trend, listMonths } from '../core/stats.js';
import { INCOME_CATEGORY_IDS } from '../core/categories.js';
import { stackedBarsSvg } from './charts.js';
import { formatEuros, formatMonth, formatMonthShort, escapeHtml } from './format.js';

export function renderTrends(root, ctx) {
  const { state } = ctx;
  if (!state.transactions.length) {
    root.innerHTML = `<section class="empty"><h1>Évolution</h1>
      <p class="muted">Importe un relevé pour voir l’évolution de tes dépenses mois par mois.</p>
      <a class="btn primary" href="#import">Importer un relevé</a></section>`;
    return;
  }
  const byId = new Map(state.categories.map((c) => [c.id, c]));
  const cat = (id) => byId.get(id) ?? { id, name: id, color: '#999999', icon: '•' };
  const end = listMonths(state.transactions)[0];
  const t = trend(state.transactions, end, state.trendWindow, state.trendCategory || null);
  const options = state.categories.filter((c) => !INCOME_CATEGORY_IDS.includes(c.id))
    .map((c) => `<option value="${escapeHtml(c.id)}"${state.trendCategory === c.id ? ' selected' : ''}>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('');
  const chart = stackedBarsSvg({
    labels: t.months.map(formatMonthShort),
    series: t.series.map((s) => ({ values: s.values, color: cat(s.categoryId).color, title: cat(s.categoryId).name })),
    averageCents: t.averageCents,
  });
  const dash = '—';

  root.innerHTML = `<header class="page-head"><h1>Évolution</h1></header>
    <div class="controls">
      <div class="seg" role="group" aria-label="Période">${[6, 12].map((n) => `<button type="button" data-action="window" data-n="${n}" aria-pressed="${state.trendWindow === n}">${n} mois</button>`).join('')}</div>
      <select data-action="category" aria-label="Catégorie"><option value="">Toutes les catégories</option>${options}</select>
    </div>
    <section class="chart">${chart}</section>
    <section class="cards">
      <div class="card"><span>${formatMonth(end)}</span><strong>${formatEuros(t.currentCents)}</strong></div>
      <div class="card"><span>Moyenne</span><strong>${t.averageCents == null ? dash : formatEuros(t.averageCents)}</strong></div>
      <div class="card"><span>Écart</span><strong class="${(t.deltaCents ?? 0) > 0 ? 'neg' : 'pos'}">${t.deltaCents == null ? dash : formatEuros(t.deltaCents, { signed: true })}</strong></div>
    </section>
    <p class="muted small">Moyenne des mois précédents de la période (ligne pointillée). Un écart positif = tu dépenses plus que d’habitude.</p>
    ${t.series.length ? `<h2>Par catégorie</h2><ul class="legend">${t.series.map((s) => `<li><span class="dot" style="background:${escapeHtml(cat(s.categoryId).color)}"></span>${escapeHtml(cat(s.categoryId).name)}<span>${formatEuros(s.total)}</span></li>`).join('')}</ul>` : '<p class="empty-month">Aucune dépense sur la période.</p>'}`;

  root.onclick = (e) => {
    const b = e.target.closest('[data-action="window"]');
    if (!b) return;
    state.trendWindow = Number(b.dataset.n);
    ctx.render();
  };
  root.onchange = (e) => {
    if (!e.target.matches('[data-action="category"]')) return;
    state.trendCategory = e.target.value;
    ctx.render();
  };
}
```

- [ ] **Step 2: Brancher dans `src/app.js`** — ajouter l'import sous celui de `renderMonth` et l'entrée :

```js
import { renderTrends } from './ui/trends.js';

const VIEWS = { mois: renderMonth, evolution: renderTrends };
```

- [ ] **Step 3: Vérifier** dans le navigateur (données de démo chargées) : 6 libellés de mois, clic « 12 mois » → 12, choix « Courses » dans le select → `new Set([...document.querySelectorAll('.bars rect')].map((r) => r.getAttribute('fill'))).size === 1`. `npm test` vert.

- [ ] **Step 4: Commit**

```bash
git add src/ui/trends.js src/app.js
git commit -m "feat(ui): écran Évolution" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Écran Import et réglages

**Goal:** Import d'un relevé (bouton fichier), résumé du dernier import, écran de correspondance des colonnes quand le format est inconnu, aide pour exporter depuis SG, édition des catégories (nom, couleur), export/restauration JSON, démo, effacement.

**Files:**
- Create: `src/ui/import.js`
- Modify: `src/app.js` (import + entrée `import` dans `VIEWS`)

**Acceptance Criteria:**
- [ ] Choisir un CSV SG → toast « N opérations ajoutées », résumé (ajoutées, doublons, non catégorisées avec lien), données de démo retirées si présentes
- [ ] Fichier aux colonnes inconnues → tableau d'aperçu avec un sélecteur par colonne ; validation sans date → message d'erreur ; mapping valide → import et mapping mémorisé
- [ ] Renommer une catégorie ou changer sa couleur → visible sur l'écran Mois, persistant
- [ ] Export JSON télécharge `budget-sauvegarde-AAAA-MM-JJ.json` ; restauration demande confirmation puis remplace les données
- [ ] « Tout effacer » demande confirmation puis revient à l'état vide

**Verify:** navigateur intégré (voir Step 3) ; `npm test` vert

**Steps:**

- [ ] **Step 1: `src/ui/import.js`**

```js
import { escapeHtml } from './format.js';
import { buildMapping } from '../core/mapping.js';

const ROLES = [['', 'Ignorer'], ['date', 'Date'], ['label', 'Libellé'], ['amount', 'Montant'], ['debit', 'Débit'], ['credit', 'Crédit']];

function mappingHtml(p) {
  const cols = Math.max(...p.preview.map((r) => r.length));
  const range = Array.from({ length: cols }, (_, i) => i);
  return `<section class="mapping">
    <h2>Aide-moi à lire ce fichier</h2>
    <p class="muted small">Je n’ai pas reconnu les colonnes de « ${escapeHtml(p.filename)} ». Indique ce que contient chaque colonne, je m’en souviendrai.</p>
    <div class="table-scroll"><table>
      <thead><tr>${range.map((i) => `<th><select data-col="${i}" aria-label="Contenu de la colonne ${i + 1}">${ROLES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></th>`).join('')}</tr></thead>
      <tbody>${p.preview.map((r) => `<tr>${range.map((i) => `<td>${escapeHtml(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="error" data-role="mapping-error" hidden></p>
    <div class="row"><button type="button" class="btn" data-action="cancel-mapping">Annuler</button><button type="button" class="btn primary" data-action="apply-mapping">Importer</button></div>
  </section>`;
}

function summaryHtml(s) {
  if (!s) return '';
  return `<section class="summary" role="status"><h2>Dernier import</h2><ul>
    <li><strong>${s.added}</strong> opérations ajoutées</li>
    <li><strong>${s.duplicates}</strong> doublons ignorés</li>
    ${s.skipped ? `<li><strong>${s.skipped}</strong> lignes ignorées (en-têtes, soldes…)</li>` : ''}
    ${s.removedDemo ? '<li>Données de démo retirées</li>' : ''}
    ${s.uncategorized ? `<li><strong>${s.uncategorized}</strong> non catégorisées → <a href="#mois" data-action="see-uncat">les classer</a></li>` : ''}
  </ul></section>`;
}

export function renderImport(root, ctx) {
  const { state } = ctx;
  const hasReal = state.transactions.some((t) => !t.demo);
  const hasDemo = state.transactions.some((t) => t.demo);
  const hasAny = state.transactions.length > 0;

  root.innerHTML = `<header class="page-head"><h1>Import</h1></header>
    ${state.pendingMapping ? mappingHtml(state.pendingMapping) : `
      <label class="btn primary big file-btn">Importer un relevé
        <input type="file" class="visually-hidden" accept=".csv,.ofx,.qfx,.txt,text/csv" data-action="file">
      </label>
      <p class="muted small">CSV ou OFX exporté depuis Société Générale. Rien ne quitte ton appareil.</p>`}
    ${summaryHtml(state.lastSummary)}
    <details class="help"><summary>Comment exporter mon relevé SG ?</summary><ol>
      <li>Connecte-toi sur <strong>particuliers.sg.fr</strong> depuis un navigateur et ouvre ton compte courant.</li>
      <li>Cherche « Télécharger » ou « Exporter mes opérations », choisis le format <strong>CSV</strong> (ou OFX / Money).</li>
      <li>Choisis la période, télécharge le fichier, puis importe-le ici.</li>
      <li>Tu peux réimporter des périodes qui se chevauchent : les doublons sont ignorés.</li>
    </ol></details>
    <h2>Catégories</h2>
    <ul class="cat-edit">${state.categories.map((c) => `<li>
      <input type="color" value="${escapeHtml(c.color)}" data-action="cat-color" data-id="${escapeHtml(c.id)}" aria-label="Couleur de ${escapeHtml(c.name)}">
      <span class="icon" aria-hidden="true">${escapeHtml(c.icon)}</span>
      <input type="text" value="${escapeHtml(c.name)}" maxlength="30" data-action="cat-name" data-id="${escapeHtml(c.id)}" aria-label="Nom de la catégorie">
    </li>`).join('')}</ul>
    <h2>Données</h2>
    <div class="stack">
      <button type="button" class="btn" data-action="export"${hasAny ? '' : ' disabled'}>Exporter une sauvegarde (JSON)</button>
      <label class="btn file-btn">Restaurer une sauvegarde
        <input type="file" class="visually-hidden" accept=".json,application/json" data-action="restore">
      </label>
      ${hasDemo ? '<button type="button" class="btn" data-action="remove-demo">Retirer les données de démo</button>' : ''}
      ${!hasAny ? '<button type="button" class="btn" data-action="demo">Charger des données de démo</button>' : ''}
      <button type="button" class="btn danger" data-action="clear"${hasAny ? '' : ' disabled'}>Tout effacer</button>
    </div>
    <p class="muted small">Tes données restent dans ce navigateur, sur cet appareil${hasReal ? '. Pense à exporter une sauvegarde de temps en temps' : ''}.</p>`;

  root.onchange = async (e) => {
    const el = e.target;
    const action = el.dataset.action;
    if (action === 'file' && el.files?.[0]) {
      const file = el.files[0];
      el.value = '';
      await ctx.run(() => ctx.actions.importFile(file), (r) => (r ? `${r.added} opérations ajoutées` : null));
    } else if (action === 'restore' && el.files?.[0]) {
      const file = el.files[0];
      el.value = '';
      let data;
      try {
        data = await ctx.actions.readBackup(file);
      } catch (err) {
        ctx.toast(err.message);
        return;
      }
      if (await ctx.sheet.confirm(`Remplacer toutes les données de cet appareil par cette sauvegarde (${data.transactions.length} opérations) ?`, 'Remplacer', 'Annuler')) {
        await ctx.run(() => ctx.actions.applyBackup(data), 'Sauvegarde restaurée');
      }
    } else if (action === 'cat-color' || action === 'cat-name') {
      const patch = action === 'cat-color' ? { color: el.value } : { name: el.value };
      await ctx.run(() => ctx.actions.saveCategory(el.dataset.id, patch), null);
    }
  };

  root.onclick = async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    switch (el.dataset.action) {
      case 'apply-mapping': {
        const p = state.pendingMapping;
        const roles = [...root.querySelectorAll('select[data-col]')].map((s) => s.value);
        const { mapping, error } = buildMapping(roles, p.sep);
        if (error) {
          const box = root.querySelector('[data-role="mapping-error"]');
          box.textContent = error;
          box.hidden = false;
          return;
        }
        await ctx.run(() => ctx.actions.importBytes(p.bytes, { mapping }), (r) => `${r.added} opérations ajoutées`);
        break;
      }
      case 'cancel-mapping':
        state.pendingMapping = null;
        ctx.render();
        break;
      case 'export':
        await ctx.run(() => ctx.actions.downloadBackup(), 'Sauvegarde exportée');
        break;
      case 'demo':
        await ctx.run(() => ctx.actions.loadDemo(), 'Données de démo chargées');
        break;
      case 'remove-demo':
        await ctx.run(() => ctx.actions.removeDemo(), 'Données de démo retirées');
        break;
      case 'clear':
        if (await ctx.sheet.confirm('Effacer toutes les opérations, règles et réglages de cet appareil ? C’est définitif.', 'Tout effacer', 'Annuler')) {
          await ctx.run(() => ctx.actions.clearAll(), 'Données effacées');
        }
        break;
      case 'see-uncat':
        state.openCategory = 'out:autre';
        break;
    }
  };
}
```

Note : `see-uncat` est un lien `href="#mois"` ; le clic positionne `openCategory` puis la navigation par hash affiche l'écran Mois avec « Autre » déplié.

- [ ] **Step 2: Brancher dans `src/app.js`**

```js
import { renderImport } from './ui/import.js';

const VIEWS = { mois: renderMonth, evolution: renderTrends, import: renderImport };
```

- [ ] **Step 3: Vérifier** dans le navigateur intégré (viewport mobile). Le navigateur intégré n'a pas d'outil d'envoi de fichier : simuler le choix d'un fichier par `javascript_tool`, ce qui exerce le vrai gestionnaire `change` :

```js
async function pick(selector, name, content, type = 'text/csv') {
  const input = document.querySelector(selector);
  const dt = new DataTransfer();
  dt.items.add(new File([content], name, { type }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
const latin1 = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
await pick('[data-action="file"]', 'releve.csv', latin1("Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise\r\n12/10/2026;CARTE X1234 12/10 CARREFOUR;CARTE X1234 12/10 CARREFOUR CITY LYON;-23,45;EUR\r\n13/10/2026;CARTE X1234 13/10 TRUC;CARTE X1234 13/10 TRUC BIZARRE;-7,00;EUR"));
```

  Contrôles :
  - Avec la démo chargée avant : résumé « 2 opérations ajoutées », « Données de démo retirées », « 1 non catégorisées » ; `__budget.state.transactions.length === 2`.
  - Réimporter le même contenu → « 0 opérations ajoutées », « 2 doublons ignorés ».
  - `pick('[data-action="file"]', 'bizarre.csv', 'Jour;Opération;Valeur\n12/10/2026;LIDL;-5,00')` → tableau visible ; cliquer Importer sans rien choisir → « Choisis la colonne Date. » ; choisir Date/Libellé/Montant → import OK et `__budget.state.settings.columnMapping` défini.
  - Changer le nom de « Courses » en « Bouffe » (fill du champ + événement `change`) → onglet Mois affiche « Bouffe » ; recharger → toujours « Bouffe ».
  - Export : avant le clic, `const orig = URL.createObjectURL; window.__blob = null; URL.createObjectURL = (b) => { window.__blob = b; return orig(b); };` puis cliquer Exporter → `JSON.parse(await __blob.text()).transactions.length` égale le nombre d'opérations.
  - Restauration : `pick('[data-action="restore"]', 'b.json', await __blob.text(), 'application/json')` → confirmer « Remplacer » → toast « Sauvegarde restaurée ».
  - « Tout effacer » → confirmer → onglet Mois en état vide.
  - Console sans erreur nouvelle.

- [ ] **Step 4: Commit**

```bash
git add src/ui/import.js src/app.js
git commit -m "feat(ui): écran Import, correspondance de colonnes et réglages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: PWA installable et hors-ligne

**Goal:** Manifeste, icônes PNG générées sans dépendance, service worker cache-first qui précache tous les fichiers, enregistrement du service worker, et un test qui garantit que la liste du cache reste complète.

**Files:**
- Create: `manifest.webmanifest`, `icons/icon.svg`, `scripts/make-icons.mjs`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png` (générés), `sw.js`
- Modify: `src/app.js` (enregistrement du service worker en fin de `init`)
- Test: `tests/pwa.test.js`

**Acceptance Criteria:**
- [ ] `npm run icons` écrit 3 PNG valides aux bonnes dimensions
- [ ] Chaque `src/**/*.js` et chaque fichier racine de l'app figure dans `ASSETS` de `sw.js` (test)
- [ ] Manifeste : `start_url` et `scope` relatifs, `display: standalone`, icônes 192/512/maskable existantes
- [ ] Navigateur : `navigator.serviceWorker.controller` non nul après rechargement ; serveur arrêté, rechargement → l'app s'affiche quand même

**Verify:** `npm run icons && npm test` → vert ; contrôle hors-ligne au Step 7

**Steps:**

- [ ] **Step 1: Test** `tests/pwa.test.js`

```js
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
```

- [ ] **Step 2: Lancer** `node --test tests/pwa.test.js` → FAIL (`sw.js` absent)

- [ ] **Step 3: `scripts/make-icons.mjs`** puis `npm run icons`

```js
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [0x1f, 0x8a, 0x70];
const RING = [0xff, 0xff, 0xff];
const ACCENT = [0xf2, 0xc1, 0x4e];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function insideRounded(x, y, size, radius) {
  const qx = Math.min(x, size - x);
  const qy = Math.min(y, size - y);
  if (qx >= radius || qy >= radius) return true;
  return Math.hypot(radius - qx, radius - qy) <= radius;
}

function draw(size, maskable) {
  const out = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const rOut = size * (maskable ? 0.26 : 0.32);
  const rIn = rOut * 0.55;
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!maskable && !insideRounded(px, py, size, size * 0.22)) continue;
          const d = Math.hypot(px - c, py - c);
          let col = BG;
          if (d <= rOut && d >= rIn) {
            const angle = (Math.atan2(py - c, px - c) + Math.PI * 2.5) % (Math.PI * 2);
            col = angle < Math.PI * 0.6 ? ACCENT : RING;
          }
          r += col[0]; g += col[1]; b += col[2]; hits++;
        }
      }
      const i = (y * size + x) * 4;
      if (hits) { out[i] = Math.round(r / hits); out[i + 1] = Math.round(g / hits); out[i + 2] = Math.round(b / hits); }
      out[i + 3] = Math.round((hits / (SS * SS)) * 255);
    }
  }
  return png(size, out);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true]]) {
  writeFileSync(new URL(`../icons/${name}`, import.meta.url), draw(size, maskable));
  console.log(`icons/${name}`);
}
```

- [ ] **Step 4: `icons/icon.svg` et `manifest.webmanifest`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1f8a70"/><circle cx="32" cy="32" r="15.5" fill="none" stroke="#fff" stroke-width="9"/><circle cx="32" cy="32" r="15.5" fill="none" stroke="#f2c14e" stroke-width="9" stroke-dasharray="29.2 68.2" transform="rotate(-90 32 32)"/></svg>
```

```json
{
  "name": "Budget — où part mon argent",
  "short_name": "Budget",
  "description": "Import du relevé SG, catégories automatiques, évolution mois par mois.",
  "lang": "fr",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f6f7f4",
  "theme_color": "#1f8a70",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 5: `sw.js`** — à chaque modification d'un fichier de l'app, incrémenter `CACHE` (`budget-v2`, …) pour que les téléphones récupèrent la nouvelle version.

```js
const CACHE = 'budget-v1';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './src/app.js', './src/actions.js', './src/store.js',
  './src/core/errors.js', './src/core/decode.js', './src/core/parse-sg-csv.js', './src/core/parse-ofx.js',
  './src/core/normalize.js', './src/core/categories.js', './src/core/categorize.js', './src/core/dedupe.js',
  './src/core/mapping.js', './src/core/import.js', './src/core/stats.js', './src/core/backup.js', './src/core/demo.js',
  './src/ui/format.js', './src/ui/charts.js', './src/ui/sheet.js', './src/ui/month.js', './src/ui/category-sheet.js',
  './src/ui/trends.js', './src/ui/import.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
```

- [ ] **Step 6: Enregistrer le service worker** — dans `src/app.js`, ajouter à la fin de `init()` (après `ctx.render();`) :

```js
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.error('Service worker', e));
  }
```

- [ ] **Step 7: Vérifier** `npm test` → vert. Navigateur intégré : recharger deux fois `http://localhost:4173/` → `!!navigator.serviceWorker.controller === true` et `(await caches.open('budget-v1').then((c) => c.keys())).length >= 31`. Puis `preview_stop` du serveur, `navigate` vers `http://localhost:4173/` → l'app s'affiche (hors-ligne) ; relancer `preview_start` (`budget`). Console : plus aucune 404.

- [ ] **Step 8: Commit**

```bash
git add manifest.webmanifest icons sw.js scripts/make-icons.mjs src/app.js tests/pwa.test.js
git commit -m "feat(pwa): manifeste, icônes, service worker hors-ligne" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Relevés fictifs, vérification de bout en bout, README et rapport

**Goal:** Générer des relevés SG fictifs réalistes, dérouler le parcours complet sur viewport mobile, corriger ce qui casse, puis écrire le `README.md` (usage, export SG, publication GitHub Pages, installation) et le `RAPPORT.md` (ce qui a été vérifié, ce qui ne l'a pas été, limites, pistes).

**Files:**
- Create: `scripts/make-fixtures.mjs`, `tests/fixtures/sg-exemple.csv`, `tests/fixtures/sg-chevauchement.csv`, `tests/fixtures/sg-exemple.ofx`, `tests/fixtures/colonnes-inconnues.csv` (générés), `README.md`, `RAPPORT.md`
- Modify : tout fichier où la vérification révèle un bug (avec un test Node qui reproduit le bug quand il touche `src/core/`)

**Acceptance Criteria:**
- [ ] `npm run fixtures` écrit les 4 fichiers ; `sg-exemple.csv` est en Windows-1252
- [ ] Parcours complet réussi en viewport mobile (375×812) et en thème sombre, sans erreur console, sans défilement horizontal (`document.documentElement.scrollWidth <= innerWidth`)
- [ ] `README.md` et `RAPPORT.md` présents, en français, sans section vide
- [ ] `npm test` vert ; `git status` propre après le commit

**Verify:** `npm run fixtures && npm test` → vert ; parcours du Step 3 ; `git status --short` → vide

**Steps:**

- [ ] **Step 1: `scripts/make-fixtures.mjs`** puis `npm run fixtures`

```js
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../tests/fixtures/', import.meta.url);
mkdirSync(dir, { recursive: true });
const write = (name, text, encoding = 'latin1') => {
  writeFileSync(new URL(name, dir), Buffer.from(text, encoding));
  console.log(`tests/fixtures/${name}`);
};

const HEADER = "Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise";
const line = (date, label, detail, amount) => `${date};${label};${detail};${amount};EUR`;

const SEPTEMBRE = [
  line('01/09/2026', 'VIR RECU 4512', 'VIR RECU 4512 DE: PARENTS MOTIF: VIREMENT MENSUEL', '450,00'),
  line('03/09/2026', 'PRLV SEPA CROUS LYON', 'PRLV SEPA CROUS LYON ECH/030926 ID EMETTEUR/FR45ZZZ001', '-380,00'),
  line('05/09/2026', 'VIR RECU 7781', 'VIR RECU 7781 DE: CAF DU RHONE MOTIF: APL', '182,00'),
  line('06/09/2026', 'CARTE X1234 06/09 CARREFOUR', 'CARTE X1234 06/09 CARREFOUR CITY LYON', '-32,40'),
  line('08/09/2026', 'PRLV SEPA FREE MOBILE', 'PRLV SEPA FREE MOBILE ECH/080926 ID EMETTEUR/FR12ZZZ123456', '-15,99'),
  line('10/09/2026', 'CARTE X1234 10/09 UBER EATS', 'CARTE X1234 10/09 UBER *EATS PARIS', '-18,90'),
  line('12/09/2026', 'CARTE X1234 12/09 SPOTIFY', 'CARTE X1234 12/09 SPOTIFY', '-11,99'),
  line('14/09/2026', 'CARTE X1234 14/09 LIDL', 'CARTE X1234 14/09 LIDL', '-27,15'),
  line('18/09/2026', 'CARTE X1234 18/09 PATHE', 'CARTE X1234 18/09 PATHE BELLECOUR LYON', '-11,50'),
  line('21/09/2026', 'CARTE X1234 RETRAIT DAB', 'CARTE X1234 RETRAIT DAB 21/09 14H02 LYON', '-40,00'),
  line('25/09/2026', 'CARTE X1234 25/09 AMAZON', 'CARTE X1234 25/09 AMAZON PAYMENTS', '-24,99'),
  line('28/09/2026', 'CARTE X1234 28/09 BOUTIQUE ZEN', 'CARTE X1234 28/09 BOUTIQUE ZEN', '-15,00'),
];
const OCTOBRE = [
  line('01/10/2026', 'VIR RECU 4512', 'VIR RECU 4512 DE: PARENTS MOTIF: VIREMENT MENSUEL', '450,00'),
  line('02/10/2026', 'CARTE X1234 02/10 TCL', 'CARTE X1234 02/10 TCL AGENCE', '-25,20'),
  line('03/10/2026', 'PRLV SEPA CROUS LYON', 'PRLV SEPA CROUS LYON ECH/031026 ID EMETTEUR/FR45ZZZ001', '-380,00'),
  line('04/10/2026', 'CARTE X1234 04/10 CAFE', 'CARTE X1234 04/10 CAFE DES TECHNOS', '-2,50'),
  line('04/10/2026', 'CARTE X1234 04/10 CAFE', 'CARTE X1234 04/10 CAFE DES TECHNOS', '-2,50'),
  line('06/10/2026', 'CARTE X1234 06/10 MONOPRIX', 'CARTE X1234 06/10 MONOPRIX LYON', '-41,80'),
  line('08/10/2026', 'PRLV SEPA FREE MOBILE', 'PRLV SEPA FREE MOBILE ECH/081026 ID EMETTEUR/FR12ZZZ123456', '-15,99'),
  line('09/10/2026', 'CARTE X1234 09/10 DELIVEROO', 'CARTE X1234 09/10 DELIVEROO', '-21,30'),
  line('11/10/2026', 'CARTE X1234 11/10 AMAZON', 'CARTE X1234 11/10 AMAZON PAYMENTS', '24,99'),
  line('12/10/2026', 'CARTE X1234 12/10 SNCF', 'CARTE X1234 12/10 SNCF INTERNET', '-46,00'),
];
const ACCOUNT = '="000123456789";Compte Bancaire;Solde au 15/10/2026;1 234,56 EUR';

write('sg-exemple.csv', [ACCOUNT, '', HEADER, ...OCTOBRE.slice(0, 6).reverse(), ...SEPTEMBRE.reverse(), ''].join('\r\n'));
write('sg-chevauchement.csv', [ACCOUNT, '', HEADER, ...OCTOBRE.reverse(), ''].join('\r\n'));
write('colonnes-inconnues.csv', ['Jour;Opération;Valeur', '12/10/2026;LIDL;-5,00', '13/10/2026;SNCF;-20,00', ''].join('\n'), 'utf8');
write('sg-exemple.ofx', `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261013<TRNAMT>-9.99<NAME>CARTE X1234 13/10 NETFLIX.COM</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261014<TRNAMT>-12.40<NAME>CARTE X1234 14/10 BOULANGERIE PAUL</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`, 'utf8');
```

Attention : `.reverse()` modifie le tableau ; `sg-exemple.csv` prend les 6 premières d'octobre (copie via `slice`), puis `sg-chevauchement.csv` contient les 10 d'octobre → 4 nouvelles, 6 doublons (dont les deux cafés identiques comptés une fois chacun).

- [ ] **Step 2: Contrôle Node rapide des fixtures**

```bash
node -e "import('./src/core/import.js').then(({planImport})=>{const fs=require('fs');const a=planImport(fs.readFileSync('tests/fixtures/sg-exemple.csv'));const b=planImport(fs.readFileSync('tests/fixtures/sg-chevauchement.csv'),{existingIds:new Set(a.added.map(t=>t.id))});console.log(a.added.length,a.uncategorizedCount,b.added.length,b.duplicateCount)})"
```

Attendu : `18 1 4 6` (18 opérations, « BOUTIQUE ZEN » non catégorisée ; chevauchement : 4 nouvelles, 6 doublons).

- [ ] **Step 3: Parcours de bout en bout** — navigateur intégré, `resize_window` preset `mobile`, serveur `budget` lancé, données effacées au départ (« Tout effacer » ou `indexedDB.deleteDatabase('budget')` puis rechargement). Utiliser la fonction `pick` de la Task 14 avec `await (await fetch('tests/fixtures/<fichier>')).arrayBuffer()` comme contenu.
  1. État vide → démo → naviguer dans les mois → Évolution 6/12 mois.
  2. Import de `sg-exemple.csv` → démo retirée, 18 ajoutées, 1 non catégorisée → lien « les classer » → « Autre » déplié sur le bon mois (vérifier : il faut que le mois affiché contienne BOUTIQUE ZEN ; sinon corriger `see-uncat` pour positionner `state.month` sur le mois de la première opération `autre`, avec un test si la logique va dans `src/core/`).
  3. Classer BOUTIQUE ZEN en Shopping, « Oui, toutes ».
  4. Import de `sg-chevauchement.csv` → 4 ajoutées, 6 doublons ; octobre : le remboursement Amazon (+24,99 €) apparaît dans Entrées › Remboursements, pas dans les dépenses ; les deux cafés à 2,50 € sont bien deux opérations.
  5. Import de `sg-exemple.ofx` → 2 ajoutées. Import de `colonnes-inconnues.csv` → correspondance → import.
  6. Export JSON → Tout effacer → Restaurer → mêmes totaux sur l'écran Mois qu'avant l'effacement.
  7. Hors-ligne : arrêter le serveur, recharger → app et données présentes ; relancer le serveur.
  8. `resize_window` `colorScheme: 'dark'` → captures Mois, Évolution, Import ; textes lisibles. Revenir à `light`.
  9. Sur chaque écran : `document.documentElement.scrollWidth <= innerWidth` et `read_console_messages` `onlyErrors` vide.
  10. `resize_window` preset `desktop` à la fin.
  Chaque bug trouvé : corriger, ajouter un test Node s'il touche `src/core/`, bumper `CACHE` dans `sw.js` si un fichier de l'app change, `npm test`, commit séparé `fix: …`.

- [ ] **Step 4: `README.md`**

````markdown
# Budget — où part mon argent

Petite app web installable sur téléphone : tu importes ton relevé **Société Générale** (CSV ou OFX), elle range chaque opération dans une catégorie et te montre la répartition du mois et l'évolution mois par mois. Tout reste sur ton appareil : pas de compte, pas de serveur.

## Utiliser l'app

1. **Exporter le relevé SG** : sur particuliers.sg.fr (navigateur), compte courant → « Télécharger » / « Exporter mes opérations » → format **CSV** (ou OFX/Money) → choisir la période.
2. **Importer** : onglet *Import* → « Importer un relevé » → choisir le fichier. Les périodes qui se chevauchent ne créent pas de doublons.
3. **Corriger une catégorie** : onglet *Mois* → toucher une catégorie → toucher une opération → choisir la catégorie. « Oui, toutes » crée une règle pour ce commerçant (passé et futur).
4. **Évolution** : barres sur 6 ou 12 mois, filtre par catégorie, moyenne et écart du dernier mois.
5. **Sauvegarde** : onglet *Import* → « Exporter une sauvegarde (JSON) ». À refaire de temps en temps : les données vivent dans le navigateur, et le vider les efface.

## Mettre l'app sur ton téléphone (GitHub Pages, ~2 min)

1. Crée un dépôt public sur github.com (ex. `budget`).
2. Envoie ce dossier : `git remote add origin https://github.com/<ton-pseudo>/budget.git` puis `git push -u origin main` (ou glisse-dépose les fichiers dans « Add file → Upload files »).
3. Dépôt → *Settings* → *Pages* → *Deploy from a branch* → `main` / `/ (root)` → *Save*.
4. Après ~1 min, ouvre `https://<ton-pseudo>.github.io/budget/` sur ton téléphone (Chrome ou Safari) → menu → « Ajouter à l'écran d'accueil » / « Installer l'application ».
5. L'app marche ensuite hors-ligne. Le code est public, **tes données non** : elles restent dans le navigateur du téléphone.

## Développer

```bash
npm test              # tests de la logique (node --test)
npm run serve         # http://localhost:4173
npm run icons         # régénère les icônes PNG
npm run fixtures      # régénère les relevés fictifs de tests/fixtures/
```

Après toute modification d'un fichier de l'app, incrémente `CACHE` dans `sw.js` (`budget-v2`, …) pour que les téléphones installés récupèrent la nouvelle version.

## Organisation

- `src/core/` : logique pure (lecture CSV/OFX, normalisation, catégorisation, doublons, stats, sauvegarde, démo), testée sous Node.
- `src/ui/`, `src/app.js`, `src/actions.js` : interface et actions navigateur.
- `src/store.js` : stockage IndexedDB.
- Brancher une nouvelle source (ex. connecteur bancaire) : produire des lignes `{ date, amountCents, rawLabel }` et les passer à `toTransactions()` de `src/core/import.js`.
````

- [ ] **Step 5: `RAPPORT.md`** — rédigé à partir de ce qui a réellement été observé pendant les Steps 2–3, avec ces sections, chacune remplie de faits (commandes, chiffres, captures prises) :
  - **Résumé** (3 lignes : ce qui est livré, état des tests, comment l'essayer)
  - **Vérifié automatiquement** : sortie de `npm test` (nombre de tests, 0 échec)
  - **Vérifié dans le navigateur** : chaque étape du Step 3 avec son résultat
  - **Non vérifié** : un vrai relevé SG (format exact non confirmé, fallback par correspondance de colonnes), installation sur ton téléphone, Safari iOS
  - **Limites connues** : pas de synchro entre appareils, données effacées si le navigateur est vidé, catégorisation par mots-clés à affiner sur tes vrais libellés, pas de temps réel
  - **Bugs trouvés et corrigés pendant la nuit** (liste des commits `fix:`, ou « aucun »)
  - **Pistes** : connecteur DSP2 (session avec toi pour l'authentification forte), budgets et alertes, abonnements détectés, top commerçants

- [ ] **Step 6: Vérifier et commit**

```bash
npm test
git add scripts/make-fixtures.mjs tests/fixtures README.md RAPPORT.md
git commit -m "docs: README, rapport de vérification et relevés fictifs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git status --short
```

`git status --short` doit être vide.

