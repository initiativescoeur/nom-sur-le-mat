"""Cockpit : les places sont des cases sur les deux portraits d'enfants (data/mat.json « cockpit »).
Une case = un nom, sur une ligne de texte ; seules les cases qui tombent sur l'enfant (masque détouré) sont des places.
Les donateurs de démo du cockpit (paliers Équipier et plus) sont répartis sur environ 60 % des places."""
import json, random
import numpy as np
from PIL import Image
S = '.'   # à lancer depuis la racine du site
W, H = 4096, round(4096 * 0.84 / 1.9)
head, pad, midW = H * 0.085 / 0.84, 40, 900
top = head + pad; h = H - top - pad; pw = (W - midW - pad * 4) / 2
LH, CW = 19, 122
kids = [556, 557]; areas = [(pad, top, pw, h), (W - pad - pw, top, pw, h)]
cells, portraits = [], []
for side, (num, (X, Y, w, hh)) in enumerate(zip(kids, areas)):
    im = Image.open(f'{S}/enfants/typo/{num}.png').convert('RGBA'); iw, ih = im.size
    sc = min(w / iw, hh * 0.99 / ih); fw, fh = iw * sc, ih * sc; fx, fy = (w - fw) / 2, hh - fh
    a = np.asarray(im)[..., 3]; g = np.asarray(im)[..., 0] / 255.0
    def sample(x, y):  # coordonnées dans la zone → (alpha, clarté)
        u, v = (x - fx) / sc, (y - fy) / sc
        if u < 0 or v < 0 or u >= iw or v >= ih: return 0, 1
        return a[int(v), int(u)], g[int(v), int(u)]
    nl = int(hh // LH); cap = (0, 0, 470, 80)   # légende en haut à gauche
    portraits.append({'num': num, 'area': [round(X, 1), round(Y, 1), round(w, 1), round(hh, 1)], 'fit': [round(fx, 1), round(fy, 1), round(fw, 1), round(fh, 1)]})
    for line in range(nl):
        yc = (line + 0.5) * LH; off = -(CW / 2 if line % 2 else 0); x = off
        while x < w:
            x0, x1 = max(0, x), min(w, x + CW)
            if x1 - x0 >= CW * 0.75 and not (x0 < cap[2] and yc < cap[3]):
                pts = [sample(x0 + (x1 - x0) * t, yc) for t in (0.1, 0.3, 0.5, 0.7, 0.9)]
                inside = [p for p in pts if p[0] >= 128]
                if len(inside) >= 4:
                    d = 1 - sum(p[1] for p in inside) / len(inside)
                    cells.append([side, line, round(X + x0), round(Y + line * LH), round(X + x1), round(Y + (line + 1) * LH), round(d, 2)])
            x += CW
m = json.load(open(f'{S}/data/mat.json'))
m['cockpit'] = {'w': 1.9, 'h': 0.84, 'cx': 0.0, 'cy': 1.36, 'z': -4.37, 'head': 0.085, 'ref': [W, H], 'lh': LH, 'cw': CW, 'portraits': portraits, 'cells': cells}
json.dump(m, open(f'{S}/data/mat.json', 'w'), ensure_ascii=False, separators=(',', ':'))
N = len(cells); print('places :', N, [sum(1 for c in cells if c[0] == s) for s in (0, 1)])
# donateurs de démo
p = f'{S}/data/donateurs.json'; d = json.load(open(p)); ic = {c: i for i, c in enumerate(d['cols'])}; R = d['rows']
rnd = random.Random(11)
cur = [r for r in R if r[ic['ck']] >= 0]
more = [r for r in R if r[ic['ck']] < 0 and r[ic['pal']] >= 2 and r[ic['perso']] < 0 and r[ic['slot']] >= 0 and not (r[ic['p']] == 'Anna' and r[ic['n']] == 'Brunet')]
rnd.shuffle(more); want = int(N * 0.6)
chosen = cur + more[:max(0, want - len(cur))]
places = list(range(N)); rnd.shuffle(places)
for r, c in zip(chosen, places): r[ic['ck']] = c; r[ic['slot']] = -1
json.dump(d, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
print('donateurs du cockpit :', len(chosen), '· libres :', N - len(chosen))
