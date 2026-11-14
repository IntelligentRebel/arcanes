// v0.31.55 : un marché de sorts à plusieurs sorts de chaque côté, et de l'or pour l'équilibrer (demande de Cor'e : les échanges
// d'un sort contre un sort tombent rarement juste). L'or compte au taux des événements : reçu 0,8 point de recherche la pièce,
// donné 1,25 ; un sorcier ne cède pas plus de la moitié de son trésor. Un échange d'un sort contre un sort est jugé comme avant.
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, Diplomacy, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 7, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 5, nature: 5 }, retorts: [], race: 'highmen' } });
const a = g.players[0], b = g.players[1];
a.contact[b.id] = b.contact[a.id] = true; a.diplo[b.id] = b.diplo[a.id] = 'none'; a.relations[b.id] = b.relations[a.id] = 20;
// des sorts arcaniques (tout sorcier peut les apprendre) : deux que b connaît, un que a connaît
const arc = Object.keys(DATA.spells).filter(id => { const s = DATA.spells[id]; return s.realm === 'arcane' && s.research > 0 && !/^lore_/.test(id) && !(s.params && s.params.gate) && id !== 'spell_of_mastery' && !a.known.includes(id) && !b.known.includes(id); })
  .sort((x, y) => DATA.spells[x].research - DATA.spells[y].research);
ok(arc.length >= 3, 'trois sorts arcaniques à échanger (' + arc.length + ')');
const [x1, x2, y1] = [arc[arc.length - 1], arc[arc.length - 2], arc[Math.floor(arc.length / 2)]];
b.known.push(x1, x2); a.known.push(y1);
const V = id => Diplomacy.spellValue(id), k = Diplomacy.tradeFactor(g, b, a);
console.log('  ' + x1 + ' ' + V(x1) + ' RP, ' + x2 + ' ' + V(x2) + ' RP, ' + y1 + ' ' + V(y1) + ' RP ; exigence ×' + k);
// 1. un sort contre un sort : le même jugement qu'avant (le tableau ne change rien)
const one = Diplomacy.tradeAnswer(g, a, b, x1, y1), oneL = Diplomacy.tradeAnswer(g, a, b, [x1], [y1], 0);
ok(one.ok === oneL.ok && one.ok === (V(y1) >= V(x1) * k), 'un sort contre un sort : jugé comme avant (' + one.ok + ')');
// 2. deux sorts contre un : l'or qui manque, au plus juste
a.gold = 5000; b.gold = 400;
const fair = Diplomacy.fairGold(g, a, b, [x1, x2], [y1]);
ok(fair > 0 && fair % 5 === 0, 'deux sorts contre un : il faut ajouter ' + fair + ' or');
ok(!Diplomacy.tradeAnswer(g, a, b, [x1, x2], [y1], fair - 5).ok, 'cinq pièces de moins : refusé');
ok(Diplomacy.tradeAnswer(g, a, b, [x1, x2], [y1], fair).ok, 'avec cet or : accepté');
// 3. le marché conclu : deux sorts appris, un enseigné, l'or versé
const ga = a.gold, gb = b.gold;
const r = Diplomacy.proposeTrade(g, a.id, b.id, [x1, x2], [y1], fair);
ok(r.ok && a.known.includes(x1) && a.known.includes(x2) && b.known.includes(y1), 'marché conclu : ' + r.text);
ok(a.gold === ga - fair && b.gold === gb + fair, 'l\'or a changé de mains (' + (ga - a.gold) + ')');
ok(Diplomacy.proposeTrade(g, a.id, b.id, [x1, x2], [y1], fair).ok === false, 'le même marché deux fois dans le tour : déjà répondu');
// 4. vendre un sort contre de l'or : b paie, au plus la moitié de son trésor
const g2 = Game.newGame({ seed: 8, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 5, nature: 5 }, retorts: [], race: 'highmen' } });
const A = g2.players[0], B = g2.players[1];
A.contact[B.id] = B.contact[A.id] = true; A.diplo[B.id] = B.diplo[A.id] = 'none'; A.relations[B.id] = B.relations[A.id] = 20;
const z = arc.find(id => !B.known.includes(id) && !A.known.includes(id)); A.known.push(z);
B.gold = 10000;
const sell = Diplomacy.fairGold(g2, A, B, [], [z]);
ok(sell < 0, 'vendre ' + z + ' (' + V(z) + ' RP) : il paierait jusqu\'à ' + (-sell) + ' or');
ok(Diplomacy.tradeAnswer(g2, A, B, [], [z], sell).ok && !Diplomacy.tradeAnswer(g2, A, B, [], [z], sell - 50).ok, 'au-delà, il refuse');
B.gold = 100;
ok(Diplomacy.fairGold(g2, A, B, [], [z]) >= -50 && !Diplomacy.tradeAnswer(g2, A, B, [], [z], -60).ok, 'un trésor de 100 or : il n\'en cède pas plus de 50');
const before = A.gold; ok(Diplomacy.proposeTrade(g2, A.id, B.id, [], [z], -50).ok && A.gold === before + 50 && B.gold === 50 && B.known.includes(z), 'vendu 50 or');
// 5. sans assez d'or, on ne promet pas
A.gold = 10; const w = arc.find(id => !A.known.includes(id) && !B.known.includes(id)); B.known.push(w);
ok(!Diplomacy.tradeAnswer(g2, A, B, [w], [], 500).ok, 'promettre plus d\'or qu\'on n\'en a : refusé');
// 6. un présent de sorts s'accepte toujours et réchauffe la relation
const rel = B.relations[A.id] || 0, q = arc.find(id => !A.known.includes(id) && !B.known.includes(id) && id !== w); A.known.push(q);
ok(Diplomacy.proposeTrade(g2, A.id, B.id, [], [q], 0).ok && (B.relations[A.id] || 0) > rel, 'un présent : accepté, la relation monte');
// 7. en guerre : rien
A.diplo[B.id] = B.diplo[A.id] = 'war';
ok(!Diplomacy.tradeAnswer(g2, A, B, [w], [], 0).ok, 'en guerre : pas de marché');
