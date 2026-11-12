/* Votre nom sur le mât — Initiatives-Cœur
   Mât 3D interactif (modèle réel du bateau), plan des places, parcours de don, base de la générosité. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const app = $('app'), stage = $('stage'), canvas = $('gl');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 860px)').matches;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt1 = x => x.toFixed(1).replace('.', ',');
const fmtM = h => fmt1(h) + ' m';
const nf = n => Math.round(n).toLocaleString('fr-FR');
const plural = (n, s, p) => nf(n) + ' ' + (n > 1 ? p : s);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let dirty = true, spotSlot = -1, spotWhole = false, hoverSlot = -1, dragging = false;
const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fdate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MOIS[m - 1]} ${y}`; };

const [MAT, DON, PERS, CTP, CFG, GEO, ENF, WORLD] = await Promise.all(
  ['mat', 'donateurs', 'personnalites', 'contreparties', 'config', 'geo', 'enfants', 'monde'].map(n => getJSON('data/' + n + '.json')));
// les fiches des personnalités peuvent être complétées sans reconstruire le site (data/personnalites.json + dossier personnalites/)

/* =====================================================================  places et donateurs */
const NR = MAT.NROWS, NC = MAT.COLS, NS = MAT.NSLOTS, Z = MAT.zones, PITCH = MAT.PITCH, CAP = MAT.CAP;
const FACEN = ['Tribord', 'Bâbord'], COLN = ['A', 'B', 'C'];
const enc = (f, row, c) => (f * NR + row - 1) * NC + c;
const dec = s => { const f = Math.floor(s / (NR * NC)), r = s % (NR * NC); return { f, row: Math.floor(r / NC) + 1, col: r % NC }; };
function rowS(row) { for (const z of Z) if (row >= z.first && row < z.first + z.rows) return z.s0 + CAP + (row - z.first + .5) * PITCH; return NaN; }
function rowAt(s) { for (const z of Z) { const k = Math.floor((s - z.s0 - CAP) / PITCH); if (k >= 0 && k < z.rows) return z.first + k; } return 0; }
const hOf = s => s * MAT.A[1];                       // hauteur au-dessus du pont (le mât est incliné de 6°)
const slotLabel = sl => { const { f, row, col } = dec(sl); return `${FACEN[f]} · rang ${row} · place ${COLN[col]}`; };

const VILLES = DON.villes, DEPS = DON.deps;
const owner = new Int32Array(NS).fill(-1);
const D = DON.rows.map((r, i) => { const o = { i }; DON.cols.forEach((c, k) => o[c] = r[k]); return o; });
function occupy(o) {
  if (o.perso >= 0) { const { f, row } = dec(o.slot); for (let c = 0; c < NC; c++) owner[enc(f, row, c)] = o.i; }
  else owner[o.slot] = o.i;
}
D.forEach(occupy);
const LOCAL_KEY = 'nom-sur-le-mat-dons';
try { (JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')).forEach(o => { if (owner[o.slot] < 0) { o.i = D.length; o.local = true; D.push(o); occupy(o); } }); } catch (e) {}

const norm = s => (s || '').replace(/œ/g, 'oe').replace(/Œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD')
  .replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
let byKey, bySlug;
function reindex() {
  byKey = new Map();
  D.forEach(o => { const k = norm(o.p + ' ' + o.n); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(o); });
  byKey.forEach(list => list.sort((a, b) => a.slot - b.slot).forEach((o, j) => { o.slug = norm(o.p + ' ' + o.n).replace(/ /g, '-') + (j ? '-' + (j + 1) : ''); o.dup = list.length; }));
  bySlug = new Map(D.map(o => [o.slug, o]));
}
reindex();
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; }
  return prev[n];
}
function search(p, n) {
  const q = norm(p + ' ' + n), q2 = norm(n + ' ' + p);
  if (byKey.has(q)) return { hits: byKey.get(q) };
  if (byKey.has(q2)) return { hits: byKey.get(q2) };
  const sims = [];
  byKey.forEach((list, k) => { const d = Math.min(lev(q, k), lev(q2, k)); const s = 1 - d / Math.max(q.length, k.length); if (s >= .78) sims.push([s, list[0]]); });
  sims.sort((a, b) => b[0] - a[0]);
  return { hits: [], close: sims.slice(0, 3).map(s => s[1]) };
}
const freeCount = () => { let n = 0; for (let i = 0; i < NS; i++) if (owner[i] < 0) n++; return n; };

/* =====================================================================  géométrie du mât */
const V3 = a => new THREE.Vector3(a[0], a[1], a[2]);
const B = V3(MAT.B), AX = V3(MAT.A), CH = V3(MAT.C), XS = V3(MAT.X);
const HC = MAT.HALF.map(p => p[0]), HA = MAT.HALF.map(p => p[1]);
const kc = s => 1 - (1 - MAT.KC_TOP) * clamp(s / MAT.L, 0, 1.2);
const kt = s => 1 - (1 - MAT.KT_TOP) * clamp(s / MAT.L, 0, 1.2);
function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0]; const n = xs.length; if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  return ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo]);
}
function arcTab(s) {
  const k1 = kc(s), k2 = kt(s), c = HC.map(v => v * k1), a = HA.map(v => v * k2), seg = [0];
  for (let i = 1; i < c.length; i++) seg.push(seg[i - 1] + Math.hypot(c[i] - c[i - 1], a[i] - a[i - 1]));
  return { c, a, seg, a0: interp(MAT.C0 * k1, c, seg) };
}
const zoneW = s => MAT.ZONE_W0 * kc(s);
const TEXW = MAT.ZONE_W0 + 0.012;
const _n = new THREE.Vector3();
function surf(f, s, sig, off = 0, T = arcTab(s)) {
  const arc = T.a0 - sig, c = interp(arc, T.seg, T.c), a = interp(arc, T.seg, T.a);
  const dc = interp(arc + 1e-3, T.seg, T.c) - interp(arc - 1e-3, T.seg, T.c), da = interp(arc + 1e-3, T.seg, T.a) - interp(arc - 1e-3, T.seg, T.a);
  let nc = -da, na = dc; const L = Math.hypot(nc, na) || 1; nc /= L; na /= L;
  const sg = f === 0 ? 1 : -1;
  const N = CH.clone().multiplyScalar(nc).addScaledVector(XS, sg * na);
  const P = B.clone().addScaledVector(AX, s).addScaledVector(CH, c).addScaledVector(XS, sg * a).addScaledVector(N, off);
  return { P, N };
}
function profileRing(s) {           // profil complet (tribord de l'arrière vers l'avant, puis bâbord)
  const k1 = kc(s), k2 = kt(s), out = [];
  for (let i = 0; i < HC.length; i++) out.push([HC[i] * k1, HA[i] * k2]);
  for (let i = HC.length - 2; i > 0; i--) out.push([HC[i] * k1, -HA[i] * k2]);
  return out;
}
function radiusAt(s, th) {           // distance de l'axe à la surface dans la direction th (0 = tribord, π/2 = avant)
  const dc = Math.sin(th), da = Math.cos(th), ring = profileRing(s); let best = 0.14;
  for (let i = 0; i < ring.length; i++) {
    const [c1, a1] = ring[i], [c2, a2] = ring[(i + 1) % ring.length];
    const ex = c2 - c1, ey = a2 - a1, det = dc * (-ey) - da * (-ex);
    if (Math.abs(det) < 1e-9) continue;
    const t = (c1 * (-ey) - a1 * (-ex)) / det, u = (dc * a1 - da * c1) / det;
    if (t > 0 && u >= 0 && u <= 1) { best = t; break; }
  }
  return best;
}
function orient(g) {
  const p = g.attributes.position, n = g.attributes.normal, ix = g.index.array;
  const a = new THREE.Vector3().fromBufferAttribute(p, ix[0]), b = new THREE.Vector3().fromBufferAttribute(p, ix[1]), c = new THREE.Vector3().fromBufferAttribute(p, ix[2]);
  const gn = b.sub(a).cross(c.sub(a)); const vn = new THREE.Vector3().fromBufferAttribute(n, ix[0]);
  if (gn.dot(vn) < 0) for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  return g;
}
function gridGeom(P, N, UV, nr, nc) {
  const g = new THREE.BufferGeometry(), idx = [];
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    const a = i * nc + j, b = a + 1, c = a + nc, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  if (UV) g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(idx);
  return orient(g);
}

/* =====================================================================  scène */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.03, 20000);
const sunDir = new THREE.Vector3(0.62, 0.56, 0.55).normalize();
const tl = new THREE.TextureLoader();
const skyTex = await tl.loadAsync('assets/sky.jpg'); skyTex.colorSpace = THREE.SRGBColorSpace;
const mkDome = () => { const m = new THREE.Mesh(new THREE.SphereGeometry(9000, 64, 32), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, toneMapped: false })); m.renderOrder = -1; return m; };
scene.add(mkDome());
const envScene = new THREE.Scene(); envScene.add(mkDome());
const envSea = new THREE.Mesh(new THREE.CircleGeometry(5000, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x123f60, toneMapped: false }));
envSea.position.y = -2; envScene.add(envSea);
const cubeRT = new THREE.WebGLCubeRenderTarget(128); const cubeCam = new THREE.CubeCamera(0.5, 20000, cubeRT); cubeCam.position.set(0, 15, 0); cubeCam.update(renderer, envScene);
const ENV = cubeRT.texture;
const sun = new THREE.DirectionalLight(0xfff4e6, 2.5); sun.position.copy(sunDir).multiplyScalar(50); scene.add(sun);
const fill = new THREE.DirectionalLight(0xdfe9ff, 1.1); fill.position.set(-35, 22, 10); scene.add(fill);
scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x2a4a64, 1.15)); scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const wn = await tl.loadAsync('assets/waternormals.png'); wn.wrapS = wn.wrapT = THREE.RepeatWrapping;
const seaMat = new THREE.ShaderMaterial({
  uniforms: { nmap: { value: wn }, env: { value: ENV }, time: { value: 0 }, sunDir: { value: sunDir }, deep: { value: new THREE.Color(0x0a3a5e) }, camPos: { value: new THREE.Vector3() } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform sampler2D nmap; uniform samplerCube env; uniform float time; uniform vec3 sunDir, deep, camPos; varying vec3 vW;
    vec3 nrm(vec2 p){ vec3 a = texture2D(nmap, p*0.045 + vec2(time*0.011, time*0.007)).xzy*2.-1.;
      vec3 b = texture2D(nmap, p*0.11 + vec2(-time*0.013, time*0.017)).xzy*2.-1.;
      vec3 c = texture2D(nmap, p*0.012 + vec2(time*0.004, -time*0.003)).xzy*2.-1.;
      return normalize(a + b*0.6 + c*1.2 + vec3(0., 2.2, 0.)); }
    void main(){ vec3 V = normalize(camPos - vW); float d = length(camPos - vW);
      vec3 N = normalize(mix(nrm(vW.xz), vec3(0.,1.,0.), clamp(d/2500., 0., .85)));
      vec3 R = reflect(-V, N); R.y = abs(R.y);
      float fr = 0.02 + 0.6 * pow(1. - max(dot(N, V), 0.), 5.);
      vec3 col = mix(deep * (0.65 + 0.35 * max(dot(N, sunDir), 0.)), textureCube(env, R).rgb * 0.85, fr) + vec3(1., .95, .85) * pow(max(dot(R, sunDir), 0.), 220.) * 7.;
      gl_FragColor = vec4(col, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
const water = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), seaMat); water.position.y = 0.45; scene.add(water);

const rig = new THREE.Group(); scene.add(rig);
const boat = new THREE.Group(); rig.add(boat); rig.add(camera);

// --- modèle du bateau (visite virtuelle) : on retire le fût d'origine (très simplifié) et on pose le mât lissé
let gltf;
try { gltf = await new GLTFLoader().loadAsync('assets/imoca.glb', ev => { if (ev.total) $('loading').querySelector('span').textContent = `Le bateau arrive au ponton… ${Math.round(ev.loaded / ev.total * 100)} %`; }); }
catch (e) {   // hébergeurs qui refusent le format .glb : copie du modèle encodée dans un module JavaScript
  const b64 = (await import('./assets/imoca-glb.js')).default, bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  gltf = await new GLTFLoader().parseAsync(bin.buffer, '');
}
gltf.scene.updateMatrixWorld(true);
gltf.scene.traverse(o => {
  if (!o.isMesh || !o.material || o.material.name !== 'casquette.001') return;
  const g = o.geometry, pos = g.attributes.position, idx = g.index.array, keep = [], v = new THREE.Vector3(), ys = [0, 0, 0];
  for (let i = 0; i < idx.length; i += 3) {
    for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx[i + k]).applyMatrix4(o.matrixWorld); ys[k] = v.y; }
    if (Math.max(...ys) - Math.min(...ys) > 20) continue; keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  g.setIndex(keep);
});
boat.add(gltf.scene);

const paint = new THREE.MeshPhongMaterial({ color: 0xeef1f4, specular: 0x6a6a6a, shininess: 70, envMap: ENV, reflectivity: 0.10, combine: THREE.MixOperation });
{
  const ss = []; for (let s = -0.35; s < MAT.L; s += 0.5) ss.push(s); ss.push(MAT.L);
  const P = [], N = []; let nc = 0;
  for (const s of ss) {
    const ring = profileRing(s); ring.push(ring[0]); nc = ring.length;
    for (let i = 0; i < ring.length; i++) {
      const [c, a] = ring[i], [c2, a2] = ring[(i + 1) % (ring.length - 1)], [c0, a0] = ring[(i - 1 + ring.length - 1) % (ring.length - 1)];
      let tn = [c2 - c0, a2 - a0], nn = [-tn[1], tn[0]]; if (nn[0] * c + nn[1] * a < 0) nn = [-nn[0], -nn[1]]; const L = Math.hypot(...nn) || 1;
      const p = B.clone().addScaledVector(AX, s).addScaledVector(CH, c).addScaledVector(XS, a), n = CH.clone().multiplyScalar(nn[0] / L).addScaledVector(XS, nn[1] / L);
      P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z);
    }
  }
  boat.add(new THREE.Mesh(gridGeom(P, N, null, ss.length, nc), paint));
}
// ferrures de haubans (deux flancs) et tête de mât
const carbon = new THREE.MeshPhongMaterial({ color: 0x15171a, specular: 0x888888, shininess: 90, envMap: ENV, reflectivity: 0.06, combine: THREE.MixOperation });
const basisAt = (f, P) => { const m = new THREE.Matrix4(); m.makeBasis(CH, AX, XS.clone().multiplyScalar(f === 0 ? 1 : -1)); if (f === 1) m.makeBasis(CH.clone().negate(), AX, XS.clone().negate()); m.setPosition(P); return m; };
for (const f of [0, 1]) {
  const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(basisAt(f, surf(f, MAT.TANG, 0.03).P));
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.022), carbon); plate.position.z = 0.004; g.add(plate);
  const lug = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.006, 10, 24), new THREE.MeshPhongMaterial({ color: 0x9aa0a8, specular: 0xffffff, shininess: 120 }));
  lug.position.set(0, -0.05, 0.032); lug.rotation.y = Math.PI / 2; g.add(lug); boat.add(g);
}
const anemo = new THREE.Group();
{
  const grp = new THREE.Group(); grp.matrixAutoUpdate = false; grp.matrix.makeBasis(CH, AX, XS); grp.matrix.setPosition(B);
  const S0 = MAT.S_TOP, C0 = -0.085, white = new THREE.MeshPhongMaterial({ color: 0xf2f2ef, specular: 0x555555, shininess: 60 });
  const add = (geo, mat, c, s, x = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(c, s, x); grp.add(m); return m; };
  add(new THREE.BoxGeometry(0.22, 0.05, 0.12), carbon, C0 + 0.01, S0 + 0.025);
  add(new THREE.BoxGeometry(0.30, 0.04, 0.06), carbon, C0 + 0.16, S0 + 0.06);
  add(new THREE.CylinderGeometry(0.028, 0.032, 0.05, 20), carbon, C0 + 0.02, S0 + 0.075);
  add(new THREE.SphereGeometry(0.03, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x666655 }), C0 + 0.02, S0 + 0.1);
  add(new THREE.CylinderGeometry(0.006, 0.009, 0.78, 10), white, C0 - 0.10, S0 + 0.44);
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 12), carbon, C0 - 0.10, S0 + 0.07);
  const WX = C0 + 0.27, WS = S0 + 0.08;
  add(new THREE.CylinderGeometry(0.011, 0.014, 0.40, 12), carbon, WX, WS + 0.20);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 14), carbon, WX, WS + 0.43);
  anemo.position.set(WX, WS + 0.50, 0);
  const cupGeo = new THREE.SphereGeometry(0.022, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let k = 0; k < 3; k++) {
    const h = new THREE.Group(); h.rotation.y = k * 2 * Math.PI / 3;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 6), carbon); arm.rotation.z = Math.PI / 2; arm.position.x = 0.04; h.add(arm);
    const cup = new THREE.Mesh(cupGeo, carbon); cup.position.x = 0.085; cup.rotation.x = Math.PI / 2; h.add(cup); anemo.add(h);
  }
  grp.add(anemo);
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 8), carbon, WX - 0.1, WS + 0.44).rotation.z = Math.PI / 2;
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-0.11, 0); fin.lineTo(-0.13, 0.07); fin.lineTo(-0.04, 0.035); fin.lineTo(0, 0);
  add(new THREE.ExtrudeGeometry(fin, { depth: 0.003, bevelEnabled: false }), carbon, WX - 0.17, WS + 0.44);
  boat.add(grp);
}

/* =====================================================================  autocollants (textures dessinées à la volée) */
const STICK_FONT = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';
try { const f1 = new FontFace('Barlow Condensed', 'url(fonts/barlow-condensed-latin-600-normal.woff2)', { weight: '600' });
      const f2 = new FontFace('Barlow Condensed', 'url(fonts/barlow-condensed-latin-700-normal.woff2)', { weight: '700' });
      document.fonts.add(await f1.load()); document.fonts.add(await f2.load()); } catch (e) {}
const TR = 40, TXD_HI = isMobile() ? 1800 : 2048, TXD_LO = 140, MAXHI = isMobile() ? 8 : 12;
const tiles = [], decalMeshes = [];
let pickMode = false;
for (const f of [0, 1]) for (const z of Z) {
  const nT = Math.ceil(z.rows / TR);
  for (let k = 0; k < nT; k++) {
    const r0 = z.first + k * TR, r1 = Math.min(z.first + z.rows, r0 + TR), last = r1 === z.first + z.rows;
    const sLo = k === 0 ? z.s0 : z.s0 + CAP + (r0 - z.first) * PITCH, sHi = last ? z.s1 : z.s0 + CAP + (r1 - z.first) * PITCH;
    tiles.push({ f, r0, r1, sLo, sHi, capLo: k === 0, capHi: last, zi: Z.indexOf(z) });
  }
}
const maxAniso = renderer.capabilities.getMaxAnisotropy();
for (const t of tiles) {
  const ns = Math.max(2, Math.ceil((t.sHi - t.sLo) / 0.04) + 1), nc = 22, P = [], N = [], UV = [], su = t.f === 0 ? 1 : -1;
  for (let i = 0; i < ns; i++) {
    const s = t.sLo + (t.sHi - t.sLo) * i / (ns - 1), T = arcTab(s), w = zoneW(s);
    for (let j = 0; j < nc; j++) {
      const sig = -w / 2 + w * j / (nc - 1), { P: p, N: n } = surf(t.f, s, sig, 0.0008, T);
      P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); UV.push(0.5 + su * sig / TEXW, i / (ns - 1));
    }
  }
  t.lo = document.createElement('canvas'); t.lo.width = Math.round(TEXW * TXD_LO); t.lo.height = Math.max(8, Math.round((t.sHi - t.sLo) * TXD_LO));
  t.loTex = new THREE.CanvasTexture(t.lo); t.loTex.colorSpace = THREE.SRGBColorSpace; t.loTex.anisotropy = maxAniso;
  t.mat = new THREE.MeshPhongMaterial({ map: t.loTex, specular: 0x2a2a2a, shininess: 35, envMap: ENV, reflectivity: 0.04, combine: THREE.MixOperation,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  t.mesh = new THREE.Mesh(gridGeom(P, N, UV, ns, nc), t.mat); t.mesh.userData.tile = t;
  boat.add(t.mesh); decalMeshes.push(t.mesh);
  drawTile(t, t.lo, TXD_LO, false); t.loTex.needsUpdate = true;
}
const hiPool = [];
function heartPath(ctx, cx, cy, size) {
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const th = i / 40 * Math.PI * 2, x = 16 * Math.sin(th) ** 3, y = 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th), k = size / 32;
    i ? ctx.lineTo(cx + k * x, cy - k * y - k * 1.5) : ctx.moveTo(cx + k * x, cy - k * y - k * 1.5); }
  ctx.closePath();
}
const CAPTXT = ['INITIATIVES-CŒUR · MERCI !', 'MÉCÉNAT CHIRURGIE CARDIAQUE', 'ILS ONT DU CŒUR', 'BON VENT VIOLETTE !'];
function fitName(ctx, o, maxW, rowPx, bold) {
  const full = o.p + ' ' + o.n; let size = rowPx * 0.62;
  ctx.font = `${bold ? 700 : 600} ${size}px ${STICK_FONT}`;
  const w = ctx.measureText(full).width;
  if (w <= maxW) return { lines: [full], size };
  const s1 = size * maxW / w;
  if (s1 >= rowPx * 0.46) return { lines: [full], size: s1 };
  ctx.font = `${bold ? 700 : 600} ${rowPx * 0.40}px ${STICK_FONT}`;
  const w2 = Math.max(ctx.measureText(o.p).width, ctx.measureText(o.n).width);
  return { lines: [o.p, o.n], size: rowPx * 0.40 * Math.min(1, maxW / w2) };
}
function drawTile(t, cv, TXD, hi) {
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, su = t.f === 0 ? 1 : -1;
  const xOf = sig => (0.5 + su * sig / TEXW) * W, yOf = s => (t.sHi - s) * TXD, rowPx = PITCH * TXD;
  ctx.fillStyle = '#fafaf7'; ctx.fillRect(0, 0, W, H);
  // bords du vinyle
  ctx.strokeStyle = 'rgba(160,165,172,.9)'; ctx.lineWidth = Math.max(1, TXD / 900);
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(xOf(sg * zoneW(t.sLo) / 2) - sg * su * 2, H); ctx.lineTo(xOf(sg * zoneW(t.sHi) / 2) - sg * su * 2, 0); ctx.stroke(); }
  const cap = (sa, sb, kind) => {
    const w = zoneW((sa + sb) / 2), xa = xOf(-w / 2 + 0.008), xb = xOf(w / 2 - 0.008), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
    const y0 = yOf(sb) + rowPx * .12, y1 = yOf(sa) - rowPx * .12;
    ctx.fillStyle = '#ce111e'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (!hi) return;
    ctx.fillStyle = '#fff';
    if (kind === 'txt') {
      const txt = CAPTXT[(t.zi * 2 + t.f) % CAPTXT.length]; let size = (y1 - y0) * 0.55;
      ctx.font = `700 ${size}px ${STICK_FONT}`; const tw = ctx.measureText(txt).width; if (tw > (x1 - x0) * .9) size *= (x1 - x0) * .9 / tw;
      ctx.font = `700 ${size}px ${STICK_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, (x0 + x1) / 2, (y0 + y1) / 2 + size * .04);
    } else {
      const hs = (y1 - y0) * .62, n = Math.floor((x1 - x0) / (hs * 1.7));
      for (let k = 0; k < n; k++) { heartPath(ctx, (x0 + x1) / 2 + (k - (n - 1) / 2) * hs * 1.7, (y0 + y1) / 2, hs); ctx.fill(); }
    }
  };
  if (t.capLo) cap(t.sLo, t.sLo + CAP, 'txt');
  if (t.capHi) cap(t.sHi - CAP, t.sHi, 'hearts');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let r = t.r0; r < t.r1; r++) {
    const s = rowS(r), w = zoneW(s), yc = yOf(s);
    const o0 = owner[enc(t.f, r, 0)];
    if (o0 >= 0 && D[o0].perso >= 0) {                                    // personnalité : toute la rangée, autocollant rouge
      const xa = xOf(-w / 2 + 0.006), xb = xOf(w / 2 - 0.006), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      ctx.fillStyle = '#ce111e'; ctx.beginPath(); ctx.roundRect(x0, yc - rowPx * .44, x1 - x0, rowPx * .88, rowPx * .44); ctx.fill();
      if (hi) {
        const o = D[o0], fit = fitName(ctx, o, (x1 - x0) * .7, rowPx * 1.05, true);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${fit.size}px ${STICK_FONT}`; ctx.fillText(fit.lines.join(' '), (x0 + x1) / 2, yc + fit.size * .05);
        heartPath(ctx, x0 + rowPx * .5, yc, rowPx * .5); ctx.fill(); heartPath(ctx, x1 - rowPx * .5, yc, rowPx * .5); ctx.fill();
      }
      continue;
    }
    for (let c = 0; c < NC; c++) {
      const sl = enc(t.f, r, c), o = owner[sl], sa = -w / 2 + c * w / 3, sb = sa + w / 3;
      let x0 = xOf(sa), x1 = xOf(sb); if (x0 > x1) [x0, x1] = [x1, x0];
      if (o >= 0) {
        const d = D[o];
        if (hi) {
          const fit = fitName(ctx, d, (x1 - x0) - rowPx * .35, rowPx, false);
          ctx.fillStyle = d.local ? '#b0101c' : '#13294b'; ctx.font = `600 ${fit.size}px ${STICK_FONT}`;
          if (fit.lines.length === 1) ctx.fillText(fit.lines[0], (x0 + x1) / 2, yc + fit.size * .05);
          else { ctx.fillText(fit.lines[0], (x0 + x1) / 2, yc - fit.size * .52); ctx.fillText(fit.lines[1], (x0 + x1) / 2, yc + fit.size * .55); }
        } else {
          const len = Math.min(1, (d.p.length + d.n.length + 1) / 18) * (x1 - x0) * .8;
          ctx.fillStyle = 'rgba(19,41,75,.55)'; ctx.fillRect((x0 + x1) / 2 - len / 2, yc - rowPx * .17, len, rowPx * .34);
        }
      } else if (pickMode) {
        ctx.strokeStyle = '#2bb673'; ctx.setLineDash(hi ? [rowPx * .18, rowPx * .12] : []); ctx.lineWidth = hi ? rowPx * .06 : 1;
        if (hi) { ctx.beginPath(); ctx.roundRect(x0 + rowPx * .12, yc - rowPx * .36, x1 - x0 - rowPx * .24, rowPx * .72, rowPx * .2); ctx.stroke(); }
        else { ctx.fillStyle = 'rgba(43,182,115,.55)'; ctx.fillRect(x0 + 1, yc - rowPx * .3, x1 - x0 - 2, rowPx * .6); }
        ctx.setLineDash([]);
      }
    }
  }
}
function redrawAll() {
  for (const t of tiles) { drawTile(t, t.lo, TXD_LO, false); t.loTex.needsUpdate = true; if (t.hi) { drawTile(t, t.hi.cv, TXD_HI, true); t.hi.tex.needsUpdate = true; } }
  dirty = true;
}
function redrawSlot(sl) {
  const { f, row } = dec(sl);
  for (const t of tiles) if (t.f === f && row >= t.r0 && row < t.r1) { drawTile(t, t.lo, TXD_LO, false); t.loTex.needsUpdate = true; if (t.hi) { drawTile(t, t.hi.cv, TXD_HI, true); t.hi.tex.needsUpdate = true; } }
  dirty = true;
}
function updateLOD() {
  const vis = visH() / 2 + 0.6, sc = nav.s, wantF = [Math.cos(nav.th) > -0.35, Math.cos(nav.th) < 0.35];
  const need = nav.d < 5 ? tiles.filter(t => wantF[t.f] && t.sHi > sc - vis && t.sLo < sc + vis)
    .sort((a, b) => Math.abs((a.sLo + a.sHi) / 2 - sc) - Math.abs((b.sLo + b.sHi) / 2 - sc)).slice(0, MAXHI) : [];
  for (const t of tiles) if (t.hi && !need.includes(t)) { t.mat.map = t.loTex; t.mat.needsUpdate = true; hiPool.push(t.hi); t.hi = null; dirty = true; }
  for (const t of need) if (!t.hi) {
    let h = hiPool.pop();
    const W = Math.round(TEXW * TXD_HI), H = Math.round((t.sHi - t.sLo) * TXD_HI);
    if (!h || h.cv.width !== W || h.cv.height !== H) {
      if (h) h.tex.dispose();
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso; h = { cv, tex };
    }
    drawTile(t, h.cv, TXD_HI, true); h.tex.needsUpdate = true; t.hi = h; t.mat.map = h.tex; t.mat.needsUpdate = true; dirty = true;
  }
}

/* =====================================================================  caméra et navigation */
const BOATC = new THREE.Vector3(0, 12.5, -1.0), WUP = new THREE.Vector3(0, 1, 0);
const S_MIN = 0.35, S_MAX = 30.6, TH_MIN = -0.55, TH_MAX = Math.PI + 0.55, D_MIN = 0.28, D_MAX = 46;
const D0 = isMobile() ? 0.85 : 1.5;
const nav = { s: 1.3, th: 0.0, d: D0, ts: 1.3, tth: 0.0, td: D0, vs: 0, vth: 0, auto: false };
const visH = (d = nav.d) => 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
const mpp = () => visH() / stage.clientHeight;                       // mètres par pixel à la surface du mât
function closeD() { return clamp((stage.clientHeight * PITCH / 30) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))), 0.35, 1.6); }
const _m = new THREE.Matrix4(), _t = new THREE.Vector3(), _p = new THREE.Vector3(), _u = new THREE.Vector3();
function placeCamera() {
  const k = THREE.MathUtils.smoothstep(nav.d, 2.5, 14);
  const s = lerp(nav.s, clamp(nav.s, 6, 20), k);
  const dir = XS.clone().multiplyScalar(Math.cos(nav.th)).addScaledVector(CH, Math.sin(nav.th));
  const axisP = B.clone().addScaledVector(AX, s);
  _t.copy(axisP).lerp(BOATC, k);
  _p.copy(_t).addScaledVector(dir, radiusAt(s, nav.th) + nav.d).addScaledVector(WUP, k * nav.d * 0.18);
  _u.copy(AX).lerp(WUP, k).normalize();
  camera.position.copy(_p); camera.up.copy(_u);
  _m.lookAt(_p, _t, _u); camera.quaternion.setFromRotationMatrix(_m);
}
function setRig(t) {
  const roll = THREE.MathUtils.degToRad(4 + 1.4 * Math.sin(2 * Math.PI * t / 7.3) + 0.4 * Math.sin(2 * Math.PI * t / 3.1 + 1));
  const pitch = THREE.MathUtils.degToRad(0.6 * Math.sin(2 * Math.PI * t / 5.2 + 0.4));
  rig.quaternion.setFromEuler(new THREE.Euler(reduce ? 0 : pitch, 0, reduce ? THREE.MathUtils.degToRad(4) : roll, 'XYZ'));
  const pv = new THREE.Vector3(0, 0.6, 0); rig.position.set(0, reduce ? 0 : 0.1 * Math.sin(2 * Math.PI * t / 6.1), 0).add(pv.clone().sub(pv.clone().applyQuaternion(rig.quaternion)));
}
let lastH = 0;
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  if (lastH && spotSlot >= 0 && !nav.auto && Math.abs(h - lastH) > 40) nav.td = closeD();   // le panneau a changé de taille : on garde le nom lisible
  lastH = h;
}
new ResizeObserver(resize).observe(stage); resize();

// projection d'une place à l'écran
const _v = new THREE.Vector3();
function cellPoly(sl, whole) {
  const { f, row, col } = dec(sl), s = rowS(row), w = zoneW(s), T0 = arcTab(s - PITCH * .46), T1 = arcTab(s + PITCH * .46);
  const sa = whole ? -w / 2 : -w / 2 + col * w / 3, sb = whole ? w / 2 : sa + w / 3, pts = [];
  for (const [ss, T] of [[s - PITCH * .46, T0], [s + PITCH * .46, T1]]) for (const sg of [sa, (sa + sb) / 2, sb]) pts.push(surf(f, ss, sg, 0.001, T));
  return pts;
}
function screenRect(sl, whole) {
  rig.updateMatrixWorld(); camera.updateMatrixWorld();
  const pts = cellPoly(sl, whole), r = stage.getBoundingClientRect(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, facing = 0;
  const camW = camera.getWorldPosition(new THREE.Vector3());
  for (const { P, N } of pts) {
    _v.copy(P).applyMatrix4(rig.matrixWorld);
    const nW = N.clone().transformDirection(rig.matrixWorld);
    if (nW.dot(camW.clone().sub(_v)) > 0) facing++;
    _v.project(camera); if (_v.z > 1) return null;
    const x = (_v.x + 1) / 2 * r.width, y = (1 - _v.y) / 2 * r.height;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (facing < 3) return null;
  return { x0, y0, x1, y1 };
}
function placeBox(el, rect, pad = 4) {
  if (!rect || rect.x1 < -50 || rect.x0 > stage.clientWidth + 50 || rect.y1 < -50 || rect.y0 > stage.clientHeight + 50) { el.style.visibility = 'hidden'; return false; }
  el.style.visibility = ''; el.style.left = (rect.x0 - pad) + 'px'; el.style.top = (rect.y0 - pad) + 'px';
  el.style.width = (rect.x1 - rect.x0 + 2 * pad) + 'px'; el.style.height = (rect.y1 - rect.y0 + 2 * pad) + 'px'; return true;
}

// sélection par rayon
const ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();
function pickAt(cx, cy) {
  const r = canvas.getBoundingClientRect(); _ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  rig.updateMatrixWorld(); camera.updateMatrixWorld(); ray.setFromCamera(_ndc, camera);
  const hit = ray.intersectObjects(decalMeshes, false)[0]; if (!hit || !hit.uv) return null;
  const t = hit.object.userData.tile, s = t.sLo + hit.uv.y * (t.sHi - t.sLo), su = t.f === 0 ? 1 : -1, sig = (hit.uv.x - 0.5) * TEXW * su;
  const row = rowAt(s); if (!row) return null; const w = zoneW(s); const col = Math.floor((sig + w / 2) / (w / 3));
  if (col < 0 || col >= NC) return null;
  return enc(t.f, row, col);
}

/* =====================================================================  boucle de rendu */
let lastLOD = 0, clock0 = performance.now(), lastFrame = performance.now(), lastRender = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now;
  if (!nav.auto) {
    if (!dragging && Math.abs(nav.vs) > 1e-4) { nav.ts += nav.vs * dt; nav.vs *= Math.exp(-dt * 3.5); }
    if (!dragging && Math.abs(nav.vth) > 1e-4) { nav.tth += nav.vth * dt; nav.vth *= Math.exp(-dt * 4); }
    nav.ts = clamp(nav.ts, S_MIN, S_MAX); nav.tth = clamp(nav.tth, TH_MIN, TH_MAX); nav.td = clamp(nav.td, D_MIN, D_MAX);
    const k = 1 - Math.exp(-dt * 12), kd = 1 - Math.exp(-dt * 6);
    nav.s += (nav.ts - nav.s) * k; nav.th += (nav.tth - nav.th) * k; nav.d *= Math.pow(nav.td / nav.d, kd);
  }
  const moving = Math.abs(nav.ts - nav.s) > 1e-4 || Math.abs(nav.tth - nav.th) > 1e-4 || Math.abs(nav.td / nav.d - 1) > 1e-4 || nav.auto;
  const t = (now - clock0) / 1000;
  if (moving || dirty || now - lastRender > 45) {
    setRig(t); anemo.rotation.y = t * 9; seaMat.uniforms.time.value = t;
    placeCamera(); rig.updateMatrixWorld();
    camera.getWorldPosition(seaMat.uniforms.camPos.value);
    if (now - lastLOD > 120 || dirty) { updateLOD(); lastLOD = now; }
    renderer.render(scene, camera); lastRender = now; dirty = false;
    updateOverlays();
  }
  requestAnimationFrame(frame);
}
function updateOverlays() {
  const h = hOf(nav.s); setAlti(h);
  $('faceLbl').textContent = nav.d > 6 ? 'Vue d\'ensemble' : (Math.cos(nav.th) >= 0 ? 'Tribord' : 'Bâbord');
  $('flipTxt').textContent = Math.cos(nav.th) >= 0 ? 'Bâbord' : 'Tribord';
  const sp = $('spot');
  if (spotSlot >= 0) placeBox(sp, screenRect(spotSlot, spotWhole), 5);
  const hv = $('hover');
  if (hoverSlot >= 0 && !(spotSlot >= 0 && hoverSlot === spotSlot)) { hv.classList.add('show'); placeBox(hv, screenRect(hoverSlot), 2); } else hv.classList.remove('show');
}

/* =====================================================================  interactions : glisser, molette, pincer, toucher */
const pointers = new Map(); let downInfo = null, pinch0 = 0, lastMoveT = 0;
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {} pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { downInfo = { x: e.clientX, y: e.clientY, t: performance.now() }; nav.vs = nav.vth = 0; stopAuto(); }
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  hideTip();
});
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) { if (e.pointerType === 'mouse') hoverAt(e.clientX, e.clientY); return; }
  const p = pointers.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], dd = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0 > 0) nav.td = clamp(nav.td * pinch0 / dd, D_MIN, D_MAX); pinch0 = dd; dragging = true; return;
  }
  if (!dragging && downInfo && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 6) { dragging = true; canvas.classList.add('dragging'); hint(false); }
  if (!dragging) return;
  const now = performance.now(), dtm = Math.max(12, now - lastMoveT) / 1000; lastMoveT = now;
  const ds = dy * mpp(), dth = -dx / stage.clientWidth * 2.2;
  nav.ts = clamp(nav.ts + ds, S_MIN, S_MAX); nav.tth = clamp(nav.tth + dth, TH_MIN, TH_MAX);
  const vcap = Math.max(1.5, visH() * 4);
  nav.vs = clamp(lerp(nav.vs, ds / dtm, 0.5), -vcap, vcap); nav.vth = clamp(lerp(nav.vth, dth / dtm, 0.5), -3, 3);
});
const endPtr = e => {
  if (!pointers.has(e.pointerId)) return; pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    if (!dragging && downInfo && performance.now() - downInfo.t < 600) tapAt(e.clientX, e.clientY);
    if (performance.now() - lastMoveT > 80) { nav.vs = 0; nav.vth = 0; }
    dragging = false; canvas.classList.remove('dragging'); downInfo = null;
  }
  if (pointers.size < 2) pinch0 = 0;
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerleave', () => { if (!pointers.size) { hoverSlot = -1; dirty = true; } });
canvas.addEventListener('wheel', e => {
  e.preventDefault(); stopAuto(); hint(false);
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1;
  if (e.ctrlKey || e.metaKey) { nav.td = clamp(nav.td * Math.exp(e.deltaY * k * 0.004), D_MIN, D_MAX); return; }
  nav.ts = clamp(nav.ts - e.deltaY * k * mpp(), S_MIN, S_MAX);
  nav.tth = clamp(nav.tth + e.deltaX * k / stage.clientWidth * 2, TH_MIN, TH_MAX);
}, { passive: false });
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || !$('dlg').hidden) return;
  const r = PITCH;
  if (e.key === 'ArrowUp') nav.ts += r * 2; else if (e.key === 'ArrowDown') nav.ts -= r * 2;
  else if (e.key === 'PageUp') nav.ts += visH() * .8; else if (e.key === 'PageDown') nav.ts -= visH() * .8;
  else if (e.key === 'ArrowLeft') nav.tth -= .25; else if (e.key === 'ArrowRight') nav.tth += .25;
  else if (e.key === '+' || e.key === '=') nav.td /= 1.3; else if (e.key === '-') nav.td *= 1.3; else return;
  e.preventDefault(); stopAuto();
});
let hoverT = 0;
function hoverAt(x, y) { const now = performance.now(); if (now - hoverT < 40) return; hoverT = now; const sl = pickAt(x, y); if (sl !== hoverSlot) { hoverSlot = sl ?? -1; $('hover').classList.toggle('free', hoverSlot >= 0 && owner[hoverSlot] < 0); dirty = true; } }
$('btnFlip').onclick = () => { stopAuto(); nav.tth = Math.cos(nav.tth) >= 0 ? Math.PI : 0; if (nav.td > 4) nav.td = D0; };
$('btnOver').onclick = () => { stopAuto(); if (nav.td > 6) { nav.td = D0; } else { nav.td = 34; nav.tth = 0.55; } };
$('btnIn').onclick = () => { nav.td = clamp(nav.td / 1.5, D_MIN, D_MAX); };
$('btnOut').onclick = () => { nav.td = clamp(nav.td * 1.5, D_MIN, D_MAX); };
let hintTimer = setTimeout(() => hint(false), 9000);
function hint(on) { $('hint').classList.toggle('gone', !on); }

// altimètre interactif
const ALTI_MAX = 31;
(function buildAlti() {
  const a = $('alti');
  for (let m = 0; m <= ALTI_MAX; m++) {
    const t = document.createElement('div'); t.className = 'tick' + (m % 5 === 0 ? ' big' : ''); t.style.bottom = (m / ALTI_MAX * 100) + '%'; a.appendChild(t);
    if (m % 5 === 0) { const l = document.createElement('div'); l.className = 'lab'; l.textContent = m + (m === 0 ? ' m' : ''); l.style.bottom = (m / ALTI_MAX * 100) + '%'; a.appendChild(l); }
  }
  const go = e => { const r = a.getBoundingClientRect(); const h = clamp((r.bottom - e.clientY) / r.height * ALTI_MAX, 0, ALTI_MAX); stopAuto(); nav.ts = clamp(h / MAT.A[1], S_MIN, S_MAX); if (nav.td > 4) nav.td = 1.6; };
  a.addEventListener('pointerdown', e => { try { a.setPointerCapture(e.pointerId); } catch (err) {} go(e); a.onpointermove = go; });
  a.addEventListener('pointerup', () => { a.onpointermove = null; });
  a.addEventListener('keydown', e => { if (e.key === 'ArrowUp') nav.ts += 0.5; else if (e.key === 'ArrowDown') nav.ts -= 0.5; else return; e.preventDefault(); });
})();
let lastAlti = -1;
function setAlti(h) {
  if (Math.abs(h - lastAlti) < 0.005) return; lastAlti = h;
  $('altiCur').style.bottom = Math.min(100, h / ALTI_MAX * 100) + '%'; $('altiVal').textContent = fmtM(h);
  $('alti').setAttribute('aria-valuenow', h.toFixed(1));
  if (app.dataset.view === 'travel') $('climbH').textContent = fmtM(h) + ' au-dessus du pont';
}

/* =====================================================================  son */
const SND = { ctx: null, buf: {}, raw: {}, on: true, master: null, rope: null, ropeG: null, amb: null, ambG: null };
['rope_loop', 'brake', 'clack', 'release', 'ambience_loop'].forEach(n => fetch('audio/' + n + '.wav').then(r => r.arrayBuffer()).then(b => SND.raw[n] = b).catch(() => {}));
function audioInit() {
  try { if (!SND.ctx) { SND.ctx = new (window.AudioContext || window.webkitAudioContext)(); SND.master = SND.ctx.createGain(); SND.master.connect(SND.ctx.destination); }
        SND.ctx.resume && SND.ctx.resume(); SND.master.gain.value = SND.on ? 1 : 0; } catch (e) { SND.ctx = null; }
}
async function decodeAll() { if (!SND.ctx) return; await Promise.all(Object.keys(SND.raw).map(async n => { if (SND.buf[n]) return; try { SND.buf[n] = await new Promise((res, rej) => SND.ctx.decodeAudioData(SND.raw[n].slice(0), res, rej)); } catch (e) {} })); }
function shot(n, g = 1) { if (!SND.ctx || !SND.buf[n]) return; const s = SND.ctx.createBufferSource(), gg = SND.ctx.createGain(); s.buffer = SND.buf[n]; gg.gain.value = g; s.connect(gg).connect(SND.master); s.start(); return { s, g: gg }; }
function loopS(n, g) { if (!SND.ctx || !SND.buf[n]) return [null, null]; const s = SND.ctx.createBufferSource(), gg = SND.ctx.createGain(); s.buffer = SND.buf[n]; s.loop = true; gg.gain.value = g; s.connect(gg).connect(SND.master); s.start(); return [s, gg]; }
function ropeOn() { if (SND.rope || !SND.ctx) return; [SND.rope, SND.ropeG] = loopS('rope_loop', 0); }
function ropeSpeed(v) { if (!SND.rope) return; const t = SND.ctx.currentTime; SND.rope.playbackRate.setTargetAtTime(Math.min(1.9, .45 + .25 * v), t, .05); SND.ropeG.gain.setTargetAtTime(Math.min(1, v / 1.2) * .5, t, .06); }
function ropeOff() { if (!SND.rope) return; const s = SND.rope; SND.ropeG.gain.setTargetAtTime(0, SND.ctx.currentTime, .04); setTimeout(() => { try { s.stop(); } catch (e) {} }, 400); SND.rope = null; }
function ambOn() { if (SND.amb || !SND.ctx) return; [SND.amb, SND.ambG] = loopS('ambience_loop', 0); if (SND.ambG) SND.ambG.gain.setTargetAtTime(.35, SND.ctx.currentTime, .4); }
function ambOff() { if (!SND.amb) return; const s = SND.amb; SND.ambG.gain.setTargetAtTime(0, SND.ctx.currentTime, .3); setTimeout(() => { try { s.stop(); } catch (e) {} }, 1500); SND.amb = null; }
$('sound').onclick = () => { SND.on = !SND.on; $('sound').setAttribute('aria-pressed', SND.on); if (SND.master) SND.master.gain.setTargetAtTime(SND.on ? 1 : 0, SND.ctx.currentTime, .05); };

/* =====================================================================  montée vers une place */
let token = 0, current = null;
function stopAuto() { if (nav.auto) { nav.auto = false; token++; ropeOff(); nav.ts = nav.s; nav.tth = nav.th; nav.td = nav.d; } }
async function glideTo(sTarget, thTarget, dTarget, my, opts = {}) {
  await decodeAll(); if (my !== token) return false;
  if (reduce) { nav.s = nav.ts = sTarget; nav.th = nav.tth = thTarget; nav.d = nav.td = dTarget; dirty = true; return true; }
  nav.auto = true; const s0 = nav.s, th0 = nav.th, d0 = nav.d, dist = Math.abs(sTarget - s0), dir = Math.sign(sTarget - s0) || 1;
  const vmax = clamp(dist / 3.2, 0.8, opts.vmax || 7.5), ACC = 3.0, BRK = 2.6;
  let s = s0, v = 0.3, sq = false, prev = performance.now();
  if (dist > 0.3) { shot('release', .7); ropeOn(); }
  await new Promise(res => { (function step(now) {
    if (my !== token) return res();
    let dt = Math.min(0.25, (now - prev) / 1000); prev = now; let rem = Math.abs(sTarget - s);
    while (dt > 0 && rem > 0) {                            // sous-pas : même durée de montée quel que soit le nombre d'images par seconde
      const h = Math.min(dt, 0.016); dt -= h; const run = Math.abs(s - s0);
      v = Math.max(0.05, Math.min(Math.sqrt(0.09 + 2 * ACC * run), vmax, Math.sqrt(2 * BRK * rem) + 0.02));
      s += dir * Math.min(rem, v * h); rem = Math.abs(sTarget - s);
    }
    const prog = dist > 0 ? 1 - Math.abs(sTarget - s) / dist : 1, e = prog * prog * (3 - 2 * prog);
    nav.s = nav.ts = s; nav.th = nav.tth = lerp(th0, thTarget, Math.min(1, e * 1.6)); nav.d = nav.td = d0 * Math.pow(dTarget / d0, Math.min(1, e * 1.4));
    ropeSpeed(v);
    if (!sq && rem < 0.9 && dist > 1.5) { sq = true; shot('brake', .5); }
    if (rem <= 1e-4) return res();
    requestAnimationFrame(step); })(performance.now()); });
  nav.auto = false; ropeOff();
  if (my !== token) return false;
  nav.s = nav.ts = sTarget; nav.th = nav.tth = thTarget; nav.d = nav.td = dTarget;
  if (dist > 0.3) shot('clack', 1);
  return true;
}
function setView(v) { app.dataset.view = v; $('panel').scrollTop = 0; }
async function travel(o, { fromFoot = false } = {}) {
  const my = ++token; current = o; audioInit(); ambOn();
  spotSlot = -1; $('spot').classList.remove('show', 'pick'); hideTip();
  setView('travel'); $('climbWho').textContent = o.p + ' ' + o.n;
  const { f, row } = dec(o.slot), sT = rowS(row);
  $('altiTarget').style.bottom = Math.min(100, hOf(sT) / ALTI_MAX * 100) + '%'; $('alti').classList.add('armed');
  if (fromFoot) { nav.s = nav.ts = 1.0; nav.td = nav.d = Math.max(nav.d, 1.4); dirty = true; await sleep(250); }
  const ok = await glideTo(sT, f === 0 ? 0 : Math.PI, closeD(), my);
  if (!ok || my !== token) return;
  spotSlot = o.slot; spotWhole = o.perso >= 0; $('spotTxt').textContent = (o.perso >= 0 ? o.p + ' est ici · ' : 'Vous êtes ici · ') + fmtM(hOf(sT));
  $('spot').classList.add('show'); dirty = true;
  renderDone(o);
  setTimeout(() => { if (my === token) { setView('done'); requestAnimationFrame(() => { if (my === token) nav.td = closeD(); }); } }, reduce ? 0 : 500);
  try { history.replaceState(null, '', '#' + o.slug); } catch (e) {}
  setTimeout(() => { if (my === token) ambOff(); }, 9000);
}
async function tour() {        // toute la montée, du pied à la tête de mât
  const my = ++token; audioInit(); spotSlot = -1; $('spot').classList.remove('show');
  nav.s = nav.ts = 1.0; nav.th = nav.tth = 0; nav.td = nav.d = 1.7; dirty = true; ambOn();
  await glideTo(29.9, 0.2, 2.2, my, { vmax: 0.9 });
  if (my === token) { await sleep(800); ambOff(); }
}

/* =====================================================================  bulle d'information sur une place */
function hideTip() { $('tip').hidden = true; }
function showTip(sl, html) {
  const tip = $('tip'); tip.innerHTML = html; tip.hidden = false;
  const r = screenRect(sl, owner[sl] >= 0 && D[owner[sl]].perso >= 0) || { x0: stage.clientWidth / 2, x1: stage.clientWidth / 2, y0: stage.clientHeight / 2, y1: stage.clientHeight / 2 };
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = (r.x0 + r.x1) / 2 - tw / 2, y = r.y0 - th - 10; if (y < 50) y = r.y1 + 10;
  tip.style.left = clamp(x, 8, stage.clientWidth - tw - 70) + 'px'; tip.style.top = clamp(y, 50, stage.clientHeight - th - 8) + 'px';
  tip.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { hideTip(); ACT[b.dataset.act](sl); });
}
const ACT = {
  voir: sl => { const o = D[owner[sl]]; travel(o); },
  perso: sl => openPerso(D[owner[sl]].perso),
  choisir: sl => { startDon(); DS.amt = Math.max(DS.amt, CFG.prix_choix); renderAmounts(); gotoStep(2); selectSlot(sl); },
  prendre: sl => selectSlot(sl),
};
function tapAt(x, y) {
  const sl = pickAt(x, y); if (sl == null) { hideTip(); return; }
  const o = owner[sl] >= 0 ? D[owner[sl]] : null, { row } = dec(sl), h = fmtM(hOf(rowS(row)));
  if (pickMode) {
    if (!o) { selectSlot(sl); return; }
    showTip(sl, `<b>Place prise</b><small>${esc(o.p)} ${esc(o.n)} · ${slotLabel(sl)}</small>`); return;
  }
  if (!o) { showTip(sl, `<b>Place libre</b><small>${slotLabel(sl)} · ${h}</small><button class="btn red small" data-act="choisir">Réserver cette place</button>`); return; }
  hideTip(); if (o.perso >= 0) openPerso(o.perso); else openDonor(o);
}

/* =====================================================================  panneau : accueil */
const NKIDS_DONE = ENF.enfants.filter(e => e.finance >= 1).length;
function renderStats() {
  const taken = NS - freeCount();
  $('stats').innerHTML = `<div class="stat"><b>${nf(D.length)}</b><span>noms à bord</span><div class="bar"><i style="width:${(taken / NS * 100).toFixed(1)}%"></i></div></div>
    <div class="stat"><b>${nf(NS - taken)}</b><span>places libres sur ${nf(NS)}</span></div>
    <div class="stat"><b>${nf(ENF.anterieurs + NKIDS_DONE)}</b><span>enfants sauvés avec Initiatives-Cœur</span></div>`;
}
function showMsg(html, buttons) {
  const m = $('msg'); m.innerHTML = ''; const p = document.createElement('p'); p.innerHTML = html; m.appendChild(p);
  if (buttons && buttons.length) { const row = document.createElement('div'); row.className = 'row';
    buttons.forEach(([label, fn]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = label; b.onclick = fn; row.appendChild(b); }); m.appendChild(row); }
  m.classList.add('show');
}
function go(o) { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); $('msg').classList.remove('show'); travel(o, { fromFoot: true }); }
$('form').addEventListener('submit', ev => {
  ev.preventDefault(); audioInit();
  const p = $('prenom').value.trim(), n = $('nom').value.trim();
  if (!p || !n) { showMsg('Saisissez votre <strong>prénom</strong> et votre <strong>nom</strong>, tels que vous les avez indiqués lors de votre don.'); (p ? $('nom') : $('prenom')).focus(); return; }
  const r = search(p, n);
  if (r.hits.length === 1) return go(r.hits[0]);
  if (r.hits.length > 1) return showMsg(`${r.hits.length} personnes s'appellent <strong>${esc(r.hits[0].p + ' ' + r.hits[0].n)}</strong> sur le mât. Laquelle êtes-vous ?`,
    r.hits.map(o => [`${FACEN[dec(o.slot).f]} · ${fmtM(hOf(rowS(dec(o.slot).row)))}${o.v >= 0 ? ' · ' + VILLES[o.v] : ''}`, () => go(o)]));
  if (r.close.length) return showMsg(`Nous ne trouvons pas <strong>${esc(p + ' ' + n)}</strong>. Vouliez-vous dire :`, r.close.map(o => [o.p + ' ' + o.n, () => go(o)]));
  showMsg(`<strong>${esc(p + ' ' + n)}</strong> n'est pas encore sur le mât.`, [['Mettre ce nom sur le mât', () => { startDon(); $('dPrenom').value = p; $('dNom').value = n; }]]);
});
function chip(label, cls, fn, href) {
  const b = document.createElement(href ? 'a' : 'button'); if (href) b.href = href; else b.type = 'button';
  b.className = 'chip ' + (cls || ''); b.innerHTML = label; if (fn) b.onclick = fn; return b;
}
(function buildChips() {
  const box = $('examples'), lab = t => { const s = document.createElement('span'); s.className = 'lab2'; s.textContent = t; return s; }, sep = () => { const s = document.createElement('span'); s.className = 'sep'; return s; };
  box.append(chip('Enfants sauvés', 'blue', openKids), chip('Messages', 'blue', openMessages), chip('Contreparties', 'blue', openTiers),
    chip('Carte des donateurs', 'blue', openMap), chip('Le mât en fun facts', 'blue', null, 'mat.html'), chip('Boutique solidaire', 'blue', null, CFG.boutique_url || '#'), chip('Toute la montée', 'blue', () => { audioInit(); tour(); }), sep());
  box.append(lab('Personnalités :')); PERS.forEach((P, k) => box.append(chip('♥ ' + esc(P.prenom + ' ' + P.nom), 'perso', () => go(D.find(o => o.perso === k)))));
  box.append(sep(), lab('Exemples :'));
  const ex = [D.find(o => o.dup > 1), D.find(o => o.p === 'Anna' && o.n === 'Brunet'), D.find(o => o.m && o.pal >= 3)].filter(Boolean);
  ex.forEach(o => box.append(chip(esc(o.p + ' ' + o.n), '', () => { $('prenom').value = o.p; $('nom').value = o.n; $('form').requestSubmit(); })));
})();

/* =====================================================================  panneau : merci / mon don */
const DYK = [
  "Sur un IMOCA, le haut du mât ne doit pas dépasser 29 m au-dessus de l'eau : c'est le tirant d'air maximum fixé par la classe.",
  "Depuis 2013, les mâts des IMOCA sont monotypes : le même pour tous les bateaux, fabriqué à Lorient par Lorima.",
  "Le mât d'un IMOCA est incliné vers l'arrière, entre 2 et 6 degrés selon la jauge : les marins appellent ça la quête.",
  "Un mât monotype de 28,5 m pesait 240 kg : à peu près le poids de trois adultes, pour un tube haut comme un immeuble de 10 étages.",
];
const KG = { 551: 'f', 552: 'm', 553: 'f', 554: 'm', 555: 'm', 556: 'f', 557: 'f', 558: 'm' };
const acc = (k, m, f) => KG[k.num] === 'f' ? f : m;
function kidStatus(k) {
  const opere = acc(k, 'Opéré', 'Opérée'), rentre = acc(k, 'rentré', 'rentrée');
  return { rentree: `${opere} avec succès, ${rentre} ${k.pays === 'Haïti' ? 'en Haïti' : 'au pays'} le ${fdate(k.retour)}`,
    convalescence: `${opere} le ${fdate(k.operation)}, en convalescence dans sa famille d'accueil`,
    'en-france': `En France depuis le ${fdate(k.arrivee)}, opération prévue le ${fdate(k.operation)}`,
    'arrivee-prevue': `Arrivée en France prévue le ${fdate(k.arrivee)}`,
    dossier: 'Dossier médical accepté, voyage en préparation', financement: `En cours de financement : ${Math.round(k.finance * 100)} %` }[k.statut];
}
function kidSteps(k) {
  const st = k.statut, inFr = ['en-france', 'convalescence', 'rentree'].includes(st), op = ['convalescence', 'rentree'].includes(st);
  const L = [[true, 'Dossier médical accepté par Mécénat Chirurgie Cardiaque'], [k.finance >= 1, `Opération financée${k.finance < 1 ? ` (${Math.round(k.finance * 100)} %)` : ''}`],
    [inFr, `Arrivée en France${k.arrivee ? ' le ' + fdate(k.arrivee) : ''}${k.accueil ? ', famille d\'accueil à ' + k.accueil : ''}`],
    [op, `Opération${k.operation ? ' le ' + fdate(k.operation) : ''}${k.hopital ? ' à ' + k.hopital : ''}`],
    [st === 'rentree', `Retour ${k.pays === 'Haïti' ? 'en Haïti' : 'au pays'}${k.retour ? ' le ' + fdate(k.retour) : ''}`]];
  const firstTodo = L.findIndex(x => !x[0]);
  return L.map(([done, txt], j) => `<li class="${done ? 'ok' : j === firstTodo ? 'now' : ''}">${esc(txt)}</li>`).join('');
}
const avatarFor = (txt, col) => `<div class="avatar" style="background:${col}">${esc(txt)}</div>`;
function kidCard(k, compact) {
  return `<div class="top">${avatarFor(k.prenom[0], '#b8323a')}<div><small>Enfant n° ${k.num} · fiche fictive</small><h3>${esc(k.prenom)}, ${k.age} ans</h3><p>${esc(k.ville)}, ${esc(k.pays)}</p></div></div>
    <p><b>${esc(kidStatus(k))}</b></p><div class="prog"><i style="width:${Math.round(k.finance * 100)}%"></i></div>
    ${compact ? '' : `<p>${esc(k.patho)} : ${esc(k.simple)}</p><ul class="timeline">${kidSteps(k)}</ul>`}`;
}
function renderDone(o) {
  const { f, row, col } = dec(o.slot), s = rowS(row), h = hOf(s), P = o.perso >= 0 ? PERS[o.perso] : null;
  $('tMerci').textContent = P ? '' : 'Merci '; $('tName').textContent = P ? o.p + ' ' + o.n : o.p + ' !';
  document.querySelector('.thanks .merci').classList.toggle('long', ($('tMerci').textContent + $('tName').textContent).length > 13);
  const pills = [[P ? 'red' : '', FACEN[f]], ['', 'Rang ' + row + (P ? '' : ' · place ' + COLN[col])], ['', fmtM(h)]];
  if (P) pills.unshift(['red', 'Personnalité']);
  else if (CFG.afficher_palier && o.pal >= 0) pills.push(['gold', CTP.paliers[o.pal].nom]);
  if (o.local) pills.push(['red', 'Nouveau à bord']);
  $('tWhere').innerHTML = pills.map(([c, t]) => `<span class="pill ${c}">${esc(t)}</span>`).join('');
  const q = $('tQuote'); q.hidden = !o.m; q.innerHTML = o.m ? `« ${esc(o.m)} »<small>${o.local ? 'En attente de validation avant affichage public' : 'Message laissé lors du don'}${o.d ? ' · ' + fdate(o.d) : ''}</small>` : '';
  const pc = $('tPerso'); pc.hidden = !P; if (P) pc.innerHTML = persoCard(P, true);
  const kidEl = $('tKid'), k = o.e >= 0 ? ENF.enfants[o.e] : null; kidEl.hidden = !k;
  if (k) { kidEl.innerHTML = `<small>${P ? 'Ce don soutient' : 'Votre don participe à sauver'}</small>` + kidCard(k, true) + `<button class="btn small" type="button" id="kidMore">Voir sa fiche et son parcours</button>`; $('kidMore').onclick = () => openKid(k); }
  const horizon = 3.57 * Math.sqrt(Math.max(h, .5)), floors = Math.max(1, Math.round(h / 3));
  $('tFacts').innerHTML = [['Hauteur', fmt1(h), 'm', 'au-dessus du pont'], ['Horizon', '≈ ' + Math.round(horizon), 'km', 'de mer visible depuis votre nom, par temps clair'],
    ['Comme un immeuble', floors, floors > 1 ? 'étages' : 'étage', 'environ 3 m par étage'], ['Votre rangée', row, '', `sur ${NR} de chaque côté du mât`]]
    .map(([l, v, u, sub]) => `<div class="fact"><small>${l}</small><b>${v}<u>${u}</u></b><span>${sub}</span></div>`).join('');
  // voisins de mât
  const nb = [], nm = i => i >= 0 ? `<strong>${esc(D[i].p + ' ' + D[i].n)}</strong>` : null;
  if (!P) for (let c = 0; c < NC; c++) if (c !== col) { const w = owner[enc(f, row, c)]; if (w >= 0 && D[w].perso < 0) nb.push(nm(w) + (c < col ? ' juste avant vous' : ' juste après vous')); }
  const up = row < NR ? owner[enc(f, row + 1, P ? 1 : col)] : -1, dn = row > 1 ? owner[enc(f, row - 1, P ? 1 : col)] : -1;
  if (up >= 0) nb.push(nm(up) + ' juste au-dessus'); if (dn >= 0) nb.push(nm(dn) + ' juste en dessous');
  $('tNeigh').innerHTML = nb.length ? (P ? 'Ses voisins de mât : ' : 'Vos voisins de mât : ') + nb.join(', ') + '.' : '';
  // près de chez vous (prénoms seulement)
  const near = $('tNear'); near.innerHTML = '';
  if (o.v >= 0) {
    const ville = VILLES[o.v], dep = DEPS[o.v], sameV = D.filter(x => x.v === o.v && x !== o), sameD = D.filter(x => x.v >= 0 && DEPS[x.v][0] === dep[0] && x !== o);
    const names = list => [...new Set(list.map(x => x.p))].slice(0, 14).join(', ');
    near.innerHTML = `<div><strong>${plural(sameV.length, 'autre donateur', 'autres donateurs')} ${esc(deVille(ville))}</strong>${sameV.length ? ' : ' + esc(names(sameV)) + (sameV.length > 14 ? '…' : '') : ''}</div>
      <div><strong>${plural(sameD.length, 'donateur', 'donateurs')} dans ${esc(dansDep(dep))}</strong></div>`;
  }
  renderMyMap(o);
  $('tDyk').textContent = DYK[o.i % DYK.length];
}
$('replay').onclick = () => current && travel(current, { fromFoot: true });
$('myCard').onclick = () => current && openDonor(current);
$('shop').href = CFG.boutique_url || '#';
$('again').onclick = () => { token++; spotSlot = -1; $('spot').classList.remove('show'); $('alti').classList.remove('armed'); setView('home'); $('prenom').value = ''; $('nom').value = ''; $('prenom').focus();
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} };
$('copy').onclick = async () => {
  const b = $('copy'), url = location.href, c = current;
  const text = !c ? "Mettez votre nom sur le mât d'Initiatives-Cœur :" : c.perso >= 0 ? `${c.p} ${c.n} est sur le mât d'Initiatives-Cœur !` : `Mon nom est sur le mât d'Initiatives-Cœur ! Retrouvez ${c.p} ${c.n} ici :`;
  if (navigator.share) { try { await navigator.share({ title: document.title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); b.textContent = 'Lien copié'; } catch (e) { b.textContent = 'Copie impossible'; }
  setTimeout(() => b.textContent = 'Partager', 2000);
};

/* =====================================================================  cartes (France, monde) */
const CNT = VILLES.map(() => 0); D.forEach(o => { if (o.v >= 0) CNT[o.v]++; });
const VXY = Object.fromEntries(Object.entries(GEO.villes));
const NDON = CNT.reduce((a, b) => a + b, 0), NVILLES = CNT.filter(c => c > 0).length;
const VOY = /^[AEIOUYÉÈÊÂÎÔÛ]/i;
function deVille(v) { if (/^Le /.test(v)) return 'du ' + v.slice(3); if (/^Les /.test(v)) return 'des ' + v.slice(4); if (/^La /.test(v)) return 'de La ' + v.slice(3); return (VOY.test(v) ? "d'" : 'de ') + v; }
function dansDep([code, nom]) { const fem = /^(Charente|Côte|Corse|Creuse|Dordogne|Drôme|Gironde|Haute|Loire|Lozère|Manche|Marne|Mayenne|Meuse|Moselle|Nièvre|Oise|Orne|Sarthe|Savoie|Seine|Somme|Vendée|Vienne|Haute-)/.test(nom);
  const plur = /^(Bouches|Alpes|Pyrénées|Côtes|Hautes|Deux|Yvelines|Ardennes|Landes|Vosges)/.test(nom);
  if (code === '75') return 'Paris (75)'; return (plur ? 'les ' : fem ? 'la ' : VOY.test(nom) ? "l'" : 'le ') + nom + ` (${code})`; }
function renderMap(box, me, capEl) {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${GEO.w} ${GEO.h}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Carte de France : ${plural(NDON, 'donateur', 'donateurs')} dans ${plural(NVILLES, 'ville', 'villes')}`);
  const land = document.createElementNS(ns, 'path'); land.setAttribute('d', GEO.path); land.setAttribute('class', 'land'); svg.appendChild(land);
  VILLES.map((v, i) => i).filter(i => CNT[i] > 0).sort((a, b) => CNT[b] - CNT[a]).forEach(i => {
    const [x, y] = VXY[VILLES[i]], r = 6 + 3.2 * Math.sqrt(CNT[i]);
    const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r); c.setAttribute('class', 'dot' + (i === me ? ' me' : ''));
    const t = document.createElementNS(ns, 'title'); t.textContent = `${VILLES[i]} : ${plural(CNT[i], 'donateur', 'donateurs')}`; c.appendChild(t);
    c.addEventListener('click', () => { svg.querySelectorAll('.dot.sel').forEach(d => d.classList.remove('sel')); c.classList.add('sel');
      if (capEl) { const ps = [...new Set(D.filter(o => o.v === i).map(o => o.p))].slice(0, 16).join(', '); capEl.innerHTML = `<strong>${esc(VILLES[i])}</strong> : ${plural(CNT[i], 'donateur', 'donateurs')} — ${esc(ps)}…`; } });
    svg.appendChild(c);
  });
  if (me >= 0 && CNT[me]) {
    const [x, y] = VXY[VILLES[me]];
    const ring = document.createElementNS(ns, 'circle'); ring.setAttribute('cx', x); ring.setAttribute('cy', y); ring.setAttribute('r', 6 + 3.2 * Math.sqrt(CNT[me])); ring.setAttribute('class', 'ring'); svg.appendChild(ring);
    const m2 = svg.querySelector('.dot.me'); if (m2) svg.appendChild(m2);
    const lb = document.createElementNS(ns, 'text'); lb.setAttribute('class', 'lbl'); lb.textContent = VILLES[me];
    const right = x < GEO.w * .62; lb.setAttribute('x', right ? x + 26 : x - 26); lb.setAttribute('y', y + 12); lb.setAttribute('text-anchor', right ? 'start' : 'end'); svg.appendChild(lb);
  }
  box.innerHTML = ''; box.appendChild(svg);
}
function renderMyMap(o) {
  renderMap($('tMapSvg'), o.v, $('tMapCap'));
  if (o.v >= 0) { const n = CNT[o.v], v = VILLES[o.v];
    $('tMapCap').innerHTML = n > 1 ? `Vous êtes l'un des <strong>${n} donateurs ${esc(deVille(v))}</strong>, parmi ${plural(NDON, 'donateur', 'donateurs')} dans ${plural(NVILLES, 'ville', 'villes')}.`
      : `Vous êtes le premier donateur <strong>${esc(deVille(v))}</strong>, parmi ${plural(NDON, 'donateur', 'donateurs')}.`; }
  else $('tMapCap').innerHTML = `Les donateurs viennent de <strong>${plural(NVILLES, 'ville', 'villes')}</strong> de France.`;
}
function worldMap(sel) {
  const W = WORLD, ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W.w} ${W.h}`);
  const camp = {}; ENF.enfants.filter(k => k.finance >= 1).forEach(k => camp[k.iso] = (camp[k.iso] || 0) + 1);
  for (const [id, d] of Object.entries(W.pays)) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('class', 'c' + (ENF.histo[id] || camp[id] ? ' on' : '')); svg.appendChild(p); }
  const ids = [...new Set([...Object.keys(ENF.histo), ...Object.keys(camp)])].filter(id => W.centres[id]);
  ids.sort((a, b) => ((ENF.histo[b]?.[1] || 0) + (camp[b] || 0)) - ((ENF.histo[a]?.[1] || 0) + (camp[a] || 0)));
  for (const id of ids) {
    const n = (ENF.histo[id]?.[1] || 0) + (camp[id] || 0), [x, y] = W.centres[id];
    const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 1.6 + 0.9 * Math.sqrt(n));
    c.setAttribute('class', 'b' + (camp[id] ? ' new' : '') + (sel === id ? ' sel' : ''));
    const t = document.createElementNS(ns, 'title'); t.textContent = `${ENF.histo[id]?.[0] || ''} : ${n} enfant${n > 1 ? 's' : ''} opéré${n > 1 ? 's' : ''}${camp[id] ? ` (dont ${camp[id]} grâce au mât)` : ''}`; c.appendChild(t);
    svg.appendChild(c);
  }
  if (sel && W.centres[sel]) { const [x, y] = W.centres[sel]; const r = document.createElementNS(ns, 'circle'); r.setAttribute('cx', x); r.setAttribute('cy', y); r.setAttribute('r', 6); r.setAttribute('class', 'ring'); r.setAttribute('style', 'fill:none;stroke:#e5202e;stroke-width:1.5'); svg.appendChild(r); }
  const box = document.createElement('div'); box.className = 'world'; box.appendChild(svg); return box;
}

/* =====================================================================  dialogues */
function openDlg(title, html, after) {
  $('dlgTitle').textContent = title; $('dlgBody').innerHTML = ''; if (typeof html === 'string') $('dlgBody').innerHTML = html; else $('dlgBody').append(...html);
  $('dlg').hidden = false; $('dlgClose').focus(); if (after) after($('dlgBody'));
}
const closeDlg = () => { $('dlg').hidden = true; };
$('dlgClose').onclick = closeDlg; $('dlg').addEventListener('click', e => { if (e.target === $('dlg')) closeDlg(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('dlg').hidden) closeDlg(); });

function openMap(me) {
  if (typeof me !== 'number') me = current?.v ?? -1;
  const box = document.createElement('div'); box.className = 'two';
  const m = document.createElement('div'); m.className = 'mapsvg'; renderMap(m, me, null);
  const ol = document.createElement('ol'); ol.className = 'top'; const max = Math.max(...CNT);
  VILLES.map((v, i) => i).filter(i => CNT[i] > 0).sort((a, b) => CNT[b] - CNT[a]).slice(0, 12).forEach(i => {
    const li = document.createElement('li'); li.innerHTML = `<b>${esc(VILLES[i])}</b><span>${CNT[i]}</span><i style="width:${Math.round(CNT[i] / max * 100)}%"></i>`; ol.appendChild(li); });
  box.append(m, ol);
  const cap = document.createElement('p'); cap.className = 'sub'; cap.textContent = 'Touchez un point pour voir la ville et les prénoms de ses donateurs. Seule la ville est utilisée, jamais l\'adresse.';
  const sub = document.createElement('p'); sub.className = 'sub'; sub.textContent = `${plural(NDON, 'donateur', 'donateurs')} dans ${plural(NVILLES, 'ville', 'villes')} (villes fictives dans ce prototype).`;
  openDlg('Les donateurs en France', [sub, box, cap], body => { m.querySelectorAll('circle.dot').forEach(c => c.addEventListener('click', () => cap.innerHTML = c.querySelector('title').textContent)); });
  renderMap(m, me, cap);
}
function openMessages() {
  const list = D.filter(o => o.m && !o.local).sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  const sb = document.createElement('label'); sb.className = 'searchbox'; sb.innerHTML = '<input type="search" placeholder="Chercher un mot, un prénom, une ville…">';
  const grid = document.createElement('div'); grid.className = 'msgs'; const more = document.createElement('button'); more.className = 'btn'; more.textContent = 'Voir plus de messages';
  let shown = 0, filt = list;
  const card = o => { const d = document.createElement('div'); d.className = 'mcard';
    d.innerHTML = `<q>${esc(o.m)}</q><small>${esc(o.p)} ${esc(o.n)} ${o.v >= 0 ? '· ' + esc(VILLES[o.v]) : ''} · ${fdate(o.d)}</small><div class="row"><button class="btn small" type="button" data-a="f">Sa fiche</button><button class="btn small" type="button" data-a="m">Voir sur le mât</button></div>`;
    d.querySelector('[data-a=f]').onclick = () => openDonor(o); d.querySelector('[data-a=m]').onclick = () => { closeDlg(); travel(o); }; return d; };
  const page = () => { filt.slice(shown, shown + 30).forEach(o => grid.appendChild(card(o))); shown += 30; more.hidden = shown >= filt.length; };
  sb.querySelector('input').oninput = e => { const q = norm(e.target.value); filt = q ? list.filter(o => norm(o.m + ' ' + o.p + ' ' + (o.v >= 0 ? VILLES[o.v] : '')).includes(q)) : list; grid.innerHTML = ''; shown = 0; page(); };
  more.onclick = page; page();
  const sub = document.createElement('p'); sub.className = 'sub'; sub.textContent = `${plural(list.length, 'message', 'messages')} laissés par les donateurs. Chaque message est relu avant d'être affiché.`;
  openDlg('Le mur des messages', [sub, sb, grid, more]);
}
function openTiers() {
  const T = CTP.paliers.map(p => `<div class="tier"><span class="amt">${p.min} €</span><b>${esc(p.nom)}</b><em>${esc(p.accroche)}</em><ul>${p.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('');
  const L = CTP.tirage;
  openDlg('Contreparties', `<p class="sub">Choisissez votre place sur le mât à partir de ${CFG.prix_choix} €. Les contreparties s'additionnent d'un palier à l'autre.</p>
    <div class="tiers">${T}</div>
    <h2>${esc(L.titre)}</h2><p class="sub">${esc(L.regle)} Tirage ${esc(L.date)}.</p><ul class="lots">${L.lots.map(l => `<li><b>${l.nb} ×</b> ${esc(l.nom)}</li>`).join('')}</ul>
    <p class="fine">${esc(L.mentions)} Si le don ouvre droit à une réduction d'impôt, la valeur des contreparties doit rester faible (25 % du don au plus, dans la limite d'un plafond annuel) : à valider avec l'expert-comptable.</p>
    <button class="go" type="button" id="tiersGo">Faire un don</button>`, b => b.querySelector('#tiersGo').onclick = () => { closeDlg(); startDon(); });
}
function persoCard(P, compact) {
  const photos = P.photos && P.photos.length ? P.photos : [];
  const img = photos[0] ? `<img src="${esc(typeof photos[0] === 'string' ? photos[0] : photos[0].src)}" alt="">` : esc(P.prenom[0] + P.nom[0]);
  const lien = P.lien ? `<p><b>Son lien avec Initiatives-Cœur :</b> ${esc(P.lien)}</p>` : `<p><span class="draft">À compléter</span> Son lien avec Initiatives-Cœur.</p>`;
  return `<div class="top"><div class="avatar" style="background:#ce111e">${img}</div><div><small>Personnalité du projet</small><h3>${esc(P.prenom)} ${esc(P.nom)}</h3><p>${esc(P.titre)}</p></div></div>
    ${compact ? '' : photoStrip(P)}<p>${esc(P.bio)}</p>${lien}${compact ? `<button class="btn small" type="button" onclick="window.__openPerso(${PERS.indexOf(P)})">Voir sa fiche</button>` : ''}`;
}
function photoStrip(P) {
  const ph = (P.photos || []).map(p => typeof p === 'string' ? { src: p } : p);
  if (!ph.length) return `<div class="photos"><figure><div class="ph"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-8 8"/></svg>Photos à ajouter<br><small>dossier personnalites/ + data/personnalites.json</small></div></figure></div>`;
  return `<div class="photos">${ph.map(p => `<figure><img src="${esc(p.src)}" alt="${esc(P.prenom + ' ' + P.nom)}" loading="lazy">${p.credit ? `<figcaption>© ${esc(p.credit)}</figcaption>` : ''}</figure>`).join('')}</div>`;
}
const PALCOL = ['#2b5a87', '#2f7d6d', '#b8323a', '#9a6a12', '#ce111e'];
function openDonor(o) {
  if (o.perso >= 0) return openPerso(o.perso);
  const { row } = dec(o.slot), h = hOf(rowS(row)), k = o.e >= 0 ? ENF.enfants[o.e] : null;
  const pal = CFG.afficher_palier && o.pal >= 0 ? CTP.paliers[o.pal] : null;
  const ville = o.v >= 0 ? VILLES[o.v] : '', dep = o.v >= 0 ? DEPS[o.v] : null;
  const av = o.ph ? `<img src="${esc(o.ph)}" alt="">` : esc((o.p[0] || '') + (o.n[0] || ''));
  const voisins = o.v >= 0 ? D.filter(x => x.v === o.v && x !== o).length : 0;
  const html = `<div class="dcard">
    <div class="top"><div class="avatar big" style="background:${PALCOL[o.pal] || '#2b5a87'}">${av}</div>
      <div><h3>${esc(o.p)} ${esc(o.n)}</h3><p>${ville ? esc(ville) + (dep ? ' · ' + esc(dep[1]) : '') : 'Ville non indiquée'}</p>
      <div class="where">${pal ? `<span class="pill gold">${esc(pal.nom)}</span>` : ''}<span class="pill">À bord depuis le ${fdate(o.d)}</span>${o.local ? '<span class="pill red">Nouveau</span>' : ''}</div></div></div>
    ${o.b ? `<p class="bio">${esc(o.b)}</p>` : ''}
    ${o.m ? `<blockquote class="quote">« ${esc(o.m)} »<small>${o.local ? 'En attente de validation' : 'Son message'}</small></blockquote>` : ''}
    <div class="place"><small>Sa place sur le mât</small><b>${slotLabel(o.slot)}</b><span>${fmtM(h)} au-dessus du pont</span></div>
    ${k ? `<div class="kid"><small>Son don participe à sauver</small>${kidCard(k, true)}</div>` : ''}
    <div class="actions">
      <button class="btn primary" type="button" data-a="mat">Voir sur le mât</button>
      ${k ? `<button class="btn" type="button" data-a="kid">L'enfant aidé : ${esc(k.prenom)}</button>` : ''}
      <button class="btn" type="button" data-a="map">${voisins ? `Carte des donateurs (${voisins + 1} ${esc(deVille(ville))})` : 'Carte des donateurs'}</button>
      <a class="btn" href="${esc(CFG.boutique_url || '#')}" target="_blank" rel="noopener">Boutique solidaire</a>
      <button class="btn" type="button" data-a="share">Copier le lien de sa fiche</button>
    </div>
    <p class="fine">La fiche ne montre que ce que le donateur a accepté de rendre public. Jamais de montant ni d'adresse.</p></div>`;
  openDlg('Fiche donateur', html, b => {
    b.querySelector('[data-a=mat]').onclick = () => { closeDlg(); travel(o); };
    const kb = b.querySelector('[data-a=kid]'); if (kb) kb.onclick = () => openKid(k);
    b.querySelector('[data-a=map]').onclick = () => openMap(o.v);
    const sb = b.querySelector('[data-a=share]');
    sb.onclick = async () => { const url = location.href.split('#')[0] + '#fiche-' + o.slug; try { await navigator.clipboard.writeText(url); sb.textContent = 'Lien copié'; } catch (e) { sb.textContent = url; } };
  });
}
window.__openDonor = i => openDonor(D[i]);
function openPerso(k) {
  const P = PERS[k], o = D.find(x => x.perso === k);
  openDlg(P.prenom + ' ' + P.nom, `<div class="pcard">${persoCard(P, false)}</div><button class="go" type="button" id="pGo">Voir son nom sur le mât</button>`, b => b.querySelector('#pGo').onclick = () => { closeDlg(); travel(o); });
}
window.__openPerso = openPerso;
function openKids() {
  const done = ENF.enfants.filter(k => k.finance >= 1).length, tot = ENF.anterieurs + done;
  const head = document.createElement('div'); head.className = 'stats';
  head.innerHTML = `<div class="stat"><b>${nf(tot)}</b><span>enfants opérés avec Initiatives-Cœur</span></div><div class="stat"><b>${done}</b><span>financés grâce au mât</span></div><div class="stat"><b>${nf(ENF.cout)} €</b><span>pour sauver un enfant (voyage, opération, séjour)</span></div>`;
  const two = document.createElement('div'); two.className = 'two';
  const camp = {}; ENF.enfants.filter(k => k.finance >= 1).forEach(k => camp[k.iso] = (camp[k.iso] || 0) + 1);
  const rows = Object.entries(ENF.histo).map(([id, [nm, n]]) => [nm, n + (camp[id] || 0)]).sort((a, b) => b[1] - a[1]);
  const ol = document.createElement('ol'); ol.className = 'top'; const max = rows[0][1];
  rows.slice(0, 12).forEach(([nm, n]) => { const li = document.createElement('li'); li.innerHTML = `<b>${esc(nm)}</b><span>${n}</span><i style="width:${Math.round(n / max * 100)}%"></i>`; ol.appendChild(li); });
  two.append(worldMap(), ol);
  const h = document.createElement('h2'); h.textContent = 'Les enfants du mât';
  const grid = document.createElement('div'); grid.className = 'kids';
  ENF.enfants.forEach(k => { const d = document.createElement('div'); d.className = 'kid'; d.innerHTML = kidCard(k, true) + `<small>${plural(k.donateurs, 'donateur', 'donateurs')}</small>`; d.onclick = () => openKid(k); grid.appendChild(d); });
  const note = document.createElement('p'); note.className = 'fine'; note.textContent = ENF.note + ' Les 550 enfants opérés avant la campagne sont comptés par défaut ; répartition par pays illustrative. ● rouge : avant la campagne · ● vert : grâce au mât.';
  openDlg('Enfants sauvés', [head, two, h, grid, note]);
}
function openKid(k) {
  const donors = D.filter(o => o.e === ENF.enfants.indexOf(k));
  const pr = [...new Set(donors.map(o => o.p))];
  const map = worldMap(k.iso);
  const card = document.createElement('div'); card.className = 'kid'; card.innerHTML = kidCard(k, false);
  const ph = document.createElement('div'); ph.className = 'photos'; ph.innerHTML = `<figure><div class="ph"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-8 8"/></svg>Photo transmise par Mécénat Chirurgie Cardiaque<br>avec l'accord de la famille</div></figure>`;
  const info = document.createElement('div'); info.className = 'recap';
  info.innerHTML = [['Pays', `${k.pays} (${k.ville})`], ['Pathologie', k.patho], ['Séjour en France', k.arrivee ? `dès le ${fdate(k.arrivee)}${k.accueil ? ', famille d\'accueil à ' + k.accueil : ''}` : 'à venir'],
    ['Opération', k.operation ? `${fdate(k.operation)}${k.hopital ? ' à ' + k.hopital : ''}` : 'à venir'], ['Retour', k.retour ? fdate(k.retour) : '—'], ['Financement', `${Math.round(k.finance * 100)} % de ${nf(ENF.cout)} €`]]
    .map(([a, b]) => `<div><span>${a}</span><span>${esc(b)}</span></div>`).join('');
  const who = document.createElement('p'); who.className = 'sub';
  who.innerHTML = `<strong>${plural(donors.length, 'donateur', 'donateurs')}</strong> ${donors.length > 1 ? 'ont' : 'a'} contribué : ${esc(pr.slice(0, 40).join(', '))}${pr.length > 40 ? '…' : ''}`;
  const note = document.createElement('p'); note.className = 'fine'; note.textContent = 'Fiche fictive. Les vraies fiches seront publiées avec l\'accord des familles et de Mécénat Chirurgie Cardiaque, sans donnée médicale détaillée.';
  const two = document.createElement('div'); two.className = 'two kidtwo'; const L = document.createElement('div'), R = document.createElement('div');
  L.style.display = R.style.display = 'grid'; L.style.gap = R.style.gap = '12px'; L.append(ph, map); R.append(card, info); two.append(L, R);
  openDlg(`${k.prenom}, ${k.age} ans`, [two, who, note]);
}

/* =====================================================================  parcours de don */
const DS = { step: 1, amt: 15, slot: -1, p: '', n: '', ville: '', msg: '', ok: false };
const palierOf = m => { let k = 0; CTP.paliers.forEach((p, i) => { if (m >= p.min) k = i; }); return k; };
const autoOrder = (() => { const a = []; for (let r = 1; r <= NR; r++) for (const f of [0, 1]) for (let c = 0; c < NC; c++) a.push(enc(f, r, c)); return a; })();
const nextAuto = () => autoOrder.find(sl => owner[sl] < 0) ?? -1;
function startDon() {
  token++; spotSlot = -1; $('spot').classList.remove('show'); hideTip(); closeDlg(); audioInit();
  setView('don'); gotoStep(1);
  if (!$('villesList').children.length) $('villesList').innerHTML = VILLES.map(v => `<option value="${esc(v)}">`).join('');
}
$('btnDon').onclick = startDon; $('btnDon2').onclick = startDon;
$('donBack').onclick = () => { if (DS.step > 1) gotoStep(DS.step - 1); else { setPick(false); setView('home'); spotSlot = -1; $('spot').classList.remove('show', 'pick'); } };
function gotoStep(n) {
  DS.step = n; document.querySelectorAll('.dstep').forEach(d => d.classList.toggle('on', +d.dataset.step === n));
  $('steps').innerHTML = [1, 2, 3, 4].map(i => `<span class="${i <= n ? 'on' : ''}"></span>`).join('');
  setPick(n === 2 && DS.amt >= CFG.prix_choix);
  if (n === 1) renderAmounts();
  if (n === 2) renderPlace();
  if (n === 3) { if (!$('dPrenom').value && $('prenom').value) $('dPrenom').value = $('prenom').value; if (!$('dNom').value && $('nom').value) $('dNom').value = $('nom').value; drawSticker(); checkInfo(); }
  if (n === 4) renderRecap();
  $('panel').scrollTop = 0;
}
document.querySelectorAll('[data-next]').forEach(b => b.onclick = () => gotoStep(DS.step + 1));
function renderAmounts() {
  $('amounts').innerHTML = CFG.montants.map(m => `<button type="button" data-m="${m}" class="${DS.amt === m ? 'on' : ''}">${m} €</button>`).join('');
  $('amounts').querySelectorAll('button').forEach(b => b.onclick = () => { DS.amt = +b.dataset.m; $('amtOther').value = ''; renderAmounts(); });
  const P = CTP.paliers[palierOf(DS.amt)];
  $('tier').innerHTML = `<b>Palier <em>${esc(P.nom)}</em></b><span>${esc(P.accroche)}</span><ul>${P.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul><button class="chip blue" type="button" id="seeTiers">Tous les paliers et le tirage au sort</button>`;
  $('seeTiers').onclick = openTiers;
  const k = ENF.enfants.find(e => e.finance < 1) || ENF.enfants[ENF.enfants.length - 1];
  $('impact').innerHTML = `${nf(ENF.cout)} € permettent de sauver un enfant. Votre don de <strong>${DS.amt} €</strong> rejoint ceux qui financent l'opération de <strong>${esc(k.prenom)}, ${k.age} ans (${esc(k.pays)})</strong>, déjà financée à ${Math.round(k.finance * 100)} %.`;
}
$('amtOther').addEventListener('input', e => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); if (v >= CFG.prix_auto) { DS.amt = v; renderAmounts(); $('amtOther').value = v; } });
function setPick(on) { if (pickMode === on) return; pickMode = on; stage.classList.toggle('picking', on); $('pickbar').hidden = !on; redrawAll(); }
function renderPlace() {
  const box = $('placeBox'), q = $('quick');
  if (DS.amt < CFG.prix_choix) {
    const sl = nextAuto(); DS.slot = sl; const { row } = dec(sl);
    box.innerHTML = `<div class="place"><small>Place attribuée automatiquement</small><b>${slotLabel(sl)}</b><span>${fmtM(hOf(rowS(row)))} au-dessus du pont : la prochaine place libre en partant du pied du mât.</span></div>`;
    q.innerHTML = ''; q.append(chip(`Choisir ma place (dès ${CFG.prix_choix} €)`, 'perso', () => { DS.amt = CFG.prix_choix; DS.slot = -1; gotoStep(2); }));
    showSlot(sl, true); $('placeNext').disabled = false; return;
  }
  if (DS.slot >= 0 && owner[DS.slot] >= 0) DS.slot = -1;
  box.innerHTML = DS.slot >= 0 ? (() => { const { row } = dec(DS.slot); const nb = [0, 1, 2].filter(c => c !== dec(DS.slot).col).map(c => owner[enc(dec(DS.slot).f, row, c)]).filter(i => i >= 0).map(i => D[i].p + ' ' + D[i].n);
      return `<div class="place"><small>Votre place</small><b>${slotLabel(DS.slot)}</b><span>${fmtM(hOf(rowS(row)))} au-dessus du pont${nb.length ? ' · à côté de ' + esc(nb.join(' et ')) : ''}</span></div>`; })()
    : `<div class="place"><small>Comme dans un avion</small><b>Touchez une place libre</b><span>Les cases vertes sont libres. Faites glisser pour monter, tournez pour passer à bâbord.</span></div>`;
  q.innerHTML = '';
  const freeNear = (s, f) => { let best = -1, bd = 1e9; for (let sl = 0; sl < NS; sl++) { if (owner[sl] >= 0) continue; const d = dec(sl); if (f != null && d.f !== f) continue; const dd = Math.abs(rowS(d.row) - s); if (dd < bd) { bd = dd; best = sl; } } return best; };
  q.append(chip('Tout en haut', 'blue', () => selectSlot(freeNear(30))), chip('À mi-hauteur', 'blue', () => selectSlot(freeNear(14.5 / MAT.A[1]))),
    chip('Au hasard', 'blue', () => { let sl; do { sl = Math.floor(Math.random() * NS); } while (owner[sl] >= 0); selectSlot(sl); }));
  PERS.forEach((P, k) => { const o = D.find(x => x.perso === k); q.append(chip('Près de ' + esc(P.prenom + ' ' + P.nom), 'perso', () => selectSlot(freeNear(rowS(dec(o.slot).row), 0)))); });
  $('placeNext').disabled = DS.slot < 0;
}
function showSlot(sl, pick) { const { f, row } = dec(sl); spotSlot = sl; spotWhole = false; $('spot').classList.add('show'); $('spot').classList.toggle('pick', !!pick);
  $('spotTxt').textContent = 'Votre place · ' + fmtM(hOf(rowS(row))); const my = ++token; glideTo(rowS(row), f === 0 ? 0 : Math.PI, closeD(), my); }
function selectSlot(sl) { if (sl < 0 || owner[sl] >= 0) return; DS.slot = sl; showSlot(sl, true); renderPlace(); }
function drawSticker() {
  const cv = $('sticker'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.fillStyle = '#fafaf7'; ctx.fillRect(0, 0, W, H);
  const p = $('dPrenom').value.trim() || 'Prénom', n = $('dNom').value.trim() || 'Nom';
  const sl = DS.slot >= 0 ? DS.slot : nextAuto(), s = rowS(dec(sl).row), cellW = zoneW(s) / 3;
  const scale = W * 0.8 / cellW, rowPx = PITCH * scale;              // échelle : la case occupe 80 % de l'aperçu
  ctx.strokeStyle = '#c9ccd1'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeRect(W * .1, H / 2 - rowPx / 2, W * .8, rowPx); ctx.setLineDash([]);
  const fit = fitName(ctx, { p, n }, W * .8 - rowPx * .35, rowPx, false);
  ctx.fillStyle = '#13294b'; ctx.font = `600 ${fit.size}px ${STICK_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (fit.lines.length === 1) ctx.fillText(fit.lines[0], W / 2, H / 2 + fit.size * .05);
  else { ctx.fillText(fit.lines[0], W / 2, H / 2 - fit.size * .52); ctx.fillText(fit.lines[1], W / 2, H / 2 + fit.size * .55); }
  ctx.fillStyle = '#6b7a8c'; ctx.font = '600 20px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`Taille réelle : ${(cellW * 100).toFixed(1).replace('.', ',')} × ${(PITCH * 100).toFixed(1).replace('.', ',')} cm · lettres ≈ ${(fit.size / scale * 100 * 0.7).toFixed(1).replace('.', ',')} cm`, 12, H - 12);
}
['dPrenom', 'dNom'].forEach(id => $(id).addEventListener('input', () => { drawSticker(); checkInfo(); }));
$('dMsg').addEventListener('input', e => { $('dCount').textContent = `${e.target.value.length} / ${CFG.message_max}`; });
$('dOk').addEventListener('change', checkInfo);
$('dPhoto').addEventListener('change', e => {            // photo réduite à 320 px, gardée dans ce navigateur (prototype)
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const img = new Image(); img.onload = () => { const k = 320 / Math.max(img.width, img.height), cv = document.createElement('canvas');
    cv.width = Math.round(img.width * Math.min(1, k)); cv.height = Math.round(img.height * Math.min(1, k)); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    DS.photo = cv.toDataURL('image/jpeg', 0.82); $('dPhotoPrev').src = DS.photo; $('dPhotoPrev').hidden = false; URL.revokeObjectURL(img.src); };
  img.src = URL.createObjectURL(f);
}); $('dVille').addEventListener('input', checkInfo);
function checkInfo() { $('infoNext').disabled = !($('dPrenom').value.trim() && $('dNom').value.trim() && $('dOk').checked); }
function renderRecap() {
  DS.p = $('dPrenom').value.trim(); DS.n = $('dNom').value.trim(); DS.ville = $('dVille').value.trim(); DS.msg = $('dMsg').value.trim();
  const sl = DS.slot >= 0 ? DS.slot : nextAuto(), P = CTP.paliers[palierOf(DS.amt)];
  $('recap').innerHTML = [['Don', `${DS.amt} € · palier ${P.nom}`], ['Sur le mât', `${DS.p} ${DS.n}`], ['Place', `${slotLabel(sl)} · ${fmtM(hOf(rowS(dec(sl).row)))}`],
    ['Ville', DS.ville || '—'], ['Message', DS.msg || '—']].map(([a, b]) => `<div><span>${a}</span><span>${esc(b)}</span></div>`).join('');
  $('pay').textContent = `Payer ${DS.amt} € en toute sécurité`;
  $('payNote').textContent = CFG.don_url ? 'Vous allez être redirigé vers la page de dons sécurisée d\'Initiatives-Cœur. Votre place est réservée pendant ' + CFG.reservation_minutes + ' minutes.'
    : 'Prototype : le paiement n\'est pas encore branché au système de dons d\'Initiatives-Cœur. Le bouton simule un don accepté (enregistré seulement dans ce navigateur).';
}
$('pay').onclick = async () => {
  const sl = DS.slot >= 0 && owner[DS.slot] < 0 ? DS.slot : nextAuto(), ref = 'MAT-' + Date.now().toString(36).toUpperCase();
  if (CFG.don_url) {
    const u = CFG.don_url.replace('{montant}', DS.amt).replace('{ref}', ref);
    const q = new URLSearchParams({ emplacement: slotLabel(sl), place: sl, prenom: DS.p, nom: DS.n, ville: DS.ville, message: DS.msg });
    location.href = u + (u.includes('?') ? '&' : '?') + q.toString(); return;
  }
  const vi = VILLES.findIndex(v => norm(v) === norm(DS.ville));
  const kid = ENF.enfants.findIndex(e => e.finance < 1);
  const pub = $('dPub').checked;
  const o = { slot: sl, p: DS.p, n: DS.n, v: vi, pal: palierOf(DS.amt), m: DS.msg, perso: -1, d: new Date().toISOString().slice(0, 10), e: kid >= 0 ? kid : ENF.enfants.length - 1, local: true, i: D.length,
              b: pub ? $('dBio').value.trim() : '', ph: pub ? DS.photo || '' : '' };
  D.push(o); occupy(o); reindex();
  try { const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); saved.push(o); localStorage.setItem(LOCAL_KEY, JSON.stringify(saved)); } catch (e) {}
  setPick(false); redrawSlot(sl); renderStats(); $('dPrenom').value = $('dNom').value = $('dMsg').value = $('dBio').value = ''; $('dOk').checked = false; DS.photo = ''; $('dPhotoPrev').hidden = true;
  travel(o);
};

/* =====================================================================  démarrage */
renderStats();
function fromHash() {
  const h = decodeURIComponent(location.hash.slice(1)); if (!h) return;
  if (h === 'don') return startDon();
  if (h.startsWith('place-')) { const sl = +h.slice(6); if (sl >= 0 && sl < NS) { showSlot(sl, owner[sl] < 0); } return; }
  if (h.startsWith('fiche-')) { const o = bySlug.get(h.slice(6)); if (o) openDonor(o); return; }
  const o = bySlug.get(h); if (o) { $('prenom').value = o.p; $('nom').value = o.n; current = o; travel(o); }
}
addEventListener('hashchange', fromHash);
requestAnimationFrame(frame);
setTimeout(() => $('loading').classList.add('done'), 150);
fromHash();
window.__mat = { nav, D, owner, dec, enc, rowS, travel, tour, startDon, pickAt, screenRect, tiles, renderer, get dirty() { return dirty; }, set dirty(v) { dirty = v; } };
