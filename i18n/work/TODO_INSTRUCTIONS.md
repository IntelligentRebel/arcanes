# Translating the new texts (round 3)

Same rules as `INSTRUCTIONS.md` (read it first). The language's full dictionary is `i18n/<lang>.json` (French source -> translation) and its glossary `work/out/<lang>/glossary*.md`.

`work/todo_<lang>.json` lists texts that are new or were split out of longer sentences. Many are **pieces that fill a placeholder of a sentence that is already translated**: a verb (" tombez" = 2nd person, " tombe" = 3rd person), a pronoun ("vous", "votre"/"sa"), a list separator (" ou ", ", et "), a number word, a direction.

For each entry:
1. Open the source file at `at` (e.g. `src/engine/chronicle.js:128`, path relative to `/home/claude/arcanes/`) and read how the piece is assembled.
2. Find the enclosing sentence in `i18n/<lang>.json` (the French template with `{0}`…, e.g. "{0} au combat, en personne.") and read its current translation.
3. Translate the piece so that the **whole sentence reads correctly** once the piece fills the placeholder. Keep leading/trailing spaces as in the source (adapt for CJK).
4. If the existing sentence translation cannot work with any translation of the piece (wrong word order, the translator assumed a French value), write a corrected translation of that sentence too, in `work/out/<lang>/zz_fix.json` (`{ "French template": "new translation" }`, same placeholders as the French template, same rules).

Write `work/out/<lang>/todo_<lang>.json` with every key of the todo file. Then run:
- `python3 tools/i18n_check.py <lang> todo_<lang>` (0 ERREUR),
- `python3 tools/i18n_merge.py <lang>` then `python3 tools/i18n_check.py <lang>` (0 ERREUR, except a missing `{2}` in "Ne touche que les {0} {1} : il n'y en a {2}{3}." which is allowed).

Russian and Polish only, extra file `work/few_<lang>.json`: plural nouns used after numbers (`U.n(k, 'tour')` gives "3 tours"). The game now picks the right form by number: write each translation as **`form for 2-4¦form for 5+`** with the broken bar `¦` (U+00A6), e.g. ru "хода¦ходов", pl "tury¦tur". `current` is the existing translation (5+ form). Output `work/out/<lang>/few_<lang>.json` with every key, then `python3 tools/i18n_check.py <lang> few_<lang>`.

Helper files only in `/tmp/claude-0/tr_<lang>_todo/`. Do not modify anything else.
