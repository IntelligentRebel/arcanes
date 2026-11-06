'use strict';
// Cités : économie (formules de Master of Magic 1.31 d'après kazzmir), production, territoire.

const MAX_CITY_SIZE = 25;

// ---------- ouvrages de race (data/wonders.js) ----------
// un par race et par empire, dans une cité de cette race, après sa recherche ; il change de mains avec sa cité.
// pl.wonders : race -> id de la cité qui l'abrite, recalculé (Wonders.sync) à chaque tour et à chaque cité qui change de mains.
const Wonders = {
  // ouvrages qu'un sorcier peut bâtir en toute une partie (ceux qu'il prend avec une cité ne comptent pas) : le même pour
  // tous les niveaux et tous les sorciers. Au-delà, conquérir d'autres peuples rapporte leurs ouvrages déjà debout, pas de quoi en bâtir.
  CAP: 2,
  of(race) { return DATA.wonders && DATA.wonders[race]; },
  isWonder(b) { return !!(DATA.buildings[b] && DATA.buildings[b].wonder); },
  built(pl) { return (pl && pl.wondersBuilt) || 0; },
  // ouvrages bâtis, en chantier ou en file ailleurs que dans c
  used(game, pid, c) {
    let n = Wonders.built(game.players[pid]);
    for (const o of Cities.ofPlayer(game, pid)) if (!c || o.id !== c.id) {
      if (o.prod && o.prod.type === 'building' && Wonders.isWonder(o.prod.id)) n++;
      else if ((o.queue || []).some(q => q.type === 'building' && Wonders.isWonder(q.id))) n++;
    }
    return n;
  },
  // plans d'ouvrage en main, pas encore bâtis
  pendingLore(game, pl) { return (pl.lore || []).filter(l => { const r = DATA.spells[l] && DATA.spells[l].params.race; return r && !(pl.wonders || {})[r] && !(pl.builtRaces || []).includes(r); }).length; },
  has(game, pid, race) { const p = pid != null && pid >= 0 ? game.players[pid] : null; return !!(p && p.wonders && p.wonders[race] != null); },
  off(game) { return !!(game.opts && game.opts.noWonders); },
  sync(game) {
    if (!DATA.wonders) return;
    for (const p of game.players) if (p) p.wonders = {};
    for (const c of Object.values(game.cities)) {
      const p = c && c.owner >= 0 ? game.players[c.owner] : null; if (!p) continue;
      for (const race in DATA.wonders) if (c.buildings[DATA.wonders[race]]) p.wonders[race] = c.id;
    }
    // partie d'avant le plafond : ce qu'il tient compte comme bâti
    for (const p of game.players) if (p && p.wondersBuilt == null) p.wondersBuilt = Object.keys(p.wonders).length;
  },
  // les recherches d'ouvrage proposées : celles des races dont le sorcier tient (ou a tenu) une cité
  // (plus aucune une fois ses deux ouvrages bâtis, ou leurs plans en main)
  loreOptions(game, pl) {
    if (!DATA.wonders || Wonders.off(game) || !pl.researchOptions) return;
    pl.loreSeen = pl.loreSeen || {};
    for (const c of Cities.ofPlayer(game, pl.id)) if (DATA.wonders[c.race]) pl.loreSeen[c.race] = true;
    const full = Wonders.built(pl) + Wonders.pendingLore(game, pl) >= Wonders.CAP;
    if (full) { pl.researchOptions = pl.researchOptions.filter(id => !(DATA.spells[id] && DATA.spells[id].lore) || id === pl.researching); return; }
    for (const race in pl.loreSeen) {
      const id = 'lore_' + race;
      if (DATA.spells[id] && !(pl.lore || []).includes(id) && !pl.researchOptions.includes(id)) pl.researchOptions.push(id);
    }
  },
  // la cité qui bâtit (ou a en file) l'ouvrage, autre que c
  siteOf(game, pid, b, c) {
    return Cities.ofPlayer(game, pid).find(o => (!c || o.id !== c.id) && (o.buildings[b] || (o.prod && o.prod.type === 'building' && o.prod.id === b) || (o.queue || []).some(q => q.type === 'building' && q.id === b))) || null;
  },
  // mana du Puits des Âmes pour une unité tuée
  soulMana(u) { const d = DATA.units[u.type]; if (!d) return 0; if (u.hero) return 25; return Math.max(2, Math.round(d.cost ? d.cost / 4 : (d.upkeep.mana || 1) * 2)); },
};

const Cities = {
  create(game, owner, race, plane, x, y, opts = {}) {
    const names = CITY_NAMES[race] || CITY_NAMES.highmen;
    game.cityNameIdx = game.cityNameIdx || {};
    const used = new Set(Object.values(game.cities).map(c => c.name));
    let name = null;
    for (let i = 0; i < names.length * 3 && !name; i++) {
      const k = (game.cityNameIdx[race] = (game.cityNameIdx[race] || 0) + 1);
      const base = names[(k - 1) % names.length];
      const cand = k > names.length ? base + ' ' + ['II', 'III', 'IV', 'V', 'VI'][Math.floor((k - 1) / names.length) - 1] : base;
      if (!used.has(cand)) name = cand;
    }
    const c = {
      id: game.nextId++, name: opts.name || name || ('Cité ' + game.nextId), owner, race, plane, x, y,
      pop: opts.pop || 1000, farmers: 1, buildings: {}, prod: { type: 'tradeGoods' }, progress: 0,
      ench: [], fortress: !!opts.fortress, summoningCircle: !!opts.fortress, founded: game.turn, sold: false, autoFarmers: true,
    };
    if (opts.fortress) { c.buildings.fortress = true; c.buildings.summoningCircle = true; }
    for (const b of (opts.buildings || [])) c.buildings[b] = true;
    game.cities[c.id] = c;
    // Conscience : les sorciers qui l'entretiennent voient aussi les cités fondées ensuite
    for (const o of game.players || []) if (o && o.alive && o.globals && o.globals.includes('awareness') && typeof Move !== 'undefined') Move.reveal(game, o, plane, x, y, 1);
    // la route sous la cité
    World.set(game.world, plane, 'road', x, y, plane === 1 ? 2 : 1);   // sur Miroir, les routes sont enchantées
    Cities.resetFarmers(game, c);
    Cities.updateTerritory(game);
    return c;
  },

  at(game, plane, x, y) {
    for (const c of Object.values(game.cities)) if (c.plane === plane && c.x === x && c.y === y) return c;   // (Object.values : même ordre que for…in, plus rapide)
    return null;
  },
  ofPlayer(game, pid) { return Object.values(game.cities).filter(c => c.owner === pid); },
  citizens(c) { return Math.floor(c.pop / 1000); },
  sizeName(c) { const p = c.pop; return p < 1000 ? 'Avant-poste' : p < 5000 ? 'Hameau' : p < 9000 ? 'Village' : p < 13000 ? 'Bourg' : p < 17000 ? 'Cité' : 'Métropole'; },
  // des bâtiments détruits au hasard (chaque bâtiment constructible avec la probabilité p) : leurs noms, pour le dire au joueur
  destroyBuildings(game, c, p, rng) {
    rng = rng || game.rng; const out = [];
    for (const b of Object.keys(c.buildings)) if (DATA.buildings[b] && DATA.buildings[b].buildable !== false && !DATA.buildings[b].wonder && rng.chance(p)) { delete c.buildings[b]; out.push(DATA.buildings[b].name); }
    return out;
  },
  // le cercle d'invocation revient à la forteresse (sa cité perdue, cédée ou détruite) : le bâtiment le suit
  circleHome(game, pl) {
    pl.summonCity = pl.fortress;
    for (const c of Cities.ofPlayer(game, pl.id)) if (c.id !== pl.fortress) delete c.buildings.summoningCircle;
    const f = game.cities[pl.fortress]; if (f && f.owner === pl.id) f.buildings.summoningCircle = true;
  },
  lostText(names) { return names.length ? (names.length > 1 ? 'bâtiments perdus : ' : 'bâtiment perdu : ') + names.join(', ') : ''; },
  has(c, b) { return !!c.buildings[b]; },
  hasEnch(c, sp) { return c.ench.some(e => e.spell === sp); },
  raceData(c) { return DATA.races[c.race]; },

  // tuiles du bassin avec partage (une case partagée compte pour moitié)
  // (performance) _econ lit le bassin par _catch : le même résultat gardé par cité, resservi tant que le monde, la case de la
  // cité et la liste des cités voisines (les mêmes, aux mêmes cases, relevées comme ici à chaque appel) n'ont pas changé ;
  // lecture seule. catchment rend toujours des objets neufs.
  _catchMemo: new WeakMap(),
  _catch(game, c) {
    const w = game.world, near = [];
    for (const o of Object.values(game.cities)) {
      if (o === c || o.id === c.id || o.plane !== c.plane) continue;
      if (Math.abs(World.dxw(w, o.x, c.x)) <= 4 && Math.abs(o.y - c.y) <= 4) near.push(o);
    }
    const m = Cities._catchMemo.get(c);
    if (m && m.w === w && m.ww === w.w && m.wh === w.h && m.x === c.x && m.y === c.y && m.n === near.length) {
      let same = true;
      for (let i = 0; i < near.length && same; i++) { const o = near[i], k = 3 * i; if (o !== m.near[i] || o.x !== m.pos[k] || o.y !== m.pos[k + 1] || o.plane !== m.pos[k + 2]) same = false; }
      if (same) return m.out;
    }
    const out = Cities._catchOf(w, c, near);
    const pos = []; for (const o of near) pos.push(o.x, o.y, o.plane);
    Cities._catchMemo.set(c, { w, ww: w.w, wh: w.h, x: c.x, y: c.y, n: near.length, near, pos, out });
    return out;
  },
  _catchOf(w, c, near) {
    const out = [];
    for (const [x, y] of World.catchment(w, c.x, c.y)) {
      let shared = false;
      for (const o of near) {
        const dx = Math.abs(World.dxw(w, o.x, x)), dy = Math.abs(o.y - y);
        if (dx <= 2 && dy <= 2 && !(dx === 2 && dy === 2)) { shared = true; break; }
      }
      out.push({ x, y, shared, f: shared ? 0.5 : 1 });
    }
    return out;
  },
  catchment(game, c) {
    const out = [], w = game.world;
    // seules les cités à 4 cases ou moins peuvent partager une case de la zone
    const near = [];
    for (const o of Object.values(game.cities)) {
      if (o === c || o.id === c.id || o.plane !== c.plane) continue;
      if (Math.abs(World.dxw(w, o.x, c.x)) <= 4 && Math.abs(o.y - c.y) <= 4) near.push(o);
    }
    for (const [x, y] of World.catchment(w, c.x, c.y)) {
      let shared = false;
      for (const o of near) {
        const dx = Math.abs(World.dxw(w, o.x, x)), dy = Math.abs(o.y - y);
        if (dx <= 2 && dy <= 2 && !(dx === 2 && dy === 2)) { shared = true; break; }
      }
      out.push({ x, y, shared, f: shared ? 0.5 : 1 });
    }
    return out;
  },

  // héros gouverneur de la cité (posté sur place, statut « governor »)
  // here : Units.at(game, c.plane, c.x, c.y) déjà relevé par l'appelant (Cities.econ)
  governor(game, c, here) {
    for (const u of here || Units.at(game, c.plane, c.x, c.y)) if (u.hero && u.owner === c.owner && u.status === 'governor' && u.govCity === c.id) return u;
    return null;
  },
  governorBonus(game, c, here) {
    const g = Cities.governor(game, c, here); if (!g) return null;
    const L = Units.levelIndex(game, g) + 1, ab = Units.abilities(game, g);
    const b = { name: g.hero.name, L, prodPct: 5 * Math.ceil(L / 2), calm: 1, gold: 0, research: 0, growth: 0, power: 0 };
    if (ab.superLeadership) b.prodPct += 20; else if (ab.leadership) b.prodPct += 10;
    if (ab.superPrayermaster) b.calm += 2; else if (ab.prayermaster) b.calm += 1;
    if (ab.noble) b.gold += 3 + L;
    if (ab.superSage) b.research += 3 * L; else if (ab.sage) b.research += 2 * L;
    if (ab.superLegendary) b.growth += 10 * L; else if (ab.legendary) b.growth += 5 * L;
    if (ab.superArcanePower || ab.arcanePower || ab.caster) b.power += L;
    return b;
  },
  // (performance) pendant rebalanceFood, seuls les fermiers des cités changent : le bilan d'une cité s'y garde par réglage
  // de fermiers (farmers, armyFarmers, autoFarmers), au lieu d'être refait à chaque essai
  _econScope: null,
  econ(game, c) {
    const S = Cities._econScope;
    if (S && S.game === game) {
      let m = S.map.get(c); if (!m) S.map.set(c, m = new Map());
      const k = c.farmers + '|' + c.armyFarmers + '|' + c.autoFarmers;
      let e = m.get(k); if (!e) { e = Cities._econ(game, c); m.set(k, e); }
      return e;
    }
    return Cities._econ(game, c);
  },
  _econ(game, c) {
    const world = game.world, p = c.plane;
    const owner = game.players[c.owner];
    const race = DATA.races[c.race];
    const N = Cities.citizens(c);
    const tiles = Cities._catch(game, c);
    const has = b => !!c.buildings[b];
    const ench = sp => Cities.hasEnch(c, sp);
    const globals = owner ? owner.globals : [];
    const enemyGlobal = sp => game.players.some(o => o && o !== owner && o.alive && o.globals.includes(sp));
    const out = { citizens: N };
    const here = Units.at(game, p, c.x, c.y);   // les unités dans la cité (gouverneur, garnison), relevées une fois
    const gov = Cities.governorBonus(game, c, here);
    out.governor = gov;

    // --- nourriture et taille maximale ---
    let foodLevel = 0, wild = 0, prodPct = 0, mineralGold = 0, mineralPower = 0, unitReduction = 0;
    let hasForest = false, hasHillsMt = false, mithril = false, adamantium = false, nightshade = 0, forests = 0;
    // (performance) World.foodOf et World.prodPctOf, le terrain de la case relevé une seule fois pour les deux
    const gaia = ench('gaias_blessing');
    for (const t of tiles) {
      const corrupt = World.get(world, p, 'corrupt', t.x, t.y);
      let tFood = 0, tProd = 0;
      if (!corrupt) {
        const key = World.terrainKey(world, p, t.x, t.y), td = DATA.terrain[key];
        tFood = td ? td.food : 0;
        if (key === 'lake') { for (const [nx, ny] of World.neighbors(world, t.x, t.y)) if (World.terr(world, p, nx, ny) === T.RIVER) { tFood = 2; break; } }
        tProd = td ? td.prodPct : 0;
        if (gaia && key === 'forest') tProd *= 2;
      }
      foodLevel += tFood * t.f;
      prodPct += tProd * t.f;
      const tt = World.terr(world, p, t.x, t.y);
      if (tt === T.FOREST || tt === T.NNODE) { hasForest = true; forests += t.f; }
      if (tt === T.HILLS || tt === T.MOUNTAIN || tt === T.VOLCANO || tt === T.CNODE) hasHillsMt = true;
      const mk = MIN_KEYS[World.get(world, p, 'mineral', t.x, t.y)];
      if (mk && !corrupt) {
        const md = DATA.minerals[mk];
        if (mk === 'wildGame') wild += 2 * t.f; // partagé entre deux cités : moitié chacune (kazzmir BaseFoodLevel)
        mineralGold += (md.gold || 0) * t.f;
        mineralPower += (md.power || 0) * t.f;
        unitReduction += -(md.unitCostPct || 0);
        if (mk === 'mithril') mithril = true;
        if (mk === 'adamantium') adamantium = true;
        if (mk === 'nightshade') nightshade++;
      }
    }
    if (ench('gaias_blessing')) foodLevel *= 1.5;
    if (ench('famine')) foodLevel /= 2;
    foodLevel = Math.floor(foodLevel + wild);
    let maxPop = foodLevel + (has('granary') ? 2 : 0) + (has('farmersMarket') ? 3 : 0);
    maxPop = U.clamp(maxPop, 1, MAX_CITY_SIZE);
    out.maxPop = maxPop; out.foodLevel = foodLevel; out.hasForest = hasForest; out.hasHillsMt = hasHillsMt;
    out.mithril = mithril; out.adamantium = adamantium; out.nightshade = nightshade;

    // --- agitation ---
    let unrest = 0;
    const why = [];   // [raison, part] : ce qui fait l'agitation (la somme, arrondie à l'entier inférieur, donne les rebelles)
    if (!ench('stream_of_life')) {
      const taxPct = owner ? TAX_UNREST[owner.taxIdx] : 0;
      let pct = taxPct;
      const capitalRace = owner && owner.race ? owner.race : c.race;
      const tension = Cities.racialTension(c.race, capitalRace);
      pct += tension;
      if (ench('famine')) pct += 0.25;
      if (taxPct) why.push(['Impôts', taxPct * N]);
      // les tensions : entre le peuple de la cité et celui de la capitale (pas le nombre de peuples de l'empire)
      if (tension) why.push([c.race === capitalRace ? 'Unité de la ruche (même peuple que la capitale)' : 'Tensions entre races : ' + DATA.races[c.race].name + ' sous un sorcier ' + (DATA.races[capitalRace] ? 'des ' + DATA.races[capitalRace].name : 'étranger') + ' (' + (tension > 0 ? '+' : '') + Math.round(tension * 100) + ' % par habitant)', tension * N]);
      if (ench('famine')) why.push(['Famine', 0.25 * N]);
      let abs = 0;
      const curse = (ench('cursed_lands') ? 1 : 0) + (ench('pestilence') ? 2 : 0) + (ench('dark_rituals') ? 1 : 0);
      abs += curse; if (curse) why.push(['Malédictions et rituels', curse]);
      // une cité consacrée est à l'abri des effets globaux de chaos et de mort
      let glob = 0;
      if (enemyGlobal('great_wasting') && !ench('consecration')) glob += 1;
      if (enemyGlobal('armageddon') && !ench('consecration')) glob += 2;
      abs += glob; if (glob) why.push(['Sorts globaux ennemis', glob]);
      if (owner && owner.terror > game.turn) { abs += 2; why.push(['Terreur du Roi sans Visage', 2]); } // riposte du Roi sans Visage
      if (c.moods) { const m = Dilemmas.moodOf(game, c); if (m) { abs += m; why.push(['Humeur passagère', m]); } }   // humeurs passagères (dilemmes)
      // empire étendu : l'éloignement de la capitale et le nombre de cités pèsent (modérément) sur l'ordre
      // un rebelle de plus pour chacun. (v0.31.7 à 0.31.24 : +10 % par habitant, gardé en variante de banc, propOverstretch : au banc 15,
      // il freinait moins le sorcier qui s'envole, dont l'avance se fait en petites cités jeunes loin de sa capitale)
      const ov = Cities.overstretch(game, c, owner), flat = !(game.opts && game.opts.propOverstretch), per = flat ? 1 : Cities.OVER_PCT * N;
      const perTxt = flat ? '' : ' (+' + Math.round(Cities.OVER_PCT * 100) + ' % par habitant)';
      if (ov.dist) { abs += per; why.push([(ov.plane ? 'Loin de la capitale (autre plan)' : 'Loin de la capitale') + perTxt, per]); }
      if (ov.size) { abs += per; why.push(['Étendue de l\'empire' + perTxt, per]); }
      let garrison = 0;
      for (const u of here) if (u.owner === c.owner && !Units.isFantastic(u)) garrison++;
      const relMult = owner && (owner.retorts.includes('divinePower') || owner.retorts.includes('infernalPower')) ? 1.5 : 1;
      const noPac = new Set(race.noPacify || []);
      let pac = 0;
      if (!ench('evil_presence') || (owner && owner.books.death > 0)) {
        if (has('shrine')) pac += 1 * relMult;
        if (has('temple') && !noPac.has('temple')) pac += 1 * relMult;
        if (has('parthenon') && !noPac.has('parthenon')) pac += 1 * relMult;
        if (has('cathedral') && !noPac.has('cathedral')) pac += 1 * relMult;
      }
      const pacRel = pac;
      if (has('animistsGuild') && !noPac.has('animistsGuild')) pac += 1;
      if (has('oracle') && !noPac.has('oracle')) pac += 2;
      if (ench('gaias_blessing')) pac += 2;
      if (globals && globals.includes('just_cause')) pac += 1;
      if (gov) pac += gov.calm;
      if (c.race === 'klackon' && owner && owner.race === 'klackon') pac += 0;
      if (pacRel) why.push(['Lieux de culte', -pacRel]);
      if (pac - pacRel) why.push(['Guildes, oracle, sorts, gouverneur', -(pac - pacRel)]);
      if (garrison) why.push(['Garnison', -garrison / 2]);
      out.unrestSum = pct * N + abs - pac - garrison / 2;   // avant l'arrondi : la marge jusqu'au rebelle suivant
      unrest = Math.max(0, Math.floor(out.unrestSum));
    }
    if (c.race === 'klackon' && Wonders.has(game, c.owner, 'klackon') && unrest > 0) { why.push(['Ruche-Mère', -unrest]); unrest = 0; }
    out.unrestWhy = why;
    unrest = Math.min(unrest, N);
    out.unrest = unrest;

    // --- répartition fermiers / ouvriers ---
    const farmerFood = (race.farmerFood || 2) + (has('animistsGuild') ? 1 : 0);
    const foodFromFarmers = (F) => {
      let base = F * farmerFood;
      if (ench('gaias_blessing')) base += Math.floor(base * 0.2);
      if (base > foodLevel) base = foodLevel + (base - foodLevel) / 2;
      return Math.floor(base) + (has('granary') ? 2 : 0) + (has('farmersMarket') ? 3 : 0) + wild + (c.fortress ? 2 : 0);
    };
    // les rebelles ne prennent jamais les fermiers dont la cité a besoin pour manger : l'agitation coûte l'or et la
    // production, pas la vie de la cité (sinon une cité agitée meurt de faim, et la famine nourrit l'agitation)
    { let need = 0; while (need < N && foodFromFarmers(need) * (ench('famine') ? 0.5 : 1) < N) need++;
      if (unrest > N - need) { out.unrestCap = N - need; out.unrestRaw = unrest; unrest = N - need; out.unrest = unrest; } }
    let minFarmers = 0;
    while (minFarmers < N - unrest && foodFromFarmers(minFarmers) * (ench('famine') ? 0.5 : 1) < N) minFarmers++;
    let F = c.autoFarmers ? minFarmers + (c.armyFarmers || 0) : U.clamp(c.farmers, minFarmers, N - unrest);
    F = Math.min(F, N - unrest);
    const W = Math.max(0, N - unrest - F);
    out.farmers = F; out.workers = W; out.rebels = unrest; out.minFarmers = minFarmers; out.farmerFood = farmerFood;

    // --- nourriture ---
    let food = foodFromFarmers(F);
    if (ench('famine')) food = Math.floor(food / 2);
    out.food = food; out.foodNeed = N; out.foodSurplus = food - N;
    // le détail, pour l'écran de cité (les mêmes postes que foodFromFarmers)
    { const raw = F * farmerFood + (ench('gaias_blessing') ? Math.floor(F * farmerFood * 0.2) : 0), fp = [['Fermiers (' + F + ' × ' + farmerFood + (ench('gaias_blessing') ? ', Gaïa +20 %' : '') + ')', Math.floor(raw > foodLevel ? foodLevel + (raw - foodLevel) / 2 : raw)]];
      if (has('granary')) fp.push(['Grenier', 2]); if (has('farmersMarket')) fp.push(['Halle aux grains', 3]); if (wild) fp.push(['Gibier', wild]); if (c.fortress) fp.push(['Forteresse', 2]);
      out.foodParts = fp; out.foodOver = raw > foodLevel; out.famine = ench('famine'); }
    out.foodGlobal = has('forestersGuild') ? 2 : 0; // la guilde des forestiers nourrit l'empire

    // --- production ---
    const wp = race.workerProd || 2;
    const baseProd = W * wp + Math.ceil(F * 0.5);
    let bonusPct = prodPct;
    if (has('sawmill')) bonusPct += 25;
    if (has('forestersGuild')) bonusPct += 25;
    if (has('minersGuild')) bonusPct += 50;
    if (has('mechaniciansGuild')) bonusPct += 50;
    if (ench('inspirations')) bonusPct += 100;
    if (gov) bonusPct += gov.prodPct;
    let prod = baseProd * (1 + bonusPct / 100);
    if (ench('cursed_lands')) prod /= 2;
    { const pp2 = []; if (Math.round(prodPct)) pp2.push(['Terrain', Math.round(prodPct)]); if (has('sawmill')) pp2.push(['Scierie', 25]); if (has('forestersGuild')) pp2.push(['Guilde des forestiers', 25]);
      if (has('minersGuild')) pp2.push(['Guilde des mineurs', 50]); if (has('mechaniciansGuild')) pp2.push(['Guilde des mécaniciens', 50]); if (ench('inspirations')) pp2.push([DATA.spells.inspirations.name, 100]); if (gov && gov.prodPct) pp2.push(['Gouverneur', gov.prodPct]);
      out.prodParts = pp2; out.cursedLands = ench('cursed_lands'); }
    out.baseProd = baseProd; out.prodPct = Math.round(bonusPct); out.prod = Math.floor(prod);

    // --- or ---
    const taxRate = owner ? TAX_RATES[owner.taxIdx] : 1;
    const taxes = Math.floor((N - unrest) * taxRate);
    let minG = mineralGold * (c.race === 'dwarf' ? 2 : 1) * (has('minersGuild') ? 1.5 : 1);
    minG = Math.floor(minG);
    const baseGold = taxes + minG;
    const caravan = Wonders.has(game, c.owner, 'nomad');
    let tradePct = World.cityGoldPct(world, p, c.x, c.y) + Cities.roadTradePct(game, c) * (caravan ? 2 : 1);
    if (c.race === 'nomad') tradePct += 50;
    tradePct = Math.min(tradePct, N * (caravan ? 5 : 3));
    let gold = baseGold + Math.floor(baseGold * tradePct / 100);
    if (has('marketplace')) gold += Math.floor(baseGold / 2);
    if (has('bank')) gold += Math.floor(baseGold / 2);
    if (has('merchantsGuild')) gold += baseGold;
    if (ench('prosperity')) gold += baseGold;
    if (gov) gold += gov.gold;
    const harvest = out.foodSurplus > 1 && Wonders.has(game, c.owner, 'halfling') ? Math.floor(out.foodSurplus / 2) : 0;
    gold += harvest;
    const tradeGoods = c.prod.type === 'tradeGoods' ? Math.floor(out.prod / 2) : 0;
    gold += tradeGoods;
    let upkeep = 0;
    for (const b in c.buildings) if (DATA.buildings[b]) upkeep += DATA.buildings[b].upkeep || 0;
    out.taxes = taxes; out.mineralGold = minG; out.tradePct = tradePct; out.tradeGoods = tradeGoods;
    out.goldIncome = gold; out.buildingUpkeep = upkeep; out.gold = gold - upkeep;
    { const gp = [['Impôts', taxes]]; if (minG) gp.push(['Gisements', minG]); const tr = Math.floor(baseGold * tradePct / 100); if (tr) gp.push(['Commerce (+' + tradePct + ' %)', tr]);
      if (has('marketplace')) gp.push(['Marché', Math.floor(baseGold / 2)]); if (has('bank')) gp.push(['Banque', Math.floor(baseGold / 2)]); if (has('merchantsGuild')) gp.push(['Guilde des marchands', baseGold]);
      if (ench('prosperity')) gp.push(['Prospérité', baseGold]); if (gov && gov.gold) gp.push(['Gouverneur', gov.gold]); if (harvest) gp.push(['Halle des Moissons', harvest]); if (tradeGoods) gp.push(['Biens de commerce', tradeGoods]);
      out.goldParts = gp; }

    // --- puissance magique ---
    // (chaque poste est gardé à part dans out.powerParts, pour l'afficher)
    const pp = { fortress: 0, guilds: 0, citizens: 0, governor: 0, minerals: 0, religion: 0, wonder: 0 };
    if (c.fortress && owner) {
      pp.fortress += U.sum(Object.values(owner.books));
      if (p === 1) pp.fortress += 5;
    }
    if (has('alchemistsGuild')) pp.guilds += 3;
    if (has('wizardsGuild')) pp.guilds -= 3;
    pp.citizens = Math.floor((race.powerPerCitizen || 0) * N);
    if (gov) pp.governor = gov.power;
    pp.minerals = Math.floor(mineralPower * (c.race === 'dwarf' ? 2 : 1) * (has('minersGuild') ? 1.5 : 1));   // les nains doublent aussi le mana des gisements
    if (forests && Wonders.has(game, c.owner, 'highelf')) pp.wonder = Math.round(forests / 2);   // Arbre-Mère
    out.forests = forests;
    let power = pp.fortress + pp.guilds + pp.citizens + pp.governor + pp.minerals + pp.wonder;
    let rel = 0; const relWhy = [];   // ce qui multiplie (ou annule) la puissance des lieux de culte, pour l'afficher
    const anyRel = has('shrine') || has('temple') || has('parthenon') || has('cathedral');
    if (!ench('evil_presence') || (owner && owner.books.death > 0)) {
      const moon = game.moon === 'good' ? (owner && owner.books.life ? 2 : owner && owner.books.death ? 0.5 : 1) : game.moon === 'bad' ? (owner && owner.books.death ? 2 : owner && owner.books.life ? 0.5 : 1) : 1;
      if (has('shrine')) rel += 1; if (has('temple')) rel += 2; if (has('parthenon')) rel += 3; if (has('cathedral')) rel += 4;
      rel *= moon; if (anyRel && moon !== 1) relWhy.push((game.moon === 'good' ? 'lune bienveillante' : 'lune maléfique') + ' ×' + (moon === 2 ? '2' : '½'));
      if (owner && (owner.retorts.includes('divinePower') || owner.retorts.includes('infernalPower'))) { rel *= 1.5; if (anyRel) relWhy.push((owner.retorts.includes('divinePower') ? 'Puissance divine' : 'Puissance infernale') + ' ×1,5'); }
      if (ench('dark_rituals')) { rel *= 2; if (anyRel) relWhy.push('Rites ténébreux ×2'); }
    } else if (anyRel) relWhy.push('Présence maléfique : aucune');
    pp.religion = Math.floor(rel);
    power += pp.religion;
    out.power = power; out.powerParts = pp; out.religionWhy = relWhy;

    // --- recherche ---
    let research = 0; const rp = [];
    for (const b in c.buildings) { const bd = DATA.buildings[b]; if (bd && bd.effects && bd.effects.research) { research += bd.effects.research; rp.push([bd.name, bd.effects.research]); } }
    if (gov && gov.research) { research += gov.research; rp.push(['Gouverneur', gov.research]); }
    out.research = research; out.researchParts = rp;

    // --- croissance ---
    let growth = Math.floor(10 * (maxPop - N + 1) / 2);
    const gw = [['Place libre (' + N + ' citoyens sur ' + maxPop + ')', growth]];
    growth += race.growth || 0; if (race.growth) gw.push(['Peuple (' + race.name + ')', race.growth]);
    if (gov) { growth += gov.growth; if (gov.growth) gw.push(['Gouverneur', gov.growth]); }
    if (has('granary')) { growth += 20; gw.push(['Grenier', 20]); }
    if (has('farmersMarket')) { growth += 30; gw.push(['Halle aux grains', 30]); }
    if (ench('gaias_blessing')) { const v = Math.floor(2.5 * maxPop / 10) * 10; growth += v; gw.push(['Bénédiction de Gaïa', v]); }
    if (ench('stream_of_life')) { growth *= 2; gw.push([DATA.spells.stream_of_life.name, '×2']); }
    if (c.popBoomTurns > 0 || (game.popBoom && game.popBoom === c.id)) { growth *= 2; gw.push(['Explosion démographique', '×2']); }
    let bonus = 0;
    if (c.prod.type === 'housing') {
      bonus = N > 1 ? W / N : 0.5;
      if (has('buildersHall')) bonus += 0.15;
      if (has('sawmill')) bonus += 0.1;
    }
    if (ench('dark_rituals')) bonus -= 0.25;
    if (c.prod.type === 'housing') gw.push(['Logements', '+' + Math.round((bonus + (ench('dark_rituals') ? 0.25 : 0)) * 100) + ' %']);
    if (ench('dark_rituals')) gw.push([DATA.spells.dark_rituals.name, '−25 %']);
    growth = Math.floor(growth * (1 + bonus));
    if (growth > 0) growth -= growth % 10;
    if (out.foodSurplus < 0) { growth = 50 * out.foodSurplus; gw.push(['Disette : il manque ' + (-out.foodSurplus) + ' nourriture', growth]); }
    if (growth > 0 && N >= maxPop) { growth = 0; gw.push(['Population maximale atteinte', 0]); }
    if (ench('pestilence')) { growth = Math.min(growth, -Math.min(50, Math.max(0, c.pop - 1000))); gw.push([DATA.spells.pestilence.name, growth]); }   // la peste ne vide pas une cité d'un habitant
    out.growth = growth; out.growthWhy = gw;

    // --- coût des unités (fer et charbon) ---
    let red = unitReduction / 100;
    if (c.race === 'dwarf') red *= 2;
    if (has('minersGuild')) red *= 2;
    out.unitCostReduction = Math.min(0.5, red);
    out.weapon = has('alchemistsGuild') ? (adamantium ? 3 : mithril ? 2 : 1) : 0;
    return out;
  },

  racialTension(a, b) {
    if (a === b) return a === 'klackon' ? -0.2 : 0;
    const key = [a, b].sort().join('|');
    return RACE_TENSION[key] !== undefined ? RACE_TENSION[key] : 0.1;
  },

  roadTradePct(game, c) {
    // cités reliées par la route (recherche limitée)
    // (performance) même parcours dans le même ordre, cases repérées par leur indice dans un tableau de marques réutilisé
    // (une génération par appel) ; les cités du plan ne sont relevées qu'à la première case de route atteinte, une fois pour
    // tout l'appel, au lieu d'un Cities.at par case de route ; une cité hors de la grille : le parcours d'origine (roadTradePctRef)
    const world = game.world, p = c.plane, W = world.w, H = world.h;
    if (!(Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.x < W && c.y >= 0 && c.y < H)) return Cities.roadTradePctRef(game, c);
    const road = world.planes[p].road;
    let B = Cities._rtBuf;
    if (!B || B.n !== W * H) B = Cities._rtBuf = { n: W * H, gen: 0, seen: new Int32Array(W * H) };
    if (++B.gen > 2e9) { B.gen = 1; B.seen.fill(0); }
    const gen = B.gen, seen = B.seen;
    seen[c.y * W + c.x] = gen;
    const q = [c.x, c.y, 0]; let qh = 0;
    let pct = 0, found = null, cityAt = null;
    while (qh < q.length) {
      const x = q[qh], y = q[qh + 1], d = q[qh + 2]; qh += 3;
      if (d > 30) continue;
      for (const [dx, dy] of U.DIRS8) {
        const ny = y + dy; if (!World.inY(world, ny)) continue;
        const nx = World.wx(world, x + dx), k = ny * W + nx;
        if (seen[k] === gen) continue; seen[k] = gen;
        if (!road[k]) continue;
        // (la première cité de la case dans l'ordre de game.cities, comme Cities.at ; seules les cases de la grille sont atteintes)
        if (!cityAt) { cityAt = new Map(); for (const o of Object.values(game.cities)) if (o.plane === p && Number.isInteger(o.x) && Number.isInteger(o.y) && o.x >= 0 && o.x < W && o.y >= 0 && o.y < H) { const ko = o.y * W + o.x; if (!cityAt.has(ko)) cityAt.set(ko, o); } }
        const oc = cityAt.get(k);
        // la route passe à travers les cités : on compte celle-ci et l'on continue au-delà
        if (oc && !(found && found.has(oc.id))) { (found || (found = new Set())).add(oc.id); pct += Cities.citizens(oc) * (oc.race === c.race ? 0.5 : 1); }
        q.push(nx, ny, d + 1);
      }
    }
    return Math.floor(pct);
  },
  roadTradePctRef(game, c) {
    const world = game.world, p = c.plane;
    const seen = new Set([c.x + ',' + c.y]); const q = [[c.x, c.y, 0]];
    let pct = 0; const found = new Set();
    while (q.length) {
      const [x, y, d] = q.shift();
      if (d > 30) continue;
      for (const [nx, ny] of World.neighbors(world, x, y)) {
        const k = nx + ',' + ny; if (seen.has(k)) continue; seen.add(k);
        if (!World.hasRoad(world, p, nx, ny)) continue;
        const oc = Cities.at(game, p, nx, ny);
        // la route passe à travers les cités : on compte celle-ci et l'on continue au-delà
        if (oc && !found.has(oc.id)) { found.add(oc.id); pct += Cities.citizens(oc) * (oc.race === c.race ? 0.5 : 1); }
        q.push([nx, ny, d + 1]);
      }
    }
    return Math.floor(pct);
  },

  // intérêt d'un fermier de plus dans cette cité pour nourrir les armées : la nourriture gagnée rapportée à la production perdue,
  // la capitale ménagée, et les cités déjà mises à contribution un peu moins sollicitées (la charge se répartit)
  farmerScore(game, c, e, e2) {
    const gain = e2.foodSurplus - e.foodSurplus;
    if (gain <= 0) return 0;
    const loss = Math.max(0.25, e.baseProd * (1 + e.prodPct / 100) - e2.baseProd * (1 + e2.prodPct / 100));
    const share = (c.armyFarmers || 0) / Math.max(1, Cities.citizens(c));
    return gain / (loss * (c.fortress ? 1.25 : 1)) * (1 - 0.6 * share);
  },
  resetFarmers(game, c) {
    c.autoFarmers = true;
    const e = Cities.econ(game, c);
    c.farmers = e.farmers;
  },
  // nourrir les armées : des ouvriers deviennent fermiers là où ils rapportent le plus de vivres, jusqu'à combler le déficit
  // (y compris dans les cités réglées à la main) ; renvoie le détail des changements et le déficit restant
  feedArmies(game, pid) {
    const pl = game.players[pid]; if (!pl) return { added: {}, left: 0 };
    Cities.rebalanceFood(game, pid);
    let food = Players.goldPerTurn(game, pl).food;
    const added = {};
    let guard = 0;
    while (food < 0 && guard++ < 300) {
      let best = null, gain = 0, bestSc = 0;
      for (const c of Cities.ofPlayer(game, pid)) {
        const e = Cities.econ(game, c); if (e.workers <= 0) continue;
        const save = [c.farmers, c.armyFarmers, c.autoFarmers];
        if (c.autoFarmers) c.armyFarmers = (c.armyFarmers || 0) + 1; else c.farmers = e.farmers + 1;
        const e2 = Cities.econ(game, c);
        [c.farmers, c.armyFarmers, c.autoFarmers] = save;
        const sc = Cities.farmerScore(game, c, e, e2);
        if (sc > bestSc) { bestSc = sc; gain = e2.foodSurplus - e.foodSurplus; best = c; }
      }
      if (!best) break;
      const e = Cities.econ(game, best);
      if (best.autoFarmers) best.armyFarmers = (best.armyFarmers || 0) + 1; else best.farmers = e.farmers + 1;
      if (best.autoFarmers) best.farmers = Cities.econ(game, best).farmers;
      added[best.id] = (added[best.id] || 0) + 1;
      food += gain;
    }
    return { added, left: Math.max(0, -food) };
  },
  // répartit des fermiers supplémentaires pour nourrir les armées (évite la famine absurde de l'original)
  rebalanceFood(game, pid) {
    const pl = game.players[pid]; if (!pl) return;
    const prev = Cities._econScope;
    if (!prev || prev.game !== game) Cities._econScope = { game, map: new Map() };
    try { Cities._rebalanceFood(game, pid, pl); } finally { Cities._econScope = prev; }
  },
  _rebalanceFood(game, pid, pl) {
    const cities = Cities.ofPlayer(game, pid);
    const autos = cities.filter(c => c.autoFarmers);
    for (const c of autos) c.armyFarmers = 0;
    const need = Magic.foodUpkeepUnits(game, pl);
    const econ = new Map(cities.map(c => [c.id, Cities.econ(game, c)]));
    let surplus = U.sum(cities, c => { const e = econ.get(c.id); return e.foodSurplus + e.foodGlobal; });
    let guard = 0;
    while (surplus < need && guard++ < 200) {
      let best = null, bestSc = 0;
      for (const c of autos) {
        const e = econ.get(c.id);
        if (e.workers <= 0) continue;
        c.armyFarmers++;
        const e2 = Cities.econ(game, c);
        c.armyFarmers--;
        const sc = Cities.farmerScore(game, c, e, e2);
        if (sc > bestSc) { bestSc = sc; best = c; }
      }
      if (!best) break;
      best.armyFarmers++;
      const e2 = Cities.econ(game, best);
      surplus += e2.foodSurplus - econ.get(best.id).foodSurplus;
      econ.set(best.id, e2);
    }
    for (const c of autos) c.farmers = econ.get(c.id).farmers;
  },

  // ---------- production ----------
  canBuild(game, c, b) {
    const bd = DATA.buildings[b];
    if (!bd || bd.buildable === false || b === 'housing' || b === 'tradeGoods') return false;
    if (c.buildings[b]) return false;
    const race = DATA.races[c.race];
    if (race.cannotBuild && race.cannotBuild.includes(b)) return false;
    if (bd.fortressOnly && !c.fortress) return false;
    if (bd.wonder) {
      const pl = game.players[c.owner];
      if (c.race !== bd.wonder || !pl || !(pl.lore || []).includes(bd.lore) || Wonders.off(game)) return false;
      if (Wonders.siteOf(game, c.owner, b, c)) return false;   // un seul par empire
      if (Wonders.used(game, c.owner, c) >= Wonders.CAP) return false;   // deux ouvrages bâtis par partie au plus
    }
    for (const r of bd.requires || []) if (!c.buildings[r]) return false;
    if (bd.terrain) {
      const tiles = World.catchment(game.world, c.x, c.y);
      if (bd.terrain === 'forest' && !tiles.some(([x, y]) => [T.FOREST, T.NNODE].includes(World.terr(game.world, c.plane, x, y)))) return false;
      if (bd.terrain === 'hillsMountain' && !tiles.some(([x, y]) => [T.HILLS, T.MOUNTAIN, T.VOLCANO, T.CNODE].includes(World.terr(game.world, c.plane, x, y)))) return false;
      // chantiers navals et guildes maritimes : comme les navires, il faut la mer à côté (une rivière ou un lac ne suffisent pas)
      if (bd.terrain === 'water' && !Cities.seaAccess(game, c)) return false;
    }
    return true;
  },
  // ce qui manque encore pour construire b dans cette cité : les bâtiments à élever d'abord (b compris, prérequis en premier),
  // et la raison s'il est impossible ici (peuple, terrain)
  TERRAIN_NEED: { forest: 'une forêt dans la zone de la cité', hillsMountain: 'des collines ou des montagnes dans la zone de la cité', water: 'un accès à la mer' },
  pathTo(game, c, b, seen = new Set()) {
    const out = { list: [], impossible: null };
    if (c.buildings[b] || seen.has(b)) return out;
    seen.add(b);
    const bd = DATA.buildings[b], race = DATA.races[c.race];
    if (!bd || bd.buildable === false) { out.impossible = (bd ? bd.name : b) + ' ne se construit pas'; return out; }
    if (race.cannotBuild && race.cannotBuild.includes(b)) out.impossible = 'les ' + race.name + ' ne savent pas bâtir : ' + bd.name;
    if (bd.fortressOnly && !c.fortress) out.impossible = bd.name + ' : seulement dans la cité de la forteresse';
    if (bd.wonder) {
      const pl = game.players[c.owner], other = Wonders.siteOf(game, c.owner, b, c);
      if (c.race !== bd.wonder) out.impossible = bd.name + ' : seulement dans une cité où vivent des ' + DATA.races[bd.wonder].name;
      else if (other) out.impossible = bd.name + (other.buildings[b] ? ' : déjà bâti à ' : ' : déjà en chantier à ') + other.name;
      else if (pl && Wonders.used(game, c.owner, c) >= Wonders.CAP) out.impossible = bd.name + ' : vous avez déjà ' + (Wonders.built(pl) >= Wonders.CAP ? 'bâti' : 'bâti ou mis en chantier') + ' vos ' + Wonders.CAP + ' ouvrages de la partie';
      else if (!pl || !(pl.lore || []).includes(bd.lore)) out.impossible = bd.name + ' : il faut d\'abord en achever la recherche';
    }
    for (const r of bd.requires || []) {
      const sub = Cities.pathTo(game, c, r, seen);
      for (const x of sub.list) if (!out.list.includes(x)) out.list.push(x);
      if (sub.impossible && !out.impossible) out.impossible = sub.impossible;
    }
    if (!out.impossible && bd.terrain) {
      const fake = Object.assign({}, c, { buildings: Object.assign({}, c.buildings, ...(bd.requires || []).map(r => ({ [r]: true }))) });
      if (!Cities.canBuild(game, fake, b)) out.impossible = bd.name + ' : il faut ' + Cities.TERRAIN_NEED[bd.terrain];
    }
    out.list.push(b);
    return out;
  },
  seaAccess(game, c) { return World.neighbors(game.world, c.x, c.y).some(([nx, ny]) => World.terr(game.world, c.plane, nx, ny) === T.OCEAN); },
  // pourquoi cette unité n'est pas encore disponible ici (null si elle l'est)
  unitNeeds(game, c, t) {
    const d = DATA.units[t]; if (!d) return null;
    const out = { list: [], impossible: null };
    for (const r of d.requires || []) {
      const sub = Cities.pathTo(game, c, r);
      for (const x of sub.list) if (!out.list.includes(x)) out.list.push(x);
      if (sub.impossible && !out.impossible) out.impossible = sub.impossible;
    }
    if (d.sailing && !Cities.seaAccess(game, c)) out.impossible = out.impossible || 'il faut un accès à la mer';
    if (d.abilities.createOutpost && c.pop < 2000) out.pop = 2000;
    return out.list.length || out.impossible || out.pop ? out : null;
  },
  buildableBuildings(game, c) {
    return Object.keys(DATA.buildings).filter(b => Cities.canBuild(game, c, b));
  },
  canBuildUnit(game, c, type) {
    const d = DATA.units[type]; if (!d) return false;
    const race = DATA.races[c.race];
    if (!race.units.includes(type)) return false;
    for (const r of d.requires || []) if (!c.buildings[r]) return false;
    if (d.sailing) {
      let ok = false;
      for (const [nx, ny] of World.neighbors(game.world, c.x, c.y)) if (World.terr(game.world, c.plane, nx, ny) === T.OCEAN) ok = true;
      if (!ok) return false;
    }
    if (d.abilities.createOutpost && c.pop < 2000) return false;
    return true;
  },
  buildableUnits(game, c) { return DATA.races[c.race].units.filter(t => Cities.canBuildUnit(game, c, t)); },
  unitCost(game, c, type, econ) {
    const d = DATA.units[type];
    let cost = d.cost;
    if (d.costReduction) { const e = econ || Cities.econ(game, c); cost = d.cost - Math.floor(d.cost * e.unitCostReduction); }
    if (d.race === 'troll' && c && Wonders.has(game, c.owner, 'troll')) cost = Math.ceil(cost * 2 / 3);
    return cost;
  },
  prodCost(game, c, econ) {
    const pr = c.prod;
    if (pr.type === 'building') return DATA.buildings[pr.id].cost;
    if (pr.type === 'unit') return Cities.unitCost(game, c, pr.id, econ);
    if (pr.type === 'rearm') return Cities.rearmCost(game, c, econ);
    return 0;
  },
  prodName(c) {
    const pr = c.prod;
    if (pr.type === 'building') return DATA.buildings[pr.id].name;
    if (pr.type === 'unit') return DATA.units[pr.id].name;
    if (pr.type === 'housing') return 'Logements';
    if (pr.type === 'rearm') return Cities.REARM_NAME;
    return 'Biens de commerce';
  },
  // réarmer la garnison (ajout d'Arcanes) : une cité qui forge des armes magiques (Guilde des alchimistes) en équipe
  // les unités normales en station qui n'en ont pas, ou de moins bonnes (mithril, adamantium selon les gisements)
  REARM_NAME: 'Armes magiques pour la garnison',
  rearmTier(game, c, econ) { return c.buildings.alchemistsGuild ? (econ || Cities.econ(game, c)).weapon : 0; },
  rearmTargets(game, c, econ) {
    const tier = Cities.rearmTier(game, c, econ); if (!tier) return [];
    return Units.at(game, c.plane, c.x, c.y).filter(u => {
      if (u.owner !== c.owner || !Units.isNormal(u) || (u.weapon || 0) >= tier) return false;
      return Units.wieldsWeapons(u);
    });
  },
  // un quart du prix de l'unité par rang d'armes gagné (magiques, mithril, adamantium), 3 au moins
  rearmUnitCost(u, tier) { return Math.max(3, Math.ceil(DATA.units[u.type].cost * 0.25 * (tier - (u.weapon || 0)))); },
  rearmCost(game, c, econ) {
    const e = econ || Cities.econ(game, c), tier = Cities.rearmTier(game, c, e);
    let n = 0; for (const u of Cities.rearmTargets(game, c, e)) n += Cities.rearmUnitCost(u, tier);
    return n;
  },
  turnsLeft(game, c, econ) {
    const e = econ || Cities.econ(game, c);
    const cost = Cities.prodCost(game, c, e);
    if (!cost) return null;
    if (e.prod <= 0) return Infinity;
    return Math.max(1, Math.ceil((cost - c.progress) / e.prod));
  },
  buyPrice(game, c, econ) {
    const cost = Cities.prodCost(game, c, econ);
    if (!cost) return 0;
    const remaining = Math.max(0, cost - c.progress);
    let price = remaining * 2;
    if (c.progress === 0) price *= 2;
    else if (c.progress < cost / 3) price = Math.ceil(price * 1.5);
    if (Wonders.has(game, c.owner, 'highmen')) price *= 0.75;
    return Math.ceil(price);
  },
  // file de construction : premier élément réalisable maintenant ; ceux qui attendent un prérequis
  // encore en file restent à leur place, ceux qui ne seront jamais possibles sont retirés
  // l'ouvrage en cours existe déjà (Mur de pierre lancé sur une cité qui bâtissait ses remparts) : on passe au suivant, sans rien perdre
  skipBuilt(game, c) {
    const pr = c.prod; if (!pr || pr.type !== 'building' || !c.buildings[pr.id]) return false;
    const pl = game.players[c.owner], keep = c.progress || 0;
    const queued = Cities.nextFromQueue(game, c);
    const next = queued || (pl && !pl.human ? AI.chooseProduction(game, c) : null);
    c.prod = next ? { type: next.type, id: next.id } : { type: 'tradeGoods' };
    c.progress = ((queued && queued.progress) || 0) + keep;
    if (!next) c.carry = true;   // le travail attend le prochain ouvrage choisi
    if (pl && pl.human && !queued && !Cities.applyRole(game, c)) c.needsOrder = true;
    return true;
  },
  nextFromQueue(game, c) {
    const q = c.queue || (c.queue = []);
    const fake = Object.assign({}, c, { pop: Math.max(c.pop, 2000) }); // un colon attend que la cité grandisse
    for (let i = 0; i < q.length; i++) {
      const it = q[i];
      // armes de la garnison : sans unité à équiper quand vient leur tour, elles sont sautées
      if (it.type === 'rearm') { q.splice(i, 1); if (Cities.rearmTargets(game, c).length) return { type: 'rearm', progress: it.progress || 0 }; i--; continue; }
      const ok = it.type === 'building' ? Cities.canBuild(game, c, it.id) : Cities.canBuildUnit(game, fake, it.id);
      if (ok) { q.splice(i, 1); return { type: it.type, id: it.id, progress: it.progress || 0 }; }
    }
    c.queue = q.filter(it => it.type === 'rearm' ? !!c.buildings.alchemistsGuild : it.type === 'building' ? Cities.canBuildLater(game, Object.assign({}, c, { queue: q.filter(o => o !== it) }), it.id) : Cities.canBuildUnitLater(game, c, it.id));
    return null;
  },
  // bâtiments disponibles une fois la production en cours et la file achevées
  plannedBuildings(c) {
    const set = new Set(Object.keys(c.buildings));
    if (c.prod && c.prod.type === 'building') set.add(c.prod.id);
    for (const it of c.queue || []) if (it.type === 'building') set.add(it.id);
    return set;
  },
  canBuildLater(game, c, b) {
    const planned = Cities.plannedBuildings(c);
    if (planned.has(b)) return false;
    const fake = Object.assign({}, c, { buildings: Object.fromEntries([...planned].map(k => [k, true])) });
    return Cities.canBuild(game, fake, b);
  },
  canBuildUnitLater(game, c, t) {
    const planned = Cities.plannedBuildings(c);
    const fake = Object.assign({}, c, { buildings: Object.fromEntries([...planned].map(k => [k, true])), pop: Math.max(c.pop, 2000) });
    return Cities.canBuildUnit(game, fake, t);
  },
  // un bâtiment ne se construit qu'une fois : ni deux fois en file, ni en file et en production
  canQueue(game, c, prod) {
    if (prod.type === 'rearm') return !!c.buildings.alchemistsGuild && !(c.prod && c.prod.type === 'rearm') && !(c.queue || []).some(it => it.type === 'rearm');
    return prod.type === 'unit' || (prod.type === 'building' && Cities.canBuildLater(game, c, prod.id));
  },
  dedupeQueue(c) {
    const key = it => it.type === 'building' ? 'b:' + it.id : it.type === 'rearm' ? 'rearm' : null;
    const seen = new Set(c.prod && key(c.prod) ? [key(c.prod)] : []);
    c.queue = (c.queue || []).filter(it => { const k = key(it); if (!k) return true; if (seen.has(k)) return false; seen.add(k); return true; });
  },
  // Changer de production ne transfère plus le travail accompli : l'ouvrage entamé retourne en tête de file avec sa
  // progression, et le nouveau part de zéro (ou de sa propre progression s'il attendait en file). Seul le surplus d'une
  // unité qui vient d'être achevée (c.carry) passe à la suite.
  setProduction(game, c, prod, opts = {}) {
    const cur = c.prod || { type: 'tradeGoods' };
    if (cur.type === prod.type && cur.id === prod.id) { Cities.dedupeQueue(c); return null; }
    const real = t => t === 'building' || t === 'unit' || t === 'rearm';
    let shelved = null;
    if (!opts.done && real(cur.type) && c.progress > 0 && !c.carry) {
      c.queue = c.queue || [];
      shelved = { type: cur.type, id: cur.id, progress: Math.floor(c.progress) };
      c.queue.unshift(shelved);
      c.progress = 0;
    }
    let saved = prod.progress || 0;
    const qi = (c.queue || []).findIndex(it => it !== shelved && it.type === prod.type && it.id === prod.id && it.progress);
    if (qi >= 0) { saved = Math.max(saved, c.queue[qi].progress); c.queue.splice(qi, 1); }
    c.progress = (c.carry ? c.progress : 0) + saved;
    c.carry = false;
    c.prod = { type: prod.type, id: prod.id };
    Cities.dedupeQueue(c);
    return shelved;
  },
  // progression déjà acquise par un ouvrage s'il devenait la production courante
  savedProgress(c, prod) {
    const it = (c.queue || []).find(x => x.type === prod.type && x.id === prod.id && x.progress);
    return (it ? it.progress : 0) + (c.carry ? c.progress : 0);
  },

  // ---------- territoire (frontières culturelles) ----------
  influenceRadius(c) {
    let r = 2;
    if (c.pop >= 6000) r++;
    if (c.pop >= 14000) r++;
    if (c.buildings.temple || c.buildings.oracle) r++;
    if (c.fortress) r++;
    return Math.min(r, 5);
  },
  updateTerritory(game) {
    const world = game.world;
    for (const pl of world.planes) { pl.owner.fill(-1); pl.ownerCity.fill(-1); }
    const best = [new Array(world.w * world.h).fill(-1e9), new Array(world.w * world.h).fill(-1e9)];
    for (const id in game.cities) {
      const c = game.cities[id];
      const r = Cities.influenceRadius(c);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const y = c.y + dy; if (!World.inY(world, y)) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (d > r || (Math.abs(dx) === r && Math.abs(dy) === r && r > 1)) continue;
        const i = World.idx(world, c.x + dx, y);
        // une cité garde toujours sa case et la première couronne, même au pied d'une grande voisine (sinon une petite cité
        // fondée quand la frontière était loin finit « dans » le territoire de l'autre)
        const score = (d <= 1 ? 1e7 - d * 1e6 : (r - d) * 1000) + c.pop / 100 - c.founded * 0.001;
        if (score > best[c.plane][i]) { best[c.plane][i] = score; world.planes[c.plane].owner[i] = c.owner; world.planes[c.plane].ownerCity[i] = c.id; }
      }
    }
    for (let p = 0; p < world.planes.length; p++) Cities.claimInterior(game, p, best[p]);
    // des troupes qu'un territoire interdit vient de recouvrir : reconduites à la frontière
    if (typeof Diplomacy !== 'undefined' && Diplomacy.escortAll && game.players && game.players.some(p => p && p.closedTo)) Diplomacy.escortAll(game);
  },
  // L'intérieur d'un royaume : ce qui s'étend entre ses cités appartient à leur sorcier, même hors de leur rayonnement.
  // 1. entre deux cités voisines (LINK cases au plus), la lentille qui les joint (quatre cases de part et d'autre au milieu
  //    pour deux cités à 9 cases), sauf si la ligne qui les relie traverse le rayonnement d'une autre cité ;
  //    2. le triangle de trois cités liées deux à deux ; 3. les poches de terre sans maître (ENCLAVE cases au plus)
  //    bordées seulement par ce royaume et la mer.
  // Le rayonnement des cités l'emporte toujours : ceci ne prend que des cases libres.
  INTERIOR_LINK: 10, INTERIOR_LENS: 3, INTERIOR_ENCLAVE: 30,
  claimInterior(game, p, best) {
    const world = game.world, W = world.w, P = world.planes[p], owner = P.owner;
    // le rayonnement seul ; -2 : celui d'une cité neutre, qui n'appartient à personne mais qu'on ne prend pas non plus
    const culture = Int16Array.from(owner, (o, i) => o >= 0 ? o : best && best[i] > -1e9 ? -2 : -1);
    const claim = new Int16Array(W * world.h).fill(-1), claimD = new Float32Array(W * world.h).fill(1e9), claimCity = new Int32Array(W * world.h).fill(-1);
    const byOwner = {};
    for (const id in game.cities) { const c = game.cities[id]; if (c.plane === p && c.owner >= 0) (byOwner[c.owner] = byOwner[c.owner] || []).push(c); }
    const mark = (pid, x, y, c, dist) => {
      if (!World.inY(world, y)) return;
      const i = World.idx(world, x, y);
      if (culture[i] !== -1 || dist >= claimD[i]) return;
      claimD[i] = dist; claim[i] = pid; claimCity[i] = c.id;
    };
    const near = (cs, x, y) => { let b = null, bd = 1e9; for (const c of cs) { const d = World.dist(world, c.x, c.y, World.wx(world, x), y); if (d < bd) { bd = d; b = c; } } return [b, bd]; };
    for (const k in byOwner) {
      const pid = +k, cs = byOwner[k], n = cs.length;
      const linked = new Set();
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const A = cs[a], B = cs[b];
        if (World.dist(world, A.x, A.y, B.x, B.y) > Cities.INTERIOR_LINK) continue;
        const dx = World.dxw(world, A.x, B.x), dy = B.y - A.y, steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
        let blocked = false;
        for (let s = 0; s <= steps && !blocked; s++) {
          const o = culture[World.idx(world, Math.round(A.x + dx * s / steps), Math.round(A.y + dy * s / steps))];
          if (o !== -1 && o !== pid) blocked = true;   // une autre cité rayonne entre les deux : pas de liaison
        }
        if (blocked) continue;
        linked.add(a + ',' + b);
        // la lentille entre les deux : les cases dont la somme des distances aux deux cités dépasse de LENS au plus leur écart
        const dab = Math.hypot(dx, dy), lim = dab + Cities.INTERIOR_LENS, m = Math.ceil(Cities.INTERIOR_LENS / 2) + 1;
        for (let y = Math.min(0, dy) - m; y <= Math.max(0, dy) + m; y++) for (let x = Math.min(0, dx) - m; x <= Math.max(0, dx) + m; x++) {
          const da = Math.hypot(x, y), db = Math.hypot(x - dx, y - dy);
          if (da + db <= lim + 1e-9) mark(pid, A.x + x, A.y + y, da <= db ? A : B, Math.min(da, db));
        }
      }
      // triangles de cités liées deux à deux
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (!linked.has(a + ',' + b)) continue;
        for (let c = b + 1; c < n; c++) {
          if (!linked.has(a + ',' + c) || !linked.has(b + ',' + c)) continue;
          const A = cs[a], bx = A.x + World.dxw(world, A.x, cs[b].x), cx = A.x + World.dxw(world, A.x, cs[c].x), by = cs[b].y, cy = cs[c].y;
          const area = (bx - A.x) * (cy - A.y) - (cx - A.x) * (by - A.y); if (!area) continue;
          const x0 = Math.min(A.x, bx, cx), x1 = Math.max(A.x, bx, cx), y0 = Math.max(0, Math.min(A.y, by, cy)), y1 = Math.min(world.h - 1, Math.max(A.y, by, cy));
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            // barycentriques (bords compris)
            const w1 = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area, w2 = ((cx - x) * (A.y - y) - (A.x - x) * (cy - y)) / area, w3 = 1 - w1 - w2;
            if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) continue;
            const [cc, d] = near([A, cs[b], cs[c]], x, y); mark(pid, x, y, cc, d);
          }
        }
      }
    }
    for (let i = 0; i < owner.length; i++) if (claim[i] >= 0) { owner[i] = claim[i]; P.ownerCity[i] = claimCity[i]; }
    // poches de terre libre enfermées par un seul royaume (et la mer)
    const seen = new Uint8Array(W * world.h), terr = P.terr;
    const free = i => owner[i] < 0 && culture[i] !== -2;
    for (let i0 = 0; i0 < owner.length; i0++) {
      if (seen[i0] || !free(i0) || World.isWater(terr[i0])) continue;
      const comp = [i0], around = new Set(); seen[i0] = 1;
      let big = false;
      for (let q = 0; q < comp.length; q++) {
        const i = comp[q], x = i % W, y = (i - x) / W;
        for (const [ox, oy] of U.DIRS8) {
          const ny = y + oy; if (!World.inY(world, ny)) continue;
          const j = World.idx(world, x + ox, ny);
          if (!free(j)) { around.add(owner[j] >= 0 ? owner[j] : -2); continue; }
          if (World.isWater(terr[j]) || seen[j]) continue;
          seen[j] = 1; comp.push(j);
          if (comp.length > Cities.INTERIOR_ENCLAVE) big = true;
        }
      }
      if (big || around.size !== 1) continue;
      const pid = [...around][0], cs = byOwner[pid] || [];
      for (const i of comp) { owner[i] = pid; const x = i % W; P.ownerCity[i] = cs.length ? near(cs, x, (i - x) / W)[0].id : -1; }
    }
  },

  // ---------- empire étendu ----------
  // une cité loin de la forteresse (au-delà de 20 cases, ou sur l'autre plan) : un rebelle de plus ; un empire de 20 cités ou plus :
  // un rebelle de plus partout (la forteresse elle-même n'est pas touchée, ni les cités neutres)
  OVER_DIST: 20, OVER_SIZE: 20, OVER_PCT: 0.1, noOverstretch: false,
  overstretch(game, c, owner) {
    const out = { dist: 0, size: 0, plane: false };
    if (!owner || c.fortress || Cities.noOverstretch) return out;
    const fc = game.cities[owner.fortress];
    let n = 0; for (const o of Object.values(game.cities)) if (o.owner === owner.id) n++;
    const near = k => k && k.plane === c.plane && World.dist(game.world, k.x, k.y, c.x, c.y) <= Cities.OVER_DIST;
    if (!fc) out.dist = 1;
    else if (fc.plane !== c.plane) { out.dist = 1; out.plane = true; }
    else if (!near(fc)) out.dist = 1;
    if (n >= Cities.OVER_SIZE) out.size = 1;
    return out;
  },

  // ---------- rôle d'une cité ----------
  // Quand la file est vide, une cité à rôle choisit elle-même dans ce sens : les bâtiments du rôle (et leurs prérequis) dans
  // l'ordre, puis son ouvrage de repli. Le joueur garde la main : la file passe toujours avant.
  ROLES: {
    growth: { name: 'Croissance', blds: ['granary', 'buildersHall', 'farmersMarket', 'sawmill', 'forestersGuild', 'animistsGuild'] },
    gold: { name: 'Or', blds: ['marketplace', 'buildersHall', 'sawmill', 'bank', 'minersGuild', 'merchantsGuild', 'mechaniciansGuild'] },
    magic: { name: 'Magie', blds: ['shrine', 'library', 'temple', 'sagesGuild', 'parthenon', 'alchemistsGuild', 'university', 'cathedral', 'wizardsGuild'] },
    army: { name: 'Armée', blds: ['barracks', 'smithy', 'armory', 'stables', 'fightersGuild', 'cityWalls', 'armorersGuild', 'alchemistsGuild', 'warCollege', 'fantasticStable'] },
  },
  roleChoice(game, c, role) {
    const R = Cities.ROLES[role]; if (!R) return null;
    const pl = game.players[c.owner], e = Cities.econ(game, c), income = pl ? Players.goldPerTurn(game, pl).gold : 0;
    for (const b of R.blds) {
      if (c.buildings[b] || !DATA.buildings[b]) continue;
      const pt = Cities.pathTo(game, c, b); if (pt.impossible) continue;
      // le premier maillon de la chaîne qu'on peut bâtir maintenant
      const step = pt.list.find(x => !c.buildings[x] && Cities.canBuild(game, c, x));
      if (!step) continue;
      // un entretien que le trésor ne peut pas porter : on attend (sauf ce qui rapporte de l'or)
      const up = DATA.buildings[step].upkeep || 0;
      if (up > 0 && income - up < 0 && role !== 'gold') continue;
      return { type: 'building', id: step };
    }
    if (role === 'growth') return Cities.citizens(c) < e.maxPop ? { type: 'housing' } : { type: 'tradeGoods' };
    if (role === 'army') {
      // la meilleure troupe de la cité, tant que la garnison a de la place et que le trésor suit
      const here = Units.at(game, c.plane, c.x, c.y).filter(u => u.owner === c.owner).length;
      if (here >= MAX_STACK || income <= 0) return { type: 'tradeGoods' };
      const units = Cities.buildableUnits(game, c).filter(t => { const d = DATA.units[t]; return !d.abilities.createOutpost && !d.abilities.construction && !d.abilities.siegeOnly && !d.abilities.scout && !d.sailing && (d.melee >= 2 || d.ranged >= 2); });
      const best = U.max(units, t => typeof AI !== 'undefined' && AI.unitValue ? AI.unitValue(game, c, t, e, 'attack') : Units.strength(game, { type: t, ench: [], xp: 0, owner: c.owner, dmg: 0 }) / Cities.unitCost(game, c, t, e));
      return best ? { type: 'unit', id: best } : { type: 'tradeGoods' };
    }
    return { type: 'tradeGoods' };
  },
  // la file est vide : le rôle choisit (renvoie le choix, ou null sans rôle)
  applyRole(game, c) {
    if (!c.role || (c.queue || []).length) return null;
    const next = Cities.roleChoice(game, c, c.role); if (!next) return null;
    const same = c.prod && c.prod.type === next.type && c.prod.id === next.id;
    if (!same) { c.prod = { type: next.type, id: next.id }; if (next.type === 'housing' || next.type === 'tradeGoods') c.progress = 0; }
    c.needsOrder = false;
    return next;
  },

  // Peut-on fonder une cité ici ? (distance mini + territoire étranger)
  // Valeur d'un emplacement de cité, vue par le joueur pid (seules les cases explorées comptent)
  siteInfo(game, pid, plane, x, y) {
    const world = game.world, pl = game.players[pid];
    const ex = pl && pl.explored ? pl.explored[plane] : null;
    let food = 0, prodPct = 0, wild = 0, minGold = 0, minPower = 0, shared = 0, unknown = 0, coast = false;
    const minerals = [];
    for (const [cx, cy] of World.catchment(world, x, y)) {
      if (ex && !ex[cy * world.w + cx]) { unknown++; continue; }
      let f = 1;
      for (const id in game.cities) {
        const o = game.cities[id]; if (o.plane !== plane || (ex && !ex[o.y * world.w + o.x])) continue;
        const dx = Math.abs(World.dxw(world, o.x, cx)), dy = Math.abs(o.y - cy);
        if (dx <= 2 && dy <= 2 && !(dx === 2 && dy === 2)) { f = .5; shared++; break; }
      }
      food += World.foodOf(world, plane, cx, cy) * f;
      prodPct += World.prodPctOf(world, plane, cx, cy) * f;
      const mk = MIN_KEYS[World.get(world, plane, 'mineral', cx, cy)];
      if (mk) { const md = DATA.minerals[mk]; minerals.push(mk); if (mk === 'wildGame') wild += 2 * f; minGold += (md.gold || 0) * f; minPower += (md.power || 0) * f; }
    }
    for (const [nx, ny] of World.neighbors(world, x, y)) if (World.terr(world, plane, nx, ny) === T.OCEAN) coast = true;
    const maxPop = U.clamp(Math.floor(food + wild), 1, MAX_CITY_SIZE);
    const goldPct = World.cityGoldPct(world, plane, x, y);
    const score = maxPop * 4 + prodPct * .12 + goldPct * .2 + (minGold + minPower) * 2.5 + (coast ? 2 : 0) - shared * 1.2 - unknown * .6;
    return { maxPop, prodPct: Math.round(prodPct), goldPct, minerals, shared, unknown, coast, minGold, minPower, score };
  },
  // meilleurs emplacements autour d'une position (pour les colons)
  bestSites(game, pid, plane, x0, y0, opts = {}) {
    const world = game.world, pl = game.players[pid], r = opts.radius || 8;
    const ex = pl.explored[plane];
    const cands = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = World.wx(world, x0 + dx), y = y0 + dy;
      if (y < 1 || y >= world.h - 1 || !ex[y * world.w + x]) continue;
      if (!Cities.canFoundAt(game, pid, plane, x, y).ok) continue;
      if (Move.hostileAt(game, pid, plane, x, y)) continue;
      const info = Cities.siteInfo(game, pid, plane, x, y);
      info.x = x; info.y = y; info.dist = Math.max(Math.abs(dx), Math.abs(dy));
      info.rank = info.score - info.dist * .6;
      cands.push(info);
    }
    cands.sort((a, b) => b.rank - a.rank);
    const out = [];
    for (const c of cands) {
      if (out.length >= (opts.max || 4)) break;
      if (out.length && c.rank < out[0].rank * .72) break;
      if (out.some(o => World.dist(world, o.x, o.y, c.x, c.y) < 4)) continue;
      out.push(c);
    }
    return out;
  },
  canFoundAt(game, pid, plane, x, y) {
    const world = game.world;
    if (game.book && !game.book.claimed && Book.isVault(game, plane, x, y)) return { ok: false, why: 'Le sol refuse ici toute fondation.' };
    if (World.isWaterAt(world, plane, x, y)) return { ok: false, why: 'Impossible de fonder une cité sur l\'eau.' };
    const t = World.terr(world, plane, x, y);
    if (t === T.SNODE || t === T.NNODE || t === T.CNODE) return { ok: false, why: 'Un nœud magique ne peut pas accueillir de cité.' };
    if (t === T.MOUNTAIN && Move.mountainsBlock(game)) return { ok: false, why: 'On ne fonde pas de cité sur une montagne.' };
    if (World.get(world, plane, 'site', x, y) >= 0) { const s = game.sites[World.get(world, plane, 'site', x, y)]; if (s && !s.cleared || (s && ['tower', 'rift', 'shrine', 'breach'].includes(s.type))) return { ok: false, why: 'Un lieu de pouvoir occupe déjà cette case.' }; }
    for (const id in game.cities) {
      const c = game.cities[id];
      if (c.plane === plane && World.dist(world, c.x, c.y, x, y) <= 3) return { ok: false, why: 'Trop proche de ' + c.name + ' (4 cases minimum).' };
    }
    const own = World.get(world, plane, 'owner', x, y);
    if (own >= 0 && own !== pid) return { ok: false, why: 'Territoire d\'un autre sorcier : fondation interdite.' };
    return { ok: true };
  },
};

// Tensions raciales (d'après kazzmir, symétriques)
const RACE_TENSION = (() => {
  const t = {};
  const set = (a, b, v) => { t[[a, b].sort().join('|')] = v; };
  const rows = {
    barbarian: { beastmen: .1, darkelf: .1, draconian: .1, dwarf: .1, gnoll: .1, halfling: .1, highelf: .1, highmen: .1, klackon: .2, lizardman: .1, nomad: 0, orc: 0, troll: .1 },
    beastmen: { darkelf: .2, draconian: .2, dwarf: .2, gnoll: 0, halfling: .1, highelf: .2, highmen: .1, klackon: .2, lizardman: .1, nomad: .1, orc: .1, troll: .2 },
    darkelf: { draconian: .2, dwarf: .3, gnoll: .2, halfling: .2, highelf: .4, highmen: .2, klackon: .2, lizardman: .2, nomad: .2, orc: .2, troll: .3 },
    draconian: { dwarf: .2, gnoll: .2, halfling: .1, highelf: .1, highmen: .1, klackon: .2, lizardman: .1, nomad: .1, orc: .1, troll: .2 },
    dwarf: { gnoll: .1, halfling: 0, highelf: .3, highmen: 0, klackon: .2, lizardman: .1, nomad: 0, orc: .3, troll: .4 },
    gnoll: { halfling: 0, highelf: .3, highmen: 0, klackon: .2, lizardman: .1, nomad: .1, orc: 0, troll: 0 },
    halfling: { highelf: 0, highmen: 0, klackon: .2, lizardman: 0, nomad: 0, orc: 0, troll: 0 },
    highelf: { highmen: 0, klackon: .2, lizardman: .1, nomad: 0, orc: .2, troll: .3 },
    highmen: { klackon: .2, lizardman: .1, nomad: 0, orc: 0, troll: .1 },
    klackon: { lizardman: .2, nomad: .2, orc: .2, troll: .2 },
    lizardman: { nomad: .1, orc: .1, troll: .1 },
    nomad: { orc: 0, troll: .1 },
    orc: { troll: 0 },
  };
  for (const a in rows) for (const b in rows[a]) set(a, b, rows[a][b]);
  return t;
})();
