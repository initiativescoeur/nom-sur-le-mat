# Programme du bateau et traces des parcours (démo) → data/voyages.json
# Les étapes passées de 2026 suivent les faits publics (dates) ; les traces et les distances sont simulées.
# 2027-2028 : programme prévisionnel simulé, à remplacer par le vrai programme et les vraies traces (GéoVoile / Hatch.io).
import json, math, random, sys
OUT = sys.argv[1] if len(sys.argv) > 1 else 'data/voyages.json'
R = 6371.0
def hav(a, b):
    (lo1, la1), (lo2, la2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2); dp = p2 - p1; dl = math.radians(lo2 - lo1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1, math.sqrt(h)))
def unwrap(pts):
    out = [list(pts[0])]
    for lo, la in pts[1:]:
        while lo - out[-1][0] > 180: lo -= 360
        while lo - out[-1][0] < -180: lo += 360
        out.append([lo, la])
    return out
def dens(pts, step):                      # points intermédiaires (interpolation linéaire en lon/lat, sur la longitude déroulée)
    pts = unwrap(pts); out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(hav(a, b) / step))
        for i in range(1, n + 1): t = i / n; out.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    return out
def wobble(pts, amp, per, seed):          # petits louvoiements / options de routage, nuls aux extrémités
    rnd = random.Random(seed); ph1, ph2 = rnd.random() * 6.28, rnd.random() * 6.28; n = len(pts); out = []
    for i, (lo, la) in enumerate(pts):
        if 0 < i < n - 1:
            a, b = pts[i - 1], pts[i + 1]; dx, dy = (b[0] - a[0]) * math.cos(math.radians(la)), b[1] - a[1]; L = math.hypot(dx, dy) or 1
            nx, ny = -dy / L, dx / L; env = math.sin(math.pi * i / (n - 1)); t = i / n
            o = amp * env * (math.sin(t * per * 6.283 + ph1) + 0.45 * math.sin(t * per * 15.7 + ph2))
            lo += nx * o / max(0.2, math.cos(math.radians(la))); la += ny * o
        out.append([lo, la])
    return out
def wrapo(pts): return [[round(((lo + 180) % 360) - 180, 3 if -7 < lo < 2 and 45 < la < 52 else 2), round(la, 3 if -7 < lo < 2 and 45 < la < 52 else 2)] for lo, la in pts]
def km(pts): return sum(hav(a, b) for a, b in zip(unwrap(pts), unwrap(pts)[1:]))

P = dict(lorient=[-3.37, 47.72], groix=[-3.45, 47.66], plf=[-3.97, 47.88], sables=[-1.80, 46.48], stmalo=[-2.03, 48.66], roscoff=[-3.97, 48.73],
         havre=[0.08, 49.48], fdf=[-61.07, 14.60], ny=[-74.02, 40.62], cowes=[-1.30, 50.77], cherbourg=[-1.62, 49.66])
OUT_LOR = [[-3.42, 47.67], [-3.62, 47.60]]                    # sortie de Lorient par le sud de Groix
CHENAL_LOR = [[-3.368, 47.704], [-3.372, 47.69]]            # le chenal entre Port-Louis et Larmor-Plage
POINTE_BZH = [[-4.45, 47.70], [-4.95, 47.95], [-5.25, 48.30], [-5.25, 48.62]]   # Penmarc'h, Raz de Sein, Ouessant
NORD_BZH = [[-4.60, 48.85], [-3.55, 48.95], [-2.70, 48.85], [-2.30, 48.75]]   # nord Finistère, Sept-Îles, Fréhel
# ---------- pas de trace sur la terre : près des côtes (Bretagne, golfe de Gascogne, Manche), chaque tronçon qui coupe
# la terre (Natural Earth 10 m, avec une marge d'environ 600 m) est remplacé par le plus court chemin en mer (grille de 0,01°)
import os, heapq
LAND = os.environ.get('NE_LAND', '/tmp/ne/ne_10m_land.geojson'); GB = (-6.8, 45.6, 1.2, 51.2); GS = 0.005
SEA = None
if os.path.exists(LAND):
    from shapely.geometry import shape, box, Point, LineString
    from shapely.prepared import prep
    import numpy as np
    land = [shape(f['geometry']) for f in json.load(open(LAND))['features']]; B = box(*GB)
    land = [g.intersection(B) for g in land if g.intersects(B)]
    from shapely.ops import unary_union
    LANDU = unary_union(land).buffer(0.003); LP = prep(LANDU)
    nx, ny = int((GB[2] - GB[0]) / GS), int((GB[3] - GB[1]) / GS)
    from shapely import contains_xy
    xs, ys = np.meshgrid(GB[0] + (np.arange(nx) + .5) * GS, GB[1] + (np.arange(ny) + .5) * GS)
    SEA = ~contains_xy(LANDU, xs, ys)
def cell(p): return int((p[0] - GB[0]) / GS), int((p[1] - GB[1]) / GS)
def inbox(p): return GB[0] + GS < p[0] < GB[2] - GS and GB[1] + GS < p[1] < GB[3] - GS
def nearest_sea(c):
    for r in range(0, 40):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                x, y = c[0] + dx, c[1] + dy
                if 0 <= y < SEA.shape[0] and 0 <= x < SEA.shape[1] and SEA[y, x]: return (x, y)
    return c
def astar(a, b):
    a, b = nearest_sea(cell(a)), nearest_sea(cell(b)); H = lambda c: math.hypot((c[0] - b[0]) * 0.68, c[1] - b[1])
    openq = [(H(a), 0, a)]; g = {a: 0}; came = {}
    while openq:
        f, gc, c = heapq.heappop(openq)
        if c == b: break
        if gc > g.get(c, 1e18): continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            n = (c[0] + dx, c[1] + dy)
            if not (0 <= n[1] < SEA.shape[0] and 0 <= n[0] < SEA.shape[1]) or not SEA[n[1], n[0]]: continue
            ng = gc + math.hypot(dx * 0.68, dy)
            if ng < g.get(n, 1e18): g[n] = ng; came[n] = c; heapq.heappush(openq, (ng + H(n), ng, n))
    path = [b]
    while path[-1] in came: path.append(came[path[-1]])
    pts = [[GB[0] + (x + .5) * GS, GB[1] + (y + .5) * GS] for x, y in reversed(path)]
    out = [pts[0]]; i = 0                                  # on simplifie : la ligne droite la plus longue qui reste en mer
    while i < len(pts) - 1:
        j = len(pts) - 1
        while j > i + 1 and LP.intersects(LineString([pts[i], pts[j]])): j -= 1
        out.append(pts[j]); i = j
    return out
def seaify(pts):
    if SEA is None: return pts
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        if inbox(a) and inbox(b) and LP.intersects(LineString([a, b])):
            m = astar(a, b); out += m[1:-1] if len(m) > 2 else []
        out.append(b)
    return out
def route(wp, step=25, amp=0.0, per=3, seed=1): return wrapo(seaify(wobble(dens(wp, step), amp, per, seed) if amp else dens(wp, step)))

S = []
def nav(id, titre, type_, du, au, wp, de, a, reel=False, note='', step=25, amp=0.0, per=3, seed=1, km_force=None):
    tr = route(wp, step, amp, per, seed); k = km_force or km(tr)
    S.append(dict(id=id, titre=titre, type=type_, du=du, au=au, de=de, a=a, km=round(k), reel=reel, note=note, trace=tr))
def port(id, titre, type_, du, au, lieu, xy, reel=False, note='', pose=True, km_=0, trace=None):
    d = dict(id=id, titre=titre, type=type_, du=du, au=au, lieu=lieu, xy=xy, pose=pose, km=km_, reel=reel, note=note)
    if trace: d['trace'] = trace
    S.append(d)

# ---------- saison 2026 (avant et pendant la campagne « Ton nom sur le mât »)
port('lor-printemps', 'Base de Lorient', 'escale', '2026-03-24', '2026-04-29', 'Lorient', P['lorient'], reel=True, note='Remise à l\'eau du bateau, premières navigations')
nav('conv-plf', 'Convoyage vers Port-la-Forêt', 'convoyage', '2026-04-29', '2026-04-30', [P['lorient']] + CHENAL_LOR + OUT_LOR + [[-3.95, 47.70], [-3.98, 47.80], P['plf']], 'Lorient', 'Port-la-Forêt')
nav('1000race', '1000 Race', 'course', '2026-05-03', '2026-05-08', [P['plf'], [-4.05, 47.70], [-5.6, 47.2], [-9.6, 45.6], [-11.6, 47.6], [-10.6, 50.6], [-7.0, 49.6], [-5.6, 48.3], [-4.6, 47.75], P['plf']],
    'Port-la-Forêt', 'Port-la-Forêt', reel=True, note='Boucle de 1 000 milles dans le golfe de Gascogne et en mer Celtique', amp=0.25, per=4, seed=3)
nav('conv-plf-lor', 'Convoyage vers Lorient', 'convoyage', '2026-05-08', '2026-05-09', [P['plf'], [-3.98, 47.80], [-3.95, 47.70], OUT_LOR[1], OUT_LOR[0], *CHENAL_LOR[::-1], P['lorient']], 'Port-la-Forêt', 'Lorient')
port('lor-mai', 'Base de Lorient', 'escale', '2026-05-09', '2026-06-04', 'Lorient', P['lorient'], reel=True)
nav('conv-lor-sables', 'Convoyage vers Les Sables-d\'Olonne', 'convoyage', '2026-06-04', '2026-06-05', [P['lorient'], *CHENAL_LOR, OUT_LOR[0], OUT_LOR[1], [-3.3, 47.2], [-2.6, 46.3], P['sables']], 'Lorient', 'Les Sables-d\'Olonne')
nav('vendee-arctique', 'Vendée Arctique', 'course', '2026-06-07', '2026-06-16', [P['sables'], [-2.6, 46.2], [-7.0, 47.6], [-11.5, 52.8], [-12.8, 58.6], [-11.0, 63.6], [-10.0, 66.75], [-13.0, 66.75], [-14.5, 62.5], [-13.2, 56.0], [-9.0, 48.6], [-2.6, 46.25], P['sables']],
    'Les Sables-d\'Olonne', 'Les Sables-d\'Olonne', reel=True, note='Boucle au-delà du cercle polaire · 3e place · 2 668 milles parcourus', amp=0.3, per=5, seed=4, km_force=4941)
nav('conv-sables-0', 'x', 'x', '2026-01-01', '2026-01-01', [[0,0],[0,0]], '', '')
nav('conv-sables-lor', 'Convoyage vers Lorient', 'convoyage', '2026-06-17', '2026-06-18', [P['sables'], [-2.6, 46.3], [-3.3, 47.2], OUT_LOR[1], OUT_LOR[0], *CHENAL_LOR[::-1], P['lorient']], 'Les Sables-d\'Olonne', 'Lorient')
port('lor-ete', 'Base de Lorient', 'escale', '2026-06-18', '2026-09-19', 'Lorient', P['lorient'], reel=True, note='Préparation de la Route du Rhum, sorties d\'entraînement')
nav('defi-azimut-26', 'Défi Azimut · 48 Heures Azimut', 'course', '2026-09-19', '2026-09-21', [P['lorient'], *CHENAL_LOR, OUT_LOR[0], [-3.6, 47.45], [-4.6, 47.1], [-6.6, 46.5], [-7.4, 47.6], [-5.9, 48.0], [-4.3, 47.55], [-3.5, 47.62], OUT_LOR[0], *CHENAL_LOR[::-1], P['lorient']],
    'Lorient', 'Lorient', reel=True, note='Autour de Groix et au large de la Bretagne sud', amp=0.15, per=3, seed=5)
port('lor-sept', 'Base de Lorient', 'escale', '2026-09-21', '2026-10-16', 'Lorient', P['lorient'], reel=True, note='Derniers réglages avant la Route du Rhum')
nav('conv-stmalo', 'Convoyage vers Saint-Malo', 'convoyage', '2026-10-16', '2026-10-18', [P['lorient']] + CHENAL_LOR + OUT_LOR + POINTE_BZH + NORD_BZH + [[-2.10, 48.70], P['stmalo']], 'Lorient', 'Saint-Malo')
port('village-rhum', 'Village de la Route du Rhum', 'escale', '2026-10-18', '2026-11-01', 'Saint-Malo', P['stmalo'], reel=True, note='Le bateau à quai, au milieu du public')
nav('rdr-2026', 'Route du Rhum – Destination Guadeloupe', 'course', '2026-11-01', '2026-11-02', [P['stmalo'], [-2.10, 48.72], [-2.45, 48.80], [-2.95, 48.98], [-3.60, 48.92], [-3.97, 48.78], P['roscoff']],
    'Saint-Malo', 'Roscoff', reel=True, note='Collision avec un autre concurrent quelques heures après le départ, escale à Roscoff')
nav('roscoff-lor', 'Retour vers Lorient pour réparer', 'convoyage', '2026-11-02', '2026-11-04', [P['roscoff'], [-4.30, 48.82], [-4.85, 48.72], [-5.20, 48.45], [-4.95, 47.98], [-4.45, 47.70], OUT_LOR[1], OUT_LOR[0], *CHENAL_LOR[::-1], P['lorient']],
    'Roscoff', 'Lorient', reel=True, note='Abandon annoncé le 6 novembre, après expertise des dégâts')
# ---------- programme prévisionnel 2027-2028 (simulé)
port('lor-hiver-26', 'Chantier d\'hiver à Lorient', 'chantier', '2026-11-04', '2027-04-30', 'Lorient', P['lorient'], note='Réparations et chantier d\'hiver')
port('entrain-27', 'Entraînements au large de Lorient', 'entrainement', '2027-04-30', '2027-07-20', 'Lorient', P['lorient'], km_=1600,
     trace=route([P['lorient'], *CHENAL_LOR, OUT_LOR[0], [-3.9, 47.35], [-4.9, 47.0], [-4.6, 47.7], [-3.3, 47.3], [-3.0, 47.45], OUT_LOR[0], *CHENAL_LOR[::-1], P['lorient']], 15))
nav('conv-cowes', 'Convoyage vers Cowes', 'convoyage', '2027-07-20', '2027-07-23', [P['lorient']] + CHENAL_LOR + OUT_LOR + POINTE_BZH + [[-4.5, 49.3], [-2.5, 50.2], [-1.6, 50.62], P['cowes']], 'Lorient', 'Cowes (Angleterre)')
port('cowes', 'Escale à Cowes', 'escale', '2027-07-23', '2027-07-31', 'Cowes', P['cowes'], pose=False)
nav('fastnet-27', 'Rolex Fastnet Race', 'course', '2027-07-31', '2027-08-03', [P['cowes'], [-1.6, 50.62], [-3.5, 50.2], [-5.6, 49.95], [-9.60, 51.30], [-9.60, 51.45], [-6.2, 50.0], [-3.0, 49.85], [-1.9, 49.75], P['cherbourg']],
    'Cowes', 'Cherbourg', note='En équipage', amp=0.12, per=3, seed=7)
nav('conv-cherbourg', 'Convoyage vers Lorient', 'convoyage', '2027-08-04', '2027-08-06', [P['cherbourg'], [-2.5, 49.85], [-4.6, 49.0], [-5.25, 48.62], [-5.25, 48.30], [-4.95, 47.95], [-4.45, 47.70], OUT_LOR[1], OUT_LOR[0], *CHENAL_LOR[::-1], P['lorient']], 'Cherbourg', 'Lorient')
port('lor-sept-27', 'Base de Lorient', 'escale', '2027-08-06', '2027-09-17', 'Lorient', P['lorient'])
nav('defi-azimut-27', 'Défi Azimut · 48 Heures Azimut', 'course', '2027-09-17', '2027-09-19', [P['lorient'], *CHENAL_LOR, OUT_LOR[0], [-4.1, 47.3], [-6.0, 46.4], [-7.6, 47.2], [-6.2, 48.05], [-4.4, 47.5], [-3.5, 47.62], OUT_LOR[0], *CHENAL_LOR[::-1], P['lorient']],
    'Lorient', 'Lorient', amp=0.15, per=3, seed=8)
port('lor-oct-27', 'Base de Lorient', 'escale', '2027-09-19', '2027-10-08', 'Lorient', P['lorient'])
nav('conv-havre', 'Convoyage vers Le Havre', 'convoyage', '2027-10-08', '2027-10-10', [P['lorient']] + CHENAL_LOR + OUT_LOR + POINTE_BZH + [[-4.6, 49.2], [-2.0, 49.75], [-0.6, 49.75], P['havre']], 'Lorient', 'Le Havre')
port('village-tcl', 'Village de la Transat Café L\'Or', 'escale', '2027-10-10', '2027-10-24', 'Le Havre', P['havre'])
nav('tcl-27', 'Transat Café L\'Or', 'course', '2027-10-24', '2027-11-08', [P['havre'], [-0.6, 49.75], [-2.5, 49.75], [-5.6, 48.75], [-10.8, 44.0], [-14.5, 37.0], [-19.5, 29.0], [-24.5, 21.0], [-33.0, 16.0], [-47.0, 14.2], [-58.5, 14.4], [-60.9, 14.45], P['fdf']],
    'Le Havre', 'Fort-de-France (Martinique)', note='En double', amp=0.6, per=5, seed=9, step=40)
port('fdf-27', 'Escale en Martinique', 'escale', '2027-11-08', '2027-11-26', 'Fort-de-France', P['fdf'])
nav('retour-27', 'Retour transatlantique vers Lorient', 'convoyage', '2027-11-26', '2027-12-11', [P['fdf'], [-58.0, 17.5], [-52.0, 26.0], [-42.0, 34.0], [-30.0, 39.0], [-18.0, 44.5], [-8.5, 46.9], OUT_LOR[1], OUT_LOR[0], *CHENAL_LOR[::-1], P['lorient']],
    'Fort-de-France', 'Lorient', amp=0.5, per=4, seed=10, step=40)
port('lor-hiver-27', 'Chantier d\'hiver à Lorient', 'chantier', '2027-12-11', '2028-04-26', 'Lorient', P['lorient'])
nav('transat-28', 'The Transat CIC', 'course', '2028-04-26', '2028-05-09', [P['lorient'], *CHENAL_LOR, OUT_LOR[0], [-6.0, 47.8], [-14.0, 49.0], [-25.0, 49.5], [-37.0, 47.0], [-48.0, 43.5], [-58.0, 41.3], [-68.0, 40.2], [-73.8, 40.4], P['ny']],
    'Lorient', 'New York', note='En solitaire, course qualificative pour le Vendée Globe', amp=0.6, per=5, seed=11, step=40)
port('ny-28', 'Escale à New York', 'escale', '2028-05-09', '2028-05-29', 'New York', P['ny'], pose=False)
nav('nyv-28', 'New York Vendée – Les Sables-d\'Olonne', 'course', '2028-05-29', '2028-06-09', [P['ny'], [-73.6, 40.35], [-66.0, 40.6], [-52.0, 42.5], [-38.0, 44.8], [-24.0, 46.0], [-12.0, 46.3], [-2.6, 46.3], P['sables']],
    'New York', 'Les Sables-d\'Olonne', note='En solitaire', amp=0.6, per=5, seed=12, step=40)
nav('conv-sables-28', 'Convoyage vers Lorient', 'convoyage', '2028-06-11', '2028-06-12', [P['sables'], [-2.6, 46.3], [-3.3, 47.2], OUT_LOR[1], OUT_LOR[0], *CHENAL_LOR[::-1], P['lorient']], 'Les Sables-d\'Olonne', 'Lorient')
port('lor-ete-28', 'Préparation du Vendée Globe à Lorient', 'escale', '2028-06-12', '2028-10-10', 'Lorient', P['lorient'])
nav('conv-vg', 'Convoyage vers Les Sables-d\'Olonne', 'convoyage', '2028-10-10', '2028-10-11', [P['lorient'], *CHENAL_LOR, OUT_LOR[0], OUT_LOR[1], [-3.3, 47.2], [-2.6, 46.3], P['sables']], 'Lorient', 'Les Sables-d\'Olonne')
port('village-vg', 'Village du Vendée Globe', 'escale', '2028-10-11', '2028-11-05', 'Les Sables-d\'Olonne', P['sables'])
VG = [P['sables'], [-2.6, 46.2], [-9.5, 43.5], [-15.0, 34.0], [-21.0, 24.0], [-26.0, 14.0], [-28.0, 4.0], [-30.0, -6.0], [-31.0, -18.0], [-26.0, -30.0], [-12.0, -38.0], [5.0, -42.0],
      [20.0, -44.0], [40.0, -46.0], [60.0, -47.5], [80.0, -48.0], [100.0, -47.5], [115.0, -46.5], [130.0, -48.0], [150.0, -50.0], [170.0, -52.5], [190.0, -55.0], [210.0, -57.0], [240.0, -57.5],
      [270.0, -57.5], [292.7, -56.5], [297.0, -53.0], [305.0, -45.0], [313.0, -33.0], [326.0, -20.0], [331.0, -6.0], [327.0, 6.0], [323.0, 18.0], [324.0, 28.0], [330.0, 36.0], [341.0, 43.0], [354.5, 46.3], [358.2, 46.48]]
nav('vg-28', 'Vendée Globe', 'course', '2028-11-05', '2029-02-18', VG, 'Les Sables-d\'Olonne', 'Les Sables-d\'Olonne', note='Le tour du monde en solitaire, sans escale et sans assistance', amp=0.45, per=11, seed=13, step=60, km_force=45000)
S[:] = [s for s in S if s['id'] != 'conv-sables-0']
LIEUXY = {'Port-la-Forêt': P['plf'], "Les Sables-d'Olonne": P['sables'], 'Cherbourg': P['cherbourg'], 'Lorient': P['lorient']}
i = 0
while i < len(S) - 1:
    a, b = S[i], S[i + 1]
    if a['au'] < b['du']:
        lieu = a.get('a') or a.get('lieu'); S.insert(i + 1, dict(id='port-' + a['id'], titre=('Escale aux ' + lieu[4:] if lieu.startswith('Les ') else 'Escale à ' + lieu) if lieu != 'Lorient' else 'Base de Lorient', type='escale', du=a['au'], au=b['du'], lieu=lieu, xy=LIEUXY.get(lieu, a.get('xy') or a['trace'][-1]), pose=True, km=0, reel=a['reel'], note=''))
    i += 1
for s in S: assert s['du'] <= s['au'], s['id']
for a, b in zip(S, S[1:]): assert a['au'] <= b['du'], (a['id'], b['id'])
data = dict(note='Démo : traces et distances simulées. Les dates passées de 2026 suivent les faits publics ; le programme 2027-2028 est prévisionnel et simulé.',
            delai_impression_jours=10, segments=S)
json.dump(data, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
for s in S: print(f"{s['du']} → {s['au']}  {s['km']:>6} km  {len(s.get('trace', []))} pts  {s['titre']}")
