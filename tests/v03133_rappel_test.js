// v0.31.33 : le Rappel du héros se lance aussi sur la carte (40 mana ; 20 en combat) : un héros ami revient à la forteresse ;
// une unité qui n'est pas un héros ne peut pas être visée.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, Spells, Magic, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 8, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 6 }, retorts: [], race: 'highmen' } });
const pl = g.players[0], fc = g.cities[pl.fortress];
const sp = DATA.spells.recall_hero;
ok(sp.overland && sp.combat && sp.cost === 40 && sp.combatCost === 20, 'sort de carte (40) et de combat (20)');
let far = null;
for (let d = 5; d < 12 && !far; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) { const x = E.World.wx(g.world, fc.x + dx), y = fc.y + dy; if (!far && E.World.inY(g.world, y) && !E.World.isWaterAt(g.world, fc.plane, x, y) && !E.Cities.at(g, fc.plane, x, y)) far = [x, y]; }
const hero = Units.create(g, 'HeroBrax', pl.id, fc.plane, far[0], far[1]); hero.hero = { name: 'Brax' };
const spear = Units.create(g, 'HighMenSpearmen', pl.id, fc.plane, far[0], far[1]);
ok(!Spells.validate(g, pl, 'recall_hero', { unit: spear.id }).ok, 'un lancier ne peut pas être visé');
{ const v = Spells.validate(g, pl, 'recall_hero', { unit: hero.id }); ok(v.ok, 'le héros peut être visé' + (v.ok ? '' : ' (' + v.why + ')')); }
const r = Spells.apply(g, pl, 'recall_hero', { unit: hero.id });
ok(r && r.ok !== false && hero.plane === fc.plane && Math.max(Math.abs(hero.x - fc.x), Math.abs(hero.y - fc.y)) <= 1, 'le héros revient à la forteresse (' + hero.x + ', ' + hero.y + ')');
ok(spear.x === far[0], 'le lancier reste où il était');
ok(!Spells.validate(g, pl, 'recall_hero', { unit: hero.id }).ok || hero.x !== fc.x || hero.y !== fc.y, 'déjà à la forteresse : refusé');
