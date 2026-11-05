#!/usr/bin/env python3
"""Un tour de la chaîne Codex : python3 tools/codex_cycle.py <dossier>:<N42> ... -> détoure, contrôle, planche-contact.
<dossier> : préfixe du dossier de fil dans /mnt/user-data/uploads/generated_images (la dernière image du dossier est prise).
La planche-contact (fond gris, cases repérées) va dans le bloc-notes : contact.jpg."""
import glob, os, subprocess, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = '/mnt/user-data/uploads/generated_images'
OUT = os.path.join(ROOT, 'art', 'incoming', 'anim')
SCR = '/tmp/claude-0/-home-claude/8f18b999-80b5-5aa0-894b-c23c246e8288/scratchpad'
row = []
for arg in sys.argv[1:]:
    d, sid = arg.split(':')
    src = sorted(glob.glob(os.path.join(G, d + '*', 'exec-*.png')), key=os.path.getmtime)[-1]
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'codex_cut.py'), src, sid], capture_output=True, text=True)
    print((r.stdout.strip() or r.stderr.strip()[-300:]))
    f = next(iter(glob.glob(os.path.join(OUT, sid + '_anim_*.png'))), None)
    if f:
        im = Image.open(f); bg = Image.new('RGBA', im.size, (128, 128, 128, 255)); bg.alpha_composite(im)
        h = 1000; t = bg.convert('RGB').resize((round(im.width * h / im.height), h)); ImageDraw.Draw(t).text((4, 4), sid, fill=(255, 255, 0))
        row.append(t)
if row:
    c = Image.new('RGB', (sum(t.width for t in row) + 8 * len(row), 1000), 'white'); x = 0
    for t in row: c.paste(t, (x, 0)); x += t.width + 8
    c.save(os.path.join(SCR, 'contact.jpg'), quality=78)
