// v0.31.10 : Sainte droiture contre le Démon légendaire : tir magique (chaos), effroi et vol de vie sans prise ; la mêlée porte toujours.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, World, Cities, Battle, RNG } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highelf' } });
const f = g.cities[g.players[0].fortress];
const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
let melee = 0, steal = 0, shot = 0, shotNo = 0, fear = 0, meleeNo = 0, stealNo = 0;
for (let i = 0; i < 200; i++) {
  for (const right of [true, false]) {
    const P = Units.create(g, 'Pegasai', 0, f.plane, x, y), D = Units.create(g, 'RiteDemon', 1, f.plane, x, y);
    if (right) P.ench.push('righteousness');
    const bt = new Battle(g, { attackers: [D], defenders: [P], attackerPid: 1, defenderPid: 0, plane: f.plane, x, y, rng: new RNG(700 + i) });
    const d = bt.alive(0)[0], p = bt.alive(1)[0];
    d.c = p.c; d.r = p.r + 1; d.moves = 6;
    const hp0 = bt.hp(p);
    const out = bt.touch(d, p, 0); let t = 0; for (const fn of out) t += fn() || 0;
    if (right) { steal += t; fear += bt.fearOf(p); } else stealNo += t;
    const before = bt.hp(p); bt.melee(d, p); const lost = before - Math.max(0, bt.hp(p));
    if (right) melee += lost; else meleeNo += lost;
    { const P2 = Units.create(g, 'Pegasai', 0, f.plane, x, y); if (right) P2.ench.push('righteousness'); const bt2 = new Battle(g, { attackers: [Units.create(g, 'RiteDemon', 1, f.plane, x, y)], defenders: [P2], attackerPid: 1, defenderPid: 0, plane: f.plane, x, y, rng: new RNG(900 + i) });
      const a2 = bt2.alive(0)[0], t2 = bt2.alive(1)[0]; const h = bt2.hp(t2); bt2.applyRolls(t2, [bt2.rng.rolls(20, 60)], 'magic', 'chaos', {}, a2); if (right) shot += h - bt2.hp(t2); else shotNo += h - bt2.hp(t2); for (const b of bt2.units) Units.remove(g, b.u); }
    for (const b of bt.units) if (g.units[b.u.id]) Units.remove(g, b.u);
  }
}
ok(steal === 0 && stealNo > 0, 'vol de vie : 0 avec Sainte droiture, ' + stealNo + ' sans (200 essais)');
ok(fear === 0, 'effroi sans prise');
ok(shot * 10 < shotNo, 'tir magique de chaos du démon : ' + shot + ' points en 200 tirs (défense 50, comme dans Master of Magic), contre ' + shotNo + ' sans');
ok(melee > 0, 'la mêlée porte toujours : ' + melee + ' points perdus en 200 coups (sans la Droiture : ' + meleeNo + ')');
