'use strict';
// Réglage automatique de l'IA : recherche coordonnée sur les réglages AI.TUNE, par comparaisons appariées (tests/paired.js).
// Pour chaque réglage : la valeur courante, ×0,8 et ×1,25 (±3 pour un nombre de tours), joués sur les mêmes cartes par le seul
// sorcier observé (niveau Normale contre Normale). Une variante n'est retenue que si elle bat la valeur courante de plus d'une
// fois et demie l'erreur type. Le journal et le réglage final vont dans --out.
// node tests/tune.js --seeds 10 --turns 150 --workers 2 [--knobs offense,milChance] [--seed 5000] [--rounds 1] [--out tests/tune_results.json]
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { loadEngine } = require('./load');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const SEEDS = +(args.seeds || 10), TURNS = +(args.turns || 150), WORKERS = +(args.workers || 2), SEED = +(args.seed || 5000), ROUNDS = +(args.rounds || 1);
const OUT = args.out || path.join(__dirname, 'tune_results.json');
const E = loadEngine();
const tune = Object.assign({}, E.AI.TUNE);
const KNOBS = (args.knobs || Object.keys(tune).join(',')).split(',');
const log = { start: new Date().toISOString(), seeds: SEEDS, turns: TURNS, seed: SEED, steps: [], tune: null };
const save = () => { log.tune = tune; fs.writeFileSync(OUT, JSON.stringify(log, null, 1)); };

function variants(k) {
  const v = tune[k];
  if (k === 'rallyWait') return [v, Math.max(1, v - 3), v + 3];
  return [v, Math.round(v * 0.8 * 1000) / 1000, Math.round(v * 1.25 * 1000) / 1000];
}
function run(k, vals) {
  const labels = vals.map(x => 'normal' + JSON.stringify({ tune: Object.assign({}, tune, { [k]: x }) }));
  const tmp = path.join(os.tmpdir(), 'tune-' + process.pid + '-' + k + '.json');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'paired.js'), '--seeds', String(SEEDS), '--turns', String(TURNS), '--workers', String(WORKERS), '--seed', String(SEED),
    '--subjexp', '1', '--opp', 'normal', '--levels', labels.join(';'), '--out', tmp], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0 && !fs.existsSync(tmp)) throw new Error('paired : ' + (r.stderr || '').slice(0, 500));
  const res = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.unlinkSync(tmp);
  const by = labels.map(l => res.filter(x => x.label === l && !x.error));
  return vals.map((x, i) => {
    const diffs = by[i].map(r => { const b = by[0].find(o => o.seed === r.seed); return b ? r.score - b.score : null; }).filter(d => d != null);
    const m = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    const sd = diffs.length > 1 ? Math.sqrt(diffs.reduce((s, d) => s + (d - m) ** 2, 0) / (diffs.length - 1)) : 0;
    return { value: x, mean: by[i].length ? by[i].reduce((a, r) => a + r.score, 0) / by[i].length : 0, diff: m, se: sd / Math.sqrt(Math.max(1, diffs.length)), n: diffs.length };
  });
}
(async () => {
  console.log('réglage de départ', JSON.stringify(tune));
  for (let round = 0; round < ROUNDS; round++) for (const k of KNOBS) {
    if (!(k in tune)) { console.log('réglage inconnu', k); continue; }
    const t0 = Date.now();
    const res = run(k, variants(k));
    const best = res.slice(1).sort((a, b) => b.diff - a.diff)[0];
    const adopt = best && best.diff > Math.max(3, 1.5 * best.se);
    const step = { knob: k, round, results: res, adopted: adopt ? best.value : null, seconds: Math.round((Date.now() - t0) / 1000) };
    log.steps.push(step);
    console.log(k + ' : ' + res.map(r => r.value + ' → ' + r.mean.toFixed(0) + (r === res[0] ? '' : ' (' + (r.diff >= 0 ? '+' : '') + r.diff.toFixed(1) + ' ± ' + r.se.toFixed(1) + ')')).join(' | ') + (adopt ? '  ⇒ retenu ' + best.value : '  ⇒ inchangé') + ' (' + step.seconds + ' s)');
    if (adopt) tune[k] = best.value;
    save();
  }
  console.log('réglage final', JSON.stringify(tune));
  save();
})();
