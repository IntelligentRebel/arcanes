// Audit : textes affichés au joueur contre ce que fait le code (sorts, ouvrages, bâtiments, héros, capacités).
const { loadEngine } = require('./load');
const fs = require('fs'), path = require('path'), vm = require('vm');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Cities, Battle, RNG, DATA, Players, Wonders, COMBAT_SPELL_HANDLERS } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'halfling' } });
const pl = g.players[0], cap = g.cities[pl.fortress];

// 1. détail de la cité : les sorts y portent leur nom
{
  cap.ench.push({ spell: 'stream_of_life', owner: 0 }, { spell: 'dark_rituals', owner: 0 }, { spell: 'inspirations', owner: 0 });
  const e = Cities.econ(g, cap), labels = (e.growthWhy || []).map(x => x[0]).concat((e.prodParts || []).map(x => x[0]));
  for (const id of ['stream_of_life', 'dark_rituals', 'inspirations']) ok(labels.includes(DATA.spells[id].name), 'détail de la cité : « ' + DATA.spells[id].name + ' » (' + labels.join(', ') + ')');
  cap.ench = cap.ench.filter(x => !['stream_of_life', 'dark_rituals', 'inspirations'].includes(x.spell));
  cap.ench.push({ spell: 'pestilence', owner: 1 });
  ok(Cities.econ(g, cap).growthWhy.some(x => x[0] === DATA.spells.pestilence.name), 'détail de la croissance : « ' + DATA.spells.pestilence.name + ' »');
  cap.ench = cap.ench.filter(x => x.spell !== 'pestilence');
}

// 2. Halle des Moissons : le surplus se vend déjà sans elle ; l'ouvrage en ajoute autant, cité par cité
{
  cap.autoFarmers = false; cap.farmers = Cities.citizens(cap);
  const e0 = Cities.econ(g, cap), gp0 = Players.goldPerTurn(g, pl);
  ok(e0.foodSurplus > 1 && Math.floor(Math.max(0, gp0.food) / 2) > 0, 'sans l\'ouvrage, le surplus de nourriture se vend déjà (surplus ' + e0.foodSurplus + ', vente ' + Math.floor(Math.max(0, gp0.food) / 2) + ' or)');
  cap.buildings.harvestHall = true; Wonders.sync(g);
  const e1 = Cities.econ(g, cap);
  ok(e1.goldIncome - e0.goldIncome === Math.floor(e0.foodSurplus / 2), 'avec la Halle des Moissons : +' + (e1.goldIncome - e0.goldIncome) + ' or de plus dans la cité (surplus ' + e0.foodSurplus + ')');
  ok(/de plus/.test(DATA.buildings.harvestHall.desc) && !/se vendent :/.test(DATA.buildings.harvestHall.desc), 'son texte dit un or de plus, pas une vente qui n\'existerait pas sans elle : « ' + DATA.buildings.harvestHall.desc + ' »');
  delete cap.buildings.harvestHall; Wonders.sync(g); cap.autoFarmers = true;
}

// 3. Grande Chancellerie : le rabais vaut aussi pour les troupes
{
  cap.prod = { type: 'unit', id: 'HalflingSpearmen' }; cap.progress = 0;
  const p0 = Cities.buyPrice(g, cap, Cities.econ(g, cap));
  cap.buildings.chancery = true; Wonders.sync(g);
  const p1 = Cities.buyPrice(g, cap, Cities.econ(g, cap));
  ok(p1 === Math.ceil(p0 * 0.75), 'Grande Chancellerie : une troupe s\'achète un quart moins cher (' + p0 + ' → ' + p1 + ')');
  ok(/troupe/.test(DATA.buildings.chancery.desc), 'son texte le dit : « ' + DATA.buildings.chancery.desc + ' »');
  delete cap.buildings.chancery; Wonders.sync(g);
}

// 4. Disruption : elle abat aussi les tours de défense et les portes
{
  const c = cap; c.buildings.cityWalls = true; c.buildings.defenseTowers = true;
  const att = [Units.create(g, 'HalflingSpearmen', 1, c.plane, c.x, c.y)], def = [Units.create(g, 'HalflingSpearmen', 0, c.plane, c.x, c.y)];
  const bt = new Battle(g, { attackers: att, defenders: def, attackerPid: 1, defenderPid: 0, plane: c.plane, x: c.x, y: c.y, city: c, rng: new RNG(2) });
  const tower = bt.towers.find(t => t.kind === 'stone'), gate = bt.towers.find(t => t.kind === 'gate');
  COMBAT_SPELL_HANDLERS.disrupt(bt, 0, [tower.c, tower.r]); COMBAT_SPELL_HANDLERS.disrupt(bt, 0, [gate.c, gate.r]);
  ok(tower.dead && !bt.standing(gate), 'Disruption abat une tour de défense et une porte');
  ok(/tour/.test(DATA.spells.disrupt.desc) && /porte/.test(DATA.spells.disrupt.desc), 'son texte le dit : « ' + DATA.spells.disrupt.desc + ' »');
  for (const u of att.concat(def)) if (g.units[u.id]) Units.remove(g, u);
  delete c.buildings.defenseTowers; delete c.buildings.cityWalls;
}

// 5. héros : le royaume annoncé est celui de leurs sorts
{
  const m = DATA.units.HeroMorgana, s = DATA.units.HeroSerena;
  ok(m.spells.every(id => DATA.spells[id].realm === 'death') && /mort/.test(DATA.heroes.HeroMorgana.desc) && /mort/.test(m.desc), 'Nyssandre (sorts de mort) : « ' + DATA.heroes.HeroMorgana.desc + ' »');
  ok(s.spells.join() === 'healing' && DATA.heroes.HeroSerena.desc.includes(DATA.spells.healing.name) && s.desc.includes(DATA.spells.healing.name), 'Alwyne (seul sort : Guérison) : « ' + DATA.heroes.HeroSerena.desc + ' »');
}

// 6. Guilde des mages : elle coûte de la puissance (pas du mana pris directement)
{
  const b = DATA.buildings.wizardsGuild;
  ok(b.effects.power === -3 && /puissance/.test(b.desc), 'Guilde des mages : effet puissance ' + b.effects.power + ', texte « ' + b.desc + ' »');
}

// 7. Vol de vie : ses victimes se relèvent en morts-vivants (comme le dit maintenant la capacité)
{
  const [x, y] = World.neighbors(g.world, cap.x, cap.y).find(([x, y]) => !World.isWaterAt(g.world, cap.plane, x, y) && !Cities.at(g, cap.plane, x, y));
  const A = [Units.create(g, 'Wraith', 0, cap.plane, x, y)], D = [Units.create(g, 'OrcSpearmen', 1, cap.plane, x, y)];
  const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: cap.plane, x, y, rng: new RNG(4) });
  const a = bt.alive(0)[0], d = bt.alive(1)[0];
  for (let i = 0; i < 30 && !d.dead; i++) { for (const fn of bt.touch(a, d, 0)) fn(); bt.checkDeath(d); }
  bt.finish(0); const r = bt.results();
  const desc = vm.runInContext('ABILITY_DESC', E).lifeSteal;
  ok(r.undead.includes('OrcSpearmen') && /mort-vivant/.test(desc), 'vol de vie : la victime se relève (' + r.undead.join(',') + ') et la capacité le dit');
  for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u);
}

// 8. noms des dons dans les infobulles de l'écran Magie
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'magicui.js'), 'utf8');
  ok(!/Concentration du mana|Canaliseur/.test(src) && DATA.retorts.manaFocusing && DATA.retorts.channeler, 'écran Magie : les dons sous leur nom (' + DATA.retorts.manaFocusing.name + ', ' + DATA.retorts.channeler.name + ')');
}
