window.DATA = window.DATA || {}; // en Node, le build injecte `var window = globalThis`

/* Terrains : move = points de mouvement pour entrer (kazz game/model.go) ; food = nourriture de la case
(maplib/map.go FoodBonus) ; prodPct = bonus de production % par case du bassin (ProductionBonus) ;
goldPct = bonus d'or % de la cite : sur une riviere 20 (30 a l'embouchure, goldPctMouth), adjacente a l'ocean
ou au rivage 10 ; non cumulable (prendre le maximum) ; water = case d'eau ;
roadTurns = tours de construction de route pour un ingenieur (table F du manuel), null = impossible. */
DATA.terrain = {
  "ocean": {"name": "Océan", "move": 1, "food": 0, "prodPct": 0, "goldPct": 10, "roadTurns": null, "water": true, "desc": "Haute mer, réservée aux navires, nageurs et volants."},
  "shore": {"name": "Rivage", "move": 1, "food": 0.5, "prodPct": 0, "goldPct": 10, "roadTurns": null, "water": true, "desc": "Eaux côtières ; une cité adjacente gagne +10 % d'or."},
  "grass": {"name": "Prairie", "move": 1, "food": 1.5, "prodPct": 0, "goldPct": 0, "roadTurns": 3, "water": false, "desc": "Plaine fertile, idéale pour fonder une cité."},
  "forest": {"name": "Forêt", "move": 2, "food": 0.5, "prodPct": 3, "goldPct": 0, "roadTurns": 6, "water": false, "desc": "Bois exploitables, nécessaires à la scierie."},
  "hills": {"name": "Collines", "move": 3, "food": 0.5, "prodPct": 3, "goldPct": 0, "roadTurns": 6, "water": false, "desc": "Reliefs riches en minerais."},
  "mountain": {"name": "Montagne", "move": 4, "food": 0, "prodPct": 5, "goldPct": 0, "roadTurns": 8, "water": false, "desc": "Sommets difficiles d'accès mais riches en gisements."},
  "desert": {"name": "Désert", "move": 1, "food": 0, "prodPct": 3, "goldPct": 0, "roadTurns": 4, "water": false, "desc": "Étendues arides où l'on trouve gemmes et cristaux."},
  "swamp": {"name": "Marais", "move": 3, "food": 0, "prodPct": 0, "goldPct": 0, "roadTurns": 8, "water": false, "desc": "Terres noyées où pousse la belladone."},
  "tundra": {"name": "Toundra", "move": 2, "food": 0, "prodPct": 0, "goldPct": 0, "roadTurns": 6, "water": false, "desc": "Plaine gelée et stérile."},
  "river": {"name": "Rivière", "move": 2, "food": 2, "prodPct": 0, "goldPct": 20, "roadTurns": 5, "water": false, "desc": "Cours d'eau fertile ; cité fluviale +20 % d'or, +30 % à l'embouchure.", "goldPctMouth": 30},
  "lake": {"name": "Lac", "move": 1, "food": 0, "prodPct": 0, "goldPct": 0, "roadTurns": null, "water": true, "desc": "Plan d'eau intérieur (2 de nourriture s'il est traversé par une rivière).", "foodWithRiver": 2},
  "sorceryNode": {"name": "Nœud de sorcellerie", "move": 1, "food": 2, "prodPct": 0, "goldPct": 0, "roadTurns": 3, "water": false, "desc": "Bassin de magie bleue, source de mana de sorcellerie."},
  "natureNode": {"name": "Nœud de nature", "move": 2, "food": 2.5, "prodPct": 3, "goldPct": 0, "roadTurns": 4, "water": false, "desc": "Bosquet chatoyant, source de mana de nature (compte comme forêt)."},
  "chaosNode": {"name": "Nœud de chaos", "move": 4, "food": 0, "prodPct": 5, "goldPct": 0, "roadTurns": 5, "water": false, "desc": "Cratère volcanique, source de mana de chaos."},
  "volcano": {"name": "Volcan", "move": 4, "food": 0, "prodPct": 0, "goldPct": 0, "roadTurns": 6, "water": false, "desc": "Cône actif qui ne produit rien tant qu'il fume."}
};


/* Gisements et biotes (data/data.go, map.go, table E). gold/power/food par tour ; unitCostPct = reduction du
cout des troupes normales (cumul plafonne a -50 %, doublee par les Nains et la guilde des mineurs). */
DATA.minerals = {
  "iron": {"name": "Fer", "gold": 0, "power": 0, "food": 0, "unitCostPct": -5, "terrains": ["hills", "mountain"], "myrrorOnly": false, "desc": "Réduit de 5 % le coût des troupes normales (cumul max. 50 %)."},
  "coal": {"name": "Charbon", "gold": 0, "power": 0, "food": 0, "unitCostPct": -10, "terrains": ["hills", "mountain"], "myrrorOnly": false, "desc": "Réduit de 10 % le coût des troupes normales (cumul max. 50 %)."},
  "silver": {"name": "Argent", "gold": 2, "power": 0, "food": 0, "unitCostPct": 0, "terrains": ["hills", "mountain"], "myrrorOnly": false, "desc": "Filon qui rapporte de l'or."},
  "gold": {"name": "Or", "gold": 3, "power": 0, "food": 0, "unitCostPct": 0, "terrains": ["hills", "mountain"], "myrrorOnly": false, "desc": "Filon aurifère très rentable."},
  "gems": {"name": "Gemmes", "gold": 5, "power": 0, "food": 0, "unitCostPct": 0, "terrains": ["desert"], "myrrorOnly": false, "desc": "Pierres précieuses de grande valeur."},
  "mithril": {"name": "Mithril", "gold": 0, "power": 1, "food": 0, "unitCostPct": 0, "terrains": ["hills", "mountain"], "myrrorOnly": false, "desc": "Métal magique : armes en mithril avec une guilde des alchimistes."},
  "adamantium": {"name": "Adamantium", "gold": 0, "power": 2, "food": 0, "unitCostPct": 0, "terrains": ["hills", "mountain"], "myrrorOnly": true, "desc": "Métal légendaire du Miroir : armes en adamantium avec une guilde des alchimistes."},
  "quork": {"name": "Cristaux de quork", "gold": 0, "power": 3, "food": 0, "unitCostPct": 0, "terrains": ["desert"], "myrrorOnly": false, "desc": "Cristaux chargés de magie."},
  "crysx": {"name": "Cristaux de crysx", "gold": 0, "power": 5, "food": 0, "unitCostPct": 0, "terrains": ["desert"], "myrrorOnly": true, "desc": "Cristaux très puissants, propres au Miroir."},
  "wildGame": {"name": "Gibier", "gold": 0, "power": 0, "food": 2, "unitCostPct": 0, "terrains": ["forest"], "myrrorOnly": false, "desc": "Animaux sauvages qui nourrissent la cité."},
  "nightshade": {"name": "Belladone", "gold": 0, "power": 0, "food": 0, "unitCostPct": 0, "terrains": ["swamp"], "myrrorOnly": false, "desc": "Plante qui dissipe les enchantements hostiles sur la cité (avec sanctuaire ou guilde des sages)."}
};


/* Retorts (capacites speciales du sorcier), couts et prerequis d'apres le manuel.
req.realms = minimum de livres par royaume ; req.books = minimum dans un meme royaume ;
req.distinctRealms + req.booksEach = au moins N royaumes ayant chacun >= M livres.
effects : researchPct / costPct (sur effects.realm si present, sinon tous les sorts), dispelResist (multiplicateur
de difficulte a dissiper), nodePowerMult, castingSkill, skillGainPct, summonCostPct, ... (chiffres manquants du
manuel repris de kazz). */
DATA.retorts = {
  "alchemy": {"name": "Alchimie", "cost": 1, "req": {}, "effects": {"conversionRate": 1}, "desc": "Convertit l'or en mana et inversement sans aucune perte."},
  "archmage": {"name": "Archimage", "cost": 1, "req": {"books": 4}, "effects": {"castingSkill": 10, "skillGainPct": 50, "dispelResist": 2}, "desc": "+10 en compétence de lancement, qui progresse moitié plus vite ; ses sorts sont deux fois plus durs à dissiper."},
  "artificer": {"name": "Artificier", "cost": 1, "req": {}, "effects": {"itemCostPct": -50, "startSpells": ["enchant_item", "create_artifact"]}, "desc": "Fabrique des objets magiques à moitié prix et connaît d'emblée les sorts de création d'objets."},
  "channeler": {"name": "Canalisateur", "cost": 1, "req": {}, "effects": {"noDistancePenalty": true}, "desc": "Lance ses sorts de combat sans surcoût, quelle que soit la distance à sa forteresse ; l'entretien de ses sorts et de ses créatures est réduit de moitié."},
  "chaosMastery": {"name": "Maîtrise du chaos", "cost": 1, "req": {"realms": {"chaos": 4}}, "effects": {"realm": "chaos", "researchPct": 15, "costPct": -15, "nodePowerMult": 2, "dispelResist": 2}, "desc": "Recherche plus vite les sorts de chaos, les lance à moindre coût et les rend plus durs à dissiper ; double le mana des nœuds de chaos."},
  "charismatic": {"name": "Charismatique", "cost": 1, "req": {}, "effects": {"hireCostPct": -50, "diplomacyMult": 2}, "desc": "Héros et mercenaires à moitié prix ; les gestes amicaux envers les autres sorciers comptent double."},
  "conjurer": {"name": "Conjurateur", "cost": 1, "req": {}, "effects": {"summonCostPct": -25, "summonResearchPct": 25}, "desc": "Ses sorts d'invocation coûtent un quart de moins, entretien des créatures compris, et se recherchent plus vite."},
  "divinePower": {"name": "Puissance divine", "cost": 2, "req": {"realms": {"life": 4}}, "effects": {"religiousPowerPct": 50}, "desc": "Les édifices religieux produisent 50 % de mana en plus et apaisent mieux la population."},
  "famous": {"name": "Célèbre", "cost": 2, "req": {}, "effects": {"startFame": 10, "offerRateMult": 2}, "desc": "Commence avec de la renommée ; héros et mercenaires se présentent deux fois plus souvent."},
  "infernalPower": {"name": "Puissance infernale", "cost": 2, "req": {"realms": {"death": 4}}, "effects": {"religiousPowerPct": 50}, "desc": "Pendant de la puissance divine pour la magie de mort : les édifices religieux produisent 50 % de mana en plus et apaisent mieux la population."},
  "manaFocusing": {"name": "Focalisation du mana", "cost": 1, "req": {"books": 4}, "effects": {"manaEfficiencyPct": 25}, "desc": "Le mana tiré de la puissance magique augmente d'un quart."},
  "myrran": {"name": "Myrrien", "cost": 2, "req": {}, "effects": {"startPlane": "myrror", "fortressPowerBonus": 5}, "desc": "Commence sur le Miroir avec accès aux races de ce plan ; une forteresse sur le Miroir produit 5 de magie en plus."},
  "natureMastery": {"name": "Maîtrise de la nature", "cost": 1, "req": {"realms": {"nature": 4}}, "effects": {"realm": "nature", "researchPct": 15, "costPct": -15, "nodePowerMult": 2, "dispelResist": 2}, "desc": "Recherche plus vite les sorts de nature, les lance à moindre coût et les rend plus durs à dissiper ; double le mana des nœuds de nature."},
  "nodeMastery": {"name": "Maîtrise des nœuds", "cost": 1, "req": {"realms": {"chaos": 1, "nature": 1, "sorcery": 1}}, "effects": {"nodePowerMult": 2}, "desc": "Double le mana tiré de tous les nœuds contrôlés. En combat sur un nœud, vos sorts et ceux de vos troupes échappent à son flux, qui dissipe les sorts des autres royaumes."},
  "runemaster": {"name": "Maître des runes", "cost": 1, "req": {"distinctRealms": 3, "booksEach": 2}, "effects": {"realm": "arcane", "researchPct": 25, "costPct": -25, "dispelResist": 2}, "desc": "Apprend et lance plus facilement les sorts arcanes ; tous ses sorts sont plus durs à dissiper."},
  "sageMaster": {"name": "Grand érudit", "cost": 1, "req": {"distinctRealms": 2, "booksEach": 1}, "effects": {"researchPct": 25}, "desc": "Accélère nettement la recherche de tous les sorts."},
  "sorceryMastery": {"name": "Maîtrise de la sorcellerie", "cost": 1, "req": {"realms": {"sorcery": 4}}, "effects": {"realm": "sorcery", "researchPct": 15, "costPct": -15, "nodePowerMult": 2, "dispelResist": 2}, "desc": "Recherche plus vite les sorts de sorcellerie, les lance à moindre coût et les rend plus durs à dissiper ; double le mana des nœuds de sorcellerie."},
  "warlord": {"name": "Seigneur de guerre", "cost": 2, "req": {}, "effects": {"extraLevels": 1}, "desc": "Toutes ses troupes gagnent un niveau d'expérience supplémentaire, jusqu'à Ultra-élite."}
};


/* Les 14 sorciers predefinis (livres et retorts du manuel, 11 choix chacun), noms inventes.
portrait = index 0..13 (ordre kazz DefaultWizardSlots). */
DATA.wizards = [
  {"id": "aldoran", "name": "Aldoran", "portrait": 0, "books": {"life": 5, "nature": 5}, "retorts": ["sageMaster"], "color": "#9ccf8a"},
  {"id": "isvaran", "name": "Isvaran", "portrait": 1, "books": {"nature": 5, "sorcery": 6}, "retorts": [], "color": "#4f8fc9"},
  {"id": "malivra", "name": "Malivra", "portrait": 2, "books": {"chaos": 5, "death": 5}, "retorts": ["conjurer"], "color": "#8a3a5c"},
  {"id": "tsevan", "name": "Tsevan", "portrait": 3, "books": {"chaos": 5, "sorcery": 5}, "retorts": ["channeler"], "color": "#7a5cc9"},
  {"id": "azhemir", "name": "Azhemir", "portrait": 4, "books": {"sorcery": 10}, "retorts": ["alchemy"], "color": "#2f6fbf"},
  {"id": "thalgren", "name": "Thalgren", "portrait": 5, "books": {"chaos": 5, "nature": 5}, "retorts": ["manaFocusing"], "color": "#b8742c"},
  {"id": "vorgath", "name": "Vorgath", "portrait": 6, "books": {"death": 9}, "retorts": ["infernalPower"], "color": "#5a3a7a"},
  {"id": "zirrakh", "name": "Zirrakh", "portrait": 7, "books": {"chaos": 4, "life": 5}, "retorts": ["myrran"], "color": "#d08a3a"},
  {"id": "brakkon", "name": "Brakkon", "portrait": 8, "books": {"chaos": 10}, "retorts": ["chaosMastery"], "color": "#c8402c"},
  {"id": "sylvaine", "name": "Sylvaine", "portrait": 9, "books": {"nature": 10}, "retorts": ["natureMastery"], "color": "#3f8f3a"},
  {"id": "solenkh", "name": "Solenkh", "portrait": 10, "books": {"life": 5, "sorcery": 5}, "retorts": ["archmage"], "color": "#c9b85a"},
  {"id": "celestine", "name": "Célestine", "portrait": 11, "books": {"life": 10}, "retorts": ["charismatic"], "color": "#e8e2c4"},
  {"id": "itzanor", "name": "Itzanor", "portrait": 12, "books": {"nature": 4, "death": 5}, "retorts": ["warlord"], "color": "#4a6b3a"},
  {"id": "nerissa", "name": "Nérissa", "portrait": 13, "books": {"death": 5, "sorcery": 5}, "retorts": ["artificer"], "color": "#3a4a7a"}
];
