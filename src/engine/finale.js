'use strict';
/* 0.31.30 : les crises de fin de partie (ajout d'Arcanes). Passé le tour 200, quand un sorcier pèse une fois et demie le
   deuxième cinq tours de suite (Crisis.score : population, puissance, sorts), un présage passe, et cinq tours plus tard
   une crise tirée au sort se lève contre ce meneur ; elle menace tout le monde en chemin. Un Démon légendaire abattu
   rapproche l'échéance (1,25 fois, trois tours). Une seule par partie ; sa force se règle sur celle du meneur.
     lich      le Seigneur liche : ses morts marchent sur le meneur, grossis des morts de toutes les batailles ; abattu, il se
               relève tant que son phylactère tient ; chaque chute (ou le temps) livre un indice de sa cachette
     archmage  l'Archimage oublié : une citadelle jaillit près du meneur ; ses sorts coûtent moitié plus, l'archimage lui
               arrache son mana et frappe ses cités, et lâche des vagues de créatures
     winter    le Grand Hiver : le givre s'étend autour du Cœur de l'Hiver et sur les terres du meneur (plus de récoltes)
     eater     le Dévoreur de nœuds : il engloutit les nœuds, ceux du meneur d'abord, et grossit à chacun
     prophet   le Prophète : il attise la révolte dans les cités du meneur, les soulève, et en arrache à son empire
   Fin : le site détruit (phylactère, citadelle, Cœur de l'Hiver) ou le monstre abattu (Dévoreur, Prophète). */

const FINALE_KINDS = ['lich', 'archmage', 'winter', 'eater', 'prophet'];

// les créatures des crises : sans coût d'invocation (aucun sort ne les appelle, les vagues des failles non plus)
if (typeof DATA !== 'undefined' && DATA.units && DATA.units.Wraith && !DATA.units.LichLord) {
  const clone = (id, base, o) => { DATA.units[id] = Object.assign(JSON.parse(JSON.stringify(DATA.units[base])), { id, cost: 0, castCost: 0, upkeep: { gold: 0, food: 0, mana: 0 }, finale: true }, o); };
  clone('LichLord', 'Wraith', { en: 'Lich Lord', name: 'Seigneur liche', figures: 1, melee: 16, ranged: 14, rangedType: 'magic', rangedRealm: 'death', ammo: 6, def: 11, res: 15, hp: 70, move: 2,
    abilities: { toHit: 20, lifeSteal: -4, causeFear: true, poisonImmunity: true, illusionsImmunity: true, coldImmunity: true, deathImmunity: true, weaponImmunity: true },
    desc: 'Un sorcier mort qui a refusé de le rester. Tant que son phylactère tient, il se relève.' });
  clone('FinaleArchmage', 'DarkElfPriests', { en: 'Forgotten Archmage', name: 'Archimage oublié', race: 'fantastic', realm: 'sorcery', figures: 1, melee: 6, ranged: 18, rangedType: 'magic', rangedRealm: 'chaos', ammo: 8, def: 12, res: 18, hp: 75, move: 1,
    abilities: { toHit: 20, poisonImmunity: true, illusionsImmunity: true, teleporting: true, causeFear: true }, requires: [],
    desc: 'Un maître des arcanes d\'un autre âge, revenu réclamer le monde.' });
  clone('FrostGiant', 'StormGiant', { en: 'Frost Giant', name: 'Géant du givre', realm: 'nature', melee: 15, ranged: 0, rangedType: null, rangedRealm: null, ammo: 0, def: 8, res: 10, hp: 25,
    abilities: { toHit: 10, wallCrusher: true, coldImmunity: true }, desc: 'Né du Cœur de l\'Hiver. Le froid le suit.' });
  clone('NodeEater', 'ChaosSpawn', { en: 'Node Eater', name: 'Dévoreur de nœuds', melee: 22, def: 11, res: 13, hp: 80, move: 2,
    abilities: { toHit: 20, causeFear: true, doomGaze: 4, poisonImmunity: true, illusionsImmunity: true, weaponImmunity: true },
    desc: 'Il se nourrit de la magie des nœuds, et grandit à chacun.' });
  clone('Prophet', 'HighMenPriest', { en: 'Prophet', name: 'Prophète', race: 'fantastic', realm: 'life', figures: 1, melee: 6, ranged: 8, ammo: 6, def: 9, res: 14, hp: 50, move: 1,
    abilities: { healer: true, causeFear: true, illusionsImmunity: true }, requires: [],
    desc: 'Sa parole soulève les cités contre leur maître.' });
}

const Finale = {
  MIN_TURN: 200, LEAD: 1.5, STREAK: 5, OMEN: 5, LEAD_SLAIN: 1.25, STREAK_SLAIN: 3, MAX_OUT: 18,
  // réglages à l'essai au banc 19 (game.opts.finaleCfg) : au banc 18, le Dévoreur ne freinait pas le meneur (il mangeait surtout
  // les nœuds des autres) et le Prophète à peine (les cités parties se reprenaient sans combat), tandis que l'Archimage éliminait
  // sa cible dans 31 % des crises.
  //   EATER_TARGET_ONLY : il ne mange que les nœuds de la cible, puis marche sur ses cités
  //   PROPHET_HOLD : une cité qui fait sécession se donne une garnison rebelle ; une sécession possible tous les 2 tours
  //   ARCH_WAVE, ARCH_CURSE : tours entre deux vagues, entre deux sorts de l'Archimage
  // (0.31.35, d'après le banc 19) le Dévoreur ciblé, les cités du Prophète tenues, l'Archimage adouci : le meneur y perd autant la
  // tête (Archimage : 33 % encore 1er au lieu de 36 %) mais n'est plus éliminé que dans 19 % des crises au lieu de 29 % ; le Dévoreur
  // le freine enfin (62 % encore 1er contre 79 % sans crise) sans plus ruiner les autres
  //   PROPHET_PLUS (0.31.46, bancs 20 et 21) : ses prêches portent sur tout l'empire de la cible (3 rebelles près de lui, 2 ailleurs sur son
  //   plan, 1 sur l'autre plan) et une cité fait sécession dès que 40 % de ses habitants se révoltent. Deux bancs de suite : face à un
  //   meneur dominant (×1,5 au t200) il reste 1er dans 70-71 % des cas au lieu de 79 % ; sur 450 cartes appariées, -0,04 ± 0,02.
  EATER_TARGET_ONLY: 1, PROPHET_HOLD: 1, ARCH_WAVE: 10, ARCH_CURSE: 6, PROPHET_PLUS: 1,
  KINDS: FINALE_KINDS,
  TIERS: { 1: ['prophet', 'eater', 'winter'], 2: ['winter', 'lich', 'archmage'], 3: ['archmage'] },
  SITES: ['phylactery', 'citadel', 'winterheart'],
  // réglages : ceux du jeu, sauf essai (game.opts.finaleCfg)
  cfg(game, k) { const o = game.opts && game.opts.finaleCfg; return o && o[k] != null ? o[k] : Finale[k]; },
  init(game, mode) {
    if (game.finale) return;
    mode = mode || 'random';
    game.finale = { mode, state: mode === 'off' ? 'off' : 'watch', streak: 0, leader: null };
  },
  active(game, kind) { const f = game.finale; return f && f.state === 'active' && (!kind || f.kind === kind) ? f : null; },
  title(kind) { return { lich: 'Le Seigneur liche', archmage: 'L\'Archimage oublié', winter: 'Le Grand Hiver', eater: 'Le Dévoreur de nœuds', prophet: 'Le Prophète' }[kind] || ''; },
  ranked(game) { return game.players.filter(p => p.alive && !p.banished).map(p => ({ p, v: Crisis.score(game, p) })).sort((a, b) => b.v - a.v); },
  demonSlain(game) { return !!(game.riteStats && game.riteStats.slain > 0); },
  // le rapport de forces vrai d'un sorcier (celui de l'écran des sorciers : cités, magie, sorts, renommée et armée)
  standing(game, p) { return typeof Intel !== 'undefined' ? Intel.standing(game, p, p.id) : Crisis.score(game, p); },
  // (0.31.52) le monstre d'une crise est plus fort que le meilleur champion de sa proie : un héros seul, même le meilleur,
  // ne l'abat pas ; il y faut une armée. Il gagne surtout en endurance : chaque cran, +60 % de vie, +1 défense et résistance,
  // +15 % d'attaque. (Un essai à +30 % d'attaque et +10 % de précision par cran basculait d'un coup : au cran où le héros
  // perdait, une armée de neuf perdait aussi contre le Prophète et sa suite, 10 % de victoires ; ainsi, elle en gagne 87 %.)
  might(u, s) {
    const b = u.might || 0; if (!b) return;
    if (s.melee) s.melee = Math.round(s.melee * (1 + 0.15 * b)); if (s.ranged) s.ranged = Math.round(s.ranged * (1 + 0.15 * b));
    s.def += b; s.res += b; s.hp = Math.round(s.hp * (1 + 0.6 * b));
  },
  MIGHT_MAX: 24, MIGHT_WIN: 0.15, MIGHT_SIMS: 8,
  // au banc (finaleCfg) : MIGHT 0 retire ce renfort, TIER_FORCE 0 rend le palier aux seules cités et à la magie (avant 0.31.52)
  MIGHT: 1, TIER_FORCE: 1,
  // le meilleur champion de la proie seul contre le monstre seul (tous deux indemnes) : son taux de victoire
  duel(game, best, boss) {
    const a = Object.assign({}, best, { dmg: 0 }), d = Object.assign({}, boss, { dmg: 0 });
    return AI.simulate(game, [a], [d], { plane: boss.plane, x: boss.x, y: boss.y }, Finale.MIGHT_SIMS);
  },
  champion(game, pid) { return U.max(Object.values(game.units).filter(u => u.owner === pid && !u.riteDemon && !DATA.units[u.type].sailing), u => Units.strength(game, u)); },
  // monte le monstre d'autant de crans qu'il faut (jamais il ne redescend)
  matchBest(game, f) {
    const boss = f.boss != null ? game.units[f.boss] : null; if (!boss || typeof AI === 'undefined' || !Finale.cfg(game, 'MIGHT')) return;
    const best = Finale.champion(game, f.target); if (!best) return;
    const win = b => { boss.might = b; return Finale.duel(game, best, boss); };
    let b = boss.might || 0;
    if (win(b) <= Finale.MIGHT_WIN) { boss.might = b || undefined; return; }
    let lo = b, hi = Math.min(Finale.MIGHT_MAX, Math.max(b + 1, 2 * b || 2));
    while (hi < Finale.MIGHT_MAX && win(hi) > Finale.MIGHT_WIN) { lo = hi; hi = Math.min(Finale.MIGHT_MAX, hi * 2); }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (win(m) > Finale.MIGHT_WIN) lo = m; else hi = m; }
    boss.might = hi; f.might = hi;
  },
  // le plan où la cible tient le plus de citoyens
  home(game, tp) {
    const n = [0, 0]; for (const c of Cities.ofPlayer(game, tp.id)) n[c.plane] += Cities.citizens(c);
    return n[1] > n[0] ? 1 : 0;
  },

  tick(game) {
    const f = game.finale; if (!f || f.state === 'off' || f.state === 'over') return;
    if (f.state === 'watch') return Finale.watch(game);
    if (f.state === 'omen') { if (game.turn >= f.at) Finale.begin(game); return; }
    if (!Finale.retarget(game, f)) return;
    if ((game.turn - f.start) % 5 === 0) Finale.matchBest(game, f);
    Finale.K[f.kind].tick(game, f);
  },
  // le meneur doit peser LEAD fois le deuxième, STREAK tours d'affilée
  watch(game) {
    const f = game.finale;
    if (game.turn < Finale.cfg(game, 'MIN_TURN') * Game.pace(game)) return;
    const r = Finale.ranked(game); if (r.length < 2) { f.streak = 0; return; }
    const slain = Finale.demonSlain(game);
    const lead = Finale.cfg(game, slain ? 'LEAD_SLAIN' : 'LEAD'), need = Finale.cfg(game, slain ? 'STREAK_SLAIN' : 'STREAK');
    if (r[0].v >= lead * r[1].v) { if (f.leader !== r[0].p.id) { f.leader = r[0].p.id; f.streak = 0; } f.streak++; } else f.streak = 0;
    if (f.streak < need) return;
    // (0.31.36) la crise à la mesure de l'avance : jusqu'à deux fois le deuxième, l'une des trois plus douces ; au-delà, l'une des
    // trois plus dures ; deux fois le deuxième et autant que tous les autres réunis, l'Archimage (aux bancs 18 et 19, le meneur
    // restait 1er : Prophète 69 %, Dévoreur 62 %, Hiver 47 %, Liche 38 %, Archimage 33 %, contre 79 % sans crise)
    // (0.31.52) l'avance se mesure aussi au rapport de forces, armées comprises (Finale.standing) : un meneur cinq fois plus fort
    // que le deuxième par les armes, mais à peine deux fois par les cités et la magie, tirait une crise douce (le Prophète)
    const tierOf = (a, b, rest) => { const g = a / Math.max(1, b); return g >= 2 && a >= rest ? 3 : g >= 2 ? 2 : 1; };
    const gap = r[0].v / Math.max(1, r[1].v), rest = U.sum(r.slice(1), x => x.v);
    const top = game.players[f.leader];
    const sLead = Finale.standing(game, top), others = game.players.filter(p => p.alive && !p.banished && p !== top).map(p => Finale.standing(game, p)).sort((a, b) => b - a);
    f.tier = Math.max(tierOf(r[0].v, r[1].v, rest), others.length && Finale.cfg(game, 'TIER_FORCE') ? tierOf(sLead, others[0], U.sum(others, x => x)) : 1);
    f.leadAt = +gap.toFixed(2); f.leadForce = others.length ? +(sLead / Math.max(1, others[0])).toFixed(2) : null;
    f.kind = FINALE_KINDS.includes(f.mode) ? f.mode : game.rng.pick(Finale.TIERS[f.tier]);
    f.state = 'omen'; f.omen = game.turn; f.at = game.turn + Finale.cfg(game, 'OMEN'); f.target = f.leader;
    const txt = {
      lich: 'Les tombes remuent sous la lune. Quelque part, quelque chose a cessé de mourir.',
      archmage: 'Chaque nuit, la terre tremble au même endroit, un peu plus fort. Quelque chose d\'ancien remonte.',
      winter: 'Le givre tient jusqu\'à midi, puis jusqu\'au soir. Les oiseaux partent et ne reviennent pas.',
      eater: 'Les nœuds de magie vacillent comme une flamme sous un souffle. Quelque chose a faim.',
      prophet: 'Sur les marchés, un nom passe de bouche en bouche. Les gardes ne savent pas lequel.',
    }[f.kind];
    Game.logEach(game, () => txt, { crisis: true });
  },
  begin(game) {
    const f = game.finale;
    if (!Finale.K[f.kind]) f.kind = FINALE_KINDS.includes(f.mode) ? f.mode : game.rng.pick(FINALE_KINDS);
    let tp = game.players[f.target];
    if (!tp || !tp.alive || tp.banished) { const r = Finale.ranked(game)[0]; tp = r ? r.p : null; }
    if (!tp) { f.state = 'off'; return; }
    f.target = tp.id; f.start = game.turn; f.waves = 0; f.souls = 0; f.next = game.turn + 4;
    f.force = Math.round(Crisis.score(game, tp));
    if (!Finale.K[f.kind].begin(game, f, tp)) { f.state = 'off'; return; }
    f.state = 'active';
    const at = Finale.where(game, f);
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'finale', { pub: true, kind: f.kind, d: tp.id, plane: at ? at.plane : null, x: at ? at.x : null, y: at ? at.y : null });
    for (const pl of game.players) if (pl.alive && at) Move.reveal(game, pl, at.plane, at.x, at.y, 1);
    Game.logEach(game, v => Finale.beginText(game, v), Object.assign({ crisis: true }, at || {}));
    Finale.news(game, () => ({ type: 'begin', kind: f.kind }));
  },
  // ce que voit chacun au début : la menace, et comment y mettre fin
  beginText(game, v) {
    const f = game.finale, me = v === f.target, who = Players.nameFor(game, v, f.target), at = Finale.where(game, f) || {};
    const pos = at.x != null ? ' (' + at.x + ', ' + at.y + ')' : '';
    switch (f.kind) {
      // (0.31.47) l'annonce doit glacer : c'est la fin du monde qui commence, pas un événement parmi d'autres
      case 'lich': return me ? 'Les tombes s\'ouvrent. Un Seigneur liche s\'est relevé, et tous les morts de ce monde marchent sur vos cités. Abattez-le autant de fois qu\'il le faudra : tant que son phylactère tiendra, il reviendra.'
        : 'Les tombes s\'ouvrent. Un Seigneur liche s\'est relevé, et une marée de morts déferle sur les terres de ' + who + '. Tant que son phylactère tiendra, rien ne l\'arrêtera.';
      case 'archmage': return me ? 'Une citadelle a jailli des entrailles de la terre' + pos + '. L\'Archimage oublié qui l\'habite vous a choisi pour proie : il boira votre mana, maudira vos cités, brisera vos sorts. Prenez sa citadelle, ou il vous effacera de l\'histoire.'
        : 'Une citadelle a jailli des entrailles de la terre' + pos + '. L\'Archimage oublié qui l\'habite a choisi sa proie : ' + who + '. Et nul n\'est à l\'abri de ce qui sortira de ces murs.';
      case 'winter': return me ? 'Le Cœur de l\'Hiver s\'est mis à battre' + pos + '. Le givre dévore vos terres, les récoltes noircissent sur pied, vos peuples vont mourir de faim. Brisez-le avant que le monde entier ne gèle.'
        : 'Le Cœur de l\'Hiver s\'est mis à battre' + pos + '. Le givre dévore déjà les terres de ' + who + ', et il ne s\'arrêtera pas là. Brisez-le avant que le monde entier ne gèle.';
      case 'eater': return me ? 'Quelque chose a percé la paroi entre les plans. Il dévore vos nœuds de magie un à un, et chaque nœud le rend plus fort. Quand il n\'en restera plus, il viendra pour vos cités. Tuez-le tant qu\'il peut encore mourir.'
        : 'Quelque chose a percé la paroi entre les plans. Il dévore les nœuds de magie de ' + who + ', et grossit à chaque bouchée. Tuez-le tant qu\'il peut encore mourir.';
      case 'prophet': return me ? 'Un prophète s\'est levé, et ses prêches embrasent votre empire tout entier. Vos peuples vous maudissent, vos cités se soulèvent, et l\'une après l\'autre elles vous renieront. Faites-le taire, ou il ne vous restera rien à gouverner.'
        : 'Un prophète s\'est levé, et ses prêches embrasent l\'empire de ' + who + '. Les cités grondent, les premières bannières tombent, et l\'incendie ne s\'arrêtera pas à ses frontières.';
    }
    return '';
  },
  // le lieu ou le monstre de la crise
  where(game, f) {
    const s = f.site != null ? game.sites[f.site] : null; if (s) return { plane: s.plane, x: s.x, y: s.y };
    const u = f.boss != null ? game.units[f.boss] : null; if (u) return { plane: u.plane, x: u.x, y: u.y };
    return null;
  },
  // les annonces au centre de l'écran, pour les joueurs
  news(game, fn) {
    for (const pl of game.players) if (pl.human && pl.alive) { const n = fn(pl.id); if (n) (pl.finaleNews = pl.finaleNews || []).push(Object.assign({ turn: game.turn }, n)); }
    if (Game.hooks.finale) Game.hooks.finale(game);
  },
  // la cible éliminée : sa proie à terre, la crise s'éteint d'elle-même (sans récompense pour personne). Bannie, elle reste
  // la cible : elle peut revenir, et ses cités tiennent encore
  retarget(game, f) {
    const tp = game.players[f.target];
    if (tp && tp.alive) return true;
    f.state = 'over'; f.end = game.turn; f.by = null; f.faded = true;
    for (const u of Object.values(game.units)) if (u.finale) Units.remove(game, u);
    if (f.kind === 'winter') Finale.thaw(game);
    const T = Finale.title(f.kind);
    Game.logEach(game, v => v === f.target ? 'Vous voilà à terre : la crise s\'éteint (' + T + ').' : 'Sa proie à terre, la crise s\'éteint (' + T + ').', { crisis: true });
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'finale_end', { pub: true, kind: f.kind, a: null });
    Finale.news(game, () => ({ type: 'end', kind: f.kind, by: null, faded: true }));
    return false;
  },

  // ---------- outils ----------
  // les terres reliées à pied aux cités des sorciers (sans eau ni montagne) : ce qui en sort doit pouvoir les atteindre
  reach(game, p) {
    const w = game.world, reach = new Uint8Array(w.w * w.h), q = [];
    for (const c of Object.values(game.cities)) if (c.owner >= 0 && c.plane === p) { const i = c.y * w.w + c.x; if (!reach[i]) { reach[i] = 1; q.push([c.x, c.y]); } }
    while (q.length) {
      const [x, y] = q.pop();
      for (const [nx, ny] of World.neighbors(w, x, y)) {
        const i = ny * w.w + nx; if (reach[i]) continue;
        if (World.isWaterAt(w, p, nx, ny) || World.terr(w, p, nx, ny) === T.MOUNTAIN) continue;
        reach[i] = 1; q.push([nx, ny]);
      }
    }
    return reach;
  },
  // une case de terre libre, reliée aux cités, entre dmin et dmax des cités de la cible (et à 3 cases au moins de toute cité)
  spot(game, p, tp, dmin, dmax) {
    const w = game.world, mine = Cities.ofPlayer(game, tp.id).filter(c => c.plane === p);
    if (!mine.length) return null;
    const all = Object.values(game.cities).filter(c => c.plane === p), reach = Finale.reach(game, p);
    const busy = new Set(Object.values(game.units).filter(u => u.plane === p).map(u => u.y * w.w + u.x));
    for (const [a, b] of [[dmin, dmax], [dmin, 99], [3, 99]]) {
      const cands = [];
      for (let y = 2; y < w.h - 2; y++) for (let x = 0; x < w.w; x++) {
        const i = y * w.w + x;
        if (!reach[i] || busy.has(i) || World.isWaterAt(w, p, x, y)) continue;
        const tt = World.terr(w, p, x, y); if (tt === T.MOUNTAIN || tt === T.VOLCANO) continue;
        if (World.get(w, p, 'site', x, y) >= 0) continue;
        let d = 99; for (const c of mine) d = Math.min(d, World.dist(w, c.x, c.y, x, y));
        if (d < a || d > b) continue;
        if (all.some(c => World.dist(w, c.x, c.y, x, y) < 3)) continue;
        let land = 0; for (const [nx, ny] of World.neighbors(w, x, y)) if (!World.isWaterAt(w, p, nx, ny)) land++;
        if (land < 4) continue;
        cands.push([x, y]);
      }
      if (cands.length) return game.rng.pick(cands);
    }
    return null;
  },
  // la force des créatures : d'après le meneur au début, puis la durée de la crise et ses vagues
  budget(game, f) { return Math.round(250 + 2.5 * f.force + 15 * (game.turn - f.start) + 120 * f.waves); },
  cap(game, f) { return Math.min(1000, 300 + 2 * f.force); },
  growOf(f) { return Math.max(0, Math.min(4, Math.floor((f.force - 150) / 70))); },
  outside(game) { let n = 0; for (const u of Object.values(game.units)) if (u.finale && !u.finaleBoss) n++; return n; },
  // des créatures qui marchent sur le meneur (et sur qui se trouve en chemin)
  wave(game, f, types, p, x, y, verb) {
    if (!types.length || Finale.outside(game) >= Finale.MAX_OUT) return [];
    const made = Veil.spawnHostile(game, types, p, x, y, { crisis: true, crisisTarget: f.target, finale: true });
    f.waves++;
    if (!made.length) return made;
    const list = U.uniq(made.map(u => DATA.units[u.type].name.toLowerCase())).join(', ');
    for (const pl of game.players) if (pl.alive) Game.log(game, pl.id, pl.id === f.target ? verb + ' et marchent sur vous : ' + list + '.' : verb + ' : ' + list + '.', { x: made[0].x, y: made[0].y, plane: p, crisis: true, minor: pl.id !== f.target });
    return made;
  },
  // le monstre de la crise (et sa suite, sur la même case)
  spawnBoss(game, f, type, p, x, y, escort) {
    const at = Units.at(game, p, x, y).length || Cities.at(game, p, x, y) ? Veil.freeNear(game, p, x, y, 3) : [x, y];
    if (!at) return null;
    const mk = t => { const u = Units.create(game, t, -1, p, at[0], at[1]); Object.assign(u, { rampage: true, finale: true, crisis: true, crisisTarget: f.target }); return u; };
    const boss = mk(type); boss.finaleBoss = true; boss.grow = Finale.growOf(f);
    for (const t of (escort || []).slice(0, MAX_STACK - 1)) mk(t);
    f.boss = boss.id;
    Finale.matchBest(game, f);
    return boss;
  },
  addSite(game, f, type, p, at, guardians) {
    const s = MapGen.addSite(game, { type, plane: p, x: at[0], y: at[1], cleared: false, guardians: guardians.slice(0, MAX_STACK), budget: 2400, tier: 4, finale: true });
    f.site = s.id;
    for (const pl of game.players) if (pl.alive) Move.reveal(game, pl, p, s.x, s.y, 2);
    return s;
  },
  // le lieu se renforce de temps en temps (sept gardiens au plus : qu'on puisse encore le prendre)
  reinforce(game, f, s, realms) {
    if (!s || s.cleared || s.guardians.length >= 7) return;
    const c = Veil.pool(realms, Finale.cap(game, f), 50); if (c.length) s.guardians.push(game.rng.pick(c).id);
  },

  // ---------- les crises ----------
  K: {
    lich: {
      begin(game, f, tp) {
        const p = Finale.home(game, tp), ph = Finale.spot(game, p, tp, 9, 22); if (!ph) return false;
        f.plane = p; f.phyl = { x: ph[0], y: ph[1] }; f.clues = 0; f.clueAt = game.turn + 15;
        return Finale.lichRise(game, f, tp);
      },
      tick(game, f) {
        const tp = game.players[f.target], lich = f.boss != null ? game.units[f.boss] : null;
        if (!lich && f.down != null && game.turn >= f.down + 3) { Finale.lichRise(game, f, tp); return; }
        if (f.clues < 2 && game.turn >= f.clueAt) Finale.clue(game, f);
        const s = f.site != null ? game.sites[f.site] : null;
        if (s && (game.turn - f.start) % 8 === 0) Finale.reinforce(game, f, s, ['death']);
        // les morts de toutes les batailles grossissent ses rangs
        if (lich && game.turn >= f.next) {
          const types = Veil.muster(game, ['death'], Finale.budget(game, f) + 6 * Math.min(60, f.souls || 0), 5, Finale.cap(game, f));
          f.souls = 0; f.next = game.turn + 7;
          Finale.wave(game, f, types, lich.plane, lich.x, lich.y, 'Le Seigneur liche relève les morts, qui se dressent');
        }
      },
    },
    archmage: {
      begin(game, f, tp) {
        const p = Finale.home(game, tp), at = Finale.spot(game, p, tp, 5, 12); if (!at) return false;
        Finale.addSite(game, f, 'citadel', p, at, ['FinaleArchmage'].concat(Veil.muster(game, ['sorcery', 'chaos'], 900 + 2 * f.force, 4, Math.min(800, Finale.cap(game, f)))));
        f.curseAt = game.turn + 3; f.curses = 0; f.next = game.turn + 5;
        return true;
      },
      tick(game, f) {
        const s = game.sites[f.site]; if (!s || s.cleared) return;
        if (game.turn >= f.curseAt) Finale.curse(game, f);
        if ((game.turn - f.start) % 8 === 0) Finale.reinforce(game, f, s, ['sorcery', 'chaos']);
        if (game.turn >= f.next) {
          f.next = game.turn + Finale.cfg(game, 'ARCH_WAVE');
          Finale.wave(game, f, Veil.muster(game, ['sorcery', 'chaos'], Finale.budget(game, f), 5, Finale.cap(game, f)), s.plane, s.x, s.y, 'Des créatures sortent de la citadelle de l\'Archimage');
        }
      },
    },
    winter: {
      begin(game, f, tp) {
        const p = Finale.home(game, tp), at = Finale.spot(game, p, tp, 6, 12); if (!at) return false;
        Finale.addSite(game, f, 'winterheart', p, at, ['FrostGiant', 'FrostGiant'].concat(Veil.muster(game, ['nature', 'sorcery'], 700 + 2 * f.force, 3, Math.min(800, Finale.cap(game, f)))));
        f.plane = p; f.hit = {};
        Finale.freeze(game, p, at[0], at[1]);
        for (const [nx, ny] of World.neighbors(game.world, at[0], at[1])) Finale.freeze(game, p, nx, ny);
        return true;
      },
      tick(game, f) {
        const s = game.sites[f.site]; if (!s || s.cleared) return;
        const w = game.world, rng = game.rng, t = game.turn - f.start;
        // le givre s'étend autour du Cœur, et gagne les terres de la cible
        const R = Math.min(16, 3 + Math.floor(t * 0.6)), n = Math.min(14, 4 + Math.floor(t / 3));
        for (let i = 0, k = 0; i < n * 4 && k < n; i++) {
          const x = World.wx(w, s.x + rng.int(2 * R + 1) - R), y = s.y + rng.int(2 * R + 1) - R;
          if (Finale.freeze(game, s.plane, x, y)) k++;
        }
        const theirs = Cities.ofPlayer(game, f.target).filter(c => c.plane === s.plane);
        for (let i = 0; i < 2 && theirs.length; i++) { const c = rng.pick(theirs), [x, y] = rng.pick(World.catchment(w, c.x, c.y)); Finale.freeze(game, s.plane, x, y); }
        // le givre atteint une cité : son maître l'apprend (une fois)
        for (const c of Object.values(game.cities)) {
          if (c.plane !== s.plane || c.owner < 0 || f.hit[c.id]) continue;
          if (World.catchment(w, c.x, c.y).some(([x, y]) => Finale.frozen(w, s.plane, x, y))) { f.hit[c.id] = 1; Game.log(game, c.owner, 'Le givre gagne les terres de ' + c.name + ' : les récoltes y gèlent.', { city: c.id, crisis: true }); }
        }
        if ((game.turn - f.start) % 8 === 0) Finale.reinforce(game, f, s, ['nature', 'sorcery']);
        if (game.turn >= f.next) {
          f.next = game.turn + 7;
          const giants = Array(Math.min(3, 1 + Math.floor(f.waves / 2))).fill('FrostGiant');
          Finale.wave(game, f, giants.concat(Veil.muster(game, ['nature', 'sorcery'], Finale.budget(game, f) - 300 * giants.length, 5 - giants.length, Finale.cap(game, f))), s.plane, s.x, s.y, 'Des géants du givre quittent le Cœur de l\'Hiver');
        }
      },
    },
    eater: {
      begin(game, f, tp) {
        const nodes = game.sites.filter(s => s.type === 'node' && s.owner === tp.id && !s.devoured);
        const p0 = nodes.length ? (nodes.filter(s => s.plane === 1).length * 2 > nodes.length ? 1 : 0) : Finale.home(game, tp);
        let p = p0, at = Finale.spot(game, p, tp, 5, 10);
        if (!at) { p = 1 - p0; at = Finale.spot(game, p, tp, 5, 10); }
        if (!at) return false;
        f.eaten = 0;
        return !!Finale.spawnBoss(game, f, 'NodeEater', p, at[0], at[1]);
      },
      tick() {},
      // vers le nœud le plus proche (ceux de la cible d'abord) ; à défaut, sur les cités de la cible
      async move(game, f, units) {
        const u = game.units[f.boss]; if (!u) return;
        const ids = units.map(o => o.id);
        let s = Finale.eaterTarget(game, f, u.plane, u);
        if (!s) {
          // plus rien à manger sur ce plan : il passe sur l'autre s'il y trouve des nœuds
          const o = Finale.eaterTarget(game, f, 1 - u.plane, u), at = o && Veil.freeNear(game, 1 - u.plane, u.x, u.y, 4);
          if (at) { for (const x of units) { x.plane = 1 - u.plane; x.x = at[0]; x.y = at[1]; } return; }
          const c = Crisis.targetCity(game, u); if (c) await Game.moveGroup(game, ids, c.x, c.y, { auto: false });
          return;
        }
        if (u.x !== s.x || u.y !== s.y) await Game.moveGroup(game, ids, s.x, s.y, { auto: false });
        if (game.units[u.id] && u.x === s.x && u.y === s.y && u.plane === s.plane) Finale.devour(game, f, u, s);
      },
    },
    prophet: {
      begin(game, f, tp) {
        const p = Finale.home(game, tp), c0 = Finale.restless(game, f, p); if (!c0) return false;
        const at = Veil.freeNear(game, p, c0.x, c0.y, 3); if (!at) return false;
        f.plane = p; f.seceded = 0; f.secAt = game.turn + 4; f.next = game.turn + 5;
        return !!Finale.spawnBoss(game, f, 'Prophet', p, at[0], at[1], Finale.rebels(game, c0.race, 600 + 2 * f.force, 6));
      },
      tick(game, f) {
        const u = game.units[f.boss]; if (!u) return;
        const near = fort => Cities.ofPlayer(game, f.target).filter(c => c.plane === u.plane && (fort || !c.fortress) && World.dist(game.world, c.x, c.y, u.x, u.y) <= 8);
        // un soulèvement : la cité la plus agitée près de lui prend les armes
        if (game.turn >= f.next) {
          f.next = game.turn + 5;
          const c = U.max(near(true), c => Cities.econ(game, c).unrest / Math.max(1, Cities.citizens(c)));
          if (c) Finale.wave(game, f, Finale.rebels(game, c.race, Finale.budget(game, f) / 1.5, 6), c.plane, c.x, c.y, 'À l\'appel du Prophète, les habitants de ' + c.name + ' prennent les armes');
        }
        // une cité dont 40 % des habitants se révoltent fait sécession (la moitié avant la 0.31.46)
        if (game.turn >= f.secAt) {
          const hold = Finale.cfg(game, 'PROPHET_HOLD');
          f.secAt = game.turn + (hold ? 2 : 3);
          const share = Finale.cfg(game, 'PROPHET_PLUS') ? 0.4 : 0.5;
          const c = near().find(c => Cities.econ(game, c).unrest >= Cities.citizens(c) * share);
          if (c) {
            const owner = c.owner;
            Game.cedeCity(game, c, -1, true); f.seceded++;
            // (essai PROPHET_HOLD) les insurgés tiennent la cité : il faudra la reprendre de force
            if (hold) for (const t of Finale.rebels(game, c.race, Finale.budget(game, f) / 2, 5)) Units.create(game, t, -1, c.plane, c.x, c.y);
            Game.logEach(game, v => v === owner ? c.name + ' fait sécession et se range derrière le Prophète.' : game.players[v].contact[owner] ? c.name + ' fait sécession et quitte ' + Players.nameFor(game, v, owner) + ' pour le Prophète.' : null, { city: c.id, crisis: true });
          }
        }
      },
      // vers la cité la plus agitée de la cible, sans attaquer ; il prêche à ses portes
      async move(game, f, units) {
        const u = game.units[f.boss]; if (!u) return;
        const c = Finale.restless(game, f, u.plane); if (!c || World.dist(game.world, c.x, c.y, u.x, u.y) <= 1) return;
        const at = Veil.freeNear(game, c.plane, c.x, c.y, 1) || Veil.freeNear(game, c.plane, c.x, c.y, 2);
        if (at) await Game.moveGroup(game, units.map(o => o.id), at[0], at[1], { auto: true, noAttack: true });
      },
    },
  },

  // ---------- le Seigneur liche ----------
  lichRise(game, f, tp) {
    const p = f.plane, at = Finale.spot(game, p, tp, 5, 10); if (!at) return false;
    const first = f.boss == null && f.down == null;
    const boss = Finale.spawnBoss(game, f, 'LichLord', p, at[0], at[1], Veil.muster(game, ['death'], Finale.budget(game, f) / 2, 4, Finale.cap(game, f)));
    if (!boss) return false;
    boss.grow = Math.min(6, Finale.growOf(f) + (f.rises || 0)); f.rises = (f.rises || 0) + 1;
    f.down = null; f.next = game.turn + 7;
    if (!first) Game.logEach(game, v => v === f.target ? 'Le Seigneur liche s\'est relevé, plus fort, et revient vers vous.' : 'Le Seigneur liche s\'est relevé, plus fort.', { x: boss.x, y: boss.y, plane: p, crisis: true });
    return true;
  },
  // un indice sur la cachette du phylactère ; le second le révèle
  clue(game, f) {
    if (f.clues >= 2 || f.site != null) return;
    f.clues++; f.clueAt = game.turn + 15;
    const w = game.world, rng = game.rng, ph = f.phyl, pn = f.plane ? 'le Miroir' : 'Arcane';
    if (f.clues === 1) {
      const x = World.wx(w, ph.x + rng.range(-3, 3)), y = Math.max(0, Math.min(w.h - 1, ph.y + rng.range(-3, 3)));
      Game.logEach(game, () => 'Un indice : le phylactère du Seigneur liche est caché sur ' + pn + ', à quelques cases de (' + x + ', ' + y + ').', { x, y, plane: f.plane, crisis: true });
      return;
    }
    let at = [ph.x, ph.y];
    if (World.get(w, f.plane, 'site', at[0], at[1]) >= 0 || Cities.at(game, f.plane, at[0], at[1]) || Units.at(game, f.plane, at[0], at[1]).length) at = Veil.freeNear(game, f.plane, ph.x, ph.y, 3);
    if (!at) return;
    const s = Finale.addSite(game, f, 'phylactery', f.plane, at, ['DeathKnights'].concat(Veil.muster(game, ['death'], 900 + 2 * f.force, 4, Math.min(800, Finale.cap(game, f)))));
    Game.logEach(game, () => 'Le phylactère du Seigneur liche est découvert sur ' + pn + ' (' + s.x + ', ' + s.y + '). Détruisez-le, et le liche ne se relèvera plus.', { x: s.x, y: s.y, plane: s.plane, crisis: true });
    Finale.news(game, () => ({ type: 'reveal', kind: f.kind }));
  },

  // ---------- l'Archimage oublié ----------
  // ses sorts contre la cible : son mana, puis une de ses cités, à tour de rôle
  curse(game, f) {
    const tp = game.players[f.target]; f.curseAt = game.turn + Finale.cfg(game, 'ARCH_CURSE'); if (!tp) return;
    if (f.curses++ % 2 === 0) {
      const amt = Math.min(tp.mana, Math.max(50, Math.floor(tp.mana * 0.3)));
      if (amt > 0) { tp.mana -= amt; Game.log(game, tp.id, 'L\'Archimage oublié vous arrache ' + amt + ' mana.', { crisis: true }); }
      return;
    }
    const c = U.max(Cities.ofPlayer(game, tp.id), c => Cities.citizens(c)); if (!c) return;
    let lost = Cities.destroyBuildings(game, c, 0.12);
    if (!lost.length) { const bs = Object.keys(c.buildings).filter(b => DATA.buildings[b] && DATA.buildings[b].buildable !== false && !DATA.buildings[b].wonder); if (bs.length) { const b = game.rng.pick(bs); delete c.buildings[b]; lost = [DATA.buildings[b].name]; } }
    if (lost.length) Game.log(game, tp.id, 'L\'Archimage oublié frappe ' + c.name + ' (' + Cities.lostText(lost) + ').', { city: c.id, crisis: true });
  },
  // ses contre-sorts : les sorts de la cible coûtent moitié plus tant qu'il tient sa citadelle
  costMult(game, pl) { const f = Finale.active(game, 'archmage'); return f && f.target === pl.id ? 1.5 : 1; },

  // ---------- le Grand Hiver ----------
  frozen(world, p, x, y) { const a = world.planes[p].frost; return a && World.inY(world, y) ? a[World.idx(world, x, y)] : 0; },
  freeze(game, p, x, y) {
    const w = game.world; if (!World.inY(w, y) || World.isWaterAt(w, p, x, y) || Cities.at(game, p, x, y)) return false;
    const pl = w.planes[p], a = pl.frost || (pl.frost = new Array(w.w * w.h).fill(0)), i = World.idx(w, x, y);
    if (a[i]) return false;
    a[i] = 1; return true;
  },
  thaw(game) { for (const pl of game.world.planes) delete pl.frost; },

  // ---------- le Dévoreur de nœuds ----------
  eaterTarget(game, f, p, u) {
    const w = game.world;
    const only = Finale.cfg(game, 'EATER_TARGET_ONLY');   // (essai) les nœuds de la cible seulement
    const ns = game.sites.filter(s => s.type === 'node' && s.plane === p && !s.devoured && !Game.siteHasGuardians(s) && (!only || s.owner === f.target));
    const rank = s => (s.owner === f.target ? 0 : s.owner >= 0 ? 1000 : 2000) + World.dist(w, s.x, s.y, u.x, u.y);
    return U.min(ns, rank);
  },
  devour(game, f, u, s) {
    const prev = s.owner, name = Game.siteName(s);
    Object.assign(s, { devoured: true, owner: -1, basePower: 0, power: 0, meldBy: null, warped: null, cleared: true, guardians: [] });
    u.grow = Math.min(8, (u.grow || 0) + 1); u.dmg = 0; f.eaten = (f.eaten || 0) + 1;   // (au plus 8 crans : qu'on puisse encore l'abattre)
    // le contrecoup : le maître du nœud perd le quart de son mana
    const op = game.players[prev], lost = op ? Math.floor((op.mana || 0) / 4) : 0;
    if (lost > 0) op.mana -= lost;
    Game.logEach(game, v => v === prev ? (lost > 0 ? 'Le Dévoreur de nœuds a englouti votre ' + name + ' : le contrecoup vous coûte ' + lost + ' mana, et il grandit encore.' : 'Le Dévoreur de nœuds a englouti votre ' + name + ', et il grandit encore.') : 'Le Dévoreur de nœuds a englouti le ' + name + ' (' + s.x + ', ' + s.y + '), et il grandit encore.', { x: s.x, y: s.y, plane: s.plane, crisis: true, minor: true });
  },
  // la croissance du Dévoreur (et du liche relevé) : chaque cran ajoute de quoi rester un défi
  grow(u, s) {
    const g = u.grow || 0; if (!g) return;
    if (s.melee) s.melee += 3 * g; if (s.ranged) s.ranged += 2 * g;
    s.def += g; s.res += g; s.hp += 10 * g;
  },

  // ---------- le Prophète ----------
  // la cité de la cible la plus agitée (hors forteresse si possible)
  restless(game, f, p) {
    const cs = Cities.ofPlayer(game, f.target).filter(c => c.plane === p);
    const pool = cs.filter(c => !c.fortress).length ? cs.filter(c => !c.fortress) : cs;
    return U.max(pool, c => Cities.econ(game, c).unrest / Math.max(1, Cities.citizens(c)) + Cities.citizens(c) / 1000);
  },
  // ses prêches : un rebelle de plus dans chaque cité de la cible sur son plan, deux près de lui
  unrest(game, c) {
    const f = game.finale; if (!f || f.state !== 'active' || f.kind !== 'prophet' || c.owner !== f.target) return 0;
    const u = f.boss != null ? game.units[f.boss] : null, plus = Finale.cfg(game, 'PROPHET_PLUS');
    if (!u || (u.plane !== c.plane && !plus)) return 0;
    if (u.plane !== c.plane) return 1;
    return World.dist(game.world, u.x, u.y, c.x, c.y) <= 6 ? (plus ? 3 : 2) : (plus ? 2 : 1);
  },
  // des troupes du peuple de la cité, les meilleures que le budget permet
  rebels(game, race, budget, max) {
    const r = DATA.races[race]; if (!r) return [];
    const ok = (r.units || []).filter(t => { const d = DATA.units[t]; return d && d.cost > 0 && !d.sailing && !d.abilities.createOutpost && !d.abilities.construction && (d.melee > 0 || d.ranged > 0); })
      .sort((a, b) => (DATA.units[b].cost0 ?? DATA.units[b].cost) - (DATA.units[a].cost0 ?? DATA.units[a].cost));
    const out = []; let left = budget;
    while (out.length < max) {
      const can = ok.filter(t => (DATA.units[t].cost0 ?? DATA.units[t].cost) <= left); if (!can.length) break;
      const t = game.rng.pick(can.slice(0, 3)); out.push(t); left -= (DATA.units[t].cost0 ?? DATA.units[t].cost);
    }
    if (!out.length && ok.length) out.push(ok[ok.length - 1]);
    return out;
  },

  // ---------- les batailles ----------
  // les mouvements des monstres de crise (le liche marche comme une vague)
  async moveBoss(game, units) {
    const f = Finale.active(game); if (!f) return false;
    const K = Finale.K[f.kind]; if (!K.move) return false;
    await K.move(game, f, units);
    return true;
  },
  // après une bataille : les morts comptent pour le liche ; le monstre de la crise abattu
  async afterBattle(game, battle, res, info) {
    const f = Finale.active(game); if (!f) return;
    let boss = null, side = null;
    for (const sd of [0, 1]) for (const u of res.killed[sd]) {
      if (!u || u.combatOnly) continue;
      if (u.finaleBoss && u.id === f.boss) { boss = u; side = sd; } else if (!u.finale) f.souls = (f.souls || 0) + 1;
    }
    if (!boss) return;
    const pid = battle.owner(1 - side);
    const keep = new Set((info.attackers || []).concat(info.defenders || []).filter(Boolean).map(u => u.id));
    const survivors = (info.attackers || []).concat(info.defenders || []).filter(u => u && game.units[u.id] && u.owner === pid);
    if (f.kind === 'lich') {
      f.boss = null; f.down = game.turn;
      Game.logEach(game, v => v === pid ? 'Le Seigneur liche tombe sous vos coups. Il se relèvera, tant que son phylactère tient.' : 'Le Seigneur liche est tombé. Il se relèvera, tant que son phylactère tient.', { x: info.tx, y: info.ty, plane: info.plane, crisis: true });
      Finale.clue(game, f);
      return;
    }
    await Finale.finish(game, pid, survivors, keep, { x: info.tx, y: info.ty, plane: info.plane });
  },
  // un lieu de crise vidé de ses gardiens
  async siteCleared(game, site, pid, survivors) {
    return Finale.finish(game, pid, survivors, null, { x: site.x, y: site.y, plane: site.plane });
  },
  // la fin : les créatures de la crise se dissipent (celles de la bataille en cours restent, simples monstres), la récompense
  async finish(game, pid, survivors, keep, at) {
    const f = Finale.active(game); if (!f) return [];
    f.state = 'over'; f.end = game.turn; f.by = pid;
    for (const u of Object.values(game.units)) if (u.finale) {
      if (keep && keep.has(u.id)) { delete u.finale; delete u.finaleBoss; delete u.crisis; delete u.crisisTarget; }
      else Units.remove(game, u);
    }
    if (f.kind === 'winter') Finale.thaw(game);
    const pl = game.players[pid], found = [];
    if (pl) {
      pl.gold += 600; found.push('600 pièces d\'or');
      pl.mana += 600; found.push('600 cristaux de mana');
      const it = Items.random(game, 5);
      const h = (survivors || []).find(u => u.hero && Items.canEquip(u, it) && Items.freeSlot(u, it) >= 0);
      if (h) { h.items[Items.freeSlot(h, it)] = it; found.push(it.name + ' (équipé par ' + h.hero.name + ')'); } else { pl.vault.push(it); found.push(it.name + ' (au coffre)'); }
      pl.fame += 15; found.push('+15 de renommée');
      for (const o of game.players) if (o !== pl && o.alive && o.relations) Diplomacy.adjust(game, o.id, pl.id, 20, 'finale');
    }
    if (typeof Chronicle !== 'undefined') Chronicle.note(game, 'finale_end', { pub: true, kind: f.kind, a: pl ? pid : null, plane: at ? at.plane : null, x: at ? at.x : null, y: at ? at.y : null });
    const T = Finale.title(f.kind);
    Game.logEach(game, v => v === pid ? 'Vous avez mis fin à la crise (' + T + ').' : pl ? U.cap(Players.nameFor(game, v, pid)) + ' a mis fin à la crise (' + T + ').' : 'La crise est finie (' + T + ').', Object.assign({ crisis: true }, at || {}));
    if (pl) Game.log(game, pid, 'Récompense : ' + found.join(', ') + '.', at || {});
    Finale.news(game, v => ({ type: 'end', kind: f.kind, by: pl ? pid : null, found: v === pid ? found : null, x: at ? at.x : null, y: at ? at.y : null, plane: at ? at.plane : null }));
    return found;
  },
};
