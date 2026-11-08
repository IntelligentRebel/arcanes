'use strict';
// Une partie IA contre IA observée depuis la place 0 : partagé par tests/paired.js et tests/nuit.js.
// job : { seed, level, exp, opp, turns, checkpoints?, oppmix?, oppexp?, boost?, subjexp? }

// l'empire : le score sans l'armée ni la victoire (cités, habitants, puissance, sorts), pour voir ce que pèse la seule accumulation de troupes
function empire(E, game, pl) {
  if (!pl.alive) return 0;
  const cities = E.Cities.ofPlayer(game, pl.id);
  return Math.round(cities.length * 10 + E.U.sum(cities, c => E.Cities.citizens(c)) + E.Magic.power(game, pl) * 1.5 + pl.known.length * 2);
}
function score(E, game, pl) {
  if (!pl.alive) return 0;
  const cities = E.Cities.ofPlayer(game, pl.id);
  const army = E.U.sum(Object.values(game.units).filter(u => u.owner === pl.id && !u.riteDemon), u => E.Units.strength(game, u));
  return Math.round(cities.length * 10 + E.U.sum(cities, c => E.Cities.citizens(c)) + E.Magic.power(game, pl) * 1.5 + pl.known.length * 2 + army / 30 + (game.winner === pl.id ? 500 : 0));
}

// contrôles d'intégrité (chasse aux bugs, tous les 10 tours) : ce qui ne doit jamais arriver ; acc compte chaque anomalie par type
// et garde un exemple de chaque
function integrity(E, game, acc) {
  const bad = (k, ex) => { acc.n[k] = (acc.n[k] || 0) + 1; if (!acc.ex[k]) acc.ex[k] = 't' + game.turn + ' ' + ex; };
  try {
    const w = game.world, num = v => typeof v === 'number' && Number.isFinite(v);
    for (const p of game.players) {
      if (!num(p.gold)) bad('or non numérique', p.name + ' ' + p.gold);
      if (!num(p.mana)) bad('mana non numérique', p.name + ' ' + p.mana); else if (p.alive && p.mana < 0) bad('mana négatif', p.name + ' ' + p.mana);
      if (p.casting && !E.DATA.spells[p.casting.id]) bad('incantation inconnue', p.name + ' ' + p.casting.id);
    }
    const water = {};
    for (const [k, u] of Object.entries(game.units)) {
      if (String(u.id) !== k) { bad('identifiant d\'unité incohérent', k + '≠' + u.id); continue; }
      if (!E.DATA.units[u.type]) { bad('type d\'unité inconnu', u.type); continue; }
      if (u.owner >= 0 && (!game.players[u.owner] || !game.players[u.owner].alive)) bad('unité d\'un sorcier éliminé', u.type + ' de ' + u.owner);
      if (!(u.plane === 0 || u.plane === 1) || !num(u.x) || !num(u.y) || u.y < 0 || u.y >= w.h || u.x < 0 || u.x >= w.w) { bad('unité hors du monde', u.type + ' ' + u.plane + ':' + u.x + ',' + u.y); continue; }
      if (!num(u.dmg) || u.dmg < 0) bad('dégâts invalides', u.type + ' ' + u.dmg);
      else if (E.Units.health(game, u) <= 0) bad('unité morte restée sur la carte', u.type + ' ' + u.plane + ':' + u.x + ',' + u.y);
      if (u.hero && !u.hero.name) bad('héros sans fiche', u.type);
      if (E.World.isWaterAt(w, u.plane, u.x, u.y) && !E.Cities.at(game, u.plane, u.x, u.y)) { const key = u.owner + '|' + u.plane + ',' + u.x + ',' + u.y; (water[key] = water[key] || []).push(u); }
    }
    // sur l'eau hors d'une cité : assez de place à bord pour ceux qui ne volent ni ne nagent
    for (const [key, us] of Object.entries(water)) {
      // la règle du jeu d'abord : Marche des vents, Navire volant, navires assez grands (Move.canStand, comme la noyade)
      const [pid0, pos] = key.split('|'), [pl0, x0, y0] = pos.split(',').map(Number);
      if (E.Move.canStand(game, us, E.Move.groupInfo(game, us), pl0, x0, y0, +pid0)) continue;
      let cap = 0, land = 0;
      for (const u of us) { const st = E.Units.stats(game, u); if (st.sailing) cap += E.Move.capacity(u); else if (!st.flying && !st.swimming && !(st.ab && (st.ab.waterWalking || st.ab.nonCorporeal))) land++; }
      if (land > cap) bad('troupes sur l\'eau sans navire', key + ' : ' + land + ' à terre pour ' + cap + ' places (' + us.map(u => u.type).join(', ') + ')');
    }
    const seen = {};
    for (const c of Object.values(game.cities)) {
      if (!num(c.pop) || c.pop <= 0) bad('population invalide', c.name + ' ' + c.pop);
      if (c.owner >= 0 && (!game.players[c.owner] || !game.players[c.owner].alive)) bad('cité d\'un sorcier éliminé', c.name);
      if (E.World.isWaterAt(w, c.plane, c.x, c.y)) bad('cité sur l\'eau', c.name);
      const k = c.plane + ',' + c.x + ',' + c.y; if (seen[k]) bad('deux cités sur la même case', c.name + ' et ' + seen[k]); seen[k] = c.name;
      for (const e of c.ench || []) if (!E.DATA.spells[e.spell]) bad('enchantement de cité inconnu', c.name + ' ' + e.spell);
    }
  } catch (e) { bad('contrôle en erreur', String(e && e.message || e).slice(0, 120)); }
}

function bookGift(E, game, B, p0) {
  const fs = game.book.frags.slice().sort((a, b) => (a.site != null && !a.taken ? 0 : 1) - (b.site != null && !b.taken ? 0 : 1));
  for (const f of fs) {
    if (B.held(game, p0.id) >= B.NEED) break;
    if (B.fragOwner(game, f) === p0.id) continue;
    if (f.site != null && !f.taken) { B.onLoot(game, game.sites[f.site], p0.id, []); continue; }
    const c = B.store(game, p0.id, game.cities[p0.fortress] || { plane: p0.plane, x: 0, y: 0 }); if (c == null) break;
    f.city = c; f.ground = null; B.read(game, f, p0.id);
  }
  game.bookGiftTurn = game.turn;
}

function bossOf(E, game, plane0, sc) {
  const op = 1 - plane0, cs = Object.values(game.cities).filter(c => c.plane === op), by = {};
  for (const c of cs) by[c.owner] = (by[c.owner] || 0) + 1;
  const wiz = Object.keys(by).map(Number).filter(o => o > 0 && game.players[o] && game.players[o].alive);
  const top = wiz.length ? wiz.reduce((a, b) => by[b] > by[a] ? b : a) : null;
  // son armée, face à la plus forte IA du plan du sorcier observé (née sur ce plan) et face au sorcier observé
  const army = pid => E.U.sum(Object.values(game.units).filter(u => u.owner === pid && !u.riteDemon), u => E.Units.strength(game, u));
  const home = p => { const c = game.cities[p.fortress]; return c ? c.plane : (p.plane || 0); };
  const near = game.players.filter(p => p.alive && p.id !== 0 && home(p) === plane0).map(p => army(p.id));
  const aTop = top == null ? 0 : army(top), aNear = near.length ? Math.max(...near) : 0, aObs = army(0);
  return { cities: cs.length, neutral: by[-1] || 0, top: top == null ? 0 : by[top], share: top == null || !cs.length ? 0 : +(by[top] / cs.length).toFixed(3),
    first: top != null && sc.indexOf(Math.max(...sc)) === top, vsObs: top == null || !sc[0] ? null : +(sc[top] / Math.max(1, sc[0])).toFixed(2),
    id: top, armyVsNear: top == null ? null : +(aTop / Math.max(1, aNear)).toFixed(2), armyVsObs: top == null ? null : +(aTop / Math.max(1, aObs)).toFixed(2),
    over: top == null ? 0 : E.Cities.ofPlayer(game, top).filter(c => c.plane === plane0).length };
}

async function playOne(E, job) {
  const t0 = Date.now();
  // subjexp : l'expérience ne s'applique qu'au sorcier observé (sinon à toutes les IA)
  E.AI.EXP = job.subjexp ? {} : job.exp || {};
  const w = E.DATA.wizards[(job.seed * 3) % E.DATA.wizards.length];
  // oppmix : des adversaires de niveaux mêlés, qui tournent d'une carte à l'autre
  const mix = job.oppmix ? job.oppmix.split(',') : null;
  const levels = mix ? [0, 1, 2].map(i => mix[(i + job.seed) % mix.length]) : [job.opp, job.opp, job.opp];
  const game = E.Game.newGame({ seed: job.seed, mapW: 60, mapH: 40, landSize: 'medium', opponents: 3, otherPlane: job.otherPlane != null ? job.otherPlane : undefined, difficulty: levels[0], crisis: 'normal', finale: job.finale || 'random', aiLevels: levels, noRite: !!job.noRite, rite: job.rite || null, bookGuard: job.bookGuard || null, noWonders: !!job.noWonders, flatOverstretch: !!job.flatOverstretch, propOverstretch: !!job.propOverstretch,
    human: { name: w.name, portrait: w.portrait, books: w.books, retorts: w.retorts, race: job.race || 'highmen' } });
  const p0 = game.players[0]; p0.human = false; p0.aiLevel = job.level; p0.aiPersonality = 'balanced';
  const plane0 = (game.cities[p0.fortress] || { plane: 0 }).plane;   // le plan de départ du sorcier observé ; l'autre est celui du « boss final »
  if (job.subjexp) p0.aiExp = job.exp || {};
  // oppexp : les adversaires jouent sans cette capacité (version figée), quel que soit le sujet
  // le sorcier observé tient lieu de joueur pour ce qui ne vise que le joueur (la bourse de combat)
  if (job.benchHuman) p0.benchHuman = true;
  if (job.oppexp) for (const o of game.players) if (o !== p0 && !o.human) o.aiExp = typeof job.oppexp === 'string' ? JSON.parse(job.oppexp) : job.oppexp;
  const legends = game.players.map(() => 0); const oq = E.Heroes.completeQuest; E.Heroes.completeQuest = function (g, u) { if (legends[u.owner] != null && !(u.hero.quest || {}).done) legends[u.owner]++; return oq.apply(this, arguments); };
  // boost : le sorcier observé part très en avance (pour vérifier que les autres se liguent contre le meneur)
  if (job.boost) { p0.gold += 1500; p0.mana += 500; const fc = game.cities[p0.fortress]; const race = E.DATA.races[fc.race];
    for (const t of race.units.filter(t => E.DATA.units[t].abilities.createOutpost).concat(race.units.filter(t => { const d = E.DATA.units[t]; return d.melee >= 3 && !d.sailing; }).slice(0, 1))) for (let k = 0; k < 3; k++) E.Units.create(game, t, 0, fc.plane, fc.x, fc.y); }
  let caps = 0, lost = 0, deathTurn = null, book3 = null;
  const Bk = E.Book || (typeof Book !== 'undefined' ? Book : null);   // le Livre de légende : premier tour où un sorcier tient trois fragments
  const oc = E.Game.captureCity; E.Game.captureCity = async function (g, city, pid) { if (pid === 0) caps++; else if (city.owner === 0) lost++; return oc.apply(this, arguments); };
  const marks = {}, cps = job.checkpoints || [150], inv = { n: {}, ex: {} };
  const wonder = { lore: null, built: null, all: 0 }, wseen = new Set(); let govTurn = null;   // ouvrages : quand le sujet achève sa recherche et le bâtit ; combien en tout
  for (let t = 0; t < job.turns && !game.over; t++) {
    await E.Turn.endTurn(game);
    if (deathTurn == null && !p0.alive) deathTurn = game.turn;
    if (wonder.lore == null && (p0.lore || []).length) { wonder.lore = game.turn; const sp = E.DATA.spells[p0.lore[0]]; wonder.loreRace = sp && sp.params ? sp.params.race : null; }
    if (wonder.built == null && p0.wonders && Object.keys(p0.wonders).length) wonder.built = game.turn;
    if (govTurn == null && Object.values(game.cities).some(c => c.owner === 0 && c.buildings.governorsPalace)) govTurn = game.turn;   // palais du gouverneur du sujet (v0.31.15)
    for (const p of game.players) for (const r in p.wonders || {}) if (!wseen.has(p.id + r)) { wseen.add(p.id + r); wonder.all++; }
    if (book3 == null && Bk && game.book && game.players.some(p => p.alive && Bk.held(game, p.id) >= Bk.NEED)) book3 = game.turn;
    // banc : au tour dit, le sorcier observé reçoit trois fragments (ceux des repaires d'abord, sinon pris là où ils sont), pour mesurer sa quête
    if (job.bookGift && game.turn === job.bookGift && Bk && game.book && p0.alive) bookGift(E, game, Bk, p0);
    if (job.onTurn) job.onTurn(game.turn);
    if ((t + 1) % 10 === 0) integrity(E, game, inv);
    if (cps.includes(t + 1) && t + 1 < job.turns) { const s = game.players.map(pl => score(E, game, pl)); marks[t + 1] = { score: s[0], rank: 1 + s.filter((v, i) => i > 0 && v > s[0]).length, lead: s.indexOf(Math.max(...s)), gap: Math.max(...s) / Math.max(1, s.slice().sort((a, b) => b - a)[1]), boss: job.bossPoints ? bossOf(E, game, plane0, s) : null }; }
  }
  // une partie finie avant un point de passage garde son état final pour les suivants
  for (const c of cps) if (c < job.turns && !marks[c]) { const s = game.players.map(pl => score(E, game, pl)); marks[c] = { score: s[0], rank: 1 + s.filter((v, i) => i > 0 && v > s[0]).length }; }
  const sc = game.players.map(pl => score(E, game, pl));
  const rank = 1 + sc.filter((v, i) => i > 0 && v > sc[0]).length;
  const res = { seed: job.seed, level: job.level, label: job.label, score: sc[0], rank, empire: empire(E, game, p0), gold: p0.alive ? p0.gold : 0, cities: E.Cities.ofPlayer(game, 0).length, alive: p0.alive, power: E.Magic.power(game, p0), known: p0.known.length,
    legends: legends[0], legendsAll: legends.reduce((a, b) => a + b, 0), deathTurn, caps, lost, tailored: p0._tailorN || 0, winner: game.winner == null ? null : game.winner,
    race: job.race || 'highmen', wonder, turnsPlayed: game.turn, secs: Math.round((Date.now() - t0) / 1000), mem: typeof process !== 'undefined' && process.memoryUsage ? Math.round(process.memoryUsage().rss / 1e6) : null, version: E.GAME_VERSION || null };
  // l'agitation à la fin : part des citoyens en rébellion (tout le monde, le sujet), et la taille du plus grand empire
  { let reb = 0, cit = 0, reb0 = 0, cit0 = 0; const nc = {};
    for (const id in game.cities) { const c = game.cities[id]; if (c.owner < 0 || !game.players[c.owner] || !game.players[c.owner].alive) continue; const e = E.Cities.econ(game, c);
      reb += e.rebels || 0; cit += e.citizens || 0; nc[c.owner] = (nc[c.owner] || 0) + 1; if (c.owner === 0) { reb0 += e.rebels || 0; cit0 += e.citizens || 0; } }
    res.rebels = cit ? +(reb / cit).toFixed(3) : 0; res.rebels0 = cit0 ? +(reb0 / cit0).toFixed(3) : 0; res.maxCities = Math.max(0, ...Object.values(nc)); }
  if (marks[150]) { res.score150 = marks[150].score; res.rank150 = marks[150].rank; }
  for (const c in marks) { res['score' + c] = marks[c].score; res['rank' + c] = marks[c].rank; }
  // le meneur du tour 100 l'est-il encore à la fin, et de combien (le pacte contre le meneur se mesure ainsi)
  if (marks[100]) { const L = marks[100].lead, s2 = sc.slice().sort((a, b) => b - a); res.lead100 = L; res.lead100Kept = sc.indexOf(Math.max(...sc)) === L; res.gap100 = +marks[100].gap.toFixed(2); res.gapEnd = +(s2[0] / Math.max(1, s2[1])).toFixed(2); }
  // (v0.31.32) de même au tour 200, quand les crises de fin peuvent commencer : le meneur l'est-il encore, et de combien
  if (marks[200] && marks[200].gap != null) { const L = marks[200].lead, s2 = sc.slice().sort((a, b) => b - a); res.lead200 = L; res.lead200Kept = sc.indexOf(Math.max(...sc)) === L ? 1 : 0; res.gap200 = +marks[200].gap.toFixed(2); res.gapEnd = +(s2[0] / Math.max(1, s2[1])).toFixed(2); res.leadScore200 = sc[L] || 0; }
  integrity(E, game, inv);
  if (Object.keys(inv.n).length) { res.inv = inv.n; res.invEx = inv.ex; }
  if (govTurn != null) res.governor = govTurn;
  if (p0._passN) { res.pass = p0._passN; res.passRoad = p0._passRoad || 0; }   // (essai engineers) cols repérés, chantiers de route en montagne
  if (game.deadFix) { res.deadFix = game.deadFix; res.deadEx = game.deadEx; }   // unités à 0 PV retirées en fin de tour (filet)
  if (game.strandFix) { res.stranded = game.strandFix; res.strandedEx = game.strandEx; }   // troupes repêchées en mer (Game.rescueStranded)
  // le plan d'en face à la fin (et aux points de passage) : le plus fort de ses sorciers y tient-il l'essentiel des cités, et mène-t-il la partie ?
  res.boss = bossOf(E, game, plane0, sc);
  // le Sort de Maîtrise : quand le plus fort du plan d'en face l'a étudié, lancé ; qui a gagné la partie, et comment
  { const b = res.boss.id != null ? game.players[res.boss.id] : null, n = (b && b.somNews) || {};
    res.boss.somStudy = n.research || null; res.boss.somCast = n.cast || null;
    res.boss.won = game.winner != null && game.winner === res.boss.id; res.overWhy = game.overWhy || null;
    const st = game.players.map(p => (p.somNews || {}).research).filter(x => x); res.somFirst = st.length ? Math.min(...st) : null; }
  for (const c in marks) if (marks[c].boss) (res.bossAt = res.bossAt || {})[c] = marks[c].boss;
  // les terres corrompues autour des cités du sorcier observé (la purification ne sert que s'il y en a)
  res.corrupt = E.U.sum(E.Cities.ofPlayer(game, 0), c => E.World.catchment(game.world, c.x, c.y).filter(([x, y]) => E.World.get(game.world, c.plane, 'corrupt', x, y)).length);
  if (game.riteStats) res.rite = Object.assign({}, game.riteStats);
  // la crise de fin (v0.31.30) : laquelle, contre qui, quand, comment elle a fini
  { const f = game.finale; if (f && f.kind) res.finale = { kind: f.kind, state: f.state, omen: f.omen || null, start: f.start || null, end: f.end || null, by: f.by != null ? f.by : null, target: f.target, subj: f.target === 0, force: f.force || null, waves: f.waves || 0, eaten: f.eaten || 0, seceded: f.seceded || 0, clues: f.clues || 0, rises: f.rises || 0,
    faded: !!f.faded, tFirst: f.target != null && sc.indexOf(Math.max(...sc)) === f.target ? 1 : 0, tRank: f.target != null ? 1 + sc.filter((v, i) => i !== f.target && v > sc[f.target]).length : null }; }
  // un démon encore debout à la fin : ce qu'il a fait compte aussi (v0.31.26)
  { const r = game.rite; if (res.rite && r && r.phase === 'demon' && r.summoned != null) { const rs = res.rite; rs.escorts = (rs.escorts || 0) + (r.maxEsc || 0); rs.demonCaps = (rs.demonCaps || 0) + (r.caps || 0); rs.life = (rs.life || 0) + game.turn - r.summoned; } }
  // le Livre de légende : fragments trouvés (lus par quelqu'un), ce qu'en tient le sujet, sceau, prise, artefacts
  const B = E.Book || (typeof Book !== 'undefined' ? Book : null), b = game.book;
  if (B && b) res.book = { found: b.frags.filter(f => f.read.length).length, held0: B.held(game, 0), read0: B.readBy(game, 0).length,
    maxHeld: Math.max(...game.players.map(pl => B.held(game, pl.id))), revealed: b.revealedTurn || null, claimed: b.claimedTurn || null, by: b.claimed ? b.claimedBy : null, artifacts: (b.artifacts || []).length, gift: game.bookGiftTurn || null, revBy: b.revealed ? b.revealedBy : null };
  // celui qui tient trois fragments (ou plus) : où en est sa recherche
  if (B && b && !b.claimed) {
    const top = game.players.filter(p => p.alive && B.held(game, p.id) >= B.NEED).sort((x, y) => B.held(game, y.id) - B.held(game, x.id))[0];
    if (top) { const st = top.aiBook || {}; res.book.three = book3;
      res.book.top = { pid: top.id, level: top.aiLevel, held: B.held(game, top.id), read: B.readBy(game, top.id).length, cands: B.candidates(game, top.id).length, phase: st.phase || null, seen: (st.seen || []).length,
        searcher: st.searcher != null && !!game.units[st.searcher], samePlane: top.plane === b.plane, towers: game.sites.filter(t => t.type === 'tower' && t.cleared && t.plane === top.plane).length, pause: st.pause || 0, reach: st.reach != null ? +st.reach.toFixed(2) : null }; }
  }
  return res;
}

// « hardcore{"no_x":1}@hard » → niveau, expérience, adversaires propres à la variante
function parseVariant(l) {
  const m = l.match(/^(\w+)(\{.*\})?(@(\w+))?$/);
  if (!m) throw new Error('variante illisible : ' + l);
  return { level: m[1], exp: m[2] ? JSON.parse(m[2]) : {}, opp: m[4] || null, label: l };
}

if (typeof module !== 'undefined') module.exports = { score, empire, playOne, parseVariant };
