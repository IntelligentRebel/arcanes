// v0.31.58 : une route enchantée (et toute route de Myrror) coûte un quart de point de mouvement par case, la moitié d'une route
// ordinaire, au lieu de rien (on traversait tout un réseau d'un coup) ; le peuple d'un sorcier rival penche vers sa magie.
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, DATA, World, Units, Move, T } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const g = Game.newGame({ seed: 9, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 6 }, retorts: [], race: 'highmen' } });
  const w = g.world, pl = g.players[0], p = 0;
  // une plaine de 14 cases en ligne, vide de tout, avec une route
  let row = null;
  for (let y = 3; y < w.h - 3 && !row; y++) for (let x0 = 0; x0 < w.w - 14 && !row; x0++) {
    let okk = true; for (let k = 0; k < 14 && okk; k++) { const x = x0 + k; if (World.isWater(World.terr(w, p, x, y)) || World.get(w, p, 'site', x, y) >= 0 || E.Cities.at(g, p, x, y) || Units.at(g, p, x, y).length) okk = false; }
    if (okk) row = [x0, y];
  }
  ok(!!row, 'une ligne de 14 cases de terre');
  const [x0, y] = row;
  for (let k = 0; k < 14; k++) { World.set(w, p, 'terr', x0 + k, y, T.GRASS); World.set(w, p, 'road', x0 + k, y, 1); }
  for (const q of [0, 1]) pl.explored[q].fill(1);
  const walk = async () => {
    const u = Units.create(g, 'HighMenSpearmen', pl.id, p, x0, y); u.moves = Units.maxMoves(g, u);
    await Game.moveGroup(g, [u.id], x0 + 13, y, { auto: true });
    const d = u.x - x0; delete g.units[u.id]; return d;
  };
  const d1 = await walk();
  for (let k = 0; k < 14; k++) World.set(w, p, 'road', x0 + k, y, 2);
  const d2 = await walk();
  const u = Units.create(g, 'HighMenSpearmen', pl.id, p, x0, y), gi = Move.groupInfo ? Move.groupInfo(g, [u]) : {};
  ok(Move.stepCost(g, u, gi, p, x0, y, x0 + 1, y) === 0.5, 'route enchantée : un quart de point par case (' + Move.stepCost(g, u, gi, p, x0, y, x0 + 1, y) + ' demi-point)');
  ok(d1 === 2 && d2 === 4, 'lanciers (1 point) : ' + d1 + ' cases sur une route, ' + d2 + ' sur une route enchantée');
  ok(/deux fois plus vite/.test(DATA.spells.enchant_road.desc), 'le sort le dit : ' + DATA.spells.enchant_road.desc);
  // le peuple selon la magie
  const lead = {};
  for (let seed = 1; seed <= 300; seed++) {
    const gg = Game.newGame({ seed, mapW: 40, mapH: 30, opponents: 3, otherPlane: 2, crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 6 }, retorts: [], race: 'highmen' } });
    for (const q of gg.players.filter(q => !q.human)) { const k = q.name + '|' + q.race; lead[k] = (lead[k] || 0) + 1; }
  }
  const share = (name, races) => { let a = 0, t = 0; for (const k in lead) { const [n, r] = k.split('|'); if (n !== name) continue; t += lead[k]; if (races.includes(r)) a += lead[k]; } return t ? Math.round(100 * a / t) : 0; };
  const v = share('Vorgath', ['darkelf']), c = share('Célestine', ['highmen', 'halfling']), co = share('Célestine', ['orc', 'gnoll']);
  ok(v >= 30, 'Vorgath (Mort 9) mène les Elfes noirs : ' + v + ' % de ses parties (au hasard : environ 15 %)');
  ok(c >= 35 && co <= 12, 'Célestine (Vie 10) : Hauts-Hommes ou Halfelins ' + c + ' %, Orques ou Gnolls ' + co + ' %');
})();
