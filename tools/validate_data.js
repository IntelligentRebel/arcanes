#!/usr/bin/env node
/* Validation de coherence des donnees d'Arcanes.
 * Charge tous les fichiers data/*.js presents dans un contexte vm (var window = globalThis)
 * puis verifie les references croisees. Code de sortie 1 en cas d'erreur.
 * Usage : node tools/validate_data.js [dossier_data]
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dataDir = path.resolve(process.argv[2] || path.join(__dirname, "..", "data"));
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// --- chargement ----------------------------------------------------------
const ctx = vm.createContext({ console });
vm.runInContext("var window = globalThis;", ctx);
const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".js")).sort();
for (const f of files) {
  const src = fs.readFileSync(path.join(dataDir, f), "utf8");
  const HEAD = "window.DATA = window.DATA || {};";
  // commentaires et espaces de tete toleres, mais la premiere instruction doit etre l'initialisation de DATA
  const firstStmt = src.replace(/^(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  if (!firstStmt.startsWith(HEAD)) err(`${f} : la premiere instruction n'est pas « ${HEAD} »`);
  else if (!src.startsWith(HEAD)) warn(`${f} : commentaire avant « ${HEAD} » (tolere)`);
  try {
    vm.runInContext(src, ctx, { filename: f });
  } catch (e) {
    err(`${f} : erreur d'execution : ${e.message}`);
  }
}
const DATA = ctx.DATA || {};
const has = (k) => DATA[k] && typeof DATA[k] === "object";
const counts = Object.fromEntries(Object.keys(DATA).map((k) => [k, Array.isArray(DATA[k]) ? DATA[k].length : Object.keys(DATA[k]).length]));

const RACES = ["barbarian", "gnoll", "halfling", "highelf", "highmen", "klackon", "lizardman", "nomad", "orc",
  "beastmen", "darkelf", "draconian", "dwarf", "troll"];
const REALMS = ["life", "death", "chaos", "nature", "sorcery", "arcane"];
const BUILDING_IDS = ["barracks", "armory", "fightersGuild", "armorersGuild", "warCollege", "smithy", "stables",
  "animistsGuild", "fantasticStable", "shipwrightsGuild", "shipYard", "maritimeGuild", "sawmill", "library",
  "sagesGuild", "oracle", "alchemistsGuild", "university", "wizardsGuild", "shrine", "temple", "parthenon",
  "cathedral", "marketplace", "bank", "merchantsGuild", "granary", "farmersMarket", "forestersGuild",
  "buildersHall", "mechaniciansGuild", "minersGuild", "cityWalls", "housing", "tradeGoods", "fortress",
  "summoningCircle",
  // ajouts d'Arcanes
  "defenseTowers", "magicRelay"];
const BUILDING_EFFECTS = new Set(["governor", "research", "power", "food", "maxPop", "growth", "goldPct", "prodPct", "unrest",
  "xp", "magicWeapons", "sight", "healing",
  // extensions documentees dans buildings.js
  "farmerFood", "mineralPct", "nightshade", "housingPct", "walls", "powerPerBook", "myrrorPower", "goldPerProd",
  // ajouts d'Arcanes : tours de défense, Relais de magie (forteresse)
  "towers", "magicRelay"]);

// --- unites --------------------------------------------------------------
if (has("units")) {
  for (const [id, u] of Object.entries(DATA.units)) {
    if (u.id !== id) err(`unite ${id} : id interne « ${u.id} » different`);
    for (const k of ["name", "figures", "melee", "def", "res", "hp", "move", "upkeep", "requires", "abilities", "spells"]) {
      if (u[k] === undefined) err(`unite ${id} : champ « ${k} » manquant`);
    }
    if (u.race !== null && u.race !== "fantastic" && u.race !== "hero" && !RACES.includes(u.race)) err(`unite ${id} : race inconnue « ${u.race} »`);
    if (u.realm !== null && !REALMS.includes(u.realm)) err(`unite ${id} : royaume inconnu « ${u.realm} »`);
    if (u.race === "fantastic" && !u.realm) err(`unite ${id} : creature invoquee sans royaume`);
    if (![null, "missile", "boulder", "magic"].includes(u.rangedType)) err(`unite ${id} : rangedType invalide « ${u.rangedType} »`);
    if (u.rangedType === "magic" && !REALMS.includes(u.rangedRealm)) err(`unite ${id} : tir magique sans royaume`);
    if (u.rangedType !== "magic" && u.rangedRealm) err(`unite ${id} : rangedRealm sans tir magique`);
    if (u.ranged > 0 && !u.rangedType) err(`unite ${id} : tir de force ${u.ranged} sans type`);
    if (u.rangedType && !(u.ranged > 0)) err(`unite ${id} : type de tir sans force`);
    if (u.rangedType && u.rangedType !== "magic" && !(u.ammo > 0)) err(`unite ${id} : tir physique sans munitions`);
    if (u.abilities.fireBreath && u.rangedType) warn(`unite ${id} : souffle ET tir`);
    if (u.abilities.transport && u.transport !== u.abilities.transport) err(`unite ${id} : transport ${u.transport} != abilities.transport ${u.abilities.transport}`);
    if (u.sailing && !u.swimming) warn(`unite ${id} : sailing sans swimming`);
    for (const b of u.requires) {
      if (!has("buildings")) break;
      if (!DATA.buildings[b]) err(`unite ${id} : batiment requis « ${b} » absent de DATA.buildings`);
    }
    if (has("spells")) for (const s of u.spells) if (!DATA.spells[s]) err(`unite ${id} : sort « ${s} » absent de DATA.spells`);
    if ((u.race === "fantastic") !== (u.castCost > 0 || ["Demon", "Zombie"].includes(id))) warn(`unite ${id} : castCost ${u.castCost} inattendu pour race ${u.race}`);
    if (u.race === "hero" && has("heroes") && !DATA.heroes[id]) err(`unite heros ${id} absente de DATA.heroes`);
  }
}

// --- heros ---------------------------------------------------------------
if (has("heroes")) {
  const names = new Set();
  for (const [id, h] of Object.entries(DATA.heroes)) {
    if (h.id !== id) err(`heros ${id} : id interne different`);
    if (!has("units") || !DATA.units[h.unit]) err(`heros ${id} : unite « ${h.unit} » absente`);
    else if (DATA.units[h.unit].race !== "hero") err(`heros ${id} : l'unite n'est pas de race hero`);
    if (!["fighter", "mage", "any"].includes(h.randomType)) err(`heros ${id} : randomType invalide`);
    if (!h.name || !h.title) err(`heros ${id} : nom ou titre manquant`);
    if (names.has(h.name)) err(`heros ${id} : nom « ${h.name} » en double`);
    names.add(h.name);
    if (has("units") && DATA.units[h.unit] && DATA.units[h.unit].name !== h.name) err(`heros ${id} : nom different de l'unite`);
  }
}

// --- batiments -----------------------------------------------------------
if (has("buildings")) {
  for (const b of BUILDING_IDS) if (!DATA.buildings[b]) err(`batiment de la spec « ${b} » manquant`);
  for (const [id, b] of Object.entries(DATA.buildings)) {
    if (b.id !== id) err(`batiment ${id} : id interne different`);
    if (!BUILDING_IDS.includes(id)) warn(`batiment ${id} : id hors spec`);
    for (const r of b.requires) if (!DATA.buildings[r]) err(`batiment ${id} : prerequis « ${r} » inexistant`);
    if (b.replaces && !DATA.buildings[b.replaces]) err(`batiment ${id} : replaces « ${b.replaces} » inexistant`);
    if (![null, "forest", "hillsMountain", "water"].includes(b.terrain)) err(`batiment ${id} : terrain « ${b.terrain} » invalide`);
    for (const k of Object.keys(b.effects || {})) if (!BUILDING_EFFECTS.has(k)) err(`batiment ${id} : cle d'effet « ${k} » inconnue`);
    if (b.effects && b.effects.xp !== undefined && ![20, 60].includes(b.effects.xp)) err(`batiment ${id} : xp doit valoir 20 ou 60`);
  }
  // cycles de prerequis
  const state = {};
  const visit = (id, stack) => {
    if (state[id] === 2) return;
    if (state[id] === 1) { err(`cycle de prerequis : ${stack.concat(id).join(" -> ")}`); return; }
    state[id] = 1;
    for (const r of (DATA.buildings[id] || { requires: [] }).requires) visit(r, stack.concat(id));
    state[id] = 2;
  };
  Object.keys(DATA.buildings).forEach((id) => visit(id, []));
}

const closure = (ids) => {
  const out = new Set();
  const walk = (b) => { if (out.has(b)) return; out.add(b); ((DATA.buildings[b] || {}).requires || []).forEach(walk); };
  ids.forEach(walk);
  return out;
};

// --- races ---------------------------------------------------------------
if (has("races")) {
  for (const r of RACES) if (!DATA.races[r]) err(`race de la spec « ${r} » manquante`);
  for (const [id, r] of Object.entries(DATA.races)) {
    if (r.id !== id) err(`race ${id} : id interne different`);
    if (!["arcanus", "myrror"].includes(r.plane)) err(`race ${id} : plan invalide`);
    for (const k of ["growth", "workerProd", "farmerFood", "powerPerCitizen"]) if (typeof r[k] !== "number") err(`race ${id} : ${k} non numerique`);
    if (has("buildings")) for (const b of r.cannotBuild) if (!DATA.buildings[b]) err(`race ${id} : cannotBuild « ${b} » inexistant`);
    const settlers = r.units.filter((u) => has("units") && DATA.units[u] && DATA.units[u].abilities.createOutpost);
    if (settlers.length !== 1) err(`race ${id} : ${settlers.length} unite(s) de colons au lieu d'une`);
    for (const uid of r.units) {
      const u = has("units") && DATA.units[uid];
      if (!u) { err(`race ${id} : unite « ${uid} » absente de DATA.units`); continue; }
      if (u.race !== null && u.race !== id) err(`race ${id} : liste l'unite ${uid} de la race « ${u.race} »`);
      if (u.race === null && !["Trireme", "Galley", "Catapult", "Warship"].includes(uid)) err(`race ${id} : unite generique inattendue ${uid}`);
      if (has("buildings")) {
        const blocked = [...closure(u.requires)].filter((b) => r.cannotBuild.includes(b));
        if (blocked.length) err(`race ${id} : ${uid} exige ${blocked.join(", ")} que la race ne peut pas construire`);
      }
    }
    if (has("units")) for (const u of Object.values(DATA.units)) {
      if (u.race === id && !r.units.includes(u.id)) {
        const blocked = has("buildings") ? [...closure(u.requires)].filter((b) => r.cannotBuild.includes(b)) : [];
        (blocked.length ? warn : err)(`race ${id} : unite raciale ${u.id} non listee${blocked.length ? " (bloquee par " + blocked.join(", ") + ")" : ""}`);
      }
    }
    if (r.units.length !== new Set(r.units).size) err(`race ${id} : unites en double`);
  }
}

// --- terrain, mineraux, retorts, sorciers ---------------------------------
if (has("terrain")) {
  for (const t of ["ocean", "shore", "grass", "forest", "hills", "mountain", "desert", "swamp", "tundra", "river", "lake",
    "sorceryNode", "natureNode", "chaosNode", "volcano"]) {
    const v = DATA.terrain[t];
    if (!v) { err(`terrain « ${t} » manquant`); continue; }
    for (const k of ["name", "move", "food", "prodPct", "goldPct"]) if (v[k] === undefined) err(`terrain ${t} : ${k} manquant`);
    if (!("roadTurns" in v)) err(`terrain ${t} : roadTurns manquant`);
  }
}
if (has("minerals")) {
  for (const m of ["iron", "coal", "silver", "gold", "gems", "mithril", "adamantium", "quork", "crysx", "wildGame", "nightshade"]) {
    const v = DATA.minerals[m];
    if (!v) { err(`mineral « ${m} » manquant`); continue; }
    if (has("terrain")) for (const t of v.terrains) if (!DATA.terrain[t]) err(`mineral ${m} : terrain « ${t} » inconnu`);
  }
}
if (has("retorts")) {
  for (const [id, r] of Object.entries(DATA.retorts)) {
    if (!(r.cost >= 1 && r.cost <= 3)) err(`retort ${id} : cout ${r.cost} invalide`);
    for (const realm of Object.keys((r.req && r.req.realms) || {})) if (!REALMS.includes(realm)) err(`retort ${id} : royaume « ${realm} » inconnu`);
    if (has("spells")) for (const s of (r.effects && r.effects.startSpells) || []) if (!DATA.spells[s]) err(`retort ${id} : sort de depart « ${s} » absent`);
  }
}
const meetsReq = (books, req) => {
  if (!req) return true;
  for (const [realm, n] of Object.entries(req.realms || {})) if ((books[realm] || 0) < n) return false;
  if (req.books && !Object.values(books).some((n) => n >= req.books)) return false;
  if (req.distinctRealms && Object.values(books).filter((n) => n >= (req.booksEach || 1)).length < req.distinctRealms) return false;
  return true;
};
if (Array.isArray(DATA.wizards)) {
  if (DATA.wizards.length !== 14) err(`${DATA.wizards.length} sorciers au lieu de 14`);
  const portraits = new Set();
  for (const w of DATA.wizards) {
    portraits.add(w.portrait);
    for (const realm of Object.keys(w.books)) if (!REALMS.includes(realm) || realm === "arcane") err(`sorcier ${w.name} : royaume « ${realm} » invalide`);
    let picks = Object.values(w.books).reduce((a, b) => a + b, 0);
    for (const rid of w.retorts) {
      const r = has("retorts") && DATA.retorts[rid];
      if (!r) { err(`sorcier ${w.name} : retort « ${rid} » inconnu`); continue; }
      picks += r.cost;
      if (!meetsReq(w.books, r.req)) err(`sorcier ${w.name} : prerequis du retort ${rid} non remplis`);
    }
    if (picks !== 11) err(`sorcier ${w.name} : ${picks} choix au lieu de 11`);
    if (Object.keys(w.books).filter((k) => ["life"].includes(k)).length && w.books.death) err(`sorcier ${w.name} : vie et mort ensemble`);
  }
  if (portraits.size !== 14) err("portraits de sorciers non uniques ou incomplets");
}

// --- sorts (si presents) -------------------------------------------------
if (has("spells") && has("units")) {
  for (const [id, s] of Object.entries(DATA.spells)) {
    if (s.kind === "summon" && s.params && s.params.unit && !DATA.units[s.params.unit]) err(`sort ${id} : unite invoquee « ${s.params.unit} » absente`);
  }
}

// --- rapport --------------------------------------------------------------
console.log("Fichiers charges :", files.join(", "));
console.log("Entrees :", JSON.stringify(counts));
for (const w of warnings) console.log("AVERTISSEMENT :", w);
for (const e of errors) console.log("ERREUR :", e);
console.log(errors.length ? `${errors.length} erreur(s), ${warnings.length} avertissement(s)` : `OK (${warnings.length} avertissement(s))`);
process.exit(errors.length ? 1 : 0);
