# Kit : backlog (v3, fichier seul)

Backlog dans le dépôt : `docs/BACKLOG.md`, identifiants stables, archive des tâches finies, contrôle avant commit, skill `/done`. Aucun Notion. Extrait d'un projet qui l'utilise, testé sur un dépôt jetable (gabarit, contrôles) et sur un projet réel.

Option Notion : suivre `../v2/README.md` (mêmes outils, mêmes SHA-256), à part et sur accord.

## Prérequis
Node 18 ou plus, git.

## Fichiers et destination
| Source | Destination |
| --- | --- |
| tools/notion-ref.js | tools/notion-ref.js (sert aussi sans Notion : `backlog-list`, `backlog-archive`) |
| tools/backlog-lib.js | tools/backlog-lib.js |
| tools/notion-ref.config.json | tools/notion-ref.config.json (laisser les placeholders sans Notion) |
| tools/backlog-check.js | tools/backlog-check.js |
| tools/package.json | tools/package.json, seulement si le `package.json` racine a `"type": "module"` |
| githooks/pre-commit | .githooks/pre-commit (si un pre-commit existe : enchaîner, ne pas écraser) |
| claude/skills/done/SKILL.md | .claude/skills/done/SKILL.md (si un /done existe : fusionner) |
| docs/BACKLOG.md | docs/BACKLOG.md (gabarit, à remplir) |

SHA-256 dans `SHA256SUMS` (fichiers d'outils et hook : jamais modifiés).

## Installation
1. Vérifier `SHA256SUMS`, copier selon le tableau.
2. Remplir `docs/BACKLOG.md` (epics, jalons, tâches) depuis le suivi existant et `CADRAGE.md`, sans inventer. Une priorité ou un jalon sans source est marqué « prop., à valider » dans la description.
3. Contrôles : `node tools/backlog-check.js` et `node tools/notion-ref.js backlog-list` sans erreur.
4. ESLint : ajouter `tools/**` aux ignores (outils en CommonJS, règle `no-require-imports`). Mesurer le lint avant et après.
5. Hook : `git config core.hooksPath .githooks`, à lancer par l'utilisateur (le kit anti-attribution interdit à l'agent de le modifier). Sous Windows, vérifier que le hook est exécutable pour git : `git update-index --chmod=+x .githooks/pre-commit`.
6. Fichier d'instructions du projet : y ajouter les règles « Plusieurs agents » de `docs/BACKLOG.md` en pointeur, pas en copie.

## Limites
- Le parseur refuse : identifiants hors `E-xx` et `B-xxx`, clés hors `statut prio jalon deps description fiche fin`, epic sans `statut`, `deps` non B-xxx.
- `backlog-list` n'affiche rien sur un gabarit sans tâche (normal).
- Le contrôle des B-xxx par rapport à `main` est ignoré si la branche `main` n'existe pas.
- Un pre-commit n'empêche pas `--no-verify` : voir le kit anti-attribution pour les refus d'outil.
