#!/usr/bin/env python3
"""Parseur des en-tetes du grimoire de Master of Magic (texte extrait du PDF).

Chaque entree : ligne "Nom:" puis "Royaume. Categorie. Casting Cost: X mana; Upkeep: Y mana/turn. Rarete."
(l'en-tete peut etre coupe sur 2-3 lignes) puis un paragraphe.
On ignore les lignes "MOM Spellbook for PDF ..." et les numeros de page, et on s'arrete
a la section "Definitions" (apres le dernier sort).

Usage : py parse_spellbook.py <spellbook.txt> [out.json]
Sortie : liste de dicts {title, realm, category, costText, combatCost, overlandCost, plus,
          upkeep, upkeepText, rarity, body, line}
"""
import json, re, sys

REALMS = ["Life", "Death", "Chaos", "Nature", "Sorcery", "Arcane"]
RARITIES = {"common": "common", "uncommon": "uncommon", "rare": "rare", "very rare": "veryrare"}

TITLE_RE = re.compile(r"^\s{0,20}([A-Z][A-Za-z’' ]+):\s*$")
NOISE_RE = re.compile(r"^\s*(MOM Spellbook|\d+\s*$|Master of Magic Spells List\s*$)")


def clean_title(t):
    t = re.sub(r"\s+", " ", t.strip())
    t = re.sub(r"^R aise", "Raise", t)  # artefact d'extraction ("R aise Dead")
    return t.replace("’", "'")


def parse(path):
    lines = open(path, encoding="utf-8").read().split("\n")
    # bornes : du premier titre jusqu'a "Definitions"
    start = next(i for i, l in enumerate(lines) if "Master of Magic Spells List" in l)
    end = next(i for i, l in enumerate(lines) if l.strip() == "Definitions")
    entries, cur = [], None
    for i in range(start + 1, end):
        raw = lines[i]
        if NOISE_RE.match(raw):
            continue
        m = TITLE_RE.match(raw)
        # un titre est suivi (apres eventuelles lignes vides) d'une ligne commencant par un royaume
        if m:
            nxt = next((lines[j] for j in range(i + 1, min(i + 4, end)) if lines[j].strip()), "")
            if re.match(r"^\s*(%s)\b" % "|".join(REALMS), nxt):
                cur = {"title": clean_title(m.group(1)), "line": i + 1, "head": [], "body": []}
                entries.append(cur)
                continue
        if cur is None:
            continue
        txt = raw.strip()
        if not txt:
            if cur["head"] and not cur.get("headDone"):
                cur["headDone"] = True
            continue
        if not cur.get("headDone"):
            cur["head"].append(txt)
            # l'en-tete se termine par la rarete suivie d'un point
            if re.search(r"(Very Rare|Uncommon|Common|Rare)\.\s*$", " ".join(cur["head"])):
                cur["headDone"] = True
        else:
            cur["body"].append(txt)
    out = []
    for e in entries:
        head = " ".join(e["head"])
        out.append(parse_head(e["title"], head, " ".join(e["body"]), e["line"]))
    return out


def parse_head(title, head, body, line):
    r = {"title": title, "head": head, "line": line, "body": body}
    m = re.match(r"^(%s)\.?\s*(.*)$" % "|".join(REALMS), head)
    r["realm"] = m.group(1).lower()
    rest = m.group(2)
    m = re.match(r"^(.*?)\.?\s*Casting Cost:\s*(.*)$", rest)
    r["category"] = m.group(1).strip().rstrip(".")
    rest = m.group(2)
    m = re.search(r"(Very Rare|Uncommon|Common|Rare)\.\s*$", rest)
    r["rarity"] = RARITIES[m.group(1).lower()]
    rest = rest[:m.start()].strip().rstrip(".").strip()
    # separe cout / upkeep
    parts = re.split(r";\s*", rest, maxsplit=1)
    cost_txt = parts[0].strip()
    up_txt = parts[1].strip() if len(parts) > 1 else ""
    if not up_txt:
        m2 = re.search(r"\.\s*(Upkeep.*)$", cost_txt)
        if m2:
            up_txt = m2.group(1)
            cost_txt = cost_txt[:m2.start()]
    r["costText"] = cost_txt
    r["upkeepText"] = up_txt
    r["plus"] = "+" in cost_txt
    nums = [int(n) for n in re.findall(r"\d+", cost_txt)]
    if len(nums) == 2 and " or " in cost_txt:
        r["combatCost"], r["overlandCost"] = nums
    elif len(nums) == 1:
        r["combatCost"] = r["overlandCost"] = nums[0]
    else:
        r["combatCost"] = r["overlandCost"] = None  # "Varies by Enchantments"
    mu = re.search(r"(\d+)\s*mana/turn", up_txt)
    r["upkeep"] = int(mu.group(1)) if mu else 0
    r["upkeepSpecial"] = bool(up_txt) and not mu and not re.search(r"none", up_txt, re.I)
    return r


TABLES = [("TABLE OF CREATURE SUMMONING SPELLS", "summoning"), ("TABLE OF CITY ENCHANTMENTS", "city"),
          ("TABLE OF CREATURE ENCHANTMENTS", "unit"), ("TABLE OF GLOBAL ENCHANTMENTS", "global"),
          ("TABLE OF COMBAT SPELLS", "combat"), ("TABLE OF SPECIAL SPELLS", "special")]
DEGREES = [("Very Rare", "veryrare"), ("Uncommon", "uncommon"), ("Common", "common"), ("Rare", "rare")]
MARKERS = "✽✕▲✝♠♦"


def parse_category_tables(path):
    """Tables 'Spells by Categories' (p. 39-42) : renvoie {nom: (section, rarete_de_la_ligne)}.
    Le texte est en colonnes : on decoupe chaque ligne sur 2 espaces ou plus."""
    lines = open(path, encoding="utf-8").read().split("\n")
    start = next(i for i, l in enumerate(lines) if TABLES[0][0] in l)
    end = next(i for i, l in enumerate(lines) if i > start and "by Realms" in l)
    out, section, degree = {}, None, None
    pending_great = False
    for l in lines[start:end]:
        s = l.strip()
        hit = [sec for title, sec in TABLES if title in s]
        if hit:
            section, degree = hit[0], None
            continue
        if not s or NOISE_RE.match(l) or s[0] in MARKERS or s.startswith(("Degree", "Bold-face", "Note that", "relevant targets")):
            continue
        for word, deg in DEGREES:
            if s.startswith(word + " ") or s == word:
                degree = deg
                s = s[len(word):].strip()
                break
        for cell in re.split(r"\s{2,}", s):
            cell = cell.strip().strip(MARKERS).strip()
            if not cell:
                continue
            if cell == "Great":
                pending_great = True
                continue
            if cell == "Unsummoning" and pending_great:
                cell, pending_great = "Great Unsummoning", False
            out[cell.replace("’", "'")] = (section, degree)
    return out


if __name__ == "__main__":
    res = parse(sys.argv[1])
    js = json.dumps(res, indent=1, ensure_ascii=False)
    if len(sys.argv) > 2:
        open(sys.argv[2], "w", encoding="utf-8").write(js)
    print("entries:", len(res), file=sys.stderr)
    if len(sys.argv) <= 2:
        print(js)
