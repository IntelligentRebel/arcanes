// v0.31.51 : Clairvoyance rapporte chaque tour la garnison de chaque cité étrangère, et le nombre de cités des rivaux
// devient exact : le renseignement s'améliore, la fourchette d'armée se resserre, sans que la carte sorte du brouillard
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false; const { Game, Intel, Spells, Turn, Move } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 3, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 6 }, retorts: [], race: 'highmen' } });
  for (let t = 0; t < 40; t++) await Turn.endTurn(g);
  const me = g.players.find(p => p.human), rivals = g.players.filter(p => p !== me && p.alive);
  for (const o of rivals) me.contact[o.id] = true;
  const o = rivals.reduce((a, b) => E.Cities.ofPlayer(g, b.id).length > E.Cities.ofPlayer(g, a.id).length ? b : a);
  const before = Intel.overview(g, me, o.id), fogBefore = Move.visibility(g, me.id)[0].reduce((s, v) => s + v, 0) + Move.visibility(g, me.id)[1].reduce((s, v) => s + v, 0);
  me.mana = 5000; if (!me.known.includes('awareness')) me.known.push('awareness');
  const r = Spells.apply(g, me, 'awareness', null);
  ok(me.globals.includes('awareness'), 'Clairvoyance lancée (' + (r && (r.msg || r.why)) + ')');
  const after = Intel.overview(g, me, o.id), real = E.Cities.ofPlayer(g, o.id);
  ok(after.a.cities.est === real.length && after.a.cities.lo === real.length && after.a.cities.hi === real.length, 'nombre de cités exact : ' + after.a.cities.est + ' (réel ' + real.length + ', avant ' + before.a.cities.est.toFixed(1) + ')');
  const reps = real.filter(c => me.intel[c.plane + ',' + c.x + ',' + c.y] && me.intel[c.plane + ',' + c.x + ',' + c.y].t === g.turn);
  ok(reps.length === real.length, 'un rapport du tour pour chacune de ses cités (' + reps.length + '/' + real.length + ')');
  const c0 = real[0], rep = me.intel[c0.plane + ',' + c0.x + ',' + c0.y], gar = E.Units.at(g, c0.plane, c0.x, c0.y).filter(u => !Intel.hiddenFrom(g, me.id, u));
  ok(rep.units.length === gar.length, 'le rapport donne la vraie garnison de ' + c0.name + ' (' + rep.units.length + ' unités)');
  ok(after.a.precision > before.a.precision + 0.15, 'renseignement : ' + Intel.intelLabel(before.a.precision) + ' (' + before.a.precision.toFixed(2) + ') -> ' + Intel.intelLabel(after.a.precision) + ' (' + after.a.precision.toFixed(2) + ')');
  ok((after.armyHi - after.armyLo) < (before.armyHi - before.armyLo), 'fourchette d\'armée : ' + before.armyLo + '-' + before.armyHi + ' -> ' + after.armyLo + '-' + after.armyHi + ' (réel ' + Math.round(Intel.armyOf(g, o, o.id)) + ')');
  const fogAfter = Move.visibility(g, me.id)[0].reduce((s, v) => s + v, 0) + Move.visibility(g, me.id)[1].reduce((s, v) => s + v, 0);
  ok(fogAfter === fogBefore, 'la carte reste dans le brouillard (cases vues : ' + fogBefore + ' -> ' + fogAfter + ')');
  // les tours suivants : rapports renouvelés à chaque début de tour
  await Turn.endTurn(g);
  const fresh = E.Cities.ofPlayer(g, o.id).filter(c => { const k = me.intel[c.plane + ',' + c.x + ',' + c.y]; return k && k.t === g.turn; }).length;
  ok(fresh === E.Cities.ofPlayer(g, o.id).length, 'au tour suivant, les rapports sont du tour (' + fresh + ')');
  // sans le sort : rien de tout ça
  me.globals = me.globals.filter(x => x !== 'awareness'); await Turn.endTurn(g);
  const stale = E.Cities.ofPlayer(g, o.id).filter(c => { const k = me.intel[c.plane + ',' + c.x + ',' + c.y]; return k && k.t === g.turn && !Move.visibility(g, me.id)[c.plane][c.y * g.world.w + c.x]; }).length;
  ok(stale === 0, 'sort dissipé : plus de rapport nouveau');
})();
