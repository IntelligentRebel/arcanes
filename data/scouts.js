window.DATA = window.DATA || {}; // en Node, le build injecte `var window = globalThis`

/* Éclaireurs (ajout d'Arcanes, absent de Master of Magic) : une unité par race, rapide (2 points de mouvement),
qui voit loin (éclaireur 2) et ne gagne quasiment aucun combat. Pas de bâtiment requis. Les capacités raciales
utiles au déplacement (vol des Draconiens, nage des Hommes-lézards, montagnard des Nains, chance des Halfelins,
régénération des Trolls) sont reprises de la première unité de combat de la race. */
(function () {
  const SCOUTS = {
    barbarian: ['BarbarianScouts', 'Coureur des neiges vêtu de fourrures, qui file à travers les terres sauvages pour repérer le terrain.'],
    gnoll: ['GnollScouts', 'Gnoll efflanqué qui court à quatre pattes et flaire les proies et les dangers de loin.'],
    halfling: ['HalflingScouts', 'Halfelin juché sur un poney, lanterne et carte à la main, plus curieux que brave.'],
    highelf: ['HighElfScouts', 'Éclaireur elfe monté sur un cerf blanc, silencieux et rapide comme le vent.'],
    highmen: ['HighMenScouts', 'Estafette sur un cheval léger, équipée d\'une longue-vue, qui reconnaît les routes avant l\'armée.'],
    klackon: ['KlackonScouts', 'Klackon coureur aux longues pattes, antennes dressées, qui balise le terrain pour la ruche.'],
    lizardman: ['LizardScouts', 'Homme-lézard monté sur un lézard coureur, aussi à l\'aise dans les marais qu\'en plaine.'],
    nomad: ['NomadScouts', 'Méhariste du désert sur un dromadaire rapide, qui lit les dunes et les traces.'],
    orc: ['OrcScouts', 'Orque chevauchant un sanglier de guerre, plus bruyant que discret mais infatigable.'],
    beastmen: ['BeastmenScouts', 'Homme-bouc aux sabots agiles, qui bondit de rocher en rocher en sonnant de la corne.'],
    darkelf: ['DarkElfScouts', 'Elfe noir monté sur un grand lézard des cavernes, qui se glisse dans les ombres.'],
    draconian: ['DraconianScouts', 'Jeune draconien aux ailes légères, qui plane au-dessus des terres pour les observer.'],
    dwarf: ['DwarfScouts', 'Nain monté sur une chèvre des montagnes, qui passe là où personne d\'autre ne passe.'],
    troll: ['TrollScouts', 'Jeune troll dégingandé aux longues jambes, qui avale les lieues à grandes enjambées.'],
  };
  const KEEP = ['lucky', 'regeneration', 'mountaineer', 'forester'];
  for (const race in SCOUTS) {
    const r = DATA.races[race]; if (!r) continue;
    const [id, desc] = SCOUTS[race];
    const base = r.units.map(k => DATA.units[k]).find(u => u && u.race === race && !u.abilities.createOutpost && !u.abilities.construction) || {};
    const ab = { scouting: 2, scout: true };
    for (const k of KEEP) if (base.abilities && k in base.abilities) ab[k] = base.abilities[k];
    DATA.units[id] = {
      id, en: 'Scouts', name: 'Éclaireurs', race, realm: null, figures: 1, melee: 1, ranged: 0, rangedType: null, rangedRealm: null, ammo: 0,
      def: 1, res: base.res || 4, hp: 3, move: 2, overlandMove: null, flying: !!base.flying, swimming: !!base.swimming, sailing: false,
      cost: 15, costReduction: true, upkeep: { gold: 0, food: 1, mana: 0 }, castCost: 0, requires: [], abilities: ab, spells: [], transport: 0, desc,
    };
    // juste après les colons dans la liste de production
    const at = r.units.findIndex(k => DATA.units[k] && DATA.units[k].abilities.createOutpost);
    r.units.splice(at >= 0 ? at + 1 : r.units.length, 0, id);
  }
})();
