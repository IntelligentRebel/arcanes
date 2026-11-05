#!/usr/bin/env python3
"""Calques de la faille animée (carte du monde), tirés de sa figurine fixe site:rift :
- rift_base.png : la déchirure et son liseré, sans les rochers qui flottent autour (la galaxie y tourne, découpée au vol) ;
- rift_rocks.png + rift.json : les rochers et éclats un par un (place d'origine), l'œil de la galaxie et son rayon.
Sorties dans assets/extra/ (intégrées au fichier par build.py)."""
import json, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'extra')
d = json.load(open(os.path.join(ROOT, 'assets', 'hd.json')))
r = d['site:rift']
im = Image.open(os.path.join(ROOT, 'assets', 'hd.png')).convert('RGBA').crop((r[0], r[1], r[0] + r[2], r[1] + r[3]))
A = np.asarray(im).astype(np.float32) / 255
H, W = A.shape[:2]
rgb, al = A[:, :, :3], A[:, :, 3]
V = rgb.max(2); S = np.where(V > 0, (V - rgb.min(2)) / np.maximum(V, 1e-6), 0)
# 1. le liseré : violet saturé et lumineux, ou presque blanc ; puis la lentille = liseré + tout ce qu'il enferme
rim = (al > .4) & (((S > .55) & (V > .55)) | (V > .88))
rim = ndimage.binary_closing(rim, iterations=2)
lab, n = ndimage.label(rim)
sizes = ndimage.sum(rim, lab, range(1, n + 1))
main = lab == (1 + int(np.argmax(sizes)))                 # le grand contour, sans les éclats isolés
lens = ndimage.binary_fill_holes(ndimage.binary_closing(main, iterations=3))
# 2. le cœur : l'intérieur du liseré, relevé à la main sur la figurine (176 px) ; la galaxie tourne autour de son œil
INNER = [(88, 32), (98, 48), (106, 64), (113, 84), (112, 100), (106, 118), (98, 136), (88, 152), (78, 136), (70, 118), (63, 100), (64, 84), (70, 64), (78, 48)]
EYE = (90, 101)
from PIL import ImageDraw
_m = Image.new('L', (W, H), 0); ImageDraw.Draw(_m).polygon(INNER, fill=255)
core_mask = np.asarray(_m) > 127
# 3. les satellites : tout ce qui est opaque hors de la lentille (élargie d'un rien)
near = ndimage.binary_dilation(lens, iterations=1)
sat = (al > .05) & ~near
slab, sn = ndimage.label(ndimage.binary_dilation(sat, iterations=1))
rocks, sheet_x, pieces = [], 0, []
for i in range(1, sn + 1):
    m = (slab == i) & sat
    if m.sum() < 3: continue
    ys, xs = np.nonzero(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    piece = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    piece[...] = (A[y0:y1, x0:x1] * 255).astype(np.uint8)
    piece[~m[y0:y1, x0:x1], 3] = 0
    pieces.append((piece, x0, y0, int(m.sum())))
# planche des rochers : côte à côte, avec leur place d'origine dans la figurine
Wsum = sum(p[0].shape[1] + 1 for p in pieces); Hmax = max(p[0].shape[0] for p in pieces)
sheet = np.zeros((Hmax, Wsum, 4), np.uint8); meta = []
x = 0
for piece, x0, y0, area in pieces:
    h, w = piece.shape[:2]
    sheet[:h, x:x + w] = piece
    meta.append([x, 0, w, h, int(x0), int(y0), area])
    x += w + 1
# calque de base : la figurine sans les satellites
base = (A * 255).astype(np.uint8).copy()
base[sat, 3] = 0
# cœur prolongé : l'intérieur, et au-dehors un fond d'outre-monde semé d'étoiles, pour tourner sans trou
core = (A * 255).astype(np.uint8).copy()
inside = core_mask
fill = np.median(core[inside][:, :3], axis=0).astype(np.uint8) if inside.any() else np.array([20, 8, 50], np.uint8)
dark = np.percentile(core[inside][:, :3], 25, axis=0).astype(np.uint8)
rng = np.random.default_rng(7)
out = np.zeros_like(core)
out[...] = np.concatenate([dark, [255]])
stars = rng.random((H, W)) < .012
out[stars, :3] = np.array([200, 170, 255], np.uint8)
out[inside] = core[inside]; out[inside, 3] = 255
# fondu doux au bord pour que le raccord ne se voie pas en tournant
mask_img = Image.fromarray((core_mask * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(1.5))
Image.fromarray(base, 'RGBA').save(os.path.join(OUT, 'rift_base.png'), optimize=True)
Image.fromarray(sheet, 'RGBA').save(os.path.join(OUT, 'rift_rocks.png'), optimize=True)
# centre de rotation : le point le plus brillant du cœur (l'œil de la galaxie)
cx, cy = EYE
json.dump({'size': [W, H], 'center': [int(cx), int(cy)], 'swirl': 22, 'rocks': meta}, open(os.path.join(OUT, 'rift.json'), 'w'))
print('rochers', len(meta), 'centre', cx, cy, 'cœur', int(core_mask.sum()), 'px')
# contrôle : base, cœur, masque, rochers
prev = Image.new('RGBA', (W * 3 + 20, H + Hmax + 10), (40, 60, 40, 255))
for k, img in enumerate([Image.fromarray(base), Image.fromarray(out), Image.merge('RGBA', [mask_img] * 4)]):
    prev.alpha_composite(img.convert('RGBA'), (k * (W + 10), 0))
sh = Image.fromarray(sheet)
if sh.width > prev.width: sh = sh.resize((prev.width, max(1, round(sh.height * prev.width / sh.width))), Image.NEAREST)
prev.alpha_composite(sh, (0, H + 10))
prev.resize((prev.width * 2, prev.height * 2), Image.NEAREST).save(os.path.join(ROOT, 'art', 'rift_layers.png'))
