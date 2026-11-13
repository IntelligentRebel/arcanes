// v0.31.47 : un sort qui ne peut pas viser une unité dit pourquoi (Toile sur des Spectres : incorporels, pas « elle vole »)
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, World, Battle, RNG, CombatSpells } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
let at = null;
for (let y = 3; y < 37 && !at; y++) for (let x = 0; x < 60 && !at; x++) {
  if (World.isWaterAt(g.world, 0, x, y) || E.Cities.at(g, 0, x, y) || World.get(g.world, 0, 'site', x, y) >= 0) continue;
  if (Object.values(g.cities).some(c => World.dist(g.world, c.x, c.y, x, y) < 4)) continue;
  at = [x, y];
}
const A = ['GnollHalberdiers', 'Spearmen'].filter(t => E.DATA.units[t]).map(t => Units.create(g, t, 0, 0, at[0] + 1, at[1]));
const D = ['Wraith', 'Griffin', 'GreatDrake'].map(t => Units.create(g, t, 1, 0, at[0], at[1]));
const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: at[0], y: at[1], rng: new RNG(7) });
const side = bt.units.find(b => b.u === A[0]).side, B = t => bt.units.find(b => b.u.type === t);
const vt = CombatSpells.validTargets(bt, side, 'web');
ok(!vt.includes(B('Wraith')), 'la Toile ne prend pas des Spectres');
ok(vt.includes(B('Griffin')) && vt.includes(B('GreatDrake')), 'mais elle prend les volants (griffons, dragon)');
ok(CombatSpells.whyNot(bt, side, 'web', B('Wraith')) === 'Une unité incorporelle passe à travers la toile.', 'la vraie raison : ' + CombatSpells.whyNot(bt, side, 'web', B('Wraith')));
ok(CombatSpells.whyNot(bt, side, 'web', bt.units.find(b => b.u === A[0])) === 'Ce sort vise une unité ennemie.', 'sur une de ses propres unités');
ok(/vole/.test(CombatSpells.whyNot(bt, side, 'cracks_call', B('Griffin'))), 'Appel des failles sur un volant : ' + CombatSpells.whyNot(bt, side, 'cracks_call', B('Griffin')));
// chaque sort de combat qui vise une unité a une raison pour chaque unité qu'il refuse
let n = 0, gen = 0;
for (const id of Object.keys(E.DATA.spells).filter(k => E.DATA.spells[k].combat)) {
  const tt = CombatSpells.targetType(id); if (!['enemyUnit', 'friendlyUnit', 'anyUnit'].includes(tt)) continue;
  const v = CombatSpells.validTargets(bt, side, id);
  for (const b of bt.alive()) if (!v.includes(b)) { n++; const r = CombatSpells.whyNot(bt, side, id, b); if (!r || r === 'Ce sort ne peut pas viser cette unité.') gen++; }
}
ok(n > 0 && gen <= n * 0.05, 'refus expliqués : ' + (n - gen) + ' sur ' + n + ' avec une raison précise');
