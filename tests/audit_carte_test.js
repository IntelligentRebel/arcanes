// Audit des sorts (carte) : Pluie de météores et Faille du chaos sont des attaques du chaos ; les protections contre ce royaume
// (Bénédiction, Résistance aux éléments, Armure élémentaire) y comptent, comme pour les Tempêtes de feu et de glace.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Cities, Turn, Spells } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
const me = g.players[0], foe = g.players[1], f = g.cities[me.fortress];

// le défenseur sous Armure élémentaire (+10 en défense contre la nature et le chaos)
const u0 = Units.create(g, 'HighMenSpearmen', 0, f.plane, f.x, f.y), u1 = Units.create(g, 'HighMenSpearmen', 0, f.plane, f.x, f.y);
u1.ench.push('elemental_armor');
ok(typeof Spells.defVs === 'function' && Spells.defVs(g, u1, 'chaos') ===Spells.defVs(g, u0, 'chaos') + 10 && Spells.defVs(g, u1, 'death') === Spells.defVs(g, u0, 'death'), 'défense contre le chaos : +10 sous Armure élémentaire, rien contre la mort');
Units.remove(g, u0); Units.remove(g, u1);

// 1. Pluie de météores (rival) sur deux lanciers hors des cités, l'un sous Armure élémentaire
{
  foe.globals.push('meteor_storms');
  let far = null;
  for (let yy = 3; yy < g.world.h - 3 && !far; yy++) for (let xx = 0; xx < g.world.w && !far; xx++) if (!World.isWaterAt(g.world, 0, xx, yy) && !Cities.at(g, 0, xx, yy) && World.dist(g.world, xx, yy, f.x, f.y) > 8) far = [xx, yy];
  let dn = 0, da = 0;
  for (let i = 0; i < 80; i++) {
    const a = Units.create(g, 'HighMenSpearmen', 0, 0, far[0], far[1]), b = Units.create(g, 'HighMenSpearmen', 0, 0, far[0], far[1]);
    b.ench.push('elemental_armor');
    const ma = Units.stats(g, a).maxHp, mb = Units.stats(g, b).maxHp;
    Turn.processGlobals(g);
    dn += g.units[a.id] ? a.dmg : ma; da += g.units[b.id] ? b.dmg : mb;
    if (g.units[a.id]) Units.remove(g, a); if (g.units[b.id]) Units.remove(g, b);
  }
  ok(dn > 40 && da * 4 < dn, 'Pluie de météores : ' + dn + ' PV perdus sans protection, ' + da + ' sous Armure élémentaire');
  foe.globals = foe.globals.filter(x => x !== 'meteor_storms');
}

// 2. Faille du chaos (rival) sur une cité : la garnison sous Armure élémentaire souffre beaucoup moins
{
  const c = Cities.ofPlayer(g, 1)[0];
  c.ench.push({ spell: 'chaos_rift', owner: 1 });
  const keep = Units.at(g, c.plane, c.x, c.y);
  for (const u of keep) Units.remove(g, u);   // la garnison d'origine ne détourne pas les éclairs
  let dn = 0, da = 0;
  for (let i = 0; i < 150; i++) {
    const a = Units.create(g, 'HighMenSpearmen', 1, c.plane, c.x, c.y), b = Units.create(g, 'HighMenSpearmen', 1, c.plane, c.x, c.y);
    b.ench.push('elemental_armor');
    const ma = Units.stats(g, a).maxHp, mb = Units.stats(g, b).maxHp;
    Turn.cityEffects(g, c, { nightshade: 0 });
    dn += g.units[a.id] ? a.dmg : ma; da += g.units[b.id] ? b.dmg : mb;
    if (g.units[a.id]) Units.remove(g, a); if (g.units[b.id]) Units.remove(g, b);
  }
  ok(dn > 100 && da * 1.5 < dn, 'Faille du chaos : ' + dn + ' PV perdus sans protection, ' + da + ' sous Armure élémentaire');
}

// 3. Tempête de feu : la règle n'a pas changé (la protection comptait déjà)
{
  let far = null;
  for (let yy = 3; yy < g.world.h - 3 && !far; yy++) for (let xx = 0; xx < g.world.w && !far; xx++) if (!World.isWaterAt(g.world, 0, xx, yy) && !Cities.at(g, 0, xx, yy) && World.dist(g.world, xx, yy, f.x, f.y) > 8 && !Units.at(g, 0, xx, yy).length) far = [xx, yy];
  let dn = 0, da = 0;
  for (let i = 0; i < 40; i++) {
    const a = Units.create(g, 'HighMenSpearmen', 0, 0, far[0], far[1]), b = Units.create(g, 'HighMenSpearmen', 0, 0, far[0], far[1]);
    b.ench.push('elemental_armor');
    const ma = Units.stats(g, a).maxHp, mb = Units.stats(g, b).maxHp;
    E.OVERLAND_HANDLERS.fire_storm(g, foe, { plane: 0, x: far[0], y: far[1] });
    dn += g.units[a.id] ? a.dmg : ma; da += g.units[b.id] ? b.dmg : mb;
    if (g.units[a.id]) Units.remove(g, a); if (g.units[b.id]) Units.remove(g, b);
  }
  ok(dn > 40 && da * 4 < dn, 'Tempête de feu : ' + dn + ' PV perdus sans protection, ' + da + ' sous Armure élémentaire');
}
