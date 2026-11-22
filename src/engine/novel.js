'use strict';
// (0.31.73) Sorts inédits d'Arcanes : Réveil du charnier, Ennemi juré, Le Glas, Démence contagieuse, Trêve de Dieu,
// Grande Inversion (Livre de légende), Bête déchaînée, Dette de sang, Nœud-piège.
// Chaque sort a ici sa règle, et l'IA qui s'en sert (désactivable au banc : no_novel).

const Novel = {
  // ---------- Réveil du charnier : la carte garde ses morts ----------
  // les figurines tombées sur chaque case { "p,x,y": { n, hero, t } } ; le sort les relève en morts-vivants
  GRAVE_MIN: 12,      // au-dessous, rien à relever
  GRAVE_PER_UNIT: 6,  // une unité relevée pour six figurines tombées
  graveKey(p, x, y) { return p + ',' + x + ',' + y; },
  grave(game, p, x, y) { const g = game.graves && game.graves[Novel.graveKey(p, x, y)]; return g && g.n > 0 ? g : null; },
  recordGraves(game, battle, res, info) {
    let n = 0, hero = false;
    for (const b of battle.units) {
      if (b.temp || b.u.combatOnly) continue;
      const f0 = Math.max(1, Units.stats(game, b.u).figures || 1);
      const lost = b.dead ? f0 : Math.max(0, f0 - battle.figures(b));
      n += lost;
      if (b.dead && b.u.hero) hero = true;
    }
    if (!n) return;
    const k = Novel.graveKey(info.plane, info.tx, info.ty), gs = game.graves || (game.graves = {}), g = gs[k] || (gs[k] = { n: 0 });
    g.n = Math.min(999, g.n + n); g.t = game.turn; if (hero) g.hero = true;
  },
  // ce que le charnier relèverait : des zombies et des squelettes, une goule sur trois ; un spectre si un héros y est tombé
  charnelArmy(game, g, room) {
    if (!g || g.n < Novel.GRAVE_MIN) return [];
    const out = [];
    if (g.hero && room > 0) out.push('Wraith');
    const n = Math.min(room - out.length, Math.floor(g.n / Novel.GRAVE_PER_UNIT));
    for (let i = 0; i < n; i++) out.push(i % 3 === 2 ? 'Ghoul' : i % 2 ? 'Skeleton' : 'Zombie');
    return out;
  },
  charnelWhy(game, pl, t) {
    const w = game.world, p = t.plane, x = World.wx(w, t.x), y = t.y;
    const g = Novel.grave(game, p, x, y);
    if (!g || g.n < Novel.GRAVE_MIN) return 'Il faut un charnier : une case où sont tombées au moins ' + Novel.GRAVE_MIN + ' figurines.';
    if (!Spells.sees(game, pl, p, x, y)) return 'Il faut voir la case.';
    if (World.isWaterAt(w, p, x, y)) return 'Les morts de la mer ne se relèvent pas.';
    const c = Cities.at(game, p, x, y); if (c && c.owner !== pl.id) return 'Impossible sous les murs d\'une cité qui n\'est pas à vous.';
    const here = Units.at(game, p, x, y);
    if (here.some(u => u.owner !== pl.id)) return 'Des troupes étrangères se tiennent sur le charnier.';
    if (here.length >= MAX_STACK) return 'Votre pile est déjà pleine.';
    return null;
  },

  // ---------- Ennemi juré ----------
  // un héros rival qu'on voit en ce moment, ou qu'on a déjà combattu
  swornFoes(game, pl, hero) {
    const met = pl.metHeroes || {};
    return Object.values(game.units).filter(u => u.hero && u.owner >= 0 && u.owner !== pl.id && game.players[u.owner] && u.sworn == null && !u.riteDemon
      && !Spells.treaty(game, pl, u.owner) && (met[u.id] || Spells.sees(game, pl, u.plane, u.x, u.y)) && !(typeof Intel !== 'undefined' && Intel.hiddenFrom(game, pl.id, u)) && (!hero || hero.id !== u.id));
  },
  swornHeroes(game, pl) { return Object.values(game.units).filter(u => u.owner === pl.id && u.hero && u.sworn == null && !u.avatar); },
  swornWhy(game, pl, t) {
    const a = t && game.units[t.unit], b = t && game.units[t.foe];
    if (!a || a.owner !== pl.id || !a.hero) return 'Choisissez un de vos héros.';
    if (a.sworn != null) return 'Ce héros a déjà juré la perte d\'un autre.';
    if (!b) return 'Choisissez le héros rival.';
    if (!Novel.swornFoes(game, pl, a).includes(b)) return 'Ce héros rival n\'est plus à votre portée.';
    return null;
  },
  // au combat : le héros face à son ennemi juré frappe plus fort, et l'autre aussi
  swornSetup(bt) {
    let m = null;
    for (const b of bt.units) {
      if (b.u.sworn == null) continue;
      const f = bt.units.find(o => o.side !== b.side && o.u.id === b.u.sworn);
      if (f) (m || (m = new Map())).set(b, f);
    }
    bt.swornFoe = m;
    if (m) for (const [b, f] of m) if (b.side === DEF_SIDE) bt.say(bt.name(b) + ' et ' + bt.name(f) + ' se retrouvent face à face : chacun a juré la perte de l\'autre.');
  },
  SWORN_BONUS: 3,
  swornAfter(game, battle, res) {
    if (!battle.swornFoe) return;
    const dead = new Set(res.killed[0].concat(res.killed[1]).map(u => u.id));
    for (const [b, f] of battle.swornFoe) {
      if (dead.has(b.u.id) || !dead.has(f.u.id) || !game.units[b.u.id]) continue;
      const u = b.u, v = f.u, pl = game.players[u.owner];
      // un niveau : l'expérience qui manque pour le suivant
      const li = Units.levelIndex(game, u), next = HERO_LEVELS[li + 1];
      if (next) Units.addXp(game, u, Math.max(1, next.xp - (u.xp || 0)));
      // le plus précieux de ses objets : dans une main libre, sinon au coffre
      const items = (v.items || []).filter(Boolean), it = U.max(items, x => x.value || 0);
      let where = null;
      if (it) {
        v.items[v.items.indexOf(it)] = null;
        const slot = Items.freeSlot(u, it);
        if (slot >= 0) { u.items[slot] = it; where = 'equip'; } else if (pl) { (pl.vault = pl.vault || []).push(it); where = 'vault'; }
      }
      delete u.sworn;
      if (pl) Game.log(game, pl.id, 'Ennemi juré : ' + u.hero.name + ' a abattu ' + v.hero.name + ' et gagne un niveau.' + (it ? ' ' + U.cap(it.name) + (where === 'vault' ? ' rejoint votre coffre.' : ' passe entre ses mains.') : ''), { unit: u.id, alert: !!pl.human });
      const vp = game.players[v.owner];
      if (vp) Game.log(game, vp.id, 'Ennemi juré : ' + v.hero.name + ' a péri sous les coups de ' + u.hero.name + '.', { x: battle.x, y: battle.y, plane: battle.plane });
    }
  },

  // ---------- Trêve de Dieu ----------
  // tant qu'elle dure, aucune bataille sur son plan un tour sur deux, à commencer par celui où elle est lancée
  truceOf(game, plane) {
    for (const o of game.players) if (o.alive && o.globals.includes('truce_of_god') && o.truce && o.truce.plane === plane && game.turn < o.truce.until) return o;
    return null;
  },
  truceDay(game, plane) { const o = Novel.truceOf(game, plane); return !!o && (game.turn - o.truce.from) % 2 === 0; },
  truceWhy(game, plane) { return Novel.truceDay(game, plane) ? 'Trêve de Dieu : aucune bataille ce tour-ci sur ce plan. Elle reprend ses droits un tour sur deux.' : null; },
  TRUCE_TURNS: 10,

  // ---------- Grande Inversion ----------
  INV_R: 3, INV_DELAY: 5,
  invTiles(game, x, y) {
    const w = game.world, out = [];
    for (let dy = -Novel.INV_R; dy <= Novel.INV_R; dy++) for (let dx = -Novel.INV_R; dx <= Novel.INV_R; dx++) if (World.inY(w, y + dy)) out.push([World.wx(w, x + dx), y + dy]);
    return out;
  },
  invWhy(game, pl, t) {
    if (game.inversion) return 'Une Grande Inversion est déjà en marche.';
    if (!t || t.x == null) return 'Choisissez une case.';
    const ks = new Set(Novel.invTiles(game, World.wx(game.world, t.x), t.y).map(([x, y]) => x + ',' + y));
    const fort = Object.values(game.cities).find(c => ks.has(c.x + ',' + c.y) && (c.fortress || game.players.some(o => o.fortress === c.id)));
    if (fort) return 'Une forteresse se dresse dans la région (' + fort.name + ') : les deux mondes refusent de l\'échanger.';
    return null;
  },
  // ce que la région emporterait, sur les deux plans : les cités et les unités
  invContents(game, x, y) {
    const ks = new Set(Novel.invTiles(game, x, y).map(([a, b]) => a + ',' + b));
    return { cities: Object.values(game.cities).filter(c => ks.has(c.x + ',' + c.y)), units: Object.values(game.units).filter(u => ks.has(u.x + ',' + u.y)) };
  },
  invAnnounce(game, pl, x, y, plane) {
    const at = game.turn + Novel.INV_DELAY;
    game.inversion = { x, y, plane, at, by: pl.id };
    const near = () => { const c = U.min(Object.values(game.cities).filter(c => c.plane === plane), c => World.dist(game.world, c.x, c.y, x, y)); return c && World.dist(game.world, c.x, c.y, x, y) <= 6 ? c : null; };
    for (const o of game.players) if (o.alive && o !== pl) {
      const c = near(), cn = c && Intel.knows(game, o, c.plane, c.x, c.y) ? c.name : null;
      Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a lancé la Grande Inversion : dans ' + U.n(Novel.INV_DELAY, 'tour') + ', une région de 7 × 7 cases' + (cn ? ' autour de ' + cn : '') + ' changera de monde avec celle qui lui fait face.', { x, y, plane, alert: true, player: pl.id, spell: 'great_inversion' });
    }
  },
  // l'échange : chaque case de la région prend la place de sa jumelle de l'autre plan, avec tout ce qu'elle porte
  invPerform(game) {
    const inv = game.inversion; if (!inv) return;
    game.inversion = null;
    const w = game.world, W = w.w, tiles = Novel.invTiles(game, inv.x, inv.y), ks = new Set(tiles.map(([x, y]) => x + ',' + y));
    const P0 = w.planes[0], P1 = w.planes[1];
    for (const f of ['terr', 'mineral', 'road', 'corrupt', 'owner', 'ownerCity', 'site', 'river']) for (const [x, y] of tiles) { const i = y * W + x, a = P0[f][i]; P0[f][i] = P1[f][i]; P1[f][i] = a; }
    for (const [x, y] of tiles) { const k = x + ',' + y, a = P0.roadWork[k], b = P1.roadWork[k]; delete P0.roadWork[k]; delete P1.roadWork[k]; if (b != null) P0.roadWork[k] = b; if (a != null) P1.roadWork[k] = a; }
    // les rivières : pas de lit qui se poursuive dans l'autre monde (les liaisons qui franchissent le bord de la région sont coupées)
    const DIR = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];
    for (const P of [P0, P1]) for (const [x, y] of tiles) for (const [dx, dy, bit, back] of DIR) {
      const nx = World.wx(w, x + dx), ny = y + dy; if (!World.inY(w, ny) || ks.has(nx + ',' + ny)) continue;
      P.river[y * W + x] &= ~bit; P.river[ny * W + nx] &= ~back;
    }
    const flip = o => { if (o && ks.has(o.x + ',' + o.y)) { o.plane = 1 - o.plane; return true; } return false; };
    for (const s of game.sites) flip(s);
    const moved = [];
    for (const c of Object.values(game.cities)) if (flip(c)) moved.push(c);
    for (const u of Object.values(game.units)) if (flip(u)) { u.path = null; u.dest = null; u.halted = false; if (u.status === 'goto') u.status = ''; }
    if (game.book) flip(game.book);
    // les charniers, les cartes et les rapports suivent leurs cases
    const swapKeys = obj => { if (!obj) return; for (const [x, y] of tiles) { const a = obj['0,' + x + ',' + y], b = obj['1,' + x + ',' + y]; delete obj['0,' + x + ',' + y]; delete obj['1,' + x + ',' + y]; if (b !== undefined) obj['0,' + x + ',' + y] = b; if (a !== undefined) obj['1,' + x + ',' + y] = a; } };
    swapKeys(game.graves);
    for (const o of game.players) {
      if (o.explored) for (const [x, y] of tiles) { const i = y * W + x, a = o.explored[0][i]; o.explored[0][i] = o.explored[1][i]; o.explored[1][i] = a; }
      swapKeys(o.intel);
      if (o.aiTargetCity && ks.has(o.aiTargetCity.x + ',' + o.aiTargetCity.y)) o.aiTargetCity = Object.assign({}, o.aiTargetCity, { plane: 1 - o.aiTargetCity.plane });
      if (o.volcanoTiles) o.volcanoTiles = o.volcanoTiles.map(k => { const [p, x, y] = k.split(',').map(Number); return ks.has(x + ',' + y) ? (1 - p) + ',' + x + ',' + y : k; });
    }
    game._intelStamp = (game._intelStamp || 0) + 1;
    Cities.updateTerritory(game);
    for (const c of moved) { Cities.resetFarmers && Cities.resetFarmers(game, c); }
    for (const p of [0, 1]) for (const [x, y] of tiles) Game.drownStranded && Game.drownStranded(game, p, x, y);
    const by = game.players[inv.by], n = moved.length;
    for (const o of game.players) if (o.alive) {
      const mine = moved.filter(c => c.owner === o.id);
      const txt = 'La Grande Inversion : la région ' + (o.id === inv.by ? 'que vous aviez désignée' : 'désignée par ' + Players.nameFor(game, o.id, inv.by)) + ' a changé de monde avec sa jumelle'
        + (n ? ', emportant ' + U.n(n, 'cité') + (mine.length ? ', dont ' + (mine.length > 1 ? U.n(mine.length, 'des vôtres', 'des vôtres') : 'une des vôtres') : '') : '') + '.';
      Game.log(game, o.id, txt, { x: inv.x, y: inv.y, plane: 1 - inv.plane, alert: true, event: o.human ? 'great_inversion' : undefined });
    }
    if (typeof Chronicle !== 'undefined') try { Chronicle.note(game, 'global', { a: inv.by, s: 'great_inversion', pub: true }); } catch (e) { /* la chronique est un luxe */ }
    if (Game.hooks.update) Game.hooks.update({ type: 'inversion' });
  },

  // ---------- Bête déchaînée ----------
  BEAST: 'GreatDrake', BEAST_TURNS: 10,
  beastWhy(game, pl, t) {
    const w = game.world, p = t.plane, x = World.wx(w, t.x), y = t.y;
    if (!Spells.sees(game, pl, p, x, y)) return 'Il faut voir la case.';
    if (Units.at(game, p, x, y).length || Cities.at(game, p, x, y) || World.get(w, p, 'site', x, y) >= 0) return 'Il faut une case libre : ni troupes, ni cité, ni lieu.';
    return null;
  },
  // la proie : l'armée ou la cité de sorcier la plus proche, à qui qu'elle soit (son invocateur compris)
  beastPrey(game, u0) {
    const w = game.world;
    let best = null, bd = Infinity;
    for (const c of Object.values(game.cities)) { if (c.owner < 0 || c.plane !== u0.plane) continue; const d = World.dist(w, c.x, c.y, u0.x, u0.y); if (d < bd) { bd = d; best = { x: c.x, y: c.y, city: c }; } }
    for (const u of Object.values(game.units)) { if (u.owner < 0 || u.plane !== u0.plane || u.riteDemon || Cities.at(game, u.plane, u.x, u.y)) continue; const d = World.dist(w, u.x, u.y, u0.x, u0.y); if (d < bd) { bd = d; best = { x: u.x, y: u.y, owner: u.owner }; } }
    return best;
  },
  async beastAct(game, units) {
    const u0 = units[0];
    if (game.turn >= u0.beast.until) {
      for (const o of game.players) if (o.alive && (o.id === u0.beast.by || Intel.sees(game, o, u0.plane, u0.x, u0.y))) Game.log(game, o.id, 'La Bête déchaînée s\'est éteinte.', { x: u0.x, y: u0.y, plane: u0.plane, minor: o.id !== u0.beast.by });
      for (const u of units) Units.remove(game, u);
      return true;
    }
    const prey = Novel.beastPrey(game, u0);
    if (!prey) return true;
    const owner = prey.city ? prey.city.owner : prey.owner;
    if (game.players[owner] && u0.beastWarned !== owner + ':' + prey.x + ',' + prey.y && World.dist(game.world, prey.x, prey.y, u0.x, u0.y) > 1) {
      u0.beastWarned = owner + ':' + prey.x + ',' + prey.y;
      Game.log(game, owner, 'La Bête déchaînée fond sur ' + (prey.city ? prey.city.name : 'une de vos armées') + ' !', { x: prey.x, y: prey.y, plane: u0.plane, alert: true });
    }
    for (const u of units) u.attackOrder = true;
    await Game.moveGroup(game, units.map(u => u.id), prey.x, prey.y, { auto: false });
    return true;
  },

  // ---------- Dette de sang ----------
  debtLoan(game, pl) { return 10 * Math.max(10, Magic.split(game, pl).mana); },
  DEBT_TURNS: 15, DEBT_RATE: 1.5,
  payDebt(game, pl) {
    const d = pl.debt; if (!d) return;
    const due = Math.min(d.left, d.per);
    if (pl.mana >= due) { pl.mana -= due; d.left -= due; }
    else {
      const paid = Math.max(0, pl.mana); pl.mana -= paid; d.left -= paid;
      // le reste de l'échéance : une créature invoquée déserte (elle paie pour vous) ; sans créature, l'échéance reste due
      const mine = Object.values(game.units).filter(u => u.owner === pl.id && !u.hero && !u.avatar && Units.isFantastic(u) && Units.upkeep(game, u).mana > 0);
      const u = U.max(mine, u => Units.upkeep(game, u).mana);
      if (u) {
        d.left -= due - paid;
        u.owner = -1; u.rampage = true; u.status = ''; u.path = null; u.dest = null;
        Game.log(game, pl.id, 'Dette de sang : faute de mana, ' + Units.subj(u, 'déserte') + ' pour solder l\'échéance.', { x: u.x, y: u.y, plane: u.plane, alert: !!pl.human });
      }
    }
    if (d.left <= 0) { pl.debt = null; Game.log(game, pl.id, 'Dette de sang : vous ne devez plus rien au prêteur.', { minor: !pl.human }); }
  },

  // ---------- Nœud-piège ----------
  trapWhy(game, pl, t) {
    const si = World.get(game.world, t.plane, 'site', World.wx(game.world, t.x), t.y), s = si >= 0 ? game.sites[si] : null;
    if (!s || s.type !== 'node') return 'Il faut viser un nœud.';
    if (s.owner !== pl.id) return 'Il faut un de vos nœuds.';
    if (s.trap === pl.id) return 'Ce nœud est déjà piégé.';
    return null;
  },
  // un esprit rival tente de fusionner avec un nœud piégé : il est détruit, son maître perd du mana
  TRAP_MANA: 75,
  trapHit(game, u, s) {
    if (s.trap == null) return null;
    if (s.owner !== s.trap) { delete s.trap; return null; }
    if (u.owner === s.trap) return null;
    const owner = s.trap, pl = game.players[u.owner];
    delete s.trap;
    Units.remove(game, u);
    const lost = pl ? Math.min(Math.max(0, pl.mana), Novel.TRAP_MANA) : 0; if (pl) pl.mana -= lost;
    if (game.players[owner]) Game.log(game, owner, 'Nœud-piège : un esprit ' + U.de(Players.nameFor(game, owner, u.owner)) + ' a voulu prendre le ' + Game.siteName(s) + ' ; le piège l\'a détruit.', { x: s.x, y: s.y, plane: s.plane, alert: true });
    return { ok: true, failed: true, why: 'Un piège caché dans le nœud a détruit votre esprit' + (lost ? ' (−' + lost + ' mana)' : '') + '.' };
  },

  // ---------- fin de tour ----------
  tick(game) {
    for (const o of game.players) if (o.truce && (game.turn + 1 >= o.truce.until || !o.globals.includes('truce_of_god'))) {
      if (o.globals.includes('truce_of_god')) {
        o.globals = o.globals.filter(g => g !== 'truce_of_god');
        for (const v of game.players) if (v.alive && (v === o || v.contact[o.id])) Game.log(game, v.id, 'La Trêve de Dieu prend fin.', { spell: 'truce_of_god', minor: v !== o });
      }
      o.truce = null;
    }
    if (game.inversion && game.turn + 1 >= game.inversion.at) Novel.invPerform(game);
  },
};

// ---------- les sorts hors combat ----------
Object.assign(OVERLAND_HANDLERS, {
  charnel_rising(game, pl, t) {
    const w = game.world, p = t.plane, x = World.wx(w, t.x), y = t.y;
    const why = Novel.charnelWhy(game, pl, t); if (why) return { ok: false, why };
    const g = Novel.grave(game, p, x, y), room = MAX_STACK - Units.at(game, p, x, y).length;
    const types = Novel.charnelArmy(game, g, room);
    if (!types.length) return { ok: false, why: 'Le charnier ne relèverait personne ici.' };
    for (const ty of types) { const u = Units.create(game, ty, pl.id, p, x, y, { undead: true }); u.moves = 0; }
    delete game.graves[Novel.graveKey(p, x, y)];
    Move.reveal(game, pl, p, x, y, 1);
    return { msg: 'Réveil du charnier : ' + U.tally(types.map(ty => DATA.units[ty].name)) + ' se relèvent.' };
  },
  sworn_enemy(game, pl, t) {
    const why = Novel.swornWhy(game, pl, t); if (why) return { ok: false, why };
    const a = game.units[t.unit], b = game.units[t.foe];
    a.sworn = b.id; b.sworn = a.id;
    const bo = game.players[b.owner];
    if (bo) Game.log(game, bo.id, U.cap(Players.nameFor(game, bo.id, pl.id)) + ' a lancé Ennemi juré : ' + a.hero.name + ' a juré la perte de ' + b.hero.name + '. Quand ils se croiseront, chacun frappera plus fort, et le vainqueur prendra un niveau et un objet au vaincu.', { unit: b.id, player: pl.id, alert: !!bo.human });
    return { msg: a.hero.name + ' a juré la perte de ' + b.hero.name + '.' };
  },
  truce_of_god(game, pl) {
    const fc = game.cities[pl.fortress] || Cities.ofPlayer(game, pl.id)[0], plane = fc ? fc.plane : 0;
    pl.globals.push('truce_of_god');
    pl.truce = { plane, from: game.turn, until: game.turn + Novel.TRUCE_TURNS };
    for (const o of game.players) if (o !== pl && o.alive) Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a lancé la Trêve de Dieu : pendant ' + U.n(Novel.TRUCE_TURNS, 'tour') + ', aucune bataille ne pourra se livrer sur ' + (fc && Intel.knows(game, o, fc.plane, fc.x, fc.y) ? 'le plan de ' + fc.name : 'son plan') + ' un tour sur deux, à commencer par celui-ci.', { spell: 'truce_of_god', global: true, player: pl.id, alert: o.human && ((game.cities[o.fortress] || {}).plane === plane) });
    return { msg: 'Trêve de Dieu : pendant ' + U.n(Novel.TRUCE_TURNS, 'tour') + ', aucune bataille sur votre plan un tour sur deux, à commencer par celui-ci.' };
  },
  great_inversion(game, pl, t) {
    const why = Novel.invWhy(game, pl, t); if (why) return { ok: false, why };
    Novel.invAnnounce(game, pl, World.wx(game.world, t.x), t.y, t.plane);
    return { msg: 'La Grande Inversion est en marche : dans ' + U.n(Novel.INV_DELAY, 'tour') + ', la région changera de monde avec celle qui lui fait face.' };
  },
  unleashed_beast(game, pl, t) {
    const why = Novel.beastWhy(game, pl, t); if (why) return { ok: false, why };
    const x = World.wx(game.world, t.x), u = Units.create(game, Novel.BEAST, -1, t.plane, x, t.y);
    u.rampage = true; u.beast = { until: game.turn + Novel.BEAST_TURNS, by: pl.id }; u.moves = 0;
    return { msg: 'La Bête déchaînée surgit. Pendant ' + U.n(Novel.BEAST_TURNS, 'tour') + ', elle fondra sur l\'armée ou la cité la plus proche, quelle qu\'elle soit.' };
  },
  blood_debt(game, pl) {
    if (pl.debt) return { ok: false, why: 'Vous devez encore ' + pl.debt.left + ' mana au prêteur.' };
    const loan = Novel.debtLoan(game, pl), total = Math.round(loan * Novel.DEBT_RATE);
    pl.mana += loan;
    pl.debt = { left: total, per: Math.ceil(total / Novel.DEBT_TURNS), from: game.turn };
    return { msg: 'Dette de sang : +' + loan + ' mana. Vous rembourserez ' + total + ' mana, ' + pl.debt.per + ' par tour.' };
  },
  node_trap(game, pl, t) {
    const why = Novel.trapWhy(game, pl, t); if (why) return { ok: false, why };
    const s = game.sites[World.get(game.world, t.plane, 'site', World.wx(game.world, t.x), t.y)];
    s.trap = pl.id;
    return { msg: 'Le ' + Game.siteName(s) + ' est piégé : le prochain esprit rival qui voudra s\'y lier sera détruit.' };
  },
});

// ---------- les sorts de combat ----------
Object.assign(COMBAT_SPELL_HANDLERS, {
  knell(bt, side, t) {
    const tiles = CombatSpells.zonePlace(bt, side, 'knell', t), p = (DATA.spells.knell || {}).params || {};
    bt.knells[side] = { tiles, at: bt.round + (p.rounds || 2) };
    for (const [c, r] of tiles) bt.ev({ type: 'fx', fx: 'death', at: [c, r] });
    bt.say('Le Glas sonne : dans ' + U.n(p.rounds || 2, 'round') + ', la mort frappera tout ce qui se tiendra encore sur ces cases.');
  },
  contagious_madness(bt, side, t) {
    if (bt.resistFails(t, 'chaos', 2, false)) { t.confused = true; t.moves = 0; bt.madness[side] = t; bt.say(bt.subj(t, 'perd la raison') + ' : la démence gagnera ses voisins.'); }
    else bt.say(bt.subj(t, 'résiste') + '.');
    bt.ev({ type: 'fx', fx: 'chaos', at: [t.c, t.r] });
  },
});
Object.assign(Novel, {
  // au début du tour du lanceur : le Glas sonne s'il est temps ; la démence passe à un voisin
  combatTick(bt, side) {
    const k = bt.knells[side];
    if (k && bt.round >= k.at) {
      bt.knells[side] = null;
      const str = ((DATA.spells.knell || {}).params || {}).strength || 15, parts = [];
      for (const [c, r] of k.tiles) bt.ev({ type: 'fx', fx: 'death', at: [c, r] });
      for (const b of CombatSpells.zoneVictims(bt, side, 'knell', k.tiles)) {
        const d = CombatSpells.areaHit(bt, b, str, 'magic', 'death');
        parts.push(bt.name(b) + (b.side === side ? ' (des vôtres)' : '') + ' ' + d);
        bt.checkDeath(b);
      }
      bt.say('Le Glas : ' + (parts.length ? parts.join(', ') : 'personne n\'était resté') + '.');
    }
    const m = bt.madness[side];
    if (m) {
      if (m.dead || !m.confused) { bt.madness[side] = null; return; }
      const near = bt.alive().filter(b => b !== m && !b.confused && Math.max(Math.abs(b.c - m.c), Math.abs(b.r - m.r)) <= 1 && Novel.madnessCan(bt, b));
      if (!near.length) return;
      const n = bt.rng.pick(near);
      if (bt.resistFails(n, 'chaos', 1, false)) { n.confused = true; n.moves = 0; bt.madness[side] = n; bt.say('Démence contagieuse : ' + bt.name(m) + ' la transmet à ' + bt.name(n) + '.'); }
      else bt.say('Démence contagieuse : ' + bt.name(n) + ' résiste à la folie de ' + bt.name(m) + '.');
      bt.ev({ type: 'fx', fx: 'chaos', at: [n.c, n.r] });
    }
  },
  madnessCan(bt, b) {
    const s = bt.stats(b);
    return !s.ab.magicImmunity && !b.u.riteDemon && !(b.u.ench.concat(b.tempEnch).includes('righteousness')) && bt.resFor(b, 'chaos') < 50;
  },
  // l'unité se tient-elle sur un glas qui sonnera avant qu'elle puisse rejouer ?
  knellAt(bt, c, r) { for (const s of [0, 1]) { const k = bt.knells && bt.knells[s]; if (k && k.tiles.some(([x, y]) => x === c && y === r)) return k; } return null; },
});

// ---------- l'IA, hors combat (désactivable au banc : no_novel) ----------
Object.assign(AI, {
  novelPlan(game, pl, id, o) {
    const w = game.world, mine = Cities.ofPlayer(game, pl.id), fort = game.cities[pl.fortress];
    const war = pid => pid >= 0 && pid !== pl.id && game.players[pid] && pl.diplo[pid] === 'war';
    const str = units => U.sum(units, u => Units.strength(game, u));
    switch (id) {
      // un charnier en vue, près de nos cités : une armée qui ne coûte presque rien
      case 'charnel_rising': {
        let best = null, bv = 0;
        for (const k in game.graves || {}) {
          const g = game.graves[k]; if (g.n < Novel.GRAVE_MIN) continue;
          const [p, x, y] = k.split(',').map(Number), t = { plane: p, x, y };
          if (!Intel.sees(game, pl, p, x, y) || Novel.charnelWhy(game, pl, t)) continue;
          const types = Novel.charnelArmy(game, g, MAX_STACK - Units.at(game, p, x, y).length);
          if (types.length < 3) continue;
          const up = U.sum(types, ty => (DATA.units[ty].upkeep || {}).mana || 0);
          if (up > Math.max(2, o.manaIncome)) continue;
          const c = U.min(mine.filter(c => c.plane === p), c => World.dist(w, c.x, c.y, x, y));
          const near = c ? World.dist(w, c.x, c.y, x, y) : 99;
          const v = 10 + 6 * types.length + (near <= 6 ? 10 : near <= 12 ? 0 : -15) + (c && AI.threatNear(game, pl, c) > 0 ? 15 : 0);
          if (v > bv) { bv = v; best = t; }
        }
        return best && bv > 20 ? { target: best, sc: bv } : null;
      }
      // un héros rival à notre mesure, chez un ennemi en guerre (le joueur d'abord)
      case 'sworn_enemy': {
        let best = null, bv = 0;
        for (const h of Novel.swornHeroes(game, pl)) for (const f of Novel.swornFoes(game, pl, h)) {
          if (!war(f.owner)) continue;
          const a = Units.strength(game, h), b = Units.strength(game, f);
          if (a < b * 0.9) continue;
          const v = 12 + 3 * Units.levelIndex(game, f) + (AI.isHumanSide(game, f.owner) ? 6 : 0) + Math.min(8, (a - b) / 30);
          if (v > bv) { bv = v; best = { unit: h.id, foe: f.id }; }
        }
        return best ? { target: best, sc: bv } : null;
      }
      // la trêve du faible : en guerre contre plus fort, une cité de son plan menacée
      case 'truce_of_god': {
        if (!fort) return null;
        const foes = game.players.filter(x => x.alive && war(x.id));
        if (!foes.length) return null;
        const me = str(o.army), them = Math.max(...foes.map(x => Intel.powerOf(game, pl, x.id) || 0));
        if (!(them > me * 1.6)) return null;
        if (!mine.some(c => c.plane === fort.plane && AI.threatNear(game, pl, c) > 0)) return null;
        return { target: null, sc: 55 };
      }
      // la Grande Inversion : une cité ennemie de l'autre plan amenée devant nos armées
      case 'great_inversion': {
        if (!fort || game.inversion) return null;
        const p = fort.plane, q = 1 - p;
        let best = null, bv = 0;
        for (const c of Object.values(game.cities)) {
          if (c.plane !== q || !war(c.owner) || !Intel.knows(game, pl, q, c.x, c.y)) continue;
          if (Novel.invWhy(game, pl, { plane: q, x: c.x, y: c.y })) continue;
          const ct = Novel.invContents(game, c.x, c.y);
          if (ct.cities.some(x => x.owner === pl.id)) continue;   // nos cités partiraient de l'autre côté
          const gain = U.sum(ct.cities.filter(x => x.plane === q && war(x.owner)), x => 15 + x.pop / 2000);
          const army = Object.values(game.units).filter(u => u.owner === pl.id && u.plane === p && !Cities.at(game, p, u.x, u.y) && (d => d > Novel.INV_R && d <= 8)(World.dist(w, u.x, u.y, c.x, c.y)));
          if (str(army) < 300) continue;
          if (gain > bv) { bv = gain; best = { plane: q, x: c.x, y: c.y }; }
        }
        return best && bv >= 15 ? { target: best, sc: Math.min(70, 25 + bv) } : null;
      }
      // la Bête lâchée au pied d'une cité ennemie, loin des nôtres
      case 'unleashed_beast': {
        let best = null, bv = 0;
        for (const c of Object.values(game.cities)) {
          if (!war(c.owner) || !Intel.sees(game, pl, c.plane, c.x, c.y)) continue;
          for (const [x, y] of World.neighbors(w, c.x, c.y)) {
            const t = { plane: c.plane, x, y };
            if (Novel.beastWhy(game, pl, t)) continue;
            const prey = Novel.beastPrey(game, { plane: c.plane, x, y });
            const owner = prey && (prey.city ? prey.city.owner : prey.owner);
            if (!war(owner)) continue;
            const own = U.min(mine.filter(m => m.plane === c.plane), m => World.dist(w, m.x, m.y, x, y));
            if (own && World.dist(w, own.x, own.y, x, y) < 7) continue;
            const v = 30 + Math.min(20, c.pop / 1000) + (AI.isHumanSide(game, c.owner) ? 5 : 0);
            if (v > bv) { bv = v; best = t; }
          }
        }
        return best ? { target: best, sc: bv } : null;
      }
      // l'emprunt du dernier recours : la capitale menacée, le mana à sec
      case 'blood_debt': {
        if (pl.debt || !fort || fort.owner !== pl.id) return null;
        if (!(AI.threatNear(game, pl, fort) > 0) || pl.mana > Magic.totalSkill(game, pl)) return null;
        return { target: null, sc: 65 };
      }
      // un nœud à nous que des rivaux pourraient prendre
      case 'node_trap': {
        if (pl.mana < o.cost + 150) return null;
        let best = null, bv = 0;
        for (const s of game.sites) {
          if (s.type !== 'node' || s.owner !== pl.id || s.trap === pl.id) continue;
          const rival = Object.values(game.cities).some(c => c.plane === s.plane && c.owner >= 0 && c.owner !== pl.id && !Spells.treaty(game, pl, c.owner) && World.dist(w, c.x, c.y, s.x, s.y) <= 10);
          if (!rival && !(Intel.threat(game, pl, s.plane, s.x, s.y, 6) > 0)) continue;
          const v = Magic.nodePower(game, pl, s);
          if (v > bv) { bv = v; best = { plane: s.plane, x: s.x, y: s.y }; }
        }
        return best ? { target: best, sc: 16 + Math.min(10, bv) } : null;
      }
    }
    return null;
  },
});
