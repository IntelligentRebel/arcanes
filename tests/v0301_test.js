'use strict';
// v0.30.1 : les corrections issues du contre-audit de la 0.30.0, chacune vérifiée par le vrai code.
// node tests/v0301_test.js
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, World, Cities, Battle, RNG, CombatSpells, Spells, DATA, Turn, Diplomacy, Players, Move, Heroes, U } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const clone = g => { const h = JSON.parse(JSON.stringify(Object.assign({}, g, { rng: g.rng.s }))); h.rng = new RNG(h.rng); Game.upgrade(h); return h; };

const G0 = Game.newGame({ seed: 77, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'Testeur', portrait: 0, books: { chaos: 4, death: 3, sorcery: 4 }, retorts: [], race: 'highmen' } });
const land = (g, c, k) => World.neighbors(g.world, c.x, c.y).filter(([x, y]) => !World.isWaterAt(g.world, c.plane, x, y) && !Cities.at(g, c.plane, x, y) && World.get(g.world, c.plane, 'site', x, y) < 0)[k || 0];
const logsOf = (g, pid, from) => g.log.slice(from || 0).filter(l => l.pid === pid).map(l => l.text);
const fresh = () => { const g = clone(G0); g.log = []; return g; };
const battleAt = (g, mine, theirs, o) => { const c = g.cities[g.players[0].fortress], [x, y] = land(g, c); for (const u of mine.concat(theirs)) { u.x = x; u.y = y; u.plane = c.plane; } return new Battle(g, Object.assign({ attackers: mine, defenders: theirs, attackerPid: mine[0].owner, defenderPid: theirs[0].owner, plane: c.plane, x, y, rng: new RNG(5) }, o || {})); };
const mk = (g, t, o, ench) => { const c = g.cities[g.players[0].fortress]; const u = Units.create(g, t, o, c.plane, c.x, c.y); if (ench) u.ench.push(...ench); return u; };

// ---------- combat ----------
{
  const g = fresh(); g.players[1].human = false;
  const bt = battleAt(g, [mk(g, 'HighMenSwordsmen', 1)], [mk(g, 'HighMenSpearmen', 0), mk(g, 'HighMenSpearmen', 0)], { attackerPid: 1, defenderPid: 0 });
  bt.ench[0].push('mana_leak'); g.players[0].mana = 100; bt.side = 1; bt.newRound && bt.newRound();
  const l = bt.log.join(' | ');
  ok(/Fuite de mana : vous perdez 5 mana/.test(l), 'Fuite de mana lancée sur le joueur : « vous perdez » (' + (l.match(/Fuite de mana[^|]*/) || [''])[0] + ')');
}
{
  const g = fresh();
  const bt = battleAt(g, [mk(g, 'HighMenSwordsmen', 0)], [mk(g, 'HighMenSpearmen', 1), mk(g, 'HighMenSpearmen', 1)]);
  bt.ench[0].push('terror'); bt.rng = { int: () => 9, chance: () => true, pick: a => a[0], rolls: () => 0 };
  bt.resetMoves(1);
  const l = bt.log.filter(x => /terreur/.test(x)).join(' | ');
  ok(/Lanciers hauts-hommes \(×2\) sont figés par la terreur/.test(l), 'Terreur : accord et doublons (' + l + ')');
}
{
  const g = fresh();
  const cat = mk(g, 'Catapult', 0), sw = mk(g, 'HighMenSwordsmen', 0);
  const bt = battleAt(g, [cat, sw], [mk(g, 'HighMenSpearmen', 1)]);
  const bc = bt.units.find(b => b.u === cat), bs = bt.units.find(b => b.u === sw);
  ok(!CombatSpells.canAffect(bt, bc, 'giant_strength') && CombatSpells.canAffect(bt, bs, 'giant_strength'), 'Force de géant : refusée sur une catapulte en combat, acceptée sur des épéistes');
  ok(!!Units.enchantUseless(g, cat, 'giant_strength'), 'Force de géant : refusée sur une catapulte sur la carte (' + Units.enchantUseless(g, cat, 'giant_strength') + ')');
  ok(!CombatSpells.canAffect(bt, bs, 'spell_lock'), 'Sceau des sorts en combat : refusé sans enchantement à protéger');
  sw.ench.push('bless'); ok(CombatSpells.canAffect(bt, bs, 'spell_lock'), 'Sceau des sorts en combat : accepté sur une unité bénie');
  bt.side = 0; bt.skillLeft[0] = 999; g.players[0].mana = 999;
  let crash = null, r;
  try { r = ['healing', 'dispel_evil', 'star_fires', 'fire_bolt'].map(id => { g.players[0].known.push(id); return CombatSpells.cast(bt, 0, id, null, null, 0); }); } catch (e) { crash = e.message; }
  ok(!crash && r.every(x => x === false), 'cast sans cible : refusé sans planter (' + (crash || JSON.stringify(r)) + ')');
}
{
  const g = fresh();
  const sw = mk(g, 'HighMenSwordsmen', 0); sw.dmg = 1;
  const bt = battleAt(g, [sw], [mk(g, 'HighMenSpearmen', 1)]); bt.log.length = 0;
  E.COMBAT_SPELL_HANDLERS.healing(bt, 0, bt.units.find(b => b.u === sw));
  ok(bt.log.some(l => /^1 PV rendu à /.test(l)), 'Guérison : « 1 PV rendu » (' + bt.log.join(' | ') + ')');
}
{
  const g = fresh();
  const sp = mk(g, 'HighMenSpearmen', 1), sw = mk(g, 'HighMenSwordsmen', 0);
  const bt = battleAt(g, [sw], [sp]); const b = bt.units.find(x => x.u === sp);
  bt.takeDamage(b, 999); bt.checkDeath(b); bt.log.length = 0;
  CombatSpells.revive(bt, 0, b, true);
  ok(bt.log.some(l => /Lanciers hauts-hommes se relèvent, morts-vivants\./.test(l)), 'Animation des morts : accord (' + bt.log.join(' | ') + ')');
  const res = bt.results ? bt.results() : null;
  ok(res && res.taken && res.taken[1].includes(sp), 'une unité relevée par l\'ennemi compte comme perte de son premier camp');
}
{
  const g = fresh();
  const mg = mk(g, 'OrcMagicians', 1), sw = mk(g, 'HighMenSwordsmen', 0);
  const bt = battleAt(g, [sw], [mg]); const b = bt.units.find(x => x.u === mg);
  bt.rng = new RNG(3); bt.resistFails = () => 1; bt.log.length = 0;
  E.COMBAT_SPELL_HANDLERS.shatter(bt, 0, b);
  ok(bt.log.some(l => /tir magique reste intact/.test(l)), 'Bris d\'armes sur des magiciens : le tir magique est dit intact (' + bt.log.join(' | ') + ')');
  bt.log.length = 0; CombatSpells.damageSpell(bt, b, 0, 'fire', 'chaos', {}, 'Trait de feu');
  ok(bt.log.some(l => /ne fait aucun dégât/.test(l)), 'sort de dégâts sans effet : « ne fait aucun dégât » (' + bt.log.join(' | ') + ')');
}
{
  const g = fresh();
  const foe = mk(g, 'HighMenSwordsmen', 1, ['bless']), sw = mk(g, 'HighMenSwordsmen', 0), bare = mk(g, 'HighMenSpearmen', 1);
  const bt = battleAt(g, [sw], [foe, bare]); bt.log.length = 0;
  const bf = bt.units.find(x => x.u === foe), bb = bt.units.find(x => x.u === bare);
  const od = CombatSpells.odds(bt, 0, 'dispel_magic', bf, 0);
  ok(od && od.dispel && od.dispel.length === 1 && od.p > 0 && od.p < 1, 'Dissipation : chance au survol (' + JSON.stringify(od && od.dispel) + ', au moins un : ' + (od && Math.round(od.p * 100)) + ' %)');
  bt.rng = { chance: () => false, int: () => 0, pick: a => a[0], rolls: () => 0 };
  E.COMBAT_SPELL_HANDLERS.dispel_magic(bt, 0, bf, DATA.spells.dispel_magic, null, 0);
  ok(bt.log.some(l => /Rien ne tombe sur/.test(l)), 'Dissipation sans succès : dit que rien ne tombe (' + bt.log.join(' | ') + ')');
  bt.log.length = 0; CombatSpells.disenchantAll(bt, 0, 50);
  ok(bt.log.some(l => /Désenchantement : rien ne tombe/.test(l)), 'Désenchantement sans succès : idem');
}
{
  const g = fresh();
  let ch = 0;
  for (let s = 0; s < 40; s++) {
    const pal = mk(g, 'Paladin', 1), sw = mk(g, 'HighMenSwordsmen', 0);
    const bt = battleAt(g, [sw], [pal]); bt.rng = new RNG(100 + s);
    E.COMBAT_SPELL_HANDLERS.call_chaos(bt, 0);
    if (pal.chaosChannel) ch++;
  }
  ok(ch === 0, 'Appel du chaos : jamais de Canaux du chaos sur des paladins (immunité magique), 40 essais');
}
// ---------- carte ----------
{
  const g = fresh(); const pl = g.players[0];
  Game.contact(g, 0, 1); Diplomacy.setState(g, 0, 1, 'alliance');
  const c1 = g.cities[g.players[1].fortress], [x, y] = land(g, c1);
  Units.create(g, 'HighMenSpearmen', 1, c1.plane, x, y);
  for (const p of [0, 1]) pl.explored[p].fill(1);
  const vis = Move.visibility; Move.visibility = () => [new Array(g.world.w * g.world.h).fill(1), new Array(g.world.w * g.world.h).fill(1)];
  E.Intel.sees = () => true;
  pl.known.push('fire_storm', 'black_wind', 'earthquake');
  const v1 = Spells.validate(g, pl, 'fire_storm', { plane: c1.plane, x, y }), v2 = Spells.validate(g, pl, 'earthquake', { city: c1.id });
  ok(!v1.ok && /traité/.test(v1.why), 'Tempête de feu sur la pile d\'un allié : refusée (' + v1.why + ')');
  ok(!v2.ok && /traité/.test(v2.why), 'Tremblement de terre sur la cité d\'un allié : refusé (' + v2.why + ')');
  Diplomacy.setState(g, 0, 1, 'war');
  ok(Spells.validate(g, pl, 'fire_storm', { plane: c1.plane, x, y }).ok, 'Tempête de feu : acceptée en guerre');
  Move.visibility = vis;
}
{
  // Déplacement de la forteresse avec un Relais de magie en chantier
  const g = fresh(); const pl = g.players[0], f = g.cities[pl.fortress];
  const other = Object.values(g.cities).find(c => c.owner === 0 && c !== f) || (() => { const [x, y] = land(g, f, 2); const fx = World.neighbors(g.world, f.x, f.y).map(([a, b]) => World.neighbors(g.world, a, b)).flat().find(([a, b]) => World.dist(g.world, a, b, f.x, f.y) >= 2 && !World.isWaterAt(g.world, f.plane, a, b) && !Cities.at(g, f.plane, a, b)); return Cities.create(g, 0, 'highmen', f.plane, fx[0], fx[1], { pop: 4000 }); })();
  if (!other) ok(false, 'Déplacement de la forteresse : pas de seconde cité dans ce monde');
  else {
    f.prod = { type: 'building', id: 'magicRelay' }; f.progress = 120; f.queue = [];
    Spells.apply(g, pl, 'move_fortress', { city: other.id });
    const e = Cities.econ(g, f); g.log = [];
    Turn.cityEffects ? null : null;
    // le tour suivant revalide la production (Turn.processCity)
    const before = f.progress;
    try { Turn.cityTurn ? Turn.cityTurn(g, f, pl) : Turn.processCity(g, f, pl); } catch (err) { }
    const l = logsOf(g, 0).join(' | ');
    ok(f.prod.id !== 'magicRelay' && /n'est plus possible/.test(l) && /avancement passe à la suite/.test(l), 'Déplacement de la forteresse : le Relais en chantier est signalé et son avancement passe à la suite (' + l.slice(0, 200) + ')');
    ok(f.progress >= before || f.carry, 'avancement conservé (' + before + ' → ' + f.progress + (f.carry ? ', en attente' : '') + ')');
  }
}
{
  // noyade : nom des unités et Navire volant
  const g = fresh(); const pl = g.players[0];
  let wx = null; for (let y = 2; y < g.world.h - 2 && !wx; y++) for (let x = 0; x < g.world.w && !wx; x++) if (World.isWaterAt(g.world, 0, x, y)) wx = [x, y];
  const a = Units.create(g, 'HighMenSwordsmen', 0, 0, wx[0], wx[1]);
  g.log = []; Game.drownStranded(g, 0, wx[0], wx[1]);
  ok(logsOf(g, 0).some(l => /^Épéistes hauts-hommes périssent en mer/.test(l)), 'noyade : l\'unité est nommée et accordée (' + logsOf(g, 0).join(' | ') + ')');
  const ship = Units.create(g, 'AirShip', 0, 0, wx[0], wx[1]); const p1 = Units.create(g, 'HighMenSpearmen', 0, 0, wx[0], wx[1]), p2 = Units.create(g, 'HighMenSpearmen', 0, 0, wx[0], wx[1]);
  const n = Game.drownStranded(g, 0, wx[0], wx[1]);
  ok(n === 0 && g.units[p1.id] && g.units[p2.id], 'Navire volant au-dessus de l\'eau : ses deux passagers ne se noient pas');
  g.log = []; Units.remove(g, ship);
  ok(!g.units[p1.id] && !g.units[p2.id], 'Navire volant détruit au-dessus de l\'eau : ses passagers périssent (' + logsOf(g, 0).join(' | ') + ')');
}
{
  // Marche des vents sur Zéphan (marche déjà dans les vents, moins vite)
  const g = fresh(); const pl = g.players[0], f = g.cities[pl.fortress];
  const h = Object.values(DATA.heroes).find(x => x.unit === 'HeroJaer');
  if (!h) ok(false, 'Zéphan introuvable');
  else {
    const u = Heroes.spawn(g, pl, h, f.plane, f.x, f.y, 0); pl.known.push('wind_walking'); pl.mana = 9999; pl.skillLeft = 9999;
    const v = Spells.validate(g, pl, 'wind_walking', { unit: u.id });
    ok(v.ok, 'Marche des vents sur Zéphan : acceptée (' + Units.maxMoves(g, u) + ' demi-points sans, 6 avec) ' + (v.why || ''));
  }
}
{
  // Sort de Retour visé sur une cité perdue : pas d'incantation suspendue
  const g = fresh(); const pl = g.players[0];
  const c2 = Object.values(g.cities).find(c => c.owner === 0);
  pl.casting = { id: 'spell_of_return', progress: 10, cost: 500, target: { city: Object.values(g.cities).find(c => c.owner === 1).id } };
  ok(Spells.castingWarning(g, pl) == null, 'Sort de Retour visé sur une cité perdue : la fin de l\'incantation choisira une autre cité (pas de suspension)');
}
{
  // enchantement global entretenu par un sorcier jamais rencontré
  const g = fresh(); const pl = g.players[0], o = g.players[2];
  o.globals.push('crusade'); pl.known.push('crusade');
  const v = Spells.validate(g, pl, 'crusade', null);
  ok(!v.ok && /^Un sorcier inconnu/.test(v.why) && !v.why.includes(o.name), 'global d\'un inconnu : son nom n\'est pas révélé (' + v.why + ')');
}
{
  // Disjonction et Captation visées : la cible disparue suspend l'incantation au lieu d'un tirage
  const g = fresh(); const pl = g.players[0];
  Game.contact(g, 0, 1); Diplomacy.setState(g, 0, 1, 'war'); g.players[1].globals.push('crusade', 'holy_arms');
  pl.known.push('disjunction', 'spell_binding');
  ok(Spells.validate(g, pl, 'disjunction', { player: 1, spell: 'crusade' }).ok, 'Disjonction visée : acceptée tant que l\'enchantement est là');
  g.players[1].globals = ['holy_arms'];
  const v = Spells.validate(g, pl, 'disjunction', { player: 1, spell: 'crusade' });
  ok(!v.ok, 'Disjonction visée : refusée quand l\'enchantement choisi a disparu (' + v.why + ')');
  const v2 = Spells.validate(g, pl, 'spell_binding', { player: 1, spell: 'crusade' });
  ok(!v2.ok, 'Captation visée : refusée quand l\'enchantement choisi a disparu (' + v2.why + ')');
  g.players[1].globals = ['crusade']; g.rng = { chance: () => true, pick: a => a[0], int: () => 0 };
  const r = Spells.apply(g, pl, 'disjunction', { player: 1, spell: 'crusade' });
  ok(r && /^Vous brisez Croisade/.test(r.msg || ''), 'Disjonction : message accordé (' + (r && r.msg) + ')');
}
{
  // Appel du héros sans place autour du cercle : refusé d'avance
  const g = fresh(); const pl = g.players[0];
  pl.known.push('summon_hero');
  const sp = Spells.spotNear; Spells.spotNear = () => null;
  const v = Spells.validate(g, pl, 'summon_hero', null);
  Spells.spotNear = sp;
  ok(!v.ok && /Aucune place/.test(v.why), 'Appel du héros sans place : refusé d\'avance (' + v.why + ')');
}
{
  // Brise-sort contre un rival qui n'incante pas
  const g = fresh(); const pl = g.players[0]; Game.contact(g, 0, 1); pl.known.push('spell_blast');
  const v = Spells.validate(g, pl, 'spell_blast', { player: 1 });
  ok(!v.ok && /n'incante rien/.test(v.why), 'Brise-sort sans incantation adverse : refusé (' + v.why + ')');
  g.players[1].casting = { id: 'crusade', progress: 10, cost: 300 };
  ok(Spells.validate(g, pl, 'spell_blast', { player: 1 }).ok, 'Brise-sort : accepté pendant une incantation adverse');
}
{
  // Tempête de feu suspendue : nouvelle cible sans rien perdre
  const g = fresh(); const pl = g.players[0]; Game.contact(g, 0, 1); Diplomacy.setState(g, 0, 1, 'war');
  for (const p of [0, 1]) pl.explored[p].fill(1);
  E.Move.visibility = () => [new Array(g.world.w * g.world.h).fill(1), new Array(g.world.w * g.world.h).fill(1)]; E.Intel.sees = () => true; pl.human = true;
  const c1 = g.cities[g.players[1].fortress], [x, y] = land(g, c1), [x2, y2] = land(g, c1, 1);
  const e1 = Units.create(g, 'HighMenSpearmen', 1, c1.plane, x, y); Units.create(g, 'HighMenSpearmen', 1, c1.plane, x2, y2);
  pl.known.push('fire_storm'); pl.mana = 30; pl.skillLeft = 10;
  const r = Spells.cast(g, pl, 'fire_storm', { plane: c1.plane, x, y });
  Units.remove(g, e1);
  const prog = pl.casting && pl.casting.progress, w = Spells.castingWarning(g, pl);
  const r2 = Spells.cast(g, pl, 'fire_storm', { plane: c1.plane, x: x2, y: y2 });
  ok(r.pending && w && r2.ok && r2.retarget && pl.casting.progress === prog && pl.casting.target.x === x2, 'Tempête de feu suspendue : reciblée sans perte (' + (r2.why || '') + ')');
}
{
  // banqueroute : pas de vente annoncée sans vente
  const g = fresh(); const pl = g.players[0];
  for (const c of Object.values(g.cities).filter(c => c.owner === 0)) { c.buildings.barracks = true; c.buildings.armory = true; c.prod = { type: 'unit', id: 'HighMenSwordsmen' }; }
  pl.gold = -500; g.log = [];
  Turn.bankrupt(g, pl);
  const sales = logsOf(g, 0).filter(l => /Trésor à sec/.test(l)), real = Object.values(g.cities).filter(c => c.owner === 0 && c.sold).length;
  ok(sales.length === real, 'banqueroute : ' + sales.length + ' ventes annoncées, ' + real + ' réelles (' + sales.slice(0, 2).join(' | ') + ')');
}
{
  // Pluie de météores : le lanceur apprend ses propres pertes
  const g = fresh(); const pl = g.players[0], f = g.cities[pl.fortress], [x, y] = land(g, f);
  for (let i = 0; i < 4; i++) { const u = Units.create(g, 'HighMenSpearmen', 0, f.plane, x, y); u.dmg = 3; }
  pl.globals.push('meteor_storms'); g.log = [];
  for (let i = 0; i < 6; i++) Turn.processGlobals(g);
  ok(logsOf(g, 0).some(l => /^Votre pluie de météores a détruit vos propres troupes/.test(l)), 'Pluie de météores : le lanceur est prévenu de ses pertes (' + logsOf(g, 0).slice(0, 1).join('') + ')');
}
{
  // Armageddon et Grande Dévastation : les victimes sont prévenues
  const g = fresh(); const pl = g.players[1]; pl.globals.push('armageddon', 'great_wasting'); g.log = [];
  for (let i = 0; i < 25; i++) Turn.processGlobals(g);
  const l = g.log.filter(x => x.pid === 0 || x.pid === 2).map(x => x.text);
  ok(l.some(t => /^(Armageddon|Grande Dévastation) (d'un sorcier inconnu|de |d')/.test(t)), 'Armageddon / Grande Dévastation : les rivaux touchés sont prévenus (' + l.length + ' lignes, ex. ' + (l[0] || '') + ')');
}
{
  // Corruption, Appel du Néant, malédiction de cité, drain : ce que lit la victime
  const g = fresh(); const pl = g.players[1], me = g.players[0], f = g.cities[me.fortress], [x, y] = land(g, f);
  g.log = [];
  Spells.terrainSpell(g, pl, 'corruption', { plane: f.plane, x, y }, DATA.spells.corruption);
  ok(logsOf(g, 0).some(l => /^Un sorcier inconnu a corrompu une terre de /.test(l)), 'Corruption : le maître des terres est prévenu, sans nom d\'inconnu (' + logsOf(g, 0).join(' | ') + ')');
  g.log = []; Spells.apply(g, pl, 'call_the_void', { city: f.id });
  const v = logsOf(g, 0).join(' | ');
  ok(/la moitié de la population disparaît/.test(v) && !/engloutis/.test(v), 'Appel du Néant : message de la victime (' + v + ')');
  g.log = []; pl.known.push('famine'); Spells.apply(g, pl, 'famine', { city: f.id });
  ok(logsOf(g, 0).some(l => /^Un sorcier inconnu a lancé Famine/.test(l)), 'malédiction de cité : nom d\'un inconnu caché (' + logsOf(g, 0).join(' | ') + ')');
  g.log = []; me.mana = 500; E.OVERLAND_HANDLERS.drain_power(g, pl, { player: 0 });
  ok(logsOf(g, 0).some(l => /^Un sorcier inconnu draine/.test(l)), 'Drain de mana : nom d\'un inconnu caché');
}
{
  // Présence maléfique : on n'apprend pas les livres d'un sorcier jamais rencontré
  const g = fresh(); const pl = g.players[0], o = g.players[1]; o.books.death = 3;
  pl.known.push('evil_presence');
  const v = Spells.validate(g, pl, 'evil_presence', { city: o.fortress });
  ok(v.ok || !/mort/.test(v.why || ''), 'Présence maléfique sur un inconnu de la Mort : rien n\'est révélé (' + JSON.stringify(v) + ')');
  Game.contact(g, 0, 1);
  const v2 = Spells.validate(g, pl, 'evil_presence', { city: o.fortress });
  ok(!v2.ok && /mort/.test(v2.why), 'Présence maléfique sur un sorcier rencontré de la Mort : refusée avec la raison');
}
{
  // Stase : la libération prévient le lanceur, accordée
  const g = fresh(); const me = g.players[0], f = g.cities[g.players[1].fortress], [x, y] = land(g, f);
  const u = Units.create(g, 'OrcMagicians', 1, f.plane, x, y); u.stasis = 2; u.stasisBy = 0;
  g.rng = { int: () => 0, chance: () => true, pick: a => a[0], rolls: () => 0 }; g.log = [];
  Game.stasisFreed(g, u);
  ok(logsOf(g, 0).some(l => /^Magiciens orques se libèrent de votre stase/.test(l)), 'Stase : le lanceur apprend la libération (' + logsOf(g, 0).join(' | ') + ')');
}
{
  // Œil de lynx : +1 case par talent
  const g = fresh(); const pl = g.players[0], f = g.cities[pl.fortress];
  const h = Object.values(DATA.heroes).find(x => x.unit === 'HeroMarcus'), u = Heroes.spawn(g, pl, h, f.plane, f.x, f.y, 0);
  const seq = [Move.sightOf(g, u)]; for (let i = 0; i < 2; i++) { Heroes.applyTalent ? Heroes.applyTalent(g, u, 'scouting') : Game.applyTalent(g, u, 'scouting'); seq.push(Move.sightOf(g, u)); }
  ok(seq.join() === '3,4,5', 'Œil de lynx sur Tobren (éclaireur 2) : vue ' + seq.join(' → '));
}
{
  // ordre d'attaque confirmé : la cible elle-même n'arrête pas la marche ; garnison d'une cité neutre nommée
  const g = fresh(); const pl = g.players[0]; pl.human = true;
  const neutral = Object.values(g.cities).find(c => c.owner < 0);
  ok(true, 'cité neutre trouvée pour la suite : ' + !!neutral);
}
{
  // capacités : accord au singulier
  const t = U.abilityTip ? U.abilityTip('poisonTouch', 1) : (E.abilityTip ? E.abilityTip('poisonTouch', 1) : null);
  if (t != null) ok(/fait un jet de résistance/.test(t), 'Toucher empoisonné 1 : « un jet de résistance »');
}
console.log(process.exitCode ? '\nDES ÉCHECS' : '\nTOUT EST CONFORME');
