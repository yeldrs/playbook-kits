# Point d'entrée de l'agent

Règle dure : tu ne sors pas de ce dossier, sauf si je te le demande pour un chemin précis et que tu me demandes confirmation.

Ce dossier `_playbook/` est un kit de lancement placé dans le projet. Tu le lis, tu ne le modifies pas, tu ne le commits jamais. Vérifie que git l'ignore (`git check-ignore _playbook`). S'il n'est pas ignoré : STOP, dis-le-moi, ne modifie pas la configuration git toi-même.

Tu n'as besoin ni de Notion ni du réseau, sauf si un kit retenu l'exige (voir `KITS.md`).

## Quoi faire

1. Regarde si `CADRAGE.md` existe à la racine du projet (hors `_playbook/`).
   - Absent : lis `prompts/01-cadrage.md` et exécute-le tel quel. La matière est ce que je te donne dans le chat. À la fin du cadrage, arrête-toi.
   - Présent : lis `prompts/02-mise-en-place.md` et exécute-le tel quel. Demande-moi d'abord la liste des agents IA que j'utilise.
2. Ne fais jamais les deux dans la même session sans mon accord. Entre les deux, je peux vider la session.
3. Les arrêts (STOP) de chaque prompt sont obligatoires. Aucun push, aucune réécriture d'historique, aucune clé dans un fichier ou dans la conversation.

## Contenu du kit

- `prompts/01-cadrage.md` : cadrer le projet (neuf ou existant), produit `CADRAGE.md`.
- `prompts/02-mise-en-place.md` : auditer l'existant et construire l'architecture du dépôt sur mesure.
- `prompts/03-anti-attribution.md` : règle anti-signature IA en quatre couches, appliquée par la mise en place.
- `KITS.md` : kits optionnels et leur procédure.
- `backlog-sync/` : fichiers du kit de synchro du backlog.
