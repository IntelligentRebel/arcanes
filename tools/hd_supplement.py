"""Atlas HD complémentaire : garde l'atlas déjà livré (dist/arcanes/assets/hd.png) tel quel et range seulement les nouveaux sprites
dans assets/hd2.png, pour ne pas renvoyer 20 Mo à chaque nouvelle image. À lancer juste après tools/build_hd.py :
  py tools/build_hd.py && py tools/hd_supplement.py && py tools/build.py
L'atlas complet fraîchement construit est gardé dans art/hd_full.png / .json. Pour tout regrouper un jour dans un seul atlas :
  py tools/build_hd.py && py tools/build.py   (puis supprimer assets/hd2.*), et livrer avec --complet."""
import json, os, re, shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ROOT, *p)


def delivered_json():
    s = open(A('dist', 'arcanes', 'index.html'), encoding='utf-8').read()
    m = re.search(r'window\.HD_JSON = (\{.*?\});\n', s, re.S)
    return json.loads(m.group(1))


def main():
    # 1. l'atlas complet que build_hd vient d'écrire
    shutil.copyfile(A('assets', 'hd.png'), A('art', 'hd_full.png')); shutil.copyfile(A('assets', 'hd.json'), A('art', 'hd_full.json'))
    full = json.load(open(A('art', 'hd_full.json'))); full_img = Image.open(A('art', 'hd_full.png'))
    # 2. l'atlas livré redevient la base
    base = delivered_json()
    shutil.copyfile(A('dist', 'arcanes', 'assets', 'hd.png'), A('assets', 'hd.png'))
    json.dump(base, open(A('assets', 'hd.json'), 'w'), separators=(',', ':'))
    # 3. les sprites absents de la base, rangés en étagères
    new = sorted((k for k in full if k not in base), key=lambda k: -full[k][3])
    if not new:
        for f in ('hd2.png', 'hd2.json'):
            if os.path.exists(A('assets', f)): os.remove(A('assets', f))
        print('aucun nouveau sprite'); return
    W, x, y, row, out = 1024, 0, 0, 0, {}
    for k in new:
        w, h = full[k][2], full[k][3]
        if x + w > W: x, y, row = 0, y + row + 2, 0
        out[k] = [x, y, w, h]; x += w + 2; row = max(row, h)
    img = Image.new('RGBA', (W, y + row))
    for k, (x, y, w, h) in out.items():
        r = full[k]; img.paste(full_img.crop((r[0], r[1], r[0] + r[2], r[1] + r[3])), (x, y))
    img.save(A('assets', 'hd2.png'), optimize=True)
    json.dump(out, open(A('assets', 'hd2.json'), 'w'), separators=(',', ':'))
    print(f'{len(new)} nouveaux sprites dans assets/hd2.png ({os.path.getsize(A("assets", "hd2.png")) / 1e3:.0f} Ko) :', ', '.join(new))


if __name__ == '__main__':
    main()
