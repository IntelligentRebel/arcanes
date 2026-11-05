// Le Livre de légende : Annales, Deus ex machina (une fois par partie), Mise en abyme ; et leur usage par l'IA
const { loadEngine } = require('./load');
(async () => {
  const E = loadEngine(); const { Game, Book, Cities, Units, World, DATA, AI, Spells, Intel } = E;
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
  const g = Game.newGame({ seed: 9, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hard', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  for (const p of g.players) p.human = false;
  const p0 = g.players[0], p1 = g.players[1], b = g.book;
  for (const o of g.players) for (const q of g.players) if (o !== q) o.contact[q.id] = true;
  Book.claim(g, 0, { plane: b.plane, x: b.x, y: b.y });
  ok(Book.holder(g) === 0 && ['annals', 'deus_ex_machina', 'mise_en_abyme'].every(id => Spells.castable(g, p0).includes(id)), 'les trois nouveaux sorts sont dans le grimoire du détenteur');
  ok(!Spells.castable(g, p1).includes('annals'), 'et pas dans celui des autres');
  // Annales
  for (let i = 0; i < p1.explored[0].length; i += 3) p1.explored[0][i] = 1;
  const k = Object.keys(p1.intel || {}).length;
  p1.intel = p1.intel || {}; p1.intel['0,5,5'] = { t: g.turn, units: [{ type: 'Spearmen', owner: 2 }] };
  const before = p0.explored[0].reduce((a, v) => a + (v ? 1 : 0), 0);
  let r = Spells.apply(g, p0, 'annals', { player: 1 });
  const after = p0.explored[0].reduce((a, v) => a + (v ? 1 : 0), 0);
  ok(after > before && p0.intel['0,5,5'], 'Annales : ' + r.msg + ' (' + before + ' → ' + after + ' cases sur Arcanus)');
  // Deus ex machina sur la forteresse ; le sorcier 1 attaque : son armée repart chez lui
  const fort = g.cities[p0.fortress];
  ok(Spells.validate(g, p0, 'deus_ex_machina', { city: fort.id }).ok, 'Deus ex machina se lance sur la forteresse');
  r = Spells.apply(g, p0, 'deus_ex_machina', { city: fort.id });
  ok(fort.ench.some(e => e.spell === 'deus_ex_machina'), r.msg);
  ok(!Spells.validate(g, p0, 'deus_ex_machina', { city: Cities.ofPlayer(g, 0).find(c => c !== fort) ? Cities.ofPlayer(g, 0).find(c => c !== fort).id : fort.id }).ok, 'une seule fois par partie : ' + Spells.validate(g, p0, 'deus_ex_machina', { city: fort.id }).why);
  p1.diplo[0] = 'war'; p0.diplo[1] = 'war';
  const nb = World.neighbors(g.world, fort.x, fort.y).find(([x, y]) => !World.isWaterAt(g.world, fort.plane, x, y) && !Units.at(g, fort.plane, x, y).length && !Cities.at(g, fort.plane, x, y));
  const army = ['GreatDrake', 'GreatDrake'].map(t => Units.create(g, t, 1, fort.plane, nb[0], nb[1]));
  const hp0 = Units.at(g, fort.plane, fort.x, fort.y).length;
  r = await Game.attack(g, army.map(u => u.id), fort.x, fort.y);
  const home = g.cities[g.players[1].fortress];
  ok(r.repelled && army.every(u => g.units[u.id] && u.dmg === 0 && World.dist(g.world, u.x, u.y, home.x, home.y) <= 4 && u.moves === 0), 'l\'armée du sorcier 1 est renvoyée près de ' + home.name + ' (' + army[0].x + ',' + army[0].y + '), intacte');
  ok(fort.owner === 0 && Units.at(g, fort.plane, fort.x, fort.y).length === hp0 && !fort.ench.some(e => e.spell === 'deus_ex_machina'), 'la forteresse n\'a pas combattu, le sort s\'est consumé');
  // une deuxième attaque se joue normalement
  for (const u of army) { u.plane = fort.plane; u.x = nb[0]; u.y = nb[1]; u.moves = 3; }
  r = await Game.attack(g, army.map(u => u.id), fort.x, fort.y);
  ok(!r.repelled, 'la deuxième attaque a lieu (' + (r.won ? 'gagnée' : 'perdue') + ' par le sorcier 1)');
  // Mise en abyme
  const g2 = Game.newGame({ seed: 9, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hard', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  const q0 = g2.players[0]; q0.human = false; Book.claim(g2, 0, { plane: g2.book.plane, x: g2.book.x, y: g2.book.y });
  const f2 = g2.cities[q0.fortress];
  const drake = Units.create(g2, 'GreatDrake', 0, f2.plane, f2.x, f2.y); drake.xp = 90; drake.ench.push('flight');
  const n0 = Units.at(g2, f2.plane, f2.x, f2.y).length;
  r = Spells.apply(g2, q0, 'mise_en_abyme', { unit: drake.id });
  const twins = Units.at(g2, f2.plane, f2.x, f2.y).filter(u => u.type === 'GreatDrake');
  ok(twins.length === 2 && twins[1].xp === 90 && twins[1].ench.includes('flight') && Units.at(g2, f2.plane, f2.x, f2.y).length === n0 + 1, r.msg + ' (xp ' + twins[1].xp + ', ' + twins[1].ench.join(',') + ')');
  const hero = Object.values(g2.units).find(u => u.hero && u.owner === 0) || null;
  if (hero) ok(!Spells.validate(g2, q0, 'mise_en_abyme', { unit: hero.id }).ok, 'pas sur un héros');
  while (Units.at(g2, f2.plane, f2.x, f2.y).filter(u => u.owner === 0).length < 9) Units.create(g2, 'Spearmen' in DATA.units ? 'Spearmen' : 'HighMenSpearmen', 0, f2.plane, f2.x, f2.y);
  ok(!Spells.validate(g2, q0, 'mise_en_abyme', { unit: drake.id }).ok, 'pile pleine : ' + Spells.validate(g2, q0, 'mise_en_abyme', { unit: drake.id }).why);
  // l'IA : Deus ex machina sur sa forteresse menacée, Mise en abyme sur sa meilleure unité
  const g3 = Game.newGame({ seed: 4, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hard', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  for (const p of g3.players) { p.human = false; p.aiLevel = 'hard'; }
  const a1 = g3.players[1]; Book.claim(g3, 1, { plane: g3.book.plane, x: g3.book.x, y: g3.book.y });
  const fa = g3.cities[a1.fortress]; a1.mana = 5000; a1.diplo[2] = 'war'; g3.players[2].diplo[1] = 'war'; a1.contact[2] = g3.players[2].contact[1] = true;
  const near = World.neighbors(g3.world, fa.x, fa.y).filter(([x, y]) => !World.isWaterAt(g3.world, fa.plane, x, y) && !Cities.at(g3, fa.plane, x, y))[0];
  for (let i = 0; i < 4; i++) Units.create(g3, 'GreatDrake', 2, fa.plane, near[0], near[1]);
  E.Intel.refresh(g3, a1);
  AI.manageMagic(g3, a1);
  ok(a1.casting && a1.casting.id === 'deus_ex_machina' || fa.ench.some(e => e.spell === 'deus_ex_machina'), 'l\'IA menacée lance Deus ex machina sur sa forteresse (' + (a1.casting ? a1.casting.id : 'lancé') + ')');
  const g4 = Game.newGame({ seed: 4, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hard', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  for (const p of g4.players) { p.human = false; p.aiLevel = 'hard'; }
  const b1 = g4.players[1]; Book.claim(g4, 1, { plane: g4.book.plane, x: g4.book.x, y: g4.book.y });
  const fb = g4.cities[b1.fortress]; b1.mana = 5000; Units.create(g4, 'Colossus', 1, fb.plane, fb.x, fb.y);
  b1.known = b1.known.filter(id => DATA.spells[id].kind !== 'global');
  for (const o of g4.players) for (const q of g4.players) if (o !== q) o.contact[q.id] = true;
  g4.players[2].explored[0].fill(1);
  for (const o of g4.players) if (o !== b1) o.known = [];   // rien à recopier ni à raturer
  AI.manageMagic(g4, b1);
  ok(b1.casting && ['mise_en_abyme', 'annals'].includes(b1.casting.id), 'l\'IA en paix, devant un rival qui connaît tout Arcanus, choisit ' + (b1.casting ? b1.casting.id : 'rien'));
  // les artefacts légendaires : trois sur cinq dans toute la partie, au hasard ; le Livre change de mains, le compte reste
  const g5 = Game.newGame({ seed: 12, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hard', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  for (const p of g5.players) p.human = false;
  const c0 = g5.players[0], c1 = g5.players[1]; Book.claim(g5, 0, { plane: g5.book.plane, x: g5.book.x, y: g5.book.y });
  const got = [];
  for (let i = 0; i < 2; i++) { const r = Spells.apply(g5, c0, 'legendary_artifact', null); got.push(c0.vault[c0.vault.length - 1]); console.log('   ' + r.msg); }
  g5.book.city = Cities.ofPlayer(g5, 1)[0].id;   // le Livre passe au sorcier 1
  ok(Spells.validate(g5, c1, 'legendary_artifact', null).ok, 'le nouveau détenteur peut faire paraître le dernier');
  let r5 = Spells.apply(g5, c1, 'legendary_artifact', null); got.push(c1.vault[c1.vault.length - 1]); console.log('   ' + r5.msg);
  ok(new Set(got.map(it => it.bookArtifact)).size === 3 && got.every(it => it.legendary && it.powers.length === 3), 'trois artefacts différents : ' + got.map(it => it.name).join(', '));
  ok(!Spells.validate(g5, c1, 'legendary_artifact', null).ok, 'un quatrième est refusé : ' + Spells.validate(g5, c1, 'legendary_artifact', null).why);
  const h5 = Object.values(g5.units).find(u => u.hero && u.owner === 0) || E.Heroes && null;
  const ex = Book.makeArtifact('excalibur');
  ok(ex.melee === 8 && E.Items.describe(ex).includes('Vengeur sacré'), 'Excalibur : ' + E.Items.describe(ex));
  // l'IA avec un héros le lance en priorité
  const g6 = Game.newGame({ seed: 12, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hard', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  for (const p of g6.players) { p.human = false; p.aiLevel = 'hard'; }
  const d1 = g6.players[1]; Book.claim(g6, 1, { plane: g6.book.plane, x: g6.book.x, y: g6.book.y }); d1.mana = 3000;
  const fd = g6.cities[d1.fortress]; const hk = Object.keys(DATA.units).find(k => DATA.units[k].hero || /^Hero/.test(k));
  const hu = Units.create(g6, hk, 1, fd.plane, fd.x, fd.y); if (!hu.hero) hu.hero = { name: 'Test', slots: ['melee', 'armor', 'jewelry'] }; hu.items = hu.items || [null, null, null];
  for (const o of g6.players) if (o !== d1) o.known = [];
  AI.manageMagic(g6, d1);
  ok(d1.casting && d1.casting.id === 'legendary_artifact', 'l\'IA qui a un héros fait paraître un artefact (' + (d1.casting ? d1.casting.id : 'rien') + ')');
})().catch(e => { console.log('ERREUR', e.stack); process.exitCode = 1; });
