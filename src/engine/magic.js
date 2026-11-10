'use strict';
// Magie : livres, recherche, compétence de lancement, mana, coûts des sorts.

const RARITIES = ['common', 'uncommon', 'rare', 'veryrare'];

const Magic = {
  totalBooks(pl) { return U.sum(Object.values(pl.books)); },

  // Table A : nombre de sorts accessibles par rareté selon le nombre de livres
  // (10 dans la table = toute la rareté : certains royaumes d'Arcanes ont un onzième sort commun)
  poolCounts(books, realm) {
    const common = books === 1 ? 3 : Math.min(10, 3 + books);
    const uncommon = books <= 6 ? books : books === 7 ? 8 : 10;
    const rare = books === 1 ? 0 : books <= 8 ? books - 1 : Math.min(10, books);
    const veryrare = books <= 2 ? 0 : books <= 10 ? books - 2 : 10;
    const out = { common, uncommon, rare, veryrare };
    if (realm) for (const r of RARITIES) if (out[r] >= 10) out[r] = Math.max(10, Magic.spellsOf(realm, r).length);
    return out;
  },
  guaranteed(books) {
    if (books <= 1) return { common: 0, uncommon: 0, rare: 0, veryrare: 0 };
    return {
      common: Math.min(2, books - 1),
      uncommon: books >= 5 ? 2 : books >= 4 ? 1 : 0,
      rare: books >= 6 ? 1 : 0,
      veryrare: books >= 8 ? 1 : 0,
    };
  },

  spellsOf(realm, rarity) { return Object.values(DATA.spells).filter(s => s.realm === realm && (!rarity || s.rarity === rarity) && s.inGame !== false && !s.book && !s.lore); },

  initWizard(game, pl, chosenStart) {
    const rng = game.rng;
    pl.known = ['magic_spirit', 'spell_of_return'];
    if (pl.retorts.includes('artificer')) pl.known.push('enchant_item', 'create_artifact');
    pl.researchPool = [];
    for (const realm of REALMS5) {
      const n = pl.books[realm] || 0; if (!n) continue;
      const counts = Magic.poolCounts(n, realm), gua = Magic.guaranteed(n);
      for (const r of RARITIES) {
        // (les versions de pile ne vont qu'au joueur : l'IA ne sait pas s'en servir)
        const all = rng.shuffle(Magic.spellsOf(realm, r).filter(s => pl.human || s.kind !== 'stackEnchant').map(s => s.id));
        // sorts connus d'office : ceux choisis entrent dans le quota de la table A (ils n'y s'ajoutent pas)
        const chosen = (chosenStart && chosenStart[realm] && chosenStart[realm][r]) || [];
        const start = chosen.filter(id => all.includes(id)).slice(0, gua[r]);
        const pool = start.concat(all.filter(id => !start.includes(id))).slice(0, Math.max(counts[r], start.length));
        for (const id of pool) if (start.length < gua[r] && !start.includes(id)) start.push(id);
        for (const id of start) if (!pl.known.includes(id)) pl.known.push(id);
        for (const id of pool) if (!start.includes(id)) pl.researchPool.push(id);
        for (const id of start) if (!pool.includes(id)) { /* déjà connu */ }
      }
    }
    // arcane : accessible à tous (sauf Ouvrir une faille, qui ne s'offre qu'aux sorciers d'un plan écrasé : Magic.gateOptions)
    for (const s of Magic.spellsOf('arcane')) if (!(s.params && s.params.gate) && !pl.known.includes(s.id) && !pl.researchPool.includes(s.id)) pl.researchPool.push(s.id);
    pl.researchOptions = [];
    pl.researching = null; pl.researchProgress = 0;
    pl.somCost = Math.round((60000 - (Math.max(...Object.values(pl.books)) >= 11 ? 3000 : 0)) * Game.PACE);
    Magic.refreshResearchOptions(game, pl);
    // compétence initiale : 2 par livre
    const s0 = Math.max(1, Magic.totalBooks(pl) * 2);
    pl.skillPoints = s0 * s0 - s0 + 1;
  },

  // (0.31.37) Ouvrir une faille : à partir du tour GATE_TURN, quand le meneur pèse GATE_LEAD fois le plus fort des sorciers de l'autre plan, ces derniers voient
  // le sort s'ajouter à leurs recherches (en plus des huit), et le gardent ensuite. Le meneur et son plan ne l'ont jamais.
  GATE_LEAD: 1.5, GATE_TURN: 60, _gate: new WeakMap(),
  gateOpen(game, pl) {
    if (!pl.alive || pl.banished || game.turn < Magic.GATE_TURN * Game.pace(game)) return false;
    let g = Magic._gate.get(game);
    if (!g || g.turn !== game.turn) {
      const al = game.players.filter(p => p.alive && !p.banished), sc = new Map(al.map(p => [p, Crisis.score(game, p)]));
      const L = U.max(al, p => sc.get(p)), other = L ? al.filter(p => p.plane !== L.plane) : [];
      const best = other.length ? Math.max(...other.map(p => sc.get(p))) : Infinity;
      g = { turn: game.turn, plane: L && sc.get(L) >= Magic.GATE_LEAD * Math.max(1, best) ? 1 - L.plane : null };
      Magic._gate.set(game, g);
    }
    return g.plane != null && pl.plane === g.plane;
  },
  gateOptions(game, pl) {
    const id = 'open_rift';
    if (!DATA.spells[id] || !pl.researchOptions || pl.known.includes(id) || pl.researchPool.includes(id) || !Magic.gateOpen(game, pl)) return;
    pl.researchPool.push(id); pl.researchOptions.push(id);
    if (pl.human) Game.log(game, pl.id, 'Le voile cède entre les plans : Ouvrir une faille s\'offre à vos recherches.');
  },

  refreshResearchOptions(game, pl) {
    const rng = game.rng;
    const avail = pl.researchPool.filter(id => !pl.known.includes(id) && !pl.researchOptions.includes(id) && DATA.spells[id] && DATA.spells[id].research != null && (pl.human || DATA.spells[id].kind !== 'stackEnchant'));
    const realms = ['life', 'sorcery', 'nature', 'death', 'chaos', 'arcane'];
    // les recherches d'ouvrage s'ajoutent aux huit sorts proposés, sans leur prendre de place
    const nSpells = () => pl.researchOptions.filter(id => !(DATA.spells[id] && (DATA.spells[id].lore || DATA.spells[id].params.gate))).length;
    while (nSpells() < 8 && avail.length) {
      let picked = null;
      for (const realm of rng.shuffle(realms.slice())) {
        for (const r of RARITIES) {
          const c = avail.filter(id => DATA.spells[id].realm === realm && DATA.spells[id].rarity === r);
          if (c.length) { picked = rng.pick(c); break; }
        }
        if (picked) break;
      }
      if (!picked) break;
      pl.researchOptions.push(picked);
      avail.splice(avail.indexOf(picked), 1);
    }
    Wonders.loreOptions(game, pl);
    pl.researchOptions.sort((a, b) => !!DATA.spells[a].lore - !!DATA.spells[b].lore || RARITIES.indexOf(DATA.spells[a].rarity) - RARITIES.indexOf(DATA.spells[b].rarity) || DATA.spells[a].research - DATA.spells[b].research);
    if (pl.researching && !pl.researchOptions.includes(pl.researching) && pl.researching !== 'spell_of_mastery') pl.researching = null;
  },

  learn(game, pl, id) {
    // une recherche d'ouvrage : des plans, pas un sort (ni grimoire, ni échange, ni rabais sur le Sort de Maîtrise)
    if (DATA.spells[id] && DATA.spells[id].lore) {
      pl.lore = pl.lore || []; if (!pl.lore.includes(id)) pl.lore.push(id);
      pl.researchOptions = pl.researchOptions.filter(x => x !== id);
      if (pl.researching === id) { pl.researching = null; pl.researchProgress = 0; }
      Magic.refreshResearchOptions(game, pl);
      return;
    }
    if (!pl.known.includes(id)) pl.known.push(id);
    pl.researchOptions = pl.researchOptions.filter(x => x !== id);
    if (id !== 'spell_of_mastery') pl.somCost = Math.max(0, (pl.somCost ?? 60000) - Math.floor((DATA.spells[id].research || 0) / 2));
    if (pl.researching === id) { pl.researching = null; pl.researchProgress = 0; }
    Magic.refreshResearchOptions(game, pl);
  },

  researchCost(pl, id) { if (id === 'spell_of_mastery') return pl.somCost ?? 60000; return DATA.spells[id].research || 0; },

  // ---------- puissance ----------
  power(game, pl) { return Magic.powerParts(game, pl).total; },
  // d'où vient la puissance magique : chaque cité, chaque nœud lié, les sources ponctuelles (volcans d'Armageddon…)
  powerParts(game, pl) {
    const cities = Cities.ofPlayer(game, pl.id).map(c => ({ c, n: Cities.econ(game, c).power }));
    const nodes = game.sites.filter(s => s.type === 'node' && s.owner === pl.id).map(s => ({ s, n: Magic.nodePower(game, pl, s) }));
    const extra = pl.extraPower || 0;
    let p = 0; for (const x of cities) p += x.n; for (const x of nodes) p += x.n; p += extra;
    return { cities, nodes, extra, total: Math.max(0, Math.floor(p)) };
  },
  // mana d'un nœud lié : sa puissance (la taille de son aura), doublée par la Maîtrise des nœuds et par celle de son royaume
  nodePower(game, pl, s) {
    let np = s.power;
    if (pl.retorts.includes('nodeMastery')) np *= 2;
    if (pl.retorts.includes(s.realm + 'Mastery')) np *= 2;
    if (World.get(game.world, s.plane, 'corrupt', s.x, s.y)) np = 0;
    if (s.warped != null) np = 0;   // perverti : il ne produit plus (il coûte 5 mana par tour, voir Turn.processPlayer)
    return np;
  },
  castingSkill(pl) {
    const P = pl.skillPoints || 0;
    if (P <= 0) return 0;
    let s = Math.floor((Math.sqrt(4 * P - 3) + 1) / 2);
    if (pl.retorts.includes('archmage')) s += 10;
    return s;
  },
  heroSkillBonus(game, pl) {
    const fc = game.cities[pl.fortress]; if (!fc) return 0;
    let b = 0;
    for (const u of Units.at(game, fc.plane, fc.x, fc.y)) if (u.owner === pl.id && u.hero && !u.avatar) b += Units.stats(game, u).caster;
    return Math.floor(b / 2);
  },
  totalSkill(game, pl) {
    const t = Magic.castingSkill(pl) + Magic.heroSkillBonus(game, pl);
    // incarné sur la carte, le sorcier n'a plus que la moitié de sa compétence de lancement
    return Magic.incarnate(game, pl) ? Math.floor(t / 2) : t;
  },
  incarnate(game, pl) { return Object.values(game.units).some(u => u.avatar && u.owner === pl.id); },

  split(game, pl) {
    const pw = Magic.power(game, pl);
    const s = pl.powerSplit;
    let mana = pw * s.mana / 100, research = pw * s.research / 100, skill = pw * s.skill / 100;
    if (pl.retorts.includes('manaFocusing')) mana *= 1.25;
    if (pl.retorts.includes('archmage')) skill *= 1.5;
    return { power: pw, mana: Math.round(mana), research, skill: Math.floor(skill) };
  },

  researchPerTurn(game, pl) {
    let r = 0;
    for (const c of Cities.ofPlayer(game, pl.id)) r += Cities.econ(game, c).research;
    for (const u of Object.values(game.units)) if (u.owner === pl.id && u.hero) {
      const ab = Units.abilities(game, u); const L = Units.levelIndex(game, u) + 1;
      if (ab.superSage) r += Math.floor(4.5 * L); else if (ab.sage) r += 3 * L;
    }
    r += Magic.split(game, pl).research;
    return r;
  },
  effectiveResearch(game, pl, id) {
    const base = Magic.researchPerTurn(game, pl);
    if (!id) return Math.floor(base);
    const sp = DATA.spells[id];
    let mod = 0;
    if (pl.retorts.includes('sageMaster')) mod += 0.25;
    if (pl.retorts.includes('runemaster') && sp.realm === 'arcane') mod += 0.25;
    if (pl.retorts.includes('conjurer') && sp.section === 'summoning') mod += 0.25;
    if (pl.retorts.includes(sp.realm + 'Mastery')) mod += 0.15;
    mod += Math.max(0, (pl.books[sp.realm] || 0) - 7) * 0.1;
    return Math.floor(base * (1 + mod));
  },

  // ---------- entretiens ----------
  manaUpkeep(game, pl) { return Magic.manaUpkeepParts(game, pl).total; },
  // ce que coûte l'entretien magique, poste par poste : créatures, enchantements globaux, enchantements de cités, nœuds pervertis
  manaUpkeepParts(game, pl) {
    const out = { creatures: [], globals: [], cityEnch: [], warped: [], timeStop: null, total: 0 };
    const half = pl.retorts.includes('channeler'), cost = s => half ? Math.ceil(s.upkeep / 2) : s.upkeep;
    // Arrêt du temps : on ne paie que l'entretien de ce sort
    if (pl.globals && pl.globals.includes('time_stop')) { out.timeStop = cost({ upkeep: DATA.spells.time_stop.upkeep || 0 }); out.total = out.timeStop; return out; }
    for (const u of Object.values(game.units)) if (u.owner === pl.id) { const n = Units.upkeep(game, u).mana; if (n) out.creatures.push({ u, n }); }
    for (const g of pl.globals) { const s = DATA.spells[g]; if (s && s.upkeep) out.globals.push({ id: g, n: cost(s) }); }
    for (const c of Object.values(game.cities)) for (const e of c.ench) if (e.owner === pl.id) { const s = DATA.spells[e.spell]; if (s && s.upkeep) out.cityEnch.push({ c, id: e.spell, n: cost(s) }); }
    // nœuds pervertis par un rival : 5 mana par tour chacun
    for (const s of game.sites) if (s.type === 'node' && s.owner === pl.id && s.warped != null) out.warped.push({ s, n: 5 });
    for (const k of ['creatures', 'globals', 'cityEnch', 'warped']) for (const x of out[k]) out.total += x.n;
    return out;
  },
  // entretien réel d'un sort pour ce sorcier (Canaliseur, Conjurateur ; pour une invocation, celui de la créature)
  spellUpkeep(game, pl, id) {
    const s = DATA.spells[id]; if (!s) return 0;
    if (pl && s.kind === 'summon' && s.params && s.params.unit && DATA.units[s.params.unit]) return Units.upkeep(game, { type: s.params.unit, ench: [], owner: pl.id, xp: 0, dmg: 0 }).mana;
    const u = s.upkeep || 0; return pl && pl.retorts && pl.retorts.includes('channeler') ? Math.ceil(u / 2) : u;
  },
  manaPerTurn(game, pl) { return (pl.globals && pl.globals.includes('time_stop') ? 0 : Magic.split(game, pl).mana) - Magic.manaUpkeep(game, pl); },
  // combien plus dur il est de dissiper un sort de ce sorcier : ×2 avec Archimage ou Maître des runes (tous ses sorts),
  // ou avec la maîtrise du royaume du sort
  dispelResist(game, pid, spellId) {
    const pl = game && game.players ? game.players[pid] : null; if (!pl || !pl.retorts) return 1;
    const sp = DATA.spells[spellId] || DATA.spells[String(spellId).replace(/_(melee|def|res)$/, '')] || {};
    let m = 1;
    for (const r of pl.retorts) { const e = (DATA.retorts[r] || {}).effects || {}; if (e.dispelResist && (!e.realm || r === 'runemaster' || e.realm === sp.realm)) m = Math.max(m, e.dispelResist); }
    return m;
  },

  // la solde des troupes avant ce qu'en paie la renommée (le Trône de Crânes compris)
  goldUpkeepGross(game, pl) {
    let g = 0;
    for (const u of Object.values(game.units)) if (u.owner === pl.id) g += Units.upkeep(game, u).gold;
    if (Wonders.has(game, pl.id, 'orc')) g = Math.ceil(g * 0.75);   // Trône de Crânes
    return g;
  },
  goldUpkeepUnits(game, pl) {
    // la renommée réduit l'entretien des troupes (1 or par point, plafonné)
    return Math.max(0, Magic.goldUpkeepGross(game, pl) - Math.floor(Players.fame(game, pl) / 1));
  },
  foodUpkeepUnits(game, pl) { let f = 0; for (const u of Object.values(game.units)) if (u.owner === pl.id) f += Units.upkeep(game, u).food; return f; },

  // ---------- coûts ----------
  spellCost(game, pl, id, combat) {
    const sp = DATA.spells[id];
    // Maîtrise des sorts : la recherche coûte somCost (qui baisse à chaque sort appris), le lancement le coût du grimoire (5000)
    let base = combat ? (sp.combatCost != null ? sp.combatCost : sp.cost) : sp.cost;
    if (base == null) base = 0;
    let mod = 0;
    if (pl.retorts.includes('runemaster') && sp.realm === 'arcane') mod += 0.25;
    if (pl.retorts.includes(sp.realm + 'Mastery')) mod += 0.15;
    if (pl.retorts.includes('conjurer') && sp.section === 'summoning') mod += 0.25;
    if (pl.retorts.includes('artificer') && (id === 'enchant_item' || id === 'create_artifact')) mod += 0.5;
    mod += Math.max(0, (pl.books[sp.realm] || 0) - 7) * 0.1;
    let omens = 1;
    if ((sp.realm === 'life' || sp.realm === 'nature') && game.players.some(o => o && o.alive && o.id !== pl.id && o.globals.includes('evil_omens'))) omens = 1.5;
    // l'Archimage oublié contre le meneur : ses sorts coûtent moitié plus (pas ceux du combat)
    if (!combat && typeof Finale !== 'undefined' && game.finale && game.finale.kind === 'archmage') omens *= Finale.costMult(game, pl);
    return Math.max(1, Math.floor(base * (1 - mod) * omens));
  },
  canCastOverland(pl, id) { const s = DATA.spells[id]; return s && s.overland && pl.known.includes(id); },
  canCastCombat(pl, id) { const s = DATA.spells[id]; return s && s.combat && pl.known.includes(id); },

  // multiplicateur de distance à la forteresse pour les sorts de combat
  distanceMult(game, pl, plane, x, y) {
    const fc = game.cities[pl.fortress];
    const d = fc && fc.plane === plane ? World.dist(game.world, fc.x, fc.y, x, y) : Infinity;
    let m = d === 0 ? 0.5 : d <= 5 ? 1 : d <= 10 ? 1.5 : d <= 15 ? 2 : d <= 20 ? 2.5 : 3;
    // Relais de magie dans la forteresse : le surcoût de distance est divisé par deux (×3 devient ×2)
    if (m > 1 && fc && fc.fortress && fc.buildings.magicRelay) m = 1 + (m - 1) / 2;
    // Canalisateur : jamais de surcoût (mais la ristourne de la forteresse reste)
    return pl.retorts.includes('channeler') ? Math.min(1, m) : m;
  },
};

const Players = {
  // le joueur `viewer` connaît-il le sorcier `other` ? (rencontré, ou lui-même)
  knows(game, viewer, other) {
    if (viewer === other) return true;
    const v = game.players[viewer];
    return !!(v && v.contact && v.contact[other]);
  },
  nameFor(game, viewer, other) {
    const o = game.players[other];
    if (!o) return 'des pillards';
    return Players.knows(game, viewer, other) ? o.name : 'un sorcier inconnu';
  },
  create(game, opts) {
    const pl = {
      id: game.players.length, name: opts.name, portrait: opts.portrait || 0, color: opts.color, human: !!opts.human, alive: true, banished: false,
      race: opts.race, books: Object.assign({ life: 0, death: 0, chaos: 0, nature: 0, sorcery: 0 }, opts.books), retorts: opts.retorts || [],
      gold: opts.gold != null ? opts.gold : 150, mana: opts.mana != null ? opts.mana : 50, fame: opts.retorts && opts.retorts.includes('famous') ? 10 : 0,
      taxIdx: 2, powerSplit: { mana: 34, research: 33, skill: 33 }, skillPoints: 1,
      known: [], researchPool: [], researchOptions: [], researching: null, researchProgress: 0,
      casting: null, skillLeft: 0, globals: [], fortress: null, plane: opts.plane || 0,
      relations: {}, diplo: {}, contact: {}, explored: [null, null], siteKnow: {}, deadHeroes: [], vault: [], heroOfferTurn: 0,
      difficulty: opts.difficulty || 'normal', aiPersonality: opts.personality || 'balanced', stats: [], lastCombatSpells: 0, extraPower: 0,
    };
    game.players.push(pl);
    return pl;
  },
  fame(game, pl) { const p = Players.fameParts(game, pl); return Math.max(0, p.base + U.sum(p.extra, e => e.n)); },
  // d'où vient la renommée : celle acquise, puis ce qui s'y ajoute tant que ça dure (héros légendaires, Juste cause)
  fameParts(game, pl) {
    const extra = [];
    for (const u of Object.values(game.units)) if (u.owner === pl.id && u.hero) {
      const ab = Units.abilities(game, u); const L = Units.levelIndex(game, u) + 1;
      const n = ab.superLegendary ? Math.floor(4.5 * L) : ab.legendary ? 3 * L : 0;
      if (n) extra.push({ what: u.hero.name + ', héros ' + (ab.superLegendary ? 'super légendaire' : 'légendaire'), n });
    }
    if (pl.globals.includes('just_cause')) extra.push({ what: DATA.spells.just_cause.name + ' (sort actif)', n: 10 });
    return { base: pl.fame, extra };
  },
  goldPerTurn(game, pl) {
    let g = 0, food = 0;
    for (const c of Cities.ofPlayer(game, pl.id)) { const e = Cities.econ(game, c); g += e.gold; food += e.foodSurplus + e.foodGlobal; }
    food -= Magic.foodUpkeepUnits(game, pl);
    g -= Magic.goldUpkeepUnits(game, pl);
    for (const u of Object.values(game.units)) if (u.owner === pl.id && u.hero && Units.abilities(game, u).noble) g += 10;
    g += Math.floor(Math.max(0, food) / 2); // le surplus de nourriture se vend
    return { gold: g, food };
  },
  isAtWar(game, a, b) {
    if (a === b) return false;
    if (a < 0 || b < 0) return true;
    const pa = game.players[a]; if (!pa) return true;
    return (pa.diplo[b] || 'war') === 'war';
  },
};
