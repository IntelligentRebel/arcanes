// v0.31.71 : les sorts venus de Heroes of Might and Magic. Chacun fait ce que dit sa description : Lenteur, Lenteur de masse,
// Entraves, Crépuscule, Champ de force, Rideau de flammes, Mines de feu, Brume, Téléportation (et le Mur de feu qui l'interdit
// dans la cité), Rafale, Miroir magique, Clone, Chaîne d'éclairs (qui touche aussi vos troupes), Bouclier de feu, Martyre,
// Vengeance divine, Sacrifice, Vampirisme ; l'IA les lance ; la Porte dimensionnelle et le Portail urbain sur la carte.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Cities, Battle, RNG, CombatSpells, CombatAI, Spells, Move, DATA, Intel } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };

const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 3, chaos: 3, nature: 3, death: 2 }, retorts: [], race: 'highmen' } });
const me = g.players[0], foe = g.players[1];
me.human = true; me.mana = 100000;
const fc = g.cities[me.fortress];
// une case de plaine libre, hors des cités
let at = null;
for (let d = 3; d < 15 && !at; d++) for (let dx = -d; dx <= d && !at; dx++) for (const dy of [-d, d]) { const x = World.wx(g.world, fc.x + dx), y = fc.y + dy; if (World.inY(g.world, y) && World.terr(g.world, 0, x, y) === E.T.GRASS && !Cities.at(g, 0, x, y) && !Units.at(g, 0, x, y).length) { at = [x, y]; break; } }
// une bataille sur un sol nu ; mine : [type, c, r], theirs : idem
function battle(mine, theirs, o = {}) {
  const A = mine.map(([t]) => Units.create(g, t, 0, 0, at[0], at[1])), D = theirs.map(([t]) => Units.create(g, t, 1, 0, at[0], at[1]));
  const bt = new Battle(g, Object.assign({ attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: at[0], y: at[1], rng: new RNG(o.seed || 5) }, o.city ? { city: o.city, x: o.city.x, y: o.city.y } : {}));
  if (!o.keepTerrain) { bt.props = {}; bt.hills = {}; bt.river = {}; bt.ford = {}; bt.bridge = {}; bt.mud = {}; }
  bt.alive(0).forEach((b, i) => { b.c = mine[i][1]; b.r = mine[i][2]; });
  bt.alive(1).forEach((b, i) => { b.c = theirs[i][1]; b.r = theirs[i][2]; });
  bt.side = 0; bt.castThisRound[0] = false; bt.skillLeft[0] = 100000; bt.resetMoves(0);
  return bt;
}
const known = id => { if (!me.known.includes(id)) me.known.push(id); };
const cast = (bt, id, t, to) => { bt.castThisRound[0] = false; known(id); return CombatSpells.cast(bt, 0, id, t, null, 0, to); };
const U0 = bt => bt.alive(0), U1 = bt => bt.alive(1);

// --- Lenteur : la moitié du mouvement au round suivant ; sans effet sur une unité à une case
{
  const bt = battle([['HighMenSpearmen', 2, 2]], [['HighMenCavalry', 9, 9], ['HighMenSpearmen', 10, 10]]);
  const cav = U1(bt)[0], sp = U1(bt)[1];
  ok(!CombatSpells.validTargets(bt, 0, 'slow').includes(sp), 'Lenteur ne vise pas une unité qui ne va qu\'à une case');
  for (let i = 0; i < 40 && !cav.curses.includes('slow'); i++) cast(bt, 'slow', cav);
  const m0 = Math.max(1, Units.stats(g, cav.u).move) * 2;
  bt.resetMoves(1);
  ok(cav.curses.includes('slow') && cav.maxMoves === m0 / 2, 'Lenteur : mouvement de la cavalerie ' + m0 / 2 + ' → ' + cav.maxMoves + ' demi-points');
}
// --- Lenteur de masse
{
  const bt = battle([['HighMenSpearmen', 2, 2]], [['HighMenCavalry', 9, 9], ['HighMenCavalry', 10, 10], ['HighMenCavalry', 8, 10]]);
  cast(bt, 'mass_slow', null);
  ok(U1(bt).some(b => b.curses.includes('slow')) && /Lenteur de masse/.test(bt.log.join(' ')), 'Lenteur de masse : ' + U1(bt).filter(b => b.curses.includes('slow')).length + ' cavaleries ralenties sur 3');
}
// --- Entraves : plus de riposte
{
  const bt = battle([['HighMenSwordsmen', 5, 5]], [['HighMenSwordsmen', 6, 6]]);
  const t = U1(bt)[0], a = U0(bt)[0];
  for (let i = 0; i < 40 && !t.curses.includes('shackles'); i++) cast(bt, 'shackles', t);
  const d0 = a.u.dmg; bt.melee(a, t);
  ok(t.curses.includes('shackles') && a.u.dmg === d0, 'Entraves : l\'épéiste entravé ne riposte pas (' + (a.u.dmg - d0) + ' dégât subi)');
}
// --- Crépuscule : plus de tir
{
  const bt = battle([['HighMenSwordsmen', 2, 2]], [['HighMenBowmen', 9, 9]]);
  const t = U1(bt)[0], a = U0(bt)[0];
  ok(!CombatSpells.validTargets(bt, 0, 'twilight').includes(a), 'Crépuscule ne vise pas une unité sans tir');
  for (let i = 0; i < 40 && !t.curses.includes('twilight'); i++) cast(bt, 'twilight', t);
  bt.side = 1; bt.resetMoves(1);
  ok(t.curses.includes('twilight') && !bt.canShoot(t, a), 'Crépuscule : les archers ne tirent plus');
}
// --- Champ de force : infranchissable, même pour un volant ; deux tours de l'adversaire puis il tombe
{
  const bt = battle([['HighMenSpearmen', 2, 6]], [['HighMenSpearmen', 9, 6]]);
  ok(cast(bt, 'force_field', [5, 6, 3]), 'Champ de force lancé (ligne le long de r)');
  ok(bt.fieldAt(5, 5) && bt.fieldAt(5, 6) && bt.fieldAt(5, 7), 'trois cases de force');
  const b = U1(bt)[0]; bt.side = 1; bt.resetMoves(1); const rch = bt.reachable(b);
  ok(!rch.has('5,6') && !rch.has('5,5'), 'on n\'entre pas dans le champ de force');
  ok(bt.blocked(5, 6) && bt.cutsField(4, 6, 1, -1) === false, 'blocked compte le champ de force');
  // en diagonale entre deux cases du champ : impossible
  const bt2 = battle([['HighMenSpearmen', 2, 2]], [['Sprites', 6, 5]]);
  cast(bt2, 'force_field', [6, 6, 0]);   // (5,7) (6,6) (7,5)
  const s2 = U1(bt2)[0]; s2.c = 6; s2.r = 5; bt2.side = 1; bt2.resetMoves(1);
  ok(!bt2.reachable(s2).has('7,6') || bt2.cutsField(6, 5, 1, 1) === false, 'un volant ne se glisse pas en diagonale entre deux cases du champ');
  ok(bt2.cutsField(6, 5, -1, 1) === false && bt2.cutsField(7, 6, -1, -1) === true, 'le coin entre (6,6) et (7,5) est fermé');
  bt.side = 0; bt.endSide(); ok(bt.fieldAt(5, 6), 'encore là au tour de l\'adversaire'); bt.endSide(); ok(bt.fieldAt(5, 6), 'encore là au retour du lanceur (1 round)');
  bt.endSide(); bt.endSide(); ok(!bt.fieldAt(5, 6), 'tombé après deux tours de l\'adversaire');
}
// --- Rideau de flammes : qui y entre brûle ; un ennemi pris dessous brûle aussitôt ; nos unités passent
{
  const bt = battle([['HighMenSpearmen', 2, 6]], [['HighMenSwordsmen', 7, 6], ['HighMenSpearmen', 11, 6]]);
  const s0 = U1(bt)[0], d0 = s0.u.dmg;
  cast(bt, 'fire_curtain', [7, 6, 3]);
  ok(bt.flameAt(7, 5) && bt.flameAt(7, 6) && bt.flameAt(7, 7), 'trois cases en flammes');
  ok(s0.u.dmg > d0 || /flammes/.test(bt.log.join(' ')), 'l\'ennemi pris dessous brûle (' + (s0.u.dmg - d0) + ')');
  const w = U1(bt)[1]; bt.side = 1; bt.resetMoves(1); const dw = w.u.dmg;
  w.moves = 10; bt.moveUnit(w, 7, 7);
  ok(/Rideau de flammes : .* le traverse/.test(bt.log.join(' ')), 'un ennemi qui entre dans le rideau brûle (' + (w.u.dmg - dw) + ')');
  const m = U0(bt)[0]; bt.side = 0; bt.resetMoves(0); m.c = 6; m.r = 5; m.moves = 10; const dm = m.u.dmg; bt.moveUnit(m, 7, 5);
  ok(m.u.dmg === dm, 'nos unités passent dans nos flammes sans brûler');
}
// --- Mines de feu : invisibles pour l'ennemi, arrêtent et brûlent la première unité ennemie ; pas les nôtres
{
  const bt = battle([['HighMenSpearmen', 2, 6]], [['HighMenSwordsmen', 10, 6]]);
  ok(cast(bt, 'fire_mines', [6, 6]), 'Mines de feu posées');
  ok(Object.keys(bt.mines).length === 5 && bt.mines['6,6'] === 0, 'cinq mines en croix');
  ok(!bt.terrainNotes(6, 6, 1).some(n => /mine/i.test(n)) && bt.terrainNotes(6, 6, 0).some(n => /mine/i.test(n)), 'la mine se voit de son camp, pas de l\'autre');
  const e = U1(bt)[0]; bt.side = 1; bt.resetMoves(1); e.moves = 20; const d0 = e.u.dmg;
  bt.moveUnit(e, 4, 6);
  ok(e.c === 7 && e.r === 6 && e.moves === 0, 'l\'ennemi s\'arrête sur la première mine (' + e.c + ',' + e.r + ')');
  ok(e.u.dmg > d0 || /mine explose/.test(bt.log.join(' ')), 'la mine explose (' + (e.u.dmg - d0) + ' dégâts)');
  ok(bt.mines['7,6'] == null, 'la mine a sauté');
  const m = U0(bt)[0]; bt.side = 0; bt.resetMoves(0); m.c = 5; m.r = 5; m.moves = 10; bt.moveUnit(m, 6, 6);
  ok(m.c === 6 && m.r === 6 && bt.mines['6,6'] === 0, 'nos unités marchent sur nos mines sans les déclencher');
}
// --- Brume : tirs de moitié
{
  const bt = battle([['HighMenMagician', 2, 6]], [['HighMenSwordsmen', 9, 6]]);
  const a = U0(bt)[0], d = U1(bt)[0], s0 = bt.rangedStr(a, d);
  cast(bt, 'mist', [9, 6]);
  ok(bt.mistAt(9, 6) && bt.mistAt(8, 5) && bt.rangedStr(a, d) === Math.max(1, Math.floor(s0 / 2)), 'Brume : force du tir ' + s0 + ' → ' + bt.rangedStr(a, d));
}
// --- Téléportation : n'importe où, sauf dans une cité qu'entoure un Mur de feu ; l'unité garde son mouvement
{
  const bt = battle([['HighMenSwordsmen', 2, 2]], [['HighMenBowmen', 10, 10]]);
  const a = U0(bt)[0], m0 = a.moves;
  ok(cast(bt, 'teleport', a, [9, 10]) && a.c === 9 && a.r === 10 && a.moves === m0, 'Téléportation : l\'épéiste au contact des archers, mouvement intact');
  ok(!cast(bt, 'teleport', a, [10, 10]), 'pas sur une case occupée');
  // devant une cité ennemie à murailles
  const ec = Object.values(g.cities).find(c => c.owner === 1);
  ec.buildings.cityWalls = true;
  const bc = battle([['HighMenSwordsmen', 10, 11]], [['HighMenSpearmen', 5, 5]], { city: ec, keepTerrain: true });
  const s = U0(bc)[0];
  const inside = CombatSpells.teleportDests(bc, 0, s).filter(([c, r]) => bc.inCity(c, r));
  ok(inside.length > 0, 'sans Mur de feu : on se téléporte dans la cité (' + inside.length + ' cases)');
  ok(!inside.some(([c, r]) => bc.onRampart(c, r)), 'mais pas sur la muraille ennemie');
  bc.wallOfFire = true;
  ok(!CombatSpells.teleportDests(bc, 0, s).some(([c, r]) => bc.inCity(c, r)), 'Mur de feu : plus aucune case de la cité');
  ok(/Mur de feu/.test(CombatSpells.teleportWhy(bc, 0, s, 5, 6) || ''), 'la raison est dite : ' + CombatSpells.teleportWhy(bc, 0, s, 5, 6));
  const d = U1(bc)[0];
  ok(!CombatSpells.teleportWhy(bc, 1, d, 4, 4), 'le défenseur, lui, se téléporte dans sa cité');
}
// --- Rafale : 3 cases en ligne, arrêtée par une unité ou l'eau profonde
{
  const bt = battle([['HighMenBowmen', 5, 5]], [['HighMenSwordsmen', 6, 5], ['HighMenSpearmen', 11, 5]]);
  const e = U1(bt)[0];
  const L = CombatSpells.gustLandings(bt, e);
  const east = L.find(l => l.dir[0] === 1 && l.dir[1] === 0);
  ok(east && east.c === 9 && east.r === 5, 'Rafale vers +c : trois cases (' + (east && east.c) + ')');
  bt.river['8,7'] = true;
  const se = CombatSpells.gustLandings(bt, e).find(l => l.dir[0] === 1 && l.dir[1] === 1);
  ok(se && se.c === 7 && se.r === 6, 'arrêtée avant l\'eau profonde (' + (se && se.c + ',' + se.r) + ')');
  ok(cast(bt, 'gust', e, [9, 5]) && e.c === 9 && e.r === 5, 'l\'épéiste est repoussé : nos archers sont dégagés');
}
// --- Miroir magique : le sort revient contre le camp du lanceur (statistiquement)
{
  let back = 0, N = 60;
  for (let i = 0; i < N; i++) {
    const bt = battle([['HighMenSwordsmen', 2, 2], ['HighMenSpearmen', 2, 3]], [['HighMenSwordsmen', 9, 9]], { seed: 100 + i });
    const t = U1(bt)[0]; t.tempEnch.push('magic_mirror');
    cast(bt, 'shackles', t);
    if (/Miroir magique/.test(bt.log.join(' '))) back++;
  }
  ok(back > N * 0.2 && back < N * 0.6, 'Miroir magique : ' + back + ' renvois sur ' + N + ' (attendu ~40 %)');
}
// --- Clone : un double à côté, qui disparaît au premier coup
{
  const bt = battle([['HighMenSwordsmen', 5, 5]], [['HighMenSwordsmen', 10, 10]]);
  const a = U0(bt)[0];
  ok(cast(bt, 'clone', a) && U0(bt).length === 2, 'Clone : un double apparaît');
  const c = U0(bt).find(b => b.clone);
  ok(c && bt.dist(c, a) === 1 && c.temp && c.u.type === a.u.type, 'le double est à côté, du même type, temporaire');
  bt.takeDamage(c, 1, 'normal'); bt.checkDeath(c);
  ok(c.dead && /double/.test(bt.log.join(' ')), 'blessé, le double se dissipe');
  ok(!CombatSpells.validTargets(bt, 0, 'clone').includes(c), 'on ne copie pas un double');
}
// --- Chaîne d'éclairs : cinq frappes au plus, force décroissante, vos troupes comprises
{
  const bt = battle([['HighMenSpearmen', 6, 5]], [['HighMenSpearmen', 6, 6], ['HighMenSpearmen', 7, 7], ['HighMenSpearmen', 8, 8], ['HighMenSpearmen', 12, 0]]);
  const t = U1(bt)[0], path = CombatSpells.chainPath(bt, t, 0);
  ok(path.length === 4 && path.includes(U0(bt)[0]) && !path.includes(U1(bt)[3]), 'chemin : ' + path.map(b => b.side + '@' + b.c + ',' + b.r).join(' → ') + ' (le lointain épargné, le nôtre touché)');
  ok([0, 1, 2, 3, 4].map(CombatSpells.chainStrength).join(',') === '20,13,9,6,4', 'forces 20, 13, 9, 6, 4');
  cast(bt, 'chain_lightning', t);
  ok(/Chaîne d'éclairs : .*des vôtres/.test(bt.log.join(' ')), 'le journal dit qui a été touché, les vôtres compris');
}
// --- Bouclier de feu : qui frappe se brûle ; Vampirisme : qui frappe se nourrit
{
  let burn = 0, heal = 0;
  for (let i = 0; i < 20; i++) {
    const bt = battle([['HighMenSwordsmen', 5, 5]], [['HighMenSwordsmen', 6, 6]], { seed: 300 + i });
    const a = U0(bt)[0], d = U1(bt)[0]; d.tempEnch.push('fire_shield');
    bt.melee(a, d); if (/Bouclier de feu de/.test(bt.log.join(' '))) burn++;
    const bt2 = battle([['HighMenSwordsmen', 5, 5]], [['HighMenSpearmen', 6, 6]], { seed: 400 + i });
    const a2 = U0(bt2)[0], d2 = U1(bt2)[0]; a2.tempEnch.push('vampirism'); a2.u.dmg = 2;
    bt2.melee(a2, d2); if (/Vampirisme/.test(bt2.log.join(' '))) heal++;
  }
  ok(burn >= 10, 'Bouclier de feu : l\'assaillant se brûle (' + burn + ' / 20)');
  ok(heal >= 8, 'Vampirisme : l\'unité se soigne en frappant (' + heal + ' / 20)');
}
// --- Martyre : les blessures du héros passent à son voisin
{
  const bt = battle([['HighMenSwordsmen', 5, 5], ['HighMenSpearmen', 5, 6]], [['HighMenSwordsmen', 9, 9]]);
  const h = U0(bt)[0], n = U0(bt)[1]; h.tempEnch.push('martyr');
  const h0 = h.u.dmg, n0 = n.u.dmg;
  const t = bt.takeDamage(h, 3, 'normal', U1(bt)[0]);
  ok(h.u.dmg === h0 && n.u.dmg === n0 + 3 && t === 3, 'Martyre : 3 dégâts passent au voisin');
  bt.takeDamage(h, 2, 'irreversible');
  ok(h.u.dmg === h0 + 2, 'pas les dégâts irréversibles');
  n.c = 9; n.r = 1; bt.takeDamage(h, 1, 'normal');
  ok(h.u.dmg === h0 + 3, 'sans voisin, il les prend lui-même');
}
// --- Vengeance divine : 2 par figurine tuée
{
  const bt = battle([['HighMenSpearmen', 5, 5]], [['HighMenSwordsmen', 6, 6]]);
  const a = U0(bt)[0], d = U1(bt)[0];
  ok(!CombatSpells.validTargets(bt, 0, 'divine_vengeance').includes(d), 'Vengeance divine : rien contre qui n\'a rien tué');
  bt.takeDamage(a, 3, 'normal', d);
  ok(d.slainOf && d.slainOf[0] === 3, 'les figurines tuées sont comptées (' + (d.slainOf && d.slainOf[0]) + ')');
  const h0 = d.u.dmg; cast(bt, 'divine_vengeance', d);
  ok(d.u.dmg - h0 === Math.min(6, Units.stats(g, d.u).maxHp - h0), 'Vengeance divine : ' + (d.u.dmg - h0) + ' dégâts (2 × 3)');
}
// --- Sacrifice : une unité meurt, une autre tombée revient à sa place
{
  const bt = battle([['HighMenSwordsmen', 5, 5], ['HighMenSpearmen', 3, 3]], [['HighMenSwordsmen', 10, 10]]);
  const dead = U0(bt)[0], v = U0(bt)[1];
  bt.takeDamage(dead, 999, 'normal'); bt.checkDeath(dead);
  ok(CombatSpells.validTargets(bt, 0, 'sacrifice').includes(dead), 'Sacrifice : l\'épéiste tombé peut être relevé');
  const hv = bt.hp(v);
  ok(cast(bt, 'sacrifice', dead, v) && !dead.dead && v.dead && dead.c === 3 && dead.r === 3, 'les lanciers se sacrifient, les épéistes se relèvent à leur place');
  ok(bt.hp(dead) === Math.min(Units.stats(g, dead.u).maxHp, Math.floor(hv * 1.5)), 'avec une fois et demie leurs PV (' + bt.hp(dead) + ')');
  ok(!CombatSpells.sacrificeDead(bt, 0).includes(v), 'le sacrifié ne se relève pas');
}
// --- l'IA lance ces sorts : pour chacun, quelques combats automatiques où c'est le seul qu'elle connaisse
{
  const ids = Object.keys(DATA.spells).filter(id => DATA.spells[id].homm && DATA.spells[id].combat);
  const used = new Set(), keep = me.known.slice();
  for (const id of ids) {
    for (let i = 0; i < 8 && !used.has(id); i++) {
      const bt = battle([['HighMenSwordsmen', 3, 3], ['HighMenBowmen', 2, 4], ['HighMenCavalry', 4, 2], ['HighMenSpearmen', 3, 5], ['HighMenMagician', 1, 3]], [['OrcSwordsmen', 9, 9], ['OrcBowmen', 10, 10], ['OrcCavalry', 9, 11], ['OrcSpearmen', 11, 9], ['OrcShamans', 11, 11]], { seed: 500 + i * 7, keepTerrain: true });
      me.human = false; me.known = [id]; foe.mana = 0;
      bt.skillLeft = [200, 0];
      try { CombatAI.autoResolve(bt); } catch (e) { ok(false, 'combat automatique avec ' + id + ' : ' + e.stack.split('\n').slice(0, 3).join(' | ')); break; }
      for (const e of bt.events) if (e.type === 'spell' && e.spell === id) used.add(id);
    }
  }
  me.known = keep; me.human = true;
  const unused = ids.filter(id => !used.has(id));
  ok(used.size >= ids.length - 4, 'l\'IA lance ' + used.size + ' de ces ' + ids.length + ' sorts' + (unused.length ? ' (pas : ' + unused.join(', ') + ')' : ''));
}
// --- carte : Porte dimensionnelle et Portail urbain
{
  for (const u of Units.at(g, 0, at[0], at[1])) Units.remove(g, u);   // les troupes laissées par les combats d'essai
  me.human = false; known('dimension_door'); known('town_portal');
  const u1 = Units.create(g, 'HighMenSpearmen', 0, 0, at[0], at[1]), u2 = Units.create(g, 'HighMenSwordsmen', 0, 0, at[0], at[1]);
  me.mana = 10000; me.skillLeft = 10000;
  Intel.refresh(g, me);
  const dests = Spells.jumpDests(g, me, { plane: 0, x: at[0], y: at[1] });
  ok(dests.length > 5, 'Porte dimensionnelle : ' + dests.length + ' cases d\'arrivée');
  ok(dests.every(([x, y]) => World.dist(g.world, x, y, at[0], at[1]) <= 5), 'toutes à 5 cases au plus');
  const [tx, ty] = dests.find(([x, y]) => World.dist(g.world, x, y, at[0], at[1]) >= 3) || dests[0];
  const r = Spells.cast(g, me, 'dimension_door', { plane: 0, x: at[0], y: at[1], to: { x: tx, y: ty } });
  ok(r.ok && u1.x === tx && u1.y === ty && u2.x === tx && u1.moves === 0, 'la pile saute en (' + tx + ',' + ty + ') et s\'arrête pour le tour');
  const bad = Spells.validate(g, me, 'dimension_door', { plane: 0, x: tx, y: ty, to: { x: World.wx(g.world, tx + 9), y: ty } });
  ok(!bad.ok, 'trop loin : refusé (' + bad.why + ')');
  const r2 = Spells.cast(g, me, 'town_portal', { plane: 0, x: tx, y: ty, city: fc.id });
  ok(r2.ok && u1.x === fc.x && u1.y === fc.y && u2.x === fc.x, 'Portail urbain : la pile rentre à ' + fc.name);
  ok(!Spells.validate(g, me, 'town_portal', { plane: 0, x: fc.x, y: fc.y, city: fc.id }).ok, 'déjà dans la cité : refusé');
  me.human = true;
}
// --- l'IA rappelle une armée lointaine au secours de sa capitale menacée (Portail urbain)
{
  const { AI, Diplomacy } = E;
  const ai = g.players[1], cap = g.cities[ai.fortress];
  Game.contact(g, 0, 1); Diplomacy.setState(g, 0, 1, 'war');
  for (const u of Units.at(g, cap.plane, cap.x, cap.y)) if (u.owner === ai.id) Units.remove(g, u);
  // une armée de l'IA loin de sa capitale, une armée ennemie à deux cases de celle-ci
  const land = (cx, cy, dmin, dmax) => { for (let d = dmin; d <= dmax; d++) for (let dx = -d; dx <= d; dx++) for (const dy of [-d, d]) { const x = World.wx(g.world, cx + dx), y = cy + dy; if (World.inY(g.world, y) && !World.isWaterAt(g.world, cap.plane, x, y) && !Cities.at(g, cap.plane, x, y) && !Units.at(g, cap.plane, x, y).length && E.Move.canStand(g, [], E.Move.groupInfo(g, []), cap.plane, x, y, ai.id)) return [x, y]; } return null; };
  const far = land(cap.x, cap.y, 7, 14), near = land(cap.x, cap.y, 2, 2);
  const army = ['OrcSwordsmen', 'OrcSwordsmen', 'OrcCavalry', 'OrcSpearmen'].map(t => Units.create(g, t, ai.id, cap.plane, far[0], far[1]));
  for (let i = 0; i < 4; i++) Units.create(g, 'HighMenSwordsmen', 0, cap.plane, near[0], near[1]);
  if (!ai.known.includes('town_portal')) ai.known.push('town_portal');
  ai.mana = 2000; ai.skillLeft = 2000; ai.casting = null; ai.human = false;
  Intel.refresh(g, ai);
  const thr = AI.threatNear(g, ai, cap);
  AI.manageMagic(g, ai);
  ok(thr > 0 && army.every(u => u.x === cap.x && u.y === cap.y), 'l\'IA (menace ' + Math.round(thr) + ') rappelle son armée à ' + cap.name + ' par le Portail urbain' + (army[0].x === cap.x ? '' : ' (restée en ' + army[0].x + ',' + army[0].y + ')'));
  const r = AI.jumpPlan(g, Object.assign({}, ai, { aiExp: { no_jumps: 1 } }), 'town_portal', 100);
  ok(!AI.feat(Object.assign({}, ai, { aiExp: { no_jumps: 1 } }), 'jumps', 0), 'le banc peut couper ces sorts à l\'IA (no_jumps)');
  void r;
}
