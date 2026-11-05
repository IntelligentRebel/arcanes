'use strict';
// Fin de tour : économie, croissance, production, recherche, magie, événements, neutres.

const Turn = {
  async endTurn(game) {
    if (game.over) return;
    Wonders.sync(game);
    // 1. les sorciers IA jouent (sauf ceux que l'Arrêt du temps d'un rival fige)
    for (const pl of game.players) {
      if (!pl.alive || pl.human || Turn.frozen(game, pl)) continue;
      try { await AI.takeTurn(game, pl); } catch (e) { console.error('IA', pl.name, e); }
      if (game.over) return;
    }
    // 2. pillards et monstres errants (figés eux aussi par l'Arrêt du temps)
    if (!game.players.some(o => o.alive && o.globals.includes('time_stop'))) try { await Neutrals.act(game); } catch (e) { console.error('Neutres', e); }
    // 3. traitement économique de chaque sorcier
    for (const pl of game.players) if (pl.alive) Turn.processPlayer(game, pl);
    Turn.processNeutralCities(game);
    Turn.processGlobals(game);
    Game.nodesTick(game);
    Heroes.questTick(game);
    Heroes.checkLevels(game);
    Veil.tick(game);
    Pacts.tick(game);
    Crisis.tick(game);
    Game.tickFallen(game);
    Turn.randomEvents(game);
    Dilemmas.tick(game);
    Endgame.tick(game);
    Nemesis.tick(game);
    Cities.updateTerritory(game);
    Game.checkElimination(game);
    Diplomacy.updateTurn(game);
    Rite.tick(game);
    Book.tick(game);
    Game.rescueStranded(game);
    // 4. nouveau tour
    game.turn++;
    for (const pl of game.players) if (pl.alive) {
      Game.startTurnFor(game, pl);
      pl.stats.push({ t: game.turn, power: Magic.power(game, pl), cities: Cities.ofPlayer(game, pl.id).length, army: U.sum(Object.values(game.units).filter(u => u.owner === pl.id && !u.riteDemon), u => Units.strength(game, u)) });
      if (pl.stats.length > 300) pl.stats.shift();
      if (pl.human) Intel.recordHistory(game, pl);   // le rapport de forces tel que le joueur le perçoit, pour son graphique
    }
    if (typeof Chronicle !== 'undefined') try { Chronicle.record(game); } catch (e) { console.error('chronique', e); }
    for (const u of Object.values(game.units)) if (u.owner < 0) {
      u.moves = Units.maxMoves(game, u);
      // stase : comme pour les sorciers, figée au moins un tour, puis un jet de résistance à −5
      if (u.stasis) { if (u.stasis > 1 && game.rng.int(10) + 1 <= Spells.resVs(game, u, 'sorcery') - 5) Game.stasisFreed(game, u); else { u.stasis = 2; u.moves = 0; } }
      // les neutres guérissent aussi (10 % dans une cité, 5 % ailleurs ; jamais les morts-vivants sans régénération)
      if (u.dmg > 0 && u.guardian == null) {
        const s = Units.stats(game, u), c = Cities.at(game, u.plane, u.x, u.y);
        const pct = Units.realmOf(u) === 'death' && !s.ab.regeneration ? 0 : s.ab.regeneration ? 100 : c ? 10 : 5;
        if (pct) u.dmg = Math.max(0, u.dmg - Math.max(1, Math.round(s.maxHp * pct / 100)));
      }
    }
    Heroes.offers(game);
    Turn.intrusions(game);
    if (Game.hooks.update) Game.hooks.update({ type: 'turn' });
  },
  // ennemis vus sur le territoire d'un sorcier humain : une alerte par groupe nouvellement entré
  // (pillards, monstres, troupes d'un sorcier avec qui l'on n'a ni paix ni alliance)
  intrusions(game) {
    const world = game.world, W = world.w;
    for (const pl of game.players) {
      if (!pl.alive || !pl.human) continue;
      const prev = new Set(pl.intruders || []), now = [], fresh = new Map();
      for (const u of Object.values(game.units)) {
        if (u.owner === pl.id || u.guardian != null) continue;
        if (u.owner >= 0 && (pl.diplo[u.owner] === 'peace' || pl.diplo[u.owner] === 'alliance')) continue;
        if (world.planes[u.plane].owner[u.y * W + u.x] !== pl.id || Cities.at(game, u.plane, u.x, u.y)) continue;
        if (!Intel.sees(game, pl, u.plane, u.x, u.y) || Intel.hiddenFrom(game, pl.id, u)) continue;
        now.push(u.id);
        if (prev.has(u.id)) continue;
        const k = u.plane + ',' + u.x + ',' + u.y;
        if (!fresh.has(k)) fresh.set(k, []);
        fresh.get(k).push(u);
      }
      pl.intruders = now;
      for (const units of fresh.values()) {
        const u0 = units[0];
        const nm = u0.owner < 0 ? '' : Players.nameFor(game, pl.id, u0.owner);
        const who = u0.owner < 0 ? (u0.rampage ? 'Des monstres' : 'Des pillards') : 'Des troupes ' + U.de(nm);
        const near = U.min(Cities.ofPlayer(game, pl.id).filter(c => c.plane === u0.plane), c => World.dist(world, c.x, c.y, u0.x, u0.y));
        // éclaireurs, colons, ingénieurs seuls : rien d'alarmant, une ligne rouge dans le journal suffit (pas de bandeau)
        const harmless = units.every(u => Units.isScout(u) || Units.isSettler(u) || Units.isEngineer(u));
        if (harmless) Game.log(game, pl.id, (Units.isScout(u0) ? 'Des éclaireurs' : 'Des civils') + (u0.owner >= 0 ? ' ' + U.de(nm) : '') + ' entrent sur votre territoire' + (near ? ', près de ' + near.name : '') + '.', { x: u0.x, y: u0.y, plane: u0.plane, alert: true, quiet: true });
        else Game.log(game, pl.id, who + ' (' + U.n(units.length, 'unité') + ') entrent sur votre territoire' + (near ? ', près de ' + near.name : '') + ' !', { x: u0.x, y: u0.y, plane: u0.plane, alert: true });
      }
    }
  },

  // Arrêt du temps : un autre sorcier le maintient, et le temps est figé pour vous
  frozen(game, pl) { return game.players.some(o => o.alive && o !== pl && o.globals.includes('time_stop')); },
  processPlayer(game, pl) {
    const rng = game.rng;
    Cities.rebalanceFood(game, pl.id);
    const { gold, food } = Players.goldPerTurn(game, pl);
    const split = Magic.split(game, pl);
    const timeStop = game.players.some(o => o.alive && o.globals.includes('time_stop') && o !== pl);
    if (timeStop) return;
    // le maître de l'Arrêt du temps : le monde est figé pour lui aussi (ni revenus, ni entretien, ni cités), il ne paie que ce sort
    if (pl.globals.includes('time_stop')) {
      pl.mana -= Magic.manaUpkeep(game, pl);
      // faute de mana, c'est l'Arrêt du temps qui cède (le reste ne coûte rien tant que le temps est figé)
      if (pl.mana < 0) { pl.globals = pl.globals.filter(g => g !== 'time_stop'); pl.mana = 0; Game.log(game, pl.id, 'Mana épuisé : ' + DATA.spells.time_stop.name + ' se dissipe.'); }
      return;
    }
    // or
    pl.gold += gold;
    if (pl.gold < 0) Turn.bankrupt(game, pl);
    // nourriture : famine des troupes (les déserteurs ne mangent plus : on refait le compte)
    if (food < 0) { const f2 = Players.goldPerTurn(game, pl).food; if (f2 < 0) Turn.starve(game, pl, -f2); }
    // mana
    pl.mana += Magic.manaPerTurn(game, pl);
    if (pl.mana < 0) Turn.manaShortage(game, pl);
    // compétence
    pl.skillPoints += split.skill;
    // recherche
    Wonders.loreOptions(game, pl);
    if (!pl.researching && pl.researchOptions.length && !pl.human) pl.researching = AI.pickResearch(game, pl);
    if (pl.researching) {
      pl.researchProgress += Magic.effectiveResearch(game, pl, pl.researching);
      const cost = Magic.researchCost(pl, pl.researching);
      if (pl.researchProgress >= cost) {
        const id = pl.researching;
        const over = pl.researchProgress - cost;
        Magic.learn(game, pl, id);
        pl.researchProgress = Math.min(over, 0);
        Game.log(game, pl.id, 'Recherche achevée : ' + DATA.spells[id].name + '.', { spell: id });
        if (pl.human) { pl.mustChooseResearch = true; pl.justLearned = { id, turn: game.turn }; }
        if (id === 'spell_of_mastery') Game.log(game, pl.id, 'Vous pouvez désormais lancer le Sort de Maîtrise !');
      }
    } else if (pl.human && pl.researchOptions.length) pl.mustChooseResearch = true;
    // cités
    for (const c of Cities.ofPlayer(game, pl.id)) Turn.processCity(game, c, pl);
    // unités
    for (const u of Object.values(game.units)) if (u.owner === pl.id) Turn.processUnit(game, u, pl);
    // renommée minimale
    pl.fame = Math.max(0, pl.fame);
  },

  processCity(game, c, pl) {
    const e = Cities.econ(game, c);
    // population
    const oldN = Cities.citizens(c);
    c.pop = U.clamp(c.pop + e.growth, 300, MAX_CITY_SIZE * 1000);
    if (c.pop < 1000 && e.growth < 0) {
      // ville affamée qui disparaît
      if (c.pop <= 300 && !c.fortress) { Game.log(game, c.owner, c.name + ' a été abandonnée par ses habitants.', { city: c.id }); Game.destroyCity(game, c); return; }
    }
    const newN = Cities.citizens(c);
    if (newN > oldN && pl) Game.log(game, c.owner, c.name + ' grandit : ' + newN + ' citoyens.', { city: c.id, minor: true });
    if (newN !== oldN) { if (c.autoFarmers) Cities.resetFarmers(game, c); }
    // une cité à rôle qui attendait (commerce ou logements faute de mieux) reprend dès qu'un ouvrage du rôle devient possible
    if (pl && pl.human && c.role && !(c.queue || []).length && (c.prod.type === 'tradeGoods' || c.prod.type === 'housing')) Cities.applyRole(game, c);
    // population maximale : les logements ne servent plus, la cité passe au commerce
    if (c.prod.type === 'housing' && newN >= e.maxPop) {
      c.prod = { type: 'tradeGoods' };
      if (pl && pl.human) Game.log(game, c.owner, c.name + ' a atteint sa population maximale : les logements laissent place au commerce.', { city: c.id, minor: true });
    }
    // production
    Cities.skipBuilt(game, c);
    // l'ouvrage a perdu un prérequis (bâtiment détruit, forteresse déplacée) : il retourne dans la file avec son avancement
    const cp = c.prod;
    if ((cp.type === 'building' && !c.buildings[cp.id] && !Cities.canBuild(game, c, cp.id)) || (cp.type === 'unit' && !Cities.canBuildUnit(game, Object.assign({}, c, { pop: Math.max(c.pop, 2000) }), cp.id))) {
      const was = Cities.prodName(c), keep = Math.floor(c.progress || 0);
      const bare = Object.assign({}, c, { prod: { type: 'tradeGoods' } });
      const later = cp.type === 'building' ? Cities.canBuildLater(game, bare, cp.id) : Cities.canBuildUnitLater(game, bare, cp.id);
      if (keep > 0 && later) (c.queue = c.queue || []).unshift({ type: cp.type, id: cp.id, progress: keep });
      const carried = later ? 0 : keep;
      c.progress = 0;
      const queued = Cities.nextFromQueue(game, c), next = queued || (pl && !pl.human ? AI.chooseProduction(game, c) : null);
      c.prod = next ? { type: next.type, id: next.id } : { type: 'tradeGoods' };
      c.progress = ((queued && queued.progress) || 0) + (next ? carried : 0);
      if (!next && carried) { c.progress = carried; c.carry = true; }   // le travail attend le prochain ouvrage choisi
      if (pl && pl.human) { Game.log(game, c.owner, c.name + ' : ' + was + ' n\'est plus possible (un prérequis manque)' + (keep > 0 ? (later ? ', il attend en file' : ', son avancement passe à la suite') : '') + ' ; ' + (next ? 'la cité passe à ' + Cities.prodName(c) : 'à vous de choisir la suite') + '.', { city: c.id }); if (!next) c.needsOrder = true; }
    }
    const pr = c.prod;
    if (pr.type === 'rearm') Turn.progressRearm(game, c, pl, e);
    else if (pr.type === 'building' || pr.type === 'unit') {
      c.progress += e.prod;
      c.carry = false;
      const cost = Cities.prodCost(game, c, e);
      if (c.progress >= cost) {
        c.progress -= cost;
        if (pr.type === 'building') {
          const already = !!c.buildings[pr.id];   // (Mur de pierre lancé pendant la construction des remparts…)
          c.buildings[pr.id] = true; c.lastDone = { type: 'building', id: pr.id, turn: game.turn };
          if (DATA.buildings[pr.id].wonder) {
            if (pl) { pl.wondersBuilt = Wonders.built(pl) + 1; (pl.builtRaces = pl.builtRaces || []).push(DATA.buildings[pr.id].wonder); }
            Wonders.sync(game);
            // les rivaux qui le connaissent l'apprennent
            for (const o of game.players) if (o && o.human && o.id !== c.owner && Players.knows(game, o.id, c.owner)) Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, c.owner)) + ' achève un grand ouvrage : ' + DATA.buildings[pr.id].name + '.', { player: c.owner });
          }
          if (already) c.progress += cost;   // rien n'est perdu : l'ouvrage passe au suivant
          else if (pl) Game.log(game, c.owner, c.name + ' a construit : ' + DATA.buildings[pr.id].name + '.', { city: c.id, building: pr.id });
          if (!already) c.progress = 0;
          const queued = Cities.nextFromQueue(game, c);
          // la file vide : le rôle de la cité choisit, sinon son gouverneur, sinon le joueur
          const role = pl && pl.human && !queued && c.role ? Cities.roleChoice(game, c, c.role) : null;
          const gov = pl && pl.human && !queued && !role && c.govChoose !== false ? Cities.governor(game, c) : null;
          const next = queued || role || (pl && (!pl.human || gov) ? AI.chooseProduction(game, c) : null);
          c.prod = next ? { type: next.type, id: next.id } : { type: 'tradeGoods' };
          c.progress = (queued && queued.progress) || (already ? c.progress : 0);
          if (gov && next) Game.log(game, c.owner, gov.hero.name + ', gouverneur de ' + c.name + ', lance : ' + Cities.prodName(c) + '.', { city: c.id, minor: true });
          else if (role) Game.log(game, c.owner, c.name + ' (' + Cities.ROLES[c.role].name.toLowerCase() + ') lance : ' + Cities.prodName(c) + '.', { city: c.id, minor: true });
          if (pl && pl.human && !queued && !role && !(gov && next)) c.needsOrder = true;
        } else {
          Turn.completeUnit(game, c, pr.id, pl, e);
        }
      }
    }
    c.bought = false;
    Turn.cityEffects(game, c, e);
  },
  // malédictions et bienfaits d'une cité, chaque tour (aussi pour les cités neutres)
  cityEffects(game, c, e) {
    // nightshade : chance de dissiper les malédictions
    if (e.nightshade && (c.buildings.shrine || c.buildings.sagesGuild || c.buildings.animistsGuild || c.buildings.temple)) {
      for (let i = 0; i < e.nightshade; i++) c.ench = c.ench.filter(x => !(DATA.spells[x.spell].kind === 'cityCurse' && x.owner !== c.owner && game.rng.chance(0.2)));
    }
    // malédictions actives
    if (Cities.hasEnch(c, 'chaos_rift')) {
      // 5 éclairs perforants de force 8 par tour, chacun sur une unité de la garnison
      const gar = Units.at(game, c.plane, c.x, c.y);
      if (gar.length) for (let k = 0; k < 5; k++) { const u = game.rng.pick(gar); const s = Units.stats(game, u); if (s.ab.magicImmunity || Spells.righteous(u, 'chaos')) continue; u.dmg += Math.max(0, Math.min(Units.health(game, u), game.rng.rolls(8, 30) - game.rng.rolls(Math.floor(Spells.defVs(game, u, 'chaos', s) / 2), 30))); }
      const dead = [];
      for (const u of Units.at(game, c.plane, c.x, c.y)) if (Units.health(game, u) <= 0) { dead.push(Units.name(u)); Units.remove(game, u); }
      const lost = Cities.destroyBuildings(game, c, 0.05);
      const parts = []; if (lost.length) parts.push(Cities.lostText(lost)); if (dead.length) parts.push(dead.join(', ') + ' (garnison)');
      if (parts.length && c.owner >= 0) Game.log(game, c.owner, 'La Faille du chaos ronge ' + c.name + ' : ' + parts.join(' ; ') + '.', { city: c.id, alert: true });
    }
    if (Cities.hasEnch(c, 'pestilence') && game.rng.chance(0.3)) c.pop = Math.max(Math.min(c.pop, 1000), c.pop - 1000);   // jamais de quoi grossir une cité déjà sous 1000
    // Bénédiction de Gaïa : les déserts reverdissent, les volcans s'apaisent, la terre corrompue guérit
    if (Cities.hasEnch(c, 'gaias_blessing')) for (const [x, y] of World.catchment(game.world, c.x, c.y)) {
      const t = World.terr(game.world, c.plane, x, y);
      if (t === T.DESERT && game.rng.chance(0.1)) World.setTerr(game.world, c.plane, x, y, T.GRASS);
      else if (t === T.VOLCANO && game.rng.chance(0.1)) World.setTerr(game.world, c.plane, x, y, T.HILLS);
      if (World.get(game.world, c.plane, 'corrupt', x, y) && game.rng.chance(0.2)) World.set(game.world, c.plane, 'corrupt', x, y, 0);
    }
  },

  // armes magiques pour la garnison : la production s'accumule ; le coût suit les unités présentes à chaque tour
  progressRearm(game, c, pl, e) {
    c.progress += e.prod; c.carry = false;
    const targets = Cities.rearmTargets(game, c, e), cost = Cities.rearmCost(game, c, e);
    if (targets.length && c.progress < cost) return;
    const tier = Cities.rearmTier(game, c, e);
    if (targets.length) {
      for (const u of targets) u.weapon = tier;
      c.progress -= cost;
      c.lastDone = { type: 'rearm', turn: game.turn };
      if (pl) Game.log(game, c.owner, c.name + ' : ' + U.n(targets.length, 'unité reçoit', 'unités reçoivent') + ' des armes ' + Units.WEAPON_WORDS[tier] + '.', { city: c.id, minor: true });
    } else if (pl && pl.human) Game.log(game, c.owner, c.name + ' : plus aucune unité à équiper d\'armes magiques.', { city: c.id, minor: true });
    // la suite, comme après une unité : le surplus passe à l'ouvrage suivant
    c.carry = true; c.progress = Math.max(0, Math.min(c.progress, e.prod || 0));
    const queued = c.queue && c.queue.length ? Cities.nextFromQueue(game, c) : null;
    if (queued) Cities.setProduction(game, c, queued, { done: true });
    else { c.prod = { type: 'tradeGoods' }; c.progress = 0; c.carry = false; if (pl && pl.human && !Cities.applyRole(game, c)) c.needsOrder = true; }
  },
  completeUnit(game, c, type, pl, e) {
    const d = DATA.units[type];
    const here = Units.at(game, c.plane, c.x, c.y).filter(u => u.owner === c.owner).length;
    // garnison pleine : l'unité sort hors les murs, sur une case voisine où elle peut se tenir ; sinon elle attend
    let at = [c.plane, c.x, c.y];
    if (here >= MAX_STACK) {
      at = Spells.spotNear(game, pl || { id: c.owner }, c, type);
      if (!at) {
        c.progress = Cities.prodCost(game, c, e); c.aiReconsider = true;
        if (pl && c.fullWarned !== game.turn) { c.fullWarned = game.turn; Game.log(game, c.owner, c.name + ' : la garnison est pleine (' + MAX_STACK + ' unités) et aucune case voisine n\'est libre : l\'unité (' + d.name + ') attend qu\'une place se libère.', { city: c.id, alert: !!pl.human }); }
        return;
      }
    }
    if (d.abilities.createOutpost) { if (c.pop < 2000) { c.progress = Cities.prodCost(game, c, e); return; } c.pop -= 1000; if (c.autoFarmers) Cities.resetFarmers(game, c); }
    const u = Units.create(game, type, c.owner, at[0], at[1], at[2]);
    const outside = at[1] !== c.x || at[2] !== c.y;
    if (Units.isNormal(u)) {
      if (Cities.hasEnch(c, 'altar_of_battle')) u.xp = 120; else if (c.buildings.warCollege) u.xp = 60; else if (c.buildings.fightersGuild) u.xp = 20;
      // Halle des Jarls : les troupes des cités barbares sortent Vétéran ; Forge-Mère : armes de mithril partout
      if (c.race === 'barbarian' && Wonders.has(game, c.owner, 'barbarian')) u.xp = Math.max(u.xp, 60);
      u.weapon = Units.weaponFor(type, Wonders.has(game, c.owner, 'dwarf') ? Math.max(2, e.weapon) : e.weapon);
      if (pl && pl.globals.includes('doom_mastery')) { const ch = Spells.usefulChannels(game, u); if (ch.length) u.chaosChannel = game.rng.pick(ch); }
    }
    u.moves = 0;
    c.aiReconsider = true; c.lastDone = { type: 'unit', id: type, turn: game.turn };
    // point de ralliement de la cité : la nouvelle unité s'y rend d'elle-même, et y attend en sentinelle
    if (pl && pl.human && c.rally && c.rally.plane === u.plane && !(c.rally.x === u.x && c.rally.y === u.y) && !d.abilities.createOutpost && !d.abilities.construction) {
      const path = Move.findPath(game, [u], u.plane, c.rally.x, c.rally.y, {});
      if (path && path.length) { u.path = path.map(p => [p.x, p.y]); u.dest = [c.rally.x, c.rally.y]; u.status = 'goto'; u.rallyHold = true; }
    }
    if (pl && outside) Game.log(game, c.owner, c.name + ' a recruté : ' + d.name + (u.chaosChannel ? ', avec ' + Spells.CHANNEL_NAMES[u.chaosChannel] : '') + '. La garnison étant pleine (' + MAX_STACK + ' unités), la nouvelle unité attend hors les murs, en (' + at[1] + ', ' + at[2] + ').', { city: c.id, unit: u.id, x: at[1], y: at[2], plane: at[0] });
    else if (pl) Game.log(game, c.owner, c.name + ' a recruté : ' + d.name + (u.chaosChannel ? ', avec ' + Spells.CHANNEL_NAMES[u.chaosChannel] : '') + '.', { city: c.id, unit: u.id, minor: true });
    c.carry = true; // le surplus de production passe à l'ouvrage suivant (au plus un tour de production, moins qu'une unité)
    c.progress = Math.max(0, Math.min(c.progress, (e.prod || 0), Cities.prodCost(game, c, e) - 1));
    const queued = c.queue && c.queue.length ? Cities.nextFromQueue(game, c) : null;
    if (queued) { Cities.setProduction(game, c, queued, { done: true }); }
    else if (pl && pl.human && c.prodOnce) { c.prod = { type: 'tradeGoods' }; c.prodOnce = false; if (!Cities.applyRole(game, c)) c.needsOrder = true; }
  },

  processUnit(game, u, pl) {
    Units.fixHp(game, u);   // un enchantement de vie perdu ne laisse pas une unité à 0 PV
    const s = Units.stats(game, u);
    // soins
    if (u.dmg > 0) {
      const city = Cities.at(game, u.plane, u.x, u.y);
      let pct = city && city.owner === u.owner ? (city.buildings.animistsGuild ? 15 : 10) : 5;
      if (city && Cities.hasEnch(city, 'stream_of_life')) pct = 100;
      if (pl && pl.globals.includes('herb_mastery')) pct = 100;
      if ((Units.realmOf(u) === 'death' || u.undead) && !u.riteDemon) pct = s.ab.regeneration ? pct : 0;   // le Démon légendaire se refait comme un vivant
      let heal = Math.max(1, Math.round(s.maxHp * pct / 100));
      // guérisseurs dans la pile
      if (Units.at(game, u.plane, u.x, u.y).some(o => o.owner === u.owner && Units.has(game, o, 'healer'))) heal += Math.max(1, Math.round(s.maxHp * 0.2));
      if (s.ab.regeneration) heal = s.maxHp;
      if (pct === 0 && !s.ab.regeneration) heal = 0;
      u.dmg = Math.max(0, u.dmg - heal);
      // ordre « Soigner » : l'unité se réveille quand elle est guérie
      if (u.status === 'heal' && u.dmg <= 0) { u.status = ''; if (pl && pl.human) Game.log(game, u.owner, U.cap(Units.label(u)) + ' : soins terminés, en attente d\'ordres.', { x: u.x, y: u.y, plane: u.plane, unit: u.id, minor: true }); }
    }
    else if (u.status === 'heal') u.status = '';
    // expérience : +1 par tour pour les unités normales et les héros, plus le maître d'armes de la pile pour les unités normales
    u.xp += Units.xpPerTurn(game, u).total;
    // travaux
    if ((u.status === 'road' || u.status === 'roadto') && Units.isEngineer(u)) Turn.workRoad(game, u);
    if (u.status === 'purify' && !World.get(game.world, u.plane, 'corrupt', u.x, u.y)) u.status = '';   // déjà purifiée (par un autre, par Gaïa…)
    // purification automatique (autopurify) : même travail ; l'unité garde son ordre et file ensuite vers la terre suivante
    if ((u.status === 'purify' || u.status === 'autopurify') && Units.has(game, u, 'purify') && World.get(game.world, u.plane, 'corrupt', u.x, u.y)) {
      const k = u.plane + ',' + u.x + ',' + u.y;
      if (u.purifyAt !== k) { u.purifyAt = k; u.purifyWork = 0; }
      u.purifyWork = (u.purifyWork || 0) + 1;
      if (u.purifyWork >= 3) { World.set(game.world, u.plane, 'corrupt', u.x, u.y, 0); if (u.status === 'purify') u.status = ''; u.purifyWork = 0; Game.log(game, u.owner, 'Une terre corrompue a été purifiée.', { x: u.x, y: u.y, plane: u.plane, minor: true }); }
    }
    // armes enchantées sur les invocations de Mort : rien
  },
  workRoad(game, u) {
    const world = game.world, p = u.plane;
    if (World.hasRoad(world, p, u.x, u.y)) { if (u.status === 'road') u.status = ''; return; }
    const key = u.x + ',' + u.y;
    const pl = world.planes[p];
    const need = DATA.terrain[World.terrainKey(world, p, u.x, u.y)].roadTurns;
    if (!need) { if (u.status === 'road') u.status = ''; return; }   // l'eau ne s'empierre pas
    // les ingénieurs d'une même case cumulent leur travail (un nain en vaut deux)
    const engineers = Units.at(game, p, u.x, u.y).filter(o => o.owner === u.owner && Units.isEngineer(o) && (o.status === 'road' || o.status === 'roadto'));
    if (engineers[0] !== u) return; // une seule mise à jour par case
    pl.roadWork[key] = (pl.roadWork[key] || 0) + U.sum(engineers, o => DATA.units[o.type].race === 'dwarf' ? 2 : 1);
    if (pl.roadWork[key] >= need) {
      World.set(world, p, 'road', u.x, u.y, p === 1 ? 2 : 1);
      delete pl.roadWork[key];
      for (const e of engineers) if (e.status === 'road') e.status = '';
      Game.log(game, u.owner, 'Route achevée.', { x: u.x, y: u.y, plane: p, minor: true });
    }
  },

  bankrupt(game, pl) {
    // vendre des bâtiments puis renvoyer des troupes
    const cities = Cities.ofPlayer(game, pl.id);
    let guard = 0; const tried = new Set();
    const sellableIn = c => Object.keys(c.buildings).filter(b => DATA.buildings[b] && DATA.buildings[b].buildable !== false && !Game.sellBlock(c, b));
    while (pl.gold < 0 && guard++ < 40) {
      // d'abord vendre, dans n'importe quelle cité qui a encore quelque chose à vendre ce tour
      const c = game.rng.pick(cities.filter(x => !x.sold && !tried.has(x.id) && sellableIn(x).length));
      if (c) { const b = U.max(sellableIn(c), b => DATA.buildings[b].upkeep), r = Game.sell(game, c.id, b); if (!r.ok) { tried.add(c.id); continue; } Game.log(game, pl.id, 'Trésor à sec : vente ' + U.de(DATA.buildings[b].name) + ' à ' + c.name + ' (' + r.gold + ' or).', { city: c.id }); continue; }
      // puis renvoyer des troupes, les plus chères d'abord, les héros en dernier ; chacune rend la solde qu'elle coûtait vraiment
      // (la renommée en paie une partie : une désertion qui n'allège rien ne sert à rien), jamais un navire chargé en pleine mer
      const before = Magic.goldUpkeepUnits(game, pl);
      const loaded = u => DATA.units[u.type].sailing && World.isWaterAt(game.world, u.plane, u.x, u.y) && Units.at(game, u.plane, u.x, u.y).some(o => o !== u && o.owner === u.owner && !DATA.units[o.type].sailing);
      const units = Object.values(game.units).filter(u => u.owner === pl.id && Units.upkeep(game, u).gold > 0 && !loaded(u));
      const unit = U.max(units, u => (u.hero ? -100 : 0) + Units.upkeep(game, u).gold);
      if (unit && before > 0) { Game.log(game, pl.id, 'Faute de solde, désertion de ' + Units.label(unit) + '.', { x: unit.x, y: unit.y, plane: unit.plane }); Units.remove(game, unit); pl.gold += before - Magic.goldUpkeepUnits(game, pl); continue; }
      break;
    }
    pl.gold = Math.max(0, pl.gold);
  },
  // ce que la fin du tour va coûter : unités dissoutes par la famine, désertions faute d'or, créatures renvoyées faute de mana
  forecastLosses(game, pl) {
    if (Turn.frozen(game, pl)) return null;   // le temps figé, rien ne se paie
    if (pl.globals.includes('time_stop')) { const short = -(pl.mana - Magic.manaUpkeep(game, pl)); return short > 0 ? { famine: null, gold: null, mana: { short, lost: [DATA.spells.time_stop.name] } } : null; }
    Cities.rebalanceFood(game, pl.id); // ce que fera la fin du tour pour les cités en répartition automatique
    const { gold, food } = Players.goldPerTurn(game, pl);
    const out = { famine: null, gold: null, mana: null };
    if (food < 0) {
      out.famine = { deficit: -food, units: Turn.eaters(game, pl).slice(0, -food) };
    }
    if (pl.gold + gold < 0) out.gold = { short: -(pl.gold + gold) };
    let mana = pl.mana + Magic.manaPerTurn(game, pl);
    if (mana < 0) {
      const lost = [];
      const half = pl.retorts.includes('channeler');
      const ench = Object.values(game.units).filter(u => u.owner === pl.id).flatMap(u => u.ench.filter(e => DATA.spells[e] && DATA.spells[e].upkeep).map(e => ({ label: DATA.spells[e].name + ' sur ' + Units.label(u), up: half ? Math.ceil(DATA.spells[e].upkeep / 2) : DATA.spells[e].upkeep })));
      for (const x of ench) { if (mana >= 0) break; mana += x.up; lost.push(x.label); }
      const summoned = Object.values(game.units).filter(u => u.owner === pl.id && !u.hero && Units.upkeep(game, u).mana > 0).sort((a, b) => Units.upkeep(game, b).mana - Units.upkeep(game, a).mana);
      for (const u of summoned) { if (mana >= 0) break; mana += Units.upkeep(game, u).mana; lost.push(Units.label(u)); }
      // puis, comme Turn.manaShortage, les enchantements de cités et enfin les globaux (le dernier lancé d'abord)
      const upk = sp => half ? Math.ceil((sp.upkeep || 0) / 2) : (sp.upkeep || 0);
      for (const c of Object.values(game.cities)) for (const e of c.ench) { if (mana >= 0) break; if (e.owner === pl.id && DATA.spells[e.spell] && DATA.spells[e.spell].upkeep) { mana += upk(DATA.spells[e.spell]); lost.push(DATA.spells[e.spell].name + ' à ' + c.name); } }
      for (const g of pl.globals.slice().reverse()) { if (mana >= 0) break; mana += upk(DATA.spells[g]); lost.push(DATA.spells[g].name); }
      out.mana = { short: -(pl.mana + Magic.manaPerTurn(game, pl)), lost };
    }
    return out.famine || out.gold || out.mana ? out : null;
  },
  // les bouches à nourrir, les moins précieuses d'abord (recrues avant vétérans, héros en dernier) : la famine les renvoie dans cet ordre
  eaters(game, pl) {
    return Object.values(game.units).filter(u => u.owner === pl.id && Units.upkeep(game, u).food > 0)
      .sort((a, b) => (!!a.hero - !!b.hero) || (Units.levelIndex(game, a) - Units.levelIndex(game, b)) || (Units.strength(game, a) - Units.strength(game, b)) || (a.id > b.id ? 1 : -1));
  },
  starve(game, pl, deficit) {
    const eaters = Turn.eaters(game, pl);
    for (let i = 0; i < Math.min(deficit, eaters.length); i++) {
      const u = eaters[i]; Game.log(game, pl.id, 'Famine : dissolution de ' + Units.label(u) + ', faute de vivres.', { x: u.x, y: u.y, plane: u.plane }); Units.remove(game, u);
    }
  },
  manaShortage(game, pl) {
    let guard = 0;
    const up = sp => pl.retorts.includes('channeler') ? Math.ceil((sp.upkeep || 0) / 2) : (sp.upkeep || 0);
    while (pl.mana < 0 && guard++ < 40) {
      // 1. enchantements d'unités, 2. créatures invoquées, 3. enchantements de cités, 4. globaux
      const enchanted = Object.values(game.units).filter(u => u.owner === pl.id && u.ench.some(e => DATA.spells[e] && DATA.spells[e].upkeep));
      if (enchanted.length) { const u = enchanted[0]; const e = u.ench.find(x => DATA.spells[x] && DATA.spells[x].upkeep); u.ench = u.ench.filter(x => x !== e); pl.mana += up(DATA.spells[e]); Game.log(game, pl.id, 'Mana épuisé : ' + DATA.spells[e].name + ' se dissipe sur ' + Units.label(u) + '.', { x: u.x, y: u.y, plane: u.plane }); Units.fixHp(game, u); Game.drownStranded(game, u.plane, u.x, u.y); continue; }
      const summoned = Object.values(game.units).filter(u => u.owner === pl.id && !u.hero && Units.upkeep(game, u).mana > 0);
      if (summoned.length) { const u = U.max(summoned, u => Units.upkeep(game, u).mana); pl.mana += Units.upkeep(game, u).mana; Game.log(game, pl.id, 'Mana épuisé : retour de ' + Units.label(u) + ' dans le néant.', { x: u.x, y: u.y, plane: u.plane }); Units.remove(game, u); continue; }
      const ce = Object.values(game.cities).flatMap(c => c.ench.filter(e => e.owner === pl.id && DATA.spells[e.spell].upkeep).map(e => ({ c, e })));
      if (ce.length) { const { c, e } = ce[0]; c.ench = c.ench.filter(x => x !== e); pl.mana += up(DATA.spells[e.spell]); Game.log(game, pl.id, 'Mana épuisé : ' + DATA.spells[e.spell].name + ' se dissipe à ' + c.name + '.', { city: c.id }); continue; }
      if (pl.globals.length) { const g = pl.globals.pop(); pl.mana += up(DATA.spells[g]); Game.log(game, pl.id, 'Mana épuisé : ' + DATA.spells[g].name + ' se dissipe.'); continue; }
      break;
    }
    pl.mana = Math.max(0, pl.mana);
  },

  processNeutralCities(game) {
    for (const c of Object.values(game.cities)) {
      if (c.owner >= 0) continue;
      const e = Cities.econ(game, c);
      c.pop = U.clamp(c.pop + Math.floor(e.growth / 2), 1000, MAX_CITY_SIZE * 1000);
      Turn.cityEffects(game, c, e);
      // les cités neutres arment peu à peu des pillards
      const garrison = Units.at(game, c.plane, c.x, c.y).filter(u => u.owner === -1).length;
      if (game.turn > 15 && garrison < 6 && game.rng.chance(0.04 + Cities.citizens(c) * 0.004)) {
        const race = DATA.races[c.race];
        const opts = race.units.filter(t => { const d = DATA.units[t]; return !d.abilities.createOutpost && !d.abilities.construction && !d.abilities.scout && !d.abilities.siegeOnly && !d.sailing && d.cost <= 40 + game.turn; });
        if (opts.length) Units.create(game, game.rng.pick(opts), -1, c.plane, c.x, c.y);
      }
    }
  },

  // terres d'un rival changées par Armageddon ou la Grande Dévastation : regroupées par victime, une ligne par tour
  noteLand(game, pl, p, x, y, kind) {
    const c = game.cities[game.world.planes[p].ownerCity[World.idx(game.world, x, y)]];
    if (!c || c.owner < 0 || c.owner === pl.id) return;
    const L = (Turn._land = Turn._land || {}), k = c.owner;
    (L[k] = L[k] || { volc: [], corr: [] })[kind].push({ c, p, x, y });
  },
  flushLand(game, pl) {
    const L = Turn._land; Turn._land = null; if (!L) return;
    for (const o in L) {
      const { volc, corr } = L[o], first = volc[0] || corr[0], near = U.uniq(volc.concat(corr).map(e => e.c.name));
      const parts = (volc.length ? [U.n(volc.length, 'volcan surgit', 'volcans surgissent')] : []).concat(corr.length ? [U.n(corr.length, 'terre est corrompue', 'terres sont corrompues')] : []);
      Game.log(game, +o, (volc.length ? 'Armageddon' : 'Grande Dévastation') + ' ' + U.de(Players.nameFor(game, +o, pl.id)) + ' : ' + parts.join(', ') + ' près de ' + near.join(', ') + '.', { plane: first.p, x: first.x, y: first.y, player: pl.id, minor: true });
    }
  },
  processGlobals(game) {
    const rng = game.rng;
    for (const pl of game.players) if (pl.alive) pl.extraPower = 0;
    // une cité consacrée protège toute sa zone des effets globaux de chaos et de mort (et la purifie chaque tour)
    const holy = new Set();
    for (const c of Object.values(game.cities)) if (Cities.hasEnch(c, 'consecration')) for (const [x, y] of World.catchment(game.world, c.x, c.y)) { holy.add(c.plane + ',' + x + ',' + y); World.set(game.world, c.plane, 'corrupt', x, y, 0); }
    for (const pl of game.players) {
      if (!pl.alive) continue;
      for (const g of pl.globals) {
        if (g === 'armageddon') {
          // 4 ou 5 volcanes surgissent chaque tour, hors des terres du lanceur
          let want = 4 + rng.int(2);
          for (let tries = 0; want > 0 && tries < 80; tries++) {
            const p = rng.int(2); const x = rng.int(game.world.w), y = 1 + rng.int(game.world.h - 2);
            const t = World.terr(game.world, p, x, y);
            if (World.isWater(t) || NODE_REALM[t] || World.get(game.world, p, 'owner', x, y) === pl.id || Cities.at(game, p, x, y) || holy.has(p + ',' + x + ',' + y)) continue;
            if (t === T.VOLCANO || t === T.HILLS || t === T.MOUNTAIN) continue;
            World.setTerr(game.world, p, x, y, T.VOLCANO); Spells.addVolcano(pl, p, x, y); want--;
            Turn.noteLand(game, pl, p, x, y, 'volc');
          }
        }
        if (g === 'great_wasting') {
          for (let i = 0; i < 6; i++) { const p = rng.int(2); const x = rng.int(game.world.w), y = rng.int(game.world.h); if (World.isWaterAt(game.world, p, x, y)) continue; if (World.get(game.world, p, 'owner', x, y) === pl.id || holy.has(p + ',' + x + ',' + y)) continue; if (!World.get(game.world, p, 'corrupt', x, y)) Turn.noteLand(game, pl, p, x, y, 'corr'); World.set(game.world, p, 'corrupt', x, y, 1); }
        }
        // pluie de météores : toute unité hors des villes subit, figurine par figurine, une attaque de feu de force 4 ;
        // les bâtiments des villes rivales ont 5 % de chances de s'effondrer (les garnisons, à l'abri, sont épargnées)
        if (g === 'meteor_storms') {
          const inCity = new Set(Object.values(game.cities).map(c => c.plane + ',' + c.x + ',' + c.y));
          const dead = {};
          for (const u of Object.values(game.units)) {
            if (inCity.has(u.plane + ',' + u.x + ',' + u.y)) continue;
            const s = Units.stats(game, u); if (s.ab.magicImmunity || s.ab.fireImmunity || Spells.righteous(u, 'chaos')) continue;
            const def = Spells.defVs(game, u, 'chaos', s);   // Bénédiction, Résistance aux éléments, Armure élémentaire comptent
            let tot = 0; for (let i = 0; i < Units.aliveFigures(game, u); i++) tot += Math.max(0, Math.min(s.hp, rng.rolls(4, 30) - rng.rolls(def, 30)));
            u.dmg += tot; if (Units.health(game, u) <= 0) { if (u.owner >= 0) (dead[u.owner] = dead[u.owner] || []).push({ n: Units.name(u), p: u.plane, x: u.x, y: u.y }); Units.remove(game, u); }
          }
          for (const o in dead) { const l = dead[o]; Game.log(game, +o, (+o === pl.id ? 'Votre pluie de météores a détruit vos propres troupes : ' : 'La pluie de météores a détruit ') + U.tally(l.map(d => d.n)) + '.', { plane: l[0].p, x: l[0].x, y: l[0].y, alert: true }); }
          for (const c of Object.values(game.cities)) if (c.owner !== pl.id && !Cities.hasEnch(c, 'consecration'))
            { const lost = Cities.destroyBuildings(game, c, 0.05, rng); if (lost.length && c.owner >= 0) Game.log(game, c.owner, 'Pluie de météores sur ' + c.name + ' : ' + Cities.lostText(lost) + '.', { city: c.id }); }
        }
        if (g === 'zombie_mastery') { /* les unités tuées deviennent des zombies : géré en combat (simplifié) */ }
      }
      Turn.flushLand(game, pl);
      pl.volcanoTiles = (pl.volcanoTiles || []).filter(k => { const [p, x, y] = k.split(',').map(Number); return World.terr(game.world, p, x, y) === T.VOLCANO; });
      pl.extraPower = pl.volcanoTiles.length;
    }
    // lunes
    if (game.moon) { game.moonTurns--; if (game.moonTurns <= 0) { Game.log(game, -1, game.moon === 'good' ? 'La lune bienveillante décline.' : 'La lune maléfique décline.'); game.moon = null; } }
    if (game.popBoomTurns) { game.popBoomTurns--; if (game.popBoomTurns <= 0) game.popBoom = null; }
    for (const c of Object.values(game.cities)) if (c.popBoomTurns > 0) c.popBoomTurns--;   // explosions démographiques, cité par cité
  },

  randomEvents(game) {
    const rng = game.rng;
    if (game.turn < 20 || !rng.chance(0.06)) return;
    const pl = rng.pick(game.players.filter(p => p.alive));
    if (!pl) return;
    const cities = Cities.ofPlayer(game, pl.id);
    const ev = rng.weighted(['goldFound', 'manaDiscovery', 'plague', 'popBoom', 'goodMoon', 'badMoon', 'donation', 'earthquake', 'depletion', 'newMinerals', 'rebellion'], k => ({ goldFound: 3, manaDiscovery: 2, plague: 2, popBoom: 2, goodMoon: 1, badMoon: 1, donation: 2, earthquake: 1, depletion: 1, newMinerals: 2, rebellion: 0.5 }[k]));
    if (ev === 'goldFound') { const g = 50 + rng.int(150); pl.gold += g; Game.log(game, pl.id, 'Un filon d\'or est découvert : +' + g + ' or.', { event: ev }); }
    else if (ev === 'manaDiscovery') { const m = 50 + rng.int(150); pl.mana += m; Game.log(game, pl.id, 'Des cristaux de mana affleurent : +' + m + ' mana.', { event: ev }); }
    else if (ev === 'donation') { const g = 30 + rng.int(70); pl.gold += g; Game.log(game, pl.id, 'Un riche marchand fait don de ' + g + ' or à votre cause.', { event: ev }); }
    else if (ev === 'plague' && cities.length) { const c = rng.pick(cities), before = c.pop; c.pop = Math.max(1000, c.pop - 2000); Game.log(game, pl.id, 'La peste frappe ' + c.name + (before > c.pop ? ' : ' + U.fmt(before - c.pop) + ' habitants en moins.' : '.'), { city: c.id, event: ev }); }
    else if (ev === 'popBoom' && cities.length) { const c = rng.pick(cities); c.popBoomTurns = 10; Game.log(game, pl.id, 'Explosion démographique à ' + c.name + ' : la croissance double pendant 10 tours.', { city: c.id, event: ev }); }
    else if (ev === 'goodMoon' && !game.moon) { game.moon = 'good'; game.moonTurns = 15; Game.log(game, -1, 'Une lune bienveillante se lève : la magie de Vie s\'intensifie, celle de Mort faiblit.', { event: ev }); }
    else if (ev === 'badMoon' && !game.moon) { game.moon = 'bad'; game.moonTurns = 15; Game.log(game, -1, 'Une lune maléfique se lève : la magie de Mort s\'intensifie, celle de Vie faiblit.', { event: ev }); }
    else if (ev === 'earthquake' && cities.length) { const c = rng.pick(cities); const lost = Cities.destroyBuildings(game, c, 0.15, rng); Game.log(game, pl.id, 'Un tremblement de terre ravage ' + c.name + (lost.length ? ' (' + Cities.lostText(lost) + ')' : '') + '.', { city: c.id, event: ev }); }
    else if (ev === 'newMinerals' && cities.length) {
      const c = rng.pick(cities);
      const tiles = World.catchment(game.world, c.x, c.y).filter(([x, y]) => [T.HILLS, T.MOUNTAIN].includes(World.terr(game.world, c.plane, x, y)) && !World.get(game.world, c.plane, 'mineral', x, y));
      if (tiles.length) { const [x, y] = rng.pick(tiles); World.set(game.world, c.plane, 'mineral', x, y, rng.pick([M.silver, M.gold, M.gems, M.mithril])); Game.log(game, pl.id, 'Des prospecteurs découvrent un gisement près de ' + c.name + '.', { city: c.id, event: ev }); }
    }
    else if (ev === 'depletion' && cities.length) {
      const c = rng.pick(cities);
      const tiles = World.catchment(game.world, c.x, c.y).filter(([x, y]) => World.get(game.world, c.plane, 'mineral', x, y) && World.get(game.world, c.plane, 'mineral', x, y) < M.wildGame);
      if (tiles.length) { const [x, y] = rng.pick(tiles); World.set(game.world, c.plane, 'mineral', x, y, 0); Game.log(game, pl.id, 'Un gisement s\'épuise près de ' + c.name + '.', { city: c.id, event: ev }); }
    }
    else if (ev === 'rebellion') {
      const c = cities.filter(x => !x.fortress && Cities.econ(game, x).unrest >= Cities.citizens(x) / 2)[0];
      // la garnison se replie, les enchantements du sorcier tombent, le cercle d'invocation revient à la forteresse
      if (c) { Game.cedeCity(game, c, -1, true); Game.log(game, pl.id, c.name + ' se révolte et proclame son indépendance !', { city: c.id, event: ev }); }
    }
  },
};

// ---------- offres de héros ----------
// Règle d'origine : chaque tour, dès le premier, (3 + renommée/25) % de chances, divisées par
// (héros + 3)/2 (arrondis entiers), doublées par le don Célèbre, plafonnées à 10 %.
// Le niveau d'un héros qui se présente (ou qu'on délivre d'un repaire) dépend de l'époque, pas du hasard :
// Héros jusqu'au tour 50, Myrmidon jusqu'au tour 100, Capitaine jusqu'au tour 150, Commandant ensuite.
// Au-delà, les niveaux se gagnent au combat.
Heroes.offerChance = function (game, pl) {
  const n = Heroes.heroCount(game, pl);
  let chance = Math.floor((3 + Math.floor(Players.fame(game, pl) / 25)) / Math.floor((n + 3) / 2));
  if (pl.retorts.includes('famous')) chance *= 2;
  return Math.min(10, chance);
};
Heroes.ERA = 50;
Heroes.eraLevel = function (game) { return U.clamp(Math.floor((game.turn - 1) / Heroes.ERA), 0, 3); };
Heroes.levelOf = function (game, id) { return Heroes.eraLevel(game); };
// Ajout d'Arcanes : le premier héros. Entre les tours 4 et 10 (tiré pour chaque sorcier), à qui n'en a encore jamais eu,
// un héros sans renommée requise, qui demande une solde, se présente à prix réduit (40 % du tarif). Faute d'or, il revient
// le tour suivant. Les offres ordinaires continuent.
Heroes.firstHero = function (game, pl) {
  if (pl.firstHeroDone || pl.banished) return false;
  if (pl.firstHeroTurn == null) pl.firstHeroTurn = 4 + game.rng.int(7);
  if (game.turn < pl.firstHeroTurn) return false;
  const had = pl.hadHero || (pl.deadHeroes || []).length || Object.values(game.units).some(u => u.owner === pl.id && u.hero && !u.avatar);
  if (had) { pl.firstHeroDone = true; return false; }
  if (pl.heroOffer) return false;
  if (!pl.firstHeroId) {
    const taken = Heroes.takenHeroes(game);
    const cands = Object.values(DATA.heroes).filter(h => !taken.has(h.unit) && !h.champion && !(h.fame > 0) && h.id !== 'HeroTorin' && ((DATA.units[h.unit].upkeep || {}).gold || 0) > 0);
    if (!cands.length) { pl.firstHeroDone = true; return false; }
    pl.firstHeroId = game.rng.pick(cands).id;
  }
  const h = DATA.heroes[pl.firstHeroId];
  if (Object.values(game.units).some(u => u.hero && u.type === h.unit)) { pl.firstHeroId = null; return false; }
  const level = Heroes.levelOf(game, h.id);
  const fee = Math.max(20, Math.round(Heroes.hireFee(game, pl, h, level) * 0.4 / 5) * 5);
  if (pl.gold < fee) return false;
  pl.firstHeroDone = true;
  if (pl.human) {
    pl.heroOffer = { hero: h.id, fee, turn: game.turn, level };
    Game.log(game, pl.id, h.name + ' (' + h.title + ') propose ses services pour ' + fee + ' or.', { heroOffer: h.id });
    return true;
  }
  const fc = game.cities[pl.summonCity] || game.cities[pl.fortress]; if (!fc) return false;
  const at = Spells.spotNear(game, pl, fc, h.unit); if (!at) return false;
  pl.gold -= fee;
  const u = Heroes.spawn(game, pl, h, at[0], at[1], at[2], HERO_LEVELS[level].xp);
  return true;
};
Heroes.offers = function (game) {
  for (const pl of game.players) {
    if (!pl.alive || pl.banished) continue;
    if (Heroes.firstHero(game, pl)) continue;
    if (Heroes.heroCount(game, pl) >= 6) continue;
    if (game.rng.int(100) >= Heroes.offerChance(game, pl)) continue;
    const h = Heroes.randomAvailable(game, pl, false, true);
    if (!h) continue;
    const fee = Heroes.hireFee(game, pl, h, Heroes.levelOf(game, h.id));
    if (fee > pl.gold) continue;
    if (pl.human) { pl.heroOffer = { hero: h.id, fee, turn: game.turn, level: Heroes.levelOf(game, h.id) }; Game.log(game, pl.id, h.name + ' (' + h.title + ') propose ses services pour ' + fee + ' or.', { heroOffer: h.id }); }
    else if (pl.gold >= fee + (AI.feat(pl, 'herohire', 3) ? 0 : 30)) { // Hardcore : un héros dès qu'on peut le payer
      const fc = game.cities[pl.summonCity] || game.cities[pl.fortress]; if (!fc) continue;
      const at = Spells.spotNear(game, pl, fc, h.unit); if (!at) continue;
      pl.gold -= fee; Heroes.spawn(game, pl, h, at[0], at[1], at[2], HERO_LEVELS[Heroes.levelOf(game, h.id)].xp);
    }
  }
  Mercenaries.offers(game);
};
Heroes.refuse = function (game, pl) { pl.heroOffer = null; };

// Mercenaires (règle d'origine) : après le tour 30, (1 + renommée/20) % par tour, x2 si Célèbre, 10 % max.
// Une à trois unités normales d'une race des plans où l'on possède une cité, de 20 à 120 XP.
const Mercenaries = {
  offers(game) {
    if (game.turn <= 30) return;
    const rng = game.rng;
    for (const pl of game.players) {
      if (!pl.alive || pl.banished) continue;
      const fc = game.cities[pl.fortress]; if (!fc) continue;
      const fame = Players.fame(game, pl);
      let chance = 1 + Math.floor(fame / 20);
      if (pl.retorts.includes('famous')) chance *= 2;
      if (rng.int(100) >= Math.min(10, chance)) continue;
      const planes = new Set(Cities.ofPlayer(game, pl.id).map(c => c.plane));
      const races = Object.keys(DATA.races).filter(r => planes.has(DATA.races[r].plane === 'myrror' ? 1 : 0));
      const cands = [];
      for (const r of races) for (const t of DATA.races[r].units) { const d = DATA.units[t]; if (!d.abilities.createOutpost && !d.abilities.construction && !d.abilities.scout && !d.sailing) cands.push(t); }
      if (!cands.length) continue;
      const type = rng.pick(cands);
      const cr = rng.int(100) + fame, count = cr > 90 ? 3 : cr > 60 ? 2 : 1;
      const xr = rng.int(100) + fame, level = xr > 90 ? 3 : xr > 60 ? 2 : 1, xp = [0, 20, 60, 120][level];
      let cost = Math.floor(count * DATA.units[type].cost * (level + 3) / 2);
      if (pl.retorts.includes('charismatic')) cost = Math.floor(cost / 2);
      if (pl.gold < cost) continue;
      if (pl.human) { pl.mercOffer = { type, count, xp, cost, turn: game.turn }; Game.log(game, pl.id, U.n(count, 'unité') + ' de mercenaires (' + DATA.units[type].name + ') proposent leurs services pour ' + cost + ' or.'); }
      else if (pl.gold >= cost + 100) Mercenaries.hire(game, pl, { type, count, xp, cost });
    }
  },
  hire(game, pl, off) {
    const fc = game.cities[pl.fortress]; if (!fc) return { ok: false, why: 'Aucune forteresse.' };
    if (pl.gold < off.cost) return { ok: false, why: 'Or insuffisant.' };
    pl.gold -= off.cost;
    const made = [];
    for (let i = 0; i < off.count; i++) {
      const u = Spells.placeNear(game, pl, off.type, fc); if (!u) break;
      u.xp = off.xp; u.moves = 0; made.push(u);
    }
    if (!made.length) { pl.gold += off.cost; return { ok: false, why: 'Plus de place autour de ' + fc.name + '.' }; }
    if (made.length < off.count) pl.gold += Math.floor(off.cost * (off.count - made.length) / off.count);   // on ne paie que ceux qui arrivent
    if (pl.human) Game.log(game, pl.id, 'Les mercenaires (' + DATA.units[off.type].name + ') rejoignent vos rangs à ' + fc.name + '.', { city: fc.id });
    return { ok: true, units: made };
  },
};
Heroes.accept = function (game, pl) {
  const off = pl.heroOffer; if (!off) return { ok: false };
  const h = DATA.heroes[off.hero];
  if (pl.gold < off.fee) return { ok: false, why: 'Or insuffisant.' };
  if (Heroes.heroCount(game, pl) >= 6) { pl.heroOffer = null; return { ok: false, why: 'Vous avez déjà six héros.' }; }
  if (Object.values(game.units).some(u => u.hero && u.type === h.unit)) { pl.heroOffer = null; return { ok: false, why: h.name + ' sert déjà un autre sorcier.' }; }
  const fc = game.cities[pl.summonCity] || game.cities[pl.fortress];
  if (!fc) return { ok: false, why: 'Aucune forteresse.' };
  // la cité pleine : le héros attend sur une case voisine
  const at = Spells.spotNear(game, pl, fc, h.unit); if (!at) return { ok: false, why: 'Aucune place près de ' + fc.name + ' pour accueillir le héros.' };
  pl.gold -= off.fee; pl.heroOffer = null;
  const u = Heroes.spawn(game, pl, h, at[0], at[1], at[2], HERO_LEVELS[off.level || 0].xp);
  Game.log(game, pl.id, h.name + ' rejoint vos rangs à ' + fc.name + '.', { unit: u.id });
  return { ok: true, unit: u };
};

// ---------- pillards et monstres ----------
const Neutrals = {
  async act(game) {
    const rng = game.rng;
    // monstres qui quittent leur antre
    if (game.turn > 25 && rng.chance(0.05)) {
      const sites = game.sites.filter(s => !s.cleared && !s.legend && s.type !== 'node' && s.type !== 'tower' && s.type !== 'breach' && s.guardians && s.guardians.length > 1);
      if (sites.length) {
        const s = rng.pick(sites);
        const free = World.neighbors(game.world, s.x, s.y).filter(([x, y]) => !World.isWaterAt(game.world, s.plane, x, y) && !Units.at(game, s.plane, x, y).length && !Cities.at(game, s.plane, x, y) && World.get(game.world, s.plane, 'site', x, y) < 0 && !Move.blockedMountain(game, s.plane, x, y));
        // le monstre ne quitte son antre que s'il a où aller (sinon le repaire perdrait un gardien pour rien)
        if (free.length) {
          const t = s.guardians.pop(), und = s.guardianUndead && s.guardianUndead.length > s.guardians.length ? s.guardianUndead.pop() : false;
          const [x, y] = rng.pick(free); const u = Units.create(game, t, -1, s.plane, x, y, und ? { undead: true } : null); u.rampage = true;
        }
      }
    }
    const neutral = Object.values(game.units).filter(u => u.owner === -1 && !u.guardian && !u.bookGuard);   // (les gardiens du Livre ne quittent pas sa case)
    const groups = U.groupBy(neutral, u => u.plane + ',' + u.x + ',' + u.y);
    for (const k in groups) {
      const units = groups[k].filter(u => game.units[u.id]);
      if (!units.length) continue;
      const u0 = units[0];
      const city = Cities.at(game, u0.plane, u0.x, u0.y);
      // les garnisons de cités neutres n'attaquent que si elles sont nombreuses
      let movers = units;
      // vagues de la Brèche : elles marchent sur le sorcier visé, à n'importe quelle distance, et ne s'attardent pas dans les cités prises
      if (u0.crisis) {
        const tc = Crisis.targetCity(game, u0);
        if (tc) {
          const r = await Game.moveGroup(game, units.map(u => u.id), tc.x, tc.y, { auto: false });
          if (game.over) return;
          if (r.ok) continue;
          // cible inaccessible : la vague se rabat sur la cité la plus proche, de qui que ce soit
          for (const u of units) u.crisisTarget = null;
          const tc2 = Crisis.targetCity(game, u0);
          if (tc2 && tc2 !== tc && (await Game.moveGroup(game, units.map(u => u.id), tc2.x, tc2.y, { auto: false })).ok) continue;
          for (const u of units) { delete u.crisis; u.rampage = true; }
        }
      }
      // une némésis en chasse : droit sur son ennemi
      if (u0.hunt != null && !city) {
        const ht = Nemesis.huntTarget(game, units);
        if (ht) { await Game.moveGroup(game, units.map(u => u.id), ht.x, ht.y, { auto: !ht.attack, noAttack: !ht.attack }); if (game.over) return; continue; }
      }
      if (city) { if (units.length < 4 || game.turn < 50 || !rng.chance(0.05)) continue; movers = units.slice(0, Math.ceil(units.length / 2)); }
      else if (!u0.rampage && !rng.chance(0.5)) continue;
      // cible : la cité ou l'armée de joueur faible la plus proche
      const power = U.sum(movers, u => Units.strength(game, u));
      let target = null, best = Infinity;
      for (const c of Object.values(game.cities)) {
        if (c.owner < 0 || c.plane !== u0.plane) continue;
        const d = World.dist(game.world, c.x, c.y, u0.x, u0.y);
        if (d > (u0.rampage ? 12 : 8)) continue;
        const def = U.sum(Units.at(game, c.plane, c.x, c.y), u => Units.strength(game, u)) * (c.buildings.cityWalls ? 1.5 : 1) + Battle.towerStrength(game, c) + 10;
        if (def * (c.fortress ? 2.5 : 1.8) + 20 > power) continue;
        if (game.turn - c.founded < 8) continue;
        if (d < best) { best = d; target = c; }
      }
      if (!target) { if (u0.rampage) { const [dx, dy] = rng.pick(U.DIRS8); await Game.moveGroup(game, movers.map(u => u.id), u0.x + dx, u0.y + dy, { auto: true, noAttack: true }); } continue; }
      if (best > 1 && u0.warned !== target.id && game.players[target.owner]) {
        u0.warned = target.id;
        Game.log(game, target.owner, (u0.rampage ? 'Des monstres en maraude' : 'Des pillards') + ' marchent sur ' + target.name + ' !', { city: target.id, alert: true });
      }
      await Game.moveGroup(game, movers.map(u => u.id), target.x, target.y, { auto: false });
      if (game.over) return;
    }
  },
};
