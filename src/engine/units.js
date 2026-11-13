'use strict';
// Unités : création, statistiques effectives, expérience, entretien.

const Units = {
  def(u) { return DATA.units[u.type]; },
  isHero(u) { return !!u.hero; },
  isFantastic(u) { const d = DATA.units[u.type]; return d.race === 'fantastic'; },
  // unité normale par sa race (troupes recrutées), qu'elle ait été changée ou non en mort-vivant ou en créature du chaos
  isBaseNormal(u) { const d = DATA.units[u.type]; return d.race !== 'fantastic' && d.race !== 'hero'; },
  // une unité normale relevée en mort-vivant, sous Canaux noirs ou changée par les Canaux du chaos n'est plus une unité normale
  // (comme dans MoM : plus de Commandement, d'Armes saintes, d'Héroïsme…)
  isNormal(u) { return Units.isBaseNormal(u) && !Units.isUndead(u) && !u.chaosChannel; },
  // bêtes et machines de guerre des peuples : elles se battent sans armes (pas d'armes magiques des alchimistes)
  BEASTS: new Set(['StagBeetle', 'DragonTurtle', 'Griffin', 'Manticore', 'Nightmares', 'DoomDrake', 'Golem', 'WarMammoths', 'WyvernRiders']),
  // troupes montées (cavaliers, archers montés, chevaucheurs) : elles chargent, mais ne se mettent pas en garde
  MOUNTED: new Set(['Cavalry', 'Horsebowmen', 'Paladins', 'Wolf Riders', 'Pegasi', 'Nightmares', 'Centaurs', 'Wyvern Riders', 'Scouts']),
  isMounted(u) { const d = u && DATA.units[u.type]; return !!d && d.race !== 'hero' && d.race !== 'fantastic' && Units.MOUNTED.has(d.en); },
  // fantassins (héros à pied compris) : ils peuvent se mettre en garde
  isInfantry(u) {
    const d = u && DATA.units[u.type]; if (!d || d.race === 'fantastic' || u.type === 'WizardAvatar') return false;
    return !Units.isMounted(u) && !Units.BEASTS.has(u.type) && !d.abilities.siegeOnly && u.type !== 'Catapult' && u.type !== 'SteamCannon' && !d.sailing && d.race !== undefined;
  },
  wieldsWeapons(u) { const d = u && DATA.units[u.type]; return !!d && !Units.BEASTS.has(u.type) && (d.melee > 0 || (d.ranged > 0 && d.rangedType !== 'magic')); },
  // les armes que reçoit une unité qui sort d'une cité (rang des armes de la cité, ou aucune pour une bête)
  weaponFor(type, tier) { return Units.BEASTS.has(type) ? 0 : tier || 0; },
  isUndead(u) { return !!u.undead || !!(u.ench && u.ench.includes('black_channels')); },
  realmOf(u) { const d = DATA.units[u.type]; if (Units.isUndead(u)) return 'death'; if (u.chaosChannel) return 'chaos'; return d.realm || null; },
  // catégorie magique de l'unité, celle que regardent les sorts (normale, héros, créature fantastique, royaume, mort-vivant)
  kind(u) {
    const d = DATA.units[u.type];
    return { hero: !!u.hero || d.race === 'hero', fantastic: Units.isFantastic(u), normal: Units.isNormal(u), realm: Units.realmOf(u), undead: Units.isUndead(u), race: d.race };
  },
  // ce sort peut-il viser cette unité, d'après sa seule nature (sans tenir compte des enchantements déjà posés)
  // un enchantement qui ne changerait rien à cette unité : la raison, sinon null (Héroïsme sur une élite, Arme bénie sous Armes saintes)
  enchantUseless(game, u, id) {
    if (id === 'heroism') {
      if (u.hero || Units.isFantastic(u)) return 'Sans effet sur ' + (u.hero ? 'un héros.' : 'une créature.');
      let lv = 0; for (let i = 0; i <= 3; i++) if (u.xp >= NORMAL_LEVELS[i].xp) lv = i;
      if (lv >= 3) return 'L\'unité est déjà élite.';
    }
    if (id === 'holy_weapon') { const pl = game.players[u.owner]; if (pl && pl.globals && pl.globals.includes('holy_arms')) return 'Armes saintes le font déjà.'; }
    if (id === 'giant_strength') { const st = Units.stats(game, u); if (!(st.melee > 0) && !(st.thrown > 0)) return 'L\'unité ne combat ni au corps à corps ni au jet.'; }
    return null;
  },
  spellFits(game, u, id) {
    const sp = DATA.spells[id]; if (!sp) return false;
    if (sp.kind === 'unitEnchant' && Units.enchantUseless(game, u, id)) return false;
    const p = sp.params || {}, s = Units.stats(game, u), realm = Units.realmOf(u);
    if (p.normalOnly && !Units.isNormal(u)) return false;
    if (p.fantasticOnly && !Units.isFantastic(u)) return false;
    if (p.onlyRealms && !p.onlyRealms.includes(realm)) return false;
    const cats = ['fantastic', 'undead', 'normal', 'life', 'death', 'chaos', 'nature', 'sorcery', 'arcane'];
    if (p.targets && p.targets.every(t => cats.includes(t)) && !p.targets.some(t => t === 'fantastic' ? Units.isFantastic(u) : t === 'undead' ? Units.isUndead(u) : t === 'normal' ? Units.isNormal(u) : realm === t)) return false;
    if (['curse', 'damage', 'resistOrDie'].includes(sp.kind) && s.ab.magicImmunity && id !== 'doom_bolt') return false;
    if (id === 'web' && s.ab.nonCorporeal) return false;
    if (id === 'cracks_call' && (s.flying || s.ab.nonCorporeal)) return false;
    if (id === 'healing' && realm === 'death') return false;
    return true;
  },
  isSettler(u) { return !!DATA.units[u.type].abilities.createOutpost; },
  isEngineer(u) { return !!DATA.units[u.type].abilities.construction; },
  // peut-elle guérir en restant dans une cité ? (les morts-vivants et les créatures de la mort ne guérissent pas, sauf régénération)
  canHealInCity(game, u) { return u.dmg > 0 && (Units.realmOf(u) !== 'death' || Units.has(game, u, 'regeneration')); },
  isScout(u) { return !!DATA.units[u.type].abilities.scout; },

  create(game, type, owner, plane, x, y, extra) {
    const d = DATA.units[type];
    if (!d) throw new Error('Unité inconnue : ' + type);
    const u = {
      id: game.nextId++, type, owner, plane, x, y,
      dmg: 0, xp: 0, moves: 0, ench: [], weapon: 0, undead: false,
      summoned: d.race === 'fantastic', status: '', path: null, hero: null, born: game.turn,
    };
    if (extra) Object.assign(u, extra);
    game.units[u.id] = u;
    u.moves = Units.maxMoves(game, u);
    return u;
  },

  // forever : le héros quitte le monde pour de bon (livré à un pacte), il ne rejoint pas les héros tombés
  remove(game, u, opts) {
    const ship = game.units[u.id] && !(opts && opts.drowned) && World.isWaterAt(game.world, u.plane, u.x, u.y) && (s0 => s0.sailing || (s0.flying && Move.capacity(u)) || s0.ab.windWalking)(Units.stats(game, u));   // qui portait la pile
    delete game.units[u.id];
    if (ship) Game.drownStranded(game, u.plane, u.x, u.y);   // un navire qui disparaît en mer emporte ceux qu'il portait
    const pl = game.players[u.owner];
    // l'avatar qui regagne sa tour garde son expérience, ses talents et ses objets pour la prochaine descente
    if (u.avatar && u.recalled) { if (pl) pl.avatarSave = { xp: u.xp, hero: u.hero, items: u.items }; return; }
    // les objets d'un héros qui disparaît (tombé, congédié, livré) retournent au coffre de la forteresse
    if (u.items && pl) { pl.vault = pl.vault || []; for (const it of u.items) if (it) pl.vault.push(it); u.items = u.items.map(() => null); }
    if (u.avatar) { Game.avatarFell(game, u); return; }
    if (u.hero && opts && opts.forever) { (game.goneHeroes = game.goneHeroes || []).push(u.type); return; }   // parti pour toujours : ne revient jamais
    if (u.hero && game.players[u.owner] && !(opts && opts.forever)) {
      const pl = game.players[u.owner];
      pl.deadHeroes = pl.deadHeroes || [];
      if (!pl.deadHeroes.some(h => h.type === u.type)) pl.deadHeroes.push({ type: u.type, hero: u.hero, xp: u.xp });
    }
  },

  // (Object.values : même ordre que for…in sur les unités, en plus rapide)
  at(game, plane, x, y) {
    // (performance) boucle indicée, x comparé d'abord (le plus sélectif) : mêmes unités, dans le même ordre
    const out = [], us = Object.values(game.units);
    for (let i = 0; i < us.length; i++) { const u = us[i]; if (u.x === x && u.y === y && u.plane === plane) out.push(u); }
    return out;
  },

  // ------- niveaux -------
  levelIndex(game, u) {
    const pl = game.players[u.owner];
    const warlord = pl && pl.retorts && pl.retorts.includes('warlord') ? 1 : 0;
    const crusade = pl && pl.globals && pl.globals.includes('crusade') ? 1 : 0;
    if (u.hero) {
      let lv = 0; for (let i = 0; i < HERO_LEVELS.length; i++) if (u.xp >= HERO_LEVELS[i].xp) lv = i;
      return Math.min(8, lv + warlord + crusade);
    }
    if (Units.isFantastic(u)) return 0;
    let lv = 0; for (let i = 0; i <= 3; i++) if (u.xp >= NORMAL_LEVELS[i].xp) lv = i;
    if (u.ench.includes('heroism')) lv = Math.max(lv, 3);
    return Math.min(5, lv + warlord + crusade);
  },
  levelInfo(game, u) {
    if (Units.isFantastic(u)) return null;
    const i = Units.levelIndex(game, u);
    return u.hero ? HERO_LEVELS[i] : NORMAL_LEVELS[i];
  },

  // ------- mémo des capacités et des stats (performance) -------
  // abilities et stats sont des fonctions pures de quelques champs de l'unité (type, enchantements, expérience, arme, talents
  // et objets d'un héros…) et de l'état de son sorcier (retours, sorts globaux, ouvrages) : le résultat est gardé par unité et
  // resservi tant que tous ces champs sont identiques (revérifiés à chaque appel). Les avatars sont toujours recalculés.
  // L'objet mémorisé n'est jamais modifié : stats en rend une copie, _st (lecture seule) le rend tel quel.
  _memo: new WeakMap(),
  _sameEnch(a, e, x) {
    const n = e.length, k = x ? x.length : 0;
    if (a.length !== n + k) return false;
    for (let i = 0; i < n; i++) if (a[i] !== e[i]) return false;
    for (let i = 0; i < k; i++) if (a[n + i] !== x[i]) return false;
    return true;
  },
  _sameList(copy, arr) {
    if (!arr) return copy === null;
    if (copy === null || copy.length !== arr.length) return false;
    for (let i = 0; i < arr.length; i++) if (copy[i] !== arr[i]) return false;
    return true;
  },
  // un héros (ou un porteur d'objets) : ses talents (hero.extra) et ses objets, mis à plat ; null pour une unité ordinaire
  _heroSig(u) {
    if (!u.hero && !u.items) return null;
    const out = [!!u.hero], ex = u.hero && u.hero.extra;
    if (ex) for (const k in ex) out.push(k, ex[k]);
    out.push('|');
    // (boucles indicées : sans itérateur à allouer, mêmes éléments dans le même ordre)
    if (u.items) {
      const items = u.items;
      out.push(items.length);
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        if (!it) { out.push(null); continue; }
        out.push(it, it.melee, it.ranged, it.def, it.res, it.move, it.toHit, it.hp, it.skill, it.kind);
        const p = it.powers; if (p) { out.push(p.length); for (let q = 0; q < p.length; q++) out.push(p[q]); } else out.push(-1);
      }
    } else out.push(-2);
    return out;
  },
  _heroSame(a, u) {
    if (a === null) return !u.hero && !u.items;
    if (a[0] !== !!u.hero) return false;
    let i = 1; const ex = u.hero && u.hero.extra;
    if (ex) for (const k in ex) { if (a[i] !== k || a[i + 1] !== ex[k]) return false; i += 2; }
    if (a[i++] !== '|') return false;
    if (!u.items) return a[i] === -2 && i + 1 === a.length;
    const items = u.items;
    if (a[i++] !== items.length) return false;
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      if (!it) { if (a[i++] !== null) return false; continue; }
      if (a[i] !== it || a[i + 1] !== it.melee || a[i + 2] !== it.ranged || a[i + 3] !== it.def || a[i + 4] !== it.res || a[i + 5] !== it.move
        || a[i + 6] !== it.toHit || a[i + 7] !== it.hp || a[i + 8] !== it.skill || a[i + 9] !== it.kind) return false;
      i += 10;
      const p = it.powers;
      if (p) { if (a[i++] !== p.length) return false; for (let q = 0; q < p.length; q++) if (a[i++] !== p[q]) return false; } else if (a[i++] !== -1) return false;
    }
    return i === a.length;
  },
  _chaosSurge(game) { return !!(game.players && game.players.some(o => o && o.alive && o.globals && o.globals.includes('chaos_surge'))); },
  // stats en lecture seule (mémo) ; key/extra : l'unité d'une bataille et ses enchantements temporaires (Battle.ust)
  _st(game, u, key, extra) {
    if (u.avatar) return Units._stats(game, extra && extra.length ? Object.assign({}, u, { ench: u.ench.concat(extra) }) : u);
    if (!key) key = u;
    const pl = game.players[u.owner];
    let m = Units._memo.get(key);
    if (m && m.s && m.type === u.type && m.undead === u.undead && m.cc === u.chaosChannel && m.game === game && m.owner === u.owner && m.pl === pl
      && m.xp === u.xp && m.weapon === u.weapon && m.nem === (u.nemesis && u.nemesis.lvl) && m.gr === u.grow && m.mi === u.might && Units._sameEnch(m.ench, u.ench, extra) && Units._heroSame(m.hs, u)
      && Units._sameList(m.glob, pl ? pl.globals : null) && Units._sameList(m.ret, pl ? pl.retorts : null)
      && m.drac === !!(pl && pl.wonders && pl.wonders.draconian != null) && (m.chaos === null || m.chaos === Units._chaosSurge(game))) return m.s;
    const obj = extra && extra.length ? Object.assign({}, u, { ench: u.ench.concat(extra) }) : u;
    const s = Units._stats(game, obj);
    m = { type: obj.type, undead: obj.undead, cc: obj.chaosChannel, ench: obj.ench.slice(), hs: Units._heroSig(obj), ab: s.ab, s,
      game, owner: obj.owner, pl, xp: obj.xp, weapon: obj.weapon, nem: obj.nemesis && obj.nemesis.lvl, gr: obj.grow, mi: obj.might,
      glob: pl && pl.globals ? pl.globals.slice() : null, ret: pl && pl.retorts ? pl.retorts.slice() : null,
      drac: !!(pl && pl.wonders && pl.wonders.draconian != null), chaos: Units.realmOf(obj) === 'chaos' ? Units._chaosSurge(game) : null };
    Units._memo.set(key, m);
    return s;
  },

  // ------- capacités -------
  abilities(game, u) {
    if (u.avatar) return Units._abilities(game, u);
    const m = Units._memo.get(u);
    if (m && m.type === u.type && m.undead === u.undead && m.cc === u.chaosChannel && Units._sameEnch(m.ench, u.ench, null) && Units._heroSame(m.hs, u)) return m.ab;
    const ab = Units._abilities(game, u);
    Units._memo.set(u, { type: u.type, undead: u.undead, cc: u.chaosChannel, ench: u.ench.slice(), hs: Units._heroSig(u), ab, s: null });
    return ab;
  },
  _abilities(game, u) {
    const d = DATA.units[u.type];
    const ab = Object.assign({}, d.abilities);
    if (u.avatar) Object.assign(ab, u.avatar.ab);
    if (u.hero && u.hero.extra) Object.assign(ab, u.hero.extra);
    for (const e of u.ench) {
      const s = DATA.spells[e]; if (!s) continue;
      const a = s.params && s.params.ability;
      if (a) for (const k of (Array.isArray(a) ? a : [a])) ab[k] = ab[k] || true;
      if (e === 'flight') ab.flying = true;
      if (e === 'wind_walking') ab.windWalking = true;   // vol de toute la pile hors combat seulement (Move), pas en combat
      if (e === 'water_walking') ab.waterWalking = true;
      if (e === 'immolation') ab.immolation = 4;
      if (e === 'invulnerability') ab.weaponImmunity = true;
      if (e === 'wraithform') { ab.weaponImmunity = true; ab.nonCorporeal = true; }
    }
    if (u.chaosChannel === 'demonWings') ab.flying = true;
    if (u.chaosChannel === 'fireBreath' && !ab.fireBreath) ab.fireBreath = 2;
    if (Units.isUndead(u)) { ab.poisonImmunity = true; ab.deathImmunity = true; ab.illusionsImmunity = true; ab.coldImmunity = true; }
    // un pouvoir d'objet ne remplace pas une capacité chiffrée plus forte (Toucher venimeux 5 reste 5)
    if (u.items) for (const it of u.items) if (it && it.powers) for (const pw of it.powers) { const a = ITEM_POWERS[pw] && ITEM_POWERS[pw].ability; if (a) ab[a] = ab[a] || ITEM_POWERS[pw].value || true; }
    return ab;
  },
  has(game, u, ab) { return !!Units.abilities(game, u)[ab]; },

  // ------- stats effectives (hors combat) -------
  // les colons sont des civils : 4 points de vie (un peu plus chez les peuples robustes), au lieu des 10 du jeu d'origine
  baseHp(d) { return d.abilities && d.abilities.createOutpost ? Math.round(4 + Math.max(0, d.hp - 10) / 7.5) : d.hp; },
  // une copie (l'appelant peut la modifier) des stats mémorisées
  stats(game, u, ctx) { return { ...Units._st(game, u, null, null) }; },
  _stats(game, u, ctx) {
    const d = DATA.units[u.type];
    const pl = game.players[u.owner];
    const ab = Units.abilities(game, u);
    const s = {
      figures: d.figures, melee: d.melee, ranged: d.ranged, rangedType: d.rangedType, rangedRealm: d.rangedRealm,
      ammo: d.ammo, def: d.def, res: d.res, hp: Units.baseHp(d), move: d.move, toHit: 30, toDefend: 30, thrown: ab.thrown ? Number(ab.thrown) : 0,
      breath: ab.fireBreath ? Number(ab.fireBreath) : ab.lightningBreath ? Number(ab.lightningBreath) : 0,
      flying: !!(d.flying || ab.flying), swimming: !!d.swimming, sailing: !!d.sailing, ab, level: null,
      // armes magiques : alchimie, et toujours pour les héros et les créatures fantastiques (l'immunité aux armes ne protège que des troupes)
      magicWeapon: u.weapon > 0 || !!u.hero || d.race === 'hero' || d.race === 'fantastic',
      caster: ab.caster ? Number(ab.caster) : 0,
    };
    if (u.avatar) { const a = u.avatar; s.melee += a.melee; s.ranged += a.ranged; s.rangedRealm = a.realm; s.def += a.def; s.res += a.res; s.hp += a.hp; s.caster = a.caster + Math.max(0, s.caster - Number(d.abilities.caster || 0)); if (a.ab.flying) s.flying = true; }
    if (ab.toHit) s.toHit += Number(ab.toHit); // valeur en points de pourcentage (10 = +10 %)
    if (ab.lucky) { s.toHit += 10; s.toDefend += 10; s.res += 1; }
    // niveau d'expérience
    const lv = Units.levelInfo(game, u);
    if (lv) {
      s.level = lv;
      s.melee += s.melee > 0 ? lv.melee : 0;
      if (s.ranged > 0) s.ranged += lv.melee;
      if (s.thrown > 0) s.thrown += lv.melee;
      if (s.breath > 0) s.breath += lv.melee;
      s.toHit += lv.toHit * 10; s.def += lv.def; s.res += lv.res; s.hp += lv.hp;
    }
    // armes magiques
    if (u.weapon === 2) { if (s.melee) s.melee += 1; if (s.ranged && s.rangedType !== 'magic') s.ranged += 1; s.def += 1; }
    if (u.weapon === 3) { if (s.melee) s.melee += 2; if (s.ranged && s.rangedType !== 'magic') s.ranged += 2; s.def += 2; }
    if (u.weapon >= 1) s.toHit += 10;
    // héros : capacités qui croissent avec le niveau
    if (u.hero) {
      const L = Units.levelIndex(game, u) + 1;
      const per = (k, sup) => ab[sup] ? Math.floor(L * 1.5) : ab[k] ? L : 0;
      s.melee += per('might', 'superMight');
      s.def += per('agility', 'superAgility');
      s.hp += per('constitution', 'superConstitution');
      if (s.rangedType === 'magic') s.ranged += per('arcanePower', 'superArcanePower');
      if (ab.blademaster || ab.superBlademaster) s.toHit += 10 * Math.floor(L * (ab.superBlademaster ? 0.75 : 0.5));
      if (s.caster) s.caster = Math.floor(s.caster * (1 + (L - 1) * 0.5));
      // objets
      if (u.items) for (const it of u.items) if (it) {
        s.melee += (it.melee || 0) * (s.melee > 0 ? 1 : 0); s.ranged += (it.ranged || 0) * (s.ranged > 0 ? 1 : 0);
        s.def += it.def || 0; s.res += it.res || 0; s.move += it.move || 0; s.toHit += 10 * (it.toHit || 0); s.hp += it.hp || 0; s.caster += it.skill || 0;
        if (it.kind === 'axe' && s.thrown) s.thrown += it.melee || 0;   // une hache sert aussi au lancer
        // pouvoirs chiffrés (Enflammé : +3 en mêlée)
        for (const pw of it.powers || []) { const P = ITEM_POWERS[pw]; if (P && P.melee && s.melee > 0) s.melee += P.melee; }
      }
    }
    if (u.chaosChannel === 'demonSkin') s.def += 3;
    if (s.breath > 0 && d.race === 'draconian' && pl && pl.wonders && pl.wonders.draconian != null) s.breath += 2;   // Aire des Ancêtres
    if (u.chaosChannel === 'demonWings') s.move = Math.max(s.move, 2);
    // enchantements
    let moveMult = 1;
    for (const e of u.ench) {
      const sp = DATA.spells[e]; if (!sp) continue;
      const p = sp.params || {};
      if (p.vs) continue; // bonus conditionnels : gérés en combat
      if (e === 'berserk') continue;
      if (e === 'heroism') continue;
      if (e === 'haste') { moveMult = 2; continue; }
      if (e === 'flight') { s.move = Math.max(s.move, 3); s.flying = true; continue; }
      if (e === 'wind_walking') continue;   // vitesse 3 hors combat : voir maxMoves
      if (e === 'endurance') { s.move += 1; continue; }
      if (p.melee && s.melee > 0) s.melee += p.melee;
      if (p.ranged && s.ranged > 0 && (s.rangedType !== 'magic' || e === 'black_channels')) s.ranged += p.ranged;
      if (p.thrown && s.thrown > 0) s.thrown += p.thrown;
      if (p.breath && s.breath > 0) s.breath += p.breath;
      if (p.def) s.def += p.def;
      if (p.res) s.res += p.res;
      if (p.hp) s.hp += p.hp;
      if (p.toHitPct) s.toHit += p.toHitPct;
      if (p.magicWeapon) s.magicWeapon = true;
    }
    if (u.ench.includes('black_channels')) { /* déjà appliqué via params */ }
    // enchantements globaux du propriétaire
    if (pl && pl.globals) {
      // Armes saintes et Arme bénie ne se cumulent pas
      if (pl.globals.includes('holy_arms') && Units.isNormal(u)) { if (!u.ench.includes('holy_weapon')) s.toHit += 10; s.magicWeapon = true; }
      if (pl.globals.includes('charm_of_life')) s.hp = Math.max(s.hp + 1, Math.ceil(s.hp * 1.25));
    }
    // Chaos Surge : bénéficie à toutes les créatures du chaos
    if (Units.realmOf(u) === 'chaos' && game.players && game.players.some(o => o && o.alive && o.globals && o.globals.includes('chaos_surge'))) { if (s.melee) s.melee += 2; if (s.ranged) s.ranged += 2; if (s.breath) s.breath += 2; }
    s.move *= moveMult;
    s.haste = moveMult > 1;
    if (s.flying) s.move = Math.max(s.move, d.flying ? d.move : s.move);
    if (u.nemesis) Nemesis.apply(u, s);
    if (u.grow && typeof Finale !== 'undefined') Finale.grow(u, s);   // le Dévoreur de nœuds, le Seigneur liche relevé
    if (u.might && typeof Finale !== 'undefined') Finale.might(u, s);   // le monstre d'une crise, plus fort que le meilleur champion de sa proie
    s.maxHp = s.hp * s.figures;
    return s;
  },

  // sur la carte, certaines unités vont plus vite qu'en combat (overlandMove : l'esprit magique)
  maxMoves(game, u) {
    const d = DATA.units[u.type], m = Units._st(game, u, null, null).move;
    let mv = (d.overlandMove != null && d.overlandMove > d.move ? m + d.overlandMove - d.move : m) * 2;
    if (u.ench && u.ench.includes('wind_walking')) mv = Math.max(mv, 6);
    // Maîtrise des vents : navires (îles flottantes et navires volants compris) du lanceur +50 %, ceux de ses rivaux −50 %
    if (d.sailing || u.type === 'FloatingIsland' || u.type === 'AirShip') {
      const holder = (game.players || []).find(o => o && o.alive && o.globals && o.globals.includes('wind_mastery'));
      if (holder) mv = holder.id === u.owner ? Math.floor(mv * 1.5) : Math.max(2, Math.floor(mv / 2));
    }
    return mv;
  },
  health(game, u) { const s = Units._st(game, u, null, null); return Math.max(0, s.maxHp - u.dmg); },
  // les PV maximum ont baissé (enchantement dissipé, objet retiré, sort de combat terminé) : l'unité garde au moins 1 PV
  fixHp(game, u) { if (!u || !(u.dmg > 0)) return; const m = Units.stats(game, u).maxHp; if (u.dmg >= m) u.dmg = Math.max(0, m - 1); },
  fixAll(game, pid) { for (const u of Object.values(game.units)) if (u.owner === pid) Units.fixHp(game, u); },   // après la perte d'un enchantement global (Charme de vie…)
  aliveFigures(game, u) { const s = Units._st(game, u, null, null); const h = s.maxHp - u.dmg; return Math.max(0, Math.ceil(h / s.hp)); },
  // au-delà de 100 %, chaque coup porte déjà : chaque tranche de 10 % de plus fait ignorer 1 point de défense à la cible
  pierce(th) { return th > 100 ? Math.floor((th - 100) / 10) : 0; },
  strength(game, u) { // estimation de puissance pour l'IA
    const s = Units._st(game, u, null, null);
    const f = Units.aliveFigures(game, u);
    let atk = s.melee + s.ranged * 0.8 + s.thrown * 0.6 + s.breath * 0.7;
    // un point de défense ignoré vaut à peu près un dé de plus à 30 % (le bouclier adverse en arrête 30 %)
    let v = f * (atk * (Math.min(100, s.toHit) / 30) + (atk > 0 ? Units.pierce(s.toHit) : 0) + 1) * (1 + s.def * 0.35) * (s.hp) * 0.6;
    if (s.ab.weaponImmunity) v *= 1.4; if (s.ab.magicImmunity) v *= 1.3; if (s.flying) v *= 1.15;
    if (s.ab.firstStrike) v *= 1.15; if (s.ab.armorPiercing) v *= 1.15; if (s.ab.poisonTouch || s.ab.lifeSteal || s.ab.deathGaze || s.ab.stoningGaze) v *= 1.25;
    if (s.ab.regeneration) v *= 1.2; if (s.ab.invisibility) v *= 1.2;
    if (u.hero) v *= 1.3;
    if (s.ab.siegeOnly) v *= 0.3; // ne frappe que les tours
    return Math.round(v + 1);
  },

  upkeep(game, u) {
    const d = DATA.units[u.type];
    const pl = game.players[u.owner];
    if (u.nodeBound != null || u.pactFree) return { gold: 0, food: 0, mana: 0 };
    const up = { gold: d.upkeep.gold, food: d.upkeep.food, mana: d.upkeep.mana };
    if (d.abilities.createOutpost) up.food = 0; // les colons emportent leurs vivres
    // mort-vivant relevé : ni solde ni vivres, du mana à la place
    if (u.undead && !d.upkeep.mana && Units.isBaseNormal(u)) { up.mana = Math.ceil(Math.max(1, d.cost / 20) * 1.5); up.gold = 0; up.food = 0; }
    else if (u.undead && up.mana && !Units.isBaseNormal(u)) up.mana = Math.ceil(up.mana * 1.5);   // créature relevée par Animation des morts : entretien majoré de 50 %
    // un héros noble ne coûte pas d'or (il en rapporte)
    if (u.hero && up.gold && Units.has(game, u, 'noble')) up.gold = 0;
    if (pl && pl.retorts) {
      if (pl.retorts.includes('conjurer') && up.mana) up.mana = Math.ceil(up.mana * 0.75);
      if (pl.retorts.includes('channeler') && up.mana) up.mana = Math.ceil(up.mana / 2);
    }
    // enchantements d'unité : entretien en mana
    for (const e of u.ench) { const s = DATA.spells[e]; if (s && s.upkeep) up.mana += pl && pl.retorts && pl.retorts.includes('channeler') ? Math.ceil(s.upkeep / 2) : s.upkeep; }
    return up;
  },

  name(u) {
    if (u.hero) return u.hero.name;
    return DATA.units[u.type].name;
  },
  // le métal des armes d'une troupe (0 : ordinaires)
  WEAPON_WORDS: ['', 'magiques', 'en mithril', 'en adamantium'],
  raceAdj(raceId) {
    return { barbarian: 'barbares', gnoll: 'gnolls', halfling: 'halfelins', highelf: 'hauts-elfes', highmen: 'hauts-hommes', klackon: 'klackons', lizardman: 'hommes-lézards', nomad: 'nomades', orc: 'orques', beastmen: 'hommes-bêtes', darkelf: 'elfes noirs', draconian: 'draconiens', dwarf: 'nains', troll: 'trolls' }[raceId] || '';
  },
  // accord sujet-verbe : « Épéistes orques attaquent », « Géant de feu attaque »
  plural(u) { const d = DATA.units[u.type]; return !u.hero && d && d.figures > 1; },
  conj(u, phrase) {
    if (!Units.plural(u)) return phrase;
    const m = phrase.match(/^(se )?(\S+?)([.!,:]?)( .*)?$/); if (!m) return phrase;
    let [, se, w, punct, rest] = m; rest = rest || '';
    if (w === 'est') {
      const m2 = rest.match(/^ (\S+?)([.!,:]?)( .*)?$/);
      if (m2) { let adj = m2[1]; if (/[éiut]$/.test(adj)) adj += 's'; return 'sont ' + adj + m2[2] + (m2[3] || '') + punct; }
      return 'sont' + punct + rest;
    }
    const IRR = { revient: 'reviennent', devient: 'deviennent', tient: 'tiennent', perd: 'perdent', meurt: 'meurent', périt: 'périssent', subit: 'subissent', fuit: 'fuient', a: 'ont', va: 'vont', peut: 'peuvent', doit: 'doivent', sort: 'sortent' };
    if (IRR[w]) w = IRR[w]; else if (/e$/.test(w)) w += 'nt';
    return (se || '') + w + punct + rest;
  },
  // dans une autre langue : le verbe traduit, au pluriel si la troupe compte plusieurs figurines (le pluriel français, traduit lui aussi)
  subj(u, phrase) { if (!U.fr()) return Units.label(u) + ' ' + (Units.plural(u) ? __t(Units.conj(u, I18N.fr(phrase))) : phrase); return Units.label(u) + ' ' + Units.conj(u, phrase); },
  label(u) {
    const d = DATA.units[u.type];
    if (u.hero) return u.hero.name;
    const nem = u.nemesis ? ' « ' + u.nemesis.name + ' »' : '';
    return Units.typeLabel(u.type) + nem;
  },
  // le nom d'un type de troupe avec son peuple (« Lanciers hauts-elfes ») ; l'ordre des mots dépend de la langue
  typeLabel(type) {
    const d = DATA.units[type];
    if (!d.race || !DATA.races[d.race]) return d.name;
    return U.fr() ? d.name + ' ' + Units.raceAdj(d.race) : __k('@unit_race', '{0} {1}', [d.name, Units.raceAdj(d.race)]);
  },

  // Maître d'armes : 2 XP par niveau du héros (+1), 3 pour le super maître d'armes, à chaque unité normale de sa pile
  armsmasterXp(game, hero) {
    if (!hero || !hero.hero) return 0;
    const ab = Units.abilities(game, hero); if (!ab.armsmaster && !ab.superArmsmaster) return 0;
    return (ab.superArmsmaster ? 3 : 2) * (Units.levelIndex(game, hero) + 1);
  },
  // expérience gagnée chaque tour : 1 de base (pas les créatures fantastiques), plus le meilleur maître d'armes de la pile pour une unité normale
  xpPerTurn(game, u) {
    const base = Units.isFantastic(u) ? 0 : 1;
    let arms = 0, by = null;
    if (Units.isNormal(u)) for (const o of Units.at(game, u.plane, u.x, u.y)) if (o.owner === u.owner && o.hero) { const n = Units.armsmasterXp(game, o); if (n > arms) { arms = n; by = o; } }
    return { total: base + arms, base, arms, by };
  },
  addXp(game, u, n) { if (!Units.isFantastic(u)) u.xp += n; },

  canFoundCity(game, u) { return Units.isSettler(u); },
};

// Pouvoirs d'objets de héros (simplifiés pour la v0.1)
const ITEM_POWERS = {
  flaming: { name: 'Enflammé', melee: 3 },
  vampiric: { name: 'Vampirique', ability: 'lifeSteal' },
  holyAvenger: { name: 'Vengeur sacré', ability: 'dispelEvil' },
  invisibility: { name: 'Invisibilité', ability: 'invisibility' },
  flight: { name: 'Vol', ability: 'flying' },
  pathfinding: { name: 'Orientation', ability: 'pathfinding' },
  regeneration: { name: 'Régénération', ability: 'regeneration' },
  trueSight: { name: 'Vision vraie', ability: 'illusionsImmunity' },
  missileImmunity: { name: 'Garde du vent', ability: 'missileImmunity' },
  magicImmunity: { name: 'Immunité magique', ability: 'magicImmunity' },
  firstStrike: { name: 'Frappe éclair', ability: 'firstStrike' },
  armorPiercing: { name: 'Perce-armure', ability: 'armorPiercing' },
  poison: { name: 'Venin', ability: 'poisonTouch', value: 1 },
};
