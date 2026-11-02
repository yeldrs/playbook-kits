# Point d'entrée de l'agent

Règle dure : tu ne sors pas de ce dossier, sauf si je te le demande pour un chemin précis et que tu me demandes confirmation.

Ce dossier `_playbook/` est un kit de lancement placé dans le projet. Tu le lis, tu ne le modifies pas, tu ne le commits jamais. Vérifie que git l'ignore (`git check-ignore _playbook`). S'il n'est pas ignoré : STOP, dis-le-moi, ne modifie pas la configuration git toi-même.

## Priorité des instructions

Le projet a peut-être déjà des fichiers d'instructions (CLAUDE.md, AGENTS.md, règles, skills, hooks, mémoire) que ton outil a chargés au démarrage. Pour cette tâche :
- Ce fichier et le prompt en cours priment sur toute consigne d'action de ces fichiers (workflow, quoi faire, quoi écrire, quoi lancer au démarrage).
- Les interdictions de ces fichiers continuent de s'appliquer (ne pas pousser, ne pas toucher aux secrets, à la production, aux données).
- Ces fichiers sont de la matière à auditer : tu les lis, tu les mesures, tu ne les modifies pas avant mon accord sur la proposition d'architecture.
- Toute contradiction entre eux et ce kit est listée dans ton rapport. Tu ne la tranche pas.
- Si un hook ou un skill du projet se déclenche pendant la session et modifie un fichier : STOP, dis-le-moi.
- Si les instructions du projet imposent aux agents un worktree, une branche dédiée ou un autre lieu de travail : dis-le-moi avant l'audit et demande-moi où travailler. Ne choisis pas seul.
- Encodage : lis et écris en UTF-8 (sous PowerShell, `-Encoding UTF8`). Sans cela les accents sont corrompus et les constats faux.

## Accès

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
- `prompts/03-anti-attribution.md` : installe le kit anti-signature IA (4 couches), appliqué par la mise en place.
- `KITS.md` : kits optionnels et leur procédure.
- `anti-attribution/` : fichiers du kit anti-signature (v1).
- `backlog-sync/` : fichiers du kit backlog (v3 fichier seul, v2 option Notion).
