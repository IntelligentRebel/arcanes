'use strict';
// Banc tactique : mêmes combats joués deux fois, la nouvelle tactique d'un côté puis de l'autre.
// Mesure la part de victoires et la force conservée par le camp qui joue la tactique « new » face à « old ».
// node tests/tactics.js --n 600 --new 3 --old 0 [--exp '{"x":1}'] [--spells 1] [--city 0.2]
const { loadEngine } = require('./load');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const N = +(args.n || 600), NEW = +(args.new != null ? args.new : 3), OLD = +(args.old != null ? args.old : 0), SEED = +(args.seed || 1);
const E = loadEngine();
E.AI.EXP = args.exp ? JSON.parse(args.exp) : {};
const game = E.Game.newGame({ seed: 77, mapW: 60, mapH: 40, opponents: 1, human: { name: 'A', portrait: 1, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
// --spells 1 : les deux sorciers lancent des sorts (beaucoup de mana, tous les sorts de combat de leurs royaumes)
if (args.spells) for (const pl of game.players) {
  pl.human = false; pl.skillPoints = 2000;
  for (const sp of Object.values(E.DATA.spells)) if (sp.combat && pl.books[sp.realm] && !pl.known.includes(sp.id) && E.CombatSpells.implemented(sp.id)) pl.known.push(sp.id);
}
const pool = Object.values(E.DATA.units).filter(d => d.race !== 'hero' && !d.abilities.createOutpost && !d.abilities.construction && !d.abilities.scout && !d.sailing && (d.melee > 0 || d.ranged > 0) && d.cost <= 400).map(d => d.id);
const str = t => { const u = { type: t, ench: [], xp: 0, owner: 0, dmg: 0, weapon: 0 }; return E.Units.strength(game, u); };
const S = Object.fromEntries(pool.map(t => [t, str(t)]));
const land = [];
for (let y = 3; y < game.world.h - 3; y++) for (let x = 0; x < game.world.w; x++) if (!E.World.isWater(E.World.terr(game.world, 0, x, y))) land.push([x, y]);
function army(rng, target, maxN) {
  const out = []; let s = 0;
  const cands = pool.filter(t => S[t] <= target * 1.1);
  while (out.length < maxN && s < target * 0.9) { const t = rng.pick(cands.filter(t => s + S[t] <= target * 1.15)); if (!t) break; out.push(t); s += S[t]; }
  return out;
}
function play(A, D, pos, tac, seed, city, swapped) {
  const mk = (list, o) => list.map(t => { const u = E.Units.create(game, t, o, 0, pos[0], pos[1]); return u; });
  const a = mk(A, 0), d = mk(D, 1);
  const c = city ? Object.values(game.cities)[0] : null;
  if (args.spells) for (const pl of game.players) pl.mana = 400;
  // --expOld '{"no_x":1}' : coupe une capacité tactique pour le seul camp « old » (même niveau des deux côtés)
  const exp = args.expOld ? (swapped ? [JSON.parse(args.expOld), null] : [null, JSON.parse(args.expOld)]) : null;
  const b = new E.Battle(game, { attackers: a, defenders: d, attackerPid: 0, defenderPid: 1, plane: 0, x: pos[0], y: pos[1], city: c, sim: !args.spells, rng: new E.RNG(seed), tac, exp });
  const s0 = [E.U.sum(a, u => E.Units.strength(game, u)), E.U.sum(d, u => E.Units.strength(game, u))];
  E.CombatAI.autoResolve(b);
  const s1 = [0, 1].map(side => E.U.sum(b.units.filter(x => x.side === side && !x.dead), x => E.Units.strength(game, x.u)));
  for (const u of a.concat(d)) delete game.units[u.id];
  for (const x of b.units) delete game.units[x.u.id];
  return { winner: b.winner, keep: [s1[0] / s0[0], s1[1] / s0[1]], rounds: b.round, mana: game.players.map(pl => 400 - pl.mana) };
}
const rng = new E.RNG(SEED);
let win = 0, games = 0, keep = 0, rounds = 0, decided = 0, manaNew = 0, manaOld = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const target = 60 + rng.int(900);
  const A = army(rng, target, 2 + rng.int(7)), D = army(rng, target, 2 + rng.int(7));
  if (!A.length || !D.length) continue;
  const pos = rng.pick(land), seed = rng.int(1e9), city = args.city && rng.chance(+args.city);
  // la nouvelle tactique attaque, puis défend, sur le même combat
  const r1 = play(A, D, pos, [NEW, OLD], seed, city, false), r2 = play(A, D, pos, [OLD, NEW], seed, city, true);
  win += (r1.winner === E.ATT_SIDE ? 1 : 0) + (r2.winner === E.DEF_SIDE ? 1 : 0); games += 2;
  keep += r1.keep[0] + r2.keep[1]; rounds += r1.rounds + r2.rounds; manaNew += r1.mana[0] + r2.mana[1]; manaOld += r1.mana[1] + r2.mana[0];
  if ((r1.winner === E.ATT_SIDE) !== (r2.winner === E.ATT_SIDE)) decided++;
}
console.log('tactique ' + NEW + ' contre ' + OLD + (args.exp ? ' ' + args.exp : '') + (args.expOld ? ' (old : ' + args.expOld + ')' : '') + ' : victoires ' + (100 * win / games).toFixed(1) + ' % sur ' + games + ' combats, force conservée ' + (100 * keep / games).toFixed(1) + ' %, combats où la tactique a changé l\'issue ' + decided + ', ' + (rounds / games).toFixed(1) + ' rounds' + (args.spells ? ', mana dépensé ' + (manaNew / games).toFixed(0) + ' contre ' + (manaOld / games).toFixed(0) : '') + ', ' + Math.round((Date.now() - t0) / 1000) + ' s');
