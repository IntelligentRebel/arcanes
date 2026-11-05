// Audit 2 : héros (talents, légendes, objets).
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, Heroes, Move, DATA, AI, OVERLAND_HANDLERS, RNG } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', human: { name: 'X', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } });
const pl = g.players[0], cap = g.cities[pl.fortress];
// le talent est-il proposé (au moins une fois sur 60 tirages de deux options) ?
const offered = (u, k) => { const rng = new RNG(7); for (let i = 0; i < 60; i++) if (Heroes.talentOptions(g, u, rng).includes(k)) return true; return false; };

// 1. Œil de lynx : « +1 case de vision », trois fois au plus (vue 5 au plus)
for (const t of ['HeroBrax', 'HeroGreyfairer']) {
  const u = Heroes.spawn(g, pl, DATA.heroes[t], cap.plane, cap.x, cap.y, 0);
  const seq = [Move.sightOf(g, u)];
  while (seq.length < 6 && offered(u, 'scouting')) { Heroes.applyTalent(g, u, 'scouting'); seq.push(Move.sightOf(g, u)); }
  const taken = seq.length - 1, last = seq[seq.length - 1];
  ok(seq.every((v, i) => !i || v === seq[i - 1] + 1) && last === Math.min(5, seq[0] + 3) && taken === Math.min(3, 5 - seq[0]),
    DATA.heroes[t].name + ' : Œil de lynx pris ' + taken + ' fois, vue ' + seq.join(' → '));
  Units.remove(g, u, { forever: true });
}
// témoin : un talent unique ne revient pas
{
  const u = Heroes.spawn(g, pl, DATA.heroes.HeroBrax, cap.plane, cap.x, cap.y, 0);
  Heroes.applyTalent(g, u, 'lucky');
  ok(!offered(u, 'lucky'), 'témoin : Chanceux, déjà pris, n\'est plus proposé');
  Units.remove(g, u, { forever: true });
}

// 2. Résurrection : la légende du héros tombé a été scellée ; revenu, il n'apprend pas que son repaire a été « pillé »
{
  const u = Heroes.spawn(g, pl, DATA.heroes.HeroBrax, cap.plane, cap.x, cap.y, 0);
  const s = g.sites[u.hero.quest.site];
  Units.remove(g, u); Heroes.questTick(g);
  const r = OVERLAND_HANDLERS.resurrection(g, pl, { hero: 'HeroBrax' });
  const n0 = g.log.length; Heroes.questTick(g);
  const txt = g.log.slice(n0).map(l => l.text).join(' | ');
  ok(s.sealed && r.msg && /absence/.test(txt) && !/pillé/.test(txt), 'légende scellée puis héros ressuscité : « ' + txt + ' »');
  const v = Object.values(g.units).find(x => x.type === 'HeroBrax'); if (v) Units.remove(g, v, { forever: true });
}
// témoin : un repaire de légende vraiment pillé sans lui garde son message
{
  const u = Heroes.spawn(g, pl, DATA.heroes.HeroGunther, cap.plane, cap.x, cap.y, 0);
  const s = g.sites[u.hero.quest.site]; s.cleared = true; s.guardians = [];
  const n0 = g.log.length; Heroes.questTick(g);
  ok(/pillé sans/.test(g.log.slice(n0).map(l => l.text).join(' ')), 'témoin : repaire pillé par d\'autres, « pillé sans » ' + DATA.heroes.HeroGunther.name);
  Units.remove(g, u, { forever: true });
}

// 3. IA : l'objet qui remplace un objet à PV ne laisse pas le héros à 0 PV
{
  const ai = g.players[1], c = g.cities[ai.fortress];
  const u = Heroes.spawn(g, ai, DATA.heroes.HeroBrax, c.plane, c.x, c.y, 0);
  u.items[2] = { kind: 'helm', slot: 'jewelry', name: 'Heaume', powers: [], hp: 4, value: 100 };
  u.dmg = Units.stats(g, u).maxHp - 1;
  ai.vault = [{ kind: 'ring', slot: 'jewelry', name: 'Anneau', powers: [], res: 3, value: 900 }];
  AI.equipHeroes(g, ai);
  ok(u.items[2] && u.items[2].name === 'Anneau' && Units.health(g, u) >= 1, 'IA : Heaume (+4 PV) remplacé par un anneau, le héros garde ' + Units.health(g, u) + ' PV');
  Units.remove(g, u, { forever: true });
}
