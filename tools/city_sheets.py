"""Cités par peuple : une planche Codex par peuple (art/raw/cities/<peuple>.png, 4 x 2 cases, fond transparent) :
cases 1-6 = les six tailles de la cité (sans muraille), case 7 = sa muraille seule (anneau vide), case 8 vide.
Chaque sprite est détouré, posé par le bas au centre d'un carré, réduit à 176 px et ajouté à l'atlas hd2 :
city:<peuple>:0..5 et city:<peuple>:walls (refaits sur place s'ils y sont déjà).
  py tools/city_sheets.py   (après hd_supplement et mirror_grade, avant build)"""
import glob, json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)
SIZE = 176


def cell_sprite(a):
    """le plus gros objet de la case (avec ses éclats proches), posé par le bas au centre d'un carré"""
    a = a.copy()
    # voile de brume semi-transparent (certaines planches) : clair, peu saturé, pas tout à fait opaque -> transparent
    rgb = a[..., :3].astype(int); mx, mn = rgb.max(-1), rgb.min(-1)
    fog = (a[..., 3] < 235) & (mx > 120) & ((mx - mn) < 40)
    a[fog] = 0
    alpha = a[..., 3]
    solid = alpha > 60
    if not solid.any(): return None
    lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=6))
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(sizes) * 0.04])
    b = a.copy(); b[~keep] = 0
    ys, xs = np.nonzero(keep & solid)
    part = b[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = part.shape[:2]; s = max(w, h)
    sq = np.zeros((s, s, 4), np.uint8); sq[s - h:, (s - w) // 2:(s - w) // 2 + w] = part
    return Image.fromarray(sq, 'RGBA').resize((SIZE, SIZE), Image.LANCZOS)


def main():
    sprites = {}
    for f in sorted(glob.glob(A('art', 'raw', 'cities', '*.png'))):
        race = os.path.splitext(os.path.basename(f))[0]
        a = np.array(Image.open(f).convert('RGBA'))
        H, W = a.shape[:2]
        for j in range(2):
            for i in range(4):
                k = j * 4 + i
                if k > 6: continue
                sp = cell_sprite(a[round(j * H / 2):round((j + 1) * H / 2), round(i * W / 4):round((i + 1) * W / 4)])
                if sp: sprites['city:%s:%s' % (race, 'walls' if k == 6 else k)] = sp
    # murailles de bataille en rondins (art/raw/fx_wood_walls.png : tour, pan, porte, brèche, de gauche à droite) : cwall:wood:*,
    # à la taille des murailles de pierre (même hauteur pour la tour, même largeur pour les pans)
    fw = A('art', 'raw', 'fx_wood_walls.png')
    if os.path.exists(fw):
        a = np.array(Image.open(fw).convert('RGBA')); solid = a[..., 3] > 60
        lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=4)); sizes = ndimage.sum(solid, lab, range(1, n + 1))
        big = sorted(range(1, n + 1), key=lambda k: -sizes[k - 1])[:4]
        boxes = []
        for k in big:
            ys, xs = np.nonzero((lab == k) & solid); part = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy(); part[lab[ys.min():ys.max() + 1, xs.min():xs.max() + 1] != k] = 0
            boxes.append((xs.min(), Image.fromarray(part, 'RGBA')))
        h1 = json.load(open(A('assets', 'hd.json')))
        for name, (_, im) in zip(['tower', '0', 'gate', 'broken'], sorted(boxes, key=lambda b: b[0])):
            ref = h1['cwall:' + name]
            sc = ref[3] / im.height if name == 'tower' else ref[2] / im.width
            sprites['cwall:wood:' + name] = im.resize((max(1, round(im.width * sc)), max(1, round(im.height * sc))), Image.LANCZOS)
    p2 = A('assets', 'hd2.json'); h2 = json.load(open(p2)); im2 = Image.open(A('assets', 'hd2.png')).convert('RGBA')
    W = im2.width; y0 = im2.height + 2; x = 0; y = y0; row = 0; place = {}
    for k in sorted(sprites):
        sw, sh = sprites[k].size
        if k in h2 and h2[k][2] == sw and h2[k][3] == sh: place[k] = tuple(h2[k][:2]); continue
        if x + sw > W: x = 0; y += row + 2; row = 0
        place[k] = (x, y); x += sw + 2; row = max(row, sh)
    out = Image.new('RGBA', (W, max(im2.height, y + row)), (0, 0, 0, 0)); out.paste(im2, (0, 0))
    for k, sp in sprites.items():
        out.paste(Image.new('RGBA', sp.size, (0, 0, 0, 0)), place[k]); out.paste(sp, place[k]); h2[k] = [place[k][0], place[k][1], sp.width, sp.height]
    out.save(A('assets', 'hd2.png'), optimize=True); json.dump(h2, open(p2, 'w'), separators=(',', ':'))
    print('cités :', len(sprites), 'sprites ->', out.size)


if __name__ == '__main__':
    main()
