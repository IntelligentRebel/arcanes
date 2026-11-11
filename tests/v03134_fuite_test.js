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

// ---------- v0.31.41 : une fuite ne doit jamais risquer de les coûter tous ----------
// Poursuivi par aussi rapide que lui, un fuyard est rattrapé une fois sur deux : seul, il y laisse tout le camp une fois sur
// deux ; à deux, une fois sur quatre. Les défenseurs d'un nœud en faisaient les frais : sur 600 batailles, 56 des 175 retraites
// tuaient tout le monde. Au-delà d'une chance sur cinq d'y rester tous, ils se battent.
{
  const node = g.sites.find(s => s.type === 'node');
  const nat = [node.x, node.y], np = node.plane;
  function atNode(att, def, n) {
    let fled = 0, wiped = 0, worst = 0;
    const realFlee = Battle.prototype.flee;
    Battle.prototype.flee = function (side) { const pl = this.fleePlan(side); worst = Math.max(worst, [...pl.values()].reduce((a, v) => a * (v.risk || 0), 1)); return realFlee.apply(this, arguments); };
    for (let i = 0; i < n; i++) {
      const A = att.map(t => Units.create(g, t, 0, np, nat[0] + 1, nat[1]));
      const D = def.map(t => Units.create(g, t, 1, np, nat[0], nat[1]));
      const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: np, x: nat[0], y: nat[1], rng: new RNG(4100 + i) });
      CombatAI.autoResolve(bt);
      if (bt.fled === 1) { fled++; if (!bt.units.some(x => x.side === 1 && !x.dead)) wiped++; }
      for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u);
    }
    Battle.prototype.flee = realFlee;
    return { fled, wiped, worst };
  }
  const solo = atNode(Array(7).fill('KlackonSpearmen'), ['DarkElfSpearmen'], 20);
  ok(solo.fled === 0, 'un défenseur isolé, poursuivi par aussi rapide que lui, ne fuit pas (fuites ' + solo.fled + '/20)');
  const duo = atNode(Array(9).fill('HighMenSwordsmen'), ['OrcBowmen', 'OrcBowmen'], 20);
  ok(duo.fled === 0, 'deux défenseurs à pied non plus (fuites ' + duo.fled + '/20)');
  // des fuyards plus rapides que leurs poursuivants s'en vont encore
  const fast = atNode(Array(9).fill('TrollSwordsmen'), ['HighElfCavalry', 'HighElfCavalry'], 20);
  ok(fast.fled >= 15, 'de la cavalerie poursuivie par des fantassins fuit encore (fuites ' + fast.fled + '/20)');
  ok(fast.worst <= CombatAI.WIPE_MAX + 1e-9 && solo.worst <= CombatAI.WIPE_MAX + 1e-9 && duo.worst <= CombatAI.WIPE_MAX + 1e-9,
    'aucune fuite décidée au-delà du seuil (' + CombatAI.WIPE_MAX + ') : pire vu ' + fast.worst.toFixed(2));
}

// ---------- v0.31.41 : les créatures neutres ne fuient jamais ----------
// Gardiens d'un nœud ou d'un repaire, monstres en maraude, vagues de la Brèche : elles sont là pour garder ce qu'elles gardent.
{
  const node = g.sites.find(s => s.type === 'node');
  function neutre(def, opts, n) {
    let fled = 0;
    for (let i = 0; i < n; i++) {
      const A = Array(9).fill('Pegasai').map(t => Units.create(g, t, 0, node.plane, node.x + 1, node.y));
      const D = def.map(t => { const u = Units.create(g, t, -1, node.plane, node.x, node.y); Object.assign(u, opts); return u; });
      const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: -1, plane: node.plane, x: node.x, y: node.y, rng: new RNG(5200 + i) });
      CombatAI.autoResolve(bt);
      if (bt.fled === 1) fled++;
      for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u);
    }
    return fled;
  }
  ok(neutre(['Nagas', 'Nagas'], { guardian: node.id }, 15) === 0, 'les gardiens d\'un nœud se battent jusqu\'à la mort');
  ok(neutre(['WolfRiders', 'WolfRiders'], { rampage: true }, 15) === 0, 'des monstres en maraude non plus ne fuient pas');
  ok(neutre(['HellHounds', 'HellHounds', 'HellHounds'], { riftSpawn: true }, 15) === 0, 'les créatures sorties de la Brèche non plus');
}
