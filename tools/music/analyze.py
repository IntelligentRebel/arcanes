#!/usr/bin/env python3
"""Contrôles d'une partition et de son rendu, sans l'écouter :
- frottements : notes tenues à un demi-ton (ou neuvième mineure) l'une de l'autre, longtemps, entre pupitres ;
- tessitures : notes hors de la tessiture raisonnable de chaque instrument ;
- spectrogramme et courbe de niveau du mixage (image PNG).
Usage : python3 analyze.py titre [dossier_wav]"""
import sys, os
import numpy as np
from engine import *
import pieces

RANGE = {GM['violin']: (55, 96), GM['strings']: (28, 98), GM['slowstr']: (28, 96), GM['viola']: (48, 84),
         GM['cello']: (36, 76), GM['contrabass']: (28, 55), GM['horn']: (34, 77), GM['trumpet']: (52, 84),
         GM['trombone']: (40, 72), GM['tuba']: (26, 58), GM['flute']: (60, 96), GM['oboe']: (58, 91),
         GM['clarinet']: (50, 91), GM['bassoon']: (34, 72), GM['piccolo']: (74, 108), GM['harp']: (24, 103),
         GM['celesta']: (60, 108), GM['glock']: (67, 108), GM['timpani']: (36, 57), GM['choir']: (43, 81),
         GM['oohs']: (43, 81), GM['ehorn']: (52, 81), GM['pizz']: (28, 96), GM['trem']: (28, 96)}


def clashes(score, min_dur=.75, min_overlap=.5):
    notes = []
    for p in score.parts:
        if p.drums or p.prog in (GM['timpani'], GM['taiko'], GM['melotom']):
            continue
        for t, d, k, v in p.notes:
            if d >= min_dur:
                notes.append((t, t + d, k, p.name))
    notes.sort()
    out = []
    for i, (a0, a1, ka, pa) in enumerate(notes):
        for b0, b1, kb, pb in notes[i + 1:]:
            if b0 >= a1:
                break
            ov = min(a1, b1) - max(a0, b0)
            if ov >= min_overlap and abs(ka - kb) % 12 in (1, 11) and abs(ka - kb) < 24:
                out.append((max(a0, b0), ka, pa, kb, pb, ov))
    return out


def ranges(score):
    bad = []
    for p in score.parts:
        r = RANGE.get(p.prog)
        if not r or p.drums:
            continue
        for t, d, k, v in p.notes:
            if not r[0] <= k <= r[1]:
                bad.append((t, p.name, k))
    return bad


NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']


def nn(k):
    return NAMES[k % 12] + str(k // 12 - 1)


def spectrogram(wav_path, png, score=None):
    import wave
    from PIL import Image, ImageDraw
    with wave.open(wav_path) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, 2).mean(1) / 32768
    f, t, S = signal.spectrogram(x, SR, nperseg=4096, noverlap=4096 - 1024)
    S = 10 * np.log10(S + 1e-12)
    # axe log en fréquence 40 Hz - 12 kHz
    fl = np.geomspace(40, 12000, 300)
    img = np.array([np.interp(fl, f, S[:, i]) for i in range(S.shape[1])]).T[::-1]
    img = np.clip((img + 110) / 70, 0, 1)
    W = min(1800, img.shape[1])
    im = Image.fromarray((img * 255).astype(np.uint8)).resize((W, 300))
    im = im.convert('RGB')
    # courbe de niveau (fenêtres 400 ms)
    win = int(.4 * SR)
    n = len(x) // win * win
    lv = 10 * np.log10((x[:n] ** 2).reshape(-1, win).mean(1) + 1e-12)
    H = 120
    out = Image.new('RGB', (W, 300 + H), (20, 20, 24))
    out.paste(im, (0, 0))
    d = ImageDraw.Draw(out)
    pts = [(i * W / len(lv), 300 + H - (max(-50, l) + 50) / 50 * H) for i, l in enumerate(lv)]
    d.line(pts, fill=(255, 200, 80), width=2)
    for db in (-10, -20, -30, -40):
        y = 300 + H - (db + 50) / 50 * H
        d.line([(0, y), (W, y)], fill=(70, 70, 80))
        d.text((2, y - 10), str(db), fill=(160, 160, 160))
    if score:
        dur = len(x) / SR
        bar = score.meter
        nb = int(score.length() // bar) + 1
        for k in range(0, nb, 4):
            xx = (score.sec(k * bar) + .03) / dur * W
            d.line([(xx, 0), (xx, 300 + H)], fill=(90, 160, 255))
            d.text((xx + 2, 2), str(k), fill=(200, 220, 255))
    out.save(png)


if __name__ == '__main__':
    name = sys.argv[1]
    sc = pieces.PIECES[name]()
    c = clashes(sc)
    print('frottements (demi-ton tenu) :', len(c))
    for t, ka, pa, kb, pb, ov in c[:40]:
        print('  mesure %d temps %.2f : %s %s / %s %s (%.2f t)' % (t // sc.meter, t % sc.meter + 1, pa, nn(ka), pb, nn(kb), ov))
    r = ranges(sc)
    print('hors tessiture :', len(r))
    for t, p, k in r[:20]:
        print('  mesure %d %s %s' % (t // sc.meter, p, nn(k)))
    if len(sys.argv) > 2:
        wav = os.path.join(sys.argv[2], sc.name + '.wav')
        spectrogram(wav, os.path.join(sys.argv[2], sc.name + '.png'), sc)
        print('spectrogramme :', os.path.join(sys.argv[2], sc.name + '.png'))
