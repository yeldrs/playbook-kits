# Kit : synchro du backlog (v2)

Synchronise `docs/BACKLOG.md` (dépôt) avec une base Notion "Backlog", dans les deux sens, via deux intégrations Notion internes (lecture du playbook, écriture bornée à la copie du projet).

**Statut : v2 (v1 + docs/NOTION_REF.md et marqueur de version dans docs/BACKLOG.md), non testé sur un projet neuf.** Extrait d'un projet qui l'utilise.

## Quand l'utiliser
Projet avec un backlog suivi dans Notion et un agent de code qui doit le tenir à jour.

## Prérequis
- Node 18 ou plus, git.
- Une copie du playbook dans Notion avec une page racine pour le projet.
- Deux intégrations Notion internes créées à la main (impossible à automatiser) : `NOTION_REF_GENERIC_TOKEN` (lecture seule, partagée avec le root macro), `NOTION_REF_PROJECT_TOKEN` (lecture, écriture, commentaires, partagée avec la copie). Les tokens vont dans les variables d'environnement, jamais dans un fichier ni une note.

## Fichiers et destination
| Source (ce dépôt) | Destination (projet) |
| --- | --- |
| tools/notion-ref.js | tools/notion-ref.js |
| tools/backlog-lib.js | tools/backlog-lib.js (même dossier que notion-ref.js) |
| tools/notion-ref.config.json | tools/notion-ref.config.json (remplacer `<ROOT_MACRO_ID>` et `<ROOT_COPIE_ID>`) |
| tools/hooks/post-commit | tools/hooks/post-commit |
| tools/install-hooks.sh | tools/install-hooks.sh |
| claude/settings.fragment.json | à FUSIONNER dans .claude/settings.json (ne jamais écraser) |
| claude/skills/done/SKILL.md | .claude/skills/done/SKILL.md (ne pas écraser un /done existant : fusionner) |
| docs/BACKLOG.md | docs/BACKLOG.md (gabarit, à remplir depuis CADRAGE.md) |
| docs/NOTION_REF.md | docs/NOTION_REF.md |

Les SHA-256 sont dans `SHA256SUMS`. Vérifier avant d'installer : `sha256sum -c SHA256SUMS`.

## Installation
1. Cloner ce dépôt au tag du kit (`git clone --depth 1 --branch backlog-sync-v2 <url>`), vérifier `SHA256SUMS`.
2. Copier les fichiers (tableau ci-dessus). Si le projet a déjà un hook, une config ou un skill : fusionner, ne rien supprimer.
3. Remplir les deux IDs dans la config. Créer la base Backlog dans la copie (voir `node tools/notion-ref.js --help`, commande `create-db`).
4. Le propriétaire du projet crée les deux intégrations et exporte les deux variables.
5. Activer les hooks : `bash tools/install-hooks.sh` (à lancer par l'utilisateur : le fragment de settings interdit à l'agent de toucher `core.hooksPath`).
6. Première synchro à la main, en essai à blanc puis `--apply` : `node tools/notion-ref.js backlog-sync --profile project`. Ne pas la laisser au hook : au-delà d'environ 150 lignes elle peut dépasser le timeout du hook (non testé, à vérifier).

## Limites connues
- `create-db ... backlog` ne crée pas les relations `Parent` et `Sous-éléments` : les ajouter à la main dans Notion ou via `write schema` après création. Non corrigé dans cette version.
- Le message d'erreur 403 parle de capacité manquante, ce qui peut tromper : vérifier d'abord que la page est partagée avec l'intégration.
- La version d'API Notion fixée dans la config (`2022-06-28`) est ancienne. Fonctionne dans le projet d'origine, non vérifié pour le reste.
- Références au-delà de B-999 non analysées.
- Un hook PostToolUse de synchro existait dans le projet d'origine. Retiré ici (la synchro tourne au commit, au démarrage de session et dans /done). À réintroduire seulement si le besoin se confirme.
- Anti-signature IA : `attribution.commit` et `attribution.pr` vides ne couvrent que Claude Code. Pour les autres agents, voir le prompt anti-attribution du playbook.
