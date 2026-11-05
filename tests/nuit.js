'use strict';
// Banc de nuit : des centaines de parties IA contre IA sur tous les cœurs de la machine.
// Chaque résultat est écrit dès qu'il tombe (resultats/nuit.jsonl) : on peut fermer la fenêtre à tout moment et relancer, ça reprend où ça s'était arrêté.
// node tests/nuit.js [plan.json] [--workers N] [--fin HH:MM]
const { fork } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'resultats');
const RES = path.join(OUT, 'nuit.jsonl'), REPORT = path.join(OUT, 'rapport.txt'), ERRS = path.join(OUT, 'erreurs.txt');

// ---------- côté ouvrier : joue les parties que le chef lui confie, une à une ----------
if (process.env.NUIT_WORKER) {
  const { loadEngine } = require('./load');
  const { playOne } = require('./match');
  process.on('message', async job => {
    if (!job) process.exit(0);
    try { const r = await playOne(loadEngine(), job); r.exp_id = job.exp_id; process.send({ ok: r, key: job.key }); }
    catch (e) { process.send({ error: String(e && e.stack || e), key: job.key, job }); }
  });
  process.on('disconnect', () => process.exit(0));   // le chef est parti : on s'arrête aussi
  process.send({ ready: true });
  return;
}

// ---------- côté chef ----------
const argv = process.argv.slice(2), opt = {}, pos = [];
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1'; else pos.push(argv[i]);
const PLAN = path.resolve(pos[0] || path.join(__dirname, 'nuit_plan.json'));
const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
const { bancJobs, bancReport } = require('./banc_core');
fs.mkdirSync(OUT, { recursive: true });
const jobs = bancJobs(plan);
const rows = fs.existsSync(RES) ? fs.readFileSync(RES, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
const done = new Set(rows.map(r => r.key));
const todo = jobs.filter(j => !done.has(j.key));
const cpus = os.cpus().length, memW = Math.max(1, Math.floor(os.freemem() / 6.5e8));
const N = Math.max(1, Math.min(+(opt.workers || Math.max(1, cpus - 2)), todo.length || 1, opt.workers ? 999 : memW));
let stopAt = null;
if (opt.fin) { const [h, m] = opt.fin.split(':').map(Number); const d = new Date(); d.setHours(h, m || 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); stopAt = d; }

const hhmm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
console.log('Arcanes, banc de nuit : ' + (plan.nom || path.basename(PLAN)));
console.log(jobs.length + ' parties au plan, ' + done.size + ' déjà jouées, ' + todo.length + ' à jouer, sur ' + N + ' cœurs (machine : ' + cpus + ' processeurs logiques, ' + Math.round(os.freemem() / 1e9) + ' Go libres).');
if (stopAt) console.log('Arrêt des nouvelles parties à ' + hhmm(stopAt) + '.');
console.log('Résultats : ' + RES + '\nRapport   : ' + REPORT + '\nOn peut fermer cette fenêtre à tout moment : relancer reprend où on en était.\n');
if (!todo.length) { writeReport(); console.log('Plan déjà terminé.'); process.exit(0); }

function writeReport() {
  const all = fs.existsSync(RES) ? fs.readFileSync(RES, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
  const errs = fs.existsSync(ERRS) ? fs.readFileSync(ERRS, 'utf8').split('\n=====').filter(x => x.trim()).length : 0;
  fs.writeFileSync(REPORT, bancReport(plan, all, jobs.length, errs));
}

// ---------- la file : chaque ouvrier reçoit une nouvelle partie dès qu'il a fini la précédente ----------
const t0 = Date.now(); let next = 0, finished = 0, running = 0, stopping = false;
const secsBy = {};   // durée moyenne observée par expérience, pour estimer l'heure de fin
const doneNow = [];
function eta() {
  const left = todo.slice(next); let tot = 0, known = true;
  for (const j of left) { const s = secsBy[j.exp_id]; if (!s) { known = false; break; } tot += s.sum / s.n; }
  if (!known) return '';
  const end = new Date(Date.now() + tot * 1000 / N);
  return ', fin estimée vers ' + hhmm(end) + (tot / N > 86400 ? ' (dans ' + Math.round(tot / N / 3600) + ' h)' : '');
}
function launch() {
  const ch = fork(__filename, [], { env: Object.assign({}, process.env, { NUIT_WORKER: '1' }), stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  try { os.setPriority(ch.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
  running++; let cur = null;
  const give = () => {
    if (stopping || next >= todo.length || (stopAt && new Date() >= stopAt)) { cur = null; ch.send(null); return; }
    cur = todo[next++]; ch.send(cur);
  };
  ch.on('message', m => {
    if (m.ready) return give();
    if (m.ok) {
      const r = Object.assign({ key: m.key }, m.ok); fs.appendFileSync(RES, JSON.stringify(r) + '\n'); finished++;
      const s = secsBy[r.exp_id] || (secsBy[r.exp_id] = { sum: 0, n: 0 }); s.sum += r.secs; s.n++;
      const el = (Date.now() - t0) / 60000;
      console.log('[' + hhmm(new Date()) + '] ' + (done.size + finished) + '/' + jobs.length + '  ' + r.exp_id + '  ' + r.label + '  carte ' + r.seed + ' : score ' + r.score + ', rang ' + r.rank + (r.alive ? '' : ' (éliminé tour ' + r.deathTurn + ')') + '   ' + (finished / el).toFixed(1) + ' parties/min' + eta());
      if (finished % 5 === 0) writeReport();
    } else if (m.error) {
      fs.appendFileSync(ERRS, '=====' + m.key + '\n' + m.error + '\n'); console.log('ERREUR sur ' + m.key + ' (voir erreurs.txt)');
    }
    give();
  });
  ch.on('exit', code => {
    running--;
    if (cur && code) { fs.appendFileSync(ERRS, '=====' + cur.key + '\nl\'ouvrier s\'est arrêté (code ' + code + ')\n'); if (!stopping) launch(); }
    if (!running) { writeReport(); console.log('\nTerminé : ' + finished + ' parties jouées en ' + Math.round((Date.now() - t0) / 60000) + ' min. Rapport : ' + REPORT); process.exit(0); }
  });
}
process.on('SIGINT', () => { if (stopping) process.exit(1); stopping = true; console.log('\nArrêt demandé : les parties en cours sont abandonnées, les résultats déjà écrits restent. Relancer reprend.'); writeReport(); process.exit(0); });
for (let i = 0; i < N; i++) launch();
