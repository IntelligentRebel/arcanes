'use strict';
// v0.31.15 : malus d'éloignement (le palais du gouverneur est retiré en v0.31.18) ; essai IA engineers (percer les cols) chargé sans erreur
const E = require('./load.js').loadEngine();
let ok = 0, ko = 0;
const t = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const game = E.Game.newGame({ seed: 777, players: 3, human: false });
const pl = game.players[0], fc = game.cities[pl.fortress], w = game.world;
// une cité lointaine (au-delà de 20 cases) sur le même plan, et une seconde à côté d'elle
const spots = [];
for (let y = 3; y < w.h - 3; y++) for (let x = 0; x < w.w; x++) if (!E.World.isWaterAt(w, fc.plane, x, y) && E.World.dist(w, x, y, fc.x, fc.y) > 24 && !E.Cities.at(game, fc.plane, x, y)) spots.push([x, y]);
const land = []; for (let y = 3; y < w.h - 3; y++) for (let x = 0; x < w.w; x++) if (!E.World.isWaterAt(w, fc.plane, x, y) && !E.Cities.at(game, fc.plane, x, y)) land.push([x, y]);
const a = spots.find(([ax, ay]) => land.some(([x, y]) => E.World.dist(w, x, y, ax, ay) >= 3 && E.World.dist(w, x, y, ax, ay) <= 6)), b = a && land.find(([x, y]) => E.World.dist(w, x, y, a[0], a[1]) >= 3 && E.World.dist(w, x, y, a[0], a[1]) <= 6);
t(a && b, 'emplacements');
const mk = (x, y, n) => { const c = E.Cities.found ? null : null; const id = Math.max(...Object.keys(game.cities).map(Number)) + 1;
  const k = Object.assign(JSON.parse(JSON.stringify(fc)), { id, x, y, name: n, fortress: false, buildings: {}, prod: null, queue: [], ench: [] }); game.cities[id] = k; return k; };
const c1 = mk(a[0], a[1], 'Loin'), c2 = mk(b[0], b[1], 'Voisine');
t(E.Cities.overstretch(game, c1, pl).dist === 1, 'cité lointaine : malus d\'éloignement');
t(!E.DATA.buildings.governorsPalace, 'plus de palais du gouverneur (v0.31.18)');
t(typeof E.AI.passCheck === 'function' && E.AI.PENDING.engineers, 'essai engineers déclaré');
console.log(ko ? 'ÉCHECS ' + ko : 'OK ' + ok);
process.exit(ko ? 1 : 0);
