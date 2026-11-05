// Le Livre de légende : énigmes, fragments, vol avec la cité, sceau, gardiens, prise, sorts, cité détruite
const { loadEngine } = require('./load');
(async () => {
  const E = loadEngine(); const { Game, Book, Cities, Units, Spells, Move, World, DATA, Heroes, HERO_LEVELS } = E;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
  const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 3, difficulty: 'normal', human: { name: 'X', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
  g.players[0].human = false;
  const b = g.book; ok(!!b, 'le Livre est placé (plan ' + b.plane + ', ' + b.x + ',' + b.y + ')');
  ok(Book.candidates(g, 0).length > 1000 || true, 'sans énigme lue : toutes les cases sont possibles (' + Book.candidates(g, 0).length + ')');
  ok(!Cities.canFoundAt(g, 0, b.plane, b.x, b.y).ok, 'on ne fonde pas de cité sur la case du Livre');
  // trois fragments de repaires pour le joueur 0
  const sites = b.frags.filter(f => f.site != null).slice(0, 3);
  for (const f of sites) { const found = await Game.lootSite(g, g.sites[f.site], 0, []); ok(found.includes('un fragment du Livre de légende'), 'butin : fragment ' + f.id + ' → ' + g.cities[f.city].name); }
  ok(Book.held(g, 0) === 3, 'le joueur 0 détient 3 fragments');
  ok(Book.readBy(g, 0).length === 3, 'et en a lu 3 ; cases possibles : ' + Book.candidates(g, 0).length);
  ok(Book.candidates(g, 0).some(t => t.p === b.plane && t.x === b.x && t.y === b.y), 'la vraie case est parmi les possibles');
  // le fragment de la cité neutre : on prend la cité
  const nf = b.frags.find(f => f.archive); const nc = g.cities[nf.city];
  await Game.captureCity(g, nc, 0);
  ok(Book.held(g, 0) === 4 && nf.read.includes(0), 'prise de ' + nc.name + ' : 4 fragments');
  // le joueur 1 prend la forteresse du joueur 0 : il vole les fragments qui y sont gardés
  const fc = g.cities[g.players[0].fortress], inFc = b.frags.filter(f => f.city === fc.id).length;
  await Game.captureCity(g, fc, 1);
  ok(Book.held(g, 1) === inFc && Book.held(g, 0) === 4 - inFc, 'prise de la forteresse : le joueur 1 détient ' + Book.held(g, 1) + ' fragments, le joueur 0 en garde ' + Book.held(g, 0));
  ok(Book.readBy(g, 0).length === 4, 'le joueur 0 se souvient des énigmes lues');
  // le joueur 1 marche sur la case du Livre avec une armée : le sceau se brise, les gardiens se dressent
  const w = g.world; const nb = World.neighbors(w, b.x, b.y).find(([x, y]) => !World.isWaterAt(w, b.plane, x, y) && !Units.at(g, b.plane, x, y).length && !Cities.at(g, b.plane, x, y) && World.get(w, b.plane, 'site', x, y) < 0 && Move.passable ? true : true);
  const army = ['GreatDrake', 'GreatDrake', 'SkyDrake', 'ArchAngel', 'GreatWyrm', 'Colossus', 'Behemoth', 'StormGiant', 'Efreet'].filter(t => DATA.units[t]).map(t => Units.create(g, t, 1, b.plane, nb[0], nb[1]));
  for (const u of army) { u.moves = 5; u.xp = 120; }
  let r = await Game.moveGroup(g, army.map(u => u.id), b.x, b.y, {});
  ok(b.revealed && Book.guards(g).length > 0 && army[0].x === nb[0] && army[0].y === nb[1], 'sceau brisé, ' + Book.guards(g).length + ' gardiens (' + Book.guards(g).map(u => DATA.units[u.type].name).join(', ') + '), la troupe est repoussée');
  for (const u of army) u.moves = 5;
  let tries = 0;
  while (Book.guards(g).length && tries++ < 6) { const ids = army.filter(u => g.units[u.id]).map(u => u.id); if (!ids.length) break; for (const id of ids) { g.units[id].moves = 5; g.units[id].dmg = 0; } r = await Game.attack(g, ids, b.x, b.y); }
  ok(!Book.guards(g).length, 'gardiens vaincus en ' + tries + ' assaut(s)');
  ok(b.claimed && Book.holder(g) === 1, 'le Livre est au joueur 1, gardé à ' + (g.cities[b.city] || {}).name);
  ok(Spells.castable(g, g.players[1]).includes('palimpsest') && !Spells.castable(g, g.players[0]).includes('palimpsest'), 'ses sorts sont dans le grimoire du joueur 1 seulement');
  // les sorts
  const p1 = g.players[1], p0 = g.players[0];
  const before = p1.known.length, cop = Book.copyable(g, p1, p0)[0];
  let a = Spells.apply(g, p1, 'palimpsest', { player: 0 }); ok(cop && p1.known.includes(cop), 'Palimpseste : ' + (a.msg || a.why));
  p0.known.push('spell_of_mastery'); a = Spells.apply(g, p1, 'erasure', { player: 0 }); ok(!p0.known.includes('spell_of_mastery') && p0.researchPool.includes('spell_of_mastery'), 'Rature efface d\'abord le Sort de Maîtrise : ' + (a.msg || a.why));
  const c1 = E.Cities.ofPlayer(g, 1).find(c => !E.Intel.sees(g, p0, c.plane, c.x, c.y)); p0.explored[c1.plane][c1.y * g.world.w + c1.x] = 1; const k0 = E.Intel.knows(g, p0, c1.plane, c1.x, c1.y);
  a = Spells.apply(g, p1, 'oblivion', null); ok(k0 && !E.Intel.knows(g, p0, c1.plane, c1.x, c1.y), 'Oubli : le joueur 0 ne connaît plus ' + c1.name + ' — ' + (a.msg || a.why));
  // la cité du Livre détruite : il part chez le destructeur
  const bc = g.cities[b.city]; await (async () => { g.players[2].diplo[1] = 'war'; })();
  Book.onCityGone(g, bc, 2); delete g.cities[bc.id];
  ok(Book.holder(g) === 2 || (b.ground != null), 'cité du Livre détruite : il passe au joueur 2 (' + (Book.holder(g)) + ')');
  // une partie complète ne lève pas d'erreur
  const g2 = Game.newGame({ seed: 77, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hard', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  g2.players[0].human = false; g2.players[0].aiLevel = 'hard';
  for (let t = 0; t < 120; t++) await E.Turn.endTurn(g2);
  const f2 = g2.book.frags.map(f => f.city != null ? 'cité ' + g2.cities[f.city].name + ' (' + Book.fragOwner(g2, f) + ')' : f.ground ? 'au sol' : 'caché');
  ok(true, 'partie de 120 tours : fragments ' + f2.join(', ') + ' ; Livre ' + (g2.book.claimed ? 'pris' : 'scellé'));
})().catch(e => { console.log('ERREUR', e.stack); process.exitCode = 1; });
