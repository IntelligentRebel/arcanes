"""Effets dessinés par ChatGPT : la planche des projectiles (5 x 4) et celle du sol corrompu (3 x 3), découpées,
nettoyées (alpha franc, bruit de fond retiré), réduites et rangées dans un atlas : assets/fx.png + assets/fx.json.
  py tools/build_fx.py
Entrées : art/raw/fx_projectiles.png, art/raw/fx_corruption.png (fond transparent), art/raw/fx_flames.png (mur de flammes, 4 x 2, fond noir)."""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJ = ['arrow', 'arrow_elf', 'arrow_dark', 'bolt_crossbow', 'arrow_fire',
        'javelin', 'spear_tribal', 'axe', 'stone', 'dagger',
        'boulder', 'boulder_fire', 'cannonball', 'rock_giant', 'ballista',
        'magic_chaos', 'magic_life', 'magic_death', 'magic_nature', 'magic_sorcery']


def blobs(path, count, grow):
    """les sprites de la planche, repérés comme des taches d'opacité (et non par une grille : ChatGPT ne centre pas
    toujours dans les cases) ; une tache absorbe ses éclats proches (étincelles, flammes) ; rangés ligne par ligne"""
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    alpha = a[:, :, 3]
    a[alpha < 28] = 0
    solid = alpha >= 28
    a[(alpha > 215), 3] = 255
    lab, n = ndimage.label(ndimage.binary_dilation(solid, iterations=grow))
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = sorted(range(1, n + 1), key=lambda k: -sizes[k - 1])[:count]
    found = []
    for k in keep:
        ys, xs = np.nonzero((lab == k) & solid)
        found.append((k, xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    # lignes : les centres verticaux se regroupent
    found.sort(key=lambda f: (f[2] + f[4]) / 2)
    rows, cur = [], [found[0]]
    for f in found[1:]:
        if (f[2] + f[4]) / 2 - (cur[-1][2] + cur[-1][4]) / 2 > 0.35 * (cur[-1][4] - cur[-1][2] + f[4] - f[2]) / 2 + 40: rows.append(cur); cur = [f]
        else: cur.append(f)
    rows.append(cur)
    out = []
    for r in rows:
        for k, x0, y0, x1, y1 in sorted(r, key=lambda f: (f[1] + f[3]) / 2):
            part = a[y0:y1, x0:x1].copy()
            part[lab[y0:y1, x0:x1] != k] = 0   # rien des voisins
            out.append(Image.fromarray(part, 'RGBA'))
    return out


def cells(path, cols, rows):
    """planche en grille régulière (le sol corrompu : chaque tache bien au centre de sa case)"""
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    a[a[:, :, 3] < 28] = 0
    a[a[:, :, 3] > 215, 3] = 255
    H, W = a.shape[:2]
    out = []
    for j in range(rows):
        for i in range(cols):
            c = Image.fromarray(a[round(j * H / rows):round((j + 1) * H / rows), round(i * W / cols):round((i + 1) * W / cols)].copy(), 'RGBA')
            bb = c.getbbox()
            out.append(c.crop(bb) if bb else c)
    return out


def main():
    sprites = {}
    # projectiles : moitié de la taille d'origine (une flèche fait encore ~130 px, le jeu la réduit à l'échelle du champ)
    for name, c in zip(PROJ, blobs(os.path.join(ROOT, 'art', 'raw', 'fx_projectiles.png'), 20, 8)):
        sprites['proj:' + name] = c.resize((max(1, c.width // 2), max(1, c.height // 2)), Image.LANCZOS)
    # sol corrompu : chaque tache ramenée à 192 px au plus (une case de carte en fait 48 à 128 à l'écran)
    for k, c in enumerate(cells(os.path.join(ROOT, 'art', 'raw', 'fx_corruption.png'), 3, 3)):
        s = 192 / max(c.width, c.height)
        sprites['corrupt:%d' % k] = c.resize((round(c.width * s), round(c.height * s)), Image.LANCZOS)
    # mur de flammes : 8 images d'une flamme en boucle (planche 4 x 2 sur fond noir) ; le noir devient transparence
    fl = os.path.join(ROOT, 'art', 'raw', 'fx_flames.png')
    if os.path.exists(fl):
        a = np.array(Image.open(fl).convert('RGBA')).astype(float)
        H, W2 = a.shape[:2]; frames = []
        for j in range(2):
            for i in range(4):
                frames.append(a[round(j * H / 2):round((j + 1) * H / 2), round(i * W2 / 4):round((i + 1) * W2 / 4)])
        opaque = a[..., 3].min() > 250
        for k, c in enumerate(frames):
            if opaque:   # planche sans transparence : le noir (et le bruit sombre) devient transparent
                al = np.clip((c[..., :3].max(-1) - 14) / 200, 0, 1)
                rgb = np.clip(c[..., :3] / np.maximum(al[..., None], 1e-3), 0, 255)   # couleur « dé-prémultipliée »
                im = Image.fromarray(np.dstack([rgb, al * 255]).astype('uint8'), 'RGBA')
            else: im = Image.fromarray(c.astype('uint8'), 'RGBA')
            im = im.resize((96, 128), Image.LANCZOS)                       # toutes de même taille : la base ne saute pas
            sprites['flame:%d' % k] = im
    # rangement en étagères
    W = 1024
    x = y = row = 0
    place = {}
    for k, im in sorted(sprites.items(), key=lambda kv: -kv[1].height):
        if x + im.width > W: x = 0; y += row + 2; row = 0
        place[k] = (x, y, im.width, im.height)
        x += im.width + 2; row = max(row, im.height)
    atlas = Image.new('RGBA', (W, y + row), (0, 0, 0, 0))
    for k, (x, y, w, h) in place.items(): atlas.paste(sprites[k], (x, y))
    atlas.save(os.path.join(ROOT, 'assets', 'fx.png'), optimize=True)
    json.dump({k: list(v) for k, v in place.items()}, open(os.path.join(ROOT, 'assets', 'fx.json'), 'w'), separators=(',', ':'))
    print('fx.png', atlas.size, len(place), 'sprites', os.path.getsize(os.path.join(ROOT, 'assets', 'fx.png')) // 1024, 'Ko')


if __name__ == '__main__':
    main()
