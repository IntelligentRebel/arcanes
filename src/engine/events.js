'use strict';
// Dilemmes (un choix à deux issues, tous les 8 à 12 tours, conséquences annoncées) et némésis (celui qui abat un héros
// reçoit un nom, se renforce, revient ; l'abattre à son tour est récompensé). Ajouts d'Arcanes.

// « de Merlin », « d'Isvaran », « d'un sorcier inconnu », « des pillards »
function deWho(n) { if (!U.fr()) return n; return /^des /.test(n) ? n : /^(un|une) /.test(n) || /^[AEIOUYÉÈÊÂÎÔÛaeiouyéèêâîôû]/.test(n) ? 'd\'' + n : 'de ' + n; }
const Dilemmas = {
  FIRST: 12,
  // une humeur passagère d'une cité : +v (ou −v) agitation jusqu'au tour until
  mood(game, c, v, turns, why) {
    c.moods = (c.moods || []).filter(m => m.until >= game.turn);
    c.moods.push({ v, until: game.turn + turns - 1, why });
  },
  moodOf(game, c) { let v = 0; for (const m of c.moods || []) if (m.until >= game.turn) v += m.v; return v; },
  raceUnit(race, kind) {
    const d = Object.values(DATA.units).find(d => d.race === race && d.id.endsWith(kind));
    return d ? d.id : null;
  },
  // « de Lanciers », « d'Épéistes »
  de(n) { if (!U.fr()) return n; return (/^[AEIOUYÉÈÊÂÎÔÛaeiouyéèêâîôû]/.test(n) ? 'd\'' : 'de ') + n; },
  cityName(game, id) { const c = game.cities[id]; return c ? c.name : '?'; },
  ownCity(game, pl, id) { const c = game.cities[id]; return c && c.owner === pl.id ? c : null; },
  fame(pl, n) { pl.fame = Math.max(0, (pl.fame || 0) + n); },
  // ce que ces points font gagner sur la recherche en cours : « terminée dans 3 tours au lieu de 5 »
  rpGain(game, pl, spell, rp) {
    const left = Math.max(0, Magic.researchCost(pl, spell) - pl.researchProgress), rate = Magic.effectiveResearch(game, pl, spell);
    const before = rate > 0 ? Math.ceil(left / rate) : null, after = left - rp <= 0 ? 0 : rate > 0 ? Math.ceil((left - rp) / rate) : null;
    if (after === 0) return 'terminée dès ce tour' + (before ? ' (sinon dans ' + U.n(before, 'tour') + ')' : '');
    if (before == null) return 'votre recherche n\'avance pas d\'elle-même';
    return before === after ? 'pas un tour de gagné (terminée dans ' + U.n(after, 'tour') + ' de toute façon)' : 'terminée dans ' + U.n(after, 'tour') + ' au lieu de ' + before;
  },
  // points de recherche versés au sort en cours (sans dépasser son coût)
  research(game, pl, n) {
    if (!pl.researching) return 0;
    const left = Math.max(0, Magic.researchCost(pl, pl.researching) - pl.researchProgress);
    const k = Math.min(n, left); pl.researchProgress += k; return k;
  },
  // les champions possibles pour un duel : les créatures seules dont la force est la plus proche de celle du héros, par force croissante
  champions(game, hero) {
    const s = Math.max(1, Units.strength(game, hero)), str = id => Units.strength(game, { type: id, ench: [], xp: 0, owner: -1, dmg: 0, weapon: 0 });
    return Object.values(DATA.units).filter(d => d.figures === 1 && d.race !== 'hero' && !d.finale && !d.sailing && !d.abilities.siegeOnly && !d.abilities.meld && !d.abilities.nonCorporeal && !d.abilities.createOutpost && !d.abilities.construction && (d.melee || 0) > 0 && !d.flying)
      .map(d => ({ id: d.id, s: str(d.id) })).sort((a, b) => Math.abs(Math.log(Math.max(1, a.s) / s)) - Math.abs(Math.log(Math.max(1, b.s) / s))).slice(0, 14)
      .sort((a, b) => a.s - b.s).map(o => o.id);
  },
  // un défi serré : le plus faible des champions qui tient tête au héros, entamé juste ce qu'il faut (≈ 55 % pour le héros)
  pickChampion(game, h) {
    const list = Dilemmas.champions(game, h); if (!list.length) return null;
    let champ = null;
    for (const id of list) if (Dilemmas.duelOdds(game, h, id, 8, 0) <= 0.6) { champ = id; break; }
    if (!champ) return null;   // plus fort que tous : pas de défi digne de lui
    const max = Units.stats(game, { type: champ, ench: [], xp: 0, owner: -1, dmg: 0, weapon: 0 }).maxHp;
    let lo = 0, hi = max - 1, dmg = 0;
    for (let k = 0; k < 6; k++) {
      const mid = Math.floor((lo + hi) / 2), o = Dilemmas.duelOdds(game, h, champ, 12, mid);
      if (o < 0.5) lo = mid + 1; else { hi = mid; dmg = mid; }
      if (lo >= hi) { dmg = lo; break; }
    }
    return { champ, dmg };
  },
  // duel simulé n fois (copies, générateur à part) : part de victoires du héros
  duelOdds(game, hero, champ, n, dmg) {
    const rng = new RNG((hero.id * 7919 + game.turn * 31 + (dmg || 0) * 17) >>> 0);
    let won = 0;
    for (let i = 0; i < n; i++) if (Dilemmas.duelOnce(game, hero, champ, rng, dmg).won) won++;
    return won / n;
  },
  duelOnce(game, hero, champ, rng, dmg) {
    game.simId = game.simId || 0;
    const h = Object.assign(JSON.parse(JSON.stringify(hero)), { id: -(++game.simId) });
    const c = Units.create(game, champ, -1, hero.plane, hero.x, hero.y); delete game.units[c.id]; c.dmg = dmg || 0;
    const bt = new Battle(game, { attackers: [h], defenders: [c], attackerPid: hero.owner, defenderPid: -1, plane: hero.plane, x: hero.x, y: hero.y, sim: true, rng, tac: [3, 1] });
    CombatAI.autoResolve(bt);
    for (const b of bt.units) if (b.temp) delete game.units[b.u.id];
    return { won: bt.winner === ATT_SIDE, dmg: h.dmg };
  },
  // ---------- les dilemmes ----------
  // when : les données du dilemme (ou null s'il ne s'applique pas) ; text : la situation ; opts : les deux issues ; ai : le choix d'une IA
  DEFS: {
    refugees: {
      title: 'Des réfugiés',
      when(game, pl) {
        const cs = Cities.ofPlayer(game, pl.id).filter(c => Cities.citizens(c) + 2 <= Cities.econ(game, c).maxPop && Dilemmas.raceUnit(c.race, 'Spearmen'));
        if (!cs.length) return null;
        const c = game.rng.pick(cs);
        return { city: c.id, unit: Dilemmas.raceUnit(c.race, 'Spearmen') };
      },
      text: (game, pl, d) => 'Une colonne de réfugiés, chassés par les monstres, se présente aux portes de ' + Dilemmas.cityName(game, d.city) + '.',
      opts(game, pl, d) {
        const c = Dilemmas.ownCity(game, pl, d.city), nm = Dilemmas.cityName(game, d.city), un = DATA.units[d.unit].name;
        return [
          { label: 'Les accueillir', text: '+2 000 habitants à ' + nm + ' ; +1 agitation à ' + nm + ' pendant 10 tours.', apply() { if (!c) return; c.pop += 2000; Dilemmas.mood(game, c, 1, 10, 'réfugiés'); } },
          { label: 'Les enrôler', text: 'Une unité ' + Dilemmas.de(un) + ' gratuite à ' + nm + ' ; −2 renommée.', apply() { if (!c) return; const at = Spells.spotNear(game, pl, c, d.unit); if (at) Units.create(game, d.unit, pl.id, at[0], at[1], at[2]); Dilemmas.fame(pl, -2); } },
        ];
      },
      ai: (game, pl) => game.players.some(o => o.alive && pl.diplo[o.id] === 'war') ? 1 : 0,
    },
    merchant: {
      title: 'Le marchand de reliques',
      when(game, pl) {
        if (!Object.values(game.units).some(u => u.owner === pl.id && u.hero)) return null;
        const it = Items.random(game, game.turn < 60 ? 1 : 2), price = Math.max(50, Math.round(it.value * 0.85 / 10) * 10);
        if (pl.gold < price * 0.6) return null;
        return { item: it, price };
      },
      text: (game, pl, d) => 'Un marchand ambulant déballe sous votre tour un objet magique : <b>' + U.esc(d.item.name) + '</b> (' + U.esc(Items.describe(d.item)) + ').',
      opts(game, pl, d) {
        return [
          { label: 'Acheter (' + d.price + ' or)', text: 'L\'objet rejoint votre coffre ; −' + d.price + ' or.', can: pl.gold >= d.price, why: 'Pas assez d\'or.', apply() { pl.gold -= d.price; (pl.vault = pl.vault || []).push(d.item); } },
          { label: 'Le congédier', text: 'Rien ne change.', apply() {} },
        ];
      },
      ai: (game, pl, d) => pl.gold >= d.price * 2 ? 0 : 1,
    },
    harvest: {
      title: 'La fête des moissons',
      when(game, pl) {
        const cs = Cities.ofPlayer(game, pl.id).filter(c => Cities.citizens(c) >= 4 && Cities.econ(game, c).foodSurplus >= 3);
        if (!cs.length) return null;
        const c = game.rng.pick(cs);
        return { city: c.id, gold: 20 + Cities.citizens(c) * 5 };
      },
      text: (game, pl, d) => 'Les greniers de ' + Dilemmas.cityName(game, d.city) + ' débordent. Les notables proposent une fête ; vos intendants, un impôt.',
      opts(game, pl, d) {
        const c = Dilemmas.ownCity(game, pl, d.city), nm = Dilemmas.cityName(game, d.city);
        return [
          { label: 'Célébrer', text: '−' + d.gold + ' or ; −1 agitation à ' + nm + ' pendant 15 tours.', can: pl.gold >= d.gold, why: 'Pas assez d\'or.', apply() { pl.gold -= d.gold; if (c) Dilemmas.mood(game, c, -1, 15, 'fête des moissons'); } },
          { label: 'Taxer les greniers', text: '+' + d.gold + ' or ; +1 agitation à ' + nm + ' pendant 10 tours.', apply() { pl.gold += d.gold; if (c) Dilemmas.mood(game, c, 1, 10, 'impôt sur les grains'); } },
        ];
      },
      ai(game, pl, d) { const c = game.cities[d.city]; return c && Cities.econ(game, c).unrest > 0 && pl.gold >= d.gold * 2 ? 0 : 1; },
    },
    sage: {
      title: 'Le mage errant',
      when(game, pl) {
        if (!pl.researching || pl.researching === 'spell_of_mastery') return null;
        const left = Magic.researchCost(pl, pl.researching) - pl.researchProgress;
        const rp = Math.min(left, Math.round(40 + game.turn * 1.5));
        if (rp < 20) return null;
        return { rp, gold: Math.round(rp * 1.2 / 5) * 5, spell: pl.researching };
      },
      text: (game, pl, d) => 'Un vieux mage frappe à la porte de votre tour. Il connaît des secrets utiles à vos recherches sur ' + DATA.spells[d.spell].name + ', et ne les donne pas.',
      opts(game, pl, d) {
        return [
          { label: 'Acheter son savoir', text: '−' + d.gold + ' or ; +' + d.rp + ' points de recherche sur ' + DATA.spells[d.spell].name + ' : ' + Dilemmas.rpGain(game, pl, d.spell, d.rp) + '.', can: pl.gold >= d.gold, why: 'Pas assez d\'or.', apply() { pl.gold -= d.gold; if (pl.researching === d.spell) Dilemmas.research(game, pl, d.rp); } },
          { label: 'Lui offrir l\'hospitalité', text: '+2 renommée : il racontera partout votre courtoisie.', apply() { Dilemmas.fame(pl, 2); } },
        ];
      },
      ai: (game, pl, d) => pl.gold >= d.gold * 2 ? 0 : 1,
    },
    deserters: {
      title: 'Des déserteurs',
      when(game, pl) {
        const foes = game.players.filter(o => o.alive && o.id !== pl.id && pl.diplo[o.id] === 'war' && o.race && Dilemmas.raceUnit(o.race, 'Swordsmen'));
        if (!foes.length || !game.cities[pl.fortress]) return null;
        const o = game.rng.pick(foes);
        return { foe: o.id, unit: Dilemmas.raceUnit(o.race, 'Swordsmen') };
      },
      text: (game, pl, d) => 'Des soldats ' + deWho(Players.nameFor(game, pl.id, d.foe)) + ' ont déserté et demandent asile.',
      opts(game, pl, d) {
        const foe = Players.nameFor(game, pl.id, d.foe), un = Units.typeLabel(d.unit);
        return [
          { label: 'Les engager', text: 'Une unité ' + Dilemmas.de(un) + ' à votre forteresse ; ' + foe + ' vous en voudra (−10).', apply() { const c = game.cities[pl.fortress]; const at = c && Spells.spotNear(game, pl, c, d.unit); if (at) { const u = Units.create(game, d.unit, pl.id, at[0], at[1], at[2]); u.moves = 0; } Diplomacy.adjust(game, d.foe, pl.id, -10, 'deserters'); } },
          { label: 'Les lui renvoyer', text: foe + ' apprécie le geste (+10).', apply() { Diplomacy.adjust(game, d.foe, pl.id, 10, 'deserters'); } },
        ];
      },
      ai: (game, pl, d) => (game.players[d.foe].relations[pl.id] || 0) < -20 ? 0 : 1,
    },
    mine: {
      title: 'La mine abandonnée',
      when(game, pl) {
        const out = [];
        for (const c of Cities.ofPlayer(game, pl.id)) for (const [x, y] of World.catchment(game.world, c.x, c.y)) {
          if ([T.HILLS, T.MOUNTAIN].includes(World.terr(game.world, c.plane, x, y)) && !World.get(game.world, c.plane, 'mineral', x, y) && !(x === c.x && y === c.y)) out.push({ city: c.id, x, y });
        }
        if (!out.length) return null;
        return Object.assign(game.rng.pick(out), { gold: 60 });
      },
      text: (game, pl, d) => 'Des bergers ont retrouvé, dans les collines de ' + Dilemmas.cityName(game, d.city) + ', l\'entrée d\'une mine oubliée.',
      opts(game, pl, d) {
        return [
          { label: 'La rouvrir (' + d.gold + ' or)', text: '−' + d.gold + ' or ; un gisement (fer, charbon ou argent) près de ' + Dilemmas.cityName(game, d.city) + '.', can: pl.gold >= d.gold, why: 'Pas assez d\'or.', apply() {
            pl.gold -= d.gold; const c = game.cities[d.city]; if (!c) return;
            if (!World.get(game.world, c.plane, 'mineral', d.x, d.y)) World.set(game.world, c.plane, 'mineral', d.x, d.y, game.rng.pick([M.iron, M.coal, M.silver]));
          } },
          { label: 'L\'oublier', text: 'Rien ne change.', apply() {} },
        ];
      },
      ai: (game, pl, d) => pl.gold >= d.gold * 2 ? 0 : 1,
    },
    tournament: {
      title: 'Le tournoi',
      when(game, pl) {
        const cs = Cities.ofPlayer(game, pl.id).filter(c => Units.at(game, c.plane, c.x, c.y).filter(u => u.owner === pl.id && Units.isNormal(u) && !u.hero).length >= 2);
        if (!cs.length) return null;
        const c = U.max(cs, c => Units.at(game, c.plane, c.x, c.y).filter(u => u.owner === pl.id && Units.isNormal(u)).length);
        return { city: c.id, gold: 40 };
      },
      text: (game, pl, d) => 'Vos capitaines de ' + Dilemmas.cityName(game, d.city) + ' réclament un tournoi : rien de tel pour aguerrir la troupe.',
      opts(game, pl, d) {
        const nm = Dilemmas.cityName(game, d.city);
        return [
          { label: 'Organiser le tournoi', text: '−' + d.gold + ' or ; +20 XP à chaque unité normale de ' + nm + ' ; +1 renommée.', can: pl.gold >= d.gold, why: 'Pas assez d\'or.', apply() {
            pl.gold -= d.gold; Dilemmas.fame(pl, 1); const c = game.cities[d.city]; if (!c) return;
            for (const u of Units.at(game, c.plane, c.x, c.y)) if (u.owner === pl.id && Units.isNormal(u)) Units.addXp(game, u, 20);
          } },
          { label: 'Pas cette année', text: 'Rien ne change.', apply() {} },
        ];
      },
      ai: (game, pl, d) => pl.gold >= d.gold * 3 ? 0 : 1,
    },
    plague: {
      title: 'La fièvre',
      when(game, pl) {
        const cs = Cities.ofPlayer(game, pl.id).filter(c => Cities.citizens(c) >= 6);
        if (!cs.length) return null;
        const c = game.rng.pick(cs);
        return { city: c.id, gold: 30 + Cities.citizens(c) * 5 };
      },
      text: (game, pl, d) => 'Une fièvre se répand dans les bas quartiers de ' + Dilemmas.cityName(game, d.city) + '.',
      opts(game, pl, d) {
        const c = Dilemmas.ownCity(game, pl, d.city), nm = Dilemmas.cityName(game, d.city);
        return [
          { label: 'Payer les guérisseurs', text: '−' + d.gold + ' or ; la fièvre s\'éteint.', can: pl.gold >= d.gold, why: 'Pas assez d\'or.', apply() { pl.gold -= d.gold; } },
          { label: 'Laisser faire', text: '−2 000 habitants à ' + nm + ' ; +1 agitation pendant 5 tours.', apply() { if (!c) return; c.pop = Math.max(1000, c.pop - 2000); Dilemmas.mood(game, c, 1, 5, 'fièvre'); if (c.autoFarmers) Cities.resetFarmers(game, c); } },
        ];
      },
      ai: (game, pl, d) => pl.gold >= d.gold * 1.5 ? 0 : 1,
    },
    duel: {
      title: 'Le défi',
      when(game, pl) {
        const heroes = Object.values(game.units).filter(u => u.owner === pl.id && u.hero && !u.avatar && Units.health(game, u) >= Units.stats(game, u).maxHp * 0.8);
        if (!heroes.length) return null;
        const h = game.rng.pick(heroes);
        // un défi qui vaille la peine : le champion dont les chances sont les plus proches d'un combat serré
        const best = Dilemmas.pickChampion(game, h); if (!best) return null;
        const odds = Dilemmas.duelOdds(game, h, best.champ, 60, best.dmg);
        if (odds < 0.25 || odds > 0.85) return null;   // un duel joué d'avance n'est pas un dilemme
        return { hero: h.id, champ: best.champ, dmg: best.dmg, odds, xp: 60 };
      },
      text: (game, pl, d) => { const h = game.units[d.hero]; return 'Un champion errant, ' + DATA.units[d.champ].name + ', défie ' + (h ? U.esc(h.hero.name) : 'votre héros') + ' en combat singulier.'; },
      opts(game, pl, d) {
        const h = game.units[d.hero], hn = h ? h.hero.name : 'votre héros';
        return [
          { label: 'Relever le défi', text: 'Chances de vaincre ' + Game.chanceWord(d.odds) + '. Victoire : +' + d.xp + ' XP, +3 renommée. Défaite : ' + hn + ' est blessé (la moitié de ses PV), sans en mourir.', can: !!(h && h.owner === pl.id), why: 'Le héros n\'est plus là.', apply() {
            if (!h || !game.units[h.id]) return;
            const r = Dilemmas.duelOnce(game, h, d.champ, new RNG(game.rng.int(1e9)), d.dmg || 0);
            if (r.won) { Units.addXp(game, h, d.xp); Dilemmas.fame(pl, 3); Game.log(game, pl.id, hn + ' terrasse son adversaire : +' + d.xp + ' XP, +3 renommée.', { unit: h.id }); }
            else { h.dmg = Math.max(h.dmg, Math.floor(Units.stats(game, h).maxHp / 2)); Game.log(game, pl.id, hn + ' perd le duel et rentre blessé.', { unit: h.id }); }
          } },
          { label: 'Décliner', text: '−1 renommée.', apply() { Dilemmas.fame(pl, -1); } },
        ];
      },
      ai: (game, pl, d) => d.odds >= 0.6 ? 0 : 1,
    },
    toll: {
      title: 'La caravane',
      when(game, pl) {
        const os = game.players.filter(o => o.alive && o.id !== pl.id && pl.contact[o.id] && pl.diplo[o.id] !== 'war');
        if (!os.length) return null;
        return { other: game.rng.pick(os).id, gold: Math.round((30 + game.turn / 2) / 5) * 5 };
      },
      text: (game, pl, d) => 'Une riche caravane ' + deWho(Players.nameFor(game, pl.id, d.other)) + ' traverse vos terres.',
      opts(game, pl, d) {
        const o = Players.nameFor(game, pl.id, d.other);
        return [
          { label: 'Lever un péage', text: '+' + d.gold + ' or ; ' + o + ' vous en voudra (−8).', apply() { pl.gold += d.gold; Diplomacy.adjust(game, d.other, pl.id, -8, 'toll'); } },
          { label: 'L\'escorter', text: o + ' apprécie (+6).', apply() { Diplomacy.adjust(game, d.other, pl.id, 6, 'escort'); } },
        ];
      },
      ai: (game, pl, d) => (pl.relations[d.other] || 0) < -10 || pl.gold < 30 ? 0 : 1,
    },
    library: {
      title: 'La bibliothèque en ruine',
      when(game, pl) {
        if (game.turn < 20 || !pl.researching || pl.researching === 'spell_of_mastery') return null;
        const rp = Math.round(30 + game.turn), left = Magic.researchCost(pl, pl.researching) - pl.researchProgress;
        if (left < 20) return null;
        return { rp: Math.min(rp, left), gold: 50, sell: Math.round(rp * 0.8 / 5) * 5, spell: pl.researching };
      },
      text: (game, pl) => 'Vos éclaireurs ont découvert les restes d\'une bibliothèque, ses grimoires à moitié moisis.',
      opts(game, pl, d) {
        return [
          { label: 'La restaurer', text: '−' + d.gold + ' or ; +' + d.rp + ' points de recherche sur ' + DATA.spells[d.spell].name + ' : ' + Dilemmas.rpGain(game, pl, d.spell, d.rp) + '.', can: pl.gold >= d.gold, why: 'Pas assez d\'or.', apply() { pl.gold -= d.gold; if (pl.researching === d.spell) Dilemmas.research(game, pl, d.rp); } },
          { label: 'Vendre les grimoires', text: '+' + d.sell + ' or ; −1 renommée.', apply() { pl.gold += d.sell; Dilemmas.fame(pl, -1); } },
        ];
      },
      ai: (game, pl, d) => pl.gold >= d.gold * 2 ? 0 : 1,
    },
  },
  // ---------- déroulement ----------
  tick(game) {
    for (const pl of game.players) {
      if (!pl.alive || pl.banished) continue;
      if (pl.dilemma && pl.dilemma.turn < game.turn - 1) pl.dilemma = null;   // resté sans réponse (partie reprise ailleurs) : il passe
      if (pl.dilemma) continue;
      if (pl.nextDilemma == null) pl.nextDilemma = Dilemmas.FIRST + game.rng.int(6);
      if (game.turn < pl.nextDilemma) continue;
      const recent = pl.dilemmaSeen || [];
      const ids = game.rng.shuffle(Object.keys(Dilemmas.DEFS).filter(k => !recent.includes(k)));
      for (const id of ids) {
        let data = null;
        try { data = Dilemmas.DEFS[id].when(game, pl); } catch (e) { console.error('dilemme', id, e); }
        if (!data) continue;
        pl.dilemma = { id, data, turn: game.turn };
        pl.dilemmaSeen = recent.concat(id).slice(-4);
        break;
      }
      pl.nextDilemma = game.turn + 8 + game.rng.int(5);
      if (pl.dilemma && !pl.human) Dilemmas.resolve(game, pl, Dilemmas.aiChoice(game, pl));
    }
  },
  def(pl) { return pl.dilemma && Dilemmas.DEFS[pl.dilemma.id]; },
  title(game, pl) { const D = Dilemmas.def(pl); return D ? D.title : ''; },
  text(game, pl) { const D = Dilemmas.def(pl); return D ? D.text(game, pl, pl.dilemma.data) : ''; },
  options(game, pl) {
    const D = Dilemmas.def(pl); if (!D) return [];
    return D.opts(game, pl, pl.dilemma.data).map(o => Object.assign({ can: true }, o, { can: o.can !== false }));
  },
  aiChoice(game, pl) {
    const D = Dilemmas.def(pl), opts = Dilemmas.options(game, pl);
    let i = 0; try { i = D.ai(game, pl, pl.dilemma.data); } catch (e) { i = 0; }
    if (!opts[i] || !opts[i].can) i = opts.findIndex(o => o.can);
    return Math.max(0, i);
  },
  resolve(game, pl, i) {
    const opts = Dilemmas.options(game, pl), o = opts[i];
    if (!o || !o.can) return false;
    const title = Dilemmas.title(game, pl);
    pl.dilemma = null;
    Game.log(game, pl.id, title + ' : ' + o.label.replace(/ \(.*\)$/, '').toLowerCase() + '.' + (o.text.length < 90 ? ' ' + o.text : ''), { minor: !pl.human });
    o.apply();
    return true;
  },
};

// ---------- némésis ----------
const Nemesis = {
  A: ['Gor', 'Mor', 'Vra', 'Kel', 'Thra', 'Zul', 'Ska', 'Dra', 'Ur', 'Bal', 'Nyx', 'Gri', 'Ash', 'Ruk', 'Vel', 'Kra', 'Sar', 'Oth'],
  B: ['gath', 'mok', 'zar', 'neth', 'kul', 'rax', 'thor', 'vek', 'dun', 'ghul', 'mir', 'sha', 'goth', 'rik', 'vane', 'drak'],
  name(game) { const r = game.rng; return r.pick(Nemesis.A) + r.pick(Nemesis.B); },
  MAX: 3,
  label(u) { return u.nemesis ? u.nemesis.name : ''; },
  title(u) { const n = u.nemesis; return n ? n.name + ', fléau de ' + n.victims.join(' et de ') : ''; },
  // bonus : +niveau en attaque, tir, défense et résistance
  apply(u, s) {
    const L = u.nemesis && u.nemesis.lvl; if (!L) return;
    if (s.melee > 0) s.melee += L; if (s.ranged > 0) s.ranged += L; if (s.breath > 0) s.breath += L;
    s.def += L; s.res += L;
  },
  // un héros tombé : son tueur reçoit un nom (ou monte d'un rang s'il en a déjà un)
  mark(game, killer, victim, foePid) {
    const vname = victim.hero ? victim.hero.name : Units.label(victim);
    const fresh = !killer.nemesis;
    if (fresh) killer.nemesis = { name: Nemesis.name(game), victims: [], lvl: 0, foe: foePid, foes: [], turn: game.turn };
    const n = killer.nemesis; n.foes = n.foes || [n.foe];
    n.victims.push(vname); n.lvl = Math.min(Nemesis.MAX, n.lvl + 1); n.turn = game.turn;
    // il traque le dernier qu'il a blessé ; tous ceux qui ont perdu un héros peuvent le venger
    if (game.players[foePid]) { n.foe = foePid; if (!n.foes.includes(foePid)) n.foes.push(foePid); }
    const what = DATA.units[killer.type].name + (killer.owner >= 0 && game.players[killer.owner] ? ', ' + Players.nameFor(game, foePid, killer.owner) : '');
    if (game.players[foePid]) Game.log(game, foePid, fresh
      ? vname + ' est tombé. Son meurtrier a désormais un nom : ' + n.name + ' (' + what + '). Il ne l\'oubliera pas, vous non plus.'
      : n.name + ' (' + what + ') a encore frappé : ' + vname + ' est tombé. Il gagne en puissance (rang ' + n.lvl + ').', { x: killer.x, y: killer.y, plane: killer.plane, alert: true });   // le lieu du combat, pas l'unité (qu'on ne suivrait pas sous le brouillard)
    if (killer.owner >= 0 && game.players[killer.owner] && killer.owner !== foePid) Game.log(game, killer.owner, U.cap(Units.label(killer)) + ' a abattu ' + vname + ' : ' + (fresh ? 'on l\'appelle désormais ' + n.name + '.' : 'son renom grandit (rang ' + n.lvl + ').'), { unit: killer.id, minor: true });
  },
  // fin de combat : héros tombés, némésis abattues
  afterBattle(game, battle, info) {
    const reward = [];
    for (const d of battle.dead) {
      if (d.temp) continue;
      const k = d.lastHitBy;
      const dPid = battle.owner(d.possessed && d.origSide != null ? d.origSide : d.side);
      if (d.u.hero && k && !k.temp && !k.dead && k.side !== d.side && dPid >= 0 && !(battle.winner === d.side && battle.stats(d).ab.regeneration)) Nemesis.mark(game, k.u, d.u, dPid);
      if (d.u.nemesis && !(battle.winner === d.side && battle.stats(d).ab.regeneration)) reward.push(d);
    }
    for (const d of reward) {
      const n = d.u.nemesis, side = 1 - d.side, pid = battle.owner(side), pl = game.players[pid];
      if (!pl) continue;
      const foes = n.foes || [n.foe];
      for (const f of foes) if (f !== pid && game.players[f] && game.players[f].alive) Game.log(game, f, n.name + ' est tombé, abattu par ' + Players.nameFor(game, f, pid) + '. Vos morts restent sans vengeance.', { minor: true });
      if (!foes.includes(pid)) continue;
      const gold = 60 * n.lvl, fame = 2 + n.lvl, xp = 15 * n.lvl;
      pl.gold += gold; Dilemmas.fame(pl, fame);
      const surv = battle.units.filter(b => b.side === side && !b.dead && !b.temp && game.units[b.u.id]);
      for (const b of surv) Units.addXp(game, b.u, xp);
      Game.log(game, pid, 'Vengeance ! ' + Nemesis.title(d.u) + ', est tombé. +' + gold + ' or, +' + fame + ' renommée, +' + xp + ' XP pour votre armée.', { alert: !!pl.human });
      (pl.avenged = pl.avenged || []).push({ name: n.name, turn: game.turn });
    }
  },
  // repaires : la némésis survit d'un combat à l'autre avec le type du gardien
  saveAtSite(site, alive) {
    const g = alive.find(g => g.nemesis);
    if (g) site.nemesis = { type: g.type, data: g.nemesis }; else delete site.nemesis;
  },
  restoreAtSite(site, guardians) {
    if (!site.nemesis) return;
    const g = guardians.find(g => g.type === site.nemesis.type && !g.nemesis);
    if (g) g.nemesis = site.nemesis.data; else delete site.nemesis;
  },
  // une némésis tapie dans un repaire en sort parfois pour traquer son ennemi
  tick(game) {
    if (game.turn < 10) return;
    for (const s of game.sites) {
      const n = s.nemesis; if (!n || s.cleared || !(s.guardians || []).includes(n.type) || s.guardians.length < 2) continue;   // le dernier gardien ne laisse pas son trésor
      const foe = game.players[n.data.foe];
      if (!foe || !foe.alive || game.turn - n.data.turn < 8 || !game.rng.chance(0.05)) continue;
      const free = World.neighbors(game.world, s.x, s.y).filter(([x, y]) => !World.isWaterAt(game.world, s.plane, x, y) && !Units.at(game, s.plane, x, y).length && !Cities.at(game, s.plane, x, y) && World.get(game.world, s.plane, 'site', x, y) < 0 && !Move.blockedMountain(game, s.plane, x, y));
      if (!free.length) continue;
      const i = s.guardians.lastIndexOf(n.type);
      const und = s.guardianUndead && s.guardianUndead[i];
      s.guardians.splice(i, 1); if (s.guardianUndead) s.guardianUndead.splice(i, 1);
      const [x, y] = game.rng.pick(free);
      const u = Units.create(game, n.type, -1, s.plane, x, y, und ? { undead: true } : null);
      u.rampage = true; u.nemesis = n.data; u.hunt = n.data.foe;
      delete s.nemesis;
      Game.log(game, foe.id, n.data.name + ' a quitté son repaire. Il vous cherche.', { unit: u.id, x, y, plane: s.plane, alert: true });
    }
  },
  // cible d'une némésis en chasse : la cité ou l'armée de son ennemi qu'elle peut vaincre, sinon elle s'en approche
  huntTarget(game, units) {
    const u0 = units[0], foe = game.players[u0.hunt];
    if (!foe || !foe.alive) { for (const u of units) delete u.hunt; return null; }
    const power = U.sum(units, u => Units.strength(game, u));
    let best = null, bd = Infinity, near = null, nd = Infinity;
    for (const c of Cities.ofPlayer(game, foe.id)) {
      if (c.plane !== u0.plane) continue;
      const d = World.dist(game.world, c.x, c.y, u0.x, u0.y);
      if (d < nd) { nd = d; near = c; }
      const def = U.sum(Units.at(game, c.plane, c.x, c.y), u => Units.strength(game, u)) * (c.buildings.cityWalls ? 1.5 : 1) + Battle.towerStrength(game, c) + 10;
      if (d <= 20 && def * 1.3 < power && d < bd) { bd = d; best = { x: c.x, y: c.y }; }
    }
    const stacks = U.groupBy(Object.values(game.units).filter(u => u.owner === foe.id && u.plane === u0.plane && !Cities.at(game, u.plane, u.x, u.y)), u => u.x + ',' + u.y);
    for (const k in stacks) {
      const st = stacks[k], d = World.dist(game.world, st[0].x, st[0].y, u0.x, u0.y);
      if (d <= 12 && U.sum(st, u => Units.strength(game, u)) * 1.3 < power && d < bd) { bd = d; best = { x: st[0].x, y: st[0].y }; }
    }
    if (best) return Object.assign(best, { attack: true });
    if (near && nd > 4) return { x: near.x, y: near.y, attack: false };
    return null;
  },
};

// ---------- fin de partie : la course à la Maîtrise ----------
// Qui étudie le Sort de Maîtrise, qui le lance, dans combien de tours : tout le monde le sait. Celui qui le lance
// s'attire la guerre de tous les sorciers (sans opprobre pour qui rompt un traité avec lui).
const Endgame = {
  casting(game, pid) { const p = game.players[pid]; return !!(p && p.alive && !p.banished && p.casting && p.casting.id === 'spell_of_mastery'); },
  researching(game, pid) { const p = game.players[pid]; return !!(p && p.alive && !p.banished && p.researching === 'spell_of_mastery'); },
  // l'état de la course : une ligne par sorcier engagé (étude ou lancement), le plus avancé d'abord
  race(game) {
    const out = [];
    for (const p of game.players) {
      if (!p.alive || p.banished) continue;
      if (Endgame.casting(game, p.id)) {
        const c = p.casting;
        out.push({ pid: p.id, phase: 'cast', pct: c.progress / Math.max(1, c.cost), turns: Spells.castingTurns(game, p) });
      } else if (Endgame.researching(game, p.id) || p.known.includes('spell_of_mastery')) {
        const known = p.known.includes('spell_of_mastery');
        const cost = Magic.researchCost(p, 'spell_of_mastery'), rp = Math.max(1, Magic.effectiveResearch(game, p, 'spell_of_mastery'));
        out.push({ pid: p.id, phase: known ? 'known' : 'research', pct: known ? 1 : p.researchProgress / Math.max(1, cost), turns: known ? 0 : Math.ceil(Math.max(0, cost - p.researchProgress) / rp) });
      }
    }
    return out.sort((a, b) => (b.phase === 'cast') - (a.phase === 'cast') || b.pct - a.pct);
  },
  tick(game) {
    for (const p of game.players) {
      if (!p.alive || p.banished) continue;
      p.somNews = p.somNews || {};
      if (Endgame.researching(game, p.id) && !p.somNews.research) {
        p.somNews.research = game.turn;
        if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'mastery_study', { a: p.id, pub: true });
        Game.logEach(game, v => v === p.id ? 'Vos recherches sur le Sort de Maîtrise sont désormais connues de tous.' : U.cap(Players.nameFor(game, v, p.id)) + ' étudie le Sort de Maîtrise.', { alert: true });
      }
      if (Endgame.casting(game, p.id) && (p.casting.since == null || p.somNews.cast !== p.casting.since)) {
        if (p.casting.since == null) p.casting.since = game.turn;
        p.somNews.cast = p.casting.since;
        const n = Spells.castingTurns(game, p);
        if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'mastery_cast', { a: p.id, pub: true });
        Game.logEach(game, v => v === p.id ? 'Vous commencez à lancer le Sort de Maîtrise : tous les sorciers se dressent contre vous.' : U.cap(Players.nameFor(game, v, p.id)) + ' commence à lancer le Sort de Maîtrise ! Il sera accompli dans ' + U.n(n, 'tour') + ' environ, à moins de prendre sa forteresse.', { alert: true });
        for (const o of game.players) {
          if (!o.alive || o.id === p.id || o.human) continue;
          if (o.diplo[p.id] !== 'war') { Diplomacy.setState(game, o.id, p.id, 'war'); Diplomacy.adjust(game, o.id, p.id, -30, 'mastery'); Game.log(game, p.id, o.name + ' vous déclare la guerre pour vous arrêter.', { diplo: o.id, alert: true }); }
        }
      }
    }
  },
};
if (typeof Diplomacy !== 'undefined' && Diplomacy.WHY) Diplomacy.WHY.mastery = 'Vous lancez le Sort de Maîtrise';

// ---------- Hardcore : le pacte contre le sorcier qui écrase la partie, et le Démon légendaire ----------
// Quand un sorcier pèse 1,25 fois le deuxième (et 1,6 fois la moyenne des autres), ceux qui ne sont pas ses alliés scellent un pacte.
// (v0.29.13, nuits 5 et 6 : le meneur du tour 100 finit premier dans 52 % des parties au lieu de 63 % sans pacte ; l'ancien réglage
// 1,4 / 1,8 / 900 le freinait deux fois moins ; un pacte plus prompt encore, 1,15 / 1,4 / 500, ne le freinait plus du tout)
// Le rituel avance chaque tour de la somme de leurs compétences de lancement ; le mana se paie au prorata de leur puissance magique
// (les IA complètent avec l'or qui dort). Achevé, il invoque le Démon légendaire chez le plus fort des membres. Le démon ne combat
// que la cible ; il retourne aux abîmes quand le pacte se dissout : la cible est tombée sous le plus fort des membres (démon non
// compté), elle est vaincue, ou le maître fait la paix avec elle. Un pacte dissous ou un démon abattu : trente tours de répit.
if (typeof DATA !== 'undefined' && DATA.units && DATA.units.DemonLord && !DATA.units.RiteDemon) {
  const base = JSON.parse(JSON.stringify(DATA.units.DemonLord));
  DATA.units.RiteDemon = Object.assign(base, { id: 'RiteDemon', en: 'Legendary Demon', name: 'Démon légendaire', melee: 38, ranged: 20, def: 16, res: 12, hp: 130, move: 3,
    cost: 0, castCost: 0, upkeep: { gold: 0, food: 0, mana: 0 }, rite: true,
    desc: 'Né d\'un pacte contre le sorcier qui domine la partie. Ne combat que lui, et retourne aux abîmes quand le pacte se dissout.' });
}
const Rite = {
  COST: 600, COOLDOWN: 30, MIN_TURN: 40,
  // abattre le Démon légendaire : du renom et l'essence du démon en mana (de quoi marquer le coup, pas de quoi s'envoler)
  SLAIN_FAME: 10, SLAIN_MANA: 250,
  on(game) { return game.difficulty === 'hardcore' && !(game.opts && game.opts.noRite) && !(typeof AI !== 'undefined' && AI.EXP && AI.EXP.no_rite); },
  active(game) { const r = game.rite; return r && (r.phase === 'ritual' || r.phase === 'demon') ? r : null; },
  // réglages : ceux du jeu, sauf essai du banc (game.opts.rite)
  cfg(game, k) { const o = game.opts && game.opts.rite; return o && o[k] != null ? o[k] : { lead: 1.25, avg: 1.6, cost: Rite.COST, minTurn: Rite.MIN_TURN, coalition: true, escort: 0, muster: 3, retinue: 4, retinueUnit: 'DeathKnights', summons: 2 }[k]; },
  // (0.31.27) le démon arrive avec son cortège de 4 Chevaliers de la mort, et invoque ses démons mineurs deux fois par combat (summons)
  // (0.31.26, à l'essai au banc) retinue : le rituel invoque aussi un cortège de N volants rapides (des Chevaliers de la mort), sans entretien,
  // qui marchent avec le démon et disparaissent avec lui à la fin du pacte
  // (0.31.23, à l'essai au banc) escort : le maître du démon lui forme une escorte ; 3 = des volants aussi rapides que lui (3 cases),
  // 2 = faute de ceux-là, les meilleures troupes à 2 cases ; 0 = le démon marche seul. muster : les tours où il attend son escorte
  // après l'invocation (0 : il part aussitôt, l'escorte le rattrape)
  // le poids d'un sorcier pour le pacte : cités, puissance, sorts, renommée, armée (le démon n'y compte pas)
  standing(game, p) {
    if (!p || !p.alive) return 0;
    let army = 0; for (const u of Object.values(game.units)) if (u.owner === p.id && !u.riteDemon) army += Units.strength(game, u);
    return Cities.ofPlayer(game, p.id).length * 40 + Magic.power(game, p) * 3 + p.known.length * 4 + Players.fame(game, p) * 2 + army / 10;
  },
  // v0.31.2 : seule la coalition invoque le Démon. La cible est celui en qui au moins deux IA voient le sorcier qui domine
  // la partie (chacune d'après ce qu'elle en sait, aux seuils du pacte) ; ces IA, et le joueur s'il le décide, sont le pacte.
  // (cfg coalition: false, au banc : l'ancien pacte, ouvert à tous ceux qui connaissent le meneur désigné par les vrais chiffres)
  leader(game) {
    if (game.turn <= Rite.cfg(game, 'minTurn')) return null;
    const al = game.players.filter(p => p.alive && !p.banished); if (al.length < 3) return null;
    if (Rite.cfg(game, 'coalition')) {
      const c = al.map(p => ({ p, n: Rite.coalitionOf(game, p.id).length, v: Rite.standing(game, p) })).filter(x => x.n >= 2).sort((a, b) => b.n - a.n || b.v - a.v);
      return c.length ? c[0].p : null;
    }
    const s = al.map(p => ({ p, v: Rite.standing(game, p) })).sort((a, b) => b.v - a.v);
    const rest = s.slice(1), avg = U.sum(rest, x => x.v) / rest.length;
    return s[0].v > s[1].v * Rite.cfg(game, 'lead') && s[0].v > avg * Rite.cfg(game, 'avg') ? s[0].p : null;
  },
  // la coalition contre tid : les IA qui le connaissent, ne sont pas ses alliées, et voient en lui le meneur
  coalitionOf(game, tid) {
    return game.players.filter(p => p.alive && !p.banished && !p.human && p.id !== tid && p.contact[tid] && p.diplo[tid] !== 'alliance'
      && (Diplomacy.leaderFor(game, p, Rite.cfg(game, 'lead'), Rite.cfg(game, 'avg')) || {}).id === tid);
  },
  // les membres : la coalition, et le joueur qui le connaît sans être son allié (il y contribue s'il le décide)
  members(game, tid) {
    const all = game.players.filter(p => p.alive && !p.banished && p.id !== tid && p.contact[tid] && p.diplo[tid] !== 'alliance');
    if (!Rite.cfg(game, 'coalition')) return all;
    const co = Rite.coalitionOf(game, tid);
    return all.filter(p => p.human || co.includes(p));
  },
  contributors(game, r) { return Rite.members(game, r.target).filter(p => !p.human || r.join[p.id]); },
  // « Nérissa, Tsevan et deux autres sorciers » : les inconnus ne sont pas nommés
  names(game, v, ids) {
    const known = ids.filter(id => id !== v && Players.knows(game, v, id)).map(id => game.players[id].name), unk = ids.filter(id => id !== v && !Players.knows(game, v, id)).length;
    if (unk) known.push(unk === 1 ? (known.length ? 'un autre sorcier' : 'un sorcier') : (['', '', 'deux', 'trois', 'quatre', 'cinq'][unk] || unk) + (known.length ? ' autres sorciers' : ' sorciers'));
    return known.length > 1 ? known.slice(0, -1).join(', ') + ' et ' + known[known.length - 1] : known[0] || '';
  },
  stats(game) { return (game.riteStats = game.riteStats || { rituals: 0, demons: 0, slain: 0, caught: 0 }); },
  turnsLeft(r) { return r.lastGot > 0 ? Math.ceil((r.cost - r.progress) / r.lastGot) : null; },
  // un message à chacun (null : rien pour lui) ; le joueur le voit aussi en annonce au centre de l'écran
  say(game, title, fn, ref, at) {
    for (const p of game.players) {
      const t = fn(p.id); if (!t) continue;
      Game.log(game, p.id, t, Object.assign({ rite: true }, typeof ref === 'function' ? ref(p.id) : ref));
      if (p.human && Game.hooks.fx) Game.hooks.fx({ type: 'rite', player: p.id, title, msg: t, target: (typeof at === 'function' ? at(p.id) : at) || null });
    }
  },
  tick(game) {
    if (!Rite.on(game)) return;
    let r = Rite.active(game);
    if (r) {
      const tgt = game.players[r.target];
      if (!tgt || !tgt.alive || tgt.banished) return Rite.end(game, 'fallen');
      const top = Math.max(0, ...Rite.members(game, r.target).map(p => Rite.standing(game, p)));
      if (Rite.standing(game, tgt) < top) return Rite.end(game, 'caught');
      // la coalition s'est défaite avant la fin du rituel : plus personne n'y contribue
      if (r.phase === 'ritual' && (Rite.cfg(game, 'coalition') ? !Rite.contributors(game, r).length : Rite.members(game, r.target).length < 2)) return Rite.end(game, 'broken');
      if (r.phase === 'demon') {
        const owner = game.players[r.owner];
        if (!game.units[r.demon]) return Rite.end(game, 'slain');
        if (owner && owner.diplo[r.target] === 'war') r.ownerWar = true;
        if (!owner || !owner.alive || (r.ownerWar && ['peace', 'alliance'].includes(owner.diplo[r.target]))) return Rite.end(game, 'owner');
      }
    }
    r = game.rite;
    if (!r || (r.phase === 'cool' && game.turn >= r.until)) {
      const L = Rite.leader(game); if (!L) return;
      const ms = Rite.members(game, L.id); if (ms.length < 2) return;
      const n = (game.riteCount && game.riteCount[L.id]) || 0;
      Rite.stats(game).rituals++;
      game.rite = r = { phase: 'ritual', target: L.id, progress: 0, cost: Math.round(Rite.cfg(game, 'cost') * (1 + 0.5 * n)), paid: {}, join: {}, start: game.turn, lastGot: 0 };
      const ids = ms.filter(p => !p.human).map(p => p.id);   // (le joueur membre n'y figure pas : il choisit d'y entrer)
      // l'accord du verbe : « Nérissa scelle », « Nérissa et Tsevan scellent » (le lecteur n'est jamais compté)
      const who = v => { const o = ids.filter(id => id !== v); return { n: U.cap(Rite.names(game, v, o)), pl: o.length > 1 }; };
      Rite.say(game, 'Invocation du Démon légendaire', v => {
        const w = who(v), sc = U.txt(w.pl ? 'scellent' : 'scelle'), inv = U.txt(w.pl ? 'invoquent' : 'invoque');
        if (v === L.id) return w.n + ' ' + sc + ' un pacte contre vous : le rituel d\'Invocation du Démon légendaire commence.';
        const p = game.players[v]; if (!p.contact[L.id] && !ms.includes(p)) return null;
        return w.n + ' ' + sc + ' un pacte contre ' + Players.nameFor(game, v, L.id) + ', qui domine la partie, et ' + inv + ' le Démon légendaire.' + (p.human && ms.includes(p) ? ' Vous n\'y êtes pas engagé : vous pouvez y contribuer depuis l\'écran Magie (M).' : '');
      }, {});
    }
    if (r.phase === 'ritual') Rite.advance(game, r);
  },
  advance(game, r) {
    const cs = Rite.contributors(game, r); r.lastGot = 0;
    if (!cs.length) return;
    const pw = cs.map(p => Math.max(1, Magic.power(game, p))), tot = U.sum(pw, x => x);
    const step = U.sum(cs, p => Magic.totalSkill(game, p));
    let got = 0;
    cs.forEach((p, i) => {
      const want = Math.min(Math.ceil(step * pw[i] / tot), r.cost - r.progress - got);
      if (want <= 0) return;
      // une IA complète avec l'or qui dort (au taux de l'alchimie), en gardant 100 pièces
      if (!p.human && p.mana < want) {
        const rate = p.retorts.includes('alchemy') ? 1 : 2, m = Math.min(want - p.mana, Math.floor(Math.max(0, p.gold - 100) / rate));
        if (m > 0) { p.gold -= m * rate; p.mana += m; }
      }
      const pay = Math.max(0, Math.min(want, p.mana));
      p.mana -= pay; got += pay; r.paid[p.id] = (r.paid[p.id] || 0) + pay;
    });
    r.progress += got; r.lastGot = got;
    if (r.progress >= r.cost) Rite.summon(game, r);
  },
  // le maître du démon : le plus fort des contributeurs en guerre contre la cible, sinon le plus fort de tous (une IA entre alors en guerre) ;
  // plus : un sorcier ajouté aux contributeurs (le joueur qui se demande s'il doit y entrer)
  ownerOf(game, r, plus) {
    const cs = Rite.contributors(game, r).concat(plus && !Rite.contributors(game, r).includes(plus) ? [plus] : []); if (!cs.length) return null;
    const atWar = cs.filter(p => p.diplo[r.target] === 'war');
    return U.max(atWar.length ? atWar : cs, p => Rite.standing(game, p));
  },
  summon(game, r) {
    const cs = Rite.contributors(game, r); if (!cs.length) return;
    const owner = Rite.ownerOf(game, r);
    const tc = Cities.ofPlayer(game, r.target), mine = Cities.ofPlayer(game, owner.id);
    const near = c => { const d = tc.filter(t => t.plane === c.plane).map(t => World.dist(game.world, c.x, c.y, t.x, t.y)); return d.length ? Math.min(...d) : 999; };
    const home = U.min(mine, near) || game.cities[owner.fortress];
    const at = home && Spells.spotNear(game, owner, home, 'RiteDemon');
    if (!at) return;   // pas de place : il apparaîtra au prochain tour
    const u = Units.create(game, 'RiteDemon', owner.id, at[0], at[1], at[2]);
    u.riteDemon = true; u.moves = 0;
    // le cortège (réglage retinue) : sur sa case, dans la limite de la pile
    const nr = Math.min(Rite.cfg(game, 'retinue') || 0, 9 - Units.at(game, at[0], at[1], at[2]).length);
    for (let i = 0; i < nr; i++) { const e = Units.create(game, Rite.cfg(game, 'retinueUnit'), owner.id, at[0], at[1], at[2]); e.riteEscort = u.id; e.riteRetinue = true; e.pactFree = true; e.moves = 0; }
    r.maxEsc = Math.max(r.maxEsc || 0, nr);
    r.phase = 'demon'; r.owner = owner.id; r.demon = u.id; r.summoned = game.turn; Rite.stats(game).demons++;
    game.riteCount = game.riteCount || {}; game.riteCount[r.target] = (game.riteCount[r.target] || 0) + 1;
    // une IA qui n'était pas en guerre avec la cible y entre : sans traité, aussitôt ; sous un traité, elle le dénonce d'abord
    const tp = game.players[r.target], st0 = owner.diplo[r.target] || 'none';
    if (!owner.human && st0 === 'none') Diplomacy.declareWar(game, owner.id, r.target, -20);
    else if (!owner.human && st0 === 'peace' && !(owner.denounced && owner.denounced[r.target] != null)) Diplomacy.breakOrDenounce(game, owner, tp);
    if (owner.diplo[r.target] === 'war') r.ownerWar = true;
    Rite.say(game, 'Le Démon légendaire', v => v === r.target ? 'Le Démon légendaire se dresse aux côtés ' + deWho(Players.nameFor(game, v, owner.id)) + ' et marche contre vous.'
      : v === owner.id ? 'Le rituel s\'achève : le Démon légendaire se dresse à vos côtés. Il ne combat que ' + Players.nameFor(game, v, r.target) + '.'
      : game.players[v].contact[r.target] || game.players[v].contact[owner.id] ? 'Le Démon légendaire se dresse aux côtés ' + deWho(Players.nameFor(game, v, owner.id)) + ' contre ' + Players.nameFor(game, v, r.target) + '.' : null,
      v => v === owner.id ? { unit: u.id } : {}, v => v === owner.id ? { unit: u.id } : null);
  },
  // le Démon légendaire vient de tomber au combat : la récompense pour la cible (seule à pouvoir le combattre), et le pacte s'achève
  slain(game) {
    const r = game.rite; if (!r || r.phase !== 'demon') return;
    const T = game.players[r.target];
    if (T) {
      T.fame = (T.fame || 0) + Rite.SLAIN_FAME; T.mana = (T.mana || 0) + Rite.SLAIN_MANA;
      T.demonSlain = { turn: game.turn, fame: Rite.SLAIN_FAME, mana: Rite.SLAIN_MANA, by: r.owner };
      Game.log(game, T.id, 'Vous avez abattu le Démon légendaire ! Renom +' + Rite.SLAIN_FAME + ', et son essence vous rend ' + Rite.SLAIN_MANA + ' mana.', { rite: true });
    }
    Rite.end(game, 'slain');
    if (T && T.human && Game.hooks.demonSlain) Game.hooks.demonSlain(game, T);
  },
  end(game, why) {
    const r = game.rite, d = r && r.demon != null ? game.units[r.demon] : null;
    if (d) Units.remove(game, d);
    const T = r.target;
    const rs = Rite.stats(game); if (rs[why] != null) rs[why]++;
    // l'escorte rentre dans le rang ; ce que le démon a fait (pour le banc)
    for (const u of Object.values(game.units)) if (u.riteRetinue) Units.remove(game, u);
    for (const u of Object.values(game.units)) if (u.riteEscort != null) delete u.riteEscort;
    for (const c of Object.values(game.cities)) if (c.aiRiteEsc != null) delete c.aiRiteEsc;
    if (r.phase === 'demon' && r.summoned != null) { rs.escorts = (rs.escorts || 0) + (r.maxEsc || 0); rs.demonCaps = (rs.demonCaps || 0) + (r.caps || 0); rs.life = (rs.life || 0) + game.turn - r.summoned; }
    const msg = {
      fallen: v => 'Le pacte contre ' + Players.nameFor(game, v, T) + ' n\'a plus d\'objet' + (d ? ' : le Démon légendaire retourne aux abîmes.' : '.'),
      caught: v => v === T ? 'Vous ne dominez plus la partie : le pacte se dissout' + (d ? ' et le Démon légendaire retourne aux abîmes.' : '.') : U.cap(Players.nameFor(game, v, T)) + ' ne domine plus la partie : le pacte se dissout' + (d ? ' et le Démon légendaire retourne aux abîmes.' : '.'),
      broken: v => 'Le pacte contre ' + (v === T ? 'vous' : Players.nameFor(game, v, T)) + ' se défait : le rituel est abandonné.',
      slain: v => 'Le Démon légendaire est tombé. Le pacte contre ' + (v === T ? 'vous' : Players.nameFor(game, v, T)) + ' devra attendre avant de tenter un nouveau rituel.',
      owner: v => 'Le maître du Démon légendaire a fait la paix : le démon retourne aux abîmes.',
    }[why];
    const concerned = v => v === T || Rite.members(game, T).some(p => p.id === v) || (game.players[v] && game.players[v].contact[T]);
    // la cible qui vient d'abattre le démon a son propre message (Rite.slain) et sa grande fenêtre : pas de second avis pour elle
    const done = why === 'slain' && game.players[T] && game.players[T].demonSlain && game.players[T].demonSlain.turn === game.turn;
    if (msg) Rite.say(game, d ? 'Le Démon légendaire' : 'Le pacte', v => concerned(v) && !(done && v === T) ? msg(v) : null, {});
    game.rite = { phase: 'cool', until: game.turn + Rite.COOLDOWN, last: T, why };
  },
  // Explosion de sort contre un membre du rituel : sa part déjà versée est perdue
  blast(game, pl, o) {
    const r = Rite.active(game); if (!r || r.phase !== 'ritual' || !(r.paid[o.id] > 0)) return null;
    const lost = Math.min(r.paid[o.id], r.progress);
    if (pl.mana < lost) return { ok: false, why: 'Mana insuffisant.' };
    pl.mana -= lost; r.progress -= lost; r.paid[o.id] = 0;
    Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a pulvérisé votre part du rituel du Démon légendaire.', { rite: true });
    return { msg: 'Part de ' + o.name + ' dans le rituel pulvérisée (' + lost + ' mana).' };
  },
  // le démon ne combat que la cible : la raison du refus, ou null
  refusal(game, attackers, defPid) {
    if (!attackers.some(u => u.riteDemon)) return null;
    const r = Rite.active(game);
    if (r && defPid === r.target) return null;
    return 'Le Démon légendaire ne combat que ' + (r ? Players.nameFor(game, attackers[0].owner, r.target) : 'la cible du pacte') + '.';
  },
};
Object.assign(Rite, {
  // attaqué par un autre que la cible : le démon quitte la case (sur la plus proche où il tient), il ne prend pas part au combat
  stepAside(game, d) {
    const pl = game.players[d.owner] || { id: d.owner }, w = game.world;
    for (let r = 1; r <= 4; r++) {
      let best = null, bd = 1e9;
      for (let y = d.y - r; y <= d.y + r; y++) for (let x0 = d.x - r; x0 <= d.x + r; x0++) {
        const x = ((x0 % w.w) + w.w) % w.w; if (y < 0 || y >= w.h) continue;
        if (Math.max(Math.abs(x0 - d.x), Math.abs(y - d.y)) !== r) continue;
        const at = Spells.spotNear(game, pl, { plane: d.plane, x, y }, d.type);
        if (at && at[1] === x && at[2] === y) { const dd = World.dist(w, x, y, d.x, d.y); if (dd < bd) { bd = dd; best = at; } }
      }
      if (best) { d.x = best[1]; d.y = best[2]; d.path = null; d.dest = null; return true; }
    }
    return false;
  },
});
// le maître IA du démon ne cherche pas la paix avec la cible tant que le démon marche
Object.assign(Rite, { binds(game, a, b) { const r = Rite.active(game); return !!(r && r.phase === 'demon' && ((r.owner === a && r.target === b) || (r.owner === b && r.target === a))); } });

// ---------- le Livre de légende ----------
// Un livre unique, caché sur une case ordinaire de l'un des deux plans, que rien ne signale. Cinq fragments portent chacun une
// énigme vraie sur cette case (plan, terrain, rivière, mer, montagne, nœud, tour, région) ; les cinq réunies la désignent seule.
// Trois fragments dorment dans les repaires les plus redoutables, un dans une tour de sorcellerie, un dans les archives d'une cité
// neutre. Un fragment trouvé rejoint la cité à bibliothèque du découvreur la plus proche (sa forteresse à défaut) : il appartient
// à qui tient la cité. L'énigme lue reste en mémoire. Le sceau ne cède qu'à qui détient trois fragments en entrant sur la case ;
// des gardiens du niveau des pires repaires se dressent alors. Vaincus, ils livrent le Livre, rangé lui aussi dans une
// bibliothèque : il change de mains avec sa cité, et ses trois sorts avec lui.
const BOOK_SPELLS = ['palimpsest', 'erasure', 'oblivion', 'annals', 'deus_ex_machina', 'mise_en_abyme', 'legendary_artifact'];
if (typeof DATA !== 'undefined' && DATA.spells && !DATA.spells.palimpsest) {
  const base = { realm: 'arcane', rarity: 'legend', section: 'legend', combatCost: null, plus: false, overland: true, combat: false, upkeep: 0, research: 0, kind: 'special', book: true, params: {} };
  Object.assign(DATA.spells, {
    palimpsest: Object.assign({}, base, { id: 'palimpsest', en: 'Palimpsest', name: 'Palimpseste', cost: 250, target: 'enemyWizard',
      desc: 'Recopie dans votre grimoire le plus précieux des sorts que connaît un sorcier rival et que vous ignorez.' }),
    erasure: Object.assign({}, base, { id: 'erasure', en: 'Erasure', name: 'Rature', cost: 500, target: 'enemyWizard',
      desc: 'Efface de la mémoire d\'un sorcier rival le plus rare de ses sorts. Il devra le rechercher à nouveau.' }),
    oblivion: Object.assign({}, base, { id: 'oblivion', en: 'Oblivion', name: 'Oubli', cost: 400, target: 'none',
      desc: 'Vos rivaux oublient vos terres : ce qu\'ils en savaient, cartes et rapports sur vos armées, s\'efface. Ils devront vous redécouvrir.' }),
    annals: Object.assign({}, base, { id: 'annals', en: 'Annals', name: 'Annales', cost: 200, target: 'enemyWizard',
      desc: 'Vous lisez tout ce que sait un sorcier rival : ses cartes et ses rapports sur les armées deviennent les vôtres.' }),
    deus_ex_machina: Object.assign({}, base, { id: 'deus_ex_machina', en: 'Deus ex machina', name: 'Deus ex machina', cost: 500, target: 'friendlyCity', kind: 'cityEnchant',
      desc: 'Une seule fois par partie. La prochaine armée d\'un sorcier qui attaque la cité est renvoyée dans la plus proche de ses cités, sans combat.' }),
    mise_en_abyme: Object.assign({}, base, { id: 'mise_en_abyme', en: 'Mise en abyme', name: 'Mise en abyme', cost: 800, target: 'friendlyUnit',
      desc: 'Crée à ses côtés une copie exacte de l\'unité visée, expérience et enchantements compris. Pas sur un héros.' }),
    legendary_artifact: Object.assign({}, base, { id: 'legendary_artifact', en: 'Legendary Artifact', name: 'Artefact légendaire', cost: 1000, target: 'none',
      desc: 'Fait paraître dans votre coffre l\'un des cinq artefacts légendaires, au hasard. Il n\'en paraîtra que trois dans toute la partie.' }),
  });
}
const Book = {
  NEED: 3, FRAGS: 5, GUARD_BUDGET: 3200,
  LAND: null,
  holder(game) { const b = game.book; if (!b || b.city == null) return null; const c = game.cities[b.city]; return c ? c.owner : null; },
  fragOwner(game, f) { if (f.city == null) return null; const c = game.cities[f.city]; return c ? c.owner : null; },
  held(game, pid) { return game.book ? game.book.frags.filter(f => Book.fragOwner(game, f) === pid).length : 0; },
  readBy(game, pid) { return game.book ? game.book.frags.filter(f => f.read.includes(pid)) : []; },
  clueOf(game, f) { return game.book.clues[f.clue]; },
  isVault(game, plane, x, y) { const b = game.book; return !!b && b.plane === plane && b.x === x && b.y === y; },
  guards(game) { return Object.values(game.units).filter(u => u.bookGuard); },
  knows(game, pl, id) { return pl.known.includes(id) || (BOOK_SPELLS.includes(id) && Book.holder(game) === pl.id); },

  // ---------- la mise en place ----------
  place(game) {
    if (game.book) return;
    const rng = new RNG(((game.seed || 1) * 7919 + 0xB00C) >>> 0), w = game.world;
    const landT = [T.GRASS, T.FOREST, T.HILLS, T.DESERT, T.SWAMP, T.TUNDRA];
    const cities = Object.values(game.cities);
    // toutes les cases où le Livre pourrait être (ce que verra le joueur qui raisonne), et celles où on le cache vraiment (loin des cités)
    const pool = [];
    for (let p = 0; p < 2; p++) for (let y = 1; y < w.h - 1; y++) for (let x = 0; x < w.w; x++)
      if (landT.includes(World.terr(w, p, x, y)) && World.get(w, p, 'site', x, y) < 0 && !Cities.at(game, p, x, y)) pool.push({ p, x, y });
    const F = Book.features(game, pool);
    const tiles = pool.filter(t => !cities.some(c => c.plane === t.p && World.dist(w, c.x, c.y, t.x, t.y) < 4));
    if (tiles.length < 20) return;
    let best = null;
    const plane = rng.int(2), here = tiles.filter(t => t.p === plane).length >= 20 ? tiles.filter(t => t.p === plane) : tiles;   // un plan, puis une case
    for (let k = 0; k < 80 && !(best && best.left.length === 1); k++) {
      const t = rng.pick(here);
      if (cities.some(c => c.fortress && c.plane === t.p && World.dist(w, c.x, c.y, t.x, t.y) < 8)) continue;
      const pick = Book.chooseClues(F, t, rng);
      if (pick && (!best || pick.left.length < best.left.length)) best = Object.assign({ t }, pick);
    }
    if (!best) return;
    // les sources des fragments : les trois repaires les plus redoutables (un sur chaque plan d'abord), une tour, une cité neutre
    const LAIRS = ['cave', 'ruins', 'temple', 'keep', 'dungeon', 'fallenTemple', 'lair'];
    const lairs = game.sites.filter(s => LAIRS.includes(s.type) && !s.cleared && !s.legend).sort((a, b) => (b.budget || 0) - (a.budget || 0));
    const srcs = [];
    for (const p of [0, 1]) { const s = lairs.find(s => s.plane === p && !srcs.includes(s)); if (s) srcs.push(s); }
    for (const s of lairs) if (srcs.length < 3 && !srcs.includes(s)) srcs.push(s);
    const tower = rng.pick(game.sites.filter(s => s.type === 'tower' && !s.cleared && s.plane === 0)) || null;
    const neutral = rng.pick(cities.filter(c => c.owner < 0 && !cities.some(f => f.fortress && f.plane === c.plane && World.dist(w, f.x, f.y, c.x, c.y) < 8))) || null;
    const order = rng.shuffle([0, 1, 2, 3, 4]);
    const frags = [];
    for (const s of srcs) frags.push({ site: s.id, city: null });
    if (tower) frags.push({ site: tower.id, city: null });
    if (neutral) frags.push({ site: null, city: neutral.id, archive: true });
    for (const s of lairs) if (frags.length < Book.FRAGS && !srcs.includes(s)) frags.push({ site: s.id, city: null });
    game.book = { plane: best.t.p, x: best.t.x, y: best.t.y, clues: best.clues.map(c => c.text), cand: best.left.length,
      frags: frags.slice(0, Book.FRAGS).map((f, i) => Object.assign(f, { id: i, clue: order[i], read: [], ground: null })),
      revealed: false, claimed: false, city: null, ground: null, sealSeen: {}, heard: {} };
    // la carte en puzzle (comme les obélisques de Heroes) : 16 x 12 cases autour du Livre, en 48 pièces de 2 x 2 ;
    // chaque fragment lu en dévoile un cinquième, du bord vers le centre, où le X apparaît en dernier
    const PW = 16, PH = 12, cols = 8, rows = 6;
    const x0 = best.t.x - PW / 2, y0 = U.clamp(best.t.y - PH / 2, 0, w.h - PH);
    const pieces = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cx = x0 + c * 2 + 1, cy = y0 + r * 2 + 1;
      pieces.push({ i: r * cols + c, d: Math.hypot(cx - best.t.x - 0.5, cy - best.t.y - 0.5) + rng.next() * 2.5 });
    }
    game.book.puzzle = { x0, y0, w: PW, h: PH, cols, rows, order: pieces.sort((a, b) => b.d - a.d).map(p => p.i) };
  },
  // les pièces du puzzle que voit ce sorcier : un cinquième par fragment lu
  puzzleShown(game, pid) {
    const b = game.book; if (!b || !b.puzzle) return [];
    const n = b.claimed && Book.holder(game) === pid ? b.puzzle.order.length : Math.round(b.puzzle.order.length * Book.readBy(game, pid).length / Book.FRAGS);
    return b.puzzle.order.slice(0, n);
  },
  // ce que chaque case candidate offre aux énigmes
  features(game, tiles) {
    const w = game.world, nodes = game.sites.filter(s => s.type === 'node'), towers = game.sites.filter(s => s.type === 'tower');
    const LAIRS = ['cave', 'ruins', 'temple', 'keep', 'dungeon', 'fallenTemple', 'lair'];
    const lairs = game.sites.filter(s => LAIRS.includes(s.type));
    const near = (list, t) => { let d = 99; for (const s of list) if (s.plane === t.p) d = Math.min(d, World.dist(w, s.x, s.y, t.x, t.y)); return d; };
    const seaDist = t => { for (let d = 1; d <= 6; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; if (World.terr(w, t.p, World.wx(w, t.x + dx), t.y + dy) === T.OCEAN) return d; } return 99; };
    for (const t of tiles) {
      t.terr = World.terr(w, t.p, t.x, t.y);
      t.river = !!World.get(w, t.p, 'river', t.x, t.y);
      t.sea = seaDist(t);
      t.mount = World.neighbors(w, t.x, t.y).some(([x, y]) => [T.MOUNTAIN, T.VOLCANO].includes(World.terr(w, t.p, x, y)));
      t.node = {}; for (const r of ['nature', 'chaos', 'sorcery']) t.node[r] = near(nodes.filter(s => s.realm === r), t);
      t.tower = near(towers, t); t.lair = near(lairs, t);
      t.q = (t.y < w.h / 2 ? 'nord' : 'sud') + '-' + (t.x < w.w / 2 ? 'ouest' : 'est');
    }
    return { tiles };
  },
  // les nombres des énigmes (« à moins de trois cases »)
  NUM: ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit'],
  TERR_TXT: { [T.GRASS]: 'Ses pages reposent sous l\'herbe d\'une prairie.', [T.FOREST]: 'Les arbres d\'une forêt gardent son sommeil.', [T.HILLS]: 'Il dort au creux d\'une colline.',
    [T.DESERT]: 'Le sable d\'un désert le recouvre.', [T.SWAMP]: 'La vase d\'un marais le cache.', [T.TUNDRA]: 'Le gel de la toundra l\'emprisonne.' },
  QUAD_TXT: { 'nord-ouest': 'Il se trouve dans le quart nord-ouest du monde.', 'nord-est': 'Il se trouve dans le quart nord-est du monde.',
    'sud-ouest': 'Il se trouve dans le quart sud-ouest du monde.', 'sud-est': 'Il se trouve dans le quart sud-est du monde.' },
  NODE_TXT: { nature: 'Un nœud de nature verdoie', chaos: 'Un nœud de chaos brûle', sorcery: 'Un nœud de sorcellerie scintille' },
  // les énigmes vraies pour la case t, puis cinq d'entre elles qui, ensemble, ne laissent qu'une case (ou presque)
  chooseClues(F, t, rng) {
    const all = F.tiles, N = Book.NUM;
    const P = [];
    P.push({ k: 'plane', text: t.p ? 'Le Livre dort sur le Miroir, le monde d\'en dessous.' : 'Le Livre dort sur Arcane, sous le soleil.', f: o => o.p === t.p });
    if (Book.TERR_TXT[t.terr]) P.push({ k: 'terr', text: Book.TERR_TXT[t.terr], f: o => o.terr === t.terr });
    if (t.river) P.push({ k: 'river', text: 'Une rivière coule à côté de lui.', f: o => o.river });
    if (t.sea <= 1) P.push({ k: 'sea', text: 'On y entend le ressac de la mer.', f: o => o.sea <= 1 });
    else if (t.sea >= 5) P.push({ k: 'sea', text: 'La mer est à plus de quatre cases.', f: o => o.sea >= 5 });
    if (t.mount) P.push({ k: 'mount', text: 'Une montagne veille à côté de lui.', f: o => o.mount });
    for (const r of ['nature', 'chaos', 'sorcery']) { const d = t.node[r]; if (d <= 6) { const n = d + 1; P.push({ k: 'node', text: Book.NODE_TXT[r] + ' à moins de ' + N[n] + ' cases.', f: o => o.node[r] < n }); } }
    if (t.tower <= 7) { const n = t.tower + 1; P.push({ k: 'tower', text: 'Une tour de sorcellerie se dresse à moins de ' + N[n] + ' cases.', f: o => o.tower < n }); }
    if (t.lair <= 3) { const n = t.lair + 1; P.push({ k: 'lair', text: 'Un repaire s\'ouvre à moins de ' + N[n] + ' cases.', f: o => o.lair < n }); }
    P.push({ k: 'quad', text: Book.QUAD_TXT[t.q], f: o => o.q === t.q });
    // une énigme ne doit pas tout dire à elle seule : elle laisse au moins un dixième des cases
    const pool = P.filter(p => all.filter(p.f).length >= all.length * 0.1);
    if (pool.length < Book.FRAGS) return null;
    let left = all, picked = [];
    const kinds = new Set();
    while (picked.length < Book.FRAGS) {
      let bp = null, bn = Infinity;
      for (const p of rng.shuffle(pool.slice())) {
        if (picked.includes(p) || (kinds.has(p.k) && p.k !== 'node')) continue;
        const n = left.filter(p.f).length;
        if (n < bn) { bn = n; bp = p; }
      }
      if (!bp) return null;
      picked.push(bp); kinds.add(bp.k); left = left.filter(bp.f);
    }
    return { clues: picked, left };
  },
  // toutes les cases que les énigmes lues laissent possibles (ce que sait un sorcier, rien de plus)
  candidates(game, pid) {
    const b = game.book; if (!b) return [];
    if (!Book._F || Book._F.game !== game) {
      const w = game.world, tiles = [];
      for (let p = 0; p < 2; p++) for (let y = 1; y < w.h - 1; y++) for (let x = 0; x < w.w; x++)
        if ([T.GRASS, T.FOREST, T.HILLS, T.DESERT, T.SWAMP, T.TUNDRA].includes(World.terr(w, p, x, y)) && World.get(w, p, 'site', x, y) < 0) tiles.push({ p, x, y });
      Book._F = { game, tiles: Book.features(game, tiles).tiles };
    }
    const all = Book._F.tiles;
    const me = all.find(o => o.p === b.plane && o.x === b.x && o.y === b.y) || Book.features(game, [{ p: b.plane, x: b.x, y: b.y }]).tiles[0];
    // chaque énigme lue redevient le filtre qui l'a fait naître (on le retrouve par son texte)
    const filters = Book.chooseCluesAll(me);
    let left = all.filter(o => !Cities.at(game, o.p, o.x, o.y));
    for (const f of Book.readBy(game, pid)) { const p = filters.find(q => q.text === Book.clueOf(game, f)); if (p) left = left.filter(p.f); }
    return left;
  },
  chooseCluesAll(t) {
    const N = Book.NUM, P = [];
    P.push({ text: t.p ? 'Le Livre dort sur le Miroir, le monde d\'en dessous.' : 'Le Livre dort sur Arcane, sous le soleil.', f: o => o.p === t.p });
    if (Book.TERR_TXT[t.terr]) P.push({ text: Book.TERR_TXT[t.terr], f: o => o.terr === t.terr });
    P.push({ text: 'Une rivière coule à côté de lui.', f: o => o.river });
    P.push({ text: 'On y entend le ressac de la mer.', f: o => o.sea <= 1 });
    P.push({ text: 'La mer est à plus de quatre cases.', f: o => o.sea >= 5 });
    P.push({ text: 'Une montagne veille à côté de lui.', f: o => o.mount });
    for (const r of ['nature', 'chaos', 'sorcery']) for (let n = 2; n <= 7; n++) P.push({ text: Book.NODE_TXT[r] + ' à moins de ' + N[n] + ' cases.', f: o => o.node[r] < n });
    for (let n = 2; n <= 8; n++) P.push({ text: 'Une tour de sorcellerie se dresse à moins de ' + (N[n] || n) + ' cases.', f: o => o.tower < n });
    for (let n = 2; n <= 4; n++) P.push({ text: 'Un repaire s\'ouvre à moins de ' + N[n] + ' cases.', f: o => o.lair < n });
    P.push({ text: Book.QUAD_TXT[t.q], f: o => o.q === t.q });
    return P;
  },

  // ---------- garder un fragment, le Livre ----------
  // la cité à bibliothèque la plus proche du lieu de la trouvaille ; à défaut la forteresse, puis la cité la plus proche
  store(game, pid, at) {
    const cs = Cities.ofPlayer(game, pid); if (!cs.length) return null;
    const d = c => (c.plane === at.plane ? 0 : 1000) + World.dist(game.world, c.x, c.y, at.x, at.y);
    const lib = cs.filter(c => c.buildings.library);
    const c = lib.length ? U.min(lib, d) : game.cities[game.players[pid].fortress] || U.min(cs, d);
    return c ? c.id : null;
  },
  where(game, cid) { const c = game.cities[cid]; return c ? (c.buildings.library ? 'la bibliothèque de ' + c.name : c.name) : ''; },
  read(game, f, pid) { if (pid != null && pid >= 0 && !f.read.includes(pid)) { f.read.push(pid); return true; } return false; },
  // la rumeur : les sorciers qui connaissent le découvreur l'apprennent, sans savoir ce que dit le fragment
  rumor(game, pid, text) {
    for (const o of game.players) {
      if (!o.alive || o.id === pid || !o.contact[pid]) continue;
      Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pid)) + ' ' + text, { book: true });
      game.book.heard[o.id] = true;
    }
  },
  gain(game, f, pid, at, how) {
    const b = game.book, pl = game.players[pid];
    f.city = Book.store(game, pid, at);
    if (f.city == null) f.ground = { plane: at.plane, x: at.x, y: at.y };
    Book.read(game, f, pid);
    const n = Book.held(game, pid);
    Game.log(game, pid, how + ' On y lit : « ' + Book.clueOf(game, f) + ' »' + (f.city != null ? ' Il rejoint ' + Book.where(game, f.city) + '.' : '') + ' Vous en détenez ' + n + ' sur ' + Book.FRAGS + '.',
      { book: true, city: f.city != null ? f.city : undefined, modal: !!(pl && pl.human) });
    if (pl && pl.human && Game.hooks.fx) Game.hooks.fx({ type: 'bookFrag', player: pid, how, clue: Book.clueOf(game, f), held: n, city: f.city });
    Book.rumor(game, pid, 'a mis la main sur un fragment du Livre de légende.');
  },
  onLoot(game, site, pid, found) {
    const b = game.book; if (!b) return;
    for (const f of b.frags) {
      if (f.site !== site.id || f.city != null || f.ground || f.taken) continue;
      f.taken = true;
      if (found) found.push('un fragment du Livre de légende');
      Book.gain(game, f, pid, site, 'Parmi le butin, un fragment du Livre de légende.');
    }
  },
  onCapture(game, city, old, pid) {
    const b = game.book; if (!b) return;
    for (const f of b.frags) if (f.city === city.id) {
      const fresh = Book.read(game, f, pid);
      if (game.players[pid]) Game.log(game, pid, 'Dans ' + (f.archive && old < 0 ? 'les archives' : 'la bibliothèque') + ' de ' + city.name + ', un fragment du Livre de légende.' + (fresh ? ' On y lit : « ' + Book.clueOf(game, f) + ' »' : ' Vous en connaissiez déjà le texte.') + ' Vous en détenez ' + Book.held(game, pid) + ' sur ' + Book.FRAGS + '.', { book: true, city: city.id });
      if (old >= 0 && game.players[old]) Game.log(game, old, 'Le fragment du Livre de légende gardé à ' + city.name + ' vous est enlevé avec la cité.', { book: true });
      if (old < 0) Book.rumor(game, pid, 'a mis la main sur un fragment du Livre de légende.');
      // le joueur : l'annonce au centre de l'écran
      if (game.players[pid] && game.players[pid].human && Game.hooks.fx) Game.hooks.fx({ type: 'bookFrag', player: pid, how: 'Dans ' + (f.archive && old < 0 ? 'les archives' : 'la bibliothèque') + ' de ' + city.name + ', un fragment du Livre de légende.', clue: Book.clueOf(game, f), held: Book.held(game, pid), city: city.id });
    }
    if (b.city === city.id) {
      Game.logEach(game, v => v === pid ? 'Le Livre de légende est à vous : il était gardé à ' + city.name + '. Ses sorts s\'ouvrent dans votre grimoire.'
        : v === old ? 'Le Livre de légende vous est enlevé avec ' + city.name + '.' : game.players[v].contact[pid] ? U.cap(Players.nameFor(game, v, pid)) + ' s\'empare du Livre de légende.' : null, { book: true });
    }
  },
  // cité détruite : ce qu'elle gardait part chez le destructeur, ou chez son ancien maître, ou reste dans les ruines
  onCityGone(game, city, byPid) {
    const b = game.book; if (!b) return;
    const move = obj => {
      let to = byPid != null && byPid >= 0 ? Book.store(game, byPid, city) : null;
      if (to == null && city.owner >= 0) { const cs = Cities.ofPlayer(game, city.owner).filter(c => c !== city); if (cs.length) to = U.min(cs, c => (c.plane === city.plane ? 0 : 1000) + World.dist(game.world, c.x, c.y, city.x, city.y)).id; }
      obj.city = to; if (to == null) obj.ground = { plane: city.plane, x: city.x, y: city.y };
      return to;
    };
    for (const f of b.frags) if (f.city === city.id) { const to = move(f); if (to != null) Book.read(game, f, game.cities[to].owner); }
    if (b.city === city.id) move(b);
  },
  // un pas sur une case : un fragment (ou le Livre) laissé dans des ruines, le sceau du Livre
  async onEnter(game, pl, units, plane, x, y, fx, fy) {
    const b = game.book; if (!b) return null;
    for (const f of b.frags) if (f.ground && f.ground.plane === plane && f.ground.x === x && f.ground.y === y) {
      f.ground = null; Book.gain(game, f, pl.id, { plane, x, y }, 'Dans les décombres, un fragment du Livre de légende.');
    }
    if (b.ground && b.ground.plane === plane && b.ground.x === x && b.ground.y === y) { b.ground = null; Book.claim(game, pl.id, { plane, x, y }, true); }
    if (!Book.isVault(game, plane, x, y) || b.claimed) return null;
    const held = Book.held(game, pl.id);
    if (held < Book.NEED) {
      if (Book.readBy(game, pl.id).length && !b.sealSeen[pl.id]) { b.sealSeen[pl.id] = true; Game.log(game, pl.id, 'Une présence ancienne dort ici, scellée. Le sceau ne cédera qu\'à qui détient trois fragments du Livre de légende.', { book: true, x, y, plane }); }
      return null;
    }
    if (b.revealed) { if (!Book.guards(game).length) Book.claim(game, pl.id, { plane, x, y }); return null; }
    // le sceau se brise : la troupe est repoussée d'une case, les gardiens se dressent
    b.revealed = true; b.revealedBy = pl.id; b.revealedTurn = game.turn;
    for (const u of units) if (game.units[u.id]) { u.x = fx; u.y = fy; u.path = null; }
    Book.raiseGuards(game);
    Game.log(game, pl.id, 'Le sceau se brise : les gardiens du Livre de légende se dressent et repoussent vos troupes.', { book: true, x, y, plane, modal: !!pl.human });
    return 'stop';
  },
  // les gardiens : du niveau des pires repaires (force 11 000 à 14 000), une créature maîtresse et sa garde, d'un seul royaume
  GUARD_STR: 12500,
  // (banc d'essai : game.opts.bookGuard fixe la force moyenne des gardiens)
  guardStr(game) { return (game.opts && game.opts.bookGuard) || Book.GUARD_STR; },
  raiseGuards(game) {
    const b = game.book, rng = game.rng;
    const realm = rng.pick(['chaos', 'death', 'life', 'nature', 'sorcery']);
    const str = id => Units.strength(game, { type: id, ench: [], xp: 0, owner: -1, dmg: 0, weapon: 0 });
    const pool = Object.values(DATA.units).filter(u => u.race === 'fantastic' && u.realm === realm && u.castCost > 0 && !['MagicSpirit', 'GuardianSpirit', 'FloatingIsland', 'PhantomWarrior', 'PhantomBeast'].includes(u.id)).map(u => ({ id: u.id, s: str(u.id) }));
    const target = Math.round((11000 + rng.int(3000)) * Book.guardStr(game) / Book.GUARD_STR);
    const main = rng.pick(pool.filter(o => o.s <= target * 0.6).sort((a, c) => c.s - a.s).slice(0, 3)) || U.max(pool, o => o.s);
    const g = [main]; let left = target - main.s;
    while (g.length < 9 && left > 400) { const c = pool.filter(o => o.s <= left * 1.15); if (!c.length) break; const p = rng.pick(c); g.push(p); left -= p.s; }
    for (const o of g) { const u = Units.create(game, o.id, -1, b.plane, b.x, b.y); u.bookGuard = true; }
  },
  guardEstimate(game) { const gs = Book.guards(game); return gs.length ? U.sum(gs, u => Units.strength(game, u)) : Book.guardStr(game); },
  claim(game, pid, at, found) {
    const b = game.book;
    b.claimed = true; b.claimedTurn = game.turn; b.claimedBy = pid;
    b.city = Book.store(game, pid, at);
    if (b.city == null) { b.ground = { plane: at.plane, x: at.x, y: at.y }; return; }
    const c = game.cities[b.city], pl = game.players[pid];
    Game.logEach(game, v => v === pid ? 'Le Livre de légende est à vous ! Il rejoint ' + Book.where(game, b.city) + '. Ses sorts s\'ouvrent dans votre grimoire.'
      : game.players[v].contact[pid] || Book.readBy(game, v).length ? U.cap(Players.nameFor(game, v, pid)) + ' s\'est emparé du Livre de légende.' : null, { book: true, city: b.city });
    if (pl && pl.human && Game.hooks.fx) Game.hooks.fx({ type: 'rite', player: pid, title: 'Le Livre de légende', msg: 'Il rejoint ' + Book.where(game, b.city) + '. Ses sept sorts s\'ouvrent dans votre grimoire.', target: { city: b.city }, book: true, icon: 'item:book' });
    void c; void found;
  },
  // après un combat sur la case du Livre : les gardiens tombés, le vainqueur qui tient trois fragments le prend
  afterAttack(game, pid, plane, x, y) {
    const b = game.book; if (!b || b.claimed || !b.revealed || !Book.isVault(game, plane, x, y)) return;
    if (Book.guards(game).length) return;
    if (!Units.at(game, plane, x, y).some(u => u.owner === pid)) return;
    if (Book.held(game, pid) >= Book.NEED) Book.claim(game, pid, { plane, x, y });
    else if (game.players[pid]) Game.log(game, pid, 'Les gardiens sont tombés, mais le sceau tient encore : il faut détenir trois fragments du Livre de légende.', { book: true, x, y, plane });
  },
  tick(game) {
    const b = game.book; if (!b) return;
    for (const f of b.frags) { const o = Book.fragOwner(game, f); if (o != null && o >= 0) Book.read(game, f, o); }
  },
  // la ligne d'une cité qui garde un fragment ou le Livre (panneau de la cité)
  cityNote(game, c) {
    const b = game.book; if (!b) return null;
    const n = b.frags.filter(f => f.city === c.id).length;
    const parts = [];
    if (b.city === c.id) parts.push('Le Livre de légende est gardé ici.');
    if (n) parts.push((c.buildings.library ? 'Sa bibliothèque' : c.owner < 0 ? 'Ses archives' : 'Elle') + ' garde ' + (n > 1 ? n + ' fragments' : 'un fragment') + ' du Livre de légende.');
    return parts.length ? parts.join(' ') : null;
  },
};
Object.assign(OVERLAND_HANDLERS, {
  palimpsest(game, pl, t) {
    const o = game.players[t.player], id = Book.copyable(game, pl, o)[0];
    if (!id) return { ok: false, why: o.name + ' ne connaît aucun sort que vous puissiez recopier.' };
    Magic.learn(game, pl, id);
    Diplomacy.adjust(game, o.id, pl.id, -10, 'hostile_spell');
    Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a recopié dans son grimoire votre sort ' + DATA.spells[id].name + '.', { player: pl.id });
    return { msg: 'Palimpseste : ' + DATA.spells[id].name + ' rejoint votre grimoire.' };
  },
  erasure(game, pl, t) {
    const o = game.players[t.player], id = Book.erasable(game, o)[0];
    if (!id) return { ok: false, why: o.name + ' n\'a aucun sort qu\'on puisse raturer.' };
    if (o.casting && o.casting.id === id) o.casting = null;
    Pacts.forget(game, o, id);   // (le coût du Sort de Maîtrise ne baisse pas deux fois quand le sort sera réappris)
    Diplomacy.adjust(game, o.id, pl.id, -25, 'hostile_spell');
    Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a raturé ' + DATA.spells[id].name + ' de votre grimoire : il faudra le rechercher à nouveau.', { player: pl.id });
    return { msg: 'Rature : ' + DATA.spells[id].name + ' s\'efface du grimoire de ' + o.name + '.' };
  },
  // Oubli : chez chaque rival, ce qu'il savait de vos terres et de vos armées s'efface (sauf ce qu'il voit en ce moment)
  oblivion(game, pl) {
    const w = game.world, mine = (p, x, y) => World.get(w, p, 'owner', x, y) === pl.id || Cities.ofPlayer(game, pl.id).some(c => c.plane === p && World.dist(w, c.x, c.y, x, y) <= 2);
    let n = 0;
    for (const o of game.players) {
      if (o === pl || !o.alive) continue;
      const vis = Intel.vis(game, o); let lost = 0;
      for (let p = 0; p < 2; p++) {
        const ex = o.explored && o.explored[p]; if (!ex) continue;
        for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) { const i = y * w.w + x; if (ex[i] && !vis[p][i] && mine(p, x, y)) { ex[i] = 0; n++; lost++; } }
      }
      for (const k in o.intel || {}) {
        const [p, x, y] = k.split(',').map(Number), rec = o.intel[k];
        if (!vis[p][y * w.w + World.wx(w, x)] && mine(p, x, y)) { delete o.intel[k]; lost++; }
        else if (rec && rec.units) { const k0 = rec.units.length; rec.units = rec.units.filter(u => u.owner !== pl.id); lost += k0 - rec.units.length; }
      }
      if (!lost) continue;   // il ne savait rien de vous : rien à effacer, rien à lui dire
      if (o.aiTargetCity && mine(o.aiTargetCity.plane, o.aiTargetCity.x, o.aiTargetCity.y)) o.aiTargetCity = null;
      if (o.human && Game.hooks.fx) Game.hooks.fx({ type: 'oblivion', player: o.id });
      Game.log(game, o.id, 'Une brume étrange a effacé de vos cartes ce que vous saviez des terres ' + deWho(Players.nameFor(game, o.id, pl.id)) + '.', { player: pl.id });
    }
    game._intelStamp = (game._intelStamp || 0) + 1;
    return { msg: 'Oubli : vos rivaux ont perdu la trace de vos terres (' + n + ' cases effacées de leurs cartes).' };
  },
  annals(game, pl, t) {
    const o = game.players[t.player];
    if (!o) return { ok: false, why: 'Choisissez un sorcier rival.' };
    let n = 0, r = 0;
    for (let p = 0; p < 2; p++) { const a = pl.explored[p], b = o.explored && o.explored[p]; if (!a || !b) continue; for (let i = 0; i < a.length; i++) if (b[i] && !a[i]) { a[i] = 1; n++; } }
    const mine = pl.intel || (pl.intel = {});
    for (const k in o.intel || {}) {
      const rec = o.intel[k], cur = mine[k];
      if (!rec || (cur && (cur.t || 0) >= (rec.t || 0))) continue;
      const copy = JSON.parse(JSON.stringify(rec)); if (copy.units) copy.units = copy.units.filter(u => u.owner !== pl.id);
      mine[k] = copy; r++;
    }
    game._intelStamp = (game._intelStamp || 0) + 1;
    if (pl.human && Game.hooks.fx) Game.hooks.fx({ type: 'mapKnowledge', player: pl.id });
    return { msg: 'Annales : les cartes ' + deWho(Players.nameFor(game, pl.id, o.id)) + ' sont à vous (' + U.n(n, 'case découverte', 'cases découvertes') + ', ' + U.n(r, 'rapport') + ' sur les armées).' };
  },
  deus_ex_machina(game, pl, t) {
    const c = game.cities[t.city];
    if (!c || c.owner !== pl.id) return { ok: false, why: 'Il faut une cité amie.' };
    c.ench.push({ spell: 'deus_ex_machina', owner: pl.id });
    pl.bookOnce = Object.assign(pl.bookOnce || {}, { deus: true });
    return { msg: 'Deus ex machina veille sur ' + c.name + '.' };
  },
  legendary_artifact(game, pl) {
    const left = Book.artifactsLeft(game);
    if (!left.length) return { ok: false, why: 'Les trois artefacts légendaires de cette partie ont déjà paru.' };
    const key = game.rng.pick(left), a = Book.ARTIFACTS[key], it = Book.makeArtifact(key);
    (game.book.artifacts = game.book.artifacts || []).push(key);
    pl.vault = pl.vault || []; pl.vault.push(it);
    const n = Book.ARTIFACT_MAX - game.book.artifacts.length;
    for (const o of game.players) if (o !== pl && o.alive && o.contact && o.contact[pl.id]) Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a fait paraître ' + a.name + ', un artefact légendaire.', { player: pl.id, minor: !o.human });
    return { msg: U.cap(a.name) + ' paraît dans votre coffre (' + Items.describe(it) + '). ' + (n ? (n > 1 ? 'Deux autres artefacts légendaires' : 'Un dernier artefact légendaire') + ' peu' + (n > 1 ? 'vent' : 't') + ' encore paraître.' : 'C\'était le dernier.') };
  },
  mise_en_abyme(game, pl, t) {
    const u = game.units[t.unit];
    if (!u || u.owner !== pl.id) return { ok: false, why: 'Il faut une unité amie.' };
    const copy = Units.create(game, u.type, pl.id, u.plane, u.x, u.y, { xp: u.xp, weapon: u.weapon, undead: u.undead, ench: u.ench.slice() });
    if (u.chaosChannel) copy.chaosChannel = u.chaosChannel;
    copy.moves = 0; copy.status = '';
    return { msg: 'Mise en abyme : ' + Units.label(u) + (Units.plural(u) ? ' ont désormais leur double.' : ' a désormais son double.') };
  },
});
Object.assign(Book, {
  RAR: { veryrare: 4, rare: 3, uncommon: 2, common: 1 },
  learnable(pl, id) { const s = DATA.spells[id]; return !!s && !s.book && id !== 'spell_of_mastery' && id !== 'spell_of_return' && !(s.realm === 'life' && pl.books.death) && !(s.realm === 'death' && pl.books.life); },
  copyable(game, pl, o) { return o ? o.known.filter(id => !pl.known.includes(id) && Book.learnable(pl, id)).sort((a, b) => (Book.RAR[DATA.spells[b].rarity] || 0) - (Book.RAR[DATA.spells[a].rarity] || 0) || (DATA.spells[b].research || 0) - (DATA.spells[a].research || 0)) : []; },
  // le Sort de Maîtrise d'abord (qu'il l'étudie, le connaisse ou l'incante), puis le plus rare
  erasable(game, o) { if (!o) return []; return o.known.filter(id => DATA.spells[id] && !DATA.spells[id].book && id !== 'spell_of_return' && DATA.spells[id].rarity !== 'common')
    .sort((a, b) => (b === 'spell_of_mastery') - (a === 'spell_of_mastery') || (Book.RAR[DATA.spells[b].rarity] || 0) - (Book.RAR[DATA.spells[a].rarity] || 0) || (DATA.spells[b].research || 0) - (DATA.spells[a].research || 0)); },
  fallen(game) {
    const alive = new Set(Object.values(game.units).filter(u => u.hero).map(u => u.type)), gone = new Set(game.goneHeroes || []);
    const out = [];
    for (const p of game.players) for (const d of p.deadHeroes || []) if (!alive.has(d.type) && !gone.has(d.type) && d.type !== 'HeroTorin') out.push({ owner: p.id, d });
    return out.sort((a, b) => (b.d.xp || 0) - (a.d.xp || 0));
  },
  // Deus ex machina : l'armée d'un sorcier qui attaque la cité repart dans la plus proche de ses cités, sans combat ; le sort se consume
  deus(game, attackers, city) {
    if (!city || city.owner < 0 || !attackers.length) return null;
    const e = city.ench.find(e => e.spell === 'deus_ex_machina'); if (!e) return null;
    if (e.owner !== city.owner) { city.ench = city.ench.filter(x => x !== e); return null; }   // la cité a changé de mains : le sort s'est éteint
    const pid = attackers[0].owner; if (pid < 0 || pid === city.owner || !game.players[pid]) return null;
    city.ench = city.ench.filter(x => x !== e);
    const home = Book.sendHome(game, attackers);
    const to = home ? 'à ' + home.name : 'en arrière';
    Game.log(game, city.owner, 'Deus ex machina : l\'armée ' + deWho(Players.nameFor(game, city.owner, pid)) + ' qui attaquait ' + city.name + ' a été renvoyée ' + (home && Intel.knows(game, game.players[city.owner], home.plane, home.x, home.y) ? to : 'chez elle') + '.', { city: city.id, player: pid, spell: 'deus_ex_machina' });
    Game.log(game, pid, 'Une force venue de nulle part protégeait ' + city.name + ' : votre armée a été renvoyée ' + to + '.', { city: home ? home.id : city.id, spell: 'deus_ex_machina', alert: true });
    if (Game.hooks.fx) for (const v of [city.owner, pid]) if (game.players[v] && game.players[v].human)
      Game.hooks.fx({ type: 'spellCast', player: v, id: 'deus_ex_machina', target: { city: v === pid && home ? home.id : city.id }, msg: v === pid ? 'Votre armée est renvoyée ' + to + '.' : 'L\'armée qui attaquait ' + city.name + ' est renvoyée chez elle.' });
    if (Game.hooks.update) Game.hooks.update({ type: 'deus' });
    return { ok: true, won: false, repelled: true };
  },
  sendHome(game, units) {
    const w = game.world, u0 = units[0], pid = u0.owner, pl = game.players[pid];
    const c = U.min(Cities.ofPlayer(game, pid), c => (c.plane === u0.plane ? 0 : 1000) + World.dist(w, c.x, c.y, u0.x, u0.y));
    const stop = () => { for (const u of units) { u.moves = 0; u.path = null; u.dest = null; u.status = ''; u.attackOrder = false; } };
    if (!c) { stop(); return null; }
    // la cité elle-même, ou la case libre la plus proche quand sa garnison est pleine
    const fits = (x, y) => { const here = Units.at(game, c.plane, x, y); const ct = Cities.at(game, c.plane, x, y);
      return here.every(v => v.owner === pid) && here.length + units.length <= MAX_STACK && (ct ? ct.owner === pid : !World.isWaterAt(w, c.plane, x, y)); };
    let at = fits(c.x, c.y) ? [c.x, c.y] : null;
    const seen = new Set([c.x + ',' + c.y]); let ring = [[c.x, c.y]];
    for (let d = 1; d <= 4 && !at; d++) {
      const next = [];
      for (const [x, y] of ring) for (const [nx, ny] of World.neighbors(w, x, y)) { const k = nx + ',' + ny; if (seen.has(k)) continue; seen.add(k); next.push([nx, ny]); }
      at = next.find(([x, y]) => fits(x, y)) || null; ring = next;
    }
    if (!at) { stop(); return null; }
    for (const u of units) { u.plane = c.plane; u.x = at[0]; u.y = at[1]; }
    stop();
    if (pl) Move.reveal(game, pl, c.plane, at[0], at[1], 1);
    return c;
  },
  // les cinq artefacts légendaires : trois seulement paraîtront dans la partie, tirés au hasard parmi ceux qui restent
  ARTIFACTS: {
    excalibur: { kind: 'sword', name: 'Excalibur', melee: 8, toHit: 4, def: 4, powers: ['holyAvenger', 'firstStrike', 'armorPiercing'] },
    aegis: { kind: 'shield', name: 'l\'Égide', def: 9, res: 6, hp: 4, powers: ['magicImmunity', 'missileImmunity', 'trueSight'] },
    gyges: { kind: 'ring', name: 'l\'Anneau de Gygès', res: 5, def: 3, melee: 3, move: 1, powers: ['invisibility', 'regeneration', 'pathfinding'] },
    apollo: { kind: 'bow', name: 'l\'Arc d\'Apollon', ranged: 8, toHit: 4, def: 3, powers: ['armorPiercing', 'holyAvenger', 'trueSight'] },
    caduceus: { kind: 'staff', name: 'le Caducée d\'Hermès', skill: 40, melee: 4, toHit: 3, res: 5, move: 1, powers: ['flight', 'regeneration', 'trueSight'] },
  },
  ARTIFACT_MAX: 3,
  artifactsLeft(game) { const done = (game.book && game.book.artifacts) || []; return done.length >= Book.ARTIFACT_MAX ? [] : Object.keys(Book.ARTIFACTS).filter(k => !done.includes(k)); },
  makeArtifact(key) {
    const a = Book.ARTIFACTS[key], name = a.name.replace(/^(l'|le |la )/, m => '').replace(/^./, c => c.toUpperCase());
    const it = { kind: a.kind, slot: ITEM_KINDS[a.kind].slot, name, powers: a.powers.slice(), icon: 'item:legend:' + key, legendary: true, bookArtifact: key, value: 5000 };
    for (const k of ['melee', 'ranged', 'def', 'res', 'move', 'toHit', 'hp', 'skill']) if (a[k]) it[k] = a[k];
    return it;
  },
  validate(game, pl, id, target) {
    if (!BOOK_SPELLS.includes(id)) return null;
    if (id === 'legendary_artifact' && !Book.artifactsLeft(game).length) return { ok: false, why: 'Les trois artefacts légendaires de cette partie ont déjà paru.' };
    if (Book.holder(game) !== pl.id) return { ok: false, why: 'Il faut détenir le Livre de légende.' };
    if (id === 'palimpsest' && target && !Book.copyable(game, pl, game.players[target.player]).length) return { ok: false, why: 'Ce sorcier ne connaît aucun sort que vous puissiez recopier.' };
    if (id === 'erasure' && target && !Book.erasable(game, game.players[target.player]).length) return { ok: false, why: 'Ce sorcier n\'a aucun sort qu\'on puisse raturer.' };
    if (id === 'annals' && target && !pl.contact[target.player]) return { ok: false, why: 'Vous ne connaissez pas ce sorcier.' };
    if (id === 'deus_ex_machina' && (pl.bookOnce || {}).deus) return { ok: false, why: 'Deus ex machina ne s\'invoque qu\'une fois par partie.' };
    if (id === 'mise_en_abyme' && target) {
      const u = game.units[target.unit]; if (!u) return null;
      if (u.hero || u.avatar) return { ok: false, why: 'Pas sur un héros.' };
      if (u.riteDemon || u.bookGuard || u.owner !== pl.id) return { ok: false, why: 'Impossible sur cette unité.' };
      if (Units.at(game, u.plane, u.x, u.y).filter(v => v.owner === pl.id).length >= MAX_STACK) return { ok: false, why: 'La pile est pleine.' };
    }
    return null;
  },
});
// le combat sur la case du Livre se conclut ici : le vainqueur qui tient trois fragments le prend
{ const _attack = Game.attack; Game.attack = async function (game, ids, tx, ty) { const u0 = game.units[ids[0]]; const pid = u0 && u0.owner, plane = u0 && u0.plane; const r = await _attack.apply(this, arguments); if (u0 && game.book) Book.afterAttack(game, pid, plane, tx, ty); return r; }; }
