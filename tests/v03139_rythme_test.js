// v0.31.39 : le rythme de la partie (Rapide ×0,67, Normal, Épique ×1,5) : coûts de production, recherche, sorts de carte, croissance,
// échéances. Normal ne change rien ; revenus, entretien, sorts de combat intacts ; une partie ouverte remet les coûts à son échelle.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Cities, DATA, Magic, Turn } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const mk = (pace, seed = 4) => Game.newGame({ seed, mapW: 60, mapH: 40, opponents: 2, difficulty: 'hard', pace, human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
const base = { granary: DATA.buildings.granary.cost, spear: DATA.units.HighMenSpearmen.cost, up: DATA.units.HighMenSpearmen.upkeep, res: DATA.spells.fire_bolt.research, fb: DATA.spells.fire_bolt.cost, sw: DATA.spells.war_bears.cost, swc: DATA.spells.war_bears.combatCost, wall: DATA.spells.wall_of_stone ? DATA.spells.wall_of_stone.cost : null };
const snap = () => JSON.stringify([Object.values(DATA.buildings).map(b => b.cost), Object.values(DATA.units).map(u => u.cost), Object.values(DATA.spells).map(s => [s.cost, s.research, s.combatCost])]);
const S0 = snap();

let g = mk('normal');
ok(Game.PACE === 1 && snap() === S0 && g.crisis.at === 150, 'Normal : rien ne change (Crise au tour ' + g.crisis.at + ')');
const c0 = Cities.ofPlayer(g, 0)[0], grow0 = Cities.econ(g, c0).growth, som0 = g.players[0].somCost;

g = mk('epic');
ok(Game.PACE === 1.5 && DATA.buildings.granary.cost === Math.round(base.granary * 1.5) && DATA.units.HighMenSpearmen.cost === Math.round(base.spear * 1.5), 'Épique : grenier ' + base.granary + ' → ' + DATA.buildings.granary.cost + ', lanciers ' + base.spear + ' → ' + DATA.units.HighMenSpearmen.cost);
ok(DATA.spells.fire_bolt.research === Math.round(base.res * 1.5), 'recherche ' + base.res + ' → ' + DATA.spells.fire_bolt.research);
ok(DATA.spells.fire_bolt.cost === base.fb, 'sort de combat : coût inchangé (' + DATA.spells.fire_bolt.cost + ')');
ok(DATA.spells.war_bears.cost === Math.round(base.sw * 1.5) && DATA.spells.war_bears.combatCost === base.swc, 'invocation : ' + base.sw + ' → ' + DATA.spells.war_bears.cost + ' sur la carte, ' + base.swc + ' en combat');
ok(DATA.units.HighMenSpearmen.upkeep === base.up, 'entretien inchangé');
ok(g.crisis.at === 225, 'la Crise au tour ' + g.crisis.at);
const c1 = Cities.ofPlayer(g, 0)[0], e1 = Cities.econ(g, c1);
ok(e1.growth === Math.max(1, Math.round(grow0 / 1.5)) && e1.growthWhy.some(w => w[0] === 'Rythme de la partie'), 'croissance ' + grow0 + ' → ' + e1.growth + ', expliquée');
ok(g.players[0].somCost === Math.round(som0 * 1.5), 'Sort de Maîtrise ' + som0 + ' → ' + g.players[0].somCost);
ok(Cities.prodCost(g, Object.assign(c1, { prod: { type: 'building', id: 'granary' } }), e1) === DATA.buildings.granary.cost, 'le coût de production suit');

g = mk('fast');
ok(Game.PACE === 0.67 && DATA.buildings.granary.cost === Math.round(base.granary * 0.67) && g.crisis.at === Math.round(150 * 0.67), 'Rapide : grenier ' + DATA.buildings.granary.cost + ', Crise au tour ' + g.crisis.at);
ok(Cities.econ(g, Cities.ofPlayer(g, 0)[0]).growth >= grow0, 'croissance plus vive');

// une partie Normale ouverte après une Épique : les coûts reviennent
g = mk('epic'); const gn = mk('normal');
ok(snap() === S0, 'retour à Normal : tous les coûts d\'origine');
// une sauvegarde Épique rouverte : remise à l\'échelle
g.opts.pace = 'epic'; Game.upgrade(g);
ok(Game.PACE === 1.5 && DATA.buildings.granary.cost === Math.round(base.granary * 1.5), 'une partie Épique rechargée retrouve ses coûts');
Game.upgrade(gn);
ok(snap() === S0, 'puis une partie Normale les siens');

// quarante tours d'IA en Épique et en Rapide : aucun accroc
(async () => {
  for (const pace of ['epic', 'fast']) {
    const gg = mk(pace, 9); gg.players[0].human = false; gg.players[0].aiLevel = 'hard';
    let err = null;
    try { for (let t = 0; t < 40 && !gg.over; t++) await Turn.endTurn(gg); } catch (e) { err = e; }
    ok(!err && gg.turn >= 40, pace + ' : 40 tours joués par l\'IA' + (err ? ' (' + err.message + ')' : '') + ', ' + Object.keys(gg.cities).length + ' cités');
  }
  mk('normal');
  ok(snap() === S0, 'coûts d\'origine en fin de test');
})();
