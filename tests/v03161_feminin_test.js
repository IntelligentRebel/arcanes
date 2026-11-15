// v0.31.61 : les sorcières (Malivra, Sylvaine, Célestine, Nérissa, ou leur portrait pris par un sorcier personnalisé) et les
// héroïnes sont au féminin dans les textes qui parlent d'elles ; un sorcier jamais rencontré reste « un sorcier ».
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, Diplomacy, DATA, Players, Heroes, Chronicle, Cities } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const W = id => DATA.wizards.find(w => w.id === id);
const mk = (human, seed) => Game.newGame({ seed: seed || 3, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human });
const me = { name: 'Moi', portrait: 0, books: { sorcery: 6, nature: 5 }, retorts: [], race: 'highmen' };
const last = (g, pid) => g.log.filter(e => e.pid === pid).pop().text;

// 1. qui est une sorcière
ok(['malivra', 'sylvaine', 'celestine', 'nerissa'].every(id => Players.female(W(id))), 'les quatre sorcières prédéfinies');
ok(!Players.female(W('aldoran')) && !Players.female(W('tsevan')) && !Players.female(W('vorgath')), 'les sorciers restent au masculin');
ok(Players.female({ portrait: 2, name: 'Personnalisée' }), 'un sorcier personnalisé au portrait de Malivra est une sorcière');
ok(Heroes.female(null, { type: 'HeroShalla' }) && Heroes.female(null, 'Kastra') && !Heroes.female(null, { type: 'HeroBrax' }), 'héroïnes : par la fiche, ou par le nom');

// 2. diplomatie avec une sorcière rencontrée
{
  const g = mk(me), pl = g.players[0], o = g.players[1];
  o.portrait = 2; o.name = 'Malivra';
  ok(!Players.femFor(g, pl.id, o.id) && Players.nameFor(g, pl.id, o.id) === 'un sorcier inconnu', 'jamais rencontrée : « un sorcier inconnu », au masculin');
  pl.contact[o.id] = true; o.contact[pl.id] = true;
  ok(Players.femFor(g, pl.id, o.id), 'rencontrée : au féminin');
  Diplomacy.why(g, o.id, pl.id, 'attacked', -30); Diplomacy.why(g, o.id, pl.id, 'treaty_broken', -20); o.relations[pl.id] = -50;
  const rs = Diplomacy.reasons(g, o.id, pl.id).map(r => r.label);
  ok(rs.includes('Vous l\'avez attaquée') && rs.includes('Vous avez rompu un traité avec elle'), 'ses raisons : ' + rs.join(' ; '));
  o.relations[pl.id] = 0; pl.diplo[o.id] = o.diplo[pl.id] = 'peace';
  const sp = Object.keys(DATA.spells).find(id => !o.known.includes(id) && DATA.spells[id].realm === 'sorcery');
  const r = Diplomacy.tradeAnswer(g, pl, o, [sp], [], 0);
  ok(r.why === 'Elle ne connaît pas ce sort.', 'marché refusé : ' + r.why);
  const dt = Diplomacy.dealText(g, { from: o.id, give: [o.known[0]], get: [], tgold: -20 });
  ok(/^elle vous apprend .* et elle vous verse 20 or$/.test(dt.you), 'son offre : ' + dt.you);
  // le même sorcier au portrait d'Aldoran : au masculin
  o.portrait = 0;
  ok(Diplomacy.reasons(g, o.id, pl.id).some(x => x.label === 'Vous l\'avez attaqué'), 'un sorcier : « Vous l\'avez attaqué »');
}

// 3. bannie, vaincue, tombée au combat
{
  const g = mk(me), pl = g.players[0], o = g.players[1];
  o.portrait = 11; o.name = 'Célestine'; pl.contact[o.id] = true; o.contact[pl.id] = true;
  const fc = g.cities[o.fortress];
  Game.banish(g, o, pl, fc);
  ok(/est bannie dans le néant ! .*si elle la reprend avant/.test(last(g, pl.id)), 'sa forteresse prise : ' + last(g, pl.id).slice(0, 90) + '…');
  const txt = Chronicle.text(g, Chronicle.of(g).ev.filter(e => e.k === 'banished').pop(), pl.id, false);
  ok(/ est bannie par vous/.test(txt), 'chronique : ' + txt);
  // une joueuse : « vous êtes bannie »
  const g2 = mk(Object.assign({}, me, { portrait: 9, name: 'Sylvaine' })), me2 = g2.players[0], foe = g2.players[1];
  Game.banish(g2, me2, foe, g2.cities[me2.fortress]);
  ok(/vous êtes bannie !/.test(last(g2, me2.id)), 'une joueuse : ' + last(g2, me2.id).slice(0, 70) + '…');
  const g3 = mk(me), p3 = g3.players[0], o3 = g3.players[2];
  o3.portrait = 13; p3.contact[o3.id] = true;
  Game.banish(g3, o3, p3, g3.cities[o3.fortress]);
  ok(/est banni dans le néant/.test(last(g3, p3.id)) === false && /bannie/.test(last(g3, p3.id)), 'Nérissa : bannie');
}

// 4. la chronique d'une héroïne
{
  const g = mk(me), pl = g.players[0];
  const t = Chronicle.text(g, { k: 'hero_fall', a: pl.id, h: 'Liselle', lv: '' }, pl.id, false);
  ok(t === 'Votre héroïne Liselle tombe.', 'chronique : ' + t);
  const t2 = Chronicle.text(g, { k: 'hero_fall', a: pl.id, h: 'Thordal', lv: '' }, pl.id, false);
  ok(t2 === 'Votre héros Thordal tombe.', 'un héros : ' + t2);
}
