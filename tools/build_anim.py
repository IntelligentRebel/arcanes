#!/usr/bin/env python3
"""Animations des unités : découpe les planches de 16 images (4 rangées : repos, marche, attaque, mort ; 4 images chacune)
générées par ChatGPT et les assemble dans assets/anim.png + assets/anim.json.

Entrées : art/incoming/anim/N??_anim_<Unité>.png, ou N??_anim_<UnitéA>+<UnitéB>.png pour une planche de deux unités
(4 colonnes, 8 rangées : les 4 premières pour la première unité, les 4 suivantes pour la seconde)
Chaque image est mise à la même échelle que la figurine fixe de l'unité (même hauteur de référence que build_hd),
puis calée par les pieds : le milieu des pieds au centre bas d'un cadre commun à toute la planche.
Sorties : assets/anim.png (+ anim1.png, ... : pages de 8192 px), assets/anim.json {unité: {w, h, f: [[x, y], ... 16], p?: page}}, art/anim_preview/<Unité>.gif (contrôle).
"""
import json, os, re, sys
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_hd as B

SRC = os.path.join(B.ROOT, 'art', 'incoming', 'anim')
PREV = os.path.join(B.ROOT, 'art', 'anim_preview')
BASE = 128          # côté de la figurine fixe dans l'atlas HD
FILL = 0.96         # même remplissage que fit_square pour les unités
FOOT = 3            # marge sous les pieds (px du cadre), comme fit_square (2 % de 128)
ACTIONS = ['idle', 'walk', 'attack', 'death']
# planches dessinées tournées vers la droite (l'attaque part à droite) : on les retourne pour que toutes les unités
# regardent à gauche par défaut, comme le suppose l'affichage (le camp attaquant est retourné en combat)
MIRROR = {'HighMenSpearmen', 'HighMenPikemen', 'HighMenMagician', 'HeroBShan'}   # Kessim (N81) : dessiné tourné à droite, comme sa figurine
# unités à deux figures (colon + mule) : le calage par les pieds du plus gros élément saute quand l'un tombe ;
# on cale alors sur le bord droit de la silhouette (la croupe de la mule, qui reste debout)
ANCHOR_RIGHT = {'HighMenSettlers', 'NomadSettlers', 'OrcSettlers', 'BarbarianSettlers', 'BeastmenSettlers', 'DarkElfSettlers', 'DraconianSettlers', 'GnollSettlers'}
# images fautives remplacées par une autre de la même unité (index 0-15 : repos 0-3, marche 4-7, attaque 8-11, mort 12-15)
# DraconianSwordsmen : les deux premières images de sa mort tiennent une lance au lieu de l'épée ; il tombe depuis sa garde
FIXES = {'DraconianSwordsmen': {12: 11, 13: 14}}
# images où un éclat détaché (la flèche en vol de l'image voisine) s'est rattaché à la mauvaise figure : on ne garde que la figure
SOLO = {'DraconianBowmen': {9}, 'HeroBShan': {10}}   # Kessim : la flèche détachée, dessinée avant le retournement


def solo(x):
    a = np.asarray(x['im'])[:, :, 3] > 8
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=3))
    if n <= 1:
        return x
    big = 1 + int(np.argmax(ndimage.sum(a, lab, range(1, n + 1))))
    arr = np.asarray(x['im']).copy(); arr[lab != big, 3] = 0
    ys, xs = np.nonzero(arr[:, :, 3] > 8)
    x0 = xs.min()
    return {'im': Image.fromarray(arr[ys.min():ys.max() + 1, x0:xs.max() + 1], 'RGBA'), 'foot_x': x['foot_x'] - x0}


def grid_frames(rgba, cols, rows):
    """Repli quand deux images se touchent ou qu'une image n'est faite que d'étincelles : découpe selon la grille.
    Les coupures passent par la ligne la plus vide près de la position attendue ; une composante tenant pour l'essentiel
    dans une case y va tout entière (une lame qui dépasse reste à sa figure), une composante à cheval est tranchée à la coupure."""
    al = B.clean_alpha(rgba[:, :, 3]); mask = al > 60
    H, W = mask.shape
    def cuts(prof, n, size):
        out = [0]
        for i in range(1, n):
            e = round(i * size / n); w = max(4, size // (n * 4))
            lo, hi = max(1, e - w), min(size - 1, e + w)
            out.append(lo + int(np.argmin(prof[lo:hi])))
        return out + [size]
    ys, xs = cuts(mask.sum(1), rows, H), cuts(mask.sum(0), cols, W)
    cell = np.zeros((H, W), np.int32)
    for r in range(rows):
        for c in range(cols):
            cell[ys[r]:ys[r + 1], xs[c]:xs[c + 1]] = r * cols + c
    lab, n = ndimage.label(al > 8)
    own = cell.copy()
    for i, sl in enumerate(ndimage.find_objects(lab)):
        m = lab[sl] == i + 1
        ids, cnt = np.unique(cell[sl][m], return_counts=True)
        if cnt.max() >= 0.85 * cnt.sum():
            own[sl][m] = ids[np.argmax(cnt)]
    out = []
    for k in range(rows * cols):
        a = np.where(own == k, al, 0).astype(np.uint8)
        yy, xx = np.nonzero(a > 8)
        if not len(yy):
            return []
        ty0, ty1, tx0, tx1 = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
        sub = rgba[ty0:ty1, tx0:tx1].copy(); sub[:, :, 3] = a[ty0:ty1, tx0:tx1]
        im = Image.fromarray(sub, 'RGBA')
        body = a[ty0:ty1, tx0:tx1] > 60
        bl, bn = ndimage.label(body)
        if bn:
            big = 1 + int(np.argmax(ndimage.sum(body, bl, range(1, bn + 1))))
            bys, bxs = np.nonzero(bl == big)
        else:
            bys, bxs = np.nonzero(a[ty0:ty1, tx0:tx1] > 8)
        h = bys.max() - bys.min() + 1
        low = bys >= bys.max() - max(2, h // 10)
        out.append({'im': im, 'foot_x': float(bxs[low].mean())})
    return out


def raw_frames(path, n, rows):
    """Les n images de la planche dans l'ordre de lecture (rangée par rangée, de gauche à droite), avec le milieu des pieds."""
    img = Image.open(path).convert('RGBA')
    rgba = np.asarray(img).copy()
    # lot 7 (Codex, N39 et suivantes) : grille régulière, cases séparées par du vide (contrôlé par tools/codex_cut.py) ;
    # la grille d'abord, car un colon qui tombe loin de sa mule fait deux silhouettes et l'appariement par composantes se trompe
    num = re.match(r'^N(\d+)_', os.path.basename(path))
    if num and int(num.group(1)) >= 39:
        g = grid_frames(rgba, n // rows, rows)
        if len(g) == n: return g
    comps, lab, al = B.components(rgba, n, rows)
    if len(comps) != n:
        g = grid_frames(rgba, n // rows, rows)
        if len(g) == n:
            print(f'  (découpe par la grille : {len(comps)} figures séparées au lieu de {n})')
            return g
    out = []
    for c in comps:
        y0, y1, x0, x1 = c['y0'], c['y1'], c['x0'], c['x1']
        keep = np.isin(lab[y0:y1, x0:x1], c['ids'])
        a = al[y0:y1, x0:x1].copy(); a[~keep] = 0
        ys, xs = np.nonzero(a > 8)
        sub = rgba[y0:y1, x0:x1].copy(); sub[:, :, 3] = a
        ty0, ty1, tx0, tx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        im = Image.fromarray(sub[ty0:ty1, tx0:tx1], 'RGBA')
        # pieds : milieu des pixels opaques du corps (plus grande composante) dans le dixième inférieur de sa hauteur
        body_id = max(c['ids'], key=lambda i: int((lab[y0:y1, x0:x1] == i).sum()))
        body = (lab[y0:y1, x0:x1] == body_id) & (a > 60)
        bys, bxs = np.nonzero(body)
        h = bys.max() - bys.min() + 1
        low = bys >= bys.max() - max(2, h // 10)
        out.append({'im': im, 'foot_x': float(bxs[low].mean() - tx0)})
    return out


def finish(out, mirror=False, right=False):
    """Retournement (planche dessinée vers la droite) et calage sur le bord droit (unités à deux figures)."""
    if mirror:
        for x in out:
            x['im'] = x['im'].transpose(Image.FLIP_LEFT_RIGHT); x['foot_x'] = x['im'].width - x['foot_x']
    if right:
        # point d'ancrage à distance fixe du bord droit : la moitié de la largeur moyenne des images de repos
        half = sum(x['im'].width for x in out[:4]) / 8
        for x in out:
            x['foot_x'] = x['im'].width - half
    return out


def frames_of(path, uids):
    """Une liste de 16 images par unité de la planche (une unité : 4 rangées ; deux : 8 rangées, la première unité en haut)."""
    fr = raw_frames(path, 16 * len(uids), 4 * len(uids))
    return [finish(fr[16 * i:16 * (i + 1)], u in MIRROR, u in ANCHOR_RIGHT) if len(fr) == 16 * len(uids) else fr for i, u in enumerate(uids)]


def main():
    os.makedirs(PREV, exist_ok=True)
    sheets = {}
    for f in sorted(os.listdir(SRC)) if os.path.isdir(SRC) else []:
        m = re.match(r'^N\d{2,3}_anim_([\w+]+)\.png$', f)
        if not m:
            continue
        uids = m.group(1).split('+')
        per = frames_of(os.path.join(SRC, f), uids)
        if any(len(fr) != 16 for fr in per):
            print(f'  ! {f} : {len(per[0])} images au lieu de {16 * len(uids)}'); continue
        for uid, fr in zip(uids, per):
            build_unit(sheets, uid, fr)
    finish_atlas(sheets)


def build_unit(sheets, uid, fr):
    if uid in FIXES:
        fr = [fr[FIXES[uid].get(i, i)] for i in range(16)]
    if uid in SOLO:
        fr = [solo(x) if i in SOLO[uid] else x for i, x in enumerate(fr)]
    # échelle commune : la première image (repos) a la taille de la figurine fixe
    s = BASE * FILL / max(fr[0]['im'].size)
    half = max(max(x['foot_x'], x['im'].width - x['foot_x']) for x in fr) * s
    W = int(np.ceil(half)) * 2 + 2
    H = int(np.ceil(max(x['im'].height for x in fr) * s)) + FOOT + 1
    cells = []
    for x in fr:
        nw, nh = max(1, round(x['im'].width * s)), max(1, round(x['im'].height * s))
        small = x['im'].resize((nw, nh), Image.LANCZOS)
        cv = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        cv.alpha_composite(small, (round(W / 2 - x['foot_x'] * s), H - FOOT - nh))
        cells.append(cv)
    sheets[uid] = cells
    # aperçu animé pour contrôle (fond gris, 4 animations côte à côte)
    gif = []
    for k in range(8):
        fr_img = Image.new('RGB', (W * 4, H), (70, 74, 88))
        for a in range(4):
            fr_img.paste(cells[a * 4 + (k % 4)], (a * W, 0), cells[a * 4 + (k % 4)])
        gif.append(fr_img.resize((W * 8, H * 2), Image.NEAREST))
    gif[0].save(os.path.join(PREV, uid + '.gif'), save_all=True, append_images=gif[1:], duration=160, loop=0)
    print(f'  {uid} : cadre {W}x{H}, échelle {s:.3f}')


def finish_atlas(sheets):
    if not sheets:
        print('aucune planche d\'animation'); return
    # atlas : chaque unité en bloc de 4 x 4 images, blocs rangés en étagères sur 4096 px de large (sans le vide d'une
    # rangée de 16 calée sur l'unité la plus large : l'image décodée pèse en mémoire ce qu'elle mesure).
    # Pages de 8192 px de haut au plus (anim.png, anim1.png, ...) : une image plus haute que 16384 px dépasse la taille de
    # texture de bien des cartes graphiques ; meta[unité].p = page (absent pour la première)
    WMAX, HMAX = 4096, 8192
    blocks = sorted(sheets.items(), key=lambda kv: -kv[1][0].height)
    pos, x, y, shelf, page, heights = {}, 0, 0, 0, 0, []
    for uid, cells in blocks:
        w, h = cells[0].size
        if x + 4 * w > WMAX:
            x, y, shelf = 0, y + shelf, 0
        if y + 4 * h > HMAX:
            heights.append(y); page += 1; x, y, shelf = 0, 0, 0
        pos[uid] = (x, y, page); x += 4 * w; shelf = max(shelf, 4 * h)
    heights.append(y + shelf)
    pages = [Image.new('RGBA', (WMAX, hh), (0, 0, 0, 0)) for hh in heights]
    meta = {}
    for uid, cells in sheets.items():
        w, h = cells[0].size; bx, by, pg = pos[uid]
        meta[uid] = {'w': w, 'h': h, 'f': [[bx + (i % 4) * w, by + (i // 4) * h] for i in range(16)]}
        if pg: meta[uid]['p'] = pg
        for i, cv in enumerate(cells):
            pages[pg].paste(cv, tuple(meta[uid]['f'][i]))
    names = ['anim.png'] + [f'anim{k}.png' for k in range(1, len(pages))]
    for f in os.listdir(os.path.join(B.ROOT, 'assets')):
        if re.match(r'^anim\d+\.png$', f) and f not in names: os.remove(os.path.join(B.ROOT, 'assets', f))
    for im, n in zip(pages, names): im.save(os.path.join(B.ROOT, 'assets', n), optimize=True)
    with open(os.path.join(B.ROOT, 'assets', 'anim.json'), 'w') as fh:
        json.dump(meta, fh, separators=(',', ':'))
    print(f'{len(sheets)} unités animées, {len(pages)} page(s) {"+".join(str(hh) for hh in heights)} px, '
          f'{sum(os.path.getsize(os.path.join(B.ROOT, "assets", n)) for n in names) // 1024} Ko')


if __name__ == '__main__':
    main()
