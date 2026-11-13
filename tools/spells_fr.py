# -*- coding: utf-8 -*-
"""Donnees redigees a la main pour chaque sort (cle = nom interne du jeu, tel que dans spelldat.lbx ;
"Guises" n'existe que dans le grimoire).

fr : nom affiche ; t : target ; k : kind ; p : params ; d : description FR (nos mots).
Les chiffres de combat viennent de kazzmir combat/model.go (InvokeSpell + Create*ProjectileEffect),
les chiffres hors combat du grimoire, corriges par le wiki fandom quand il a pu etre lu
(voir le rapport de build_spells.py pour les divergences).
"""

S = {}


def add(name, fr, t, k, p, d):
    assert name not in S, name
    S[name] = dict(fr=fr, t=t, k=k, p=p, d=d)


# ---------------------------------------------------------------- NATURE
add("Earth to Mud", "Bourbier", "combatTile", "terrain", {"area": 5, "notFlying": True, "notNonCorporeal": True},
    "Change une zone de 5×5 cases du champ de bataille en boue : y entrer coûte tout le mouvement restant et on n'y avance que d'une case par tour, sauf aux unités volantes ou immatérielles. Dure tout le combat.")
add("Resist Elements", "Résistance aux éléments", "friendlyUnit", "unitEnchant", {"vs": ["nature", "chaos"], "res": 3, "def": 3},
    "L'unité gagne +3 en résistance et +3 en défense contre les attaques et sorts de nature et de chaos.")
add("Wall of Stone", "Mur de pierre", "friendlyCity", "cityEnchant", {"building": "cityWalls"},
    "Entoure une ville amie de remparts de pierre permanents, équivalents au bâtiment Remparts.")
add("Giant Strength", "Force de géant", "friendlyUnit", "unitEnchant", {"melee": 1, "thrown": 1},
    "+1 en attaque de mêlée (et de jet) pour chaque figurine de l'unité.")
add("Web", "Toile", "enemyUnit", "curse", {"webHp": 12, "groundsFlyers": True, "notNonCorporeal": True},
    "Immobilise l'unité ennemie dans une toile de 12 points de vie sans défense, qu'elle doit détruire en mêlée ou par magie avant de bouger. Une unité volante prise ne vole plus de tout le combat.")
add("War Bears", "Ours de guerre", "none", "summon", {"unit": "WarBear"},
    "Invoque une unité de 2 ours de guerre (mêlée 7, 8 PV chacun).")
add("Stone Skin", "Peau de pierre", "friendlyUnit", "unitEnchant", {"def": 1, "exclusiveWith": "iron_skin"},
    "+1 en défense. Non cumulable avec Peau de fer.")
add("Water Walking", "Marche sur l'eau", "friendlyUnit", "unitEnchant", {"waterWalking": True},
    "L'unité se déplace sur les cases d'eau comme sur la terre ferme, à vitesse inchangée.")
add("Sprites", "Lutins", "none", "summon", {"unit": "Sprites"},
    "Invoque 4 lutins volants dotés d'une petite attaque magique à distance (force 3).")
add("Earth Lore", "Savoir de la terre", "tile", "special", {"revealRadius": 5},
    "Révèle définitivement terrains, ressources et villes dans une large zone autour de la case visée (rayon de 5 cases) et repère les armées qui s'y trouvent au moment du sort.")
add("Cracks Call", "Appel des failles", "enemyUnit", "special", {"killPct": 25, "notFlying": True, "notNonCorporeal": True, "destroysWall": True},
    "Une crevasse s'ouvre sous l'unité visée : 25 % de chances qu'elle soit engloutie, quelle que soit sa défense, même immunisée contre la magie. Sans effet sur les volants et les immatériels ; détruit un mur sur la faille.")
add("Nature's Eye", "Œil de la nature", "friendlyCity", "cityEnchant", {"sight": 5},
    "Le rayon de vision de la ville passe à 5 cases.")
add("Ice Bolt", "Trait de glace", "enemyUnit", "damage", {"strength": 10, "perMana": 1, "maxStrength": 50, "damage": "cold"},
    "Trait de froid magique de force 10 sur une unité ennemie ; chaque mana supplémentaire ajoute +1 de force (max 50).")
add("Giant Spiders", "Araignées géantes", "none", "summon", {"unit": "GiantSpiders"},
    "Invoque 2 araignées géantes à morsure venimeuse (poison 4) capables de tisser des toiles.")
add("Change Terrain", "Modelage du terrain", "tile", "terrain",
    {"changes": {"desert": "grass", "forest": "grass", "hills": "grass", "swamp": "grass", "grass": "forest", "volcano": "mountain", "mountain": "hills"}},
    "Transforme la case visée : désert, toundra, forêt, colline ou marais deviennent prairie ; prairie devient forêt ; volcan devient montagne ; montagne devient colline. Les nœuds ne peuvent pas être visés.")
add("Path Finding", "Éclaireur", "friendlyUnit", "unitEnchant", {"ability": "pathfinding", "stack": True},
    "L'unité et toute sa pile traversent n'importe quel terrain pour 1 point de mouvement par case.")
add("Cockatrices", "Cocatrix", "none", "summon", {"unit": "Cockatrices"},
    "Invoque 4 cocatrix volantes dont le toucher pétrifie (résistance −3).")
add("Transmute", "Transmutation", "tile", "terrain", {"swap": {"coal": "gems", "iron": "gold", "silver": "mithril"}, "reversible": True},
    "Change définitivement le minerai d'une case : charbon ↔ gemmes, fer ↔ or, argent ↔ mithril.")
add("Nature's Cures", "Remèdes de la nature", "tile", "heal", {"healPct": 100, "excludeRealm": "death"},
    "Soigne entièrement toutes les unités amies de la case visée, à l'exception des créatures de la mort.")
add("Basilisk", "Basilic", "none", "summon", {"unit": "Basilisk"},
    "Invoque un basilic (mêlée 15, 30 PV) dont le regard pétrifie (résistance −1).")
add("Elemental Armor", "Armure élémentaire", "friendlyUnit", "unitEnchant", {"vs": ["nature", "chaos"], "res": 10, "def": 10, "exclusiveWith": "resist_elements"},
    "+10 en défense et +10 en résistance contre la nature et le chaos. Non cumulable avec Résistance aux éléments.")
add("Petrify", "Pétrification", "enemyUnit", "resistOrDie", {"resistMod": 0, "perFigure": True, "irreversible": True},
    "Chaque figurine de l'unité visée doit réussir un jet de résistance ou être changée en pierre, sans retour possible. Les immunisés à la pétrification sont épargnés.")
add("Stone Giant", "Géant de pierre", "none", "summon", {"unit": "StoneGiant"},
    "Invoque un géant de pierre (mêlée 15, rochers 15) qui abat les murailles et ignore la pétrification.")
add("Iron Skin", "Peau de fer", "friendlyUnit", "unitEnchant", {"def": 5, "exclusiveWith": "stone_skin"},
    "+5 en défense. Non cumulable avec Peau de pierre.")
add("Ice Storm", "Tempête de glace", "tile", "areaDamage", {"strength": 6, "damage": "cold", "allFigures": True},
    "Grêle glacée sur une case ennemie : chaque figurine présente, même en garnison, subit une attaque de froid magique de force 6.")
add("Earthquake", "Tremblement de terre", "enemyCity", "special", {"buildingPct": 10, "unitPct": 15, "notFlying": True, "notNonCorporeal": True},
    "Secoue une ville ennemie : chaque bâtiment a 10 % de chances d'être détruit, chaque unité non volante et matérielle 15 % de chances de périr.")
add("Gorgons", "Gorgones", "none", "summon", {"unit": "Gorgon"},
    "Invoque 2 gorgones volantes dont le regard pétrifie (résistance −2).")
add("Move Fortress", "Déplacement de la forteresse", "friendlyCity", "special", {"movesSummoningCircle": True},
    "Transfère la forteresse du sorcier, avec son Relais de magie et le cercle d'invocation s'il s'y trouve, dans une autre ville amie.")
add("Gaia's Blessing", "Bénédiction de Gaïa", "friendlyCity", "cityEnchant",
    {"foodPct": 50, "unrest": -2, "desertToGrassPct": 10, "volcanoToHillsPct": 10, "purifyPct": 20},
    "Nourriture du terrain +50 % (plafond de population), récoltes des fermiers +20 % et agitation −2, production des forêts doublée et croissance accrue. Chaque tour, 10 % de chances par case que ses déserts deviennent prairies et ses volcans collines, 20 % qu'une terre corrompue soit purifiée.")
add("Earth Elemental", "Élémentaire de terre", "combatTile", "summon", {"unit": "EarthElemental", "combatOnly": True},
    "Invoque pour la durée du combat un élémentaire de terre (mêlée 25, 30 PV) qui abat les murs. Impossible si 9 unités alliées sont déjà sur le terrain.")
add("Regeneration", "Régénération", "friendlyUnit", "unitEnchant", {"ability": "regeneration", "hpPerTurn": 1},
    "L'unité récupère 1 PV par tour de combat, retrouve tous ses PV après la bataille et revient à la vie si son camp l'emporte.")
add("Behemoth", "Béhémoth", "none", "summon", {"unit": "Behemoth"},
    "Invoque un béhémoth (mêlée 25, défense 9, 45 PV).")
add("Entangle", "Enchevêtrement", "allEnemyUnits", "combatEnchant", {"move": -1, "notFlying": True, "notNonCorporeal": True},
    "Toutes les unités ennemies non volantes et matérielles perdent 1 point de mouvement par tour ; à 0, elles ne peuvent plus bouger ni attaquer, mais ripostent.")
add("Nature Awareness", "Conscience de la nature", "none", "global", {"revealAll": True},
    "Révèle en permanence les deux plans en entier : terrains, villes et unités non invisibles.")
add("Call Lightning", "Appel de la foudre", "allEnemyUnits", "combatEnchant",
    {"boltsMin": 3, "boltsMax": 5, "strength": 8, "damage": "lightning", "armorPiercing": True},
    "À chaque tour jusqu'à la fin du combat, 3 à 5 éclairs perforants de force 8 frappent des ennemis au hasard.")
add("Colossus", "Colosse", "none", "summon", {"unit": "Colossus"},
    "Invoque un colosse (mêlée 20, rochers 20, frappe en premier), immunisé au poison et à la pétrification.")
add("Earth Gate", "Porte tellurique", "friendlyCity", "cityEnchant", {"teleportMoveCost": 1},
    "Les unités amies passent d'une ville dotée d'une porte tellurique à une autre pour 1 point de mouvement.")
add("Herb Mastery", "Maîtrise des simples", "none", "global", {"healPct": 100},
    "Toutes les unités blessées du sorcier sont entièrement soignées à chaque tour, sauf les créatures de la mort.")
add("Great Wyrm", "Grande Vouivre", "none", "summon", {"unit": "GreatWyrm"},
    "Invoque une grande vouivre (mêlée 25, 45 PV, morsure venimeuse 15) qui se déplace sous terre pendant les combats.")
add("Nature's Wrath", "Colère de la nature", "none", "global", {"triggerRealms": ["death", "chaos"], "unitPct": 10, "buildingPct": 5},
    "Chaque fois qu'un rival lance un sort de mort ou de chaos hors combat, une de ses villes, tirée au hasard, tremble : 10 % de chances de détruire chaque unité non volante et matérielle, 5 % chaque bâtiment.")

# ---------------------------------------------------------------- SORCERY
add("Resist Magic", "Résistance à la magie", "friendlyUnit", "unitEnchant", {"res": 5},
    "+5 en résistance contre les sorts de tous les royaumes.")
add("Dispel Magic True", "Dissipation véritable", "anyUnit", "dispel", {"strengthPerMana": 3},
    "Tente de retirer d'une unité les enchantements qui vous nuisent, avec une force de dissipation égale au triple du mana investi.")
add("Floating Island", "Île flottante", "tile", "summon", {"unit": "FloatingIsland", "transport": 8, "terrain": "ocean"},
    "Fait apparaître sur une case d'océan visible une nuée solide qui transporte jusqu'à 8 unités et se déplace de 2 cases par tour.")
add("Guardian Wind", "Vent gardien", "friendlyUnit", "unitEnchant", {"ability": "missileImmunity"},
    "Un vent protecteur rend l'unité immunisée aux projectiles (arcs, frondes, javelots).")
add("Phantom Warriors", "Guerriers fantômes", "combatTile", "summon", {"unit": "PhantomWarrior", "combatOnly": True},
    "Invoque pour le combat 6 guerriers illusoires et immatériels. Impossible si 9 unités alliées sont déjà sur le terrain.")
add("Confusion", "Confusion", "enemyUnit", "curse", {"resistMod": -4},
    "L'unité visée (résistance −4) devient confuse jusqu'à la fin du combat : chaque tour elle reste plantée, erre au hasard ou attaque ses alliés ou ses ennemis.")
add("Guises", "Déguisement", "friendlyUnit", "unitEnchant", {"cosmetic": True},
    "Donne à une unité normale l'apparence d'une créature fantastique au choix, sans changer ses caractéristiques. Inutilisable sur les héros.")
add("Word of Recall", "Mot de rappel", "friendlyUnit", "special", {},
    "Renvoie instantanément une unité amie dans la ville de votre forteresse (sur une case voisine si la place manque).")
add("Counter Magic", "Contre-magie", "none", "combatEnchant", {"dispelPerMana": 1, "drainPerSpell": 5},
    "Chaque sort ennemi lancé pendant le combat doit d'abord vaincre une dissipation de force égale au mana investi ; chaque tentative réduit cette réserve de 5.")
add("Nagas", "Nagas", "none", "summon", {"unit": "Nagas"},
    "Invoque 2 nagas nageurs armés de tridents, au crachat venimeux (poison 4, frappe en premier).")
add("Psionic Blast", "Onde psionique", "enemyUnit", "damage", {"strength": 5, "manaPerPoint": 2, "maxStrength": 25, "damage": "magic"},
    "Onde mentale de force 5 sur une unité ennemie ; +1 de force tous les 2 mana supplémentaires (max 25).")
add("Blur", "Flou", "allFriendlyUnits", "combatEnchant", {"hitNegatePct": 10},
    "Vos unités deviennent floues : chaque touche ennemie a 10 % de chances d'être annulée pendant tout le combat.")
add("Disenchant True", "Désenchantement véritable", "tile", "dispel", {"strengthPerMana": 3, "combatArea": "battlefield"},
    "Tente de retirer tous les enchantements hostiles d'une case de carte (ou de tout le champ de bataille en combat), avec une force égale au triple du mana investi.")
add("Vertigo", "Vertige", "enemyUnit", "curse", {"resistMod": 0, "toHitPct": -20, "def": -1},
    "Si l'unité échoue à résister, elle subit −20 % pour toucher et −1 en défense jusqu'à la fin du combat.")
add("Spell Lock", "Sceau des sorts", "friendlyUnit", "unitEnchant", {"protectsEnchantments": True},
    "Empêche la dissipation des enchantements bénéfiques de l'unité (et du lien d'une créature invoquée) tant que ce sceau n'a pas lui-même été levé.")
add("Enchant Road", "Routes enchantées", "tile", "terrain", {"radius": 2},
    "Toutes les routes dans un rayon de 2 cases autour de la case visée ne coûtent plus aucun mouvement aux unités terrestres.")
add("Flight", "Vol", "friendlyUnit", "unitEnchant", {"ability": "flying", "move": 3},
    "L'unité vole, avec une vitesse d'au moins 3.")
add("Wind Mastery", "Maîtrise des vents", "none", "global", {"friendlyShipSpeedPct": 50, "enemyShipSpeedPct": -50},
    "Les navires du lanceur (îles flottantes et navires volants compris) gagnent +50 % de mouvement, ceux de ses rivaux perdent 50 %.")
add("Spell Blast", "Brise-sort", "enemyWizard", "special", {"costEqualsTargetProgress": True},
    "Annule le sort qu'un sorcier ennemi est en train de lancer, à condition de payer autant de mana qu'il y en a déjà investi.")
add("Aura of Majesty", "Aura de majesté", "none", "global", {"relationsPerTurn": True},
    "Chaque tour, les relations des autres sorciers envers vous s'améliorent.")
add("Phantom Beast", "Bête fantôme", "combatTile", "summon", {"unit": "PhantomBeast", "combatOnly": True},
    "Invoque pour le combat une bête illusoire (mêlée 18, 20 PV), immatérielle et insensible à la magie de mort. Impossible si 9 unités alliées sont déjà sur le terrain.")
add("Disjunction True", "Disjonction véritable", "none", "dispel", {"strengthPerMana": 3, "targets": "globalEnchantment"},
    "Tente de dissiper l'enchantement global ennemi de votre choix (force 600, le triple de la Disjonction).")
add("Invisiblity", "Invisibilité", "friendlyUnit", "unitEnchant", {"ability": "invisibility"},
    "L'unité n'est repérée que par un ennemi adjacent : elle ne peut pas être visée à distance et impose −10 % pour toucher en mêlée.")
add("Wind Walking", "Marche des vents", "friendlyUnit", "unitEnchant", {"ability": "windWalking", "move": 3},
    "Hors combat, l'unité vole à vitesse 3 et emporte toute sa pile avec elle. Aucun effet en combat.")
add("Banish", "Bannissement", "enemyUnit", "resistOrDie", {"resistMod": -3, "resistPerMana": 15, "fantasticOnly": True, "perFigure": True},
    "Chaque figurine d'une créature invoquée ennemie doit résister (−3) ou être renvoyée dans son royaume ; chaque tranche de 15 mana supplémentaires ajoute −1.")
add("Storm Giant", "Géant des tempêtes", "none", "summon", {"unit": "StormGiant"},
    "Invoque un géant des tempêtes qui lance des éclairs perforants (force 10) à distance et en mêlée, et abat les murailles.")
add("Air Elemental", "Élémentaire d'air", "combatTile", "summon", {"unit": "AirElemental", "combatOnly": True},
    "Invoque pour le combat un élémentaire d'air invisible et volant (mêlée 15, vitesse 5). Impossible si 9 unités alliées sont déjà sur le terrain.")
add("Mind Storm", "Tempête mentale", "enemyUnit", "curse", {"noResist": True, "melee": -5, "ranged": -5, "thrown": -5, "def": -5, "res": -5},
    "Sans jet de résistance, l'unité perd 5 en attaque (mêlée, jet, distance), en défense et en résistance. Sans effet sur les immunisés aux illusions.")
add("Stasis", "Stase", "tile", "curse", {"minTurns": 1, "resistMod": -5},
    "Paralyse les unités ennemies d'une case pendant au moins un tour ; ensuite, chacune tente chaque tour de se libérer par un jet de résistance à −5.")
add("Magic Immunity", "Immunité magique", "friendlyUnit", "unitEnchant", {"ability": "magicImmunity", "defVsMagic": 10},
    "L'unité devient insensible aux sorts qui la visent, aux souffles, aux regards et aux tirs magiques.")
add("Haste", "Célérité", "friendlyUnit", "unitEnchant", {"moveMult": 2, "attacksMult": 2},
    "Double la vitesse de l'unité et son nombre d'attaques (mêlée, distance et ripostes) pendant le combat.")
add("Djinn", "Djinn", "none", "summon", {"unit": "Djinn"},
    "Invoque un djinn volant à attaque magique (force 8) qui se téléporte et peut lancer jusqu'à 20 points de sorts de sorcellerie par combat.")
add("Spell Ward", "Égide arcanique", "friendlyCity", "cityEnchant", {"chooseRealm": ["chaos", "death", "life", "nature", "sorcery"]},
    "La ville devient immunisée aux sorts d'un royaume choisi : ses sorts de combat y sont interdits et ses créatures ne peuvent y entrer.")
add("Creature Binding", "Asservissement", "enemyUnit", "curse", {"resistMod": -2, "fantasticOnly": True},
    "Une créature invoquée ennemie qui rate sa résistance (−2) combat pour vous jusqu'à la fin de la bataille, puis disparaît.")
add("Mass Invisibility", "Invisibilité de masse", "allFriendlyUnits", "combatEnchant", {"invisible": True, "toHitPct": -10},
    "Toutes vos unités deviennent invisibles : impossibles à viser à distance, et −10 % pour toucher contre elles en mêlée.")
add("Great Unsummoning", "Grand Renvoi", "none", "resistOrDie", {"resistMod": -3, "fantasticOnly": True, "allPlayers": True},
    "Toutes les créatures invoquées des deux plans, y compris les vôtres, doivent résister (−3) ou être bannies.")
add("Spell Binding", "Captation de sort", "enemyWizard", "special", {"steals": "globalEnchantment"},
    "Vole un enchantement global d'un autre sorcier : vous en prenez le contrôle et l'entretien.")
add("Flying Fortress", "Forteresse volante", "friendlyCity", "cityEnchant", {"onlyFlyersAttack": True},
    "La ville s'élève dans les airs : seules les unités volantes peuvent l'attaquer.")
add("Sky Drake", "Drake céleste", "none", "summon", {"unit": "SkyDrake"},
    "Invoque un drake céleste (mêlée 20, souffle de foudre 20), immunisé à la magie et aux illusions.")
add("Suppress Magic", "Suppression de la magie", "none", "global", {"dispelStrength": 500},
    "Chaque sort hors combat lancé par un rival doit vaincre une dissipation de force 500 pour prendre effet.")
add("Time Stop", "Arrêt du temps", "none", "global", {"onlyCasterActs": True, "onlyThisUpkeep": True},
    "Le temps s'arrête pour tous les autres sorciers : vous seul agissez. Vos cités et vos revenus s'arrêtent aussi : vous ne payez que l'entretien de ce sort.")

# ---------------------------------------------------------------- CHAOS
add("Warp Wood", "Bois tordu", "enemyUnit", "special", {"ammo": 0, "noResist": True, "normalOnly": True},
    "Détruit toutes les munitions de tir physiques (arcs, frondes…) d'une unité ennemie, sans jet de résistance.")
add("Disrupt", "Disruption", "combatTile", "special", {"destroysWall": True},
    "Pulvérise une section de muraille, une porte ou une tour de défense ennemie.")
add("Fire Bolt", "Trait de feu", "enemyUnit", "damage", {"strength": 5, "perMana": 1, "maxStrength": 25, "damage": "fire"},
    "Trait de flammes de force 5 sur une unité ennemie, les dégâts passant d'une figurine à l'autre ; +1 de force par mana supplémentaire (max 25).")
add("Hell Hounds", "Chiens infernaux", "none", "summon", {"unit": "HellHounds"},
    "Invoque une meute de 4 chiens de l'enfer cracheurs de feu (souffle 3).")
add("Corruption", "Corruption", "tile", "terrain", {"corrupt": True, "notOcean": True},
    "Souille une case terrestre : elle ne produit plus ni nourriture ni minerai jusqu'à ce qu'on la purifie (prêtres, chamanes, sort de Purification).")
add("Eldritch Weapon", "Arme surnaturelle", "friendlyUnit", "unitEnchant", {"magicWeapon": True, "enemyBlockPct": -10, "normalOnly": True},
    "Les armes d'une unité normale deviennent magiques : elles touchent les immunisés aux armes et réduisent de 10 % les chances de parade adverses. Cumulable avec Lame de flammes.")
add("Wall of Fire", "Mur de feu", "friendlyCity", "cityEnchant", {"strength": 5, "damage": "fire", "notFlying": True},
    "Encercle une ville amie d'un mur de flammes : toute unité non volante qui le franchit subit une attaque de feu magique de force 5.")
add("Shatter", "Bris d'armes", "enemyUnit", "curse", {"resistMod": 0, "attacksTo": 1, "normalOnly": True},
    "Si l'unité normale visée échoue à résister, toutes ses attaques (mêlée, jet, tir physique) tombent à 1.")
add("Warp Creature", "Déformation", "enemyUnit", "curse", {"resistMod": -1, "effects": ["halfMelee", "halfDefense", "zeroResistance"], "normalOnly": True},
    "Si l'unité échoue à résister (−1), elle subit une mutation au hasard : attaque de mêlée divisée par 2, défense divisée par 2 ou résistance réduite à 0.")
add("Fire Elemental", "Élémentaire de feu", "combatTile", "summon", {"unit": "FireElemental", "combatOnly": True},
    "Invoque pour le combat un élémentaire de feu (mêlée 12, 10 PV). Impossible si 9 unités alliées sont déjà sur le terrain.")
add("Lightning Bolt", "Éclair", "enemyUnit", "damage", {"strength": 5, "perMana": 1, "maxStrength": 45, "damage": "lightning", "armorPiercing": True},
    "Éclair perforant de force 5 sur une unité ennemie (la défense compte moitié) ; +1 de force par mana supplémentaire (max 45).")
add("Fire Giant", "Géant de feu", "none", "summon", {"unit": "FireGiant"},
    "Invoque un géant de feu (mêlée 10, rochers 10), immunisé au feu, qui abat les murailles.")
add("Chaos Channels", "Canaux du chaos", "friendlyUnit", "unitEnchant",
    {"normalOnly": True, "permanent": True, "randomOneOf": {"demonSkin": {"def": 3}, "demonWings": {"flying": True, "move": 2}, "fireBreath": {"fireBreath": 2}}},
    "Mute définitivement une unité normale avec l'un de ces dons au hasard : peau de démon (+3 en défense), ailes de démon (vol, vitesse 2) ou souffle de feu de force 2.")
add("Flame Blade", "Lame de flammes", "friendlyUnit", "unitEnchant", {"melee": 2, "ranged": 2, "thrown": 2, "magicWeapon": True, "normalOnly": True},
    "+2 en attaque de mêlée, de jet et de tir physique ; les armes deviennent magiques. Cumulable avec Arme surnaturelle.")
add("Gargoyles", "Gargouilles", "none", "summon", {"unit": "Gargoyle"},
    "Invoque 4 gargouilles volantes (défense 8), immunisées au poison et à la pétrification.")
add("Fireball", "Boule de feu", "enemyUnit", "areaDamage", {"strength": 5, "manaPerPoint": 3, "maxStrength": 25, "damage": "fire", "allFigures": True},
    "Explosion de force 5 qui frappe chaque figurine de l'unité visée ; +1 de force tous les 3 mana supplémentaires (max 25).")
add("Doom Bat", "Chauve-souris funeste", "none", "summon", {"unit": "DoomBat"},
    "Invoque une chauve-souris géante (vitesse 4) entourée d'une aura de feu qui blesse ses adversaires en mêlée.")
add("Raise Volcano", "Éruption", "tile", "terrain", {"volcano": True, "powerPerTurn": 1, "cityBuildingPct": 15},
    "Fait surgir un volcan sur une case sans colline, montagne ni nœud : elle ne produit plus rien mais vous rapporte 1 point de puissance magique par tour. Sur une ville, chaque bâtiment a 15 % de chances d'être détruit.")
add("Immolation", "Immolation", "friendlyUnit", "unitEnchant", {"ability": "immolation", "strength": 4, "damage": "fire"},
    "Une aura de feu inflige une attaque magique de force 4 à chaque ennemi engagé en mêlée avec l'unité, en plus de ses attaques normales.")
add("Chimeras", "Chimères", "none", "summon", {"unit": "Chimeras"},
    "Invoque 4 chimères volantes à trois têtes cracheuses de feu (souffle 4).")
add("Warp Lightning", "Foudre distordue", "enemyUnit", "damage", {"strengths": [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], "damage": "lightning", "armorPiercing": True},
    "Une chaîne de 10 éclairs perforants frappe la même unité, de force 10, puis 9, 8… jusqu'à 1.")
add("Metal Fires", "Métal ardent", "allFriendlyUnits", "combatEnchant", {"melee": 1, "ranged": 1, "magicWeapon": True, "normalOnly": True, "exclusiveWith": "flame_blade"},
    "Les armes de toutes vos unités normales s'enflamment : +1 en mêlée et en tir, et elles touchent les immunisés aux armes. Non cumulable avec Lame de flammes.")
add("Chaos Spawn", "Rejeton du chaos", "none", "summon", {"unit": "ChaosSpawn"},
    "Invoque un rejeton du chaos volant dont les regards tuent, pétrifient ou brûlent (regards −4, regard funeste 4) et dont la morsure empoisonne.")
add("Doom Bolt", "Trait funeste", "enemyUnit", "damage", {"damage": "doom", "amount": 10, "ignoresDefense": True},
    "Inflige 10 points de dégâts à l'unité visée, sans jet de défense, même immunisée contre la magie.")
add("Magic Vortex", "Vortex magique", "combatTile", "special",
    {"movesPerTurn": 4, "controlledMoves": 1, "damage": 5, "ignoresDefense": True, "adjacentPct": 33, "adjacentStrength": 5, "armorPiercing": True, "cityBuildingPct": 5},
    "Crée un tourbillon qui parcourt 4 cases par tour, au hasard ou vers l'ennemi le plus proche : 5 dégâts sans défense à l'unité traversée, 33 % de chances d'un éclair perforant de force 5 sur chaque voisine. Dure tout le combat.")
add("Efreet", "Éfrit", "none", "summon", {"unit": "Efreet"},
    "Invoque un éfrit volant à attaque magique (force 9), immunisé au feu, qui peut lancer jusqu'à 20 points de sorts de chaos par combat.")
add("Fire Storm", "Tempête de feu", "tile", "areaDamage", {"strength": 8, "damage": "fire", "allFigures": True},
    "Pluie de grêle ardente sur une case ennemie : chaque figurine présente, même en garnison, subit une attaque de feu magique de force 8.")
add("Warp Reality", "Distorsion du réel", "allUnits", "combatEnchant", {"toHitPct": -20, "exceptRealm": "chaos"},
    "Toutes les unités qui ne relèvent pas du chaos, amies comme ennemies, subissent −20 % pour toucher.")
add("Flame Strike", "Frappe de flammes", "allEnemyUnits", "areaDamage", {"strength": 15, "damage": "fire", "allFigures": True},
    "Des arcs de feu frappent chaque figurine ennemie d'une attaque de feu de force 15.")
add("Chaos Rift", "Faille du chaos", "enemyCity", "cityCurse", {"boltsPerTurn": 5, "strength": 8, "armorPiercing": True, "buildingPct": 5},
    "Un vortex au-dessus d'une ville ennemie lance chaque tour 5 éclairs perforants de force 8 sur sa garnison ; chaque bâtiment a 5 % de chances par tour d'être détruit.")
add("Hydra", "Hydre", "none", "summon", {"unit": "Hydra"},
    "Invoque une hydre à 9 têtes cracheuses de feu (chaque tête compte comme une figurine) qui se régénère.")
add("Disintegrate", "Désintégration", "enemyUnit", "resistOrDie", {"maxResistance": 9, "irreversible": True},
    "Anéantit l'unité visée si sa résistance est de 9 ou moins ; ni régénération ni résurrection possibles.")
add("Meteor Storm", "Pluie de météores", "none", "global", {"strength": 4, "damage": "fire", "buildingPct": 5, "spareOwnCities": True},
    "Chaque tour, toute unité hors d'une ville subit une attaque de feu magique de force 4 et chaque bâtiment a 5 % de chances d'être détruit. Vos villes et leurs garnisons sont épargnées.")
add("Great Wasting", "Grande Dévastation", "none", "global", {"maxTilesPerTurn": 6, "enemyUnrest": 1, "spareOwnLands": True},
    "Corrompt chaque tour jusqu'à 6 cases sur les deux plans, en épargnant vos villes et leurs environs ; +1 d'agitation dans les villes rivales.")
add("Call Chaos", "Appel du chaos", "allEnemyUnits", "special",
    {"outcomes": ["nothing", "heal5", "chaos_channels", "warp_creature", "fireBolt15", "warp_lightning", "doom_bolt", "disintegrate"], "eachPct": 12.5},
    "Chaque unité ennemie subit au hasard l'un de ces sorts : rien, soin de 5 PV, Canaux du chaos, Déformation, trait de feu de force 15, Foudre distordue, Trait funeste ou Désintégration.")
add("Chaos Surge", "Déferlement du chaos", "none", "global", {"realm": "chaos", "melee": 2, "ranged": 2, "breath": 2},
    "Toutes les créatures du chaos gagnent +2 en mêlée, en tir, en attaque magique et en souffle de feu.")
add("Doom Mastery", "Maîtrise funeste", "none", "global", {"newUnitsGet": "chaos_channels"},
    "Chaque nouvelle unité normale que vous recrutez reçoit Canaux du chaos.")
add("Great Drake", "Grand Drake", "none", "summon", {"unit": "GreatDrake"},
    "Invoque un grand drake (mêlée 30, souffle de feu 30, 30 PV).")
add("Call the Void", "Appel du néant", "enemyCity", "special", {"buildingPct": 50, "citizenPct": 50, "unitDamage": 10, "corruptsSurroundings": True},
    "Aspire une ville ennemie dans le néant : chaque bâtiment et chaque habitant a 50 % de chances de disparaître, les unités subissent 10 dégâts sans défense, et la moitié des terres alentour sont corrompues.")
add("Armageddon", "Armageddon", "none", "global", {"volcanoesPerTurnMin": 4, "volcanoesPerTurnMax": 5, "powerPerVolcano": 1, "enemyUnrest": 2},
    "Fait surgir des volcans à travers les deux plans (4 à 5 par tour) ; chacun vous rapporte 1 point de puissance magique par tour, et les villes rivales subissent +2 d'agitation.")

# ---------------------------------------------------------------- LIFE
add("Bless", "Bénédiction", "friendlyUnit", "unitEnchant", {"vs": ["death", "chaos"], "def": 3, "res": 3},
    "+3 en défense et +3 en résistance contre les attaques et sorts de mort et de chaos.")
add("Star Fires", "Feux stellaires", "enemyUnit", "damage", {"strength": 15, "damage": "magic", "onlyRealms": ["chaos", "death"], "targets": ["fantastic", "undead"]},
    "Attaque magique de force 15 tombée des étoiles, réservée aux créatures du chaos ou de la mort et aux morts-vivants.")
add("Endurance", "Endurance", "friendlyUnit", "unitEnchant", {"move": 1},
    "+1 en vitesse de déplacement.")
add("Holy Weapon", "Arme bénie", "friendlyUnit", "unitEnchant", {"toHitPct": 10, "magicWeapon": True, "normalOnly": True},
    "Les armes d'une unité normale deviennent magiques (elles touchent les immunisés aux armes) et gagnent +10 % pour toucher en mêlée, au jet et au tir.")
add("Healing", "Guérison", "friendlyUnit", "heal", {"hp": 5, "excludeRealm": "death"},
    "En combat, rend jusqu'à 5 PV à une unité amie. Sur la carte, rend 5 PV à chaque unité blessée de la pile visée. Sans effet sur les créatures de la mort.")
add("Holy Armor", "Armure bénie", "friendlyUnit", "unitEnchant", {"def": 2, "normalOnly": True},
    "+2 en défense pour une unité normale.")
add("Just Cause", "Juste cause", "none", "global", {"fame": 10, "unrest": -1},
    "+10 en renommée tant que le sort est actif, et −1 d'agitation dans vos villes.")
add("True Light", "Lumière vraie", "allUnits", "combatEnchant", {"life": {"melee": 1, "def": 1, "res": 1}, "death": {"melee": -1, "def": -1, "res": -1}},
    "Sur tout le champ de bataille, les créatures de la vie (et l'avatar d'un sorcier de la vie) gagnent +1 en attaque, défense et résistance, celles de la mort perdent 1. Annule Ténèbres.")
add("Guardian Spirit", "Esprit gardien", "none", "summon", {"unit": "GuardianSpirit"},
    "Invoque un esprit gardien qui peut s'unir à un nœud ; une fois uni, un esprit magique n'a que 25 % de chances de l'en déloger (un esprit gardien, 75 %).")
add("Heroism", "Héroïsme", "friendlyUnit", "unitEnchant", {"experienceLevel": "elite", "normalOnly": True},
    "Une unité normale combat comme si elle avait le niveau d'expérience Élite.")
add("True Sight", "Vision vraie", "friendlyUnit", "unitEnchant", {"ability": "illusionsImmunity"},
    "L'unité devient insensible aux illusions et voit à travers le Mur de ténèbres et l'invisibilité.")
add("Plane Shift", "Saut de plan", "tile", "special", {"friendlyStack": True},
    "Transporte toutes les unités amies d'une case sur l'autre plan, si elles peuvent entrer sur la case correspondante.")
add("Resurrection", "Résurrection", "friendlyHero", "special", {"deadHero": True, "maxHeroes": 6},
    "Ramène le héros mort de votre choix, en pleine santé et à son ancien niveau, à votre cercle d'invocation, si vous avez moins de 6 héros.")
add("Dispel Evil", "Exorcisme", "enemyUnit", "resistOrDie", {"resistMod": -4, "undeadResistMod": -9, "onlyRealms": ["chaos", "death"]},
    "Une créature du chaos ou de la mort doit résister (−4, −9 si morte-vivante) ou être détruite par un feu sacré.")
add("Planar Seal", "Sceau planaire", "none", "global", {"blocksPlaneTravel": True},
    "Bloque tout passage entre les deux plans. Ajout d'Arcanes : tant qu'il dure, le voile ne s'use plus et les failles restent muettes.")
add("Unicorns", "Licornes", "none", "summon", {"unit": "Unicorn"},
    "Invoque 4 licornes qui se téléportent en combat et donnent +2 en résistance à leurs alliés.")
add("Raise Dead", "Relever les morts", "deadUnit", "special", {"friendly": True, "normalOnly": True, "healthPct": 50},
    "Ramène au combat une unité normale amie tombée pendant cette bataille, avec la moitié de ses PV et sans ses enchantements.")
add("Planar Travel", "Voyage planaire", "friendlyUnit", "unitEnchant", {"ability": "planeShift"},
    "L'unité peut passer à volonté d'un plan à l'autre, si le terrain d'arrivée le lui permet.")
add("Heavenly Light", "Lumière céleste", "friendlyCity", "cityEnchant", {"combatEffect": "true_light"},
    "Tous les combats dans la ville se déroulent sous l'effet de Lumière vraie.")
add("Prayer", "Prière", "allFriendlyUnits", "combatEnchant", {"toHitPct": 10, "toBlockPct": 10, "res": 1},
    "Toutes vos unités gagnent +10 % pour toucher, +10 % de parade par bouclier et +1 en résistance.")
add("Lionheart", "Cœur de lion", "friendlyUnit", "unitEnchant", {"melee": 3, "thrown": 3, "ranged": 3, "hp": 3, "res": 3},
    "+3 en mêlée, +3 en attaque de jet ou de tir non magique, +3 PV par figurine et +3 en résistance.")
add("Incarnation", "Incarnation", "none", "summon", {"unit": "HeroTorin"},
    "Fait venir le plus grand des héros, l'Élu, au niveau de l'époque ; il ne peut être recruté autrement.")
add("Invulnerability", "Invulnérabilité", "friendlyUnit", "unitEnchant", {"ability": "weaponImmunity", "damageReduction": 2},
    "L'unité devient immunisée aux armes normales et ignore les 2 premiers dégâts de chaque attaque.")
add("Righteousness", "Sainte droiture", "friendlyUnit", "unitEnchant", {"immuneRealms": ["death", "chaos"]},
    "L'unité devient totalement immunisée aux sorts et attaques magiques de mort et de chaos.")
add("Prosperity", "Prospérité", "friendlyCity", "cityEnchant", {"goldPctOfBase": 100, "base": ["taxes", "minerals"]},
    "Double le revenu en or que la ville tire des impôts et des minerais (+100 % de cette base).")
add("Altar of Battle", "Autel de bataille", "friendlyCity", "cityEnchant", {"newUnitsLevel": "elite"},
    "Toutes les unités produites dans la ville commencent au niveau Élite.")
add("Angel", "Ange", "none", "summon", {"unit": "Angel"},
    "Invoque un ange volant (mêlée 13) qui galvanise les unités alliées et dissipe le mal par son toucher.")
add("Stream of Life", "Source de vie", "friendlyCity", "cityEnchant", {"growthMult": 2, "healPct": 100, "unrest": "none"},
    "La croissance de la ville double, les unités qui s'y trouvent sont entièrement soignées chaque tour et toute agitation disparaît.")
add("Mass Healing", "Guérison de masse", "allFriendlyUnits", "heal", {"hp": 5, "excludeRealm": "death"},
    "En combat, rend jusqu'à 5 PV à chacune de vos unités. Sur la carte, rend 5 PV à toutes vos unités blessées, où qu'elles soient. Sans effet sur les créatures de la mort.")
add("Holy Word", "Parole sacrée", "allEnemyUnits", "resistOrDie", {"resistMod": -2, "undeadResistMod": -7, "targets": ["fantastic", "undead"], "perFigure": True},
    "Chaque figurine des créatures invoquées et morts-vivants ennemis doit résister (−2, −7 pour les morts-vivants) ou être bannie.")
add("High Prayer", "Grande Prière", "allFriendlyUnits", "combatEnchant", {"melee": 2, "def": 2, "res": 3, "toHitPct": 10, "toBlockPct": 10},
    "Toutes vos unités gagnent +2 en attaque et en défense, +3 en résistance, +10 % pour toucher et +10 % de parade.")
add("Inspirations", "Inspiration", "friendlyCity", "cityEnchant", {"prodPctOfBase": 100, "base": ["workers", "farmers"]},
    "Double la production fournie par les ouvriers et les fermiers de la ville (+100 % de cette base).")
add("Astral Gate", "Porte astrale", "friendlyCity", "cityEnchant", {"planeTravel": True},
    "Ouvre un portail vers l'autre plan depuis la ville, inutilisable si l'arrivée est en mer, dans une ville étrangère ou occupée par des troupes ennemies.")
add("Holy Arms", "Armes saintes", "none", "global", {"normalUnitsGet": "holy_weapon"},
    "Toutes vos unités normales bénéficient en permanence des effets d'Arme bénie (+10 % pour toucher, armes magiques) ; les deux ne se cumulent pas.")
add("Consecration", "Consécration", "friendlyCity", "cityEnchant", {"removesCurses": True, "immuneRealms": ["chaos", "death"]},
    "Lève toutes les malédictions de la ville et la protège des sorts de ville et effets globaux de chaos et de mort.")
add("Life Force", "Force vitale", "none", "global", {"vsRealm": "death", "dispelStrength": 500},
    "Chaque sort de mort lancé hors combat par un rival doit vaincre une dissipation de force 500 pour prendre effet.")
add("Tranquility", "Sérénité", "none", "global", {"vsRealm": "chaos", "dispelStrength": 500},
    "Chaque sort de chaos lancé hors combat par un rival doit vaincre une dissipation de force 500 pour prendre effet.")
add("Crusade", "Croisade", "none", "global", {"normalUnitsLevel": 1},
    "Vos unités normales (morts-vivants relevés compris) et vos héros gagnent un niveau d'expérience (recrue → régulier, etc.).")
add("Arch Angel", "Archange", "none", "summon", {"unit": "ArchAngel"},
    "Invoque un archange (mêlée 15), insensible aux illusions, qui galvanise les alliés et peut lancer jusqu'à 40 points de sorts de vie par combat.")
add("Charm of Life", "Charme de vie", "none", "global", {"hpPct": 25, "minHp": 1},
    "Chaque figurine de vos unités gagne 25 % de PV supplémentaires (au moins 1).")

# ---------------------------------------------------------------- DEATH
add("Skeletons", "Squelettes", "none", "summon", {"unit": "Skeleton"},
    "Invoque 6 squelettes peu coûteux, immunisés aux projectiles.")
add("Weakness", "Faiblesse", "enemyUnit", "curse", {"resistMod": -2, "melee": -2, "ranged": -2, "thrown": -2},
    "Si l'unité échoue à résister (−2), elle perd 2 en attaque de mêlée, de jet et de tir physique.")
add("Dark Rituals", "Rites ténébreux", "friendlyCity", "cityEnchant", {"religiousPowerMult": 2, "growthPct": -25, "unrest": 1},
    "Double le mana produit par les sanctuaires, temples, parthénons et cathédrales de la ville ; croissance −25 % et agitation +1.")
add("Cloak of Fear", "Manteau d'effroi", "friendlyUnit", "unitEnchant", {"ability": "causeFear"},
    "Les ennemis qui engagent l'unité en mêlée doivent, figurine par figurine, vaincre leur peur pour attaquer ou riposter.")
add("Black Sleep", "Sommeil noir", "enemyUnit", "curse", {"resistMod": -2},
    "Si l'unité échoue à résister (−2), elle dort jusqu'à la fin du combat et subit de plein fouet toutes les attaques.")
add("Ghouls", "Goules", "none", "summon", {"unit": "Ghoul"},
    "Invoque 4 goules : les unités normales tuées surtout par leurs morsures se relèvent en morts-vivants à votre service si vous gagnez la bataille.")
add("Life Drain", "Drain de vie", "enemyUnit", "damage", {"damage": "lifeSteal", "resistMod": 0, "resistPerMana": 5, "manaPerHp": 3},
    "Draine 1d10 moins la résistance de la cible en PV ; un héros lanceur les récupère, un sorcier gagne 3 mana par PV volé. Une unité normale tuée surtout par lui se relève en mort-vivant à votre service si vous gagnez. Chaque tranche de 5 mana supplémentaires réduit la résistance de 1.")
add("Terror", "Terreur", "allEnemyUnits", "combatEnchant", {"resistMod": 1},
    "Chaque tour, chaque unité ennemie doit résister (avec +1) ou rester paralysée par la peur ; elle peut encore riposter.")
add("Darkness", "Ténèbres", "allUnits", "combatEnchant", {"death": {"melee": 1, "def": 1, "res": 1}, "life": {"melee": -1, "def": -1, "res": -1}},
    "Sur tout le champ de bataille, les créatures de la mort (et l'avatar d'un sorcier de la mort) gagnent +1 en attaque, défense et résistance, celles de la vie perdent 1. Annule Lumière vraie.")
add("Mana Leak", "Fuite de mana", "allEnemyUnits", "combatEnchant", {"manaPerTurn": 5, "magicAmmoPerTurn": 1},
    "Chaque tour, le sorcier ennemi et chacun de ses lanceurs de sorts perdent 5 mana, et les unités à tir magique perdent 1 tir.")
add("Drain Power", "Siphon de mana", "enemyWizard", "special", {"manaMin": 50, "manaMax": 150},
    "Retire de 50 à 150 points de mana à la réserve d'un sorcier ennemi.")
add("Possession", "Possession", "enemyUnit", "curse", {"resistMod": -1, "normalOnly": True, "noHeroes": True},
    "Une unité normale ennemie qui rate sa résistance (−1) passe sous votre contrôle jusqu'à la fin du combat.")
add("Lycanthropy", "Lycanthropie", "friendlyUnit", "special", {"unit": "WereWolf", "normalOnly": True},
    "Change une unité normale amie en meute de loups-garous, immunisés aux armes normales.")
add("Black Prayer", "Prière noire", "allEnemyUnits", "combatEnchant", {"melee": -1, "def": -1, "res": -2},
    "Toutes les unités ennemies perdent 1 en attaque et en défense, et 2 en résistance.")
add("Black Channels", "Canaux noirs", "friendlyUnit", "unitEnchant", {"undead": True, "melee": 2, "ranged": 1, "breath": 1, "def": 1, "res": 1, "hp": 1, "normalOnly": True},
    "Change une unité normale en mort-vivant : +2 en mêlée, +1 en tir et souffle, en défense, en résistance et en PV ; comme tout mort-vivant, elle ne guérit plus (sauf régénération).")
add("Night Stalker", "Traqueur nocturne", "none", "summon", {"unit": "NightStalker"},
    "Invoque un traqueur nocturne invisible au regard mortel (résistance −2).")
add("Subversion", "Subversion", "enemyWizard", "special", {"relations": -25, "fromAllWizards": True},
    "Dresse tous les autres sorciers contre le sorcier visé : ses relations diplomatiques se dégradent fortement.")
add("Wall of Darkness", "Mur de ténèbres", "friendlyCity", "cityEnchant", {"blocksRangedIn": True, "blocksSight": True},
    "Entoure la ville d'une nuit opaque : la garnison ne peut être visée à distance de l'extérieur (sauf vision vraie), mais tire normalement.")
add("Berserk", "Furie", "friendlyUnit", "unitEnchant", {"meleeMult": 2, "defTo": 0},
    "L'unité attaque en mêlée avec une force doublée, mais sa défense tombe à 0 quels que soient ses bonus.")
add("Shadow Demons", "Démons des ombres", "none", "summon", {"unit": "ShadowDemons"},
    "Invoque 4 démons des ombres volants et immatériels qui se régénèrent et changent de plan à volonté.")
add("Wraith Form", "Forme spectrale", "friendlyUnit", "unitEnchant", {"ability": ["weaponImmunity", "nonCorporeal"]},
    "L'unité devient immatérielle et immunisée aux armes normales.")
add("Wrack", "Supplice", "allEnemyUnits", "combatEnchant", {"hpLossPerFigure": 1, "resistMod": 1, "exceptRealm": "death"},
    "Chaque tour, chaque figurine ennemie qui n'est pas de la mort doit résister (avec +1) ou perdre 1 PV.")
add("Evil Presence", "Présence maléfique", "enemyCity", "cityCurse", {"religiousBuildings": "none", "ignoreIfDeathBooks": True},
    "Annule le mana et l'effet apaisant des sanctuaires, temples, parthénons et cathédrales d'une ville, sauf si son maître pratique la magie de mort.")
add("Wraiths", "Spectres", "none", "summon", {"unit": "Wraith"},
    "Invoque 4 spectres volants et immatériels dont le toucher vole la vie (résistance −3).")
add("Cloud of Shadow", "Nuée d'ombre", "friendlyCity", "cityEnchant", {"combatEffect": "darkness"},
    "Tous les combats dans la ville se déroulent sous l'effet de Ténèbres.")
add("Warp Node", "Nœud perverti", "node", "special", {"manaDrain": 5},
    "Pervertit un nœud ennemi : au lieu de produire du mana, il en retire 5 par tour à son maître jusqu'à ce qu'il soit désenchanté.")
add("Black Wind", "Vent noir", "tile", "resistOrDie", {"resistMod": -1},
    "Un vent pestilentiel frappe toutes les unités d'une case ennemie : chaque figurine doit résister (−1) ou mourir.")
add("Zombie Mastery", "Maîtrise des zombies", "none", "global", {"zombieUnit": "Zombie"},
    "Après chaque bataille, les unités normales tuées deviennent des zombies à votre service, qui ne guérissent jamais.")
add("Famine", "Famine", "enemyCity", "cityCurse", {"foodPct": -50, "unrestPct": 25},
    "La production de nourriture de la ville est divisée par deux (et l'agitation augmente de 25 %) ; ses habitants peuvent mourir de faim.")
add("Cursed Lands", "Terres maudites", "enemyCity", "cityCurse", {"unrest": 1, "prodPct": -50},
    "Agitation +1 et production de la ville divisée par deux.")
add("Cruel Unminding", "Démence cruelle", "enemyWizard", "special", {"skillPctMin": 1, "skillPctMax": 10},
    "Détruit définitivement de 1 à 10 % de la compétence de lancement d'un sorcier ennemi.")
add("Word of Death", "Mot de mort", "enemyUnit", "resistOrDie", {"resistMod": -5, "perFigure": True},
    "Chaque figurine de l'unité visée doit résister (−5) ou mourir sur-le-champ.")
add("Death Knights", "Chevaliers de la mort", "none", "summon", {"unit": "DeathKnights"},
    "Invoque 4 chevaliers de la mort volants, qui frappent en premier, percent les armures et volent la vie.")
add("Death Spell", "Sort de mort", "allEnemyUnits", "resistOrDie", {"resistMod": -2, "perFigure": True},
    "Chaque figurine ennemie doit résister (−2) ou mourir sur-le-champ.")
add("Animate Dead", "Animation des morts", "deadUnit", "special", {"anySide": True, "undead": True, "noHeroes": True, "upkeepPct": 150},
    "Relève une unité tombée pendant ce combat, amie ou ennemie, en mort-vivant à votre service ; elle reste après la bataille avec un entretien majoré de 50 %, et ne guérit plus (sauf régénération).")
add("Pestilence", "Pestilence", "enemyCity", "cityCurse", {"unrest": 2, "popLossPerTurn": 1},
    "Agitation +2 dans la ville ennemie, et jusqu'à un habitant meurt chaque tour.")
add("Eternal Night", "Nuit éternelle", "none", "global", {"combatEffect": "darkness", "exceptHeavenlyLight": True},
    "Tous les combats ont lieu sous l'effet de Ténèbres, sauf dans les villes protégées par Lumière céleste.")
add("Evil Omens", "Sinistres présages", "none", "global", {"costPct": 50, "realms": ["life", "nature"]},
    "Les sorts de vie et de nature coûtent 50 % de mana en plus à vos rivaux.")
add("Death Wish", "Vœu de mort", "none", "resistOrDie", {"resistMod": 0, "normalOnly": True, "enemies": True, "bothPlanes": True},
    "Toutes les unités normales ennemies des deux plans doivent résister ou mourir.")
add("Demon Lord", "Seigneur démon", "none", "summon", {"unit": "DemonLord"},
    "Invoque un seigneur démon volant (mêlée 20, tir magique 10) qui vole la vie, inspire la peur et appelle des démons en combat.")

# ---------------------------------------------------------------- ARCANE
add("Magic Spirit", "Esprit magique", "none", "summon", {"unit": "MagicSpirit"},
    "Invoque un esprit magique capable de s'unir à un nœud pour en ajouter le mana à vos revenus.")
add("Dispel Magic", "Dissipation de la magie", "anyUnit", "dispel", {"strengthPerMana": 1},
    "Tente de retirer d'une unité en combat les enchantements qui vous nuisent, avec une force égale au mana investi.")
add("Summoning Circle", "Cercle d'invocation", "friendlyCity", "special", {"building": "summoningCircle"},
    "Déplace votre cercle d'invocation dans une autre ville amie.")
add("Disenchant Area", "Désenchantement de zone", "tile", "dispel", {"strengthPerMana": 1, "combatArea": "battlefield"},
    "Tente de retirer tous les enchantements hostiles d'une case de carte (unités, ville, nœud perverti) ou, en combat, de tout le champ de bataille, avec une force égale au mana investi.")
add("Recall Hero", "Rappel du héros", "friendlyHero", "special", {},
    "Ramène instantanément un héros ami du champ de bataille à votre forteresse.")
add("Detect Magic", "Détection de la magie", "none", "global", {"seeEnemyCasting": True},
    "Vous montre en permanence le sort que lance chaque sorcier rival, même ceux que vous n'avez pas encore rencontrés (anonymes).")
add("Enchant Item", "Enchantement d'objet", "none", "special", {"item": True, "maxPowerCost": 200},
    "Forge un objet magique de puissance modeste pour vos héros : bonus tirés au hasard, un pouvoir une fois sur quatre.")
add("Summon Hero", "Appel du héros", "none", "special", {"randomHero": True, "free": True, "maxHeroes": 6},
    "Fait venir à votre cercle d'invocation un héros au hasard, au niveau de l'époque, qui vous rejoint sans prime d'embauche (moins de 6 héros requis).")
add("Awareness", "Clairvoyance", "none", "global", {"revealCities": True},
    "Révèle toutes les villes des deux plans, y compris celles fondées ensuite, et vous rapporte leurs garnisons à chaque tour.")
add("Disjunction", "Disjonction", "none", "dispel", {"strengthPerMana": 1, "targets": "globalEnchantment"},
    "Tente de dissiper l'enchantement global ennemi de votre choix (force 200).")
add("Create Artifact", "Création d'artefact", "none", "special", {"item": True},
    "Forge un puissant objet magique pour vos héros : bonus tirés au hasard, un pouvoir une fois sur deux.")
add("Summon Champion", "Appel du champion", "none", "special", {"randomHero": True, "champion": True, "free": True, "maxHeroes": 6},
    "Fait venir à votre cercle d'invocation un champion au hasard, au niveau de l'époque, qui vous rejoint gratuitement (moins de 6 héros requis).")
add("Spell of Mastery", "Sort de Maîtrise", "none", "global", {"winsGame": True},
    "Une fois lancé, vous contrôlez toute la magie des deux plans : vos rivaux ne peuvent plus lancer de sorts et vous remportez la partie.")
add("Spell of Return", "Sort de Retour", "friendlyCity", "special", {"onlyWhenBanished": True, "rebuildsFortress": True},
    "Ne se lance qu'après un bannissement : rétablit votre forteresse et votre cercle d'invocation dans une ville amie, qui devient votre capitale.")
