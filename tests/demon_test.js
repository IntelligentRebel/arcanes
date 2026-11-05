// v0.30.0 : le Démon légendaire du pacte résiste au Bannissement, à la Confusion et au Grand Renvoi
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, Units, World, Cities, Battle, RNG, CombatSpells, Spells, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 9, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 11 }, retorts: [], race: 'highmen' } });
const f = g.cities[g.players[0].fortress];
const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
ok(!!DATA.units.RiteDemon, 'le Démon légendaire existe');
const d = Units.create(g, 'RiteDemon', 1, f.plane, x, y); d.riteDemon = true;
const lord = Units.create(g, 'DemonLord', 1, f.plane, x, y);
const a = Units.create(g, 'HighMenSpearmen', 0, f.plane, x, y);
const bt = new Battle(g, { attackers: [a], defenders: [d, lord], attackerPid: 0, defenderPid: 1, plane: f.plane, x, y, rng: new RNG(1) });
const bd = bt.alive(1).find(b => b.u.riteDemon), bl = bt.alive(1).find(b => !b.u.riteDemon);
for (const id of ['banish', 'confusion']) ok(!CombatSpells.canAffect(bt, bd, id) && CombatSpells.canAffect(bt, bl, id), id + ' : le Démon légendaire n\'est pas une cible, le Seigneur démon l\'est');
const pl = g.players[0];
for (let i = 0; i < 20; i++) { const u = Units.create(g, 'RiteDemon', 1, f.plane, x, y); u.riteDemon = true; Units.create(g, 'DemonLord', 1, f.plane, x, y); }
const count = () => [Object.values(g.units).filter(u => u.riteDemon).length, Object.values(g.units).filter(u => u.type === 'DemonLord').length];
const [d0, l0] = count();
pl.known.push('great_unsummoning'); pl.mana = 99999; pl.skillLeft = 99999;
const r = Spells.apply(g, pl, 'great_unsummoning', null);
const [d1, l1] = count();
ok(d1 === d0 && l1 < l0, 'Grand Renvoi : Démons légendaires ' + d0 + ' → ' + d1 + ', Seigneurs démons ' + l0 + ' → ' + l1 + ' (' + JSON.stringify(r && r.msg) + ')');
