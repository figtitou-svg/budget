# Rapport de vérification

## Résumé

- Livré : PWA hors-ligne « Budget » (import CSV/OFX Société Générale, catégorisation, écran Mois, écran Évolution, sauvegarde JSON, service worker), README.md, relevés fictifs générés par `npm run fixtures`.
- Tests : `npm test` → 99 tests, 99 réussis, 0 échec (après le correctif de la nuit).
- Pour l'essayer : `npm run serve`, ouvrir http://localhost:4173, puis importer `tests/fixtures/sg-exemple.csv`.

## Vérifié automatiquement

- `npm run fixtures` écrit 4 fichiers : `sg-exemple.csv` et `sg-chevauchement.csv` (Windows-1252, fins de ligne CRLF, constaté avec `file`), `colonnes-inconnues.csv` (UTF-8), `sg-exemple.ofx`.
- Contrôle Node des fixtures via `planImport` : `18 1 4 6` (18 opérations, 1 non catégorisée, puis 4 nouvelles et 6 doublons au chevauchement), conforme à l'attendu.
- `npm test` : `tests 99 / pass 99 / fail 0`.

## Vérifié dans le navigateur

Navigateur intégré, viewport 375x812, serveur `budget` sur le port 4173, service worker et IndexedDB vidés au départ. Les fichiers ont été « choisis » par simulation de l'événement `change` (fonction `pick`), car le navigateur n'a pas d'outil d'envoi de fichier.

1. État vide → démo : 128 opérations. Navigation Octobre → Septembre 2026 OK. Évolution 6 mois puis 12 mois OK. Aucune erreur.
2. Import de `sg-exemple.csv` (démo chargée avant) : « 18 opérations ajoutées », « 0 doublons ignorés », « Données de démo retirées », « 1 non catégorisées ». Le lien « les classer » a d'abord affiché Octobre alors que BOUTIQUE ZEN est en septembre : bug corrigé (voir plus bas). Après correctif : Septembre 2026, « Autre · 1 » déplié avec « 28 sept. BOUTIQUE ZEN -15,00 € ».
3. BOUTIQUE ZEN classée en Shopping, « Oui, toutes » : règle `BOUTIQUE ZEN → shopping` enregistrée, plus d'« Autre » dans le mois, Shopping passe à 2 opérations.
4. Import de `sg-chevauchement.csv` : « 4 opérations ajoutées », « 6 doublons ignorés » (22 opérations au total). Octobre : Remboursements 24,99 € dans Entrées, non compté dans les dépenses (535,29 € = 380,00 + 71,20 + 41,80 + 26,30 + 15,99). Les deux cafés à 2,50 € sont bien deux opérations distinctes.
5. Import de `sg-exemple.ofx` : « 2 opérations ajoutées ». Import de `colonnes-inconnues.csv` : tableau de correspondance affiché ; « Importer » sans choix → « Choisis la colonne Date. » ; après Date/Libellé/Montant → 2 opérations ajoutées (26 au total), `settings.columnMapping` = `{date:0, labels:[1], amount:2, sep:";"}`.
6. Export JSON (26 opérations) → « Tout effacer » (0 opération) → Restaurer → « Sauvegarde restaurée », 26 opérations, règle conservée, totaux de Septembre (577,92 € dépensés, 632,00 € reçus) et d'Octobre (582,68 € dépensés, 474,99 € reçus) identiques à ceux d'avant l'effacement.
7. Hors-ligne : service worker actif, cache `budget-v2` de 35 entrées ; serveur arrêté (`curl` → connexion refusée), rechargement : l'app s'affiche avec ses 26 opérations. Serveur relancé ensuite.
8. Thème sombre (émulé via `resize_window` `colorScheme: dark`, fond `rgb(16,21,18)`, texte `rgb(232,238,233)`) : écrans Mois, Évolution et Import relus, textes lisibles. Thème clair : écran Mois relu (fond `rgb(246,247,244)`). Captures enregistrées : `docs/captures/mois-sombre.jpg`, `evolution-sombre.jpg`, `import-sombre.jpg`.
9. `document.documentElement.scrollWidth` = `innerWidth` = 375 sur Mois, Évolution et Import ; pas d'erreur capturée (`error`/`unhandledrejection`) pendant tout le parcours ; `read_console_messages` (erreurs uniquement) vide.
10. Fenêtre remise en `desktop`, serveur arrêté.

Non couvert dans ce parcours : renommage de catégorie (« Courses » → « Bouffe ») et couleurs, non rejoués ici.

## Non vérifié

- Un vrai relevé Société Générale : le format exact n'est pas confirmé ; les fixtures sont fictives. En cas de colonnes non reconnues, l'app propose la correspondance manuelle.
- Installation sur ton téléphone (« Ajouter à l'écran d'accueil ») et publication GitHub Pages.
- Safari iOS.

## Limites connues

- Pas de synchronisation entre appareils.
- Données stockées dans le navigateur : effacées si on le vide (d'où la sauvegarde JSON).
- Catégorisation par mots-clés, à affiner sur tes vrais libellés (règles « Oui, toutes »).
- Pas de temps réel : import manuel de fichiers.

## Bugs trouvés et corrigés pendant la nuit

- `fix: « les classer » ouvre le mois contenant la dernière opération non catégorisée` : le lien du résumé d'import ouvrait le mois courant (Octobre) alors que l'opération non catégorisée était en septembre. Correctif dans `src/ui/import.js` (positionne `state.month`), `CACHE` passé à `budget-v2`. Pas de test Node (logique d'interface). Vérifié dans le navigateur.
- `fix: précache sans cache HTTP, écriture IndexedDB atomique, sauvegarde validée` : `sw.js` précache avec `cache: 'reload'` (évite un mélange de versions via le cache HTTP de GitHub Pages) ; `#write` annule la transaction si l'écriture lève ; `parseBackup` refuse les catégories sans `id` (tests `backup`, `pwa`).
- `fix: catégorisation (KINEPOLIS, AMELIE, DISNEYLAND, factures TotalEnergies), mapping de colonnes réutilisé seulement si le nombre de colonnes correspond, NOT_STATEMENT, feuille de catégorie` : règles resserrées, tests ajoutés ; une pression sur la catégorie actuelle ferme simplement la feuille ; `.sheet` défile ; `CACHE` passé à `budget-v3`.
- `fix:  littéraux dans les règles KINE/AMELI` : le correctif précédent avait écrit des caractères backspace (0x08) au lieu de ``, rendant les règles mortes ; remplacés, deux cas de test ajoutés, `CACHE` passé à `budget-v4`.

## Pistes

- Connecteur DSP2 (session avec toi pour l'authentification forte).
- Budgets et alertes.
- Abonnements détectés.
- Top commerçants.
