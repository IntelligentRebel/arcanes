'use strict';
// Combat tactique sur grille isométrique 13x13. Règles d'après Master of Magic 1.31 (implémentation kazzmir).
// Le modèle est sans interface : l'UI et l'IA appellent les mêmes actions.

const CW = 13, CH = 13;
const Combat_CHASE = 2;   // fuyards qu'un même poursuivant peut prendre en chasse
const CITY_MIN = 2, CITY_MAX = 8; // zone de la cité (murs sur sa bordure)
const DEF_SIDE = 1, ATT_SIDE = 0;
// tours de défense (ajout d'Arcanes) : aux angles latéraux de l'enceinte, de part et d'autre des portes. Chacune tire
// comme une unité d'archers (6 flèches de force 1, +10 % pour la hauteur) à la fin de chaque tour de l'assaillant.
// Seuls les sorts, les briseurs de murs et les créatures colossales en viennent à bout ; une tour abattue ouvre une brèche.
const TOWER = { hp: 20, def: 2, shots: 6, ranged: 1, toHit: 40, str: 25, spots: [[CITY_MAX, CITY_MIN], [CITY_MIN, CITY_MAX]] };
// tour du sorcier, au cœur de sa forteresse : des rayons magiques dont le nombre et la force suivent sa compétence de lancement
// (K) ; elle tire même sans garnison, et tant qu'elle tient, une forteresse vide n'est pas prise. N'importe quelle unité peut
// l'assaillir au contact. K = 20 au départ : 1 rayon de force 4, 20 PV ; K = 30 : 2 de force 5, 25 PV ; K = 50 : 3 de force 7, 35 PV.
const SPIRE = { at: [5, 5], def: 3, toHit: 30 };
// portes de l'enceinte : fermées aux assaillants tant qu'elles tiennent ; toute troupe peut les enfoncer, les briseurs de murs frappent double
const GATE = { hp: 15, def: 2, at: 5 };
// orientation sur la grille (8 directions, dans l'ordre du cercle) : sert aux attaques de flanc et de dos
const FACE_DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const faceIdx = (dc, dr) => FACE_DIRS.findIndex(d => d[0] === dc && d[1] === dr);
// (performance) distances de marche sur la grille (Battle.stepsMap, walkDist) : -1 hors d'atteinte ; at(c, r) ou get('c,r')
// rendent ce que rendait la Map d'origine (undefined pour une case non atteinte ou hors grille)
class StepGrid {
  constructor(d) { this.d = d; }
  at(c, r) { if (!(Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c < CW && r < CH)) return undefined; const v = this.d[r * CW + c]; return v < 0 ? undefined : v; }
  get(k) { const m = /^(-?\d+),(-?\d+)$/.exec(k); return m ? this.at(+m[1], +m[2]) : undefined; }
  has(k) { return this.get(k) !== undefined; }
  static at(m, c, r) { return m instanceof StepGrid ? m.at(c, r) : m.get(c + ',' + r); }
}

class Battle {
  // royaume compté par Lumière vraie et Ténèbres : celui de la créature ; l'avatar d'un sorcier compte pour son royaume dominant
  static lightRealm(u) { return Units.realmOf(u) || (u && u.avatar && u.avatar.realm) || null; }
  constructor(game, o) {
    this.game = game; this.opts = o;
    this.plane = o.plane; this.x = o.x; this.y = o.y;
    this.pids = [o.attackerPid, o.defenderPid];
    this.city = o.city || null; this.site = o.site || null;
    this.kind = this.city ? 'city' : this.site ? 'lair' : 'field';
    // niveau tactique de chaque camp : celui de l'IA du sorcier ; les monstres gardent la tactique simple ; le combat automatique du joueur a la meilleure
    this.tac = o.tac || [CombatAI.tacFor(game, o.attackerPid), CombatAI.tacFor(game, o.defenderPid)];
    this.units = [];
    this.dead = [];
    this.round = 1; this.side = DEF_SIDE; // le défenseur joue en premier
    this.log = []; this.events = [];
    this.ench = [[], []];      // enchantements de combat par camp
    this.globalEnch = [];      // effets qui touchent tout le monde
    this.globalBy = {};        // camp à l'origine de chaque effet global
    this.castThisRound = [false, false];
    this.skillLeft = [0, 0];
    this.over = false; this.winner = null; this.fled = null;
    this.walls = {}; this.hasWalls = false; this.wallOfFire = false; this.wallOfDarkness = false; this.towers = [];
    this.mud = {};
    this.terrainKey = World.terrainKey(game.world, o.plane, o.x, o.y);
    this.counterMagic = [0, 0];
    this.rng = o.rng || game.rng;
    this.nodeRealm = null;
    const t = World.terr(game.world, o.plane, o.x, o.y);
    if (NODE_REALM[t]) this.nodeRealm = NODE_REALM[t];
    if (this.site && this.site.weakGuard && !this.site.cleared) this.nodeRealm = null; // nœud assoupi près d'une capitale : pas de bonus pour ses gardiens
    // terrain : tiré au sort, ou repris tel quel (bataille rejouée)
    if (o.layout) { const L = JSON.parse(JSON.stringify(o.layout)); this.props = L.props; this.hills = L.hills; this.river = L.river; this.ford = L.ford; this.mud = L.mud || {}; this.fire = {}; }
    else this.props = this.makeProps();
    if (this.city) this.setupCity();
    this.sim = !!o.sim;
    for (const s of [0, 1]) {
      const pl = game.players[this.pids[s]];
      if (pl && pl.alive && !pl.banished && !this.sim) this.skillLeft[s] = Magic.totalSkill(game, pl);
    }
    this.deploy(o.attackers, ATT_SIDE);
    this.deploy(o.defenders, DEF_SIDE);
    this.startForce = this.forces();
    // enchantements globaux qui s'appliquent au combat
    const night = game.players.find(pl => pl && pl.alive && pl.globals.includes('eternal_night'));
    if (night && !(this.city && (Cities.hasEnch(this.city, 'heavenly_light') || (Cities.hasEnch(this.city, 'consecration') && night.id !== this.city.owner)))) { this.globalEnch.push('darkness'); const s = this.pids.indexOf(night.id); if (s >= 0) this.globalBy.darkness = s; }
    if (this.city) {
      if (Cities.hasEnch(this.city, 'heavenly_light')) this.ench[DEF_SIDE].push('true_light');
      if (Cities.hasEnch(this.city, 'cloud_of_shadow')) this.ench[DEF_SIDE].push('darkness');
    }
    this.resetMoves(DEF_SIDE); this.resetMoves(ATT_SIDE);
    this.say('Le combat commence' + (this.city ? ' devant ' + this.city.name : '') + '.');
    if (this.nodeRealm) { const rn = REALM_NAMES[this.nodeRealm].toLowerCase(); this.say('Flux d\'un nœud de ' + rn + ' : les créatures de ' + rn + ' y gagnent +2 en attaque, défense et résistance, et tout sort d\'un autre royaume risque de se dissiper (sauf pour un sorcier qui a la Maîtrise des nœuds).'); }
  }

  // terrain tactique (ajout d'Arcanes) : le décor du champ de bataille dépend de la case et de ses voisines.
  // forêt : couvert contre les tirs, ralentit, brûle ; colline : position dominante ; rochers : infranchissables ;
  // rivière : eau profonde infranchissable (sauf nageurs, volants, marche sur l'eau), deux gués qui coûtent tout le mouvement et exposent ; marais : fondrières.
  makeProps() {
    const props = {}, world = this.game.world, rng = this.rng;
    this.hills = {}; this.river = {}; this.ford = {}; this.fire = {};
    const t = World.terr(world, this.plane, this.x, this.y);
    const near = {};
    for (const [nx, ny] of World.neighbors(world, this.x, this.y)) { const k = World.terr(world, this.plane, nx, ny); near[k] = (near[k] || 0) + 1; }
    const forest = t === T.FOREST || t === T.NNODE, hilly = t === T.HILLS || t === T.MOUNTAIN || t === T.VOLCANO;
    const deployLine = (c, r) => (c + r >= 6 && c + r <= 8 || c + r >= 16 && c + r <= 21) && Math.abs(c - r) <= 6;
    const free = (c, r) => c >= 0 && r >= 0 && c < CW && r < CH && !props[c + ',' + r] && !this.hills[c + ',' + r] && !this.river[c + ',' + r] && !(this.city && c >= CITY_MIN - 1 && c <= CITY_MAX + 1 && r >= CITY_MIN - 1 && r <= CITY_MAX + 1);
    const spot = (avoidDeploy = true) => { for (let k = 0; k < 40; k++) { const c = rng.int(CW), r = rng.int(CH); if (free(c, r) && !(avoidDeploy && deployLine(c, r))) return [c, r]; } return null; };
    // rivière : une bande en travers du champ, entre les deux armées
    if (t === T.RIVER && !this.city) {
      let r0 = 12 - rng.int(2);
      for (let c = 0; c < CW; c++) {
        const r = r0 - c; if (r >= 0 && r < CH) this.river[c + ',' + r] = true;
        const prev = r0;
        if (rng.chance(0.35)) r0 += rng.chance(0.5) ? 1 : -1; r0 = U.clamp(r0, 11, 13);
        // la bande recule d'un cran : une case de plus bouche le passage qui s'ouvrirait entre les deux colonnes
        if (r0 < prev && c + 1 < CW) { const r2 = prev - (c + 1); if (r2 >= 0 && r2 < CH) this.river[(c + 1) + ',' + r2] = true; }
      }
      // deux gués, l'un de chaque côté du centre (dans une colonne où l'eau n'a qu'une case, pour qu'on y passe vraiment)
      const perCol = {}; for (const k of Object.keys(this.river)) { const c = +k.split(',')[0]; perCol[c] = (perCol[c] || 0) + 1; }
      const cells = Object.keys(this.river).map(k => k.split(',').map(Number)).filter(([c]) => perCol[c] === 1);
      for (const want of [3 + rng.int(2), 8 + rng.int(2)]) {
        const cell = U.min(cells.filter(x => !this.ford[x.join(',')]), ([c]) => Math.abs(c - want));
        if (cell) this.ford[cell[0] + ',' + cell[1]] = true;
      }
    }
    // collines : un ou deux tertres
    const nh = hilly ? 4 + rng.int(3) : (near[T.HILLS] || 0) + (near[T.MOUNTAIN] || 0) >= 2 ? 1 + rng.int(2) : 0;
    for (let i = 0; i < nh; i++) {
      const p = spot(false); if (!p) break;
      this.hills[p[0] + ',' + p[1]] = true;
      if (rng.chance(0.6)) { const d = rng.pick(U.DIRS8); if (free(p[0] + d[0], p[1] + d[1])) this.hills[(p[0] + d[0]) + ',' + (p[1] + d[1])] = true; }
    }
    // arbres, en bosquets
    const groves = forest ? 3 + rng.int(2) : (near[T.FOREST] || 0) >= 2 ? 1 + rng.int(2) : t === T.SWAMP ? rng.int(2) : 0;
    for (let i = 0; i < groves; i++) {
      const seed = spot(); if (!seed) break;
      const size = forest ? 3 + rng.int(3) : 2 + rng.int(2);
      props[seed[0] + ',' + seed[1]] = { kind: 'tree', v: rng.int(8) };
      for (let j = 1; j < size; j++) {
        for (let k = 0; k < 8; k++) {
          const c = seed[0] + rng.int(3) - 1, r = seed[1] + rng.int(3) - 1;
          if (free(c, r) && !deployLine(c, r)) { props[c + ',' + r] = { kind: 'tree', v: rng.int(8) }; break; }
        }
      }
    }
    // rochers isolés, infranchissables
    const nr = t === T.MOUNTAIN ? 4 + rng.int(3) : t === T.DESERT ? 2 + rng.int(2) : t === T.HILLS || t === T.VOLCANO ? 1 + rng.int(2) : rng.int(2);
    for (let i = 0; i < nr; i++) {
      const p = spot(); if (!p) break;
      if (U.DIRS8.some(([dc, dr]) => props[(p[0] + dc) + ',' + (p[1] + dr)] && props[(p[0] + dc) + ',' + (p[1] + dr)].kind === 'rock')) continue;
      props[p[0] + ',' + p[1]] = { kind: 'rock', v: rng.int(8) };
    }
    // marais : fondrières
    if (t === T.SWAMP) for (let i = 0; i < 4 + rng.int(4); i++) { const p = spot(); if (p) this.mud[p[0] + ',' + p[1]] = true; }
    // buissons : simple décor
    const nb = forest ? 2 : 3 + rng.int(4);
    for (let i = 0; i < nb; i++) { const p = spot(); if (p) props[p[0] + ',' + p[1]] = { kind: 'bush', v: rng.int(8) }; }
    return props;
  }
  tree(c, r) { const p = this.props[c + ',' + r]; return !!p && p.kind === 'tree'; }
  rock(c, r) { const p = this.props[c + ',' + r]; return !!p && p.kind === 'rock'; }
  hill(c, r) { return !!this.hills && !!this.hills[c + ',' + r]; }
  inRiver(c, r) { return !!this.river && !!this.river[c + ',' + r]; }
  isFord(c, r) { return !!this.ford && !!this.ford[c + ',' + r]; }
  deep(c, r) { return this.inRiver(c, r) && !this.isFord(c, r); }
  // un pas en diagonale entre deux cases d'eau profonde : on ne passe pas la rivière par le coin
  cutsDeep(c, r, dc, dr) { return !!(dc && dr) && this.deep(c + dc, r) && this.deep(c, r + dr); }
  // l'eau profonde n'arrête ni les volants, ni les nageurs, ni ceux qui marchent sur l'eau
  wades(s) { return !!(s.flying || s.swimming || s.ab.waterWalking); }
  blocked(c, r) { return this.rock(c, r) || this.deep(c, r) || !!this.towerAt(c, r); }
  // effets de la case, pour l'interface
  terrainNotes(c, r) {
    const out = [], k = c + ',' + r;
    if (this.fire && this.fire[k]) out.push('En flammes : 3 de dégâts de feu par round à qui s\'y tient');
    if (this.tree(c, r)) out.push('Forêt : +2 défense contre les tirs ; y entrer coûte 1,5 mouvement ; le feu s\'y propage');
    if (this.hill(c, r)) out.push('Colline : +10 % pour toucher à distance, +1 défense en mêlée ; y monter coûte 1,5 mouvement');
    if (this.rock(c, r)) out.push('Rochers : infranchissables');
    if (this.deep(c, r)) out.push('Eau profonde : infranchissable, sauf pour les unités qui volent, nagent ou marchent sur l\'eau');
    else if (this.inRiver(c, r)) out.push('Gué : y entrer coûte tout le mouvement (pas aux nageurs), -1 défense dans l\'eau');
    if (this.mud[k]) out.push('Fondrière : y entrer coûte tout le mouvement');
    if (this.onRampart(c, r)) out.push(this.walls[k].gate ? 'Porte : fermée à l\'assaillant' : 'Chemin de ronde : les tireurs y visent mieux et plus loin ; les créneaux protègent des tirs (+2 en défense)');
    if (this.wallOfFire && this.walls[k]) out.push('Mur de feu : un assaillant qui le franchit subit une attaque de feu de force 5 (pas les volants ; les défenseurs passent librement)');
    if (this.props[k] && this.props[k].kind === 'stump') out.push('Souches calcinées : plus de couvert');
    return out;
  }
  // le feu prend dans un bosquet
  ignite(c, r) {
    const k = c + ',' + r;
    if (!this.tree(c, r) || this.fire[k]) return false;
    this.fire[k] = 3;
    this.ev({ type: 'fx', fx: 'fire', at: [c, r] });
    return true;
  }
  burnTick() {
    const keys = Object.keys(this.fire || {}); if (!keys.length) return;
    const spread = [];
    for (const k of keys) {
      const [c, r] = k.split(',').map(Number);
      const b = this.unitAt(c, r);
      if (b && !this.stats(b).flying) { const d = this.applyArea(b, 3, 'fire', 'chaos'); if (d) this.say(this.subj(b, 'est pris') + ' dans les flammes (' + d + ').'); this.checkDeath(b); }
      for (const [dc, dr] of U.DIRS8) if (this.tree(c + dc, r + dr) && !this.fire[(c + dc) + ',' + (r + dr)] && this.rng.chance(0.3)) spread.push([c + dc, r + dr]);
      this.ev({ type: 'fx', fx: 'fire', at: [c, r] });
      if (--this.fire[k] <= 0) { delete this.fire[k]; this.props[k] = { kind: 'stump', v: this.props[k] ? this.props[k].v : 0 }; }
    }
    let n = 0; for (const [c, r] of spread) if (this.ignite(c, r)) n++;
    if (n) this.say('Le feu gagne ' + (n > 1 ? n + ' bosquets voisins' : 'un bosquet voisin') + '.');
  }

  setupCity() {
    const c = this.city;
    const walls = c.buildings.cityWalls || Cities.hasEnch(c, 'wall_of_stone');
    this.hasWalls = !!walls;
    this.wallOfFire = Cities.hasEnch(c, 'wall_of_fire');
    this.wallOfDarkness = Cities.hasEnch(c, 'wall_of_darkness');
    for (let r = CITY_MIN; r <= CITY_MAX; r++) for (let q = CITY_MIN; q <= CITY_MAX; q++) {
      if (q === CITY_MIN || q === CITY_MAX || r === CITY_MIN || r === CITY_MAX) {
        const gate = (q === CITY_MAX && r === GATE.at) || (r === CITY_MAX && q === GATE.at);
        this.walls[q + ',' + r] = { gate, broken: false };
      }
    }
    if (this.hasWalls) for (const k in this.walls) if (this.walls[k].gate) {
      const [q, r] = k.split(',').map(Number);
      this.towers.push({ id: 'gate:' + k, tower: true, kind: 'gate', c: q, r, side: DEF_SIDE, hp: GATE.hp, maxHp: GATE.hp, def: GATE.def, shots: 0, ranged: 0, toHit: 0, magic: false, realm: null, str: 0, dead: false });
    }
    if (this.hasWalls && c.buildings.defenseTowers) TOWER.spots.forEach(([q, r], i) => this.towers.push({ id: 'tower' + i, tower: true, kind: 'stone', c: q, r, side: DEF_SIDE,
      hp: TOWER.hp, maxHp: TOWER.hp, def: TOWER.def, shots: TOWER.shots, ranged: TOWER.ranged, toHit: TOWER.toHit, magic: false, realm: null, str: TOWER.str, dead: false }));
    const sp = Battle.spire(this.game, c);
    if (sp) this.towers.push(Object.assign({ id: 'spire', tower: true, kind: 'spire', c: SPIRE.at[0], r: SPIRE.at[1], side: DEF_SIDE, dead: false }, sp));
    // bâtiments : décor
    this.buildings = [];
    const list = Object.keys(c.buildings).filter(b => DATA.buildings[b] && b !== 'defenseTowers');
    let i = 0;
    for (let r = CITY_MIN + 1; r <= CITY_MAX - 1; r++) for (let q = CITY_MIN + 1; q <= CITY_MAX - 1; q++) {
      // rien sur la case de la tour du sorcier, ni juste devant elle
      if ((q + r) % 2 === 0 && i < list.length + 3 && !this.towers.some(t => t.kind === 'spire' && t.c <= q && t.r <= r && q - t.c <= 1 && r - t.r <= 1)) this.buildings.push({ c: q, r, b: list[i++] || 'house' });
    }
  }

  // point de ralliement d'un camp quand sa case prévue est prise
  home(side) { return side === DEF_SIDE ? (this.city ? [5, 5] : [3, 3]) : this.city ? [10, 10] : [9, 9]; }
  inCity(c, r) { return !!this.city && c >= CITY_MIN && c <= CITY_MAX && r >= CITY_MIN && r <= CITY_MAX; }
  // une brèche est ouverte : un pan de muraille ou la porte abattus (ou pas de muraille du tout)
  breached() { return !this.hasWalls || Object.values(this.walls).some(w => w.broken); }
  // garder jusqu'à la brèche : l'unité reste en place tant que la muraille tient et qu'aucun ennemi n'est à son contact
  // se mettre en garde : l'unité passe le reste de son tour ; un fantassin qui n'a pas frappé gagne +1 en défense jusqu'à son prochain tour
  guard(b) {
    if (!b || b.dead) return false;
    b.moves = 0;
    if (!b.struck && Units.isInfantry(b.u)) b.guarding = true;
    return true;
  }
  // charge d'une troupe montée qui s'est déplacée avant de frapper : +1 en attaque après une case, +2 après deux ou plus ;
  // pas à travers une muraille, et les piquiers (qui annulent la frappe en premier) la brisent
  chargeOf(a, d) {
    if (!(a.movedTiles > 0) || !Units.isMounted(a.u)) return 0;
    if (this.hasWalls && this.crossesWall(a.c, a.r, d.c, d.r)) return 0;
    if (this.stats(d).ab.negateFirstStrike) return 0;
    return a.movedTiles >= 2 ? 2 : 1;
  }
  holdWakes(b) { return this.breached() || this.alive(1 - b.side).some(f => this.dist(b, f) <= 1 && !this.isInvisible(f)); }
  // chemin de ronde : une case de muraille (ou de porte) encore debout, sur laquelle on se tient en hauteur
  onRampart(c, r) { if (!this.hasWalls) return false; const w = this.walls[c + ',' + r]; return !!w && !w.broken; }
  // traverser la bordure de la cité entre (a) et (b) ?
  crossesWall(ac, ar, bc, br) { return this.inCity(ac, ar) !== this.inCity(bc, br); }
  wallBlocks(bu, ac, ar, bc, br) {
    if (!this.hasWalls || !this.crossesWall(ac, ar, bc, br)) return false;
    const st = this.stats(bu);
    if (st.flying || st.ab.teleporting || st.ab.merging || st.ab.nonCorporeal) return false;
    const inside = this.inCity(ac, ar) ? [ac, ar] : [bc, br];
    const w = this.walls[inside[0] + ',' + inside[1]];
    if (!w || w.broken) return false;
    // la porte s'ouvre pour la garnison ; l'assaillant ne la franchit pas pour entrer, mais celui qui est déjà dedans peut en ressortir
    if (w.gate) return bu.side === ATT_SIDE && !this.inCity(ac, ar);
    return true;
  }

  addUnit(u, side, i, n, opts = {}) {
    let pos = opts.pos || this.startPos(side, i, n);
    if (!pos || this.unitAt(pos[0], pos[1]) || this.blocked(pos[0], pos[1])) pos = this.freeTileNear(this.home(side));
    const st = Units.stats(this.game, u);
    const bu = {
      u, side, c: pos[0], r: pos[1], moves: 0, ammo: st.ammo, casterMana: st.caster, dead: false,
      temp: !!opts.temp, tempEnch: [], curses: [], attacked: 0, asleep: false, confused: false, web: 0,
      usedAbility: {}, facing: side === DEF_SIDE ? 'down' : 'up', id: u.id, startDmg: u.dmg,
      undeadDmg: 0, irrDmg: 0, killedBy: null, invisible: false, possessed: false, stasis: !!u.stasis,
    };
    this.units.push(bu);
    return bu;
  }
  // déploiement en deux lignes face à face : mêlée devant, tireurs et lanceurs derrière
  deploy(list, side) {
    const slots = this.deploySlots(side);
    const front = slots.front.slice(), back = slots.back.slice();
    const walled = side === DEF_SIDE && this.city && this.hasWalls;
    const isBack = u => { const st = Units.stats(this.game, u); return walled ? st.ranged > 0 && !!st.rangedType : (st.ranged > 0 && st.rangedType !== 'none') || (st.melee === 0); };
    const order = list.map((u, i) => ({ u, i, back: isBack(u) }));
    const pos = new Map();
    for (const o of order) if (!o.back) pos.set(o, front.shift() || back.shift() || null);
    for (const o of order) if (o.back) pos.set(o, back.shift() || front.shift() || null);
    for (const o of order) this.addUnit(o.u, side, o.i, list.length, { pos: pos.get(o) });
  }
  deploySlots(side) {
    if (side === DEF_SIDE && this.city) {
      // la mêlée se masse derrière les portes et le saillant, prête à boucher une brèche ; les suivants reculent vers le centre
      const front = [[7, 5], [5, 7], [6, 6], [7, 6], [6, 7], [7, 7], [6, 5], [5, 6], [7, 4], [4, 7], [5, 5], [6, 4], [4, 6], [5, 4], [4, 5], [7, 3], [3, 7]].filter(([c, r]) => !this.towerAt(c, r));
      // derrière des murailles, les tireurs prennent position sur le chemin de ronde, face à l'assaillant (les portes restent libres)
      const back = this.hasWalls ? [[CITY_MAX, 6], [6, CITY_MAX], [CITY_MAX, 4], [4, CITY_MAX], [CITY_MAX, 7], [7, CITY_MAX], [CITY_MAX, 3], [3, CITY_MAX], [CITY_MAX, CITY_MAX]].filter(([c, r]) => !this.towerAt(c, r)) : [];
      return { front, back };
    }
    // lignes de c+r constant = lignes horizontales à l'écran
    const line = (sum, n) => {
      const out = [];
      for (let c = 0; c < CW; c++) { const r = sum - c; if (r >= 0 && r < CH) out.push([c, r]); }
      out.sort((a, b) => Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]) || a[0] - b[0]);
      return out.slice(0, n);
    };
    if (side === DEF_SIDE) return { front: line(8, 5), back: line(7, 4).concat(line(6, 3)) };
    // devant une cité, l'assaillant se déploie hors de portée immédiate des remparts
    if (this.city) return { front: line(19, 5), back: line(20, 5).concat(line(21, 4)) };
    return { front: line(16, 5), back: line(17, 4).concat(line(18, 3)) };
  }
  startPos(side, i, n) {
    const s = this.deploySlots(side); const all = s.front.concat(s.back);
    return all[i] || null;
  }
  freeTileNear([c0, r0]) {
    for (let d = 0; d < 11; d++) for (let dc = -d; dc <= d; dc++) for (let dr = -d; dr <= d; dr++) {
      const c = c0 + dc, r = r0 + dr; if (c < 0 || r < 0 || c >= CW || r >= CH) continue;
      if (!this.unitAt(c, r) && !this.blocked(c, r)) return [c, r];
    }
    return [0, 0];
  }

  alive(side) { return this.units.filter(b => !b.dead && (side == null || b.side === side)); }
  unitAt(c, r) { return this.units.find(b => !b.dead && b.c === c && b.r === r) || null; }
  say(t) { this.log.push(t); if (this.log.length > 200) this.log.shift(); }
  ev(e) { this.events.push(e); }
  owner(side) { return this.pids[side]; }
  player(side) { return this.game.players[this.pids[side]]; }
  name(b) { return Units.label(b.u); }
  subj(b, phrase) { return Units.subj(b.u, phrase); }
  dist(a, b) { return Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r)); }

  // ---------- statistiques en combat ----------
  effUnit(b) {
    if (!b.tempEnch.length) return b.u;
    return Object.assign({}, b.u, { ench: b.u.ench.concat(b.tempEnch) });
  }
  // stats hors combat de l'unité, enchantements temporaires compris (comme Units.stats(effUnit(b)), mémorisées : lecture seule)
  ust(b) { const x = b.tempEnch; return x.length ? Units._st(this.game, b.u, b, x) : Units._st(this.game, b.u, null, null); }
  stats(b) {
    const s = { ...this.ust(b) };
    if (b.grounded || b.asleep) s.flying = false;   // cloué au sol par une toile (tout le combat), ou endormi
    const side = b.side, foe = 1 - side;
    const realm = Units.realmOf(b.u);
    const add = (m, d, r) => { if (s.melee > 0) s.melee += m; if (s.ranged > 0 && s.rangedType !== 'magic') s.ranged += m; s.def += d; s.res += r; };
    // (performance) aucun enchantement de combat d'un camp ni effet global : aucun des sorts ci-dessous ne joue (has serait toujours faux)
    const anyEnch = this.ench[side].length || this.ench[foe].length || this.globalEnch.length;
    const has = (sp, sd) => this.ench[sd].includes(sp) || this.globalEnch.includes(sp);
    if (anyEnch) {
    // la Grande Prière contient la Prière : les deux ne se cumulent pas (MoM)
    if (has('high_prayer', side)) { add(2, 2, 3); s.toHit += 10; s.toDefend += 10; }
    else if (has('prayer', side)) { s.toHit += 10; s.toDefend += 10; s.res += 1; }
    const righteous = b.u.ench.includes('righteousness') || b.tempEnch.includes('righteousness');   // Droiture : insensible aux sorts de mort et de chaos
    if (has('black_prayer', foe) && !righteous) add(-1, -1, -2);
    // (l'avatar d'un sorcier y compte comme une créature de son royaume dominant, pour ces deux sorts seulement)
    // (Battle.lightRealm(b.u), le royaume déjà relevé repris)
    const lr = realm || (b.u && b.u.avatar && b.u.avatar.realm) || null;
    if (has('true_light', side) || has('true_light', foe) || this.globalEnch.includes('true_light')) { if (lr === 'life') add(1, 1, 1); if (lr === 'death') add(-1, -1, -1); }
    if (has('darkness', side) || has('darkness', foe)) { if (lr === 'death') add(1, 1, 1); if (lr === 'life' && !righteous) add(-1, -1, -1); }
    if ((has('warp_reality', side) || has('warp_reality', foe)) && realm !== 'chaos' && !righteous) s.toHit -= 20;
    if (has('metal_fires', side) && Units.isNormal(b.u) && !b.u.ench.includes('flame_blade') && !b.tempEnch.includes('flame_blade')) { if (s.melee) s.melee += 1; if (s.ranged && s.rangedType !== 'magic') s.ranged += 1; s.magicWeapon = true; }
    if (has('entangle', foe) && !s.flying && !s.ab.nonCorporeal) s.move = Math.max(0, s.move - 1);
    }
    // aura sacrée et commandement des héros
    // (l'aura sacrée et la résistance à tout profitent aussi à l'unité qui les porte)
    let holy = Number(s.ab.holyBonus) || 0, resAll = Number(s.ab.resistanceToAll) || 0, lead = 0, pray = 0;
    const AU = Battle.auraSources();
    for (const o of this.units) if (!o.dead && o.side === side && o !== b) {
      // (performance) une unité ordinaire sans aura ni enchantement qui en donne n'apporte rien ici : inutile de relever ses capacités
      const ou = o.u;
      if (!ou.hero && !ou.avatar && !ou.items && DATA.units[ou.type] && !AU.types.has(ou.type) && (!AU.spells.size || !Battle._anyIn(ou.ench, AU.spells))) continue;
      const os = Units.abilities(this.game, o.u);
      if (os.holyBonus) holy = Math.max(holy, Number(os.holyBonus));
      if (os.resistanceToAll) resAll = Math.max(resAll, Number(os.resistanceToAll));
      if (o.u.hero) {
        const L = Units.levelIndex(this.game, o.u) + 1;
        if (os.superLeadership) lead = Math.max(lead, Math.floor(L / 2)); else if (os.leadership) lead = Math.max(lead, Math.floor(L / 3));
        if (os.superPrayermaster) pray = Math.max(pray, Math.floor(L * 1.5)); else if (os.prayermaster) pray = Math.max(pray, L);
      }
    }
    if (holy) add(holy, holy, holy);
    if (lead && Units.isNormal(b.u)) { if (s.melee) s.melee += lead; if (s.ranged && s.rangedType !== 'magic') s.ranged += Math.floor(lead / 2); }
    s.res += pray + resAll;
    // nœud : les créatures du royaume du nœud sont renforcées
    if (this.nodeRealm && realm === this.nodeRealm && Units.isFantastic(b.u)) add(2, 2, 2);
    // malédictions
    for (const cu of b.curses) {
      if (cu === 'weakness') { s.melee = Math.max(0, s.melee - 2); if (s.rangedType !== 'magic') s.ranged = Math.max(0, s.ranged - 2); s.thrown = Math.max(0, s.thrown - 2); }
      if (cu === 'vertigo') { s.toHit -= 20; s.def -= 1; }
      if (cu === 'mind_storm') { s.melee = Math.max(0, s.melee - 5); s.ranged = Math.max(0, s.ranged - 5); s.thrown = Math.max(0, s.thrown - 5); s.def -= 5; s.res -= 5; }
      if (cu === 'shatter') { if (s.melee) s.melee = 1; if (s.ranged && s.rangedType !== 'magic') s.ranged = 1; if (s.thrown) s.thrown = 1; }
      if (cu === 'warp_creature_melee') s.melee = Math.floor(s.melee / 2);
      if (cu === 'warp_creature_def') s.def = Math.floor(s.def / 2);
      if (cu === 'warp_creature_res') s.res = 0;
    }
    if (b.tempEnch.includes('berserk') || b.u.ench.includes('berserk')) { s.melee *= 2; s.def = 0; s.berserk = true; }
    // l'invisibilité se recalcule : un enchantement dissipé la fait perdre
    b.invisible = !!(s.ab.invisibility || b.u.ench.includes('invisibility') || b.tempEnch.includes('invisibility') || (anyEnch && has('mass_invisibility', side)));
    // en garde : un fantassin qui a passé son tour sans frapper, prêt à recevoir l'ennemi (+1 défense jusqu'à son prochain tour)
    if (b.guarding && !s.berserk) s.def += 1;
    s.def = Math.max(0, s.def); s.res = Math.max(0, s.res);
    if (!s.flying) {
      const k = b.c + ',' + b.r;
      if (!s.ab.nonCorporeal && this.mud[k]) s.move = Math.min(s.move, 0.5);   // la boue ralentit, sans lever un Enchevêtrement
      if (!s.swimming && this.river && this.river[k]) s.def = Math.max(0, s.def - 1);
    }
    return s;
  }
  // les sources d'aura (aura sacrée, résistance à tout) d'une unité ordinaire : son type, ou un enchantement qui donne la capacité
  // (relevées une fois dans les données, qui ne changent pas en cours de partie)
  static _anyIn(arr, set) { for (const e of arr) if (set.has(e)) return true; return false; }
  static auraSources() {
    if (Battle._aura) return Battle._aura;
    const keys = ['holyBonus', 'resistanceToAll'], types = new Set(), spells = new Set();
    for (const t in DATA.units) { const ab = DATA.units[t].abilities; if (ab && keys.some(k => ab[k])) types.add(t); }
    for (const id in DATA.spells) { const p = DATA.spells[id].params, a = p && p.ability; if (a && (Array.isArray(a) ? a : [a]).some(k => keys.includes(k))) spells.add(id); }
    return (Battle._aura = { types, spells });
  }
  resFor(b, realm, s) {
    s = s || this.stats(b);
    let res = s.res;
    const ench = b.u.ench.concat(b.tempEnch);
    for (const e of ench) {
      const sp = DATA.spells[e]; if (!sp || !sp.params || !sp.params.vs) continue;
      if (sp.params.vs.includes(realm)) res += sp.params.res || 0;
    }
    if (ench.includes('righteousness') && (realm === 'death' || realm === 'chaos')) res = 50;
    if (s.ab.magicImmunity || (s.ab.charmed && realm)) res = 50;   // Charmé : contre les sorts, pas contre le poison
    if (realm === 'death' && s.ab.deathImmunity) res = 50;
    return res;
  }
  // défense effective contre un type de dégâts
  defFor(b, kind, realm, mods, s) {
    s = s || this.stats(b);
    if (b.asleep) return 0;
    let d = s.def;
    const ench = b.u.ench.concat(b.tempEnch);
    if (realm) for (const e of ench) { const sp = DATA.spells[e]; if (sp && sp.params && sp.params.vs && sp.params.vs.includes(realm)) d += sp.params.def || 0; }
    let immune = false;
    const ranged = kind === 'missile' || kind === 'boulder' || kind === 'magic' || kind === 'fire' || kind === 'cold' || kind === 'lightning' || kind === 'thrown';
    if (ranged && s.ab.largeShield) d += 2;
    if ((kind === 'missile' || kind === 'boulder' || kind === 'thrown') && this.tree(b.c, b.r)) d += 2;   // couvert des arbres
    if (kind === 'melee' && this.hill(b.c, b.r)) d += 1;                                                    // position dominante
    if (mods && mods.pierce) d = Math.max(0, d - mods.pierce);   // précision au-delà de 100 % : les coups trouvent le défaut de l'armure
    if (mods && mods.rear && (kind === 'melee' || kind === 'thrown')) d = Math.floor(d / 2);   // frappé dans le dos : la moitié de la défense
    if (kind === 'missile' && s.ab.missileImmunity) immune = true;
    if ((kind === 'magic' || kind === 'fire' || kind === 'cold' || kind === 'lightning') && s.ab.magicImmunity) immune = true;
    if (kind === 'fire' && s.ab.fireImmunity) immune = true;
    if (kind === 'cold' && s.ab.coldImmunity) immune = true;
    if ((realm === 'death' || realm === 'chaos') && ench.includes('righteousness')) immune = true;
    if ((kind === 'melee' || kind === 'missile' || kind === 'thrown' || kind === 'boulder') && s.ab.weaponImmunity && !(mods && mods.magicWeapon)) d = Math.max(d, 10);
    if (mods && mods.armorPiercing) d = Math.floor(d / 2);
    if (mods && mods.wallDef && (kind === 'melee' || kind === 'missile' || kind === 'magic' || kind === 'boulder')) d += mods.wallDef;
    if (s.berserk) d = 0;   // Berserk : plus aucune défense, quels que soient les bonus (les immunités restent)
    if (immune) d = 50;
    if (mods && mods.illusion && !s.ab.illusionsImmunity) d = 0;
    return d;
  }
  toDefend(b, mods, s) {
    s = s || this.stats(b);
    let td = s.toDefend;
    if (mods && mods.eldritch) td -= 10;
    return Math.max(0, td);
  }
  figures(b) { const s = this.ust(b); const h = s.maxHp - b.u.dmg; return Math.max(0, Math.ceil(h / s.hp)); }
  hp(b) { const s = this.ust(b); return Math.max(0, s.maxHp - b.u.dmg); }
  leadHp(b) { const s = this.ust(b); const h = s.maxHp - b.u.dmg; if (h <= 0) return 0; const r = h % s.hp; return r === 0 ? s.hp : r; }

  takeDamage(b, n, type, by) {
    if (n <= 0 || b.dead) return 0;
    const before = this.hp(b);
    n = Math.min(n, before);
    b.u.dmg += n;
    if (type === 'undead') b.undeadDmg += n; else if (type === 'irreversible') b.irrDmg += n; else b.normDmg = (b.normDmg || 0) + n;
    if (by) b.lastHitBy = by;
    return n;
  }
  // soins : jamais au-delà des dégâts irréversibles (pétrification, désintégration…)
  heal(b, n) { if (!(n > 0) || !(b.u.dmg > 0)) return 0; const floor = Math.min(b.u.dmg, b.irrDmg || 0), before = b.u.dmg; b.u.dmg = Math.max(floor, b.u.dmg - n); return before - b.u.dmg; }
  // (comme stats(b), dont c'est le seul effet : l'invisibilité ne dépend que des capacités hors combat et des enchantements)
  isInvisible(b) { const ab = this.ust(b).ab; b.invisible = !!(ab.invisibility || b.u.ench.includes('invisibility') || b.tempEnch.includes('invisibility') || this.ench[b.side].includes('mass_invisibility') || this.globalEnch.includes('mass_invisibility')); return !!b.invisible; }
  refreshInvisible() { for (const b of this.alive()) this.stats(b); }
  invulnReduce(b, dmg) { const e = b.u.ench.concat(b.tempEnch); if (e.includes('invulnerability')) return Math.max(0, dmg - 2); return dmg; }
  blurReduce(b, dmg) { if (!this.ench[b.side].includes('blur')) return dmg; let out = 0; for (let i = 0; i < dmg; i++) if (!this.rng.chance(0.1)) out++; return out; }

  // dégâts « en cascade » figurine par figurine (règle originale)
  applyRolls(target, rolls, kind, realm, mods, by) {
    if (kind === 'fire' && this.ignite(target.c, target.r)) this.say('Le bosquet s\'embrase !');
    const s = this.stats(target);
    if ((kind === 'magic' || kind === 'fire' || kind === 'cold' || kind === 'lightning') && s.ab.magicImmunity) return 0;
    let taken = 0;
    for (let dmg of rolls) {
      dmg = this.blurReduce(target, this.invulnReduce(target, dmg));
      while (dmg > 0 && this.hp(target) > 0) {
        const defense = this.rng.rolls(this.defFor(target, kind, realm, mods, s), this.toDefend(target, mods, s));
        dmg -= defense;
        if (dmg > 0) {
          const take = Math.min(this.leadHp(target), dmg);
          taken += this.takeDamage(target, take, mods && mods.damageType || 'normal', by);
          dmg -= take;
        }
      }
    }
    return taken;
  }
  // dégâts de zone : chaque figurine bloque séparément (boule de feu, immolation...)
  applyArea(target, strength, kind, realm, mods, by) {
    if ((kind === 'fire' || kind === 'immolation') && this.ignite(target.c, target.r)) this.say('Le bosquet s\'embrase !');
    const s = this.stats(target);
    if (kind === 'immolation' && (s.ab.magicImmunity || (target.u.ench.concat(target.tempEnch)).includes('righteousness'))) return 0;
    const hpPer = s.hp;
    let total = 0;
    const figs = this.figures(target);
    for (let i = 0; i < figs; i++) {
      const dmg = this.rng.rolls(strength, 30);
      const kd = kind === 'immolation' ? (s.ab.fireImmunity ? 'fireImmune' : 'fire') : kind;
      const def = kd === 'fireImmune' ? 50 : this.defFor(target, kd === 'immolation' ? 'fire' : kd, realm || 'chaos', mods, s);
      const blocked = this.rng.rolls(def, this.toDefend(target, mods, s));
      const fd = this.invulnReduce(target, Math.min(dmg - blocked, hpPer));
      if (fd > 0) total += fd;
    }
    return this.takeDamage(target, Math.min(total, this.hp(target)), 'normal', by);
  }
  resistFails(b, realm, mod, perFigure) {
    const res = this.resFor(b, realm);
    if (res >= 50) return 0;
    const n = perFigure ? this.figures(b) : 1;
    let fails = 0;
    for (let i = 0; i < n; i++) if (this.rng.int(10) + 1 > res - mod) fails++;
    return fails;
  }

  // ---------- mouvement ----------
  resetMoves(side) {
    // Terreur adverse : chaque unité doit résister (+1) ou rester figée de peur ce tour-ci (elle riposte encore)
    const terror = this.ench[1 - side].includes('terror');
    let frozen = 0;
    for (const b of this.alive(side)) {
      const s = this.stats(b);
      b.maxMoves = Math.max(1, s.move) * 2;
      b.moves = b.asleep || b.web > 0 || b.stasis ? 0 : b.maxMoves;   // figée en stase : ni mouvement ni attaque
      // prise dans une toile : elle passe son propre tour à la déchirer (autant de points que sa mêlée × 2)
      if (b.web > 0) b.web = Math.max(0, b.web - (s.melee || 1) * 2);
      b.entangled = s.move <= 0; if (b.entangled) b.moves = 0;   // Enchevêtrement : à 0, plus de mouvement ni d'attaque
      b.attacked = 0; b.acted = false; b.castThisTurn = false; b.kited = false; b.posted = false; b.retreated = false;
      b.guarding = false; b.struck = false; b.movedTiles = 0;
      b.feared = false;
      if (terror && b.moves > 0 && this.resistFails(b, 'death', -1, false)) { b.moves = 0; b.feared = true; frozen++; }
      // en garde jusqu'à la brèche : elle passe son tour, sauf si la muraille est tombée ou qu'un ennemi est au contact
      b.holdSkipped = false;
      if (b.holdBreach) { if (this.holdWakes(b)) b.holdBreach = false; else if (b.moves > 0) { b.moves = 0; b.holdSkipped = true; if (Units.isInfantry(b.u)) b.guarding = true; } }
    }
    if (frozen) {
      const fz = this.alive(side).filter(b => b.feared), cnt = {};
      for (const b of fz) cnt[this.name(b)] = (cnt[this.name(b)] || 0) + 1;
      const names = Object.keys(cnt).map(k => cnt[k] > 1 ? k + ' (×' + cnt[k] + ')' : k);
      this.say(fz.length > 3 ? frozen + ' unités sont figées par la terreur.' : names.join(', ') + (frozen > 1 || Units.plural(fz[0].u) ? ' sont figés' : ' est figé') + ' par la terreur.');
    }
    this.castThisRound[side] = false;
    // confusion : l'unité reste plantée, erre au hasard ou frappe au hasard, sans qu'on la commande
    if (this.side === side) for (const b of this.alive(side)) if (b.confused && b.moves > 0 && !this.over) this.confusedTurn(b);
  }
  confusedTurn(b) {
    let r = this.rng.int(3);
    if (r === 1) { const rch = this.reachable(b), opts = [...rch.values()]; if (opts.length) { const n = this.rng.pick(opts); this.moveUnit(b, n.c, n.r, rch); } else r = 0; }
    else if (r === 2) { const near = this.alive().filter(o => o !== b && this.canMelee(b, o, true)); if (near.length) this.melee(b, this.rng.pick(near), true); else r = 0; }   // alliés compris
    this.say(this.subj(b, ['est cloué sur place', 'erre au hasard', 'frappe au hasard'][r]) + ', confus.');
    b.moves = 0;
  }
  // au contact d'un ennemi (un volant qu'on ne peut pas frapper, au-dessus de soi, n'empêche pas de tirer)
  enemyAdjacent(b) { return this.alive(1 - b.side).some(o => this.dist(o, b) === 1 && !this.wallApart(b, o) && !this.outOfReach(b, o)); }
  // deux unités voisines de part et d'autre d'une muraille (ou d'une porte) debout ne sont pas au contact
  wallApart(a, o) {
    if (!this.hasWalls || !this.crossesWall(a.c, a.r, o.c, o.r)) return false;
    const inside = this.inCity(a.c, a.r) ? a : o, w = this.walls[inside.c + ',' + inside.r];
    return !!w && !w.broken && !this.stats(a).flying && !this.stats(o).flying;
  }
  canSee(b, o) {
    if (!this.isInvisible(o)) return true;
    const s = this.stats(b); if (s.ab.illusionsImmunity) return true;
    return this.dist(b, o) <= 1;
  }

  reachable(b) {
    // Dijkstra sur la grille (8 directions) avec coût 2 demi-points par case
    const out = new Map();
    if (b.moves <= 0) return out;
    const s = this.stats(b);
    const start = b.c + ',' + b.r;
    if (s.ab.teleporting || s.ab.merging) {
      for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) {
        if ((c === b.c && r === b.r) || this.unitAt(c, r) || this.towerAt(c, r) || this.rock(c, r) || (this.deep(c, r) && !this.wades(s))) continue;
        out.set(c + ',' + r, { c, r, cost: Math.min(2, b.moves), from: start });
      }
      return out;
    }
    if (!(Number.isInteger(b.c) && Number.isInteger(b.r) && b.c >= 0 && b.r >= 0 && b.c < CW && b.r < CH)) return this.reachableRef(b, s, start, out);
    // (performance) même parcours que reachableRef, case par case et dans le même ordre : file de priorité en tas (coût, puis
    // ordre d'arrivée, comme le tri stable d'origine), distances en tableau, terrain et occupation relevés une fois par case
    const N = CW * CH, R = Battle._rbuf || (Battle._rbuf = { dist: new Float64Array(N), has: new Uint8Array(N), info: new Uint8Array(N), occ: new Uint8Array(N) });
    const dist = R.dist, has = R.has, info = R.info, occ = R.occ;
    has.fill(0); info.fill(0); occ.fill(0);
    for (const o of this.units) if (!o.dead && Number.isInteger(o.c) && Number.isInteger(o.r) && o.c >= 0 && o.r >= 0 && o.c < CW && o.r < CH) occ[o.r * CW + o.c] = 1;
    // bits : 1 relevée, 2 occupée (unité ou tour), 4 rocher, 8 eau profonde, 16 arbre, 32 colline, 64 fondrière, 128 rivière
    const cell = (c, r) => {
      const i = r * CW + c; let v = info[i];
      if (!v) {
        v = 1;
        if (occ[i] || this.towerAt(c, r)) v |= 2;
        if (this.rock(c, r)) v |= 4;
        if (this.deep(c, r)) v |= 8;
        if (this.tree(c, r)) v |= 16;
        if (this.hill(c, r)) v |= 32;
        if (this.mud[c + ',' + r]) v |= 64;
        if (this.inRiver(c, r)) v |= 128;
        info[i] = v;
      }
      return v;
    };
    const wades = this.wades(s), foes = this.alive(1 - b.side);
    // tas binaire de [coût, rang d'arrivée, c, r]
    const heap = []; let seq = 0;
    const less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
    const push = e => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; const t = heap[i]; heap[i] = heap[p]; heap[p] = t; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, rr = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (rr < heap.length && less(heap[rr], heap[m])) m = rr; if (m === i) break; const t = heap[i]; heap[i] = heap[m]; heap[m] = t; i = m; } } return top; };
    const si = b.r * CW + b.c; dist[si] = 0; has[si] = 1;
    push([0, seq++, b.c, b.r]);
    while (heap.length) {
      const [d, , c, r] = pop();
      if (d > dist[r * CW + c]) continue;
      // impossible de continuer après être entré en contact d'un ennemi (zone de contrôle légère)
      if (c !== b.c || r !== b.r) {
        let zoc = false;
        for (const o of foes) if (Math.max(Math.abs(o.c - c), Math.abs(o.r - r)) === 1 && (!this.hasWalls || !this.wallApart({ c, r, side: b.side, u: b.u, tempEnch: b.tempEnch, curses: b.curses, grounded: b.grounded, asleep: b.asleep }, o))) { zoc = true; break; }
        if (zoc && !s.flying) continue;
      }
      if (d >= b.moves) continue; // il faut au moins un reste de mouvement pour avancer
      for (const [dc, dr] of U.DIRS8) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= CW || nr >= CH) continue;
        const v = cell(nc, nr);
        if (v & 6) continue;   // occupée, rocher
        if ((v & 8) && !wades) continue;
        if (!wades && dc && dr && (cell(c + dc, r) & 8) && (cell(c, r + dr) & 8)) continue;   // cutsDeep
        if (this.hasWalls && this.wallBlocks(b, c, r, nc, nr)) continue;
        let cost = 2;
        if (!s.flying) {
          if ((v & 16) && !s.ab.forester && !s.ab.pathfinding) cost = 3;
          if ((v & 32) && !(cell(c, r) & 32) && !s.ab.mountaineer) cost = 3;
          if (((v & 64) && !s.ab.nonCorporeal) || ((v & 128) && !s.swimming && !s.ab.waterWalking)) cost = Math.max(2, b.maxMoves);
        }
        const nd = d + cost;
        const ni = nr * CW + nc;
        if (!has[ni] || nd < dist[ni]) { has[ni] = 1; dist[ni] = nd; push([nd, seq++, nc, nr]); out.set(nc + ',' + nr, { c: nc, r: nr, cost: Math.min(nd, b.moves), from: c + ',' + r }); }
      }
    }
    return out;
  }
  // le parcours d'origine (cases hors grille : ne sert qu'en secours)
  reachableRef(b, s, start, out) {
    const dist = new Map([[start, 0]]);
    const q = [[0, b.c, b.r]];
    while (q.length) {
      q.sort((a, c) => a[0] - c[0]);
      const [d, c, r] = q.shift();
      if (d > dist.get(c + ',' + r)) continue;
      // impossible de continuer après être entré en contact d'un ennemi (zone de contrôle légère)
      if ((c !== b.c || r !== b.r) && this.alive(1 - b.side).some(o => Math.max(Math.abs(o.c - c), Math.abs(o.r - r)) === 1 && !this.wallApart({ c, r, side: b.side, u: b.u, tempEnch: b.tempEnch, curses: b.curses, grounded: b.grounded, asleep: b.asleep }, o)) && !s.flying) continue;
      for (const [dc, dr] of U.DIRS8) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= CW || nr >= CH) continue;
        if (this.unitAt(nc, nr) || this.towerAt(nc, nr)) continue;
        if (this.rock(nc, nr)) continue;
        if (this.deep(nc, nr) && !this.wades(s)) continue;
        if (!this.wades(s) && this.cutsDeep(c, r, dc, dr)) continue;
        if (this.wallBlocks(b, c, r, nc, nr)) continue;
        let cost = 2;
        if (!s.flying) {
          if (this.tree(nc, nr) && !s.ab.forester && !s.ab.pathfinding) cost = 3;
          if (this.hill(nc, nr) && !this.hill(c, r) && !s.ab.mountaineer) cost = 3;
          if ((this.mud[nc + ',' + nr] && !s.ab.nonCorporeal) || (this.inRiver(nc, nr) && !s.swimming && !s.ab.waterWalking)) cost = Math.max(2, b.maxMoves);
        }
        if (d >= b.moves) continue; // il faut au moins un reste de mouvement pour avancer
        const nd = d + cost;
        const k = nc + ',' + nr;
        if (!dist.has(k) || nd < dist.get(k)) { dist.set(k, nd); q.push([nd, nc, nr]); out.set(k, { c: nc, r: nr, cost: Math.min(nd, b.moves), from: c + ',' + r }); }
      }
    }
    return out;
  }
  // pas de marche depuis (c0, r0) pour un piéton, en ignorant les unités (l'IA s'en sert pour viser les gués)
  // (performance) même parcours en largeur sur une grille de distances (StepGrid) ; l'ancien code (walkDistRef) hors grille
  walkDist(c0, r0) {
    if (!Battle._inGrid(c0, r0)) return this.walkDistRef(c0, r0);
    const N = CW * CH, d = new Int16Array(N).fill(-1), q = Battle._qbuf || (Battle._qbuf = new Int16Array(N));
    const cut = this._terrBuf();
    d[r0 * CW + c0] = 0; q[0] = r0 * CW + c0; let qh = 0, qt = 1;
    while (qh < qt) {
      const i = q[qh++], c = i % CW, r = (i - c) / CW, dd = d[i] + 1;
      for (const [dc, dr] of U.DIRS8) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= CW || nr >= CH) continue;
        const ni = nr * CW + nc;
        if (d[ni] >= 0 || (this._terr(cut, nc, nr) & 1) || (dc && dr && (this._terr(cut, nc, r) & 2) && (this._terr(cut, c, nr) & 2))) continue;
        d[ni] = dd; q[qt++] = ni;
      }
    }
    return new StepGrid(d);
  }
  static _inGrid(c, r) { return Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c < CW && r < CH; }
  // relevé paresseux du terrain d'une case pour un parcours (rien ne bouge pendant celui-ci) : 4 relevée, 1 bloquée (blocked), 2 eau profonde (deep)
  _terrBuf() { const t = Battle._tbuf || (Battle._tbuf = new Uint8Array(CW * CH)); t.fill(0); return t; }
  _terr(t, c, r) {
    const i = r * CW + c; let v = t[i];
    if (!v) { v = 4; if (this.blocked(c, r)) v |= 1; if (this.deep(c, r)) v |= 2; t[i] = v; }
    return v;
  }
  walkDistRef(c0, r0) {
    const out = new Map([[c0 + ',' + r0, 0]]), q = [[c0, r0]];
    while (q.length) {
      const [c, r] = q.shift(), d = out.get(c + ',' + r);
      for (const [dc, dr] of U.DIRS8) {
        const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
        if (nc < 0 || nr < 0 || nc >= CW || nr >= CH || out.has(k) || this.blocked(nc, nr) || this.cutsDeep(c, r, dc, dr)) continue;
        out.set(k, d + 1); q.push([nc, nr]);
      }
    }
    return out;
  }
  pathTo(reach, b, c, r) {
    const path = []; let k = c + ',' + r;
    while (reach.has(k)) { const n = reach.get(k); path.unshift([n.c, n.r]); k = n.from; }
    return path;
  }
  // reach0 : this.reachable(b) déjà calculé par l'appelant, rien n'ayant bougé depuis (performance)
  moveUnit(b, c, r, reach0) {
    if (this.over || b.dead || b.side !== this.side) return false;
    const reach = reach0 || this.reachable(b);
    const k = c + ',' + r;
    if (!reach.has(k)) return false;
    const path = this.pathTo(reach, b, c, r);
    const cost = reach.get(k).cost;
    const from = [b.c, b.r];
    // mur de feu : traverser la bordure inflige des dégâts
    let fire = 0;
    let pc = b.c, pr = b.r;
    for (const [nc, nr] of path) { if (this.wallOfFire && this.crossesWall(pc, pr, nc, nr) && !this.stats(b).flying) fire++; pc = nc; pr = nr; }
    b.c = c; b.r = r; b.moves = Math.max(0, b.moves - cost);
    b.movedTiles = (b.movedTiles || 0) + path.length; b.guarding = false;
    b.facing = this.facing(from, [c, r]); b.faceX = this.faceX(from, [c, r], b.faceX);
    { const last = path[path.length - 1], prev = path.length > 1 ? path[path.length - 2] : from; if (last) this.turnTo(b, last[0], last[1], prev[0], prev[1]); }
    this.ev({ type: 'move', id: b.id, path: [from].concat(path) });
    if (fire && this.side === ATT_SIDE) {
      const d = this.applyArea(b, 5, 'immolation', 'chaos');
      this.say(this.subj(b, 'traverse') + ' le mur de feu (' + d + ' dégâts).');
      this.ev({ type: 'fx', fx: 'fire', at: [c, r] });
      this.checkDeath(b);
      this.checkEnd();
    }
    return true;
  }
  // sens à l'écran (-1 gauche, +1 droite) vers la case visée : l'abscisse isométrique suit c - r
  // orientation : le sens du dernier pas ou de la dernière cible ; au départ, chaque camp fait face à l'autre
  fdirOf(b) { return b.fdir || (b.side === DEF_SIDE ? [1, 1] : [-1, -1]); }
  turnTo(b, c, r, fc, fr) { const dc = Math.sign(c - (fc == null ? b.c : fc)), dr = Math.sign(r - (fr == null ? b.r : fr)); if (dc || dr) b.fdir = [dc, dr]; }
  // d'où frappe l'assaillant (sa case, ou celle envisagée) : 0 de face, 1 de flanc, 2 de dos. Une unité en garde fait face partout ;
  // endormie, elle est déjà sans défense.
  flankOf(a, d, ac, ar) {
    if (!d || d.dead || d.asleep || d.guarding || d.holdBreach) return 0;
    const dc = Math.sign((ac == null ? a.c : ac) - d.c), dr = Math.sign((ar == null ? a.r : ar) - d.r);
    if (!dc && !dr) return 0;
    const f = this.fdirOf(d); let k = Math.abs(faceIdx(f[0], f[1]) - faceIdx(dc, dr)); k = Math.min(k, 8 - k);
    return k <= 1 ? 0 : k === 2 ? 1 : 2;
  }
  flankText(fl) { return fl === 2 ? 'dans le dos' : fl === 1 ? 'de flanc' : ''; }
  faceX(a, b, prev) { const d = (b[0] - b[1]) - (a[0] - a[1]); return d > 0 ? 1 : d < 0 ? -1 : prev; }
  facing(a, b) { const dc = b[0] - a[0], dr = b[1] - a[1]; return dc + dr > 0 ? 'down' : dc + dr < 0 ? 'up' : dc > 0 ? 'right' : 'left'; }

  // ---------- attaques ----------
  // anySide : un confus peut frapper un allié
  canMelee(a, d, anySide) {
    if (a.dead || d.dead || (a.side === d.side && !anySide) || a === d || a.moves <= 0) return false;
    if (this.dist(a, d) !== 1) return false;
    const sa = this.stats(a), sd = this.stats(d);
    if (sa.melee <= 0 && !sa.breath && !sa.thrown) return false;
    if (sa.ab.siegeOnly) return false;
    if (this.outOfReach(a, d, sa, sd)) return false;
    if (!this.canSee(a, d)) return false;
    if (this.wallBlocks(a, a.c, a.r, d.c, d.r) && !this.wallBlocks(d, d.c, d.r, a.c, a.r)) return false;
    if (this.hasWalls && this.crossesWall(a.c, a.r, d.c, d.r)) {
      const inside = this.inCity(a.c, a.r) ? [a.c, a.r] : [d.c, d.r];
      const w = this.walls[inside[0] + ',' + inside[1]];
      if (w && !w.broken && (!w.gate || a.side === ATT_SIDE) && !sa.flying && !this.stats(d).flying) return false;
    }
    return true;
  }
  // comme dans MoM : une unité qui marche n'attaque pas un volant au corps à corps, sauf à lancer, cracher ou foudroyer du regard.
  // Elle riposte quand il vient la frapper (la riposte ne passe pas par canMelee). Pris dans une toile, le volant est cloué au sol.
  outOfReach(a, d, sa, sd) {
    sa = sa || this.stats(a); sd = sd || this.stats(d);
    return !!sd.flying && !sa.flying && !(sa.thrown > 0) && !(sa.breath > 0) && !sa.ab.stoningGaze && !sa.ab.deathGaze && !sa.ab.doomGaze;
  }
  // depuis la case (c, r), a pourrait-il frapper d ? (pour choisir où s'approcher)
  canMeleeAt(a, c, r, d) { const oc = a.c, orr = a.r, om = a.moves; a.c = c; a.r = r; a.moves = Math.max(1, om); const ok = this.canMelee(a, d); a.c = oc; a.r = orr; a.moves = om; return ok; }
  // ce qui empêche a de tirer sur d (null : rien, ou a n'a pas de tir) ; même ordre que canShoot
  shootBlock(a, d) {
    const s = this.stats(a);
    if (!(s.ranged > 0 && s.rangedType) || a.dead || d.dead || a.side === d.side) return null;
    if (a.moves <= 0) return 'plus de mouvement pour tirer';
    if (s.rangedType === 'magic' && a.ammo <= 0 && a.casterMana < 3) { const m = Math.max(0, Math.floor(a.casterMana || 0)); return 'tir magique : 3 de mana requis (' + m + ' restant' + (m > 1 ? 's' : '') + ')'; }
    if (s.rangedType !== 'magic' && a.ammo <= 0) return 'plus de munitions';
    if (this.enemyAdjacent(a)) return 'un ennemi au contact empêche de tirer';
    if (!this.canSee(a, d)) return 'cible invisible';
    if (this.wallOfDarkness && this.side === ATT_SIDE && this.inCity(d.c, d.r) && !this.inCity(a.c, a.r) && !s.ab.illusionsImmunity) return 'le Mur de ténèbres cache la cible';
    if (s.rangedType === 'magic' && this.wallBetween(a, d, s)) return 'la muraille arrête le trait magique';
    return null;
  }
  canShoot(a, d) {
    if (a.dead || d.dead || a.side === d.side || a.moves <= 0) return false;
    const s = this.stats(a);
    if (!(s.ranged > 0 && s.rangedType)) return false;
    if (s.rangedType === 'magic' && a.ammo <= 0 && a.casterMana < 3) return false;
    if (s.rangedType !== 'magic' && a.ammo <= 0) return false;
    if (this.enemyAdjacent(a)) return false;
    if (!this.canSee(a, d)) return false;
    if (this.wallOfDarkness && this.side === ATT_SIDE && this.inCity(d.c, d.r) && !this.inCity(a.c, a.r) && !s.ab.illusionsImmunity) return false;
    if (s.rangedType === 'magic' && this.wallBetween(a, d, s)) return false;   // un trait magique va droit : la muraille l'arrête
    return true;
  }
  // une muraille debout entre le tireur et sa cible : les traits magiques, qui vont droit, s'y arrêtent (il faut se poster
  // sur le rempart, ou viser par une brèche) ; les flèches passent en cloche, moins précises ; les boulets passent sans peine.
  // Rien ne gêne un tir vers un volant, ou d'un volant.
  wallBetween(a, d, s) {
    if (!this.hasWalls) return false;   // (aussi un tir du dehors qui traverserait toute la cité)
    if ((s || this.stats(a)).flying || this.stats(d).flying) return false;
    // sur le chemin de ronde, on tire par-dessus le parapet, et l'on est à découvert
    if (this.onRampart(a.c, a.r) || this.onRampart(d.c, d.r)) return false;
    const n = Math.max(Math.abs(d.c - a.c), Math.abs(d.r - a.r)) * 4;
    for (let i = 1; i < n; i++) {
      const c = Math.round(a.c + (d.c - a.c) * i / n), r = Math.round(a.r + (d.r - a.r) * i / n);
      if ((c === a.c && r === a.r) || (c === d.c && r === d.r)) continue;
      const w = this.walls[c + ',' + r];
      if (w && !w.broken) return true;
    }
    return false;
  }
  // protection de la muraille contre qui attaque du dehors : créneaux du chemin de ronde +2, porte +1, derrière le mur +1
  // (et les flèches qui y passent en cloche perdent 10 % de précision : voir rangedToHit) ; les traits magiques n'y passent pas
  wallDefense(a, d) {
    if (!this.hasWalls) return 0;
    if (this.inCity(d.c, d.r) && !this.inCity(a.c, a.r)) {
      const w = this.walls[d.c + ',' + d.r];
      if (w && !w.broken) return w.gate ? 1 : 2;
      return 1;
    }
    return 0;
  }
  toHit(a, d, s) {
    s = s || this.stats(a);
    let th = s.toHit;
    const ds = this.stats(d);
    if (ds.ab.lucky) th -= 10;
    if (this.isInvisible(d) && !s.ab.illusionsImmunity) th -= 10;
    return Math.max(0, th);
  }
  // précision d'un coup de mêlée ; la riposte perd 10 % tous les deux assauts déjà subis ce tour
  meleeToHit(a, d, s, counter) {
    let th = this.toHit(a, d, s);
    if (counter) th = th < 10 ? th : Math.max(10, th - 10 * Math.floor(a.attacked / 2));
    return th;
  }
  meleeRolls(a, d, fear, counter) {
    const s = this.stats(a);
    if (s.melee <= 0 || s.ab.siegeOnly) return [];  // un engin de siège ne frappe pas les troupes, ni ne riposte
    const th = this.meleeToHit(a, d, s, counter);
    const rolls = [];
    const n = Math.max(0, this.figures(a) - (fear || 0));
    const m = s.melee + (!counter && a.chargeBonus ? a.chargeBonus : 0) + (!counter && this.flankOf(a, d) ? 1 : 0);   // de flanc ou de dos : +1
    for (let i = 0; i < n; i++) rolls.push(d.asleep ? m : this.rng.rolls(m, th));
    return rolls;
  }
  meleeMods(a, d, counter) {
    const s = this.stats(a);
    const ench = a.u.ench.concat(a.tempEnch);
    return {
      wallDef: this.wallDefense(a, d), armorPiercing: !!s.ab.armorPiercing, illusion: !!s.ab.illusion,
      magicWeapon: s.magicWeapon, eldritch: ench.includes('eldritch_weapon'),
      damageType: s.ab.createUndead ? 'undead' : 'normal',
      pierce: Units.pierce(this.meleeToHit(a, d, s, counter)),
      rear: !counter && this.flankOf(a, d) === 2,
    };
  }
  rangedMods(a, d, s, th) {
    s = s || this.stats(a);
    if (th == null) th = this.rangedToHit(a, d, s);
    return { wallDef: this.wallDefense(a, d), magicWeapon: s.magicWeapon, armorPiercing: !!s.ab.armorPiercing, illusion: !!s.ab.illusion, eldritch: a.u.ench.concat(a.tempEnch).includes('eldritch_weapon'), pierce: Units.pierce(th) };
  }
  fearOf(target) {
    const s = this.stats(target);
    if (s.ab.magicImmunity || s.ab.deathImmunity || s.ab.charmed) return 0;
    const ench = target.u.ench.concat(target.tempEnch);
    if (ench.includes('righteousness')) return 0;
    const res = this.resFor(target, 'death', s);
    let f = 0; for (let i = 0; i < this.figures(target); i++) if (this.rng.int(10) + 1 > res) f++;
    return f;
  }
  gaze(a, d) {
    const s = this.stats(a), ds = this.stats(d);
    let dmg = 0, irr = 0;
    if (s.ab.stoningGaze && !ds.ab.stoningImmunity && !ds.ab.magicImmunity) {
      const mod = Number(s.ab.stoningGaze) || 0; const res = this.resFor(d, 'nature', ds);
      for (let i = 0; i < this.figures(d); i++) if (this.rng.int(10) + 1 > res - mod) irr += ds.hp;
    }
    if (s.ab.deathGaze && !ds.ab.deathImmunity && !ds.ab.magicImmunity) {
      const mod = Number(s.ab.deathGaze) || 0; const res = this.resFor(d, 'death', ds);
      for (let i = 0; i < this.figures(d); i++) if (this.rng.int(10) + 1 > res - mod) dmg += ds.hp;
    }
    if (s.ab.doomGaze && !ds.ab.magicImmunity && !d.u.ench.concat(d.tempEnch).includes('righteousness')) dmg += Number(s.ab.doomGaze) || 0;
    return { dmg, irr, hit: !!(s.ab.stoningGaze || s.ab.deathGaze || s.ab.doomGaze) };
  }
  touch(a, d, fear) {
    // renvoie des fonctions de dégâts à appliquer après la mêlée
    const s = this.stats(a), ds = this.stats(d);
    const out = [];
    const n = Math.max(0, this.figures(a) - (fear || 0));
    if (s.ab.poisonTouch && !ds.ab.poisonImmunity) {
      let dmg = 0; const res = this.resFor(d, null, ds);
      for (let i = 0; i < Number(s.ab.poisonTouch); i++) if (this.rng.int(10) + 1 > res) dmg++;
      out.push(() => this.takeDamage(d, dmg, s.ab.createUndead ? 'undead' : 'normal', a));
    }
    // Sainte droiture : le vol de vie et le toucher de mort sont des attaques magiques de mort ; la mêlée elle-même porte toujours
    const righteous = d.u.ench.concat(d.tempEnch).includes('righteousness');
    if (s.ab.lifeSteal && !ds.ab.deathImmunity && !ds.ab.magicImmunity && !righteous) {
      const mod = Number(s.ab.lifeSteal) === 1 || s.ab.lifeSteal === true ? 0 : Number(s.ab.lifeSteal);
      const res = this.resFor(d, 'death', ds);
      let dmg = 0; for (let i = 0; i < n; i++) { const m = this.rng.int(10) + 1 - (res + mod); if (m > 0) dmg += m; }
      out.push(() => { const t = this.takeDamage(d, Math.min(dmg, this.hp(d)), 'undead', a); this.heal(a, t); return t; });
    }
    if (s.ab.stoningTouch && !ds.ab.stoningImmunity && !ds.ab.magicImmunity) {
      const mod = Number(s.ab.stoningTouch) || 0; const res = this.resFor(d, 'nature', ds);
      let dmg = 0; for (let i = 0; i < n; i++) if (this.rng.int(10) + 1 > res - mod) dmg += ds.hp;
      out.push(() => this.takeDamage(d, dmg, 'irreversible', a));
    }
    if (s.ab.dispelEvil && (Units.isFantastic(d.u) || Units.isUndead(d.u)) && ['chaos', 'death'].includes(Units.realmOf(d.u)) && !ds.ab.magicImmunity) {
      const res = this.resFor(d, 'life', ds) - (Units.isUndead(d.u) ? 9 : 4);
      let dmg = 0; for (let i = 0; i < n; i++) if (this.rng.int(10) + 1 > res) dmg += ds.hp;
      out.push(() => this.takeDamage(d, dmg, 'irreversible', a));
    }
    if (s.ab.deathTouch && !ds.ab.deathImmunity && !ds.ab.magicImmunity && !righteous) {
      const res = this.resFor(d, 'death', ds);
      let dmg = 0; for (let i = 0; i < n; i++) if (this.rng.int(10) + 1 > res - 3) dmg += ds.hp;
      out.push(() => this.takeDamage(d, dmg, 'normal', a));
    }
    return out;
  }
  immolation(a) { const s = this.stats(a); return s.ab.immolation ? 4 : 0; }

  melee(a, d, anySide) {
    if (!this.canMelee(a, d, anySide)) return false;
    const charge = this.chargeOf(a, d);
    a.chargeBonus = charge;
    const flank = this.flankOf(a, d);
    const sa = this.stats(a);
    const spent = Math.max(sa.haste ? 4 : 2, Math.floor(a.maxMoves / 2));   // Célérité : deux assauts doubles au plus, même à vitesse 1
    a.moves = Math.max(0, a.moves - spent); a.struck = true; a.guarding = false;
    if (charge) this.say(this.subj(a, 'charge') + ' (+' + charge + ' en attaque) !');
    if (a.u.hero || Units.isNormal(a.u)) a.fought = true; d.fought = true;
    a.facing = this.facing([a.c, a.r], [d.c, d.r]); a.faceX = this.faceX([a.c, a.r], [d.c, d.r], a.faceX); this.turnTo(a, d.c, d.r); d.faceX = this.faceX([d.c, d.r], [a.c, a.r], d.faceX);
    let dealt = 0, received = 0;
    const startHpD = this.hp(d), startHpA = this.hp(a);
    const haste = sa.haste;
    let fearA = 0, fearD = 0;
    const done = () => d.dead || a.dead || this.hp(d) <= 0 || this.hp(a) <= 0;
    // 0. attaques préliminaires de l'attaquant : lancer, souffle, regard
    for (let k = 0; k < (haste ? 2 : 1) && !done(); k++) {
      if (sa.thrown > 0) {
        const th = this.toHit(a, d, sa); const rolls = [];
        for (let i = 0; i < this.figures(a); i++) if (this.rng.next() * 100 < th) rolls.push(sa.thrown);
        dealt += this.applyRolls(d, rolls, 'thrown', null, this.meleeMods(a, d), a);
      }
      if (sa.breath > 0) {
        const isFire = !!sa.ab.fireBreath;
        for (let i = 0; i < this.figures(a) && !done(); i++) {
          const bth = this.toHit(a, d, sa), dm = this.rng.rolls(sa.breath, bth);
          dealt += this.applyRolls(d, [dm], isFire ? 'fire' : 'lightning', 'chaos', { armorPiercing: !isFire, pierce: Units.pierce(bth) }, a);
        }
      }
      // les effets de contact (poison, vol de vie…) suivent aussi un jet ou un souffle
      if ((sa.thrown > 0 || sa.breath > 0) && !done()) for (const f of this.touch(a, d, 0)) dealt += f() || 0;
    }
    if (!done()) { const g = this.gaze(a, d); if (g.hit) { dealt += this.takeDamage(d, g.dmg, 'normal', a) + this.takeDamage(d, g.irr, 'irreversible', a); } }
    // 1. regard du défenseur
    if (!done()) { const g = this.gaze(d, a); if (g.hit) received += this.takeDamage(a, g.dmg, 'normal', d) + this.takeDamage(a, g.irr, 'irreversible', d); }
    // 3. terreur provoquée par le défenseur
    if (!done() && !d.asleep && this.stats(d).ab.causeFear) fearA = this.fearOf(a);
    // 4. première frappe
    const firstStrike = sa.ab.firstStrike && !this.stats(d).ab.negateFirstStrike;
    if (!done() && firstStrike) {
      const rolls = this.meleeRolls(a, d, fearA, false);
      const touches = this.touch(a, d, fearA);
      dealt += this.applyRolls(d, rolls, 'melee', null, this.meleeMods(a, d), a);
      const im = this.immolation(a); if (im) dealt += this.applyArea(d, im, 'immolation', 'chaos', null, a);
      for (const f of touches) dealt += f() || 0;
    }
    // 5. terreur de l'attaquant
    if (!done() && sa.ab.causeFear) fearD = this.fearOf(d);
    // 6. mêlée simultanée (+ contre-attaque)
    if (!done()) {
      let attacks = firstStrike ? (haste ? 1 : 0) : (haste ? 2 : 1);
      let aRolls = [], aTouch = [];
      for (let k = 0; k < attacks; k++) { aRolls = aRolls.concat(this.meleeRolls(a, d, fearA, false)); aTouch = aTouch.concat(this.touch(a, d, fearA)); }
      let dRolls = [], dTouch = [];
      const sd = this.stats(d);
      if (!d.asleep && !d.confused && !d.stasis) {
        const counters = sd.haste ? 2 : 1;
        for (let k = 0; k < counters; k++) { dRolls = dRolls.concat(this.meleeRolls(d, a, fearD, true)); dTouch = dTouch.concat(this.touch(d, a, fearD)); }
      }
      if (attacks > 0) { const im = this.immolation(a); if (im) dealt += this.applyArea(d, im, 'immolation', 'chaos', null, a); }
      if (dRolls.length) { const im = this.immolation(d); if (im) received += this.applyArea(a, im, 'immolation', 'chaos', null, d); }
      dealt += this.applyRolls(d, aRolls, 'melee', null, this.meleeMods(a, d), a);
      received += this.applyRolls(a, dRolls, 'melee', null, this.meleeMods(d, a, true), d);
      for (const f of aTouch) dealt += f() || 0;
      for (const f of dTouch) received += f() || 0;
    }
    d.attacked++;
    // mur de feu : frapper à travers brûle l'assaillant qui n'est pas volant
    if (this.wallOfFire && a.side === ATT_SIDE && !a.dead && !sa.flying && this.crossesWall(a.c, a.r, d.c, d.r)) {
      const burn = this.applyArea(a, 5, 'immolation', 'chaos');
      if (burn) { this.say(this.subj(a, 'se brûle') + ' au mur de feu (' + burn + ').'); this.ev({ type: 'fx', fx: 'fire', at: [a.c, a.r] }); }
    }
    // briseurs de murs
    if (sa.ab.wallCrusher && this.hasWalls) this.damageWall(d.c, d.r, 0.5);
    a.chargeBonus = 0;
    // l'assailli se retourne vers qui l'a frappé ; l'assaillant regarde sa cible
    if (!d.dead && !d.asleep) this.turnTo(d, a.c, a.r);
    this.turnTo(a, d.c, d.r);
    this.ev({ type: 'melee', a: a.id, d: d.id, dealt, received, charge, flank, fearA, fearD });
    this.say(this.subj(a, 'attaque') + ' ' + this.name(d) + (flank ? ' ' + this.flankText(flank) : '') + ' : ' + dealt + ' dégâts infligés, ' + received + ' subis.' + (fearA || fearD ? ' Effroi : ' + [fearA ? U.n(fearA, 'figurine') + ' de ' + this.name(a) + ' paralysée' + (fearA > 1 ? 's' : '') : '', fearD ? U.n(fearD, 'figurine') + ' de ' + this.name(d) + ' paralysée' + (fearD > 1 ? 's' : '') : ''].filter(Boolean).join(', ') + '.' : ''));
    this.checkDeath(d); this.checkDeath(a);
    this.checkEnd();  // le dernier ennemi tombé : la bataille s'arrête aussitôt, sans attendre la fin du tour
    return true;
  }
  canBreach(a, c, r) {
    if (!this.hasWalls || a.dead || a.moves <= 0 || this.over || a.side !== this.side) return false;
    const w = this.walls[c + ',' + r];
    if (!w || w.broken || w.gate || this.towerAt(c, r)) return false;
    return !!this.stats(a).ab.wallCrusher && this.dist(a, { c, r }) === 1 && !this.inCity(a.c, a.r);
  }
  breachWall(a, c, r) {
    if (!this.canBreach(a, c, r)) return false;
    a.struck = true; a.guarding = false;
    a.moves = Math.max(0, a.moves - Math.max(2, Math.floor(a.maxMoves / 2)));
    a.faceX = this.faceX([a.c, a.r], [c, r], a.faceX);
    this.say(this.subj(a, 'bat') + ' la muraille.');
    this.ev({ type: 'fx', fx: 'wall', at: [c, r] });
    const w = this.walls[c + ',' + r];
    this.damageWall(c, r, 0.5);
    if (!w.broken) this.say('La muraille tient bon.');
    return true;
  }
  damageWall(c, r, p) {
    const w = this.walls[c + ',' + r];
    if (w && !w.gate && !w.broken && this.rng.chance(p)) { w.broken = true; this.say('Une section de muraille s\'effondre !'); this.ev({ type: 'fx', fx: 'wall', at: [c, r] }); }
  }

  // précision d'un tir. Arcanes adoucit la portée de l'original (-10 % dès 3 cases, -20 % dès 6) : aucune pénalité
  // jusqu'à 5 cases, -10 % de 6 à 8, -20 % au-delà ; Longue portée : aucune pénalité jusqu'à 8 cases, -10 % au-delà.
  // Les tirs magiques n'en subissent aucune. +10 % depuis une colline.
  rangedToHit(a, d, s) {
    s = s || this.stats(a);
    let th = this.toHit(a, d, s);
    // en hauteur (colline, chemin de ronde) : on voit plus loin et on vise mieux
    const high = this.onRampart(a.c, a.r) && !this.onRampart(d.c, d.r);
    if (s.rangedType !== 'magic') {
      const dist = this.dist(a, d);
      if (s.ab.longRange || high) { if (dist >= 9) th -= 10; }
      else if (dist >= 9) th -= 20; else if (dist >= 6) th -= 10;
    }
    if (this.hill(a.c, a.r) || high) th += 10;
    if (s.rangedType === 'missile' && this.wallBetween(a, d, s)) th -= 10;   // tir en cloche par-dessus la muraille
    return Math.max(0, th);
  }
  shoot(a, d) {
    if (!this.canShoot(a, d)) return false;
    a.struck = true; a.guarding = false;
    const s = this.stats(a);
    const th = this.rangedToHit(a, d, s);
    if (s.rangedType === 'magic') { if (a.ammo > 0) a.ammo--; else a.casterMana -= 3; } else a.ammo--;
    a.moves = 0; a.facing = this.facing([a.c, a.r], [d.c, d.r]); a.faceX = this.faceX([a.c, a.r], [d.c, d.r], a.faceX); this.turnTo(a, d.c, d.r);
    const kind = s.rangedType === 'magic' ? 'magic' : s.rangedType === 'boulder' ? 'boulder' : 'missile';
    const mods = this.rangedMods(a, d, s, th);
    // Hâte : deux salves, la seconde si la cible tient encore et qu'il reste de quoi tirer
    let dealt = 0;
    for (let k = 0; k < (s.haste ? 2 : 1); k++) {
      if (k > 0) { if (d.dead || this.hp(d) <= 0) break; if (s.rangedType === 'magic') { if (a.ammo > 0) a.ammo--; else if (a.casterMana >= 3) a.casterMana -= 3; else break; } else if (a.ammo > 0) a.ammo--; else break; }
      const rolls = [];
      for (let i = 0; i < this.figures(a); i++) rolls.push(this.rng.rolls(s.ranged, th));
      dealt += this.applyRolls(d, rolls, kind, s.rangedRealm || (kind === 'magic' ? 'chaos' : null), mods, a);
    }
    if (kind === 'boulder' && s.ab.wallCrusher && this.hasWalls) this.damageWall(d.c, d.r, 0.3);
    // vol de vie des tirs du seigneur démon
    if (kind === 'magic' && s.ab.lifeSteal) this.heal(a, Math.floor(dealt / 2));
    this.ev({ type: 'ranged', a: a.id, d: d.id, kind, realm: s.rangedRealm, dealt });
    this.say(this.subj(a, 'tire') + ' sur ' + this.name(d) + ' : ' + dealt + ' dégâts.');
    this.checkDeath(d);
    this.checkEnd();
    return true;
  }

  // ---------- tours de défense ----------
  standing(t) { return !t.dead && !(t.kind === 'gate' && this.walls[t.c + ',' + t.r] && this.walls[t.c + ',' + t.r].broken); }
  towerAt(c, r) { return (this.towers || []).find(t => t.kind !== 'gate' && !t.dead && t.c === c && t.r === r) || null; }
  gateAt(c, r) { return (this.towers || []).find(t => t.kind === 'gate' && this.standing(t) && t.c === c && t.r === r) || null; }
  enemyTowers(side) { return (this.towers || []).filter(t => this.standing(t) && t.side !== side); }
  towerName(t) { return t.kind === 'spire' ? 'la tour du sorcier' : t.kind === 'gate' ? 'la porte' : (t.c > t.r ? 'la tour de droite' : 'la tour de gauche'); }
  // abattre une tour : briseurs de murs, ou créature colossale (une ou deux figurines d'au moins 15 PV), pas un héros
  breaksTowers(b) {
    if (this.stats(b).ab.wallCrusher) return true;
    const d = DATA.units[b.u.type];
    return !b.u.hero && !!d && d.figures <= 2 && d.hp >= 15;
  }
  canMeleeTower(a, t) {
    if (!t || t.dead || a.dead || a.side === t.side || a.moves <= 0 || this.dist(a, t) !== 1) return false;
    if (t.kind === 'gate' && (!this.standing(t) || this.inCity(a.c, a.r))) return false;
    return this.stats(a).melee > 0 && (t.kind === 'spire' || t.kind === 'gate' || this.breaksTowers(a));
  }
  canShootTower(a, t) {
    if (!t || t.dead || a.dead || a.side === t.side || a.moves <= 0 || !this.breaksTowers(a)) return false;
    const s = this.stats(a);
    if (!(s.ranged > 0 && s.rangedType)) return false;
    if (s.rangedType === 'magic' ? a.ammo <= 0 && a.casterMana < 3 : a.ammo <= 0) return false;
    return !this.enemyAdjacent(a);
  }
  // la pierre bloque une fois par attaque ; les briseurs de murs frappent double
  // figs : un briseur de murs sape au moins un point par figurine encore debout (les ingénieurs)
  hitTower(t, raw, crusher, figs) {
    let n = Math.max(0, raw - this.rng.rolls(t.def, 30));
    if (crusher) n = 2 * Math.max(n, figs || 0);
    return this.damageTower(t, n, true);
  }
  // later : l'effondrement attendra que l'attaque soit annoncée (settleTower)
  damageTower(t, n, later) {
    if (t.dead) return 0;
    n = Math.min(t.hp, Math.max(0, Math.round(n)));
    t.hp -= n;
    if (t.hp <= 0 && !later) this.towerFalls(t);
    return n;
  }
  settleTower(t) { if (!t.dead && t.hp <= 0) this.towerFalls(t); }
  towerFalls(t) {
    if (t.dead) return;
    t.dead = true; t.hp = 0;
    const w = this.walls[t.c + ',' + t.r]; if (w) w.broken = true;
    this.say(t.kind === 'gate' ? 'La porte cède sous les coups.' : U.cap(this.towerName(t)) + (t.kind === 'spire' ? ' s\'effondre dans un fracas de magie.' : ' s\'effondre : la muraille est ouverte.'));
    this.ev({ type: 'towerFall', id: t.id });
    this.checkEnd();
  }
  meleeTower(a, t) {
    if (!this.canMeleeTower(a, t)) return false;
    a.struck = true; a.guarding = false;
    const s = this.stats(a);
    a.moves = Math.max(0, a.moves - Math.max(s.haste ? 4 : 2, Math.floor(a.maxMoves / 2)));
    a.facing = this.facing([a.c, a.r], [t.c, t.r]); a.faceX = this.faceX([a.c, a.r], [t.c, t.r], a.faceX); this.turnTo(a, t.c, t.r);
    let raw = 0;
    for (let k = 0; k < (s.haste ? 2 : 1); k++) for (let i = 0; i < this.figures(a); i++) raw += this.rng.rolls(s.melee, s.toHit);
    const dealt = this.hitTower(t, raw, !!s.ab.wallCrusher, this.figures(a));
    this.ev({ type: 'melee', a: a.id, d: t.id, dealt, received: 0 });
    this.say(this.subj(a, 'frappe') + ' ' + this.towerName(t) + ' : ' + dealt + ' dégâts.');
    this.settleTower(t);
    return true;
  }
  towerShotHit(a, t, s) {
    let th = s.toHit;
    if (s.rangedType !== 'magic') { const d = this.dist(a, t); if (s.ab.longRange) { if (d >= 9) th -= 10; } else if (d >= 9) th -= 20; else if (d >= 6) th -= 10; }
    if (this.hill(a.c, a.r)) th += 10;
    return Math.max(0, th);
  }
  shootTower(a, t) {
    if (!this.canShootTower(a, t)) return false;
    a.struck = true; a.guarding = false;
    const s = this.stats(a);
    if (s.rangedType === 'magic') { if (a.ammo > 0) a.ammo--; else a.casterMana -= 3; } else a.ammo--;
    a.moves = 0; a.facing = this.facing([a.c, a.r], [t.c, t.r]); a.faceX = this.faceX([a.c, a.r], [t.c, t.r], a.faceX); this.turnTo(a, t.c, t.r);
    const th = this.towerShotHit(a, t, s);
    let raw = 0; for (let i = 0; i < this.figures(a); i++) raw += this.rng.rolls(s.ranged, th);
    const kind = s.rangedType === 'magic' ? 'magic' : s.rangedType === 'boulder' ? 'boulder' : 'missile';
    const dealt = this.hitTower(t, raw, !!s.ab.wallCrusher);
    this.ev({ type: 'ranged', a: a.id, d: t.id, kind, realm: s.rangedRealm, dealt });
    this.say(this.subj(a, 'tire') + ' sur ' + this.towerName(t) + ' : ' + dealt + ' dégâts.');
    this.settleTower(t);
    return true;
  }
  // pas de marche jusqu'au contact de ces cibles (murailles comprises, unités ignorées) ; fromOutside : une tour de
  // l'enceinte se frappe aussi depuis l'extérieur
  // freeSeats : seules comptent les cases de contact libres (ou la sienne), pour que la troupe aille vers une place encore à prendre
  // (performance) même parcours en largeur, même ordre, sur une grille de distances (StepGrid, lue par at(c, r) ou get('c,r')) ;
  // le terrain de chaque case est relevé une fois par parcours, et les stats de b (dont wallBlocks ne lit que le vol et la
  // traversée des murs) une seule fois, au premier franchissement de l'enceinte examiné, comme l'aurait fait le premier
  // wallBlocks (rien ne bouge pendant le parcours). Cibles hors grille : l'ancien code (stepsMapRef).
  stepsMap(b, targets, fromOutside, freeSeats) {
    for (const t of targets) if (!Battle._inGrid(t.c, t.r)) return this.stepsMapRef(b, targets, fromOutside, freeSeats);
    const N = CW * CH, d = new Int16Array(N).fill(-1), q = Battle._qbuf || (Battle._qbuf = new Int16Array(N));
    const cut = this._terrBuf();
    let qt = 0, pass = -1;   // pass : b franchit-il les murailles (vol, téléportation…) ? -1 : pas encore relevé
    const wall = (ac, ar, bc, br) => {
      if (!this.hasWalls || this.inCity(ac, ar) === this.inCity(bc, br)) return false;
      if (pass < 0) { const st = this.stats(b); pass = st.flying || st.ab.teleporting || st.ab.merging || st.ab.nonCorporeal ? 1 : 0; }
      if (pass) return false;
      const w = this.inCity(ac, ar) ? this.walls[ac + ',' + ar] : this.walls[bc + ',' + br];
      if (!w || w.broken) return false;
      if (w.gate) return b.side === ATT_SIDE && !this.inCity(ac, ar);
      return true;
    };
    for (const t of targets) for (const [dc, dr] of U.DIRS8) {
      const c = t.c + dc, r = t.r + dr;
      if (freeSeats) { const o = this.unitAt(c, r); if (o && o !== b) continue; }
      if (t.kind === 'gate' && this.inCity(c, r)) continue;   // une porte ne s'enfonce que du dehors
      if (c >= 0 && r >= 0 && c < CW && r < CH && !(this._terr(cut, c, r) & 1) && d[r * CW + c] < 0 && (fromOutside || !wall(t.c, t.r, c, r))) { d[r * CW + c] = 0; q[qt++] = r * CW + c; }
    }
    let qh = 0;
    while (qh < qt) {
      const i = q[qh++], c = i % CW, r = (i - c) / CW, dd = d[i] + 1;
      for (const [dc, dr] of U.DIRS8) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= CW || nr >= CH) continue;
        const ni = nr * CW + nc;
        if ((this._terr(cut, nc, nr) & 1) || d[ni] >= 0 || wall(c, r, nc, nr) || (dc && dr && (this._terr(cut, nc, r) & 2) && (this._terr(cut, c, nr) & 2))) continue;
        d[ni] = dd; q[qt++] = ni;
      }
    }
    return new StepGrid(d);
  }
  stepsMapRef(b, targets, fromOutside, freeSeats) {
    const out = new Map(), q = [];
    const ok = (c, r) => c >= 0 && r >= 0 && c < CW && r < CH && !this.blocked(c, r);
    for (const t of targets) for (const [dc, dr] of U.DIRS8) {
      const c = t.c + dc, r = t.r + dr, k = c + ',' + r;
      if (freeSeats) { const o = this.unitAt(c, r); if (o && o !== b) continue; }
      if (t.kind === 'gate' && this.inCity(c, r)) continue;   // une porte ne s'enfonce que du dehors
      if (ok(c, r) && !out.has(k) && (fromOutside || !this.wallBlocks(b, t.c, t.r, c, r))) { out.set(k, 0); q.push([c, r]); }
    }
    while (q.length) {
      const [c, r] = q.shift(), d = out.get(c + ',' + r);
      for (const [dc, dr] of U.DIRS8) {
        const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
        if (!ok(nc, nr) || out.has(k) || this.wallBlocks(b, c, r, nc, nr) || this.cutsDeep(c, r, dc, dr)) continue;
        out.set(k, d + 1); q.push([nc, nr]);
      }
    }
    return out;
  }
  // précision d'une tour sur une cible (portée comme pour un archer)
  towerToHit(t, f) {
    let th = t.toHit;
    const d = this.dist(t, f); if (!t.magic) { if (d >= 9) th -= 20; else if (d >= 6) th -= 10; }
    if (this.stats(f).ab.lucky) th -= 10;
    return Math.max(0, th);
  }
  // chaque tour debout tire sur la cible où ses traits porteront le plus (briseurs de murs en priorité) ;
  // les tours de pierre ne tirent que tant qu'il reste une garnison pour les servir
  towersFire() {
    for (const t of this.towers) {
      if (t.dead || this.over || !t.shots) continue;
      if (t.kind === 'stone' && !this.alive(t.side).length) continue;
      if (t.mute > 0) { t.mute--; continue; }
      const foes = this.alive(1 - t.side).filter(f => !this.isInvisible(f));
      if (!foes.length) return;
      const kind = t.magic ? 'magic' : 'missile';
      const exp = f => { const th = this.towerToHit(t, f), def = this.defFor(f, kind, t.realm, {}); return def >= 50 ? 0 : t.shots * CombatAI.expPos(t.ranged, th, def, this.toDefend(f, {})); };
      const f = U.max(foes, f => { const e = exp(f), hp = Math.max(1, this.hp(f)); return Units.strength(this.game, f.u) * Math.min(1, e / hp) + (e >= hp * 0.9 ? 5 : 0) + (this.breaksTowers(f) ? 3 : 0) + e * 0.1; });
      const th = this.towerToHit(t, f), rolls = [];
      for (let i = 0; i < t.shots; i++) rolls.push(this.rng.rolls(t.ranged, th));
      const dealt = this.applyRolls(f, rolls, kind, t.realm, {}, null);
      this.ev({ type: 'ranged', a: t.id, d: f.id, kind, realm: t.realm, dealt });
      this.say(U.cap(this.towerName(t)) + ' tire sur ' + this.name(f) + ' : ' + dealt + ' dégâts.');
      this.checkDeath(f);
      this.checkEnd();
    }
  }

  checkDeath(b) {
    if (b.dead || this.hp(b) > 0) return;
    b.dead = true;
    this.dead.push(b);
    this.ev({ type: 'death', id: b.id });
    this.say(this.subj(b, 'est anéanti') + '.');
    // invocation de démons, etc. : rien
  }

  // ---------- capacités spéciales des unités (une fois par combat) ----------
  // all : aussi les capacités déjà utilisées (used) et les sorts trop chers pour la réserve de l'unité (short), pour l'affichage
  unitSpells(b, all) {
    const s = this.stats(b), out = [];
    // une fois par combat ; le Démon légendaire invoque ses démons jusqu'à deux fois (réglage summons du pacte)
    const uses = id => b.usedAbility[id] === true ? 1 : b.usedAbility[id] || 0;
    const max = id => id === 'summon_demons' && b.u.riteDemon && typeof Rite !== 'undefined' ? Rite.cfg(this.game, 'summons') : 1;
    const free = (flag, id) => { if (s.ab[flag] && (all || uses(id) < max(id))) out.push({ id, free: true, key: id, used: uses(id) >= max(id) }); };
    free('fireballSpell', 'fireball'); free('doomBoltSpell', 'doom_bolt'); free('healingSpell', 'healing'); free('webSpell', 'web'); { const room = 9 - this.alive(b.side).length; if (all || room >= (b.u.riteDemon && uses('summon_demons') >= 1 ? 3 : 1)) free('summonDemons', 'summon_demons'); }   // (la seconde invocation du Démon légendaire attend la place pour ses trois démons)   // (pas de place : 9 unités au plus par camp)
    // lanceurs : sorts du héros et sorts de combat du sorcier, payés sur la réserve de l'unité
    if (b.casterMana > 0 || (all && s.caster > 0)) {
      const pl = this.player(b.side);
      const own = DATA.units[b.u.type].spells || [], list = new Set(own);
      const realm = DATA.units[b.u.type].race === 'fantastic' ? DATA.units[b.u.type].realm : null;
      if (pl) for (const id of pl.known) { const sp = DATA.spells[id]; if (sp && sp.combat && (!realm || sp.realm === realm)) list.add(id); }
      for (const id of list) {
        const sp = DATA.spells[id]; if (!sp || !sp.combat || !CombatSpells.implemented(id) || CombatSpells.warded(this, b.side, sp)) continue;
        // rien à gagner ici : pas de place pour une invocation, pas de cible pour le sort
        if (!all && sp.kind === 'summon' && this.alive(b.side).length >= 9) continue;
        if (!all && ['enemyUnit', 'friendlyUnit', 'deadUnit'].includes(CombatSpells.targetType(id)) && !CombatSpells.validTargets(this, b.side, id).length) continue;
        if (!all && CombatAI.pointless(this, b.side, id)) continue;
        const cost = sp.combatCost != null ? sp.combatCost : sp.cost;
        if (cost == null) continue;
        const ok = cost <= b.casterMana;
        if (all) { if (ok || own.includes(id)) out.push({ id, free: false, key: id, cost, short: !ok }); }
        else if (ok && !CombatSpells.alreadyActive(this, b.side, id)) out.push({ id, free: false, key: id, cost });
      }
    }
    return out;
  }

  // ---------- fin de camp / de round ----------
  endSide() {
    if (this.over) return;
    this.side = 1 - this.side;
    if (this.side === DEF_SIDE) this.newRound();
    if (this.side === DEF_SIDE && !this.over) this.towersFire();
    this.resetMoves(this.side);
    this.checkEnd();
  }
  // vortex magique : 4 cases par tour, attiré par l'ennemi ; 5 dégâts sans défense à l'unité traversée,
  // et 33 % de chances d'un éclair perforant de force 5 sur chaque ennemi voisin
  vortexMove(v) {
    const p = (DATA.spells.magic_vortex && DATA.spells.magic_vortex.params) || {};
    for (let step = 0; step < (p.movesPerTurn || 4); step++) {
      const foes = this.alive(1 - v.side);
      const near = foes.length ? U.min(foes, f => Math.max(Math.abs(f.c - v.c), Math.abs(f.r - v.r))) : null;
      let dc, dr;
      if (near && this.rng.chance(0.65)) { dc = Math.sign(near.c - v.c); dr = Math.sign(near.r - v.r); }
      else { dc = this.rng.int(3) - 1; dr = this.rng.int(3) - 1; }
      if (!dc && !dr) dc = 1;
      v.c = U.clamp(v.c + dc, 0, CW - 1); v.r = U.clamp(v.r + dr, 0, CH - 1);
      const t = this.unitAt(v.c, v.r);
      // (Sainte droiture : le vortex est un sort du chaos, il passe sans mordre)
      if (t && t.side !== v.side && !t.u.ench.concat(t.tempEnch).includes('righteousness')) {
        this.takeDamage(t, p.damage || 5, 'normal');
        this.say('Le vortex happe ' + this.name(t) + ' (' + (p.damage || 5) + ').');
        this.ev({ type: 'fx', fx: 'chaos', at: [v.c, v.r] });
        this.checkDeath(t);
      }
      for (const o of this.alive(1 - v.side)) {
        if (Math.max(Math.abs(o.c - v.c), Math.abs(o.r - v.r)) !== 1 || !this.rng.chance((p.adjacentPct || 33) / 100)) continue;
        const d = this.applyRolls(o, [this.rng.rolls(p.adjacentStrength || 5, 30)], 'lightning', 'chaos', { armorPiercing: true });
        if (d) { this.ev({ type: 'fx', fx: 'lightning', at: [o.c, o.r] }); this.checkDeath(o); }
      }
      this.ev({ type: 'vortex', id: v.id, c: v.c, r: v.r });
      if (this.over) return;
    }
  }
  newRound() {
    this.round++;
    for (const v of this.vortices || []) if (!this.over) this.vortexMove(v);
    if (!this.over) this.burnTick();
    // effets par round
    for (const s of [0, 1]) {
      if (this.ench[s].includes('call_lightning')) {
        const foes = this.alive(1 - s); const n = 3 + this.rng.int(3);
        for (let i = 0; i < n && foes.length; i++) {
          const t = this.rng.pick(foes.filter(f => !f.dead)); if (!t) break;
          const dmg = this.rng.rolls(8, 30);
          const d = this.applyRolls(t, [dmg], 'lightning', 'nature', { armorPiercing: true });
          this.say('La foudre frappe ' + this.name(t) + ' (' + d + ').'); this.ev({ type: 'fx', fx: 'lightning', at: [t.c, t.r] });
          this.checkDeath(t);
        }
      }
      if (this.ench[s].includes('wrack')) {
        const hit = [];
        for (const t of this.alive(1 - s)) {
          if (Units.realmOf(t.u) === 'death') continue;
          const fails = this.resistFails(t, 'death', -1, true);
          if (fails) { const d = this.takeDamage(t, fails, 'normal'); hit.push(this.name(t) + ' −' + d); this.ev({ type: 'fx', fx: 'death', at: [t.c, t.r] }); this.checkDeath(t); }
        }
        if (hit.length) this.say('Supplice : ' + hit.join(', ') + ' PV.');
      }
      if (this.ench[s].includes('mana_leak')) {
        let shots = 0, cm = 0;
        for (const t of this.alive(1 - s)) {
          if (t.u.ench.includes('righteousness') || t.tempEnch.includes('righteousness')) continue;   // Droiture : sort de mort sans prise
          if (t.ammo > 0 && this.stats(t).rangedType === 'magic') { t.ammo--; shots++; } if (t.casterMana > 0) { cm += Math.min(5, t.casterMana); t.casterMana = Math.max(0, t.casterMana - 5); }
        }
        const foe = this.player(1 - s); let fm = 0; if (foe && !this.sim) { fm = Math.min(5, foe.mana); foe.mana -= fm; }
        const parts = [];
        const me = this.player(s);
        if (fm) parts.push(foe.human ? 'vous perdez ' + fm + ' mana' : U.cap(me && me.human ? Players.nameFor(this.game, me.id, foe.id) : foe.name) + ' perd ' + fm + ' mana');
        if (cm) parts.push((foe && foe.human ? 'vos lanceurs perdent ' : foe ? 'ses lanceurs perdent ' : 'les lanceurs adverses perdent ') + cm + ' mana');
        if (shots) parts.push(U.n(shots, 'tir magique', 'tirs magiques') + ' en moins');
        if (parts.length) this.say('Fuite de mana : ' + parts.join(', ') + '.');
      }
    }
    for (const b of this.alive()) {
      const s = this.stats(b);
      if (s.ab.regeneration && b.u.dmg > 0) this.heal(b, 1);
    }
    this.checkEnd();
    if (this.round > 50 && !this.over) { this.say('Le combat s\'éternise : l\'attaquant se retire.'); this.finish(DEF_SIDE, ATT_SIDE); }
  }
  checkEnd() {
    if (this.over) return true;
    // les créatures appelées pour ce seul combat ne prennent rien : sans troupe réelle, l'assaillant a perdu
    const a = this.alive(ATT_SIDE).filter(b => !b.possessedNeutral && !b.temp).length, d = this.alive(DEF_SIDE).length;
    if (!a && !d) { this.finish(DEF_SIDE); return true; }
    if (!a) { this.finish(DEF_SIDE); return true; }
    // la tour du sorcier tient encore : la forteresse n'est pas prise
    if (!d && !this.towers.some(t => t.kind === 'spire' && !t.dead)) { this.finish(ATT_SIDE); return true; }
    return false;
  }
  // une retraite possible sans tout perdre : l'assaillant recule sur sa case ; un défenseur en rase campagne doit trouver une case
  // voisine libre (sinon tous périssent) ; une garnison qui abandonne sa cité est perdue
  canEscape(side) {
    if (side === ATT_SIDE) return true;
    if (this.city || this.units.some(b => b.side === side && b.u.guardian != null)) return false;
    const us = this.units.filter(b => b.side === side && !b.temp && this.game.units[b.u.id]).map(b => b.u);
    const a = this.units.find(b => b.side === ATT_SIDE && !b.temp && this.game.units[b.u.id]);
    return !!Game.fleeSpot(this.game, Units.at(this.game, this.plane, this.x, this.y).filter(u => us.includes(u) || u.owner === this.owner(side)), this.plane, this.x, this.y, this.owner(side), a ? [a.u.x, a.u.y] : null);
  }
  // la poursuite : chaque ennemi encore debout prend en chasse deux fuyards au plus, ceux qu'il a le plus de chances de rattraper
  // (les paires les plus favorables d'abord : le cavalier court après les lanciers avant les éclaireurs) ; un fuyard que personne
  // ne poursuit s'échappe. Risque d'être rattrapé : V² / (V² + v²), V la vitesse du poursuivant, v celle du fuyard (à égalité,
  // une chance sur deux ; 2 contre 1 : 20 % ; 1 contre 2 : 80 %), borné à 5-95 %. Seul un volant rattrape un volant. Pris dans une
  // toile ou endormi, on ne court pas ; dans la boue, à demi-vitesse. Les héros s'en tirent toujours.
  speedOf(b) { const s = this.stats(b); return b.web > 0 || b.asleep || b.stasis ? 0 : Math.max(0, s.move || 0); }
  fleePlan(side) {
    const plan = new Map(); for (const b of this.alive(side)) plan.set(b, { risk: 0, by: null });
    const left = this.alive(side).filter(b => !b.u.hero);
    const chasers = this.alive(1 - side).map(f => ({ f, v: this.speedOf(f), fly: !!this.stats(f).flying, cap: Combat_CHASE })).filter(c => c.v > 0).sort((a, b) => b.v - a.v || a.f.id - b.f.id);
    const risk = (c, b) => { if (this.stats(b).flying && !c.fly) return 0; const v = this.speedOf(b), V = c.v; return v <= 0 ? 0.95 : U.clamp(V * V / (V * V + v * v), 0.05, 0.95); };
    while (left.length) {
      let best = null;
      for (const c of chasers) if (c.cap > 0) for (const b of left) { const r = risk(c, b); if (r > 0 && (!best || r > best.r)) best = { c, b, r }; }
      if (!best) break;
      best.c.cap--; left.splice(left.indexOf(best.b), 1); plan.set(best.b, { risk: best.r, by: best.c.f });
    }
    return plan;
  }
  fleeRisk(b) { const e = this.fleePlan(b.side).get(b); return e ? e.risk : 0; }
  flee(side) {
    if (this.over) return;
    this.say((side === ATT_SIDE ? 'L\'attaquant' : 'Le défenseur') + ' bat en retraite.');
    const plan = this.fleePlan(side);
    for (const [b, { risk: p }] of plan) {
      if (p > 0 && this.rng.chance(p)) { b.u.dmg = this.stats(b).maxHp; this.say(this.subj(b, 'est rattrapé') + (Units.plural(b.u) ? ' dans leur fuite.' : ' dans sa fuite.')); this.checkDeath(b); }
    }
    this.fled = side;
    this.finish(1 - side, side);
  }
  finish(winner) {
    if (this.over) return;
    this.over = true; this.winner = winner;
    this.ev({ type: 'end', winner });
  }

  // force de chaque camp (estimation de l'IA) ; remparts et tours comptent pour le défenseur
  forces() {
    const f = [0, 0];
    for (const b of this.units) if (!b.dead && !b.temp) f[b.side] += Units.strength(this.game, b.u);
    if (this.hasWalls) f[DEF_SIDE] *= 1.3;
    for (const t of this.towers) if (!t.dead) f[DEF_SIDE] += t.str;
    return f;
  }
  // expérience de fin de combat, selon sa dureté : 1 + 4 × (force adverse / force du camp, au début), plafonné à 10,
  // +1 par ennemi abattu (3 au plus), héros +50 %, camp vaincu moitié moins. Game.applyBattle l'applique, l'écran de fin l'annonce.
  xpGains() {
    const F = this.startForce || this.forces();
    const out = { ratio: [0, 0], base: [0, 0], units: [] };
    const kills = new Map();
    for (const d of this.dead) { const k = d.lastHitBy; if (k && k.side !== d.side && !k.temp) kills.set(k, (kills.get(k) || 0) + 1); }
    for (const s of [0, 1]) {
      out.ratio[s] = F[1 - s] / Math.max(1, F[s]);
      out.base[s] = Math.round(Math.min(10, 1 + 4 * out.ratio[s]));
    }
    for (const b of this.units) {
      if (b.dead || b.temp || !this.game.units[b.u.id] || Units.isFantastic(b.u)) continue;
      const k = Math.min(3, kills.get(b) || 0);
      let n = out.base[b.side] + k;
      if (b.u.hero) n = Math.round(n * 1.5);
      if (this.winner != null && b.side !== this.winner) n = Math.ceil(n / 2);
      out.units.push({ b, n, kills: k });
    }
    return out;
  }
  // ---------- résultats (appliqués à la partie) ----------
  results() {
    const game = this.game;
    // taken : unités perdues sans mourir pour leur premier camp (asservies, ou tombées et relevées par l'ennemi)
    const res = { winner: this.winner, fled: this.fled, killed: [[], []], undead: [], survivors: [[], []], recalled: [], vanished: [], animated: [], taken: [[], []] };
    for (const b of this.units) {
      if (b.temp) { delete game.units[b.u.id]; continue; }
      // possédée : rend compte à son camp d'origine ; asservie : disparaît ; rappelée : rentre à la forteresse
      const side = b.possessed && b.origSide != null ? b.origSide : b.side;
      if (b.recalled) { res.recalled.push(b.u); continue; }
      // Régénération, même lancée pendant ce combat : les régénérants d'une armée victorieuse se relèvent et guérissent
      const regen = !!this.stats(b).ab.regeneration;
      if (b.dead) {
        if (this.winner === side && !b.possessed && !(b.irrDmg > 0) && regen) { b.u.dmg = 0; res.survivors[side].push(b.u); continue; }
        res.killed[side].push(b.u);
      } else if (b.bound) { res.vanished.push(b.u); if (b.origSide != null) res.taken[b.origSide].push(b.u); }
      else {
        if (b.raisedFrom != null && b.raisedFrom !== b.side) res.taken[b.raisedFrom].push(b.u);
        // un régénérant encore debout guérit après la bataille, même dans le camp vaincu (seul le retour d'entre les morts exige la victoire)
        if (regen) b.u.dmg = Math.min(b.u.dmg, b.irrDmg || 0);
        res.survivors[side].push(b.u); if (b.animated) res.animated.push({ u: b.u, side });
        // les PV donnés par un sort de ce combat (Cœur de lion…) s'en vont avec lui : il reste au moins 1 PV
        Units.fixHp(game, b.u);
      }
    }
    // morts-vivants : unités normales tuées surtout par des dégâts « mort-vivant » au profit du vainqueur
    if (this.winner != null) {
      for (const b of this.dead) {
        if (b.temp || b.side === this.winner || !Units.isNormal(b.u) || b.u.hero || this.stats(b).ab.magicImmunity) continue;
        // tuée surtout par des dégâts « mort-vivant » (au moins autant que les autres)
        if (b.undeadDmg > 0 && b.undeadDmg >= (b.normDmg || 0) && b.undeadDmg >= (b.irrDmg || 0)) res.undead.push(b.u.type);
      }
    }
    return res;
  }
}

// la tour du sorcier d'une cité : sa forteresse, tant qu'il n'est pas banni
Battle.spire = function (game, c) {
  if (!c || !c.fortress) return null;
  const pl = game.players[c.owner];
  if (!pl || !pl.alive || pl.banished || pl.fortress !== c.id) return null;
  const K = Magic.castingSkill(pl);
  const shots = U.clamp(1 + Math.floor((K - 15) / 15), 1, 4), ranged = U.clamp(4 + Math.floor((K - 20) / 10), 3, 8), hp = 10 + Math.floor(Math.max(20, K) / 2);
  const books = pl.books || {}, realm = Object.keys(books).sort((a, b) => books[b] - books[a])[0] || 'sorcery';
  return { hp, maxHp: hp, def: SPIRE.def, shots, ranged, toHit: SPIRE.toHit, magic: true, realm, str: Math.round(shots * ranged * 2 + hp / 2) };
};
// ce que les tours d'une cité ajoutent à sa défense (estimations de l'IA)
Battle.towerStrength = function (game, c) {
  let s = c.buildings.defenseTowers && (c.buildings.cityWalls || Cities.hasEnch(c, 'wall_of_stone')) ? 2 * TOWER.str : 0;
  const sp = Battle.spire(game, c); if (sp) s += sp.str;
  return s;
};

// ---------- sorts de combat ----------
const CombatSpells = {
  // liste des sorts qu'un camp peut lancer maintenant (sorcier)
  wizardOptions(bt, side) {
    const pl = bt.player(side);
    if (!pl || !pl.alive || pl.banished || bt.castThisRound[side] || bt.side !== side) return [];
    const mult = Magic.distanceMult(bt.game, pl, bt.plane, bt.x, bt.y);
    const out = [];
    for (const id of pl.known) {
      const sp = DATA.spells[id]; if (!sp || !sp.combat || !CombatSpells.implemented(id)) continue;
      if (CombatSpells.warded(bt, side, sp)) continue;
      if ((sp.kind === 'summon' || ['raise_dead', 'animate_dead'].includes(id)) && bt.alive(side).length >= 9) continue;   // neuf par camp, morts relevés compris
      const base = Magic.spellCost(bt.game, pl, id, true);
      const cost = Math.max(1, Math.ceil(base * mult));
      if (base > bt.skillLeft[side] || cost > pl.mana || CombatSpells.alreadyActive(bt, side, id)) continue;
      out.push({ id, cost, base });
    }
    return out;
  },
  // Garde magique de la cité assiégée : les sorts de son royaume y sont interdits à l'assaillant
  warded(bt, side, sp) {
    if (!bt.city || bt.owner(side) === bt.city.owner || !sp) return false;
    return bt.city.ench.some(e => e.spell === 'spell_ward' && e.realm === sp.realm);
  },
  // Lumière vraie et Ténèbres s'annulent : la nouvelle chasse l'autre
  lightDark(bt, side, id, other) {
    const had = bt.globalEnch.includes(other) || bt.ench.some(e => e.includes(other));
    bt.globalEnch = bt.globalEnch.filter(e => e !== other); bt.ench = bt.ench.map(e => e.filter(x => x !== other)); delete bt.globalBy[other];
    if (had) bt.say((DATA.spells[other] ? DATA.spells[other].name : other) + ' se dissipe.');
    bt.globalEnch.push(id); bt.globalBy[id] = side;
  },
  // enchantement de champ de bataille déjà en place : le relancer ne sert à rien (la contre-magie, elle, se recharge)
  alreadyActive(bt, side, id) {
    const sp = DATA.spells[id];
    if (!sp || sp.kind !== 'combatEnchant' || id === 'counter_magic') return false;
    // Lumière vraie et Ténèbres baignent tout le champ, quel que soit le camp qui les a apportées
    if (id === 'true_light' || id === 'darkness' || id === 'warp_reality') return bt.ench[0].includes(id) || bt.ench[1].includes(id) || bt.globalEnch.includes(id);
    // sous la Grande Prière, la Prière n'ajouterait rien
    if (id === 'prayer' && bt.ench[side].includes('high_prayer')) return true;
    return bt.ench[side].includes(id) || bt.globalEnch.includes(id);
  },
  implemented(id) { return !!COMBAT_SPELL_HANDLERS[id] || ['unitEnchant'].includes(DATA.spells[id] && DATA.spells[id].kind); },
  targetType(id) {
    if (id === 'summon_demons') return 'none';
    const sp = DATA.spells[id]; if (!sp) return 'none';
    if (sp.kind === 'summon') return 'none';
    if (['raise_dead', 'animate_dead'].includes(id)) return 'deadUnit';
    if (['earth_to_mud', 'disrupt', 'magic_vortex'].includes(id)) return 'combatTile';
    if (sp.target === 'friendlyUnit' || sp.target === 'friendlyHero') return 'friendlyUnit';
    if (sp.target === 'enemyUnit') return 'enemyUnit';
    if (sp.target === 'anyUnit') return 'anyUnit';
    return 'none';
  },
  validTargets(bt, side, id) {
    const tt = CombatSpells.targetType(id);
    const sp = DATA.spells[id];
    if (tt === 'friendlyUnit') return bt.alive(side).filter(b => (!sp || sp.target !== 'friendlyHero' || !!b.u.hero) && CombatSpells.canAffect(bt, b, id));
    if (tt === 'enemyUnit') return bt.alive(1 - side).filter(b => !bt.isInvisible(b) && CombatSpells.canAffect(bt, b, id)).concat(CombatSpells.TOWER_HIT[id] ? bt.enemyTowers(side) : []);
    if (tt === 'anyUnit') {
      if (id !== 'dispel_magic' && id !== 'dispel_magic_true') return bt.alive();
      // la dissipation : un ennemi enchanté ou créature du combat ; une des vôtres maudite, prise, endormie, confuse ou possédée
      return bt.alive().filter(b => b.side !== side ? (!bt.isInvisible(b) && (b.u.ench.length || b.tempEnch.length || (b.u.combatOnly && Units.isFantastic(b.u)) || (b.possessed && b.origSide === side)))
        : (b.curses.length || b.web > 0 || b.asleep || b.confused));
    }
    // Relever les morts : vos unités normales ; Animation des morts : toute unité tombée (sauf les héros)
    if (tt === 'deadUnit') return bt.alive(side).length >= 9 ? [] : bt.dead.filter(b => !b.temp && !b.recalled && !(b.irrDmg > 0) && !b.u.hero && (id === 'animate_dead' || (Units.isNormal(b.u) && b.side === side)));
    return [];
  },
  // les sorts déclarés exclusifs de id (params.exclusiveWith === id), dans l'ordre des données (relevés une fois : les données ne changent pas)
  exclusiveOf(id) {
    const m = CombatSpells._excl || (CombatSpells._excl = new Map());
    let l = m.get(id);
    if (!l) { l = Object.values(DATA.spells).filter(o => o.params && o.params.exclusiveWith === id); m.set(id, l); }
    return l;
  },
  canAffect(bt, b, id) {
    const sp = DATA.spells[id], s = bt.stats(b), p = sp.params || {};
    if (p.normalOnly && !Units.isNormal(b.u)) return false;
    if (p.fantasticOnly && !Units.isFantastic(b.u)) return false;
    if (p.onlyRealms && !p.onlyRealms.includes(Units.realmOf(b.u))) return false;
    if (sp.kind === 'unitEnchant' && (b.u.ench.includes(id) || b.tempEnch.includes(id))) return false;
    if (sp.kind === 'unitEnchant' && p.exclusiveWith && (b.u.ench.includes(p.exclusiveWith) || b.tempEnch.includes(p.exclusiveWith))) return false;
    if (sp.kind === 'unitEnchant' && CombatSpells.exclusiveOf(id).some(o => b.u.ench.includes(o.id) || b.tempEnch.includes(o.id))) return false;
    if ((sp.kind === 'curse' || sp.kind === 'damage' || sp.kind === 'resistOrDie' || sp.kind === 'areaDamage') && s.ab.magicImmunity && id !== 'doom_bolt') return false;
    // un renfort que l'unité possède déjà par nature ne sert à rien (Vol sur un dragon, Immunité magique sur un immunisé…)
    if (sp.kind === 'unitEnchant') { const ab = [].concat(p.ability || []); if (id === 'flight' ? s.flying : ab.length && ab.every(a => s.ab[a]) && !p.damageReduction) return false; if (Units.enchantUseless(bt.game, b.u, id)) return false; }
    if (id === 'warp_wood' && !(s.rangedType === 'missile' && b.ammo > 0)) return false;
    if (id === 'berserk' && !(s.melee > 0)) return false;
    if (id === 'giant_strength' && !(s.melee > 0) && !(s.thrown > 0)) return false;
    if (id === 'spell_lock' && !b.u.ench.concat(b.tempEnch).some(e => e !== 'spell_lock')) return false;   // rien à protéger
    if (b.u.riteDemon && ['banish', 'confusion'].includes(id)) return false;   // le Démon légendaire ne cède ni au Bannissement ni à la Confusion
    if ((id === 'word_of_recall' || id === 'recall_hero') && (b.temp || b.possessed)) return false;   // ni une invocation du combat, ni une créature prise à l'ennemi   // sans mêlée, la Furie ne ferait que retirer la défense
    if (sp.kind === 'curse' && b.curses.includes(id)) return false;
    if (id === 'warp_creature' && !CombatSpells.warpLeft(b).length) return false;
    if (id === 'disintegrate' && bt.resFor(b, 'chaos') >= 10) return false;   // résistance 10 ou plus : la désintégration échoue à coup sûr
    // résistance 50 (Charmé, Droiture, immunités) : un sort à jet de résistance échoue à coup sûr
    const RS = CombatSpells.RESIST_SPELLS[id] || (id === 'life_drain' ? ['death'] : null);
    if (RS && bt.resFor(b, RS[0]) >= 50) return false;
    // Bois tordu vise l'unité : l'immunité à la magie et la Droiture (sort du chaos) l'arrêtent
    if (id === 'warp_wood' && (s.ab.magicImmunity || b.u.ench.concat(b.tempEnch).includes('righteousness'))) return false;
    // cibles que le sort ne peut pas toucher, ou qui le subissent déjà
    if (p.targets && !p.targets.some(k => k === 'fantastic' ? Units.isFantastic(b.u) : k === 'undead' ? Units.isUndead(b.u) : false)) return false;
    if (p.noHeroes && b.u.hero) return false;
    const hostile = ['curse', 'damage', 'resistOrDie', 'areaDamage'].includes(sp.kind);
    if (hostile && sp.realm === 'death' && s.ab.deathImmunity) return false;
    if (hostile && (sp.realm === 'death' || sp.realm === 'chaos') && b.u.ench.concat(b.tempEnch).includes('righteousness')) return false;
    if (p.damage === 'fire' && s.ab.fireImmunity) return false;
    if (p.damage === 'cold' && s.ab.coldImmunity) return false;
    if (id === 'black_sleep' && b.asleep) return false;
    if (id === 'confusion' && b.confused) return false;
    if (id === 'web' && b.web > 0) return false;
    if ((id === 'possession' || id === 'creature_binding') && b.possessed) return false;
    if (id === 'petrify' && s.ab.stoningImmunity) return false;
    if (id === 'mind_storm' && s.ab.illusionsImmunity) return false;
    if (id === 'web' && (s.ab.nonCorporeal)) return false;
    if (id === 'cracks_call' && (s.flying || s.ab.nonCorporeal)) return false;
    if (id === 'healing' && b.u.dmg <= (b.irrDmg || 0)) return false;   // les blessures irréversibles ne se soignent pas
    if (id === 'healing' && Units.realmOf(b.u) === 'death') return false;
    return true;
  },

  // lance un sort ; caster = null pour le sorcier, sinon unité lanceuse
  cast(bt, side, id, target, caster, extra) {
    const sp = DATA.spells[id] || { id, name: id === 'summon_demons' ? 'Invocation de démons' : id, kind: 'special', params: {} };
    const pl = bt.player(side);
    // une cible d'unité doit être valable (vivante, visible, sensible au sort ; un mort relevable)
    const tt0 = CombatSpells.targetType(id);
    // une case : sur le champ de bataille ; Disruption : un ouvrage qu'elle peut abattre (refusé sans rien payer sinon)
    if (tt0 === 'combatTile') {
      const [c0, r0] = Array.isArray(target) ? target : target ? [target.c, target.r] : [-1, -1];
      if (!(c0 >= 0 && r0 >= 0 && c0 < CW && r0 < CH)) return false;
      if (id === 'disrupt' && !CombatSpells.disruptTargets(bt, side).some(([c, r]) => c === c0 && r === r0)) return false;
    }
    if (!target && ['enemyUnit', 'friendlyUnit', 'deadUnit'].includes(tt0)) return false;
    if (target && !target.tower && !Array.isArray(target) && ['enemyUnit', 'friendlyUnit', 'deadUnit'].includes(tt0) && !CombatSpells.validTargets(bt, side, id).includes(target)) return false;
    // paiement (le mana ajouté à un sort à puissance variable se paie comme le reste, compétence comprise)
    extra = Math.max(0, Math.min(extra || 0, CombatSpells.MAX_EXTRA[id] || 0));
    if (!caster) {
      const base = Magic.spellCost(bt.game, pl, id, true) + extra;
      const cost = Math.max(1, Math.ceil(base * Magic.distanceMult(bt.game, pl, bt.plane, bt.x, bt.y)));
      if (base > bt.skillLeft[side] || cost > pl.mana) return false;
      bt.skillLeft[side] -= base; pl.mana -= cost; bt.castThisRound[side] = true;
      pl.manaSpentCombat = (pl.manaSpentCombat || 0) + cost;
    } else {
      const opt = bt.unitSpells(caster).find(o => o.id === id);
      if (!opt) return false;
      if (opt.free) { const n = caster.usedAbility[opt.key]; caster.usedAbility[opt.key] = (n === true ? 1 : n || 0) + 1; extra = 0; }   // un pouvoir inné ne se renforce pas
      else { if (opt.cost + extra > caster.casterMana) return false; caster.casterMana -= opt.cost + extra; }
      caster.moves = 0;
    }
    // flux du nœud : dissipation de force 50 pour les sorts d'un autre royaume
    const nf = CombatSpells.nodeFizzle(bt, side, id, extra);
    if (nf > 0 && bt.rng.chance(nf)) {
      bt.say((sp.name || id) + ' se dissout dans le flux du nœud.');
      bt.ev({ type: 'fx', fx: 'fizzle', at: target && target.c != null ? [target.c, target.r] : null });
      return true;
    }
    // contre-magie adverse
    if (bt.ench[1 - side].includes('counter_magic') && bt.counterMagic[1 - side] > 0) {
      const strength = bt.counterMagic[1 - side];
      const cost = Math.max(1, sp.combatCost || sp.cost || 10);
      bt.counterMagic[1 - side] = Math.max(0, strength - 5);   // chaque tentative use la réserve
      if (bt.rng.chance(strength / (strength + cost))) { bt.say((sp.name || 'Le sort') + ' est contré !'); bt.ev({ type: 'fx', fx: 'fizzle', at: target && target.c != null ? [target.c, target.r] : null }); return true; }
    }
    bt.say((caster ? bt.name(caster) : (pl ? pl.name : 'Le sorcier')) + ' lance ' + (sp.name || id) + '.');
    bt.ev({ type: 'spell', spell: id, side, caster: caster ? caster.id : null, target: target && target.c != null ? [target.c, target.r] : null });
    const h = COMBAT_SPELL_HANDLERS[id];
    if (target && target.tower) CombatSpells.strikeTower(bt, id, target, extra || 0);
    else if (h) h(bt, side, target, sp, caster, extra || 0);
    else if (sp.kind === 'unitEnchant' && target) { target.tempEnch.push(id); }
    bt.refreshInvisible();
    for (const b of bt.units) if (!b.dead) bt.checkDeath(b);
    bt.checkEnd();
    return true;
  },

  // chances qu'un sort ciblé réussisse sur une unité, d'après les mêmes jets que ses effets (affichées au survol de la cible) :
  // royaume de la résistance, malus imposé, et s'il frappe chaque figurine (résister ou périr) ou l'unité d'un seul jet
  RESIST_SPELLS: { dispel_evil: ['life', b => Units.isUndead(b.u) ? 9 : 4, true], word_of_death: ['death', 5, true], petrify: ['nature', 0, true], banish: ['sorcery', 3, true],
    weakness: ['death', 2], black_sleep: ['death', 2], confusion: ['sorcery', 4], vertigo: ['sorcery', 0], shatter: ['chaos', 0], warp_creature: ['chaos', 1], possession: ['death', 1], creature_binding: ['sorcery', 2] },
  odds(bt, side, id, t, extra) {
    if (!t || t.tower) return null;
    extra = extra || 0;
    const sp = DATA.spells[id] || {}, R = CombatSpells.RESIST_SPELLS[id];
    let out;
    if (R) {
      const mod = (typeof R[1] === 'function' ? R[1](t) : R[1]) + (id === 'banish' ? Math.floor(extra / 15) : 0), res = bt.resFor(t, R[0]);
      const p = res >= 50 ? 0 : U.clamp(10 - (res - mod), 0, 10) / 10, n = R[2] ? Math.max(1, bt.figures(t)) : 1;
      out = { p, n, perFigure: !!R[2], all: Math.pow(p, n), any: 1 - Math.pow(1 - p, n), res, mod, immune: res >= 50 };
    } else if (id === 'disintegrate') { const res = bt.resFor(t, 'chaos'); out = { p: res < 10 ? 1 : 0, n: 1, res, threshold: 10, immune: res >= 10 }; }
    else if (id === 'cracks_call') out = { p: .25, n: 1 };
    else if (id === 'dispel_magic' || id === 'dispel_magic_true') {
      const items = CombatSpells.dispelOdds(bt, side, t, CombatSpells.dispelStrength(id, extra)); if (!items.length) return null;
      const none = items.reduce((a, o) => a * (1 - o.p), 1); out = { dispel: items, p: 1 - none };
    }
    else if (id === 'life_drain') { const res = bt.resFor(t, 'death'), mod = Math.floor(extra / 5); let s = 0; for (let k = 1; k <= 10; k++) s += Math.max(0, k - (res - mod)); out = { drain: Math.min(bt.hp(t), s / 10), res, mod, immune: res >= 50 }; }
    else if (CombatSpells.DAMAGE[id]) out = CombatSpells.damageForecast(bt, id, t, extra);
    else return null;
    // le sort doit d'abord passer le flux d'un nœud et la contre-magie adverse
    let pass = 1 - CombatSpells.nodeFizzle(bt, side, id, extra);
    if (bt.ench[1 - side].includes('counter_magic') && bt.counterMagic[1 - side] > 0) { const s = bt.counterMagic[1 - side], cost = Math.max(1, sp.combatCost || sp.cost || 10); pass *= 1 - s / (s + cost); }
    out.pass = pass;
    out.chance = (out.p != null ? (out.perFigure && out.n > 1 ? out.any : out.p) : out.drain > 0 || out.dmg > 0 ? 1 : 0) * pass;
    return out;
  },
  // sorts à puissance variable : le mana qu'on peut y ajouter au plus (au-delà, plus rien ne change), le pas utile,
  // et ce que le supplément change (affiché au réglage)
  MAX_EXTRA: { fire_bolt: 20, lightning_bolt: 40, ice_bolt: 40, psionic_blast: 40, fireball: 60, life_drain: 40, banish: 60, dispel_magic: 40, dispel_magic_true: 40, counter_magic: 40, disenchant_area: 100, disenchant_true: 100 },
  EXTRA_STEP: { psionic_blast: 2, fireball: 3, life_drain: 5, banish: 15 },
  powerText(id, x) {
    const sp = DATA.spells[id] || {}, c = sp.combatCost || sp.cost || 10;
    switch (id) {
      case 'fire_bolt': return 'force ' + Math.min(25, 5 + x);
      case 'lightning_bolt': return 'force ' + Math.min(45, 5 + x);
      case 'ice_bolt': return 'force ' + Math.min(50, 10 + x);
      case 'psionic_blast': return 'force ' + Math.min(25, 5 + Math.floor(x / 2));
      case 'fireball': return 'force ' + Math.min(25, 5 + Math.floor(x / 3));
      case 'life_drain': return 'résistance de la cible −' + Math.floor(x / 5);
      case 'banish': return 'résistance de la cible −' + (3 + Math.floor(x / 15));
      case 'dispel_magic': case 'counter_magic': return 'force de dissipation ' + (c + x);
      case 'dispel_magic_true': return 'force de dissipation ' + 3 * (c + x);
      case 'disenchant_area': return 'force de dissipation ' + (50 + x);
      case 'disenchant_true': return 'force de dissipation ' + (150 + 3 * x);
    }
    return '';
  },
  // le mana qu'on peut encore ajouter à ce sort : son plafond utile, et ce que permettent compétence et mana (ou la réserve du lanceur)
  maxExtra(bt, side, id, caster) {
    const cap = CombatSpells.MAX_EXTRA[id] || 0; if (!cap) return 0;
    if (caster) { const opt = bt.unitSpells(caster).find(o => o.id === id); return !opt || opt.free ? 0 : Math.max(0, Math.min(cap, caster.casterMana - opt.cost)); }
    const pl = bt.player(side); if (!pl) return 0;
    const base = Magic.spellCost(bt.game, pl, id, true), mult = Magic.distanceMult(bt.game, pl, bt.plane, bt.x, bt.y);
    let x = Math.min(cap, bt.skillLeft[side] - base);
    while (x > 0 && Math.max(1, Math.ceil((base + x) * mult)) > pl.mana) x--;
    return Math.max(0, x);
  },
  // sorts de dégâts ciblés : comment ils frappent (mêmes formules que leurs effets ; x : mana ajouté)
  DAMAGE: {
    fire_bolt: x => ({ rolls: [Math.min(25, 5 + x)], kind: 'fire', realm: 'chaos' }),
    lightning_bolt: x => ({ rolls: [Math.min(45, 5 + x)], kind: 'lightning', realm: 'chaos', mods: { armorPiercing: true } }),
    ice_bolt: x => ({ rolls: [Math.min(50, 10 + x)], kind: 'cold', realm: 'nature' }),
    psionic_blast: x => ({ rolls: [Math.min(25, 5 + Math.floor(x / 2))], kind: 'magic', realm: 'sorcery' }),
    star_fires: () => ({ rolls: [15], kind: 'magic', realm: 'life' }),
    warp_lightning: () => ({ rolls: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1], kind: 'lightning', realm: 'chaos', mods: { armorPiercing: true } }),
    fireball: x => ({ area: Math.min(25, 5 + Math.floor(x / 3)), kind: 'fire', realm: 'chaos' }),
    doom_bolt: () => ({ fixed: 10 }),
  },
  // dégâts attendus, part des lancers sans effet et chance de détruire l'unité, par tirages simulés
  // (Math.random : le générateur de la bataille n'est pas touché), comme applyRolls / applyArea
  damageForecast(bt, id, t, x, n, rnd) {
    n = n || 600;
    const R = rnd || Math.random;
    const D = CombatSpells.DAMAGE[id](x || 0), s = bt.stats(t), hp0 = bt.hp(t);
    if (D.fixed != null) { const d = Math.min(hp0, D.fixed); return { dmg: d, zero: d > 0 ? 0 : 1, kill: d >= hp0 ? 1 : 0, hp: hp0, immune: false }; }
    const mods = D.mods || {}, magicKind = ['magic', 'fire', 'cold', 'lightning'].includes(D.kind);
    const def = bt.defFor(t, D.kind, D.realm, mods, s), td = bt.toDefend(t, mods, s);
    if ((magicKind && s.ab.magicImmunity) || def >= 50) return { dmg: 0, zero: 1, kill: 0, hp: hp0, immune: true };
    const invuln = t.u.ench.concat(t.tempEnch).includes('invulnerability'), blur = bt.ench[t.side].includes('blur');
    const roll = (k, p) => { let r = 0; for (let i = 0; i < k; i++) if (R() * 100 < p) r++; return r; };
    const reduce = d => { if (invuln) d = Math.max(0, d - 2); if (blur) { let o = 0; for (let i = 0; i < d; i++) if (R() >= 0.1) o++; d = o; } return d; };
    const per = s.hp, lead0 = bt.leadHp(t), figs = bt.figures(t);
    let total = 0, zero = 0, kills = 0;
    for (let k = 0; k < n; k++) {
      let dealt = 0;
      if (D.area) {   // chaque figurine pare pour elle-même
        for (let f = 0; f < figs; f++) { const fd = Math.min(roll(D.area, 30) - roll(def, td), per); if (fd > 0) dealt += invuln ? Math.max(0, fd - 2) : fd; }
        dealt = Math.min(dealt, hp0);
      } else {
        let hp = hp0, lead = lead0;
        for (const st of D.rolls) {
          if (hp <= 0) break;
          let d = reduce(roll(st, 30));
          while (d > 0 && hp > 0) { d -= roll(def, td); if (d > 0) { const take = Math.min(lead, d); hp -= take; lead -= take; dealt += take; d -= take; if (lead <= 0) lead = per; } }
        }
      }
      total += dealt; if (!dealt) zero++; if (dealt >= hp0) kills++;
    }
    return { dmg: total / n, zero: zero / n, kill: kills / n, hp: hp0, immune: false };
  },
  // combat sur un nœud (MoM) : tout sort qui n'est pas du royaume du nœud subit une dissipation de force 50,
  // soit coût / (coût + 50) de chances de passer ; la Maîtrise des nœuds en protège le sorcier et ses troupes
  NODE_DISPEL: 50,
  nodeFizzle(bt, side, id, extra) {
    if (!bt.nodeRealm) return 0;
    const sp = DATA.spells[id], realm = sp ? sp.realm : id === 'summon_demons' ? 'death' : null;
    if (realm === bt.nodeRealm) return 0;
    const pl = bt.player(side); if (pl && pl.retorts && pl.retorts.includes('nodeMastery')) return 0;
    const cost = Math.max(1, (sp && (sp.combatCost || sp.cost)) || 10) + (extra || 0);
    return CombatSpells.NODE_DISPEL / (CombatSpells.NODE_DISPEL + cost);
  },
  // sorts qui touchent une tour de défense : les traits de destruction ébranlent la pierre (dégâts doublés, sans défense),
  // le Trait funeste et la Foudre distordue l'abattent presque, l'Appel des failles l'engloutit une fois sur trois ; Disruption la rase (sort de case)
  TOWER_HIT: {
    fire_bolt: (bt, x) => 2 * bt.rng.rolls(Math.min(25, 5 + x), 30),
    lightning_bolt: (bt, x) => 2 * bt.rng.rolls(Math.min(45, 5 + x), 30),
    ice_bolt: (bt, x) => 2 * bt.rng.rolls(Math.min(50, 10 + x), 30),
    psionic_blast: (bt, x) => 2 * bt.rng.rolls(Math.min(25, 5 + Math.floor(x / 2)), 30),
    doom_bolt: () => 20,
    warp_lightning: bt => { let t = 0; for (let s = 10; s >= 1; s--) t += bt.rng.rolls(s, 30); return t; },
    cracks_call: (bt, x, t) => bt.rng.chance(0.35) ? t.hp : 0,
  },
  // sorts de siège : utiles seulement devant des tours (Trompettes : tours ou remparts)
  // ce que Disruption peut abattre : tours de pierre et portes ennemies ; pour l'assaillant, les pans de muraille debout
  disruptTargets(bt, side) {
    const out = bt.enemyTowers(side).filter(t => t.kind === 'stone' || t.kind === 'gate').map(t => [t.c, t.r]);
    if (bt.hasWalls && side === ATT_SIDE) for (const k in bt.walls) { const w = bt.walls[k]; if (w.broken || w.gate) continue; const [c, r] = k.split(',').map(Number); if (!out.some(([a, b]) => a === c && b === r)) out.push([c, r]); }
    return out;
  },
  siegeUseful(bt, side, id) {
    const tw = bt.enemyTowers(side);
    if (id === 'jericho_trumpets') return tw.some(t => t.kind === 'stone' || t.kind === 'spire' || t.kind === 'gate') || (bt.hasWalls && side === ATT_SIDE && Object.values(bt.walls).some(w => !w.gate && !w.broken));
    if (id === 'haunted_ramparts') return tw.some(t => t.kind === 'stone' && !(t.mute > 0));
    if (id === 'flux_rupture') return tw.some(t => t.kind === 'spire' && !(t.mute > 0));
    return true;
  },
  strikeTower(bt, id, t, extra) {
    const f = CombatSpells.TOWER_HIT[id]; if (!f) return;
    const n = bt.damageTower(t, f(bt, extra, t), true);
    const sp = DATA.spells[id];
    bt.say((sp ? sp.name : id) + ' : ' + (n ? n + ' dégâts à ' + bt.towerName(t) + '.' : bt.towerName(t) + ' tient bon.'));
    bt.settleTower(t);
    bt.ev({ type: 'fx', fx: id === 'cracks_call' ? 'stone' : id === 'ice_bolt' ? 'cold' : id === 'psionic_blast' ? 'magic' : id === 'lightning_bolt' || id === 'warp_lightning' ? 'lightning' : 'fire', at: [t.c, t.r] });
  },
  damageSpell(bt, t, strength, kind, realm, mods, label) {
    const dmg = bt.rng.rolls(strength, 30);
    const d = bt.applyRolls(t, [dmg], kind, realm, mods || {});
    bt.say((label || 'Le sort') + (d > 0 ? ' inflige ' + U.n(d, 'point', 'points') + ' de dégâts à ' + bt.name(t) : ' ne fait aucun dégât à ' + bt.name(t)) + '.');
    bt.ev({ type: 'fx', fx: kind, at: [t.c, t.r] });
    return d;
  },
  WARP_TEXT: { warp_creature_melee: 'attaque de mêlée divisée par 2', warp_creature_def: 'défense divisée par 2', warp_creature_res: 'résistance à 0' },
  warpLeft(b) { return Object.keys(CombatSpells.WARP_TEXT).filter(w => !b.curses.includes(w)); },
  // pourquoi un soin n'a rien à faire : personne de blessé, des blessures irréversibles, ou des créatures de la mort
  healWhy(bt, side) {
    const hurt = bt.alive(side).filter(b => b.u.dmg > 0);
    if (!hurt.length) return 'Aucune de vos unités n\'est blessée.';
    if (hurt.every(b => Units.realmOf(b.u) === 'death' || b.u.dmg <= (b.irrDmg || 0))) return hurt.some(b => Units.realmOf(b.u) !== 'death') ? 'Les blessures de vos unités sont irréversibles (pétrification, désintégration…) : rien à soigner.' : 'Vos blessés sont des créatures de la mort : les soins ne les touchent pas.';
    return 'Aucune cible à soigner.';
  },
  // un sort sur tout le champ de bataille qui ne changerait rien ici : la raison, sinon null
  uselessWhy(bt, side, id) {
    const mine = bt.alive(side), foes = bt.alive(1 - side), realm = b => Units.realmOf(b.u);
    if (id === 'wall_of_fire' || id === 'wall_of_darkness') { if (!bt.city || side !== DEF_SIDE || bt.owner(side) !== bt.city.owner) return 'Ne se lance qu\'en défendant sa propre cité.'; if (id === 'wall_of_fire' ? bt.wallOfFire : bt.wallOfDarkness) return 'Ce mur entoure déjà la cité.'; }
    if (id === 'flame_strike' && !foes.some(b => CombatSpells.canAffect(bt, b, id))) return 'Vos ennemis sont tous insensibles au feu : sans effet ici.';
    if (DATA.spells[id] && DATA.spells[id].params && DATA.spells[id].params.siege && !CombatSpells.siegeUseful(bt, side, id)) return 'Aucune tour ennemie sur laquelle agir ici.';
    if ((id === 'disenchant_area' || id === 'disenchant_true') && !bt.alive(1 - side).some(f => f.u.ench.length || f.tempEnch.length) && !bt.alive(side).some(f => f.curses.length || f.asleep || f.confused || f.web > 0) && !bt.ench[1 - side].length && !bt.globalEnch.some(e => bt.globalBy[e] === 1 - side)) return 'Aucun enchantement ennemi ni maléfice à dissiper ici.';
    const active = (sp, sd) => bt.ench[sd].includes(sp) || (bt.globalEnch.includes(sp) && bt.globalBy[sp] === sd);
    const lr = b => Battle.lightRealm(b.u);
    if (id === 'true_light' && !mine.some(b => lr(b) === 'life') && !foes.some(b => lr(b) === 'death') && !active('darkness', 1 - side)) return 'Aucune créature de la vie dans vos rangs ni de la mort en face : sans effet ici.';
    if (id === 'darkness' && !mine.some(b => lr(b) === 'death') && !foes.some(b => lr(b) === 'life') && !active('true_light', 1 - side)) return 'Aucune créature de la mort dans vos rangs ni de la vie en face : sans effet ici.';
    if (id === 'holy_word' && !foes.some(b => Units.isFantastic(b.u) || Units.isUndead(b.u))) return 'Aucune créature invoquée ni morte-vivante en face.';
    if (id === 'wrack' && !foes.some(b => realm(b) !== 'death')) return 'Vos ennemis relèvent tous de la mort : sans effet ici.';
    const deathMod = { terror: -1, wrack: -1, death_spell: 2 }[id];
    if (deathMod != null && !foes.some(b => (id !== 'wrack' || realm(b) !== 'death') && bt.resFor(b, 'death') - deathMod < 10)) return 'Aucun ennemi ne peut y être sensible ici.';
    if (id === 'metal_fires' && !mine.some(b => Units.isNormal(b.u))) return 'Aucune unité normale dans vos rangs.';
    if (id === 'entangle' && !foes.some(b => { const s = bt.stats(b); return !s.flying && !s.ab.nonCorporeal; })) return 'Vos ennemis volent ou sont immatériels : sans effet ici.';
    if (id === 'mass_healing' && !mine.some(b => realm(b) !== 'death' && b.u.dmg > (b.irrDmg || 0))) return CombatSpells.healWhy(bt, side);
    if (id === 'counter_magic' && !bt.player(1 - side) && !foes.some(f => bt.unitSpells(f, true).length)) return 'Aucun lanceur de sorts en face : sans effet ici.';
    return null;
  },
  summonTemp(bt, side, type, n) {
    const pid = bt.owner(side);
    const near = bt.home(side);
    const out = [];
    for (let i = 0; i < (n || 1); i++) {
      if (bt.alive(side).length >= 9) break;
      const u = Units.create(bt.game, type, pid, bt.plane, bt.x, bt.y);
      u.combatOnly = true;
      const pos = bt.freeTileNear(near);
      const b = bt.addUnit(u, side, 0, 1, { pos, temp: true });
      b.moves = 0; b.maxMoves = Units.stats(bt.game, u).move * 2;
      out.push(b);
      bt.ev({ type: 'summon', id: b.id, at: pos });
    }
    return out;
  },
};

const COMBAT_SPELL_HANDLERS = {
  wall_of_darkness(bt, side) { bt.wallOfDarkness = true; bt.say('Une nuit opaque enveloppe ' + bt.city.name + '.'); },
  wall_of_fire(bt, side) { bt.wallOfFire = true; bt.say('Un mur de flammes encercle ' + bt.city.name + '.'); bt.ev({ type: 'fx', fx: 'fire', at: [Math.round((CITY_MIN + CITY_MAX) / 2), Math.round((CITY_MIN + CITY_MAX) / 2)] }); },
  fire_bolt(bt, side, t, sp, c, extra) { CombatSpells.damageSpell(bt, t, Math.min(25, 5 + extra), 'fire', 'chaos', {}, sp.name); },
  lightning_bolt(bt, side, t, sp, c, extra) { CombatSpells.damageSpell(bt, t, Math.min(45, 5 + extra), 'lightning', 'chaos', { armorPiercing: true }, sp.name); },
  ice_bolt(bt, side, t, sp, c, extra) { CombatSpells.damageSpell(bt, t, Math.min(50, 10 + extra), 'cold', 'nature', {}, sp.name); },
  psionic_blast(bt, side, t, sp, c, extra) { CombatSpells.damageSpell(bt, t, Math.min(25, 5 + Math.floor(extra / 2)), 'magic', 'sorcery', {}, sp.name); },
  star_fires(bt, side, t, sp) { CombatSpells.damageSpell(bt, t, 15, 'magic', 'life', {}, sp.name); },
  fireball(bt, side, t, sp, c, extra) { const d = bt.applyArea(t, Math.min(25, 5 + Math.floor(extra / 3)), 'fire', 'chaos'); bt.say('Boule de feu : ' + d + ' dégâts.'); bt.ev({ type: 'fx', fx: 'fire', at: [t.c, t.r] }); },
  flame_strike(bt, side, t0, sp) { for (const t of bt.alive(1 - side)) { if (!CombatSpells.canAffect(bt, t, 'flame_strike')) continue; const d = bt.applyArea(t, 15, 'fire', 'chaos'); bt.say((sp ? sp.name : 'Frappe de flammes') + ' : ' + d + ' dégâts à ' + bt.name(t) + '.'); bt.ev({ type: 'fx', fx: 'fire', at: [t.c, t.r] }); } },
  doom_bolt(bt, side, t) { const d = bt.takeDamage(t, 10, 'normal'); bt.say('Trait funeste : ' + d + ' dégâts à ' + bt.name(t) + '.'); bt.ev({ type: 'fx', fx: 'doom', at: [t.c, t.r] }); },
  warp_lightning(bt, side, t) { let tot = 0; for (let s = 10; s >= 1 && !t.dead && bt.hp(t) > 0; s--) tot += bt.applyRolls(t, [bt.rng.rolls(s, 30)], 'lightning', 'chaos', { armorPiercing: true }); bt.say('Foudre distordue : ' + tot + ' dégâts à ' + bt.name(t) + '.'); bt.ev({ type: 'fx', fx: 'lightning', at: [t.c, t.r] }); },
  life_drain(bt, side, t, sp, c, extra) {
    const mod = Math.floor(extra / 5); const res = bt.resFor(t, 'death');
    const dmg = Math.max(0, bt.rng.int(10) + 1 - (res - mod));
    const d = bt.takeDamage(t, dmg, 'undead'); bt.say('Drain de vie : ' + d + ' points volés.');
    // un héros lanceur récupère les PV volés ; le sorcier, lui, en tire 3 mana par PV
    const pl = bt.player(side);
    if (c) bt.heal(c, d); else if (pl && !bt.sim) pl.mana += d * 3;
    bt.ev({ type: 'fx', fx: 'death', at: [t.c, t.r] });
  },
  // résister ou périr
  dispel_evil(bt, side, t) { const mod = Units.isUndead(t.u) ? 9 : 4; const f = bt.resistFails(t, 'life', mod, true); bt.say(f ? 'Exorcisme : ' + U.n(f, 'figurine') + ' de ' + bt.name(t) + ' détruite' + (f > 1 ? 's' : '') + '.' : bt.subj(t, 'résiste') + '.'); bt.takeDamage(t, f * bt.stats(t).hp, 'irreversible'); bt.ev({ type: 'fx', fx: 'holy', at: [t.c, t.r] }); },
  holy_word(bt, side) { const hit = []; for (const t of bt.alive(1 - side)) { if (!Units.isFantastic(t.u) && !Units.isUndead(t.u)) continue; const f = bt.resistFails(t, 'life', Units.isUndead(t.u) ? 7 : 2, true); if (f) hit.push(bt.name(t) + ' ' + f); bt.takeDamage(t, f * bt.stats(t).hp, 'irreversible'); bt.ev({ type: 'fx', fx: 'holy', at: [t.c, t.r] }); } bt.say('Parole sacrée : ' + (hit.length ? 'figurines bannies : ' + hit.join(', ') + '.' : 'toutes résistent.')); },
  word_of_death(bt, side, t) { const f = bt.resistFails(t, 'death', 5, true); if (!f) bt.say(bt.subj(t, 'résiste') + '.'); else { bt.say(bt.name(t) + ' : ' + U.n(f, 'figurine périt', 'figurines périssent') + '.'); bt.takeDamage(t, f * bt.stats(t).hp, 'irreversible'); } bt.ev({ type: 'fx', fx: 'death', at: [t.c, t.r] }); },
  death_spell(bt, side) { const hit = []; for (const t of bt.alive(1 - side)) { const f = bt.resistFails(t, 'death', 2, true); if (f) hit.push(bt.name(t) + ' ' + f); bt.takeDamage(t, f * bt.stats(t).hp, 'irreversible'); bt.ev({ type: 'fx', fx: 'death', at: [t.c, t.r] }); } bt.say('Sort de mort : ' + (hit.length ? 'figurines perdues : ' + hit.join(', ') + '.' : 'tous résistent.')); },
  disintegrate(bt, side, t) { if (bt.resFor(t, 'chaos') < 10) { bt.takeDamage(t, bt.hp(t), 'irreversible'); bt.say(bt.subj(t, 'est désintégré') + ' !'); } else bt.say(bt.subj(t, 'résiste') + ' à la désintégration.'); bt.ev({ type: 'fx', fx: 'chaos', at: [t.c, t.r] }); },
  petrify(bt, side, t) { const f = bt.resistFails(t, 'nature', 0, true); bt.takeDamage(t, f * bt.stats(t).hp, 'irreversible'); bt.ev({ type: 'fx', fx: 'stone', at: [t.c, t.r] }); bt.say(f ? bt.name(t) + ' : ' + U.n(f, 'figurine changée', 'figurines changées') + ' en pierre.' : bt.subj(t, 'résiste') + ' à la pétrification.'); },
  banish(bt, side, t, sp, c, extra) { const f = bt.resistFails(t, 'sorcery', 3 + Math.floor(extra / 15), true); bt.say(f ? 'Bannissement : ' + U.n(f, 'figurine') + ' de ' + bt.name(t) + ' renvoyée' + (f > 1 ? 's' : '') + ' dans son royaume.' : bt.subj(t, 'résiste') + '.'); bt.takeDamage(t, f * bt.stats(t).hp, 'irreversible'); bt.ev({ type: 'fx', fx: 'sorcery', at: [t.c, t.r] }); },
  cracks_call(bt, side, t) {
    // la faille ouvre aussi le pan de muraille sur lequel se tient la cible
    const w = bt.hasWalls && bt.walls[t.c + ',' + t.r]; if (w && !w.broken && !w.gate) { w.broken = true; bt.say('La muraille se fend et s\'écroule.'); bt.ev({ type: 'fx', fx: 'wall', at: [t.c, t.r] }); }
    if (bt.rng.chance(0.25)) { bt.takeDamage(t, bt.hp(t), 'irreversible'); bt.say('La terre engloutit ' + bt.name(t) + ' !'); } else bt.say('La terre se fend sans effet.'); bt.ev({ type: 'fx', fx: 'stone', at: [t.c, t.r] }); },
  // malédictions
  weakness(bt, side, t) { if (bt.resistFails(t, 'death', 2, false)) t.curses.push('weakness'); else bt.say(bt.subj(t, 'résiste') + '.'); },
  black_sleep(bt, side, t) { if (bt.resistFails(t, 'death', 2, false)) { t.asleep = true; t.moves = 0; bt.say(bt.subj(t, 'sombre') + ' dans un sommeil de plomb.'); } else bt.say(bt.subj(t, 'résiste') + '.'); },
  confusion(bt, side, t) { if (bt.resistFails(t, 'sorcery', 4, false)) { t.confused = true; t.moves = 0; bt.say(bt.subj(t, 'est désorienté') + '.'); } else bt.say(bt.subj(t, 'résiste') + '.'); },
  vertigo(bt, side, t) { if (bt.resistFails(t, 'sorcery', 0, false)) t.curses.push('vertigo'); else bt.say(bt.subj(t, 'résiste') + '.'); },
  mind_storm(bt, side, t) { t.curses.push('mind_storm'); },
  shatter(bt, side, t) { if (bt.resistFails(t, 'chaos', 0, false)) { t.curses.push('shatter'); const s = bt.stats(t); bt.say(bt.name(t) + ' : armes brisées, ' + (s.rangedType === 'magic' && !(s.melee > 1) ? 'son tir magique reste intact.' : s.rangedType === 'magic' ? 'mêlée à 1 (son tir magique reste intact).' : 'attaques à 1.')); } else bt.say(bt.subj(t, 'résiste') + '.'); },
  warp_creature(bt, side, t) { const left = CombatSpells.warpLeft(t); if (!left.length) return; if (bt.resistFails(t, 'chaos', 1, false)) { const w = bt.rng.pick(left); t.curses.push(w); bt.say(bt.name(t) + ' : ' + CombatSpells.WARP_TEXT[w] + ' (Déformation).'); } else bt.say(bt.subj(t, 'résiste') + '.'); },
  web(bt, side, t) { if (bt.stats(t).flying) t.grounded = true; t.web = 12; t.moves = 0; bt.say(bt.subj(t, 'est pris') + ' dans une toile.'); },
  possession(bt, side, t) { if (bt.resistFails(t, 'death', 1, false)) { t.origSide = t.side; t.side = side; t.possessed = true; t.moves = 0; bt.say(bt.subj(t, 'change') + ' de camp !'); } else bt.say(bt.subj(t, 'résiste') + '.'); },
  creature_binding(bt, side, t) { if (bt.resistFails(t, 'sorcery', 2, false)) { t.origSide = t.side; t.side = side; t.possessed = true; t.bound = true; t.moves = 0; bt.say(bt.subj(t, 'est asservi') + ' !'); } else bt.say(bt.subj(t, 'résiste') + '.'); },
  warp_wood(bt, side, t) { const s = bt.stats(t); if (s.rangedType === 'missile') { t.ammo = 0; bt.say('Les arcs de ' + bt.name(t) + ' se tordent.'); } },
  // enchantements de champ de bataille
  true_light(bt, side) { CombatSpells.lightDark(bt, side, 'true_light', 'darkness'); },
  darkness(bt, side) { CombatSpells.lightDark(bt, side, 'darkness', 'true_light'); },
  prayer(bt, side) { bt.ench[side].push('prayer'); },
  high_prayer(bt, side) { bt.ench[side].push('high_prayer'); },
  black_prayer(bt, side) { bt.ench[side].push('black_prayer'); },
  terror(bt, side) { bt.ench[side].push('terror'); bt.say('La terreur gagne les rangs ennemis.'); },
  mana_leak(bt, side) { bt.ench[side].push('mana_leak'); },
  wrack(bt, side) { bt.ench[side].push('wrack'); },
  metal_fires(bt, side) { bt.ench[side].push('metal_fires'); },
  warp_reality(bt, side) { bt.ench[side].push('warp_reality'); },
  entangle(bt, side) { bt.ench[side].push('entangle'); },
  call_lightning(bt, side) { bt.ench[side].push('call_lightning'); },
  counter_magic(bt, side, t, sp, c, extra) { if (!bt.ench[side].includes('counter_magic')) bt.ench[side].push('counter_magic'); bt.counterMagic[side] = (sp && (sp.combatCost || sp.cost) || 10) + (extra || 0); },
  blur(bt, side) { bt.ench[side].push('blur'); },
  mass_invisibility(bt, side) { bt.ench[side].push('mass_invisibility'); },
  // soins
  healing(bt, side, t) { const n = bt.heal(t, 5); bt.say(U.n(n, 'PV rendu', 'PV rendus') + ' à ' + bt.name(t) + '.'); bt.ev({ type: 'fx', fx: 'heal', at: [t.c, t.r] }); },
  mass_healing(bt, side) { let n = 0; for (const t of bt.alive(side)) if (Units.realmOf(t.u) !== 'death') { n += bt.heal(t, 5); bt.ev({ type: 'fx', fx: 'heal', at: [t.c, t.r] }); } bt.say('Guérison de masse : ' + U.n(n, 'PV rendu', 'PV rendus') + '.'); },
  // invocations de combat
  fire_elemental(bt, side) { CombatSpells.summonTemp(bt, side, 'FireElemental'); },
  earth_elemental(bt, side) { CombatSpells.summonTemp(bt, side, 'EarthElemental'); },
  air_elemental(bt, side) { CombatSpells.summonTemp(bt, side, 'AirElemental'); },
  phantom_warriors(bt, side) { CombatSpells.summonTemp(bt, side, 'PhantomWarrior'); },
  phantom_beast(bt, side) { CombatSpells.summonTemp(bt, side, 'PhantomBeast'); },
  summon_demons(bt, side) { CombatSpells.summonTemp(bt, side, 'Demon', 3); },
  // terrain
  magic_vortex(bt, side, t) {
    const [c0, r0] = Array.isArray(t) ? t : [t.c, t.r];
    bt.vortices = bt.vortices || [];
    const v = { c: c0, r: r0, side, id: bt.vortices.length };
    bt.vortices.push(v);
    bt.say('Un vortex magique se forme.'); bt.ev({ type: 'fx', fx: 'chaos', at: [c0, r0] });
    bt.vortexMove(v);
  },
  earth_to_mud(bt, side, t) { const [c0, r0] = Array.isArray(t) ? t : [t.c, t.r]; for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) bt.mud[(c0 + dc) + ',' + (r0 + dr)] = true; bt.ev({ type: 'fx', fx: 'stone', at: [c0, r0] }); },
  jericho_trumpets(bt, side) {
    for (const t of bt.enemyTowers(side)) { const n = bt.damageTower(t, t.kind === 'stone' ? 10 : t.kind === 'gate' ? 8 : 6, true); bt.say(U.cap(bt.towerName(t)) + ' tremble : ' + n + ' dégâts.'); bt.ev({ type: 'fx', fx: 'holy', at: [t.c, t.r] }); bt.settleTower(t); }
    if (side === ATT_SIDE) {
      let n = 0;
      for (const k in bt.walls) { const w = bt.walls[k]; if (w.gate || w.broken || !bt.hasWalls || !bt.rng.chance(0.25)) continue; w.broken = true; n++; const [c, r] = k.split(',').map(Number); bt.ev({ type: 'fx', fx: 'wall', at: [c, r] }); }
      if (n) bt.say(n > 1 ? n + ' pans de muraille s\'écroulent.' : 'Un pan de muraille s\'écroule.');
    }
  },
  haunted_ramparts(bt, side) {
    let n = 0; for (const t of bt.enemyTowers(side)) if (t.kind === 'stone') { t.mute = 4; n++; bt.ev({ type: 'fx', fx: 'death', at: [t.c, t.r] }); }
    bt.say(n ? 'Les servants ' + (n > 1 ? 'des ' + n + ' tours' : 'de la tour') + ' s\'enfuient, épouvantés : ' + (n > 1 ? 'elles se taisent' : 'elle se tait') + ' pendant 4 rounds.' : 'Aucune tour à hanter ici.');
  },
  flux_rupture(bt, side) {
    for (const t of bt.enemyTowers(side)) if (t.kind === 'spire') { t.mute = 3; t.def = 0; bt.ev({ type: 'fx', fx: 'sorcery', at: [t.c, t.r] }); bt.say('La tour du sorcier perd son flux.'); }
  },
  disrupt(bt, side, t) { const [c0, r0] = Array.isArray(t) ? t : [t.c, t.r]; const tw = bt.towerAt(c0, r0) || bt.gateAt(c0, r0); if (tw && tw.side !== side && (tw.kind === 'stone' || tw.kind === 'gate')) { bt.damageTower(tw, tw.hp); bt.ev({ type: 'fx', fx: 'wall', at: [c0, r0] }); return; } const w = bt.walls[c0 + ',' + r0]; if (w && side === ATT_SIDE && bt.hasWalls) { w.broken = true; bt.say('Une brèche s\'ouvre dans la muraille.'); } },
  // relever les morts
  raise_dead(bt, side, t) { CombatSpells.revive(bt, side, t, false); },
  animate_dead(bt, side, t) { CombatSpells.revive(bt, side, t, true); },
  // force de dissipation égale au mana investi (le triple pour la version vraie)
  dispel_magic(bt, side, t, sp, c, extra) { if (!CombatSpells.dispelUnit(bt, side, t, CombatSpells.dispelStrength('dispel_magic', extra))) bt.say('Rien ne tombe sur ' + bt.name(t) + '.'); },
  dispel_magic_true(bt, side, t, sp, c, extra) { if (!CombatSpells.dispelUnit(bt, side, t, CombatSpells.dispelStrength('dispel_magic_true', extra))) bt.say('Rien ne tombe sur ' + bt.name(t) + '.'); },
  // tout le champ de bataille : enchantements ennemis (unités, camp, sorts globaux posés par l'ennemi) et maux de vos unités
  disenchant_area(bt, side, t, sp, c, extra) { CombatSpells.disenchantAll(bt, side, 50 + extra); },
  disenchant_true(bt, side, t, sp, c, extra) { CombatSpells.disenchantAll(bt, side, 150 + extra * 3); },
  call_chaos(bt, side) {
    // chaque effet passe par les mêmes protections que le sort seul (Droiture, immunité à la magie, au feu…)
    const H = COMBAT_SPELL_HANDLERS;
    for (const t of bt.alive(1 - side)) {
      const r = bt.rng.int(8);
      const none = what => bt.say(bt.name(t) + ' : ' + what + '.');
      if (r === 0) none('rien');
      else if (r === 1) { const h = bt.heal(t, 5); none(h ? 'soigné de ' + h + ' PV' : 'soin sans effet'); }
      else if (r === 2) {   // Canaux du chaos : l'ennemi y gagne une mutation durable (unités normales seulement)
        const shut = bt.stats(t).ab.magicImmunity || t.u.ench.concat(t.tempEnch).includes('righteousness');   // les protections du sort seul
        if (Units.isNormal(t.u) && !t.u.chaosChannel && !shut) { const ch = Spells.usefulChannels(bt.game, t.u); t.u.chaosChannel = bt.rng.pick(ch); none('Canaux du chaos, ' + Spells.CHANNEL_NAMES[t.u.chaosChannel]); }
        else none('Canaux du chaos, sans effet');
      }
      else if (r === 3) { if (CombatSpells.canAffect(bt, t, 'warp_creature')) H.warp_creature(bt, side, t); else none('Déformation, sans effet'); }
      else if (r === 4) { if (CombatSpells.canAffect(bt, t, 'fireball')) CombatSpells.damageSpell(bt, t, 15, 'fire', 'chaos', {}, 'Trait de feu'); else none('trait de feu, sans effet'); }
      else if (r === 5) { if (CombatSpells.canAffect(bt, t, 'warp_lightning')) H.warp_lightning(bt, side, t); else none('Foudre distordue, sans effet'); }
      else if (r === 6) { if (CombatSpells.canAffect(bt, t, 'doom_bolt')) H.doom_bolt(bt, side, t); else none('Trait funeste, sans effet'); }
      else if (r === 7) { if (CombatSpells.canAffect(bt, t, 'disintegrate')) H.disintegrate(bt, side, t); else none('Désintégration, sans effet'); }
    }
  },
  recall_hero(bt, side, t) { t.recalled = true; t.dead = true; bt.say(bt.subj(t, 'est rappelé') + ' à la forteresse.'); bt.ev({ type: 'fx', fx: 'sorcery', at: [t.c, t.r] }); bt.ev({ type: 'vanish', id: t.id }); },
  word_of_recall(bt, side, t) { COMBAT_SPELL_HANDLERS.recall_hero(bt, side, t); },
};
COMBAT_SPELL_HANDLERS.revive = null;
Object.assign(CombatSpells, {
  revive(bt, side, t, undead) {
    if (!t || !t.dead) return;
    if (t.recalled || t.irrDmg > 0) return;   // ni les rappelés, ni les morts irréversibles (pétrifiés, désintégrés…)
    if (bt.unitAt(t.c, t.r)) { const p = bt.freeTileNear([t.c, t.r]); if (!p) return; t.c = p[0]; t.r = p[1]; }   // corps recouvert : il se relève à côté
    if (t.side !== side) t.raisedFrom = t.side;   // une perte de son premier camp, que l'ennemi a relevée
    t.dead = false; t.side = side; t.moves = 0;
    bt.dead = bt.dead.filter(b => b !== t);
    // sans ses enchantements ni ses maux, et il ne doit plus rien à qui l'avait possédé
    t.curses = []; t.tempEnch = []; t.u.ench = []; t.web = 0; t.asleep = false; t.confused = false; t.invisible = false; t.grounded = false;
    t.possessed = false; t.bound = false; delete t.origSide; t.undeadDmg = 0; t.normDmg = 0;
    t.u.dmg = Math.floor(Units.stats(bt.game, t.u).maxHp / 2);
    if (undead) { t.u.undead = true; t.animated = true; }
    t.revived = true;
    bt.say(undead ? bt.subj(t, 'se relève') + ', ' + (Units.plural(t.u) ? 'morts-vivants.' : 'mort-vivant.') : bt.subj(t, 'revient') + ' à la vie.');
    bt.ev({ type: 'summon', id: t.id, at: [t.c, t.r] });
  },
  dispelUnit(bt, side, t, strength) {
    const removed = [];
    // chance de dissiper un sort : force / (force + coût), coût doublé si son lanceur le rend plus dur à dissiper (Archimage…)
    const roll = (e, cost, owner) => { const ok = bt.rng.chance(strength / (strength + cost * Magic.dispelResist(bt.game, owner, e))); if (ok) removed.push(e); return ok; };
    const ownerOf = side2 => bt.owner(side2);
    const mine = t.side === side || (t.possessed && t.origSide === side);
    const locked = t.u.ench.includes('spell_lock') || t.tempEnch.includes('spell_lock');   // le Sceau protège aussi le lien d'une créature invoquée
    if (!mine) {
      // un Sceau de sort protège tout le reste : il faut d'abord le faire tomber
      const pid = ownerOf(t.side), cost = e => (DATA.spells[e] || {}).cost || 20;
      if (t.u.ench.includes('spell_lock') || t.tempEnch.includes('spell_lock')) {
        if (roll('spell_lock', cost('spell_lock'), pid)) { t.u.ench = t.u.ench.filter(e => e !== 'spell_lock'); t.tempEnch = t.tempEnch.filter(e => e !== 'spell_lock'); }
      } else { t.tempEnch = t.tempEnch.filter(e => !roll(e, cost(e), pid)); t.u.ench = t.u.ench.filter(e => !roll(e, cost(e), pid)); }
    }
    if (mine) {
      const pid = ownerOf(1 - side);
      t.curses = t.curses.filter(e => { const sp = DATA.spells[e] || DATA.spells[e.replace(/_(melee|def|res)$/, '')]; return !roll(e, sp ? sp.combatCost || sp.cost || 20 : 20, pid); });
      // maux qui ne sont pas des malédictions posées : toile, sommeil, confusion
      if (t.web > 0 && roll('web', 10, pid)) t.web = 0;
      if (t.asleep && roll('black_sleep', (DATA.spells.black_sleep || {}).combatCost || 20, pid)) t.asleep = false;
      if (t.confused && roll('confusion', (DATA.spells.confusion || {}).combatCost || 20, pid)) t.confused = false;
    }
    // une de vos unités possédée par l'ennemi : la dissipation peut la libérer
    if (t.possessed && t.origSide === side && !t.bound && roll('possession', (DATA.spells.possession || {}).combatCost || 30, ownerOf(t.side))) { t.side = side; t.possessed = false; delete t.origSide; }
    let gone = 0;
    if (Units.isFantastic(t.u) && t.side !== side && t.u.summoned && !locked) {
      const cost = DATA.units[t.u.type].castCost || 50;
      if (t.u.combatOnly && bt.rng.chance(strength / (strength + cost))) { bt.takeDamage(t, bt.hp(t), 'irreversible'); bt.say(bt.subj(t, 'se dissipe') + '.'); gone = 1; }
    }
    if (removed.length) bt.say('Dissipé sur ' + bt.name(t) + ' : ' + removed.map(e => DATA.spells[e] ? DATA.spells[e].name : DATA.spells[e.replace(/_(melee|def|res)$/, '')] ? DATA.spells[e.replace(/_(melee|def|res)$/, '')].name : e).join(', ') + '.');
    bt.ev({ type: 'fx', fx: 'sorcery', at: [t.c, t.r] });
    return removed.length + gone;
  },
  // ce qu'une dissipation de cette force pourrait faire tomber sur l'unité, et la chance de chaque effet (les mêmes jets que dispelUnit)
  dispelOdds(bt, side, t, strength) {
    const out = [], ch = (e, cost, owner) => strength / (strength + cost * Magic.dispelResist(bt.game, owner, e));
    const nm = e => DATA.spells[e] ? DATA.spells[e].name : DATA.spells[e.replace(/_(melee|def|res)$/, '')] ? DATA.spells[e.replace(/_(melee|def|res)$/, '')].name : e;
    const mine = t.side === side || (t.possessed && t.origSide === side);
    const ench = t.u.ench.concat(t.tempEnch), locked = ench.includes('spell_lock');
    if (!mine) {
      const pid = bt.owner(t.side), cost = e => (DATA.spells[e] || {}).cost || 20;
      if (locked) out.push({ name: nm('spell_lock'), p: ch('spell_lock', cost('spell_lock'), pid) });
      else for (const e of ench) out.push({ name: nm(e), p: ch(e, cost(e), pid) });
      if (Units.isFantastic(t.u) && t.u.summoned && t.u.combatOnly && !locked) { const c = DATA.units[t.u.type].castCost || 50; out.push({ name: Units.label(t.u) + ' (renvoi)', p: strength / (strength + c) }); }
    } else {
      const pid = bt.owner(1 - side);
      for (const e of t.curses) { const sp = DATA.spells[e] || DATA.spells[e.replace(/_(melee|def|res)$/, '')]; out.push({ name: nm(e), p: ch(e, sp ? sp.combatCost || sp.cost || 20 : 20, pid) }); }
      if (t.web > 0) out.push({ name: nm('web'), p: ch('web', 10, pid) });
      if (t.asleep) out.push({ name: nm('black_sleep'), p: ch('black_sleep', (DATA.spells.black_sleep || {}).combatCost || 20, pid) });
      if (t.confused) out.push({ name: nm('confusion'), p: ch('confusion', (DATA.spells.confusion || {}).combatCost || 20, pid) });
      if (t.possessed && t.origSide === side && !t.bound) out.push({ name: nm('possession'), p: ch('possession', (DATA.spells.possession || {}).combatCost || 30, bt.owner(t.side)) });
    }
    return out;
  },
  dispelStrength(id, extra) { const sp = DATA.spells[id] || {}, base = (sp.combatCost || sp.cost || 10) + (extra || 0); return id === 'dispel_magic_true' ? 3 * base : base; },
  disenchantAll(bt, side, strength) {
    let n = 0;
    for (const b of bt.alive()) n += CombatSpells.dispelUnit(bt, side, b, strength);
    const foe = bt.owner(1 - side), ch = e => bt.rng.chance(strength / (strength + ((DATA.spells[e] || {}).combatCost || (DATA.spells[e] || {}).cost || 20) * Magic.dispelResist(bt.game, foe, e)));
    const gone = [];
    bt.ench[1 - side] = bt.ench[1 - side].filter(e => { const g = ch(e); if (g) gone.push(e); return !g; });
    // effets globaux posés par l'ennemi pendant ce combat (Lumière vraie, Ténèbres…)
    bt.globalEnch = bt.globalEnch.filter(e => { if (bt.globalBy[e] !== 1 - side) return true; const g = ch(e); if (g) { gone.push(e); delete bt.globalBy[e]; } return !g; });
    if (gone.length) bt.say('Dissipé : ' + gone.map(e => DATA.spells[e] ? DATA.spells[e].name : e).join(', ') + '.');
    else if (!n) bt.say('Désenchantement : rien ne tombe.');
    bt.refreshInvisible();
  },
});
delete COMBAT_SPELL_HANDLERS.revive;

// ---------- IA tactique ----------
const CombatAI = {
  tacFor(game, pid) { const pl = game.players[pid]; if (!pl) return 0; if (pl.human) return 3; return typeof AI !== 'undefined' ? AI.lvl(pl) : 1; },
  // une amélioration tactique s'applique-t-elle à ce camp ? (désactivable dans les bancs d'essai : AI.EXP.no_xxx)
  tf(bt, side, name, min = 1) { const sp = bt.player && bt.player(side); if (sp && sp.aiExp && sp.aiExp['no_' + name]) return false; if (typeof AI !== 'undefined' && AI.PENDING && AI.PENDING[name] && !AI.LAB) return false; return (bt.tac ? bt.tac[side] : 0) >= min && !(typeof AI !== 'undefined' && AI.EXP && AI.EXP['no_' + name]) && !(bt.opts && bt.opts.exp && bt.opts.exp[side] && bt.opts.exp[side]['no_' + name]); },
  // espérance de max(0, H - B), H ~ Bin(m, p), B ~ Bin(n, q) : les dégâts d'un jet d'attaque contre un jet de défense
  _ep: new Map(),
  expPos(m, p, n, q) {
    p = Math.min(100, p); q = Math.min(100, q);   // au-delà de 100 %, chaque dé porte : rien de plus (le surplus perce la défense en amont)
    const key = m + '|' + p + '|' + n + '|' + q; let v = CombatAI._ep.get(key); if (v != null) return v;
    const bin = (k, pr) => { const o = [1]; for (let i = 0; i < k; i++) { o.push(0); for (let j = i + 1; j > 0; j--) o[j] = o[j] * (1 - pr) + o[j - 1] * pr; o[0] *= 1 - pr; } return o; };
    const H = bin(m, p / 100), B = bin(Math.min(n, 60), q / 100);
    v = 0; for (let h = 1; h < H.length; h++) if (H[h]) for (let b = 0; b < Math.min(h, B.length); b++) v += H[h] * B[b] * (h - b);
    if (CombatAI._ep.size > 5000) CombatAI._ep.clear();
    CombatAI._ep.set(key, v); return v;
  },
  // dégâts attendus d'une mêlée de a sur d (counter : riposte, moins précise quand d a déjà été assailli)
  expMelee(bt, a, d, counter) {
    const s = bt.stats(a); if (s.melee <= 0) return 0;
    const th = bt.meleeToHit(a, d, s, counter);
    const mods = bt.meleeMods(a, d, counter), def = bt.defFor(d, 'melee', null, mods), td = bt.toDefend(d, mods);
    const m = s.melee + (!counter && bt.flankOf(a, d) ? 1 : 0);
    return bt.figures(a) * CombatAI.expPos(m, th, def, td) * (s.haste ? 2 : 1);
  },
  expRanged(bt, a, d) {
    const s = bt.stats(a); if (!(s.ranged > 0)) return 0;
    const th = bt.rangedToHit(a, d, s);
    const kind = s.rangedType === 'magic' ? 'magic' : s.rangedType === 'boulder' ? 'boulder' : 'missile';
    const mods = bt.rangedMods(a, d, s, th);
    const def = bt.defFor(d, kind, s.rangedRealm || (kind === 'magic' ? 'chaos' : null), mods);
    return def >= 50 ? 0 : bt.figures(a) * CombatAI.expPos(s.ranged, Math.max(0, th), def, bt.toDefend(d, mods)) * CombatAI.volleys(a, s);
  },
  // Hâte : deux volées si les munitions (ou le mana du lanceur) le permettent
  volleys(a, s) { if (!s.haste) return 1; return (s.rangedType === 'magic' ? a.ammo + Math.floor((a.casterMana || 0) / 3) : a.ammo) >= 2 ? 2 : 1; },
  // prévision d'un tir, pour l'interface : dégâts moyens et part des tirs sans dégât, par tirages simulés
  // (Math.random, pour ne pas toucher au générateur de la bataille)
  rangedForecast(bt, a, d, n) {
    n = n || 400;
    const s = bt.stats(a), ds = bt.stats(d);
    const th = bt.rangedToHit(a, d, s);
    const kind = s.rangedType === 'magic' ? 'magic' : s.rangedType === 'boulder' ? 'boulder' : 'missile';
    const mods = bt.rangedMods(a, d, s, th);
    // comme applyRolls : Invulnérabilité ôte 2 à chaque coup, Flou en dévie un point sur dix (sans toucher au tirage de la bataille)
    const invuln = d.u.ench.concat(d.tempEnch).includes('invulnerability'), blur = bt.ench[d.side].includes('blur');
    const reduce = dmg => { if (invuln) dmg = Math.max(0, dmg - 2); if (blur) { let o = 0; for (let i = 0; i < dmg; i++) if (Math.random() >= 0.1) o++; dmg = o; } return dmg; };
    const def = bt.defFor(d, kind, s.rangedRealm || (kind === 'magic' ? 'chaos' : null), mods), td = bt.toDefend(d, mods);
    const figs = bt.figures(a), hp0 = bt.hp(d), lead0 = bt.leadHp(d), per = ds.hp;
    const roll = (k, p) => { let x = 0; for (let i = 0; i < k; i++) if (Math.random() * 100 < p) x++; return x; };
    let total = 0, zero = 0;
    for (let t = 0; t < n; t++) {
      let hp = hp0, lead = lead0, dealt = 0;
      if (def < 50) for (let v = 0; v < CombatAI.volleys(a, s); v++) for (let f = 0; f < figs && hp > 0; f++) {
        let dmg = reduce(roll(s.ranged, th));
        while (dmg > 0 && hp > 0) {
          dmg -= roll(def, td);
          if (dmg > 0) { const take = Math.min(lead, dmg); hp -= take; lead -= take; dealt += take; dmg -= take; if (lead <= 0) lead = per; }
        }
      }
      total += dealt; if (!dealt) zero++;
    }
    return { dmg: total / n, zero: zero / n, toHit: Math.min(100, th), pierce: mods.pierce, kill: Math.min(hp0, total / n) >= hp0 * 0.999 };
  },
  // ce que vaut une attaque : la part de l'ennemi détruite moins la part de soi perdue en riposte
  // prévision d'une mêlée pour l'interface, par tirages sur des copies (la vraie bataille n'est pas touchée) : a frappe d
  // depuis sa case, ou depuis la case at (s'y étant approché). dealt / received : dégâts moyens ; kill / die : probabilités
  meleeForecast(bt, a, d, at, n) {
    n = n || 300;
    const sim = Object.create(bt);
    Object.assign(sim, { rng: new RNG((a.id * 7919 + d.id * 131 + bt.round * 17 + (at ? at.c * 13 + at.r : 0)) >>> 0), events: [], log: [] });
    sim.say = () => {}; sim.ev = () => {}; sim.checkDeath = () => {}; sim.checkEnd = () => {}; sim.ignite = () => false; sim.damageWall = () => {};
    const copy = b => Object.assign({}, b, { u: JSON.parse(JSON.stringify(b.u)), tempEnch: b.tempEnch.slice(), curses: b.curses.slice(), usedAbility: Object.assign({}, b.usedAbility) });
    let steps = 0;
    if (at) { const reach = bt.reachable(a); if (reach.has(at.c + ',' + at.r)) steps = bt.pathTo(reach, a, at.c, at.r).length; }
    const flank = bt.flankOf(a, d, at ? at.c : null, at ? at.r : null);
    let dealt = 0, received = 0, kill = 0, die = 0;
    for (let i = 0; i < n; i++) {
      const A = copy(a), D = copy(d);
      if (at) { A.c = at.c; A.r = at.r; A.moves = Math.max(1, a.moves - at.cost); A.movedTiles = (a.movedTiles || 0) + steps; A.guarding = false; }
      const hA = sim.hp(A), hD = sim.hp(D);
      if (!sim.melee(A, D)) return null;
      dealt += hD - sim.hp(D); received += hA - sim.hp(A);
      if (sim.hp(D) <= 0) kill++;
      if (sim.hp(A) <= 0) die++;
    }
    return { dealt: dealt / n, received: received / n, kill: kill / n, die: die / n, flank };
  },
  meleeGain(bt, a, d) {
    const hd = Math.max(1, bt.hp(d)), ha = Math.max(1, bt.hp(a));
    // la riposte : réduite (ou nulle) quand l'attaquant frappe le premier et entame (ou tue) sa cible avant qu'elle réplique
    const dealt = CombatAI.expMelee(bt, a, d, false); let back = CombatAI.expMelee(bt, d, a, true);
    if (CombatAI.tf(bt, a.side, 'firststrike') && bt.stats(a).ab.firstStrike && !bt.stats(d).ab.negateFirstStrike) { const hd = Math.max(1, bt.hp(d)); back = dealt >= hd * 0.9 ? 0 : back * Math.max(0, 1 - dealt / hd); }
    const sd = Units.strength(bt.game, d.u), sa = Units.strength(bt.game, a.u);
    const kill = dealt >= hd * 0.9;
    return sd * Math.min(1, dealt / hd) + (kill ? 0.3 * sd : 0) - sa * Math.min(1, (kill ? back * 0.5 : back) / ha) * 0.8 + (d.u.hero ? 15 : 0);
  },
  // fuir un combat perdu d'avance sauve la moitié des troupes (et les héros)
  hopeless(bt, side) {
    if (bt.round < 2) return false;
    if (!bt.canEscape(side)) return false;   // garnison d'une cité ou pile encerclée : fuir, c'est mourir ; autant vendre chèrement sa peau
    const mine = U.sum(bt.alive(side), b => Units.strength(bt.game, b.u)), theirs = U.sum(bt.alive(1 - side), b => Units.strength(bt.game, b.u));
    return mine < theirs * 0.15;
  },
  // joue tout le tour du camp courant
  playSide(bt) {
    const side = bt.side;
    let guard = 0;
    if (CombatAI.tf(bt, side, 'flee') && CombatAI.hopeless(bt, side)) { bt.flee(side); return; }
    CombatAI.maybeCast(bt, side);
    // les tireurs d'abord ; puis, dès Normale, ceux qui sont au contact (ils frappent avant que les autres ne bouchent le passage)
    const foesNow = bt.alive(1 - side);
    const near = b => Math.min(...foesNow.map(f => bt.dist(b, f)), 99);
    const order = bt.alive(side).sort((a, b) => (bt.stats(b).ranged > 0) - (bt.stats(a).ranged > 0) || (CombatAI.tf(bt, side, 'order') ? near(a) - near(b) : 0));
    for (const b of order) {
      if (bt.over) return;
      if (b.dead || b.side !== side) continue;
      while (b.moves > 0 && !b.dead && !bt.over && guard++ < 60) { if (!CombatAI.act(bt, b)) break; }
    }
    if (!bt.over) bt.endSide();
  },
  value(bt, t) { return Units.strength(bt.game, t.u) / Math.max(1, bt.hp(t)) * 10 + (t.u.hero ? 30 : 0); },
  // tours ennemies : tir (briseurs de murs), frappe au contact, ou marche vers celle qu'on peut abattre (approach).
  // null : rien à faire contre elles
  towerMove(bt, b, towers, approach) {
    const shoot = towers.filter(t => bt.canShootTower(b, t));
    if (shoot.length) return bt.shootTower(b, U.min(shoot, t => t.hp));
    const hit = towers.filter(t => bt.canMeleeTower(b, t));
    if (hit.length) return bt.meleeTower(b, U.min(hit, t => t.hp));
    if (!approach || !(bt.stats(b).melee > 0) || !towers.length) return null;
    const steps = bt.stepsMap(b, towers, true, true), here = StepGrid.at(steps, b.c, b.r);
    let best = null, bs = here == null ? Infinity : here;
    const rch = bt.reachable(b);
    for (const n of rch.values()) {
      const v = StepGrid.at(steps, n.c, n.r);
      if (v != null && (v < bs || (v === bs && best && n.cost < best.cost))) { bs = v; best = n; }
    }
    if (!best) return null;
    bt.moveUnit(b, best.c, best.r, rch);
    const hit2 = towers.filter(t => bt.canMeleeTower(b, t));
    if (hit2.length) return bt.meleeTower(b, U.min(hit2, t => t.hp));
    return false;
  },
  act(bt, b) {
    const foes = bt.alive(1 - b.side);
    const towers = bt.enemyTowers(b.side).filter(t => t.kind === 'spire' || t.kind === 'gate' || bt.breaksTowers(b));
    if (!foes.length) {
      // plus de garnison, mais la tour du sorcier tient : tout le monde à l'assaut (portes et tours muettes ne comptent plus)
      const spire = towers.filter(t => t.kind === 'spire');
      if (!spire.length || b.confused) { b.moves = 0; return false; }
      let r = CombatAI.towerMove(bt, b, spire, true);
      // la tour est derrière des portes closes : on enfonce une porte (ou l'on ouvre une brèche) d'abord
      if (r == null) { const gates = bt.enemyTowers(b.side).filter(t => t.kind === 'gate' && !t.dead); if (gates.length) r = CombatAI.towerMove(bt, b, gates, true); }
      if (r == null && bt.hasWalls) { const s0 = bt.stats(b); const w = s0.ab.wallCrusher && U.DIRS8.map(([dc, dr]) => [b.c + dc, b.r + dr]).find(([c, r2]) => bt.canBreach(b, c, r2)); if (w) return bt.breachWall(b, w[0], w[1]); }
      if (r == null) { b.moves = 0; return false; }
      return r;
    }
    const s = bt.stats(b);
    if (b.confused) { b.moves = 0; return false; }
    // engin de siège : les tours, sinon rester en retrait
    // briseur de murs au pied d'un pan de muraille, sans tour ni porte à frapper d'ici : il ouvre une brèche
    if (s.ab.wallCrusher && bt.hasWalls && !towers.some(t => bt.canMeleeTower(b, t) || bt.canShootTower(b, t))) {
      const w = U.DIRS8.map(([dc, dr]) => [b.c + dc, b.r + dr]).find(([c, r]) => bt.canBreach(b, c, r));
      if (w && (s.ab.siegeOnly || !foes.some(f => bt.canMelee(b, f)))) return bt.breachWall(b, w[0], w[1]);
    }
    if (s.ab.siegeOnly) { const r = towers.length ? CombatAI.towerMove(bt, b, towers, true) : null; if (r == null) { b.moves = 0; return false; } return r; }
    // civils (ingénieurs, colons, éclaireurs) : tant qu'il reste des combattants dans leur camp, ils ne vont pas au contact ;
    // ils s'écartent de l'ennemi, vers un coin, et laissent les autres se battre (toujours pour le joueur ; pour l'IA, à l'essai)
    if (CombatAI.civilian(b) && CombatAI.civilOn(bt, b.side) && bt.alive(b.side).some(o => o !== b && !CombatAI.civilian(o))) return CombatAI.keepClear(bt, b, foes);
    // capacités spéciales et sorts des lanceurs (la réserve de mana d'un héros ne sert qu'au combat : autant la dépenser)
    const sp = CombatAI.unitSpellChoice(bt, b, foes);
    if (sp) { CombatSpells.cast(bt, b.side, sp.id, sp.target, b); return true; }
    // dès Normale : un héros gravement blessé quitte la mêlée (sauf s'il peut achever son adversaire) et n'y retourne pas
    if (CombatAI.tf(bt, b.side, 'herosafe') && b.u.hero && bt.alive(b.side).length > 1 && bt.hp(b) < s.maxHp * 0.35) {
      const adj = foes.filter(f => bt.canMelee(b, f));
      const finish = adj.some(f => s.melee > 0 && CombatAI.expMelee(bt, b, f, false) >= bt.hp(f));
      if (adj.length && !finish && !b.retreated) {
        const rch = bt.reachable(b);
        const n = U.max([...rch.values()].filter(n => !(bt.fire && bt.fire[n.c + ',' + n.r]) && !foes.some(f => Math.max(Math.abs(f.c - n.c), Math.abs(f.r - n.r)) <= 1)), n => Math.min(...foes.map(f => Math.max(Math.abs(f.c - n.c), Math.abs(f.r - n.r)))) - n.cost * 0.1);
        if (n) { b.retreated = true; bt.moveUnit(b, n.c, n.r, rch); return b.moves > 0 && s.ranged > 0; }
      }
      if (!adj.length && !(s.ranged > 0 && (b.ammo > 0 || b.casterMana >= 3))) { b.moves = 0; return false; }
    }
    // tireur collé à l'ennemi : un pas en arrière s'il peut encore tirer après
    if (CombatAI.tf(bt, b.side, 'kite') && s.ranged > 0 && s.rangedType && bt.enemyAdjacent(b) && (b.ammo > 0 || b.casterMana >= 3) && b.moves >= 3 && !b.kited) {
      const rch = bt.reachable(b);
      const spots = [...rch.values()].filter(n => n.cost < b.moves && !foes.some(f => Math.max(Math.abs(f.c - n.c), Math.abs(f.r - n.r)) <= 1));
      const n = U.min(spots, n => n.cost);
      if (n) { b.kited = true; bt.moveUnit(b, n.c, n.r, rch); return true; }
    }
    // les briseurs de murs s'occupent des tours d'abord ; les autres frappent celle qui se trouve à leur contact si aucun ennemi n'y est
    if (towers.length && (s.ab.wallCrusher || !bt.enemyAdjacent(b))) {
      const tw = s.ab.wallCrusher ? towers.filter(t => t.kind === 'stone' || t.kind === 'gate' || bt.dist(b, t) === 1) : towers;
      const r = CombatAI.towerMove(bt, b, tw, !!s.ab.wallCrusher && !(s.ranged > 0 && (b.ammo > 0 || b.casterMana >= 3)));
      if (r != null) return r;
    }
    // tir
    // (« vainstrike », mesuré au banc : on ne tire pas sur qui ne craint rien de ce tir, et sans cible qui vaille on va au contact)
    const vain = CombatAI.tf(bt, b.side, 'vainstrike');
    let noUse = false;
    if (s.ranged > 0 && s.rangedType && !bt.enemyAdjacent(b)) {
      let targets = foes.filter(f => bt.canShoot(b, f));
      if (vain && targets.length) { const useful = targets.filter(f => CombatAI.expRanged(bt, b, f) > 0.05); noUse = !useful.length; targets = useful; }
      if (targets.length) {
        const smart = CombatAI.tf(bt, b.side, 'aim');
        const t = U.max(targets, f => smart
          ? (() => { const e = CombatAI.expRanged(bt, b, f), h = Math.max(1, bt.hp(f)), st = Units.strength(bt.game, f.u); return st * Math.min(1, e / h) + (e >= h * 0.9 ? 0.3 * st : 0) + (f.u.hero ? 15 : 0); })()
          : CombatAI.value(bt, f) / Math.max(1, bt.defFor(f, s.rangedType === 'magic' ? 'magic' : 'missile', null)) - bt.dist(b, f) * 0.3);
        return bt.shoot(b, t);
      }
    }
    // lanceur de traits magiques arrêté par les murailles : il gagne le rempart ou une brèche d'où il voit l'ennemi
    if (bt.hasWalls && s.ranged > 0 && s.rangedType === 'magic' && (b.ammo > 0 || b.casterMana >= 3) && !bt.enemyAdjacent(b) && !b.posted) {
      const c0 = b.c, r0 = b.r; let best = null, bs = 0;
      const rch = bt.reachable(b);
      for (const n of rch.values()) {
        b.c = n.c; b.r = n.r;
        const m0 = b.moves; b.moves = 1;   // d'où pourra-t-il tirer (ce tour s'il lui reste du mouvement, sinon au prochain)
        const vis = foes.filter(f => bt.canShoot(b, f)); b.moves = m0;
        const sc = vis.length ? Math.max(...vis.map(f => CombatAI.value(bt, f))) + (bt.walls[n.c + ',' + n.r] ? 5 : 0) + (n.cost < m0 ? 3 : 0) - n.cost : 0;
        if (sc > bs) { bs = sc; best = n; }
      }
      b.c = c0; b.r = r0;
      if (best) { b.posted = true; bt.moveUnit(b, best.c, best.r, rch); return b.moves > 0; }
    }
    // mêlée adjacente : dès Normale, la cible où l'échange rapporte le plus (achever, frapper qui riposte mal)
    const adj = foes.filter(f => bt.canMelee(b, f));
    if (adj.length && (s.melee > 0 || s.breath || s.thrown)) {
      if (CombatAI.tf(bt, b.side, 'focus') && s.melee > 0 && !s.breath && !s.thrown) {
        const t = U.max(adj, f => CombatAI.meleeGain(bt, b, f));
        // en défense, inutile d'engager un échange perdant : on laisse l'ennemi venir
        if (b.side === DEF_SIDE && CombatAI.tf(bt, b.side, 'patience') && CombatAI.meleeGain(bt, b, t) < 0 && !(s.ranged > 0)) { bt.guard(b); return false; }
        // dès Normale : s'il reste assez de mouvement, contourner la cible pour la frapper de flanc ou dans le dos
        const fh = {}, alt = CombatAI.tf(bt, b.side, 'flank') ? CombatAI.flankTile(bt, b, t, fh) : null;
        if (alt) { bt.moveUnit(b, alt.c, alt.r, fh.reach); if (b.moves > 0 && bt.canMelee(b, t)) return bt.melee(b, t); }
        return bt.melee(b, t);
      }
      const t = U.max(adj, f => CombatAI.value(bt, f) - bt.hp(f) * 0.05);
      return bt.melee(b, t);
    }
    // défense d'une cité fortifiée : la garnison reste à l'abri des murs (au bout de 50 rounds, l'assaillant se retire) ;
    // elle ne va chercher que l'ennemi déjà entré, par une porte enfoncée, une brèche ou les airs
    // seule exception : un engin de siège (bélier, catapulte) qu'elle peut frapper dès ce tour, puis elle rentre
    const walledDef = bt.city && b.side === DEF_SIDE && bt.hasWalls && !s.flying;
    // sauf quand attendre revient à se faire tirer dessus : l'assaillant tire (au moins la moitié de ses troupes), la garnison ne tire pas ;
    // ceux qui peuvent atteindre un tireur sortent l'attaquer (contre des volants, impossible : ils restent à l'abri)
    const shoots = o => { const os = bt.stats(o); return os.ranged > 0 && os.rangedType && (o.ammo > 0 || (os.rangedType === 'magic' && o.casterMana >= 3)); };
    // (0.31.32) la sortie reste un essai de banc : sally_half (dès la moitié de tireurs, en jeu de 0.31.21 à 0.31.31) ou
    // sally_all (seulement si tous tirent). Aux bancs 16 et 17, aucune ne faisait mieux que la garnison à l'abri (sally_all :
    // score -49 ± 25) : par défaut, la garnison reste derrière ses murs
    const ownExp = (bt.game && bt.game.players[b.u.owner] && bt.game.players[b.u.owner].aiExp) || {}, ex = k => typeof AI !== 'undefined' && ((AI.EXP && AI.EXP[k]) || ownExp[k]);
    const sallyAll = ex('sally_all'), sallyMode = ex('no_sally') ? null : sallyAll ? 'all' : ex('sally_half') ? 'half' : null;
    const sally = walledDef && sallyMode && (sallyAll ? foes.every(shoots) : foes.filter(shoots).length * 2 >= foes.length) && !bt.alive(b.side).some(shoots) && foes.some(f => shoots(f) && !bt.outOfReach(b, f));
    const keepIn = walledDef && bt.inCity(b.c, b.r) && !sally;
    if (keepIn && !foes.some(f => bt.inCity(f.c, f.r))) {
      const engines = foes.filter(f => DATA.units[f.u.type].abilities.siegeOnly || f.u.type === 'Catapult');
      for (const f of engines) {
        const oc = b.c, orr = b.r;
        const rch = bt.reachable(b);
        for (const n of rch.values()) {
          if (n.cost >= b.moves || bt.dist(n, f) !== 1) continue;
          b.c = n.c; b.r = n.r; const om = b.moves; b.moves = om - n.cost; const ok = bt.canMelee(b, f); b.c = oc; b.r = orr; b.moves = om;
          if (ok) { bt.moveUnit(b, n.c, n.r, rch); return bt.canMelee(b, f) ? bt.melee(b, f) : false; }
        }
      }
      bt.guard(b); return false;
    }
    // un défenseur resté dehors (après avoir frappé un engin de siège) rentre derrière les murs si personne ne le retient
    if (walledDef && !sally && !bt.inCity(b.c, b.r) && !bt.enemyAdjacent(b)) {
      const rch = bt.reachable(b);
      const home = U.min([...rch.values()].filter(n => bt.inCity(n.c, n.r)), n => n.cost);
      if (home) { bt.moveUnit(b, home.c, home.r, rch); return false; }
    }
    // sortir des flammes
    if (bt.fire && bt.fire[b.c + ',' + b.r] && !s.flying) {
      const rch = bt.reachable(b);
      const out = [...rch.values()].filter(n => !bt.fire[n.c + ',' + n.r]);
      const n = U.min(out, n => n.cost);
      if (n) { bt.moveUnit(b, n.c, n.r, rch); return false; }
    }
    // tireurs : garder la distance (sauf quand aucun tir ne servirait à rien : on va au contact)
    if (s.ranged > 0 && (b.ammo > 0 || b.casterMana >= 3) && !noUse) { b.moves = 0; return false; }
    // approche (distance de marche : l'eau profonde se contourne par les gués)
    const reach = bt.reachable(b);
    const foeShoots = foes.some(f => bt.stats(f).ranged > 0);
    const walk = new Map();
    // derrière une muraille, on passe par les portes et les brèches
    const walled = bt.hasWalls && !s.flying && !s.ab.teleporting && !s.ab.merging && !s.ab.nonCorporeal && CombatAI.tf(bt, b.side, 'wallpath', 0);
    let riverN = -1;   // (performance) le nombre de cases de rivière, compté une fois : le champ de bataille ne change pas ici
    const stepsTo = (f, n) => {
      if (walled) {
        if (!walk.has(f.id)) walk.set(f.id, bt.stepsMap(b, [f]));
        const v = StepGrid.at(walk.get(f.id), n.c, n.r);
        return v == null ? Infinity : v + 1;
      }
      if (bt.wades(s) || !(riverN >= 0 ? riverN : (riverN = Object.keys(bt.river || {}).length))) return Math.max(Math.abs(f.c - n.c), Math.abs(f.r - n.r));
      if (!walk.has(f.id)) walk.set(f.id, bt.walkDist(f.c, f.r));
      const v = StepGrid.at(walk.get(f.id), n.c, n.r);
      return v == null ? Infinity : v;
    };
    // personne à portée de marche (la garnison est derrière des portes closes), ou seulement par un long détour jusqu'à une
    // brèche lointaine : on enfonce la porte la plus proche
    if (walled) {
      const dFoe = Math.min(...foes.map(f => stepsTo(f, b)));
      const gates = towers.filter(t => t.kind === 'gate');
      if (dFoe > 3 && gates.length) {
        const gs = StepGrid.at(bt.stepsMap(b, gates, true, true), b.c, b.r);
        if (dFoe === Infinity || (gs != null && gs + 3 < dFoe)) {
          const r = CombatAI.towerMove(bt, b, gates, true);
          if (r != null) return r;
        }
      }
    }
    let best = null, bestScore = -Infinity;
    const flankAI = CombatAI.tf(bt, b.side, 'flank') && s.melee > 0;
    // (performance) ce qui ne dépend que de l'ennemi (visible, à portée de mêlée, sa valeur) se relève une fois, à la première case
    // examinée, au lieu de l'être pour chaque case : rien ne bouge pendant cette boucle
    let cand = null, candVal = null;
    for (const [k, n] of reach) {
      if (keepIn && !bt.inCity(n.c, n.r)) continue;   // jamais hors les murs
      if (!cand) { cand = []; candVal = []; for (const f of foes) { if (!bt.canSee(b, f)) continue; if (bt.outOfReach(b, f)) continue; cand.push(f); candVal.push(CombatAI.value(bt, f)); } }
      let sc = 0;
      for (let fi = 0; fi < cand.length; fi++) {
        const f = cand[fi];
        const d = stepsTo(f, n); if (d === Infinity) continue;
        sc = Math.max(sc, (candVal[fi] + 20) / (d + 0.5) - (d === 1 ? 0 : 0));
        if (d === 1) sc += 50;
        // dès Normale : contourner pour frapper de flanc ou dans le dos, si l'on peut encore frapper ce tour
        if (flankAI && d === 1 && n.cost < b.moves && bt.dist(n, f) === 1) sc += 6 * bt.flankOf(b, f, n.c, n.r);
      }
      if (bt.hasWalls && !walled && bt.crossesWall(b.c, b.r, n.c, n.r)) sc -= 5;
      // terrain : fuir le feu, chercher le couvert face aux tireurs, la hauteur
      if (bt.fire && bt.fire[k] && !s.flying) sc -= 40;
      if (foeShoots && bt.tree(n.c, n.r)) sc += 3;
      if (bt.hill(n.c, n.r)) sc += 2;
      if (bt.inRiver(n.c, n.r) && !s.flying) sc -= 2;
      sc -= n.cost * 0.1;
      if (sc > bestScore) { bestScore = sc; best = n; }
    }
    if (best) {
      bt.moveUnit(b, best.c, best.r, reach);
      const adj2 = foes.filter(f => !f.dead && bt.canMelee(b, f));
      if (adj2.length && b.moves > 0) return bt.melee(b, U.max(adj2, f => CombatAI.value(bt, f) * (1 + (flankAI ? 0.15 * bt.flankOf(b, f) : 0))));
      return b.moves > 0 && reach.size > 1 ? false : false;
    }
    b.moves = 0;
    return false;
  },
  civilian(b) { const ab = (DATA.units[b.u.type] || {}).abilities || {}; return !b.u.hero && !Units.isFantastic(b.u) && !!(ab.construction || ab.createOutpost || ab.scout); },
  civilOn(bt, side) { const sp = bt.player && bt.player(side); return !!(sp && sp.human) || CombatAI.tf(bt, side, 'civilians'); },
  // la case la plus éloignée des ennemis qui frappent (au contact ou de loin), à l'abri des flammes ; la garnison d'une cité murée reste dedans
  keepClear(bt, b, foes) {
    const s = bt.stats(b), danger = foes.filter(f => bt.stats(f).melee > 0 || bt.stats(f).ranged > 0 || bt.stats(f).breath);
    if (!danger.length) { b.moves = 0; return false; }
    const walledIn = bt.city && b.side === DEF_SIDE && bt.hasWalls && !s.flying && bt.inCity(b.c, b.r);
    const foeShoots = danger.some(f => bt.stats(f).ranged > 0);
    const score = (c, r, cost) => {
      let dmin = 99, dsum = 0;
      for (const f of danger) { const d = Math.max(Math.abs(f.c - c), Math.abs(f.r - r)); dmin = Math.min(dmin, d); dsum += Math.min(d, 12); }
      let sc = dmin * 10 + dsum / danger.length * 2;
      if (dmin <= 1) sc -= 50;
      if (bt.fire && bt.fire[c + ',' + r] && !s.flying) sc -= 40;
      if (foeShoots && bt.tree(c, r)) sc += 3;
      return sc - cost * 0.1;
    };
    let best = null, bs = score(b.c, b.r, 0);
    const rch = bt.reachable(b);
    for (const n of rch.values()) {
      if (walledIn && !bt.inCity(n.c, n.r)) continue;
      const v = score(n.c, n.r, n.cost);
      if (v > bs + 0.5) { bs = v; best = n; }
    }
    if (best) bt.moveUnit(b, best.c, best.r, rch);
    if (!b.dead) bt.guard(b);
    return false;
  },
  // une case voisine de t, atteignable en gardant de quoi frapper, d'où l'on frappe mieux que d'ici (flanc, dos)
  // hold : reçoit le reachable calculé (hold.reach), pour le déplacement qui suit
  flankTile(bt, b, t, hold) {
    const now = bt.flankOf(b, t); if (now >= 2) return null;
    const s = bt.stats(b); let best = null, bf = now;
    const rch = bt.reachable(b); if (hold) hold.reach = rch;
    for (const n of rch.values()) {
      if (n.cost >= b.moves || bt.dist(n, t) !== 1 || (n.c === b.c && n.r === b.r)) continue;
      if (bt.fire && bt.fire[n.c + ',' + n.r] && !s.flying) continue;
      if (bt.wallOfFire && b.side === ATT_SIDE && bt.crossesWall(b.c, b.r, n.c, n.r) && !s.flying) continue;
      const fl = bt.flankOf(b, t, n.c, n.r);
      if (fl < bf || (fl === bf && (!best || n.cost >= best.cost))) continue;
      if (fl === bf && !best) continue;
      if (!bt.canMeleeAt(b, n.c, n.r, t)) continue;
      best = n; bf = fl;
    }
    return best && bf > now ? best : null;
  },
  // le meilleur sort ou la meilleure capacité de l'unité ce tour-ci, ou null si mieux vaut se battre
  UNIT_SPELL_SKIP: ['recall_hero', 'word_of_recall'],
  unitSpellChoice(bt, b, foes) {
    const friends = bt.alive(b.side);
    const engaged = foes.some(f => bt.canMelee(b, f));
    let best = null, bs = 0;
    for (const opt of bt.unitSpells(b)) {
      const id = opt.id, sp = DATA.spells[id] || { kind: id === 'summon_demons' ? 'summon' : 'special', params: {} };
      if (CombatAI.UNIT_SPELL_SKIP.includes(id) || CombatSpells.alreadyActive(bt, b.side, id)) continue;
      if (CombatSpells.nodeFizzle(bt, b.side, id) > 0.5) continue; // le nœud le dissiperait sans doute : mieux vaut frapper
      if (sp.params && sp.params.siege && !CombatSpells.siegeUseful(bt, b.side, id)) continue;   // pas de murailles à abattre ici
      if (CombatAI.pointless(bt, b.side, id)) continue;
      const tt = CombatSpells.targetType(id);
      let target = null, sc = 0;
      if (id === 'healing' || id === 'mass_healing') {
        const hurt = friends.filter(x => x.u.dmg >= 4 && CombatSpells.canAffect(bt, x, id));
        if (!hurt.length) continue;
        if (id === 'healing') { target = U.max(hurt, x => x.u.dmg); sc = 3 + Math.min(5, target.u.dmg); } else sc = 3 + hurt.length * 2;
      } else if (tt === 'enemyUnit' && CombatSpells.DAMAGE[id] && CombatAI.tf(bt, b.side, 'nowaste')) {
        // un trait : la cible où il fera vraiment mal, aucune s'il ne ferait sans doute rien (mieux vaut alors tirer ou frapper)
        const r = new RNG((bt.round * 7919 + b.side * 31 + (b.u.id | 0) * 131) >>> 0), rnd = () => r.next();
        let bv = 0;
        for (const f of CombatSpells.validTargets(bt, b.side, id).filter(f => f.u)) {
          const fc = CombatSpells.damageForecast(bt, id, f, 0, 40, rnd);
          if (fc.immune || fc.dmg < 0.75 || fc.zero > 0.6) continue;
          const st = Units.strength(bt.game, f.u), v = ((st * Math.min(1, fc.dmg / Math.max(1, fc.hp)) + 0.3 * st * fc.kill) / 10 + (f.u.hero ? 2 : 0)) * (1 - fc.zero);
          if (v > bv) { bv = v; target = f; }
        }
        if (!target) continue;
        sc = 6 + Math.min(3, bv / 5);
      } else if (tt === 'enemyUnit') {
        target = U.max(CombatSpells.validTargets(bt, b.side, id).filter(f => f.u), f => CombatAI.value(bt, f));
        if (!target) continue;
        sc = 6 + Units.strength(bt.game, target.u) / 60;
      } else if (tt === 'friendlyUnit') {
        target = U.max(friends.filter(f => CombatSpells.canAffect(bt, f, id)), f => Units.strength(bt.game, f.u) * (f === b ? 1.15 : 1));
        if (!target) continue;
        // un renfort vaut surtout avant la mêlée, et seulement s'il sert contre ces ennemis-là
        const v = CombatAI.buffValue(bt, target, sp, foes);
        if (v <= 0) continue;
        sc = (engaged ? 0 : 2) + v;
      } else if (tt === 'none') {
        if (sp.kind === 'areaDamage' || sp.kind === 'resistOrDie') {
          const n = foes.filter(f => CombatSpells.canAffect(bt, f, id)).length;
          if (!n) continue;
          sc = 5 + n;
        } else sc = sp.kind === 'summon' ? 7 : sp.kind === 'combatEnchant' ? 4 + (friends.length + foes.length) * .4 : 4;
      } else continue;
      if (opt.free) sc += 2;
      if (sc > bs) { bs = sc; best = { id, target }; }
    }
    return bs >= 4 ? best : null;
  },
  // ce qu'un enchantement de champ de bataille apporterait à ce camp, en nombre d'unités qu'il sert (moins celles qu'il dessert)
  enchantGain(bt, side, id) {
    const mine = bt.alive(side), foes = bt.alive(1 - side), all = mine.length + foes.length;
    const realm = b => Battle.lightRealm(b.u), cnt = (l, f) => l.filter(f).length;
    if (id === 'true_light') return cnt(mine, b => realm(b) === 'life') + cnt(foes, b => realm(b) === 'death') - cnt(mine, b => realm(b) === 'death') - cnt(foes, b => realm(b) === 'life');
    if (id === 'darkness') return cnt(mine, b => realm(b) === 'death') + cnt(foes, b => realm(b) === 'life') - cnt(mine, b => realm(b) === 'life') - cnt(foes, b => realm(b) === 'death');
    if (id === 'metal_fires') return cnt(mine, b => Units.isNormal(b.u) && bt.stats(b).melee > 0);
    if (id === 'entangle') return cnt(foes, b => { const s = bt.stats(b); return !s.flying && !s.ab.nonCorporeal; });
    if (id === 'warp_reality') return cnt(foes, b => realm(b) !== 'chaos') - cnt(mine, b => realm(b) !== 'chaos');
    if (id === 'wrack') return cnt(foes, b => realm(b) !== 'death');
    return all;
  },
  // sorts sans objet ici : contre-magie encore pleine ou face à des monstres sans sorcier, fuite de mana sans lanceur adverse
  pointless(bt, side, id) {
    if (CombatSpells.uselessWhy(bt, side, id)) return true;
    const foeWizard = bt.player(1 - side);
    if (id === 'counter_magic') return !foeWizard || (bt.ench[side].includes('counter_magic') && bt.counterMagic[side] > 0);
    if (id === 'mana_leak') return !foeWizard && !bt.alive(1 - side).some(f => f.casterMana > 0 || (f.ammo > 0 && bt.stats(f).rangedType === 'magic'));
    if (id === 'disenchant_area' || id === 'disenchant_true') return !bt.alive(1 - side).some(f => f.u.ench.length || f.tempEnch.length) && !bt.alive(side).some(f => f.curses.length || f.asleep || f.confused || f.web > 0) && !bt.ench[1 - side].length && !bt.globalEnch.some(e => bt.globalBy[e] === 1 - side);
    return false;
  },
  // ce qu'un enchantement apporterait à cette unité contre ces ennemis (0 : rien d'utile ici)
  buffValue(bt, t, sp, foes, s2) {
    const p = sp.params || {}, s = bt.stats(t);
    if (s2 && [].concat(p.ability || []).includes('illusionsImmunity')) return foes.some(f => f.invisible || bt.isInvisible(f)) ? 3 + Units.strength(bt.game, t.u) / 200 : 0;   // Vision vraie : seulement contre des invisibles
    const realms = new Set(foes.map(f => Units.realmOf(f.u)).filter(Boolean));
    if (p.vs && !p.vs.some(r => realms.has(r))) return 0;
    if (p.immuneRealms) return p.immuneRealms.some(r => realms.has(r)) ? 4 : 0;
    const ab = [].concat(p.ability || []);
    let v = (p.melee || 0) * 1.5 + (s.ranged > 0 ? (p.ranged || 0) : 0) + (p.def || 0) + (p.res || 0) * .3 + (p.hp || 0) * 1.5 + (p.toHitPct || 0) / 5
      + (p.damageReduction || 0) * 1.5 + (p.meleeMult ? 3 : 0) + (p.attacksMult ? 4 : 0) + (p.experienceLevel ? 2 : 0) + (p.magicWeapon ? 1 : 0);
    const W = { weaponImmunity: 3, invisibility: 2, regeneration: 1.5, immolation: 2, causeFear: 1, magicImmunity: 1, flying: .5 };
    for (const a of ab) v += a === 'missileImmunity' ? (foes.some(f => bt.stats(f).ranged > 0) ? 2.5 : 0) : (W[a] || 0);
    return v;
  },
  maybeCast(bt, side) {
    const opts = CombatSpells.wizardOptions(bt, side);
    if (!opts.length) return;
    const pl = bt.player(side);
    if (!pl || pl.human) return;
    const foes = bt.alive(1 - side), friends = bt.alive(side), towers = bt.enemyTowers(side);
    if (!foes.length && !towers.length) return;
    const foePow = U.sum(foes, f => Units.strength(bt.game, f.u)), myPow = U.sum(friends, f => Units.strength(bt.game, f.u));
    const S2 = CombatAI.tf(bt, side, 'cspells2');   // en essai : chances de réussite, morts relevés, dissipations, sorts spéciaux
    // le va-tout : sa capitale assiégée, le sorcier jette tout dans la bataille (la perdre, c'est l'exil, et des tours de mana pour revenir)
    const allIn = side === DEF_SIDE && !!bt.city && bt.city.owner === pl.id && pl.fortress === bt.city.id && CombatAI.tf(bt, side, 'allin');
    let best = null, bestScore = 0;
    const extraOf = {};
    for (const o of opts) {
      const sp = DATA.spells[o.id]; const tt = CombatSpells.targetType(o.id);
      let score = 0, target = null;
      if (!allIn && o.cost > pl.mana * 0.6 && o.cost > 30) continue;
      if (CombatAI.pointless(bt, side, o.id)) continue;
      if (sp.kind === 'damage' || sp.kind === 'resistOrDie' || sp.kind === 'curse' || sp.kind === 'areaDamage') {
        if (tt === 'enemyUnit' && CombatSpells.DAMAGE[o.id] && CombatAI.tf(bt, side, 'spellaim')) {
          // dès Normale : la cible où le sort fait le plus de mal (l'achever vaut davantage), et le mana ajouté qui le rentabilise
          const plan = CombatAI.damagePlan(bt, side, o.id, CombatSpells.validTargets(bt, side, o.id).filter(f => f.u), allIn);
          if (plan) { target = plan.t; score = plan.score; extraOf[o.id] = plan.x; }
        } else if (tt === 'enemyUnit' && S2) {
          // la valeur de la cible pondérée par la chance que le sort prenne (un Vertige sur un Djinn ne passe jamais)
          const ch = f => { const od = CombatSpells.odds(bt, side, o.id, f); return od ? od.chance : 1; };
          const t = U.max(CombatSpells.validTargets(bt, side, o.id).filter(f => f.u && ch(f) > 0.05), f => CombatAI.value(bt, f) * ch(f));
          if (t) { target = t; score = (Units.strength(bt.game, t.u) / 10 + (sp.kind === 'damage' ? 5 : 3)) * ch(t); }
        } else if (tt === 'enemyUnit') {
          const t = U.max(CombatSpells.validTargets(bt, side, o.id).filter(f => f.u), f => CombatAI.value(bt, f));
          if (t) { target = t; score = Units.strength(bt.game, t.u) / 10 + (sp.kind === 'damage' ? 5 : 3); }
        } else score = U.sum(foes.filter(f => CombatSpells.canAffect(bt, f, o.id)), f => Units.strength(bt.game, f.u)) / 30;
      } else if (sp.kind === 'summon') score = foePow > myPow ? 25 : 8;
      else if (sp.kind === 'combatEnchant') score = bt.ench[side].includes(o.id) || bt.globalEnch.includes(o.id) ? 0 : CombatAI.enchantGain(bt, side, o.id) * 1.5;
      else if (sp.kind === 'heal') { const t = U.max(friends.filter(f => f.u.dmg > 3 && CombatSpells.canAffect(bt, f, o.id)), f => f.u.dmg); if (t) { target = t; score = t.u.dmg; } }
      else if (sp.kind === 'unitEnchant' && tt === 'friendlyUnit') {
        // un renfort qui sert contre ces ennemis-là (Bénédiction sans créature de la mort ou du chaos en face : rien)
        const t = U.max(friends.filter(f => CombatSpells.canAffect(bt, f, o.id) && CombatAI.buffValue(bt, f, sp, foes, S2) > 0), f => Units.strength(bt.game, f.u));
        if (t) { target = t; score = Units.strength(bt.game, t.u) / 25; }
      }
      if (S2 && !score) {
        const vt = () => CombatSpells.validTargets(bt, side, o.id).filter(f => f.u);
        if (tt === 'deadUnit') { const t = U.max(CombatSpells.validTargets(bt, side, o.id), f => Units.strength(bt.game, f.u)); if (t) { target = t; score = Units.strength(bt.game, t.u) / 12 + 4; } }
        else if (o.id === 'warp_wood') { const v = f => { const s = bt.stats(f); return s.ranged * bt.figures(f) * Math.min(f.ammo || 0, 4); }; const t = U.max(vt(), v); if (t && v(t) > 0) { target = t; score = v(t) / 6; } }
        else if (o.id === 'cracks_call') { const t = U.max(vt(), f => Units.strength(bt.game, f.u)); if (t) { target = t; score = Units.strength(bt.game, t.u) / 40 + 1; } }
        else if (o.id === 'call_chaos') score = foes.length * 1.8;
        else if (o.id === 'dispel_magic' || o.id === 'dispel_magic_true') {
          const str = ((sp.combatCost || sp.cost || 10)) * (o.id === 'dispel_magic_true' ? 3 : 1), pr = c => str / (str + c);
          const v = f => f.side !== side ? U.sum(f.u.ench.concat(f.tempEnch), e => { const c = (DATA.spells[e] || {}).cost || 20; return c / 12 * pr(c); }) + (f.u.combatOnly && f.u.summoned && Units.isFantastic(f.u) ? Units.strength(bt.game, f.u) / 10 * pr(DATA.units[f.u.type].castCost || 50) : 0)
            : (f.curses.length * 3 + (f.asleep || f.confused ? 5 : 0) + (f.web > 0 ? 3 : 0) + (f.possessed && f.origSide === side ? Units.strength(bt.game, f.u) / 10 : 0)) * pr(20);
          const t = U.max(CombatSpells.validTargets(bt, side, o.id), v); if (t && v(t) > 0) { target = t; score = v(t); }
        }
        else if (o.id === 'disenchant_area' || o.id === 'disenchant_true') {
          const str = (o.id === 'disenchant_true' ? 150 : 50), pr = c => str / (str + c);
          score = U.sum(foes, f => U.sum(f.u.ench.concat(f.tempEnch), e => { const c = (DATA.spells[e] || {}).cost || 20; return c / 12 * pr(c); })) + U.sum(friends, f => (f.curses.length * 3 + (f.asleep || f.confused ? 5 : 0)) * pr(20));
        }
        else if (o.id === 'wall_of_fire' && !CombatSpells.uselessWhy(bt, side, o.id)) score = foes.filter(f => !bt.stats(f).flying && bt.stats(f).melee > 0).length * 1.3;
        else if (o.id === 'wall_of_darkness' && !CombatSpells.uselessWhy(bt, side, o.id)) score = foes.filter(f => bt.stats(f).ranged > 0).length * 1.6;
      }
      if (sp.params && sp.params.siege) {
        if (!CombatSpells.siegeUseful(bt, side, o.id)) continue;
        const stones = towers.filter(t => t.kind === 'stone').length, spire = towers.some(t => t.kind === 'spire');
        score = o.id === 'jericho_trumpets' ? 4 + 2 * stones + (spire ? 1 : 0) : o.id === 'haunted_ramparts' ? (foes.length ? 4 + 2.5 * stones : 0) : (spire ? (foes.length ? 5 : 9) : 0);
      }
      // tours : Disruption rase une tour de pierre ; les traits visent la tour du sorcier quand il n'y a plus que lui
      if (towers.length && (CombatSpells.TOWER_HIT[o.id] || o.id === 'disrupt')) {
        const stonesUp = towers.filter(t => t.kind === 'stone');
        const tg = o.id === 'disrupt' ? (stonesUp.length ? stonesUp : towers.filter(t => t.kind === 'gate')) : towers.filter(t => t.kind !== 'gate' && (!foes.length || t.kind === 'spire'));
        // Disruption : la tour (sinon la porte) la plus proche de nos troupes
        const near = t => U.sum(friends, f => bt.dist(f, t)) / Math.max(1, friends.length);
        const t = o.id === 'disrupt' ? U.min(tg, near) : U.min(tg, t => t.hp);
        const ts = !t ? 0 : o.id === 'disrupt' ? 9 : !foes.length ? 7 : ['doom_bolt', 'warp_lightning'].includes(o.id) ? 6 : 0;
        if (ts > score) { score = ts; target = o.id === 'disrupt' ? [t.c, t.r] : t; }
      }
      if ((tt === 'enemyUnit' || tt === 'friendlyUnit') && !target) continue;
      if ((tt === 'deadUnit' && !target) || (tt === 'combatTile' && !target)) continue;
      score *= 0.8 + bt.rng.next() * 0.4;
      score *= 1 - CombatSpells.nodeFizzle(bt, side, o.id);
      score -= (o.cost + (extraOf[o.id] || 0)) / (allIn ? 120 : 40);
      if (score > bestScore) { bestScore = score; best = { id: o.id, target, extra: extraOf[o.id] || 0 }; }
    }
    if (best && bestScore > (allIn ? 0.5 : 2)) CombatSpells.cast(bt, side, best.id, best.target, null, best.extra);
  },
  // le meilleur emploi d'un sort de dégâts : cible et mana ajouté (dès Normale, quand le mana abonde : 'power')
  damagePlan(bt, side, id, targets, allIn) {
    if (!targets.length) return null;
    const pl = bt.player(side), base = Magic.spellCost(bt.game, pl, id, true);
    const maxX = allIn || (CombatAI.tf(bt, side, 'power') && pl.mana > base * 4) ? CombatSpells.maxExtra(bt, side, id, null) : 0;
    const step = CombatSpells.EXTRA_STEP[id] || 5, xs = [0];
    for (let x = step * 2; x <= maxX; x += Math.max(step, Math.ceil(maxX / 4 / step) * step)) xs.push(x);
    if (maxX > 0 && !xs.includes(maxX)) xs.push(maxX);
    const r = new RNG((bt.round * 7919 + side * 31 + targets.length * 131 + base) >>> 0), rnd = () => r.next();
    const noWaste = CombatAI.tf(bt, side, 'nowaste');
    let best = null;
    for (const t of targets) {
      const st = Units.strength(bt.game, t.u);
      for (const x of xs) {
        if (x > 0 && !allIn && base + x > pl.mana * 0.6) continue;
        const f = CombatSpells.damageForecast(bt, id, t, x, 60, rnd);
        if (f.immune) break;
        // un trait qui ne ferait sans doute rien est du mana jeté (la moitié des Traits de feu de l'IA, en 0.30.2) : plus de mana, ou une autre cible
        if (noWaste && (f.dmg < 0.75 || f.zero > 0.6)) continue;
        const sc = (st * Math.min(1, f.dmg / Math.max(1, f.hp)) + 0.3 * st * f.kill) / 10 + ((t.u.hero ? 4 : 0) + 2) * (noWaste ? 1 - f.zero : 1);
        const net = sc - x / 40;
        if (!best || net > best.net) best = { t, x, score: sc, net };
      }
    }
    return best;
  },
  // combat entièrement automatique
  autoResolve(bt) {
    let guard = 0;
    while (!bt.over && guard++ < 400) CombatAI.playSide(bt);
    if (!bt.over) bt.finish(DEF_SIDE);
  },
};
