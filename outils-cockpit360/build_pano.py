# Vue à 360° du vrai cockpit (scan d'Ulysse Nizet, CC BY 4.0) depuis l'œil du site :
# six faces de cube ; les deux portraits de Jef Aérosol sur les panneaux bâbord et tribord sont effacés
# (nos portraits typographiques s'y posent en 3D), les logos des partenaires sont redessinés en haute définition.
import sys, json, pickle, numpy as np, cv2
sys.path.insert(0, '/home/claude/mat3d/scan')
from splat import Scan
from PIL import Image
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/mat3d/site3d/cockpit360'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
E = np.array([-0.03, 1.55, -5.65])
FACES = {   # nom : (droite, haut, avant)
  'pz': ((-1, 0, 0), (0, 1, 0), (0, 0, 1)), 'px': ((0, 0, 1), (0, 1, 0), (1, 0, 0)), 'nz': ((1, 0, 0), (0, 1, 0), (0, 0, -1)),
  'nx': ((0, 0, -1), (0, 1, 0), (-1, 0, 0)), 'py': ((-1, 0, 0), (0, 0, -1), (0, 1, 0)), 'ny': ((-1, 0, 0), (0, 0, 1), (0, -1, 0)) }
V = pickle.load(open('/tmp/views.pkl', 'rb'))
def ray_plane(L, px, py, c, n):
    d = L['W'].T @ np.array([(px + .5 - L['Wpx'] / 2) / L['f'], -(py + .5 - L['Hpx'] / 2) / L['f'], 1.0]); t = ((c - L['E']) @ n) / (d @ n); return L['E'] + t * d
def fit_plane(L, box, step=5, tol=0.01):
    P = []
    for y in range(box[1], box[3], step):
        for x in range(box[0], box[2], step):
            z = L['Z'][y, x]
            if np.isfinite(z): P.append(L['E'] + L['W'].T @ np.array([(x + .5 - L['Wpx'] / 2) / L['f'] * z, -(y + .5 - L['Hpx'] / 2) / L['f'] * z, z]))
    P = np.array(P); keep = np.ones(len(P), bool)
    for it in range(5):
        c = P[keep].mean(0); n = np.linalg.svd(P[keep] - c)[2][2]; r = np.abs((P - c) @ n); keep = r < max(tol, np.percentile(r, 60))
    if n @ (E - c) < 0: n = -n
    return c, n
# ---------- panneaux (bâbord = Aminata, tribord = Yacine) : coins relevés sur les vues, plan ajusté
BOARDS = []
for name, pk, box in (('pb', [(398, 150), (752, 188), (662, 558), (362, 596)], (430, 230, 700, 440)), ('pt', [(97, 173), (478, 137), (533, 638), (188, 598)], (150, 220, 450, 440))):
    L = V[name]; c, n = fit_plane(L, box, 6, 0.006); TL, TR, BR, BL = [ray_plane(L, x, y, c, n) for x, y in pk]
    R = TR - TL; R /= np.linalg.norm(R); U = TL - BL; U -= R * (U @ R); U /= np.linalg.norm(U)
    Wb = ((TR - TL) @ R + (BR - BL) @ R) / 2; Hb = ((TL - BL) @ U + (TR - BR) @ U) / 2
    BOARDS.append(dict(TL=TL, TR=TR, BR=BR, BL=BL, n=n, R=R, U=U, W=Wb, H=Hb))
    print('panneau', name, 'largeur', round(Wb, 3), 'hauteur', round(Hb, 3), 'n', n.round(3))
# ---------- logos : plans des parois, boîtes des textes, tracé du cœur
LOGOS = []
for name, box, choc, kl, bbox in (('lb2', (560, 60, 940, 400), (583, 190, 884, 277), (583, 298, 886, 347), (560, 70, 930, 395)),
                                  ('lt2', (80, 120, 500, 480), (95, 248, 430, 350), (95, 370, 430, 434), (80, 120, 500, 480))):
    L = V[name]; c, n = fit_plane(L, box, 6, 0.008)
    U = np.array([0, 1.0, 0]) - n * n[1]; U /= np.linalg.norm(U); R = np.cross(-n, U)
    cs = [ray_plane(L, x, y, c, n) for x, y in ((bbox[0], bbox[1]), (bbox[2], bbox[1]), (bbox[2], bbox[3]), (bbox[0], bbox[3]))]
    rs = [(q - c) @ R for q in cs]; us = [(q - c) @ U for q in cs]; m = 0.02
    o = c + R * (min(rs) - m) + U * (max(us) + m); wq = max(rs) - min(rs) + 2 * m; hq = max(us) - min(us) + 2 * m
    LOGOS.append(dict(view=name, c=c, n=n, R=R, U=U, o=o, w=wq, h=hq, choc=choc, kl=kl, bbox=bbox))
    print('logo', name, 'cadre', round(wq, 3), 'x', round(hq, 3), 'm')
RES = 0.0005   # 0,5 mm par pixel dans le plan des logos
def plane_to_px(Lg, P): return np.array([(P - Lg['o']) @ Lg['R'] / RES, (Lg['o'] - P) @ Lg['U'] / RES])
def build_logo(Lg):
    L = V[Lg['view']]; Wc, Hc = int(Lg['w'] / RES), int(Lg['h'] / RES)
    xs, ys = np.meshgrid(np.arange(Wc) + .5, np.arange(Hc) + .5); P = Lg['o'][None, None] + Lg['R'] * (xs * RES)[..., None] - Lg['U'] * (ys * RES)[..., None]
    pc = (P - L['E']) @ L['W'].T; mx = (L['Wpx'] / 2 + L['f'] * pc[..., 0] / pc[..., 2] - .5).astype(np.float32); my = (L['Hpx'] / 2 - L['f'] * pc[..., 1] / pc[..., 2] - .5).astype(np.float32)
    img = Lg['img']; src = cv2.remap(img, mx, my, cv2.INTER_LINEAR); zv = cv2.remap(L['Z'].astype(np.float32), mx, my, cv2.INTER_NEAREST)
    wall = np.abs(zv - pc[..., 2]) < 0.012
    lum = src.mean(2); sat = src.max(2) - src.min(2)
    boxes = np.zeros((Hc, Wc), np.uint8)
    for b in (Lg['choc'], Lg['kl']):
        q = [plane_to_px(Lg, ray_plane(L, x, y, Lg['c'], Lg['n'])) for x, y in ((b[0], b[1]), (b[2], b[3]))]; Lg.setdefault('boxpx', []).append(q)
        cv2.rectangle(boxes, tuple(np.int32(q[0] - 30)), tuple(np.int32(q[1] + 30)), 255, -1)
    ink = ((lum < 0.42) & wall & (boxes == 0)).astype(np.uint8) * 255
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)); k, lab, st, _ = cv2.connectedComponentsWithStats(ink)
    keep = np.zeros_like(ink)
    for i in range(1, k):
        if st[i, cv2.CC_STAT_AREA] > 1500: keep[lab == i] = 255     # le tracé du cœur : la grande composante
    a = cv2.GaussianBlur(keep.astype(np.float32) / 255, (0, 0), 2.2); a = np.clip((a - 0.32) / 0.22, 0, 1)
    layer = np.zeros((Hc, Wc, 4), np.float32); layer[..., :3] = np.array([0x1d, 0x1d, 0x1b]) / 255; layer[..., 3] = a
    for f, (q0, q1) in zip(('chocolats', 'k-line'), Lg['boxpx']):
        im = np.asarray(Image.open(f'/home/claude/mat3d/scan/logos/{f}.png').convert('RGBA')).astype(np.float32) / 255
        bw = q1[0] - q0[0]; bh = q1[1] - q0[1]; s = min(bw / im.shape[1], bh / im.shape[0]); w, h = int(im.shape[1] * s), int(im.shape[0] * s)
        im = cv2.resize(im, (w, h), interpolation=cv2.INTER_AREA); x0 = int(q0[0] + (bw - w) / 2); y0 = int(q0[1] + (bh - h) / 2)
        reg = layer[y0:y0 + h, x0:x0 + w]; al = im[..., 3:4]; reg[..., :3] = im[..., :3] * al + reg[..., :3] * (1 - al); reg[..., 3:4] = al + reg[..., 3:4] * (1 - al)
    old = (((lum < 0.62) | (sat > 0.22)) & wall).astype(np.uint8) * 255; old[boxes == 0] = np.maximum(old[boxes == 0], keep[boxes == 0])
    zone = np.zeros_like(old); zone[boxes > 0] = 255; zone = np.maximum(zone, cv2.dilate(keep, np.ones((25, 25), np.uint8)))
    mask = cv2.dilate(cv2.bitwise_and(old, zone), np.ones((13, 13), np.uint8)); mask = np.maximum(mask, (layer[..., 3] > 0.02).astype(np.uint8) * 255)
    Lg['layer'] = layer; Lg['mask'] = mask.astype(np.float32) / 255
    Image.fromarray((np.clip(layer[..., :3] * layer[..., 3:] + (1 - layer[..., 3:]) * 0.9, 0, 1) * 255).astype(np.uint8)).save(f'/tmp/lockup_{Lg["view"]}.png')
def qfit(xs, ys, cols, X, Y):          # couleur du fond : polynôme du second degré ajusté sur l'anneau, robuste
    A = lambda x, y: np.c_[np.ones_like(x), x, y, x * x, y * y, x * y]
    m = np.ones(len(xs), bool)
    for it in range(3):
        coef = np.linalg.lstsq(A(xs[m], ys[m]), cols[m], rcond=None)[0]; r = np.abs(A(xs, ys) @ coef - cols).sum(1); m = r < max(0.03, np.percentile(r, 80))
    return A(X, Y) @ coef
S = Scan('/home/claude/mat3d/scan/casquette.npz')
for Lg in LOGOS:
    L = V[Lg['view']]; C, T = S.render(L['E'], L['W'], 2 * np.degrees(np.arctan(L['Hpx'] / 2 / L['f'])), L['Wpx'])
    Lg['img'] = np.clip(C + T[..., None] * 0.9, 0, 1).astype(np.float32); build_logo(Lg)
import os; os.makedirs(OUT, exist_ok=True); f = N / 2; meta = {'oeil': E.tolist(), 'faces': {}, 'avant': {}}
yy, xx = np.mgrid[0:N, 0:N]; X = (xx + .5 - N / 2) / f; Y = -(yy + .5 - N / 2) / f
QA = lambda x, y: np.c_[np.ones_like(x), x, y, x * x, y * y, x * y]
def qcoef(xs, ys, cols):               # couleur du fond : polynôme du second degré ajusté, robuste
    m = np.ones(len(xs), bool)
    for it in range(3):
        coef = np.linalg.lstsq(QA(xs[m], ys[m]), cols[m], rcond=None)[0]; r = np.abs(QA(xs, ys) @ coef - cols).sum(1); m = r < max(0.03, np.percentile(r, 80))
    return coef
F = {}
for face, (rt, up, fw) in FACES.items():          # 1. les six faces du scan
    Wm = np.array([rt, up, fw], float); C, T = S.render(E, Wm, 90, N); Z = S.last['Z']
    D = X[..., None] * Wm[0] + Y[..., None] * Wm[1] + Wm[2]
    cov = 1 - T; col = np.where(cov[..., None] > 0.05, C / np.maximum(cov, 0.05)[..., None], 0.9).astype(np.float32)
    F[face] = dict(col=col, alpha=np.clip((cov - 0.35) / 0.5, 0, 1), Zs=np.where(np.isfinite(Z), Z, 1e9), D=D, fg=np.zeros((N, N, 4), np.float32), hole=(cov < 0.4).mean())
def board_geom(b, Fc):
    tpl = ((b['TL'] - E) @ b['n']) / (Fc['D'] @ b['n']); ok = tpl > 0
    P = E + np.where(ok, tpl, 0)[..., None] * Fc['D']; s_ = ((P - b['TL']) @ b['R']) / b['W']; t_ = ((b['TL'] - P) @ b['U']) / b['H']
    inside = ok & (s_ > -0.01) & (s_ < 1.01) & (t_ > -0.01) & (t_ < 1.01); on = inside & (np.abs(Fc['Zs'] - tpl) < 0.018); front = inside & (Fc['Zs'] < tpl - 0.018)
    reg = on & (s_ > 0.012) & (s_ < 0.988) & (t_ > 0.04) & (t_ < 0.78)
    ring = on & ~reg & (Fc['col'].mean(2) > 0.62) & (t_ < 0.9) & ~((t_ < 0.06) & ((s_ < 0.1) | (s_ > 0.9)))
    return s_, t_, on, front, reg, ring, inside
for b in BOARDS:                                   # 2. panneaux : on n'efface que la peinture ; le panneau garde sa vraie matière, sa teinte et ses bords
    G = {k: board_geom(b, Fc) for k, Fc in F.items()}; rng = np.random.default_rng(1)
    core = {k: g[6] & ~g[3] & (g[0] > 0.035) & (g[0] < 0.965) & (g[1] > 0.055) & (g[1] < 0.79) for k, g in G.items()}
    lum = {k: F[k]['col'].mean(2) for k in G}; sat = {k: F[k]['col'].max(2) - F[k]['col'].min(2) for k in G}
    allL = np.concatenate([lum[k][core[k]] for k in G]);
    if not len(allL): continue
    thr0 = np.percentile(allL, 70) - 0.12
    cand = {k: core[k] & (lum[k] > thr0) & (sat[k] < 0.10) for k in G}
    coef = qcoef(np.concatenate([G[k][0][cand[k]] for k in G]), np.concatenate([G[k][1][cand[k]] for k in G]), np.concatenate([F[k]['col'][cand[k]] for k in G]))
    sd = float(np.std(np.concatenate([F[k]['col'][cand[k]].mean(1) for k in G]))) if any(cand[k].any() for k in G) else 0.01
    for k, (s_, t_, on, front, reg, ring, ins) in G.items():
        Fc = F[k]; c = core[k]
        if c.any():
            fit = np.zeros_like(Fc['col']); fit[c] = QA(s_[c], t_[c]) @ coef
            paint = c & ((lum[k] < fit.mean(2) - 0.09) | (sat[k] > 0.11) | (np.abs(Fc['col'] - fit).sum(2) > 0.27))
            m = cv2.dilate(paint.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(np.float32)
            soft = cv2.GaussianBlur(cv2.erode(c.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 2)
            m = np.clip(cv2.GaussianBlur(m, (0, 0), 3) * 1.6, 0, 1) * soft
            fill = np.clip(fit + rng.normal(0, min(0.02, max(0.006, sd * 0.5)), fit.shape), 0, 1)
            Fc['col'] = (Fc['col'] * (1 - m[..., None]) + fill * m[..., None]).astype(np.float32)
        Fc['fg'][front, :3] = Fc['col'][front]; Fc['fg'][front, 3] = 1
for Lg in LOGOS:                                   # 3. logos : fond ajusté dans le plan de la paroi, puis les logos en haute définition
    Hc, Wc = Lg['mask'].shape; G = {}
    for k, Fc in F.items():
        tpl = ((Lg['c'] - E) @ Lg['n']) / (Fc['D'] @ Lg['n']); ok = tpl > 0
        P = E + np.where(ok, tpl, 0)[..., None] * Fc['D']; u = ((P - Lg['o']) @ Lg['R']) / RES; v = ((Lg['o'] - P) @ Lg['U']) / RES
        inside = ok & (u >= 0) & (u < Wc - 1) & (v >= 0) & (v < Hc - 1)
        if not inside.any(): continue
        mu, mv = np.where(inside, u, -10).astype(np.float32), np.where(inside, v, -10).astype(np.float32)
        lay = cv2.remap(Lg['layer'], mu, mv, cv2.INTER_LINEAR, borderValue=0); msk = cv2.remap(Lg['mask'], mu, mv, cv2.INTER_LINEAR, borderValue=0)
        wall = inside & (np.abs(Fc['Zs'] - tpl) < 0.02); reg = wall & (msk > 0.05)
        ringm = cv2.dilate((msk > 0.05).astype(np.uint8), np.ones((31, 31), np.uint8)) > 0
        ring = wall & ringm & ~(msk > 0.05) & (Fc['col'].mean(2) > 0.55); G[k] = (u / Wc, v / Hc, lay, wall, reg, ring)
    if not G: continue
    coef = qcoef(np.concatenate([g[0][g[5]] for g in G.values()]), np.concatenate([g[1][g[5]] for g in G.values()]), np.concatenate([F[k]['col'][g[5]] for k, g in G.items()]))
    for k, (u, v, lay, wall, reg, ring) in G.items():
        Fc = F[k]; col = Fc['col']; base = col.copy()
        if reg.any(): base[reg] = np.clip(QA(u[reg], v[reg]) @ coef, 0, 1)
        shade = np.clip(base / 0.93, 0.5, 1.08); a = (lay[..., 3] * wall)[..., None]
        Fc['col'] = np.where(reg[..., None] | (a > 0), base * (1 - a) + lay[..., :3] * shade * a, col).astype(np.float32)
for face, (rt, up, fw) in FACES.items():          # 4. écriture
    Fc = F[face]; rgba = np.dstack([np.clip(Fc['col'], 0, 1), Fc['alpha']])
    Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').save(f'{OUT}/{face}.webp', quality=88, method=6)
    if Fc['fg'][..., 3].any(): meta['avant'][face] = True; Image.fromarray((np.clip(Fc['fg'], 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/{face}-avant.webp', quality=90, method=6)
    meta['faces'][face] = [list(rt), list(up), list(fw)]; print('face', face, 'hors scan', round(Fc['hole'] * 100, 1), '%', 'avant-plan', int(Fc['fg'][..., 3].sum()))
# panneaux pour le site : centre, droite, haut, normale, largeur, hauteur
meta['panneaux'] = [{k: (v.tolist() if hasattr(v, 'tolist') else v) for k, v in b.items()} for b in BOARDS]
json.dump(meta, open(f'{OUT}/cockpit360.json', 'w'), indent=1)
