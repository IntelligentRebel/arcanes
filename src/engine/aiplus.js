'use strict';
// IA des niveaux Normale et au-delà : ce qui, mesuré dans l'arène (tests/paired.js), joue mieux que l'IA historique.
// Le niveau Facile garde l'IA historique (ai.js). Aucun niveau ne triche : tout passe par Intel.

Object.assign(AI, {
  // ---------- emplacements de cités connus, tenus à jour tous les quelques tours ----------
  // (gardé dans la partie, et donc dans la sauvegarde : une partie rechargée joue exactement comme l'autre)
  sitePlan(game, pl) {
    const c0 = pl.aiSiteCache;
    if (c0 && game.turn - c0.turn < 4) return c0.list.filter(s => Cities.canFoundAt(game, pl.id, s.plane, s.x, s.y).ok);
    const world = game.world, cands = [], seen = new Set();
    const origins = Cities.ofPlayer(game, pl.id).map(c => [c.plane, c.x, c.y]);
    for (const u of Object.values(game.units)) if (u.owner === pl.id && Units.isSettler(u)) origins.push([u.plane, u.x, u.y]);
    const R = 12;
    for (const [p, ox, oy] of origins) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = World.wx(world, ox + dx), y = oy + dy, k = p * 1e6 + y * world.w + x;
      if (y < 2 || y >= world.h - 2 || seen.has(k)) continue; seen.add(k);
      if (!Intel.knows(game, pl, p, x, y)) continue;
      if (!Cities.canFoundAt(game, pl.id, p, x, y).ok) continue;
      const info = Cities.siteInfo(game, pl.id, p, x, y);
      if (info.maxPop < 4) continue;
      cands.push({ plane: p, x, y, score: info.score, maxPop: info.maxPop });
    }
    cands.sort((a, b) => b.score - a.score);
    const list = [];
    for (const c of cands) { if (list.some(o => o.plane === c.plane && World.dist(world, o.x, o.y, c.x, c.y) < 4)) continue; list.push(c); if (list.length >= 30) break; }
    pl.aiSiteCache = { turn: game.turn, list };
    return list;
  },
  // le meilleur emplacement libre pour ce colon (ceux que visent d'autres colons sont réservés)
  siteFor(game, pl, u) {
    const world = game.world;
    const taken = Object.values(game.units).filter(o => o.owner === pl.id && o !== u && Units.isSettler(o) && o.aiTarget).map(o => o.aiTarget);
    const ok = AI.sitePlan(game, pl).filter(s => s.plane === u.plane && !AI.badSite(game, pl, s.plane, s.x, s.y) && !taken.some(t => World.dist(world, t[0], t[1], s.x, s.y) < 4)
      && !(Intel.sees(game, pl, s.plane, s.x, s.y) && Move.hostileAt(game, pl.id, s.plane, s.x, s.y)));
    const best = U.max(ok, s => s.score - World.dist(world, s.x, s.y, u.x, u.y) * 1.6);
    return best ? [best.x, best.y] : null;
  },

  // ---------- unités : force par point de coût et d'entretien (la nourriture limite le nombre d'unités) ----------
  unitValue(game, c, t, e, role) {
    const d = DATA.units[t];
    const xp = c.buildings.warCollege ? 60 : c.buildings.fightersGuild ? 20 : 0;
    const q = Units.strength(game, { type: t, ench: [], xp, weapon: Units.weaponFor(t, e.weapon), owner: c.owner, dmg: 0 });
    const cost = Cities.unitCost(game, c, t, e), up = d.upkeep || {};
    let v = q / (Math.sqrt(cost) * (1 + (up.gold || 0) * 0.5 + (up.food || 0) * 1.5 + (up.mana || 0)));
    const turns = cost / Math.max(1, e.prod);
    if (turns > 6) v /= 1 + (turns - 6) / 6;
    if (role === 'defense') v *= 1 + d.def / 12 + (d.ranged > 0 ? 0.25 : 0);
    return v;
  },
  isMilitary(t) { const d = DATA.units[t]; return !d.abilities.createOutpost && !d.abilities.construction && !d.abilities.scout && !d.sailing && (d.melee >= 2 || d.ranged >= 2); },
  bestUnit(game, c, e, role) {
    return U.max(Cities.buildableUnits(game, c).filter(AI.isMilitary), t => AI.unitValue(game, c, t, e, role));
  },
});

// ---------- Difficile et Hardcore : coalition contre le sorcier qui écrase la partie ----------
// Chaque IA juge les sorciers d'après ce qu'elle en sait (public : cités, puissance, sorts, renommée ; armée estimée).
// Quand l'un d'eux distance nettement tous les autres, joueur ou IA, les autres font front : ils se rapprochent entre eux,
// se détournent de lui, lui déclarent la guerre quand leur union pèse assez, et proposent au joueur de s'allier contre une IA qui s'envole.
Object.assign(Diplomacy, {
  _leaders: new WeakMap(),
  // le meneur aux yeux de a, et l'ampleur de son avance (0 à 1) ; null s'il n'y en a pas.
  // lead, avg : ce qu'il faut peser face au deuxième et à la moyenne des autres (la coalition : 1,4 et 1,8 ; le pacte du Démon : les siens)
  // en essai (AI.PENDING.truestanding) : la force globale de chacun connue telle qu'elle est (pas le détail : seulement le total)
  leaderFor(game, a, lead = 1.4, avg = 1.8) {
    let c0 = Diplomacy._leaders.get(a); if (!c0 || c0.turn !== game.turn) { c0 = { turn: game.turn }; Diplomacy._leaders.set(a, c0); }
    const key = lead + '|' + avg; if (key in c0) return c0[key];
    const known = game.players.filter(o => o.alive && (o.id === a.id || a.contact[o.id]));
    const exact = AI.feat(a, 'truestanding', 2) && typeof Rite !== 'undefined';
    let res = null;
    if (known.length >= 3) {
      const st = known.map(o => ({ id: o.id, v: exact ? Rite.standing(game, o) : Intel.standing(game, a, o.id) })).sort((x, y) => y.v - x.v);
      const top = st[0], second = st[1], rest = st.slice(1), mean = U.sum(rest, x => x.v) / rest.length;
      if (top.v > second.v * lead && top.v > mean * avg && game.turn > 40) res = { id: top.id, t: U.clamp((top.v / Math.max(1, second.v) - lead) / 1.2, 0.15, 1) };
    }
    c0[key] = res;
    return res;
  },
  // effets de la coalition pour une IA de niveau Difficile ou plus, à chaque tour
  coalitionTurn(game, a) {
    const L = Diplomacy.leaderFor(game, a);
    if (!L || L.id === a.id) return;
    const lead = game.players[L.id];
    // l'avance du meneur inquiète, l'ennemi commun rapproche
    // (jusqu'à -80 et +60 au plus : ce mouvement ne pardonne ni ne refroidit au-delà ce qui l'était déjà)
    { const r = a.relations[L.id] || 0; if (r > -80) { a.relations[L.id] = Math.max(-80, r - 1.5 * L.t); Diplomacy.why(game, a.id, L.id, 'coalition_lead', a.relations[L.id] - r); } }
    for (const b of game.players) if (b.alive && b.id !== a.id && b.id !== L.id && a.contact[b.id]) { const r = a.relations[b.id] || 0; if (r < 60) { a.relations[b.id] = Math.min(60, r + 1.2 * L.t); Diplomacy.why(game, a.id, b.id, 'coalition_ally', a.relations[b.id] - r); } }
    // faire la paix avec les autres pour se tourner contre lui
    for (const b of game.players) {
      if (!b.alive || b.id === a.id || b.id === L.id || !a.contact[b.id] || a.diplo[b.id] !== 'war' || b.human) continue;
      if (AI.lvl(b) >= 2 && game.rng.chance(0.25 * L.t + 0.05)) { Diplomacy.setState(game, a.id, b.id, 'peace'); Game.logEach(game, v => U.cap(Players.nameFor(game, v, a.id)) + ' et ' + Players.nameFor(game, v, b.id) + ' font la paix pour faire front contre ' + Players.nameFor(game, v, L.id) + '.'); }
    }
    // la guerre contre le meneur, quand l'union pèse assez lourd
    if (a.diplo[L.id] !== 'war' && game.turn > 50) {
      const allies = game.players.filter(b => b.alive && b.id !== L.id && (b.id === a.id || (a.contact[b.id] && a.diplo[b.id] !== 'war')));
      const exact = AI.feat(a, 'truestanding', 2);
      const union = U.sum(allies, b => b.id === a.id || exact ? Diplomacy.power(game, b) : Intel.powerOf(game, a, b.id));
      const his = exact ? Diplomacy.power(game, lead) : Intel.powerOf(game, a, L.id);
      const near = Cities.ofPlayer(game, a.id).some(m => Intel.knownCities(game, a).some(c => c.owner === L.id && c.plane === m.plane && World.dist(game.world, c.x, c.y, m.x, m.y) <= 18));
      if (near && union > his * 0.9 && game.rng.chance(0.06 + 0.12 * L.t)) {
        const st0 = a.diplo[L.id] || 'none';
        if ((st0 === 'peace' || st0 === 'alliance') && !Diplomacy.treacherous(a)) { if (!(a.denounced && a.denounced[L.id] != null)) Diplomacy.denounce(game, a.id, L.id); }
        else {
        Diplomacy.declareWar(game, a.id, L.id, -20);
        Game.log(game, L.id, a.name + ' vous déclare la guerre : votre avance l\'inquiète' + (lead.human ? ', et d\'autres sorciers pourraient suivre.' : '.'), { diplo: a.id, alert: true });
        Game.logEach(game, v => v === L.id || v === a.id ? null : U.cap(Players.nameFor(game, v, a.id)) + ' déclare la guerre à ' + Players.nameFor(game, v, L.id) + ', qui écrase la partie.');
        }
      }
    }
    // proposer au joueur une alliance contre une IA qui s'envole
    const h = game.players.find(b => b.human && b.alive);
    if (h && h.id !== L.id && !lead.human && a.contact[h.id] && a.diplo[h.id] !== 'war' && a.diplo[h.id] !== 'alliance' && !Diplomacy.offerFrom(game, h, a.id) && (a.relations[h.id] || 0) > -20) {
      const ask = (a.allyAsk = a.allyAsk || {});
      if (game.turn - (ask[h.id] || -99) >= 25 && game.rng.chance(0.1 * L.t + 0.02)) {
        ask[h.id] = game.turn;
        Diplomacy.offer(game, h, { from: a.id, kind: 'alliance', turn: game.turn, against: L.id });
        Game.log(game, h.id, a.name + ' vous propose une alliance contre ' + Players.nameFor(game, h.id, L.id) + ', qui écrase la partie.', { diplo: a.id, offer: true });
      }
    }
  },
});

// ---------- économie magique et héros (dès Normale) ----------
Object.assign(AI, {
  // les objets du coffre vont aux héros : d'abord dans un emplacement libre, sinon à la place d'un objet moins précieux
  equipHeroes(game, pl) {
    if (!pl.vault || !pl.vault.length) return;
    const heroes = Object.values(game.units).filter(u => u.owner === pl.id && u.hero && u.items).sort((a, b) => Units.strength(game, b) - Units.strength(game, a));
    for (let i = pl.vault.length - 1; i >= 0; i--) {
      const it = pl.vault[i]; if (!it) continue;
      const h = heroes.find(u => Items.canEquip(u, it) && Items.freeSlot(u, it) >= 0);
      if (h) { h.items[Items.freeSlot(h, it)] = it; pl.vault.splice(i, 1); continue; }
      let done = false;
      for (const u of heroes) {
        const slots = u.hero.slots || [];
        for (let k = 0; k < slots.length && !done; k++) {
          const cur = u.items[k];
          if (cur && Items.slotAccepts(slots[k], it, u) && (cur.value || 0) < (it.value || 0)) { u.items[k] = it; pl.vault[i] = cur; done = true; Units.fixHp(game, u); }   // (un objet à PV retiré ne laisse pas le héros à 0 PV)
        }
        if (done) break;
      }
    }
  },
});

// ---------- Difficile et Hardcore : l'assaut de la légende d'un héros ----------
// Dès que l'emplacement de la légende d'un de ses héros est connu, l'IA juge par simulation (tous les 3 tours) si le héros et
// ses meilleures troupes libres l'emporteraient sur les gardiens. Si oui, elle engage ce groupe : rassemblement à côté du
// repaire, puis assaut quand tout le monde est là et que la simulation le confirme. Sinon, ses cités lèvent davantage de
// soldats. Un rassemblement qui traîne plus de 15 tours est abandonné pour 20 tours.
Object.assign(AI, {
  legendPlan(game, pl) {
    let L = pl.aiLegend;
    if (L) {
      const h = game.units[L.hero], s = game.sites[L.site], q = h && h.hero && h.hero.quest;
      if (!h || h.owner !== pl.id || !q || q.done || q.site !== L.site || !s || !Game.siteHasGuardians(s) || h.plane !== s.plane) L = pl.aiLegend = null;
    }
    if (!L && (pl.aiLegendCool || 0) <= game.turn) {
      const heroes = Object.values(game.units).filter(u => {
        if (u.owner !== pl.id || !u.hero || u.status === 'governor') return false;
        const q = u.hero.quest, s = q && q.type === 'legend' && !q.done && q.stage >= 3 ? game.sites[q.site] : null;
        return s && s.plane === u.plane && Game.siteHasGuardians(s);
      });
      const h = U.min(heroes, u => World.dist(game.world, u.x, u.y, game.sites[u.hero.quest.site].x, game.sites[u.hero.quest.site].y));
      if (h) L = pl.aiLegend = { hero: h.id, site: h.hero.quest.site, phase: 'build' };
    }
    return L;
  },
  legendDrop(pl, cool) { pl.aiLegend = null; pl.aiLegendCool = cool; },
  // les unités engagées dans l'assaut (à retirer des opérations ordinaires)
  async legendUnits(game, pl) {
    const L = AI.legendPlan(game, pl); if (!L) return new Set();
    const world = game.world, h = game.units[L.hero], s = game.sites[L.site];
    const guards = AI.defendersAt(game, pl.id, s.plane, s.x, s.y);
    const need = AI.feat(pl, 'bold', 3) ? 0.55 : 0.6, info = { plane: s.plane, x: s.x, y: s.y, site: s };
    if (L.phase === 'build') {
      // une cité menacée passe avant la légende ; on ne refait le calcul que tous les 3 tours
      if (game.turn - (L.check || -99) < 3 || Cities.ofPlayer(game, pl.id).some(c => AI.threatNear(game, pl, c) > 0)) return new Set();
      const free = Object.values(game.units).filter(u => u.owner === pl.id && u !== h && u.plane === s.plane && u.aiRole !== 'garrison' && u.aiEscort == null && u.status !== 'governor'
        && AI.isSoldier(game, u) && World.dist(world, u.x, u.y, s.x, s.y) <= 30);
      const force = [h].concat(free.sort((a, b) => Units.strength(game, b) - Units.strength(game, a)).slice(0, MAX_STACK - 1));
      L.win = AI.simulate(game, force, guards, info, 6); L.check = game.turn;
      if (L.win < need) return new Set();
      const g = AI.stagingTile(game, pl, h, s.x, s.y);
      if (!g || !Move.findPath(game, [h], s.plane, g[0], g[1])) { AI.legendDrop(pl, game.turn + 40); return new Set(); }
      Object.assign(L, { phase: 'gather', members: force.map(u => u.id), gatherSince: game.turn, at: g });
    }
    // rassemblement puis assaut : le groupe engagé ne change plus (seuls les morts en sortent)
    const members = L.members.map(id => game.units[id]).filter(u => u && u.owner === pl.id && u.plane === s.plane);
    const fort = game.cities[pl.fortress];
    if (game.turn - L.gatherSince > 15 || (fort && AI.threatNear(game, pl, fort) > 0)) { AI.legendDrop(pl, game.turn + 20); return new Set(); }
    let g = L.at;
    if (!g || Move.hostileAt(game, pl.id, s.plane, g[0], g[1])) g = L.at = AI.stagingTile(game, pl, h, s.x, s.y);
    if (!g) return new Set();
    for (const u of members) if (game.units[u.id] && u.moves > 0 && (u.x !== g[0] || u.y !== g[1])) await Game.moveGroup(game, [u.id], g[0], g[1], { noAttack: true });
    const here = members.filter(u => game.units[u.id] && u.x === g[0] && u.y === g[1]);
    if (here.length === members.filter(u => game.units[u.id]).length && here.every(u => u.moves > 0)) {
      const win = AI.simulate(game, here, guards, info, 6);
      if (win >= need) { L.phase = 'assault'; await Game.moveGroup(game, here.map(u => u.id), s.x, s.y); }
      else if (win < need - 0.25) { AI.legendDrop(pl, game.turn + 10); return new Set(); }
    }
    return new Set(members.map(u => u.id));
  },
});

// ---------- Difficile et Hardcore : la prise d'une tour de magie, porte de l'autre plan ----------
// Tant qu'aucune tour dégagée n'est connue sur son plan d'origine, l'IA vise la tour connue la plus facile à prendre près de
// ses cités. Même mécanique que l'assaut d'une légende : simulation tous les 3 tours avec ses meilleures troupes libres,
// cités qui lèvent davantage de soldats en attendant, rassemblement à côté de la tour, assaut si la simulation le confirme.
Object.assign(AI, {
  guardStrength(game, s) { return U.sum(s.guardians || [], t => Units.strength(game, { type: t, ench: [], xp: 0, owner: -1, dmg: 0 })); },
  portalPlan(game, pl) {
    let P = pl.aiPortal;
    if (P) { const s = game.sites[P.site]; if (!s || !Game.siteHasGuardians(s) || s.plane !== pl.plane) P = pl.aiPortal = null; }
    // en préparation, la cible est revue à chaque calcul : une tour plus facile a pu être découverte
    if ((P && (P.phase !== 'build' || game.turn - (P.check || -99) < 3)) || (pl.aiPortalCool || 0) > game.turn || game.turn < AI.TRIP_TURN - 10) return P;
    const world = game.world, home = pl.plane;
    const cities = Cities.ofPlayer(game, pl.id).filter(c => c.plane === home);
    if (!cities.length || AI.sealed(game)) return pl.aiPortal = null;
    const towers = game.sites.filter(s => s.type === 'tower' && s.plane === home && Intel.knows(game, pl, home, s.x, s.y));
    if (towers.some(s => s.cleared)) return pl.aiPortal = null;   // la porte est déjà ouverte
    const near = s => Math.min(...cities.map(c => World.dist(world, c.x, c.y, s.x, s.y)));
    const t = U.min(towers.filter(s => Game.siteHasGuardians(s) && near(s) <= 25), s => AI.guardStrength(game, s) * (1 + near(s) / 20));
    if (!t) return pl.aiPortal = null;
    if (!P || P.site !== t.id) P = pl.aiPortal = { site: t.id, phase: 'build', check: P && P.check };
    return P;
  },
  portalDrop(pl, cool) { pl.aiPortal = null; pl.aiPortalCool = cool; },
  async portalUnits(game, pl, busy) {
    const P = AI.portalPlan(game, pl); if (!P) return new Set();
    const world = game.world, s = game.sites[P.site];
    const guards = AI.defendersAt(game, pl.id, s.plane, s.x, s.y);
    const need = AI.feat(pl, 'bold', 3) ? 0.55 : 0.6, info = { plane: s.plane, x: s.x, y: s.y, site: s };
    if (P.phase === 'build') {
      if (game.turn - (P.check || -99) < 3 || Cities.ofPlayer(game, pl.id).some(c => AI.threatNear(game, pl, c) > 0)) return new Set();
      const free = Object.values(game.units).filter(u => u.owner === pl.id && u.plane === s.plane && u.aiRole !== 'garrison' && u.aiEscort == null && u.status !== 'governor'
        && !(busy && busy.has(u.id)) && AI.isSoldier(game, u) && World.dist(world, u.x, u.y, s.x, s.y) <= 30);
      const force = free.sort((a, b) => Units.strength(game, b) - Units.strength(game, a)).slice(0, MAX_STACK);
      P.check = game.turn;
      if (force.length < 3) return new Set();
      P.win = AI.simulate(game, force, guards, info, 6);
      if (P.win < need) return new Set();
      const g = AI.stagingTile(game, pl, force[0], s.x, s.y);
      if (!g || !Move.findPath(game, [force[0]], s.plane, g[0], g[1])) { AI.portalDrop(pl, game.turn + 40); return new Set(); }
      Object.assign(P, { phase: 'gather', members: force.map(u => u.id), gatherSince: game.turn, at: g });
    }
    const members = P.members.map(id => game.units[id]).filter(u => u && u.owner === pl.id && u.plane === s.plane);
    const fort = game.cities[pl.fortress];
    if (!members.length || game.turn - P.gatherSince > 15 || (fort && AI.threatNear(game, pl, fort) > 0)) { AI.portalDrop(pl, game.turn + 20); return new Set(); }
    let g = P.at;
    if (!g || Move.hostileAt(game, pl.id, s.plane, g[0], g[1])) g = P.at = AI.stagingTile(game, pl, members[0], s.x, s.y);
    if (!g) return new Set();
    for (const u of members) if (game.units[u.id] && u.moves > 0 && (u.x !== g[0] || u.y !== g[1])) await Game.moveGroup(game, [u.id], g[0], g[1], { noAttack: true });
    const here = members.filter(u => game.units[u.id] && u.x === g[0] && u.y === g[1]);
    if (here.length === members.filter(u => game.units[u.id]).length && here.every(u => u.moves > 0)) {
      const win = AI.simulate(game, here, guards, info, 6);
      if (win >= need) { P.phase = 'assault'; await Game.moveGroup(game, here.map(u => u.id), s.x, s.y); }
      else if (win < need - 0.25) { AI.portalDrop(pl, game.turn + 10); return new Set(); }
    }
    return new Set(members.map(u => u.id));
  },
});

// ---------- Difficile et Hardcore : l'expédition vers l'autre plan ----------
// Une tour dégagée près de ses cités, aucune autre expédition en cours : l'IA réunit ses meilleures troupes libres sur la tour
// (au moins 4 unités et une force suffisante), puis elles passent ensemble sur l'autre plan. Là-bas, AI.planeTrip les mène.
Object.assign(AI, {
  sealed(game) { return game.players.some(o => o.alive && o.globals.includes('planar_seal')); },   // Sceau planaire : nul ne change de plan
  async tripUnits(game, pl, busy) {
    const world = game.world, home = pl.plane;
    if (AI.sealed(game)) { if (pl.aiTrip) { pl.aiTrip = null; pl.aiTripCool = game.turn + 5; } return new Set(); }
    const mineOn = p => Cities.ofPlayer(game, pl.id).some(c => c.plane === p);
    let T = pl.aiTrip;
    if (T) {
      const s = game.sites[T.site];
      const members = T.members.map(id => game.units[id]).filter(u => u && u.owner === pl.id && u.plane === home);
      const fort = game.cities[pl.fortress];
      if (!s || !s.cleared || members.length < 3 || game.turn - T.since > 15 || (fort && AI.threatNear(game, pl, fort) > 0)) { pl.aiTrip = null; pl.aiTripCool = game.turn + 15; return new Set(); }
      for (const u of members) if (u.moves > 0 && (u.x !== s.x || u.y !== s.y)) await Game.moveGroup(game, [u.id], s.x, s.y, { noAttack: true });
      const here = members.filter(u => game.units[u.id] && u.x === s.x && u.y === s.y);
      if (here.length === members.filter(u => game.units[u.id]).length && Game.planeShift(game, here.map(u => u.id)).ok) {
        pl.aiTrip = null; pl.aiTripCool = game.turn + AI.TRIP_COOL;
        return new Set(here.map(u => u.id));
      }
      return new Set(members.map(u => u.id));
    }
    if (game.turn < AI.TRIP_TURN || (pl.aiTripCool || 0) > game.turn || !mineOn(home)) return new Set();
    // une seule expédition à la fois : des soldats déjà sur un plan sans cité à soi
    if (Object.values(game.units).some(u => u.owner === pl.id && u.plane !== home && AI.isSoldier(game, u) && !mineOn(u.plane))) return new Set();
    if (Cities.ofPlayer(game, pl.id).some(c => AI.threatNear(game, pl, c) > 0)) return new Set();
    const cities = Cities.ofPlayer(game, pl.id).filter(c => c.plane === home);
    const near = s => Math.min(...cities.map(c => World.dist(world, c.x, c.y, s.x, s.y)));
    const tower = U.min(game.sites.filter(s => s.type === 'tower' && s.plane === home && s.cleared && Intel.knows(game, pl, home, s.x, s.y) && near(s) <= 25), near);
    if (!tower || Move.hostileAt(game, pl.id, home, tower.x, tower.y)) return new Set();
    const free = Object.values(game.units).filter(u => u.owner === pl.id && u.plane === home && u.aiRole !== 'garrison' && u.aiEscort == null && u.status !== 'governor'
      && !busy.has(u.id) && AI.isSoldier(game, u) && World.dist(world, u.x, u.y, tower.x, tower.y) <= 30);
    const force = free.sort((a, b) => Units.strength(game, b) - Units.strength(game, a)).slice(0, MAX_STACK - 1);
    if (force.length < 4 || U.sum(force, u => Units.strength(game, u)) < AI.TRIP_POWER) return new Set();
    pl.aiTrip = { site: tower.id, members: force.map(u => u.id), since: game.turn };
    return AI.tripUnits(game, pl, busy);
  },
});
