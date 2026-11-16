"""Ajoute ou remplace des sprites dans l'atlas complémentaire (assets/hd2.png / .json), sans reconstruire l'atlas HD.
  py tools/hd2_add.py portrait:HeroTumu=art/sarrek.png tex:criver=art/criver.png
Portraits ramenés à 160 px, textures à 384 px ; les autres images gardent leur taille. Une clé d'hd2 l'emporte sur la même clé d'hd.
Un sprite de même taille reprend sa place ; sinon il est rangé sous l'atlas existant."""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)
SIDE = {'portrait': 160, 'wizard': 160, 'tex': 384}


def main(args):
    sprites = {}
    for a in args:
        k, path = a.split('=', 1)
        im = Image.open(path).convert('RGBA')
        side = SIDE.get(k.split(':')[0])
        if side and im.size != (side, side):
            sq = min(im.size)
            im = im.crop(((im.width - sq) // 2, (im.height - sq) // 2, (im.width - sq) // 2 + sq, (im.height - sq) // 2 + sq)).resize((side, side), Image.LANCZOS)
        sprites[k] = im
    p2 = A('assets', 'hd2.json'); h2 = json.load(open(p2)); im2 = Image.open(A('assets', 'hd2.png')).convert('RGBA')
    W = im2.width; x = 0; y = im2.height + 2; row = 0; place = {}
    for k in sorted(sprites):
        sw, sh = sprites[k].size
        if k in h2 and h2[k][2] == sw and h2[k][3] == sh: place[k] = tuple(h2[k][:2]); continue
        if x + sw > W: x = 0; y += row + 2; row = 0
        place[k] = (x, y); x += sw + 2; row = max(row, sh)
    H = max([im2.height] + [place[k][1] + sprites[k].height for k in sprites])
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0)); out.paste(im2, (0, 0))
    for k, sp in sprites.items():
        out.paste(Image.new('RGBA', sp.size, (0, 0, 0, 0)), place[k]); out.paste(sp, place[k]); h2[k] = [place[k][0], place[k][1], sp.width, sp.height]
    out.save(A('assets', 'hd2.png'), optimize=True); json.dump(h2, open(p2, 'w'), separators=(',', ':'))
    print(len(sprites), 'sprites dans hd2 :', ', '.join(sorted(sprites)), '->', out.size)


if __name__ == '__main__':
    main(sys.argv[1:])
