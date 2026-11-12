# Votre nom sur le mât — mode d'emploi et branchement

Prototype de la page de levée de fonds d'Initiatives-Cœur : le vrai modèle 3D du bateau, des milliers de noms sur le mât, un parcours de don avec choix de la place et une « base de données de la générosité » (enfants sauvés, messages, cartes).

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `app.js`, `style.css` | La page principale : le mât en 3D, la recherche d'un nom, le parcours de don, les fiches |
| `mat.html` | « Le mât en fun facts » |
| `data/config.json` | Réglages : prix (10 € automatique, 15 € au choix), adresse du système de dons, longueur des messages |
| `data/personnalites.json` | Fiches des personnalités : titre, bio, lien avec le projet, photos |
| `data/contreparties.json` | Paliers, contreparties et tirage au sort |
| `data/donateurs.json` | Donateurs publiés (prototype : fictifs) |
| `data/enfants.json` | Enfants financés et répartition par pays (prototype : fictifs) |
| `data/mat.json` | Géométrie du mât et plan des places (6 804 places) |
| `assets/imoca.glb` | Modèle 3D du bateau (visite virtuelle) |

Le site est statique : il fonctionne tel quel sur GitHub Pages ou sur n'importe quel hébergement.

## Mettre à jour sans développeur

- **Personnalités** : compléter `data/personnalites.json` (champ `lien` = son rapport avec Initiatives-Cœur). Photos : déposer les fichiers dans `personnalites/` (JPG d'environ 1 200 px, moins de 300 Ko), puis les lister dans `photos`, par exemple `[{"src": "personnalites/jamy-1.jpg", "credit": "Nom du photographe"}]`. Ne publier qu'avec l'accord de la personne.
- **Contreparties et tirage** : `data/contreparties.json`.
- **Prix, adresse de paiement** : `data/config.json`.

## Brancher le système de dons d'Initiatives-Cœur

Le choix d'une place exige une petite base en ligne, pour que deux personnes ne prennent pas la même case.

1. **Réservation.** À la fin du parcours, la page envoie `POST /api/reservations` avec `{place, prenom, nom, ville, message, montant}`. La base bloque la place pendant 30 minutes et renvoie `{ref, expire}`. Contrainte d'unicité sur la place.
2. **Paiement.** La page redirige vers `config.don_url`, par exemple `https://www.initiatives-coeur.fr/don?montant={montant}&ref={ref}`, avec la place, le prénom, le nom, la ville et le message en paramètres.
3. **Confirmation.** Après paiement, le système de dons appelle `POST /api/dons/confirm {ref, montant, date}`. La réservation devient un don : la place est attribuée, le don est affecté à un enfant et le message passe en modération.
4. **Lecture.** La page lit `GET /api/mat` (même format que `data/donateurs.json`) à la place du fichier statique. Seules les données publiques sortent : place, prénom, nom, ville, palier, message validé, enfant.

Règles de placement : en dessous de 15 €, le donateur reçoit la prochaine place libre en partant du pied du mât, en alternant tribord et bâbord. À partir de 15 €, il choisit sa place sur le mât 3D.

## La base de données de la générosité (inspirée de charity: water)

- **donateurs** : partie privée (e-mail, adresse pour le reçu fiscal) et partie publique (prénom, nom, ville, département), plus les consentements.
- **dons** : montant, date, référence, palier, reçu fiscal.
- **places** : flanc, rang, colonne, hauteur, état (libre, réservée, prise), don associé.
- **messages** : texte, état de modération, date.
- **enfants** : numéro, prénom, âge, pays et ville d'origine, malformation (expliquée simplement), dates d'arrivée, d'opération et de retour, ville d'accueil, ville de l'hôpital, état, photos, accord de la famille, coût (12 000 €) et montant réuni.
- **affectations** : les dons financent les enfants dans l'ordre chronologique, par tranches de 12 000 €. Chaque donateur sait quel enfant il aide.
- **nouvelles** : les étapes du parcours d'un enfant (date, texte, photo), envoyées par e-mail aux donateurs concernés.
- **personnalités**, **paliers**, **participations au tirage**.

Pistes suivantes : page personnelle privée de chaque donateur (lien envoyé par e-mail), collectes personnelles (anniversaire, course, entreprise) avec leur propre rangée, don mensuel « Équipage », compteur en direct.

## Points à valider avant l'ouverture

- **Enfants** : fiches publiées seulement avec l'accord écrit des familles et de Mécénat Chirurgie Cardiaque, prénom seul, sans donnée médicale détaillée. On peut aussi réserver les fiches aux donateurs concernés.
- **Données personnelles** : consentement explicite à l'affichage (prénom, nom, ville, message) et droit de retrait. Jamais d'adresse. Les listes par ville ou par département ne montrent que les prénoms. Les montants ne sont jamais affichés ; le palier peut être masqué (`afficher_palier`).
- **Reçu fiscal et contreparties** : préciser qui émet le reçu (Mécénat Chirurgie Cardiaque ou une structure d'Initiatives-Cœur). Les contreparties doivent rester de faible valeur : 25 % du don au plus, dans la limite d'un plafond annuel. À valider avec l'expert-comptable.
- **Tirage au sort** : un tirage réservé aux donateurs est une loterie. Il faut une autorisation préalable (Cerfa 11823) et un règlement, ou une participation gratuite possible.
- **Autocollants** : taille (rangées de 2,2 cm, lettres d'environ 1 cm), tenue sur le carbone, poids et pose à valider avec l'équipe technique.

## Tester sur son ordinateur

```
python3 -m http.server 8000
```
puis ouvrir http://localhost:8000.
