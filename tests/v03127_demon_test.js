// v0.31.27 : le Démon légendaire arrive avec un cortège de 4 Chevaliers de la mort et invoque ses démons mineurs jusqu'à deux fois
// par combat (3 à chaque fois, dans la limite de 9 unités par camp)
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, Battle, RNG, CombatAI, Rite } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'hardcore', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
const city = g.cities[g.players[0].fortress];
ok(Rite.cfg(g, 'retinue') === 4 && Rite.cfg(g, 'summons') === 2, 'réglages du jeu : cortège de 4, deux invocations');
function fight(withRetinue, rounds) {
  let summoned = 0, max = 0, wins = 0;
  for (let i = 0; i < rounds; i++) {
    const d = Units.create(g, 'RiteDemon', 1, city.plane, city.x, city.y); d.riteDemon = true;
    const A = [d].concat(withRetinue ? [0, 1, 2, 3].map(() => Units.create(g, 'DeathKnights', 1, city.plane, city.x, city.y)) : []);
    const D = ['Paladins', 'Paladins', 'Paladins', 'Paladins', 'HighElfLongbowmen', 'HighElfLongbowmen', 'Pegasai', 'Pegasai'].map(t => Units.create(g, DATA_OK(t), 0, city.plane, city.x, city.y));
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 1, defenderPid: 0, plane: city.plane, x: city.x, y: city.y, city: null, rng: new RNG(700 + i) });
    CombatAI.autoResolve(bt);
    const dem = bt.units.filter(b => b.u.type === 'Demon' && b.side === bt.units.find(x => x.u.id === d.id).side);
    summoned += dem.length; max = Math.max(max, dem.length);
    const side = bt.units.find(x => x.u.id === d.id).side;
    ok(bt.units.filter(b => b.side === side).length <= 9 + bt.dead.filter(b => b.side === side).length, 'jamais plus de 9 à la fois');
    if (bt.winner === side) wins++;
    for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u);
    for (const b of bt.units) if (g.units[b.u.id] && b.u.temp) Units.remove(g, b.u);
  }
  return { summoned: summoned / rounds, max, wins };
}
function DATA_OK(t) { return E.DATA.units[t] ? t : 'HighMenSpearmen'; }
const a = fight(false, 6), b = fight(true, 6);
console.log('      seul :', JSON.stringify(a), ' avec cortège :', JSON.stringify(b));
ok(a.max > 3, 'seul, il invoque une seconde fois (au plus ' + a.max + ' démons)');
ok(b.max === 3 || b.max === 6, 'avec cortège, la seconde invocation attend la place pour trois (au plus ' + b.max + ')');
