# playbook-kits

Kit de lancement pour un agent de code : cadrer un projet (neuf ou existant), puis mettre en place son dépôt sur mesure. Tout est local, rien ne passe par Notion sauf la synchro du backlog si le projet en a une.

## Utiliser

1. **Projet existant : sécuriser d'abord.** Dans le dossier du projet, git propre, puis :
   ```
   git tag pre-playbook
   git bundle create ../sauvegarde.bundle --all
   git switch -c playbook/rattachement
   ```
   Pas de git : copie le dossier entier et travaille dans la copie.
2. **Télécharger le kit** dans un sous-dossier du projet (PowerShell ou bash) :
   ```
   git clone --depth 1 --branch launch-v1 https://github.com/yeldrs/playbook-kits _playbook
   ```
3. **Faire ignorer le dossier par git** (exclusion locale, rien n'est versionné) :
   ```
   echo "_playbook/" >> .git/info/exclude
   ```
4. **Ouvrir l'agent** dans le dossier du projet et lui dire :
   > Lis `_playbook/START.md` et suis-le.
5. **Dérouler** : cadrage (l'agent écrit `CADRAGE.md` après ton accord), puis, dans une nouvelle session, la mise en place. Il audite l'existant, te propose un tableau d'architecture et attend ton accord avant de construire.
6. **Contrôler** avant d'intégrer : `git diff pre-playbook --stat`. Chaque suppression ou déplacement doit avoir ton accord. Tu fusionnes toi-même.
7. **Nettoyer** : supprime `_playbook/` quand tu n'en as plus besoin.

## Ce que fait la mise en place

- Elle ne copie aucun gabarit : l'architecture se déduit de `CADRAGE.md` (fiche de tri, état de l'existant) et d'un audit de l'existant (fichiers d'instructions, skills, hooks, doublons, contexte chargé à chaque session, scalabilité).
- Elle chiffre le contexte permanent avant et après (octets, estimation de tokens) et propose un budget cible.
- Elle ne supprime et n'écrase rien d'existant sans ton accord par élément.
- Elle applique une règle anti-signature IA en quatre couches, testée dans un dépôt jetable.
- Elle propose les kits utiles (voir `KITS.md`).

## Versions

- Le tag `launch-vN` fige le kit entier. Un kit de fonctionnalité a son propre tag (`backlog-sync-v2`) et son dossier versionné.
- Ce dépôt est la source de vérité des prompts de lancement. Le playbook Notion garde la méthode et pointe ici.

## Non testé

Ce kit n'a pas encore tourné de bout en bout sur un projet. Les prompts reprennent ceux du playbook, validés sur le papier ; la phase d'audit de la mise en place est nouvelle.
