#!/usr/bin/env python3
"""Thèmes des peuples d'Arcanes : un morceau par race, joué dans ses cités et, pour la race du joueur, sur la carte.

Chaque thème porte la cellule du leitmotiv (la quinte montante du thème d'Arcanes), colorée par le peuple :
noble chez les Hauts-Hommes, martelée chez les Orques, en gigue chez les Halfelins, lydienne chez les Elfes,
en mode hijaz chez les Nomades, déformée en triton chez les Gnolls, chromatique chez les peuples de Myrror.
"""
import math
from engine import *
from pieces import at, roll, last, ost332, gallop2


def chk(name, mel, bars, meter=4):
    """vérifie qu'une mélodie remplit exactement ses mesures (une erreur de durée décale tout le reste)"""
    tot = bars_of(mel, meter)[0]
    if abs(tot - bars * meter) > 1e-6:
        raise ValueError('%s : %.3f temps pour %d mesures de %s' % (name, tot, bars, meter))
    return mel


def merge(events):
    """accords identiques consécutifs fusionnés : une nappe ne se réattaque pas à chaque temps"""
    out = []
    for t, d, sym in events:
        if out and out[-1][2] == sym and abs(out[-1][0] + out[-1][1] - t) < 1e-6:
            out[-1] = (out[-1][0], out[-1][1] + d, sym)
        else:
            out.append((t, d, sym))
    return out


def P2(spec, t0=0., bar=4):
    """prog() dont les accords répétés sont fusionnés (on peut écrire 'Gm Gm Eb Bb' pour placer un changement au 4e temps)"""
    return merge(prog(spec, t0, bar))


def grid(events, meter, pat):
    """positions d'un motif rythmique (relatives à la mesure) qui tombent dans chaque accord : (temps, accord, élément)"""
    out = []
    for t, d, sym in events:
        b0 = math.floor(t / meter + 1e-9) * meter
        k = 0
        while b0 + k * meter < t + d - 1e-9:
            for item in pat:
                tt = b0 + k * meter + item[0]
                if t - 1e-9 <= tt < t + d - 1e-9:
                    out.append((tt, sym, item))
            k += 1
    return out


def hits(part, t0, bars, meter, pat, lvl=1.):
    """motif de percussion répété : pat = [(position, durée, hauteur, vélocité)]"""
    for k in range(bars):
        for pos, d, p, v in pat:
            part.n(t0 + k * meter + pos, d, DR[p] if isinstance(p, str) and p in DR else p, max(1, min(127, int(v * lvl))))


def strum(part, events, voicer, meter, pat, roll_=.02):
    """accords plaqués ou grattés sur un motif : pat = [(position, durée, vélocité)]"""
    for tt, sym, (pos, d, v) in grid(events, meter, pat):
        part.chord(tt, d, voicer(sym), v, roll=roll_)


def basspat(part, events, meter, pat, lo=36, hi=47):
    """basse sur un motif : pat = [(position, durée, vélocité, décalage en demi-tons)]"""
    for tt, sym, (pos, d, v, deg) in grid(events, meter, pat):
        part.n(tt, d, bass_note(sym, lo, hi) + deg, v)


def tim_on(tim, events, meter, bars, v=86, lo=38, hi=50, also=None):
    """timbales sur les temps forts : la fondamentale de l'accord en vigueur"""
    t0 = events[0][0]
    for k in range(bars):
        t = t0 + k * meter
        tim.n(t, .5, bass_note(at(events, t), lo, hi), v)
        if also is not None:
            tim.n(t + also, .5, bass_note(at(events, t + also), lo, hi), v - 14)


# =================================================================== HAUTS-HOMMES : « La Couronne d'Albâtre » (si bémol majeur, 4/4)
HM_F = chk('HM_F', 'r:2 F4:.333 F4:.333 F4:.334 Bb4:1 D5:1.5 C5:.5 Bb4:1 F4:1 r:2 F4:.333 F4:.333 F4:.334 C5:1 Eb5:1.5 D5:.5 C5:2', 4)
HM_A = chk('HM_A', 'Bb4:1.5 F5:.5 F5:1 Eb5:.5 D5:.5 C5:1 D5:.5 Eb5:.5 F5:2 G5:1.5 F5:.5 Eb5:1 D5:1 C5:3 F4:1 '
           'Bb4:1.5 F5:.5 F5:1 G5:.5 A5:.5 Bb5:2 A5:1 G5:1 F5:1.5 Eb5:.5 D5:1 C5:1 Bb4:4', 8)
HM_CA = 'Bb | Cm F | Gm Gm Eb Bb | F | Bb Gm | Eb F/A | Bb/F Bb/F Bb/F F7 | Bb'
HM_CM = chk('HM_CM', 'D4:4 Eb4:2 C4:2 D4:2 Eb4:1 D4:1 C4:4 D4:2 D4:2 Eb4:2 C4:2 D4:2 D4:1 Eb4:1 D4:4', 8)
HM_B = chk('HM_B', 'D5:2 G5:1 F5:1 Eb5:1.5 D5:.5 C5:2 F5:2 Bb5:1 A5:1 G5:3 D5:1 '
           'Eb5:2 G5:1 F5:1 D5:1.5 Eb5:.5 F5:2 G5:1 F5:1 Eb5:1 C5:1 D5:4', 8)
HM_CB = 'Gm | Cm | Bb Bb Bb F | Eb Eb Eb Bb/D | Cm | Bb | Eb F7 | D'
HM_HB = chk('HM_HB', 'Bb4:2 D5:2 G4:2 Eb4:2 D4:2 F4:2 Eb4:2 Bb4:2 G4:2 C5:2 F4:2 D4:2 Bb4:2 A4:2 A4:4', 8)


def march(dr, t0, bars, lvl=1.):
    """caisse claire militaire et grosse caisse"""
    hits(dr, t0, bars, 4, [(0, .25, 'sd', 80), (.75, .25, 'sd', 48), (1, .25, 'sd', 60), (2, .25, 'sd', 74), (2.5, .25, 'sd', 50),
                           (2.75, .25, 'sd', 54), (3, .25, 'sd', 64), (0, .5, 'bd', 80), (2, .5, 'bd', 66)], lvl)


def highmen():
    S = Score('race_hautshommes', 84, tempo=[(0, 84), (31 * 4, 84), (32 * 4 + 2, 58)], tail=6)
    b = lambda n: n * 4
    tpt = S.part('trompettes', GM['trumpet'], pan=.15, db=0, verb=.32, legato=.03)
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.35, legato=.05)
    hn2 = S.part('cors-2', GM['horn'], pan=-.28, db=-3, verb=.35, legato=.05)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-5, verb=.3)
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-6, verb=.25)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-1, verb=.36, legato=.06)
    vla = S.part('cordes-nappe', GM['slowstr'], pan=-.05, db=-6, verb=.4, legato=.04)
    vc = S.part('violoncelles', GM['cello'], pan=.3, db=-2, verb=.3, legato=.06)
    cb = S.part('contrebasses', GM['contrabass'], pan=.38, db=-4, verb=.25)
    cl = S.part('clarinette', GM['clarinet'], pan=-.12, db=-4, verb=.36, legato=.05)
    harp = S.part('harpe', GM['harp'], pan=-.45, db=-4, verb=.4, human=.6)
    glk = S.part('glockenspiel', GM['glock'], pan=.3, db=-10, verb=.5)
    ch = S.part('choeur', GM['choir'], pan=0, db=-5, verb=.45, width=1.3, legato=.05)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-7, verb=.3, human=.5)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-12, verb=.3, human=.4)
    V = Voicer(55, 72, 4)
    # fanfare d'ouverture (0-3)
    I = P2('Bb | Bb | F | F7', 0)
    tpt.mel(0, HM_F, v=96)
    hn.mel(0, 'r:4 F4:2 D4:2 r:4 A4:2 C5:2', v=82)
    pad(vla, I, V, v=62); vla.env((0, .5), (b(4), .9))
    bassline(cb, I, 34, 46, v=72)
    tim.n(0, 1, 'Bb2', 96); tim.n(b(2), 1, 'F2', 90); roll(tim, b(3) + 2, 2, 'F2', 40, 104, rate=1 / 6)
    dr.n(0, 2, DR['cym2'], 90)
    roll(dr, b(3), 4, DR['sd'], 30, 90, rate=.125)
    # A (4-11) : le thème aux cors, violoncelles à l'octave, marche feutrée
    A1 = P2(HM_CA, b(4))
    hn.mel(b(4), HM_A, v=88, tr=-12)
    vc.mel(b(4), HM_A, v=74, tr=-24)
    pad(vla, A1, V, v=64)
    bassline(cb, A1, 34, 46, v=78)
    arp(harp, A1, [0, 1, 2, 3, 4, 3, 2, 1], .5, 46, v=58)
    march(dr, b(4), 8, .7)
    for k in (4, 8):
        tim.n(b(k), 1, bass_note(at(A1, b(k)), 38, 50), 84)
    glk.mel(b(7) + 2, 'C6:.5 F6:1.5', v=54); glk.mel(b(11), 'D6:.5 F6:.5 Bb6:3', v=52)
    # B (12-19) : sol mineur, chant des cordes, clarinette en contrechant
    B1 = P2(HM_CB, b(12))
    vln.mel(b(12), HM_B, v=84)
    cl.mel(b(12), HM_HB, v=66)
    pad(vla, B1, V, v=62)
    pad(hn2, [e for e in B1 if e[0] >= b(16)], Voicer(50, 65, 3), v=60)
    bassline(cb, B1, 34, 46, v=74)
    arp(harp, B1, [0, 2, 1, 3, 2, 4, 3, 2], .5, 43, v=56)
    glk.mel(b(15), 'Bb5:.5 G6:1.5', v=48)
    roll(tim, b(19), 4, 'D2', 30, 100, rate=1 / 6)
    roll(dr, b(19) + 2, 2, DR['sd'], 40, 96, rate=.125)
    # A' (20-27) : tutti, trompettes et violons, contrechant des cors, chœur
    A2 = P2(HM_CA, b(20))
    tpt.mel(b(20), HM_A, v=100)
    vln.mel(b(20), HM_A, v=94, tr=12)
    hn.mel(b(20), HM_CM, v=88)
    hn2.mel(b(20), HM_CM, v=80, tr=-12)
    vc.mel(b(20), HM_A, v=80, tr=-24)
    pad(tbn, A2, Voicer(46, 62, 3), v=78)
    bassline(tba, A2, 31, 43, v=84)
    bassline(cb, A2, 34, 46, v=88)
    pad(ch, A2, Voicer(57, 76, 4), v=78)
    pad(vla, A2, V, v=70)
    arp(harp, A2, [0, 2, 3, 4, 5, 4, 3, 2], .5, 46, v=64)
    march(dr, b(20), 8, 1.)
    for k in (20, 24):
        dr.n(b(k), 2, DR['cym2'], 100)
    tim_on(tim, A2, 4, 8, v=88, also=2)
    # coda (28-31) : cadence plagale mineure, la couronne
    Cd = P2('Eb | Ebm | Bb/F F | Bb', b(28))
    Cd = Cd[:-1] + [(b(31), 6, 'Bb')]
    tpt.mel(b(28), 'G5:4 Gb5:4 F5:2 Eb5:1 C5:1 D5:6', v=102)
    vln.mel(b(28), 'G5:4 Gb5:4 F5:2 Eb5:1 C5:1 D5:6', v=96, tr=12)
    hn.mel(b(28), 'Bb4:4 Bb4:4 Bb4:2 A4:2 Bb4:6', v=90, tr=-12)
    pad(tbn, Cd, Voicer(46, 62, 3), v=82)
    bassline(tba, Cd, 31, 43, v=88); bassline(cb, Cd, 34, 46, v=90)
    pad(ch, Cd, Voicer(57, 76, 4), v=84); pad(vla, Cd, V, v=74)
    harp.chord(b(31), 6, ['Bb1', 'F2', 'Bb2', 'D3', 'F3', 'Bb3', 'D4', 'F4', 'Bb4', 'D5'], v=80, roll=.05)
    tim.n(b(28), 1, 'Eb2', 90); tim.n(b(30), 1, 'F2', 92)
    roll(tim, b(31), 4.5, 'Bb2', 104, 62, rate=1 / 6); tim.n(b(31) + 4.6, 1.4, 'Bb2', 112)
    dr.n(b(31), 3, DR['cym2'], 112); dr.n(b(31), 1, DR['bd'], 110)
    glk.mel(b(31), 'F6:1 Bb6:5', v=60)
    S.dyn = [(0, -3), (b(4), -3), (b(12), -4), (b(19), -2), (b(20), 0), (b(28), 0), (b(33), 0)]
    S.eq = [('peak', 320, -1.5, .8), ('high', 7000, 2, .7)]
    return S


# =================================================================== ORQUES : « Le Pas de la Horde » (ut mineur, 4/4)
OR_A = chk('OR_A', 'C4:1.5 C4:.5 G4:2 Ab4:1 G4:1 F4:1 Eb4:1 F4:1.5 F4:.5 C5:2 Bb4:1 Ab4:1 G4:2 '
           'C4:1.5 C4:.5 G4:2 Ab4:1 Bb4:1 C5:1 Db5:1 C5:1.5 Bb4:.5 Ab4:1 G4:1 C4:4', 8)
OR_CA = 'Cm | Ab Cm Fm Fm | Fm | Eb Fm Cm Cm | Cm | Ab Ab Ab Db | Ab Ab Ab G | Cm'


def orc():
    S = Score('race_orques', 76, tempo=[(0, 76), (31 * 4, 76), (32 * 4, 62)], tail=5)
    b = lambda n: n * 4
    low = S.part('cordes-graves', GM['strings'], pan=.25, db=-3, verb=.2, human=.4)
    trem = S.part('tremolos-graves', GM['trem'], pan=.1, db=-8, verb=.3)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-3, verb=.2)
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.3, legato=.03)
    tpt = S.part('trompettes', GM['trumpet'], pan=.15, db=-3, verb=.28, legato=.02)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-2, verb=.26)
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-4, verb=.22)
    ch = S.part('choeur', GM['choir'], pan=0, db=-3, verb=.38, width=1.3)
    hit = S.part('coups', GM['hit'], pan=0, db=-9, verb=.35)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-4, verb=.28, human=.3)
    tai = S.part('taiko', GM['taiko'], pan=.05, db=-4, verb=.3, human=.3, hp=50)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-9, verb=.28, human=.3)

    def stomp(t0, bars, lvl=1.):
        hits(tai, t0, bars, 4, [(0, .5, 'A2', 106), (1.5, .5, 'A2', 80), (2, .5, 'A2', 100), (3, .5, 'D3', 84), (3.5, .5, 'D3', 70)], lvl)
        hits(dr, t0, bars, 4, [(0, .5, 'bd', 110), (2, .5, 'bd', 96), (1, .5, 'sd', 78), (3, .5, 'sd', 88), (3.75, .25, 'sd', 60)], lvl)

    # grondement (0-3) : trémolos sur ut grave, cuivres en grappe, les tambours approchent
    I = P2('Cm | Cm | Cm | Cm', 0)
    trem.n(0, 16, 'C2', 82); trem.n(0, 16, 'C3', 70); trem.env((0, .3), (b(4), 1))
    tbn.mel(0, 'C3:4 C3:4 Db3:4 C3:3 r:1', v=74); tbn.env((0, .5), (b(3), 1))
    tba.mel(0, 'C2:8 Db2:4 C2:3 r:1', v=74)
    stomp(b(2), 2, .75)
    roll(tim, b(3), 4, 'G2', 40, 112, rate=.125)
    # A (4-11) : le pas de la horde, cors et trombones à l'unisson
    A1 = P2(OR_CA, b(4))
    hn.mel(b(4), OR_A, v=98)
    tbn.mel(b(4), OR_A, v=92, tr=-12)
    ost332(low, A1, 36, v=80)
    bassline(cb, A1, 36, 47, v=86); bassline(tba, A1, 31, 43, v=80)
    stomp(b(4), 8)
    hit.chord(b(4), 1, ['C4', 'G4', 'C5'], 100)
    tim_on(tim, A1, 4, 8, v=96)
    # B (12-19) : le chant de guerre, coups de voix, cors en pédale
    B1 = P2('Cm | Cm | Ab | Ab | Fm | Fm | G | G', b(12))
    strum(ch, B1, Voicer(50, 64, 3), 4, [(0, .4, 104), (.5, .4, 86), (1.5, .4, 94), (2, .9, 100), (3, .4, 90)], roll_=0)
    hn.mel(b(12), 'G4:8 Ab4:8 Ab4:8 G4:8', v=86)
    tpt.mel(b(12), 'C5:8 C5:8 C5:8 B4:8', v=84)
    ost332(low, B1, 36, v=84, jump=False)
    bassline(cb, B1, 36, 47, v=88); bassline(tba, B1, 31, 43, v=84)
    stomp(b(12), 8, 1.05)
    for k in (12, 16):
        dr.n(b(k), 2, DR['cym2'], 100); hit.chord(b(k), 1, Voicer(60, 72, 3)(at(B1, b(k))), 96)
    roll(dr, b(19), 4, DR['sd'], 40, 112, rate=.125)
    roll(tim, b(19) + 2, 2, 'G2', 70, 118, rate=.125)
    # A' (20-27) : toute la horde
    A2 = P2(OR_CA, b(20))
    tpt.mel(b(20), OR_A, v=104)
    hn.mel(b(20), OR_A, v=100)
    tbn.mel(b(20), OR_A, v=96, tr=-12)
    tba.mel(b(20), OR_A, v=86, tr=-24)
    pad(ch, A2, Voicer(52, 70, 4), v=92)
    ost332(low, A2, 36, v=88)
    bassline(cb, A2, 36, 47, v=92)
    stomp(b(20), 8, 1.1)
    for k in (20, 24):
        dr.n(b(k), 2, DR['cym2'], 112); hit.chord(b(k), 1, ['C4', 'G4', 'C5'], 104)
    tim_on(tim, A2, 4, 8, v=100, also=2)
    # coda (28-31) : le thème en valeurs longues, trois coups
    Cd = P2('Cm | Ab Db | Cm | Cm', b(28))
    for p, v, tr in ((tpt, 104, 0), (hn, 100, 0), (tbn, 98, -12)):
        p.mel(b(28), 'C4:2 G4:2 Ab4:2 Db5:2 C5:4 r:1 C4:.5 C4:.5 C4:2', v=v, tr=tr)
    tba.mel(b(28), 'C2:4 Ab1:2 Db2:2 C2:4 r:1 C2:.5 C2:.5 C2:2', v=92)
    pad(ch, Cd[:-1], Voicer(52, 70, 4), v=96)
    ost332(low, Cd[:-1], 36, v=90)
    bassline(cb, Cd[:-1], 36, 47, v=94)
    stomp(b(28), 3, 1.15)
    for t in (b(31) + 1, b(31) + 1.5, b(31) + 2):
        hit.chord(t, .45 if t < b(31) + 2 else 2, ['C4', 'G4', 'C5'], 110)
        tai.n(t, .5, 'A2', 118); dr.n(t, .5, DR['bd'], 118); tim.n(t, .5, 'C2', 112)
    dr.n(b(31) + 2, 3, DR['cym2'], 118)
    ch.chord(b(31) + 2, 2, ['C3', 'G3', 'C4', 'Eb4'], 104)
    S.dyn = [(0, -6), (b(3), -2), (b(4), -1), (b(12), 0), (b(20), 0), (b(32), 0)]
    S.eq = [('low', 70, -2.5, .7), ('peak', 330, -2, .8), ('high', 7000, 1.5, .7)]
    return S


# =================================================================== BARBARES : « Le Serment des Clans » (mi dorien, 6/8)
BA_I = chk('BA_I', 'E4:1.5 B4:1.5 A4:1 B4:.5 G4:1.5 E4:1.5 B4:1.5 D5:1 B4:.5 E5:1.5', 4, 3)
BA_A = chk('BA_A', 'E4:1 B4:.5 B4:1 A4:.5 B4:1 D5:.5 E5:1.5 D5:1 B4:.5 A4:1 F#4:.5 G4:1 A4:.5 B4:1.5 '
           'E4:1 B4:.5 B4:1 A4:.5 B4:1 D5:.5 E5:1 F#5:.5 G5:1 F#5:.5 E5:1 D5:.5 E5:3', 8, 3)
BA_CA = 'Em | Em | D | G | Em | Em D | C D | Em'
BA_HA = chk('BA_HA', 'B3:3 B3:3 A3:3 B3:3 B3:3 B3:1.5 A3:1.5 G3:1.5 A3:1.5 G3:3', 8, 3)
BA_B = chk('BA_B', 'G4:1.5 B4:1.5 D5:1 C5:.5 B4:1.5 A4:1.5 D5:1.5 C5:1 B4:.5 A4:1.5 '
           'G4:1.5 B4:1.5 E5:1 D5:.5 C5:1 B4:.5 A4:1 B4:.5 C5:1 D5:.5 E5:3', 8, 3)
BA_CB = 'G | G | D | Am | G | C | Am D | Em'
BA_C = 'Em | G | Am | Em | C | G | Am | B'
BA_HC = chk('BA_HC', 'B4:3 B4:3 C5:3 B4:3 C5:3 D5:3 E5:3 D#5:3', 8, 3)


def barbarian():
    S = Score('race_barbares', 120, meter=3, tempo=[(0, 120), (52 * 3, 120), (54 * 3, 92)], tail=5)
    b = lambda n: n * 3
    fid = S.part('violon-populaire', GM['fiddle'], pan=-.12, db=0, verb=.32, legato=.03, human=.8)
    pipe = S.part('cornemuse', GM['bagpipe'], pan=.12, db=-7, verb=.35, legato=.02)
    hn = S.part('cors', GM['horn'], pan=-.22, db=0, verb=.34, legato=.04)
    hn2 = S.part('cors-2', GM['horn'], pan=-.3, db=-3, verb=.34, legato=.04)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-3, verb=.35, legato=.05)
    drone = S.part('bourdon', GM['slowstr'], pan=.05, db=-7, verb=.4)
    low = S.part('cordes-graves', GM['strings'], pan=.28, db=-5, verb=.22, human=.4)
    cb = S.part('contrebasses', GM['contrabass'], pan=.38, db=-4, verb=.22)
    harp = S.part('harpe', GM['harp'], pan=-.42, db=-5, verb=.36, human=.6)
    ch = S.part('choeur', GM['choir'], pan=0, db=-5, verb=.42, width=1.3)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-8, verb=.3, human=.4)
    tai = S.part('taiko', GM['taiko'], pan=.06, db=-6, verb=.3, human=.4, hp=50)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-10, verb=.28, human=.5)
    BOD = [(0, .25, 'surdo', 92), (.5, .25, 'msurdo', 56), (1, .25, 'msurdo', 64), (1.5, .25, 'surdo', 82), (2, .25, 'msurdo', 56), (2.5, .25, 'msurdo', 62)]
    WAR = [(0, .5, 'A2', 104), (1.5, .5, 'A2', 88), (2.5, .5, 'D3', 70)]

    def accomp(ev, v=72, harp_v=58):
        basspat(cb, ev, 3, [(0, .9, v, 0), (1.5, .9, v - 10, 0)], 36, 47)
        strum(harp, ev, Voicer(52, 67, 3), 3, [(0, 1.2, harp_v), (1.5, 1.2, harp_v - 8)], roll_=.03)

    def drone_e(t0, bars, v=66):
        drone.n(t0, b(bars) + .05, 'E2', v); drone.n(t0, b(bars) + .05, 'B2', v - 6)

    # appel (0-3) : bourdon, cor, puis le bodhran
    drone_e(0, 4, 58); drone.env((0, .4), (b(2), .9))
    hn.mel(0, BA_I, v=82)
    hits(dr, b(2), 2, 3, BOD, .75)
    tim.n(0, 2, 'E2', 70); roll(tim, b(3) + 1.5, 1.5, 'B2', 40, 96, rate=1 / 6)
    # A (4-11) : le violon des clans
    A1 = P2(BA_CA, b(4), 3)
    fid.mel(b(4), BA_A, v=86)
    drone_e(b(4), 8, 58)
    accomp(A1)
    hits(dr, b(4), 8, 3, BOD)
    # A' (12-19) : violon et cornemuse, tambours de guerre
    A2 = P2(BA_CA, b(12), 3)
    fid.mel(b(12), BA_A, v=88); pipe.mel(b(12), BA_A, v=84)
    pad(vln, A2, Voicer(55, 71, 4), v=60)
    pad(ch, A2, Voicer(52, 67, 3), v=58)
    drone_e(b(12), 8, 60)
    accomp(A2, v=76, harp_v=62)
    hits(dr, b(12), 8, 3, BOD); hits(tai, b(12), 8, 3, WAR, .85)
    # B (20-27) : sol majeur, le serment aux cors, chœur
    B1 = P2(BA_CB, b(20), 3)
    hn.mel(b(20), BA_B, v=94)
    pad(ch, B1, Voicer(55, 72, 4), v=74)
    pad(vln, B1, Voicer(55, 71, 4), v=66)
    accomp(B1, v=80, harp_v=62)
    gallop2(low, B1, 40, v=70)
    hits(dr, b(20), 8, 3, BOD); hits(tai, b(20), 8, 3, WAR)
    tim_on(tim, B1, 3, 8, v=82)
    dr.n(b(20), 2, DR['cym2'], 90)
    # C (28-35) : la levée des clans, montée chromatique, cris du chœur
    C1 = P2(BA_C, b(28), 3)
    hn.mel(b(28), BA_HC, v=92); hn2.mel(b(28), BA_HC, v=84, tr=-12)
    strum(ch, C1, Voicer(52, 67, 3), 3, [(0, .5, 100), (1.5, .5, 92)], roll_=0)
    arp(fid, C1, [0, 1, 2, 1, 2, 3], .5, 64, v=72, length=.4)
    gallop2(low, C1, 40, v=80)
    bassline(cb, C1, 36, 47, v=84)
    hits(dr, b(28), 8, 3, BOD, 1.05); hits(tai, b(28), 8, 3, WAR, 1.1)
    roll(tim, b(35), 3, 'B2', 50, 116, rate=.125); roll(dr, b(35) + 1.5, 1.5, DR['sd'], 50, 110, rate=.125)
    # B' (36-43) : le serment repris par tous
    B2 = P2(BA_CB, b(36), 3)
    hn.mel(b(36), BA_B, v=98); fid.mel(b(36), BA_B, v=86, tr=12)
    vln.mel(b(36), BA_B, v=88, tr=12)
    pad(ch, B2, Voicer(55, 74, 4), v=84)
    accomp(B2, v=84, harp_v=66)
    gallop2(low, B2, 40, v=82)
    hits(dr, b(36), 8, 3, BOD, 1.05); hits(tai, b(36), 8, 3, WAR, 1.1)
    tim_on(tim, B2, 3, 8, v=90)
    dr.n(b(36), 2, DR['cym2'], 104)
    # A'' (44-51) : tutti, cornemuse et violons, cors en contrechant
    A3 = P2(BA_CA, b(44), 3)
    fid.mel(b(44), BA_A, v=90); pipe.mel(b(44), BA_A, v=88)
    vln.mel(b(44), BA_A, v=90, tr=12)
    hn.mel(b(44), BA_HA, v=88, tr=12); hn2.mel(b(44), BA_HA, v=84)
    pad(ch, A3, Voicer(55, 72, 4), v=84)
    drone_e(b(44), 8, 66)
    accomp(A3, v=86, harp_v=66)
    gallop2(low, A3, 40, v=84)
    hits(dr, b(44), 8, 3, BOD, 1.1); hits(tai, b(44), 8, 3, WAR, 1.15)
    dr.n(b(44), 2, DR['cym2'], 108); dr.n(b(48), 2, DR['cym2'], 100)
    tim_on(tim, A3, 3, 8, v=92, also=1.5)
    # coda (52-53)
    for p, v in ((fid, 92), (pipe, 88), (hn, 96)):
        p.mel(b(52), 'E4:1 B4:.5 E5:1.5 E5:3', v=v)
    hn2.mel(b(52), 'E4:1 B3:.5 G4:1.5 G4:3', v=88)
    ch.chord(b(52), 6, ['E3', 'B3', 'E4', 'G4', 'B4'], 96)
    drone_e(b(52), 2, 70); cb.n(b(52), 6, 'E2', 92)
    tai.n(b(53), .5, 'A2', 118); dr.n(b(53), 3, DR['cym2'], 112); dr.n(b(53), .5, DR['bd'], 116)
    roll(tim, b(52), 3, 'B2', 70, 112, rate=.125); tim.n(b(53), 2, 'E2', 116)
    S.dyn = [(0, -5), (b(4), -3), (b(12), -2), (b(20), -1), (b(28), 0), (b(36), 0), (b(44), 0), (b(54), 0)]
    S.eq = [('low', 80, -1.5, .7), ('peak', 320, -1.5, .8), ('high', 6500, 2.5, .7)]
    return S


# =================================================================== GNOLLS : « Les Rires de la Meute » (mi phrygien, 7/8 = 2+2+3)
GN = 3.5
GN_A = chk('GN_A', 'B4:1 C5:1 B4:1.5 A4:1 G4:1 F4:1.5 G4:1 A4:1 Bb4:1.5 A4:1 G4:1 F4:.5 E4:1 '
           'B4:1 C5:1 D5:1.5 C5:1 B4:1 A4:1.5 Bb4:1 A4:1 G4:1 F4:.5 E4:3.5', 8, GN)
GN_CA = 'Em C Em | F | Gm F Gm | F Em | Em C C | Am Em Am | Gm F F | Em'
GN_B = chk('GN_B', 'E5:3.5 F5:3.5 G5:2 E5:1.5 E5:3.5 D5:3.5 F5:2 E5:1.5 F5:3.5 E5:3.5', 8, GN)
GN_CB = 'Em | F | Em | C | Dm | Dm C | F | Em'
LAUGH = 'B6:.25 A6:.25 G6:.25 F6:.25 E6:.5'
GN_RIFF = [(0, .4, 18, 0), (1, .4, 0, 0), (1.5, .3, -6, 12), (2, .4, 10, 1), (2.5, .3, -8, 0), (3, .4, 4, -5)]


def gnoll():
    S = Score('race_gnolls', 140, meter=GN, tempo=[(0, 140), (52 * GN, 140), (54 * GN, 104)], tail=4)
    b = lambda n: n * GN
    bsn = S.part('bassons', GM['bassoon'], pan=.2, db=-1, verb=.24, human=.5)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-3, verb=.2)
    low = S.part('cordes-graves', GM['strings'], pan=.25, db=-5, verb=.22, human=.4)
    trem = S.part('tremolos', GM['trem'], pan=-.25, db=-9, verb=.32)
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.3, legato=.03)
    tpt = S.part('trompettes', GM['trumpet'], pan=.15, db=-4, verb=.28, legato=.02)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-3, verb=.26)
    ob = S.part('hautbois', GM['oboe'], pan=.1, db=-2, verb=.3, legato=.03)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-3, verb=.3, legato=.03)
    pic = S.part('piccolo', GM['piccolo'], pan=-.1, db=-6, verb=.35)
    xyl = S.part('xylophone', GM['xylophone'], pan=.25, db=-8, verb=.3)
    ooh = S.part('hurlements', GM['oohs'], pan=0, db=-5, verb=.45, width=1.3, legato=.04)
    tai = S.part('taiko', GM['taiko'], pan=.05, db=-8, verb=.28, human=.4, hp=50)
    mt = S.part('toms', GM['melotom'], pan=-.1, db=-12, verb=.28, human=.4)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-5, verb=.28, human=.4)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-12, verb=.26, human=.5)
    TAI7 = [(0, .4, 'A2', 100), (1, .4, 'D3', 78), (2, .4, 'A2', 96), (2.5, .3, 'D3', 66), (3, .3, 'D3', 74)]
    DR7 = [(0, .4, 'bd', 100), (2, .4, 'bd', 86), (1, .3, 'sd', 64), (3, .3, 'sd', 72)]
    W7 = [(0, .2, 'wood', 66), (.5, .2, 'wood', 42), (1, .2, 'wood', 58), (1.5, .2, 'wood', 42), (2, .2, 'wood', 62), (2.5, .2, 'wood', 46), (3, .2, 'wood', 54)]

    def riff(t0, bars, lvl=1.):
        for k in range(bars):
            for pos, d, dv, off in GN_RIFF:
                t = t0 + k * GN + pos
                bsn.n(t, d, P('E3') + off, int((78 + dv) * lvl))
                cb.n(t, d, P('E2') + off, int((82 + dv) * lvl))
            low.n(t0 + k * GN, .4, 'E2', int(96 * lvl)); low.n(t0 + k * GN + 2, .4, 'F2', int(88 * lvl))

    def riff_on(ev, lvl=1.):
        basspat(cb, ev, GN, [(pos, d, int((82 + dv) * lvl), off) for pos, d, dv, off in GN_RIFF], 36, 47)
        basspat(bsn, ev, GN, [(pos, d, int((76 + dv) * lvl), off + 12) for pos, d, dv, off in GN_RIFF], 36, 47)

    def laugh(t, v=80):
        pic.mel(t, LAUGH, v=v); xyl.mel(t, LAUGH, v=v - 6, tr=-12)

    def growl(t, v=104):
        tbn.chord(t, .45, ['E2', 'F2', 'Bb2'], v)

    def perc(t0, bars, lvl=1.):
        hits(tai, t0, bars, GN, TAI7, lvl); hits(dr, t0, bars, GN, DR7, lvl); hits(dr, t0, bars, GN, W7, lvl)

    def fill(t, v=84):
        mt.mel(t, 'D3:.25 C3:.25 A2:.25 G2:.25 E2:.5', v=v)

    # la meute approche (0-3)
    riff(0, 4, .85)
    hits(dr, b(2), 2, GN, W7, .8); hits(tai, b(2), 2, GN, TAI7, .75)
    laugh(b(1) + 2, 70); fill(b(3) + 2)
    # A (4-11) : cors, ricanements, grognements des trombones
    A1 = P2(GN_CA, b(4), GN)
    hn.mel(b(4), GN_A, v=96)
    riff(b(4), 8)
    perc(b(4), 8)
    growl(b(5) + 2); growl(b(9) + 2)
    laugh(b(7) + 2); laugh(b(11) + 2)
    tim.n(b(4), .5, 'E2', 96); tim.n(b(8), .5, 'E2', 96)
    # A' (12-19) : hautbois et violons, trémolos
    A2 = P2(GN_CA, b(12), GN)
    ob.mel(b(12), GN_A, v=92); vln.mel(b(12), GN_A, v=84, tr=12)
    pad(trem, A2, Voicer(52, 69, 4), v=60)
    riff(b(12), 8)
    perc(b(12), 8, 1.05)
    growl(b(13) + 2); growl(b(15) + 2, 96); growl(b(17) + 2)
    laugh(b(15) + 2, 84); laugh(b(19) + 2, 88)
    fill(b(19) + 1.5, 92)
    # B (20-27) : la chasse, hurlements
    B1 = P2(GN_CB, b(20), GN)
    ooh.mel(b(20), GN_B, v=88)
    pad(trem, B1, Voicer(55, 72, 4), v=66); trem.env((b(20), .7), (b(27), 1.2))
    riff_on(B1)
    perc(b(20), 8, 1.1)
    for t, d, sym in B1:
        tpt.chord(t, .4, Voicer(60, 72, 3)(sym), 92)
    tim_on(tim, B1, GN, 8, v=92, also=2)
    # C (28-35) : la curée, appels de cor au triton
    riff(b(28), 8, 1.05)
    perc(b(28), 8, 1.15)
    for k, call in ((28, 'E4:1 Bb4:2.5'), (30, 'E4:1 Bb4:2.5'), (32, 'F4:1 B4:2.5'), (34, 'G4:1 C#5:1 B4:1.5')):
        hn.mel(b(k), call, v=100); tpt.mel(b(k) + 1, call.split(' ', 1)[1].replace(':2.5', ':1.5').replace(':1.5', ':1.5'), v=88)
    for k in (29, 31, 33):
        laugh(b(k) + 2, 92); growl(b(k) + .5, 110)
    for k in range(28, 36, 2):
        fill(b(k + 1) + 2, 90)
    roll(tim, b(35), 3.5, 'B2', 50, 118, rate=.125)
    # B' (36-43) : la chasse reprise par les cuivres
    B2 = P2(GN_CB, b(36), GN)
    tpt.mel(b(36), GN_B, v=100); hn.mel(b(36), GN_B, v=94, tr=-12); ooh.mel(b(36), GN_B, v=86)
    pad(trem, B2, Voicer(55, 72, 4), v=70)
    riff_on(B2, 1.05)
    perc(b(36), 8, 1.15)
    tim_on(tim, B2, GN, 8, v=96, also=2)
    dr.n(b(36), 2, DR['cym2'], 104)
    # A'' (44-51) : toute la meute
    A3 = P2(GN_CA, b(44), GN)
    hn.mel(b(44), GN_A, v=102); tpt.mel(b(44), GN_A, v=98); vln.mel(b(44), GN_A, v=92, tr=12)
    ob.mel(b(44), GN_A, v=86, tr=12)
    pad(trem, A3, Voicer(52, 69, 4), v=66)
    riff(b(44), 8, 1.1)
    perc(b(44), 8, 1.2)
    growl(b(45) + 2, 110); growl(b(49) + 2, 112)
    laugh(b(47) + 2, 96); laugh(b(51) + 2, 100)
    dr.n(b(44), 2, DR['cym2'], 110); dr.n(b(48), 2, DR['cym2'], 104)
    tim_on(tim, A3, GN, 8, v=100, also=2)
    # coda (52-53) : un dernier riff, silence, un ricanement
    riff(b(52), 1, 1.15); perc(b(52), 1, 1.2)
    growl(b(52) + 2, 116)
    laugh(b(53) + 1, 104)
    tai.n(b(53) + 3, .5, 'A2', 122); dr.n(b(53) + 3, 2, DR['cym2'], 110); cb.n(b(53) + 3, 1, 'E1', 110); bsn.n(b(53) + 3, 1, 'E2', 104)
    S.dyn = [(0, -5), (b(4), -2), (b(12), -1), (b(20), 0), (b(28), 0), (b(36), 0), (b(44), 0), (b(54), 0)]
    S.eq = [('low', 75, -1.5, .7), ('peak', 340, -1.5, .8), ('high', 6500, 2, .7)]
    return S


# =================================================================== HALFELINS : « La Fête des Collines » (sol mixolydien, gigue en 6/8)
HA_A = chk('HA_A', 'D4:.5 G4:.5 A4:.5 B4:1 G4:.5 A4:.5 B4:.5 C5:.5 D5:1 B4:.5 C5:1 A4:.5 B4:1 G4:.5 A4:1 F4:.5 D4:1.5 '
           'D4:.5 G4:.5 A4:.5 B4:1 G4:.5 A4:.5 B4:.5 C5:.5 D5:1 E5:.5 D5:.5 C5:.5 B4:.5 A4:1 F#4:.5 G4:3', 8, 3)
HA_CA = 'G | Am G | Am G | F D | G | Am C | G D | G'
HA_CM = chk('HA_CM', 'B3:1.5 D4:1.5 C4:1.5 B3:1.5 E4:1.5 D4:1.5 C4:1.5 A3:1.5 B3:1.5 D4:1.5 C4:1.5 E4:1.5 D4:1.5 C4:1.5 B3:3', 8, 3)
HA_B = chk('HA_B', 'E5:1 D5:.5 C5:1 G4:.5 A4:.5 B4:.5 C5:.5 D5:1.5 E5:1 F5:.5 G5:1 E5:.5 D5:3 '
           'E5:1 D5:.5 C5:1 A4:.5 F5:1 E5:.5 D5:1 B4:.5 C5:.5 D5:.5 B4:.5 G4:1 B4:.5 C5:1.5 D5:.5 C5:.5 A4:.5', 8, 3)
HA_CB = 'C | Am G | C | G | C Am | F G | C G | C D7'


def halfling():
    S = Score('race_halfelins', 138, meter=3, tempo=[(0, 138), (50 * 3, 138), (52 * 3, 112)], tail=4)
    b = lambda n: n * 3
    rec = S.part('flute-a-bec', GM['recorder'], pan=-.08, db=-2, verb=.32, legato=.03, human=.7)
    fid = S.part('violon-populaire', GM['fiddle'], pan=.12, db=-1, verb=.3, legato=.03, human=.8)
    acc = S.part('accordeon', GM['accordion'], pan=.2, db=-4, verb=.3, legato=.03)
    gtr = S.part('guitare', GM['nylon'], pan=.3, db=-6, verb=.28, human=.7)
    pz = S.part('pizzicati', GM['pizz'], pan=.35, db=-6, verb=.28, human=.6)
    bsn = S.part('basson', GM['bassoon'], pan=.25, db=-5, verb=.28, human=.5)
    cl = S.part('clarinette', GM['clarinet'], pan=-.2, db=-5, verb=.32, legato=.04)
    fl = S.part('flute', GM['flute'], pan=-.12, db=-3, verb=.36, legato=.04)
    vla = S.part('cordes', GM['slowstr'], pan=-.05, db=-9, verb=.36, legato=.04)
    hn = S.part('cor', GM['horn'], pan=-.25, db=-7, verb=.36)
    glk = S.part('glockenspiel', GM['glock'], pan=.3, db=-11, verb=.45)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-11, verb=.3, human=.6)
    JIG = [(0, .25, 'tamb', 58), (.5, .2, 'lwood', 34), (1, .2, 'lwood', 40), (1.5, .25, 'tamb', 52), (2, .2, 'lwood', 34), (2.5, .2, 'lwood', 40)]

    def jig(ev, v=66, gv=54):
        basspat(pz, ev, 3, [(0, .6, v, 0), (1.5, .6, v - 8, 7)], 40, 51)
        strum(gtr, ev, Voicer(55, 67, 3), 3, [(1, .4, gv), (2.5, .4, gv - 4)], roll_=.025)

    # vamp (0-1)
    I = P2('G | D', 0, 3)
    jig(I, 60, 50)
    bsn.mel(0, 'G2:1.5 D2:1.5 D2:1.5 F#2:1', v=62)
    # A (2-9) : la flûte à bec
    A1 = P2(HA_CA, b(2), 3)
    rec.mel(b(2), HA_A, v=84, tr=12)
    jig(A1)
    hits(dr, b(2), 8, 3, JIG, .9)
    # A' (10-17) : le violon, la flûte à bec à l'octave
    A2 = P2(HA_CA, b(10), 3)
    fid.mel(b(10), HA_A, v=88); rec.mel(b(10), HA_A, v=70, tr=12)
    jig(A2, 68, 56)
    hits(dr, b(10), 8, 3, JIG)
    glk.mel(b(13) + 1.5, 'D6:.5 G6:1', v=50); glk.mel(b(17), 'B6:.5 G6:1', v=50)
    # B (18-25) : ut majeur, l'accordéon
    B1 = P2(HA_CB, b(18), 3)
    acc.mel(b(18), HA_B, v=88)
    jig(B1, 68, 56)
    hits(dr, b(18), 8, 3, JIG)
    bsn.mel(b(18), 'C3:3 B2:1.5 G2:1.5 C3:3 G2:3 C3:1.5 A2:1.5 F2:1.5 G2:1.5 C3:1.5 G2:1.5 C3:1.5 D3:1.5', v=60)
    # A'' (26-33) : clarinette et flûte, plus léger
    A3 = P2(HA_CA, b(26), 3)
    fl.mel(b(26), HA_A, v=80, tr=12); cl.mel(b(26), HA_CM, v=70)
    basspat(pz, A3, 3, [(0, .6, 62, 0), (1.5, .6, 54, 7)], 40, 51)
    hits(dr, b(26), 8, 3, JIG, .8)
    glk.mel(b(29) + 1.5, 'D6:.5 G6:1', v=46)
    # B' (34-41) : violon et accordéon, la fête s'anime
    B2 = P2(HA_CB, b(34), 3)
    fid.mel(b(34), HA_B, v=90); acc.mel(b(34), HA_B, v=80, tr=-12)
    jig(B2, 72, 60)
    pad(vla, B2, Voicer(55, 71, 4), v=54)
    hits(dr, b(34), 8, 3, JIG, 1.1)
    for k in (34, 38):
        dr.n(b(k), 1, DR['tri'], 56)
    # A''' (42-49) : tout le village
    A4 = P2(HA_CA, b(42), 3)
    rec.mel(b(42), HA_A, v=88, tr=12); fid.mel(b(42), HA_A, v=90); acc.mel(b(42), HA_A, v=74)
    cl.mel(b(42), HA_CM, v=74); bsn.mel(b(42), HA_CM, v=62, tr=-12)
    pad(vla, A4, Voicer(55, 71, 4), v=58); pad(hn, A4, Voicer(50, 64, 3), v=52)
    jig(A4, 74, 62)
    hits(dr, b(42), 8, 3, JIG, 1.15)
    glk.mel(b(45) + 1.5, 'D6:.5 G6:1', v=54); glk.mel(b(49), 'B6:.5 D7:1', v=56)
    # coda (50-52) : « et qu'on danse ! »
    for p, v, tr in ((rec, 90, 12), (fid, 92, 0), (acc, 80, 0)):
        p.mel(b(50), 'G4:1 D4:.5 D4:.5 E4:1 D4:1.5 r:.5 F#4:.5 G4:.5', v=v, tr=tr)
    bsn.mel(b(50), 'G2:1 D2:.5 D2:.5 C2:1 D2:1.5 r:.5 D2:.5 G2:.5', v=72)
    pz.mel(b(50), 'G2:1.5 C3:1.5 D3:1.5 r:.5 D3:.5 G2:.5', v=74)
    gtr.chord(b(51) + 2.5, 1.5, ['G3', 'B3', 'D4', 'G4'], 70, roll=.02)
    dr.n(b(51) + 2, .25, DR['tamb'], 70); dr.n(b(51) + 2.5, 1, DR['tamb'], 80); dr.n(b(51) + 2.5, 1, DR['tri'], 60)
    S.dyn = [(0, -4), (b(2), -3), (b(10), -2), (b(18), -2), (b(26), -4), (b(34), -1), (b(42), 0), (b(53), 0)]
    S.eq = [('peak', 300, -2, .8), ('high', 6000, 3, .7)]
    return S


# =================================================================== HAUTS-ELFES : « Sous les Ramures d'Argent » (mi lydien, 3/4)
HE_A = chk('HE_A', 'E4:1 B4:2 A#4:.5 B4:.5 C#5:1 D#5:1 E5:2 C#5:1 B4:3 '
           'E4:1 B4:2 C#5:.5 D#5:.5 E5:1 F#5:1 G#5:1.5 F#5:.5 D#5:1 E5:3', 8, 3)
HE_CA = 'E | F#6/E | C#m | B | E | Eadd9 | G#m | E'
HE_HM = chk('HE_HM', 'G#4:3 F#4:3 E4:3 D#4:3 E4:3 F#4:3 D#4:3 E4:3', 8, 3)
HE_B = chk('HE_B', 'G#4:1 C#5:1.5 D#5:.5 E5:2 D#5:1 C#5:1 B4:1 G#4:1 F#4:3 '
           'G#4:1 C#5:1.5 D#5:.5 E5:1 F#5:1 G#5:1 A5:1.5 G#5:.5 F#5:1 G#5:3', 8, 3)
HE_CB = 'C#m | Amaj7 Amaj7 B | E | B | C#m | Amaj7 | F#m | G#'


def highelf():
    S = Score('race_hautselfes', 66, meter=3, tempo=[(0, 66), (36 * 3, 66), (40 * 3, 52)], tail=8)
    b = lambda n: n * 3
    fl = S.part('flute', GM['flute'], pan=-.08, db=-1, verb=.48, legato=.06)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-2, verb=.45, legato=.07)
    solo = S.part('violon-solo', GM['violin'], pan=-.18, db=-1, verb=.48, legato=.06)
    pad_ = S.part('cordes-nappe', GM['slowstr'], pan=0, db=-7, verb=.5, legato=.05)
    harp = S.part('harpe', GM['harp'], pan=-.4, db=-3, verb=.5, human=.5)
    glass = S.part('verre', GM['glass'], pan=.1, db=-11, verb=.6, width=1.4)
    crys = S.part('cristal', GM['crystal'], pan=.3, db=-6, verb=.65)
    cel = S.part('celesta', GM['celesta'], pan=.35, db=-2, verb=.6)
    ooh = S.part('voix', GM['oohs'], pan=0, db=-6, verb=.6, width=1.4, legato=.06)
    hn = S.part('cor', GM['horn'], pan=-.25, db=-5, verb=.5, legato=.06)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-7, verb=.4)
    glk = S.part('glockenspiel', GM['glock'], pan=-.3, db=-6, verb=.7)
    dr = S.part('percussions', 48, drums=True, pan=.1, db=-14, verb=.6)

    def flow(ev, hv=56, low=True):
        arp(harp, ev, [0, 1, 2, 3, 4, 3], .5, 40, v=hv)
        if low:
            for t, d, sym in ev:
                cb.n(t, d + .05, bass_note(sym, 36, 47), 56)

    # clairière (0-3)
    I = P2('E | F#6/E | E | F#6/E', 0, 3)
    flow(I, 50, low=False)
    pad(glass, I, Voicer(59, 76, 3), v=56); glass.env((0, .3), (b(2), .8))
    cel.mel(b(2), 'E5:1 B5:2 A#5:.5 B5:.5 C#6:1 D#6:1', v=58)
    dr.n(b(3) + 2, 1, DR['tri'], 50)
    # A (4-11) : la flûte sous les ramures
    A1 = P2(HE_CA, b(4), 3)
    fl.mel(b(4), HE_A, v=84)
    flow(A1)
    pad(glass, A1, Voicer(59, 76, 3), v=52)
    pad(ooh, A1, Voicer(57, 72, 3), v=48)
    glk.mel(b(7), 'B6:3', v=40); glk.mel(b(11), 'E7:3', v=40)
    # A' (12-19) : les cordes chantent, la flûte plane à l'octave
    A2 = P2(HE_CA, b(12), 3)
    vln.mel(b(12), HE_A, v=82, tr=12); fl.mel(b(12), HE_A, v=72)
    pad(pad_, A2, Voicer(55, 71, 4), v=58)
    pad(ooh, A2, Voicer(57, 74, 4), v=56)
    pad(hn, A2, Voicer(50, 64, 3), v=48)
    flow(A2, 58)
    arp(crys, A2, [5, None, 4, None, 6, None], .5, 64, v=46)
    # B (20-27) : do dièse mineur, le violon seul
    B1 = P2(HE_CB, b(20), 3)
    solo.mel(b(20), HE_B, v=86)
    pad(pad_, B1, Voicer(55, 71, 4), v=56)
    flow(B1, 54)
    arp(cel, B1, [3, None, 4, 5, None, 4], .5, 64, v=44)
    dr.n(b(27) + 1, 2, DR['cym1'], 30)
    # A'' (28-35) : tout le peuple, cors en contrechant
    A3 = P2(HE_CA, b(28), 3)
    vln.mel(b(28), HE_A, v=90, tr=12); fl.mel(b(28), HE_A, v=82, tr=12); solo.mel(b(28), HE_A, v=80)
    hn.mel(b(28), HE_HM, v=72)
    pad(ooh, A3, Voicer(57, 76, 4), v=66)
    pad(pad_, A3, Voicer(55, 71, 4), v=64)
    pad(glass, A3, Voicer(59, 76, 3), v=52)
    flow(A3, 62)
    glk.mel(b(31), 'B6:3', v=44); glk.mel(b(35), 'E7:3', v=46)
    dr.n(b(28), 1, DR['tri'], 52); dr.n(b(32), 1, DR['tri'], 52)
    # coda (36-39) : la lumière s'éteint entre les feuilles
    Cd = P2('E | F#6/E | E | E', b(36), 3)
    flow(Cd[:-1], 48)
    harp.chord(b(39), 6, ['E2', 'B2', 'E3', 'G#3', 'B3', 'F#4', 'G#4', 'B4', 'E5'], v=64, roll=.09)
    pad(pad_, Cd, Voicer(55, 71, 4), v=54); pad(glass, Cd, Voicer(59, 76, 3), v=50)
    pad(ooh, Cd, Voicer(57, 74, 3), v=48)
    cel.mel(b(36), 'B5:1 E6:2 F#6:3 G#6:3 B6:3', v=52)
    cb.n(b(36), b(4), 'E2', 52)
    dr.n(b(39), 2, DR['tri'], 46)
    S.dyn = [(0, -4), (b(4), -3), (b(12), -1), (b(20), -2), (b(28), 0), (b(36), -2), (b(40), -4)]
    S.eq = [('peak', 300, -2.5, .8), ('high', 6500, 4, .7)]
    return S


# =================================================================== KLACKONS : « La Ruche infinie » (ut mineur, 4/4, ostinatos imbriqués)
KL_A = chk('KL_A', 'C4:2 G4:2 Ab4:3 G4:1 F4:2 Eb4:1 D4:1 G4:4 C4:2 G4:2 Ab4:2 B4:2 C5:2 D5:1 Eb5:1 D5:2 B4:2', 8)
KL_CA = 'Cm | Ab Ab Ab Cm | Fm Fm Eb G | G | Cm | Ab Ab G G | Cm Cm G Cm | G'
KL_B = chk('KL_B', 'G5:4 Bb5:4 C#6:4 E6:4 G5:4 Bb5:4 C#6:4 D6:4', 8)
KL_CB = 'Cm | Ebm | F#m | Am | Cm | Ebm | F#m | G'


def klackon():
    S = Score('race_klackons', 116, tempo=[(0, 116), (37 * 4, 116)], tail=4)
    b = lambda n: n * 4
    mar1 = S.part('marimba-1', GM['marimba'], pan=-.3, db=-5, verb=.25, human=.2)
    mar2 = S.part('marimba-2', GM['marimba'], pan=.3, db=-6, verb=.25, human=.2)
    xyl = S.part('xylophone', GM['xylophone'], pan=.15, db=-10, verb=.25, human=.2)
    pz = S.part('pizzicati', GM['pizz'], pan=.35, db=-7, verb=.22, human=.3)
    low = S.part('cordes-graves', GM['strings'], pan=.25, db=-6, verb=.25)
    trem = S.part('tremolos', GM['trem'], pan=-.2, db=-9, verb=.35)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-3, verb=.35, legato=.05)
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.32, legato=.05)
    tpt = S.part('trompettes', GM['trumpet'], pan=.15, db=-5, verb=.3, legato=.03)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-4, verb=.28)
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-6, verb=.22)
    ch = S.part('choeur', GM['choir'], pan=0, db=-5, verb=.42, width=1.3)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-4, verb=.3, human=.2)
    dr = S.part('percussions', 48, drums=True, pan=0, db=10, verb=.25, human=.2)
    CLK = [(0, .2, 'wood', 72), (.75, .2, 'lwood', 50), (1.5, .2, 'wood', 62), (2, .2, 'lwood', 58), (2.75, .2, 'wood', 56), (3.25, .2, 'lwood', 50), (3.5, .2, 'wood', 64)]
    PZ = [(i * .5, .3, 72 if i % 4 == 0 else 58, 7 if i % 4 == 2 else 0) for i in range(8)]

    def hive(ev, lvl=1., two=True, xylo=False):
        arp(mar1, ev, [0, 2, 1, 3], .25, 60, v=int(60 * lvl), accent=10, length=.2)
        if two:
            arp(mar2, ev, [2, 0, 3, 0, 2, 4, 0, 3], .5, 48, v=int(58 * lvl), accent=12, length=.35)
        if xylo:
            ost332(xyl, ev, 72, v=int(50 * lvl), jump=True, dur=.2)
        basspat(pz, ev, 4, [(p, d, int(v * lvl), o) for p, d, v, o in PZ], 36, 47)

    # éveil de la ruche (0-3)
    I = P2('Cm | Cm | Cm | Cm', 0)
    arp(mar1, I, [0, 2, 1, 3], .25, 60, v=54, accent=10, length=.2)
    arp(mar2, [(b(2), b(2), 'Cm')], [2, 0, 3, 0, 2, 4, 0, 3], .5, 48, v=54, accent=12, length=.35)
    hits(dr, b(2), 2, 4, CLK, .8)
    low.n(b(2), 8, 'C2', 62); low.env((b(2), .4), (b(4), 1))
    # A (4-11) : la reine, aux cors
    A1 = P2(KL_CA, b(4))
    hn.mel(b(4), KL_A, v=92)
    hive(A1)
    hits(dr, b(4), 8, 4, CLK)
    bassline(low, A1, 36, 47, v=66)
    tim.n(b(4), 1, 'C2', 84); tim.n(b(8), 1, 'C2', 84)
    # A' (12-19) : les ouvrières, violons à l'octave, xylophone
    A2 = P2(KL_CA, b(12))
    vln.mel(b(12), KL_A, v=86, tr=12); hn.mel(b(12), KL_A, v=80, tr=-12)
    hive(A2, 1.05, xylo=True)
    hits(dr, b(12), 8, 4, CLK, 1.05)
    pad(trem, A2, Voicer(55, 72, 4), v=56)
    bassline(low, A2, 36, 47, v=72)
    tim_on(tim, A2, 4, 8, v=82)
    # B (20-27) : le cycle des tierces, la ruche gronde
    B1 = P2(KL_CB, b(20))
    vln.mel(b(20), KL_B, v=88)
    pad(tbn, B1, Voicer(46, 62, 3), v=72); tbn.env((b(20), .6), (b(28), 1.1))
    pad(trem, B1, Voicer(55, 72, 4), v=66); trem.env((b(20), .6), (b(28), 1.2))
    bassline(tba, B1, 31, 43, v=78)
    hive(B1, 1.08, xylo=True)
    hits(dr, b(20), 8, 4, CLK, 1.1)
    for k in range(20, 28):
        tim.n(b(k), .5, bass_note(at(B1, b(k)), 38, 50), 84 + (k - 20) * 3)
    roll(tim, b(27), 4, 'G2', 50, 116, rate=.125); roll(dr, b(27) + 2, 2, DR['sd'], 40, 104, rate=.125)
    # A'' (28-35) : la ruche entière
    A3 = P2(KL_CA, b(28))
    hn.mel(b(28), KL_A, v=100); tpt.mel(b(28), KL_A, v=96); tbn.mel(b(28), KL_A, v=92, tr=-12)
    vln.mel(b(28), KL_A, v=90, tr=12)
    pad(ch, A3, Voicer(55, 74, 4), v=80)
    bassline(tba, A3, 31, 43, v=84); bassline(low, A3, 36, 47, v=80)
    hive(A3, 1.12, xylo=True)
    hits(dr, b(28), 8, 4, CLK, 1.15)
    dr.n(b(28), 2, DR['cym2'], 100); dr.n(b(32), 2, DR['cym2'], 96)
    tim_on(tim, A3, 4, 8, v=96, also=2)
    # coda (36-37) : la ruche se fige d'un coup
    Cd = P2('Cm', b(36))
    hive(Cd, 1.1, xylo=True); hits(dr, b(36), 1, 4, CLK, 1.1)
    for p, v in ((hn, 100), (tbn, 96)):
        p.chord(b(37), 1, ['C3', 'G3', 'C4'] if p is tbn else ['C4', 'Eb4', 'G4'], v)
    tba.n(b(37), 1, 'C2', 100); tim.n(b(37), 1, 'C2', 110); ch.chord(b(37), 1, ['C4', 'Eb4', 'G4', 'C5'], 96)
    dr.n(b(37), 1, DR['bd'], 110)
    dr.n(b(37) + 3.5, .25, DR['wood'], 90); pz.n(b(37) + 3.5, .5, 'C2', 90)
    S.dyn = [(0, -6), (b(4), -3), (b(12), -2), (b(20), -2), (b(27), 0), (b(28), 0), (b(38), 0)]
    S.eq = [('peak', 330, -2, .8), ('high', 7000, 2, .7)]
    return S
# =================================================================== HOMMES-LÉZARDS : « Le Marais des Anciens » (la mineur pentatonique, 4/4)
LZ_A = chk('LZ_A', 'A4:1.5 E5:.5 E5:2 D5:1 C5:1 A4:2 G4:1.5 A4:.5 C5:1 D5:1 E5:4 '
           'A4:1.5 E5:.5 E5:1 G5:1 E5:1 D5:1 C5:2 D5:1 C5:.5 A4:.5 G4:1 E4:1 A4:4', 8)
LZ_CA = 'Am | Dm | G Am | Em | Am | C | Dm Em | Am'
LZ_B = chk('LZ_B', 'E5:4 F5:2 D5:2 E5:3 C5:1 D5:2 Bb4:2 A4:4 D5:2 F5:2 A4:2 B4:2 G#4:4', 8)
LZ_CB = 'Am | Bb/A | Am | Bb | Dm | Bb | Esus4 | E'


def lizardman():
    S = Score('race_hommeslezards', 86, tempo=[(0, 86), (36 * 4, 86), (38 * 4, 70)], tail=7)
    b = lambda n: n * 4
    pan = S.part('flute-de-pan', GM['panflute'], pan=-.1, db=-1, verb=.45, legato=.05, human=.7)
    shk = S.part('shakuhachi', GM['shakuhachi'], pan=.1, db=-2, verb=.48, legato=.05, human=.7)
    kal = S.part('kalimba', GM['kalimba'], pan=-.3, db=-1, verb=.4, human=.5)
    mar = S.part('marimba', GM['marimba'], pan=.3, db=-7, verb=.35, human=.5)
    atm = S.part('brume', GM['atmosphere'], pan=0, db=-9, verb=.6, width=1.4)
    ooh = S.part('voix', GM['oohs'], pan=0, db=-7, verb=.55, width=1.3)
    vln = S.part('cordes', GM['strings'], pan=-.3, db=-3, verb=.4, legato=.06)
    pad_ = S.part('cordes-nappe', GM['slowstr'], pan=.05, db=-8, verb=.45)
    hn = S.part('cors', GM['horn'], pan=-.2, db=-3, verb=.4, legato=.05)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-8, verb=.35)
    cb = S.part('contrebasses', GM['contrabass'], pan=.3, db=-4, verb=.3)
    bsn = S.part('basson', GM['bassoon'], pan=.2, db=-4, verb=.3, human=.5)
    tai = S.part('taiko', GM['taiko'], pan=.05, db=-8, verb=.4, human=.5, hp=45)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-11, verb=.35)
    dr = S.part('percussions', 48, drums=True, pan=.05, db=-9, verb=.4, human=.6)
    SW = [(0, .5, 'surdo', 88), (2.5, .5, 'surdo', 74), (1.5, .25, 'lwood', 52), (3.5, .25, 'lwood', 58),
          (1, .2, 'wood', 36), (1.25, .2, 'wood', 30), (3, .2, 'wood', 38), (3.25, .2, 'wood', 32)]
    DIDG = [(0, .3, 84, 0), (.75, .3, 62, 0), (1.5, .6, 74, 0), (2.5, .3, 64, 0), (3, .3, 70, 12), (3.5, .3, 60, 0)]

    def swamp(ev, lvl=1., kalimba=True, marimba=False):
        if kalimba:
            arp(kal, ev, [0, 2, 1, 3, 2, 1, 3, 2], .5, 57, v=int(60 * lvl), length=.6)
        if marimba:
            arp(mar, ev, [0, None, 1, 2, None, 1, None, 3], .5, 45, v=int(56 * lvl), length=.4)
        basspat(bsn, ev, 4, [(p, d, int(v * lvl), o) for p, d, v, o in DIDG], 40, 51)
        for t, d, sym in ev:
            cb.n(t, d + .05, bass_note(sym, 33, 44), int(66 * lvl))

    # brume (0-3) : bourdon, gouttes, grenouilles
    I = P2('Am | Am | Am | Am', 0)
    atm.n(0, 16, 'A3', 60); atm.n(0, 16, 'E4', 54); atm.env((0, .3), (b(2), 1))
    cb.n(0, 16, 'A1', 60)
    basspat(bsn, I[:1] if False else [(b(2), b(2), 'Am')], 4, DIDG, 40, 51)
    arp(kal, [(b(2), b(2), 'Am')], [0, 2, 1, 3, 2, 1, 3, 2], .5, 57, v=50, length=.6)
    hits(dr, b(1), 3, 4, [p for p in SW if p[2] in ('wood', 'lwood')], .8)
    roll(dr, 0, 6, DR['cym1'], 8, 24, rate=1 / 6)
    # A (4-11) : la flûte de pan des anciens
    A1 = P2(LZ_CA, b(4))
    pan.mel(b(4), LZ_A, v=84)
    swamp(A1)
    pad(atm, A1, Voicer(55, 69, 3), v=50)
    hits(dr, b(4), 8, 4, SW)
    # A' (12-19) : shakuhachi, marimba
    A2 = P2(LZ_CA, b(12))
    shk.mel(b(12), LZ_A, v=84)
    swamp(A2, 1.05, marimba=True)
    pad(pad_, A2, Voicer(52, 67, 3), v=56)
    hits(dr, b(12), 8, 4, SW, 1.05)
    for k in (12, 16):
        tai.n(b(k), 1, 'A2', 84)
    # B (20-27) : phrygien, le réveil des anciens
    B1 = P2(LZ_CB, b(20))
    shk.mel(b(20), LZ_B, v=88)
    pad(hn, B1, Voicer(45, 60, 3), v=64); pad(tbn, B1, Voicer(41, 55, 3), v=60)
    pad(ooh, B1, Voicer(52, 67, 3), v=60); ooh.env((b(20), .6), (b(28), 1.1))
    swamp(B1, 1.05, kalimba=False, marimba=True)
    hits(dr, b(20), 8, 4, SW, 1.1)
    for k in range(20, 28):
        tai.n(b(k), 1, 'A2', 80 + (k - 20) * 3); tai.n(b(k) + 2.5, .5, 'D3', 64)
    tim.n(b(26), 2, 'E2', 80); roll(tim, b(27), 4, 'E2', 40, 104, rate=1 / 6)
    # A'' (28-35) : tout le marais
    A3 = P2(LZ_CA, b(28))
    pan.mel(b(28), LZ_A, v=88); shk.mel(b(28), LZ_A, v=82); vln.mel(b(28), LZ_A, v=84, tr=-12)
    pad(ooh, A3, Voicer(55, 72, 4), v=66); pad(hn, A3, Voicer(48, 62, 3), v=58)
    swamp(A3, 1.1, marimba=True)
    hits(dr, b(28), 8, 4, SW, 1.15)
    for k in range(28, 36):
        tai.n(b(k), 1, 'A2', 92); tai.n(b(k) + 2.5, .5, 'D3', 70)
    dr.n(b(28), 3, DR['cym1'], 60)
    # coda (36-37) : la kalimba seule, le bourdon
    Cd = [(b(36), b(2), 'Am')]
    arp(kal, Cd, [0, 2, 1, 3, 2, 1, 3, 2, 4, 3, 2, 1, 0, None, None, None], .5, 57, v=56, length=.8)
    atm.n(b(36), 8, 'A3', 56); atm.n(b(36), 8, 'E4', 50); cb.n(b(36), 8, 'A1', 62)
    pan.mel(b(37), 'E5:1 A5:3', v=70)
    hits(dr, b(36), 1, 4, [p for p in SW if p[2] in ('wood', 'lwood')], .7)
    S.dyn = [(0, -6), (b(4), -3), (b(12), -2), (b(20), -1), (b(28), 0), (b(36), -2), (b(38), -4)]
    S.eq = [('peak', 300, -2, .8), ('high', 6000, 2.5, .7)]
    return S


# =================================================================== NOMADES : « Les Caravanes du Vent » (ré hijaz, 4/4, rythme maqsum)
NO_A = chk('NO_A', 'D4:1 A4:1.5 Bb4:.5 A4:1 G4:.5 A4:.5 F#4:1 Eb4:1 D4:1 F#4:1 G4:1 A4:1 Bb4:1 C5:1.5 Bb4:.5 A4:2 '
           'D4:1 A4:1.5 Bb4:.5 A4:1 G4:.5 A4:.5 Bb4:1 C5:1 D5:1 Eb5:1 D5:1 C5:.5 Bb4:.5 A4:1 G4:.5 F#4:.5 Eb4:1 D4:2', 8)
NO_CA = 'D | Cm D Cm D | D Gm D Gm | Cm D | D | Gm Gm Cm Gm | Eb Bb Cm D | Cm D'
NO_B = chk('NO_B', 'Bb4:2 D5:2 C5:1 Bb4:1 A4:2 G4:2 Bb4:1 D5:1 Eb5:3 D5:1 Bb4:2 D5:2 C5:1 Eb5:1 D5:2 C5:1 Bb4:1 A4:1 G4:1 F#4:4', 8)
NO_CB = 'Gm Bb | F Bb F F | Gm | Cm Cm Cm Gm | Bb | Cm Gm | Cm Cm D Cm | D'


def nomad():
    S = Score('race_nomades', 100, tempo=[(0, 100), (36 * 4, 100), (38 * 4, 80)], tail=6)
    b = lambda n: n * 4
    ney = S.part('ney', GM['shakuhachi'], pan=-.08, db=-1, verb=.42, legato=.05, human=.7)
    sit = S.part('sitar', GM['sitar'], pan=.15, db=-4, verb=.35, human=.6)
    dul = S.part('santour', GM['dulcimer'], pan=-.3, db=-3, verb=.38, human=.5)
    gtr = S.part('oud', GM['nylon'], pan=.3, db=-3, verb=.32, human=.7)
    vln = S.part('violons', GM['strings'], pan=-.3, db=-1, verb=.4, legato=.06)
    vc = S.part('violoncelles', GM['cello'], pan=.28, db=-2, verb=.35, legato=.06)
    drone = S.part('bourdon', GM['slowstr'], pan=0, db=-8, verb=.45)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-5, verb=.28)
    hn = S.part('cors', GM['horn'], pan=-.2, db=-3, verb=.38, legato=.05)
    ooh = S.part('voix', GM['oohs'], pan=0, db=-6, verb=.5, width=1.3)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-9, verb=.32)
    dr = S.part('percussions', 48, drums=True, pan=.05, db=-7, verb=.3, human=.6)
    MAQ = [(0, .4, 'surdo', 96), (.5, .25, 'tamb', 58), (1.5, .25, 'tamb', 68), (2, .4, 'surdo', 84), (3, .25, 'tamb', 70), (3.5, .25, 'castanets', 48)]

    def caravan(ev, lvl=1., santour=True):
        if santour:
            arp(dul, ev, [0, 2, 3, 2, 1, 2, 3, 4], .25, 50, v=int(50 * lvl), length=.3)
        basspat(cb, ev, 4, [(0, .9, int(76 * lvl), 0), (2, .9, int(66 * lvl), 0), (3, .5, int(60 * lvl), 7)], 36, 47)

    def drone_d(t0, bars, v=62):
        drone.n(t0, b(bars) + .05, 'D2', v); drone.n(t0, b(bars) + .05, 'D3', v - 10)

    # mirage (0-3) : bourdon, santour en trémolo, appel du ney
    drone_d(0, 4, 56); drone.env((0, .4), (b(2), 1))
    for k in range(4):
        for j in range(16):
            dul.n(b(k) + j * .25, .3, ['D5', 'A4', 'Eb5', 'A4'][j % 4], 44 + (j % 4 == 0) * 10)
    ney.mel(b(1), 'D5:1 A5:2 Bb5:.5 A5:.5 G5:.5 F#5:.5 Eb5:1 D5:2', v=76)
    hits(dr, b(2), 2, 4, MAQ, .75)
    # A (4-11) : le ney mène la caravane
    A1 = P2(NO_CA, b(4))
    ney.mel(b(4), NO_A, v=86, tr=12)
    drone_d(b(4), 8, 52)
    caravan(A1)
    hits(dr, b(4), 8, 4, MAQ)
    # A' (12-19) : sitar et oud en hétérophonie
    A2 = P2(NO_CA, b(12))
    sit.mel(b(12), NO_A, v=88); gtr.mel(b(12), NO_A, v=78, tr=-12)
    caravan(A2, 1.05)
    hits(dr, b(12), 8, 4, MAQ, 1.05)
    # B (20-27) : le couchant, cordes à l'unisson
    B1 = P2(NO_CB, b(20))
    vln.mel(b(20), NO_B, v=90, tr=12); vc.mel(b(20), NO_B, v=82, tr=-12)
    pad(ooh, B1, Voicer(55, 71, 4), v=62)
    pad(hn, B1, Voicer(48, 62, 3), v=56)
    caravan(B1, 1.0, santour=False)
    arp(dul, B1, [0, 1, 2, 3, 4, 3, 2, 1], .5, 50, v=50, length=.5)
    hits(dr, b(20), 8, 4, MAQ, .95)
    tim_on(tim, B1, 4, 8, v=74)
    roll(tim, b(27), 4, 'A2', 40, 100, rate=1 / 6)
    # A'' (28-35) : toute la caravane
    A3 = P2(NO_CA, b(28))
    ney.mel(b(28), NO_A, v=90, tr=12); sit.mel(b(28), NO_A, v=86); vln.mel(b(28), NO_A, v=88, tr=12)
    gtr.mel(b(28), NO_A, v=80, tr=-12)
    pad(hn, A3, Voicer(50, 64, 3), v=66); pad(ooh, A3, Voicer(55, 72, 4), v=64)
    caravan(A3, 1.1)
    hits(dr, b(28), 8, 4, MAQ, 1.15)
    dr.n(b(28), 3, DR['cym1'], 70)
    tim_on(tim, A3, 4, 8, v=84)
    # coda (36-37) : cadence hijaz, mi bémol sur ré
    Cd = P2('Eb | D', b(36))
    for p, v, tr in ((ney, 90, 12), (sit, 86, 0), (vln, 86, 12)):
        p.mel(b(36), 'G4:.5 F#4:.5 Eb4:1 F#4:.5 G4:.5 A4:1 Bb4:.5 A4:.5 G4:.5 F#4:.5 Eb4:.5 F#4:.5 D4:4', v=v, tr=tr)
    pad(hn, Cd, Voicer(50, 64, 3), v=70); pad(ooh, Cd, Voicer(55, 72, 4), v=66)
    drone_d(b(37), 1, 64); cb.n(b(36), 4, 'Eb2', 80); cb.n(b(37), 5, 'D2', 84)
    hits(dr, b(36), 1, 4, MAQ, 1.1); dr.n(b(37), 3, DR['cym1'], 70); dr.n(b(37), .4, DR['surdo'], 100)
    tim.n(b(37), 2, 'D2', 96)
    S.dyn = [(0, -5), (b(4), -3), (b(12), -2), (b(20), -1), (b(28), 0), (b(36), 0), (b(38), -2)]
    S.eq = [('peak', 320, -2, .8), ('high', 6500, 2.5, .7)]
    return S


# =================================================================== HOMMES-BÊTES : « Le Rite des Cornes » (fa mineur, 6/8, médiantes de Myrror)
BE_A = chk('BE_A', 'F4:1 C5:2 Db5:1.5 C5:1.5 Bb4:1 Ab4:1 G4:1 C5:3 F4:1 C5:2 Db5:1 Eb5:1 F5:1 E5:1.5 C#5:.5 A4:1 F5:3', 8, 3)
BE_CA = 'Fm | Db C | Bbm C | C | Fm | Db | A | Db'
BE_HA = chk('BE_HA', 'Ab3:3 Ab3:1.5 G3:1.5 F3:1.5 G3:1.5 G3:3 Ab3:3 Ab3:3 A3:3 Ab3:3', 8, 3)
BE_B = chk('BE_B', 'F4:1.5 Ab4:1.5 C5:1 Bb4:.5 Ab4:1.5 Gb4:1.5 Bb4:1.5 Db5:1 C5:.5 Bb4:1.5 '
           'F4:1.5 Ab4:1.5 C5:1 Db5:.5 C5:1.5 E4:1.5 G4:1.5 C5:3', 8, 3)
BE_CB = 'Fm | Fm | Gb | Gb | Fm | Fm | C | C'


def beastmen():
    S = Score('race_hommesbetes', 96, meter=3, tempo=[(0, 96), (44 * 3, 96), (48 * 3, 74)], tail=7)
    b = lambda n: n * 3
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.4, legato=.04)
    hn2 = S.part('cors-2', GM['horn'], pan=-.28, db=-3, verb=.4, legato=.04)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-3, verb=.35)
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-5, verb=.3)
    low = S.part('cordes-galop', GM['strings'], pan=.25, db=-5, verb=.28, human=.4)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-2, verb=.42, legato=.06)
    pad_ = S.part('cordes-nappe', GM['slowstr'], pan=0, db=-7, verb=.5)
    glass = S.part('verre', GM['glass'], pan=.15, db=-10, verb=.6, width=1.4)
    crys = S.part('cristal', GM['crystal'], pan=-.3, db=-12, verb=.65)
    cel = S.part('celesta', GM['celesta'], pan=.35, db=-1, verb=.6)
    ch = S.part('choeur', GM['choir'], pan=0, db=-1, verb=.5, width=1.3, legato=.04)
    harp = S.part('harpe', GM['harp'], pan=-.42, db=-6, verb=.5)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-4, verb=.3)
    tai = S.part('taiko', GM['taiko'], pan=.05, db=-5, verb=.4, human=.4, hp=45)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-7, verb=.38, human=.4)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-11, verb=.4, human=.4)
    RITE = [(0, .5, 'A2', 104), (1.5, .5, 'A2', 88), (2.5, .5, 'D3', 70)]
    RDR = [(0, .5, 'bd', 96), (1.5, .5, 'bd', 76), (2.5, .25, 'sd', 54)]

    def magic(ev, v=52):
        pad(glass, ev, Voicer(60, 77, 3), v=v)
        arp(cel, ev, [4, None, 5, 3, None, 6], .5, 65, v=v - 8)

    # le cercle de pierres (0-3)
    I = P2('Fm | Fm | Fm | Fm', 0, 3)
    pad_.n(0, b(4), 'F2', 64); pad_.n(0, b(4), 'C3', 58); pad_.env((0, .4), (b(3), 1))
    magic(I, 46)
    hits(tai, 0, 4, 3, [(0, .5, 'A2', 90), (1.5, .5, 'A2', 66)], .8)
    hn.mel(b(1), 'F3:1 C4:2 Db4:1.5 C4:1.5', v=72); hn.env((b(1), .7), (b(4), 1))
    # A (4-11) : l'appel des cornes
    A1 = P2(BE_CA, b(4), 3)
    hn.mel(b(4), BE_A, v=92); tbn.mel(b(4), BE_A, v=80, tr=-12)
    pad(pad_, A1, Voicer(53, 70, 4), v=62)
    bassline(cb, A1, 36, 47, v=78); bassline(tba, A1, 29, 41, v=72)
    hits(tai, b(4), 8, 3, RITE, .9); hits(dr, b(4), 8, 3, RDR, .85)
    tim_on(tim, A1, 3, 8, v=84)
    # B (12-19) : la danse des centaures, chœur et trombones
    B1 = P2(BE_CB, b(12), 3)
    ch.mel(b(12), BE_B, v=86); tbn.mel(b(12), BE_B, v=84, tr=-12)
    gallop2(low, B1, 41, v=80)
    bassline(cb, B1, 36, 47, v=82); bassline(tba, B1, 29, 41, v=78)
    pad(hn2, B1, Voicer(50, 65, 3), v=66)
    hits(tai, b(12), 8, 3, RITE); hits(dr, b(12), 8, 3, RDR)
    dr.n(b(12), 2, DR['cym2'], 92)
    roll(tim, b(19), 3, 'C3', 50, 110, rate=.125)
    # A' (20-27) : les violons, la magie des pierres, contrechant des cors
    A2 = P2(BE_CA, b(20), 3)
    vln.mel(b(20), BE_A, v=90, tr=12); hn.mel(b(20), BE_A, v=82)
    hn2.mel(b(20), BE_HA, v=78)
    pad(pad_, A2, Voicer(53, 70, 4), v=64)
    magic(A2, 54)
    arp(harp, A2, [0, 1, 2, 3, 4, 5], .5, 41, v=56)
    bassline(cb, A2, 36, 47, v=78)
    hits(tai, b(20), 8, 3, RITE, .85)
    # B' (28-35) : la charge du minotaure
    B2 = P2(BE_CB, b(28), 3)
    ch.mel(b(28), BE_B, v=92); hn.mel(b(28), BE_B, v=96); tbn.mel(b(28), BE_B, v=92, tr=-12)
    vln.mel(b(28), BE_B, v=90, tr=12)
    gallop2(low, B2, 41, v=86)
    bassline(cb, B2, 36, 47, v=88); bassline(tba, B2, 29, 41, v=84)
    hits(tai, b(28), 8, 3, RITE, 1.1); hits(dr, b(28), 8, 3, RDR, 1.1)
    for k in (28, 32):
        dr.n(b(k), 2, DR['cym2'], 104)
    tim_on(tim, B2, 3, 8, v=96, also=1.5)
    roll(dr, b(35), 3, DR['sd'], 40, 110, rate=.125)
    # A'' (36-43) : le rite à son sommet
    A3 = P2(BE_CA, b(36), 3)
    hn.mel(b(36), BE_A, v=100); vln.mel(b(36), BE_A, v=96, tr=12); tbn.mel(b(36), BE_A, v=94, tr=-12)
    ch.mel(b(36), BE_A, v=88); hn2.mel(b(36), BE_HA, v=88)
    pad(pad_, A3, Voicer(53, 70, 4), v=70)
    magic(A3, 56)
    gallop2(low, A3, 41, v=86)
    bassline(cb, A3, 36, 47, v=90); bassline(tba, A3, 29, 41, v=86)
    hits(tai, b(36), 8, 3, RITE, 1.15); hits(dr, b(36), 8, 3, RDR, 1.1)
    dr.n(b(36), 2, DR['cym2'], 110); dr.n(b(40), 2, DR['cym2'], 100)
    tim_on(tim, A3, 3, 8, v=100, also=1.5)
    # coda (44-47) : la quinte des cornes, la médiante de Myrror, le silence des pierres
    Cd = P2('Fm | Db | A | Fm', b(44), 3)
    Cd = Cd[:-1] + [(b(47), 6, 'Fm')]
    hn.mel(b(44), 'F4:1 C5:2 F5:3 E5:3 F5:6', v=98); tbn.mel(b(44), 'F3:1 C4:2 Db4:3 C#4:3 C4:6', v=90)
    ch.mel(b(44), 'Ab4:3 Ab4:3 A4:3 Ab4:6', v=88)
    pad(pad_, Cd, Voicer(53, 70, 4), v=70); magic(Cd, 52)
    bassline(cb, Cd, 36, 47, v=86); bassline(tba, Cd, 29, 41, v=84)
    harp.chord(b(47), 6, ['F2', 'C3', 'F3', 'Ab3', 'C4', 'F4', 'Ab4', 'C5'], v=66, roll=.08)
    tai.n(b(47), 1, 'A2', 112); dr.n(b(47), 3, DR['cym2'], 100); roll(tim, b(47), 4, 'F2', 100, 50, rate=1 / 6)
    S.dyn = [(0, -6), (b(4), -2), (b(12), -1), (b(20), -2), (b(28), 0), (b(36), 0), (b(44), 0), (b(49), -3)]
    S.eq = [('peak', 340, -2, .8), ('high', 6500, 3, .7)]
    return S


# =================================================================== ELFES NOIRS : « La Valse des Ombres » (si mineur, valse 3/4)
DE_MB = chk('DE_MB', 'F#6:.5 D6:.5 B5:.5 C#6:.5 D6:1 E6:.5 C#6:.5 A#5:.5 B5:.5 C#6:1', 2, 3)
DE_A = chk('DE_A', 'B4:1 F#5:2 G5:1 F#5:1 E5:1 D5:1 C#5:1 B4:1 A#4:3 B4:1 F#5:2 G5:1 A5:1 B5:1 C6:1.5 B5:.5 A#5:1 B5:3', 8, 3)
DE_CA = 'Bm | Em Bm Em | Bm F# Bm | F# | Bm | Em | C F# | Bm'
DE_HA = chk('DE_HA', 'D4:3 B3:3 F#4:3 C#4:3 D4:3 E4:3 E4:1.5 C#4:1.5 D4:3', 8, 3)
DE_B = chk('DE_B', 'D5:2 G5:1 F#5:1 E5:1 D5:1 C#5:2 E5:1 D5:3 D5:2 G5:1 Bb5:1 A5:1 G5:1 F#5:1.5 E5:.5 C#5:1 F#5:3', 8, 3)
DE_CB = 'G | D | A | Bm | Gm | Gm D Gm | F# | F#'


def darkelf():
    S = Score('race_elfesnoirs', 120, meter=3, tempo=[(0, 120), (52 * 3, 120), (56 * 3, 84)], tail=7)
    b = lambda n: n * 3
    solo = S.part('violon-solo', GM['violin'], pan=-.15, db=0, verb=.42, legato=.05)
    hps = S.part('clavecin', GM['harpsichord'], pan=.3, db=-5, verb=.35, human=.4)
    cel = S.part('boite-a-musique', GM['celesta'], pan=.35, db=-1, verb=.55)
    pz = S.part('pizzicati', GM['pizz'], pan=.35, db=-3, verb=.3, human=.5)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-2, verb=.42, legato=.06)
    pad_ = S.part('cordes-nappe', GM['slowstr'], pan=0, db=-7, verb=.48)
    cl = S.part('clarinette-basse', GM['clarinet'], pan=-.2, db=-4, verb=.4, legato=.05)
    org = S.part('orgue', GM['organ'], pan=0, db=-12, verb=.55)
    ooh = S.part('choeur', GM['oohs'], pan=0, db=-8, verb=.55, width=1.4)
    glass = S.part('verre', GM['glass'], pan=-.2, db=-12, verb=.6)
    harp = S.part('harpe', GM['harp'], pan=-.42, db=-6, verb=.45)
    hn = S.part('cors', GM['horn'], pan=-.22, db=-3, verb=.42, legato=.05)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-7, verb=.38)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-5, verb=.32)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-6, verb=.38)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-12, verb=.45)

    def waltz(ev, v=66, hv=56, harpsi=True):
        basspat(pz, ev, 3, [(0, .5, v, 0)], 35, 46)
        if harpsi:
            strum(hps, ev, Voicer(55, 69, 3), 3, [(1, .45, hv), (2, .45, hv - 6)], roll_=.012)

    # boîte à musique (0-3)
    I = P2('Bm | F# | Bm | F#', 0, 3)
    cel.mel(0, DE_MB + ' ' + DE_MB, v=66)
    strum(hps, I[2:], Voicer(55, 69, 3), 3, [(1, .45, 48), (2, .45, 44)], roll_=.012)
    pz.n(b(2), .5, 'B1', 58); pz.n(b(3), .5, 'F#2', 58)
    # A (4-11) : le violon des ombres
    A1 = P2(DE_CA, b(4), 3)
    solo.mel(b(4), DE_A, v=88)
    waltz(A1)
    pad(glass, A1, Voicer(59, 74, 3), v=46)
    # A' (12-19) : boîte à musique et violon, clarinette en contrechant
    A2 = P2(DE_CA, b(12), 3)
    solo.mel(b(12), DE_A, v=84, tr=12); cel.mel(b(12), DE_A, v=58, tr=12)
    cl.mel(b(12), DE_HA, v=70)
    waltz(A2, 68, 58)
    # B (20-27) : les cordes, le chœur, sol mineur emprunté
    B1 = P2(DE_CB, b(20), 3)
    vln.mel(b(20), DE_B, v=88)
    pad(ooh, B1, Voicer(55, 72, 4), v=62)
    pad(pad_, B1, Voicer(50, 66, 3), v=58)
    waltz(B1, 70, 56)
    arp(harp, B1, [0, 1, 2, 3, 4, 3], .5, 43, v=52)
    # A'' (28-35) : le violon sur l'orgue, timbales
    A3 = P2(DE_CA, b(28), 3)
    solo.mel(b(28), DE_A, v=92)
    for t, d, sym in A3:
        org.n(t, d + .05, bass_note(sym, 35, 46), 70); org.n(t, d + .05, bass_note(sym, 35, 46) + 12, 60)
    waltz(A3, 72, 60)
    pad(glass, A3, Voicer(59, 74, 3), v=50)
    tim_on(tim, A3, 3, 8, v=70)
    # B' (36-43) : tutti sombre
    B2 = P2(DE_CB, b(36), 3)
    vln.mel(b(36), DE_B, v=94); solo.mel(b(36), DE_B, v=86, tr=12); hn.mel(b(36), DE_B, v=80, tr=-12)
    pad(ooh, B2, Voicer(55, 74, 4), v=70); pad(tbn, B2, Voicer(45, 60, 3), v=62)
    waltz(B2, 76, 62)
    arp(harp, B2, [0, 1, 2, 3, 4, 3], .5, 43, v=58)
    tim_on(tim, B2, 3, 8, v=80)
    dr.n(b(36), 2, DR['cym1'], 70)
    # A''' (44-51) : la valse au complet
    A4 = P2(DE_CA, b(44), 3)
    vln.mel(b(44), DE_A, v=96, tr=12); solo.mel(b(44), DE_A, v=90); hn.mel(b(44), DE_HA, v=82, tr=-12)
    cl.mel(b(44), DE_HA, v=72)
    pad(ooh, A4, Voicer(55, 74, 4), v=72); pad(tbn, A4, Voicer(45, 60, 3), v=66)
    for t, d, sym in A4:
        org.n(t, d + .05, bass_note(sym, 35, 46), 76)
    waltz(A4, 78, 64)
    tim_on(tim, A4, 3, 8, v=86)
    dr.n(b(44), 2, DR['cym2'], 84); dr.n(b(48), 2, DR['cym1'], 70)
    # coda (52-55) : la boîte à musique ralentit et se tait
    Cd = P2('Bm | F# | Bm | Bm', b(52), 3)
    cel.mel(b(52), DE_MB + ' F#6:.5 D6:.5 B5:.5 C#6:.5 D6:1 B5:3', v=60)
    pz.n(b(52), .5, 'B1', 56); pz.n(b(53), .5, 'F#2', 54); pz.n(b(54), .5, 'B1', 52)
    pad(pad_, Cd, Voicer(50, 66, 3), v=50); pad(glass, Cd, Voicer(59, 74, 3), v=44)
    harp.chord(b(55), 3, ['B1', 'F#2', 'B2', 'D3', 'F#3', 'B3'], v=54, roll=.1)
    S.dyn = [(0, -6), (b(4), -3), (b(12), -3), (b(20), -1), (b(28), -1), (b(36), 0), (b(44), 0), (b(52), -4), (b(56), -6)]
    S.eq = [('peak', 320, -2, .8), ('high', 6500, 3, .7)]
    return S
# =================================================================== DRACONIENS : « Les Ailes de Braise » (mi bémol lydien, 6/8, puis fa)
DR_A = chk('DR_A', 'Eb4:1 Bb4:2 C5:1 D5:.5 Eb5:1.5 D5:1 C5:.5 Bb4:1.5 F5:3 Eb4:1 Bb4:2 C5:1 D5:.5 Eb5:1 F5:.5 G5:1.5 A5:1.5 Bb5:3', 8, 3)
DR_CA = 'Eb | Ab | Bb | F | Eb | Cm F7 | C F | Bb'
DR_CA2 = 'F | Bb | C | G | F | Dm G7 | D G | C'
DR_B = chk('DR_B', 'C5:1 G5:2 Ab5:1 G5:.5 F5:1.5 Eb5:1 D5:.5 C5:1.5 B4:3 C5:1 G5:2 Ab5:1 Bb5:.5 C6:1.5 B5:1 G5:.5 F5:1 D5:.5 G5:3', 8, 3)
DR_CB = 'Cm | Fm | Cm | G | Cm | Ab | G7 | G'
DR_C = 'Ab | Bb | Gm | Cm | Ab | Bb | C | C7'
DR_HC = chk('DR_HC', 'Eb5:3 F5:3 D5:3 Eb5:3 C5:3 D5:3 E5:3 E5:3', 8, 3)
DR_TC = chk('DR_TC', 'Ab5:3 Bb5:3 Bb5:3 G5:3 Ab5:3 Bb5:3 G5:3 Bb5:3', 8, 3)


def draconian():
    S = Score('race_draconiens', 104, meter=3, tempo=[(0, 104), (44 * 3, 104), (48 * 3, 80)], tail=6)
    b = lambda n: n * 3
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.38, legato=.04)
    hn2 = S.part('cors-2', GM['horn'], pan=-.28, db=-3, verb=.38, legato=.04)
    tpt = S.part('trompettes', GM['trumpet'], pan=.15, db=0, verb=.34, legato=.03)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-4, verb=.32)
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-6, verb=.25)
    vln = S.part('violons', GM['strings'], pan=-.35, db=-1, verb=.4, legato=.05)
    runs = S.part('traits', GM['strings'], pan=-.3, db=-7, verb=.35, human=.3)
    trem = S.part('tremolos', GM['trem'], pan=-.2, db=-9, verb=.4)
    low = S.part('cordes-ailes', GM['strings'], pan=.25, db=-5, verb=.28, human=.4)
    pad_ = S.part('cordes-nappe', GM['slowstr'], pan=0, db=-7, verb=.45)
    ch = S.part('choeur', GM['choir'], pan=0, db=-4, verb=.48, width=1.3, legato=.04)
    harp = S.part('harpe', GM['harp'], pan=-.42, db=-5, verb=.45)
    glk = S.part('glockenspiel', GM['glock'], pan=.3, db=-5, verb=.5)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-4, verb=.28)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-6, verb=.32, human=.4)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-10, verb=.36, human=.4)

    def fire(ev, v=70):
        """traits ascendants de cordes en fin de mesure : les flammes"""
        for t, d, sym in ev:
            tl = tones(sym, 60)
            tt = t + d - 1.5
            for i in range(6):
                runs.n(tt + i * .25, .25, tl[min(i + 1, len(tl) - 1)], v + i * 4)

    def wings(ev, v=78):
        gallop2(low, ev, 39, v=v)

    def swell(t, d=3, v1=80):
        roll(dr, t, d, DR['cym1'], 10, v1, rate=1 / 6)

    # l'envol (0-3) : trémolos, cymbale qui gonfle, appel du cor
    I = P2('Eb | Eb | Ab/Eb | Eb', 0, 3)
    pad(trem, I, Voicer(55, 72, 4), v=60); trem.env((0, .3), (b(3), 1))
    cb.n(0, b(4), 'Eb2', 66)
    hn.mel(b(1), 'Eb4:1 Bb4:2 C5:1 D5:.5 Eb5:1.5', v=84, tr=-12)
    swell(b(2), 6, 90)
    harp.mel(b(3), 'Eb3:.25 G3:.25 Bb3:.25 Eb4:.25 G4:.25 Bb4:.25 Eb5:.25 G5:.25 Bb5:1', v=70)
    # A (4-11) : les cors en vol
    A1 = P2(DR_CA, b(4), 3)
    hn.mel(b(4), DR_A, v=94, tr=-12); hn2.mel(b(4), DR_A, v=82, tr=-24)
    pad(pad_, A1, Voicer(55, 72, 4), v=62)
    bassline(cb, A1, 36, 47, v=80)
    wings(A1, 70)
    arp(harp, A1, [0, 1, 2, 3, 4, 5], .5, 39, v=56)
    tim_on(tim, A1, 3, 8, v=80)
    # A' (12-19) : trompettes et violons, chœur, les flammes
    A2 = P2(DR_CA, b(12), 3)
    tpt.mel(b(12), DR_A, v=98); vln.mel(b(12), DR_A, v=92, tr=12)
    pad(ch, A2, Voicer(57, 74, 4), v=74)
    pad(tbn, A2, Voicer(46, 62, 3), v=70)
    bassline(cb, A2, 36, 47, v=84); bassline(tba, A2, 31, 43, v=76)
    wings(A2, 80)
    fire([e for e in A2 if e[1] >= 3], 64)
    tim_on(tim, A2, 3, 8, v=88, also=1.5)
    dr.n(b(12), 2, DR['cym2'], 98); dr.n(b(16), 2, DR['cym2'], 90)
    # B (20-27) : ut mineur, la braise du chœur
    B1 = P2(DR_CB, b(20), 3)
    ch.mel(b(20), DR_B, v=90, tr=-12); vln.mel(b(20), DR_B, v=88)
    pad(trem, B1, Voicer(55, 72, 4), v=64)
    pad(hn2, B1, Voicer(50, 65, 3), v=64)
    bassline(cb, B1, 36, 47, v=82); bassline(tba, B1, 31, 43, v=74)
    wings(B1, 80)
    tim_on(tim, B1, 3, 8, v=86)
    swell(b(27), 3, 96)
    # C (28-35) : le vol au-dessus des nuées
    C1 = P2(DR_C, b(28), 3)
    hn.mel(b(28), DR_HC, v=94); hn2.mel(b(28), DR_HC, v=86, tr=-12); tpt.mel(b(28), DR_TC, v=92)
    pad(ch, C1, Voicer(55, 72, 4), v=78)
    bassline(cb, C1, 36, 47, v=86); bassline(tba, C1, 31, 43, v=80)
    wings(C1, 86)
    fire(C1, 70)
    for k in range(28, 36):
        tim.n(b(k), .5, bass_note(at(C1, b(k)), 38, 50), 84 + (k - 28) * 3)
    dr.n(b(28), 2, DR['cym2'], 100)
    swell(b(35), 3, 104); roll(tim, b(35) + 1.5, 1.5, 'C3', 70, 118, rate=.125)
    # A'' (36-43) : un ton plus haut, fa lydien, tous les dragons
    A3 = P2(DR_CA2, b(36), 3)
    tpt.mel(b(36), DR_A, v=104, tr=2); vln.mel(b(36), DR_A, v=98, tr=14); hn.mel(b(36), DR_A, v=96, tr=-10)
    pad(ch, A3, Voicer(57, 76, 4), v=86); pad(tbn, A3, Voicer(46, 62, 3), v=80)
    bassline(cb, A3, 36, 47, v=90); bassline(tba, A3, 31, 43, v=86)
    wings(A3, 88)
    fire([e for e in A3 if e[1] >= 3], 72)
    arp(harp, A3, [0, 2, 3, 4, 5, 6], .5, 41, v=64)
    tim_on(tim, A3, 3, 8, v=98, also=1.5)
    dr.n(b(36), 2, DR['cym2'], 112); dr.n(b(40), 2, DR['cym2'], 104)
    glk.mel(b(39), 'D6:1 G6:2', v=56); glk.mel(b(43), 'E6:1 C7:2', v=56)
    # coda (44-47) : l'atterrissage
    Cd = P2('F | Bb/F C/F | F', b(44), 3)
    Cd = Cd[:-1] + [(b(46), 6, 'F')]
    tpt.mel(b(44), 'F4:1 C5:2 D5:1.5 E5:1.5 F5:6', v=104); vln.mel(b(44), 'F5:1 C6:2 D6:1.5 E6:1.5 F6:6', v=96)
    hn.mel(b(44), 'F3:1 C4:2 D4:1.5 C4:1.5 C4:6', v=96)
    pad(ch, Cd, Voicer(57, 76, 4), v=88); pad(tbn, Cd, Voicer(46, 62, 3), v=84)
    bassline(cb, Cd, 36, 47, v=90); bassline(tba, Cd, 29, 41, v=88)
    harp.chord(b(46), 6, ['F1', 'C2', 'F2', 'A2', 'C3', 'F3', 'A3', 'C4', 'F4', 'A4', 'C5'], v=80, roll=.05)
    roll(tim, b(46), 4.5, 'C3', 104, 60, rate=1 / 6); tim.n(b(46) + 4.6, 1.4, 'F2', 112)
    dr.n(b(46), 3, DR['cym2'], 112); dr.n(b(46), 1, DR['bd'], 110)
    S.dyn = [(0, -5), (b(4), -2), (b(12), 0), (b(20), -2), (b(28), 0), (b(36), 0), (b(48), 0)]
    S.eq = [('peak', 330, -1.5, .8), ('high', 7000, 2.5, .7)]
    return S


# =================================================================== NAINS : « Le Chant de l'Enclume » (ré mineur, 4/4)
DW_A = chk('DW_A', 'D4:1.5 D4:.5 A4:2 G4:1 F4:1 E4:1 D4:1 C4:1.5 D4:.5 E4:1 F4:1 E4:2 A3:2 '
           'D4:1.5 D4:.5 A4:2 Bb4:1 A4:1 G4:1 F4:1 G4:1 F4:1 E4:1 C#4:1 D4:4', 8)
DW_CA = 'Dm | C F A Dm | C C C F | A | Dm | Bb F Gm Gm | Gm A | Dm'
DW_B = chk('DW_B', 'F4:1.5 F4:.5 C5:2 Bb4:1 A4:1 G4:2 A4:1.5 A4:.5 D5:2 C5:4 '
           'F4:1.5 F4:.5 C5:2 D5:1 C5:1 Bb4:1 A4:1 G4:1 A4:1 Bb4:1 G4:1 A4:4', 8)
DW_CB = 'F | Bb F C C | Dm | C | F | Dm Dm Bb F | Gm F C7 C7 | A'


def dwarf():
    S = Score('race_nains', 96, tempo=[(0, 96), (40 * 4, 96), (42 * 4, 76)], tail=6)
    b = lambda n: n * 4
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-1, verb=.32)
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.36, legato=.04)
    hn2 = S.part('cors-2', GM['horn'], pan=-.28, db=-6, verb=.36, legato=.04)
    tpt = S.part('trompettes', GM['trumpet'], pan=.15, db=-3, verb=.32, legato=.03)
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-4, verb=.25)
    bsn = S.part('bassons', GM['bassoon'], pan=.2, db=-3, verb=.3)
    ch = S.part('choeur-d-hommes', GM['choir'], pan=0, db=-3, verb=.45, width=1.3, legato=.04)
    low = S.part('cordes-graves', GM['strings'], pan=.25, db=-5, verb=.3)
    pad_ = S.part('cordes-nappe', GM['slowstr'], pan=-.05, db=-7, verb=.42)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-3, verb=.25)
    anv = S.part('enclume', GM['agogo'], pan=-.15, db=-2, verb=.35, human=.3)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-5, verb=.32, human=.4)
    tai = S.part('taiko', GM['taiko'], pan=.05, db=-6, verb=.32, human=.4, hp=45)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-11, verb=.3, human=.4)
    ANV = [(1, .2, 'A5', 92), (3, .2, 'A5', 98), (3.5, .2, 'E6', 66)]
    HAM = [(0, .5, 'A2', 104), (2, .5, 'A2', 92)]
    HDR = [(0, .5, 'bd', 100), (2, .5, 'bd', 88), (1, .25, 'sd', 54), (3, .25, 'sd', 62)]

    def forge(t0, bars, lvl=1.):
        hits(anv, t0, bars, 4, ANV, lvl); hits(tai, t0, bars, 4, HAM, lvl); hits(dr, t0, bars, 4, HDR, lvl)

    # la forge s'allume (0-3)
    I = P2('Dm | Dm | Dm | Dm', 0)
    bsn.n(0, 16, 'D2', 66); tba.n(0, 16, 'D2', 62); ch.n(b(2), 8, 'D3', 64); ch.n(b(2), 8, 'A3', 58)
    hits(anv, 0, 4, 4, ANV, .8); hits(tai, b(1), 3, 4, HAM, .8)
    roll(tim, b(3) + 2, 2, 'A2', 40, 104, rate=1 / 6)
    # A (4-11) : le chant des marteaux, trombones et bassons
    A1 = P2(DW_CA, b(4))
    tbn.mel(b(4), DW_A, v=96, tr=-12); bsn.mel(b(4), DW_A, v=86, tr=-12)
    bassline(cb, A1, 33, 45, v=82); bassline(tba, A1, 29, 41, v=78)
    pad(low, A1, Voicer(43, 57, 3), v=62)
    forge(b(4), 8)
    tim_on(tim, A1, 4, 8, v=84)
    # A' (12-19) : le chœur d'hommes, cors à l'octave
    A2 = P2(DW_CA, b(12))
    ch.mel(b(12), DW_A, v=92, tr=-12); hn.mel(b(12), DW_A, v=88)
    pad(pad_, A2, Voicer(50, 65, 3), v=60)
    bassline(cb, A2, 33, 45, v=86); bassline(tba, A2, 29, 41, v=82)
    forge(b(12), 8, 1.05)
    tim_on(tim, A2, 4, 8, v=88, also=2)
    dr.n(b(12), 2, DR['cym2'], 92)
    # B (20-27) : fa majeur, la grande salle sous la montagne
    B1 = P2(DW_CB, b(20))
    hn.mel(b(20), DW_B, v=94); tpt.mel(b(20), DW_B, v=86)
    tbn.mel(b(20), DW_B, v=86, tr=-12)
    pad(ch, B1, Voicer(48, 64, 3), v=76)
    bassline(cb, B1, 33, 45, v=86); bassline(tba, B1, 29, 41, v=84)
    forge(b(20), 8, 1.05)
    tim_on(tim, B1, 4, 8, v=90)
    dr.n(b(20), 2, DR['cym2'], 98)
    # C (28-31) : l'enclume seule, le bourdon des voix
    C1 = P2('Dm | Dm | Dm | A', b(28))
    ch.n(b(28), 14, 'D3', 78); ch.n(b(28), 14, 'A3', 72); ch.n(b(31) + 2, 2, 'C#4', 74); ch.n(b(31) + 2, 2, 'E3', 72)
    low.n(b(28), 16, 'D2', 72); low.env((b(28), .7), (b(32), 1.2))
    for k in range(4):
        t = b(28 + k)
        anv.mel(t, 'A5:.25 A5:.25 r:.5 A5:.5 E6:.25 A5:.25 r:.5 A5:.25 A5:.25 A5:.5 E6:.5', v=96)
        tim.n(t, .5, 'D2', 92); tim.n(t + 2, .5, 'A2', 84)
    roll(tim, b(31), 4, 'A2', 50, 116, rate=.125); roll(dr, b(31) + 2, 2, DR['sd'], 40, 110, rate=.125)
    # A'' (32-39) : toute la montagne chante
    A3 = P2(DW_CA, b(32))
    tpt.mel(b(32), DW_A, v=102, tr=12); hn.mel(b(32), DW_A, v=98); tbn.mel(b(32), DW_A, v=96, tr=-12)
    ch.mel(b(32), DW_A, v=94, tr=-12)
    pad(pad_, A3, Voicer(53, 69, 4), v=70); pad(hn2, A3, Voicer(50, 64, 3), v=72)
    bassline(cb, A3, 33, 45, v=92); bassline(tba, A3, 29, 41, v=90)
    forge(b(32), 8, 1.12)
    tim_on(tim, A3, 4, 8, v=98, also=2)
    dr.n(b(32), 2, DR['cym2'], 110); dr.n(b(36), 2, DR['cym2'], 100)
    # coda (40-41) : le dernier coup de marteau
    for p, v, tr in ((tpt, 104, 12), (hn, 100, 0), (tbn, 98, -12), (ch, 96, -12)):
        p.mel(b(40), 'D4:1.5 D4:.5 A4:2 D4:4', v=v, tr=tr)
    tba.mel(b(40), 'D2:4 D2:4', v=94); cb.mel(b(40), 'D2:4 D2:4', v=94)
    pad(pad_, [(b(41), 4, 'Dm')], Voicer(53, 69, 4), v=72)
    forge(b(40), 1, 1.15)
    anv.n(b(41), .3, 'A5', 112); tai.n(b(41), 1, 'A2', 118); tim.n(b(41), 2, 'D2', 116); dr.n(b(41), 3, DR['cym2'], 110)
    S.dyn = [(0, -5), (b(4), -2), (b(12), -1), (b(20), 0), (b(28), -2), (b(31), 0), (b(32), 0), (b(42), 0)]
    S.eq = [('low', 80, -1.5, .7), ('peak', 300, -2, .8), ('high', 6500, 2.5, .7)]
    return S


# =================================================================== TROLLS : « Le Pas des Géants » (do dièse mineur, 4/4)
TR_A = chk('TR_A', 'C#4:2 G#4:2 A4:1.5 G#4:.5 F#4:1 E4:1 D#4:2 E4:1 F#4:1 G#4:4 '
           'C#4:2 G#4:2 B4:1.5 A4:.5 G#4:1 F#4:1 E4:1.5 D#4:.5 B#3:2 C#4:4', 8)
TR_CA = 'C#m | A F#m | B B E B | G# | C#m | E C#m | E G# | C#m'
TR_B = chk('TR_B', 'C#5:4 E5:4 C#5:4 A4:4 D5:4 F#5:4 D#5:4 B#4:4', 8)
TR_CB = 'A | A | F#m | F#m | D | D | G# | G#'


def troll():
    S = Score('race_trolls', 76, tempo=[(0, 76), (28 * 4, 76), (31 * 4, 60)], tail=7)
    b = lambda n: n * 4
    tba = S.part('tuba', GM['tuba'], pan=.35, db=-1, verb=.3)
    tbn = S.part('trombones', GM['trombone'], pan=.3, db=-1, verb=.34)
    hn = S.part('cors', GM['horn'], pan=-.2, db=0, verb=.4, legato=.05)
    bsn = S.part('bassons', GM['bassoon'], pan=.2, db=-3, verb=.32)
    low = S.part('cordes-graves', GM['strings'], pan=.25, db=-4, verb=.32)
    vc = S.part('violoncelles', GM['cello'], pan=.28, db=-2, verb=.36, legato=.05)
    cb = S.part('contrebasses', GM['contrabass'], pan=.35, db=-2, verb=.28)
    ch = S.part('choeur', GM['choir'], pan=0, db=-3, verb=.5, width=1.3, legato=.05)
    ooh = S.part('bourdon-des-voix', GM['oohs'], pan=0, db=-6, verb=.55)
    glass = S.part('verre', GM['glass'], pan=.15, db=-8, verb=.6)
    tai = S.part('taiko', GM['taiko'], pan=.05, db=-2, verb=.45, human=.3, hp=40)
    tim = S.part('timbales', GM['timpani'], pan=0, db=-2, verb=.4, human=.3)
    dr = S.part('percussions', 48, drums=True, pan=0, db=-8, verb=.42, human=.3)
    STOMP = [(0, 1, 'A2', 112), (2, 1, 'A2', 100)]
    SDR = [(0, .5, 'bd', 112), (2, .5, 'bd', 100), (3.5, .25, 'sd', 46)]
    RUSH = [(i * .5, .4, 'A2' if i % 2 == 0 else 'D3', 104 if i % 4 == 0 else 76) for i in range(8)]

    def stomp(t0, bars, lvl=1.):
        hits(tai, t0, bars, 4, STOMP, lvl); hits(dr, t0, bars, 4, SDR, lvl)
        for k in range(bars):
            tim.n(t0 + k * 4, 1, 'C#2', int(100 * lvl))

    # les géants approchent (0-3) : un pas, puis deux, de plus en plus près
    cb.n(0, 16, 'C#2', 70); ooh.n(b(1), 12, 'C#3', 60); ooh.n(b(2), 8, 'G#3', 54)
    for k, lv in enumerate((.45, .6, .78, .92)):
        stomp(b(k), 1, lv)
    low.n(b(2), 8, 'C#2', 66); low.env((b(2), .4), (b(4), 1))
    # A (4-11) : le pas des géants, cuivres graves
    A1 = P2(TR_CA, b(4))
    tbn.mel(b(4), TR_A, v=98, tr=-12); tba.mel(b(4), TR_A, v=92, tr=-24); bsn.mel(b(4), TR_A, v=84, tr=-12)
    bassline(cb, A1, 33, 44, v=86)
    pad(low, A1, Voicer(43, 57, 3), v=66)
    pad(ooh, A1, Voicer(48, 62, 3), v=58)
    stomp(b(4), 8)
    # B (12-19) : la ruée des mammouths, chœur et cors
    B1 = P2(TR_CB, b(12))
    ch.mel(b(12), TR_B, v=92, tr=-12); hn.mel(b(12), TR_B, v=94, tr=-12)
    pad(tbn, B1, Voicer(43, 58, 3), v=82)
    bassline(cb, B1, 33, 44, v=90); bassline(tba, B1, 28, 40, v=88)
    pad(glass, B1, Voicer(60, 75, 3), v=48)
    hits(tai, b(12), 8, 4, RUSH, 1.); hits(dr, b(12), 8, 4, SDR, 1.05)
    for k in range(12, 20):
        tim.n(b(k), 1, bass_note(at(B1, b(k)), 37, 49), 100)
    dr.n(b(12), 3, DR['cym2'], 100); dr.n(b(16), 3, DR['cym2'], 100)
    roll(tim, b(19), 4, 'G#2', 60, 120, rate=.125)
    # A' (20-27) : tous les géants, le thème au-dessus de la terre qui tremble
    A2 = P2(TR_CA, b(20))
    hn.mel(b(20), TR_A, v=100); tbn.mel(b(20), TR_A, v=98, tr=-12); tba.mel(b(20), TR_A, v=94, tr=-24)
    ch.mel(b(20), TR_A, v=92, tr=-12); vc.mel(b(20), TR_A, v=86, tr=-12)
    pad(low, A2, Voicer(43, 57, 3), v=74); pad(ooh, A2, Voicer(52, 67, 3), v=62)
    bassline(cb, A2, 33, 44, v=92)
    stomp(b(20), 8, 1.1)
    dr.n(b(20), 3, DR['cym2'], 108)
    # coda (28-30) : trois pas qui ébranlent la montagne
    for k in range(3):
        t = b(28 + k)
        for p, v, tr in ((hn, 100, 0), (tbn, 100, -12), (ch, 96, -12)):
            p.chord(t, 2.5 if k < 2 else 6, [P('C#4') + tr, P('G#4') + tr, P('E4') + tr], v)
        tba.n(t, 2.5 if k < 2 else 6, 'C#2', 100); cb.n(t, 2.5 if k < 2 else 6, 'C#2', 100)
        tai.n(t, 1.5, 'A2', 116 + k * 3); tim.n(t, 1.5, 'C#2', 112 + k * 4); dr.n(t, 1, DR['bd'], 114)
    dr.n(b(30), 4, DR['cym2'], 116)
    S.dyn = [(0, -4), (b(4), -1), (b(12), 0), (b(20), 0), (b(31), 0)]
    S.eq = [('low', 60, -2, .7), ('peak', 280, -2.5, .8), ('high', 6000, 3, .7)]
    return S


PIECES = {'highmen': highmen, 'orc': orc, 'barbarian': barbarian, 'gnoll': gnoll, 'halfling': halfling, 'highelf': highelf,
          'klackon': klackon, 'lizardman': lizardman, 'nomad': nomad, 'beastmen': beastmen, 'darkelf': darkelf,
          'draconian': draconian, 'dwarf': dwarf, 'troll': troll}
