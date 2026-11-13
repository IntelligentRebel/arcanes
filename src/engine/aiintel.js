'use strict';
// Renseignement : ce qu'un sorcier sait du monde. Ses troupes et ses cités voient autour d'elles ; il se souvient
// de ce qu'il a vu (les forces étrangères case par case, et quand). L'IA ne triche pas : elle décide d'après ces
// renseignements, comme le joueur, jamais d'après l'état réel que cache le brouillard.
// Ce qui est public pour tout sorcier rencontré (écran des sorciers) : nombre de cités, puissance magique, sorts connus, renommée.

const Intel = {
  _cache: new WeakMap(),

  // instantané d'une unité vue : de quoi simuler un combat contre elle
  snap(u) {
    return { id: u.id, type: u.type, owner: u.owner, xp: u.xp, dmg: u.dmg, ench: (u.ench || []).slice(), weapon: u.weapon, undead: u.undead,
      hero: u.hero ? JSON.parse(JSON.stringify(u.hero)) : null, items: u.items ? JSON.parse(JSON.stringify(u.items)) : undefined,
      plane: u.plane, x: u.x, y: u.y, moves: 0, summoned: u.summoned, avatar: u.avatar, chaosChannel: u.chaosChannel };
  },
  // une unité invisible ne se voit qu'au contact d'une unité ou d'une cité du sorcier
  hiddenFrom(game, pid, u) {
    if (!Units.has(game, u, 'invisibility')) return false;
    const w = game.world;
    for (const o of Object.values(game.units)) if (o.owner === pid && o.plane === u.plane && World.dist(w, o.x, o.y, u.x, u.y) <= 1) return false;
    for (const c of Object.values(game.cities)) if (c.owner === pid && c.plane === u.plane && World.dist(w, c.x, c.y, u.x, u.y) <= 1) return false;
    return true;
  },
  // note ce que le sorcier voit : les forces étrangères par case ; une case revue vide efface son ancien rapport
  record(game, pl, vis) {
    const intel = pl.intel || (pl.intel = {});
    const w = game.world, seen = {};
    for (const u of Object.values(game.units)) {
      if (u.owner === pl.id || u.guardian != null || !vis[u.plane][u.y * w.w + u.x]) continue;
      if (Intel.hiddenFrom(game, pl.id, u)) continue;
      const k = u.plane + ',' + u.x + ',' + u.y; (seen[k] = seen[k] || []).push(u);
    }
    for (const c of Object.values(game.cities)) if (c.owner !== pl.id && vis[c.plane][c.y * w.w + c.x]) { const k = c.plane + ',' + c.x + ',' + c.y; seen[k] = seen[k] || []; }
    for (const k in intel) { const [p, x, y] = k.split(',').map(Number); if (vis[p][y * w.w + x] && !seen[k]) delete intel[k]; }
    for (const k in seen) intel[k] = { t: game.turn, units: seen[k].map(Intel.snap) };
  },
  // ce que le sorcier voit en ce moment (mis en cache pour le tour)
  vis(game, pl) {
    let m = Intel._cache.get(game); if (!m) Intel._cache.set(game, m = new Map());
    const c = m.get(pl.id);
    if (c && c.turn === game.turn && c.stamp === game._intelStamp) return c.vis;
    const vis = Move.visibility(game, pl.id);
    m.set(pl.id, { turn: game.turn, stamp: game._intelStamp, vis, recent: null });
    return vis;
  },
  // début du tour d'une IA : regarder autour de soi et mettre à jour ses rapports
  refresh(game, pl) {
    game._intelStamp = (game._intelStamp || 0) + 1;
    const vis = Intel.vis(game, pl);
    Intel.record(game, pl, vis);
    // l'IA oublie les rapports trop anciens sur des piles en campagne (les cités restent)
    for (const k in pl.intel) {
      const r = pl.intel[k]; if (game.turn - r.t <= 40) continue;
      const [p, x, y] = k.split(',').map(Number); if (!Cities.at(game, p, x, y)) delete pl.intel[k];
    }
  },
  // Clairvoyance (0.31.51) : chaque tour, la garnison de chaque cité étrangère est rapportée au sorcier qui l'entretient
  // (un rapport, pas une vue : la carte reste dans le brouillard). Les unités invisibles y échappent.
  clairvoyance(game, pl) {
    if (!pl || !pl.globals || !pl.globals.includes('awareness')) return 0;
    const w = game.world, mask = [new Uint8Array(w.w * w.h), new Uint8Array(w.w * w.h)]; let n = 0;
    for (const c of Object.values(game.cities)) if (c.owner !== pl.id) { mask[c.plane][c.y * w.w + c.x] = 1; n++; }
    if (n) Intel.record(game, pl, mask);
    return n;
  },
  // après un déplacement : regarder de nouveau (la cible est peut-être en vue)
  touch(game, pl) { game._intelStamp = (game._intelStamp || 0) + 1; Intel.record(game, pl, Intel.vis(game, pl)); },
  sees(game, pl, plane, x, y) { const w = game.world; return !!Intel.vis(game, pl)[plane][y * w.w + World.wx(w, x)]; },
  knows(game, pl, plane, x, y) { const ex = pl.explored && pl.explored[plane], w = game.world; return !!(ex && y >= 0 && y < w.h && ex[y * w.w + World.wx(w, x)]); },
  // rapports récents (vus ce tour ou au précédent), découpés une fois par tour
  recent(game, pl) {
    const m = Intel._cache.get(game), c = m && m.get(pl.id);
    if (c && c.turn === game.turn && c.recent) return c.recent;
    const out = [];
    for (const k in pl.intel || {}) { const r = pl.intel[k]; if (game.turn - r.t > 1) continue; const [p, x, y] = k.split(',').map(Number); out.push({ plane: p, x, y, t: r.t, units: r.units }); }
    if (c && c.turn === game.turn) c.recent = out;
    return out;
  },
  // forces connues sur une case : vues maintenant (exactes), gardiens d'un lieu exploré (comme le joueur, qui voit leur nombre et leur menace
  // et peut simuler le combat), ou dernier rapport. null : on ne sait rien.
  defenders(game, pl, plane, x, y) {
    if (!Intel.knows(game, pl, plane, x, y)) return null;
    const si = World.get(game.world, plane, 'site', x, y), site = si >= 0 ? game.sites[si] : null;
    if (Intel.sees(game, pl, plane, x, y)) {
      const units = AI.defendersAt(game, pl.id, plane, x, y).filter(u => !(u.owner >= 0 && Intel.hiddenFrom(game, pl.id, u)));
      return { units, age: 0 };
    }
    if (site && Game.siteHasGuardians(site) && !Units.at(game, plane, x, y).length) return { units: AI.defendersAt(game, pl.id, plane, x, y), age: 0 };
    const rec = pl.intel && pl.intel[plane + ',' + World.wx(game.world, x) + ',' + y];
    if (rec) return { units: rec.units, age: game.turn - rec.t };
    return null;
  },
  // menace hostile autour d'une case : piles en guerre (ou monstres) vues ce tour ou au précédent
  threat(game, pl, plane, x, y, r = 5, only = null) {
    let t = 0; const w = game.world;
    for (const rec of Intel.recent(game, pl)) {
      if (rec.plane !== plane || World.dist(w, rec.x, rec.y, x, y) > r) continue;
      const inCity = Cities.at(game, rec.plane, rec.x, rec.y);
      for (const u of rec.units) {
        if (u.owner === pl.id) continue;
        if (u.owner >= 0 && !Players.isAtWar(game, pl.id, u.owner)) continue;
        if (u.owner < 0 && inCity) continue;
        if (only && !only(u.owner)) continue;
        t += Units.strength(game, u);
      }
    }
    return t;
  },
  // cités dont le sorcier connaît l'emplacement (case explorée : comme sur la carte du joueur, la cité et ses couleurs s'y voient)
  knownCities(game, pl) { return Object.values(game.cities).filter(c => Intel.knows(game, pl, c.plane, c.x, c.y)); },
  // armée estimée d'un autre sorcier : ses unités vues ces 20 derniers tours, chacune comptée une fois,
  // plus une garnison supposée pour chacune de ses cités publiques
  armyOf(game, pl, other) {
    // (le Démon légendaire n'y compte pas : il ne combat que la cible du pacte)
    if (pl.id === other) return U.sum(Object.values(game.units).filter(u => u.owner === other && !u.riteDemon), u => Units.strength(game, u));
    const best = new Map();
    for (const k in pl.intel || {}) {
      const rec = pl.intel[k]; if (game.turn - rec.t > 20) continue;
      for (const u of rec.units) if (u.owner === other && !u.riteDemon && (!best.has(u.id) || best.get(u.id).t < rec.t)) best.set(u.id, { u, t: rec.t });
    }
    let s = 0, n = 0; for (const { u } of best.values()) { s += Units.strength(game, u); n++; }
    const avg = Math.max(50, n ? s / n : 50);
    const cities = Intel.citiesOf(game, pl, other);
    // ce qu'on n'a pas vu existe sans doute : deux unités par cité au moins, de la force moyenne observée (estimation prudente)
    return s + Math.max(0, cities * 2 - n) * avg;
  },
  // part des terres explorées sur chaque plan (le décompte des terres de la carte est gardé tant que le monde est le même)
  landSeen(game, pl) {
    const w = game.world, n = w.w * w.h;
    let c = Intel._land;
    if (!c || c.world !== w) c = Intel._land = { world: w, land: [0, 1].map(p => { const a = []; for (let i = 0; i < n; i++) if (!World.isWaterAt(w, p, i % w.w, Math.floor(i / w.w))) a.push(i); return a; }) };
    return c.land.map((a, p) => { if (!a.length || !pl.explored || !pl.explored[p]) return 1; let k = 0; for (const i of a) if (pl.explored[p][i]) k++; return k / a.length; });
  },
  // cités d'un sorcier d'IA, en moyenne, selon le tour (mesuré sur des parties d'IA en carte normale)
  citiesByTurn(t) {
    const P = [[0, 2], [20, 2.1], [40, 3.2], [60, 4.4], [80, 5.8], [100, 7.1], [120, 7.6], [150, 8.5]];
    if (t >= 150) return 8.5 + (t - 150) * 0.03;
    for (let i = 1; i < P.length; i++) if (t <= P[i][0]) { const a = P[i - 1], b = P[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
    return 2;
  },
  // combien de cités a un rival, d'après ce qu'on peut savoir : celles qu'on a repérées, sa puissance magique (publique),
  // les terres qu'on n'a pas explorées et le tour. Régression mesurée sur 8 324 cas de 18 parties d'IA ;
  // la fourchette contient le vrai nombre dans 77 % des cas
  cityEstimate(game, pl, other) {
    const L = Intel.locatedOf(game, pl, other);
    // sous Clairvoyance, toutes les cités sont connues : leur nombre est exact
    if (pl.id === other || (pl.globals && pl.globals.includes('awareness'))) return { located: L, est: L, lo: L, hi: L, unknown: 0 };
    const f = Intel.landSeen(game, pl), land = Intel._land.land;
    const g = Intel.citiesByTurn(game.turn) * (land[0].length + land[1].length) / Math.max(1, game.players.length) / 265;
    const P = pl.contact && pl.contact[other] ? Magic.power(game, game.players[other]) : 0;
    const est = Math.max(L, 0.061 * P - 0.1 + g * (-0.296 + 0.545 * (1 - f[0]) + 0.439 * (1 - f[1])) + 0.692 * L), unk = est - L;
    return { located: L, est, lo: Math.max(L, est - 0.5 - 0.6 * unk), hi: est + 1.5 + 0.75 * unk, unknown: unk };
  },
  // ce qu'un sorcier sait des forces d'un autre, sans rien qu'il ne puisse savoir : armée estimée (unités vues ces 20 derniers
  // tours, plus une estimation pour les cités dont on n'a rien vu), et la qualité du renseignement (0 à 1) : part de ses cités
  // (estimées) en vue ou au rapport récent, part de son armée (estimée) observée récemment
  SHRINK: 12,
  assess(game, pl, other) {
    const o = game.players[other]; if (!o) return null;
    const w = game.world, ce = Intel.cityEstimate(game, pl, other);
    const vis = pl.human ? Move.visibility(game, pl.id) : Intel.vis(game, pl);
    let inView = 0, cover = 0;
    for (const c of Object.values(game.cities)) {
      if (c.owner !== other || !Intel.knows(game, pl, c.plane, c.x, c.y)) continue;
      if (vis[c.plane][c.y * w.w + c.x]) { inView++; cover += 1; continue; }
      const rec = pl.intel && pl.intel[c.plane + ',' + c.x + ',' + c.y];
      cover += rec ? 0.8 / (1 + (game.turn - rec.t) / 8) : 0.1;
    }
    const best = new Map();
    for (const k in pl.intel || {}) {
      const rec = pl.intel[k], age = game.turn - rec.t; if (age > 20) continue;
      for (const u of rec.units) if (u.owner === other && (!best.has(u.id) || best.get(u.id).age > age)) best.set(u.id, { u, age });
    }
    let seen = 0, fresh = 0, n = 0, lastSeen = null;
    for (const { u, age } of best.values()) { const st = Units.strength(game, u); seen += st; fresh += st / (1 + age / 5); n++; lastSeen = lastSeen == null ? age : Math.min(lastSeen, age); }
    // ce qu'on n'a pas vu : les armées des sorciers comptent environ 2,8 unités par cité jusqu'au tour 40, puis 0,027 de plus
    // par tour (5,5 au tour 140), d'une force moyenne de 55 jusqu'au tour 80 puis croissante, ou celle des unités observées
    // quand on en a vu assez (mesuré sur 18 parties d'IA)
    // la force moyenne de ce qu'on n'a pas vu : l'a priori, rapproché de la moyenne observée à mesure qu'on voit des unités
    // (avant la v0.30.8 : la moyenne observée dès trois unités vues ; trois unités d'élite en expédition faisaient tripler
    // l'estimation d'un coup, puis elle retombait quand on les perdait de vue)
    const perCity = 2.8 + Math.max(0, game.turn - 40) * 0.027, prior = 55 + Math.max(0, game.turn - 80) * 0.65, K = Intel.SHRINK;
    const avg = K > 0 ? (seen + K * prior) / (n + K) : n >= 3 ? seen / n : prior;
    const army = seen + Math.max(0, ce.est * perCity - n) * avg;
    const precision = U.clamp(0.5 * (ce.est ? cover / ce.est : 0) + 0.5 * (army ? fresh / army : 0), 0, 1);
    return { army, seen, units: n, lastSeen, cities: ce, located: ce.located, inView, precision };
  },
  // fourchette de l'estimation d'armée selon la précision, mesurée sur des parties d'IA
  // (80 % des 8 324 cas mesurés tombent dans la fourchette ; de −67 % / +105 % sans renseignement à −33 % / +50 % vers 0,65)
  range(a) {
    const u = 1 - a.precision;
    return { lo: Math.max(0, Math.round(a.army * Math.max(0, 1.01 - 0.68 * u))), hi: Math.round(a.army * (1.10 + 0.95 * u)) };
  },
  // le rapport de forces vu par un sorcier : score (ce qui est public, ses cités et son armée estimées) et armée, avec leurs fourchettes
  // (le score est celui qu'emploient les IA pour désigner le meneur d'une partie : cités ×40, puissance magique ×3, sorts ×4, renommée ×2, armée ÷10 ;
  // la fourchette du score contient le vrai score dans 80 % des cas mesurés)
  overview(game, pl, other) {
    const o = game.players[other]; if (!o || !o.alive) return null;
    const pub = (pl.id === other || (pl.contact && pl.contact[other])) ? Magic.power(game, o) * 3 + o.known.length * 4 + Players.fame(game, o) * 2 : 0;
    if (pl.id === other) { const army = Intel.armyOf(game, pl, other); return { exact: true, army, armyLo: army, armyHi: army, score: Math.round(pub + Cities.ofPlayer(game, other).length * 40 + army / 10), scoreLo: null, scoreHi: null }; }
    const a = Intel.assess(game, pl, other), r = Intel.range(a), ce = a.cities;
    const score = pub + ce.est * 40 + a.army / 10;
    return { exact: false, a, army: Math.round(a.army), armyLo: r.lo, armyHi: r.hi, score: Math.round(score),
      scoreLo: Math.round(score - 0.9 * (40 * (ce.est - ce.lo) + (a.army - r.lo) / 10)), scoreHi: Math.round(score + 0.9 * (40 * (ce.hi - ce.est) + (r.hi - a.army) / 10)) };
  },
  // qualité du renseignement, en mots (le joueur ne connaît pas la part exacte de ce qu'il ignore)
  intelLabel(p) { return p < 0.15 ? 'très faible' : p < 0.35 ? 'faible' : p < 0.6 ? 'moyen' : p < 0.85 ? 'bon' : 'excellent'; },
  // l'histoire du rapport de forces telle que ce sorcier l'a perçue, tour après tour (pour le graphique)
  recordHistory(game, pl) {
    const rows = [];
    for (const o of game.players) {
      if (!o.alive || (o !== pl && !(pl.contact && pl.contact[o.id]))) continue;
      const v = Intel.overview(game, pl, o.id); if (!v) continue;
      rows.push(v.exact ? [o.id, v.score, v.army] : [o.id, v.score, v.army, v.scoreLo, v.scoreHi, v.armyLo, v.armyHi]);
    }
    const hist = pl.seenHistory || (pl.seenHistory = []);
    if (hist.length && hist[hist.length - 1].t === game.turn) hist.pop();
    hist.push({ t: game.turn, r: rows });
    if (hist.length > 500) hist.shift();
  },
  // cités d'un rival dont on connaît l'emplacement (tout ce que le joueur sait de leur nombre)
  locatedOf(game, pl, other) {
    if (pl.id === other) return Cities.ofPlayer(game, other).length;
    let n = 0; for (const c of Object.values(game.cities)) if (c.owner === other && Intel.knows(game, pl, c.plane, c.x, c.y)) n++;
    return n;
  },
  // nombre de cités d'un sorcier : public s'il a été rencontré, sinon celles qu'on a repérées
  citiesOf(game, pl, other) {
    if (pl.id === other || (pl.contact && pl.contact[other])) return Cities.ofPlayer(game, other).length;
    return Intel.knownCities(game, pl).filter(c => c.owner === other).length;
  },
  // puissance d'un sorcier telle qu'un autre la perçoit (mêmes unités que Diplomacy.power)
  powerOf(game, pl, other) {
    const o = game.players[other]; if (!o) return 0;
    if (pl.id === other) return Diplomacy.power(game, o);
    return Intel.armyOf(game, pl, other) + Intel.citiesOf(game, pl, other) * 50;
  },
  // poids d'un sorcier dans la partie, d'après ce qui est public (cités, puissance magique, sorts, renommée) et son armée estimée
  standing(game, pl, other) {
    const o = game.players[other]; if (!o || !o.alive) return 0;
    const pub = pl.id === other || (pl.contact && pl.contact[other]);
    const cities = Intel.citiesOf(game, pl, other);
    const power = pub ? Magic.power(game, o) : 0, spells = pub ? o.known.length : 0, fame = pub ? Players.fame(game, o) : 0;
    return cities * 40 + power * 3 + spells * 4 + fame * 2 + Intel.armyOf(game, pl, other) / 10;
  },
};
