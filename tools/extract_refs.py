#!/usr/bin/env python3
"""Extrait, en pleine résolution, la figurine d'origine de chaque unité à animer (référence à joindre à ChatGPT).

Sortie : art/anim_refs/ref_<Unité>.png (fond transparent, marge de 24 px) et art/anim_refs.zip.
Usage : python3 tools/extract_refs.py HighMenSpearmen HighMenSwordsmen ...   (sans argument : les Hauts-Hommes)
"""
import os, sys, zipfile
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_hd as B

OUT = os.path.join(B.ROOT, 'art', 'anim_refs')
HIGHMEN = ['HighMenSpearmen', 'HighMenSwordsmen', 'HighMenBowmen', 'HighMenCavalry', 'HighMenPriest', 'HighMenMagician',
           'HighMenEngineer', 'HighMenSettlers', 'HighMenPikemen', 'Paladin', 'HighMenScouts']


def source_files():
    """id de planche -> chemin de l'image source (même logique de noms que build_hd)."""
    out = {}
    for d in B.SRCS:
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            key = B.norm(os.path.splitext(f)[0])
            sid = B.FILEMAP.get(key)
            mm = __import__('re').match(r'^([a-z])(\d\d) ', key)
            if not sid and mm and (mm.group(1).upper() + mm.group(2)) in B.SHEETS:
                sid = mm.group(1).upper() + mm.group(2)
            if sid and sid not in B.BAD.get(os.path.basename(d), ()) and sid not in out:
                out[sid] = os.path.join(d, f)
    return out


def main(units):
    os.makedirs(OUT, exist_ok=True)
    src = source_files()
    done = []
    for u in units:
        key = 'unit:' + u
        sheet = next((s for s in B.PROMPTS['sheets'] if key in s['keys']), None)
        if not sheet or sheet['id'] not in src:
            print('  ! introuvable :', u); continue
        img = Image.open(src[sheet['id']])
        rgba = np.asarray(img.convert('RGBA')).copy()
        comps, lab, al = B.components(rgba, len(sheet['keys']), sheet['grid'][1])
        im = B.extract(rgba, lab, al, comps[sheet['keys'].index(key)])
        m = 24
        canvas = Image.new('RGBA', (im.width + 2 * m, im.height + 2 * m), (0, 0, 0, 0))
        canvas.alpha_composite(im, (m, m))
        path = os.path.join(OUT, 'ref_' + u + '.png')
        canvas.save(path)
        done.append(path)
        print(f'  {u}: {im.width}x{im.height}')
    zp = OUT.rstrip('/\\') + '.zip'   # art/anim_refs.zip par défaut
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in done:
            z.write(p, os.path.basename(p))
    print(len(done), 'références ->', zp)


if __name__ == '__main__':
    main(sys.argv[1:] or HIGHMEN)
