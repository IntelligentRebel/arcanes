// v0.31.7 : traverser une case pleine (cité amie) pour attaquer la case d'après ; si le groupe y reste (défaite), il revient d'où il venait.
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, World, Cities, Units, Move, T } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const setup = (foeType, foeN) => {
  const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
  const pl = g.players[0], w = g.world, cap = g.cities[pl.fortress], P = cap.plane;
  const land = (x, y) => World.inY(w, y) && !World.isWaterAt(w, P, x, y) && World.terr(w, P, x, y) !== T.MOUNTAIN && !Cities.at(g, P, World.wx(w, x), y);
  // une cité amie C, le groupe à l'ouest S, l'ennemi à l'est E, en ligne
  let C = null;
  for (let r = 3; r < 15 && !C; r++) for (let dy = -r; dy <= r && !C; dy++) { const x = World.wx(w, cap.x + r), y = cap.y + dy; if (land(x - 1, y) && land(x, y) && land(x + 1, y) && !Units.at(g, P, x + 1, y).length) C = [x, y]; }
  const c = Cities.create(g, pl.id, 'highmen', P, C[0], C[1], { pop: 4000 });
  for (const u of Units.at(g, P, C[0], C[1])) Units.remove(g, u);
  for (let i = 0; i < 4; i++) Units.create(g, 'HighMenSpearmen', pl.id, P, C[0], C[1]);
  const S = [World.wx(w, C[0] - 1), C[1]], Ex = [World.wx(w, C[0] + 1), C[1]];
  for (const u of Units.at(g, P, S[0], S[1])) Units.remove(g, u);
  World.set(w, P, 'road', S[0], S[1], 1);   // une route jusqu'à la cité : la traverser ne coûte qu'un demi-point
  const grp = []; for (let i = 0; i < 8; i++) grp.push(Units.create(g, 'HighMenCavalry', pl.id, P, S[0], S[1]));
  for (let i = 0; i < foeN; i++) Units.create(g, foeType, -1, P, Ex[0], Ex[1]);
  for (const u of grp) { u.moves = Units.maxMoves(g, u); u.path = [C, Ex]; u.dest = Ex; u.status = 'goto'; u.attackOrder = Game.attackTarget(g, pl.id, P, Ex[0], Ex[1]); }
  return { g, pl, P, C, S, Ex, grp };
};
const most = (g, pid) => { const n = {}; for (const u of Object.values(g.units)) if (u.owner === pid) { const k = u.plane + ',' + u.x + ',' + u.y; n[k] = (n[k] || 0) + 1; } return Math.max(...Object.values(n)); };
(async () => {
  E.Game.hooks = Object.assign(E.Game.hooks || {}, { choose: null });
  { const A = setup('Skeleton', 1);
    const r = await Game.continueMove(A.g, A.grp.map(u => u.id), { attackOrder: true });
    ok(r.attacked, 'huit cavaliers traversent la cité pleine (4 + 8) et attaquent derrière (' + (r.why || 'attaque') + ')');
    ok(most(A.g, A.pl.id) <= 9, 'après le combat : aucune case à plus de 9 (' + most(A.g, A.pl.id) + ')'); }
  { const B = setup('GreatDrake', 6);
    const r = await Game.continueMove(B.g, B.grp.map(u => u.id), { attackOrder: true });
    const alive = B.grp.filter(u => B.g.units[u.id]);
    ok(r.attacked, 'contre plus fort : l\'attaque a lieu');
    const inCity = Units.at(B.g, B.P, B.C[0], B.C[1]).filter(u => u.owner === B.pl.id).length;
    ok(most(B.g, B.pl.id) <= 9, 'défaite : ' + alive.length + ' survivants, ' + inCity + ' unités dans la cité, aucune case à plus de 9');
  }
  // défaite sans perte (repli) : les huit restent en vie et la cité ne peut pas les garder
  { const F = setup('GreatDrake', 6);
    const realAttack = Game.attack; Game.attack = async () => ({ ok: true, withdrew: true });   // un combat dont on se replie, sans perte
    const r = await Game.continueMove(F.g, F.grp.map(u => u.id), { attackOrder: true }); Game.attack = realAttack;
    ok(r.attacked && F.grp.every(u => u.x === F.S[0] && u.y === F.S[1]) && most(F.g, F.pl.id) <= 9, 'repli : les huit reviennent sur leur case de départ (' + F.grp.filter(u => u.x === F.S[0]).length + '/8)');
  }
  { const D = setup('Skeleton', 1);
    for (const u of D.grp) u.attackOrder = false;
    D.pl.human = true;
    const r = await Game.continueMove(D.g, D.grp.map(u => u.id), {});
    ok(!r.attacked && most(D.g, D.pl.id) <= 9, 'joueur sans ordre d\'attaque : pas de traversée vers l\'ennemi (' + r.why + ')');
  }
})();
