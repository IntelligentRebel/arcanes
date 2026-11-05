// Audit 2 : diplomatie (exigences et ultimatums sans réponse), pactes.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Diplomacy, Pacts, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const fresh = () => {
  const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
  const pl = g.players[0], ai = g.players[1];
  pl.contact[1] = true; ai.contact[0] = true; pl.diplo[1] = ai.diplo[0] = 'none'; pl.relations[1] = ai.relations[0] = 0;
  g.turn = 40;
  return { g, pl, ai };
};
// l'exigence posée en fin de tour 40 se lit au tour 41 ; le joueur la laisse sans réponse : à la fin du tour 41, c'est un refus
// (au tour 42, les propositions du tour 40 ne sont plus présentées : pendingOffers les retire)
const ignore = (g, pl) => {
  g.turn = 41; const seen = Diplomacy.pendingOffers(g, pl).length; Diplomacy.expireDemands(g);
  g.turn = 42; Diplomacy.pendingOffers(g, pl); Diplomacy.expireDemands(g);
  return seen;
};

// 1. ultimatum ignoré : la guerre
{
  const { g, pl, ai } = fresh();
  Diplomacy.offer(g, pl, { from: 1, kind: 'demand', turn: 40, gold: 50, ultimatum: true });
  const seen = ignore(g, pl);
  ok(seen === 1 && pl.diplo[1] === 'war', 'ultimatum vu au tour 41, laissé sans réponse : ' + Diplomacy.stateName(pl.diplo[1]));
  ok(g.log.some(l => /Sans réponse/.test(l.text || '')), 'le journal le dit : « Sans réponse de votre part… »');
}
// 2. simple exigence ignorée : il vous en veut (−15)
{
  const { g, pl, ai } = fresh();
  Diplomacy.offer(g, pl, { from: 1, kind: 'demand', turn: 40, gold: 50, ultimatum: false });
  ignore(g, pl);
  ok(ai.relations[0] <= -15 && pl.diplo[1] === 'none', 'exigence ignorée : son attitude ' + ai.relations[0] + ', pas de guerre');
}
// témoin : refusée pendant le tour 41, elle n'est pas comptée deux fois
{
  const { g, pl, ai } = fresh();
  const off = { from: 1, kind: 'demand', turn: 40, gold: 50, ultimatum: false };
  Diplomacy.offer(g, pl, off);
  g.turn = 41; Diplomacy.dropOffer(pl, off); Diplomacy.refuseOffer(g, pl, off); Diplomacy.expireDemands(g);
  ok(ai.relations[0] === -15, 'témoin : refusée à temps, −15 une seule fois (' + ai.relations[0] + ')');
}

// 3. l'Archiviste aveugle : refuser de payer fait oublier le sort ; on n'en achève pas l'incantation
{
  const { g, pl } = fresh();
  const id = 'heroism'; if (!pl.known.includes(id)) pl.known.push(id);
  pl.casting = { id, progress: 5, cost: DATA.spells[id].cost, target: null };
  const pact = { entity: 'archivist', turn: 15, due: 40, state: 'due', data: { spell: id, mana: 300 } };
  (pl.pacts = pl.pacts || []).push(pact);
  Pacts.settle(g, pl, pact, 'refuse');
  ok(!pl.known.includes(id) && !(pl.casting && pl.casting.id === id), 'Archiviste refusé : ' + DATA.spells[id].name + ' oublié, incantation ' + (pl.casting ? 'en cours (' + pl.casting.id + ')' : 'abandonnée'));
}

// 4. guerre ouverte par une attaque (sans déclaration) : comme une guerre déclarée, elle efface les frontières fermées ;
//    la paix revenue, le territoire n'est pas de nouveau interdit en silence
{
  const { g, pl, ai } = fresh();
  Diplomacy.setState(g, 0, 1, 'peace');
  Diplomacy.closeBorders(g, 0, 1, true);
  const before = E.Move.closedBy(g, 1).has(0);
  Diplomacy.onAttack(g, 0, 1);
  const war = pl.diplo[1] === 'war' && !(pl.closedTo && pl.closedTo[1]);
  Diplomacy.setState(g, 0, 1, 'peace');
  ok(before && war && !E.Move.closedBy(g, 1).has(0), 'attaque sous la paix : guerre, frontières fermées effacées ; la paix revenue, territoire ouvert');
}
// témoin : la guerre déclarée les efface déjà
{
  const { g, pl, ai } = fresh();
  Diplomacy.setState(g, 0, 1, 'peace');
  Diplomacy.closeBorders(g, 0, 1, true);
  Diplomacy.declareWar(g, 0, 1, -20);
  Diplomacy.setState(g, 0, 1, 'peace');
  ok(!E.Move.closedBy(g, 1).has(0), 'témoin : guerre déclarée puis paix, territoire ouvert');
}
