// v0.31.70 : le palier de l'Archimage (deux fois le deuxième et autant que tous les autres réunis) se mesure, en Difficile, contre
// tous les sorciers des deux plans ; en Hardcore, contre le seul plan du joueur. La crise vise toujours le plan du joueur.
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, Finale } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const run = (lvl, cfg) => {
  const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, landSize: 'medium', opponents: 3, difficulty: lvl, crisis: 'off', finale: 'random',
    human: { name: 'Moi', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
  const H = g.players[0], boss = g.players.find(p => p.plane === 1), arc = g.players.find(p => p.plane === 0 && !p.human);
  g.opts.finaleCfg = Object.assign({ TIER_FORCE: 0 }, cfg || {});
  const f = g.finale; f.state = 'watch'; f.streak = 0; f.mode = 'random'; g.turn = 260;
  // le joueur pèse 2,5 fois son seul rival de plan, mais bien moins que le boss d'en face
  const R0 = Finale.ranked; Finale.ranked = () => [{ p: boss, v: 5000 }, { p: H, v: 1000 }, { p: arc, v: 400 }];
  for (let i = 0; i < 12 && f.state === 'watch'; i++) Finale.watch(g);
  Finale.ranked = R0;
  return { state: f.state, tier: f.tier, kind: f.kind, target: f.target === H.id };
};
const d = run('hard');
ok(d.state === 'omen' && d.target && d.tier === 2, 'Difficile : la crise vise le joueur, palier 2 (le boss compte dans « tous les autres ») : ' + JSON.stringify(d));
const d0 = run('hard', { ARCH_WIDE: 0 });
ok(d0.state === 'omen' && d0.tier === 3 && d0.kind === 'archmage', 'Difficile, réglage de banc ARCH_WIDE 0 : la mesure d\'avant, l\'Archimage');
const h = run('hardcore');
ok(h.state === 'omen' && h.target && h.tier === 3 && h.kind === 'archmage', 'Hardcore : le seul plan du joueur compte, l\'Archimage');
