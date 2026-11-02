---
name: done
description: Fin de tâche. Lance les tests du projet, met à jour docs/BACKLOG.md, archive les tâches finies, vérifie la cohérence du backlog et propose un message de commit neutre sans commiter.
disable-model-invocation: true
---

Fin de tâche. Fais dans cet ordre, sans rien inventer :

1. Lance les tests du projet s'il y en a (commande indiquée dans le fichier d'instructions ou le README). S'il y a des échecs, arrête-toi et dis-les. Sans commande de test connue : "non retrouvé", ne l'invente pas.
2. Dans `docs/BACKLOG.md`, passe à `done` les tâches dont le critère de fin est vrai. Le détail d'avancement va dans la fiche `docs/tasks/B-xxx.md` (clé `fiche:`, créée au besoin), pas dans `description:` (2 ou 3 lignes). Ne change jamais un identifiant.
   Une tâche nouvelle proposée par un agent ne s'écrit jamais en `B-xxx` dans ce fichier depuis une branche : elle prend un fichier `docs/tasks/inbox/<slug>.md` (slug `^[a-z0-9-]+$`). Celui qui merge la promeut en `B-xxx`.
3. Archive les tâches finies : `node tools/notion-ref.js backlog-archive --apply`. Puis relance la même commande sans `--apply` : il ne doit plus rien rester à déplacer.
4. Vérifie la cohérence : `node tools/backlog-check.js`. Un échec se corrige, il ne se contourne jamais.
5. Si le changement est visible de l'utilisateur final, mets à jour l'état du projet dans le README.
6. Propose un message de commit neutre (aucune mention d'outil ou de modèle). Si le dépôt a un hook commit-msg, passe le message dedans avant de le proposer. Ne commite pas sans accord. Ne pousse jamais.
