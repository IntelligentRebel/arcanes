#!/usr/bin/env python3
"""Planches rendues par Codex (fond opaque, sombre ou magenta) -> planche détourée prête pour build_anim.

python3 tools/codex_cut.py <image brute> <N39> [--out art/incoming/anim]
  - grille déduite du nom de la planche (lot7.json) : 4 x 4 (une unité) ou 4 x 8 (deux unités)
  - détourage rembg (isnet-general-use) case par case, sur une case élargie pour ne pas rogner une arme qui dépasse
  - contrôle : une figure par case, aucune figure coupée au bord de la case, taille stable dans chaque rangée
Écrit <out>/<fichier de la planche> et affiche un verdict (OK / A REVOIR + raisons).
"""
import json, os, sys
os.environ.setdefault('U2NET_HOME', '/root/.rembg/models/isnet-general-use')
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_S = None


def session():
    global _S
    if _S is None:
        from rembg import new_session
        _S = new_session('isnet-general-use')
    return _S


def cut(img, cols, rows):
    from rembg import remove
    W, H = img.size
    cw, ch = W / cols, H / rows
    out = np.zeros((H, W, 4), np.uint8)
    rgb = img.convert('RGB')
    for r in range(rows):
        for c in range(cols):
            x0, y0, x1, y1 = round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)
            cell = rgb.crop((x0, y0, x1, y1))
            m = np.asarray(remove(cell, session=session(), only_mask=True))
            a = np.where(m > 40, 255, 0).astype(np.uint8)
            # garder la plus grosse silhouette et ce qui la touche presque (arme, flèche détachée près de la main)
            lab, n = ndimage.label(ndimage.binary_dilation(a > 0, iterations=4))
            if n > 1:
                sizes = ndimage.sum(a > 0, lab, range(1, n + 1))
                keep = {i + 1 for i, s in enumerate(sizes) if s >= max(sizes) * 0.04}
                a[~np.isin(lab, list(keep))] = 0
            out[y0:y1, x0:x1, :3] = np.asarray(cell)
            out[y0:y1, x0:x1, 3] = a
    return Image.fromarray(out, 'RGBA')


def native(img):
    """Codex rend souvent un vrai canal alpha (figures vers 252, fond 0 avec un léger bruit) : seuil franc, pas de rembg."""
    if img.mode != 'RGBA':
        return None
    arr = np.asarray(img).copy()
    a = arr[:, :, 3]
    if (a == 0).mean() < 0.2:
        return None
    m = a > 128
    lab, n = ndimage.label(m)
    if n:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        m[np.isin(lab, [i + 1 for i, v in enumerate(sizes) if v < 12])] = False   # poussières
    arr[:, :, 3] = np.where(m, 255, 0)
    return Image.fromarray(arr, 'RGBA')


def cuts(mask, n, axis):
    """Coupures de la grille : la ligne la plus vide près de chaque position attendue."""
    prof = mask.sum(axis=axis); size = len(prof); out = [0]
    for i in range(1, n):
        e = round(i * size / n); w = max(4, size // (n * 3))
        lo, hi = max(1, e - w), min(size - 1, e + w)
        seg = prof[lo:hi]; best = seg.min(); idx = np.nonzero(seg == best)[0]
        # le milieu de la plage vide la plus proche de la position attendue
        runs = np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1)
        run = min(runs, key=lambda r: abs(lo + (r[0] + r[-1]) / 2 - e) - len(r) / 4)
        out.append(lo + int((run[0] + run[-1]) // 2))
    return out + [size]


def check(rgba, cols, rows):
    a = np.asarray(rgba)[:, :, 3] > 0
    H, W = a.shape
    ys_, xs_ = cuts(a, rows, 1), cuts(a, cols, 0)
    bad, hs = [], []
    for r in range(rows):
        row_h = []
        for c in range(cols):
            x0, y0, x1, y1 = xs_[c], ys_[r], xs_[c + 1], ys_[r + 1]
            m = a[y0:y1, x0:x1]
            if m.sum() < 0.01 * m.size:
                bad.append(f'case {r + 1}.{c + 1} vide'); row_h.append(0); continue
            edge = m[0, :].sum() + m[-1, :].sum() + m[:, 0].sum() + m[:, -1].sum()
            if edge > 3:
                bad.append(f'case {r + 1}.{c + 1} touche le bord ({int(edge)} px)')
            ys = np.nonzero(m.any(1))[0]
            row_h.append(ys.max() - ys.min() + 1)
        hs.append(row_h)
    # repos et marche : la hauteur ne doit pas varier de plus de 25 % dans la rangée
    for r, row_h in enumerate(hs):
        if (r % 4) in (0, 1) and min(row_h) > 0 and max(row_h) / min(row_h) > 1.25:
            bad.append(f'rangée {r + 1} : hauteur instable ({min(row_h)}-{max(row_h)})')
    return bad


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'art', 'incoming', 'anim')
    src, sid = args[0], args[1]
    L = json.load(open(os.path.join(ROOT, 'art', 'anim_lot7', 'lot7.json')))
    s = next((x for x in L if x['file'].startswith(sid + '_')), None) or {'file': sid + '_test.png', 'units': ['x'] * int(args[2] if len(args) > 2 else 1)}
    cols, rows = 4, 4 * len(s['units'])
    img = Image.open(src)
    W, H = img.size
    want = 1.5 if rows == 4 else 2 / 3
    probs = [] if abs(W / H - want) < 0.08 else [f'format {W}x{H} au lieu de {"3:2" if rows == 4 else "2:3"}']
    rgba = native(img) or cut(img, cols, rows)
    probs += check(rgba, cols, rows)
    os.makedirs(out, exist_ok=True)
    dst = os.path.join(out, s['file'])
    rgba.save(dst)
    print(('OK ' if not probs else 'A REVOIR ') + s['file'] + (' : ' + ' ; '.join(probs) if probs else ''))


if __name__ == '__main__':
    main()
