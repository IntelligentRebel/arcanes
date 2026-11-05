'use strict';
// Comparaison appariée : même carte, mêmes adversaires (niveau fixe), seul le niveau du sorcier observé (place 0) change.
// Bien moins bruyant qu'une arène mêlée pour savoir si une version de l'IA joue mieux qu'une autre.
// node tests/paired.js --seeds 12 --turns 150 --levels easy,normal --opp easy [--seed 3000] [--workers 2] [--subjexp 1] [--oppexp '{"no_x":1}']
const { fork } = require('child_process');
const { loadEngine } = require('./load');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const SEEDS = +(args.seeds || 12), TURNS = +(args.turns || 150), SEED = +(args.seed || 3000), WORKERS = +(args.workers || 2);
const LEVELS = (args.levels || 'easy;normal').split(';');
let OPP = args.opp || 'easy';

const { playOne: play, parseVariant } = require('./match');
async function playOne(job) {
  const E = loadEngine();
  return play(E, Object.assign({ turns: TURNS, opp: job.opp || OPP, subjexp: !!args.subjexp, oppmix: args.oppmix || null, oppexp: args.oppexp || null, boost: !!args.boost }, job, { opp: job.opp || OPP }));
}
async function worker() {
  for (const job of JSON.parse(process.env.PAIRED_JOBS)) { try { process.send(await playOne(job)); } catch (e) { process.send({ error: String(e && e.stack || e), job }); } }
  process.exit(0);
}
if (process.env.PAIRED_JOBS) worker();
else (async () => {
  if (!process.env.ARENA_ROOT) {
    const fs = require('fs'), path = require('path'), os = require('os');
    const snap = fs.mkdtempSync(path.join(os.tmpdir(), 'paired-'));
    for (const d of ['data', 'src']) fs.cpSync(path.join(__dirname, '..', d), path.join(snap, d), { recursive: true });
    process.env.ARENA_ROOT = snap;
  }
  // variantes : un niveau, ou niveau+expérience (ex. normal:{"x":1})
  const variants = LEVELS.map(parseVariant);
  const jobs = [];
  for (let s = 0; s < SEEDS; s++) for (const v of variants) jobs.push({ seed: SEED + s, level: v.level, exp: v.exp, label: v.label, opp: v.opp });
  const t0 = Date.now(), res = [];
  const parts = Array.from({ length: WORKERS }, (_, k) => jobs.filter((_, i) => i % WORKERS === k));
  await Promise.all(parts.map(p => new Promise(done => {
    const ch = fork(__filename, process.argv.slice(2), { env: Object.assign({}, process.env, { PAIRED_JOBS: JSON.stringify(p) }) });
    ch.on('message', m => { res.push(m); if (m.error) console.log('ERREUR', m.error.split('\n')[0]); if (args.out) require('fs').appendFileSync(args.out + '.part', JSON.stringify(m) + '\n'); });
    ch.on('exit', done);
  })));
  const by = {};
  for (const r of res) if (!r.error) (by[r.label] = by[r.label] || []).push(r);
  console.log('variante'.padEnd(26) + 'parties  score   rang  cités  survie  puiss  sorts  légendes (toutes IA)');
  for (const v of variants) { const a = by[v.label] || []; if (!a.length) continue; const m = k => a.reduce((s, r) => s + (+r[k] || 0), 0) / a.length;
    console.log(v.label.padEnd(26) + String(a.length).padStart(7) + m('score').toFixed(0).padStart(7) + m('rank').toFixed(2).padStart(7) + m('cities').toFixed(1).padStart(7) + (Math.round(100 * m('alive')) + '%').padStart(8) + m('power').toFixed(0).padStart(7) + m('known').toFixed(1).padStart(7) + m('legends').toFixed(2).padStart(8) + (' (' + m('legendsAll').toFixed(2) + ')')); }
  if (variants.length > 1) {
    const base = variants[0].label;
    for (const v of variants.slice(1)) {
      let w = 0, n = 0, d = 0; const diffs = [];
      for (const r of by[v.label] || []) { const b = (by[base] || []).find(x => x.seed === r.seed); if (!b) continue; n++; if (r.score > b.score) w++; d += r.score - b.score; diffs.push(r.score - b.score); }
      const m = n ? d / n : 0, sd = n > 1 ? Math.sqrt(diffs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) : 0;
      console.log(v.label + ' contre ' + base + ' : meilleur sur ' + w + '/' + n + ' cartes, écart moyen ' + Math.round(m) + ' ± ' + Math.round(sd / Math.sqrt(Math.max(1, n))) + ' (erreur type)');
    }
  }
  console.log(res.length + ' parties en ' + Math.round((Date.now() - t0) / 1000) + ' s');
  if (args.out) require('fs').writeFileSync(args.out, JSON.stringify(res));
})();
