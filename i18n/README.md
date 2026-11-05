# Langues d'Arcanes

Le jeu est écrit en français. Au moment de l'assemblage (`py tools/build.py`), `tools/i18n_build.js` lit le code sur une copie et enveloppe chaque texte affiché : `__t('Fin du tour')`, ou `__tf('La peste frappe {0}.', [c.name])` pour une phrase faite de morceaux. Le code source ne change pas : le banc et les tests jouent le français tel quel.

- `catalog.json` : tous les textes à traduire (refait à chaque assemblage), avec l'endroit du code et ce que remplit chaque `{0}`.
- `<langue>.json` : texte français -> traduction. Langues livrées : en, zh, de, es, pt, ru, ja, ko, it, pl (et le français, la source).
- `manual.json` : quelques clés posées à la main (`@unit_race` : l'ordre « unité + peuple »).
- `work/` : les fichiers de travail des traducteurs (morceaux, consignes `INSTRUCTIONS.md`, sorties).

Au lancement, le jeu prend la langue choisie (menu, ou liste en haut à droite de l'écran titre), sinon celle du navigateur, sinon l'anglais. Un texte sans traduction s'affiche en anglais, sinon en français.

## Après une modification du jeu

1. `py tools/build.py` refait le catalogue et dit combien de textes manquent dans chaque langue.
2. `py tools/i18n_merge.py --todo en de …` écrit `work/todo_<langue>.json` (les textes neufs, avec leur contexte).
3. Les faire traduire selon `work/INSTRUCTIONS.md` dans `work/out/<langue>/todo_<langue>.json`, contrôler avec `py tools/i18n_check.py <langue> todo_<langue>`.
4. `py tools/i18n_merge.py <langue>…` les range dans `<langue>.json`, puis `py tools/build.py`.

Pluriels russes et polonais : une traduction « forme 2-4¦forme 5+ » (barre brisée ¦) ; `U.n` choisit la forme selon le nombre (règles `Intl.PluralRules`). Les nouveaux pluriels de ces deux langues s'écrivent ainsi.

Fichiers de travail : `work/out/<langue>/*.json` sont fusionnés par ordre alphabétique (chunk*, few_*, todo_*, zz_fix, zzz_main) ; le dernier l'emporte. `work/TODO_INSTRUCTIONS.md` : les consignes pour traduire un `todo`.

Contrôle à l'écran : `py tools/i18n_pseudo.py en` remplace l'anglais par une pseudo-langue (⟦texte⟧) ; `tests/ui_i18n.py` capture les écrans et relève tout texte resté en français. Penser à refaire ensuite `i18n_merge.py en`… ou à remettre le vrai `en.json`.

## Ce que le transformateur ne traduit pas

Les tests d'interface (`tests/ui_*.py`) cliquent sur des libellés français : les lancer avec `LANG=fr_FR.UTF-8 LANGUAGE=fr`, sinon le navigateur de test démarre le jeu en anglais.

Les clés (identifiants d'unités, de sorts, noms anglais d'origine `en`, classes CSS, touches comme `'Escape'`), les messages pour la console, les comparaisons d'un mot seul. Un texte affiché qui ne serait pas repris : un mot seul en minuscules dans une table, par exemple. On l'ajoute à `FORCE_NAMES` (nom de la fonction ou de la table) dans `tools/i18n_build.js`, ou on l'enveloppe dans `U.txt('…')` (sans effet sur le jeu : l'assemblage le traduit). Une valeur glissée dans une phrase affichée (`'Le feu gagne ' + (n > 1 ? … : 'un bosquet voisin')`) est traduite d'office, sauf dans une balise ou collée à un mot (une terminaison). Les décimales `.replace('.', ',')` prennent le séparateur de la langue.
