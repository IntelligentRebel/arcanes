#!/usr/bin/env python3
"""Partitions de la bande originale d'Arcanes.

Leitmotiv : la quinte montante ré-la suivie d'une broderie (sol-la) puis d'une descente (si bémol-la-sol-fa).
Il traverse tous les morceaux : héroïque au titre, pastoral sur Arcanus, déformé (seconde mineure) sur Myrror,
martelé en combat, en fanfare pour la victoire, brisé pour la défaite.
"""
from engine import *

B4_ = 4  # mesure à 4 temps

# ------------------------------------------------------------------ matériau thématique (ré mineur)
THEME_A = ('D4:1 A4:2 G4:.5 A4:.5 Bb4:1.5 A4:.5 G4:1 F4:1 G4:1 D5:2 C5:.5 Bb4:.5 A4:4 '
           'D4:1 A4:2 G4:.5 A4:.5 Bb4:1.5 C5:.5 D5:1 F5:1 E5:1.5 D5:.5 C#5:1 E5:1 D5:4')
CHORDS_A = 'Dm | Bb | Gm C7 | Asus4 A | Dm | Bb Gm7 | C A7 | Dm'
CM_A = 'F4:2 D4:2 D4:2 F4:2 D4:2 E4:2 E4:2 C#4:2 F4:2 A4:2 F4:2 D4:2 E4:2 G4:2 F4:4'
THEME_B = 'F5:2 E5:1 D5:1 C5:2 A4:2 Bb4:1 C5:1 D5:1 Bb4:1 C5:4 F5:2 G5:1 A5:1 G5:2 F5:1 E5:1 D5:1 C5:1 Bb4:1 G4:1 A4:4'
HARM_B = 'A4:2 G4:1 F4:1 E4:2 C4:2 D4:1 F4:1 F4:1 D4:1 F4:2 E4:2 C5:2 D5:1 F5:1 Bb4:2 D5:1 C5:1 Bb4:1 A4:1 G4:1 D4:1 D4:2 C#4:2'
CHORDS_B = 'F F C/E Dm | Am | Bb Gm | Csus4 C | F Dm | Gm7 Gm7 Gm7 C | Bb F/A Gm Gm | Asus4 A'


def last(s, old, new):
    """remplace la dernière occurrence (la note finale d'une mélodie)"""
    i = s.rindex(old)
    return s[:i] + new + s[i + len(old):]


def at(events, t):
    """accord en vigueur au temps t"""
    return [sym for tt, d, sym in events if tt <= t + 1e-6][-1]


def roll(part, t, d, p, v0, v1, rate=.125):
    """roulement (timbales, cymbale) : frappes rapprochées en crescendo"""
    k, n = 0, int(round(d / rate))
    for k in range(n):
        part.n(t + k * rate, rate * 1.5, p, int(v0 + (v1 - v0) * k / max(1, n - 1)))


# =================================================================== 1. TITRE : « Arcanes »
def title():
    S = Score('arcanes_titre', 76, tempo=[(0, 76), (37 * 4, 76), (39 * 4, 56)], tail=6)
    b = lambda n: n * 4
    # pupitres (panoramique façon orchestre)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-1, verb=.35, legato=.06)
    vla = S.part('altos-nappe', GM['slowstr'], pan=-.1, db=-5, verb=.4, legato=.04)
    vc = S.part('violoncelles', GM['cello'], pan=.3, db=-2, verb=.3, legato=.06)
    cb = S.part('contrebasses', GM['contrabass'], pan=.4, db=-3, verb=.25)
    low8 = S.part('cordes-graves-pulsation', GM['strings'], pan=.25, db=-6, verb=.25, human=.6)
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.35, legato=.05)
    hn2 = S.part('cors-contrechant', GM['horn'], pan=-.28, db=-3, verb=.35, legato=.05)
    tpt = S.part('trompettes', GM['trumpet'], pan=.15, db=-3, verb=.32, legato=.03)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-6, verb=.3)
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-6, verb=.25)
    fl = S.part('flute', GM['flute'], pan=-.05, db=-2, verb=.4, legato=.04)
    cl = S.part('clarinette', GM['clarinet'], pan=-.12, db=-6, verb=.35, legato=.04)
    harp = S.part('harpe', GM['harp'], pan=-.45, db=-4, verb=.4, human=.7)
    cel = S.part('celesta', GM['celesta'], pan=.35, db=-6, verb=.55)
    ch = S.part('choeur', GM['choir'], pan=0, db=-5, verb=.45, width=1.3, legato=.05)
    ooh = S.part('voix-ooh', GM['oohs'], pan=0, db=-6, verb=.5, width=1.3)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-3, verb=.3, human=.5)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-8, verb=.3, human=.4)

    # ---- introduction (mesures 0-7) : mystère, appel de cor, écho de flûte
    intro = prog('Dm | Bb F/A | Gm | Asus4 A | Dm | Bb F/A | Eb | Asus4 A', 0)
    pad(vla, intro, Voicer(53, 72, 4), v=62)
    vla.env((0, .2), (b(2), .45), (b(5), .5), (b(7), .9), (b(8), .55))
    for t, d, sym in intro:
        cb.n(t, d + .05, 'D2' if t < b(6) and not sym.startswith('A') else bass_note(sym, 33, 45), 70)
    cb.env((0, .5), (b(6), .7), (b(8), 1))
    pad(ooh, intro[3:], Voicer(57, 74, 3), v=60)
    ooh.env((b(2), .2), (b(4), .7), (b(6), .8), (b(8), 1))
    arp(harp, intro, [0, 1, 2, 3, 4, 5, 4, 3], .5, 38, v=58)
    hn.mel(b(0) + .0, 'D4:1 A4:2 G4:.5 A4:.5 Bb4:2 A4:2', v=74)
    fl.mel(b(4), 'D5:1 A5:2 G5:.5 A5:.5 Bb5:2 A5:2', v=66)
    cel.mel(b(2), 'D6:.5 A5:.5 F5:.5 D5:.5 r:1 Bb5:.5 G5:.5 A5:1 E5:.5 C#6:.5 A5:2', v=60)
    cel.mel(b(6), 'Eb6:.5 Bb5:.5 G5:.5 Eb5:.5 r:1 G5:.5 Bb5:.5 A5:1 E5:.5 C#6:.5 E6:2', v=62)
    roll(tim, b(7), 4, 'A2', 30, 105, rate=1 / 6)
    roll(dr, b(7) + 1, 3, DR['cym1'], 25, 85, rate=1 / 6)

    # ---- thème, première exposition (8-15) : cors et violoncelles, cordes en nappe, harpe
    A1 = prog(CHORDS_A, b(8))
    hn.mel(b(8), THEME_A, v=86)
    vc.mel(b(8), THEME_A, v=78, tr=-12)
    pad(vla, A1, Voicer(53, 72, 4), v=64)
    bassline(cb, A1, 36, 47, v=78)
    arp(harp, A1, [0, 1, 2, 3, 4, 5, 4, 3], .5, 38, v=60)
    tim.n(b(8), 2, 'D2', 92); tim.n(b(12), 2, 'A2', 80); tim.n(b(15), 1, 'A2', 70); tim.n(b(15) + 3, 1, 'A2', 84)
    dr.n(b(8), 2, DR['cym2'], 82); dr.n(b(8), 1, DR['bd'], 92)
    cel.mel(b(11), 'A5:.5 C#6:.5 E6:1', v=55)
    roll(dr, b(15), 4, DR['sd'], 20, 70, rate=.125)

    # ---- thème, tutti (16-23)
    A2 = prog(CHORDS_A, b(16))
    tpt.mel(b(16), THEME_A, v=96)
    vln.mel(b(16), THEME_A, v=92, tr=12)
    hn2.mel(b(16), CM_A, v=88)
    pad(tbn, A2, Voicer(48, 64, 3), v=76)
    bassline(tba, A2, 33, 45, v=82)
    bassline(cb, A2, 36, 47, v=88)
    pad(ch, A2, Voicer(57, 76, 4), v=80)
    pad(vla, A2, Voicer(55, 74, 4), v=70)
    for t, d, sym in A2:
        r = bass_note(sym, 38, 50)
        for k in range(int(d * 2)):
            low8.n(t + k * .5, .4, r, 88 if k % 4 == 0 else 72)
    arp(harp, A2, [0, 2, 3, 4, 5, 6, 5, 4], .5, 38, v=66)
    for bb in (16, 20):
        dr.n(b(bb), 2, DR['cym2'], 100); dr.n(b(bb), 1, DR['bd'], 108)
    for bb in range(16, 24):
        dr.n(b(bb), 1, DR['bd'], 84 if bb % 4 else 100)
        tim.n(b(bb), 1, bass_note(at(A2, b(bb)), 38, 50), 86)
    tim.mel(b(23) + 2, 'A2:.25 A2:.25 A2:.25 A2:.25 E2:.25 E2:.25 A2:.5', v=100)

    # ---- thème B, chant des cordes (24-31)
    Bc = prog(CHORDS_B, b(24))
    vln.mel(b(24), THEME_B, v=84)
    vc.mel(b(24), HARM_B, v=74, tr=-12)
    cl.mel(b(24), HARM_B, v=64)
    fl.mel(b(28), 'F6:2 G6:1 A6:1 G6:2 F6:1 E6:1 D6:1 C6:1 Bb5:1 G5:1 A5:4', v=62)
    pad(vla, Bc, Voicer(55, 72, 4), v=64)
    pad(hn2, Bc[8:], Voicer(50, 65, 3), v=66)
    bassline(cb, Bc, 36, 47, v=76)
    arp(harp, Bc, [0, 1, 2, 3, 4, 3, 2, 1], .5, 41, v=58)
    cel.mel(b(25), 'E6:.5 C6:.5 A5:1', v=52); cel.mel(b(29), 'G6:.5 E6:.5 C6:1', v=52)
    vla.env((b(24), .8), (b(28), .8), (b(31), 1.1))
    roll(tim, b(30), 8, 'A2', 30, 110, rate=1 / 6)
    roll(dr, b(31), 4, DR['sd'], 30, 95, rate=.125)
    roll(dr, b(31) + 2, 2, DR['cym1'], 30, 90, rate=1 / 6)

    # ---- thème final, apothéose en ré majeur (32-40)
    FIN = 'Dm | Bb | Gm C7 | Asus4 A | Dm | Bb Gm7 | C A7 | D'
    A3 = prog(FIN, b(32))
    melo = THEME_A.replace('D5:4', 'D5:6')
    tpt.mel(b(32), melo, v=106)
    vln.mel(b(32), melo, v=100, tr=12)
    ch.mel(b(32), melo, v=84, tr=0)
    hn2.mel(b(32), CM_A.replace('F4:4', 'F#4:6'), v=96)
    hn.mel(b(32), CM_A.replace('F4:4', 'A4:6'), v=88, tr=-12)
    A3x = A3[:-1] + [(A3[-1][0], 6, 'D')]
    pad(tbn, A3x, Voicer(48, 64, 3), v=86)
    bassline(tba, A3x, 33, 45, v=92)
    bassline(cb, A3x, 36, 47, v=96)
    pad(vla, A3x, Voicer(55, 74, 4), v=80)
    for t, d, sym in A3[:-1]:
        r = bass_note(sym, 38, 50)
        for k in range(int(d * 2)):
            low8.n(t + k * .5, .4, r, 96 if k % 4 == 0 else 80)
    low8.n(b(39), 6, 'D3', 96)
    arp(harp, A3[:-1], [0, 2, 3, 4, 5, 6, 5, 4], .5, 38, v=72)
    harp.chord(b(39), 6, ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4', 'F#4', 'A4', 'D5'], v=84, roll=.06)
    for bb in (32, 36):
        dr.n(b(bb), 2, DR['cym2'], 108); dr.n(b(bb), 1, DR['bd'], 112)
    for bb in range(32, 39):
        dr.n(b(bb), 1, DR['bd'], 90 if bb % 4 else 106)
        dr.n(b(bb) + 2, 1, DR['bd'], 76)
    tim.mel(b(32), 'D2:1 r:1 D2:1 r:1 Bb2:1 r:1 Bb2:1 r:1 G2:1 r:1 C3:1 r:1 A2:1 r:1 A2:.5 A2:.5 A2:1', v=96)
    tim.mel(b(36), 'D2:1 r:1 D2:1 r:1 Bb2:1 r:1 G2:1 r:1 C3:1 r:1 A2:.5 A2:.5 A2:.5 A2:.5', v=100)
    roll(tim, b(39), 5, 'D2', 110, 70, rate=1 / 6)
    tim.n(b(39) + 5.2, 2, 'D2', 112)
    dr.n(b(39), 3, DR['cym2'], 115); dr.n(b(39), 1, DR['bd'], 118)
    roll(dr, b(38) + 2, 2, DR['sd'], 50, 110, rate=.125)
    ch.env((b(32), .9), (b(39), 1.1))
    S.dyn = [(0, -8), (b(7), -6), (b(8), -4), (b(15), -3), (b(16), 0), (b(23), 0), (b(24), -3), (b(29), -2.5), (b(31), 0), (b(40), .5)]
    return S


# =================================================================== 2. ARCANUS : « Les Terres d'Arcanus » (sol majeur, 6/8)
ARC_A = ('G4:1 D5:.5 D5:1 E5:.5 D5:1 C5:.5 B4:1.5 C5:1 E5:.5 G5:1 F#5:.5 E5:1.5 D5:1.5 '
         'G4:1 D5:.5 D5:1 E5:.5 F#5:1 E5:.5 D5:1 B4:.5 C5:1 B4:.5 A4:1 B4:.5 G4:3')
ARC_CA = 'G | Em | C | Am D | G | D Bm | Am D7 | G'
ARC_B = ('B4:1 E5:.5 E5:1 F#5:.5 G5:1.5 F#5:1 E5:.5 D5:1 B4:.5 G4:1 A4:.5 B4:1.5 A4:1.5 '
         'B4:1 E5:.5 E5:1 F#5:.5 G5:1 A5:.5 B5:1 A5:.5 G5:1 F#5:.5 E5:1 F#5:.5 D5:3')
ARC_CB = 'Em | C D | G | Bm D | Em | C G/B | C Am | Dsus4 D'
ARC_C = ('E4:1 B4:.5 B4:1 A4:.5 C5:1.5 B4:1 A4:.5 G4:1 A4:.5 B4:1 D5:.5 B4:3 '
         'E4:1 B4:.5 B4:1 A4:.5 C5:1 D5:.5 E5:1 G5:.5 F#5:1.5 E5:1 D#5:.5 E5:3')
ARC_CC = 'Em | C Em/B | G | B7 | Em | C | Bsus4 Bsus4 Bsus4 Bsus4 Bsus4 B7 | Em'
ARC_CM = 'D4:3 E4:3 E4:3 E4:1.5 F#4:1.5 D4:3 F#4:1.5 F#4:1.5 E4:1.5 F#4:1.5 D4:3'
ARC_HB = 'G4:1.5 B4:1.5 E4:1.5 A4:1.5 B4:3 F#4:1.5 F#4:1.5 G4:1.5 B4:1.5 E5:1.5 D5:1.5 E4:1.5 C4:1.5 G4:1.5 F#4:1.5'


def gallop(part, events, lo, v=72):
    """galop de 6/8 : longue-brève-longue-brève sur la fondamentale"""
    for t, d, sym in events:
        r = bass_note(sym, lo, lo + 11)
        tt = t
        while tt < t + d - 1e-6:
            part.n(tt, .45, r, v + 10); part.n(tt + 1, .3, r, v - 8)
            tt += 1.5


def arcanus():
    S = Score('arcanus_terres', 92, meter=3, tempo=[(0, 92), (52 * 3, 92), (55 * 3, 70)], tail=6)
    b = lambda n: n * 3
    fl = S.part('flute', GM['flute'], pan=-.08, db=0, verb=.4, legato=.05)
    fl2 = S.part('flute-octave', GM['flute'], pan=-.12, db=-6, verb=.45, legato=.05)
    ob = S.part('hautbois', GM['oboe'], pan=.1, db=0, verb=.4, legato=.05)
    cl = S.part('clarinette', GM['clarinet'], pan=-.15, db=-4, verb=.38, legato=.05)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-1, verb=.38, legato=.06)
    pad_ = S.part('cordes-nappe', GM['slowstr'], pan=.0, db=-7, verb=.42, legato=.04)
    vc = S.part('violoncelles', GM['cello'], pan=.3, db=-5, verb=.3, human=.6)
    pz = S.part('pizzicati', GM['pizz'], pan=.35, db=-5, verb=.32, human=.6)
    harp = S.part('harpe', GM['harp'], pan=-.45, db=-4, verb=.4, human=.6)
    hn = S.part('cors', GM['horn'], pan=-.2, db=-2, verb=.38, legato=.05)
    ooh = S.part('voix', GM['oohs'], pan=0, db=-8, verb=.5, width=1.3)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-6, verb=.3, human=.5)
    dr = S.part('percussions', 48, drums=True, pan=.05, db=-12, verb=.3, human=.5)
    glk = S.part('glockenspiel', GM['glock'], pan=.3, db=-10, verb=.5)
    V = Voicer(55, 72, 4)

    def accomp(ev, harp_v=58, pz_v=70, pad_v=58, gal=False, gal_v=66):
        arp(harp, ev, [0, 1, 2, 3, 2, 1], .5, 43, v=harp_v)
        for t, d, sym in ev:
            r = bass_note(sym, 36, 47)
            pz.n(t, 1, r, pz_v)
            if d >= 3: pz.n(t + 1.5, 1, r + 7 if r + 7 <= 50 else r - 5, pz_v - 10)
        pad(pad_, ev, V, v=pad_v)
        if gal:
            gallop(vc, ev, 43, v=gal_v)

    # introduction (0-3) : harpe, nappe, appel de cor et réponse de flûte
    I = prog('G | C | G | Dsus4 D', 0, 3)
    accomp(I, harp_v=56, pz_v=0, pad_v=54)
    hn.mel(b(1), 'G4:1 D5:2', v=72); fl.mel(b(2) + 1, 'G5:.5 D6:1.5', v=60)
    glk.mel(b(3), 'D6:.5 A6:.5 G6:.5 F#6:1.5', v=50)
    # A (4-11) : flûte
    A1 = prog(ARC_CA, b(4), 3)
    fl.mel(b(4), ARC_A, v=80)
    accomp(A1, gal=True)
    # B (12-19) : hautbois, clarinette en contrechant
    B1 = prog(ARC_CB, b(12), 3)
    ob.mel(b(12), ARC_B, v=82)
    cl.mel(b(12), ARC_HB, v=66)
    accomp(B1, gal=True)
    dr.n(b(12), 1, DR['tri'], 60)
    # A' (20-27) : violons, flûte à l'octave, cors en contrechant
    A2 = prog(ARC_CA, b(20), 3)
    vln.mel(b(20), ARC_A, v=86)
    fl2.mel(b(20), ARC_A, v=70, tr=12)
    hn.mel(b(20), ARC_CM, v=70)
    accomp(A2, harp_v=62, gal=True, gal_v=70)
    for k in range(20, 28):
        dr.n(b(k) + 1.5, .5, DR['tamb'], 46)
    # C (28-35) : mi mineur, clarinette puis cordes ; plus sombre
    C1 = prog(ARC_CC, b(28), 3)
    cl.mel(b(28), ARC_C, v=82)
    accomp(C1, harp_v=56, pz_v=64, pad_v=60)
    for k in (28, 30, 32, 34):
        tim.n(b(k), 1.5, bass_note(at(C1, b(k)), 38, 50), 70)
    tim.n(b(35) - 1.5, 1, 'B2', 74)
    # liaison (36) : septième de dominante, appel de cor
    L = prog('D7', b(36), 3)
    pad(pad_, L, V, v=62); pz.n(b(36), 1, 'D3', 70)
    hn.mel(b(36), 'D4:1 A4:.5 C5:1.5', v=78)
    arp(harp, L, [0, 1, 2, 3, 4, 5], .5, 38, v=60)
    # B' (37-44) : cors et violons, voix
    B2 = prog(ARC_CB, b(37), 3)
    hn.mel(b(37), ARC_B, v=88, tr=-12)
    vln.mel(b(37), ARC_B, v=90)
    pad(ooh, B2, Voicer(57, 74, 3), v=62)
    accomp(B2, harp_v=64, pz_v=74, pad_v=64, gal=True, gal_v=74)
    dr.n(b(37), 2, DR['cym1'], 70)
    for k in range(37, 45):
        dr.n(b(k) + 1.5, .5, DR['tamb'], 52); tim.n(b(k), 1, bass_note(at(B2, b(k)), 38, 50), 66)
    # A'' (45-52) : tutti léger, puis cadence
    A3 = prog(ARC_CA, b(45), 3)
    vln.mel(b(45), last(ARC_A, 'G4:3', 'G4:6'), v=92)
    fl.mel(b(45), last(ARC_A, 'G4:3', 'G4:6'), v=78, tr=12)
    hn.mel(b(45), last(ARC_CM, 'D4:3', 'D4:6'), v=80)
    accomp(A3[:-1], harp_v=66, pz_v=76, pad_v=66, gal=True, gal_v=76)
    for k in range(45, 52):
        dr.n(b(k) + 1.5, .5, DR['tamb'], 50)
    # fin (52-54) : sol majeur tenu, harpe en arpège
    E = [(b(52), 6, 'G')]
    pad(pad_, E, V, v=64); pad(ooh, E, Voicer(57, 74, 3), v=58)
    pz.n(b(52), 2, 'G2', 72); vc.n(b(52), 6, 'G2', 70)
    harp.chord(b(52), 6, ['G2', 'D3', 'G3', 'B3', 'D4', 'G4', 'B4', 'D5', 'G5'], v=70, roll=.08)
    glk.mel(b(52) + 2, 'D6:1 G6:3', v=50)
    dr.n(b(52), 2, DR['tri'], 56)
    S.dyn = [(0, -6), (b(4), -3), (b(12), -2), (b(20), 0), (b(28), -3), (b(36), -2), (b(37), 0), (b(52), 0), (b(55), -2)]
    S.eq = [('peak', 300, -2, .8), ('high', 6000, 4, .7)]
    return S


# =================================================================== 3. ARCANUS : « Routes et royaumes » (la dorien, 3/4)
R_A = 'A4:1 E5:2 D5:1 E5:.5 F#5:.5 E5:1 C5:1.5 B4:.5 A4:1 B4:3 A4:1 E5:2 D5:1 E5:.5 F#5:.5 G5:1 F#5:1.5 E5:.5 D5:1 E5:3'
R_CA = 'Am | D | Am | Em | Am | D D G | Bm Bm G | Em'
R_B = 'C5:1 G5:2 F#5:1 E5:.5 D5:.5 E5:1 G5:1.5 F#5:.5 E5:1 D5:3 C5:1 G5:2 A5:1 G5:.5 F#5:.5 E5:1 D5:1.5 C5:.5 B4:1 A4:3'
R_CB = 'C | D D Em | Em | G | C | D D Em | G G Em | Am'
R_HB = 'E4:1 C5:2 A4:2 B4:1 B4:3 B4:3 E4:1 C5:2 F#4:2 G4:1 B4:1.5 A4:.5 G4:1 E4:3'
R_CM = 'C4:3 F#4:2 G4:1 E4:3 G4:3 C4:3 F#4:2 E4:1 D4:2 E4:1 A3:3'


def routes():
    S = Score('arcanus_routes', 76, meter=3, tempo=[(0, 76), (44 * 3, 76), (47 * 3, 60)], tail=6)
    b = lambda n: n * 3
    eh = S.part('cor-anglais', GM['ehorn'], pan=.08, db=0, verb=.42, legato=.06)
    fl = S.part('flute', GM['flute'], pan=-.1, db=-1, verb=.42, legato=.05)
    cl = S.part('clarinette', GM['clarinet'], pan=-.18, db=-5, verb=.4, legato=.05)
    vc = S.part('violoncelle', GM['cello'], pan=.28, db=-1, verb=.38, legato=.07)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-2, verb=.4, legato=.07)
    pad_ = S.part('cordes-nappe', GM['slowstr'], pan=0, db=-8, verb=.45, legato=.04)
    cb = S.part('contrebasses', GM['contrabass'], pan=.38, db=-6, verb=.3)
    harp = S.part('harpe', GM['harp'], pan=-.4, db=-3, verb=.42, human=.6)
    gtr = S.part('guitare', GM['nylon'], pan=.3, db=-9, verb=.35, human=.7)
    hn = S.part('cor', GM['horn'], pan=-.22, db=-6, verb=.42, legato=.05)
    cel = S.part('celesta', GM['celesta'], pan=.35, db=-8, verb=.55)
    V = Voicer(55, 71, 4)

    def accomp(ev, hv=58, pv=56, bv=66, guitar=False):
        arp(harp, ev, [0, 1, 2, 3, 2, 1], .5, 45, v=hv)
        pad(pad_, ev, V, v=pv)
        for t, d, sym in ev:
            if t == int(t) and (t % 3 == 0):
                cb.n(t, 3.05, bass_note(sym, 36, 47), bv)
        if guitar:
            for t, d, sym in ev:
                tl = tones(sym, 52)
                tt = t
                while tt < t + d - 1e-6:
                    gtr.chord(tt + 1 if tt + 1 < t + d else tt, .9, tl[1:4], v=52, roll=.03)
                    tt += 3 if d >= 3 else d

    I = prog('Am | D | Am | Em', 0, 3)
    accomp(I, hv=54, pv=50)
    cel.mel(b(2), 'E6:1 A6:2 B6:1 G6:2', v=52)
    A1 = prog(R_CA, b(4), 3); eh.mel(b(4), R_A, v=84); accomp(A1)
    B1 = prog(R_CB, b(12), 3); fl.mel(b(12), R_B, v=80); vc.mel(b(12), R_CM, v=66); accomp(B1, guitar=True)
    A2 = prog(R_CA, b(20), 3); vc.mel(b(20), R_A, v=86, tr=-12); accomp(A2, hv=60, guitar=True)
    cel.mel(b(21), 'A6:1 E6:2', v=50); cel.mel(b(25), 'D6:1 A6:1 B6:1', v=50)
    B2 = prog(R_CB, b(28), 3); vln.mel(b(28), R_B, v=86); cl.mel(b(28), R_HB, v=68)
    pad(hn, B2, Voicer(50, 64, 3), v=58); accomp(B2, hv=62, pv=60, bv=70, guitar=True)
    A3 = prog(R_CA, b(36), 3)
    eh.mel(b(36), R_A, v=86); fl.mel(b(36), R_A, v=70, tr=12); accomp(A3, hv=60, pv=58, guitar=True)
    # coda : cadence dorienne (ré majeur -> la mineur)
    C = prog('D | Am | D | Am', b(44), 3)
    accomp(C[:3], hv=56, pv=56)
    eh.mel(b(44), 'F#5:1.5 E5:1.5 E5:3 D5:1 E5:.5 F#5:.5 E5:1', v=72)
    pad(pad_, [(b(47), 6, 'Am')], V, v=56); cb.n(b(47), 6, 'A2', 64)
    harp.chord(b(47), 6, ['A2', 'E3', 'A3', 'C4', 'E4', 'A4', 'C5', 'E5'], v=62, roll=.1)
    cel.mel(b(47) + 1, 'E6:1 A6:3', v=46)
    S.dyn = [(0, -5), (b(4), -2), (b(12), -1), (b(28), 0), (b(36), 0), (b(44), -2), (b(48), -4)]
    S.eq = [('peak', 300, -2, .8), ('high', 6000, 5, .7)]
    return S


# =================================================================== 4. MYRROR : « Le Plan de Myrror » (ré phrygien, médiantes chromatiques)
MY_A = ('D4:1 A4:2 Bb4:.5 A4:.5 Eb4:2 D4:2 F4:1 Bb4:2 Ab4:.5 F4:.5 Db4:4 '
        'D4:1 A4:2 Bb4:.5 A4:.5 C5:1.5 Bb4:.5 A4:1 G4:1 Bb4:1.5 A4:.5 G4:1 E4:1 A4:4')
MY_CA = 'Dm | Eb/D Dm | Bbm | Bbm | Dm | Dm7 Dm7 Dm7 Gm | Gm Gm Gm Gm6 | Asus4 A'
MY_B = 'A4:2 D5:2 C#5:3 A4:1 D5:2 F5:2 F5:3 Db5:1 D5:2 Bb4:2 G4:2 D5:2 Db5:2 F5:1 Db5:1 E5:2 C#5:2'
MY_CB = 'Dm | F#m | Dm | Bbm | Gm | Ebmaj7 | Bbm | Asus4 A'


def myrror():
    S = Score('myrror', 58, tempo=[(0, 58), (34 * 4, 58), (38 * 4, 50)], tail=8)
    b = lambda n: n * 4
    cb = S.part('contrebasses', GM['contrabass'], pan=.3, db=-3, verb=.35, legato=.02)
    drone = S.part('cordes-graves', GM['slowstr'], pan=.15, db=-6, verb=.45)
    glass = S.part('verre', GM['glass'], pan=-.1, db=-9, verb=.6, width=1.4)
    halo = S.part('halo', GM['halo'], pan=.1, db=-14, verb=.6, width=1.5)
    cl = S.part('clarinette', GM['clarinet'], pan=-.15, db=-1, verb=.5, legato=.06)
    eh = S.part('cor-anglais', GM['ehorn'], pan=.1, db=-1, verb=.5, legato=.06)
    ooh = S.part('choeur', GM['oohs'], pan=0, db=-2, verb=.6, width=1.4, legato=.06)
    trem = S.part('cordes-tremolo', GM['trem'], pan=-.25, db=-10, verb=.5)
    vln = S.part('violons-aigus', GM['slowstr'], pan=-.3, db=-2, verb=.55, legato=.06)
    cel = S.part('celesta', GM['celesta'], pan=.35, db=-4, verb=.7)
    glk = S.part('glockenspiel', GM['glock'], pan=-.35, db=-12, verb=.75)
    harp = S.part('harpe', GM['harp'], pan=-.4, db=-6, verb=.6, human=.5)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-12, verb=.45)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-6, verb=.45, human=.3)
    tai = S.part('taiko', GM['taiko'], pan=.1, db=-12, verb=.6, human=.3)
    dr = S.part('cymbales', 48, drums=True, pan=0, db=-14, verb=.6)

    def base(ev, v=62, fifth=True):
        for t, d, sym in ev:
            bn = bass_note(sym, 33, 44)
            cb.n(t, d + .05, bn, v)
            if '/' not in sym:
                drone.n(t, d + .05, bn + 12, v - 6)
            if fifth and 'm' in sym.split('/')[0] and not sym.startswith('Bbm'):
                drone.n(t, d + .05, bn + 19, v - 12)

    # ouverture (0-1) : bourdon, verre, motif de célesta
    O = prog('Dm | Eb/D Dm', 0)
    base(O, 58); pad(glass, O, Voicer(57, 74, 3), v=60)
    cel.mel(0, 'D5:1 A5:2 Bb5:.5 A5:.5 Eb6:2 D6:2', v=70)
    glk.mel(1.5, 'A6:2 Bb6:.5 A6:.5 Eb6:2 D6:1.5', v=44)
    # A (2-9) : clarinette grave
    A1 = prog(MY_CA, b(2))
    cl.mel(b(2), MY_A, v=78)
    base(A1, 62); pad(glass, A1, Voicer(57, 74, 3), v=58); pad(halo, A1, Voicer(50, 67, 3), v=54)
    arp(harp, A1, [5, None, 4, None, 6, None, 5, None], .5, 50, v=40)
    # B (10-17) : chœur, trémolos, battement de timbales
    B1 = prog(MY_CB, b(10))
    ooh.mel(b(10), MY_B, v=76)
    base(B1, 66); pad(trem, B1, Voicer(60, 79, 4), v=56)
    trem.env((b(10), .5), (b(14), 1), (b(17), .6))
    for k in range(10, 18):
        bn = bass_note(at(B1, b(k)), 38, 49)
        tim.n(b(k), .5, bn, 58); tim.n(b(k) + .6, .5, bn, 44)
    roll(dr, b(9) + 1, 3, DR['cym1'], 12, 55, rate=1 / 6)
    # A' (18-25) : cor anglais, célesta en cloches, trombones pianissimo
    A2 = prog(MY_CA, b(18))
    eh.mel(b(18), MY_A, v=80)
    base(A2, 62); pad(glass, A2, Voicer(57, 74, 3), v=60)
    pad(tbn, A2, Voicer(45, 60, 3), v=52)
    arp(cel, A2, [2, None, 3, 1, None, 4, None, None], .5, 62, v=50)
    for k in (18, 22):
        tai.n(b(k), 1, 'A2', 70); tai.n(b(k) + 3, 1, 'A2', 50)
    # B' (26-33) : violons aigus, chœur en nappe, crescendo puis retrait
    B2 = prog(MY_CB, b(26))
    vln.mel(b(26), MY_B, v=80, tr=12)
    vln.env((b(26), .7), (b(30), 1.15), (b(33), .8))
    base(B2, 68); pad(ooh, B2, Voicer(55, 72, 4), v=64); pad(trem, B2, Voicer(48, 64, 3), v=58)
    arp(harp, B2, [0, 2, 3, 4, 5, 4, 3, 2], .5, 38, v=52)
    for k in range(26, 34):
        bn = bass_note(at(B2, b(k)), 38, 49)
        tim.n(b(k), .5, bn, 62); tim.n(b(k) + .6, .5, bn, 48)
    roll(dr, b(29) + 2, 2, DR['cym1'], 15, 70, rate=1 / 6)
    tai.n(b(30), 2, 'A2', 80)
    # coda (34-37) : le motif s'éteint sur le bourdon
    Cd = prog('Dm | Eb/D Dm | Dm | Dm', b(34))
    base(Cd, 56); pad(glass, Cd, Voicer(57, 74, 3), v=56)
    cel.mel(b(34), 'D5:1 A5:2 Bb5:.5 A5:.5 Eb6:2 D6:2 r:2 A5:2 D6:6', v=62)
    glk.mel(b(35) + 1.5, 'A6:2 Bb6:.5 A6:.5', v=40)
    S.dyn = [(0, -4), (b(2), -2), (b(10), 0), (b(17), -1), (b(18), -2), (b(26), -1), (b(30), 1), (b(33), -1), (b(34), -3), (b(38), -6)]
    S.eq = [('peak', 380, -2.5, .8), ('high', 6500, 3, .7)]
    return S


# =================================================================== 5. COMBAT : « Le Choc des armes » (ré mineur)
COMBAT_A = ('D4:1.5 A4:.5 A4:2 Bb4:1.5 F4:.5 F4:2 C5:1.5 G4:.5 G4:1 E4:1 F4:1 E4:1 D4:2 '
            'D4:1.5 A4:.5 A4:1 D5:1 D5:1.5 C5:.5 Bb4:1 F4:1 G4:1.5 A4:.5 Bb4:1 D5:1 C#5:2 E5:1 A4:1')
COMBAT_CA = 'Dm | Bb | C | Dm | Dm | Bb | Gm | A'


def ost332(part, events, lo, v=82, jump=True, dur=.3):
    """ostinato en croches, accents 3+3+2"""
    for t, d, sym in events:
        r = bass_note(sym, lo, lo + 11)
        for k in range(int(round(d * 2))):
            pos = int(round((t + k * .5) * 2)) % 8
            acc = pos in (0, 3, 6)
            part.n(t + k * .5, dur, r + (12 if jump and pos in (2, 5) else 0), v + (16 if acc else 0))


def drums_epic(dr, tai, t0, bars, lvl=1., fill=True):
    for k in range(bars):
        t = t0 + k * 4
        for p, v in ((0, 104), (1.5, 88), (3, 96)):
            dr.n(t + p, .5, DR['bd'], int(v * lvl)); tai.n(t + p, .5, 'A2', int((v - 8) * lvl))
        for p in (1, 3):
            dr.n(t + p, .5, DR['sd'], int(76 * lvl))
        if lvl > .9:
            tai.n(t + 3.5, .5, 'D3', int(80 * lvl))
        if fill and k == bars - 1:
            for j in range(8):
                dr.n(t + 2 + j * .25, .25, DR['sd'], int((60 + j * 6) * lvl))


def combat():
    S = Score('combat_choc', 144, tail=3)
    b = lambda n: n * 4
    low = S.part('cordes-graves-ostinato', GM['strings'], pan=.25, db=-3, verb=.2, human=.4)
    hi = S.part('violons-ostinato', GM['strings'], pan=-.35, db=-7, verb=.25, human=.4)
    vln = S.part('violons', GM['strings'], pan=-.3, db=-2, verb=.3, legato=.04)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-4, verb=.2)
    trem = S.part('tremolos', GM['trem'], pan=-.2, db=-7, verb=.35)
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.3, legato=.03)
    hn2 = S.part('cors-2', GM['horn'], pan=-.28, db=-3, verb=.3, legato=.03)
    tpt = S.part('trompettes', GM['trumpet'], pan=.15, db=-3, verb=.3, legato=.02)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-4, verb=.28)
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-5, verb=.22)
    ch = S.part('choeur', GM['choir'], pan=0, db=-5, verb=.4, width=1.3, legato=.04)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-2, verb=.28, human=.3)
    tai = S.part('taiko', GM['taiko'], pan=.05, db=-5, verb=.3, human=.3, hp=55)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-6, verb=.28, human=.3)

    def stabs(ev, v=88):
        for t, d, sym in ev:
            vo = Voicer(48, 64, 3)(sym)
            for k in range(int(round(d * 2))):
                if int(round((t + k * .5) * 2)) % 8 in (0, 3, 6):
                    tbn.chord(t + k * .5, .4, vo, v)
            tba.n(t, .45, bass_note(sym, 33, 44), v)

    # introduction (0-3) : percussions et ostinato qui monte
    I = prog('Dm | Dm | Dm | Dm', 0)
    ost332(low, I, 38, v=70)
    low.env((0, .5), (b(4), 1))
    drums_epic(dr, tai, 0, 4, lvl=.8)
    roll(tim, b(3), 4, 'A2', 40, 100, rate=.125)
    # A (4-11) : motif de combat aux cors, accords de cuivres sur les accents
    A1 = prog(COMBAT_CA, b(4))
    hn.mel(b(4), COMBAT_A, v=96)
    ost332(low, A1, 38, v=78); stabs(A1, 80)
    bassline(cb, A1, 36, 47, v=82)
    drums_epic(dr, tai, b(4), 8)
    dr.n(b(4), 2, DR['cym2'], 100)
    for k in range(4, 12):
        tim.n(b(k), .5, bass_note(at(A1, b(k)), 38, 50), 92)
    # B (12-19) : le thème d'Arcanes aux cors et trombones, chœur
    B1 = prog(CHORDS_A, b(12))
    hn.mel(b(12), THEME_A, v=98); hn2.mel(b(12), THEME_A, v=86, tr=-12)
    ost332(low, B1, 38, v=80); ost332(hi, B1, 62, v=64, jump=False)
    pad(ch, B1, Voicer(57, 76, 4), v=76)
    bassline(cb, B1, 36, 47, v=84); bassline(tba, B1, 33, 44, v=78)
    drums_epic(dr, tai, b(12), 8)
    dr.n(b(12), 2, DR['cym2'], 104)
    for k in range(12, 20):
        tim.n(b(k), .5, bass_note(at(B1, b(k)), 38, 50), 94); tim.n(b(k) + 3, .5, bass_note(at(B1, b(k) + 3), 38, 50), 80)
    # C (20-27) : rupture, pédale de ré sous mi bémol, montée
    C1 = prog('Dm | Eb/D | Dm | Eb/D | Gm | Eb | Asus4 | A', b(20))
    ost332(low, C1, 38, v=74, jump=False)
    pad(trem, C1, Voicer(62, 81, 4), v=70)
    trem.env((b(20), .5), (b(24), .8), (b(28), 1.2))
    for t, d, sym in C1:
        tbn.chord(t, d, Voicer(50, 65, 3)(sym), 70); tba.n(t, d, bass_note(sym, 33, 44), 74)
    for k in range(20, 26):
        t = b(k)
        dr.n(t, .5, DR['bd'], 100); tai.n(t, .5, 'A2', 96); tai.n(t + 2, .5, 'A2', 80)
        if k % 2: tai.n(t + 3, .25, 'D3', 70); tai.n(t + 3.5, .25, 'D3', 84)
    drums_epic(dr, tai, b(26), 2, lvl=1)
    roll(dr, b(26), 8, DR['sd'], 40, 112, rate=.125)
    roll(tim, b(27), 4, 'A2', 60, 118, rate=.125)
    ch.mel(b(24), 'D4+G4+Bb4:4 Eb4+G4+Bb4:4 E4+A4+D5:4 E4+A4+C#5:4', v=72)
    # A' (28-35) : motif aux trompettes et violons, cors à l'octave grave
    A2 = prog(COMBAT_CA, b(28))
    tpt.mel(b(28), COMBAT_A, v=100); vln.mel(b(28), COMBAT_A, v=92, tr=12); hn.mel(b(28), COMBAT_A, v=88, tr=-12)
    ost332(low, A2, 38, v=82); ost332(hi, A2, 62, v=70, jump=False); stabs(A2, 88)
    bassline(cb, A2, 36, 47, v=86)
    drums_epic(dr, tai, b(28), 8)
    dr.n(b(28), 2, DR['cym2'], 112)
    for k in range(28, 36):
        tim.n(b(k), .5, bass_note(at(A2, b(k)), 38, 50), 96)
    # D (36-43) : apothéose du thème, contrechant aux cors
    D1 = prog(CHORDS_A, b(36))
    tpt.mel(b(36), THEME_A, v=106); vln.mel(b(36), THEME_A, v=98, tr=12)
    hn.mel(b(36), CM_A, v=94); hn2.mel(b(36), CM_A, v=86, tr=-12)
    pad(ch, D1, Voicer(57, 76, 4), v=86)
    ost332(low, D1, 38, v=86); ost332(hi, D1, 62, v=72, jump=False); stabs(D1, 92)
    bassline(cb, D1, 36, 47, v=90)
    drums_epic(dr, tai, b(36), 8)
    for k in (36, 40):
        dr.n(b(k), 2, DR['cym2'], 116)
    for k in range(36, 44):
        tim.n(b(k), .5, bass_note(at(D1, b(k)), 38, 50), 100); tim.n(b(k) + 3, .5, bass_note(at(D1, b(k) + 3), 38, 50), 84)
    # E (44-47) : relance vers la boucle, finit sur la dominante
    E1 = prog('Dm | Bb | C | Asus4 A', b(44))
    ost332(low, E1, 38, v=86); stabs(E1, 96)
    hn.mel(b(44), 'D4:1.5 A4:.5 A4:2 Bb4:1.5 F4:.5 F4:2 C5:1.5 G4:.5 G4:2 D5:2 C#5:2', v=98)
    tpt.mel(b(44), 'r:4 r:4 E5:1.5 E5:.5 E5:2 E5:2 E5:2', v=96)
    bassline(cb, E1, 36, 47, v=88)
    drums_epic(dr, tai, b(44), 4)
    roll(tim, b(47), 4, 'A2', 70, 120, rate=.125)
    dr.n(b(44), 2, DR['cym2'], 110)
    S.dyn = [(0, -5), (b(4), -1), (b(12), 0), (b(20), -3), (b(26), -1), (b(28), 0), (b(48), 0)]
    S.eq = [('low', 70, -3, .7), ('peak', 350, -2, .8), ('high', 7000, 1.5, .7)]
    return S


# =================================================================== 6. COMBAT : « Sortilèges et acier » (mi mineur, 6/8)
CB2_A = ('E4:1 B4:.5 B4:1 A4:.5 C5:1 G4:.5 C5:1 E5:.5 D5:1 A4:.5 F#4:1 A4:.5 E5:1.5 D#5:1.5 '
         'E4:1 B4:.5 B4:1 A4:.5 C5:1 D5:.5 E5:1 G5:.5 A5:1 G5:.5 F#5:1 D#5:.5 E5:3')
CB2_CA = 'Em | C | D | Bsus4 B | Em | C | Am B | Em'
CB2_B = 'G5:1.5 E5:1.5 F#5:1.5 A5:1.5 B5:1 A5:.5 F#5:1.5 G5:3 E5:1.5 G5:1.5 A5:1.5 F#5:1.5 E5:3 D#5:3'
CB2_CB = 'C | D | Bm | Em | C | D | Bsus4 | B'


def gallop2(part, events, lo, v=80):
    for t, d, sym in events:
        r = bass_note(sym, lo, lo + 11)
        tt = t
        while tt < t + d - 1e-6:
            part.n(tt, .4, r, v + 12); part.n(tt + 1, .3, r, v - 6); part.n(tt + 1.5, .4, r + 12, v + 4); part.n(tt + 2.5, .3, r, v - 6)
            tt += 3


def combat2():
    S = Score('combat_sortileges', 138, meter=3, tail=3)
    b = lambda n: n * 3
    low = S.part('cordes-graves-galop', GM['strings'], pan=.25, db=-3, verb=.22, human=.4)
    hi = S.part('violons-ostinato', GM['strings'], pan=-.35, db=-8, verb=.25, human=.4)
    vln = S.part('violons', GM['strings'], pan=-.3, db=-2, verb=.32, legato=.04)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-4, verb=.2)
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.3, legato=.03)
    tpt = S.part('trompettes', GM['trumpet'], pan=.15, db=-3, verb=.3, legato=.02)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-5, verb=.28)
    ch = S.part('choeur', GM['choir'], pan=0, db=-4, verb=.42, width=1.3, legato=.04)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-3, verb=.28, human=.3)
    tai = S.part('taiko', GM['taiko'], pan=.05, db=-6, verb=.3, human=.3, hp=55)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-7, verb=.28, human=.3)

    def perc(t0, bars, lvl=1.):
        for k in range(bars):
            t = t0 + k * 3
            dr.n(t, .5, DR['bd'], int(100 * lvl)); dr.n(t + 1.5, .5, DR['bd'], int(86 * lvl))
            tai.n(t, .5, 'A2', int(94 * lvl)); tai.n(t + 1.5, .5, 'D3', int(80 * lvl)); tai.n(t + 2.5, .5, 'D3', int(70 * lvl))
            dr.n(t + 1, .5, DR['sd'], int(64 * lvl)); dr.n(t + 2.5, .5, DR['sd'], int(70 * lvl))

    def stabs(ev, v=86):
        for t, d, sym in ev:
            vo = Voicer(48, 64, 3)(sym)
            tbn.chord(t, .6, vo, v)
            if d >= 3: tbn.chord(t + 1.5, .5, vo, v - 10)

    I = prog('Em | Em | Em | Em', 0, 3)
    gallop2(low, I, 40, v=70); low.env((0, .5), (b(4), 1))
    perc(0, 4, .75); roll(tim, b(3), 3, 'B2', 40, 100, rate=.125)
    A1 = prog(CB2_CA, b(4), 3)
    hn.mel(b(4), CB2_A, v=98, tr=-12); gallop2(low, A1, 40); stabs(A1, 80)
    bassline(cb, A1, 36, 47, v=84); perc(b(4), 8)
    dr.n(b(4), 2, DR['cym2'], 100)
    for k in range(4, 12): tim.n(b(k), .5, bass_note(at(A1, b(k)), 38, 50), 92)
    B1 = prog(CB2_CB, b(12), 3)
    vln.mel(b(12), CB2_B, v=94); pad(ch, B1, Voicer(57, 76, 4), v=78)
    gallop2(low, B1, 40, v=82); bassline(cb, B1, 36, 47, v=84); perc(b(12), 8)
    arp(hi, B1, [2, 3, 4, 3, 2, 3], .5, 62, v=62, accent=10, length=.35)
    for k in range(12, 20): tim.n(b(k), .5, bass_note(at(B1, b(k)), 38, 50), 92)
    A2 = prog(CB2_CA, b(20), 3)
    tpt.mel(b(20), CB2_A, v=102); vln.mel(b(20), CB2_A, v=92, tr=12); hn.mel(b(20), CB2_A, v=90, tr=-12)
    gallop2(low, A2, 40, v=84); stabs(A2, 90); bassline(cb, A2, 36, 47, v=88); perc(b(20), 8)
    arp(hi, A2, [2, 3, 4, 3, 2, 3], .5, 62, v=66, accent=10, length=.35)
    dr.n(b(20), 2, DR['cym2'], 110)
    for k in range(20, 28): tim.n(b(k), .5, bass_note(at(A2, b(k)), 38, 50), 96)
    # C (28-35) : la mineur, chœur et ostinato aigu, montée
    C1 = prog('Am | Am | F | F | Dm | Dm | Bsus4 | B', b(28), 3)
    pad(ch, C1, Voicer(55, 74, 4), v=80); ch.env((b(28), .7), (b(36), 1.1))
    arp(hi, C1, [2, 3, 4, 3, 2, 3], .5, 62, v=70, accent=12, length=.35)
    gallop2(low, C1, 40, v=78); bassline(cb, C1, 33, 45, v=82)
    hn.mel(b(28), 'A3:3 E4:3 F4:3 C4:3 D4:3 A3:3 E4:3 D#4:3', v=90)
    for k in range(28, 36):
        tai.n(b(k), .5, 'A2', 96); dr.n(b(k), .5, DR['bd'], 100)
        if k % 2: tai.n(b(k) + 1.5, .5, 'D3', 84)
    roll(dr, b(34), 6, DR['sd'], 40, 112, rate=.125)
    roll(tim, b(35), 3, 'B2', 70, 118, rate=.125)
    B2 = prog(CB2_CB, b(36), 3)
    tpt.mel(b(36), CB2_B, v=104, tr=-12); vln.mel(b(36), CB2_B, v=98); pad(ch, B2, Voicer(57, 76, 4), v=86)
    gallop2(low, B2, 40, v=86); stabs(B2, 92); bassline(cb, B2, 36, 47, v=90); perc(b(36), 8)
    arp(hi, B2, [2, 3, 4, 3, 2, 3], .5, 62, v=70, accent=10, length=.35)
    dr.n(b(36), 2, DR['cym2'], 114)
    for k in range(36, 44): tim.n(b(k), .5, bass_note(at(B2, b(k)), 38, 50), 98)
    A3 = prog(CB2_CA, b(44), 3)
    tpt.mel(b(44), CB2_A, v=106); vln.mel(b(44), CB2_A, v=96, tr=12); hn.mel(b(44), CB2_A, v=94, tr=-12)
    pad(ch, A3, Voicer(57, 76, 4), v=82)
    gallop2(low, A3, 40, v=86); stabs(A3, 92); bassline(cb, A3, 36, 47, v=90); perc(b(44), 8)
    dr.n(b(44), 2, DR['cym2'], 114)
    for k in range(44, 52): tim.n(b(k), .5, bass_note(at(A3, b(k)), 38, 50), 98)
    E1 = prog('Em | C | Bsus4 | B', b(52), 3)
    gallop2(low, E1, 40, v=86); stabs(E1, 96); bassline(cb, E1, 36, 47, v=90); perc(b(52), 4)
    hn.mel(b(52), 'E4:1 B4:.5 B4:1 A4:.5 C5:1.5 G4:1.5 E5:3 D#5:3', v=96, tr=-12)
    roll(tim, b(55), 3, 'B2', 70, 118, rate=.125)
    S.dyn = [(0, -5), (b(4), -1), (b(12), 0), (b(20), 0), (b(28), -3), (b(34), -1), (b(36), 0), (b(56), 0)]
    S.eq = [('low', 70, -2, .7), ('peak', 350, -1.5, .8), ('high', 7000, 2, .7)]
    return S


# =================================================================== 7. JINGLES : victoire et défaite
def victoire():
    S = Score('victoire', 104, tempo=[(0, 104), (8, 104), (12, 84)], tail=6)
    tpt = S.part('trompettes', GM['trumpet'], pan=.12, db=0, verb=.35, legato=.02)
    hn = S.part('cors', GM['horn'], pan=-.2, db=-2, verb=.35)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-4, verb=.3)
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-5, verb=.25)
    vln = S.part('violons', GM['strings'], pan=-.3, db=-3, verb=.38)
    ch = S.part('choeur', GM['choir'], pan=0, db=-6, verb=.45, width=1.3)
    harp = S.part('harpe', GM['harp'], pan=-.4, db=-5, verb=.45)
    glk = S.part('glockenspiel', GM['glock'], pan=.3, db=-9, verb=.55)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-2, verb=.3)
    dr = S.part('cymbales', 48, drums=True, pan=0, db=-6, verb=.35)
    tpt.mel(0, 'D4:.333 D4:.333 D4:.334 A4:2 G4:.5 A4:.5 B4:1.5 A4:.5 C#5:1 E5:1 D5:3 A4:.5 D5:.5 F#5:6', v=104)
    ev = prog('D | G A | D | D', 0)
    ev = ev[:-1] + [(12, 6, 'D')]
    pad(hn, ev, Voicer(53, 67, 3), v=90)
    pad(tbn, ev, Voicer(45, 60, 3), v=88)
    bassline(tba, ev, 33, 45, v=92)
    pad(ch, ev[2:], Voicer(57, 76, 4), v=84)
    vln.mel(8, 'D5:.25 E5:.25 F#5:.25 G5:.25 A5:.25 B5:.25 C#6:.25 D6:.25 r:2 F#6:6', v=92)
    harp.chord(12, 6, ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4', 'F#4', 'A4', 'D5', 'F#5'], v=84, roll=.05)
    glk.mel(12, 'A6:1 D7:5', v=70)
    tim.mel(0, 'D2:1 r:2 A2:.5 A2:.5 D2:1 r:1 A2:1 A2:1', v=104)
    roll(tim, 8, 4, 'A2', 70, 112, rate=1 / 6)
    tim.n(12, 2, 'D2', 120)
    dr.n(0, 2, DR['cym2'], 104); dr.n(12, 3, DR['cym2'], 118); dr.n(12, 1, DR['bd'], 116)
    return S


def defaite():
    S = Score('defaite', 52, tempo=[(0, 52), (8, 52), (16, 42)], tail=8)
    hn = S.part('cor', GM['horn'], pan=-.15, db=0, verb=.5, legato=.06)
    st = S.part('cordes', GM['slowstr'], pan=0, db=-5, verb=.5, legato=.05)
    cb = S.part('contrebasses', GM['contrabass'], pan=.3, db=-4, verb=.4)
    harp = S.part('harpe', GM['harp'], pan=-.4, db=-6, verb=.55)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-6, verb=.45)
    ooh = S.part('voix', GM['oohs'], pan=0, db=-8, verb=.6, width=1.3)
    ev = prog('Dm | Bbm | Gm A7 | Dm', 0)
    ev = ev[:-1] + [(12, 6, 'Dm')]
    hn.mel(0, 'D4:1 A4:2 G4:.5 F4:.5 F4:2 Db4:2 D4:2 C#4:2 D4:6', v=82)
    pad(st, ev, Voicer(53, 70, 4), v=70)
    st.env((0, .7), (8, 1), (18, .6))
    pad(ooh, ev[1:], Voicer(55, 70, 3), v=60)
    bassline(cb, ev, 33, 45, v=76)
    tim.n(0, 2, 'D2', 70); roll(tim, 12, 3, 'D2', 60, 30, rate=1 / 6)
    harp.chord(12, 6, ['D2', 'A2', 'D3', 'F3', 'A3', 'D4'], v=60, roll=.12)
    S.eq = [('peak', 260, -4, .9), ('high', 6000, 3, .7)]
    return S


PIECES = {'titre': title, 'arcanus': arcanus, 'routes': routes, 'myrror': myrror, 'combat': combat, 'combat2': combat2, 'victoire': victoire, 'defaite': defaite}

if __name__ == '__main__':
    import sys, time
    out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/arcanes_music'
    for name in (sys.argv[1].split(',') if len(sys.argv) > 1 else PIECES):
        t0 = time.time()
        sc = PIECES[name]()
        wav, mix = render(sc, out)
        print('%-10s %5.1f s  pic %.2f  (%.0f s de calcul)' % (name, len(mix) / SR, np.abs(mix).max(), time.time() - t0))
