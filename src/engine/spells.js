'use strict';
// Sorts lancés sur la carte du monde (hors combat).

const Spells = {
  // Canaux du chaos : les ailes ne vont pas à un volant, le souffle pas à un tireur (MoM)
  CHANNEL_NAMES: { demonSkin: 'peau de démon (+3 en défense)', demonWings: 'ailes de démon (vol)', fireBreath: 'souffle de feu' },
  usefulChannels(game, u) {
    const s = Units.stats(game, u), out = ['demonSkin'];
    if (!s.ab.flying) out.push('demonWings');
    if (!s.ranged && !s.ab.fireBreath && !s.ab.lightningBreath) out.push('fireBreath');
    return out;
  },
  // type de cible attendu sur la carte du monde
  // la zone d'un sort de carte qui touche plusieurs cases (aperçu pendant la visée) : toutes ses cases, celles où il fera
  // vraiment quelque chose (hot), et ce qu'il y fera ; null pour un sort d'une seule case
  areaOf(game, pl, id, p, x, y) {
    const w = game.world, sq = r => { const out = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (World.inY(w, y + dy)) out.push([World.wx(w, x + dx), y + dy]); return out; };
    let tiles, hot, what, warn = false;
    if (id === 'purify_land') { tiles = sq(1); hot = Spells.corruptAround(game, p, x, y); what = n => n ? U.n(n, 'terre corrompue', 'terres corrompues') + ' à purifier' : 'rien à purifier'; }
    else if (id === 'enchant_road') { tiles = sq(2); hot = tiles.filter(([tx, ty]) => World.get(w, p, 'road', tx, ty) === 1); what = n => n ? U.n(n, 'route', 'routes') + ' à enchanter' : 'aucune route à enchanter'; }
    else if (id === 'earth_lore') {   // comme Move.reveal (rayon 5)
      tiles = []; for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (World.inY(w, y + dy) && dx * dx + dy * dy <= 30) tiles.push([World.wx(w, x + dx), y + dy]);
      const ex = pl && pl.explored && pl.explored[p]; hot = ex ? tiles.filter(([tx, ty]) => !ex[ty * w.w + tx]) : []; what = n => n ? U.n(n, 'case inconnue', 'cases inconnues') + ' révélées' : 'tout est déjà connu ici';
    } else if (id === 'change_terrain' || id === 'transmute') {   // une seule case : ce qu'elle deviendrait
      tiles = [[World.wx(w, x), y]];
      const ter = World.terr(w, p, World.wx(w, x), y), tn = k => ((DATA.terrain || {})[T_KEYS[k]] || {}).name || T_KEYS[k];
      if (id === 'change_terrain') { const ce = Spells.changeTerrainEffect(game, pl, p, World.wx(w, x), y); hot = ce ? tiles : []; what = () => ce ? ce.text : 'ce terrain ne change pas'; if (ce && ce.gain < 0) warn = true; }
      else { const tr = Spells.transmuteEffect(game, pl, p, World.wx(w, x), y); hot = tr ? tiles : []; what = () => tr ? tr.text : 'aucun minerai transmutable'; if (tr && !tr.gain) warn = true; }
    } else if (DATA.spells[id] && DATA.spells[id].kind === 'stackEnchant') {
      tiles = [[World.wx(w, x), y]]; const t = { plane: p, x: World.wx(w, x), y }, n = pl ? Spells.stackUnits(game, pl, id, t).length : 0;
      hot = n ? tiles : []; what = () => n ? U.n(n, 'unité', 'unités') + ' à enchanter · ' + Spells.castCost(game, pl, id, t) + ' mana' : 'aucune unité à enchanter';
    } else return null;
    return { tiles, hot, label: what(hot.length), warn };
  },
  // les cases terrestres corrompues d'un carré de 3 × 3
  corruptAround(game, p, x, y) {
    const w = game.world;
    return [[x, y]].concat(World.neighbors(w, x, y)).filter(([cx, cy]) => World.inY(w, cy) && World.get(w, p, 'corrupt', cx, cy) && !World.isWaterAt(w, p, cx, cy));
  },
  overlandTarget(id) {
    const sp = DATA.spells[id];
    if (!sp) return 'none';
    if (sp.kind === 'summon') return id === 'floating_island' ? 'tile' : 'none';
    if (['summon_hero', 'summon_champion', 'incarnation', 'spell_of_mastery', 'enchant_item', 'create_artifact', 'disjunction', 'disjunction_true', 'death_wish', 'great_unsummoning', 'awareness', 'detect_magic', 'natures_awareness', 'legendary_artifact'].includes(id)) return 'none';
    if (sp.kind === 'global') return 'none';
    if (id === 'spell_of_return') return 'friendlyCity';
    if (sp.target === 'friendlyStack') return 'friendlyStack';
    if (id === 'resurrection') return 'deadHero';
    if (['drain_power', 'subversion', 'cruel_unminding', 'spell_blast', 'spell_binding', 'palimpsest', 'erasure', 'annals'].includes(id)) return 'enemyWizard';
    if (id === 'warp_node') return 'node';
    if (id === 'dispel_magic' || id === 'dispel_magic_true') return 'anyUnit';
    if (sp.target === 'friendlyUnit' || sp.target === 'friendlyHero') return 'friendlyUnit';
    if (sp.target === 'enemyUnit') return 'enemyUnit';
    if (sp.target === 'friendlyCity') return 'friendlyCity';
    if (sp.target === 'enemyCity') return 'enemyCity';
    if (sp.target === 'tile' || sp.target === 'combatTile' && sp.overland) return 'tile';
    return 'none';
  },
  implementedOverland(id) {
    const sp = DATA.spells[id]; if (!sp || !sp.overland || sp.inGame === false) return false;
    if (['summon', 'unitEnchant', 'stackEnchant', 'cityEnchant', 'cityCurse', 'global', 'terrain'].includes(sp.kind)) return true;
    return !!OVERLAND_HANDLERS[id];
  },
  castable(game, pl) {
    return Spells.knownFor(game, pl).filter(id => Spells.implementedOverland(id) && (id !== 'spell_of_return' || pl.banished) && (!pl.banished || id === 'spell_of_return'));
  },
  // les sorts connus, plus ceux du Livre de légende pour qui le détient
  knownFor(game, pl) {
    return typeof Book !== 'undefined' && Book.holder(game) === pl.id ? pl.known.concat(BOOK_SPELLS.filter(id => !pl.known.includes(id))) : pl.known;
  },

  // lance (ou commence à lancer) un sort
  cast(game, pl, id, target) {
    if (!Book.knows(game, pl, id)) return { ok: false, why: 'Sort inconnu.' };
    // une incantation suspendue (sa cible ne vaut plus rien) peut viser ailleurs sans rien perdre de ce qui est investi
    if (pl.casting && pl.casting.id === id && Spells.castingWarning(game, pl)) {
      const v = Spells.validate(game, pl, id, target); if (!v.ok) return v;
      pl.casting.target = target || null; pl.casting.held = null;
      return { ok: true, pending: true, retarget: true, why: 'nouvelle cible, l\'incantation reprend (' + Spells.castingTurnsText(game, pl) + ').' };
    }
    if (pl.casting) return { ok: false, why: 'Un sort est déjà en cours d\'incantation.' };
    const v = Spells.validate(game, pl, id, target);
    if (!v.ok) return v;
    if (DATA.spells[id].kind === 'stackEnchant') target = Object.assign({}, target, { units: Spells.stackUnits(game, pl, id, target).map(u => u.id) });
    const cost = Spells.castCost(game, pl, id, target);
    if (cost <= pl.skillLeft && cost <= pl.mana) {
      pl.mana -= cost; pl.skillLeft -= cost;
      const r = Spells.apply(game, pl, id, target);
      // sort sans effet (cible invalide découverte en le lançant) : rien n'est dépensé
      if (r && r.ok === false) { pl.mana += cost; pl.skillLeft += cost; }
      return r;
    }
    pl.casting = { id, target: target || null, progress: 0, cost };
    // investit dès maintenant ce qui peut l'être
    const invest = Math.min(pl.skillLeft, pl.mana, cost);
    pl.casting.progress += invest; pl.mana -= invest; pl.skillLeft -= invest;
    // le reste se prend au début des tours suivants, sur la compétence de chacun
    const turns = Math.max(1, Math.ceil((cost - pl.casting.progress) / Math.max(1, Magic.totalSkill(game, pl))));
    return { ok: true, pending: true, turns, why: 'Incantation en cours (' + turns + ' tour' + (turns > 1 ? 's' : '') + ').' };
  },
  // l'incantation en cours aboutira au début de combien de tours (1 : au début du prochain) ? Infinity faute de mana.
  // Comme progressCasting : en fin de tour le mana arrive, puis au début du suivant la compétence du tour y passe.
  castingTurns(game, pl) {
    const c = pl.casting; if (!c) return 0;
    let left = c.cost - c.progress, mana = pl.mana;
    // la compétence grandit chaque tour avec la part de puissance qui lui est consacrée
    const skill = Magic.totalSkill(game, pl), mpt = Magic.manaPerTurn(game, pl), gain = Magic.split(game, pl).skill, cs0 = Magic.castingSkill(pl);
    for (let t = 1; t <= 300; t++) {
      mana += mpt;
      const sk = skill + Magic.castingSkill({ skillPoints: (pl.skillPoints || 0) + gain * t, retorts: pl.retorts }) - cs0;
      const invest = Math.max(0, Math.min(sk, mana, left));
      left -= invest; mana -= invest;
      if (left <= 0) return t;
      if (mpt <= 0 && mana <= 0) return Infinity;
    }
    return Infinity;
  },
  castingTurnsText(game, pl) {
    const t = Spells.castingTurns(game, pl);
    return t === Infinity ? 'mana insuffisant' : t <= 1 ? 'prêt au prochain tour' : 'prêt dans ' + t + ' tours';
  },
  // l'incantation en cours échouerait-elle si elle aboutissait maintenant (six héros, cible disparue…) ? La raison, sinon null.
  castingWarning(game, pl) {
    const c = pl.casting; if (!c) return null;
    // lancé d'office au bannissement, ou visé sur une cité perdue depuis : la cité se choisit à la fin
    if (c.id === 'spell_of_return' && !(c.target && game.cities[c.target.city] && game.cities[c.target.city].owner === pl.id)) return Spells.returnCity(game, pl) ? null : 'Aucune cité pour vous accueillir.';
    const v = Spells.validate(game, pl, c.id, c.target);
    return v.ok ? null : v.why;
  },
  cancelCasting(game, pl) {
    if (!pl.casting) return;
    pl.mana += Math.floor(pl.casting.progress / 2); // la moitié est perdue
    pl.casting = null;
  },
  progressCasting(game, pl) {
    const c = pl.casting; if (!c) return;
    // joueur : une incantation qui échouerait (cible partie, déjà enchantée…) est suspendue sans engloutir de mana, et signalée une fois
    if (pl.human) {
      const why = Spells.castingWarning(game, pl);
      if (why) { if (c.held !== why) Game.log(game, pl.id, DATA.spells[c.id].name + ' : incantation suspendue, ' + why.replace(/\.$/, '').replace(/^./, ch => ch.toLowerCase()) + '. Elle reprendra dès que la cible sera valable ; vous pouvez aussi lui donner une nouvelle cible (grimoire) ou l\'abandonner.', { spell: c.id, alert: true }); c.held = why; return; }
      c.held = null;
    }
    const left = c.cost - c.progress;
    const invest = Math.max(0, Math.min(pl.skillLeft, pl.mana, left));
    c.progress += invest; pl.mana -= invest; pl.skillLeft -= invest;
    if (c.progress >= c.cost) {
      pl.casting = null;
      // Sort de Retour (lancé d'office au bannissement, sans cible) : la forteresse renaît dans l'ancienne capitale
      // si on l'a reprise, sinon dans la plus grande cité ; la cible choisie reste prioritaire si la cité est toujours à nous
      if (c.id === 'spell_of_return') {
        const own = x => x && x.owner === pl.id;
        if (!own(c.target && game.cities[c.target.city])) { const r = Spells.returnCity(game, pl); c.target = r ? { city: r.id } : null; }
      }
      const v = Spells.validate(game, pl, c.id, c.target);
      if (!v.ok) { pl.mana += Math.floor(c.cost / 2); Game.log(game, pl.id, DATA.spells[c.id].name + ' échoue : ' + v.why + ' La moitié du mana est récupérée.'); return; }
      const r = Spells.apply(game, pl, c.id, c.target);
      if (r && r.ok === false) { pl.mana += Math.floor(c.cost / 2); Game.log(game, pl.id, DATA.spells[c.id].name + ' échoue : ' + (r.why || '') + ' La moitié du mana est récupérée.'); }
    }
  },

  returnCity(game, pl) {
    const mine = Cities.ofPlayer(game, pl.id); if (!mine.length) return null;
    const lf = pl.lastFortress;
    const old = lf && mine.find(c => c.plane === lf.plane && c.x === lf.x && c.y === lf.y);
    return old || U.max(mine, c => c.pop * 10 + (c.buildings ? Object.keys(c.buildings).length : 0));
  },
  // versions de pile (Marche sur l'eau majeure, Vol majeur) : les unités amies de la case que la version mineure enchanterait ;
  // pendant l'incantation, celles retenues au lancement (target.units)
  stackUnits(game, pl, id, target) {
    const sp = DATA.spells[id], minor = sp && sp.params && sp.params.enchant; if (!minor || !target) return [];
    const pool = target.units ? target.units.map(uid => game.units[uid]).filter(Boolean) : Units.at(game, target.plane, World.wx(game.world, target.x), target.y);
    return pool.filter(u => u.owner === pl.id && Spells.validate(game, pl, minor, { unit: u.id }).ok);
  },
  // le coût d'un lancement : par unité enchantée pour une version de pile
  castCost(game, pl, id, target) {
    const c = Magic.spellCost(game, pl, id, false);
    return DATA.spells[id].kind === 'stackEnchant' ? c * Math.max(1, Spells.stackUnits(game, pl, id, target).length) : c;
  },
  validate(game, pl, id, target) {
    const tt = Spells.overlandTarget(id);
    const sp = DATA.spells[id];
    if (tt === 'friendlyStack') {
      if (!target || target.plane == null) return { ok: false, why: 'Choisissez une case.' };
      if (!Spells.stackUnits(game, pl, id, target).length) return { ok: false, why: Units.at(game, target.plane, World.wx(game.world, target.x), target.y).some(u => u.owner === pl.id) ? 'Aucune unité de la case à enchanter (elles ' + (sp.params.enchant === 'flight' ? 'volent déjà' : 'vont déjà sur l\'eau') + ').' : 'Aucune de vos unités sur cette case.' };
      return { ok: true };
    }
    if (pl.banished && id !== 'spell_of_return') return { ok: false, why: 'Un sorcier banni ne peut lancer que le Sort de Retour.' };
    { const bv = typeof Book !== 'undefined' && Book.validate(game, pl, id, target); if (bv) return bv; }
    if (tt === 'friendlyUnit' || tt === 'enemyUnit' || tt === 'anyUnit') {
      const u = target && game.units[target.unit];
      if (!u) return { ok: false, why: 'Cible disparue.' };
      if (tt === 'friendlyUnit' && u.owner !== pl.id) return { ok: false, why: 'Il faut une unité amie.' };
      if (tt === 'enemyUnit' && u.owner === pl.id) return { ok: false, why: 'Il faut une unité ennemie.' };
      const p = sp.params || {};
      if (p.normalOnly && !Units.isNormal(u)) return { ok: false, why: 'Réservé aux unités normales.' };
      if (sp.kind === 'unitEnchant' && u.ench.includes(id)) return { ok: false, why: 'Déjà enchantée.' };
      if (p.exclusiveWith && u.ench.includes(p.exclusiveWith)) return { ok: false, why: 'Incompatible avec ' + DATA.spells[p.exclusiveWith].name + '.' };
      if (Object.values(DATA.spells).some(o => o.params && o.params.exclusiveWith === id && u.ench.includes(o.id))) return { ok: false, why: 'Incompatible avec un enchantement déjà présent.' };
      if (id === 'chaos_channels' && u.chaosChannel) return { ok: false, why: 'Le chaos a déjà transformé cette unité.' };
      // un enchantement qui n'apporterait rien : la capacité est déjà là (Régénération sur un troll, Vol sur un volant…)
      if (sp.kind === 'unitEnchant') {
        const st = Units.stats(game, u), abs = [].concat(p.ability || []).filter(a => a !== 'flying');
        // (Marche des vents garde son intérêt pour qui marche déjà dans les vents moins vite qu'elle)
        if (abs.length && abs.every(a => Units.has(game, u, a)) && !p.damageReduction && !(id === 'wind_walking' && Units.maxMoves(game, u) < 6)) return { ok: false, why: 'L\'unité a déjà cette capacité.' };
        const uw = Units.enchantUseless(game, u, id); if (uw) return { ok: false, why: uw };
        if (id === 'flight' && st.flying) return { ok: false, why: 'L\'unité vole déjà.' };
        if (id === 'water_walking' && (st.flying || st.swimming || st.ab.waterWalking)) return { ok: false, why: st.flying ? 'L\'unité vole déjà.' : 'L\'unité va déjà sur l\'eau.' };
      }
      if (sp.target === 'friendlyHero' && !u.hero) return { ok: false, why: 'Il faut viser un de vos héros.' };
      if ((id === 'word_of_recall' || id === 'recall_hero') && game.cities[pl.fortress] && (() => { const f = game.cities[pl.fortress]; return u.plane === f.plane && u.x === f.x && u.y === f.y; })()) return { ok: false, why: 'L\'unité est déjà dans votre forteresse.' };
      if (id === 'spell_lock' && !u.ench.some(e => e !== 'spell_lock')) return { ok: false, why: 'Aucun enchantement à protéger sur cette unité.' };
      // rappeler qui porte sa pile au-dessus de l'eau (Marche des vents, Navire volant) la laisserait se noyer
      if ((id === 'word_of_recall' || id === 'recall_hero') && World.isWaterAt(game.world, u.plane, u.x, u.y) && !Cities.at(game, u.plane, u.x, u.y)) {
        const rest = Units.at(game, u.plane, u.x, u.y).filter(o => o.owner === u.owner && o !== u);
        if (rest.length && !Move.canStand(game, rest, Move.groupInfo(game, rest), u.plane, u.x, u.y, u.owner)) return { ok: false, why: 'Sa pile resterait sur l\'eau sans rien pour la porter.' };
      }
    }
    if (tt === 'friendlyCity' || tt === 'enemyCity') {
      const c = target && game.cities[target.city];
      if (!c) return { ok: false, why: 'Cité disparue.' };
      if (tt === 'friendlyCity' && c.owner !== pl.id) return { ok: false, why: 'Il faut une cité amie.' };
      if (tt === 'enemyCity' && c.owner === pl.id) return { ok: false, why: 'Il faut une cité ennemie.' };
      if (tt === 'enemyCity' && Spells.treaty(game, pl, c.owner)) return { ok: false, why: 'Un traité vous lie à ' + Players.nameFor(game, pl.id, c.owner) + ' : ses cités sont épargnées.' };
      if ((sp.kind === 'cityEnchant' || sp.kind === 'cityCurse') && c.ench.some(e => e.spell === id)) return { ok: false, why: 'Cet enchantement est déjà actif.' };
      if (tt === 'enemyCity' && Cities.hasEnch(c, 'consecration') && ['chaos', 'death'].includes(sp.realm)) return { ok: false, why: 'La cité est consacrée.' };
      if (id === 'spell_ward' && !(target && REALMS5.includes(target.realm))) return { ok: false, why: 'Choisissez le royaume dont la cité sera gardée.' };
      if (id === 'wall_of_stone' && c.buildings.cityWalls) return { ok: false, why: 'La cité a déjà des murailles.' };
      if (id === 'astral_gate' && World.isWaterAt(game.world, 1 - c.plane, c.x, c.y)) return { ok: false, why: 'De l\'autre côté, c\'est la mer : seuls les volants et les nageurs passeraient.' };
      // (on ne sait les livres d'un sorcier qu'après l'avoir rencontré : avant, le sort se lance, sans effet)
      if (id === 'evil_presence' && c.owner >= 0 && game.players[c.owner] && game.players[c.owner].books.death > 0 && Players.knows(game, pl.id, c.owner)) return { ok: false, why: 'Son maître pratique la magie de la mort : sans effet.' };
      if (id === 'dark_rituals' && !['shrine', 'temple', 'parthenon', 'cathedral'].some(b => c.buildings[b])) return { ok: false, why: 'Aucun lieu de culte dans la cité : il n\'y aurait que les inconvénients.' };
      if (id === 'move_fortress' && c.id === pl.fortress) return { ok: false, why: 'La forteresse est déjà là.' };
      if (id === 'summoning_circle' && c.id === (pl.summonCity != null ? pl.summonCity : pl.fortress)) return { ok: false, why: 'Le cercle d\'invocation est déjà là.' };
    }
    if (tt === 'tile' || tt === 'node') {
      if (!target || target.x == null) return { ok: false, why: 'Choisissez une case.' };
      // on ne vise que ce qu'on connaît ; les sorts qui frappent des unités exigent de voir la case (sinon, sonde gratuite)
      if (id !== 'earth_lore' && typeof Intel !== 'undefined' && !Intel.knows(game, pl, target.plane, target.x, target.y)) return { ok: false, why: 'Case inexplorée.' };
      if (Spells.UNIT_TILE.includes(id) && typeof Intel !== 'undefined' && !(pl.human ? Move.visibility(game, pl.id)[target.plane][target.y * game.world.w + World.wx(game.world, target.x)] : Intel.sees(game, pl, target.plane, target.x, target.y))) return { ok: false, why: 'Il faut voir la case pour y viser des troupes.' };
      const why = Spells.tileCheck(game, pl, id, target); if (why) return { ok: false, why };
    }
    // Garde magique et Consécration d'une cité étrangère visée (ou de la case où elle se dresse)
    const tc = tt === 'enemyCity' ? game.cities[target && target.city] : tt === 'tile' && target ? Cities.at(game, target.plane, target.x, target.y) : null;
    if (tc && tc.owner !== pl.id && sp.realm) {
      if (tc.ench.some(e => e.spell === 'spell_ward' && e.realm === sp.realm)) return { ok: false, why: 'L\'Égide arcanique de ' + tc.name + ' repousse les sorts de ce royaume.' };
      if (tt === 'tile' && Cities.hasEnch(tc, 'consecration') && ['chaos', 'death'].includes(sp.realm)) return { ok: false, why: 'La cité est consacrée.' };
    }
    if (id === 'spell_binding' && !game.players.some(o => o !== pl && o.alive && pl.contact[o.id] && o.globals.length)) return { ok: false, why: 'Aucun rival connu n\'entretient d\'enchantement global.' };
    if (tt === 'enemyWizard') { const o = target && game.players[target.player]; if (!o || !o.alive || o === pl) return { ok: false, why: 'Choisissez un sorcier rival.' }; if (id === 'spell_binding' && !o.globals.length) return { ok: false, why: 'N\'entretient aucun enchantement global.' }; if (id === 'spell_binding' && target.spell && !o.globals.includes(target.spell)) return { ok: false, why: DATA.spells[target.spell].name + ' n\'est plus entretenu.' };
      // Brise-sort : il faut une incantation (ou une part du rituel du Démon) à briser
      if (id === 'spell_blast' && !o.casting && !(typeof Rite !== 'undefined' && (r => r && r.phase === 'ritual' && r.paid[o.id] > 0)(Rite.active(game)))) return { ok: false, why: U.cap(Players.nameFor(game, pl.id, o.id)) + ' n\'incante rien en ce moment.' }; }
    if (sp.kind === 'global') {
      if (pl.globals.includes(id)) return { ok: false, why: 'Déjà actif.' };
      const holder = game.players.find(o => o.alive && o.globals.includes(id));
      if (holder && holder !== pl) return { ok: false, why: U.cap(Players.nameFor(game, pl.id, holder.id)) + ' entretient déjà cet enchantement.' };
    }
    if (tt === 'deadHero' && !(pl.deadHeroes || []).length) return { ok: false, why: 'Aucun héros à ressusciter.' };
    if (tt === 'deadHero' && target && target.hero && !(pl.deadHeroes || []).some(d => d.type === target.hero)) return { ok: false, why: 'Ce héros n\'est plus parmi les morts.' };
    if ((id === 'disjunction' || id === 'disjunction_true') && !Spells.disjTargets(game, pl).length) return { ok: false, why: 'Aucun enchantement global adverse.' };
    if ((id === 'disjunction' || id === 'disjunction_true') && target && target.spell && !Spells.disjTargets(game, pl).some(x => x.o.id === target.player && x.g === target.spell)) return { ok: false, why: (DATA.spells[target.spell] ? DATA.spells[target.spell].name : 'Cet enchantement') + ' n\'est plus à portée : dissipé, ou un traité vous lie désormais à son maître.' };
    if ((id === 'summon_hero' || id === 'summon_champion') && Heroes.heroCount(game, pl) < 6) {
      const taken = Heroes.takenHeroes(game);
      if (!Object.values(DATA.heroes).some(h => !taken.has(h.unit) && h.unit !== 'HeroTorin' && !!h.champion === (id === 'summon_champion'))) return { ok: false, why: 'Aucun héros disponible.' };
    }
    if (id === 'incarnation' && Object.values(game.units).some(u => u.type === 'HeroTorin')) return { ok: false, why: 'L\'Élu est déjà incarné.' };
    if (['summon_hero', 'summon_champion', 'incarnation', 'resurrection'].includes(id) && Heroes.heroCount(game, pl) >= 6) return { ok: false, why: 'Vous avez déjà six héros.' };
    if (['summon_hero', 'summon_champion', 'incarnation', 'resurrection'].includes(id)) { const sc = Spells.summonCity(game, pl); if (sc && !Spells.spotNear(game, pl, sc, 'HeroTorin')) return { ok: false, why: 'Aucune place autour de ' + sc.name + ' pour accueillir le héros.' }; }
    if (id === 'purify_land' && !(target && target.x != null && Spells.corruptAround(game, target.plane, target.x, target.y).length)) return { ok: false, why: 'Aucune terre corrompue ici ni autour.' };
    if (id === 'seal_rift' && !(target && target.x != null && Veil.riftAt(game, target.plane, target.x, target.y))) return { ok: false, why: 'Il faut viser une faille ouverte.' };
    if (id === 'open_rift') {
      if (Veil.sealed(game)) return { ok: false, why: 'Le Sceau planaire fige le voile.' };
      if (!(target && target.x != null && Units.at(game, target.plane, World.wx(game.world, target.x), target.y).some(u => u.owner === pl.id))) return { ok: false, why: 'Il faut viser une case où se tiennent vos troupes.' };
      const why = Veil.riftSpotWhy(game, World.wx(game.world, target.x), target.y); if (why) return { ok: false, why };
    }
    if (id === 'wizard_avatar' && Game.avatarOf(game, pl)) return { ok: false, why: 'Vous êtes déjà sur la carte.' };
    if (id === 'wizard_avatar' && !game.cities[pl.fortress]) return { ok: false, why: 'Il faut votre forteresse.' };
    if (sp.kind === 'heal' && !Spells.healTargets(game, pl, id, target).length) return { ok: false, why: id === 'mass_healing' ? 'Aucune de vos unités n\'est blessée.' : 'Aucune unité blessée à soigner ici.' };
    return { ok: true };
  },

  // les enchantements globaux que la Disjonction peut viser : ceux des rivaux qui ne sont ni en paix ni alliés
  disjTargets(game, pl) {
    const out = [];
    for (const o of game.players) if (o !== pl && o.alive && o.globals.length && !['peace', 'alliance'].includes(pl.diplo[o.id])) for (const g of o.globals) if (DATA.spells[g]) out.push({ o, g });
    return out;
  },
  UNIT_TILE: ['stasis', 'fire_storm', 'ice_storm', 'black_wind', 'disenchant_area', 'disenchant_true', 'floating_island'],
  CHANGE_TERRAIN: null,
  changeTerrainMap() { return Spells.CHANGE_TERRAIN || (Spells.CHANGE_TERRAIN = { [T.DESERT]: T.GRASS, [T.FOREST]: T.GRASS, [T.HILLS]: T.GRASS, [T.SWAMP]: T.GRASS, [T.GRASS]: T.FOREST, [T.VOLCANO]: T.MOUNTAIN, [T.MOUNTAIN]: T.HILLS, [T.TUNDRA]: T.GRASS }); },
  // ce que la transmutation d'une case change pour qui l'exploite : or, puissance, coût des troupes, armes en mithril.
  // gain : vers le minerai le plus précieux (mithril, or, gemmes) ; l'autre sens est une perte, sauf cas particulier
  transmuteEffect(game, pl, p, x, y) {
    const w = game.world, m = World.get(w, p, 'mineral', x, y), to = Spells.transmuteMap()[m]; if (!to) return null;
    const A = DATA.minerals[MIN_KEYS[m]] || {}, B = DATA.minerals[MIN_KEYS[to]] || {}, parts = [];
    const city = pl ? Cities.ofPlayer(game, pl.id).find(c => c.plane === p && World.catchment(w, c.x, c.y).some(([cx, cy]) => cx === x && cy === y)) : null;
    const dg = (B.gold || 0) - (A.gold || 0), dp = (B.power || 0) - (A.power || 0), du = (B.unitCostPct || 0) - (A.unitCostPct || 0);
    if (dg) parts.push((dg > 0 ? '+' : '−') + Math.abs(dg) + ' or');
    if (dp) parts.push((dp > 0 ? '+' : '−') + Math.abs(dp) + ' puissance');
    if (du) parts.push('troupes ' + (du > 0 ? '+' : '−') + Math.abs(du) + ' % de coût');
    const forge = city && city.buildings.alchemistsGuild;
    if (m === M.mithril) parts.push(forge ? 'plus d\'armes en mithril à ' + city.name : 'plus d\'armes en mithril possibles');
    if (to === M.mithril) parts.push(forge ? 'armes en mithril à ' + city.name : 'armes en mithril avec une Guilde des alchimistes');
    const gain = [M.mithril, M.gold, M.gems].includes(to);
    return { gain, city, short: to === M.mithril ? 'mithril' : m === M.mithril ? '− mithril' : dg ? (dg > 0 ? '+' : '−') + Math.abs(dg) + ' or' : dp ? (dp > 0 ? '+' : '−') + Math.abs(dp) + ' puiss.' : '', text: (A.name || '?') + ' → ' + (B.name || '?') + ' : ' + parts.join(', ') + (city ? '' : ' (aucune de vos cités ne l\'exploite)') };
  },
  // Changement de terrain : ce que la case rapporterait de plus ou de moins aux cités du sorcier qui l'exploitent
  // (bilan recalculé, terrain changé le temps du calcul), et ce qui change pour les déplacements.
  // { gain: 1 / 0 / -1, short : le principal en quelques signes, text : le détail, city }, ou null si le terrain ne change pas
  changeTerrainEffect(game, pl, p, x, y) {
    const w = game.world, ter = World.terr(w, p, x, y), to = Spells.changeTerrainMap()[ter]; if (to == null) return null;
    const tn = k => ((DATA.terrain || {})[T_KEYS[k]] || {}).name || T_KEYS[k];
    const arr = w.planes[p].terr, i = World.idx(w, x, y);
    // ce que vaut la case elle-même : nourriture (elle fait la taille maximale des cités) et bonus de production
    const raw = () => ({ food: World.foodOf(w, p, x, y), prod: World.prodPctOf(w, p, x, y, false) });
    const r0 = raw(); arr[i] = to; const r1 = raw(); arr[i] = ter;
    const dFood = r1.food - r0.food, dProd = r1.prod - r0.prod;
    // les cités du sorcier qui l'exploitent (une case partagée compte pour moitié) : leur taille maximale avant et après
    const cities = [], shares = [];
    if (pl) for (const c of Cities.ofPlayer(game, pl.id)) { if (c.plane !== p) continue; const t = Cities.catchment(game, c).find(t => World.wx(w, t.x) === x && t.y === y); if (t) { cities.push(c); shares.push(t.f); } }
    let dPop = 0, capped = cities.length > 0;
    if (cities.length) {
      const before = cities.map(c => Cities.econ(game, c));
      arr[i] = to;
      try { cities.forEach((c, j) => { const e = Cities.econ(game, c); dPop += e.maxPop - before[j].maxPop; if (before[j].maxPop < MAX_CITY_SIZE || e.maxPop < MAX_CITY_SIZE) capped = false; }); }
      finally { arr[i] = ter; }
    }
    const share = shares.length ? Math.max(...shares) : 1, f = n => String(Math.round(n * share * 10) / 10).replace('.', ','), sg = v => v > 0 ? '+' : '−';
    const parts = [];
    if (Math.abs(dFood) >= 0.05) parts.push(sg(dFood) + f(Math.abs(dFood)) + ' nourriture' + (cities.length ? (dPop ? ' (taille maximale ' + sg(dPop) + Math.abs(dPop) + ')' : capped ? ' (taille déjà au plafond)' : ' (taille maximale inchangée)') : ''));
    if (Math.abs(dProd) >= 0.05) parts.push(sg(dProd) + f(Math.abs(dProd)) + ' % de production');
    const move = Move.mountainsBlock(game) && !World.hasRoad(w, p, x, y) ? (ter === T.MOUNTAIN ? 'passable sans route' : to === T.MOUNTAIN ? 'infranchissable sans route' : '') : '';
    const where = cities.length ? ' à ' + cities.map(c => c.name).join(' et ') : '';
    const text = tn(ter) + ' → ' + tn(to) + ' : ' + (parts.length ? parts.join(', ') : 'rien de plus ni de moins') + (cities.length ? where : ' (aucune de vos cités ne l\'exploite)') + (move ? ' ; ' + move : '');
    // le bilan : la taille maximale d'abord, puis la nourriture qui la prépare, puis la production
    const val = !cities.length ? 0 : 3 * dPop + (capped ? 0.2 : 1) * dFood * share + 0.25 * dProd * share;
    // l'étiquette sur la carte : un seul mot, le plus parlant (le passage d'une montagne, sinon le plus gros effet)
    const wf = (capped ? 0.2 : 1) * Math.abs(dFood), wp = 0.25 * Math.abs(dProd);
    const short = move ? (ter === T.MOUNTAIN ? 'passable' : 'bloquant') : wf >= wp && Math.abs(dFood) >= 0.05 ? sg(dFood) + f(Math.abs(dFood)) + ' nour.' : Math.abs(dProd) >= 0.05 ? sg(dProd) + f(Math.abs(dProd)) + ' % prod.' : '';
    return { gain: val > 0.05 ? 1 : val < -0.05 ? -1 : 0, short, text, city: cities[0] || null };
  },
  TRANSMUTE: null,
  transmuteMap() { return Spells.TRANSMUTE || (Spells.TRANSMUTE = { [M.coal]: M.gems, [M.gems]: M.coal, [M.iron]: M.gold, [M.gold]: M.iron, [M.silver]: M.mithril, [M.mithril]: M.silver }); },
  // Saut de plan : pourquoi la pile de cette case ne passerait pas (les mêmes règles que les passages ordinaires), sinon null
  planeShiftWhy(game, pl, t) {
    const units = Units.at(game, t.plane, t.x, t.y).filter(u => u.owner === pl.id); if (!units.length) return 'Aucune unité amie ici.';
    const np = 1 - t.plane;
    if (Move.hostileAt(game, pl.id, np, t.x, t.y)) return 'Case occupée de l\'autre côté.';
    if (game.players.some(p => p.alive && p.globals.includes('planar_seal'))) return 'Le Sceau planaire bloque tout passage.';
    if (!Move.canStand(game, units, Move.groupInfo(game, units), np, t.x, t.y, pl.id)) return 'Le terrain de l\'autre plan est impraticable.';
    const oc = Cities.at(game, np, t.x, t.y); if (oc && oc.owner !== pl.id) return 'Une cité étrangère occupe la case de l\'autre plan.';
    if (Move.stackCount(game, np, t.x, t.y, pl.id) + units.length > MAX_STACK) return 'Trop d\'unités vous attendent déjà de l\'autre côté.';
    const si = World.get(game.world, np, 'site', t.x, t.y); if (si >= 0 && Game.siteHasGuardians(game.sites[si])) return 'Des gardiens occupent la case de l\'autre plan.';
    return null;
  },
  // une case visée où le sort échouerait à coup sûr : la raison (les mêmes règles que ses effets), sinon null.
  // Vérifié dès la visée et pendant toute l'incantation : on ne lance pas, et on n'engloutit pas de mana, dans un échec annoncé.
  tileCheck(game, pl, id, t) {
    const w = game.world, p = t.plane, x = World.wx(w, t.x), y = t.y, ter = World.terr(w, p, x, y);
    const foes = () => Units.at(game, p, x, y).filter(u => u.owner !== pl.id && !Spells.treaty(game, pl, u.owner) && !(typeof Intel !== 'undefined' && Intel.hiddenFrom(game, pl.id, u)));
    const pact = () => { const o = Units.at(game, p, x, y).find(u => u.owner !== pl.id && Spells.treaty(game, pl, u.owner) && !(typeof Intel !== 'undefined' && Intel.hiddenFrom(game, pl.id, u))); return o ? 'Un traité vous lie à ' + Players.nameFor(game, pl.id, o.owner) + ', à qui sont ces troupes.' : null; };
    if (id === 'change_terrain' && Spells.changeTerrainMap()[ter] == null) return 'Ce terrain ne peut pas être changé.';
    if (id === 'raise_volcano') { if (World.isWater(ter) || NODE_REALM[ter] || ter === T.HILLS || ter === T.MOUNTAIN) return 'Impossible ici (ni eau, ni colline, ni montagne, ni nœud).'; if (ter === T.VOLCANO) return 'C\'est déjà un volcan.'; }
    if (id === 'corruption') { if (World.isWater(ter)) return 'Impossible sur l\'eau.'; if (World.get(w, p, 'corrupt', x, y)) return 'Cette terre est déjà corrompue.'; }
    if (id === 'transmute' && !Spells.transmuteMap()[World.get(w, p, 'mineral', x, y)]) return 'Aucun minerai transmutable ici.';
    if (['fire_storm', 'ice_storm', 'black_wind'].includes(id) && !foes().length) return pact() || 'Aucune unité ennemie ici.';
    if (id === 'stasis' && !foes().some(u => !Units.stats(game, u).ab.magicImmunity)) return pact() || 'Aucune unité ennemie à figer ici.';
    if (id === 'disenchant_area' || id === 'disenchant_true') {
      const si = World.get(w, p, 'site', x, y), st = si >= 0 ? game.sites[si] : null, c = Cities.at(game, p, x, y);
      const guarded = st && st.type === 'node' && st.meldBy === 'GuardianSpirit' && st.owner >= 0 && st.owner !== pl.id && !Spells.treaty(game, pl, st.owner);
      if (!guarded && !foes().some(u => u.ench.length) && !(st && st.warped != null && st.warped !== pl.id && !Spells.treaty(game, pl, st.warped)) && !(c && !Spells.treaty(game, pl, c.owner) && c.ench.some(e => e.owner !== pl.id))) return pact() || 'Rien à dissiper ici.';
    }
    if (id === 'plane_shift') { const why = Spells.planeShiftWhy(game, pl, { plane: p, x, y }); if (why) return why; }
    if (id === 'floating_island') { if (!World.isWater(ter)) return 'Il faut une case d\'océan.'; if (foes().length) return 'Des unités étrangères occupent cette case.'; }
    if (id === 'enchant_road' && Spells.areaOf && !(Spells.areaOf(game, pl, id, p, x, y) || { hot: [] }).hot.length) return 'Aucune route à enchanter ici.';
    if (id === 'warp_node') {
      const si = World.get(w, p, 'site', x, y), s = si >= 0 ? game.sites[si] : null;
      if (!s || s.type !== 'node') return 'Il faut viser un nœud.';
      if (s.owner == null || s.owner < 0 || s.owner === pl.id) return 'Il faut un nœud lié à un sorcier rival.';
      if (s.warped != null) return 'Ce nœud est déjà perverti.';
    }
    return null;
  },
  // protections d'une unité contre un sort de ce royaume, hors combat : Droiture (immunité à la mort et au chaos),
  // Bénédiction, Résistance aux éléments, Armure élémentaire (bonus de défense et de résistance)
  // un traité (paix ou alliance) avec le maître de ces unités ou de cette cité : les sorts hostiles l'épargnent
  treaty(game, pl, owner) { return owner != null && owner >= 0 && owner !== pl.id && ['peace', 'alliance'].includes(pl.diplo[owner]); },
  righteous(u, realm) { return (realm === 'death' || realm === 'chaos') && u.ench.includes('righteousness'); },
  // résistance d'une unité à un sort de ce royaume, hors combat (les mêmes règles que Battle.resFor) :
  // 50 sous Immunité magique, Charmé, Droiture (mort, chaos) ou immunité à la mort ; sinon résistance + bonus contre ce royaume
  resVs(game, u, realm, s) {
    s = s || Units.stats(game, u);
    if (s.ab.magicImmunity || s.ab.charmed || Spells.righteous(u, realm) || (realm === 'death' && s.ab.deathImmunity)) return 50;
    return s.res + Spells.vsBonus(u, realm).res;
  },
  vsBonus(u, realm) {
    const o = { def: 0, res: 0 }; if (!realm) return o;
    for (const e of u.ench) { const p = (DATA.spells[e] || {}).params || {}; if (p.vs && p.vs.includes(realm)) { o.def += p.def || 0; o.res += p.res || 0; } }
    return o;
  },
  // défense d'une unité contre un sort de ce royaume qui frappe sur la carte (tempêtes, météores, faille du chaos) :
  // la défense, plus Bénédiction, Résistance aux éléments, Armure élémentaire contre ce royaume
  defVs(game, u, realm, s) { s = s || Units.stats(game, u); return s.def + Spells.vsBonus(u, realm).def; },
  // chance de dissiper l'enchantement e (de ce sorcier) avec cette force : force / (force + coût × résistance du lanceur)
  dispelChance(game, strength, e, ownerId) { const c = (DATA.spells[e] || {}).cost || 20; return strength / (strength + c * Magic.dispelResist(game, ownerId, e)); },
  // unités qu'un sort de soin sur la carte peut guérir
  healTargets(game, pl, id, t) {
    const ok = u => u.owner === pl.id && u.dmg > 0 && Units.realmOf(u) !== 'death' && !u.undead;
    if (id === 'mass_healing') return Object.values(game.units).filter(ok);
    if (id === 'healing') { const u = t && game.units[t.unit]; return u ? Units.at(game, u.plane, u.x, u.y).filter(ok) : []; }
    if (!t || t.x == null) return [];
    return Units.at(game, t.plane, t.x, t.y).filter(ok);
  },
  summonCity(game, pl) { return game.cities[pl.summonCity] || game.cities[pl.fortress] || Cities.ofPlayer(game, pl.id)[0]; },
  placeNear(game, pl, type, c) { const at = Spells.spotNear(game, pl, c, type); return at ? Units.create(game, type, pl.id, at[0], at[1], at[2]) : null; },

  // enchantements d'unité après une dissipation (roll() : celui-ci tombe) ; sous un Sceau de sort, seul le sceau peut tomber
  dispelEnch(ench, roll) {
    if (ench.includes('spell_lock')) return roll('spell_lock') ? ench.filter(e => e !== 'spell_lock') : ench;
    return ench.filter(e => !roll(e));
  },
  natureWrath(game, pl, o) {
    const c = game.rng.pick(Cities.ofPlayer(game, pl.id)); if (!c) return;
    let units = 0;
    for (const u of Units.at(game, c.plane, c.x, c.y)) { const s = Units.stats(game, u); if (!s.flying && !s.ab.nonCorporeal && game.rng.chance(0.1)) { Units.remove(game, u); units++; } }
    const lost = Cities.destroyBuildings(game, c, 0.05);
    Game.log(game, pl.id, 'La colère de la nature fait trembler ' + c.name + ' (' + U.n(units, 'unité perdue', 'unités perdues') + (lost.length ? ', ' + Cities.lostText(lost) : ', aucun bâtiment perdu') + ').', { city: c.id });
    Game.log(game, o.id, 'La colère de la nature frappe ' + c.name + ', cité de ' + Players.nameFor(game, o.id, pl.id) + '.', { minor: true });
  },
  // case libre pour une unité près d'une cité (la cité elle-même si la pile n'est pas pleine) ; null si tout est plein
  // (jamais sur des ennemis, dans une cité étrangère, sur un repaire gardé, ni là où l'unité ne tient pas : un navire à terre, un fantassin en mer)
  spotNear(game, pl, c, type) {
    if (!c || !DATA.units[type]) return null;
    const fake = { id: -1, type, owner: pl.id, plane: c.plane, x: c.x, y: c.y, ench: [], xp: 0, weapon: 0, dmg: 0, hero: null, items: null };
    const gi = Move.groupInfo(game, [fake]);
    const fits = (x, y) => {
      if (Move.stackCount(game, c.plane, x, y, pl.id) >= MAX_STACK || Move.hostileAt(game, pl.id, c.plane, x, y)) return false;
      const cc = Cities.at(game, c.plane, x, y); if (cc && cc.owner !== pl.id) return false;
      const si = World.get(game.world, c.plane, 'site', x, y); if (si >= 0 && game.sites[si] && Game.siteHasGuardians(game.sites[si])) return false;
      return Move.canStand(game, [fake], gi, c.plane, x, y, pl.id);
    };
    if (fits(c.x, c.y)) return [c.plane, c.x, c.y];
    for (const [x, y] of World.neighbors(game.world, c.x, c.y)) if (fits(x, y)) return [c.plane, x, y];
    return null;
  },
  // un rival entretient Suppression de la magie (tout sort), Tranquillité (chaos) ou Force vitale (mort) : dissipation de force 500
  suppressedBy(game, pl, sp) {
    if (sp.id === 'spell_of_return' || sp.id === 'spell_of_mastery') return null;
    for (const o of game.players) {
      if (!o || !o.alive || o === pl) continue;
      for (const g of o.globals) {
        const gp = (DATA.spells[g] || {}).params || {};
        if (!gp.dispelStrength || (gp.vsRealm && gp.vsRealm !== sp.realm)) continue;
        const cost = Math.max(1, sp.cost || 1) * Magic.dispelResist(game, pl.id, sp.id);
        if (game.rng.chance(gp.dispelStrength / (gp.dispelStrength + cost))) return { o, g };
      }
    }
    return null;
  },
  apply(game, pl, id, target) {
    const sp = DATA.spells[id];
    const p = sp.params || {};
    const h = OVERLAND_HANDLERS[id];
    let msg = null;
    if (sp.book && Book.holder(game) !== pl.id) return { ok: false, why: 'Le Livre de légende vous a échappé : l\'incantation se dissipe.' };
    const sup = Spells.suppressedBy(game, pl, sp);
    if (sup) {
      const by = DATA.spells[sup.g].name;
      Game.log(game, pl.id, sp.name + ' est dissipé par ' + by + ' de ' + Players.nameFor(game, pl.id, sup.o.id) + '.', { spell: id });
      Game.log(game, sup.o.id, by + ' dissipe ' + sp.name + ' de ' + Players.nameFor(game, sup.o.id, pl.id) + '.', { spell: id, minor: true });
      return { ok: true, msg: sp.name + ' est dissipé.' };
    }
    if (h) { const r = h(game, pl, target, sp); if (r && r.ok === false) return r; msg = r && r.msg; }
    else if (sp.kind === 'summon') {
      const c = Spells.summonCity(game, pl);
      const u = Spells.placeNear(game, pl, p.unit, c);
      if (!u) return { ok: false, why: 'Aucune place pour accueillir la créature.' };
      u.moves = 0;
      msg = 'Invocation réussie à ' + c.name + ' : ' + DATA.units[p.unit].name + '.';
    } else if (sp.kind === 'stackEnchant') {
      const us = Spells.stackUnits(game, pl, id, target), minor = p.enchant;
      if (!us.length) return { ok: false, why: 'Plus aucune unité à enchanter.' };
      for (const u of us) u.ench.push(minor);
      msg = sp.name + ' : ' + U.n(us.length, 'unité enchantée', 'unités enchantées') + ' (' + U.tally(us.map(u => Units.label(u))) + ').';
    } else if (sp.kind === 'unitEnchant') {
      const u = game.units[target.unit];
      if (id === 'chaos_channels') { u.chaosChannel = game.rng.pick(Spells.usefulChannels(game, u)); msg = Units.subj(u, 'est transformé') + ' par le chaos : ' + Spells.CHANNEL_NAMES[u.chaosChannel] + '.'; }
      else { u.ench.push(id); msg = sp.name + ' sur ' + Units.label(u) + '.'; }
    } else if (sp.kind === 'cityEnchant') {
      const c = game.cities[target.city];
      if (id === 'wall_of_stone') { c.buildings.cityWalls = true; Cities.skipBuilt(game, c); }
      else c.ench.push(id === 'spell_ward' ? { spell: id, owner: pl.id, realm: target.realm } : { spell: id, owner: pl.id });
      if (id === 'consecration') { const n = c.ench.length; c.ench = c.ench.filter(e => DATA.spells[e.spell].kind !== 'cityCurse'); if (c.ench.length < n) msg = c.name + ' est consacrée : ses malédictions se lèvent.'; }
      msg = msg || (c.name + ' est protégée par ' + sp.name + (id === 'spell_ward' ? ' (' + REALM_NAMES[target.realm].toLowerCase() + ')' : '') + '.');
    } else if (sp.kind === 'cityCurse') {
      const c = game.cities[target.city];
      const ward = c.ench.find(e => e.spell === 'spell_ward');
      if (ward && (ward.realm ? ward.realm === sp.realm : game.rng.chance(0.5))) return { ok: true, msg: 'L\'Égide arcanique de ' + c.name + ' repousse ' + sp.name + '.' };
      c.ench.push({ spell: id, owner: pl.id });
      msg = sp.name + ' s\'abat sur ' + c.name + '.';
      if (c.owner >= 0) { Game.log(game, c.owner, U.cap(Players.nameFor(game, c.owner, pl.id)) + ' a lancé ' + sp.name + ' sur ' + c.name + ' !', { city: c.id, player: pl.id, spell: id }); Diplomacy.adjust(game, c.owner, pl.id, -15, 'hostile_spell'); }
    } else if (sp.kind === 'global') {
      pl.globals.push(id);
      if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'global', { a: pl.id, s: id, pub: true });
      msg = 'Enchantement global actif : ' + sp.name + '.';
      for (const o of game.players) if (o !== pl && o.alive) Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a lancé ' + sp.name + '.', { spell: id, global: true, player: pl.id, minor: true });
      if (id === 'natures_awareness' || id === 'awareness') { if (id === 'natures_awareness') for (const pp of [0, 1]) pl.explored[pp].fill(1); else { for (const c of Object.values(game.cities)) Move.reveal(game, pl, c.plane, c.x, c.y, 1); if (typeof Intel !== 'undefined') Intel.clairvoyance(game, pl); } }
    } else if (sp.kind === 'terrain') {
      const r = Spells.terrainSpell(game, pl, id, target, sp); if (r && r.ok === false) return r; msg = r && r.msg;
    }
    Game.log(game, pl.id, msg || (sp.name + ' est lancé.'), { spell: id });
    // l'interface en fait un événement (le sort en grand au centre de la carte)
    if (Game.hooks && Game.hooks.fx) Game.hooks.fx({ type: 'spellCast', player: pl.id, id, target: target || null, msg: msg || (sp.name + ' est lancé.') });
    pl.fame += sp.rarity === 'veryrare' ? 1 : 0;
    // Colère de la nature : un sort de mort ou de chaos fait trembler une cité de son lanceur
    if (['death', 'chaos'].includes(sp.realm)) for (const o of game.players) if (o && o.alive && o !== pl && o.globals.includes('natures_wrath')) Spells.natureWrath(game, pl, o);
    Veil.onSpell(game, pl, id);
    Cities.updateTerritory(game);
    return { ok: true, msg };
  },

  // volcans de chaque sorcier : 1 mana par tour tant que la case reste un volcan
  addVolcano(pl, p, x, y) { pl.volcanoTiles = pl.volcanoTiles || []; const k = p + ',' + x + ',' + y; if (!pl.volcanoTiles.includes(k)) pl.volcanoTiles.push(k); },
  terrainSpell(game, pl, id, t, sp) {
    const w = game.world, p = t.plane, x = t.x, y = t.y;
    const ter = World.terr(w, p, x, y);
    if (id === 'change_terrain') {
      const map = Spells.changeTerrainMap();
      if (map[ter] == null) return { ok: false, why: 'Ce terrain ne peut pas être changé.' };
      World.setTerr(w, p, x, y, map[ter]); return { msg: 'Le terrain se transforme.' };
    }
    if (id === 'raise_volcano') {
      if (World.isWater(ter) || NODE_REALM[ter] || ter === T.HILLS || ter === T.MOUNTAIN) return { ok: false, why: 'Impossible ici (ni eau, ni colline, ni montagne, ni nœud).' };
      if (ter === T.VOLCANO) return { ok: false, why: 'C\'est déjà un volcan.' };
      World.setTerr(w, p, x, y, T.VOLCANO);
      const c = Cities.at(game, p, x, y);
      const lost = c ? Cities.destroyBuildings(game, c, 0.15) : [];
      if (c && c.owner >= 0 && c.owner !== pl.id) Game.log(game, c.owner, 'Un volcan jaillit sous ' + c.name + ', lancé par ' + Players.nameFor(game, c.owner, pl.id) + (lost.length ? ' : ' + Cities.lostText(lost) : '') + '.', { city: c.id, alert: true });
      Spells.addVolcano(pl, p, x, y);
      return { msg: 'Un volcan jaillit du sol' + (c ? ' sous ' + c.name + (lost.length ? ' (' + Cities.lostText(lost) + ')' : '') : '') + '.' };
    }
    if (id === 'corruption') {
      if (World.isWater(ter)) return { ok: false, why: 'Impossible sur l\'eau.' };
      World.set(w, p, 'corrupt', x, y, 1);
      const oc = game.cities[w.planes[p].ownerCity[World.idx(w, x, y)]];
      if (oc && oc.owner >= 0 && oc.owner !== pl.id) Game.log(game, oc.owner, U.cap(Players.nameFor(game, oc.owner, pl.id)) + ' a corrompu une terre de ' + oc.name + '.', { plane: p, x, y, player: pl.id, alert: true });
      return { msg: 'La terre est corrompue.' };
    }
    if (id === 'transmute') {
      const m = World.get(w, p, 'mineral', x, y);
      const swap = Spells.transmuteMap();
      if (!swap[m]) return { ok: false, why: 'Aucun minerai transmutable ici.' };
      World.set(w, p, 'mineral', x, y, swap[m]); return { msg: 'Le minerai est transmuté.' };
    }
    if (id === 'enchant_road') {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (World.hasRoad(w, p, x + dx, y + dy)) World.set(w, p, 'road', x + dx, y + dy, 2);
      return { msg: 'Les routes s\'enchantent.' };
    }
    if (id === 'earth_to_mud') return { ok: false, why: 'Sort de combat.' };
    return { msg: sp.name + ' est lancé.' };
  },
};

const OVERLAND_HANDLERS = {
  spell_of_mastery(game, pl) {
    game.over = true; game.winner = pl.id; game.overWhy = 'mastery';
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'mastery', { a: pl.id, pub: true });
    Game.log(game, -1, pl.name + ' a lancé le Sort de Maîtrise et règne désormais sur toute magie !');
    return { msg: 'Le Sort de Maîtrise est accompli.' };
  },
  spell_of_return(game, pl, t) {
    const c = game.cities[t.city];
    pl.banished = false; pl.fortress = c.id; pl.summonCity = c.id; c.fortress = true; c.buildings.fortress = true; c.buildings.summoningCircle = true; pl.race = c.race;
    for (const o of Cities.ofPlayer(game, pl.id)) if (o !== c) delete o.buildings.summoningCircle;
    return { msg: 'Vous revenez dans le monde à ' + c.name + '.' };
  },
  summoning_circle(game, pl, t) { for (const o of Cities.ofPlayer(game, pl.id)) delete o.buildings.summoningCircle; game.cities[t.city].buildings.summoningCircle = true; pl.summonCity = t.city; return { msg: 'Le cercle d\'invocation est déplacé à ' + game.cities[t.city].name + '.' }; },
  move_fortress(game, pl, t) {
    const old = game.cities[pl.fortress], c = game.cities[t.city], relay = !!(old && old.buildings.magicRelay);
    if (old) { old.fortress = false; delete old.buildings.fortress; delete old.buildings.magicRelay; }
    if (old && pl.summonCity === old.id) { pl.summonCity = t.city; if (old.buildings.summoningCircle) { delete old.buildings.summoningCircle; c.buildings.summoningCircle = true; } }
    // le Relais de magie suit la forteresse (il ne sert qu'à elle) ; en chantier dans l'ancienne, il y est abandonné
    if (relay) c.buildings.magicRelay = true;
    c.fortress = true; c.buildings.fortress = true; pl.fortress = c.id; pl.race = c.race;
    return { msg: 'La forteresse s\'élève désormais à ' + c.name + (relay ? ', avec son Relais de magie' : '') + '.' };
  },
  summon_hero(game, pl) { return OVERLAND_HANDLERS._hero(game, pl, false); },
  summon_champion(game, pl) { return OVERLAND_HANDLERS._hero(game, pl, true); },
  _hero(game, pl, champion) {
    if (Heroes.heroCount(game, pl) >= 6) return { ok: false, why: 'Vous avez déjà six héros.' };
    // ni un héros vivant, ni un héros tombé (qu'une résurrection ramènerait en double), ni l'Élu (Incarnation seulement)
    const taken = Heroes.takenHeroes(game);
    const cands = Object.values(DATA.heroes).filter(h => !taken.has(h.unit) && h.unit !== 'HeroTorin' && !!h.champion === champion);
    if (!cands.length) return { ok: false, why: 'Aucun héros disponible.' };
    const c = Spells.summonCity(game, pl), at = Spells.spotNear(game, pl, c, 'HeroTorin');
    if (!at) return { ok: false, why: 'Aucune place pour accueillir le héros.' };
    const h = game.rng.pick(cands);
    // comme les héros qui se présentent ou qu'on délivre : au niveau de l'époque (Myrmidon après le tour 50, etc.)
    const u = Heroes.spawn(game, pl, h, at[0], at[1], at[2], HERO_LEVELS[Heroes.levelOf(game, h.id)].xp); u.moves = 0;
    pl.heroArrival = { unit: u.id, kind: 'summon', turn: game.turn };
    return { msg: h.name + ' (' + h.title + ') répond à votre appel.' };
  },
  incarnation(game, pl) {
    const h = DATA.heroes.HeroTorin; if (Object.values(game.units).some(u => u.type === 'HeroTorin')) return { ok: false, why: 'L\'Élu est déjà incarné.' };
    if (Heroes.heroCount(game, pl) >= 6) return { ok: false, why: 'Vous avez déjà six héros.' };
    const c = Spells.summonCity(game, pl), at = Spells.spotNear(game, pl, c, 'HeroTorin');
    if (!at) return { ok: false, why: 'Aucune place pour accueillir l\'Élu.' };
    for (const o of game.players) if (o && o.deadHeroes) o.deadHeroes = o.deadHeroes.filter(d => d.type !== 'HeroTorin');
    const u = Heroes.spawn(game, pl, h, at[0], at[1], at[2], HERO_LEVELS[Heroes.levelOf(game, h.id)].xp); u.moves = 0;
    pl.heroArrival = { unit: u.id, kind: 'summon', turn: game.turn };
    return { msg: 'L\'Élu s\'incarne à ' + c.name + '.' };
  },
  resurrection(game, pl, t) {
    if (!pl.deadHeroes.length) return { ok: false, why: 'Aucun héros.' };
    if (Heroes.heroCount(game, pl) >= 6) return { ok: false, why: 'Vous avez déjà six héros.' };
    // le héros choisi (t.hero : son type), sinon le premier tombé
    const i0 = Math.max(0, t && t.hero ? pl.deadHeroes.findIndex(d => d.type === t.hero) : 0), d0 = pl.deadHeroes[i0];
    if (Object.values(game.units).some(u => u.type === d0.type)) { pl.deadHeroes.splice(i0, 1); return { ok: false, why: 'Ce héros est déjà revenu au monde.' }; }
    const c = Spells.summonCity(game, pl), at = Spells.spotNear(game, pl, c, d0.type);
    if (!at) return { ok: false, why: 'Aucune place pour accueillir le héros.' };
    const d = pl.deadHeroes.splice(i0, 1)[0];
    const u = Units.create(game, d.type, pl.id, at[0], at[1], at[2]); u.hero = d.hero; u.xp = d.xp; u.items = [null, null, null]; u.summoned = false; u.moves = 0;
    pl.heroArrival = { unit: u.id, kind: 'resurrection', turn: game.turn };
    return { msg: d.hero.name + ' revient d\'entre les morts.' };
  },
  enchant_item(game, pl) { const it = Items.random(game, 2); pl.vault.push(it); return { msg: 'Objet créé : ' + it.name + ' (' + Items.describe(it) + ').' }; },
  create_artifact(game, pl) { const it = Items.random(game, 5); pl.vault.push(it); return { msg: 'Artefact créé : ' + it.name + ' (' + Items.describe(it) + ').' }; },
  floating_island(game, pl, t) {
    if (!World.isWaterAt(game.world, t.plane, t.x, t.y)) return { ok: false, why: 'Il faut une case d\'océan.' };
    { const h0 = Move.hostileAt(game, pl.id, t.plane, t.x, t.y); if (h0) return { ok: false, why: typeof Intel !== 'undefined' && Intel.hiddenFrom(game, pl.id, h0) ? 'L\'île ne parvient pas à émerger ici.' : 'Des unités étrangères occupent cette case.' }; }   // (sans trahir une unité invisible)
    if (Move.stackCount(game, t.plane, t.x, t.y, pl.id) >= MAX_STACK) return { ok: false, why: 'Trop d\'unités sur cette case.' };
    const u = Units.create(game, 'FloatingIsland', pl.id, t.plane, t.x, t.y); u.moves = 0; return { msg: 'Une île flottante émerge des flots.' };
  },
  earth_lore(game, pl, t) {
    Move.reveal(game, pl, t.plane, t.x, t.y, 5);
    // les armées de la zone sont repérées à la date du sort (rapport au survol de leur case)
    const w = game.world, vis = [new Uint8Array(w.w * w.h), new Uint8Array(w.w * w.h)];
    for (const [x, y] of (Spells.areaOf(game, pl, 'earth_lore', t.plane, t.x, t.y) || { tiles: [] }).tiles) vis[t.plane][y * w.w + x] = 1;
    let n = 0;
    if (typeof Intel !== 'undefined') { Intel.record(game, pl, vis); const seen = new Set(); for (const u of Object.values(game.units)) if (u.owner !== pl.id && u.guardian == null && vis[u.plane][u.y * w.w + u.x] && !Intel.hiddenFrom(game, pl.id, u)) seen.add(u.plane + ',' + u.x + ',' + u.y); n = seen.size; }
    return { msg: 'La région se révèle à vous' + (n ? ' : ' + U.n(n, 'armée repérée', 'armées repérées') + ' (le détail au survol de leur case)' : ', sans armée en vue') + '.' };
  },
  plane_shift(game, pl, t) {
    const why = Spells.planeShiftWhy(game, pl, t); if (why) return { ok: false, why };
    const units = Units.at(game, t.plane, t.x, t.y).filter(u => u.owner === pl.id), np = 1 - t.plane;
    for (const u of units) { u.plane = np; u.moves = 0; u.path = null; u.dest = null; u.roadPlan = null; if (['goto', 'roadto', 'explore'].includes(u.status)) u.status = ''; }
    Veil.onCross(game, pl, units.length);
    Move.reveal(game, pl, np, t.x, t.y, 2); return { msg: 'Vos troupes basculent dans l\'autre plan.' };
  },
  word_of_recall(game, pl, t) {
    const u = game.units[t.unit]; const c = game.cities[pl.fortress]; if (!c) return { ok: false, why: 'Pas de forteresse.' };
    if (DATA.units[u.type].sailing) return { ok: false, why: 'Un navire ne peut pas être rappelé.' };
    const at = Spells.spotNear(game, pl, c, u.type); if (!at) return { ok: false, why: 'Aucune place près de la forteresse.' };
    u.plane = at[0]; u.x = at[1]; u.y = at[2]; u.moves = 0; u.path = null; u.dest = null; if (u.status === 'goto') u.status = ''; return { msg: Units.label(u) + ' est rappelé à la forteresse.' }; },
  recall_hero(game, pl, t) { return OVERLAND_HANDLERS.word_of_recall(game, pl, t); },
  purify_land(game, pl, t) {
    const tiles = Spells.corruptAround(game, t.plane, t.x, t.y); if (!tiles.length) return { ok: false, why: 'Aucune terre corrompue ici ni autour.' };
    for (const [x, y] of tiles) World.set(game.world, t.plane, 'corrupt', x, y, 0);
    return { msg: tiles.length > 1 ? tiles.length + ' terres corrompues sont purifiées.' : 'La terre est purifiée.' };
  },
  open_rift(game, pl, t) {
    const x = World.wx(game.world, t.x), why = Veil.riftSpotWhy(game, x, t.y); if (why) return { ok: false, why };
    const s = Veil.openRiftAt(game, x, t.y); s.by = game.sites[s.pair].by = pl.id; Veil.thin(game, 3);
    for (const o of game.players) if (o !== pl && o.alive && (Cities.ofPlayer(game, o.id).some(c => World.dist(game.world, c.x, c.y, x, t.y) <= 12) || o.contact[pl.id])) Game.log(game, o.id, 'Une faille s\'est ouverte entre les plans (' + x + ', ' + t.y + ').', { x, y: t.y, plane: t.plane, rift: true, minor: true });
    return { msg: 'La faille s\'ouvre sous vos troupes ; le voile s\'use (' + Math.round(game.veil) + ' %).' };
  },
  seal_rift(game, pl, t) {
    const s = Veil.riftAt(game, t.plane, t.x, t.y); if (!s) return { ok: false, why: 'Il faut viser une faille.' };
    Veil.closeRift(game, s, pl.id); Veil.mend(game, 6);
    for (const o of game.players) if (o !== pl && o.alive) Game.log(game, o.id, 'Une faille entre les plans s\'est refermée (' + s.x + ', ' + s.y + ').', { x: s.x, y: s.y, plane: s.plane, minor: true });
    return { msg: 'La faille se referme ; le voile se recoud un peu (' + Math.round(game.veil) + ' %).' };
  },
  wizard_avatar(game, pl) { const r = Game.summonAvatar(game, pl); return r.ok ? { msg: 'Vous voici sur la carte, à ' + game.cities[pl.fortress].name + '.' } : r; },
  // soins sur la carte : piles amies, jamais les créatures de la mort ni les morts-vivants
  healing(game, pl, t) { const u = game.units[t.unit]; return OVERLAND_HANDLERS._heal(game, pl, Spells.healTargets(game, pl, 'healing', t), v => 5); },
  mass_healing(game, pl, t) { return OVERLAND_HANDLERS._heal(game, pl, Spells.healTargets(game, pl, 'mass_healing', t), v => 5); },
  field_healing(game, pl, t) { return OVERLAND_HANDLERS._heal(game, pl, Spells.healTargets(game, pl, 'field_healing', t), u => Math.max(3, Math.round(Units.stats(game, u).maxHp * .4))); },
  _heal(game, pl, units, amount) {
    if (!units.length) return { ok: false, why: 'Aucune unité blessée à soigner.' };
    let hp = 0;
    for (const u of units) { const before = u.dmg; u.dmg = Math.max(0, u.dmg - amount(u)); hp += before - u.dmg; if (u.dmg <= 0 && u.status === 'heal') u.status = ''; }
    const u0 = units[0];
    Game.log(game, pl.id, U.n(units.length, 'unité soignée', 'unités soignées') + ' (' + hp + ' PV rendus).', { x: u0.x, y: u0.y, plane: u0.plane, minor: true });
    return { msg: U.n(units.length, 'unité soignée', 'unités soignées') + ', ' + hp + ' PV rendus.' };
  },
  natures_cures(game, pl, t) { const us = Spells.healTargets(game, pl, 'natures_cures', t); if (!us.length) return { ok: false, why: 'Aucune unité blessée à soigner.' }; for (const u of us) { u.dmg = 0; if (u.status === 'heal') u.status = ''; } return { msg: 'Les troupes sont entièrement soignées.' }; },
  // dégâts de zone sur la carte
  fire_storm(game, pl, t) { return OVERLAND_HANDLERS._storm(game, pl, t, 8, 'fire'); },
  ice_storm(game, pl, t) { return OVERLAND_HANDLERS._storm(game, pl, t, 6, 'cold'); },
  _storm(game, pl, t, str, kind) {
    const units = Units.at(game, t.plane, t.x, t.y).filter(u => u.owner !== pl.id && !Spells.treaty(game, pl, u.owner)); if (!units.length) return { ok: false, why: 'Aucune unité ennemie ici.' };
    let killed = 0, hurt = 0; const dead = [];
    const sname = (DATA.spells[kind === 'fire' ? 'fire_storm' : 'ice_storm'] || {}).name || 'La tempête';
    for (const u of units) {
      const s = Units.stats(game, u), realm = (DATA.spells[kind === 'fire' ? 'fire_storm' : 'ice_storm'] || {}).realm;
      if (s.ab.magicImmunity || (kind === 'fire' && s.ab.fireImmunity) || (kind === 'cold' && s.ab.coldImmunity) || Spells.righteous(u, realm)) continue;
      const def = Spells.defVs(game, u, realm, s);
      let tot = 0; for (let i = 0; i < Units.aliveFigures(game, u); i++) tot += Math.max(0, Math.min(s.hp, game.rng.rolls(str, 30) - game.rng.rolls(def, 30)));
      u.dmg += tot; if (tot > 0) hurt++;
      if (Units.health(game, u) <= 0) { dead.push(Units.name(u)); Units.remove(game, u); killed++; }
    }
    const what = (killed ? U.tally(dead) + ' ' + (killed > 1 ? 'détruites' : 'détruite') : 'aucune unité détruite') + (hurt - killed > 0 ? ', ' + U.n(hurt - killed, 'autre blessée', 'autres blessées') : '');
    const vic = units[0].owner;
    if (vic >= 0) { Diplomacy.adjust(game, vic, pl.id, -10, 'hostile_spell'); Game.log(game, vic, U.cap(Players.nameFor(game, vic, pl.id)) + ' lance ' + sname + ' sur vos troupes : ' + what + '.', { plane: t.plane, x: t.x, y: t.y, player: pl.id, alert: true }); }
    return { msg: sname + ' s\'abat : ' + what + '.' };
  },
  black_wind(game, pl, t) {
    const units = Units.at(game, t.plane, t.x, t.y).filter(u => u.owner !== pl.id && !Spells.treaty(game, pl, u.owner)); if (!units.length) return { ok: false, why: 'Aucune unité ennemie ici.' };
    let killed = 0;
    let figs = 0; const names = [];
    for (const u of units) { const s = Units.stats(game, u), res = Spells.resVs(game, u, 'death', s); if (res >= 50) continue; let lost = 0; for (let i = 0; i < Units.aliveFigures(game, u); i++) if (game.rng.int(10) + 1 > res - 1) lost++; figs += lost; u.dmg += lost * s.hp; if (Units.health(game, u) <= 0) { names.push(Units.name(u)); Units.remove(game, u); killed++; } }
    const what = U.n(figs, 'figurine') + ' emportée' + (figs > 1 ? 's' : '') + (killed ? ', dont ' + U.n(killed, 'unité entière', 'unités entières') + ' (' + U.tally(names) + ')' : '');
    const vic = units[0].owner;
    if (vic >= 0) { Diplomacy.adjust(game, vic, pl.id, -10, 'hostile_spell'); Game.log(game, vic, 'Le vent noir ' + U.de(Players.nameFor(game, vic, pl.id)) + ' souffle sur vos troupes : ' + what + '.', { plane: t.plane, x: t.x, y: t.y, alert: true }); }
    return { msg: 'Le vent noir : ' + what + '.' };
  },
  earthquake(game, pl, t) {
    const c = game.cities[t.city];
    const lost = Cities.destroyBuildings(game, c, 0.1); let killed = 0;
    for (const u of Units.at(game, c.plane, c.x, c.y)) { const s = Units.stats(game, u); if (!s.flying && !s.ab.nonCorporeal && game.rng.chance(0.15)) { Units.remove(game, u); killed++; } }
    if (c.owner >= 0) Diplomacy.adjust(game, c.owner, pl.id, -20, 'hostile_spell');
    const what = [lost.length ? Cities.lostText(lost) : 'aucun bâtiment perdu'].concat(killed ? [U.n(killed, 'unité engloutie', 'unités englouties')] : []).join(', ');
    if (c.owner >= 0 && c.owner !== pl.id) Game.log(game, c.owner, U.cap(Players.nameFor(game, c.owner, pl.id)) + ' fait trembler la terre sous ' + c.name + ' (' + what + ').', { city: c.id, player: pl.id, alert: true });
    return { msg: 'La terre tremble sous ' + c.name + ' (' + what + ').' };
  },
  call_the_void(game, pl, t) {
    const c = game.cities[t.city];
    const lost = Cities.destroyBuildings(game, c, 0.5);
    c.pop = Math.max(1000, Math.floor(c.pop / 2));
    let killed = 0;
    for (const u of Units.at(game, c.plane, c.x, c.y)) { if (Units.stats(game, u).ab.magicImmunity || Spells.righteous(u, 'chaos')) continue; u.dmg += 10; if (Units.health(game, u) <= 0) { Units.remove(game, u); killed++; } }
    let nc = 0; for (const [x, y] of World.catchment(game.world, c.x, c.y)) if (!World.isWaterAt(game.world, c.plane, x, y) && game.rng.chance(0.5)) { if (!World.get(game.world, c.plane, 'corrupt', x, y)) nc++; World.set(game.world, c.plane, 'corrupt', x, y, 1); }
    if (c.owner >= 0) Diplomacy.adjust(game, c.owner, pl.id, -30, 'hostile_spell');
    const what = 'la moitié de la population disparaît' + (lost.length ? ' ; ' + Cities.lostText(lost) : '') + (killed ? ' ; ' + U.n(killed, 'unité anéantie', 'unités anéanties') : '') + (nc ? ' ; ' + U.n(nc, 'terre corrompue', 'terres corrompues') + ' alentour' : '');
    if (c.owner >= 0 && c.owner !== pl.id) Game.log(game, c.owner, U.cap(Players.nameFor(game, c.owner, pl.id)) + ' appelle le Néant sur ' + c.name + ' : ' + what + '.', { city: c.id, player: pl.id, alert: true });
    return { msg: 'Le Néant frappe ' + c.name + ' : ' + what + '.' };
  },
  death_wish(game, pl) {
    let n = 0; const per = {};
    for (const u of Object.values(game.units)) if (u.owner !== pl.id && Units.isNormal(u) && !(u.owner >= 0 && ['peace', 'alliance'].includes(pl.diplo[u.owner]))) { const res = Spells.resVs(game, u, 'death'); if (res >= 50) continue; if (game.rng.int(10) + 1 > res) { if (u.owner >= 0) per[u.owner] = (per[u.owner] || 0) + 1; Units.remove(game, u); n++; } }
    for (const o in per) { Diplomacy.adjust(game, +o, pl.id, -15, 'hostile_spell'); Game.log(game, +o, U.cap(Players.nameFor(game, +o, pl.id)) + ' lance le Vœu de mort : ' + U.n(per[o], 'de vos unités périt', 'de vos unités périssent') + '.', { player: pl.id, alert: true }); }
    return { msg: 'Le Vœu de mort fauche ' + U.n(n, 'unité ennemie', 'unités ennemies') + '.' };
  },
  great_unsummoning(game, pl) {
    let n = 0; const per = {};
    for (const u of Object.values(game.units)) if (u.owner >= 0 && Units.isFantastic(u)) { const res = Spells.resVs(game, u, 'sorcery'); if (res >= 50 || u.riteDemon) continue; if (game.rng.int(10) + 1 > res - 3) { (per[u.owner] = per[u.owner] || []).push(Units.name(u)); Units.remove(game, u); n++; } }
    for (const o in per) if (+o !== pl.id) { Diplomacy.adjust(game, +o, pl.id, -10, 'hostile_spell'); Game.log(game, +o, U.cap(Players.nameFor(game, +o, pl.id)) + ' lance le Grand Renvoi : vous perdez ' + U.tally(per[o]) + '.', { player: pl.id, alert: true }); }
    return { msg: U.n(n, 'créature renvoyée', 'créatures renvoyées') + ' dans ' + (n > 1 ? 'leur royaume' : 'son royaume') + (per[pl.id] ? ', dont les vôtres : ' + U.tally(per[pl.id]) : '') + '.' };
  },
  drain_power(game, pl, t) { const o = game.players[t.player]; const n = Math.min(o.mana, 50 + game.rng.int(101)); o.mana -= n; Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' draine ' + n + ' points de votre mana !', { player: pl.id, alert: true }); Diplomacy.adjust(game, o.id, pl.id, -10, 'hostile_spell'); return { msg: n + ' points de mana drainés à ' + o.name + '.' }; },
  subversion(game, pl, t) { const o = game.players[t.player]; for (const x of game.players) if (x !== o && x.alive) Diplomacy.adjust(game, x.id, o.id, -25, 'subversion'); Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' répand des rumeurs contre vous : les autres sorciers se méfient de vous (Subversion).', { player: pl.id, alert: true }); return { msg: 'Les sorciers se méfient désormais de ' + o.name + '.' }; },
  cruel_unminding(game, pl, t) { const o = game.players[t.player]; const pct = (1 + game.rng.int(10)) / 100; o.skillPoints = Math.max(1, Math.floor(o.skillPoints * (1 - pct * 2))); Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a lacéré votre esprit : compétence réduite.', { player: pl.id, alert: true }); Diplomacy.adjust(game, o.id, pl.id, -15, 'hostile_spell'); return { msg: 'La compétence de ' + o.name + ' est entamée.' }; },
  spell_blast(game, pl, t) { const o = game.players[t.player]; const rb = Rite.blast(game, pl, o); if (rb) return rb; if (!o.casting) return { ok: false, why: o.name + ' ne lance aucun sort.' }; if (pl.mana < o.casting.progress) return { ok: false, why: 'Mana insuffisant.' }; pl.mana -= o.casting.progress; Diplomacy.adjust(game, o.id, pl.id, -15, 'hostile_spell'); Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a pulvérisé votre incantation de ' + DATA.spells[o.casting.id].name + '.', { player: pl.id, alert: true }); o.casting = null; return { msg: 'Incantation adverse anéantie.' }; },
  spell_binding(game, pl, t) { const o = game.players[t.player]; if (!o.globals.length) return { ok: false, why: o.name + ' n\'a aucun enchantement global.' }; const g = t.spell && o.globals.includes(t.spell) ? t.spell : game.rng.pick(o.globals); o.globals = o.globals.filter(x => x !== g); if (!pl.globals.includes(g)) pl.globals.push(g); Units.fixAll(game, o.id); Diplomacy.adjust(game, o.id, pl.id, -20, 'hostile_spell'); Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' vous a volé ' + DATA.spells[g].name + '.', { player: pl.id, alert: true }); return { msg: 'Vous captez ' + DATA.spells[g].name + '.' }; },
  // force = mana investi (le triple pour la version vraie) ; jamais contre un allié ou un sorcier en paix avec vous
  disjunction(game, pl, t) { return OVERLAND_HANDLERS._disj(game, pl, 1, t); },
  disjunction_true(game, pl, t) { return OVERLAND_HANDLERS._disj(game, pl, 3, t); },
  _disj(game, pl, mult, t) { const foes = Spells.disjTargets(game, pl).map(x => x.o); if (!foes.length) return { ok: false, why: 'Aucun enchantement global adverse.' };
    const aimed = t && t.player != null && game.players[t.player] && game.players[t.player].globals.includes(t.spell) && foes.includes(game.players[t.player]);
    const o = aimed ? game.players[t.player] : game.rng.pick(U.uniq(foes)); const g = aimed ? t.spell : game.rng.pick(o.globals); const str = (DATA.spells[mult > 1 ? 'disjunction_true' : 'disjunction'].cost || 200) * mult; Diplomacy.adjust(game, o.id, pl.id, -10, 'hostile_spell'); if (game.rng.chance(Spells.dispelChance(game, str, g, o.id))) { o.globals = o.globals.filter(x => x !== g); Units.fixAll(game, o.id); Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a brisé votre ' + DATA.spells[g].name + '.'); return { msg: 'Vous brisez ' + DATA.spells[g].name + ' ' + U.de(Players.nameFor(game, pl.id, o.id)) + '.' }; } Game.log(game, o.id, U.cap(Players.nameFor(game, o.id, pl.id)) + ' a tenté de briser votre ' + DATA.spells[g].name + ' : il a résisté.', { player: pl.id }); return { msg: DATA.spells[g].name + ' ' + U.de(Players.nameFor(game, pl.id, o.id)) + ' résiste à la Disjonction.' }; },
  dispel_magic(game, pl, t) { const u = game.units[t.unit]; if (u.owner === pl.id) return { ok: false, why: 'Ces enchantements sont les vôtres.' }; const before = u.ench.length, str = DATA.spells.dispel_magic.cost || 20; u.ench = Spells.dispelEnch(u.ench, e => game.rng.chance(Spells.dispelChance(game, str, e, u.owner))); Units.fixHp(game, u); Game.drownStranded(game, u.plane, u.x, u.y); return { msg: U.n(before - u.ench.length, 'enchantement dissipé', 'enchantements dissipés') + '.' }; },
  dispel_magic_true(game, pl, t) { const u = game.units[t.unit]; if (u.owner === pl.id) return { ok: false, why: 'Ces enchantements sont les vôtres.' }; const before = u.ench.length, str = (DATA.spells.dispel_magic_true.cost || 20) * 3; u.ench = Spells.dispelEnch(u.ench, e => game.rng.chance(Spells.dispelChance(game, str, e, u.owner))); Units.fixHp(game, u); Game.drownStranded(game, u.plane, u.x, u.y); return { msg: U.n(before - u.ench.length, 'enchantement dissipé', 'enchantements dissipés') + '.' }; },
  // force égale au mana investi : 50 (le triple pour la version vraie), contre le coût de chaque enchantement
  disenchant_area(game, pl, t) { return OVERLAND_HANDLERS._disarea(game, pl, t, DATA.spells.disenchant_area.cost || 50); },
  disenchant_true(game, pl, t) { return OVERLAND_HANDLERS._disarea(game, pl, t, (DATA.spells.disenchant_true.cost || 50) * 3); },
  _disarea(game, pl, t, str) {
    let n = 0; const names = [], hit = new Set();
    for (const u of Units.at(game, t.plane, t.x, t.y)) if (u.owner !== pl.id && !Spells.treaty(game, pl, u.owner)) { const b = u.ench.slice(); u.ench = Spells.dispelEnch(u.ench, e => game.rng.chance(Spells.dispelChance(game, str, e, u.owner))); for (const e of b) if (!u.ench.includes(e) && DATA.spells[e]) { names.push(DATA.spells[e].name + ' (' + Units.label(u) + ')'); if (u.owner >= 0) hit.add(u.owner); } n += b.length - u.ench.length; Units.fixHp(game, u); }
    Game.drownStranded(game, t.plane, t.x, t.y);   // sans Vol ni Marche sur l'eau, plus rien ne les porte
    const si = World.get(game.world, t.plane, 'site', t.x, t.y), st = si >= 0 ? game.sites[si] : null;
    if (st && st.warped != null && st.warped !== pl.id && game.rng.chance(Spells.dispelChance(game, str, 'warp_node', st.warped))) { st.warped = null; n++; }
    // 0.31.29 (comme Master of Magic) : sur un nœud rival, la garde de l'esprit gardien tombe ; le nœud reste à son sorcier,
    // mais un esprit adverse le lui reprend de nouveau à 75 %
    if (st && st.type === 'node' && st.meldBy === 'GuardianSpirit' && st.owner >= 0 && st.owner !== pl.id && !Spells.treaty(game, pl, st.owner)) {
      st.meldBy = 'MagicSpirit'; n++; names.push(U.txt('la garde de l\'esprit gardien du nœud')); hit.add(st.owner);
      Diplomacy.adjust(game, st.owner, pl.id, -5, 'hostile_spell');
    }
    const c = Cities.at(game, t.plane, t.x, t.y);
    if (c) { const b = c.ench.slice(); c.ench = c.ench.filter(e => e.owner === pl.id || !game.rng.chance(Spells.dispelChance(game, str, e.spell, e.owner))); for (const e of b) if (!c.ench.includes(e) && DATA.spells[e.spell]) { names.push(DATA.spells[e.spell].name + ' (' + c.name + ')'); if (e.owner >= 0) hit.add(e.owner); } n += b.length - c.ench.length; }
    for (const o of hit) if (o !== pl.id && game.players[o]) Game.log(game, o, U.cap(Players.nameFor(game, o, pl.id)) + ' a dissipé ' + names.join(', ') + '.', { x: t.x, y: t.y, plane: t.plane, player: pl.id });
    return { msg: n ? 'Dissipés : ' + names.join(', ') + (n > names.length ? ' et le sort qui pervertissait le nœud' : '') + '.' : 'Rien n\'a cédé.' };
  },
  warp_node(game, pl, t) {
    const si = World.get(game.world, t.plane, 'site', t.x, t.y), s = si >= 0 ? game.sites[si] : null;
    if (!s || s.type !== 'node') return { ok: false, why: 'Il faut viser un nœud.' };
    if (s.owner == null || s.owner < 0 || s.owner === pl.id) return { ok: false, why: 'Il faut un nœud lié à un sorcier rival.' };
    if (s.warped != null) return { ok: false, why: 'Ce nœud est déjà perverti.' };
    s.warped = pl.id;
    Game.log(game, s.owner, U.cap(Players.nameFor(game, s.owner, pl.id)) + ' a perverti votre ' + Game.siteName(s) + ' : il vous coûte 5 mana par tour.', { x: s.x, y: s.y, plane: s.plane, player: pl.id });
    Diplomacy.adjust(game, s.owner, pl.id, -10, 'hostile_spell');
    return { msg: 'Le ' + Game.siteName(s) + ' est perverti.' };
  },
  lycanthropy(game, pl, t) { const u = game.units[t.unit]; const w = Units.create(game, 'WereWolf', pl.id, u.plane, u.x, u.y); w.moves = 0; Units.remove(game, u); return { msg: 'Vos soldats deviennent des loups-garous.' }; },
  stasis(game, pl, t) {
    const us = Units.at(game, t.plane, t.x, t.y).filter(u => u.owner !== pl.id && !Spells.treaty(game, pl, u.owner) && !Units.stats(game, u).ab.magicImmunity && !(typeof Intel !== 'undefined' && Intel.hiddenFrom(game, pl.id, u)));
    if (!us.length) return { ok: false, why: 'Aucune unité ennemie à figer ici.' };
    for (const u of us) { u.stasis = 1; u.moves = 0; u.stasisBy = pl.id; }
    if (us[0].owner >= 0) { Diplomacy.adjust(game, us[0].owner, pl.id, -10, 'hostile_spell'); Game.log(game, us[0].owner, U.cap(Players.nameFor(game, us[0].owner, pl.id)) + ' a figé vos troupes dans la stase.', { x: t.x, y: t.y, plane: t.plane, player: pl.id, alert: true }); }
    return { msg: 'Les ennemis sont figés.' };
  },
};
