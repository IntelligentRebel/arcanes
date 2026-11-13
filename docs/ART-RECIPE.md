# How Arcanes' graphics are made

Arcanes' graphics are reserved (see [ASSETS.md](../ASSETS.md)), but the way they were made is not. Here is the recipe, so you can make your own.

The split is simple: **Claude** writes the code and the prompts, **ChatGPT's image generation** draws. At first a human carried the prompts from one to the other by copy and paste. Later, Claude drove ChatGPT directly through **Codex**, OpenAI's command-line agent, and generated the rest of the game's art by itself.

## 1. Find your style by hand first

Before automating anything, open ChatGPT and generate a few images yourself: a unit, a city, an illustration. Iterate until you love one. That image becomes your **style guide**, attached to every prompt from then on. Every image after it inherits its rendering, which is what keeps hundreds of images consistent.

Arcanes uses two: a pixel-art figure for sprites and animations, and a painted scene (the Magic Relay illustration) for the large illustrations.

## 2. Plug Codex into Claude

1. Install the [Codex CLI](https://github.com/openai/codex) and sign in with your ChatGPT account.
2. Declare it as an MCP server in Claude Desktop (`claude_desktop_config.json`):

   ```json
   { "mcpServers": { "codex": { "command": "codex", "args": ["mcp-server"] } } }
   ```

3. Give Codex a folder of its own (here `E:\Logiciels IA\Codex\Arcanes`) holding the style guides and reference images. Run it read-only (`sandbox: "read-only"`, `approval-policy: "never"`, `cwd` set to that folder): it only has to draw.
4. Ask Claude to generate the assets. Each call sends Codex one prompt and gets one image back, saved under `~/.codex/generated_images/`.

A call can outlast Claude's patience: if Claude's side times out, the image is usually still being generated. Wait for it to appear rather than sending the prompt again.

## 3. The prompts that work

Every prompt sent to Codex follows the same frame:

```
Generate exactly one image with your image generation tool (image_gen), then answer only "ok".
Do not run any shell command and do not read or write any other file.
referenced_image_paths, in this order: ["...\style_guide.png", "...\ref_character.png"]
Size: 1536x1024 (landscape).
Image prompt (pass it unchanged):

<the prompt>
```

What made the difference:

- **Always attach the style guide and the character's reference**, and say so: "exactly the character of the second reference image: same face, hair, clothes and colours".
- **Describe the rendering in words too**: "modern high-definition pixel art, a crisp, perfectly uniform pixel grid, no blur, no smooth anti-aliasing, hue-shifted shading, selective dark colored outlines (never pure black), key light from the top-left". And fix the scale: "1 art pixel = 2x2 image pixels".
- **Ban what you don't want**: "no text, no letters, no numbers, no frame, no border, no watermark, no user interface".
- **Transparency**: ask for a real alpha channel, "if transparency is impossible, use one flat solid magenta (#FF00FF) background instead". Without that fallback you get a painted checkerboard.

## 4. Asset by asset

**Unit figures.** Sheets of several units on a grid of equal cells, transparent background. `tools/build_hd.py` cuts them and packs them into an atlas (`assets/hd.png`), and `tools/hd_supplement.py` adds new ones without rebuilding everything.

**Animations.** One sheet per unit (or two units per sheet to save calls). Each sheet is a 4 x 4 grid: rows for idle, walk, attack and death, 4 frames each, the unit's figure attached as reference. Excerpt:

> Animation sprite sheet, 16 frames. A grid of exactly 4 columns and 4 rows of equal cells. Each row is one animation made of 4 frames read left to right. The character must stay identical in all its 16 frames: same face, body proportions, armor, colors, weapon; only the pose changes. In every cell the character stands on the same invisible ground line near the bottom of the cell and stays centered: it never travels across the cell (walking and attacking happen in place). Nothing touches or crosses into a neighbouring cell. The character faces the LEFT. No grid lines, numbers, motion blur or ghosted copies; no ground and no shadow.

`tools/codex_cut.py` cuts out each cell (rembg) and checks the sheet: one figure per cell, nothing cropped, a stable size. `tools/build_anim.py` scales every frame like the static figure, aligns the feet and packs the atlas.

**Illustrations** (great buildings, events, a wizard's fall). 1536 x 1024, the painted style guide plus the wizard's portrait as references. `tools/codex_fall.py` holds a complete example: one description per wizard, one scene per event, and a style paragraph shared by all.

**Cities.** One sheet per race: the six city sizes, then the walls alone. `tools/city_sheets.py` cuts and packs them.

**Animated portraits.** Ask for two retouches of each portrait: eyes closed, and magic at its peak. `tools/portrait_anim.py` registers each retouch onto the original (ECC), keeps only what changed and turns it into two layers. The game fades them in and out: a blink now and then, the magic breathing slowly. This avoids the "boiling" you get when you ask for frames of a painting.

## 5. Check everything

Have Claude build a contact sheet after each batch and look at it: a wrong number of fingers, a figure cropped at the edge of its cell, a sword switching hands between frames. Regenerate what is wrong, with a prompt that names the fault.
