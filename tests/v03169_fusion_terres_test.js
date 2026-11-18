// v0.31.69 : fusionner un esprit avec un nœud demande du mouvement restant, comme dans MoM ; l'écart des terres émergées
// est élargi (22, 36 et 55 % au lieu de 28, 36 et 45 %).
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, Units, World } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const mk = (seed, ls) => Game.newGame({ seed, mapW: 60, mapH: 40, landSize: ls || 'medium', opponents: 3, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });

// 1. la fusion
{
  const g = mk(5), me = g.players[0];
  const nd = g.sites.find(s => s.type === 'node' && s.owner < 0 && s.plane === 0);
  nd.guardians = []; nd.cleared = true;
  const sp = Units.create(g, 'MagicSpirit', me.id, nd.plane, nd.x, nd.y);
  sp.moves = 0;
  const c0 = Game.canMeld(g, sp), r0 = Game.meld(g, sp.id);
  ok(!c0.ok && /mouvement/.test(c0.why) && !r0.ok && nd.owner < 0 && g.units[sp.id], 'esprit à 0 mouvement sur un nœud libre : pas de fusion (' + c0.why + ')');
  sp.moves = 1;
  const r1 = Game.meld(g, sp.id);
  ok(r1.ok && nd.owner === me.id && !g.units[sp.id], 'avec un demi-point de mouvement : le nœud est lié');
  // les chances contre un nœud tenu restent les nôtres
  const gs = Units.create(g, 'GuardianSpirit', me.id, nd.plane, nd.x, nd.y); gs.moves = 0;
  ok(!Game.canMeld(g, gs).ok, 'esprit gardien à 0 mouvement sur son propre nœud : pas de relève de garde');
  gs.moves = 2;
  ok(Game.canMeld(g, gs).ok, 'avec du mouvement : il relève la garde');
}
// 2. les terres émergées
for (const [ls, want] of [['small', 22], ['medium', 36], ['large', 55]]) {
  const g = mk(7, ls); let n = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) if (!World.isWaterAt(g.world, 0, x, y)) n++;
  const pct = Math.round(100 * n / 2400);
  ok(Math.abs(pct - want) <= 1 && g.players.every(p => g.cities[p.fortress]), 'terres « ' + ls + ' » : ' + pct + ' % (attendu ' + want + '), chaque sorcier a sa forteresse');
}
