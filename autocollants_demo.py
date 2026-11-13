# Démo : complète quelques autocollants (mât et bandes du cockpit) et date leurs noms, pour montrer des autocollants déjà posés.
# Même découpage que app.js : mât = 40 rangs × 3 places par autocollant ; cockpit = bandes d'environ 120 places par portrait.
# À lancer depuis la racine du site, APRÈS cockpit_cells.py (qui régénère les donateurs fictifs du cockpit).
import json, random, datetime as dt
rnd = random.Random(2026)
m = json.load(open('data/mat.json')); d = json.load(open('data/donateurs.json'))
cols = d['cols']; R = d['rows']; I = {c: i for i, c in enumerate(cols)}
NR, NC, Z = m['NROWS'], m['COLS'], m['zones']; SROWS, BAND = 40, 120
enc = lambda f, row, c: (f * NR + row - 1) * NC + c
stk = []
for f in (0, 1):
    for z in Z:
        for k in range(-(-z['rows'] // SROWS)):
            r0 = z['first'] + k * SROWS; r1 = min(z['first'] + z['rows'], r0 + SROWS)
            stk.append(('mat', [enc(f, r, c) for r in range(r0, r1) for c in range(NC)]))
cells = m['cockpit']['cells']
for side in (0, 1):
    idx = sorted([i for i, q in enumerate(cells) if q[0] == side], key=lambda i: (cells[i][2], cells[i][1], i))
    lines = []
    for i in idx:
        if lines and cells[lines[-1][0]][2] == cells[i][2]: lines[-1].append(i)
        else: lines.append([i])
    bands = [[]]
    for ln in lines:
        bands[-1] += ln
        if len(bands[-1]) >= BAND: bands.append([])
    if not bands[-1]: bands.pop()
    if len(bands) > 1 and len(bands[-1]) < BAND / 2: bands[-2] += bands.pop()
    for b in bands: stk.append(('ck', b))
print('autocollants :', len(stk), '· mât', sum(1 for s in stk if s[0] == 'mat'), '· cockpit', sum(1 for s in stk if s[0] == 'ck'))
# qui occupe quoi
own_m, own_c = {}, {}
for j, r in enumerate(R):
    if r[I['ck']] >= 0: own_c[r[I['ck']]] = j
    elif r[I['slot']] >= 0:
        s = r[I['slot']]
        if r[I['perso']] >= 0:
            f, rr = s // (NR * NC), (s % (NR * NC)) // NC + 1
            for c in range(NC): own_m[enc(f, rr, c)] = j
        else: own_m[s] = j
first = [r[I['p']] for r in R if r[I['perso']] < 0]; last = [r[I['n']] for r in R if r[I['perso']] < 0]
vs = [r[I['v']] for r in R if r[I['v']] >= 0]; pals = [r[I['pal']] for r in R]; es = [r[I['e']] for r in R]
D0 = lambda s: dt.date.fromisoformat(s)
def iso(x): return x.isoformat()
def fill(n, a, b, kind):
    lo, hi = D0(a), D0(b); places = stk[n - 1][1]; own = own_m if kind == 'mat' else own_c
    taken = sorted({own[p] for p in places if p in own}); new = []
    for p in places:
        if p in own: continue
        row = [None] * len(cols); row[I['slot']] = p if kind == 'mat' else -1; row[I['ck']] = p if kind == 'ck' else -1
        row[I['p']] = rnd.choice(first); row[I['n']] = rnd.choice(last); row[I['v']] = rnd.choice(vs) if rnd.random() < .93 else -1
        row[I['pal']] = rnd.choice(pals); row[I['m']] = ''; row[I['perso']] = -1; row[I['e']] = rnd.choice(es); row[I['b']] = ''; row[I['r']] = -1
        new.append(row); own[p] = None
    rows = [R[j] for j in taken] + new; span = (hi - lo).days
    for r in rows: r[I['d']] = iso(lo + dt.timedelta(days=rnd.randint(0, span)))
    rnd.choice(rows)[I['d']] = b
    print(f'n°{n:>3} ({kind}) : {len(taken)} noms redatés + {len(new)} ajoutés · complet le {b}')
    return new
PLAN_M = [(1, '2026-09-01', '2026-09-04'), (30, '2026-09-01', '2026-09-10'), (2, '2026-09-04', '2026-10-06'), (31, '2026-09-10', '2026-10-14'), (3, '2026-10-06', '2026-10-27'), (32, '2026-10-14', '2026-11-09')]
nm = sum(1 for s in stk if s[0] == 'mat'); ckA = nm + 1; ckY = nm + 1 + sum(1 for s in stk[nm:] if s[1] and cells[s[1][0]][0] == 0)
PLAN_C = [(ckA, '2026-09-15', '2026-10-03'), (ckA + 1, '2026-10-01', '2026-10-20'), (ckY, '2026-10-05', '2026-11-02')]
gen = m['cockpit'].get('gen', 0); cut = len(R) - gen
newm = [x for n, a, b in PLAN_M for x in fill(n, a, b, 'mat')]
newc = [x for n, a, b in PLAN_C for x in fill(n, a, b, 'ck')]
R[cut:cut] = newm; R.extend(newc); m['cockpit']['gen'] = gen + len(newc)
json.dump(d, open('data/donateurs.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(m, open('data/mat.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('donateurs :', len(R))
