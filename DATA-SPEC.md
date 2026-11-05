# Arcanes - spécification des données (v0.1)

Projet : remake jouable dans le navigateur d'un 4X fantasy inspiré de Master of Magic (1994).
Le jeu final est UN fichier HTML autonome. Les données sont des fichiers JS qui remplissent un objet global :

```js
// en tête de chaque fichier de données
window.DATA = window.DATA || {}; // en Node, le build injecte `var window = globalThis`
DATA.units = { ... };
```

Langue de l'interface : **français**. Les noms affichés sont en français (traduction naturelle, pas de calque).
Ne jamais recopier les textes descriptifs du manuel ou du grimoire originaux : écrire des descriptions courtes, factuelles, dans nos propres mots.
Les chiffres (coûts, stats) sont des faits de jeu et doivent être exacts.

Sources locales :
- Code kazzmir (BSD-3) : `/tmp/claude-0/-home-claude/8f18b999-80b5-5aa0-894b-c23c246e8288/scratchpad/src/kazz/game/magic/` (unités en dur dans `units/unit.go`, héros dans `hero/hero.go`, capacités dans `data/abilities.go`, règles de combat dans `combat/model.go`).
- Manuel original (texte extrait) : `/tmp/claude-0/-home-claude/8f18b999-80b5-5aa0-894b-c23c246e8288/scratchpad/manual.txt` (annexes à partir de la ligne 5663 : tables A à N).
- Grimoire original (texte extrait) : `/tmp/claude-0/-home-claude/8f18b999-80b5-5aa0-894b-c23c246e8288/scratchpad/spellbook.txt`.
- Tuiles CC0 de Dungeon Crawl : `/tmp/claude-0/-home-claude/8f18b999-80b5-5aa0-894b-c23c246e8288/scratchpad/src/dctiles/releases/Nov-2015/` (n'utiliser QUE ce dossier, c'est le lot dont la licence CC0 est vérifiée).

## Identifiants

- Unités : nom de la variable Go dans `units/unit.go` (ex. `LizardSpearmen`, `HeroBrax`, `FireElemental`, `Trireme`).
- Sorts : slug du nom anglais du grimoire : minuscules, apostrophes supprimées (`'` et `’`), toute suite de caractères non `[a-z0-9]` remplacée par `_`, `_` en bord supprimés. Ex. `Gaia's Blessing` → `gaias_blessing`, `Spell of Mastery` → `spell_of_mastery`.
- Races : `barbarian gnoll halfling highelf highmen klackon lizardman nomad orc beastmen darkelf draconian dwarf troll` + `fantastic` (créatures invoquées) + `hero`.
- Royaumes : `life death chaos nature sorcery arcane`.
- Capacités : nom kazzmir sans le préfixe `Ability`, en lowerCamelCase (`AbilityFirstStrike` → `firstStrike`, `AbilityToHit` → `toHit`, `AbilitySuperLeadership` → `superLeadership`).
- Bâtiments : `barracks armory fightersGuild armorersGuild warCollege smithy stables animistsGuild fantasticStable shipwrightsGuild shipYard maritimeGuild sawmill library sagesGuild oracle alchemistsGuild university wizardsGuild shrine temple parthenon cathedral marketplace bank merchantsGuild granary farmersMarket forestersGuild buildersHall mechaniciansGuild minersGuild cityWalls` + pseudo-productions `housing tradeGoods` + `fortress summoningCircle` (non constructibles).

## data/units.js → `DATA.units`

Objet indexé par id. Chaque entrée :

```js
LizardSpearmen: {
  id: "LizardSpearmen", en: "Spearmen", name: "Lanciers",
  race: "lizardman",            // ou "fantastic", "hero", null pour unités génériques (navires, catapulte)
  realm: null,                  // royaume pour les créatures invoquées
  figures: 8, melee: 1, ranged: 0,
  rangedType: null,             // "missile" | "boulder" | "magic" | null
  rangedRealm: null,            // pour rangedType "magic" : royaume du projectile
  ammo: 0,                      // RangedAttacks
  def: 3, res: 4, hp: 2, move: 1, overlandMove: null,
  flying: false, swimming: true, sailing: false,
  cost: 10, costReduction: true, // ProductionCost / ProductionCostReduction
  upkeep: { gold: 0, food: 1, mana: 0 },
  castCost: 0,                  // CastingCost (invocations)
  requires: [],                 // ids de bâtiments
  abilities: { },               // { firstStrike: true, poisonTouch: 15, thrown: 2, ... } (valeur numérique si MakeAbilityValue)
  spells: [],                   // héros : ids de sorts
  transport: 0,                 // capacité de transport (navires, Floating Island...) si connue
  desc: ""                      // 1 phrase FR, nos mots (facultatif pour unités normales)
}
```

Notes : reprendre TOUTES les unités de `units/unit.go`. `move`=MovementSpeed. Quand kazzmir indique une capacité de transport via l'ability `transport` avec valeur, la recopier aussi dans `transport`.

## data/heroes.js → `DATA.heroes`

Indexé par id d'unité héros (`HeroBrax`...). `{ id, unit: "HeroBrax", title: "Nain", name: "Brakar", fame: 0, female: false, champion: false, randomAbilities: 1, randomType: "fighter|mage|any", portraitKey: "unit:HeroBrax" }`.
Les noms propres des héros doivent être **inventés** (pas les noms d'origine), le `title` est la classe (Nain, Barbare, Sage, Derviche, Maître des bêtes, Barde, Guerrier orque, Guérisseuse, Chasseresse, Voleuse, Druide, Moine guerrier, Mage guerrier, Magicien, Assassin, Mage du vent, Rôdeur, Draconien, Sorcière, Être doré, Ninja, Roublard, Amazone, Sorcier noir, Inconnu, Illusionniste, Bretteur, Prêtresse, Paladin, Chevalier noir, Archère elfe, Chevalier, Nécromancien, Guerrier du chaos, Élu). Fame/aléatoire : depuis `hero/hero.go`.

## data/races.js → `DATA.races`

```js
barbarian: { id, name: "Barbares", plane: "arcanus"|"myrror", desc,
  growth: +20,          // bonus de croissance (voir city.go PopulationGrowthRate)
  workerProd: 2, farmerFood: 2, powerPerCitizen: 0,
  cannotBuild: ["animistsGuild", ...],
  units: ["BarbarianSpearmen", ..., "Trireme", "Galley", "Catapult"], // toutes les unités constructibles, génériques incluses (table B du manuel)
  traits: ["..."] }     // courtes phrases FR
```

## data/buildings.js → `DATA.buildings`

```js
library: { id, name: "Bibliothèque", cost: 60, upkeep: 1, requires: ["buildersHall"], terrain: null /* "forest"|"hillsMountain"|"water"|null */,
  effects: { research: 2 }, desc: "..." }
```
Clés d'effets utilisables : `research, power (peut être négatif), food (ajout fixe), maxPop, growth (en pop/tour), goldPct, prodPct, unrest (réduction, entier), xp (20|60 : expérience initiale des troupes), magicWeapons, sight, healing`.
Respecter la table G du manuel (coût/entretien/prérequis). Ajouter `replaces: "..."` quand un bâtiment remplace l'effet d'un autre.

## data/terrain.js → `DATA.terrain`, `DATA.minerals`, `DATA.retorts`, `DATA.wizards`

- terrain : `{ ocean, shore, grass, forest, hills, mountain, desert, swamp, tundra, river, lake, sorceryNode, natureNode, chaosNode, volcano }` avec `{ name, move, food (fraction), prodPct, goldPct, roadTurns }` d'après `maplib/map.go` et la table D/F du manuel.
- minerals : `{ iron, coal, silver, gold, gems, mithril, adamantium, quork, crysx, wildGame, nightshade }` avec `{ name, gold, power, food, unitCostPct, terrains: [...], myrrorOnly }`.
- retorts : `{ alchemy, archmage, artificer, channeler, charismatic, conjurer, divinePower, famous, infernalPower, manaFocusing, myrran, nodeMastery, runemaster, sageMaster, warlord, omniscient, ... }` avec `{ name, cost (picks), req: { books: n, realms: {life:4} ... } , desc }` d'après le manuel.
- wizards : 14 sorciers prédéfinis avec la répartition de livres et de retorts du manuel, mais **noms inventés** : `{ name, portrait: 0..13, books: {life:5,...}, retorts: [...], color }`.

## data/spells.js → `DATA.spells`

Indexé par slug. Chaque entrée :

```js
fire_bolt: {
  id: "fire_bolt", en: "Fire Bolt", name: "Trait de feu",
  realm: "chaos", rarity: "common",            // common | uncommon | rare | veryrare
  section: "combat",                           // summoning | special | city | global | unit | combat
  cost: 5, combatCost: 5, plus: true,          // plus = mana supplémentaire possible
  overland: false, combat: true,
  upkeep: 0, research: 0,
  target: "enemyUnit",                         // voir vocabulaire
  kind: "damage",                              // voir vocabulaire
  params: { strength: 5, perMana: 1, damage: "fire" },
  desc: "..."                                  // 1-2 phrases FR, nos mots
}
```

Vocabulaire `target` : `none` (global ou soi), `friendlyUnit`, `enemyUnit`, `anyUnit`, `friendlyCity`, `enemyCity`, `anyCity`, `tile` (case de carte), `combatTile`, `allEnemyUnits`, `allFriendlyUnits`, `allUnits`, `deadUnit`, `friendlyHero`, `enemyWizard`, `node`.
Vocabulaire `kind` : `summon` (params.unit = id d'unité), `unitEnchant`, `curse`, `damage`, `areaDamage`, `resistOrDie`, `heal`, `combatEnchant`, `cityEnchant`, `cityCurse`, `global`, `terrain`, `dispel`, `special`.
`params` : tout chiffre utile (force, malus de résistance, bonus de stats `{ melee: 2, def: 1 }`, etc.).
