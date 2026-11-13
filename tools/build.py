#!/usr/bin/env python3
"""Assemble Arcanes dans dist/arcanes/ : index.html (code et données) + assets/ (images).
On ouvre le jeu en double-cliquant sur dist/arcanes/index.html."""
import json, os, re, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = [
  'data/units.js', 'data/heroes.js', 'data/races.js', 'data/scouts.js', 'data/engineers.js', 'data/heroquests.js', 'data/avatar.js', 'data/buildings.js', 'data/terrain.js', 'data/spells.js', 'data/wonders.js',
  'src/core/rng.js', 'src/core/util.js',
  'src/engine/world.js', 'src/engine/units.js', 'src/engine/cities.js', 'src/engine/magic.js', 'src/engine/move.js',
  'src/engine/combat.js', 'src/engine/game.js', 'src/engine/turn.js', 'src/engine/spells.js', 'src/engine/veil.js', 'src/engine/aiintel.js', 'src/engine/ai.js', 'src/engine/aiplus.js', 'src/engine/aistrat.js', 'src/engine/diplo.js', 'src/engine/events.js', 'src/engine/chronicle.js', 'src/engine/finale.js',
  'src/ui/assets.js', 'src/ui/sound.js', 'src/ui/ui.js', 'src/ui/mapview.js', 'src/ui/city.js', 'src/ui/magicui.js', 'src/ui/combatview.js', 'src/ui/panels.js', 'src/ui/update.js', 'src/ui/savedir.js', 'src/ui/portraitanim.js', 'src/ui/setup.js', 'src/ui/main.js',
]
ASSETS = ['hd.png', 'hd2.png', 'title.jpg', 'anim.png', 'weapons.png', 'fx.png', 'portraits.png']
# pages de l'atlas d'animation (tools/build_anim.py) : anim.png, anim1.png, ...
ANIM_PAGES = ['anim.png'] + sorted((f for f in os.listdir(os.path.join(ROOT, 'assets')) if re.match(r'^anim\d+\.png$', f)), key=lambda f: int(f[4:-4]))
ASSETS += ANIM_PAGES[1:]
EXTRA = {'unit:BatteringRam': 'assets/extra/ram.png', 'rift:base': 'assets/extra/rift_base.png', 'rift:rocks': 'assets/extra/rift_rocks.png'}
EXTRA_META = {'rift': 'assets/extra/rift.json', 'portraits': 'assets/portraits.json'}   # portraits : calques des portraits animés (tools/portrait_anim.py)
def build_langs():
    """Les langues livrées : i18n/<langue>.json (hors catalogue)."""
    d = os.path.join(ROOT, 'i18n')
    return sorted(f[:-5] for f in os.listdir(d) if f.endswith('.json') and f not in ('catalog.json', 'manual.json') and not f.startswith('_')) if os.path.isdir(d) else []
def img_size(fp):
    """Largeur et hauteur d'un PNG ou d'un JPEG, lues dans l'en-tête (sans Pillow, absent des machines de GitHub)."""
    import struct
    with open(fp, 'rb') as f:
        head = f.read(26)
        if head[:8] == b'\x89PNG\r\n\x1a\n': return list(struct.unpack('>II', head[16:24]))
        if head[:2] != b'\xff\xd8': return None
        f.seek(2)
        while True:
            b = f.read(1)
            while b and b != b'\xff': b = f.read(1)
            while b == b'\xff': b = f.read(1)
            if not b: return None
            if b[0] in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                f.read(3); h, w = struct.unpack('>HH', f.read(4)); return [w, h]
            ln = struct.unpack('>H', f.read(2))[0]; f.seek(ln - 2, 1)
def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f: return f.read()
def main():
    html = read('src/ui/index.html')
    css = read('src/ui/style.css')
    # police de titres (Cinzel, licence OFL, src/ui/fonts) : intégrée en base64, les polices chargées depuis file:// étant bloquées par Chrome
    import base64
    fonts = ''
    for w in (400, 700):
        fp = os.path.join(ROOT, 'src/ui/fonts/cinzel-latin-%d-normal.woff2' % w)
        if os.path.exists(fp):
            b64 = base64.b64encode(open(fp, 'rb').read()).decode()
            fonts += "@font-face{font-family:'Cinzel';font-style:normal;font-weight:%d;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2');}\n" % (w, b64)
    css = fonts + css
    # langues : chaque texte affiché passe par __t / __tf (tools/i18n_build.js), sur une copie du code
    import subprocess
    tdir = os.path.join(ROOT, 'build', 'i18n')
    if os.path.isdir(tdir): shutil.rmtree(tdir)
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'i18n_build.js'), tdir] + JS, check=True)
    tread = lambda p: open(os.path.join(tdir, p), encoding='utf-8').read()
    js = '// ==== src/core/i18n.js\n' + read('src/core/i18n.js') + '\n' + '\n'.join('// ==== %s\n%s' % (p, tread(p)) for p in JS)
    langs = build_langs()
    # figurines d'appoint (assets/extra), intégrées en base64 : quelques Ko, sans toucher aux grands atlas
    extra = {}
    for key, rel in EXTRA.items():
        fp = os.path.join(ROOT, rel)
        if os.path.exists(fp): extra[key] = 'data:image/png;base64,' + base64.b64encode(open(fp, 'rb').read()).decode()
    meta = {k: json.loads(read(v)) for k, v in EXTRA_META.items() if os.path.exists(os.path.join(ROOT, v))}
    js = 'window.EXTRA_SPRITES = ' + json.dumps(extra) + ';\nwindow.EXTRA_META = ' + json.dumps(meta, separators=(',', ':')) + ';\n' + js
    js = js.replace('</script>', '<\\/script>')
    hd_json = json.dumps(json.loads(read('assets/hd.json')), separators=(',', ':')) if os.path.exists(os.path.join(ROOT, 'assets/hd.json')) else '{}'
    # atlas complémentaire (tools/hd_supplement.py) : les sprites ajoutés depuis la dernière livraison complète
    hd2_json = json.dumps(json.loads(read('assets/hd2.json')), separators=(',', ':')) if os.path.exists(os.path.join(ROOT, 'assets/hd2.json')) else '{}'
    # armes des figurines (tools/build_weapons.py) : leurs masques, pour faire luire les armes magiques
    weapons_json = json.dumps(json.loads(read('assets/weapons.json')), separators=(',', ':')) if os.path.exists(os.path.join(ROOT, 'assets/weapons.json')) else '{}'
    anim_json = json.dumps(json.loads(read('assets/anim.json')), separators=(',', ':')) if os.path.exists(os.path.join(ROOT, 'assets/anim.json')) else '{}'
    # effets dessinés (tools/build_fx.py) : projectiles et sol corrompu
    fx_json = json.dumps(json.loads(read('assets/fx.json')), separators=(',', ':')) if os.path.exists(os.path.join(ROOT, 'assets/fx.json')) else '{}'
    music_json = json.dumps(json.loads(read('assets/music.json')), ensure_ascii=False, separators=(',', ':')) if os.path.exists(os.path.join(ROOT, 'assets/music.json')) else '{}'
    # taille des grandes images, pour la barre de chargement
    big = ['hd.png', 'hd2.png', 'title.jpg', 'weapons.png', 'fx.png'] + ANIM_PAGES
    sizes = {'assets/' + f: os.path.getsize(os.path.join(ROOT, 'assets', f)) for f in big if os.path.exists(os.path.join(ROOT, 'assets', f))}
    html = html.replace('/*__ASSET_SIZES__*/{}', json.dumps(sizes, separators=(',', ':')))
    html = (html.replace('/*__CSS__*/', css).replace('/*__MUSIC_JSON__*/', music_json)
            .replace('/*__WEAPONS_JSON__*/', weapons_json).replace('/*__WEAPONS_PNG__*/', 'assets/weapons.png' if weapons_json != '{}' else '')
            .replace('/*__FX_JSON__*/', fx_json).replace('/*__FX_PNG__*/', 'assets/fx.png' if fx_json != '{}' else '')
            .replace('/*__ANIM_JSON__*/', anim_json).replace('/*__ANIM_PNG__*/', ','.join(['assets/' + a for a in ANIM_PAGES]) if anim_json != '{}' else '')
            .replace('/*__HD_JSON__*/', hd_json).replace('/*__HD_PNG__*/', 'assets/hd.png')
            .replace('/*__HD2_JSON__*/', hd2_json).replace('/*__HD2_PNG__*/', 'assets/hd2.png' if hd2_json != '{}' else '').replace('/*__TITLE_IMG__*/', 'assets/title.jpg')
            .replace('/*__LANGS__*/[]', json.dumps(langs)).replace('/*__JS__*/', js))
    out_dir = os.path.join(ROOT, 'dist', 'arcanes')
    # dictionnaires : dist/arcanes/lang/<langue>.js, limités aux textes du catalogue
    cat = json.load(open(os.path.join(ROOT, 'i18n', 'catalog.json'), encoding='utf-8'))
    import hashlib
    lang_sig = {}
    ldir = os.path.join(out_dir, 'lang')
    if os.path.isdir(ldir): shutil.rmtree(ldir)
    os.makedirs(ldir, exist_ok=True)
    for lg in langs:
        d = json.load(open(os.path.join(ROOT, 'i18n', lg + '.json'), encoding='utf-8'))
        d = {k: v for k, v in d.items() if k in cat and isinstance(v, str) and v}
        body = json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
        lang_sig[lg] = hashlib.sha1(body.encode('utf-8')).hexdigest()[:10]
        with open(os.path.join(ldir, lg + '.js'), 'w', encoding='utf-8') as f:
            f.write('(window.I18N_DICT = window.I18N_DICT || {})[' + json.dumps(lg) + '] = ' + body + ';\n'
                    + '(window.I18N_SIG = window.I18N_SIG || {})[' + json.dumps(lg) + '] = ' + json.dumps(lang_sig[lg]) + ';\n')
        miss = len([k for k in cat if k not in d])
        if miss: print('  langue %s : %d textes sans traduction (repli : anglais, sinon français)' % (lg, miss))
    # ce que la copie hors ligne doit contenir (src/ui/update.js, Update.verify) : chaque image avec sa taille, la signature de chaque dictionnaire
    imgs = {}
    for a in ASSETS:
        if os.path.exists(os.path.join(ROOT, 'assets', a)): imgs['assets/' + a] = img_size(os.path.join(ROOT, 'assets', a))
    for sub in ('landmarks', 'events', 'dilemmas', 'pacts', 'endgame', 'falls'):
        sdir = os.path.join(ROOT, 'assets', sub)
        if os.path.isdir(sdir):
            for f in sorted(os.listdir(sdir)):
                if f.endswith(('.jpg', '.png')): imgs['assets/%s/%s' % (sub, f)] = img_size(os.path.join(sdir, f))
    check = json.dumps({'img': {k: v for k, v in imgs.items() if v}, 'lang': lang_sig}, separators=(',', ':'))
    html = html.replace('window.EXTRA_SPRITES = ', 'window.ASSET_CHECK = ' + check + ';\nwindow.EXTRA_SPRITES = ', 1)
    os.makedirs(os.path.join(out_dir, 'assets'), exist_ok=True)
    with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f: f.write(html)
    size = len(html)
    for a in ASSETS:
        src = os.path.join(ROOT, 'assets', a)
        if os.path.exists(src):
            shutil.copyfile(src, os.path.join(out_dir, 'assets', a)); size += os.path.getsize(src)
    # illustrations des grands ouvrages et des événements (chargées à la demande)
    for sub in ('landmarks', 'events', 'dilemmas', 'pacts', 'endgame', 'falls'):
        ldir = os.path.join(ROOT, 'assets', sub)
        if os.path.isdir(ldir):
            os.makedirs(os.path.join(out_dir, 'assets', sub), exist_ok=True)
            for f in sorted(os.listdir(ldir)):
                if f.endswith(('.jpg', '.png')):
                    shutil.copyfile(os.path.join(ldir, f), os.path.join(out_dir, 'assets', sub, f)); size += os.path.getsize(os.path.join(ldir, f))
    # bande originale
    mdir = os.path.join(ROOT, 'assets', 'music')
    if os.path.isdir(mdir):
        os.makedirs(os.path.join(out_dir, 'assets', 'music'), exist_ok=True)
        for f in sorted(os.listdir(mdir)):
            if f.endswith('.ogg'):
                shutil.copyfile(os.path.join(mdir, f), os.path.join(out_dir, 'assets', 'music', f)); size += os.path.getsize(os.path.join(mdir, f))
    # licences : le code sous GPL-3.0 (LICENSE), les graphismes et la musique réservés (ASSETS.md), les composants tiers
    for src, dst in (('LICENSE', 'LICENSE.txt'), ('ASSETS.md', 'ASSETS.txt'), ('THIRD_PARTY.md', 'THIRD_PARTY.txt')):
        if os.path.exists(os.path.join(ROOT, src)): shutil.copyfile(os.path.join(ROOT, src), os.path.join(out_dir, dst))
    with open(os.path.join(ROOT, 'dist', 'bundle.js'), 'w', encoding='utf-8') as f: f.write(js)
    old = os.path.join(ROOT, 'dist', 'arcanes.html')
    if os.path.exists(old): os.remove(old)
    print('dist/arcanes/', round(size / 1024), 'Ko')
if __name__ == '__main__': main()
