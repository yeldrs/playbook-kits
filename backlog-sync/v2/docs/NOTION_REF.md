# NOTION_REF : accès Notion de l'agent

Kit "synchro du backlog" v2. Outil : `tools/notion-ref.js` (Node 18+, aucune dépendance). Liste complète des commandes : `node tools/notion-ref.js --help`.

## Deux profils
- `generic` : lecture seule du playbook root (méthode, prompts, kits). Variable `NOTION_REF_GENERIC_TOKEN`.
- `project` : lecture, écriture et commentaires, bornés à la copie du projet. Variable `NOTION_REF_PROJECT_TOKEN`.
- Les tokens restent dans l'environnement. Jamais dans un fichier, une note, un commit ou une conversation.
- Config : `tools/notion-ref.config.json` (identifiants des deux racines, profils).

## Règles pour l'agent
- Toute écriture est un essai à blanc sans `--apply`. Montrer l'essai, attendre l'accord du propriétaire, puis `--apply`.
- Jamais d'écriture dans le root. Le profil `generic` la refuse.
- Une ligne modifiée dans Notion n'est jamais écrasée par le dépôt : le conflit est signalé, le propriétaire tranche.
- Le dépôt reste la source de vérité du backlog (`docs/BACKLOG.md`). Notion en est le miroir.

## Commandes courantes
- Vérifier la config sans réseau : `node tools/notion-ref.js check`
- Lire une page : `node tools/notion-ref.js read <id|url>`
- Dépôt vers Notion : `node tools/notion-ref.js backlog-sync --profile project` (puis `--apply`)
- Notion vers dépôt : `node tools/notion-ref.js backlog-pull --profile project` (puis `--apply`)
- Vue compacte du backlog ouvert : `node tools/notion-ref.js backlog-list`
- Archiver les tâches finies : `node tools/notion-ref.js backlog-archive --apply`

## Limites connues
Voir `README.md` du kit (section Limites connues). Première synchro à lancer à la main, pas par le hook.
