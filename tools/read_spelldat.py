#!/usr/bin/env python3
"""Lit spelldat.lbx (format decrit dans kazzmir spellbook/data.go ReadSpells)
et sort un JSON : liste de {index, name, aiGroup, aiValue, spellType, section,
realm, eligibility, castCost, researchCost, sound, summoned, flag1..3, magic, rarity}.
Usage : py read_spelldat.py <spelldat.lbx> [out.json]
"""
import json, struct, sys

SECTIONS = {0: "special", 1: "summoning", 2: "enchantment", 3: "city", 4: "unit", 5: "combat"}
ELIG = {0xff: "combatOnly", 0xfe: "combatOnly2", 0x0: "both", 0x1: "overlandOnly",
        0x2: "both2", 0x3: "bothFriendlyCity", 0x4: "bothSameCost", 0x5: "overlandWhileBanished"}


def magic_iter():
    yield ("none", None)
    for m in ["nature", "sorcery", "chaos", "life", "death"]:
        for r in ["common", "uncommon", "rare", "veryrare"]:
            for _ in range(10):
                yield (m, r)
    for r, n in [("common", 4), ("uncommon", 5), ("rare", 4), ("veryrare", 1)]:
        for _ in range(n):
            yield ("arcane", r)


def main():
    raw = open(sys.argv[1], "rb").read()
    nfiles, sig, ver = struct.unpack_from("<HIH", raw, 0)
    assert sig == 0xfead, hex(sig)
    offsets = struct.unpack_from("<%dI" % (nfiles + 1), raw, 8)
    data = raw[offsets[0]:offsets[1]]
    n, size = struct.unpack_from("<HH", data, 0)
    out = []
    it = magic_iter()
    for i in range(n):
        e = data[4 + i * size: 4 + (i + 1) * size]
        name = e[:19].split(b"\0")[0].decode("latin-1")
        aiGroup, aiValue, spellType, section, realm, elig = e[19:25]
        castCost, researchCost = struct.unpack_from("<HH", e, 26)
        sound = e[30]
        summoned, f1, f2, f3 = e[32:36]
        magic, rarity = next(it)
        out.append(dict(index=i, name=name, aiGroup=aiGroup, aiValue=aiValue, spellType=spellType,
                        section=SECTIONS.get(section, section), realm=realm,
                        eligibility=ELIG.get(elig, elig), castCost=castCost,
                        researchCost=researchCost, sound=sound, summoned=summoned,
                        flag1=f1, flag2=f2, flag3=f3, magic=magic, rarity=rarity))
    js = json.dumps(out, indent=1, ensure_ascii=False)
    if len(sys.argv) > 2:
        open(sys.argv[2], "w", encoding="utf-8").write(js)
    else:
        print(js)


if __name__ == "__main__":
    main()
