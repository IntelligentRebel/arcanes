#!/usr/bin/env python3
"""Contrôle d'une traduction : python3 tools/i18n_check.py <langue> [chunkN ...]
Par morceau (i18n/work/out/<langue>/chunkN.json, comparé à i18n/work/chunkN.json) : clés manquantes ou en trop,
repères {0} absents ou inventés, balises HTML différentes, texte vide. Sans morceau : i18n/<langue>.json contre le catalogue.
Code de sortie 1 s'il y a des erreurs."""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = os.path.join(ROOT, 'i18n', 'work')
PH = re.compile(r'\{\d+\}')
TAG = re.compile(r'</?([a-zA-Z][\w-]*)')
GRAMMAR = re.compile(r"""\?\s*'(s|e|es|x|nt|d\\'|de |du |des |l\\'|le |la |les |une? |aux?)'\s*:|'(s|e|es|x)'\s*:\s*''|:\s*'(s|e|es|x|nt)'|\?\s*'[a-z]{1,5}'\s*:\s*'[a-z]{0,5}'\s*$""")


def check(src_items, out):
    errs, warns = [], []
    keys = [it['k'] for it in src_items]
    for k in keys:
        if k not in out: errs.append('manquante : ' + k[:80]); continue
        t = out[k]
        if not isinstance(t, str) or not t.strip(): errs.append('vide : ' + k[:80]); continue
        src = next(it for it in src_items if it['k'] == k)
        base = src.get('fr', k)
        a, b = set(PH.findall(base)), set(PH.findall(t))
        if b - a: errs.append('repère inventé ' + ','.join(sorted(b - a)) + ' : ' + k[:70])
        for p in sorted(a - b):
            i = int(p[1:-1]); expr = (src.get('args') or [''] * 99)[i] if src.get('args') and i < len(src['args']) else ''
            (warns if GRAMMAR.search(expr) else errs).append('repère absent ' + p + ' (' + expr[:40] + ') : ' + k[:70])
        if sorted(TAG.findall(base)) != sorted(TAG.findall(t)): errs.append('balises différentes : ' + k[:70])
    for k in out:
        if k not in keys: errs.append('clé en trop : ' + k[:80])
    return errs, warns


def main():
    lg = sys.argv[1]; chunks = sys.argv[2:]
    total = 0
    if chunks:
        for c in chunks:
            src = json.load(open(os.path.join(W, c + '.json'), encoding='utf-8'))
            p = os.path.join(W, 'out', lg, c + '.json')
            try: out = json.load(open(p, encoding='utf-8'))
            except Exception as e: print(c, ': JSON illisible :', e); total += 1; continue
            errs, warns = check(src, out)
            print(c, ':', len(out), 'traductions,', len(errs), 'erreur(s),', len(warns), 'avertissement(s)')
            for e in errs[:40]: print('  ERREUR', e)
            for w in warns[:10]: print('  avert.', w)
            total += len(errs)
    else:
        cat = json.load(open(os.path.join(ROOT, 'i18n', 'catalog.json'), encoding='utf-8'))
        items = [dict(k=k, **{x: v[x] for x in ('args', 'fr') if x in v}) for k, v in cat.items()]
        out = json.load(open(os.path.join(ROOT, 'i18n', lg + '.json'), encoding='utf-8'))
        errs, warns = check(items, out)
        print(lg, ':', len(out), 'traductions,', len(errs), 'erreur(s),', len(warns), 'avertissement(s)')
        for e in errs[:60]: print('  ERREUR', e)
        total = len(errs)
    sys.exit(1 if total else 0)


if __name__ == '__main__':
    main()
