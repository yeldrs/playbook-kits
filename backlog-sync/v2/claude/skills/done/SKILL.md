---
name: done
description: Fin de tâche. Lance les tests du projet, synchronise le backlog avec Notion, propose un message de commit neutre sans commiter.
disable-model-invocation: true
---

Fin de tâche. Fais dans cet ordre, sans rien inventer :

1. Lance les tests du projet s'il y en a (commande indiquée dans AGENTS_INSTRUCTIONS ou le README). S'il y a des échecs, arrête-toi et dis-les. Sans commande de test connue : "non retrouvé", ne l'invente pas.
2. Reprends ce qui a changé dans Notion : `node tools/notion-ref.js backlog-pull --profile project --apply`. Rapporte tel quel les lignes signalées, sans les trancher à la place de l'utilisateur.
3. Dans `docs/BACKLOG.md`, passe à `done` les tâches dont le critère de fin est vrai, ajoute les tâches nouvelles. Le détail d'avancement va dans la fiche `docs/tasks/B-xxx.md` (clé `fiche:`, créée au besoin), pas dans `description:` (2 ou 3 lignes). Ne change jamais un identifiant.
4. Archive les tâches finies : `node tools/notion-ref.js backlog-archive --apply`.
5. Synchronise : `node tools/notion-ref.js backlog-sync --profile project --apply`. Rapporte le résultat tel quel. Un échec ne t'arrête pas, mais il doit apparaître dans ton compte rendu.
6. Si le changement est visible de l'utilisateur final, mets à jour l'état du projet dans le README.
7. Propose un message de commit neutre (aucune mention d'outil ou de modèle). Si le dépôt a un hook commit-msg, passe le message dedans avant de le proposer. Ne commite pas sans accord. Ne pousse jamais.
