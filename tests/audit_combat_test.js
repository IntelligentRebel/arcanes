// Audit des sorts et capacités (combat) : Prière et Grande Prière ne se cumulent pas ; un régénérant debout guérit
// après la bataille même dans le camp vaincu (seul le retour d'entre les morts exige la victoire).
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Cities, Battle, CombatSpells, RNG } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highelf' } });
const pl = g.players[0], f = g.cities[pl.fortress];
const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
const battle = (att, def) => {
  const A = att.map(t => Units.create(g, t, 0, f.plane, x, y)), D = def.map(t => Units.create(g, t, 1, f.plane, x, y));
  const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: f.plane, x, y, rng: new RNG(3) });
  return { A, D, bt, done: () => { for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u); } };
};

// 1. Prière + Grande Prière : la Grande Prière seule compte
{
  const { bt, done } = battle(['HighElfSpearmen'], ['OrcSpearmen']);
  const b = bt.alive(0)[0], s0 = bt.stats(b);
  bt.ench[0] = ['prayer']; const sp = bt.stats(b);
  bt.ench[0] = ['high_prayer']; const sh = bt.stats(b);
  bt.ench[0] = ['high_prayer', 'prayer']; const sb = bt.stats(b);
  ok(sp.toHit === s0.toHit + 10 && sp.res === s0.res + 1, 'Prière seule : +10 % pour toucher, +1 en résistance (' + s0.toHit + ' → ' + sp.toHit + ', ' + s0.res + ' → ' + sp.res + ')');
  ok(sh.toHit === s0.toHit + 10 && sh.res === s0.res + 3 && sh.toDefend === s0.toDefend + 10, 'Grande Prière seule : +10 %, +3 en résistance, +10 % de parade');
  ok(sb.toHit === sh.toHit && sb.res === sh.res && sb.toDefend === sh.toDefend && sb.melee === sh.melee && sb.def === sh.def,
    'Prière et Grande Prière ensemble : pas de cumul (toucher ' + sb.toHit + ' contre ' + sh.toHit + ', résistance ' + sb.res + ' contre ' + sh.res + ', parade ' + sb.toDefend + ' contre ' + sh.toDefend + ')');
  bt.ench[0] = ['high_prayer'];
  ok(CombatSpells.alreadyActive(bt, 0, 'prayer'), 'sous la Grande Prière, la Prière n\'est plus proposée (elle n\'ajouterait rien)');
  bt.ench[0] = ['prayer'];
  ok(!CombatSpells.alreadyActive(bt, 0, 'high_prayer'), 'sous la Prière, la Grande Prière reste proposée');
  done();
}

// 2. Régénération : le survivant d'un camp vaincu guérit aussi ; le mort ne revient qu'avec la victoire
{
  const { A, bt, done } = battle(['TrollSpearmen', 'TrollSpearmen'], ['OrcSpearmen']);
  const [live, dead] = bt.alive(0);
  live.u.dmg = 6;
  dead.u.dmg = Units.stats(g, dead.u).maxHp; bt.checkDeath(dead);
  bt.finish(1);   // le défenseur l'emporte
  const r = bt.results();
  ok(live.u.dmg === 0 && r.survivors[0].includes(live.u), 'troll encore debout dans le camp vaincu : guéri après la bataille (dégâts ' + live.u.dmg + ')');
  ok(r.killed[0].includes(dead.u), 'troll tombé dans le camp vaincu : il ne revient pas');
  done();
}
{
  const { bt, done } = battle(['TrollSpearmen'], ['OrcSpearmen']);
  const b = bt.alive(0)[0]; b.u.dmg = 5; b.irrDmg = 2;
  bt.finish(1); bt.results();
  ok(b.u.dmg === 2, 'les dégâts irréversibles restent (dégâts ' + b.u.dmg + ', 2 attendus)');
  done();
}
// 3. Vortex magique (sort du chaos) : il ne mord pas une unité sous Sainte droiture
{
  const hit = righteous => {
    const { D, bt, done } = battle(['HighElfSpearmen'], ['OrcSpearmen']);
    if (righteous) D[0].ench.push('righteousness');
    const b = bt.alive(1)[0], v = { c: b.c > 0 ? b.c - 1 : b.c + 1, r: b.r, side: 0, id: 0 }, h0 = bt.hp(b);
    const rng = bt.rng, p = E.DATA.spells.magic_vortex.params, mv = p.movesPerTurn;
    bt.rng = { chance: () => true, int: () => 1, rolls: () => 0, pick: a => a[0], next: () => 0 }; p.movesPerTurn = 1;   // un pas, droit sur l'ennemi
    try { bt.vortexMove(v); } finally { bt.rng = rng; p.movesPerTurn = mv; }
    const lost = h0 - bt.hp(b); done(); return lost;
  };
  ok(hit(false) === 5, 'Vortex magique : 5 dégâts à l\'unité traversée');
  ok(hit(true) === 0, 'Vortex magique sur une unité sous Sainte droiture : aucun dégât (' + hit(true) + ')');
}
{
  const { bt, done } = battle(['TrollSpearmen'], ['OrcSpearmen']);
  const b = bt.alive(0)[0]; b.u.dmg = Units.stats(g, b.u).maxHp; bt.checkDeath(b);
  bt.finish(0); const r = bt.results();
  ok(r.survivors[0].includes(b.u) && b.u.dmg === 0, 'troll tombé dans le camp vainqueur : il se relève guéri');
  done();
}
