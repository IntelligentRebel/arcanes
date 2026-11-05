'use strict';
// Déplacements terrestres, navals et aériens ; recherche de chemin ; brouillard de guerre.

const MAX_STACK = 9;

const Move = {
  // propriétés partagées par un groupe qui se déplace ensemble
  groupInfo(game, units) {
    const info = { flyingAll: true, windWalking: false, pathfinding: false, forester: false, mountaineer: false, swimAll: true, sailors: [], landers: [], capacity: 0, waterWalk: true, planeShift: true, tidal: units.length > 0 };
    for (const u of units) {
      // Temple des Marées : une troupe toute lézarde file sur l'eau
      if (info.tidal && (DATA.units[u.type].race !== 'lizardman' || !Wonders.has(game, u.owner, 'lizardman'))) info.tidal = false;
      const s = Units.stats(game, u);
      const ab = s.ab;
      if (ab.windWalking) info.windWalking = true;
      if (ab.pathfinding) info.pathfinding = true;
      if (ab.forester) info.forester = true;
      if (ab.mountaineer) info.mountaineer = true;
      if (!ab.planeShift) info.planeShift = false;
      if (!s.flying) info.flyingAll = false;
      if (s.sailing) { info.sailors.push(u); info.capacity += Move.capacity(u); }
      else if (s.flying && Move.capacity(u)) { info.capacity += Move.capacity(u); info.flyCarriers = (info.flyCarriers || 0) + 1; }   // Navire volant : il porte aussi
      else if (!s.flying && !s.swimming && !ab.waterWalking) { info.landers.push(u); }
      if (!s.swimming && !s.flying && !ab.waterWalking) info.swimAll = false;
      if (!ab.waterWalking) info.waterWalk = false;
    }
    if (info.windWalking) { info.flyingAll = true; info.landers = []; }
    return info;
  },
  // Règle d'Arcanes (option de partie) : sans route, seuls les volants, les montagnards, les éclaireurs de route
  // (Pathfinding, Marche du vent) et les ingénieurs entrent sur une montagne.
  mountainsBlock(game) { return !!(game.opts && game.opts.mountainsBlock); },
  mountainOK(game, units, gi) {
    if (gi.flyingAll || gi.windWalking || gi.mountaineer || gi.pathfinding) return true;
    return units.every(u => { const d = DATA.units[u.type]; return Units.stats(game, u).flying || !!d.abilities.construction; });
  },
  blockedMountain(game, plane, x, y) {
    if (!Move.mountainsBlock(game)) return false;
    const world = game.world;
    return World.terr(world, plane, x, y) === T.MOUNTAIN && !World.hasRoad(world, plane, x, y);
  },
  // tour d'arrivée de chaque pas d'un chemin (0 = ce tour-ci) : on entre dans une case tant qu'il reste du mouvement,
  // le reste du coût est perdu, et chaque tour rend le plein (comme Game.continueMove)
  stepTurns(left, per, path) {
    const out = []; let moves = left, turn = 0, prev = 0;
    for (const st of path) {
      let step = st.cost - prev; prev = st.cost;
      // wait : le groupe attend le plein avant d'entrer (pour traverser une case pleine sans s'y arrêter)
      if (st.wait) { step -= st.wait; turn++; moves = per; }
      else if (moves <= 0) { turn++; moves = per; }
      moves -= step; out.push(turn);
    }
    return out;
  },
  // les unités qui donnent l'allure du groupe : sous Marche des vents, celles qui portent la pile (les autres sont emportées)
  pacers(game, units) { if (!Move.groupInfo(game, units).windWalking) return units; return units.filter(u => Units.stats(game, u).ab.windWalking); },
  // un groupe quitte une case d'eau : les unités de la case qu'il emporte (navires, Navire volant : à concurrence de leurs places ;
  // Marche des vents : toutes celles qui ne tiennent pas seules sur l'eau), et celles qui y resteraient sans rien pour les porter
  carriedFrom(game, group, plane, x, y, pid) {
    const out = { riders: [], stranded: [] };
    if (!World.isWaterAt(game.world, plane, x, y) || Cities.at(game, plane, x, y)) return out;
    const others = Units.at(game, plane, x, y).filter(o => o.owner === pid && !group.includes(o)); if (!others.length) return out;
    const lander = o => { const s = Units.stats(game, o); return !s.flying && !s.swimming && !s.sailing && !s.ab.waterWalking && !s.ab.windWalking; };
    const gi = Move.groupInfo(game, group);
    if (gi.windWalking) out.riders = others.filter(lander);
    else { const room = Math.max(0, gi.capacity - gi.landers.length); out.riders = others.filter(lander).slice(0, room); }
    const left = others.filter(o => !out.riders.includes(o));
    if (left.length && !Move.canStand(game, left, Move.groupInfo(game, left), plane, x, y, pid)) out.stranded = left;
    return out;
  },
  capacity(u) { const d = DATA.units[u.type]; if (d.transport) return d.transport; return { Trireme: 2, Galley: 5, Warship: 3, AirShip: 2, FloatingIsland: 8 }[u.type] || 0; },

  // coût (demi-points) pour qu'une unité du groupe entre dans la case
  stepCost(game, u, gi, plane, fx, fy, tx, ty) {
    const world = game.world;
    const s = Units.stats(game, u);
    const water = World.isWaterAt(world, plane, tx, ty);
    if (gi.windWalking || s.flying) return 2;
    if (water) return gi.tidal ? 1 : 2;
    const roadFrom = World.hasRoad(world, plane, fx, fy), roadTo = World.hasRoad(world, plane, tx, ty);
    if (roadFrom && roadTo) return World.get(world, plane, 'road', tx, ty) === 2 ? 0 : 1;
    const t = World.terr(world, plane, tx, ty);
    if (gi.pathfinding) return 2;
    if (gi.forester && (t === T.FOREST || t === T.NNODE)) return 2;
    if (gi.mountaineer && (t === T.HILLS || t === T.MOUNTAIN || t === T.CNODE || t === T.VOLCANO)) return 2;
    return World.moveCost(world, plane, tx, ty);
  },

  // le groupe peut-il physiquement se trouver sur cette case ?
  // gardiens de nœud : ils ne s'éloignent pas à plus de 2 cases de leur nœud
  boundOK(game, units, x, y) {
    for (const u of units) if (u.nodeBound != null) { const s = game.sites[u.nodeBound]; if (s && World.dist(game.world, s.x, s.y, x, y) > 2) return false; }
    return true;
  },
  // un lieu gardé barre le chemin ; pour le joueur, tout lieu qu'il ne sait pas vidé aussi (il ignore ce qui s'y cache)
  siteBlocks(game, pid, st) {
    if (!st.cleared && st.guardians && st.guardians.length) return true;
    const pl = pid != null && pid >= 0 ? game.players[pid] : null;
    return !!(pl && pl.human && Game.isLair(st) && !Game.knownCleared(pl, st));
  },
  // frontières fermées : les sorciers en paix (ou alliés) qui interdisent leur territoire à pid
  closedBy(game, pid) {
    const out = new Set();
    if (pid == null || pid < 0) return out;
    for (const o of game.players) if (o && o.alive && o.id !== pid && o.closedTo && o.closedTo[pid] && ['peace', 'alliance'].includes(o.diplo[pid])) out.add(o.id);
    return out;
  },
  closedAt(game, pid, plane, x, y, set) {
    set = set || Move.closedBy(game, pid); if (!set.size) return false;
    return set.has(World.get(game.world, plane, 'owner', x, y));
  },
  canStand(game, units, gi, plane, x, y, pid) {
    const world = game.world;
    if (!World.inY(world, y)) return false;
    if (!Move.boundOK(game, units, x, y)) return false;
    const water = World.isWaterAt(world, plane, x, y);
    const city = Cities.at(game, plane, x, y);
    if (water) {
      if (gi.flyingAll || gi.swimAll) return true;
      // transport : capacité navale du groupe + navires amis déjà sur place
      let cap = gi.capacity, load = gi.landers.length;
      for (const o of Units.at(game, plane, x, y)) if (o.owner === pid && !units.includes(o)) { const os = Units.stats(game, o); if (os.sailing || (os.flying && Move.capacity(o))) cap += Move.capacity(o); else if (!os.flying && !os.swimming) load++; }
      return cap >= load;
    }
    // terre : les navires ne vont que dans les cités côtières
    if (gi.sailors.length) {
      if (!city) return false;
      let coastal = false; for (const [nx, ny] of World.neighbors(world, x, y)) if (World.isWaterAt(world, plane, nx, ny)) coastal = true;
      if (!coastal) return false;
    }
    if (Move.blockedMountain(game, plane, x, y) && !Move.mountainOK(game, units, gi)) return false;
    if (Move.closedAt(game, pid, plane, x, y)) return false;
    return true;
  },

  stackCount(game, plane, x, y, pid, excludeIds) {
    let n = 0; for (const u of Units.at(game, plane, x, y)) if (u.owner === pid && !(excludeIds && excludeIds.has(u.id))) n++;
    return n;
  },

  // la case suivante d'une traversée : on doit pouvoir s'y tenir sans combat (sinon on resterait bloqué dans la case pleine)
  canPassTo(game, units, gi, plane, x, y, pid, excl) {
    if (Move.hostileAt(game, pid, plane, x, y) || Move.closedAt(game, pid, plane, x, y) || !Move.canStand(game, units, gi, plane, x, y, pid)) return false;
    const c = Cities.at(game, plane, x, y); if (c && c.owner !== pid) return false;
    const si = World.get(game.world, plane, 'site', x, y); if (si >= 0 && Game.siteHasGuardians(game.sites[si])) return false;
    return Move.stackCount(game, plane, x, y, pid, excl) + units.length <= MAX_STACK;
  },
  hostileAt(game, pid, plane, x, y) {
    for (const u of Units.at(game, plane, x, y)) if (u.owner !== pid) return u;
    return null;
  },

  // coût d'entrée (demi-points) de chaque terrain, (DATA.terrain[T_KEYS[t]].move ou 1) × 2, relevé une fois (les données ne changent pas)
  moveCost2() {
    if (Move._mv2) return Move._mv2;
    const out = [];
    for (let t = 0; t < T_KEYS.length; t++) { const tk = T_KEYS[t]; out[t] = (DATA.terrain[tk] ? DATA.terrain[tk].move : 1) * 2; }
    return (Move._mv2 = out);
  },
  // tableaux du parcours de findPath, réutilisés d'un appel à l'autre (findPath ne s'appelle pas lui-même) ; gen : la marque de cet appel
  _pathTabs(n) {
    let P = Move._ptabs;
    if (!P || P.n !== n) P = Move._ptabs = { n, gen: 0, mark: new Int32Array(n), g: new Float64Array(n), prev: new Float64Array(n), left: new Float64Array(n), turnAt: new Float64Array(n), raw: new Float64Array(n), waitAt: new Float64Array(n), tb: new Float64Array(n) };
    if (++P.gen > 2e9) { P.gen = 1; P.mark.fill(0); }
    return P;
  },
  // A* sur la carte ; renvoie [{x,y,cost}] (coût cumulé en demi-points) ou null
  findPath(game, units, plane, tx, ty, opts = {}) {
    if (!units.length) return null;
    const world = game.world, pid = units[0].owner;
    const pl = game.players[pid];
    const gi = Move.groupInfo(game, units);
    const sx = units[0].x, sy = units[0].y;
    tx = World.wx(world, tx);
    if (sx === tx && sy === ty) return [];
    const W = world.w, H = world.h;
    // départ hors de la carte (clé hors des tableaux) : le parcours d'origine
    if (!(Number.isInteger(sx) && Number.isInteger(sy) && sy * W + sx >= 0 && sy * W + sx < W * H)) return Move.findPathRef(game, units, plane, tx, ty, opts);
    const key = (x, y) => y * W + x;
    const ids = new Set(units.map(u => u.id));
    const allFly = gi.windWalking || units.every(u => Units.stats(game, u).flying);
    const terr = world.planes[plane].terr, road = world.planes[plane].road, site = world.planes[plane].site;
    // index d'occupation construit une seule fois
    const occ = new Map();
    // on ne contourne que les ennemis que l'on voit : ni les invisibles, ni ceux qui se cachent dans le brouillard
    const seen = opts.omniscient || !pl ? null : pl.human ? Move.visibility(game, pid) : Intel.vis(game, pl);
    for (const u of Object.values(game.units)) {
      if (u.plane !== plane) continue;
      const k = key(u.x, u.y); let o = occ.get(k);
      if (!o) { o = { own: 0, hostile: false, cap: 0, load: 0 }; occ.set(k, o); }
      if (u.owner === pid) { if (!ids.has(u.id)) { o.own++; const d = DATA.units[u.type]; if (d.sailing) o.cap += Move.capacity(u); else if (!d.flying && !d.swimming) o.load++; } }
      else if (!seen || (seen[plane][k] && !Intel.hiddenFrom(game, pid, u))) o.hostile = true;
    }
    const cityAt = new Map();
    for (const c of Object.values(game.cities)) if (c.plane === plane) cityAt.set(key(c.x, c.y), c);
    const isWater = k => terr[k] === T.OCEAN || terr[k] === T.LAKE;
    const mtnBlock = Move.mountainsBlock(game) && !Move.mountainOK(game, units, gi);
    const bound = units.filter(u => u.nodeBound != null).map(u => game.sites[u.nodeBound]).filter(Boolean);
    const closed = Move.closedBy(game, pid), owner = world.planes[plane].owner;
    const canStandK = (k, x, y) => {
      if (mtnBlock && terr[k] === T.MOUNTAIN && !road[k]) return false;
      if (closed.size && closed.has(owner[k])) return false;   // territoire interdit par un sorcier en paix
      for (const s of bound) if (World.dist(world, s.x, s.y, x, y) > 2) return false;
      if (isWater(k)) {
        if (allFly || gi.swimAll) return true;
        const o = occ.get(k);
        return gi.capacity + (o ? o.cap : 0) >= gi.landers.length + (o ? o.load : 0);
      }
      if (gi.sailors.length) {
        if (!cityAt.has(k)) return false;
        for (const [dx, dy] of U.DIRS8) { const ny = y + dy; if (ny >= 0 && ny < H && isWater(key(World.wx(world, x + dx), ny))) return true; }
        return false;
      }
      return true;
    };
    const stepCostK = (fk, k) => {
      if (allFly) return 2;
      if (isWater(k)) return gi.tidal ? 1 : 2;
      if (road[fk] && road[k]) return road[k] === 2 ? 0 : 1;
      const t = terr[k];
      if (gi.pathfinding) return 2;
      if (gi.forester && (t === T.FOREST || t === T.NNODE)) return 2;
      if (gi.mountaineer && (t === T.HILLS || t === T.MOUNTAIN || t === T.CNODE || t === T.VOLCANO)) return 2;
      const m2 = MV2[t]; if (m2 !== undefined) return m2;
      const tk = T_KEYS[t];
      return (DATA.terrain[tk] ? DATA.terrain[tk].move : 1) * 2;
    };
    // un trajet se compte en tours, avec la règle de Move.stepTurns : on entre dans une case tant qu'il reste du mouvement,
    // le reste du coût est perdu. Le plus court en points de mouvement peut être bien plus long en tours (une case de
    // colline coûte tout un tour à un fantassin, qu'elle vaille 2 points ou 3). Coût d'un nœud : tours écoulés × plein
    // + mouvement dépensé dans le tour, plus un rien de points dépensés pour départager (le tracé le plus économe).
    // Les tracés de routes (opts.stepCost) gardent leur propre coût.
    const MV2 = Move.moveCost2();
    const timed = !opts.stepCost;
    const per = Math.max(1, Math.min(...units.map(u => Units.maxMoves(game, u))));
    // (performance) les tables du parcours en tableaux typés réutilisés (Move._pathTabs) ; une marque de génération tient lieu
    // de g.has. Mêmes valeurs (flottants 64 bits), mêmes poussées dans le tas dans le même ordre : même chemin que findPathRef.
    const PT = Move._pathTabs(W * H), gen = PT.gen;
    const left = PT.left, turnAt = PT.turnAt, raw = PT.raw, waitAt = PT.waitAt, g = PT.g, prev = PT.prev, tb = PT.tb, mark = PT.mark;
    const open = new Heap();
    const start = key(sx, sy), left0 = Math.min(...units.map(u => u.moves));
    const timeKey = (t, l, r) => t * per + per - Math.max(0, l) + r * 0.001;
    // à temps égal, le tracé le plus droit : un rien pour chaque pas en diagonale de trop, pour l'écart à la droite
    // départ-arrivée, et pour chaque case inconnue (bien moins que le moindre pas de plus : le plus rapide reste le plus rapide)
    const wrapDx = d => { d = ((d % W) + W) % W; return d > W / 2 ? d - W : d; };
    const ldx = wrapDx(tx - sx), ldy = ty - sy, llen = Math.max(1, Math.hypot(ldx, ldy));
    // (au plus 0,0022 par pas : même sur 200 pas, moins qu'un demi-point de mouvement)
    const tbOf = (x, y, nx, ny, unknown) => (nx !== x && ny !== y ? 0.0004 : 0) + 0.0002 * Math.min(8, Math.abs(wrapDx(nx - sx) * ldy - (ny - sy) * ldx) / llen) + (unknown ? 0.0002 : 0);
    const g0 = timed ? timeKey(0, left0, 0) : 0;
    g[start] = g0; mark[start] = gen; left[start] = left0; turnAt[start] = 0; raw[start] = 0; tb[start] = 0; open.push(g0, [g0, sx, sy]);
    const explored = pl && pl.explored[plane];
    const maxNodes = opts.maxNodes || Math.max(5000, 3 * W * H); let n = 0;   // assez pour un long trajet dans le brouillard d'une très grande carte
    const maxCost = opts.maxCost || Infinity;
    while (open.size && n < maxNodes) {
      n++;
      const [, [cg, x, y]] = open.pop();
      const k = key(x, y);
      if (cg > g[k]) continue;
      if (cg > maxCost) break;
      if (x === tx && y === ty) {
        const path = []; let cur = k;
        // cost : points de mouvement cumulés (Move.stepTurns en déduit le tour d'arrivée de chaque pas)
        while (cur !== start) { const cx = cur % W, cy = Math.floor(cur / W), st = { x: cx, y: cy, cost: raw[cur] }; if (waitAt[cur]) st.wait = waitAt[cur]; path.unshift(st); cur = prev[cur]; }
        return path;
      }
      for (const [dx, dy] of U.DIRS8) {
        const nx = World.wx(world, x + dx), ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        const nk = key(nx, ny);
        const isTarget = nx === tx && ny === ty;
        const unknown = explored && !explored[nk] && !opts.omniscient;
        if (bound.length && bound.some(s => World.dist(world, s.x, s.y, nx, ny) > 2)) continue;
        // case inconnue : supposée praticable, mais chère, pour ne s'y aventurer que faute de chemin connu (sinon le tracé plonge dans le brouillard, souvent la mer) ;
        // une troupe toute volante passe partout : pour elle, une case inconnue coûte comme une autre
        const lk = left[k], mv = unknown ? (allFly ? 2 : 8) : stepCostK(k, nk);
        let t = turnAt[k], lf = lk, wait = 0;
        if (lf <= 0) { t++; lf = per; }
        lf -= mv;
        if (!unknown) {
          if (!canStandK(nk, nx, ny)) continue;
          if (!isTarget) {
            const o = occ.get(nk);
            if (o && o.hostile) continue;
            const c = cityAt.get(nk); if (c && c.owner !== pid) continue;
            const si = site[nk];
            if (si >= 0 && Move.siteBlocks(game, pid, game.sites[si])) continue;
            // pile pleine : on la traverse si l'on en ressort ce tour ; faute de mouvement, on attend le plein à côté
            if (!opts.ignoreStackLimit && o && o.own + units.length > MAX_STACK && lf <= 0) {
              if (lk > 0 && lk < per && per - mv > 0) { wait = lk; t++; lf = per - mv; } else continue;
            }
          }
        }
        const rw = raw[k] + mv + wait, tbn = tb[k] + tbOf(x, y, nx, ny, unknown);
        const ng = timed ? timeKey(t, lf, rw) + tbn : cg + Math.max(opts.stepCost(k, nk, x, y, nx, ny, unknown), 0.01);
        if (mark[nk] !== gen || ng < g[nk]) {
          g[nk] = ng; mark[nk] = gen; prev[nk] = k; left[nk] = lf; turnAt[nk] = t; raw[nk] = rw; waitAt[nk] = wait; tb[nk] = tbn;
          open.push(ng + World.dist(world, nx, ny, tx, ty) * (opts.hScale || 1), [ng, nx, ny]);
        }
      }
    }
    return null;
  },

  // le parcours d'origine, sur des Map (départ hors de la carte : ne sert qu'en secours)
  findPathRef(game, units, plane, tx, ty, opts = {}) {
    if (!units.length) return null;
    const world = game.world, pid = units[0].owner;
    const pl = game.players[pid];
    const gi = Move.groupInfo(game, units);
    const sx = units[0].x, sy = units[0].y;
    tx = World.wx(world, tx);
    if (sx === tx && sy === ty) return [];
    const W = world.w, H = world.h;
    const key = (x, y) => y * W + x;
    const ids = new Set(units.map(u => u.id));
    const allFly = gi.windWalking || units.every(u => Units.stats(game, u).flying);
    const terr = world.planes[plane].terr, road = world.planes[plane].road, site = world.planes[plane].site;
    // index d'occupation construit une seule fois
    const occ = new Map();
    // on ne contourne que les ennemis que l'on voit : ni les invisibles, ni ceux qui se cachent dans le brouillard
    const seen = opts.omniscient || !pl ? null : pl.human ? Move.visibility(game, pid) : Intel.vis(game, pl);
    for (const u of Object.values(game.units)) {
      if (u.plane !== plane) continue;
      const k = key(u.x, u.y); let o = occ.get(k);
      if (!o) { o = { own: 0, hostile: false, cap: 0, load: 0 }; occ.set(k, o); }
      if (u.owner === pid) { if (!ids.has(u.id)) { o.own++; const d = DATA.units[u.type]; if (d.sailing) o.cap += Move.capacity(u); else if (!d.flying && !d.swimming) o.load++; } }
      else if (!seen || (seen[plane][k] && !Intel.hiddenFrom(game, pid, u))) o.hostile = true;
    }
    const cityAt = new Map();
    for (const c of Object.values(game.cities)) if (c.plane === plane) cityAt.set(key(c.x, c.y), c);
    const isWater = k => terr[k] === T.OCEAN || terr[k] === T.LAKE;
    const mtnBlock = Move.mountainsBlock(game) && !Move.mountainOK(game, units, gi);
    const bound = units.filter(u => u.nodeBound != null).map(u => game.sites[u.nodeBound]).filter(Boolean);
    const closed = Move.closedBy(game, pid), owner = world.planes[plane].owner;
    const canStandK = (k, x, y) => {
      if (mtnBlock && terr[k] === T.MOUNTAIN && !road[k]) return false;
      if (closed.size && closed.has(owner[k])) return false;   // territoire interdit par un sorcier en paix
      for (const s of bound) if (World.dist(world, s.x, s.y, x, y) > 2) return false;
      if (isWater(k)) {
        if (allFly || gi.swimAll) return true;
        const o = occ.get(k);
        return gi.capacity + (o ? o.cap : 0) >= gi.landers.length + (o ? o.load : 0);
      }
      if (gi.sailors.length) {
        if (!cityAt.has(k)) return false;
        for (const [dx, dy] of U.DIRS8) { const ny = y + dy; if (ny >= 0 && ny < H && isWater(key(World.wx(world, x + dx), ny))) return true; }
        return false;
      }
      return true;
    };
    const stepCostK = (fk, k) => {
      if (allFly) return 2;
      if (isWater(k)) return gi.tidal ? 1 : 2;
      if (road[fk] && road[k]) return road[k] === 2 ? 0 : 1;
      const t = terr[k];
      if (gi.pathfinding) return 2;
      if (gi.forester && (t === T.FOREST || t === T.NNODE)) return 2;
      if (gi.mountaineer && (t === T.HILLS || t === T.MOUNTAIN || t === T.CNODE || t === T.VOLCANO)) return 2;
      const m2 = MV2[t]; if (m2 !== undefined) return m2;
      const tk = T_KEYS[t];
      return (DATA.terrain[tk] ? DATA.terrain[tk].move : 1) * 2;
    };
    // un trajet se compte en tours, avec la règle de Move.stepTurns : on entre dans une case tant qu'il reste du mouvement,
    // le reste du coût est perdu. Le plus court en points de mouvement peut être bien plus long en tours (une case de
    // colline coûte tout un tour à un fantassin, qu'elle vaille 2 points ou 3). Coût d'un nœud : tours écoulés × plein
    // + mouvement dépensé dans le tour, plus un rien de points dépensés pour départager (le tracé le plus économe).
    // Les tracés de routes (opts.stepCost) gardent leur propre coût.
    const MV2 = Move.moveCost2();
    const timed = !opts.stepCost;
    const per = Math.max(1, Math.min(...units.map(u => Units.maxMoves(game, u))));
    const left = new Map(), turnAt = new Map(), raw = new Map(), waitAt = new Map();
    const g = new Map(); const prev = new Map(); const open = new Heap();
    const start = key(sx, sy), left0 = Math.min(...units.map(u => u.moves));
    const timeKey = (t, l, r) => t * per + per - Math.max(0, l) + r * 0.001;
    // à temps égal, le tracé le plus droit : un rien pour chaque pas en diagonale de trop, pour l'écart à la droite
    // départ-arrivée, et pour chaque case inconnue (bien moins que le moindre pas de plus : le plus rapide reste le plus rapide)
    const wrapDx = d => { d = ((d % W) + W) % W; return d > W / 2 ? d - W : d; };
    const ldx = wrapDx(tx - sx), ldy = ty - sy, llen = Math.max(1, Math.hypot(ldx, ldy));
    // (au plus 0,0022 par pas : même sur 200 pas, moins qu'un demi-point de mouvement)
    const tbOf = (x, y, nx, ny, unknown) => (nx !== x && ny !== y ? 0.0004 : 0) + 0.0002 * Math.min(8, Math.abs(wrapDx(nx - sx) * ldy - (ny - sy) * ldx) / llen) + (unknown ? 0.0002 : 0);
    const tb = new Map();
    const g0 = timed ? timeKey(0, left0, 0) : 0;
    g.set(start, g0); left.set(start, left0); turnAt.set(start, 0); raw.set(start, 0); tb.set(start, 0); open.push(g0, [g0, sx, sy]);
    const explored = pl && pl.explored[plane];
    const maxNodes = opts.maxNodes || Math.max(5000, 3 * W * H); let n = 0;   // assez pour un long trajet dans le brouillard d'une très grande carte
    const maxCost = opts.maxCost || Infinity;
    while (open.size && n < maxNodes) {
      n++;
      const [, [cg, x, y]] = open.pop();
      const k = key(x, y);
      if (cg > g.get(k)) continue;
      if (cg > maxCost) break;
      if (x === tx && y === ty) {
        const path = []; let cur = k;
        // cost : points de mouvement cumulés (Move.stepTurns en déduit le tour d'arrivée de chaque pas)
        while (cur !== start) { const cx = cur % W, cy = Math.floor(cur / W), st = { x: cx, y: cy, cost: raw.get(cur) }; if (waitAt.get(cur)) st.wait = waitAt.get(cur); path.unshift(st); cur = prev.get(cur); }
        return path;
      }
      for (const [dx, dy] of U.DIRS8) {
        const nx = World.wx(world, x + dx), ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        const nk = key(nx, ny);
        const isTarget = nx === tx && ny === ty;
        const unknown = explored && !explored[nk] && !opts.omniscient;
        if (bound.length && bound.some(s => World.dist(world, s.x, s.y, nx, ny) > 2)) continue;
        // case inconnue : supposée praticable, mais chère, pour ne s'y aventurer que faute de chemin connu (sinon le tracé plonge dans le brouillard, souvent la mer) ;
        // une troupe toute volante passe partout : pour elle, une case inconnue coûte comme une autre
        const lk = left.get(k), mv = unknown ? (allFly ? 2 : 8) : stepCostK(k, nk);
        let t = turnAt.get(k), lf = lk, wait = 0;
        if (lf <= 0) { t++; lf = per; }
        lf -= mv;
        if (!unknown) {
          if (!canStandK(nk, nx, ny)) continue;
          if (!isTarget) {
            const o = occ.get(nk);
            if (o && o.hostile) continue;
            const c = cityAt.get(nk); if (c && c.owner !== pid) continue;
            const si = site[nk];
            if (si >= 0 && Move.siteBlocks(game, pid, game.sites[si])) continue;
            // pile pleine : on la traverse si l'on en ressort ce tour ; faute de mouvement, on attend le plein à côté
            if (!opts.ignoreStackLimit && o && o.own + units.length > MAX_STACK && lf <= 0) {
              if (lk > 0 && lk < per && per - mv > 0) { wait = lk; t++; lf = per - mv; } else continue;
            }
          }
        }
        const rw = raw.get(k) + mv + wait, tbn = tb.get(k) + tbOf(x, y, nx, ny, unknown);
        const ng = timed ? timeKey(t, lf, rw) + tbn : cg + Math.max(opts.stepCost(k, nk, x, y, nx, ny, unknown), 0.01);
        if (!g.has(nk) || ng < g.get(nk)) {
          g.set(nk, ng); prev.set(nk, k); left.set(nk, lf); turnAt.set(nk, t); raw.set(nk, rw); waitAt.set(nk, wait); tb.set(nk, tbn);
          open.push(ng + World.dist(world, nx, ny, tx, ty) * (opts.hScale || 1), [ng, nx, ny]);
        }
      }
    }
    return null;
  },

  // tracé d'une route : ce n'est pas le trajet le plus facile à pied. Une route se parcourt au même prix sur tous les
  // terrains, donc chaque case de plus pèse sur tous les trajets futurs ; et chaque case à empierrer coûte son temps de
  // travaux (forêt et collines 6 tours, prairie 3). Coût d'une case : 3 (sa longueur) + ses travaux s'il n'y a pas déjà
  // une route ; à coût égal, la ligne la plus droite (un pas en diagonale compte un peu plus).
  roadPath(game, units, plane, tx, ty, opts = {}) {
    const world = game.world, W = world.w, terr = world.planes[plane].terr, road = world.planes[plane].road;
    const mult = Math.max(1, U.sum(units, u => DATA.units[u.type].race === 'dwarf' ? 2 : 1));
    const stepCost = (fk, k, x, y, nx, ny, unknown) => {
      const diag = nx !== x && ny !== y ? 0.05 : 0;
      if (unknown) return 3 + 4 / mult + diag;
      const td = DATA.terrain[T_KEYS[terr[k]]];
      return 3 + (road[k] ? 0 : ((td && td.roadTurns) || 4) / mult) + diag;
    };
    return Move.findPath(game, units, plane, tx, ty, Object.assign({}, opts, { stepCost, hScale: 3, maxNodes: opts.maxNodes || 20000 }));
  },
  // exploration automatique : case connue la plus proche (en coût de trajet) bordant l'inconnu
  // trouvaille connue la plus proche, atteignable sans combat (éclaireurs de l'IA, exploration automatique)
  nearestCache(game, units, maxDist = 8) {
    if (!units.length || !game.caches || !game.caches.length) return null;
    const u0 = units[0], pl = game.players[u0.owner], world = game.world;
    const ex = pl && pl.explored && pl.explored[u0.plane]; if (!ex) return null;
    const near = game.caches.filter(c => c.plane === u0.plane && ex[c.y * world.w + c.x] && World.dist(world, c.x, c.y, u0.x, u0.y) <= maxDist)
      .sort((a, b) => World.dist(world, a.x, a.y, u0.x, u0.y) - World.dist(world, b.x, b.y, u0.x, u0.y));
    for (const c of near.slice(0, 4)) {
      if (Move.hostileAt(game, u0.owner, c.plane, c.x, c.y)) continue;
      const path = Move.findPath(game, units, c.plane, c.x, c.y, { maxNodes: 2500 });
      if (path && path.length && path.length <= maxDist + 4) return [c.x, c.y];
    }
    return null;
  },
  // avoid : cibles déjà prises par d'autres éclaireurs (on cherche un front à plus de 4 cases de chacune)
  nearestFrontier(game, units, maxNodes = 4000, avoid, dead) {
    if (!units.length) return null;
    const world = game.world, pid = units[0].owner, pl = game.players[pid], plane = units[0].plane;
    const explored = pl && pl.explored[plane]; if (!explored) return null;
    const gi = Move.groupInfo(game, units);
    const allFly = gi.windWalking || units.every(u => Units.stats(game, u).flying);
    const naval = gi.sailors.length > 0;
    const W = world.w, H = world.h, key = (x, y) => y * W + x;
    const terr = world.planes[plane].terr, road = world.planes[plane].road, site = world.planes[plane].site;
    const hostile = new Set(), own = new Map();
    for (const u of Object.values(game.units)) { if (u.plane !== plane) continue; const k = key(u.x, u.y); if (u.owner !== pid) hostile.add(k); else if (!units.includes(u)) own.set(k, (own.get(k) || 0) + 1); }
    const foreignCity = new Set(); for (const c of Object.values(game.cities)) { if (c.plane === plane && c.owner !== pid) foreignCity.add(key(c.x, c.y)); }
    const isWater = k => terr[k] === T.OCEAN || terr[k] === T.LAKE;
    const mtnBlock = Move.mountainsBlock(game) && !Move.mountainOK(game, units, gi);
    const closed = Move.closedBy(game, pid), owner = world.planes[plane].owner;
    const ok = k => {
      if (!explored[k] || hostile.has(k) || foreignCity.has(k)) return false;
      if (closed.size && closed.has(owner[k])) return false;
      if (mtnBlock && terr[k] === T.MOUNTAIN && !road[k]) return false;
      if ((own.get(k) || 0) + units.length > MAX_STACK) return false;
      const si = site[k]; if (si >= 0 && Move.siteBlocks(game, pid, game.sites[si])) return false;
      if (isWater(k)) return allFly || gi.swimAll || naval;
      return !naval || allFly;
    };
    const sx = units[0].x, sy = units[0].y, start = key(sx, sy);
    const g = new Map([[start, 0]]), open = new Heap(); open.push(0, [0, sx, sy]);
    let n = 0, firstCost = null, best = null, bestScore = -Infinity;
    // inconnu dans un rayon de 2 : on préfère les fronts qui dévoilent beaucoup
    const unknownAround = (x, y) => { let c = 0; for (let dy = -2; dy <= 2; dy++) { const ny = y + dy; if (ny < 0 || ny >= H) continue; for (let dx = -2; dx <= 2; dx++) if (!explored[key(World.wx(world, x + dx), ny)]) c++; } return c; };
    while (open.size && n++ < maxNodes) {
      const [, [cg, x, y]] = open.pop(); const k = key(x, y);
      if (cg > g.get(k)) continue;
      if (firstCost != null && cg > firstCost + 8) break;
      if (k !== start) {
        let frontier = false;
        for (const [dx, dy] of U.DIRS8) { const ny = y + dy; if (ny < 0 || ny >= H) continue; if (!explored[key(World.wx(world, x + dx), ny)]) { frontier = true; break; } }
        if (frontier && avoid && avoid.some(a => World.dist(world, a[0], a[1], x, y) <= 4)) frontier = false;
        // un front où l'on est déjà allé sans rien découvrir (l'inconnu reste hors de vue) : inutile d'y retourner
        if (frontier && dead && dead.has(k)) frontier = false;
        if (frontier) {
          if (firstCost == null) firstCost = cg;
          const sc = unknownAround(x, y) * 3 - cg;
          if (sc > bestScore) { bestScore = sc; best = [x, y]; }
        }
      }
      for (const [dx, dy] of U.DIRS8) {
        const nx = World.wx(world, x + dx), ny = y + dy; if (ny < 0 || ny >= H) continue;
        const nk = key(nx, ny); if (!ok(nk)) continue;
        const step = allFly || isWater(nk) ? 2 : road[k] && road[nk] ? 1 : (DATA.terrain[T_KEYS[terr[nk]]] ? DATA.terrain[T_KEYS[terr[nk]]].move : 1) * 2;
        const ng = cg + step;
        if (!g.has(nk) || ng < g.get(nk)) { g.set(nk, ng); open.push(ng, [ng, nx, ny]); }
      }
    }
    return best;
  },

  // exploration automatique, ce plan-ci épuisé : le passage vers l'autre plan (tour dégagée, faille ouverte, porte astrale,
  // ou sur place pour qui sait sauter de plan) le plus proche, connu, atteignable sans combat, et de l'autre côté duquel il
  // reste de l'inconnu à portée. { x, y, here } ou null.
  explorePortal(game, units) {
    if (!units.length) return null;
    const world = game.world, u0 = units[0], pid = u0.owner, pl = game.players[pid], plane = u0.plane, np = 1 - plane;
    const ex = pl && pl.explored && pl.explored[plane], exN = pl && pl.explored && pl.explored[np]; if (!ex || !exN) return null;
    if (!exN.some(v => !v)) return null;   // l'autre plan est déjà entièrement connu
    if (game.players.some(p => p.alive && p.globals.includes('planar_seal'))) return null;
    const cands = [];
    if (Move.groupInfo(game, units).planeShift) cands.push([u0.x, u0.y]);
    for (const s of game.sites) if (s.plane === plane && ex[s.y * world.w + s.x] && (s.type === 'tower' && s.cleared || s.type === 'rift' && !s.closed)) cands.push([s.x, s.y]);
    for (const id in game.cities) { const c = game.cities[id]; if (c.plane === plane && c.owner === pid && Cities.hasEnch(c, 'astral_gate')) cands.push([c.x, c.y]); }
    cands.sort((a, b) => World.dist(world, a[0], a[1], u0.x, u0.y) - World.dist(world, b[0], b[1], u0.x, u0.y));
    for (const [x, y] of cands.slice(0, 6)) {
      if (Game.planeShiftBlock(game, units, plane, x, y, true)) continue;
      const here = x === u0.x && y === u0.y;
      if (!here) {
        if (Move.hostileAt(game, pid, plane, x, y)) continue;
        const path = Move.findPath(game, units, plane, x, y, { maxNodes: 6000 });
        if (!path || !path.length) continue;
      }
      // de l'autre côté, il faut de l'inconnu à portée (sinon on ferait l'aller-retour pour rien)
      let fresh = false;
      for (let dy = -1; dy <= 1 && !fresh; dy++) for (let dx = -1; dx <= 1; dx++) if (World.inY(world, y + dy) && !exN[World.idx(world, x + dx, y + dy)]) { fresh = true; break; }
      const ghosts = units.map(u => Object.assign({}, u, { plane: np, x, y }));
      if (!fresh && !Move.nearestFrontier(game, ghosts, 3000)) continue;
      return { x, y, here };
    }
    return null;
  },

  // ---------- brouillard ----------
  ensureFog(game, pl) {
    const n = game.world.w * game.world.h;
    for (const p of [0, 1]) if (!pl.explored[p]) pl.explored[p] = new Array(n).fill(0);
  },
  reveal(game, pl, plane, x, y, r) {
    if (!pl || pl.id < 0) return;
    Move.ensureFog(game, pl);
    const world = game.world, ex = pl.explored[plane];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const ny = y + dy; if (!World.inY(world, ny)) continue;
      if (dx * dx + dy * dy > r * r + r) continue;
      ex[World.idx(world, x + dx, ny)] = 1;
    }
  },
  // hauteur d'une case pour la ligne de vue : collines 1, montagnes et volcans 2
  heightOf(t) { return t === T.MOUNTAIN || t === T.VOLCANO ? 2 : t === T.HILLS || t === T.CNODE ? 1 : 0; },
  // cases vues par une unité : rayon accru sur les hauteurs (+1 colline, +2 montagne) ; les montagnes cachent
  // ce qu'il y a derrière elles, les collines aussi pour qui est en plaine ; les volants voient par-dessus tout.
  sightCells(game, u, cb) {
    const world = game.world, terr = world.planes[u.plane].terr, W = world.w;
    const fly = Units.stats(game, u).flying;
    const hv = Move.heightOf(terr[u.y * W + World.wx(world, u.x)]);
    const r = Move.sightOf(game, u) + (fly ? 0 : hv);
    const blocks = (x, y) => { if (y < 0 || y >= world.h) return false; const h = Move.heightOf(terr[y * W + World.wx(world, x)]); return h >= 2 || h > hv; };
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const ny = u.y + dy; if (!World.inY(world, ny)) continue;
      if (dx * dx + dy * dy > r * r + r) continue;
      const n = Math.max(Math.abs(dx), Math.abs(dy));
      let seen = true;
      if (!fly && n > 1) {
        for (let k = 1; k < n && seen; k++) {
          const fx = dx * k / n, fy = dy * k / n;
          // sur une demi-case, la vue passe si l'une des deux cases voisines est dégagée
          const xs = Math.abs(fx % 1) === .5 ? [Math.floor(fx), Math.ceil(fx)] : [Math.round(fx)];
          const ys = Math.abs(fy % 1) === .5 ? [Math.floor(fy), Math.ceil(fy)] : [Math.round(fy)];
          let clear = false;
          for (const ax of xs) for (const ay of ys) if (!blocks(u.x + ax, u.y + ay)) clear = true;
          if (!clear) seen = false;
        }
      }
      if (seen) cb(ny * W + World.wx(world, u.x + dx));
    }
  },
  revealUnit(game, pl, u) {
    if (!pl || pl.id < 0) return;
    Move.ensureFog(game, pl);
    const ex = pl.explored[u.plane];
    Move.sightCells(game, u, i => { ex[i] = 1; });
  },
  sightOf(game, u) {
    const s = Units.stats(game, u);
    const base = s.flying || u.hero ? 2 : 1;
    // Éclaireur N : voit à N cases, et toujours au moins une de plus que sans (un volant éclaireur voit plus loin qu'un volant) ;
    // chez un héros, l'Œil de lynx porte N à la vue actuelle + 1 (Heroes.applyTalent)
    if (!s.ab.scouting) return base;
    const N = Number(s.ab.scouting) || 2;
    return Math.max(N, base + 1);
  },
  citySight(c) {
    let r = 2;
    if (c.buildings.cityWalls) r = 3;
    if (c.buildings.oracle) r = 4;
    if (c.ench.some(e => e.spell === 'natures_eye')) r = 5;
    return r;
  },
  // visibilité courante (calculée à la demande pour l'affichage)
  visibility(game, pid) {
    const world = game.world, n = world.w * world.h;
    const vis = [new Uint8Array(n), new Uint8Array(n)];
    const mark = (plane, x, y, r) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const ny = y + dy; if (!World.inY(world, ny)) continue;
        if (dx * dx + dy * dy > r * r + r) continue;
        vis[plane][World.idx(world, x + dx, ny)] = 1;
      }
    };
    for (const u of Object.values(game.units)) if (u.owner === pid) { const v = vis[u.plane]; Move.sightCells(game, u, i => { v[i] = 1; }); }
    for (const c of Object.values(game.cities)) if (c.owner === pid) mark(c.plane, c.x, c.y, Move.citySight(c));
    const pl = game.players[pid];
    if (pl && pl.globals.includes('natures_awareness')) { vis[0].fill(1); vis[1].fill(1); }
    return vis;
  },
  revealAllFor(game, pl) {
    for (const u of Object.values(game.units)) if (u.owner === pl.id) Move.revealUnit(game, pl, u);
    for (const c of Object.values(game.cities)) if (c.owner === pl.id) Move.reveal(game, pl, c.plane, c.x, c.y, Move.citySight(c));
  },
};
