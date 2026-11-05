'use strict';
// v0.31.15 : une troupe restée seule en mer sans rien pour la porter regagne la côte en fin de tour (ou périt faute de place)
const E = require('./load.js').loadEngine();
let ok = 0, ko = 0;
const t = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
(async () => {
  const game = E.Game.newGame({ seed: 4242, players: 3, human: false });
  const pl = game.players[0], w = game.world;
  // une case d'eau voisine d'une terre libre
  let spot = null;
  for (let y = 2; y < w.h - 2 && !spot; y++) for (let x = 0; x < w.w && !spot; x++) {
    if (!E.World.isWaterAt(w, 0, x, y) || E.Units.at(game, 0, x, y).length) continue;
    const land = E.World.neighbors(w, x, y).find(([a, b]) => !E.World.isWaterAt(w, 0, a, b) && !E.Units.at(game, 0, a, b).length && !E.Cities.at(game, 0, a, b) && !E.Move.blockedMountain(game, 0, a, b) && E.World.get(w, 0, 'site', a, b) < 0);
    if (land) spot = [x, y, land];
  }
  t(spot, 'case de test');
  const u = E.Units.create(game, 'HighMenSwordsmen', pl.id, 0, spot[0], spot[1]);
  E.Game.rescueStranded(game);
  t(!E.World.isWaterAt(w, 0, u.x, u.y), 'le soldat a regagné la terre');
  t(E.World.dist(w, u.x, u.y, spot[0], spot[1]) <= 1, 'sur la côte la plus proche');
  t(game.strandFix === 1 && /HighMenSwordsmen/.test(game.strandEx), 'cas compté pour le banc');
  // un navire qui le porte : rien ne bouge
  const s = E.Units.create(game, 'Trireme', pl.id, 0, spot[0], spot[1]), v = E.Units.create(game, 'HighMenSpearmen', pl.id, 0, spot[0], spot[1]);
  E.Game.rescueStranded(game);
  t(v.x === spot[0] && v.y === spot[1] && game.strandFix === 1, 'transporté par un navire : laissé à bord');
  console.log(ko ? 'ÉCHECS ' + ko : 'OK ' + ok);
  process.exit(ko ? 1 : 0);
})();
