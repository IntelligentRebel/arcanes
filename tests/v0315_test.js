// v0.31.5 : le territoire s'étend sous des troupes à qui il est interdit (cité prise, fondée) : elles sont reconduites à la frontière.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, World, Cities, Units, Diplomacy, T } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
const me = g.players[0], o = g.players[1], cap = g.cities[me.fortress], w = g.world;
me.contact[o.id] = o.contact[me.id] = true; Diplomacy.setState(g, me.id, o.id, 'peace');
Diplomacy.closeBorders(g, me.id, o.id, true);
// une case libre hors du territoire, à 6 ou 7 cases de la capitale
let spot = null;
for (let r = 6; r <= 9 && !spot; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const x = World.wx(w, cap.x + dx), y = cap.y + dy; if (!spot && World.inY(w, y) && !World.isWaterAt(w, cap.plane, x, y) && World.terr(w, cap.plane, x, y) !== T.MOUNTAIN && World.get(w, cap.plane, 'owner', x, y) < 0 && !Cities.at(g, cap.plane, x, y)) spot = [x, y]; }
const nb = World.neighbors(w, spot[0], spot[1]).find(([x, y]) => !World.isWaterAt(w, cap.plane, x, y) && World.terr(w, cap.plane, x, y) !== T.MOUNTAIN && !Cities.at(g, cap.plane, x, y));
const u = Units.create(g, 'HighMenSpearmen', o.id, cap.plane, nb[0], nb[1]);
ok(World.get(w, cap.plane, 'owner', u.x, u.y) !== me.id, 'au départ, la troupe de ' + o.name + ' est hors du territoire du joueur');
// le joueur fonde (ou prend) une cité juste à côté : le territoire s'étend sous ses pieds
Cities.create(g, me.id, 'highmen', cap.plane, spot[0], spot[1], { pop: 4000 });
const own = World.get(w, cap.plane, 'owner', u.x, u.y);
ok(own !== me.id, 'territoire étendu : la troupe est reconduite hors de chez le joueur (' + nb + ' → ' + u.x + ',' + u.y + ')');
ok(g.log.some(l => l.pid === o.id && /reconduite/.test(l.text)) && g.log.some(l => l.pid === me.id && /reconduite/.test(l.text)), 'les deux sorciers en sont avertis : « ' + (g.log.filter(l => l.pid === me.id).pop() || {}).text + ' »');
// en guerre : plus de frontière fermée, personne n'est reconduit
const u2 = Units.create(g, 'HighMenSpearmen', o.id, cap.plane, nb[0], nb[1]);
Diplomacy.setState(g, me.id, o.id, 'war'); Cities.updateTerritory(g);
ok(u2.x === nb[0] && u2.y === nb[1], 'en guerre, la troupe reste où elle est');
