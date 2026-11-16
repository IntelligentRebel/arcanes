// v0.31.62 : le boss du plan d'en face. La crise de fin ne le vise jamais (s'il mène, pas de crise) ; en Difficile et Hardcore,
// le plus fort des sorciers nés sur l'autre plan chasse le joueur dès que celui-ci a posé le pied chez lui, ou au tour 120 :
// croisade vers ses cités, Ouvrir une faille, pas de paix, un Sceau planaire à briser.
const { loadEngine } = require('./load');
const E = loadEngine(); const { Game, AI, Finale, Diplomacy, DATA, Units, Cities, Magic, World } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const mk = (lvl, seed) => Game.newGame({ seed: seed || 5, mapW: 60, mapH: 40, landSize: 'medium', opponents: 3, difficulty: lvl || 'hard', crisis: 'off', finale: 'random',
  human: { name: 'Moi', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });

const g = mk(), H = g.players[0], myr = g.players.filter(p => p.plane === 1), arc = g.players.filter(p => p.plane === 0 && !p.human);
ok(myr.length === 2 && H.plane === 0, 'deux sorciers en face, sur Myrror');

// 1. la crise de fin
ok(myr.every(p => Finale.exempt(g, p)) && !Finale.exempt(g, H) && arc.every(p => !Finale.exempt(g, p)), 'seuls les sorciers d\'en face échappent à la crise');
{
  const f = g.finale; f.state = 'watch'; f.streak = 0; f.mode = 'random';
  const R0 = Finale.ranked; g.turn = 260;
  Finale.ranked = () => [{ p: myr[0], v: 1000 }, { p: H, v: 100 }, { p: arc[0], v: 90 }];
  for (let i = 0; i < 12; i++) Finale.watch(g);
  ok(f.state === 'watch' && f.streak === 0, 'le boss mène de loin : pas de crise');
  Finale.ranked = () => [{ p: H, v: 1000 }, { p: myr[0], v: 100 }, { p: arc[0], v: 90 }];
  for (let i = 0; i < 12; i++) Finale.watch(g);
  ok(f.state === 'omen' && f.target === H.id, 'le joueur mène de loin : la crise le vise (' + f.state + ')');
  Finale.ranked = R0;
  g.opts.finaleCfg = { EXEMPT_BOSS: 0 }; ok(!Finale.exempt(g, myr[0]), 'réglage de banc : la règle d\'avant'); g.opts.finaleCfg = null;
}

// 2. qui chasse, et quand
{
  const g2 = mk('hard', 7), H2 = g2.players[0], m2 = g2.players.filter(p => p.plane === 1);
  const boss = m2.reduce((a, b) => E.Crisis.score(g2, b) > E.Crisis.score(g2, a) ? b : a);
  g2.turn = 70;
  ok(AI.bossPrey(g2, boss) === null, 'tour 70, le joueur chez lui : pas de chasse');
  // un éclaireur du joueur sur Myrror
  const fc = g2.cities[boss.fortress]; let spot = null;
  for (let r = 3; r < 12 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) { const x = World.wx(g2.world, fc.x + dx), y = fc.y + r; if (World.inY(g2.world, y) && !World.isWaterAt(g2.world, 1, x, y) && !Cities.at(g2, 1, x, y)) spot = [x, y]; }
  const sc = Units.create(g2, 'HighMenSpearmen', H2.id, 1, spot[0], spot[1]);
  g2.turn = 71;
  ok(AI.bossPrey(g2, boss) === H2 && boss.aiHuntFrom === 71, 'le joueur a posé le pied sur Myrror : le boss le chasse');
  const other = m2.find(p => p !== boss);
  ok(!other || AI.bossPrey(g2, other) === null, 'le second sorcier d\'en face ne chasse pas');
  ok(g2.players.filter(p => p.plane === 0 && !p.human).every(p => AI.bossPrey(g2, p) === null), 'les sorciers du plan du joueur ne chassent pas');
  Units.remove(g2, sc); g2.turn = 72;
  ok(AI.bossPrey(g2, boss) === H2, 'une fois lancée, la chasse ne s\'arrête plus');
  ok(AI.crusadeTarget(g2, boss) === H2, 'sa croisade vise le joueur');
  // pas de paix
  const r = Diplomacy.propose(g2, H2.id, boss.id, 'peace');
  ok(!r.ok, 'le joueur demande la paix : refusée (' + r.text + ')');
  boss.contact[H2.id] = H2.contact[boss.id] = true; boss.diplo[H2.id] = H2.diplo[boss.id] = 'none';
  Diplomacy.updateTurn(g2);
  ok(boss.diplo[H2.id] === 'war', 'au contact, il déclare la guerre');
  // Ouvrir une faille dans ses recherches
  Magic.gateOptions(g2, boss);
  ok(boss.researchOptions.includes('open_rift'), 'Ouvrir une faille s\'offre à ses recherches');
  // le Sceau planaire du joueur : la Disjonction, même à 28 %
  H2.globals.push('planar_seal'); boss.known.push('disjunction');
  const d = AI.disjSpell(g2, boss, 'disjunction', 1);
  ok(d && d.target.spell === 'planar_seal', 'il vise le Sceau planaire avec la Disjonction' + (d ? ' (' + Math.round(d.sc) + ')' : ''));
  ok(AI.counterResearch(g2, boss, 'disjunction') === 90, 'et cherche la Disjonction en priorité');
  // en Normal : rien de tout cela
  const g3 = mk('normal', 7), b3 = g3.players.filter(p => p.plane === 1)[0]; g3.turn = 200;
  ok(AI.bossPrey(g3, b3) === null, 'en Normal, pas de chasse');
}

// 3. la règle d'expérience coupe la chasse
{
  const g4 = mk('hard', 7), b4 = g4.players.filter(p => p.plane === 1); g4.turn = 200;
  AI.EXP = { no_bosshunt: true };
  ok(b4.every(p => AI.bossPrey(g4, p) === null), 'no_bosshunt : pas de chasse');
  AI.EXP = {};
  ok(b4.some(p => AI.bossPrey(g4, p) === g4.players[0]), 'tour 200 : le plus fort des deux chasse');
}

// 4. (0.31.63) la coalition et le Démon légendaire ne visent jamais le boss, et il n'en est pas
{
  const g5 = mk('hard', 9), H5 = g5.players[0], m5 = g5.players.filter(p => p.plane === 1), a5 = g5.players.filter(p => p.plane === 0 && !p.human);
  for (const p of g5.players) for (const q of g5.players) if (p !== q) p.contact[q.id] = true;
  g5.turn = 150;
  const S0 = E.Intel.standing, R0 = E.Rite.standing, val = new Map([[m5[0], 5000], [m5[1], 300], [H5, 300], [a5[0], 300], [a5[1], 280], [a5[2], 260]]);
  E.Intel.standing = (game, a, id) => val.get(game.players[id]); E.Rite.standing = (game, p) => val.get(p);
  E.Diplomacy._leaders = new WeakMap();
  ok(a5.every(p => { const L = Diplomacy.leaderFor(g5, p); return !L || L.id !== m5[0].id; }), 'le boss écrase tout : la coalition ne le vise pas');
  ok(E.Rite.leader(g5) === null, 'ni le Démon légendaire');
  val.set(H5, 2000); g5.turn = 151; E.Diplomacy._leaders = new WeakMap();
  ok(a5.every(p => (Diplomacy.leaderFor(g5, p) || {}).id === H5.id), 'le joueur loin devant les sorciers de son plan : la coalition le vise');
  ok(E.Rite.leader(g5) === H5, 'le Démon aussi');
  ok(!E.Rite.coalitionOf(g5, H5.id).some(p => p.plane === 1) && !E.Rite.members(g5, H5.id).some(p => p.plane === 1), 'les sorciers d\'en face n\'en sont pas');
  g5.opts.finaleCfg = { EXEMPT_BOSS: 0 }; g5.turn = 152; E.Diplomacy._leaders = new WeakMap(); val.set(H5, 300);
  ok(a5.some(p => (Diplomacy.leaderFor(g5, p) || {}).id === m5[0].id), 'réglage de banc : la coalition d\'avant vise le boss');
  E.Intel.standing = S0; E.Rite.standing = R0; g5.opts.finaleCfg = null;
}
