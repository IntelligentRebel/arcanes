"""Plan de la nuit 3 : criblage de 31 leviers (Plackett-Burman à 32 essais, Hadamard de Sylvester) autour de g2a.
13 réglages neufs (achats, budget de puissance, diplomatie, plafond de cités, cibles neutres, bâtiments) et
18 capacités de l'IA retirées une à une (les 11 de Hardcore, et 6 de Difficile, de Normale ou en essai). Témoin : le Hardcore livré.
  py tests/make_entrainement3.py  →  tests/entrainement3.json"""
import json, os
G2A = {"milChance": 1.8, "lairWin": 0.8, "garrison": 1.5, "planDefMil": 1.8, "planWarMil": 1.7, "milSurplus": 2.2, "attackWin": 0.68, "summonUpkeep": 0.9, "unitEnchVal": 0.5}
# (nom, réglages bas, réglages hauts) ; un nom en no_x retire la capacité x quand il est haut
F = [
 ("achat", {"buyMul": 3, "buyKeep": 150}, {"buyMul": 1.5, "buyKeep": 60}),
 ("achatColon", {"buySettler": 0}, {"buySettler": 1}),
 ("urgence", {"threatKeep": 150, "rushZero": 0}, {"threatKeep": 0, "rushZero": 1}),
 ("splitMana", {"splitMana": 0}, {"splitMana": 15}),
 ("splitRech", {"splitResearch": 0}, {"splitResearch": 15}),
 ("paix", {"peaceRel": 15, "peaceChance": 0.05}, {"peaceRel": -10, "peaceChance": 0.15}),
 ("villes", {}, {"cityCap": 16}),
 ("neutres", {"neutralValue": 1}, {"neutralValue": 1.6}),
 ("orMana", {"manaFloor": 20, "manaGold": 300}, {"manaFloor": 80, "manaGold": 200}),
 ("guerre", {"warChance": 0.06}, {"warChance": 0.15}),
 ("impots", {"taxGold": 1}, {"taxGold": 1.5}),
 ("eclaireurs", {"extraScouts": 0}, {"extraScouts": 1}),
 ("puissance", {"bgPower": 1}, {"bgPower": 2}),
] + [(n, None, None) for n in ["no_aggro", "no_bold", "no_curse", "no_fronts", "no_herohire", "no_onewar", "no_predator", "no_prey",
                               "no_preywar", "no_tailor", "no_timing", "no_purify", "no_respath", "no_coalition", "no_legend", "no_foresight", "no_globals", "no_alone"]]
assert len(F) == 31
H = [[(-1) ** bin(i & j).count('1') for j in range(32)] for i in range(32)]   # Sylvester ; la ligne 0 = tout bas = g2a
# colonnes : les cinq leviers de l'or (qui se disputent la même caisse) sur les colonnes de base 1, 2, 4, 8, 16 ;
# leurs interactions deux à deux tombent sur les colonnes produits, données aux capacités dont on attend le moins
COL = {"achat": 1, "achatColon": 2, "urgence": 4, "orMana": 8, "impots": 16,
       "no_curse": 3, "no_bold": 5, "no_timing": 6, "no_herohire": 9, "no_predator": 10, "no_purify": 12, "no_legend": 17,
       "no_respath": 18, "no_coalition": 20, "no_globals": 24}
free = [j for j in range(1, 32) if j not in COL.values()]
for n, _, _ in F:
    if n not in COL: COL[n] = free.pop(0)
assert sorted(COL.values()) == list(range(1, 32))
desc = lambda v: ', '.join(f'{k} {x}' for k, x in v.items()) if v else '—'
variants = [{"nom": "hardcore", "niveau": "hardcore"}]
for i in range(32):
    signs = [-H[i][COL[n]] for n, _, _ in F]
    tune, exp = dict(G2A), {}
    for (n, lo, hi), s in zip(F, signs):
        if lo is None:
            if s > 0: exp[n] = 1
        else: tune.update(hi if s > 0 else lo)
    exp["tune"] = tune
    variants.append({"nom": "base" if i == 0 else f"p{i:02d}", "niveau": "hardcore", "exp": exp, "signes": signs})
SHORT = {"achat": ("or>3p+150", "or>1.5p+60"), "achatColon": ("non", "oui"), "urgence": ("normal", "achat forcé"), "splitMana": ("0", "+15"),
         "splitRech": ("0", "+15"), "paix": ("r>15 5%", "r>-10 15%"), "villes": ("10", "16"), "neutres": ("1", "1.6"), "orMana": ("<20 >300", "<80 >200"),
         "guerre": ("6%", "15%"), "impots": ("1", "1.5"), "eclaireurs": ("1-2", "2-3"), "puissance": ("1", "2")}
facteurs = []
for n, lo, hi in F:
    if lo is None: facteurs.append({"nom": n, "bas": "avec", "haut": "sans"})
    else: facteurs.append({"nom": n, "bas": SHORT[n][0], "haut": SHORT[n][1], "reglages": [lo, hi]})
plan = {"nom": "Entraînement 3 : criblage de 31 leviers",
        "experiences": [{"id": "crible", "note": "Plackett-Burman à 32 essais autour de g2a ; base = g2a, hardcore = le niveau livré",
                         "tours": 150, "adversaires": "hard", "graine": 90000, "graines": 62, "points": [100],
                         "facteurs": facteurs, "variantes": variants}]}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'entrainement3.json')
json.dump(plan, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(out, len(variants), 'variantes,', len(variants) * 62, 'parties')
