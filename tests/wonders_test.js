// v0.31 : ouvrages de race. Recherche (hors grimoire), une seule cité de la race par empire, et l'effet de chacun des quatorze.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;   // le jeu livré
const { Game, Units, World, Cities, Wonders, Magic, Turn, Move, Battle, CombatAI, RNG, DATA, T } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'dwarf' } });
const pl = g.players[0], cap = g.cities[pl.fortress];
const give = (race, c = cap) => { pl.lore = (pl.lore || []).concat('lore_' + race); c.race = race; c.buildings[DATA.wonders[race]] = true; Wonders.sync(g); };
const drop = (race, c = cap) => { delete c.buildings[DATA.wonders[race]]; pl.lore = (pl.lore || []).filter(x => x !== 'lore_' + race); c.race = 'dwarf'; Wonders.sync(g); };

// ---- la recherche ----
Magic.refreshResearchOptions(g, pl);
const opts = pl.researchOptions;
ok(opts.includes('lore_dwarf') && opts.filter(id => !DATA.spells[id].lore).length === 8, 'recherche proposée en plus des 8 sorts : ' + opts.filter(id => DATA.spells[id].lore).join(', '));
ok(!Magic.spellsOf('arcane').some(s => s.lore), 'pas dans la réserve des sorts d\'Arcane');
ok(!Cities.canBuild(g, cap, 'motherForge'), 'avant la recherche : impossible');
pl.researching = 'lore_dwarf'; pl.researchProgress = 1499; const known0 = pl.known.length;
Magic.learn(g, pl, 'lore_dwarf');
ok(pl.lore.includes('lore_dwarf') && pl.known.length === known0 && !pl.researchOptions.includes('lore_dwarf'), 'apprise : dans les plans du sorcier, pas dans son grimoire');
ok(Cities.canBuild(g, cap, 'motherForge'), 'après la recherche : la Forge-Mère se bâtit dans la capitale naine');
ok(!Cities.canBuild(g, cap, 'jarlsHall'), 'pas la Halle des Jarls dans une cité naine');
const p2 = Cities.pathTo(g, cap, 'jarlsHall');
ok(/où vivent des Barbares/.test(p2.impossible || ''), 'la raison est dite : ' + p2.impossible);
// une seconde cité naine : un seul ouvrage par empire
const spot = (() => { const w = g.world; for (let r = 4; r < 12; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const x = World.wx(w, cap.x + dx), y = cap.y + dy; if (World.inY(w, y) && !World.isWaterAt(w, cap.plane, x, y) && !Cities.at(g, cap.plane, x, y) && World.terr(w, cap.plane, x, y) !== T.MOUNTAIN) return [x, y]; } })();
const c2 = Cities.create(g, pl.id, 'dwarf', cap.plane, spot[0], spot[1], { pop: 4000 });
cap.prod = { type: 'building', id: 'motherForge' };
ok(!Cities.canBuild(g, c2, 'motherForge') && /en chantier à/.test(Cities.pathTo(g, c2, 'motherForge').impossible || ''), 'en chantier dans la capitale : pas dans la seconde cité (' + Cities.pathTo(g, c2, 'motherForge').impossible + ')');
cap.prod = { type: 'tradeGoods' };
ok(Cities.canBuild(g, c2, 'motherForge'), 'plus en chantier nulle part : la seconde cité peut');
// la cité prise garde son ouvrage, qui passe au vainqueur
cap.buildings.motherForge = true; Wonders.sync(g);
ok(Wonders.has(g, 0, 'dwarf') && !Cities.canBuild(g, c2, 'motherForge'), 'bâti : le sorcier l\'a, et pas deux');
let lost = 0; for (let i = 0; i < 200; i++) { const b = { motherForge: true, granary: true }; const fake = { buildings: b }; Cities.destroyBuildings(g, fake, 0.5, new RNG(i)); if (!b.motherForge) lost++; }
ok(lost === 0, 'jamais détruit à la prise d\'une cité');
delete cap.buildings.motherForge; Wonders.sync(g);

// ---- les effets ----
const econ = c => Cities.econ(g, c);
// Halle des Jarls et Forge-Mère : les troupes qui sortent de la cité
function produce(type) {
  cap.prod = { type: 'unit', id: type }; cap.progress = 99999; cap.queue = [];
  const before = new Set(Object.keys(g.units));
  for (const u of Units.at(g, cap.plane, cap.x, cap.y)) if (u.owner === pl.id) Units.remove(g, u);
  Turn.processCity(g, cap, pl);
  const id = Object.keys(g.units).find(k => !before.has(k)); return id ? g.units[id] : null;
}
give('barbarian'); let u = produce('BarbarianSpearmen');
ok(u && u.xp >= 60, 'Halle des Jarls : lanciers barbares Vétérans (xp ' + (u && u.xp) + ')'); drop('barbarian');
u = produce('DwarfSwordsmen'); const w0 = u ? u.weapon : -1;
give('dwarf'); u = produce('DwarfSwordsmen');
ok(u && u.weapon >= 2 && w0 < 2, 'Forge-Mère : armes de mithril (' + w0 + ' → ' + (u && u.weapon) + ')'); drop('dwarf');
// Ruche-Mère
cap.race = 'klackon'; pl.taxIdx = 6; cap.pop = 14000; const un0 = econ(cap).unrest;
give('klackon'); const un1 = econ(cap).unrest;
ok(un0 > 0 && un1 === 0, 'Ruche-Mère : agitation ' + un0 + ' → ' + un1); drop('klackon'); pl.taxIdx = 2;
// Arbre-Mère
cap.race = 'highelf'; const pw0 = econ(cap).power; give('highelf'); const e1 = econ(cap);
ok(e1.power - pw0 === Math.round(e1.forests / 2) && e1.powerParts.wonder === Math.round(e1.forests / 2), 'Arbre-Mère : ' + e1.forests.toFixed(1) + ' forêts dans la zone, +' + e1.powerParts.wonder + ' mana'); drop('highelf');
// Halle des Moissons
cap.pop = 3000; cap.race = 'halfling'; const gd0 = econ(cap); give('halfling'); const gd1 = econ(cap);
ok(gd0.foodSurplus > 1 ? gd1.goldIncome - gd0.goldIncome === Math.floor(gd0.foodSurplus / 2) : gd1.goldIncome === gd0.goldIncome, 'Halle des Moissons : surplus ' + gd0.foodSurplus + ' nourriture → +' + (gd1.goldIncome - gd0.goldIncome) + ' or'); drop('halfling');
// Grande Chancellerie
cap.prod = { type: 'building', id: 'granary' }; cap.buildings.buildersHall = true; delete cap.buildings.granary; cap.progress = 10;
const bp0 = Cities.buyPrice(g, cap); give('highmen'); const bp1 = Cities.buyPrice(g, cap);
ok(bp1 === Math.ceil(bp0 * 0.75), 'Grande Chancellerie : achat ' + bp0 + ' → ' + bp1 + ' or'); drop('highmen');
// Trône de Crânes
for (let i = 0; i < 6; i++) Units.create(g, 'Paladin', pl.id, cap.plane, cap.x, cap.y);
pl.fame = 0; const up0 = Magic.goldUpkeepUnits(g, pl); give('orc'); const up1 = Magic.goldUpkeepUnits(g, pl);
ok(up1 === Math.ceil(up0 * 0.75), 'Trône de Crânes : entretien ' + up0 + ' → ' + up1 + ' or'); drop('orc');
// Cercle des Menhirs
const tc0 = Cities.unitCost(g, cap, 'WarTrolls'); give('troll'); const tc1 = Cities.unitCost(g, cap, 'WarTrolls');
ok(tc1 === Math.ceil(tc0 * 2 / 3), 'Cercle des Menhirs : trolls de guerre ' + tc0 + ' → ' + tc1); drop('troll');
// Aire des Ancêtres
const dra = Units.create(g, 'DraconianSpearmen', pl.id, cap.plane, cap.x, cap.y); const br0 = Units.stats(g, dra).breath;
give('draconian'); const br1 = Units.stats(g, dra).breath;
ok(br0 > 0 && br1 === br0 + 2, 'Aire des Ancêtres : souffle ' + br0 + ' → ' + br1); drop('draconian'); Units.remove(g, dra);
// Temple des Marées
const water = (() => { const w = g.world; for (let y = 2; y < w.h - 2; y++) for (let x = 0; x < w.w; x++) if (World.isWaterAt(w, 0, x, y) && World.neighbors(w, x, y).some(([a, b]) => World.isWaterAt(w, 0, a, b))) return [x, y]; })();
const lz = Units.create(g, 'LizardSpearmen', pl.id, 0, water[0], water[1]);
const nb = World.neighbors(g.world, water[0], water[1]).find(([a, b]) => World.isWaterAt(g.world, 0, a, b));
const sc0 = Move.stepCost(g, lz, Move.groupInfo(g, [lz]), 0, water[0], water[1], nb[0], nb[1]);
give('lizardman'); const sc1 = Move.stepCost(g, lz, Move.groupInfo(g, [lz]), 0, water[0], water[1], nb[0], nb[1]);
const mixed = Move.groupInfo(g, [lz, Units.create(g, 'DwarfSwordsmen', pl.id, 0, water[0], water[1])]);
ok(sc0 === 2 && sc1 === 1 && !mixed.tidal, 'Temple des Marées : case d\'eau ' + sc0 + ' → ' + sc1 + ' demi-points (pas pour une troupe mêlée)'); drop('lizardman');
// Grand Caravansérail : une route entre la capitale et la seconde cité
const path = Move.roadPath(g, [Units.create(g, 'DwarfSwordsmen', pl.id, cap.plane, cap.x, cap.y)], cap.plane, c2.x, c2.y) || [];
for (const p of path) World.set(g.world, cap.plane, 'road', p.x, p.y, 1); World.set(g.world, cap.plane, 'road', cap.x, cap.y, 1);
cap.pop = 12000; c2.pop = 9000; const tr0 = econ(cap).tradePct; give('nomad'); const tr1 = econ(cap).tradePct;
ok(tr1 > tr0, 'Grand Caravansérail : commerce ' + tr0 + ' % → ' + tr1 + ' %'); drop('nomad');

// ---- les batailles ----
const foe = g.players[1]; foe.alive = true; foe.aiExp = { no_flee: true };   // des assaillants qui se battent jusqu'au bout
const near = World.neighbors(g.world, cap.x, cap.y).find(([x, y]) => !World.isWaterAt(g.world, cap.plane, x, y) && !Cities.at(g, cap.plane, x, y));
async function siege(atkType, n, defType) {
  for (const u of Units.at(g, cap.plane, cap.x, cap.y)) Units.remove(g, u);
  for (const u of Units.at(g, cap.plane, near[0], near[1])) Units.remove(g, u);
  const A = Array.from({ length: n }, () => Units.create(g, atkType, foe.id, cap.plane, near[0], near[1]));
  const D = [defType, defType].map(t => Units.create(g, t, pl.id, cap.plane, cap.x, cap.y));
  for (const u of D) u.dmg = 5;   // déjà blessés
  Game.hooks.battle = null;
  const r = await Game.attack(g, A.map(u => u.id), cap.x, cap.y, { auto: true });
  return { r, A, D };
}
(async () => {
  // Labyrinthe : les assaillants arrivent affaiblis (on regarde leurs PV juste avant la bataille)
  give('beastmen'); cap.buildings.labyrinth = true; Wonders.sync(g);
  let hpAtStart = null; const B0 = Battle.prototype.constructor; const orig = CombatAI.autoResolve;
  CombatAI.autoResolve = function (bt) { hpAtStart = bt.units.filter(b => b.side === 0).map(b => [b.u.dmg, Units.stats(g, b.u).maxHp]); return orig.apply(this, arguments); };
  await siege('HighMenSpearmen', 2, 'Golem');
  ok(cap.owner === pl.id, 'la cité a tenu');
  CombatAI.autoResolve = orig;
  ok(hpAtStart && hpAtStart.every(([d, m]) => d === Math.floor(m / 4)), 'Labyrinthe : chaque assaillant entre avec un quart de PV en moins (' + JSON.stringify(hpAtStart) + ')');
  drop('beastmen'); delete cap.buildings.labyrinth; Wonders.sync(g);
  // Puits des Âmes et Fosse aux Crocs : le défenseur vainqueur (golems face à deux paladins)
  give('darkelf'); cap.buildings.fangPit = true; pl.lore.push('lore_gnoll'); Wonders.sync(g);
  const m0 = pl.mana; const { r, D } = await siege('HighMenSwordsmen', 2, 'Golem');
  const surv = D.filter(u => g.units[u.id]);
  ok(r.won === false && r.res.killed[0].length > 0 && pl.mana - m0 === r.res.killed[0].reduce((s, u) => s + Wonders.soulMana(u), 0), 'Puits des Âmes : défense gagnée, +' + (pl.mana - m0) + ' mana');
  ok(surv.length && surv.every(u => !u.dmg), 'Fosse aux Crocs : les vainqueurs, entrés blessés, repartent sans une égratignure');
})();
