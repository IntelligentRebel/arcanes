#!/usr/bin/env python3
"""Moteur musical d'Arcanes : des partitions écrites en Python deviennent des pistes orchestrales.

Échantillons : SoundFont GeneralUser GS 2.0 (S. Christian Collins, licence libre, usage commercial permis),
joués par TinySoundFont. Chaque pupitre est rendu à part, puis : nuances (courbes d'expression), panoramique
façon orchestre, réverbération de salle de concert (réponse impulsionnelle synthétique), compression douce,
limiteur, encodage Ogg Vorbis.

Notation : temps en noires (beats). Hauteurs en notation anglaise ('C4' = do du milieu = 60, 'Bb3', 'F#5').
Mélodies : chaîne 'D4:1 A4:2 r:.5 G4:.5:90' (hauteur:durée[:vélocité]), 'r' = silence.
"""
import os, re, math, random, subprocess
import numpy as np
from scipy import signal, ndimage
import tinysoundfont

SR = 44100
SF2 = os.environ.get('ARCANES_SF2', '/home/claude/mrbumpy409/generaluser-gs/GeneralUser-GS.sf2')

# programmes General MIDI utilisés (numérotation 0-127)
GM = dict(piano=0, celesta=8, glock=9, musicbox=10, vibes=11, marimba=12, bells=14, dulcimer=15, organ=19,
          nylon=24, violin=40, viola=41, cello=42, contrabass=43, trem=44, pizz=45, harp=46, timpani=47,
          strings=48, slowstr=49, choir=52, oohs=53, hit=55, trumpet=56, trombone=57, tuba=58, horn=60,
          brass=61, oboe=68, ehorn=69, bassoon=70, clarinet=71, piccolo=72, flute=73, recorder=74, panflute=75,
          shakuhachi=77, ocarina=79, fantasia=88, warmpad=89, spacevoice=91, glass=92, halo=94, sweep=95,
          soundtrack=97, crystal=98, atmosphere=99, sitar=104, koto=107, kalimba=108, bagpipe=109, fiddle=110,
          taiko=116, melotom=117, revcym=119, harpsichord=6, xylophone=13, accordion=21, tinkle=112, agogo=113,
          steeldrum=114, woodblock=115)

# kit orchestral GS (banque 128, preset 48)
DR = dict(bd=36, bd2=35, sd=38, sd2=40, castanets=39, crash=49, splash=55, cym2=57, cym1=59, tamb=54,
          tri=81, mtri=80, ride=51, chimes=84, wood=76, lwood=77, surdo=87, msurdo=86)

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def P(s):
    """'C#4' -> 61 ; un entier passe tel quel."""
    if isinstance(s, (int, np.integer)):
        return int(s)
    m = re.match(r'^([A-G])(#|b|)(-?\d)$', s.strip())
    if not m:
        raise ValueError('hauteur illisible : %r' % s)
    n = NOTE[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return 12 * (int(m.group(3)) + 1) + n


# ---------------------------------------------------------------- accords et conduite des voix
QUAL = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10], 'maj7': [0, 4, 7, 11],
        'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'dim': [0, 3, 6], 'aug': [0, 4, 8], 'add9': [0, 4, 7, 14],
        'madd9': [0, 3, 7, 14], '5': [0, 7], 'm6': [0, 3, 7, 9], '6': [0, 4, 7, 9], '7sus4': [0, 5, 7, 10],
        'm9': [0, 3, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14], 'dim7': [0, 3, 6, 9], 'mb6': [0, 3, 7, 8]}


def chord_pcs(sym):
    """'Dm' -> (2, [0,3,7]) ; 'C/E' -> basse E. Renvoie (fondamentale, intervalles, basse)."""
    base, _, bass = sym.partition('/')
    m = re.match(r'^([A-G])(#|b|)(.*)$', base)
    root = (NOTE[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)) % 12
    iv = QUAL[m.group(3)]
    if bass:
        mb = re.match(r'^([A-G])(#|b|)$', bass)
        b = (NOTE[mb.group(1)] + (1 if mb.group(2) == '#' else -1 if mb.group(2) == 'b' else 0)) % 12
    else:
        b = root
    return root, iv, b


def bass_note(sym, lo=36, hi=50):
    _, _, b = chord_pcs(sym)
    n = lo + ((b - lo) % 12)
    return n if n <= hi else n - 12


class Voicer:
    """Voicings serrés à n voix dans un registre, chaque accord au plus près du précédent (conduite des voix)."""

    def __init__(self, lo, hi, n=4):
        self.lo, self.hi, self.n, self.prev = lo, hi, n, None

    def __call__(self, sym):
        for strict in (2, 1, 0):
            r = self._voice(sym, strict)
            if r:
                self.prev = r
                return r
        raise ValueError('aucun voicing pour %s dans %d-%d' % (sym, self.lo, self.hi))

    def _voice(self, sym, strict):
        root, iv, _ = chord_pcs(sym)
        pcs = [(root + i) % 12 for i in iv]
        # toutes les notes candidates du registre
        cand = [p for p in range(self.lo, self.hi + 1) if p % 12 in pcs]
        best, bscore = None, 1e9
        # combinaisons de n notes couvrant au moins la fondamentale, la tierce (ou quarte) et si possible la quinte
        import itertools
        for combo in itertools.combinations(cand, self.n):
            if max(combo) - min(combo) > 16:
                continue
            got = {c % 12 for c in combo}
            need = {pcs[0], pcs[1]} if len(pcs) > 1 else {pcs[0]}
            if not need <= got:
                continue
            if strict >= 2 and len(pcs) >= 4 and pcs[3] not in got:
                continue
            gaps = np.diff(combo)
            if (gaps < 2).any():
                continue
            # pas de neuvième mineure (note grave un demi-ton sous une note aiguë, à l'octave)
            if strict >= 1 and any((hi - lo) % 12 == 1 for i, lo in enumerate(combo) for hi in combo[i + 1:]):
                continue
            if self.prev is None:
                s = abs(np.mean(combo) - (self.lo + self.hi) / 2)
            else:
                s = sum(abs(a - b) for a, b in zip(sorted(combo), self.prev))
            s += 0.3 * (len(pcs) - len(got))
            if s < bscore:
                best, bscore = sorted(combo), s
        return best


# ---------------------------------------------------------------- partitions
class Part:
    def __init__(self, score, name, prog, bank=0, pan=0., db=0., verb=.3, drums=False, legato=0., human=1.,
                 width=1., hp=0, lp=0):
        self.score, self.name, self.prog, self.bank = score, name, prog, bank
        self.pan, self.db, self.verb, self.drums = pan, db, verb, drums
        self.legato, self.human, self.width, self.hp, self.lp = legato, human, width, hp, lp
        self.notes, self.expr = [], []

    def n(self, t, d, p, v=80):
        self.notes.append([float(t), float(d), P(p), int(v)])
        return t + d

    def chord(self, t, d, ps, v=80, roll=0.):
        for i, p in enumerate(ps):
            self.n(t + i * roll, d - i * roll, p, v)
        return t + d

    def mel(self, t, s, v=80, tr=0, dyn=None):
        """Mélodie en notation compacte ; dyn = fonction (temps relatif) -> delta de vélocité."""
        t0 = t
        for tok in s.split():
            parts = tok.split(':')
            d = float(eval(parts[1])) if len(parts) > 1 else 1.
            vv = int(parts[2]) if len(parts) > 2 else v
            if parts[0] != 'r':
                ps = parts[0].split('+')  # accord 'D4+A4:1'
                for p in ps:
                    self.n(t, d, P(p) + tr, vv + (dyn(t - t0) if dyn else 0))
            t += d
        return t

    def env(self, *pts):
        """Courbe d'expression : env((t0, g0), (t1, g1), ...) en gain linéaire."""
        self.expr += [(float(a), float(b)) for a, b in pts]
        return self


class Score:
    def __init__(self, name, bpm, meter=4, tempo=None, tail=5.):
        self.name, self.bpm, self.meter, self.tail = name, bpm, meter, tail
        self.tempo = tempo or [(0, bpm)]
        self.dyn = []  # nuances globales [(temps, dB)]
        self.parts = []
        self._grid = None

    def part(self, *a, **k):
        p = Part(self, *a, **k)
        self.parts.append(p)
        return p

    def bar(self, b):
        """début de la mesure b (numérotée à partir de 0) en noires"""
        return b * self.meter

    def length(self):
        return max((n[0] + n[1] for p in self.parts for n in p.notes), default=0)

    def sec(self, beat):
        if self._grid is None:
            end = self.length() + 64
            g = np.arange(0, end, 1 / 64)
            tb = np.array([x for x, _ in self.tempo] + [end + 1])
            tv = np.array([v for _, v in self.tempo] + [self.tempo[-1][1]])
            bpm = np.interp(g, tb, tv)
            secs = np.concatenate([[0], np.cumsum(60 / bpm[:-1] / 64)])
            self._grid = (g, secs)
        g, secs = self._grid
        return float(np.interp(beat, g, secs))


# ---------------------------------------------------------------- rendu d'un pupitre
_SFDATA = None


def _sf_bytes():
    global _SFDATA
    if _SFDATA is None:
        with open(SF2, 'rb') as f:
            _SFDATA = f.read()
    return _SFDATA


def render_part(part, total_sec):
    score = part.score
    syn = tinysoundfont.Synth(gain=-6, samplerate=SR)
    sfid = syn.sfload(_sf_bytes(), max_voices=512)
    syn.program_select(0, sfid, part.bank if not part.drums else 128, part.prog, part.drums)
    rng = random.Random(score.name + part.name)
    hum = part.human
    ev = []
    for t, d, p, v in sorted(part.notes):
        jit = 0 if hum == 0 else max(-.016, min(.016, rng.gauss(0, .0055 * hum)))
        s0 = score.sec(t) + jit + .03
        s1 = score.sec(t + d) + .03 + (score.sec(t + d) - score.sec(t)) * part.legato
        s1 = max(s1, s0 + .04)
        vel = int(max(1, min(127, round(v + (rng.gauss(0, 3.5 * hum) if hum else 0)))))
        ev.append([s0, s1, p, vel])
    # même touche rejouée avant la fin de la précédente : on coupe la précédente juste avant
    byk = {}
    for e in ev:
        byk.setdefault(e[2], []).append(e)
    for lst in byk.values():
        lst.sort()
        for a, b in zip(lst, lst[1:]):
            if a[1] > b[0] - .004:
                a[1] = max(a[0] + .02, b[0] - .004)
    evs = []
    for s0, s1, p, vel in ev:
        evs.append((int(s0 * SR), 1, p, vel))
        if not part.drums:
            evs.append((int(s1 * SR), 0, p, 0))
    evs.sort(key=lambda x: (x[0], x[1]))
    N = int(total_sec * SR)
    out = np.zeros((N, 2), np.float32)
    pos = 0
    for smp, kind, p, vel in evs + [(N, -1, 0, 0)]:
        smp = min(smp, N)
        if smp > pos:
            buf = syn.generate(smp - pos)
            out[pos:smp] = np.frombuffer(buf, np.float32).reshape(-1, 2)
            pos = smp
        if kind == 1:
            syn.noteon(0, p, vel)
        elif kind == 0:
            syn.noteoff(0, p)
    return out


def expr_curve(part, n):
    if not part.expr:
        return None
    pts = sorted(part.expr)
    ts = np.array([part.score.sec(t) + .03 for t, _ in pts]) * SR
    gs = np.array([g for _, g in pts])
    return np.interp(np.arange(n), ts, gs).astype(np.float32)


import json as _json
_CAL = _json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'calibration.json')))
_PROGNAME = {}
for _k, _v in GM.items():
    _PROGNAME.setdefault(_v, _k)


def process_stem(part, x):
    cal = 0 if part.drums else _CAL.get(_PROGNAME.get(part.prog), 0)
    x = x * 10 ** (cal / 20)
    if part.hp:
        x = signal.sosfilt(signal.butter(2, part.hp, 'highpass', fs=SR, output='sos'), x, axis=0)
    if part.lp:
        x = signal.sosfilt(signal.butter(2, part.lp, 'lowpass', fs=SR, output='sos'), x, axis=0)
    c = expr_curve(part, len(x))
    if c is not None:
        x = x * c[:, None]
    # largeur stéréo (mid/side) puis panoramique à puissance constante
    if part.width != 1:
        m, s = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2 * part.width
        x = np.stack([m + s, m - s], 1)
    a = (part.pan + 1) * math.pi / 4
    x = x * np.array([math.cos(a), math.sin(a)], np.float32) * math.sqrt(2)
    return (x * 10 ** (part.db / 20)).astype(np.float32)


# ---------------------------------------------------------------- réverbération de salle
def hall_ir(rt=2.3, length=3.4, predelay=.024, seed=11, dark=1.):
    rng = np.random.default_rng(seed)
    n = int(length * SR)
    t = np.arange(n) / SR
    bands = [(None, 220, rt * 1.2), (220, 1200, rt), (1200, 4500, rt * .72 / dark), (4500, None, rt * .42 / dark)]
    ir = np.zeros((n, 2))
    for ch in range(2):
        noise = rng.standard_normal(n)
        acc = np.zeros(n)
        for lo, hi, r in bands:
            if lo is None:
                sos = signal.butter(2, hi, 'lowpass', fs=SR, output='sos')
            elif hi is None:
                sos = signal.butter(2, lo, 'highpass', fs=SR, output='sos')
            else:
                sos = signal.butter(2, [lo, hi], 'bandpass', fs=SR, output='sos')
            acc += signal.sosfilt(sos, noise) * np.exp(-6.91 * t / r)
        acc *= np.minimum(1, t / .07) ** 1.5  # montée de la densité de la queue
        ir[:, ch] = acc
    # premières réflexions (murs latéraux, plafond)
    taps = [(.011, .55, 0), (.017, .5, 1), (.023, .42, 0), (.031, .38, 1), (.043, .3, 0), (.052, .28, 1), (.067, .22, 0), (.074, .2, 1)]
    for ch in range(2):
        e_tail = np.sum(ir[:, ch] ** 2)
        gs = [g for _, g, c in taps if c == ch]
        k = math.sqrt(.3 * e_tail / sum(g * g for g in gs))
        for dt, g, c in taps:
            if c == ch:
                ir[int(dt * SR), ch] += g * k
    ir = np.concatenate([np.zeros((int(predelay * SR), 2)), ir])
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    return ir.astype(np.float32)


# ---------------------------------------------------------------- mastering
def block_env(x, blk):
    n = len(x) // blk * blk
    a = np.abs(x[:n]).max(1).reshape(-1, blk).max(1)
    return a


def compress(x, thr_db, ratio=2., att=.02, rel=.25, blk=64):
    """compresseur RMS doux, calculé par blocs"""
    n = len(x) // blk * blk
    p = (x[:n] ** 2).mean(1).reshape(-1, blk).mean(1)
    lvl = 10 * np.log10(p + 1e-12)
    over = np.maximum(0, lvl - thr_db)
    gr = -over * (1 - 1 / ratio)  # dB
    # lissage attaque / relâchement
    fs = SR / blk
    aa, ra = math.exp(-1 / (att * fs)), math.exp(-1 / (rel * fs))
    g = np.zeros_like(gr)
    cur = 0.
    for i, v in enumerate(gr):
        cur = aa * cur + (1 - aa) * v if v < cur else ra * cur + (1 - ra) * v
        g[i] = cur
    gl = 10 ** (g / 20)
    gs = np.interp(np.arange(len(x)), np.arange(len(gl)) * blk + blk / 2, gl)
    return x * gs[:, None]


def limit(x, ceil=.89, rel=.12, blk=32):
    n = len(x) // blk * blk
    pk = np.abs(x[:n]).max(1).reshape(-1, blk).max(1)
    pk = ndimage.maximum_filter1d(pk, 3, origin=-1)  # anticipe le bloc suivant
    need = np.minimum(1, ceil / np.maximum(pk, 1e-9))
    fs = SR / blk
    ra = math.exp(-1 / (rel * fs))
    g = np.ones_like(need)
    cur = 1.
    for i, v in enumerate(need):
        cur = v if v < cur else ra * cur + (1 - ra) * v
        g[i] = cur
    gs = np.interp(np.arange(len(x)), np.arange(len(g)) * blk, g)
    y = x * gs[:, None]
    return np.clip(y, -ceil, ceil)


def loud_level(x):
    """niveau des passages forts : 90e centile de la puissance par fenêtres de 400 ms (dBFS)"""
    w = int(.4 * SR)
    n = len(x) // w * w
    p = (x[:n] ** 2).mean(1).reshape(-1, w).mean(1)
    p = p[p > 1e-7]
    return 10 * np.log10(np.percentile(p, 90) + 1e-12)


def render(score, out_dir, target=-17., verb_rt=2.3, verb_db=0., dark=1., comp=True, fade_out=None, stems=False, eq=None):
    total = score.sec(score.length()) + .03 + score.tail
    mix = np.zeros((int(total * SR), 2), np.float32)
    send = np.zeros_like(mix)
    for p in score.parts:
        if not p.notes:
            continue
        x = process_stem(p, render_part(p, total))
        mix += x
        send += x * p.verb
    ir = hall_ir(rt=verb_rt, dark=dark)
    wet = np.stack([signal.oaconvolve(send[:, c], ir[:, c])[:len(send)] for c in range(2)], 1)
    mix = mix + wet * 10 ** (verb_db / 20)
    if score.dyn:
        ts = np.array([score.sec(t) + .03 for t, _ in score.dyn]) * SR
        g = 10 ** (np.interp(np.arange(len(mix)), ts, [d for _, d in score.dyn]) / 20)
        mix *= g[:, None].astype(np.float32)
    mix = signal.sosfilt(signal.butter(4, 32, 'highpass', fs=SR, output='sos'), mix, axis=0).astype(np.float32)
    # égalisation de mastering : un peu moins de bas-médium, un peu d'air
    for kind, f0, g, q in (eq if eq is not None else getattr(score, 'eq', None) or [('peak', 320, -1.5, .8), ('high', 7000, 2., .7)]):
        mix = signal.sosfilt(biquad(kind, f0, g, q), mix, axis=0).astype(np.float32)
    lvl = loud_level(mix)
    mix *= 10 ** ((target - lvl) / 20)
    if comp:
        mix = compress(mix, target - 4, ratio=1.8)
        lvl = loud_level(mix)
        mix *= 10 ** ((target - lvl) / 20)
    if fade_out:
        n = int(fade_out * SR)
        mix[-n:] *= np.linspace(1, 0, n)[:, None] ** 2
    # silence final rogné (queue de réverbération sous -70 dB)
    a = np.abs(mix).max(1)
    last = np.nonzero(a > 10 ** (-70 / 20))[0]
    if len(last):
        mix = mix[:last[-1] + int(.05 * SR)]
    mix = limit(mix)
    os.makedirs(out_dir, exist_ok=True)
    wav = os.path.join(out_dir, score.name + '.wav')
    write_wav(wav, mix)
    return wav, mix


def biquad(kind, f0, gain_db=0., Q=.707):
    """filtres RBJ (peaking, lowshelf, highshelf) -> sos"""
    A = 10 ** (gain_db / 40)
    w = 2 * math.pi * f0 / SR
    c, sn = math.cos(w), math.sin(w)
    al = sn / (2 * Q)
    if kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    else:
        sq = 2 * math.sqrt(A) * al
        if kind == 'low':
            b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
            a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
        else:
            b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
            a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    return np.array([b + a]) / a[0]


def write_wav(path, x):
    import wave
    y = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(y.tobytes())


def encode(wav, ogg, q=4):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', str(q), ogg], check=True)
    return os.path.getsize(ogg)


# ---------------------------------------------------------------- aides d'écriture
def prog(spec, t0=0., bar=4):
    """'Dm | Bb | Gm C | A' -> [(t, d, accord)] ; plusieurs accords dans une mesure se la partagent également."""
    out = []
    for i, b in enumerate(spec.split('|')):
        syms = b.split()
        for j, sym in enumerate(syms):
            out.append((t0 + i * bar + j * bar / len(syms), bar / len(syms), sym))
    return out


def tones(sym, lo):
    """notes de l'accord en arpège montant : fondamentale, quinte, puis toutes les notes de l'accord à partir de l'octave"""
    root, iv, b = chord_pcs(sym)
    r = lo + ((root - lo) % 12)
    pcs = {(root + i) % 12 for i in iv}
    out = [r] + ([r + 7] if (root + 7) % 12 in pcs else [])
    return out + [p for p in range(r + 12, r + 44) if p % 12 in pcs]


def pad(part, events, voicer, v=70, over=.05):
    for t, d, sym in events:
        part.chord(t, d + over, voicer(sym), v)


def bassline(part, events, lo=36, hi=50, v=80, octave=False, over=.03):
    for t, d, sym in events:
        b = bass_note(sym, lo, hi)
        part.n(t, d + over, b, v)
        if octave:
            part.n(t, d + over, b - 12, v - 8)


def arp(part, events, pat, step, lo, v=70, accent=8, length=None):
    """pat : indices dans tones(accord, lo) ; une note tous les `step` temps, durée `length` (défaut 1.6*step)."""
    for t, d, sym in events:
        tl = tones(sym, lo)
        k, tt = 0, t
        while tt < t + d - 1e-6:
            idx = pat[k % len(pat)]
            if idx is not None:
                part.n(tt, length or step * 1.6, tl[min(idx, len(tl) - 1)], v + (accent if k % len(pat) == 0 else 0))
            k += 1
            tt += step


def bars_of(mel, bar):
    """durées cumulées d'une mélodie, pour vérifier qu'aucune note ne déborde d'une barre de mesure par erreur"""
    t, out = 0., []
    for tok in mel.split():
        d = float(eval(tok.split(':')[1])) if ':' in tok else 1.
        out.append(t); t += d
    return t, t / bar
