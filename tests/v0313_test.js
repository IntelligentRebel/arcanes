// v0.31.3 : deux ouvrages bâtis par partie au plus ; les rebelles ne prennent jamais les fermiers dont la cité a besoin pour manger.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, World, Cities, Wonders, Magic, Turn, DATA, T } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'dwarf' } });
const pl = g.players[0], cap = g.cities[pl.fortress];
const spots = []; { const w = g.world; for (let r = 4; r < 14 && spots.length < 3; r += 4) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const x = World.wx(w, cap.x + dx), y = cap.y + dy; if (spots.length < 3 && World.inY(w, y) && !World.isWaterAt(w, cap.plane, x, y) && !Cities.at(g, cap.plane, x, y) && World.terr(w, cap.plane, x, y) !== T.MOUNTAIN && !spots.some(([a, b]) => World.dist(w, a, b, x, y) < 4)) spots.push([x, y]); } }
const [c1, c2, c3] = [['gnoll', spots[0]], ['orc', spots[1]], ['troll', spots[2]]].map(([r, [x, y]]) => Cities.create(g, pl.id, r, cap.plane, x, y, { pop: 5000 }));
Wonders.sync(g);
Magic.refreshResearchOptions(g, pl);
ok(['lore_dwarf', 'lore_gnoll', 'lore_orc', 'lore_troll'].every(id => pl.researchOptions.includes(id)), 'quatre peuples, quatre recherches proposées');
pl.lore = ['lore_dwarf', 'lore_gnoll'];
Magic.refreshResearchOptions(g, pl);
ok(!pl.researchOptions.some(id => DATA.spells[id].lore), 'deux plans en main : plus aucune autre recherche d\'ouvrage proposée');
// bâtir : un, puis un second en chantier ailleurs, et le troisième est refusé
pl.lore = ['lore_dwarf', 'lore_gnoll', 'lore_orc'];
ok(Cities.canBuild(g, cap, 'motherForge') && Cities.canBuild(g, c1, 'fangPit') && Cities.canBuild(g, c2, 'skullThrone'), 'aucun bâti : chacun est possible');
cap.prod = { type: 'building', id: 'motherForge' }; cap.progress = 99999;
Turn.processCity(g, cap, pl);
ok(cap.buildings.motherForge && pl.wondersBuilt === 1, 'Forge-Mère bâtie : 1 sur 2');
c1.prod = { type: 'building', id: 'fangPit' };
ok(!Cities.canBuild(g, c2, 'skullThrone') && /vos 2 ouvrages/.test(Cities.pathTo(g, c2, 'skullThrone').impossible || ''), 'un second en chantier : le troisième est refusé (' + Cities.pathTo(g, c2, 'skullThrone').impossible + ')');
c1.progress = 99999; Turn.processCity(g, c1, pl);
ok(pl.wondersBuilt === 2 && !Cities.canBuild(g, c2, 'skullThrone'), 'deux bâtis : plus rien');
// une cité prise avec son ouvrage : à lui, sans compter
c3.buildings.menhirCircle = true; Wonders.sync(g);
ok(Wonders.has(g, pl.id, 'troll') && pl.wondersBuilt === 2, 'un ouvrage pris avec sa cité s\'ajoute sans compter dans les deux');

// les rebelles et la faim : une cité d'un seul habitant, agitée
const k = c1; k.pop = 1500; k.race = 'gnoll'; pl.taxIdx = 6;
const e1 = Cities.econ(g, k);
ok(e1.rebels === 0 && e1.food >= e1.citizens, 'un habitant : il cultive au lieu de se rebeller (' + e1.rebels + ' rebelle, nourriture ' + e1.food + ' pour ' + e1.citizens + ')');
k.pop = 8500; const e2 = Cities.econ(g, k);
ok(e2.foodSurplus >= 0 && (e2.unrestCap == null || e2.rebels === e2.unrestCap), 'huit habitants : ' + e2.rebels + ' rebelles' + (e2.unrestCap != null ? ' (la somme en donnerait ' + e2.unrestRaw + ')' : '') + ', surplus de nourriture ' + e2.foodSurplus);
pl.taxIdx = 0; const e3 = Cities.econ(g, k);
ok(e3.unrestCap == null, 'impôts au plus bas : pas de plafond nécessaire (' + e3.rebels + ' rebelle(s))');
