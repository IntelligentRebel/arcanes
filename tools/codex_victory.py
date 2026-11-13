#!/usr/bin/env python3
"""Texte à envoyer à Codex pour l'illustration de la victoire d'un sorcier : python3 tools/codex_victory.py conquest aldoran -> stdout.
conquest : tous ses rivaux sont tombés, il règne sur les deux plans. mastery : il accomplit le Sort de Maîtrise.
L'image sert aussi de défaite au joueur quand c'est un rival qui l'emporte. Les sorciers : ceux de tools/codex_fall.py."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
DIR = 'E:\\Logiciels IA\\Codex\\Arcanes\\'
import importlib.util
spec = importlib.util.spec_from_file_location('fall', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'codex_fall.py'))
src = open(spec.origin, encoding='utf-8').read().split('kind, wid = sys.argv[1], sys.argv[2]')[0]
ns = {}; exec(src, ns); W, STYLE = ns['W'], ns['STYLE']
DARK = {'vorgath', 'malivra', 'brakkon'}
SCENE = {
 'conquest': ("The triumph of a wizard who now rules the whole world. {who} stands on the highest rampart of their capital, staff or hand raised high, triumphant. "
              "Below spreads a vast city, and in its great square armies of many different peoples parade in endless ranks; the banners of the fallen rival wizards, plain dark cloth without any symbol, are thrown down at the foot of the walls. "
              "The sky is split in two: on one side the familiar sky of this world, on the other the strange violet sky and floating lands of the other plane, both now under the wizard's rule. "
              "{mood} The wizard is the focus, in the left or centre third, seen from the waist or knees up, face clearly recognisable, with an expression of triumph; {col} light and banners in those colours dominate the scene."),
 'mastery': ("The Spell of Mastery is complete. {who} stands at the very top of a tall tower above the clouds, both arms raised, as a colossal pillar of {col} light bursts from their hands into the heavens. "
             "From that pillar, rings of magic sweep across the whole world below; on the horizon every magic node answers with a beam of its own, and the clouds spiral around the tower. "
             "Far below, tiny armies kneel, their plain banners in the wizard's colours, without any heraldic animal. {mood} The wizard is the focus, in the centre, seen from the waist or knees up, face clearly recognisable, with an expression of absolute power."),
}
MOOD = {True: "A grim, dark triumph under a stormy blood-red sky.", False: "A radiant, glorious triumph under a golden sky."}
kind, wid = sys.argv[1], sys.argv[2]
who, col = W[wid]
who = "The wizard, " + who + " (exactly the character of the second reference image: same face, hair, clothes and colours)"
refs = [DIR + 'magicRelay.jpg', DIR + 'ref_wizard_' + wid + '.png']
print("Generate exactly one image with your image generation tool (image_gen), then answer only \"ok\". "
      "Do not run any shell command and do not read or write any other file.\n"
      "referenced_image_paths, in this order: " + json.dumps(refs, ensure_ascii=False) + "\n"
      "Size: 1536x1024 (landscape).\n"
      "Image prompt (pass it unchanged):\n\n" + SCENE[kind].format(who=who, col=col, mood=MOOD[wid in DARK]) + "\n\n" + STYLE)
