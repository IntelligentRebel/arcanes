// Le Livre de légende et l'IA : attrait des cités à fragments, expédition (Difficile), sorts du Livre
const { loadEngine } = require('./load');
(async () => {
  const E = loadEngine(); const { Game, Book, Cities, Units, World, DATA, AI, Spells } = E;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
  const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hard', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  for (const p of g.players) { p.human = false; p.aiLevel = 'hard'; }
  const b = g.book, p1 = g.players[1];
  // l'attrait d'une cité qui garde un fragment
  const nf = b.frags.find(f => f.archive), nc = g.cities[nf.city];
  const lure = lvl => { p1.aiLevel = lvl; const v = AI.bookLure(g, p1, nc); p1.aiLevel = 'hard'; return v; };
  ok(lure('easy') === 1 && lure('normal') > 1 && lure('hard') > lure('normal'), 'attrait de ' + nc.name + ' : facile ' + lure('easy') + ', normale ' + lure('normal') + ', difficile ' + lure('hard'));
  // le joueur 1 réunit les cinq fragments
  for (const f of b.frags.filter(f => f.site != null)) await Game.lootSite(g, g.sites[f.site], 1, []);
  await Game.captureCity(g, nc, 1);
  ok(Book.held(g, 1) === 5, 'le joueur 1 détient 5 fragments ; cases possibles : ' + Book.candidates(g, 1).length);
  // une armée de taille à vaincre les gardiens, à quelques cases du Livre
  const w = g.world;
  let spot = null;
  for (let d = 4; d < 9 && !spot; d++) for (let dy = -d; dy <= d && !spot; dy++) for (let dx = -d; dx <= d && !spot; dx++) {
    const x = World.wx(w, b.x + dx), y = b.y + dy; if (y < 1 || y >= w.h - 1) continue;
    if (World.dist(w, x, y, b.x, b.y) !== d) continue;
    if (!World.isWater(World.terr(w, b.plane, x, y)) && !Cities.at(g, b.plane, x, y) && World.get(w, b.plane, 'site', x, y) < 0 && !Units.at(g, b.plane, x, y).length) spot = [x, y];
  }
  const army = ['GreatDrake', 'GreatDrake', 'SkyDrake', 'ArchAngel', 'GreatWyrm', 'Colossus', 'StormGiant', 'Efreet', 'ArchAngel'].filter(t => DATA.units[t]).map(t => Units.create(g, t, 1, b.plane, spot[0], spot[1]));
  for (const u of army) u.xp = 120;
  let turns = 0;
  while (!b.claimed && turns++ < 30) {
    for (const u of Object.values(g.units)) if (u.owner === 1) { u.moves = Units.maxMoves(g, u); u.dmg = Math.max(0, u.dmg - 10); }
    g.turn++;
    await AI.bookUnits(g, p1, new Set());
    E.Book.tick && E.Book.tick(g);
  }
  ok(b.revealed && b.revealedBy === 1, 'l\'expédition a trouvé la case et brisé le sceau');
  ok(b.claimed && Book.holder(g) === 1, 'le Livre est au joueur 1 après ' + turns + ' tours (' + army.filter(u => g.units[u.id]).length + ' survivants)');
  // les sorts du Livre dans la magie de l'IA : la Rature d'abord sur le Sort de Maîtrise d'un rival
  const p2 = g.players[2]; p1.contact[2] = true; p2.contact[1] = true; p1.diplo[2] = 'war'; p2.diplo[1] = 'war';
  p2.known.push('spell_of_mastery'); p1.mana = 3000; p1.casting = null;
  AI.manageMagic(g, p1);
  const c = p1.casting || {};
  ok(c.id === 'erasure' || !p2.known.includes('spell_of_mastery'), 'l\'IA lance la Rature contre le Sort de Maîtrise du joueur 2 (' + (c.id || 'aucun sort en cours') + ')');
  // une partie en Hardcore : le joueur 2 a lu quatre énigmes dès le départ ; il part à la recherche du Livre
  // (carte 24 depuis v0.31.13 : l'ajout de sorts a changé la carte 23, où les cases possibles sont hors d'atteinte de toute unité du joueur 2)
  const g2 = Game.newGame({ seed: +(process.env.S2 || 24), mapW: 60, mapH: 40, opponents: 3, difficulty: 'hardcore', human: { name: 'X', portrait: 0, books: { sorcery: 6 }, retorts: [], race: 'highmen' } });
  for (const p of g2.players) { p.human = false; p.aiLevel = 'hardcore'; }
  for (const f of g2.book.frags.filter(f => f.site != null).slice(0, 4)) await Game.lootSite(g2, g2.sites[f.site], 2, []);
  const n0 = Book.candidates(g2, 2).length;
  let t = 0;
  const best = () => { const gr = E.U.groupBy(Object.values(g2.units).filter(u => u.owner === 2 && !u.riteDemon), u => u.plane + ',' + u.x + ',' + u.y); return Math.round(Math.max(0, ...Object.values(gr).map(a => E.U.sum(a, u => Units.strength(g2, u))))); };
  for (; t < +(process.env.T || 90) && !g2.book.claimed && !g2.over; t++) { await E.Turn.endTurn(g2); if (t % 10 === 9) console.log('   tour ' + (t + 1) + ' : plus forte armée du joueur 2 ' + best() + ', cases fouillées ' + ((g2.players[2].aiBook || {}).seen || []).length + ' ' + JSON.stringify(Object.assign({}, g2.players[2].aiBook, { cands: ((g2.players[2].aiBook || {}).cands || []).length, seen: undefined }))); }
  const st = g2.players[2].aiBook || { seen: [], members: [] };
  ok(st.seen.length > 0 || g2.book.revealed, 'Hardcore, 4 énigmes (' + n0 + ' cases possibles) : ' + st.seen.length + ' cases fouillées en ' + t + ' tours ; sceau ' + (g2.book.revealed ? 'brisé par ' + g2.book.revealedBy : 'intact') + ' ; Livre ' + (g2.book.claimed ? 'pris par ' + Book.holder(g2) : 'scellé'));
})().catch(e => { console.log('ERREUR', e.stack); process.exitCode = 1; });
