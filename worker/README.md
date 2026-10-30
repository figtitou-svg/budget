# Serveur de synchronisation bancaire

Petit Cloudflare Worker qui lit ton compte Société Générale via **GoCardless Bank Account Data** (Open Banking / PSD2) et le met à disposition de l'app. Il existe parce que la clé GoCardless ne doit jamais se trouver dans une page web : elle reste ici, dans les secrets du Worker.

```
App (téléphone) ──jeton──▶ Worker Cloudflare ──clé GoCardless──▶ GoCardless ──▶ Société Générale
```

## Ce qu'il faut savoir avant de commencer

- **Pas vraiment du « temps réel ».** Les banques limitent les lectures à environ **4 par jour et par compte**. Le Worker n'interroge donc la banque qu'**au plus toutes les 6 heures** (`MIN_REFRESH_MINUTES`) et sert le reste depuis son cache. Les opérations « en attente » (carte non encore débitée) sont ignorées ; seules les opérations comptabilisées arrivent.
- **Consentement de 90 jours.** Après 90 jours, la banque coupe l'accès : l'app te le signale et le bouton « Reconnecter ma banque » refait le parcours.
- **Disponibilité de GoCardless à vérifier.** Ce code a été écrit sans pouvoir consulter la documentation en ligne de GoCardless. Vérifie sur <https://bankaccountdata.gocardless.com> que la création d'un compte est ouverte pour toi, et que Société Générale est dans leur liste. Tout ce qui parle à GoCardless est dans `src/gocardless.js` (et `src/map.js` pour le format des opérations) : c'est là qu'il faudrait corriger un écart.
- Tes données bancaires transitent par Cloudflare et GoCardless. Elles restent aussi dans le navigateur de ton téléphone, comme avant.

## Installation (~15 min)

Prérequis : un compte [Cloudflare](https://dash.cloudflare.com) (gratuit) et Node 18+.

1. **Compte GoCardless** : crée un compte Bank Account Data, puis dans *User secrets* génère un `secret_id` et un `secret_key`.
2. **Déployer le Worker** (depuis ce dossier) :
   ```bash
   cd worker
   npx wrangler login
   npx wrangler kv namespace create BUDGET
   ```
   Copie l'`id` affiché dans `wrangler.toml` (ligne `id = "..."`).
3. **Vérifie `wrangler.toml`** : `APP_URL` et `APP_ORIGIN` doivent correspondre à l'adresse de ton app (GitHub Pages). Les valeurs par défaut supposent `https://figtitou-svg.github.io/budget/`.
4. **Secrets** (jamais dans un fichier du dépôt) :
   ```bash
   npx wrangler secret put GC_SECRET_ID
   npx wrangler secret put GC_SECRET_KEY
   npx wrangler secret put APP_TOKEN
   ```
   `APP_TOKEN` est un mot de passe que tu inventes (30+ caractères aléatoires) : l'app le présente à chaque appel. Sans lui, personne ne peut lire tes opérations.
5. **Publier** :
   ```bash
   npx wrangler deploy
   ```
   Wrangler affiche l'adresse du Worker (`https://budget-sync.<ton-compte>.workers.dev`).
6. **Dans l'app** : onglet *Import* → *Synchronisation bancaire* → colle l'adresse et le jeton → *Enregistrer* → *Connecter ma banque*. Tu es envoyé chez Société Générale pour donner ton accord, puis tu reviens sur l'app : elle synchronise toute seule.

## Utilisation

- L'app synchronise à l'ouverture et quand tu y reviens (au plus toutes les 5 minutes côté app, et au plus toutes les 6 h côté banque).
- Si tu importes aussi un relevé CSV, les opérations déjà synchronisées (même montant, à ±3 jours) ne sont pas comptées deux fois.
- Le jeton est enregistré dans le navigateur uniquement ; il n'est jamais inclus dans les sauvegardes JSON.

## Dépannage

| Message dans l'app | Cause probable |
|---|---|
| « Le serveur refuse le jeton » | `APP_TOKEN` différent de celui saisi dans l'app |
| « Serveur de synchronisation injoignable » | mauvaise adresse, ou `APP_ORIGIN` ne correspond pas à l'adresse de l'app (CORS) |
| « La banque limite les appels » | quota quotidien atteint, le Worker réessaie plus tard tout seul |
| « Le consentement bancaire a expiré » | 90 jours écoulés : *Reconnecter ma banque* |
| Erreur 502 du serveur | GoCardless a refusé la requête : vérifie `GC_SECRET_ID` / `GC_SECRET_KEY` et `npx wrangler tail` |

Tests (sans réseau) : `npm test` à la racine du dépôt (`tests/worker.test.js`).
