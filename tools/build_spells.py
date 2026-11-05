#!/usr/bin/env python3
"""Construit data/spells.js (DATA.spells) pour Arcanes.

Sources (par ordre de priorite) :
  1. spelldat.lbx du jeu (lu par read_spelldat.py) : royaume, rarete (5 royaumes), cout de base,
     eligibilite combat/carte, cout variable, cout de recherche, section du grimoire en jeu.
  2. kazzmir (BSD-3) : entretien des enchantements (data/enchantment.go), entretien des creatures
     (units/unit.go), chiffres des sorts de combat (combat/model.go : InvokeSpell + Create*Effect).
  3. Grimoire PDF (parse_spellbook.py) : liste des sorts, noms anglais (ids), rarete des sorts
     arcaniques, effets hors combat.
  4. Wiki fandom (masterofmagic.fandom.com) : verifications ponctuelles (WIKI_CHECKS ci-dessous).

Usage : py build_spells.py <spellbook.txt> <spelldat.lbx> <kazz/game/magic> <out spells.js>
Imprime un rapport (comptes, divergences, valeurs manquantes) sur stdout.
"""
import json, os, re, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import parse_spellbook  # noqa: E402
import read_spelldat  # noqa: E402
from spells_fr import S  # noqa: E402

# Noms du grimoire -> noms internes du jeu (spelldat.lbx), quand ils different
GRIM_TO_GAME = {
    "Archangel": "Arch Angel", "Chimera": "Chimeras", "Cockatrice": "Cockatrices", "Djinni": "Djinn",
    "Invisibility": "Invisiblity", "Lion Heart": "Lionheart", "Meteor Storms": "Meteor Storm",
    "Nature's Awareness": "Nature Awareness", "Pathfinding": "Path Finding", "Wraith": "Wraiths",
    "Wraithform": "Wraith Form",
}

# Valeurs lues sur le wiki fandom pendant la construction (page -> valeurs). Toutes concordent avec
# spelldat.lbx pour le cout de recherche.
WIKI_CHECKS = {
    "Fire Bolt": {"research": 60}, "Spell of Mastery": {"cost": 5000, "research": 60000},
    "Spell of Return": {"cost": 1000, "research": 20}, "Dispel Magic": {"cost": 10, "research": 100},
    "Earth Lore": {"cost": 30, "research": 250}, "Time Stop": {"cost": 1500, "upkeep": 200, "research": 6000},
    "Flight": {"cost": 125, "combatCost": 25, "upkeep": 3, "research": 560},
    "Evil Presence": {"cost": 100, "upkeep": 4, "research": 1040},
    "Wind Mastery": {"cost": 400, "upkeep": 5, "research": 620},
    "Lionheart": {"cost": 200, "combatCost": 40, "upkeep": 4, "research": 880},
    "Psionic Blast": {"cost": 10, "research": 250}, "Detect Magic": {"cost": 200, "upkeep": 3, "research": 400},
    "Dispel Evil": {"cost": 25, "research": 450}, "Weakness": {"cost": 5, "research": 40},
    "Nature's Cures": {"cost": 75, "research": 740}, "Confusion": {"cost": 15, "research": 130},
    "Earthquake": {"cost": 200, "research": 1300},
}

# Chiffres d'effet ou le grimoire contredit la source retenue (kazzmir et/ou wiki). Recopie dans le rapport.
EFFECT_NOTES = [
    "Bless : grimoire +2 def/+2 res ; retenu +3/+3 vs mort et chaos (kazzmir GetResistanceFor/GetDefenseFor)",
    "Resist Magic : grimoire +3 res ; retenu +5 (kazzmir)",
    "Lionheart : grimoire +2 ; retenu +3 melee/jet/tir, +3 PV, +3 res (wiki + kazzmir)",
    "Black Channels : grimoire +3 melee ; retenu +2 melee, +1 tir/souffle/def/res/PV (kazzmir overworld.go ; souffle d'apres le grimoire)",
    "Subversion : -25 de relation chez tous les autres sorciers (kazzmir, le grimoire ne chiffre pas)",
    "Chaos Channels (peau de demon) : grimoire +2 def ; retenu +3 (kazzmir)",
    "Ice Bolt : grimoire force 5 ; retenu force 10 = mana depense (kazzmir InvokeSpell : strength = Cost)",
    "Psionic Blast : kazzmir applique une force fixe de 15 (anomalie) ; retenu wiki : 5, +1 / 2 mana, max 25",
    "Banish : grimoire -1 res / 5 mana ; retenu kazzmir : -3 de base, -1 / 15 mana supplementaires",
    "Dispel Magic True, Disenchant True, Disjunction True : grimoire x2 ; retenu x3 le mana (kazzmir)",
    "Holy Word : grimoire 'penalite de 5' pour les morts-vivants ; retenu -7 au total (kazzmir)",
    "Dispel Evil : grimoire -10 pour les morts-vivants ; retenu -9 (wiki + kazzmir)",
    "Weakness : grimoire 'pas de jet' ; retenu jet a -2 (wiki + kazzmir)",
    "Great Unsummoning : grimoire -2 ; retenu -3 (kazzmir)",
    "Prosperity / Inspirations : grimoire +50 % ; retenu +100 % de la base impots+minerais / ouvriers+fermiers (kazzmir city.go + city_test.go)",
    "Earthquake : kazzmir 25 % unites / 15 % batiments ; retenu wiki + grimoire 15 % / 10 %",
    "Prayer : kazzmir donne +3 res comme High Prayer ; retenu grimoire +1",
    "Warp Reality : kazzmir -10 % pour toucher ; retenu grimoire -20 %",
    "Magic Vortex : grimoire 25 % / eclair force 8 sur les voisins ; retenu kazzmir 33 % / force 5 perforant",
    "Meteor Storm : kazzmir 1 % par batiment ; retenu grimoire 5 %",
    "Great Wasting : kazzmir 3 a 5 cases / tour ; retenu grimoire 'jusqu'a 6'",
    "Nature's Wrath : kazzmir 15 % par unite ; retenu grimoire 10 %",
    "Call the Void : kazzmir 50 % de chances par unite de subir 10 degats ; retenu grimoire (toutes les unites)",
    "Wind Mastery : grimoire x2 / x0.5 ; retenu +50 % / -50 % (wiki + kazzmir)",
    "Wall of Stone : grimoire 'lancable en combat' ; spelldat.lbx = carte seulement (retenu)",
    "Spell Blast : grimoire '50+' ; en jeu cout fixe 50 + mana egal au sort vise (pas de '+')",
]

# Rarete des sorts arcaniques : le decoupage positionnel de kazzmir est faux pour ce royaume,
# on suit le grimoire (et le commentaire de kazzmir pour Spell of Return, absent du grimoire).
ARCANE_EXTRA_RARITY = {"Spell of Return": "common"}

SECTION_MAP = {"special": "special", "summoning": "summoning", "enchantment": "global",
               "city": "city", "unit": "unit", "combat": "combat"}

TARGETS = set("none friendlyUnit enemyUnit anyUnit friendlyCity enemyCity anyCity tile combatTile "
              "allEnemyUnits allFriendlyUnits allUnits deadUnit friendlyHero enemyWizard node".split())
KINDS = set("summon unitEnchant curse damage areaDamage resistOrDie heal combatEnchant cityEnchant "
            "cityCurse global terrain dispel special".split())


def slug(name):
    s = name.lower().replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def norm(s):
    return re.sub(r"[^a-z]", "", s.lower())


def read_units(path):
    src = open(path, encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"^var (\w+) Unit = Unit\{(.*?)^\}", src, re.S | re.M):
        body = m.group(2)
        name = re.search(r'^\s*Name:\s*"(.*?)"', body, re.M)
        up = re.search(r"^\s*UpkeepMana:\s*(\d+)", body, re.M)
        out[m.group(1)] = {"name": name.group(1) if name else None, "upkeep": int(up.group(1)) if up else 0}
    return out


def read_upkeeps(path):
    src = open(path, encoding="utf-8").read()
    res = {}
    for typ, prefix in (("Enchantment", "Enchantment"), ("UnitEnchantment", "UnitEnchantment"), ("CityEnchantment", "CityEnchantment")):
        body = re.search(r"func \(enchantment %s\) UpkeepMana\(\) int \{(.*?)\n\}" % typ, src, re.S).group(1)
        for k, v in re.findall(r"case (\w+): return (\d+)", body):
            res[norm(k[len(prefix):])] = (int(v), typ)
    return res


def js_value(v, indent=0):
    return json.dumps(v, ensure_ascii=False)


def main():
    spellbook_txt, spelldat_lbx, kazz, out_path = sys.argv[1:5]
    grim = parse_spellbook.parse(spellbook_txt)
    lbx = read_spelldat_list(spelldat_lbx)
    units = read_units(os.path.join(kazz, "units", "unit.go"))
    upkeeps = read_upkeeps(os.path.join(kazz, "data", "enchantment.go"))
    unit_by_name = {u["name"]: k for k, u in units.items()}

    L = {s["name"]: s for s in lbx if s["name"] != "None"}
    report = {"divergences": [], "noResearch": [], "notes": []}

    # --- comptes du grimoire
    raw_titles = [l.strip()[:-1] for l in open(spellbook_txt, encoding="utf-8").read().split("\n")
                  if re.match(r"^\s{0,20}[A-Z][A-Za-z’' ]+:\s*$", l)]
    parsed = {g["title"] for g in grim}
    rejected = [t for t in raw_titles if parse_spellbook.clean_title(t) not in parsed]
    report["notes"].append("lignes 'Titre:' brutes dans le grimoire : %d ; entrees de sort parsees : %d ; rejetees : %s"
                           % (len(raw_titles), len(grim), rejected))
    # tables recapitulatives (p. 39-42) : chaque nom doit correspondre a une entree, et la rarete doit concorder
    tables = parse_spellbook.parse_category_tables(spellbook_txt)
    gnorm = {norm(g["title"]): g for g in grim}
    alias_norm = {norm(k): norm(v) for k, v in GRIM_TO_GAME.items()}
    alias_norm.update({norm(v): norm(k) for k, v in GRIM_TO_GAME.items()})
    alias_norm.update({"wraiths": "wraith", "djinn": "djinni", "cockatrices": "cockatrice"})
    seen_tab = set()
    for tname, (tsec, tdeg) in tables.items():
        if tdeg is None or tname.startswith("Master of Magic"):
            continue  # morceaux de phrases captures par le decoupage en colonnes
        n = norm(tname)
        g = gnorm.get(n) or gnorm.get(alias_norm.get(n, ""))
        if not g:
            report["divergences"].append("table recapitulative : %r sans entree dans la liste des sorts" % tname)
            continue
        seen_tab.add(g["title"])
        if g["rarity"] != tdeg:
            report["notes"].append("%s : rarete de l'entree %s / table recapitulative %s" % (g["title"], g["rarity"], tdeg))
    missing_tab = sorted(parsed - seen_tab)
    report["notes"].append("entrees absentes des tables recapitulatives : %s" % (missing_tab or "aucune"))

    entries = []
    seen_game = set()
    for g in grim:
        game_name = GRIM_TO_GAME.get(g["title"], g["title"])
        s = L.get(game_name)
        if s:
            seen_game.add(game_name)
        entries.append((g["title"], game_name, g, s))
    for name, s in L.items():
        if name not in seen_game:
            entries.append((name, name, None, s))

    spells = {}
    for en, game_name, g, s in entries:
        sid = slug(en)
        fr = S.get(game_name)
        if fr is None:
            raise SystemExit("pas de donnees FR pour %r" % game_name)
        e = {"id": sid, "en": en}
        if s and s["name"] != en:
            e["enGame"] = s["name"]
        e["name"] = fr["fr"]
        realm = s["magic"] if s else g["realm"]
        if g and s and g["realm"] != s["magic"]:
            report["divergences"].append("%s : royaume grimoire %s / jeu %s" % (en, g["realm"], s["magic"]))
        e["realm"] = realm
        # rarete
        if realm == "arcane":
            rarity = g["rarity"] if g else ARCANE_EXTRA_RARITY[game_name]
            if s and s["rarity"] != rarity:
                report["notes"].append("%s : rarete arcanique prise du grimoire (%s) ; decoupage positionnel kazzmir = %s"
                                       % (en, rarity, s["rarity"]))
        elif s:
            rarity = s["rarity"]
            if g and g["rarity"] != rarity:
                report["divergences"].append("%s : rarete grimoire %s / jeu %s (retenu : jeu)" % (en, g["rarity"], rarity))
        else:
            rarity = g["rarity"]
        e["rarity"] = rarity
        # section : page du grimoire en jeu (kazzmir / spelldat.lbx). La section "Enchantment" du jeu melange
        # enchantements globaux et enchantements de combat : on la scinde selon l'eligibilite.
        if s:
            sec = SECTION_MAP[s["section"]]
            if s["section"] == "enchantment" and s["eligibility"] in ("combatOnly", "combatOnly2"):
                sec = "combat"
            e["section"] = sec
        else:
            e["section"] = "unit"  # Guises : enchantement de creature (tables du grimoire)
        # couts / eligibilite
        if s:
            el, cc = s["eligibility"], s["castCost"]
            combat = el in ("combatOnly", "combatOnly2", "both", "both2", "bothFriendlyCity", "bothSameCost")
            overland = el in ("overlandOnly", "both", "both2", "bothFriendlyCity", "bothSameCost", "overlandWhileBanished")
            if el in ("both", "both2", "bothFriendlyCity"):
                cost, ccost = cc * 5, cc
            elif combat:
                cost, ccost = cc, cc
            else:
                cost, ccost = cc, None
            plus = s["spellType"] >= 18
            if cost == 0 and game_name in ("Create Artifact", "Enchant Item"):
                cost = None
        else:
            combat, overland = False, True
            cost, ccost, plus = g["overlandCost"], None, g["plus"]
            el = None
        if g:
            gc, go = g["combatCost"], g["overlandCost"]
            mine = (ccost if ccost is not None else cost, cost)
            theirs = (gc, go)
            if g["combatCost"] is not None and theirs != mine and not (not combat and gc == go == cost):
                report["divergences"].append("%s : cout grimoire %s / jeu %s (retenu : jeu)"
                                             % (en, g["costText"], "%s/%s" % (ccost, cost) if ccost not in (None, cost) else cost))
            if g["plus"] != plus:
                report["divergences"].append("%s : '+' grimoire %s / cout variable en jeu %s (retenu : jeu)" % (en, g["plus"], plus))
        e["cost"] = cost
        e["combatCost"] = ccost
        e["plus"] = plus
        e["overland"] = overland
        e["combat"] = combat
        # entretien
        upkeep, upsrc = None, None
        key = norm(game_name)
        if s and e["section"] == "summoning" and game_name in unit_by_name:
            upkeep, upsrc = (0 if not overland else units[unit_by_name[game_name]]["upkeep"]), "unit.go"
        elif game_name == "Lycanthropy":
            upkeep, upsrc = units["WereWolf"]["upkeep"], "unit.go (WereWolf)"
        elif game_name == "Spell Ward":
            upkeep, upsrc = upkeeps["lifeward"][0], "enchantment.go (wards)"
        elif key in upkeeps and overland:
            upkeep, upsrc = upkeeps[key][0], "enchantment.go"
        elif g:
            upkeep, upsrc = (g["upkeep"] if overland else 0), "grimoire"
        else:
            upkeep, upsrc = 0, "aucun"
        if not overland:
            upkeep = 0
        if g and g["upkeep"] != upkeep and overland:
            report["divergences"].append("%s : entretien grimoire %s / %s %s (retenu : %s)" % (en, g["upkeep"], upsrc, upkeep, upsrc))
        e["upkeep"] = upkeep
        # recherche
        research = s["researchCost"] if s else None
        if research is None:
            report["noResearch"].append(en)
        w = WIKI_CHECKS.get(game_name) or WIKI_CHECKS.get(en)
        if w:
            for k, v in w.items():
                mine = {"research": research, "cost": cost, "combatCost": ccost, "upkeep": upkeep}[k]
                if mine != v:
                    report["divergences"].append("%s : %s wiki %s / retenu %s" % (en, k, v, mine))
        e["research"] = research
        e["target"] = fr["t"]
        e["kind"] = fr["k"]
        params = dict(fr["p"])
        if plus and cost:
            params.setdefault("maxExtraMana", (ccost if ccost else cost) * 4)
        if el == "bothFriendlyCity":
            params["combatOnlyDefendingCity"] = True
        if game_name == "Spell Binding":
            params["upkeepAsTarget"] = True
        e["params"] = params
        e["desc"] = fr["d"]
        if g is None:
            e["notInGrimoire"] = True
        if s is None:
            e["inGame"] = False
        if sid in spells:
            raise SystemExit("id en double : " + sid)
        spells[sid] = e

    # --- verifications
    for sid, e in spells.items():
        assert e["target"] in TARGETS, (sid, e["target"])
        assert e["kind"] in KINDS, (sid, e["kind"])
        u = e["params"].get("unit")
        for key in ("unit", "zombieUnit"):
            uu = e["params"].get(key)
            if uu is not None and uu not in units:
                raise SystemExit("unite inconnue %s pour %s" % (uu, sid))
        if e["kind"] == "summon" and not u:
            raise SystemExit("summon sans unite : " + sid)
        for v in e["params"].values():
            if isinstance(v, str) and re.fullmatch(r"[a-z]+(_[a-z]+)+", v) and v not in spells:
                raise SystemExit("reference de sort inconnue %s dans %s" % (v, sid))
        for v in e["params"].get("outcomes", []):
            if "_" in v and v not in spells:
                raise SystemExit("reference de sort inconnue %s dans %s" % (v, sid))
    unused_fr = set(S) - {GRIM_TO_GAME.get(t, t) for t in [x[0] for x in entries]} - {x[1] for x in entries}
    if unused_fr:
        raise SystemExit("donnees FR orphelines : %s" % sorted(unused_fr))

    # --- ecriture
    lines = ["// Arcanes - sorts (genere par tools/build_spells.py, ne pas editer a la main)",
             "// Sources : spelldat.lbx du jeu (couts, eligibilite, rarete, recherche ; recherche verifiee sur",
             "// masterofmagic.fandom.com pour %d sorts, toutes concordantes), kazzmir/master-of-magic (BSD-3) pour"
             % len(WIKI_CHECKS),
             "// l'entretien et les chiffres de combat, grimoire original pour la liste et les effets hors combat.",
             "// Descriptions redigees pour Arcanes.",
             "window.DATA = window.DATA || {};",
             "DATA.spells = {"]
    keys = sorted(spells, key=lambda k: (["arcane", "life", "death", "chaos", "nature", "sorcery"].index(spells[k]["realm"]),
                                         ["common", "uncommon", "rare", "veryrare"].index(spells[k]["rarity"]),
                                         spells[k]["research"] if spells[k]["research"] is not None else 10 ** 9, k))
    for i, k in enumerate(keys):
        e = spells[k]
        body = ", ".join("%s: %s" % (f, js_value(e[f])) for f in e)
        lines.append("  %s: { %s }%s" % (k, body, "," if i < len(keys) - 1 else ""))
    lines.append("};")
    open(out_path, "w", encoding="utf-8").write("\n".join(lines) + "\n")

    # --- rapport
    print("sorts ecrits : %d" % len(spells))
    print("par royaume :", dict(Counter(e["realm"] for e in spells.values())))
    print("par rarete  :", dict(Counter(e["rarity"] for e in spells.values())))
    print("par royaume x rarete :")
    for r in ["arcane", "life", "death", "chaos", "nature", "sorcery"]:
        c = Counter(e["rarity"] for e in spells.values() if e["realm"] == r)
        print("  %-8s %s" % (r, [c.get(x, 0) for x in ["common", "uncommon", "rare", "veryrare"]]))
    print("par section :", dict(Counter(e["section"] for e in spells.values())))
    print("hors grimoire :", [k for k, e in spells.items() if e.get("notInGrimoire")])
    print("hors jeu :", [k for k, e in spells.items() if e.get("inGame") is False])
    print("sans recherche :", report["noResearch"])
    print("\nNOTES")
    for n in report["notes"]:
        print(" -", n)
    print("\nDIVERGENCES (%d)" % len(report["divergences"]))
    for d in report["divergences"]:
        print(" -", d)
    print("\nEFFETS : GRIMOIRE CONTREDIT (%d)" % len(EFFECT_NOTES))
    for d in EFFECT_NOTES:
        print(" -", d)


def read_spelldat_list(path):
    import io, contextlib
    buf = io.StringIO()
    argv = sys.argv
    try:
        sys.argv = ["read_spelldat.py", path]
        with contextlib.redirect_stdout(buf):
            read_spelldat.main()
    finally:
        sys.argv = argv
    return json.loads(buf.getvalue())


if __name__ == "__main__":
    main()
