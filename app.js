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
let landingSpin = false, dirty = true, spotSlot = -1, spotWhole = false, hoverSlot = -1, dragging = false;
const getJSON = u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fdate = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MOIS[m - 1]} ${y}`; };

const [MAT, DON, PERS, CTP, CFG, GEO, ENF, WORLD, SOI] = await Promise.all(
  ['mat', 'donateurs', 'personnalites', 'contreparties', 'config', 'geo', 'enfants', 'monde', 'soignants'].map(n => getJSON('data/' + n + '.json').catch(e => { if (n === 'soignants') return { soignants: [] }; throw e; })));
const SOIG = new Map(SOI.soignants.filter(x => x.autorise !== false).map(x => [x.id, x]));
// les fiches des personnalités peuvent être complétées sans reconstruire le site (data/personnalites.json + dossier personnalites/)

/* =====================================================================  places et donateurs */
const NR = MAT.NROWS, NC = MAT.COLS, NS = MAT.NSLOTS, Z = MAT.zones, PITCH = MAT.PITCH, CAP = MAT.CAP;
// face 0 = côté +X du modèle = bâbord (l'étrave est vers +Z) ; face 1 = tribord
const FACEN = ['Bâbord', 'Tribord'], COLN = ['A', 'B', 'C'];
const enc = (f, row, c) => (f * NR + row - 1) * NC + c;
const dec = s => { const f = Math.floor(s / (NR * NC)), r = s % (NR * NC); return { f, row: Math.floor(r / NC) + 1, col: r % NC }; };
function rowS(row) { for (const z of Z) if (row >= z.first && row < z.first + z.rows) return z.s0 + CAP + (row - z.first + .5) * PITCH; return NaN; }
function rowAt(s) { for (const z of Z) { const k = Math.floor((s - z.s0 - CAP) / PITCH); if (k >= 0 && k < z.rows) return z.first + k; } return 0; }
const hOf = s => s * MAT.A[1];                       // hauteur au-dessus du pont (le mât est incliné de 6°)
const slotLabel = sl => { const { f, row, col } = dec(sl); return `${FACEN[f]} · rang ${row} · place ${COLN[col]}`; };

const VILLES = DON.villes, DEPS = DON.deps;
const owner = new Int32Array(NS).fill(-1);
const CK = Object.assign({ cols: 6, rows: 36, w: 1.9, h: 0.84, cx: 0, cy: 1.36, z: -4.37, head: 0.085 }, MAT.cockpit || {}); CK.n = CK.cols * CK.rows;
const ckOwner = new Int32Array(CK.n).fill(-1);
const isCk = o => !!o && o.ck >= 0;
const ckLabel = c => `Cockpit · rang ${Math.floor(c / CK.cols) + 1} · place ${c % CK.cols + 1}`;
const D = DON.rows.map((r, i) => { const o = { i }; DON.cols.forEach((c, k) => o[c] = r[k]); return o; });
function occupy(o) {
  if (o.ck >= 0) { ckOwner[o.ck] = o.i; return; }
  if (o.perso >= 0) { const { f, row } = dec(o.slot); for (let c = 0; c < NC; c++) owner[enc(f, row, c)] = o.i; }
  else if (o.slot >= 0) owner[o.slot] = o.i;
}
D.forEach(occupy);
const LOCAL_KEY = 'nom-sur-le-mat-dons';
try { (JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')).forEach(o => { if (o.ck >= 0 ? ckOwner[o.ck] < 0 : owner[o.slot] < 0) { o.i = D.length; o.local = true; D.push(o); occupy(o); } }); } catch (e) {}

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
function profileRing(s) {           // profil complet (face 0 / bâbord de l'arrière vers l'avant, puis tribord)
  const k1 = kc(s), k2 = kt(s), out = [];
  for (let i = 0; i < HC.length; i++) out.push([HC[i] * k1, HA[i] * k2]);
  for (let i = HC.length - 2; i > 0; i--) out.push([HC[i] * k1, -HA[i] * k2]);
  return out;
}
function radiusAt(s, th) {           // distance de l'axe à la surface dans la direction th (0 = bâbord, π = tribord, π/2 = avant)
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
  uniforms: { nmap: { value: wn }, env: { value: ENV }, time: { value: 0 }, flow: { value: 0 }, sunDir: { value: sunDir }, deep: { value: new THREE.Color(0x0a3a5e) }, camPos: { value: new THREE.Vector3() } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform sampler2D nmap; uniform samplerCube env; uniform float time, flow; uniform vec3 sunDir, deep, camPos; varying vec3 vW;
    vec3 nrm(vec2 p){ p += vec2(0., flow); vec3 a = texture2D(nmap, p*0.045 + vec2(time*0.011, time*0.007)).xzy*2.-1.;
      vec3 b = texture2D(nmap, p*0.11 + vec2(-time*0.013, time*0.017)).xzy*2.-1.;
      vec3 c = texture2D(nmap, p*0.012 + vec2(time*0.004, -time*0.003)).xzy*2.-1.;
      return normalize(a + b*0.6 + c*1.2 + vec3(0., 2.2, 0.)); }
    // écume : sillage derrière la poupe (z < -8,8 m), vague d'étrave et bord de coque ; le bateau file vers +z
    float hullW(float z){ return z < -2. ? mix(2.55, 2.9, clamp((z + 8.8) / 6.8, 0., 1.)) : 2.9 * sqrt(max(0., 1. - pow((z + 2.) / 13.4, 2.))); }
    float foam(vec2 p){ float x = abs(p.x), z = p.y, f = 0.;
      if (z < -8.6) { float t = -z - 8.6; f += exp(-pow(x / (1.4 + t * 0.12), 2.)) * exp(-t / 70.) * 0.9;
        f += exp(-pow((x - 2.2 - t * 0.33) / (0.5 + t * 0.045), 2.)) * exp(-t / 40.) * 0.75; }
      if (z > -8.8 && z < 11.6) { float w = hullW(z); f += exp(-pow((x - w - 0.2) / (0.35 + 0.25 * smoothstep(8., 11.5, z)), 2.)) * (0.45 + 0.5 * smoothstep(4., 11.4, z)); }
      return f; }
    void main(){ vec3 V = normalize(camPos - vW); float d = length(camPos - vW);
      vec3 N = normalize(mix(nrm(vW.xz), vec3(0.,1.,0.), clamp(d/2500., 0., .85)));
      vec3 R = reflect(-V, N); R.y = abs(R.y);
      float fr = 0.02 + 0.6 * pow(1. - max(dot(N, V), 0.), 5.);
      vec3 col = mix(deep * (0.65 + 0.35 * max(dot(N, sunDir), 0.)), textureCube(env, R).rgb * 0.85, fr) + vec3(1., .95, .85) * pow(max(dot(R, sunDir), 0.), 220.) * 7.;
      vec2 q = vW.xz + vec2(0., flow); float n1 = texture2D(nmap, q * 0.31).r, n2 = texture2D(nmap, q * 0.083 + 0.37).g;
      float fo = smoothstep(0.32, 0.85, foam(vW.xz) * (0.45 + 0.9 * n1 * n2 * 1.6));
      col = mix(col, vec3(0.9, 0.94, 0.97), fo * 0.88);
      gl_FragColor = vec4(col, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
const water = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), seaMat); water.position.y = 0.45; scene.add(water);

const BOAT_SPEED = 5.5;                       // m/s (≈ 11 nœuds) : la mer défile, le bateau navigue
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
const BOATC = new THREE.Vector3(0, 12.5, -1.0), WUP = new THREE.Vector3(0, 1, 0), _bc = new THREE.Vector3();
const S_MIN = 0.35, S_MAX = 30.6, TH_MIN = -0.55, TH_MAX = Math.PI + 0.55, D_MIN = 0.28, D_MAX = 46;
const D0 = isMobile() ? 0.85 : 1.5;
const nav = { s: 1.3, th: 0.0, d: D0, ts: 1.3, tth: 0.0, td: D0, vs: 0, vth: 0, auto: false };
const visH = (d = nav.d) => 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
const mpp = () => visH() / stage.clientHeight;                       // mètres par pixel à la surface du mât
function closeD() { return clamp((stage.clientHeight * PITCH / 30) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))), 0.35, 1.6); }
const _m = new THREE.Matrix4(), _t = new THREE.Vector3(), _p = new THREE.Vector3(), _u = new THREE.Vector3();
const NEAR0 = camera.near;
function placeCamera() {
  if (camOverride) { camera.position.copy(camOverride.p); camera.up.copy(camOverride.u); _m.lookAt(camOverride.p, camOverride.t, camOverride.u); camera.quaternion.setFromRotationMatrix(_m); return; }
  const nr = ck.on && !camOverride ? Math.max(NEAR0, ck.d - 0.15) : NEAR0; if (Math.abs(camera.near - nr) > 1e-4) { camera.near = nr; camera.updateProjectionMatrix(); }
  if (ck.on) { ckPose(ck.x, ck.y, ck.d, _p, _t); camera.position.copy(_p); camera.up.copy(WUP); _m.lookAt(_p, _t, WUP); camera.quaternion.setFromRotationMatrix(_m); return; }
  const k = THREE.MathUtils.smoothstep(nav.d, 2.5, 14);
  const s = lerp(nav.s, clamp(nav.s, 6, 20), k);
  const dir = XS.clone().multiplyScalar(Math.cos(nav.th)).addScaledVector(CH, Math.sin(nav.th));
  const axisP = B.clone().addScaledVector(AX, s);
  _bc.set(BOATC.x, nav.cy ?? BOATC.y, BOATC.z); _t.copy(axisP).lerp(_bc, k);
  _p.copy(_t).addScaledVector(dir, radiusAt(s, nav.th) + nav.d).addScaledVector(WUP, k * nav.d * (nav.el ?? 0.18));
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

/* =====================================================================  cockpit : plaque des donateurs sur la cloison avant du cockpit */
const ckCanvas = document.createElement('canvas'), CKTX = isMobile() ? 2048 : 4096;
ckCanvas.width = CKTX; ckCanvas.height = Math.round(CKTX * CK.h / CK.w);
const ckTex = new THREE.CanvasTexture(ckCanvas); ckTex.colorSpace = THREE.SRGBColorSpace; ckTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const ckMesh = new THREE.Mesh(new THREE.PlaneGeometry(CK.w, CK.h), new THREE.MeshBasicMaterial({ map: ckTex, toneMapped: false, color: 0xeeeeee }));
ckMesh.position.set(CK.cx, CK.cy, CK.z); ckMesh.rotation.y = Math.PI; boat.add(ckMesh);
const ckFrame = new THREE.Mesh(new THREE.BoxGeometry(CK.w + 0.05, CK.h + 0.05, 0.018), new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.5, metalness: 0.2 }));
ckFrame.position.set(CK.cx, CK.cy, CK.z + 0.012); boat.add(ckFrame);
const ckLamp = new THREE.PointLight(0xfff1dd, 2.2, 3.2, 1.6); ckLamp.position.set(CK.cx, CK.cy + 0.55, CK.z - 0.9); boat.add(ckLamp);
const ckHeadPx = () => ckCanvas.height * CK.head / CK.h, ckRowPx = () => (ckCanvas.height - ckHeadPx() - ckCanvas.height * 0.012) / CK.rows, ckColPx = () => ckCanvas.width / CK.cols;
let ckSel = -1;
function drawCk() {
  const ctx = ckCanvas.getContext('2d'), W = ckCanvas.width, H = ckCanvas.height, hp = ckHeadPx(), rp = ckRowPx(), cp = ckColPx();
  ctx.fillStyle = '#f7f6f2'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ce111e'; ctx.fillRect(0, 0, W, hp);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${hp * 0.5}px ${STICK_FONT}`;
  ctx.fillText("ILS NAVIGUENT AVEC VIOLETTE  ·  COCKPIT D'INITIATIVES-CŒUR", W / 2, hp * 0.54);
  heartPath(ctx, hp * 0.62, hp * 0.52, hp * 0.62); ctx.fill(); heartPath(ctx, W - hp * 0.62, hp * 0.52, hp * 0.62); ctx.fill();
  for (let c = 0; c < CK.n; c++) {
    const col = c % CK.cols, row = Math.floor(c / CK.cols), x = col * cp, y = hp + row * rp, i = ckOwner[c];
    if (pickMode && DS.zone === 'ck') { ctx.fillStyle = c === ckSel ? '#ffd9db' : i < 0 ? '#d9f3e4' : '#f7f6f2'; ctx.fillRect(x + 2, y + 1, cp - 4, rp - 2); }
    if (row % 2 === 0) { ctx.fillStyle = 'rgba(19,41,75,.035)'; ctx.fillRect(x, y, cp, rp); }
    if (i >= 0) { const o = D[i], fit = fitName(ctx, o, cp * 0.9, rp, false); ctx.fillStyle = '#13294b'; ctx.font = `600 ${fit.size}px ${STICK_FONT}`;
      if (fit.lines.length === 1) ctx.fillText(fit.lines[0], x + cp / 2, y + rp / 2 + fit.size * .04);
      else { ctx.fillText(fit.lines[0], x + cp / 2, y + rp / 2 - fit.size * .5); ctx.fillText(fit.lines[1], x + cp / 2, y + rp / 2 + fit.size * .55); } }
    else if (c === ckSel) { ctx.fillStyle = '#ce111e'; ctx.font = `700 ${rp * 0.5}px ${STICK_FONT}`; ctx.fillText('VOTRE NOM ICI', x + cp / 2, y + rp / 2); }
  }
  ctx.strokeStyle = 'rgba(19,41,75,.12)'; ctx.lineWidth = Math.max(1, W / 2000);
  for (let col = 1; col < CK.cols; col++) { ctx.beginPath(); ctx.moveTo(col * cp, hp); ctx.lineTo(col * cp, H); ctx.stroke(); }
  ckTex.needsUpdate = true; dirty = true;
}
// position (repère de la plaque, x vers la droite vue depuis l'arrière, y vers le haut) → repère du bateau
const ckLocal = (u, v) => new THREE.Vector3(CK.cx - (u - 0.5) * CK.w, CK.cy + (0.5 - v) * CK.h, CK.z);   // u, v ∈ [0, 1], v vers le bas
function ckCellUV(c) { const col = c % CK.cols, row = Math.floor(c / CK.cols), H = ckCanvas.height, hp = ckHeadPx(), rp = ckRowPx();
  return { u0: col / CK.cols, u1: (col + 1) / CK.cols, v0: (hp + row * rp) / H, v1: (hp + (row + 1) * rp) / H }; }
function ckRect(c) {
  rig.updateMatrixWorld(); camera.updateMatrixWorld(); const q = ckCellUV(c), r = stage.getBoundingClientRect(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [u, v] of [[q.u0, q.v0], [q.u1, q.v0], [q.u0, q.v1], [q.u1, q.v1]]) { _v.copy(ckLocal(u, v)).applyMatrix4(rig.matrixWorld).project(camera); if (_v.z > 1) return null;
    const x = (_v.x + 1) / 2 * r.width, y = (1 - _v.y) / 2 * r.height; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
function ckPick(cx, cy) {
  const r = canvas.getBoundingClientRect(); _ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  rig.updateMatrixWorld(); camera.updateMatrixWorld(); ray.setFromCamera(_ndc, camera);
  const hit = ray.intersectObject(ckMesh, false)[0]; if (!hit || !hit.uv) return null;
  const px = hit.uv.x * ckCanvas.width, py = (1 - hit.uv.y) * ckCanvas.height, row = Math.floor((py - ckHeadPx()) / ckRowPx()), col = Math.floor(px / ckColPx());
  if (row < 0 || row >= CK.rows || col < 0 || col >= CK.cols) return null; return row * CK.cols + col;
}
const ckCellCenter = c => { const q = ckCellUV(c); return { x: ((q.u0 + q.u1) / 2 - 0.5) * CK.w, y: (0.5 - (q.v0 + q.v1) / 2) * CK.h }; };
// caméra du cockpit : on regarde la plaque depuis l'arrière ; x, y décalage sur la plaque, d distance
const ck = { on: false, x: 0, y: 0, d: 1.5, tx: 0, ty: 0, td: 1.5 };
const ckCloseD = () => clamp(isMobile() ? 0.42 : 0.6, 0.3, 1);
function ckPose(x, y, d, P, T) { T.set(CK.cx - x, CK.cy + y, CK.z); P.set(CK.cx - x * 0.92, CK.cy + y + 0.04 + d * 0.06, CK.z - d); }
let camOverride = null;                                        // animation de caméra libre (entrée / sortie du cockpit)
function mastPose(P, T, U) {                                   // même calcul que placeCamera, sans toucher la caméra
  const k = THREE.MathUtils.smoothstep(nav.td, 2.5, 14), s = lerp(nav.ts, clamp(nav.ts, 6, 20), k);
  const dir = XS.clone().multiplyScalar(Math.cos(nav.tth)).addScaledVector(CH, Math.sin(nav.tth)), axisP = B.clone().addScaledVector(AX, s);
  _bc.set(BOATC.x, nav.cy ?? BOATC.y, BOATC.z); T.copy(axisP).lerp(_bc, k);
  P.copy(T).addScaledVector(dir, radiusAt(s, nav.tth) + nav.td).addScaledVector(WUP, k * nav.td * (nav.el ?? 0.18)); U.copy(AX).lerp(WUP, k).normalize();
}
function flyPath(pts, ms, my) {      // pts = [{p, t, u}] ; trajectoire Catmull-Rom pour p, lissée pour t et u
  return new Promise(res => {
    const n = pts.length - 1, t0 = performance.now(); nav.auto = true;
    const cr = (a, b, c, d, u) => { const u2 = u * u, u3 = u2 * u; return b.clone().multiplyScalar(2).add(c.clone().sub(a).multiplyScalar(u)).add(a.clone().multiplyScalar(2).sub(b.clone().multiplyScalar(5)).add(c.clone().multiplyScalar(4)).sub(d).multiplyScalar(u2)).add(b.clone().multiplyScalar(3).sub(a).sub(c.clone().multiplyScalar(3)).add(d).multiplyScalar(u3)).multiplyScalar(0.5); };
    (function st(now) {
      if (my !== token) { camOverride = null; nav.auto = false; return res(false); }
      const e0 = Math.min(1, (now - t0) / ms), e = e0 * e0 * (3 - 2 * e0), f = e * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
      const P = cr(pts[Math.max(0, i - 1)].p, pts[i].p, pts[i + 1].p, pts[Math.min(n, i + 2)].p, u);
      const T = pts[i].t.clone().lerp(pts[i + 1].t, u * u * (3 - 2 * u)), U = pts[i].u.clone().lerp(pts[i + 1].u, u).normalize();
      camOverride = { p: P, t: T, u: U }; dirty = true;
      if (e0 >= 1) { camOverride = null; nav.auto = false; return res(true); } requestAnimationFrame(st);
    })(t0);
  });
}
function curPose() { const P = camera.position.clone(), D3 = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const dist = ck.on ? ck.d : Math.max(1, nav.d); return { p: P, t: P.clone().addScaledVector(D3, dist), u: camera.up.clone() }; }
async function enterCockpit(x = 0, y = 0, d = 1.5, my = ++token) {
  stopAuto(); hideTip(); landingSpin = false; spotSlot = -1; $('spot').classList.remove('show');
  const A = curPose(), out = A.p.clone().add(new THREE.Vector3(A.p.x, 0, A.p.z - B.z).setY(0).normalize().multiplyScalar(ck.on ? 0 : 3)).setY(Math.max(A.p.y, 4));
  const P3 = new THREE.Vector3(), T3 = new THREE.Vector3(); ckPose(x, y, d, P3, T3);
  const pts = ck.on ? [A, { p: P3, t: T3, u: WUP.clone() }] : [A, { p: out, t: A.t.clone().lerp(new THREE.Vector3(0, 3, -4), .5), u: WUP.clone() },
    { p: new THREE.Vector3(0, 6.5, -20), t: new THREE.Vector3(0, 2.4, -5), u: WUP.clone() }, { p: new THREE.Vector3(0, 1.9, -10.5), t: new THREE.Vector3(0, 1.45, -4.4), u: WUP.clone() }, { p: P3, t: T3, u: WUP.clone() }];
  setCkMode(true); ck.x = ck.tx = x; ck.y = ck.ty = y; ck.d = ck.td = d;
  audioInit(); ambOn(); const ok = await flyPath(pts, ck.on && pts.length === 2 ? 1100 : 4200, my); setTimeout(() => ambOff(), 1200); return ok;
}
async function leaveCockpit(my = ++token) {
  if (!ck.on) return true; hideTip(); spotSlot = -1; $('spot').classList.remove('show');
  const A = curPose(), P = new THREE.Vector3(), T = new THREE.Vector3(), U = new THREE.Vector3(); mastPose(P, T, U);
  const pts = [A, { p: new THREE.Vector3(0, 1.9, -10.5), t: new THREE.Vector3(0, 1.6, -4), u: WUP.clone() }, { p: new THREE.Vector3(0, 6.5, -20), t: new THREE.Vector3(0, 3, -5), u: WUP.clone() }, { p: P, t: T, u: U }];
  setCkMode(false); const ok = await flyPath(pts, 3600, my); return ok;
}
function setCkMode(on) {
  ck.on = on; app.classList.toggle('in-ck', on); $('ckTxt').textContent = on ? 'Mât' : 'Cockpit';
  $('alti').style.display = on ? 'none' : ''; $('btnFlip').hidden = on; dirty = true;
}
let spotCk = -1;
async function travelCk(o) {
  const my = ++token; current = o; audioInit(); spotSlot = -1; spotCk = -1; $('spot').classList.remove('show', 'pick'); hideTip();
  setView('travel'); $('climbWho').textContent = o.p + ' ' + o.n; $('alti').classList.remove('armed');
  const c = ckCellCenter(o.ck); if (!await enterCockpit(c.x, c.y, ckCloseD(), my) || my !== token) return;
  spotCk = o.ck; $('spotTxt').textContent = (o.local ? 'Vous êtes ici' : o.p + ' est ici') + ' · cockpit'; $('spot').classList.add('show'); dirty = true;
  renderDone(o); setTimeout(() => { if (my === token) setView('done'); }, reduce ? 0 : 500);
  try { history.replaceState(null, '', '#' + o.slug); } catch (e) {}
}
function ckTap(x, y) {
  const c = ckPick(x, y); if (c == null) { hideTip(); return; }
  const i = ckOwner[c], o = i >= 0 ? D[i] : null, rect = ckRect(c);
  if (pickMode && DS.zone === 'ck') { if (!o) { selectCk(c); return; } showTipRect(rect, `<b>Place prise</b><small>${esc(o.p)} ${esc(o.n)} · ${ckLabel(c)}</small>`); return; }
  if (!o) { showTipRect(rect, `<b>Place libre dans le cockpit</b><small>${ckLabel(c)}</small><button class="btn red small" type="button" id="ckRes">Réserver cette place</button>`);
    $('ckRes').onclick = () => { hideTip(); startDon(); DS.zone = 'ck'; DS.amt = Math.max(DS.amt, CFG.prix_cockpit || 30); renderAmounts(); gotoStep(2); selectCk(c); }; return; }
  hideTip(); openDonor(o);
}
function showTipRect(r, html) {
  const tip = $('tip'); tip.innerHTML = html; tip.hidden = false; r = r || { x0: stage.clientWidth / 2, x1: stage.clientWidth / 2, y0: stage.clientHeight / 2, y1: stage.clientHeight / 2 };
  const tw = tip.offsetWidth, th = tip.offsetHeight; let x = (r.x0 + r.x1) / 2 - tw / 2, y = r.y0 - th - 10; if (y < 50) y = r.y1 + 10;
  tip.style.left = clamp(x, 8, stage.clientWidth - tw - 70) + 'px'; tip.style.top = clamp(y, 50, stage.clientHeight - th - 8) + 'px';
}
function selectCk(c) { if (c < 0 || ckOwner[c] >= 0) return; DS.ck = c; ckSel = c; drawCk(); const cc = ckCellCenter(c);
  if (!ck.on) enterCockpit(cc.x, cc.y, ckCloseD()); else { ck.tx = cc.x; ck.ty = cc.y; ck.td = ckCloseD(); }
  spotCk = c; $('spotTxt').textContent = 'Votre place · cockpit'; $('spot').classList.add('show', 'pick'); renderPlace(); }
$('btnCk').onclick = async () => { if (ck.on) { spotCk = -1; await leaveCockpit(); } else { spotSlot = -1; enterCockpit(0, 0, isMobile() ? 1.9 : 1.5); } };

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
  if (ck.on && !nav.auto) { const k2 = 1 - Math.exp(-dt * 10); ck.tx = clamp(ck.tx, -CK.w / 2, CK.w / 2); ck.ty = clamp(ck.ty, -CK.h / 2, CK.h / 2); ck.td = clamp(ck.td, 0.25, 2.6);
    ck.x += (ck.tx - ck.x) * k2; ck.y += (ck.ty - ck.y) * k2; ck.d += (ck.td - ck.d) * k2; if (Math.abs(ck.tx - ck.x) + Math.abs(ck.ty - ck.y) + Math.abs(ck.td - ck.d) > 1e-4) dirty = true; }
  const moving = Math.abs(nav.ts - nav.s) > 1e-4 || Math.abs(nav.tth - nav.th) > 1e-4 || Math.abs(nav.td / nav.d - 1) > 1e-4 || nav.auto;
  const t = (now - clock0) / 1000;
  if (moving || dirty || now - lastRender > 45) {
    setRig(t); anemo.rotation.y = t * 9; seaMat.uniforms.time.value = t; seaMat.uniforms.flow.value = t * BOAT_SPEED;
    if (!window.__freeCam) placeCamera(); rig.updateMatrixWorld();
    camera.getWorldPosition(seaMat.uniforms.camPos.value);
    if (now - lastLOD > 120 || dirty) { updateLOD(); lastLOD = now; }
    renderer.render(scene, camera); lastRender = now; dirty = false;
    updateOverlays();
  }
  requestAnimationFrame(frame);
}
function updateOverlays() {
  const h = hOf(nav.s); setAlti(h);
  $('faceLbl').textContent = nav.d > 6 ? 'Vue d\'ensemble' : (Math.cos(nav.th) >= 0 ? FACEN[0] : FACEN[1]);
  $('flipTxt').textContent = Math.cos(nav.th) >= 0 ? FACEN[1] : FACEN[0];
  if (ck.on || camOverride) $('faceLbl').textContent = ck.on ? 'Cockpit' : $('faceLbl').textContent;
  const sp = $('spot');
  if (spotCk >= 0 && ck.on && !camOverride) placeBox(sp, ckRect(spotCk), 5);
  else if (spotSlot >= 0 && !ck.on) placeBox(sp, screenRect(spotSlot, spotWhole), 5);
  const hv = $('hover');
  if (hoverSlot >= 0 && !ck.on && !(spotSlot >= 0 && hoverSlot === spotSlot)) { hv.classList.add('show'); placeBox(hv, screenRect(hoverSlot), 2); } else hv.classList.remove('show');
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
    if (pinch0 > 0) { if (ck.on) ck.td = clamp(ck.td * pinch0 / dd, 0.25, 2.6); else nav.td = clamp(nav.td * pinch0 / dd, D_MIN, D_MAX); } pinch0 = dd; dragging = true; return;
  }
  if (!dragging && downInfo && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) > 6) { dragging = true; canvas.classList.add('dragging'); hint(false); }
  if (!dragging) return;
  if (ck.on) { const m = 2 * ck.d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / stage.clientHeight; ck.tx -= dx * m; ck.ty += dy * m; return; }
  const now = performance.now(), dtm = Math.max(12, now - lastMoveT) / 1000; lastMoveT = now;
  const ds = dy * mpp(), dth = -dx / stage.clientWidth * 2.2;
  nav.ts = clamp(nav.ts + ds, S_MIN, S_MAX); nav.tth = clamp(nav.tth + dth, TH_MIN, TH_MAX);
  const vcap = Math.max(1.5, visH() * 4);
  nav.vs = clamp(lerp(nav.vs, ds / dtm, 0.5), -vcap, vcap); nav.vth = clamp(lerp(nav.vth, dth / dtm, 0.5), -3, 3);
});
const endPtr = e => {
  if (!pointers.has(e.pointerId)) return; pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    if (!dragging && downInfo && performance.now() - downInfo.t < 600) (ck.on ? ckTap : tapAt)(e.clientX, e.clientY);
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
  if (ck.on) { if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) < 1) ck.td *= Math.exp(e.deltaY * k * 0.0016); else ck.tx += e.deltaX * k * 0.0012; return; }
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
function hoverAt(x, y) { if (ck.on) return; const now = performance.now(); if (now - hoverT < 40) return; hoverT = now; const sl = pickAt(x, y); if (sl !== hoverSlot) { hoverSlot = sl ?? -1; $('hover').classList.toggle('free', hoverSlot >= 0 && owner[hoverSlot] < 0); dirty = true; } }
$('btnFlip').onclick = () => { stopAuto(); nav.tth = Math.cos(nav.tth) >= 0 ? Math.PI : 0; if (nav.td > 4) nav.td = D0; };
$('btnOver').onclick = () => { stopAuto(); if (nav.td > 6) { nav.td = D0; } else { nav.td = 34; nav.tth = 0.55; } };
$('btnIn').onclick = () => { if (ck.on) ck.td /= 1.5; else nav.td = clamp(nav.td / 1.5, D_MIN, D_MAX); };
$('btnOut').onclick = () => { if (ck.on) ck.td *= 1.5; else nav.td = clamp(nav.td * 1.5, D_MIN, D_MAX); };
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
  if (isCk(o)) return travelCk(o);
  const my = ++token; current = o; audioInit(); ambOn(); spotCk = -1;
  if (ck.on) { setView('travel'); $('climbWho').textContent = o.p + ' ' + o.n; if (!await leaveCockpit(my) || my !== token) return; }
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

async function flyKeys(K, my) {           // K = [[t (s), s, th, d], …] ; d interpolé en log ; tangentes nulles aux extrémités
  const T = K[K.length - 1][0], val = (i, c) => c === 3 ? Math.log(K[i][c]) : K[i][c];
  const tan = (i, c) => i === 0 || i === K.length - 1 ? 0 : (val(i + 1, c) - val(i - 1, c)) / (K[i + 1][0] - K[i - 1][0]);
  const at = (t, c) => { let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
    const t0 = K[i][0], h = K[i + 1][0] - t0, u = clamp((t - t0) / h, 0, 1), u2 = u * u, u3 = u2 * u;
    const v = (2 * u3 - 3 * u2 + 1) * val(i, c) + (u3 - 2 * u2 + u) * h * tan(i, c) + (-2 * u3 + 3 * u2) * val(i + 1, c) + (u3 - u2) * h * tan(i + 1, c);
    return c === 3 ? Math.exp(v) : v; };
  const L = K[K.length - 1];
  if (reduce) { nav.s = nav.ts = L[1]; nav.th = nav.tth = L[2]; nav.d = nav.td = L[3]; dirty = true; return my === token; }
  nav.auto = true; const t0 = performance.now();
  await new Promise(res => { (function step(now) { if (my !== token) return res(); const t = Math.min(T, (now - t0) / 1000);
    nav.s = nav.ts = at(t, 1); nav.th = nav.tth = at(t, 2); nav.d = nav.td = at(t, 3); dirty = true;
    if (t >= T) return res(); requestAnimationFrame(step); })(performance.now()); });
  if (my !== token) return false;
  nav.auto = false; nav.s = nav.ts = L[1]; nav.th = nav.tth = L[2]; nav.d = nav.td = L[3]; return true;
}
// « Survol » : vol de drone — recul, tour complet au-dessus du bateau, retour sur le nom recherché
async function survol() {
  stopAuto(); const my = ++token; audioInit(); hideTip(); ambOn();
  const o = current, hadSpot = spotSlot; $('spot').classList.remove('show'); $('btnSurvol').classList.add('on');
  let back = { s: nav.s, th: nav.th, d: nav.d };
  if (ck.on) { spotCk = -1; if (!await leaveCockpit(my)) { $('btnSurvol').classList.remove('on'); return; } }
  if (o && !isCk(o)) { const { f, row } = dec(o.slot); back = { s: rowS(row), th: f === 0 ? 0 : Math.PI, d: closeD() }; }
  const th0 = nav.th, TAU = Math.PI * 2, thE = back.th + TAU * Math.round((th0 + TAU - back.th) / TAU);
  const K = [[0, nav.s, th0, nav.d], [2.6, clamp(nav.s, 4, 20), th0 + 0.35, 13], [6.2, 15, th0 + 1.5, 32], [10.2, 16, th0 + 3.3, 36],
    [13.8, 13, thE - 1.5, 24], [17.2, back.s, thE - 0.25, 5], [19.6, back.s, thE, back.d]];
  await flyKeys(K, my);
  $('btnSurvol').classList.remove('on'); setTimeout(() => { if (my === token) ambOff(); }, 1500);
  if (my !== token) return;
  nav.s = nav.ts = back.s; nav.th = nav.tth = back.th; nav.d = nav.td = back.d;
  if (o && isCk(o)) { travelCk(o); return; }
  if (o && hadSpot >= 0) { spotSlot = hadSpot; $('spot').classList.add('show'); } dirty = true;
}
$('btnSurvol').onclick = () => { if ($('btnSurvol').classList.contains('on')) { stopAuto(); $('btnSurvol').classList.remove('on'); } else survol(); };

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
  box.append(chip('Enfants sauvés', 'blue', () => openKids()), chip('Messages', 'blue', () => openMessages()), chip('Contreparties', 'blue', () => openTiers()),
    chip('Carte des donateurs', 'blue', () => openMap()), chip('Le mât en fun facts', 'blue', null, 'mat.html'), chip('Boutique solidaire', 'blue', null, CFG.boutique_url || '#'), chip('Toute la montée', 'blue', () => { audioInit(); tour(); }), sep());
  box.append(lab('Personnalités et influenceurs :')); PERS.forEach((P, k) => box.append(chip('♥ ' + esc(P.prenom + ' ' + P.nom), 'perso', () => go(D.find(o => o.perso === k)))));
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
// date d'une étape : « le 17 sept. 2026 » si elle a eu lieu, « prévue le … » sinon (dates prévisionnelles)
const dq = (d, done, w) => d ? (done ? ' le ' : ` ${w} le `) + fdate(d) : (done ? '' : ' (date à fixer)');
const moisDe = d => { const t = new Date(d + 'T12:00:00'); return 'en ' + t.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); };
function kidStatus(k) {
  const opere = acc(k, 'Opéré', 'Opérée'), rentre = acc(k, 'rentré', 'rentrée');
  return { rentree: `${opere} avec succès, ${rentre} ${k.pays === 'Haïti' ? 'en Haïti' : 'au pays'} le ${fdate(k.retour)}`,
    convalescence: `${opere} le ${fdate(k.operation)}, en convalescence dans sa famille d'accueil`,
    'en-france': `En France depuis le ${fdate(k.arrivee)}, opération prévue le ${fdate(k.operation)}`,
    'arrivee-prevue': `Arrivée en France prévue le ${fdate(k.arrivee)}`,
    dossier: `Dossier médical accepté, arrivée en France prévue le ${fdate(k.arrivee)}`,
    financement: `En cours de financement : ${Math.round(k.finance * 100)} %${k.arrivee ? `, arrivée envisagée ${moisDe(k.arrivee)}` : ''}` }[k.statut];
}
function kidSteps(k) {
  const st = k.statut, inFr = ['en-france', 'convalescence', 'rentree'].includes(st), op = ['convalescence', 'rentree'].includes(st);
  const L = [[true, 'Dossier médical accepté par Mécénat Chirurgie Cardiaque'], [k.finance >= 1, `Opération financée${k.finance < 1 ? ` (${Math.round(k.finance * 100)} %)` : ''}`],
    [inFr, `Arrivée en France${dq(k.arrivee, inFr, 'prévue')}${k.accueil ? ', famille d\'accueil à ' + k.accueil : ''}`],
    [op, `Opération${dq(k.operation, op, 'prévue')}${k.hopital ? ' à ' + k.hopital : ''}`],
    [st === 'rentree', `Retour ${k.pays === 'Haïti' ? 'en Haïti' : 'au pays'}${dq(k.retour, st === 'rentree', 'prévu')}`]];
  const firstTodo = L.findIndex(x => !x[0]);
  return L.map(([done, txt], j) => `<li class="${done ? 'ok' : j === firstTodo ? 'now' : ''}">${esc(txt)}</li>`).join('');
}
const avatarFor = (txt, col) => `<div class="avatar" style="background:${col}">${esc(txt)}</div>`;
const kidAvatar = (k, cls = '') => k.photo ? `<div class="avatar ${cls}" style="background:#b8323a"><img src="${esc(k.photo)}" alt="" loading="lazy" onerror="this.remove()"><span>${esc(k.prenom[0])}</span></div>` : avatarFor(k.prenom[0], '#b8323a');
// lien vers la fiche d'un donateur (prénom seul par défaut)
const donLink = (o, txt) => `<a class="dn" href="#fiche-${esc(o.slug)}" data-don="${o.i}" title="${esc(o.p + ' ' + o.n + (o.v >= 0 ? ' · ' + VILLES[o.v] : ''))}">${esc(txt ?? o.p)}</a>`;
document.addEventListener('click', e => { const a = e.target.closest('[data-don]'); if (!a) return; e.preventDefault(); const o = D[+a.dataset.don]; if (o) openDonor(o); });
function kidCard(k, compact) {
  return `<div class="top">${kidAvatar(k)}<div><small>Enfant n° ${k.num} · fiche fictive</small><h3>${esc(k.prenom)}, ${k.age} ans</h3><p>${esc(k.ville)}, ${esc(k.pays)}</p></div></div>
    <p><b>${esc(kidStatus(k))}</b></p><div class="prog"><i style="width:${Math.round(k.finance * 100)}%"></i></div>
    ${compact ? '' : `<p>${esc(k.patho)} : ${esc(k.simple)}</p><ul class="timeline">${kidSteps(k)}</ul>`}`;
}
function renderDone(o) {
  if (isCk(o)) return renderDoneCk(o);
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
  const nb = [], nm = i => i >= 0 ? `<strong>${donLink(D[i], D[i].p + ' ' + D[i].n)}</strong>` : null;
  if (!P) for (let c = 0; c < NC; c++) if (c !== col) { const w = owner[enc(f, row, c)]; if (w >= 0 && D[w].perso < 0) nb.push(nm(w) + (c < col ? ' juste avant vous' : ' juste après vous')); }
  const up = row < NR ? owner[enc(f, row + 1, P ? 1 : col)] : -1, dn = row > 1 ? owner[enc(f, row - 1, P ? 1 : col)] : -1;
  if (up >= 0) nb.push(nm(up) + ' juste au-dessus'); if (dn >= 0) nb.push(nm(dn) + ' juste en dessous');
  $('tNeigh').innerHTML = nb.length ? (P ? 'Ses voisins de mât : ' : 'Vos voisins de mât : ') + nb.join(', ') + '.' : '';
  // près de chez vous (prénoms seulement)
  const near = $('tNear'); near.innerHTML = '';
  if (o.v >= 0) {
    const ville = VILLES[o.v], dep = DEPS[o.v], sameV = D.filter(x => x.v === o.v && x !== o), sameD = D.filter(x => x.v >= 0 && DEPS[x.v][0] === dep[0] && x !== o);
    const names = list => list.slice(0, 14).map(x => donLink(x)).join(', ');
    near.innerHTML = `<div><strong>${plural(sameV.length, 'autre donateur', 'autres donateurs')} ${esc(deVille(ville))}</strong>${sameV.length ? ' : ' + names(sameV) + (sameV.length > 14 ? '…' : '') : ''}</div>
      <div><strong>${plural(sameD.length, 'donateur', 'donateurs')} dans ${esc(dansDep(dep))}</strong></div>`;
  }
  renderMyMap(o);
  $('tDyk').textContent = DYK[o.i % DYK.length];
}
function renderDoneCk(o) {
  const row = Math.floor(o.ck / CK.cols) + 1, col = o.ck % CK.cols + 1;
  $('tMerci').textContent = 'Merci '; $('tName').textContent = o.p + ' !'; document.querySelector('.thanks .merci').classList.toggle('long', (o.p.length + 7) > 13);
  const pills = [['red', 'Cockpit'], ['', `Rang ${row} · place ${col}`]]; if (CFG.afficher_palier && o.pal >= 0) pills.push(['gold', CTP.paliers[o.pal].nom]); if (o.local) pills.push(['red', 'Nouveau à bord']);
  $('tWhere').innerHTML = pills.map(([c, t]) => `<span class="pill ${c}">${esc(t)}</span>`).join('');
  const q = $('tQuote'); q.hidden = !o.m; q.innerHTML = o.m ? `« ${esc(o.m)} »<small>${o.local ? 'En attente de validation avant affichage public' : 'Message laissé lors du don'}${o.d ? ' · ' + fdate(o.d) : ''}</small>` : '';
  $('tPerso').hidden = true;
  const kidEl = $('tKid'), k = o.e >= 0 ? ENF.enfants[o.e] : null; kidEl.hidden = !k;
  if (k) { kidEl.innerHTML = `<small>Votre don participe à sauver</small>` + kidCard(k, true) + `<button class="btn small" type="button" id="kidMore">Voir sa fiche et son parcours</button>`; $('kidMore').onclick = () => openKid(k); }
  $('tFacts').innerHTML = [['Sous ses yeux', '≈ 1', 'm', 'de Violette quand elle barre ou règle ses voiles'], ['Autour du monde', '≈ 45 000', 'km', 'au Vendée Globe, dans le cockpit'],
    ['Votre place', `${row}·${col}`, '', `rang · colonne, sur ${CK.n} places`], ['Le cockpit', nf(ckOwner.filter(i => i >= 0).length), 'noms', 'déjà à bord']]
    .map(([l, v, u, sub]) => `<div class="fact"><small>${l}</small><b>${v}<u>${u}</u></b><span>${sub}</span></div>`).join('');
  const nb = [], at = (r, c) => r >= 0 && r < CK.rows && c >= 0 && c < CK.cols ? ckOwner[r * CK.cols + c] : -1, r0 = row - 1, c0 = col - 1;
  [[r0, c0 - 1, 'à gauche'], [r0, c0 + 1, 'à droite'], [r0 - 1, c0, 'au-dessus'], [r0 + 1, c0, 'en dessous']].forEach(([r, c, w]) => { const i = at(r, c); if (i >= 0) nb.push(`<strong>${donLink(D[i], D[i].p + ' ' + D[i].n)}</strong> ${w}`); });
  $('tNeigh').innerHTML = nb.length ? 'Vos voisins dans le cockpit : ' + nb.join(', ') + '.' : '';
  const near = $('tNear'); near.innerHTML = '';
  if (o.v >= 0) { const sameV = D.filter(x => x.v === o.v && x !== o); near.innerHTML = `<div><strong>${plural(sameV.length, 'autre donateur', 'autres donateurs')} ${esc(deVille(VILLES[o.v]))}</strong>${sameV.length ? ' : ' + sameV.slice(0, 14).map(x => donLink(x)).join(', ') + (sameV.length > 14 ? '…' : '') : ''}</div>`; }
  renderMyMap(o); $('tDyk').textContent = DYK[o.i % DYK.length];
}
$('replay').onclick = () => current && travel(current, { fromFoot: true });
$('myCard').onclick = () => current && openDonor(current);
$('shop').href = CFG.boutique_url || '#';
$('again').onclick = () => { token++; spotSlot = -1; $('spot').classList.remove('show'); $('alti').classList.remove('armed'); setView('home'); $('prenom').value = ''; $('nom').value = ''; $('prenom').focus();
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} };
$('copy').onclick = () => current ? openShare(current.local ? 'mine' : 'donor', current) : openShare('site');

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
      if (capEl) { const L = D.filter(o => o.v === i); capEl.innerHTML = `<strong>${esc(VILLES[i])}</strong> : ${plural(CNT[i], 'donateur', 'donateurs')} — ${L.slice(0, 24).map(o => donLink(o)).join(', ')}${L.length > 24 ? '…' : ''}`; } });
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
$('tMap').addEventListener('click', () => openMap(current));
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


/* =====================================================================  carte du monde des enfants (photos, trajets, zoom) */
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, at = {}, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in at) e.setAttribute(k, at[k]); if (parent) parent.appendChild(e); return e; };
function wproj(lon, lat) {               // projection Natural Earth I, identique à gen_world.py
  const P = WORLD.proj, l = lon * Math.PI / 180, p = lat * Math.PI / 180, p2 = p * p, p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [x * P.S - P.x0, -y * P.S - P.y0];
}
const KIDS = ENF.enfants.filter(k => k.lat != null);
const kidXY = k => wproj(k.lon, k.lat), hopXY = k => wproj(k.hop_lon, k.hop_lat);
const kidCol = k => ['rentree', 'convalescence'].includes(k.statut) ? 'var(--vert)' : k.finance < 1 ? '#f2a516' : 'var(--ciel)';
const kidStage = k => ({ rentree: 'Opéré·e et rentré·e', convalescence: 'Opéré·e', 'en-france': 'En France', 'arrivee-prevue': 'Arrivée prévue', dossier: 'Voyage en préparation', financement: 'En cours de financement' }[k.statut] || '');
// courbe pays → hôpital (arc tendu vers le nord)
function arcPath(a, b) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(b[0] - a[0], b[1] - a[1]); return `M${a[0]},${a[1]} Q${mx},${my - d * 0.28} ${b[0]},${b[1]}`; }
function drawBase(svg, opts = {}) {
  const camp = {}; KIDS.forEach(k => camp[k.iso] = (camp[k.iso] || 0) + 1);
  const gC = sv('g', { class: 'countries' }, svg);
  for (const [id, d] of Object.entries(WORLD.pays)) sv('path', { d, class: 'c' + (ENF.histo[id] || camp[id] ? ' on' : '') }, gC);
  const gH = sv('g', { class: 'histo' }, svg), bub = [];
  Object.entries(ENF.histo).filter(([id]) => WORLD.centres[id]).sort((a, b) => b[1][1] - a[1][1]).forEach(([id, [nm, n]]) => {
    const [x, y] = WORLD.centres[id], g = sv('g', { class: 'hb', transform: `translate(${x},${y})` }, gH);
    sv('circle', { r: 3 + 1.1 * Math.sqrt(n) }, g); sv('title', {}, g).textContent = `${nm} : ${n} enfants opérés avant la campagne`;
    bub.push({ g, x, y });
  });
  return { gH, bub };
}

// zoom / déplacement d'une carte SVG (molette, pincement, glisser, boutons) ; onApply(vb, u) avec u = unités SVG par pixel
function panZoom(svg, W, H, minW, onApply, onTap) {
  const vb = { x: 0, y: 0, w: W, h: H }; let asp = H / W;
  const maxW = () => Math.max(W, H / Math.max(asp, 0.05)) * 1.15;
  const clampVB = () => { vb.w = clamp(vb.w, minW, maxW()); vb.h = vb.w * asp; vb.x = clamp(vb.x, -vb.w * .5, W - vb.w * .5); vb.y = clamp(vb.y, -vb.h * .5, H - vb.h * .5); };
  const apply = () => { const r = svg.getBoundingClientRect(); if (r.width && r.height) asp = r.height / r.width; clampVB();
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); onApply(vb, vb.w / Math.max(r.width, 1)); };
  const zoomAt = (cx, cy, k) => { const r = svg.getBoundingClientRect(), mx = vb.x + (cx - r.left) / r.width * vb.w, my = vb.y + (cy - r.top) / r.height * vb.h;
    const nw = clamp(vb.w * k, minW, maxW()), kk = nw / vb.w; vb.x = mx - (mx - vb.x) * kk; vb.y = my - (my - vb.y) * kk; vb.w = nw; apply(); };
  let anim = 0;
  const flyTo = (cx, cy, w, ms = 650) => { const a = { ...vb }, my = ++anim, t0 = performance.now(), ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    (function st(now) { if (my !== anim) return; const t = Math.min(1, (now - t0) / ms), e = t * t * (3 - 2 * t), lw = Math.exp(lerp(Math.log(a.w), Math.log(w), e));
      vb.w = lw; vb.h = lw * asp; vb.x = lerp(ax, cx, e) - lw / 2; vb.y = lerp(ay, cy, e) - vb.h / 2; apply(); if (t < 1) requestAnimationFrame(st); })(t0); };
  const fitBox = (x0, y0, x1, y1, pad = 1.3, minWidth = 0) => { const r = svg.getBoundingClientRect(); if (r.width && r.height) asp = r.height / r.width;
    let w = Math.max((x1 - x0) * pad, (y1 - y0) * pad / asp, minWidth); w = Math.min(w, maxW());
    vb.w = w; vb.h = w * asp; vb.x = (x0 + x1) / 2 - w / 2; vb.y = (y0 + y1) / 2 - vb.h / 2; apply(); };
  svg.addEventListener('wheel', e => { e.preventDefault(); anim++; zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))); }, { passive: false });
  const ptr = new Map(); let pinch = 0, moved = 0, downEl = null;
  svg.addEventListener('pointerdown', e => { anim++; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 1) { moved = 0; downEl = e.target; }
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  svg.addEventListener('pointermove', e => { const p = ptr.get(e.pointerId); if (!p) return; const r = svg.getBoundingClientRect();
    if (ptr.size === 1) { const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) { try { svg.setPointerCapture(e.pointerId); } catch (er) {} vb.x -= dx / r.width * vb.w; vb.y -= dy / r.height * vb.h; apply(); }
      p.x = e.clientX; p.y = e.clientY; }
    else if (ptr.size === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch / d); pinch = d; moved += 10; } });
  const up = e => { ptr.delete(e.pointerId); pinch = 0; };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  // le « toucher » passe par l'événement click : pas de clic fantôme sur la fiche qui s'ouvre ensuite
  svg.addEventListener('click', e => { if (moved <= 6 && onTap) onTap(e.target, e); });
  const ro = new ResizeObserver(() => apply()); ro.observe(svg);
  return { vb, apply, zoomAt, flyTo, fitBox, zoomCenter: k => { const r = svg.getBoundingClientRect(); anim++; zoomAt(r.left + r.width / 2, r.top + r.height / 2, k); } };
}
// petite carte de la fiche enfant : sa photo à sa ville, les autres enfants en points, son trajet vers l'hôpital
function kidsMiniMap(focus) {
  const box = document.createElement('button'); box.type = 'button'; box.className = 'kmini'; box.setAttribute('aria-label', 'Agrandir la carte des enfants');
  const svg = sv('svg', { role: 'img' }); box.appendChild(svg);
  const pts = KIDS.flatMap(k => [kidXY(k), hopXY(k)]); if (focus) pts.push(kidXY(focus));
  let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  const pad = (x1 - x0) * 0.16; x0 -= pad; x1 += pad; y0 -= pad * 0.9; y1 += pad * 0.7;
  const w = x1 - x0, h = Math.max(y1 - y0, w * 0.56); y0 -= (h - (y1 - y0)) / 2;
  svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
  const { bub } = drawBase(svg); const u = w / 420;          // ≈ unités SVG par pixel pour une carte de 420 px
  bub.forEach(b => b.g.setAttribute('transform', `translate(${b.x},${b.y}) scale(${u})`));
  const gA = sv('g', { class: 'arcs' }, svg), gK = sv('g', {}, svg);
  KIDS.forEach(k => sv('path', { d: arcPath(kidXY(k), hopXY(k)), class: 'arc' + (k === focus ? ' on' : '') }, gA));
  KIDS.filter(k => k !== focus).forEach(k => { const [x, y] = kidXY(k); const c = sv('circle', { cx: x, cy: y, r: 4.2 * u, class: 'kdot', style: `fill:${kidCol(k)}` }, gK); sv('title', {}, c).textContent = `${k.prenom}, ${k.ville}`; });
  if (focus) {
    const [hx, hy] = hopXY(focus), hg = sv('g', { class: 'hop', transform: `translate(${hx},${hy}) scale(${u})` }, gK);
    sv('circle', { r: 6 }, hg); const t = sv('text', { x: 10, y: 4 }, hg); t.textContent = focus.hopital;
    const [x, y] = kidXY(focus), g = sv('g', { class: 'km focus', transform: `translate(${x},${y}) scale(${u})` }, gK);
    markerBody(g, focus, 30, true);
  }
  const cap = document.createElement('span'); cap.className = 'kcap'; cap.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>Agrandir la carte';
  box.appendChild(cap); box.onclick = () => openKidsMap(focus);
  return box;
}
let kmClip = 0;
function markerBody(g, k, R, focus) {
  const id = 'kc' + (++kmClip), cp = sv('clipPath', { id }, g); sv('circle', { r: R - 3 }, cp);
  if (focus) sv('circle', { r: R + 7, class: 'pulse' }, g);
  sv('circle', { r: R, class: 'ring', style: `stroke:${focus ? 'var(--coeur)' : kidCol(k)}` }, g);
  sv('circle', { r: R - 3, fill: '#b8323a' }, g);
  if (k.photo) { const im = sv('image', { href: k.photo, x: -(R - 3), y: -(R - 3), width: 2 * (R - 3), height: 2 * (R - 3), preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${id})` }, g); im.addEventListener('error', () => im.remove()); }
  const t = sv('text', { y: R + 15, class: 'nm' }, g); t.textContent = k.prenom;
  sv('title', {}, g).textContent = `${k.prenom}, ${k.age} ans — ${k.ville} (${k.pays}) · ${kidStage(k)}`;
}
// grande carte : zoom, déplacement, photos de tous les enfants, clic → fiche
function openKidsMap(focus) {
  const wrap = document.createElement('div'); wrap.className = 'kmap';
  const svg = sv('svg', { role: 'img', 'aria-label': 'Carte du monde des enfants opérés' }); wrap.appendChild(svg);
  const { bub } = drawBase(svg);
  const gA = sv('g', { class: 'arcs' }, svg), gL = sv('g', { class: 'leads' }, svg), gHop = sv('g', {}, svg), gK = sv('g', {}, svg);
  KIDS.forEach(k => sv('path', { d: arcPath(kidXY(k), hopXY(k)), class: 'arc' + (k === focus ? ' on' : '') }, gA));
  const hops = [...new Set(KIDS.map(k => k.hopital))].map(h => { const k = KIDS.find(x => x.hopital === h), [x, y] = hopXY(k), g = sv('g', { class: 'hop' }, gHop);
    sv('circle', { r: 5 }, g); const t = sv('text', { x: 9, y: 4 }, g); t.textContent = h;
    sv('title', {}, g).textContent = `${h} : chirurgie cardiaque pédiatrique — ${KIDS.filter(x => x.hopital === h).map(x => x.prenom).join(', ')}`; return { g, x, y }; });
  const M = KIDS.map(k => { const [x, y] = kidXY(k), g = sv('g', { class: 'km' + (k === focus ? ' focus' : ''), tabindex: 0, role: 'button', 'aria-label': `Fiche de ${k.prenom}` }, k === focus ? svg : gK);
    markerBody(g, k, k === focus ? 34 : 24, k === focus); const anchor = sv('circle', { r: 3.5, class: 'anchor' }, gL), lead = sv('line', { class: 'lead' }, gL);
    return { k, g, x, y, anchor, lead, R: k === focus ? 34 : 24 }; });
  // vue de départ : l'enfant et son hôpital, ou tous les enfants
  const pts = focus ? [kidXY(focus), hopXY(focus)] : KIDS.flatMap(k => [kidXY(k), hopXY(k)]);
  const Z = panZoom(svg, WORLD.w, WORLD.h, 40, (vb, u) => {
    bub.forEach(b => b.g.setAttribute('transform', `translate(${b.x},${b.y}) scale(${u})`));
    hops.forEach(h => { h.g.setAttribute('transform', `translate(${h.x},${h.y}) scale(${u})`); h.g.classList.toggle('lbl', vb.w < 160); });
    // les photos s'écartent quand elles se chevauchent, un trait les relie à la ville
    const P = M.map(m => ({ m, x: m.x / u, y: m.y / u, ax: m.x / u, ay: m.y / u }));
    for (let it = 0; it < 60; it++) for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j]; let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); const need = a.m.R + b.m.R + 22;
      if (d < need) { if (d < .01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; } const push = (need - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
    }
    P.forEach(p => { const m = p.m, x = p.x * u, y = p.y * u, moved = Math.hypot(p.x - p.ax, p.y - p.ay) > 3;
      m.g.setAttribute('transform', `translate(${x},${y}) scale(${u})`);
      m.anchor.setAttribute('cx', m.x); m.anchor.setAttribute('cy', m.y); m.anchor.setAttribute('r', 3.5 * u); m.anchor.style.display = moved ? '' : 'none';
      m.lead.setAttribute('x1', m.x); m.lead.setAttribute('y1', m.y); m.lead.setAttribute('x2', x); m.lead.setAttribute('y2', y); m.lead.style.display = moved ? '' : 'none'; });
  }, el => { const g = el.closest('.km'); const m = g && M.find(x => x.g === g); if (m) openKid(m.k); });
  const fit = () => { const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
    Z.fitBox(x0, y0, x1, y1, 1.5, focus ? 150 : 220); };
  M.forEach(m => m.g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openKid(m.k); } }));
  const ctr = document.createElement('div'); ctr.className = 'kctrl';
  ctr.innerHTML = '<button type="button" data-z="in" aria-label="Zoomer">+</button><button type="button" data-z="out" aria-label="Dézoomer">−</button><button type="button" data-z="all">Tous les enfants</button><button type="button" data-z="world">Monde</button>';
  ctr.onclick = e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.z === 'in') Z.zoomCenter(0.6); else if (b.dataset.z === 'out') Z.zoomCenter(1.6);
    else if (b.dataset.z === 'all') { pts.length = 0; KIDS.forEach(k => pts.push(kidXY(k), hopXY(k))); fit(); } else Z.fitBox(0, 0, WORLD.w, WORLD.h, 1, 0); };
  wrap.appendChild(ctr);
  const done = KIDS.filter(k => k.finance >= 1).length;
  const sub = document.createElement('p'); sub.className = 'sub';
  sub.textContent = `${nf(ENF.anterieurs + done)} enfants opérés grâce à Initiatives-Cœur et Mécénat Chirurgie Cardiaque. Touchez une photo pour ouvrir la fiche de l'enfant ; pincez ou utilisez la molette pour zoomer.`;
  const leg = document.createElement('div'); leg.className = 'klegend';
  leg.innerHTML = `<span><i class="lg-photo"></i>Enfants du mât (à leur ville)</span><span><i class="lg-histo"></i>Enfants opérés avant la campagne, par pays</span><span><i class="lg-arc"></i>Trajet vers l'hôpital en France</span>
    <span><i class="lg-dot" style="background:var(--vert)"></i>Opéré</span><span><i class="lg-dot" style="background:var(--ciel)"></i>Financé, voyage à venir</span><span><i class="lg-dot" style="background:#f2a516"></i>En cours de financement</span>`;
  openDlg(focus ? `Sur la carte : ${focus.prenom}` : 'Les enfants sur la carte du monde', [sub, wrap, leg], null, true);
  requestAnimationFrame(fit);
}

/* =====================================================================  partage (e-mail à plusieurs personnes, SMS, réseaux) */
const siteURL = () => location.href.split('#')[0];
const DE_PAYS = { 'Haïti': "d'Haïti", 'Madagascar': 'de Madagascar', "Côte d'Ivoire": "de Côte d'Ivoire", 'Guinée': 'de Guinée', 'Mauritanie': 'de Mauritanie' };
const dePays = p => DE_PAYS[p] || 'du ' + p;
const ficheURL = o => siteURL() + '#fiche-' + o.slug;
function shareTexts(kind, x) {
  const site = siteURL();
  if (kind === 'mine') { const o = x, k = o.e >= 0 ? ENF.enfants[o.e] : null, amt = o.amt ? ` de ${o.amt} €` : '';
    return { subject: 'Mon nom va faire le tour du monde avec Violette Dorange', short: `Mon nom est sur le bateau de Violette Dorange et j'aide à sauver un enfant ❤️ Toi aussi, dès 10 € :`,
      body: `Bonjour,\n\nJe viens d'aider à sauver un enfant ! J'ai fait un don${amt} à Initiatives-Cœur pour Mécénat Chirurgie Cardiaque, et mon nom embarque sur le bateau de Violette Dorange : il va faire le tour du monde avec elle, jusqu'au Vendée Globe 2028.\n\n${k ? `Mon don aide ${k.prenom}, ${k.age} ans, venu${acc(k, '', 'e')} ${dePays(k.pays)} pour être opéré${acc(k, '', 'e')} du cœur en France.\n\n` : ''}Toi aussi, tu peux mettre ton nom sur le bateau, dès 10 €, et aider un enfant : ${site}\n\nMon nom est ici : ${ficheURL(o)}\n\nÀ bientôt,\n${o.p}`, url: ficheURL(o) }; }
  if (kind === 'donor') { const o = x;
    return { subject: `${o.p} ${o.n} a son nom sur le bateau de Violette Dorange`, short: `${o.p} ${o.n} a son nom sur le bateau de Violette Dorange et aide à sauver un enfant ❤️`,
      body: `Bonjour,\n\nRegarde : ${o.p} ${o.n} a mis son nom sur le bateau de Violette Dorange pour aider Mécénat Chirurgie Cardiaque à faire opérer du cœur des enfants venus de loin.\n\nSa fiche : ${ficheURL(o)}\n\nToi aussi, dès 10 €, ton nom peut faire le tour du monde avec Violette : ${site}`, url: ficheURL(o) }; }
  if (kind === 'kid') { const k = x;
    return { subject: `L'histoire de ${k.prenom}, ${k.age} ans`, short: `${k.prenom}, ${k.age} ans, est soigné${acc(k, '', 'e')} grâce aux donateurs du bateau de Violette Dorange ❤️`,
      body: `Bonjour,\n\nJe te partage l'histoire de ${k.prenom}, ${k.age} ans, venu${acc(k, '', 'e')} de ${k.ville} (${k.pays}) pour être opéré${acc(k, '', 'e')} du cœur en France grâce à Mécénat Chirurgie Cardiaque et aux donateurs d'Initiatives-Cœur.\n\nEn mettant ton nom sur le bateau de Violette Dorange (dès 10 €), tu peux aider d'autres enfants comme ${acc(k, 'lui', 'elle')} : ${site}`, url: site }; }
  return { subject: 'Ton nom autour du monde sur le bateau de Violette Dorange', short: 'Dès 10 €, ton nom embarque sur le bateau de Violette Dorange et tu aides à sauver un enfant ❤️',
    body: `Bonjour,\n\nTu connais Violette Dorange ? Dès 10 €, ton prénom et ton nom peuvent embarquer sur son bateau, Initiatives-Cœur, et faire le tour du monde avec elle jusqu'au Vendée Globe 2028.\n\nChaque don aide Mécénat Chirurgie Cardiaque à faire opérer du cœur des enfants venus de loin. Et 5 donateurs tirés au sort navigueront avec Violette !\n\nC'est par ici : ${site}`, url: site };
}
function openShare(kind, x) {
  const T = shareTexts(kind, x), enc2 = encodeURIComponent;
  const html = `<div class="share">
    <p class="sub">Le texte est modifiable avant l'envoi.</p>
    <label>Destinataires <small>(une ou plusieurs adresses e-mail, séparées par des virgules — facultatif)</small><input id="shTo" type="email" multiple placeholder="claire@exemple.fr, marc@exemple.fr" autocomplete="off"></label>
    <label>Objet<input id="shSub" value="${esc(T.subject)}"></label>
    <label>Message<textarea id="shBody" rows="11">${esc(T.body)}</textarea></label>
    <div class="shbtns">
      <a class="btn primary" id="shMail" href="#"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>Envoyer par e-mail</a>
      <a class="btn" id="shSms" href="#"><svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/></svg>SMS</a>
      <a class="btn" id="shWa" href="#" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn" id="shFb" href="https://www.facebook.com/sharer/sharer.php?u=${enc2(T.url)}" target="_blank" rel="noopener">Facebook</a>
      <a class="btn" id="shLi" href="https://www.linkedin.com/sharing/share-offsite/?url=${enc2(T.url)}" target="_blank" rel="noopener">LinkedIn</a>
      <button class="btn" id="shCopy" type="button">Copier le texte</button>
      ${navigator.share ? '<button class="btn" id="shNative" type="button">Autres applis…</button>' : ''}
    </div>
    <p class="fine">L'e-mail part de votre propre messagerie : aucune adresse n'est enregistrée par le site.</p></div>`;
  openDlg(kind === 'mine' ? 'Partager mon don' : kind === 'kid' ? `Partager l'histoire de ${x.prenom}` : kind === 'donor' ? `Partager la fiche de ${x.p}` : 'Partager la campagne', html, b => {
    const to = b.querySelector('#shTo'), sub = b.querySelector('#shSub'), body = b.querySelector('#shBody');
    const upd = () => { const dest = to.value.split(/[,;\s]+/).filter(Boolean).join(',');
      b.querySelector('#shMail').href = `mailto:${dest}?subject=${enc2(sub.value)}&body=${enc2(body.value)}`;
      b.querySelector('#shSms').href = `sms:?&body=${enc2(T.short + ' ' + T.url)}`;
      b.querySelector('#shWa').href = `https://wa.me/?text=${enc2(body.value)}`; };
    [to, sub, body].forEach(e => e.addEventListener('input', upd)); upd();
    const cp = b.querySelector('#shCopy'); cp.onclick = async () => { try { await navigator.clipboard.writeText(body.value); cp.textContent = 'Texte copié'; } catch (e) { body.select(); cp.textContent = 'Sélectionné : Ctrl/Cmd + C'; } };
    const nt = b.querySelector('#shNative'); if (nt) nt.onclick = async () => { try { await navigator.share({ title: sub.value, text: body.value }); } catch (e) {} };
  });
}

/* =====================================================================  équipes soignantes */
const ROLECOL = { chir: '#b8323a', cardio: '#2b5a87', anest: '#2f7d6d', inf: '#7b3fa0', accueil: '#9a6a12', local: '#1f7a8c' };
const roleKey = s => s.role.replace('_f', '');
const soiName = s => `${s.titre ? s.titre + ' ' : ''}${s.prenom}${s.nom ? ' ' + s.nom : ''}`;
const soiAv = s => `<div class="avatar" style="background:${ROLECOL[roleKey(s)] || '#2b5a87'}">${esc((s.prenom[0] || '') + (s.nom ? s.nom.replace(/^(Le |Ould )/, '')[0] : ''))}</div>`;
function teamBlock(k) {
  const team = (k.equipe || []).map(id => SOIG.get(id)).filter(Boolean); if (!team.length) return null;
  const box = document.createElement('div'); box.className = 'team';
  const op = ['convalescence', 'rentree'].includes(k.statut);
  box.innerHTML = `<h3>${op ? 'Ils ' + acc(k, "l'ont", "l'ont") + ' soigné' + (k.prenom && acc(k, '', 'e')) : "L'équipe qui va " + acc(k, 'le', 'la') + ' soigner'}</h3>
    <div class="tlist">${team.map(s => `<button type="button" class="tm" data-s="${esc(s.id)}">${soiAv(s)}<span><b>${esc(soiName(s))}</b><small>${esc(s.libelle)}</small><small>${esc(s.ville)}</small></span></button>`).join('')}</div>
    <p class="fine">Personnes fictives (démo). Dans le vrai site, un soignant ou une famille d'accueil n'apparaît qu'avec son autorisation écrite.</p>`;
  box.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) openSoignant(SOIG.get(b.dataset.s)); });
  return box;
}
function openSoignant(s) {
  if (!s) return;
  const kids = ENF.enfants.filter(k => (k.equipe || []).includes(s.id));
  const where = s.role === 'local' ? `${s.ville}` : s.role === 'accueil' ? `${s.ville}` : `Chirurgie cardiaque pédiatrique, ${s.ville}`;
  const html = `<div class="dcard">
    <div class="top">${soiAv(s).replace('class="avatar"', 'class="avatar big"')}<div><h3>${esc(soiName(s))}</h3><p>${esc(s.libelle)}</p><div class="where"><span class="pill">${esc(where)}</span><span class="pill">Fiche fictive</span></div></div></div>
    ${s.mot ? `<blockquote class="quote">« ${esc(s.mot)} »</blockquote>` : ''}
    <h3 class="h3">${kids.length > 1 ? `Les ${kids.length} enfants du mât` : "L'enfant du mât"} ${s.role === 'accueil' ? 'accueilli' + (kids.length > 1 ? 's' : '') : 'suivi' + (kids.length > 1 ? 's' : '')}</h3>
    <div class="kids">${kids.map(k => `<div class="kid" data-k="${ENF.enfants.indexOf(k)}">${kidCard(k, true)}</div>`).join('')}</div>
    <p class="fine">Les soignants, les familles d'accueil et les médecins au pays font partie de la chaîne qui sauve chaque enfant. Ils ne figurent sur le site qu'avec leur accord.</p></div>`;
  openDlg(s.libelle, html, b => b.querySelectorAll('[data-k]').forEach(d => d.onclick = () => openKid(ENF.enfants[+d.dataset.k])));
}

/* =====================================================================  dialogues */
let dlgCur = null, dlgDepth = 0; const dlgHist = [];
function openDlg(title, html, after, wide) {
  $('dlgTitle').textContent = title; $('dlgBody').innerHTML = ''; if (typeof html === 'string') $('dlgBody').innerHTML = html; else $('dlgBody').append(...html);
  $('dlg').classList.toggle('wide', !!wide); $('dlg').hidden = false; $('dlg').querySelector('.dlg-box').scrollTop = 0; $('dlgClose').focus(); if (after) after($('dlgBody'));
}
const closeDlg = () => { $('dlg').hidden = true; dlgHist.length = 0; dlgCur = null; };
// chaque fiche ouverte depuis une autre fiche peut revenir en arrière (‹)
function dlgNav(fn) {
  return function (...a) {
    const re = () => { dlgDepth++; try { fn(...a); } finally { dlgDepth--; } };
    if (dlgDepth === 0) { if (!$('dlg').hidden && dlgCur) dlgHist.push(dlgCur); dlgCur = re; }
    re(); $('dlgBack').hidden = !dlgHist.length;
  };
}
$('dlgBack').onclick = () => { const f = dlgHist.pop(); if (!f) return; dlgCur = f; f(); $('dlgBack').hidden = !dlgHist.length; };
$('dlgClose').onclick = closeDlg; $('dlg').addEventListener('click', e => { if (e.target === $('dlg')) closeDlg(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('dlg').hidden) closeDlg(); });

// carte des donateurs en grand : villes, puis chaque donateur en zoomant (regroupés autour de sa ville, jamais d'adresse)
let DPOS = null; const SPD = 0.34;
function donorPositions() {
  if (DPOS) return DPOS; DPOS = new Map(); const grid = new Map(), key = (x, y) => Math.floor(x / SPD) + ',' + Math.floor(y / SPD);
  const free = (x, y, v) => { const gx = Math.floor(x / SPD), gy = Math.floor(y / SPD);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of grid.get((gx + i) + ',' + (gy + j)) || []) if (q[2] !== v && Math.hypot(q[0] - x, q[1] - y) < SPD * 0.95) return false; return true; };
  const byCity = new Map(); D.forEach(o => { if (o.v >= 0) { if (!byCity.has(o.v)) byCity.set(o.v, []); byCity.get(o.v).push(o); } });
  [...byCity.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([v, list]) => {
    const [cx, cy] = VXY[VILLES[v]]; let k = 0;
    list.sort((a, b) => (a.d || '').localeCompare(b.d || '') || a.i - b.i).forEach(o => {
      for (;; k++) { const r = SPD * 0.56 * Math.sqrt(k + 0.5), a = k * 2.39996, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (free(x, y, v)) { const q = [x, y, v]; DPOS.set(o.i, q); const kk = key(x, y); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(q); k++; break; } } });
  });
  return DPOS;
}
function openMap(arg) {
  let meO = null, me = -1; if (arg instanceof Event) arg = undefined;
  if (arg && typeof arg === 'object') { meO = arg; me = arg.v; } else if (typeof arg === 'number') me = arg; else if (current) { meO = current; me = current.v; }
  const POS = donorPositions();
  const wrap = document.createElement('div'); wrap.className = 'kmap fmap';
  const svg = sv('svg', { role: 'img', 'aria-label': `Carte de France : ${plural(NDON, 'donateur', 'donateurs')}` }); wrap.appendChild(svg);
  sv('path', { d: GEO.path, class: 'land' }, svg);
  const gB = sv('g', { class: 'cities' }, svg), gD = sv('g', { class: 'donors' }, svg), gLab = sv('g', { class: 'dlabels' }, svg), gTop = sv('g', {}, svg);
  const cities = VILLES.map((v, i) => i).filter(i => CNT[i] > 0).sort((a, b) => CNT[b] - CNT[a]).map((i, rank) => {
    const [x, y] = VXY[VILLES[i]], c = sv('circle', { cx: x, cy: y, r: 6 + 3.2 * Math.sqrt(CNT[i]), class: 'dot' + (i === me ? ' me' : ''), 'data-v': i }, gB);
    sv('title', {}, c).textContent = `${VILLES[i]} : ${plural(CNT[i], 'donateur', 'donateurs')}`;
    const lg = sv('g', { class: 'clab' + (rank < 10 ? ' top' : ''), 'data-v': i }, gB); const t = sv('text', { x: 0, y: 0 }, lg); t.textContent = `${VILLES[i]} · ${CNT[i]}`;
    return { i, x, y, c, lg, rad: SPD * 0.56 * Math.sqrt(CNT[i] * 1.3) + 1 }; });
  const dots = [], labels = new Map(), hint = document.createElement('p'); hint.className = 'fine';
  D.forEach(o => { const q = POS.get(o.i); if (!q) return; const c = sv('circle', { cx: q[0], cy: q[1], r: .1, class: 'pd' + (meO === o ? ' me' : ''), 'data-i': o.i }, meO === o ? gTop : gD); dots.push({ o, c, x: q[0], y: q[1] }); });
  const Z = window.__dbg.fz = panZoom(svg, GEO.w, GEO.h, 2.2, (vb, u) => {
    const px = SPD / u, indiv = px >= 1.6;                                // espacement des donateurs à l'écran
    svg.classList.toggle('indiv', indiv); svg.classList.toggle('names', px >= 30);
    cities.forEach(c => { c.lg.setAttribute('transform', `translate(${c.x + (6 + 3.2 * Math.sqrt(CNT[c.i])) + 3 * u},${c.y + 4 * u}) scale(${u})`); });
    if (indiv) { const r = clamp(px * 0.36, 1.1, 7) * u, x0 = vb.x - 2, x1 = vb.x + vb.w + 2, y0 = vb.y - 2, y1 = vb.y + vb.h + 2;
      dots.forEach(d => { const inV = d.x > x0 && d.x < x1 && d.y > y0 && d.y < y1; d.c.style.display = inV ? '' : 'none'; if (inV) d.c.setAttribute('r', d.o === meO ? Math.max(r * 1.6, 5 * u) : r); }); }
    // prénoms quand on est assez près
    if (px >= 30) { dots.forEach(d => { const inV = d.c.style.display !== 'none'; let t = labels.get(d.o.i);
        if (inV && !t) { t = sv('text', { 'data-i': d.o.i, class: d.o === meO ? 'me' : '' }, gLab); t.textContent = d.o.p; labels.set(d.o.i, t); }
        if (t) { t.style.display = inV ? '' : 'none'; if (inV) { t.setAttribute('x', d.x); t.setAttribute('y', d.y + clamp(px * 0.36, 1.1, 7) * u + 11 * u); t.setAttribute('font-size', 11 * u); t.setAttribute('stroke-width', 3 * u); } } }); }
    else labels.forEach(t => t.style.display = 'none');
    hint.textContent = indiv ? (px >= 30 ? 'Touchez un prénom pour ouvrir la fiche du donateur.' : 'Zoomez encore pour lire les prénoms, ou touchez un point.') : 'Touchez une ville pour zoomer sur ses donateurs.';
  }, el => {
    const i = el.closest('[data-i]')?.dataset.i; if (i != null) return openDonor(D[+i]);
    const v = el.closest('[data-v]')?.dataset.v; if (v != null) { const c = cities.find(x => x.i === +v); Z.flyTo(c.x, c.y, Math.max(c.rad * 5, 6)); }
  });
  const ctr = document.createElement('div'); ctr.className = 'kctrl';
  ctr.innerHTML = `<button type="button" data-z="in" aria-label="Zoomer">+</button><button type="button" data-z="out" aria-label="Dézoomer">−</button><button type="button" data-z="fr">Toute la France</button>${meO && POS.get(meO.i) ? `<button type="button" data-z="me">${esc(meO.p)}</button>` : ''}`;
  ctr.onclick = e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.z === 'in') Z.zoomCenter(0.55); else if (b.dataset.z === 'out') Z.zoomCenter(1.8); else if (b.dataset.z === 'fr') Z.fitBox(0, 0, GEO.w, GEO.h, 1.02, 0);
    else { const q = POS.get(meO.i); Z.flyTo(q[0], q[1], 7, 900); } };
  wrap.appendChild(ctr);
  const ol = document.createElement('ol'); ol.className = 'top tops'; const max = Math.max(...CNT);
  cities.slice(0, 12).forEach(c => { const li = document.createElement('li'); li.innerHTML = `<b>${esc(VILLES[c.i])}</b><span>${CNT[c.i]}</span><i style="width:${Math.round(CNT[c.i] / max * 100)}%"></i>`;
    li.onclick = () => Z.flyTo(c.x, c.y, Math.max(c.rad * 5, 6)); ol.appendChild(li); });
  const sub = document.createElement('p'); sub.className = 'sub'; sub.textContent = `${plural(NDON, 'donateur', 'donateurs')} dans ${plural(NVILLES, 'ville', 'villes')}. Chaque point est un donateur, regroupé autour de sa ville : seule la ville est connue, jamais l'adresse (villes fictives dans ce prototype).`;
  openDlg(meO ? `${meO.p} et les donateurs` : 'Les donateurs en France', [sub, wrap, hint, ol], null, true);
  requestAnimationFrame(() => { Z.fitBox(0, 0, GEO.w, GEO.h, 1.02, 0); const q = meO && POS.get(meO.i);
    if (q) setTimeout(() => Z.flyTo(q[0], q[1], 7, 1400), 450); else if (me >= 0) { const c = cities.find(x => x.i === me); if (c) setTimeout(() => Z.flyTo(c.x, c.y, Math.max(c.rad * 5, 6), 1100), 450); } });
}
function openMessages() {
  const list = D.filter(o => o.m && !o.local).sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  const sb = document.createElement('label'); sb.className = 'searchbox'; sb.innerHTML = '<input type="search" placeholder="Chercher un mot, un prénom, une ville…">';
  const grid = document.createElement('div'); grid.className = 'msgs'; const more = document.createElement('button'); more.className = 'btn'; more.textContent = 'Voir plus de messages';
  let shown = 0, filt = list;
  const card = o => { const d = document.createElement('div'); d.className = 'mcard';
    d.innerHTML = `<q>${esc(o.m)}</q><small>${esc(o.p)} ${esc(o.n)} ${o.v >= 0 ? '· ' + esc(VILLES[o.v]) : ''} · ${fdate(o.d)}</small><div class="row"><button class="btn small" type="button" data-a="f">Sa fiche</button><button class="btn small" type="button" data-a="m">${isCk(o) ? 'Voir dans le cockpit' : 'Voir sur le mât'}</button></div>`;
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
  const img = photos[0] ? `<img src="${esc(typeof photos[0] === 'string' ? photos[0] : photos[0].src)}" alt="">` : esc((P.prenom[0] || '') + (P.nom[0] || ''));
  const lien = P.lien ? `<p><b>Son lien avec Initiatives-Cœur :</b> ${esc(P.lien)}</p>` : `<p><span class="draft">À compléter</span> Son lien avec Initiatives-Cœur.</p>`;
  return `<div class="top"><div class="avatar" style="background:#ce111e">${img}</div><div><small>${P.categorie ? esc(P.categorie) + ' du projet' : 'Personnalité du projet'}</small><h3>${esc(P.prenom)} ${esc(P.nom)}</h3><p>${esc(P.titre)}</p></div></div>
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
  const inCk = isCk(o), h = inCk ? 0 : hOf(rowS(dec(o.slot).row)), k = o.e >= 0 ? ENF.enfants[o.e] : null;
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
    ${inCk ? `<div class="place"><small>Sa place dans le cockpit</small><b>${ckLabel(o.ck)}</b><span>sous les yeux de Violette, pendant toutes ses courses</span></div>`
      : `<div class="place"><small>Sa place sur le mât</small><b>${slotLabel(o.slot)}</b><span>${fmtM(h)} au-dessus du pont</span></div>`}
    ${k ? `<div class="kid"><small>Son don participe à sauver</small>${kidCard(k, true)}</div>` : ''}
    <div class="actions">
      <button class="btn primary" type="button" data-a="mat">${inCk ? 'Voir dans le cockpit' : 'Voir sur le mât'}</button>
      ${k ? `<button class="btn" type="button" data-a="kid">L'enfant aidé : ${esc(k.prenom)}</button>` : ''}
      <button class="btn" type="button" data-a="map">${voisins ? `Carte des donateurs (${voisins + 1} ${esc(deVille(ville))})` : 'Carte des donateurs'}</button>
      <a class="btn" href="${esc(CFG.boutique_url || '#')}" target="_blank" rel="noopener">Boutique solidaire</a>
      <button class="btn" type="button" data-a="send">${o.local ? 'Partager mon don par e-mail' : 'Partager sa fiche'}</button>
      <button class="btn" type="button" data-a="share">Copier le lien de sa fiche</button>
    </div>
    <p class="fine">La fiche ne montre que ce que le donateur a accepté de rendre public. Jamais de montant ni d'adresse.</p></div>`;
  openDlg('Fiche donateur', html, b => {
    b.querySelector('[data-a=mat]').onclick = () => { closeDlg(); travel(o); };
    const kb = b.querySelector('[data-a=kid]'); if (kb) kb.onclick = () => openKid(k);
    b.querySelector('[data-a=map]').onclick = () => openMap(o);
    b.querySelector('[data-a=send]').onclick = () => openShare(o.local ? 'mine' : 'donor', o);
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
  two.append(kidsMiniMap(null), ol);
  const h = document.createElement('h2'); h.textContent = 'Les enfants du mât';
  const grid = document.createElement('div'); grid.className = 'kids';
  ENF.enfants.forEach(k => { const d = document.createElement('div'); d.className = 'kid'; d.innerHTML = kidCard(k, true) + `<small>${plural(k.donateurs, 'donateur', 'donateurs')}</small>`; d.onclick = () => openKid(k); grid.appendChild(d); });
  const note = document.createElement('p'); note.className = 'fine'; note.textContent = ENF.note + ' Les 550 enfants opérés avant la campagne sont comptés par défaut ; répartition par pays illustrative. ● rouge : avant la campagne · ● vert : grâce au mât.';
  openDlg('Enfants sauvés', [head, two, h, grid, note]);
}
function openKid(k) {
  const donors = D.filter(o => o.e === ENF.enfants.indexOf(k)).sort((a, b) => (a.d || '').localeCompare(b.d || '') || a.i - b.i);
  const map = kidsMiniMap(k);
  const card = document.createElement('div'); card.className = 'kid'; card.innerHTML = kidCard(k, false);
  const ph = document.createElement('div'); ph.className = 'photos';
  ph.innerHTML = k.photo ? `<figure><img src="${esc(k.photo)}" alt="Portrait illustré de ${esc(k.prenom)}"><figcaption>${k.photo_illustration ? 'Illustration · enfant fictif (démo)' : 'Photo Mécénat Chirurgie Cardiaque, avec l\'accord de la famille'}</figcaption></figure>`
    : `<figure><div class="ph"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-8 8"/></svg>Photo transmise par Mécénat Chirurgie Cardiaque<br>avec l'accord de la famille</div></figure>`;
  const info = document.createElement('div'); info.className = 'recap';
  const st = k.statut, inFr = ['en-france', 'convalescence', 'rentree'].includes(st), op = ['convalescence', 'rentree'].includes(st);
  const acc2 = k.accueil ? `, famille d'accueil à ${k.accueil}` : '';
  info.innerHTML = [['Pays', `${k.pays} (${k.ville})`], ['Pathologie', k.patho],
    ['Séjour en France', k.arrivee ? (inFr ? `depuis le ${fdate(k.arrivee)}` : `arrivée prévue le ${fdate(k.arrivee)}`) + acc2 : 'date à fixer'],
    ['Opération', k.operation ? (op ? '' : 'prévue le ') + fdate(k.operation) + (k.hopital ? ' à ' + k.hopital : '') : 'date à fixer'],
    ['Retour', k.retour ? (st === 'rentree' ? '' : 'prévu le ') + fdate(k.retour) : 'date à fixer'], ['Financement', `${Math.round(k.finance * 100)} % de ${nf(ENF.cout)} €`]]
    .map(([a, b]) => `<div><span>${a}</span><span>${esc(b)}</span></div>`).join('');
  const who = document.createElement('div'); who.className = 'who'; const N0 = 48;
  const drawWho = all => who.innerHTML = `<h3>Ils ont permis de ${acc(k, 'le', 'la')} sauver</h3><p><strong>${plural(donors.length, 'donateur', 'donateurs')}</strong> ${donors.length > 1 ? 'ont' : 'a'} contribué : `
    + (all ? donors : donors.slice(0, N0)).map(o => donLink(o)).join(', ')
    + (!all && donors.length > N0 ? ` … <button class="lk" type="button">voir les ${donors.length}</button>` : '') + `</p><p class="fine">Touchez un prénom pour ouvrir la fiche du donateur et retrouver sa place sur le bateau.</p>`;
  drawWho(false); who.addEventListener('click', e => { if (e.target.closest('.lk')) drawWho(true); });
  const team = teamBlock(k);
  const note = document.createElement('p'); note.className = 'fine'; note.textContent = 'Fiche fictive. Les vraies fiches seront publiées avec l\'accord des familles et de Mécénat Chirurgie Cardiaque, sans donnée médicale détaillée.';
  const two = document.createElement('div'); two.className = 'two kidtwo'; const L = document.createElement('div'), R = document.createElement('div');
  L.style.display = R.style.display = 'grid'; L.style.gap = R.style.gap = '12px'; L.append(ph, map); R.append(card, info); two.append(L, R);
  const shr = document.createElement('div'); shr.className = 'actions'; shr.innerHTML = `<button class="btn primary" type="button">Partager l'histoire de ${esc(k.prenom)}</button><button class="btn" type="button">Mettre mon nom sur le bateau</button>`;
  shr.children[0].onclick = () => openShare('kid', k); shr.children[1].onclick = () => { closeDlg(); if (app.dataset.view === 'landing') leaveLanding(startDon); else startDon(); };
  openDlg(`${k.prenom}, ${k.age} ans`, [two, team, who, shr, note].filter(Boolean));
}

openDonor = dlgNav(openDonor); openPerso = dlgNav(openPerso); openKid = dlgNav(openKid); openKids = dlgNav(openKids); openKidsMap = dlgNav(openKidsMap);
openSoignant = dlgNav(openSoignant); openShare = dlgNav(openShare); openMap = dlgNav(openMap); openMessages = dlgNav(openMessages); openTiers = dlgNav(openTiers);

/* =====================================================================  parcours de don */
const DS = { step: 1, amt: 15, slot: -1, ck: -1, zone: 'mat', p: '', n: '', ville: '', msg: '', ok: false };
const palierOf = m => { let k = 0; CTP.paliers.forEach((p, i) => { if (m >= p.min) k = i; }); return k; };
const autoOrder = (() => { const a = []; for (let r = 1; r <= NR; r++) for (const f of [0, 1]) for (let c = 0; c < NC; c++) a.push(enc(f, r, c)); return a; })();
const nextAuto = () => autoOrder.find(sl => owner[sl] < 0) ?? -1;
function startDon() {
  if (ck.on && DS.zone !== 'ck') { spotCk = -1; leaveCockpit(); }
  token++; spotSlot = -1; $('spot').classList.remove('show'); hideTip(); closeDlg(); audioInit();
  setView('don'); gotoStep(1);
  if (!$('villesList').children.length) $('villesList').innerHTML = VILLES.map(v => `<option value="${esc(v)}">`).join('');
}
$('btnDon').onclick = startDon; $('btnDon2').onclick = startDon;
$('donBack').onclick = () => { if (DS.step > 1) gotoStep(DS.step - 1); else { setPick(false); setView('home'); spotSlot = -1; spotCk = -1; $('spot').classList.remove('show', 'pick'); if (ck.on) leaveCockpit(); } };
function gotoStep(n) {
  DS.step = n; document.querySelectorAll('.dstep').forEach(d => d.classList.toggle('on', +d.dataset.step === n));
  $('steps').innerHTML = [1, 2, 3, 4].map(i => `<span class="${i <= n ? 'on' : ''}"></span>`).join('');
  setPick(n === 2 && (DS.zone === 'ck' || DS.amt >= CFG.prix_choix));
  if (n === 2) $('placeTitle').textContent = DS.zone === 'ck' ? 'Votre place dans le cockpit' : 'Votre place sur le mât';
  if (n === 1) renderAmounts();
  if (n === 2) renderPlace();
  if (n === 3) { if (!$('dPrenom').value && $('prenom').value) $('dPrenom').value = $('prenom').value; if (!$('dNom').value && $('nom').value) $('dNom').value = $('nom').value; drawSticker(); checkInfo(); }
  if (n === 4) renderRecap();
  $('panel').scrollTop = 0;
}
document.querySelectorAll('[data-next]').forEach(b => b.onclick = () => gotoStep(DS.step + 1));
const PCK = () => CFG.prix_cockpit || 30;
function renderZone() {
  $('zone').innerHTML = `<button type="button" data-z="mat" class="${DS.zone === 'mat' ? 'on' : ''}"><b>Sur le mât</b><span>dès ${CFG.prix_auto} € · ${nf(freeCount())} places</span></button>
    <button type="button" data-z="ck" class="${DS.zone === 'ck' ? 'on' : ''}"><b>Dans le cockpit</b><span>dès ${PCK()} € · sous les yeux de Violette · ${nf(ckOwner.filter(i => i < 0).length)} places</span></button>`;
  $('zone').querySelectorAll('button').forEach(b => b.onclick = () => { DS.zone = b.dataset.z; if (DS.zone === 'ck' && DS.amt < PCK()) DS.amt = PCK(); DS.slot = -1; DS.ck = -1; ckSel = -1; renderAmounts(); });
}
function renderAmounts() {
  renderZone(); const min = DS.zone === 'ck' ? PCK() : CFG.prix_auto;
  $('amounts').innerHTML = CFG.montants.map(m => `<button type="button" data-m="${m}" class="${DS.amt === m ? 'on' : ''}" ${m < min ? 'disabled' : ''}>${m} €</button>`).join('');
  $('amounts').querySelectorAll('button').forEach(b => b.onclick = () => { DS.amt = +b.dataset.m; $('amtOther').value = ''; renderAmounts(); });
  const P = CTP.paliers[palierOf(DS.amt)];
  $('tier').innerHTML = `<b>Palier <em>${esc(P.nom)}</em></b><span>${esc(P.accroche)}</span><ul>${P.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul><button class="chip blue" type="button" id="seeTiers">Tous les paliers et le tirage au sort</button>`;
  $('seeTiers').onclick = openTiers;
  const k = ENF.enfants.find(e => e.finance < 1) || ENF.enfants[ENF.enfants.length - 1];
  $('impact').innerHTML = `${nf(ENF.cout)} € permettent de sauver un enfant. Votre don de <strong>${DS.amt} €</strong> rejoint ceux qui financent l'opération de <strong>${esc(k.prenom)}, ${k.age} ans (${esc(k.pays)})</strong>, déjà financée à ${Math.round(k.finance * 100)} %.`;
}
$('amtOther').addEventListener('input', e => { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); if (v >= (DS.zone === 'ck' ? PCK() : CFG.prix_auto)) { DS.amt = v; renderAmounts(); $('amtOther').value = v; } });
function setPick(on) { if (pickMode === on) { drawCk(); return; } pickMode = on; stage.classList.toggle('picking', on); $('pickbar').hidden = !on; redrawAll(); drawCk(); }
function renderPlace() {
  const box = $('placeBox'), q = $('quick');
  if (DS.zone === 'ck') {
    if (DS.ck >= 0 && ckOwner[DS.ck] >= 0) DS.ck = -1;
    const nbN = DS.ck >= 0 ? (() => { const r = Math.floor(DS.ck / CK.cols), c = DS.ck % CK.cols; return [[r, c - 1], [r, c + 1]].filter(([a, b]) => b >= 0 && b < CK.cols).map(([a, b]) => ckOwner[a * CK.cols + b]).filter(i => i >= 0).map(i => D[i].p + ' ' + D[i].n); })() : [];
    box.innerHTML = DS.ck >= 0 ? `<div class="place"><small>Votre place</small><b>${ckLabel(DS.ck)}</b><span>Sur la cloison du cockpit, sous les yeux de Violette${nbN.length ? ' · à côté de ' + esc(nbN.join(' et ')) : ''}</span></div>`
      : `<div class="place"><small>Comme dans un avion</small><b>Touchez une place libre</b><span>Les cases vertes du cockpit sont libres. Faites glisser pour parcourir la plaque, zoomez pour lire les noms.</span></div>`;
    q.innerHTML = ''; const frees = [...Array(CK.n).keys()].filter(c => ckOwner[c] < 0);
    q.append(chip('Au centre', 'blue', () => { const mid = frees.sort((a, b) => Math.hypot(Math.floor(a / CK.cols) - CK.rows / 2, a % CK.cols - (CK.cols - 1) / 2) - Math.hypot(Math.floor(b / CK.cols) - CK.rows / 2, b % CK.cols - (CK.cols - 1) / 2))[0]; selectCk(mid); }),
      chip('Tout en haut', 'blue', () => selectCk(frees.sort((a, b) => a - b)[0])), chip('Au hasard', 'blue', () => selectCk(frees[Math.floor(Math.random() * frees.length)])), chip('Plutôt le mât', 'perso', () => { DS.zone = 'mat'; DS.ck = -1; ckSel = -1; drawCk(); gotoStep(1); }));
    if (!ck.on) enterCockpit(0, 0, isMobile() ? 1.9 : 1.5);
    $('placeNext').disabled = DS.ck < 0; return;
  }
  if (DS.amt < CFG.prix_choix) {
    const sl = nextAuto(); DS.slot = sl; const { row } = dec(sl);
    box.innerHTML = `<div class="place"><small>Place attribuée automatiquement</small><b>${slotLabel(sl)}</b><span>${fmtM(hOf(rowS(row)))} au-dessus du pont : la prochaine place libre en partant du pied du mât.</span></div>`;
    q.innerHTML = ''; q.append(chip(`Choisir ma place (dès ${CFG.prix_choix} €)`, 'perso', () => { DS.amt = CFG.prix_choix; DS.slot = -1; gotoStep(2); }));
    showSlot(sl, true); $('placeNext').disabled = false; return;
  }
  if (DS.slot >= 0 && owner[DS.slot] >= 0) DS.slot = -1;
  box.innerHTML = DS.slot >= 0 ? (() => { const { row } = dec(DS.slot); const nb = [0, 1, 2].filter(c => c !== dec(DS.slot).col).map(c => owner[enc(dec(DS.slot).f, row, c)]).filter(i => i >= 0).map(i => D[i].p + ' ' + D[i].n);
      return `<div class="place"><small>Votre place</small><b>${slotLabel(DS.slot)}</b><span>${fmtM(hOf(rowS(row)))} au-dessus du pont${nb.length ? ' · à côté de ' + esc(nb.join(' et ')) : ''}</span></div>`; })()
    : `<div class="place"><small>Comme dans un avion</small><b>Touchez une place libre</b><span>Les cases vertes sont libres. Faites glisser pour monter, tournez pour passer de l'autre côté.</span></div>`;
  q.innerHTML = '';
  const freeNear = (s, f) => { let best = -1, bd = 1e9; for (let sl = 0; sl < NS; sl++) { if (owner[sl] >= 0) continue; const d = dec(sl); if (f != null && d.f !== f) continue; const dd = Math.abs(rowS(d.row) - s); if (dd < bd) { bd = dd; best = sl; } } return best; };
  q.append(chip('Tout en haut', 'blue', () => selectSlot(freeNear(30))), chip('À mi-hauteur', 'blue', () => selectSlot(freeNear(14.5 / MAT.A[1]))),
    chip('Au hasard', 'blue', () => { let sl; do { sl = Math.floor(Math.random() * NS); } while (owner[sl] >= 0); selectSlot(sl); }));
  PERS.forEach((P, k) => { const o = D.find(x => x.perso === k); q.append(chip('Près de ' + esc(P.prenom + ' ' + P.nom), 'perso', () => selectSlot(freeNear(rowS(dec(o.slot).row), 0)))); });
  $('placeNext').disabled = DS.slot < 0;
}
function showSlot(sl, pick) { if (ck.on) { spotCk = -1; leaveCockpit().then(ok => { if (ok) showSlot(sl, pick); }); return; } const { f, row } = dec(sl); spotSlot = sl; spotWhole = false; $('spot').classList.add('show'); $('spot').classList.toggle('pick', !!pick);
  $('spotTxt').textContent = 'Votre place · ' + fmtM(hOf(rowS(row))); const my = ++token; glideTo(rowS(row), f === 0 ? 0 : Math.PI, closeD(), my); }
function selectSlot(sl) { if (sl < 0 || owner[sl] >= 0) return; DS.slot = sl; showSlot(sl, true); renderPlace(); }
function drawSticker() {
  const cv = $('sticker'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  ctx.fillStyle = '#fafaf7'; ctx.fillRect(0, 0, W, H);
  const p = $('dPrenom').value.trim() || 'Prénom', n = $('dNom').value.trim() || 'Nom';
  const sl = DS.slot >= 0 ? DS.slot : nextAuto(), s = rowS(dec(sl).row), inCk = DS.zone === 'ck', cellW = inCk ? CK.w / CK.cols : zoneW(s) / 3, rowH = inCk ? (CK.h - CK.head) / CK.rows : PITCH;
  const scale = W * 0.8 / cellW, rowPx = Math.min(rowH * scale, H * 0.72);              // échelle : la case occupe 80 % de l'aperçu
  ctx.strokeStyle = '#c9ccd1'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeRect(W * .1, H / 2 - rowPx / 2, W * .8, rowPx); ctx.setLineDash([]);
  const fit = fitName(ctx, { p, n }, W * .8 - rowPx * .35, rowPx, false);
  ctx.fillStyle = '#13294b'; ctx.font = `600 ${fit.size}px ${STICK_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (fit.lines.length === 1) ctx.fillText(fit.lines[0], W / 2, H / 2 + fit.size * .05);
  else { ctx.fillText(fit.lines[0], W / 2, H / 2 - fit.size * .52); ctx.fillText(fit.lines[1], W / 2, H / 2 + fit.size * .55); }
  ctx.fillStyle = '#6b7a8c'; ctx.font = '600 20px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`${inCk ? 'Cockpit · ' : ''}Taille réelle : ${(cellW * 100).toFixed(1).replace('.', ',')} × ${(rowH * 100).toFixed(1).replace('.', ',')} cm · lettres ≈ ${(fit.size / scale * 100 * 0.7).toFixed(1).replace('.', ',')} cm`, 12, H - 12);
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
  const inCk = DS.zone === 'ck' && DS.ck >= 0;
  $('recap').innerHTML = [['Don', `${DS.amt} € · palier ${P.nom}`], [inCk ? 'Dans le cockpit' : 'Sur le mât', `${DS.p} ${DS.n}`], ['Place', inCk ? ckLabel(DS.ck) : `${slotLabel(sl)} · ${fmtM(hOf(rowS(dec(sl).row)))}`],
    ['Ville', DS.ville || '—'], ['Message', DS.msg || '—']].map(([a, b]) => `<div><span>${a}</span><span>${esc(b)}</span></div>`).join('');
  $('pay').textContent = `Payer ${DS.amt} € en toute sécurité`;
  $('payNote').textContent = CFG.don_url ? 'Vous allez être redirigé vers la page de dons sécurisée d\'Initiatives-Cœur. Votre place est réservée pendant ' + CFG.reservation_minutes + ' minutes.'
    : 'Prototype : le paiement n\'est pas encore branché au système de dons d\'Initiatives-Cœur. Le bouton simule un don accepté (enregistré seulement dans ce navigateur).';
}
$('pay').onclick = async () => {
  const inCk = DS.zone === 'ck' && DS.ck >= 0 && ckOwner[DS.ck] < 0, sl = inCk ? -1 : DS.slot >= 0 && owner[DS.slot] < 0 ? DS.slot : nextAuto(), ref = 'MAT-' + Date.now().toString(36).toUpperCase();
  if (CFG.don_url) {
    const u = CFG.don_url.replace('{montant}', DS.amt).replace('{ref}', ref);
    const q = new URLSearchParams({ emplacement: inCk ? ckLabel(DS.ck) : slotLabel(sl), zone: inCk ? 'cockpit' : 'mat', place: inCk ? DS.ck : sl, prenom: DS.p, nom: DS.n, ville: DS.ville, message: DS.msg });
    location.href = u + (u.includes('?') ? '&' : '?') + q.toString(); return;
  }
  const vi = VILLES.findIndex(v => norm(v) === norm(DS.ville));
  const kid = ENF.enfants.findIndex(e => e.finance < 1);
  const pub = $('dPub').checked;
  const o = { slot: sl, p: DS.p, n: DS.n, v: vi, pal: palierOf(DS.amt), m: DS.msg, perso: -1, d: new Date().toISOString().slice(0, 10), e: kid >= 0 ? kid : ENF.enfants.length - 1, local: true, amt: DS.amt, ck: inCk ? DS.ck : -1, i: D.length,
              b: pub ? $('dBio').value.trim() : '', ph: pub ? DS.photo || '' : '' };
  D.push(o); occupy(o); reindex();
  try { const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); saved.push(o); localStorage.setItem(LOCAL_KEY, JSON.stringify(saved)); } catch (e) {}
  setPick(false); if (sl >= 0) redrawSlot(sl); DS.ck = -1; ckSel = -1; drawCk(); renderStats(); $('dPrenom').value = $('dNom').value = $('dMsg').value = $('dBio').value = ''; $('dOk').checked = false; DS.photo = ''; $('dPhotoPrev').hidden = true;
  travel(o);
};

/* =====================================================================  démarrage */
function renderLanding() {
  $('lStats').innerHTML = `<div><b>${nf(D.length)}</b><span>noms déjà à bord</span></div><div><b>${nf(ENF.anterieurs + NKIDS_DONE)}</b><span>enfants opérés avec Initiatives-Cœur</span></div><div><b>≈ 45 000 km</b><span>autour du monde au Vendée Globe</span></div>`;
  $('lExploreTxt').textContent = `les ${nf(D.length)} noms déjà à bord, les enfants qu'ils aident, la carte du monde`;
}
function showLanding() { closeDlg(); renderLanding(); setView('landing'); landingSpin = true; spotSlot = -1; $('spot').classList.remove('show'); $('alti').classList.remove('armed'); dirty = true; introLoop(); }
function leaveLanding(to) { landingSpin = false; nav.cy = nav.el = undefined; stopAuto(); token++; spotSlot = -1; $('spot').classList.remove('show'); nav.tth = 0; nav.ts = 1.3; nav.td = D0; setView('home'); if (to) to(); }
// intro : plan large sur le bateau qui navigue, puis plongée vers un nom tiré au hasard, et ainsi de suite
async function introLoop() {
  const my = ++token, WIDE = isMobile() ? 46 : 44, pool = D.filter(o => o.perso < 0 && !o.local && o.slot >= 0 && !isCk(o));
  const live = () => my === token && landingSpin && app.dataset.view === 'landing';
  nav.cy = 12; nav.el = -0.15;                        // plan large : on vise la coque et les voiles, horizon dans le cadre
  nav.auto = false; nav.s = nav.ts = 12; nav.th = nav.tth = 0.95; nav.d = nav.td = WIDE * 1.25; dirty = true;
  if (!await flyKeys([[0, 12, 0.95, WIDE * 1.25], [4.5, 12, 1.35, WIDE]], my) || !live()) return;
  while (live()) {
    const o = pool[Math.floor(Math.random() * pool.length)], { f, row } = dec(o.slot), sT = rowS(row), thT = f === 0 ? 0 : Math.PI, dT = closeD() * 1.1;
    const thW = f === 0 ? 0.55 : Math.PI - 0.55;                 // on se place d'abord du côté du nom, loin du foc
    if (!await flyKeys([[0, nav.s, nav.th, nav.d], [4.2, 12, thW, WIDE * 0.95]], my) || !live()) return;
    if (!await flyKeys([[0, nav.s, nav.th, nav.d], [2.6, lerp(nav.s, sT, 0.6), lerp(nav.th, thT, 0.7), 9], [5.4, sT, thT, dT]], my) || !live()) return;
    spotSlot = o.slot; spotWhole = false; $('spotTxt').textContent = `${o.p} ${o.n}${o.v >= 0 ? ' · ' + VILLES[o.v] : ''}`; $('spot').classList.add('show'); dirty = true;
    await sleep(3400); if (!live()) return;
    $('spot').classList.remove('show'); spotSlot = -1; dirty = true;
    if (!await flyKeys([[0, nav.s, nav.th, nav.d], [2.8, clamp(nav.s, 8, 16), lerp(nav.th, thW, 0.6), 10], [5.6, 12, thW + (f === 0 ? 0.5 : -0.5), WIDE]], my) || !live()) return;
  }
}
$('lDon').onclick = () => leaveLanding(startDon);
$('lExplore').onclick = () => leaveLanding(() => { nav.ts = 6; });
$('lFind').onclick = () => leaveLanding(() => setTimeout(() => $('prenom').focus(), 50));
$('lTiers').onclick = () => openTiers();
$('lShare').onclick = () => openShare('site');
document.querySelector('.tag').addEventListener('click', () => { if (app.dataset.view !== 'don') showLanding(); });
$('gl').addEventListener('pointerdown', () => { if (landingSpin) { landingSpin = false; stopAuto(); token++; } });

renderStats(); drawCk();
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
if (!location.hash) showLanding(); else fromHash();
window.__dbg = {}; window.__mat = { camera, rig, boat, THREE, nav, D, owner, dec, enc, rowS, travel, tour, startDon, pickAt, screenRect, tiles, renderer, get dirty() { return dirty; }, set dirty(v) { dirty = v; } };
