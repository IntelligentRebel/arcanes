'use strict';
// Écran de combat tactique isométrique, animé, piloté par le modèle Battle.

const FIG_LAYOUT = {
  1: [[0, 0]], 2: [[-.22, -.05], [.22, .05]], 3: [[-.25, 0], [0, -.12], [.25, 0]], 4: [[-.25, -.1], [.25, -.1], [-.25, .12], [.25, .12]],
  5: [[-.3, -.1], [0, -.15], [.3, -.1], [-.15, .13], [.15, .13]], 6: [[-.3, -.12], [0, -.14], [.3, -.12], [-.3, .12], [0, .14], [.3, .12]],
  7: [[-.33, -.12], [-.1, -.15], [.13, -.15], [.35, -.1], [-.22, .12], [0, .15], [.22, .12]], 8: [[-.36, -.12], [-.12, -.16], [.12, -.16], [.36, -.12], [-.36, .1], [-.12, .15], [.12, .15], [.36, .1]],
};

const CombatView = {
  active: false, bt: null, cv: null, ctx: null, TW: 96, TH: 48, ox: 0, oy: 0,
  sel: null, hover: null, anims: [], floats: [], parts: [], resolve: null, auto: false, mode: null, busy: false, evIdx: 0, pos: {},

  run(game, bt, info) {
    // une attaque subie pendant le tour des sorciers rivaux : le voile d'attente ne doit pas recouvrir la bataille
    const veil = $('#busy');
    if (veil) veil.hidden = true;
    return new Promise(res => {
      const done = v => { if (veil && UI.busy) veil.hidden = false; res(v); };
      CombatView.bt = bt; CombatView.info = info; CombatView.resolve = done; CombatView.active = true;
      CombatView.auto = false; CombatView.mode = null; CombatView.sel = null; CombatView.reach = null; CombatView.hover = null; CombatView._fcKey = null; CombatView.anims = []; CombatView.floats = []; CombatView.parts = []; CombatView.vpos = {}; CombatView.evIdx = 0; CombatView.pos = {};
      CombatView.humanSide = game.players[bt.pids[ATT_SIDE]] && game.players[bt.pids[ATT_SIDE]].human ? ATT_SIDE : DEF_SIDE;
      // de quoi rejouer la bataille si la résolution automatique déplaît
      CombatView.snap = CombatView.snapshot(game, bt); CombatView.autoStart = false; CombatView.replayed = false;
      for (const b of bt.units) CombatView.pos[b.id] = { c: b.c, r: b.r, alpha: 1 };
      CombatView.initTowers(bt);
      CombatView.focus = null; CombatView.zoom = 1;   // chaque bataille commence au cadrage normal
      CombatView.build();
      CombatView.layout();
      CombatView.prerenderGround();
      CombatView.loop();
      // demander si le joueur veut combattre lui-même
      CombatView.intro().then(choice => {
        if (choice === 'auto' || window.AUTO_COMBAT) { CombatView.auto = true; CombatView.autoStart = choice === 'auto'; }
        CombatView.advance();
      });
    });
  },
  // tours de défense et tour du sorcier : positions pour les animations, et état affiché (en retard sur le moteur le temps des animations)
  initTowers(bt) {
    CombatView.tview = {};
    for (const t of bt.towers || []) { CombatView.pos[t.id] = CombatView.gateEdge(t) || { c: t.c, r: t.r, alpha: 1 }; CombatView.tview[t.id] = { hp: t.hp, fallen: t.dead }; }
  },
  // une porte se frappe sur sa face extérieure : coups, éclats et barre de vie s'affichent là, pas sur l'unité postée dans la porte
  // curseurs de combat : une épée quand un clic frappe (unité, porte, tour, muraille), une cible quand il tire
  CURSORS: {
    melee: 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M3 3l13.5 13.5" stroke="#1a1208" stroke-width="5" stroke-linecap="round"/><path d="M3 3l13.5 13.5" stroke="#f3ead2" stroke-width="2.6" stroke-linecap="round"/><path d="M14 19l5-5M17.5 17.5l5.5 5.5" stroke="#1a1208" stroke-width="5" stroke-linecap="round"/><path d="M14 19l5-5M17.5 17.5l5.5 5.5" stroke="#d6a84a" stroke-width="2.6" stroke-linecap="round"/></svg>') + '") 3 3, pointer',
    ranged: 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="9" fill="none" stroke="#1a1208" stroke-width="4.5"/><circle cx="14" cy="14" r="9" fill="none" stroke="#ffcf6a" stroke-width="2"/><path d="M14 1v8M14 19v8M1 14h8M19 14h8" stroke="#1a1208" stroke-width="4"/><path d="M14 2v6M14 20v6M2 14h6M20 14h6" stroke="#ffcf6a" stroke-width="1.8"/><circle cx="14" cy="14" r="1.8" fill="#ffcf6a"/></svg>') + '") 14 14, crosshair',
  },
  // ce que ferait un clic sur la case t avec l'unité choisie : 'melee', 'ranged', 'select', 'move' ou null (même logique que onClick)
  // ce que coûte la retraite, dit avant de la confirmer
  fleeText() {
    const bt = CombatView.bt, side = CombatView.humanSide;
    if (side === DEF_SIDE && bt.city) return 'La garnison abandonne la cité : toutes vos unités périront.';
    if (!bt.canEscape(side)) return 'Aucune case libre autour pour vous replier : toutes vos unités périront.';
    // la poursuite : pour chaque unité, qui la prend en chasse et son risque d'être rattrapée
    const plan = bt.fleePlan(side);
    const rows = [...plan].map(([b, e]) => '<li>' + U.esc(Units.label(b.u)) + ' : ' + (e.risk ? '<b class="' + (e.risk >= .6 ? 'danger' : e.risk >= .3 ? 'gold' : 'ok') + '">' + Math.round(e.risk * 100) + ' %</b> <span class="dim">(' + U.esc(Units.label(e.by.u)) + ')</span>'
      : '<b class="ok">hors d\'atteinte</b>' + (b.u.hero ? ' <span class="dim">(héros)</span>' : '')) + '</li>').join('');
    return (side === ATT_SIDE ? 'Vos troupes reculent sur leur case.' : 'Vos troupes se replient sur une case voisine, et l\'ennemi prend la leur.')
      + ' Chaque ennemi prend en chasse deux de vos unités au plus, celles qu\'il a le plus de chances de rattraper.<br>Risque d\'être rattrapé (et par qui) :<ul style="margin:4px 0 0 18px">' + rows + '</ul>';
  },
  // case d'où l'unité pourra frapper après s'être approchée : il lui faut encore du mouvement, et la frappe doit y être permise
  // (muraille, porte, volant hors d'atteinte : les mêmes règles que l'attaque elle-même)
  // contre une unité : la case d'où l'on frappe dans le dos, sinon de flanc, sinon la plus proche
  approachTile(sel, target, tower) {
    const bt = CombatView.bt; let best = null, bfl = -1;
    for (const n of bt.reachable(sel).values()) {
      if (n.cost >= sel.moves || Math.max(Math.abs(n.c - target.c), Math.abs(n.r - target.r)) !== 1) continue;
      const fl = tower ? 0 : bt.flankOf(sel, target, n.c, n.r);
      if (best && (fl < bfl || (fl === bfl && n.cost >= best.cost))) continue;
      const oc = sel.c, orr = sel.r, om = sel.moves; sel.c = n.c; sel.r = n.r; sel.moves = om - n.cost;
      let ok; try { ok = tower ? bt.canMeleeTower(sel, target) : bt.canMelee(sel, target); } finally { sel.c = oc; sel.r = orr; sel.moves = om; }
      if (ok) { best = n; bfl = fl; }
    }
    if (best) best.flank = bfl;
    return best;
  },
  clickIntent(t) {
    const bt = CombatView.bt, sel = CombatView.sel;
    if (!t || !bt || bt.over || bt.side !== CombatView.humanSide || CombatView.auto || CombatView.busy) return null;
    const u = bt.unitAt(t.c, t.r);
    if (u && u.side === CombatView.humanSide) return 'select';
    if (!sel || sel.dead) return null;
    const gate = bt.gateAt(t.c, t.r);
    const tw = !u ? bt.towerAt(t.c, t.r) || gate : u && u.side !== sel.side && gate && !bt.canMelee(sel, u) && !bt.canShoot(sel, u) && bt.canMeleeTower(sel, gate) ? gate : null;
    if (tw && tw.side !== sel.side) {
      if (bt.canMeleeTower(sel, tw)) return 'melee';
      if (bt.canShootTower(sel, tw)) return 'ranged';
      return CombatView.approachTile(sel, tw, true) ? 'melee' : null;
    }
    if (!u && bt.canBreach(sel, t.c, t.r)) return 'melee';
    if (u && u.side !== sel.side) {
      if (bt.stats(sel).ab.siegeOnly) return null;
      return CombatView.attackKind(sel, u);
    }
    return !u && CombatView.reach && CombatView.reach.has(t.c + ',' + t.r) ? 'move' : null;
  },
  // comment attaquer u : 'melee' (au contact, ou en s'approchant), 'ranged' ou null. Par défaut le tir quand il est possible
  // (au contact, on ne tire pas) ; Ctrl enfoncé prend l'autre façon quand elle existe : s'approcher et frapper au lieu de tirer
  attackKind(sel, u) {
    const bt = CombatView.bt;
    if (bt.canMelee(sel, u)) return 'melee';
    const canS = bt.canShoot(sel, u), walk = () => !bt.outOfReach(sel, u) && !!CombatView.approachTile(sel, u);
    if (canS) return CombatView.alt && walk() ? 'melee' : 'ranged';
    return walk() ? 'melee' : null;
  },
  cursorFor(t) {
    if (CombatView.mode) return 'crosshair';
    const i = CombatView.clickIntent(t);
    return i === 'melee' || i === 'ranged' ? CombatView.CURSORS[i] : i === 'select' ? 'pointer' : '';
  },
  gateEdge(t) {
    if (t.kind !== 'gate') return null;
    const c = t.c + (t.c === CITY_MAX ? .5 : t.c === CITY_MIN ? -.5 : 0), r = t.r + (t.r === CITY_MAX ? .5 : t.r === CITY_MIN ? -.5 : 0);
    return { c, r, alpha: 1 };
  },
  intro() {
    const bt = CombatView.bt, game = App.game;
    const att = bt.player(ATT_SIDE), def = bt.player(DEF_SIDE);
    const site = CombatView.info.site, city = CombatView.info.city;
    const title = site ? Game.siteName(site) : city ? 'Bataille de ' + city.name : 'Bataille en campagne';
    const F = bt.forces();
    const nm = p => U.cap(Players.nameFor(game, App.pid, p.id));
    const tw = (bt.towers || []).filter(t => !t.dead), stones = tw.filter(t => t.kind === 'stone').length;
    const extra = (stones ? ', ' + stones + ' tours de défense' : '') + (tw.some(t => t.kind === 'spire') ? ', la tour du sorcier' : '');
    const desc = (att ? U.esc(nm(att)) : 'Pillards') + ' (' + U.n(bt.alive(ATT_SIDE).length, 'unité') + ') contre ' + (def ? U.esc(nm(def)) : site ? 'les gardiens' : 'les pillards') + ' (' + U.n(bt.alive(DEF_SIDE).length, 'unité') + extra + ').';
    const ratio = F[CombatView.humanSide] / Math.max(1, F[1 - CombatView.humanSide]);
    const est = ratio > 3 ? 'écrasante' : ratio > 1.5 ? 'favorable' : ratio > .8 ? 'incertaine' : ratio > .4 ? 'défavorable' : 'désespérée';
    // la prévision (une douzaine de batailles simulées) se calcule une fois la fenêtre affichée ;
    // une bataille gagnée d'avance se résout alors d'un clic : la résolution automatique passe en premier
    const pr = UI.choice(title, '<p>' + desc + '</p><p>Situation <b>' + est + '</b>.</p><p id="intro-fc" class="dim">Résolution automatique : estimation…</p>', [{ label: 'Résolution automatique', value: 'auto' }, { label: 'Commander la bataille', value: 'manual', primary: true }], { noClose: true });
    setTimeout(() => {
      const el = document.getElementById('intro-fc'); if (!el) return;
      const f = CombatView.introForecast(12);
      if (!f) { el.remove(); return; }
      el.className = ''; el.innerHTML = 'Résolution automatique : <b class="' + (f.win >= .65 ? 'ok' : f.win >= .4 ? 'gold' : 'danger') + '">' + Game.forecastLabel(f) + '</b>.';
      if (f.win >= 0.95) { const m = el.closest('.modal'); if (m) for (const b of m.querySelectorAll('footer button')) b.classList.toggle('primary', b.textContent === 'Résolution automatique'); }
    }, 60);
    return pr;
  },
  // la bataille rejouée n fois en résolution automatique, sur des copies : chances du camp du joueur et ses pertes
  introForecast(n) {
    const bt = CombatView.bt, game = App.game, side = CombatView.humanSide;
    try {
      game.simId = game.simId || 0;
      const clone = u => Object.assign(JSON.parse(JSON.stringify(u)), { id: -(++game.simId) });
      const mine = bt.units.filter(b => b.side === side && !b.dead && !b.temp).map(b => b.u);
      let seed = (game.turn * 7919 + bt.x * 131 + bt.y * 17 + bt.plane) >>> 0;
      const rng = new RNG(seed);
      let wins = 0, lost = 0; const losses = {};
      for (let i = 0; i < n; i++) {
        const A = bt.units.filter(b => b.side === ATT_SIDE && !b.dead && !b.temp).map(b => clone(b.u)), D = bt.units.filter(b => b.side === DEF_SIDE && !b.dead && !b.temp).map(b => clone(b.u));
        const sim = new Battle(game, { attackers: A, defenders: D, attackerPid: bt.pids[ATT_SIDE], defenderPid: bt.pids[DEF_SIDE], plane: bt.plane, x: bt.x, y: bt.y, city: bt.city, site: bt.site, sim: true, rng });
        CombatAI.autoResolve(sim);
        for (const bu of sim.units) if (bu.temp) delete game.units[bu.u.id];
        if (sim.winner === side) wins++;
        const M = side === ATT_SIDE ? A : D;
        M.forEach(cu => { const bu = sim.units.find(o => o.u === cu); if (!bu || bu.dead) { lost++; losses[cu.type] = (losses[cu.type] || 0) + 1; } });
      }
      return { win: wins / n, lossAvg: lost / n, n, losses, mine: mine.length };
    } catch (e) { console.warn('prévision de bataille', e); return null; }
  },
  build() {
    const root = $('#combat-root'); root.hidden = false; root.innerHTML = '';
    const cv = h('canvas'); root.append(cv);
    CombatView.cv = cv; CombatView.ctx = cv.getContext('2d');
    const bt = CombatView.bt;
    const t = h('div', { class: 'card ctitle' }, h('h3', { id: 'c-title' }), h('div', { class: 'muted', id: 'c-sub' }));
    root.append(t,
      h('div', { class: 'card cside l', id: 'c-left' }),
      h('div', { class: 'crcol' }, h('div', { class: 'card', id: 'c-spells', style: 'display:none' }), h('div', { class: 'card', id: 'c-right', style: 'display:none' })),
      h('div', { class: 'card clog', id: 'c-log' }),
      h('div', { class: 'card cbar', id: 'c-bar' }));
    cv.addEventListener('mousemove', e => { if (!CombatView.dragMove(e)) CombatView.onMove(e); });
    // clic : à la relâche, sauf si la souris a glissé (le plateau se déplace alors) ; clic droit : aussitôt
    cv.addEventListener('mousedown', e => { if (e.button === 2) return CombatView.onClick(e); CombatView.drag = { x: e.clientX, y: e.clientY, ev: e, moved: false, focus: CombatView.focusNow() }; });
    window.addEventListener('mouseup', CombatView.mouseUp);
    cv.addEventListener('wheel', e => CombatView.onWheel(e), { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    CombatView.keyH = e => { if (e.key === 'Control') CombatView.setAlt(true); CombatView.onKey(e); };
    CombatView.keyUpH = e => { if (e.key === 'Control') CombatView.setAlt(false); };
    window.addEventListener('keyup', CombatView.keyUpH);
    window.addEventListener('keydown', CombatView.keyH);
    CombatView.renderBar();
  },
  layout() {
    const cv = CombatView.cv, dpr = window.devicePixelRatio || 1;
    // redimensionner un canevas l'efface : seulement quand la fenêtre change, pas à chaque déplacement de la vue (sinon un éclair noir)
    const cw = Math.round(innerWidth * dpr), ch = Math.round(innerHeight * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; }
    CombatView.dpr = dpr;
    const TW = Math.floor(Math.min((innerWidth - 120) / (CW + CH) * 2, (innerHeight - 160) / (CW + CH) * 4) / 2) * 2;
    CombatView.baseTW = U.clamp(TW, 56, 132);
    // zoom (molette) et cadrage (glisser) : le point de la grille au centre de l'écran
    CombatView.TW = CombatView.baseTW * (CombatView.zoom || 1); CombatView.TH = CombatView.TW / 2;
    const f = CombatView.focus;
    const oy0 = (innerHeight - (CW + CH) * CombatView.TH / 2) / 2 + CombatView.TH / 2 + 10;
    if (f) {
      CombatView.ox = innerWidth / 2 - (f.c - f.r) * CombatView.TW / 2; CombatView.oy = innerHeight / 2 - (f.c + f.r) * CombatView.TH / 2;
      // le cadrage ne montre jamais le vide au-delà du plateau : sur un axe où il tient dans l'écran, il reste centré
      const W = innerWidth, H = innerHeight, TW = CombatView.TW, TH = CombatView.TH;
      const left = CH * TW / 2 + 20, right = CW * TW / 2 + 20, top = TH * 2.5, bottom = (CW + CH - 1) * TH / 2 + TH;
      CombatView.ox = left + right <= W ? W / 2 + (left - right) / 2 : U.clamp(CombatView.ox, W - right, left);
      CombatView.oy = top + bottom <= H ? oy0 : U.clamp(CombatView.oy, H - bottom, top);
    }
    else { CombatView.ox = innerWidth / 2; CombatView.oy = oy0; }
  },
  // point de la grille (fractionnaire) sous un point de l'écran
  gridAt(sx, sy) { const dx = (sx - CombatView.ox) / (CombatView.TW / 2), dy = (sy - CombatView.oy) / (CombatView.TH / 2); return { c: (dx + dy) / 2, r: (dy - dx) / 2 }; },
  focusNow() { return CombatView.gridAt(innerWidth / 2, innerHeight / 2); },
  setFocus(f) { CombatView.focus = { c: U.clamp(f.c, -1, CW), r: U.clamp(f.r, -1, CH) }; CombatView.layout(); },
  // cadre l'unité au centre de l'écran, en glissant (C, et à chaque passage d'une unité à la suivante)
  centerOn(b) {
    if (!b || !CombatView.active) return;
    const p = CombatView.pos[b.id] || b, from = CombatView.focusNow(), to = { c: p.c, r: p.r }, t0 = performance.now(), dur = 260;
    const id = CombatView._panId = (CombatView._panId || 0) + 1;
    const step = () => {
      if (id !== CombatView._panId || !CombatView.active) return;
      const t = Math.min(1, (performance.now() - t0) / dur), e = t * (2 - t);
      CombatView.setFocus({ c: from.c + (to.c - from.c) * e, r: from.r + (to.r - from.r) * e });
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  },
  onWheel(e) {
    e.preventDefault();
    const z0 = CombatView.zoom || 1, z = U.clamp(z0 * Math.pow(1.0018, -e.deltaY), .6, 2.6);
    if (Math.abs(z - z0) < 1e-4) return;
    // le point sous le curseur reste sous le curseur
    const g = CombatView.gridAt(e.clientX, e.clientY);
    CombatView.zoom = z;
    const TW = CombatView.baseTW * z, TH = TW / 2;
    const ox = e.clientX - (g.c - g.r) * TW / 2, oy = e.clientY - (g.c + g.r) * TH / 2;
    const dx = (innerWidth / 2 - ox) / (TW / 2), dy = (innerHeight / 2 - oy) / (TH / 2);
    CombatView.setFocus({ c: (dx + dy) / 2, r: (dy - dx) / 2 });
  },
  dragMove(e) {
    const d = CombatView.drag; if (!d || !(e.buttons & 1)) return false;
    const mx = e.clientX - d.x, my = e.clientY - d.y;
    if (!d.moved && Math.hypot(mx, my) < 6) return false;
    d.moved = true;
    const dc = (mx / (CombatView.TW / 2) + my / (CombatView.TH / 2)) / 2, dr = (my / (CombatView.TH / 2) - mx / (CombatView.TW / 2)) / 2;
    CombatView.setFocus({ c: d.focus.c - dc, r: d.focus.r - dr });
    CombatView.cv.style.cursor = 'grabbing';
    return true;
  },
  mouseUp(e) {
    const d = CombatView.drag; CombatView.drag = null;
    if (!d || !CombatView.active) return;
    if (d.moved) { CombatView.cv.style.cursor = ''; return; }
    if (e.target === CombatView.cv) CombatView.onClick(d.ev);
  },
  iso(c, r) { return { x: CombatView.ox + (c - r) * CombatView.TW / 2, y: CombatView.oy + (c + r) * CombatView.TH / 2 }; },
  // hauteur d'une case de colline à l'écran
  lift(c, r) {
    const bt = CombatView.bt; if (!bt) return 0;
    return bt.hill && bt.hill(Math.round(c), Math.round(r)) ? CombatView.TH * .24 : 0;
  },
  // sur une muraille, l'unité se tient au sommet, contre le parapet extérieur : décalée vers le dehors, plus haut, un peu plus petite
  // (l'éloignement du chemin de ronde), ses figurines alignées le long du mur
  RAMP: { out: .42, lift: .15, scale: .75 },
  standAt(c, r) {
    const bt = CombatView.bt, R = CombatView.RAMP;
    if (!bt || !bt.onRampart || !bt.onRampart(c, r)) return { dc: 0, dr: 0, L: CombatView.lift(c, r), s: 1, w: 0, ax: null };
    const dc = c === CITY_MAX ? R.out : c === CITY_MIN ? -R.out : 0, dr = r === CITY_MAX ? R.out : r === CITY_MIN ? -R.out : 0;
    // axe du mur : le long des r pour un mur de colonne, des c pour un mur de rangée ; rien dans les angles
    const ax = dc && dr ? null : dc ? [0, 1] : [1, 0];
    return { dc, dr, L: CombatView.TW * R.lift, s: R.scale, w: 1, ax };
  },
  // point d'ancrage à l'écran d'une unité en (c, r), fractionnaires pendant un déplacement : mélange des cases voisines
  stand(c, r) {
    const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
    let dc = 0, dr = 0, L = 0, s = 0, w = 0, ax = null, best = 0;
    for (const [q, t, k] of [[c0, r0, (1 - fc) * (1 - fr)], [c0 + 1, r0, fc * (1 - fr)], [c0, r0 + 1, (1 - fc) * fr], [c0 + 1, r0 + 1, fc * fr]]) {
      if (k < 1e-6) continue;
      const o = CombatView.standAt(q, t);
      dc += o.dc * k; dr += o.dr * k; L += o.L * k; s += o.s * k; w += o.w * k;
      if (o.w && k > best) { best = k; ax = o.ax; }
    }
    const P = CombatView.iso(c + dc, r + dr); P.y -= L; P.s = s; P.w = w; P.ax = ax;
    return P;
  },
  pick(sx, sy) {
    const bt = CombatView.bt;
    const sel = CombatView.sel;
    if (bt && bt.hasWalls && sel && !sel.dead && sel.side !== DEF_SIDE) for (const g of bt.towers || []) {
      if (g.kind !== 'gate' || !bt.standing(g)) continue;
      const E = CombatView.gateEdge(g), Q = CombatView.iso(E.c, E.r), TW = CombatView.TW;
      if (Math.abs(sx - Q.x) < TW * .24 && sy > Q.y - TW * .48 && sy < Q.y + CombatView.TH * .12) return { c: g.c, r: g.r };
    }
    if (bt && bt.hasWalls) for (const b of bt.units) {
      if (b.dead || !bt.onRampart(b.c, b.r)) continue;
      const P = CombatView.stand(b.c, b.r), TW = CombatView.TW;
      if (Math.abs(sx - P.x) < TW * .3 && sy > P.y - TW * .5 && sy < P.y + CombatView.TH * .2) return { c: b.c, r: b.r };
    }
    const dx = (sx - CombatView.ox) / (CombatView.TW / 2), dy = (sy - CombatView.oy) / (CombatView.TH / 2);
    const c = Math.round((dx + dy) / 2), r = Math.round((dy - dx) / 2);
    // une colline surélevée cache le bas de la case derrière elle
    const TW = CombatView.TW, TH = CombatView.TH;
    for (const [hc, hr] of [[c + 1, r + 1], [c + 1, r], [c, r + 1], [c, r]]) {
      const L = CombatView.lift(hc, hr); if (!L || hc < 0 || hr < 0 || hc >= CW || hr >= CH) continue;
      const P = CombatView.iso(hc, hr);
      if (Math.abs(sx - P.x) / (TW / 2) + Math.abs(sy - (P.y - L)) / (TH / 2) <= 1) return { c: hc, r: hr };
    }
    if (c < 0 || r < 0 || c >= CW || r >= CH) return null;
    return { c, r };
  },
  prerenderGround() {
    const bt = CombatView.bt, game = App.game;
    const t = World.terr(game.world, bt.plane, bt.x, bt.y);
    const kind = t === T.DESERT ? 'desert' : t === T.TUNDRA ? 'tundra' : t === T.SWAMP ? 'swamp' : (t === T.MOUNTAIN || t === T.HILLS || t === T.VOLCANO || t === T.CNODE) ? 'dirt' : 'grass';
    CombatView.groundKind = kind;
    const hdTex = Tex.get({ grass: 'grass', desert: 'desert', tundra: 'tundra', swamp: 'swamp', dirt: 'rock' }[kind], bt.plane);
    if (hdTex) {
      // une seule texture HD, échantillonnée en continu sous tout le plateau
      const pat = CombatView.ctx.createPattern(hdTex, 'repeat');
      CombatView.patterns = [pat, pat, pat, pat]; CombatView.patScale = 1 / 2.4;
    }
  },

  // ---------- boucle ----------
  loop(id) {
    if (id == null) id = CombatView.loopId = (CombatView.loopId || 0) + 1;
    if (!CombatView.active || id !== CombatView.loopId) return;
    CombatView.draw();
    requestAnimationFrame(() => CombatView.loop(id));
  },
  draw() {
    CombatView.syncPower();
    const ctx = CombatView.ctx, bt = CombatView.bt, game = App.game; const dpr = CombatView.dpr;
    const TW = CombatView.TW, TH = CombatView.TH, now = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    const sky = ctx.createLinearGradient(0, 0, 0, innerHeight);
    sky.addColorStop(0, bt.plane ? '#140c1e' : '#0b1018'); sky.addColorStop(1, '#05070a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, innerWidth, innerHeight);
    // épaisseur du plateau
    {
      const L = CombatView.iso(0, CH - 1), B = CombatView.iso(CW - 1, CH - 1), R = CombatView.iso(CW - 1, 0);
      const lx = L.x - TW / 2, ly = L.y, bx = B.x, by = B.y + TH / 2, rx = R.x + TW / 2, ry = R.y, D = TH * .55;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(bx, by + D + 6, (rx - lx) * .42, TH * 1.2, 0, 0, 7); ctx.fill();
      const mir = CombatView.bt.plane === 1 && Sprites.hasMirror();   // le Miroir : tranche d'ardoise violette, liseré sarcelle
      const soil = mir ? (CombatView.groundKind === 'desert' ? ['#7a6a92', '#5e5274'] : ['#2e2846', '#221d36']) : CombatView.groundKind === 'desert' ? ['#8a6a3c', '#6c5230'] : CombatView.groundKind === 'tundra' ? ['#7d8590', '#5e656e'] : ['#4a3420', '#36251a'];
      ctx.fillStyle = soil[0]; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(bx, by); ctx.lineTo(bx, by + D); ctx.lineTo(lx, ly + D); ctx.closePath(); ctx.fill();
      ctx.fillStyle = soil[1]; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(rx, ry); ctx.lineTo(rx, ry + D); ctx.lineTo(bx, by + D); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) { const o = D * i / 3; ctx.beginPath(); ctx.moveTo(lx, ly + o); ctx.lineTo(bx, by + o); ctx.lineTo(rx, ry + o); ctx.stroke(); }
      ctx.fillStyle = mir ? 'rgba(46,120,124,.9)' : 'rgba(70,120,40,.9)'; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(bx, by); ctx.lineTo(rx, ry); ctx.lineTo(rx, ry + 3); ctx.lineTo(bx, by + 3); ctx.lineTo(lx, ly + 3); ctx.closePath();
      if (CombatView.groundKind === 'grass' || CombatView.groundKind === 'swamp') ctx.fill();
    }
    // sol
    // ciblage d'un sort : les cibles valables en or, à la place des cases atteignables
    const tgt = CombatView.mode ? CombatView.targetTiles() : null;
    const reach = tgt ? new Map() : CombatView.reach || new Map();
    // sort de zone : toutes les cases qu'il touchera autour de la case survolée
    const zm = CombatView.mode && CombatView.hover && CombatView.ZONES[CombatView.mode.id], zone = zm ? CombatView.zoneOf(CombatView.mode.id, CombatView.hover.c, CombatView.hover.r) : null;
    const zfill = zm ? zm.fill + (.34 + .1 * Math.sin(now / 220)).toFixed(3) + ')' : null;
    for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) {
      const p = CombatView.iso(c, r);
      ctx.save();
      ctx.beginPath(); ctx.moveTo(p.x, p.y - TH / 2); ctx.lineTo(p.x + TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2); ctx.lineTo(p.x - TW / 2, p.y); ctx.closePath();
      if (CombatView.patScale) { ctx.translate(CombatView.ox, CombatView.oy); ctx.scale(TW / 110, TW / 110); ctx.imageSmoothingEnabled = true; }
      else { ctx.translate(p.x, p.y); ctx.scale(TW / 64, TW / 64); }
      ctx.fillStyle = CombatView.patterns[Tiles.hash(c, r, 9) % 4]; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(p.x, p.y - TH / 2); ctx.lineTo(p.x + TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2); ctx.lineTo(p.x - TW / 2, p.y); ctx.closePath();
      if (bt.plane) { ctx.fillStyle = 'rgba(40,10,70,.18)'; ctx.fill(); }
      if (bt.inCity(c, r)) { ctx.fillStyle = 'rgba(120,100,80,.28)'; ctx.fill(); }
      if (bt.mud[c + ',' + r]) { ctx.fillStyle = 'rgba(70,50,20,.6)'; ctx.fill(); }
      if (bt.inRiver && bt.inRiver(c, r)) CombatView.drawWater(p, c, r, now);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - TH / 2); ctx.lineTo(p.x + TW / 2, p.y); ctx.lineTo(p.x, p.y + TH / 2); ctx.lineTo(p.x - TW / 2, p.y); ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.stroke();
      const k = c + ',' + r;
      if (reach.has(k)) { ctx.fillStyle = 'rgba(110,220,120,.20)'; ctx.fill(); ctx.strokeStyle = 'rgba(140,240,150,.45)'; ctx.stroke(); }
      if (tgt && tgt.has(k)) { ctx.fillStyle = 'rgba(255,200,60,' + (.22 + .12 * Math.sin(now / 220)).toFixed(3) + ')'; ctx.fill(); ctx.strokeStyle = 'rgba(255,214,110,.85)'; ctx.lineWidth = 2; ctx.stroke(); }
      if (zone && zone.has(k)) { ctx.fillStyle = zfill; ctx.fill(); }
      if (CombatView.hover && CombatView.hover.c === c && CombatView.hover.r === r) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    if (zone) CombatView.drawZoneEdge(zone, zm.edge, 0);
    // collines surélevées, de l'arrière vers l'avant
    if (bt.hills) {
      const hs = Object.keys(bt.hills).map(k => k.split(',').map(Number)).sort((a, b) => a[0] + a[1] - b[0] - b[1]);
      for (const [c, r] of hs) { const k = c + ',' + r; CombatView.drawHill(c, r, reach.has(k), CombatView.hover && CombatView.hover.c === c && CombatView.hover.r === r, zone && zone.has(k) ? zfill : bt.mud[k] ? 'rgba(70,50,20,.6)' : null); }
      if (zone && hs.some(([c, r]) => zone.has(c + ',' + r))) CombatView.drawZoneEdge(zone, zm.edge, 1);
    }
    // objets triés par profondeur
    const items = [];
    for (const k in bt.props) { const [c, r] = k.split(',').map(Number); items.push({ d: c + r, f: () => CombatView.drawProp(bt.props[k], c, r, bt.fire && bt.fire[k]) }); }
    for (const k in bt.fire || {}) { const [c, r] = k.split(',').map(Number); items.push({ d: c + r + 0.8, f: () => CombatView.drawFlames(c, r, now) }); }
    if (bt.buildings) for (const b of bt.buildings) items.push({ d: b.c + b.r, f: () => CombatView.drawHouse(b) });
    if (bt.hasWalls || bt.wallOfFire || bt.wallOfDarkness) for (const k in bt.walls) { const [c, r] = k.split(',').map(Number); items.push({ d: c + r + 0.3, f: () => CombatView.drawWall(c, r, bt.walls[k], 'back') }, { d: c + r + 0.6, f: () => CombatView.drawWall(c, r, bt.walls[k], 'front') }); }
    if (bt.hasWalls && Sprites.hasHD('cwall:tower')) {
      // tours aux quatre angles de l'enceinte
      const corners = [[CITY_MIN, CITY_MIN, 0, -TH / 2], [CITY_MAX, CITY_MIN, TW / 2, 0], [CITY_MAX, CITY_MAX, 0, TH / 2], [CITY_MIN, CITY_MAX, -TW / 2, 0]]
        .filter(([c, r]) => !(bt.towers || []).some(t => t.kind === 'stone' && t.c === c && t.r === r));
      for (const [c, r, ox, oy] of corners) items.push({ d: c + r + (oy > 0 ? 1.2 : oy < 0 ? 0.1 : 0.7), f: () => { const P = CombatView.iso(c, r); CombatView.drawTrim(CombatView.wallKey('tower'), P.x + ox, P.y + oy + TH * .12, TW * .34); } });
    }
    for (const t of bt.towers || []) items.push({ d: t.c + t.r + 0.75, f: () => CombatView.drawTower(t, now) });
    for (const b of bt.units) {
      const p = CombatView.pos[b.id]; if (!p) continue;
      if (b.dead && p.alpha <= 0) continue;
      items.push({ d: p.c + p.r + (bt.onRampart(Math.round(p.c), Math.round(p.r)) ? 0.55 : 0.5), f: () => CombatView.drawUnit(b, p) });
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) it.f();
    // ciblage d'un sort : chaque cible valable est cerclée d'or, pulsé, avec une flèche au-dessus
    if (CombatView.mode) {
      const pulse = .5 + .5 * Math.sin(now / 170);
      for (const o of CombatView.targetObjects()) {
        const p = CombatView.pos[o.id] || { c: o.c, r: o.r };
        const P = o.tower ? CombatView.iso(p.c, p.r) : CombatView.stand(p.c, p.r);
        ctx.save();
        ctx.shadowColor = 'rgba(255,210,90,.95)'; ctx.shadowBlur = 10 + 8 * pulse;
        ctx.strokeStyle = 'rgba(255,214,110,' + (.75 + .25 * pulse).toFixed(3) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(P.x, P.y, TW * (.4 + .05 * pulse), TH * (.4 + .05 * pulse), 0, 0, 7); ctx.stroke();
        ctx.shadowBlur = 0;
        const ay = P.y - TW * (o.kind === 'spire' ? 1.25 : o.tower ? .75 : .9) - 6 * pulse;
        ctx.fillStyle = '#ffd66e'; ctx.strokeStyle = 'rgba(60,40,0,.85)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(P.x - 9, ay - 11); ctx.lineTo(P.x + 9, ay - 11); ctx.lineTo(P.x, ay); ctx.closePath(); ctx.fill(); ctx.stroke();
        // la cible survolée : ses chances, au-dessus de la flèche
        const hv = CombatView.hover;
        if (hv && !o.tower && hv.c === o.c && hv.r === o.r) {
          // les dégâts se prévoient par tirages simulés : une fois par cible et par état de la bataille, pas à chaque image
          const fk = [CombatView.mode.id, o.id, bt.hp(o), bt.round, bt.log.length, CombatView.mode.extra || 0].join(':');
          if (!CombatView._spfc || CombatView._spfc.key !== fk) CombatView._spfc = { key: fk, od: CombatSpells.odds(bt, CombatView.humanSide, CombatView.mode.id, o, CombatView.mode.extra || 0) };
          const od = CombatView._spfc.od;
          if (od) {
            const many = od.perFigure && od.n > 1, ch = many ? od.p * od.pass : od.chance;
            const dm = od.dmg != null ? od.dmg * od.pass : null;
            const txt = od.immune ? 'sans effet' : od.drain != null ? '≈ ' + String(Math.round(od.drain * 10) / 10).replace('.', ',') + ' PV' : dm != null ? '≈ ' + String(Math.round(dm * 10) / 10).replace('.', ',') + ' dégât' + (dm >= 2 ? 's' : '') : Math.round(ch * 100) + ' %' + (many ? ' par figurine' : '');
            ctx.font = 'bold ' + Math.max(13, Math.round(TW * .2)) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,14,4,.95)'; ctx.strokeText(txt, P.x, ay - 15);
            const z = dm != null ? 1 - (1 - od.zero) * od.pass : null;   // part des lancers sans effet, comme la bulle des tireurs
            ctx.fillStyle = od.immune ? '#ff9b8f' : z != null ? (z >= .6 ? '#ff9b8f' : z >= .3 ? '#ffd66e' : '#9ef0a8') : ch >= .6 || od.drain != null ? '#9ef0a8' : ch >= .3 ? '#ffd66e' : '#ff9b8f'; ctx.fillText(txt, P.x, ay - 15);
          }
        }
        ctx.restore();
      }
    }
    if (zone) {
      const me = CombatView.humanSide, hit = CombatView.zoneUnits(CombatView.mode.id, zone), nf = hit.filter(b => b.side !== me).length, na = hit.length - nf;
      for (const b of hit) { const p = CombatView.pos[b.id]; if (!p) continue; const P = CombatView.stand(p.c, p.r); ctx.save(); ctx.strokeStyle = b.side === me ? 'rgba(255,150,120,.9)' : zm.edge; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(P.x, P.y, TW * .38, TH * .38, 0, 0, 7); ctx.stroke(); ctx.restore(); }
      let top = null; for (const k of zone) { const [c, r] = k.split(',').map(Number); if (!top || c + r < top[0] + top[1]) top = [c, r]; }
      const P = CombatView.iso(top[0], top[1]), sp = DATA.spells[CombatView.mode.id];
      const txt = (sp ? sp.name : '') + ' : ' + (nf ? U.n(nf, 'ennemi', 'ennemis') : 'aucun ennemi') + (zm.reach ? ' à portée ce round' : '') + (na ? ', ' + U.n(na, 'des vôtres', 'des vôtres') : '');
      ctx.save(); ctx.font = 'bold ' + Math.max(13, Math.round(TW * .19)) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,14,4,.95)'; ctx.strokeText(txt, P.x, P.y - TH / 2 - TW * .3);
      ctx.fillStyle = nf ? '#ffd66e' : '#d8d0c0'; ctx.fillText(txt, P.x, P.y - TH / 2 - TW * .3); ctx.restore();
    }
    // survol d'un sort en cours : ses unités touchées, cerclées de vert (il les sert) ou de rouge (il leur nuit)
    const hr = CombatView.hlRow;
    if (hr && hr.isConnected && hr.matches(':hover') && hr._spell) {
      const stamp = bt.round + ':' + bt.log.length + ':' + CombatView.hlKey;
      if (!CombatView.hlCache || CombatView.hlCache.stamp !== stamp) CombatView.hlCache = { stamp, hits: CombatView.spellHits(hr._spell) };
      const pulse = .5 + .5 * Math.sin(now / 200);
      for (const { b, good } of CombatView.hlCache.hits) {
        const p = CombatView.pos[b.id]; if (!p || b.dead) continue;
        const P = CombatView.stand(p.c, p.r);
        ctx.save();
        ctx.shadowColor = good ? 'rgba(90,230,120,.95)' : 'rgba(255,80,70,.95)'; ctx.shadowBlur = 8 + 6 * pulse;
        ctx.strokeStyle = good ? 'rgba(120,240,140,' + (.7 + .3 * pulse).toFixed(3) + ')' : 'rgba(255,110,95,' + (.7 + .3 * pulse).toFixed(3) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(P.x, P.y, TW * (.42 + .04 * pulse), TH * (.42 + .04 * pulse), 0, 0, 7); ctx.stroke();
        ctx.shadowBlur = 0; ctx.fillStyle = good ? 'rgba(110,235,130,.16)' : 'rgba(255,90,80,.16)'; ctx.fill();
        ctx.restore();
      }
    }
    // cercles des unités postées sur la muraille, que le parapet aurait masqués
    if (bt.hasWalls) for (const b of bt.units) {
      if (b.dead || !bt.onRampart(b.c, b.r)) continue;
      const p = CombatView.pos[b.id]; if (!p || Math.round(p.c) !== b.c || Math.round(p.r) !== b.r) continue;
      const P = CombatView.stand(p.c, p.r);
      if (CombatView.sel === b && !CombatView.mode) { ctx.strokeStyle = 'rgba(255,230,140,.95)'; ctx.lineWidth = 2.5; }
      else if (b.side === bt.side && b.side === CombatView.humanSide && b.moves > 0) { ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; }
      else continue;
      ctx.beginPath(); ctx.ellipse(P.x, P.y, TW * .42, TH * .3, 0, 0, 7); ctx.stroke();
    }
    // cibles possibles
    const sel = CombatView.sel;
    if (sel && !sel.dead && bt.side === CombatView.humanSide && !CombatView.busy) {
      for (const o of bt.alive(1 - sel.side)) {
        const can = bt.canMelee(sel, o) ? 'melee' : bt.canShoot(sel, o) ? 'ranged' : null;
        if (!can) continue;
        const p = CombatView.stand(o.c, o.r);
        ctx.strokeStyle = can === 'melee' ? 'rgba(255,90,80,.9)' : 'rgba(255,170,60,.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, TW * .34, TH * .34, 0, 0, 7); ctx.stroke();
      }
      for (const t of bt.enemyTowers(sel.side)) {
        const can = bt.canMeleeTower(sel, t) ? 'melee' : bt.canShootTower(sel, t) ? 'ranged' : null;
        if (!can) continue;
        const E = CombatView.gateEdge(t), p = E ? CombatView.iso(E.c, E.r) : CombatView.iso(t.c, t.r);
        ctx.strokeStyle = can === 'melee' ? 'rgba(255,90,80,.9)' : 'rgba(255,170,60,.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, TW * .4, TH * .4, 0, 0, 7); ctx.stroke();
      }
    }
    // effets
    CombatView.anims = CombatView.anims.filter(a => now - a.t0 < a.dur);
    for (const a of CombatView.anims) a.draw(ctx, (now - a.t0) / a.dur);
    // vortex magiques
    for (const v of bt.vortices || []) {
      const vp = CombatView.vpos[v.id] || (CombatView.vpos[v.id] = { c: v.c, r: v.r });
      const P = CombatView.iso(vp.c, vp.r), rot = now / 180;
      ctx.save(); ctx.translate(P.x, P.y - TH * .35); ctx.scale(1, .55);
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = ['rgba(255,110,40,.85)', 'rgba(200,80,255,.8)', 'rgba(255,200,90,.7)', 'rgba(140,60,220,.7)'][i]; ctx.lineWidth = 3 - i * .5;
        ctx.beginPath(); ctx.arc(0, 0, TW * (.12 + i * .07), rot * (1 + i * .3) + i, rot * (1 + i * .3) + i + 4.2); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(160,80,255,.25)'; ctx.beginPath(); ctx.ellipse(P.x, P.y, TW * .32, TH * .3, 0, 0, 7); ctx.fill();
    }
    CombatView.drawParts(ctx, now);
    CombatView.floats = CombatView.floats.filter(f => now - f.t0 < 1100);
    for (const f of CombatView.floats) {
      const t = (now - f.t0) / 1100; const p = CombatView.stand(f.c, f.r);
      ctx.globalAlpha = 1 - t * t; ctx.font = 'bold ' + Math.round(TW * .2) + 'px system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(f.text, p.x + 1, p.y - TH * .9 - t * 30 + 1);
      ctx.fillStyle = f.color; ctx.fillText(f.text, p.x, p.y - TH * .9 - t * 30); ctx.globalAlpha = 1;
    }
    CombatView.drawShotForecast(ctx);
    CombatView.drawMeleeForecast(ctx);
  },
  // en visant un ennemi au corps à corps : dégâts attendus de part et d'autre, et la case d'où l'on frappera
  drawMeleeForecast(ctx) {
    const bt = CombatView.bt, a = CombatView.sel, hv = CombatView.hover;
    if (!a || !hv || CombatView.mode || CombatView.busy || bt.over || a.side !== CombatView.humanSide || bt.side !== a.side) return;
    const d = bt.unitAt(hv.c, hv.r);
    if (!d || d.side === a.side || bt.stats(a).ab.siegeOnly || !(bt.stats(a).melee > 0 || bt.stats(a).breath || bt.stats(a).thrown)) return;
    let at = null;
    if (!bt.canMelee(a, d)) { if (bt.outOfReach(a, d) || CombatView.attackKind(a, d) !== 'melee') return; at = CombatView.approachTile(a, d); if (!at) return; }
    const key = [a.id, d.id, a.c, a.r, d.c, d.r, a.u.dmg, d.u.dmg, a.moves, a.movedTiles, d.attacked, bt.round, (d.fdir || []).join('/'), !!d.guarding, at ? at.c + '/' + at.r : '', bt.ench.join('/'), bt.globalEnch.join('/'), a.tempEnch.join('/'), d.tempEnch.join('/'), a.curses.join('/'), d.curses.join('/'), !!d.asleep].join(':');
    if (CombatView._mfKey !== key) { CombatView._mfKey = key; CombatView._mf = CombatAI.meleeForecast(bt, a, d, at, 300); }
    const f = CombatView._mf; if (!f) return;
    const TW = CombatView.TW, TH = CombatView.TH;
    if (at) {
      const q = CombatView.iso(at.c, at.r); ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = f.flank ? '#ffb36e' : 'rgba(255,230,140,.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(q.x, q.y - TH / 2); ctx.lineTo(q.x + TW / 2, q.y); ctx.lineTo(q.x, q.y + TH / 2); ctx.lineTo(q.x - TW / 2, q.y); ctx.closePath(); ctx.stroke(); ctx.restore();
    }
    const p = CombatView.stand(d.c, d.r), fmt = x => x.toFixed(1).replace('.', ',');
    const l1 = 'Mêlée : ≈ ' + fmt(f.dealt) + ' infligé' + (f.dealt >= 2 ? 's' : '') + (f.kill >= .01 ? ' · ' + Math.round(f.kill * 100) + ' % de l\'abattre' : '');
    const l2 = 'riposte ≈ ' + fmt(f.received) + (f.die >= .01 ? ' (' + Math.round(f.die * 100) + ' % de périr)' : '') + (f.flank === 2 ? ' · dans le dos : +1, déf. ÷2' : f.flank === 1 ? ' · de flanc : +1' : '');
    // un tireur qui frappe : pourquoi il ne tire pas (ou Ctrl relâché pour tirer)
    const why = bt.canShoot(a, d) ? 'relâchez Ctrl pour tirer' : bt.shootBlock(a, d), l3 = why ? U.cap(why) : '';
    const fs = Math.max(11, Math.round(TW * .15));
    ctx.font = '700 ' + fs + 'px system-ui'; ctx.textAlign = 'center';
    const w1 = ctx.measureText(l1).width; ctx.font = '600 ' + Math.round(fs * .85) + 'px system-ui';
    const w = Math.max(w1, ctx.measureText(l2).width, l3 ? ctx.measureText(l3).width : 0) + 14, h = fs * (l3 ? 3.6 : 2.6), y = p.y - TH * 2.3 - h;
    ctx.fillStyle = 'rgba(10,12,16,.9)'; ctx.fillRect(p.x - w / 2, y, w, h);
    const col = f.die >= .5 || f.received > f.dealt * 1.5 ? '#ff8a6a' : f.kill >= .5 || f.dealt > f.received * 1.5 ? '#7fe08a' : '#f0c24a';
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(p.x - w / 2, y, w, h);
    ctx.font = '700 ' + fs + 'px system-ui'; ctx.fillStyle = col; ctx.fillText(l1, p.x, y + fs * 1.1);
    ctx.font = '600 ' + Math.round(fs * .85) + 'px system-ui'; ctx.fillStyle = '#d8d2c4'; ctx.fillText(l2, p.x, y + fs * 2.2);
    if (l3) { ctx.fillStyle = '#9fc4ff'; ctx.fillText(l3, p.x, y + fs * 3.2); }
  },
  // en visant un ennemi avec un tireur : dégâts attendus et risque de ne rien faire, au-dessus de la cible
  drawShotForecast(ctx) {
    const bt = CombatView.bt, a = CombatView.sel, hv = CombatView.hover;
    if (!a || !hv || CombatView.mode || CombatView.busy || bt.over || a.side !== CombatView.humanSide || bt.side !== a.side) return;
    const d = bt.unitAt(hv.c, hv.r);
    if (!d || d.side === a.side || !bt.canShoot(a, d) || CombatView.attackKind(a, d) !== 'ranged') return;   // au contact (ou Ctrl), le clic frappe : pas de bulle de tir
    // la clé suit tout ce qui change la prévision : positions, blessures, sorts, malédictions, sommeil, murailles
    const walls = bt.hasWalls ? Object.values(bt.walls).filter(w => w.broken).length : 0;
    const key = [a.id, d.id, a.c, a.r, d.c, d.r, a.u.dmg, d.u.dmg, bt.round, bt.ench.join('/'), bt.globalEnch.join('/'), a.tempEnch.join('/'), d.tempEnch.join('/'), a.curses.join('/'), d.curses.join('/'), (a.u.ench || []).join('/'), (d.u.ench || []).join('/'), !!d.asleep, !!a.asleep, a.ammo, walls].join(':');
    if (CombatView._fcKey !== key) { CombatView._fcKey = key; CombatView._fc = CombatAI.rangedForecast(bt, a, d, 500); }
    const f = CombatView._fc, TW = CombatView.TW, TH = CombatView.TH;
    const p = CombatView.stand(d.c, d.r);
    const dmg = f.dmg.toFixed(1).replace('.', ',');
    const l1 = 'Tir : ≈ ' + dmg + ' dégât' + (f.dmg >= 2 ? 's' : ''), l2 = Math.round(f.zero * 100) + ' % sans effet · ' + f.toHit + ' % par dé' + (f.pierce ? ', −' + f.pierce + ' déf.' : '');
    const fs = Math.max(11, Math.round(TW * .15));
    ctx.font = '700 ' + fs + 'px system-ui'; ctx.textAlign = 'center';
    const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 14, h = fs * 2.6, y = p.y - TH * 2.3 - h;
    ctx.fillStyle = 'rgba(10,12,16,.9)'; ctx.fillRect(p.x - w / 2, y, w, h);
    const col = f.zero >= 0.6 ? '#ff8a6a' : f.zero >= 0.3 ? '#f0c24a' : '#7fe08a';
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(p.x - w / 2, y, w, h);
    ctx.fillStyle = col; ctx.fillText(l1, p.x, y + fs * 1.1);
    ctx.font = '600 ' + Math.round(fs * .85) + 'px system-ui'; ctx.fillStyle = '#d8d2c4'; ctx.fillText(l2, p.x, y + fs * 2.2);
  },
  drawProp(pr, c, r, burning) {
    const ctx = CombatView.ctx, p = CombatView.iso(c, r), TW = CombatView.TW;
    if (pr.kind === 'stump') {
      // souches calcinées
      ctx.fillStyle = 'rgba(20,14,10,.55)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, TW * .2, TW * .08, 0, 0, 7); ctx.fill();
      for (const [dx, h] of [[-.07, .12], [.05, .09], [.01, .15]]) { ctx.fillStyle = '#2a1d14'; ctx.fillRect(p.x + dx * TW - TW * .02, p.y - h * TW, TW * .04, h * TW); ctx.fillStyle = '#ff7a2a'; ctx.globalAlpha = .35; ctx.fillRect(p.x + dx * TW - TW * .02, p.y - h * TW, TW * .04, TW * .015); ctx.globalAlpha = 1; }
      return;
    }
    if (burning) { ctx.save(); ctx.filter = 'brightness(.55) sepia(.6) saturate(1.6) hue-rotate(-20deg)'; }
    try { CombatView.drawPropBase(pr, c, r, p, TW); } finally { if (burning) ctx.restore(); }
  },
  drawPropBase(pr, c, r, p, TW) {
    const ctx = CombatView.ctx;
    p = { x: p.x, y: p.y - CombatView.lift(c, r) };
    if (Sprites.hasHD('tree:0')) {
      const key = pr.kind === 'tree' ? 'tree:' + (pr.v % 8) : pr.kind === 'rock' ? 'outcrop:' + (pr.v % 2) : 'detail:bush';
      const size = pr.kind === 'tree' ? TW * .72 : pr.kind === 'rock' ? TW * .66 : TW * .42;
      const behind = pr.kind === 'tree' && CombatView.bt.units.some(b => { const q = CombatView.pos[b.id]; return q && !b.dead && q.c <= c + .5 && q.r <= r + .5 && (c - q.c) + (r - q.r) > 0 && (c - q.c) + (r - q.r) <= 2.5; });
      ctx.globalAlpha = behind ? .45 : 1;
      Sprites.drawFoot(ctx, Sprites.planeKey(key, CombatView.bt.plane), p.x, p.y + CombatView.TH * .25, size);
      ctx.globalAlpha = 1;
      return;
    }
    if (pr.kind === 'tree') {
      // arbre translucide s'il cache une unité juste derrière
      const behind = CombatView.bt.units.some(b => { const q = CombatView.pos[b.id]; return q && !b.dead && q.c <= c + .5 && q.r <= r + .5 && (c - q.c) + (r - q.r) > 0 && (c - q.c) + (r - q.r) <= 2.5; });
      ctx.globalAlpha = behind ? .45 : 1;
      Sprites.draw(ctx, 'tree:' + (pr.v % 8), p.x - TW * .3, p.y - TW * .52, TW * .6, TW * .6);
      ctx.globalAlpha = 1;
    }
    else if (pr.kind === 'rock') { ctx.fillStyle = '#6d6a64'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, TW * .26, TW * .15, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#8c8880'; ctx.beginPath(); ctx.ellipse(p.x - 4, p.y - 10, TW * .16, TW * .1, 0, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = '#3f6a2c'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, TW * .14, TW * .08, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#58893d'; ctx.beginPath(); ctx.ellipse(p.x - 2, p.y - 7, TW * .09, TW * .05, 0, 0, 7); ctx.fill(); }
  },
  // rivière : eau profonde (rides animées) ou gué (galets)
  drawWater(p, c, r, now) {
    const ctx = CombatView.ctx, TW = CombatView.TW, TH = CombatView.TH;
    const g = ctx.createLinearGradient(p.x - TW / 2, p.y - TH / 2, p.x + TW / 2, p.y + TH / 2);
    const ford = CombatView.bt.isFord && CombatView.bt.isFord(c, r);
    // gué : eau claire peu profonde sur un lit de galets ; ailleurs, eau profonde
    if (ford) { g.addColorStop(0, 'rgba(112,160,168,.86)'); g.addColorStop(1, 'rgba(92,138,146,.9)'); }
    else { g.addColorStop(0, 'rgba(36,86,136,.92)'); g.addColorStop(1, 'rgba(22,58,100,.95)'); }
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    if (ford) {
      for (let i = 0; i < 7; i++) {
        const a = ((c * 13 + r * 7 + i * 29) % 100) / 100, bb = ((c * 31 + r * 17 + i * 43) % 100) / 100;
        const x = p.x + (a - .5) * TW * .62, y = p.y + (bb - .5) * TH * .55, rw = TW * (.035 + (i % 3) * .012);
        ctx.fillStyle = 'rgba(70,78,74,.55)'; ctx.beginPath(); ctx.ellipse(x, y + 1.5, rw, rw * .55, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(178,184,170,.85)'; ctx.beginPath(); ctx.ellipse(x, y, rw, rw * .55, 0, 0, 7); ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(200,230,255,.35)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const ph = ((now / 1400 + i / 3 + (c * 7 + r * 3) % 5 / 5) % 1);
      const y = p.y - TH / 2 + ph * TH;
      ctx.beginPath(); ctx.moveTo(p.x - TW * .3, y); ctx.quadraticCurveTo(p.x, y - 3, p.x + TW * .3, y); ctx.stroke();
    }
    ctx.restore();
  },
  // colline : un plateau surélevé, ses deux flancs de terre, le même sol au sommet
  drawHill(c, r, inReach, hovered, tint) {
    const ctx = CombatView.ctx, TW = CombatView.TW, TH = CombatView.TH, p = CombatView.iso(c, r), L = TH * .24;
    const N = [p.x, p.y - TH / 2 - L], E = [p.x + TW / 2, p.y - L], S = [p.x, p.y + TH / 2 - L], W = [p.x - TW / 2, p.y - L];
    const E0 = [p.x + TW / 2, p.y], S0 = [p.x, p.y + TH / 2], W0 = [p.x - TW / 2, p.y];
    const poly = (pts, fill) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
    const soil = CombatView.bt.plane === 1 && Sprites.hasMirror() ? (CombatView.groundKind === 'desert' ? ['#8a7aa2', '#6e6284'] : ['#3e3658', '#2e2846']) : CombatView.groundKind === 'desert' ? ['#9a7a48', '#7a5e36'] : ['#6b5232', '#523e25'];
    poly([W, S, S0, W0], soil[0]); poly([S, E, E0, S0], soil[1]);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(S[0], S[1]); ctx.lineTo(S0[0], S0[1]); ctx.stroke();
    // sommet : le motif du sol, un peu plus clair
    ctx.save();
    ctx.beginPath(); ctx.moveTo(N[0], N[1]); ctx.lineTo(E[0], E[1]); ctx.lineTo(S[0], S[1]); ctx.lineTo(W[0], W[1]); ctx.closePath();
    ctx.clip();
    if (CombatView.patScale) { ctx.translate(CombatView.ox, CombatView.oy - L); ctx.scale(TW / 110, TW / 110); ctx.imageSmoothingEnabled = true; }
    else { ctx.translate(p.x, p.y - L); ctx.scale(TW / 64, TW / 64); }
    ctx.fillStyle = CombatView.patterns[Tiles.hash(c, r, 9) % 4]; ctx.fillRect(-400, -400, 800, 800);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(N[0], N[1]); ctx.lineTo(E[0], E[1]); ctx.lineTo(S[0], S[1]); ctx.lineTo(W[0], W[1]); ctx.closePath();
    ctx.fillStyle = 'rgba(255,240,190,.12)'; ctx.fill();
    ctx.strokeStyle = 'rgba(40,28,10,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    if (tint) { ctx.fillStyle = tint; ctx.fill(); }
    if (inReach) { ctx.fillStyle = 'rgba(110,220,120,.20)'; ctx.fill(); ctx.strokeStyle = 'rgba(140,240,150,.45)'; ctx.stroke(); }
    if (hovered) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.stroke(); }
  },
  // sorts de zone visés sur une case : rayon autour de la case (Bourbier 5 × 5, Vortex magique : ses éclairs sur les cases voisines)
  // reach : la zone n'est pas frappée d'un coup, c'est ce que le sort peut atteindre ce round (le vortex parcourt 4 cases dès son apparition)
  ZONES: { earth_to_mud: { r: 2, fill: 'rgba(150,104,42,', edge: 'rgba(255,214,110,.95)' }, magic_vortex: { r: 4, reach: true, fill: 'rgba(170,90,255,', edge: 'rgba(220,180,255,.95)' } },
  zoneOf(id, c, r) {
    const z = CombatView.ZONES[id]; if (!z) return null;
    const out = new Set();
    for (let dc = -z.r; dc <= z.r; dc++) for (let dr = -z.r; dr <= z.r; dr++) { const x = c + dc, y = r + dr; if (x >= 0 && y >= 0 && x < CW && y < CH) out.add(x + ',' + y); }
    return out;
  },
  // les unités que la zone prendrait (la boue : ni les volants ni les immatériels ; le vortex : les ennemis seulement)
  zoneUnits(id, zone) {
    const bt = CombatView.bt, me = CombatView.humanSide;
    return bt.units.filter(b => !b.dead && zone.has(b.c + ',' + b.r) && !(b.side !== me && bt.isInvisible(b)) && (id !== 'magic_vortex' || b.side !== me)
      && !(id === 'earth_to_mud' && (bt.stats(b).flying || bt.stats(b).ab.nonCorporeal)));
  },
  // le contour de la zone : les bords de case qui ne touchent pas une autre case de la zone (lift : sommets des collines)
  drawZoneEdge(zone, col, onHills) {
    const ctx = CombatView.ctx, TW = CombatView.TW, TH = CombatView.TH, bt = CombatView.bt;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3;
    ctx.beginPath();
    for (const k of zone) {
      const [c, r] = k.split(',').map(Number), hill = !!(bt.hills && bt.hills[k]);
      if (!!onHills !== hill) continue;
      const p = CombatView.iso(c, r), L = hill ? TH * .24 : 0;
      const T = [p.x, p.y - TH / 2 - L], R = [p.x + TW / 2, p.y - L], B = [p.x, p.y + TH / 2 - L], W = [p.x - TW / 2, p.y - L];
      for (const [nc, nr, a, b2] of [[c, r - 1, T, R], [c + 1, r, R, B], [c, r + 1, B, W], [c - 1, r, W, T]]) {
        if (zone.has(nc + ',' + nr)) continue;
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]);
      }
    }
    ctx.stroke(); ctx.restore();
  },
  // flammes d'un bosquet en feu
  drawFlames(c, r, now) {
    const ctx = CombatView.ctx, p = CombatView.iso(c, r), TW = CombatView.TW;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.x, p.y - TW * .2, 0, p.x, p.y - TW * .2, TW * .45);
    g.addColorStop(0, 'rgba(255,170,60,.55)'); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y - TW * .2, TW * .45, TW * .38, 0, 0, 7); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const ph = (now / 520 + i * .37 + (c * 13 + r * 7) % 10 / 10) % 1;
      const x = p.x + (i - 3) * TW * .055 + Math.sin(now / 180 + i) * TW * .015;
      const y = p.y - TW * (.05 + ph * .5), h = TW * (.16 * (1 - ph) + .04);
      ctx.fillStyle = 'rgba(255,' + Math.round(200 - ph * 140) + ',' + Math.round(80 - ph * 60) + ',' + (.85 * (1 - ph)) + ')';
      ctx.beginPath(); ctx.moveTo(x - h * .35, y); ctx.quadraticCurveTo(x, y - h * 1.4, x + h * .35, y); ctx.quadraticCurveTo(x, y + h * .3, x - h * .35, y); ctx.fill();
    }
    ctx.restore();
  },
  // sprite HD gardé à ses proportions, posé par le bas (cx, bottom), largeur w ; miroir horizontal possible
  drawTrim(key, cx, bottom, w, flip) {
    if (!Sprites.hasHD(key)) return false;
    const r = Sprites.hdMap[key], hgt = w * r[3] / r[2], ctx = CombatView.ctx;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    ctx.drawImage(Sprites.img4(key), r[0], r[1], r[2], r[3], cx - w / 2, bottom - hgt, w, hgt);
    ctx.restore();
    return true;
  },
  drawHouse(b) {
    const ctx = CombatView.ctx, p = CombatView.iso(b.c, b.r), TW = CombatView.TW, TH = CombatView.TH;
    if (CombatView.drawTrim('chouse:' + (Tiles.hash(b.c, b.r, 5) % 4), p.x, p.y + TH * .3, TW * .66, Tiles.hash(b.c, b.r, 6) % 2 === 1)) return;
    const bt = CombatView.bt; const pl = App.game.players[bt.city.owner];
    const w = TW * .32, hgt = TW * .22;
    ctx.fillStyle = '#cdb994'; ctx.beginPath(); ctx.moveTo(p.x - w, p.y - 2); ctx.lineTo(p.x, p.y + w / 2 - 2); ctx.lineTo(p.x, p.y + w / 2 - 2 - hgt); ctx.lineTo(p.x - w, p.y - 2 - hgt); ctx.fill();
    ctx.fillStyle = '#a89470'; ctx.beginPath(); ctx.moveTo(p.x + w, p.y - 2); ctx.lineTo(p.x, p.y + w / 2 - 2); ctx.lineTo(p.x, p.y + w / 2 - 2 - hgt); ctx.lineTo(p.x + w, p.y - 2 - hgt); ctx.fill();
    ctx.fillStyle = pl ? pl.color : '#8a6a4a'; ctx.beginPath(); ctx.moveTo(p.x - w - 2, p.y - 2 - hgt); ctx.lineTo(p.x, p.y + w / 2 - 2 - hgt); ctx.lineTo(p.x + w + 2, p.y - 2 - hgt); ctx.lineTo(p.x, p.y - 2 - hgt - w * .8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(p.x, p.y + w / 2 - 2 - hgt); ctx.lineTo(p.x + w + 2, p.y - 2 - hgt); ctx.lineTo(p.x, p.y - 2 - hgt - w * .8); ctx.closePath(); ctx.fill();
  },
  // part : 'back' (faces du fond, dessinées avant le chemin de ronde) ou 'front' (faces de devant, après)
  // mur de flammes : des langues de feu animées le long du pan (8 images en boucle, décalées d'une langue à l'autre), une lueur au pied
  drawFlames(a, b) {
    const ctx = CombatView.ctx, TW = CombatView.TW, now = performance.now();
    const seed = Math.round(a[0] * 7 + a[1] * 13) & 1023;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, g = ctx.createRadialGradient(mx, my, 0, mx, my, TW * .4);
    g.addColorStop(0, 'rgba(255,120,30,.35)'); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(mx, my, TW * .4, TW * .2, 0, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';   // les flammes elles-mêmes : peintes, pas ajoutées (sur la pierre claire, l'ajout tourne au blanc)
    const N = 5;
    for (let i = 0; i < N; i++) {
      const f = (i + .5) / N, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      const fr = (Math.floor(now / 85) + i * 3 + seed) % 8, h = TW * (.62 + .1 * ((i * 5 + seed) % 3) / 2);
      Fx.draw(ctx, 'flame:' + fr, x, y - h * .44, 0, h, .9);
    }
    ctx.restore();
  },
  // les murailles de la bataille : en rondins pour les peuples qui bâtissent en bois (comme sur la carte), en pierre sinon
  WOOD_WALLS: ['barbarian', 'gnoll'],
  wallKey(part) { const bt = CombatView.bt, wood = bt && bt.city && CombatView.WOOD_WALLS.includes(bt.city.race) && Sprites.hasHD('cwall:wood:' + part); return (wood ? 'cwall:wood:' : 'cwall:') + part; },
  drawWall(c, r, w, part) {
    const ctx = CombatView.ctx, TW = CombatView.TW, TH = CombatView.TH, bt = CombatView.bt;
    const p = CombatView.iso(c, r);
    const hgt = TW * .26;
    // côtés extérieurs de la case murale
    const edges = [];
    if (part !== 'front' && c === CITY_MIN) edges.push([[p.x - TW / 2, p.y], [p.x, p.y - TH / 2]]);
    if (part !== 'back' && c === CITY_MAX) edges.push([[p.x, p.y + TH / 2], [p.x + TW / 2, p.y]]);
    if (part !== 'front' && r === CITY_MIN) edges.push([[p.x, p.y - TH / 2], [p.x + TW / 2, p.y]]);
    if (part !== 'back' && r === CITY_MAX) edges.push([[p.x - TW / 2, p.y], [p.x, p.y + TH / 2]]);
    const HDW = bt.hasWalls && Sprites.hasHD('cwall:0');
    for (const [a, b] of edges) {
      if (HDW) {
        // "/" : l'extrémité basse est à gauche ; "\\" : sprite retourné, extrémité basse à droite
        const slash = b[1] < a[1], key = CombatView.wallKey(w.broken ? 'broken' : w.gate ? 'gate' : '0');
        const wd = TW * .5 * 1.22;
        CombatView.drawTrim(key, (a[0] + b[0]) / 2, Math.max(a[1], b[1]) + TH * .1, wd, !slash);
      }
      if (bt.wallOfFire && Fx.has('flame:0')) CombatView.drawFlames(a, b);
      else if (bt.wallOfFire) { const t = performance.now() / 120; for (let i = 0; i < 5; i++) { const f = i / 4; const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f; ctx.fillStyle = ['#ff5a1a', '#ffb52a', '#ff8a2a'][(i + Math.floor(t)) % 3]; ctx.beginPath(); ctx.ellipse(x, y - TW * .12 - Math.sin(t + i) * 3, TW * .05, TW * .13, 0, 0, 7); ctx.fill(); } }
      if (bt.wallOfDarkness) { ctx.fillStyle = 'rgba(20,0,30,.55)'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - hgt * 1.6); ctx.lineTo(a[0], a[1] - hgt * 1.6); ctx.fill(); }
      if (HDW) continue;
      if (!bt.hasWalls || w.gate) { if (w.gate && bt.hasWalls) { ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - hgt * .8); ctx.lineTo(a[0], a[1] - hgt * .8); ctx.fill(); } continue; }
      const h2 = w.broken ? hgt * .3 : hgt;
      ctx.fillStyle = w.broken ? '#6a665e' : '#9c968a'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0], b[1] - h2); ctx.lineTo(a[0], a[1] - h2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();
      if (!w.broken) { ctx.fillStyle = '#b5ae9f'; for (let i = 0; i < 4; i++) { const f = (i + .25) / 4; const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f; ctx.fillRect(x - 3, y - h2 - 4, 6, 4); } }
    }
  },
  // une tour de défense se dresse à l'angle extérieur de sa case, là où se rejoignent les deux pans de muraille
  towerAt(t) {
    if (t.kind !== 'stone') return CombatView.iso(t.c, t.r);
    const k = .32, dc = t.c === CITY_MAX ? k : t.c === CITY_MIN ? -k : 0, dr = t.r === CITY_MAX ? k : t.r === CITY_MIN ? -k : 0;
    return CombatView.iso(t.c + dc, t.r + dr);
  },
  drawTower(t, now) {
    const ctx = CombatView.ctx, TW = CombatView.TW, TH = CombatView.TH, P = CombatView.towerAt(t);
    const tv = (CombatView.tview || {})[t.id] || { hp: t.hp, fallen: t.dead };
    if (t.kind === 'gate') {
      if (tv.fallen || tv.hp >= t.maxHp || !CombatView.bt.standing(t)) return;
      const E = CombatView.gateEdge(t), Q = CombatView.iso(E.c, E.r);
      const bw = TW * .34, bx = Q.x - bw / 2, by = Q.y - TW * .42, f = Math.max(0, tv.hp) / t.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = f > .6 ? '#c9a46a' : f > .3 ? '#e6b450' : '#e35d5d'; ctx.fillRect(bx, by, bw * f, 3);
      return;
    }
    const spire = t.kind === 'spire', key = spire ? 'feat:tower' : CombatView.wallKey('tower');
    const w = spire ? TW * 1.45 : TW * .5, bottom = P.y + TH * (spire ? .62 : .3);
    const r = Sprites.hasHD(key) ? Sprites.hdMap[key] : null, hgt = r ? w * r[3] / r[2] : TW * .9;
    if (tv.fallen) {
      if (r) {
        const f = .34;
        ctx.save(); ctx.filter = 'brightness(.5) saturate(.35)'; ctx.imageSmoothingEnabled = true;
        ctx.drawImage(Sprites.img4(key), r[0], r[1] + r[3] * (1 - f), r[2], r[3] * f, P.x - w / 2, bottom - hgt * f, w, hgt * f);
        ctx.restore();
      }
      ctx.fillStyle = '#7d776c';
      for (let i = 0; i < 7; i++) { const a = i * 2.4; ctx.beginPath(); ctx.ellipse(P.x + Math.cos(a) * w * .4, bottom - 4 + Math.sin(a) * TH * .12, 4 + (i % 3) * 2, 3 + (i % 2) * 2, 0, 0, 7); ctx.fill(); }
      return;
    }
    if (!r || !CombatView.drawTrim(key, P.x, bottom, w)) {
      ctx.fillStyle = spire ? '#4a3a6a' : '#9c968a'; ctx.fillRect(P.x - TW * .14, bottom - hgt, TW * .28, hgt);
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.strokeRect(P.x - TW * .14, bottom - hgt, TW * .28, hgt);
    }
    if (spire) {
      // l'orbe de la tour, aux couleurs du royaume du sorcier
      const col = REALM_COLORS[t.realm] || '#c9a0ff', pulse = .5 + .5 * Math.sin(now / 320);
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10 + 10 * pulse; ctx.fillStyle = col; ctx.globalAlpha = .55 + .35 * pulse;
      ctx.beginPath(); ctx.arc(P.x, bottom - hgt * .9, 4 + 2 * pulse, 0, 7); ctx.fill(); ctx.restore();
    }
    const bw = TW * .5, bx = P.x - bw / 2, by = bottom - hgt - 7, f = Math.max(0, tv.hp) / t.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = f > .6 ? '#6fcf7a' : f > .3 ? '#e6b450' : '#e35d5d'; ctx.fillRect(bx, by, bw * f, 3);
    if (t.mute > 0 && !tv.fallen) { const tx = 'muette ' + t.mute; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,8,16,.85)'; ctx.strokeText(tx, P.x, by - 4); ctx.fillStyle = '#b892ff'; ctx.fillText(tx, P.x, by - 4); }
  },
  // le rayon de la tour du sorcier : un trait de lumière, du sommet de la tour à la cible
  beam(pa, pd, color) {
    return new Promise(res => {
      const dur = CombatView.auto ? CombatView.af(120, 380) : 380;
      CombatView.anims.push({ t0: performance.now(), dur, draw: (ctx, t) => {
        const TW = CombatView.TW, A = CombatView.iso(pa.c, pa.r), D = CombatView.stand(pd.c, pd.r); D.y -= CombatView.TH * .5;
        const ay = A.y - TW * 1.05, k = Math.min(1, t * 3), x = A.x + (D.x - A.x) * k, y = ay + (D.y - ay) * k;
        ctx.save(); ctx.globalAlpha = 1 - Math.max(0, t - .5) * 2; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(A.x, ay); ctx.lineTo(x, y); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      } });
      setTimeout(() => { CombatView.flash(pd.c, pd.r, color, 260); res(); }, dur * .45);
    });
  },
  // la toile d'une figurine : l'image dessinée (ov:web, ov:web_torn) si elle existe, sinon des fils tracés
  // (créature imposante : un filet plus large que haut, posé sur le corps)
  // (troupe de plusieurs figurines : une toile par figurine, plus transparente pour que la troupe reste lisible)
  drawWeb(ctx, x, y, size, k, seed, big, many) {
    k = Math.max(.15, Math.min(1, k));
    ctx.save(); ctx.globalAlpha *= (.5 + .5 * k) * (many ? .62 : .9);
    const key = k > .5 ? 'ov:web' : 'ov:web_torn';
    const W = big ? size * .86 : size * .66, H = big ? size * .74 : size * .98, top = y - H * .97;
    if (Sprites.hasHD(key)) { Sprites.draw(ctx, key, x - W / 2, top, W, H); ctx.restore(); return; }
    const cx = x, cy = top + H * .48, rx = W * .5, ry = H * .5, rnd = i => { const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };
    const n = 7, holes = k > .5 ? 0 : 2;
    const spoke = i => { const a = i / n * Math.PI * 2 + (rnd(i) - .5) * .4; return [Math.cos(a), Math.sin(a)]; };
    ctx.lineCap = 'round';
    for (const [col, lw] of [['rgba(30,34,52,.4)', Math.max(1.6, size / 40)], ['rgba(236,240,248,.85)', Math.max(.8, size / 80)]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { if (i < holes) continue; const [dx, dy] = spoke(i); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * rx, cy + dy * ry); }
      for (let r = 1; r <= 3; r++) {
        const f = r / 3 * .92;
        for (let i = 0; i < n; i++) {
          if (i < holes || (holes && rnd(i * 5 + r) < .4)) continue;
          const [ax, ay] = spoke(i), [bx2, by2] = spoke((i + 1) % n), sag = .8 + rnd(i + r * 11) * .12;
          ctx.moveTo(cx + ax * rx * f, cy + ay * ry * f);
          ctx.quadraticCurveTo(cx + (ax + bx2) / 2 * rx * f * sag, cy + (ay + by2) / 2 * ry * f * sag, cx + bx2 * rx * f, cy + by2 * ry * f);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  },
  drawFacing(ctx, b, P, S, col) {
    const TW = CombatView.TW, TH = CombatView.TH, f = CombatView.bt.fdirOf(b);
    let fx = f[0] - f[1], fy = f[0] + f[1]; const L = Math.hypot(fx, fy) || 1; fx /= L; fy /= L;
    const sq = TH / TW, R = TW * .42 * S, k = TW * .095 * S;
    const cx = P.x + fx * R, cy = P.y + fy * R * sq;
    const pt = (u, v) => [cx + (fx * u - fy * v) * k, cy + (fy * u + fx * v) * k * sq];
    ctx.save(); ctx.globalAlpha = .85;
    ctx.beginPath(); ctx.moveTo(...pt(1.1, 0)); ctx.lineTo(...pt(-.5, .95)); ctx.lineTo(...pt(-.15, 0)); ctx.lineTo(...pt(-.5, -.95)); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(255,248,220,.85)'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.restore();
  },
  // figurine seule à taille d'homme : héros, colons, éclaireurs (les autres figurines seules sont des créatures ou des machines)
  humanSized(d) { return d.race === 'hero' || !!(d.abilities && (d.abilities.createOutpost || d.abilities.scout)); },
  drawUnit(b, p) {
    const ctx = CombatView.ctx, TW = CombatView.TW, TH = CombatView.TH, bt = CombatView.bt, game = App.game;
    const P = CombatView.stand(p.c, p.r), S = P.s;
    // la couleur du camp où l'unité combat (une unité possédée prend celle de son nouveau maître)
    const pl = CombatView.bt.player(b.side) || game.players[b.u.owner];
    const col = b.side === CombatView.humanSide ? (App.me().color) : (pl ? pl.color : '#9a3a3a');
    const figs = b.dead ? Math.max(1, p.lastFigs || 1) : CombatView.bt.figures(b);   // (Cœur de lion, Héroïsme lancés en combat compris)
    p.lastFigs = figs;
    const d = DATA.units[b.u.type];
    // figurine seule : créature imposante (dragon, géant, machine) ou simple personnage (héros, colons), à l'échelle d'un soldat
    const solo = d.figures === 1, human = solo && CombatView.humanSized(d), big = solo && !human;
    const hd = Sprites.hasHD(Sprites.resolve(Sprites.unitKey(b.u)) || '');
    const size = S * (hd ? (big ? TW * 1.05 : human ? TW * .64 : TW * .56) : (big ? TW * .7 : human ? TW * .46 : TW * .4));
    const layout = FIG_LAYOUT[Math.min(8, Math.max(1, figs))];
    // positions des figurines : la formation habituelle, ou une file le long du parapet (mélangées pendant qu'on monte ou descend)
    const spots = layout.map(([fx, fy], i) => {
      let x = fx * TW * .62 * S, y = fy * TH * 1.15 * S;
      if (P.w > 0 && P.ax && layout.length > 1) {
        const t = (i + .5) / layout.length - .5, j = (i % 2 ? .05 : -.05);
        const gc = P.ax[0] * t * .9 + P.ax[1] * j, gr = P.ax[1] * t * .9 + P.ax[0] * j;
        x = x * (1 - P.w) + (gc - gr) * TW / 2 * P.w; y = y * (1 - P.w) + (gc + gr) * TH / 2 * P.w;
      }
      return [x, y];
    }).sort((a, b) => a[1] - b[1]);
    ctx.globalAlpha = p.alpha * (b.invisible && b.side !== CombatView.humanSide ? .35 : 1) * (b.invisible ? .7 : 1);
    // les figurines regardent à gauche : on les retourne quand l'unité fait face à droite (par défaut, l'assaillant)
    const flip = b.faceX != null ? b.faceX > 0 : b.side === ATT_SIDE;
    // animation : action en cours (marche, attaque, mort) sinon repos ; chaque figurine est un peu décalée dans le cycle
    const animated = Anim.has(Sprites.lookOf(b.u)), now = performance.now();
    let act = 'idle', t0 = 0;
    if (animated && p.act) { if (p.act.loop || p.act.name === 'death' || now - p.act.t0 < Anim.duration(p.act.name) + 140) { act = p.act.name; t0 = p.act.t0; } else p.act = null; }
    const shake = p.hit && now - p.hit < 170 ? Math.sin((now - p.hit) / 18) * TW * .025 * (1 - (now - p.hit) / 170) : 0;
    // armes magiques (et Lame de feu, Feux du métal) : les figurines luisent
    const grgb = b.dead ? null : UI.weaponGlow(game, b.u, b.tempEnch, bt.ench[b.side].includes('metal_fires') && Units.isNormal(b.u));
    const glow = grgb ? { rgb: grgb, alpha: .8 + .2 * Math.sin(now / 480 + b.id) } : null;
    // orientation : un chevron au sol, du côté où l'unité regarde (frappée de flanc ou dans le dos, elle se défend moins bien)
    // (vers le haut de l'écran, le chevron passerait derrière les figurines : il est tracé après elles)
    const showFace = !b.dead && !b.asleep && !b.guarding && !b.holdBreach && !(P.w >= .5), fd = bt.fdirOf(b), faceUp = fd[0] + fd[1] < 0;
    if (showFace && !faceUp) CombatView.drawFacing(ctx, b, P, S, col);
    let fi = 0;
    for (const [ox, oy] of spots) {
      const x = P.x + ox + shake, y = P.y + oy;
      fi++;
      const ew = hd ? (big ? size * .3 : human ? TW * .14 * S : TW * .11 * S) : size * .3;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 1, ew * 1.07, ew * .4, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, ew, ew * .37, 0, 0, 7); ctx.stroke();
      ctx.save();
      if (flip) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
      if (animated) {
        const tt = act === 'idle' ? now + fi * 173 + b.id * 97 : now - t0 - (act === 'death' ? 0 : (fi - 1) * 35);
        Anim.draw(ctx, Sprites.lookOf(b.u), act, tt, x, y + size * .08 - (p.lift || 0), size, false, glow);
      } else { Sprites.draw(ctx, Sprites.unitKey(b.u), x - size / 2, y - size * .92 - (p.lift || 0), size, size); if (glow) Weapons.onStill(ctx, Sprites.unitKey(b.u), x - size / 2, y - size * .92 - (p.lift || 0), size, glow); }
      ctx.restore();
      // Toile : la soie par-dessus chaque figurine, plus pâle et plus déchirée à mesure qu'on s'en dégage
      if (b.web > 0 && !b.dead) CombatView.drawWeb(ctx, x, y - (p.lift || 0), size, b.web / 12, b.id * 7 + fi, big, spots.length > 1);
    }
    if (showFace && faceUp) CombatView.drawFacing(ctx, b, P, S, col);
    ctx.globalAlpha = 1;
    if (b.dead) return;
    // barre de vie et état
    const s = Units.stats(game, CombatView.bt.effUnit(b));
    const hp = CombatView.bt.hp(b) / s.maxHp;
    const bw = TW * .5, bx = P.x - bw / 2, by = P.y - (hd ? size * .9 + (big ? 0 : TH * .25) : big ? TW * .95 : TW * .62);
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
    ctx.fillStyle = hp > .6 ? '#6fcf7a' : hp > .3 ? '#e6b450' : '#e35d5d'; ctx.fillRect(bx, by, bw * hp, 3);
    ctx.fillStyle = col; ctx.fillRect(bx - 5, by - 1, 4, 5);
    // états qui privent l'unité de son tour : écrits sous la barre de vie
    const st = [b.stasis ? 'stase' : null, b.asleep ? 'Zz' : null, b.web ? 'toile ' + b.web : null, b.confused ? '?' : null, b.feared ? 'terreur' : null, b.entangled && !b.web && !b.asleep ? 'entravé' : null, b.possessed && b.origSide != null && b.origSide !== b.side ? (b.bound ? 'asservi' : 'possédé') : null, b.curses.includes('shatter') ? 'bris' : null, b.curses.some(c => c.startsWith('warp_creature')) ? 'déformé' : null].filter(Boolean);
    if (st.length) { ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,8,16,.85)'; ctx.strokeText(st.join(' · '), P.x, by - 4); ctx.fillStyle = '#b892ff'; ctx.fillText(st.join(' · '), P.x, by - 4); }
    else if (b.autoCtl && b.side === CombatView.humanSide) { ctx.font = 'bold 10.5px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(6,14,20,.9)'; ctx.strokeText('auto', P.x, by - 4); ctx.fillStyle = '#7fd4ff'; ctx.fillText('auto', P.x, by - 4); }
    else if (b.holdBreach || b.guarding) { const tx = b.holdBreach ? 'garde (brèche)' : 'en garde'; ctx.font = 'bold 10.5px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,4,.9)'; ctx.strokeText(tx, P.x, by - 4); ctx.fillStyle = '#ffd66e'; ctx.fillText(tx, P.x, by - 4); }
    if (P.w >= .5) return;   // posté sur la muraille : son cercle est tracé par-dessus le parapet (draw)
    if (CombatView.sel === b && !CombatView.mode) { ctx.strokeStyle = 'rgba(255,230,140,.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(P.x, P.y, TW * .42 * S, TH * .42 * S, 0, 0, 7); ctx.stroke(); }
    else if (b.side === bt.side && b.side === CombatView.humanSide && b.moves > 0) { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(P.x, P.y, TW * .4 * S, TH * .4 * S, 0, 0, 7); ctx.stroke(); }
  },

  // ---------- animations ----------
  // vitesse des batailles automatiques (menu) : rapide (comme avant), moyenne, lente (le rythme d'une bataille commandée)
  AUTO_SPEEDS: ['fast', 'medium', 'slow'],
  af(fast, normal) { const k = { fast: 0, medium: .45, slow: 1 }[(typeof App !== 'undefined' && App.prefs && App.prefs.autoSpeed) || 'fast'] || 0; return fast + (normal - fast) * k; },
  sleep(ms) { return new Promise(r => setTimeout(r, CombatView.auto ? CombatView.af(Math.min(ms, 60), ms) : ms)); },
  async playEvents() {
    const bt = CombatView.bt;
    while (CombatView.evIdx < bt.events.length) {
      const e = bt.events[CombatView.evIdx++];
      if (e.type === 'move') {
        const p = CombatView.pos[e.id]; if (!p) continue;
        p.act = { name: 'walk', t0: performance.now(), loop: true };
        for (let i = 1; i < e.path.length; i++) { const [c, r] = e.path[i]; Sfx.play('step'); await CombatView.tween(p, c, r, 110); }
        p.act = null;
      } else if (e.type === 'melee') {
        const a = bt.units.find(x => x.id === e.a), d = bt.units.find(x => x.id === e.d);
        const pa = CombatView.pos[e.a], pd = CombatView.pos[e.d];
        if (pa && pd) {
          const oc = pa.c, or = pa.r;
          if (e.charge) CombatView.float(pa.c, pa.r, 'Charge +' + e.charge, '#ffd66e');
          if (e.flank) CombatView.float(pd.c, pd.r, e.flank === 2 ? 'Dans le dos !' : 'De flanc !', '#ffb36e');
          // Effroi : les figurines paralysées de peur, au-dessus de qui les a perdues
          if (e.fearA) CombatView.float(pa.c, pa.r - .35, 'Effroi −' + e.fearA, '#c9a0ff');
          if (e.fearD) CombatView.float(pd.c, pd.r - .35, 'Effroi −' + e.fearD, '#c9a0ff');
          // l'attaquant frappe (riposte du défenseur s'il rend des coups) ; l'impact tombe sur l'image du coup porté
          const anim = a && Anim.has(Sprites.lookOf(a.u));
          pa.act = { name: 'attack', t0: performance.now() };
          if (e.received && d && Anim.has(Sprites.lookOf(d.u))) pd.act = { name: 'attack', t0: performance.now() + 90 };
          await CombatView.tween(pa, oc + (pd.c - oc) * .35, or + (pd.r - or) * .35, anim ? 170 : 110);
          if (anim) await CombatView.sleep(110);
          pd.hit = performance.now(); if (e.received) pa.hit = performance.now() + 60;
          CombatView.flash(pd.c, pd.r, '#ffffff', 220); Sfx.play('clash'); CombatView.burst(pd.c, pd.r, ['#ffffff', '#ffe9a8', '#c9d3e0'], 10, 'spark');
          const onGate = String(e.d).startsWith('gate:');
          if (onGate) CombatView.burst(pd.c, pd.r, ['#8a5a2a', '#c9a46a', '#5a3a1e'], 12, 'dust');
          CombatView.float(pd.c, pd.r, (onGate ? 'porte -' : '-') + e.dealt, onGate ? '#e0b070' : '#ff7a6a'); if (e.received) CombatView.float(oc, or, '-' + e.received, '#ffb0a0');
          if (CombatView.tview && CombatView.tview[e.d]) CombatView.tview[e.d].hp -= e.dealt;
          await CombatView.tween(pa, oc, or, 120);
        }
      } else if (e.type === 'ranged') {
        const pa = CombatView.pos[e.a], pd = CombatView.pos[e.d];
        const sh = bt.units.find(x => x.id === e.a);
        if (pa && sh && Anim.has(Sprites.lookOf(sh.u))) { pa.act = { name: 'attack', t0: performance.now() }; await CombatView.sleep(260); }
        if (pa && pd) {
          Sfx.play(e.kind === 'magic' ? 'zap' : e.kind === 'boulder' ? 'boulder' : 'arrow', { realm: e.realm });
          if (e.a === 'spire') await CombatView.beam(pa, pd, REALM_COLORS[e.realm] || '#c9a0ff');
          else {
            // le projectile de cette unité (flèches, javelots, pierres de fronde, boulets, rochers, traits magiques), en volée d'une par figurine
            const style = CombatView.projStyle(sh, e.kind), n = sh && !sh.dead && ['arrow', 'javelin', 'stone'].includes(style) ? Math.max(1, Math.min(6, bt.figures(sh))) : 1;
            await CombatView.projectile(pa, pd, e.kind === 'magic' ? (REALM_COLORS[e.realm] || '#ff9a4a') : e.kind === 'boulder' ? '#8d8a84' : '#e8dcc0', e.kind, style, n, CombatView.projSprite(sh, e, style));
          }
          CombatView.float(pd.c, pd.r, '-' + e.dealt, '#ffb46a');
        }
        if (CombatView.tview && CombatView.tview[e.d]) CombatView.tview[e.d].hp -= e.dealt;
      } else if (e.type === 'spell') {
        const sp = DATA.spells[e.spell];
        CombatView.banner((sp ? sp.name : e.spell), sp ? REALM_COLORS[sp.realm] : '#fff');
        Sfx.play('spell', { realm: sp && sp.realm });
        if (e.target) { CombatView.flash(e.target[0], e.target[1], sp ? REALM_COLORS[sp.realm] : '#fff', 500); CombatView.burst(e.target[0], e.target[1], [sp ? REALM_COLORS[sp.realm] : '#fff', '#ffffff'], 18, 'rise'); }
        await CombatView.sleep(320);
      } else if (e.type === 'fx') {
        const col = { fire: '#ff6a2a', lightning: '#9fd8ff', cold: '#bfe8ff', magic: '#ff9aff', doom: '#d02a2a', death: '#9a5ac8', holy: '#fff6c0', heal: '#7fffa0', stone: '#b0a890', chaos: '#ff4a2a', sorcery: '#6aa7ff', wall: '#c0b090', fizzle: '#888' }[e.fx] || '#fff';
        if (e.at) {
          CombatView.flash(e.at[0], e.at[1], col, 420);
          const kind = { fire: 'fire', chaos: 'fire', lightning: 'bolt', heal: 'rise', holy: 'rise', cold: 'snow', death: 'smoke', doom: 'smoke', stone: 'dust', wall: 'dust' }[e.fx] || 'spark';
          CombatView.burst(e.at[0], e.at[1], [col, '#ffffff'], kind === 'bolt' ? 6 : 16, kind);
        }
        Sfx.play({ fire: 'fire', chaos: 'fire', lightning: 'lightning', heal: 'heal', holy: 'heal', fizzle: 'bad' }[e.fx] || 'zap', { realm: { death: 'death', doom: 'death', sorcery: 'sorcery', magic: 'chaos', cold: 'sorcery', stone: 'nature' }[e.fx] });
        await CombatView.sleep(150);
      } else if (e.type === 'death') {
        const p = CombatView.pos[e.id]; Sfx.play('death');
        const dead = bt.units.find(x => x.id === e.id);
        if (p && dead && Anim.has(Sprites.lookOf(dead.u))) { p.act = { name: 'death', t0: performance.now() }; await CombatView.sleep(Anim.duration('death') + 250); }
        if (p) { CombatView.burst(p.c, p.r, ['#5a4a44', '#8a7a70'], 10, 'smoke'); const t0 = performance.now(); await new Promise(res => { const f = () => { const t = (performance.now() - t0) / 380; p.alpha = Math.max(0, 1 - t); if (t < 1) requestAnimationFrame(f); else res(); }; f(); }); }
      } else if (e.type === 'vanish') {
        // rappelée : la figurine s'efface sans mourir
        const p = CombatView.pos[e.id];
        if (p) { const t0 = performance.now(); await new Promise(res => { const f = () => { const t = (performance.now() - t0) / 420; p.alpha = Math.max(0, 1 - t); if (t < 1) requestAnimationFrame(f); else res(); }; f(); }); }
      } else if (e.type === 'towerFall') {
        const tv = CombatView.tview && CombatView.tview[e.id], p = CombatView.pos[e.id];
        if (tv) { tv.fallen = true; tv.hp = 0; }
        if (p) { CombatView.flash(p.c, p.r, '#c0b090', 500); CombatView.burst(p.c, p.r, ['#8d8a84', '#c0b090', '#5a544c'], 28, 'dust'); }
        Sfx.play('boulder');
        await CombatView.sleep(420);
      } else if (e.type === 'vortex') {
        const vp = CombatView.vpos[e.id] || (CombatView.vpos[e.id] = { c: e.c, r: e.r });
        Sfx.play('step');
        await CombatView.tween(vp, e.c, e.r, 90);
      } else if (e.type === 'summon') {
        const b = bt.units.find(x => x.id === e.id); Sfx.play('summon'); if (b) { CombatView.pos[e.id] = { c: b.c, r: b.r, alpha: 1 }; CombatView.flash(b.c, b.r, '#d0b0ff', 500); CombatView.burst(b.c, b.r, ['#d0b0ff', '#ffffff'], 20, 'rise'); }
        await CombatView.sleep(200);
      }
    }
    for (const t of bt.towers || []) { const tv = CombatView.tview && CombatView.tview[t.id]; if (tv) { tv.hp = t.hp; if (t.dead) tv.fallen = true; } }
    // positions synchronisées
    for (const b of bt.units) { const p = CombatView.pos[b.id] || (CombatView.pos[b.id] = { c: b.c, r: b.r, alpha: 1 }); if (!b.dead) { p.c = b.c; p.r = b.r; p.alpha = 1; } }
    CombatView.renderLog();
  },
  tween(p, c, r, ms) {
    return new Promise(res => {
      const c0 = p.c, r0 = p.r, t0 = performance.now(), dur = CombatView.auto ? CombatView.af(ms / 4, ms) : ms;
      const f = () => { const t = Math.min(1, (performance.now() - t0) / dur); p.c = c0 + (c - c0) * t; p.r = r0 + (r - r0) * t; if (t < 1) requestAnimationFrame(f); else res(); };
      f();
    });
  },
  // le projectile d'une unité qui tire : les archers décochent des flèches, les frondeurs lancent des pierres, les javeliniers des javelots,
  // les canons et navires de guerre des boulets, les catapultes et géants des rochers, les tours des flèches, les lanceurs de sorts des traits
  PROJ: { Slingers: 'stone', LizardJavelineers: 'javelin', SteamCannon: 'cannon', Warship: 'cannon', AirShip: 'cannon' },
  projStyle(sh, kind) {
    if (kind === 'magic') return 'bolt';
    const t = sh && sh.u ? sh.u.type : null;
    if (t && CombatView.PROJ[t]) return CombatView.PROJ[t];
    return kind === 'boulder' ? 'boulder' : 'arrow';
  },
  // le dessin du projectile (tools/build_fx.py) : flèches selon le peuple (elfes, peuples sombres, nains et hommes-insectes
  // aux carreaux), Lame de feu, javelots et lances, pierres, boulets, rochers des catapultes et des géants, traits de chaque royaume
  projSprite(sh, e, style) {
    const d = sh && sh.u ? DATA.units[sh.u.type] : null;
    if (e.kind === 'magic') return 'proj:magic_' + (REALMS5.includes(e.realm) ? e.realm : 'chaos');
    if (style === 'stone') return 'proj:stone';
    if (style === 'cannon') return 'proj:cannonball';
    if (style === 'javelin') return d && ['beastmen', 'gnoll'].includes(d.race) ? 'proj:spear_tribal' : 'proj:javelin';
    if (style === 'boulder') return d && d.race === 'fantastic' ? (d.realm === 'chaos' ? 'proj:boulder_fire' : 'proj:rock_giant') : 'proj:boulder';
    if (!d) return 'proj:bolt_crossbow';   // les tours de défense
    if (sh.u.ench.concat(sh.tempEnch || []).includes('flame_blade')) return 'proj:arrow_fire';
    if (d.race === 'highelf') return 'proj:arrow_elf';
    if (['orc', 'darkelf', 'beastmen', 'gnoll', 'troll'].includes(d.race)) return 'proj:arrow_dark';
    if (['dwarf', 'klackon'].includes(d.race)) return 'proj:bolt_crossbow';
    return 'proj:arrow';
  },
  // taille à l'écran de chaque projectile, en largeurs de case
  PROJ_SIZE: { arrow: .42, arrow_elf: .44, arrow_dark: .42, arrow_fire: .44, bolt_crossbow: .34, javelin: .56, spear_tribal: .58, ballista: .6, dagger: .3, axe: .28, stone: .11,
    boulder: .32, boulder_fire: .34, rock_giant: .4, cannonball: .16, magic_chaos: .62, magic_life: .62, magic_death: .62, magic_nature: .62, magic_sorcery: .62 },
  PROJ_SPIN: { axe: 14, stone: 9, boulder: 7, boulder_fire: 6, rock_giant: 5, cannonball: 9 },
  projectile(pa, pd, color, kind, style, n, sprite) {
    style = style || (kind === 'magic' ? 'bolt' : kind === 'boulder' ? 'boulder' : 'arrow'); n = n || 1;
    const TW = CombatView.TW, TH = CombatView.TH;
    const arc = { arrow: 46, javelin: 38, stone: 34, boulder: 70, cannon: 26, bolt: 18 }[style];
    const full = { boulder: 520, cannon: 300, bolt: 360 }[style] || 380, dur = CombatView.auto ? CombatView.af(90, full) : full;
    const gap = CombatView.auto ? CombatView.af(0, 45) : 45;
    // boulet : fumée à la bouche du canon
    if (style === 'cannon') CombatView.burst(pa.c, pa.r, ['#cfcac2', '#8d8a84', '#5a5550'], 10, 'smoke');
    for (let i = 0; i < n; i++) {
      // chaque figurine tire de sa place, vers un point un peu différent de la cible
      const jx = n > 1 ? (Math.random() - .5) * TW * .36 : 0, jy = n > 1 ? (Math.random() - .5) * TH * .3 : 0;
      const kx = n > 1 ? (Math.random() - .5) * TW * .3 : 0, ky = n > 1 ? (Math.random() - .5) * TH * .25 : 0;
      const trail = [];
      CombatView.anims.push({ t0: performance.now() + i * gap, dur, draw: (ctx, t) => {
        if (t < 0) return;
        const A = CombatView.stand(pa.c, pa.r), D = CombatView.stand(pd.c, pd.r);
        const at = u => [A.x + jx + (D.x + kx - A.x - jx) * u, A.y + jy + (D.y + ky - A.y - jy) * u - Math.sin(u * Math.PI) * arc - TH * .6];
        const [x, y] = at(t), [x2, y2] = at(Math.min(1, t + .02)), ang = Math.atan2(y2 - y, x2 - x);
        ctx.save();
        const k = Math.max(.8, TW / 72);   // tailles à l'échelle du champ de bataille (zoom compris)
        const sk = sprite && Fx.has(sprite) ? sprite.slice(5) : null;
        if (sk) {
          // le sprite pointe vers la droite : il suit la trajectoire ; pierres, rochers, boulets et haches tournoient
          const spin = CombatView.PROJ_SPIN[sk];
          Fx.draw(ctx, sprite, x, y, spin ? t * spin : ang, TW * (CombatView.PROJ_SIZE[sk] || .4));
        } else if (style === 'arrow' || style === 'javelin') {
          const L = TW * (style === 'javelin' ? .32 : .24);
          ctx.translate(x, y); ctx.rotate(ang); ctx.lineCap = 'round';
          // hampe : un liseré sombre sous le bois, pour la voir sur l'herbe
          ctx.strokeStyle = 'rgba(25,18,10,.75)'; ctx.lineWidth = (style === 'javelin' ? 3.6 : 2.6) * k;
          ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.stroke();
          ctx.strokeStyle = style === 'javelin' ? '#a07a4c' : '#d9bf8e'; ctx.lineWidth = (style === 'javelin' ? 2 : 1.3) * k;
          ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.stroke();
          // pointe de fer
          ctx.fillStyle = '#e6eaf0'; ctx.strokeStyle = 'rgba(30,30,36,.85)'; ctx.lineWidth = .9 * k;
          const hl = (style === 'javelin' ? 7 : 5) * k, hw = (style === 'javelin' ? 2.8 : 2.3) * k;
          ctx.beginPath(); ctx.moveTo(hl, 0); ctx.lineTo(0, -hw); ctx.lineTo(0, hw); ctx.closePath(); ctx.fill(); ctx.stroke();
          // empennage des flèches
          if (style === 'arrow') { const f = 3.2 * k; ctx.strokeStyle = '#fbf6ea'; ctx.lineWidth = 1.3 * k; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(-L - f, -f * .8); ctx.moveTo(-L, 0); ctx.lineTo(-L - f, f * .8); ctx.moveTo(-L + f * .7, 0); ctx.lineTo(-L - f * .3, -f * .8); ctx.moveTo(-L + f * .7, 0); ctx.lineTo(-L - f * .3, f * .8); ctx.stroke(); }
        } else if (style === 'stone' || style === 'boulder' || style === 'cannon') {
          const r = (style === 'stone' ? 2.8 : style === 'cannon' ? 5.5 : 8) * k;
          ctx.fillStyle = style === 'cannon' ? '#2c2c30' : style === 'stone' ? '#9c968c' : '#8d8a84';
          ctx.strokeStyle = 'rgba(20,18,16,.85)'; ctx.lineWidth = 1;
          ctx.translate(x, y); ctx.rotate(t * 9);
          ctx.beginPath();
          if (style === 'boulder') { for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (.82 + .18 * Math.sin(k * 2.3)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
          else ctx.arc(0, 0, r, 0, 7);
          ctx.fill(); ctx.stroke();
          if (style !== 'stone') { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(-r * .35, -r * .35, r * .35, 0, 7); ctx.fill(); }
        } else {
          // trait magique : une sphère lumineuse et sa traînée
          trail.push([x, y]); if (trail.length > 7) trail.shift();
          trail.forEach(([tx, ty], j) => { ctx.globalAlpha = (j + 1) / trail.length * .45; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(tx, ty, (2 + j * .45) * k, 0, 7); ctx.fill(); });
          ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.shadowColor = color; ctx.shadowBlur = 16 * k;
          ctx.beginPath(); ctx.arc(x, y, 3.4 * k, 0, 7); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 5.8 * k, 0, 7); ctx.globalAlpha = .55; ctx.fill();
        }
        ctx.restore();
      } });
    }
    return new Promise(res => setTimeout(() => {
      CombatView.flash(pd.c, pd.r, style === 'bolt' ? color : style === 'cannon' || style === 'boulder' ? '#c0b090' : '#ffe9c0', 260);
      if (style === 'boulder' || style === 'cannon') CombatView.burst(pd.c, pd.r, ['#8d8a84', '#c0b090', '#5a544c'], 10, 'dust');
      res();
    }, dur + (n - 1) * gap));
  },
  flash(c, r, color, dur) {
    CombatView.anims.push({ t0: performance.now(), dur: CombatView.auto ? CombatView.af(dur / 3, dur) : dur, draw: (ctx, t) => {
      const P = CombatView.iso(c, r); const TW = CombatView.TW;
      const g = ctx.createRadialGradient(P.x, P.y - CombatView.TH * .5, 2, P.x, P.y - CombatView.TH * .5, TW * (.3 + t * .4));
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1 - t; ctx.fillStyle = g; ctx.fillRect(P.x - TW, P.y - TW, TW * 2, TW * 2); ctx.globalAlpha = 1;
    } });
  },
  // particules : étincelles, flammes, fumée, flocons...
  burst(c, r, colors, n, kind) {
    const now = performance.now(), TW = CombatView.TW;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (kind === 'spark' ? 1.6 : kind === 'bolt' ? 0 : .5) * (.4 + Math.random());
      CombatView.parts.push({ c, r, t0: now + (kind === 'bolt' ? i * 40 : 0), life: kind === 'smoke' ? 900 : kind === 'bolt' ? 260 : 600 + Math.random() * 300,
        x: (Math.random() - .5) * TW * (kind === 'bolt' ? .1 : .4), y: -CombatView.TH * (.3 + Math.random() * .6), vx: Math.cos(a) * sp, vy: kind === 'rise' || kind === 'fire' || kind === 'smoke' ? -(.4 + Math.random() * .8) : kind === 'snow' || kind === 'dust' ? .25 + Math.random() * .3 : Math.sin(a) * sp - .8,
        g: kind === 'spark' ? .06 : 0, size: kind === 'smoke' ? 5 + Math.random() * 5 : kind === 'fire' ? 3 + Math.random() * 3 : 1.5 + Math.random() * 2, color: colors[i % colors.length], kind });
    }
  },
  drawParts(ctx, now) {
    CombatView.parts = CombatView.parts.filter(p => now - p.t0 < p.life);
    for (const p of CombatView.parts) {
      const age = now - p.t0; if (age < 0) continue;
      const t = age / p.life, f = age / 16;
      const P = CombatView.iso(p.c, p.r);
      if (p.kind === 'bolt') {
        // éclair : ligne brisée depuis le haut de l'écran
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 2.5; ctx.shadowColor = '#9fd8ff'; ctx.shadowBlur = 16;
        ctx.beginPath(); let x = P.x + p.x, y = P.y - 260; ctx.moveTo(x, y);
        while (y < P.y - 6) { y += 22 + Math.random() * 16; x += (Math.random() - .5) * 26; ctx.lineTo(x, Math.min(y, P.y - 6)); }
        ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; continue;
      }
      const x = P.x + p.x + p.vx * f, y = P.y + p.y + p.vy * f + p.g * f * f;
      ctx.globalAlpha = (1 - t) * (p.kind === 'smoke' ? .45 : 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(x, y, p.size * (p.kind === 'smoke' ? 1 + t : p.kind === 'fire' ? 1 - t * .6 : 1), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  float(c, r, text, color) { CombatView.floats.push({ c, r, text, color, t0: performance.now() }); },
  banner(text, color) {
    CombatView.anims.push({ t0: performance.now(), dur: CombatView.auto ? CombatView.af(300, 1100) : 1100, draw: (ctx, t) => {
      ctx.globalAlpha = t < .15 ? t / .15 : 1 - Math.max(0, (t - .7) / .3);
      ctx.font = '600 ' + Math.round(CombatView.TW * .32) + 'px Palatino Linotype, Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(text, innerWidth / 2 + 2, 122); ctx.fillStyle = color; ctx.fillText(text, innerWidth / 2, 120); ctx.globalAlpha = 1;
    } });
  },

  // ---------- déroulement ----------
  async advance() {
    const bt = CombatView.bt;
    CombatView.busy = true; CombatView.renderBar();
    await CombatView.playEvents();
    while (!bt.over) {
      // plus aucune unité (la tour du sorcier défend seule) et aucun sort à lancer : le tour passe de lui-même
      if (bt.side === CombatView.humanSide && !CombatView.auto && !bt.alive(bt.side).length && (bt.castThisRound[bt.side] || !CombatSpells.wizardOptions(bt, bt.side).some(o => !CombatView.targetWhy(bt, bt.side, o.id)))) {
        bt.endSide(); CombatView.refreshPanels(); await CombatView.playEvents(); continue;
      }
      if (bt.side === CombatView.humanSide && !CombatView.auto) {
        // tour du joueur : ses unités automatisées jouent d'abord (« Automatiser cette unité »), puis il a la main
        if (await CombatView.playAutoUnits()) { if (bt.over) break; }
        if (!bt.alive(bt.side).some(b => b.moves > 0 && !b.autoCtl) && bt.alive(bt.side).length) { bt.endSide(); CombatView.refreshPanels(); await CombatView.playEvents(); continue; }
        CombatView.busy = false;
        if (!CombatView.sel || CombatView.sel.dead || CombatView.sel.side !== bt.side || CombatView.sel.moves <= 0) CombatView.selectNext();
        CombatView.refreshPanels();
        return;
      }
      // IA (ou joueur en automatique)
      CombatView.reach = null;
      const side = bt.side;
      if (!(CombatView.auto && side === CombatView.humanSide) && CombatAI.tf(bt, side, 'flee') && CombatAI.hopeless(bt, side)) { bt.flee(side); await CombatView.playEvents(); break; }
      CombatAI.maybeCast(bt, side);
      if (CombatView.auto && bt.player(side) && bt.player(side).human) { /* le joueur en automatique ne lance pas de sorts */ }
      await CombatView.playEvents();
      const order = bt.alive(side).sort((a, b) => (bt.stats(b).ranged > 0) - (bt.stats(a).ranged > 0));
      const mineAuto = side === CombatView.humanSide, handBack = () => mineAuto && !CombatView.auto;   // « Reprendre la main » pendant le tour
      for (const b of order) {
        if (handBack()) break;
        let guard = 0;
        while (!bt.over && !b.dead && b.side === side && b.moves > 0 && guard++ < 20 && !handBack()) {
          if (!CombatAI.act(bt, b)) break;
          await CombatView.playEvents();
        }
        await CombatView.playEvents();
        if (bt.over) break;
      }
      if (handBack() && !bt.over) { CombatView.refreshPanels(); continue; }   // le reste du tour est au joueur
      if (!bt.over) bt.endSide();
      CombatView.refreshPanels();
      await CombatView.playEvents();
    }
    CombatView.finish();
  },
  selectNext() {
    const bt = CombatView.bt, prev = CombatView.sel;
    const ready = bt.alive(bt.side).filter(b => b.moves > 0 && !b.autoCtl);
    let cands = ready.filter(b => !b.waited);
    // tout le monde a déjà attendu : on refait le tour des unités, à partir de celle qui suit (attendre autant qu'on veut)
    if (!cands.length && ready.length) {
      for (const b of ready) b.waited = false;
      const i = ready.indexOf(prev);
      cands = i >= 0 && ready.length > 1 ? ready.slice(i + 1).concat(ready.slice(0, i)) : ready;
      if (prev && ready.length > 1) prev.waited = true;
    }
    CombatView.sel = cands[0] || null;
    if (CombatView.sel && CombatView.sel !== prev && bt.side === CombatView.humanSide && !CombatView.auto) CombatView.centerOn(CombatView.sel);
    CombatView.reach = CombatView.sel ? bt.reachable(CombatView.sel) : null;
    CombatView.refreshPanels();
  },
  async act(fn) {
    if (CombatView.busy) return;
    CombatView.busy = true;
    fn();
    await CombatView.playEvents();
    CombatView.busy = false;
    const bt = CombatView.bt;
    if (bt.over) return CombatView.finish();
    CombatView.wakeHolders();
    // l'automatique a été enclenché pendant l'animation : la bataille reprend seule
    if (CombatView.auto && bt.side === CombatView.humanSide) { CombatView.sel = null; CombatView.reach = null; return CombatView.advance(); }
    if (CombatView.sel && (CombatView.sel.dead || CombatView.sel.moves <= 0)) CombatView.selectNext();
    else if (CombatView.sel) CombatView.reach = bt.reachable(CombatView.sel);
    CombatView.refreshPanels();
    // plus personne à bouger : le tour passe de lui-même (un sort se lance avant d'agir avec la dernière unité)
    if (!bt.alive(bt.side).some(b => b.moves > 0 && !b.autoCtl)) CombatView.endTurn();
  },
  endTurn() {
    const bt = CombatView.bt; if (CombatView.busy || bt.over) return;
    for (const b of bt.alive(bt.side)) b.waited = false;
    bt.endSide();
    CombatView.sel = null; CombatView.reach = null; CombatView.mode = null;
    CombatView.advance();
  },
  finish() {
    if (CombatView.finished) return;
    CombatView.finished = true;
    const bt = CombatView.bt;
    const won = bt.winner === CombatView.humanSide;
    const canReplay = CombatView.autoStart && !CombatView.replayed && CombatView.snap;
    setTimeout(async () => {
      // toute bataille gagnée (automatique ou commandée) : proposer de relever les morts, s'il reste de quoi lancer le sort
      if (won) await CombatView.offerRaise();
      // toutes vos unités sont tombées : une dernière chance, relever un mort et continuer la bataille
      if (!won && bt.fled !== CombatView.humanSide && !bt.alive(CombatView.humanSide).length && await CombatView.offerRaise(true)) {
        bt.over = false; bt.winner = null; CombatView.finished = false; CombatView.busy = false;
        CombatView.refreshPanels(); CombatView.advance(); return;
      }
      // les régénérants du camp vainqueur se relèvent après la bataille : ce ne sont pas des pertes
      const back = b => bt.winner === b.side && !b.possessed && !(b.irrDmg > 0) && !!bt.stats(b).ab.regeneration;
      const side0 = b => b.origSide != null ? b.origSide : b.side;   // une unité possédée puis tuée reste une perte de son premier camp
      // perdues sans mourir : asservies (elles disparaissent avec le combat), ou tombées puis relevées par l'autre camp
      const taken = bt.units.filter(b => !b.dead && !b.temp && ((b.bound && b.origSide != null) || (b.raisedFrom != null && b.raisedFrom !== b.side)));
      const from = b => b.bound ? b.origSide : b.raisedFrom;
      const lostB = bt.dead.filter(b => side0(b) === CombatView.humanSide && !b.temp && !back(b)).concat(taken.filter(b => from(b) === CombatView.humanSide)),
        killedB = bt.dead.filter(b => side0(b) !== CombatView.humanSide && !b.temp && !back(b)).concat(taken.filter(b => from(b) !== CombatView.humanSide));
      const lost = lostB.length, killed = killedB.length;
      // les unités, nommées (regroupées : « Lanciers hauts-elfes ×2 »)
      const names = list => { if (!list.length) return ''; const n = new Map(); for (const b of list) { const k = Units.label(b.u); n.set(k, (n.get(k) || 0) + 1); } return ' <span class="dim">(' + [...n].map(([k, c]) => U.esc(k) + (c > 1 ? ' ×' + c : '')).join(', ') + ')</span>'; };
      if (!Music.jingle(won ? 'victory' : 'defeat')) Sfx.play(won ? 'victory' : 'defeat');
      const opts = canReplay ? [{ label: 'Rejouer manuellement', value: 'replay' }, { label: 'Accepter le résultat', value: true, primary: true }] : [{ label: 'Continuer', value: true, primary: true }];
      UI.choice(won ? 'Victoire !' : 'Défaite', '<p class="serif" style="font-size:17px">' + (won ? (bt.fled === 1 - CombatView.humanSide ? 'L\'ennemi bat en retraite.' : 'Le champ de bataille vous appartient.') : bt.fled === CombatView.humanSide ? 'Vos troupes ont battu en retraite.' : 'Vos forces ont été repoussées.') + '</p><p>Ennemis ' + (taken.some(b => from(b) !== CombatView.humanSide) ? 'anéantis ou pris' : 'anéantis') + ' : <b>' + killed + '</b>' + names(killedB) + '<br>Pertes : <b>' + lost + '</b>' + names(lostB) + '</p>' + CombatView.xpReport(bt)
        + (canReplay ? '<p class="dim">Bataille résolue automatiquement : acceptez ce résultat, ou rejouez-la vous-même depuis le début, sur le même terrain, avec les mêmes troupes et le même mana. Le résultat rejoué sera définitif.</p>' : ''), opts, { noClose: true })
        .then(v => v === 'replay' ? CombatView.replay() : CombatView.close());
    }, 350);
  },
  // l'expérience que la bataille va rapporter à vos survivants (Battle.xpGains, celle qu'applique Game.applyBattle) et les promotions
  xpReport(bt) {
    const game = App.game, side = CombatView.humanSide;
    const xg = bt.xpGains(), mine = xg.units.filter(g => g.b.side === side);
    if (!mine.length) return '';
    const r = xg.ratio[side];
    const how = r < 0.3 ? 'combat facile' : r < 0.7 ? 'combat à votre avantage' : r < 1.4 ? 'combat serré' : r < 2.2 ? 'combat rude' : 'combat désespéré';
    const groups = new Map(), ups = [];
    for (const g of mine) {
      if (!groups.has(g.n)) groups.set(g.n, []);
      groups.get(g.n).push(g);
      const L0 = Units.levelInfo(game, g.b.u), L1 = Units.levelInfo(game, Object.assign({}, g.b.u, { xp: (g.b.u.xp || 0) + g.n }));
      if (L0 && L1 && L1.name !== L0.name) ups.push('<b>' + U.esc(bt.name(g.b)) + '</b> : ' + U.esc(L0.name) + ' → <b class="gold">' + U.esc(L1.name) + '</b>');
    }
    const parts = [...groups.keys()].sort((x, y) => y - x).map(n => {
      const gs = groups.get(n);
      const who = gs.length > 4 ? gs.length + ' unités' : gs.map(g => U.esc(bt.name(g.b)) + (g.kills ? ' (' + U.n(g.kills, 'ennemi abattu', 'ennemis abattus') + ')' : '')).join(', ');
      return '<b>+' + n + '</b> ' + who;
    });
    return '<p>Expérience, ' + how + ' : ' + parts.join(' · ') + '.</p>' + (ups.length ? '<p>Promotion' + (ups.length > 1 ? 's' : '') + ' : ' + ups.join(' · ') + '</p>' : '');
  },
  // relever les morts hors du cours normal de la bataille : après une victoire automatique (autant que la compétence le
  // permet), ou quand toutes vos unités sont tombées (lastStand : un seul, et la bataille reprend). Renvoie vrai si lancé.
  async offerRaise(lastStand) {
    const bt = CombatView.bt, game = App.game, side = CombatView.humanSide, pl = bt.player(side), id = 'raise_dead';
    if (!pl || !pl.known.includes(id) || pl.banished) return false;
    let raised = false;
    for (let k = 0; k < (lastStand ? 1 : 9); k++) {
      // la bataille est finie : peu importe que la case du mort soit occupée, on le relève à côté
      // mêmes règles que le sort en combat : ni rappelé, ni mort pour de bon (dégâts irréversibles), neuf par camp au plus
      const dead = bt.alive(side).length >= 9 ? [] : bt.dead.filter(b => !b.temp && !b.recalled && !(b.irrDmg > 0) && b.side === side && Units.isNormal(b.u) && !b.u.hero);
      const base = Magic.spellCost(game, pl, id, true), cost = Math.max(1, Math.ceil(base * Magic.distanceMult(game, pl, bt.plane, bt.x, bt.y)));
      if (!dead.length || base > bt.skillLeft[side] || cost > pl.mana) return raised;
      const html = (lastStand ? '<p>Toutes vos unités sont tombées.</p>' : '') + '<p>Tombés au combat : ' + U.esc(dead.map(b => bt.name(b)).join(', ')) + '.</p><p>' + DATA.spells[id].name + ' : <b class="mana">' + cost + ' mana</b> <span class="dim">(compétence ' + bt.skillLeft[side] + ', mana ' + pl.mana + ')</span></p>';
      const opts = dead.slice(0, 6).map(b => ({ label: 'Relever : ' + bt.name(b), value: b.id })).concat([{ label: lastStand ? 'Accepter la défaite' : 'Laisser', value: null }]);
      opts[0].primary = true;
      const v = await UI.choice(DATA.spells[id].name, html, opts, { noClose: true });
      const t = v == null ? null : dead.find(b => b.id === v);
      if (!t) return raised;
      if (bt.unitAt(t.c, t.r)) {
        let best = null;
        for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) if (!bt.unitAt(c, r) && (!best || Math.hypot(c - t.c, r - t.r) < Math.hypot(best[0] - t.c, best[1] - t.r))) best = [c, r];
        if (best) { t.c = best[0]; t.r = best[1]; }
      }
      CombatSpells.cast(bt, side, id, t);
      raised = !t.dead;
      await CombatView.playEvents(); CombatView.refreshPanels();
    }
    return raised;
  },
  // état de départ : unités engagées, mana des sorciers, unités présentes, terrain
  snapshot(game, bt) {
    return {
      units: bt.units.map(b => ({ obj: b.u, data: JSON.stringify(b.u) })),
      ids: new Set(Object.keys(game.units)),
      players: bt.pids.map(pid => game.players[pid]).filter(Boolean).map(pl => ({ pl, mana: pl.mana, spent: pl.manaSpentCombat || 0 })),
      layout: JSON.parse(JSON.stringify({ props: bt.props, hills: bt.hills, river: bt.river, ford: bt.ford, mud: bt.mud })),
    };
  },
  restore(game, s) {
    for (const { obj, data } of s.units) {
      for (const k of Object.keys(obj)) delete obj[k];
      Object.assign(obj, JSON.parse(data));
      game.units[obj.id] = obj;
    }
    for (const id of Object.keys(game.units)) if (!s.ids.has(id)) delete game.units[id];
    for (const p of s.players) { p.pl.mana = p.mana; p.pl.manaSpentCombat = p.spent; }
  },
  // la résolution automatique est refusée : retour au début, et le joueur commande
  replay() {
    const game = App.game, old = CombatView.bt;
    CombatView.restore(game, CombatView.snap);
    const bt = new Battle(game, Object.assign({}, old.opts, { layout: CombatView.snap.layout }));
    CombatView.bt = bt; CombatView.replayed = true; CombatView.autoStart = false; CombatView.finished = false;
    CombatView.auto = false; CombatView.mode = null; CombatView.sel = null; CombatView.reach = null; CombatView.busy = false;
    CombatView.anims = []; CombatView.floats = []; CombatView.parts = []; CombatView.vpos = {}; CombatView.evIdx = 0; CombatView.pos = {};
    for (const b of bt.units) CombatView.pos[b.id] = { c: b.c, r: b.r, alpha: 1 };
    CombatView.initTowers(bt);
    CombatView.layout(); CombatView.prerenderGround();
    CombatView.refreshPanels();
    UI.toast('La bataille reprend depuis le début : à vous de commander.');
    CombatView.advance();
  },
  close() {
    window.removeEventListener('mouseup', CombatView.mouseUp); CombatView.drag = null;
    CombatView.active = false; CombatView.finished = false; Sfx.quietUntil = performance.now() + 1500;
    window.removeEventListener('keydown', CombatView.keyH); window.removeEventListener('keyup', CombatView.keyUpH); CombatView.alt = false;
    $('#combat-root').hidden = true; $('#combat-root').innerHTML = '';
    UI.hideTip();
    const r = CombatView.resolve; CombatView.resolve = null;
    CombatView.snap = null;
    if (r) r(CombatView.bt);
  },

  // ---------- saisie ----------
  onMove(e) {
    CombatView.alt = !!e.ctrlKey;
    const t = CombatView.pick(e.clientX, e.clientY);
    CombatView.hover = t;
    const bt = CombatView.bt;
    const u = t ? bt.unitAt(t.c, t.r) : null;
    const right = $('#c-right');
    const tw = t && !u ? (bt.towers || []).find(x => x.c === t.c && x.r === t.r) : null;
    if (tw) {
      right.innerHTML = CombatView.towerPanel(tw); right.style.display = '';
      CombatView.cv.style.cursor = CombatView.cursorFor(t);
      return;
    }
    const notes = t && bt.terrainNotes ? bt.terrainNotes(t.c, t.r) : [];
    const terr = notes.length ? '<div style="margin-top:6px">' + notes.map(n => '<div class="gold" style="font-size:12px">' + U.esc(n) + '</div>').join('') + '</div>' : '';
    // relever un mort : les corps de la case, ceux que le sort peut relever en tête
    const m = CombatView.mode, deadHere = t && m && m.tt === 'deadUnit' ? CombatSpells.validTargets(bt, CombatView.humanSide, m.id).filter(b => b.c === t.c && b.r === t.r) : [];
    if (deadHere.length) { right.innerHTML = '<h4>' + U.esc(DATA.spells[m.id] ? DATA.spells[m.id].name : m.id) + '</h4>' + deadHere.map(b => '<div>' + U.esc(bt.name(b)) + ' <span class="dim">(' + (b.side === CombatView.humanSide ? 'tombé dans vos rangs' : 'ennemi tombé') + ')</span></div>').join('') + (deadHere.length > 1 ? '<div class="dim" style="font-size:11.5px">Plusieurs corps ici : vous choisirez lequel relever.</div>' : '') + terr; right.style.display = ''; }
    else if (u) { right.innerHTML = CombatView.oddsHtml(u) + CombatView.unitPanel(u) + terr; right.style.display = ''; }
    else if (terr) { right.innerHTML = '<h4>Terrain</h4>' + terr; right.style.display = ''; }
    else right.style.display = 'none';
    CombatView.cv.style.cursor = CombatView.cursorFor(t);
  },
  // Ctrl enfoncé ou relâché : l'autre façon d'attaquer (le curseur suit tout de suite)
  setAlt(v) { if (CombatView.alt === v) return; CombatView.alt = v; if (CombatView.hover && CombatView.cv) CombatView.cv.style.cursor = CombatView.cursorFor(CombatView.hover); },
  onClick(e) {
    CombatView.alt = !!e.ctrlKey;
    const bt = CombatView.bt;
    if (CombatView.busy || bt.over || bt.side !== CombatView.humanSide || CombatView.auto) return;
    const t = CombatView.pick(e.clientX, e.clientY); if (!t) return;
    if (e.button === 2) { CombatView.mode = null; return; }
    const u = bt.unitAt(t.c, t.r);
    if (CombatView.mode && CombatView.useTarget(t, u)) return;
    const sel = CombatView.sel;
    if (u && u.side === CombatView.humanSide) { CombatView.sel = u; CombatView.reach = bt.reachable(u); CombatView.refreshPanels(); return; }
    if (!sel) return;
    const gate = bt.gateAt(t.c, t.r);
    const tw = !u ? bt.towerAt(t.c, t.r) || gate : u && u.side !== sel.side && gate && !bt.canMelee(sel, u) && !bt.canShoot(sel, u) && bt.canMeleeTower(sel, gate) ? gate : null;
    if (tw && tw.side !== sel.side) {
      if (bt.canMeleeTower(sel, tw)) return CombatView.act(() => bt.meleeTower(sel, tw));
      if (bt.canShootTower(sel, tw)) return CombatView.act(() => bt.shootTower(sel, tw));
      if (tw.kind === 'stone' && !bt.breaksTowers(sel)) { UI.toast('Seuls des sorts, les briseurs de murs et les créatures colossales abattent une tour.', 'warn'); return; }
      // s'approcher puis frapper
      const best = CombatView.approachTile(sel, tw, true);
      if (best) return CombatView.act(() => { bt.moveUnit(sel, best.c, best.r); if (bt.canMeleeTower(sel, tw)) bt.meleeTower(sel, tw); });
      UI.toast(U.cap(bt.towerName(tw)) + ' est hors de portée.', 'warn');
      return;
    }
    // un briseur de murs sur un pan de muraille voisin : il le bat
    if (!u && bt.canBreach(sel, t.c, t.r)) return CombatView.act(() => bt.breachWall(sel, t.c, t.r));
    if (u && u.side !== sel.side && bt.stats(sel).ab.siegeOnly) { UI.toast('Un engin de siège ne s\'en prend qu\'aux tours.', 'warn'); return; }
    if (u && u.side !== sel.side) {
      if (bt.canMelee(sel, u)) return CombatView.act(() => bt.melee(sel, u));
      if (bt.canShoot(sel, u) && CombatView.attackKind(sel, u) === 'ranged') return CombatView.act(() => bt.shoot(sel, u));
      if (bt.outOfReach(sel, u)) { UI.toast('Hors d\'atteinte : cette unité vole.', 'warn'); return; }
      // s'approcher puis frapper
      const best = CombatView.approachTile(sel, u);
      if (best) return CombatView.act(() => { bt.moveUnit(sel, best.c, best.r); if (sel.moves > 0 && bt.canMelee(sel, u)) bt.melee(sel, u); });
      UI.toast('Cible hors de portée.', 'warn');
      return;
    }
    if (!u) { const reach = bt.reachable(sel); if (reach.has(t.c + ',' + t.r)) CombatView.act(() => bt.moveUnit(sel, t.c, t.r)); }
  },
  onKey(e) {
    if (!CombatView.active) return;
    const k = e.key.toLowerCase();
    if (UI.modals.length) return;
    if (e.key === 'Escape') { CombatView.mode = null; return; }
    if (CombatView.mode && CombatView.mode.maxExtra && ['+', '=', '-', '_'].includes(e.key)) { const st = CombatSpells.EXTRA_STEP[CombatView.mode.id] || 1; CombatView.setPower((CombatView.mode.extra || 0) + (e.key === '+' || e.key === '=' ? st : -st)); return; }
    if (e.key === '0') { CombatView._panId = (CombatView._panId || 0) + 1; CombatView.zoom = 1; CombatView.focus = null; CombatView.layout(); return; }
    if (k === 'c') { if (CombatView.sel && !CombatView.sel.dead) CombatView.centerOn(CombatView.sel); return; }
    if (e.key === 'Enter') CombatView.endTurn();
    else if (k === 'w' && CombatView.sel) { CombatView.sel.waited = true; CombatView.selectNext(); }
    else if (k === 'd' && CombatView.sel) CombatView.guard();
    else if (k === 'g' && CombatView.sel && CombatView.bt.hasWalls && !CombatView.bt.breached()) CombatView.holdBreach();
    else if (k === 's') CombatView.spellMenu();
    else if (k === 'a') CombatView.toggleAuto();
    else if (k === 'u') CombatView.toggleUnitAuto();
  },
  // se mettre en garde (D) : l'unité passe son tour ; un fantassin qui n'a pas frappé gagne +1 en défense
  guard() {
    const bt = CombatView.bt, b = CombatView.sel;
    if (!b || b.dead || CombatView.busy || bt.side !== CombatView.humanSide || b.side !== CombatView.humanSide) return;
    CombatView.act(() => bt.guard(b));
  },
  // garder jusqu'à la brèche (ou lever la garde) : l'unité sélectionnée ne demande plus d'ordre tant que la muraille tient
  holdBreach() {
    const bt = CombatView.bt, b = CombatView.sel;
    if (!b || b.dead || CombatView.busy || bt.side !== CombatView.humanSide || b.side !== CombatView.humanSide) return;
    if (b.holdBreach) {
      b.holdBreach = false;
      if (b.holdSkipped) { b.moves = b.maxMoves; b.holdSkipped = false; b.guarding = false; CombatView.reach = bt.reachable(b); }
      CombatView.refreshPanels(); return;
    }
    b.holdBreach = true;
    if (b.moves >= b.maxMoves) b.holdSkipped = true;
    bt.guard(b);
    UI.toast(U.cap(bt.name(b)) + ' garde sa position jusqu\'à ce que la muraille soit percée.', '', 'hold');
    CombatView.act(() => { });
  },
  // la muraille est tombée pendant votre tour : les unités en garde reprennent le combat aussitôt
  wakeHolders() {
    const bt = CombatView.bt, side = CombatView.humanSide;
    if (!bt || !bt.breached()) return;
    const woke = bt.alive(side).filter(b => b.holdBreach); if (!woke.length) return;
    for (const b of woke) { b.holdBreach = false; if (b.holdSkipped && bt.side === side) { b.moves = b.maxMoves; b.holdSkipped = false; b.guarding = false; } }
    UI.toast('Brèche ouverte ! ' + (woke.length > 1 ? woke.length + ' unités en garde reprennent' : U.cap(bt.name(woke[0])) + ' reprend') + ' le combat.', '', 'hold');
  },
  // Résolution automatique choisie au début : sans retour (on ne la regarde pas tourner pour reprendre la main quand elle tourne mal).
  // Automatiser en cours de bataille : « Reprendre la main » (A) à tout moment, même pendant l'animation
  toggleAuto() {
    if (CombatView.auto && CombatView.autoStart) return;
    if (CombatView.auto) {
      CombatView.auto = false;
      UI.toast('Vous reprenez la main' + (CombatView.bt && CombatView.bt.side === CombatView.humanSide ? '' : ' : ce sera à vous au prochain tour') + '.', '', 'auto');
      CombatView.renderBar();
      if (!CombatView.busy && CombatView.bt && CombatView.bt.side === CombatView.humanSide) { CombatView.selectNext(); CombatView.refreshPanels(); }
      return;
    }
    CombatView.auto = true;
    // l'automatique commande tout le monde : plus personne en garde
    if (CombatView.auto && CombatView.bt) for (const b of CombatView.bt.alive(CombatView.humanSide)) if (b.holdBreach) { b.holdBreach = false; if (b.holdSkipped && CombatView.bt.side === CombatView.humanSide) b.moves = b.maxMoves; b.holdSkipped = false; }
    CombatView.renderBar();
    if (CombatView.auto && !CombatView.busy && CombatView.bt.side === CombatView.humanSide) { CombatView.sel = null; CombatView.reach = null; CombatView.advance(); }
  },

  // « Automatiser cette unité » (U) : elle joue seule à chaque tour ; la sélectionner puis U la rend au joueur
  async toggleUnitAuto() {
    const bt = CombatView.bt, b = CombatView.sel;
    if (!b || b.dead || b.side !== CombatView.humanSide || CombatView.auto || CombatView.busy) return;
    b.autoCtl = !b.autoCtl;
    UI.toast(U.cap(bt.name(b)) + (b.autoCtl ? ' joue seule désormais (sélectionnez-la puis U pour la reprendre).' : ' attend de nouveau vos ordres.'), '', 'unitauto');
    if (b.autoCtl && bt.side === CombatView.humanSide && b.moves > 0) {
      await CombatView.playAutoUnits();
      if (bt.over) return CombatView.finish();
      CombatView.busy = false;
      if (!bt.alive(bt.side).some(o => o.moves > 0 && !o.autoCtl)) return CombatView.endTurn();
    }
    CombatView.selectNext(); CombatView.renderBar(); CombatView.refreshPanels();
  },
  // les unités automatisées du joueur jouent leur tour (true si l'une a joué)
  async playAutoUnits() {
    const bt = CombatView.bt, side = CombatView.humanSide;
    const autos = bt.alive(side).filter(b => b.autoCtl && b.moves > 0);
    if (!autos.length || bt.side !== side) return false;
    CombatView.busy = true; CombatView.renderBar();
    for (const b of autos) {
      let guard = 0;
      while (!bt.over && !b.dead && b.autoCtl && b.moves > 0 && guard++ < 20) { if (!CombatAI.act(bt, b)) break; await CombatView.playEvents(); }
      await CombatView.playEvents();
      if (bt.over) break;
    }
    return true;
  },

  // ---------- sorts ----------
  spellMenu() {
    const bt = CombatView.bt; if (CombatView.busy || bt.side !== CombatView.humanSide) return;
    const side = CombatView.humanSide, pl = bt.player(side), game = App.game;
    const list = h('div', { class: 'list scroll', style: 'max-height:60vh' });
    const m = UI.modal({ title: 'Sorts de combat', width: 640, body: list });
    const mult = pl ? Magic.distanceMult(game, pl, bt.plane, bt.x, bt.y) : 1;
    list.append(h('div', { class: 'muted' }, pl ? 'Compétence restante : ' + bt.skillLeft[side] + ' · mana : ' + pl.mana + ' · distance à la forteresse ×' + String(mult).replace('.', ',') + (game.cities[pl.fortress] && game.cities[pl.fortress].buildings.magicRelay && mult > 1 ? ' (Relais de magie)' : '') : ''));
    if (bt.castThisRound[side]) list.append(h('div', { class: 'danger' }, 'Vous avez déjà lancé un sort ce tour-ci.'));
    if (bt.nodeRealm) list.append(h('div', { class: pl && pl.retorts.includes('nodeMastery') ? 'ok' : 'gold' }, pl && pl.retorts.includes('nodeMastery') ? 'Combat sur un nœud : votre Maîtrise des nœuds protège vos sorts de son flux.' : 'Combat sur un nœud de ' + REALM_NAMES[bt.nodeRealm].toLowerCase() + ' : les sorts des autres royaumes risquent de s\'y dissiper (le risque est indiqué sous chacun).'));
    const fizz = (id, extra) => { const f = CombatSpells.nodeFizzle(bt, side, id, extra); return f > 0 ? h('div', { class: 'danger', style: 'font-size:11px' }, 'Flux du nœud : ' + Math.round(f * 100) + ' % de risque de dissipation') : null; };
    const opts = CombatSpells.wizardOptions(bt, side);
    const known = pl ? pl.known.filter(id => DATA.spells[id] && DATA.spells[id].combat && CombatSpells.implemented(id)) : [];
    for (const id of known) {
      const tw = CombatView.targetWhy(bt, side, id), noTarget = !!tw;
      const o = noTarget ? null : opts.find(x => x.id === id); const s = DATA.spells[id];
      const why = o ? null : CombatView.whyNot(bt, side, id);
      const cost = Math.ceil(Magic.spellCost(game, pl, id, true) * mult);
      const row = h('div', { class: 'row' + (o ? '' : ' dis') }, spriteCanvas('spell:' + id, 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, h('span', { class: 'realmdot', style: 'color:' + REALM_COLORS[s.realm] }), s.name), h('div', { class: 't2' }, s.desc), noTarget ? h('div', { class: 'dim', style: 'font-size:11px' }, tw) : null, fizz(id)), h('div', { class: 'mana', style: 'white-space:nowrap' }, cost + ' mana'));
      UI.tipOn(row, () => (why ? '<div class="danger" style="margin-bottom:6px;font-weight:600">' + U.esc(why) + '</div>' : '') + UI.spellTip(id, pl, game));
      if (o) row.onclick = () => { m.close(); CombatView.prepareCast(id, null); };
      list.append(row);
    }
    // capacités de l'unité sélectionnée
    const sel = CombatView.sel;
    if (sel && sel.moves > 0) {
      const us = bt.unitSpells(sel, true);
      if (us.length) list.append(h('h4', { style: 'margin-top:8px;font-size:13px;color:var(--gold)' }, 'Capacités de ' + Units.label(sel.u)));
      for (const o of us) {
        const s = DATA.spells[o.id] || { name: o.id === 'summon_demons' ? 'Invocation de démons' : o.id, desc: o.id === 'summon_demons' ? 'Fait surgir des démons qui combattent à vos côtés jusqu\'à la fin de la bataille.' : '', realm: 'death' };
        const why = CombatView.unitWhy(bt, side, sel, o);
        const tag = !why ? null : o.used ? 'Déjà utilisée' : o.short ? 'Mana insuffisant' : CombatSpells.alreadyActive(bt, side, o.id) ? 'Déjà actif' : 'Aucune cible';
        const row = h('div', { class: 'row' + (why ? ' dis' : '') }, spriteCanvas('spell:' + o.id, 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, h('span', { class: 'realmdot', style: 'color:' + REALM_COLORS[s.realm] }), s.name), s.desc ? h('div', { class: 't2' }, s.desc) : null, tag ? h('div', { class: 'dim', style: 'font-size:11px' }, tag) : null, why ? null : fizz(o.id)), h('div', { class: 'mana', style: 'white-space:nowrap;text-align:right' }, o.free ? 'Une fois' : o.cost + ' mana', o.free ? null : h('div', { class: 'dim', style: 'font-size:11px' }, 'reste ' + sel.casterMana)));
        UI.tipOn(row, () => (why ? '<div class="danger" style="margin-bottom:6px;font-weight:600">' + U.esc(why) + '</div>' : '') + (DATA.spells[o.id] ? UI.spellTip(o.id, pl, game) : U.esc(s.desc)));
        if (!why) row.onclick = () => { m.close(); CombatView.prepareCast(o.id, sel); };
        list.append(row);
      }
    }
    if (!known.length && !(sel && bt.unitSpells(sel, true).length)) list.append(h('div', { class: 'dim' }, 'Aucun sort de combat disponible.'));
  },
  // le sort ne servirait à rien ici : déjà actif, ou aucune cible possible
  targetWhy(bt, side, id) {
    const sp = DATA.spells[id] || { params: {} }, p = sp.params || {};
    if (CombatSpells.alreadyActive(bt, side, id)) return 'Déjà actif sur ce champ de bataille.';
    if (p.siege && !CombatSpells.siegeUseful(bt, side, id)) return 'Aucune tour ennemie sur laquelle agir ici.';
    const uw = CombatSpells.uselessWhy(bt, side, id); if (uw) return uw;
    if ((sp.kind === 'summon' || ['raise_dead', 'animate_dead'].includes(id)) && bt.alive(side).length >= 9) return 'Vous avez déjà 9 unités sur le terrain.';
    const tt = CombatSpells.targetType(id);
    if (id === 'disrupt' && !(bt.hasWalls && side === ATT_SIDE && (Object.values(bt.walls).some(w => !w.broken && !w.gate) || bt.enemyTowers(side).some(t => t.kind === 'stone' || t.kind === 'gate')))) return 'Aucune muraille ni tour à abattre ici.';
    if (tt === 'none' || tt === 'combatTile' || CombatSpells.validTargets(bt, side, id).length) return null;
    const R = { chaos: 'du chaos', death: 'de la mort', life: 'de la vie', nature: 'de la nature', sorcery: 'de la sorcellerie' };
    const where = tt === 'enemyUnit' ? 'parmi vos ennemis' : tt === 'friendlyUnit' ? 'dans vos rangs' : 'sur le champ de bataille';
    if (tt === 'deadUnit') return id === 'animate_dead' ? 'Aucun mort ne peut être relevé (héros, rappelés ou morts irréversibles).'
      : bt.dead.some(b => b.side === side && !b.temp && !b.u.hero && Units.isNormal(b.u)) ? 'Vos morts ne peuvent pas être relevés : leurs dégâts sont irréversibles (pétrification, désintégration…).' : 'Aucune de vos unités normales n\'est tombée dans cette bataille.';
    if (id === 'healing' || id === 'mass_healing') return CombatSpells.healWhy(bt, side);
    if (p.onlyRealms) return 'Ne touche que les ' + (p.targets && p.targets.length ? 'créatures ou morts-vivants' : p.fantasticOnly ? 'créatures' : 'unités') + ' ' + p.onlyRealms.map(r => R[r] || r).join(' ou ') + ' : il n\'y en a ' + (p.targets && p.targets.length ? 'aucun ' : 'aucune ') + where + '.';
    // l'ennemi a la bonne nature, mais tous le subissent déjà (Bris), ou ont subi les trois mutations (Déformation)
    if (tt === 'enemyUnit' && p.normalOnly && bt.alive(1 - side).some(b => Units.isNormal(b.u) && !bt.isInvisible(b))) return id === 'warp_creature' ? 'Les unités ennemies visibles ont déjà subi les trois mutations, ou y sont insensibles.' : 'Toutes les unités ennemies visibles le subissent déjà, ou y sont insensibles.';
    if (p.normalOnly) return 'Ne touche que les unités normales : il n\'y en a aucune ' + where + '.';
    if (p.fantasticOnly) return 'Ne touche que les créatures fantastiques : il n\'y en a aucune ' + where + '.';
    if (sp.kind === 'unitEnchant') return 'Toutes vos unités qui peuvent en bénéficier l\'ont déjà.';
    if (tt === 'enemyUnit') return 'Aucun ennemi ne peut être visé : invisibles, ou insensibles à ce sort.';
    return 'Aucune cible possible pour l\'instant.';
  },
  unitWhy(bt, side, b, o) {
    if (o.used) return 'Déjà utilisée dans ce combat.';
    if (o.short) return 'Mana de l\'unité insuffisant : ' + b.casterMana + ' sur ' + o.cost + '.';
    return CombatView.targetWhy(bt, side, o.id);
  },
  // pourquoi un sort ne peut pas être lancé maintenant (affiché au survol de la ligne grisée)
  whyNot(bt, side, id) {
    const pl = bt.player(side), game = App.game;
    if (!pl) return null;
    const tw = CombatView.targetWhy(bt, side, id); if (tw) return tw;
    if (bt.side !== side) return 'Ce n\'est pas votre tour.';
    if (bt.castThisRound[side]) return 'Vous avez déjà lancé un sort ce tour-ci.';
    const base = Magic.spellCost(game, pl, id, true), cost = Math.max(1, Math.ceil(base * Magic.distanceMult(game, pl, bt.plane, bt.x, bt.y)));
    if (base > bt.skillLeft[side]) return 'Compétence insuffisante : il vous en reste ' + bt.skillLeft[side] + ', il en faut ' + base + '.';
    if (cost > pl.mana) return 'Mana insuffisant : ' + pl.mana + ' sur ' + cost + '.';
    return null;
  },
  prepareCast(id, caster) {
    const bt = CombatView.bt;
    const tt = CombatSpells.targetType(id), maxExtra = CombatSpells.maxExtra(bt, CombatView.humanSide, id, caster);
    if (tt === 'none') {
      if (!maxExtra) return CombatView.act(() => CombatSpells.cast(bt, CombatView.humanSide, id, null, caster, 0));
      return CombatView.powerDialog(id, caster, maxExtra);
    }
    CombatView.mode = { id, caster, tt, extra: 0, maxExtra };
    const zr = CombatView.ZONES[id] && CombatView.ZONES[id].r * 2 + 1;
    if (zr) return UI.toast(CombatView.ZONES[id].reach ? 'Choisissez où apparaît le <b>' + (DATA.spells[id] ? DATA.spells[id].name : id) + '</b> : la zone montre jusqu\'où il peut aller dès ce round.' : 'Choisissez le centre de <b>' + (DATA.spells[id] ? DATA.spells[id].name : id) + '</b> : la zone de ' + zr + ' × ' + zr + ' cases suit le curseur.', '', 'cast');
    UI.toast('Choisissez la cible de <b>' + (DATA.spells[id] ? DATA.spells[id].name : id) + '</b> (en or)' + (maxExtra ? ' ; réglez sa puissance au-dessus de la barre (touches + et −)' : '') + '.', '', 'cast');
  },
  // ---------- puissance d'un sort à puissance variable ----------
  // ce que coûte le sort avec ce supplément : « coût 13 mana » (sorcier, distance comprise) ou « 13 de sa réserve » (lanceur)
  powerCost(id, caster, x) {
    const bt = CombatView.bt, side = CombatView.humanSide, pl = bt.player(side);
    if (caster) { const o = bt.unitSpells(caster).find(o => o.id === id); return (o ? o.cost + x : x) + ' de la réserve de ' + bt.name(caster); }
    const base = Magic.spellCost(App.game, pl, id, true) + x;
    return 'coût ' + Math.max(1, Math.ceil(base * Magic.distanceMult(App.game, pl, bt.plane, bt.x, bt.y))) + ' mana';
  },
  powerLine(id, caster, x) { const t = CombatSpells.powerText(id, x); return (x ? '+' + x + ' mana' : 'puissance de base') + (t ? ' · ' + t : '') + ' · ' + CombatView.powerCost(id, caster, x); },
  // le réglage, au-dessus de la barre, tant qu'on vise avec un tel sort ; reconstruit seulement quand le sort change
  syncPower() {
    const m = CombatView.mode, root = $('#combat-root'); if (!root) return;
    const key = m && m.maxExtra ? m.id + ':' + m.maxExtra : '';
    let el = $('#c-power');
    if (key === CombatView._powerKey && (!key || el)) return;
    CombatView._powerKey = key;
    if (el) el.remove();
    if (!key) return;
    const step = CombatSpells.EXTRA_STEP[m.id] || 1, name = DATA.spells[m.id] ? DATA.spells[m.id].name : m.id;
    const txt = h('span', { class: 'muted', id: 'c-power-txt' }, CombatView.powerLine(m.id, m.caster, m.extra));
    const range = h('input', { type: 'range', min: 0, max: m.maxExtra, step, value: m.extra, id: 'c-power-range', style: 'width:180px' });
    range.oninput = () => CombatView.setPower(+range.value);
    el = h('div', { class: 'card cpower', id: 'c-power' }, h('b', null, name), range, txt);
    root.append(el);
  },
  setPower(x) {
    const m = CombatView.mode; if (!m || !m.maxExtra) return;
    const step = CombatSpells.EXTRA_STEP[m.id] || 1;
    m.extra = U.clamp(Math.round(x / step) * step, 0, m.maxExtra);
    const r = $('#c-power-range'); if (r && +r.value !== m.extra) r.value = m.extra;
    const t = $('#c-power-txt'); if (t) t.textContent = CombatView.powerLine(m.id, m.caster, m.extra);
    CombatView._spfc = null;
    // la cible survolée : son panneau suit le réglage
    const hv = CombatView.hover, u = hv && CombatView.bt.unitAt(hv.c, hv.r), right = $('#c-right');
    if (u && right && right.style.display !== 'none') { const box = right.querySelector('.spellodds'); const nb = CombatView.oddsHtml(u); if (box) box.outerHTML = nb || ''; }
  },
  // sorts sans cible (Contre-magie, Désenchantement) : la puissance se règle avant de lancer
  powerDialog(id, caster, maxExtra) {
    const step = CombatSpells.EXTRA_STEP[id] || 1, sp = DATA.spells[id] || { name: id, desc: '' };
    let x = 0;
    const txt = h('div', { class: 'muted', style: 'margin-top:6px' }, CombatView.powerLine(id, caster, 0));
    const range = h('input', { type: 'range', min: 0, max: maxExtra, step, value: 0, style: 'width:100%' });
    range.oninput = () => { x = +range.value; txt.textContent = CombatView.powerLine(id, caster, x); };
    const body = h('div', null, h('div', null, sp.desc), h('div', { style: 'margin-top:10px' }, range), txt);
    const m = UI.modal({ title: sp.name, body, width: 520, footer: [h('button', { class: 'btn', onclick: () => m.close() }, 'Annuler'),
      h('button', { class: 'btn primary', onclick: () => { m.close(); CombatView.act(() => CombatSpells.cast(CombatView.bt, CombatView.humanSide, id, null, caster, x)); } }, 'Lancer')] });
  },
  // cases des cibles valables du sort en cours de ciblage
  targetTiles() {
    const bt = CombatView.bt, m = CombatView.mode; if (!m || m.tt === 'combatTile') return null;
    return new Set(CombatSpells.validTargets(bt, CombatView.humanSide, m.id).map(b => b.c + ',' + b.r));
  },
  // ce que le sort en cours de ciblage peut toucher (unités, tours, portes ; pour Disruption, les murailles debout)
  targetObjects() {
    const bt = CombatView.bt, m = CombatView.mode; if (!m) return [];
    if (m.tt === 'combatTile') {
      if (m.id !== 'disrupt') return [];
      const out = bt.enemyTowers(CombatView.humanSide).filter(t => t.kind === 'stone' || t.kind === 'gate');
      for (const k in bt.walls) { const w = bt.walls[k]; if (!bt.hasWalls || CombatView.humanSide !== ATT_SIDE || w.broken || w.gate) continue; const [c, r] = k.split(',').map(Number); if (!out.some(t => t.c === c && t.r === r)) out.push({ id: 'wall:' + k, c, r, tower: true }); }
      return out;
    }
    return CombatSpells.validTargets(bt, CombatView.humanSide, m.id);
  },
  // chances du sort en cours de ciblage sur cette unité
  oddsHtml(u) {
    const m = CombatView.mode, bt = CombatView.bt; if (!m || !u) return '';
    if (!CombatSpells.validTargets(bt, CombatView.humanSide, m.id).includes(u)) return '';
    const o = CombatSpells.odds(bt, CombatView.humanSide, m.id, u, m.extra || 0); if (!o) return '';
    const pc = x => Math.round(x * 100) + ' %', name = DATA.spells[m.id] ? DATA.spells[m.id].name : m.id;
    const col = x => x >= .6 ? 'ok' : x >= .3 ? 'gold' : 'danger';
    let html = '<div class="spellodds"><div class="dim" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.06em">' + U.esc(name) + '</div>';
    if (o.immune) html += '<div><b class="danger">Sans effet</b> : ' + (o.threshold ? 'résistance ' + o.res + ', il faudrait moins de ' + o.threshold : 'immunisé (résistance ' + (o.res >= 50 ? '50 ou plus' : o.res) + ')') + '.</div>';
    else if (o.dispel) html += '<div>Au moins un effet dissipé : <b class="' + col(o.p) + '" style="font-size:16px">' + pc(o.p) + '</b></div><div class="dim" style="font-size:11.5px">' + o.dispel.map(d => U.esc(d.name) + ' ' + pc(d.p)).join(' · ') + '</div>';
    else if (o.drain != null) html += '<div>Vol de vie attendu : <b class="ok">' + String(Math.round(o.drain * 10) / 10).replace('.', ',') + ' PV</b> <span class="dim">(résistance ' + o.res + (o.mod ? ' − ' + o.mod : '') + ')</span></div>';
    else if (o.dmg != null) { const f1 = x => String(Math.round(x * 10) / 10).replace('.', ','); html += '<div>Dégâts attendus : <b class="' + col(1 - o.zero) + '" style="font-size:16px">≈ ' + f1(o.dmg) + '</b> sur ' + o.hp + ' PV</div><div class="dim" style="font-size:11.5px">' + pc(o.zero) + ' sans effet · unité détruite : ' + pc(o.kill) + '</div>'; }
    else if (o.perFigure && o.n > 1) html += '<div>Chaque figurine : <b class="' + col(o.p) + '">' + pc(o.p) + '</b> de périr</div><div>Au moins une tuée : <b class="' + col(o.any) + '">' + pc(o.any) + '</b> · l\'unité entière : <b class="' + col(o.all) + '">' + pc(o.all) + '</b></div>';
    else html += '<div>Chance de réussite : <b class="' + col(o.p) + '" style="font-size:16px">' + pc(o.p) + '</b></div>';
    if (o.res != null && o.mod != null && !o.immune) html += '<div class="dim" style="font-size:11.5px">Résistance ' + o.res + (o.mod ? ', réduite de ' + o.mod + ' par le sort' : '') + ' : il faut faire plus que ' + Math.max(0, o.res - o.mod) + ' sur 10' + (o.perFigure && o.n > 1 ? ' pour chaque figurine' : '') + '.</div>';
    if (o.pass < 1 && !o.immune) html += '<div class="gold" style="font-size:11.5px">Le sort doit d\'abord passer ' + (bt.nodeRealm && CombatSpells.nodeFizzle(bt, CombatView.humanSide, m.id, 0) > 0 ? 'le flux du nœud' : '') + (bt.nodeRealm && CombatSpells.nodeFizzle(bt, CombatView.humanSide, m.id, 0) > 0 && bt.ench[1 - CombatView.humanSide].includes('counter_magic') ? ' et ' : '') + (bt.ench[1 - CombatView.humanSide].includes('counter_magic') ? 'la contre-magie' : '') + ' (' + pc(o.pass) + ') : chance réelle ' + pc(o.chance) + '.</div>';
    return html + '</div>';
  },
  useTarget(t, u) {
    const bt = CombatView.bt; const { id, caster, tt } = CombatView.mode;
    const side = CombatView.humanSide;
    let target = null;
    if (tt === 'combatTile') target = id !== 'disrupt' || CombatView.targetObjects().some(o => o.c === t.c && o.r === t.r) ? [t.c, t.r] : null;   // Disruption : un ouvrage seulement
    else if (tt === 'deadUnit') {
      const here = CombatSpells.validTargets(bt, side, id).filter(b => b.c === t.c && b.r === t.r);
      // plusieurs corps sur la case : on demande lequel
      if (here.length > 1) {
        const extra0 = CombatView.mode.extra || 0; CombatView.mode = null;
        UI.choice(DATA.spells[id].name, 'Quel corps relever ?', here.map((b, i) => ({ label: bt.name(b) + (b.side === side ? '' : ' (ennemi)'), value: String(i) })).concat([{ label: 'Annuler', value: null }]))
          .then(v => { if (v != null) CombatView.act(() => CombatSpells.cast(bt, side, id, here[+v], caster, extra0)); else UI.toast('Sort annulé.', '', 'cast'); });
        return true;
      }
      target = here[0] || null;
    }
    else {
      const vt = CombatSpells.validTargets(bt, side, id);
      target = u && vt.includes(u) ? u : vt.find(x => x.tower && x.c === t.c && x.r === t.r) || null;
    }
    // pas une cible : le sort est annulé et le clic sert à commander normalement
    if (!target) { CombatView.mode = null; UI.toast('Sort annulé.', '', 'cast'); return false; }
    const extra = CombatView.mode.extra || 0;
    CombatView.mode = null;
    CombatView.act(() => CombatSpells.cast(bt, side, id, target, caster, extra));
    return true;
  },

  // ---------- panneaux ----------
  towerPanel(t) {
    const tv = (CombatView.tview || {})[t.id] || t;
    if (t.kind === 'gate') {
      if (!CombatView.bt.standing(t)) return '<h4>Porte enfoncée</h4><div class="muted">Le passage est ouvert.</div>';
      return '<h4>Porte</h4><div>' + Math.max(0, tv.hp) + ' / ' + t.maxHp + ' PV · défense ' + t.def + '</div><div class="dim" style="margin-top:4px">Fermée aux assaillants tant qu\'elle tient.</div>';
    }
    if (t.dead) return '<h4>' + (t.kind === 'spire' ? 'Ruines de la tour du sorcier' : 'Ruines d\'une tour') + '</h4>' + (t.kind === 'stone' ? '<div class="muted">La muraille est ouverte à cet endroit.</div>' : '');
    const what = t.magic ? U.n(t.shots, 'rayon') + ' magique' + (t.shots > 1 ? 's' : '') + ' de force ' + t.ranged : t.shots + ' flèches de force ' + t.ranged;
    return '<h4>' + (t.kind === 'spire' ? 'Tour du sorcier' : 'Tour de défense') + '</h4>'
      + '<div>' + Math.max(0, tv.hp) + ' / ' + t.maxHp + ' PV · défense ' + t.def + '</div>'
      + (t.mute > 0 ? '<div class="danger" style="margin-top:4px">Réduite au silence : ne tire plus pendant ' + U.n(t.mute, 'round') + '.</div>' : '<div style="margin-top:4px">Tire ' + what + ' (' + t.toHit + ' % pour toucher) à chaque round.</div>')
      + '<div class="dim" style="margin-top:4px">' + (t.kind === 'spire' ? 'Tant qu\'elle tient, la forteresse n\'est pas prise. Toute unité peut l\'assaillir au contact.' : 'Ne tire que tant qu\'une garnison la sert. Seuls des sorts, les briseurs de murs et les créatures colossales en viennent à bout.') + '</div>';
  },
  unitPanel(b) {
    const bt = CombatView.bt, game = App.game;
    const s0 = bt.stats(b), s = s0.ammo != null && s0.rangedType === 'missile' ? Object.assign({}, s0, { ammo: b.ammo || 0 }) : s0;   // les munitions réelles (Bois tordu, tirs déjà faits)
    const eu = bt.effUnit(b);
    let html = UI.unitTip(eu, game, { real: b.u, temp: b.tempEnch }).replace(UI.statLine(Units.stats(game, eu), eu, game), UI.statLine(s, eu, game));
    const extra = [];
    if (b.curses.length) extra.push(...b.curses.map(c => '<span class="abl" style="border-color:#7a2a2a;color:#ffb0b0">' + ({ weakness: 'Faiblesse', vertigo: 'Vertige', mind_storm: 'Tempête mentale', shatter: 'Bris', warp_creature_melee: 'Déformation (attaque)', warp_creature_def: 'Déformation (défense)', warp_creature_res: 'Déformation (résistance)' }[c] || c) + '</span>'));
    if (b.ammo) extra.push('<span class="abl">Munitions ' + b.ammo + '</span>');
    else if (s0.rangedType === 'missile' && s0.ranged) extra.push('<span class="abl" style="border-color:#7a2a2a;color:#ffb0b0">Munitions 0</span>');
    if (b.casterMana) extra.push('<span class="abl e">Mana ' + b.casterMana + '</span>');
    if (b.holdBreach) extra.push('<span class="abl" style="border-color:#8a6a26;color:#ffd66e">En garde jusqu\'à la brèche</span>');
    if (b.guarding) extra.push('<span class="abl" style="border-color:#8a6a26;color:#ffd66e">En garde : ' + (s0.berserk ? '' : '+1 défense, ') + 'ni flanc ni dos</span>');
    if (Units.isMounted(b.u) && b.side === bt.side && b.movedTiles > 0 && b.moves > 0) {
      // la cible survolée peut briser la charge (piquiers, muraille entre les deux)
      const hv = CombatView.hover && bt.unitAt(CombatView.hover.c, CombatView.hover.r), foe = hv && hv.side !== b.side ? hv : null;
      const ch = foe ? bt.chargeOf(b, foe) : (b.movedTiles >= 2 ? 2 : 1);
      extra.push(foe && !ch ? '<span class="abl" style="border-color:#6a5a3a;color:#c9b07a">Élan de charge brisé par ' + U.esc(bt.name(foe)) + '</span>' : '<span class="abl" style="border-color:#8a6a26;color:#ffd66e">Élan de charge : +' + ch + ' en attaque</span>');
    }
    if (extra.length) html += '<div style="margin-top:4px">' + extra.join('') + '</div>';
    return html;
  },
  refreshPanels() {
    const bt = CombatView.bt; if (!bt || !$('#c-title')) return;
    const game = App.game;
    const att = bt.player(ATT_SIDE), def = bt.player(DEF_SIDE);
    $('#c-title').textContent = (CombatView.info.city ? CombatView.info.city.name : CombatView.info.site ? Game.siteName(CombatView.info.site) : 'Bataille') + ' · tour ' + bt.round;
    $('#c-sub').innerHTML = '<span style="color:' + (att ? att.color : '#aaa') + '">' + U.esc(att ? att.name : 'Pillards') + '</span> contre <span style="color:' + (def ? def.color : '#aaa') + '">' + U.esc(def ? def.name : CombatView.info.site ? 'Gardiens' : 'Pillards') + '</span> · ' + (bt.side === CombatView.humanSide ? '<b class="gold">À vous de jouer</b>' : 'Tour adverse');
    const l = $('#c-left');
    l.innerHTML = CombatView.sel ? CombatView.unitPanel(CombatView.sel) + '<div class="dim" style="margin-top:6px">Mouvement restant : ' + (CombatView.sel.moves / 2) + '</div>' : '<span class="dim">Sélectionnez une unité.</span>';
    CombatView.renderBar();
    CombatView.renderLog();
    CombatView.renderSpells();
  },
  // sorts en cours sur le champ de bataille, des deux camps
  activeSpells() {
    const bt = CombatView.bt, me = CombatView.humanSide;
    const groups = [[], []]; // 0 : vous, 1 : l'ennemi
    const add = (who, id, b, kind, good) => {
      if (who == null || !id) return;
      const g = groups[who === me ? 0 : 1];
      let e = g.find(x => x.id === id); if (!e) g.push(e = { id, on: new Map(), units: [], kind: kind || 'field', side: who, good });
      if (b) { const n = bt.name(b); e.on.set(n, (e.on.get(n) || 0) + 1); if (!e.units.includes(b)) e.units.push(b); }
    };
    for (const sd of [0, 1]) for (const id of bt.ench[sd]) add(sd, id);
    for (const id of bt.globalEnch) add(bt.globalBy && bt.globalBy[id] != null ? bt.globalBy[id] : 1 - me, id);
    for (const b of bt.units) {
      if (b.dead) continue;
      for (const id of new Set([...b.tempEnch, ...b.u.ench])) if (DATA.spells[id]) add(b.side, id, b, 'unit', true);
      for (const c of new Set(b.curses)) add(1 - b.side, c.startsWith('warp_creature') ? 'warp_creature' : c, b, 'unit', false);
      if (b.asleep) add(1 - b.side, 'black_sleep', b, 'unit', false);
      if (b.confused) add(1 - b.side, 'confusion', b, 'unit', false);
      if (b.web > 0) add(1 - b.side, 'web', b, 'unit', false);
      if (b.possessed && b.origSide != null) add(b.side, b.bound ? 'creature_binding' : 'possession', b, 'unit', false);   // prise à l'ennemi : le lanceur la commande
    }
    for (const v of bt.vortices || []) add(v.side, 'magic_vortex');
    if (bt.wallOfFire) add(DEF_SIDE, 'wall_of_fire');
    if (bt.wallOfDarkness) add(DEF_SIDE, 'wall_of_darkness');
    for (const t of bt.towers || []) if (t.mute > 0 && bt.standing(t)) add(1 - t.side, t.kind === 'spire' ? 'flux_rupture' : 'haunted_ramparts');
    // enchantements globaux lancés sur la carte qui changent quelque chose ici (Croisade, Armes saintes, Charme de vie, Poussée du chaos…)
    for (const o of App.game.players) {
      if (!o || !o.alive || !o.globals) continue;
      const sd = bt.pids.indexOf(o.id);
      for (const id of o.globals) if (DATA.spells[id] && CombatView.mapGlobalHits(o, id).length) add(sd >= 0 ? sd : 1 - me, id, null, 'map');
    }
    return groups;
  },
  // ce qu'un effet change pour une unité : ses caractéristiques de combat, avec puis sans lui
  statKey(b) { const s = CombatView.bt.stats(b); return [s.melee, s.ranged, s.thrown, s.breath, s.def, s.res, s.toHit, s.toDefend, s.move, s.hp, s.figures, !!s.flying, !!s.magicWeapon, !!b.invisible]; },
  statGain(a, z) { let g = 0; for (const i of [0, 1, 2, 3, 4, 5, 8, 9, 10]) g += a[i] - z[i]; g += (a[6] - z[6] + a[7] - z[7]) / 10 + (a[11] - z[11]) + (a[12] - z[12]) + (a[13] - z[13]); return g; },
  // unités dont les caractéristiques changent quand on retire l'effet (le retrait est temporaire), avec le sens du changement
  diffHits(remove, restore) {
    const bt = CombatView.bt, out = [];
    const with_ = bt.alive().map(b => CombatView.statKey(b));
    remove();
    let without;
    try { without = bt.alive().map(b => CombatView.statKey(b)); } finally { restore(); }
    bt.alive().forEach((b, i) => { CombatView.statKey(b); const g = CombatView.statGain(with_[i], without[i]); if (with_[i].join() !== without[i].join()) out.push({ b, good: g >= 0 }); });
    return out;
  },
  mapGlobalHits(o, id) {
    const i = o.globals.indexOf(id); if (i < 0) return [];
    return CombatView.diffHits(() => o.globals.splice(i, 1), () => o.globals.splice(i, 0, id));
  },
  // les unités touchées par un sort en cours (survol de la liste) : vertes s'il les sert, rouges s'il leur nuit
  spellHits(e) {
    const bt = CombatView.bt;
    if (e.kind === 'unit') return e.units.filter(b => !b.dead).map(b => ({ b, good: e.good }));
    if (e.kind === 'map') { const o = bt.player(e.side) && bt.player(e.side).globals.includes(e.id) ? bt.player(e.side) : App.game.players.find(p => p && p.alive && p.globals && p.globals.includes(e.id)); return o ? CombatView.mapGlobalHits(o, e.id) : []; }
    const foes = bt.alive(1 - e.side), canFail = b => bt.resFor(b, 'death') + 1 < 10;
    switch (e.id) {
      case 'call_lightning': return foes.map(b => ({ b, good: false }));
      case 'wrack': return foes.filter(b => Units.realmOf(b.u) !== 'death' && canFail(b)).map(b => ({ b, good: false }));
      case 'terror': return foes.filter(canFail).map(b => ({ b, good: false }));
      case 'mana_leak': return foes.filter(b => !b.u.ench.concat(b.tempEnch).includes('righteousness') && ((b.ammo > 0 && bt.stats(b).rangedType === 'magic') || b.casterMana > 0)).map(b => ({ b, good: false }));
      case 'blur': return bt.alive(e.side).map(b => ({ b, good: true }));
      case 'counter_magic': case 'magic_vortex': return [];
    }
    const saved = [bt.ench[0].slice(), bt.ench[1].slice(), bt.globalEnch.slice()];
    return CombatView.diffHits(() => { bt.ench = bt.ench.map(l => l.filter(x => x !== e.id)); bt.globalEnch = bt.globalEnch.filter(x => x !== e.id); }, () => { bt.ench = [saved[0], saved[1]]; bt.globalEnch = saved[2]; });
  },
  renderSpells() {
    const el = $('#c-spells'); if (!el || !CombatView.bt) return;
    const groups = CombatView.activeSpells(), pl = CombatView.bt.player(CombatView.humanSide), game = App.game;
    el.innerHTML = '';
    if (!groups[0].length && !groups[1].length) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.append(h('h4', { style: 'margin:0 0 4px;font-size:13px;color:var(--gold)' }, 'Sorts en cours'));
    [['Vos sorts', 'ok'], ['Sorts ennemis', 'danger']].forEach(([label, cls], i) => {
      if (!groups[i].length) return;
      el.append(h('div', { class: cls, style: 'font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin:6px 0 2px' }, label));
      for (const e of groups[i]) {
        const sp = DATA.spells[e.id] || { name: e.id, desc: '', realm: null };
        const on = [...e.on].map(([n, k]) => n + (k > 1 ? ' ×' + k : '')).join(', ');
        const row = h('div', { class: 'cspell' }, spriteCanvas('spell:' + e.id, 22),
          h('div', { class: 'grow' },
            h('div', { class: 't1' }, h('span', { class: 'realmdot', style: 'color:' + (REALM_COLORS[sp.realm] || '#aaa') }), sp.name, on ? h('span', { class: 'dim' }, ' · ' + on) : null, e.id === 'counter_magic' ? h('span', { class: 'gold' }, ' · réserve ' + (CombatView.bt.counterMagic[e.side] || 0)) : null),
            sp.desc ? h('div', { class: 't2' }, sp.desc) : null));
        if (DATA.spells[e.id]) UI.tipOn(row, () => UI.spellTip(e.id, pl, game));
        // survol : les unités touchées s'allument sur le champ de bataille
        const key = i + ':' + e.id;
        row.addEventListener('mouseenter', () => { CombatView.hlRow = row; CombatView.hlKey = key; CombatView.hlCache = null; });
        if (CombatView.hlKey === key) CombatView.hlRow = row;
        row._spell = e;
        el.append(row);
      }
    });
  },
  renderLog() {
    const el = $('#c-log'); if (!el) return;
    el.innerHTML = CombatView.bt.log.slice(-12).map(t => '<div>' + U.esc(t) + '</div>').join('');
    el.scrollTop = el.scrollHeight;
  },
  renderBar() {
    const bar = $('#c-bar'); if (!bar) return;
    bar.innerHTML = '';
    const mine = CombatView.bt && CombatView.bt.side === CombatView.humanSide && !CombatView.busy;
    const b = (label, fn, key, cls, dis, title) => bar.append(h('button', { class: 'abtn ' + (cls || ''), onclick: fn, disabled: !!dis, title: title || '' }, label, key ? h('span', { class: 'k' }, key) : null));
    b('Sorts', () => CombatView.spellMenu(), 'S', '', !mine);
    b('Attendre', () => { if (CombatView.sel) { CombatView.sel.waited = true; CombatView.selectNext(); } }, 'W', '', !mine);
    const bt = CombatView.bt, sel = CombatView.sel;
    b('Garder', () => CombatView.guard(), 'D', '', !mine, sel && Units.isInfantry(sel.u) ? (sel.struck ? 'Passer le reste du tour (pas de bonus : l\'unité a déjà frappé ce tour-ci)' : 'Se mettre en garde : passer le tour, +1 en défense et ni flanc ni dos jusqu\'à son prochain tour') : 'Passer le reste du tour (les troupes montées et les créatures ne se mettent pas en garde)');
    // devant une muraille intacte : garder jusqu'à la brèche (l'unité passe ses tours sans qu'on ait à la commander)
    if (bt && bt.hasWalls && !bt.breached()) b(sel && sel.holdBreach ? 'Lever la garde' : 'Garder jusqu\'à la brèche', () => CombatView.holdBreach(), 'G', '', !mine || !sel);
    if (CombatView.auto && CombatView.autoStart) b('Automatique', () => {}, null, 'primary', true, 'Résolution automatique choisie au début : la bataille se joue seule jusqu\'au bout');
    else if (CombatView.auto) b('Reprendre la main', () => CombatView.toggleAuto(), 'A', 'primary', false, 'Vous reprenez le commandement, tout de suite si c\'est votre tour, sinon au prochain');
    else {
      b('Automatiser toute la bataille', () => CombatView.toggleAuto(), 'A', '', !mine, 'Vos troupes jouent seules ; « Reprendre la main » (A) à tout moment');
      b(sel && sel.autoCtl ? 'Reprendre cette unité' : 'Automatiser cette unité', () => CombatView.toggleUnitAuto(), 'U', sel && sel.autoCtl ? 'primary' : '', !mine || !sel, sel && sel.autoCtl ? 'Elle attendra de nouveau vos ordres' : 'Elle joue seule à chaque tour, les autres restent à vous');
    }
    b('Fuir', async () => { if (await UI.confirm('Fuir le combat', CombatView.fleeText(), 'Fuir')) { CombatView.bt.flee(CombatView.humanSide); await CombatView.playEvents(); CombatView.finish(); } }, null, 'danger', !mine);
    b('Fin du tour', () => CombatView.endTurn(), '↵', 'primary', !mine);
    // le son, coupé ou rendu sans quitter la bataille (toujours actif, même pendant le tour adverse)
    const snd = h('button', { class: 'abtn', title: Sfx.on ? 'Couper le son' : 'Remettre le son', onclick: () => { Sfx.setOn(!Sfx.on); CombatView.renderBar(); } });
    snd.innerHTML = '<span style="display:inline-flex;width:16px;height:16px;vertical-align:middle">' + (ICONS[Sfx.on ? 'sound' : 'mute'] || '') + '</span>'; bar.append(snd);
  },
};
