# Kits

Un kit est un ensemble de fichiers prêts à installer, figé par un tag. L'agent compare le « Quand l'utiliser » de chaque kit à `CADRAGE.md` et ne propose que ceux qui s'appliquent (exception : le backlog est évalué sur tout projet). Un kit s'installe tel quel par défaut ; tout écart est justifié et listé dans le rapport.

## Kit : backlog (v3, fichier seul)

**Quand l'utiliser :** tout projet. L'agent l'évalue toujours (`prompts/02-mise-en-place.md`, étape 3, BACKLOG) et dit s'il apporte une valeur ajoutée et quelles règles du projet il contredit. Le dépôt le porte seul, sans Notion.

**Ce qu'il fait :** convention `docs/BACKLOG.md` (epics, tâches B-xxx à identifiant stable, statuts, dépendances, jalons), règles multi-agents (inbox, branche en description, merge commits), archive des tâches finies dans `docs/BACKLOG_ARCHIVE.md`, contrôle `backlog-check` au pre-commit, skill `/done`. Dossier : `_playbook/backlog-sync/v3/`. Détails et limites : son `README.md`.

### Vérifier
- [ ] Depuis `_playbook/backlog-sync/v3/` : `sha256sum -c SHA256SUMS`. Sous Windows sans `sha256sum` : comparer `Get-FileHash -Algorithm SHA256 <fichier>` (PowerShell) ou `certutil -hashfile <fichier> SHA256` (cmd) à la ligne de `SHA256SUMS`. Une ligne qui n'est pas OK arrête l'installation.

### Installer
- [ ] Suivre le tableau et les étapes du README du kit. Rien d'écrasé, rien de supprimé.
- [ ] Remplir `docs/BACKLOG.md` depuis le suivi existant et `CADRAGE.md`, sans inventer (tableau de couverture, « prop., à valider »).
- [ ] Contrôles dans le dépôt jetable puis dans le projet : `node tools/backlog-check.js` et `node tools/notion-ref.js backlog-list` sans erreur. Mesurer `npm run lint` ou équivalent avant et après (ajouter `tools/**` aux ignores si ESLint). Ne jamais modifier les fichiers du kit (SHA-256 identiques). `_playbook/` est linté tant qu'il est dans le projet : ne pas l'ajouter aux ignores versionnés.
- [ ] STOP utilisateur : `git config core.hooksPath .githooks`.

### Option Notion (à part, sur accord)
- [ ] Suivre `_playbook/backlog-sync/v2/README.md` (mêmes outils). Actions réservées à l'utilisateur : créer les deux intégrations, exporter `NOTION_REF_GENERIC_TOKEN` et `NOTION_REF_PROJECT_TOKEN`, lancer `bash tools/install-hooks.sh`. L'agent n'écrit jamais un token.

## Kit : anti-attribution (v1)

**Quand l'utiliser :** tout projet où des agents IA committent. Appliqué par l'étape 6 de la mise en place via `prompts/03-anti-attribution.md`. Dossier : `_playbook/anti-attribution/v1/` (README, SHA256SUMS).

### Installer
- [ ] Vérifier `SHA256SUMS`, copier selon le README du kit, fusionner `settings.json`, chaîner les hooks existants.
- [ ] Tester dans un dépôt jetable avant le premier commit dans le vrai (hook et audit), puis supprimer le jetable.
- [ ] STOP utilisateur : `git config core.hooksPath .githooks` si pas déjà fait.

### Rapport final
- [ ] Fichiers installés, écarts au kit (chacun justifié), ce qui n'a pas été testé.

**Limites :** les refus `Bash` du fragment de settings sont un frein, pas une garde. Le réglage d'attribution d'autres outils que Claude Code n'est pas vérifié.

## Faire évoluer un kit

Une évolution = un nouveau dossier de version (`backlog-sync/v4/`), un nouveau tag, et une mise à jour de ce fichier. Les agents installent la version indiquée ici, jamais `main`.
