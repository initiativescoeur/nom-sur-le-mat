"""Cockpit : deux portraits typographiques. Les places sont des cases de mots, sans chevauchement :
quelques grands mots dans les zones unies, puis des lignes serrées de cases (texte justifié).
Sorties : enfants/typo/<num>.png (tons du portrait, à la taille de la zone, mi-échelle), data/mat.json « cockpit »,
et, pour la démo, des donateurs fictifs du cockpit (environ 82 % des places)."""
import json, random, os
import numpy as np, cv2
from PIL import Image
S = os.environ.get('SITE', '.'); SRC = os.environ.get('TYPO_SRC', 'typo_src')   # à lancer depuis la racine du site ; typo_src = photos détourées (hors dépôt)
W, H = 4096, round(4096 * 0.84 / 1.9)
head, pad, midW = H * 0.085 / 0.84, 40, 900
top = head + pad; ah = int(H - top - pad); aw = int((W - midW - pad * 4) / 2)
AREAS = [(pad, top), (W - pad - aw, top)]
KIDS = [(556, 'khadidja.png', (140, 30, 380, 330), 1.0), (557, 'nafissatou.png', (175, 100, 495, 510), 1.45)]
S0, EM, GAP = 13, 5.6, 0.2
BIG = [(32, 0.05, 3), (22, 0.06, 5)]

def integral(x): return cv2.integral(x.astype(np.float64))
def boxsum(I, x, y, w, h): return I[y + h, x + w] - I[y, x + w] - I[y + h, x] + I[y, x]

def tone(src, box, gam=1.0):
    im = Image.open(src).convert('RGBA').crop(box)
    a = np.asarray(im).astype(np.float32); rgb = a[..., :3].astype(np.uint8); al = a[..., 3] / 255
    L = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[..., 0]
    L = cv2.resize(L, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC); al = cv2.resize(al, None, fx=3, fy=3, interpolation=cv2.INTER_LINEAR)
    cl = cv2.createCLAHE(clipLimit=5.0, tileGridSize=(6, 6)).apply(L)
    b = cv2.GaussianBlur(cl, (0, 0), 6); cl = cv2.addWeighted(cl, 1.8, b, -0.8, 0)
    cl = cv2.bilateralFilter(cl, 9, 40, 9); m = al > 0.5
    lo, hi = np.percentile(cl[m], 3), np.percentile(cl[m], 99); g = np.clip((cl.astype(np.float32) - lo) / max(1, hi - lo), 0, 1) ** gam
    ih, iw = g.shape; sc = min(aw / iw, ah * 0.995 / ih); fw, fh = int(iw * sc), int(ih * sc); fx, fy = (aw - fw) // 2, ah - fh
    G = np.zeros((ah, aw), np.float32); A = np.zeros((ah, aw), np.float32)
    G[fy:fy + fh, fx:fx + fw] = cv2.resize(g, (fw, fh), interpolation=cv2.INTER_AREA)
    A[fy:fy + fh, fx:fx + fw] = cv2.resize(al, (fw, fh), interpolation=cv2.INTER_AREA)
    A *= np.clip((ah - np.arange(ah)) / (ah * 0.05), 0, 1)[:, None]
    return G, A

def pack(G, A, seed):
    rnd = random.Random(seed); occ = np.zeros(G.shape, np.uint8); out = []
    M = (A > 0.5).astype(np.float32); IM = integral(M); IG = integral(G * M); IG2 = integral(G * G * M)
    def stats(x, y, bw, bh):
        n = bw * bh; c = boxsum(IM, x, y, bw, bh)
        if c < 1: return 0, 1, 0
        m = boxsum(IG, x, y, bw, bh) / c; v = boxsum(IG2, x, y, bw, bh) / c - m * m
        return c / n, max(0, v) ** 0.5, m
    for s, smax, cnt in BIG:
        bw, bh = int(s * EM), int(s); cands = []
        for y in range(0, ah - bh, max(2, bh // 4)):
            for x in range(0, aw - bw, max(2, bw // 12)):
                c, sd, m = stats(x, y, bw, bh)
                if c >= 0.98 and sd <= smax and m >= 0.45: cands.append((sd - 0.3 * m + rnd.random() * 0.03, x, y))
        cands.sort(); k = 0
        for _, x, y in cands:
            if k >= cnt: break
            if occ[max(0, y - S0):y + bh + S0, max(0, x - S0):x + bw + S0].any(): continue
            occ[y:y + bh, x:x + bw] = 1; out.append((x, y, bw, bh, s)); k += 1
    bh = int(round(S0 * 1.02)); bw = int(round(S0 * EM)); g = max(2, int(S0 * GAP)); y = 0
    while y + bh <= ah:
        x = -rnd.randint(0, bw)
        while x < aw:
            x0, x1 = max(0, x), min(aw, x + bw)
            if x1 - x0 >= bw * 0.8:
                c, sd, m = stats(x0, y, x1 - x0, bh)
                if c >= 0.5 and not occ[y:y + bh, max(0, x0 - g // 2):min(aw, x1 + g // 2)].any():
                    occ[y:y + bh, x0:x1] = 1; out.append((x0, y, x1 - x0, bh, S0)); x += bw + g; continue
                x += max(2, S0 // 2)
            else: x += bw + g
        y += bh
    return out

cells, portraits = [], []
for side, ((num, src, box, gam), (X, Y)) in enumerate(zip(KIDS, AREAS)):
    G, A = tone(f'{SRC}/{src}', box, gam)
    t = np.dstack([(G * 255).astype(np.uint8)] * 3 + [(A * 255).astype(np.uint8)])
    Image.fromarray(t, 'RGBA').resize((aw // 2, ah // 2), Image.LANCZOS).convert('LA').save(f'{S}/enfants/typo/{num}.png', optimize=True)
    portraits.append({'num': num, 'area': [round(X, 1), round(Y, 1), aw, ah]})
    for (x, y, w, h, s) in pack(G, A, seed=side + 3):
        cells.append([side, round(X + x), round(Y + y), round(X + x + w), round(Y + y + h), s])
m = json.load(open(f'{S}/data/mat.json')); OLD_GEN = m.get('cockpit', {}).get('gen', 0)
m['cockpit'] = {'w': 1.9, 'h': 0.84, 'cx': 0.0, 'cy': 1.36, 'z': -4.37, 'head': 0.085, 'ref': [W, H], 'lh': S0, 'cw': int(S0 * EM), 'portraits': portraits, 'cells': cells}
json.dump(m, open(f'{S}/data/mat.json', 'w'), ensure_ascii=False, separators=(',', ':'))
N = len(cells); print('places :', N, [sum(1 for c in cells if c[0] == s) for s in (0, 1)])

# --- démo : donateurs du cockpit (les anciens + des donateurs fictifs ajoutés), environ 82 % des places
p = f'{S}/data/donateurs.json'; d = json.load(open(p)); ic = {c: i for i, c in enumerate(d['cols'])}; R = d['rows']
rnd = random.Random(21)
if OLD_GEN: del R[-OLD_GEN:]            # relance : on retire les donateurs fictifs ajoutés la fois précédente
cur = [r for r in R if r[ic['ck']] >= 0]
want = int(N * 0.82)
firsts = sorted({r[ic['p']] for r in R if r[ic['perso']] < 0}); lasts = sorted({r[ic['n']] for r in R if r[ic['perso']] < 0})
villes = [r[ic['v']] for r in R if r[ic['v']] >= 0]
seen = {(r[ic['p']], r[ic['n']]) for r in R}
new = []
while len(cur) + len(new) < want:
    pr, no = rnd.choice(firsts), rnd.choice(lasts)
    if (pr, no) in seen: continue
    seen.add((pr, no)); row = [None] * len(d['cols'])
    row[ic['slot']] = -1; row[ic['p']] = pr; row[ic['n']] = no; row[ic['v']] = rnd.choice(villes) if rnd.random() < 0.85 else -1
    row[ic['pal']] = rnd.choices([2, 3, 4], [70, 22, 8])[0]; row[ic['m']] = ''; row[ic['perso']] = -1
    row[ic['d']] = f"2026-{rnd.choice(['09', '10', '11'])}-{rnd.randint(1, 28):02d}"; row[ic['e']] = -1; row[ic['b']] = ''; row[ic['ck']] = -1
    if 'r' in ic: row[ic['r']] = -1
    new.append(row)
R.extend(new)
chosen = cur + new; places = list(range(N)); rnd.shuffle(places)
for r in chosen: r[ic['ck']] = -1
for r, c in zip(chosen, places): r[ic['ck']] = c; r[ic['slot']] = -1
json.dump(d, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
m['cockpit']['gen'] = len(new); json.dump(m, open(f'{S}/data/mat.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('donateurs du cockpit :', len(chosen), '(dont', len(new), 'ajoutés) · libres :', N - len(chosen), '· total donateurs :', len(R))
