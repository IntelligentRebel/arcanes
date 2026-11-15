// v0.31.60 : envoyé sur Myrror, un rival reçoit la Myrrien en plus de ses aptitudes, sans rendre de livres ; Zirrakh, natif, y va presque toujours.
// v0.31.57 (idée de Cor'e) : les sorciers de la Mort, un peu ceux du Chaos, penchent vers Myrror ; ceux de la Vie restent plutôt
// sur Arcanus ; sans exclusive. Le nombre de sorciers par plan ne change pas.
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const on = {}, seen = {}; let counts = true;
for (let seed = 1; seed <= 300; seed++) {
  const g = Game.newGame({ seed, mapW: 40, mapH: 30, opponents: 3, otherPlane: 2, crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 6, nature: 5 }, retorts: [], race: 'highmen' } });
  const ai = g.players.filter(p => !p.human);
  if (ai.filter(p => p.retorts.includes('myrran')).length !== 2) counts = false;
  for (const p of ai) { seen[p.name] = (seen[p.name] || 0) + 1; if (p.retorts.includes('myrran')) on[p.name] = (on[p.name] || 0) + 1; }
}
const pct = n => Math.round(100 * (on[n] || 0) / seen[n]);
ok(counts, 'toujours deux sorciers sur l\'autre plan');
ok(pct('Vorgath') >= 65, 'Vorgath (Mort 9) sur Myrror : ' + pct('Vorgath') + ' % (au hasard : 40 %)');
ok(pct('Célestine') <= 5, 'Célestine (Vie 10) sur Myrror : ' + pct('Célestine') + ' % : rare (1 % sur 600 parties)');
ok(pct('Zirrakh') >= 75, 'Zirrakh, natif de Myrror, y démarre : ' + pct('Zirrakh') + ' %');
{ const v = Game.asMyrran(DATA.wizards.find(w => w.name === 'Vorgath'));
  ok(v.retorts.includes('infernalPower') && v.retorts.includes('myrran') && v.books.death === 9, 'Vorgath sur Myrror : Mort ' + v.books.death + ', ' + v.retorts.join(' + ')); }
ok(pct('Malivra') > pct('Azhemir') && pct('Azhemir') > pct('Solenkh'), 'Malivra ' + pct('Malivra') + ' % > Azhemir ' + pct('Azhemir') + ' % > Solenkh ' + pct('Solenkh') + ' %');
// joueur sur Myrror : ses voisins de plan sont plutôt les sorciers sombres
let dark = 0, n = 0;
for (let seed = 1; seed <= 150; seed++) {
  const g = Game.newGame({ seed, mapW: 40, mapH: 30, opponents: 3, otherPlane: 2, crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { death: 6 }, retorts: ['myrran'], race: 'darkElf' } });
  for (const p of g.players.filter(p => !p.human && p.retorts.includes('myrran'))) { n++; if (Game.darkLean(DATA.wizards.find(w => w.name === p.name)) >= 5) dark++; }
}
ok(n === 450 && dark / n > 0.45, 'joueur sur Myrror : 3 voisins, dont ' + Math.round(100 * dark / n) + ' % de sorciers sombres (Mort ou Chaos dominants)');
