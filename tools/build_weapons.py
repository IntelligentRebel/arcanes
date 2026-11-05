#!/usr/bin/env python3
"""Armes des figurines : masques des armes de chaque unité normale (figurine fixe de assets/hd.png et images
d'animation de assets/anim.png), pour les faire luire quand l'unité porte des armes magiques, comme dans l'original.

Détection automatique : pixels de métal (acier gris, bronze ou or pâle) et, pour les tireurs, bois des arcs, situés
hors du tronc de la figurine (ce qui dépasse du corps : lames, fers de lance, haches, arcs), puis prolongés dans le
métal voisin (la lame qui passe devant le corps). Les pieds et jambières sont écartés. Les erreurs restantes (cornes,
plumes d'ailes, queues) sont retirées à la main par unité (tools/weapon_overrides.json : zones à écarter, en pixels
de la figurine de 128).

Sortie : assets/weapons.png (atlas compact des masques, blanc et transparent) + assets/weapons.json
  {"s": {"unit:X": [ax, ay, w, h, ox, oy]}, "a": {"X": [[ax, ay, w, h, ox, oy] x16]}}
  (ax, ay, w, h) : rectangle dans l'atlas ; (ox, oy) : position dans la figurine (128) ou dans l'image d'animation.
  py tools/build_weapons.py [--review dossier]   (--review : planches de contrôle)
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# unités sans arme visible à faire luire (créatures, montures sans cavalier armé)
NO_WEAPON = {'StagBeetle', 'DragonTurtle', 'Griffin', 'Manticore', 'Nightmares', 'DoomDrake', 'Golem', 'WarMammoths', 'WyvernRiders'}


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def hsv(rgba):
    rgb = rgba[:, :, :3].astype(np.float32) / 255
    mx, mn = rgb.max(2), rgb.min(2); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dd = np.maximum(d, 1e-6)
    rc, gc, bc = (mx - r) / dd, (mx - g) / dd, (mx - b) / dd
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc)); h = np.where(d > 1e-6, (h / 6) % 1, 0)
    return h, s, mx


def components(mask):
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    out = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        out.append({'n': len(ys), 'box': (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())), 'lab': i})
    return lab, out


def weapon_mask(rgba, archer=False, scale=1.0, drop=(), add=(), R=6, P=3, grow=6):
    """masque des armes d'une figurine ; scale = taille de la figurine / 128 (zones à écarter en pixels de 128)"""
    H, W = rgba.shape[:2]
    a = rgba[:, :, 3] > 100
    h, s, v = hsv(rgba)
    steel = a & (s < 0.32) & (v > 0.42)
    warm = a & (h > 0.045) & (h < 0.17) & (s > 0.25) & (s < 0.75) & (v > 0.62)
    wood = a & (h > 0.03) & (h < 0.14) & (s > 0.3) & (v > 0.22) & (v < 0.75)
    Rs, Ps = max(3, round(R * scale)), max(2, round(P * scale))
    core = ndimage.binary_opening(a, structure=disk(Rs))
    lab, n = ndimage.label(core)
    if n:
        sizes = ndimage.sum(core, lab, range(1, n + 1)); core = lab == (1 + int(np.argmax(sizes)))
    body = ndimage.binary_dilation(core, structure=disk(Ps))
    cxs = np.nonzero(core.any(0))[0]; cx0, cx1 = (cxs.min(), cxs.max()) if len(cxs) else (0, W)
    metal = steel | warm
    cand = a & ~body & ((metal | wood) if archer else metal)
    lab, comps = components(cand)
    yy = np.arange(H)[:, None].repeat(W, 1)
    keep = np.zeros_like(a)
    for c in comps:
        m = lab == c['lab']
        if c['n'] < 8 * scale * scale: continue
        cy, top = yy[m].mean() / H, c['box'][1] / H
        mid = (c['box'][0] + c['box'][2]) / 2
        if cy > 0.78 and top > 0.6 and c['box'][0] >= cx0 - 4 * scale and c['box'][2] <= cx1 + 4 * scale: continue      # pieds, jambières, sabots (sous le corps)
        nm, nw = int((m & metal).sum()), int((m & wood & ~metal).sum())
        if nw > nm and cy > 0.72: continue                          # bottes de cuir des tireurs (le bois de l'arc est plus haut)
        # du métal (le bois n'est retenu que pour un tireur : son arc)
        if nm >= 6 * scale * scale or (archer and nw >= 25 * scale * scale): keep |= m
    out = keep.copy()
    for _ in range(max(2, round(grow * scale))):
        out = ndimage.binary_dilation(out, structure=np.ones((3, 3))) & metal
    out |= keep
    # zones ajoutées à la main : les grosses armes que l'ouverture confond avec le corps (épée massive, gourdin)
    for b in add:
        x0, y0, x1, y1 = [round(v * scale) for v in b]
        out[y0:y1, x0:x1] |= metal[y0:y1, x0:x1]
    # zones écartées à la main (cornes, ailes, queues…)
    if drop:
        lab, comps = components(out)
        for c in comps:
            x0, y0, x1, y1 = [v / scale for v in c['box']]
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if any(b[0] <= cx <= b[2] and b[1] <= cy <= b[3] for b in drop): out[lab == c['lab']] = False
    return out


def units_list():
    js = "const {loadEngine}=require('./tests/load');const E=loadEngine();const NO=new Set(['Catapult','SteamCannon','AirShip','BatteringRam','FloatingIsland']);const out=[];for(const r of Object.values(E.DATA.races))for(const t of r.units){const d=E.DATA.units[t];if(!d||d.race==='hero'||d.race==='fantastic')continue;if(!(d.melee>0||(d.ranged>0&&d.rangedType!=='magic')))continue;if(/Shaman|Priest|Magician|Warlock/.test(d.en||''))continue;if(d.sailing||d.abilities.siegeOnly||d.abilities.createOutpost||d.abilities.scout||NO.has(t))continue;if(out.some(o=>o.id===t))continue;out.push({id:t,archer:d.ranged>0&&d.rangedType!=='magic'});}console.log(JSON.stringify(out));"
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT))


def main():
    review = sys.argv[sys.argv.index('--review') + 1] if '--review' in sys.argv else None
    ov = json.load(open(os.path.join(ROOT, 'tools', 'weapon_overrides.json'))) if os.path.exists(os.path.join(ROOT, 'tools', 'weapon_overrides.json')) else {}
    hd = json.load(open(os.path.join(ROOT, 'assets', 'hd.json'))); hdimg = Image.open(os.path.join(ROOT, 'assets', 'hd.png')).convert('RGBA')
    anim = json.load(open(os.path.join(ROOT, 'assets', 'anim.json'))); animpages = {}
    animpage = lambda k: animpages.setdefault(k, Image.open(os.path.join(ROOT, 'assets', 'anim.png' if not k else 'anim%d.png' % k)).convert('RGBA'))
    units = [u for u in units_list() if u['id'] not in NO_WEAPON and not ov.get(u['id'], {}).get('none')]
    pieces = []          # (clé, image du masque, ox, oy)
    sheet, asheet = [], []
    for u in units:
        uid, o = u['id'], ov.get(u['id'], {})
        r = hd.get('unit:' + uid)
        if r:
            x, y, w, h = r[:4]
            rgba = np.asarray(hdimg.crop((x, y, x + w, y + h))).copy()
            m = weapon_mask(rgba, u['archer'], w / 128, o.get('drop', ()), o.get('add', ()))
            if m.any():
                ys, xs = np.nonzero(m); x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
                pieces.append((('s', 'unit:' + uid), m[y0:y1, x0:x1], int(x0), int(y0)))
            sheet.append((uid, rgba, m))
        meta = anim.get(uid)
        if meta:
            fw, fh = meta['w'], meta['h']
            for i, (fx, fy) in enumerate(meta['f']):
                rgba = np.asarray(animpage(meta.get('p', 0)).crop((fx, fy, fx + fw, fy + fh))).copy()
                m = weapon_mask(rgba, u['archer'], 1.0, o.get('animDrop', ()))
                if i >= 12: m[:] = False                         # mort : l'arme tombe, plus de lueur
                if m.any():
                    ys, xs = np.nonzero(m); x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
                    pieces.append((('a', uid, i), m[y0:y1, x0:x1], int(x0), int(y0)))
                else:
                    pieces.append((('a', uid, i), None, 0, 0))
                if review: asheet.append((uid + '#' + str(i), rgba, m))
    # atlas compact : rangées de hauteur variable
    WMAX, x, y, rowh, place = 1024, 0, 0, 0, []
    for key, m, ox, oy in sorted(pieces, key=lambda p: -(p[1].shape[0] if p[1] is not None else 0)):
        if m is None: place.append((key, None, ox, oy, 0, 0)); continue
        hh, ww = m.shape
        if x + ww + 1 > WMAX: x, y, rowh = 0, y + rowh + 1, 0
        place.append((key, m, ox, oy, x, y)); x += ww + 1; rowh = max(rowh, hh)
    atlas = np.zeros((y + rowh + 1, WMAX, 4), np.uint8)
    out = {'s': {}, 'a': {}}
    for key, m, ox, oy, ax, ay in place:
        if m is not None:
            hh, ww = m.shape
            atlas[ay:ay + hh, ax:ax + ww][m] = [255, 255, 255, 255]
            rect = [ax, ay, ww, hh, ox, oy]
        else: rect = None
        if key[0] == 's': out['s'][key[1]] = rect
        else: out['a'].setdefault(key[1], [None] * 16)[key[2]] = rect
    Image.fromarray(atlas).save(os.path.join(ROOT, 'assets', 'weapons.png'), optimize=True)
    json.dump(out, open(os.path.join(ROOT, 'assets', 'weapons.json'), 'w'), separators=(',', ':'))
    print('weapons.png', atlas.shape[1], 'x', atlas.shape[0], '·', len(out['s']), 'figurines,', len(out['a']), 'animations ·', os.path.getsize(os.path.join(ROOT, 'assets', 'weapons.png')) // 1024, 'Ko')
    if review:
        os.makedirs(review, exist_ok=True)
        S, per = 300, 8
        for p in range(0, len(sheet) + len(asheet), per):
            allp = sheet + asheet
            part = allp[p:p + per]
            img = Image.new('RGBA', (S * 4, S * 2 * ((len(part) + 3) // 4)), (60, 70, 60, 255))
            for i, (name, rgba, m) in enumerate(part):
                ovl = rgba.copy(); ovl[m] = [255, 40, 200, 255]
                for j, arr in enumerate((rgba, ovl)):
                    im = Image.fromarray(arr); sc = S / max(im.size); im = im.resize((round(im.width * sc), round(im.height * sc)), Image.NEAREST)
                    d = ImageDraw.Draw(im)
                    if j: 
                        for k in range(0, 129, 16): d.line([(k * S / 128, 0), (k * S / 128, S)], fill=(255, 255, 255, 50)); d.line([(0, k * S / 128), (S, k * S / 128)], fill=(255, 255, 255, 50))
                    d.text((3, 3), name, fill=(255, 255, 0, 255))
                    img.alpha_composite(im, ((i % 4) * S, ((i // 4) * 2 + j) * S))
            img.save(os.path.join(review, ('s' if p < len(sheet) else 'a') + '%02d.png' % (p // per)))


if __name__ == '__main__':
    main()
