// v0.31.75 : la file d'incantations (moteur). Le sort suivant commence au début du tour où la place se libère, sur la
// compétence qui reste ; une entrée devenue impossible est retirée et le journal le dit. L'IA n'a pas de file.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Spells, Magic, Turn, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };

const newGame = seed => {
  const g = Game.newGame({ seed, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 6, chaos: 5 }, retorts: [], race: 'highmen' } });
  const me = g.players[0]; me.human = true; me.mana = 100000;
  return g;
};
// des sorts sans cible, que le sorcier peut lancer
const noTarget = (g, pl) => Spells.castable(g, pl).filter(id => Spells.overlandTarget(id) === 'none' && Spells.validate(g, pl, id, null).ok && DATA.spells[id].kind === 'summon');
{
  const g = newGame(21), me = g.players[0];
  for (const id of ['giant_spiders', 'hell_hounds', 'fire_elemental', 'phantom_warriors', 'nagas']) if (DATA.spells[id] && !me.known.includes(id)) me.known.push(id);
  const L = noTarget(g, me);
  ok(L.length >= 2, 'des invocations à mettre en file (' + L.join(', ') + ')');
  const [a, b] = L;
  // une incantation qui aboutit au début du prochain tour, deux sorts derrière elle
  me.casting = { id: a, target: null, progress: 0, cost: 400 };
  me.castQueue = [{ id: b, target: null }, { id: 'unknown_spell_zz', target: null }];
  me.casting.progress = me.casting.cost - 1;
  const units0 = Object.values(g.units).filter(u => u.owner === me.id).length;
  Game.startTurnFor(g, me);
  const units1 = Object.values(g.units).filter(u => u.owner === me.id).length;
  ok(units1 > units0, 'l\'incantation en cours aboutit');
  ok(!me.castQueue.some(q => q.id === b), 'le premier sort de la file a commencé (' + (me.casting ? me.casting.id + ' ' + me.casting.progress + '/' + me.casting.cost : 'lancé aussitôt') + ')');
  ok((me.casting && me.casting.id === b) || Object.values(g.units).filter(u => u.owner === me.id).length > units1, 'il incante ' + DATA.spells[b].name + ', ou l\'a déjà lancé');
  // un sort inconnu : retiré, le journal le dit
  if (me.casting) { me.casting.progress = me.casting.cost; }
  const n0 = g.log.length;
  Game.startTurnFor(g, me);
  ok(!(me.castQueue || []).length, 'la file est vide');
}
{
  // une cible devenue impossible : retirée avec la raison
  const g = newGame(22), me = g.players[0];
  const u = Object.values(g.units).find(x => x.owner === me.id);
  for (const k of ['guardian_wind', 'resist_magic', 'flight', 'shatter', 'warp_creature']) if (DATA.spells[k] && !me.known.includes(k)) me.known.push(k);
  const id = Spells.castable(g, me).find(s => Spells.overlandTarget(s) === 'friendlyUnit' && Spells.validate(g, me, s, { unit: u.id }).ok);
  ok(!!id, 'un enchantement d\'unité à mettre en file (' + id + ')');
  if (id) {
    me.castQueue = [{ id, target: { unit: 999999 } }];
    const n0 = g.log.length;
    Game.startTurnFor(g, me);
    const txt = g.log.slice(n0).map(e => e.text).join(' | ');
    ok(!me.castQueue.length && /retiré de la file d'incantations/.test(txt), 'une cible disparue : le sort quitte la file, le journal le dit (' + txt.slice(0, 120) + ')');
    ok(!me.casting, 'et rien ne se lance à sa place');
  }
}
{
  // l'IA : jamais de file
  (async () => {
    const g = newGame(23);
    for (const p of g.players) { p.human = false; p.aiLevel = 'hard'; }
    for (let t = 0; t < 30; t++) await Turn.endTurn(g);
    ok(g.players.every(p => !p.castQueue), 'l\'IA ne se sert pas de la file');
  })();
}
