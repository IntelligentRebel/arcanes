// v0.31.7 : en combat automatique, les civils (ingénieurs, colons, éclaireurs) du joueur ne vont pas au contact tant qu'il reste
// des combattants dans leur camp ; ils s'écartent de l'ennemi. L'IA, elle, à l'essai (AI.PENDING.civilians).
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, World, Cities, Battle, RNG, CombatAI } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
const f = g.cities[g.players[0].fortress];
const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
function run(n, attackerHuman) {
  g.players[0].human = attackerHuman;
  let civHits = 0, civDead = 0, civ = 0, wins = 0, closest = 0, rounds = 0;
  for (let i = 0; i < n; i++) {
    const A = ['EarthElemental', ...Array(5).fill('DwarfEngineer')].map(t => Units.create(g, t, 0, f.plane, x, y));
    const D = ['OrcSwordsmen', 'OrcSwordsmen', 'OrcSwordsmen', 'OrcCavalry', 'OrcCavalry', 'OrcBowmen', 'OrcBowmen', 'OrcSpearmen'].map(t => Units.create(g, t, 1, f.plane, x, y));
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: f.plane, x, y, rng: new RNG(500 + i) });
    const melee = bt.melee.bind(bt);
    bt.melee = (a, d, any) => { if (a.side === 0 && CombatAI.civilian(a) && bt.alive(0).some(o => !CombatAI.civilian(o))) civHits++; return melee(a, d, any); };
    CombatAI.autoResolve(bt);
    const civs = bt.units ? bt.units.filter(b => b.side === 0 && CombatAI.civilian(b)) : [];
    civ += civs.length; civDead += civs.filter(b => b.dead).length; rounds += bt.round;
    if (bt.winner === 0) wins++;
    for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u);
  }
  return { civHits, civDead, civ, wins, rounds: (rounds / n).toFixed(1) };
}
const H = run(40, true), AIr = run(40, false);
console.log('      joueur :', JSON.stringify(H), ' IA (règle à l\'essai, non active) :', JSON.stringify(AIr));
ok(H.civHits === 0, 'joueur en automatique : aucun ingénieur ne charge tant que l\'élémentaire combat (' + H.civHits + ' attaques)');
ok(H.civDead <= AIr.civDead, 'et ils meurent moins (' + H.civDead + ' contre ' + AIr.civDead + ' sur ' + H.civ + ')');
E.AI.LAB = true; const L = run(40, false); E.AI.LAB = false;
ok(L.civHits === 0, 'banc (AI.LAB) : l\'IA applique la règle à l\'essai (' + L.civHits + ' attaques)');
