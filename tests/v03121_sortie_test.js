// v0.31.21 : une garnison sans tireurs, derrière ses murs, face à un assaillant qui tire, sort l'attaquer au lieu d'attendre la mort ;
// contre des volants qu'elle ne peut atteindre, elle reste à l'abri. Les défenseurs traversent leur propre Mur de feu.
// (0.31.32) la sortie n'est plus qu'un essai de banc (sally_half) : par défaut, la garnison reste à l'abri.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, World, Cities, Battle, RNG, CombatAI } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
const city = Object.values(g.cities).find(c => c.owner === 1) || g.cities[g.players[1].fortress];
city.buildings.cityWalls = 1;
function run(att, fire) {
  let outside = 0, n = 0, wins = 0;
  for (let i = 0; i < 12; i++) {
    const A = att.map(t => Units.create(g, t, 0, city.plane, city.x, city.y));
    const D = ['OrcSwordsmen', 'OrcSwordsmen', 'OrcSpearmen', 'OrcSpearmen'].map(t => Units.create(g, t, 1, city.plane, city.x, city.y));
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: city.plane, x: city.x, y: city.y, city, rng: new RNG(900 + i) });
    if (fire) bt.wallOfFire = true;
    const mv = bt.moveUnit.bind(bt), burnt = { n: 0 };
    bt.moveUnit = (b, c, r, rch) => { const hp = b.u.dmg; const res = mv(b, c, r, rch); if (b.side === 1 && b.u.dmg > hp) burnt.n++; if (b.side === 1 && !bt.inCity(b.c, b.r)) outside++; n++; return res; };
    CombatAI.autoResolve(bt);
    if (bt.winner === 1) wins++;
    if (fire) ok(burnt.n === 0, 'aucun défenseur brûlé par son propre mur de feu (' + burnt.n + ')');
    for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u);
  }
  return { outside, wins };
}
const shelter = run(['Longbowmen', 'Longbowmen', 'Longbowmen', 'Longbowmen']);
console.log('      par défaut, contre des archers :', JSON.stringify(shelter));
ok(shelter.outside === 0, 'par défaut, la garnison reste à l\'abri même face aux archers');
E.AI.EXP = { sally_half: true };
const archers = run(['Longbowmen', 'Longbowmen', 'Longbowmen', 'Longbowmen']);
console.log('      essai sally_half, contre des archers :', JSON.stringify(archers));
ok(archers.outside > 0, 'essai sally_half : la garnison sort attaquer les archers');
const flyers = run(['Pegasai', 'Pegasai', 'Pegasai']);
console.log('      contre des volants :', JSON.stringify(flyers));
ok(flyers.outside === 0, 'contre des volants hors d\'atteinte, elle reste à l\'abri');
run(['Longbowmen', 'Longbowmen', 'Longbowmen'], true);
// v0.31.26 (sally_all, à l'essai au banc) : contre deux archers et deux épéistes, la garnison sort (moitié de tireurs) ;
// avec sally_all, elle ne sort que si tous les assaillants tirent
{
  const mixed = run(['Longbowmen', 'Longbowmen', 'HighMenSwordsmen', 'HighMenSwordsmen']);
  E.AI.EXP = { sally_all: true };
  const mixedAll = run(['Longbowmen', 'Longbowmen', 'HighMenSwordsmen', 'HighMenSwordsmen']);
  const archAll = run(['Longbowmen', 'Longbowmen', 'Longbowmen', 'Longbowmen']);
  E.AI.EXP = {};
  console.log('      archers et épéistes :', JSON.stringify(mixed), 'sally_all :', JSON.stringify(mixedAll), 'archers seuls, sally_all :', JSON.stringify(archAll));
  ok(mixed.outside > 0 && mixedAll.outside < mixed.outside / 4, 'sally_all : pas de sortie contre une moitié d\'épéistes');
  ok(archAll.outside > 0, 'sally_all : sortie contre des archers seuls');
}
