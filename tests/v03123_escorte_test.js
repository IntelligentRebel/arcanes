// v0.31.23 (réglage escort du pacte, à l'essai au banc) : le maître du Démon légendaire lui forme une escorte de volants
// rapides, qui le rejoignent et marchent avec lui ; sans le réglage, le démon marche seul comme avant ; à la fin du pacte,
// l'escorte rentre dans le rang.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Units, World, Cities, Turn, AI, Rite, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };

async function setup(escort, ownerRace) {
  const g = Game.newGame({ seed: 12, mapW: 60, mapH: 40, opponents: 2, difficulty: 'hardcore', crisis: 'off', rite: { escort, muster: 3, minTurn: 9999 },
    human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
  g.players[0].human = false; g.players[0].aiLevel = 'hardcore';
  const owner = g.players[1], fc = g.cities[owner.fortress];
  if (ownerRace) fc.race = ownerRace;
  // une cité avancée : tous les bâtiments (les unités rapides en demandent)
  for (const b of Object.keys(DATA.buildings)) if (!DATA.buildings[b].unique && !DATA.buildings[b].wonder) fc.buildings[b] = 1;
  owner.gold = 3000;
  for (const p of [0, 1]) { g.players[p].contact[1 - p] = true; }
  g.players[0].diplo[1] = 'war'; owner.diplo[0] = 'war';
  const d = Units.create(g, 'RiteDemon', owner.id, fc.plane, fc.x, fc.y); d.riteDemon = true;
  g.rite = { phase: 'demon', target: 0, owner: owner.id, demon: d.id, summoned: g.turn, progress: 0, cost: 0, paid: {}, join: {}, start: g.turn, ownerWar: true };
  return { g, owner, d, fc };
}

(async () => {
  // 1. réglage 3, maître hauts-elfes (Pégases) : des volants rapides en route, qui le rejoignent
  {
    const { g, owner, d, fc } = await setup(3, 'highelf');
    const peg = [0, 1, 2].map(() => Units.create(g, 'Pegasai', owner.id, fc.plane, fc.x, fc.y));
    const slow = Units.create(g, 'HighElfSpearmen', owner.id, fc.plane, fc.x, fc.y);
    ok(AI.escortNeed(g, owner, g.rite) === 3, 'palier 3 (Pégases)');
    let maxTile = 0, prodEsc = false;
    for (let t = 0; t < 8 && g.rite.phase === 'demon'; t++) {
      await Turn.endTurn(g);
      const dd = g.units[d.id]; if (!dd) break;
      const tile = Units.at(g, dd.plane, dd.x, dd.y).filter(u => u.riteEscort === d.id);
      maxTile = Math.max(maxTile, tile.length);
      if (Cities.ofPlayer(g, owner.id).some(c => c.aiRiteEsc === d.id && c.prod.type === 'unit' && AI.escortTypeFits(c.prod.id, 3))) prodEsc = true;
    }
    ok(maxTile >= 3, 'les Pégases marchent avec le démon (au plus ' + maxTile + ' sur sa case)');
    ok(!slow.riteEscort, 'les lanciers (2 cases) n\'en sont pas');
    const esc = Object.values(g.units).filter(u => u.riteEscort === d.id);
    ok(esc.every(u => DATA.units[u.type].flying && Units.stats(g, u).move >= 3), 'escorte : que des volants à 3 cases et plus');
    ok(prodEsc || esc.length >= 4, 'des Pégases en chantier pour l\'escorte, ou déjà là');
    Rite.end(g, 'caught');
    ok(!Object.values(g.units).some(u => u.riteEscort != null) && !Object.values(g.cities).some(c => c.aiRiteEsc != null), 'pacte fini : l\'escorte rentre dans le rang');
    ok((g.riteStats.escorts || 0) >= 3, 'statistique : escorte du démon (' + g.riteStats.escorts + ')');
  }
  // 2. réglage 3, maître hauts-hommes (aucun volant rapide) : pas d'escorte ; réglage 2 : ses cavaliers
  {
    const { g, owner } = await setup(3, 'highmen');
    ok(AI.escortNeed(g, owner, g.rite) === 0, 'palier 3 sans volant rapide : le démon reste seul');
    const s2 = await setup(2, 'highmen');
    ok(AI.escortNeed(s2.g, s2.owner, s2.g.rite) === 2, 'réglage 2 : palier 2 faute de volants rapides');
    const cav = [0, 1].map(() => Units.create(s2.g, 'HighMenCavalry', s2.owner.id, s2.fc.plane, s2.fc.x, s2.fc.y));
    for (let t = 0; t < 3; t++) await Turn.endTurn(s2.g);
    ok(cav.some(u => s2.g.units[u.id] && u.riteEscort === s2.d.id), 'réglage 2 : les cavaliers escortent');
  }
  // 3. sans réglage : le démon seul, rien de changé
  {
    const { g, owner, d, fc } = await setup(0, 'highelf');
    [0, 1, 2].map(() => Units.create(g, 'Pegasai', owner.id, fc.plane, fc.x, fc.y));
    ok(AI.escortNeed(g, owner, g.rite) === 0, 'sans réglage : palier 0');
    for (let t = 0; t < 4; t++) await Turn.endTurn(g);
    ok(!Object.values(g.units).some(u => u.riteEscort != null) && !Object.values(g.cities).some(c => c.aiRiteEsc != null), 'sans réglage : aucune escorte');
  }
})();
