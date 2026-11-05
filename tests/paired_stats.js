'use strict';
// Résume un fichier de résultats partiels de tests/paired.js (--out x.json → x.json.part) : utile si la mesure a été interrompue.
// node tests/paired_stats.js fichier.part [variante_de_référence]
const fs = require('fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => !r.error);
const labels = [...new Set(rows.map(r => r.label))];
const base = process.argv[3] || labels[0];
const fmt = x => (x >= 0 ? '+' : '') + x.toFixed(0);
function paired(l, k) {
  const d = rows.filter(r => r.label === l && r[k] != null).map(r => { const b = rows.find(x => x.label === base && x.seed === r.seed); return b && b[k] != null ? r[k] - b[k] : null; }).filter(x => x != null);
  const mu = d.reduce((s, x) => s + x, 0) / Math.max(1, d.length), sd = d.length > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - mu) ** 2, 0) / (d.length - 1)) : 0;
  return fmt(mu) + ' ± ' + (sd / Math.sqrt(Math.max(1, d.length))).toFixed(0) + ' (' + d.filter(x => x > 0).length + '/' + d.length + ')';
}
for (const l of labels) {
  const a = rows.filter(r => r.label === l), m = k => a.reduce((s, r) => s + (+r[k] || 0), 0) / a.length;
  let line = l.padEnd(34) + String(a.length).padStart(4) + ' parties  score ' + m('score').toFixed(0).padStart(5) + '  rang ' + m('rank').toFixed(2) + '  cités ' + m('cities').toFixed(1) + '  survie ' + Math.round(100 * m('alive')) + '%';
  if (a.some(r => r.score150 != null)) line += '  t150 ' + m('score150').toFixed(0) + ' (rang ' + m('rank150').toFixed(2) + ')';
  if (a.some(r => r.caps != null)) line += '  prises ' + m('caps').toFixed(1) + ' pertes ' + m('lost').toFixed(1);
  const rd = a.filter(r => r.raid); if (rd.length) line += '  raids ' + (rd.reduce((s, r) => s + r.raid.hunts, 0) / a.length).toFixed(1) + ' (gagnés ' + (rd.reduce((s, r) => s + r.raid.wins, 0) / a.length).toFixed(1) + ', civils ' + (rd.reduce((s, r) => s + r.raid.civ, 0) / a.length).toFixed(1) + ')';
  if (a.some(r => r.tailored)) line += '  taillés ' + m('tailored').toFixed(0);
  console.log(line);
  if (l !== base) console.log('    contre ' + base + ' : score ' + paired(l, 'score') + (a.some(r => r.score150 != null) ? '   t150 ' + paired(l, 'score150') : ''));
}
