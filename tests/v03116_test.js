'use strict';
// v0.31.16 : fenêtre illustrée des événements (le journal porte ref.event) ; filet de fin de tour : une unité à 0 PV est retirée
const E = require('./load.js').loadEngine();
let ok = 0, ko = 0;
const t = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const game = E.Game.newGame({ seed: 4243, players: 3, human: false });
const pl = game.players[0], c = game.cities[pl.fortress];
const u = E.Units.create(game, 'HighMenSwordsmen', pl.id, c.plane, c.x, c.y);
u.dmg = E.Units.stats(game, u).maxHp;
E.Game.rescueStranded(game);
t(!game.units[u.id], 'unité à 0 PV retirée');
t(game.deadFix === 1 && /HighMenSwordsmen/.test(game.deadEx), 'cas compté pour le banc');
const v = E.Units.create(game, 'HighMenSwordsmen', pl.id, c.plane, c.x, c.y); v.dmg = 1;
E.Game.rescueStranded(game);
t(!!game.units[v.id], 'une unité blessée reste');
// événements : chaque ligne du journal d'un événement aléatoire porte son identifiant
game.turn = 40; let seen = 0;
for (let k = 0; k < 400; k++) { game.rng.chance = () => true; E.Turn.randomEvents(game); }
const evs = new Set(game.log.filter(e => e.ref && e.ref.event).map(e => e.ref.event));
t(evs.size >= 6, 'événements étiquetés (' + [...evs].join(', ') + ')');
const pg = game.log.find(e => e.ref && e.ref.event === 'plague');
t(!pg || /La peste frappe .+(habitants en moins|\.)$/.test(pg.text), 'peste : la perte est dite (' + (pg && pg.text) + ')');
console.log(ko ? 'ÉCHECS ' + ko : 'OK ' + ok);
process.exit(ko ? 1 : 0);
