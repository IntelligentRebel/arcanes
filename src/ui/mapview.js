'use strict';
// Rendu de la carte du monde : couche statique pré-rendue par plan + couche dynamique par image.

const MINERAL_COLORS = { iron: ['#7d7f86', '#b4b8c2'], coal: ['#26262a', '#55565c'], silver: ['#c9ced8', '#ffffff'], gold: ['#d9a937', '#ffe38a'], gems: ['#3fbf8f', '#e04f9a'], mithril: ['#52c6e0', '#d6fbff'], adamantium: ['#8b5be0', '#e1cfff'], quork: ['#e07ab8', '#ffd1ec'], crysx: ['#a46cf0', '#f0e0ff'], wildGame: ['#8a5a2b', '#c8915a'], nightshade: ['#6a3a8a', '#c38ae0'] };

const CACHE_COLORS = { gold: '#ffc61f', mana: '#46b0ff', materials: '#ff9a3c', grain: '#ffe066', lore: '#b980ff', map: '#ffe2a0', recruits: '#ff6b57' };
const MapView = {
  canvas: null, ctx: null, game: null, pid: 0,
  ts: 72, camX: 30, camY: 20, plane: 0,
  layers: [null, null], layerVersion: [-1, -1], worldVersion: 0,
  hover: null, sel: null, path: null, anim: null, flashes: [], floats: [], face: {},
  vis: null, visTurn: -1,

  init(canvas) {
    MapView.canvas = canvas; MapView.ctx = canvas.getContext('2d');
    MapView.resize();
  },
  resize() {
    const c = MapView.canvas, dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(innerWidth * dpr); c.height = Math.floor(innerHeight * dpr);
    c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px';
    MapView.dpr = dpr;
  },
  invalidate() { MapView.worldVersion++; },
  invalidateVis() { MapView.visTurn = -1; },

  // ---------- coordonnées ----------
  screenToTile(sx, sy) {
    const W = innerWidth, H = innerHeight, ts = MapView.ts;
    const tx = MapView.camX + (sx - W / 2) / ts, ty = MapView.camY + (sy - H / 2) / ts;
    const w = MapView.game.world;
    return { x: World.wx(w, Math.floor(tx)), y: Math.floor(ty) };
  },
  tileToScreen(x, y) {
    const W = innerWidth, H = innerHeight, ts = MapView.ts, w = MapView.game.world;
    let dx = x - MapView.camX; if (dx > w.w / 2) dx -= w.w; if (dx < -w.w / 2) dx += w.w;
    return { x: W / 2 + dx * ts, y: H / 2 + (y - MapView.camY) * ts };
  },
  // le point (sx, sy) de l'écran est-il sur la figurine des unités garées dans la cité de la case (x, y) ?
  // (même géométrie que drawUnit : figurine réduite, décalée vers la gauche de la case)
  unitHitInCity(x, y, sx, sy) {
    const P = MapView.tileToScreen(x, y), ts = MapView.ts;
    const cx = P.x + ts * .2, base = P.y + ts * .62, sz = ts * .8;
    return sx >= cx - ts * .23 && sx <= cx + ts * .23 && sy >= base - sz * .95 && sy <= base + ts * .14;
  },
  drawRoads(ctx, world, p, ex, x0, x1, y0, y1, pos, ts) {
    const R = world.planes[p].road, segs = [[], []], dots = [[], []];
    for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
      const x = World.wx(world, xx), i = y * world.w + x;
      if (!ex[i] || !R[i]) continue;
      const k = R[i] === 2 ? 1 : 0, P = pos(xx, y), cx = P.x + ts / 2, cy = P.y + ts / 2;
      let any = false;
      for (const [dx, dy] of U.DIRS8) {
        const ny = y + dy; if (!World.inY(world, ny) || !R[World.idx(world, x + dx, ny)]) continue;
        // une diagonale doublée par deux côtés droits ferait un pâté : on la laisse aux côtés
        if (dx && dy && R[World.idx(world, x + dx, y)] && R[World.idx(world, x, ny)]) continue;
        any = true; segs[k].push([cx, cy, cx + dx * ts / 2, cy + dy * ts / 2]);
      }
      if (!any) dots[k].push([cx, cy]);
    }
    if (!segs[0].length && !segs[1].length && !dots[0].length && !dots[1].length) return;
    const w = Math.max(3, ts * .19);
    const trace = k => { ctx.beginPath(); for (const s of segs[k]) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); } for (const d of dots[k]) { ctx.moveTo(d[0] - .01, d[1]); ctx.lineTo(d[0] + .01, d[1]); } };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const k of [0, 1]) {
      if (!segs[k].length && !dots[k].length) continue;
      trace(k); ctx.strokeStyle = k ? 'rgba(80,58,14,.6)' : 'rgba(34,24,12,.62)'; ctx.lineWidth = w + Math.max(2.5, ts * .06); ctx.stroke();
      trace(k); ctx.strokeStyle = MapView.roadPaint(ctx, k, pos, ts); ctx.lineWidth = w; ctx.stroke();
      if (k) { trace(k); ctx.strokeStyle = 'rgba(255,226,140,.18)'; ctx.lineWidth = w * .45; ctx.stroke(); }
    }
    ctx.restore();
  },
  // revêtement des routes : la texture peinte (tex:road, tex:road2) si elle existe, sinon des pavés dessinés ; ancré au monde
  roadPaint(ctx, k, pos, ts) {
    const cache = MapView._roadPats || (MapView._roadPats = {});
    const tex = Tex.get(k ? 'road2' : 'road');
    const key = k + (tex ? 't' : 'p');
    if (!cache[key] || cache[key].ctx !== ctx) {
      let src = tex;
      if (!src) {
        // pavés irréguliers, raccordés sur les bords
        src = document.createElement('canvas'); src.width = src.height = 64;
        const g = src.getContext('2d');
        g.fillStyle = k ? '#b89a5c' : '#7a5c3a'; g.fillRect(0, 0, 64, 64);
        let seed = k ? 7 : 3; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
        const shades = k ? ['#e6d4a0', '#d8c088', '#f0e2b8', '#cdb27a'] : ['#9a8a74', '#8a7a64', '#a89880', '#7e6e5a'];
        for (let i = 0; i < 22; i++) {
          const x = rnd() * 64, y = rnd() * 64, rx = 4 + rnd() * 3.5, ry = 3.2 + rnd() * 3, a = rnd() * Math.PI, col = shades[i % shades.length];
          for (const ox of [-64, 0, 64]) for (const oy of [-64, 0, 64]) {
            g.fillStyle = 'rgba(30,20,10,.45)'; g.beginPath(); g.ellipse(x + ox + .6, y + oy + .8, rx, ry, a, 0, 7); g.fill();
            g.fillStyle = col; g.beginPath(); g.ellipse(x + ox, y + oy, rx - .6, ry - .6, a, 0, 7); g.fill();
            g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.ellipse(x + ox - rx * .25, y + oy - ry * .3, rx * .45, ry * .35, a, 0, 7); g.fill();
          }
        }
        if (k) { g.strokeStyle = 'rgba(120,230,220,.35)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { const x = rnd() * 64, y = rnd() * 64; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y - 3); g.lineTo(x + 8, y); g.stroke(); } }
      }
      cache[key] = { ctx, pat: ctx.createPattern(src, 'repeat'), size: src.width };
    }
    const c = cache[key], o = pos(0, 0), s = (tex ? ts * 1.25 : ts * .9) / c.size;
    if (c.pat.setTransform) c.pat.setTransform(new DOMMatrix([s, 0, 0, s, o.x, o.y]));
    return c.pat;
  },
  // repère pulsant sur une case (lieu d'une rencontre, cité à retrouver)
  // étiquette d'un territoire étranger sur le trajet : à qui il est, et si l'on peut y passer
  borderTag(ctx, pos, ts, x, y, o, below, closed) {
    const game = MapView.game, me = MapView.pid, st = game.players[me].diplo[o.id] || 'none', known = Players.knows(game, me, o.id);
    const label = U.cap(Players.nameFor(game, me, o.id)) + (closed ? ' vous interdit son territoire'
      : ' : ' + ({ war: 'guerre', peace: 'paix, passage libre', alliance: 'alliance, passage libre' }[st] || 'sans traité'));
    const P = pos(x + MapView.wrapNear(x), y), fs = Math.max(11, ts * .2), cx = P.x + ts / 2;
    ctx.font = '600 ' + fs + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const tw = ctx.measureText(label).width + 14, h = fs * 1.4, ty = below ? P.y + ts + 2 : P.y - h - 2;
    ctx.fillStyle = 'rgba(10,10,14,.88)'; ctx.fillRect(cx - tw / 2, ty, tw, h);
    ctx.fillStyle = known ? o.color : '#9a958a'; ctx.fillRect(cx - tw / 2, ty, 4, h);   // liseré à la couleur du sorcier
    ctx.fillStyle = closed || st === 'war' ? '#ff8a7a' : '#ece8de'; ctx.fillText(label, cx + 2, ty + fs * 1.05);
  },
  // repaires, ruines, donjons, tours, nœuds sauvages repérés sur la carte mais où vos troupes ne sont jamais entrées
  // nœuds sans gardien que le joueur peut encore lier : libres (vus vides, ou vidés), ou tenus par un rival avec qui il n'est pas en paix
  // les nœuds à prendre : libres (sans gardiens connus), encore gardés (ou jamais visités : on ne sait pas ce qui s'y tient),
  // et ceux de rivaux qui ne sont ni en paix ni alliés avec vous
  freeNodes(game, pl, p) {
    const ex = pl.explored[p], w = game.world.w;
    return game.sites.filter(s => {
      if (s.type !== 'node' || s.plane !== p || s.owner === pl.id || !ex || !ex[s.y * w + s.x]) return false;
      if (s.owner >= 0) return !['peace', 'alliance'].includes(pl.diplo[s.owner]);
      return true;
    });
  },
  // sa catégorie : 'rival', 'free' (vous le savez vidé), 'guarded' (gardiens vus, ou jamais visité)
  nodeKind(pl, s) { if (s.owner >= 0) return 'rival'; const k = Game.siteKnown(pl, s); return k && (k.cleared || !k.guards.length) ? 'free' : 'guarded'; },
  NODE_RGB: { rival: '255,120,105', free: '110,235,170', guarded: '255,206,90' },
  NODE_HEX: { rival: '#ff7869', free: '#6eebaa', guarded: '#ffce5a' },
  openLairs(game, pl, p) {
    const ex = pl.explored[p], w = game.world.w;
    return game.sites.filter(s => s.plane === p && Game.isLair(s) && !Game.siteKnown(pl, s) && ex && ex[s.y * w + s.x]);
  },
  // les lieux où vos troupes sont entrées (gardiens vus, ou trésor laissé sur place) sans les avoir conquis
  scoutedLairs(game, pl, p) {
    return game.sites.filter(s => s.plane === p && Game.isLair(s) && (k => k && !k.cleared)(Game.siteKnown(pl, s)));
  },
  ping(x, y, plane) { MapView.pings = (MapView.pings || []).filter(p => performance.now() - p.t0 < 4000); MapView.pings.push({ x, y, plane, t0: performance.now() }); },
  centerOn(x, y, plane) {
    if (plane != null && plane !== MapView.plane) MapView.plane = plane;
    MapView.camX = x + 0.5; MapView.camY = y + 0.5; MapView.clampCam();
  },
  clampCam() {
    const w = MapView.game.world, H = innerHeight, ts = MapView.ts;
    MapView.camX = ((MapView.camX % w.w) + w.w) % w.w;
    const half = H / 2 / ts;
    MapView.camY = U.clamp(MapView.camY, Math.min(half - 1, w.h / 2), Math.max(w.h - half + 1, w.h / 2));
  },

  // ---------- couche statique ----------
  // Une case = LT pixels dans la couche pré-rendue (textures HD échantillonnées en coordonnées monde).
  LT: 64, layerSig: [null, null],
  TEX_PRIO: { ocean: 0, shallows: 1, swamp: 2, desert: 3, grass: 4, tundra: 5, forest: 6, rock: 7, volcanic: 8 },
  texOf(world, p, x, y) {
    const t = World.terr(world, p, x, y);
    if (t === T.OCEAN) return World.isShore(world, p, x, y) ? 'shallows' : 'ocean';
    if (t === T.LAKE) return 'shallows';
    return { [T.FOREST]: 'forest', [T.NNODE]: 'forest', [T.MOUNTAIN]: 'rock', [T.DESERT]: 'desert', [T.SWAMP]: 'swamp', [T.TUNDRA]: 'tundra', [T.CNODE]: 'volcanic', [T.VOLCANO]: 'volcanic' }[t] || 'grass';
  },
  sig(world, p) {
    const pl = world.planes[p]; let h = 0;
    for (let i = 0; i < pl.terr.length; i++) h = (h * 31 + pl.terr[i] * 7 + (pl.mineral[i] || 0) + 1) | 0;
    return h;
  },
  ensureLayer(p) {
    const world = MapView.game.world;
    if (!MapView.layers[p]) MapView.buildLayer(p);
    else if (MapView.layerVersion[p] !== MapView.worldVersion) { if (MapView.sig(world, p) !== MapView.layerSig[p]) MapView.buildLayer(p); else MapView.layerVersion[p] = MapView.worldVersion; }
    return MapView.layers[p];
  },
  buildLayer(p) {
    const world = MapView.game.world;
    MapView.layers[p] = MapView.renderLayer(world, p);
    MapView.layerVersion[p] = MapView.worldVersion; MapView.layerSig[p] = MapView.sig(world, p);
  },
  // Sols : frontières organiques (coordonnées déformées par un bruit), dégradé de profondeur, plages, écume.
  LAND_TEX: ['grass', 'forest', 'desert', 'swamp', 'tundra', 'rock', 'volcanic', 'forestedge'],
  landClass(t) {
    return { [T.FOREST]: 1, [T.NNODE]: 1, [T.DESERT]: 2, [T.SWAMP]: 3, [T.TUNDRA]: 4, [T.MOUNTAIN]: 5, [T.CNODE]: 6, [T.VOLCANO]: 6 }[t] || 0;
  },
  terrainFields(world, p, R) {
    const W = world.w, H = world.h, N = W * H, pl = world.planes[p];
    const water = new Uint8Array(N), lake = new Uint8Array(N), cls = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const t = pl.terr[i]; water[i] = t === T.OCEAN || t === T.LAKE ? 1 : 0; lake[i] = t === T.LAKE ? 1 : 0; cls[i] = water[i] ? 255 : MapView.landClass(t); }
    // distance (en cases) à la côte, de part et d'autre : Dijkstra 8 voisins, monde cylindrique
    const dist = new Float32Array(N).fill(1e9), heap = new Heap();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (const [dx, dy] of U.DIRS8) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const j = ny * W + ((x + dx + W) % W); if (water[j] !== water[i]) { const d = dx && dy ? 1.414 : 1; if (d < dist[i]) dist[i] = d; } }
      if (dist[i] < 1e9) heap.push(dist[i], i);
    }
    while (heap.size) {
      const [d, i] = heap.pop(); if (d > dist[i]) continue;
      const x = i % W, y = (i - x) / W;
      for (const [dx, dy] of U.DIRS8) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const j = ny * W + ((x + dx + W) % W); if (water[j] !== water[i]) continue; const nd = d + (dx && dy ? 1.414 : 1); if (nd < dist[j]) { dist[j] = nd; heap.push(nd, j); } }
    }
    const sd = new Float32Array(N);
    for (let i = 0; i < N; i++) { const d = Math.min(dist[i], 8); sd[i] = water[i] ? d - 0.5 : -(d - 0.5); }
    // bruit de valeur périodique en x
    const hash = (ix, iy, sd0) => { let h = (ix * 374761393 + iy * 668265263 + sd0 * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h & 0xffff) / 32767.5 - 1; };
    const vn = (x, y, seed, per) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const x0 = ((ix % per) + per) % per, x1 = (x0 + 1) % per;
      const a = hash(x0, iy, seed), b = hash(x1, iy, seed), c = hash(x0, iy + 1, seed), d = hash(x1, iy + 1, seed);
      return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
    };
    // champs de déformation précalculés sur une grille grossière (G points par case)
    const G = 8, GW = W * G, GH = H * G + 1, seed = 11 + p * 101;
    const GN = GW * GH;
    const wu = new Float32Array(GN), wv = new Float32Array(GN), wn = new Float32Array(GN);
    // entre deux sols : déformation plus ample (lisières sinueuses) et bruit de taches (bosquets, clairières)
    const lu = new Float32Array(GN), lv = new Float32Array(GN), lc = new Float32Array(GN);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const u = gx / G + .37, v = gy / G + .61, k = gy * GW + gx;
      wu[k] = .30 * vn(u, v, seed, W) + .13 * vn(u * 3, v * 3, seed + 1, W * 3);
      wv[k] = .30 * vn(u, v, seed + 2, W) + .13 * vn(u * 3, v * 3, seed + 3, W * 3);
      wn[k] = .6 * vn(u * 2, v * 2, seed + 4, W * 2) + .4 * vn(u * 6, v * 6, seed + 5, W * 6);
      lu[k] = .55 * vn(u * .7, v * .7, seed + 6, Math.round(W * .7)) + .25 * vn(u * 2.2, v * 2.2, seed + 7, Math.round(W * 2.2)) + .1 * vn(u * 5, v * 5, seed + 8, W * 5);
      lv[k] = .55 * vn(u * .7, v * .7, seed + 9, Math.round(W * .7)) + .25 * vn(u * 2.2, v * 2.2, seed + 10, Math.round(W * 2.2)) + .1 * vn(u * 5, v * 5, seed + 11, W * 5);
      lc[k] = .65 * vn(u * 3, v * 3, seed + 12, W * 3) + .35 * vn(u * 7, v * 7, seed + 13, W * 7);
    }
    const MW = W * R, MH = H * R, M = MW * MH;
    const top = new Uint8Array(M), ocean = new Uint8Array(M), beach = new Uint8Array(M), foam = new Uint8Array(M);
    // boîtes englobantes par couche (x0, y0, x1, y1) : on ne compose que là où la couche existe
    const NB = MapView.LAND_TEX.length + 4, bb = new Int32Array(NB * 4);
    for (let q = 0; q < NB; q++) { bb[q * 4] = 1e9; bb[q * 4 + 1] = 1e9; bb[q * 4 + 2] = -1; bb[q * 4 + 3] = -1; }
    const grow = (q, x, y) => { const o = q * 4; if (x < bb[o]) bb[o] = x; if (y < bb[o + 1]) bb[o + 1] = y; if (x > bb[o + 2]) bb[o + 2] = x; if (y > bb[o + 3]) bb[o + 3] = y; };
    const QW = MapView.LAND_TEX.length, QO = QW + 1, QB = QW + 2, QF = QW + 3;
    const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const cw = new Float32Array(MapView.LAND_TEX.length);
    // lisière : bande de sol intermédiaire entre prairie et forêt, surtout côté prairie (si la texture existe)
    const EDGE = Tex.get('forestedge') ? 7 : -1;
    for (let py = 0; py < MH; py++) {
      const v = (py + .5) / R;
      const gy = Math.min(GH - 2, Math.floor(v * G)), ty0 = v * G - gy;
      for (let px = 0; px < MW; px++) {
        const u = (px + .5) / R;
        const gx = Math.floor(u * G) % GW, gx1 = (gx + 1) % GW, tx0 = u * G - Math.floor(u * G);
        const k00 = gy * GW + gx, k10 = gy * GW + gx1, k01 = k00 + GW, k11 = k10 + GW;
        const bil = f => (f[k00] * (1 - tx0) + f[k10] * tx0) * (1 - ty0) + (f[k01] * (1 - tx0) + f[k11] * tx0) * ty0;
        const n = bil(wn);
        const su = u + bil(wu), sv = v + bil(wv);
        // interpolation bilinéaire entre les centres des cases
        const fx = su - .5, fy = Math.min(H - 1.001, Math.max(0, sv - .5));
        const i0f = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0f, ty = fy - j0, j1 = Math.min(H - 1, j0 + 1);
        const i0 = ((i0f % W) + W) % W, i1 = (i0 + 1) % W;
        const a = j0 * W + i0, b = j0 * W + i1, c = j1 * W + i0, d = j1 * W + i1;
        const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
        const sdv = sd[a] * w00 + sd[b] * w10 + sd[c] * w01 + sd[d] * w11 + n * .1;
        const m = py * MW + px;
        if (sdv > 0) {
          top[m] = 255;
          const lw = lake[a] * w00 + lake[b] * w10 + lake[c] * w01 + lake[d] * w11;
          const o = lw > .5 ? 0 : (sdv + n * .25 - .55) / .8;
          ocean[m] = o <= 0 ? 0 : o >= 1 ? 255 : Math.round(255 * o * o * (3 - 2 * o));
          if (sdv < .075) foam[m] = Math.round(215 * (1 - sdv / .075));
          else if (Math.abs(sdv - .2 - n * .04) < .022 && n > -.15) foam[m] = 75;
          grow(QW, px, py); if (ocean[m]) grow(QO, px, py); if (foam[m]) grow(QF, px, py);
        } else {
          // le sol est choisi en coordonnées fortement déformées
          const lx = u + bil(lu) - .5, ly = Math.min(H - 1.001, Math.max(0, v + bil(lv) - .5));
          const l0f = Math.floor(lx), lj0 = Math.floor(ly), ltx = lx - l0f, lty = ly - lj0, lj1 = Math.min(H - 1, lj0 + 1);
          const li0 = ((l0f % W) + W) % W, li1 = (li0 + 1) % W;
          const la = lj0 * W + li0, lb = lj0 * W + li1, lcc = lj1 * W + li0, ld = lj1 * W + li1;
          const q00 = (1 - ltx) * (1 - lty), q10 = ltx * (1 - lty), q01 = (1 - ltx) * lty, q11 = ltx * lty;
          cw.fill(0);
          if (cls[la] !== 255) cw[cls[la]] += q00; if (cls[lb] !== 255) cw[cls[lb]] += q10; if (cls[lcc] !== 255) cw[cls[lcc]] += q01; if (cls[ld] !== 255) cw[cls[ld]] += q11;
          let c1 = -1, v1 = 0, c2 = -1, v2 = 0;
          for (let q = 0; q < cw.length; q++) { const val = cw[q]; if (val > v1) { c2 = c1; v2 = v1; c1 = q; v1 = val; } else if (val > v2) { c2 = q; v2 = val; } }
          if (c1 < 0) { c1 = cls[a] !== 255 ? cls[a] : cls[b] !== 255 ? cls[b] : cls[c] !== 255 ? cls[c] : cls[d] !== 255 ? cls[d] : 0; }
          // lisière irrégulière : près de la frontière, des taches de l'autre sol (bosquets, clairières)
          const clump = bil(lc);
          if (c2 >= 0) { const diff = (v1 - v2) / Math.max(.001, v1 + v2); if (diff + .42 * clump < 0) c1 = c2; }
          if (EDGE > 0 && (c1 === 0 || c1 === 1) && cw[0] > 0 && cw[1] > 0) { const fr = cw[1] / (cw[0] + cw[1]) + .2 * clump; if (fr > .14 && fr < .62) c1 = EDGE; }
          top[m] = c1; grow(c1, px, py);
          if (sdv > -.14) { const bf = 1 - (-sdv) / .14; beach[m] = Math.round((c1 === 4 || c1 === 3 ? 120 : c1 === 5 || c1 === 6 ? 90 : 225) * bf); grow(QB, px, py); }
        }
      }
    }
    const box = q => bb[q * 4 + 2] < 0 ? null : [bb[q * 4], bb[q * 4 + 1], bb[q * 4 + 2] + 1, bb[q * 4 + 3] + 1];
    return { MW, MH, top, ocean, beach, foam, box, QW, QO, QB, QF };
  },
  renderLayer(world, p) {
    const L = MapView.LT, W = world.w, H = world.h;
    const c = document.createElement('canvas'); c.width = W * L; c.height = H * L;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    if (!Tex.get('grass')) { // pas d'atlas HD : ancien rendu agrandi
      const old = document.createElement('canvas'); old.width = W * 32; old.height = H * 32;
      const octx = old.getContext('2d'); octx.imageSmoothingEnabled = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) MapView.drawTileLegacy(octx, world, p, x, y);
      ctx.drawImage(old, 0, 0, c.width, c.height);
      return c;
    }
    const R = Math.max(16, Math.round(L / 2));
    const F = MapView.terrainFields(world, p, R);
    const K = L / R, MW = F.MW;
    const mc = document.createElement('canvas'), mctx = mc.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = c.height;
    const tctx = tmp.getContext('2d');
    // une couche de texture découpée par un masque (alpha par pixel de masque), limitée à sa boîte englobante
    const layer = (texName, q, kind, smooth) => {
      const tex = Tex.get(texName, p), b = F.box(q); if (!tex || !b) return;
      const bw = b[2] - b[0], bh = b[3] - b[1];
      mc.width = bw; mc.height = bh;
      const id = mctx.createImageData(bw, bh), px = id.data;
      for (let y = 0; y < bh; y++) {
        let m = (y + b[1]) * MW + b[0], o = y * bw * 4 + 3;
        if (kind === 'top') for (let x = 0; x < bw; x++, m++, o += 4) px[o] = F.top[m] === q ? 255 : 0;
        else if (kind === 'water') for (let x = 0; x < bw; x++, m++, o += 4) px[o] = F.top[m] === 255 ? 255 : 0;
        else { const A = F[kind]; for (let x = 0; x < bw; x++, m++, o += 4) px[o] = A[m]; }
      }
      mctx.putImageData(id, 0, 0);
      const X = b[0] * K, Y = b[1] * K, Wd = bw * K, Hd = bh * K;
      tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(X, Y, Wd, Hd);
      tctx.fillStyle = tctx.createPattern(tex, 'repeat'); tctx.fillRect(X, Y, Wd, Hd);
      tctx.globalCompositeOperation = 'destination-in'; tctx.imageSmoothingEnabled = !!smooth; tctx.drawImage(mc, X, Y, Wd, Hd);
      ctx.drawImage(tmp, X, Y, Wd, Hd, X, Y, Wd, Hd);
    };
    MapView.LAND_TEX.forEach((name, ci) => layer(name, ci, 'top', false));
    layer('desert', F.QB, 'beach', true);
    // rivières sous l'eau : l'embouchure s'arrête exactement au rivage
    MapView.drawRivers(ctx, world, p, L);
    layer('shallows', F.QW, 'water', false);
    layer('ocean', F.QO, 'ocean', true);
    // écume : pixels clairs posés directement
    const fb = F.box(F.QF);
    if (fb) {
      const bw = fb[2] - fb[0], bh = fb[3] - fb[1]; mc.width = bw; mc.height = bh;
      const FOAM = p === 1 && Sprites.hasMirror() ? [196, 236, 255] : [232, 248, 255];
      const id = mctx.createImageData(bw, bh), px = id.data;
      for (let y = 0; y < bh; y++) { let m = (y + fb[1]) * MW + fb[0], o = y * bw * 4; for (let x = 0; x < bw; x++, m++, o += 4) { px[o] = FOAM[0]; px[o + 1] = FOAM[1]; px[o + 2] = FOAM[2]; px[o + 3] = F.foam[m]; } }
      mctx.putImageData(id, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(mc, fb[0] * K, fb[1] * K, bw * K, bh * K);
    }
    // le plan du Miroir : voile violet, sauf quand il a ses propres sols
    if (p === 1) { if (!Sprites.hasMirror()) { ctx.fillStyle = 'rgba(46,12,78,.22)'; ctx.fillRect(0, 0, c.width, c.height); } }
    // reliefs, végétation, nœuds, ressources : rangée par rangée (le sud recouvre le nord)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      MapView.drawOverlay(ctx, world, p, x, y, x * L, y * L);
      if (x === 0) MapView.drawOverlay(ctx, world, p, x, y, W * L, y * L);
      if (x === W - 1) MapView.drawOverlay(ctx, world, p, x, y, -L, y * L);
    }
    return c;
  },
  // rivières : courbes continues passant par le milieu des bords de case (léger décalage stable par bord)
  drawRivers(ctx, world, p, L) {
    const W = world.w, H = world.h, pl = world.planes[p];
    const jit = (a, b, c) => ((Tiles.hash(a, b, c) % 1000) / 1000 - .5);
    const edgePt = (x, y, dir) => { // dir 1 N, 2 E, 4 S, 8 W
      if (dir === 2) { const ex = (x + 1) % W; return [(x + 1) * L, (y + .5 + jit(ex, y, 31) * .32) * L]; }
      if (dir === 8) return [x * L, (y + .5 + jit(x, y, 31) * .32) * L];
      if (dir === 4) return [(x + .5 + jit(x, y + 1, 37) * .32) * L, (y + 1) * L];
      return [(x + .5 + jit(x, y, 37) * .32) * L, y * L];
    };
    const path = new Path2D(), path2 = new Path2D();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (pl.terr[i] !== T.RIVER) continue;
      let mask = pl.river ? pl.river[i] : 0;
      if (!mask) for (const [dx, dy, bit] of [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]]) { const ny = y + dy; if (ny < 0 || ny >= H) continue; const t2 = pl.terr[ny * W + (x + dx + W) % W]; if (t2 === T.RIVER || t2 === T.OCEAN || t2 === T.LAKE) mask |= bit; }
      const dirs = [1, 2, 4, 8].filter(b => mask & b);
      if (!dirs.length) continue;
      const cx = (x + .5 + jit(x, y, 41) * .3) * L, cy = (y + .5 + jit(x, y, 43) * .3) * L;
      const DV = { 1: [0, -1], 2: [1, 0], 4: [0, 1], 8: [-1, 0] };
      const isWaterDir = d => { const [dx, dy] = DV[d], ny = y + dy; if (ny < 0 || ny >= H) return false; const t2 = pl.terr[ny * W + (x + dx + W) % W]; return t2 === T.OCEAN || t2 === T.LAKE; };
      for (const P of x === 0 ? [path, path2] : x === W - 1 ? [path, path2] : [path]) {
        const off = P === path2 ? (x === 0 ? W * L : -W * L) : 0;
        if (dirs.length === 2) { const [a, b] = dirs.map(d => edgePt(x, y, d)); P.moveTo(a[0] + off, a[1]); P.quadraticCurveTo(cx + off, cy, b[0] + off, b[1]); }
        else for (const d of dirs) { const a = edgePt(x, y, d); P.moveTo(a[0] + off, a[1]); P.quadraticCurveTo((a[0] + cx) / 2 + off, (a[1] + cy) / 2, cx + off, cy); }
        // vers la mer ou un lac : le lit se prolonge sous l'eau, le rivage le recouvre
        for (const d of dirs) if (isWaterDir(d)) { const a = edgePt(x, y, d), [dx, dy] = DV[d]; P.moveTo(a[0] + off, a[1]); P.lineTo(a[0] + dx * L * .6 + off, a[1] + dy * L * .6); }
      }
    }
    const sh = Tex.get('shallows', p);
    const pat = sh ? ctx.createPattern(sh, 'repeat') : '#2f86c4';
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // le Miroir : rivières lumineuses (lit d'encre, eau sarcelle, reflet cyan)
    const RS = p === 1 && Sprites.hasMirror() ? [[.30, 'rgba(34,24,62,.5)'], [.22, 'rgba(16,30,64,.95)'], [.16, pat], [.16, 'rgba(60,220,230,.16)'], [.035, 'rgba(170,255,250,.7)']]
      : [[.30, 'rgba(70,58,34,.45)'], [.22, 'rgba(28,62,58,.95)'], [.16, pat], [.16, 'rgba(18,64,112,.28)'], [.035, 'rgba(215,242,255,.55)']];
    for (const [w, col] of RS) {
      ctx.strokeStyle = col; ctx.lineWidth = w * L; ctx.stroke(path); ctx.stroke(path2);
    }
    ctx.restore();
  },
  // éléments posés sur une case (coordonnées de la couche, case de LT pixels)
  drawOverlay(ctx, world, p, x, y, X, Y) {
    const L = MapView.LT, t = World.terr(world, p, x, y);
    const h = Tiles.hash(x, y, p + 1), r = k => ((h >>> (k * 3)) % 1000) / 1000;
    const foot = (key, fx, fy, size) => Sprites.drawFoot(ctx, Sprites.planeKey(key, p), X + fx * L, Y + fy * L, size * L);
    const items = [];
    if (t === T.FOREST) {
      const spots = [[.22, .42], [.72, .38], [.48, .66], [.16, .9], [.8, .86], [.5, .98]];
      const n = 4 + (h % 2);
      for (let i = 0; i < n; i++) { const sp = spots[(i + (h >>> 5)) % spots.length]; items.push(['tree:' + ((h >>> (i * 4)) % 8), sp[0] + (r(i) - .5) * .12, sp[1] + (r(i + 3) - .5) * .08, .52 + r(i + 5) * .14]); }
    } else if (t === T.NNODE) items.push(['node:nature', .5, 1.02, 1.3]);
    else if (t === T.SNODE) items.push(['node:sorcery', .5, 1.02, 1.3]);
    else if (t === T.CNODE) items.push(['node:chaos', .5, 1.02, 1.3]);
    else if (t === T.HILLS) items.push(['hill:' + (h % 6), .5, 1.0, 1.1]);
    else if (t === T.MOUNTAIN) {
      const snowy = World.terr(world, p, x, y - 1) === T.TUNDRA || World.terr(world, p, x, y + 1) === T.TUNDRA || y < 5 || y > world.h - 6 || r(2) < .25;
      items.push(['mountain:' + (snowy ? 4 + (h % 2) : h % 4), .5, 1.02, 1.32]);
    } else if (t === T.VOLCANO) items.push(['volcano:' + (h % 2), .5, 1.02, 1.32]);
    else if (t === T.SWAMP) { if (r(1) < .55) items.push(['detail:reeds' + (h % 2), .25 + r(2) * .5, .55 + r(3) * .4, .55]); if (r(4) < .2) items.push(['detail:deadtree', .3 + r(5) * .4, .9, .62]); }
    else if (t === T.DESERT) { if (r(1) < .3) items.push(['detail:dune', .3 + r(2) * .4, .6 + r(3) * .35, .6]); else if (r(1) < .45) items.push(['detail:desertrocks', .3 + r(2) * .4, .6 + r(3) * .35, .55]); }
    else if (t === T.TUNDRA) { if (r(1) < .3) items.push(['detail:snowpines', .3 + r(2) * .4, .65 + r(3) * .3, .62]); else if (r(1) < .42) items.push(['detail:icerocks', .3 + r(2) * .4, .65 + r(3) * .3, .5]); }
    else if (t === T.GRASS || t === T.RIVER) {
      if (r(1) < .06) items.push(['detail:bush', .25 + r(2) * .5, .55 + r(3) * .4, .42]);
      else if (r(1) < .1) items.push(['tree:' + (h % 4), .25 + r(2) * .5, .6 + r(3) * .35, .55]);
      else if (r(1) < .12) items.push(['outcrop:' + (h % 2), .3 + r(2) * .4, .65 + r(3) * .3, .5]);
    }
    // lisière : des arbres, des jeunes pousses et du sous-bois débordent de la forêt voisine sur la case
    const isF = (dx, dy) => { const ny = y + dy; if (ny < 0 || ny >= world.h) return false; const t2 = World.terr(world, p, x + dx, ny); return t2 === T.FOREST || t2 === T.NNODE; };
    const UNDER = Sprites.hasHD('edge:0');
    // [clé, taille] : petites plantes, puis jeunes arbres
    const SMALL = [['edge:0', .17], ['edge:1', .2], ['edge:2', .22], ['edge:3', .22], ['edge:6', .16], ['edge:7', .2], ['edge:8', .2], ['edge:9', .16], ['edge:10', .26]];
    const TALL = [['edge:4', .32], ['edge:5', .32], ['edge:11', .36]];
    let k = 7;
    const rr = () => r(k++ % 10) * .7 + ((h >>> (k % 17)) & 7) / 7 * .3;
    if (t === T.GRASS || t === T.RIVER || t === T.HILLS || t === T.SWAMP) {
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        if (!isF(dx, dy)) continue;
        const nTree = UNDER ? 1 + (rr() < .45 ? 1 : 0) : 2;
        for (let i = 0; i < nTree; i++) {
          const along = .18 + rr() * .64, o = .03 + rr() * .24, sz = .44 + rr() * .16;
          const fx = dx ? (dx > 0 ? 1 - o : o) : along;
          const fy = dy ? (dy > 0 ? 1.03 - o * .4 : .24 + o) : along * .75 + .3;
          const sap = UNDER && i > 0;
          const tl = TALL[(h >>> (i * 3 + dx + 2 * dy + 6)) % 3];
          items.push(sap ? [tl[0], fx, fy, tl[1] + rr() * .06] : ['tree:' + ((h >>> (i * 5 + dx + 3 * dy + 4)) % 8), fx, fy, sz]);
        }
        if (UNDER) {
          // sous-bois : une frange de petites plantes le long du côté boisé, plus dense contre la forêt
          const n = 2 + Math.floor(rr() * 3);
          for (let i = 0; i < n; i++) {
            const along = .08 + rr() * .84, o = .02 + rr() * rr() * .5;
            const fx = dx ? (dx > 0 ? 1 - o : o) : along;
            const fy = dy ? (dy > 0 ? 1.0 - o * .5 : .2 + o * .8) : .32 + along * .66;
            const s = SMALL[(h >>> (i * 4 + dx * 3 + dy * 5 + 10)) % SMALL.length];
            items.push([s[0], fx, fy, s[1] * (.85 + rr() * .3)]);
          }
        }
      }
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (!isF(dx, dy) || isF(dx, 0) || isF(0, dy)) continue;
        items.push(['tree:' + ((h >>> (dx + 2 * dy + 9)) % 8), dx > 0 ? .86 : .14, dy > 0 ? 1.0 : .3, .42 + rr() * .12]);
        if (UNDER) { const s = SMALL[(h >>> (dx + 2 * dy + 12)) % SMALL.length]; items.push([s[0], dx > 0 ? .72 : .28, dy > 0 ? .98 : .36, s[1]]); }
      }
      // rares buissons isolés dans la prairie
      if (UNDER && t === T.GRASS && r(6) < .1) { const s = SMALL[h % SMALL.length]; items.push([s[0], .2 + r(7) * .6, .5 + r(8) * .45, s[1]]); }
    } else if (t === T.FOREST && UNDER) {
      // en forêt, côté découvert : du sous-bois au pied des arbres de bordure
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        if (isF(dx, dy)) continue;
        const ny = y + dy; if (ny < 0 || ny >= world.h) continue;
        const n = 1 + Math.floor(rr() * 2);
        for (let i = 0; i < n; i++) {
          const along = .15 + rr() * .7, o = .04 + rr() * .16;
          const fx = dx ? (dx > 0 ? 1 - o : o) : along;
          const fy = dy ? (dy > 0 ? 1.0 - o * .4 : .3 + o) : .4 + along * .55;
          const s = SMALL[(h >>> (i * 5 + dx * 2 + dy * 7 + 3)) % SMALL.length];
          items.push([s[0], fx, fy, s[1]]);
        }
      }
    }
    items.sort((a, b) => a[2] - b[2]);
    for (const it of items) foot(...it);
    // ressources : dessinées par-dessus le décor à chaque image (MapView.drawResources), sauf sans atlas HD
    const m = MIN_KEYS[World.get(world, p, 'mineral', x, y)];
    if (m && !Sprites.hasHD('min:' + m)) MapView.drawMineral(ctx, m, X + 4, Y + L - 22);
  },
  // ancien rendu (sans atlas HD)
  drawTileLegacy(ctx, world, p, x, y) {
    const t = World.terr(world, p, x, y);
    const h = Tiles.hash(x, y, p);
    const X = x * 32, Y = y * 32;
    if (World.isWater(t)) { ctx.drawImage(Tiles.base(World.isShore(world, p, x, y) || t === T.LAKE ? 'shore' : 'ocean', h % 12), X, Y); return; }
    let base = 'grass';
    if (t === T.DESERT) base = 'desert'; else if (t === T.TUNDRA) base = 'tundra'; else if (t === T.SWAMP) base = 'swamp';
    else if (t === T.MOUNTAIN || t === T.VOLCANO || t === T.CNODE) base = 'dirt';
    ctx.drawImage(Tiles.base(base, h % 9), X, Y);
    if (t === T.RIVER) MapView.drawRiver(ctx, world, p, x, y, X, Y, 1);
    if (t === T.HILLS) ctx.drawImage(Tiles.hill(h % 6), X, Y);
    if (t === T.MOUNTAIN) ctx.drawImage(Tiles.mountain(h % 8, true), X, Y);
    if (t === T.VOLCANO || t === T.CNODE) ctx.drawImage(Tiles.mountain(h % 8, false), X, Y);
  },
  drawRiver(ctx, world, p, x, y, X, Y, k) {
    let mask = world.planes[p].river ? world.planes[p].river[y * world.w + x] : 0;
    if (!mask) { // anciennes parties : relier aux voisins
      for (const [dx, dy, b] of [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]]) { const ny = y + dy; if (!World.inY(world, ny)) continue; const t2 = World.terr(world, p, x + dx, ny); if (t2 === T.RIVER || World.isWater(t2)) mask |= b; }
    }
    const dirs = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]].filter(d => mask & d[2]);
    if (!dirs.length) dirs.push([0, 1, 4]);
    const h = Tiles.hash(x, y, 5);
    const cx = X + (16 + ((h % 5) - 2)) * k, cy = Y + (16 + (((h >> 3) % 5) - 2)) * k;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const sh = k > 1 ? Tex.get('shallows') : null;
    if (sh && (!MapView._rp || MapView._rpCtx !== ctx)) { MapView._rp = ctx.createPattern(sh, 'repeat'); MapView._rpCtx = ctx; }
    const strokes = sh ? [[9, 'rgba(74,66,38,.35)'], [7, 'rgba(32,70,62,.85)'], [5.2, MapView._rp], [5.2, 'rgba(20,70,120,.3)'], [1.1, 'rgba(210,240,255,.55)']]
      : [[11, 'rgba(92,78,46,.85)'], [8, '#1f5f9a'], [5, '#2f86c4'], [1.6, 'rgba(190,232,255,.85)']];
    for (const [w, col] of strokes) {
      ctx.strokeStyle = col; ctx.lineWidth = w * k * .8;
      for (const [dx, dy] of dirs) {
        ctx.beginPath(); ctx.moveTo(cx, cy);
        const ex = X + (16 + dx * 17) * k, ey = Y + (16 + dy * 17) * k;
        ctx.quadraticCurveTo((cx + ex) / 2 + dy * 3 * k, (cy + ey) / 2 + dx * 3 * k, ex, ey);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
  drawMineral(ctx, m, X, Y) {
    const c = MINERAL_COLORS[m] || ['#999', '#fff'];
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(X - 1, Y - 1, 11, 10);
    ctx.fillStyle = c[0]; ctx.beginPath(); ctx.moveTo(X + 4.5, Y); ctx.lineTo(X + 9, Y + 4); ctx.lineTo(X + 4.5, Y + 8); ctx.lineTo(X, Y + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c[1]; ctx.fillRect(X + 3, Y + 2, 2, 2);
  },

  // ---------- rendu ----------
  draw() {
    const game = MapView.game; if (!game) return;
    const ctx = MapView.ctx, dpr = MapView.dpr, W = innerWidth, H = innerHeight, ts = MapView.ts, p = MapView.plane;
    const world = game.world;
    MapView.ensureLayer(p);
    if (MapView.visTurn !== MapView.visKey()) { MapView.vis = Move.visibility(game, MapView.pid); MapView.visTurn = MapView.visKey(); if (typeof App !== 'undefined' && App.recordIntel) App.recordIntel(MapView.vis); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, W, H);
    // couche statique (avec enroulement)
    const layer = MapView.layers[p];
    const left = MapView.camX - W / 2 / ts, top = MapView.camY - H / 2 / ts;
    // réduction lissée, agrandissement net (pixel art)
    ctx.imageSmoothingEnabled = ts < MapView.LT; ctx.imageSmoothingQuality = 'high';
    const LT = MapView.LT;
    for (let k = -1; k <= 1; k++) {
      // seule la portion visible de la couche est copiée
      const ox = (k * world.w - left) * ts, oy = -top * ts;
      if (ox + world.w * ts < 0 || ox > W) continue;
      const sx0 = Math.max(0, -ox / ts), sy0 = Math.max(0, -oy / ts);
      const sx1 = Math.min(world.w, (W - ox) / ts), sy1 = Math.min(world.h, (H - oy) / ts);
      if (sx1 <= sx0 || sy1 <= sy0) continue;
      ctx.drawImage(layer, sx0 * LT, sy0 * LT, (sx1 - sx0) * LT, (sy1 - sy0) * LT, ox + sx0 * ts, oy + sy0 * ts, (sx1 - sx0) * ts, (sy1 - sy0) * ts);
    }
    ctx.imageSmoothingEnabled = false;
    // tuiles visibles
    const x0 = Math.floor(left) - 1, x1 = Math.ceil(MapView.camX + W / 2 / ts) + 1;
    const y0 = Math.max(0, Math.floor(top) - 1), y1 = Math.min(world.h - 1, Math.ceil(MapView.camY + H / 2 / ts) + 1);
    const pl = game.players[MapView.pid];
    const ex = pl.explored[p], vis = MapView.vis[p];
    const pos = (x, y) => ({ x: (x - left) * ts, y: (y - top) * ts });
    const now = performance.now();
    // routes : des bandes pavées, bord sombre puis revêtement, en deux passes pour des jonctions propres
    MapView.drawRoads(ctx, world, p, ex, x0, x1, y0, y1, pos, ts);
    // corruption, auras, frontières
    ctx.lineCap = 'round';
    for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
      const x = World.wx(world, xx), i = y * world.w + x;
      if (!ex[i]) continue;
      const P = pos(xx, y);
      // le givre du Grand Hiver : un voile blanc bleuté, quelques cristaux
      if (world.planes[p].frost && world.planes[p].frost[i]) {
        const cx = P.x + ts / 2, cy = P.y + ts / 2, fg = ctx.createRadialGradient(cx, cy, ts * .1, cx, cy, ts * .8);
        fg.addColorStop(0, 'rgba(225,240,255,.62)'); fg.addColorStop(.65, 'rgba(205,228,255,.38)'); fg.addColorStop(1, 'rgba(205,228,255,0)');
        ctx.fillStyle = fg; ctx.fillRect(P.x - ts * .3, P.y - ts * .3, ts * 1.6, ts * 1.6);
        const hsh = (x * 37 + y * 101) % 5;
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, ts / 60); ctx.beginPath();
        for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3, r = ts * .08, sx = P.x + ts * (.25 + hsh * .1), sy = P.y + ts * (.3 + (hsh % 3) * .15); ctx.moveTo(sx - Math.cos(a) * r, sy - Math.sin(a) * r); ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); }
        ctx.stroke();
      }
      if (world.planes[p].corrupt[i] && Fx.has('corrupt:0')) {
        // une des neuf taches dessinées, tournée d'un quart de tour selon la case : le sol empoisonné, sans motif répété
        const hsh = (x * 73 + y * 151 + p * 37) >>> 0;
        Fx.draw(ctx, 'corrupt:' + (hsh % 9), P.x + ts / 2, P.y + ts / 2, ((hsh >> 4) & 3) * Math.PI / 2, ts * 1.12, .94);
      } else if (world.planes[p].corrupt[i]) {
        // tache diffuse qui se fond dans les cases voisines, et quelques fêlures
        const cx = P.x + ts / 2, cy = P.y + ts / 2;
        const cg = ctx.createRadialGradient(cx, cy, ts * .1, cx, cy, ts * .82);
        cg.addColorStop(0, 'rgba(48,10,40,.55)'); cg.addColorStop(.6, 'rgba(48,10,40,.3)'); cg.addColorStop(1, 'rgba(48,10,40,0)');
        ctx.fillStyle = cg; ctx.fillRect(P.x - ts * .35, P.y - ts * .35, ts * 1.7, ts * 1.7);
        const hsh = (x * 73 + y * 151) % 7;
        ctx.strokeStyle = 'rgba(20,0,14,.75)'; ctx.lineWidth = Math.max(1, ts / 50); ctx.beginPath();
        ctx.moveTo(P.x + ts * (.15 + hsh * .02), P.y + ts * .32); ctx.lineTo(P.x + ts * .48, P.y + ts * (.5 + hsh * .02)); ctx.lineTo(P.x + ts * .82, P.y + ts * .38);
        ctx.moveTo(P.x + ts * .48, P.y + ts * (.5 + hsh * .02)); ctx.lineTo(P.x + ts * (.42 + hsh * .03), P.y + ts * .82);
        ctx.stroke();
      }
      const own = world.planes[p].owner[i];
      if (own >= 0 && game.players[own]) {
        const col = game.players[own].color;
        ctx.fillStyle = col + '14'; ctx.fillRect(P.x, P.y, ts, ts);
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, ts / 22);
        for (const [dx, dy] of U.DIRS4) {
          const ny = y + dy; if (!World.inY(world, ny)) continue;
          if (world.planes[p].owner[World.idx(world, x + dx, ny)] === own) continue;
          ctx.beginPath();
          const a = dx === 1 ? [P.x + ts - 1, P.y, P.x + ts - 1, P.y + ts] : dx === -1 ? [P.x + 1, P.y, P.x + 1, P.y + ts] : dy === 1 ? [P.x, P.y + ts - 1, P.x + ts, P.y + ts - 1] : [P.x, P.y + 1, P.x + ts, P.y + 1];
          ctx.setLineDash([ts / 6, ts / 10]); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
    // colon sélectionné : zones des cités existantes et cases interdites
    const sv = typeof App !== 'undefined' && App.settlerView ? App.settlerView() : null;
    if (sv && sv.plane === p) MapView.drawSettlerZones(ctx, sv, pos, ts, x0, x1, y0, y1, ex);
    // nœuds liés : toute leur aura scintille aux couleurs du sorcier, comme dans l'original
    for (const s of game.sites) {
      if (s.plane !== p || s.type !== 'node' || s.owner < 0 || !game.players[s.owner]) continue;
      MapView.drawAura(ctx, s, s.warped != null ? '#3c2c40' : game.players[s.owner].color, pos, ts, now, ex, W, H);   // perverti : l'aura s'éteint presque
    }
    // les nœuds dévorés : une tache de cendre éteinte
    for (const s of game.sites) {
      if (!s.devoured || s.plane !== p || !ex[s.y * world.w + s.x]) continue;
      const P = pos(s.x + MapView.wrapNear(s.x), s.y), cx = P.x + ts / 2, cy = P.y + ts / 2, dg = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * .75);
      dg.addColorStop(0, 'rgba(12,8,14,.8)'); dg.addColorStop(.6, 'rgba(30,22,34,.45)'); dg.addColorStop(1, 'rgba(30,22,34,0)');
      ctx.fillStyle = dg; ctx.fillRect(P.x - ts * .25, P.y - ts * .25, ts * 1.5, ts * 1.5);
    }
    // lieux
    for (const s of game.sites) {
      if (s.plane !== p || s.type === 'node' || !ex[s.y * world.w + s.x]) continue;
      const P = pos(s.x + MapView.wrapNear(s.x), s.y);
      if (s.type === 'rift') { if (!s.closed) MapView.drawRift(ctx, s, P.x, P.y, ts, now); continue; }
      if (s.type === 'shrine') { MapView.drawShrine(ctx, s, P.x, P.y, ts, now, !!Pacts.pactWith(pl, s.entity)); continue; }
      if (s.type === 'breach') { if (!s.cleared) MapView.drawBreach(ctx, s, P.x, P.y, ts, now); continue; }
      if (s.finale) { if (!s.cleared) MapView.drawFinaleSite(ctx, s, P.x, P.y, ts, now); continue; }
      const key = { cave: 'feat:cave', ruins: 'feat:ruins', temple: 'feat:temple', keep: 'feat:keep', dungeon: 'feat:dungeon', fallenTemple: 'feat:fallen_temple', lair: 'feat:lair', tower: 'feat:tower', tomb: 'feat:fallen_temple' }[s.type];
      const kc = Game.knownCleared(pl, s);   // ce que le joueur sait du lieu, pas son état réel
      if (s.type === 'tomb' && !kc) { const g = ctx.createRadialGradient(P.x + ts / 2, P.y + ts * .6, 0, P.x + ts / 2, P.y + ts * .6, ts * .8); g.addColorStop(0, 'rgba(150,90,220,.55)'); g.addColorStop(1, 'rgba(150,90,220,0)'); ctx.fillStyle = g; ctx.fillRect(P.x - ts * .3, P.y - ts * .2, ts * 1.6, ts * 1.6); }
      if (kc && s.type !== 'tower') ctx.globalAlpha = .55;
      if (Sprites.hasHD(key)) Sprites.drawFoot(ctx, Sprites.planeKey(key, p), P.x + ts / 2, P.y + ts * 1.02, ts * 1.12);
      else Sprites.draw(ctx, key, P.x + ts * .08, P.y + ts * .02, ts * .84, ts * .84);
      ctx.globalAlpha = 1;
      if (s.type === 'tower' && kc) { ctx.fillStyle = 'rgba(180,140,255,.25)'; ctx.beginPath(); ctx.arc(P.x + ts / 2, P.y + ts / 2, ts * .55, 0, 7); ctx.fill(); }
    }
    // ressources minérales, bien lisibles comme dans l'original
    MapView.drawResources(ctx, game, p, ex, x0, x1, y0, y1, pos, ts, now);
    // trouvailles
    for (const cc of game.caches || []) {
      if (cc.plane !== p || !ex[cc.y * world.w + cc.x]) continue;
      const P = pos(cc.x + MapView.wrapNear(cc.x), cc.y);
      if (P.x < -ts * 2 || P.x > W + ts || P.y < -ts * 2 || P.y > H + ts) continue;
      MapView.drawCache(ctx, cc, P.x, P.y, ts, now);
    }
    // cités
    for (const c of Object.values(game.cities)) {
      if (c.plane !== p || !ex[c.y * world.w + c.x]) continue;
      const P = pos(c.x + MapView.wrapNear(c.x), c.y);
      if (P.x < -ts * 2 || P.x > W + ts || P.y < -ts * 2 || P.y > H + ts) continue;
      MapView.drawCity(ctx, c, P.x, P.y, ts);
    }
    // unités
    const stacks = {};
    for (const u of Object.values(game.units)) {
      if (u.plane !== p) continue;
      const i = u.y * world.w + u.x;
      if (u.owner !== MapView.pid && !vis[i]) continue;
      if (u.guardian != null) continue;
      if (u.owner !== MapView.pid && Intel.hiddenFrom(game, MapView.pid, u)) continue;   // (même règle que les infobulles : au contact d'une unité ou d'une cité)
      const k = u.x + ',' + u.y; (stacks[k] = stacks[k] || []).push(u);
    }
    for (const k in stacks) {
      const units = stacks[k];
      const u0 = MapView.topUnit(units);
      let dx = 0, dy = 0;
      if (MapView.anim && MapView.anim.ids.includes(u0.id)) { const a = MapView.anim; const t = Math.min(1, (now - a.t0) / a.dur); let ddx = a.from[0] - a.to[0]; if (Math.abs(ddx) > world.w / 2) ddx -= Math.sign(ddx) * world.w; dx = ddx * (1 - t); dy = (a.from[1] - a.to[1]) * (1 - t); }
      const P = pos(u0.x + MapView.wrapNear(u0.x) + dx, u0.y + dy);
      if (P.x < -ts * 2 || P.x > W + ts || P.y < -ts * 2 || P.y > H + ts) continue;
      const city = Cities.at(game, p, u0.x, u0.y);
      const walking = MapView.anim && MapView.anim.ids.includes(u0.id) && now - MapView.anim.t0 < MapView.anim.dur + 60;
      MapView.drawUnit(ctx, u0, units.length, P.x, P.y, ts, !!city, MapView.sel && MapView.sel.tileKey === p + ':' + k, walking ? now - MapView.anim.walk0 : null, units.some(x => x.stasis));
    }
    // brouillard : une petite image (un pixel par case) de la fenêtre visible, agrandie avec lissage, pour des bords doux.
    // Tracée d'un seul tenant, sans découpe : découpée à la couture est-ouest du monde, elle y laissait une arête nette
    // (le lissage ne franchit pas le bord d'une découpe sur certaines cartes graphiques).
    {
      const fx0 = x0 - 1, fy0 = Math.floor(top) - 2, fw = x1 - x0 + 3, fh = Math.ceil(H / ts) + 5;
      const key = [MapView.visTurn, p, MapView.exploredCount(ex), fx0, fy0, fw, fh].join(':');
      if (MapView._fogKey !== key) {
        const Ww = world.w, Hh = world.h;
        const fc = MapView._fogC || (MapView._fogC = document.createElement('canvas'));
        fc.width = fw; fc.height = fh;
        const fctx = fc.getContext('2d'), img = fctx.createImageData(fw, fh);
        for (let j = 0; j < fh; j++) for (let k = 0; k < fw; k++) {
          const yy = Math.max(0, Math.min(Hh - 1, fy0 + j)), i = yy * Ww + World.wx(world, fx0 + k), o = (j * fw + k) * 4;
          img.data[o] = 5; img.data[o + 1] = 7; img.data[o + 2] = 12;
          img.data[o + 3] = !ex[i] ? 255 : !vis[i] ? 112 : 0;
        }
        fctx.putImageData(img, 0, 0);
        MapView._fogKey = key;
      }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(MapView._fogC, (fx0 - left) * ts, (fy0 - top) * ts, fw * ts, fh * ts);
      ctx.imageSmoothingEnabled = false;
      // cases inexplorées : noyau noir plein (rien ne transparaît au-delà de la frange)
      ctx.fillStyle = '#05070a';
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
        const x = World.wx(world, xx), i = y * world.w + x;
        if (ex[i]) continue;
        let edge = false;
        for (const [dx, dy] of U.DIRS8) { const ny = y + dy; if (ny < 0 || ny >= world.h) continue; if (ex[ny * world.w + World.wx(world, x + dx)]) { edge = true; break; } }
        const P = pos(xx, y);
        if (!edge) ctx.fillRect(P.x - .5, P.y - .5, ts + 1, ts + 1);
      }
    }
    if (sv && sv.plane === p) { MapView.drawSettlerHover(ctx, sv, pos, ts, ex); MapView.drawSettlerSites(ctx, sv, pos, ts, now); }
    // nœuds magiques : halo qui respire et étincelles, par-dessus le brouillard pour rester repérables
    for (const s of game.sites) {
      if (s.type !== 'node' || s.plane !== p || !ex[s.y * world.w + s.x]) continue;
      const P = pos(s.x + MapView.wrapNear(s.x), s.y);
      if (P.x < -ts * 2 || P.x > W + ts || P.y < -ts * 2 || P.y > H + ts) continue;
      MapView.drawNodeGlow(ctx, s, P.x, P.y, ts, now);
    }
    // légendes de vos héros : la région cerclée d'or (seulement quand le héros est sélectionné), puis le repaire marqué d'un « ! »
    const selIds = MapView.sel ? MapView.sel.ids : [];
    for (const u of Object.values(game.units)) {
      const q = u.owner === MapView.pid && u.hero && u.hero.quest;
      if (!q || q.done || q.site == null || q.stage !== 2 || !selIds.includes(u.id)) continue;
      const s = game.sites[q.site]; if (!s || s.plane !== p) continue;
      const P = pos(q.cx + MapView.wrapNear(q.cx), q.cy), cx = P.x + ts / 2, cy = P.y + ts / 2, R = (q.r + .5) * ts;
      if (cx < -R || cx > W + R || cy < -R || cy > H + R) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(255,200,60,.07)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.setLineDash([ts * .3, ts * .2]); ctx.lineDashOffset = -now / 80; ctx.strokeStyle = 'rgba(255,207,58,.85)'; ctx.lineWidth = Math.max(2, ts / 16);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      const fs = Math.max(11, Math.min(16, ts * .3)); ctx.font = '600 ' + fs + 'px Palatino Linotype, Georgia, serif';
      const label = 'Légende ' + App.de(u.hero.name) + ' ?', tw = ctx.measureText(label).width + 12;
      const ly = U.clamp(cy - R - 6, fs + 70, H - 10), lx = U.clamp(cx, tw / 2 + 8, W - tw / 2 - 8);
      ctx.fillStyle = 'rgba(8,10,14,.85)'; ctx.fillRect(lx - tw / 2, ly - fs - 2, tw, fs + 6);
      ctx.fillStyle = '#ffcf3a'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, lx, ly);
      ctx.restore();
    }
    for (const u of Object.values(game.units)) {
      const q = u.owner === MapView.pid && u.hero && u.hero.quest;
      if (!q || q.done || q.site == null || (q.type === 'legend' && q.stage < 3)) continue;
      const s = game.sites[q.site]; if (!s || s.plane !== p || !ex[s.y * world.w + s.x]) continue;
      const P = pos(s.x + MapView.wrapNear(s.x), s.y), bob = Math.sin(now / 300) * ts * .04;
      const r = Math.max(9, ts * .17), bx = P.x + ts * .8, by = P.y + ts * .2 + bob;
      ctx.save();
      ctx.shadowColor = 'rgba(255,200,60,.9)'; ctx.shadowBlur = r * 1.2;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fillStyle = '#ffcf3a'; ctx.fill();
      ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(60,30,0,.95)'; ctx.stroke();
      ctx.font = '900 ' + Math.round(r * 1.5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3a1e00'; ctx.fillText('!', bx, by + r * .06);
      ctx.restore();
    }
    // repères pulsants
    for (const pg of MapView.pings || []) {
      const age = (now - pg.t0) / 1000; if (pg.plane !== p || age > 4) continue;
      const P = pos(pg.x + MapView.wrapNear(pg.x), pg.y), cx = P.x + ts / 2, cy = P.y + ts / 2;
      for (let k = 0; k < 3; k++) {
        const f = ((age * .9 + k / 3) % 1), a = (1 - f) * Math.min(1, (4 - age) / 1.2);
        ctx.strokeStyle = 'rgba(255,214,110,' + a.toFixed(3) + ')'; ctx.lineWidth = Math.max(2, ts / 14) * (1 - f * .5);
        ctx.beginPath(); ctx.arc(cx, cy, ts * (.3 + f * 1.1), 0, 7); ctx.stroke();
      }
    }
    // failles qui se referment
    if (MapView.fx && MapView.fx.length) {
      MapView.fx = MapView.fx.filter(f => f.t0 == null || now - f.t0 < (MapView.RIFT_CLOSE_T1 + MapView.RIFT_CLOSE_T2) * 1000);
      const blocked = typeof UI !== 'undefined' && ((UI.modals || []).length || UI.busy) || (typeof CombatView !== 'undefined' && CombatView.active);
      for (const f of MapView.fx) {
        if (f.t0 == null) {
          // en attente : la faille reste visible, ouverte, jusqu'à ce que la voie soit libre
          if (blocked) { if (f.plane === p) MapView.drawRiftClose(ctx, Object.assign({}, f, { t0: now + 1 }), pos, ts, now); continue; }
          f.t0 = now + 350;
          if (f.center) { MapView.centerOn(f.x, f.y, f.plane); if (typeof App !== 'undefined') App.dirty = true; setTimeout(() => { if (typeof Sfx !== 'undefined') Sfx.play('zap'); }, 350 + MapView.RIFT_CLOSE_T1 * 1000); }
        }
        if (f.type === 'riftClose' && f.plane === p) MapView.drawRiftClose(ctx, f, pos, ts, now);
      }
    }
    // boutons Repaires et Nœuds : les lieux concernés pulsent tant qu'ils sont enfoncés
    const rings = (list, col) => {
      const t = now / 1000;
      for (const s of list) {
        const P = pos(s.x + MapView.wrapNear(s.x), s.y); if (P.x < -ts * 2 || P.x > W + ts || P.y < -ts * 2 || P.y > H + ts) continue;
        const cx = P.x + ts / 2, cy = P.y + ts / 2, ph = (s.id * .37) % 1, c = typeof col === 'function' ? col(s) : col;
        for (let k = 0; k < 2; k++) {
          const f = (t * .9 + ph + k / 2) % 1, a = (1 - f) * .95;
          ctx.strokeStyle = 'rgba(' + c + ',' + a.toFixed(3) + ')'; ctx.lineWidth = Math.max(2, ts / 14) * (1 - f * .5);
          ctx.beginPath(); ctx.arc(cx, cy, ts * (.3 + f * 1.1), 0, 7); ctx.stroke();
        }
      }
    };
    if (typeof App !== 'undefined' && App.showLairs) { rings(MapView.openLairs(game, pl, p), '255,214,110'); rings(MapView.scoutedLairs(game, pl, p), '205,140,255'); }
    if (typeof App !== 'undefined' && App.showNodes) rings(MapView.freeNodes(game, pl, p), s => MapView.NODE_RGB[MapView.nodeKind(pl, s)]);
    if (MapView.zone && MapView.zone.plane === p) MapView.drawZone(ctx, MapView.zone, pos, ts, now);
    // visée d'un sort de cité (ou de certains sorts de case) sur la carte : là où il servirait, cerclé d'or
    if (typeof MagicUI !== 'undefined' && MagicUI.targeting && (MagicUI.targeting.cities || MagicUI.targeting.tiles)) {
      const pulse = .5 + .5 * Math.sin(now / 200), sq = !MagicUI.targeting.cities && DATA.spells[MagicUI.targeting.id] && DATA.spells[MagicUI.targeting.id].kind === 'terrain';
      const spots = MagicUI.targeting.cities ? [...MagicUI.targeting.cities].map(cid => game.cities[cid]).filter(Boolean) : MagicUI.targeting.tiles.map(([pp, x, y, rgb, label]) => ({ plane: pp, x, y, rgb, label }));
      for (const c of spots) {
        if (c.plane !== p) continue;
        const P = pos(c.x + MapView.wrapNear(c.x), c.y); if (P.x < -ts * 2 || P.x > W + ts || P.y < -ts * 2 || P.y > H + ts) continue;
        const hov = MapView.hover && MapView.hover.x === c.x && MapView.hover.y === c.y, rgb = c.rgb || '255,214,110';   // (orange : à perte)
        ctx.save(); ctx.shadowColor = 'rgba(' + rgb + ',.95)'; ctx.shadowBlur = 8 + 8 * pulse;
        ctx.strokeStyle = hov ? '#fff4c8' : 'rgba(' + rgb + ',' + (.75 + .25 * pulse).toFixed(3) + ')'; ctx.lineWidth = Math.max(2.5, ts / (hov ? 9 : 12));
        // sorts de terrain : des cases voisines, souvent nombreuses : un cercle dans la case (sans déborder sur les voisines),
        // et dessous ce qu'on y gagne ou perd (Transmutation, Changement de terrain)
        if (sq) {
          ctx.beginPath(); ctx.arc(P.x + ts / 2, P.y + ts / 2, ts * (.4 + .02 * pulse), 0, 7); ctx.stroke(); ctx.restore();
          if (c.label && ts >= 44) {
            const fs = Math.max(10, Math.round(ts * .18)); ctx.save(); ctx.font = '600 ' + fs + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const tw = ctx.measureText(c.label).width, bx = P.x + ts / 2, by = P.y + ts - fs * .75;
            ctx.fillStyle = 'rgba(12,10,8,.78)'; ctx.fillRect(bx - tw / 2 - 3, by - fs * .6, tw + 6, fs * 1.2);
            ctx.fillStyle = 'rgb(' + rgb + ')'; ctx.fillText(c.label, bx, by + 1); ctx.restore();
          }
          continue;
        }
        ctx.beginPath(); ctx.arc(P.x + ts / 2, P.y + ts / 2, ts * (.7 + .05 * pulse), 0, 7); ctx.stroke(); ctx.restore();
      }
    }
    // visée d'un sort qui touche plusieurs cases : sa zone en filigrane sous le curseur
    if (typeof MagicUI !== 'undefined' && MagicUI.targeting && MapView.hover) {
      const a = Spells.areaOf(game, pl, MagicUI.targeting.id, p, MapView.hover.x, MapView.hover.y);
      if (a) MapView.drawSpellArea(ctx, a, pos, ts, now);
    }
    // bords du monde
    ctx.fillStyle = '#05070a';
    const yt = pos(0, 0).y, yb = pos(0, world.h).y;
    if (yt > 0) ctx.fillRect(0, 0, W, yt); if (yb < H) ctx.fillRect(0, yb, W, H - yb);
    // route tracée par les ingénieurs sélectionnés (ou en aperçu au survol) : les cases restant à empierrer
    if (MapView.sel) {
      const rp = MapView.roadPreview && MapView.roadPreview.plane === p ? MapView.roadPreview : null;
      const eng = rp ? { roadPlan: rp } : MapView.sel.ids.map(id => game.units[id]).find(u => u && u.status === 'roadto' && u.roadPlan && u.roadPlan.plane === p);
      if (eng) {
        const t = eng.roadPlan.tiles;
        ctx.save(); ctx.strokeStyle = 'rgba(240,192,96,.85)'; ctx.lineWidth = Math.max(2, ts / 16); ctx.setLineDash([ts / 6, ts / 9]);
        ctx.beginPath();
        let prev = null;
        for (const [x, y] of t) { const P = pos(x + MapView.wrapNear(x), y), cx = P.x + ts / 2, cy = P.y + ts / 2; if (prev && Math.abs(cx - prev[0]) > ts * 2) ctx.moveTo(cx, cy); else if (prev) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy); prev = [cx, cy]; }
        ctx.stroke(); ctx.setLineDash([]);
        for (const [x, y] of t) {
          if (World.hasRoad(world, p, x, y)) continue;
          const P = pos(x + MapView.wrapNear(x), y);
          ctx.fillStyle = 'rgba(30,20,8,.85)'; ctx.strokeStyle = '#f0c060'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.rect(P.x + ts / 2 - ts * .09, P.y + ts / 2 - ts * .09, ts * .18, ts * .18); ctx.fill(); ctx.stroke();
        }
        // aperçu : la durée des travaux au bout du tracé
        if (rp && t.length) {
          const [lx, ly] = t[t.length - 1], P = pos(lx + MapView.wrapNear(lx), ly), fs = Math.max(11, ts * .22);
          const label = '≈ ' + U.n(rp.turns, 'tour'); ctx.font = '700 ' + fs + 'px system-ui'; ctx.textAlign = 'center';
          const tw = ctx.measureText(label).width + 10;
          ctx.fillStyle = 'rgba(10,10,14,.85)'; ctx.fillRect(P.x + ts / 2 - tw / 2, P.y - fs * .9, tw, fs * 1.35);
          ctx.fillStyle = '#f0c060'; ctx.fillText(label, P.x + ts / 2, P.y + fs * .2);
        }
        ctx.restore();
      }
    }
    // chantiers de vos ingénieurs : barre d'avancement sous la case
    {
      const seen = new Set();
      for (const u of Object.values(game.units)) {
        if (u.owner !== App.pid || u.plane !== p || (u.status !== 'road' && u.status !== 'roadto') || !Units.isEngineer(u)) continue;
        const key = u.x + ',' + u.y; if (seen.has(key) || World.hasRoad(world, p, u.x, u.y)) continue; seen.add(key);
        const work = world.planes[p].roadWork[key] || 0, need = DATA.terrain[World.terrainKey(world, p, u.x, u.y)].roadTurns || 4;
        const P = pos(u.x + MapView.wrapNear(u.x), u.y), bw = ts * .56, bh = Math.max(3, ts * .055), bx = P.x + ts * .22, by = P.y + ts * .9;
        ctx.fillStyle = 'rgba(10,10,14,.85)'; ctx.fillRect(bx - 1.5, by - 1.5, bw + 3, bh + 3);
        ctx.fillStyle = '#f0c060'; ctx.fillRect(bx, by, bw * Math.min(1, work / need), bh);
      }
    }
    // points de ralliement de vos cités : un fanion
    {
      const seen = new Set();
      for (const c of Object.values(game.cities)) {
        const r = c.rally; if (c.owner !== App.pid || !r || r.plane !== p) continue;
        const key = r.x + ',' + r.y; if (seen.has(key)) continue; seen.add(key);
        const P = pos(r.x + MapView.wrapNear(r.x), r.y), bx = P.x + ts * .18, by = P.y + ts * .14;
        ctx.save(); ctx.fillStyle = '#3a2a10'; ctx.fillRect(bx, by, Math.max(1.5, ts / 32), ts * .42);
        ctx.fillStyle = game.players[App.pid].color; ctx.strokeStyle = 'rgba(20,14,4,.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx + 1, by); ctx.lineTo(bx + ts * .24, by + ts * .07); ctx.lineTo(bx + 1, by + ts * .15); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
    // menaces : les piles ennemies en vue qui marchent sur vos cités, avec leur délai et leur force
    if (App.showThreats !== false) MapView.drawThreats(ctx, p, pos, ts, now);
    // chemin prévu
    if (MapView.path && MapView.path.length && MapView.sel) {
      const units = MapView.sel.ids.map(id => game.units[id]).filter(Boolean);
      if (units.length && units[0].plane === p) {   // le trajet appartient au plan de la pile
        const pace = Move.pacers(game, units), per = Math.max(1, Math.min(...pace.map(u => Units.maxMoves(game, u))));
        const left0 = Math.min(...pace.map(u => u.moves)), turns = Move.stepTurns(left0, per, MapView.path);
        // territoire étranger traversé : la pastille cerclée de la couleur du sorcier, une étiquette à l'entrée
        const me = MapView.pid, own = (x, y) => World.get(world, p, 'owner', x, y), tags = [];
        let prevOw = own(units[0].x, units[0].y);
        for (const [i, st] of MapView.path.entries()) {
          const P = pos(st.x + MapView.wrapNear(st.x), st.y);
          const turnsN = turns[i];
          ctx.fillStyle = turnsN === 0 ? 'rgba(120,220,120,.9)' : 'rgba(240,200,90,.9)';
          ctx.beginPath(); ctx.arc(P.x + ts / 2, P.y + ts / 2, Math.max(3, ts / 9), 0, 7); ctx.fill();
          const ow = own(st.x, st.y), fo = ow >= 0 && ow !== me ? game.players[ow] : null;
          if (fo) {
            ctx.strokeStyle = Players.knows(game, me, ow) ? fo.color : '#9a958a'; ctx.lineWidth = Math.max(1.5, ts / 22);
            ctx.beginPath(); ctx.arc(P.x + ts / 2, P.y + ts / 2, Math.max(3, ts / 9) + ctx.lineWidth / 2, 0, 7); ctx.stroke();
            if (ow !== prevOw) tags.push({ st, o: fo });
          }
          prevOw = ow;
          // le numéro du tour : au bout du trajet, et là où la pile finit chacun des tours intermédiaires (où elle sera exposée)
          const lastOfTurn = i < MapView.path.length - 1 && turns[i + 1] !== turnsN;
          if ((st === MapView.path[MapView.path.length - 1] && turnsN > 0) || (lastOfTurn && MapView.path.length > 1)) { ctx.font = 'bold ' + Math.max(11, ts / 3.5) + 'px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(turnsN + 1, P.x + ts / 2, P.y + ts / 2 - ts / 5); ctx.fillStyle = lastOfTurn ? '#ffe7a0' : '#fff'; ctx.fillText(turnsN + 1, P.x + ts / 2, P.y + ts / 2 - ts / 5); }
        }
        // prévision de bataille sur la cible
        const fc = MapView.forecast, last = MapView.path[MapView.path.length - 1];
        if (fc && !fc.pending && last && fc.x === last.x && fc.y === last.y && fc.plane === p && (!fc.sel || fc.sel === MapView.sel.ids.join(','))) {
          const P = pos(fc.x + MapView.wrapNear(fc.x), fc.y), pct = fc.unknown || fc.refused ? 0 : Math.round(fc.win * 100);
          const col = fc.refused ? '#ff6a5a' : fc.unknown ? '#a8a294' : fc.empty || pct >= 65 ? '#6fdc7f' : pct >= 40 ? '#f0c24a' : '#ff6a5a';
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(2.5, ts / 18);
          ctx.beginPath(); ctx.arc(P.x + ts / 2, P.y + ts / 2, ts * .46, 0, 7); ctx.stroke();
          const label = fc.refused ? 'Impossible' : fc.unknown ? '?' : (fc.empty ? 'Prise' : U.cap(Game.chanceWord(fc.win))) + (fc.reportAge != null ? ' ?' : ''), fs = Math.max(12, ts * .24);
          ctx.font = '700 ' + fs + 'px system-ui'; ctx.textAlign = 'center';
          const tw = ctx.measureText(label).width + 10;
          ctx.fillStyle = 'rgba(10,10,14,.85)'; ctx.fillRect(P.x + ts / 2 - tw / 2, P.y - fs * .9, tw, fs * 1.35);
          ctx.fillStyle = col; ctx.fillText(label, P.x + ts / 2, P.y + fs * .2);
        }
        const fcShown = fc && !fc.pending && last && fc.x === last.x && fc.y === last.y;
        for (const tg of tags) MapView.borderTag(ctx, pos, ts, tg.st.x, tg.st.y, tg.o, tg.st === last && fcShown);
      }
    }
    // destination dans un territoire fermé à vos troupes : aucun chemin, et la raison
    if (MapView.sel && MapView.hover && !(MapView.path && MapView.path.length) && !(typeof App !== 'undefined' && App.roadMode)) {
      const hv = MapView.hover, ow = World.get(world, p, 'owner', hv.x, hv.y), u0 = game.units[MapView.sel.ids[0]];
      if (ow >= 0 && u0 && u0.plane === p && !(u0.x === hv.x && u0.y === hv.y) && Move.closedBy(game, MapView.pid).has(ow)) {
        const P = pos(hv.x + MapView.wrapNear(hv.x), hv.y);
        ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = Math.max(2.5, ts / 18);
        ctx.beginPath(); ctx.arc(P.x + ts / 2, P.y + ts / 2, ts * .46, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(P.x + ts * .3, P.y + ts * .3); ctx.lineTo(P.x + ts * .7, P.y + ts * .7); ctx.moveTo(P.x + ts * .7, P.y + ts * .3); ctx.lineTo(P.x + ts * .3, P.y + ts * .7); ctx.stroke();
        MapView.borderTag(ctx, pos, ts, hv.x, hv.y, game.players[ow], false, true);
      }
    }
    // ordre de marche en cours de la pile sélectionnée
    if (MapView.sel) {
      const u = game.units[MapView.sel.ids[0]];
      if (u && u.plane === p && u.path && u.path.length && !(MapView.path && MapView.path.length)) {
        const per = Math.max(1, Units.maxMoves(game, u));
        let prev = pos(u.x + MapView.wrapNear(u.x), u.y);
        ctx.strokeStyle = 'rgba(140,200,255,.55)'; ctx.lineWidth = Math.max(1.5, ts / 26); ctx.setLineDash([ts / 8, ts / 10]);
        ctx.beginPath(); ctx.moveTo(prev.x + ts / 2, prev.y + ts / 2);
        for (const [sx, sy] of u.path) { const P = pos(sx + MapView.wrapNear(sx), sy); ctx.lineTo(P.x + ts / 2, P.y + ts / 2); }
        ctx.stroke(); ctx.setLineDash([]);
        for (const [sx, sy] of u.path) {
          const P = pos(sx + MapView.wrapNear(sx), sy);
          ctx.fillStyle = 'rgba(10,20,40,.7)'; ctx.beginPath(); ctx.arc(P.x + ts / 2, P.y + ts / 2, Math.max(3, ts / 10), 0, 7); ctx.fill();
          ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 2; ctx.stroke();
        }
        const [dx, dy] = u.path[u.path.length - 1], D = pos(dx + MapView.wrapNear(dx), dy);
        ctx.fillStyle = '#9fd0ff'; ctx.fillRect(D.x + ts / 2, D.y + ts * .12, 2, ts * .38);
        ctx.beginPath(); ctx.moveTo(D.x + ts / 2 + 2, D.y + ts * .12); ctx.lineTo(D.x + ts / 2 + ts * .2, D.y + ts * .19); ctx.lineTo(D.x + ts / 2 + 2, D.y + ts * .26); ctx.fill();
      }
    }
    // survol
    if (MapView.hover) {
      const hv = MapView.hover, hi = hv.y * world.w + World.wx(world, hv.x);
      if (ex[hi]) {
        const k = p + ':' + hi + ':' + game.turn;
        // le contour de l'aura n'apparaît qu'une fois le nœud lié par un esprit
        if (MapView._auraHoverKey !== k) { MapView._auraHoverKey = k; const a = Game.auraAt(game, p, hv.x, hv.y); MapView._auraHover = a && a.owner >= 0 ? a : null; }
        if (MapView._auraHover) MapView.drawAuraOutline(ctx, MapView._auraHover, pos, ts, ex);
      }
      const P = pos(MapView.hover.x + MapView.wrapNear(MapView.hover.x), MapView.hover.y);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(P.x + .5, P.y + .5, ts - 1, ts - 1);
    }
    // éclairs d'effets
    MapView.flashes = MapView.flashes.filter(f => now - f.t0 < f.dur);
    for (const f of MapView.flashes) {
      if (f.plane !== p) continue;
      const P = pos(f.x + MapView.wrapNear(f.x), f.y); const t = (now - f.t0) / f.dur;
      ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - t; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(P.x + ts / 2, P.y + ts / 2, ts * (0.3 + t * 0.9), 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    MapView.floats = MapView.floats.filter(f => now - f.t0 < f.dur);
    for (const f of MapView.floats) {
      if (f.plane !== p) continue;
      const P = pos(f.x + MapView.wrapNear(f.x), f.y), t = (now - f.t0) / f.dur;
      const fs = Math.max(13, Math.min(22, ts * .26));
      ctx.save(); ctx.globalAlpha = t < .1 ? t / .1 : 1 - Math.max(0, (t - .6) / .4);
      ctx.font = '700 ' + fs + 'px system-ui'; ctx.textAlign = 'center';
      const yy = P.y + ts * .2 - t * ts * .7;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,8,4,.85)'; ctx.strokeText(f.text, P.x + ts / 2, yy);
      ctx.fillStyle = f.color; ctx.fillText(f.text, P.x + ts / 2, yy);
      ctx.restore();
    }
  },
  // ---------- menaces ----------
  // les piles ennemies en vue (sorciers en guerre, pillards, monstres en maraude) à 8 cases au plus d'une de vos cités :
  // la cité la plus proche, le délai d'arrivée d'après leur mouvement, leur force rapportée à la garnison
  threats(p) {
    const game = App.game, w = game.world, me = App.me(), vis = MapView.vis && MapView.vis[p]; if (!vis || !me) return [];
    const stacks = {};
    for (const u of Object.values(game.units)) {
      if (u.plane !== p || u.owner === me.id || u.guardian != null || u.nodeBound != null || !vis[u.y * w.w + u.x]) continue;
      if (u.owner >= 0 ? me.diplo[u.owner] !== 'war' : !u.rampage && !u.crisis && !u.raider) continue;
      if (Cities.at(game, p, u.x, u.y) || Intel.hiddenFrom(game, me.id, u)) continue;
      // le Démon légendaire ne combat que la cible du pacte : pour les autres, il ne menace rien
      if (u.riteDemon) { const ra = typeof Rite !== 'undefined' && Rite.active(game); if (!ra || ra.target !== me.id) continue; }
      (stacks[u.x + ',' + u.y] = stacks[u.x + ',' + u.y] || []).push(u);
    }
    // où chaque unité ennemie se tenait au tour précédent : on ne trace que les piles qui se rapprochent d'une cité
    if (MapView._posTurn !== game.turn) { MapView._prevPos = MapView._curPos || {}; MapView._curPos = {}; MapView._posTurn = game.turn; }
    for (const k in stacks) for (const u of stacks[k]) MapView._curPos[u.id] = [u.x, u.y, u.plane];
    const key = [game.turn, p, MapView.visTurn, Object.entries(stacks).map(([k, us]) => k + ':' + us.map(u => u.id + '.' + u.dmg).join('.')).join('|')].join('#');
    if (MapView._thrKey === key) return MapView._thr;
    const mine = Cities.ofPlayer(game, me.id).filter(c => c.plane === p);
    const out = [];
    for (const k in stacks) {
      const us = stacks[k].filter(u => !Units.isScout(u) && !Units.isSettler(u) && !Units.isEngineer(u)); if (!us.length) continue;
      const u0 = us[0];
      const c = U.min(mine.filter(c => World.dist(w, c.x, c.y, u0.x, u0.y) <= 8), c => World.dist(w, c.x, c.y, u0.x, u0.y)); if (!c) continue;
      const d = World.dist(w, c.x, c.y, u0.x, u0.y), per = Math.max(1, Math.floor(Math.min(...us.map(u => Units.maxMoves(game, u))) / 2));
      const atk = U.sum(us, u => Units.strength(game, u)), def = U.sum(Units.at(game, p, c.x, c.y).filter(o => o.owner === me.id), o => Units.strength(game, o)) * (c.buildings.cityWalls ? 1.5 : 1) + (Battle.towerStrength ? Battle.towerStrength(game, c) : 0);
      const ratio = atk / Math.max(1, def);
      // une pile qui ne pèse rien face à la garnison ne menace pas la cité ; une pile qui ne s'en approche pas ne marche pas
      // dessus (elle passe, explore, escorte, ou vient voir ce que la cité cache) : pas de flèche
      const prev = MapView._prevPos[u0.id], dPrev = prev && prev[2] === p ? World.dist(w, c.x, c.y, prev[0], prev[1]) : null;
      if (ratio < 0.25 || !(d <= 2 || (dPrev != null ? d < dPrev : d <= 4))) continue;
      out.push({ sx: u0.x, sy: u0.y, city: c, eta: Math.max(1, Math.ceil(d / per)), ratio, n: us.length, owner: u0.owner });
    }
    MapView._thrKey = key; MapView._thr = out;
    return out;
  },
  ratioText(r) { return r >= 10 ? '×10 et plus' : '×' + String(Math.round(r * 10) / 10).replace('.', ','); },
  // zone d'un sort en cours de visée : toutes ses cases en bleu pâle, celles où il agira en or, et ce qu'il y fera
  drawSpellArea(ctx, a, pos, ts, now) {
    const w = MapView.game.world, inA = new Set(a.tiles.map(([x, y]) => y * w.w + x)), hot = new Set(a.hot.map(([x, y]) => y * w.w + x)), pulse = .5 + .5 * Math.sin(now / 300);
    let top = null;
    for (const [x, y] of a.tiles) {
      const P = pos(x + MapView.wrapNear(x), y), h = hot.has(y * w.w + x);
      ctx.fillStyle = h ? 'rgba(255,214,110,' + (.22 + .14 * pulse).toFixed(3) + ')' : 'rgba(160,200,255,.12)'; ctx.fillRect(P.x, P.y, ts, ts);
      ctx.strokeStyle = 'rgba(190,215,255,.85)'; ctx.lineWidth = Math.max(2, ts / 26);
      for (const [dx, dy, x0, y0, x1, y1] of [[0, -1, 0, 0, 1, 0], [1, 0, 1, 0, 1, 1], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1]]) {
        if (inA.has((y + dy) * w.w + World.wx(w, x + dx))) continue;
        ctx.beginPath(); ctx.moveTo(P.x + x0 * ts, P.y + y0 * ts); ctx.lineTo(P.x + x1 * ts, P.y + y1 * ts); ctx.stroke();
      }
      if (!top || P.y < top.y || (P.y === top.y && P.x < top.x)) top = P;
    }
    if (top && a.label) {
      const H = MapView.hover, C = pos(H.x + MapView.wrapNear(H.x), H.y), fs = Math.max(11, Math.min(15, ts * .2));
      ctx.font = '700 ' + fs + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(a.label).width + 12, mx = C.x + ts / 2, my = top.y - fs;
      ctx.fillStyle = 'rgba(10,12,18,.88)'; ctx.fillRect(mx - tw / 2, my - fs * .8, tw, fs * 1.6);
      ctx.fillStyle = a.warn ? '#ff9a5a' : a.hot.length ? '#ffd66e' : '#b9c3d6'; ctx.fillText(a.label, mx, my + 1); ctx.textBaseline = 'alphabetic';
    }
  },
  // zone d'une cité (conquête) : ses cases cernées d'or, celles qu'elle partage avec vos cités en rouge pulsant
  drawZone(ctx, z, pos, ts, now) {
    const w = MapView.game.world, inZ = new Set(z.tiles.map(([x, y]) => y * w.w + x)), pulse = .5 + .5 * Math.sin(now / 260);
    for (const [x, y] of z.tiles) {
      const P = pos(x + MapView.wrapNear(x), y), sh = z.shared.has(y * w.w + x);
      ctx.fillStyle = sh ? 'rgba(235,70,55,' + (.22 + .2 * pulse).toFixed(3) + ')' : 'rgba(255,214,110,.10)';
      ctx.fillRect(P.x, P.y, ts, ts);
      ctx.strokeStyle = sh ? 'rgba(255,120,100,.9)' : 'rgba(255,214,110,.85)'; ctx.lineWidth = Math.max(2, ts / 22);
      // le pourtour seulement (les côtés qui ne touchent pas une autre case de la zone), et chaque case partagée en entier
      for (const [dx, dy, x0, y0, x1, y1] of [[0, -1, 0, 0, 1, 0], [1, 0, 1, 0, 1, 1], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1]]) {
        if (!sh && inZ.has((y + dy) * w.w + World.wx(w, x + dx))) continue;
        ctx.beginPath(); ctx.moveTo(P.x + x0 * ts, P.y + y0 * ts); ctx.lineTo(P.x + x1 * ts, P.y + y1 * ts); ctx.stroke();
      }
    }
  },
  drawThreats(ctx, p, pos, ts, now) {
    for (const t of MapView.threats(p)) {
      const A = pos(t.sx + MapView.wrapNear(t.sx), t.sy), B = pos(t.city.x + MapView.wrapNear(t.city.x), t.city.y);
      const ax = A.x + ts / 2, ay = A.y + ts / 2, bx = B.x + ts / 2, by = B.y + ts / 2;
      const L = Math.hypot(bx - ax, by - ay); if (L < ts * .8) continue;
      const ux = (bx - ax) / L, uy = (by - ay) / L, sx = ax + ux * ts * .45, sy = ay + uy * ts * .45, ex = bx - ux * ts * .5, ey = by - uy * ts * .5;
      const col = t.ratio >= 1 ? '255,86,72' : t.ratio >= .5 ? '255,170,60' : '230,214,140';
      ctx.save();
      ctx.strokeStyle = 'rgba(' + col + ',.85)'; ctx.lineWidth = Math.max(2, ts / 20); ctx.setLineDash([ts / 7, ts / 10]); ctx.lineDashOffset = -now / 60;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      const hs = Math.max(7, ts * .16);
      ctx.fillStyle = 'rgba(' + col + ',.95)'; ctx.beginPath(); ctx.moveTo(ex + ux * hs * .4, ey + uy * hs * .4); ctx.lineTo(ex - ux * hs + uy * hs * .6, ey - uy * hs - ux * hs * .6); ctx.lineTo(ex - ux * hs - uy * hs * .6, ey - uy * hs + ux * hs * .6); ctx.closePath(); ctx.fill();
      const label = U.n(t.eta, 'tour') + ' · force ' + MapView.ratioText(t.ratio), fs = Math.max(11, Math.min(15, ts * .21));
      ctx.font = '700 ' + fs + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const mx = (sx + ex) / 2, my = (sy + ey) / 2, tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(10,10,14,.85)'; ctx.fillRect(mx - tw / 2, my - fs * .75, tw, fs * 1.5);
      ctx.fillStyle = 'rgb(' + col + ')'; ctx.fillText(label, mx, my + 1);
      ctx.restore();
    }
  },
  // zones de 21 cases des cités connues, cases où l'on ne peut pas fonder, aperçu de la case survolée
  drawSettlerZones(ctx, sv, pos, ts, x0, x1, y0, y1, ex) {
    const game = MapView.game, world = game.world, W = world.w;
    ctx.save();
    // cases interdites (trop près d'une cité, territoire étranger)
    ctx.fillStyle = 'rgba(190,30,30,.2)'; ctx.strokeStyle = 'rgba(255,95,95,.5)'; ctx.lineWidth = Math.max(1, ts / 40);
    for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
      const x = World.wx(world, xx), i = y * W + x;
      if (!ex[i] || !sv.forbid[i]) continue;
      const P = pos(xx, y); ctx.fillRect(P.x, P.y, ts, ts);
      ctx.beginPath(); for (let k = 1; k < 4; k++) { ctx.moveTo(P.x + ts * k / 4, P.y); ctx.lineTo(P.x, P.y + ts * k / 4); ctx.moveTo(P.x + ts, P.y + ts * k / 4); ctx.lineTo(P.x + ts * k / 4, P.y + ts); } ctx.stroke();
    }
    const zoneEdges = (cx, cy, col, dash) => {
      const inZ = (dx, dy) => Math.abs(dx) <= 2 && Math.abs(dy) <= 2 && !(Math.abs(dx) === 2 && Math.abs(dy) === 2);
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, ts / 26); ctx.setLineDash(dash || []);
      ctx.beginPath();
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!inZ(dx, dy) || !World.inY(world, cy + dy)) continue;
        const P = pos(cx + dx + MapView.wrapNear(cx + dx), cy + dy);
        if (!inZ(dx, dy - 1)) { ctx.moveTo(P.x, P.y); ctx.lineTo(P.x + ts, P.y); }
        if (!inZ(dx, dy + 1)) { ctx.moveTo(P.x, P.y + ts); ctx.lineTo(P.x + ts, P.y + ts); }
        if (!inZ(dx - 1, dy)) { ctx.moveTo(P.x, P.y); ctx.lineTo(P.x, P.y + ts); }
        if (!inZ(dx + 1, dy)) { ctx.moveTo(P.x + ts, P.y); ctx.lineTo(P.x + ts, P.y + ts); }
      }
      ctx.stroke(); ctx.setLineDash([]);
    };
    for (const c of Object.values(game.cities)) {
      if (c.plane !== sv.plane || !ex[c.y * W + c.x]) continue;
      const pl = game.players[c.owner], col = pl ? pl.color : '#b8b8b8';
      ctx.fillStyle = col + '30';
      for (const [x, y] of World.catchment(world, c.x, c.y)) { const P = pos(x + MapView.wrapNear(x), y); ctx.fillRect(P.x, P.y, ts, ts); }
      zoneEdges(c.x, c.y, col + 'cc');
    }
    MapView._zoneEdges = zoneEdges;
    ctx.restore();
  },
  // aperçu de la cité qu'on fonderait sur la case survolée (dessiné par-dessus le brouillard) :
  // cases partagées avec une cité voisine en orange vif, marquées ½, et une étiquette qui dit avec qui
  drawSettlerHover(ctx, sv, pos, ts, ex) {
    const game = MapView.game, world = game.world, W = world.w, hv = MapView.hover;
    if (!hv || !ex[hv.y * W + hv.x] || World.isWaterAt(world, sv.plane, hv.x, hv.y)) return;
    const ok = !sv.forbid[hv.y * W + hv.x];
    const near = Object.values(game.cities).filter(o => o.plane === sv.plane && ex[o.y * W + o.x] && Math.abs(World.dxw(world, o.x, hv.x)) <= 5 && Math.abs(o.y - hv.y) <= 5);
    const inZone = (o, x, y) => { const dx = Math.abs(World.dxw(world, o.x, x)), dy = Math.abs(o.y - y); return dx <= 2 && dy <= 2 && !(dx === 2 && dy === 2); };
    const shared = new Set(), withC = new Map();
    if (ok) for (const [x, y] of World.catchment(world, hv.x, hv.y)) {
      if (!ex[y * W + x]) continue;
      const o = near.find(c => inZone(c, x, y)); if (!o) continue;
      shared.add(y * W + x); withC.set(o.id, o);
    }
    ctx.save();
    const lw = Math.max(2.5, ts / 16);
    for (const k of shared) {
      const x = k % W, y = (k - x) / W, P = pos(x + MapView.wrapNear(x), y);
      ctx.fillStyle = 'rgba(255,128,20,.5)'; ctx.fillRect(P.x, P.y, ts, ts);
      // contour de la zone de chevauchement
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = lw; ctx.beginPath();
      const has = (dx, dy) => { const ny = y + dy; return ny >= 0 && ny < world.h && shared.has(ny * W + World.wx(world, x + dx)); };
      if (!has(0, -1)) { ctx.moveTo(P.x, P.y); ctx.lineTo(P.x + ts, P.y); }
      if (!has(0, 1)) { ctx.moveTo(P.x, P.y + ts); ctx.lineTo(P.x + ts, P.y + ts); }
      if (!has(-1, 0)) { ctx.moveTo(P.x, P.y); ctx.lineTo(P.x, P.y + ts); }
      if (!has(1, 0)) { ctx.moveTo(P.x + ts, P.y); ctx.lineTo(P.x + ts, P.y + ts); }
      ctx.stroke();
      // pastille ½ : la case ne rapporte que la moitié à chacune des deux cités
      const r = Math.max(9, ts * .2), cx = P.x + ts / 2, cy = P.y + ts / 2;
      ctx.fillStyle = 'rgba(20,10,0,.85)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffd08a'; ctx.font = '800 ' + Math.round(r * 1.15) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('½', cx, cy + 1);
    }
    MapView._zoneEdges && MapView._zoneEdges(hv.x, hv.y, !ok ? 'rgba(255,110,110,.95)' : shared.size ? '#ffb347' : 'rgba(255,255,255,.9)', [ts / 7, ts / 9]);
    // étiquette au-dessus de la zone
    let label = null, col = '#ffd08a';
    if (!ok) { label = Cities.canFoundAt(game, App.pid, sv.plane, hv.x, hv.y).why || 'Fondation impossible ici'; col = '#ff9a9a'; }
    else if (shared.size) {
      const names = [...withC.values()].map(c => c.name);
      label = shared.size + (shared.size > 1 ? ' cases partagées avec ' : ' case partagée avec ') + (names.length > 1 ? names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1] : names[0]) + ' : rendement divisé par deux';
    }
    if (label) {
      const P = pos(hv.x + MapView.wrapNear(hv.x), hv.y - 2), fs = Math.max(12, Math.min(15, ts * .2));
      ctx.font = '700 ' + fs + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const tw = ctx.measureText(label).width + 16, cx = P.x + ts / 2, y = Math.max(fs + 12, P.y - fs - 14);
      ctx.fillStyle = 'rgba(12,10,8,.92)'; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - tw / 2, y, tw, fs + 10, 6) : ctx.rect(cx - tw / 2, y, tw, fs + 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(label, cx, y + fs + 3);
    }
    ctx.restore();
  },
  drawSettlerSites(ctx, sv, pos, ts, now) {
    const pulse = .5 + .5 * Math.sin(now / 420);
    sv.sites.forEach((s, i) => {
      const P = pos(s.x + MapView.wrapNear(s.x), s.y), cx = P.x + ts / 2, cy = P.y + ts / 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,214,110,' + (.55 + .45 * pulse) + ')'; ctx.lineWidth = Math.max(2.5, ts / 18);
      ctx.beginPath(); ctx.ellipse(cx, cy + ts * .16, ts * .48, ts * .3, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,214,110,.16)'; ctx.fill();
      // étoile
      const r = Math.max(8, ts * .17), sx = cx, sy = P.y + ts * .32;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * .45 : r; ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.fillStyle = i === 0 ? '#ffd66e' : '#f2e3b5'; ctx.strokeStyle = 'rgba(40,24,0,.8)'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
      // étiquette : population maximale
      const fs = Math.max(11, Math.min(15, ts * .22)); ctx.font = '700 ' + fs + 'px system-ui'; ctx.textAlign = 'center';
      const label = 'pop. max ' + s.maxPop, sh = s.shared ? (s.shared > 1 ? s.shared + ' cases partagées' : '1 case partagée') : '';
      const tw = Math.max(ctx.measureText(label).width, sh ? ctx.measureText(sh).width * .86 : 0) + 8;
      ctx.fillStyle = 'rgba(10,12,18,.85)'; ctx.fillRect(cx - tw / 2, P.y + ts * .62, tw, (fs + 4) * (sh ? 1.85 : 1));
      ctx.fillStyle = '#ffd66e'; ctx.fillText(label, cx, P.y + ts * .62 + fs);
      if (sh) { ctx.font = '700 ' + Math.round(fs * .86) + 'px system-ui'; ctx.fillStyle = '#ffa040'; ctx.fillText(sh, cx, P.y + ts * .62 + fs * 1.95 + 2); }
      ctx.restore();
    });
  },
  exploredCount(ex) { let n = 0; for (let i = 0; i < ex.length; i += 7) n += ex[i] ? 1 : 0; return n + ':' + ex.length; },
  visKey() { const g = MapView.game; return g.turn * 100000 + Object.keys(g.units).length * 7 + (MapView._visBump || 0); },
  bumpVis() { MapView._visBump = (MapView._visBump || 0) + 1; },
  wrapNear(x) { const w = MapView.game.world.w; let d = x - MapView.camX; if (d > w / 2) return -w; if (d < -w / 2) return w; return 0; },
  isAdjacentToMine(u) { for (const o of Object.values(MapView.game.units)) if (o.owner === MapView.pid && o.plane === u.plane && World.dist(MapView.game.world, o.x, o.y, u.x, u.y) <= 1) return true; return false; },
  topUnit(units) {
    return U.max(units, u => (u.riteDemon ? 3000 : 0) + (u.nemesis ? 2000 : 0) + (u.hero ? 1000 : 0) + Units.strength(MapView.game, u) * (Units.isSettler(u) ? 0.1 : 1));
  },
  drawUnit(ctx, u, n, x, y, ts, inCity, selected, walkT, frozen) {
    const game = MapView.game;
    const pl = game.players[u.owner];
    const col = pl ? pl.color : '#8a8a8a';
    if (Sprites.hasHD(Sprites.resolve(Sprites.unitKey(u)) || '')) {
      // figurine debout sur un socle aux couleurs du propriétaire
      const cx = x + ts * (inCity ? .2 : .5), base = y + ts * (inCity ? .62 : .86), sz = ts * (inCity ? .8 : 1.02);
      const rx = ts * (inCity ? .23 : .34), ry = rx * .42;
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(cx + 1.5, base + 1.5, rx, ry, 0, 0, 7); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, base, rx, ry, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 1.2; ctx.stroke();
      if (u.avatar) { ctx.strokeStyle = 'rgba(255,214,110,' + (.6 + .3 * Math.sin(performance.now() / 400)) + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(cx, base, rx * 1.45, ry * 1.5, 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = 'rgba(10,14,20,.4)'; ctx.beginPath(); ctx.ellipse(cx, base - ry * .12, rx * .62, ry * .58, 0, 0, 7); ctx.fill();
      if (selected) {
        const t = (performance.now() / 600) % 1;
        ctx.strokeStyle = 'rgba(255,230,140,' + (0.55 + 0.45 * Math.sin(t * Math.PI * 2)) + ')'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(cx, base, rx * 1.25, ry * 1.3, 0, 0, 7); ctx.stroke();
      }
      const spent = u.moves <= 0 && u.owner === MapView.pid;
      if (spent) ctx.filter = 'saturate(.35) brightness(.75)';
      // figurine animée (repos en boucle, marche pendant un déplacement) ou fixe ; tournée vers la droite après un pas vers l'est
      const flip = MapView.face[u.id] === 1;
      // armes magiques : la figurine luit
      const grgb = UI.weaponGlow(game, u), glow = grgb ? { rgb: grgb, alpha: 1.25 + .3 * Math.sin(performance.now() / 520 + u.id) } : null;
      if (Anim.has(Sprites.lookOf(u))) Anim.draw(ctx, Sprites.lookOf(u), walkT != null ? 'walk' : 'idle', walkT != null ? walkT : performance.now() + u.id * 397, cx, base + ry * .35, sz, flip, glow);
      else if (flip) { ctx.save(); ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); Sprites.drawFoot(ctx, Sprites.unitKey(u), cx, base + ry * .35, sz, glow); ctx.restore(); }
      else Sprites.drawFoot(ctx, Sprites.unitKey(u), cx, base + ry * .35, sz, glow);
      ctx.filter = 'none';
      // troupes d'un autre sorcier (ou pillards, monstres) : un fanion à ses couleurs, pour ne pas les confondre avec les vôtres
      if (u.owner !== MapView.pid && ts >= 20) {
        const px = cx - rx * .95, top = base - sz * .95, ph = sz * .42, fw = Math.max(8, ts * .26), fh = Math.max(6, ts * .17);
        ctx.strokeStyle = 'rgba(30,22,14,.95)'; ctx.lineWidth = Math.max(1.5, ts / 40);
        ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + ph); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px + fw, top + fh / 2); ctx.lineTo(px, top + fh); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1; ctx.stroke();
      }
      const fs = Math.max(9, ts * .2);
      // le Démon légendaire du pacte : reconnaissable entre tous les seigneurs démons (et la cible du pacte qu'il traque)
      if (u.riteDemon && ts >= 20) {
        ctx.strokeStyle = 'rgba(190,120,255,.95)'; ctx.lineWidth = Math.max(2, ts / 24); ctx.beginPath(); ctx.ellipse(cx, base, rx * 1.15, ry * 1.15, 0, 0, 7); ctx.stroke();
        const ra = typeof Rite !== 'undefined' && Rite.active(MapView.game), lab = 'Démon légendaire' + (ra && ra.target === MapView.pid ? ' · contre vous' : '');
        ctx.font = 'bold ' + Math.round(fs * .9) + 'px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,14,.9)';
        ctx.strokeText(lab, cx, base + ry + fs); ctx.fillStyle = '#d6a8ff'; ctx.fillText(lab, cx, base + ry + fs);
      }
      // une némésis : cercle rouge et son nom ; la vôtre (une de vos unités qui a abattu un héros ennemi) en or
      if (u.nemesis && ts >= 20 && !u.riteDemon) {
        const mine = u.owner === MapView.pid;
        ctx.strokeStyle = mine ? 'rgba(235,190,80,.95)' : 'rgba(225,40,40,.95)'; ctx.lineWidth = Math.max(2, ts / 26); ctx.beginPath(); ctx.ellipse(cx, base, rx * 1.12, ry * 1.12, 0, 0, 7); ctx.stroke();
        ctx.font = 'bold ' + Math.round(fs * .95) + 'px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,6,.9)';
        ctx.strokeText(u.nemesis.name, cx, base + ry + fs); ctx.fillStyle = mine ? '#f3cf6e' : '#ff6a5a'; ctx.fillText(u.nemesis.name, cx, base + ry + fs);
      }
      if (n > 1) {
        const bx = cx + rx * .7, by = base - sz * .72, r = Math.max(7, ts * .14);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(r * 1.25) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n, bx, by + .5); ctx.textBaseline = 'alphabetic';
      }
      const tag = u.stasis || frozen ? ['❄', '#a8e8ff'] : u.status === 'sentry' || u.status === 'fortify' ? ['S', '#9fd0ff'] : u.status === 'heal' ? ['+', '#7fe08a'] : u.status === 'governor' ? ['G', '#ffd27a'] : u.status === 'explore' ? ['E', '#a8e6a0'] : u.status === 'road' ? ['R', '#f0c060'] : u.status === 'roadto' ? ['R→', '#f0c060'] : u.status === 'purify' ? ['P', '#f0c060'] : u.status === 'autopurify' ? ['P+', '#f0c060'] : null;
      if (tag) { ctx.font = 'bold ' + fs + 'px system-ui'; const tw = Math.max(fs * .65, ctx.measureText(tag[0]).width); ctx.fillStyle = 'rgba(8,10,14,.8)'; ctx.fillRect(cx - rx - fs * .2, base - fs * 1.1, tw + fs * .4, fs * 1.15); ctx.fillStyle = tag[1]; ctx.textAlign = 'left'; ctx.fillText(tag[0], cx - rx, base - fs * .2); }
      return;
    }
    const pad = ts * (inCity ? .31 : .08), s = ts - pad * 2;
    const ox = inCity ? -ts * .42 : 0, oy = inCity ? -ts * .3 : 0;
    // socle aux couleurs du propriétaire
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x + pad + ox + 2, y + pad + oy + 2, s, s);
    ctx.fillStyle = col; ctx.fillRect(x + pad + ox, y + pad + oy, s, s);
    ctx.fillStyle = 'rgba(10,14,20,.78)'; ctx.fillRect(x + pad + ox + 2, y + pad + oy + 2, s - 4, s - 4);
    Sprites.draw(ctx, Sprites.unitKey(u), x + pad + ox + 2, y + pad + oy + 2, s - 4, s - 4);
    if (u.moves <= 0 && u.owner === MapView.pid) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + pad + ox + 2, y + pad + oy + 2, s - 4, s - 4); }
    if (n > 1) {
      ctx.fillStyle = col; ctx.fillRect(x + pad + ox + s - ts * .3, y + pad + oy + s - ts * .28, ts * .3, ts * .28);
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(9, ts * .22) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n, x + pad + ox + s - ts * .15, y + pad + oy + s - ts * .14); ctx.textBaseline = 'alphabetic';
    }
    if (u.stasis || frozen) { ctx.fillStyle = '#a8e8ff'; ctx.font = 'bold ' + Math.max(9, ts * .2) + 'px system-ui'; ctx.textAlign = 'left'; ctx.fillText('❄', x + pad + ox + 3, y + pad + oy + ts * .22); }
    else if (u.status === 'sentry' || u.status === 'fortify') { ctx.fillStyle = '#9fd0ff'; ctx.font = 'bold ' + Math.max(9, ts * .2) + 'px system-ui'; ctx.textAlign = 'left'; ctx.fillText('S', x + pad + ox + 3, y + pad + oy + ts * .22); }
    if (u.status === 'explore') { ctx.fillStyle = '#a8e6a0'; ctx.font = 'bold ' + Math.max(9, ts * .2) + 'px system-ui'; ctx.textAlign = 'left'; ctx.fillText('E', x + pad + ox + 3, y + pad + oy + ts * .22); }
    if (u.status === 'road' || u.status === 'roadto' || u.status === 'purify' || u.status === 'autopurify') { ctx.fillStyle = '#f0c060'; ctx.font = 'bold ' + Math.max(9, ts * .2) + 'px system-ui'; ctx.textAlign = 'left'; ctx.fillText(u.status === 'road' ? 'R' : u.status === 'roadto' ? 'R→' : u.status === 'autopurify' ? 'P+' : 'P', x + pad + ox + 3, y + pad + oy + ts * .22); }
    if (selected) {
      const t = (performance.now() / 600) % 1;
      ctx.strokeStyle = 'rgba(255,230,140,' + (0.55 + 0.45 * Math.sin(t * Math.PI * 2)) + ')'; ctx.lineWidth = 2.5;
      ctx.strokeRect(x + pad + ox - 2, y + pad + oy - 2, s + 4, s + 4);
    }
  },
  drawCity(ctx, c, x, y, ts) {
    const game = MapView.game;
    const pl = game.players[c.owner];
    const col = pl ? pl.color : '#9a9a9a';
    const N = Cities.citizens(c);
    if (Sprites.hasHD('city:1')) {
      const tier = N < 1 ? 0 : N <= 4 ? 1 : N <= 8 ? 2 : N <= 12 ? 3 : N <= 16 ? 4 : 5;
      const sz = ts * [0.92, 1.06, 1.24, 1.42, 1.6, 1.78][tier];
      // sol de la cité aux couleurs du propriétaire
      ctx.fillStyle = col + '40'; ctx.beginPath(); ctx.ellipse(x + ts / 2, y + ts * .78, sz * .44, sz * .2, 0, 0, 7); ctx.fill();
      // la tour du sorcier se dresse derrière la ville
      if (c.fortress) Sprites.drawFoot(ctx, 'city:fortress', x + ts * .74, y + ts * .62, ts * .95);
      // la cité de son peuple quand elle est dessinée (sinon la cité commune) ; sa muraille l'entoure : moitié arrière avant les maisons, moitié avant après
      const rk = 'city:' + c.race + ':', own = Sprites.hasHD(rk + tier), wk = own && Sprites.hasHD(rk + 'walls') ? rk + 'walls' : 'city:walls';
      const walls = c.buildings.cityWalls || Cities.hasEnch(c, 'wall_of_stone'), wsz = sz * (own ? 1.18 : 1.08), wy = y + ts * 1.06;
      const half = front => { ctx.save(); ctx.beginPath(); ctx.rect(x - wsz, front ? wy - wsz * .42 : wy - wsz * 1.2, wsz * 3, front ? wsz : wsz * .78); ctx.clip(); Sprites.drawFoot(ctx, wk, x + ts / 2, wy, wsz); ctx.restore(); };
      if (walls) own ? half(false) : Sprites.drawFoot(ctx, wk, x + ts / 2, wy, wsz);
      Sprites.drawFoot(ctx, own ? rk + tier : 'city:' + tier, x + ts / 2, y + ts * 1.0, sz);
      if (walls && own) half(true);
      MapView.cityLabel(ctx, c, x, y + ts * .06, ts, col, N);
      return;
    }
    const houses = Math.min(9, 2 + Math.floor(N / 2));
    const h = Tiles.hash(c.x, c.y, 3);
    const u = ts / 32;
    // murailles
    if (c.buildings.cityWalls) { ctx.strokeStyle = '#8d8a84'; ctx.lineWidth = 2.5 * u; ctx.strokeRect(x + 2 * u, y + 2 * u, ts - 4 * u, ts - 4 * u); ctx.fillStyle = '#6f6c66'; for (const [a, b] of [[2, 2], [27, 2], [2, 27], [27, 27]]) ctx.fillRect(x + a * u - u, y + b * u - u, 5 * u, 5 * u); }
    const spots = [[5, 15], [16, 17], [10, 7], [21, 8], [4, 23], [13, 23], [22, 22], [16, 3], [6, 3]];
    for (let i = 0; i < houses; i++) {
      const [hx, hy] = spots[(i + h) % spots.length];
      const w = 7 * u, hh = 6 * u;
      ctx.fillStyle = '#d8c7a2'; ctx.fillRect(x + hx * u, y + (hy + 3) * u, w, hh);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + hx * u + w * .6, y + (hy + 3) * u, w * .4, hh);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + (hx - 1) * u, y + (hy + 3.5) * u); ctx.lineTo(x + (hx + 3.5) * u, y + (hy - 0.5) * u); ctx.lineTo(x + (hx + 8) * u, y + (hy + 3.5) * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x + (hx + 3) * u, y + (hy + 6) * u, 1.5 * u, 3 * u);
    }
    if (c.fortress) {
      ctx.fillStyle = '#b8b2a6'; ctx.fillRect(x + 12 * u, y + 4 * u, 8 * u, 16 * u);
      ctx.fillStyle = '#8c867a'; ctx.fillRect(x + 16 * u, y + 4 * u, 4 * u, 16 * u);
      ctx.fillStyle = '#b8b2a6'; for (let i = 0; i < 4; i++) ctx.fillRect(x + (12 + i * 2.3) * u, y + 2 * u, 1.4 * u, 2 * u);
      ctx.fillStyle = col; ctx.fillRect(x + 16 * u, y - 4 * u, 1 * u, 7 * u); ctx.fillRect(x + 17 * u, y - 4 * u, 5 * u, 3.5 * u);
    }
    MapView.cityLabel(ctx, c, x, y, ts, col, N);
  },
  cityLabel(ctx, c, x, y, ts, col, N) {
    const fs = Math.max(10, Math.min(15, ts * .28));
    ctx.font = '600 ' + fs + 'px ' + 'Palatino Linotype, Georgia, serif';
    const label = c.name + '  ' + N;
    // la capitale (forteresse du sorcier) : une étoile d'or devant le nom, un cadre doré autour de l'étiquette
    const cap = !!c.fortress, star = cap ? fs + 2 : 0;
    // le cercle d'invocation, quand vous l'avez déplacé hors de la capitale : un anneau violet
    const pl = MapView.game.players[c.owner];
    const circle = !cap && c.owner === MapView.pid && pl && pl.summonCity === c.id, ring = circle ? fs : 0;
    const tw = ctx.measureText(label).width + 10 + star + ring;
    const lx = x + ts / 2 - tw / 2, ly = y + ts + 1;
    ctx.fillStyle = 'rgba(8,10,14,.85)'; ctx.fillRect(lx, ly, tw, fs + 5);
    if (cap) { ctx.strokeStyle = '#e6b450'; ctx.lineWidth = 1.2; ctx.strokeRect(lx + .5, ly + .5, tw - 1, fs + 4); }
    ctx.fillStyle = col; ctx.fillRect(lx, ly, 3, fs + 5);
    if (cap) MapView.star(ctx, lx + 6 + star / 2 - 1, ly + (fs + 5) / 2, fs * .52);
    if (circle) { ctx.strokeStyle = '#c48cff'; ctx.lineWidth = Math.max(1.5, fs * .16); ctx.beginPath(); ctx.arc(lx + 6 + fs * .4, ly + (fs + 5) / 2, fs * .3, 0, 7); ctx.stroke(); }
    const tx = lx + 6 + star + ring;
    ctx.fillStyle = cap ? '#ffe9a8' : '#f0e8d4'; ctx.textAlign = 'left'; ctx.fillText(c.name, tx, ly + fs);
    ctx.fillStyle = '#e6b450'; ctx.fillText(N, tx + ctx.measureText(c.name + '  ').width, ly + fs);
    if (c.owner === MapView.pid && ts >= 22) MapView.cityStatus(ctx, c, lx, ly + fs + 5, tw, fs);
    // enchantements de la cité (pastilles aux couleurs du royaume) et malédictions (losanges rouges), à droite de l'étiquette
    const en = MapView.cityEnchSeen(c);
    if (en.length) {
      const r = Math.max(3, fs * .27), cy = ly + (fs + 5) / 2; let dx = lx + tw + 3;
      for (const e of en.slice(0, 6)) {
        const sp = DATA.spells[e.spell], curse = sp.kind === 'cityCurse';
        ctx.beginPath();
        if (curse) { ctx.moveTo(dx + r, cy - r * 1.15); ctx.lineTo(dx + r * 2.1, cy); ctx.lineTo(dx + r, cy + r * 1.15); ctx.lineTo(dx - .1 * r, cy); ctx.closePath(); }
        else ctx.arc(dx + r, cy, r, 0, 7);
        ctx.fillStyle = curse ? '#d8342c' : (REALM_COLORS[sp.realm] || '#cfc8b8'); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineWidth = 1.2; ctx.stroke();
        dx += r * 2 + 3;
      }
    }
  },
  // les sorts d'une cité qu'on connaît : les siens toujours ; ceux d'une cité étrangère quand on la voit
  cityEnchSeen(c) {
    const en = (c.ench || []).filter(e => DATA.spells[e.spell]); if (!en.length) return en;
    if (c.owner === MapView.pid) return en;
    const w = MapView.game.world, v = MapView.vis && MapView.vis[c.plane];
    return v && v[c.y * w.w + c.x] ? en : [];
  },
  // étoile à cinq branches, dorée et cernée de sombre (dessinée, pour ne pas dépendre des polices)
  star(ctx, cx, cy, r, fill) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fillStyle = fill || '#f5c542'; ctx.fill();
    ctx.strokeStyle = 'rgba(40,24,0,.9)'; ctx.lineWidth = Math.max(1, r * .18); ctx.stroke();
  },
  // sous le nom de vos cités : la croissance (barre verte, rouge si la cité dépérit) et la production en cours
  cityInfo(c) {
    const cache = MapView._cinfo || (MapView._cinfo = new Map()), now = performance.now(), hit = cache.get(c.id);
    if (hit && now - hit.t < 600 && hit.pop === c.pop && hit.prog === c.progress && hit.prod === c.prod) return hit;
    const game = MapView.game, e = Cities.econ(game, c);
    const cost = Cities.prodCost(game, c, e), turns = cost ? Cities.turnsLeft(game, c, e) : null;
    const frac = (c.pop % 1000) / 1000, g = e.growth;
    const toGrow = g > 0 ? Math.ceil((1000 - c.pop % 1000) / g) : g < 0 ? Math.ceil((c.pop % 1000 + 1) / -g) : null;
    const info = { t: now, pop: c.pop, prog: c.progress, prod: c.prod, growth: g, frac, toGrow, max: g === 0 && Cities.citizens(c) >= e.maxPop, starving: e.foodSurplus < 0, cost, turns, name: Cities.prodName(c),
      icon: c.prod.type === 'rearm' ? 'item:sword:1' : c.prod.type === 'unit' ? 'unit:' + c.prod.id : c.prod.type === 'building' ? (Sprites.hasHD(Sprites.resolve('bld:' + c.prod.id) || '') ? 'bld:' + c.prod.id : (typeof BUILDING_ICON !== 'undefined' && BUILDING_ICON[c.prod.id]) || 'item:misc') : null };
    cache.set(c.id, info);
    return info;
  },
  cityStatus(ctx, c, lx, y, tw, fs) {
    const inf = MapView.cityInfo(c);
    // barre de croissance
    const bh = Math.max(3, fs * .3);
    ctx.fillStyle = 'rgba(8,10,14,.85)'; ctx.fillRect(lx, y - 1, tw, bh + 2);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(lx + 1, y, tw - 2, bh);
    if (inf.growth < 0) {
      // la cité dépérit : la barre rouge se vide jusqu'à la perte d'un citoyen
      ctx.fillStyle = (performance.now() / 500 | 0) % 2 ? '#ff5a4a' : '#c23a30'; ctx.fillRect(lx + 1, y, (tw - 2) * Math.max(.04, inf.frac), bh);
    } else {
      ctx.fillStyle = inf.max ? '#8d8a80' : '#7bd36a'; ctx.fillRect(lx + 1, y, (tw - 2) * (inf.max ? 1 : inf.frac), bh);
    }
    // production
    const py = y + bh + 2, ph = Math.round(fs * 1.25);
    const fs2 = Math.max(9, Math.round(fs * .78));
    ctx.font = '600 ' + fs2 + 'px ' + 'system-ui, sans-serif';
    const short = inf.name.length > 18 ? inf.name.slice(0, 17) + '…' : inf.name;
    const tail = inf.cost ? (inf.turns === Infinity ? ' · ∞' : ' · ' + inf.turns) : '';
    const iw = inf.icon ? ph : 0;
    const w = Math.max(tw, iw + ctx.measureText(short + tail).width + 10);
    ctx.fillStyle = 'rgba(8,10,14,.78)'; ctx.fillRect(lx, py, w, ph);
    if (inf.icon) Sprites.draw(ctx, inf.icon, lx + 2, py, ph, ph);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = inf.cost ? '#e9dcc0' : '#9aa4b5'; ctx.fillText(short, lx + iw + 5, py + ph * .5 + fs2 * .36);
    if (tail) { ctx.fillStyle = '#e6b450'; ctx.fillText(tail, lx + iw + 5 + ctx.measureText(short).width, py + ph * .5 + fs2 * .36); }
  },
  floatText(plane, x, y, text, color) { if (text) MapView.floats.push({ plane, x, y, text, color: color || '#ffd27a', t0: performance.now(), dur: 1900 }); },
  // trouvaille : image dédiée si elle existe, sinon une lueur au sol et une étincelle qui scintille
  drawCache(ctx, cc, x, y, ts, now) {
    const col = CACHE_COLORS[cc.kind] || '#ffd54a', key = 'cache:' + cc.kind, hd = Sprites.hasHD(key);
    const cx = x + ts * .5, cy = y + ts * .66;
    const ph = (now / 1600 + ((cc.x * 7 + cc.y * 13) % 10) / 10) % 1, pulse = .5 + .5 * Math.sin(ph * Math.PI * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // lueur au sol
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * .44);
    g.addColorStop(0, col + 'cc'); g.addColorStop(.5, col + '44'); g.addColorStop(1, col + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, ts * .44, ts * .25, 0, 0, 7); ctx.fill();
    // colonne de lumière, comme un objet à ramasser
    const top = cy - ts * (.95 + .08 * pulse);
    const lg = ctx.createLinearGradient(0, cy, 0, top);
    lg.addColorStop(0, col + 'aa'); lg.addColorStop(.6, col + '33'); lg.addColorStop(1, col + '00');
    ctx.fillStyle = lg; const bw = ts * (.09 + .02 * pulse);
    ctx.beginPath(); ctx.moveTo(cx - bw, cy); ctx.lineTo(cx - bw * .45, top); ctx.lineTo(cx + bw * .45, top); ctx.lineTo(cx + bw, cy); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (hd) Sprites.drawFoot(ctx, key, cx, y + ts * .88, ts * .64);
    else {
      // pierre précieuse stylisée en attendant l'image dédiée
      const r = ts * .125;
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(20,14,6,.85)'; ctx.lineWidth = Math.max(1.2, ts / 45);
      ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.5); ctx.lineTo(cx + r, cy - r * .3); ctx.lineTo(cx, cy + r * .7); ctx.lineTo(cx - r, cy - r * .3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.5); ctx.lineTo(cx + r * .45, cy - r * .55); ctx.lineTo(cx, cy - r * .3); ctx.closePath(); ctx.fill();
    }
    // étincelles
    const star = (sx, sy, rr, a) => {
      if (rr <= .5 || a <= 0) return;
      ctx.save(); ctx.globalAlpha = a; ctx.shadowColor = col; ctx.shadowBlur = rr * 1.8; ctx.fillStyle = '#fffbe8';
      ctx.beginPath(); ctx.moveTo(sx, sy - rr); ctx.quadraticCurveTo(sx, sy, sx + rr, sy); ctx.quadraticCurveTo(sx, sy, sx, sy + rr); ctx.quadraticCurveTo(sx, sy, sx - rr, sy); ctx.quadraticCurveTo(sx, sy, sx, sy - rr); ctx.fill();
      ctx.restore();
    };
    star(cx + ts * .04, top + ts * .12, ts * (.09 + .08 * pulse), .65 + .35 * pulse);
    const ph2 = (ph + .5) % 1, tw2 = Math.max(0, Math.sin(ph2 * Math.PI * 2));
    star(cx - ts * .2, cy - ts * .3, ts * .07 * tw2, tw2);
    star(cx + ts * .22, cy - ts * .12, ts * .05 * Math.max(0, Math.sin((ph + .25) * Math.PI * 2)), .9);
  },
  drawResources(ctx, game, p, ex, x0, x1, y0, y1, pos, ts) {
    const world = game.world, glow = { iron: '200,100,60', coal: '120,120,130', silver: '220,230,245', gold: '255,210,80', gems: '235,90,170', mithril: '140,210,255',
      adamantium: '150,110,255', quork: '255,110,215', crysx: '110,240,255', nightshade: '190,100,255', wildGame: '220,170,100' };
    for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
      const x = World.wx(world, xx), i = y * world.w + x;
      if (!ex[i]) continue;
      const m = MIN_KEYS[world.planes[p].mineral[i]]; if (!m) continue;
      const key = 'min:' + m; if (!Sprites.hasHD(key)) continue;
      if (Cities.at(game, p, x, y) || World.get(world, p, 'site', x, y) >= 0) continue;
      const P = pos(xx, y), cx = P.x + ts * .5, by = P.y + ts * .92, c = glow[m] || '255,255,255';
      const g = ctx.createRadialGradient(cx, by - ts * .16, 0, cx, by - ts * .16, ts * .42);
      g.addColorStop(0, 'rgba(' + c + ',.55)'); g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, by - ts * .16, ts * .42, ts * .3, 0, 0, 7); ctx.fill();
      Sprites.drawFoot(ctx, Sprites.planeKey(key, p), cx, by, ts * .7);
    }
  },
  // aura d'un nœud lié : un voile léger et des étincelles qui s'allument et s'éteignent sur chaque case
  drawAura(ctx, s, col, pos, ts, now, ex, W, H) {
    const world = MapView.game.world, c = hexToRgb(col), t = now / 1000;
    // couleur éclaircie : un bleu sombre doit rester visible sur l'herbe
    const lite = c.map(v => Math.round(v + (255 - v) * .35)).join(','), rgb = c.join(',');
    ctx.save();
    for (const [ax, ay] of Game.aura(MapView.game, s)) {
      if (!ex[ay * world.w + ax]) continue;
      const P = pos(ax + MapView.wrapNear(ax), ay);
      if (P.x < -ts || P.x > W + ts || P.y < -ts || P.y > H + ts) continue;
      const cx = P.x + ts / 2, cy = P.y + ts / 2;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(cx, cy, ts * .05, cx, cy, ts * .8); // voile
      g.addColorStop(0, 'rgba(' + rgb + ',.42)'); g.addColorStop(.6, 'rgba(' + rgb + ',.2)'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g; ctx.fillRect(P.x - ts * .3, P.y - ts * .3, ts * 1.6, ts * 1.6);
      for (let i = 0; i < 6; i++) {
        const hsh = Math.abs(Math.imul(ax * 92821 + ay * 68917 + i * 1237 + s.id * 31, 2654435761)) >>> 0;
        const fx = .1 + (hsh % 997) / 997 * .8, fy = .1 + ((hsh >>> 10) % 991) / 991 * .8;
        const per = 1.6 + ((hsh >>> 20) % 13) / 8, ph = (hsh % 101) / 101;
        const k = Math.sin(((t / per) + ph) * Math.PI * 2);
        const px = P.x + fx * ts, py = P.y + fy * ts;
        if (k <= 0) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .6; ctx.fillStyle = 'rgb(' + lite + ')'; ctx.fillRect(px - 1, py - 1, 2, 2); continue; } // braise entre deux éclats
        const al = k * k, r = Math.max(1.6, ts * .07) * (.55 + .45 * al);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al;
        const hg = ctx.createRadialGradient(px, py, 0, px, py, r * 3.2);
        hg.addColorStop(0, 'rgba(' + rgb + ',.85)'); hg.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = hg; ctx.fillRect(px - r * 3.2, py - r * 3.2, r * 6.4, r * 6.4);
        ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgb(' + lite + ')';
        ctx.beginPath(); ctx.moveTo(px, py - r * 2); ctx.quadraticCurveTo(px, py, px + r * 2, py); ctx.quadraticCurveTo(px, py, px, py + r * 2); ctx.quadraticCurveTo(px, py, px - r * 2, py); ctx.quadraticCurveTo(px, py, px, py - r * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, r * .45, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  },
  // contour de l'aura d'un nœud (au survol, lié ou non)
  drawAuraOutline(ctx, s, pos, ts, ex) {
    const world = MapView.game.world, tiles = Game.aura(MapView.game, s), set = new Set(tiles.map(([x, y]) => y * world.w + x));
    const col = { sorcery: '120,195,255', nature: '130,240,140', chaos: '255,140,80' }[s.realm] || '230,210,255';
    ctx.save(); ctx.strokeStyle = 'rgba(' + col + ',.9)'; ctx.lineWidth = Math.max(1.5, ts / 26); ctx.setLineDash([ts / 8, ts / 12]); ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [x, y] of tiles) {
      if (!ex[y * world.w + x]) continue;
      const P = pos(x + MapView.wrapNear(x), y);
      for (const [dx, dy] of U.DIRS4) {
        const ny = y + dy;
        if (World.inY(world, ny) && set.has(ny * world.w + World.wx(world, x + dx))) continue;
        if (dx === 1) { ctx.moveTo(P.x + ts, P.y); ctx.lineTo(P.x + ts, P.y + ts); }
        else if (dx === -1) { ctx.moveTo(P.x, P.y); ctx.lineTo(P.x, P.y + ts); }
        else if (dy === 1) { ctx.moveTo(P.x, P.y + ts); ctx.lineTo(P.x + ts, P.y + ts); }
        else { ctx.moveTo(P.x, P.y); ctx.lineTo(P.x + ts, P.y); }
      }
    }
    ctx.stroke(); ctx.restore();
  },
  drawNodeGlow(ctx, s, x, y, ts, now) {
    const col = { sorcery: '110,190,255', nature: '120,235,130', chaos: '255,120,60' }[s.realm] || '220,200,255';
    const cx = x + ts / 2, cy = y + ts * .5, t = now / 1000 + s.id * .71;
    const pulse = .5 + .5 * Math.sin(t * 1.7);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, ts * .05, cx, cy, ts * (.75 + .12 * pulse));
    g.addColorStop(0, 'rgba(' + col + ',' + (.48 + .24 * pulse) + ')'); g.addColorStop(.5, 'rgba(' + col + ',.2)'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, ts * (.85 + .1 * pulse), ts * (.7 + .08 * pulse), 0, 0, 7); ctx.fill();
    // étincelles qui montent en spirale
    for (let i = 0; i < 6; i++) {
      const f = (t * .32 + i / 6) % 1, a = i * 2.4 + t * .8;
      const px = cx + Math.cos(a) * ts * (.18 + .2 * f), py = cy + ts * .2 - f * ts * .85;
      const r = Math.max(1.2, ts * .045 * (1 - f * .6)), al = Math.sin(f * Math.PI);
      ctx.globalAlpha = al; ctx.fillStyle = 'rgb(' + col + ')';
      ctx.beginPath(); ctx.moveTo(px, py - r * 1.8); ctx.quadraticCurveTo(px, py, px + r * 1.8, py); ctx.quadraticCurveTo(px, py, px, py + r * 1.8); ctx.quadraticCurveTo(px, py, px - r * 1.8, py); ctx.quadraticCurveTo(px, py, px, py - r * 1.8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, r * .45, 0, 7); ctx.fill();
    }
    ctx.restore();
  },
  // faille animée : la galaxie tourne dans la déchirure, le liseré palpite et crépite, les rochers flottent,
  // des poussières d'étoiles sont aspirées vers l'œil (calques tirés de la figurine par tools/make_rift.py)
  riftParts() {
    if (MapView._rift !== undefined) return MapView._rift;
    const meta = (window.EXTRA_META || {}).rift, base = Sprites.virt && Sprites.virt['rift:base'], rocks = Sprites.virt && Sprites.virt['rift:rocks'];
    if (!meta || !base || !rocks) return null;   // pas encore chargé : on réessaiera
    // la galaxie : un disque de la figurine autour de son œil, au bord fondu
    const R = meta.swirl, D = R * 2 + 2, disc = document.createElement('canvas'); disc.width = D; disc.height = D;
    const dx = disc.getContext('2d');
    dx.drawImage(base, meta.center[0] - R - 1, meta.center[1] - R - 1, D, D, 0, 0, D, D);
    dx.globalCompositeOperation = 'destination-in';
    const g = dx.createRadialGradient(D / 2, D / 2, R * .55, D / 2, D / 2, R);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    dx.fillStyle = g; dx.fillRect(0, 0, D, D);
    return (MapView._rift = { meta, base, rocks, disc });
  },
  drawRiftAnimated(ctx, s, cx, bottom, size, t, glow) {
    const P = MapView.riftParts(); if (!P) return false;
    const { meta, base, rocks, disc } = P;
    // la déchirure respire
    size *= 1 + .025 * Math.sin(t * 1.3);
    const k = size / meta.size[0], x0 = cx - size / 2, y0 = bottom - size;
    const ex = x0 + meta.center[0] * k, ey = y0 + meta.center[1] * k;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base, x0, y0, size, size);
    // la galaxie tourne
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(t * .8); ctx.drawImage(disc, -disc.width / 2 * k, -disc.height / 2 * k, disc.width * k, disc.height * k); ctx.restore();
    // le liseré palpite, et crépite : double éclair toutes les deux secondes environ
    const ph = (t * .5 + s.id * .13) % 1, flash = ph < .05 ? 1 - ph / .05 : ph > .09 && ph < .13 ? (1 - (ph - .09) / .04) * .7 : 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, .18 + .16 * Math.sin(t * 2.6) + .7 * flash); ctx.drawImage(base, x0, y0, size, size);
    // poussières d'étoiles aspirées vers l'œil, en spirale, avec leur traînée
    for (let i = 0; i < 14; i++) {
      const f = (t * .28 + i / 14) % 1, rr0 = size * .34;
      const at = q => { const ff = Math.min(1, f + q), a = i * 2.39 - t * 1.4 - ff * 6, rr = (1 - ff) * rr0; return [ex + Math.cos(a) * rr * .55, ey + Math.sin(a) * rr]; };
      const [px, py] = at(0), [qx, qy] = at(-.05);
      const al = Math.sin(f * Math.PI), r = Math.max(1, size * .016 * (1 - f * .4));
      ctx.globalAlpha = al * .55; ctx.strokeStyle = 'rgb(' + glow + ')'; ctx.lineWidth = r * 1.2;
      ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
      ctx.globalAlpha = al; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, r * .7, 0, 7); ctx.fill();
    }
    // étoiles qui scintillent dans la déchirure
    for (let i = 0; i < 6; i++) {
      const tw = Math.pow(Math.max(0, Math.sin(t * 1.9 + i * 2.3)), 5); if (tw < .05) continue;
      const px = ex + Math.sin(i * 4.1) * size * .1, py = ey + Math.cos(i * 2.7) * size * .26, r = size * .04 * tw;
      ctx.globalAlpha = tw; ctx.fillStyle = '#fff';
      ctx.fillRect(px - r, py - .6, r * 2, 1.2); ctx.fillRect(px - .6, py - r, 1.2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // les rochers flottent et tanguent, chacun à son rythme
    for (let i = 0; i < meta.rocks.length; i++) {
      const [sx, sy, w, h, ox, oy, area] = meta.rocks[i];
      const amp = area > 40 ? 3 : 4.5;
      const bx = Math.cos(t * .7 + i * 1.3) * 1.2, by = Math.sin(t * 1.15 + i * 1.7) * amp, rot = Math.sin(t * .9 + i * 2.1) * .14;
      const qx = x0 + (ox + w / 2 + bx) * k, qy = y0 + (oy + h / 2 + by) * k;
      ctx.save(); ctx.translate(qx, qy); ctx.rotate(rot);
      ctx.drawImage(rocks, sx, sy, w, h, -w / 2 * k, -h / 2 * k, w * k, h * k);
      ctx.restore();
    }
    ctx.restore();
    return true;
  },
  // une faille qui se referme : elle se contracte en tourbillonnant de plus en plus vite, aspire sa lumière, puis implose
  // dans un éclair et une onde de choc
  RIFT_CLOSE_T1: 1.3, RIFT_CLOSE_T2: 1.5,
  drawRiftClose(ctx, f, pos, ts, now) {
    const P = pos(f.x + MapView.wrapNear(f.x), f.y), cx = P.x + ts * .5, cy = P.y + ts * .52;
    const myr = f.plane === 1, glow = myr ? '255,230,140' : '190,120,255', halo = myr ? '120,220,255' : '190,120,255';
    const e = (now - f.t0) / 1000, T1 = MapView.RIFT_CLOSE_T1, T2 = MapView.RIFT_CLOSE_T2, s0 = ts * 1.3, mid = P.y + ts * 1.04 - s0 / 2;
    const site = { id: f.id, plane: f.plane };
    ctx.save();
    if (e < T1) {
      const k = Math.max(0, e) / T1, ease = k * k * k;
      const size = s0 * (1 - ease * .94);
      // la lumière se concentre
      ctx.globalCompositeOperation = 'lighter';
      const rad = ts * (.8 - .35 * ease);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(' + halo + ',' + (.5 + .45 * k) + ')'); g.addColorStop(.5, 'rgba(' + halo + ',' + (.15 + .25 * k) + ')'); g.addColorStop(1, 'rgba(' + halo + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const t = now / 1000 + f.id * .37 + ease * 6;
      if (!MapView.drawRiftAnimated(ctx, site, cx, mid + size / 2, size, t, glow)) {
        ctx.fillStyle = 'rgba(' + glow + ',.9)'; ctx.beginPath(); ctx.ellipse(cx, cy, size * .14, size * .36, 0, 0, 7); ctx.fill();
      }
      // poussières aspirées vers le cœur
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const ff = (e * (1.2 + k) + i / 18) % 1, a = i * 2.39 + e * 3, r = ts * 1.25 * (1 - ff);
        ctx.globalAlpha = Math.sin(ff * Math.PI) * (.4 + .6 * k); ctx.fillStyle = i % 3 ? '#fff' : 'rgb(' + glow + ')';
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * .8, Math.max(1, ts * .025), 0, 7); ctx.fill();
      }
    } else {
      const k = Math.min(1, (e - T1) / T2), out = 1 - Math.pow(1 - k, 3);
      ctx.globalCompositeOperation = 'lighter';
      // l'éclair
      const fa = Math.max(0, 1 - k * 2.5);
      if (fa > 0) {
        const r = ts * (.25 + .9 * out);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(255,255,255,' + fa + ')'); g.addColorStop(.35, 'rgba(' + glow + ',' + fa * .8 + ')'); g.addColorStop(1, 'rgba(' + halo + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      }
      // l'onde de choc
      ctx.strokeStyle = 'rgba(' + glow + ',' + (1 - k) * .9 + ')'; ctx.lineWidth = Math.max(1.5, ts / 9) * (1 - k * .8);
      ctx.beginPath(); ctx.ellipse(cx, cy, ts * (.15 + 1.7 * out), ts * (.12 + 1.3 * out), 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - k) * .6 + ')'; ctx.lineWidth = Math.max(1, ts / 18) * (1 - k);
      ctx.beginPath(); ctx.ellipse(cx, cy, ts * (.1 + 1.1 * out), ts * (.08 + .85 * out), 0, 0, 7); ctx.stroke();
      // étincelles projetées
      for (let i = 0; i < 20; i++) {
        const a = i * 2.39 + f.id, sp = .7 + ((i * 37) % 10) / 20, d = ts * (.15 + 1.4 * out * sp);
        ctx.globalAlpha = Math.max(0, 1 - k * 1.1); ctx.fillStyle = i % 2 ? '#fff' : 'rgb(' + glow + ')';
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * .75, Math.max(1, ts * .03 * (1 - k)), 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  },
  // ---------- lieux ajoutés par Arcanes : faille, sanctuaire, Brèche ----------
  drawRift(ctx, s, x, y, ts, now) {
    const key = 'site:rift';
    const cx = x + ts * .5, cy = y + ts * .52, t = now / 1000 + s.id * .37;
    const pulse = .5 + .5 * Math.sin(t * 2.2);
    const myr = s.plane === 1;
    const c1 = myr ? '120,220,255' : '190,120,255', c2 = myr ? '255,230,140' : '255,120,220';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * .8);
    g.addColorStop(0, 'rgba(' + c1 + ',' + (.55 + .2 * pulse) + ')'); g.addColorStop(.45, 'rgba(' + c1 + ',.18)'); g.addColorStop(1, 'rgba(' + c1 + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, ts * .8, ts * .62, 0, 0, 7); ctx.fill();
    ctx.restore();
    if (MapView.drawRiftAnimated(ctx, s, cx, y + ts * 1.04, ts * 1.3, t, myr ? c2 : c1)) return;
    if (Sprites.hasHD(key)) { Sprites.drawFoot(ctx, key, cx, y + ts * 1.04, ts * 1.3); return; }
    ctx.save();
    // la déchirure : une lentille verticale qui respire, bord éclatant, cœur d'outre-monde
    const hh = ts * (.46 + .03 * pulse), ww = ts * (.17 + .04 * pulse);
    const lens = (k) => { ctx.beginPath(); ctx.moveTo(cx, cy - hh * k); ctx.bezierCurveTo(cx + ww * 1.6 * k, cy - hh * .35 * k, cx + ww * .45 * k, cy + hh * .35 * k, cx, cy + hh * k); ctx.bezierCurveTo(cx - ww * .45 * k, cy + hh * .35 * k, cx - ww * 1.6 * k, cy - hh * .35 * k, cx, cy - hh * k); };
    ctx.shadowColor = 'rgb(' + c1 + ')'; ctx.shadowBlur = ts * .35;
    ctx.fillStyle = 'rgba(' + c2 + ',.95)'; lens(1); ctx.fill();
    ctx.shadowBlur = 0;
    const vg = ctx.createLinearGradient(0, cy - hh, 0, cy + hh);
    vg.addColorStop(0, myr ? '#0b2c3a' : '#1a0630'); vg.addColorStop(.5, myr ? '#1f6a7a' : '#4a1470'); vg.addColorStop(1, myr ? '#0b2c3a' : '#1a0630');
    ctx.fillStyle = vg; lens(.72); ctx.fill();
    // l'autre plan, qu'on aperçoit au travers
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { const f = ((t * .4 + i * .25) % 1); ctx.fillStyle = 'rgba(255,255,255,' + (.6 * (1 - f)) + ')'; ctx.beginPath(); ctx.arc(cx + Math.sin(i * 2.1 + t) * ww * .3, cy + (f - .5) * hh * 1.1, Math.max(1, ts * .018), 0, 7); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    // fêlures
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(' + c2 + ',.75)'; ctx.lineWidth = Math.max(1, ts / 48);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4, sy = cy + (i - 1.5) * hh * .45, dir = i % 2 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(cx + dir * ww * .3, sy); ctx.lineTo(cx + dir * ts * (.2 + .04 * Math.sin(a)), sy - ts * .05); ctx.lineTo(cx + dir * ts * (.28 + .03 * Math.cos(a)), sy + ts * .03); ctx.stroke();
    }
    // éclats qui tournent autour
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const a = t * (1.1 + i * .07) + i * .9, r = ts * (.22 + .05 * Math.sin(t + i));
      const px = cx + Math.cos(a) * r * .9, py = cy + Math.sin(a) * r * .55;
      ctx.fillStyle = 'rgba(' + (i % 2 ? c1 : c2) + ',' + (.5 + .5 * Math.sin(a * 2)) + ')';
      ctx.beginPath(); ctx.arc(px, py, Math.max(1, ts * .022), 0, 7); ctx.fill();
    }
    ctx.restore();
  },
  drawShrine(ctx, s, x, y, ts, now, mine) {
    const e = Pacts.ENT[s.entity] || { color: '#c9a9ff' }, col = e.color;
    const key = 'site:shrine_' + s.entity;
    const cx = x + ts * .5, by = y + ts * .86, t = now / 1000 + s.id;
    const pulse = .5 + .5 * Math.sin(t * 1.8);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, y + ts * .35, 0, cx, y + ts * .35, ts * .7);
    g.addColorStop(0, col + (mine ? '44' : '88')); g.addColorStop(1, col + '00');
    ctx.fillStyle = g; ctx.fillRect(x - ts * .2, y - ts * .3, ts * 1.4, ts * 1.3);
    ctx.restore();
    if (Sprites.hasHD(key)) { Sprites.drawFoot(ctx, Sprites.planeKey(key, s.plane), cx, y + ts * 1.02, ts * 1.05); return; }
    {
      ctx.save();
      // ombre, socle, monolithe
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(cx, by, ts * .32, ts * .09, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a4458'; ctx.strokeStyle = 'rgba(10,8,16,.9)'; ctx.lineWidth = Math.max(1, ts / 40);
      ctx.beginPath(); ctx.moveTo(cx - ts * .3, by); ctx.lineTo(cx - ts * .24, by - ts * .1); ctx.lineTo(cx + ts * .24, by - ts * .1); ctx.lineTo(cx + ts * .3, by); ctx.closePath(); ctx.fill(); ctx.stroke();
      const top = y + ts * .1, wb = ts * .14, wt = ts * .09;
      const mg = ctx.createLinearGradient(cx - wb, 0, cx + wb, 0); mg.addColorStop(0, '#2c2838'); mg.addColorStop(.45, '#5b5470'); mg.addColorStop(1, '#2a2634');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.moveTo(cx - wb, by - ts * .1); ctx.lineTo(cx - wt, top + ts * .1); ctx.lineTo(cx, top); ctx.lineTo(cx + wt, top + ts * .1); ctx.lineTo(cx + wb, by - ts * .1); ctx.closePath(); ctx.fill(); ctx.stroke();
      // rune lumineuse
      ctx.shadowColor = col; ctx.shadowBlur = ts * (.15 + .1 * pulse);
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.3, ts / 30);
      const ry = y + ts * .42, rr = ts * .06;
      ctx.beginPath(); ctx.arc(cx, ry, rr, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, ry - rr * 2.2); ctx.lineTo(cx, ry + rr * 2.4); ctx.stroke();
      ctx.restore();
    }
    // flamme votive au sommet
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const fy = y + ts * (.02 - .02 * pulse);
    const fg = ctx.createRadialGradient(cx, fy, 0, cx, fy, ts * .14);
    fg.addColorStop(0, '#ffffff'); fg.addColorStop(.35, col + 'cc'); fg.addColorStop(1, col + '00');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(cx, fy, ts * .09, ts * (.14 + .03 * pulse), 0, 0, 7); ctx.fill();
    ctx.restore();
  },
  // les lieux des crises de fin : un halo à la couleur de la crise, et la figure du lieu
  drawFinaleSite(ctx, s, x, y, ts, now) {
    const t = now / 1000, pulse = .5 + .5 * Math.sin(t * 1.4), cx = x + ts * .5, cy = y + ts * .55;
    const col = { phylactery: '90,230,140', citadel: '170,110,255', winterheart: '170,220,255' }[s.type] || '255,255,255';
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * 1.2);
    g.addColorStop(0, 'rgba(' + col + ',' + (.55 + .2 * pulse) + ')'); g.addColorStop(.5, 'rgba(' + col + ',.2)'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, ts * 1.2, ts * .9, 0, 0, 7); ctx.fill();
    ctx.restore();
    if (s.type === 'winterheart') {
      // un cristal de glace qui bat
      ctx.save(); ctx.translate(cx, cy - ts * .08); const k = ts * (.3 + .03 * pulse);
      const cg = ctx.createLinearGradient(0, -k, 0, k); cg.addColorStop(0, '#ffffff'); cg.addColorStop(.5, '#a8d8ff'); cg.addColorStop(1, '#4f8fd0');
      ctx.fillStyle = cg; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1, ts / 40);
      for (const [sx, sy, sc] of [[0, 0, 1], [-k * .55, k * .3, .55], [k * .55, k * .3, .55]]) {
        ctx.beginPath(); ctx.moveTo(sx, sy - k * sc); ctx.lineTo(sx + k * .32 * sc, sy); ctx.lineTo(sx, sy + k * .7 * sc); ctx.lineTo(sx - k * .32 * sc, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore(); return;
    }
    const key = s.type === 'phylactery' ? 'feat:fallen_temple' : 'feat:keep';
    if (Sprites.hasHD(key)) Sprites.drawFoot(ctx, Sprites.planeKey(key, s.plane), cx, y + ts * 1.02, ts * 1.12);
    else Sprites.draw(ctx, key, x + ts * .08, y + ts * .02, ts * .84, ts * .84);
  },
  drawBreach(ctx, s, x, y, ts, now) {
    const key = 'site:breach';
    const cx = x + ts * .5, cy = y + ts * .55, t = now / 1000;
    const pulse = .5 + .5 * Math.sin(t * 1.6);
    ctx.save();
    // halo de ténèbres et de braise
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * 1.25);
    g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(.3, 'rgba(90,0,10,' + (.6 + .2 * pulse) + ')'); g.addColorStop(.7, 'rgba(160,30,10,.18)'); g.addColorStop(1, 'rgba(160,30,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, ts * 1.25, ts * .9, 0, 0, 7); ctx.fill();
    if (Sprites.hasHD(key)) { ctx.restore(); Sprites.drawFoot(ctx, key, cx, y + ts * 1.05, ts * 1.4); return; }
    // spirale
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = k === 1 ? 'rgba(255,140,40,.7)' : 'rgba(220,30,30,.65)'; ctx.lineWidth = Math.max(1.5, ts / (22 + k * 6));
      ctx.beginPath();
      for (let i = 0; i <= 26; i++) {
        const f = i / 26, a = -t * 1.3 + k * 2.09 + f * 4.2, r = ts * (.08 + .5 * f);
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * .62;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    // rayons de braise
    for (let i = 0; i < 8; i++) {
      const a = i * .785 + Math.sin(t * .7 + i) * .12, l = ts * (.55 + .12 * Math.sin(t * 1.3 + i * 1.7));
      const rg = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l * .62);
      rg.addColorStop(0, 'rgba(255,90,30,.55)'); rg.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.strokeStyle = rg; ctx.lineWidth = Math.max(1.5, ts / 26);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l * .62); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // gouffre aux bords déchiquetés
    ctx.fillStyle = '#050003'; ctx.strokeStyle = 'rgba(255,70,20,.9)'; ctx.lineWidth = Math.max(1.2, ts / 36);
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2, r = ts * (.17 + (i % 2 ? .06 : 0) + .015 * Math.sin(t * 3 + i)); const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * .62; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    // cœur
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, ts * .2);
    cg.addColorStop(0, 'rgba(255,220,160,' + (.35 + .25 * pulse) + ')'); cg.addColorStop(.5, 'rgba(200,30,10,.25)'); cg.addColorStop(1, 'rgba(200,30,10,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(cx, cy, ts * .12, ts * .07, 0, 0, 7); ctx.fill();
    // braises qui montent
    for (let i = 0; i < 9; i++) {
      const f = (t * .35 + i * .113) % 1, a = i * 2.4;
      const px = cx + Math.cos(a) * ts * (.15 + .35 * f), py = cy - ts * (.1 + .8 * f);
      ctx.fillStyle = 'rgba(255,' + (120 + (i * 13) % 100) + ',40,' + (1 - f) + ')';
      ctx.beginPath(); ctx.arc(px, py, Math.max(1, ts * .02 * (1 - f * .5)), 0, 7); ctx.fill();
    }
    ctx.restore();
  },
  // emblème d'une puissance (fenêtres de pacte)
  paintSigil(cv, entity) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const fake = { id: 3, entity, plane: 1 };
    ctx.fillStyle = '#0c0b14'; ctx.fillRect(0, 0, W, H);
    MapView.drawShrine(ctx, fake, W * .1, H * .12, W * .8, performance.now(), false);
  },
  flash(plane, x, y, color, dur) { MapView.flashes.push({ plane, x, y, color: color || '#ffd27a', t0: performance.now(), dur: dur || 700 }); },

  // ---------- mini-carte ----------
  drawMinimap(cv) {
    const game = MapView.game, world = game.world, p = MapView.plane;
    const ctx = cv.getContext('2d');
    const s = cv.width / world.w;
    const img = ctx.createImageData(world.w, world.h);
    const pl = game.players[MapView.pid], ex = pl.explored[p];
    const col = { [T.OCEAN]: [28, 58, 102], [T.LAKE]: [40, 90, 150], [T.GRASS]: [74, 122, 52], [T.FOREST]: [36, 86, 40], [T.HILLS]: [110, 112, 64], [T.MOUNTAIN]: [140, 134, 124], [T.DESERT]: [196, 170, 110], [T.SWAMP]: [64, 82, 60], [T.TUNDRA]: [200, 208, 214], [T.RIVER]: [60, 120, 170], [T.SNODE]: [110, 170, 255], [T.NNODE]: [120, 255, 140], [T.CNODE]: [255, 90, 40], [T.VOLCANO]: [200, 70, 40] };
    // le Miroir : sa propre palette (froide), quand il a ses propres sols
    if (p === 1 && Sprites.hasMirror()) Object.assign(col, { [T.OCEAN]: [20, 18, 56], [T.LAKE]: [30, 44, 104], [T.GRASS]: [52, 104, 112], [T.FOREST]: [58, 38, 96], [T.HILLS]: [78, 92, 122], [T.MOUNTAIN]: [104, 96, 138], [T.DESERT]: [184, 168, 206], [T.SWAMP]: [40, 62, 78], [T.TUNDRA]: [196, 214, 240], [T.RIVER]: [70, 200, 210], [T.VOLCANO]: [190, 50, 150] });
    for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
      const i = y * world.w + x, o = i * 4;
      if (!ex[i]) { img.data[o + 3] = 255; continue; }
      let c = col[world.planes[p].terr[i]] || [80, 80, 80];
      if (World.isWater(world.planes[p].terr[i]) && World.isShore(world, p, x, y)) c = p === 1 && Sprites.hasMirror() ? [36, 70, 130] : [44, 88, 140];
      const own = world.planes[p].owner[i];
      if (own >= 0 && game.players[own]) { const pc = hexToRgb(game.players[own].color); c = [c[0] * .55 + pc[0] * .45, c[1] * .55 + pc[1] * .45, c[2] * .55 + pc[2] * .45]; }
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = world.w; tmp.height = world.h; tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
    for (const c of Object.values(game.cities)) if (c.plane === p && ex[c.y * world.w + c.x]) { ctx.fillStyle = game.players[c.owner] ? game.players[c.owner].color : '#bbb'; ctx.fillRect(c.x * s - 1, c.y * s - 1, s + 2, s + 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = .8; ctx.strokeRect(c.x * s - 1, c.y * s - 1, s + 2, s + 2); }
    // les capitales : une étoile d'or par-dessus la couleur du sorcier
    for (const c of Object.values(game.cities)) if (c.fortress && c.plane === p && ex[c.y * world.w + c.x]) MapView.star(ctx, c.x * s + s / 2, c.y * s + s / 2, Math.max(3.2, s * 1.5));
    // failles, sanctuaires, Brèche
    for (const st of game.sites) {
      if (st.plane !== p || st.closed || !ex[st.y * world.w + st.x]) continue;
      const c = st.type === 'rift' ? '#c48cff' : st.type === 'breach' && !st.cleared ? '#ff3b2a' : st.finale && !st.cleared ? { phylactery: '#5ae68c', citadel: '#aa6eff', winterheart: '#aadcff' }[st.type] : st.type === 'shrine' ? (Pacts.ENT[st.entity] || {}).color : null;
      if (!c) continue;
      const r = Math.max(1.6, s * (st.type === 'breach' || st.finale ? 1.4 : .9));
      ctx.fillStyle = c; ctx.strokeStyle = '#000'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.arc(st.x * s + s / 2, st.y * s + s / 2, r, 0, 7); ctx.fill(); ctx.stroke();
    }
    if (typeof App !== 'undefined' && App.showNodes) for (const st of MapView.freeNodes(game, pl, p)) {
      ctx.fillStyle = MapView.NODE_HEX[MapView.nodeKind(pl, st)]; ctx.strokeStyle = '#06210f'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.arc(st.x * s + s / 2, st.y * s + s / 2, Math.max(1.8, s * .9), 0, 7); ctx.fill(); ctx.stroke();
    }
    if (typeof App !== 'undefined' && App.showLairs) for (const st of MapView.openLairs(game, pl, p).concat(MapView.scoutedLairs(game, pl, p))) {
      ctx.fillStyle = Game.siteKnown(pl, st) ? '#cd8cff' : '#ffcf3a'; ctx.strokeStyle = '#3a1e00'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.arc(st.x * s + s / 2, st.y * s + s / 2, Math.max(1.8, s * .9), 0, 7); ctx.fill(); ctx.stroke();
    }
    // légendes de vos héros : la région, puis le repaire
    for (const u of Object.values(game.units)) {
      const q = u.owner === MapView.pid && u.hero && u.hero.quest; if (!q || q.done || q.site == null || q.type !== 'legend' || q.stage < 2) continue;
      const st = game.sites[q.site]; if (!st || st.plane !== p) continue;
      ctx.save();
      if (q.stage === 2) { if (!(MapView.sel && MapView.sel.ids.includes(u.id))) { ctx.restore(); continue; } ctx.setLineDash([2, 2]); ctx.strokeStyle = '#ffcf3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.cx * s + s / 2, q.cy * s + s / 2, (q.r + .5) * s, 0, 7); ctx.stroke(); }
      else { ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = '#3a1e00'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(st.x * s + s / 2, st.y * s + s / 2, Math.max(2.4, s * 1.1), 0, 7); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    // cadre de vue
    const ts = MapView.ts, vw = innerWidth / ts, vh = innerHeight / ts;
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
    const vx = (MapView.camX - vw / 2) * s, vy = (MapView.camY - vh / 2) * s;
    ctx.strokeRect(vx, vy, vw * s, vh * s); ctx.strokeRect(vx - world.w * s, vy, vw * s, vh * s); ctx.strokeRect(vx + world.w * s, vy, vw * s, vh * s);
  },
};
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
