// v0.31.36 : les paliers des crises de fin (selon l'avance du meneur) ; le sort Ouvrir une faille ; la croisade (Difficile et plus) :
// le sorcier de l'autre plan, derrière le meneur, le prend pour cible, apprend et lance Ouvrir une faille, et passe ses troupes.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Cities, Finale, Crisis, Magic, Spells, Veil, AI, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };

function mk(seed, opts = {}) {
  const g = Game.newGame(Object.assign({ seed, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hard', crisis: 'off', noRite: true,
    human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } }, opts));
  return g;
}

// ---------- 1. paliers ----------
{
  const g = mk(1, { finale: 'random' }), f = g.finale;
  const fake = vals => { Crisis.score = (game, p) => vals[p.id] || 0; };
  const keep = Crisis.score;
  const run = vals => { fake(vals); f.state = 'watch'; f.kind = null; f.streak = 0; f.tier = null; g.turn = 210; for (let i = 0; i < 6 && f.state === 'watch'; i++) { Finale.watch(g); } return f; };
  let r = run({ 0: 160, 1: 100, 2: 90, 3: 80 });
  ok(r.state === 'omen' && r.tier === 1 && Finale.TIERS[1].includes(r.kind), 'palier 1 (1,6 fois le deuxième) : ' + r.kind + ', avance ' + r.leadAt);
  r = run({ 0: 220, 1: 100, 2: 90, 3: 80 });
  ok(r.tier === 2 && Finale.TIERS[2].includes(r.kind), 'palier 2 (2,2 fois, moins que tous les autres réunis) : ' + r.kind);
  r = run({ 0: 300, 1: 100, 2: 90, 3: 80 });
  ok(r.tier === 3 && r.kind === 'archmage', 'palier 3 (3 fois, plus que tous les autres réunis) : l\'Archimage');
  const seen = new Set(); for (let s = 0; s < 30; s++) { g.rng.seed && 0; seen.add(run({ 0: 160, 1: 100, 2: 90, 3: 80 }).kind); }
  ok([...seen].every(k => Finale.TIERS[1].includes(k)) && seen.size >= 2, 'palier 1 : tirage parmi ' + [...seen].join(', '));
  f.mode = 'lich'; r = run({ 0: 300, 1: 100, 2: 90, 3: 80 });
  ok(r.kind === 'lich', 'une crise imposée reste imposée');
  Crisis.score = keep;
}

// ---------- 2. Ouvrir une faille ----------
{
  const g = mk(2), pl = g.players[0], w = g.world;
  // (0.31.37) le sort ne s'offre qu'aux sorciers d'un plan écrasé par le meneur de l'autre
  ok(g.players.every(p => !p.researchPool.includes('open_rift') && !p.researchOptions.includes('open_rift')), 'au départ, personne ne peut le chercher');
  const keep = Crisis.score, other = g.players.find(p => p.plane !== pl.plane), mate = g.players.find(p => p !== pl && p.plane === pl.plane);
  g.turn = 60; Crisis.score = (game, p) => p === pl ? 140 : 100; E.Magic._gate = new WeakMap();
  for (const p of g.players) E.Magic.gateOptions(g, p);
  ok(!other.researchOptions.includes('open_rift'), 'meneur à 1,4 fois l\'autre plan : rien');
  g.turn++; Crisis.score = (game, p) => p === pl ? 160 : 100;
  const nOpt = other.researchOptions.length;
  for (const p of g.players) E.Magic.gateOptions(g, p);
  ok(other.researchOptions.includes('open_rift') && other.researchOptions.length === nOpt + 1, 'à 1,6 fois : offert à l\'autre plan, en plus des autres recherches');
  ok(!pl.researchOptions.includes('open_rift') && !(mate && mate.researchOptions.includes('open_rift')), 'jamais au meneur ni à son plan');
  g.turn++; Crisis.score = keep; E.Magic.refreshResearchOptions(g, other);
  ok(other.researchOptions.includes('open_rift'), 'il le garde ensuite');
  ok(!E.Diplomacy.canLearn(pl, 'open_rift') && E.Diplomacy.canLearn(other, 'open_rift'), 'le meneur ne peut pas l\'obtenir par échange');
  pl.known.push('open_rift'); pl.mana = 1000;
  const c = Cities.ofPlayer(g, pl.id)[0];
  // une case de terre libre à 3 cases de la cité, terre sur les deux plans
  let spot = null;
  for (let dy = -4; dy <= 4 && !spot; dy++) for (let dx = -4; dx <= 4 && !spot; dx++) {
    const x = World.wx(w, c.x + dx), y = c.y + dy;
    if (World.dist(w, c.x, c.y, x, y) >= 3 && !Veil.riftSpotWhy(g, x, y) && Move_ok(g, x, y)) spot = { plane: pl.plane, x, y };
  }
  function Move_ok(g, x, y) { return !Units.at(g, pl.plane, x, y).length; }
  ok(!!spot, 'une case possible');
  ok(!Spells.validate(g, pl, 'open_rift', spot).ok, 'sans troupes sur la case : refusé (' + Spells.validate(g, pl, 'open_rift', spot).why + ')');
  const u = Units.create(g, 'HighMenSpearmen', pl.id, spot.plane, spot.x, spot.y);
  pl.explored[spot.plane][spot.y * w.w + spot.x] = 1;
  ok(Spells.validate(g, pl, 'open_rift', spot).ok, 'avec ses troupes : possible');
  const water = (() => { for (let y = 2; y < w.h - 2; y++) for (let x = 0; x < w.w; x++) if (World.isWaterAt(w, 0, x, y)) return { x, y }; })();
  ok(Veil.riftSpotWhy(g, water.x, water.y) != null, 'pas sur l\'eau');
  const v0 = g.veil, n0 = g.sites.length;
  const r = Spells.apply(g, pl, 'open_rift', spot);
  const a = g.sites[n0], b = g.sites[n0 + 1];
  ok(a && b && a.type === 'rift' && b.type === 'rift' && a.pair === b.id && a.plane !== b.plane && a.x === b.x && a.by === pl.id, 'une faille sur chaque plan, reliées');
  ok(g.veil < v0, 'le voile s\'use (' + v0 + ' → ' + g.veil + ')');
  ok(!Game.planeShiftBlock(g, [u], u.plane, u.x, u.y), 'les troupes peuvent passer');
  const sh = Game.planeShift(g, [u.id]);
  ok(sh.ok && u.plane !== spot.plane, 'elles passent sur l\'autre plan');
  ok(!Spells.validate(g, pl, 'open_rift', spot).ok, 'une seconde faille sur la même case : refusé');
}

// ---------- 3. la croisade ----------
{
  const g = mk(6), w = g.world;
  const ais = g.players.filter(p => !p.human);
  const other = g.players.find(p => p.plane !== g.players[0].plane);
  ok(!!other, 'un sorcier né sur l\'autre plan que le joueur');
  g.turn = 100;
  const keep = Crisis.score; Crisis.score = (game, p) => p.id === 0 ? 300 : 100;
  other.aiExp = { no_crusade: true };
  ok(AI.crusadeTarget(g, other) === null, 'croisade coupée (no_crusade) : rien');
  other.aiExp = {}; AI._crus = new WeakMap();
  ok(AI.crusadeTarget(g, other) === g.players[0], 'le meneur de l\'autre plan est la cible');
  g.turn = 50; AI._crus = new WeakMap(); ok(AI.crusadeTarget(g, other) === null, 'pas avant le tour 60'); g.turn = 100; AI._crus = new WeakMap();
  other.aiLevel = 'normal'; ok(AI.crusadeTarget(g, other) === null, 'pas en Normal'); other.aiLevel = 'hard'; AI._crus = new WeakMap();
  const same = g.players.find(p => p !== g.players[0] && p.plane === g.players[0].plane);
  if (same) { ok(AI.crusadeTarget(g, same) === null, 'un sorcier du même plan que le meneur : pas de croisade'); }
  // la recherche
  other.researchOptions = ['open_rift'].concat(other.researchOptions.filter(id => id !== 'open_rift')).slice(0, 8);
  ok(AI.pickResearch(g, other) === 'open_rift', 'il cherche Ouvrir une faille');
  // le lancement : une armée de quatre soldats sur ses terres
  other.known.push('open_rift'); other.mana = 2000;
  const c = Cities.ofPlayer(g, other.id)[0]; Cities.updateTerritory(g);
  let spot = null;
  for (let y = 2; y < w.h - 2 && !spot; y++) for (let x = 0; x < w.w && !spot; x++) {
    if (!Veil.riftSpotWhy(g, x, y) && World.get(w, other.plane, 'owner', x, y) === other.id && !Units.at(g, other.plane, x, y).length) spot = { x, y };
  }
  ok(!!spot, 'une case sur ses terres');
  const ty = Object.values(DATA.units).find(t => t.race === other.race && t.cost && t.melee >= 3 && !t.settler && !t.engineer) || DATA.units.HighMenSpearmen;
  for (let i = 0; i < 4; i++) Units.create(g, ty.id, other.id, other.plane, spot.x, spot.y);
  other.explored[other.plane][spot.y * w.w + spot.x] = 1;
  // les tours dégagées ne comptent pas ici : on les efface
  for (const s of g.sites) if (s.type === 'tower') s.cleared = false;
  ok(!AI.crossingNear(g, other), 'aucun passage utile');
  const t = AI.riftTileFor(g, other);
  ok(t && t.x === spot.x && t.y === spot.y, 'la faille s\'ouvrirait sous son armée');
  Crisis.score = keep;
}

// ---------- 4. (0.31.37) une sauvegarde d'avant : le sort retiré des recherches de qui ne l'a ni appris ni entamé ----------
{
  const g = mk(7), a = g.players[1], b = g.players[2], c = g.players[3];
  for (const p of [a, b, c]) { p.researchPool.push('open_rift'); p.researchOptions.push('open_rift'); }
  b.researching = 'open_rift'; c.known.push('open_rift'); c.researchPool = c.researchPool.filter(id => id !== 'open_rift'); c.researchOptions = c.researchOptions.filter(id => id !== 'open_rift');
  Game.upgrade(g);
  ok(!a.researchPool.includes('open_rift') && !a.researchOptions.includes('open_rift'), 'retiré à qui ne l\'a pas entamé');
  ok(b.researchOptions.includes('open_rift') && b.researching === 'open_rift', 'gardé par qui le cherche déjà');
  ok(c.known.includes('open_rift'), 'gardé par qui le connaît');
}
