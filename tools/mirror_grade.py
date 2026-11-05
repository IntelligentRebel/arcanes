"""Ressources et lieux du Miroir : une version « ~m » de chaque sprite min:*, feat:*, node:* et site:shrine_* de la carte, passée à la palette du Miroir
(l'herbe et la mousse virent au lilas, le reste refroidit un peu ; l'or reste or, les cristaux gardent leur couleur).
Les sprites sont ajoutés à l'atlas complémentaire (assets/hd2.png / .json) s'ils n'y sont pas. À lancer après hd_supplement :
  py tools/build_hd.py && py tools/hd_supplement.py && py tools/mirror_grade.py && py tools/build.py"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)
KEYS = ('min:', 'feat:', 'node:', 'site:shrine_')
SKIP = {'feat:altar', 'feat:statue'}   # icônes de bâtiments, pas des lieux de la carte
D, M, H = np.array([.13, .11, .25]), np.array([.50, .47, .72]), np.array([.93, .91, 1.0])


def grade(a):
    f = a[..., :3] / 255.
    L = (f @ np.array([.299, .587, .114]))[..., None]
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx, mn = f.max(-1), f.min(-1); d = mx - mn + 1e-6
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = (d / (mx + 1e-6))
    l = L[..., 0]
    grass = (((hue > 62) & (hue < 175) & ~((sat > .8) & (l > .45)))      # herbe, mousse, feuillage (pas les gemmes vertes, vives et claires)
             | ((hue >= 30) & (hue <= 62) & ((sat < .55) | (l < .32))))[..., None]   # herbe sèche, terre olivâtre (pas l'or, vif)
    ramp = np.where(L < .5, D + (M - D) * np.clip(L * 2, 0, 1), M + (H - M) * np.clip(L * 2 - 1, 0, 1))
    o = f + (L - f) * .25
    k = np.where(grass, .85, .32 - .12 * np.clip(sat, 0, 1)[..., None])
    out = a.copy(); out[..., :3] = np.clip((o + (ramp - o) * k) * 255, 0, 255)
    return out


def main():
    h1 = json.load(open(A('assets', 'hd.json'))); im1 = Image.open(A('assets', 'hd.png')).convert('RGBA')
    p2 = A('assets', 'hd2.json')
    h2 = json.load(open(p2)) if os.path.exists(p2) else {}
    im2 = Image.open(A('assets', 'hd2.png')).convert('RGBA') if h2 else Image.new('RGBA', (1, 1))
    src = {}
    for h, im in ((h1, im1), (h2, im2)):
        for k, r in h.items():
            if k.startswith(KEYS) and '~' not in k and k not in SKIP: src[k] = (im, r)
    # déjà dans l'atlas : refaits sur place ; les autres, rangés dans une étagère neuve
    redo = [k for k in sorted(src) if k + '~m' in h2]
    todo = [k for k in sorted(src) if k + '~m' not in h2]
    # une étagère sous l'atlas existant
    W = max(im2.width, 1024); y0 = im2.height + 2 if h2 else 0
    x = 0; y = y0; row = 0; place = {}
    for k in todo:
        _, r = src[k]
        if x + r[2] > W: x = 0; y += row + 2; row = 0
        place[k] = (x, y); x += r[2] + 2; row = max(row, r[3])
    out = Image.new('RGBA', (W, max(y + row, im2.height)), (0, 0, 0, 0)); out.paste(im2, (0, 0))
    for k in redo: place[k] = tuple(h2[k + '~m'][:2])
    for k in redo + todo:
        im, r = src[k]
        sp = np.array(im.crop((r[0], r[1], r[0] + r[2], r[1] + r[3]))).astype(float)
        out.paste(Image.fromarray(grade(sp).astype('uint8')), place[k])
        h2[k + '~m'] = [place[k][0], place[k][1], r[2], r[3]]
    out.save(A('assets', 'hd2.png'), optimize=True)
    json.dump(h2, open(p2, 'w'), separators=(',', ':'))
    print('Miroir :', len(todo), 'sprites ajoutés,', len(redo), 'refaits ->', out.size)


if __name__ == '__main__':
    main()
