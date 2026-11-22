// v0.31.72 : cinq sorts de zone, rares : Pluie de feu, Anneau de givre (le centre épargné), Chute de météores (murailles et tours),
// Nuée pestilentielle (plusieurs rounds, pas les morts-vivants), Aube sacrée (vos blessés seulement). Ils frappent amis et ennemis ; l'IA
// les lance là où l'ennemi souffre plus que ses troupes.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Cities, Battle, RNG, CombatSpells, CombatAI, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 12, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { chaos: 4, nature: 3, life: 3 }, retorts: [], race: 'highmen' } });
const me = g.players[0]; me.human = true; me.mana = 100000;
const fc = g.cities[me.fortress];
let at = null;
for (let d = 3; d < 15 && !at; d++) for (let dx = -d; dx <= d && !at; dx++) for (const dy of [-d, d]) { const x = World.wx(g.world, fc.x + dx), y = fc.y + dy; if (World.inY(g.world, y) && World.terr(g.world, 0, x, y) === E.T.GRASS && !Cities.at(g, 0, x, y)) { at = [x, y]; break; } }
function battle(mine, theirs, o = {}) {
  const A = mine.map(([t]) => Units.create(g, t, 0, 0, at[0], at[1])), D = theirs.map(([t]) => Units.create(g, t, 1, 0, at[0], at[1]));
  const bt = new Battle(g, Object.assign({ attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: at[0], y: at[1], rng: new RNG(o.seed || 5) }, o.city ? { city: o.city, x: o.city.x, y: o.city.y } : {}));
  if (!o.keepTerrain) { bt.props = {}; bt.hills = {}; bt.river = {}; bt.ford = {}; bt.bridge = {}; bt.mud = {}; }
  bt.alive(0).forEach((b, i) => { b.c = mine[i][1]; b.r = mine[i][2]; });
  bt.alive(1).forEach((b, i) => { b.c = theirs[i][1]; b.r = theirs[i][2]; });
  bt.side = 0; bt.castThisRound[0] = false; bt.skillLeft[0] = 100000; bt.resetMoves(0);
  return bt;
}
const cast = (bt, id, t) => { bt.castThisRound[0] = false; if (!me.known.includes(id)) me.known.push(id); return CombatSpells.cast(bt, 0, id, t, null, 0); };
const ids = ['fire_rain', 'frost_ring', 'meteor_shower', 'plague_cloud', 'holy_dawn'];
ok(ids.every(id => ['rare', 'veryrare'].includes(DATA.spells[id].rarity)), 'les cinq sorts de zone sont rares (Chute de météores : très rare)');
// Pluie de feu : amis et ennemis de la zone, personne au-dehors
{
  const bt = battle([['HighMenSpearmen', 5, 4], ['HighMenSpearmen', 2, 2]], [['HighMenSpearmen', 5, 5], ['HighMenSpearmen', 6, 6], ['HighMenSpearmen', 9, 9]]);
  const [m1, m2] = bt.alive(0), [e1, e2, e3] = bt.alive(1), d0 = [m1, m2, e1, e2, e3].map(b => b.u.dmg);
  cast(bt, 'fire_rain', [5, 5]);
  const d1 = [m1, m2, e1, e2, e3].map(b => b.u.dmg);
  ok(d1[2] > d0[2] && d1[3] > d0[3] && d1[4] === d0[4], 'Pluie de feu : les deux ennemis de la zone touchés, pas le lointain');
  ok(d1[0] > d0[0] && d1[1] === d0[1], 'et nos lanciers pris dans la zone aussi ; ceux du dehors, non');
  ok(/des vôtres/.test(bt.log.join(' ')), 'le journal signale les vôtres touchés');
}
// Anneau de givre : le centre épargné
{
  const bt = battle([['HighMenSwordsmen', 5, 5]], [['HighMenSpearmen', 5, 6], ['HighMenSpearmen', 6, 5], ['HighMenSpearmen', 4, 4]]);
  const c = bt.alive(0)[0], d0 = c.u.dmg, f0 = bt.alive(1).map(b => b.u.dmg);
  cast(bt, 'frost_ring', [5, 5]);
  ok(c.u.dmg === d0 && bt.alive(1).concat(bt.dead).filter(b => b.side === 1).every((b, i) => b.u.dmg > f0[i]), 'Anneau de givre : le centre (notre épéiste) épargné, les trois ennemis autour gelés');
}
// Chute de météores : murailles et tours
{
  const ec = Object.values(g.cities).find(c => c.owner === 1); ec.buildings.cityWalls = true; ec.buildings.defenseTowers = true;
  const bt = battle([['HighMenSpearmen', 11, 11]], [['HighMenSpearmen', 5, 5]], { city: ec, keepTerrain: true });
  const tw = bt.towers.find(t => t.kind === 'stone');
  const h0 = tw.hp;
  const wallsIn = CombatSpells.zonePlace(bt, 0, 'meteor_shower', [tw.c, tw.r]).filter(([c, r]) => bt.walls[c + ',' + r] && !bt.walls[c + ',' + r].broken).length;
  cast(bt, 'meteor_shower', [tw.c, tw.r]);
  const broken = CombatSpells.zonePlace(bt, 0, 'meteor_shower', [tw.c, tw.r]).filter(([c, r]) => bt.walls[c + ',' + r] && bt.walls[c + ',' + r].broken).length;
  ok(wallsIn > 0 && broken === wallsIn && (tw.hp < h0 || tw.dead), 'Chute de météores : ' + broken + ' pans de muraille écroulés, la tour encaisse (' + h0 + ' → ' + tw.hp + ')');
}
// Nuée pestilentielle : plusieurs rounds, les morts-vivants épargnés
{
  const bt = battle([['Zombie', 5, 4]], [['HighMenSpearmen', 5, 5], ['HighMenSwordsmen', 6, 6], ['OrcSwordsmen', 12, 0]]);
  const z = bt.alive(0)[0], z0 = z.u.dmg, e = bt.alive(1)[1];
  cast(bt, 'plague_cloud', [5, 5]);
  ok(Object.keys(bt.plague).length === 9 && z.u.dmg === z0, 'Nuée pestilentielle : 9 cases, notre zombie insensible');
  const e1 = e.u.dmg; bt.endSide(); bt.endSide();
  ok(e.dead || e.u.dmg > e1 || /Nuée pestilentielle/.test(bt.log.slice(-6).join(' ')), 'elle ronge encore au round suivant');
  for (let i = 0; i < 8; i++) bt.endSide();
  ok(!Object.keys(bt.plague).length, 'elle se dissipe après 3 rounds');
}
// Aube sacrée : vos blessés seulement
{
  const bt = battle([['HighMenSwordsmen', 5, 5], ['HighMenSpearmen', 6, 5]], [['HighMenSwordsmen', 5, 6]]);
  const [a, b] = bt.alive(0), e = bt.alive(1)[0];
  a.u.dmg = 3; b.u.dmg = 2; e.u.dmg = 3;
  ok(cast(bt, 'holy_dawn', [5, 5]) && a.u.dmg === 0 && b.u.dmg === 0 && e.u.dmg === 3, 'Aube sacrée : nos blessés guéris, l\'ennemi de la zone non');
}
// l'IA : chacun de ces sorts lancé quand il sert, et pas sur ses propres troupes
{
  const keep = me.known.slice(); const used = {};
  for (const id of ids) {
    for (let i = 0; i < 10 && !used[id]; i++) {
      const bt = battle([['HighMenSwordsmen', 3, 3], ['HighMenBowmen', 2, 4], ['HighMenCavalry', 4, 2], ['HighMenSpearmen', 3, 5], ['HighMenMagician', 1, 3]], [['OrcSwordsmen', 9, 9], ['OrcBowmen', 10, 10], ['OrcCavalry', 9, 11], ['OrcSpearmen', 11, 9], ['OrcShamans', 11, 11]], { seed: 900 + i * 5, keepTerrain: true });
      me.human = false; me.known = [id]; g.players[1].mana = 0; bt.skillLeft = [200, 0];
      if (id === 'holy_dawn') for (const b of bt.alive(0)) b.u.dmg = Math.floor(Units.stats(g, b.u).maxHp / 2);
      CombatAI.autoResolve(bt);
      for (const e of bt.events) if (e.type === 'spell' && e.spell === id && e.side === 0) used[id] = true;
    }
  }
  me.known = keep; me.human = true;
  ok(ids.every(id => used[id]), 'l\'IA lance ' + Object.keys(used).length + ' de ces 5 sorts (' + ids.filter(id => !used[id]).join(', ') + ')');
  // jamais sur la seule mêlée où ses troupes sont plus nombreuses
  const bt = battle([['HighMenSwordsmen', 5, 5], ['HighMenSwordsmen', 5, 6], ['HighMenSwordsmen', 6, 5]], [['OrcSpearmen', 6, 6], ['OrcSpearmen', 12, 0]]);
  const P = CombatAI.hommPlan(bt, 0, 'fire_rain', null);
  ok(!P || Math.max(Math.abs(P.target[0] - 5.5), Math.abs(P.target[1] - 5.5)) > 1.5, 'elle ne brûle pas trois de ses épéistes pour un seul ennemi (' + JSON.stringify(P && P.target) + ')');
}
