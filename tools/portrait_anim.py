#!/usr/bin/env python3
"""Portraits animés des sorciers : à partir de deux retouches du portrait par ChatGPT (yeux fermés, magie à son comble),
fabrique deux calques posés sur le portrait du jeu : les paupières (clignement) et la magie (pulsation lente).

Entrées : art/portrait_anim/<id>_blink.png et <id>_glow.png (retouches 1024 px ou plus du portrait de référence).
Chaque retouche est recalée sur le portrait 160 px de l'atlas (art/hd/wizard_<n>.png) par une similitude (ECC),
puis on ne garde que ce qui a changé : un masque tiré de l'écart, adouci, sur la seule zone utile.
Sorties : assets/portraits.png (calques RGBA 160 px, 2 par sorcier) + assets/portraits.json {id: {blink: [x, y], glow: [x, y]}},
art/portrait_anim/preview_<id>.gif (contrôle), art/portrait_anim/masks.png (planche des masques).
  python3 tools/portrait_anim.py [id ...]"""
import json, os, sys
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'portrait_anim')
IDS = ['aldoran', 'isvaran', 'malivra', 'tsevan', 'azhemir', 'thalgren', 'vorgath', 'zirrakh', 'brakkon', 'sylvaine', 'solenkh', 'celestine', 'itzanor', 'nerissa']
S = 160
# réglages par sorcier si l'automatique se trompe : zone des yeux imposée (x0, y0, x1, y1 en px du portrait 160)
EYES = {}


def load_base(n):
    return np.asarray(Image.open(os.path.join(ROOT, 'art', 'hd', 'wizard_%d.png' % n)).convert('RGB')).astype(np.float32) / 255


def register(base, edit):
    """recale la retouche (déjà ramenée à 160) sur le portrait : similitude par ECC sur les niveaux de gris flous"""
    g0 = cv2.GaussianBlur(cv2.cvtColor(base, cv2.COLOR_RGB2GRAY), (0, 0), 1.2)
    g1 = cv2.GaussianBlur(cv2.cvtColor(edit, cv2.COLOR_RGB2GRAY), (0, 0), 1.2)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(g0, g1, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
    except cv2.error:
        pass
    out = cv2.warpAffine(edit, warp, (S, S), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    return out, warp


def change_mask(base, ed, thr, blur, keep, dil):
    d = np.abs(ed - base).max(axis=2)
    d = cv2.GaussianBlur(d, (0, 0), blur)
    m = (d > thr).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 1:
        order = np.argsort(-st[1:, cv2.CC_STAT_AREA])[:keep] + 1
        m = np.isin(lab, order).astype(np.uint8)
    m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=dil)
    return np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 2.0) * 1.15, 0, 1)


def eye_mask(base, ed):
    """les paupières : la plus forte différence de l'image, et ce qui change sur la même ligne autour (l'autre œil)"""
    d = cv2.GaussianBlur(np.abs(ed - base).max(axis=2), (0, 0), 1.2)
    y0, x0 = np.unravel_index(np.argmax(d), d.shape)
    yy, xx = np.mgrid[0:S, 0:S]
    near = (np.abs(yy - y0) <= 9) & (np.abs(xx - x0) <= 32)
    m = ((d > 0.28 * d.max()) & near).astype(np.uint8)
    m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=2)
    m = np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.6) * 1.3, 0, 1)
    ys, xs = np.nonzero(m > 0.5)
    return m, (float(xs.mean()), float(ys.mean())) if len(xs) else (float(x0), float(y0))


EYE_GLOW = {'azhemir', 'vorgath'}   # leur magie passe aussi par les yeux


def build(wid):
    n = IDS.index(wid)
    base = load_base(n)
    eds = {}
    for kind in ('blink', 'glow'):
        f = os.path.join(SRC, '%s_%s.png' % (wid, kind))
        if not os.path.exists(f): return None
        ed = np.asarray(Image.open(f).convert('RGB').resize((S, S), Image.LANCZOS)).astype(np.float32) / 255
        eds[kind], _ = register(base, ed)
    em, (cx, cy) = eye_mask(base, eds['blink'])
    gm = change_mask(base, eds['glow'], 0.06, 3.0, 4, 3)
    # le visage ne bouge pas avec la magie : une ellipse adoucie autour des yeux est retirée du calque
    yy, xx = np.mgrid[0:S, 0:S]
    face = np.clip(1.6 - np.sqrt(((xx - cx) / 30) ** 2 + ((yy - cy - 6) / 26) ** 2), 0, 1)
    gm = gm * (1 - face)
    if wid in EYE_GLOW:
        gm = np.maximum(gm, cv2.dilate(em, np.ones((3, 3), np.uint8)) * change_mask(base, eds['glow'], 0.05, 1.0, 6, 1))
    return base, {'blink': (eds['blink'], em), 'glow': (eds['glow'], gm)}


def main():
    ids = sys.argv[1:] or IDS
    out = os.path.join(ROOT, 'assets', 'portraits.png'); js = os.path.join(ROOT, 'assets', 'portraits.json')
    man = json.load(open(js)) if os.path.exists(js) else {}
    sheet = Image.open(out).convert('RGBA') if os.path.exists(out) else Image.new('RGBA', (S * 2, S * len(IDS)), (0, 0, 0, 0))
    masks = []
    for wid in ids:
        r = build(wid)
        if not r: print(wid, ': retouches manquantes'); continue
        base, layers = r
        row = IDS.index(wid)
        man[wid] = {}
        frames = []
        for col, kind in enumerate(('blink', 'glow')):
            ed, m = layers[kind]
            rgba = np.dstack([ed * (m[..., None] > 0.004), m])   # rien sous l'alpha nul : le PNG en est plus léger
            im = Image.fromarray((rgba * 255 + .5).astype(np.uint8), 'RGBA')
            sheet.paste(im, (col * S, row * S))
            man[wid][kind] = [col * S, row * S]
            masks.append(Image.fromarray((m * 255).astype(np.uint8)).convert('RGB'))
        # aperçu : base, magie qui monte, clignement
        def comp(a_glow, a_blink):
            ed, m = layers['glow']; c = base * (1 - m[..., None] * a_glow) + ed * m[..., None] * a_glow
            ed, m = layers['blink']; c = c * (1 - m[..., None] * a_blink) + ed * m[..., None] * a_blink
            return Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8)).resize((320, 320), Image.LANCZOS)
        seq = [comp(0.5 - 0.5 * np.cos(t / 24 * 2 * np.pi), 1 if t in (14, 15) else 0.5 if t in (13, 16) else 0) for t in range(48)]
        seq[0].save(os.path.join(SRC, 'preview_%s.gif' % wid), save_all=True, append_images=seq[1:], duration=90, loop=0)
        print(wid, 'ok', ' '.join('%s %.0f%%' % (k, layers[k][1].mean() * 100) for k in layers))
    sheet.save(out, optimize=True)
    json.dump(man, open(js, 'w'), indent=0)
    if masks:
        W = Image.new('RGB', (S * len(masks), S)); [W.paste(m, (i * S, 0)) for i, m in enumerate(masks)]; W.save(os.path.join(SRC, 'masks.png'))


if __name__ == '__main__':
    main()
