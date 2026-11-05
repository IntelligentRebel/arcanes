'use strict';
// Charge le moteur (données + code sans DOM) dans un contexte Node isolé.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.ARENA_ROOT || path.join(__dirname, '..');
const FILES = [
  'data/units.js', 'data/heroes.js', 'data/races.js', 'data/scouts.js', 'data/engineers.js', 'data/heroquests.js', 'data/avatar.js', 'data/buildings.js', 'data/terrain.js', 'data/spells.js', 'data/wonders.js',
  'src/core/rng.js', 'src/core/util.js',
  'src/engine/world.js', 'src/engine/units.js', 'src/engine/cities.js', 'src/engine/magic.js', 'src/engine/move.js',
  'src/engine/combat.js', 'src/engine/game.js', 'src/engine/turn.js', 'src/engine/spells.js', 'src/engine/veil.js', 'src/engine/aiintel.js', 'src/engine/ai.js', 'src/engine/aiplus.js', 'src/engine/aistrat.js', 'src/engine/diplo.js', 'src/engine/events.js', 'src/engine/chronicle.js',
];

// les globales lues par le moteur (DATA : posée par les fichiers de données, jamais remplacée ensuite) ; `this` au niveau du
// script est l'objet global du contexte
const ALIASED = ['DATA', 'Math', 'Object', 'Number', 'Set', 'Map', 'WeakMap', 'Array', 'JSON', 'Boolean', 'String', 'Error', 'Uint8Array', 'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array'];
const GLOBAL_ALIASES = 'const ' + ALIASED.map(k => k + ' = this.' + k).join(', ') + ';';

function loadEngine() {
  const ctx = { console, Math, JSON, Date, setTimeout, Promise };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // (performance) dans un contexte vm, chaque lecture d'une globale (DATA, Math, Object, Number…) passe par l'intercepteur du
  // contexte, des centaines de fois plus lente qu'une variable : les données d'abord, dans un script à part (elles posent
  // window.DATA) ; puis le code, précédé de liaisons lexicales du script pour ces mêmes objets, lus une fois sur l'objet global
  // (exactement ce que donnait chaque lecture), qui rendent ces lectures directes. Le code commence à la même ligne d'engine.js
  // qu'avant (lineOffset) et la ligne des liaisons est celle du titre du premier fichier : les numéros de ligne ne bougent pas.
  let data = '', src = '';
  for (const f of FILES) if (fs.existsSync(path.join(ROOT, f))) {
    const part = '// ==== ' + f + '\n' + fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (src || f.startsWith('src/')) src += '\n' + (src ? '' : GLOBAL_ALIASES + ' ') + part;   // le code, à partir du premier fichier src/
    else data += '\n' + part;
  }
  // exporter les globales lexicales
  src += '\n;Object.assign(globalThis, { RNG, U, World, MapGen, Units, Cities, Wonders, Magic, Players, Move, Battle, CombatSpells, CombatAI, Game, Heroes, Items, Turn, Neutrals, Spells, AI, Intel, Diplomacy, Veil, Pacts, Crisis, T, M, T_KEYS, MIN_KEYS, NORMAL_LEVELS, HERO_LEVELS, ATT_SIDE, DEF_SIDE, CW, CH, MAX_STACK, REALMS5, GAME_VERSION, OVERLAND_HANDLERS, COMBAT_SPELL_HANDLERS });' + '\n;if (typeof Dilemmas !== "undefined") Object.assign(globalThis, { Dilemmas, Nemesis, Endgame, Rite, Book });' + '\n;if (typeof Chronicle !== "undefined") Object.assign(globalThis, { Chronicle });';
  vm.runInContext(data, ctx, { filename: 'engine.js' });
  vm.runInContext(src, ctx, { filename: 'engine.js', lineOffset: data.split('\n').length - 1 });
  ctx.AI.LAB = true;   // les essais en cours (AI.PENDING) jouent dans les tests
  return ctx;
}
module.exports = { loadEngine, FILES, ROOT, ALIASED };
