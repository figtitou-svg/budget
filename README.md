# Budget — où part mon argent

Petite app web installable sur téléphone : tu importes ton relevé **Société Générale** (CSV ou OFX), elle range chaque opération dans une catégorie et te montre la répartition du mois et l'évolution mois par mois. Par défaut, tout reste sur ton appareil : pas de compte, pas de serveur (la synchronisation bancaire, facultative, ajoute un petit serveur à toi).

## Utiliser l'app

1. **Exporter le relevé SG** : sur particuliers.sg.fr (navigateur), compte courant → « Télécharger » / « Exporter mes opérations » → format **CSV** (ou OFX/Money) → choisir la période.
2. **Importer** : onglet *Import* → « Importer un relevé » → choisir le fichier. Les périodes qui se chevauchent ne créent pas de doublons.
3. **Corriger une catégorie** : onglet *Mois* → toucher une catégorie → toucher une opération → choisir la catégorie. « Oui, toutes » crée une règle pour ce commerçant (passé et futur).
4. **Évolution** : barres sur 6 ou 12 mois, filtre par catégorie, moyenne et écart du dernier mois.
5. **Synchronisation bancaire (facultatif)** : onglet *Import* → *Synchronisation bancaire*. L'app récupère alors tes opérations toute seule via un petit serveur Cloudflare relié à GoCardless (une lecture de la banque toutes les 6 h au plus). Installation pas à pas dans [`worker/README.md`](worker/README.md). Le CSV/OFX reste possible : les opérations déjà synchronisées ne sont pas comptées deux fois.
6. **iPhone** : installe d'abord l'app sur l'écran d'accueil (Partager → « Sur l'écran d'accueil »), puis importe le relevé depuis l'app installée : le stockage de Safari et celui de l'app installée sont séparés.
7. **Sauvegarde** : onglet *Import* → « Exporter une sauvegarde (JSON) ». À refaire de temps en temps : les données vivent dans le navigateur, et le vider les efface.

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

Après toute modification d'un fichier de l'app, incrémente `CACHE` dans `sw.js` (`budget-v4`, …) pour que les téléphones installés récupèrent la nouvelle version.

## Organisation

- `src/core/` : logique pure (lecture CSV/OFX, normalisation, catégorisation, doublons, stats, sauvegarde, démo), testée sous Node.
- `src/ui/`, `src/app.js`, `src/actions.js` : interface et actions navigateur.
- `src/store.js` : stockage IndexedDB.
- `worker/` : serveur de synchronisation bancaire (Cloudflare Worker + GoCardless), déployé séparément.
- Brancher une nouvelle source (ex. connecteur bancaire) : produire des lignes `{ date, amountCents, rawLabel }` et les passer à `toTransactions()` de `src/core/import.js`.

## Captures

Captures mobile (375x812, thème sombre) dans `docs/captures/` : `mois-sombre.jpg`, `evolution-sombre.jpg`, `import-sombre.jpg`.
