# Translating Arcanes

Arcanes is a turn-based fantasy strategy game (a modern remake of *Master of Magic*, 1994): wizards, magic realms (Life, Death, Chaos, Nature, Sorcery), two planes (Arcanus, called "Arcane" in French, and Myrror, called "le Miroir"), cities, armies, heroes, spells, tactical battles. The source language is **French**. You translate the game's text into one target language.

## Input

`chunkN.json` is an array of entries:

- `k`: the French source text. It is also the dictionary key: **copy it unchanged** as the key of your output.
- `at`: where it appears in the code (file:line), for context.
- `args`: present when `k` contains placeholders `{0}`, `{1}`… : the code expression that fills each one, in order. Use it to understand what goes there (a name, a number, another sentence…).
- `hint`: an extra explanation (for example "pluriel de « tour »" = the plural form of "tour").
- `en_original`: the official English name from the original *Master of Magic*, when the French text is the name of a unit, spell, building or hero. In English, use it as is. In other languages, use it to understand what the name refers to, and translate the **French** name in the way your language's fantasy games would.
- `fr`: for keys starting with `@`, the French template to translate (the key itself is an identifier).

## Output

Write `out/<lang>/chunkN.json`: one JSON object `{ "French source": "translation", … }` with **every** key of the chunk, keys copied byte for byte. Valid JSON (escape `"` and `\`), UTF-8, no comments.

## Rules

1. **Placeholders** `{0}`, `{1}`… must all appear in your translation (reorder them freely to fit your grammar). Exception: when a placeholder only carries a French grammatical ending or article (its `args` expression is like `n > 1 ? 's' : ''`, `female ? 'e' : ''`, `/…/.test(x) ? 'd\'' : 'de '`), drop it and write your language's correct form.
2. **French grammar helpers in `args`**: in your language, `U.de(x)`, `App.de(x)`, `deWho(x)`, `Game.dePlace(x)`, `Heroes.dePlace(x)`, `Dilemmas.de(x)` give **x alone** (without the French "de/d'/du/des"): add the preposition or case your sentence needs ("of {0}", "{0}'s"…). `U.n(k, 'word')` and `U.plural(…)` give "number + word" already in your language and correctly pluralized. `Units.label(u)`, `Units.name(u)`, `this.name(x)` give a unit's name; `Units.subj(u, verb)` / `this.subj(x, verb)` / `bt.subj(x, verb)` give "unit name + verb" (already translated: the sentence continues after it). `U.fmt(n)` is a formatted number, `U.cap(x)` the same text capitalized, `U.esc(x)` the same text HTML-escaped.
3. **HTML**: keep every tag and attribute exactly (`<b>`, `<span class="gold">`, `<div style="…">`…), in a sensible position. Translate only the visible text and the values of `title="…"`, `alt="…"`, `placeholder="…"`. Keep entities (`&nbsp;`, `&lt;`) and symbols (`·`, `×`, `→`, `★`, `%`, `+`).
4. **Fragments**: many entries are pieces of a longer sentence glued together by the code (`" et ailleurs"`, `" cède "`, `"tours"`). Keep their **leading and trailing spaces and punctuation** exactly as in the source, so the pieces still join. In Chinese and Japanese you may drop spaces that would be wrong between words, but keep a space next to a placeholder that holds a Latin-script name or a number when it helps readability.
5. **Proper nouns stay unchanged**, in Latin script: wizard, hero, city and place names, invented names and name syllables (`Thrull`, `Aelindor`, `Gor`, `Kra`…), the game's title `Arcanes`. Do translate common-noun titles and descriptions ("Le Roi sans Visage" → "The Faceless King").
6. **Single words**: a lone word is usually a UI label, a stat or a game term (`Attaque` → Attack). Plural entries (hint "pluriel de …") get the plural form; in a language without grammatical plural, write the same form as the singular.
7. **Consistency**: the same game term is always translated the same way (unit, spell, building, race, realm, resource, stat names). Keep a glossary file `out/<lang>/glossary.md` of your choices as you go, and re-read it before each chunk. If `glossary_*.json` files are given to you, follow them.
8. **Register and tone**: concise, natural, modern strategy-game UI language; the original speaks to the player formally ("vous"): use the address most common in recent strategy games in your language. Flavour texts (lore, legends, dilemmas) keep their epic or ironic tone; do not over-explain mechanics.
9. **Length**: UI labels must stay short (buttons, columns, stats). Do not add explanations that are not in the source.
10. **Keyboard keys** (`Espace`, `Entrée`, `Échap`, `Maj+C`, `clic gauche`…) get your language's usual names (Space, Enter, Esc, Shift+C, left click).
11. **Numbers inside text**: French writes decimals with a comma (`0,5`) and puts a space before `%`, `:`, `;`, `!`, `?`; use your language's conventions.
12. Do not leave French words, do not add notes or comments, do not skip entries.

Process the chunks in order, one at a time: read a chunk, write its output file, update the glossary, then the next one. After each output file, check that it parses as JSON and has exactly the same keys as the chunk.

## Working files

Several translators work at the same time. Keep any helper file (scripts, text lists) in your **own** folder `/tmp/claude-0/tr_<lang>_<your chunks>/`, never in a shared scratchpad, and never write in another language's `out/` folder.
