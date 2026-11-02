# Kits

Un kit est un ensemble de fichiers prêts à installer, figé par un tag. L'agent compare le « Quand l'utiliser » de chaque kit à `CADRAGE.md` et ne propose que ceux qui s'appliquent (exception : le backlog est évalué sur tout projet). Un kit s'installe tel quel par défaut ; tout écart est justifié et listé dans le rapport.

## Kit : backlog (v2)

**Quand l'utiliser :** tout projet. L'agent l'évalue toujours (`prompts/02-mise-en-place.md`, étape 3, BACKLOG) et dit s'il apporte une valeur ajoutée et quelles règles du projet il contredit. Le dépôt peut le porter seul, sans Notion.

**Option Notion :** la synchro avec une base Notion (deux intégrations, tokens, hooks) est une étape de connexion supplémentaire, proposée à part et lancée seulement sur accord de l'utilisateur. Elle ne conditionne pas le backlog.

**Ce qu'il fait :** convention `docs/BACKLOG.md` (epics, tâches B-xxx à identifiant stable, statuts, dépendances, jalons), archive des tâches finies dans `docs/BACKLOG_ARCHIVE.md`, skill `/done`. Avec l'option Notion : synchronise `docs/BACKLOG.md` avec une base Notion « Backlog », dans les deux sens. Dossier : `_playbook/backlog-sync/v2/`. Détails et limites : `_playbook/backlog-sync/v2/README.md`.

### Vérifier
- [ ] Depuis `_playbook/backlog-sync/v2/` : `sha256sum -c SHA256SUMS`. Sous Windows sans `sha256sum` : comparer `Get-FileHash -Algorithm SHA256 <fichier>` à la ligne correspondante de `SHA256SUMS`. Une ligne qui n'est pas OK arrête l'installation.

### Installer (backlog, sans Notion)
- [ ] Copier `docs/BACKLOG.md` (gabarit) et le skill `/done` selon le tableau du README du kit.
- [ ] Projet existant : fusionner `settings.json` et `/done`. Ne rien écraser, ne rien supprimer.
- [ ] Les étapes 2 et 5 de `/done` appellent Notion : sans l'option Notion, les ignorer et lister cet écart dans le rapport.
- [ ] Remplir `docs/BACKLOG.md` depuis `CADRAGE.md` et depuis le suivi existant du projet, sans inventer.
- [ ] Le gabarit ne passe pas son propre parseur tel quel : chaque epic doit porter une ligne `- statut:` (`tools/notion-ref.js` l.913). Sans l'option Notion, supprimer aussi la ligne du gabarit qui renvoie à `docs/NOTION_REF.md`.
- [ ] Si le `package.json` racine déclare `"type": "module"`, ajouter `tools/package.json` contenant `{"type":"commonjs"}` : les outils du kit sont en CommonJS et échouent sinon (`require is not defined`). Écart à lister.
- [ ] Contrôle : `node tools/notion-ref.js backlog-list` doit s'exécuter sans erreur.

### Option Notion : installer
- [ ] Copier `tools/` et `docs/NOTION_REF.md` selon le tableau du README du kit. L'agent s'y réfère pour l'accès Notion. Le fichier d'instructions du projet n'en décrit pas le détail.
- [ ] Fusionner `settings.json` et les hooks. Ne rien écraser, ne rien supprimer.
- [ ] Demander l'identifiant de la page racine de la copie Notion du projet, puis remplacer `<ROOT_MACRO_ID>` et `<ROOT_COPIE_ID>` dans `tools/notion-ref.config.json`.

### Option Notion : STOP, action de l'utilisateur
- [ ] Créer les deux intégrations Notion internes (lecture du playbook, écriture bornée à la copie du projet), partager chaque page racine avec l'intégration qui lui correspond, et définir les variables d'environnement `NOTION_REF_GENERIC_TOKEN` et `NOTION_REF_PROJECT_TOKEN` (variables utilisateur). L'agent n'écrit jamais un token dans un fichier ni dans la conversation.
- [ ] Lancer `bash tools/install-hooks.sh` (le fragment de settings interdit à l'agent de modifier `core.hooksPath`).

### Option Notion : mettre en route
- [ ] Créer la base Backlog dans la copie (`create-db`), puis ajouter les relations Parent et Sous-éléments à la main (limite connue).
- [ ] Première synchro à la main : essai à blanc, puis `--apply`. Tester ensuite un commit.

### Rapport final
- [ ] Fichiers installés, écarts au kit (chacun justifié), ce qui n'a pas été testé.

**Limites :** v2 non testée sur un projet neuf. Mode fichier seul non testé : les étapes 2 et 5 de `/done` appellent Notion (à ignorer, écart listé) ; `backlog-archive` est annoncé local mais son besoin de config Notion n'est pas vérifié. L'anti-signature du kit ne couvre que Claude Code : voir `prompts/03-anti-attribution.md`.

## Faire évoluer un kit

Une évolution = un nouveau dossier de version (`backlog-sync/v3/`), un nouveau tag, et une mise à jour de ce fichier. Les agents installent la version indiquée ici, jamais `main`.
