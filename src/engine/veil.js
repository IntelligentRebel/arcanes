'use strict';
/* Ajouts d'Arcanes (absents de Master of Magic) :
   1. Le voile entre les plans s'amincit : chaque passage d'un plan à l'autre et chaque grand sort l'usent ; à chaque seuil franchi,
      des failles s'ouvrent. Une faille relie les deux plans comme une tour dégagée, et des créatures du Miroir s'en échappent vers Arcane.
      Le Sceau planaire fige le voile ; le sort Sceller une faille referme une faille et recoud un peu le voile.
   2. Les pactes : des sanctuaires de puissances anciennes (deux sur Arcane, quatre sur le Miroir) offrent un don immédiat contre une
      dette à payer plus tard. À l'échéance, on paie, ou on refuse et on subit la riposte.
   3. La Crise : vers un tour fixé à la création de la partie, la Brèche s'ouvre, corrompt les terres alentour et envoie des vagues de
      créatures sur le sorcier le plus puissant. La refermer met fin à la crise et rapporte gros. */

const VEIL_STAGES = [80, 60, 40, 20];       // seuils du voile
const VEIL_RIFTS = [1, 2, 2, 3];            // failles ouvertes à chaque seuil
const VEIL_EXCLUDED = ['MagicSpirit', 'GuardianSpirit', 'FloatingIsland', 'PhantomWarrior', 'PhantomBeast', 'AirElemental', 'EarthElemental', 'FireElemental', 'Demon', 'Zombie'];

const Veil = {
  citizensText(n) { return (['', 'un citoyen', 'deux citoyens', 'trois citoyens', 'quatre citoyens', 'cinq citoyens'][n] || n + ' citoyens'); },
  init(game) {
    if (game.veil == null) game.veil = 100;
    if (game.veilStage == null) game.veilStage = 0;
  },
  sealed(game) { return game.players.some(p => p.alive && p.globals.includes('planar_seal')); },
  stageName(game) {
    const v = game.veil;
    return v > 80 ? 'intact' : v > 60 ? 'éraillé' : v > 40 ? 'élimé' : v > 20 ? 'déchiré' : 'en lambeaux';
  },
  nextThreshold(game) { return game.veilStage < VEIL_STAGES.length ? VEIL_STAGES[game.veilStage] : null; },

  // créatures fantastiques d'un ou plusieurs royaumes, d'un coût d'invocation au plus égal à max
  pool(realms, max, min = 0) {
    return Object.values(DATA.units).filter(u => u.race === 'fantastic' && realms.includes(u.realm) && u.castCost > min && u.castCost <= max && !VEIL_EXCLUDED.includes(u.id));
  },
  // une troupe tirée au sort dans le budget : la plus grosse créature abordable, puis des renforts
  muster(game, realms, budget, maxUnits, cap = 1000) {
    const rng = game.rng, out = [];
    let left = budget;
    while (out.length < maxUnits) {
      const cands = Veil.pool(realms, Math.min(cap, left));
      if (!cands.length) break;
      const pick = out.length === 0 ? U.max(cands, u => u.castCost + rng.next() * 120) : rng.pick(cands);
      out.push(pick.id); left -= pick.castCost;
    }
    if (!out.length) { const c = U.min(Veil.pool(realms, 9999), u => u.castCost); if (c) out.push(c.id); }
    return out;
  },
  // case de terre libre près de (x, y) : ni eau, ni montagne, ni cité, ni lieu, ni unité
  freeNear(game, p, x, y, r = 2) {
    const w = game.world;
    for (let d = 1; d <= r; d++) {
      const ring = [];
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const yy = y + dy; if (!World.inY(w, yy)) continue;
        const xx = World.wx(w, x + dx);
        if (World.isWaterAt(w, p, xx, yy) || World.terr(w, p, xx, yy) === T.MOUNTAIN) continue;
        if (Cities.at(game, p, xx, yy) || World.get(w, p, 'site', xx, yy) >= 0 || Units.at(game, p, xx, yy).length) continue;
        ring.push([xx, yy]);
      }
      if (ring.length) return game.rng.pick(ring);
    }
    return null;
  },
  // des unités passent à l'ennemi : elles quittent la case (et la cité) de leur ancien maître
  turnHostile(game, units) {
    units = units.filter(Boolean); if (!units.length) return;
    for (const u of units) { u.owner = -1; u.rampage = true; u.status = ''; u.path = null; u.dest = null; delete u.pactFree; delete u.govCity; }
    const groups = {};
    for (const u of units) (groups[u.plane + ',' + u.x + ',' + u.y] = groups[u.plane + ',' + u.x + ',' + u.y] || []).push(u);
    for (const g of Object.values(groups)) {
      const u0 = g[0];
      if (!Cities.at(game, u0.plane, u0.x, u0.y) && !Units.at(game, u0.plane, u0.x, u0.y).some(o => o.owner !== -1)) continue;
      const at = Veil.freeNear(game, u0.plane, u0.x, u0.y, 3);
      for (const u of g) { if (at) { u.x = at[0]; u.y = at[1]; } else Units.remove(game, u); }
    }
  },
  // des créatures hostiles surgissent près d'une case
  spawnHostile(game, types, p, x, y, extra) {
    const at = Veil.freeNear(game, p, x, y, 3); if (!at) return [];
    return types.map(t => { const u = Units.create(game, t, -1, p, at[0], at[1]); u.rampage = true; if (extra) Object.assign(u, extra); return u; });
  },

  // ---------- usure du voile ----------
  thin(game, amt) {
    Veil.init(game);
    if (amt <= 0 || Veil.sealed(game)) return;
    game.veil = Math.max(0, Math.round((game.veil - amt) * 100) / 100);
    while (game.veilStage < VEIL_STAGES.length && game.veil <= VEIL_STAGES[game.veilStage]) {
      const n = VEIL_RIFTS[game.veilStage]; game.veilStage++;
      const opened = [];
      for (let i = 0; i < n; i++) { const s = Veil.openRift(game); if (s) opened.push(s); }
      if (!opened.length) continue;
      const s = opened[0];
      Game.logEach(game, () => 'Le voile entre les plans se déchire : ' + (opened.length > 1 ? opened.length + ' failles s\'ouvrent' : 'une faille s\'ouvre') + ' entre Arcane et le Miroir (' + s.x + ', ' + s.y + (opened.length > 1 ? ' et ailleurs' : '') + ').', { x: s.x, y: s.y, plane: 0, rift: true });
    }
  },
  mend(game, amt) {
    Veil.init(game);
    game.veil = Math.min(100, game.veil + amt);
    // un voile recousu au-dessus d'un seuil pourra se rouvrir plus tard
    while (game.veilStage > 0 && game.veil > VEIL_STAGES[game.veilStage - 1] + 4) game.veilStage--;
  },
  // un passage d'un plan à l'autre (tour, faille, porte astrale, saut de plan)
  onCross(game, pl, n) { Veil.thin(game, 0.8 * Math.max(1, n)); },
  // les grands sorts usent le voile
  onSpell(game, pl, id) {
    const sp = DATA.spells[id]; if (!sp) return;
    // les invocations tirent leurs créatures d'au-delà du voile
    const w = (sp.rarity === 'veryrare' ? 1 : sp.rarity === 'rare' ? 0.5 : 0) + (sp.kind === 'summon' ? 0.25 : 0);
    if (w) Veil.thin(game, w);
  },

  // ---------- failles ----------
  rifts(game, p = 0) { return game.sites.filter(s => s.type === 'rift' && !s.closed && s.plane === p); },
  riftAt(game, p, x, y) {
    const si = World.get(game.world, p, 'site', x, y);
    const s = si >= 0 ? game.sites[si] : null;
    return s && s.type === 'rift' && !s.closed ? s : null;
  },
  openRift(game) {
    const w = game.world, rng = game.rng;
    const cities = Object.values(game.cities);
    const ok = (x, y) => {
      for (const p of [0, 1]) {
        if (World.isWaterAt(w, p, x, y)) return false;
        const t = World.terr(w, p, x, y); if (t === T.MOUNTAIN || t === T.VOLCANO) return false;
        if (World.get(w, p, 'site', x, y) >= 0) return false;
      }
      for (const c of cities) if (World.dist(w, c.x, c.y, x, y) < 3) return false;
      for (const s of game.sites) if (!s.closed && World.dist(w, s.x, s.y, x, y) < 2) return false;
      return true;
    };
    const cands = [];
    for (let y = 2; y < w.h - 2; y++) for (let x = 0; x < w.w; x++) if (ok(x, y)) cands.push([x, y]);
    if (!cands.length) return null;
    const [x, y] = rng.pick(cands);
    const a = MapGen.addSite(game, { type: 'rift', plane: 0, x, y, cleared: true, guardians: [], budget: 0, born: game.turn });
    const b = MapGen.addSite(game, { type: 'rift', plane: 1, x, y, cleared: true, guardians: [], budget: 0, born: game.turn });
    a.pair = b.id; b.pair = a.id;
    // tous les sorciers sentent la déchirure
    for (const pl of game.players) if (pl.alive) { Move.reveal(game, pl, 0, x, y, 1); Move.reveal(game, pl, 1, x, y, 1); }
    return a;
  },
  closeRift(game, s, by) {
    for (const r of [s, game.sites[s.pair]]) {
      if (!r) continue;
      r.closed = true;
      if (World.get(game.world, r.plane, 'site', r.x, r.y) === r.id) World.set(game.world, r.plane, 'site', r.x, r.y, -1);
      if (Game.hooks.fx) Game.hooks.fx({ type: 'riftClose', x: r.x, y: r.y, plane: r.plane, id: r.id, by, main: r === s });
    }
    for (const u of Object.values(game.units)) if (u.riftOf === s.id || u.riftOf === s.pair) delete u.riftOf;
  },

  // ---------- chaque tour ----------
  tick(game) {
    Veil.init(game);
    if (game.turn > 25) Veil.thin(game, 0.22);
    if (Veil.sealed(game)) return;
    for (const s of Veil.rifts(game, 0)) {
      const period = Math.max(6, 14 - 2 * game.veilStage);
      if ((game.turn + s.id * 3) % period !== 0 || game.turn - s.born < 3) continue;
      const out = Object.values(game.units).filter(u => u.riftOf === s.id).length;
      if (out >= 3) continue;
      const budget = 40 + 2.2 * game.turn + 40 * game.veilStage;
      const types = Veil.muster(game, ['chaos', 'death', 'sorcery', 'nature', 'life'], budget, game.turn > 120 ? 3 : 2, 650);
      const made = Veil.spawnHostile(game, types, 0, s.x, s.y, { riftOf: s.id });
      if (!made.length) continue;
      for (const pl of game.players) {
        if (!pl.alive) continue;
        const near = Cities.ofPlayer(game, pl.id).some(c => c.plane === 0 && World.dist(game.world, c.x, c.y, s.x, s.y) <= 12);
        if (near) Game.log(game, pl.id, 'Des créatures du Miroir franchissent la faille (' + s.x + ', ' + s.y + ') : ' + U.uniq(made.map(u => DATA.units[u.type].name.toLowerCase())).join(', ') + '.', { x: made[0].x, y: made[0].y, plane: 0 });
      }
    }
  },
};

// ---------- pactes ----------
const PACT_ACCEPT = { maniac: 0.85, militarist: 0.65, expansionist: 0.55, balanced: 0.45, perfectionist: 0.2 };
const PACTS = {
  usurer: {
    hint: "Prête de l'or tout de suite ; réclame le double 20 tours plus tard.",
    owed: b => 'Le double de son prêt : ' + 2 * b.gold + ' or.',
    name: 'l\'Usurier d\'Ombre', plane: 0, realm: 'death', color: '#9b8cff', due: 20,
    lore: 'Une silhouette sans visage compte des pièces qui ne tintent pas. Elle prête à qui veut, et n\'oublie personne.',
    boon(game) { return { gold: Math.round((150 + 3 * game.turn) / 10) * 10 }; },
    boonText: b => 'Il vous prête ' + b.gold + ' pièces d\'or, tout de suite.',
    debtText: b => 'Dans 20 tours, il reviendra chercher le double : ' + 2 * b.gold + ' or.',
    refuseText: 'Ses huissiers se paient eux-mêmes : deux traqueurs nocturnes surgissent près de votre plus grande cité, et votre renommée en pâtit (-5).',
    give(game, pl, b) { pl.gold += b.gold; return b.gold + ' pièces d\'or'; },
    pay(game, pl, pact) { const g = 2 * pact.data.gold; return [{ id: 'gold', label: 'Rembourser ' + g + ' or', can: pl.gold >= g, apply() { pl.gold -= g; } }]; },
    refuse(game, pl) {
      const c = U.max(Cities.ofPlayer(game, pl.id), c => c.pop);
      if (c) Veil.spawnHostile(game, ['NightStalker', 'NightStalker'], c.plane, c.x, c.y);
      pl.fame = Math.max(0, pl.fame - 5);
    },
  },
  swarm: {
    hint: 'Offre des créatures de la nature sans entretien ; réclame trois soldats 25 tours plus tard.',
    owed: () => 'Trois de vos soldats, pour nourrir l\'essaim.',
    name: 'la Mère des Essaims', plane: 0, realm: 'nature', color: '#7fd06a', due: 25,
    lore: 'Sous la colline, quelque chose de très vieux pond sans relâche, et nourrit ses petits de ce qu\'on lui apporte.',
    boon(game) { return { units: game.turn < 60 ? ['GiantSpiders', 'WarBear'] : game.turn < 120 ? ['GiantSpiders', 'GiantSpiders', 'WarBear'] : ['Basilisk', 'GiantSpiders', 'GiantSpiders'] }; },
    boonText: b => 'Ses enfants vous suivent, sans entretien : ' + b.units.map(t => DATA.units[t].name.toLowerCase()).join(', ') + '.',
    debtText: () => 'Dans 25 tours, elle réclamera trois de vos soldats pour nourrir l\'essaim.',
    refuseText: 'Ses enfants se retournent contre vous, et l\'essaim surgit près de votre plus grande cité.',
    give(game, pl, b, ctx, pact) {
      pact.data.ids = [];
      for (const t of b.units) { const u = Pacts.placeFor(game, pl, t, ctx); if (u) { u.pactFree = true; pact.data.ids.push(u.id); } }
      return b.units.map(t => DATA.units[t].name.toLowerCase()).join(', ');
    },
    // les soldats qu'elle accepte (unités normales, ni héros, ni colons, ni ingénieurs, ni éclaireurs), du plus faible au plus fort
    eligible(game, pl) {
      return Object.values(game.units).filter(u => u.owner === pl.id && Units.isNormal(u) && !u.hero && !Units.isSettler(u) && !Units.isEngineer(u) && !Units.isScout(u))
        .sort((a, b) => Units.strength(game, a) - Units.strength(game, b));
    },
    soldiers(game, pl) { return PACTS.swarm.eligible(game, pl).slice(0, 3); },
    pay(game, pl, pact) {
      // les trois soldats choisis par le joueur (pact.data.pick), sinon les trois plus faibles
      const ok = new Set(PACTS.swarm.eligible(game, pl).map(u => u.id));
      const pick = ((pact && pact.data.pick) || []).filter(id => ok.has(id)).map(id => game.units[id]);
      const s = pick.length === 3 && new Set(pick).size === 3 ? pick : PACTS.swarm.soldiers(game, pl);
      return [{ id: 'soldiers', label: s.length >= 3 ? 'Livrer ' + s.map(u => Units.label(u).toLowerCase()).join(', ') : 'Livrer trois soldats (vous n\'en avez pas assez)', can: s.length >= 3, apply() { for (const u of s) Units.remove(game, u); } }];
    },
    refuse(game, pl, pact) {
      Veil.turnHostile(game, (pact.data.ids || []).map(id => game.units[id]).filter(u => u && u.owner === pl.id));
      const c = U.max(Cities.ofPlayer(game, pl.id), c => c.pop);
      if (c) Veil.spawnHostile(game, ['GiantSpiders', 'GiantSpiders'], c.plane, c.x, c.y);
    },
  },
  archivist: {
    hint: 'Enseigne aussitôt le sort que vous étudiez ; réclame du mana 25 tours plus tard.',
    owed: b => (b.spell ? b.mana : 300) + ' mana, en échange de son savoir.',
    name: 'l\'Archiviste aveugle', plane: 1, realm: 'sorcery', color: '#62b8ff', due: 25,
    lore: 'Il a lu tous les grimoires du monde, puis s\'est crevé les yeux pour ne plus rien lire d\'autre. Il échange ce qu\'il sait contre ce que vous avez.',
    boon(game, pl) {
      const id = pl.researching && DATA.spells[pl.researching] && pl.researching !== 'spell_of_mastery' ? pl.researching : U.min(pl.researchOptions.filter(x => x !== 'spell_of_mastery'), x => Magic.researchCost(pl, x));
      if (!id) return { mana: 200 };
      return { spell: id, mana: Math.max(120, Math.round(Magic.researchCost(pl, id) * 0.5 / 10) * 10) };
    },
    boonText: b => b.spell ? 'Il vous enseigne aussitôt ' + DATA.spells[b.spell].name + '.' : 'Il n\'a rien à vous apprendre que vous ne cherchiez déjà ; il vous cède 200 mana.',
    debtText: b => b.spell ? 'Dans 25 tours, il exigera ' + b.mana + ' mana en échange.' : 'Dans 25 tours, il exigera 300 mana.',
    refuseText: b => b && b.spell ? 'Il reprend ce qu\'il a donné : vous oubliez le sort enseigné, et votre renommée en pâtit (-3).' : 'Il ne l\'oubliera pas : votre renommée en pâtit (-3).',
    give(game, pl, b) {
      if (!b.spell) { pl.mana += 200; return '200 mana'; }
      Magic.learn(game, pl, b.spell);
      if (pl.human && !pl.researching) pl.mustChooseResearch = true;
      return 'le sort ' + DATA.spells[b.spell].name;
    },
    pay(game, pl, pact) { const m = pact.data.spell ? pact.data.mana : 300; return [{ id: 'mana', label: 'Lui céder ' + m + ' mana', can: pl.mana >= m, apply() { pl.mana -= m; } }]; },
    refuse(game, pl, pact) {
      const id = pact.data.spell;
      if (id) Pacts.forget(game, pl, id);
      pl.fame = Math.max(0, pl.fame - 3);
    },
  },
  // v0.31.3 : la dette suit la valeur du serviteur (elle était de deux citoyens pour une hydre, qui prenait une capitale à elle seule) :
  // autant de mana que son sort d'invocation, plus 2 par tour de jeu ; ou 2, 3 ou 4 citoyens d'une grande cité
  ashes: {
    hint: 'Offre un serviteur de feu sans entretien ; réclame des citoyens ou du mana 20 tours plus tard.',
    owed: b => U.cap(Veil.citizensText(b.pop || 2)) + ' d\'une cité qui en compte au moins ' + ((b.pop || 2) + 2) + ', ou ' + b.mana + ' mana.',
    name: 'le Prince des Cendres', plane: 1, realm: 'chaos', color: '#ff7a3c', due: 20,
    lore: 'Un trône de braises sur lequel rien ne siège. Quelqu\'un répond pourtant, d\'une voix de forge.',
    boon(game) {
      const t = game.turn < 70 ? 'Chimeras' : game.turn < 130 ? 'Efreet' : 'Hydra', sp = Object.values(DATA.spells).find(s => s.params && s.params.unit === t);
      return { unit: t, mana: (sp ? sp.cost : 400) + 2 * game.turn, pop: { Chimeras: 2, Efreet: 3, Hydra: 4 }[t] };
    },
    boonText: b => 'Un serviteur de feu vous rejoint, sans entretien : ' + DATA.units[b.unit].name.toLowerCase() + '.',
    debtText: b => 'Dans 20 tours, il exigera une offrande : ' + Veil.citizensText(b.pop || 2) + ' d\'une grande cité, ou ' + b.mana + ' mana.',
    refuseText: 'Son serviteur se retourne contre vous, escorté de chiens infernaux.',
    give(game, pl, b, ctx, pact) { const u = Pacts.placeFor(game, pl, b.unit, ctx); if (u) { u.pactFree = true; pact.data.id = u.id; } return DATA.units[b.unit].name.toLowerCase(); },
    pay(game, pl, pact) {
      const k = pact.data.pop || 2, c = U.max(Cities.ofPlayer(game, pl.id).filter(c => Cities.citizens(c) >= k + 2), c => c.pop - (c.fortress ? 4000 : 0));
      const m = pact.data.mana;
      return [
        { id: 'pop', label: c ? 'Offrir ' + Veil.citizensText(k) + ' de ' + c.name : 'Offrir ' + Veil.citizensText(k) + ' (aucune cité assez grande)', can: !!c, apply() { c.pop = Math.max(1000, c.pop - k * 1000); } },
        { id: 'mana', label: 'Offrir ' + m + ' mana', can: pl.mana >= m, apply() { pl.mana -= m; } },
      ];
    },
    refuse(game, pl, pact) {
      const u = game.units[pact.data.id];
      if (u && u.owner === pl.id) {
        Veil.turnHostile(game, [u]);
        if (game.units[u.id]) Veil.spawnHostile(game, ['HellHounds', 'HellHounds'], u.plane, u.x, u.y);
      } else {
        const c = U.max(Cities.ofPlayer(game, pl.id), c => c.pop);
        if (c) Veil.spawnHostile(game, [pact.data.unit, 'HellHounds', 'HellHounds'], c.plane, c.x, c.y);
      }
    },
  },
  faceless: {
    hint: "Prête un héros aguerri ; réclame l'un de vos héros 30 tours plus tard.",
    owed: () => 'L\'un de vos héros, pour toujours.',
    name: 'le Roi sans Visage', plane: 1, realm: 'death', color: '#b06cff', due: 30,
    lore: 'Ses courtisans sont morts depuis mille ans et lui obéissent encore. Il prête volontiers ses champions.',
    boon(game, pl) { const h = Heroes.heroCount(game, pl) < 6 ? Heroes.randomAvailable(game, pl, true) : null; return h ? { hero: h.id } : { units: ['Wraith'] }; },
    boonText: b => b.hero ? 'Un champion de sa cour vous rejoint : ' + DATA.heroes[b.hero].name + ', déjà aguerri.' : 'Un spectre de sa cour vous rejoint, sans entretien.',
    debtText: () => 'Dans 30 tours, il réclamera l\'un de vos héros, pour toujours.',
    refuseText: 'La Terreur s\'abat sur vos terres : +2 d\'agitation dans toutes vos cités pendant 15 tours, et -5 de renommée.',
    give(game, pl, b, ctx, pact) {
      // un champion, s'il reste de la place parmi vos six héros et qu'il n'a pas rejoint quelqu'un d'autre entre-temps
      const h = b.hero && DATA.heroes[b.hero];
      const at = h && Heroes.heroCount(game, pl) < 6 && !Heroes.takenHeroes(game).has(h.unit) ? Spells.spotNear(game, pl, ctx, h.unit) : null;
      if (at) {
        const u = Heroes.spawn(game, pl, h, at[0], at[1], at[2], HERO_LEVELS[2].xp); pact.data.id = u.id;
        return 'le héros ' + u.hero.name;
      }
      const u = Pacts.placeFor(game, pl, 'Wraith', ctx); if (u) u.pactFree = true;
      return 'un spectre';
    },
    pay(game, pl) {
      const hs = Object.values(game.units).filter(u => u.owner === pl.id && u.hero && !u.avatar).sort((a, b) => a.xp - b.xp).slice(0, 4);
      if (!hs.length) return [{ id: 'none', label: 'Livrer un héros (vous n\'en avez aucun)', can: false, apply() {} }];
      return hs.map(u => ({ id: 'hero:' + u.id, label: 'Livrer ' + u.hero.name, can: true, apply() {
        Units.remove(game, u, { forever: true });   // ses objets retournent au coffre
      } }));
    },
    refuse(game, pl) { pl.terror = game.turn + 15; pl.fame = Math.max(0, pl.fame - 5); },
  },
  mists: {
    hint: 'Guérit vos troupes et fait grandir vos cités ; réclame le quart de vos réserves 25 tours plus tard.',
    owed: () => 'Le quart de votre or et de votre mana.',
    name: 'la Dame des Brumes', plane: 1, realm: 'life', color: '#f0f4ff', due: 25,
    lore: 'Ses brumes referment les plaies et font lever les épis. Elle demande seulement qu\'on lui rende la pareille, le moment venu.',
    boon() { return {}; },
    boonText: () => 'Toutes vos unités sont guéries, et chacune de vos cités gagne un citoyen.',
    debtText: () => 'Dans 25 tours, elle prendra le quart de votre or et de votre mana.',
    refuseText: 'Ses brumes se retirent en emportant un citoyen de chacune de vos cités.',
    give(game, pl) {
      for (const u of Object.values(game.units)) if (u.owner === pl.id) u.dmg = 0;
      for (const c of Cities.ofPlayer(game, pl.id)) c.pop = Math.min(MAX_CITY_SIZE * 1000, c.pop + 1000);
      return 'soins et croissance';
    },
    pay(game, pl) {
      const g = Math.max(0, Math.floor(pl.gold / 4)), m = Math.max(0, Math.floor(pl.mana / 4));
      return [{ id: 'quarter', label: 'Lui céder ' + g + ' or et ' + m + ' mana', can: true, apply() { pl.gold -= g; pl.mana -= m; } }];
    },
    refuse(game, pl) { for (const c of Cities.ofPlayer(game, pl.id)) c.pop = Math.max(1000, c.pop - 1000); },
  },
};

const Pacts = {
  ENT: PACTS,
  name(e) { return PACTS[e] ? U.cap(PACTS[e].name) : 'Une puissance'; },
  place(game) {
    if (game.pactsPlaced) return;
    game.pactsPlaced = true;
    const w = game.world, rng = game.rng;
    for (const [e, d] of Object.entries(PACTS)) {
      const p = d.plane;
      // sur une petite carte encombrée, on desserre les distances plutôt que d'oublier un sanctuaire
      let cands = [];
      for (const [dc, ds] of [[5, 3], [3, 2], [2, 1]]) {
        for (let y = 2; y < w.h - 2; y++) for (let x = 0; x < w.w; x++) {
          if (World.isWaterAt(w, p, x, y)) continue;
          const t = World.terr(w, p, x, y); if (t === T.MOUNTAIN || t === T.VOLCANO) continue;
          if (World.get(w, p, 'site', x, y) >= 0 || Units.at(game, p, x, y).length) continue;
          let ok = true;
          for (const c of Object.values(game.cities)) if (c.plane === p && World.dist(w, c.x, c.y, x, y) < dc) { ok = false; break; }
          if (ok) for (const s of game.sites) if (s.plane === p && !s.closed && World.dist(w, s.x, s.y, x, y) < ds) { ok = false; break; }
          if (ok) for (const k of game.caches || []) if (k.plane === p && k.x === x && k.y === y) { ok = false; break; }
          if (ok) cands.push([x, y]);
        }
        if (cands.length) break;
      }
      if (!cands.length) continue;
      // de préférence sur une terre assez vaste pour qu'on y vienne à pied (pas sur un îlot de trois cases)
      let pick = null;
      for (let i = 0; i < 40 && !pick; i++) { const c = rng.pick(cands); if (Game.reachableLand(game, p, c[0], c[1], 30).size >= 15) pick = c; }
      const [x, y] = pick || rng.pick(cands);
      MapGen.addSite(game, { type: 'shrine', entity: e, plane: p, x, y, cleared: true, guardians: [], budget: 0 });
    }
  },
  of(pl) { return pl.pacts || (pl.pacts = []); },
  // ce qu'il en coûte de refuser (le texte peut dépendre de ce qui a été donné)
  refuseText(e, b) { const t = PACTS[e] && PACTS[e].refuseText; return typeof t === 'function' ? t(b || {}) : (t || ''); },
  pactWith(pl, e) { return Pacts.of(pl).find(p => p.entity === e); },
  // ce qu'une puissance offre à ce sorcier, maintenant
  offer(game, pl, e) {
    const d = PACTS[e]; const b = d.boon(game, pl);
    return { entity: e, name: Pacts.name(e), lore: d.lore, boon: b, boonText: d.boonText(b), debtText: d.debtText(b), refuseText: Pacts.refuseText(e, b), due: d.due };
  },
  placeFor(game, pl, type, ctx) {
    const p = ctx.plane;
    if (Units.at(game, p, ctx.x, ctx.y).filter(u => u.owner === pl.id).length < MAX_STACK) { const u = Units.create(game, type, pl.id, p, ctx.x, ctx.y); u.moves = 0; return u; }
    const at = Veil.freeNear(game, p, ctx.x, ctx.y, 2); if (!at) return null;
    const u = Units.create(game, type, pl.id, p, at[0], at[1]); u.moves = 0; return u;
  },
  accept(game, pl, e, ctx, offer) {
    const d = PACTS[e]; if (!d || Pacts.pactWith(pl, e)) return { ok: false, why: 'Un pacte vous lie déjà à cette puissance.' };
    const off = offer || Pacts.offer(game, pl, e);
    const pact = { entity: e, turn: game.turn, due: game.turn + d.due, state: 'active', data: Object.assign({}, off.boon) };
    Pacts.of(pl).push(pact);
    const got = d.give(game, pl, off.boon, ctx, pact);
    Game.log(game, pl.id, 'Pacte scellé avec ' + d.name + ' : ' + got + '. Échéance au tour ' + pact.due + '.', { x: ctx.x, y: ctx.y, plane: ctx.plane, pact: e });
    return { ok: true, pact };
  },
  // options de paiement à l'échéance
  payOptions(game, pl, pact) { return PACTS[pact.entity].pay(game, pl, pact); },
  settle(game, pl, pact, choice) {
    const d = PACTS[pact.entity];
    if (pact.state !== 'due' && pact.state !== 'active') return { ok: false };
    if (choice && choice !== 'refuse') {
      const o = Pacts.payOptions(game, pl, pact).find(x => x.id === choice);
      if (o && o.can) {
        o.apply(); pact.state = 'paid';
        Game.log(game, pl.id, U.cap(d.name) + ' a reçu son dû. Le pacte est soldé.', { pact: pact.entity });
        return { ok: true, paid: true };
      }
    }
    d.refuse(game, pl, pact); pact.state = 'refused';
    const big = U.max(Cities.ofPlayer(game, pl.id), c => c.pop);   // les représailles surgissent près de la plus grande cité
    Game.log(game, pl.id, 'Vous refusez de payer ' + d.name + '. ' + Pacts.refuseText(pact.entity, pact.data), Object.assign({ pact: pact.entity }, big ? { city: big.id } : {}));
    return { ok: true, paid: false };
  },
  // oubli d'un sort (riposte de l'Archiviste)
  forget(game, pl, id) {
    if (pl.known.includes(id) && id !== 'spell_of_mastery') pl.somCost = (pl.somCost ?? 60000) + Math.floor((DATA.spells[id].research || 0) / 2);   // réappris plus tard, il ne compte pas deux fois
    pl.known = pl.known.filter(x => x !== id);
    if (pl.casting && pl.casting.id === id) pl.casting = null;   // on n'achève pas l'incantation d'un sort oublié
    pl.globals = pl.globals.filter(x => x !== id); Units.fixAll(game, pl.id);
    if (!pl.researchPool.includes(id)) pl.researchPool.push(id);
    Magic.refreshResearchOptions(game, pl);
  },
  shrineAt(game, p, x, y) {
    const si = World.get(game.world, p, 'site', x, y);
    const s = si >= 0 ? game.sites[si] : null;
    return s && s.type === 'shrine' && PACTS[s.entity] ? s : null;
  },
  // une pile entre dans un sanctuaire (pendant un déplacement automatique, le joueur humain écoutera l'offre plus tard)
  async onEnter(game, pl, units, p, x, y, auto) {
    const s = Pacts.shrineAt(game, p, x, y); if (!s) return;
    const e = s.entity, d = PACTS[e];
    const prev = Pacts.pactWith(pl, e);
    if (prev) { if (pl.human && !auto) Game.log(game, pl.id, U.cap(d.name) + ' ne traite qu\'une fois avec chaque sorcier.', { x, y, plane: p, minor: true }); return; }
    if ((pl.pactAsked || {})[e] === game.turn) return;
    (pl.pactAsked = pl.pactAsked || {})[e] = game.turn;
    if (pl.human && auto) { Game.log(game, pl.id, 'Vos troupes atteignent le ' + Game.siteName(s) + ' : sélectionnez-les et choisissez Pacte pour entendre son offre.', { x, y, plane: p }); return; }
    return Pacts.propose(game, pl, s);
  },
  async propose(game, pl, s) {
    const e = s.entity, p = s.plane, x = s.x, y = s.y;
    if (Pacts.pactWith(pl, e)) return;
    // une offre entendue reste la même jusqu'à la fin du tour (pas de relance en cliquant de nouveau)
    pl.pactOffers = pl.pactOffers || {};
    const prev = pl.pactOffers[e];
    const off = prev && prev.turn === game.turn ? prev.offer : Pacts.offer(game, pl, e);
    pl.pactOffers[e] = { turn: game.turn, offer: off };
    let yes;
    if (pl.human) yes = Game.hooks.choose ? await Game.hooks.choose(game, pl.id, { type: 'pact', site: s, offer: off }) : false;
    else yes = game.rng.chance(PACT_ACCEPT[pl.aiPersonality] || 0.4) || e === 'mists';
    if (yes) Pacts.accept(game, pl, e, { plane: p, x, y }, off);
  },
  tick(game) {
    for (const pl of game.players) {
      if (!pl.alive || !pl.pacts) continue;
      for (const pact of pl.pacts) {
        if (pact.state === 'active' && game.turn === pact.due - 3 && pl.human) Game.log(game, pl.id, U.cap(PACTS[pact.entity].name) + ' viendra réclamer son dû dans 3 tours. ' + PACTS[pact.entity].owed(pact.data), { pact: pact.entity });
        if (pact.state === 'active' && game.turn >= pact.due) pact.state = 'due';
        if (pact.state !== 'due') continue;
        if (!pl.human) {
          const opts = Pacts.payOptions(game, pl, pact).filter(o => o.can);
          const stingy = pl.aiPersonality === 'maniac' && game.rng.chance(0.5);
          Pacts.settle(game, pl, pact, opts.length && !stingy ? opts[0].id : 'refuse');
        } else if (game.turn >= pact.due + 2) Pacts.settle(game, pl, pact, 'refuse'); // échéance ignorée
      }
    }
  },
  due(game, pl) { return (pl.pacts || []).filter(p => p.state === 'due'); },
};

// ---------- la Crise ----------
const CRISIS_AT = { early: 100, normal: 150, late: 200 };
const Crisis = {
  init(game, mode) {
    if (game.crisis) return;
    mode = mode || 'normal';
    game.crisis = { mode, at: CRISIS_AT[mode] || null, state: mode === 'off' ? 'off' : 'pending', site: null, start: 0, waves: 0, next: 0 };
  },
  active(game) { return game.crisis && game.crisis.state === 'active'; },
  site(game) { return game.crisis && game.crisis.site != null ? game.sites[game.crisis.site] : null; },
  // le plus puissant des sorciers : population, puissance magique, sorts connus
  score(game, p) { return U.sum(Cities.ofPlayer(game, p.id), c => Cities.citizens(c)) + Magic.power(game, p) / 2 + p.known.length / 3; },
  strongest(game, plane) {
    const alive = game.players.filter(p => p.alive && !p.banished && (plane == null || Cities.ofPlayer(game, p.id).some(c => c.plane === plane)));
    return U.max(alive, p => Crisis.score(game, p));
  },
  tick(game) {
    const k = game.crisis; if (!k || k.state === 'off' || k.state === 'over') return;
    if (k.state === 'pending') {
      if (game.turn === k.at - 10) Game.logEach(game, () => 'Les astrologues s\'alarment : une étoile noire grandit dans le ciel. Dans dix tours, quelque chose va s\'ouvrir.', { crisis: true });
      if (game.turn >= k.at) Crisis.begin(game);
      return;
    }
    const s = Crisis.site(game); if (!s || s.cleared) { k.state = 'over'; return; }
    const t = game.turn - k.start, rng = game.rng, w = game.world;
    // la corruption s'étend
    if (t % 3 === 0) {
      const r = Math.min(8, 2 + Math.floor(t / 6));
      for (let i = 0; i < 12; i++) {
        const x = World.wx(w, s.x + rng.int(2 * r + 1) - r), y = s.y + rng.int(2 * r + 1) - r;
        if (!World.inY(w, y) || World.isWaterAt(w, s.plane, x, y) || Cities.at(game, s.plane, x, y) || World.get(w, s.plane, 'corrupt', x, y)) continue;
        World.set(w, s.plane, 'corrupt', x, y, 1); break;
      }
    }
    // la Brèche se renforce
    if (t % 5 === 0 && s.guardians.length < MAX_STACK) {
      const c = Veil.pool(['chaos', 'death'], 400 + 10 * t, 50);
      if (c.length) s.guardians.push(rng.pick(c).id);
    }
    // une vague
    if (game.turn >= k.next) Crisis.wave(game);
  },
  begin(game) {
    const k = game.crisis, w = game.world, rng = game.rng;
    const count = p => Object.values(game.cities).filter(c => c.owner >= 0 && c.plane === p).length;
    const p = count(1) > count(0) ? 1 : 0;
    const wc = Object.values(game.cities).filter(c => c.owner >= 0 && c.plane === p);
    // terres reliées à pied aux cités des sorciers (sans traverser l'eau ni les montagnes) : les vagues doivent pouvoir les atteindre
    const reach = new Uint8Array(w.w * w.h), q = [];
    for (const c of wc) { const i = c.y * w.w + c.x; if (!reach[i]) { reach[i] = 1; q.push([c.x, c.y]); } }
    while (q.length) {
      const [x, y] = q.pop();
      for (const [nx, ny] of World.neighbors(w, x, y)) {
        const i = ny * w.w + nx; if (reach[i]) continue;
        if (World.isWaterAt(w, p, nx, ny) || World.terr(w, p, nx, ny) === T.MOUNTAIN) continue;
        reach[i] = 1; q.push([nx, ny]);
      }
    }
    const cands = [];
    for (let y = 3; y < w.h - 3; y++) for (let x = 0; x < w.w; x++) {
      if (World.isWaterAt(w, p, x, y) || !reach[y * w.w + x]) continue;
      const tt = World.terr(w, p, x, y); if (tt === T.MOUNTAIN || tt === T.VOLCANO) continue;
      if (World.get(w, p, 'site', x, y) >= 0 || Cities.at(game, p, x, y)) continue;
      let dmin = 99; for (const c of wc) dmin = Math.min(dmin, World.dist(w, c.x, c.y, x, y));
      if (dmin < 5) continue;
      let near = false; for (const c of Object.values(game.cities)) if (c.plane === p && World.dist(w, c.x, c.y, x, y) < 3) { near = true; break; }
      if (near) continue;
      // assez de terre autour pour que les vagues en sortent
      let land = 0; for (const [nx, ny] of World.neighbors(w, x, y)) if (!World.isWaterAt(w, p, nx, ny)) land++;
      if (land < 5) continue;
      cands.push({ x, y, sc: Math.min(dmin, 14) + rng.next() * 4 });
    }
    if (!cands.length) { k.state = 'off'; return; }
    cands.sort((a, b) => b.sc - a.sc);
    const at = cands[Math.min(cands.length - 1, rng.int(Math.min(6, cands.length)))];
    const guardians = ['DemonLord'].concat(Veil.muster(game, ['chaos', 'death'], 1400 + 6 * game.turn, 5, 650));
    const s = MapGen.addSite(game, { type: 'breach', plane: p, x: at.x, y: at.y, cleared: false, guardians, budget: 2400, tier: 4 });
    k.state = 'active'; k.site = s.id; k.start = game.turn; k.next = game.turn + 4; k.waves = 0;
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'crisis', { pub: true, plane: s.plane, x: s.x, y: s.y });
    for (const [nx, ny] of World.neighbors(w, s.x, s.y)) if (!World.isWaterAt(w, p, nx, ny) && !Cities.at(game, p, nx, ny)) World.set(w, p, 'corrupt', nx, ny, 1);
    for (const pl of game.players) if (pl.alive) Move.reveal(game, pl, p, s.x, s.y, 2);
    Game.logEach(game, () => 'La Brèche s\'est ouverte sur ' + (p ? 'le Miroir' : 'Arcane') + ' (' + s.x + ', ' + s.y + '). Ce qui en sort ne négocie pas : refermez-la avant qu\'elle ne dévore le monde.', { x: s.x, y: s.y, plane: p, crisis: true });
  },
  wave(game) {
    const k = game.crisis, s = Crisis.site(game); if (!s) return;
    const t = game.turn - k.start;
    // trop de créatures déjà dehors : la Brèche garde ses forces
    if (Object.values(game.units).filter(u => u.crisis && !u.finale).length >= 15) {
      k.next = game.turn + 3;
      if (s.guardians.length < MAX_STACK) { const c = Veil.pool(['chaos', 'death'], 400 + 10 * t, 50); if (c.length) s.guardians.push(game.rng.pick(c).id); }
      return;
    }
    const budget = 300 + 8 * t + 100 * k.waves;
    const types = Veil.muster(game, ['chaos', 'death'], budget, 5, Math.min(800, 200 + 6 * t));
    const made = Veil.spawnHostile(game, types, s.plane, s.x, s.y, { crisis: true, crisisTarget: null });
    k.waves++; k.next = game.turn + Math.max(6, 10 - Math.floor(k.waves / 2));
    if (!made.length) return;
    // la vague vise le plus puissant des sorciers qu'elle peut atteindre
    const w = game.world;
    const ranked = game.players.filter(p => p.alive && !p.banished).sort((a, b) => Crisis.score(game, b) - Crisis.score(game, a));
    let target = null;
    for (const p of ranked) {
      const c = U.min(Cities.ofPlayer(game, p.id).filter(c => c.plane === s.plane), c => World.dist(w, c.x, c.y, made[0].x, made[0].y));
      if (c && Move.findPath(game, made, s.plane, c.x, c.y, { omniscient: true })) { target = p; break; }
    }
    for (const u of made) u.crisisTarget = target ? target.id : null;
    for (const pl of game.players) {
      if (!pl.alive) continue;
      const txt = target && target.id === pl.id ? 'Une vague de la Brèche marche sur vos terres : ' : 'Une vague sort de la Brèche' + (target ? ' et marche sur les terres de ' + Players.nameFor(game, pl.id, target.id) : '') + ' : ';
      Game.log(game, pl.id, txt + U.uniq(made.map(u => DATA.units[u.type].name.toLowerCase())).join(', ') + '.', { x: made[0].x, y: made[0].y, plane: s.plane, crisis: true, minor: !(target && target.id === pl.id) });
    }
  },
  // cible d'une vague : la cité la plus proche du sorcier visé, sinon de n'importe quel sorcier, sur ce plan
  targetCity(game, u0) {
    const w = game.world;
    const near = pid => U.min(Object.values(game.cities).filter(c => c.plane === u0.plane && (pid == null ? c.owner >= 0 : c.owner === pid)), c => World.dist(w, c.x, c.y, u0.x, u0.y));
    return (u0.crisisTarget != null && near(u0.crisisTarget)) || near(null);
  },
  // la Brèche refermée
  async closed(game, site, pid, survivors) {
    const k = game.crisis, pl = game.players[pid];
    if (k) k.state = 'over';
    for (const u of Object.values(game.units)) if (u.crisis && !u.finale) { delete u.crisis; delete u.crisisTarget; }
    const found = [];
    if (pl) {
      pl.gold += 500; found.push('500 pièces d\'or');
      pl.mana += 500; found.push('500 cristaux de mana');
      const it = Items.random(game, 5);
      const h = survivors.find(u => u.hero && Items.canEquip(u, it) && Items.freeSlot(u, it) >= 0);
      if (h) { h.items[Items.freeSlot(h, it)] = it; found.push(it.name + ' (équipé par ' + h.hero.name + ')'); } else { pl.vault.push(it); found.push(it.name + ' (au coffre)'); }
      pl.fame += 10; found.push('+10 de renommée');
      for (const o of game.players) if (o !== pl && o.alive && o.relations) Diplomacy.adjust(game, o.id, pl.id, 20, 'breach');
    }
    Game.logEach(game, v => v === pid ? 'Vous avez refermé la Brèche. Les deux plans respirent ; les autres sorciers vous en savent gré.' : U.cap(Players.nameFor(game, v, pid)) + ' a refermé la Brèche. La Crise est terminée.', { x: site.x, y: site.y, plane: site.plane, crisis: true });
    if (pl) Game.log(game, pid, 'Brèche refermée : ' + found.join(', ') + '.', { x: site.x, y: site.y, plane: site.plane });
    if (Game.hooks.choose && pl && pl.human) await Game.hooks.choose(game, pid, { type: 'treasure', site, found });
    return found;
  },
};
