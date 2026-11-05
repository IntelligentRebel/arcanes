'use strict';
// Batailles de référence : taux de victoire attaquant sur N combats automatiques.
const { loadEngine } = require('./load');
const E = loadEngine();
const game = E.Game.newGame({ seed: 7, opponents: 1, human: { name: 'A', portrait: 1, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
function fight(att, def, n = 200) {
  let wins = 0, t = Date.now(), rounds = 0;
  for (let i = 0; i < n; i++) {
    const A = att.map(t => E.Units.create(game, t, 0, 0, 10, 10));
    const D = def.map(t => E.Units.create(game, t, 1, 0, 11, 10));
    const b = new E.Battle(game, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: 11, y: 10 });
    E.CombatAI.autoResolve(b);
    if (b.winner === E.ATT_SIDE) wins++;
    rounds += b.round;
    for (const u of A.concat(D)) delete game.units[u.id];
    for (const u of b.units) delete game.units[u.u.id];
  }
  console.log(att.join('+'), 'vs', def.join('+'), '=>', Math.round(wins / n * 100) + '% (' + Math.round((Date.now() - t) / n) + ' ms/combat, ' + (rounds / n).toFixed(1) + ' rounds)');
}
for (const t of ['HighMenSwordsmen', 'HighMenSpearmen', 'WarBear', 'GreatDrake', 'Skeleton', 'HellHounds', 'Paladin', 'Hydra', 'Basilisk', 'HighMenBowmen', 'DeathKnights']) {
  const u = E.Units.create(game, t, 0, 0, 1, 1); console.log(t, 'force', E.Units.strength(game, u)); delete game.units[u.id];
}
fight(['HighMenSwordsmen'], ['HighMenSpearmen']);
fight(['HighMenSpearmen'], ['HighMenSwordsmen']);
fight(['HighMenSwordsmen', 'HighMenSwordsmen'], ['WarBear']);
fight(['HighMenBowmen', 'HighMenBowmen', 'HighMenSwordsmen'], ['HighMenSwordsmen', 'HighMenSwordsmen']);
fight(Array(9).fill('HighMenSwordsmen'), ['GreatDrake']);
fight(['Paladin', 'Paladin'], ['Skeleton', 'Skeleton', 'Skeleton', 'Skeleton']);
fight(['WarBear', 'WarBear'], ['HellHounds', 'HellHounds', 'HellHounds']);
fight(['HighMenSwordsmen', 'HighMenSwordsmen', 'HighMenSwordsmen', 'HighMenSwordsmen'], ['Hydra'], 100);
fight(['DeathKnights'], ['Paladin', 'Paladin'], 100);
