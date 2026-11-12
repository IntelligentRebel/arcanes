#!/usr/bin/env python3
"""Texte à envoyer à Codex pour l'illustration de la chute d'un sorcier : python3 tools/codex_fall.py banished aldoran -> stdout.
banished : sa forteresse tombe, il est banni dans le néant (il peut revenir). defeated : il est vaincu pour de bon."""
import json, sys
DIR = 'E:\\Logiciels IA\\Codex\\Arcanes\\'
W = {
 'aldoran': ("an old sage with a very long white beard and long white hair, small round spectacles, a white robe with green leaf embroidery, holding a gnarled wooden staff sprouting green leaves", "warm white-gold and leaf green"),
 'isvaran': ("a dark-bearded man with a long braided beard, a teal turban set with a gold jewel, a deep blue robe trimmed with gold and a green scarf, holding a glowing blue orb wrapped in living vines", "emerald green and sapphire blue"),
 'malivra': ("a pale sorceress with pointed ears, long black braided hair, a horned gold-and-ruby crown, a black and crimson high-collared gown with a skull brooch", "blood red and violet"),
 'tsevan': ("a young man with wild red hair and a scar across his cheek, a blue and crimson high-collared coat with a gold star clasp, blue lightning crackling in his hand", "electric blue and ember red"),
 'azhemir': ("an old wizard with a very long white beard, a wide blue pointed hat and blue robe both sewn with gold stars and moons, glowing blue eyes, a bandolier of potion vials", "deep sapphire blue"),
 'thalgren': ("a burly red-bearded barbarian shaman with braided beard, blue war paint, a brown bear pelt on his shoulders, glowing orange rune tattoos, a heavy staff topped with a rune-carved stone", "molten orange and forest green"),
 'vorgath': ("a gaunt hooded necromancer with grey corpse-like skin and glowing purple eyes, ragged black robes hung with small skulls and bone charms, a staff topped with a skull wreathed in purple flame", "sickly purple"),
 'zirrakh': ("a draconian with the head of a white-and-gold dragon, horns swept back, wearing a red and white robe with gold sun ornaments, a white flame burning in his clawed hand", "white-gold fire and scarlet"),
 'brakkon': ("a grim black-bearded warlord king with a spiked iron crown set with red gems, dark red plate armour decorated with skulls and chains, flames licking around him", "fire orange and red"),
 'sylvaine': ("a red-haired elf woman with pointed ears, long braided auburn hair, a crown of antlers, leaves and white flowers, a green leaf cloak, accompanied by a small glowing green spirit fox", "living green"),
 'solenkh': ("a lizard-man with golden-green scales and a blue spiny crest, wearing a white and blue robe with gold sun medallions, holding a small radiant sun orb in his scaled hand", "sun gold and sky blue"),
 'celestine': ("a young woman with very long wavy golden hair, a golden laurel wreath and a radiant halo, a white and gold robe with a white dove brooch", "radiant gold and white"),
 'itzanor': ("a dark-skinned warrior-shaman wearing a jaguar pelt headdress with the jaguar's fanged head over his own, green face paint, a bone and fang necklace, a spear with an obsidian blade, feathers and a small skull", "jungle green and ghostly violet"),
 'nerissa': ("a woman with shoulder-length silver-white hair and violet eyes, a dark navy and black gown with silver filigree, an enchanted dagger floating above her hand in swirling blue magic", "midnight blue and silver"),
}
STYLE = ("Highly detailed painted fantasy illustration with a fine pixel-art texture, rich saturated colours, dramatic lighting, the same rendering style as the first reference image. "
         "Wide landscape composition, 3:2. No text, no letters, no numbers, no frame, no border, no watermark, no user interface.")
SCENE = {
 'banished': ("The fall of a wizard's fortress and his banishment. {who} stands on the broken battlements of a great fortress tower as it is stormed: the gate is shattered, enemy soldiers with torches and ladders pour over the walls under anonymous plain dark banners, parts of the fortress burn. "
              "Behind and above the wizard a huge swirling vortex of the void has torn open in the sky and is dragging the wizard away: their body is lifted off the stones and begins to stretch and fray into streams of {col} light pulled into the rift, robes whipping. "
              "The wizard is alive, furious and defiant, one hand still reaching toward the fortress, face clearly recognisable. The wizard is the focus, in the left or centre third, seen from the waist or knees up; the falling fortress and the attackers fill the rest."),
 'defeated': ("The final end of a wizard. Night or cold dawn among the smoking ruins of the wizard's last city: broken towers, fallen banners, a toppled statue. {who} kneels or sinks at the centre of a ruined throne hall open to the sky, mortally spent, staff or weapon broken on the flagstones. "
              "The wizard's body is dissolving for good: from the edges inward it crumbles into drifting motes and embers of {col} light that rise and scatter into the sky, while the last of their magic gutters out. Around the wizard a great stone tomb is already forming out of the rubble, sealing spell books and relics inside. "
              "The mood is solemn and final, not gory. The wizard's face is clearly recognisable, with an expression of exhaustion and disbelief. The wizard is the focus, seen from the knees up; the ruins fill the rest."),
}
kind, wid = sys.argv[1], sys.argv[2]
who, col = W[wid]
who = "The wizard, " + who + " (exactly the character of the second reference image: same face, hair, clothes and colours)"
refs = [DIR + 'magicRelay.jpg', DIR + 'ref_wizard_' + wid + '.png']
print("Generate exactly one image with your image generation tool (image_gen), then answer only \"ok\". "
      "Do not run any shell command and do not read or write any other file.\n"
      "referenced_image_paths, in this order: " + json.dumps(refs, ensure_ascii=False) + "\n"
      "Size: 1536x1024 (landscape).\n"
      "Image prompt (pass it unchanged):\n\n" + SCENE[kind].format(who=who, col=col) + "\n\n" + STYLE)
