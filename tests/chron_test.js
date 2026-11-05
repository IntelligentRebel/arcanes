// v0.30.0 : la chronique de la partie (courbes, batailles, moments clés), sans fuite d'information en cours de partie
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, Turn, Chronicle, AI } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { chaos: 6, death: 5 }, retorts: [], race: 'highelf' } });
  const me = g.players[0]; me.human = false;   // le joueur joue comme une IA : la partie avance seule
  for (let i = 0; i < 70 && !g.over; i++) { try { await AI.takeTurn(g, me); } catch (e) { } await Turn.endTurn(g); }
  me.human = true;
  const ch = g.chron;
  ok(ch && ch.rows.length >= 60, 'un relevé par tour : ' + ch.rows.length + ' (tour ' + g.turn + ')');
  ok(ch.rows.every(r => r.r.every(x => x.length === 9)), 'lignes complètes (9 colonnes)');
  const kinds = {}; for (const e of ch.ev) kinds[e.k] = (kinds[e.k] || 0) + 1;
  ok(Object.keys(kinds).length >= 3, 'moments notés : ' + JSON.stringify(kinds));
  ok(ch.battles.length > 0, U_n(ch.battles.length) + ' batailles notées, la plus grande : force ' + Math.max(...ch.battles.map(b => b.size)));
  const big = ch.battles.slice().sort((a, b) => b.size - a.size)[0];
  if (big) console.log('     ', JSON.stringify(Chronicle.battleText(g, big, null, true)), JSON.stringify(big).slice(0, 220));
  // en cours de partie : rien d'un rival jamais rencontré
  const unmet = g.players.find(p => p !== me && !me.contact[p.id]);
  const s1 = Chronicle.series(g, me.id, 'cities', false), s2 = Chronicle.series(g, me.id, 'cities', true);
  ok(s2.size === g.players.length || s2.size >= 3, 'révélé : ' + s2.size + ' sorciers sur la courbe des cités');
  if (unmet) ok(!s1.has(unmet.id), 'en cours de partie, ' + unmet.name + ' (jamais rencontré) n\'apparaît pas');
  const pop = Chronicle.series(g, me.id, 'pop', false);
  ok([...pop.keys()].every(id => id === me.id), 'habitants : seulement les vôtres en cours de partie');
  const vis = ch.ev.filter(e => Chronicle.visible(g, e, me.id, false));
  ok(vis.every(e => e.pub || [e.a, e.b, e.d].includes(me.id)), 'moments visibles : publics ou vous concernant (' + vis.length + ' sur ' + ch.ev.length + ')');
  for (const e of ch.ev.slice(-12)) console.log('      t' + e.t + ' ' + Chronicle.text(g, e, me.id, false) + '  |  ' + Chronicle.text(g, e, me.id, true));
  const js = JSON.stringify(g.chron).length; ok(js < 200000, 'taille dans la sauvegarde : ' + Math.round(js / 1024) + ' Ko');
})();
function U_n(n) { return n; }
