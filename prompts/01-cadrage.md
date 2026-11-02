Règle dure : tu ne sors pas de ce dossier, sauf si je te le demande pour un chemin précis et que tu me demandes confirmation.
OBJECTIF : produire le document de cadrage de ce projet. Il sert de source de vérité : ce qu'on construit, pour qui, sur quelle plateforme, avec quelles règles, ce qu'on choisit de ne pas faire pour l'instant. Avant tout visuel.
PÉRIMÈTRE : un playbook de méthode peut être mentionné dans ce que je te donne ou dans les fichiers du projet. C'est un outil, pas une partie du projet. Ne l'inclus pas dans le document et ne pose aucune question sur lui, ses étapes ou sa structure. Le dossier `_playbook/` est ce kit : ne le lis pas pour le cadrage, ne le décris pas dans le document.
MATIÈRE : tout ce que je te donne dans le chat (notes en vrac, brief, règles, documents joints, liens), OU RIEN. Tout format est accepté.
AIGUILLAGE : regarde d'abord le dossier, en lecture seule (sans `_playbook/`). S'il est vide ou ne contient que des fichiers de contexte, saute la PHASE 1. S'il contient déjà un projet, commence par la PHASE 1.

PHASE 1, projet existant seulement. Lecture seule : ne crée, ne modifie, ne déplace, ne supprime rien. N'exécute ni le projet ni ses scripts, n'installe rien. Seules commandes permises : celles qui lisent. Ne lis jamais les fichiers de secrets : signale seulement leur existence.
LÉGENDE : [V] vérifié sur place (fichier, historique, mesure), [D] affirmé par un document du projet et non revérifié, [?] inconnu. Pas de [V] sans preuve. Sans source : « non retrouvé ».
1. DÉCOUVERTE : cartographie ce qui existe (arborescence, types de fichiers, poids, dates, fichiers de configuration, historique de versions).
2. NATURE : déduis ce qu'est ce projet avec tes preuves et un niveau de confiance. Si plusieurs lectures tiennent, donne-les toutes.
3. OUTILS ET MÉTHODES : relève ce que le projet utilise réellement et comment ça s'enchaîne. Ce qui est cité mais absent va en [?], sans y accéder.
4. ÉTAT : chronologie et activité, versions parallèles, travail ouvert, décisions en attente, mécanismes de vérification existants.
   TRAJECTOIRE : relève où le projet mentionne sa finalité ou ses évolutions prévues (roadmap, backlog, notes, README). Cite la source. Sans source : « non retrouvé ». Ne déduis rien.
5. RÈGLES DURES : contraintes que le projet s'impose, avec leur source.
6. ÉCARTS : documents qui se contredisent, citent des fichiers absents, états divergents, doublons.
RENDU DE LA PHASE 1 : la fiche dans le chat, constats seulement, avec ce que tu as lu en entier, échantillonné ou pas lu. Termine par les questions qui bloquent le cadrage, 3 au plus. Elles comptent dans les 5 de la phase 2. Puis arrête-toi et attends ma validation de la fiche.

PHASE 2, toujours.
1. TRI : liste ce que tu as reçu (nature, utilité), fiche validée comprise. Dis si le contexte est riche et structuré, ou pauvre et éparpillé.
2. MATIÈRE PAUVRE : pose les questions une à la fois, 5 au total pour toute la session, seulement celles qui changent le cadrage. Couvre ce qui manque : idée en une phrase, public et ton, plateforme et orientation, langues, règles métier ou parcours, contraintes, finalité du produit, ce qui est exclu pour l'instant. Dès que tu as de quoi rédiger, ou après ma cinquième réponse, arrête de questionner et rédige.
3. MATIÈRE RICHE : rédige à partir de l'existant. Chaque règle porte sa source. Rien n'est marqué [OK] sans source. L'existant dit ce qui est, pas ce que je veux : ne déduis pas mes intentions de l'état actuel.
4. DOCUMENT, dans cet ordre :
   a. FICHE DE TRI en tête : nature du produit, plateformes, langues, nombre d'écrans (un seul, quelques-uns, beaucoup), finalité à terme, contraintes dures, hors périmètre actuel. Des faits, en mots simples, sans vocabulaire de méthode.
   b. Pitch en une phrase. Public et plateforme.
   c. VISION ET ÉVOLUTIONS : version en cours, finalité visée à terme, évolutions imaginées. Chaque élément est marqué [OK] (avec source) ou [À CONFIRMER]. N'invente aucune évolution.
   d. ÉTAT DE L'EXISTANT (projet existant seulement) : nature, outils réels, règles dures, écarts, trajectoire, condensés à ce qui sert plus tard. Chaque point garde sa source. La fiche complète reste dans le chat. Si le projet a déjà un suivi (backlog, roadmap), ne recopie pas ses tâches : une évolution = une ligne et le renvoi à sa source. Le cadrage porte la direction, le suivi porte le travail.
   e. Règles du produit, chacune marquée [OK] (établi, avec source) ou [À CONFIRMER].
   f. Glossaire. Cas limites. Liste d'écrans initiale. Hors périmètre actuel : ce que je choisis de ne pas faire dans la version en cours, même si c'est une bonne idée.
   g. Intentions de design, dans une section séparée des règles du produit.
5. INFORMATION MANQUANTE : marque [À CONFIRMER], ne pose pas de question de plus. Si deux documents se contredisent, signale-le sans trancher. Liste tous les [À CONFIRMER] en fin de document.
RENDU : le document dans le chat. Quand il est rendu, écris « cadrage prêt » et attends. Aucune autre question.
ÉCRITURE : aucune écriture avant mon accord sur le contenu. Après, écris-le dans CADRAGE.md à la racine du dossier. Ne crée ni ne modifie rien d'autre. Si CADRAGE.md existe déjà, demande avant de le remplacer.
