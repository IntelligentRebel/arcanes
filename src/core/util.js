'use strict';
// Utilitaires partagés par le moteur et l'interface.
const U = {
  // « de » élidé : de Merlin, d'Ariel, d'un sorcier inconnu, du roi, des elfes
  // une liste de noms, les doublons regroupés : « Lanciers ×2, Épéistes »
  tally(names) { const m = new Map(); for (const n of names) m.set(n, (m.get(n) || 0) + 1); return [...m].map(([n, c]) => c > 1 ? n + ' ×' + c : n).join(', '); },
  // le jeu en français ? (les tournures « de / d' », les accords ne valent qu'en français)
  fr() { return typeof I18N === 'undefined' || I18N.lang === 'fr'; },
  de(n) { if (!U.fr()) return n; return /^(un|une|le|les) /.test(n) ? (/^le /.test(n) ? 'du ' + n.slice(3) : /^les /.test(n) ? 'des ' + n.slice(4) : 'd\'' + n) : (/^(<[^>]*>)?[AEIOUYÉÈÊÂÎÔÛaeiouyéèêâîôû]/.test(n) ? 'd\'' : 'de ') + n; },
  cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; },
  // un mot affiché glissé dans une phrase (« vous », « murailles ») : rien à faire ici, l'assemblage le traduit
  txt(s) { return s; },
  // accord en nombre à la française : 0 et 1 au singulier
  n(k, sing, plur) { return k + ' ' + U.pick(k, sing, plur || sing + 's'); },
  // la forme qui va avec le nombre k (le russe et le polonais ont aussi une forme pour 2 à 4)
  pick(k, one, many) { return typeof I18N !== 'undefined' ? I18N.pick(k, one, many) : Math.abs(k) >= 2 ? many : one; },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  sum(arr, f) { let s = 0; for (const x of arr) s += f ? f(x) : x; return s; },
  max(arr, f) { let best = null, bv = -Infinity; for (const x of arr) { const v = f(x); if (v > bv) { bv = v; best = x; } } return best; },
  min(arr, f) { let best = null, bv = Infinity; for (const x of arr) { const v = f(x); if (v < bv) { bv = v; best = x; } } return best; },
  groupBy(arr, f) { const m = {}; for (const x of arr) { const k = f(x); (m[k] = m[k] || []).push(x); } return m; },
  uniq(arr) { return Array.from(new Set(arr)); },
  fmt(n) { return Math.round(n).toLocaleString(typeof I18N !== 'undefined' ? I18N.locale : 'fr-FR'); },
  plural(n, one, many) { return n + ' ' + U.pick(n, one, many); },
  esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  // directions 8-voisinage
  DIRS8: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]],
  DIRS4: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  deepClone(o) { return JSON.parse(JSON.stringify(o)); },
};

// File de priorité (tas binaire) pour A* et Dijkstra
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(pri, v) {
    const a = this.a; a.push([pri, v]); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; const t = a[p]; a[p] = a[i]; a[i] = t; i = p; }   // (échange sans tableau intermédiaire)
  }
  pop() {
    const a = this.a; if (!a.length) return null;
    const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; const t = a[m]; a[m] = a[i]; a[i] = t; i = m; }
    }
    return top;
  }
}

// Noms de cités par race (inventés).
const CITY_NAMES = {
  barbarian: ['Skarnheim', 'Ulfvik', 'Hrothgard', 'Ragnvald', 'Kjellholm', 'Tyrstad', 'Brunnmark', 'Eikvald', 'Horgafell', 'Sigvarn', 'Drakfjord', 'Ormsby', 'Grimstad', 'Vargholm'],
  gnoll: ['Krugg', 'Hyarrak', 'Gnashol', 'Rakkat', 'Yeeknar', 'Brukh', 'Snarrag', 'Grawlak', 'Hrokk', 'Vexnar'],
  halfling: ['Bourg-Tonneau', 'Fontaine-Douce', 'Pré-Moussu', 'Clos-Miel', 'Combe-Fleurie', 'Haie-Basse', 'Rivebourg', 'Pommeraie', 'Val-Tranquille', 'Coteau-Rond'],
  highelf: ["Aelindor", "Sylvarin", "Elessith", "Thalanor", "Lindrael", "Ithilmar", "Caelwen", "Aranel", "Miravel", "Celendil", "Nimrais", "Eldaris"],
  highmen: ['Valcourt', 'Hautemarche', 'Pierrefort', 'Beaumont', 'Clairval', 'Montargue', 'Saint-Aubert', 'Lorvennes', 'Brisac', 'Hautecombe', 'Verlaine', 'Rocheblanche', 'Aubergenville', 'Castelmaure'],
  klackon: ["K'tharr", "Zz'kril", "Ch'kkat", "T'rrikk", "Kk'zoth", "Xx'tal", "Rr'kett", "Ss'kar"],
  lizardman: ['Sssalith', 'Hissara', 'Ssskor', 'Tlazzir', 'Xissaq', 'Zhassal', 'Ssirrak', 'Kassith'],
  nomad: ['Qadirah', 'Sahrim', 'Tamazin', 'Oubari', 'Zerhoun', 'Azmar', 'Khalid-Tal', 'Ifran', 'Tissemt', 'Rabat-Sable'],
  orc: ['Grukmar', 'Durzak', 'Morgash', 'Uglak', 'Krazh', 'Bolgrom', 'Nargol', 'Shagrath', 'Zugdush', 'Gorbag'],
  beastmen: ['Taurgrim', 'Brakhorn', 'Vurnoth', 'Gharm', 'Moragh', 'Hornvald', 'Krotak', 'Bovren'],
  darkelf: ["Vel'Sharra", "Nyx'arath", "Shadrael", "Ul'Venna", "Mor'Drith", "Zhaunil", "Ithyrr", "Kael'Vor", "Sorvalin", "Dhaerow"],
  draconian: ['Pyrrhax', 'Vyrnath', 'Scalehold', 'Drakonis', 'Aerith-Pyr', 'Zharvos', 'Ignaris', 'Wyrmhaven'],
  dwarf: ['Khazad-Bor', 'Durnhelm', 'Grimstone', 'Barak-Zun', 'Thorgrim', 'Kaz-Dorn', 'Belegost', 'Ironhold', 'Dunmarr', 'Gundabar'],
  troll: ['Gronk', 'Thrull', 'Mogg', 'Urrg', 'Brorr', 'Krull', 'Hrumm', 'Zogg'],
};

const REALM_COLORS = { life: '#f2efe2', death: '#8a5ca8', chaos: '#e0523a', nature: '#4fae4a', sorcery: '#4a8be0', arcane: '#b9b2a0' };
const REALM_NAMES = { life: 'Vie', death: 'Mort', chaos: 'Chaos', nature: 'Nature', sorcery: 'Sorcellerie', arcane: 'Arcane' };
const REALMS5 = ['life', 'death', 'chaos', 'nature', 'sorcery'];
const RARITY_NAMES = { common: 'Commun', uncommon: 'Peu commun', rare: 'Rare', veryrare: 'Très rare', legend: 'Légendaire' };
const SECTION_NAMES = { summoning: 'Invocations', special: 'Sorts spéciaux', city: 'Sorts de cité', global: 'Enchantements globaux', unit: 'Sorts d\'unité', combat: 'Sorts de combat', legend: 'Livre de légende', wonder: 'Ouvrage' };
const PLAYER_COLORS = ['#3d7be8', '#d93b3b', '#3fae4f', '#e0b52b', '#9b4fd8', '#e07a2b', '#8a8a8a'];
// tailles de carte (cases), toujours au format 3:2
const MAP_SIZES = { small: { w: 48, h: 32, name: 'Petite' }, normal: { w: 60, h: 40, name: 'Normale (originale)' }, large: { w: 72, h: 48, name: 'Grande' }, huge: { w: 90, h: 60, name: 'Immense' } };
const PLANE_NAMES = ['Arcane', 'Miroir'];
const TAX_RATES = [0, 0.5, 1, 1.5, 2, 2.5, 3];
const TAX_UNREST = [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.75];

// Terrain : indices compacts pour la carte
const T = { OCEAN: 0, GRASS: 1, FOREST: 2, HILLS: 3, MOUNTAIN: 4, DESERT: 5, SWAMP: 6, TUNDRA: 7, RIVER: 8, LAKE: 9, SNODE: 10, NNODE: 11, CNODE: 12, VOLCANO: 13 };
const T_KEYS = ['ocean', 'grass', 'forest', 'hills', 'mountain', 'desert', 'swamp', 'tundra', 'river', 'lake', 'sorceryNode', 'natureNode', 'chaosNode', 'volcano'];
const MIN_KEYS = [null, 'iron', 'coal', 'silver', 'gold', 'gems', 'mithril', 'adamantium', 'quork', 'crysx', 'wildGame', 'nightshade'];
const M = {}; MIN_KEYS.forEach((k, i) => { if (k) M[k] = i; });

const NODE_REALM = { 10: 'sorcery', 11: 'nature', 12: 'chaos' };

// Niveaux d'expérience
const NORMAL_LEVELS = [
  { name: 'Recrue', xp: 0, melee: 0, toHit: 0, def: 0, res: 0, hp: 0 },
  { name: 'Régulier', xp: 20, melee: 1, toHit: 0, def: 0, res: 1, hp: 0 },
  { name: 'Vétéran', xp: 60, melee: 1, toHit: 0, def: 1, res: 2, hp: 0 },
  { name: 'Élite', xp: 120, melee: 2, toHit: 1, def: 1, res: 3, hp: 1 },
  { name: 'Ultra-élite', xp: 200, melee: 2, toHit: 2, def: 2, res: 4, hp: 1 },
  { name: 'Champion', xp: 300, melee: 3, toHit: 3, def: 2, res: 5, hp: 2 },
];
const HERO_LEVELS = [
  { name: 'Héros', xp: 0, melee: 0, toHit: 0, def: 0, res: 0, hp: 0 },
  { name: 'Myrmidon', xp: 20, melee: 1, toHit: 0, def: 1, res: 1, hp: 1 },
  { name: 'Capitaine', xp: 60, melee: 2, toHit: 0, def: 1, res: 2, hp: 2 },
  { name: 'Commandant', xp: 120, melee: 3, toHit: 1, def: 2, res: 3, hp: 3 },
  { name: 'Champion', xp: 200, melee: 4, toHit: 1, def: 2, res: 4, hp: 4 },
  { name: 'Seigneur', xp: 300, melee: 5, toHit: 2, def: 3, res: 5, hp: 5 },
  { name: 'Grand seigneur', xp: 450, melee: 6, toHit: 2, def: 3, res: 6, hp: 6 },
  { name: 'Super-héros', xp: 600, melee: 7, toHit: 3, def: 4, res: 7, hp: 7 },
  { name: 'Demi-dieu', xp: 1000, melee: 8, toHit: 3, def: 4, res: 8, hp: 8 },
];

const ABILITY_NAMES = {
  armorPiercing: 'Perforation', causeFear: 'Effroi', coldImmunity: 'Immunité au froid', construction: 'Construction', createOutpost: 'Fondation',
  createUndead: 'Création de morts-vivants', deathGaze: 'Regard mortel', deathImmunity: 'Immunité à la mort', dispelEvil: 'Purge du mal', doomBoltSpell: 'Trait funeste',
  doomGaze: 'Regard funeste', deathTouch: 'Toucher mortel', fireballSpell: 'Boule de feu', fireBreath: 'Souffle de feu', fireImmunity: 'Immunité au feu', firstStrike: 'Première frappe',
  forester: 'Forestier', healer: 'Guérisseur', healingSpell: 'Soin', holyBonus: 'Aura sacrée', illusion: 'Illusion', illusionsImmunity: 'Immunité aux illusions', immolation: 'Immolation',
  invisibility: 'Invisibilité', largeShield: 'Grand bouclier', lifeSteal: 'Vol de vie', lightningBreath: 'Souffle de foudre', longRange: 'Longue portée', magicImmunity: 'Immunité à la magie',
  meld: 'Fusion (nœud)', merging: 'Fouissement', missileImmunity: 'Immunité aux projectiles', mountaineer: 'Montagnard', negateFirstStrike: 'Anti-première frappe', nonCorporeal: 'Incorporel',
  pathfinding: 'Éclaireur de route', planeShift: 'Saut de plan', poisonImmunity: 'Immunité au poison', poisonTouch: 'Toucher empoisonné', purify: 'Purification', regeneration: 'Régénération',
  resistanceToAll: 'Résistance à tout', scouting: 'Éclaireur', stoningGaze: 'Regard pétrifiant', stoningImmunity: 'Immunité à la pétrification', stoningTouch: 'Toucher pétrifiant',
  summonDemons: 'Invocation de démons', toHit: 'Précision', transport: 'Transport', teleporting: 'Téléportation', thrown: 'Lancer', wallCrusher: 'Briseur de murs', siegeOnly: 'Engin de siège',
  weaponImmunity: 'Immunité aux armes', webSpell: 'Toile', windWalking: 'Marche du vent', agility: 'Agilité', superAgility: 'Super agilité', arcanePower: 'Puissance arcanique',
  superArcanePower: 'Super puissance arcanique', armsmaster: "Maître d'armes", superArmsmaster: "Super maître d'armes", blademaster: 'Maître lame', superBlademaster: 'Super maître lame',
  caster: 'Lanceur de sorts', charmed: 'Charmé', constitution: 'Constitution', superConstitution: 'Super constitution', leadership: 'Commandement', superLeadership: 'Super commandement',
  legendary: 'Légendaire', superLegendary: 'Super légendaire', lucky: 'Chanceux', might: 'Puissance', superMight: 'Super puissance', noble: 'Noble', prayermaster: 'Maître de prière',
  superPrayermaster: 'Super maître de prière', sage: 'Sage', superSage: 'Super sage',
};

// ce que fait chaque capacité (les talents de héros ont leur propre texte, DATA.heroTalents) ; N = la valeur affichée après le nom
const ABILITY_DESC = {
  armorPiercing: 'Ses coups et ses tirs ne rencontrent que la moitié de la défense de la cible.',
  causeFear: 'Avant la mêlée, chaque figurine adverse fait un jet de résistance (Mort) : celles qui le ratent sont paralysées et ne frappent pas ce tour. Sans effet sur les immunisés à la magie ou à la mort.',
  coldImmunity: 'Les attaques et les sorts de froid ne lui font rien.',
  construction: 'Construit des routes (boutons Route et Route vers…) et passe les montagnes sans route.',
  createOutpost: 'Fonde une nouvelle cité (bouton Fonder) ; l\'unité est consommée.',
  createUndead: 'Les unités normales tuées surtout par ses coups se relèvent en morts-vivants dans le camp vainqueur, à la fin de la bataille.',
  deathGaze: 'Avant la mêlée, chaque figurine adverse fait un jet de résistance (Mort, moins N) : celles qui le ratent meurent. Les immunisés à la mort ou à la magie n\'en craignent rien.',
  deathImmunity: 'Insensible aux effets de Mort : regard et toucher mortels, vol de vie, terreur ; résistance 50 contre les sorts de Mort.',
  dispelEvil: 'En mêlée, contre une créature de Chaos ou de Mort : chaque figurine qu\'elle frappe fait un jet de résistance (−4, −9 pour un mort-vivant) ; ratée, elle est détruite.',
  doomBoltSpell: 'Lance une fois par combat un Trait funeste, gratuitement.',
  doomGaze: 'Avant la mêlée, inflige N points de dégâts à l\'unité adverse, sans jet de défense (sauf immunité à la magie ou Droiture).',
  deathTouch: 'En mêlée, chaque figurine qui frappe impose un jet de résistance (Mort, −3) : raté, une figurine adverse meurt.',
  fireballSpell: 'Lance une fois par combat une Boule de feu, gratuitement.',
  fireBreath: 'Avant la mêlée, chaque figurine crache un jet de feu de force N.',
  fireImmunity: 'Le feu ne lui fait rien : souffle de feu, Boule de feu, Immolation, Mur de feu…',
  forester: 'Traverse les forêts (et les nœuds de nature) pour un seul point de mouvement, lui et toute sa pile, sur la carte comme en combat.',
  healingSpell: 'Lance une fois par combat un Soin, gratuitement.',
  holyBonus: '+N en attaque, en défense et en résistance pour toutes les unités de son camp, elle comprise (la plus forte aura du camp compte).',
  illusion: 'Ses attaques sont des illusions : elles ignorent la défense de la cible, sauf si celle-ci est immunisée aux illusions.',
  illusionsImmunity: 'Voit à travers les illusions : les attaques illusoires rencontrent sa défense, l\'invisibilité ne le trompe pas et le Mur de ténèbres ne l\'aveugle pas.',
  immolation: 'Quand elle frappe en mêlée, elle embrase sa cible : une attaque de feu de force 4 sur chaque figurine.',
  invisibility: 'Seules les unités au contact la voient : on ne peut ni la viser à distance ni lui lancer de sort, et on a −10 % pour la toucher.',
  largeShield: '+2 en défense contre les tirs et la magie.',
  lifeSteal: 'En mêlée, draine des points de vie à la cible (jet contre sa résistance à la Mort, moins N) et s\'en soigne d\'autant ; une unité normale tuée surtout ainsi se relève en mort-vivant dans le camp vainqueur. Sans effet sur les immunisés à la mort ou à la magie.',
  lightningBreath: 'Avant la mêlée, chaque figurine lance un éclair de force N, qui ne rencontre que la moitié de la défense.',
  longRange: 'Ses tirs perdent moins de précision avec la distance : −10 % seulement au-delà de 8 cases.',
  magicImmunity: 'Insensible aux sorts qui la visent, aux tirs magiques, souffles, regards et touchers spéciaux (résistance et défense 50 contre eux). Les enchantements de combat qui affaiblissent tout un camp l\'atteignent.',
  meld: 'Se lie à un nœud magique (bouton Fusionner) pour en capter le mana ; l\'unité est consommée.',
  merging: 'En combat, passe sous terre et ressort d\'un bond n\'importe où sur le champ de bataille, murailles comprises.',
  missileImmunity: 'Les flèches et les pierres de fronde ne lui font rien (les boulets, les jets et les sorts, si).',
  negateFirstStrike: 'Annule la première frappe de ses adversaires (ils frappent en même temps que lui) et brise les charges de cavalerie.',
  nonCorporeal: 'Passe à travers les murailles ; la boue et l\'Enchevêtrement ne le ralentissent pas.',
  planeShift: 'Passe d\'Arcane au Miroir, et retour, de n\'importe où, sans tour ni faille.',
  poisonImmunity: 'Le poison ne lui fait rien.',
  poisonTouch: 'En mêlée (et avec ses jets), la cible fait N jets de résistance : chaque échec lui coûte 1 point de vie. Sans effet sur les immunisés au poison.',
  caster: 'Lance des sorts de combat en puisant dans sa propre réserve de mana (montant indiqué dans ses caractéristiques).',
  scouting: 'Voit plus loin sur la carte : jusqu\'à N cases, ou une case de plus que sa vue normale.',
  purify: 'Purifie la terre corrompue où il se tient, en 3 tours (boutons Purifier et Purifier tout).',
  regeneration: 'Regagne 1 point de vie par tour de combat ; si son camp gagne, se relève guéri même s\'il est tombé (sauf dégâts irréversibles).',
  resistanceToAll: '+N en résistance pour toutes les unités de son camp, elle comprise.',
  stoningGaze: 'Avant la mêlée, chaque figurine adverse fait un jet de résistance (Nature, moins N) : celles qui le ratent sont changées en pierre.',
  stoningImmunity: 'Insensible à la pétrification : regards et touchers pétrifiants, sort Pétrification.',
  stoningTouch: 'En mêlée, chaque figurine qui frappe impose un jet de résistance (Nature, moins N) : raté, une figurine adverse est changée en pierre.',
  summonDemons: 'Invoque N démons une fois par combat, gratuitement (s\'il reste de la place : 9 unités au plus par camp).',
  toHit: 'Chaque coup a N % de chances de plus de toucher.',
  transport: 'Transporte jusqu\'à N unités sur l\'eau.',
  teleporting: 'En combat, se déplace d\'un bond n\'importe où sur le champ de bataille, murailles comprises.',
  thrown: 'Avant la mêlée, chaque figurine lance une arme de force N sur sa cible.',
  wallCrusher: 'Peut abattre une section des murailles d\'une cité, et les abîme en frappant.',
  siegeOnly: 'N\'attaque que les murailles et les tours : il ne combat pas les troupes.',
  weaponImmunity: 'Contre les armes ordinaires (mêlée, tirs, jets), sa défense monte à 10 au moins ; les armes magiques passent outre.',
  webSpell: 'Lance une fois par combat une Toile, gratuitement.',
  windWalking: 'Vole sur la carte et emporte toute sa pile avec lui.',
  charmed: 'Insensible aux sorts qui exigent un jet de résistance et à la terreur (résistance 50 contre la magie).',
};
// l'info-bulle d'une capacité : son nom (et sa valeur), puis ce qu'elle fait
function abilityTip(k, v) {
  const base = k.replace(/^super(.)/, (_, c) => c.toLowerCase()), t = typeof DATA !== 'undefined' && DATA.heroTalents && DATA.heroTalents[base];
  const own = ['caster', 'scouting'].includes(base) ? ABILITY_DESC[base] : null;
  const txt = own || (t && t.desc) || ABILITY_DESC[k] || ABILITY_DESC[base] || '';
  const n = typeof v === 'number' ? (k === 'lifeSteal' ? Math.abs(v) : v) : null;
  return '<h4>' + ABILITY_NAMES[k] + (n != null && k !== 'caster' ? ' ' + (k === 'toHit' ? '+' + n + ' %' : n) : '') + '</h4>' + U.esc(n != null && !U.fr() ? txt.replace(/\bN\b/g, n) : n != null ? txt.replace(/\bN (jets|unités|démons|cases)\b/g, (m, w) => n === 1 ? { jets: 'un jet', unités: 'une unité', démons: 'un démon', cases: 'une case' }[w] : n + ' ' + w).replace(/\bN\b/g, n) : txt.replace(/,? moins N/g, '').replace(/ de force N/g, '').replace(/\bN /g, ''));
}
