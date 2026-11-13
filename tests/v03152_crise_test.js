// v0.31.52 : le monstre d'une crise est plus fort que le meilleur champion de sa proie (Grumnak, super-héros orque de la partie
// d'Olivier, tuait le Prophète seul) ; une armée en vient à bout. Le palier de la crise se mesure aussi aux armées : un meneur
// cinq fois plus fort par les armes tire l'Archimage, pas le Prophète.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, Finale, AI, DATA, Heroes, Crisis } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 21, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hardcore', crisis: 'off', finale: 'random', human: { name: 'X', portrait: 9, books: { nature: 10 }, retorts: [], race: 'highelf' } });
const me = g.players.find(p => p.human), cap = Object.values(g.cities).find(c => c.owner === me.id);
// Grumnak : 719 XP, le Hachoir du Roi-Bête (+7 attaque, +1 défense, +30 % précision, Frappe éclair, Régénération), des Bottes (+3 défense, +2 mouvement)
const grum = Heroes.spawn(g, me, DATA.heroes.HeroBahgtru, cap.plane, cap.x, cap.y, 719);
grum.items = [{ kind: 'axe', slot: 'melee', name: 'Hachoir du Roi-Bête', melee: 7, def: 1, toHit: 3, powers: ['lightning', 'regeneration'], icon: 'item:axe' }, null, { kind: 'boots', slot: 'jewelry', name: 'Bottes de l\'Aube', def: 3, move: 2, powers: [], icon: 'item:boots' }];
const s = Units.stats(g, grum);
console.log('Grumnak : attaque ' + s.melee + ', défense ' + s.def + ', résistance ' + s.res + ', vie ' + s.hp + ', précision ' + s.toHit + ' %');
// le Prophète se lève contre lui
const f = g.finale; Object.assign(f, { state: 'active', kind: 'prophet', target: me.id, start: g.turn, waves: 0, souls: 0, next: g.turn + 4, force: Math.round(Crisis.score(g, me)) });
ok(Finale.K.prophet.begin(g, f, me), 'le Prophète se lève');
const boss = g.units[f.boss], bs = Units.stats(g, boss);
console.log('Prophète : cran ' + (boss.might || 0) + ', attaque ' + bs.melee + ' / tir ' + bs.ranged + ', défense ' + bs.def + ', vie ' + bs.hp + ', précision ' + bs.toHit + ' %');
const N = 40, saved = Finale.MIGHT_SIMS; Finale.MIGHT_SIMS = N;
const solo = Finale.duel(g, grum, boss);
ok(solo <= 0.25, 'Grumnak seul contre le Prophète : ' + Math.round(solo * 100) + ' % de victoires');
// sans le cran : ce qui se passait dans la partie
const m0 = boss.might; boss.might = undefined; const before = Finale.duel(g, grum, boss); boss.might = m0;
ok(before >= 0.8, 'sans ce renfort, Grumnak gagnait ' + Math.round(before * 100) + ' % de ses duels');
// une armée en vient à bout : Grumnak, trois autres héros aguerris et cinq unités d'élite
const army = [grum];
for (const t of ['HeroGunther', 'HeroBrax', 'HeroMarcus']) if (DATA.heroes[t]) army.push(Heroes.spawn(g, me, DATA.heroes[t], cap.plane, cap.x, cap.y, 719));
for (let i = 0; i < 5; i++) { const u = Units.create(g, 'ElvenLord', me.id, cap.plane, cap.x, cap.y); u.xp = 120; army.push(u); }
const vsArmy = AI.simulate(g, army.map(u => Object.assign({}, u, { dmg: 0 })), [Object.assign({}, boss, { dmg: 0 })], { plane: boss.plane, x: boss.x, y: boss.y }, N);
ok(vsArmy >= 0.6, 'une armée de 9 contre le Prophète seul : ' + Math.round(vsArmy * 100) + ' % de victoires');
const stack = Object.values(g.units).filter(u => u.plane === boss.plane && u.x === boss.x && u.y === boss.y).map(u => Object.assign({}, u, { dmg: 0 }));
const vsStack = AI.simulate(g, army.map(u => Object.assign({}, u, { dmg: 0 })), stack, { plane: boss.plane, x: boss.x, y: boss.y }, N);
ok(vsStack >= 0.4, 'la même armée contre le Prophète et sa suite (' + stack.length + ' unités) : ' + Math.round(vsStack * 100) + ' % de victoires');
Finale.MIGHT_SIMS = saved;
// il ne redescend jamais : sa proie perd son champion, il garde son cran
const keep = boss.might; delete g.units[grum.id]; Finale.matchBest(g, f);
ok(boss.might === keep, 'le champion perdu, le Prophète garde son cran (' + boss.might + ')');

// le palier : un meneur 1,6 fois plus riche, mais cinq fois plus fort par les armes
const g2 = Game.newGame({ seed: 22, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hardcore', crisis: 'off', finale: 'random', human: { name: 'X', portrait: 9, books: { nature: 10 }, retorts: [], race: 'highelf' } });
const me2 = g2.players.find(p => p.human), cap2 = Object.values(g2.cities).find(c => c.owner === me2.id);
const score0 = Crisis.score; Crisis.score = (game, p) => p.human ? 160 : 100;
const tierFor = big => {
  const gg = big ? g2 : Game.newGame({ seed: 23, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hardcore', crisis: 'off', finale: 'random', human: { name: 'X', portrait: 9, books: { nature: 10 }, retorts: [], race: 'highelf' } });
  gg.turn = 260; for (let i = 0; i < 6 && gg.finale.state === 'watch'; i++) { Finale.watch(gg); gg.turn++; }
  return gg.finale;
};
for (let i = 0; i < 40; i++) Units.create(g2, 'GreatWyrm', me2.id, cap2.plane, cap2.x, cap2.y);
const fa = tierFor(true), fb = tierFor(false);
Crisis.score = score0;
ok(fa.tier === 3 && fa.kind === 'archmage', 'avance écrasante par les armes : palier ' + fa.tier + ', ' + fa.kind + ' (avance éco ' + fa.leadAt + ', par les forces ' + fa.leadForce + ')');
ok(fb.tier === 1, 'même avance éco sans armée écrasante : palier ' + fb.tier + ' (par les forces ' + fb.leadForce + ')');
