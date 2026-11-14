"""Cadrage des photos des enfants : repère le visage sur chaque photo (data/enfants.json → photo)
et range le point à garder dans le cadre (« cadrage » : x, y en fractions de l'image, t = largeur du
visage / largeur de la photo, r = hauteur / largeur de la photo).
Le site s'en sert pour toutes les vignettes (fiche, pastilles rondes, carte, mât, cartes de partage).
Usage : python3 cadrage_photos.py [dossier des fichiers haarcascade d'OpenCV]
Un cadrage peut aussi être saisi à la main dans data/enfants.json ; il n'est alors plus recalculé
(mettre "manuel": true dans le cadrage)."""
import json, sys, os
from PIL import Image
S = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(S, 'data', 'enfants.json')
E = json.load(open(P, encoding='utf-8'))
try:
    import cv2
    D = sys.argv[1] if len(sys.argv) > 1 else cv2.data.haarcascades
    casc = [cv2.CascadeClassifier(os.path.join(D, n)) for n in ('haarcascade_frontalface_default.xml', 'haarcascade_frontalface_alt2.xml', 'haarcascade_profileface.xml')]
except Exception:
    cv2 = None
for k in E['enfants']:
    f = k.get('photo')
    if not f or (k.get('cadrage') or {}).get('manuel'): continue
    W, H = Image.open(os.path.join(S, f)).size
    best = None
    if cv2:
        g = cv2.cvtColor(cv2.imread(os.path.join(S, f)), cv2.COLOR_BGR2GRAY)
        for c in casc:
            if c.empty(): continue
            for gg, flip in ((g, False), (cv2.flip(g, 1), True)):
                for (x, y, w, h) in c.detectMultiScale(gg, 1.06, 4, minSize=(W // 7, W // 7)):
                    if flip: x = W - x - w
                    if best is None or w * h > best[2] * best[3]: best = (int(x), int(y), int(w), int(h))
    if best:
        x, y, w, h = best
        k['cadrage'] = {'x': round((x + w / 2) / W, 3), 'y': round((y + h / 2 - 0.12 * h) / H, 3), 't': round(w / W, 3), 'r': round(H / W, 3)}
    elif 'cadrage' not in k:
        k['cadrage'] = {'x': 0.5, 'y': 0.35, 't': 0.4, 'r': round(H / W, 3)}
    print(k['prenom'], f, k['cadrage'], 'visage trouvé' if best else 'par défaut')
open(P, 'w', encoding='utf-8').write(json.dumps(E, ensure_ascii=False, indent=1))
