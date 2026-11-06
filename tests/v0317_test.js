// v0.31.25 : l'éloignement de la capitale et l'étendue de l'empire pèsent un rebelle chacun (comme avant la 0.31.7) ; les +10 % par habitant
// de la 0.31.7 restent en variante de banc (propOverstretch).
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, World, Cities, T } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const mk = prop => {
  const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', propOverstretch: prop, human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
  const pl = g.players[0], cap = g.cities[pl.fortress], w = g.world;
  let spot = null;
  for (let dx = 22; dx < 30 && !spot; dx++) for (const s of [1, -1]) { const x = World.wx(w, cap.x + s * dx), y = cap.y; if (!spot && !World.isWaterAt(w, cap.plane, x, y) && !Cities.at(g, cap.plane, x, y) && World.terr(w, cap.plane, x, y) !== T.MOUNTAIN) spot = [x, y]; }
  const c = Cities.create(g, pl.id, 'gnoll', cap.plane, spot[0], spot[1], { pop: 5000 });
  return { g, c, pl };
};
const part = (e, re) => ((e.unrestWhy || []).find(([k]) => re.test(k)) || [0, 0])[1];
const A = mk(true), B = mk(false);
const N = Cities.citizens(A.c);
const ea = Cities.econ(A.g, A.c), eb = Cities.econ(B.g, B.c);
ok(Math.abs(part(ea, /^Loin de la capitale/) - 0.1 * N) < 1e-9, N + ' habitants loin de la capitale : +' + part(ea, /^Loin/) + ' (variante de banc : 10 % par habitant)');
ok(part(eb, /^Loin de la capitale/) === 1, 'le jeu : un rebelle de plus');
A.c.pop = 20000; const big = Cities.econ(A.g, A.c);
ok(Math.abs(part(big, /^Loin de la capitale/) - 0.1 * Cities.citizens(A.c)) < 1e-9, 'à ' + Cities.citizens(A.c) + ' habitants : +' + part(big, /^Loin/));
ok(ea.unrestSum != null && Math.floor(ea.unrestSum) >= ea.unrest, 'la somme avant arrondi est exposée (' + ea.unrestSum.toFixed(2) + ' → ' + ea.unrest + ')');
ok(Cities.econ(A.g, A.g.cities[A.pl.fortress]).unrestWhy.every(([k]) => !/Loin|Étendue/.test(k)), 'la forteresse n\'est pas touchée');
