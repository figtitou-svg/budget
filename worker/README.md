# Serveur de synchronisation bancaire

> Deux façons de l'héberger : **Cloudflare Worker** (section « Installation ») ou **ta propre VM** (section « Variante »).

Petit serveur (Cloudflare Worker, ou Node sur ta propre VM) qui lit ton compte Société Générale via **Enable Banking** (Open Banking / PSD2) et le met à disposition de l'app. Il existe parce que la clé privée de ton application Enable Banking ne doit jamais se trouver dans une page web : elle reste ici, dans les secrets du serveur.

```
App (téléphone) ──jeton──▶ Ton serveur ──JWT signé (clé privée)──▶ Enable Banking ──▶ Société Générale
```

## Ce qu'il faut savoir avant de commencer

- **Pas vraiment du « temps réel ».** Les banques limitent les lectures non interactives (environ 4 par jour et par compte). Le serveur n'interroge la banque qu'**au plus toutes les 6 heures** (`MIN_REFRESH_MINUTES`) et sert le reste depuis son cache. Les opérations « en attente » (carte non encore débitée) sont ignorées ; seules les opérations comptabilisées arrivent.
- **Consentement limité dans le temps.** Le serveur demande la durée maximale que la banque accepte (180 jours au plus). L'app te prévient 7 jours avant la fin ; « Reconnecter ma banque » refait le parcours.
- **Mode « restreint » d'Enable Banking** : gratuit, pour un usage personnel et non commercial, limité aux comptes que tu as liés toi-même dans le Control Panel.
- Tes opérations transitent par Enable Banking et par ton serveur (Cloudflare, ou ta VM). Elles restent aussi dans le navigateur de ton téléphone. Aucune n'est stockée dans GitHub.
- Tout ce qui parle à Enable Banking est dans `src/enablebanking.js` (appels) et `src/map.js` (format des opérations) : c'est là qu'il faudrait corriger un écart si leur API change.

## Prérequis : l'application Enable Banking

1. Sur <https://enablebanking.com>, crée un compte (connexion par e-mail), puis dans le *Control Panel* → *API applications* → *Add a new application*, environnement **Production**, génération de la clé dans le navigateur.
2. Redirect URL : l'adresse de ton app, avec le `/` final (ex. `https://figtitou-svg.github.io/budget/`). Privacy URL et Terms URL : les pages `confidentialite.html` et `conditions.html` de l'app.
3. Garde le fichier `.pem` téléchargé (il n'est plus réaffiché) et note l'identifiant (UUID) de l'application.
4. *Activate by linking accounts* : choisis **Société Générale** (particuliers) et autorise. L'application passe en « Active / Restricted ».

## Installation sur Cloudflare (~15 min)

Prérequis : un compte [Cloudflare](https://dash.cloudflare.com) (gratuit) et Node 18+.

1. **Créer le stockage** (depuis ce dossier) :
   ```bash
   cd worker
   npx wrangler login
   npx wrangler kv namespace create BUDGET
   ```
   Copie l'`id` affiché dans `wrangler.toml` (ligne `id = "..."`).
2. **Vérifie `wrangler.toml`** : `APP_URL` et `APP_ORIGIN` doivent correspondre à l'adresse de ton app (GitHub Pages).
3. **Inventer le jeton** que l'app présentera au serveur (garde-le pour l'app) :
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
4. **Secrets** (jamais dans un fichier du dépôt). Chaque commande demande la valeur ; pour la clé, on envoie le fichier `.pem` :
   ```bash
   npx wrangler secret put EB_APP_ID
   npx wrangler secret put APP_TOKEN
   npx wrangler secret put EB_PRIVATE_KEY < /chemin/vers/ton-fichier.pem
   ```
   Sous Windows PowerShell, la dernière devient :
   ```powershell
   Get-Content C:\chemin\vers\ton-fichier.pem -Raw | npx wrangler secret put EB_PRIVATE_KEY
   ```
5. **Publier** :
   ```bash
   npx wrangler deploy
   ```
   Wrangler affiche l'adresse du serveur (`https://budget-sync.<ton-compte>.workers.dev`).
6. **Dans l'app** : onglet *Import* → *Synchronisation bancaire* → colle l'adresse et le jeton → *Enregistrer* → *Connecter ma banque*. Tu es envoyé chez Société Générale pour donner ton accord (validation dans l'appli SG), puis tu reviens sur l'app, qui termine la connexion et synchronise toute seule.

### Vérifier les comptes lus

Ton application Enable Banking a peut-être plusieurs comptes liés (compte courant **et** carte). Une carte peut lister les mêmes paiements que le compte courant et les doubler. Pour voir ce que le serveur lit :

```bash
curl -H "authorization: Bearer TON_JETON" https://budget-sync.<ton-compte>.workers.dev/api/status
```

(sous PowerShell : `curl.exe`). La réponse contient `accounts` avec, pour chaque compte, une `tag` et une étiquette (type et 4 derniers chiffres de l'IBAN). Si des opérations apparaissent en double, ne garde que le bon compte en ajoutant dans `wrangler.toml`, section `[vars]` :

```toml
ACCOUNT_TAGS = "la_tag_du_compte_courant"
```

puis `npx wrangler deploy`. Les doublons déjà importés se suppriment avec « Tout effacer » dans l'app (fais d'abord une sauvegarde) puis une nouvelle synchronisation.

## Variante : héberger sur ta propre VM (Oracle Cloud, etc.)

Le même code tourne avec Node, sans Cloudflare ni aucune dépendance : `node-server.mjs` sert les mêmes routes et garde ses données dans un fichier JSON. Les données bancaires restent alors chez toi.

Prérequis : une VM Linux avec **Node 18+**, un **nom de domaine** qui pointe vers son IP publique, et les ports **80 et 443** ouverts (dans la *Security List* / le *Network Security Group* Oracle **et** dans le pare-feu de la VM). Le HTTPS est obligatoire : l'app est en `https://` et le navigateur refuse d'appeler un serveur en `http://`.

1. **Copier le code** sur la VM :
   ```bash
   sudo useradd --system --home /opt/budget budget
   sudo git clone https://github.com/figtitou-svg/budget.git /opt/budget
   ```
2. **Déposer la clé** (depuis ton ordinateur, `scp`, puis sur la VM) :
   ```bash
   sudo mkdir -p /opt/budget/secrets
   sudo mv enablebanking.pem /opt/budget/secrets/
   sudo chown -R budget:budget /opt/budget/secrets
   sudo chmod 700 /opt/budget/secrets && sudo chmod 600 /opt/budget/secrets/enablebanking.pem
   ```
3. **Configurer** :
   ```bash
   cd /opt/budget/worker
   sudo cp .env.example .env
   sudo nano .env            # EB_APP_ID, EB_PRIVATE_KEY_FILE, APP_TOKEN, APP_URL, APP_ORIGIN
   sudo chmod 600 .env       # lisible par root seulement : systemd le lit avant de lâcher les droits
   ```
4. **Lancer en service** (redémarre tout seul en cas de panne ou de reboot) :
   ```bash
   sudo cp deploy/budget-sync.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now budget-sync
   sudo systemctl status budget-sync      # doit afficher « active (running) »
   ```
   Si `node` n'est pas dans `/usr/bin/node`, corrige `ExecStart` (`which node`).
5. **HTTPS avec Caddy** ([installation](https://caddyserver.com/docs/install)) : mets le contenu de `deploy/Caddyfile.example` dans `/etc/caddy/Caddyfile` avec ton domaine, puis `sudo systemctl reload caddy`.
6. **Tester** : `curl -H "authorization: Bearer <ton jeton>" https://sync.exemple.fr/api/status` doit répondre `{"status":"not_linked",...}`.
7. **Dans l'app** : comme plus haut, avec `https://sync.exemple.fr` comme adresse.

Le serveur n'écoute que sur `127.0.0.1` (seul Caddy peut l'atteindre). Les requêtes sont traitées une par une, pour que deux appels simultanés ne consomment pas deux fois le quota de la banque. À sauvegarder : `/var/lib/budget-sync/state.json` (cache des opérations et session bancaire ; le perdre oblige à reconnecter la banque). Mise à jour : `sudo git -C /opt/budget pull && sudo systemctl restart budget-sync`. Logs : `journalctl -u budget-sync -f`.

## Utilisation

- L'app synchronise à l'ouverture et quand tu y reviens (au plus toutes les 5 minutes côté app, et au plus toutes les 6 h côté banque).
- Si tu importes aussi un relevé CSV, les opérations déjà synchronisées (même montant, à ±3 jours) ne sont pas comptées deux fois.
- Le jeton est enregistré dans le navigateur uniquement ; il n'est jamais inclus dans les sauvegardes JSON.
- Sur iPhone, si après l'accord chez SG tu atterris dans Safari plutôt que dans l'app installée, saisis l'adresse et le jeton du serveur dans Safari : la connexion se termine alors là (les deux ont des stockages séparés).

## Dépannage

| Message ou symptôme | Cause probable |
|---|---|
| « Le serveur refuse le jeton » | `APP_TOKEN` différent de celui saisi dans l'app |
| « Serveur de synchronisation injoignable » | mauvaise adresse, ou `APP_ORIGIN` ne correspond pas à l'adresse de l'app (CORS) |
| « La connexion à la banque a échoué ou a expiré » | retour de la banque invalide ou trop tardif (plus d'une heure) : refais « Connecter ma banque » |
| « La banque limite les appels » | quota atteint, le serveur réessaie plus tard tout seul |
| « Le consentement bancaire a expiré » | durée de consentement écoulée : *Reconnecter ma banque* |
| Erreur `not_configured` | `EB_APP_ID` ou `EB_PRIVATE_KEY` manquant |
| Erreur `bad_private_key` | clé au mauvais format : il faut un PEM « BEGIN PRIVATE KEY » (PKCS#8), le message donne la commande de conversion |
| Erreur 502 `upstream` (401/403) | identifiant ou clé qui ne correspondent pas à l'application, ou application non activée (voir `npx wrangler tail`) |
| Erreur 502 `institution_not_found` | la banque n'est pas listée sous le nom « Société Générale » : ajuster `ASPSP_NAME` |

Tests (sans réseau) : `npm test` à la racine du dépôt (`tests/worker.test.js`, `tests/node-server.test.js`).
