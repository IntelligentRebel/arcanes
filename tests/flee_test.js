// v0.29.17-18 : la fuite selon la vitesse : V² / (V² + v²), borné à 5-95 % ; chaque poursuivant prend en chasse deux fuyards au plus
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, Units, World, Cities, Battle, RNG, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
const f = g.cities[g.players[0].fortress];
const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
// taux de pertes en fuite sur n combats : le camp side fuit au premier tour
function rate(att, def, side, n = 2000, prep) {
  let dead = 0, tot = 0, risk = null;
  for (let i = 0; i < n; i++) {
    const A = att.map(t => Units.create(g, t, 0, f.plane, x, y)), D = def.map(t => Units.create(g, t, 1, f.plane, x, y));
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: f.plane, x, y, rng: new RNG(1000 + i) });
    if (prep) prep(bt);
    const fl = bt.alive(side); if (risk == null) risk = fl.map(b => Math.round(bt.fleeRisk(b) * 100));
    bt.flee(side); tot += fl.length; dead += fl.filter(b => b.dead).length;
    for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u);
  }
  return { taux: Math.round(dead / tot * 100), risque: risk };
}
const DEF = 1, ATT = 0;
let r = rate(['HighElfCavalry', 'HighElfCavalry'], ['OrcSpearmen'], DEF);
ok(Math.abs(r.taux - 80) <= 3 && r.risque[0] === 80, 'lanciers (1) fuyant deux cavaliers (2) : rattrapés ' + r.taux + ' % (risque annoncé ' + r.risque + ' %)');
r = rate(['HighElfScouts'], ['OrcSpearmen'], ATT);
ok(Math.abs(r.taux - 20) <= 3, 'éclaireurs (2) fuyant des lanciers (1) : rattrapés ' + r.taux + ' %');
r = rate(['HighElfSpearmen'], ['OrcSpearmen'], ATT);
ok(Math.abs(r.taux - 50) <= 3, 'lanciers contre lanciers : ' + r.taux + ' %');
r = rate(['HighElfSpearmen', 'HighElfCavalry'], ['OrcSpearmen', 'OrcCavalry'], ATT);
ok(Math.abs(r.taux - 65) <= 3 && r.risque.join() === '80,50', 'armées mêlées, le cavalier orque poursuit : lanciers 80 %, cavaliers 50 % (moyenne ' + r.taux + ' %, annoncés ' + r.risque + ')');
r = rate(['Pegasai'], ['OrcCavalry'], ATT);
ok(r.taux === 0, 'volants fuyant des cavaliers : ' + r.taux + ' %');
if (DATA.units.GreatDrake) { r = rate(['Pegasai'], ['GreatDrake'], ATT); ok(Math.abs(r.taux - 31) <= 3, 'pégases (3) fuyant un grand drake volant (2) : ' + r.taux + ' %'); }
r = rate(['HighElfCavalry'], ['OrcSpearmen'], ATT, 2000, bt => { bt.alive(ATT)[0].web = 12; });
ok(Math.abs(r.taux - 95) <= 2, 'cavaliers pris dans une toile : ' + r.taux + ' %');
r = rate(['HighElfSpearmen'], ['OrcCavalry'], ATT, 2000, bt => { bt.alive(DEF)[0].web = 12; });
ok(r.taux === 0, 'le seul poursuivant est pris dans une toile : ' + r.taux + ' %');
r = rate(['HighElfCavalry'], Array(9).fill('OrcSpearmen'), DEF, 600);
ok(r.risque.filter(x => x === 80).length === 2 && r.risque.filter(x => x === 0).length === 7 && Math.abs(r.taux - 18) <= 3, 'neuf lanciers fuyant un seul cavalier : deux pris en chasse (80 %), sept s\'échappent (pertes ' + r.taux + ' %, risques ' + r.risque + ')');
r = rate(['HighElfCavalry', 'HighElfSpearmen'], ['OrcSpearmen', 'OrcSpearmen', 'OrcSpearmen'], DEF, 1000);
ok(r.risque.slice().sort().join() === '50,80,80', 'trois lanciers devant un cavalier et un lancier : 80, 80 et 50 % (' + r.risque + ')');
r = rate(['GreatDrake'], ['OrcSpearmen', 'OrcSpearmen', 'Pegasai'].filter(t => DATA.units[t]), DEF, 600);
ok(r.risque.join() === '80,80,0', 'un drake devant deux lanciers et des pégases : il court après les lanciers, les pégases s\'échappent (' + r.risque + ')');
