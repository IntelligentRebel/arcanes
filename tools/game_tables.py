"""Tables de jeu d'Arcanes ecrites a la main (batiments, races, terrain, retorts, sorciers).

Chiffres : table G/B/D/E/F du manuel + city.go / map.go / building.go / retort.go de kazzmir.
Textes : redaction originale en francais.
"""

# ---------------------------------------------------------------------------
# Batiments (table G). requires = prerequis directs ; terrain = condition de site.
# effects : cles de la spec (+ extensions farmerFood, mineralPct documentees dans le rapport).
# ---------------------------------------------------------------------------
BUILDINGS = [
    # id, nom, cout, entretien, prerequis, terrain, effets, description
    ("barracks", "Caserne", 30, 1, [], None, {},
     "Casernement de base, indispensable pour lever la plupart des troupes régulières."),
    ("armory", "Armurerie", 80, 2, ["barracks", "smithy"], None, {},
     "Arsenal qui équipe des fantassins lourds comme les hallebardiers."),
    ("fightersGuild", "Guilde des guerriers", 200, 3, ["armory"], None, {"xp": 20},
     "École d'armes : les nouvelles recrues sortent déjà aguerries (rang Régulier)."),
    ("armorersGuild", "Guilde des armuriers", 350, 4, ["fightersGuild"], None, {},
     "Atelier d'armures lourdes qui ouvre l'accès aux unités d'élite."),
    ("warCollege", "École de guerre", 500, 5, ["armorersGuild", "university"], None, {"xp": 60},
     "Académie militaire : les nouvelles troupes commencent au rang Vétéran."),
    ("smithy", "Forge", 40, 1, [], None, {},
     "Forge qui fournit les armes de base et permet d'armer des épéistes."),
    ("stables", "Écuries", 80, 2, ["smithy"], None, {},
     "Écuries pour élever montures et bêtes de guerre."),
    ("animistsGuild", "Guilde des animistes", 300, 5, ["stables", "temple"], None,
     {"farmerFood": 1, "unrest": 1, "healing": 15},
     "Guilde de soigneurs et de dresseurs : récoltes accrues, guérison plus rapide, cité plus calme."),
    ("fantasticStable", "Ménagerie fantastique", 600, 6, ["animistsGuild", "armorersGuild"], None, {},
     "Enclos où l'on dresse des créatures fabuleuses pour la monte."),
    ("shipwrightsGuild", "Guilde des charpentiers de marine", 100, 1, [], "water", {},
     "Atelier de construction navale où sortent les premières embarcations."),
    ("shipYard", "Chantier naval", 200, 2, ["sawmill", "shipwrightsGuild"], None, {},
     "Cale de construction pour des navires plus grands."),
    ("maritimeGuild", "Guilde maritime", 400, 4, ["armory", "shipYard"], None, {},
     "Corporation de capitaines, nécessaire aux navires de guerre."),
    ("sawmill", "Scierie", 100, 2, ["smithy"], "forest", {"prodPct": 25, "housingPct": 10},
     "Scierie qui exploite le bois voisin pour accélérer la production."),
    ("library", "Bibliothèque", 60, 1, ["buildersHall"], None, {"research": 2},
     "Collection d'ouvrages qui alimente la recherche."),
    ("sagesGuild", "Guilde des sages", 120, 2, ["library"], None, {"research": 3},
     "Cercle d'érudits qui accélère la recherche."),
    ("oracle", "Oracle", 500, 4, ["parthenon", "university"], None, {"unrest": 2, "sight": 4},
     "Sanctuaire de divination qui apaise la population et révèle les alentours."),
    ("alchemistsGuild", "Guilde des alchimistes", 250, 3, ["sagesGuild"], None,
     {"power": 3, "magicWeapons": True},
     "Laboratoire qui produit du mana et dote les nouvelles troupes d'armes enchantées."),
    ("university", "Université", 300, 3, ["sagesGuild", "library"], None, {"research": 5},
     "Grand centre d'enseignement à forte production de recherche."),
    ("wizardsGuild", "Guilde des mages", 1000, 5, ["alchemistsGuild", "university"], None,
     {"power": -3, "research": 8},
     "Tour des mages : énorme gain de recherche, mais elle puise chaque tour dans la puissance magique de la cité."),
    ("shrine", "Sanctuaire", 100, 1, ["buildersHall"], None, {"power": 1, "unrest": 1},
     "Petit lieu de culte qui produit un peu de mana et calme les esprits."),
    ("temple", "Temple", 200, 2, ["shrine"], None, {"power": 2, "unrest": 1},
     "Temple qui renforce la foi : davantage de mana, moins d'agitation."),
    ("parthenon", "Parthénon", 400, 3, ["temple"], None, {"power": 3, "unrest": 1},
     "Grand temple où l'on forme des prêtres."),
    ("cathedral", "Cathédrale", 800, 4, ["parthenon"], None, {"power": 4, "unrest": 1},
     "Sommet de l'édifice religieux : mana et paix sociale."),
    # ajout d'Arcanes : seulement dans la cité de la forteresse
    ("magicRelay", "Relais de magie", 600, 4, ["shrine"], None, {"magicRelay": True},
     "Amplifie le lien entre le sorcier et ses armées : le surcoût en mana des sorts de combat lancés loin de la forteresse est divisé par deux. Ne se bâtit que dans la cité de la forteresse."),
    ("marketplace", "Marché", 100, 1, ["smithy"], None, {"goldPct": 50},
     "Place de commerce qui augmente les revenus en or."),
    ("bank", "Banque", 250, 3, ["marketplace", "university"], None, {"goldPct": 50},
     "Maison de change qui accroît encore les revenus, en plus du marché."),
    ("merchantsGuild", "Guilde des marchands", 600, 5, ["shipYard", "bank"], None, {"goldPct": 100},
     "Compagnie de négoce maritime, cumulée avec le marché et la banque."),
    ("granary", "Grenier", 40, 1, ["buildersHall"], None, {"food": 2, "maxPop": 2, "growth": 20},
     "Réserves de grain : plus de nourriture et une croissance plus rapide."),
    ("farmersMarket", "Halle aux grains", 100, 2, ["granary", "marketplace"], None,
     {"food": 3, "maxPop": 3, "growth": 30},
     "Marché des producteurs : encore plus de nourriture et de croissance."),
    ("forestersGuild", "Guilde des forestiers", 200, 2, ["sawmill"], None, {"food": 2, "prodPct": 25},
     "Gardes forestiers qui tirent nourriture et matériaux des bois."),
    ("buildersHall", "Maison des bâtisseurs", 60, 1, [], None, {"housingPct": 15},
     "Corporation de maçons, base de nombreux édifices et des ingénieurs."),
    ("mechaniciansGuild", "Guilde des mécaniciens", 600, 5, ["minersGuild", "university"], None,
     {"prodPct": 50},
     "Ateliers mécaniques : forte hausse de production et engins de siège."),
    ("minersGuild", "Guilde des mineurs", 300, 3, ["buildersHall"], "hillsMountain",
     {"prodPct": 50, "mineralPct": 50},
     "Exploitation minière : production accrue et gisements plus rentables."),
    ("cityWalls", "Remparts", 150, 2, ["buildersHall"], None, {"sight": 3, "walls": True},
     "Murailles de pierre qui abritent la garnison et surveillent les environs."),
    # pseudo-productions
    ("housing", "Logements", 0, 0, [], None, {},
     "Consacrer la production au logement pour accélérer la croissance."),
    ("tradeGoods", "Commerce", 0, 0, [], None, {"goldPerProd": 0.5},
     "Convertir la production de la cité en or (1 or pour 2 de production)."),
    # non constructibles
    ("fortress", "Forteresse", 0, 0, [], None, {"powerPerBook": 1, "myrrorPower": 5},
     "Forteresse du sorcier : produit du mana selon ses livres de magie."),
    ("summoningCircle", "Cercle d'invocation", 0, 0, [], None, {},
     "Lieu où apparaissent les créatures invoquées."),
]
PSEUDO_BUILDINGS = {"housing", "tradeGoods"}
UNBUILDABLE = {"fortress", "summoningCircle"}
# ne se bâtissent que dans la cité de la forteresse du sorcier
FORTRESS_ONLY = {"magicRelay"}
# un batiment qui annule l'effet d'un autre
REPLACES = {"warCollege": "fightersGuild"}

# ---------------------------------------------------------------------------
# Races
# ---------------------------------------------------------------------------
RACE_MAP = {  # data.RaceX (kazz) -> id spec
    "data.RaceBarbarian": "barbarian", "data.RaceGnoll": "gnoll", "data.RaceHalfling": "halfling",
    "data.RaceHighElf": "highelf", "data.RaceHighMen": "highmen", "data.RaceKlackon": "klackon",
    "data.RaceLizard": "lizardman", "data.RaceNomad": "nomad", "data.RaceOrc": "orc",
    "data.RaceBeastmen": "beastmen", "data.RaceDarkElf": "darkelf", "data.RaceDraconian": "draconian",
    "data.RaceDwarf": "dwarf", "data.RaceTroll": "troll",
    "data.RaceFantastic": "fantastic", "data.RaceHero": "hero", "data.RaceAll": None,
}

RACE_ORDER = ["barbarian", "gnoll", "halfling", "highelf", "highmen", "klackon", "lizardman", "nomad",
              "orc", "beastmen", "darkelf", "draconian", "dwarf", "troll"]

# Restrictions de construction reprises de building.RacialBuildings (kazz, liste complete).
KAZZ_RACIAL_BANS = {
    "lizardman": ["AnimistsGuild", "University", "FantasticStable", "MechaniciansGuild", "WizardsGuild",
                  "MaritimeGuild", "Oracle", "WarCollege", "Bank", "MerchantsGuild", "ShipYard",
                  "AlchemistsGuild", "ShipwrightsGuild", "Cathedral", "Parthenon", "SagesGuild", "Sawmill",
                  "ForestersGuild", "MinersGuild"],
    "nomad": ["WizardsGuild", "MaritimeGuild"],
    "orc": [],
    "troll": ["AlchemistsGuild", "University", "FantasticStable", "MechaniciansGuild", "WizardsGuild",
              "MaritimeGuild", "Oracle", "WarCollege", "Bank", "MerchantsGuild", "ShipYard", "SagesGuild",
              "MinersGuild"],
    "barbarian": ["AnimistsGuild", "University", "FantasticStable", "MechaniciansGuild", "WizardsGuild",
                  "Cathedral", "Oracle", "WarCollege", "Bank", "MerchantsGuild"],
    "beastmen": ["FantasticStable", "MerchantsGuild", "ShipYard", "MaritimeGuild"],
    "darkelf": ["Cathedral", "MaritimeGuild"],
    "draconian": ["MechaniciansGuild", "MaritimeGuild", "FantasticStable"],
    "dwarf": ["AnimistsGuild", "University", "FantasticStable", "MechaniciansGuild", "WizardsGuild",
              "MaritimeGuild", "Oracle", "WarCollege", "Bank", "MerchantsGuild", "ShipYard", "Stables",
              "Parthenon", "Cathedral"],
    "gnoll": ["MaritimeGuild", "ArmorersGuild", "SagesGuild", "AnimistsGuild", "University", "FantasticStable",
              "Parthenon", "AlchemistsGuild", "Cathedral", "Oracle", "WarCollege", "Bank", "MerchantsGuild",
              "MechaniciansGuild", "WizardsGuild"],
    "halfling": ["AnimistsGuild", "University", "FantasticStable", "MechaniciansGuild", "WizardsGuild",
                 "MaritimeGuild", "Oracle", "WarCollege", "Bank", "MerchantsGuild", "ShipYard",
                 "ArmorersGuild", "Stables"],
    "highelf": ["Parthenon", "MaritimeGuild", "Oracle", "Cathedral"],
    "highmen": ["FantasticStable"],
    "klackon": ["AnimistsGuild", "University", "FantasticStable", "MechaniciansGuild", "WizardsGuild",
                "MaritimeGuild", "Oracle", "WarCollege", "Bank", "MerchantsGuild", "ShipYard",
                "AlchemistsGuild", "Temple", "Cathedral", "Parthenon", "SagesGuild"],
}

# city.go : PopulationGrowthRate (bonus racial), ProductionWorkers, FarmerFoodProduction, PowerCitizens.
# darkelf : kazz -10, manuel « croissance la plus lente » (= -20 comme nains/hauts-elfes/trolls) -> -20 retenu.
RACE_STATS = {
    #            plane     growth worker farmerFood power
    "barbarian": ("arcanus", 20, 2, 2, 0),
    "gnoll":     ("arcanus", -10, 2, 2, 0),
    "halfling":  ("arcanus", 0, 2, 3, 0),
    "highelf":   ("arcanus", -20, 2, 2, 0.5),
    "highmen":   ("arcanus", 0, 2, 2, 0),
    "klackon":   ("arcanus", -10, 3, 2, 0),
    "lizardman": ("arcanus", 10, 2, 2, 0),
    "nomad":     ("arcanus", -10, 2, 2, 0),
    "orc":       ("arcanus", 0, 2, 2, 0),
    "beastmen":  ("myrror", 0, 2, 2, 0.5),
    "darkelf":   ("myrror", -20, 2, 2, 1),
    "draconian": ("myrror", -10, 2, 2, 0.5),
    "dwarf":     ("myrror", -20, 3, 2, 0),
    "troll":     ("myrror", -20, 2, 2, 0),
}
# city.go templePacification/parthenonPacification/... : batiments sans effet sur l'agitation pour la race.
PACIFY_EXCEPTIONS = {
    "barbarian": ["cathedral", "animistsGuild", "oracle"],
    "gnoll": ["parthenon", "cathedral", "animistsGuild", "oracle"],
    "halfling": ["animistsGuild", "oracle"],
    "highelf": ["parthenon", "cathedral", "oracle"],
    "klackon": ["temple", "parthenon", "cathedral", "animistsGuild", "oracle"],
    "lizardman": ["parthenon", "cathedral", "animistsGuild", "oracle"],
    "darkelf": ["cathedral"],
    "dwarf": ["parthenon", "cathedral", "animistsGuild", "oracle"],
    "troll": ["oracle"],
}
RACE_NOTES = [
    "draconian  manuel « vol sauf colons » ; kazz : colons draconiens volants (kazz retenu)",
    "dwarf      manuel : ouvriers nains a double impot ; kazz : seulement gisements doubles (kazz retenu, mineralMult)",
    "toutes     manuel : population max. reduite (trolls/elfes noirs -4, nains -3, draconiens/gnolls/hauts-elfes/"
    "klackons -2) ; absent de kazz et de la spec, non repris",
    "klackon    manuel : -2 agitation si la forteresse est klackonne ; non implemente chez kazz, cite dans traits",
    "chamanes   kazz incoherent : cout 60 (orques, hommes-lezards ; trolls 180 = 3x60) mais 50 (barbares ; "
    "halfelins/draconiens 75 = 1,5x50) ; manuel 50 ; valeurs kazz conservees telles quelles",
]
KAZZ_GROWTH = {"darkelf": -10}  # valeurs kazz differentes de celles retenues (pour le rapport)
RACE_EXTRA = {
    "nomad": {"goldPct": 50},     # ComputeTotalBonusPercent : +50 % d'or
    "dwarf": {"mineralMult": 2},  # GoldMinerals/PowerMinerals/UnitProductionCost : gisements doubles
}

RACE_TEXT = {
    "barbarian": ("Barbares", "Peuple rude et prolifique qui fonde ses villages plus vite que quiconque.", [
        "Croissance démographique la plus rapide.",
        "Lanciers, épéistes et cavaliers lancent une hache avant le corps à corps.",
        "+1 en résistance pour les troupes standard.",
        "Lanciers, épéistes et cavaliers coûtent 50 % de plus.",
    ]),
    "gnoll": ("Gnolls", "Brutes à tête de hyène, féroces au combat mais peu portées sur le savoir.", [
        "+2 en attaque de mêlée pour les troupes standard.",
        "Les hallebardiers annulent la frappe en premier.",
        "Croissance lente, savoir limité (ni guilde des sages ni université).",
    ]),
    "halfling": ("Halfelins", "Petit peuple paisible, excellent agriculteur et étonnamment chanceux.", [
        "Chaque fermier récolte 3 de nourriture au lieu de 2.",
        "Toutes les troupes sont chanceuses ; +2 en résistance.",
        "Épéistes à 8 figurines, mais -1 en attaque.",
        "Ni écuries ni guilde des armuriers.",
    ]),
    "highelf": ("Hauts-Elfes", "Elfes anciens des forêts, imprégnés de magie et d'une grande adresse.", [
        "Chaque citoyen produit 0,5 de mana.",
        "+1 au toucher et capacité Forestier pour les troupes.",
        "+2 en résistance ; croissance très lente.",
    ]),
    "highmen": ("Hauts-Hommes", "Humains polyvalents dont les cités peuvent presque tout bâtir.", [
        "Aucune particularité, mais un éventail complet de troupes et de bâtiments.",
        "Accès aux paladins, piquiers et navires de guerre.",
    ]),
    "klackon": ("Klackons", "Insectoïdes disciplinés vivant en ruches, travailleurs infatigables.", [
        "Chaque ouvrier produit 3 au lieu de 2 (+50 %).",
        "+2 en défense pour lanciers, épéistes et hallebardiers.",
        "Aucun bâtiment religieux au-delà du sanctuaire.",
        "Une forteresse klackonne réduit l'agitation de 2.",
    ]),
    "lizardman": ("Hommes-lézards", "Reptiles amphibies qui se déplacent aussi bien sur l'eau que sur terre.", [
        "Toutes les troupes nagent.",
        "Figurines à 2 points de vie ; +1 en défense.",
        "Croissance rapide, mais très peu de bâtiments avancés et aucun navire.",
    ]),
    "nomad": ("Nomades", "Cavaliers des steppes, commerçants habiles toujours en mouvement.", [
        "+50 % de revenus en or.",
        "Accès aux griffons, archers montés, piquiers et rôdeurs.",
        "Ni guilde des mages ni guilde maritime.",
    ]),
    "orc": ("Orques", "Peuple nombreux et adaptable, capable de tout construire.", [
        "Aucune restriction de construction.",
        "Troupes standard sans bonus ni malus.",
    ]),
    "beastmen": ("Hommes-bêtes", "Hybrides robustes du Miroir, dotés d'un don naturel pour la magie.", [
        "Chaque citoyen produit 0,5 de mana.",
        "+1 point de vie, +1 en mêlée et +1 en résistance.",
        "Troupes plus coûteuses que la normale.",
    ]),
    "darkelf": ("Elfes noirs", "Elfes sombres du Miroir, la race la plus magique de toutes.", [
        "Chaque citoyen produit 1 de mana.",
        "Les troupes standard lancent un petit trait magique.",
        "+3 en résistance ; troupes chères et croissance très lente.",
    ]),
    "draconian": ("Draconiens", "Descendants ailés des dragons qui crachent de petites flammes.", [
        "Toutes les troupes volent, colons compris.",
        "Souffle de feu de force 1 pour les unités sans tir.",
        "Chaque citoyen produit 0,5 de mana ; +1 en défense, +2 en résistance.",
    ]),
    "dwarf": ("Nains", "Mineurs et forgerons des montagnes, robustes et industrieux.", [
        "Chaque ouvrier produit 3 au lieu de 2 (+50 %).",
        "Bonus des gisements doublés.",
        "Figurines à 3 points de vie, capacité Montagnard, +4 en résistance.",
        "Croissance très lente ; ni écuries ni chantier naval.",
    ]),
    "troll": ("Trolls", "Géants massifs qui se régénèrent de presque toutes les blessures.", [
        "Toutes les troupes se régénèrent.",
        "Figurines à 4 points de vie, +2 en mêlée, +3 en résistance.",
        "Unités de 4 figurines ; troupes très coûteuses, croissance très lente.",
    ]),
}

# ---------------------------------------------------------------------------
# Terrain (map.go FoodBonus/ProductionBonus/GoldBonus, model.go mouvement, table F routes)
# ---------------------------------------------------------------------------
TERRAIN = {
    #  id:          (nom, mouvement, nourriture, prod %, or %, tours de route, eau, description)
    "ocean":       ("Océan", 1, 0, 0, 10, None, True, "Haute mer, réservée aux navires, nageurs et volants."),
    "shore":       ("Rivage", 1, 0.5, 0, 10, None, True, "Eaux côtières ; une cité adjacente gagne +10 % d'or."),
    "grass":       ("Prairie", 1, 1.5, 0, 0, 3, False, "Plaine fertile, idéale pour fonder une cité."),
    "forest":      ("Forêt", 2, 0.5, 3, 0, 6, False, "Bois exploitables, nécessaires à la scierie."),
    "hills":       ("Collines", 3, 0.5, 3, 0, 6, False, "Reliefs riches en minerais."),
    "mountain":    ("Montagne", 4, 0, 5, 0, 8, False, "Sommets difficiles d'accès mais riches en gisements."),
    "desert":      ("Désert", 1, 0, 3, 0, 4, False, "Étendues arides où l'on trouve gemmes et cristaux."),
    "swamp":       ("Marais", 3, 0, 0, 0, 8, False, "Terres noyées où pousse la belladone."),
    "tundra":      ("Toundra", 2, 0, 0, 0, 6, False, "Plaine gelée et stérile."),
    "river":       ("Rivière", 2, 2, 0, 20, 5, False, "Cours d'eau fertile ; cité fluviale +20 % d'or, +30 % à l'embouchure."),
    "lake":        ("Lac", 1, 0, 0, 0, None, True, "Plan d'eau intérieur (2 de nourriture s'il est traversé par une rivière)."),
    "sorceryNode": ("Nœud de sorcellerie", 1, 2, 0, 0, 3, False, "Bassin de magie bleue, source de mana de sorcellerie."),
    "natureNode":  ("Nœud de nature", 2, 2.5, 3, 0, 4, False, "Bosquet chatoyant, source de mana de nature (compte comme forêt)."),
    "chaosNode":   ("Nœud de chaos", 4, 0, 5, 0, 5, False, "Cratère volcanique, source de mana de chaos."),
    "volcano":     ("Volcan", 4, 0, 0, 0, 6, False, "Cône actif qui ne produit rien tant qu'il fume."),
}
RIVER_MOUTH_GOLD_PCT = 30
# Valeurs manuel (table D/F) qui different de celles retenues, pour le rapport.
MANUAL_TERRAIN = {
    "desert": {"move": 2, "prodPct": 10}, "forest": {"prodPct": 5}, "hills": {"move": 2, "prodPct": 5},
    "mountain": {"move": 3, "prodPct": 10}, "ocean": {"food": 0.5}, "shore": {"food": 0},
    "swamp": {"food": 0.5},
}
KAZZ_ROADS = {"volcano": 8, "chaosNode": 8, "natureNode": 5, "sorceryNode": 4}
# Mouvement des noeuds : kazz retombe sur 1 (cas par defaut, non traite) ; hypothese Arcanes : noeud de nature
# = foret (2), noeud de chaos = volcan/montagne (4), noeud de sorcellerie = prairie (1).
NODE_MOVE_ASSUMED = {"natureNode": (2, 1), "chaosNode": (4, 1)}
# Gisements : terrains d'apres kazz map.go (wiki v1.31) ; le manuel (table D) differe.
MANUAL_MINERAL_NOTES = ["gemmes : kazz=desert ; manuel=montagne (table D), desert = quork/crysx seulement",
                        "charbon : kazz=collines+montagnes ; manuel ne cite pas le charbon pour les collines",
                        "adamantium : kazz=collines+montagnes de Myrror ; manuel=montagnes de Myrror seulement"]
BUILDING_NOTES = [
    "stables      manuel : colonne prerequis « Grasslands, Smithy » ; retenu Smithy seul (v1.31, kazz sans condition de terrain)",
    "fantasticStable manuel : 3e ligne « Stable » sous les prerequis ; retenu animistsGuild + armorersGuild (stables implicite)",
    "animistsGuild healing : manuel 15 %/tour en ville ; kazz 16,67 % (15 retenu)",
    "cityWalls sight 3 : manuel uniquement (kazz : portee 2, oracle 4) ; sight = maximum, non cumulatif",
    "forestersGuild : +2 nourriture ajoutee au surplus (ne compte pas pour la taille max. chez kazz)",
    "fortress : mana = nombre de livres du sorcier, +5 sur Myrror (kazz PowerFortress) ; non constructible",
]

# ---------------------------------------------------------------------------
# Mineraux / biotes (data.go + map.go bonusTypeMap + table E)
# ---------------------------------------------------------------------------
MINERALS = {
    #  id:          (nom, or, mana, nourriture, cout unites %, terrains, myrrorOnly, description)
    "iron":       ("Fer", 0, 0, 0, -5, ["hills", "mountain"], False, "Réduit de 5 % le coût des troupes normales (cumul max. 50 %)."),
    "coal":       ("Charbon", 0, 0, 0, -10, ["hills", "mountain"], False, "Réduit de 10 % le coût des troupes normales (cumul max. 50 %)."),
    "silver":     ("Argent", 2, 0, 0, 0, ["hills", "mountain"], False, "Filon qui rapporte de l'or."),
    "gold":       ("Or", 3, 0, 0, 0, ["hills", "mountain"], False, "Filon aurifère très rentable."),
    "gems":       ("Gemmes", 5, 0, 0, 0, ["desert"], False, "Pierres précieuses de grande valeur."),
    "mithril":    ("Mithril", 0, 1, 0, 0, ["hills", "mountain"], False, "Métal magique : armes en mithril avec une guilde des alchimistes."),
    "adamantium": ("Adamantium", 0, 2, 0, 0, ["hills", "mountain"], True, "Métal légendaire du Miroir : armes en adamantium avec une guilde des alchimistes."),
    "quork":      ("Cristaux de quork", 0, 3, 0, 0, ["desert"], False, "Cristaux chargés de magie."),
    "crysx":      ("Cristaux de crysx", 0, 5, 0, 0, ["desert"], True, "Cristaux très puissants, propres au Miroir."),
    "wildGame":   ("Gibier", 0, 0, 2, 0, ["forest"], False, "Animaux sauvages qui nourrissent la cité."),
    "nightshade": ("Belladone", 0, 0, 0, 0, ["swamp"], False, "Plante qui dissipe les enchantements hostiles sur la cité (avec sanctuaire ou guilde des sages)."),
}

# ---------------------------------------------------------------------------
# Retorts (manuel « Special Abilities » ; kazz retort.go pour comparaison)
# req : realms = minimum par royaume ; books = minimum dans au moins un royaume ;
#       distinctRealms + booksEach = au moins N royaumes ayant chacun >= booksEach livres.
# ---------------------------------------------------------------------------
RETORTS = {
    "alchemy": ("Alchimie", 1, {}, {"conversionRate": 1},
                "Convertit l'or en mana et inversement sans aucune perte."),
    "archmage": ("Archimage", 1, {"books": 4}, {"castingSkill": 10, "skillGainPct": 50, "dispelResist": 2},
                 "+10 en compétence de lancement, qui progresse moitié plus vite ; ses sorts sont deux fois plus durs à dissiper."),
    "artificer": ("Artificier", 1, {}, {"itemCostPct": -50, "startSpells": ["enchant_item", "create_artifact"]},
                  "Fabrique des objets magiques à moitié prix et connaît d'emblée les sorts de création d'objets."),
    "channeler": ("Canalisateur", 1, {}, {"noDistancePenalty": True},
                  "Lance ses sorts de combat sans surcoût, quelle que soit la distance à sa forteresse ; l'entretien de ses sorts et de ses créatures est réduit de moitié."),
    "chaosMastery": ("Maîtrise du chaos", 1, {"realms": {"chaos": 4}}, {"realm": "chaos", "researchPct": 15, "costPct": -15, "nodePowerMult": 2, "dispelResist": 2},
                     "Recherche plus vite les sorts de chaos, les lance à moindre coût et les rend plus durs à dissiper ; double le mana des nœuds de chaos."),
    "charismatic": ("Charismatique", 1, {}, {"hireCostPct": -50, "diplomacyMult": 2},
                    "Héros, mercenaires et objets à moitié prix ; la diplomatie lui profite davantage."),
    "conjurer": ("Conjurateur", 1, {}, {"summonCostPct": -25, "summonResearchPct": 25},
                 "Ses sorts d'invocation coûtent un quart de moins, entretien des créatures compris, et se recherchent plus vite."),
    "divinePower": ("Puissance divine", 2, {"realms": {"life": 4}}, {"religiousPowerPct": 50},
                    "Les édifices religieux produisent 50 % de mana en plus et apaisent mieux la population."),
    "famous": ("Célèbre", 2, {}, {"startFame": 15, "offerRateMult": 2},
               "Commence avec de la renommée ; héros, mercenaires et marchands se présentent deux fois plus souvent."),
    "infernalPower": ("Puissance infernale", 2, {"realms": {"death": 4}}, {"religiousPowerPct": 50},
                      "Pendant de la puissance divine pour la magie de mort : les édifices religieux produisent 50 % de mana en plus et apaisent mieux la population."),
    "manaFocusing": ("Focalisation du mana", 1, {"books": 4}, {"manaEfficiencyPct": 25},
                     "Chaque point de mana dépensé compte pour un quart de plus."),
    "myrran": ("Myrrien", 2, {}, {"startPlane": "myrror", "fortressPowerMult": 2},
               "Commence sur Myrror avec accès aux races de ce plan ; sa forteresse y produit deux fois plus de mana."),
    "natureMastery": ("Maîtrise de la nature", 1, {"realms": {"nature": 4}}, {"realm": "nature", "researchPct": 15, "costPct": -15, "nodePowerMult": 2, "dispelResist": 2},
                      "Recherche plus vite les sorts de nature, les lance à moindre coût et les rend plus durs à dissiper ; double le mana des nœuds de nature."),
    "nodeMastery": ("Maîtrise des nœuds", 1, {"realms": {"chaos": 1, "nature": 1, "sorcery": 1}}, {"nodePowerMult": 2},
                    "Double le mana tiré de tous les nœuds contrôlés."),
    "runemaster": ("Maître des runes", 1, {"distinctRealms": 3, "booksEach": 2}, {"realm": "arcane", "researchPct": 25, "costPct": -25, "dispelResist": 2},
                   "Apprend et lance plus facilement les sorts arcanes ; tous ses sorts sont plus durs à dissiper."),
    "sageMaster": ("Grand érudit", 1, {"distinctRealms": 2, "booksEach": 1}, {"researchPct": 25},
                   "Accélère nettement la recherche de tous les sorts."),
    "sorceryMastery": ("Maîtrise de la sorcellerie", 1, {"realms": {"sorcery": 4}}, {"realm": "sorcery", "researchPct": 15, "costPct": -15, "nodePowerMult": 2, "dispelResist": 2},
                       "Recherche plus vite les sorts de sorcellerie, les lance à moindre coût et les rend plus durs à dissiper ; double le mana des nœuds de sorcellerie."),
    "warlord": ("Seigneur de guerre", 2, {}, {"extraLevels": 1},
                "Toutes ses troupes gagnent un niveau d'expérience supplémentaire, jusqu'à Ultra-élite."),
}
KAZZ_RETORT_COSTS = {"channeler": 2, "myrran": 3}  # retort.go PickCost, quand different du manuel
# Chiffres absents du manuel repris de kazz (player.go / spell.go) : researchPct, costPct, skillGainPct,
# summonResearchPct. Differences de chiffres : Famous kazz +10 renommee (manuel 15) ; Artificer kazz -50 % sur
# Enchant Item / Create Artifact (manuel -33 % sur les objets).
KAZZ_RETORT_NOTES = ["famous: renommee initiale manuel=15, kazz=10 (15 retenu)",
                     "artificer: reduction manuel=33 % (cout des objets), kazz=50 % sur les sorts de creation d'objets (33 retenu)"]

# ---------------------------------------------------------------------------
# Sorciers predefinis (manuel ; portrait = index kazz DefaultWizardSlots)
# ---------------------------------------------------------------------------
WIZARDS = [
    # (id, nom invente, portrait, livres, retorts, couleur)
    ("aldoran",   "Aldoran",   0,  {"life": 5, "nature": 5},  ["sageMaster"],    "#9ccf8a"),
    ("isvaran",   "Isvaran",   1,  {"nature": 5, "sorcery": 6}, [],              "#4f8fc9"),
    ("malivra",   "Malivra",   2,  {"chaos": 5, "death": 5},  ["conjurer"],      "#8a3a5c"),
    ("tsevan",    "Tsevan",    3,  {"chaos": 5, "sorcery": 5}, ["channeler"],    "#7a5cc9"),
    ("azhemir",   "Azhemir",   4,  {"sorcery": 10},           ["alchemy"],       "#2f6fbf"),
    ("thalgren",  "Thalgren",  5,  {"chaos": 5, "nature": 5}, ["manaFocusing"],  "#b8742c"),
    ("vorgath",   "Vorgath",   6,  {"death": 9},              ["infernalPower"], "#5a3a7a"),
    ("zirrakh",   "Zirrakh",   7,  {"chaos": 4, "life": 5},   ["myrran"],        "#d08a3a"),
    ("brakkon",   "Brakkon",   8,  {"chaos": 10},             ["chaosMastery"],  "#c8402c"),
    ("sylvaine",  "Sylvaine",  9,  {"nature": 10},            ["natureMastery"], "#3f8f3a"),
    ("solenkh",   "Solenkh",   10, {"life": 5, "sorcery": 5}, ["archmage"],      "#c9b85a"),
    ("celestine", "Célestine", 11, {"life": 10},              ["charismatic"],   "#e8e2c4"),
    ("itzanor",   "Itzanor",   12, {"nature": 4, "death": 5}, ["warlord"],       "#4a6b3a"),
    ("nerissa",   "Nérissa",   13, {"death": 5, "sorcery": 5}, ["artificer"],    "#3a4a7a"),
]
# kazz DefaultWizardSlots differe du manuel pour Sss'ra (portrait 7) : vie 4 au lieu de 5.
KAZZ_WIZARD_DIFFS = {7: {"life": 4, "chaos": 4}}
