"""Empaquette une mise à jour de dist/arcanes : seulement les fichiers qui ont changé depuis la dernière livraison
(la musique et les grandes images ne changent presque jamais). L'archive se décompresse par-dessus le dossier existant.
L'état livré est mémorisé dans dist/livraison.json.
  py tools/package.py v0.16.1             mise à jour (fichiers modifiés seulement, index.html toujours)
  py tools/package.py v0.16.1 --complet   tout le jeu, pour une installation neuve"""
import hashlib, json, os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dist', 'arcanes')
STATE = os.path.join(ROOT, 'dist', 'livraison.json')


def digest(p):
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    full = '--complet' in sys.argv
    version = args[0] if args else 'dev'
    sent = json.load(open(STATE)) if os.path.exists(STATE) and not full else {}
    files = {}
    for d, _, fs in os.walk(SRC):
        for f in fs:
            p = os.path.join(d, f)
            files[os.path.relpath(p, os.path.dirname(SRC)).replace('\\', '/')] = digest(p)
    pick = [k for k, v in sorted(files.items()) if full or k == 'arcanes/index.html' or sent.get(k) != v]
    out = os.path.join(ROOT, 'dist', f'arcanes-{version}' + ('-complet' if full else '') + '.zip')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for k in pick: z.write(os.path.join(os.path.dirname(SRC), k), k)
    sent.update({k: files[k] for k in pick})
    json.dump(sent, open(STATE, 'w'), indent=1, sort_keys=True)
    print(f'{out} : {len(pick)} fichier(s), {os.path.getsize(out) / 1e6:.1f} Mo')
    for k in pick: print('  ' + k)


if __name__ == '__main__':
    main()
