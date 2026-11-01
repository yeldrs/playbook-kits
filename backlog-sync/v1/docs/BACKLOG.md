# Backlog

Source de vérité : ce fichier. La base Notion "Backlog" en est le miroir, synchronisé dans les deux sens
(`node tools/notion-ref.js backlog-sync --profile project --apply` et `backlog-pull`).
Procédure complète : voir le kit "synchro du backlog" dans le playbook (Environnements IA).

## Conventions

- `##` = epic, `E-xx · titre`. `###` = tâche, `B-xxx · titre`. `####` = sous-tâche.
- Une ligne `- clé: valeur` par champ : `statut`, `prio`, `jalon`, `deps`, `description`, `fiche`, `fin`.
- `statut` : todo, doing, blocked, verify, done. `prio` : P0 à P3.
- `description` : 2 ou 3 lignes. `fiche` (optionnel) : `docs/tasks/B-000.md`, pour le détail.
- `deps` : identifiants B-xxx séparés par des virgules.
- Ajouter une tâche à la fin de son epic. Ne jamais réutiliser ni changer un identifiant.
- Tâches finies : `backlog-archive` les déplace dans `docs/BACKLOG_ARCHIVE.md`.

## Jalons

| Jalon | Nom | Objectif |
| --- | --- | --- |
| S1 | [À REMPLIR depuis CADRAGE.md] | [À REMPLIR] |
| Hors | Hors périmètre actuel | Idées et évolutions écartées pour l'instant |

## E-01 · [À REMPLIR depuis CADRAGE.md]

## E-07 · Inbox

Tâches ajoutées depuis Notion et pas encore classées.
