window.DATA = window.DATA || {}; // en Node, le build injecte `var window = globalThis`

/* Avatar du sorcier (ajout d'Arcanes) : une seule définition de base ; la force réelle dépend des livres du sorcier
(u.avatar, calculé au lancement du sort, voir Game.avatarStats) et des niveaux gagnés comme un héros. */
DATA.units.WizardAvatar = {
  id: 'WizardAvatar', en: 'Wizard', name: 'Avatar du sorcier', race: 'hero', realm: null, figures: 1, melee: 4, ranged: 6, rangedType: 'magic', rangedRealm: 'sorcery', ammo: 4,
  def: 4, res: 10, hp: 12, move: 2, overlandMove: null, flying: false, swimming: false, sailing: false, cost: 0, costReduction: false,
  upkeep: { gold: 0, food: 0, mana: 0 }, castCost: 0, requires: [], abilities: { caster: 15 }, spells: [], transport: 0,
  desc: 'Le sorcier en personne, descendu sur la carte.',
};
