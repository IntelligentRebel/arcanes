// v0.31.13 : Marche sur l'eau majeure et Vol majeur : toutes les unités amies de la case que la version mineure enchanterait,
// au coût par unité ; l'entretien est celui de la mineure sur chacune. L'IA ne les a pas dans ses grimoires.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, World, Cities, Spells, Magic, Move, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
const pl = g.players[0], f = g.cities[pl.fortress];
const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
for (const u of Units.at(g, f.plane, x, y)) Units.remove(g, u);
const us = ['HighMenSpearmen', 'HighMenSpearmen', 'HighMenSwordsmen', 'Pegasai'].map(t => Units.create(g, t, 0, f.plane, x, y));
pl.known.push('water_walking_mass', 'flight_mass'); pl.mana = 9999; pl.skillLeft = 9999;
const T = { plane: f.plane, x, y };
ok(Spells.overlandTarget('water_walking_mass') === 'friendlyStack' && Spells.implementedOverland('water_walking_mass'), 'sort de pile, lançable sur la carte');
const n = Spells.stackUnits(g, pl, 'water_walking_mass', T).length, c1 = Magic.spellCost(g, pl, 'water_walking_mass', false);
ok(n === 3 && Spells.castCost(g, pl, 'water_walking_mass', T) === 3 * c1, 'trois unités à enchanter (le pégase vole déjà) : ' + Spells.castCost(g, pl, 'water_walking_mass', T) + ' mana (' + c1 + ' par unité)');
const up0 = Magic.manaUpkeep(g, pl), m0 = pl.mana;
const r = Spells.cast(g, pl, 'water_walking_mass', T);
ok(us.slice(0, 3).every(u => u.ench.includes('water_walking')) && !us[3].ench.includes('water_walking') && m0 - pl.mana === 3 * c1, (r.msg || r.why) + ' ; ' + (m0 - pl.mana) + ' mana dépensés');
ok(Magic.manaUpkeep(g, pl) - up0 === 3 * DATA.spells.water_walking.upkeep, 'entretien : ' + (Magic.manaUpkeep(g, pl) - up0) + ' (1 par unité)');
ok(Move.groupInfo(g, us).swimAll, 'la pile entière peut aller sur l\'eau');
ok(!Spells.validate(g, pl, 'water_walking_mass', T).ok, 'relancé : rien à enchanter (' + Spells.validate(g, pl, 'water_walking_mass', T).why + ')');
const c2 = Spells.castCost(g, pl, 'flight_mass', T); Spells.cast(g, pl, 'flight_mass', T);
ok(us.slice(0, 3).every(u => Units.stats(g, u).flying), 'Vol majeur : les trois volent (' + c2 + ' mana)');
// l'IA : jamais dans ses grimoires
const ais = g.players.filter(p => p && !p.human && p.researchPool);
ok(ais.every(p => !p.researchPool.concat(p.known).some(id => DATA.spells[id] && DATA.spells[id].kind === 'stackEnchant')), 'aucune IA ne les a dans son grimoire');
ok(DATA.spells.water_walking.name === 'Marche sur l\'eau mineure' && DATA.spells.flight.name === 'Vol mineur', 'les versions d\'une unité : « mineure »');
