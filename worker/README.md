# Serveur de synchronisation bancaire

> Deux façons de l'héberger : **Cloudflare Worker** (section « Installation ») ou **ta propre VM** (section « Variante »).

Petit serveur (Cloudflare Worker, ou Node sur ta propre VM) qui lit ton compte Société Générale via **GoCardless Bank Account Data** (Open Banking / PSD2) et le met à disposition de l'app. Il existe parce que la clé GoCardless ne doit jamais se trouver dans une page web : elle reste ici, dans les secrets du Worker.

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

## Variante : héberger sur ta propre VM (Oracle Cloud, etc.)

Le même code tourne avec Node, sans Cloudflare ni aucune dépendance : `node-server.mjs` sert les mêmes routes et garde ses données dans un fichier JSON. Les données bancaires restent alors chez toi.

Prérequis : une VM Linux avec **Node 18+**, un **nom de domaine** qui pointe vers son IP publique, et les ports **80 et 443** ouverts (dans la *Security List* / le *Network Security Group* Oracle **et** dans le pare-feu de la VM, par ex. `sudo iptables`/`ufw`). Le HTTPS est obligatoire : l'app est en `https://` et le navigateur refuse d'appeler un serveur en `http://`.

1. **Copier le code** sur la VM :
   ```bash
   sudo useradd --system --home /opt/budget budget
   sudo git clone https://github.com/figtitou-svg/budget.git /opt/budget
   ```
2. **Configurer les secrets** :
   ```bash
   cd /opt/budget/worker
   sudo cp .env.example .env
   sudo nano .env            # GC_SECRET_ID, GC_SECRET_KEY, APP_TOKEN, APP_URL, APP_ORIGIN
   sudo chmod 600 .env       # lisible par root seulement : systemd le lit avant de lâcher les droits
   ```
3. **Lancer en service** (redémarre tout seul en cas de panne ou de reboot) :
   ```bash
   sudo cp deploy/budget-sync.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now budget-sync
   sudo systemctl status budget-sync      # doit afficher « active (running) »
   ```
   Si `node` n'est pas dans `/usr/bin/node`, corrige `ExecStart` (`which node`).
4. **HTTPS avec Caddy** ([installation](https://caddyserver.com/docs/install)) : mets le contenu de `deploy/Caddyfile.example` dans `/etc/caddy/Caddyfile` avec ton domaine, puis `sudo systemctl reload caddy`. Le certificat est obtenu et renouvelé automatiquement.
5. **Tester** : `curl -H "authorization: Bearer <ton jeton>" https://sync.exemple.fr/api/status` doit répondre `{"status":"not_linked",...}`.
6. **Dans l'app** : même chose que plus haut, avec `https://sync.exemple.fr` comme adresse.

Le serveur n'écoute que sur `127.0.0.1` (seul Caddy peut l'atteindre). Les requêtes sont traitées une par une, pour que deux appels simultanés ne consomment pas deux fois le quota de la banque. Sauvegarde utile : `/var/lib/budget-sync/state.json` (cache des opérations et lien avec la banque ; le perdre oblige à reconnecter la banque). Mise à jour : `sudo git -C /opt/budget pull && sudo systemctl restart budget-sync`. Logs : `journalctl -u budget-sync -f`.

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
