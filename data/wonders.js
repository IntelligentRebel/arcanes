window.DATA = window.DATA || {};
// Ouvrages de race (v0.31) : un par race, à bâtir dans une seule cité de cette race par empire, une fois sa recherche achevée.
// La recherche (1500 points, le prix d'un sort rare) ne s'achève de façon réaliste qu'à mi-partie : au banc, une IA de niveau
// moyen cumule environ 1000 points de recherche au tour 100 et 2400 au tour 150 (la meilleure : 2000 et 5700).
// Les recherches sont rangées avec les sorts (DATA.spells, lore: true) pour passer par le même écran de recherche,
// mais ne s'apprennent pas comme des sorts : elles vont dans pl.lore, jamais dans pl.known (ni grimoire, ni échanges).
(function () {
  const W = [
    { race: 'barbarian', id: 'jarlsHall', name: 'Halle des Jarls', en: 'Hall of the Jarls', icon: 'unit:Berserkers',
      desc: 'Les chefs de clan y forment les guerriers : les troupes levées dans vos cités barbares sortent au rang Vétéran.' },
    { race: 'gnoll', id: 'fangPit', name: 'Fosse aux Crocs', en: 'Pit of Fangs', icon: 'unit:WolfRiders',
      desc: 'Après chaque victoire, vos armées se repaissent des morts et récupèrent tous leurs points de vie.' },
    { race: 'halfling', id: 'harvestHall', name: 'Halle des Moissons', en: 'Harvest Hall', icon: 'unit:Slingers',
      desc: 'Le surplus de nourriture de chacune de vos cités rapporte 1 or de plus pour 2 de nourriture en trop.' },
    { race: 'highelf', id: 'motherTree', name: 'Arbre-Mère', en: 'Mother Tree', icon: 'unit:ElvenLord',
      desc: 'Chaque forêt sur le territoire de vos cités produit un demi-point de mana.' },
    { race: 'highmen', id: 'chancery', name: 'Grande Chancellerie', en: 'Grand Chancery', icon: 'unit:Paladin',
      desc: 'Tout achat de production (bâtiment ou troupe) coûte un quart de moins dans vos cités.' },
    { race: 'klackon', id: 'motherHive', name: 'Ruche-Mère', en: 'Mother Hive', icon: 'unit:StagBeetle',
      desc: 'Plus aucune agitation dans vos cités klackonnes.' },
    { race: 'lizardman', id: 'tideTemple', name: 'Temple des Marées', en: 'Temple of Tides', icon: 'unit:DragonTurtle',
      desc: 'Vos troupes lézardes se déplacent sur l\'eau deux fois plus vite.' },
    { race: 'nomad', id: 'caravanserai', name: 'Grand Caravansérail', en: 'Grand Caravanserai', icon: 'unit:NomadRangers',
      desc: 'Le commerce par la route rapporte deux fois plus dans toutes vos cités, et son plafond monte.' },
    { race: 'orc', id: 'skullThrone', name: 'Trône de Crânes', en: 'Throne of Skulls', icon: 'unit:WyvernRiders',
      desc: 'L\'entretien en or de vos troupes baisse d\'un quart.' },
    { race: 'beastmen', id: 'labyrinth', name: 'Labyrinthe', en: 'Labyrinth', icon: 'unit:Minotaur',
      desc: 'Les assaillants de cette cité s\'égarent dans ses dédales : chacun commence l\'assaut avec un quart de ses points de vie en moins.' },
    { race: 'darkelf', id: 'soulWell', name: 'Puits des Âmes', en: 'Well of Souls', icon: 'unit:Warlocks',
      desc: 'Chaque ennemi tué dans une bataille que vous gagnez vous rapporte du mana.' },
    { race: 'draconian', id: 'ancestorsAerie', name: 'Aire des Ancêtres', en: 'Aerie of the Ancestors', icon: 'unit:DoomDrake',
      desc: 'Le souffle de feu de vos troupes draconiennes gagne 2 points.' },
    { race: 'dwarf', id: 'motherForge', name: 'Forge-Mère', en: 'Mother Forge', icon: 'unit:Hammerhands',
      desc: 'Toutes les nouvelles troupes de vos cités sortent avec des armes de mithril.' },
    { race: 'troll', id: 'menhirCircle', name: 'Cercle des Menhirs', en: 'Circle of Menhirs', icon: 'unit:WarTrolls',
      desc: 'Vos troupes trolles coûtent un tiers de moins à former.' },
  ];
  DATA.wonders = {};
  DATA.wonderList = W;
  for (const w of W) {
    DATA.wonders[w.race] = w.id;
    DATA.buildings[w.id] = { id: w.id, name: w.name, cost: 800, upkeep: 3, requires: [], terrain: null, effects: {}, desc: w.desc, wonder: w.race, lore: 'lore_' + w.race, icon: w.icon };
    DATA.spells['lore_' + w.race] = { id: 'lore_' + w.race, en: w.en, name: w.name, realm: 'arcane', rarity: 'rare', section: 'wonder', cost: 0, combatCost: null, plus: false,
      overland: false, combat: false, upkeep: 0, research: 1500, target: 'none', kind: 'lore', params: { building: w.id, race: w.race }, lore: true, desc: w.desc };
  }
})();
