"""Genere data/units.js, heroes.js, races.js, buildings.js, terrain.js pour Arcanes.

Usage (Windows : `py`, ailleurs `python3`) :
    py tools/build_data.py [chemin/vers/kazz/game/magic] [--report fichier.txt]

Sources : code kazzmir (BSD-3) pour les unites/heros/regles de cite, manuel original pour
les tables (chiffres uniquement). Les textes francais sont rediges pour Arcanes.
N'ecrit jamais data/spells.js ni assets/.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from kazz_units import parse_units  # noqa: E402
import fr_text as FR  # noqa: E402
import game_tables as GT  # noqa: E402
import manual_tables as MT  # noqa: E402

ROOT = os.path.dirname(HERE)
DATA_DIR = os.path.join(ROOT, "data")
DEFAULT_KAZZ = "/tmp/claude-0/-home-claude/8f18b999-80b5-5aa0-894b-c23c246e8288/scratchpad/src/kazz/game/magic"

HEADER = "window.DATA = window.DATA || {}; // en Node, le build injecte `var window = globalThis`\n"

REALM_MAP = {"data.LifeMagic": "life", "data.DeathMagic": "death", "data.ChaosMagic": "chaos",
             "data.NatureMagic": "nature", "data.SorceryMagic": "sorcery", "data.ArcaneMagic": "arcane"}
RANGED_MAP = {"DamageRangedPhysical": "missile", "DamageRangedBoulder": "boulder", "DamageRangedMagical": "magic"}

# Corrections volontaires des donnees kazz (chacune justifiee et listee dans le rapport).
OVERRIDES = {
    "HighMenMagician": {"figures": 4},
    "GuardianSpirit": {"overlandMove": 2},  # Arcanes : 2 sur la carte comme l'Esprit magique (il coûte 80 mana et le grimoire de Vie ; plus lent, il n'avait aucun sens)
    "LizardSwordsmen": {"hp": 2},  # kazz HitPoints 4 ; table B : hommes-lezards a 2 PV, comme toutes leurs autres unites  # kazz Count 6 ; manuel 4 et tous les autres Magiciens ont 4 figurines
    "FloatingIsland": {"sailing": True},  # manuel : deplacement « Sailing » (eau uniquement) ; kazz : Swimming seul
    "AirShip": {"transport": 2, "abilities+": {"transport": 2}},  # manuel : « Carries 2 Units » ; absent chez kazz
    "NomadRangers": {"abilities+": {"scouting": 2}},  # manuel : « Scouting (Range 2) » ; absent chez kazz
    "Nagas": {"swimming": True},  # manuel : mouvement « 1 Swim » ; kazz sans Swimming
    "Slingers": {"rangedType": "missile"},  # des pierres de fronde : Garde du vent, Bois tordu et immunité aux projectiles les arrêtent (kazz : Boulder)
    "HeroSerena": {"spells": ["healing"]},  # kazz hero.go GetKnownSpells (absent de unit.go)
    "HeroRavashack": {"spells": ["weakness", "black_sleep", "animate_dead", "wrack"]},  # idem
}

# Nom de sort kazz -> intitule exact du grimoire (pour le slug).
SPELL_NAME_FIX = {"Lionheart": "Lion Heart"}


def slug(name):
    s = name.lower().replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def lower_camel(name):
    return name[0].lower() + name[1:]


def num(v):
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def building_id(kazz_name):
    b = kazz_name.replace("building.Building", "")
    special = {"ShipYard": "shipYard", "Stables": "stables", "ShipwrightsGuild": "shipwrightsGuild"}
    return special.get(b, lower_camel(b))


def js_obj(name, entries, comment):
    lines = [HEADER, "/* " + comment.strip() + " */", "DATA.%s = {" % name]
    keys = list(entries)
    for i, k in enumerate(keys):
        lines.append("  %s: %s%s" % (json.dumps(k), json.dumps(entries[k], ensure_ascii=False),
                                     "," if i < len(keys) - 1 else ""))
    lines.append("};")
    return "\n".join(lines) + "\n"


def js_array(name, items, comment):
    lines = [HEADER, "/* " + comment.strip() + " */", "DATA.%s = [" % name]
    for i, it in enumerate(items):
        lines.append("  %s%s" % (json.dumps(it, ensure_ascii=False), "," if i < len(items) - 1 else ""))
    lines.append("];")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Unites
# ---------------------------------------------------------------------------
def build_units(raw, order):
    units = {}
    for uid in order:
        u = raw[uid]
        if uid == "UnitNone":
            continue
        race = GT.RACE_MAP[u["Race"]]
        en_raw = u["Name"]
        is_hero = race == "hero"
        abilities = {}
        for ab, val in u.get("Abilities", []):
            abilities[lower_camel(ab)] = True if val is None else num(val)
        rtype = RANGED_MAP.get(u.get("RangedAttackDamageType")) if u.get("RangedAttackPower", 0) else None
        if u.get("RangedAttackDamageType") and u["RangedAttackDamageType"] not in RANGED_MAP:
            raise ValueError("type de tir inconnu %s pour %s" % (u["RangedAttackDamageType"], uid))
        spells = []
        for s in u.get("Spells", []):
            spells.append(slug(SPELL_NAME_FIX.get(s, s)))
        if is_hero:
            title_en = None
            name = FR.HERO_NAMES[uid]
            en = None  # remplace plus bas par le titre de classe anglais (pas le nom d'origine)
        else:
            name = FR.UNIT_NAMES_FR[en_raw]
            en = FR.EN_FIXES.get(en_raw, en_raw)
        entry = {
            "id": uid, "en": en, "name": name,
            "race": race, "realm": REALM_MAP.get(u.get("Realm")),
            "figures": u.get("Count", 1),
            "melee": u.get("MeleeAttackPower", 0),
            "ranged": u.get("RangedAttackPower", 0),
            "rangedType": rtype,
            "rangedRealm": REALM_MAP.get(u.get("RangedMagicalRealm")) if rtype == "magic" else None,
            "ammo": u.get("RangedAttacks", 0),
            "def": u.get("Defense", 0), "res": u.get("Resistance", 0), "hp": u.get("HitPoints", 0),
            "move": u.get("MovementSpeed", 0),
            "overlandMove": u.get("OverlandMovementSpeed") or None,
            "flying": bool(u.get("Flying")), "swimming": bool(u.get("Swimming")), "sailing": bool(u.get("Sailing")),
            "cost": u.get("ProductionCost", 0), "costReduction": bool(u.get("ProductionCostReduction")),
            "upkeep": {"gold": u.get("UpkeepGold", 0), "food": u.get("UpkeepFood", 0), "mana": u.get("UpkeepMana", 0)},
            "castCost": u.get("CastingCost", 0),
            "requires": [building_id(b) for b in u.get("RequiredBuildings", [])],
            "abilities": abilities,
            "spells": spells,
            "transport": int(abilities.get("transport", 0)) if not isinstance(abilities.get("transport", 0), bool) else 0,
            "desc": FR.unit_desc(uid, en_raw),
        }
        ov = OVERRIDES.get(uid, {})
        for k, v in ov.items():
            if k == "abilities+":
                entry["abilities"].update(v)
            else:
                entry[k] = v
        units[uid] = entry
    return units


# ---------------------------------------------------------------------------
# Comparaison kazz / manuel
# ---------------------------------------------------------------------------
MANUAL_RTYPE = {"missile": "missile", "rock": "boulder", "magic": "magic"}


def compare(units, report):
    def diff(uid, label, kazz, man):
        if kazz != man:
            report.append("  %-18s %-10s kazz=%s manuel=%s" % (uid, label, kazz, man))

    report.append("== Table I (unites standard et raciales) : divergences kazz (v1.31) / manuel (v1.0) ==")
    for (mname, uid, fig, cost, melee, rng, rtype, ammo, df, res, hp, mv, fly) in MT.TABLE_I:
        u = units[uid]
        diff(uid, "figurines", u["figures"], fig)
        diff(uid, "cout", u["cost"], cost)
        diff(uid, "melee", u["melee"], melee)
        diff(uid, "defense", u["def"], df)
        diff(uid, "resist.", u["res"], res)
        diff(uid, "pv", u["hp"], hp)
        diff(uid, "mouvement", u["move"], mv)
        diff(uid, "vol", u["flying"], fly)
        compare_ranged(u, uid, rng, rtype, ammo, diff)
        for ab in MT.TABLE_I_ABILITIES.get(uid, []):
            key, _, val = ab.partition(":")
            if key == "transport":
                diff(uid, "transport", u["transport"], int(val))
            elif key not in u["abilities"]:
                report.append("  %-18s capacite  '%s' citee par le manuel, absente chez kazz" % (uid, key))

    report.append("")
    report.append("== Table J (creatures invoquees) : divergences kazz / manuel ==")
    for (mname, uid, realm, upk, melee, rng, rtype, ammo, df, res, hp, mv, fly, fig) in MT.TABLE_J:
        u = units[uid]
        diff(uid, "royaume", u["realm"], realm)
        diff(uid, "entretien", u["upkeep"]["mana"], upk)
        diff(uid, "melee", u["melee"], melee)
        diff(uid, "defense", u["def"], df)
        diff(uid, "resist.", u["res"], res)
        diff(uid, "pv", u["hp"], hp)
        diff(uid, "mouvement", u["move"], mv)
        diff(uid, "vol", u["flying"], fly)
        diff(uid, "figurines", u["figures"], fig)
        compare_ranged(u, uid, rng, rtype, ammo, diff)
    for uid, mode in MT.TABLE_J_MOVE_MODES.items():
        if not units[uid][mode]:
            report.append("  %-18s mode      manuel=%s absent chez kazz" % (uid, mode))

    report.append("")
    report.append("== Table G (batiment -> troupes) : unites dont les prerequis kazz n'incluent pas le batiment du manuel ==")
    for bid, troops in MT.TABLE_G_TROOPS.items():
        for t in troops:
            matches = [u for u in units.values() if u["race"] != "hero" and
                       (u["id"] == t or (u["en"] or "").rstrip("s") == t.rstrip("s"))]
            if not matches:
                report.append("  %-18s aucune unite kazz correspondante (batiment %s)" % (t, bid))
            for u in matches:
                if bid not in u["requires"]:
                    report.append("  %-18s manuel: %s ; kazz requires=%s" % (u["id"], bid, u["requires"]))


def compare_ranged(u, uid, rng, rtype, ammo, diff):
    if rtype in MANUAL_RTYPE:
        diff(uid, "tir", u["ranged"], rng)
        diff(uid, "type tir", u["rangedType"], MANUAL_RTYPE[rtype])
        if ammo is not None:
            diff(uid, "munitions", u["ammo"], ammo)
    elif rtype == "breath":
        val = u["abilities"].get("fireBreath", u["abilities"].get("lightningBreath", 0))
        diff(uid, "souffle", val, rng)
        if u["ranged"]:
            diff(uid, "tir", u["ranged"], 0)
    elif rtype == "thrown":
        diff(uid, "jet", u["abilities"].get("thrown", 0), rng)
    else:
        diff(uid, "tir", u["ranged"], 0)


# ---------------------------------------------------------------------------
# Heros
# ---------------------------------------------------------------------------
def parse_heroes(kazz_dir):
    src = open(os.path.join(kazz_dir, "hero", "hero.go"), encoding="utf-8").read()

    def switch_block(func):
        m = re.search(r"func \(heroType HeroType\) %s\(\)[^{]*\{(.*?)\n\}" % func, src, re.S)
        return dict(re.findall(r"case (Hero\w+): return (\w+)", m.group(1)))

    def bool_set(func):
        m = re.search(r"func \(hero \*Hero\) %s\(\) bool \{(.*?)return true" % func, src, re.S)
        return set(re.findall(r"Hero\w+", m.group(1)))

    m = re.search(r"func \(hero \*Hero\) GetTitle\(\) string \{(.*?)\n\}", src, re.S)
    titles = dict(re.findall(r'case (Hero\w+): return "([^"]+)"', m.group(1)))
    m = re.search(r"func \(hero \*Hero\) GetPortraitLbxInfo\(\)[^{]*\{(.*?)\n\}", src, re.S)
    portraits = dict(re.findall(r"case (Hero\w+): return lbxFile, (\d+)", m.group(1)))
    fame = switch_block("GetRequiredFame")
    count = switch_block("RandomAbilityCount")
    kind = switch_block("RandomAbilityType")
    female = bool_set("IsFemale")
    champion = bool_set("IsChampion")
    slots_map = {"ArtifactSlotMeleeWeapon": "melee", "ArtifactSlotRangedWeapon": "ranged",
                 "ArtifactSlotMagicWeapon": "magic", "ArtifactSlotAnyWeapon": "anyWeapon",
                 "ArtifactSlotArmor": "armor", "ArtifactSlotJewelry": "jewelry"}
    slots = {}
    for hm in re.finditer(r"Equals\(units\.(Hero\w+)\) \{\s*return \[\]artifact\.ArtifactSlot\{([^}]*)\}", src):
        slots[hm.group(1)] = [slots_map[x.strip().replace("artifact.", "")] for x in hm.group(2).split(",")]
    order = re.findall(r"^\s+(Hero\w+)(?: HeroType = iota)?$",
                       re.search(r"type HeroType int\nconst \((.*?)\)", src, re.S).group(1), re.M)
    order = [h for h in order if h != "HeroNone"]
    kind_map = {"abilityChoiceFighter": "fighter", "abilityChoiceMage": "mage", "abilityChoiceAny": "any"}
    heroes = {}
    for h in sorted(order, key=lambda x: int(portraits[x])):
        heroes[h] = {
            "id": h, "unit": h,
            "title": FR.HERO_TITLE_FR[titles[h]], "titleEn": titles[h],
            "name": FR.HERO_NAMES[h],
            "fame": int(fame[h]), "female": h in female, "champion": h in champion,
            "randomAbilities": int(count[h]), "randomType": kind_map[kind[h]],
            "portraitKey": "unit:" + h, "portraitIndex": int(portraits[h]),
            "hireFee": 100 + 10 * int(fame[h]), "slots": slots[h],
            "desc": FR.HERO_DESC[h],
        }
    return heroes


# ---------------------------------------------------------------------------
# Races
# ---------------------------------------------------------------------------
GENERIC_BY_MANUAL = {"Catapult": "Catapult", "Galley": "Galley", "Warship": "Warship"}


def transitive_requires(bid, bmap, seen=None):
    seen = set() if seen is None else seen
    for r in bmap[bid]["requires"]:
        if r not in seen:
            seen.add(r)
            transitive_requires(r, bmap, seen)
    return seen


def unit_chain(unit, bmap):
    out = set(unit["requires"])
    for b in unit["requires"]:
        out |= transitive_requires(b, bmap)
    return out


def build_races(units, buildings, report):
    races = {}
    report.append("")
    report.append("== Races ==")
    for rid in GT.RACE_ORDER:
        plane, growth, worker, farmer, power = GT.RACE_STATS[rid]
        name, desc, traits = GT.RACE_TEXT[rid]
        cannot = sorted(building_id("building.Building" + b) for b in GT.KAZZ_RACIAL_BANS[rid])
        own = [u["id"] for u in units.values() if u["race"] == rid]
        tb = MT.TABLE_B[rid]
        manual_generic = ["Trireme"] + [GENERIC_BY_MANUAL[x] for x in tb["standard"] + tb["special"]
                                        if x in GENERIC_BY_MANUAL]
        generic = ["Trireme", "Galley", "Catapult", "Warship"]
        listed, dropped = [], []
        for uid in own + generic:
            if uid in generic and uid not in manual_generic:
                if not (unit_chain(units[uid], buildings) & set(cannot)):
                    report.append("  %-10s %s NON liste (absent de la table B) bien que ses prerequis soient autorises"
                                  % (rid, uid))
                continue
            chain = unit_chain(units[uid], buildings)
            blocked = sorted(chain & set(cannot))
            if blocked:
                dropped.append("%s (bloque par %s)" % (uid, ", ".join(blocked)))
            elif uid not in listed:
                listed.append(uid)
        if dropped:
            report.append("  %-10s retire de `units` (prerequis interdits a la race) : %s" % (rid, "; ".join(dropped)))
        man_cannot = set(tb["cannot"])
        missing = sorted(man_cannot - set(cannot))
        if missing:
            report.append("  %-10s manuel « ne peut construire » %s, mais kazz l'autorise (kazz retenu)" % (rid, missing))
        # unites standard du manuel absentes chez kazz
        own_en = {(units[u]["en"] or "").rstrip("s").replace("Shaman", "Shaman") for u in own}
        for st in tb["standard"]:
            if st in GENERIC_BY_MANUAL:
                continue
            if st.rstrip("s") not in own_en:
                report.append("  %-10s manuel liste « %s » en unite standard ; aucune unite kazz" % (rid, st))
        # sens inverse : unites standard kazz absentes de la table B (hors colons/epeistes, toujours presents)
        man_std = {x.rstrip("s") for x in tb["standard"] + tb["special"]}
        for uid in own:
            en = (units[uid]["en"] or "").rstrip("s")
            if en in ("Settler", "Swordsmen".rstrip("s")):
                continue
            if en not in man_std and en.replace(" ", "") not in {m.replace(" ", "") for m in man_std}:
                report.append("  %-10s kazz a %s (%s), absent de la table B du manuel (kazz retenu)" % (rid, uid, units[uid]["en"]))
        entry = {"id": rid, "name": name, "plane": plane, "desc": desc,
                 "growth": growth, "workerProd": worker, "farmerFood": farmer, "powerPerCitizen": power,
                 "cannotBuild": cannot, "units": listed, "traits": traits}
        entry.update(GT.RACE_EXTRA.get(rid, {}))
        if rid in GT.PACIFY_EXCEPTIONS:
            entry["noPacify"] = GT.PACIFY_EXCEPTIONS[rid]
        if rid in GT.KAZZ_GROWTH:
            report.append("  %-10s croissance kazz=%+d, manuel « la plus lente » -> %+d retenu"
                          % (rid, GT.KAZZ_GROWTH[rid], growth))
        races[rid] = entry
    for note in GT.RACE_NOTES:
        report.append("  " + note)
    return races


# ---------------------------------------------------------------------------
# Batiments
# ---------------------------------------------------------------------------
def build_buildings():
    out = {}
    for (bid, name, cost, upkeep, req, terrain, effects, desc) in GT.BUILDINGS:
        e = {"id": bid, "name": name, "cost": cost, "upkeep": upkeep, "requires": req, "terrain": terrain,
             "effects": effects, "desc": desc}
        if bid in GT.REPLACES:
            e["replaces"] = GT.REPLACES[bid]
        if bid in GT.PSEUDO_BUILDINGS:
            e["pseudo"] = True
        if bid in GT.UNBUILDABLE:
            e["buildable"] = False
        if bid in getattr(GT, "FORTRESS_ONLY", ()):
            e["fortressOnly"] = True
        if bid in ("shrine", "sagesGuild", "animistsGuild"):
            e["effects"] = dict(effects, nightshade=True)
        out[bid] = e
    return out


# ---------------------------------------------------------------------------
# Terrain, mineraux, retorts, sorciers
# ---------------------------------------------------------------------------
def build_terrain(report):
    terrain = {}
    for tid, (name, move, food, prod, gold, road, water, desc) in GT.TERRAIN.items():
        e = {"name": name, "move": move, "food": food, "prodPct": prod, "goldPct": gold, "roadTurns": road,
             "water": water, "desc": desc}
        if tid == "river":
            e["goldPctMouth"] = GT.RIVER_MOUTH_GOLD_PCT
        if tid == "lake":
            e["foodWithRiver"] = 2
        terrain[tid] = e
    minerals = {}
    for mid, (name, gold, power, food, ucost, terrs, myr, desc) in GT.MINERALS.items():
        minerals[mid] = {"name": name, "gold": gold, "power": power, "food": food, "unitCostPct": ucost,
                         "terrains": terrs, "myrrorOnly": myr, "desc": desc}
    retorts = {}
    for rid, (name, cost, req, effects, desc) in GT.RETORTS.items():
        retorts[rid] = {"name": name, "cost": cost, "req": req, "effects": effects, "desc": desc}
    wizards = []
    for (wid, name, portrait, books, rets, color) in GT.WIZARDS:
        wizards.append({"id": wid, "name": name, "portrait": portrait, "books": books, "retorts": rets,
                        "color": color})
    report.append("")
    report.append("== Terrain / retorts / sorciers ==")
    for tid, man in GT.MANUAL_TERRAIN.items():
        for k, v in man.items():
            report.append("  terrain %-12s %-7s retenu=%s (kazz) manuel=%s" % (tid, k, terrain[tid][k], v))
    for tid, v in GT.KAZZ_ROADS.items():
        report.append("  route   %-12s retenu=%s (manuel, table F) kazz=%s" % (tid, terrain[tid]["roadTurns"], v))
    for tid, (ours, kz) in GT.NODE_MOVE_ASSUMED.items():
        report.append("  terrain %-12s move    retenu=%s (hypothese) kazz=%s (cas par defaut)" % (tid, ours, kz))
    for note in GT.MANUAL_MINERAL_NOTES:
        report.append("  mineral " + note)
    for rid, v in GT.KAZZ_RETORT_COSTS.items():
        report.append("  retort  %-12s cout retenu=%s (manuel) kazz/v1.31=%s" % (rid, retorts[rid]["cost"], v))
    for note in GT.KAZZ_RETORT_NOTES:
        report.append("  retort  " + note)
    for p, books in GT.KAZZ_WIZARD_DIFFS.items():
        report.append("  sorcier portrait %d livres retenus=%s (manuel) kazz=%s" % (p, wizards[p]["books"], books))
    return terrain, minerals, retorts, wizards


# ---------------------------------------------------------------------------
def main():
    argv = sys.argv[1:]
    report_path = None
    if "--report" in argv:
        i = argv.index("--report")
        report_path = argv[i + 1]
        del argv[i:i + 2]
    kazz_dir = argv[0] if argv else DEFAULT_KAZZ
    raw, order = parse_units(os.path.join(kazz_dir, "units", "unit.go"))
    units = build_units(raw, order)
    heroes = parse_heroes(kazz_dir)
    for hid, h in heroes.items():
        units[hid]["en"] = h["titleEn"]  # pas de nom propre d'origine dans les donnees
    buildings = build_buildings()
    report = []
    compare(units, report)
    races = build_races(units, buildings, report)
    terrain, minerals, retorts, wizards = build_terrain(report)
    report.append("")
    report.append("== Batiments ==")
    for note in GT.BUILDING_NOTES:
        report.append("  " + note)
    report.append("")
    report.append("== Corrections appliquees aux donnees kazz ==")
    for uid, ov in OVERRIDES.items():
        report.append("  %-18s %s" % (uid, ov))

    os.makedirs(DATA_DIR, exist_ok=True)
    files = {
        "units.js": js_obj("units", units, """
Unites d'Arcanes, generees par tools/build_data.py depuis units/unit.go (kazzmir, BSD-3).
Champs : voir DATA-SPEC.md. Conventions :
 - abilities.toHit en % (10 = +1 au toucher) ; lifeSteal/stoningGaze/... = modificateur de sauvegarde ;
   caster = mana de lancement ; *Spell (fireballSpell, healingSpell, doomBoltSpell, webSpell) = utilisations par combat.
 - Souffle (fireBreath/lightningBreath) et jet (thrown) sont des capacites, pas des tirs (rangedType null).
 - rangedType "magic" avec ammo 0 : le tir puise dans la reserve de lancement (caster), 3 mana par tir (kazz).
 - ammo 99 (Navire de guerre) = illimite. Heros : `en` = titre de classe anglais, `name` = nom invente.
 - Tester une capacite avec `in` : une valeur 0 est possible (lifeSteal: 0 = vol de vie sans malus de sauvegarde).
"""),
        "heroes.js": js_obj("heroes", heroes, """
Heros d'Arcanes, generes depuis hero/hero.go (kazzmir) : renommee requise, sexe, statut champion,
nombre et type de capacites aleatoires. Noms propres inventes ; titre de classe en francais.
hireFee = prix d'embauche au niveau 1 (100 + 10 x renommee, x (3+niveau)/4 ensuite, /2 si Charismatique) ;
slots = emplacements d'objets (melee, ranged, magic, anyWeapon, armor, jewelry).
"""),
        "races.js": js_obj("races", races, """
Races jouables. growth = bonus de croissance en population/tour (city.go PopulationGrowthRate) ;
workerProd = production par ouvrier ; farmerFood = nourriture par fermier ; powerPerCitizen = mana par citoyen.
cannotBuild = liste complete (kazz building.RacialBuildings, v1.31). units = unites constructibles
(raciales + Trireme/Galley/Catapult/Warship dont toute la chaine de prerequis est autorisee a la race).
Champs supplementaires : goldPct (Nomades), mineralMult (Nains), noPacify = batiments dont la reduction
d'agitation ne s'applique pas a cette race (kazz city.go, d'apres le wiki v1.31).
"""),
        "buildings.js": js_obj("buildings", buildings, """
Batiments (table G du manuel : cout de production / entretien en or / prerequis directs).
effects : research, power, food (ajout fixe), maxPop, growth (pop/tour), goldPct, prodPct, unrest (reduction),
xp (experience initiale), magicWeapons, sight (portee de detection), healing (% de PV recuperes/tour en ville).
Extensions : farmerFood (+N par fermier), mineralPct (+N % sur les gisements), nightshade (active la belladone),
housingPct (bonus de croissance quand la cite produit des Logements), walls (remparts de combat),
powerPerBook / myrrorPower (forteresse : mana = livres du sorcier, +5 sur Myrror), goldPerProd (Commerce).
sight n'est pas cumulatif (prendre le maximum). Les bonus d'or/production/nourriture des batiments se cumulent.
terrain : condition de site (forest = foret ou noeud de nature ; hillsMountain = colline, montagne, volcan
ou noeud de chaos ; water = cite cotiere ou fluviale). pseudo = choix de production ; buildable:false = special.
"""),
        "terrain.js": None,
    }
    terrain_js = (js_obj("terrain", terrain, """
Terrains : move = points de mouvement pour entrer (kazz game/model.go) ; food = nourriture de la case
(maplib/map.go FoodBonus) ; prodPct = bonus de production % par case du bassin (ProductionBonus) ;
goldPct = bonus d'or % de la cite : sur une riviere 20 (30 a l'embouchure, goldPctMouth), adjacente a l'ocean
ou au rivage 10 ; non cumulable (prendre le maximum) ; water = case d'eau ;
roadTurns = tours de construction de route pour un ingenieur (table F du manuel), null = impossible.
""") + "\n" + js_obj("minerals", minerals, """
Gisements et biotes (data/data.go, map.go, table E). gold/power/food par tour ; unitCostPct = reduction du
cout des troupes normales (cumul plafonne a -50 %, doublee par les Nains et la guilde des mineurs).
""").replace(HEADER, "") + "\n" + js_obj("retorts", retorts, """
Retorts (capacites speciales du sorcier), couts et prerequis d'apres le manuel.
req.realms = minimum de livres par royaume ; req.books = minimum dans un meme royaume ;
req.distinctRealms + req.booksEach = au moins N royaumes ayant chacun >= M livres.
effects : researchPct / costPct (sur effects.realm si present, sinon tous les sorts), dispelResist (multiplicateur
de difficulte a dissiper), nodePowerMult, castingSkill, skillGainPct, summonCostPct, ... (chiffres manquants du
manuel repris de kazz).
""").replace(HEADER, "") + "\n" + js_array("wizards", wizards, """
Les 14 sorciers predefinis (livres et retorts du manuel, 11 choix chacun), noms inventes.
portrait = index 0..13 (ordre kazz DefaultWizardSlots).
""").replace(HEADER, ""))
    files["terrain.js"] = terrain_js
    for fname, content in files.items():
        with open(os.path.join(DATA_DIR, fname), "w", encoding="utf-8") as f:
            f.write(content)
    counts = {"units": len(units), "heroes": len(heroes), "races": len(races), "buildings": len(buildings),
              "terrain": len(terrain), "minerals": len(minerals), "retorts": len(retorts), "wizards": len(wizards)}
    text = "\n".join(report)
    if report_path:
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    else:
        print(text)
    print("Entrees :", json.dumps(counts))


if __name__ == "__main__":
    main()
