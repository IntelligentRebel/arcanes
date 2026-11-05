"""Parseur des definitions d'unites kazzmir (units/unit.go).

Lit chaque bloc `var X Unit = Unit{ ... }` et renvoie un dict brut
{ varName: { champ: valeur } } ou les valeurs sont :
  - int / float / bool / str (litteraux Go)
  - "data.RaceLizard" etc. (identifiants, chaine telle quelle)
  - liste de valeurs pour les litteraux composites `[]T{...}`
  - pour les capacites : liste de tuples (NomCapacite, valeur|None)

Utilisation :  py tools/kazz_units.py <chemin/unit.go>   (dump JSON sur stdout)
"""
import json
import re
import sys

VAR_RE = re.compile(r"^var\s+(\w+)\s+Unit\s*=\s*Unit\{", re.M)
ABILITY_RE = re.compile(
    r"data\.MakeAbility(?:Value)?\(\s*data\.Ability(\w+)\s*(?:,\s*([-0-9.]+)\s*)?\)")


def strip_comments(src):
    # commentaires bloc /* ... */ (ex. DraconianEngineer, retire du jeu)
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    # commentaires ligne (aucune chaine de unit.go ne contient //)
    src = re.sub(r"//[^\n]*", "", src)
    return src


def split_top(body):
    """Decoupe le corps d'un litteral struct sur les virgules de profondeur 0."""
    parts, depth, cur, in_str = [], 0, [], False
    for ch in body:
        if in_str:
            cur.append(ch)
            if ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{([":
            depth += 1
        elif ch in "})]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if "".join(cur).strip():
        parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


def parse_value(key, raw):
    raw = raw.strip()
    if key == "Abilities":
        return [(m.group(1), (float(m.group(2)) if m.group(2) is not None else None))
                for m in ABILITY_RE.finditer(raw)]
    if raw.startswith("[]"):
        inner = raw[raw.index("{") + 1: raw.rindex("}")]
        return [parse_value(None, p) for p in split_top(inner)]
    if raw in ("true", "false"):
        return raw == "true"
    if raw.startswith('"'):
        return raw[1:-1]
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    if re.fullmatch(r"-?\d+\.\d*", raw):
        return float(raw)
    return raw  # identifiant (data.RaceLizard, building.BuildingBarracks, DamageRangedMagical...)


def parse_units(path):
    src = strip_comments(open(path, encoding="utf-8").read())
    units = {}
    order = []
    for m in VAR_RE.finditer(src):
        name = m.group(1)
        start = m.end()  # juste apres '{'
        depth, i = 1, start
        while depth:
            c = src[i]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            i += 1
        body = src[start:i - 1]
        fields = {}
        for part in split_top(body):
            if ":" not in part:
                raise ValueError("champ illisible dans %s: %r" % (name, part))
            k, v = part.split(":", 1)
            fields[k.strip()] = parse_value(k.strip(), v)
        units[name] = fields
        order.append(name)
    return units, order


if __name__ == "__main__":
    u, order = parse_units(sys.argv[1])
    json.dump({k: u[k] for k in order}, sys.stdout, indent=1, ensure_ascii=False)
