'use strict';
// Simulation de parties complètes entre IA : détecte les plantages et mesure les performances.
const { loadEngine } = require('./load');

async function run(seed, turns, verbose) {
  const E = loadEngine();
  const t0 = Date.now();
  const game = E.Game.newGame({
    seed, mapW: 60, mapH: 40, landSize: 'medium', opponents: 3, difficulty: 'normal',
    human: { name: 'Testeur', portrait: 1, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' },
  });
  game.players[0].human = false; // tout le monde est piloté par l'IA
  const tGen = Date.now() - t0;
  let tTurns = 0;
  for (let i = 0; i < turns && !game.over; i++) {
    const t = Date.now();
    await E.Turn.endTurn(game);
    tTurns += Date.now() - t;
    if (verbose && game.turn % 25 === 0) {
      console.log('tour', game.turn, game.players.map(p => p.name + ':' + (p.alive ? E.Cities.ofPlayer(game, p.id).length + 'c/' + Object.values(game.units).filter(u => u.owner === p.id).length + 'u/' + p.known.length + 's/' + E.Magic.power(game, p) + 'p/' + Math.round(p.gold) + 'g' : 'mort')).join('  '));
    }
  }
  const json = JSON.stringify(Object.assign({}, game, { rng: game.rng.s }));
  return { game, E, tGen, tTurns, size: json.length };
}

(async () => {
  const seeds = process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 2, 3];
  const turns = Number(process.argv[3] || 120);
  for (const s of seeds) {
    try {
      const r = await run(s, turns, true);
      const g = r.game;
      console.log(`seed ${s}: génération ${r.tGen} ms, ${g.turn - 1} tours en ${r.tTurns} ms (${Math.round(r.tTurns / Math.max(1, g.turn - 1))} ms/tour), sauvegarde ${Math.round(r.size / 1024)} Ko, fin=${g.over} gagnant=${g.winner}`);
      const lairs = g.sites.filter(x => x.cleared).length;
      console.log('  lieux dégagés', lairs, '/', g.sites.length, ' cités', Object.keys(g.cities).length, ' unités', Object.keys(g.units).length);
    } catch (e) { console.error('seed', s, 'ERREUR', e.stack); process.exitCode = 1; }
  }
})();
