'use strict';
// Arène : des parties entre IA de niveaux mêlés, sur des graines fixes, pour vérifier qu'un niveau bat le précédent
// et qu'une modification de l'IA l'améliore vraiment. Les niveaux tournent d'une place à l'autre d'une partie à la suivante.
// node tests/arena.js --games 8 --turns 150 --levels easy,normal,hard,hardcore [--seed 1000] [--workers 2]
const { fork } = require('child_process');
const { loadEngine } = require('./load');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const GAMES = +(args.games || 8), TURNS = +(args.turns || 150), SEED = +(args.seed || 1000), WORKERS = +(args.workers || 2);
const LEVELS = (args.levels || 'easy,normal,hard,hardcore').split(',');

function score(E, game, pl) {
  if (!pl.alive) return 0;
  const cities = E.Cities.ofPlayer(game, pl.id);
  const citizens = E.U.sum(cities, c => E.Cities.citizens(c));
  const army = E.U.sum(Object.values(game.units).filter(u => u.owner === pl.id), u => E.Units.strength(game, u));
  return Math.round(cities.length * 10 + citizens + E.Magic.power(game, pl) * 1.5 + pl.known.length * 2 + army / 30 + (game.winner === pl.id ? 500 : 0));
}

async function playOne(g) {
  const E = loadEngine();
  E.AI.EXP = args.exp ? JSON.parse(args.exp) : {};
  const seed = SEED + g;
  const lv = i => LEVELS[(i + g) % LEVELS.length];
  const w = E.DATA.wizards[(g * 5) % E.DATA.wizards.length];
  const t0 = Date.now();
  const game = E.Game.newGame({ seed, mapW: 60, mapH: 40, landSize: 'medium', opponents: 3, difficulty: 'normal', crisis: 'normal',
    aiLevels: [lv(1), lv(2), lv(3)], human: { name: w.name, portrait: w.portrait, books: w.books, retorts: w.retorts, race: E.DATA.races[w.race] ? w.race : 'highmen' } });
  const p0 = game.players[0]; p0.human = false; p0.aiLevel = lv(0);
  p0.aiPersonality = ['expansionist', 'militarist', 'perfectionist', 'maniac', 'balanced'][g % 5];
  const snaps = {};
  const cnt = game.players.map(() => ({ lairs: 0, caps: 0, lost: 0, summons: 0, casts: 0, settlers: 0 }));
  const oa = E.Game.attack;
  E.Game.attack = async function (g, ids, tx, ty) {
    const u = g.units[ids[0]]; const pid = u ? u.owner : -1;
    const city = E.Cities.at(g, u.plane, tx, ty), si = E.World.get(g.world, u.plane, 'site', tx, ty), site = si >= 0 ? g.sites[si] : null;
    const guarded = site && E.Game.siteHasGuardians(site), owner0 = city ? city.owner : null;
    const r = await oa.apply(this, arguments);
    if (pid >= 0 && cnt[pid]) { if (guarded && site.cleared) cnt[pid].lairs++; if (city && city.owner === pid && owner0 !== pid) { cnt[pid].caps++; if (owner0 >= 0) cnt[owner0].lost++; } }
    return r;
  };
  const oc = E.Spells.cast;
  E.Spells.cast = function (g, pl, id) { const r = oc.apply(this, arguments); if (r && r.ok !== false && cnt[pl.id]) { cnt[pl.id].casts++; if (E.DATA.spells[id] && E.DATA.spells[id].kind === 'summon') cnt[pl.id].summons++; } return r; };
  const ou = E.Units.create;
  E.Units.create = function (g, t, o) { const u = ou.apply(this, arguments); if (o >= 0 && cnt[o] && E.DATA.units[t].abilities.createOutpost && g.turn > 1) cnt[o].settlers++; return u; };
  for (let t = 0; t < TURNS && !game.over; t++) {
    await E.Turn.endTurn(game);
    if (game.turn === 100) snaps[100] = game.players.map(pl => ({ cities: E.Cities.ofPlayer(game, pl.id).length, score: score(E, game, pl) }));
  }
  const res = game.players.map((pl, i) => ({ level: pl.aiLevel, pers: pl.aiPersonality, alive: pl.alive, cities: E.Cities.ofPlayer(game, pl.id).length,
    power: E.Magic.power(game, pl), known: pl.known.length, score: score(E, game, pl), s100: snaps[100] ? snaps[100][i].score : null, c100: snaps[100] ? snaps[100][i].cities : null,
    heroes: Object.values(game.units).filter(u => u.owner === pl.id && u.hero).length, soldiers: Object.values(game.units).filter(u => u.owner === pl.id && E.AI.isSoldier(game, u)).length, ...cnt[i] }));
  return { g, seed, turn: game.turn, ms: Date.now() - t0, winner: game.winner, res };
}

async function worker() {
  const ids = JSON.parse(process.env.ARENA_IDS);
  for (const g of ids) {
    try { process.send(await playOne(g)); } catch (e) { process.send({ g, error: String(e && e.stack || e) }); }
  }
  process.exit(0);
}

function summary(all) {
  const by = {}; for (const L of LEVELS) by[L] = { n: 0, score: 0, rank: 0, alive: 0, cities: 0, s100: 0, c100: 0, ex: {} };
  const EXK = ['power', 'known', 'heroes', 'soldiers', 'lairs', 'caps', 'lost', 'summons', 'casts', 'settlers'];
  const h2h = {}; for (const a of LEVELS) { h2h[a] = {}; for (const b of LEVELS) h2h[a][b] = [0, 0]; }
  for (const r of all) {
    if (r.error) { console.log('ERREUR partie', r.g, r.error.split('\n').slice(0, 3).join(' | ')); continue; }
    const sorted = r.res.slice().sort((a, b) => b.score - a.score);
    for (const p of r.res) {
      const b = by[p.level]; b.n++; b.score += p.score; b.rank += sorted.indexOf(p) + 1; b.alive += p.alive ? 1 : 0; b.cities += p.cities; b.s100 += p.s100 || 0; b.c100 += p.c100 || 0;
      for (const k of EXK) b.ex[k] = (b.ex[k] || 0) + (p[k] || 0);
    }
    for (const p of r.res) for (const q of r.res) if (p !== q && p.level !== q.level) { h2h[p.level][q.level][1]++; if (p.score > q.score) h2h[p.level][q.level][0]++; }
  }
  console.log('\nniveau     parties  score  rang moy  survie  cités  score@100  cités@100');
  for (const L of LEVELS) { const b = by[L]; if (!b.n) continue; console.log(L.padEnd(10), String(b.n).padStart(7), String(Math.round(b.score / b.n)).padStart(6), (b.rank / b.n).toFixed(2).padStart(9), (Math.round(100 * b.alive / b.n) + '%').padStart(7), (b.cities / b.n).toFixed(1).padStart(6), String(Math.round(b.s100 / b.n)).padStart(10), (b.c100 / b.n).toFixed(1).padStart(10)); }
  console.log('\nniveau     ' + EXK.map(k => k.padStart(9)).join(''));
  for (const L of LEVELS) { const b = by[L]; if (!b.n) continue; console.log(L.padEnd(10) + EXK.map(k => (b.ex[k] / b.n).toFixed(1).padStart(9)).join('')); }
  const lv = [...new Set(LEVELS)];
  if (lv.length > 1) {
    console.log('\nface à face (part des duels gagnés, ligne contre colonne)');
    console.log(''.padEnd(10) + lv.map(l => l.padStart(10)).join(''));
    for (const a of lv) console.log(a.padEnd(10) + lv.map(b => a === b ? '-'.padStart(10) : (h2h[a][b][1] ? Math.round(100 * h2h[a][b][0] / h2h[a][b][1]) + '%' : '').padStart(10)).join(''));
  }
}

if (process.env.ARENA_IDS) worker();
else (async () => {
  const t0 = Date.now(), all = [];
  // instantané du code : on peut continuer à modifier le moteur pendant que l'arène tourne
  if (!process.env.ARENA_ROOT) {
    const fs = require('fs'), path = require('path'), os = require('os');
    const snap = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-'));
    for (const d of ['data', 'src']) fs.cpSync(path.join(__dirname, '..', d), path.join(snap, d), { recursive: true });
    process.env.ARENA_ROOT = snap;
  }
  const ids = Array.from({ length: GAMES }, (_, i) => i);
  const parts = Array.from({ length: Math.min(WORKERS, GAMES) }, (_, k) => ids.filter(i => i % WORKERS === k));
  await Promise.all(parts.map(p => new Promise(res => {
    const ch = fork(__filename, process.argv.slice(2), { env: Object.assign({}, process.env, { ARENA_IDS: JSON.stringify(p) }) });
    ch.on('message', m => { all.push(m); if (!m.error) process.stdout.write('partie ' + m.g + ' (' + Math.round(m.ms / 1000) + ' s, tour ' + m.turn + ') ' + m.res.map(r => r.level + ':' + r.score).join(' ') + '\n'); else process.stdout.write('partie ' + m.g + ' ERREUR\n'); });
    ch.on('exit', res);
  })));
  all.sort((a, b) => a.g - b.g);
  summary(all);
  console.log('\n' + all.length + ' parties en ' + Math.round((Date.now() - t0) / 1000) + ' s');
  if (args.out) require('fs').writeFileSync(args.out, JSON.stringify(all));
})();
