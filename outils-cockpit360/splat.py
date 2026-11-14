# Petit rasteriseur de taches gaussiennes (EWA), d'avant en arrière, pour faire des vues du scan depuis un point.
import numpy as np, numba
from scipy.spatial.transform import Rotation as Rot
@numba.njit(cache=True)
def _raster(order, u, v, a, b, c, rad, rgb, al, W, H, C, T, zz, Z):
    for k in range(order.shape[0]):
        i = order[k]; r = rad[i]
        x0 = max(0, int(u[i] - r)); x1 = min(W - 1, int(u[i] + r) + 1); y0 = max(0, int(v[i] - r)); y1 = min(H - 1, int(v[i] + r) + 1)
        if x0 > x1 or y0 > y1: continue
        for py in range(y0, y1 + 1):
            dy = py + 0.5 - v[i]
            for px in range(x0, x1 + 1):
                t = T[py, px]
                if t < 0.004: continue
                dx = px + 0.5 - u[i]; pw = -0.5 * (a[i] * dx * dx + 2 * b[i] * dx * dy + c[i] * dy * dy)
                if pw > 0 or pw < -6: continue
                q = al[i] * np.exp(pw)
                if q > 0.99: q = 0.99
                if q < 1.0 / 255: continue
                w = t * q
                if t > 0.5 and t * (1 - q) <= 0.5: Z[py, px] = zz[i]
                C[py, px, 0] += w * rgb[i, 0]; C[py, px, 1] += w * rgb[i, 1]; C[py, px, 2] += w * rgb[i, 2]
                T[py, px] = t * (1 - q)
class Scan:
    def __init__(self, npz, opmin=0.02):
        d = np.load(npz); m = d['c'][:, 3] >= opmin * 255
        self.P = d['P'][m].astype(np.float64); self.rgb = d['c'][m, :3].astype(np.float64) / 255; self.al = d['c'][m, 3].astype(np.float64) / 255
        R = Rot.from_quat(d['q'][m]).as_matrix(); s = d['s'][m].astype(np.float64)
        M = R * s[:, None, :]; self.S = np.einsum('nij,nkj->nik', M, M)   # Σ = R S Sᵀ Rᵀ
    def render(self, E, Wm, fov_deg, Wpx, Hpx=None, rmax=400):
        """E : œil ; Wm : lignes = droite, haut, avant (repère du bateau) ; fov vertical."""
        Hpx = Hpx or Wpx; f = Hpx / 2 / np.tan(np.radians(fov_deg) / 2)
        pc = (self.P - E) @ Wm.T; z = pc[:, 2]; ok = z > 0.03
        idx = np.nonzero(ok)[0]; x, y, z = pc[idx, 0], pc[idx, 1], pc[idx, 2]
        u = Wpx / 2 + f * x / z; v = Hpx / 2 - f * y / z
        J = np.zeros((len(idx), 2, 3)); J[:, 0, 0] = f / z; J[:, 0, 2] = -f * x / z ** 2; J[:, 1, 1] = -f / z; J[:, 1, 2] = f * y / z ** 2
        Tm = J @ Wm; S2 = np.einsum('nij,njk,nlk->nil', Tm, self.S[idx], Tm); S2[:, 0, 0] += 0.3; S2[:, 1, 1] += 0.3
        A, B, Cc = S2[:, 0, 0], S2[:, 0, 1], S2[:, 1, 1]; det = A * Cc - B * B; good = det > 1e-12
        mid = (A + Cc) / 2; lam = mid + np.sqrt(np.maximum(0.1, mid * mid - det)); rad = 3 * np.sqrt(lam)
        keep = good & (rad < rmax) & (u + rad > 0) & (u - rad < Wpx) & (v + rad > 0) & (v - rad < Hpx)
        sel = np.nonzero(keep)[0]; order = np.argsort(z[sel]).astype(np.int64)
        ia = Cc[sel] / det[sel]; ib = -B[sel] / det[sel]; ic = A[sel] / det[sel]
        C = np.zeros((Hpx, Wpx, 3)); T = np.ones((Hpx, Wpx)); Z = np.full((Hpx, Wpx), np.nan)
        _raster(order, u[sel], v[sel], ia, ib, ic, rad[sel], self.rgb[idx[sel]], self.al[idx[sel]], Wpx, Hpx, C, T, z[sel], Z)
        self.last = dict(E=E, W=Wm, f=f, Wpx=Wpx, Hpx=Hpx, Z=Z)
        return C, T
def basis(yaw_deg, pitch_deg):     # cap 0 = vers l'avant (+z), cap 90 = bâbord (+x) ; site positif = vers le haut
    y, p = np.radians(yaw_deg), np.radians(pitch_deg)
    fw = np.array([np.sin(y) * np.cos(p), np.sin(p), np.cos(y) * np.cos(p)]); up0 = np.array([0, 1.0, 0])
    if abs(fw[1]) > 0.999: up0 = np.array([-np.sin(y), 0, -np.cos(y)]) if fw[1] > 0 else np.array([np.sin(y), 0, np.cos(y)])
    rt = np.cross(fw, up0); rt /= np.linalg.norm(rt); up = np.cross(rt, fw)
    return np.array([rt, up, fw])

def pix3d(L, px, py):          # pixel (vue précédente) → point 3D sur la première surface
    z = L['Z'][int(py), int(px)]
    if not np.isfinite(z): return None
    x = (px + 0.5 - L['Wpx'] / 2) / L['f'] * z; y = -(py + 0.5 - L['Hpx'] / 2) / L['f'] * z
    return L['E'] + L['W'].T @ np.array([x, y, z])
