"""Archive de mise à jour entre deux versions : seulement les fichiers ajoutés ou modifiés, sous arcanes/.
Elle se décompresse par-dessus le dossier du jeu de la version précédente (publiée par .github/workflows/release.yml).
  python3 tools/update_zip.py <ancien dossier arcanes> <nouveau dossier arcanes> <sortie.zip>"""
import hashlib, os, sys, zipfile


def digest(p):
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


def tree(root):
    out = {}
    for d, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(d, f)
            out[os.path.relpath(p, root).replace('\\', '/')] = p
    return out


def main():
    old, new, dest = sys.argv[1:4]
    a, b = tree(old), tree(new)
    pick = [k for k in sorted(b) if k not in a or digest(a[k]) != digest(b[k])]
    with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as z:
        for k in pick: z.write(b[k], 'arcanes/' + k)
    print(f'{dest} : {len(pick)} fichier(s) sur {len(b)}, {os.path.getsize(dest) / 1e6:.1f} Mo')
    for k in pick: print('  ' + k)


if __name__ == '__main__':
    main()
