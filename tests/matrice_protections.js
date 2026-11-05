'use strict';
// Matrice des protections : chaque protection (Droiture, Immunité magique, immunités au feu, au froid, à la mort, aux illusions,
// à la pétrification, Charmé, et les bonus Bénédiction, Résistance à la magie, aux éléments, Armure élémentaire)
// face à chaque sort hostile, en combat et sur la carte. On compare ce que promettent les textes à ce qui arrive :
//   immunité promise  → l'unité protégée ne subit jamais aucun mal, et le sort ne la propose pas comme cible ;
//   bonus promis      → l'unité protégée ne souffre jamais plus que la même sans protection.
// « Subir un mal » : perdre des PV ou des figurines, mourir, être maudite, endormie, confuse, prise dans une toile, possédée,
// figée par la terreur ou en stase, perdre des munitions ou du mana, voir baisser une caractéristique (un bonus ne compte pas).
// Chaque paire est jouée 40 fois (tirages différents) contre une unité protégée et la même sans protection.
// node tests/matrice_protections.js [filtre de sort] [--verbeux]
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, Cities, World, Spells, Battle, CombatSpells, RNG, DATA, Turn } = E;
const ARGS = process.argv.slice(2), FILTRE = ARGS.find(a => !a.startsWith('--')) || '', VERBEUX = ARGS.includes('--verbeux');
const N = 40;

// ---------- ce que promettent les textes ----------
const dmgType = sp => (sp.params && sp.params.damage) || ({ fire_bolt: 'fire', fireball: 'fire', flame_strike: 'fire', fire_storm: 'fire', meteor_storms: 'fire', immolation: 'fire', ice_bolt: 'cold', ice_storm: 'cold', lightning_bolt: 'lightning', warp_lightning: 'lightning', call_lightning: 'lightning' }[sp.id]) || null;
// les sorts qui passent par un jet de résistance (ceux contre lesquels Charmé protège) : relevés dans le code des effets
const RESIST_IDS = Object.keys(CombatSpells.RESIST_SPELLS).concat(['life_drain', 'disintegrate', 'holy_word', 'death_spell', 'terror', 'wrack', 'black_wind', 'death_wish', 'great_unsummoning']);
const RESIST = sp => RESIST_IDS.includes(sp.id);
// Immunité magique (« insensible aux sorts qui la visent, aux tirs magiques, souffles, regards… ; seuls les enchantements
// de combat qui affaiblissent tout un camp l'atteignent ») ; Trait funeste et Appel des failles le disent dans leur propre texte
const FIELD = ['black_prayer', 'darkness', 'warp_reality', 'entangle', 'mana_leak'];
const BYPASS_MI = FIELD.concat(['doom_bolt', 'cracks_call']);
// Appel du chaos : chaque effet tiré passe par les protections du sort seul ; le Trait funeste y atteint l'immunisé (1 sur 8)
const PARTIAL = { 'call_chaos×immunite_magique': 0.25 };
const PROT = {
  // Droiture : « totalement immunisée aux sorts et attaques magiques de mort et de chaos »
  droiture: { ench: 'righteousness', immune: sp => ['death', 'chaos'].includes(sp.realm) },
  immunite_magique: { ab: 'magicImmunity', immune: sp => !BYPASS_MI.includes(sp.id) },
  feu: { ab: 'fireImmunity', immune: sp => dmgType(sp) === 'fire' },
  froid: { ab: 'coldImmunity', immune: sp => dmgType(sp) === 'cold' },
  // immunité à la mort : « regard et toucher mortels, vol de vie, terreur ; résistance 50 contre les sorts de Mort »
  mort: { ab: 'deathImmunity', immune: sp => sp.realm === 'death' && RESIST(sp) },
  illusions: { ab: 'illusionsImmunity', immune: sp => ['mind_storm'].includes(sp.id) },
  petrification: { ab: 'stoningImmunity', immune: sp => sp.id === 'petrify' },
  // Charmé : « insensible aux sorts qui exigent un jet de résistance et à la terreur »
  charme: { ab: 'charmed', immune: sp => RESIST(sp) },
  // bonus
  benediction: { ench: 'bless', bonus: sp => ['death', 'chaos'].includes(sp.realm) },
  resistance_magie: { ench: 'resist_magic', bonus: sp => true },
  resistance_elements: { ench: 'resist_elements', bonus: sp => ['nature', 'chaos'].includes(sp.realm) },
  armure_elementaire: { ench: 'elemental_armor', bonus: sp => ['nature', 'chaos'].includes(sp.realm) },
};

// ---------- le monde ----------
const G0 = Game.newGame({ seed: 515, mapW: 50, mapH: 34, opponents: 1, difficulty: 'normal', crisis: 'off', human: { name: 'Lanceur', portrait: 0, books: { chaos: 4, death: 4, sorcery: 3 }, retorts: [], race: 'highmen' } });
const clone = g => { const h = JSON.parse(JSON.stringify(Object.assign({}, g, { rng: g.rng.s }))); h.rng = new RNG(h.rng); Game.upgrade(h); return h; };
const f0 = G0.cities[G0.players[0].fortress];
const SPOT = World.neighbors(G0.world, f0.x, f0.y).find(([x, y]) => !World.isWaterAt(G0.world, f0.plane, x, y) && !Cities.at(G0, f0.plane, x, y) && World.get(G0.world, f0.plane, 'site', x, y) < 0);
E.Game.contact(G0, 0, 1); E.Diplomacy.setState(G0, 0, 1, 'war');

// un type d'unité qui porte en plus une capacité (immunités « par nature »)
function typeWith(base, ab) {
  if (!ab) return base;
  const id = 'T_' + base + '_' + ab;
  if (!DATA.units[id]) { const d = JSON.parse(JSON.stringify(DATA.units[base])); d.id = id; d.abilities = Object.assign({}, d.abilities, { [ab]: true }); DATA.units[id] = d; }
  return id;
}
const BASES = ['HighMenSwordsmen', 'HighMenBowmen', 'WarBear', 'Skeleton', 'HellHounds', 'Gargoyle', 'Zombie', 'GiantSpiders', 'Basilisk', 'Djinn', 'Wraiths', 'HighMenCavalry', 'Unicorn', 'HighMenMagician'].filter(t => DATA.units[t]);

// ---------- ce qu'une unité a subi en combat ----------
const STATS = ['melee', 'ranged', 'thrown', 'def', 'res', 'toHit', 'toDefend', 'move'];
const snapB = (bt, b) => { const s = bt.stats(b); return { dmg: b.u.dmg, dead: !!b.dead, curses: b.curses.length, asleep: !!b.asleep, confused: !!b.confused, web: b.web || 0, possessed: !!b.possessed, side: b.side, feared: !!b.feared, stasis: !!b.stasis, chan: b.u.chaosChannel || 0, ammo: b.ammo || 0, cm: b.casterMana || 0, st: STATS.map(k => Number(s[k]) || 0) }; };
function harmed(a, z) {
  if (z.dmg > a.dmg || (z.dead && !a.dead) || z.curses > a.curses || (z.asleep && !a.asleep) || (z.confused && !a.confused) || z.web > a.web) return true;
  if ((z.possessed && !a.possessed) || z.side !== a.side || (z.feared && !a.feared) || (z.stasis && !a.stasis) || z.chan !== a.chan || z.ammo < a.ammo || z.cm < a.cm) return true;
  return z.st.some((v, i) => v < a.st[i]);
}

// ---------- un essai en combat : le sort lancé sur l'unité visée (ou sur tout le camp adverse) ; ce qu'elle a subi ----------
function combatTrial(id, base, prot, seed) {
  const g = clone(G0), P = PROT[prot] || {};
  const type = typeWith(base, prot ? P.ab : null);
  const tgt = Units.create(g, type, 1, f0.plane, SPOT[0], SPOT[1]); if (prot && P.ench) tgt.ench.push(P.ench);
  const other = Units.create(g, 'HighMenSpearmen', 1, f0.plane, SPOT[0], SPOT[1]);
  const mine = [Units.create(g, 'HighMenSwordsmen', 0, f0.plane, SPOT[0], SPOT[1]), Units.create(g, 'HighMenSpearmen', 0, f0.plane, SPOT[0], SPOT[1])];
  const bt = new Battle(g, { attackers: mine, defenders: [tgt, other], attackerPid: 0, defenderPid: 1, plane: f0.plane, x: SPOT[0], y: SPOT[1], rng: new RNG(seed) });
  const b = bt.units.find(x => x.u === tgt);
  if (bt.stats(b).caster > 0) b.casterMana = Math.max(b.casterMana || 0, 20);
  bt.side = 0; bt.skillLeft[0] = 99999; g.players[0].mana = 99999; g.players[0].known.push(id);
  const tt = CombatSpells.targetType(id);
  const offered = tt === 'enemyUnit' ? CombatSpells.validTargets(bt, 0, id).includes(b) : null;
  const a = snapB(bt, b);
  let r;
  if (tt === 'enemyUnit') { if (!offered) return { offered, hit: false }; r = CombatSpells.cast(bt, 0, id, b, null, 0); }
  else r = CombatSpells.cast(bt, 0, id, null, null, 0);
  // les enchantements de champ agissent au round suivant (Supplice, Terreur, Fuite de mana…)
  if (DATA.spells[id].kind === 'combatEnchant') { bt.side = 1; bt.newRound && bt.newRound(); bt.resetMoves(1); }
  return { offered, hit: harmed(a, snapB(bt, b)), cast: r !== false };
}
// ---------- un essai sur la carte ----------
function mapTrial(id, base, prot, seed) {
  const g = clone(G0), P = PROT[prot] || {}, pl = g.players[0];
  g.rng = new RNG(seed);
  const type = typeWith(base, prot ? P.ab : null);
  const tgt = Units.create(g, type, 1, f0.plane, SPOT[0], SPOT[1]); if (prot && P.ench) tgt.ench.push(P.ench);
  pl.known.push(id); pl.mana = 99999; pl.skillLeft = 99999; pl.casting = null;
  const s0 = JSON.stringify([tgt.dmg, tgt.stasis || 0]);
  if (id === 'meteor_storms') { pl.globals.push(id); Turn.processGlobals(g); }
  else if (id === 'chaos_rift') { const c = g.cities[g.players[1].fortress]; tgt.x = c.x; tgt.y = c.y; tgt.plane = c.plane; c.ench.push({ spell: 'chaos_rift', owner: 0 }); Turn.cityEffects(g, c, g.players[1], Cities.econ(g, c)); }
  else if (id === 'call_the_void') { const c = g.cities[g.players[1].fortress]; tgt.x = c.x; tgt.y = c.y; tgt.plane = c.plane; E.Move.reveal(g, pl, c.plane, c.x, c.y, 2); Spells.cast(g, pl, id, { city: c.id }); }
  else { const tt = Spells.overlandTarget(id); const t = tt === 'none' ? null : { plane: f0.plane, x: SPOT[0], y: SPOT[1] }; Spells.cast(g, pl, id, t); }
  const gone = !g.units[tgt.id];
  return { hit: gone || JSON.stringify([tgt.dmg, tgt.stasis || 0]) !== s0 };
}

const COMBAT = Object.values(DATA.spells).filter(s => s.inGame !== false && s.combat && CombatSpells.implemented(s.id) && (CombatSpells.targetType(s.id) === 'enemyUnit' || ['flame_strike', 'death_spell', 'holy_word', 'call_chaos', 'terror', 'wrack', 'black_prayer', 'darkness', 'warp_reality', 'entangle', 'call_lightning', 'mana_leak'].includes(s.id))).map(s => s.id);
const MAP = ['fire_storm', 'ice_storm', 'black_wind', 'stasis', 'death_wish', 'great_unsummoning', 'meteor_storms', 'chaos_rift', 'call_the_void'];
const out = { fail: [], warn: [], ok: 0, skipped: [] };
const rate = (fn) => { let n = 0, off = 0; for (let i = 0; i < N; i++) { const r = fn(9000 + i * 7); if (r.hit) n++; if (r.offered === false) off++; } return { p: n / N, off }; };

for (const id of COMBAT.concat(MAP).filter(x => !FILTRE || x.includes(FILTRE))) {
  const sp = DATA.spells[id], isMap = MAP.includes(id);
  const trial = isMap ? mapTrial : combatTrial;
  // une unité sur laquelle le sort agit quand elle n'est pas protégée
  let base = null, ref = null;
  for (const b of BASES) { const r = rate(seed => trial(id, b, null, seed)); if (r.p > 0) { base = b; ref = r; break; } }
  if (!base) { out.skipped.push(id + ' : aucune unité de référence ne le subit'); continue; }
  for (const prot in PROT) {
    const P = PROT[prot];
    // une unité qui a déjà cette protection par nature ne sert pas de témoin
    if (P.ab && DATA.units[base].abilities && DATA.units[base].abilities[P.ab]) continue;
    const r = rate(seed => trial(id, base, prot, seed));
    const label = id + ' × ' + prot + ' (' + base + ')', lim = PARTIAL[id + '×' + prot];
    if (lim != null) { if (r.p > lim) out.fail.push(label + ' : touchée ' + Math.round(r.p * 100) + ' % des fois, au plus ' + Math.round(lim * 100) + ' % attendu'); else out.ok++; }
    else if (P.immune && P.immune(sp)) {
      if (r.p > 0) out.fail.push(label + ' : immunité promise, mais touchée ' + Math.round(r.p * 100) + ' % des fois (sans protection : ' + Math.round(ref.p * 100) + ' %)');
      else if (!isMap && CombatSpells.targetType(id) === 'enemyUnit' && r.off < N) out.warn.push(label + ' : immunisée mais proposée comme cible (sort gaspillé)');
      else out.ok++;
    } else if (P.immune && !P.immune(sp) && r.p === 0 && ref.p > 0) out.warn.push(label + ' : jamais touchée alors que le texte ne promet pas d\'immunité ici (sans protection : ' + Math.round(ref.p * 100) + ' %)');
    else if (P.bonus && P.bonus(sp)) { if (r.p > ref.p + 0.15) out.fail.push(label + ' : le bonus aggrave (' + Math.round(r.p * 100) + ' % contre ' + Math.round(ref.p * 100) + ' %)'); else out.ok++; }
    else out.ok++;
    if (VERBEUX) console.log(label, Math.round(r.p * 100) + ' %', 'réf', Math.round(ref.p * 100) + ' %', r.off ? '(non proposée ' + r.off + '/' + N + ')' : '');
  }
}
console.log('\n' + out.ok + ' paires conformes');
console.log('\nÉCHECS (' + out.fail.length + ')'); for (const l of out.fail) console.log('  ' + l);
console.log('\nÀ EXAMINER (' + out.warn.length + ')'); for (const l of out.warn) console.log('  ' + l);
console.log('\nNON TESTÉS (' + out.skipped.length + ')'); for (const l of out.skipped) console.log('  ' + l);
if (out.fail.length) process.exitCode = 1;
