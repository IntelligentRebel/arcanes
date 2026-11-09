// v0.31.30 : les crises de fin. Déclenchement (tour 200, meneur 1,5 fois le deuxième 5 tours d'affilée ; 1,25 et 3 tours
// après la chute d'un Démon légendaire), présage puis crise ; chacune des cinq crises, de son début à sa fin.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Cities, Turn, Finale, Crisis, Magic, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };

function mk(seed, finale, cfg) {
  const g = Game.newGame({ seed, mapW: 60, mapH: 40, opponents: 2, difficulty: 'hard', crisis: 'off', noRite: true, finale, finaleCfg: cfg,
    human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
  g.players[0].human = false; g.players[0].aiLevel = 'hard';
  return g;
}
// le sorcier 0 mène de loin (les scores sont simulés)
function lead(ratio) { const real = Crisis.score; Crisis.score = (g, p) => p.id === 0 ? 100 * ratio : p.id === 1 ? 100 : 50; return () => { Crisis.score = real; }; }
const fakeBattle = pid => ({ owner: s => s === 0 ? pid : -1 });
async function kill(g, u, pid) { await Finale.afterBattle(g, fakeBattle(pid), { killed: [[], [u]] }, { attackers: [], defenders: [u], tx: u.x, ty: u.y, plane: u.plane }); Units.remove(g, u); }
async function start(seed, kind) {
  const g = mk(seed, kind); g.turn = 200;
  const f = g.finale; f.kind = kind; f.target = 0; f.state = 'omen'; f.at = 200;
  Finale.begin(g);
  return { g, f };
}

(async () => {
  // 1. le déclenchement
  {
    let undo = lead(1.6);
    const g = mk(5, 'lich');
    for (let t = 0; t < 4; t++) Finale.tick(g);
    ok(g.finale.state === 'watch', 'avant le tour 200 : rien');
    g.turn = 200;
    for (let t = 0; t < 4; t++) { Finale.tick(g); g.turn++; }
    ok(g.finale.state === 'watch' && g.finale.streak === 4, 'quatre tours de suite : pas encore');
    Finale.tick(g);
    ok(g.finale.state === 'omen' && g.finale.target === 0 && g.finale.kind === 'lich', 'cinq tours : le présage, contre le meneur');
    ok(g.log.some(l => /cessé de mourir/.test(l.text)), 'le présage est annoncé');
    g.turn = g.finale.at; Finale.tick(g);
    ok(g.finale.state === 'active' && g.units[g.finale.boss] && g.units[g.finale.boss].type === 'LichLord', 'cinq tours plus tard : la crise');
    undo();
    undo = lead(1.4);
    const g2 = mk(6, 'random'); g2.turn = 200;
    for (let t = 0; t < 12; t++) { Finale.tick(g2); g2.turn++; }
    ok(g2.finale.state === 'watch', 'meneur à 1,4 fois : rien');
    g2.riteStats = { slain: 1 };
    for (let t = 0; t < 3; t++) { Finale.tick(g2); g2.turn++; }
    ok(g2.finale.state === 'omen' && Finale.KINDS.includes(g2.finale.kind), 'Démon légendaire abattu : 1,25 fois, trois tours suffisent (' + g2.finale.kind + ')');
    undo();
    const g3 = mk(7, 'off'); g3.turn = 300; undo = lead(3);
    for (let t = 0; t < 10; t++) { Finale.tick(g3); g3.turn++; }
    ok(g3.finale.state === 'off', 'désactivée : jamais');
    undo();
  }
  // 2. le Seigneur liche : il se relève ; deux chutes livrent son phylactère ; le phylactère détruit, tout s'effondre
  {
    const { g, f } = await start(11, 'lich');
    const lich = g.units[f.boss];
    ok(lich && lich.finaleBoss && lich.crisisTarget === 0, 'le liche marche sur la cible');
    ok(Units.stats(g, lich).hp >= DATA.units.LichLord.hp, 'sa force suit celle du meneur');
    await kill(g, lich, 1);
    ok(f.boss == null && f.down === g.turn && f.clues === 1 && f.site == null, 'abattu : un premier indice, pas encore le phylactère');
    for (let t = 0; t < 3; t++) { g.turn++; Finale.tick(g); }
    const l2 = g.units[f.boss];
    ok(l2 && l2.type === 'LichLord' && l2.grow > lich.grow, 'trois tours plus tard, il se relève, plus fort');
    await kill(g, l2, 1);
    const s = g.sites[f.site];
    ok(s && s.type === 'phylactery' && !s.cleared && s.guardians.length >= 2, 'seconde chute : le phylactère apparaît, gardé');
    g.turn += 3; Finale.tick(g);
    ok(g.units[f.boss], 'le liche se relève encore');
    const found = await Finale.siteCleared(g, s, 1, []);
    ok(f.state === 'over' && f.by === 1 && !Object.values(g.units).some(u => u.finale), 'phylactère détruit : la crise finit, ses morts s\'effondrent');
    ok(found.length >= 4 && g.players[1].gold >= 600, 'récompense pour qui l\'a détruit');
  }
  // 3. l'Archimage oublié : citadelle, sorts plus chers, mana arraché, vagues
  {
    const { g, f } = await start(12, 'archmage');
    const s = g.sites[f.site], pl = g.players[0];
    ok(s && s.type === 'citadel' && s.guardians[0] === 'FinaleArchmage', 'la citadelle jaillit, l\'archimage y siège');
    const id = pl.known.find(k => DATA.spells[k].cost > 20);
    const was = Magic.spellCost(g, g.players[1], id);
    ok(Magic.spellCost(g, pl, id) >= Math.floor(was * 1.5) - 1 || !id, 'les sorts de la cible coûtent moitié plus');
    pl.mana = 1000;
    for (let t = 0; t < 8; t++) { g.turn++; Finale.tick(g); }
    ok(pl.mana < 1000, 'l\'archimage lui arrache du mana (' + pl.mana + ')');
    ok(Object.values(g.units).some(u => u.finale && u.crisisTarget === 0), 'une vague sort de la citadelle');
    await Finale.siteCleared(g, s, 0, []);
    ok(f.state === 'over' && Magic.spellCost(g, pl, id) === Magic.spellCost(g, pl, id, false), 'citadelle prise : fini');
  }
  // 4. le Grand Hiver : le givre s'étend, les cités gelées perdent leurs récoltes ; le Cœur brisé, tout dégèle
  {
    const { g, f } = await start(13, 'winter');
    const s = g.sites[f.site], w = g.world;
    ok(s && s.type === 'winterheart', 'le Cœur de l\'Hiver bat');
    const count = () => (w.planes[s.plane].frost || []).filter(Boolean).length;
    const c = Cities.ofPlayer(g, 0).find(c => c.plane === s.plane);
    const n0 = count(), lv0 = Cities.econ(g, c).foodLevel;
    for (let t = 0; t < 12; t++) { g.turn++; Finale.tick(g); }
    ok(count() > n0 + 20, 'le givre s\'étend (' + n0 + ' puis ' + count() + ' cases)');
    ok(g.log.some(l => l.pid === 0 && /givre gagne les terres/.test(l.text)), 'la cible apprend que le givre gagne ses terres');
    for (const [x, y] of World.catchment(w, c.x, c.y)) Finale.freeze(g, c.plane, x, y);
    const lv1 = Cities.econ(g, c).foodLevel;
    ok(lv1 < lv0 * 0.3, 'terres gelées : plus de récoltes (' + lv0 + ' puis ' + lv1 + ')');
    await Finale.siteCleared(g, s, 0, []);
    ok(f.state === 'over' && !w.planes[0].frost && !w.planes[1].frost, 'Cœur brisé : tout dégèle');
  }
  // 5. le Dévoreur de nœuds : il va aux nœuds de la cible, les engloutit, grandit ; abattu, fin
  {
    const g = mk(14, 'eater'); g.turn = 200;
    const fc = g.cities[g.players[0].fortress];
    const nodes = g.sites.filter(s => s.type === 'node' && s.plane === fc.plane).sort((a, b) => World.dist(g.world, a.x, a.y, fc.x, fc.y) - World.dist(g.world, b.x, b.y, fc.x, fc.y));
    const mine = nodes[0]; Object.assign(mine, { owner: 0, cleared: true, guardians: [] });
    for (const u of Object.values(g.units)) if (u.plane === mine.plane && u.x === mine.x && u.y === mine.y) Units.remove(g, u);
    const f = g.finale; f.kind = 'eater'; f.target = 0; f.state = 'omen'; f.at = 200; Finale.begin(g);
    const u = g.units[f.boss];
    ok(u && u.type === 'NodeEater' && u.plane === mine.plane, 'le Dévoreur surgit sur le plan des nœuds de la cible');
    ok(Finale.eaterTarget(g, f, u.plane, u) === mine, 'il vise d\'abord le nœud de la cible');
    const g0 = u.grow; g.players[0].mana = 400;
    for (let t = 0; t < 40 && !mine.devoured && g.units[u.id]; t++) { u.moves = Units.maxMoves(g, u); await Finale.moveBoss(g, [u]); }
    ok(mine.devoured && mine.owner === -1 && mine.power === 0 && u.grow === g0 + 1, 'nœud englouti, le Dévoreur grandit');
    ok(g.players[0].mana <= 300, 'le contrecoup coûte le quart de son mana au maître du nœud (' + g.players[0].mana + ')');
    ok(!Game.canMeld(g, { type: 'MagicSpirit', owner: 0, plane: mine.plane, x: mine.x, y: mine.y, ench: [] }).ok, 'un nœud dévoré ne se lie plus');
    await kill(g, u, 2);
    ok(f.state === 'over' && f.by === 2, 'abattu : fin de la crise');
  }
  // 6. le Prophète : l'agitation, les soulèvements, la sécession ; abattu, fin
  {
    const g = mk(15, 'prophet'); g.turn = 200;
    // la cible tient une seconde cité, agitée
    const fc = g.cities[g.players[0].fortress];
    const f = g.finale; f.kind = 'prophet'; f.target = 0; f.state = 'omen'; f.at = 200; Finale.begin(g);
    const u = g.units[f.boss];
    ok(u && u.type === 'Prophet' && Units.at(g, u.plane, u.x, u.y).length > 1, 'le Prophète arrive, escorté');
    ok(Finale.unrest(g, fc) >= 1 && Cities.econ(g, fc).unrestWhy.some(w => /Prophète/.test(w[0])), 'ses prêches agitent les cités de la cible');
    for (let t = 0; t < 6; t++) { g.turn++; Finale.tick(g); }
    ok(Object.values(g.units).some(o => o.finale && !o.finaleBoss && o.crisisTarget === 0 && !(o.x === u.x && o.y === u.y)), 'un soulèvement : des rebelles marchent sur la cible');
    await kill(g, u, 0);
    ok(f.state === 'over' && Finale.unrest(g, fc) === 0, 'abattu : fin, l\'agitation retombe');
  }
  // 6b. la cible bannie reste la cible ; éliminée, sa proie à terre, la crise s'éteint d'elle-même, sans récompense
  {
    const { g, f } = await start(16, 'archmage');
    g.players[0].banished = true; g.turn++; Finale.tick(g);
    ok(f.state === 'active' && f.target === 0, 'cible bannie : la crise la poursuit');
    g.players[0].alive = false; g.turn++; Finale.tick(g);
    ok(f.state === 'over' && f.faded && f.by == null && !Object.values(g.units).some(u => u.finale), 'cible éliminée : la crise s\'éteint');
  }
  // 7. dans le jeu : une crise par sorte, quelques tours joués par les IA, sans erreur
  for (const kind of Finale.KINDS) {
    const { g, f } = await start(20 + Finale.KINDS.indexOf(kind), kind);
    let err = null;
    try { for (let t = 0; t < 12 && !g.over; t++) await Turn.endTurn(g); } catch (e) { err = e; console.error(e); }
    ok(!err && (f.state === 'active' || f.state === 'over'), kind + ' : douze tours joués (' + f.state + ', vagues ' + (f.waves || 0) + ')');
  }
})();
// 8. (banc 19) réglages à l'essai : le Dévoreur ne vise que les nœuds de la cible ; les cités du Prophète gardent des rebelles ;
// l'Archimage frappe à d'autres intervalles
(async () => {
  await new Promise(r => setTimeout(r, 50));
  {
    const g = mk(14, 'eater', { EATER_TARGET_ONLY: 1 }); g.turn = 200;
    const fc = g.cities[g.players[0].fortress];
    const nodes = g.sites.filter(s => s.type === 'node' && s.plane === fc.plane).sort((a, b) => World.dist(g.world, a.x, a.y, fc.x, fc.y) - World.dist(g.world, b.x, b.y, fc.x, fc.y));
    const other = nodes[1]; Object.assign(other, { owner: 1, cleared: true, guardians: [] });
    const f = g.finale; f.kind = 'eater'; f.target = 0; f.state = 'omen'; f.at = 200; Finale.begin(g);
    const u = g.units[f.boss];
    ok(u && !Finale.eaterTarget(g, f, u.plane, u), 'essai : la cible n\'a pas de nœud, le Dévoreur ne vise pas ceux des autres');
    Object.assign(nodes[0], { owner: 0, cleared: true, guardians: [] });
    ok(Finale.eaterTarget(g, f, u.plane, u) === nodes[0], 'essai : il vise le nœud de la cible');
  }
  {
    const g = mk(15, 'prophet', { PROPHET_HOLD: 1 }); g.turn = 200;
    const f = g.finale; f.kind = 'prophet'; f.target = 0; f.state = 'omen'; f.at = 200; Finale.begin(g);
    const u = g.units[f.boss], fc = g.cities[g.players[0].fortress];
    // une seconde cité de la cible, tout près du Prophète, en pleine révolte
    const c2 = Object.values(g.cities).find(c => c.owner < 0 && c.plane === u.plane) || null;
    if (c2) { c2.owner = 0; Cities.econ = (orig => (game, c) => { const e = orig(game, c); return c === c2 ? Object.assign({}, e, { unrest: 99 }) : e; })(Cities.econ); u.x = c2.x + 1; u.y = c2.y; }
    for (let t = 0; t < 6 && c2 && c2.owner === 0; t++) { g.turn++; Finale.tick(g); }
    ok(!c2 || (c2.owner === -1 && Units.at(g, c2.plane, c2.x, c2.y).some(x => x.owner === -1)), 'essai : la cité qui fait sécession garde une garnison rebelle');
  }
  {
    const g = mk(12, 'archmage', { ARCH_CURSE: 6 }); g.turn = 200;
    const f = g.finale; f.kind = 'archmage'; f.target = 0; f.state = 'omen'; f.at = 200; Finale.begin(g);
    g.turn = f.curseAt; Finale.tick(g);
    ok(f.curseAt === g.turn + 6, 'essai : l\'Archimage lance un sort tous les 6 tours');
  }
})();
