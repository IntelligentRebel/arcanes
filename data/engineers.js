window.DATA = window.DATA || {}; // en Node, le build injecte `var window = globalThis`

/* Ingénieurs pour toutes les races (ajout d'Arcanes, v0.30.6). Dans Master of Magic, seuls les Hommes, les Klackons, les Orques,
les Hommes-bêtes et les Nains en avaient : une route n'y était qu'un confort. Ici les montagnes sont infranchissables sans route,
et neuf races se seraient retrouvées murées. Comme les autres : Maison des bâtisseurs requise.
Profil : l'ingénieur des Hommes, corrigé de ce qui distingue les lanciers de la race de ceux des Hommes (attaque, défense, résistance,
points de vie, nombre de figurines), au prix et à l'entretien qui vont avec ; capacités raciales et vol ou nage repris des colons. */
(function () {
  const U = DATA.units, base = U.HighMenEngineer, ref = U.HighMenSpearmen;
  if (!base || !ref) return;
  const IDS = { barbarian: 'BarbarianEngineers', gnoll: 'GnollEngineers', halfling: 'HalflingEngineers', highelf: 'HighElfEngineers', lizardman: 'LizardEngineers',
    nomad: 'NomadEngineers', darkelf: 'DarkElfEngineers', draconian: 'DraconianEngineers', troll: 'TrollEngineers' };
  for (const race in IDS) {
    const r = DATA.races[race]; if (!r || r.units.some(k => U[k] && U[k].abilities.construction)) continue;
    const of = k => U[k] && U[k].race === race;
    const sp = U[r.units.find(k => of(k) && U[k].en === 'Spearmen')] || U[r.units.find(k => of(k) && !U[k].abilities.createOutpost && !U[k].abilities.scout)];
    const st = U[r.units.find(k => of(k) && U[k].abilities.createOutpost)] || {};
    const d = k => (sp[k] || 0) - (ref[k] || 0);
    const cost = Math.max(base.cost, Math.round((base.cost + 2 * d('cost')) / 5) * 5);
    const ab = { construction: true, wallCrusher: true };
    for (const k in st.abilities || {}) if (k !== 'createOutpost') ab[k] = st.abilities[k];
    const id = IDS[race];
    U[id] = Object.assign({}, base, {
      id, race, melee: Math.max(1, base.melee + d('melee')), def: Math.max(1, base.def + d('def')), res: base.res + d('res'), hp: Math.max(1, base.hp + d('hp')),
      figures: Math.max(1, Math.round(base.figures * sp.figures / ref.figures)), flying: !!st.flying, swimming: !!st.swimming,
      cost, upkeep: { gold: cost > 50 ? 2 : 1, food: 1, mana: 0 }, abilities: ab, requires: ['buildersHall'], spells: [],
    });
    // juste avant les colons, comme chez les races du jeu d'origine
    const at = r.units.findIndex(k => U[k] && U[k].abilities.createOutpost);
    r.units.splice(at >= 0 ? at : r.units.length, 0, id);
  }
})();
