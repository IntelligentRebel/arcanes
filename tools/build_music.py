#!/usr/bin/env python3
"""Bande originale d'Arcanes : rend les partitions de tools/music/pieces.py en Ogg Vorbis dans assets/music/.

Prérequis (une seule fois) : pip install tinysoundfont ; SoundFont GeneralUser GS 2.0
(https://github.com/mrbumpy409/GeneralUser-GS), chemin dans ARCANES_SF2 si ailleurs que le défaut.
Usage : python3 tools/build_music.py [morceau,morceau...]
"""
import json, os, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'music'))
import numpy as np
from engine import render, encode, SR
import pieces, races
ALL = dict(pieces.PIECES, **races.PIECES)

OUT = os.path.join(ROOT, 'assets', 'music')
# fichier -> (morceau, contexte de jeu, titre affiché)
TRACKS = [
    ('titre', 'titre', 'title', 'Arcanes'),
    ('arcanus', 'terres', 'arcanus', 'Les Terres d\'Arcanus'),
    ('routes', 'routes', 'arcanus', 'Routes et royaumes'),
    ('myrror', 'myrror', 'myrror', 'Le Plan de Myrror'),
    ('combat', 'combat1', 'combat', 'Le Choc des armes'),
    ('combat2', 'combat2', 'combat', 'Sortilèges et acier'),
    ('victoire', 'victoire', 'victory', 'Victoire'),
    ('defaite', 'defaite', 'defeat', 'Défaite'),
    # thèmes des peuples : joués dans leurs cités, et sur la carte pour le peuple du joueur
    ('highmen', 'peuple-hautshommes', 'race:highmen', 'La Couronne d\'Albâtre'),
    ('orc', 'peuple-orques', 'race:orc', 'Le Pas de la Horde'),
    ('barbarian', 'peuple-barbares', 'race:barbarian', 'Le Serment des Clans'),
    ('gnoll', 'peuple-gnolls', 'race:gnoll', 'Les Rires de la Meute'),
    ('halfling', 'peuple-halfelins', 'race:halfling', 'La Fête des Collines'),
    ('highelf', 'peuple-hautselfes', 'race:highelf', 'Sous les Ramures d\'Argent'),
    ('klackon', 'peuple-klackons', 'race:klackon', 'La Ruche infinie'),
    ('lizardman', 'peuple-hommeslezards', 'race:lizardman', 'Le Marais des Anciens'),
    ('nomad', 'peuple-nomades', 'race:nomad', 'Les Caravanes du Vent'),
    ('beastmen', 'peuple-hommesbetes', 'race:beastmen', 'Le Rite des Cornes'),
    ('darkelf', 'peuple-elfesnoirs', 'race:darkelf', 'La Valse des Ombres'),
    ('draconian', 'peuple-draconiens', 'race:draconian', 'Les Ailes de Braise'),
    ('dwarf', 'peuple-nains', 'race:dwarf', 'Le Chant de l\'Enclume'),
    ('troll', 'peuple-trolls', 'race:troll', 'Le Pas des Géants'),
]


def main(only=None):
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='arcanes_music_')
    meta_path = os.path.join(ROOT, 'assets', 'music.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    total = 0
    for piece, fname, ctx, title in TRACKS:
        if only and piece not in only:
            continue
        sc = ALL[piece]()
        wav, mix = render(sc, tmp)
        size = encode(wav, os.path.join(OUT, fname + '.ogg'), q=4)
        meta[fname] = {'ctx': ctx, 'title': title, 'dur': round(len(mix) / SR, 1)}
        total += size
        print('  %-9s %-24s %5.1f s  %4d Ko' % (fname, title, len(mix) / SR, size // 1024))
    # ordre stable
    meta = {f: meta[f] for _, f, _, _ in TRACKS if f in meta}
    with open(meta_path, 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)
    print('musique :', sum(os.path.getsize(os.path.join(OUT, f + '.ogg')) for f in meta) // 1024, 'Ko au total')


if __name__ == '__main__':
    main(sys.argv[1].split(',') if len(sys.argv) > 1 else None)
