#!/usr/bin/env python3
"""Pseudo-langue de contrôle : i18n/<langue>.json où chaque morceau de texte (entre balises) est entouré de ⟦ ⟧.
Tout texte resté en français à l'écran se voit alors d'un coup d'œil (tests/ui_i18n.py le relève).
  py tools/i18n_pseudo.py [langue=en]   (à supprimer ensuite : ce n'est pas une traduction)"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lg = sys.argv[1] if len(sys.argv) > 1 else 'en'
cat = json.load(open(os.path.join(ROOT, 'i18n', 'catalog.json'), encoding='utf-8'))
def wrap(s):
    parts = re.split(r'(<[^>]*>)', s)
    parts = [re.sub(r'\b(title|alt|placeholder)="([^"]*)"', lambda m: m.group(1) + '="⟦' + m.group(2) + '⟧"', p) if p.startswith('<') else p for p in parts]
    return ''.join(p if p.startswith('<') or not re.search(r'[A-Za-zÀ-ÿ]', p) else re.sub(r'^(\s*)(.*?)(\s*)$', lambda m: m.group(1) + '⟦' + m.group(2) + '⟧' + m.group(3), p, flags=re.S) for p in parts)
out = {k: wrap(v.get('fr', k) if k.startswith('@') else k) for k, v in cat.items()}
json.dump(out, open(os.path.join(ROOT, 'i18n', lg + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out), 'textes')
