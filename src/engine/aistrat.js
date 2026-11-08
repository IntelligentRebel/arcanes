'use strict';
// Stratégie de l'IA (ajouts d'Arcanes, dès Normale) : un plan explicite, tenu au moins 10 tours puis réexaminé, que ses émissaires
// laissent entendre ; une armée de frappe qui se rassemble face à sa cible ; des troupes choisies contre ce qu'aligne l'ennemi ;
// des recherches qui répondent à ses sorts globaux. Tout part de ce que le sorcier sait (renseignement), jamais de l'état caché.

Object.assign(AI, {
  PLAN_NAMES: { war: 'campagne', defend: 'défense', expand: 'expansion', build: 'développement' },
  planReview(game, pl) {
    if (!AI.feat(pl, 'plan', 1)) { pl.aiPlan = null; return; }
    const P = pl.aiPlan;
    const broken = P && P.kind === 'war' && (!game.players[P.target] || !game.players[P.target].alive || pl.diplo[P.target] !== 'war');
    if (P && game.turn < P.review && !broken) return;
    const next = AI.choosePlan(game, pl);
    const same = P && P.kind === next.kind && P.target === next.target;
    if (!same) AI.announcePlan(game, pl, next);
    pl.aiPlan = Object.assign(next, { since: same ? P.since : game.turn, review: game.turn + 10 });
  },
  choosePlan(game, pl) {
    const myPow = Diplomacy.power(game, pl), cities = Cities.ofPlayer(game, pl.id);
    if (!cities.length) return { kind: 'build' };
    const enemies = game.players.filter(o => o.alive && o.id !== pl.id && pl.diplo[o.id] === 'war');
    const pow = o => Intel.powerOf(game, pl, o.id);
    // menacé par plus fort que soi : défense
    const threat = U.sum(cities, c => AI.threatNear(game, pl, c));
    const strongest = U.max(enemies, pow);
    if (strongest && pow(strongest) > myPow * 1.3 && threat > myPow * 0.15) return { kind: 'defend', target: strongest.id };
    // en guerre contre un ennemi à portée qu'on peut battre : campagne contre lui
    const known = Intel.knownCities(game, pl);
    const near = o => U.min(known.filter(c => c.owner === o.id).flatMap(c => cities.filter(m => m.plane === c.plane).map(m => World.dist(game.world, c.x, c.y, m.x, m.y))), d => d);
    const prey = U.min(enemies.filter(o => (near(o) ?? 99) <= 20 && pow(o) < myPow * 1.2), o => pow(o) / Math.max(1, myPow) + (near(o) || 0) / 40);
    if (prey) return { kind: 'war', target: prey.id };
    // de la place et des colons possibles : expansion
    const maxCities = pl.aiPersonality === 'expansionist' ? 14 : pl.aiPersonality === 'perfectionist' ? 7 : 10;
    if (cities.length < maxCities && cities.some(c => AI.hasRoomToExpand(game, pl, c))) return { kind: 'expand' };
    return { kind: 'build' };
  },
  // les émissaires : ce que le sorcier laisse entendre de ses intentions à ceux qui le connaissent
  announcePlan(game, pl, next) {
    if (!AI.feat(pl, 'emissaries', 1)) return;
    for (const v of game.players) {
      if (!v.alive || v.id === pl.id || !v.human || !pl.contact[v.id]) continue;
      const nm = U.cap(Players.nameFor(game, v.id, pl.id));
      let t = null;
      if (next.kind === 'war') t = next.target === v.id ? 'Les émissaires de ' + nm + ' ne s\'en cachent plus : ses armées se rassemblent contre vous.' : 'Selon ses émissaires, ' + nm + ' porte la guerre chez ' + Players.nameFor(game, v.id, next.target) + '.';
      else if (next.kind === 'defend') t = 'Les émissaires de ' + nm + ' parlent de remparts et de levées : il se retranche face à ' + (next.target === v.id ? 'vous' : Players.nameFor(game, v.id, next.target)) + '.';
      else if (next.kind === 'expand') t = 'Les émissaires de ' + nm + ' vantent les terres libres : il fonde de nouvelles cités.';
      if (t) pl.aiPlanSaid = Object.assign(pl.aiPlanSaid || {}, { [v.id]: { kind: next.kind, target: next.target, turn: game.turn } });
      if (t) Game.log(game, v.id, t, { diplo: pl.id, minor: next.kind !== 'war' || next.target !== v.id, alert: next.kind === 'war' && next.target === v.id });
    }
  },
  plan(pl) { return AI.feat(pl, 'plan', 1) ? pl.aiPlan || null : null; },
  // le point de rassemblement d'une campagne : notre cité la plus proche de la cité ennemie la plus proche
  stagingCity(game, pl, target) {
    const mine = Cities.ofPlayer(game, pl.id), theirs = Intel.knownCities(game, pl).filter(c => c.owner === target);
    let best = null, bd = Infinity;
    for (const m of mine) for (const c of theirs) {
      if (m.plane !== c.plane) continue;
      const d = World.dist(game.world, m.x, m.y, c.x, c.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best && bd <= 25 ? best : null;
  },

  // ---------- adaptation à l'armée adverse ----------
  // ce qu'alignent nos ennemis (unités vues ces 20 derniers tours) : part de volants, de tireurs, de créatures
  foeMix(game, pl) {
    const c = pl._foeMix; if (c && c.turn === game.turn) return c.mix;
    const seen = new Map();
    for (const k in pl.intel || {}) {
      const rec = pl.intel[k]; if (game.turn - rec.t > 20) continue;
      for (const u of rec.units) if (u.owner >= 0 && u.owner !== pl.id && pl.diplo[u.owner] === 'war' && !seen.has(u.id)) seen.set(u.id, u);
    }
    let n = 0, fly = 0, rng = 0, fan = 0, mag = 0;
    for (const u of seen.values()) {
      const d = DATA.units[u.type]; if (!d || d.abilities.createOutpost || d.abilities.construction) continue;
      const w = Units.strength(game, u); n += w;
      if (d.flying) fly += w; if (d.ranged > 0 && d.rangedType) rng += w; if (Units.isFantastic(u)) fan += w;
      if ((d.ranged > 0 && d.rangedType === 'magic') || (d.abilities && d.abilities.caster)) mag += w;
    }
    const mix = n > 0 ? { fly: fly / n, ranged: rng / n, fantastic: fan / n, magic: mag / n, n: seen.size } : null;
    pl._foeMix = { turn: game.turn, mix };
    return mix;
  },
  // multiplicateur de valeur d'une troupe face à ce mélange : des tireurs et des volants contre les volants,
  // de la vitesse et de l'armure contre les tireurs
  adaptFactor(game, pl, t) {
    if (!AI.feat(pl, 'adapt', 1)) return 1;
    const m = AI.foeMix(game, pl); if (!m || m.n < 4) return 1;
    const d = DATA.units[t]; let k = 1;
    if (m.fly >= 0.3 && (d.ranged > 0 || d.flying)) k *= 1 + 0.5 * (m.fly - 0.2);
    if (m.fly >= 0.3 && !(d.ranged > 0) && !d.flying && !(d.abilities.thrown || d.abilities.fireBreath || d.abilities.lightningBreath)) k *= 1 - 0.4 * (m.fly - 0.2);
    if (m.ranged >= 0.4 && (d.move >= 2 || d.flying || d.def >= 4)) k *= 1 + 0.3 * (m.ranged - 0.3);
    // contre des lanceurs de sorts : de la résistance, ou l'immunité à la magie
    if (m.magic >= 0.3 && (d.res >= 8 || (d.abilities && d.abilities.magicImmunity))) k *= 1 + 0.4 * (m.magic - 0.2);
    return k;
  },
  // sorts globaux ennemis qui nous nuisent : la Disjonction vaut d'être cherchée
  HOSTILE_GLOBALS: ['armageddon', 'great_wasting', 'zombie_mastery', 'eternal_night', 'evil_omens', 'meteor_storms', 'doom_mastery', 'chaos_surge', 'natures_wrath', 'time_stop', 'suppress_magic', 'planar_seal', 'tranquility', 'life_force', 'crusade', 'holy_arms'],
  counterResearch(game, pl, id) {
    if (!AI.feat(pl, 'counters', 1) || !/^disjunction/.test(id)) return 0;
    const bad = game.players.some(o => o.alive && o.id !== pl.id && pl.contact[o.id] && pl.diplo[o.id] !== 'alliance' && (o.globals || []).some(g => AI.HOSTILE_GLOBALS.includes(g)));
    return bad ? 60 : 0;
  },
});

// ---------- Difficile : construire par rentabilité ----------
// Au lieu d'un ordre fixe, chaque bâtiment possible est jugé sur ce qu'il rapporte par tour (or, production, nourriture,
// puissance, recherche, croissance : le calcul même de l'économie de la cité, bâtiment ajouté), rapporté à son coût ;
// un bâtiment qui en ouvre un autre rentable en reçoit une part. Les bâtiments militaires ont une valeur stratégique.
Object.assign(AI, {
  // ce qu'un ensemble de bâtiments ajoutés rapporte par tour, en équivalent or
  buildGain(game, c, e, add, goldW) {
    const bs = Object.assign({}, c.buildings); for (const b of add) bs[b] = true;
    const e2 = Cities.econ(game, Object.assign({}, c, { buildings: bs }));
    const d = k => (e2[k] || 0) - (e[k] || 0);
    const pl = game.players[c.owner], gp = AI.tune(pl, 'bgPop');
    let v = goldW * d('gold') + 1.2 * d('prod') + 0.8 * gp * d('foodSurplus') + 1.5 * AI.tune(pl, 'bgPower') * d('power') + 1.0 * d('research') + 0.02 * gp * d('growth');
    const room = e.maxPop - e.citizens;
    v += gp * d('maxPop') * (room <= 2 ? 1.5 : room <= 5 ? 0.6 : 0.2);
    return v;
  },
  STRAT_BUILD: { barracks: 2.5, smithy: 2, armory: 1.6, stables: 1, fightersGuild: 1.4, armorersGuild: 1.2, warCollege: 1.2, fantasticStable: 0.8, alchemistsGuild: 1.2, shipwrightsGuild: 0.2, shipYard: 0.2, maritimeGuild: 0.2, magicRelay: 0.6 },
  stratValue(game, pl, c, b, threat, e) {
    let v = AI.STRAT_BUILD[b] || 0;
    const front = threat > 0 || Intel.knownCities(game, pl).some(o => o.owner >= 0 && o.owner !== pl.id && o.plane === c.plane && World.dist(game.world, o.x, o.y, c.x, c.y) <= 10);
    if (b === 'cityWalls') v = threat > 0 ? 4 : front || c.fortress ? 1.5 : e.citizens >= 8 ? 0.6 : 0.1;
    if (b === 'defenseTowers') v = threat > 0 ? 3 : front ? 0.8 : 0.1;
    if (['armory', 'fightersGuild', 'armorersGuild', 'warCollege'].includes(b) && front) v *= 1.5;
    // (à l'essai, towers_more) des murailles dès 5 habitants, et les tours de défense dès qu'il y a des murailles
    if (AI.opt(pl, 'towers_more')) { if (b === 'cityWalls' && e.citizens >= 5) v = Math.max(v, 2); if (b === 'defenseTowers') v = Math.max(v, 2.5); }
    if (b === 'cityWalls' || b === 'defenseTowers') v *= AI.tune(pl, 'wallsValue');
    return v;
  },
  bestBuilding(game, c, e, pl, threat) {
    const income = Players.goldPerTurn(game, pl).gold, goldW = income < 3 ? 2 : income < 10 ? 1.3 : 1;
    const all = Object.keys(DATA.buildings).filter(b => !c.buildings[b] && DATA.buildings[b].cost > 0 && !(DATA.buildings[b].effects || {}).governor);   // le palais du gouverneur : règle à part (essai governor)
    const can = all.filter(b => Cities.canBuild(game, c, b));
    if (!can.length) return null;
    let best = null, bs = 0;
    for (const b of can) {
      const bd = DATA.buildings[b];
      let v = AI.buildGain(game, c, e, [b], goldW) + AI.stratValue(game, pl, c, b, threat, e);
      // ce qu'il ouvre : la moitié de la valeur des trois meilleurs bâtiments dont il est le dernier prérequis manquant
      const opens = [];
      for (const x of all) {
        const req = DATA.buildings[x].requires || [];
        if (!req.includes(b) || req.some(r => r !== b && !c.buildings[r])) continue;
        const vx = AI.buildGain(game, c, e, [b, x], goldW) - AI.buildGain(game, c, e, [b], goldW) + AI.stratValue(game, pl, c, x, threat, e);
        if (vx > 0) opens.push(vx * bd.cost / (bd.cost + DATA.buildings[x].cost));
      }
      v += 0.5 * opens.sort((p, q) => q - p).slice(0, 3).reduce((p, q) => p + q, 0);
      if (v <= 0.3) continue;
      const sc = v / bd.cost;
      if (sc > bs) { bs = sc; best = b; }
    }
    return best;
  },
});

// ---------- Difficile : voir venir ----------
// les forces hostiles vues ces deux derniers tours à dix cases ou moins d'une cité, qui peuvent l'atteindre d'ici quatre tours
Object.assign(AI, {
  incoming(game, pl, c) {
    const key = game.turn + ':' + c.id, m = (pl._inc = pl._inc && pl._inc.turn === game.turn ? pl._inc : { turn: game.turn, v: {} });
    if (m.v[key]) return m.v[key];
    let str = 0, eta = 99;
    for (const rec of Intel.recent(game, pl)) {
      if (rec.plane !== c.plane) continue;
      const d = World.dist(game.world, rec.x, rec.y, c.x, c.y); if (d > 10 || d === 0) continue;
      if (Cities.at(game, rec.plane, rec.x, rec.y)) continue;   // une garnison chez elle ne marche pas sur nous
      const hostile = rec.units.filter(u => u.owner !== pl.id && (u.owner < 0 ? !u.guardian : Players.isAtWar(game, pl.id, u.owner)) && !DATA.units[u.type].abilities.createOutpost);
      if (!hostile.length) continue;
      const speed = Math.max(1, Math.floor(Math.min(...hostile.map(u => Units.maxMoves(game, u))) / 2));
      const t = Math.ceil(d / speed); if (t > 4) continue;
      str += U.sum(hostile, u => Units.strength(game, u)); eta = Math.min(eta, t);
    }
    return (m.v[key] = { str, eta });
  },
});

// ---------- Difficile : budget et recherche ----------
Object.assign(AI, {
  // l'impôt : or gagné moins la production perdue en rebelles, sur toutes les cités (taux 0 à 4 essayés)
  bestTax(game, pl) {
    const cities = Cities.ofPlayer(game, pl.id); if (!cities.length) return;
    const t0 = pl.taxIdx, low = pl.gold < 80;
    let best = t0, bs = -Infinity;
    for (let t = 0; t <= 4; t++) {
      pl.taxIdx = t;
      let gold = 0, prod = 0, food = 0;
      for (const c of cities) { const e = Cities.econ(game, c); gold += e.gold; prod += e.prod; food += e.foodSurplus; }
      const sc = gold * (low ? 1.6 : 1) * AI.tune(pl, 'taxGold') + prod * 1.2 + food * 0.6 + (t === t0 ? 0.5 : 0);
      if (sc > bs) { bs = sc; best = t; }
    }
    pl.taxIdx = best;
  },
  // la puissance : la compétence quand un sort long attend, le mana quand il manque, la recherche quand rien ne presse
  bestSplit(game, pl, cur) {
    const mpt = Magic.manaPerTurn(game, pl);
    let mana = 35, research = 35, skill = 30;
    if (pl.casting && Spells.castingTurns(game, pl) > 4) { skill += 15; research -= 10; mana -= 5; }
    if (pl.mana < 60 || mpt < 3) { mana += 15; research -= 10; skill -= 5; }
    else if (pl.mana > 600 && !pl.casting) { mana -= 15; research += 15; }
    if (pl.researching) {
      const left = Magic.researchCost(pl, pl.researching) - pl.researchProgress, rp = Math.max(1, Magic.effectiveResearch(game, pl, pl.researching));
      if (left / rp <= 3) { research += 5; mana -= 5; }   // le sort est à portée : on l'achève
    }
    const bm = AI.tune(pl, 'splitMana'), br = AI.tune(pl, 'splitResearch'); mana += bm; research += br; skill -= bm + br;
    const s = { mana: Math.max(10, mana), research: Math.max(10, research), skill: Math.max(10, skill) };
    const k = 100 / (s.mana + s.research + s.skill);
    s.mana = Math.round(s.mana * k); s.skill = Math.round(s.skill * k); s.research = 100 - s.mana - s.skill;
    return s;
  },
  // une invocation vaut ce qu'elle apporte de plus que la meilleure déjà connue (force par mana)
  summonGain(game, pl, id) {
    const sp = DATA.spells[id], u = sp && sp.params && sp.params.unit; if (!u || !DATA.units[u]) return 15;
    if (DATA.units[u].abilities.meld) return 20;   // esprits : les nœuds
    const val = (t, cost) => Units.strength(game, { type: t, ench: [], xp: 0, owner: pl.id, dmg: 0 }) / Math.sqrt(Math.max(10, cost));
    let best = 0;
    for (const k of pl.known) { const s = DATA.spells[k]; if (s && s.kind === 'summon' && s.params && s.params.unit && DATA.units[s.params.unit] && !DATA.units[s.params.unit].abilities.meld) best = Math.max(best, val(s.params.unit, s.cost)); }
    const mine = val(u, sp.cost);
    if (!best) return 40;
    return 10 + 45 * U.clamp(mine / best - 1, 0, 1.2);
  },
});

// ---------- enchantements globaux : ce que vaut chacun, ici et maintenant ----------
Object.assign(AI, {
  // l'enchantement global à viser : précieux, entretien tenable sur le revenu, à portée d'une vingtaine de tours d'économies
  globalGoal(game, pl, inc) {
    let best = null, bv = 0;
    for (const id of pl.known) {
      const sp = DATA.spells[id]; if (!sp || sp.kind !== 'global' || id === 'spell_of_mastery') continue;
      if (game.players.some(o => o.alive && o.globals.includes(id))) continue;
      const v = AI.globalValue(game, pl, id); if (v < 20) continue;
      if ((sp.upkeep || 0) > Math.max(2, inc)) continue;
      const cost = Magic.spellCost(game, pl, id, false);
      const stock = pl.mana + Math.max(0, pl.gold - 400) / (pl.retorts.includes('alchemy') ? 1 : 2);
      if (cost > stock + Math.max(1, inc) * 20) continue;
      if (v > bv) { bv = v; best = { id, cost, v }; }
    }
    return best;
  },
  globalValue(game, pl, id) {
    const others = game.players.filter(o => o && o.alive && o !== pl && pl.contact[o.id]);
    const atWar = others.some(o => pl.diplo[o.id] === 'war');
    const foeBooks = (...rs) => U.sum(others, o => U.sum(rs, r => (o.books && o.books[r]) || 0));
    const army = Object.values(game.units).filter(u => u.owner === pl.id);
    const normals = army.filter(u => Units.isNormal(u)).length;
    const mine = r => army.filter(u => Units.isFantastic(u) && DATA.units[u.type].realm === r).length;
    switch (id) {
      case 'just_cause': return 30;
      case 'aura_of_majesty': return 28;
      case 'detect_magic': case 'awareness': case 'natures_awareness': return 22;
      case 'wind_mastery': return 12;
      case 'holy_arms': case 'crusade': return normals >= 6 ? 40 : 15;
      case 'charm_of_life': return 35;
      case 'life_force': return AI.feat(pl, 'spells2') ? (foeBooks('death') >= 6 ? 35 : 0) : 30;   // (en essai : rien à gagner sans rival de la Mort)
      case 'herb_mastery': return 30;
      case 'tranquility': return foeBooks('chaos') >= 6 ? 35 : 0;
      case 'evil_omens': return foeBooks('life', 'nature') >= 6 ? 35 : 5;
      case 'natures_wrath': return foeBooks('chaos', 'death') >= 6 ? 40 : 5;
      case 'eternal_night': return mine('death') >= 3 ? 35 : 10;
      case 'chaos_surge': return mine('chaos') >= 3 ? 35 : 5;
      case 'zombie_mastery': case 'doom_mastery': return 25;
      case 'suppress_magic': return 30;
      case 'meteor_storms': return atWar ? 40 : 0;
      case 'great_wasting': return atWar ? 35 : 0;
      case 'armageddon': return atWar ? 45 : 0;
      case 'time_stop': return atWar ? 45 : 0;
      case 'planar_seal': return 0;
      default: return 20;
    }
  },
});

// ---------- Hardcore : des armées taillées pour la cité visée ----------
Object.assign(AI, {
  // la troupe qui vainc le mieux, à budget égal, les défenseurs connus de la cité visée (combats simulés)
  tailorUnit(game, pl, c, cands) {
    const tg = pl.aiTargetCity && game.turn - pl.aiTargetCity.turn <= 10 ? pl.aiTargetCity : null;
    if (!tg || !cands.length) return null;
    const key = game.turn + ':' + tg.plane + ',' + tg.x + ',' + tg.y + ':' + cands.join(',');
    if (pl._tailor && pl._tailor.key === key) return pl._tailor.best;
    const info = Intel.defenders(game, pl, tg.plane, tg.x, tg.y), defs = info ? info.units : [];
    const city = Cities.at(game, tg.plane, tg.x, tg.y);
    let best = null, bs = -1;
    if (defs.length) {
      const e = Cities.econ(game, c), budget = 360;
      for (const t of cands) {
        const cost = Math.max(20, Cities.unitCost(game, c, t, e)), n = U.clamp(Math.round(budget / cost), 1, MAX_STACK);
        const army = []; for (let i = 0; i < n; i++) { const u = Units.create(game, t, pl.id, tg.plane, tg.x, tg.y); delete game.units[u.id]; u.weapon = Units.weaponFor(t, e.weapon); army.push(u); }
        const win = AI.simulate(game, army, defs, { plane: tg.plane, x: tg.x, y: tg.y, city }, 3);
        const sc = win + U.sum(army, u => Units.strength(game, u)) / 100000;   // à égalité : le plus fort
        if (sc > bs) { bs = sc; best = t; }
      }
      if (bs < 0.05) best = null;   // rien n'y suffit seul : on garde le choix habituel
    }
    pl._tailor = { key, best };
    return best;
  },
});
