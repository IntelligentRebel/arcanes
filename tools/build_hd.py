#!/usr/bin/env python3
"""Découpe les planches générées (art/incoming/zip1) en sprites HD et les assemble dans un atlas.

Entrées : art/prompts.json (ordre et clés de chaque planche), images brutes de ChatGPT.
Sorties : assets/hd.png + assets/hd.json (atlas), assets/title.jpg, art/hd/*.png (contrôle),
          art/hd_contact.png (planche de vérification avec les clés).
"""
import json, os, re, sys, unicodedata
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRCS = [os.path.join(ROOT, 'art', 'incoming', d) for d in ('zip1', 'zip2', 'zip3', 'zip4', 'zip5', 'zip6', 'zip7', 'zip8', 'zip9', 'zip10')]
OUT_DIR = os.path.join(ROOT, 'art', 'hd')
PROMPTS = json.load(open(os.path.join(ROOT, 'art', 'prompts.json'), encoding='utf-8'))
SHEETS = {s['id']: s for s in PROMPTS['sheets']}


def norm(s):
    s = s.replace('#U00e9', 'é').replace('#U00e0', 'à').replace('#U00ea', 'ê')
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


# nom de fichier (normalisé) -> id de planche
FILEMAP = {
    'races 1': 'U06', 'races 2': 'U02', 'races 3': 'U07', 'races 4': 'U03', 'races 5': 'U05', 'races 6': 'U01', 'races 7': 'U04',
    'races 9': 'U08', 'races 10': 'U09', 'races 11': 'U10', 'races 12': 'U11', 'races 13': 'U12', 'races 14': 'U13', 'races 15': 'U14',
    'creatures1': 'K01', 'creatures2': 'K02', 'creatures3': 'K03', 'creatures4': 'K04', 'creatures5': 'K05',
    'decor arbres': 'F01', 'decor montagnes': 'F02', 'decor colinnes': 'F03', 'decor details': 'F04',
    'decor lieux a explorer': 'L01', 'lieux nodes': 'L02', 'decor minerais': 'M01', 'villes': 'C01',
    'portraits 2': 'P01', 'portraits 3': 'P02', 'portraits 1': 'P03', 'portraits 4': 'P04',
    'sol foret': 'T01', 'sol foret detaille': 'T02', 'sol desert': 'T03', 'sol marais': 'T04', 'sol montagnes': 'T05',
    'sol mer': 'T06', 'sol hauts fonds': 'T07', 'sol roches de montagnes': 'T08', 'sol volcan': 'T09',
    'title screen': 'A01',
    # lot 2 (zip2) : noms donnés par ChatGPT ou par Olivier
    'cites 1': 'B01', 'cites 2': 'B02', 'cites 3': 'B03', 'cites 4': 'W01',
    'grille de heros fantasy en pixel art 1': 'H01',
    'image chatgpt 16 oct 2026 15 42 55 2': 'F05',
    'texture pixel art de sous bois verdoyant 2': 'T10',
    # l'ancien numéro de la planche des trouvailles (C01, déjà pris par les villes)
    'c01 caches': 'Y01',
}
# planches ratées, par envoi : ignorées (une version réussie arrive dans un envoi suivant)
BAD = {'zip2': {'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'Q03', 'Q04', 'Q05', 'Q06'},
       'zip3': {'I02', 'I03', 'I04'}}   # objets dessinés en vectoriel plat, pas en pixel art
# autres versions ou doublons reçus, écartés volontairement
SKIP = {'000 reference image', 'lieux dongeons a explorer', 'grille de heros fantastiques en pixel art 6', 'grille de heros fantasy en pixel art 5',
        'planche de sprites fantasy pixel art 3', 'image chatgpt 16 oct 2026 12 30 45 2', 'texture pixel art de prairie forestiere l05f7c5 4'}

# taille (côté du carré) dans l'atlas, par préfixe de clé
SIZE = {'unit': 128, 'tree': 96, 'mountain': 160, 'volcano': 160, 'hill': 128, 'outcrop': 112, 'detail': 96, 'feat': 160,
        'node': 160, 'decal': 160, 'min': 96, 'city': 176, 'wizard': 160, 'tex': 384, 'bld': 160, 'edge': 96, 'spell': 96, 'portrait': 160,
        'item': 96, 'cache': 112, 'site': 176, 'staff': 160}
# sprites gardés à leurs proportions (pas de carré) : côté le plus long
TRIM = {'cwall': 224, 'chouse': 176, 'ov': 176}
CALM = {'tex:forestedge': .3, 'tex:shallows': .55, 'tex:forest': .45, 'tex:rock': .35, 'tex:volcanic': .25, 'tex:grass': .2, 'tex:swamp': .3, 'tex:tundra': .3, 'tex:desert': .15, 'tex:ocean': .15}
# figurines plus petites que la normale (fraction de la hauteur du carré)
RACE_SCALE = {'U04': 0.80, 'U13': 0.86}
# idem, sprite par sprite (héros nains, halfelins…)
KEY_SCALE = {'unit:HeroBrax': 0.84, 'unit:HalflingEngineers': 0.80}   # l'ingénieur halfelin (X03) : à la taille des autres halfelins


def clean_alpha(a):
    a = a.astype(np.float32)
    a = np.clip((a - 24) * 255.0 / (232 - 24), 0, 255)
    return a.astype(np.uint8)


def components(rgba, n_expected, rows):
    """Composantes connexes de la planche, regroupées en rangées puis triées de gauche à droite."""
    al = clean_alpha(rgba[:, :, 3])
    mask = al > 60
    H, W = mask.shape
    big_min = H * W * 0.0025
    # dilatation adaptative : on relie les fragments proches sans souder deux voisins
    for it in (7, 4, 2, 1, 0):
        grown = ndimage.binary_dilation(mask, iterations=it) if it else mask
        lab, n = ndimage.label(grown)
        areas = ndimage.sum(mask, lab, index=range(1, n + 1))
        if sum(1 for a_ in areas if a_ >= big_min) >= n_expected:
            break
    objs = ndimage.find_objects(lab)
    comps = []
    for i, sl in enumerate(objs):
        comps.append({'ids': [i + 1], 'y0': sl[0].start, 'y1': sl[0].stop, 'x0': sl[1].start, 'x1': sl[1].stop, 'area': float(areas[i])})
    big = [c for c in comps if c['area'] >= big_min]
    small = [c for c in comps if c['area'] < big_min]
    # fragments (étincelles, fumée, roches flottantes) : rattachés au voisin le plus proche
    for s in small:
        cy, cx = (s['y0'] + s['y1']) / 2, (s['x0'] + s['x1']) / 2
        best, bd = None, 1e9
        for b in big:
            dx = max(b['x0'] - cx, 0, cx - b['x1']); dy = max(b['y0'] - cy, 0, cy - b['y1'])
            d = (dx * dx + dy * dy) ** .5
            if d < bd: bd, best = d, b
        if best is not None and bd < 70:
            best['ids'] += s['ids']
            for k, f in (('y0', min), ('x0', min), ('y1', max), ('x1', max)): best[k] = f(best[k], s[k])
            best['area'] += s['area']
    # trop d'éléments : fusionne les plus petits dans leur voisin
    while len(big) > n_expected:
        big.sort(key=lambda c: c['area'])
        s = big.pop(0)
        cy, cx = (s['y0'] + s['y1']) / 2, (s['x0'] + s['x1']) / 2
        tgt = min(big, key=lambda b: ((b['y0'] + b['y1']) / 2 - cy) ** 2 + ((b['x0'] + b['x1']) / 2 - cx) ** 2)
        tgt['ids'] += s['ids']
        for k, f in (('y0', min), ('x0', min), ('y1', max), ('x1', max)): tgt[k] = f(tgt[k], s[k])
        tgt['area'] += s['area']
    # rangées : coupure aux plus grands écarts verticaux entre centres
    big.sort(key=lambda c: (c['y0'] + c['y1']) / 2)
    cys = [(c['y0'] + c['y1']) / 2 for c in big]
    gaps = sorted(range(1, len(big)), key=lambda i: cys[i] - cys[i - 1], reverse=True)[:max(0, rows - 1)]
    cuts = sorted(gaps)
    out, start = [], 0
    for cut in cuts + [len(big)]:
        row = sorted(big[start:cut], key=lambda c: (c['x0'] + c['x1']) / 2)
        out += row; start = cut
    return out, lab, al


def extract(rgba, lab, al, comp):
    y0, y1, x0, x1 = comp['y0'], comp['y1'], comp['x0'], comp['x1']
    sub = rgba[y0:y1, x0:x1].copy()
    keep = np.isin(lab[y0:y1, x0:x1], comp['ids'])
    a = al[y0:y1, x0:x1].copy()
    a[~keep] = 0
    sub[:, :, 3] = a
    ys, xs = np.nonzero(a > 8)
    if len(ys) == 0:
        return None
    sub = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(sub, 'RGBA')


def fit_square(im, side, fill=0.96, bottom=0.02):
    """Place le sprite dans un carré : centré horizontalement, posé en bas, proportions gardées."""
    w, h = im.size
    s = side * fill / max(w, h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    small = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(small, ((side - nw) // 2, side - nh - round(side * bottom)))
    return canvas


def portraits(img, n):
    """Portraits séparés par des gouttières magenta."""
    a = np.asarray(img.convert('RGB')).astype(int)
    mag = (a[:, :, 0] > 170) & (a[:, :, 1] < 90) & (a[:, :, 2] > 170)
    H, W = mag.shape
    colmag = mag.mean(0) > 0.5
    rowmag = mag.mean(1) > 0.5

    def spans(flags, L):
        res, inside, st = [], False, 0
        for i in range(L):
            if not flags[i] and not inside: inside, st = True, i
            if flags[i] and inside: inside = False; res.append((st, i))
        if inside: res.append((st, L))
        return [r for r in res if r[1] - r[0] > L * 0.2]
    cols, rows = spans(colmag, W), spans(rowmag, H)
    cells = []
    for (r0, r1) in rows:
        for (c0, c1) in cols:
            cell = img.crop((c0, r0, c1, r1)).convert('RGB')
            # rogne les liserés magenta résiduels
            arr = np.asarray(cell).astype(int)
            m = (arr[:, :, 0] > 150) & (arr[:, :, 1] < 110) & (arr[:, :, 2] > 150)
            t = 0
            while t < 12 and (m[t].mean() > 0.05 or m[-1 - t].mean() > 0.05 or m[:, t].mean() > 0.05 or m[:, -1 - t].mean() > 0.05): t += 1
            cell = cell.crop((t, t, cell.width - t, cell.height - t))
            sq = min(cell.size)
            cell = cell.crop(((cell.width - sq) // 2, 0, (cell.width - sq) // 2 + sq, sq))
            cells.append(cell)
    return cells[:n]


def magenta_cells(img, n, rows):
    """Vignettes ou portraits séparés par du magenta : composantes non magenta, rangées puis colonnes."""
    a = np.asarray(img.convert('RGB')).astype(int)
    mag = (a[:, :, 0] > 160) & (a[:, :, 1] < 100) & (a[:, :, 2] > 160)
    lab, _ = ndimage.label(~mag)
    objs = ndimage.find_objects(lab)
    H, W = mag.shape
    cells = [sl for sl in objs if (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start) > H * W * 0.012]
    cells.sort(key=lambda sl: (sl[0].start + sl[0].stop) / 2)
    cys = [(sl[0].start + sl[0].stop) / 2 for sl in cells]
    gaps = sorted(range(1, len(cells)), key=lambda i: cys[i] - cys[i - 1], reverse=True)[:max(0, rows - 1)]
    out, start = [], 0
    for cut in sorted(gaps) + [len(cells)]:
        out += sorted(cells[start:cut], key=lambda sl: sl[1].start); start = cut
    res = []
    for sl in out[:n]:
        cell = img.convert('RGB').crop((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
        # rogne les liserés magenta antialiasés
        arr = np.asarray(cell).astype(int)
        m = (arr[:, :, 0] > 150) & (arr[:, :, 1] < 120) & (arr[:, :, 2] > 150)
        t = 0
        while t < 10 and (m[t].mean() > 0.02 or m[-1 - t].mean() > 0.02 or m[:, t].mean() > 0.02 or m[:, -1 - t].mean() > 0.02): t += 1
        res.append(cell.crop((t, t, cell.width - t, cell.height - t)))
    return res


def seamless(img, side):
    """Texture non raccordable (et pas carrée) : carré central, puis fondu avec sa version décalée d'une demi-période."""
    w, h = img.size
    s = min(w, h)
    sq = np.asarray(img.convert('RGB').crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))).astype(np.float32)
    sh = np.roll(np.roll(sq, s // 2, 0), s // 2, 1)
    yy, xx = np.mgrid[0:s, 0:s] / (s - 1)
    # poids de l'original : 1 au centre, 0 sur les bords (le décalé y est continu)
    wgt = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy)) * 2
    wgt = np.clip(wgt * 1.6, 0, 1)[:, :, None]
    out = sq * wgt + sh * (1 - wgt)
    return Image.fromarray(out.clip(0, 255).astype(np.uint8)).resize((side, side), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    sprites = {}   # clé -> Image RGBA
    report = []
    files = [(d, f) for d in SRCS if os.path.isdir(d) for f in sorted(os.listdir(d))]
    seen = set()
    for d, f in files:
        key = norm(os.path.splitext(f)[0])
        sid = FILEMAP.get(key)
        mm = re.match(r'^([a-z])(\d\d) ', key)
        if not sid and mm and (mm.group(1).upper() + mm.group(2)) in SHEETS:
            sid = mm.group(1).upper() + mm.group(2)
        if sid in BAD.get(os.path.basename(d), ()):
            report.append(f'planche ratée, ignorée : {f}')
            continue
        if not sid or sid in seen:
            if key not in SKIP:
                report.append(f'ignoré : {f}')
            continue
        seen.add(sid)
        sh = SHEETS[sid]
        img = Image.open(os.path.join(d, f))
        if sh['kind'] == 'texture':
            w0, h0 = img.size
            # textures du Miroir (Codex) : raccord forcé, Codex ne garantit pas une texture qui se répète sans couture
            t = (img.convert('RGB').resize((SIZE['tex'], SIZE['tex']), Image.LANCZOS) if w0 == h0 and not sh.get('seamless')
                 else seamless(img, SIZE['tex']))
            calm = CALM.get(sh['keys'][0].replace('~m', ''), 0)
            if calm:
                # détails atténués à l'échelle de la carte : mélange avec une version floutée (bords raccordés)
                big = Image.new('RGB', (t.width * 3, t.height * 3))
                for i in range(3):
                    for j in range(3): big.paste(t, (i * t.width, j * t.height))
                soft = big.filter(ImageFilter.GaussianBlur(3)).crop((t.width, t.height, t.width * 2, t.height * 2))
                t = Image.blend(t, soft, calm)
            sprites[sh['keys'][0]] = t.convert('RGBA')
            continue
        if sh['kind'] == 'illustration':
            img.convert('RGB').save(os.path.join(ROOT, 'assets', 'title.jpg'), quality=88, optimize=True, progressive=True)
            continue
        if sh['kind'] == 'vignette' or (sh['kind'] == 'portrait' and sh.get('lot') == 2):
            cells = magenta_cells(img, len(sh['keys']), sh['grid'][1])
            if len(cells) != len(sh['keys']):
                report.append(f'{sid} {f}: {len(cells)} cases au lieu de {len(sh["keys"])}')
            for k, c in zip(sh['keys'], cells):
                side = SIZE[k.split(':')[0]]
                if k.startswith('portrait:'):
                    sq = min(c.size); c = c.crop(((c.width - sq) // 2, (c.height - sq) // 2, (c.width - sq) // 2 + sq, (c.height - sq) // 2 + sq))
                sprites[k] = c.resize((side, side), Image.LANCZOS).convert('RGBA')
            continue
        if sh['kind'] == 'portrait':
            cells = portraits(img, len(sh['keys']))
            if len(cells) != len(sh['keys']):
                report.append(f'{sid} {f}: {len(cells)} portraits au lieu de {len(sh["keys"])}')
            for k, c in zip(sh['keys'], cells):
                sprites[k] = c.resize((SIZE['wizard'], SIZE['wizard']), Image.LANCZOS).convert('RGBA')
            continue
        rgba = np.asarray(img.convert('RGBA')).copy()
        comps, lab, al = components(rgba, len(sh['keys']), sh['grid'][1])
        if len(comps) != len(sh['keys']):
            report.append(f'{sid} {f}: {len(comps)} éléments trouvés au lieu de {len(sh["keys"])}')
        for k, c in zip(sh['keys'], comps):
            im = extract(rgba, lab, al, c)
            if im is None:
                continue
            pre = k.split(':')[0]
            if pre in TRIM:
                s = TRIM[pre] / max(im.size)
                sprites[k] = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
                continue
            side = SIZE.get(pre, 128)
            fill = 0.96 * RACE_SCALE.get(sid, 1.0) * KEY_SCALE.get(k, 1.0) if pre == 'unit' else 0.98
            sprites[k] = fit_square(im, side, fill=fill, bottom=0.02 if pre == 'unit' else 0.0)
    missing = [s['id'] for s in PROMPTS['sheets'] if s['id'] not in seen and s['id'] != 'S00']
    if missing:
        report.append('planches absentes : ' + ', '.join(missing))

    # atlas : rangées par taille décroissante
    items = sorted(sprites.items(), key=lambda kv: (-kv[1].height, kv[0]))
    W = 2048
    x = y = rowh = 0
    pos = {}
    for k, im in items:
        if x + im.width > W:
            x, y, rowh = 0, y + rowh, 0
        pos[k] = (x, y, im.width, im.height)
        x += im.width; rowh = max(rowh, im.height)
    H = y + rowh
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for k, im in items:
        atlas.paste(im, pos[k][:2])
        im.save(os.path.join(OUT_DIR, k.replace(':', '_') + '.png'))
    atlas.save(os.path.join(ROOT, 'assets', 'hd.png'), optimize=True)
    with open(os.path.join(ROOT, 'assets', 'hd.json'), 'w') as fh:
        json.dump({k: list(v) for k, v in pos.items()}, fh, separators=(',', ':'))

    # planche de contrôle
    keys = [k for k, _ in sorted(sprites.items()) if not k.startswith('tex:')]
    cell, cols = 132, 14
    rows_n = -(-len(keys) // cols)
    sheet = Image.new('RGB', (cols * cell, rows_n * (cell + 14)), (44, 46, 56))
    d = ImageDraw.Draw(sheet)
    for i, k in enumerate(keys):
        im = sprites[k].copy(); im.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
        cx, cy = (i % cols) * cell, (i // cols) * (cell + 14)
        bg = Image.new('RGBA', im.size, (70, 74, 88, 255)); bg.alpha_composite(im)
        sheet.paste(bg.convert('RGB'), (cx + (cell - im.width) // 2, cy + 2 + (cell - 8 - im.height)))
        d.text((cx + 3, cy + cell - 4), k.split(':', 1)[1][:20], fill=(255, 230, 120))
    sheet.save(os.path.join(ROOT, 'art', 'hd_contact.png'))
    print(f'{len(sprites)} sprites, atlas {W}x{H}, {os.path.getsize(os.path.join(ROOT, "assets", "hd.png")) // 1024} Ko')
    for r in report:
        print('  !', r)


if __name__ == '__main__':
    main()
