Mets en place une règle anti-attribution en 4 couches :
1. réglage de l'outil (vérifie la clé exacte dans la documentation de la version installée),
2. consigne formelle dans le fichier d'instructions racine,
3. hook commit-msg et pre-commit versionnés, avec script d'installation idempotent,
4. script d'audit des messages, du code et des métadonnées avec liste d'exceptions minimale.
Ne modifie jamais l'identité git. Vérifie dans un dépôt jetable, jamais dans le vrai. Ne réécris jamais l'historique sans mon accord.

Réserves : un réglage d'attribution a été signalé comme ignoré dans certaines versions, d'où les quatre couches. Deux niveaux de motifs sont nécessaires : les signatures partout, les noms génériques seulement dans les messages et le code. Certains contextes (stores, contrats, droits d'auteur) exigent de déclarer l'usage d'une IA : vérifier avant de publier.
