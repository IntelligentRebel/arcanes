#!/usr/bin/env python3
"""Texte à envoyer à Codex pour une planche du lot 7 : python3 tools/codex_job.py N39 -> stdout."""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = 'E:\\Logiciels IA\\Codex\\Arcanes\\'
L = json.load(open(os.path.join(ROOT, 'art', 'anim_lot7', 'lot7.json')))
s = next(x for x in L if x['file'].startswith(sys.argv[1] + '_'))
p = open(os.path.join(ROOT, 'art', 'anim_lot7', 'prompts', s['file'][:-4] + '.txt'), encoding='utf-8').read()
refs = [DIR + '00_style.png'] + [DIR + 'ref_' + u + '.png' for u in s['units']]
print("Generate exactly one image with your image generation tool (image_gen), then answer only \"ok\". "
      "Do not run any shell command and do not read or write any other file.\n"
      "referenced_image_paths, in this order: " + json.dumps(refs, ensure_ascii=False) + "\n"
      "Image prompt (pass it unchanged):\n\n" + p)
