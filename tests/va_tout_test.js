// v0.30.3 : le va-tout du sorcier qui défend sa capitale, et la bourse de combat (mana gardé quand le joueur approche ; v0.30.4 : contre le joueur seulement)
const { loadEngine } = require('./load');
const E = loadEngine(); E.AI.LAB = false;   // le jeu livré
const U0 = (a, f) => a.reduce((b, x) => f(x) > f(b) ? x : b);
const { Game, Units, World, Cities, Battle, CombatSpells, CombatAI, RNG, DATA, AI, Magic, Intel } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 2, difficulty: 'hardcore', crisis: 'off', aiLevels: ['hardcore', 'hardcore'], human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
const p1 = g.players[1], fc = g.cities[p1.fortress];
p1.known = p1.known.concat(['fire_bolt', 'giant_strength', 'stone_skin', 'weakness', 'resist_magic', 'web', 'healing'].filter(id => DATA.spells[id] && !p1.known.includes(id)));
p1.skillPoints = 900;   // une compétence d'une trentaine
const near = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, fc.plane, x, y) && !Cities.at(g, fc.plane, x, y));
const foeTypes = ['HighElfCavalry', 'HighElfCavalry', 'HighElfLongbowmen', 'HighElfSwordsmen', 'HighElfSwordsmen', 'HighElfCavalry'].filter(t => DATA.units[t]);
const defType = DATA.races[fc.race].units.find(t => DATA.units[t].melee >= 3 && !DATA.units[t].sailing) || DATA.races[fc.race].units[0];
// n batailles au même endroit, mana de départ fixé : sorts lancés par le sorcier 1 et mana dépensé
function battles(where, exp, n = 30, dt = defType) {
  let casts = 0, spent = 0, withCast = 0;
  const cast = CombatSpells.cast;
  for (let i = 0; i < n; i++) {
    p1.mana = 150; p1.aiExp = exp;
    const A = foeTypes.map(t => Units.create(g, t, 0, fc.plane, near[0], near[1]));
    const D = [dt, dt, dt].map(t => Units.create(g, t, 1, where.plane, where.x, where.y));
    let c = 0; CombatSpells.cast = function (bt, side) { if (side === 1 && bt.side === 1) c++; return cast.apply(this, arguments); };
    const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: 0, defenderPid: 1, plane: where.plane, x: where.x, y: where.y, city: where.city || null, rng: new RNG(500 + i) });
    CombatAI.autoResolve(bt);
    CombatSpells.cast = cast;
    casts += c; withCast += c > 0; spent += 150 - p1.mana;
    for (const u of A.concat(D)) if (g.units[u.id]) Units.remove(g, u);
  }
  return { casts: casts / n, spent: Math.round(spent / n), withCast };
}
const cap = { plane: fc.plane, x: fc.x, y: fc.y, city: fc };
const a = battles(cap, {}), b = battles(cap, { no_allin: true });
ok(Math.abs(a.casts - b.casts) < 0.5, 'capitale assiégée, mana abondant, troupes solides (le sorcier lance déjà un sort par tour) : ' + a.casts.toFixed(1) + ' sorts et ' + a.spent + ' mana par bataille avec le va-tout, ' + b.casts.toFixed(1) + ' et ' + b.spent + ' sans');
// seulement des renforts de peu de valeur ici : d'habitude jugés pas rentables, lancés quand la capitale est en jeu
const known0 = p1.known; p1.known = known0.filter(id => !(DATA.spells[id] || {}).combat).concat(['stone_skin', 'resist_magic', 'resist_elements'].filter(id => DATA.spells[id]));
const strOf = t => { const u = Units.create(g, t, 1, fc.plane, fc.x, fc.y); const v = Units.strength(g, u); Units.remove(g, u); return v; };
const weak = U0(DATA.races[fc.race].units.filter(t => !DATA.units[t].sailing && DATA.units[t].melee > 0), t => -Math.abs(strOf(t) - 30));   // une troupe de base, autour de 30 de force
const a2 = battles(cap, {}, 30, weak), b2 = battles(cap, { no_allin: true }, 30, weak);
ok(a2.casts > b2.casts + 0.5, 'capitale assiégée, rien que des renforts sur des ' + weak + ' : ' + a2.casts.toFixed(1) + ' sorts par bataille avec le va-tout, contre ' + b2.casts.toFixed(1) + ' sans');
p1.known = known0;
const field = { plane: fc.plane, x: near[0], y: near[1] };
const fa = battles(field, {}), fb = battles(field, { no_allin: true });
ok(fa.casts === fb.casts && fa.spent === fb.spent, 'en rase campagne, rien ne change : ' + fa.casts.toFixed(1) + ' sorts, ' + fa.spent + ' mana');
p1.aiExp = {};
// la bourse : une armée ennemie vue près de la capitale
const tooFar = World.dist(g.world, fc.x, fc.y, near[0], near[1]) <= 5;
const spot = U => { const A = foeTypes.slice(0, 3).map(t => Units.create(g, t, 0, fc.plane, near[0], near[1])); p1.intel = p1.intel || {}; p1.intel[fc.plane + ',' + near[0] + ',' + near[1]] = { t: g.turn, units: A }; Intel._cache.delete(g); return A; };
g.players[0].diplo = g.players[0].diplo || {}; p1.diplo[0] = 'war'; g.players[0].diplo[1] = 'war';
ok(tooFar && AI.combatPurse(g, p1) === null || !tooFar, 'pas d\'ennemi en vue : pas de bourse');
const A = spot();
const atWar = E.Players.isAtWar(g, 1, 0);
const pu = AI.combatPurse(g, p1), skill = Magic.totalSkill(g, p1);
ok(atWar && pu && pu.capital && pu.mana === skill, 'armée ennemie à côté de la capitale : bourse = toute la compétence (' + (pu && pu.mana) + ' / ' + skill + ')');
p1.casting = null; p1.mana = 5; p1.gold = 400;
AI.manageMagic(g, p1);
ok(p1.mana >= skill && p1.gold === 400 - 2 * (skill - 5) && !(p1.casting && p1.casting.id === 'magic_spirit'), 'l\'or change en mana pour la défendre (2 pour 1, en gardant 150), et rien ne l\'entame : mana ' + p1.mana + ', or ' + p1.gold + (p1.casting ? ', incantation ' + p1.casting.id : ''));
p1.aiExp = { no_cpurse: true }; p1.mana = 5; p1.gold = 400; AI.manageMagic(g, p1);
ok(p1.gold >= 300 || p1.mana < skill, 'sans la bourse : pas de conversion (mana ' + p1.mana + ', or ' + p1.gold + ')');
for (const u of A) if (g.units[u.id]) Units.remove(g, u);

// v0.30.4 : une armée d'un autre sorcier IA près de la capitale ne déclenche plus la bourse
{ const p2 = g.players[2]; p1.diplo[2] = 'war'; p2.diplo[1] = 'war';
  const B = foeTypes.slice(0, 3).map(t => Units.create(g, t, 2, fc.plane, near[0], near[1]));
  p1.intel = { [fc.plane + ',' + near[0] + ',' + near[1]]: { t: g.turn, units: B } }; Intel._cache.delete(g); p1.aiExp = {};
  ok(AI.combatPurse(g, p1) === null, 'armée d\'une IA rivale près de la capitale : pas de bourse (elle ne sert que contre le joueur)');
  p2.benchHuman = true; Intel._cache.delete(g);
  ok(!!AI.combatPurse(g, p1), 'la même armée, quand ce sorcier tient lieu de joueur au banc : bourse');
  p2.benchHuman = false; for (const u of B) if (g.units[u.id]) Units.remove(g, u); }
