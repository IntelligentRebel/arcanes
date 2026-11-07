// v0.31.29 : un Désenchantement de zone sur un nœud rival fait tomber la garde de son esprit gardien ; un nœud volé au joueur
// est noté pour le message du début de tour.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, World, Spells, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 9, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
const P = g.players[0], R = g.players[1];
P.diplo[1] = R.diplo[0] = 'war'; P.contact[1] = R.contact[0] = true;
const s = g.sites.find(x => x.type === 'node'), si = g.sites.indexOf(s);
s.cleared = true; s.guardians = null; s.owner = R.id; s.meldBy = 'GuardianSpirit';
// 1. la cible est valable, le sort fait tomber la garde
ok(!Spells.tileCheck(g, P, 'disenchant_area', { plane: s.plane, x: s.x, y: s.y }), 'cible valable : ' + Spells.tileCheck(g, P, 'disenchant_area', { plane: s.plane, x: s.x, y: s.y }));
const H = E.OVERLAND_HANDLERS;
const res = H.disenchant_area(g, P, { plane: s.plane, x: s.x, y: s.y });
ok(s.meldBy === 'MagicSpirit' && s.owner === R.id, 'la garde tombe, le nœud reste au rival (' + res.msg + ')');
ok(g.log.some(e => e.pid === R.id && /esprit gardien/.test(e.text)), 'le rival l\'apprend');
// 2. un esprit magique du joueur peut de nouveau le prendre (75 %)
let took = 0;
for (let i = 0; i < 40; i++) {
  s.owner = R.id; s.meldBy = 'MagicSpirit';
  const u = Units.create(g, 'MagicSpirit', P.id, s.plane, s.x, s.y);
  Game.meld(g, u.id); if (s.owner === P.id) took++;
}
ok(took > 20 && took < 40, 'un esprit magique reprend un nœud sans garde : ' + took + ' sur 40');
// 3. un nœud volé au joueur humain est noté pour le message
P.human = true; s.owner = P.id; s.meldBy = 'MagicSpirit'; P.nodesLost = [];
for (let i = 0; i < 10 && s.owner === P.id; i++) { const u = Units.create(g, 'GuardianSpirit', R.id, s.plane, s.x, s.y); Game.meld(g, u.id); }
ok(s.owner === R.id && P.nodesLost.length === 1 && P.nodesLost[0].site === si && P.nodesLost[0].by === R.id && P.nodesLost[0].guardian === true, 'nœud volé : noté pour le joueur ' + JSON.stringify(P.nodesLost));
