# Votre nom sur le mât — mode d'emploi et branchement

Prototype de la page de levée de fonds d'Initiatives-Cœur : le vrai modèle 3D du bateau, des milliers de noms sur le mât, un parcours de don avec choix de la place et une « base de données de la générosité » (enfants sauvés, messages, cartes).

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `app.js`, `style.css` | La page principale : le mât en 3D, la recherche d'un nom, le parcours de don, les fiches |
| `mat.html` | « Le mât en fun facts » |
| `data/config.json` | Réglages : prix (10 € automatique, 15 € au choix, 30 € dans le cockpit : `prix_cockpit`), adresse du système de dons, longueur des messages, adresse de la boutique |
| `data/personnalites.json` | Fiches des personnalités : titre, bio, lien avec le projet, photos |
| `data/contreparties.json` | Paliers, contreparties et tirage au sort |
| `data/donateurs.json` | Donateurs publiés (prototype : fictifs) |
| `data/enfants.json` | Enfants financés, dates (passées ou prévues), ville et coordonnées, hôpital, équipe, photo, répartition par pays (prototype : fictifs) |
| `data/soignants.json` | Chirurgiens, cardiologues, soignants, familles d'accueil et médecins au pays, publiés seulement avec leur autorisation (`autorise`) (prototype : fictifs) |
| `enfants/` | Photos des enfants (démo : vraies photos d'enfants pris en charge par Mécénat Chirurgie Cardiaque, sur des fiches fictives) ; `enfants/typo/` : masques des portraits du cockpit |
| `data/mat.json` | Géométrie du mât et plan des places (6 804 places), et la plaque du cockpit (`cockpit` : 6 colonnes × 36 rangs = 216 places, position et taille) |
| `assets/imoca.glb` | Modèle 3D du bateau, déco 2026 (visite 3D d'Ulysse, `imoca-voiles.glb`) : grand-voile haute et J0 affichés, autres voiles masquées, recalé sur le repère du mât |
| `personnalites/` | Photos des personnalités (démo : visuels génériques par thème, en attendant les vraies photos) |

Le site est statique : il fonctionne tel quel sur GitHub Pages ou sur n'importe quel hébergement.

## Mettre à jour sans développeur

- **Personnalités** : compléter `data/personnalites.json` (champ `lien` = son rapport avec Initiatives-Cœur). Photos : déposer les fichiers dans `personnalites/` (JPG d'environ 1 200 px, moins de 300 Ko), puis les lister dans `photos`, par exemple `[{"src": "personnalites/jamy-1.jpg", "credit": "Nom du photographe"}]`. Ne publier qu'avec l'accord de la personne.
- **Contreparties et tirage** : `data/contreparties.json`.
- **Prix, adresse de paiement, boutique** : `data/config.json`.
- **Réseaux sociaux** : `url_publique` (l'adresse imprimée sur les images et vidéos), `hashtags` (mots-dièse ajoutés à la légende) dans `data/config.json`.
- **Vidéo de bienvenue de Violette** : déposer le fichier (MP4 vertical, 20 à 30 s, moins de 15 Mo) dans `videos/`, puis renseigner `video_bienvenue`, par exemple `"videos/bienvenue-violette.mp4"`. Tant que le champ est vide, un emplacement réservé s'affiche.
- **Soignants et familles d'accueil** : `data/soignants.json`, puis l'identifiant de chaque personne dans `equipe` de l'enfant (`data/enfants.json`).
- **Photos des enfants** : déposer `enfants/<numéro>.jpg` (portrait 4/5, environ 640 × 800 px) et retirer `"photo_demo"` quand la fiche est réelle et validée. Démo : les photos sont réelles mais prénoms et histoires sont fictifs ; le site porte `noindex` pour ne pas être référencé.

## Ce que fait la page

- **Accueil** : plan large sur le bateau qui navigue, puis plongée vers un nom tiré au hasard ; deux choix (mettre son nom / découvrir l'équipage du mât), tirage au sort (5 navigations avec Violette).
- **Mât ou cockpit** : le donateur choisit la zone à l'étape 1. Le cockpit (dès 30 €) est une plaque sur la cloison avant, sous les yeux de Violette ; on y choisit sa place comme sur le mât.
- **Fiches reliées entre elles** : donateur → place sur le mât ou dans le cockpit, enfant aidé, carte des donateurs ; enfant → photo, dates, équipe soignante, carte du monde, prénoms des donateurs (chacun ouvre sa fiche) ; soignant → enfants suivis. Le bouton ‹ revient à la fiche précédente.
- **Cartes** : carte du monde des enfants (photos à leur ville, trajet vers l'hôpital, zoom) ; carte des donateurs en France, du pays entier jusqu'à chaque donateur (regroupé autour de sa ville, jamais d'adresse).
- **Survol** : vol de drone autour du bateau, puis retour sur le nom.
- **Partage** : e-mail à une ou plusieurs personnes avec un texte modifiable (il part de la messagerie du donateur), SMS, WhatsApp, Facebook, LinkedIn.
- **Images pour Instagram et Facebook** : publication 1080 × 1350, story 1080 × 1920, bannière 1200 × 630. Chaque image montre le nom encadré sur le mât (ou dans le cockpit), une vignette du bateau entier avec le point où il se trouve, l'enfant aidé et l'adresse de la campagne. Fabriquées dans le navigateur, sans serveur.
- **Vidéo de 15 secondes (9:16)** : survol du bateau, montée jusqu'au nom avec le compteur de hauteur et les sons, arrêt sur le nom et l'enfant, carte de fin. Enregistrée en direct dans le navigateur : MP4 sur Safari et Chrome récents, WebM ailleurs.
- **Partager** : sur téléphone, le menu de partage du téléphone (Instagram, Facebook, WhatsApp…) ; sur ordinateur, téléchargement du fichier. Une légende prête à coller est proposée, avec le lien personnel du donateur.
- **Parrainage** : chaque donateur a son lien `…/?par=prenom-nom`. Le visiteur qui arrive par ce lien voit « X t'invite à embarquer », et son don est rattaché à X (`r` dans `data/donateurs.json`). La fiche de X affiche « a fait embarquer N noms ».
- **Phrase-chaîne** : après le don, une phrase relie le donateur à ses voisins de mât, aux autres donateurs de son enfant et au nombre d'enfants financés par tous les noms du bateau.

## Brancher le système de dons d'Initiatives-Cœur

Le choix d'une place exige une petite base en ligne, pour que deux personnes ne prennent pas la même case.

1. **Réservation.** À la fin du parcours, la page envoie `POST /api/reservations` avec `{place, prenom, nom, ville, message, montant}`. La base bloque la place pendant 30 minutes et renvoie `{ref, expire}`. Contrainte d'unicité sur la place.
2. **Paiement.** La page redirige vers `config.don_url`, par exemple `https://www.initiatives-coeur.fr/don?montant={montant}&ref={ref}`, avec la place, le prénom, le nom, la ville et le message en paramètres.
3. **Confirmation.** Après paiement, le système de dons appelle `POST /api/dons/confirm {ref, montant, date}`. La réservation devient un don : la place est attribuée, le don est affecté à un enfant et le message passe en modération.
4. **Lecture.** La page lit `GET /api/mat` (même format que `data/donateurs.json`) à la place du fichier statique. Seules les données publiques sortent : place, prénom, nom, ville, palier, message validé, enfant.

Règles de placement : en dessous de 15 €, le donateur reçoit la prochaine place libre en partant du pied du mât, en alternant bâbord et tribord. À partir de 15 €, il choisit sa place sur le mât 3D. Dans le cockpit (dès 30 €), il choisit toujours sa place. La réservation envoie aussi `zone` (`mat` ou `cockpit`).

## La base de données de la générosité (inspirée de charity: water)

- **donateurs** : partie privée (e-mail, adresse pour le reçu fiscal) et partie publique (prénom, nom, ville, département), plus les consentements.
- **dons** : montant, date, référence, palier, reçu fiscal.
- **places** : zone (mât ou cockpit), flanc, rang, colonne, hauteur, état (libre, réservée, prise), don associé.
- **soignants** : rôle, ville, hôpital, autorisation de publication ; reliés aux enfants qu'ils suivent.
- **messages** : texte, état de modération, date.
- **enfants** : numéro, prénom, âge, pays et ville d'origine, malformation (expliquée simplement), dates d'arrivée, d'opération et de retour, ville d'accueil, ville de l'hôpital, état, photos, accord de la famille, coût (12 000 €) et montant réuni.
- **affectations** : les dons financent les enfants dans l'ordre chronologique, par tranches de 12 000 €. Chaque donateur sait quel enfant il aide.
- **nouvelles** : les étapes du parcours d'un enfant (date, texte, photo), envoyées par e-mail aux donateurs concernés.
- **personnalités**, **paliers**, **participations au tirage**.

Pistes suivantes : page personnelle privée de chaque donateur (lien envoyé par e-mail), collectes personnelles (anniversaire, course, entreprise) avec leur propre rangée, don mensuel « Équipage », compteur en direct.

Pour le parrainage en production, la réservation envoie aussi `par` (le slug du parrain), conservé dans le navigateur du visiteur depuis son arrivée.

## Points à valider avant l'ouverture

- **Enfants** : fiches publiées seulement avec l'accord écrit des familles et de Mécénat Chirurgie Cardiaque, prénom seul, sans donnée médicale détaillée. On peut aussi réserver les fiches aux donateurs concernés.
- **Données personnelles** : consentement explicite à l'affichage (prénom, nom, ville, message) et droit de retrait. Jamais d'adresse. Les listes par ville ou par département ne montrent que les prénoms. Les montants ne sont jamais affichés ; le palier peut être masqué (`afficher_palier`).
- **Reçu fiscal et contreparties** : préciser qui émet le reçu (Mécénat Chirurgie Cardiaque ou une structure d'Initiatives-Cœur). Les contreparties doivent rester de faible valeur : 25 % du don au plus, dans la limite d'un plafond annuel. À valider avec l'expert-comptable.
- **Tirage au sort** : un tirage réservé aux donateurs est une loterie. Il faut une autorisation préalable (Cerfa 11823) et un règlement, ou une participation gratuite possible.
- **Soignants et familles d'accueil** : autorisation écrite de chaque personne avant publication.
- **Modèle 3D** : fait (déco 2026). Pour un nouveau fichier d'Ulysse, le déposer en `assets/imoca.glb` : le site reconnaît les pièces nommées et recale le modèle. Vérifier la plaque du cockpit (`mat.json` → `cockpit`).
- **Autocollants** : taille (rangées de 2,2 cm, lettres d'environ 1 cm), tenue sur le carbone, poids et pose à valider avec l'équipe technique.

## Tester sur son ordinateur

```
python3 -m http.server 8000
```
puis ouvrir http://localhost:8000.

## Ajouts du 13 novembre

- **Tout en « tu »** sur le site.
- **Boutique solidaire** : https://alexolivier.fr/109-boutique-initiatives-coeur (`boutique_url`).
- **Cockpit en portraits typographiques** : les places du cockpit sont les mots de deux portraits d'enfants d'origine africaine (2 415 dans la démo, photos de Mamayari et de Shalom), sur fond blanc, comme une affiche typographique : beaucoup de petits noms en lignes serrées, quelques grands dans les zones unies, aucun mot ne recouvre un autre (chaque nom remplit exactement sa case). La couleur de chaque lettre vient de la photo (foncée dans les ombres, pâle dans les lumières), avec un léger lavis de la photo sous les noms pour que le visage reste lisible sur le blanc. Une place libre affiche « Ton nom ici », plus pâle ; au choix de la place, les cases libres sont en vert. Les deux portraits sont imprimés à même la coque, en fond perdu, sans cadre ni fond, sur les parois intérieures du cockpit (Aminata à bâbord, Yacine à tribord, environ 75 × 76 cm chacun, à plat sur le plan de chaque paroi relevé sur le modèle 3D ; le bas du portrait se fond dans la paroi) ; les logos (Mécénat Chirurgie Cardiaque, Initiatives-Cœur, partenaires) sont sur la cloison avant. **Vue à 360°** : dans le cockpit, on regarde depuis le centre ; glisser pour tourner la tête dans toutes les directions, pincer ou molette pour zoomer jusqu'à lire un nom, le bouton du bas passe d'un portrait à l'autre. Emplacements réglables dans `app.js` (`CKG` : plans des parois, point de vue, cloison) ou `data/mat.json` → `cockpit.geo`. Les cases et les tons sont calculés par `cockpit_cells.py` (photos détourées) et rangés dans `data/mat.json` → `cockpit` et `enfants/typo/` ; la démo ajoute des donateurs fictifs pour remplir environ 82 % des places.
- **Vidéos du bord** : le site annonce que, pendant les courses, les noms peuvent apparaître dans les vidéos de Violette (accueil, choix mât ou cockpit, contreparties, fiche après le don).
- **Places libres habillées** : sur le mât et dans le cockpit, les cases libres affichent des cœurs pâles, des portraits d'enfants et de courtes phrases, en attendant les noms.
- **Personnalités** : bios complétées (à faire valider, surtout Constance Schaerer et Nouchka Simic), visuels génériques.

## Autocollants et voyages des noms (simulés pour la démo)

- **Les noms sont posés par autocollants.** Mât : 58 autocollants de 40 rangées × 3 places (120 noms ; les derniers de chaque zone sont plus petits). Cockpit : chaque portrait est imprimé en 10 bandes d'environ 120 places (autocollants n°59 à 78). Réglages : `autocollant_rangs` et `autocollant_cockpit` dans `data/config.json`.
- **Règle** : un autocollant part à l'impression quand toutes ses places ont un nom ; il est posé à la première escale du bateau après le délai d'impression (`delai_impression_jours`, 10 jours dans `data/voyages.json`). Les escales où l'on peut poser sont marquées `pose: true`. Le nom est sur le bateau virtuel dès le don, sur le vrai bateau à la pose.
- **Ce que voit le donateur** (écran « Merci », fiche donateur) : les kilomètres déjà parcourus par son nom, son autocollant (n°, emplacement, places prises, date de pose ou estimation au rythme des dons) et ses prochains voyages. Le bouton « Fais compléter ton autocollant » ouvre le partage : plus vite l'autocollant se remplit, plus tôt le nom embarque.
- **Le carnet de voyage du nom** : carte des traces (en rouge les navigations faites avec le nom, en pointillé bleu celles à venir, en gris celles d'avant la pose), position du bateau à la date du jour, liste datée des navigations avec leurs distances. « Tous les autocollants » montre l'état des 78 autocollants.
- **Choix de la place** : le site indique l'autocollant de la place choisie et combien de noms il lui manque ; « Embarquer au plus vite » propose une place sur l'autocollant le plus avancé.
- **Programme et traces** : `data/voyages.json`, produit par `gen_voyages.py`. Les dates passées de 2026 suivent les faits publics (1000 Race, Vendée Arctique, Défi Azimut, village de Saint-Malo, départ de la Route du Rhum le 1er novembre, escale à Roscoff, retour à Lorient, abandon annoncé le 6 novembre) ; les traces et les distances sont simulées. Le programme 2027-2028 (Rolex Fastnet Race, Transat Café L'Or, The Transat CIC, New York Vendée, Vendée Globe) est prévisionnel et à corriger. À terme, les vraies traces viendront de la cartographie de course (GéoVoile) ou des données du bord.
- **Démo** : `autocollants_demo.py` complète 9 autocollants et date leurs noms pour montrer des autocollants déjà posés (Lorient, village de Saint-Malo). À relancer après `cockpit_cells.py`. Ajouter `?jour=2027-11-01` à l'adresse pour voir le site à une autre date.
- **À brancher** : la date de pose réelle de chaque autocollant (saisie par l'équipe au moment de la pose) doit remplacer l'estimation.

## Le vrai cockpit (vue à 360°)

- **La source** : le scan du cockpit d'Ulysse Nizet, « Initiatives-Cœur 4 // Scan Cockpit v2.2 (crop) » (SuperSplat, licence CC BY 4.0), tel que préparé pour le live (`App-Live-Refonte/assets/models/scan-casquette-hd-*.bin`, calage de `bateaux.json`). Le crédit est affiché dans le cockpit, comme la licence le demande (auteur, et mention de la modification).
- **Ce que voit le visiteur** : dans le cockpit, la vue à 360° est le vrai cockpit, vu du centre : les cœurs, les mots et les portraits peints de Jef Aérosol sous la casquette, les bouts, les winchs, les écrans. Hors du scan (hublots, ouverture arrière), on voit la mer, le ciel et le bateau en 3D.
- **Les deux portraits remplacés** : les portraits de Jef Aérosol des deux panneaux blancs, à bâbord et à tribord, sont effacés de l'image ; nos portraits faits de noms (Aminata à bâbord, Yacine à tribord) sont posés en 3D sur ces panneaux, au-dessus de la poche, et restent cliquables (choix de la place, fiches). Les portraits du plafond ne changent pas.
- **Les logos des partenaires** : « Les Chocolats du Cœur » et « K·LINE », dans leur cœur, à leur place exacte sur les deux parois ; redessinés à partir des fichiers vectoriels (`App-Ecrans-RDR-2026/assets/logos/sponsors/`), le tracé du cœur relevé sur le scan.
- **Fichiers** : `cockpit360/` (six faces de 2048 px en WebP, une version 1024 px pour les téléphones dans `cockpit360/m/`, et `cockpit360.json` : point de vue, faces, panneaux). Fabriqués par `outils-cockpit360/build_pano.py` (rendu des taches gaussiennes du scan, effacement des portraits, logos), à relancer si le scan ou les emplacements changent.


## Mer et ciel (rendu du simulateur)

- **Le ciel** : un vrai ciel photographié en HDR (Poly Haven, « Kloofendal 48d Partly Cloudy (Pure Sky) », licence CC0, aucune mention obligatoire), le même principe que le simulateur du live : il éclaire le bateau (reflets sur la coque et les voiles) et donne la position du soleil, calculée à partir du point le plus lumineux de l'image. Fichier `assets/ciel-4k.jpg` (format UltraHDR, 0,6 Mo, lu par `vendor/addons/loaders/UltraHDRLoader.js`) ; si le navigateur ne sait pas le lire, l'ancien `assets/sky.jpg` prend le relais. Orientation réglable dans `data/config.json` → `ciel_rotation` (degrés, 128 par défaut).
- **La mer** : refaite pour ce site, libre de droits. Huit trains de houle (vagues de Gerstner) sur une grille qui suit la caméra jusqu'à l'horizon, reflets du ciel avec l'effet Fresnel, reflet du soleil, écume sur les crêtes et sillage blanc derrière le bateau, brume d'horizon. Hauteur des vagues réglable dans `data/config.json` → `mer_amplitude` (1,15 par défaut ; 0,6 pour une mer calme).
- **Les ombres** : le soleil projette l'ombre des voiles et du gréement sur le pont, sur ordinateur seulement (désactivées sur téléphone pour garder la fluidité).
- **Pourquoi pas Three.js Water Pro** : la mer du live utilise Water Pro, sous licence commerciale ; elle ne peut pas aller dans un dépôt public comme celui-ci. La mer de ce site s'en approche sans en reprendre le code.

## Navigation autour du mât

- **Bâbord / Tribord** : le bouton passe de l'autre côté du mât ; si l'on était au pied du mât ou devant une zone vide, la vue remonte jusqu'à la série de noms la plus proche.
- **Survol** : le vol se termine sur le nom recherché ; sans nom recherché, sur la face bâbord ou tribord, devant une série de noms (jamais sur la tranche du mât) ; lancé depuis le cockpit, il ramène dans le cockpit.
- **Étape du don** : le prénom de l'enfant (« l'opération de Yacine, 12 ans ») ouvre sa fiche.
