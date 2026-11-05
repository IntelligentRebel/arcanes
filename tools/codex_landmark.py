#!/usr/bin/env python3
"""Illustrations des grands ouvrages rendues par Codex : python3 tools/codex_landmark.py <début d'id de fil>:<ouvrage> ...
-> assets/landmarks/<ouvrage>.jpg (1536 x 1024, JPEG qualité 90, comme magicRelay.jpg) et une planche-contact (contact_lm.jpg)."""
import glob, os, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = '/mnt/user-data/uploads/generated_images'
SCR = '/tmp/claude-0/-home-claude/8f18b999-80b5-5aa0-894b-c23c246e8288/scratchpad'
row = []
SUB = sys.argv[sys.argv.index('--dir') + 1] if '--dir' in sys.argv else 'landmarks'   # --dir events : illustrations des événements
args = [a for i, a in enumerate(sys.argv[1:], 1) if a != '--dir' and sys.argv[i - 1] != '--dir']
for arg in args:
    d, lid = arg.split(':')
    src = sorted(glob.glob(os.path.join(G, d + '*', 'exec-*.png')), key=os.path.getmtime)[-1]
    im = Image.open(src)
    if im.mode == 'RGBA':
        bg = Image.new('RGBA', im.size, (0, 0, 0, 255)); bg.alpha_composite(im); im = bg
    im = im.convert('RGB')
    if im.size != (1536, 1024): im = im.resize((1536, 1024), Image.LANCZOS)
    os.makedirs(os.path.join(ROOT, 'assets', SUB), exist_ok=True); dst = os.path.join(ROOT, 'assets', SUB, lid + '.jpg')
    im.save(dst, quality=90, optimize=True)
    print(lid, im.size, os.path.getsize(dst) // 1024, 'Ko <-', os.path.basename(os.path.dirname(src)))
    t = im.resize((576, 384)); ImageDraw.Draw(t).text((6, 6), lid, fill=(255, 255, 0)); row.append(t)
if row:
    cols = min(3, len(row)); rows = (len(row) + cols - 1) // cols
    c = Image.new('RGB', (cols * 584, rows * 392), 'white')
    for i, t in enumerate(row): c.paste(t, ((i % cols) * 584, (i // cols) * 392))
    c.save(os.path.join(SCR, 'contact_lm.jpg'), quality=80)
