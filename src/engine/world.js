'use strict';
// Carte du monde : deux plans (Arcane, Miroir), enroulés horizontalement comme l'original.

const World = {
  create(w, h) {
    const mk = (v) => new Array(w * h).fill(v);
    const planes = [0, 1].map(p => ({
      p, w, h,
      terr: mk(T.OCEAN), mineral: mk(0), road: mk(0), corrupt: mk(0),
      owner: mk(-1),    // propriétaire du territoire (joueur) ou -1
      ownerCity: mk(-1),// cité qui projette son influence
      site: mk(-1),     // index dans game.sites
      river: mk(0),     // liaisons du cours d'eau : 1 N, 2 E, 4 S, 8 O
      roadWork: {},     // progression des routes "x,y" -> tours accumulés
    }));
    return { w, h, planes };
  },

  wx(world, x) { const w = world.w; return ((x % w) + w) % w; },
  idx(world, x, y) { return y * world.w + World.wx(world, x); },
  inY(world, y) { return y >= 0 && y < world.h; },
  dist(world, x1, y1, x2, y2) { // distance de Tchebychev avec enroulement horizontal
    let dx = Math.abs(x1 - x2); dx = Math.min(dx, world.w - dx);
    return Math.max(dx, Math.abs(y1 - y2));
  },
  dxw(world, x1, x2) { let dx = x2 - x1; const w = world.w; if (dx > w / 2) dx -= w; if (dx < -w / 2) dx += w; return dx; },

  terr(world, p, x, y) { if (!World.inY(world, y)) return T.OCEAN; return world.planes[p].terr[World.idx(world, x, y)]; },
  setTerr(world, p, x, y, t) { if (World.inY(world, y)) world.planes[p].terr[World.idx(world, x, y)] = t; },
  isWater(t) { return t === T.OCEAN || t === T.LAKE; },
  isWaterAt(world, p, x, y) { return World.isWater(World.terr(world, p, x, y)); },
  isShore(world, p, x, y) {
    if (!World.isWaterAt(world, p, x, y)) return false;
    for (const [dx, dy] of U.DIRS8) { const ny = y + dy; if (World.inY(world, ny) && !World.isWaterAt(world, p, x + dx, ny)) return true; }
    return false;
  },
  terrainKey(world, p, x, y) {
    const t = World.terr(world, p, x, y);
    if (t === T.OCEAN && World.isShore(world, p, x, y)) return 'shore';
    return T_KEYS[t];
  },
  get(world, p, field, x, y) { if (!World.inY(world, y)) return null; return world.planes[p][field][World.idx(world, x, y)]; },
  set(world, p, field, x, y, v) { if (World.inY(world, y)) world.planes[p][field][World.idx(world, x, y)] = v; },

  // Bassin d'une cité : 5x5 sans les coins (21 cases), comme l'original
  catchment(world, x, y) {
    const out = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
      const ny = y + dy; if (!World.inY(world, ny)) continue;
      out.push([World.wx(world, x + dx), ny]);
    }
    return out;
  },
  neighbors(world, x, y) {
    const out = [];
    for (const [dx, dy] of U.DIRS8) { const ny = y + dy; if (World.inY(world, ny)) out.push([World.wx(world, x + dx), ny]); }
    return out;
  },

  foodOf(world, p, x, y) {
    if (World.get(world, p, 'corrupt', x, y)) return 0;
    const key = World.terrainKey(world, p, x, y);
    let f = DATA.terrain[key] ? DATA.terrain[key].food : 0;
    if (key === 'lake') {
      for (const [nx, ny] of World.neighbors(world, x, y)) if (World.terr(world, p, nx, ny) === T.RIVER) { f = 2; break; }
    }
    return f;
  },
  prodPctOf(world, p, x, y, gaia) {
    if (World.get(world, p, 'corrupt', x, y)) return 0;
    const key = World.terrainKey(world, p, x, y);
    let v = DATA.terrain[key] ? DATA.terrain[key].prodPct : 0;
    if (gaia && key === 'forest') v *= 2;
    return v;
  },
  // bonus d'or de la case de la cité elle-même (rivière, embouchure, côte)
  cityGoldPct(world, p, x, y) {
    const t = World.terr(world, p, x, y);
    let touchingShore = false, touchingShoreCardinal = false;
    for (const [dx, dy] of U.DIRS8) {
      const ny = y + dy; if (!World.inY(world, ny)) continue;
      if (World.isWaterAt(world, p, x + dx, ny)) { touchingShore = true; if (dx === 0 || dy === 0) touchingShoreCardinal = true; }
    }
    if (t === T.RIVER && touchingShoreCardinal) return 30;
    if (t === T.RIVER) return 20;
    if (touchingShore) return 10;
    return 0;
  },
  moveCost(world, p, x, y) { // en demi-points de mouvement
    const key = World.terrainKey(world, p, x, y);
    const base = DATA.terrain[key] ? DATA.terrain[key].move : 1;
    return base * 2;
  },
  hasRoad(world, p, x, y) { return !!World.get(world, p, 'road', x, y); },
};

// ---------- Génération ----------
const MapGen = {
  // bruit de valeur enroulé horizontalement
  makeNoise(rng, w, h, cell) {
    const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell) + 2;
    const g = []; for (let i = 0; i < gw * gh; i++) g.push(rng.next());
    const at = (gx, gy) => g[(((gx % gw) + gw) % gw) + Math.min(gh - 1, Math.max(0, gy)) * gw];
    const smooth = t => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = x / cell, fy = y / cell;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
  },
  fractal(rng, w, h, cells, weights) {
    const ns = cells.map(c => MapGen.makeNoise(rng, w, h, c));
    const tot = U.sum(weights);
    return (x, y) => { let v = 0; for (let i = 0; i < ns.length; i++) v += ns[i](x, y) * weights[i]; return v / tot; };
  },

  generate(game, opts) {
    const rng = game.rng;
    const w = opts.mapW || 60, h = opts.mapH || 40;
    const world = World.create(w, h);
    const landPct = { small: 0.28, medium: 0.36, large: 0.45 }[opts.landSize || 'medium'];
    for (const pl of world.planes) MapGen.planeTerrain(world, pl.p, rng, landPct);
    game.world = world;
    game.sites = [];
    MapGen.placeTowers(game, rng);
    for (const p of [0, 1]) {
      MapGen.placeNodes(game, p, rng);
      // montagnes infranchissables : des cols relient toutes les plaines d'un même continent (nœuds de chaos compris)
      if (opts.mountainsBlock !== false) MapGen.carvePasses(world, p);
      MapGen.placeMinerals(game, p, rng);
      MapGen.placeLairs(game, p, rng, opts);
    }
    return world;
  },

  planeTerrain(world, p, rng, landPct) {
    const w = world.w, h = world.h;
    const elev = MapGen.fractal(rng, w, h, [14, 7, 3.5], [4, 2, 1]);
    const moist = MapGen.fractal(rng, w, h, [10, 5], [2, 1]);
    const rough = MapGen.fractal(rng, w, h, [6, 3], [2, 1]);
    // élévation avec atténuation aux pôles (océan en haut/bas)
    const E = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const lat = Math.abs(y - (h - 1) / 2) / ((h - 1) / 2);
      let e = elev(x, y) - Math.pow(lat, 3) * 0.35;
      E.push(e);
    }
    const sorted = E.slice().sort((a, b) => a - b);
    const seaLevel = sorted[Math.floor(sorted.length * (1 - landPct))];
    const land = E.map(e => e > seaLevel);
    // altitudes relatives des terres
    const landE = []; for (let i = 0; i < E.length; i++) if (land[i]) landE.push(E[i]);
    landE.sort((a, b) => a - b);
    const mountainLvl = landE[Math.floor(landE.length * 0.9)] || 1;
    const hillLvl = landE[Math.floor(landE.length * 0.76)] || 1;
    const pl = world.planes[p];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!land[i]) { pl.terr[i] = T.OCEAN; continue; }
      const lat = Math.abs(y - (h - 1) / 2) / ((h - 1) / 2);
      const e = E[i], m = moist(x, y), r = rough(x, y);
      let t;
      if (e >= mountainLvl && r > 0.35) t = T.MOUNTAIN;
      else if (e >= hillLvl && r > 0.3) t = T.HILLS;
      else if (lat > 0.82) t = T.TUNDRA;
      else if (lat > 0.72 && m < 0.5) t = T.TUNDRA;
      else if (m < 0.33 && lat < 0.55) t = T.DESERT;
      else if (m > 0.68 && e < hillLvl) t = T.SWAMP;
      else if (m > 0.5) t = T.FOREST;
      else t = T.GRASS;
      // variété : quelques forêts dans les prairies
      if (t === T.GRASS && rng.chance(0.08)) t = T.FOREST;
      if (t === T.SWAMP && rng.chance(0.4)) t = T.GRASS;
      pl.terr[i] = t;
    }
    // lacs : petites poches d'eau intérieures -> LAKE
    MapGen.markLakes(world, p);
    MapGen.makeRivers(world, p, rng, E);
    // nettoyer les terres isolées d'une case dans l'océan
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (World.isWater(pl.terr[i])) continue;
      let landN = 0; for (const [nx, ny] of World.neighbors(world, x, y)) if (!World.isWaterAt(world, p, nx, ny)) landN++;
      if (landN === 0 && rng.chance(0.5)) pl.terr[i] = T.OCEAN;
    }
  },

  markLakes(world, p) {
    // composantes d'eau de petite taille non reliées aux bords -> lacs
    const pl = world.planes[p], w = world.w, h = world.h;
    const seen = new Array(w * h).fill(false);
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || pl.terr[i] !== T.OCEAN) continue;
      const comp = [i]; seen[i] = true;
      for (let k = 0; k < comp.length; k++) {
        const ci = comp[k], cx = ci % w, cy = Math.floor(ci / w);
        for (const [dx, dy] of U.DIRS4) {
          const ny = cy + dy; if (ny < 0 || ny >= h) continue;
          const ni = ny * w + (((cx + dx) % w) + w) % w;
          if (!seen[ni] && pl.terr[ni] === T.OCEAN) { seen[ni] = true; comp.push(ni); }
        }
      }
      if (comp.length <= 4) for (const ci of comp) pl.terr[ci] = T.LAKE;
    }
  },

  makeRivers(world, p, rng, E) {
    const pl = world.planes[p], w = world.w, h = world.h;
    const sources = [];
    for (let y = 2; y < h - 2; y++) for (let x = 0; x < w; x++) {
      const t = pl.terr[y * w + x]; if (t === T.HILLS || t === T.MOUNTAIN) sources.push([x, y]);
    }
    rng.shuffle(sources);
    let made = 0; const target = 6 + rng.int(4);
    for (const [sx, sy] of sources) {
      if (made >= target) break;
      const path = []; let x = sx, y = sy; const visited = new Set();
      let ok = false;
      for (let steps = 0; steps < 40; steps++) {
        visited.add(x + ',' + y);
        // voisin cardinal le plus bas, non visité
        let best = null, bestE = Infinity;
        for (const [dx, dy] of U.DIRS4) {
          const nx = World.wx(world, x + dx), ny = y + dy; if (ny < 1 || ny >= h - 1) continue;
          if (visited.has(nx + ',' + ny)) continue;
          const e = E[ny * w + nx] + rng.next() * 0.02;
          if (e < bestE) { bestE = e; best = [nx, ny]; }
        }
        // une rivière voisine (déjà tracée) attire le cours d'eau : on la rejoint au lieu de longer son lit
        if (steps > 0) for (const [dx, dy] of U.DIRS4) {
          const nx = World.wx(world, x + dx), ny = y + dy; if (ny < 1 || ny >= h - 1 || visited.has(nx + ',' + ny)) continue;
          if (pl.terr[ny * w + nx] === T.RIVER) { best = [nx, ny]; break; }
        }
        if (!best) break;
        [x, y] = best;
        const t = pl.terr[y * w + x];
        if (World.isWater(t)) { ok = true; break; }
        // rejoint une rivière existante : confluence, pas de boucle ni de lit parallèle
        if (t === T.RIVER) { ok = true; break; }
        if (t === T.MOUNTAIN) break;
        path.push([x, y]);
      }
      if (ok && path.length >= 3) {
        for (const [rx, ry] of path) { const t = pl.terr[ry * w + rx]; if (t !== T.MOUNTAIN) pl.terr[ry * w + rx] = T.RIVER; }
        const full = path.concat([[x, y]]);
        const bit = (dx, dy) => dy === -1 ? 1 : dx === 1 ? 2 : dy === 1 ? 4 : 8;
        for (let i = 0; i + 1 < full.length; i++) {
          const [ax, ay] = full[i], [bx, by] = full[i + 1];
          let dx = bx - ax; if (dx > 1) dx = -1; if (dx < -1) dx = 1;
          const dy = by - ay;
          pl.river[ay * w + ax] |= bit(dx, dy);
          if (!World.isWater(pl.terr[by * w + bx])) pl.river[by * w + bx] |= bit(-dx, -dy);
        }
        made++;
      }
    }
  },

  // Chaque continent doit rester d'un seul tenant pour les unités à pied : tant que des plaines d'un même continent
  // sont séparées par des montagnes, on ouvre le col le plus court (montagnes changées en collines).
  carvePasses(world, p) {
    const W = world.w, H = world.h, N = W * H, terr = world.planes[p].terr;
    const land = i => !World.isWater(terr[i]);
    const pass = i => land(i) && terr[i] !== T.MOUNTAIN;
    const nb = (i, f) => { const x = i % W, y = (i - x) / W; for (const [dx, dy] of U.DIRS8) { const ny = y + dy; if (ny < 0 || ny >= H) continue; f(ny * W + (x + dx + W) % W); } };
    const label = ok => {
      const lab = new Int32Array(N).fill(-1); let n = 0; const sizes = [];
      for (let s = 0; s < N; s++) {
        if (lab[s] >= 0 || !ok(s)) continue;
        const st = [s]; lab[s] = n; let c = 0;
        while (st.length) { const i = st.pop(); c++; nb(i, j => { if (lab[j] < 0 && ok(j)) { lab[j] = n; st.push(j); } }); }
        sizes.push(c); n++;
      }
      return { lab, sizes };
    };
    let carved = 0;
    for (let iter = 0; iter < 200; iter++) {
      const L = label(land), P = label(pass);
      // une plaine (la plus petite) séparée d'une autre plaine du même continent
      const byMass = new Map();
      for (let i = 0; i < N; i++) if (P.lab[i] >= 0) { const m = L.lab[i]; if (!byMass.has(m)) byMass.set(m, new Set()); byMass.get(m).add(P.lab[i]); }
      let src = -1;
      for (const set of byMass.values()) if (set.size > 1) { for (const c of set) if (src < 0 || P.sizes[c] < P.sizes[src]) src = c; break; }
      if (src < 0) break;
      // plus court chemin à travers les montagnes jusqu'à une autre plaine
      const prev = new Int32Array(N).fill(-2), q = [];
      for (let i = 0; i < N; i++) if (P.lab[i] === src) { prev[i] = -1; q.push(i); }
      let hit = -1;
      for (let h = 0; h < q.length && hit < 0; h++) {
        const i = q[h];
        nb(i, j => {
          if (hit >= 0 || prev[j] !== -2 || !land(j)) return;
          prev[j] = i;
          if (pass(j)) hit = j; else q.push(j);
        });
      }
      if (hit < 0) break;
      for (let i = prev[hit]; i >= 0 && P.lab[i] !== src; i = prev[i]) { terr[i] = T.HILLS; carved++; }
    }
    return carved;
  },

  landTiles(world, p, filter) {
    const out = [];
    for (let y = 1; y < world.h - 1; y++) for (let x = 0; x < world.w; x++) {
      const t = World.terr(world, p, x, y);
      if (World.isWater(t)) continue;
      if (!filter || filter(t, x, y)) out.push([x, y]);
    }
    return out;
  },

  farFromSites(game, p, x, y, d) {
    for (const s of game.sites) if (s.plane === p && World.dist(game.world, s.x, s.y, x, y) < d) return false;
    return true;
  },

  addSite(game, site) {
    site.id = game.sites.length;
    game.sites.push(site);
    World.set(game.world, site.plane, 'site', site.x, site.y, site.id);
    return site;
  },

  placeTowers(game, rng) {
    const world = game.world;
    let placed = 0, tries = 0;
    const want = Math.max(4, Math.round(6 * world.w * world.h / 2400));
    while (placed < want && tries < 3000) {
      tries++;
      const x = rng.int(world.w), y = 4 + rng.int(world.h - 8);
      if (World.isWaterAt(world, 0, x, y) || World.isWaterAt(world, 1, x, y)) continue;
      if (!MapGen.farFromSites(game, 0, x, y, 10)) continue;
      // gardiens : une première tour à la portée d'une armée de milieu de partie (l'IA aussi doit pouvoir passer), une deuxième plus rude,
      // les autres parmi les lieux les plus redoutables (600 à 1200)
      const budget = placed === 0 ? 170 + rng.int(90) : placed === 1 ? 320 + rng.int(150) : 0;
      for (const p of [0, 1]) {
        if (World.terr(world, p, x, y) === T.MOUNTAIN) World.setTerr(world, p, x, y, T.HILLS);
        MapGen.addSite(game, { type: 'tower', plane: p, x, y, cleared: false, guardians: null, budget, twin: true });
      }
      placed++;
    }
  },

  placeNodes(game, p, rng) {
    const world = game.world;
    const count = Math.max(5, Math.round((8 + rng.int(4)) * world.w * world.h / 2400));
    const kinds = [];
    for (let i = 0; i < count; i++) kinds.push(['sorcery', 'nature', 'chaos'][i % 3]);
    rng.shuffle(kinds);
    for (const realm of kinds) {
      const want = realm === 'sorcery' ? [T.GRASS, T.RIVER] : realm === 'nature' ? [T.FOREST, T.GRASS] : [T.MOUNTAIN, T.HILLS];
      const cands = MapGen.landTiles(world, p, (t, x, y) => want.includes(t) && MapGen.farFromSites(game, p, x, y, 5));
      if (!cands.length) continue;
      const [x, y] = rng.pick(cands);
      World.setTerr(world, p, x, y, realm === 'sorcery' ? T.SNODE : realm === 'nature' ? T.NNODE : T.CNODE);
      const power = p === 0 ? 5 + rng.int(6) : 10 + rng.int(11);
      MapGen.addSite(game, { type: 'node', realm, plane: p, x, y, power, owner: -1, cleared: false, guardians: null, budget: 0 });
    }
  },

  placeMinerals(game, p, rng) {
    const world = game.world, pl = world.planes[p];
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      const i = y * world.w + x, t = pl.terr[i];
      let m = 0;
      if (t === T.HILLS && rng.chance(0.18)) m = rng.weighted([M.iron, M.coal, M.silver, M.gold, M.mithril], k => ({ [M.iron]: 4, [M.coal]: 3, [M.silver]: 3, [M.gold]: 2, [M.mithril]: p ? 2 : 1 }[k]));
      else if (t === T.MOUNTAIN && rng.chance(0.25)) m = rng.weighted([M.iron, M.coal, M.silver, M.gold, M.gems, M.mithril, M.adamantium], k => ({ [M.iron]: 3, [M.coal]: 3, [M.silver]: 2, [M.gold]: 2, [M.gems]: 2, [M.mithril]: 2, [M.adamantium]: p ? 2 : 0 }[k]));
      else if (t === T.DESERT && rng.chance(0.12)) m = (p && rng.chance(0.5)) ? M.crysx : (rng.chance(0.5) ? M.quork : M.gems);
      else if (t === T.FOREST && rng.chance(0.08)) m = M.wildGame;
      else if (t === T.GRASS && rng.chance(0.02)) m = M.wildGame;
      else if (t === T.SWAMP && rng.chance(0.15)) m = M.nightshade;
      pl.mineral[i] = m;
    }
  },

  placeLairs(game, p, rng, opts) {
    const world = game.world;
    const count = Math.round((opts.lairs || 22) * (world.w * world.h) / 2400);
    const types = ['cave', 'ruins', 'temple', 'keep', 'dungeon', 'fallenTemple', 'lair'];
    for (let i = 0; i < count; i++) {
      const cands = MapGen.landTiles(world, p, (t, x, y) => t !== T.SNODE && t !== T.NNODE && t !== T.CNODE && !(t === T.MOUNTAIN && opts.mountainsBlock !== false) && MapGen.farFromSites(game, p, x, y, 3));
      if (!cands.length) break;
      const [x, y] = rng.pick(cands);
      const tier = rng.weighted([1, 2, 3, 4], k => ({ 1: 5, 2: 4, 3: 2, 4: p ? 1.5 : 0.6 }[k]));
      const budget = { 1: 60 + rng.int(80), 2: 180 + rng.int(220), 3: 450 + rng.int(450), 4: 1000 + rng.int(1200) }[tier] * (p ? 1.5 : 1);
      MapGen.addSite(game, { type: rng.pick(types), plane: p, x, y, cleared: false, guardians: null, budget: Math.round(budget), tier });
    }
  },
};
