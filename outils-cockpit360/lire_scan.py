# Lit un scan au format « SCN1 » (App-Live-Refonte/scripts/preparer-scan.mjs) et le pose dans le repère du bateau du site.
import gzip, struct, numpy as np, sys
from scipy.spatial.transform import Rotation as Rot
def lire(fichiers):
    raw = gzip.decompress(b''.join(open(f, 'rb').read() for f in fichiers))
    assert raw[:4] == b'SCN1'; n = struct.unpack_from('<I', raw, 4)[0]
    mn = np.array(struct.unpack_from('<3f', raw, 8)); mx = np.array(struct.unpack_from('<3f', raw, 20)); smin, smax = struct.unpack_from('<2f', raw, 32)
    o = 40; pos = np.zeros((n, 3))
    for k in range(3):
        hi = np.frombuffer(raw, np.uint8, n, o + k * 2 * n).astype(np.uint32); lo = np.frombuffer(raw, np.uint8, n, o + k * 2 * n + n).astype(np.uint32)
        v = np.cumsum((hi << 8) | lo) & 0xffff; pos[:, k] = mn[k] + v / 65535 * (mx[k] - mn[k])
    o += 6 * n; rot = np.frombuffer(raw, np.int8, 4 * n, o).reshape(4, n).T.astype(np.float32) / 127; o += 4 * n
    sc = smin + np.frombuffer(raw, np.uint8, 3 * n, o).reshape(3, n).T.astype(np.float32) / 255 * (smax - smin); o += 3 * n
    col = np.frombuffer(raw, np.uint8, 4 * n, o).reshape(4, n).T.copy()
    return dict(n=n, pos=pos, rot=rot, scale=np.exp(sc), col=col)
# placement : bateaux.json « casquette » (repère du modèle d'Ulysse), puis le décalage du modèle dans ce site
POS = np.array([0.07, 0.08, -5.72]); EUL = [180, 90, 0]; SITE = np.array([-0.030, 0.3956, 0.3747])
R = Rot.from_euler('XYZ', EUL, degrees=True)
def vers_site(S):
    P = R.apply(S['pos']) + POS + SITE
    q = S['rot']; qs = Rot.from_quat(np.c_[q[:, 1], q[:, 2], q[:, 3], q[:, 0]])
    return P, (R * qs)
if __name__ == '__main__':
    S = lire(sys.argv[1:]); P, Q = vers_site(S)
    print(S['n'], 'taches'); print('boîte site', P.min(0).round(2), P.max(0).round(2))
    np.savez_compressed('/home/claude/mat3d/scan/casquette.npz', P=P.astype(np.float32), q=Q.as_quat().astype(np.float32), s=S['scale'].astype(np.float32), c=S['col'])
