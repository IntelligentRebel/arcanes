'use strict';
// IA stratégique des sorciers rivaux et diplomatie.

Magic.addPoolForBook = function (game, pl, realm) {
  const n = pl.books[realm];
  const counts = Magic.poolCounts(n, realm);
  for (const r of RARITIES) {
    const have = Magic.spellsOf(realm, r).filter(s => pl.known.includes(s.id) || pl.researchPool.includes(s.id)).length;
    const missing = counts[r] - have;
    const cands = game.rng.shuffle(Magic.spellsOf(realm, r).filter(s => s.kind !== 'stackEnchant').map(s => s.id).filter(id => !pl.known.includes(id) && !pl.researchPool.includes(id)));
    for (let i = 0; i < missing && i < cands.length; i++) pl.researchPool.push(cands[i]);
  }
  Magic.refreshResearchOptions(game, pl);
};

const BUILD_ORDER = ['buildersHall', 'smithy', 'barracks', 'granary', 'library', 'shrine', 'marketplace', 'sawmill', 'farmersMarket', 'temple', 'sagesGuild', 'minersGuild', 'armory', 'cityWalls', 'forestersGuild', 'bank', 'university', 'alchemistsGuild', 'stables', 'fightersGuild', 'defenseTowers', 'parthenon', 'shipwrightsGuild', 'mechaniciansGuild', 'animistsGuild', 'oracle', 'magicRelay', 'armorersGuild', 'wizardsGuild', 'shipYard', 'merchantsGuild', 'cathedral', 'warCollege', 'fantasticStable', 'maritimeGuild'];

const AI = {
  // niveaux : aucun ne triche (mêmes règles, et l'IA ne sait que ce qu'elle a vu) ; chacun joue mieux que le précédent
  LEVELS: ['easy', 'normal', 'hard', 'hardcore'],
  LEVEL_NAMES: { easy: 'Facile', normal: 'Normale', hard: 'Difficile', hardcore: 'Hardcore' },
  lvl(pl) { const i = AI.LEVELS.indexOf(pl && pl.aiLevel); return i < 0 ? 1 : i; },
  // les améliorations d'un niveau, désactivables une à une dans l'arène (AI.EXP.no_xxx) pour mesurer leur effet
  // réglages de l'IA (ajustés par tests/tune.js) ; une partie de test peut les changer pour un seul sorcier (pl.aiExp.tune)
  // les réglages à null gardent la règle du niveau (Hardcore : colon dès 3 habitants, attaque à 55 %, guerre dès 15 % d'avance)
  TUNE: { offense: 1, milChance: 1, settler: 1, planWarMil: 1.3, planDefMil: 1.4, campValue: 1.5, rallyWait: 8,
    settlerPop: null, settlerMax: 2, milCap: 9, milSurplus: 1.5, garrison: 1, attackWin: null, lairWin: 0.65, reach: 16, rallyPower: 300,
    lairValue: 1, nodeValue: 1, summonVal: 1, summonUpkeep: 0.6, cityEnchVal: 1, unitEnchVal: 1, resSummon: 1, resCombat: 15, warEdge: null, warChance: 0.06,
    buyMul: 3, buyKeep: 150, threatKeep: 150, rushZero: 0, buySettler: 0, splitMana: 0, splitResearch: 0, peaceRel: null, peaceChance: null,
    cityCap: null, neutralValue: 1, manaFloor: 20, manaGold: 300, taxGold: 1, extraScouts: 0, wallsValue: 1, bgPop: 1, bgPower: 1,
    bookCands: null, bookThreatAll: 1 },
  tune(pl, k) { const t = pl && pl.aiExp && pl.aiExp.tune; return t && t[k] != null ? t[k] : AI.TUNE[k]; },
  // en essai : actives seulement dans les bancs de test (AI.LAB), absentes du jeu livré tant que leur effet n'est pas mesuré
  PENDING: { purify: 1, vainstrike: 1, firststrike: 1, spells2: 1, cspells2: 1, truestanding: 1, civilians: 1, stackspells: 1, engineers: 1 },   // spells2 : sorts oubliés sur la carte ; cspells2 : en combat
  LAB: false,
  feat(pl, name, min = 1) { return AI.lvl(pl) >= min && !(AI.PENDING[name] && !AI.LAB) && !(AI.EXP && AI.EXP['no_' + name]) && !(pl && pl.aiExp && pl.aiExp['no_' + name]); },
  async takeTurn(game, pl) {
    if (!pl.alive) return;
    Intel.refresh(game, pl);
    AI.planReview(game, pl);
    AI.manageEconomy(game, pl);
    if (AI.feat(pl, 'heroes')) AI.equipHeroes(game, pl);
    AI.riteEscortClaim(game, pl);
    AI.manageCities(game, pl);
    AI.manageMagic(game, pl);
    await AI.manageUnits(game, pl);
  },

  // ---------- économie ----------
  manageEconomy(game, pl) {
    // Difficile : l'impôt qui rapporte le plus une fois comptés les rebelles qu'il fait naître
    if (AI.feat(pl, 'budget', 2)) AI.bestTax(game, pl);
    const { gold } = Players.goldPerTurn(game, pl);
    if (!AI.feat(pl, 'budget', 2)) {
      if (pl.gold < 50 && gold < 5 && pl.taxIdx < 4) pl.taxIdx++;
      else if (pl.gold > 500 && pl.taxIdx > 1) pl.taxIdx--;
    }
    // conversion or <-> mana quand l'un manque
    const ratio = pl.retorts.includes('alchemy') ? 1 : 0.5;
    if (pl.mana < AI.tune(pl, 'manaFloor') && pl.gold > AI.tune(pl, 'manaGold')) { const n = 100; pl.gold -= n; pl.mana += Math.floor(n * ratio); }
    // (l'or n'est jamais négatif en caisse : c'est le solde de la fin du tour qui compte)
    if (pl.gold + gold < 0 && pl.mana > 200) { const n = Math.min(pl.mana - 100, Math.ceil(-(pl.gold + gold) / ratio) + 20); pl.mana -= n; pl.gold += Math.floor(n * ratio); }
    const early = game.turn < 60;
    pl.powerSplit = early ? { mana: 35, research: 35, skill: 30 } : { mana: 40, research: 30, skill: 30 };
    if (pl.researching === 'spell_of_mastery') pl.powerSplit = { mana: 30, research: 50, skill: 20 };
    else if (AI.feat(pl, 'budget', 2)) pl.powerSplit = AI.bestSplit(game, pl, pl.powerSplit);
  },
  pickResearch(game, pl) {
    let best = null, bs = -Infinity;
    for (const id of pl.researchOptions) {
      const s = DATA.spells[id];
      // recherche d'ouvrage : quand elle s'achève en moins de 80 tours, et qu'une cité de ce peuple peut le bâtir
      // versions de pile : seulement à l'essai (stackspells), où l'IA s'en sert pour raccourcir ses campagnes
      if (s.kind === 'stackEnchant' && !AI.feat(pl, 'stackspells', 0)) continue;
      if (s.lore) {
        const rp = Math.max(1, Magic.effectiveResearch(game, pl, id)), host = Cities.ofPlayer(game, pl.id).some(c => c.race === s.params.race);
        // et pas deux plans d'avance : un ouvrage dont on a les plans mais qu'on n'a pas encore bâti passe d'abord
        const mine = Cities.ofPlayer(game, pl.id), unbuilt = (pl.lore || []).some(l => { const r = DATA.spells[l] && DATA.spells[l].params.race; return r && !(pl.wonders || {})[r] && mine.some(c => c.race === r); });
        if (!AI.feat(pl, 'wonder', 0) || !host || unbuilt || Wonders.built(pl) + Wonders.pendingLore(game, pl) >= Wonders.CAP || (s.research - (pl.researching === id ? pl.researchProgress : 0)) / rp > 80) continue;
        // (à l'essai, wonder2) l'ouvrage du peuple dont la meilleure cité produit le plus, et seulement si elle peut le bâtir en un temps raisonnable :
        // pas celui d'une petite cité conquise (le banc 13 : la recherche faite, l'ouvrage bâti dans un tiers des parties seulement)
        const w2 = AI.feat(pl, 'wonder2', 0);
        const hp = w2 ? Math.max(0, ...mine.filter(c => c.race === s.params.race).map(c => Cities.econ(game, c).prod)) : 0;
        if (w2 && hp < 15) continue;
        const sc = 70 + (w2 ? Math.min(15, hp / 4) : game.rng.next() * 15);
        if (sc > bs) { bs = sc; best = id; }
        continue;
      }
      let sc = 100 - Math.sqrt(s.research || 100) * 2;
      if (s.kind === 'summon') sc += (AI.feat(pl, 'respath', 2) ? AI.summonGain(game, pl, id) : 25) * AI.tune(pl, 'resSummon');
      if (s.section === 'combat') sc += AI.tune(pl, 'resCombat');
      if (['wall_of_fire', 'wall_of_stone', 'prosperity', 'gaias_blessing', 'inspirations', 'stream_of_life', 'heavenly_light', 'dark_rituals', 'altar_of_battle', 'consecration'].includes(id)) sc += 20;
      if (s.kind === 'unitEnchant') sc += 8;
      // Purification : utile seulement quand ses terres sont corrompues
      if (id === 'purify_land') sc += AI.feat(pl, 'purify', 1) && U.sum(Cities.ofPlayer(game, pl.id), c => World.catchment(game.world, c.x, c.y).filter(([x, y]) => World.get(game.world, c.plane, 'corrupt', x, y)).length) >= 3 ? 25 : -60;
      if (id === 'spell_of_mastery') sc = pl.known.length > 35 ? 500 : -100;
      sc += AI.counterResearch(game, pl, id);
      sc += game.rng.next() * 15;
      if (sc > bs) { bs = sc; best = id; }
    }
    return best;
  },

  // ---------- cités ----------
  manageCities(game, pl) {
    const L = AI.lvl(pl);
    for (const c of Cities.ofPlayer(game, pl.id)) {
      // dès Normale : la production se revoit souvent (l'ouvrage en cours est mis de côté, rien n'est perdu)
      const often = L >= 1 && AI.threatNear(game, pl, c) > 0;
      if (c.prod.type === 'tradeGoods' || c.prod.type === 'housing' || c.aiReconsider || often || (game.turn + c.id) % 15 === 0 && c.progress === 0) {
        const nx = AI.chooseProduction(game, c);
        c.aiReconsider = false;
        if (nx && (nx.type !== c.prod.type || nx.id !== c.prod.id)) Cities.setProduction(game, c, nx);
      }
      // achat si riche ; dès Normale, on achète aussi ce qui presse : colons, défenseurs d'une cité menacée
      const price = Cities.buyPrice(game, c);
      // urgence (réglage rushZero) : un défenseur pour une cité menacée s'achète même pas encore commencé (au prix fort)
      if (price && (c.progress > 0 || (AI.tune(pl, 'rushZero') && c.prod.type === 'unit' && AI.isMilitary(c.prod.id) && AI.threatNear(game, pl, c) > 0))) {
        let buy = pl.gold > price * AI.tune(pl, 'buyMul') + AI.tune(pl, 'buyKeep');
        // dès Normale : un défenseur pour une cité menacée, en gardant de quoi engager un héros (les héros valent cher)
        if (AI.feat(pl, 'buy')) {
          const pr = c.prod;
          if (pr.type === 'unit' && AI.isMilitary(pr.id) && AI.threatNear(game, pl, c) > 0 && pl.gold >= price + AI.tune(pl, 'threatKeep')) buy = true;
          if (AI.tune(pl, 'buySettler') && pr.type === 'unit' && DATA.units[pr.id] && DATA.units[pr.id].abilities.createOutpost && pl.gold >= price + 40) buy = true;
        }
        if (buy) Game.buy(game, c.id);
      }
      // (pacte, réglage escort) l'escorte du démon s'achète dès qu'on en a les moyens, même pas commencée
      else if (price && c.aiRiteEsc != null && c.prod.type === 'unit' && game.rite && game.rite.phase === 'demon' && game.rite.demon === c.aiRiteEsc && pl.gold >= price + 150) Game.buy(game, c.id);
    }
  },
  chooseProduction(game, c) {
    const pl = game.players[c.owner]; if (!pl) return { type: 'tradeGoods' };
    const e = Cities.econ(game, c);
    const N = e.citizens;
    const garrison = Units.at(game, c.plane, c.x, c.y).filter(u => u.owner === c.owner);
    const cities = Cities.ofPlayer(game, pl.id);
    const settlers = Object.values(game.units).filter(u => u.owner === pl.id && Units.isSettler(u)).length;
    const pers = pl.aiPersonality;
    const maxCities = AI.tune(pl, 'cityCap') != null ? AI.tune(pl, 'cityCap') : pers === 'expansionist' ? 14 : pers === 'perfectionist' ? 7 : 10;
    // garnison pleine : une nouvelle unité attendrait indéfiniment dans la cité, on construit autre chose
    const units = garrison.length >= MAX_STACK ? [] : Cities.buildableUnits(game, c);
    // dès Normale : la force par point de coût et d'entretien (chaque unité mange, la nourriture limite l'armée)
    const qual = AI.feat(pl, 'units');
    let bestMil = U.max(units.filter(t => { const d = DATA.units[t]; return !d.abilities.createOutpost && !d.abilities.construction && !d.abilities.siegeOnly && !d.sailing && (d.melee >= 2 || d.ranged >= 2); }), t => {
      if (qual) return AI.unitValue(game, c, t, e, 'attack') * AI.adaptFactor(game, pl, t);
      const u = { type: t, ench: [], xp: 0, weapon: Units.weaponFor(t, e.weapon), owner: c.owner, dmg: 0 }; return Units.strength(game, u) / Math.pow(Cities.unitCost(game, c, t, e), 0.85);
    });
    // Hardcore : contre la cité visée, la troupe qui en vient le mieux à bout (parmi les meilleures d'ici)
    if (bestMil && AI.feat(pl, 'tailor', 3)) {
      const pool = units.filter(t => AI.isMilitary(t)).sort((p, q) => AI.unitValue(game, c, q, e, 'attack') - AI.unitValue(game, c, p, e, 'attack')).slice(0, 5);
      const tu = AI.tailorUnit(game, pl, c, pool); if (tu && tu !== bestMil) pl._tailorN = (pl._tailorN || 0) + 1; if (tu) bestMil = tu;
    }
    const threat = AI.threatNear(game, pl, c);
    const empireFood = Players.goldPerTurn(game, pl).food;
    // la répartition automatique ajoute des fermiers pour nourrir l'armée : on compte cette marge
    // (une « armée sobre », moins de soldats mais les meilleurs, a été mesurée en v0.19.4 : -253 ± 103 points, bien pire)
    const foodRoom = empireFood + U.sum(cities, x => { if (!x.autoFarmers) return 0; const ex = x === c ? e : Cities.econ(game, x); return Math.floor(ex.workers / 3) * (ex.farmerFood || 2); });
    // 1. défense minimale
    const want = AI.garrisonWant(game, c, threat);
    if (garrison.filter(u => AI.isSoldier(game, u)).length < want && bestMil && (foodRoom > 0 || threat > 0)) return { type: 'unit', id: bestMil };
    // 1 bis. un colon attend une escorte ici : un soldat d'abord
    if (bestMil && garrison.some(u => Units.isSettler(u) && (u.aiWaitEscort || 0) > 0) && garrison.filter(u => AI.isSoldier(game, u)).length < 2) return { type: 'unit', id: bestMil };
    // 1 bis bis. (pacte, réglage escort) le maître du Démon légendaire lui forme une escorte dans ses cités les plus proches de lui
    { const esc = AI.riteEscortBuild(game, pl, c, units, e, threat); if (esc) return { type: 'unit', id: esc }; }
    // 1 ter. éclaireurs : un (deux au-delà de 4 cités) pendant la phase d'exploration
    const scout = units.find(t => DATA.units[t].abilities.scout);
    if (scout && (game.turn <= 60 || (pl.aiBook && pl.aiBook.phase === 'search' && pl.aiBook.searcher == null && AI.feat(pl, 'bookquest', 2)))) {
      const scouts = Object.values(game.units).filter(u => u.owner === pl.id && Units.isScout(u)).length
        + cities.filter(x => x !== c && x.prod && x.prod.type === 'unit' && DATA.units[x.prod.id] && DATA.units[x.prod.id].abilities.scout).length;
      if (scouts < (cities.length >= 4 ? 2 : 1) + AI.tune(pl, 'extraScouts') && (c.fortress || game.rng.chance(0.25))) return { type: 'unit', id: scout };
    }
    // 1 quater. (à l'essai, engineers) un col barre la route d'une cité visée : un ingénieur pour y tracer une route
    if (AI.feat(pl, 'engineers') && pl.aiPass && pl.aiPass.city === c.id && threat <= 0) {
      const eng = units.find(t => DATA.units[t].abilities.construction);
      const have = Object.values(game.units).some(u => u.owner === pl.id && Units.isEngineer(u)) || cities.some(x => x.prod && x.prod.type === 'unit' && DATA.units[x.prod.id] && DATA.units[x.prod.id].abilities.construction);
      if (eng && !have) return { type: 'unit', id: eng };
    }
    // 2. expansion
    const settler = units.find(t => DATA.units[t].abilities.createOutpost);
    const plan = AI.plan(pl);
    const wantSettler = cities.length + settlers < maxCities + (plan && plan.kind === 'expand' ? 2 : 0) && settlers < (cities.length >= 4 ? AI.tune(pl, 'settlerMax') : 1) && N >= (AI.tune(pl, 'settlerPop') != null ? AI.tune(pl, 'settlerPop') : AI.feat(pl, 'settler3') ? 3 : 4) && game.rng.chance(c.fortress && cities.length < 3 ? 0.9 : Math.min(0.95, (plan && plan.kind === 'expand' ? 0.7 : 0.5) * AI.tune(pl, 'settler')));
    if (settler && wantSettler && AI.hasRoomToExpand(game, pl, c)) return { type: 'unit', id: settler };
    // 3. armée offensive
    const army = Object.values(game.units).filter(u => u.owner === pl.id && !Units.isSettler(u) && !Units.isEngineer(u) && !Units.isScout(u) && !Units.has(game, u, 'meld') && u.nodeBound == null).length;
    const garrisonNeed = U.sum(cities, x => AI.garrisonWant(game, x, 0));
    const offense = (pers === 'militarist' || pers === 'maniac' ? 1.6 : pers === 'perfectionist' ? 0.8 : 1.2) * AI.tune(pl, 'offense') * (3 + cities.length + game.turn / 20);
    let milNeed = garrisonNeed + Math.min(offense, AI.tune(pl, 'milCap') * Math.max(1, Math.floor(cities.length / 3)));
    // Difficile et Hardcore : une légende à conquérir, mais pas encore l'armée pour cela
    if (pl.aiLegend && pl.aiLegend.phase === 'build' && AI.feat(pl, 'legend', 2)) milNeed += 4;
    if (pl.aiPortal && pl.aiPortal.phase === 'build' && AI.feat(pl, 'planes', 2)) milNeed += 3;
    if (pl.aiBook && pl.aiBook.phase === 'build' && pl.aiBook.reach >= 0.5 && AI.feat(pl, 'bookquest', 2)) milNeed += 4;
    // le plan : une campagne ou une défense demandent plus de troupes
    if (plan && plan.kind === 'war') milNeed *= AI.tune(pl, 'planWarMil'); else if (plan && plan.kind === 'defend') milNeed *= AI.tune(pl, 'planDefMil');
    // 3 bis. dès Normale : deux machines de siège au plus, quand l'armée vise une cité fortifiée (tours, ou forteresse)
    const aim = pl.aiTargetCity && game.turn - pl.aiTargetCity.turn < 10 ? Cities.at(game, pl.aiTargetCity.plane, pl.aiTargetCity.x, pl.aiTargetCity.y) : null;
    if (AI.feat(pl, 'siege') && army >= 5 && aim && aim.owner !== pl.id && (aim.fortress || aim.buildings.defenseTowers)) {
      const siege = units.find(t => t === 'Catapult') || units.find(t => DATA.units[t].abilities.siegeOnly);
      const have = Object.values(game.units).filter(u => u.owner === pl.id && (DATA.units[u.type].abilities.siegeOnly || u.type === 'Catapult')).length
        + cities.filter(x => x.prod && x.prod.type === 'unit' && (x.prod.id === 'Catapult' || (DATA.units[x.prod.id] && DATA.units[x.prod.id].abilities.siegeOnly))).length;
      if (siege && have < Math.min(2, Math.floor(army / 6)) && game.rng.chance(0.5)) return { type: 'unit', id: siege };
    }
    if (bestMil && army < milNeed && foodRoom > 1 && game.rng.chance(threat > 0 ? 0.8 : Math.min(0.95, 0.4 * AI.tune(pl, 'milChance')))) return { type: 'unit', id: bestMil };
    if (empireFood <= 1) for (const b of ['granary', 'farmersMarket', 'forestersGuild', 'animistsGuild']) if (Cities.canBuild(game, c, b)) return { type: 'building', id: b };
    // 3 ter. la garnison sans armes magiques, dans une cité qui sait en forger : on l'équipe
    if (c.buildings.alchemistsGuild && Cities.rearmTargets(game, c, e).length >= 2 && game.rng.chance(0.5)) return { type: 'rearm' };
    // 3 quater. l'ouvrage de race : dans la cité de ce peuple la plus productive, hors menace
    // (à l'essai, wonder2) une menace que la garnison tient ne l'empêche plus : en guerre, la menace n'est presque jamais nulle
    const wb = DATA.wonders && DATA.wonders[c.race];
    const calm = threat <= 0 || (AI.feat(pl, 'wonder2', 0) && threat <= U.sum(garrison, u => Units.strength(game, u)));
    if (wb && calm && e.prod >= 10 && AI.feat(pl, 'wonder', 0) && Cities.canBuild(game, c, wb)) {
      const peers = cities.filter(x => x.race === c.race);
      if (U.max(peers, x => x === c ? e.prod : Cities.econ(game, x).prod) === c) return { type: 'building', id: wb };
    }
    // 4. bâtiments (Difficile : le plus rentable ; sinon l'ordre habituel)
    if (AI.feat(pl, 'econ', 2)) { const b = AI.bestBuilding(game, c, e, pl, threat); if (b) return { type: 'building', id: b }; }
    else for (const b of BUILD_ORDER) {
      if (!Cities.canBuild(game, c, b)) continue;
      const bd = DATA.buildings[b];
      if (b === 'cityWalls' && threat <= 0 && !c.fortress && N < 8) continue;
      if (b === 'defenseTowers' && threat <= 0 && N < 10) continue;
      if (bd.upkeep > 2 && Players.goldPerTurn(game, pl).gold < bd.upkeep + 2 && !['marketplace', 'bank', 'merchantsGuild'].includes(b)) continue;
      if (bd.cost > e.prod * 40 && N < 6) continue;
      return { type: 'building', id: b };
    }
    if (bestMil && army < milNeed * AI.tune(pl, 'milSurplus') && foodRoom > 2) return { type: 'unit', id: bestMil };
    return N < e.maxPop ? { type: 'housing' } : { type: 'tradeGoods' };
  },
  // la bourse de combat (voir manageMagic) : la compétence entière quand la capitale est menacée, la moitié pour une autre cité ou une attaque
  // contre le joueur seulement (banc 10 : gardée contre tous, elle coûtait à l'IA -14 ± 13 points en Difficile, -32 ± 22 en Hardcore ;
  // les sorts en bataille contre le joueur font partie du jeu, pas ceux des IA entre elles)
  combatPurse(game, pl) {
    const skill = Magic.totalSkill(game, pl), fort = game.cities[pl.fortress];
    const hum = o => AI.isHumanSide(game, o);
    if (fort && fort.owner === pl.id && Intel.threat(game, pl, fort.plane, fort.x, fort.y, 5, hum) > 0) return { mana: skill, capital: true };
    const tg = pl.aiTargetCity, tc = tg && game.turn - tg.turn <= 3 ? Cities.at(game, tg.plane, tg.x, tg.y) : null;
    if ((tc && tc.owner >= 0 && hum(tc.owner)) || Cities.ofPlayer(game, pl.id).some(c => Intel.threat(game, pl, c.plane, c.x, c.y, 5, hum) > 0)) return { mana: Math.ceil(skill / 2) };
    return null;
  },
  // le joueur, ou le sorcier qui en tient lieu au banc d'essai
  isHumanSide(game, pid) { const p = game.players[pid]; return !!(p && (p.human || p.benchHuman)); },
  // menace autour d'une cité : ce que l'IA a vu ce tour ou au précédent (pas d'omniscience)
  threatNear(game, pl, c) {
    const t = Intel.threat(game, pl, c.plane, c.x, c.y, 5);
    // Difficile : les forces hostiles vues plus loin, qui peuvent être là d'ici quatre tours
    return AI.feat(pl, 'foresight', 2) ? Math.max(t, AI.incoming(game, pl, c).str) : t;
  },

  // ---------- magie ----------
  manageMagic(game, pl) {
    if (!pl.researching) pl.researching = AI.pickResearch(game, pl);
    if (pl.casting) return;
    if (pl.banished) {
      const c = Cities.ofPlayer(game, pl.id)[0];
      if (c) Spells.cast(game, pl, 'spell_of_return', { city: c.id });
      return;
    }
    const opts = Spells.castable(game, pl).filter(id => id !== 'spell_of_return');
    const army = Object.values(game.units).filter(u => u.owner === pl.id);
    const manaIncome = Magic.manaPerTurn(game, pl);
    // une ambition (Normale et au-delà) : le plus précieux des enchantements globaux connus. On le lance dès que le mana suffit ;
    // en attendant on met de côté (l'or en trop est changé en mana) et l'on ne dépense que pour l'urgent.
    // un nœud libre sans esprit pour le lier : priorité. L'or paie l'esprit au besoin ; sinon on garde de quoi l'invoquer.
    let spiritReserve = 0;
    if (AI.feat(pl, 'nodes', 1) && opts.includes('magic_spirit') && AI.meldableNodes(game, pl).length > army.filter(u => Units.has(game, u, 'meld')).length) {
      const c = Magic.spellCost(game, pl, 'magic_spirit', false), rate = pl.retorts.includes('alchemy') ? 1 : 2;
      if (pl.mana < c && pl.gold >= (c - pl.mana) * rate + 100) { pl.gold -= (c - pl.mana) * rate; pl.mana = c; }
      spiritReserve = c;
    }
    // un enchantement global à portée : lancé sur le surplus (mana en réserve, et l'or qui dort au-delà de 1 000), sans rien
    // économiser pour lui (mesuré : mettre le mana de côté affaiblit nettement l'IA, en guerre comme en paix)
    const reserve = 0;
    // la bourse de combat : l'ennemi en vue de ses cités, ou une attaque en préparation, le sorcier garde de quoi lancer ses sorts dans
    // la bataille qui vient ; sa capitale menacée, il garde toute sa compétence et change son or en mana pour la défendre
    const purse = AI.feat(pl, 'cpurse', 1) ? AI.combatPurse(game, pl) : null, keep = purse ? purse.mana : 0;
    if (purse && purse.capital && pl.mana < keep) {
      const rate = pl.retorts.includes('alchemy') ? 1 : 2, idle = pl.gold - AI.tune(pl, 'threatKeep');
      const m = Math.max(0, Math.min(keep - pl.mana, Math.floor(idle / rate))); pl.gold -= m * rate; pl.mana += m;
    }
    const goal = AI.feat(pl, 'globals', 1) ? AI.globalGoal(game, pl, manaIncome) : null;
    if (goal) {
      const idle = pl.gold - 1000, rate = pl.retorts.includes('alchemy') ? 1 : 2;
      if (pl.mana < goal.cost && idle > 0 && pl.mana + idle / rate >= goal.cost) { const g = (goal.cost - pl.mana) * rate; pl.gold -= g; pl.mana += Math.floor(g / rate); }
      if (pl.mana >= goal.cost + keep) { const r = Spells.cast(game, pl, goal.id, null); if (r && r.ok !== false) return; }
    }
    let best = null, bs = 0;
    for (const id of opts) {
      const sp = DATA.spells[id];
      const cost = Magic.spellCost(game, pl, id, false);
      if (cost > pl.mana + manaIncome * 3) continue;
      let sc = 0, target = null;
      if (id === 'spell_of_mastery') { sc = 1000; }
      else if (id === 'erasure') {
        // le Sort de Maîtrise d'un rival d'abord ; sinon le plus rare des sorts de l'ennemi le plus dangereux
        const foes = game.players.filter(o => o.alive && o !== pl && pl.contact[o.id] && Book.erasable(game, o).length);
        const som = foes.find(o => Book.erasable(game, o)[0] === 'spell_of_mastery');
        const o = som || U.max(foes.filter(o => pl.diplo[o.id] === 'war'), o => Intel.powerOf(game, pl, o.id));
        if (!o) continue;
        target = { player: o.id }; sc = som ? 90 : 16;
      }
      else if (id === 'palimpsest') {
        const o = U.max(game.players.filter(o => o.alive && o !== pl && pl.contact[o.id]), o => Book.copyable(game, pl, o).length ? (Book.RAR[DATA.spells[Book.copyable(game, pl, o)[0]].rarity] || 0) : -1);
        if (!o || !Book.copyable(game, pl, o).length) continue;
        target = { player: o.id }; sc = 10 + 6 * (Book.RAR[DATA.spells[Book.copyable(game, pl, o)[0]].rarity] || 0);
      }
      else if (id === 'oblivion') {
        // utile quand des ennemis connaissent nos cités et que leurs armées ne sont pas déjà à nos portes
        const foes = game.players.filter(o => o.alive && o !== pl && pl.diplo[o.id] === 'war');
        if (!foes.length || Cities.ofPlayer(game, pl.id).some(c => AI.threatNear(game, pl, c) > 0)) continue;
        sc = 12 + 8 * foes.length;
      }
      else if (id === 'annals') {
        // le rival qui connaît le plus de terres que nous ignorons
        const gain = o => { let n = 0; for (let p = 0; p < 2; p++) { const a = pl.explored[p], b = o.explored && o.explored[p]; if (a && b) for (let i = 0; i < a.length; i++) if (b[i] && !a[i]) n++; } return n; };
        const o = U.max(game.players.filter(o => o.alive && o !== pl && pl.contact[o.id]), gain);
        if (!o) continue;
        const n = gain(o); if (n < 60) continue;
        target = { player: o.id }; sc = Math.min(30, 6 + n / 25);
      }
      else if (id === 'deus_ex_machina') {
        // une fois par partie : sur la cité menacée la plus précieuse (la forteresse d'abord)
        const c = U.max(Cities.ofPlayer(game, pl.id).filter(c => AI.threatNear(game, pl, c) > 0), c => (c.fortress ? 1e6 : 0) + c.pop);
        if (!c) continue;
        target = { city: c.id }; sc = c.fortress ? 70 : 35;
      }
      else if (id === 'legendary_artifact') {
        // l'un des trois seuls artefacts légendaires de la partie : prioritaire dès qu'un héros peut le porter
        if (!Book.artifactsLeft(game).length) continue;
        sc = army.some(u => u.hero) ? 80 : 15;
      }
      else if (id === 'mise_en_abyme') {
        const u = U.max(army.filter(u => !u.hero && !u.avatar && !u.riteDemon && Spells.validate(game, pl, id, { unit: u.id }).ok
          && (DATA.units[u.type].upkeep.mana || 0) <= Math.max(2, manaIncome * 0.5)), u => Units.strength(game, u));
        if (!u || Units.strength(game, u) < 300) continue;
        target = { unit: u.id }; sc = Math.min(45, 10 + Units.strength(game, u) / 80);
      }
      else if (id === 'purify_land') {
        if (!AI.feat(pl, 'purify', 1)) continue;
        const own = new Set();
        for (const c of Cities.ofPlayer(game, pl.id)) for (const [x, y] of World.catchment(game.world, c.x, c.y)) own.add(c.plane + ',' + y * game.world.w + x);
        let bt = null, bn = 0;
        for (const k of own) {
          const [p, i] = k.split(',').map(Number), x = i % game.world.w, y = Math.floor(i / game.world.w);
          if (!World.get(game.world, p, 'corrupt', x, y)) continue;
          const n = Spells.corruptAround(game, p, x, y).filter(([cx, cy]) => own.has(p + ',' + (cy * game.world.w + cx))).length;
          if (n > bn) { bn = n; bt = { plane: p, x, y }; }
        }
        if (!bt || bn < 2) continue;
        target = bt; sc = 8 + bn * 4;
      }
      else if (id === 'seal_rift') {
        const mine = Cities.ofPlayer(game, pl.id);
        const near = s => U.min(mine.filter(c => c.plane === s.plane), c => World.dist(game.world, c.x, c.y, s.x, s.y));
        const r = U.min(Veil.rifts(game, 0).concat(Veil.rifts(game, 1)).filter(s => { const c = near(s); return c && Intel.knows(game, pl, s.plane, s.x, s.y) && World.dist(game.world, c.x, c.y, s.x, s.y) <= 8; }), s => { const c = near(s); return World.dist(game.world, c.x, c.y, s.x, s.y); });
        if (!r) continue;
        target = { plane: r.plane, x: r.x, y: r.y }; sc = 24;
      }
      else if (AI.feat(pl, 'spells2') && AI.SPELLS2[id]) {
        // en essai : sorts hostiles, de rappel et de héros que l'IA ne lançait jamais
        const r = AI.SPELLS2[id](game, pl, { cost, manaIncome, army }); if (!r) continue;
        target = r.target || null; sc = r.sc;
      }
      else if (sp.kind === 'summon' && id !== 'floating_island') {
        const d = DATA.units[sp.params.unit];
        const spirit = ['magic_spirit', 'guardian_spirit'].includes(id);
        // un esprit est un placement : le nœud qu'il liera rapporte bien plus que son entretien (sans quoi, à court de mana, on ne s'en sortirait jamais)
        if (!(spirit && AI.feat(pl, 'nodes', 1)) && (d.upkeep.mana > Math.max(2, manaIncome * AI.tune(pl, 'summonUpkeep')) || manaIncome - d.upkeep.mana < 0)) continue;   // jamais au prix d'un solde de mana négatif
        if (spirit) { const freeNodes = AI.meldableNodes(game, pl).length; const spirits = army.filter(u => Units.has(game, u, 'meld')).length; sc = freeNodes > spirits ? (AI.feat(pl, 'nodes', 1) ? 60 : 40) : 0; }
        else sc = (20 + Units.strength(game, { type: d.id, ench: [], xp: 0, owner: pl.id, dmg: 0 }) / Math.max(10, cost) * 30) * AI.tune(pl, 'summonVal');
      } else if (sp.kind === 'cityEnchant') {
        const wall = ['wall_of_fire', 'wall_of_stone', 'wall_of_darkness'].includes(id);
        const L = AI.lvl(pl);
        const c = U.max(Cities.ofPlayer(game, pl.id).filter(c => !Cities.hasEnch(c, id) && !(id === 'wall_of_stone' && c.buildings.cityWalls)), c => c.pop + (c.fortress ? 5000 : 0) + (AI.feat(pl, 'wallmagic') && wall && AI.threatNear(game, pl, c) > 0 ? 50000 : 0));
        if (!c || ['astral_gate', 'earth_gate', 'flying_fortress', 'spell_ward', 'summoning_circle', 'move_fortress', 'natures_eye'].includes(id)) continue;
        // Rites noirs : seulement là où un lieu de culte en tire du mana, et jamais dans une cité d'un seul habitant
        if (id === 'dark_rituals' && !(Cities.citizens(c) >= 2 && (c.buildings.shrine || c.buildings.temple || c.buildings.parthenon || c.buildings.cathedral))) continue;
        if ((sp.upkeep || 0) > 0 && manaIncome - sp.upkeep < 0) continue;
        target = { city: c.id }; sc = (18 + c.pop / 1000 + (AI.feat(pl, 'wallmagic') && wall && AI.threatNear(game, pl, c) > 0 ? 15 : 0)) * AI.tune(pl, 'cityEnchVal');
      } else if (sp.kind === 'unitEnchant') {
        const u = U.max(army.filter(u => (u.hero || Units.strength(game, u) > 60) && Spells.validate(game, pl, id, { unit: u.id }).ok), u => Units.strength(game, u));
        if (!u || (sp.upkeep > 3 && !(AI.feat(pl, 'spells2') && sp.upkeep <= manaIncome * 0.25)) || manaIncome - (sp.upkeep || 0) < 0) continue;
        target = { unit: u.id }; sc = (8 + Units.strength(game, u) / 30) * AI.tune(pl, 'unitEnchVal');
      } else if (sp.kind === 'heal' && sp.overland) {
        if (id === 'mass_healing') { const hurt = Spells.healTargets(game, pl, id, null); const d = U.sum(hurt, u => Math.min(5, u.dmg)); if (d < 15) continue; sc = 6 + d / 2; }
        else {
          const stacks = U.groupBy(Spells.healTargets(game, pl, 'mass_healing', null), u => u.plane + ',' + u.x + ',' + u.y);
          let bk = null, bd = 0; for (const k in stacks) { const d = U.sum(stacks[k], u => u.dmg); if (d > bd) { bd = d; bk = stacks[k][0]; } }
          if (!bk || bd < 6) continue;
          target = id === 'healing' ? { unit: bk.id } : { plane: bk.plane, x: bk.x, y: bk.y }; sc = 6 + bd / 2;
        }
      } else if (sp.kind === 'global') {
        if (game.players.some(o => o.alive && o.globals.includes(id))) continue;
        if (AI.feat(pl, 'globals', 1)) {
          // un entretien qu'on peut tenir : la moitié du revenu net, ou la réserve sur une quarantaine de tours
          if ((sp.upkeep || 0) > Math.max(manaIncome * 0.6, (pl.mana - cost) / 40)) continue;
          sc = AI.globalValue(game, pl, id);
        } else {
          if (sp.upkeep > manaIncome * 0.5) continue;
          sc = game.turn > 60 ? 25 : 5;
        }
      } else if (sp.kind === 'cityCurse' || ['earthquake', 'call_the_void'].includes(id)) {
        const foes = Intel.knownCities(game, pl).filter(c => c.owner >= 0 && c.owner !== pl.id && Players.isAtWar(game, pl.id, c.owner) && pl.contact[c.owner] && pl.diplo[c.owner] === 'war' && !Cities.hasEnch(c, id));
        const tg = pl.aiTargetCity, opCity = AI.feat(pl, 'curse', 3) && tg && game.turn - tg.turn <= 3 ? foes.find(c => c.plane === tg.plane && c.x === tg.x && c.y === tg.y) : null;
        if ((sp.upkeep || 0) > 0 && manaIncome - sp.upkeep < 0) continue;   // une malédiction s'entretient aussi
        const ok = c => Spells.validate(game, pl, id, { city: c.id }).ok;   // garde magique, consécration…
        const c = (opCity && ok(opCity) ? opCity : null) || U.max(foes.filter(ok), c => c.pop);
        if (!c) continue;
        target = { city: c.id }; sc = opCity === c ? 22 : 12;
      }
      if (target && !Spells.validate(game, pl, id, target).ok) continue;
      // on économise pour l'ambition : seul l'urgent passe, ou ce qui ne l'entame pas
      if (reserve && id !== 'spell_of_mastery' && sc < 33 && cost > pl.mana - reserve) continue;
      if (spiritReserve && !['magic_spirit', 'guardian_spirit', 'spell_of_mastery'].includes(id) && sc < 33 && cost > pl.mana - spiritReserve) continue;
      // la bourse n'est entamée que pour le Sort de Maîtrise, un esprit qui liera un nœud (sauf capitale menacée), ou un sort sur une cité menacée
      // (ses murs) ; pas pour une invocation
      if (keep && cost > pl.mana - keep && id !== 'spell_of_mastery' && !(!purse.capital && ['magic_spirit', 'guardian_spirit'].includes(id))
        && !(target && target.city != null && game.cities[target.city] && game.cities[target.city].owner === pl.id && AI.threatNear(game, pl, game.cities[target.city]) > 0)) continue;
      sc *= 0.8 + game.rng.next() * 0.4;
      if (sc > bs) { bs = sc; best = { id, target }; }
    }
    if (best && bs > 10) Spells.cast(game, pl, best.id, best.target);
  },

  // ---------- unités ----------
  async manageUnits(game, pl) {
    const world = game.world;
    const mine = () => Object.values(game.units).filter(u => u.owner === pl.id && u.moves > 0);
    // escortes dont le colon a disparu (cité fondée, colon tué) : elles redeviennent libres, et gardent la nouvelle cité
    for (const u of Object.values(game.units)) if (u.owner === pl.id && u.aiEscort != null) { const st = game.units[u.aiEscort]; if (!st || st.owner !== pl.id) delete u.aiEscort; }
    // 1. colons, accompagnés d'une escorte qui deviendra la garnison de la nouvelle cité
    for (const u of mine().filter(u => Units.isSettler(u))) {
      if (!game.units[u.id]) continue;
      const chk = Cities.canFoundAt(game, pl.id, u.plane, u.x, u.y);
      if (u.aiTarget && u.x === u.aiTarget[0] && u.y === u.aiTarget[1] && chk.ok) { Game.foundCity(game, u.id); continue; }
      if (!u.aiTarget || !Cities.canFoundAt(game, pl.id, u.plane, u.aiTarget[0], u.aiTarget[1]).ok) u.aiTarget = AI.feat(pl, 'sites') ? AI.siteFor(game, pl, u) || AI.findCitySite(game, pl, u) : AI.findCitySite(game, pl, u);
      if (!u.aiTarget) {
        if (chk.ok && game.rng.chance(0.3)) { Game.foundCity(game, u.id); continue; }
        // nulle part où aller : au bout de dix tours, on cesse de le nourrir
        if ((u.aiIdle = (u.aiIdle || 0) + 1) >= 10) Game.disband(game, u.id);
        continue;
      }
      u.aiIdle = 0;
      if (u.x === u.aiTarget[0] && u.y === u.aiTarget[1]) { if (chk.ok) Game.foundCity(game, u.id); continue; }
      const esc = AI.escortFor(game, pl, u);
      const ids = [u.id];
      if (esc) {
        if (esc.plane !== u.plane || esc.x !== u.x || esc.y !== u.y) {
          // l'escorte rejoint le colon, qui l'attend
          const jm = await Game.moveGroup(game, [esc.id], u.x, u.y, { noAttack: true });
          if (jm && !jm.ok && /chemin/i.test(jm.why || '')) { delete esc.aiEscort; continue; }   // il ne peut pas le rejoindre : on en cherchera un autre
          if (!game.units[esc.id] || esc.x !== u.x || esc.y !== u.y || esc.moves <= 0) continue;
        }
        ids.push(esc.id);
        u.aiWaitEscort = 0;
      } else if (AI.feat(pl, 'alone') && Intel.threat(game, pl, u.plane, u.aiTarget[0], u.aiTarget[1], 6) <= 0 && Intel.threat(game, pl, u.plane, u.x, u.y, 4) <= 0) {
        // dès Normale : sans danger en vue, le colon part seul plutôt que d'attendre
        u.aiWaitEscort = 0;
      } else if ((u.aiWaitEscort = (u.aiWaitEscort || 0) + 1) <= 4 && Cities.at(game, u.plane, u.x, u.y)) {
        // personne pour l'escorter : il patiente quelques tours dans la cité, qui lève un soldat
        const home = Cities.at(game, u.plane, u.x, u.y); if (home.owner === pl.id) home.aiReconsider = true;
        continue;
      }
      const bx = u.x, by = u.y, bp = u.plane;
      const mv = await Game.moveGroup(game, ids, u.aiTarget[0], u.aiTarget[1], { noAttack: true });
      const bad = () => { pl.aiBadSites = pl.aiBadSites || {}; pl.aiBadSites[u.plane + ',' + u.aiTarget[0] + ',' + u.aiTarget[1]] = game.turn; u.aiTarget = null; u.aiStuck = 0; };
      if (mv && !mv.ok && /chemin/i.test(mv.why || '')) { bad(); continue; }
      // bloqué deux tours de suite au même endroit (une unité étrangère sur la case visée…) : on choisit un autre site
      if (game.units[u.id] && u.aiTarget && u.x === bx && u.y === by && u.plane === bp) { if ((u.aiStuck = (u.aiStuck || 0) + 1) >= 2) { bad(); continue; } }
      else u.aiStuck = 0;
      if (game.units[u.id] && u.aiTarget && u.x === u.aiTarget[0] && u.y === u.aiTarget[1] && Cities.canFoundAt(game, pl.id, u.plane, u.x, u.y).ok) Game.foundCity(game, u.id);
    }
    // 2. esprits magiques : nœuds
    for (const u of mine().filter(u => Units.has(game, u, 'meld'))) {
      const si = World.get(world, u.plane, 'site', u.x, u.y);
      const nd = si >= 0 ? game.sites[si] : null;
      if (nd && nd.type === 'node' && nd.owner !== pl.id && !Game.siteHasGuardians(nd) && !(nd.owner >= 0 && ['peace', 'alliance'].includes(pl.diplo[nd.owner]))) { Game.meld(game, u.id); continue; }
      // un esprit gardien sans nœud libre à portée relève la garde d'un nœud lié par un esprit magique
      const own = u.type === 'GuardianSpirit' ? game.sites.filter(s => s.type === 'node' && s.owner === pl.id && s.meldBy !== 'GuardianSpirit') : [];
      const node = U.min(AI.meldableNodes(game, pl).concat(own).filter(s => s.plane === u.plane && !(Intel.sees(game, pl, s.plane, s.x, s.y) && Units.at(game, s.plane, s.x, s.y).some(o => o.owner !== pl.id))), s => World.dist(world, s.x, s.y, u.x, u.y) + (s.owner === pl.id ? 20 : 0));
      if (node && node.owner === pl.id && node.x === u.x && node.y === u.y) { Game.meld(game, u.id); continue; }
      if (node) await Game.moveGroup(game, [u.id], node.x, node.y, { noAttack: true });
    }
    // 3. ingénieurs : (à l'essai, engineers) d'abord le col qui barre la route d'une cité visée ; sinon routes vers la cité voisine la plus proche
    if (AI.feat(pl, 'engineers')) AI.passCheck(game, pl);
    for (const u of mine().filter(u => Units.isEngineer(u))) {
      if (AI.feat(pl, 'engineers') && pl.aiPass && pl.aiPass.plane === u.plane && await AI.passWork(game, pl, u)) continue;
      if (u.status === 'road') continue;
      if (!World.hasRoad(world, u.plane, u.x, u.y) && !Cities.at(game, u.plane, u.x, u.y)) { u.status = 'road'; continue; }
      const cities = Cities.ofPlayer(game, pl.id).filter(c => c.plane === u.plane);
      const from = U.min(cities, c => World.dist(world, c.x, c.y, u.x, u.y));
      const to = from && U.min(cities.filter(c => c !== from), c => World.dist(world, c.x, c.y, from.x, from.y));
      if (!to) continue;
      const path = Move.roadPath(game, [u], u.plane, to.x, to.y);
      const step = path && path.find(p => !World.hasRoad(world, u.plane, p.x, p.y));
      if (step) { await Game.moveGroup(game, [u.id], step.x, step.y, { noAttack: true }); if (game.units[u.id] && u.x === step.x && u.y === step.y) u.status = 'road'; }
    }
    // 3 bis. éclaireurs : vers l'inconnu le plus proche ; quand tout est exploré, retour à la cité la plus proche
    for (const u of mine().filter(u => Units.isScout(u))) {
      if (!game.units[u.id] || (pl.aiBook && pl.aiBook.searcher === u.id && pl.aiBook.phase === 'search')) continue;
      const tc = Move.nearestCache(game, [u], 10);
      if (tc) { await Game.moveGroup(game, [u.id], tc[0], tc[1], { noAttack: true }); continue; }
      const fr = Move.nearestFrontier(game, [u], 3000);
      if (fr) { await Game.moveGroup(game, [u.id], fr[0], fr[1], { noAttack: true }); continue; }
      const home = U.min(Cities.ofPlayer(game, pl.id).filter(c => c.plane === u.plane), c => World.dist(world, c.x, c.y, u.x, u.y));
      if (home && (home.x !== u.x || home.y !== u.y)) await Game.moveGroup(game, [u.id], home.x, home.y, { noAttack: true });
    }
    // 4. garnisons : réaffectation complète à chaque tour (dès Normale, les unités en opération ou en convalescence n'en font pas partie)
    for (const u of Object.values(game.units)) if (u.owner === pl.id) { u.aiRole = null; u.aiPost = null; }
    const L = AI.lvl(pl);
    // les unités engagées dans l'assaut d'une légende ne gardent pas les cités
    const engaged = new Set((pl.aiLegend && pl.aiLegend.members && pl.aiLegend.phase !== 'build' ? pl.aiLegend.members : [])
      .concat(pl.aiPortal && pl.aiPortal.members && pl.aiPortal.phase !== 'build' ? pl.aiPortal.members : [])
      .concat(pl.aiTrip && pl.aiTrip.members ? pl.aiTrip.members : [])
      .concat(pl.aiBook && pl.aiBook.members ? pl.aiBook.members : []));
    // les engins de siège ne gardent pas les cités : ils suivent l'armée
    const pool = Object.values(game.units).filter(u => u.owner === pl.id && !u.hero && u.aiEscort == null && u.riteEscort == null && !engaged.has(u.id) && AI.isSoldier(game, u) && !DATA.units[u.type].abilities.siegeOnly);
    const citiesByNeed = Cities.ofPlayer(game, pl.id).map(c => ({ c, threat: AI.threatNear(game, pl, c) })).sort((a, b) => (b.c.fortress - a.c.fortress) || (b.threat - a.threat));
    const posted = c => pool.filter(u => u.aiPost === c.id).length;
    const claimHere = (c, upTo) => {
      const here = pool.filter(u => !u.aiRole && u.plane === c.plane && u.x === c.x && u.y === c.y).sort((a, b) => Units.strength(game, a) - Units.strength(game, b));
      for (const u of here) { if (posted(c) >= upTo) break; u.aiRole = 'garrison'; u.aiPost = c.id; }
    };
    const pull = async (c, upTo) => {
      while (posted(c) < upTo) {
        const free = pool.filter(u => !u.aiRole && u.plane === c.plane && u.moves > 0);
        const near = U.min(free, u => World.dist(world, u.x, u.y, c.x, c.y));
        if (!near || World.dist(world, near.x, near.y, c.x, c.y) > 12) break;
        near.aiRole = 'garrison'; near.aiPost = c.id;
        await Game.moveGroup(game, [near.id], c.x, c.y, { noAttack: true });
      }
    };
    // a. chaque cité garde d'abord un de ses propres défenseurs ; b. une cité sans défense en fait venir un ; c. on complète
    for (const { c } of citiesByNeed) claimHere(c, 1);
    for (const { c } of citiesByNeed) if (!posted(c)) await pull(c, 1);
    for (const { c, threat } of citiesByNeed) {
      let want = AI.garrisonWant(game, c, threat);
      // Difficile : assez de défenseurs pour la force qui arrive (ce qu'on en a vu), sans vider les autres cités
      if (AI.feat(pl, 'foresight', 2) && threat > 0) {
        const def = U.sum(pool.filter(u => u.aiPost === c.id || (u.plane === c.plane && u.x === c.x && u.y === c.y)), u => Units.strength(game, u)) * (c.buildings.cityWalls ? 1.5 : 1) + Battle.towerStrength(game, c);
        const avg = Math.max(30, U.sum(pool, u => Units.strength(game, u)) / Math.max(1, pool.length));
        if (def < threat * 1.2) want = Math.min(MAX_STACK, Math.max(want, posted(c) + Math.ceil((threat * 1.2 - def) / avg)));
      }
      claimHere(c, want); await pull(c, want);
    }
    // 5. forces offensives : rassemblement puis attaque groupée de la meilleure cible connue
    // (des variantes plus élaborées, soins, interceptions, ralliement au front, ont été mesurées dans l'arène : elles jouaient moins bien)
    const myCities = Cities.ofPlayer(game, pl.id);
    let rally = game.cities[pl.aiRally];
    // le plan : une campagne se rassemble dans notre cité la plus proche de l'ennemi visé
    const plan = AI.plan(pl), stage = plan && plan.kind === 'war' ? AI.stagingCity(game, pl, plan.target) : null;
    if (stage) { if (rally !== stage) for (const u of mine()) delete u.aiWaitSince; rally = stage; pl.aiRally = stage.id; }
    else if (!rally || rally.owner !== pl.id || (game.turn % 20 === 0)) {
      rally = U.max(myCities, c => (c.fortress ? 3 : 0) + c.pop / 3000 - (AI.threatNear(game, pl, c) > 0 ? -5 : 0));
      pl.aiRally = rally ? rally.id : null;
    }
    // Difficile et Hardcore : l'assaut de la légende d'un héros, quand la simulation le donne gagnant
    const legend = AI.feat(pl, 'legend', 2) ? await AI.legendUnits(game, pl) : new Set();
    if (game.over) return;
    // Difficile et Hardcore : la prise d'une tour de magie, pour ouvrir la porte de l'autre plan
    const portal = AI.feat(pl, 'planes', 2) ? await AI.portalUnits(game, pl, legend) : new Set();
    if (game.over) return;
    // puis, la porte ouverte, une expédition vers l'autre plan
    const trip = AI.feat(pl, 'planes', 2) ? await AI.tripUnits(game, pl, new Set([...legend, ...portal])) : new Set();
    if (game.over) return;
    for (const id of trip) portal.add(id);
    if (game.over) return;
    // Difficile et Hardcore : l'expédition vers la case du Livre de légende, quand trois fragments sont réunis
    const bookx = AI.feat(pl, 'bookquest', 2) ? await AI.bookUnits(game, pl, new Set([...legend, ...portal])) : new Set();
    if (game.over) return;
    for (const id of bookx) portal.add(id);
    const attackers = mine().filter(u => !legend.has(u.id) && !portal.has(u.id) && u.aiRole !== 'garrison' && u.aiEscort == null && u.riteEscort == null && !Units.isSettler(u) && !Units.isEngineer(u) && !Units.isScout(u) && !Units.has(game, u, 'meld') && u.nodeBound == null && !DATA.units[u.type].sailing && !u.stasis && !u.riteDemon);
    // Hardcore : le Démon légendaire du pacte marche seul sur la cible
    await AI.riteDemonTurn(game, pl); if (game.over) return;
    const groups = U.groupBy(attackers, u => u.plane + ',' + u.x + ',' + u.y);
    for (const k in groups) {
      const units = groups[k].filter(u => game.units[u.id] && u.moves > 0);
      if (!units.length) continue;
      const power = U.sum(units, u => Units.strength(game, u));
      const u0 = units[0];
      const atRally = rally && u0.plane === rally.plane && u0.x === rally.x && u0.y === rally.y;
      // un petit groupe au point de ralliement attend des renforts, sauf proie très facile ou attente trop longue
      const small = units.length < 4 && power < AI.tune(pl, 'rallyPower');
      if (atRally) for (const u of units) if (u.aiWaitSince == null) u.aiWaitSince = game.turn;
      const waited = atRally ? game.turn - Math.min(...units.map(u => u.aiWaitSince)) : 0;
      const minWin = small && waited < AI.tune(pl, 'rallyWait') ? 0.9 : 0;
      const onlySiege = units.every(u => DATA.units[u.type].abilities.siegeOnly);
      const target = !onlySiege && (units.length >= 3 || power > 150 || atRally) ? AI.pickTarget(game, pl, u0, power, minWin, units) : null;
      if (target && (target.kind === 'city' || target.kind === 'probe')) pl.aiTargetCity = { plane: u0.plane, x: target.tx != null ? target.tx : target.x, y: target.ty != null ? target.ty : target.y, turn: game.turn };
      if (target && target.kind === 'city') { if (!pl._fronts || pl._fronts.turn !== game.turn) pl._fronts = { turn: game.turn, keys: [] }; pl._fronts.keys.push(u0.plane + ',' + target.x + ',' + target.y); }
      // une cité fortifiée : l'armée attend au ralliement l'engin de siège qui la rejoint (6 tours au plus)
      if (target && target.kind === 'city' && atRally && waited < 6) {
        const tc = Cities.at(game, u0.plane, target.tx != null ? target.tx : target.x, target.ty != null ? target.ty : target.y);
        const isSiege = u => DATA.units[u.type].abilities.siegeOnly || u.type === 'Catapult';
        if (tc && (tc.fortress || tc.buildings.defenseTowers) && !units.some(isSiege)
          && Object.values(game.units).some(u => u.owner === pl.id && isSiege(u) && u.plane === u0.plane && World.dist(world, u.x, u.y, u0.x, u0.y) <= 8)) continue;
      }
      if (target) {
        for (const u of units) u.aiWaitSince = null;
        // (à l'essai, stackspells) marche sur l'eau ou vol de toute la pile, quand cela raccourcit nettement la route vers la cité visée
        if (target.kind === 'city' && AI.feat(pl, 'stackspells', 0)) AI.stackSpellFor(game, pl, units, target);
        const mv = await Game.moveGroup(game, units.map(u => u.id), target.x, target.y, target.kind === 'probe' ? { noAttack: true } : {}); if (game.over) return;
        if (mv && !mv.ok && game.units[u0.id] && u0.plane === +k.split(',')[0] && u0.x === +k.split(',')[1] && u0.y === +k.split(',')[2]) AI.markBadTarget(game, pl, u0.plane, target.x, target.y);
        continue;
      }
      // Difficile et Hardcore : une armée sans cible passe d'un plan à l'autre par une tour de magie dégagée
      if (!onlySiege && await AI.planeTrip(game, pl, units, power)) { if (game.over) return; continue; }
      if (rally && !atRally && rally.plane === u0.plane) {
        // ne pas dépasser 9 au point de ralliement : les surplus attendent à côté
        const here = Units.at(game, rally.plane, rally.x, rally.y).filter(u => u.owner === pl.id).length;
        if (here + units.length <= MAX_STACK) await Game.moveGroup(game, units.map(u => u.id), rally.x, rally.y, { noAttack: true });
      }
    }
  },

  // l'armée et sa cible : tours de marche aujourd'hui, et avec Marche sur l'eau majeure ou Vol majeur sur toute la pile.
  // Lancé si le sort fait gagner 3 tours au moins (ou ouvre une route qui n'existait pas) et que le mana suffit sans vider la réserve.
  // ---------- en essai (AI.PENDING.engineers) : percer les cols ----------
  // l'IA ne formait jamais d'ingénieurs : avec les montagnes infranchissables sans route, une cité voisine derrière un col
  // restait hors d'atteinte de ses armées. Tous les 8 tours : la cité étrangère connue la plus proche (≤ 14 cases) qu'une troupe
  // à pied ne peut atteindre mais qu'un ingénieur atteint. pl.aiPass = { plane, city (d'où partir), tx, ty }
  passCheck(game, pl) {
    if (pl.aiPass && !(c => c && c.owner !== pl.id)(Cities.at(game, pl.aiPass.plane, pl.aiPass.tx, pl.aiPass.ty))) pl.aiPass = null;
    if (!Move.mountainsBlock(game) || (game.turn + pl.id) % 8 || (pl.aiPass && game.turn - pl.aiPass.turn < 40)) return;
    const world = game.world, mine = Cities.ofPlayer(game, pl.id);
    const foes = Object.values(game.cities).filter(c => c.owner !== pl.id && (c.owner < 0 || !['peace', 'alliance'].includes(pl.diplo[c.owner])) && Intel.knows(game, pl, c.plane, c.x, c.y));
    let best = null;
    for (const f of foes) {
      const home = U.min(mine.filter(c => c.plane === f.plane), c => World.dist(world, c.x, c.y, f.x, f.y));
      if (!home) continue;
      const d = World.dist(world, home.x, home.y, f.x, f.y);
      if (d > 14 || (best && d >= best.d)) continue;
      // les troupes à pied du peuple de la cité (s'il en a qui ne passent pas les montagnes) ; l'ingénieur part de la cité la plus proche qui sait le former
      const types = (DATA.races[home.race] && DATA.races[home.race].units) || [];
      const foot = types.find(t => { const u = DATA.units[t]; return AI.isMilitary(t) && !u.flying && !u.abilities.mountaineer && !u.abilities.pathfinding; });
      const yard = U.min(mine.filter(c => c.plane === f.plane && Cities.buildableUnits(game, c).some(t => DATA.units[t].abilities.construction)), c => World.dist(world, c.x, c.y, f.x, f.y));
      const eng = yard && Cities.buildableUnits(game, yard).find(t => DATA.units[t].abilities.construction);
      if (!foot || !eng) continue;
      const fake = t => ({ id: -1, type: t, owner: pl.id, plane: home.plane, x: home.x, y: home.y, ench: [], xp: 0, weapon: 0, dmg: 0, hero: null, items: null, moves: 2 });
      if (Move.findPath(game, [fake(foot)], home.plane, f.x, f.y, { maxNodes: 6000 })) continue;
      if (!Move.roadPath(game, [fake(eng)], home.plane, f.x, f.y, { maxNodes: 6000 })) continue;
      best = { plane: home.plane, city: yard.id, tx: f.x, ty: f.y, turn: game.turn, d };
    }
    if (best) { delete best.d; pl.aiPass = best; pl._passN = (pl._passN || 0) + 1; }
  },
  // l'ingénieur va à la première montagne sans route du trajet vers la cité visée et y trace la route ; true : il est occupé
  async passWork(game, pl, u) {
    const P = pl.aiPass, world = game.world;
    const onMtn = (x, y) => World.terr(world, u.plane, x, y) === T.MOUNTAIN && !World.hasRoad(world, u.plane, x, y);
    if (u.status === 'road' && onMtn(u.x, u.y)) return true;
    const path = Move.roadPath(game, [u], u.plane, P.tx, P.ty, { maxNodes: 6000 });
    const step = path && path.find(p => onMtn(p.x, p.y));
    if (!step) { if (!path || !path.some(p => onMtn(p.x, p.y))) pl.aiPass = null; return false; }   // le col est ouvert
    if (u.x !== step.x || u.y !== step.y) await Game.moveGroup(game, [u.id], step.x, step.y, { noAttack: true });
    if (game.units[u.id] && u.x === step.x && u.y === step.y) { u.status = 'road'; pl._passRoad = (pl._passRoad || 0) + 1; }
    return true;
  },
  stackSpellFor(game, pl, units, target) {
    if (pl.casting) return false;
    const opts = ['water_walking_mass', 'flight_mass'].filter(id => Spells.knownFor(game, pl).includes(id));
    if (!opts.length) return false;
    const u0 = units[0], T0 = { plane: u0.plane, x: u0.x, y: u0.y };
    const turns = us => { const path = Move.findPath(game, us, u0.plane, target.x, target.y, {}); if (!path || !path.length) return Infinity;
      const per = Math.max(1, Math.min(...Move.pacers(game, us).map(u => Units.maxMoves(game, u)))); return (Move.stepTurns(0, per, path).pop() || 0) + 1; };
    const now = turns(units);
    let best = null;
    for (const id of opts) {
      const who = Spells.stackUnits(game, pl, id, T0); if (!who.length) continue;
      const cost = Spells.castCost(game, pl, id, T0); if (cost > pl.mana * 0.6) continue;
      const minor = DATA.spells[id].params.enchant;
      for (const u of who) u.ench.push(minor);
      const t = turns(units);
      for (const u of who) u.ench.splice(u.ench.lastIndexOf(minor), 1);
      const gain = now - t;
      if (t < Infinity && (gain >= 3 || now === Infinity) && (!best || t < best.t || (t === best.t && cost < best.cost))) best = { id, t, cost };
    }
    if (!best) return false;
    const r = Spells.cast(game, pl, best.id, T0);
    if (r && r.ok !== false) { pl._stackCasts = (pl._stackCasts || 0) + 1; return true; }
    return false;
  },
  // en expédition sur un plan où le sorcier n'a aucune cité : la cité ennemie connue la plus proche, sinon l'inconnu,
  // sinon le retour par une tour (le départ est organisé par AI.tripUnits)
  async planeTrip(game, pl, units, power) {
    if (!AI.feat(pl, 'planes', 2)) return false;
    const world = game.world, u0 = units[0], here = u0.plane, ids = units.map(u => u.id);
    // une tête de pont (une ou deux cités sur ce plan, sans le point de ralliement) n'arrête pas la campagne
    const mineHere = Cities.ofPlayer(game, pl.id).filter(c => c.plane === here);
    const rally = game.cities[pl.aiRally];
    if (mineHere.length >= 3 || (rally && rally.owner === pl.id && rally.plane === here)) { for (const u of units) delete u.aiGoHome; return false; }
    const goHome = units.some(u => u.aiGoHome != null);
    const foes = Intel.knownCities(game, pl).filter(c => c.plane === here && c.owner !== pl.id && !(c.owner >= 0 && (pl.diplo[c.owner] === 'peace' || pl.diplo[c.owner] === 'alliance')) && !AI.badTarget(game, pl, here, c.x, c.y));
    const goal = goHome ? null : U.min(foes, c => World.dist(world, c.x, c.y, u0.x, u0.y));
    if (goal) {
      const st = AI.stagingTile(game, pl, u0, goal.x, goal.y);
      if (st && (st[0] !== u0.x || st[1] !== u0.y)) { for (const u of units) delete u.aiStageSince; await Game.moveGroup(game, ids, st[0], st[1], { noAttack: true }); return true; }
      // déjà au pied de la cité et l'attaque a été jugée trop risquée : on attend sur place (8 tours au plus) plutôt que d'aller et venir
      if (st) {
        for (const u of units) if (u.aiStageSince == null) u.aiStageSince = game.turn;
        if (game.turn - Math.min(...units.map(u => u.aiStageSince)) < 8) { for (const u of units) u.moves = 0; return true; }
        // l'attente n'a rien donné : cette cité est écartée un moment (sinon l'armée s'éloigne d'un pas et revient attendre, sans fin)
        AI.markBadTarget(game, pl, here, goal.x, goal.y); for (const u of units) { delete u.aiStageSince; u.aiGoHome = game.turn; }   // l'expédition rentre
      }
    }
    const fr = goHome ? null : Move.nearestFrontier(game, units, 3000);
    if (fr) { await Game.moveGroup(game, ids, fr[0], fr[1], { noAttack: true }); return true; }
    const tower = U.min(game.sites.filter(s => s.type === 'tower' && s.plane === here && s.cleared), s => World.dist(world, s.x, s.y, u0.x, u0.y));
    if (!tower || AI.sealed(game)) return false;
    if (u0.x === tower.x && u0.y === tower.y) return Game.planeShift(game, ids).ok;
    await Game.moveGroup(game, ids, tower.x, tower.y, { noAttack: true });
    return true;
  },
  TRIP_TURN: 40, TRIP_POWER: 400, TRIP_COOL: 25,

  isSoldier(game, u) {
    return !Units.isSettler(u) && !Units.isEngineer(u) && !Units.isScout(u) && !Units.has(game, u, 'meld') && u.nodeBound == null && !DATA.units[u.type].sailing && !u.stasis && !u.riteDemon;
  },
  // l'escorte d'un colon : déjà désignée, sinon le soldat le plus proche (6 cases au plus) qu'on peut retirer sans laisser une cité vide
  escortFor(game, pl, st) {
    const world = game.world;
    let esc = Object.values(game.units).find(u => u.owner === pl.id && u.aiEscort === st.id);
    if (esc) return esc;
    const cands = Object.values(game.units).filter(u => u.owner === pl.id && u.aiEscort == null && u.riteEscort == null && !u.hero && u.plane === st.plane && AI.isSoldier(game, u)
      && World.dist(world, u.x, u.y, st.x, st.y) <= 6 && (Units.stats(game, u).melee > 0 || Units.stats(game, u).ranged > 0));
    const ok = u => {
      const c = Cities.at(game, u.plane, u.x, u.y);
      if (!c || c.owner !== pl.id) return true;
      return Units.at(game, u.plane, u.x, u.y).filter(o => o !== u && o.owner === pl.id && o.aiEscort == null && o.riteEscort == null && AI.isSoldier(game, o)).length >= 1;
    };
    const reach = u => (u.x === st.x && u.y === st.y) || !!Move.findPath(game, [u], u.plane, st.x, st.y, {});
    esc = U.min(cands.filter(u => ok(u) && reach(u)), u => World.dist(world, u.x, u.y, st.x, st.y) * 10 - Units.strength(game, u) / 50);
    if (esc) esc.aiEscort = st.id;
    return esc || null;
  },
  garrisonWant(game, c, threat) {
    const n = (c.fortress ? 3 : 1) + (Cities.citizens(c) >= 8 ? 1 : 0) + (threat > 0 ? 1 : 0) + (game.turn > 100 ? 1 : 0);
    const k = AI.tune(game.players[c.owner], 'garrison');
    return k === 1 ? n : Math.max(1, Math.round(n * k));
  },
  meldableNodes(game, pl) {
    return game.sites.filter(s => s.type === 'node' && s.owner !== pl.id && Intel.knows(game, pl, s.plane, s.x, s.y) && !Game.siteHasGuardians(s) && (s.owner < 0 || pl.diplo[s.owner] === 'war'));
  },
  // emplacements hors d'atteinte (pas de chemin depuis le colon) : écartés une trentaine de tours
  badSite(game, pl, p, x, y) { const t = pl.aiBadSites && pl.aiBadSites[p + ',' + x + ',' + y]; return t != null && game.turn - t < 30; },
  hasRoomToExpand(game, pl, c) {
    const world = game.world;
    const land = Game.reachableLand(game, c.plane, c.x, c.y, 12);   // à pied : l'IA n'embarque pas ses colons
    for (let k = 0; k < 40; k++) {
      const x = World.wx(world, c.x + game.rng.range(-9, 9)), y = c.y + game.rng.range(-9, 9);
      if (y < 2 || y >= world.h - 2 || !Intel.knows(game, pl, c.plane, x, y)) continue;
      if (!land.has(y * world.w + x) || AI.badSite(game, pl, c.plane, x, y)) continue;
      if (Cities.canFoundAt(game, pl.id, c.plane, x, y).ok) return true;
    }
    return false;
  },
  findCitySite(game, pl, u) {
    const world = game.world;
    let best = null, bs = -Infinity;
    const r = 10;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = World.wx(world, u.x + dx), y = u.y + dy;
      if (y < 2 || y >= world.h - 2 || !Intel.knows(game, pl, u.plane, x, y)) continue;
      if (!Cities.canFoundAt(game, pl.id, u.plane, x, y).ok || AI.badSite(game, pl, u.plane, x, y)) continue;
      if (Intel.sees(game, pl, u.plane, x, y) && Move.hostileAt(game, pl.id, u.plane, x, y)) continue;
      let food = 0, prod = 0, gold = 0, coast = 0;
      for (const [cx, cy] of World.catchment(world, x, y)) {
        if (!Intel.knows(game, pl, u.plane, cx, cy)) continue; // l'inconnu ne compte pas
        food += World.foodOf(world, u.plane, cx, cy); prod += World.prodPctOf(world, u.plane, cx, cy);
        const m = MIN_KEYS[World.get(world, u.plane, 'mineral', cx, cy)]; if (m) { const md = DATA.minerals[m]; gold += (md.gold || 0) + (md.power || 0) + (md.food || 0); }
      }
      for (const [nx, ny] of World.neighbors(world, x, y)) if (World.terr(world, u.plane, nx, ny) === T.OCEAN) coast = 1;
      // danger : lieux gardés proches
      let danger = 0;
      for (const s of game.sites) if (s.plane === u.plane && Game.siteHasGuardians(s) && World.dist(world, s.x, s.y, x, y) <= 2 && Intel.knows(game, pl, s.plane, s.x, s.y)) danger += 10;
      const d = World.dist(world, x, y, u.x, u.y);
      const sc = food * 3 + prod * 0.3 + gold * 2 + coast * 3 + (World.terr(world, u.plane, x, y) === T.RIVER ? 4 : 0) - d * 1.2 - danger;
      if (sc > bs) { bs = sc; best = [x, y]; }
    }
    return best;
  },

  // simule un combat sur des copies des unités ; renvoie le taux de victoire de l'attaquant
  simulate(game, attackers, defenders, info, n) {
    game.simId = game.simId || 0;
    const clone = u => Object.assign(JSON.parse(JSON.stringify(u)), { id: -(++game.simId) });
    let wins = 0;
    for (let i = 0; i < (n || 2); i++) {
      const A = attackers.map(clone), D = defenders.map(clone);
      const b = new Battle(game, { attackers: A, defenders: D, attackerPid: A[0].owner, defenderPid: D.length ? D[0].owner : (info.city ? info.city.owner : -1), plane: info.plane, x: info.x, y: info.y, city: info.city || null, site: info.site || null, sim: true });
      CombatAI.autoResolve(b);
      for (const bu of b.units) if (bu.temp) delete game.units[bu.u.id];
      if (b.winner === ATT_SIDE) wins++;
    }
    return wins / (n || 2);
  },
  defendersAt(game, pid, plane, x, y) {
    const units = Units.at(game, plane, x, y).filter(u => u.owner !== pid);
    if (units.length) return units;
    const si = World.get(game.world, plane, 'site', x, y);
    if (si >= 0 && Game.siteHasGuardians(game.sites[si])) {
      return game.sites[si].guardians.map(t => ({ id: 0, type: t, owner: -1, plane, x, y, dmg: 0, xp: 0, moves: 0, ench: [], weapon: 0, undead: false, summoned: true }));
    }
    return [];
  },
  // une case libre à côté de la cible, d'où l'on verra ce qu'elle cache
  stagingTile(game, pl, u0, tx, ty) {
    const w = game.world;
    const grp = Units.at(game, u0.plane, u0.x, u0.y).filter(u => u.owner === pl.id), gi = Move.groupInfo(game, grp);
    const opts = World.neighbors(w, tx, ty).filter(([x, y]) => !World.isWater(World.terr(w, u0.plane, x, y)) && !Cities.at(game, u0.plane, x, y) && World.get(w, u0.plane, 'site', x, y) < 0
      && Move.canStand(game, grp, gi, u0.plane, x, y, pl.id) && !AI.badTarget(game, pl, u0.plane, x, y)
      && !(Intel.sees(game, pl, u0.plane, x, y) && Move.hostileAt(game, pl.id, u0.plane, x, y)));
    return U.min(opts, ([x, y]) => World.dist(w, x, y, u0.x, u0.y));
  },
  // cibles hors d'atteinte (aucun chemin, ou l'armée n'a pas bougé d'un pas) : écartées quinze tours
  badTarget(game, pl, p, x, y) { const t = pl.aiBadTargets && pl.aiBadTargets[p + ',' + x + ',' + y]; return t != null && game.turn - t < 15; },
  markBadTarget(game, pl, p, x, y) { pl.aiBadTargets = pl.aiBadTargets || {}; pl.aiBadTargets[p + ',' + x + ',' + y] = game.turn; for (const k in pl.aiBadTargets) if (game.turn - pl.aiBadTargets[k] >= 15) delete pl.aiBadTargets[k]; },
  defSig(units) { return units.map(u => u.type + (u.dmg > 0 ? '*' : '')).sort().join(','); },
  // Normale et au-delà : une cité qui garde un fragment du Livre de légende (ou le Livre) vaut davantage ; plus encore en Difficile
  bookLure(game, pl, c) {
    const b = game.book; if (!b || b.claimed && b.city !== c.id || !AI.feat(pl, 'book', 1)) return 1;
    const n = b.frags.filter(f => f.city === c.id).length, L = AI.lvl(pl);
    return 1 + n * (L >= 2 ? 0.8 : 0.4) + (b.city === c.id ? (L >= 2 ? 2 : 1) : 0);
  },
  // Difficile et Hardcore : trois fragments en main, l'IA déduit des énigmes lues les cases possibles et, quand il en reste peu
  // (12 en Difficile, 24 en Hardcore), envoie une unité rapide les fouiller une à une. La case trouvée et ses gardiens dressés,
  // elle prépare l'assaut comme celui d'une légende : simulation tous les 3 tours avec ses meilleures troupes libres (ses cités
  // lèvent davantage de soldats en attendant), rassemblement à côté, assaut si la simulation le confirme.
  bookPlan(game, pl) {
    const b = game.book;
    if (!b || b.claimed || Book.held(game, pl.id) < Book.NEED) { if (pl.aiBook) pl.aiBook.phase = 'idle'; return null; }
    const st = pl.aiBook = pl.aiBook || { seen: [], members: [], phase: 'idle' };
    const key = t => t.p + ',' + t.x + ',' + t.y;
    let vault = b.revealedBy === pl.id || b.sealSeen[pl.id];
    if (!vault && st.turn !== game.turn) {
      let c = Book.candidates(game, pl.id).filter(t => !st.seen.includes(key(t)));
      // des gardiens dressés sur une case possible : c'est elle
      if (b.revealed && c.some(t => Book.isVault(game, t.p, t.x, t.y)) && Intel.sees(game, pl, b.plane, b.x, b.y)) vault = st.known = true;
      // fouille seulement s'il reste peu de cases (nuit 6 : la fouille élargie à 40 / 80 cases coûtait 114 ± 78 points en 250 tours,
      // 10 parties pires contre 2 meilleures, sans un seul Livre pris de plus : les gardiens restent hors de portée)
      const cap = AI.tune(pl, 'bookCands') != null ? AI.tune(pl, 'bookCands') : AI.lvl(pl) >= 3 ? 24 : 12;
      st.cands = c.length <= cap ? c : null; st.turn = game.turn;
    }
    if (vault || st.known) {
      if (st.phase === 'idle' || st.phase === 'search') st.phase = Book.guards(game).length ? 'build' : 'search';
      if (!Book.guards(game).length) st.phase = 'search';
      st.cands = [{ p: b.plane, x: b.x, y: b.y }];
    } else st.phase = st.cands && st.cands.length ? 'search' : 'idle';
    return st;
  },
  // distance d'une unité à une case, en passant au besoin par une tour de magie dégagée qu'elle connaît (Infinity : hors d'atteinte)
  bookDist(game, pl, u, plane, x, y) {
    const w = game.world;
    if (u.plane === plane) return World.dist(w, u.x, u.y, x, y);
    if (AI.sealed(game)) return Infinity;
    const ts = game.sites.filter(s => s.type === 'tower' && s.cleared && s.plane === u.plane && Intel.knows(game, pl, s.plane, s.x, s.y));
    return ts.length ? Math.min(...ts.map(s => World.dist(w, s.x, s.y, u.x, u.y) + World.dist(w, s.x, s.y, x, y) + 2)) : Infinity;
  },
  async bookStep(game, pl, ids, plane, x, y, opts) {
    const u0 = game.units[ids[0]]; if (!u0) return null;
    if (u0.plane === plane) return Game.moveGroup(game, ids, x, y, opts);
    const w = game.world;
    const t = U.min(game.sites.filter(s => s.type === 'tower' && s.cleared && s.plane === u0.plane && Intel.knows(game, pl, s.plane, s.x, s.y) && !Move.hostileAt(game, pl.id, s.plane, s.x, s.y)),
      s => World.dist(w, s.x, s.y, u0.x, u0.y) + World.dist(w, s.x, s.y, x, y));
    if (!t || AI.sealed(game)) return { ok: false, moved: 0 };
    if (u0.x !== t.x || u0.y !== t.y) { const mv = await Game.moveGroup(game, ids, t.x, t.y, { noAttack: true }); if (!game.units[u0.id] || u0.x !== t.x || u0.y !== t.y) return mv; }
    const r = u0.moves > 0 ? Game.planeShift(game, ids) : { ok: false };
    return { ok: true, moved: r.ok ? 1 : 0 };
  },
  bookDrop(st, game, cool) { st.phase = 'idle'; st.members = []; st.pause = game.turn + cool; },
  async bookUnits(game, pl, busy) {
    const out = new Set(), st = AI.bookPlan(game, pl);
    if (!st || st.phase === 'idle' || (st.pause && game.turn < st.pause)) { if (st) st.members = []; return out; }
    const b = game.book, world = game.world, key = t => t.p + ',' + t.x + ',' + t.y;
    const free = u => u.owner === pl.id && !busy.has(u.id) && u.aiRole !== 'garrison' && u.aiEscort == null && u.riteEscort == null && u.status !== 'governor' && !u.riteDemon && u.nodeBound == null && !u.stasis && !DATA.units[u.type].sailing && !Units.isSettler(u) && !Units.isEngineer(u) && !Units.has(game, u, 'meld');
    if (st.phase === 'search') {
      // l'éclaireur du Livre : un éclaireur s'il y en a un, sinon la plus rapide des unités libres les moins précieuses
      const near = v => Math.min(...st.cands.map(t => AI.bookDist(game, pl, v, t.p, t.x, t.y)));
      let u = game.units[st.searcher];
      if (!u || !free(u) || near(u) === Infinity) {
        const pool = Object.values(game.units).filter(v => free(v) && !v.hero && Units.maxMoves(game, v) > 0 && near(v) < Infinity);
        u = U.max(pool, v => (Units.isScout(v) ? 1000 : 0) + Units.maxMoves(game, v) * 10 - Units.strength(game, v) / 50 - near(v) / 4);
        st.searcher = u ? u.id : null;
      }
      if (!u) return out;
      out.add(u.id); st.members = [u.id];
      if (u.moves <= 0) return out;
      const t = U.min(st.cands, t => AI.bookDist(game, pl, u, t.p, t.x, t.y));
      const mv = await AI.bookStep(game, pl, [u.id], t.p, t.x, t.y, { noAttack: true });
      const there = game.units[u.id] && u.plane === t.p && u.x === t.x && u.y === t.y;
      if ((there || (mv && !mv.ok && !mv.moved)) && !Book.isVault(game, t.p, t.x, t.y)) st.seen.push(key(t));
      return out;
    }
    // la case est connue, ses gardiens dressés
    const guards = Book.guards(game), info = { plane: b.plane, x: b.x, y: b.y, city: null, site: null };
    const need = AI.feat(pl, 'bold', 3) ? 0.55 : 0.6;
    if (st.phase === 'build') {
      st.members = [];
      // une forteresse menacée passe avant le Livre (une cité menacée quelque part, il y en a presque toujours une en fin de partie)
      const fort = game.cities[pl.fortress];
      if (game.turn - (st.check || -99) < 3 || (AI.tune(pl, 'bookThreatAll') ? Cities.ofPlayer(game, pl.id).some(c => AI.threatNear(game, pl, c) > 0) : fort && AI.threatNear(game, pl, fort) > 0)) return out;
      const pool = Object.values(game.units).filter(u => free(u) && (AI.isSoldier(game, u) || u.hero) && AI.bookDist(game, pl, u, b.plane, b.x, b.y) <= 30);
      const force = pool.sort((a, c) => Units.strength(game, c) - Units.strength(game, a)).slice(0, MAX_STACK);
      st.check = game.turn;
      // à portée (la moitié de la force des gardiens) : les cités lèvent davantage de soldats
      st.reach = U.sum(force, u => Units.strength(game, u)) / Book.guardEstimate(game);
      if (force.length < 3 || st.reach < 0.5) return out;
      st.win = AI.simulate(game, force, guards, info, 6);
      if (st.win < need) return out;
      Object.assign(st, { phase: 'gather', members: force.map(u => u.id), gatherSince: game.turn, at: null });
    }
    const members = st.members.map(id => game.units[id]).filter(u => u && u.owner === pl.id);
    const fort = game.cities[pl.fortress];
    if (!members.length || game.turn - st.gatherSince > 15 || (fort && AI.threatNear(game, pl, fort) > 0)) { AI.bookDrop(st, game, 20); return out; }
    // le rassemblement : à côté de la case (par une tour de magie si l'armée est sur l'autre plan)
    let g = st.at;
    const ref = members.find(u => u.plane === b.plane);
    if (ref && (!g || Move.hostileAt(game, pl.id, b.plane, g[0], g[1]))) g = st.at = AI.stagingTile(game, pl, ref, b.x, b.y);
    for (const u of members) {
      if (!game.units[u.id] || u.moves <= 0) continue;
      if (u.plane !== b.plane) { await AI.bookStep(game, pl, [u.id], b.plane, b.x, b.y, { noAttack: true }); continue; }
      if (g && (u.x !== g[0] || u.y !== g[1])) await Game.moveGroup(game, [u.id], g[0], g[1], { noAttack: true });
    }
    if (!g) { for (const u of members) out.add(u.id); return out; }
    const here = members.filter(u => game.units[u.id] && u.plane === b.plane && u.x === g[0] && u.y === g[1]);
    if (here.length === members.filter(u => game.units[u.id]).length && here.every(u => u.moves > 0)) {
      const win = AI.simulate(game, here, guards, info, 6);
      if (win >= need) { st.phase = 'assault'; await Game.moveGroup(game, here.map(u => u.id), b.x, b.y); }
      else if (win < need - 0.25) { AI.bookDrop(st, game, 10); return out; }
    }
    for (const u of members) out.add(u.id);
    return out;
  },
  // Hardcore : le Démon légendaire de son pacte. Blessé, il se refait dans la cité la plus proche ; sinon il frappe la plus proche
  // des cités ou armées de la cible que la simulation lui donne gagnante, ou s'approche de la plus proche
  // ---------- le Démon légendaire et son escorte ----------
  // (0.31.23, réglage escort du pacte, à l'essai au banc) une pile de 9 au plus : le démon et 8 escortes
  RITE_ESC: 8,
  // une troupe qui peut l'escorter sans le ralentir : volante et d'au moins 3 cases (réglage 3), sinon d'au moins 2 cases (réglage 2, faute de mieux)
  escortFits(game, u, need) { const s = Units.stats(game, u); return need >= 3 ? s.flying && s.move >= 3 : s.move >= 2; },
  escortTypeFits(t, need) { const d = DATA.units[t]; return !!d && !d.sailing && !d.abilities.createOutpost && !d.abilities.construction && !d.abilities.siegeOnly && !d.abilities.scout && (d.melee >= 2 || d.ranged >= 2) && (need >= 3 ? !!d.flying && d.move >= 3 : d.move >= 2); },
  // le palier, fixé à la première décision : 3 si le maître a des volants rapides ou peut en bâtir, sinon 2 si le réglage l'admet, sinon rien
  escortNeed(game, pl, r) {
    const mode = Rite.cfg(game, 'escort'); if (!mode) return 0;
    if (r.escNeed != null) return r.escNeed;
    const d = game.units[r.demon]; if (!d) return 0;
    const fast = Object.values(game.units).some(u => u.owner === pl.id && !u.riteDemon && !u.hero && AI.isSoldier(game, u) && AI.escortFits(game, u, 3))
      || Cities.ofPlayer(game, pl.id).some(c => Cities.buildableUnits(game, c).some(t => AI.escortTypeFits(t, 3)));
    return (r.escNeed = fast ? 3 : mode >= 3 ? 0 : 2);
  },
  // les trois cités du maître les plus proches du démon, sur son plan
  escortCities(game, pl, d) { return Cities.ofPlayer(game, pl.id).filter(c => c.plane === d.plane && World.dist(game.world, c.x, c.y, d.x, d.y) <= 20).sort((a, b) => World.dist(game.world, a.x, a.y, d.x, d.y) - World.dist(game.world, b.x, b.y, d.x, d.y)).slice(0, 3); },
  riteEscortBuild(game, pl, c, units, e, threat) {
    const r = game.rite; if (!r || r.phase !== 'demon' || r.owner !== pl.id || !Rite.cfg(game, 'escort')) return null;
    const d = game.units[r.demon]; if (!d || d.plane !== c.plane || threat > 0) return null;
    const need = AI.escortNeed(game, pl, r); if (!need) return null;
    if (!AI.escortCities(game, pl, d).includes(c)) return null;
    const fits = x => x.aiRiteEsc === d.id && x.prod && x.prod.type === 'unit' && AI.escortTypeFits(x.prod.id, need);
    const have = Object.values(game.units).filter(u => u.riteEscort === d.id).length + Cities.ofPlayer(game, pl.id).filter(x => x !== c && fits(x)).length;
    if (have >= AI.RITE_ESC) return null;
    const best = U.max(units.filter(t => AI.escortTypeFits(t, need)), t => AI.unitValue(game, c, t, e, 'attack'));
    if (best) c.aiRiteEsc = d.id;
    return best || null;
  },
  // les troupes libres du maître qui peuvent rejoindre l'escorte (pas les héros, ni ce qui garde, escorte un colon ou part en expédition)
  escortFree(game, pl, d, need) {
    const busy = new Set([].concat(...['aiLegend', 'aiPortal', 'aiTrip', 'aiBook'].map(k => pl[k] && pl[k].members ? pl[k].members : [])));
    return Object.values(game.units).filter(u => u.owner === pl.id && !u.riteDemon && u.riteEscort == null && !u.hero && !u.avatar && u.plane === d.plane && !busy.has(u.id)
      && u.aiRole !== 'garrison' && u.aiEscort == null && u.status !== 'governor' && u.nodeBound == null && !u.stasis && AI.isSoldier(game, u)
      && !DATA.units[u.type].abilities.siegeOnly && AI.escortFits(game, u, need) && World.dist(game.world, u.x, u.y, d.x, d.y) <= 15);
  },
  // au début du tour (avant les garnisons) : l'escorte se complète avec les troupes libres, et les cités proches en bâtissent
  riteEscortClaim(game, pl) {
    const r = Rite.active(game);
    if (!r || r.phase !== 'demon' || r.owner !== pl.id || !Rite.cfg(game, 'escort')) return;
    const d = game.units[r.demon]; if (!d) return;
    const need = AI.escortNeed(game, pl, r); if (!need) return;
    const mine = () => Object.values(game.units).filter(u => u.riteEscort === d.id && u.owner === pl.id);
    for (const u of mine()) if (u.plane !== d.plane || !AI.escortFits(game, u, need)) delete u.riteEscort;
    const esc = mine();
    if (esc.length < AI.RITE_ESC) for (const u of AI.escortFree(game, pl, d, need).sort((a, b) => Units.strength(game, b) - Units.strength(game, a))) { if (esc.length >= AI.RITE_ESC) break; u.riteEscort = d.id; delete u.aiRole; delete u.aiPost; u.path = null; esc.push(u); }
    if (esc.length < AI.RITE_ESC) for (const c of AI.escortCities(game, pl, d)) if (c.aiRiteEsc !== d.id) c.aiReconsider = true;
  },
  async riteDemonTurn(game, pl) {
    const r = Rite.active(game);
    if (!r || r.phase !== 'demon' || r.owner !== pl.id || pl.diplo[r.target] !== 'war') return;
    const d = game.units[r.demon]; if (!d) return;
    const world = game.world;
    const need = AI.escortNeed(game, pl, r);
    const mine = () => Object.values(game.units).filter(u => u.riteEscort === d.id && u.owner === pl.id);
    AI.riteEscortClaim(game, pl);
    const onTile = () => Units.at(game, d.plane, d.x, d.y).filter(u => u.riteEscort === d.id);
    // (à 3 cases, une escorte qui a déjà marché ce tour reste en arrière plutôt que de le freiner ; à 2, il règle son pas sur elle)
    const group = () => [d].concat(onTile().filter(u => need >= 3 ? u.moves >= d.moves : u.moves > 0));
    // l'escorte qui n'est pas encore sur sa case le rejoint (par petits groupes, ceux qui sont ensemble marchent ensemble)
    const chase = async () => {
      if (!need || !game.units[d.id]) return;
      const away = mine().filter(u => u.moves > 0 && (u.plane !== d.plane || u.x !== d.x || u.y !== d.y));
      for (const g of Object.values(U.groupBy(away, u => u.plane + ',' + u.x + ',' + u.y))) await Game.moveGroup(game, g.map(u => u.id), d.x, d.y, { noAttack: true });
      r.maxEsc = Math.max(r.maxEsc || 0, onTile().length);
    };
    const go = async (x, y, opts) => { const ids = group().map(u => u.id); return Game.moveGroup(game, ids, x, y, opts); };
    if (d.moves <= 0) return chase();
    // le rassemblement : après l'invocation, il attend quelques tours que son escorte le rejoigne (tant qu'il en vient)
    if (need && game.turn - r.summoned <= Rite.cfg(game, 'muster') && onTile().length < AI.RITE_ESC) {
      const coming = mine().length > onTile().length || Cities.ofPlayer(game, pl.id).some(c => c.aiRiteEsc === d.id && c.prod && c.prod.type === 'unit');
      if (coming) return chase();
    }
    if (d.dmg > Units.stats(game, d).maxHp * 0.55) {
      const home = U.min(Cities.ofPlayer(game, pl.id).filter(c => c.plane === d.plane), c => World.dist(world, c.x, c.y, d.x, d.y));
      if (home && (home.x !== d.x || home.y !== d.y)) await go(home.x, home.y, { noAttack: true });
      return chase();
    }
    const cands = [];
    for (const c of Intel.knownCities(game, pl)) if (c.owner === r.target && c.plane === d.plane) cands.push({ x: c.x, y: c.y, city: c });
    for (const u of Object.values(game.units)) if (u.owner === r.target && u.plane === d.plane && !Cities.at(game, u.plane, u.x, u.y) && Intel.sees(game, pl, u.plane, u.x, u.y) && !Intel.hiddenFrom(game, pl.id, u) && !cands.some(c => c.x === u.x && c.y === u.y)) cands.push({ x: u.x, y: u.y });
    if (!cands.length) return chase();
    for (const c of cands) c.d = World.dist(world, c.x, c.y, d.x, d.y);
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, 4)) {
      if (AI.badTarget(game, pl, d.plane, c.x, c.y)) continue;
      const info = Intel.defenders(game, pl, d.plane, c.x, c.y);
      const defs = info ? info.units : [];
      const si = World.get(world, d.plane, 'site', c.x, c.y);
      const win = !defs.length && !(c.city && Battle.spire(game, c.city)) ? 1 : AI.simulate(game, group(), defs, { plane: d.plane, x: c.x, y: c.y, city: c.city || null, site: si >= 0 ? game.sites[si] : null }, 2);
      if (win >= 0.5) {
        const mv = await go(c.x, c.y, {});
        if (mv && !mv.ok && game.units[d.id] && d.moves > 0) { AI.markBadTarget(game, pl, d.plane, c.x, c.y); continue; }
        const took = c.city && Cities.at(game, d.plane, c.x, c.y);
        if (took && took.owner === pl.id) r.caps = (r.caps || 0) + 1;
        return chase();
      }
    }
    const c = cands[0], st = AI.stagingTile(game, pl, d, c.x, c.y);
    if (st && (st[0] !== d.x || st[1] !== d.y)) await go(st[0], st[1], { noAttack: true });
    return chase();
  },
  // group : les unités qui partiraient vraiment (on simule le combat avec elles seules)
  pickTarget(game, pl, u0, power, minWin = 0, group) {
    const world = game.world;
    const units = group || Units.at(game, u0.plane, u0.x, u0.y).filter(u => u.owner === pl.id && u.moves > 0 && u.aiRole !== 'garrison' && !Units.isSettler(u) && !Units.isEngineer(u));
    const cands = [];
    const plan = AI.plan(pl);
    const consider = (x, y, defense, value, kind, extra, maxD) => {
      const d = World.dist(world, x, y, u0.x, u0.y);
      if (d > (maxD || AI.tune(pl, 'reach')) || d === 0 || AI.badTarget(game, pl, u0.plane, x, y)) return;
      const ratio = power / Math.max(1, defense);
      if (ratio < 0.25) return;
      cands.push(Object.assign({ x, y, kind, d, value, ratio, sc: value / (d + 3) * Math.min(2, ratio) }, extra || {}));
    };
    // quêtes des héros de la pile : leur cible vaut davantage
    const quests = units.filter(u => u.hero && u.hero.quest && !u.hero.quest.done).map(u => u.hero.quest);
    // la légende d'un héros ne compte que lorsque son emplacement est connu
    const questSite = new Set(quests.filter(q => q.site != null && q.stage >= 3).map(q => q.site));
    for (const s of game.sites) {
      if (s.plane !== u0.plane || !Game.siteHasGuardians(s) || !Intel.knows(game, pl, s.plane, s.x, s.y)) continue;
      const def = U.sum(s.guardians, t => Units.strength(game, { type: t, ench: [], xp: 0, owner: -1, dmg: 0 }));
      // Difficile et Hardcore : les tours de magie, portes de l'autre plan, valent le double
      const portal = s.type === 'tower' && AI.feat(pl, 'planes', 2) ? 2 : 1;
      // un nœud gardé : une fois vidé, un esprit le lie et il rapporte chaque tour ; il vaut d'autant plus qu'il est puissant
      const node = s.type === 'node' && AI.feat(pl, 'nodes', 1) ? (1.5 + (s.power || 0) / 10) * AI.tune(pl, 'nodeValue') : 1;
      consider(s.x, s.y, def, (40 + s.budget / 8) * (questSite.has(s.id) ? 2.5 : 1) * (s.type === 'breach' ? 1.6 : 1) * portal * node * AI.tune(pl, 'lairValue'), 'lair');
    }
    // cités connues : leurs défenseurs tels qu'on les voit, ou tels que le dernier rapport les décrivait
    for (const c of Intel.knownCities(game, pl)) {
      if (c.owner === pl.id || c.plane !== u0.plane) continue;
      if (c.owner >= 0 && (pl.diplo[c.owner] === 'peace' || pl.diplo[c.owner] === 'alliance')) continue;
      if (c.owner >= 0 && pl.diplo[c.owner] !== 'war' && !(pl.aiPersonality === 'maniac' || pl.aiPersonality === 'militarist') && game.turn < 80) continue;
      const info = Intel.defenders(game, pl, c.plane, c.x, c.y);
      const stale = !info || info.age > (c.owner < 0 ? 40 : 8);   // la garnison d'une cité neutre ne bouge guère
      // sans rapport : une garnison supposée d'après la taille visible de la cité
      const def = (stale ? (1 + Math.floor(Cities.citizens(c) / 4)) * 45 : U.sum(info.units, u => Units.strength(game, u))) * (c.buildings.cityWalls ? 1.5 : 1) + Battle.towerStrength(game, c) + 5;
      // reprendre sa forteresse avant qu'elle soit démantelée : priorité absolue
      const own = pl.fallen && pl.fallen.city === c.id ? 3 : 1;
      // le Sort de Maîtrise en cours : sa forteresse est la cible de tous
      const som = c.owner >= 0 && Endgame.casting(game, c.owner) ? (c.fortress ? 5 : 1.5) : 1;
      // le plan : les cités de l'ennemi visé valent davantage, et l'on va les chercher plus loin
      const camp = plan && plan.kind === 'war' && c.owner === plan.target ? AI.tune(pl, 'campValue') : 1;
      // Hardcore : plusieurs fronts ; une cité déjà visée ce tour par une autre de nos armées en attire moins une seconde
      const front = AI.feat(pl, 'fronts', 3) && pl._fronts && pl._fronts.turn === game.turn && pl._fronts.keys.includes(c.plane + ',' + c.x + ',' + c.y) ? 0.5 : 1;
      // une cité neutre ne se défend que chez elle : on va la chercher plus loin (sinon, passé les abords de la capitale,
      // les cités libres d'un plan restent libres toute la partie)
      consider(c.x, c.y, def, (90 + c.pop / 80 + (c.fortress ? 250 : 0)) * own * som * camp * front * (c.owner < 0 ? AI.tune(pl, 'neutralValue') : 1) * AI.bookLure(game, pl, c), 'city', { stale, info }, c.owner < 0 ? (plan && plan.kind === 'defend' ? 12 : 28) : som > 1 && c.fortress ? 40 : camp > 1 ? 22 : 16);
    }
    // armées ennemies vues en ce moment
    for (const u of Object.values(game.units)) {
      if (u.owner === pl.id || u.plane !== u0.plane || u.owner < 0 && !u.rampage) continue;
      if (u.owner >= 0 && pl.diplo[u.owner] !== 'war') continue;
      if (Cities.at(game, u.plane, u.x, u.y) || u.guardian) continue;
      if (!Intel.sees(game, pl, u.plane, u.x, u.y) || Intel.hiddenFrom(game, pl.id, u)) continue;
      const stack = Units.at(game, u.plane, u.x, u.y).filter(o => !Intel.hiddenFrom(game, pl.id, o));
      // Hardcore : colons et ingénieurs sans escorte sont des proies de choix
      const civ = AI.feat(pl, 'prey', 3) ? stack.filter(o => Units.isSettler(o) || Units.isEngineer(o)).length : 0;
      // Hardcore : un héros peu escorté est une proie (ses objets, son expérience, et la peine de son maître)
      const lone = AI.feat(pl, 'predator', 3) && stack.length <= 3 && stack.some(o => o.hero && !o.avatar) ? 70 : 0;
      consider(u.x, u.y, U.sum(stack, s => Units.strength(game, s)), 35 + civ * 60 + lone, 'army');
    }
    cands.sort((a, b) => b.sc - a.sc);
    pl._sim = pl._sim || {};
    const sig = units.map(u => u.type + (u.dmg > 0 ? '*' : '')).sort().join(',');
    // les meilleures cibles, plus toujours les deux meilleurs repaires (sinon les cités les éclipsent)
    const pick = cands.slice(0, 3);
    for (const c of cands.filter(c => c.kind === 'lair').slice(0, 2)) if (!pick.includes(c)) pick.push(c);
    for (const c of pick) {
      // forces inconnues ou rapport trop vieux : s'approcher pour voir, si la cible n'est pas loin
      // forteresse volante (des volants seulement) ou garde magique contre nos créatures : cible hors de portée
      const cc = c.kind === 'city' ? Cities.at(game, u0.plane, c.x, c.y) : null;
      if (cc && Cities.hasEnch(cc, 'flying_fortress') && !units.every(u => Units.stats(game, u).flying)) continue;
      if (cc && cc.ench.some(e => e.spell === 'spell_ward' && e.realm && units.some(u => Units.isFantastic(u) && Units.realmOf(u) === e.realm))) continue;
      if (c.kind === 'city' && c.stale) { if (c.d <= 6) { const st = AI.stagingTile(game, pl, u0, c.x, c.y); if (st) return Object.assign({}, c, { kind: 'probe', x: st[0], y: st[1], tx: c.x, ty: c.y }); } continue; }
      const info = c.info || Intel.defenders(game, pl, u0.plane, c.x, c.y);
      const defs = info ? info.units : [];
      // cité vide : prise directe, sauf la forteresse d'un sorcier, que sa tour défend (on simule alors le combat)
      const cty = c.kind === 'city' ? Cities.at(game, u0.plane, c.x, c.y) : null;
      if (!defs.length && !(cty && Battle.spire(game, cty))) { if (c.kind === 'city') return c; continue; }
      const key = sig + '@' + u0.plane + ',' + c.x + ',' + c.y + '|' + AI.defSig(defs);
      let cached = pl._sim[key];
      if (!cached || game.turn - cached.turn > 4) {
        const si = World.get(world, u0.plane, 'site', c.x, c.y);
        const win = AI.simulate(game, units, defs, { plane: u0.plane, x: c.x, y: c.y, city: Cities.at(game, u0.plane, c.x, c.y), site: si >= 0 ? game.sites[si] : null }, 3)   // (Hardcore à cinq simulations : mesuré sans gain, v0.26.5);
        cached = pl._sim[key] = { turn: game.turn, win };
      }
      const aw = AI.tune(pl, 'attackWin');
      const need = Math.max(minWin, c.kind === 'lair' ? AI.tune(pl, 'lairWin') : aw != null ? aw : AI.feat(pl, 'bold', 3) ? 0.55 : 0.6);
      if (cached.win >= need) return c;
    }
    // nettoyage du cache
    if (Object.keys(pl._sim).length > 300) pl._sim = {};
    return null;
  },
};

// ---------- diplomatie ----------
const Diplomacy = {
  stateName(s) { return { none: 'Aucun traité', peace: 'Pacte de paix', alliance: 'Alliance', war: 'Guerre' }[s || 'none']; },
  // l'opinion de a sur b varie de n (pour la raison reason) ; celle de b sur a suit à moitié
  adjust(game, a, b, n, reason) {
    const pa = game.players[a], pb = game.players[b]; if (!pa || !pb) return;
    // Charismatique : ce qu'on fait d'aimable envers lui compte double
    const charm = p => n > 0 && p.retorts && p.retorts.includes('charismatic') ? 2 : 1;
    const ra = pa.relations[b] || 0, rb = pb.relations[a] || 0;
    pa.relations[b] = U.clamp(ra + n * charm(pb), -100, 100);
    pb.relations[a] = U.clamp(rb + Math.round(n * 0.5) * charm(pa), -100, 100);
    if (Diplomacy.why) {
      if (reason) Diplomacy.why(game, a, b, reason, pa.relations[b] - ra);
      const m = pb.relations[a] - rb; if (reason) Diplomacy.why(game, b, a, m < 0 ? 'mutual_neg' : 'mutual_pos', m);
    }
  },
  onAttack(game, a, b) {
    const pa = game.players[a], pb = game.players[b]; if (!pa || !pb) return;
    const st = pa.diplo[b] || 'none';
    if (st === 'peace' || st === 'alliance') {
      Game.log(game, b, pa.name + ' a rompu son traité et vous attaque !', { player: a });
      for (const o of game.players) if (o !== pa && o !== pb && o.alive) Diplomacy.adjust(game, o.id, a, -10, 'betrayal');
      Diplomacy.adjust(game, b, a, -40, 'treaty_broken');
    } else Diplomacy.adjust(game, b, a, -15, 'attacked');
    if (st !== 'war') { if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'diplo', { a, b, st: 'war', from: st, broke: st === 'peace' || st === 'alliance' }); pa.diplo[b] = 'war'; pb.diplo[a] = 'war'; if (pa.closedTo) delete pa.closedTo[b]; if (pb.closedTo) delete pb.closedTo[a]; Game.log(game, a, 'Vous êtes en guerre contre ' + pb.name + '.', { player: b }); Game.log(game, b, pa.name + ' vous déclare la guerre.', { player: a }); }
  },
  setState(game, a, b, st) {
    const pa = game.players[a], pb = game.players[b];
    if (typeof Chronicle !== 'undefined' && (pa.diplo[b] || 'none') !== st) Chronicle.note(game, 'diplo', { a, b, st, from: pa.diplo[b] || 'none' });
    if (pa.diplo[b] === 'war' && st !== 'war' && Diplomacy.endWar) Diplomacy.endWar(game, a, b);
    if (st === 'war' && pa.diplo[b] !== 'war' && Diplomacy.warRec) { Diplomacy.warRec(pa, b, game); Diplomacy.warRec(pb, a, game); }
    if (st !== 'peace' && st !== 'alliance') { if (pa.denounced) delete pa.denounced[b]; if (pb.denounced) delete pb.denounced[a]; }
    pa.diplo[b] = st; pb.diplo[a] = st;
    if (st === 'war') { if (pa.closedTo) delete pa.closedTo[b]; if (pb.closedTo) delete pb.closedTo[a]; }   // la guerre efface les frontières fermées
  },
  // fermer (ou rouvrir) son territoire à un sorcier en paix : ses troupes, éclaireurs compris, n'y entrent plus ;
  // celles qui s'y trouvent sont reconduites à la frontière
  closeBorders(game, a, b, closed) {
    const pa = game.players[a], pb = game.players[b]; if (!pa || !pb) return { ok: false };
    if (closed && !['peace', 'alliance'].includes(pa.diplo[b])) return { ok: false, why: 'Seulement avec un sorcier en paix ou allié.' };
    pa.closedTo = pa.closedTo || {};
    if (!closed) { delete pa.closedTo[b]; Game.log(game, b, U.cap(Players.nameFor(game, b, a)) + ' rouvre son territoire à vos troupes.', { player: a }); return { ok: true, moved: 0 }; }
    pa.closedTo[b] = true;
    Diplomacy.adjust(game, b, a, -5, 'borders_closed');
    const moved = Diplomacy.escort(game, a, b);
    Game.log(game, b, U.cap(Players.nameFor(game, b, a)) + ' vous interdit son territoire' + (moved ? ' : ' + U.n(moved, 'unité est reconduite', 'unités sont reconduites') + ' à la frontière.' : '.'), { player: a });
    return { ok: true, moved };
  },
  // les troupes de b sur le territoire de a, qui le lui interdit, reconduites chacune à la case libre la plus proche hors de ce territoire
  // (à la fermeture des frontières, et quand le territoire s'étend sous leurs pieds : cité prise, fondée ou qui grandit)
  escort(game, a, b) {
    const w = game.world, stacks = U.groupBy(Object.values(game.units).filter(u => u.owner === b && World.get(w, u.plane, 'owner', u.x, u.y) === a && !Cities.at(game, u.plane, u.x, u.y)), u => u.plane + ',' + u.x + ',' + u.y);
    let moved = 0;
    for (const k in stacks) {
      const units = stacks[k], u0 = units[0], gi = Move.groupInfo(game, units);
      // la case la plus proche hors du territoire où la pile peut se tenir
      const seen = new Set([u0.x + ',' + u0.y]), q = [[u0.x, u0.y, 0]]; let spot = null;
      while (q.length && !spot) {
        const [x, y, d] = q.shift(); if (d > 24) break;
        for (const [nx, ny] of World.neighbors(w, x, y)) {
          const key = nx + ',' + ny; if (seen.has(key)) continue; seen.add(key);
          q.push([nx, ny, d + 1]);
          if (World.get(w, u0.plane, 'owner', nx, ny) === a) continue;
          const others = Units.at(game, u0.plane, nx, ny);
          if (others.some(o => o.owner !== b) || others.length + units.length > MAX_STACK) continue;
          const c = Cities.at(game, u0.plane, nx, ny); if (c && c.owner !== b) continue;
          const si = World.get(w, u0.plane, 'site', nx, ny); if (si >= 0 && Game.siteHasGuardians(game.sites[si])) continue;
          if (Move.canStand(game, units, gi, u0.plane, nx, ny, b)) { spot = [nx, ny]; break; }
        }
      }
      if (!spot) continue;
      for (const u of units) { u.x = spot[0]; u.y = spot[1]; u.path = null; u.dest = null; u.attackOrder = false; if (['goto', 'explore', 'roadto'].includes(u.status)) u.status = ''; }
      moved += units.length;
    }
    return moved;
  },
  // le territoire a bougé : toutes les frontières fermées sont de nouveau respectées, et chacun en est averti
  escortAll(game) {
    for (const pa of game.players) {
      if (!pa || !pa.alive || !pa.closedTo) continue;
      for (const k in pa.closedTo) {
        const b = +k, pb = game.players[b];
        if (!pa.closedTo[k] || !pb || !pb.alive || !['peace', 'alliance'].includes(pa.diplo[b])) continue;
        const n = Diplomacy.escort(game, pa.id, b); if (!n) continue;
        Game.log(game, b, U.cap(Players.nameFor(game, b, pa.id)) + ' étend son territoire, qu\'il vous interdit : ' + U.n(n, 'unité est reconduite', 'unités sont reconduites') + ' à la frontière.', { player: pa.id });
        Game.log(game, pa.id, U.n(n, 'unité', 'unités') + ' ' + U.de(Players.nameFor(game, pa.id, b)) + (n > 1 ? ' se trouvaient' : ' se trouvait') + ' sur votre territoire, qui lui est interdit : ' + (n > 1 ? 'elles sont reconduites' : 'elle est reconduite') + ' à la frontière.', { player: b, minor: !pa.human });
      }
    }
  },
  // déclaration de guerre : rompre un traité coûte cher auprès de la victime et de tous les autres sorciers
  declareWar(game, a, b, base = -20) {
    const pa = game.players[a], pb = game.players[b]; if (!pa || !pb) return;
    const st = pa.diplo[b] || 'none';
    if (st === 'peace' || st === 'alliance') { for (const o of game.players) if (o !== pa && o !== pb && o.alive) Diplomacy.adjust(game, o.id, a, -10, 'betrayal'); Diplomacy.adjust(game, b, a, -40, 'treaty_broken'); }
    else if (st !== 'war') Diplomacy.adjust(game, b, a, base, 'declared');
    Diplomacy.setState(game, a, b, 'war');
  },
  // proposition faite à une IA : renvoie true si acceptée
  propose(game, from, to, kind, gold) {
    const pa = game.players[from], pb = game.players[to];
    if (!pa || !pb || !pb.alive) return { ok: false };
    const rel = pb.relations[from] || 0;
    const strengthA = Intel.powerOf(game, pb, pa.id), strengthB = Diplomacy.power(game, pb);
    const fear = strengthA / Math.max(1, strengthB);
    let accept = false;
    const coal = !pb.human && AI.feat(pb, 'coalition', 2) ? Diplomacy.leaderFor(game, pb) : null;
    // une guerre qui lui coûte plus qu'elle ne rapporte le rend conciliant (Normale et au-delà)
    const weary = !pb.human && AI.feat(pb, 'weariness', 1) && Diplomacy.weariness ? Diplomacy.weariness(game, pb, pa) : 0;
    if (kind === 'peace') accept = rel + fear * 10 + weary * 60 + (pb.diplo[from] === 'war' ? -10 : 10) + game.rng.int(20) + (coal && coal.id !== from && coal.id !== pb.id ? 20 * coal.t : 0) > 15 && !(coal && coal.id === from && fear < 2.5);
    if (kind === 'peace' && !pb.human && Rite.binds(game, from, to)) accept = false;   // le maître du démon ne traite pas avec la cible
    if (kind === 'alliance' && coal && coal.id !== from && coal.id !== pb.id && rel > 10 && pb.diplo[from] !== 'war') { Diplomacy.setState(game, from, to, 'alliance'); Diplomacy.adjust(game, to, from, 10, 'treaty'); return { ok: true, text: pb.name + ' accepte : faisons front ensemble contre ' + Players.nameFor(game, from, coal.id) + '.' }; }
    if (kind === 'alliance') accept = rel > 40 && pb.diplo[from] === 'peace' && game.rng.chance(0.6);
    if (kind === 'tribute') { Diplomacy.adjust(game, to, from, Math.round(gold / 10), 'gift'); pa.gold -= gold; pb.gold += gold; return { ok: true, text: pb.name + ' accepte votre présent.' }; }
    if (kind === 'war') { const broke = ['peace', 'alliance'].includes(pa.diplo[to]); Diplomacy.declareWar(game, from, to, -30); return { ok: true, text: 'La guerre est déclarée.' + (broke ? ' Rompre un traité vous coûte l\'estime de tous les sorciers.' : '') }; }
    // une proposition par tour et par sorcier : pas question de relancer le dé en insistant
    if (kind === 'peace' || kind === 'alliance') {
      const asked = (pb.aiAsked = pb.aiAsked || {});
      if (asked[from + ':' + kind] === game.turn) return { ok: false, text: pb.name + ' vous a déjà répondu ce tour-ci.' };
      asked[from + ':' + kind] = game.turn;
    }
    if (accept) { Diplomacy.setState(game, from, to, kind); Diplomacy.adjust(game, to, from, 10, 'treaty'); return { ok: true, text: pb.name + ' accepte : ' + Diplomacy.stateName(kind).toLowerCase() + '.' }; }
    Diplomacy.adjust(game, to, from, -3, 'refused');
    return { ok: false, text: pb.name + ' refuse.' };
  },
  // ce qu'un sorcier aux abois ajoute à sa demande de paix, selon le nombre de refus déjà essuyés
  sweeteners(game, a, b, refused, ratio) {
    const out = {};
    if (refused >= 1 && a.gold >= 30) out.gold = Math.max(30, Math.floor(a.gold * (refused >= 2 ? 0.5 : 0.25) / 5) * 5);
    if (refused >= 2 && ratio >= 2) {
      const mine = Cities.ofPlayer(game, a.id).filter(c => !c.fortress), his = Cities.ofPlayer(game, b.id);
      // la cité la plus proche de l'empire adverse, celle qu'il menace déjà
      const c = U.min(mine, c => U.min(his.filter(o => o.plane === c.plane).map(o => World.dist(game.world, o.x, o.y, c.x, c.y)), d => d) ?? 99);
      if (c && mine.length >= 1 && Cities.ofPlayer(game, a.id).length >= 2) out.city = c.id;
    }
    return out;
  },
  // le joueur accepte une demande de paix : traité, or et cité cédée
  acceptOffer(game, b, off) {
    const a = game.players[off.from]; if (!a) return;
    if (off.kind === 'demand') return Diplomacy.settleDemand(game, b, off, true);
    if (off.kind === 'trade') return Diplomacy.doTrade(game, b, a, off.give, off.get);   // b apprend ce que a lui donne
    Diplomacy.setState(game, b.id, a.id, off.kind); Diplomacy.adjust(game, a.id, b.id, 10, 'treaty');
    if (a.peaceAsk && a.peaceAsk[b.id]) a.peaceAsk[b.id].refused = 0;
    if (off.gold) { const g = Math.min(off.gold, a.gold); a.gold -= g; b.gold += g; }
    const c = off.city != null && game.cities[off.city];
    if (c && c.owner === a.id && !c.fortress) Game.cedeCity(game, c, b.id);
  },
  // propositions faites au joueur humain : une par sorcier (la plus récente remplace la précédente), valables jusqu'au tour suivant
  offer(game, b, off) { b.diploOffers = (b.diploOffers || []).filter(o => o.from !== off.from); b.diploOffers.push(off); },
  pendingOffers(game, b) {
    b.diploOffers = (b.diploOffers || []).filter(o => o.turn >= game.turn - 1 && game.players[o.from] && game.players[o.from].alive && (b.diplo[o.from] || 'none') !== o.kind);
    return b.diploOffers;
  },
  offerFrom(game, b, pid) { return Diplomacy.pendingOffers(game, b).find(o => o.from === pid) || null; },
  dropOffer(b, off) { b.diploOffers = (b.diploOffers || []).filter(o => o !== off); },
  refuseOffer(game, b, off) {
    const a = game.players[off.from]; if (!a) return;
    if (off.kind === 'demand') return Diplomacy.settleDemand(game, b, off, false);
    if (off.kind === 'trade') return Diplomacy.adjust(game, a.id, b.id, -2, 'refused');
    Diplomacy.adjust(game, a.id, b.id, -5, 'refused');
    if (off.kind !== 'peace') return;   // décliner une alliance n'est pas refuser la paix
    const rec = (a.peaceAsk = a.peaceAsk || {})[b.id] || { turn: game.turn, refused: 0 };
    rec.refused++; rec.turn = game.turn; a.peaceAsk[b.id] = rec;
  },
  power(game, pl) { return U.sum(Object.values(game.units).filter(u => u.owner === pl.id && !u.riteDemon), u => Units.strength(game, u)) + Cities.ofPlayer(game, pl.id).length * 50; },
  updateTurn(game) {
    Diplomacy.denounceTick(game);
    Diplomacy.expireDemands(game);
    // dès Normale : coalitions contre le meneur
    for (const a of game.players) if (a.alive && !a.human && AI.feat(a, 'coalition', 2)) Diplomacy.coalitionTurn(game, a);
    for (const a of game.players) {
      if (!a.alive) continue;
      for (const b of game.players) {
        if (a === b || !b.alive || !a.contact[b.id]) continue;
        // dérive vers la neutralité (les souvenirs s'estompent), aura de majesté, traités
        let r = a.relations[b.id] || 0;
        const drift = r > 0 ? -0.5 : r < 0 ? 0.5 : 0;
        if (drift) Diplomacy.spreadDrift(game, a, b.id, drift);
        r += drift;
        a.relations[b.id] = U.clamp(r, -100, 100);
        if (b.globals.includes('aura_of_majesty')) Diplomacy.accrue(game, a.id, b.id, 'aura', 1, 100);
        if (a.diplo[b.id] === 'peace') Diplomacy.accrue(game, a.id, b.id, 'peace', 0.5, 100);
        if (a.diplo[b.id] === 'alliance') Diplomacy.accrue(game, a.id, b.id, 'alliance', 1, 100);
        // frontières qui se touchent, voies de magie, ennemi commun
        Diplomacy.driftTurn(game, a, b);
        r = a.relations[b.id] || 0;
        if (a.human) continue;
        const coal = AI.feat(a, 'coalition', 2) ? Diplomacy.leaderFor(game, a) : null;
        const st = a.diplo[b.id] || 'none';
        // l'IA propose la paix quand elle perd ou apprécie, déclare la guerre quand elle est forte et hostile
        const myPow = Diplomacy.power(game, a), hisPow = a.human ? Diplomacy.power(game, b) : Intel.powerOf(game, a, b.id);
        const ask = (a.peaceAsk = a.peaceAsk || {})[b.id] || { turn: -99, refused: 0 };
        const vsLeader = coal && coal.id === b.id && myPow > hisPow * 0.4;
        // dès Normale : une guerre qui coûte plus qu'elle ne rapporte se termine
        const weary = AI.feat(a, 'weariness', 1) ? Diplomacy.weariness(game, a, b) : 0;
        if (st === 'war' && !vsLeader && !Rite.binds(game, a.id, b.id) && (myPow < hisPow * 0.7 || r > 10 || weary > 0.3) && game.turn - ask.turn >= (ask.refused ? 6 : 1) && game.rng.chance(ask.refused || weary > 0.3 ? 0.2 : 0.08)) {
          if (b.human) {
            // chaque refus fait monter les enchères quand la situation est désespérée : de l'or, puis une cité
            const off = Object.assign({ from: a.id, kind: 'peace', turn: game.turn }, Diplomacy.sweeteners(game, a, b, ask.refused, hisPow / Math.max(1, myPow)));
            Diplomacy.offer(game, b, off);
            a.peaceAsk[b.id] = Object.assign(ask, { turn: game.turn });
            Game.log(game, b.id, a.name + ' vous propose la paix' + (off.gold || off.city != null ? ', avec des concessions' : '') + '.', { diplo: a.id, offer: true });
          }
          else if (Diplomacy.propose(game, a.id, b.id, 'peace').ok) Game.logEach(game, v => U.cap(Players.nameFor(game, v, a.id)) + ' et ' + Players.nameFor(game, v, b.id) + ' signent la paix.');
        }
        if ((st === 'none' || st === 'peace') && game.turn > 30) {
          // Hardcore : un voisin nettement plus faible et à portée est une proie, même sans grief
          // une guerre à la fois : on ne s'en ouvre pas une autre tant qu'on se bat déjà contre un sorcier
          const busy = game.players.some(o => o.alive && o.id !== a.id && o.id !== b.id && a.diplo[o.id] === 'war');
          const prey = AI.feat(a, 'preywar', 3) && !busy && game.turn > 40 && r < 30 && myPow > hisPow * 2 && Cities.ofPlayer(game, a.id).some(m => Intel.knownCities(game, a).some(c => c.owner === b.id && c.plane === m.plane && World.dist(game.world, c.x, c.y, m.x, m.y) <= 12));
          const hostile = prey || r < -30 || (a.aiPersonality === 'maniac' && r < 10) || (a.aiPersonality === 'militarist' && r < -10);
          // dès Normale : une guerre choisie contre un voisin plus faible et à portée (sans traité à rompre)
          const L = AI.lvl(a);
          // Hardcore : la guerre dès un léger avantage, quelle que soit la personnalité
          let edge = AI.tune(a, 'warEdge') != null ? AI.tune(a, 'warEdge') : AI.feat(a, 'aggro', 3) ? 1.15 : a.aiPersonality === 'militarist' || a.aiPersonality === 'maniac' ? 1.15 : a.aiPersonality === 'perfectionist' ? 1.7 : 1.35;
          // Hardcore : frapper quand l'autre est déjà pris ailleurs (en guerre contre un tiers)
          if (AI.feat(a, 'timing', 3) && game.players.some(o => o.alive && o.id !== a.id && o.id !== b.id && b.diplo[o.id] === 'war')) edge *= 0.85;
          const reach = AI.feat(a, 'wars') && st === 'none' && !(AI.feat(a, 'onewar', 3) && busy) && game.turn > 45 && r < 25 && myPow > hisPow * edge && Cities.ofPlayer(game, a.id).some(m => Intel.knownCities(game, a).some(c => c.owner === b.id && c.plane === m.plane && World.dist(game.world, c.x, c.y, m.x, m.y) <= 14));
          if (reach && game.rng.chance(AI.tune(a, 'warChance')) && !(b.human && a.aiLevel === 'easy')) {
            Diplomacy.declareWar(game, a.id, b.id, -20);
            Game.log(game, b.id, a.name + ' vous déclare la guerre !', { diplo: a.id, alert: true });
            Game.log(game, a.id, 'Guerre déclarée à ' + b.name + '.');
          } else if (hostile && !(AI.feat(a, 'onewar', 3) && busy) && myPow > hisPow * 1.2 && game.rng.chance(st === 'peace' ? 0.02 : 0.05)) {   // Hardcore : une guerre à la fois, griefs compris (les coalitions contre le meneur restent à part)
            // un traité ne se rompt sans prévenir que chez le perfide ; les autres le dénoncent, puis attendent qu'il expire
            if (st === 'peace') { if (!(a.denounced && a.denounced[b.id] != null)) Diplomacy.breakOrDenounce(game, a, b); }
            else {
              Diplomacy.declareWar(game, a.id, b.id, -20);
              Game.log(game, b.id, a.name + ' vous déclare la guerre !', { diplo: a.id, alert: true });
              Game.log(game, a.id, 'Guerre déclarée à ' + b.name + '.');
            }
          }
        }
        // Hardcore : la paix proposée aux autres sorciers dès des relations à peine froides, et souvent (mesuré en v0.28.18 : +162 ± 14
        // points, survie de 83 à 97 %, 3 cités de plus au tour 150). Difficile : le même seuil, trois fois moins souvent (nuit 6 :
        // +54 ± 24 points sur Difficile sans paix, quand la paix de Hardcore en donne +92 : Difficile à mi-chemin de Hardcore).
        // Envers le joueur, la règle reste celle des autres niveaux.
        const pkey = !b.human && AI.feat(a, 'peace', 3), phalf = !b.human && !pkey && AI.feat(a, 'peace', 2);
        const pRel = b.human ? 15 : AI.tune(a, 'peaceRel') != null ? AI.tune(a, 'peaceRel') : pkey || phalf ? -10 : 15;
        const pChance = b.human ? 0.05 : AI.tune(a, 'peaceChance') != null ? AI.tune(a, 'peaceChance') : pkey ? 0.15 : phalf ? 0.06 : 0.05;
        if ((a.diplo[b.id] || 'none') === 'none' && r > pRel && game.rng.chance(pChance)) {   // (l'état a pu changer plus haut : pas de paix offerte juste après une déclaration de guerre)
          if (b.human) { Diplomacy.offer(game, b, { from: a.id, kind: 'peace', turn: game.turn }); Game.log(game, b.id, a.name + ' vous propose un pacte de paix.', { diplo: a.id, offer: true }); }
          else Diplomacy.propose(game, a.id, b.id, 'peace');
        }
      }
    }
    for (const a of game.players) if (a.alive && !a.human && !a.banished) { Diplomacy.demandTurn(game, a); Diplomacy.tradeTurn(game, a); }
  },
};

// ---------- en essai (AI.PENDING.spells2) : les sorts de carte que l'IA ne lançait jamais ----------
// chaque entrée rend { sc, target } ou null ; le sort doit partir ce tour-ci quand il vise des troupes (elles bougent)
Object.assign(AI, {
  wars(game, pl) { return game.players.filter(o => o.alive && o !== pl && pl.contact[o.id] && pl.diplo[o.id] === 'war'); },
  // les piles ennemies vues : force, distance à notre cité la plus proche
  seenFoeStacks(game, pl) {
    const foes = new Set(AI.wars(game, pl).map(o => o.id)), out = new Map(), mine = Cities.ofPlayer(game, pl.id);
    for (const u of Object.values(game.units)) {
      if (!foes.has(u.owner) || !Intel.sees(game, pl, u.plane, u.x, u.y) || Intel.hiddenFrom(game, pl.id, u)) continue;
      const k = u.plane + ',' + u.x + ',' + u.y; if (!out.has(k)) out.set(k, { plane: u.plane, x: u.x, y: u.y, units: [], str: 0 });
      const s = out.get(k); s.units.push(u); s.str += Units.strength(game, u);
    }
    for (const s of out.values()) { const c = U.min(mine.filter(c => c.plane === s.plane), c => World.dist(game.world, c.x, c.y, s.x, s.y)); s.dist = c ? World.dist(game.world, c.x, c.y, s.x, s.y) : 99; }
    return [...out.values()];
  },
  now(game, pl, cost) { return cost <= pl.skillLeft; },   // le sort part ce tour-ci (sinon la cible aura bougé)
  SPELLS2: {
    fire_storm(game, pl, o) { return AI.stackSpell(game, pl, 'fire_storm', o, 45); },
    ice_storm(game, pl, o) { return AI.stackSpell(game, pl, 'ice_storm', o, 45); },
    black_wind(game, pl, o) { return AI.stackSpell(game, pl, 'black_wind', o, 50); },
    stasis(game, pl, o) {
      if (!AI.now(game, pl, o.cost)) return null;
      const s = U.max(AI.seenFoeStacks(game, pl).filter(s => s.dist <= 4 && Spells.validate(game, pl, 'stasis', { plane: s.plane, x: s.x, y: s.y }).ok), s => s.str);
      return s && s.str >= 200 ? { sc: 20 + s.str / 60, target: { plane: s.plane, x: s.x, y: s.y } } : null;
    },
    disjunction(game, pl, o) { return AI.disjSpell(game, pl, 'disjunction', 1); },
    disjunction_true(game, pl, o) { return AI.disjSpell(game, pl, 'disjunction_true', 3); },
    spell_binding(game, pl, o) {
      let best = null, bv = 0;
      for (const f of AI.wars(game, pl)) for (const g of f.globals) { if (pl.globals.includes(g)) continue; const v = AI.globalValue(game, pl, g) + (AI.HOSTILE_GLOBALS.includes(g) ? 20 : 0); if (v > bv) { bv = v; best = { player: f.id, spell: g }; } }
      return best && bv >= 25 ? { sc: 20 + bv / 2, target: best } : null;
    },
    spell_blast(game, pl, o) {
      const f = U.max(AI.wars(game, pl).concat(game.players.filter(x => x.alive && x !== pl && pl.contact[x.id] && x.casting && x.casting.id === 'spell_of_mastery')).filter(x => x.casting && pl.mana >= o.cost + x.casting.progress), x => x.casting.progress);
      if (!f) return null;
      const som = f.casting.id === 'spell_of_mastery';
      return som || f.casting.progress >= 250 ? { sc: som ? 95 : 15 + f.casting.progress / 40, target: { player: f.id } } : null;
    },
    drain_power(game, pl, o) { const f = U.max(AI.wars(game, pl), x => Intel.powerOf(game, pl, x.id)); return f ? { sc: 13, target: { player: f.id } } : null; },
    cruel_unminding(game, pl, o) { const f = U.max(AI.wars(game, pl), x => Intel.powerOf(game, pl, x.id)); return f ? { sc: 16, target: { player: f.id } } : null; },
    subversion(game, pl, o) { const f = U.max(AI.wars(game, pl), x => U.sum(game.players.filter(y => y.alive && y !== x && y !== pl), y => (y.relations && y.relations[x.id]) || 0)); return f ? { sc: 12, target: { player: f.id } } : null; },
    warp_node(game, pl, o) {
      const foes = new Set(AI.wars(game, pl).map(x => x.id));
      const s = U.max(game.sites.filter(s => s.type === 'node' && foes.has(s.owner) && s.warped == null && Intel.knows(game, pl, s.plane, s.x, s.y)), s => s.power || 0);
      return s ? { sc: 14 + (s.power || 0), target: { plane: s.plane, x: s.x, y: s.y } } : null;
    },
    corruption(game, pl, o) { return AI.foeTileSpell(game, pl, 'corruption', 10); },
    raise_volcano(game, pl, o) { return AI.foeTileSpell(game, pl, 'raise_volcano', 13); },
    resurrection(game, pl, o) {
      const d = U.max(pl.deadHeroes || [], x => x.xp || 0); if (!d || (d.xp || 0) < 120) return null;
      return Spells.validate(game, pl, 'resurrection', { hero: d.type }).ok ? { sc: 22 + (d.xp || 0) / 40, target: { hero: d.type } } : null;
    },
    summon_hero(game, pl, o) { return Heroes.heroCount(game, pl) < 4 ? { sc: 28 } : null; },
    summon_champion(game, pl, o) { return Heroes.heroCount(game, pl) < 6 ? { sc: 45 } : null; },
    incarnation(game, pl, o) { return { sc: 50 }; },
    great_unsummoning(game, pl, o) {
      const foes = new Set(AI.wars(game, pl).map(x => x.id)), fan = u => Units.isFantastic(u) && !Units.stats(game, u).ab.magicImmunity;
      const theirs = U.sum(Object.values(game.units).filter(u => foes.has(u.owner) && fan(u)), u => Units.strength(game, u)), ours = U.sum(o.army.filter(fan), u => Units.strength(game, u));
      return theirs > ours * 2 + 600 ? { sc: 20 + (theirs - ours) / 150 } : null;
    },
    death_wish(game, pl, o) {
      const foes = new Set(AI.wars(game, pl).map(x => x.id)), nor = u => Units.isNormal(u);
      const theirs = U.sum(Object.values(game.units).filter(u => foes.has(u.owner) && nor(u)), u => Units.strength(game, u)), ours = U.sum(o.army.filter(nor), u => Units.strength(game, u));
      return theirs > ours * 1.3 + 500 ? { sc: 25 + (theirs - ours) / 150 } : null;
    },
  },
  // une tempête sur la pile ennemie vue la plus menaçante (près de nos cités d'abord)
  stackSpell(game, pl, id, o, base) {
    if (!AI.now(game, pl, o.cost)) return null;
    const s = U.max(AI.seenFoeStacks(game, pl).filter(s => s.str >= 150 && Spells.validate(game, pl, id, { plane: s.plane, x: s.x, y: s.y }).ok), s => s.str * (s.dist <= 5 ? 2 : 1));
    return s ? { sc: Math.min(base, 10 + s.str / 50) * (s.dist <= 5 ? 1.3 : 1), target: { plane: s.plane, x: s.x, y: s.y } } : null;
  },
  disjSpell(game, pl, id, mult) {
    const str = (DATA.spells[id].cost || 200) * mult;
    const t = U.max(Spells.disjTargets(game, pl).filter(x => pl.diplo[x.o.id] === 'war' || AI.HOSTILE_GLOBALS.includes(x.g)), x => (AI.HOSTILE_GLOBALS.includes(x.g) ? 2 : 1) * Spells.dispelChance(game, str, x.g, x.o.id));
    if (!t) return null;
    const p = Spells.dispelChance(game, str, t.g, t.o.id);
    return p >= 0.3 ? { sc: (AI.HOSTILE_GLOBALS.includes(t.g) ? 50 : 20) * p, target: { player: t.o.id, spell: t.g } } : null;
  },
  // une case des terres d'une cité ennemie (vue, à minerai ou fertile) : Corruption, Éruption
  foeTileSpell(game, pl, id, sc) {
    const foes = new Set(AI.wars(game, pl).map(x => x.id)), w = game.world;
    let best = null, bv = 0;
    for (const c of Intel.knownCities(game, pl).filter(c => foes.has(c.owner))) for (const [x, y] of World.catchment(w, c.x, c.y)) {
      if (!Intel.knows(game, pl, c.plane, x, y) || Spells.tileCheck(game, pl, id, { plane: c.plane, x, y })) continue;
      const v = (World.get(w, c.plane, 'mineral', x, y) ? 3 : 0) + (World.terr(w, c.plane, x, y) === T.GRASS ? 1 : 0) + Cities.citizens(c) / 10;
      if (v > bv) { bv = v; best = { plane: c.plane, x, y }; }
    }
    return best ? { sc: sc + bv, target: best } : null;
  },
});
