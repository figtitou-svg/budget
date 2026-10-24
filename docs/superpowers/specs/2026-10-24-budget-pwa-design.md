# Budget — PWA de suivi des dépenses (design)

Date : 2026-10-24 · Statut : en revue

## 1. Objectif

Savoir **où part l'argent**, avec un effort minimal, principalement sur téléphone.
Succès = l'utilisateur publie l'app (GitHub Pages, ~2 min), importe son relevé
Société Générale et voit immédiatement la répartition de ses dépenses du mois.

### Dit par l'utilisateur
- Priorité : visibilité des dépenses (pas budgets ni abonnements).
- Banque : Société Générale.
- Usage : téléphone d'abord.
- Vues voulues : répartition du mois, évolution mois par mois.
- Temps réel souhaité mais hors périmètre v1 (nécessite agrégateur DSP2 + SCA).

### Hypothèses
- Un seul compte, en euros.
- ~15 catégories par défaut, modifiables.
- Données uniquement locales (pas de serveur, pas de synchro entre appareils).

### Hors périmètre v1
Budgets/alertes, abonnements, top commerçants, synchro bancaire temps réel,
multi-comptes, multi-devises, synchro entre appareils. Le code doit rester
ouvert à un futur connecteur (une source de transactions = une fonction qui
renvoie des transactions normalisées).

## 2. Architecture

PWA statique en JavaScript pur (modules ES), **sans étape de build**.

```
index.html               page unique, 3 onglets
manifest.webmanifest     + icons/  (installable)
sw.js                    service worker, cache-first, hors-ligne complet
vendor/chart.umd.js      Chart.js copié en local (version figée)
src/core/                logique pure, aucun accès DOM/navigateur
  parse-sg-csv.js        CSV SG → transactions brutes
  parse-ofx.js           OFX (SGML 1.x et XML 2.x) → transactions brutes
  decode.js              octets → texte (UTF-8, repli Windows-1252)
  normalize.js           libellé brut → commerçant lisible
  categorize.js          règles par défaut + règles apprises
  dedupe.js              empreintes et fusion d'import
  stats.js               agrégats par mois / catégorie
  categories.js          liste des catégories par défaut (id, nom, couleur, icône)
src/store.js             IndexedDB + export/import JSON
src/ui/                  écrans : month.js, trends.js, import.js, settings.js
src/app.js               routage des onglets, état
tests/                   tests `node --test` + fixtures SG fictives
docs/                    spec, plan
```

Règle stricte : `src/core/` est testable sous Node sans navigateur.

## 3. Modèle de données

```js
Transaction {
  id: string,            // empreinte + suffixe d'occurrence (voir §5)
  date: "YYYY-MM-DD",
  amountCents: number,   // entier signé : négatif = dépense, positif = recette
  rawLabel: string,      // libellé bancaire complet
  merchant: string,      // commerçant normalisé, ex. "CARREFOUR"
  categoryId: string,
  categorySource: "default" | "rule" | "manual",
  importedAt: ISO string
}
Rule { merchant: string, categoryId: string }      // règle apprise
Category { id, name, color, icon }
Settings { columnMapping?: {...}, lastImport?: ISO string }
```

Stores IndexedDB : `transactions` (clé `id`, index `date`), `rules` (clé
`merchant`), `categories`, `settings`.

Export JSON : `{ version: 1, exportedAt, transactions, rules, categories, settings }`.

## 4. Import

### CSV Société Générale
- Séparateur `;`, décimales `,`, dates `JJ/MM/AAAA`.
- Lignes d'en-tête de compte (numéro, solde…) avant le tableau : le parseur
  cherche la première ligne contenant à la fois une colonne date et une
  colonne montant/libellé (détection par mots-clés insensibles à la casse et
  aux accents : `date`, `libell`, `détail`, `montant`, `débit`, `crédit`).
- Gère une colonne montant signée **ou** deux colonnes débit/crédit.
- Libellé = concaténation de « Libellé » et « Détail de l'écriture » si présents.
- Décodage : UTF-8 ; si caractères de remplacement, repli Windows-1252.
- Si la détection échoue : écran de correspondance manuelle (date, libellé,
  montant ou débit+crédit), mémorisé dans `settings.columnMapping`.

### OFX
- Lecture des blocs `<STMTTRN>` : `DTPOSTED`, `TRNAMT`, `NAME`, `MEMO`.
- Tolère SGML sans balises fermantes et XML.

### Normalisation des libellés
Retire préfixes et bruit SG : `CARTE X1234 12/10`, `PRLV SEPA`, `VIR`,
`DE:`, numéros de référence, dates, villes en fin quand reconnaissables.
Résultat en majuscules, espaces compactés. Ex. :
`CARTE X1234 12/10 CARREFOUR CITY LYON` → `CARREFOUR CITY`.

## 5. Doublons

Empreinte = `date | amountCents | rawLabel normalisé (espaces/casse)`.
Pour distinguer deux achats réels identiques le même jour, l'id est
`empreinte#n` où `n` est le rang d'occurrence **dans le fichier importé**.
À l'import, une transaction est ignorée si son id existe déjà. Ainsi, deux
relevés qui se chevauchent ne dupliquent rien, et deux cafés identiques du
même jour restent deux transactions.

## 6. Catégorisation

Ordre de priorité :
1. `manual` : catégorie choisie à la main sur cette transaction.
2. `rule` : règle apprise sur le commerçant.
3. `default` : mots-clés par catégorie (ex. `CARREFOUR|LIDL|AUCHAN|MONOPRIX` → courses ;
   `UBER EATS|DELIVEROO|MCDO` → resto/livraison ; `SNCF|TCL|UBER ` → transports ;
   `VIR .*SALAIRE|CAF|CROUS` …).
4. sinon `autre` (non catégorisée).

Recettes (montant > 0) : catégories dédiées (revenus, virements reçus, remboursements).

Quand l'utilisateur change une catégorie, l'app propose « Appliquer à tous les
<COMMERÇANT> ? » ; si oui, crée/maj la règle et recatégorise toutes les
transactions de ce commerçant qui ne sont pas `manual`.

Catégories par défaut (15) : Courses, Resto & livraison, Transports, Logement,
Factures & télécom, Santé, Shopping, Loisirs & sorties, Abonnements, Études,
Retraits, Virements émis, Revenus, Remboursements, Autre.

## 7. Écrans (mobile d'abord, ≥ 360 px)

Barre d'onglets en bas : **Mois · Évolution · Import**. Thème clair/sombre suivant le système.

- **Mois** (écran d'accueil) : sélecteur ◀ mois ▶ ; cartes Dépensé / Reçu /
  Solde ; donut par catégorie (dépenses) ; liste des catégories triée par
  montant avec %. Tap catégorie → transactions ; tap transaction → feuille
  de changement de catégorie.
- **Évolution** : barres empilées par catégorie sur 6 ou 12 mois ; filtre sur
  une catégorie avec moyenne mensuelle et écart du mois courant.
- **Import** : bouton « Importer un relevé » (CSV/OFX) ; résumé (ajoutées,
  doublons ignorés, non catégorisées → lien) ; réglages : export/import JSON,
  catégories (renommer, couleur), données de démo, tout effacer (confirmation).

État vide : message + boutons « Importer un relevé » et « Essayer avec des
données de démo ».

## 8. Erreurs

- Fichier illisible / format inconnu : message clair, aucune écriture.
- Import transactionnel : tout ou rien.
- IndexedDB indisponible ou quota dépassé : bannière + bouton d'export.
- Import JSON : validation de `version` et de la forme ; refus sinon.

## 9. Tests et vérification

- `node --test` sur tout `src/core/` : variantes CSV SG (UTF-8, Windows-1252,
  lignes d'en-tête, montant signé, débit/crédit), OFX SGML et XML,
  normalisation, catégorisation et priorités, doublons (chevauchement,
  achats identiques), statistiques (mois, évolution, arrondis).
- Vérification navigateur intégré en viewport mobile : démo, import d'un CSV
  SG fictif, recatégorisation + règle, navigation mois, export/réimport JSON,
  rechargement hors-ligne via service worker.
- Non vérifiable sans l'utilisateur : un vrai relevé SG (format exact),
  installation sur son téléphone.

## 10. Livrables

Dépôt git avec l'app, les tests, `README.md` (export du CSV depuis SG,
publication GitHub Pages, installation sur téléphone) et `RAPPORT.md`
(ce qui a été vérifié, ce qui ne l'a pas été, limites connues, pistes :
connecteur DSP2, budgets, abonnements).
