#!/usr/bin/env python3
"""Figurine fixe du Bélier : la première image (repos) de sa planche d'animation N12, mise au format des figurines
(carré de 128, posée en bas, comme build_hd.fit_square). Sans planche : figurine provisoire tirée de la catapulte.
Sortie : assets/extra/ram.png (128 x 128)."""
import json, os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, 'art', 'incoming', 'anim', 'N12_anim_BatteringRam.png')
if os.path.exists(SHEET):
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import build_anim, build_hd
    first = build_anim.frames_of(SHEET)[0]['im']
    out = os.path.join(ROOT, 'assets', 'extra', 'ram.png')
    build_hd.fit_square(first, 128).save(out)
    print(out, '(planche N12)')
    sys.exit(0)
d = json.load(open(os.path.join(ROOT, 'assets', 'hd.json')))
r = d['unit:Catapult']
im = Image.open(os.path.join(ROOT, 'assets', 'hd.png')).convert('RGBA').crop((r[0], r[1], r[0] + r[2], r[1] + r[3]))
px = im.load()
W, H = im.size
# 1. le bras et son godet : tout ce qui dépasse au-dessus des montants
for y in range(H):
    for x in range(W):
        if y < 34 or (x > 84 and y < 54) or (x > 54 and x < 72 and y < 40): px[x, y] = (0, 0, 0, 0)
dr = ImageDraw.Draw(im)
OUT = (52, 30, 22, 255)
def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
# 2. le toit à deux pans, posé sur les montants : pan avant éclairé, pan arrière dans l'ombre
R0, R1 = (54, 22), (104, 30)            # faîtage
E0, E1 = (28, 48), (84, 58)             # avant-toit, côté lumière
B0, B1 = (66, 30), (118, 40)            # rive arrière
dr.polygon([R0, R1, B1, B0], fill=(96, 60, 30, 255), outline=OUT)
dr.polygon([R0, R1, E1, E0], fill=(156, 104, 54, 255), outline=OUT)
dr.polygon([R1, B1, (110, 50), E1], fill=(104, 66, 32, 255), outline=OUT)   # pignon
for i in range(1, 8):                    # planches, du faîtage à l'avant-toit
    t = i / 8
    dr.line([lerp(R0, R1, t), lerp(E0, E1, t)], fill=(118, 76, 38, 255), width=1)
for i in range(2, 6):                    # lumière en bandes, dégradée
    t = i / 7
    dr.line([lerp(lerp(R0, E0, t), lerp(R1, E1, t), 0.04), lerp(lerp(R0, E0, t), lerp(R1, E1, t), 0.96)], fill=(176, 122, 64, 255) if i < 4 else (140, 92, 46, 255), width=1)
dr.line([R0, R1], fill=(214, 160, 92, 255), width=2)
dr.line([E0, E1], fill=(80, 48, 24, 255), width=2)
# 3. le tronc ferré, suspendu sous le toit
dr.polygon([(16, 70), (22, 63), (104, 57), (106, 67), (22, 77)], fill=(146, 100, 52, 255), outline=OUT)
dr.line([(22, 64), (104, 58)], fill=(212, 162, 96, 255), width=2)
dr.line([(22, 75), (105, 66)], fill=(96, 62, 30, 255), width=2)
for x in (38, 58, 78, 96):
    y = 63 - (x - 22) * 0.075
    dr.line([(x, y), (x, y + 10)], fill=(90, 92, 100, 255), width=2)          # cercles de fer
for x in (46, 84):
    y = 57 - (x - 22) * 0.06
    dr.line([(x, y - 3), (x, y + 4)], fill=(206, 186, 146, 255), width=1)     # cordes
# tête de fer en bec
dr.polygon([(100, 55), (114, 53), (126, 61), (114, 70), (100, 69)], fill=(122, 128, 140, 255), outline=(44, 46, 54, 255))
dr.line([(102, 57), (114, 55), (123, 61)], fill=(204, 212, 222, 255), width=1)
dr.line([(102, 67), (114, 68), (123, 62)], fill=(78, 82, 92, 255), width=1)
dr.point([(106, 62), (111, 62)], fill=(52, 56, 64, 255))
out = os.path.join(ROOT, 'assets', 'extra', 'ram.png')
im.save(out)
big = im.resize((384, 384), Image.NEAREST); bg = Image.new('RGBA', big.size, (60, 90, 50, 255)); bg.alpha_composite(big)
bg.save(os.path.join(ROOT, 'art', 'ram_preview.png'))
print(out)
