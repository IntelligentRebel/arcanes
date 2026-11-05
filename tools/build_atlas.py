#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_atlas.py - Atlas graphique d'Arcanes.

Construit assets/atlas.png + atlas.json (sprites 32x32), une planche de controle
(contact-sheet.png) et credits.txt, a partir des tuiles CC0 de Dungeon Crawl Stone
Soup (depot github.com/crawl/tiles, lot "releases/Nov-2015" UNIQUEMENT).

Usage :
    python3 tools/build_atlas.py [--src DIR] [--units unit.go] [--spellbook spellbook.txt] [--out DIR]

Le script est deterministe : memes sources -> memes sorties.
Il verifie que chaque unite de unit.go et chaque sort du grimoire a un sprite.
"""
import argparse
import colorsys
import hashlib
import json
import os
import re
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SCRATCH = '/tmp/claude-0/-home-claude/8f18b999-80b5-5aa0-894b-c23c246e8288/scratchpad'
DEF_SRC = os.path.join(SCRATCH, 'src/dctiles/releases/Nov-2015')
DEF_UNITS = os.path.join(SCRATCH, 'src/kazz/game/magic/units/unit.go')
DEF_SPELLBOOK = os.path.join(SCRATCH, 'spellbook.txt')
DEF_OUT = os.path.normpath(os.path.join(HERE, '..', 'assets'))

SRC = DEF_SRC
USED = set()          # fichiers source effectivement utilises (pour credits.txt)
_CACHE = {}

# =============================================================================
# Outils image
# =============================================================================

def L(rel):
    """Charge une tuile DCSS (chemin relatif au lot Nov-2015), en RGBA."""
    if not rel.endswith('.png'):
        rel += '.png'
    if rel not in _CACHE:
        path = os.path.join(SRC, rel)
        if not os.path.isfile(path):
            raise FileNotFoundError(rel)
        _CACHE[rel] = Image.open(path).convert('RGBA')
    USED.add(rel)
    return _CACHE[rel].copy()


def blank(w=32, h=32):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def as_img(x):
    return L(x) if isinstance(x, str) else x


def over(dst, src, dx=0, dy=0):
    """Composite alpha de src sur dst (en place) avec decalage."""
    tmp = blank(dst.width, dst.height)
    tmp.paste(src, (dx, dy))          # copie brute (pas de masque : l'alpha serait multiplie)
    dst.alpha_composite(tmp)
    return dst


def comp(*layers):
    """Superpose des calques 32x32 ; un calque peut etre (img, dx, dy)."""
    out = blank()
    for l in layers:
        if l is None:
            continue
        if isinstance(l, tuple):
            over(out, as_img(l[0]), l[1], l[2])
        else:
            over(out, as_img(l))
    return out


def mapcolors(img, fn):
    img = img.copy()
    p = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = p[x, y]
            if a:
                p[x, y] = tuple(fn(r, g, b)) + (a,)
    return img


def ramp(img, stops, only=None, keep_black=True):
    """Remappe la luminance sur une rampe de couleurs (recoloration).
    Les pixels quasi noirs (contours, ombres) sont conserves par defaut."""
    def f(r, g, b):
        if keep_black and max(r, g, b) < 14:
            return (r, g, b)
        if only and not only(r, g, b):
            return (r, g, b)
        l = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        for i in range(len(stops) - 1):
            l0, c0 = stops[i]
            l1, c1 = stops[i + 1]
            if l <= l1 or i == len(stops) - 2:
                t = 0 if l1 == l0 else max(0.0, min(1.0, (l - l0) / (l1 - l0)))
                return tuple(int(c0[k] + (c1[k] - c0[k]) * t) for k in range(3))
    return mapcolors(img, f)


def hue(img, deg, sat=1.0, val=1.0):
    def f(r, g, b):
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < 0.08:
            return (r, g, b)
        h = (h + deg / 360.0) % 1.0
        return tuple(int(c * 255) for c in colorsys.hsv_to_rgb(h, min(1, s * sat), min(1, v * val)))
    return mapcolors(img, f)


def bright(img, f, sat=1.0):
    a = img.getchannel('A')
    rgb = ImageEnhance.Brightness(img.convert('RGB')).enhance(f)
    rgb = ImageEnhance.Color(rgb).enhance(sat)
    o = rgb.convert('RGBA')
    o.putalpha(a)
    return o


def is_skin(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return h <= 0.12 and 0.15 < s < 0.75 and v > 0.35


def not_gray(r, g, b):
    return not (abs(r - g) < 14 and abs(g - b) < 14)


def bbox(img):
    return img.getchannel('A').getbbox()


def outline(img, col=(0, 0, 0, 255)):
    a = img.getchannel('A').load()
    out = img.copy()
    p = out.load()
    for y in range(img.height):
        for x in range(img.width):
            if a[x, y] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < img.width and 0 <= Y < img.height and a[X, Y] > 0:
                        p[x, y] = col
                        break
    return out


def flip(img):
    return img.transpose(Image.FLIP_LEFT_RIGHT)


def top(img, rows=21):
    o = blank()
    o.paste(img.crop((0, 0, 32, rows)), (0, 0))
    return o


def crop32(img, y0=0):
    return img.crop((0, y0, 32, y0 + 32))


def squash(img, rows):
    """Supprime des lignes (personnages plus petits : nains, halfelins)."""
    keep = [y for y in range(img.height) if y not in rows]
    out = blank(img.width, img.height)
    off = img.height - len(keep)
    for i, y in enumerate(keep):
        out.paste(img.crop((0, y, img.width, y + 1)), (0, i + off))
    return out


def scale_int(img, k):
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


def center(img, scale=None):
    """Recentre le contenu d'une tuile ; agrandit x2 les petites icones."""
    bb = bbox(img)
    c = img.crop(bb)
    if scale is None:
        scale = 2 if max(c.size) <= 13 else 1
    if scale > 1:
        c = scale_int(c, scale)
    out = blank()
    out.paste(c, ((32 - c.width) // 2, (32 - c.height) // 2))
    return out


def px(im, pts, c):
    p = im.load()
    c = c if len(c) == 4 else tuple(c) + (255,)
    for x, y in pts:
        if 0 <= x < im.width and 0 <= y < im.height:
            p[x, y] = c


def hline(im, x0, x1, y, c):
    px(im, [(x, y) for x in range(x0, x1 + 1)], c)


def vline(im, x, y0, y1, c):
    px(im, [(x, y) for y in range(y0, y1 + 1)], c)


# Rampes de couleurs
TAN = [(0, (30, 15, 5)), (0.35, (95, 55, 30)), (0.6, (150, 95, 55)), (0.85, (195, 140, 95)), (1, (230, 190, 150))]
DARKSKIN = [(0, (15, 8, 3)), (0.35, (60, 35, 20)), (0.6, (105, 65, 40)), (0.85, (150, 100, 70)), (1, (195, 150, 115))]
PALE = [(0, (40, 20, 15)), (0.35, (150, 90, 70)), (0.6, (225, 160, 130)), (0.85, (245, 200, 180)), (1, (255, 235, 220))]
GREEN = [(0, (10, 25, 5)), (0.35, (50, 90, 30)), (0.6, (95, 140, 60)), (0.85, (150, 185, 100)), (1, (200, 220, 160))]
GNOLL = [(0, (25, 15, 0)), (0.3, (95, 65, 20)), (0.55, (165, 125, 50)), (0.8, (210, 175, 90)), (1, (240, 220, 150))]
WHITE = [(0, (60, 60, 70)), (0.3, (150, 150, 160)), (0.6, (215, 215, 222)), (1, (255, 255, 255))]
BLACK = [(0, (5, 5, 8)), (0.4, (30, 28, 35)), (0.7, (60, 55, 70)), (1, (110, 100, 120))]
BROWN_HEAD = [(0, (20, 10, 0)), (0.3, (70, 40, 15)), (0.6, (120, 75, 35)), (1, (190, 140, 80))]
LIGHT_HEAD = [(0, (40, 25, 10)), (0.3, (110, 75, 40)), (0.6, (165, 120, 70)), (1, (225, 185, 130))]
GREY_HEAD = [(0, (35, 35, 38)), (0.3, (90, 90, 95)), (0.6, (145, 145, 150)), (1, (210, 210, 215))]
BLUE_SKIN = [(0, (5, 10, 40)), (0.35, (30, 60, 150)), (0.6, (70, 120, 210)), (0.85, (130, 180, 240)), (1, (200, 230, 255))]
GOLD = [(0, (60, 40, 0)), (0.4, (200, 160, 60)), (0.7, (250, 230, 150)), (1, (255, 255, 230))]
BRONZE = [(0, (30, 15, 5)), (0.35, (110, 65, 25)), (0.65, (190, 130, 60)), (1, (255, 220, 150))]
MAMMOTH = [(0, (20, 8, 2)), (0.3, (80, 40, 15)), (0.6, (140, 80, 35)), (1, (210, 160, 100))]
WERE = [(0, (15, 12, 10)), (0.3, (60, 50, 45)), (0.6, (110, 100, 90)), (1, (190, 180, 170))]
ZOMBIE = [(0, (15, 20, 10)), (0.35, (70, 85, 55)), (0.6, (115, 130, 90)), (0.85, (150, 160, 120)), (1, (190, 195, 160))]
GHOST = [(0, (20, 40, 80)), (0.4, (90, 150, 220)), (0.7, (170, 215, 255)), (1, (235, 250, 255))]
FIRE = [(0, (40, 0, 0)), (0.3, (150, 20, 10)), (0.6, (230, 90, 20)), (0.85, (255, 190, 60)), (1, (255, 250, 200))]
SNOW = [(0, (120, 135, 160)), (0.3, (185, 200, 220)), (0.6, (225, 233, 245)), (1, (250, 252, 255))]
ROCK = [(0, (30, 28, 26)), (0.3, (80, 76, 72)), (0.55, (130, 124, 116)), (0.8, (175, 170, 160)), (1, (215, 210, 200))]
SWAMP = [(0, (12, 20, 8)), (0.12, (40, 55, 25)), (0.25, (70, 85, 40)), (0.45, (110, 115, 60)), (1, (170, 170, 110))]
DARKPURPLE = [(0, (5, 0, 10)), (0.4, (40, 10, 60)), (0.7, (90, 40, 120)), (1, (170, 120, 200))]
BEETLE = [(0, (15, 8, 0)), (0.35, (75, 45, 10)), (0.65, (140, 95, 30)), (1, (220, 180, 90))]

# =============================================================================
# Catalogue
# =============================================================================
CAT = {}        # cle -> dict(img, src, approx)
ORDER = []
ALIASES = {}    # cle alias -> cle cible


def add(key, img, src='', approx=None):
    if key in CAT:
        raise KeyError('cle en double : ' + key)
    img = as_img(img)
    if img.size != (32, 32):
        raise ValueError('%s : taille %s' % (key, img.size))
    CAT[key] = dict(img=img, src=src, approx=approx)
    ORDER.append(key)


# =============================================================================
# Paperdolls
# =============================================================================
P = 'player/'
DOLL_ORDER = ['cloak', 'wing', 'base', 'boots', 'legs', 'body', 'gloves', 'hair', 'beard', 'helm', 'hand1', 'hand2', 'extra']
DOLL_DIRS = dict(cloak='cloak', wing='drcwing', boots='boots', legs='legs', body='body', gloves='gloves',
                 hair='hair', beard='beard', helm='head', hand1='hand1', hand2='hand2', extra='')


ROOTS = ('player/', 'mon/', 'UNUSED/', 'item/', 'effect/', 'dngn/', 'gui/')


def part_path(slot, v):
    if v.startswith(ROOTS):
        return v
    return P + DOLL_DIRS[slot] + '/' + v


def doll(base, **parts):
    out = blank()
    b = as_img(base if not isinstance(base, str) or '/' in base else P + 'base/' + base)
    for k in DOLL_ORDER:
        if k == 'base':
            over(out, b)
            continue
        v = parts.get(k)
        if v is None:
            continue
        for vv in (v if isinstance(v, list) else [v]):
            if isinstance(vv, tuple):
                over(out, as_img(vv[0]), vv[1], vv[2])
            else:
                over(out, vv if not isinstance(vv, str) else L(part_path(k, vv)))
    return out


def draw_sack():
    im = blank()
    d = ImageDraw.Draw(im)
    d.ellipse([20, 16, 29, 27], fill=(140, 105, 60, 255))
    d.ellipse([21, 17, 26, 23], fill=(175, 140, 90, 255))
    px(im, [(27, 22), (27, 23), (26, 25), (27, 24), (28, 21)], (100, 72, 40))
    d.rectangle([23, 13, 26, 16], fill=(150, 115, 70, 255))
    hline(im, 22, 27, 15, (90, 60, 30))
    px(im, [(24, 13), (25, 13)], (185, 150, 100))
    return outline(im)


SACK = None


def race_base(race):
    if race == 'highmen':
        return L(P + 'base/human_m')
    if race == 'nomad':
        return ramp(L(P + 'base/human_m'), TAN, only=is_skin)
    if race == 'barbarian':
        return ramp(L(P + 'base/human_m'), PALE, only=is_skin)
    if race == 'orc':
        return ramp(L(P + 'base/human_m'), GREEN, only=is_skin)
    if race == 'gnoll':
        return ramp(L(P + 'base/kobold_m'), GNOLL)
    if race == 'highelf':
        return L(P + 'base/elf_m')
    if race == 'darkelf':
        return L(P + 'base/deep_elf_m')
    if race == 'dwarf':
        return L(P + 'base/dwarf_m')
    if race == 'halfling':
        return L(P + 'base/halfling_m')
    if race == 'beastmen':
        return L(P + 'base/minotaur_brown1_m')
    if race == 'klackon':
        return L(P + 'base/formicid')
    if race == 'draconian':
        return L(P + 'base/draconian_red_m')
    if race == 'lizardman':
        return L(P + 'base/draconian_green_m')
    raise KeyError(race)


SQUASH = {'dwarf': [21, 23, 25], 'halfling': [9, 11, 13, 21, 23, 25]}


def RU(race, sack=False, **parts):
    """Unite de race en paperdoll."""
    if race == 'draconian':
        parts.setdefault('wing', 'drcwing_red')
    img = doll(race_base(race), **parts)
    if sack:
        img = comp(img, SACK)
    if race in SQUASH:
        img = squash(img, SQUASH[race])
    return img


def horse(color):
    src = {'darkbrown': 'centaur_darkbrown_m', 'brown': 'centaur_brown_m', 'lightbrown': 'centaur_lightbrown_m',
           'grey': 'centaur_lightgrey_m', 'white': 'centaur_lightgrey_m', 'black': 'centaur_darkgrey_m'}[color]
    c = L(P + 'base/' + src)
    body = blank()
    cp, bp = c.load(), body.load()
    for y in range(18, 32):
        for x in range(32):
            p = cp[x, y]
            if p[3] and not is_skin(*p[:3]):
                bp[x, y] = p
    head = crop32(L('mon/panlord/demon_head_horse'))
    eye = (255, 40, 20) if color == 'black' else (20, 10, 5)
    head = mapcolors(head, lambda r, g, b: eye if (r > 200 and g < 80) else (r, g, b))
    hr = {'darkbrown': BROWN_HEAD, 'brown': BROWN_HEAD, 'lightbrown': LIGHT_HEAD, 'grey': GREY_HEAD,
          'white': WHITE, 'black': BLACK}[color]
    head = ramp(head, hr, only=lambda r, g, b: (r, g, b) != eye)
    if color == 'white':
        body = ramp(body, WHITE)
    if color == 'black':
        body = ramp(body, BLACK)
    return body, head


def mounted(rider, color, wings=None):
    body, head = horse(color)
    layers = [body, (head, -4, 6)]
    if wings is not None:
        layers.append((wings, 3, 6))
    layers.append((top(rider), 5, 0))
    return comp(*layers)


def troll(weapon=None, dx=-1, dy=5, base='mon/deep_troll', extra=None):
    layers = [base]
    if weapon:
        layers.append((L(P + 'hand1/' + weapon), dx, dy))
    if extra is not None:
        layers.append(extra)
    return comp(*layers)


# =============================================================================
# Pixel-art dessine (contenus absents de DCSS)
# =============================================================================
WOOD = [(70, 40, 18), (110, 66, 30), (150, 95, 48), (190, 130, 70)]
STONE = [(70, 66, 62), (110, 105, 98), (150, 145, 138), (190, 186, 176), (220, 216, 206)]


def _hull(im, x0, x1, topy, bot, prow=3, stern=3, ram=True):
    d = ImageDraw.Draw(im)
    d.polygon([(x0, topy), (x1, topy), (x1 - stern, bot), (x0 + prow, bot)], fill=WOOD[1] + (255,))
    for y in range(topy + (bot - topy) // 2 + 1, bot + 1):
        for x in range(x0, x1 + 1):
            if im.getpixel((x, y))[3]:
                im.putpixel((x, y), WOOD[0] + (255,))
    hline(im, x0, x1, topy, WOOD[3])
    hline(im, x0 + 1, x1 - 1, topy + 1, WOOD[2])
    if ram:
        hline(im, x0 - 2, x0 + prow, bot - 1, (120, 120, 130))


def draw_trireme():
    im = blank()
    d = ImageDraw.Draw(im)
    for x in range(8, 26, 3):
        d.line([(x, 23), (x - 3, 29)], fill=(160, 120, 70, 255))
    _hull(im, 4, 27, 19, 24, prow=3, stern=4)
    px(im, [(27, 18), (28, 17), (29, 16), (29, 15), (28, 14)], WOOD[2])
    px(im, [(28, 18), (29, 17), (30, 16)], WOOD[1])
    for i, x in enumerate(range(7, 26, 4)):
        px(im, [(x, 20), (x + 1, 20)], (200, 40, 30) if i % 2 else (220, 190, 60))
    vline(im, 15, 4, 18, (90, 58, 28))
    hline(im, 8, 22, 5, (110, 70, 35))
    d.rectangle([9, 6, 21, 15], fill=(232, 226, 205, 255))
    for x in (11, 12, 15, 16, 19, 20):
        vline(im, x, 6, 15, (185, 45, 35))
    hline(im, 9, 21, 15, (170, 160, 140))
    vline(im, 21, 6, 15, (190, 185, 165))
    px(im, [(15, 3), (16, 3), (17, 3), (16, 2)], (200, 40, 30))
    return outline(im)


def draw_galley():
    im = blank()
    d = ImageDraw.Draw(im)
    for x in range(6, 25, 3):
        d.line([(x, 22), (x - 3, 28)], fill=(160, 120, 70, 255))
        d.line([(x + 1, 23), (x - 1, 29)], fill=(130, 95, 55, 255))
    _hull(im, 3, 29, 17, 24, prow=4, stern=3)
    d.rectangle([23, 13, 29, 17], fill=WOOD[1] + (255,))
    hline(im, 23, 29, 13, WOOD[3])
    hline(im, 23, 29, 14, WOOD[2])
    px(im, [(25, 15), (27, 15)], (250, 200, 80))
    vline(im, 14, 2, 16, (90, 58, 28))
    hline(im, 6, 22, 3, (110, 70, 35))
    d.polygon([(7, 4), (21, 4), (22, 13), (6, 13)], fill=(232, 226, 205, 255))
    for y in (6, 7, 10, 11):
        hline(im, 7, 21, y, (40, 80, 170))
    vline(im, 21, 4, 13, (180, 175, 160))
    hline(im, 6, 22, 13, (170, 160, 140))
    px(im, [(14, 1), (15, 1), (16, 1), (15, 0)], (40, 80, 170))
    hline(im, 4, 28, 18, (200, 40, 30))
    return outline(im)


def draw_warship():
    im = blank()
    d = ImageDraw.Draw(im)
    _hull(im, 2, 29, 17, 26, prow=3, stern=2, ram=False)
    d.rectangle([22, 12, 29, 17], fill=WOOD[1] + (255,))
    hline(im, 22, 29, 12, WOOD[3])
    d.polygon([(0, 17), (3, 17), (3, 19)], fill=WOOD[2] + (255,))
    for x in range(5, 27, 4):
        px(im, [(x, 20), (x + 1, 20), (x, 21), (x + 1, 21)], (25, 15, 8))
    hline(im, 3, 28, 23, (200, 170, 60))
    for mx, topy in ((10, 1), (19, 3)):
        vline(im, mx, topy, 16, (90, 58, 28))
        for (y0, y1, w) in ((topy + 1, topy + 6, 5), (topy + 7, topy + 13, 6)):
            d.polygon([(mx - w, y0), (mx + w, y0), (mx + w + 1, y1), (mx - w - 1, y1)], fill=(236, 232, 215, 255))
            vline(im, mx + w, y0, y1, (190, 185, 170))
            hline(im, mx - w - 1, mx + w + 1, y1, (175, 168, 150))
    px(im, [(10, 0), (11, 0), (12, 0), (11, 1)], (200, 40, 30))
    px(im, [(19, 2), (20, 2), (21, 2)], (200, 40, 30))
    return outline(im)


def draw_airship():
    im = blank()
    d = ImageDraw.Draw(im)
    d.ellipse([3, 2, 28, 15], fill=(165, 70, 40, 255))
    for x in range(3, 29):
        for y in range(2, 16):
            if im.getpixel((x, y))[3]:
                dy = (y - 8.5) / 7
                dx = (x - 15.5) / 12.5
                if dy < -0.45 and dx < 0.3:
                    im.putpixel((x, y), (205, 110, 70, 255))
                elif dy > 0.45:
                    im.putpixel((x, y), (115, 45, 25, 255))
    for x in (9, 15, 21):
        for y in range(2, 16):
            if im.getpixel((x, y))[3]:
                im.putpixel((x, y), (120, 50, 28, 255))
    hline(im, 4, 27, 9, (200, 170, 90))
    d.polygon([(27, 6), (31, 3), (31, 13), (27, 11)], fill=(140, 55, 32, 255))
    for a, b in (((9, 15), (11, 20)), ((15, 15), (15, 20)), ((21, 15), (19, 20))):
        d.line([a, b], fill=(70, 50, 30, 255))
    _hull(im, 8, 23, 20, 24, prow=2, stern=2, ram=False)
    px(im, [(11, 21), (14, 21), (17, 21), (20, 21)], (240, 200, 80))
    vline(im, 25, 19, 25, (110, 110, 120))
    px(im, [(24, 19), (26, 25), (24, 25), (26, 19)], (160, 160, 170))
    return outline(im)


def draw_catapult():
    im = blank()
    d = ImageDraw.Draw(im)
    d.rectangle([4, 21, 28, 23], fill=WOOD[1] + (255,))
    hline(im, 4, 28, 21, WOOD[3])
    d.line([(12, 21), (16, 10)], fill=WOOD[0] + (255,), width=2)
    d.line([(21, 21), (17, 10)], fill=WOOD[0] + (255,), width=2)
    hline(im, 14, 19, 10, WOOD[2])
    d.line([(8, 20), (25, 5)], fill=WOOD[2] + (255,), width=2)
    d.ellipse([22, 1, 29, 7], fill=WOOD[1] + (255,))
    d.ellipse([23, 0, 28, 4], fill=(130, 130, 135, 255))
    px(im, [(24, 1), (25, 1)], (185, 185, 190))
    px(im, [(8, 18), (9, 18), (8, 19), (9, 19), (10, 19)], (120, 120, 125))
    for cx in (8, 24):
        d.ellipse([cx - 4, 22, cx + 4, 30], fill=(80, 48, 22, 255))
        d.ellipse([cx - 2, 24, cx + 2, 28], fill=(130, 85, 40, 255))
        px(im, [(cx, 26)], (60, 40, 20))
    return outline(im)


def draw_steam_cannon():
    im = blank()
    d = ImageDraw.Draw(im)
    d.rectangle([5, 20, 27, 22], fill=WOOD[1] + (255,))
    hline(im, 5, 27, 20, WOOD[3])
    d.polygon([(2, 13), (19, 15), (19, 21), (2, 18)], fill=(180, 140, 50, 255))
    hline(im, 3, 18, 14, (235, 200, 110))
    for x in (6, 11, 16):
        vline(im, x, 14, 19, (130, 95, 30))
    d.ellipse([0, 12, 4, 19], fill=(120, 90, 30, 255))
    px(im, [(1, 15), (2, 15), (1, 16), (2, 16)], (20, 15, 10))
    d.rectangle([18, 9, 27, 20], fill=(170, 85, 45, 255))
    vline(im, 18, 9, 20, (215, 130, 80))
    vline(im, 27, 9, 20, (120, 55, 25))
    hline(im, 18, 27, 12, (120, 120, 125))
    hline(im, 18, 27, 17, (120, 120, 125))
    vline(im, 22, 4, 8, (110, 110, 115))
    vline(im, 23, 4, 8, (150, 150, 155))
    for (x, y) in [(20, 2), (21, 1), (22, 1), (23, 0), (24, 1), (25, 2), (26, 1), (21, 3), (25, 3), (24, 2),
                   (23, 2), (22, 2), (23, 1), (27, 0), (26, 0)]:
        px(im, [(x, y)], (225, 228, 235))
    for cx in (9, 23):
        d.ellipse([cx - 4, 21, cx + 4, 29], fill=(70, 70, 75, 255))
        d.ellipse([cx - 2, 23, cx + 2, 27], fill=(150, 150, 155, 255))
        px(im, [(cx, 25)], (60, 60, 60))
    return outline(im)


def draw_island(raw=False):
    im = blank()
    d = ImageDraw.Draw(im)
    d.polygon([(4, 14), (28, 14), (24, 20), (19, 27), (15, 30), (12, 25), (7, 19)], fill=(120, 95, 70, 255))
    for x in range(32):
        for y in range(15, 31):
            if im.getpixel((x, y))[3]:
                if x > 18:
                    im.putpixel((x, y), (85, 65, 48, 255))
                elif x < 10 or (x + y) % 7 == 0:
                    im.putpixel((x, y), (150, 120, 90, 255))
    px(im, [(13, 19), (14, 20), (20, 18), (21, 19), (16, 23), (10, 17)], (70, 52, 38))
    d.ellipse([3, 10, 28, 17], fill=(70, 150, 50, 255))
    hline(im, 6, 24, 11, (120, 195, 80))
    hline(im, 5, 26, 12, (95, 175, 65))
    hline(im, 4, 27, 16, (45, 110, 35))
    return im if raw else outline(im)


def _bricks(im, x0, y0, x1, y1, pal=STONE):
    """Mur de pierre ombre : clair a gauche, sombre a droite, joints."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            t = (x - x0) / max(1, (x1 - x0))
            c = pal[3] if t < 0.25 else pal[2] if t < 0.7 else pal[1]
            row = (y - y0) // 3
            if (y - y0) % 3 == 2 or ((x - x0 + (2 if row % 2 else 0)) % 5 == 4):
                c = pal[1] if c != pal[1] else pal[0]
            im.putpixel((x, y), c + (255,))


def _crenel(im, x0, x1, y, pal=STONE):
    for x in range(x0, x1 + 1):
        if (x - x0) % 3 != 2:
            px(im, [(x, y), (x, y + 1)], pal[3] if x < (x0 + x1) / 2 else pal[2])


def draw_keep(mini=False):
    im = blank()
    _bricks(im, 4, 17, 27, 29)
    _crenel(im, 4, 27, 15)
    _bricks(im, 1, 11, 8, 29)
    _crenel(im, 1, 8, 9)
    _bricks(im, 23, 11, 30, 29)
    _crenel(im, 23, 30, 9)
    _bricks(im, 11, 7, 20, 18)
    _crenel(im, 11, 20, 5)
    vline(im, 15, 0, 4, (90, 60, 30))
    for y in range(0, 3):
        hline(im, 16, 19 - y, y, (200, 35, 30))
    d = ImageDraw.Draw(im)
    d.rectangle([14, 23, 17, 29], fill=(60, 35, 15, 255))
    px(im, [(14, 22), (17, 22)], STONE[1])
    hline(im, 15, 16, 22, (60, 35, 15))
    vline(im, 15, 24, 29, (90, 55, 25))
    for (x, y) in ((4, 15), (26, 15), (15, 11), (5, 21), (26, 21)):
        px(im, [(x, y), (x, y + 1)], (20, 15, 10))
    return outline(im)


def draw_tower():
    im = blank()
    pal = [(60, 55, 70), (100, 95, 112), (140, 135, 150), (180, 176, 190), (215, 212, 225)]
    _bricks(im, 11, 11, 21, 29, pal)
    _bricks(im, 9, 26, 23, 30, pal)
    d = ImageDraw.Draw(im)
    d.polygon([(16, 0), (23, 11), (9, 11)], fill=(110, 40, 150, 255))
    d.polygon([(16, 0), (16, 11), (9, 11)], fill=(150, 70, 190, 255))
    hline(im, 9, 23, 11, (70, 20, 100))
    hline(im, 10, 22, 12, (70, 20, 100))
    for (x, y) in ((15, 15), (15, 21)):
        px(im, [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)], (255, 230, 120))
    px(im, [(13, 18), (19, 18)], (120, 230, 255))
    d.rectangle([15, 26, 17, 30], fill=(50, 25, 60, 255))
    px(im, [(16, 25)], (50, 25, 60))
    for (x, y, c) in ((6, 4, (255, 240, 160)), (25, 6, (180, 240, 255)), (5, 14, (220, 180, 255)),
                      (27, 15, (255, 240, 160))):
        px(im, [(x, y)], c)
        px(im, [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], tuple(int(v * 0.7) for v in c))
    return outline(im)


MARBLE = [(110, 105, 95), (165, 160, 150), (205, 200, 188), (235, 232, 222), (250, 248, 240)]


def draw_temple(ruined=False):
    im = blank()
    d = ImageDraw.Draw(im)
    pal = MARBLE
    # degres
    d.rectangle([2, 27, 29, 29], fill=pal[1] + (255,))
    hline(im, 2, 29, 27, pal[3])
    d.rectangle([4, 25, 27, 26], fill=pal[2] + (255,))
    hline(im, 4, 27, 25, pal[4])
    # colonnes
    cols = [5, 10, 15, 20, 25]
    for i, x in enumerate(cols):
        ytop = 13
        if ruined and i == 3:
            ytop = 20
        if ruined and i == 1:
            ytop = 16
        d.rectangle([x, ytop, x + 2, 24], fill=pal[2] + (255,))
        vline(im, x, ytop, 24, pal[4])
        vline(im, x + 2, ytop, 24, pal[1])
        if not (ruined and i in (1, 3)):
            hline(im, x - 1, x + 3, 13, pal[3])
    # architrave + fronton
    if not ruined:
        d.rectangle([3, 10, 28, 12], fill=pal[2] + (255,))
        hline(im, 3, 28, 10, pal[4])
        hline(im, 3, 28, 12, pal[1])
        d.polygon([(3, 9), (15, 2), (16, 2), (28, 9)], fill=pal[3] + (255,))
        d.polygon([(7, 8), (15, 4), (16, 4), (24, 8)], fill=pal[1] + (255,))
        px(im, [(15, 6), (16, 6)], (200, 170, 70))
    else:
        d.rectangle([3, 10, 14, 12], fill=pal[2] + (255,))
        hline(im, 3, 14, 10, pal[4])
        hline(im, 3, 14, 12, pal[1])
        d.polygon([(3, 9), (10, 5), (12, 6), (11, 9)], fill=pal[3] + (255,))
        # gravats
        for (x, y) in ((19, 23), (20, 22), (22, 23), (23, 24), (13, 24), (12, 23), (28, 24)):
            px(im, [(x, y), (x + 1, y)], pal[1])
        d.rectangle([18, 21, 22, 23], fill=pal[2] + (255,))
        # mousse / fissures
        im = ramp(im, [(0, (60, 70, 50)), (0.5, (150, 155, 130)), (0.8, (195, 198, 180)), (1, (225, 225, 210))])
        p = im.load()
        for (x, y) in ((6, 20), (6, 21), (26, 18), (26, 19), (11, 22), (16, 24), (8, 27), (21, 28)):
            p[x, y] = (70, 110, 50, 255)
    return outline(im)


def draw_shatter_icon():
    ic = icon_frame()
    sw = center(L('item/weapon/long_sword1'), 1)
    p = sw.load()
    for x in range(32):
        y = 32 - x - 2
        for k in range(-1, 2):
            if 0 <= y + k < 32:
                p[x, y + k] = (0, 0, 0, 0)
    a = blank()
    a.paste(sw.crop((0, 0, 32, 32)), (0, 0))
    upper = blank()
    lower = blank()
    for y in range(32):
        for x in range(32):
            if p[x, y][3]:
                (upper if x + y < 30 else lower).putpixel((x, y), p[x, y])
    over(ic, upper, -1, -1)
    over(ic, lower, 1, 1)
    for (x, y) in ((14, 15), (17, 13), (13, 18), (18, 17)):
        px(ic, [(x, y)], (255, 240, 180))
    return ic


# =============================================================================
# Icones de sorts
# =============================================================================
_FRAME = None


def icon_frame():
    """Cadre d'icone de sort DCSS (bordure biseautee, fond noir)."""
    global _FRAME
    if _FRAME is None:
        f = L('gui/spells/fire/fireball')
        p = f.load()
        for y in range(3, 29):
            for x in range(3, 29):
                p[x, y] = (0, 0, 0, 255)
        _FRAME = f
    return _FRAME.copy()


def clip_inner(img, m=3):
    o = blank()
    o.paste(img.crop((m, m, 32 - m, 32 - m)), (m, m))
    return o


def F(src, scale=None, dx=0, dy=0, centered=True):
    """Sprite quelconque pose dans un cadre d'icone de sort (rogne a l'interieur du cadre)."""
    img = as_img(src)
    if centered:
        img = center(img, scale)
    ic = icon_frame()
    over(ic, clip_inner(shift(img, dx, dy)))
    return ic


def shift(img, dx, dy):
    o = blank()
    o.paste(img, (dx, dy))
    return o


def summon_disc():
    im = blank()
    d = ImageDraw.Draw(im)
    d.ellipse([5, 22, 26, 29], fill=(120, 15, 70, 255))
    d.ellipse([6, 23, 25, 28], fill=(225, 50, 120, 255))
    d.ellipse([8, 24, 23, 27], fill=(70, 5, 40, 255))
    return im


def S(unit_key):
    """Icone d'invocation : cadre + cercle d'invocation + creature."""
    ic = icon_frame()
    over(ic, summon_disc())
    c = CAT[unit_key]['img']
    x0, y0, x1, y1 = bbox(c)
    dx = (32 - (x1 - x0)) // 2 - x0
    dy = 28 - y1
    over(ic, clip_inner(shift(c, dx, dy)))
    return ic


# =============================================================================
# Sources lues (unites, sorts)
# =============================================================================

def parse_units(path):
    txt = open(path, encoding='utf-8').read()
    ids = re.findall(r'^var ([A-Z][A-Za-z0-9]*) Unit = Unit\{', txt, re.M)
    return [i for i in ids if i != 'UnitNone']   # UnitNone = sentinelle, pas une unite


def slug(name):
    n = name.lower().replace("'", '').replace('’', '')
    return re.sub(r'[^a-z0-9]+', '_', n).strip('_')


def parse_spells(path):
    lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
    out = []
    for i, l in enumerate(lines[:-1]):
        s = l.strip()
        if not s.endswith(':'):
            continue
        j = i + 1
        while j < len(lines) and not lines[j].strip():
            j += 1
        if j < len(lines) and re.match(r'^(Life|Death|Chaos|Nature|Sorcery|Arcane)\.', lines[j].strip()):
            raw = s[:-1].strip()
            fixed = re.sub(r'^([A-Z]) ([a-z])', r'\1\2', raw)   # artefact OCR "R aise Dead"
            out.append((raw, fixed))
    return out


# =============================================================================
# 1. Unites
# =============================================================================

def build_units(unit_ids):
    global SACK
    SACK = draw_sack()
    U = {}      # id -> (img, src, approx)

    def u(uid, img, src, approx=None):
        U[uid] = (img, src, approx)

    # ---------------- Hauts-Hommes (humains, acier et bleu) ----------------
    r = 'highmen'
    u('HighMenSpearmen', RU(r, body='leather_heavy', legs='pants_brown', boots='middle_brown', helm='cap_blue', hand1='spear'), 'paperdoll humain')
    u('HighMenSwordsmen', RU(r, body='kryias', legs='leg_armour01', boots='mesh_black', helm='helm_plume', hand1='long_sword_slant', hand2='shield_knight_blue'), 'paperdoll humain')
    u('HighMenBowmen', RU(r, body='leather2', legs='pants_blue', boots='middle_brown', helm='feather_blue', hand1='bow'), 'paperdoll humain')
    u('HighMenPikemen', RU(r, body='half_plate2', legs='leg_armour02', boots='mesh_black', helm='chain', hand1='pike'), 'paperdoll humain')
    u('HighMenCavalry', mounted(RU(r, body='kryias', helm='helm_plume', hand1='lance', hand2='shield_knight_blue'), 'darkbrown'), 'humain + cheval compose (centaure + tete de cheval)')
    u('HighMenPriest', RU(r, body='robe_white_blue', helm='hood_white', hand1='staff_sceptre', hand2='misc/book_white'), 'paperdoll humain')
    u('HighMenMagician', RU(r, body='robe_blue', helm='wizard_blue', hand1='staff_mage', hand2='misc/light_blue'), 'paperdoll humain')
    u('HighMenEngineer', RU(r, body='shirt_vest', legs='pants_brown', boots='short_brown2', helm='cap_black1', hand1='pick_axe'), 'paperdoll humain')
    u('HighMenSettlers', RU(r, sack=True, body='shirt_white1', legs='pants_brown', boots='short_brown2', helm='straw'), 'paperdoll humain + sac dessine')
    u('Paladin', mounted(RU(r, body='plate_and_cloth', helm='isildur', hand1='lance', hand2='shield_knight_rw'), 'white'), 'humain + cheval blanc compose')

    # ---------------- Nomades (peau halee, equipement leger, turbans) ----------------
    r = 'nomad'
    u('NomadSpearmen', RU(r, body='shirt_vest', legs='pants_orange', boots='short_brown2', helm='turban_white', hand1='spear'), 'paperdoll humain hale')
    u('NomadSwordsmen', RU(r, body='jacket_stud', legs='pants_l_white', boots='middle_ybrown', helm='turban_brown', hand1='scimitar', hand2='buckler_round2'), 'paperdoll humain hale')
    u('NomadBowmen', RU(r, body='leather_jacket', legs='pants_short_brown', boots='short_brown2', helm='turban_white', hand1='bow_two'), 'paperdoll humain hale')
    u('NomadPikemen', RU(r, body='half_plate3', legs='pants_l_white', boots='middle_ybrown', helm='turban_brown', hand1='pike'), 'paperdoll humain hale')
    u('NomadPriest', RU(r, body='robe_white', helm='turban_white', hand1='sceptre', hand2='misc/book_yellow'), 'paperdoll humain hale')
    u('NomadSettlers', RU(r, sack=True, body='shirt_white2', legs='pants_l_white', boots='short_brown2', helm='bandana_ybrown'), 'paperdoll humain hale + sac dessine')
    u('NomadHorsebowemen', mounted(RU(r, body='jacket_stud', helm='turban_white', hand1='bow_two'), 'lightbrown'), 'humain hale + cheval compose')
    u('NomadRangers', RU(r, cloak='brown', body='leather_green', legs='pants_brown', boots='middle_green', helm='hood_ybrown', hand1='great_bow'), 'paperdoll humain hale')
    u('Griffin', L('mon/griffon'), 'mon/griffon')

    # ---------------- Barbares (peau claire, fourrures, cornes) ----------------
    r = 'barbarian'
    u('BarbarianSpearmen', RU(r, body='animal_skin', legs='pants_short_darkbrown', boots='short_brown2', helm='horns1', hand1='spear_two'), 'paperdoll humain clair')
    u('BarbarianSwordsmen', RU(r, body='leather_stud', legs='pants_short_darkbrown', boots='middle_brown', helm='viking_brown1', hand1='broadsword', hand2='doll_only/shield_round3'), 'paperdoll humain clair')
    u('BarbarianBowmen', RU(r, body='animal_skin', legs='pants_brown', boots='short_brown2', hair='knot_red', helm='bandana_ybrown', hand1='bow'), 'paperdoll humain clair')
    u('BarbarianCavalry', mounted(RU(r, body='leather_stud', helm='viking_gold', hand1='spear', hand2='doll_only/shield_round3'), 'brown'), 'humain clair + cheval compose')
    u('BarbarianShaman', RU(r, body='animal_skin', legs='pants_short_brown3', helm='bear', hand1='staff_organic', hand2='doll_only/shield_shaman'), 'paperdoll humain clair')
    u('BarbarianSettlers', RU(r, sack=True, body='shirt_black_and_cloth', legs='pants_brown', boots='short_brown2', hair='brown1'), 'paperdoll humain clair + sac dessine')
    u('Berserkers', RU(r, legs='loincloth_red', boots='short_brown2', hair='knot_red', helm='horned', hand1='battleaxe2', gloves='glove_short_red'), 'paperdoll humain clair')

    # ---------------- Hauts-Elfes (vert et or) ----------------
    r = 'highelf'
    u('HighElfSpearmen', RU(r, body='leather_green', legs='pants_darkgreen', boots='middle_green', hair='legolas', hand1='spear2'), 'paperdoll elfe')
    u('HighElfSwordsmen', RU(r, body='green_chain', legs='leg_armour03', boots='middle_green', helm='helm_green', hand1='long_sword_slant2', hand2='lshield_green'), 'paperdoll elfe')
    u('HighElfHalberdiers', RU(r, body='gil-galad', legs='leg_armour03', boots='middle_gold', helm='yellow_wing', hand1='glaive'), 'paperdoll elfe')
    u('HighElfCavalry', mounted(RU(r, body='green_chain', helm='helm_green', hand1='lance', hand2='lshield_green'), 'grey'), 'elfe + cheval gris compose')
    u('HighElfMagician', RU(r, body='robe_green_gold', helm='wizard_lightgreen', hand1='staff_mage_two', hand2='misc/light_yellow'), 'paperdoll elfe')
    u('HighElfSettlers', RU(r, sack=True, body='pipin', legs='pants_darkgreen', boots='middle_brown', hair='elf_black'), 'paperdoll elfe + sac dessine')
    u('Longbowmen', RU(r, cloak='brown', body='legolas', legs='pants_darkgreen', boots='middle_green', helm='hood_green', hand1='great_bow'), 'paperdoll elfe')
    u('ElvenLord', mounted(RU(r, body='armour_blue_gold', helm='crown_gold2', hand1='long_sword_slant', hand2='lshield_gold'), 'white'), 'elfe dore + cheval blanc compose')
    wings = ramp(crop32(L('mon/panlord/demon_wings_sparrow')), WHITE)
    pb_, ph_ = horse('white')
    u('Pegasai', comp((wings, 2, 0), pb_, (ph_, -4, 6), (top(RU(r, body='legolas', hair='legolas', hand1='bow')), 5, 0)), 'elfe + cheval blanc aile compose', 'pegase compose (cheval + ailes de demon recolorees)')

    # ---------------- Elfes noirs (noir et pourpre) ----------------
    r = 'darkelf'
    u('DarkElfSpearmen', RU(r, body='leather_stud', legs='pants_black', boots='mesh_black', hair='elf_black', helm='band_magenta', hand1='spear_four'), 'paperdoll elfe noir')
    u('DarkElfSwordsmen', RU(r, body='mesh_black', legs='leg_armour04', boots='mesh_black', hair='elf_black', helm='cap_black1', hand1='black_sword', hand2='doll_only/shield_middle_black'), 'paperdoll elfe noir')
    u('DarkElfHalberdiers', RU(r, body='plate_black', legs='leg_armour04', boots='mesh_black', helm='black_horn2', hand1='halberd'), 'paperdoll elfe noir')
    u('DarkElfCavalry', mounted(RU(r, body='plate_black', hair='elf_black', helm='cap_black1', hand1='lance', hand2='doll_only/shield_middle_black'), 'black'), 'elfe noir + cheval noir compose')
    u('DarkElfPriests', RU(r, body='robe_black_gold', helm='hood_black2', hand1='staff_sceptre', hand2='misc/book_magenta'), 'paperdoll elfe noir')
    u('DarkElfSettlers', RU(r, sack=True, body='shirt_black3', legs='pants_black', boots='short_purple', hair='elf_black'), 'paperdoll elfe noir + sac dessine')
    u('Nightblades', RU(r, body='slit_black', legs='pants_black', boots='mesh_black', helm='ninja_black', hand1='dagger_slant', hand2='misc/dagger'), 'paperdoll elfe noir')
    u('Warlocks', RU(r, body='robe_black_red', helm='wizard_blackred', hand1='staff_skull', hand2='misc/fire_dark'), 'paperdoll elfe noir')
    nb, nh = horse('black')
    u('Nightmares', comp(nb, (nh, -1, 7)), 'cheval noir aux yeux rouges compose', 'cheval noir compose (pas de destrier infernal en DCSS)')

    # ---------------- Nains (barbe, plus petits) ----------------
    r = 'dwarf'
    u('DwarfSwordsmen', RU(r, body='kryias', legs='leg_armour00', boots='mesh_black', helm='helm_gimli', hand1='short_sword_slant', hand2='doll_only/shield_round2'), 'paperdoll nain (reduit)')
    u('DwarfHalberdiers', RU(r, body='half_plate', legs='leg_armour00', boots='mesh_black', helm='helm_gimli', hand1='halberd'), 'paperdoll nain (reduit)')
    u('DwarfEngineer', RU(r, body='leather_jacket', legs='pants_brown', boots='middle_brown', helm='cap_black1', hand1='pick_axe'), 'paperdoll nain (reduit)')
    u('Hammerhands', RU(r, body='bplate_metal1', legs='leg_armour00', boots='mesh_black', helm='fhelm_horn_yellow', hand1='UNUSED/worn/hammer2', hand2='doll_only/shield_round4'), 'paperdoll nain (reduit)')
    u('DwarfSettlers', RU(r, sack=True, body='gimli', legs='pants_brown', boots='middle_brown'), 'paperdoll nain + sac dessine')
    u('Golem', L('mon/nonliving/guardian_golem'), 'mon/nonliving/guardian_golem')

    # ---------------- Halfelins (petits, cheveux, cuir) ----------------
    r = 'halfling'
    u('HalflingSpearmen', RU(r, body='frodo', legs='pants_short_brown', hair='frodo', hand1='spear'), 'paperdoll halfelin (reduit)')
    u('HalflingSwordsmen', RU(r, body='kryias', legs='pants_short_brown', hair='merry', hand1='short_sword_slant', hand2='buckler_round'), 'paperdoll halfelin (reduit)')
    u('HalflingBowmen', RU(r, body='leather_jacket', legs='pants_short_brown3', hair='sam', hand1='bow_two'), 'paperdoll halfelin (reduit)')
    u('HalflingShamans', RU(r, body='animal_skin', legs='pants_short_brown', helm='feather_green', hand1='staff_organic'), 'paperdoll halfelin (reduit)')
    u('HalflingSettlers', RU(r, sack=True, body='shirt_white2', legs='pants_short_brown', hair='pj'), 'paperdoll halfelin + sac dessine')
    u('Slingers', RU(r, body='leather_green', legs='pants_short_darkbrown', hair='brown2', hand1='greatsling'), 'paperdoll halfelin (reduit)')

    # ---------------- Orques (peau verte, rouge et noir) ----------------
    r = 'orc'
    u('OrcSpearmen', RU(r, body='leather_red', legs='pants_black', boots='middle_brown', helm='horns1', hand1='spear'), 'paperdoll humain a peau verte')
    u('OrcSwordsmen', RU(r, body='kryias', legs='leg_armour05', boots='mesh_black', helm='horn_evil', hand1='falchion', hand2='doll_only/shield_skull'), 'paperdoll humain a peau verte')
    u('OrcHalberdiers', RU(r, body='plate_black', legs='leg_armour05', boots='mesh_black', helm='iron_red', hand1='halberd'), 'paperdoll humain a peau verte')
    u('OrcBowmen', RU(r, body='leather_stud', legs='pants_black', boots='short_brown2', helm='bandana_ybrown', hand1='bow_three'), 'paperdoll humain a peau verte')
    u('OrcCavalry', mounted(RU(r, body='leather_red', helm='horns2', hand1='spear', hand2='doll_only/shield_skull'), 'darkbrown'), 'orque + cheval compose')
    u('OrcShamans', RU(r, body='animal_skin', legs='pants_black', helm='feather_red', hand1='staff_skull'), 'paperdoll humain a peau verte')
    u('OrcMagicians', RU(r, body='robe_red', helm='wizard_blackred', hand1='staff_ruby', hand2='misc/light_red'), 'paperdoll humain a peau verte')
    u('OrcEngineers', RU(r, body='leather_jacket', legs='pants_black', boots='middle_brown', helm='cap_black1', hand1='pick_axe'), 'paperdoll humain a peau verte')
    u('OrcSettlers', RU(r, sack=True, body='shirt_black', legs='pants_brown', boots='short_brown2'), 'paperdoll humain a peau verte + sac dessine')
    orider = RU(r, body='leather_red', helm='horns2', hand1='spear')
    u('WyvernRiders', comp('mon/dragons/wyvern', (top(orider, 17), 3, -1)), 'mon/dragons/wyvern + cavalier orque')

    # ---------------- Trolls ----------------
    u('TrollSpearmen', troll('spear', -1, 5), 'mon/deep_troll + lance')
    u('TrollSwordsmen', troll('long_sword_slant', 0, 6, extra=(L(P + 'hand2/shield_kite3'), 3, 6)), 'mon/deep_troll + epee + bouclier')
    u('TrollHalberdiers', troll('halberd', -1, 4), 'mon/deep_troll + hallebarde')
    u('TrollShamans', L('mon/deep_troll_shaman'), 'mon/deep_troll_shaman')
    u('TrollSettlers', comp('mon/deep_troll', (SACK, 2, 4)), 'mon/deep_troll + sac dessine')
    u('WarTrolls', troll('great_mace', 0, 5, base='mon/iron_troll'), 'mon/iron_troll + masse')
    u('WarMammoths', ramp(L('mon/animals/elephant'), MAMMOTH, only=lambda r_, g, b: not (r_ > 200 and g > 200 and b > 180)), 'mon/animals/elephant recolore', 'elephant recolore en mammouth')

    # ---------------- Draconiens (ailes) ----------------
    r = 'draconian'
    u('DraconianSpearmen', RU(r, body='leather_heavy', hand1='spear'), 'paperdoll draconien aile')
    u('DraconianSwordsmen', RU(r, body='kryias', hand1='long_sword_slant', hand2='shield_kite4'), 'paperdoll draconien aile')
    u('DraconianHalberdiers', RU(r, body='half_plate', legs='leg_armour00', hand1='halberd'), 'paperdoll draconien aile')
    u('DraconianBowmen', RU(r, body='leather2', hand1='bow'), 'paperdoll draconien aile')
    u('DraconianShaman', RU(r, body='animal_skin', helm='feather_yellow', hand1='staff_organic'), 'paperdoll draconien aile')
    u('DraconianMagician', RU(r, body='robe_red_gold', helm='wizard_red', hand1='staff_mage', hand2='misc/light_red'), 'paperdoll draconien aile')
    u('DraconianEngineer', RU(r, body='leather_jacket', helm='cap_black1', hand1='pick_axe'), 'paperdoll draconien aile')
    u('DraconianSettlers', RU(r, sack=True, body='shirt_white3'), 'paperdoll draconien aile + sac dessine')
    u('DoomDrake', L('player/transform/dragon_form_mottled'), 'player/transform/dragon_form_mottled', 'dragon generique (forme de dragon DCSS)')
    u('AirShip', draw_airship(), 'dessine (pixel-art)')

    # ---------------- Gnolls (kobold recolore en hyene) ----------------
    r = 'gnoll'
    u('GnollSpearmen', RU(r, body='leather_heavy', legs='pants_short_brown', hand1='spear_three'), 'paperdoll kobold recolore')
    u('GnollSwordsmen', RU(r, body='kryias', legs='pants_short_brown', hand1='falchion2', hand2='doll_only/shield_middle_brown'), 'paperdoll kobold recolore')
    u('GnollHalberdiers', RU(r, body='half_plate3', legs='leg_armour00', hand1='glaive_two'), 'paperdoll kobold recolore')
    u('GnollBowmen', RU(r, body='leather2', legs='pants_short_brown', hand1='bow_three'), 'paperdoll kobold recolore')
    u('GnollSettlers', RU(r, sack=True, body='shirt_check', legs='pants_short_brown'), 'paperdoll kobold recolore + sac dessine')
    grider = RU(r, body='leather_red', hand1='spear')
    u('WolfRiders', comp('mon/animals/wolf', (top(grider, 18), 1, -3)), 'mon/animals/wolf + cavalier gnoll')

    # ---------------- Hommes-Betes (minotaure) ----------------
    r = 'beastmen'
    u('BeastmenSpearmen', RU(r, body='leather_heavy', hand1='spear'), 'paperdoll minotaure')
    u('BeastmenSwordsmen', RU(r, body='kryias', legs='leg_armour00', hand1='long_sword_slant', hand2='shield_kite2'), 'paperdoll minotaure')
    u('BeastmenHalberdiers', RU(r, body='half_plate2', legs='leg_armour01', hand1='halberd'), 'paperdoll minotaure')
    u('BeastmenBowmen', RU(r, body='leather_stud', hand1='bow_two'), 'paperdoll minotaure')
    u('BeastmenPriest', RU(r, body='robe_brown', hand1='sceptre', hand2='misc/book_red'), 'paperdoll minotaure')
    u('BeastmenMagician', RU(r, body='robe_purple', helm='wizard_purple', hand1='staff_mage', hand2='misc/light_blue'), 'paperdoll minotaure')
    u('BeastmenEngineer', RU(r, body='leather_jacket', legs='pants_brown', hand1='pick_axe'), 'paperdoll minotaure')
    u('BeastmenSettlers', RU(r, sack=True, body='shirt_black_and_cloth', legs='pants_brown'), 'paperdoll minotaure + sac dessine')
    u('Centaur', doll('centaur_brown_m', body='leather_heavy', hand1='bow'), 'paperdoll centaure')
    u('Manticore', L('mon/manticore'), 'mon/manticore')
    mino = ramp(L(P + 'base/minotaur_brown2_m'), [(0, (10, 5, 2)), (0.35, (55, 30, 15)), (0.6, (100, 60, 30)), (1, (180, 130, 90))])
    u('Minotaur', doll(mino, legs='loincloth_red', gloves='glove_short_gray', hand1='axe_executioner'), 'paperdoll minotaure sombre')

    # ---------------- Klackons (formicide) ----------------
    r = 'klackon'
    u('KlackonSpearmen', RU(r, body='leather_heavy', hand1='spear'), 'paperdoll formicide')
    u('KlackonSwordsmen', RU(r, body='kryias', legs='leg_armour00', hand1='short_sword_slant2', hand2='doll_only/shield_middle_round'), 'paperdoll formicide')
    u('KlackonHalberdiers', RU(r, body='half_plate', legs='leg_armour01', hand1='halberd'), 'paperdoll formicide')
    u('KlackonEngineer', RU(r, body='leather_jacket', hand1='pick_axe'), 'paperdoll formicide')
    u('KlackonSettlers', RU(r, sack=True, body='shirt_white1'), 'paperdoll formicide + sac dessine')
    u('StagBeetle', ramp(L('mon/animals/boulder_beetle'), BEETLE), 'mon/animals/boulder_beetle recolore', 'scarabee recolore (pas de lucane en DCSS)')

    # ---------------- Hommes-Lezards (draconien vert sans ailes) ----------------
    r = 'lizardman'
    u('LizardSpearmen', RU(r, body='leather_short', hand1='spear'), 'paperdoll draconien vert')
    u('LizardSwordsmen', RU(r, body='green_chain', hand1='short_sword_slant', hand2='doll_only/shield_middle_cyan'), 'paperdoll draconien vert')
    u('LizardHalberdiers', RU(r, body='bplate_green', legs='leg_armour02', hand1='halberd'), 'paperdoll draconien vert')
    u('LizardJavelineers', RU(r, body='leather_metal', hand1='spear_five', hand2='misc/dagger'), 'paperdoll draconien vert', 'javelots representes par une lance courte')
    u('LizardShamans', RU(r, body='animal_skin', helm='feather_green', hand1='staff_organic'), 'paperdoll draconien vert')
    u('LizardSettlers', RU(r, sack=True, body='shirt_vest'), 'paperdoll draconien vert + sac dessine')
    u('DragonTurtle', hue(L('mon/animals/alligator_snapping_turtle'), 0), 'mon/animals/alligator_snapping_turtle', 'tortue alligator (pas de tortue-dragon en DCSS)')

    # ---------------- Unites generiques ----------------
    u('Trireme', draw_trireme(), 'dessine (pixel-art)')
    u('Galley', draw_galley(), 'dessine (pixel-art)')
    u('Warship', draw_warship(), 'dessine (pixel-art)')
    u('Catapult', draw_catapult(), 'dessine (pixel-art)')
    u('SteamCannon', draw_steam_cannon(), 'dessine (pixel-art)')

    # ---------------- Creatures fantastiques ----------------
    u('MagicSpirit', L('mon/undead/phantom'), 'mon/undead/phantom', 'fantome lumineux utilise comme esprit magique')
    u('GuardianSpirit', comp('player/halo/halo_player', ramp(L('mon/undead/phantom'), GOLD)), 'phantom dore + halo')
    u('HellHounds', L('mon/animals/hell_hound'), 'mon/animals/hell_hound')
    u('Gargoyle', L(P + 'base/gargoyle_m'), 'player/base/gargoyle_m')
    u('FireGiant', L('mon/fire_giant'), 'mon/fire_giant')
    u('FireElemental', L('mon/nonliving/fire_elemental'), 'mon/nonliving/fire_elemental')
    u('ChaosSpawn', L('mon/demons/chaos_spawn1'), 'mon/demons/chaos_spawn1')
    u('Chimeras', L('mon/mutant_beast'), 'mon/mutant_beast', 'bete mutante cornue (pas de chimere en DCSS)')
    u('DoomBat', ramp(L('mon/vault/gigabat'), FIRE), 'mon/vault/gigabat recolore feu', 'chauve-souris geante recoloree')
    u('Efreet', L('mon/demons/efreet'), 'mon/demons/efreet')
    u('Hydra', L('mon/dragons/hydra5'), 'mon/dragons/hydra5')
    u('GreatDrake', L('player/transform/dragon_form_red'), 'player/transform/dragon_form_red')
    u('Skeleton', L('mon/undead/skeletal_warrior'), 'mon/undead/skeletal_warrior')
    u('Ghoul', L('mon/undead/ghoul'), 'mon/undead/ghoul')
    u('NightStalker', L('mon/undead/shadow'), 'mon/undead/shadow', 'ombre (pas de traqueur nocturne en DCSS)')
    u('WereWolf', ramp(L('mon/gnoll'), WERE), 'mon/gnoll recolore gris', 'homme-loup = gnoll recolore en gris')
    u('Demon', L('mon/demons/red_devil'), 'mon/demons/red_devil')
    u('Wraith', L('mon/undead/shadow_wraith'), 'mon/undead/shadow_wraith')
    u('ShadowDemons', L('mon/demons/shadow_fiend'), 'mon/demons/shadow_fiend')
    u('DeathKnights', L('mon/death_knight'), 'mon/death_knight')
    u('DemonLord', L('mon/demons/balrug'), 'mon/demons/balrug')
    zb = ramp(L(P + 'base/human_m'), ZOMBIE, only=is_skin)
    u('Zombie', doll(zb, body='bloody', legs='pants_short_gray'), 'humain recolore (zombie)')
    ub, uh = horse('white')
    uni = comp(ub, (uh, -1, 7))
    d = ImageDraw.Draw(uni)
    d.line([(6, 9), (2, 2)], fill=(240, 200, 60, 255), width=2)
    px(uni, [(3, 3), (4, 5), (5, 7)], (255, 245, 170))
    u('Unicorn', outline(uni), 'cheval blanc compose + corne dessinee')
    u('Angel', L('mon/holy/angel'), 'mon/holy/angel')
    u('ArchAngel', L('mon/holy/daeva'), 'mon/holy/daeva')
    u('WarBear', ramp(L('mon/animals/black_bear'), MAMMOTH), 'mon/animals/black_bear recolore')
    spr = doll(P + 'base/spriggan_m', body='dress_green')
    bw = ramp(crop32(L('mon/panlord/demon_wings_butterfly_small')), [(0, (10, 40, 40)), (0.5, (60, 200, 180)), (1, (220, 255, 240))])
    u('Sprites', comp((bw, 0, 2), spr, L(P + 'hand1/misc/light_blue')), 'spriggan + ailes de papillon', 'fee composee (spriggan + ailes)')
    u('Cockatrices', ramp(L('mon/animals/caustic_shrike'), [(0, (30, 20, 0)), (0.4, (150, 110, 20)), (0.7, (220, 190, 70)), (1, (255, 250, 200))]), 'mon/animals/caustic_shrike recolore', 'oiseau epineux recolore (pas de cocatrix en DCSS)')
    u('Basilisk', L('mon/animals/basilisk'), 'mon/animals/basilisk')
    u('GiantSpiders', L('mon/animals/redback'), 'mon/animals/redback')
    u('StoneGiant', L('mon/stone_giant'), 'mon/stone_giant')
    u('Colossus', ramp(L('mon/unique/iron_giant'), BRONZE), 'mon/unique/iron_giant recolore bronze')
    g = blank(32, 48)
    for part in ('demon_wings_large', 'demon_body_succubus', 'demon_head_medusa'):
        over(g, L('mon/panlord/' + part))
    u('Gorgon', crop32(g, 8), 'seigneur de Pandemonium compose (ailes + corps + tete de meduse)', 'gorgone composee (tete de meduse)')
    u('EarthElemental', L('mon/nonliving/earth_elemental'), 'mon/nonliving/earth_elemental')
    u('Behemoth', L('mon/animals/elephant_dire'), 'mon/animals/elephant_dire', 'elephant cuirasse (pas de behemoth en DCSS)')
    u('GreatWyrm', L('mon/unique/jormungandr'), 'mon/unique/jormungandr')
    u('FloatingIsland', draw_island(), 'dessine (pixel-art)')
    pb = ramp(L('mon/undead/spectrals/spectral_quadruped_large'), GHOST)
    u('PhantomBeast', pb, 'spectral_quadruped_large recolore')
    pw = ramp(doll('human_m', body='kryias', helm='helm_plume', hand1='long_sword_slant', hand2='shield_kite1'), GHOST)
    pw.putalpha(pw.getchannel('A').point(lambda a: 220 if a else 0))
    u('PhantomWarrior', pw, 'paperdoll guerrier recolore spectral')
    u('StormGiant', L('mon/titan'), 'mon/titan')
    u('AirElemental', L('mon/nonliving/air_elemental'), 'mon/nonliving/air_elemental')
    dj = doll(ramp(L(P + 'base/human_m'), BLUE_SKIN, only=is_skin), hair='djinn1', body='vest_red2')
    u('Djinn', comp((L('effect/cloud_blue_smoke'), 0, 12), top(dj, 20)), 'humain bleu + fumee')
    u('SkyDrake', L('mon/dragons/storm_dragon'), 'mon/dragons/storm_dragon')
    u('Nagas', L('mon/naga_warrior'), 'mon/naga_warrior')

    # ---------------- Heros ----------------
    hu = 'human_m'
    hf = 'human_f'
    tanm = ramp(L(P + 'base/human_m'), TAN, only=is_skin)
    u('HeroBrax', L('mon/dwarf'), 'mon/dwarf')
    u('HeroGunther', L('mon/unique/rupert'), 'mon/unique/rupert')
    u('HeroZaldron', L('UNUSED/monsters/gnome'), 'UNUSED/monsters/gnome (vieux sage)')
    u('HeroBShan', doll(tanm, body='robe_white2', helm='turban_white', boots='middle_ybrown', hand1='scimitar', hand2='misc/short_sword_slant'), 'paperdoll derviche')
    u('HeroRakir', doll('minotaur_brown2_m', body='animal_skin', legs='pants_short_brown', boots='short_brown2', hand1='whip', hand2='misc/torch'), 'paperdoll homme-bete dresseur')
    u('HeroValana', doll(hf, body='china_red2', legs='skirt_red', boots='middle_brown', hair='fem_yellow', helm='feather_red', hand1='rapier', hand2='misc/lantern'), 'paperdoll barde', 'barde sans instrument (pas de luth en DCSS)')
    u('HeroBahgtru', L('mon/orc_warrior'), 'mon/orc_warrior')
    u('HeroSerena', doll(hf, body='robe_white_green', hair='fem_yellow', helm='healer', hand1='staff_plain', hand2='misc/light_yellow'), 'paperdoll guerisseuse')
    u('HeroShuri', doll(hf, body='animal_skin', legs='skirt_green', boots='middle_brown', hair='pigtail_red', hand1='spear2'), 'paperdoll chasseresse')
    u('HeroTheria', doll(hf, body='leather_jacket', legs='pants_black', boots='mesh_black', hair='fem_red', helm='bandana_ybrown', hand1='sword_thief', hand2='misc/dagger'), 'paperdoll voleuse')
    u('HeroGreyfairer', doll('dwarf_m', body='robe_brown2', helm='hood_green2', hand1='staff_organic', hand2='misc/fire_green'), 'paperdoll druide')
    u('HeroTaki', doll(hu, body='monk_blue', helm='band_red', hand1='quarterstaff'), 'paperdoll moine')
    u('HeroReywind', L('mon/unique/sigmund'), 'mon/unique/sigmund')
    u('HeroMalleus', L('mon/unique/eustachio'), 'mon/unique/eustachio')
    u('HeroTumu', doll(tanm, cloak='black', body='robe_of_night', hand1='sword_thief', hand2='misc/dagger'), 'paperdoll assassin')
    u('HeroJaer', doll(hu, body='robe_white_blue', helm='wizard_white', hand1='staff_ring_blue', hand2='misc/fire_white'), 'paperdoll mage du vent')
    u('HeroMarcus', doll(hu, cloak='brown', body='leather_green', legs='pants_brown', boots='middle_brown', helm='hood_ybrown', hand1='great_bow'), 'paperdoll rodeur')
    fang = comp('mon/draco/draco-base-black', 'mon/draco/draco-job-knight')
    u('HeroFang', fang, 'mon/draco base noire + chevalier')
    u('HeroMorgana', doll(hf, body='robe_black_red', hair='fem_red', helm='wizard_blackred', hand1='staff_skull', hand2='misc/fire_dark'), 'paperdoll sorciere')
    u('HeroAureus', L('mon/unique/frederick'), 'mon/unique/frederick')
    u('HeroShinBo', doll(hu, body='shirt_black', legs='pants_black', boots='mesh_black', helm='ninja_black', hand1='katana_slant'), 'paperdoll ninja')
    u('HeroSpyder', L('mon/unique/maurice'), 'mon/unique/maurice')
    u('HeroShalla', L('mon/unique/margery'), 'mon/unique/margery')
    u('HeroYramrag', L('mon/vault/hellbinder'), 'mon/vault/hellbinder')
    u('HeroMysticX', L('UNUSED/monsters/michael'), 'UNUSED/monsters/michael (silhouette encapuchonnee)')
    u('HeroAerie', L('mon/unique/psyche'), 'mon/unique/psyche')
    u('HeroDethStryke', doll(hu, body='aragorn2', legs='pants_black', boots='middle_brown', hair='aragorn', hand1='long_sword_slant', hand2='misc/short_sword_slant2'), 'paperdoll bretteur (deux lames)')
    u('HeroElana', L('mon/unique/kirke'), 'mon/unique/kirke')
    u('HeroRoland', comp('player/halo/halo_player', doll(hu, body='plate_and_cloth', legs='leg_armour01', boots='mesh_white', helm='isildur', hand1='mace_two', hand2='shield_knight_rw')), 'paperdoll paladin + halo')
    u('HeroMortu', L('mon/vault_sentinel'), 'mon/vault_sentinel')
    u('HeroAlorra', doll('elf_f', body='legolas', legs='pants_darkgreen', boots='middle_green', hair='arwen', hand1='great_bow'), 'paperdoll archere elfe')
    u('HeroSirHarold', L('mon/vault_guard'), 'mon/vault_guard')
    u('HeroRavashack', L('mon/necromancer'), 'mon/necromancer')
    u('HeroWarrax', L('mon/hell_knight'), 'mon/hell_knight')
    u('HeroTorin', L('mon/unique/mennas'), 'mon/unique/mennas')

    missing = [x for x in unit_ids if x not in U]
    extra = [x for x in U if x not in unit_ids]
    if missing or extra:
        raise SystemExit('Unites sans sprite : %s / sprites sans unite : %s' % (missing, extra))
    for uid in unit_ids:
        img, src, approx = U[uid]
        add('unit:' + uid, img, src, approx)


# =============================================================================
# 2. Sorciers
# =============================================================================

def build_wizards():
    tan = lambda b='human_m': ramp(L(P + 'base/' + b), TAN, only=is_skin)
    dark_f = ramp(L(P + 'base/human_f'), DARKSKIN, only=is_skin)
    blue_f = ramp(L(P + 'base/human_f'), BLUE_SKIN, only=is_skin)
    W = [
        # 0 grand mage nature/vie (vieillard barbu)
        (doll('dwarf_m', body='robe_blue_white', helm='wizard_blue', hand1='staff_mage', hand2='misc/light_blue'), 'paperdoll vieux mage'),
        # 1 chamane
        (doll(tan(), body='animal_skin', legs='pants_brown', boots='short_brown2', helm='feather_white', hand1='staff_organic', hand2='misc/light_yellow'), 'paperdoll chamane'),
        # 2 pretresse vaudou
        (doll(dark_f, body='robe_red3', hair='fem_black', helm='band_red', hand1='staff_skull', hand2='misc/fire_green'), 'paperdoll pretresse vaudou'),
        # 3 mystique d'Orient
        (doll('human_m', body='china_red', legs='pants_black', boots='mesh_black', helm='taiso_red', hand1='misc/fan', hand2='misc/spark'), 'paperdoll mystique'),
        # 4 illusionniste
        (doll(tan(), body='robe_purple', helm='turban_purple', hand1='sceptre', hand2='misc/light_red'), 'paperdoll illusionniste'),
        # 5 elementaliste
        (doll('human_m', body='robe_red_gold', helm='wizard_red', hand1='staff_ruby', hand2='misc/light_red'), 'paperdoll elementaliste'),
        # 6 sorcier de la mort
        (L('mon/vault/hell_wizard_100'), 'mon/vault/hell_wizard_100'),
        # 7 draconien
        (doll('draconian_gold_m', wing='drcwing_yellow', body='robe_white_red', hand1='staff_large', hand2='misc/light_yellow'), 'paperdoll draconien'),
        # 8 demoniaque
        (L('UNUSED/monsters/asmodeus.small'), 'UNUSED/monsters/asmodeus.small'),
        # 9 nymphe elfe
        (doll('elf_f', body='dress_green', hair='fem_yellow', helm='feather_green', hand1='staff_organic', hand2='misc/light_yellow'), 'paperdoll nymphe elfe'),
        # 10 sorcier a tete de faucon
        (L('mon/tengu_conjurer'), 'mon/tengu_conjurer'),
        # 11 grande pretresse
        (doll('human_f', body='robe_white', hair='fem_white', helm='crown_gold1', hand1='staff_plain', hand2='misc/light_yellow'), 'paperdoll grande pretresse'),
        # 12 pretre azteque
        (doll(tan(), body='robe_green_gold', helm='yellow_wing', hand1='staff_fancy', hand2='misc/light_red'), 'paperdoll pretre a plumes'),
        # 13 sorciere a peau bleue
        (doll(blue_f, body='robe_black_gold', hair='fem_black', helm='crown_gold3', hand1='staff_evil', hand2='misc/light_blue'), 'paperdoll sorciere'),
    ]
    for i, (img, src) in enumerate(W):
        add('wizard:%d' % i, img, src)


# =============================================================================
# 3. Sorts
# =============================================================================
GS = 'gui/spells/'


def I(rel):
    return L(rel)


def INV(rel):
    """Icone de gui/invocations (cadre en croix) -> contenu recadre dans le cadre de sort."""
    im = L(rel)
    p = im.load()
    frame = {(0, 0, 0), (39, 39, 39), (48, 48, 48), (64, 64, 64), (144, 144, 144), (196, 196, 196)}
    for y in range(32):
        for x in range(32):
            if p[x, y][3] and p[x, y][:3] in frame:
                p[x, y] = (0, 0, 0, 0)
    ic = icon_frame()
    over(ic, clip_inner(im))
    return ic


def opaque(im):
    im = im.copy()
    im.putalpha(im.getchannel('A').point(lambda v: 255 if v else 0))
    return im


def GLOW(rel, stops=None, scale=1):
    """Nuage/effet semi-transparent rendu opaque et lumineux dans un cadre."""
    im = L(rel)
    a = im.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    im.putalpha(a)
    im = bright(im, 1.5)
    if stops:
        im = ramp(im, stops)
    return F(im, scale)


def H(rel, deg, sat=1.0, val=1.0):
    return hue(L(rel), deg, sat, val)


def spell_table():
    """slug -> (fonction de construction, source, approx)."""
    T = {}

    def s(sl, img, src, approx=None):
        T[sl] = (img, src, approx)

    # --- invocations : cadre + cercle + creature ---
    summons = {
        'air_elemental': 'AirElemental', 'angel': 'Angel', 'archangel': 'ArchAngel', 'basilisk': 'Basilisk',
        'behemoth': 'Behemoth', 'chaos_spawn': 'ChaosSpawn', 'chimera': 'Chimeras', 'cockatrice': 'Cockatrices',
        'colossus': 'Colossus', 'death_knights': 'DeathKnights', 'demon_lord': 'DemonLord', 'djinni': 'Djinn',
        'doom_bat': 'DoomBat', 'earth_elemental': 'EarthElemental', 'efreet': 'Efreet',
        'fire_elemental': 'FireElemental', 'fire_giant': 'FireGiant', 'floating_island': 'FloatingIsland',
        'ghouls': 'Ghoul', 'giant_spiders': 'GiantSpiders', 'gorgons': 'Gorgon', 'great_drake': 'GreatDrake',
        'great_wyrm': 'GreatWyrm', 'guardian_spirit': 'GuardianSpirit', 'hell_hounds': 'HellHounds',
        'hydra': 'Hydra', 'magic_spirit': 'MagicSpirit', 'nagas': 'Nagas', 'night_stalker': 'NightStalker',
        'phantom_beast': 'PhantomBeast', 'phantom_warriors': 'PhantomWarrior', 'shadow_demons': 'ShadowDemons',
        'skeletons': 'Skeleton', 'sky_drake': 'SkyDrake', 'sprites': 'Sprites', 'stone_giant': 'StoneGiant',
        'storm_giant': 'StormGiant', 'unicorns': 'Unicorn', 'war_bears': 'WarBear', 'wraith': 'Wraith',
        'gargoyles': 'Gargoyle', 'zombie_mastery': 'Zombie', 'summon_hero': 'HeroSirHarold',
        'summon_champion': 'HeroRoland', 'incarnation': 'HeroTorin',
    }
    for sl, uk in summons.items():
        s(sl, lambda uk=uk: S('unit:' + uk), 'icone d\'invocation + unit:' + uk)

    # --- Vie ---
    s('altar_of_battle', lambda: F('dngn/altars/okawaru'), 'dngn/altars/okawaru')
    s('astral_gate', lambda: F('dngn/gateways/starry_portal'), 'dngn/gateways/starry_portal')
    s('bless', lambda: F(opaque(L('player/halo/halo_player')), 1), 'player/halo/halo_player')
    s('charm_of_life', lambda: F('item/amulet/artefact/urand_vitality'), 'item/amulet/artefact/urand_vitality')
    s('consecration', lambda: F('dngn/altars/shining_one'), 'dngn/altars/shining_one')
    s('crusade', lambda: F('item/armour/shields/large_shield1'), 'item/armour/shields/large_shield1')
    s('dispel_evil', lambda: I(GS + 'necromancy/dispel_undead'), GS + 'necromancy/dispel_undead')
    s('endurance', lambda: F('item/armour/boots2_jackboots'), 'item/armour/boots2_jackboots')
    s('healing', lambda: I(GS + 'poison/cure_poison'), GS + 'poison/cure_poison')
    s('heavenly_light', lambda: F('dngn/gateways/exit_pandemonium'), 'dngn/gateways/exit_pandemonium')
    s('heroism', lambda: F('item/armour/headgear/helmet_art3'), 'item/armour/headgear/helmet_art3')
    s('high_prayer', lambda: F('dngn/altars/zin'), 'dngn/altars/zin')
    s('holy_armor', lambda: F('item/armour/artefact/urand_dragon_king'), 'item/armour/artefact/urand_dragon_king')
    s('holy_arms', lambda: F('item/weapon/artefact/urand_order'), 'item/weapon/artefact/urand_order')
    s('holy_weapon', lambda: INV('gui/invocations/tso_bless_weapon'), 'gui/invocations/tso_bless_weapon')
    s('holy_word', lambda: F('item/scroll/i-holy_word'), 'item/scroll/i-holy_word')
    s('inspirations', lambda: F('item/misc/misc_lamp'), 'item/misc/misc_lamp', 'lampe = inspiration')
    s('invulnerability', lambda: F('item/armour/shields/large_shield3'), 'item/armour/shields/large_shield3')
    s('just_cause', lambda: F('dngn/statues/statue_sword'), 'dngn/statues/statue_sword', 'statue a l\'epee = juste cause')
    s('life_force', lambda: F(crop_heart(), 3), 'misc/icons/heart (x3)')
    s('lion_heart', lambda: F('UNUSED/monsters/shedu'), 'UNUSED/monsters/shedu', 'lion aile (shedu)')
    s('mass_healing', lambda: INV('gui/invocations/elyvilon_heal_other'), 'gui/invocations/elyvilon_heal_other')
    s('planar_seal', lambda: F('dngn/gateways/enter_zot_closed'), 'dngn/gateways/enter_zot_closed', 'portail scelle')
    s('planar_travel', lambda: I(GS + 'translocation/passage_of_golubria'), GS + 'translocation/passage_of_golubria')
    s('plane_shift', lambda: F('dngn/gateways/portal'), 'dngn/gateways/portal')
    s('prayer', lambda: F('dngn/altars/elyvilon'), 'dngn/altars/elyvilon')
    s('prosperity', lambda: F('item/gold/10'), 'item/gold/10')
    s('raise_dead', lambda: I(GS + 'necromancy/borgnjors_revivification'), GS + 'necromancy/borgnjors_revivification')
    s('resurrection', lambda: ramp(I(GS + 'necromancy/twisted_resurrection'), [(0, (0, 0, 0)), (0.3, (120, 90, 20)), (0.7, (240, 210, 110)), (1, (255, 255, 230))], only=not_gray), GS + 'necromancy/twisted_resurrection recolore or')
    s('righteousness', lambda: F('dngn/statues/statue_angel'), 'dngn/statues/statue_angel')
    s('star_fires', lambda: F('UNUSED/monsters/silver_star'), 'UNUSED/monsters/silver_star')
    s('stream_of_life', lambda: F('dngn/sparkling_fountain'), 'dngn/sparkling_fountain')
    s('tranquility', lambda: F('UNUSED/spells/components/bird'), 'UNUSED/spells/components/bird', 'colombe = tranquillite')
    s('true_light', lambda: F('player/hand1/misc/light_yellow', 2), 'player/hand1/misc/light_yellow (x2)')
    s('true_sight', lambda: F('item/ring/i-see-invis', 2), 'item/ring/i-see-invis (x2)')

    # --- Mort ---
    s('animate_dead', lambda: I(GS + 'necromancy/animate_dead'), GS + 'necromancy/animate_dead')
    s('berserk', lambda: I(GS + 'enchantment/berserker_rage'), GS + 'enchantment/berserker_rage')
    s('black_channels', lambda: I(GS + 'necromancy/death_channel'), GS + 'necromancy/death_channel')
    s('black_prayer', lambda: INV('gui/invocations/kiku_necronomicon'), 'gui/invocations/kiku_necronomicon')
    s('black_sleep', lambda: ramp(I(GS + 'ice/ensorcelled_hibernation'), DARKPURPLE, only=not_gray), GS + 'ice/ensorcelled_hibernation recolore')
    s('black_wind', lambda: ramp(I(GS + 'air/airstrike'), DARKPURPLE, only=not_gray), GS + 'air/airstrike recolore')
    s('cloak_of_fear', lambda: F('item/armour/artefact/urand_night'), 'item/armour/artefact/urand_night')
    s('cloud_of_shadow', lambda: GLOW('effect/cloud_black_smoke', [(0, (10, 5, 20)), (0.5, (70, 50, 100)), (1, (170, 150, 200))]), 'effect/cloud_black_smoke')
    s('cruel_unminding', lambda: F('gui/spells/monster/brain_feed', 1), GS + 'monster/brain_feed')
    s('cursed_lands', lambda: F(comp('dngn/floor/green_bones05', (L('mon/undead/flying_skull'), 0, 0)), 1), 'dngn/floor/green_bones05 + mon/undead/flying_skull')
    s('darkness', lambda: I(GS + 'enchantment/darkness'), GS + 'enchantment/darkness')
    s('dark_rituals', lambda: F('dngn/altars/kikubaaqudgha'), 'dngn/altars/kikubaaqudgha')
    s('death_spell', lambda: I(GS + 'necromancy/symbol_of_torment'), GS + 'necromancy/symbol_of_torment')
    s('death_wish', lambda: F('mon/undead/flying_skull'), 'mon/undead/flying_skull')
    s('drain_power', lambda: I(GS + 'necromancy/sublimation_of_blood'), GS + 'necromancy/sublimation_of_blood')
    s('eternal_night', lambda: F('UNUSED/other/eye_filled_portal'), 'UNUSED/other/eye_filled_portal')
    s('evil_omens', lambda: F('item/misc/misc_lantern'), 'item/misc/misc_lantern')
    s('evil_presence', lambda: F('dngn/statues/statue_ancient_evil'), 'dngn/statues/statue_ancient_evil')
    s('famine', lambda: F('item/food/chunk_rotten'), 'item/food/chunk_rotten')
    s('life_drain', lambda: I(GS + 'necromancy/vampiric_draining'), GS + 'necromancy/vampiric_draining')
    s('lycanthropy', lambda: F(CAT['unit:WereWolf']['img'], 1), 'unit:WereWolf')
    s('mana_leak', lambda: I(GS + 'necromancy/bolt_of_draining'), GS + 'necromancy/bolt_of_draining')
    s('pestilence', lambda: I(GS + 'poison/olgrebs_toxic_radiance'), GS + 'poison/olgrebs_toxic_radiance')
    s('possession', lambda: I(GS + 'enchantment/enslavement'), GS + 'enchantment/enslavement')
    s('subversion', lambda: I(GS + 'enchantment/discord'), GS + 'enchantment/discord')
    s('terror', lambda: I(GS + 'enchantment/cause_fear'), GS + 'enchantment/cause_fear')
    s('wall_of_darkness', lambda: F(ramp(L('dngn/wall/brick_gray0'), [(0, (10, 0, 20)), (0.5, (70, 35, 110)), (1, (170, 130, 210))], keep_black=False), 1), 'dngn/wall/brick_gray0 recolore pourpre')
    s('warp_node', lambda: I(GS + 'translocation/gravitas'), GS + 'translocation/gravitas')
    s('weakness', lambda: I(GS + 'necromancy/pain'), GS + 'necromancy/pain')
    s('word_of_death', lambda: I(GS + 'necromancy/deaths_door'), GS + 'necromancy/deaths_door')
    s('wrack', lambda: I(GS + 'necromancy/agony'), GS + 'necromancy/agony')
    s('wraithform', lambda: F('player/transform/shadow_form'), 'player/transform/shadow_form')

    # --- Chaos ---
    s('armageddon', lambda: INV('gui/invocations/qazlal_disaster_area'), 'gui/invocations/qazlal_disaster_area')
    s('call_chaos', lambda: GLOW('effect/cloud_mutagenic_large1'), 'effect/cloud_mutagenic_large1')
    s('call_the_void', lambda: F('dngn/gateways/enter_abyss1'), 'dngn/gateways/enter_abyss1')
    s('chaos_channels', lambda: I(GS + 'transmutation/beastly_appendage'), GS + 'transmutation/beastly_appendage')
    s('chaos_rift', lambda: F('mon/nonliving/maelstrom1'), 'mon/nonliving/maelstrom1')
    s('chaos_surge', lambda: I(GS + 'conjuration/fulminant_prism'), GS + 'conjuration/fulminant_prism')
    s('corruption', lambda: I(GS + 'necromancy/corpse_rot'), GS + 'necromancy/corpse_rot')
    s('disintegrate', lambda: I(GS + 'transmutation/irradiate'), GS + 'transmutation/irradiate')
    s('disrupt', lambda: I(GS + 'earth/lees_rapid_deconstruction'), GS + 'earth/lees_rapid_deconstruction')
    s('doom_bolt', lambda: I(GS + 'conjuration/orb_of_destruction'), GS + 'conjuration/orb_of_destruction')
    s('doom_mastery', lambda: F('item/misc/runes/rune_gehenna'), 'item/misc/runes/rune_gehenna')
    s('eldritch_weapon', lambda: I(GS + 'translocation/warp_weapon'), GS + 'translocation/warp_weapon')
    s('fireball', lambda: I(GS + 'fire/fireball'), GS + 'fire/fireball')
    s('fire_bolt', lambda: I(GS + 'fire/bolt_of_fire'), GS + 'fire/bolt_of_fire')
    s('fire_storm', lambda: I(GS + 'fire/fire_storm'), GS + 'fire/fire_storm')
    s('flame_blade', lambda: F('item/weapon/artefact/urand_flaming_death'), 'item/weapon/artefact/urand_flaming_death')
    s('flame_strike', lambda: I(GS + 'fire/ring_of_flames'), GS + 'fire/ring_of_flames')
    s('great_wasting', lambda: I(GS + 'earth/sandblast'), GS + 'earth/sandblast')
    s('immolation', lambda: I(GS + 'fire/inner_flame'), GS + 'fire/inner_flame')
    s('lightning_bolt', lambda: I(GS + 'air/lightning_bolt'), GS + 'air/lightning_bolt')
    s('magic_vortex', lambda: F('mon/nonliving/spatial_vortex1'), 'mon/nonliving/spatial_vortex1')
    s('metal_fires', lambda: F('item/weapon/artefact/urand_firestarter'), 'item/weapon/artefact/urand_firestarter')
    s('meteor_storms', lambda: I(GS + 'fire/bolt_of_magma'), GS + 'fire/bolt_of_magma')
    s('raise_volcano', lambda: F('dngn/gateways/volcano_exit'), 'dngn/gateways/volcano_exit')
    s('shatter', draw_shatter_icon, 'item/weapon/long_sword1 brisee (composition)')
    s('wall_of_fire', lambda: I(GS + 'fire/conjure_flame'), GS + 'fire/conjure_flame')
    s('warp_creature', lambda: F(GS + 'monster/polymorph', 1), GS + 'monster/polymorph (recadre)')
    s('warp_lightning', lambda: H(GS + 'air/lightning_bolt', 120), GS + 'air/lightning_bolt teinte')
    s('warp_reality', lambda: I(GS + 'translocation/dispersal'), GS + 'translocation/dispersal')
    s('warp_wood', lambda: I(GS + 'summoning/sticks_to_snakes'), GS + 'summoning/sticks_to_snakes')

    # --- Nature ---
    s('call_lightning', lambda: I(GS + 'air/chain_lightning'), GS + 'air/chain_lightning')
    s('change_terrain', lambda: I(GS + 'earth/dig'), GS + 'earth/dig')
    s('cracks_call', lambda: I(GS + 'earth/shatter'), GS + 'earth/shatter')
    s('earth_gate', lambda: F('dngn/gateways/stone_arch'), 'dngn/gateways/stone_arch')
    s('earthquake', lambda: INV('gui/invocations/qazlal_upheaval'), 'gui/invocations/qazlal_upheaval')
    s('earth_to_mud', lambda: I(GS + 'earth/ledas_liquefaction'), GS + 'earth/ledas_liquefaction')
    s('elemental_armor', lambda: INV('gui/invocations/qazlal_elemental_force'), 'gui/invocations/qazlal_elemental_force')
    s('entangle', lambda: F('mon/fungi_plants/briar_patch'), 'mon/fungi_plants/briar_patch')
    s('gaias_blessing', lambda: I(GS + 'summoning/summon_forest'), GS + 'summoning/summon_forest')
    s('giant_strength', lambda: F('UNUSED/spells/components/hand3'), 'UNUSED/spells/components/hand3')
    s('herb_mastery', lambda: F('UNUSED/monsters/thorn_lotus'), 'UNUSED/monsters/thorn_lotus')
    s('ice_bolt', lambda: I(GS + 'ice/throw_icicle'), GS + 'ice/throw_icicle')
    s('ice_storm', lambda: I(GS + 'ice/ice_storm'), GS + 'ice/ice_storm')
    s('iron_skin', lambda: I(GS + 'earth/statue_form'), GS + 'earth/statue_form')
    s('move_fortress', lambda: F(draw_keep(), 1), 'forteresse dessinee', 'forteresse dessinee (pas d\'icone de deplacement)')
    s('natures_awareness', lambda: F('UNUSED/monsters/raven'), 'UNUSED/monsters/raven')
    s('natures_cures', lambda: H(GS + 'poison/cure_poison', 120), GS + 'poison/cure_poison teinte vert')
    s('natures_eye', lambda: F('mon/eyes/eye_of_devastation'), 'mon/eyes/eye_of_devastation')
    s('natures_wrath', lambda: I(GS + 'air/tornado'), GS + 'air/tornado')
    s('pathfinding', lambda: F('gui/commands/find_waypoint'), 'gui/commands/find_waypoint')
    s('petrify', lambda: I(GS + 'earth/petrify'), GS + 'earth/petrify')
    s('regeneration', lambda: I(GS + 'necromancy/regeneration'), GS + 'necromancy/regeneration')
    s('resist_elements', lambda: F('item/armour/artefact/urand_salamander'), 'item/armour/artefact/urand_salamander')
    s('stone_skin', lambda: I(GS + 'earth/stoneskin'), GS + 'earth/stoneskin')
    s('transmute', lambda: F('item/misc/misc_phial'), 'item/misc/misc_phial', 'fiole d\'alchimiste')
    s('wall_of_stone', lambda: F('dngn/wall/stone2_gray0', 1), 'dngn/wall/stone2_gray0')
    s('water_walking', lambda: water_walking_icon(), 'dngn/water/shallow_water + item/armour/boots1_brown')
    s('web', lambda: F('item/weapon/ranged/throwing_net'), 'item/weapon/ranged/throwing_net')
    s('earth_lore', lambda: F('item/scroll/i-magic_mapping'), 'item/scroll/i-magic_mapping')
    # sorts du jeu absents du grimoire imprime (presents dans data/spells.js)
    s('blur', lambda: I(GS + 'air/repel_missiles'), GS + 'air/repel_missiles')
    s('spell_of_return', return_icon, 'dngn/gateways/portal + forteresse dessinee')

    # --- Sorcellerie ---
    s('aura_of_majesty', lambda: F('item/armour/artefact/urand_dyrovepreva'), 'item/armour/artefact/urand_dyrovepreva')
    s('banish', lambda: I('UNUSED/spells/banishment'), 'UNUSED/spells/banishment')
    s('confusion', lambda: I(GS + 'enchantment/confuse'), GS + 'enchantment/confuse')
    s('counter_magic', lambda: F('item/rod/i-rod_warding', 2), 'item/rod/i-rod_warding (x2)')
    s('creature_binding', lambda: I(GS + 'necromancy/control_undead'), GS + 'necromancy/control_undead', 'controle des morts-vivants utilise pour la domination')
    s('disenchant_true', lambda: H(GS + 'summoning/mass_abjuration', 100), GS + 'summoning/mass_abjuration teinte')
    s('disjunction_true', lambda: H(GS + 'translocation/disjunction', -60), GS + 'translocation/disjunction teinte')
    s('dispel_magic_true', lambda: H('UNUSED/spells/abjuration', 100), 'UNUSED/spells/abjuration teinte')
    s('enchant_road', lambda: F('gui/commands/goto_target'), 'gui/commands/goto_target', 'chemin trace = route enchantee')
    s('flight', lambda: F(ramp(crop32(L('mon/panlord/demon_wings_sparrow')), WHITE), 1), 'mon/panlord/demon_wings_sparrow recolore')
    s('flying_fortress', lambda: flying_fortress_icon(), 'ile flottante + forteresse dessinees')
    s('great_unsummoning', lambda: I('UNUSED/spells/forceful_dismissal'), 'UNUSED/spells/forceful_dismissal')
    s('guardian_wind', lambda: I(GS + 'air/deflect_missiles'), GS + 'air/deflect_missiles')
    s('guises', lambda: I(GS + 'translocation/shroud_of_golubria'), GS + 'translocation/shroud_of_golubria')
    s('haste', lambda: I(GS + 'enchantment/haste'), GS + 'enchantment/haste')
    s('invisibility', lambda: I(GS + 'enchantment/invisibility'), GS + 'enchantment/invisibility')
    s('magic_immunity', lambda: F('item/armour/shields/lshield_louise'), 'item/armour/shields/lshield_louise')
    s('mass_invisibility', lambda: I(GS + 'translocation/phase_shift'), GS + 'translocation/phase_shift')
    s('mind_storm', lambda: I(GS + 'enchantment/mass_confusion'), GS + 'enchantment/mass_confusion')
    s('psionic_blast', lambda: I(GS + 'conjuration/iskenderuns_mystic_blast'), GS + 'conjuration/iskenderuns_mystic_blast')
    s('resist_magic', lambda: F('item/amulet/artefact/urand_brooch_of_shielding'), 'item/amulet/artefact/urand_brooch_of_shielding')
    s('spell_binding', lambda: F('item/book/metal_blue'), 'item/book/metal_blue')
    s('spell_blast', lambda: F('UNUSED/spells/orb_of_destruction_big'), 'UNUSED/spells/orb_of_destruction_big')
    s('spell_lock', lambda: F('item/book/artefact/buckle'), 'item/book/artefact/buckle')
    s('spell_ward', lambda: I(GS + 'ice/condensation_shield'), GS + 'ice/condensation_shield')
    s('stasis', lambda: I(GS + 'enchantment/slow'), GS + 'enchantment/slow')
    s('suppress_magic', lambda: I(GS + 'air/silence'), GS + 'air/silence')
    s('time_stop', lambda: I(GS + 'ice/metabolic_englaciation'), GS + 'ice/metabolic_englaciation')
    s('vertigo', lambda: I(GS + 'enchantment/confusing_touch'), GS + 'enchantment/confusing_touch')
    s('wind_mastery', lambda: I(GS + 'air/airstrike'), GS + 'air/airstrike')
    s('wind_walking', lambda: I(GS + 'air/swiftness'), GS + 'air/swiftness')
    s('word_of_recall', lambda: I(GS + 'translocation/controlled_blink'), GS + 'translocation/controlled_blink')

    # --- Arcane ---
    s('awareness', lambda: F('UNUSED/gui/divinations'), 'UNUSED/gui/divinations')
    s('create_artifact', lambda: F('item/weapon/artefact/spwpn_sword_of_power'), 'item/weapon/artefact/spwpn_sword_of_power')
    s('detect_magic', lambda: I(GS + 'conjuration/dazzling_spray'), GS + 'conjuration/dazzling_spray')
    s('disenchant_area', lambda: I(GS + 'summoning/mass_abjuration'), GS + 'summoning/mass_abjuration')
    s('disjunction', lambda: I(GS + 'translocation/disjunction'), GS + 'translocation/disjunction')
    s('dispel_magic', lambda: I('UNUSED/spells/abjuration'), 'UNUSED/spells/abjuration')
    s('enchant_item', lambda: I(GS + 'enchantment/infusion'), GS + 'enchantment/infusion')
    s('recall_hero', lambda: I(GS + 'summoning/recall'), GS + 'summoning/recall')
    s('spell_of_mastery', lambda: F('item/misc/misc_orb'), 'item/misc/misc_orb')
    s('summoning_circle', pentagram_icon, GS + 'monster/summon_minor_demon (pentagramme agrandi)')
    return T


def crop_heart():
    return L('misc/icons/heart')


def water_walking_icon():
    ic = icon_frame()
    w = L('dngn/water/shoals_shallow_water0')
    ic.paste(w.crop((3, 3, 29, 29)), (3, 3))
    b = L('item/armour/boots1_brown')
    b = b.crop(bbox(b)).resize((18, 18), Image.NEAREST)
    over(ic, outline(shift_to(b, 7, 6)))
    return ic


def shift_to(img, x, y):
    o = blank()
    o.paste(img, (x, y))
    return o


def pentagram_icon():
    ic = icon_frame()
    src = L(GS + 'monster/summon_minor_demon')
    pent = src.crop((18, 17, 32, 31))
    p = pent.load()
    for yy in range(pent.height):
        for xx in range(pent.width):
            r_, g, b_, a = p[xx, yy]
            if a and not (r_ > 90 and g < 40) and not (r_ < 110 and g < 15 and b_ < 15):
                p[xx, yy] = (0, 0, 0, 0)
    big = scale_int(pent, 2)
    over(ic, summon_disc())
    over(ic, big, 2, 1)
    return ic


def return_icon():
    ic = icon_frame()
    over(ic, clip_inner(center(L('dngn/gateways/portal'), 1)))
    small = draw_keep().resize((14, 14), Image.NEAREST)
    over(ic, small, 9, 9)
    return ic


def flying_fortress_icon():
    ic = icon_frame()
    isl = draw_island()
    over(ic, isl, 0, 2)
    k = draw_keep()
    small = k.resize((16, 16), Image.NEAREST)
    over(ic, small, 8, 1)
    return ic


def build_spells(spells):
    T = spell_table()
    seen = {}
    for raw, fixed in spells:
        sl = slug(fixed)
        if sl not in T:
            raise SystemExit('Sort sans icone : %s (%s)' % (fixed, sl))
        seen[sl] = raw
    # gargoyles / earth_lore : titres au format different dans le grimoire ;
    # blur / spell_of_return : sorts du jeu absents du grimoire imprime
    extra_ok = {'gargoyles', 'earth_lore', 'blur', 'spell_of_return'}
    for sl in sorted(set(T) - set(seen)):
        if sl not in extra_ok:
            raise SystemExit('Icone sans sort : ' + sl)
    order = [slug(f) for _, f in spells] + sorted(extra_ok)
    for sl in order:
        fn, src, approx = T[sl]
        add('spell:' + sl, fn(), src, approx)
    return seen


# =============================================================================
# 4. Terrains, arbres, lieux, objets
# =============================================================================

def swamp_tile(i):
    """Sol de marais : sol olive + flaques d'eau trouble (masque deterministe, raccordable)."""
    base = ramp(L('dngn/floor/swamp%d' % i), SWAMP, keep_black=False)
    water = ramp(L('dngn/water/shallow_water' if i % 2 == 0 else 'dngn/water/shallow_water2'),
                 [(0, (15, 30, 25)), (0.5, (45, 75, 60)), (1, (95, 130, 105))], keep_black=False)
    blobs = [[(9, 10, 5, 3), (23, 22, 6, 3), (25, 6, 3, 2)],
             [(20, 9, 6, 3), (8, 22, 5, 3), (2, 4, 3, 2)],
             [(15, 16, 7, 4), (4, 28, 3, 2), (28, 3, 3, 2)],
             [(7, 6, 4, 2), (22, 16, 5, 3), (10, 25, 6, 3)]][i]
    out = base.copy()
    po, pw = out.load(), water.load()
    for y in range(32):
        for x in range(32):
            for (cx, cy, rx, ry) in blobs:
                # distance torique pour que la tuile reste raccordable
                dx = min(abs(x - cx), 32 - abs(x - cx)) / rx
                dy = min(abs(y - cy), 32 - abs(y - cy)) / ry
                d = dx * dx + dy * dy
                if d <= 1.0:
                    po[x, y] = pw[x, y]
                elif d <= 1.45:
                    r_, g, b_, a = po[x, y]
                    po[x, y] = (int(r_ * 0.7), int(g * 0.75), int(b_ * 0.6), 255)
    return out


def build_terrain():
    def ter(kind, imgs, src, approx=None):
        for i, im in enumerate(imgs):
            add('ter:%s:%d' % (kind, i), im, src, approx)

    gr = ['grass0', 'grass1', 'grass2', 'grass_flowers_yellow1', 'grass_flowers_blue1', 'grass_flowers_red1',
          'grass_flowers_yellow2', 'grass_flowers_blue2', 'grass_flowers_red2']
    ter('grass', [L('dngn/floor/grass/' + n) for n in gr], 'dngn/floor/grass/*')
    ter('dirt', [L('dngn/floor/dirt%d' % i) for i in range(3)], 'dngn/floor/dirt0-2')
    ter('sand', [L('dngn/floor/sand%d' % i) for i in range(1, 9)], 'dngn/floor/sand1-8')
    ter('snow', [ramp(L('dngn/floor/sand%d' % i), SNOW) for i in range(1, 9)], 'dngn/floor/sand1-8 recolore neige',
        'neige derivee du sable (pas de sol enneige en DCSS)')
    ter('swamp', [swamp_tile(i) for i in range(4)], 'dngn/floor/swamp0-3 recolore olive + flaques (dngn/water/shallow_water)')
    ter('water', [L('dngn/water/shoals_deep_water%d' % i) for i in range(12)], 'dngn/water/shoals_deep_water0-11')
    ter('shallow', [L('dngn/water/shoals_shallow_water%d' % i) for i in range(12)], 'dngn/water/shoals_shallow_water0-11')
    lava = L('UNUSED/features/lava')
    ter('lava', [lava, flip(lava), lava.rotate(180), lava.transpose(Image.FLIP_TOP_BOTTOM)],
        'UNUSED/features/lava (+ symetries)', 'une seule tuile de lave : variantes par symetrie')
    ter('rock', [ramp(L('dngn/wall/lair%d' % i), ROCK) for i in range(4)], 'dngn/wall/lair0-3 recolore gris',
        'eboulis vus de dessus (pas de montagne en DCSS)')
    ter('hills', [L('dngn/wall/orc%d' % i) for i in range(4)], 'dngn/wall/orc0-3', 'bonus : collines')
    ter('ice', [ramp(L('dngn/floor/ice%d' % i), SNOW) for i in range(4)], 'dngn/floor/ice0-3 recolore', 'bonus : glace')

    # arbres : mangroves (vertes), arbres recolores en vert, puis couleurs d'automne d'origine
    trees = []
    for i in (1, 2, 3):
        trees.append((L('dngn/trees/mangrove%d' % i), 'dngn/trees/mangrove%d' % i, None))
    foliage = lambda r, g, b: (r > g + 20 or (r > 120 and g > 100 and b < 90))
    greens = [[(0, (5, 25, 5)), (0.35, (30, 85, 25)), (0.65, (70, 140, 45)), (1, (170, 215, 110))],
              [(0, (5, 20, 10)), (0.35, (25, 70, 35)), (0.65, (55, 120, 60)), (1, (140, 200, 120))],
              [(0, (10, 25, 0)), (0.35, (55, 95, 20)), (0.65, (105, 150, 40)), (1, (200, 225, 120))]]
    for j, n in enumerate(['tree1_yellow', 'tree2_yellow', 'tree1_red', 'tree2_red', 'tree1_lightred', 'tree2_lightred']):
        t = L('dngn/trees/' + n)
        trees.append((ramp(t, greens[j % 3], only=lambda r, g, b: foliage(r, g, b) and not (r < 120 and g < 80 and b < 50 and r - g < 40)),
                       'dngn/trees/%s recolore vert' % n, 'feuillage recolore en vert'))
    for n in ['tree1_yellow', 'tree2_yellow', 'tree1_red', 'tree2_red', 'tree1_lightred', 'tree2_lightred']:
        trees.append((L('dngn/trees/' + n), 'dngn/trees/' + n, None))
    for i, (im, src, ap) in enumerate(trees):
        add('tree:%d' % i, im, src, ap)


def build_features():
    add('feat:cave', L('dngn/gateways/enter_lair'), 'dngn/gateways/enter_lair')
    c1 = L('dngn/statues/crumbled_column_1')
    c3 = L('dngn/statues/crumbled_column_3')
    c4 = L('dngn/statues/crumbled_column_4')
    add('feat:ruins', comp((c4, -8, 0), (c1, 7, -2), (c3, 0, 4)), 'dngn/statues/crumbled_column_1,3,4 composees')
    add('feat:temple', draw_temple(False), 'dessine (pixel-art)')
    add('feat:keep', draw_keep(), 'dessine (pixel-art)')
    add('feat:tower', draw_tower(), 'dessine (pixel-art)')
    add('feat:dungeon', L('dngn/gateways/enter_depths'), 'dngn/gateways/enter_depths')
    add('feat:fallen_temple', draw_temple(True), 'dessine (pixel-art)')
    add('feat:portal', L('dngn/gateways/portal'), 'dngn/gateways/portal')
    add('feat:altar', L('dngn/altars/generic'), 'dngn/altars/generic')
    add('feat:statue', L('dngn/statues/statue_archer'), 'dngn/statues/statue_archer')
    # bonus
    add('feat:lair', L('dngn/gateways/enter_spider'), 'dngn/gateways/enter_spider', 'bonus : antre de monstres')
    add('feat:crypt', L('dngn/gateways/enter_crypt'), 'dngn/gateways/enter_crypt', 'bonus')


def build_items():
    IT = [
        ('sword', ['item/weapon/long_sword1', 'item/weapon/greatsword1', 'item/weapon/scimitar1', 'item/weapon/artefact/spwpn_sword_of_power']),
        ('mace', ['item/weapon/mace1', 'item/weapon/morningstar1', 'item/weapon/flail1', 'item/weapon/artefact/urand_skullcrusher']),
        ('axe', ['item/weapon/hand_axe1', 'UNUSED/weapons/war_axe4', 'UNUSED/weapons/broad_axe4', 'item/weapon/artefact/urand_axe_of_woe']),
        ('bow', ['item/weapon/ranged/longbow1', 'item/weapon/ranged/shortbow1', 'item/weapon/ranged/arbalest1', 'item/weapon/artefact/urand_storm_bow']),
        ('staff', ['item/staff/staff01', 'item/staff/staff05', 'item/staff/staff07', 'item/weapon/artefact/spwpn_staff_of_olgreb']),
        ('wand', ['item/wand/gem_gold', 'item/wand/gem_iron', 'item/wand/gem_bone', 'item/wand/gem_silver']),
        ('misc', ['item/misc/misc_lamp', 'item/misc/misc_horn', 'item/misc/misc_fan', 'item/misc/misc_box']),
        ('shield', ['item/armour/shields/large_shield1', 'item/armour/shields/shield1', 'item/armour/shields/buckler1', 'item/armour/shields/large_shield3']),
        ('chain', ['item/armour/ring_mail1', 'item/armour/scale_mail1', 'item/armour/ring_mail2']),
        ('plate', ['item/armour/plate1', 'item/armour/artefact/urand_lear', 'item/armour/gold_dragon_armour']),
        ('helm', ['item/armour/headgear/helmet1', 'item/armour/headgear/helmet2', 'item/armour/headgear/helmet_art1', 'item/armour/headgear/helmet_ego1']),
        ('amulet', ['item/amulet/celtic_blue', 'item/amulet/crystal_red', 'item/amulet/face1_gold', 'item/amulet/stone2_green']),
        ('ring', ['item/ring/ruby', 'item/ring/tourmaline', 'item/ring/artefact/urand_octoring', 'item/ring/artefact/urand_shadows']),
        ('cloak', ['item/armour/cloak1_leather', 'item/armour/cloak2', 'item/armour/cloak4']),
        ('gauntlets', ['item/armour/glove3', 'item/armour/glove4', 'item/armour/glove5']),
        ('orb', ['item/misc/misc_crystal', 'item/misc/misc_orb', 'item/misc/runes/rune_lom_lobon']),
        ('boots', ['item/armour/boots1_brown', 'item/armour/boots2_jackboots', 'item/armour/boots4_green']),
    ]
    for kind, srcs in IT:
        for i, s in enumerate(srcs):
            add('item:%s' % kind if i == 0 else 'item:%s:%d' % (kind, i), L(s), s)


# =============================================================================
# Sorties
# =============================================================================

def section_of(key):
    p = key.split(':')[0]
    if p == 'unit':
        k = key[5:]
        return 'unit:hero' if k.startswith('Hero') else 'unit'
    return p


def pack(out_dir):
    cols = 32
    rects = {}
    hashes = {}
    tiles = []
    for k in ORDER:
        im = CAT[k]['img']
        h = hashlib.sha1(im.tobytes()).hexdigest()
        if h not in hashes:
            hashes[h] = len(tiles)
            tiles.append(im)
        i = hashes[h]
        rects[k] = [(i % cols) * 32, (i // cols) * 32, 32, 32]
    for a, t in ALIASES.items():
        rects[a] = rects[t]
    rows = (len(tiles) + cols - 1) // cols
    atlas = Image.new('RGBA', (cols * 32, rows * 32), (0, 0, 0, 0))
    for i, im in enumerate(tiles):
        atlas.paste(im, ((i % cols) * 32, (i // cols) * 32))
    # pixels entierement transparents -> (0,0,0,0) pour mieux compresser
    a = atlas.getchannel('A')
    clean = Image.new('RGBA', atlas.size, (0, 0, 0, 0))
    clean.paste(atlas, (0, 0), a.point(lambda v: 255 if v else 0))
    atlas = clean
    path = os.path.join(out_dir, 'atlas.png')
    atlas.save(path, optimize=True, compress_level=9)
    with open(os.path.join(out_dir, 'atlas.json'), 'w', encoding='utf-8') as f:
        f.write('{\n')
        keys = list(rects)
        for n, k in enumerate(keys):
            f.write('  %s: [%d, %d, %d, %d]%s\n' % (json.dumps(k), *rects[k], ',' if n < len(keys) - 1 else ''))
        f.write('}\n')
    return atlas, rects, len(tiles)


def contact_sheet(out_dir):
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 10)
        hfont = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 16)
    except OSError:
        font = hfont = ImageFont.load_default()
    titles = {'unit': 'Unites', 'unit:hero': 'Heros', 'wizard': 'Sorciers', 'spell': 'Sorts', 'ter': 'Terrains',
              'tree': 'Arbres', 'feat': 'Lieux', 'item': 'Objets'}
    gmap = {}
    for k in ORDER:
        gmap.setdefault(section_of(k), []).append(k)
    groups = list(gmap.items())
    cols, cw, ch, hh = 14, 136, 92, 30
    height = 0
    for s, ks in groups:
        height += hh + ((len(ks) + cols - 1) // cols) * ch + 6
    sheet = Image.new('RGB', (cols * cw, height + 40), (34, 36, 40))
    d = ImageDraw.Draw(sheet)
    d.text((8, 8), 'Arcanes - atlas (%d cles) - libelle orange = choix approximatif' % len(ORDER), fill=(230, 230, 230), font=hfont)
    y = 40
    tile_bg = Image.new('RGB', (64, 64), (0, 0, 0))
    tb = ImageDraw.Draw(tile_bg)
    for yy in range(0, 64, 8):
        for xx in range(0, 64, 8):
            tb.rectangle([xx, yy, xx + 7, yy + 7], fill=(92, 104, 92) if (xx + yy) // 8 % 2 else (104, 116, 104))
    for s, ks in groups:
        d.text((8, y + 6), '%s (%d)' % (titles.get(s, s), len(ks)), fill=(255, 210, 120), font=hfont)
        y += hh
        for i, k in enumerate(ks):
            x0 = (i % cols) * cw
            y0 = y + (i // cols) * ch
            sheet.paste(tile_bg, (x0 + (cw - 64) // 2, y0))
            im = scale_int(CAT[k]['img'], 2)
            sheet.paste(im, (x0 + (cw - 64) // 2, y0), im)
            col = (255, 160, 60) if CAT[k]['approx'] else (225, 225, 225)
            label = k
            lines = [label] if len(label) <= 21 else [label[:21], label[21:]]
            for j, ln in enumerate(lines):
                w = d.textlength(ln, font=font)
                d.text((x0 + (cw - w) / 2, y0 + 66 + j * 11), ln, fill=col, font=font)
        y += ((len(ks) + cols - 1) // cols) * ch + 6
    sheet.save(os.path.join(out_dir, 'contact-sheet.png'), optimize=True)


def credits(out_dir, n_unique):
    lines = []
    lines.append('Arcanes - credits graphiques (atlas.png)')
    lines.append('=' * 60)
    lines.append('')
    lines.append('Source : tuiles de Dungeon Crawl Stone Soup, export "crawl/tiles"')
    lines.append('         (https://github.com/crawl/tiles), lot releases/Nov-2015.')
    lines.append('Licence : CC0 1.0 Universal (domaine public)')
    lines.append('          https://creativecommons.org/publicdomain/zero/1.0/')
    lines.append('          Les artistes ayant place leur travail sous CC0 sont listes dans ARTISTS.md du depot ;')
    lines.append('          les tuiles a licence incertaine (TILES_UNDER_UNKNOWN_LICENSE.md) sont exclues du lot.')
    lines.append('          Aucune tuile hors de releases/Nov-2015 n\'a ete utilisee.')
    lines.append('Merci aux artistes de Dungeon Crawl Stone Soup et de RLTiles.')
    lines.append('')
    lines.append('Traitements : composition en "paperdolls" (corps + equipement), recolorations,')
    lines.append('symetries, cadres d\'icones, avec Pillow (tools/build_atlas.py). Les sprites')
    lines.append('marques "dessine" ci-dessous sont du pixel-art original, egalement verses en CC0.')
    lines.append('')
    lines.append('Sprites dessines (pixel-art original) :')
    for k in ORDER:
        if CAT[k]['src'].startswith('dessine') or 'dessine' in CAT[k]['src']:
            lines.append('  %s  (%s)' % (k, CAT[k]['src']))
    lines.append('')
    lines.append('Fichiers d\'origine utilises (%d), relatifs a releases/Nov-2015/ :' % len(USED))
    for f in sorted(USED):
        lines.append('  ' + f)
    lines.append('')
    lines.append('Correspondance cle -> source :')
    for k in ORDER:
        lines.append('  %-32s %s' % (k, CAT[k]['src']))
    with open(os.path.join(out_dir, 'credits.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


def main():
    global SRC
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--src', default=DEF_SRC)
    ap.add_argument('--units', default=DEF_UNITS)
    ap.add_argument('--spellbook', default=DEF_SPELLBOOK)
    ap.add_argument('--out', default=DEF_OUT)
    a = ap.parse_args()
    SRC = a.src
    if not os.path.basename(os.path.normpath(SRC)) == 'Nov-2015':
        raise SystemExit('Le dossier source doit etre releases/Nov-2015 (lot CC0 verifie).')
    os.makedirs(a.out, exist_ok=True)

    unit_ids = parse_units(a.units)
    spells = parse_spells(a.spellbook)
    build_units(unit_ids)
    build_wizards()
    build_spells(spells)
    build_terrain()
    build_features()
    build_items()

    atlas, rects, n_unique = pack(a.out)
    contact_sheet(a.out)
    credits(a.out, n_unique)

    size = os.path.getsize(os.path.join(a.out, 'atlas.png'))
    approx = [k for k in ORDER if CAT[k]['approx']]
    print('cles : %d (+%d alias) ; tuiles uniques : %d ; atlas %dx%d ; %.0f Ko'
          % (len(ORDER), len(ALIASES), n_unique, atlas.width, atlas.height, size / 1024))
    print('unites : %d ; sorts : %d ; fichiers source : %d' % (
        sum(k.startswith('unit:') for k in ORDER), sum(k.startswith('spell:') for k in ORDER), len(USED)))
    print('approximatifs : %d' % len(approx))
    for k in approx:
        print('  %s : %s' % (k, CAT[k]['approx']))


if __name__ == '__main__':
    main()
