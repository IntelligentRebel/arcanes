// v0.31.34 : une pile perdue ne fuit que si la fuite en sauve au moins la moitié. Poursuivis par des volants plus rapides,
// des fantassins seraient presque tous rattrapés : ils se battent jusqu'au bout. Des cavaliers poursuivis par des fantassins fuient.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, World, Battle, RNG, CombatAI } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
// une case de plaine dégagée, loin des cités
let at = null;
for (let y = 3; y < 37 && !at; y++) for (let x = 0; x < 60 && !at; x++) {
  if (World.isWaterAt(g.world, 0, x, y) || E.Cities.at(g, 0, x, y) || World.get(g.world, 0, 'site', x, y) >= 0) continue;
  if (Object.values(g.cities).some(c => World.dist(g.world, c.x, c.y, x, y) < 4)) continue;
  if (World.neighbors(g.world, x, y).every(([nx, ny]) => !World.isWaterAt(g.world, 0, nx, ny) && World.get(g.world, 0, 'site', nx, ny) < 0)) at = [x, y];
}
function run(att, def, n) {
  let fled = 0;
  for (let i = 0; i < n; i++) {
    const A = att.map(t => Units.create(g, t, 0, 0, at[0] + 1, at[1]));
    const D = def.map(t => Units.create(g, t, 1, 0, at[0], at[1]));
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: at[0], y: at[1], rng: new RNG(300 + i) });
    CombatAI.autoResolve(bt);
    if (bt.fled === 1) fled++;
    for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u);
  }
  return fled;
}
const slow = run(['Pegasai', 'Pegasai', 'Pegasai', 'Pegasai', 'Pegasai', 'Pegasai'], ['HighMenSpearmen', 'HighMenSpearmen'], 10);
console.log('      lanciers contre six pégases : fuites', slow, 'sur 10');
ok(slow === 0, 'des lanciers poursuivis par des volants ne fuient pas : ils seraient rattrapés');
const fly = run(['HighMenPikemen', 'HighMenPikemen', 'HighMenPikemen', 'HighMenPikemen', 'HighMenPikemen', 'HighMenPikemen', 'HighMenPikemen', 'HighMenPikemen'], ['HighMenCavalry', 'HighMenSpearmen'], 10);
console.log('      des cavaliers contre huit piquiers : fuites', fly, 'sur 10');
ok(fly > 0, 'des cavaliers (plus rapides que leurs poursuivants) fuient encore (' + fly + ' sur 10)');
