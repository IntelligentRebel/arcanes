'use strict';
// Banc des sorts : chacun des sorts du jeu, lancé pour de vrai, sur la carte puis en combat (en rase campagne, en siège,
// en défense de sa cité), sur des cibles valables et invalides. Pour chaque lancer :
//   - aucune erreur ;
//   - une cible valable est acceptée, une cible invalide refusée sans dépense ;
//   - le mana (et en combat la compétence) est débité de ce qu'annonce le jeu ;
//   - l'effet se voit : l'état du monde change, ou le journal explique pourquoi rien (résiste, sans effet) ;
//   - le lanceur a une ligne au journal ; un rival dont quelque chose a changé en a une aussi (carte) ;
//   - les sorts de zone touchent exactement la zone affichée (combat : CombatView.ZONES ; carte : Spells.areaOf).
// node tests/sorts_tous.js [filtre] [--verbeux]     (filtre : un id de sort, ou un morceau d'id)
const { loadEngine } = require('./load');
const path = require('path'), fs = require('fs'), vm = require('vm');
const E = loadEngine();
E.AI.LAB = false;   // le jeu tel qu'il est livré
const { Game, Units, Cities, World, Spells, Magic, Battle, CombatSpells, RNG, DATA, Heroes, Diplomacy, Move, Players, U, Intel } = E;
const ARGS = process.argv.slice(2), FILTRE = ARGS.find(a => !a.startsWith('--')) || '', VERBEUX = ARGS.includes('--verbeux');

// ---------- les zones affichées en combat : on lit CombatView.ZONES / zoneOf dans le code de l'interface ----------
const CV = (() => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'combatview.js'), 'utf8');
  const a = src.indexOf('  ZONES:'), b = src.indexOf('  // les unités que la zone prendrait');
  const ctx = { CW: E.CW, CH: E.CH }; vm.createContext(ctx);
  vm.runInContext('var CombatView = {' + src.slice(a, b) + '};', ctx);
  return ctx.CombatView;
})();

const out = { pass: 0, fail: [], warn: [], skip: [] };
const FAIL = (id, ctx, msg) => out.fail.push(id + ' [' + ctx + '] ' + msg);
const WARN = (id, ctx, msg) => out.warn.push(id + ' [' + ctx + '] ' + msg);
const SKIP = (id, ctx, msg) => out.skip.push(id + ' [' + ctx + '] ' + msg);

// ---------- le monde de référence (construit une fois, cloné pour chaque sort) ----------
function base() {
  const g = Game.newGame({ seed: 4242, mapW: 50, mapH: 34, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'Testeur', portrait: 0, books: { life: 3, death: 2, chaos: 2, nature: 2, sorcery: 2 }, retorts: [], race: 'highmen' } });
  const me = g.players[0], foe = g.players[1];
  me.human = true;
  Game.contact(g, 0, 1); Game.contact(g, 0, 2);
  Diplomacy.setState(g, 0, 1, 'war');
  const f = g.cities[me.fortress];
  // une case de terre libre à côté de la forteresse, pour la pile ennemie
  const land = (c, used) => World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, c.plane, x, y) && !Cities.at(g, c.plane, x, y) && World.get(g.world, c.plane, 'site', x, y) < 0 && !used.some(([a, b]) => a === x && b === y) && !Units.at(g, c.plane, x, y).length);
  const used = [];
  const fs1 = land(f, used); used.push(fs1);
  const ms2 = land(f, used); used.push(ms2);
  return { g, fs1, ms2 };
}
function clone(g) { const s = JSON.stringify(Object.assign({}, g, { rng: g.rng.s })); const h = JSON.parse(s); h.rng = new RNG(h.rng); Game.upgrade(h); return h; }

// le décor de chaque essai : unités, cité ennemie en vue, nœud rival, terres corrompues, héros tombé…
function stage(B) {
  const g = clone(B.g), me = g.players[0], foe = g.players[1], f = g.cities[me.fortress];
  const W = { g, me, foe, f };
  me.known = Object.keys(DATA.spells).filter(id => DATA.spells[id].inGame !== false);
  me.mana = 200000; me.skillLeft = 100000; me.casting = null; me.gold = 50000;
  const mk = (type, owner, p, x, y, ench) => { const u = Units.create(g, type, owner, p, x, y); u.moves = 0; if (ench) u.ench.push(...ench); return u; };
  // nos troupes dans la forteresse : une unité normale blessée, des archers, une créature, un héros
  W.sw = mk('HighMenSwordsmen', 0, f.plane, f.x, f.y); W.sw.dmg = 3;
  W.bow = mk('HighMenBowmen', 0, f.plane, f.x, f.y);
  W.bear = mk('WarBear', 0, f.plane, f.x, f.y);
  const hdef = Object.values(DATA.heroes).find(h => !h.champion && h.unit !== 'HeroTorin');
  W.hero = Heroes.spawn(g, me, hdef, f.plane, f.x, f.y, 0);
  // une deuxième pile à nous, à côté (Saut de plan, Marche des vents…)
  W.ms2 = { plane: f.plane, x: B.ms2[0], y: B.ms2[1] };
  W.sp2 = mk('HighMenSpearmen', 0, f.plane, B.ms2[0], B.ms2[1]);
  // la pile ennemie à côté de la forteresse (en vue) : enchantée, créatures du chaos et de la mort, archers
  W.fs = { plane: f.plane, x: B.fs1[0], y: B.fs1[1] };
  W.e1 = mk('HighMenSwordsmen', 1, f.plane, B.fs1[0], B.fs1[1], ['bless', 'holy_weapon']);
  W.e2 = mk('HellHounds', 1, f.plane, B.fs1[0], B.fs1[1]);
  W.e3 = mk('Skeleton', 1, f.plane, B.fs1[0], B.fs1[1]);
  W.e4 = mk('HighMenBowmen', 1, f.plane, B.fs1[0], B.fs1[1]);
  // une cité ennemie connue et en vue : on y poste un éclaireur à nous
  W.ec = Object.values(g.cities).find(c => c.owner === 1);
  for (const [x, y] of World.neighbors(g.world, W.ec.x, W.ec.y)) if (!World.isWaterAt(g.world, W.ec.plane, x, y) && !Cities.at(g, W.ec.plane, x, y) && !Units.at(g, W.ec.plane, x, y).length) { W.scout = mk('HighMenSpearmen', 0, W.ec.plane, x, y); break; }
  Move.reveal(g, me, W.ec.plane, W.ec.x, W.ec.y, 3);
  W.ec.buildings.shrine = true;
  // un nœud lié par le rival, connu
  W.node = g.sites.find(s => s.type === 'node');
  if (W.node) { W.node.owner = 1; W.node.cleared = true; W.node.guardians = []; W.node.meldBy = 'MagicSpirit'; Move.reveal(g, me, W.node.plane, W.node.x, W.node.y, 2); }
  // des terres corrompues autour de notre deuxième pile
  for (const [x, y] of [[W.ms2.x, W.ms2.y]].concat(World.neighbors(g.world, W.ms2.x, W.ms2.y))) if (!World.isWaterAt(g.world, f.plane, x, y)) World.set(g.world, f.plane, 'corrupt', x, y, 1);
  // un héros tombé (Résurrection)
  const hdead = Object.values(DATA.heroes).find(h => !h.champion && h.unit !== 'HeroTorin' && h.unit !== hdef.unit);
  const hd = Heroes.spawn(g, me, hdead, f.plane, f.x, f.y, 300); Units.remove(g, hd);
  // le rival : un enchantement global (Disjonction, Captation), une incantation en cours (Brise-sort), du mana à drainer
  foe.mana = 800;
  foe.casting = { id: 'wall_of_stone', progress: 60, cost: 200, target: { city: W.ec.id } };
  // une faille ouverte près de chez nous (Sceller une faille)
  try { E.Veil.openRift(g); } catch (e) { }
  me.mana = 200000;
  Move.bumpVis && Move.bumpVis(g);
  return W;
}

// ---------- l'état du monde, pour voir ce qu'un sort a changé ----------
function snapMap(g) {
  const s = {};
  for (const u of Object.values(g.units)) s['u' + u.id] = JSON.stringify([u.owner, u.type, u.plane, u.x, u.y, u.dmg, u.ench, u.stasis || 0, u.undead || 0, u.chaosChannel || 0, u.xp, u.items]);
  for (const c of Object.values(g.cities)) s['c' + c.id] = JSON.stringify([c.owner, c.pop, Object.keys(c.buildings).sort(), c.ench.map(e => e.spell + ':' + e.owner + ':' + (e.realm || '')), c.fortress, c.name]);
  for (const p of g.players) s['p' + p.id] = JSON.stringify([p.globals, p.alive, p.banished, p.relations, p.known.length, p.casting && p.casting.id, p.fortress, p.summonCity, (p.vault || []).length, p.diplo, (p.deadHeroes || []).length, p.id ? p.mana : 0, p.skill, p.skillPoints, p.researchProgress, p.forgotten || null, Object.keys(p.contact || {}).length]);
  for (const st of g.sites) s['s' + st.id] = JSON.stringify([st.owner, st.warped, st.cleared, st.guardians, st.type]);
  for (let p = 0; p < 2; p++) {
    const P = g.world.planes[p];
    s['w' + p] = [P.terr, P.mineral, P.road, P.corrupt].map(a => { let h = 0; for (let i = 0; i < a.length; i++) h = (h * 31 + (a[i] | 0)) | 0; return h; }).join(',');
    for (const pl of g.players) s['x' + p + '_' + pl.id] = pl.explored[p].reduce((n, v) => n + (v ? 1 : 0), 0);
  }
  s.veil = String(g.veil); s.moon = String(g.moon); s.rifts = JSON.stringify([0, 1].map(p => (E.Veil.rifts(g, p) || []).map(r => r.x + ',' + r.y)));
  return s;
}
const diff = (a, b) => { const k = new Set(Object.keys(a).concat(Object.keys(b))); return [...k].filter(x => a[x] !== b[x]); };
// ce qui appartient au rival, dans un changement
const touchesFoe = (g, keys, before) => keys.filter(k => { if (k === 'p1') return true; if (k[0] === 'u') { const id = k.slice(1), u = g.units[id], was = before[k] && JSON.parse(before[k]); return (u && u.owner === 1) || (was && was[0] === 1); } if (k[0] === 'c') { const c = g.cities[k.slice(1)], was = before[k] && JSON.parse(before[k]); return (c && c.owner === 1) || (was && was[0] === 1); } if (k[0] === 's') { const s = g.sites[k.slice(1)]; return s && s.owner === 1; } return false; });

// ---------- les cibles sur la carte : valables et invalides, selon le type de cible ----------
function mapTargets(W, id) {
  const tt = Spells.overlandTarget(id), sp = DATA.spells[id], p = sp.params || {};
  const V = [], X = [];
  const unitFor = () => { const cands = [W.sw, W.bow, W.bear, W.hero, W.sp2]; return cands.find(u => Spells.validate(W.g, W.me, id, { unit: u.id }).ok) || W.sw; };
  if (tt === 'none') V.push({ l: 'sans cible', t: null });
  else if (tt === 'friendlyUnit') { const u = unitFor(); V.push({ l: Units.name(u), t: { unit: u.id } }); X.push({ l: 'une unité ennemie', t: { unit: W.e1.id } }); }
  else if (tt === 'enemyUnit') { V.push({ l: 'unité ennemie', t: { unit: W.e1.id } }); X.push({ l: 'une de nos unités', t: { unit: W.sw.id } }); }
  else if (tt === 'friendlyCity') { V.push({ l: 'notre forteresse', t: { city: W.f.id, realm: id === 'spell_ward' ? 'chaos' : undefined } }); X.push({ l: 'une cité ennemie', t: { city: W.ec.id, realm: id === 'spell_ward' ? 'chaos' : undefined } }); }
  else if (tt === 'enemyCity') { V.push({ l: 'cité ennemie', t: { city: W.ec.id } }); X.push({ l: 'notre forteresse', t: { city: W.f.id } }); }
  else if (tt === 'enemyWizard') { V.push({ l: 'le rival en guerre', t: { player: 1 } }); X.push({ l: 'soi-même', t: { player: 0 } }); }
  else if (tt === 'deadHero') { const d = (W.me.deadHeroes || [])[0]; V.push({ l: 'héros tombé', t: d ? { hero: d.type } : null }); X.push({ l: 'un héros inconnu', t: { hero: 'HeroTorin' } }); }
  else if (tt === 'node') { if (W.node) V.push({ l: 'nœud rival', t: { plane: W.node.plane, x: W.node.x, y: W.node.y } }); X.push({ l: 'notre forteresse', t: { plane: W.f.plane, x: W.f.x, y: W.f.y } }); }
  else if (tt === 'tile') {
    // la case qui convient à ce sort : la pile ennemie, la nôtre, une terre corrompue, une faille, un minerai…
    const cands = [{ l: 'pile ennemie', t: W.fs }, { l: 'notre deuxième pile', t: W.ms2 }, { l: 'notre forteresse', t: { plane: W.f.plane, x: W.f.x, y: W.f.y } }, { l: 'cité ennemie', t: { plane: W.ec.plane, x: W.ec.x, y: W.ec.y } }];
    const rift = E.Veil.rifts ? E.Veil.rifts(W.g, 0).concat(E.Veil.rifts(W.g, 1))[0] : null; if (rift) cands.push({ l: 'faille', t: { plane: rift.plane, x: rift.x, y: rift.y } });
    if (W.node) cands.push({ l: 'nœud rival', t: { plane: W.node.plane, x: W.node.x, y: W.node.y } });
    // des cases de terre et de mer autour de nous, explorées
    for (let r = 1; r <= 4; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) { const x = World.wx(W.g.world, W.f.x + dx), y = W.f.y + dy; if (World.inY(W.g.world, y)) cands.push({ l: 'case (' + x + ',' + y + ')', t: { plane: W.f.plane, x, y } }); }
    // de l'eau visible pour l'Île flottante : on poste une unité volante à nous à côté si besoin
    const water = (() => { for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = World.wx(W.g.world, W.f.x + dx), y = W.f.y + dy; if (World.inY(W.g.world, y) && World.isWaterAt(W.g.world, W.f.plane, x, y)) return { plane: W.f.plane, x, y }; } return null; })();
    if (water) { cands.push({ l: 'océan', t: water }); }
    const ok = cands.find(c => Spells.validate(W.g, W.me, id, c.t).ok);
    if (ok) V.push(ok); else V.push({ l: 'aucune case valable trouvée', t: null, none: true });
    const bad = cands.find(c => !Spells.validate(W.g, W.me, id, c.t).ok); if (bad) X.push(bad);
  }
  return { tt, V, X };
}

// une case de terre, libre, des deux côtés (Saut de plan, Porte astrale), près de la forteresse
function landBoth(W) {
  const g = W.g, p = W.f.plane;
  for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = World.wx(g.world, W.f.x + dx), y = W.f.y + dy; if (!World.inY(g.world, y) || y < 1 || y > g.world.h - 2) continue;
    if (World.isWaterAt(g.world, 0, x, y) || World.isWaterAt(g.world, 1, x, y) || Cities.at(g, 0, x, y) || Cities.at(g, 1, x, y)) continue;
    const t0 = World.terr(g.world, 1 - p, x, y); if (t0 === E.T.MOUNTAIN || t0 === E.T.VOLCANO) continue;
    if (World.get(g.world, 0, 'site', x, y) >= 0 || World.get(g.world, 1, 'site', x, y) >= 0 || Units.at(g, 0, x, y).length || Units.at(g, 1, x, y).length) continue;
    if (!Intel.knows(g, W.me, p, x, y)) continue;
    return [x, y];
  }
  return null;
}
// la case d'océan la plus proche de la forteresse, et une case de terre voisine d'où la voir
function nearWater(W) {
  const g = W.g, p = W.f.plane;
  for (let r = 1; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = World.wx(g.world, W.f.x + dx), y = W.f.y + dy; if (!World.inY(g.world, y) || !World.isWaterAt(g.world, p, x, y) || Units.at(g, p, x, y).length) continue;
    const l = World.neighbors(g.world, x, y).find(([a, b]) => !World.isWaterAt(g.world, p, a, b) && !Cities.at(g, p, a, b));
    if (l) { Move.reveal(g, W.me, p, x, y, 1); return { plane: p, x, y, lx: l[0], ly: l[1] }; }
  }
  return null;
}
const BOOK = ['palimpsest', 'erasure', 'oblivion', 'annals', 'deus_ex_machina', 'mise_en_abyme', 'legendary_artifact'];
// ---------- carte ----------
function runMap(B, id) {
  const sp = DATA.spells[id];
  // préparatifs propres à certains sorts
  const prep = {
    spell_of_return: W => { W.me.banished = true; W.me.lastFortress = { plane: W.f.plane, x: W.f.x, y: W.f.y }; W.f.fortress = false; W.me.fortress = null; },
    move_fortress: W => { const c = Cities.create(W.g, 0, 'highmen', W.ms2.plane, W.ms2.x, W.ms2.y, { pop: 3000 }); W.f = c; },
    summoning_circle: W => { const c = Cities.create(W.g, 0, 'highmen', W.ms2.plane, W.ms2.x, W.ms2.y, { pop: 3000 }); W.f = c; },
    word_of_recall: W => { W.f = W.f; },
    healing: W => { W.sw.dmg = 3; },
    wall_of_stone: W => { delete W.f.buildings.cityWalls; },
    astral_gate: W => { const t = landBoth(W); if (t) W.f = Cities.create(W.g, 0, 'highmen', W.f.plane, t[0], t[1], { pop: 3000 }); },
    dark_rituals: W => { W.f.buildings.shrine = true; },
    disjunction: W => { W.foe.globals.push('holy_arms'); },
    disjunction_true: W => { W.foe.globals.push('holy_arms'); },
    spell_binding: W => { W.foe.globals.push('holy_arms'); },
    spell_lock: W => { W.sw.ench.push('bless'); },
    oblivion: W => { W.g.book.claimed = true; W.g.book.city = W.f.id; const ex = W.foe.explored[W.f.plane]; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) ex[(W.f.y + dy) * W.g.world.w + World.wx(W.g.world, W.f.x + dx)] = 1; },
    palimpsest: W => { W.g.book.claimed = true; W.g.book.city = W.f.id; const c = W.foe.known.find(k => DATA.spells[k] && DATA.spells[k].research && DATA.spells[k].research > 0); if (c) W.me.known = W.me.known.filter(k => k !== c); },
    transmute: W => { World.set(W.g.world, W.ms2.plane, 'mineral', W.ms2.x, W.ms2.y, E.M.iron); },
    plane_shift: W => { const t = landBoth(W); if (t) { W.sp2.x = t[0]; W.sp2.y = t[1]; W.ms2 = { plane: W.f.plane, x: t[0], y: t[1] }; } },
    floating_island: W => { const w = nearWater(W); if (w) { const u = Units.create(W.g, 'HighMenSpearmen', 0, w.plane, w.lx, w.ly); u.moves = 0; } },
  };
  // le Livre de légende pour ses sept sorts
  if (BOOK.includes(id) && !prep[id]) prep[id] = W => { W.g.book.claimed = true; W.g.book.city = W.f.id; if (id === 'mise_en_abyme') { W.bear.xp = 0; } };
  const W = stage(B); if (prep[id]) prep[id](W);
  if (id === 'word_of_recall' || id === 'recall_hero') { W.sp2.moves = 0; }
  const { tt, V, X } = mapTargets(W, id);
  // les cibles invalides : refusées, sans dépense
  for (const x of X) {
    const m0 = W.me.mana, v = Spells.validate(W.g, W.me, id, x.t);
    if (v.ok) { FAIL(id, 'carte', 'cible invalide acceptée : ' + x.l); continue; }
    let r; try { r = Spells.cast(W.g, W.me, id, x.t); } catch (e) { FAIL(id, 'carte', 'erreur sur cible invalide : ' + e.message); continue; }
    if (r && r.ok !== false) FAIL(id, 'carte', 'lancé malgré une cible invalide (' + x.l + ')');
    if (W.me.mana !== m0) FAIL(id, 'carte', 'mana dépensé pour une cible invalide (' + (m0 - W.me.mana) + ')');
    if (W.me.casting) { FAIL(id, 'carte', 'incantation commencée sur une cible invalide'); W.me.casting = null; }
  }
  for (const v of V) {
    if (v.none) { SKIP(id, 'carte', 'aucune case valable dans le monde de test'); continue; }
    const val = Spells.validate(W.g, W.me, id, v.t);
    if (!val.ok) { SKIP(id, 'carte', 'refusé dans le monde de test (' + v.l + ') : ' + val.why); continue; }
    const cost = Magic.spellCost(W.g, W.me, id, false), m0 = W.me.mana, before = snapMap(W.g); W.g.log = [];
    let r; try { r = Spells.cast(W.g, W.me, id, v.t); } catch (e) { FAIL(id, 'carte', 'erreur : ' + e.stack.split('\n').slice(0, 3).join(' | ')); continue; }
    if (!r || r.ok === false) { FAIL(id, 'carte', 'cible valable refusée au lancer (' + v.l + ') : ' + (r && r.why)); continue; }
    if (W.me.casting) { FAIL(id, 'carte', 'incantation non achevée malgré la compétence (' + W.me.casting.id + ')'); continue; }
    const spent = m0 - W.me.mana;
    if (spent !== cost && id !== 'spell_blast') WARN(id, 'carte', 'mana débité ' + spent + ' au lieu de ' + cost);
    const after = snapMap(W.g), d = diff(before, after);
    const logs = W.g.log;
    const lg = l => l.pid + ':' + l.text;
    if (!d.length) FAIL(id, 'carte', 'aucun effet visible sur ' + v.l + ' (journal : ' + logs.map(lg).join(' / ').slice(0, 160) + ')');
    if (!logs.some(l => l.pid === 0)) FAIL(id, 'carte', 'aucune ligne au journal du lanceur');
    const expect = (() => {
      if (sp.kind === 'unitEnchant' && v.t && v.t.unit != null) { const u = W.g.units[v.t.unit]; return id === 'chaos_channels' ? u && u.chaosChannel : u && u.ench.includes(id); }
      if (id === 'wall_of_stone') { const c = W.g.cities[v.t.city]; return c && c.buildings.cityWalls; }
      if (sp.kind === 'cityEnchant' || sp.kind === 'cityCurse') { const c = W.g.cities[v.t.city]; return c && c.ench.some(e => e.spell === id && e.owner === 0); }
      if (sp.kind === 'global') return id === 'spell_of_mastery' ? W.g.over && W.g.winner === 0 : W.me.globals.includes(id);
      if (sp.kind === 'summon' && sp.params && sp.params.unit) return Object.values(W.g.units).some(u => u.owner === 0 && u.type === sp.params.unit && !before['u' + u.id]);
      return true;
    })();
    if (!expect) FAIL(id, 'carte', 'l\'effet propre au sort manque (' + sp.kind + ')');
    const foeKeys = touchesFoe(W.g, d, before).filter(k => !(sp.kind === 'global'));
    if (foeKeys.length && !logs.some(l => Chk.forPid(l, 1))) WARN(id, 'carte', 'le rival est touché (' + foeKeys.slice(0, 4).join(',') + ') sans ligne à son journal');
    // zone : Purification, Routes enchantées… ce que l'aperçu montre est ce qui change
    const area = Spells.areaOf && v.t && v.t.x != null ? Spells.areaOf(W.g, W.me, id, v.t.plane, v.t.x, v.t.y) : null;
    if (area && id === 'purify_land') { const left = area.hot.filter(([x, y]) => World.get(W.g.world, v.t.plane, 'corrupt', x, y)); if (left.length) FAIL(id, 'carte', 'zone : ' + left.length + ' cases annoncées restent corrompues'); }
    if (VERBEUX) console.log('  carte', id, '→', v.l, '|', d.length, 'changements |', logs.map(lg).join(' / ').slice(0, 200));
    out.pass++;
  }
}
// à qui s'adresse une ligne de journal
const Chk = { forPid(l, pid) { return l.pid === pid; } };

// ---------- combat ----------
const COMBAT_CTX = ['champ', 'siege', 'defense'];
function battleFor(B, kind) {
  const W = stage(B), g = W.g, mk = (t, o, p, x, y, ench) => { const u = Units.create(g, t, o, p, x, y); if (ench) u.ench.push(...ench); return u; };
  const at = W.fs;
  const mine = () => [mk('HighMenSwordsmen', 0, at.plane, at.x, at.y, ['resist_magic']), mk('HighMenBowmen', 0, at.plane, at.x, at.y), mk('WarBear', 0, at.plane, at.x, at.y), mk('Zombie', 0, at.plane, at.x, at.y), W.hero, mk('HighMenSpearmen', 0, at.plane, at.x, at.y)].filter(Boolean);
  const theirs = () => [mk('HighMenSwordsmen', 1, at.plane, at.x, at.y, ['bless', 'holy_weapon']), mk('HellHounds', 1, at.plane, at.x, at.y), mk('Skeleton', 1, at.plane, at.x, at.y), mk('HighMenBowmen', 1, at.plane, at.x, at.y), mk('Gargoyle', 1, at.plane, at.x, at.y), mk('HighMenSpearmen', 1, at.plane, at.x, at.y)];
  let opts, mySide;
  if (kind === 'champ') { opts = { attackers: mine(), defenders: theirs(), attackerPid: 0, defenderPid: 1, plane: at.plane, x: at.x, y: at.y }; mySide = 0; }
  else if (kind === 'siege') { const c = W.ec; c.buildings.cityWalls = true; c.buildings.defenseTowers = true; opts = { attackers: mine(), defenders: theirs(), attackerPid: 0, defenderPid: 1, plane: c.plane, x: c.x, y: c.y, city: c }; mySide = 0; }
  else { const c = W.f; c.buildings.cityWalls = true; opts = { attackers: theirs(), defenders: mine(), attackerPid: 1, defenderPid: 0, plane: c.plane, x: c.x, y: c.y, city: c }; mySide = 1; }
  opts.rng = new RNG(77);
  const bt = new Battle(g, opts);
  // un mort de chaque camp (Relever les morts, Animation des morts), des blessés
  const kill = b => { bt.takeDamage(b, 999); bt.checkDeath(b); };
  kill(bt.alive(mySide).find(b => b.u.type === 'HighMenSpearmen'));
  kill(bt.alive(1 - mySide).find(b => b.u.type === 'HighMenSpearmen'));
  for (const b of bt.alive(mySide)) if (!b.u.hero) bt.takeDamage(b, 2);
  // une invocation de combat ennemie (Dissipation), des enchantements de champ ennemis (Désenchantement)
  bt.ench[1 - mySide].push('prayer');
  bt.side = mySide; bt.castThisRound[mySide] = false; bt.skillLeft[mySide] = 100000; W.me.mana = 200000;
  return { W, bt, mySide };
}
function snapBattle(bt) {
  const s = {};
  for (const b of bt.units) { const st = b.dead ? null : bt.stats(b); s['b' + b.id] = JSON.stringify([b.dead, b.side, b.c, b.r, b.u.dmg, b.curses, b.tempEnch, b.u.ench, b.asleep, b.confused, b.web, b.possessed, b.stasis, b.ammo, b.casterMana, b.u.chaosChannel || 0, st && [st.melee, st.ranged, st.def, st.res, st.toHit, st.toDefend, st.move, st.hp, !!st.flying, b.invisible]]); }
  s.ench = JSON.stringify([bt.ench, bt.globalEnch, bt.counterMagic, bt.wallOfFire, bt.wallOfDarkness, Object.keys(bt.mud || {}).length, (bt.vortices || []).length, bt.units.length]);
  s.walls = JSON.stringify(Object.values(bt.walls || {}).map(w => w.broken)); s.towers = JSON.stringify((bt.towers || []).map(t => [t.hp, t.mute || 0, t.def, t.dead]));
  return s;
}
function runCombat(B, id) {
  const sp = DATA.spells[id];
  if (!CombatSpells.implemented(id)) { FAIL(id, 'combat', 'annoncé lançable en combat mais sans effet codé'); return; }
  let castable = 0; const reasons = [];
  for (const kind of COMBAT_CTX) {
    const { W, bt, mySide } = battleFor(B, kind);
    const opts = CombatSpells.wizardOptions(bt, mySide), o = opts.find(x => x.id === id);
    const useless = CombatSpells.uselessWhy(bt, mySide, id);
    if (!o) { reasons.push(kind + ' : ' + (useless || CombatSpells.alreadyActive(bt, mySide, id) && 'déjà actif' || 'absent des options')); continue; }
    if (useless) { reasons.push(kind + ' : sans effet (' + useless + ')'); continue; }
    const tt = CombatSpells.targetType(id);
    let targets;
    if (tt === 'none') targets = [null];
    else if (tt === 'combatTile') {
      if (id === 'disrupt') { const all = CombatSpells.disruptTargets(bt, mySide); targets = all.slice(0, 1).concat(all.filter(([c, r]) => bt.towerAt(c, r)).slice(0, 1)); }
      else { const e = bt.alive(1 - mySide)[0]; targets = e ? [[e.c, e.r]] : []; }
    } else targets = CombatSpells.validTargets(bt, mySide, id).slice(0, 2);
    if (!targets.length) { reasons.push(kind + ' : aucune cible'); continue; }
    // une cible invalide : refusée, sans dépense
    if (tt === 'combatTile') {
      const m0 = W.me.mana, s0 = bt.skillLeft[mySide], badT = id === 'disrupt' ? [Math.floor(E.CW / 2), Math.floor(E.CH / 2)] : [-3, -3];
      let r; try { r = CombatSpells.cast(bt, mySide, id, badT, null, 0); } catch (e) { FAIL(id, kind, 'erreur sur case invalide : ' + e.message); }
      if (r !== false) FAIL(id, kind, 'lancé sur une case invalide (' + badT + ')');
      if (W.me.mana !== m0 || bt.skillLeft[mySide] !== s0) FAIL(id, kind, 'dépense pour une case invalide');
      bt.castThisRound[mySide] = false;
    }
    if (['enemyUnit', 'friendlyUnit', 'deadUnit'].includes(tt)) {
      const bad = tt === 'enemyUnit' ? bt.alive(mySide)[0] : tt === 'friendlyUnit' ? bt.alive(1 - mySide)[0] : bt.alive(mySide)[0];
      const m0 = W.me.mana, s0 = bt.skillLeft[mySide];
      let r; try { r = CombatSpells.cast(bt, mySide, id, bad, null, 0); } catch (e) { FAIL(id, kind, 'erreur sur cible invalide : ' + e.message); }
      if (r !== false) FAIL(id, kind, 'lancé sur une cible invalide (' + bt.name(bad) + ')');
      if (W.me.mana !== m0 || bt.skillLeft[mySide] !== s0) FAIL(id, kind, 'dépense pour une cible invalide');
      bt.castThisRound[mySide] = false;
    }
    for (const t of targets) {
      bt.castThisRound[mySide] = false; bt.side = mySide;
      if (!CombatSpells.wizardOptions(bt, mySide).find(x => x.id === id)) break;   // déjà actif après le premier lancer, par exemple
      const base = Magic.spellCost(W.g, W.me, id, true), cost = Math.max(1, Math.ceil(base * Magic.distanceMult(W.g, W.me, bt.plane, bt.x, bt.y)));
      const m0 = W.me.mana, s0 = bt.skillLeft[mySide], before = snapBattle(bt), log0 = bt.log.length, ev0 = (bt.events || []).length;
      const zone = CV.ZONES[id] && Array.isArray(t) ? CV.zoneOf(id, t[0], t[1]) : null;
      let r; try { r = CombatSpells.cast(bt, mySide, id, t, null, 0); } catch (e) { FAIL(id, kind, 'erreur : ' + e.stack.split('\n').slice(0, 3).join(' | ')); continue; }
      if (r === false) { FAIL(id, kind, 'refusé sur une cible valable'); continue; }
      castable++;
      if (W.me.mana !== m0 - cost) WARN(id, kind, 'mana ' + (m0 - W.me.mana) + ' au lieu de ' + cost);
      if (bt.skillLeft[mySide] !== s0 - base) WARN(id, kind, 'compétence ' + (s0 - bt.skillLeft[mySide]) + ' au lieu de ' + base);
      const after = snapBattle(bt), d = diff(before, after), logs = bt.log.slice(log0);
      const said = logs.slice(1).join(' / ');   // la première ligne : « X lance Y. »
      const fizz = /dissout|contre-magie|dissipe dans|repouss/.test(logs.join(' '));
      if (!d.length && !fizz && !/résist|sans effet|rien|insensible|immunis|\b0 dégâts|\b0 points|[Aa]ucun/.test(said)) FAIL(id, kind, 'aucun effet ni explication' + (t && t.u ? ' sur ' + bt.name(t) : '') + ' (journal : ' + logs.join(' / ').slice(0, 160) + ')');
      if (!logs.length) FAIL(id, kind, 'rien au journal');
      if (sp.kind === 'unitEnchant' && t && t.u && !t.tempEnch.includes(id) && !t.u.ench.includes(id)) FAIL(id, kind, 'l\'enchantement n\'est pas posé sur ' + bt.name(t));
      if (sp.kind === 'combatEnchant' && !bt.ench[mySide].includes(id) && !bt.globalEnch.includes(id) && id !== 'counter_magic') FAIL(id, kind, 'l\'enchantement de champ n\'est pas posé');
      if (sp.kind === 'summon' && bt.units.length === JSON.parse(before.ench)[7]) FAIL(id, kind, 'aucune créature apparue');
      // zone : les unités touchées sont dans la zone affichée, et la zone de la boue est celle qu'on a vue
      if (zone && id === 'earth_to_mud') { const mud = Object.keys(bt.mud).filter(k => !before.mudKeys || true); const outside = mud.filter(k => { const [c, rr] = k.split(',').map(Number); return c >= 0 && rr >= 0 && c < E.CW && rr < E.CH && !zone.has(k); }); const missing = [...zone].filter(k => !bt.mud[k]); if (outside.length || missing.length) FAIL(id, kind, 'zone affichée ≠ boue : ' + outside.length + ' cases en trop, ' + missing.length + ' manquantes'); }
      if (zone && id === 'magic_vortex') { const v = (bt.vortices || [])[bt.vortices.length - 1]; if (!v || !zone.has(v.c + ',' + v.r)) FAIL(id, kind, 'le vortex sort de la zone affichée (' + (v ? v.c + ',' + v.r : 'absent') + ')'); }
      if (VERBEUX) console.log('  combat', kind, id, '→', t && t.u ? bt.name(t) : JSON.stringify(t), '|', d.length, 'changements |', logs.join(' / ').slice(0, 220));
      out.pass++;
    }
    // l'IA tactique joue ensuite quelques rounds sans planter
    try { for (let i = 0; i < 6 && !bt.over; i++) E.CombatAI.playSide(bt); } catch (e) { FAIL(id, kind, 'erreur de l\'IA après le sort : ' + e.message); }
  }
  if (!castable) FAIL(id, 'combat', 'jamais lançable dans les trois combats types : ' + reasons.join(' ; '));
  else if (VERBEUX && reasons.length) console.log('  (non lançable : ' + reasons.join(' ; ') + ')');
}

// ---------- tour suivant : les effets qui durent (malédictions, globaux) passent un tour sans erreur ----------
function runTurn(B, id) {
  const W = stage(B), tt = Spells.overlandTarget(id), { V } = mapTargets(W, id);
  const v = V.find(x => !x.none && Spells.validate(W.g, W.me, id, x.t).ok); if (!v) return;
  try { Spells.cast(W.g, W.me, id, v.t); } catch (e) { return; }
  W.me.human = false;
  try { for (const p of W.g.players) if (p.alive) E.Turn.processPlayer(W.g, p); E.Turn.processGlobals(W.g); for (const c of Object.values(W.g.cities)) { const pl = W.g.players[c.owner]; if (pl) E.Turn.cityEffects && E.Turn.cityEffects(W.g, c, pl, Cities.econ(W.g, c)); } }
  catch (e) { FAIL(id, 'tour suivant', 'erreur : ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
}

const t0 = Date.now();
const B = base();
const ids = Object.keys(DATA.spells).filter(id => DATA.spells[id].inGame !== false && (!FILTRE || id.includes(FILTRE))).sort();
for (const id of ids) {
  const sp = DATA.spells[id];
  try {
    if (sp.overland) { runMap(B, id); runTurn(B, id); }
    if (sp.combat) runCombat(B, id);
  } catch (e) { FAIL(id, 'banc', 'erreur du banc : ' + e.stack.split('\n').slice(0, 4).join(' | ')); }
}
console.log('\n' + ids.length + ' sorts, ' + out.pass + ' lancers vérifiés en ' + Math.round((Date.now() - t0) / 1000) + ' s');
console.log('\nÉCHECS (' + out.fail.length + ')'); for (const l of out.fail) console.log('  ' + l);
console.log('\nAVERTISSEMENTS (' + out.warn.length + ')'); for (const l of out.warn) console.log('  ' + l);
console.log('\nNON TESTÉS DANS CE MONDE (' + out.skip.length + ')'); for (const l of out.skip) console.log('  ' + l);
fs.writeFileSync(path.join(__dirname, 'sorts_tous.json'), JSON.stringify(out, null, 1));
if (out.fail.length) process.exitCode = 1;
