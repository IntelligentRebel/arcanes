// v0.31.68 : en Difficile, la crise de fin ne regarde plus que les sorciers du plan du joueur, comme en Hardcore (au banc 25,
// « si le boss mène, pas de crise » la faisait tomber de 48 % à 7 % des parties) ; aux niveaux plus doux, la règle d'avant.
// Essai « seal » (banc 26) : traqué par le boss, le sorcier étudie et lance le Sceau planaire.
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, AI, Finale, Units, Cities, World } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const mk = (lvl, seed) => Game.newGame({ seed: seed || 5, mapW: 60, mapH: 40, landSize: 'medium', opponents: 3, difficulty: lvl, crisis: 'off', finale: 'random',
  human: { name: 'Moi', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });

// 1. la crise : le boss mène de très loin, le joueur écrase son propre plan
const crisis = (lvl, cfg) => {
  const g = mk(lvl), H = g.players[0], boss = g.players.find(p => p.plane === 1), arc = g.players.find(p => p.plane === 0 && !p.human);
  g.opts.finaleCfg = cfg || null;
  const f = g.finale; f.state = 'watch'; f.streak = 0; f.mode = 'random'; g.turn = 260;
  const R0 = Finale.ranked; Finale.ranked = () => [{ p: boss, v: 5000 }, { p: H, v: 1000 }, { p: arc, v: 100 }];
  for (let i = 0; i < 12; i++) Finale.watch(g);
  Finale.ranked = R0;
  return { state: f.state, target: f.target, H: H.id };
};
{
  const r = crisis('hard');
  ok(r.state === 'omen' && r.target === r.H, 'Difficile : le boss mène, le joueur écrase son plan : la crise le vise (' + r.state + ')');
  const r0 = crisis('hard', { POOL_HARD: 0 });
  ok(r0.state === 'watch', 'Difficile, réglage de banc POOL_HARD 0 : la règle d\'avant, pas de crise');
  const rh = crisis('hardcore');
  ok(rh.state === 'omen' && rh.target === rh.H, 'Hardcore : inchangé, la crise vise le joueur');
  const rn = crisis('normal');
  ok(rn.state === 'watch', 'Normal : si le boss mène, pas de crise (inchangé)');
}

// 2. l'essai du Sceau : traqué, il l'étudie et le lance ; sinon jamais
{
  const g = mk('hard', 7), H = g.players[0], m = g.players.filter(p => p.plane === 1);
  const boss = m.reduce((a, b) => E.Crisis.score(g, b) > E.Crisis.score(g, a) ? b : a);
  H.human = false; H.benchHuman = true;
  g.turn = 130;
  ok(AI.bossPrey(g, boss) === H, 'tour 130 : le boss chasse le joueur');
  boss.diplo[H.id] = H.diplo[boss.id] = 'war';
  ok(AI.huntedBy(g, H) === boss, 'traqué : huntedBy désigne le boss');
  ok(AI.globalValue(g, H, 'planar_seal') === 0, 'sans l\'essai : le Sceau ne vaut rien');
  H.aiExp = { seal: true };
  ok(AI.globalValue(g, H, 'planar_seal') === 60, 'avec l\'essai, traqué : le Sceau vaut 60');
  H.researchOptions = ['planar_seal', 'heroism', 'holy_weapon', 'prayer'];
  const picks = new Set(); for (let i = 0; i < 20; i++) picks.add(AI.pickResearch(g, H));
  ok(picks.size === 1 && picks.has('planar_seal'), 'et il l\'étudie avant le reste');
  boss.diplo[H.id] = H.diplo[boss.id] = 'peace';
  ok(!AI.huntedBy(g, H) && AI.globalValue(g, H, 'planar_seal') === 0, 'en paix avec le boss : plus de Sceau');
  const arc = g.players.find(p => p.plane === 0 && !p.benchHuman); arc.aiExp = { seal: true };
  ok(AI.globalValue(g, arc, 'planar_seal') === 0, 'un sorcier que le boss ne chasse pas : pas de Sceau');
}
