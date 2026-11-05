// Verifie data/spells.js : chargement via vm (var window = globalThis), schema, vocabulaires,
// slugs, unites invoquees presentes dans units/unit.go, references croisees.
// Usage : node tools/check_spells.js data/spells.js <kazz/game/magic/units/unit.go>
"use strict";
const fs = require("fs");
const vm = require("vm");

const [spellsPath, unitGo] = process.argv.slice(2);
const ctx = { console };
vm.createContext(ctx);
vm.runInContext("var window = globalThis;\n" + fs.readFileSync(spellsPath, "utf8"), ctx, { filename: spellsPath });
const spells = ctx.DATA && ctx.DATA.spells;
if (!spells) throw new Error("DATA.spells absent");

const unitIds = new Set([...fs.readFileSync(unitGo, "utf8").matchAll(/^var (\w+) Unit\b/gm)].map((m) => m[1]));
const TARGETS = new Set("none friendlyUnit enemyUnit anyUnit friendlyCity enemyCity anyCity tile combatTile allEnemyUnits allFriendlyUnits allUnits deadUnit friendlyHero enemyWizard node".split(" "));
const KINDS = new Set("summon unitEnchant curse damage areaDamage resistOrDie heal combatEnchant cityEnchant cityCurse global terrain dispel special".split(" "));
const REALMS = new Set("life death chaos nature sorcery arcane".split(" "));
const RARITIES = new Set("common uncommon rare veryrare".split(" "));
const SECTIONS = new Set("summoning special city global unit combat".split(" "));
const REQUIRED = ["id", "en", "name", "realm", "rarity", "section", "cost", "combatCost", "plus", "overland", "combat", "upkeep", "research", "target", "kind", "params", "desc"];

const slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const errors = [];
const err = (id, msg) => errors.push(id + " : " + msg);

for (const [key, s] of Object.entries(spells)) {
  for (const f of REQUIRED) if (!(f in s)) err(key, "champ manquant " + f);
  if (s.id !== key) err(key, "id != cle");
  if (slug(s.en) !== key) err(key, "slug(en) = " + slug(s.en));
  if (!REALMS.has(s.realm)) err(key, "royaume " + s.realm);
  if (!RARITIES.has(s.rarity)) err(key, "rarete " + s.rarity);
  if (!SECTIONS.has(s.section)) err(key, "section " + s.section);
  if (!TARGETS.has(s.target)) err(key, "target " + s.target);
  if (!KINDS.has(s.kind)) err(key, "kind " + s.kind);
  if (!s.overland && !s.combat) err(key, "ni carte ni combat");
  if (s.combat && typeof s.combatCost !== "number") err(key, "combatCost manquant pour un sort de combat");
  if (!s.combat && s.combatCost !== null) err(key, "combatCost doit etre null");
  if (s.cost !== null && typeof s.cost !== "number") err(key, "cost");
  if (s.research !== null && typeof s.research !== "number") err(key, "research");
  if (!s.overland && s.upkeep !== 0) err(key, "entretien sur un sort de combat");
  if (typeof s.desc !== "string" || s.desc.length < 20) err(key, "desc trop courte");
  for (const k of ["unit", "zombieUnit"]) {
    const u = s.params[k];
    if (u !== undefined && !unitIds.has(u)) err(key, "unite inconnue " + u);
  }
  if (s.kind === "summon" && !s.params.unit) err(key, "summon sans params.unit");
  for (const v of Object.values(s.params).concat(s.params.outcomes || [])) {
    if (typeof v === "string" && /^[a-z]+(_[a-z]+)+$/.test(v) && !spells[v]) err(key, "reference de sort inconnue " + v);
  }
}

const names = new Map();
for (const s of Object.values(spells)) {
  if (names.has(s.name)) err(s.id, "nom FR en double avec " + names.get(s.name));
  names.set(s.name, s.id);
}

const count = (f) => Object.values(spells).reduce((a, s) => ((a[s[f]] = (a[s[f]] || 0) + 1), a), {});
console.log("sorts :", Object.keys(spells).length);
console.log("royaumes :", JSON.stringify(count("realm")));
console.log("raretes :", JSON.stringify(count("rarity")));
console.log("sections :", JSON.stringify(count("section")));
console.log("unites invoquees verifiees :", Object.values(spells).filter((s) => s.params.unit).length);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("OK");
