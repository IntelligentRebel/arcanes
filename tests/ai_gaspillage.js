'use strict';
// L'IA gaspille-t-elle ses sorts ? Parties IA contre IA ; on relève chaque sort lancé, sur la carte et en combat,
// et ceux qui ne font rien : refusés au moment d'agir, sans effet, cible imbattable (résistance 50), soin sans blessé.
// node tests/ai_gaspillage.js [graines] [tours] [lab]      (lab : 1 = IA d'essai du banc, 0 = IA livrée)
const { loadEngine } = require('./load');
const seeds = (process.argv[2] || '5,6').split(',').map(Number), turns = Number(process.argv[3] || 120), lab = process.argv[4] === '1';

async function run(seed) {
  const E = loadEngine(); E.AI.LAB = lab;
  const { Game, Turn, Spells, CombatSpells, DATA } = E;
  const g = Game.newGame({ seed, mapW: 60, mapH: 40, landSize: 'medium', opponents: 3, difficulty: 'hard', crisis: 'off',
    human: { name: 'Témoin', portrait: 1, books: { chaos: 5, death: 5 }, retorts: [], race: 'orc' } });
  g.players[0].human = false;
  const stat = { map: {}, mapFail: {}, combat: {}, combatFail: {}, waste: [] };
  const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  // carte : chaque sort qui aboutit (lancé ou fin d'incantation)
  const apply0 = Spells.apply;
  Spells.apply = function (game, pl, id, target) {
    const r = apply0.apply(this, arguments);
    inc(stat.map, id); if (r && r.ok === false) { inc(stat.mapFail, id); if (stat.waste.length < 40) stat.waste.push('t' + game.turn + ' carte ' + id + ' : ' + (r.why || '')); }
    return r;
  };
  // combat : la cible est-elle imbattable, le sort sans effet ?
  const cast0 = CombatSpells.cast;
  CombatSpells.cast = function (bt, side, id, target, caster) {
    const pl = bt.player(side); if (!pl || pl.human) return cast0.apply(this, arguments);
    const n0 = bt.log.length, od = target && target.u ? CombatSpells.odds(bt, side, id, target, 0) : null;
    const r = cast0.apply(this, arguments);
    if (r !== false) {
      inc(stat.combat, id);
      const said = bt.log.slice(n0).join(' | ');
      const bad = (od && od.immune) || /sans effet|ne fait aucun dégât|Rien ne tombe|rien ne tombe|Aucune tour/.test(said);
      if (bad) { inc(stat.combatFail, id); if (stat.waste.length < 40) stat.waste.push('t' + bt.game.turn + ' combat ' + id + ' : ' + said.slice(0, 140)); }
    }
    return r;
  };
  for (let i = 0; i < turns && !g.over; i++) await Turn.endTurn(g);
  return stat;
}

(async () => {
  const tot = { map: {}, mapFail: {}, combat: {}, combatFail: {} }, waste = [];
  for (const s of seeds) {
    const st = await run(s);
    for (const k of ['map', 'mapFail', 'combat', 'combatFail']) for (const id in st[k]) tot[k][id] = (tot[k][id] || 0) + st[k][id];
    waste.push(...st.waste.map(w => 'graine ' + s + ' ' + w));
  }
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  console.log('IA ' + (lab ? 'd\'essai (banc)' : 'livrée') + ', graines ' + seeds.join(',') + ', ' + turns + ' tours');
  console.log('carte : ' + sum(tot.map) + ' sorts aboutis, ' + sum(tot.mapFail) + ' sans effet ' + JSON.stringify(tot.mapFail));
  console.log('combat : ' + sum(tot.combat) + ' sorts lancés, ' + sum(tot.combatFail) + ' gaspillés ' + JSON.stringify(tot.combatFail));
  console.log('les plus lancés en combat : ' + Object.entries(tot.combat).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ' ' + v).join(', '));
  for (const w of waste.slice(0, 25)) console.log('  ' + w);
})();
