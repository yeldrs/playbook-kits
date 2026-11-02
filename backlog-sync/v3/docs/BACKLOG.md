# Backlog

Source de vérité du suivi. Tâches finies : `docs/BACKLOG_ARCHIVE.md`. Détail d'une tâche : `docs/tasks/B-xxx.md`.
Kit : backlog-sync v3.

## Conventions

- `##` = epic, `E-xx · titre`. `###` = tâche, `B-xxx · titre`. `####` = sous-tâche.
- Une ligne `- clé: valeur` par champ : `statut`, `prio`, `jalon`, `deps`, `description`, `fiche`, `fin`. Aucune autre clé.
- `statut` : todo, doing, blocked, verify, done. Les epics portent aussi un `statut`. `prio` : P0 à P3.
- `description` : 2 ou 3 lignes. `fiche` (optionnel) : `docs/tasks/B-000.md`. `deps` : identifiants B-xxx séparés par des virgules (un blocage en texte libre va dans `description`).
- Ajouter une tâche à la fin de son epic. Ne jamais réutiliser, renuméroter ni retitrer un identifiant.
- Tâches finies : `node tools/notion-ref.js backlog-archive --apply` les déplace dans l'archive.
- Contrôle avant commit : `node tools/backlog-check.js` (lancé par le hook pre-commit).

## Plusieurs agents

- Tout agent peut écrire ici, avec traçabilité. Depuis une branche, une tâche nouvelle ne prend pas de `B-xxx` : elle prend un fichier `docs/tasks/inbox/<slug>.md` (slug `^[a-z0-9-]+$`). Celui qui merge la promeut en `B-xxx` et le dit dans le message du commit.
- Une tâche créée ou modifiée par un agent porte en première ligne de `description` : `branche agent/<outil>-<slug>`.
- Intégration par merge commit, jamais par squash, pour garder qui a fait quoi.

## Jalons

| Jalon | Nom | Objectif |
| --- | --- | --- |
| S1 | [À REMPLIR depuis CADRAGE.md] | [À REMPLIR] |
| Hors | Hors périmètre actuel | Idées et évolutions écartées pour l'instant |

## E-01 · [À REMPLIR depuis CADRAGE.md]

- statut: todo
