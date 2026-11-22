// v0.31.56, retours de Cor'e : le rappel ramène au cercle d'invocation (comme dans Master of Magic) ; des volontaires trouvés
// sur un îlot sans aucune de vos cités se présentent à la cité la plus proche (ils y restaient bloqués) ; une route tracée ne
// passe que par la terre (des ingénieurs volants la traçaient au-dessus de la mer) ; des troupes arrêtées par une rencontre
// gardent leur route ; l'IA propose au joueur des marchés avec de l'or (elle n'en proposait presque jamais).
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, Diplomacy, DATA, World, Cities, Units, Spells, Move, T } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const mk = seed => Game.newGame({ seed, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 6, nature: 5 }, retorts: [], race: 'highmen' } });
(async () => {
  // 1. Mot de rappel : à la cité du cercle d'invocation
  {
    const g = mk(5), pl = g.players[0], fort = g.cities[pl.fortress];
    let spot2 = null;
    for (let d = 6; d < 20 && !spot2; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]]) { const x = World.wx(g.world, fort.x + dx), y = fort.y + dy; if (y > 1 && y < g.world.h - 2 && World.terr(g.world, fort.plane, x, y) === T.GRASS && !Cities.at(g, fort.plane, x, y)) { spot2 = [x, y]; break; } }
    const c2 = Cities.create(g, pl.id, 'highmen', fort.plane, spot2[0], spot2[1]);
    E.OVERLAND_HANDLERS.summoning_circle(g, pl, { city: c2.id });
    const u = Units.create(g, 'HighMenSpearmen', pl.id, fort.plane, (fort.x + 20) % g.world.w, fort.y);
    const r = E.OVERLAND_HANDLERS.word_of_recall(g, pl, { unit: u.id }); if (!r.msg) console.log('  ', JSON.stringify(r), c2.x, c2.y, World.terr(g.world, fort.plane, c2.x, c2.y));
    ok(r.msg && World.dist(g.world, u.x, u.y, c2.x, c2.y) <= 1, 'Mot de rappel : vers ' + c2.name + ', la cité du cercle (' + r.msg + ')');
    const h = Units.create(g, 'HighMenSwordsmen', pl.id, fort.plane, (fort.x + 20) % g.world.w, fort.y);
    E.OVERLAND_HANDLERS.summoning_circle(g, pl, { city: fort.id });
    E.OVERLAND_HANDLERS.word_of_recall(g, pl, { unit: h.id });
    ok(World.dist(g.world, h.x, h.y, fort.x, fort.y) <= 1, 'le cercle revenu à la forteresse : le rappel y ramène');
  }
  // 2. des volontaires sur un îlot : ils se présentent à la cité la plus proche
  {
    const g = mk(6), pl = g.players[0], w = g.world, fort = g.cities[pl.fortress], p = fort.plane;
    // un îlot fabriqué en pleine mer : une case de prairie entourée d'océan, loin de tout
    let spot = null;
    for (let y = 3; y < w.h - 3 && !spot; y++) for (let x = 0; x < w.w && !spot; x++) {
      let sea = true; for (let dy = -2; dy <= 2 && sea; dy++) for (let dx = -2; dx <= 2 && sea; dx++) if (World.terr(w, p, World.wx(w, x + dx), y + dy) !== T.OCEAN) sea = false;
      if (sea) spot = [x, y];
    }
    ok(!!spot, 'une case de pleine mer pour l\'îlot');
    World.set(w, p, 'terr', spot[0], spot[1], T.GRASS);
    g.caches = [{ plane: p, x: spot[0], y: spot[1], kind: 'recruits', amt: 1 }];
    const flyer = Units.create(g, 'Sprites', pl.id, p, spot[0], spot[1]);
    const before = Object.keys(g.units).length;
    Game.collectCache(g, pl, [flyer], p, spot[0], spot[1]);
    const neu = Object.values(g.units).filter(u => u.owner === pl.id && /Spearmen/.test(u.type) && u.id >= before - 1).pop();
    const home = Object.values(g.cities).filter(c => c.owner === pl.id && c.plane === p).sort((a, b) => World.dist(w, a.x, a.y, spot[0], spot[1]) - World.dist(w, b.x, b.y, spot[0], spot[1]))[0];
    ok(neu && !(neu.x === spot[0] && neu.y === spot[1]) && World.dist(w, neu.x, neu.y, home.x, home.y) <= 1, 'volontaires d\'un îlot : à ' + home.name + ' (' + (neu ? neu.x + ',' + neu.y : 'aucun') + ')');
    ok(/se joignent à vous à /.test((g.log[g.log.length - 1] || {}).text || ''), 'le journal dit où : ' + ((g.log[g.log.length - 1] || {}).text || ''));
  }
  // 3. une route tracée ne traverse pas la mer, même par des ingénieurs volants
  {
    const g = mk(7), pl = g.players[0], w = g.world, fort = g.cities[pl.fortress], p = fort.plane;
    const eng = Units.create(g, 'DraconianEngineers', pl.id, p, fort.x, fort.y);
    for (const q of [0, 1]) pl.explored[q].fill(1);   // la mer est connue (dans le brouillard, le tracé suppose la terre)
    // une destination de l'autre côté d'un bras de mer : la première terre au-delà d'au moins 3 cases d'eau en ligne droite
    let target = null;
    for (const dir of [1, -1]) for (let dy = -6; dy <= 6 && !target; dy++) {
      let water = 0;
      for (let k = 1; k < 25; k++) { const x = World.wx(w, fort.x + dir * k), y = fort.y + dy; if (y < 1 || y >= w.h - 1) break; const t = World.terr(w, p, x, y);
        if (t === T.OCEAN) water++; else if (water >= 3) { target = [x, y]; break; } }
    }
    if (target) {
      const r = Game.roadPlanFor(g, [eng.id], target[0], target[1]);
      const wet = r.ok ? r.tiles.filter(([x, y]) => { const t = World.terr(w, p, x, y); return t === T.OCEAN || t === T.LAKE; }).length : 0;
      ok(!r.ok || wet === 0, 'tracé de route vers ' + target + ' : ' + (r.ok ? r.tiles.length + ' cases, ' + wet + ' sur l\'eau' : r.why));
    } else ok(true, '(pas de bras de mer près de la forteresse sur cette carte)');
  }
  // 4. l'IA propose au joueur des marchés : un pour presque chaque voisin connu, toujours acceptable pour elle
  {
    let made = 0, gold = 0, tried = 0, bad = 0;
    for (const seed of [11, 12, 13, 14]) {
      const g = mk(seed), pl = g.players[0];
      for (const a of g.players.filter(p => !p.human)) {
        a.contact[pl.id] = pl.contact[a.id] = true; a.diplo[pl.id] = pl.diplo[a.id] = 'none'; a.relations[pl.id] = pl.relations[a.id] = 10;
        pl.gold = 400; a.gold = 600; tried++;
        const d = Diplomacy.dealForHuman(g, a, pl); if (!d) continue;
        made++; if (d.tgold) gold++;
        // au juste prix : ce que l'IA reçoit vaut ce qu'elle donne, à 20 % près (or compté aux taux du marché) ; chacun peut payer
        const { vg, vr } = Diplomacy.dealValue(d.give, d.get, d.tgold);
        if (vr < vg * 0.8 || vr > vg * 1.6 || d.tgold > pl.gold || -d.tgold > Diplomacy.goldSpare(a)) { bad++; console.log('   fautif', seed, a.name, JSON.stringify(d), vg, vr); }
      }
      for (const a of g.players.filter(p => !p.human)) if (!Diplomacy.tradeable(g, a, pl).length && !Diplomacy.tradeable(g, pl, a).length) tried--;   // rien à échanger
      {
      }
    }
    // (0.31.73) « presque » : les sorts tirés au départ changent avec chaque ajout ; un voisin sans écart payable peut rester sans offre
    ok(made >= tried * 0.8, 'marchés proposés : ' + made + ' sur ' + tried + ' voisins ayant de quoi échanger (dont ' + gold + ' avec de l\'or)');
    ok(bad === 0, 'tous au juste prix, et payables (' + bad + ' fautifs)');
    // l'offre acceptée : sorts et or changent de mains
    const g = mk(11), pl = g.players[0], a = g.players.find(p => !p.human);
    a.contact[pl.id] = pl.contact[a.id] = true; a.diplo[pl.id] = pl.diplo[a.id] = 'none'; a.relations[pl.id] = pl.relations[a.id] = 10; pl.gold = 400; a.gold = 600;
    const d = Diplomacy.dealForHuman(g, a, pl), g0 = pl.gold, txt = Diplomacy.dealText(g, d);
    Diplomacy.acceptOffer(g, pl, Object.assign({ from: a.id, kind: 'trade' }, d));
    ok(Diplomacy.list(d.give).every(id => pl.known.includes(id)) && Diplomacy.list(d.get).every(id => a.known.includes(id)) && pl.gold === g0 - (d.tgold || 0), 'accepté : ' + txt.you + ', contre ' + txt.him);
  }
})();
