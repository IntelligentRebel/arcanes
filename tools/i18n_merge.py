#!/usr/bin/env python3
"""Langues, après traduction.
  python3 tools/i18n_merge.py <langue>...   rassemble i18n/work/out/<langue>/chunk*.json (et todo*.json) dans i18n/<langue>.json
                                            (seulement les textes du catalogue ; une traduction déjà là est remplacée)
  python3 tools/i18n_merge.py --todo <langue>...   écrit i18n/work/todo_<langue>.json : les textes du catalogue encore sans
                                            traduction dans cette langue, avec leur contexte (même format que les chunks)
Le catalogue (i18n/catalog.json) est refait à chaque assemblage (tools/build.py)."""
import glob, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I = os.path.join(ROOT, 'i18n')
cat = json.load(open(os.path.join(I, 'catalog.json'), encoding='utf-8'))


def load(p):
    try: return json.load(open(p, encoding='utf-8'))
    except FileNotFoundError: return {}


def merge(lg):
    d = load(os.path.join(I, lg + '.json'))
    n = 0
    for f in sorted(glob.glob(os.path.join(I, 'work', 'out', lg, '*.json'))):
        for k, v in load(f).items():
            # un repère caché en commentaire (« <!--{1}--> ») pour contenter le contrôle : retiré
            if isinstance(v, str): v = re.sub(r'<!--\s*\{\d+\}\s*-->', '', v)
            if k in cat and isinstance(v, str) and v.strip(): d[k] = v; n += 1
    d = {k: d[k] for k in cat if k in d}
    json.dump(d, open(os.path.join(I, lg + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=False)
    print(lg, ':', len(d), '/', len(cat), 'textes traduits (' + str(n) + ' repris des fichiers de travail)')


def todo(lg):
    d = load(os.path.join(I, lg + '.json'))
    items = []
    for k, v in cat.items():
        if k in d: continue
        it = {'k': k, 'at': v['at'][0]}
        for x in ('args', 'hint', 'fr'):
            if v.get(x): it[x] = v[x]
        items.append(it)
    p = os.path.join(I, 'work', 'todo_' + lg + '.json')
    json.dump(items, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(lg, ':', len(items), 'textes à traduire ->', os.path.relpath(p, ROOT))


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--todo':
        for lg in args[1:]: todo(lg)
    else:
        for lg in args: merge(lg)
