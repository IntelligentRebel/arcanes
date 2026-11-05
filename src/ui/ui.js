'use strict';
// Infrastructure d'interface : modales, info-bulles, notifications, utilitaires DOM.

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v; else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
function spriteCanvas(key, size, cls) {
  size = size || 32;
  const k = Sprites.resolve(key);
  if (k && Sprites.hasHD(k)) {
    // image HD : canevas haute définition, affiché à la taille demandée (ou celle imposée par le CSS du contexte)
    const r = Sprites.hdMap[k], px = Math.min(r[2], Math.round(size * 2.5 * (window.devicePixelRatio || 1)));
    const c = h('canvas', { width: px, height: px, class: 'hd ' + (cls || ''), style: '--w:' + size + 'px' });
    Sprites.paint(c, key);
    return c;
  }
  const c = h('canvas', { width: size, height: size, class: cls || '' });
  Sprites.paint(c, key);
  return c;
}

const UI = {
  // armes magiques d'une unité normale : leur lueur, comme dans l'original (bleue pour les armes magiques, argentée pour le
  // mithril, dorée pour l'adamantium, orangée pour la Lame de feu) ; null pour une unité sans arme ou aux armes ordinaires
  // (les héros et les créatures fantastiques frappent toujours comme avec des armes magiques : pas de lueur)
  weaponGlow(game, u, temp, metalFires) {
    if (!u || !DATA.units[u.type] || !Units.isNormal(u) || !Units.wieldsWeapons(u)) return null;
    const en = temp && temp.length ? u.ench.concat(temp) : u.ench;
    if (en.includes('flame_blade') || metalFires) return '255,140,50';
    if (en.includes('eldritch_weapon')) return '200,120,255';
    if (u.weapon === 3) return '255,205,90';
    if (u.weapon === 2) return '225,235,255';
    const pl = game && game.players[u.owner];
    if (u.weapon === 1 || en.includes('holy_weapon') || (pl && pl.globals && pl.globals.includes('holy_arms'))) return '110,190,255';
    return null;
  },
  // la même lueur sur la vignette d'une unité (cartes de pile, garnisons) : son arme luit
  glowCanvas(cv, game, u) {
    const g = UI.weaponGlow(game, u); if (!g || !cv) return cv;
    try { Weapons.onStill(cv.getContext('2d'), Sprites.unitKey(u), 0, 0, cv.width, { rgb: g, alpha: 1 }); } catch (e) { }
    return cv;
  },
  // aplat de couleur en image : le mode sombre forcé de Chrome (et des extensions du même genre) assombrit les fonds clairs
  // (les livres de Vie devenaient noirs), mais laisse les images intactes
  solid(color) { return 'background-image:url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="' + color + '"/></svg>') + '");background-size:100% 100%;'; },
  game: null, pid: 0, busy: false, modals: [],
  refresh() { if (typeof App !== 'undefined' && App.game) App.dirty = true; },

  // ---------- modales ----------
  modal({ title, body, footer, width, onClose, cls, noClose }) {
    const root = $('#modal-root');
    const ov = h('div', { class: 'overlay' });
    const m = h('div', { class: 'modal ' + (cls || ''), style: width ? 'width:' + width + 'px' : '' });
    const close = () => { if (!ov.parentNode) return; ov.remove(); UI.modals = UI.modals.filter(x => x !== api); if (onClose) onClose(); UI.refresh(); };
    const head = h('header', null, h('h2', null, title || ''), noClose ? null : h('button', { class: 'x', title: 'Fermer (Échap)', onclick: close }, '×'));
    const b = h('div', { class: 'body' });
    if (body) b.append(body);
    m.append(head, b);
    if (footer) { const f = h('footer'); f.append(...[].concat(footer)); m.append(f); }
    ov.append(m);
    ov.addEventListener('mousedown', e => { if (e.target === ov && !noClose) close(); });
    root.append(ov);
    const api = { el: m, body: b, close, noClose, setTitle: t => { head.querySelector('h2').textContent = t; } };
    UI.modals.push(api);
    return api;
  },
  // coup d'oeil : les fenêtres s'effacent le temps de regarder un lieu sur la carte
  peek(x, y, plane, label) {
    if (document.body.classList.contains('peeking')) return;
    const onKey = e => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); back(); } };
    const back = () => { document.body.classList.remove('peeking'); bar.remove(); window.removeEventListener('keydown', onKey, true); };
    MapView.centerOn(x, y, plane); MapView.ping(x, y, plane);
    UI.hideTip();
    document.body.classList.add('peeking');
    const bar = h('div', { id: 'peekbar', class: 'card' }, label || 'Coup d\'oeil sur la carte', h('button', { class: 'btn primary', onclick: back }, 'Revenir'));
    document.body.append(bar);
    window.addEventListener('keydown', onKey, true);
  },
  closeTop() { const m = UI.modals[UI.modals.length - 1]; if (m && !m.noClose) { m.close(); return true; } return false; },
  closeAll() { for (const m of UI.modals.slice()) m.close(); },
  confirm(title, text, ok = 'Confirmer', cancel = 'Annuler') {
    if (window.AUTO_CHOICE) return Promise.resolve(true);
    return new Promise(res => {
      let done = false;
      const m = UI.modal({ title, body: h('div', { style: 'max-width:460px', html: text }), width: 480,
        footer: [h('button', { class: 'btn ghost', onclick: () => { done = true; m.close(); res(false); } }, cancel), h('button', { class: 'btn primary', onclick: () => { done = true; m.close(); res(true); } }, ok)],
        onClose: () => { if (!done) res(false); } });
    });
  },
  choice(title, html, options, opts = {}) {
    if (window.AUTO_CHOICE) { const o = options.find(x => x.primary && !x.disabled) || options.find(x => !x.disabled) || options[0]; return Promise.resolve(o.value); }
    return new Promise(res => {
      let done = false;
      const m = UI.modal({ title, body: h('div', { style: 'max-width:' + ((opts.width || 540) - 20) + 'px', html }), width: opts.width || 540, noClose: !!opts.noClose, cls: opts.cls,
        footer: options.map(o => h('button', { class: 'btn ' + (o.primary ? 'primary' : '') + (o.danger ? ' danger' : ''), disabled: !!o.disabled, onclick: () => { done = true; m.close(); res(o.value); } }, o.label)),
        onClose: () => { if (!done) res(opts.dismiss != null ? opts.dismiss : null); } });
    });
  },

  // ---------- notifications ----------
  toast(text, kind, key) {
    const box = $('#toasts');
    if (key) for (const o of box.querySelectorAll('[data-key="' + key + '"]')) o.remove();
    const t = h('div', { class: 'toast ' + (kind || ''), html: text });
    if (key) t.dataset.key = key;
    box.append(t);
    // au-delà de cinq, les plus anciennes notifications partent ; jamais les bandeaux rouges d'alerte
    while (box.children.length > 5) { const old = box.querySelector('.toast:not(.alertbar)'); if (!old || old === t) break; old.remove(); }
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, kind === 'warn' ? 4200 : 3000);
  },

  // ---------- info-bulles ----------
  // capacités affichées dans une fiche statique (panneau de la cité…) : leur explication au survol
  abilityHover() {
    if (UI._ablHover) return; UI._ablHover = true;
    document.addEventListener('mouseover', e => {
      const el = e.target.closest && e.target.closest('.abl[data-abl]'); if (!el || el.closest('#tooltip') || UI.tipOwner === el) return;
      const v = el.dataset.v; UI.showTip(abilityTip(el.dataset.abl, v === '' ? undefined : +v), e, el);
      const leave = () => { UI.hideTip(); el.removeEventListener('mouseleave', leave); }; el.addEventListener('mouseleave', leave);
    });
  },
  tipOn(el, fn) {
    el.addEventListener('mouseenter', e => UI.showTip(typeof fn === 'function' ? fn() : fn, e, el));
    el.addEventListener('mousemove', e => UI.moveTip(e));
    el.addEventListener('mouseleave', () => UI.hideTip());
  },
  tipOwner: null,
  showTip(html, e, owner) {
    const t = $('#tooltip'); if (!html) return; t.innerHTML = html; t.style.display = 'block'; UI.moveTip(e);
    UI.tipOwner = owner || null;
    if (!UI.tipGuard) {
      // filet de sécurité : l'élément survolé peut disparaître ou être redessiné sans « mouseleave »
      UI.tipGuard = true;
      document.addEventListener('mousemove', ev => { const o = UI.tipOwner; if (o && (!o.isConnected || !o.contains(ev.target))) UI.hideTip(); }, true);
      document.addEventListener('mousedown', () => UI.hideTip(), true);
      document.addEventListener('wheel', () => UI.hideTip(), { capture: true, passive: true });
      document.addEventListener('keydown', () => UI.hideTip(), true);
      setInterval(() => { const o = UI.tipOwner; if (o && !o.isConnected) UI.hideTip(); }, 250);
    }
  },
  moveTip(e) { const t = $('#tooltip'); const w = t.offsetWidth, hh = t.offsetHeight; let x = e.clientX + 14, y = e.clientY + 14; if (x + w > innerWidth - 6) x = e.clientX - w - 10; if (y + hh > innerHeight - 6) y = e.clientY - hh - 10; t.style.left = x + 'px'; t.style.top = y + 'px'; },
  hideTip() { $('#tooltip').style.display = 'none'; UI.tipOwner = null; },

  setBusy(text) {
    const b = $('#busy');
    if (!text) { b.hidden = true; UI.busy = false; return; }
    // pendant une bataille (attaque subie au tour des sorciers rivaux), le voile reste caché : il reviendra après
    b.hidden = !!(typeof CombatView !== 'undefined' && CombatView.active); UI.busy = true;
    b.innerHTML = '<div class="card"><div class="spin"></div><span>' + U.esc(text) + '</span></div>';
  },

  // âge d'un rapport, en mois de jeu (un tour = un mois)
  ago(turns) {
    if (turns <= 0) return 'de ce mois-ci';
    const y = Math.floor(turns / 12), m = turns % 12;
    const parts = [];
    if (y) parts.push(y + ' an' + (y > 1 ? 's' : ''));
    if (m) parts.push(m + ' mois');
    return 'd\'il y a ' + parts.join(' et ');
  },
  dateOf(turn) {
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const m = (turn - 1) % 12, y = 1400 + Math.floor((turn - 1) / 12);
    return months[m] + ' ' + y;
  },

  // ---------- descriptions ----------
  unitTip(u, game, opts) {
    opts = opts || {};
    const s = Units.stats(game, u);
    const d = DATA.units[u.type];
    const lv = Units.levelInfo(game, u);
    let html = '<h4>' + U.esc(Units.label(u)) + '</h4>';
    if (u.hero) html += '<div class="muted">' + U.esc(u.hero.title) + (lv ? ' · ' + lv.name : '') + ' · ' + u.xp + ' XP</div>';
    else if (lv) html += '<div class="muted">' + lv.name + ' · ' + u.xp + ' XP' + (u.weapon ? ' · armes ' + Units.WEAPON_WORDS[u.weapon] : '') + '</div>';

    html += UI.kindLine(u);
    if (u.nodeBound != null) html += '<div class="gold">Gardien de nœud : sans entretien, ne s\'éloigne pas à plus de 2 cases</div>';
    if (u.pactFree) html += '<div class="gold">Lié par un pacte : sans entretien</div>';
    if (u.riteDemon) html += '<div class="gold">Démon légendaire du pacte : insensible au Bannissement, à la Confusion et au Grand Renvoi</div>';
    if (u.stasis) html += '<div class="danger">Figée dans la stase : ni mouvement ni combat ; chaque tour, un jet de résistance (−5) peut la libérer</div>';
    if (u.crisis) html += '<div class="danger">Créature de la Brèche</div>';
    else if (u.riftOf != null) html += '<div class="danger">Venue du Miroir par une faille</div>';
    if (u.nemesis) html += UI.nemesisLine(u, game);
    // le Démon légendaire : qui il traque (il ne combat personne d'autre)
    if (u.riteDemon && typeof Rite !== 'undefined') { const ra = Rite.active(game); if (ra && ra.target != null) html += '<div class="' + (ra.target === App.pid ? 'danger' : 'gold') + '">Ne combat que ' + (ra.target === App.pid ? 'vous' : U.esc(Players.nameFor(game, App.pid, ra.target))) + ', la cible du pacte.</div>'; }
    if (u.avatar) html += '<div class="gold">Vous, en personne : compétence de lancement divisée par deux tant que vous êtes ici ; si vous tombez, vous êtes banni</div>';
    if (u.hero && u.hero.quest) html += '<div style="margin-top:3px"><span class="gold">Quête</span> : ' + U.esc(Heroes.questText(game, u)) + (u.hero.story && !u.hero.quest.done ? '<div class="dim" style="font-style:italic">' + U.esc(u.hero.story) + '</div>' : '') + '</div>';
    if (u.hero && u.hero.pending && u.hero.pending.length) html += '<div class="ok">Talent à choisir</div>';
    if (u.status === 'governor' && game.cities[u.govCity]) html += '<div class="gold">Gouverneur de ' + U.esc(game.cities[u.govCity].name) + '</div>';
    html += UI.statLine(s, u, game);
    const ab = Object.keys(s.ab).filter(k => ABILITY_NAMES[k]);
    if (ab.length) html += '<div style="margin-top:4px">' + ab.map(k => '<span class="abl" data-abl="' + k + '" data-v="' + (typeof s.ab[k] === 'number' ? s.ab[k] : '') + '">' + ABILITY_NAMES[k] + (typeof s.ab[k] === 'number' && !['toHit', 'caster'].includes(k) ? ' ' + Math.abs(s.ab[k]) : k === 'toHit' ? ' +' + s.ab[k] + '%' : '') + '</span>').join('') + '</div>';
    if (u.ench.length || u.chaosChannel) html += '<div style="margin-top:4px">' + u.ench.map(e => '<span class="abl e">' + (DATA.spells[e] ? DATA.spells[e].name : e) + (opts.temp && opts.temp.includes(e) && !(opts.real && opts.real.ench.includes(e)) ? ' (ce combat)' : '') + '</span>').join('') + (u.chaosChannel ? '<span class="abl e">Canaux du chaos : ' + Spells.CHANNEL_NAMES[u.chaosChannel] + '</span>' : '') + '</div>';
    const up = Units.upkeep(game, opts.real || u);   // en combat : l'entretien de l'unité réelle, pas celui des sorts du combat
    const ups = [up.gold ? up.gold + ' or' : '', up.food ? up.food + ' nourriture' : '', up.mana ? up.mana + ' mana' : ''].filter(Boolean).join(', ');
    if (ups) html += '<div class="dim" style="margin-top:4px">Entretien : ' + ups + ' / tour</div>';
    if (d.desc) html += '<div class="muted" style="margin-top:4px">' + U.esc(d.desc) + '</div>';
    return html;
  },
  // némésis : qui elle a abattu, son rang, ce que rapporte sa chute
  nemesisLine(u, game) {
    const n = u.nemesis, L = n.lvl, foes = n.foes || [n.foe];
    // la vôtre : un nom gagné en abattant un héros ennemi (la némésis de son maître)
    let t = u.owner === App.pid ? '<div class="gold">Légende : ' + U.esc(Nemesis.title(u)) + ' · rang ' + L + ' (+' + L + ' attaque, défense, résistance)</div>'
      : '<div class="danger">Némésis : ' + U.esc(Nemesis.title(u)) + ' · rang ' + L + ' (+' + L + ' attaque, défense, résistance)</div>';
    if (foes.includes(App.pid) && u.owner !== App.pid) t += '<div class="gold">L\'abattre : vengeance, +' + 60 * L + ' or, +' + (2 + L) + ' renommée, +' + 15 * L + ' XP pour votre armée.</div>';
    return t;
  },
  // nature magique : normale, héros, créature fantastique de tel royaume, morte-vivante
  kindLabel(u) {
    const k = Units.kind(u), parts = [];
    const the = { life: 'la Vie', death: 'la Mort', chaos: 'le Chaos', nature: 'la Nature', sorcery: 'la Sorcellerie', arcane: 'l\'Arcane' };
    if (k.hero) parts.push('Héros');
    else if (k.fantastic) parts.push('Créature fantastique' + (k.realm ? ' ' + App.de(the[k.realm]) : ''));
    else parts.push('Unité normale' + (Units.raceAdj(k.race) ? ' · ' + Units.raceAdj(k.race) : ''));
    if (k.realm && !k.fantastic) parts.push('imprégnée par ' + the[k.realm]);
    if (k.undead) parts.push('morte-vivante');
    if ((k.undead || k.realm === 'death') && !u.riteDemon && typeof App !== 'undefined' && App.game && !Units.stats(App.game, u).ab.regeneration) parts.push('ne guérit pas');
    return { text: parts.join(' · '), color: k.realm ? REALM_COLORS[k.realm] : k.hero ? '#f3d27a' : '#9aa6b8', k };
  },
  kindLine(u) {
    const l = UI.kindLabel(u);
    return '<div class="kindline"><span class="rgem" style="--rc:' + l.color + '"></span>' + U.esc(l.text) + '</div>';
  },
  // les sorts connus du joueur dont l'effet dépend de la nature de cette unité : lesquels la touchent, lesquels glissent dessus
  spellFitLine(u, game) {
    const me = typeof App !== 'undefined' && App.me && App.me(); if (!me || !me.known) return '';
    const mine = u.owner === me.id;
    const hostile = ['enemyUnit', 'allEnemyUnits', 'anyUnit', 'allUnits'], friendly = ['friendlyUnit', 'allFriendlyUnits', 'friendlyHero', 'anyUnit'];
    const ok = [], no = [];
    for (const id of me.known) {
      const sp = DATA.spells[id]; if (!sp) continue;
      const p = sp.params || {};
      const global = sp.target === 'none' && sp.kind === 'resistOrDie' && (p.normalOnly || p.fantasticOnly);
      if (!global && !(mine ? friendly : hostile).includes(sp.target)) continue;
      const typed = p.normalOnly || p.fantasticOnly || p.onlyRealms || (p.targets && sp.target !== 'none') || ['web', 'cracks_call', 'healing'].includes(id);
      const fits = Units.spellFits(game, u, id);
      if (!typed && fits) continue;
      (fits ? ok : no).push(sp.name);
    }
    if (!ok.length && !no.length) return '';
    return '<div class="spfit"><span class="dim">Vos sorts : </span>' + ok.map(n => '<span class="fy">' + U.esc(n) + '</span>').join('') + no.map(n => '<span class="fn" title="Sans effet sur cette unité">' + U.esc(n) + '</span>').join('') + '</div>';
  },
  statLine(s, u, game) {
    const hp = u ? Units.health(game, u) : s.maxHp;
    const rangedIcon = s.rangedType === 'magic' ? 'magic' : s.rangedType === 'boulder' ? 'boulder' : 'ranged';
    let html = '<div class="statrow">';
    html += '<span class="stat" title="Figurines">' + ICONS.figs + (u ? Units.aliveFigures(game, u) + '/' : '') + s.figures + '</span>';
    if (s.melee) html += '<span class="stat" title="Attaque">' + ICONS.melee + s.melee + '</span>';
    if (s.ranged) html += '<span class="stat" title="Tir">' + ICONS[rangedIcon] + s.ranged + (s.ammo ? '<span class="dim">×' + s.ammo + '</span>' : '') + '</span>';
    if (s.thrown) html += '<span class="stat" title="Lancer">' + ICONS.ranged + 'L' + s.thrown + '</span>';
    if (s.breath) html += '<span class="stat" title="Souffle">' + ICONS.magic + 'S' + s.breath + '</span>';
    html += '<span class="stat" title="Défense">' + ICONS.def + s.def + '</span>';
    html += '<span class="stat" title="Résistance">' + ICONS.res + s.res + '</span>';
    html += '<span class="stat" title="Points de vie">' + ICONS.hp + (u ? hp + '/' : '') + s.maxHp + '</span>';
    html += '<span class="stat" title="Mouvement">' + (s.flying ? ICONS.fly : ICONS.move) + s.move + '</span>';
    if (s.toHit !== 30) html += '<span class="stat" title="Chance de toucher' + (Units.pierce(s.toHit) ? ' : chaque coup porte, et ignore ' + Units.pierce(s.toHit) + ' point' + (Units.pierce(s.toHit) > 1 ? 's' : '') + ' de défense de la cible' : '') + '">' + s.toHit + '%</span>';
    html += '</div>';
    return html;
  },
  spellTip(id, pl, game) {
    const s = DATA.spells[id];
    let html = '<h4><span class="realmdot" style="color:' + REALM_COLORS[s.realm] + '"></span>' + U.esc(s.name) + '</h4>';
    html += '<div class="muted">' + (s.lore ? 'Plans d\'un ouvrage des ' + DATA.races[s.params.race].name : REALM_NAMES[s.realm] + ' · ' + RARITY_NAMES[s.rarity] + ' · ' + SECTION_NAMES[s.section]) + '</div>';
    html += '<div style="margin:5px 0">' + U.esc(s.desc) + '</div>';
    if (s.lore) html += '<div class="dim">Un seul par empire, dans une cité où vivent des ' + DATA.races[s.params.race].name + ' · coût ' + DATA.buildings[s.params.building].cost + '</div>';
    const parts = [];
    if (s.overland && s.cost != null) parts.push('Carte : ' + (pl ? Magic.spellCost(game, pl, id, false) : s.cost) + ' mana');
    if (s.combat && s.combatCost != null) parts.push('Combat : ' + (pl ? Magic.spellCost(game, pl, id, true) : s.combatCost) + ' mana');
    const upk = pl ? Magic.spellUpkeep(game, pl, id) : s.upkeep;
    if (upk) parts.push('Entretien ' + upk + '/tour');
    if (s.research || id === 'spell_of_mastery') parts.push('Recherche ' + U.fmt(pl ? Magic.researchCost(pl, id) : s.research));
    html += '<div class="dim">' + parts.join(' · ') + '</div>';
    if (s.kind === 'summon' && s.params && s.params.unit && DATA.units[s.params.unit]) {
      const fake = { type: s.params.unit, ench: [], xp: 0, owner: UI.pid, dmg: 0, weapon: 0 };
      html += UI.statLine(Units.stats(game, fake), null, game);
    }
    return html;
  },
};
