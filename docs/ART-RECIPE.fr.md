# Comment sont faits les graphismes d'Arcanes

Les graphismes d'Arcanes sont réservés (voir [ASSETS.md](../ASSETS.md)), mais pas la façon de les faire. Voici la recette, pour faire les vôtres.

Le partage des rôles est simple : **Claude** écrit le code et les prompts, **la génération d'images de ChatGPT** dessine. Au début, un humain portait les prompts de l'un à l'autre par copier-coller. Ensuite, Claude a piloté ChatGPT directement par **Codex**, l'agent en ligne de commande d'OpenAI, et a généré seul le reste des graphismes du jeu.

## 1. Trouvez d'abord votre style à la main

Avant d'automatiser quoi que ce soit, ouvrez ChatGPT et générez vous-même quelques images : une unité, une cité, une illustration. Recommencez jusqu'à en adorer une. Cette image devient votre **guide de style**, jointe à chaque prompt à partir de là. Chaque image suivante hérite de son rendu, et c'est ce qui garde des centaines d'images cohérentes entre elles.

Arcanes en a deux : une figurine en pixel art pour les figurines et les animations, et une scène peinte (l'illustration du Relais magique) pour les grandes illustrations.

## 2. Branchez Codex sur Claude

1. Installez [Codex CLI](https://github.com/openai/codex) et connectez-vous avec votre compte ChatGPT.
2. Déclarez-le comme serveur MCP dans Claude Desktop (`claude_desktop_config.json`) :

   ```json
   { "mcpServers": { "codex": { "command": "codex", "args": ["mcp-server"] } } }
   ```

3. Donnez à Codex un dossier à lui (ici `E:\Logiciels IA\Codex\Arcanes`) qui contient les guides de style et les images de référence. Faites-le tourner en lecture seule (`sandbox: "read-only"`, `approval-policy: "never"`, `cwd` sur ce dossier) : il n'a qu'à dessiner.
4. Demandez à Claude de générer les graphismes. Chaque appel envoie un prompt à Codex et récupère une image, enregistrée dans `~/.codex/generated_images/`.

Un appel peut durer plus longtemps que Claude n'attend : si Claude abandonne, l'image est en général encore en cours. Attendez qu'elle apparaisse plutôt que de renvoyer le prompt.

## 3. Les prompts qui marchent

Chaque prompt envoyé à Codex suit le même cadre :

```
Generate exactly one image with your image generation tool (image_gen), then answer only "ok".
Do not run any shell command and do not read or write any other file.
referenced_image_paths, in this order: ["...\style_guide.png", "...\ref_character.png"]
Size: 1536x1024 (landscape).
Image prompt (pass it unchanged):

<le prompt>
```

Ce qui a fait la différence :

- **Joignez toujours le guide de style et la référence du personnage**, et dites-le : « exactly the character of the second reference image: same face, hair, clothes and colours ».
- **Décrivez aussi le rendu en mots** : « modern high-definition pixel art, a crisp, perfectly uniform pixel grid, no blur, no smooth anti-aliasing, hue-shifted shading, selective dark colored outlines (never pure black), key light from the top-left ». Et fixez l'échelle : « 1 art pixel = 2x2 image pixels ».
- **Interdisez ce que vous ne voulez pas** : « no text, no letters, no numbers, no frame, no border, no watermark, no user interface ».
- **La transparence** : demandez un vrai canal alpha, « if transparency is impossible, use one flat solid magenta (#FF00FF) background instead ». Sans cette roue de secours, vous obtenez un damier peint.

## 4. Famille par famille

**Figurines des unités.** Des planches de plusieurs unités sur une grille de cases égales, fond transparent. `tools/build_hd.py` les découpe et les range dans un atlas (`assets/hd.png`), et `tools/hd_supplement.py` ajoute les nouvelles sans tout reconstruire.

**Animations.** Une planche par unité (ou deux unités par planche pour économiser des appels). Chaque planche est une grille de 4 x 4 : une rangée pour le repos, la marche, l'attaque et la mort, 4 images chacune, avec la figurine de l'unité jointe en référence. Extrait :

> Animation sprite sheet, 16 frames. A grid of exactly 4 columns and 4 rows of equal cells. Each row is one animation made of 4 frames read left to right. The character must stay identical in all its 16 frames: same face, body proportions, armor, colors, weapon; only the pose changes. In every cell the character stands on the same invisible ground line near the bottom of the cell and stays centered: it never travels across the cell (walking and attacking happen in place). Nothing touches or crosses into a neighbouring cell. The character faces the LEFT. No grid lines, numbers, motion blur or ghosted copies; no ground and no shadow.

`tools/codex_cut.py` détoure chaque case (rembg) et contrôle la planche : une figure par case, rien de rogné, une taille stable. `tools/build_anim.py` met chaque image à l'échelle de la figurine fixe, cale les pieds et range l'atlas.

**Illustrations** (grands ouvrages, événements, chute d'un sorcier). 1536 x 1024, avec en références le guide de style peint et le portrait du sorcier. `tools/codex_fall.py` en donne un exemple complet : une description par sorcier, une scène par événement, et un paragraphe de style commun à toutes.

**Cités.** Une planche par race : les six tailles de cité, puis la muraille seule. `tools/city_sheets.py` les découpe et les range.

**Portraits animés.** Demandez deux retouches de chaque portrait : les yeux fermés, et la magie à son comble. `tools/portrait_anim.py` recale chaque retouche sur l'original (ECC), ne garde que ce qui a changé et en fait deux calques. Le jeu les fait apparaître et disparaître : un clignement de temps en temps, la magie qui respire lentement. On évite ainsi le « bouillonnement » qu'on obtient en demandant des images successives d'un tableau.

## 5. Vérifiez tout

Faites construire à Claude une planche-contact après chaque lot et regardez-la : un mauvais nombre de doigts, une figure rognée au bord de sa case, une épée qui change de main d'une image à l'autre. Refaites ce qui ne va pas, avec un prompt qui nomme le défaut.
