// Audit 2 : ce que disent les dons, les talents, les pactes et l'aide, face à ce que fait le code.
const { loadEngine, ROOT } = require('./load');
const fs = require('fs'), path = require('path');
const E = loadEngine(); E.AI.LAB = false;
const { Game, Units, Heroes, Magic, Players, Cities, Wonders, Pacts, DATA } = E;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'ÉCHEC') + ' ' + m); if (!c) process.exitCode = 1; };
const g = Game.newGame({ seed: 5, mapW: 60, mapH: 40, opponents: 2, crisis: 'off', human: { name: 'X', portrait: 0, books: { chaos: 5, nature: 5 }, retorts: [], race: 'highmen' } });
const pl = g.players[0], cap = g.cities[pl.fortress], R = DATA.retorts;
const withRetorts = (rs, fn) => { const was = pl.retorts; pl.retorts = rs; try { return fn(); } finally { pl.retorts = was; } };
const manaUp = t => { const u = Units.create(g, t, 0, cap.plane, cap.x, cap.y); const n = Units.upkeep(g, u).mana; Units.remove(g, u); return n; };

// 1. Canalisateur : l'entretien en mana est réduit de moitié, et le don le dit
{
  const a = manaUp('SkyDrake'), b = withRetorts(['channeler'], () => manaUp('SkyDrake'));
  ok(b === Math.ceil(a / 2) && /entretien/.test(R.channeler.desc), 'Canalisateur : Drake céleste ' + a + ' → ' + b + ' mana ; « ' + R.channeler.desc + ' »');
}
// 2. Conjurateur : un quart de moins à l'entretien des créatures aussi
{
  const a = manaUp('SkyDrake'), b = withRetorts(['conjurer'], () => manaUp('SkyDrake'));
  ok(b === Math.ceil(a * 0.75) && /entretien/.test(R.conjurer.desc), 'Conjurateur : Drake céleste ' + a + ' → ' + b + ' mana ; « ' + R.conjurer.desc + ' »');
}
// 3. Archimage : la compétence progresse moitié plus vite
{
  pl.powerSplit = { mana: 0, research: 0, skill: 100 };
  const a = Magic.split(g, pl).skill, b = withRetorts(['archmage'], () => Magic.split(g, pl).skill);
  pl.powerSplit = { mana: 34, research: 33, skill: 33 };
  ok(b === Math.floor(a * 1.5) && /progresse/.test(R.archmage.desc), 'Archimage : ' + a + ' → ' + b + ' points de compétence par tour ; « ' + R.archmage.desc + ' »');
}
// 4. maîtrises : leurs sorts coûtent 15 % de moins ; seuls les sorts de leur royaume sont plus durs à dissiper
for (const [r, realm, id, other] of [['chaosMastery', 'chaos', 'fireball', 'web'], ['natureMastery', 'nature', 'web', 'fireball'], ['sorceryMastery', 'sorcery', 'confusion', 'fireball']]) {
  const a = Magic.spellCost(g, pl, id, true), b = withRetorts([r], () => Magic.spellCost(g, pl, id, true));
  const dr = withRetorts([r], () => [Magic.dispelResist(g, 0, id), Magic.dispelResist(g, 0, other)]);
  ok(b === Math.max(1, Math.floor(a * 0.85)) && dr[0] === 2 && dr[1] === 1 && /moindre coût/.test(R[r].desc) && /les rend plus durs à dissiper/.test(R[r].desc),
    R[r].name + ' : ' + DATA.spells[id].name + ' ' + a + ' → ' + b + ' mana, dissipation ×' + dr[0] + ' (×' + dr[1] + ' hors royaume) ; « ' + R[r].desc + ' »');
}
// témoin : Maître des runes, tous ses sorts plus durs à dissiper (son texte le dit déjà)
ok(withRetorts(['runemaster'], () => Magic.dispelResist(g, 0, 'fireball')) === 2 && /tous ses sorts/.test(R.runemaster.desc), 'témoin : Maître des runes, Boule de feu ×2 à dissiper');

// 5. talent Noble : +10 or par tour, et plus de solde
{
  const u = Heroes.spawn(g, pl, DATA.heroes.HeroBrax, cap.plane, cap.x, cap.y, 0);
  const a = Units.upkeep(g, u).gold, g0 = Players.goldPerTurn(g, pl).gold;
  Heroes.applyTalent(g, u, 'noble');
  const b = Units.upkeep(g, u).gold, g1 = Players.goldPerTurn(g, pl).gold;
  const d = DATA.heroTalents.noble.desc;
  ok(a > 0 && b === 0 && /\+10 or/.test(d) && /solde/.test(d), 'Noble : solde ' + a + ' → ' + b + ' or, revenu +' + (g1 - g0) + ' ; « ' + d + ' »');
  Units.remove(g, u, { forever: true });
}

// 6. le Prince des Cendres : la dette se compte en citoyens (pas en « habitants »)
{
  const owed = Pacts.ENT.ashes.owed({ pop: 2, mana: 450 });
  ok(!/habitants/.test(owed) && /au moins 4/.test(owed), 'Prince des Cendres : « ' + owed + ' »');
}

// 7. aide : l'empire étendu pèse 10 % par habitant (comme le détail de la cité), pas +1
{
  const src = fs.readFileSync(path.join(ROOT, 'src/ui/panels.js'), 'utf8'), i = src.indexOf('<b>Empire étendu</b>'), help = src.slice(i, src.indexOf('</p>', i));
  const far = Object.values(g.cities).find(c => c.owner < 0) || cap;
  ok(Cities.OVER_PCT === 0.1 && /10 %/.test(help) && !/\+1 agitation/.test(help), 'aide : « ' + help.replace(/<[^>]+>/g, '') + ' »');
}

// 8. renommée : l'infobulle compte la solde comme le moteur (Trône de Crânes compris)
{
  const units = []; for (let i = 0; i < 6; i++) units.push(Units.create(g, DATA.races.highmen.units.find(t => DATA.units[t].upkeep.gold > 0 && !DATA.units[t].abilities.createOutpost), 0, cap.plane, cap.x, cap.y));
  let raw = 0; for (const u of Object.values(g.units)) if (u.owner === 0) raw += Units.upkeep(g, u).gold;
  cap.buildings[DATA.wonders.orc] = true; Wonders.sync(g);
  const gross = Magic.goldUpkeepGross ? Magic.goldUpkeepGross(g, pl) : null, fame = Players.fame(g, pl);
  const src = fs.readFileSync(path.join(ROOT, 'src/ui/main.js'), 'utf8'), tip = src.slice(src.indexOf('fameTip() {'), src.indexOf('fameTip() {') + 600);
  ok(gross === Math.ceil(raw * 0.75) && Magic.goldUpkeepUnits(g, pl) === Math.max(0, gross - fame) && /goldUpkeepGross/.test(tip), 'Trône de Crânes : solde ' + raw + ' → ' + gross + ' avant la renommée, et l\'infobulle de la renommée part du même chiffre');
  delete cap.buildings[DATA.wonders.orc]; Wonders.sync(g); for (const u of units) Units.remove(g, u);
}

// 9. Puissance infernale : comme la Puissance divine, les lieux de culte apaisent aussi mieux la population
{
  const c = Object.values(g.cities).find(x => x.owner === 0);
  const was = Object.assign({}, c.buildings), pop = c.pop, tax = pl.taxIdx;
  c.buildings.shrine = c.buildings.temple = true; c.pop = 12000; pl.taxIdx = 6;
  const u0 = Cities.econ(g, c).unrestSum, u1 = withRetorts(['infernalPower'], () => Cities.econ(g, c).unrestSum), u2 = withRetorts(['divinePower'], () => Cities.econ(g, c).unrestSum);
  c.buildings = was; c.pop = pop; pl.taxIdx = tax;
  ok(u1 < u0 && u1 === u2 && /apaisent/.test(R.infernalPower.desc), 'Puissance infernale : agitation ' + u0 + ' → ' + u1 + ' (divine : ' + u2 + ') ; « ' + R.infernalPower.desc + ' »');
}

// 10. Enchantement d'objet, Création d'artefact : bonus tirés au hasard, un pouvoir une fois sur quatre, une fois sur deux
{
  const share = p => { let n = 0; for (let i = 0; i < 4000; i++) if (E.Items.random(g, p).powers.length) n++; return n / 4000; };
  const a = share(2), b = share(5);
  ok(Math.abs(a - 0.25) < 0.04 && /une fois sur quatre/.test(DATA.spells.enchant_item.desc), DATA.spells.enchant_item.name + ' : un pouvoir dans ' + Math.round(a * 100) + ' % des objets ; « ' + DATA.spells.enchant_item.desc + ' »');
  ok(Math.abs(b - 0.5) < 0.04 && /une fois sur deux/.test(DATA.spells.create_artifact.desc), DATA.spells.create_artifact.name + ' : un pouvoir dans ' + Math.round(b * 100) + ' % des objets ; « ' + DATA.spells.create_artifact.desc + ' »');
}

// 11. renommée : avant le tour 31, aucun mercenaire ne se présente ; l'infobulle le dit
{
  const Merc = require('vm').runInContext('Mercenaries', E), before = g.turn; let got = 0;
  for (const t of [10, 29]) { g.turn = t; for (let i = 0; i < 300; i++) { pl.mercOffer = null; pl.gold = 99999; pl.fame = 200; Merc.offers(g); if (pl.mercOffer) got++; } }
  g.turn = 31; let late = 0; for (let i = 0; i < 300; i++) { pl.mercOffer = null; Merc.offers(g); if (pl.mercOffer) late++; }
  g.turn = before; pl.mercOffer = null; pl.fame = 0;
  const src = fs.readFileSync(path.join(ROOT, 'src/ui/main.js'), 'utf8'), i = src.indexOf("kv('Mercenaires'"), line = src.slice(i, src.indexOf('\n', i));
  ok(got === 0 && late > 0 && /tour 31/.test(line), 'mercenaires : ' + got + ' offre avant le tour 31, ' + late + ' au tour 31 ; l\'infobulle : ' + line.trim());
}
