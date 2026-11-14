'use strict';
// État de la partie, actions du joueur, combats, lieux de pouvoir, héros et trésors.

const GAME_VERSION = '0.31.55';
const FORTRESS_DISMANTLE = 10; // tours pour démanteler une forteresse conquise

const Game = {
  hooks: {
    // remplacés par l'interface ; en test, tout est automatique
    battle: null,          // async (game, battle, info) -> void (le combat doit être terminé au retour)
    notify: (game, pid, msg) => {},
    choose: null,          // async (game, pid, question) -> réponse
    update: () => {},
    fx: null,              // (évènement visible : une faille se referme…) -> void
  },

  // ---------- rythme de la partie (0.31.39) ----------
  // Rapide, Normal, Épique : le coût en production des bâtiments et des unités, la recherche et le lancement des sorts sur la carte,
  // la croissance des cités et les grandes échéances (la Crise, les crises de fin) sont multipliés par ce facteur. Les revenus,
  // l'entretien, les déplacements et les sorts de combat ne changent pas. Les coûts sont ceux des données du jeu, remis à
  // l'échelle à chaque partie ouverte : tout le code (jeu, IA, écrans) lit les mêmes chiffres.
  PACES: { fast: 0.67, normal: 1, epic: 1.5 }, PACE: 1, _paceBase: null,
  pace(game) { return Game.PACES[(game && game.opts && game.opts.pace) || 'normal'] || 1; },
  applyPace(game) {
    const f = Game.pace(game);
    if (f === Game.PACE) return;
    if (!Game._paceBase) {
      const B = Game._paceBase = { b: {}, u: {}, s: {} };
      for (const k in DATA.buildings) B.b[k] = DATA.buildings[k].cost;
      // cost0 : le coût d'origine, pour ce qui s'en sert comme d'une mesure (le rang d'une troupe, la tenue d'un enchantement en combat)
      for (const k in DATA.units) B.u[k] = DATA.units[k].cost0 = DATA.units[k].cost;
      for (const k in DATA.spells) { B.s[k] = { cost: DATA.spells[k].cost, research: DATA.spells[k].research, combatCost: DATA.spells[k].combatCost }; DATA.spells[k].cost0 = DATA.spells[k].cost; }
    }
    const B = Game._paceBase, sc = v => typeof v === 'number' && v > 0 ? Math.max(1, Math.round(v * f)) : v;
    for (const k in B.b) DATA.buildings[k].cost = sc(B.b[k]);
    for (const k in B.u) DATA.units[k].cost = sc(B.u[k]);
    for (const k in B.s) {
      const sp = DATA.spells[k], o = B.s[k];
      sp.research = sc(o.research);
      // le lancement sur la carte suit le rythme ; en combat, le coût d'origine
      sp.cost = sp.overland === false ? o.cost : sc(o.cost);
      sp.combatCost = f !== 1 && o.combatCost == null && sp.combat && sp.overland !== false ? o.cost : o.combatCost;
    }
    Game.PACE = f;
  },

  newGame(opts) {
    const seed = opts.seed != null ? opts.seed : (Math.random() * 2 ** 31) >>> 0;
    const game = {
      version: GAME_VERSION, seed, turn: 1, rng: new RNG(seed), nextId: 1,
      players: [], units: {}, cities: {}, sites: [], world: null,
      log: [], moon: null, moonTurns: 0, difficulty: opts.difficulty || 'normal', opts,
      heroesTaken: {}, over: false, winner: null, popBoom: null, events: [],
      v0259: true, v02516: true,   // migrations déjà sans objet pour une partie neuve
    };
    // montagnes infranchissables sans route : activé par défaut pour les nouvelles parties (les anciennes sauvegardes gardent l'ancienne règle)
    game.opts = Object.assign({}, opts, { mountainsBlock: opts.mountainsBlock !== false });
    Game.applyPace(game);
    MapGen.generate(game, opts);
    // joueurs
    const human = Object.assign({}, opts.human);
    if (!DATA.races[human.race]) human.race = 'highmen';
    human.retorts = (human.retorts || []).filter(r => DATA.retorts[r]);
    human.books = human.books || {};
    const used = new Set([human.portrait]);
    const all = [{ ...human, human: true, color: PLAYER_COLORS[0] }];
    const presets = game.rng.shuffle(DATA.wizards.slice()).filter(w => !used.has(w.portrait));
    const nOpp = opts.opponents != null ? opts.opponents : 3;
    // le joueur choisit ses voisins de plan ; l'autre plan accueille toujours deux sorciers de plus (la surprise des premières parties)
    const nOther = opts.otherPlane != null ? opts.otherPlane : 2;
    const home = human.retorts.includes('myrran') ? 1 : 0;
    for (let i = 0; i < Math.min(presets.length, nOpp + nOther); i++) {
      const w = Game.onPlane(presets[i], i < nOpp ? home : 1 - home);
      const myrran = w.retorts.includes('myrran');
      const races = Object.values(DATA.races).filter(r => r.plane === (myrran ? 'myrror' : 'arcanus'));
      all.push({ name: w.name, portrait: w.portrait, books: w.books, retorts: w.retorts, race: game.rng.pick(races).id, human: false, color: PLAYER_COLORS[i + 1], personality: game.rng.pick(['expansionist', 'militarist', 'perfectionist', 'maniac', 'balanced']) });
    }
    // la difficulté ne donne aucun avantage à l'IA : elle joue plus ou moins bien. En Facile seulement, le joueur part plus riche.
    if (game.difficulty === 'impossible') game.difficulty = 'hardcore';
    if (!AI.LEVELS.includes(game.difficulty)) game.difficulty = 'normal';
    const easy = game.difficulty === 'easy';
    let aiIdx = 0;
    for (const w of all) {
      const lvl = w.human ? null : (opts.aiLevels && opts.aiLevels[aiIdx++]) || game.difficulty;
      const pl = Players.create(game, { name: w.name, portrait: w.portrait, color: w.color, human: w.human, race: w.race, books: w.books, retorts: w.retorts,
        gold: w.human && easy ? 250 : 150, mana: w.human && easy ? 100 : 50, personality: w.personality, plane: w.retorts.includes('myrran') ? 1 : 0, difficulty: game.difficulty });
      if (lvl) pl.aiLevel = lvl;
      Magic.initWizard(game, pl, w.human ? human.startSpells : null);
      if (pl.retorts.includes('famous')) pl.fame = 10;
      Move.ensureFog(game, pl);
    }
    // relations initiales
    for (const a of game.players) for (const b of game.players) if (a !== b) { a.relations[b.id] = 0; a.diplo[b.id] = 'none'; }
    Game.placeStarts(game);
    Game.placeNeutralCities(game);
    Game.placeCaches(game);
    Pacts.place(game);
    Game.softenStarts(game);
    for (const s of game.sites) Game.ensureGuardians(game, s);
    Veil.init(game);
    Crisis.init(game, opts.crisis || 'normal');
    Finale.init(game, opts.finale || 'random');
    Book.place(game);
    for (const pl of game.players) { Move.revealAllFor(game, pl); const fc = game.cities[pl.fortress]; if (fc) Move.reveal(game, pl, fc.plane, fc.x, fc.y, 4); Game.startTurnFor(game, pl); }
    Cities.updateTerritory(game);
    Game.log(game, -1, 'Le monde s\'éveille. Des sorciers rivaux se disputent les deux plans.');
    if (typeof Chronicle !== 'undefined') Chronicle.record(game);   // la chronique commence au premier tour
    return game;
  },

  // un sorcier prédéfini placé sur un plan donné, ses choix ajustés pour rester à 11
  onPlane(w, plane) {
    const my = w.retorts.includes('myrran');
    if (plane === 1 && !my) return Game.asMyrran(w);
    if (plane === 0 && my) return Game.asArcanian(w);
    return w;
  },
  // sans l'aptitude Myrrien, il récupère ses choix en livres de son royaume principal
  asArcanian(w) {
    const c = Object.assign({}, w, { books: Object.assign({}, w.books), retorts: w.retorts.filter(r => r !== 'myrran') });
    const picks = () => U.sum(Object.values(c.books), n => n) + U.sum(c.retorts, r => DATA.retorts[r].cost);
    while (picks() < 11) {
      const realm = U.max(Object.keys(c.books).filter(k => c.books[k] < 11), k => c.books[k]);
      if (!realm) break;
      c.books[realm]++;
    }
    return c;
  },
  // un sorcier prédéfini qui naît sur Myrror : l'aptitude Myrrien remplace ses aptitudes, et il rend des livres pour rester à 11 choix
  asMyrran(w) {
    const c = Object.assign({}, w, { books: Object.assign({}, w.books), retorts: ['myrran'] });
    const picks = () => U.sum(Object.values(c.books), n => n) + U.sum(c.retorts, r => DATA.retorts[r].cost);
    while (picks() > 11) {
      const realm = U.max(Object.keys(c.books).filter(k => c.books[k] > 1), k => c.books[k]);
      if (!realm) break;
      c.books[realm]--;
    }
    return c;
  },
  // parties sauvegardées avec une version antérieure : ajouts sans risque (nouveaux sorts arcaniques, trouvailles)
  upgrade(game) {
    Game.applyPace(game);
    if (!game.caches) game.caches = [];
    // v0.31.18 : plus de palais du gouverneur (seconde capitale retirée du jeu)
    for (const c of Object.values(game.cities || {})) if (c) {
      if (c.buildings) delete c.buildings.governorsPalace;
      if (c.prod && c.prod.type === 'building' && c.prod.id === 'governorsPalace') c.prod = null;
      if (c.queue) c.queue = c.queue.filter(q => !(q && q.type === 'building' && q.id === 'governorsPalace'));
    }
    // v0.30.1 : un nom de cité est du texte, jamais du balisage (Renommer l'acceptait)
    for (const c of Object.values(game.cities || {})) if (c && /[<>]/.test(c.name || '')) c.name = c.name.replace(/<[^>]*>?/g, '').replace(/[<>&"\\]/g, '').trim() || 'Cité';
    // v0.29 : le Livre de légende (placé avec son propre tirage : le reste de la partie n'en change pas)
    if (!game.book && typeof Book !== 'undefined') Book.place(game);
    // v0.27 : chaque sorcier ne connaît d'un lieu que ce que ses troupes y ont vu ; une ancienne partie garde les lieux vidés pour connus
    for (const pl of game.players) if (pl && !pl.siteKnow) { pl.siteKnow = {}; for (const s of game.sites) if (s.cleared) pl.siteKnow[s.id] = { t: game.turn, cleared: true, guards: [], loot: false }; }
    // v0.19 : niveaux d'IA sans triche ; « Impossible » devient « Hardcore »
    if (game.difficulty === 'impossible') game.difficulty = 'hardcore';
    if (!AI.LEVELS.includes(game.difficulty)) game.difficulty = 'normal';
    for (const pl of game.players) if (!pl.human && !pl.aiLevel) pl.aiLevel = game.difficulty;
    for (const c of Object.values(game.cities)) if (c.queue && c.queue.length) Cities.dedupeQueue(c);
    Heroes.fixTalents(game);
    // v0.25.13 : plusieurs propositions diplomatiques peuvent attendre en même temps (une par sorcier)
    for (const pl of game.players) if (pl.diploOffer) { Diplomacy.offer(game, pl, pl.diploOffer); delete pl.diploOffer; }
    // v0.25.9 : la stase d'avant ne se levait jamais ; les volcans se comptent par case
    // (une partie commencée en 0.25.9 ou après n'a rien à corriger, même si le drapeau lui manque)
    const ver = String(game.version || '0').split('.').map(Number), since = (a, b, c) => ver[0] > a || (ver[0] === a && (ver[1] > b || (ver[1] === b && (ver[2] || 0) >= c)));
    if (!game.v0259 && since(0, 25, 9)) game.v0259 = true;
    if (!game.v0259) {
      game.v0259 = true;
      for (const u of Object.values(game.units)) delete u.stasis;
      for (const pl of game.players) delete pl.volcanoes;
    }
    // v0.25.16 : les Canaux noirs ne marquent plus l'unité comme morte-vivante pour toujours (c'est l'enchantement qui compte) ;
    // une unité restée à 0 PV après la perte d'un enchantement de vie retrouve 1 PV
    if (!game.v02516) {
      game.v02516 = true;
      for (const u of Object.values(game.units)) { if (u.undead && u.ench && u.ench.includes('black_channels')) u.undead = false; Units.fixHp(game, u); }
    }
    // v0.28.10 : les héros appelés par un sort arrivent au niveau de l'époque ; l'Élu incarné plus tôt rattrape ce niveau
    if (!game.v02810) {
      game.v02810 = true;
      const xp = HERO_LEVELS[Heroes.eraLevel(game)].xp;
      for (const u of Object.values(game.units)) if (u.type === 'HeroTorin' && u.hero && (u.xp || 0) < xp) u.xp = xp;
    }
    // v0.28.11 : un héros aguerri sait d'emblée de sa légende ce que son rang permet ; l'Élu monté d'un coup en 0.28.10 l'apprend ici
    if (!game.v02811) {
      game.v02811 = true;
      for (const u of Object.values(game.units)) if (u.type === 'HeroTorin' && u.hero) Heroes.legendCheck(game, u, true);
    }
    // v0.17.2 : colons ramenés à des PV de civils ; une blessure ancienne ne doit pas les tuer au chargement
    for (const u of Object.values(game.units)) if (u.dmg > 0 && DATA.units[u.type] && DATA.units[u.type].abilities && DATA.units[u.type].abilities.createOutpost) { const m = Units.stats(game, u).maxHp; if (u.dmg >= m) u.dmg = m - 1; }
    Veil.init(game);
    if (!game.startsSoftened && game.turn <= 80) Game.softenStarts(game);
    if (!game.pactsPlaced) Pacts.place(game);
    if (!game.crisis) { Crisis.init(game, 'normal'); game.crisis.at = Math.max(game.crisis.at, game.turn + 50); }
    if (!game.finale) Finale.init(game, 'random');   // v0.31.30 : les crises de fin
    for (const u of Object.values(game.units)) if (u.hero && !u.avatar) {
      if (u.hero.lvlSeen == null) u.hero.lvlSeen = Heroes.rawLevel(u);
      // v0.19.3 : les anciennes quêtes en cours deviennent des légendes
      if (!u.hero.quest || (!u.hero.quest.done && u.hero.quest.type !== 'legend')) Heroes.assignQuest(game, u);
    }
    // v0.20.9 : une tour prise d'un côté libère sa jumelle
    for (const t of game.sites) if (t.type === 'tower' && t.cleared) for (const tw of game.sites) if (tw !== t && tw.type === 'tower' && tw.x === t.x && tw.y === t.y && !tw.cleared) { tw.cleared = true; tw.guardians = []; }
    // v0.19.5 : les repaires de légende créés plus tôt reprennent des gardiens à la nouvelle mesure
    for (const s of game.sites) if (s.legend && !s.cleared && !s.legendV) {
      const h = game.units[s.legend.hero];
      s.budget = Heroes.legendBudget(game, h ? game.players[h.owner] : null); s.guardians = null; Game.ensureGuardians(game, s); s.legendV = 2;
    }
    for (const pl of game.players) {
      if (!pl.known || !pl.researchPool) continue;
      for (const s of Magic.spellsOf('arcane')) if (!(s.params && s.params.gate) && !pl.known.includes(s.id) && !pl.researchPool.includes(s.id)) pl.researchPool.push(s.id);
      // (0.31.37) Ouvrir une faille n'est plus offert à tous : retiré des recherches de qui ne l'a ni appris, ni entamé
      if (!pl.known.includes('open_rift') && pl.researching !== 'open_rift') { pl.researchPool = pl.researchPool.filter(id => id !== 'open_rift'); if (pl.researchOptions) pl.researchOptions = pl.researchOptions.filter(id => id !== 'open_rift'); }
    }
    return game;
  },

  log(game, pid, text, ref) {
    const e = { turn: game.turn, pid, text, ref: ref || null };
    // dans une autre langue, le texte français à côté : le ton du message (sons, alertes) se juge sur lui
    if (typeof I18N !== 'undefined' && I18N.dict) { const fr = I18N.fr(text); if (fr !== text) e.fr = fr; }
    game.log.push(e);
    if (game.log.length > 400) game.log.splice(0, game.log.length - 400);
    if (Game.hooks.notify) Game.hooks.notify(game, pid, e);
    return e;
  },

  // ---------- départs ----------
  placeStarts(game) {
    const world = game.world, rng = game.rng;
    const minD = Math.max(9, Math.round(14 * Math.sqrt(world.w * world.h / 2400)));
    for (const pl of game.players) {
      const p = pl.plane;
      let best = null, bestScore = -1;
      const cands = MapGen.landTiles(world, p, (t, x, y) => [T.GRASS, T.FOREST, T.HILLS, T.RIVER].includes(t) && y > 4 && y < world.h - 5);
      // assez de terre autour pour s'étendre (pas un îlot de deux cases)
      const landOK = (x, y) => { const seen = new Set([y * world.w + x]), q = [[x, y]]; while (q.length && seen.size < 15) { const [cx, cy] = q.pop(); for (const [nx, ny] of World.neighbors(world, cx, cy)) { const k = ny * world.w + nx; if (!seen.has(k) && !World.isWaterAt(world, p, nx, ny)) { seen.add(k); q.push([nx, ny]); } } } return seen.size >= 15; };
      const distOK = (x, y, d) => Object.values(game.cities).every(c => c.plane !== p || World.dist(world, c.x, c.y, x, y) >= d) && game.sites.every(s => s.plane !== p || World.dist(world, s.x, s.y, x, y) >= 3);
      // l'écart voulu entre capitales, puis de moins en moins si la carte est petite, jamais moins de 5 cases
      for (const d of [minD, Math.round(minD * 0.75), Math.round(minD * 0.55), 6, 5]) {
        for (let k = 0; k < 400 && cands.length; k++) {
          const [x, y] = rng.pick(cands);
          if (World.get(world, p, 'site', x, y) >= 0 || !distOK(x, y, d) || !landOK(x, y)) continue;
          let food = 0, land = 0;
          for (const [cx, cy] of World.catchment(world, x, y)) { food += World.foodOf(world, p, cx, cy); if (!World.isWaterAt(world, p, cx, cy)) land++; }
          let coast = 0; for (const [nx, ny] of World.neighbors(world, x, y)) if (World.terr(world, p, nx, ny) === T.OCEAN) coast = 1;
          const score = food + land * 0.2 + coast * 2 + rng.next();
          if (score > bestScore) { bestScore = score; best = [x, y]; }
        }
        if (best) break;
      }
      // dernier recours : la case libre la plus éloignée des autres capitales
      if (!best) best = U.max(cands.filter(([x, y]) => World.get(world, p, 'site', x, y) < 0 && !Cities.at(game, p, x, y)), ([x, y]) => Math.min(99, ...Object.values(game.cities).filter(c => c.plane === p).map(c => World.dist(world, c.x, c.y, x, y)))) || rng.pick(cands);
      const [x, y] = best;
      const c = Cities.create(game, pl.id, pl.race, p, x, y, { fortress: true, pop: 4000, buildings: ['barracks', 'smithy'] });
      pl.fortress = c.id; pl.summonCity = c.id;
      Cities.setProduction(game, c, { type: 'building', id: 'buildersHall' });
      const race = DATA.races[pl.race];
      const spear = race.units.find(t => DATA.units[t].en === 'Spearmen') || race.units[0];
      const settler = race.units.find(t => DATA.units[t].abilities.createOutpost);
      const sword = race.units.find(t => DATA.units[t].en === 'Swordsmen');
      Units.create(game, spear, pl.id, p, x, y);
      Units.create(game, spear, pl.id, p, x, y);
      if (settler) Units.create(game, settler, pl.id, p, x, y);
      // un éclaireur pour partir à la découverte dès le premier tour
      const scout = race.units.find(t => DATA.units[t].abilities.scout);
      if (scout) Units.create(game, scout, pl.id, p, x, y);
    }
  },
  // ---------- prévision de bataille ----------
  // Simule n combats automatiques sur des copies, avec un tirage indépendant (la partie n'est pas affectée).
  forecast(game, ids, plane, x, y, n = 16, opts = {}) {
    const att = ids.map(id => game.units[id]).filter(Boolean);
    if (!att.length) return null;
    const pid = att[0].owner;
    // opts.defenders : les forces telles qu'un rapport les décrivait (case hors de vue)
    // les unités invisibles pour l'attaquant ne figurent pas dans sa prévision
    const defs = opts.defenders || AI.defendersAt(game, pid, plane, x, y).filter(u => !Intel.hiddenFrom(game, pid, u));
    const city = Cities.at(game, plane, x, y);
    // une forteresse vide se défend encore par la tour du sorcier : on simule le combat
    const spire = !!(city && city.owner !== pid && Battle.spire(game, city));
    if (!defs.length && !spire) return city && city.owner !== pid ? { win: 1, lossAvg: 0, n: 0, empty: true, losses: {} } : null;
    const si = World.get(game.world, plane, 'site', x, y);
    const site = si >= 0 ? game.sites[si] : null;
    let seed = (game.turn * 7919 + x * 131 + y * 17 + plane) >>> 0;
    for (const u of att) seed = (seed * 31 + u.id * 7 + u.dmg) >>> 0;
    const rng = new RNG(seed);
    const clone = u => Object.assign(JSON.parse(JSON.stringify(u)), { id: -(++game.simId) });
    game.simId = game.simId || 0;
    let wins = 0, lost = 0, hpLost = 0;
    const losses = {};
    const hp0 = U.sum(att, u => Units.health(game, u));
    for (let i = 0; i < n; i++) {
      const A = att.map(clone), D = defs.map(clone);
      const b = new Battle(game, { attackers: A, defenders: D, attackerPid: pid, defenderPid: D.length ? D[0].owner : city.owner, plane, x, y, city, site, sim: true, rng });
      CombatAI.autoResolve(b);
      for (const bu of b.units) if (bu.temp) delete game.units[bu.u.id];
      if (b.winner === ATT_SIDE) wins++;
      A.forEach((cu, k) => {
        const bu = b.units.find(o => o.u === cu);
        const dead = !bu || bu.dead;
        if (dead) { lost++; losses[cu.type] = (losses[cu.type] || 0) + 1; }
        hpLost += Math.max(0, Units.health(game, att[k]) - (dead ? 0 : Units.health(game, cu)));
      });
    }
    return { win: wins / n, lossAvg: lost / n, hpPct: hp0 ? Math.min(1, hpLost / n / hp0) : 0, n, losses, defenders: defs.length };
  },
  forecastLabel(f) {
    if (!f) return '';
    if (f.empty) return 'Cité sans défenseurs : prise assurée.';
    const verdict = 'chances de victoire ' + Game.chanceWord(f.win);
    const k = Math.round(f.lossAvg);
    const l = f.lossAvg < 0.15 ? 'pertes négligeables' : f.lossAvg < 0.6 ? 'quelques pertes possibles' : 'environ ' + k + ' unité' + (k > 1 ? 's' : '') + ' perdue' + (k > 1 ? 's' : '');
    return verdict + ', ' + l;
  },
  // une estimation, pas un calcul au pourcent près
  chanceWord(p) { return p >= .95 ? 'extrêmement favorables' : p >= .8 ? 'très favorables' : p >= .65 ? 'bonnes' : p >= .4 ? 'moyennes' : p >= .2 ? 'faibles' : p >= .05 ? 'très faibles' : 'quasi nulles'; },

  // ---------- trouvailles : petits trésors sans gardiens, ramassés en passant ----------
  // Chaque capitale en a cinq à portée d'éclaireur (la première à deux ou trois pas), et d'autres sont semées sur les deux plans.
  CACHE: {
    gold: { name: 'Coffre abandonné', near: [30, 50], far: [45, 85] },
    mana: { name: 'Éclats de cristal', near: [20, 35], far: [30, 60] },
    materials: { name: 'Bois et pierres de taille', near: [20, 30], far: [25, 40] },
    grain: { name: 'Grenier oublié', near: [400, 600], far: [500, 800] },
    lore: { name: 'Parchemins anciens', near: [25, 40], far: [35, 70] },
    map: { name: 'Carte ancienne', near: [6, 6], far: [7, 7] },
    recruits: { name: 'Volontaires', near: [1, 1], far: [1, 1] },
  },
  cacheFree(game, p, x, y) {
    const world = game.world, t = World.terr(world, p, x, y);
    if (World.isWater(t) || t === T.SNODE || t === T.NNODE || t === T.CNODE) return false;
    if (t === T.MOUNTAIN && Move.mountainsBlock(game) && !World.hasRoad(world, p, x, y)) return false;
    if (World.get(world, p, 'site', x, y) >= 0 || Cities.at(game, p, x, y)) return false;
    return !(game.caches || []).some(c => c.plane === p && World.dist(world, c.x, c.y, x, y) < 3);
  },
  // cases de terre atteignables à pied depuis (x, y), avec le nombre de pas
  reachableLand(game, p, x, y, maxSteps) {
    const world = game.world, out = new Map([[y * world.w + x, 0]]), q = [[x, y]];
    const block = Move.mountainsBlock(game);
    while (q.length) {
      const [cx, cy] = q.shift(), d = out.get(cy * world.w + cx);
      if (d >= maxSteps) continue;
      for (const [nx, ny] of World.neighbors(world, cx, cy)) {
        const k = ny * world.w + nx; if (out.has(k)) continue;
        const t = World.terr(world, p, nx, ny);
        if (World.isWater(t) || (block && t === T.MOUNTAIN && !World.hasRoad(world, p, nx, ny))) continue;
        out.set(k, d + 1); q.push([nx, ny]);
      }
    }
    return out;
  },
  addCache(game, p, x, y, kind, far) {
    const rng = game.rng, r = Game.CACHE[kind][far ? 'far' : 'near'];
    let amt = r[0] + rng.int(r[1] - r[0] + 1);
    if (kind === 'gold' || kind === 'mana' || kind === 'materials' || kind === 'lore') amt = Math.round(amt / 5) * 5;
    if (kind === 'grain') amt = Math.round(amt / 50) * 50;
    game.caches.push({ plane: p, x, y, kind, amt });
  },
  placeCaches(game) {
    const world = game.world, rng = game.rng;
    game.caches = [];
    const rings = [[2, 3], [3, 5], [4, 7], [5, 9], [6, 11]];
    for (const pl of game.players) {
      const c = game.cities[pl.fortress]; if (!c) continue;
      const reach = Game.reachableLand(game, c.plane, c.x, c.y, 13);
      const first = rng.pick(['gold', 'materials']);
      const extra = rng.shuffle(['mana', 'lore', 'map', 'recruits', 'mana', 'lore']);
      const kinds = [first, first === 'gold' ? 'materials' : 'gold', 'grain', extra[0], extra.find(k => k !== extra[0])];
      rings.forEach(([d0, d1], i) => {
        const cands = [];
        for (const [k, steps] of reach) {
          const x = k % world.w, y = Math.floor(k / world.w);
          const d = World.dist(world, x, y, c.x, c.y);
          if (d >= d0 && d <= d1 && steps <= d1 + 2 && Game.cacheFree(game, c.plane, x, y)) cands.push([x, y]);
        }
        if (cands.length) { const [x, y] = rng.pick(cands); Game.addCache(game, c.plane, x, y, kinds[i], false); }
      });
    }
    // semis sur les deux plans, loin des capitales
    const capitals = game.players.map(pl => game.cities[pl.fortress]).filter(Boolean);
    for (const p of [0, 1]) {
      const land = MapGen.landTiles(world, p);
      const n = Math.round(land.length / (p ? 150 : 95));
      for (let i = 0; i < n; i++) {
        for (let tries = 0; tries < 40; tries++) {
          const [x, y] = rng.pick(land);
          if (!Game.cacheFree(game, p, x, y) || capitals.some(c => c.plane === p && World.dist(world, c.x, c.y, x, y) < 7)) continue;
          const kind = rng.weighted(['gold', 'mana', 'materials', 'grain', 'lore', 'map', 'recruits'], k => ({ gold: 3, mana: 2, materials: 2, grain: 2, lore: 2, map: 1, recruits: 1 }[k]));
          Game.addCache(game, p, x, y, kind, true);
          break;
        }
      }
    }
  },
  cacheAt(game, p, x, y) { return (game.caches || []).find(c => c.plane === p && c.x === x && c.y === y) || null; },
  // une unité du joueur entre sur la case : la trouvaille est ramassée et profite à la cité la plus proche quand il le faut
  collectCache(game, pl, units, p, x, y) {
    const cc = pl && Game.cacheAt(game, p, x, y); if (!cc) return null;
    game.caches.splice(game.caches.indexOf(cc), 1);
    const world = game.world, rng = game.rng;
    const home = U.min(Cities.ofPlayer(game, pl.id), c => (c.plane !== p ? 1000 : 0) + World.dist(world, c.x, c.y, x, y));
    let txt, gain;
    const asGold = (n, why) => { pl.gold += n; txt = n + ' pièces d\'or' + (why ? ' (' + why + ')' : ''); gain = '+' + n + ' or'; };
    switch (cc.kind) {
      case 'gold': asGold(cc.amt); break;
      case 'mana': pl.mana += cc.amt; txt = cc.amt + ' cristaux de mana'; gain = '+' + cc.amt + ' mana'; break;
      case 'materials': {
        const cost = home ? Cities.prodCost(game, home) : 0, room = home ? Math.max(0, cost - home.progress) : 0;
        if (!home || room <= 0) { asGold(cc.amt * 2, 'matériaux revendus'); break; }
        const used = Math.min(room, cc.amt);
        home.progress += used;
        txt = used + ' de production pour ' + home.name + ' (' + Cities.prodName(home) + ')';
        gain = '+' + used + ' production';
        if (used < cc.amt) { pl.gold += (cc.amt - used) * 2; txt += ', le reste revendu ' + (cc.amt - used) * 2 + ' or'; }
        break;
      }
      case 'grain': {
        if (!home) { asGold(Math.round(cc.amt / 10), 'grain revendu'); break; }
        const e = Cities.econ(game, home), room = Math.max(0, e.maxPop * 1000 - home.pop);
        if (room <= 0) { asGold(Math.round(cc.amt / 10), 'grain revendu'); break; }
        const oldN = Cities.citizens(home), add = Math.min(room, cc.amt);
        home.pop += add;
        txt = 'des vivres pour ' + home.name + ' : ' + add + ' habitants de plus';
        gain = '+' + add + ' hab.';
        if (Cities.citizens(home) !== oldN && home.autoFarmers) Cities.resetFarmers(game, home);
        break;
      }
      case 'lore':
        if (pl.researching) { pl.researchProgress += cc.amt; txt = cc.amt + ' points de recherche (' + DATA.spells[pl.researching].name + ')'; gain = '+' + cc.amt + ' recherche'; }
        else { pl.mana += cc.amt; txt = cc.amt + ' cristaux de mana (aucune recherche en cours)'; gain = '+' + cc.amt + ' mana'; }
        break;
      case 'map': {
        // la carte montre une région encore inconnue, à quelques jours de marche
        const ex = pl.explored && pl.explored[p];
        let best = null, bs = -1;
        for (let k = 0; k < 60; k++) {
          const tx = World.wx(world, x + rng.int(27) - 13), ty = U.clamp(y + rng.int(27) - 13, 2, world.h - 3);
          const d = World.dist(world, tx, ty, x, y); if (d < 6) continue;
          let unk = 0; if (ex) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const yy = ty + dy; if (yy >= 0 && yy < world.h && !ex[yy * world.w + World.wx(world, tx + dx)]) unk++; }
          const sc = unk + (World.isWaterAt(world, p, tx, ty) ? 0 : 6) + rng.next();
          if (sc > bs) { bs = sc; best = [tx, ty]; }
        }
        if (best) Move.reveal(game, pl, p, best[0], best[1], cc.amt);
        txt = 'une carte qui dévoile une région lointaine'; gain = 'carte';
        if (best) cc.reveal = best;
        break;
      }
      case 'recruits': {
        const race = DATA.races[home ? home.race : pl.race];
        const t = race && race.units.find(u => DATA.units[u].en === 'Spearmen');
        if (!t || Move.stackCount(game, p, x, y, pl.id) >= MAX_STACK) { asGold(40, 'les volontaires repartent avec vos remerciements'); break; }
        const u = Units.create(game, t, pl.id, p, x, y); u.moves = 0;
        txt = 'des ' + DATA.units[t].name.toLowerCase() + ' se joignent à vous'; gain = '+1 unité';
        break;
      }
    }
    Game.log(game, pl.id, 'Trouvaille : ' + Game.CACHE[cc.kind].name.toLowerCase() + ', ' + txt + '.', { x, y, plane: p, cache: cc.kind, gain, reveal: cc.reveal || null });
    return cc;
  },
  placeNeutralCities(game) {
    const world = game.world, rng = game.rng;
    for (const p of [0, 1]) {
      const races = Object.values(DATA.races).filter(r => r.plane === (p ? 'myrror' : 'arcanus'));
      const n = Math.max(4, Math.round((7 + rng.int(4)) * world.w * world.h / 2400));
      for (let i = 0; i < n; i++) {
        const cands = MapGen.landTiles(world, p, (t, x, y) => [T.GRASS, T.FOREST, T.HILLS, T.RIVER, T.DESERT].includes(t) && World.get(world, p, 'site', x, y) < 0);
        for (let k = 0; k < 60; k++) {
          const [x, y] = rng.pick(cands);
          let ok = true;
          for (const c of Object.values(game.cities)) if (c.plane === p && World.dist(world, c.x, c.y, x, y) < (c.owner >= 0 ? 7 : 5)) ok = false;
          if (!ok) continue;
          const race = rng.pick(races);
          const pop = (1 + rng.int(7)) * 1000;
          const blds = ['barracks', 'buildersHall'];
          if (pop >= 3000) blds.push('smithy');
          if (pop >= 5000) blds.push('shrine', 'library');
          if (pop >= 7000 && rng.chance(0.5)) blds.push('cityWalls');
          if (blds.includes('cityWalls') && (x * 7 + y * 3) % 3 === 0) blds.push('defenseTowers');
          const c = Cities.create(game, -1, race.id, p, x, y, { pop, buildings: blds });
          const units = race.units.filter(t => !DATA.units[t].abilities.createOutpost && !DATA.units[t].abilities.construction && !DATA.units[t].abilities.scout && !DATA.units[t].abilities.siegeOnly && !DATA.units[t].sailing && (DATA.units[t].cost0 ?? DATA.units[t].cost) <= 60);
          const ng = 1 + Math.floor(pop / 2500) + rng.int(2);
          for (let j = 0; j < ng; j++) Units.create(game, rng.pick(units), -1, p, x, y);
          break;
        }
      }
    }
  },

  // ---------- abords des capitales ----------
  // Ajout d'Arcanes : autour de chaque forteresse, quelques lieux à la portée de l'armée de départ (squelettes, fées,
  // un chien infernal, un ours…), pas de repaire redoutable, et le nœud le plus proche peu gardé. Le reste du monde garde
  // sa dureté d'origine.
  softenStarts(game) {
    if (game.startsSoftened) return;
    game.startsSoftened = true;
    const w = game.world, rng = game.rng;
    const VERY_EASY = [['Skeleton'], ['Sprites'], ['Skeleton']], EASY = [['HellHounds'], ['WarBear'], ['Ghoul'], ['Sprites', 'Skeleton']];
    const NODE_EASY = { sorcery: ['Nagas'], nature: ['WarBear'], chaos: ['HellHounds'] };
    const cost = list => U.sum(list, t => DATA.units[t].castCost);
    for (const pl of game.players) {
      const fc = game.cities[pl.fortress]; if (!fc) continue;
      const p = fc.plane;
      const near = r => game.sites.filter(s => s.plane === p && !s.cleared && s.type !== 'node' && s.type !== 'tower' && !['rift', 'shrine', 'breach', 'tomb'].includes(s.type) && World.dist(w, s.x, s.y, fc.x, fc.y) <= r)
        .sort((a, b) => World.dist(w, a.x, a.y, fc.x, fc.y) - World.dist(w, b.x, b.y, fc.x, fc.y));
      // au moins trois lieux à moins de 7 cases : on en crée si besoin
      for (let tries = 0; near(7).length < 3 && tries < 60; tries++) {
        const x = World.wx(w, fc.x + rng.range(-7, 7)), y = fc.y + rng.range(-7, 7);
        const d = World.dist(w, x, y, fc.x, fc.y);
        if (d < 3 || !World.inY(w, y) || y < 2 || y >= w.h - 2 || World.isWaterAt(w, p, x, y)) continue;
        const t = World.terr(w, p, x, y); if (t === T.MOUNTAIN || t === T.VOLCANO || NODE_REALM[t]) continue;
        if (!MapGen.farFromSites(game, p, x, y, 3) || Object.values(game.cities).some(c => c.plane === p && World.dist(w, c.x, c.y, x, y) < 3)) continue;
        if ((game.caches || []).some(k => k.plane === p && k.x === x && k.y === y)) continue;
        MapGen.addSite(game, { type: rng.pick(['ruins', 'cave', 'keep', 'lair']), plane: p, x, y, cleared: false, guardians: null, budget: 60, tier: 1 });
      }
      const list = near(7);
      list.forEach((s, i) => {
        if (i < 2) { s.guardians = rng.pick(VERY_EASY).slice(); s.tier = 1; }
        else if (i < 4) { s.guardians = rng.pick(EASY).slice(); s.tier = 1; }
        else if ((s.tier || 1) > 2) { s.tier = 2; s.budget = 180 + rng.int(150); s.guardians = null; }
        if (s.guardians) { s.budget = Math.max(50, cost(s.guardians)); s.realmG = DATA.units[s.guardians[0]].realm; }
      });
      // le nœud le plus proche (9 cases au plus) : un seul gardien de son royaume
      const node = U.min(game.sites.filter(s => s.type === 'node' && s.plane === p && !s.cleared && World.dist(w, s.x, s.y, fc.x, fc.y) <= 9), s => World.dist(w, s.x, s.y, fc.x, fc.y));
      if (node && (!node.guardians || node.guardians.length)) { node.guardians = (NODE_EASY[node.realm] || ['Skeleton']).slice(); node.budget = Math.max(80, cost(node.guardians)); node.realmG = node.realm; node.weakGuard = true; }
    }
    for (const s of game.sites) if (!s.guardians && !s.cleared) Game.ensureGuardians(game, s);
  },

  // ---------- gardiens des lieux ----------
  ensureGuardians(game, s) {
    if (s.guardians || s.cleared) return;
    // une tour de sorcellerie est une seule et même tour sur les deux plans : mêmes gardiens des deux côtés
    if (s.type === 'tower') { const tw = game.sites.find(o => o !== s && o.type === 'tower' && o.x === s.x && o.y === s.y && o.guardians); if (tw) { s.guardians = tw.guardians.slice(); s.budget = tw.budget; s.realmG = tw.realmG; return; } }
    const rng = game.rng;
    let realms;
    if (s.type === 'node') realms = [s.realm];
    else realms = { cave: ['nature', 'chaos'], ruins: ['death', 'chaos'], temple: ['life', 'sorcery'], keep: ['death', 'life'], dungeon: ['death', 'chaos'], fallenTemple: ['death', 'sorcery'], lair: ['nature', 'chaos', 'death'], tower: ['life', 'death', 'chaos', 'nature', 'sorcery'] }[s.type] || ['chaos'];
    let budget = s.budget;
    if (s.type === 'node') budget = s.power * (s.plane ? 40 : 30) + rng.int(100);
    if (s.type === 'tower') budget = s.budget > 0 ? s.budget : 600 + rng.int(600);
    s.budget = budget;
    const realm = s.forceRealm || rng.pick(realms);
    const pool = Object.values(DATA.units).filter(u => u.race === 'fantastic' && u.realm === realm && u.castCost > 0 && !['MagicSpirit', 'GuardianSpirit', 'FloatingIsland', 'PhantomWarrior', 'PhantomBeast', 'AirElemental', 'EarthElemental', 'FireElemental', 'Demon'].includes(u.id));
    const g = [];
    let left = budget;
    // une créature principale puis des renforts moins chers
    const affordable = () => pool.filter(u => u.castCost <= left);
    let main = U.max(affordable(), u => u.castCost + rng.next() * 50);
    if (!main) main = U.min(pool, u => u.castCost);
    if (main) { g.push(main.id); left -= main.castCost; }
    while (g.length < 7 && affordable().length) {
      const c = rng.pick(affordable()); g.push(c.id); left -= c.castCost;
      if (!s.legend && rng.chance(0.15)) break; // le repaire d'une légende est gardé jusqu'au bout de son budget
    }
    if (!g.length && pool.length) g.push(U.min(pool, u => u.castCost).id);
    s.guardians = g; s.realmG = realm;
    if (s.type === 'node' && rng.chance(0.25) && s.power < 8) { s.guardians = []; }
  },
  siteName(s) {
    return { cave: 'Grotte', ruins: 'Ruines', temple: 'Temple ancien', keep: 'Donjon abandonné', dungeon: 'Souterrain', fallenTemple: 'Temple déchu', lair: 'Antre de monstres', tower: 'Tour de sorcellerie', tomb: s.relic && s.relic.wizard ? 'Tombeau de ' + s.relic.wizard : 'Tombeau de sorcier', rift: 'Faille entre les plans', breach: 'la Brèche', phylactery: 'Phylactère du Seigneur liche', citadel: 'Citadelle de l\'Archimage', winterheart: 'Cœur de l\'Hiver', shrine: s.entity ? 'Sanctuaire de ' + Pacts.ENT[s.entity].name : 'Sanctuaire d\'une puissance', node: (s.realm === 'sorcery' ? 'Nœud de sorcellerie' : s.realm === 'nature' ? 'Nœud de nature' : 'Nœud de chaos') }[s.type] || 'Lieu mystérieux';
  },
  siteHasGuardians(s) { return !s.cleared && s.guardians && s.guardians.length > 0; },
  // ---------- ce qu'un sorcier sait des lieux : rien tant que ses troupes n'y sont pas entrées (comme dans l'original) ----------
  LAIR_TYPES: new Set(['cave', 'ruins', 'temple', 'keep', 'dungeon', 'fallenTemple', 'lair', 'tower', 'tomb', 'breach', 'node', 'phylactery', 'citadel', 'winterheart']),
  // un lieu dont le contenu se découvre en y entrant (un nœud déjà lié se voit à son aura : il n'a plus rien à cacher)
  isLair(s) { return !!s && Game.LAIR_TYPES.has(s.type) && !s.closed && !(s.type === 'node' && s.owner >= 0); },
  siteKnown(pl, s) { return pl && pl.siteKnow && s ? pl.siteKnow[s.id] || null : null; },
  knownCleared(pl, s) { if (!pl || !pl.siteKnow) return !!s.cleared; const k = pl.siteKnow[s.id]; return !!(k && k.cleared); },
  noteSite(game, pid, s) {
    const pl = game.players[pid]; if (!pl || !s || !pl.siteKnow) return;
    const rec = o => ({ t: game.turn, cleared: !!o.cleared, guards: o.cleared ? [] : (o.guardians || []).slice(), loot: !o.cleared && !!o.lootPending });
    pl.siteKnow[s.id] = rec(s);
    // une tour de sorcellerie est la même sur les deux plans
    if (s.type === 'tower') for (const tw of game.sites) if (tw !== s && tw.type === 'tower' && tw.x === s.x && tw.y === s.y) pl.siteKnow[tw.id] = rec(tw);
  },
  // après une bataille ou un pillage : l'acteur sait ce qu'il en est ; qui voit la case apprend seulement que le lieu est vidé
  siteChanged(game, s, pid) {
    for (const pl of game.players) {
      if (!pl || !pl.alive || !pl.siteKnow) continue;
      if (pl.id === pid) Game.noteSite(game, pl.id, s);
      else if (s.cleared && Intel.sees(game, pl, s.plane, s.x, s.y)) Game.noteSite(game, pl.id, s);
    }
  },
  // case voisine où une pile en retraite peut se replier : libre d'ennemis, sans cité étrangère ni repaire gardé, praticable,
  // de la place dans la pile ; de préférence loin de l'assaillant (from) et dans une cité amie. null : aucune issue.
  fleeSpot(game, units, plane, x, y, owner, from) {
    if (!units.length) return null;
    const gi = Move.groupInfo(game, units);
    let best = null, bs = -Infinity;
    for (const [nx, ny] of World.neighbors(game.world, x, y)) {
      const here = Units.at(game, plane, nx, ny);
      if (here.some(u => u.owner !== owner)) continue;
      const c = Cities.at(game, plane, nx, ny); if (c && c.owner !== owner) continue;
      const si = World.get(game.world, plane, 'site', nx, ny); if (si >= 0 && Game.siteHasGuardians(game.sites[si])) continue;
      if (here.length + units.length > MAX_STACK) continue;
      if (!Move.canStand(game, units, gi, plane, nx, ny, owner)) continue;
      const sc = (from ? World.dist(game.world, nx, ny, from[0], from[1]) : 0) * 10 + (c ? 5 : 0) + ((nx * 7 + ny * 13) % 5) * 0.1;
      if (sc > bs) { bs = sc; best = [nx, ny]; }
    }
    return best;
  },

  // ---------- début de tour d'un joueur ----------
  startTurnFor(game, pl) {
    pl.skillLeft = Magic.totalSkill(game, pl);
    // l'incantation en cours prend d'abord ce qu'il lui faut de la compétence du tour ; le reste sert à d'autres sorts dans la foulée
    // (rien ne s'accumule d'un tour à l'autre). Figé par l'Arrêt du temps d'un autre, le sorcier n'avance pas.
    if (pl.casting && !game.players.some(o => o && o.alive && o !== pl && o.globals.includes('time_stop'))) Spells.progressCasting(game, pl);
    for (const c of Object.values(game.cities)) if (c.owner === pl.id) Move.reveal(game, pl, c.plane, c.x, c.y, Move.citySight(c));   // Œil de la nature, Oracle : ce que voit la cité s'inscrit sur la carte
    Cities.rebalanceFood(game, pl.id);
    for (const u of Object.values(game.units)) if (u.owner === pl.id) {
      u.moves = Units.maxMoves(game, u);
      // stase : figée au moins un tour, puis un jet de résistance à −5 par tour pour s'en libérer
      if (u.stasis) {
        const free = u.stasis > 1 && game.rng.int(10) + 1 <= Spells.resVs(game, u, 'sorcery') - 5;
        if (free) { Game.stasisFreed(game, u); Game.log(game, pl.id, Units.subj(u, 'se libère') + ' de la stase.', { unit: u.id, minor: true }); }
        else { u.stasis = 2; u.moves = 0; }
      }
    }
    for (const c of Cities.ofPlayer(game, pl.id)) c.sold = false;
  },

  // une unité sort de la stase : le sorcier qui l'y avait figée l'apprend
  stasisFreed(game, u) {
    const by = u.stasisBy; delete u.stasis; delete u.stasisBy;
    if (by != null && game.players[by] && by !== u.owner) Game.log(game, by, Units.subj(u, 'se libère') + ' de votre stase.', { x: u.x, y: u.y, plane: u.plane, minor: true });
  },
  // ---------- déplacements ----------
  unitsOf(game, ids) { return ids.map(id => game.units[id]).filter(Boolean); },

  // déplace un groupe vers une destination (exécute ce qui est possible ce tour)
  async moveGroup(game, ids, tx, ty, opts = {}) {
    let units = Game.unitsOf(game, ids);
    if (!units.length) return { ok: false, why: 'Aucune unité.' };
    const pid = units[0].owner, pl = game.players[pid];
    const plane = units[0].plane;
    tx = World.wx(game.world, tx);
    const path = Move.findPath(game, units, plane, tx, ty, { omniscient: !pl });
    if (!path) {
      if (Move.blockedMountain(game, plane, tx, ty) && !Move.mountainOK(game, units, Move.groupInfo(game, units))) return { ok: false, why: 'Montagne infranchissable sans route : seuls les volants, les montagnards et les ingénieurs y vont.' };
      return { ok: false, why: 'Aucun chemin.' };
    }
    // attackOrder : l'attaque de la destination a été voulue (et confirmée) ; elle aura lieu même si l'on y arrive au tour suivant
    const order = opts.attackOrder ? Game.attackTarget(game, pid, plane, tx, ty) || false : false;
    for (const u of units) { u.path = path.map(p => [p.x, p.y]); u.dest = [tx, ty]; u.status = 'goto'; u.attackOrder = order; delete u.rallyHold; }
    return Game.continueMove(game, ids, opts);
  },

  // une case pleine traversée (souvent une cité amie) où le groupe reste arrêté (attaque perdue, marche stoppée) : il revient d'où il venait,
  // pour ne jamais laisser plus de 9 unités sur une case
  async continueMove(game, ids, opts = {}) {
    const r = await Game.marchOn(game, ids, opts);
    // (le groupe revient entier : on ne le coupe pas en deux pour tomber pile à 9)
    const stuck = Game.unitsOf(game, ids).filter(u => u.jam && u.plane === u.jam[0] && u.x === u.jam[3] && u.y === u.jam[4]);
    if (stuck.length && Move.stackCount(game, stuck[0].plane, stuck[0].x, stuck[0].y, stuck[0].owner) > MAX_STACK)
      for (const u of stuck) { u.x = u.jam[1]; u.y = u.jam[2]; u.path = null; if (u.status === 'goto') u.status = ''; u.attackOrder = false; }
    for (const u of Game.unitsOf(game, ids)) delete u.jam;
    return r;
  },
  async marchOn(game, ids, opts = {}) {
    let units = Game.unitsOf(game, ids);
    if (!units.length) return { ok: false };
    const pid = units[0].owner, pl = game.players[pid];
    const world = game.world;
    let moved = 0;
    // le joueur : on retient qui marche avec qui ce tour-ci (les rapides d'un groupe arrêté par ses lents n'attendent pas d'ordre)
    if (pl && pl.human) { const g = units.length > 1 ? { turn: game.turn, ids: units.map(u => u.id) } : null; for (const u of units) u.groupMove = g; }
    const stop = () => { for (const u of units) { u.path = null; u.status = ''; u.attackOrder = false; delete u.rallyHold; } };
    // le joueur : une armée hostile qui apparaît à deux cases de la route arrête la marche (pas les éclaireurs en exploration)
    const watch = pl && pl.human && !opts.auto && !units.some(u => u.status === 'explore');
    const foesSeen = () => { const vis = Move.visibility(game, pid), out = new Map();
      for (const o of Object.values(game.units)) { if (o.owner === pid || !vis[o.plane][o.y * world.w + o.x] || (typeof Intel !== 'undefined' && Intel.hiddenFrom(game, pid, o))) continue;
        const k = o.plane + ',' + o.x + ',' + o.y; if (!out.has(k) && Move.hostileAt(game, pid, o.plane, o.x, o.y)) out.set(k, o); }
      return out; };
    const known = watch ? new Set(foesSeen().keys()) : null;
    while (units.length && units[0].path && units[0].path.length) {
      units = units.filter(u => game.units[u.id]);   // une unité consommée en chemin (cité fondée…) ne marche plus
      if (!units.length) break;
      const [nx, ny] = units[0].path[0];
      const plane = units[0].plane;
      const fx = units[0].x, fy = units[0].y;
      const gi = Move.groupInfo(game, units);
      // à bord : sur l'eau, les fantassins sont portés par les navires du groupe et ne dépensent rien
      const carried = u => ((gi.sailors.length > 0 || gi.flyCarriers > 0) && !gi.sailors.includes(u) && !Move.capacity(u) && World.isWaterAt(world, plane, nx, ny))
        || (gi.windWalking && !Units.stats(game, u).ab.windWalking);   // Marche des vents : la pile est emportée par celui qui la porte
      if (units.some(u => u.moves <= 0 && !carried(u))) break;
      // menace à l'arrivée ?
      const hostile = Move.hostileAt(game, pid, plane, nx, ny);
      const city = Cities.at(game, plane, nx, ny);
      const si = World.get(world, plane, 'site', nx, ny);
      const site = si >= 0 ? game.sites[si] : null;
      if (hostile || (city && city.owner !== pid) || (site && Game.siteHasGuardians(site))) {
        const last = units[0].path.length === 1, ordered = units[0].attackOrder;
        stop();
        // un obstacle découvert en chemin (brouillard, unité arrivée depuis) : on s'arrête, sans attaquer à l'improviste
        if (!last) return { ok: true, moved, blocked: true, why: 'Un obstacle imprévu barre la route : vos troupes s\'arrêtent.' };
        if (opts.noAttack && !ordered) return { ok: true, moved, blocked: true, why: pl && pl.human ? 'Des ennemis occupent la destination : vos troupes s\'arrêtent devant.' : null };
        // le joueur n'attaque jamais sans l'avoir voulu : une cité ou des troupes découvertes en arrivant arrêtent la marche devant
        if (pl && pl.human && !ordered) return { ok: true, moved, blocked: true, why: city && city.owner !== pid ? 'Vos troupes découvrent ' + city.name + ' et s\'arrêtent devant.'
          : hostile ? 'Vos troupes découvrent des ennemis sur leur chemin et s\'arrêtent.' : 'Vos troupes découvrent un lieu gardé et s\'arrêtent devant.' };
        // ordre d'attaque donné un tour plus tôt : seulement contre la cible voulue, et jamais contre un sorcier devenu ami
        if (opts.noAttack && ordered && !Game.sameTarget(game, pid, ordered, Game.attackTarget(game, pid, plane, nx, ny))) return { ok: true, moved, blocked: true, why: 'La cible a changé : vos troupes s\'arrêtent sans attaquer.' };
        // diplomatie : attaquer un allié en paix demande confirmation (gérée par l'interface)
        const r = await Game.attack(game, units.map(u => u.id), nx, ny, opts);
        if (r && r.ok === false) return { ok: false, moved, why: r.why, attacked: true, result: r };
        return { ok: true, moved, attacked: true, result: r };
      }
      if (Move.closedAt(game, pid, plane, nx, ny)) { stop(); const o = game.players[World.get(world, plane, 'owner', nx, ny)]; return { ok: false, moved, why: (o ? U.cap(Players.nameFor(game, pid, o.id)) : 'Ce sorcier') + ' interdit son territoire à vos troupes.' }; }
      if (!Move.canStand(game, units, gi, plane, nx, ny, pid)) { stop(); return { ok: false, moved, why: 'Passage impossible.' }; }
      // passagers : les unités à pied embarquées sur ces navires, dans la limite de leur capacité
      // quitter l'eau : les passagers restés sur la case partent avec qui les porte (navires, Navire volant, Marche des vents) ;
      // personne n'est laissé sur l'eau sans rien pour le porter
      const carry = Move.carriedFrom(game, units, plane, fx, fy, pid), riders = carry.riders;
      if (carry.stranded.length) { stop(); return { ok: moved > 0, moved, blocked: true, why: 'Ce départ laisserait ' + U.tally(carry.stranded.map(u => Units.label(u))) + ' sur l\'eau, sans rien pour les porter.' }; }
      if (Move.stackCount(game, plane, nx, ny, pid, new Set(units.concat(riders).map(u => u.id))) + units.length + riders.length > MAX_STACK) {
        // une case pleine (une cité amie, souvent) se traverse sans s'y arrêter : assez de mouvement pour en ressortir ce tour,
        // vers une case où le groupe peut se tenir ; sinon, faute de mouvement, il attend le plein au bord
        // (v0.31.7) ou, juste derrière, la cible de l'attaque : on traverse pour frapper depuis la case pleine
        const nxt = units[0].path[1], excl = new Set(units.map(u => u.id));
        const strike = !!nxt && units[0].path.length === 2 && !!Game.attackTarget(game, pid, plane, nxt[0], nxt[1]) && (units[0].attackOrder ? true : !opts.noAttack && !(pl && pl.human));
        const nextOK = !riders.length && nxt && (strike || Move.canPassTo(game, units, gi, plane, nxt[0], nxt[1], pid, excl));
        const through = nextOK && units.every(u => carried(u) || u.moves - Move.stepCost(game, u, gi, plane, fx, fy, nx, ny) > 0);
        if (through) for (const u of units) u.jam = [plane, fx, fy, nx, ny];
        if (!through) {
          if (nextOK && units.some(u => u.moves < Units.maxMoves(game, u))) break;
          for (const u of units) { u.path = null; u.status = ''; }
          return { ok: false, moved, why: 'Pile pleine (9 unités maximum).' };
        }
      }
      // coût : chaque unité paie, le groupe avance au rythme du plus lent (les passagers d'un navire, eux, sont portés)
      for (const u of units) {
        const c = carried(u) ? 0 : Move.stepCost(game, u, gi, plane, fx, fy, nx, ny);
        u.moves = Math.max(0, u.moves - c);
        u.x = nx; u.y = ny; u.path.shift();
      }
      // Marche des vents : ceux qu'elle emporte n'en ressortent pas plus frais que qui les porte
      if (gi.windWalking) { const ww = units.filter(u => Units.stats(game, u).ab.windWalking), wm = Math.max(0, ...ww.map(u => u.moves)); for (const u of units) if (!ww.includes(u)) u.moves = Math.min(u.moves, wm); }
      // un repaire dont le combat a laissé le trésor sans gardien : le premier qui y entre le ramasse
      if (site && site.lootPending && !site.cleared && !Game.siteHasGuardians(site) && pl) { site.cleared = true; delete site.lootPending; await Game.lootSite(game, site, pid, units); Game.siteChanged(game, site, pid); }
      if (site && pl && pl.human && Game.isLair(site) && !Game.knownCleared(pl, site)) {
        const k0 = Game.siteKnown(pl, site);
        Game.noteSite(game, pid, site);
        if (site.cleared && !k0) Game.log(game, pid, U.cap(Game.siteName(site)) + ' : d\'autres sont passés avant vous, il n\'y reste rien.', { x: nx, y: ny, plane });
      }
      // passagers transportés
      for (const o of riders) { o.x = nx; o.y = ny; o.moves = 0; o.path = null; }
      moved++;
      if (pl) for (const u of units) Move.revealUnit(game, pl, u);
      if (pl) Game.meetWizards(game, pl, plane, nx, ny);
      if (pl) Game.collectCache(game, pl, units, plane, nx, ny);
      if (pl) Heroes.onMove(game, pl, units, plane, nx, ny);
      if (pl) await Pacts.onEnter(game, pl, units, plane, nx, ny, !!(opts.noAttack || opts.auto));
      if (pl && await Book.onEnter(game, pl, units.concat(riders), plane, nx, ny, fx, fy) === 'stop') { stop(); if (Game.hooks.update) Game.hooks.update({ type: 'move', ids: units.map(u => u.id) }); return { ok: true, moved, blocked: true }; }
      // l'interface anime chaque pas (marche d'une case à l'autre)
      if (opts.onStep) await opts.onStep(units.map(u => u.id), [fx, fy], [nx, ny]);
      if (watch && units[0].path && units[0].path.length) {
        const seen = foesSeen(); let found = null;
        // (la cible d'une attaque ordonnée ne surprend personne : la marche continue jusqu'à elle)
        const dest = units[0].attackOrder && units[0].dest;
        for (const [k, o] of seen) { if (known.has(k)) continue; known.add(k); if (dest && o.plane === plane && o.x === dest[0] && o.y === dest[1]) continue; if (o.plane === plane && World.dist(world, o.x, o.y, nx, ny) <= 2) found = found || o; }
        if (found) {
          stop(); if (Game.hooks.update) Game.hooks.update({ type: 'move', ids: units.map(u => u.id) });
          const fc = Cities.at(game, found.plane, found.x, found.y);
          const who = found.owner < 0 ? (fc ? 'la garnison de ' + fc.name : 'des monstres') : 'des troupes de ' + Players.nameFor(game, pid, found.owner);
          return { ok: true, moved, blocked: true, why: 'Vos troupes aperçoivent ' + who + ' (' + Units.label(found) + ') et s\'arrêtent.' };
        }
      }
      // nœud libre : rien à combattre ; tour dégagée : rien
      if (Game.hooks.update) Game.hooks.update({ type: 'move', ids: units.map(u => u.id) });
    }
    for (const u of units) if (u.path && !u.path.length) { u.path = null; u.attackOrder = false; u.status = u.status === 'goto' ? (u.rallyHold ? 'sentry' : '') : u.status; delete u.rallyHold; }
    return { ok: true, moved };
  },

  // premier contact entre deux sorciers (idempotent)
  contact(game, a, b, where) {
    const pa = game.players[a], pb = game.players[b];
    if (!pa || !pb || a === b || (pa.contact[b] && pb.contact[a])) return;
    pa.contact[b] = true; pb.contact[a] = true;
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'met', Object.assign({ a, b }, where ? { plane: where.plane, x: where.x, y: where.y } : {}));
    const loc = where ? { plane: where.plane, x: where.x, y: where.y } : {};
    Game.log(game, a, 'Premier contact avec ' + pb.name + '.', Object.assign({ player: b, contact: true }, loc));
    Game.log(game, b, 'Premier contact avec ' + pa.name + '.', Object.assign({ player: a, contact: true }, loc));
  },
  // message envoyé à chaque joueur, avec les noms qu'il est censé connaître
  logEach(game, fn, ref) { for (const p of game.players) { const t = fn(p.id); if (t) Game.log(game, p.id, t, ref); } },
  meetWizards(game, pl, plane, x, y) {
    for (const o of game.players) {
      if (o === pl || !o.alive || pl.contact[o.id]) continue;
      let seen = null;
      for (const c of Cities.ofPlayer(game, o.id)) if (!seen && c.plane === plane && World.dist(game.world, c.x, c.y, x, y) <= 3) seen = { plane, x: c.x, y: c.y };
      if (!seen) for (const u of Object.values(game.units)) if (u.owner === o.id && u.plane === plane && World.dist(game.world, u.x, u.y, x, y) <= 2) { seen = { plane, x: u.x, y: u.y }; break; }
      if (seen) Game.contact(game, pl.id, o.id, seen);
    }
  },

  // ---------- combat ----------
  // attaques impossibles : Forteresse volante (seuls des volants l'atteignent), Garde magique (les créatures du royaume gardé n'y entrent pas)
  // ce qu'une attaque de la case viserait : cité, repaire, ou troupes de tel sorcier
  attackTarget(game, pid, plane, x, y) {
    const c = Cities.at(game, plane, x, y);
    if (c && c.owner !== pid) return { city: c.id, owner: c.owner };
    const si = World.get(game.world, plane, 'site', x, y);
    if (si >= 0 && Game.siteHasGuardians(game.sites[si])) return { site: si, owner: -1 };
    const h = Move.hostileAt(game, pid, plane, x, y);
    return h ? { owner: h.owner } : null;
  },
  sameTarget(game, pid, a, b) {
    if (!a || !b) return false;
    const pl = game.players[pid];
    if (b.owner >= 0 && pl && ['peace', 'alliance'].includes(pl.diplo[b.owner])) return false;   // devenu ami entre-temps
    if (a === true) return true;
    if (a.city != null) return b.city === a.city && b.owner === a.owner;
    if (a.site != null) return b.site === a.site;
    return b.city == null && b.site == null && b.owner === a.owner;
  },
  attackRefusal(game, attackers, city) {
    const pid = attackers[0] && attackers[0].owner;
    if (!city || city.owner === pid) return null;
    if (Cities.hasEnch(city, 'flying_fortress') && !attackers.every(u => Units.stats(game, u).flying)) return city.name + ' flotte dans les airs : seules des unités volantes peuvent l\'attaquer.';
    const ward = city.ench.find(e => e.spell === 'spell_ward' && e.realm);
    if (ward && attackers.some(u => Units.isFantastic(u) && Units.realmOf(u) === ward.realm)) return 'L\'Égide arcanique de ' + city.name + ' interdit l\'entrée aux créatures ' + ({ life: 'de la vie', death: 'de la mort', chaos: 'du chaos', nature: 'de la nature', sorcery: 'de la sorcellerie' })[ward.realm] + '.';
    return null;
  },
  async attack(game, ids, tx, ty, opts = {}) {
    const attackers = Game.unitsOf(game, ids).filter(u => u.moves > 0);
    if (!attackers.length) return { ok: false, why: 'Plus de mouvement.' };
    const pid = attackers[0].owner, plane = attackers[0].plane;
    const city = Cities.at(game, plane, tx, ty);
    const si = World.get(game.world, plane, 'site', tx, ty);
    const site = si >= 0 ? game.sites[si] : null;
    const refused = Game.attackRefusal(game, attackers, city);
    if (refused) return { ok: false, why: refused };
    // le Démon légendaire ne combat que la cible du pacte ; attaqué par un autre, il s'écarte
    const onTile = Units.at(game, plane, tx, ty).find(u => u.owner !== pid);
    const riteNo = Rite.refusal(game, attackers, onTile ? onTile.owner : city ? city.owner : -1);
    if (riteNo) return { ok: false, why: riteNo };
    { const ra = Rite.active(game); if (!(ra && pid === ra.target)) for (const d of Units.at(game, plane, tx, ty).filter(u => u.riteDemon && u.owner !== pid)) Rite.stepAside(game, d); }
    let defenders = Units.at(game, plane, tx, ty).filter(u => u.owner !== pid);
    let defenderPid = defenders.length ? defenders[0].owner : city ? city.owner : -1;
    const guardianUnits = [];
    if (site && Game.siteHasGuardians(site) && !defenders.length) {
      site.guardians.forEach((t, i) => { const g = Units.create(game, t, -1, plane, tx, ty, (site.guardianUndead || [])[i] ? { undead: true } : null); g.guardian = site.id; guardianUnits.push(g); });
      Nemesis.restoreAtSite(site, guardianUnits);
      defenders = guardianUnits; defenderPid = -1;
    }
    // diplomatie : on connaît toujours celui qu'on combat
    if (defenderPid >= 0 && game.players[pid] && game.players[defenderPid]) { Game.contact(game, pid, defenderPid, { plane, x: tx, y: ty }); Diplomacy.onAttack(game, pid, defenderPid); }
    // Deus ex machina : l'armée repart chez elle sans combat
    { const d = typeof Book !== 'undefined' && Book.deus(game, attackers, city); if (d) return d; }
    if (!defenders.length && city && !Battle.spire(game, city)) {
      // cité sans défenseurs : prise directe (sauf une forteresse, que défend la tour du sorcier)
      for (const u of attackers) { u.x = tx; u.y = ty; u.moves = 0; u.path = null; }
      await Game.captureCity(game, city, pid);
      Game.checkElimination(game);
      if (Game.hooks.update) Game.hooks.update({ type: 'capture' });
      return { ok: true, won: true, captured: true };
    }
    if (!defenders.length && !city) return { ok: false };
    // Labyrinthe : les assaillants s'égarent dans les dédales de la cité (un quart de leurs PV, sans en mourir)
    if (city && city.buildings.labyrinth && city.owner !== pid && city.owner >= 0) {
      for (const u of attackers) { const m = Units.stats(game, u).maxHp; u.dmg = Math.min(m - 1, (u.dmg || 0) + Math.floor(m / 4)); }
      Game.log(game, pid, 'Vos troupes s\'égarent dans le Labyrinthe de ' + city.name + ' : elles arrivent à l\'assaut affaiblies.', { city: city.id });
    }
    let battle = new Battle(game, { attackers, defenders, attackerPid: pid, defenderPid, plane, x: tx, y: ty, city: city || null, site });
    const humanInvolved = (game.players[pid] && game.players[pid].human) || (game.players[defenderPid] && game.players[defenderPid].human);
    if (humanInvolved && Game.hooks.battle && !opts.auto) {
      // l'interface peut rendre une autre bataille : la résolution automatique a été refusée et la bataille rejouée à la main
      const played = await Game.hooks.battle(game, battle, { site, city });
      if (played && played !== battle && played instanceof Battle) battle = played;
    }
    else CombatAI.autoResolve(battle);
    return Game.applyBattle(game, battle, { attackers, defenders, pid, defenderPid, site, city, tx, ty, plane, guardianUnits });
  },

  async applyBattle(game, battle, info) {
    const res = battle.results();
    const { pid, defenderPid, site, city, tx, ty, plane } = info;
    try { Nemesis.afterBattle(game, battle, info); } catch (e) { console.error('némésis', e); }
    try { Diplomacy.recordBattle(game, battle, info); } catch (e) { console.error('guerre', e); }
    const atkWon = res.winner === ATT_SIDE;
    const a0 = info.attackers[0], origin = a0 ? [a0.plane, a0.x, a0.y] : null;
    // la chronique : la bataille (forces engagées et pertes, avant qu'on retire les morts), les héros tombés
    if (typeof Chronicle !== 'undefined') try {
      const st = list => Math.round(U.sum(list.filter(u => u && !u.combatOnly), u => Units.strength(game, Object.assign({}, u, { dmg: 0 }))));   // forces à pleine santé (les morts aussi)
      const fallen = res.killed[0].concat(res.killed[1]).filter(u => u.hero && !u.combatOnly && game.players[u.owner]);
      for (const u of fallen) Chronicle.note(game, 'hero_fall', { a: u.owner, h: u.hero.name, lv: (HERO_LEVELS[Units.levelIndex(game, u)] || {}).name || '', plane, x: tx, y: ty });
      Chronicle.battle(game, { a: pid, d: defenderPid, plane, x: tx, y: ty, aS: st(info.attackers), dS: st(info.defenders), aN: info.attackers.filter(u => !u.combatOnly).length, dN: info.defenders.filter(u => !u.combatOnly).length,
        aK: res.killed[0].filter(u => !u.combatOnly).length, dK: res.killed[1].filter(u => !u.combatOnly).length, aL: st(res.killed[0]), dL: st(res.killed[1]), w: res.winner === 0 || res.winner === 1 ? res.winner : null,
        city: city ? city.name : null, siege: !!(city && city.owner !== pid), site: site ? Game.siteName(site) : null, heroes: fallen.length ? fallen.map(u => u.hero.name) : null });
    } catch (e) { console.error('chronique', e); }
    // pertes
    let demonDown = false;
    for (const side of [0, 1]) for (const u of res.killed[side]) {
      if (game.units[u.id]) {
        if (u.hero && game.players[u.owner]) Game.log(game, u.owner, 'Le héros ' + u.hero.name + ' est tombé au combat.', { x: tx, y: ty, plane });
        if (u.riteDemon) demonDown = true;
        Units.remove(game, u);
      }
    }
    if (demonDown && typeof Rite !== 'undefined') Rite.slain(game);   // le Démon légendaire abattu : la cible est récompensée tout de suite
    if (typeof Finale !== 'undefined' && game.finale && game.finale.state === 'active') try { await Finale.afterBattle(game, battle, res, info); } catch (e) { console.error('crise de fin', e); }
    // créatures asservies : elles disparaissent ; unités rappelées : elles rentrent à la forteresse de leur maître (ou juste à côté)
    for (const u of res.vanished || []) if (game.units[u.id]) Units.remove(game, u);
    for (const u of res.recalled || []) if (game.units[u.id]) {
      const rp = game.players[u.owner], fc = rp && game.cities[rp.fortress], at = fc && Spells.spotNear(game, rp, fc, u.type);
      if (at) { u.plane = at[0]; u.x = at[1]; u.y = at[2]; u.path = null; u.dest = null; u.status = ''; }
      else if (rp) Game.log(game, rp.id, Units.label(u) + ' n\'a pu être rappelé : plus de place autour de la forteresse.', { unit: u.id });
    }
    // morts relevés en morts-vivants : ils changent de maître (la possession, elle, prend fin avec le combat)
    for (const a of res.animated || []) if (game.units[a.u.id]) a.u.owner = battle.owner(a.side);
    const winnerPid = battle.owner(res.winner);
    // des gardiens vainqueurs grossissent les rangs du repaire de leurs morts-vivants
    const guardWin = winnerPid < 0 && site && info.guardianUnits.length;
    if (res.undead.length && guardWin) info.newGuardians = res.undead.slice(0, Math.max(0, MAX_STACK - info.guardianUnits.filter(g => game.units[g.id] && g.owner < 0).length));
    // retraite du défenseur en rase campagne : les survivants gagnent une case voisine libre (l'assaillant prend la leur) ;
    // encerclés, ils périssent tous. L'assaillant qui recule reste sur sa case ; une garnison qui fuit sa cité est perdue.
    if (res.fled === DEF_SIDE && !city && !info.guardianUnits.length) {
      const runners = Units.at(game, plane, tx, ty).filter(u => u.owner !== pid);
      const from = a0 && game.units[a0.id] ? [a0.x, a0.y] : null;
      const spot = Game.fleeSpot(game, runners, plane, tx, ty, defenderPid, from);
      if (spot) {
        for (const u of runners) { u.x = spot[0]; u.y = spot[1]; u.path = null; u.dest = null; u.moves = 0; if (u.status === 'goto' || u.status === 'explore') u.status = ''; }
        if (game.players[defenderPid]) Game.collectCache(game, game.players[defenderPid], runners, plane, spot[0], spot[1]);
      } else {
        for (const u of runners) { if (u.hero && game.players[u.owner]) Game.log(game, u.owner, 'Le héros ' + u.hero.name + ' est tombé dans la retraite.', { x: tx, y: ty, plane }); Units.remove(game, u); }
        res.killed[DEF_SIDE] = res.killed[DEF_SIDE].concat(runners);
        info.trapped = runners.length;
      }
      info.fledTo = spot;
    }
    // expérience
    for (const g of battle.xpGains().units) Units.addXp(game, g.b.u, g.n);
    // ouvrages du vainqueur : la Fosse aux Crocs remet ses troupes sur pied, le Puits des Âmes boit les morts
    if (res.winner === ATT_SIDE || res.winner === DEF_SIDE) {
      const wp = battle.owner(res.winner), wpl = wp >= 0 ? game.players[wp] : null;
      if (wpl && Wonders.has(game, wp, 'gnoll')) for (const u of res.survivors[res.winner]) if (game.units[u.id]) u.dmg = 0;
      if (wpl && Wonders.has(game, wp, 'darkelf')) {
        const mana = U.sum(res.killed[1 - res.winner].filter(u => !u.combatOnly), u => Wonders.soulMana(u));
        if (mana > 0) { wpl.mana += mana; Game.log(game, wp, 'Le Puits des Âmes boit les morts de la bataille : +' + mana + ' mana.', { x: tx, y: ty, plane, minor: true }); }
      }
    }
    for (const u of res.survivors[ATT_SIDE]) if (game.units[u.id]) u.moves = 0;
    // (la régénération des vainqueurs est faite par Battle.results, qui laisse les dégâts irréversibles)
    // gardiens survivants (les morts-vivants le restent) ; sans survivant d'aucun côté, le trésor attend le premier qui entrera
    if (info.guardianUnits.length) {
      const alive = info.guardianUnits.filter(g => game.units[g.id] && g.owner < 0);   // un gardien relevé par l'assaillant (Animation des morts) a changé de maître
      if (site) {
        const newG = info.newGuardians || [];
        site.guardians = alive.map(g => g.type).concat(newG);
        site.guardianUndead = alive.map(g => !!g.undead).concat(newG.map(() => true));
        if (!atkWon && !site.guardians.length && !site.cleared) site.lootPending = true;
        Nemesis.saveAtSite(site, alive);
        Game.siteChanged(game, site, pid);
      }
      for (const g of alive) delete game.units[g.id];
    }
    const apl = game.players[pid], dpl = game.players[defenderPid];
    let summary = { won: atkWon, res };
    // un navire qui avance emporte ses passagers restés sur la case de départ
    const ridersFor = surv => origin ? Move.carriedFrom(game, surv, origin[0], origin[1], origin[2], pid).riders : [];
    const strandedBy = (surv, riders) => origin ? Move.carriedFrom(game, surv.concat(riders), origin[0], origin[1], origin[2], pid).stranded : [];
    info.firstClear = false;
    if (atkWon) {
      const surv = res.survivors[ATT_SIDE].filter(u => game.units[u.id]);
      // un site déjà nettoyé ne se pille qu'une fois (des unités qui s'y tiennent ne gardent aucun trésor)
      const firstClear = info.firstClear = !!site && !site.cleared && !(site.guardians || []).length;
      if (firstClear) {
        site.cleared = true; delete site.lootPending;
        // une tour de sorcellerie est une seule et même tour sur les deux plans : la prendre d'un côté la libère de l'autre
        if (site.type === 'tower') for (const tw of game.sites) if (tw !== site && tw.type === 'tower' && tw.x === site.x && tw.y === site.y && !tw.cleared) { tw.cleared = true; tw.guardians = []; }
        summary.treasure = await Game.lootSite(game, site, pid, surv);
        Game.siteChanged(game, site, pid);
      }
      if (city && city.owner !== pid) {
        // les défenseurs restants (non combattants) sont détruits
        for (const u of Units.at(game, plane, tx, ty)) if (u.owner !== pid) { if (u.hero && game.players[u.owner]) Game.log(game, u.owner, 'Le héros ' + u.hero.name + ' est tombé avec ' + city.name + '.', { city: city.id }); Units.remove(game, u); }
        const cr = ridersFor(surv);   // qui les portait sur l'eau ne les y abandonne pas
        for (const u of surv.concat(cr)) { u.x = tx; u.y = ty; u.path = null; if (cr.includes(u)) u.moves = 0; }
        summary.captured = await Game.captureCity(game, city, pid);
        if (origin) Game.drownStranded(game, origin[0], origin[1], origin[2]);
      } else if (!Units.at(game, plane, tx, ty).some(u => u.owner !== pid) && (!site || site.cleared)) {
        const riders = ridersFor(surv), group = surv.concat(riders);
        const ok = Move.canStand(game, group, Move.groupInfo(game, group), plane, tx, ty, pid) && !strandedBy(surv, riders).length;
        if (ok && surv.length && Move.stackCount(game, plane, tx, ty, pid, new Set(group.map(u => u.id))) + group.length <= MAX_STACK) for (const u of group) { u.x = tx; u.y = ty; u.path = null; if (riders.includes(u)) u.moves = 0; }
      }
      // le nœud reste lié à son sorcier : seule une fusion (Esprit magique) le fait changer de maître
      if (apl && surv.some(u => u.plane === plane && u.x === tx && u.y === ty)) Game.collectCache(game, apl, surv, plane, tx, ty);
      if (apl && firstClear) apl.fame += Math.max(0, Math.round(site.budget / 400));
      if (apl && pid >= 0) for (const u of surv) Move.revealUnit(game, apl, u);
    }
    // héros : quêtes et niveaux ; une légende accomplie est saluée à l'écran
    const legends = Heroes.onBattle(game, battle, info, res, atkWon) || [];
    for (const lg of legends) { const lp = game.players[lg.pid]; if (lp && lp.human && Game.hooks.choose) await Game.hooks.choose(game, lg.pid, lg); }
    Heroes.checkLevels(game);
    // morts-vivants au profit du vainqueur, là où se tiennent ses survivants (après leur avance), dans la limite de la pile
    const raised = res.undead.slice();
    if (res.undead.length && !guardWin && winnerPid >= -1) {
      const mate = (res.survivors[res.winner] || []).find(u => game.units[u.id]);
      const at = mate ? [mate.plane, mate.x, mate.y] : [plane, tx, ty];
      let made = 0;
      for (const t of res.undead) {
        if (Move.stackCount(game, at[0], at[1], at[2], winnerPid) >= MAX_STACK) break;
        const z = Units.create(game, t, winnerPid, at[0], at[1], at[2], { undead: true }); z.moves = 0;
        if (!Move.canStand(game, [z], Move.groupInfo(game, [z]), at[0], at[1], at[2], winnerPid)) { delete game.units[z.id]; break; }
        made++;
      }
      if (made && winnerPid >= 0) Game.log(game, winnerPid, (made > 1 ? made + ' ennemis se relèvent' : 'Un ennemi se relève') + ' en mort-vivant à votre service.');
    }
    // Maîtrise des zombies : les unités normales ennemies tuées (et pas déjà relevées) se relèvent en zombies au service de qui l'entretient
    for (const side of [ATT_SIDE, DEF_SIDE]) {
      const zp = game.players[battle.owner(side)];
      if (!zp || !zp.alive || !zp.globals.includes('zombie_mastery')) continue;
      const left = side === res.winner ? raised.slice() : [];
      const fallen = res.killed[1 - side].filter(u => { if (!Units.isNormal(u) || u.hero) return false; const i = left.indexOf(u.type); if (i >= 0) { left.splice(i, 1); return false; } return true; });
      const mate = (res.survivors[side] || []).find(u => game.units[u.id]);
      if (!fallen.length || !mate) continue;
      const room = Math.max(0, MAX_STACK - Move.stackCount(game, mate.plane, mate.x, mate.y, zp.id));
      const n = Math.min(room, fallen.length);
      for (let i = 0; i < n; i++) { const z = Units.create(game, 'Zombie', zp.id, mate.plane, mate.x, mate.y, { undead: true }); z.moves = 0; }
      if (n) Game.log(game, zp.id, U.n(n, 'ennemi tombé se relève', 'ennemis tombés se relèvent') + ' en zombie à votre service.', { x: mate.x, y: mate.y, plane: mate.plane, minor: true });
    }
    // les morts relevés suivent l'armée de leur nouveau maître (dans la limite de la pile), ou disparaissent avec elle
    for (const a of res.animated || []) if (game.units[a.u.id]) {
      const mate = (res.survivors[a.side] || []).find(u => u !== a.u && game.units[u.id] && !(res.animated || []).some(x => x.u === u));
      if (a.side !== res.winner && !mate) { Units.remove(game, a.u); continue; }
      let at = mate ? [mate.plane, mate.x, mate.y] : a.side === DEF_SIDE || !a0 ? [plane, tx, ty] : origin;
      const here = a.u.plane === at[0] && a.u.x === at[1] && a.u.y === at[2];
      if (!here && Move.stackCount(game, at[0], at[1], at[2], a.u.owner) >= MAX_STACK) {
        const op = game.players[a.u.owner], sp = op && Spells.spotNear(game, op, { plane: at[0], x: at[1], y: at[2] }, a.u.type);
        if (!sp) { Units.remove(game, a.u); continue; }
        at = sp;
      }
      a.u.plane = at[0]; a.u.x = at[1]; a.u.y = at[2]; a.u.path = null; a.u.moves = 0;
    }
    // au large : des fantassins sans assez de navires (coulés pendant la bataille) se noient
    Game.drownStranded(game, plane, tx, ty);
    if (origin) Game.drownStranded(game, origin[0], origin[1], origin[2]);
    const label = city ? city.name : site ? Game.siteName(site) : 'les ennemis';
    const flight = res.fled === DEF_SIDE ? (info.trapped ? ' Sans issue, les fuyards périssent tous.' : info.fledTo ? ' Les survivants s\'enfuient.' : '') : '';
    const tk = s => ((res.taken || [[], []])[s] || []).length;   // asservies, relevées par l'ennemi : perdues aussi
    if (apl) Game.log(game, pid, (atkWon ? 'Victoire contre ' : 'Défaite contre ') + label + ' (' + U.n(res.killed[DEF_SIDE].length + tk(DEF_SIDE), 'ennemi tué', 'ennemis tués') + ', ' + U.n(res.killed[ATT_SIDE].length + tk(ATT_SIDE), 'perte') + ').' + flight, { x: tx, y: ty, plane });
    const who = apl ? apl.name : (info.attackers || []).some(u => u && (u.rampage || u.riftSpawn || u.breach)) ? (U.fr() ? 'des monstres' : U.txt('monstres')) : (U.fr() ? 'des pillards' : U.txt('pillards'));
    if (dpl) Game.log(game, defenderPid, (atkWon ? 'Nos troupes ont été défaites par ' : 'Nous avons repoussé ') + who + (city ? ' à ' + city.name : '') + '.', { x: tx, y: ty, plane, player: apl ? apl.id : null, city: city ? city.id : null });
    Game.checkElimination(game);
    if (Game.hooks.update) Game.hooks.update({ type: 'battle' });
    return summary;
  },
  // des unités terrestres en mer sans navire pour les porter : celles qui dépassent la capacité des navires présents périssent
  drownStranded(game, plane, x, y) {
    if (!World.isWaterAt(game.world, plane, x, y)) return 0;
    let lost = 0;
    const owners = new Set(Units.at(game, plane, x, y).map(u => u.owner));
    for (const pid of owners) {
      const here = Units.at(game, plane, x, y).filter(u => u.owner === pid);
      if (Move.canStand(game, here, Move.groupInfo(game, here), plane, x, y, pid)) continue;   // Marche du vent, navires assez grands : rien à craindre
      const cap = U.sum(here.filter(u => { const s = Units.stats(game, u); return s.sailing || (s.flying && Move.capacity(u)); }), u => Move.capacity(u));   // navires, et Navire volant
      const landers = here.filter(u => { const s = Units.stats(game, u); return !s.flying && !s.swimming && !s.sailing && !s.ab.waterWalking; });
      const extra = landers.slice(cap);
      for (const u of extra) { Units.remove(game, u, { drowned: true }); lost++; }
      if (extra.length && game.players[pid]) Game.log(game, pid, (extra.length === 1 ? Units.subj(extra[0], 'périt') : U.tally(extra.map(u => Units.label(u))) + ' périssent') + ' en mer, faute de navire pour les porter.', { x, y, plane, alert: true });
    }
    return lost;
  },
  // filet de sécurité, en fin de tour : une troupe restée en mer sans rien pour la porter (cas rare, cause non élucidée :
  // banc 13, un héros seul sur l'eau pendant 30 tours) regagne la terre la plus proche ; faute de place, elle périt.
  // game.strandFix compte les cas (relevé par le banc), game.strandEx garde le premier
  rescueStranded(game) {
    // (filet) une unité à 0 PV restée sur la carte (vu une fois par le robot de l'interface : un Squelette neutre pendant 25 tours) : elle est morte
    for (const u of Object.values(game.units)) if (Units.health(game, u) <= 0) {
      game.deadFix = (game.deadFix || 0) + 1;
      if (!game.deadEx) game.deadEx = 't' + game.turn + ' ' + u.type + ' (joueur ' + u.owner + ', dégâts ' + u.dmg + ' / ' + Units.stats(game, u).maxHp + ') ' + u.plane + ',' + u.x + ',' + u.y;
      Units.remove(game, u);
    }
    const tiles = {};
    for (const u of Object.values(game.units)) {
      if (!World.isWaterAt(game.world, u.plane, u.x, u.y) || Cities.at(game, u.plane, u.x, u.y)) continue;
      const k = u.owner + '|' + u.plane + ',' + u.x + ',' + u.y; (tiles[k] = tiles[k] || []).push(u);
    }
    for (const here of Object.values(tiles)) {
      const u0 = here[0], pid = u0.owner, { plane, x, y } = u0;
      if (Move.canStand(game, here, Move.groupInfo(game, here), plane, x, y, pid)) continue;
      const cap = U.sum(here.filter(u => { const s = Units.stats(game, u); return s.sailing || (s.flying && Move.capacity(u)); }), u => Move.capacity(u));
      const landers = here.filter(u => { const s = Units.stats(game, u); return !s.flying && !s.swimming && !s.sailing && !s.ab.waterWalking; }).slice(cap);
      if (!landers.length) continue;
      game.strandFix = (game.strandFix || 0) + landers.length;
      if (!game.strandEx) game.strandEx = 't' + game.turn + ' ' + landers.map(u => u.type).join('+') + ' ' + plane + ',' + x + ',' + y;
      const gi = Move.groupInfo(game, landers), w = game.world;
      const fits = (nx, ny) => !World.isWaterAt(w, plane, nx, ny) && !Move.hostileAt(game, pid, plane, nx, ny) && Move.stackCount(game, plane, nx, ny, pid) + landers.length <= MAX_STACK
        && !(c => c && c.owner !== pid)(Cities.at(game, plane, nx, ny)) && !(si => si >= 0 && game.sites[si] && Game.siteHasGuardians(game.sites[si]))(World.get(w, plane, 'site', nx, ny))
        && Move.canStand(game, landers, gi, plane, nx, ny, pid);
      let at = null;
      const seen = new Set([x + ',' + y]); let ring = [[x, y]];
      for (let d = 1; d <= 4 && !at; d++) {
        const next = [];
        for (const [ax, ay] of ring) for (const [nx, ny] of World.neighbors(w, ax, ay)) { const k = nx + ',' + ny; if (seen.has(k)) continue; seen.add(k); next.push([nx, ny]); }
        at = next.find(([nx, ny]) => fits(nx, ny)) || null; ring = next;
      }
      if (!at) { Game.drownStranded(game, plane, x, y); continue; }
      for (const u of landers) { u.x = at[0]; u.y = at[1]; u.path = null; u.dest = null; u.attackOrder = false; if (['goto', 'explore', 'roadto'].includes(u.status)) u.status = ''; }
      if (game.players[pid]) Game.log(game, pid, (landers.length === 1 ? Units.subj(landers[0], 'regagne') : U.tally(landers.map(u => Units.label(u))) + ' regagnent') + ' la côte.', { x: at[0], y: at[1], plane });
    }
  },

  async captureCity(game, city, pid) {
    const old = city.owner, oldPl = game.players[old], pl = game.players[pid];
    let raze = false;
    if (pl && pl.human && Game.hooks.choose) {
      raze = (await Game.hooks.choose(game, pid, { type: 'conquer', city })) === 'raze';
    } else if (pl && !pl.human) {
      raze = false;
    }
    // pillage
    const plunder = oldPl ? Math.floor(oldPl.gold * Cities.citizens(city) / Math.max(1, U.sum(Cities.ofPlayer(game, old), c => Cities.citizens(c)))) : Cities.citizens(city) * 10;
    if (pl) pl.gold += plunder;
    if (oldPl) oldPl.gold = Math.max(0, oldPl.gold - plunder);
    if (oldPl) oldPl.lastLostTo = pl ? pid : -1;   // qui lui a pris sa dernière cité, pour l'annonce de sa chute
    if (raze) {
      if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'city_razed', { a: pid, d: old, c: city.name, plane: city.plane, x: city.x, y: city.y, fort: !!city.fortress });
      Game.log(game, pid, city.name + ' est rasée. Butin : ' + plunder + ' or.');
      if (oldPl) Game.log(game, old, city.name + ' a été rasée par ' + Players.nameFor(game, old, pid) + '.', { x: city.x, y: city.y, plane: city.plane, player: pl.id });
      if (city.fortress && oldPl) Game.banish(game, oldPl, pl);
      Book.onCityGone(game, city, pid);
      Game.destroyCity(game, city);
      if (pl) pl.fame = Math.max(0, pl.fame - 5);
      return 'raze';
    }
    // destructions aléatoires de bâtiments
    const lostB = Cities.destroyBuildings(game, city, 0.1), lostT = lostB.length ? ' (' + Cities.lostText(lostB) + ')' : '';
    const wasFortress = city.fortress;
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'city_taken', { a: pid, d: old, c: city.name, plane: city.plane, x: city.x, y: city.y, fort: !!wasFortress });
    city.owner = pid; city.queue = []; city.fortress = false; delete city.buildings.fortress; delete city.buildings.magicRelay; delete city.buildings.summoningCircle; city.summoningCircle = false;
    city.ench = city.ench.filter(e => e.owner === pid ? DATA.spells[e.spell].kind !== 'cityCurse' : DATA.spells[e.spell].kind === 'cityCurse');   // ses propres malédictions tombent
    city.prod = { type: 'tradeGoods' }; city.progress = 0;
    Cities.resetFarmers(game, city);
    Cities.updateTerritory(game);
    if (pl) { pl.fame += Math.max(1, Math.floor(Cities.citizens(city) / 3)); Game.log(game, pid, city.name + ' est conquise ! Butin : ' + plunder + ' or' + lostT + '.', { city: city.id }); }
    const taker = pl ? Players.nameFor(game, old, pid) : Units.at(game, city.plane, city.x, city.y).some(u => u.owner === pid && (u.rampage || u.riftSpawn || u.breach)) ? U.txt('monstres') : U.txt('pillards');
    if (oldPl) Game.log(game, old, city.name + ' est tombée aux mains ' + U.de(taker) + lostT + '.', { city: city.id, player: pl ? pl.id : null });
    if (wasFortress && oldPl) Game.banish(game, oldPl, pl, city);
    if (oldPl && oldPl.summonCity === city.id) Cities.circleHome(game, oldPl);
    if (pl && pl.fallen && pl.fallen.city === city.id) Game.reclaimFortress(game, pl, city);
    Book.onCapture(game, city, old, pid);
    Wonders.sync(game);
    return 'capture';
  },
  // cité cédée par traité : ses défenseurs se replient vers une autre cité de leur maître, ou se dispersent
  // quiet : pas de message de traité (révolte)
  cedeCity(game, city, pid, quiet) {
    const old = city.owner, oldPl = game.players[old], pl = game.players[pid];
    // la garnison se replie dans la cité la plus proche (du même plan d'abord, sinon n'importe laquelle, sinon la forteresse) ;
    // l'avatar et les héros ne disparaissent jamais ainsi : faute de place, ils rejoignent la forteresse (ou restent sur place)
    const others = Cities.ofPlayer(game, old).filter(c => c !== city);
    const homes = others.slice().sort((a, b) => (a.plane !== city.plane) - (b.plane !== city.plane) || World.dist(game.world, a.x, a.y, city.x, city.y) - World.dist(game.world, b.x, b.y, city.x, city.y));
    for (const u of Units.at(game, city.plane, city.x, city.y)) if (u.owner === old) {
      let at = null;
      if (oldPl) for (const h of (u.hero || u.avatar) ? homes : homes.filter(h => h.plane === city.plane).slice(0, 1)) { at = Spells.spotNear(game, oldPl, h, u.type); if (at) break; }
      if (at && (at[0] !== city.plane || at[1] !== city.x || at[2] !== city.y)) {
        u.plane = at[0]; u.x = at[1]; u.y = at[2]; u.path = null; u.dest = null; u.attackOrder = false;
        if (['goto', 'roadto', 'explore', 'heal', 'purify', 'autopurify'].includes(u.status)) u.status = '';
        if (u.status === 'governor') { u.status = ''; u.govCity = null; }
      } else if (u.hero || u.avatar) {
        // aucun refuge : le héros quitte la cité et attend sur la case voisine la plus libre, même hors de ses frontières
        const nb = World.neighbors(game.world, city.x, city.y).find(([x, y]) => !Move.hostileAt(game, old, city.plane, x, y) && !Cities.at(game, city.plane, x, y) && Move.stackCount(game, city.plane, x, y, old) < MAX_STACK && Move.canStand(game, [u], Move.groupInfo(game, [u]), city.plane, x, y, old));
        if (nb) { u.x = nb[0]; u.y = nb[1]; u.path = null; u.dest = null; if (u.status === 'governor') { u.status = ''; u.govCity = null; } }
        else Units.remove(game, u);
      } else Units.remove(game, u);
    }
    city.owner = pid; city.queue = []; city.prod = { type: 'tradeGoods' }; city.progress = 0;
    city.ench = city.ench.filter(e => e.owner === pid ? DATA.spells[e.spell].kind !== 'cityCurse' : DATA.spells[e.spell].kind === 'cityCurse');   // ses propres malédictions tombent
    if (city.buildings.summoningCircle && !city.fortress) delete city.buildings.summoningCircle;   // le cercle déplacé ne passe pas au nouveau maître
    if (oldPl && oldPl.summonCity === city.id) Cities.circleHome(game, oldPl);
    Cities.resetFarmers(game, city); Cities.updateTerritory(game); Wonders.sync(game);
    if (pl) Move.reveal(game, pl, city.plane, city.x, city.y, Move.citySight(city));   // le nouveau maître voit sa cité et ses abords
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'city_ceded', { a: pid, d: old, c: city.name, plane: city.plane, x: city.x, y: city.y });
    if (quiet) return;
    if (pl) Game.log(game, pid, city.name + ' vous est cédée par traité.', { city: city.id });
    if (oldPl) Game.log(game, old, city.name + ' est cédée à ' + (pl ? pl.name : '?') + '.', { city: city.id });
  },
  destroyCity(game, city) {
    Book.onCityGone(game, city, null);
    delete game.cities[city.id];
    for (const pl of game.players) if (pl.summonCity === city.id) Cities.circleHome(game, pl);
    Cities.updateTerritory(game); Wonders.sync(game);
  },
  // city : la capitale prise (et non rasée). Le vainqueur met FORTRESS_DISMANTLE tours à démanteler la forteresse ;
  // si le banni la reprend avant, son Sort de Retour est d'autant plus avancé (voir reclaimFortress)
  banish(game, loser, winner, city, why) {
    const fc = game.cities[loser.fortress];
    if (fc) loser.lastFortress = { plane: fc.plane, x: fc.x, y: fc.y };
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'banished', { a: loser.id, by: winner ? winner.id : -1, why: why || null, pub: true });
    Game.noteFall(game, { kind: 'banished', who: loser.id, by: winner ? winner.id : -1, why: why || null, city: city ? city.name : fc ? fc.name : null });
    loser.fortress = null; loser.summonCity = null; loser.banished = true; loser.casting = null;
    loser.globals = [];
    loser.fallen = city && game.cities[city.id] ? { city: city.id, turn: game.turn, by: winner ? winner.id : null, seen: false } : null;
    const who = winner ? winner.name : 'les pillards';
    if (loser.fallen) {
      Game.log(game, loser.id, 'Votre forteresse de ' + city.name + ' est tombée : vous êtes banni ! Les troupes de ' + who + ' s\'attellent à la démanteler, ce qui leur prendra ' + FORTRESS_DISMANTLE + ' tours. Plus vous reprendrez ' + city.name + ' vite, plus votre retour sera rapide.', { city: city.id, x: city.x, y: city.y, plane: city.plane });
      if (winner) Game.log(game, winner.id, 'La forteresse de ' + loser.name + ' à ' + city.name + ' est à vous et ' + loser.name + ' est banni dans le néant ! Vos troupes s\'attellent à la démanteler (' + FORTRESS_DISMANTLE + ' tours) : s\'il la reprend avant, son retour sera d\'autant plus rapide.', { city: city.id });
    } else {
      const back = Spells.returnCity ? Spells.returnCity(game, loser) : null;
      Game.log(game, loser.id, (why === 'avatar' ? 'Vous êtes banni ! ' : 'Votre forteresse est tombée et a été détruite : vous êtes banni ! ') + 'Le Sort de Retour (' + Magic.spellCost(game, loser, 'spell_of_return') + ' mana) se lance de lui-même ; votre forteresse renaîtra ' + (back ? 'à ' + back.name : 'dans votre plus grande cité') + '.');
      if (winner) Game.log(game, winner.id, loser.name + ' est banni dans le néant !');
    }
    if (winner) winner.fame += 5;
    // le sorcier banni prépare son retour
    if (Cities.ofPlayer(game, loser.id).length) {
      loser.casting = { id: 'spell_of_return', progress: 0, cost: Magic.spellCost(game, loser, 'spell_of_return', false), target: null };
    }
  },
  // part du démantèlement encore à faire (1 = intacte, 0 = rasée) ; null si rien en cours
  fortressLeft(game, pl) {
    const f = pl && pl.fallen; if (!f || !game.cities[f.city]) return null;
    return Math.max(0, 1 - (game.turn - f.turn) / FORTRESS_DISMANTLE);
  },
  // le banni reprend sa forteresse avant qu'elle soit démantelée : le Sort de Retour avance d'autant, la forteresse renaîtra ici
  reclaimFortress(game, pl, city) {
    const frac = Game.fortressLeft(game, pl);
    pl.fallen = null;
    if (!pl.banished || !frac) return;
    if (!pl.casting || pl.casting.id !== 'spell_of_return') pl.casting = { id: 'spell_of_return', progress: 0, cost: Magic.spellCost(game, pl, 'spell_of_return', false), target: null };
    const c = pl.casting;
    c.target = { city: city.id };
    c.progress = Math.min(c.cost, c.progress + Math.round(c.cost * frac));
    if (c.progress >= c.cost) {
      pl.casting = null;
      Spells.apply(game, pl, 'spell_of_return', c.target);
      Game.log(game, pl.id, 'Vous reprenez ' + city.name + ' avant que vos ennemis aient pu toucher à la forteresse : vous revenez aussitôt !', { city: city.id });
      return;
    }
    const turns = Math.ceil((c.cost - c.progress) / Math.max(1, Magic.totalSkill(game, pl)));
    Game.log(game, pl.id, 'Vous reprenez ' + city.name + ' alors que la forteresse était démantelée à ' + Math.round((1 - frac) * 100) + ' %. Votre Sort de Retour est accompli à ' + Math.floor(c.progress / c.cost * 100) + ' % et vous reviendrez ici dans ' + U.n(turns, 'tour') + ' au plus tôt.', { city: city.id });
  },
  // fin du démantèlement
  tickFallen(game) {
    for (const pl of game.players) {
      const f = pl.fallen; if (!f) continue;
      const c = game.cities[f.city];
      if (!c || !pl.alive) { pl.fallen = null; continue; }
      if (game.turn - f.turn >= FORTRESS_DISMANTLE) {
        pl.fallen = null;
        Game.log(game, pl.id, 'La forteresse de ' + c.name + ' est entièrement démantelée : la reprendre ne hâtera plus votre retour.', { city: c.id });
        if (c.owner >= 0 && c.owner !== pl.id) Game.log(game, c.owner, 'Vos troupes ont fini de démanteler la forteresse de ' + pl.name + ' à ' + c.name + '.', { city: c.id });
      }
    }
  },
  // (0.31.45) la chute d'un sorcier (banni, ou vaincu pour de bon) : l'écran l'annonce au joueur, au centre, avec son illustration
  noteFall(game, f) {
    f.turn = game.turn;
    (game.falls = game.falls || []).push(f);
    if (game.falls.length > 24) game.falls.splice(0, game.falls.length - 24);
  },
  checkElimination(game) {
    for (const pl of game.players) {
      if (!pl.alive) continue;
      const cities = Cities.ofPlayer(game, pl.id).length;
      if (!cities && (pl.banished || !game.cities[pl.fortress])) {
        pl.alive = false;
        if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'eliminated', { a: pl.id, pub: true });
        Game.noteFall(game, { kind: 'defeated', who: pl.id, by: pl.lastLostTo != null ? pl.lastLostTo : -1 });
        Game.raiseTomb(game, pl);
        for (const u of Object.values(game.units)) if (u.owner === pl.id) Units.remove(game, u);
        for (const c of Object.values(game.cities)) c.ench = c.ench.filter(e => e.owner !== pl.id);
        // ses nœuds se délient
        for (const st of game.sites) if (st.type === 'node' && st.owner === pl.id) { st.owner = -1; st.meldBy = null; }
        Game.logEach(game, v => U.cap(Players.nameFor(game, v, pl.id)) + ' a été vaincu et disparaît de ce monde.');
      }
    }
    const alive = game.players.filter(p => p.alive);
    const human = game.players.find(p => p.human);
    if (!game.over && human && !human.alive) { game.over = true; game.winner = null; game.overWhy = 'defeat'; Game.log(game, human.id, 'Défaite. Votre règne s\'achève.'); }
    if (!game.over && alive.length === 1) { game.over = true; game.winner = alive[0].id; game.overWhy = 'conquest'; Game.log(game, -1, alive[0].name + ' règne désormais sans partage sur les deux plans !'); }
  },

  // ---------- aura des nœuds (MoM) : le nœud et les cases qui l'entourent, autant que sa puissance ;
  // une fois le nœud lié, elle scintille aux couleurs du sorcier. L'ordre de croissance est fixe (tiré de l'identité du nœud),
  // si bien qu'un nœud qui s'éveille étend son aura sans la redessiner.
  AURA_MAX: 30,
  auraOrder(game, s) {
    if (s._auraOrd) return s._auraOrd;
    const w = game.world, out = [[s.x, s.y]], seen = new Set([s.y * w.w + s.x]), jit = {};
    let h = (Math.imul(s.id + 1, 2654435761) ^ (s.x * 40503 + s.y * 9973 + s.plane * 7919)) >>> 0 || 1;
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    while (out.length < Game.AURA_MAX) {
      let best = null, bv = -1;
      for (const [ax, ay] of out) for (const [dx, dy] of U.DIRS8) {
        const ny = ay + dy; if (ny < 0 || ny >= w.h) continue;
        const nx = World.wx(w, ax + dx), k = ny * w.w + nx; if (seen.has(k)) continue;
        const si = World.get(w, s.plane, 'site', nx, ny);
        if (si >= 0 && game.sites[si] && game.sites[si].type === 'node') continue; // pas sur un autre nœud
        if (jit[k] == null) jit[k] = rnd();
        let ddx = Math.abs(nx - s.x); ddx = Math.min(ddx, w.w - ddx);
        const v = Math.pow(0.45, Math.hypot(ddx, ny - s.y)) * (0.15 + jit[k]);
        if (v > bv) { bv = v; best = [nx, ny, k]; }
      }
      if (!best) break;
      seen.add(best[2]); out.push([best[0], best[1]]);
    }
    Object.defineProperty(s, '_auraOrd', { value: out, enumerable: false, configurable: true, writable: true });
    return out;
  },
  aura(game, s) { return Game.auraOrder(game, s).slice(0, Math.max(1, Math.min(Game.AURA_MAX, s.power || 1))); },
  // le nœud dont l'aura couvre cette case (ou null)
  auraAt(game, plane, x, y) {
    x = World.wx(game.world, x);
    for (const s of game.sites) {
      if (s.type !== 'node' || s.plane !== plane || World.dist(game.world, s.x, s.y, x, y) > 5) continue;
      if (Game.aura(game, s).some(([ax, ay]) => ax === x && ay === y)) return s;
    }
    return null;
  },

  // ---------- nœuds qui s'éveillent : un nœud tenu longtemps gagne en puissance et engendre ses gardiens ----------
  NODE_SPAWN: { sorcery: ['Nagas', 'Nagas', 'AirElemental'], nature: ['WarBear', 'WarBear', 'EarthElemental'], chaos: ['HellHounds', 'HellHounds', 'FireGiant'] },
  NODE_AWAKE_AT: [20, 45, 80],
  nodesTick(game) {
    for (const s of game.sites) {
      if (s.type !== 'node') continue;
      if (s.basePower == null) s.basePower = s.power;
      if (s.owner !== s.heldBy) {
        // nouveau maître : l'éveil repart de zéro, les gardiens de l'ancien maître se dissipent
        for (const u of Object.values(game.units)) if (u.nodeBound === s.id) Units.remove(game, u);
        s.heldBy = s.owner; s.heldSince = game.turn; s.awake = 0; s.power = s.basePower; s.lastSpawn = game.turn;
        continue;
      }
      if (s.owner < 0 || !game.players[s.owner] || !game.players[s.owner].alive) continue;
      const held = game.turn - s.heldSince;
      const lvl = Game.NODE_AWAKE_AT.filter(t => held >= t).length;
      if (lvl > (s.awake || 0)) {
        s.awake = lvl; s.power = s.basePower + 2 * lvl;
        Game.log(game, s.owner, 'Le ' + Game.siteName(s) + ' s\'éveille (éveil ' + lvl + '/3) : puissance ' + s.power + (lvl === 1 ? ', et il engendrera désormais ses propres gardiens' : '') + '.', { x: s.x, y: s.y, plane: s.plane });
      }
      if (!s.awake) continue;
      const bound = Object.values(game.units).filter(u => u.nodeBound === s.id);
      if (bound.length >= s.awake || game.turn - (s.lastSpawn || 0) < 12) continue;
      if (Move.stackCount(game, s.plane, s.x, s.y, s.owner) >= MAX_STACK) continue;
      if (Units.at(game, s.plane, s.x, s.y).some(u => u.owner !== s.owner)) continue;
      const type = Game.NODE_SPAWN[s.realm][Math.min(2, s.awake - 1)];
      if (!DATA.units[type]) continue;
      const u = Units.create(game, type, s.owner, s.plane, s.x, s.y);
      u.nodeBound = s.id; u.status = 'sentry'; u.moves = 0;
      s.lastSpawn = game.turn;
      Game.log(game, s.owner, 'Le ' + Game.siteName(s) + ' engendre un gardien : ' + Units.label(u) + ' (sans entretien, il ne s\'éloigne pas à plus de 2 cases du nœud).', { x: s.x, y: s.y, plane: s.plane, minor: true });
    }
  },

  // ---------- promotion des vétérans ----------
  PROMOTE: {
    Spearmen: ['Swordsmen', 'Halberdiers', 'Pikemen'], Swordsmen: ['Halberdiers', 'Pikemen', 'Berserkers', 'Hammerhands', 'Minotaurs', 'Nightblades'],
    Halberdiers: ['Pikemen'], Bowmen: ['Longbowmen', 'Horsebowmen', 'Rangers'], Slingers: [], Javelineers: [], Cavalry: ['Paladins', 'Elven Lords', 'Wolf Riders'],
    Shamans: ['Priests'], Magicians: ['Warlocks'],
  },
  promoteOptions(game, u) {
    if (!u || u.hero || !Units.isNormal(u) || Units.levelIndex(game, u) < 2) return [];
    const c = Cities.at(game, u.plane, u.x, u.y);
    if (!c || c.owner !== u.owner) return [];
    const d = DATA.units[u.type], race = DATA.races[d.race];
    const targets = Game.PROMOTE[d.en] || [];
    if (!race) return [];
    const e = Cities.econ(game, c);
    return race.units.filter(t => targets.includes(DATA.units[t].en) && Cities.canBuildUnit(game, c, t)).map(t => {
      const diff = Cities.unitCost(game, c, t, e) - Cities.unitCost(game, c, u.type, e);
      return { type: t, cost: Math.max(20, Math.round(diff * 2 / 5) * 5) };
    });
  },
  promote(game, uid, type) {
    const u = game.units[uid]; if (!u) return { ok: false, why: 'Unité disparue.' };
    const opt = Game.promoteOptions(game, u).find(o => o.type === type);
    if (!opt) return { ok: false, why: 'Promotion impossible ici.' };
    const pl = game.players[u.owner];
    if (pl.gold < opt.cost) return { ok: false, why: 'Or insuffisant (' + opt.cost + ' requis).' };
    const old = Units.label(u), hpBefore = Units.health(game, u);
    pl.gold -= opt.cost;
    u.type = type; u.moves = 0;
    const s = Units.stats(game, u);
    u.dmg = Math.max(0, s.maxHp - Math.max(1, hpBefore));
    Game.log(game, u.owner, old + ' promus : ' + Units.label(u) + ', grade conservé (' + Units.levelInfo(game, u).name + ').', { x: u.x, y: u.y, plane: u.plane });
    return { ok: true };
  },

  // ---------- gouverneurs : un héros posté dans une cité la gère ----------
  setGovernor(game, uid) {
    const u = game.units[uid]; if (!u || !u.hero || u.avatar) return { ok: false, why: 'Seul un héros peut gouverner.' };
    const c = Cities.at(game, u.plane, u.x, u.y);
    if (!c || c.owner !== u.owner) return { ok: false, why: 'Le héros doit se trouver dans une de vos cités.' };
    const cur = Cities.governor(game, c);
    if (cur && cur !== u) { cur.status = ''; cur.govCity = null; }
    u.status = 'governor'; u.govCity = c.id; u.path = null; u.dest = null;
    Game.log(game, u.owner, u.hero.name + ' gouverne désormais ' + c.name + '.', { city: c.id });
    return { ok: true, city: c };
  },

  // ---------- le sorcier en personne ----------
  avatarOf(game, pl) { return Object.values(game.units).find(u => u.avatar && u.owner === pl.id) || null; },
  avatarStats(pl) {
    const B = U.sum(Object.values(pl.books));
    const realm = U.max(REALMS5.filter(r => pl.books[r] > 0), r => pl.books[r]) || 'sorcery';
    const ab = { life: { healer: true, dispelEvil: true }, death: { lifeSteal: true, deathImmunity: true }, chaos: { fireImmunity: true, armorPiercing: true }, nature: { forester: true, poisonImmunity: true, regeneration: true }, sorcery: { flying: true, illusionsImmunity: true } }[realm];
    return { realm, melee: 2 + Math.floor(B / 3), ranged: 2 + Math.floor(B / 2), def: 1 + Math.floor(B / 4), res: Math.floor(B / 3), hp: 6 + B, caster: 15 + 2 * B, ab };
  },
  summonAvatar(game, pl) {
    if (Game.avatarOf(game, pl)) return { ok: false, why: 'Vous êtes déjà sur la carte.' };
    const c = game.cities[pl.fortress]; if (!c) return { ok: false, why: 'Il faut votre forteresse.' };
    const at = Spells.spotNear(game, pl, c, 'WizardAvatar'); if (!at) return { ok: false, why: 'Aucune place près de la forteresse.' };
    const u = Units.create(game, 'WizardAvatar', pl.id, at[0], at[1], at[2]);
    u.avatar = Game.avatarStats(pl);
    u.hero = { name: pl.name, title: 'Sorcier', extra: {}, slots: ['anyWeapon', 'armor', 'jewelry'], lvlSeen: 0 };
    u.items = [null, null, null];
    // retour sur la carte après avoir regagné la tour : l'expérience, les talents et les objets reviennent
    const sv = pl.avatarSave;
    if (sv) { u.xp = sv.xp || 0; Object.assign(u.hero, sv.hero || {}, { name: pl.name, title: 'Sorcier', slots: ['anyWeapon', 'armor', 'jewelry'] }); if (sv.items) u.items = sv.items.slice(0, 3); delete pl.avatarSave; }
    u.moves = 0;
    Game.log(game, pl.id, pl.name + ' descend en personne sur la carte. Votre compétence de lancement est réduite de moitié tant que vous y restez, et si vous tombez, vous serez banni.', { unit: u.id, x: c.x, y: c.y, plane: c.plane });
    return { ok: true, unit: u };
  },
  // l'avatar meurt : le sorcier perd sa forteresse et doit lancer le Sort de Retour
  avatarFell(game, u) {
    const pl = game.players[u.owner]; if (!pl || !pl.alive || pl.banished) return;
    const c = game.cities[pl.fortress];
    if (c) { c.fortress = false; delete c.buildings.fortress; delete c.buildings.magicRelay; }
    Game.logEach(game, v => v === pl.id ? 'Votre avatar est tombé au combat : vous perdez votre forteresse.' : U.cap(Players.nameFor(game, v, pl.id)) + ' est tombé au combat, en personne !');
    Game.banish(game, pl, null, null, 'avatar');
  },

  // ---------- reliques du vaincu : le tombeau d'un sorcier éliminé garde ses sorts ----------
  raiseTomb(game, pl) {
    const at = pl.lastFortress || (game.cities[pl.fortress] ? { plane: game.cities[pl.fortress].plane, x: game.cities[pl.fortress].x, y: game.cities[pl.fortress].y } : null);
    if (!at) return null;
    const world = game.world;
    let best = null, bd = 1e9;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = World.wx(world, at.x + dx), y = at.y + dy;
      if (y < 1 || y >= world.h - 1) continue;
      const t = World.terr(world, at.plane, x, y);
      if (World.isWater(t) || t === T.SNODE || t === T.NNODE || t === T.CNODE || (t === T.MOUNTAIN && Move.mountainsBlock(game))) continue;
      if (World.get(world, at.plane, 'site', x, y) >= 0 || Cities.at(game, at.plane, x, y) || Units.at(game, at.plane, x, y).length) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy)) + (dx === 0 && dy === 0 ? 9 : 0);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (!best) return null;
    // ses sorts, les plus rares d'abord
    const rank = { veryrare: 4, rare: 3, uncommon: 2, common: 1 };
    const spells = pl.known.filter(id => DATA.spells[id] && DATA.spells[id].realm !== 'arcane' && id !== 'spell_of_mastery')
      .sort((a, b) => (rank[DATA.spells[b].rarity] || 0) - (rank[DATA.spells[a].rarity] || 0));
    const strong = game.turn > 120 ? 2 : game.turn > 70 ? 1 : 0;
    const guardians = [['Ghoul', 'Ghoul', 'Skeleton', 'Skeleton', 'Skeleton'], ['Wraith', 'Ghoul', 'Ghoul', 'Skeleton', 'Skeleton'], ['Wraith', 'Wraith', 'NightStalker', 'Ghoul', 'Ghoul']][strong];
    const s = MapGen.addSite(game, { type: 'tomb', plane: at.plane, x: best[0], y: best[1], cleared: false, guardians, budget: 500 + strong * 300, tier: 3,
      relic: { wizard: pl.name, spells: spells.slice(0, 12), items: (pl.vault || []).slice(0, 3), gold: Math.floor((pl.gold || 0) / 2) } });
    Game.logEach(game, v => 'Le ' + Game.siteName(s) + ' se dresse là où régnait ' + Players.nameFor(game, v, pl.id) + ' : ses sorts y reposent, sous bonne garde.', { x: s.x, y: s.y, plane: s.plane });
    return s;
  },

  // ---------- trésors ----------
  async lootSite(game, site, pid, survivors) {
    const pl = game.players[pid];
    const rng = game.rng;
    let budget = site.budget || 100;
    const found = [];
    if (site.type === 'node') {
      Game.log(game, pid, 'Le ' + Game.siteName(site) + ' est libéré de ses gardiens. Faites-y fusionner un esprit magique pour en capter la puissance.', { x: site.x, y: site.y, plane: site.plane });
      return found;
    }
    if (site.type === 'tower') {
      // la tour relie les deux plans ; sa jumelle est dégagée aussi
      for (const s2 of game.sites) if (s2.type === 'tower' && s2.x === site.x && s2.y === site.y) s2.cleared = true;
    }
    if (site.type === 'breach') return Crisis.closed(game, site, pid, survivors);
    if (site.finale) return Finale.siteCleared(game, site, pid, survivors);
    if (!pl) return found;
    Book.onLoot(game, site, pid, found);
    if (site.type === 'tomb' && site.relic) {
      const r = site.relic;
      const learnt = r.spells.filter(id => !pl.known.includes(id) && !(DATA.spells[id].realm === 'life' && pl.books.death) && !(DATA.spells[id].realm === 'death' && pl.books.life)).slice(0, 3);
      for (const id of learnt) { Magic.learn(game, pl, id); found.push('le sort ' + DATA.spells[id].name); }
      for (const it of r.items) { pl.vault.push(it); found.push(it.name + ' (au coffre)'); }
      const g = Math.max(50, r.gold); pl.gold += g; found.push(g + ' pièces d\'or');
      if (!learnt.length) { pl.mana += 150; found.push('150 cristaux de mana (aucun sort nouveau pour vous)'); }
      Game.log(game, pid, Game.siteName(site) + ' pillé : ' + found.join(', ') + '.', { x: site.x, y: site.y, plane: site.plane, modal: !!pl.human });
      if (Game.hooks.choose && pl.human) await Game.hooks.choose(game, pid, { type: 'treasure', site, found });
      return found;
    }
    // tirage du butin d'après le budget du lieu
    const roll = () => rng.weighted(['gold', 'mana', 'item', 'spell', 'hero', 'pick'], k => ({ gold: 4, mana: 3, item: budget > 150 ? 3 : 1, spell: budget > 200 ? 2 : 0.5, hero: budget > 300 ? 1 : 0, pick: budget > 900 ? 0.6 : 0 }[k]));
    let n = 1 + (budget > 400 ? 1 : 0) + (budget > 1000 ? 1 : 0);
    if (site.type === 'tower') n++;
    for (let i = 0; i < n; i++) {
      const k = i === 0 && site.type === 'tower' ? 'spell' : roll();
      if (k === 'gold') { const g = Math.round(budget * (0.3 + rng.next() * 0.5) / 5) * 5 + 20; pl.gold += g; found.push(g + ' pièces d\'or'); }
      else if (k === 'mana') { const m = Math.round(budget * (0.3 + rng.next() * 0.5) / 5) * 5 + 20; pl.mana += m; found.push(m + ' cristaux de mana'); }
      else if (k === 'item') { const it = Items.random(game, Math.min(5, 1 + Math.floor(budget / 300))); const h = survivors.find(u => u.hero && Items.canEquip(u, it) && Items.freeSlot(u, it) >= 0); if (h) { h.items[Items.freeSlot(h, it)] = it; found.push(it.name + ' (équipé par ' + h.hero.name + ')'); } else { pl.vault.push(it); found.push(it.name + ' (au coffre)'); } }
      else if (k === 'spell') {
        const r = budget > 1200 ? 'veryrare' : budget > 600 ? 'rare' : budget > 250 ? 'uncommon' : 'common';
        const cands = Object.values(DATA.spells).filter(s => s.rarity === r && s.inGame !== false && !pl.known.includes(s.id) && s.realm !== 'arcane' && (pl.human || s.kind !== 'stackEnchant') && (pl.books[s.realm] > 0 || rng.chance(0.3)) && !(s.realm === 'life' && pl.books.death) && !(s.realm === 'death' && pl.books.life) && s.id !== 'spell_of_mastery');
        if (cands.length) { const s = rng.pick(cands); Magic.learn(game, pl, s.id); found.push('le sort ' + s.name); } else { pl.mana += 100; found.push('100 cristaux de mana'); }
      }
      else if (k === 'hero') { const h = Heroes.heroCount(game, pl) < 6 ? Heroes.randomAvailable(game, pl, true) : null; if (h) { const at = Spells.spotNear(game, pl, { plane: site.plane, x: site.x, y: site.y }, h.unit) || [site.plane, site.x, site.y]; const u = Heroes.spawn(game, pl, h, at[0], at[1], at[2], HERO_LEVELS[Heroes.eraLevel(game)].xp); found.push('le héros prisonnier ' + u.hero.name); } else { pl.gold += 100; found.push('100 pièces d\'or'); } }
      else if (k === 'pick') {
        const realm = U.max(REALMS5.filter(r => pl.books[r] > 0 && pl.books[r] < 13), r => pl.books[r] + rng.next());
        if (realm) { pl.books[realm]++; Magic.addPoolForBook(game, pl, realm); found.push('un livre de magie ' + REALM_NAMES[realm].toLowerCase()); }
        else { pl.mana += 200; found.push('200 cristaux de mana'); }
      }
    }
    Game.log(game, pid, Game.siteName(site) + ' pillé : ' + found.join(', ') + '.', { x: site.x, y: site.y, plane: site.plane, modal: !!pl.human });
    if (Game.hooks.choose && pl.human) await Game.hooks.choose(game, pid, { type: 'treasure', site, found });
    return found;
  },

  // ---------- actions d'unités ----------
  foundCity(game, uid) {
    const u = game.units[uid]; if (!u || !Units.isSettler(u)) return { ok: false, why: 'Seuls les colons fondent des cités.' };
    const chk = Cities.canFoundAt(game, u.owner, u.plane, u.x, u.y);
    if (!chk.ok) return chk;
    const race = DATA.units[u.type].race;
    const c = Cities.create(game, u.owner, race, u.plane, u.x, u.y, { pop: 1000 });
    Cities.setProduction(game, c, { type: 'building', id: Cities.canBuild(game, c, 'buildersHall') ? 'buildersHall' : 'barracks' });
    Units.remove(game, u);
    const pl = game.players[c.owner];
    if (pl) { Move.reveal(game, pl, c.plane, c.x, c.y, 2); Game.log(game, c.owner, 'Fondation de ' + c.name + '.', { city: c.id }); }
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'city_new', { a: c.owner, c: c.name, plane: c.plane, x: c.x, y: c.y });
    return { ok: true, city: c };
  },
  // peut-on fusionner ici ? (sans rien changer) : la raison du refus, ou ce que la fusion fera
  canMeld(game, u) {
    if (!u || !Units.has(game, u, 'meld')) return { ok: false, why: 'Cette unité ne peut pas fusionner.' };
    const si = World.get(game.world, u.plane, 'site', u.x, u.y), s = si >= 0 ? game.sites[si] : null;
    if (!s || s.type !== 'node') return { ok: false, why: 'Il faut se trouver sur un nœud.', off: true };
    if (s.devoured) return { ok: false, why: 'Ce nœud a été dévoré : il n\'y reste rien à lier.' };
    if (Game.siteHasGuardians(s)) return { ok: false, why: 'Le nœud est encore gardé.' };
    // le nœud d'un sorcier en paix ou allié : comme l'IA, on ne le lui prend pas sans rompre le traité d'abord
    const op = s.owner >= 0 && s.owner !== u.owner ? game.players[s.owner] : null, st = op ? (game.players[u.owner].diplo || {})[op.id] : null;
    if (op && (st === 'peace' || st === 'alliance')) return { ok: false, why: 'Ce nœud appartient à ' + Players.nameFor(game, u.owner, op.id) + ', avec qui vous êtes ' + (st === 'peace' ? 'en paix' : 'allié') + ' : rompez d\'abord le traité.' };
    const guardian = u.type === 'GuardianSpirit', heldByGuardian = s.meldBy === 'GuardianSpirit';
    if (s.owner === u.owner) return !guardian || heldByGuardian ? { ok: false, why: 'Ce nœud vous appartient déjà' + (heldByGuardian ? ', et un esprit gardien le garde.' : '.') } : { ok: true, what: 'Relever la garde de votre nœud : un esprit gardien le défend bien mieux contre les esprits rivaux.' };
    const fail = s.owner < 0 ? 0 : heldByGuardian ? (guardian ? 0.25 : 0.75) : (guardian ? 0 : 0.25);
    return { ok: true, what: 'Lier ce nœud à votre puissance (l\'esprit est consommé)' + (fail ? ' ; ' + Math.round(fail * 100) + ' % de risque d\'échec contre l\'esprit qui le tient.' : '.') };
  },
  meld(game, uid) {
    const u = game.units[uid]; const chk = Game.canMeld(game, u); if (!chk.ok) return chk;
    const si = World.get(game.world, u.plane, 'site', u.x, u.y);
    const s = game.sites[si];
    // l'esprit gardien prend le dessus sur l'esprit magique : il peut relever la garde d'un de vos nœuds liés par un esprit
    // magique, et un nœud qu'il garde résiste bien mieux aux esprits adverses (75 % d'échec pour un esprit magique, 25 % pour
    // un esprit gardien ; un nœud lié par un esprit magique : 25 % d'échec pour un esprit magique, aucun pour un gardien)
    const guardian = u.type === 'GuardianSpirit', heldByGuardian = s.meldBy === 'GuardianSpirit';
    if (s.owner === u.owner) {
      if (!guardian || heldByGuardian) return { ok: false, why: 'Ce nœud vous appartient déjà.' };
      s.meldBy = 'GuardianSpirit'; Units.remove(game, u);
      Game.log(game, s.owner, 'Un esprit gardien relève la garde du ' + Game.siteName(s) + ' : les esprits rivaux auront bien du mal à vous le prendre.', { x: s.x, y: s.y, plane: s.plane });
      return { ok: true };
    }
    const fail = s.owner < 0 ? 0 : heldByGuardian ? (guardian ? 0.25 : 0.75) : (guardian ? 0 : 0.25);
    if (fail && game.rng.chance(fail)) { Units.remove(game, u); return { ok: true, failed: true, why: heldByGuardian ? 'L\'esprit gardien du nœud repousse le vôtre, qui se dissipe.' : 'L\'esprit échoue à arracher le nœud et se dissipe.' }; }
    const prev = s.owner;
    s.owner = u.owner; s.cleared = true; s.meldBy = guardian ? 'GuardianSpirit' : 'MagicSpirit'; s.warped = null;
    Units.remove(game, u);
    Game.log(game, s.owner, 'Le ' + Game.siteName(s) + ' est désormais lié à votre puissance : son aura de ' + Game.aura(game, s).length + ' cases s\'illumine à vos couleurs (+' + Magic.nodePower(game, game.players[s.owner], s) + ' de magie par tour).', { x: s.x, y: s.y, plane: s.plane });
    if (prev >= 0) Game.log(game, prev, 'Un rival s\'est emparé de l\'un de vos nœuds magiques.', { x: s.x, y: s.y, plane: s.plane });
    // 0.31.29 : le joueur volé l'apprend au centre de l'écran, au début de son tour
    if (prev >= 0 && game.players[prev] && game.players[prev].human) (game.players[prev].nodesLost = game.players[prev].nodesLost || []).push({ site: si, by: u.owner, turn: game.turn, guardian });
    return { ok: true };
  },
  buildRoad(game, ids) {
    const us = Game.unitsOf(game, ids).filter(u => Units.isEngineer(u)); if (!us.length) return { ok: false, why: 'Il faut un ingénieur.' };
    const u0 = us[0];
    if (World.hasRoad(game.world, u0.plane, u0.x, u0.y)) return { ok: false, why: 'Il y a déjà une route ici.' };
    if (!DATA.terrain[World.terrainKey(game.world, u0.plane, u0.x, u0.y)].roadTurns) return { ok: false, why: 'Impossible d\'empierrer ce terrain.' };
    for (const u of us) { u.status = 'road'; u.roadPlan = null; }
    return { ok: true };
  },
  // route sur tout un itinéraire : les ingénieurs empierrent case après case jusqu'à la destination
  // le tracé, sans rien ordonner (aussi pour l'aperçu au survol)
  roadPlanFor(game, ids, tx, ty) {
    const units = Game.unitsOf(game, ids).filter(u => Units.isEngineer(u) && u.owner === (Game.unitsOf(game, ids)[0] || {}).owner);
    if (!units.length) return { ok: false, why: 'Il faut un ingénieur.' };
    const u0 = units[0], pl = game.players[u0.owner], plane = u0.plane, world = game.world;
    tx = World.wx(world, tx);
    if (tx === u0.x && ty === u0.y) return { ok: false, why: 'Choisissez une autre case que celle des ingénieurs.' };
    // le tracé le plus court et le plus vite empierré, pas le trajet le plus facile à pied
    const path = Move.roadPath(game, units, plane, tx, ty, { omniscient: !pl });
    if (!path) return { ok: false, why: 'Aucun chemin jusque-là.' };
    const tiles = [[u0.x, u0.y]].concat(path.map(p => [p.x, p.y]));
    const todo = tiles.filter(([x, y]) => !World.hasRoad(world, plane, x, y));
    const mult = U.sum(units, u => DATA.units[u.type].race === 'dwarf' ? 2 : 1);
    const turns = U.sum(todo, ([x, y]) => Math.ceil((DATA.terrain[World.terrainKey(world, plane, x, y)].roadTurns || 4) / mult));
    return { ok: true, units, plane, tiles, todo: todo.length, turns };
  },
  roadTo(game, ids, tx, ty) {
    const r = Game.roadPlanFor(game, ids, tx, ty); if (!r.ok) return r;
    for (const u of r.units) { u.roadPlan = { plane: r.plane, tiles: r.tiles }; u.status = 'roadto'; u.path = null; u.dest = null; }
    return { ok: true, tiles: r.tiles.length, todo: r.todo, turns: r.turns };
  },
  // avancement d'un chantier : case en cours (fait / requis, tours restants) et, pour une route tracée, l'itinéraire
  roadProgress(game, u) {
    const world = game.world, p = u.plane, pl = world.planes[p];
    const crew = Units.at(game, p, u.x, u.y).filter(o => o.owner === u.owner && Units.isEngineer(o) && (o.status === 'road' || o.status === 'roadto'));
    const rate = Math.max(1, U.sum(crew, o => DATA.units[o.type].race === 'dwarf' ? 2 : 1));
    const turnsOf = (x, y) => (DATA.terrain[World.terrainKey(world, p, x, y)].roadTurns || 4);
    const here = World.hasRoad(world, p, u.x, u.y) ? null : { work: pl.roadWork[u.x + ',' + u.y] || 0, need: turnsOf(u.x, u.y) };
    if (here) here.left = Math.ceil(Math.max(0, here.need - here.work) / rate);
    const out = { here, rate };
    const plan = u.status === 'roadto' && u.roadPlan && u.roadPlan.plane === p ? u.roadPlan.tiles : null;
    if (plan) {
      const i = Math.max(0, plan.findIndex(([x, y]) => x === u.x && y === u.y));
      const rest = plan.slice(i), todo = rest.filter(([x, y]) => !World.hasRoad(world, p, x, y));
      out.total = plan.length; out.done = plan.filter(([x, y]) => World.hasRoad(world, p, x, y)).length; out.dest = plan[plan.length - 1];
      out.turns = U.sum(todo, ([x, y]) => Math.ceil(Math.max(0, turnsOf(x, y) - (pl.roadWork[x + ',' + y] || 0)) / rate));
    }
    return out;
  },
  // prochaine case du plan sans route, à partir de la position de l'ingénieur
  roadNext(game, u) {
    const plan = u.roadPlan; if (!plan || plan.plane !== u.plane) return null;
    const i = plan.tiles.findIndex(([x, y]) => x === u.x && y === u.y);
    return (i >= 0 ? plan.tiles.slice(i) : plan.tiles).find(([x, y]) => !World.hasRoad(game.world, u.plane, x, y)) || null;
  },
  purify(game, ids) {
    for (const u of Game.unitsOf(game, ids)) if (Units.has(game, u, 'purify')) u.status = 'purify';
    return { ok: true };
  },
  // Porte tellurique : d'une cité qui en a une à une autre du même plan, pour 1 point de mouvement
  earthGateCities(game, from) { return Cities.ofPlayer(game, from.owner).filter(c => c !== from && c.plane === from.plane && Cities.hasEnch(c, 'earth_gate')); },
  earthGate(game, ids, cityId) {
    const units = Game.unitsOf(game, ids); if (!units.length) return { ok: false, why: 'Aucune unité.' };
    const u0 = units[0], from = Cities.at(game, u0.plane, u0.x, u0.y), to = game.cities[cityId];
    if (!from || from.owner !== u0.owner || !Cities.hasEnch(from, 'earth_gate')) return { ok: false, why: 'Il faut se tenir dans une cité dotée d\'une porte tellurique.' };
    if (!to || !Game.earthGateCities(game, from).includes(to)) return { ok: false, why: 'Il faut une autre de vos cités dotée d\'une porte tellurique, sur le même plan.' };
    if (units.some(u => u.moves < 2)) return { ok: false, why: 'Il faut un point de mouvement à chaque unité.' };
    if (Move.stackCount(game, to.plane, to.x, to.y, u0.owner) + units.length > MAX_STACK) return { ok: false, why: to.name + ' ne peut accueillir autant d\'unités (9 au plus).' };
    for (const u of units) { u.x = to.x; u.y = to.y; u.moves -= 2; u.path = null; u.dest = null; if (u.status === 'goto') u.status = ''; }
    const pl = game.players[u0.owner]; if (pl) for (const u of units) Move.revealUnit(game, pl, u);
    return { ok: true };
  },
  // ce qui empêcherait ces unités de passer dans l'autre plan depuis (plane, x, y) ; null si rien.
  // noMoves : on ne regarde pas le mouvement restant (pour savoir d'avance si un passage servira)
  planeShiftBlock(game, units, plane, x, y, noMoves) {
    const u0 = units[0];
    const si = World.get(game.world, plane, 'site', x, y);
    const atTower = si >= 0 && (game.sites[si].type === 'tower' && game.sites[si].cleared || game.sites[si].type === 'rift' && !game.sites[si].closed);
    const city = Cities.at(game, plane, x, y);
    const gate = city && city.owner === u0.owner && Cities.hasEnch(city, 'astral_gate');
    const gi = Move.groupInfo(game, units);
    if (!atTower && !gate && !gi.planeShift) return units.some(u => Units.has(game, u, 'planeShift')) ? 'Hors d\'une tour, d\'une faille ou d\'une porte astrale, toutes les unités de la pile doivent savoir sauter de plan.' : 'Il faut une tour de sorcellerie, une faille, une porte astrale ou la capacité de saut de plan.';
    if (game.players.some(p => p.alive && p.globals.includes('planar_seal'))) return 'Le Sceau planaire bloque tout passage.';
    // passer d'un plan à l'autre prend le reste du tour : il faut encore du mouvement, et rien de figé
    if (!noMoves && units.some(u => u.moves <= 0)) return 'Il faut encore du mouvement pour passer dans l\'autre plan.';
    if (units.some(u => u.stasis)) return 'Une unité figée dans la stase ne peut pas passer.';
    const np = 1 - plane;
    if (!atTower && !Move.canStand(game, units, gi, np, x, y, u0.owner)) return 'Le terrain de l\'autre plan est impraticable.';
    if (Move.hostileAt(game, u0.owner, np, x, y) || (Cities.at(game, np, x, y) && Cities.at(game, np, x, y).owner !== u0.owner)) return 'Une force ennemie occupe la case de l\'autre plan.';
    if (Move.stackCount(game, np, x, y, u0.owner) + units.length > MAX_STACK) return 'Trop d\'unités vous attendent déjà de l\'autre côté (9 au plus par case).';
    const nsi = World.get(game.world, np, 'site', x, y);
    if (nsi >= 0 && Game.siteHasGuardians(game.sites[nsi])) return 'Des gardiens occupent la case de l\'autre plan.';
    return null;
  },
  planeShift(game, ids) {
    const units = Game.unitsOf(game, ids); if (!units.length) return { ok: false };
    const u0 = units[0];
    const why = Game.planeShiftBlock(game, units, u0.plane, u0.x, u0.y);
    if (why) return { ok: false, why };
    const np = 1 - u0.plane;
    for (const u of units) { u.plane = np; u.moves = 0; u.path = null; u.dest = null; u.roadPlan = null; u.attackOrder = false; if (['goto', 'roadto', 'explore', 'autopurify'].includes(u.status)) u.status = ''; }
    const pl = game.players[u0.owner]; if (pl) Move.reveal(game, pl, np, u0.x, u0.y, 2);
    Veil.onCross(game, pl, units.length);
    return { ok: true };
  },
  disband(game, uid) { const u = game.units[uid]; if (u) { if (u.avatar) u.recalled = true; Units.remove(game, u); } return { ok: true }; },

  // ---------- cités ----------
  buy(game, cid) {
    const c = game.cities[cid]; const pl = game.players[c.owner];
    const price = Cities.buyPrice(game, c);
    if (!price || pl.gold < price) return { ok: false, why: 'Or insuffisant.' };
    pl.gold -= price; c.progress = Cities.prodCost(game, c);
    c.bought = true;
    return { ok: true, price };
  },
  // ce qui empêche de vendre un bâtiment : un autre bâtiment, l'ouvrage en cours ou un ouvrage de la file qui en dépend
  sellBlock(c, b) {
    for (const o of Object.keys(c.buildings)) if (DATA.buildings[o] && (DATA.buildings[o].requires || []).includes(b)) return DATA.buildings[o].name + ' en dépend.';
    const needs = it => it && (it.type === 'building' ? (DATA.buildings[it.id] && DATA.buildings[it.id].requires || []) : it.type === 'unit' ? (DATA.units[it.id] && DATA.units[it.id].requires || []) : []).includes(b);
    const name = it => it.type === 'building' ? DATA.buildings[it.id].name : DATA.units[it.id].name;
    if (needs(c.prod)) return name(c.prod) + ', en cours, en dépend.';
    const q = (c.queue || []).find(needs); if (q) return name(q) + ', dans la file, en dépend.';
    return null;
  },
  sell(game, cid, b) {
    const c = game.cities[cid]; const pl = game.players[c.owner];
    if (c.sold || !c.buildings[b] || DATA.buildings[b].buildable === false) return { ok: false, why: 'Vente impossible ce tour-ci.' };
    // un bâtiment requis par un autre ne peut être vendu
    const why = Game.sellBlock(c, b); if (why) return { ok: false, why };
    delete c.buildings[b]; c.sold = true;
    const g = Math.floor(DATA.buildings[b].cost / 3);
    pl.gold += g;
    return { ok: true, gold: g };
  },
};

// ---------- héros ----------
const HERO_ABILITY_POOLS = {
  fighter: ['agility', 'armsmaster', 'blademaster', 'constitution', 'leadership', 'legendary', 'might', 'lucky', 'noble'],
  mage: ['arcanePower', 'caster', 'sage', 'prayermaster', 'legendary', 'noble', 'lucky'],
  any: ['agility', 'armsmaster', 'blademaster', 'constitution', 'leadership', 'legendary', 'might', 'arcanePower', 'sage', 'prayermaster', 'lucky', 'noble'],
};
const Heroes = {
  // les six héros d'un sorcier (son avatar n'en est pas un)
  heroCount(game, pl) { return Object.values(game.units).filter(u => u.owner === pl.id && u.hero && !u.avatar).length; },
  // héros déjà engagés, tombés, partis pour toujours, ou dont l'offre attend la réponse d'un sorcier
  takenHeroes(game) {
    const taken = new Set(Object.values(game.units).filter(u => u.hero).map(u => u.type));
    for (const p of game.players) {
      for (const d of p.deadHeroes || []) taken.add(d.type);
      if (p.heroOffer && DATA.heroes[p.heroOffer.hero]) taken.add(DATA.heroes[p.heroOffer.hero].unit);
    }
    for (const t of game.goneHeroes || []) taken.add(t);
    return taken;
  },
  randomAvailable(game, pl, ignoreFame, hireable) {
    const taken = Heroes.takenHeroes(game);
    const fame = Players.fame(game, pl);
    // L'Élu (Aurévan) ne se présente jamais de lui-même, ni dans un repaire : il ne vient que par le sort Incarnation.
    // Avant le tour 50, pas de champion délivré d'un repaire : un champion débutant vaut un héros commun de deux ou trois niveaux.
    const early = Heroes.eraLevel(game) < 1;
    const cands = Object.values(DATA.heroes).filter(h => !taken.has(h.unit) && h.id !== 'HeroTorin' && (ignoreFame || (h.fame || 0) <= fame) && !(h.champion && !ignoreFame && fame < 20) && !(h.champion && ignoreFame && early));
    if (!cands.length) return null;
    return game.rng.pick(cands);
  },
  // xp : l'expérience de départ (posée avant la légende, pour que l'expérience du héros y compte)
  spawn(game, pl, h, plane, x, y, xp) {
    const extra = {};
    const pool = HERO_ABILITY_POOLS[h.randomType] || HERO_ABILITY_POOLS.any;
    const d0 = DATA.units[h.unit], base = d0.abilities;
    const fits = a => (a !== 'arcanePower' || (d0.rangedType === 'magic' && d0.ranged > 0)) && (a !== 'might' || d0.melee > 0);
    const sup = a => 'super' + a[0].toUpperCase() + a.slice(1);
    // chaque tirage apporte vraiment quelque chose : une capacité nouvelle, sa version « super », ou +5 de mana
    const useful = a => a === 'caster' || (!base[sup(a)] && !extra[sup(a)] && ((!base[a] && !extra[a]) || !!ABILITY_NAMES[sup(a)]));
    for (let i = 0; i < (h.randomAbilities || 0); i++) {
      const opts = pool.filter(a => fits(a) && useful(a)); if (!opts.length) break;
      const a = game.rng.pick(opts);
      if (a === 'caster') { extra.caster = Number(extra.caster || base.caster || 0) + 5; continue; }
      if (base[a] || extra[a]) { delete extra[a]; extra[sup(a)] = true; }
      else extra[a] = true;
    }
    const u = Units.create(game, h.unit, pl.id, plane, x, y);
    if (xp) u.xp = xp;
    if (pl) pl.hadHero = true;
    u.hero = { name: h.name, title: h.title, extra, slots: h.slots || ['melee', 'armor', 'jewelry'], lvlSeen: 0 };
    u.items = [null, null, null];
    u.summoned = false;
    Heroes.assignQuest(game, u);
    if (pl && pl.human && u.hero.quest) Game.log(game, pl.id, u.hero.name + ' : « ' + u.hero.story + ' » Quête : ' + Heroes.questText(game, u) + '.', { unit: u.id });
    // la sixième place vient d'être prise alors qu'un sort d'appel est en cours : il échouerait
    const cs = pl && pl.human && pl.casting && pl.casting.id;
    if (cs && ['summon_hero', 'summon_champion', 'incarnation', 'resurrection'].includes(cs) && Heroes.heroCount(game, pl) >= 6)
      Game.log(game, pl.id, 'Vous avez désormais six héros : ' + DATA.spells[cs].name + ' échouera si aucun ne vous quitte d\'ici là (vous ne récupéreriez que la moitié du mana).', { alert: true });
    return u;
  },
  // ---------- talents : à chaque niveau, un choix entre deux capacités ----------
  rawLevel(u) { let lv = 0; for (let i = 0; i < HERO_LEVELS.length; i++) if (u.xp >= HERO_LEVELS[i].xp) lv = i; return lv; },
  profile(u) { const h = DATA.heroes[u.type]; return u.avatar ? 'mage' : h ? h.randomType : 'any'; },
  // un talent n'a de sens que si le héros a de quoi s'en servir (pas de puissance arcanique sans tir magique)
  talentUseful(game, u, k) {
    const s = Units.stats(game, u);
    if (k === 'arcanePower') return s.rangedType === 'magic' && s.ranged > 0;
    if (k === 'might' || k === 'firstStrike') return s.melee > 0;
    return true;
  },
  talentOptions(game, u, rng) {
    const ab = Units.abilities(game, u), prof = Heroes.profile(u);
    const cands = [];
    for (const k in DATA.heroTalents) {
      const t = DATA.heroTalents[k];
      if (t.for !== 'any' && prof !== 'any' && t.for !== prof) continue;
      if (!Heroes.talentUseful(game, u, k)) continue;
      // t.max : le nombre de fois que le talent peut être pris (Œil de lynx : trois fois, vue 5 au plus)
      if (t.stack) { if (t.max && (u.hero.talents || []).filter(x => x === k).length >= t.max) continue; if (k === 'scouting' && Move.sightOf(game, u) >= 5) continue; if (k === 'caster' && !ab.caster && prof !== 'mage') continue; cands.push(k); continue; }
      if (t.sup) { if (ab[t.sup]) continue; cands.push(k); continue; }
      if (!ab[k]) cands.push(k);
    }
    const out = [];
    while (out.length < 2 && cands.length) out.push(cands.splice(rng.int(cands.length), 1)[0]);
    return out;
  },
  talentLabel(game, u, k) {
    const t = DATA.heroTalents[k], ab = Units.abilities(game, u);
    if (t.sup && ab[k]) return 'Super ' + t.name.charAt(0).toLowerCase() + t.name.slice(1);
    return t.name;
  },
  // sauvegardes d'avant v0.18.2 : une puissance arcanique sans tir magique devient un talent utile du même rang
  fixTalents(game) {
    for (const u of Object.values(game.units)) {
      const ex = u.hero && u.hero.extra; if (!ex || (!ex.arcanePower && !ex.superArcanePower) || Heroes.talentUseful(game, u, 'arcanePower')) continue;
      const sup = !!ex.superArcanePower; delete ex.arcanePower; delete ex.superArcanePower;
      const ab = Units.abilities(game, u), s = Units.stats(game, u);
      const k = ['might', 'constitution', 'agility', 'blademaster'].find(k => (k !== 'might' || s.melee > 0) && !ab[DATA.heroTalents[k].sup] && !(sup ? false : ab[k])) || 'constitution';
      const t = DATA.heroTalents[k];
      if (sup || ab[k]) { delete ex[k]; ex[t.sup] = true; } else ex[k] = true;
      if (u.hero.talents) u.hero.talents = u.hero.talents.map(x => x === 'arcanePower' ? k : x);
      Game.log(game, u.owner, u.hero.name + ' : sa puissance arcanique, sans effet faute de tir magique, devient ' + (sup || ab[k] ? 'Super ' + t.name.toLowerCase() : t.name) + '.', { unit: u.id });
    }
  },
  applyTalent(game, u, k) {
    const t = DATA.heroTalents[k]; if (!t) return;
    const ab = Units.abilities(game, u), ex = u.hero.extra = u.hero.extra || {};
    if (k === 'scouting') ex.scouting = Math.min(5, Math.max(Move.sightOf(game, u) + 1, Number(ab.scouting || 1) + 1));   // +1 case sur la vue actuelle (trois talents au plus : vue 5)
    else if (t.stack) ex[k] = Number(ab[k] || 0) + t.stack;
    else if (t.sup && ab[k]) { delete ex[k]; ex[t.sup] = true; }
    else ex[k] = true;
    (u.hero.talents = u.hero.talents || []).push(k);
  },
  // passage de niveau : un choix en attente par niveau gagné (l'IA choisit aussitôt)
  checkLevels(game) {
    for (const u of Object.values(game.units)) {
      if (!u.hero) continue;
      const raw = Heroes.rawLevel(u);
      if (u.hero.lvlSeen == null) u.hero.lvlSeen = raw;
      while (u.hero.lvlSeen < raw) {
        u.hero.lvlSeen++;
        const opts = Heroes.talentOptions(game, u, game.rng);
        if (!opts.length) continue;
        const pl = game.players[u.owner];
        if (pl && pl.human) {
          (u.hero.pending = u.hero.pending || []).push({ level: u.hero.lvlSeen, opts });
          Game.log(game, u.owner, u.hero.name + ' passe au niveau ' + HERO_LEVELS[u.hero.lvlSeen].name.toLowerCase() + ' : un talent à choisir.', { unit: u.id });
        } else Heroes.applyTalent(game, u, opts[0]);
      }
    }
  },
  chooseTalent(game, u, k) {
    const p = u.hero.pending && u.hero.pending[0]; if (!p || !p.opts.includes(k)) return false;
    u.hero.pending.shift();
    Heroes.applyTalent(game, u, k);
    // les choix suivants se refont d'après ce que le héros sait désormais (pas deux fois le même talent unique)
    for (const q of u.hero.pending) { const o = Heroes.talentOptions(game, u, game.rng); if (o.length) q.opts = o; }
    u.hero.pending = u.hero.pending.filter(q => q.opts.length);
    Game.log(game, u.owner, u.hero.name + ' apprend : ' + DATA.heroTalents[k].name + '.', { unit: u.id, minor: true });
    return true;
  },

  // ---------- quêtes personnelles : la légende de chaque héros ----------
  // Un repaire de difficulté maximale, créé pour lui, quelque part sur son plan. On ne sait pas où au début :
  // 1. une rumeur (le paysage) ; 2. la région, au rang Capitaine ou après 2 repaires pillés avec lui ;
  // 3. l'emplacement, au rang Commandant, après 4 repaires, ou en l'apercevant dans la région.
  LEGEND_REGION: 6,
  LEGEND_REWARD: { xp: 150, troopXp: 50, gold: 1000, fame: 10 },
  legendHint(game, s) {
    const world = game.world, t = World.terr(world, s.plane, s.x, s.y);
    const near = World.neighbors(world, s.x, s.y).map(([x, y]) => World.terr(world, s.plane, x, y));
    const coast = near.some(k => k === T.OCEAN), mtn = near.some(k => k === T.MOUNTAIN || k === T.VOLCANO);
    let w = { [T.FOREST]: 'au cœur d\'une forêt', [T.HILLS]: mtn ? 'au pied des montagnes' : 'parmi les collines', [T.MOUNTAIN]: 'dans les montagnes', [T.DESERT]: 'dans le désert', [T.SWAMP]: 'au fond des marais', [T.TUNDRA]: 'dans les terres gelées', [T.GRASS]: 'dans les plaines', [T.RIVER]: 'au bord d\'un fleuve' }[t] || 'dans des terres sauvages';
    if (coast && t !== T.RIVER) w += ', non loin de la mer';
    return w + ', sur ' + (s.plane ? 'le Miroir' : 'Arcane');
  },
  // un emplacement pour la légende : loin du héros, hors des territoires, de préférence inexploré et dans le paysage du récit
  legendSpot(game, u, def) { return Heroes.legendSpotIn(game, u, def, 3, 5, 12) || Heroes.legendSpotIn(game, u, def, 2, 3, 0); },
  legendSpotIn(game, u, def, gapSite, gapCity, minD) {
    const world = game.world, rng = game.rng, p = u.plane, pl = game.players[u.owner];
    const ex = pl && pl.explored ? pl.explored[p] : null, own = world.planes[p].owner;
    const WANT = { mountain: [T.HILLS], hills: [T.HILLS], forest: [T.FOREST], swamp: [T.SWAMP], desert: [T.DESERT], tundra: [T.TUNDRA], grass: [T.GRASS, T.RIVER], coast: [T.GRASS, T.FOREST, T.HILLS, T.DESERT, T.SWAMP, T.TUNDRA] };
    const want = def.where || [];
    const fits = (t, x, y) => want.some(k => (WANT[k] || []).includes(t) && (k !== 'coast' || World.neighbors(world, x, y).some(([a, b]) => World.terr(world, p, a, b) === T.OCEAN))
      && (k !== 'mountain' || World.neighbors(world, x, y).some(([a, b]) => World.terr(world, p, a, b) === T.MOUNTAIN)));
    const cities = Object.values(game.cities).filter(c => c.plane === p);
    let best = null, bs = -Infinity;
    for (let y = 2; y < world.h - 2; y++) for (let x = 0; x < world.w; x++) {
      const t = World.terr(world, p, x, y);
      if (World.isWater(t) || t === T.SNODE || t === T.NNODE || t === T.CNODE || t === T.VOLCANO || (t === T.MOUNTAIN && Move.mountainsBlock(game))) continue;
      if (World.get(world, p, 'site', x, y) >= 0 || Units.at(game, p, x, y).length) continue;
      if (!MapGen.farFromSites(game, p, x, y, gapSite)) continue;
      const dc = cities.length ? Math.min(...cities.map(c => World.dist(world, c.x, c.y, x, y))) : 99;
      if (dc < gapCity) continue;
      const d = World.dist(world, x, y, u.x, u.y);
      if (d < minD) continue;
      let sc = -Math.abs(d - 20) + Math.min(dc, 10) + rng.next() * 6;
      if (ex && !ex[y * world.w + x]) sc += 12;
      if (own[y * world.w + x] >= 0) sc -= 15;
      if (fits(t, x, y)) sc += 25;
      if (sc > bs) { bs = sc; best = [x, y]; }
    }
    return best;
  },
  // le repaire de la légende : gardé par des créatures du royaume du récit, à la mesure de l'élite de sa race
  legendSite(game, u, def) {
    const at = Heroes.legendSpot(game, u, def); if (!at) return null;
    const rng = game.rng, budget = Heroes.legendBudget(game, game.players[u.owner]);
    const s = MapGen.addSite(game, { type: def.type || 'dungeon', plane: u.plane, x: at[0], y: at[1], cleared: false, guardians: null, budget, tier: 4, forceRealm: def.realm, legend: { hero: u.id, place: def.place }, legendV: 2 });
    Game.ensureGuardians(game, s);
    return s;
  },
  // gardiens calés sur la race du sorcier : une armée d'élite de sa race doit pouvoir l'emporter (voir DATA.legendBudget)
  legendBudget(game, pl) {
    const cs = pl ? Cities.ofPlayer(game, pl.id) : [];
    const c = (pl && game.cities[pl.fortress]) || U.max(cs, x => x.pop);
    const base = (DATA.legendBudget && c && DATA.legendBudget[c.race]) || 760;
    return Math.round(base * (0.9 + game.rng.next() * 0.2));
  },
  // la région de la légende : un cercle de rayon r qui contient le repaire, sans qu'il soit au centre
  legendRegion(game, q, s, r) {
    const rng = game.rng, R = r || Heroes.LEGEND_REGION, off = Math.max(1, Math.floor(R / 2));
    q.cx = World.wx(game.world, s.x + rng.int(2 * off + 1) - off); q.cy = U.clamp(s.y + rng.int(2 * off + 1) - off, 1, game.world.h - 2); q.r = R;
  },
  LEGEND_RUMOR: 0.18,
  // « de » devant le nom d'un lieu : du Repaire, de la Forge, de l'Aire, des Terres
  dePlace(p) { if (!U.fr()) return p; return /^le /i.test(p) ? 'du ' + p.slice(3) : /^les /i.test(p) ? 'des ' + p.slice(4) : 'de ' + p; },
  assignQuest(game, u) {
    const def = DATA.heroQuests[u.type]; if (!def || !u.hero) return;
    const q = { type: 'legend', place: def.place, stage: 1, lairs: 0 };
    const s = Heroes.legendSite(game, u, def);
    if (s) q.site = s.id;
    u.hero.quest = q; u.hero.story = def.story;
    // un héros déjà aguerri en sait davantage
    Heroes.legendCheck(game, u, true);
  },
  questText(game, u) {
    const q = u.hero && u.hero.quest; if (!q) return '';
    if (q.done) return 'Quête accomplie : ' + (q.reward || '');
    if (q.type !== 'legend') return '';
    const s = game.sites[q.site], lv = Heroes.rawLevel(u), place = U.cap(q.place);
    if (!s) return q.lost ? place + ' : la piste est perdue.' : 'Nul ne sait encore où se trouve ' + q.place + '.';
    if (q.stage >= 3) return 'Vaincre les gardiens ' + Heroes.dePlace(q.place) + ' (' + s.x + ', ' + s.y + (s.plane ? ', sur le Miroir' : '') + '), avec ' + u.hero.name + ' dans l\'armée qui attaque';
    const lairs = q.lairs || 0;
    if (q.stage === 2) return place + ' se cache dans la région cerclée d\'or, autour de (' + q.cx + ', ' + q.cy + (s.plane ? ', sur le Miroir' : '') + '). ' + (lv >= 3 || lairs >= 4 ? u.hero.name + ' guette les rumeurs.' : 'Explorez-la. Repaires pillés avec ' + u.hero.name + ' : ' + Math.min(4, lairs) + '/4');
    return 'Selon la légende, ' + q.place + ' se trouve ' + Heroes.legendHint(game, s) + '. ' + (lv >= 2 || lairs >= 2 ? u.hero.name + ' guette les rumeurs.' : 'Repaires pillés avec ' + u.hero.name + ' : ' + Math.min(2, lairs) + '/2');
  },
  // la légende se précise
  // la légende se précise. À l'engagement (quiet), un héros déjà aguerri en sait d'emblée autant que son rang le permet.
  // Ensuite, une fois le rang atteint (ou les repaires pillés), une rumeur lui parvient avec 18 % de chances par tour :
  // au rang Capitaine (ou 2 repaires), la région, qui se resserre à chaque rumeur (rayon 6, puis 4, puis 3) ;
  // au rang Commandant (ou 4 repaires), l'emplacement exact. Apercevoir le repaire dans la région le révèle aussitôt.
  legendCheck(game, u, quiet) {
    const q = u.hero && u.hero.quest; if (!q || q.done || q.type !== 'legend') return;
    const s = game.sites[q.site], pl = game.players[u.owner]; if (!s || !pl) return;
    const lv = Heroes.rawLevel(u), say = !quiet && pl.human, lairs = q.lairs || 0;
    const canRegion = lv >= 2 || lairs >= 2, canExact = lv >= 3 || lairs >= 4;
    const reveal = () => {
      q.stage = 3; Move.reveal(game, pl, s.plane, s.x, s.y, 1);
      if (say) Game.log(game, pl.id, 'La légende se dévoile : ' + q.place + ' est là, en (' + s.x + ', ' + s.y + '). Ses gardiens sont parmi les plus redoutables du monde. Pour accomplir sa quête, ' + u.hero.name + ' doit être dans l\'armée qui les vaincra.', { x: s.x, y: s.y, plane: s.plane, unit: u.id, quest: true });
    };
    if (quiet) {
      if (q.stage < 2 && canRegion) { q.stage = 2; Heroes.legendRegion(game, q, s); }
      if (q.stage === 2 && canExact) { q.stage = 3; Move.reveal(game, pl, s.plane, s.x, s.y, 1); }
      return;
    }
    // le repaire aperçu dans la région : reconnu aussitôt
    if (q.stage === 2 && Intel.sees(game, pl, s.plane, s.x, s.y)) return reveal();
    if (q.stage >= 3 || !canRegion || !game.rng.chance(Heroes.LEGEND_RUMOR)) return;
    if (q.stage < 2) {
      q.stage = 2; Heroes.legendRegion(game, q, s);
      if (say) Game.log(game, pl.id, 'Une rumeur parvient à ' + u.hero.name + ' : ' + q.place + ' se cacherait dans la région autour de (' + q.cx + ', ' + q.cy + '), cerclée d\'or sur la carte.', { x: q.cx, y: q.cy, plane: s.plane, unit: u.id, quest: true });
      return;
    }
    if (canExact) return reveal();
    if ((q.r || Heroes.LEGEND_REGION) > 3) {
      Heroes.legendRegion(game, q, s, (q.r || Heroes.LEGEND_REGION) > 4 ? 4 : 3);
      if (say) Game.log(game, pl.id, 'Une nouvelle rumeur resserre la piste ' + Heroes.dePlace(q.place) + ' : autour de (' + q.cx + ', ' + q.cy + ').', { x: q.cx, y: q.cy, plane: s.plane, unit: u.id, quest: true });
    }
  },
  questTick(game) {
    // la légende d'un héros disparu s'éteint avec lui : son repaire se scelle
    for (const st of game.sites) if (st.legend && !game.units[st.legend.hero]) { st.legend = null; if (!st.cleared) { st.cleared = true; st.guardians = []; st.sealed = true; } }
    for (const u of Object.values(game.units)) {
      const q = u.hero && u.hero.quest; if (!q || q.done || q.type !== 'legend') continue;
      const s = game.sites[q.site];
      // repaire pillé sans lui, ou perdu : le gardien de la légende a fui avec la relique, la piste mène ailleurs
      // pas encore de place pour la légende : on cherche à nouveau de temps en temps
      if (q.site == null) { if (!q.lost && game.turn % 10 === 0) { const def = DATA.heroQuests[u.type], ns = def && Heroes.legendSite(game, u, def); if (ns) q.site = ns.id; } continue; }
      if (!s || s.cleared || !Game.siteHasGuardians(s)) {
        if (s && s.legend) s.legend = null;
        q.moves = (q.moves || 0) + 1;
        const def = DATA.heroQuests[u.type], ns = def && q.moves <= 3 ? Heroes.legendSite(game, u, def) : null;
        if (!ns) { if (q.moves > 3) { q.lost = true; if (game.players[u.owner] && game.players[u.owner].human) Game.log(game, u.owner, 'La piste ' + Heroes.dePlace(q.place) + ' est perdue : ' + u.hero.name + ' n\'en entendra plus parler.', { unit: u.id, quest: true }); } q.site = null; continue; }
        q.site = ns.id; q.stage = Math.min(q.stage, 2);
        if (q.stage === 2) Heroes.legendRegion(game, q, ns);
        // (scellé : le héros était tombé ; ressuscité, il retrouve une piste qui a bougé)
        if (game.players[u.owner] && game.players[u.owner].human) Game.log(game, u.owner, (s && s.sealed ? 'Pendant l\'absence de ' + u.hero.name + ', le gardien ' + Heroes.dePlace(q.place) + ' a emporté la relique ailleurs. ' : 'Le repaire ' + Heroes.dePlace(q.place) + ' a été pillé sans ' + u.hero.name + ', mais la relique n\'y était plus : son gardien l\'a emportée ailleurs. ') + (q.stage === 2 ? 'Une nouvelle région est cerclée d\'or sur la carte.' : 'La piste repart de zéro.'), { unit: u.id, quest: true });
        continue;
      }
      Heroes.legendCheck(game, u);
    }
  },
  onMove() {},
  // renvoie les légendes accomplies dans ce combat (l'interface les salue)
  onBattle(game, battle, info, res, atkWon) {
    const done = [];
    for (const b of battle.units) {
      const u = b.u; if (!u.hero) continue;
      const q = u.hero.quest; if (!q || q.done || q.type !== 'legend') continue;
      if (res.winner !== b.side || b.side !== ATT_SIDE || !info.site) continue;
      const dead = b.dead || !game.units[u.id];
      // tombé dans la victoire : la légende s'accomplit quand même, la relique rejoint le coffre
      if (info.site.id === q.site) { const r = Heroes.completeQuest(game, u, battle, b.side, dead); if (r) done.push(r); continue; }
      if (dead) continue;
      // chaque repaire pillé avec lui rapproche de la légende
      if (info.firstClear && info.site.type !== 'node') q.lairs = (q.lairs || 0) + 1;
    }
    return done;
  },
  // l'épilogue d'une légende accomplie
  legendEnding(u, relicName, place, dead) {
    const name = u.hero.name, de = Heroes.dePlace(place);
    const tpl = dead ? DATA.heroEndingFallen : (DATA.heroEndings && DATA.heroEndings[u.type]) || DATA.heroEndingDefault;
    return String(tpl || '').split('{n}').join(name).split('{de}').join(de).split('{relic}').join(relicName);
  },
  completeQuest(game, u, battle, side, dead) {
    const q = u.hero.quest; if (!q || q.done) return;
    const pl = game.players[u.owner], def = DATA.heroQuests[u.type] || {}, R = Heroes.LEGEND_REWARD;
    const s = game.sites[q.site], realm = (s && s.realmG) || def.realm;
    const slots = u.hero.slots || ['melee'];
    const si = Math.max(0, slots.findIndex(x => x === 'melee' || x === 'ranged' || x === 'magic' || x === 'anyWeapon'));
    const slot = slots[si];
    const kind = slot === 'ranged' ? 'bow' : slot === 'magic' ? 'staff' : (def.kind || 'sword');
    const de = /^[AEIOUYÉÈÊÂÎÔÛaeiouyéèêâîôû]/.test(u.hero.name) ? ' d\'' : ' de ', wpn = { bow: 'Arc', staff: 'Bâton', sword: 'Lame', mace: 'Marteau', axe: 'Hache' }[kind];
    const it = { kind, slot: ITEM_KINDS[kind].slot, name: def.relic || (U.fr() ? wpn + de + u.hero.name : wpn + ' de ' + u.hero.name), powers: [], icon: 'item:' + kind + ':1', legendary: true, value: 2500 };
    const STATS = { sword: { melee: 5, toHit: 3, def: 3 }, mace: { melee: 6, toHit: 2, def: 3 }, axe: { melee: 7, toHit: 3, def: 1 }, bow: { ranged: 5, toHit: 3, def: 2 }, staff: { skill: 25, melee: 3, toHit: 2, res: 4 } };
    Object.assign(it, STATS[kind]);
    const first = kind === 'bow' ? 'armorPiercing' : kind === 'staff' ? 'trueSight' : realm === 'death' ? 'holyAvenger' : 'firstStrike';
    it.powers.push(first);
    const second = def.power && def.power !== first ? def.power : kind === 'staff' ? 'magicImmunity' : 'regeneration';
    it.powers.push(second);
    if (dead) { if (pl) pl.vault.push(it); }
    else { const old = u.items[si]; u.items[si] = it; if (old && pl) pl.vault.push(old); u.xp += R.xp; }
    // l'armée qui l'a suivi jusque-là en revient aguerrie
    if (battle) for (const b of battle.units) if (b.side === side && !b.dead && b.u !== u && game.units[b.u.id] && !DATA.units[b.u.type].abilities.createOutpost) b.u.xp = (b.u.xp || 0) + R.troopXp;
    if (pl) { pl.fame = (pl.fame || 0) + R.fame; pl.gold += R.gold; }
    if (s) s.legend = null;
    q.done = true; q.reward = it.name + ' (' + Items.describe(it) + ')';
    if (pl && dead) Game.log(game, u.owner, 'Légende accomplie, au prix de sa vie : ' + u.hero.name + ' est tombé en triomphant ' + Heroes.dePlace(q.place) + '. ' + it.name + ' (' + Items.describe(it) + ') rejoint le coffre de votre forteresse ; ' + R.gold + ' pièces d\'or, +' + R.fame + ' de renommée, et ' + R.troopXp + ' XP pour chaque survivant de son armée.', { x: u.x, y: u.y, plane: u.plane, quest: true, modal: !!pl.human });
    else if (pl) Game.log(game, u.owner, 'Légende accomplie ! ' + u.hero.name + ' triomphe ' + Heroes.dePlace(q.place) + ' et reçoit ' + it.name + ' (' + Items.describe(it) + '), ' + R.xp + ' XP ; ' + R.gold + ' pièces d\'or, +' + R.fame + ' de renommée, et ' + R.troopXp + ' XP pour chaque unité de son armée.', { unit: u.id, x: u.x, y: u.y, plane: u.plane, quest: true, modal: !!pl.human });
    // les autres sorciers qui le connaissent en entendent parler
    if (pl) for (const o of game.players) if (o !== pl && o.alive && o.human && o.contact && o.contact[pl.id]) Game.log(game, o.id, 'Les bardes chantent la légende ' + Heroes.dePlace(q.place) + ' : ' + u.hero.name + ', au service de ' + pl.name + ', l\'a accomplie.', { quest: true });
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'legend', { a: u.owner, h: u.hero.name, item: it.name, place: Heroes.dePlace(q.place), dead: !!dead, plane: u.plane, x: u.x, y: u.y });
    return { type: 'legend', pid: u.owner, hero: u, item: it, place: q.place, dead: !!dead, reward: R, ending: Heroes.legendEnding(u, it.name, q.place, dead) };
  },
  // la relique promise, pour l'affichage avant la victoire
  relicPreview(u) {
    const def = DATA.heroQuests[u.type] || {}, slots = u.hero.slots || ['melee'];
    const slot = slots.find(x => x === 'melee' || x === 'ranged' || x === 'magic' || x === 'anyWeapon') || 'melee';
    return (def.relic || 'une relique à son nom') + (slot === 'ranged' ? ', un arc' : slot === 'magic' ? ', un bâton' : ', une arme') + ' légendaire';
  },
  hireFee(game, pl, h, level) {
    let fee = h.hireFee || (100 + (h.fame || 0) * 10);
    fee = Math.floor(fee * (4 + (level || 0)) / 4);
    if (pl.retorts.includes('charismatic')) fee = Math.floor(fee / 2);
    return fee;
  },
};

// ---------- objets ----------
const ITEM_KINDS = {
  sword: { slot: 'melee', names: ['Épée', 'Lame', 'Glaive'], stats: ['melee', 'toHit', 'def'] },
  mace: { slot: 'melee', names: ['Masse', 'Marteau', 'Fléau'], stats: ['melee', 'toHit', 'def'] },
  axe: { slot: 'melee', names: ['Hache', 'Francisque'], stats: ['melee', 'toHit'] },
  bow: { slot: 'ranged', names: ['Arc', 'Arc long'], stats: ['ranged', 'toHit', 'def'] },
  staff: { slot: 'magic', names: ['Bâton', 'Sceptre'], stats: ['melee', 'skill', 'toHit'] },
  wand: { slot: 'magic', names: ['Baguette'], stats: ['skill', 'toHit'] },
  shield: { slot: 'armor', names: ['Bouclier', 'Pavois'], stats: ['def', 'res', 'move'] },
  chain: { slot: 'armor', names: ['Cotte de mailles', 'Haubert'], stats: ['def', 'res'] },
  plate: { slot: 'armor', names: ['Armure de plates', 'Cuirasse'], stats: ['def', 'res', 'hp'] },
  amulet: { slot: 'jewelry', names: ['Amulette', 'Pendentif'], stats: ['res', 'def', 'skill'] },
  ring: { slot: 'jewelry', names: ['Anneau', 'Bague'], stats: ['res', 'melee', 'skill'] },
  cloak: { slot: 'jewelry', names: ['Cape', 'Manteau'], stats: ['def', 'res', 'move'] },
  helm: { slot: 'jewelry', names: ['Heaume', 'Casque'], stats: ['def', 'hp'] },
  gauntlets: { slot: 'jewelry', names: ['Gantelets'], stats: ['melee', 'toHit'] },
  orb: { slot: 'jewelry', names: ['Orbe'], stats: ['skill', 'res'] },
  boots: { slot: 'jewelry', names: ['Bottes'], stats: ['move', 'def'] },
};
const ITEM_ADJ = ['du Dragon', 'de l\'Aube', 'des Ombres', 'de Feu', 'du Givre', 'des Anciens', 'de Lumière', 'du Vide', 'des Rois', 'de la Tempête', 'du Serment', 'de Vigilance'];
const Items = {
  random(game, power) {
    const rng = game.rng;
    const kind = rng.pick(Object.keys(ITEM_KINDS));
    const k = ITEM_KINDS[kind];
    const it = { kind, slot: k.slot, name: rng.pick(k.names) + ' ' + rng.pick(ITEM_ADJ), powers: [], icon: 'item:' + kind + (rng.chance(0.5) ? ':' + rng.int(2) : '') };
    let pts = 1 + power + rng.int(power + 1);
    while (pts > 0) {
      const st = rng.pick(k.stats);
      it[st] = (it[st] || 0) + (st === 'skill' ? 5 : 1);
      pts--;
    }
    // un pouvoir tiré au hasard : souvent pour un artefact, parfois pour un objet enchanté
    if (power >= 3 ? rng.chance(0.5) : power >= 2 && rng.chance(0.25)) it.powers.push(rng.pick(Object.keys(ITEM_POWERS)));
    it.value = 50 + power * 120 + rng.int(100);
    return it;
  },
  describe(it) {
    const parts = [];
    // un modèle par caractéristique : « attaque » est aussi un verbe du journal de bataille, que les autres langues traduisent autrement
    const L = { melee: v => '+' + v + ' attaque', ranged: v => '+' + v + ' tir', def: v => '+' + v + ' défense', res: v => '+' + v + ' résistance', move: v => '+' + v + ' mouvement', toHit: v => '+' + v * 10 + '% précision', hp: v => '+' + v + ' PV', skill: v => '+' + v + ' mana' };
    for (const k in L) if (it[k]) parts.push(L[k](it[k]));
    for (const p of it.powers) parts.push(ITEM_POWERS[p].name + (ITEM_POWERS[p].melee ? ' (+' + ITEM_POWERS[p].melee + ' attaque)' : ''));
    return parts.join(', ');
  },
  canEquip(u, it) {
    if (!u.hero) return false;
    const slots = u.hero.slots || [];
    return slots.some(s => Items.slotAccepts(s, it, u));
  },
  slotAccepts(s, it, u) {
    if (s === it.slot) return true;
    if (s === 'anyWeapon' && ['melee', 'ranged', 'magic'].includes(it.slot)) return true;
    if (s === 'melee' && it.slot === 'melee') return true;
    if (s === 'magic' && (it.slot === 'magic' || it.slot === 'melee')) return true;
    if (s === 'ranged' && (it.slot === 'ranged' || it.slot === 'melee')) return true;
    return false;
  },
  freeSlot(u, it) {
    const slots = u.hero.slots || [];
    for (let i = 0; i < slots.length; i++) if (!u.items[i] && Items.slotAccepts(slots[i], it, u)) return i;
    return -1;
  },
};
