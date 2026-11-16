// v0.31.67 : fonder demande du mouvement restant (comme dans MoM et Civilization) ; la rivière du champ de bataille est une
// bande continue large de deux cases, qui serpente entre les armées, franchie à deux endroits par un pont ou un gué qui la
// traverse d'équerre ; sans ces passages, un piéton ne passe pas ; le pont est de la terre ferme.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, World, Cities, Battle, RNG, Turn, T } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const CW = 13, CH = 13, DIRS8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

(async () => {
  // 1. fonder : il faut du mouvement restant
  {
    const g = Game.newGame({ seed: 4, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
    const me = g.players[0], fc = g.cities[me.fortress];
    let spot = null;
    for (let d = 4; d < 12 && !spot; d++) for (let dx = -d; dx <= d && !spot; dx++) for (const dy of [-d, d]) { const x = World.wx(g.world, fc.x + dx), y = fc.y + dy; if (World.inY(g.world, y) && Cities.canFoundAt(g, me.id, 0, x, y).ok) { spot = [x, y]; break; } }
    const s = Units.create(g, 'HighMenSettlers', me.id, 0, spot[0], spot[1]); s.moves = 0;
    const r0 = Game.foundCity(g, s.id);
    ok(!r0.ok && /mouvement/.test(r0.why) && g.units[s.id], 'colons à 0 mouvement : pas de fondation (' + r0.why + ')');
    s.moves = 0.5;
    const r1 = Game.foundCity(g, s.id);
    ok(r1.ok && !g.units[s.id], 'colons avec un demi-mouvement : la cité est fondée');
  }
  // 2. l'IA fonde toujours ses cités (un tour plus tard quand son colon arrive à bout de mouvement)
  {
    const g = Game.newGame({ seed: 9, mapW: 60, mapH: 40, opponents: 2, difficulty: 'hard', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
    g.players[0].human = false; g.players[0].aiLevel = 'hard';
    const n0 = Object.keys(g.cities).length;
    for (let t = 0; t < 45; t++) await Turn.endTurn(g);
    const n1 = Object.keys(g.cities).length;
    ok(n1 >= n0 + 4, 'l\'IA fonde encore : ' + n0 + ' -> ' + n1 + ' cités en 45 tours');
  }
  // 3. la rivière du champ de bataille
  const g = Game.newGame({ seed: 7, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  let at = null;
  for (let y = 3; y < g.world.h - 3 && !at; y++) for (let x = 0; x < g.world.w && !at; x++) if (World.terr(g.world, 0, x, y) === T.RIVER && !Cities.at(g, 0, x, y)) at = [x, y];
  const bad = { conn: 0, cross: 0, square: 0, wall: 0, pass: 0, deploy: 0, width: 0 };
  let bridges = 0, fords = 0, N = 300;
  for (let seed = 1; seed <= N; seed++) {
    const A = [Units.create(g, 'HighMenSpearmen', 0, 0, at[0], at[1])], D = [Units.create(g, 'OrcSpearmen', 1, 0, at[0], at[1])];
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: at[0], y: at[1], rng: new RNG(seed), sim: true });
    for (const u of A.concat(D)) Units.remove(g, u);
    const wet = (c, r) => bt.inRiver(c, r) || bt.isBridge(c, r);
    const cells = []; for (let c = 0; c < CW; c++) for (let r = 0; r < CH; r++) if (wet(c, r)) cells.push([c, r]);
    // d'un seul tenant, par les côtés des cases
    const seen = new Set([cells[0].join()]), st = [cells[0]];
    while (st.length) { const [c, r] = st.pop(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dc) + ',' + (r + dr); if (wet(c + dc, r + dr) && !seen.has(k)) { seen.add(k); st.push([c + dc, r + dr]); } } }
    if (seen.size !== cells.length) bad.conn++;
    // deux cases au moins en travers : chaque colonne où passe la bande en a deux d'affilée
    for (let c = 0; c < CW; c++) { const rs = []; for (let r = 0; r < CH; r++) if (wet(c, r)) rs.push(r); if (rs.length === 1 && rs[0] > 0 && rs[0] < CH - 1) bad.width++; }
    // deux passages de deux cases ; d'équerre : la rivière court de part et d'autre, sur les mêmes lignes r
    const pass = {}; for (const k of Object.keys(bt.ford).concat(Object.keys(bt.bridge))) { const [c, r] = k.split(',').map(Number); (pass[c] = pass[c] || []).push(r); }
    const cols = Object.keys(pass).map(Number);
    if (cols.length !== 2 || cols.some(c => pass[c].length !== 2)) bad.cross++;
    for (const c of cols) {
      const rs = pass[c].sort((a, b) => a - b);
      if (!rs.every(r => bt.inRiver(c - 1, r) && bt.inRiver(c + 1, r))) bad.square++;
      if (wet(c, rs[0] - 1) || wet(c, rs[1] + 1)) bad.square++;
      if (bt.isBridge(c, rs[0])) bridges++; else fords++;
    }
    // un piéton passe par les passages, et seulement par eux
    const walk = (block) => {
      const from = [4, 4], seen = new Set([from.join()]), q = [from];
      while (q.length) {
        const [c, r] = q.shift();
        for (const [dc, dr] of DIRS8) {
          const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
          if (nc < 0 || nr < 0 || nc >= CW || nr >= CH || seen.has(k)) continue;
          const deep = (x, y) => bt.deep(x, y) || (block && (bt.isFord(x, y) || bt.isBridge(x, y)));
          if (deep(nc, nr) || (dc && dr && deep(c + dc, r) && deep(c, r + dr))) continue;
          seen.add(k); q.push([nc, nr]);
        }
      }
      return seen.has('8,8');
    };
    if (walk(true)) bad.wall++;
    if (!walk(false)) bad.pass++;
    for (const b of bt.units) if (wet(b.c, b.r)) bad.deploy++;
  }
  ok(!bad.conn, 'rivière d\'un seul tenant (' + N + ' champs de bataille, ' + bad.conn + ' en morceaux)');
  ok(!bad.width, 'jamais une seule case de large (' + bad.width + ')');
  ok(!bad.cross, 'deux passages de deux cases (' + bad.cross + ' champs sans)');
  ok(!bad.square, 'les passages traversent d\'équerre, entre deux berges (' + bad.square + ')');
  ok(!bad.wall && !bad.pass, 'un piéton ne passe que par les ponts et les gués (' + bad.wall + ' fuites, ' + bad.pass + ' champs sans passage)');
  ok(!bad.deploy, 'personne ne commence dans l\'eau');
  ok(bridges > N * 0.35 && fords > N * 0.35, 'ponts et gués, à peu près autant (' + bridges + ' ponts, ' + fords + ' gués)');
  // le pont : terre ferme, on y passe d'un pas ordinaire ; le gué coûte tout le mouvement
  for (let seed = 1; seed <= 60; seed++) {
    const A = [Units.create(g, 'HighMenSpearmen', 0, 0, at[0], at[1])], D = [Units.create(g, 'OrcSpearmen', 1, 0, at[0], at[1])];
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: 0, x: at[0], y: at[1], rng: new RNG(seed), sim: true });
    for (const u of A.concat(D)) Units.remove(g, u);
    const bk = Object.keys(bt.bridge), fk = Object.keys(bt.ford);
    if (!bk.length || !fk.length) continue;
    const b = bt.units[0];
    const test = keys => { const ps = keys.map(k => k.split(',').map(Number)).sort((x, y) => x[1] - y[1]); b.c = ps[0][0]; b.r = ps[0][1] - 1; b.moves = b.maxMoves = 4; const m = bt.reachable(b); return ps.map(([c, r]) => m.has(c + ',' + r)); };
    const onB = test(bk), onF = test(fk);
    ok(onB[0] && onB[1] && !bt.blocked(...bk[0].split(',').map(Number)) && bt.terrainNotes(...bk[0].split(',').map(Number)).includes('Pont'), 'pont : deux pas ordinaires pour le traverser (graine ' + seed + ')');
    ok(onF[0] && !onF[1], 'gué : y entrer coûte tout le mouvement');
    break;
  }
})();
