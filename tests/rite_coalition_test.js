// v0.31.2 : seule la coalition invoque le Démon légendaire ; en essai (truestanding), la force globale de chacun connue telle qu'elle est.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;   // le jeu livré
const { Game, Units, Diplomacy, Rite, AI, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 3, difficulty: 'hardcore', crisis: 'off', aiLevels: ['hardcore', 'hardcore', 'hardcore'], human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
const P = g.players.filter(p => p.alive);
for (const a of P) for (const b of P) if (a !== b) { a.contact[b.id] = true; a.diplo[b.id] = a.diplo[b.id] || 'none'; }
g.turn = 80;
const [hum, p1, p2, p3] = P;
// qui voit qui en meneur : imposé, pour éprouver la règle seule
const sees = {};
const lf = Diplomacy.leaderFor;
Diplomacy.leaderFor = (game, a) => sees[a.id] != null ? { id: sees[a.id], t: 0.5 } : null;
sees[p2.id] = p1.id;
ok(!Rite.leader(g), 'une seule IA voit en ' + p1.name + ' le meneur : pas de pacte');
sees[p3.id] = p1.id;
const L = Rite.leader(g);
ok(L === p1, 'deux IA le voient : le pacte le vise');
const ms = Rite.members(g, p1.id).map(p => p.id).sort();
ok(JSON.stringify(ms) === JSON.stringify([hum.id, p2.id, p3.id].sort()), 'membres : la coalition et le joueur (qui choisit d\'y entrer)');
sees[p3.id] = p2.id;   // p3 voit autrement : il n'en est plus
ok(!Rite.members(g, p1.id).includes(p3), 'qui voit un autre meneur n\'est pas du pacte');
// le rituel commencé, la coalition se défait : il s'interrompt
sees[p3.id] = p1.id;
g.rite = null; Rite.tick(g);
ok(g.rite && g.rite.phase === 'ritual' && g.rite.target === p1.id, 'le rituel commence contre ' + p1.name);
delete sees[p2.id]; delete sees[p3.id];
Rite.tick(g);
ok(g.rite && g.rite.phase === 'cool', 'plus personne ne le voit en meneur : le rituel s\'interrompt (' + (g.rite && g.rite.phase) + ')');
// l'ancien pacte (banc) : ouvert à tous ceux qui le connaissent
g.opts.rite = { coalition: false };
ok(Rite.members(g, p1.id).length === P.length - 1, 'ancien pacte : tous ceux qui le connaissent (' + Rite.members(g, p1.id).length + ')');
g.opts.rite = null;
Diplomacy.leaderFor = lf;

// la force globale connue (essai) : le meneur au sens des vrais chiffres, pas de ce qu'on en voit
for (let i = 0; i < 40; i++) Units.create(g, 'Paladin', p1.id, g.cities[p1.fortress].plane, g.cities[p1.fortress].x, g.cities[p1.fortress].y);
const truth = [p1, p2, p3, hum].map(p => Math.round(Rite.standing(g, p)));
E.AI.LAB = true; g.turn = 81;
const a = Diplomacy.leaderFor(g, p2, 1.25, 1.6);
ok(a && a.id === p1.id, 'avec la force globale connue, ' + p2.name + ' voit en ' + p1.name + ' le meneur (vrais poids ' + truth.join(', ') + ')');
E.AI.LAB = false; g.turn = 82;
const b = Diplomacy.leaderFor(g, p2, 1.25, 1.6);
console.log('      sans : ' + (b ? 'meneur ' + g.players[b.id].name : 'pas de meneur') + ' (armée de ' + p1.name + ' estimée d\'après ce qu\'il en a vu)');
