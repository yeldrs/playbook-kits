# Kits

Un kit est un ensemble de fichiers prêts à installer, figé par un tag. L'agent compare le « Quand l'utiliser » de chaque kit à `CADRAGE.md` et ne propose que ceux qui s'appliquent. Un kit s'installe tel quel par défaut ; tout écart est justifié et listé dans le rapport.

## Kit : synchro du backlog (v2)

**Quand l'utiliser :** `CADRAGE.md` prévoit un backlog suivi dans Notion. Sinon, ne pas installer ce kit. Citer `CADRAGE.md` dans le rapport pour dire pourquoi il convient (ou pourquoi il ne convient pas).

**Ce qu'il fait :** synchronise `docs/BACKLOG.md` (dépôt) avec une base Notion « Backlog », dans les deux sens, via deux intégrations Notion internes. Dossier : `_playbook/backlog-sync/v2/`. Détails et limites : `_playbook/backlog-sync/v2/README.md`.

### Vérifier
- [ ] Depuis `_playbook/backlog-sync/v2/` : `sha256sum -c SHA256SUMS`. Une ligne qui n'est pas OK arrête l'installation.

### Installer
- [ ] Copier les fichiers selon le tableau du README du kit.
- [ ] Le kit installe `docs/NOTION_REF.md` : l'agent s'y réfère pour l'accès Notion. Le fichier d'instructions du projet n'en décrit pas le détail.
- [ ] Projet existant : fusionner `settings.json`, hooks et `/done`. Ne rien écraser, ne rien supprimer.
- [ ] Demander l'identifiant de la page racine de la copie Notion du projet, puis remplacer `<ROOT_MACRO_ID>` et `<ROOT_COPIE_ID>` dans `tools/notion-ref.config.json`.

### STOP : action de l'utilisateur
- [ ] Créer les deux intégrations Notion internes (lecture du playbook, écriture bornée à la copie du projet), partager chaque page racine avec l'intégration qui lui correspond, et définir les variables d'environnement `NOTION_REF_GENERIC_TOKEN` et `NOTION_REF_PROJECT_TOKEN` (variables utilisateur). L'agent n'écrit jamais un token dans un fichier ni dans la conversation.
- [ ] Lancer `bash tools/install-hooks.sh` (le fragment de settings interdit à l'agent de modifier `core.hooksPath`).

### Mettre en route
- [ ] Créer la base Backlog dans la copie (`create-db`), puis ajouter les relations Parent et Sous-éléments à la main (limite connue).
- [ ] Remplir `docs/BACKLOG.md` depuis `CADRAGE.md`, sans inventer.
- [ ] Première synchro à la main : essai à blanc, puis `--apply`. Tester ensuite un commit.

### Rapport final
- [ ] Fichiers installés, écarts au kit (chacun justifié), ce qui n'a pas été testé.

**Limites :** v2 non testée sur un projet neuf. L'anti-signature du kit ne couvre que Claude Code : voir `prompts/03-anti-attribution.md`.

## Faire évoluer un kit

Une évolution = un nouveau dossier de version (`backlog-sync/v3/`), un nouveau tag, et une mise à jour de ce fichier. Les agents installent la version indiquée ici, jamais `main`.
