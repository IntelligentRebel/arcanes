// v0.31.26 (réglage retinue du pacte, à l'essai au banc) : le rituel invoque le Démon légendaire avec un cortège de Chevaliers
// de la mort, sans entretien, qui marchent avec lui et disparaissent à la fin du pacte.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, Turn, Rite, Magic } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  for (const n of [0, 4]) {
    const g = Game.newGame({ seed: 12, mapW: 60, mapH: 40, opponents: 2, difficulty: 'hardcore', crisis: 'off', rite: { retinue: n, muster: 0, minTurn: 9999 }, human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
    g.players[0].human = false; g.players[0].aiLevel = 'hardcore';
    const owner = g.players[1];
    g.players[0].diplo[1] = 'war'; owner.diplo[0] = 'war'; g.players[0].contact[1] = owner.contact[0] = true;
    E.Rite.contributors = () => [owner.id]; E.Rite.ownerOf = () => owner;
    const r = g.rite = { phase: 'ritual', target: 0, progress: 999, cost: 600, paid: {}, join: {}, start: g.turn };
    Rite.summon(g, r);
    const d = g.units[r.demon];
    const ret = Object.values(g.units).filter(u => u.riteRetinue);
    ok(!!d && ret.length === n, 'cortège de ' + n + ' : ' + ret.length + ' unités');
    ok(ret.every(u => u.x === d.x && u.y === d.y && u.riteEscort === d.id && E.Units.upkeep(g, u).mana === 0), 'sur sa case, sans entretien');
    for (let t = 0; t < 4 && g.rite.phase === 'demon'; t++) await Turn.endTurn(g);
    const dd = g.units[r.demon];
    if (n && dd) ok(Object.values(g.units).filter(u => u.riteRetinue).some(u => u.x === dd.x && u.y === dd.y), 'le cortège marche avec le démon');
    Rite.end(g, 'caught');
    ok(!Object.values(g.units).some(u => u.riteRetinue), 'fin du pacte : le cortège disparaît');
  }
})();
