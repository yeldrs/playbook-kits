# Kit : anti-attribution (v1)

Empêche les signatures d'outil IA (trailers, mentions, noms d'outil ou de modèle) dans les commits, en 4 couches. Testé sur un dépôt jetable (15 cas) et sur un projet réel.

## Fichiers et destination
| Source | Destination |
| --- | --- |
| githooks/commit-msg | .githooks/commit-msg (si un commit-msg existe : enchaîner) |
| tools/audit-attribution.js | tools/audit-attribution.js |
| claude/settings.fragment.json | à FUSIONNER dans .claude/settings.json (ne rien écraser) |

## Couches
1. Réglage de l'outil : `attribution.commit` et `attribution.pr` vides (Claude Code). Autres outils : vérifier la clé dans la doc de la version installée, sinon « non retrouvé » et les hooks font foi.
2. Consigne dans le fichier d'instructions racine, 2 lignes : « Messages de commit neutres : aucun trailer Co-Authored-By ou équivalent, aucune mention d'outil ou de modèle. Le hook commit-msg refuse ; ne le contourne jamais. »
3. Hook : `git config core.hooksPath .githooks`, à lancer par l'utilisateur (le fragment interdit à l'agent de le modifier).
4. Audit : `node tools/audit-attribution.js <tag-de-départ>` (défaut `pre-playbook`). Code 0 si rien, 1 si constat, 2 si la référence manque. `--history` compte l'historique antérieur sans jamais le réécrire.

## Exceptions (ancrées, minimales)
- Sujet de merge d'une branche agent : `Merge branch 'agent/<slug>'` ou `Merge pull request #N from <compte>/agent/<slug>`. Seuls les trailers et signatures y sont vérifiés.
- Noms de branche `agent/<outil>-<slug>` : acceptés par l'audit.
- Les chemins `.claude/…` et `CLAUDE.md` ne comptent pas comme mention d'outil. Une portée de commit du type `(claude)` est refusée : utiliser une portée neutre.

## Limites
- Les refus `Bash` du fragment sont un frein, pas une garde : un autre outil ou un `core.hooksPath` modifié dans un terminal les contourne. Non testés dans un vrai dépôt.
- Certains contextes (stores, contrats, droits d'auteur) exigent de déclarer l'usage d'une IA : vérifier avant de publier.
