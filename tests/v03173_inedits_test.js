// v0.31.73 : sorts inédits. Réveil du charnier, Ennemi juré, Le Glas, Démence contagieuse, Trêve de Dieu, Grande Inversion
// (Livre de légende), Bête déchaînée, Dette de sang, Nœud-piège : leurs règles, et l'IA qui s'en sert.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Cities, Battle, RNG, CombatSpells, CombatAI, Spells, Novel, Neutrals, Book, AI, Turn, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const ids = ['knell', 'contagious_madness', 'sworn_enemy', 'charnel_rising', 'truce_of_god', 'unleashed_beast', 'blood_debt', 'node_trap', 'great_inversion'];
ok(ids.every(id => DATA.spells[id] && DATA.spells[id].novel), 'les neuf sorts existent, marqués inédits');
ok(DATA.spells.node_trap.rarity === 'rare' && DATA.spells.node_trap.cost >= 200 && DATA.spells.truce_of_god.cost >= 400 && DATA.spells.knell.combatCost >= 50, 'Nœud-piège rare et cher ; Trêve de Dieu et Glas chers');
ok(DATA.spells.great_inversion.book && E.Book && Book.knows, 'la Grande Inversion est un sort du Livre de légende');

const newGame = (seed, books) => {
  const g = Game.newGame({ seed, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: books || { death: 4, chaos: 4, sorcery: 3 }, retorts: [], race: 'highmen' } });
  const me = g.players[0]; me.human = true; me.mana = 100000;
  for (const o of g.players) for (const q of g.players) if (o !== q) { o.contact[q.id] = true; o.diplo[q.id] = 'war'; }
  return g;
};
const freeTile = (g, from, dmin) => {
  for (let d = dmin; d < 18; d++) for (let dx = -d; dx <= d; dx++) for (const dy of [-d, d]) {
    const x = World.wx(g.world, from.x + dx), y = from.y + dy;
    if (World.inY(g.world, y) && World.terr(g.world, from.plane, x, y) === E.T.GRASS && !Cities.at(g, from.plane, x, y) && !Units.at(g, from.plane, x, y).length && World.get(g.world, from.plane, 'site', x, y) < 0) return [x, y];
  }
  return null;
};

// ---------- combat : le Glas, la Démence contagieuse, l'Ennemi juré ----------
{
  const g = newGame(12), me = g.players[0], fc = g.cities[me.fortress], at = freeTile(g, fc, 3);
  const battle = (mine, theirs, o = {}) => {
    const A = mine.map(([t]) => Units.create(g, t, 0, 0, at[0], at[1])), D = theirs.map(([t]) => Units.create(g, t, 1, 0, at[0], at[1]));
    if (o.pre) o.pre(A, D);
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: at[0], y: at[1], rng: new RNG(o.seed || 5) });
    bt.props = {}; bt.hills = {}; bt.river = {}; bt.ford = {}; bt.bridge = {}; bt.mud = {};
    bt.alive(0).forEach((b, i) => { b.c = mine[i][1]; b.r = mine[i][2]; });
    bt.alive(1).forEach((b, i) => { b.c = theirs[i][1]; b.r = theirs[i][2]; });
    bt.side = 0; bt.castThisRound[0] = false; bt.skillLeft[0] = 100000; bt.resetMoves(0);
    return bt;
  };
  const cast = (bt, id, t) => { bt.castThisRound[0] = false; if (!me.known.includes(id)) me.known.push(id); return CombatSpells.cast(bt, 0, id, t, null, 0); };
  // le Glas : marqué, un seul à la fois, il sonne deux rounds plus tard sur ce qui est resté (amis compris)
  {
    const bt = battle([['HighMenSpearmen', 5, 4], ['HighMenSpearmen', 1, 1]], [['HighMenSpearmen', 5, 5], ['HighMenSpearmen', 9, 9]]);
    const [m1] = bt.alive(0), [e1, e2] = bt.alive(1);
    ok(cast(bt, 'knell', [5, 5]) && bt.knells[0] && bt.knells[0].tiles.length === 9, 'le Glas marque 3 × 3 cases');
    ok(!cast(bt, 'knell', [2, 2]) && CombatSpells.uselessWhy(bt, 0, 'knell'), 'un seul glas à la fois : ' + CombatSpells.uselessWhy(bt, 0, 'knell'));
    ok(bt.terrainNotes(5, 5, 0).some(n => /Glas/.test(n)), 'la case marquée le dit : ' + bt.terrainNotes(5, 5, 0).find(n => /Glas/.test(n)));
    const d0 = [m1.u.dmg, e1.u.dmg, e2.u.dmg];
    bt.round += 1; bt.tickZones(0);
    ok(m1.u.dmg === d0[0] && e1.u.dmg === d0[1], 'au round suivant, rien encore');
    bt.round += 1; bt.tickZones(0);
    ok((m1.dead || m1.u.dmg > d0[0]) && (e1.dead || e1.u.dmg > d0[1]) && e2.u.dmg === d0[2] && !bt.knells[0], 'deux rounds plus tard, il frappe amis et ennemis restés dessus, pas les autres : ' + bt.log.slice(-1)[0]);
  }
  // l'IA quitte un glas
  {
    const bt = battle([['HighMenSpearmen', 9, 9]], [['HighMenSpearmen', 5, 5]]);
    const [e1] = bt.alive(1);
    cast(bt, 'knell', [5, 5]);
    bt.side = 1; bt.resetMoves(1); CombatAI.act(bt, e1);
    const first = [e1.c, e1.r];
    bt.round++; bt.resetMoves(1); CombatAI.act(bt, e1);
    ok(!Novel.knellAt(bt, e1.c, e1.r), 'l\'IA sort de la zone du glas en deux tours (' + first + ' puis ' + e1.c + ',' + e1.r + ')');
  }
  // l'IA lance le Glas sur des ennemis englués
  {
    const bt = battle([['HighMenSpearmen', 1, 1]], [['HighMenSwordsmen', 6, 6], ['HighMenSwordsmen', 7, 6], ['HighMenSwordsmen', 6, 7], ['HighMenSwordsmen', 7, 7]]);
    for (const e of bt.alive(1)) e.web = 9;
    const P = CombatAI.hommPlan(bt, 0, 'knell', null);
    ok(P && Math.abs(P.target[0] - 6.5) <= 1 && Math.abs(P.target[1] - 6.5) <= 1, 'l\'IA sonne le glas sur les ennemis englués : ' + JSON.stringify(P));
  }
  // la Démence contagieuse : elle passe à un voisin
  {
    let bt = null, e1, e2, tries = 0;
    for (let s = 1; s < 40; s++) {
      bt = battle([['HighMenSpearmen', 1, 1]], [['HighMenSpearmen', 6, 6], ['HighMenSpearmen', 7, 6]], { seed: s });
      [e1, e2] = bt.alive(1); cast(bt, 'contagious_madness', e1); tries++;
      if (e1.confused) break;
    }
    ok(e1.confused && bt.madness[0] === e1, 'la Démence contagieuse prend (essai ' + tries + ')');
    ok(!CombatSpells.canAffect(bt, e2, 'contagious_madness'), 'une seule démence à la fois sur le champ');
    let spread = false;
    for (let k = 0; k < 12 && !spread; k++) { bt.round++; bt.tickZones(0); spread = e2.confused; }
    ok(spread && bt.madness[0] === e2, 'elle gagne le voisin : ' + bt.log.filter(l => /Démence/.test(l)).slice(-1)[0]);
  }
  // l'Ennemi juré : face à face, +3 en attaque ; le vainqueur prend un niveau et un objet
  {
    const hk = Object.keys(DATA.units).filter(k => DATA.units[k].hero || /^Hero/.test(k));
    const mk = (type, owner) => { const u = Units.create(g, type, owner, 0, at[0], at[1]); if (!u.hero) u.hero = { name: type, slots: ['melee', 'armor', 'jewelry'] }; u.items = u.items || [null, null, null]; return u; };
    const a = mk(hk[0], 0), b = mk(hk[1], 1);
    b.items = [{ kind: 'sword', slot: 'melee', name: 'Lame d\'essai', powers: [], melee: 2, value: 900 }, null, null]; a.items = [null, null, null];
    me.metHeroes = { [b.id]: g.turn };
    const v = Spells.validate(g, me, 'sworn_enemy', { unit: a.id, foe: b.id });
    ok(v.ok, 'Ennemi juré se lance sur un héros rival déjà combattu' + (v.ok ? '' : ' : ' + v.why));
    if (!me.known.includes('sworn_enemy')) me.known.push('sworn_enemy');
    E.OVERLAND_HANDLERS.sworn_enemy(g, me, { unit: a.id, foe: b.id });
    ok(a.sworn === b.id && b.sworn === a.id, 'le serment lie les deux héros');
    const A = [a], D = [b];
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: at[0], y: at[1], rng: new RNG(3) });
    const [ba] = bt.alive(0), [bb] = bt.alive(1);
    const base = Units.stats(g, a).melee;
    ok(bt.stats(ba).melee >= base + 3 && bt.swornFoe && bt.swornFoe.get(bb) === ba, 'au combat, chacun gagne +3 en attaque (' + base + ' → ' + bt.stats(ba).melee + ')');
    const xp0 = a.xp || 0, li0 = Units.levelIndex(g, a);
    bt.takeDamage(bb, 999, 'magic'); bt.checkDeath(bb); bt.checkEnd();
    const res = bt.results();
    Novel.swornAfter(g, bt, res);
    ok(Units.levelIndex(g, a) === li0 + 1 && a.items.some(it => it && it.name === 'Lame d\'essai') && a.sworn == null, 'le vainqueur gagne un niveau (' + xp0 + ' → ' + a.xp + ' XP) et prend la lame');
  }
}

// ---------- Réveil du charnier ----------
{
  const g = newGame(21), me = g.players[0], fc = g.cities[me.fortress], at = freeTile(g, fc, 2);
  const A = ['HighMenSpearmen', 'HighMenSpearmen', 'HighMenSwordsmen'].map(t => Units.create(g, t, 0, 0, at[0], at[1]));
  const D = ['HighMenSpearmen', 'HighMenSpearmen', 'HighMenSpearmen'].map(t => Units.create(g, t, 1, 0, at[0], at[1]));
  const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: at[0], y: at[1], rng: new RNG(2) });
  for (const b of bt.alive(1)) { bt.takeDamage(b, 999, 'magic'); bt.checkDeath(b); }
  bt.checkEnd();
  const res = bt.results();
  Novel.recordGraves(g, bt, res, { plane: 0, tx: at[0], ty: at[1] });
  const gr = Novel.grave(g, 0, at[0], at[1]);
  ok(gr && gr.n >= 18, 'la bataille laisse un charnier (' + (gr && gr.n) + ' figurines)');
  for (const u of D) Units.remove(g, u);
  E.Move.revealAllFor(g, me);
  const t = { plane: 0, x: at[0], y: at[1] };
  const v = Spells.validate(g, me, 'charnel_rising', t);
  ok(v.ok, 'Réveil du charnier se lance sur la case' + (v.ok ? '' : ' : ' + v.why));
  const n0 = Units.at(g, 0, at[0], at[1]).length;
  const r = Spells.apply(g, me, 'charnel_rising', t);
  const raised = Units.at(g, 0, at[0], at[1]).length - n0;
  ok(raised >= 3 && !Novel.grave(g, 0, at[0], at[1]), 'les morts se relèvent et le charnier se vide : ' + r.msg);
  ok(!Spells.validate(g, me, 'charnel_rising', t).ok, 'plus rien à relever ensuite');
}

// ---------- Trêve de Dieu ----------
(async () => {
  {
    const g = newGame(33, { life: 6 }), me = g.players[0], fc = g.cities[me.fortress];
    const at = freeTile(g, fc, 2);
    me.known.push('truce_of_god');
    const r = Spells.apply(g, me, 'truce_of_god', null);
    ok(r.ok !== false && me.globals.includes('truce_of_god') && Novel.truceDay(g, fc.plane), 'la Trêve de Dieu prend dès ce tour : ' + r.msg);
    const foe = Units.create(g, 'HighMenSpearmen', 1, fc.plane, at[0], at[1]);
    const nb = World.neighbors(g.world, at[0], at[1]).find(([x, y]) => !World.isWaterAt(g.world, fc.plane, x, y) && !Units.at(g, fc.plane, x, y).length && !Cities.at(g, fc.plane, x, y));
    const mine = Units.create(g, 'HighMenSwordsmen', 0, fc.plane, nb[0], nb[1]); mine.moves = 2;
    const a1 = await Game.attack(g, [mine.id], at[0], at[1], { auto: true });
    ok(a1.ok === false && a1.truce, 'jour de trêve : pas de bataille (' + a1.why + ')');
    g.turn++;
    ok(!Novel.truceDay(g, fc.plane), 'le tour suivant, on peut se battre');
    for (let k = 0; k < 9; k++) { Novel.tick(g); g.turn++; }
    ok(!me.globals.includes('truce_of_god') && !me.truce, 'au bout de 10 tours, la trêve prend fin');
  }
  // ---------- Dette de sang ----------
  {
    const g = newGame(44), me = g.players[0];
    me.mana = 10; me.known.push('blood_debt');
    const r = Spells.apply(g, me, 'blood_debt', null);
    ok(me.mana > 100 && me.debt && me.debt.left === Math.round((me.mana - 10) * 1.5), 'Dette de sang : ' + r.msg);
    ok(!Spells.validate(g, me, 'blood_debt', null).ok, 'pas de seconde dette tant que la première court');
    const left0 = me.debt.left; Novel.payDebt(g, me);
    ok(me.debt.left === left0 - me.debt.per, 'une échéance prélevée');
    const fc = g.cities[me.fortress], sk = Units.create(g, 'HellHounds', 0, fc.plane, fc.x, fc.y);
    me.mana = 0; Novel.payDebt(g, me);
    ok(sk.owner === -1, 'faute de mana, une créature invoquée déserte');
  }
  // ---------- Nœud-piège ----------
  {
    const g = newGame(55), me = g.players[0], foe = g.players[1];
    const s = g.sites.find(s => s.type === 'node');
    s.owner = 0; s.cleared = true; s.guardians = []; s.meldBy = 'MagicSpirit';
    me.known.push('node_trap');
    const t = { plane: s.plane, x: s.x, y: s.y };
    me.explored[s.plane][s.y * g.world.w + s.x] = 1;
    ok(Spells.validate(g, me, 'node_trap', t).ok, 'Nœud-piège se pose sur un de vos nœuds');
    Spells.apply(g, me, 'node_trap', t);
    foe.mana = 500;
    const sp = Units.create(g, 'MagicSpirit', 1, s.plane, s.x, s.y); sp.moves = 1;
    const r = Game.meld(g, sp.id);
    ok(r.failed && !g.units[sp.id] && s.owner === 0 && foe.mana === 500 - Novel.TRAP_MANA && s.trap == null, 'l\'esprit rival est détruit et son maître perd ' + Novel.TRAP_MANA + ' mana : ' + r.why);
  }
  // ---------- Bête déchaînée ----------
  {
    const g = newGame(66), me = g.players[0], foe = g.players[1];
    const fc2 = g.cities[foe.fortress];
    E.Move.revealAllFor(g, me);
    const at = freeTile(g, fc2, 2);
    for (const pp of [0, 1]) me.explored[pp].fill(1);
    const u0 = Units.create(g, 'HighMenScouts' in DATA.units ? 'HighMenScouts' : 'HighMenSpearmen', 0, fc2.plane, at[0], at[1]);   // pour voir la case
    const t2 = freeTile(g, { plane: fc2.plane, x: at[0], y: at[1] }, 1);
    Units.remove(g, u0);
    E.Spells._vis = null;
    const v = Spells.validate(g, me, 'unleashed_beast', { plane: fc2.plane, x: t2[0], y: t2[1] });
    const keep = Units.create(g, 'HighMenSpearmen', 0, fc2.plane, at[0], at[1]);
    const v2 = Spells.validate(g, me, 'unleashed_beast', { plane: fc2.plane, x: t2[0], y: t2[1] });
    ok(!v.ok && v2.ok, 'Bête déchaînée : seulement sur une case qu\'on voit (' + v.why + ')');
    Spells.apply(g, me, 'unleashed_beast', { plane: fc2.plane, x: t2[0], y: t2[1] });
    Units.remove(g, keep);
    const beast = Object.values(g.units).find(u => u.beast);
    ok(beast && beast.owner === -1 && beast.type === 'GreatDrake', 'un grand drake surgit, sans maître');
    const prey = beast && Novel.beastPrey(g, beast);
    ok(prey && prey.city === fc2, 'sa proie : la cité la plus proche, ' + (prey && prey.city ? prey.city.name : '?'));
    if (beast) { beast.beast.until = g.turn; await Novel.beastAct(g, [beast]); }
    ok(beast && !g.units[beast.id], 'au bout de ses tours, elle s\'éteint');
  }
  // ---------- Grande Inversion ----------
  {
    const g = newGame(77), me = g.players[0];
    Book.place(g);
    if (!g.book) { ok(true, '(pas de Livre sur cette carte : saut)'); }
    else {
      const lib = Cities.ofPlayer(g, 0)[0]; g.book.city = lib.id;
      for (const pp of [0, 1]) me.explored[pp].fill(1);
      ok(Book.knows(g, me, 'great_inversion'), 'le détenteur du Livre connaît la Grande Inversion');
      const fc = g.cities[me.fortress];
      ok(!Spells.validate(g, me, 'great_inversion', { plane: fc.plane, x: fc.x, y: fc.y }).ok, 'pas sur une région où se dresse une forteresse');
      // une région sans forteresse, avec une cité neutre ou une case de terre de chaque côté
      let t = null;
      for (const c of Object.values(g.cities)) { if (c.fortress || g.players.some(o => o.fortress === c.id)) continue; const tt = { plane: c.plane, x: c.x, y: c.y }; if (Spells.validate(g, me, 'great_inversion', tt).ok) { t = tt; break; } }
      ok(!!t, 'une région valable trouvée');
      if (t) {
        const city = Cities.at(g, t.plane, t.x, t.y), ter0 = World.terr(g.world, t.plane, t.x + 1, t.y), ter1 = World.terr(g.world, 1 - t.plane, t.x + 1, t.y);
        const u = Units.create(g, 'HighMenSpearmen', 0, t.plane, World.wx(g.world, t.x + 2), t.y);
        me.mana = 5000;
        const r = Spells.apply(g, me, 'great_inversion', t);
        ok(g.inversion && g.inversion.at === g.turn + 5 && g.log.some(e => e.pid === 1 && /Grande Inversion/.test(e.text)), 'annoncée à tous, cinq tours à l\'avance');
        for (let k = 0; k < 4; k++) { Novel.tick(g); g.turn++; }
        ok(city.plane === t.plane && g.inversion, 'rien avant l\'heure');
        Novel.tick(g); g.turn++;
        ok(!g.inversion && city.plane === 1 - t.plane && u.plane === 1 - t.plane && World.terr(g.world, t.plane, t.x + 1, t.y) === ter1 && World.terr(g.world, 1 - t.plane, t.x + 1, t.y) === ter0, 'la région a changé de monde : cité, unité et terrain');
        ok(Cities.at(g, 1 - t.plane, t.x, t.y) === city && E.World.get(g.world, 1 - t.plane, 'owner', t.x, t.y) === city.owner, 'la cité tient ses terres de l\'autre côté');
      }
    }
  }
  // ---------- l'IA hors combat ----------
  {
    const g = newGame(88, { life: 6 }), ai = g.players[1];
    for (const id of ['truce_of_god', 'blood_debt', 'node_trap', 'charnel_rising']) if (!ai.known.includes(id)) ai.known.push(id);
    ok(typeof AI.novelPlan === 'function', 'l\'IA a un plan pour chaque sort inédit');
    const fc = g.cities[ai.fortress], at = freeTile(g, fc, 2);
    for (let i = 0; i < 6; i++) Units.create(g, 'HighMenSwordsmen', 0, fc.plane, at[0], at[1]);
    E.Intel.refresh(g, ai);
    ai.mana = 5;
    const p = AI.novelPlan(g, ai, 'blood_debt', { cost: 30, manaIncome: 10, army: [] });
    ok(p && p.sc > 0, 'capitale menacée et mana à sec : l\'IA emprunte (Dette de sang)');
    const p2 = AI.novelPlan(g, ai, 'truce_of_god', { cost: 400, manaIncome: 10, army: Object.values(g.units).filter(u => u.owner === ai.id) });
    ok(p2 && p2.sc > 0, 'plus faible et menacée : l\'IA réclame la Trêve de Dieu');
  }
})();
