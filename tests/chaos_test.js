// v0.30.0 : audit du Chaos (Droiture, Déformation, Désintégration, Appel du chaos, Mur de feu, Disruption)
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, Units, World, Cities, Battle, RNG, DATA, CombatSpells, Turn, Spells } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 7, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { chaos: 11 }, retorts: [], race: 'highelf' } });
const pl = g.players[0]; pl.mana = 5000; pl.skill = 500;
const f = g.cities[pl.fortress];
const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
const mk = (att, def, opts) => { const A = att.map(t => Units.create(g, t, 0, f.plane, x, y)), D = def.map(t => Units.create(g, t, 1, f.plane, x, y)); return new Battle(g, Object.assign({ attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: f.plane, x, y, rng: new RNG(3) }, opts || {})); };
// Désintégration : un Grand Drake (résistance >= 10) n'est plus une cible
let bt = mk(['HighElfSpearmen'], ['GreatDrake', 'OrcSpearmen']);
const drake = bt.alive(1).find(b => b.u.type === 'GreatDrake');
ok(!CombatSpells.canAffect(bt, drake, 'disintegrate'), 'Désintégration : le Grand Drake (résistance ' + bt.resFor(drake, 'chaos') + ') n\'est plus proposé');
// Déformation : jamais deux fois la même mutation ; écartée quand l'unité a les trois
const sp = bt.alive(1).find(b => b.u.type === 'OrcSpearmen');
sp.curses = ['warp_creature_melee', 'warp_creature_def', 'warp_creature_res'];
ok(!CombatSpells.canAffect(bt, sp, 'warp_creature'), 'Déformation : unité déjà déformée trois fois écartée');
// Distorsion du réel posée par l'autre camp : déjà active pour moi
bt.ench[1].push('warp_reality');
ok(CombatSpells.alreadyActive(bt, 0, 'warp_reality'), 'Distorsion du réel posée en face : « déjà actif »');
// Droiture contre la Faille du chaos
const c2 = Object.values(g.cities).find(c => c.owner === 1);
const gar = Units.at(g, c2.plane, c2.x, c2.y);
for (const u of gar) u.ench.push('righteousness');
c2.ench.push({ spell: 'chaos_rift', owner: 0 });
const before = gar.map(u => u.dmg).join();
for (let t = 0; t < 5; t++) Turn.cityEffects(g, c2, g.players[1], Cities.econ ? Cities.econ(g, c2) : {});
ok(gar.every(u => g.units[u.id]) && gar.map(u => u.dmg).join() === before, 'Faille du chaos : la garnison sous Droiture est épargnée (' + gar.length + ' unités)');
// Mur de feu : défenseur de sa cité seulement
const own = Units.create(g, 'HighElfSpearmen', 0, f.plane, f.x, f.y);
const foe = Units.create(g, 'OrcSpearmen', 1, f.plane, x, y);
bt = new Battle(g, { attackers: [foe], defenders: Units.at(g, f.plane, f.x, f.y), attackerPid: 1, defenderPid: 0, plane: f.plane, x: f.x, y: f.y, city: f, rng: new RNG(4) });
const hadWall = bt.wallOfFire;
ok(!hadWall && CombatSpells.uselessWhy(bt, 1, 'wall_of_fire') === null, 'Mur de feu : lançable en défense de sa cité');
ok(!!CombatSpells.uselessWhy(bt, 0, 'wall_of_fire'), 'Mur de feu : refusé à l\'assaillant');
CombatSpells.cast(bt, 1, 'wall_of_fire', null, null, 0);
ok(bt.wallOfFire === true, 'Mur de feu : posé en combat (' + bt.log.slice(-1)[0] + ')');
ok(!!CombatSpells.uselessWhy(bt, 1, 'wall_of_fire'), 'Mur de feu : pas deux fois');
// Appel du chaos : une ligne par unité ennemie
bt = mk(Array(1).fill('HighElfSpearmen'), Array(6).fill('OrcSpearmen'));
bt.skillLeft[0] = 999; pl.mana = 5000; const n0 = bt.log.length; CombatSpells.cast(bt, 0, 'call_chaos', null, null, 0);
const lines = bt.log.slice(n0);
ok(lines.length >= 6, 'Appel du chaos : ' + lines.length + ' lignes de journal : ' + lines.slice(0, 8).join(' | '));
