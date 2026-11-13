#!/usr/bin/env python3
"""Texte à envoyer à Codex pour l'illustration d'une crise vaincue : python3 tools/codex_finale_end.py prophet -> stdout.
Références : le style (magicRelay.jpg) et l'illustration du début de la même crise (ref_finale_<crise>.jpg), dont on garde
le monstre, le lieu et la palette. Le vainqueur reste anonyme : des soldats de peuples mêlés, de dos, sans sorcier reconnaissable."""
import json, sys
DIR = 'E:\\Logiciels IA\\Codex\\Arcanes\\'
STYLE = ("Highly detailed painted fantasy illustration with a fine pixel-art texture, rich saturated colours, dramatic lighting, the same rendering style as the first reference image. "
         "Wide landscape composition, 3:2. No text, no letters, no numbers, no frame, no border, no watermark, no user interface.")
VICTORS = ("The victors stay anonymous: a few soldiers of mixed peoples and armours, seen from behind or in the distance, no wizard, no recognisable hero, no banner with a symbol. ")
SCENE = {
 'prophet': ("The defeat of the Prophet. The same city square, the same prophet and the same crowd as in the second reference image, at the cold grey hour just after dawn, the fire of the night burnt out. "
             "The prophet lies motionless across his overturned wooden cart, his raised fist now open and empty, the golden light that blazed in it gone out; his ragged robes trail on the cobblestones. Not gory: no blood. "
             "The crowd is breaking up and fleeing down the side streets, pitchforks and hammers dropped, torches lying smoking on the ground. The purple sun banners are torn down and trampled in the mud. "
             "In the background, soldiers with ropes haul the toppled statue of the wizard back upright. The mood is one of sudden silence after a storm, sombre and final. The fallen prophet is the focus, in the centre."),
 'lich': ("The end of the Lich Lord. The same lich, the same graveyard and the same undead army as in the second reference image. "
          "His phylactery, the small jewelled box, lies shattered on a gravestone, its green fire escaping as fading smoke. The Lich Lord himself is crumbling: his skeletal body breaks apart into bone dust and ashes carried away by the wind, his crown falling, his staff breaking, the green flames around him guttering out. "
          "All around, the undead army collapses into heaps of bones, the green ghosts dissolve. The first light of dawn breaks on the horizon and pushes back the night. The disintegrating lich is the focus, in the left or centre third."),
 'archmage': ("The fall of the Forgotten Archmage. The same floating crystal citadel, the same archmage and the same farmland as in the second reference image. "
              "The citadel breaks apart in the sky: its violet crystals crack and shatter, great pieces fall toward the hills in trails of dust, the magic circle above it splinters. The archmage, on the highest tower, is dissolving into scattering violet sparks, his staff broken. "
              "The storm clouds are tearing open and golden afternoon sunlight floods the fields below, where the farms are safe. The collapsing citadel is the focus."),
 'winter': ("The end of the Great Winter. The same land, the same giant ice crystal (the Heart of Winter) and the same frost giants as in the second reference image. "
            "The Heart of Winter has shattered into a burst of falling ice shards and dying blue light. The frost giants are cracking and crumbling into snow and meltwater. "
            "Spring returns: the sun breaks through, the frozen river cracks and flows again, the snow melts from the fields, green grass and the first flowers appear, smoke rises from village chimneys. The shattered crystal is the focus, in the centre."),
 'eater': ("The death of the Node Eater. The same tentacled void monster, the same landscape and the same magic nodes as in the second reference image. "
           "The Node Eater is dying: its black tentacles wither, crack and crumble into drifting dark ash, its many eyes go dark, its swirling violet core collapses inward. "
           "The magic it swallowed flows back into the land in bright streams of green, red and blue light toward the nodes, which shine again. Around it the grey wasteland begins to bloom with grass and flowers. The dying monster is the focus."),
}
kind = sys.argv[1]
refs = [DIR + 'magicRelay.jpg', DIR + 'ref_finale_' + kind + '.jpg']
print("Generate exactly one image with your image generation tool (image_gen), then answer only \"ok\". "
      "Do not run any shell command and do not read or write any other file.\n"
      "referenced_image_paths, in this order: " + json.dumps(refs, ensure_ascii=False) + "\n"
      "Size: 1536x1024 (landscape).\n"
      "Image prompt (pass it unchanged):\n\n" + SCENE[kind] + " " + VICTORS + "\n\n" + STYLE)
