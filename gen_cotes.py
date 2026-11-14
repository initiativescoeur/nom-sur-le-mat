"""Côtes détaillées pour la carte des parcours (zoom fort) : Natural Earth 10 m (domaine public),
découpées sur l'Atlantique nord-est (Bretagne, golfe de Gascogne, Manche, îles Britanniques),
projetées comme data/monde.json (Natural Earth I) → data/cotes.json.
Source : https://github.com/nvkelso/natural-earth-vector (geojson/ne_10m_land.geojson)
Usage : python3 gen_cotes.py chemin/ne_10m_land.geojson"""
import json, math, sys, os
from shapely.geometry import shape, box, Polygon, MultiPolygon
S = os.path.dirname(os.path.abspath(__file__))
W = json.load(open(os.path.join(S, 'data', 'monde.json'), encoding='utf-8'))['proj']
BOX = (-12.0, 41.0, 10.0, 60.0)
def proj(lon, lat):
    l, p = math.radians(lon), math.radians(lat); p2 = p * p; p4 = p2 * p2
    x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)))
    y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
    return x * W['S'] - W['x0'], -y * W['S'] - W['y0']
src = json.load(open(sys.argv[1], encoding='utf-8')); B = box(*BOX); parts = []
for f in src['features']:
    g = shape(f['geometry'])
    if not g.intersects(B): continue
    g = g.intersection(B).simplify(0.0025, preserve_topology=True)
    for poly in (g.geoms if hasattr(g, 'geoms') else [g]):
        if isinstance(poly, Polygon) and poly.area > 1e-6: parts.append(poly)
def ring(cs):
    pts = [proj(x, y) for x, y in cs]; out = []; last = None
    for x, y in pts:
        q = (round(x, 3), round(y, 3))
        if q != last: out.append(q); last = q
    return 'M' + 'L'.join(f'{x:g},{y:g}' for x, y in out) + 'Z' if len(out) > 2 else ''
d = ''.join(ring(p.exterior.coords) + ''.join(ring(i.coords) for i in p.interiors) for p in parts)
x0, y1 = proj(BOX[0], BOX[1]); x1, y0 = proj(BOX[2], BOX[3])
json.dump({'box': BOX, 'xy': [round(min(x0, proj(BOX[0], BOX[3])[0]), 3), round(y0, 3), round(max(x1, proj(BOX[2], BOX[1])[0]), 3), round(y1, 3)], 'path': d,
           'source': 'Natural Earth 10 m (domaine public)'}, open(os.path.join(S, 'data', 'cotes.json'), 'w', encoding='utf-8'), separators=(',', ':'))
print(len(parts), 'polygones,', round(len(d) / 1024), 'Ko')
