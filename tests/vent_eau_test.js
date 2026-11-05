// v0.30.2 : Zéphan (Marche des vents) porte une pile au-dessus de l'eau : partir seul, être rappelé, mourir
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Heroes, DATA, Spells, Move } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const g = Game.newGame({ seed: 77, mapW: 60, mapH: 40, opponents: 1, difficulty: 'normal', crisis: 'off', human: { name: 'T', portrait: 0, books: { sorcery: 6 }, retorts: [], race: 'highmen' } });
  const pl = g.players[0];
  // deux cases d'eau voisines
  let A = null, B = null;
  for (let y = 3; y < g.world.h - 3 && !A; y++) for (let x = 2; x < g.world.w - 2 && !A; x++) if (World.isWaterAt(g.world, 0, x, y) && World.isWaterAt(g.world, 0, x + 1, y) && World.isWaterAt(g.world, 0, x + 2, y)) { A = [x, y]; B = [x + 1, y]; }
  const h = Object.values(DATA.heroes).find(x => x.unit === 'HeroJaer');
  const mk = () => { const j = Heroes.spawn(g, pl, h, 0, A[0], A[1], 0); const s = Units.create(g, 'HighMenSwordsmen', 0, 0, A[0], A[1]); j.moves = 4; s.moves = 2; return [j, s]; };
  let [j, s] = mk();
  const r = await Game.moveGroup(g, [j.id], B[0], B[1], {});
  ok(g.units[s.id] && s.x === B[0], 'Zéphan quitte seul la case d\'eau : les épéistes partent avec lui (' + JSON.stringify(r) + ', épéistes en ' + s.x + ',' + s.y + ')');
  pl.known.push('word_of_recall'); pl.mana = 9999; pl.skillLeft = 9999;
  const v = Spells.validate(g, pl, 'word_of_recall', { unit: j.id });
  ok(!v.ok, 'Mot de rappel sur Zéphan au-dessus de l\'eau avec sa pile : refusé (' + v.why + ')');
  g.log = []; Units.remove(g, j);
  ok(!g.units[s.id], 'Zéphan meurt au-dessus de l\'eau : sa pile se noie (' + g.log.map(l => l.text).join(' | ') + ')');
})();
