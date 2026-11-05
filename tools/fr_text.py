"""Textes francais d'Arcanes : noms d'unites, descriptions courtes, heros.

Toutes les descriptions sont redigees pour Arcanes (pas de reprise du manuel).
"""

# --- Noms d'unites (nom anglais kazzmir -> francais) -------------------------
UNIT_NAMES_FR = {
    # unites standard
    "Spearmen": "Lanciers", "Swordsmen": "Épéistes", "Halberdiers": "Hallebardiers",
    "Bowmen": "Archers", "Cavalry": "Cavaliers", "Calvary": "Cavaliers",
    "Priests": "Prêtres", "Magicians": "Magiciens", "Shamans": "Chamanes", "Shaman": "Chamanes",
    "Engineers": "Ingénieurs", "Settlers": "Colons", "Pikemen": "Piquiers",
    # unites raciales
    "Javelineers": "Javeliniers", "Dragon Turtle": "Tortue-dragon", "Horsebowmen": "Archers montés",
    "Rangers": "Rôdeurs", "Griffins": "Griffons", "Wyvern Riders": "Chevaucheurs de vouivres",
    "War Trolls": "Trolls de guerre", "War Mammoths": "Mammouths de guerre",
    "Berserkers": "Berserkers", "Centaurs": "Centaures", "Manticores": "Manticores",
    "Minotaurs": "Minotaures", "Nightblades": "Lames nocturnes", "Warlocks": "Sorciers noirs",
    "Nightmares": "Cauchemars", "Doom Drake": "Drakes funestes", "Air Ship": "Aéronef",
    "Hammerhands": "Marteleurs", "Steam Cannon": "Canon à vapeur", "Golem": "Golem",
    "Wolf Riders": "Chevaucheurs de loups", "Slingers": "Frondeurs", "Longbowmen": "Archers au grand arc",
    "ElvenLord": "Seigneurs elfes", "Elven Lords": "Seigneurs elfes", "Pegasai": "Cavaliers pégases",
    "Paladins": "Paladins", "Stag Beetle": "Lucane géant",
    # navires et engins
    "Trireme": "Trirème", "Galley": "Galère", "Catapult": "Catapulte", "Warship": "Navire de guerre",
    # creatures invoquees
    "Magic Spirit": "Esprit magique", "Hell Hounds": "Chiens infernaux", "Gargoyles": "Gargouilles",
    "Fire Giant": "Géant de feu", "Fire Elemental": "Élémentaire de feu", "Chaos Spawn": "Rejeton du chaos",
    "Chimeras": "Chimères", "Doom Bat": "Chauve-souris funeste", "Efreet": "Éfrit", "Hydra": "Hydre",
    "Great Drake": "Grand Drake", "Skeletons": "Squelettes", "Ghouls": "Goules",
    "Night Stalker": "Traqueur nocturne", "WereWolves": "Loups-garous", "Demon": "Démon",
    "Wraiths": "Spectres", "Shadow Demons": "Démons des ombres", "Death Knights": "Chevaliers de la mort",
    "Demon Lord": "Seigneur démon", "Zombies": "Zombies", "Unicorns": "Licornes",
    "Guardian Spirit": "Esprit gardien", "Angel": "Ange", "Arch Angel": "Archange",
    "War Bears": "Ours de guerre", "Sprites": "Lutins", "Cockatrices": "Cocatrix", "Basilisk": "Basilic",
    "Giant Spiders": "Araignées géantes", "Stone Giant": "Géant de pierre", "Colossus": "Colosse",
    "Gorgons": "Gorgones", "Earth Elemental": "Élémentaire de terre", "Behemoth": "Béhémoth",
    "Great Wyrm": "Grande Vouivre", "Floating Island": "Île flottante", "Phantom Beast": "Bête fantôme",
    "Phantom Warriors": "Guerriers fantômes", "Storm Giant": "Géant des tempêtes",
    "Air Elemental": "Élémentaire d'air", "Djinn": "Djinn", "Sky Drake": "Drake céleste", "Nagas": "Nagas",
}

# Corrections de coquilles des noms anglais kazzmir (champ `en`).
EN_FIXES = {"Calvary": "Cavalry", "ElvenLord": "Elven Lords", "WereWolves": "Werewolves",
            "Pegasai": "Pegasi", "Arch Angel": "Archangel", "Shaman": "Shamans"}

# --- Descriptions generiques des unites standard (par nom anglais) ----------
STANDARD_DESC = {
    "Spearmen": "Milice bon marché armée de lances, utile pour tenir une ville.",
    "Swordsmen": "Fantassins à l'épée protégés par de grands boucliers.",
    "Halberdiers": "Infanterie lourde à hallebarde, solide en défense.",
    "Bowmen": "Tireurs à l'arc qui harcèlent l'ennemi à distance.",
    "Cavalry": "Troupe montée rapide qui frappe la première au contact.",
    "Calvary": "Troupe montée rapide qui frappe la première au contact.",
    "Priests": "Clercs qui soignent les troupes, lancent un trait sacré et purifient les terres corrompues.",
    "Magicians": "Mages de bataille au trait de feu, insensibles aux projectiles.",
    "Shamans": "Guérisseurs de tribu qui lancent une petite décharge magique et purifient les terres corrompues.",
    "Shaman": "Guérisseurs de tribu qui lancent une petite décharge magique et purifient les terres corrompues.",
    "Engineers": "Bâtisseurs de routes, capables aussi de saper les murailles.",
    "Settlers": "Colons partant fonder un nouvel avant-poste.",
    "Pikemen": "Formation de piques qui perce les armures et brise les charges.",
}

# --- Descriptions specifiques (par id d'unite) ------------------------------
UNIT_DESC = {
    # raciales
    "LizardJavelineers": "Hommes-lézards qui lancent des javelots avant de charger.",
    "DragonTurtle": "Énorme tortue cuirassée qui crache des flammes et nage.",
    "NomadHorsebowemen": "Archers à cheval, rapides et mobiles.",
    "NomadRangers": "Éclaireurs des steppes qui ouvrent la voie en tout terrain.",
    "Griffin": "Créatures ailées aux serres perforantes, montées par les nomades.",
    "WyvernRiders": "Orques juchés sur des vouivres au dard venimeux.",
    "WarTrolls": "Trolls cuirassés qui se régénèrent de leurs blessures.",
    "WarMammoths": "Mammouths de bataille qui écrasent les rangs et les murs.",
    "Berserkers": "Guerriers barbares en rage qui lancent des haches avant le choc.",
    "Centaur": "Hommes-chevaux armés d'arcs courts.",
    "Manticore": "Fauves ailés au dard empoisonné.",
    "Minotaur": "Colosses à tête de taureau, précis et lourdement armés.",
    "Nightblades": "Assassins invisibles aux lames enduites de venin.",
    "Warlocks": "Mages noirs maîtrisant un trait de destruction.",
    "Nightmares": "Destriers ténébreux volants qui crachent une magie sombre.",
    "DoomDrake": "Petits dragons draconiens au souffle brûlant.",
    "AirShip": "Navire volant qui bombarde ses cibles de rochers.",
    "Hammerhands": "Guerriers nains d'élite maniant de lourds marteaux.",
    "SteamCannon": "Canon nain à vapeur qui projette des boulets à grande force.",
    "Golem": "Gardien de pierre animé, insensible au poison et à la mort.",
    "WolfRiders": "Gnolls montés sur des loups, rapides et féroces.",
    "Slingers": "Halfelins armés de frondes, chanceux au combat.",
    "Longbowmen": "Archers elfes d'élite au tir précis.",
    "ElvenLord": "Chevaliers elfes d'élite, précis et perforants.",
    "Pegasai": "Elfes montés sur des chevaux ailés, armés d'arcs.",
    "Paladin": "Chevaliers saints immunisés contre la magie.",
    "StagBeetle": "Insecte géant aux mandibules redoutables et au souffle ardent.",
    # navires et engins
    "Trireme": "Petit navire à rames qui transporte deux unités.",
    "Galley": "Navire de transport armé d'archers.",
    "Catapult": "Engin de siège à longue portée qui abat les murailles.",
    "Warship": "Grand vaisseau de guerre aux tirs de catapulte illimités.",
    # creatures arcanes
    "MagicSpirit": "Esprit élémentaire qui peut se lier à un nœud pour en capter le mana.",
    # chaos
    "HellHounds": "Meute de chiens démoniaques au souffle de feu.",
    "Gargoyle": "Statues ailées vivantes, très résistantes.",
    "FireGiant": "Géant ardent qui lance des rochers et fracasse les murs.",
    "FireElemental": "Flamme vivante appelée pour la durée d'un combat.",
    "ChaosSpawn": "Abomination aux multiples regards mortels qui sème la peur.",
    "Chimeras": "Bêtes volantes à trois têtes crachant le feu.",
    "DoomBat": "Chauve-souris géante entourée d'un brasier.",
    "Efreet": "Génie du feu qui lance des sorts de chaos.",
    "Hydra": "Serpent à neuf têtes qui crache le feu et se régénère.",
    "GreatDrake": "Dragon rouge colossal au souffle dévastateur.",
    # mort
    "Skeleton": "Squelettes animés, insensibles aux projectiles.",
    "Ghoul": "Morts affamés dont la morsure relève les victimes en morts-vivants.",
    "NightStalker": "Prédateur invisible au regard mortel.",
    "WereWolf": "Fauves maudits que les armes ordinaires ne blessent pas.",
    "Demon": "Démon ailé appelé le temps d'un combat.",
    "Wraith": "Ombres volantes qui drainent la vie de leurs victimes.",
    "ShadowDemons": "Démons immatériels capables de changer de plan.",
    "DeathKnights": "Cavaliers morts-vivants qui volent la vie de leurs adversaires.",
    "DemonLord": "Seigneur infernal qui sème la peur et appelle des démons.",
    "Zombie": "Cadavres relevés, lents mais tenaces.",
    # vie
    "Unicorn": "Licornes qui se téléportent et renforcent la résistance alliée.",
    "GuardianSpirit": "Esprit protecteur qui peut se lier à un nœud.",
    "Angel": "Messager céleste qui chasse les créatures maléfiques.",
    "ArchAngel": "Champion céleste capable de lancer des sorts de vie.",
    # nature
    "WarBear": "Ours dressés pour la guerre, à l'aise en forêt.",
    "Sprites": "Petites fées volantes qui lancent des traits magiques.",
    "Cockatrices": "Oiseaux-serpents dont le contact pétrifie.",
    "Basilisk": "Reptile géant au regard pétrifiant.",
    "GiantSpiders": "Araignées venimeuses qui tissent des toiles.",
    "StoneGiant": "Géant de roc qui lance des pierres et abat les murs.",
    "Colossus": "Statue géante animée, frappe d'abord et projette des rocs.",
    "Gorgon": "Créatures ailées au regard pétrifiant.",
    "EarthElemental": "Terre vivante appelée pour un combat, brise les murailles.",
    "Behemoth": "Bête titanesque d'une force brute immense.",
    "GreatWyrm": "Ver géant venimeux qui voyage sous terre.",
    # sorcellerie
    "FloatingIsland": "Île magique qui transporte jusqu'à huit unités sur l'eau.",
    "PhantomBeast": "Bête illusoire dont les coups ignorent l'armure.",
    "PhantomWarriors": "Guerriers illusoires appelés pour un combat.",
    "PhantomWarrior": "Guerriers illusoires appelés pour un combat.",
    "StormGiant": "Géant qui lance la foudre et perce les armures.",
    "AirElemental": "Vent vivant invisible, insensible aux armes ordinaires.",
    "Djinn": "Génie de l'air qui se téléporte et lance des sorts.",
    "SkyDrake": "Dragon bleu au souffle de foudre, immunisé contre la magie.",
    "Nagas": "Serpents à buste humain qui frappent les premiers de leur venin.",
}

# --- Heros : nom invente, titre FR, description ----------------------------
HERO_TITLE_FR = {
    "Chosen": "Élu", "Draconian": "Draconien", "Dervish": "Derviche", "Witch": "Sorcière",
    "Chaos Warrior": "Guerrier du chaos", "Unknown": "Inconnu", "Orc Warrior": "Guerrier orque",
    "Swordsman": "Bretteur", "Rogue": "Roublard", "Knight": "Chevalier", "Dwarf": "Nain",
    "Necromancer": "Nécromancien", "Druid": "Druide", "Amazon": "Amazone", "Paladin": "Paladin",
    "Magician": "Magicien", "Black Knight": "Chevalier noir", "Barbarian": "Barbare",
    "Beastmaster": "Maître des bêtes", "Wind Mage": "Mage du vent", "War Monk": "Moine guerrier",
    "Warlock": "Sorcier noir", "Bard": "Barde", "Priestess": "Prêtresse", "Illusionist": "Illusionniste",
    "Ranger": "Rôdeur", "Warrior Mage": "Mage guerrier", "Elven Archer": "Archère elfe", "Sage": "Sage",
    "Ninja": "Ninja", "Healer": "Guérisseuse", "Huntress": "Chasseresse", "Thief": "Voleuse",
    "Assassin": "Assassin", "Golden One": "Être doré",
}

# Noms inventes (aucun ne reprend un nom d'origine).
HERO_NAMES = {
    "HeroTorin": "Aurévan", "HeroFang": "Skarrth", "HeroBShan": "Kessim", "HeroMorgana": "Nyssandre",
    "HeroWarrax": "Kragmor", "HeroMysticX": "Nulvar", "HeroBahgtru": "Grumnak", "HeroDethStryke": "Vaelor",
    "HeroSpyder": "Fennick", "HeroSirHarold": "Aldebert", "HeroBrax": "Thordal", "HeroRavashack": "Vorhask",
    "HeroGreyfairer": "Eldrin", "HeroShalla": "Kastra", "HeroRoland": "Galarn", "HeroMalleus": "Vespero",
    "HeroMortu": "Malgrim", "HeroGunther": "Korvald", "HeroRakir": "Varrok", "HeroJaer": "Zéphan",
    "HeroTaki": "Hoshiro", "HeroYramrag": "Morvoth", "HeroValana": "Liselle", "HeroElana": "Séraphine",
    "HeroAerie": "Quillon", "HeroMarcus": "Tobren", "HeroReywind": "Caldor", "HeroAlorra": "Ithriel",
    "HeroZaldron": "Ostravel", "HeroShinBo": "Kazeyo", "HeroSerena": "Alwyne", "HeroShuri": "Ysolde",
    "HeroTheria": "Mirka", "HeroTumu": "Sarrek", "HeroAureus": "Solarion",
}

HERO_DESC = {
    "HeroBrax": "Guerrier nain endurant qui progresse sans peine en montagne.",
    "HeroGunther": "Barbare puissant qui lance une hache avant le corps à corps.",
    "HeroZaldron": "Érudit qui accélère la recherche et lance des sorts de sorcellerie.",
    "HeroBShan": "Archer nomade de noble lignée qui ne demande aucune solde.",
    "HeroRakir": "Pisteur des bêtes sauvages, éclaireur à l'aise en forêt.",
    "HeroValana": "Chanteuse itinérante dont la présence galvanise les troupes.",
    "HeroBahgtru": "Brute orque qui lance son arme et gravit les montagnes.",
    "HeroSerena": "Soigneuse dévouée qui maîtrise le sort de Guérison.",
    "HeroShuri": "Archère des bois qui trouve toujours un chemin.",
    "HeroTheria": "Voleuse agile et charmeuse, difficile à atteindre.",
    "HeroGreyfairer": "Gardien des forêts qui purifie la terre et lance des sorts de nature.",
    "HeroTaki": "Combattant à mains nues d'une agilité exceptionnelle.",
    "HeroReywind": "Lame et magie du chaos réunies chez un même combattant.",
    "HeroMalleus": "Mage du chaos à la volonté de fer, insensible aux flèches.",
    "HeroTumu": "Tueur discret aux armes empoisonnées.",
    "HeroJaer": "Mage aérien qui porte son groupe sur les vents.",
    "HeroMarcus": "Éclaireur aguerri, archer et pisteur hors pair.",
    "HeroFang": "Draconien ailé au souffle de feu.",
    "HeroMorgana": "Enchanteresse de la mort au charme redoutable.",
    "HeroAureus": "Guerrier rayonnant qui mêle l'épée et la magie du chaos.",
    "HeroShinBo": "Guerrier de l'ombre invisible et maître des lames.",
    "HeroSpyder": "Escroc charismatique dont la légende attire les foules.",
    "HeroShalla": "Guerrière farouche, forte et habile au lancer.",
    "HeroYramrag": "Sorcier noir aux réserves de mana considérables.",
    "HeroMysticX": "Combattant mystérieux aux talents imprévisibles.",
    "HeroAerie": "Maître des illusions qui lance des sorts de sorcellerie.",
    "HeroDethStryke": "Escrimeur légendaire, meneur d'hommes et maître d'armes.",
    "HeroElana": "Grande prêtresse aux pouvoirs de guérison et de prière inégalés, qui purifie aussi les terres corrompues.",
    "HeroRoland": "Chevalier saint, guérisseur et redoutable à l'épée.",
    "HeroMortu": "Chevalier sombre immunisé contre la magie.",
    "HeroAlorra": "Archère elfe d'élite au tir précis.",
    "HeroSirHarold": "Noble chevalier, chef né et figure de légende.",
    "HeroRavashack": "Nécromancien qui draine la vie et domine la mort.",
    "HeroWarrax": "Champion du chaos aussi dangereux en mêlée qu'à distance.",
    "HeroTorin": "Élu des dieux, champion presque invincible au service de la vie.",
}

# Ordre de consultation des descriptions : id specifique, sinon type standard.
def unit_desc(uid, en):
    if uid in UNIT_DESC:
        return UNIT_DESC[uid]
    if uid in HERO_DESC:
        return HERO_DESC[uid]
    return STANDARD_DESC.get(en, "")
