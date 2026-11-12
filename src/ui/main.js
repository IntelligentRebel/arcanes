'use strict';
// Application : démarrage, barre du haut, panneau latéral, sélection, saisie, enchaînement des tours.

const App = {
  game: null, sel: null, drag: null, keys: {}, lastClick: 0,

  async boot() {
    I18N.page();
    if (!document.getElementById('icon-defs')) document.body.insertAdjacentHTML('afterbegin', ICON_DEFS);
    await Sprites.load();
    MapView.init($('#map'));
    window.addEventListener('resize', () => { MapView.resize(); App.redraw(); if (CombatView.active) { CombatView.layout(); } });
    App.bindInput(); App.bindLog();
    Game.hooks.notify = (game, pid, e) => App.onLog(e);
    Game.hooks.update = (ev) => { if (ev && ev.type === 'move') MapView.bumpVis(); App.dirty = true; };
    Game.hooks.battle = (game, battle, info) => CombatView.run(game, battle, info);
    Game.hooks.choose = (game, pid, q) => App.answer(q);
    Game.hooks.fx = ev => App.onFx(ev);
    Game.hooks.demonSlain = () => setTimeout(() => App.demonPrompt(), 450);
    Game.hooks.finale = () => setTimeout(() => App.finalePrompts(), 450);
    UI.abilityHover();
    // une erreur d'affichage ne doit pas arrêter la boucle : sans elle, plus rien ne se redessine et le jeu paraît figé
    const loop = () => {
      try { if (App.game && !App.preparing) { MapView.draw(); if (App.spellFx && App.spellFx.length) App.flushSpellFx(); } if (App.dirty) { App.dirty = false; App.refresh(); } }
      catch (e) { App.oops(e); }
      requestAnimationFrame(loop);
    };
    window.addEventListener('error', ev => App.oops(ev.error || ev.message));
    window.addEventListener('unhandledrejection', ev => App.oops(ev.reason));
    requestAnimationFrame(loop);
    Sfx.init();
    // liens des messages recopiés en HTML (toasts) : délégation
    document.addEventListener('click', ev => { const a = ev.target.closest && ev.target.closest('a[data-goto]'); if (a && !a.onclick && App.game) { ev.preventDefault(); if (a.closest('#toasts') && (UI.modals.length || App.peeking || CombatView.active)) return; App.goto(JSON.parse(a.dataset.goto)); } });
    Setup.titleScreen();
    // la copie locale demande à GitHub s'il existe une version plus récente (src/ui/update.js)
    setTimeout(() => { Update.check(); }, 1500);
  },

  // erreur inattendue : notée dans la console, dite une fois au joueur (trois messages au plus par session)
  oops(e) {
    const msg = String(e && e.message || e || '').slice(0, 160); console.error(e);
    App._oops = App._oops || new Set(); if (!msg || App._oops.has(msg) || App._oops.size >= 3) return;
    App._oops.add(msg);
    try { UI.toast('Erreur inattendue : ' + U.esc(msg), 'warn'); } catch (x) { /* rien */ }
  },

  start(game, opts = {}) {
    const title = $('.title-screen'); if (title) title.remove();
    Game.upgrade(game);
    App.game = game; UI.game = game;
    App.sel = null; App.prevSel = null; App.roadMode = null; App.endWarned = null; App._fcCache = {}; App._svKey = null;
    // ce qui restait de la partie précédente : coup d'œil en cours, proposition ouverte, écran de fin
    if (App._peekDone) App._peekDone(); for (const b of document.querySelectorAll('.peekbar')) b.remove();
    App.peeking = false; App._offerOpen = false; App._overShown = null; App._overModal = null; App.moving = false;
    MapView.sel = null; MapView.path = null; MapView.roadPreview = null; MapView.forecast = null; MapView._auraHoverKey = null;
    if (typeof MagicUI !== 'undefined' && MagicUI.targeting) MagicUI.cancelTarget();
    const human = game.players.find(p => p.human) || game.players[0];
    App.pid = human.id; UI.pid = human.id; MapView.pid = human.id; MapView.game = game;
    MapView.layers = [null, null]; MapView.invalidate(); MapView.invalidateVis();
    // grandes cartes : couche pré-rendue un peu moins fine pour ménager la mémoire
    MapView.LT = game.world.w * game.world.h > 3500 ? 48 : 64; Tex.cache = {}; MapView._rp = null;
    const fc = game.cities[human.fortress] || Cities.ofPlayer(game, human.id)[0];
    if (fc) MapView.centerOn(fc.x, fc.y, fc.plane);
    $('#logbox').innerHTML = '';
    for (const e of game.log.filter(e => e.pid === App.pid || e.pid === -1).slice(-40)) App.onLog(e, true);
    App.buildTopbar();
    if (!(human.seenHistory && human.seenHistory.length)) Intel.recordHistory(game, human);   // le graphique des forces commence ici
    App.refresh();
    App.selectNext(true);
    // peinture des terres sous un voile d'attente (quelques secondes sur les grandes cartes)
    App.preparing = true; UI.setBusy('Peinture des terres…');
    setTimeout(() => {
      try { if (App.game === game) MapView.ensureLayer(MapView.plane); } finally { App.preparing = false; UI.setBusy(null); }
      // l'autre plan se prépare pendant que le joueur lit l'introduction
      setTimeout(() => { if (App.game === game && !CombatView.active) MapView.ensureLayer(1 - MapView.plane); }, 2500);
    }, 40);
    const research = () => { if (App.game === game && (human.mustChooseResearch || (!human.researching && human.researchOptions.length))) MagicUI.research(true); };
    if (opts.intro) setTimeout(() => Setup.intro(game).then(research), 150);
    // partie rechargée : ce qui attendait une réponse revient (dettes, offres, propositions des sorciers, recherche, cités)
    else setTimeout(async () => {
      if (App.game !== game) return;
      if (game.over) return App.gameOver();
      await App.heroArrivalPrompt(); if (App.game !== game) return;
      await App.fallPrompt(); if (App.game !== game) return;
      await App.demonPrompt(); if (App.game !== game) return;
      await App.nodeLostPrompts(); if (App.game !== game) return;
      await App.finalePrompts(); if (App.game !== game) return;
      await App.landmarkPrompts(); if (App.game !== game) return;
      await App.eventPrompts(); if (App.game !== game) return;
      if (Pacts.due(game, human).length) await App.pactPrompts(); if (App.game !== game) return;
      await App.dilemmaPrompt(); if (App.game !== game) return;
      await App.offerPrompts(); if (App.game !== game) return;
      await App.talentPrompts(); if (App.game !== game) return;
      if (!UI.modals.length) research();
    }, 200);
  },

  // ---------- journal ----------
  setLogOrder(rev) {
    App.setPref('logReverse', !!rev);
    const box = $('#logbox'); for (const el of [...box.children].reverse()) box.append(el);
    box.scrollTop = rev ? 0 : box.scrollHeight;
  },
  // le journal se déplace (poignée) et se redimensionne (coin) ; sa place est retenue, un double-clic sur la poignée la rend
  logPlace() {
    const w = $('#logwrap'), p = App.prefs.logPos; if (!w) return;
    if (!p) { w.style.cssText = ''; return; }
    const W = innerWidth, H = innerHeight, ww = U.clamp(p.w, 220, W - 16), hh = U.clamp(p.h, 80, H - 70);
    w.style.left = U.clamp(p.l, 0, W - ww) + 'px'; w.style.top = U.clamp(p.t, 56, H - hh) + 'px'; w.style.bottom = 'auto'; w.style.width = ww + 'px'; w.style.height = hh + 'px'; w.style.maxHeight = 'none';
  },
  bindLog() {
    const w = $('#logwrap'), grip = $('#log-grip'), size = $('#log-size'); if (!w || !grip) return;
    const drag = (el, fn) => el.addEventListener('pointerdown', e => {
      e.preventDefault(); const r = w.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
      const mv = ev => { App.prefs.logPos = fn(r, ev.clientX - x0, ev.clientY - y0); App.logPlace(); };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); App.setPref('logPos', App.prefs.logPos); const box = $('#logbox'); if (!App.prefs.logReverse) box.scrollTop = box.scrollHeight; };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    drag(grip, (r, dx, dy) => ({ l: r.left + dx, t: r.top + dy, w: r.width, h: r.height }));
    drag(size, (r, dx, dy) => ({ l: r.left, t: r.top + dy, w: r.width + dx, h: r.height - dy }));
    grip.addEventListener('dblclick', () => { App.setPref('logPos', null); App.logPlace(); });
    window.addEventListener('resize', () => App.logPlace());
    App.logPlace();
  },
  onLog(e, silent) {
    if (!App.game) return;
    if (e.pid !== App.pid && e.pid !== -1) return;
    const box = $('#logbox');
    const div = h('div', { class: 'e' + (e.ref && e.ref.alert ? ' alert' : '') }, h('span', { class: 't' }, 'T' + e.turn), App.linkify(e));
    // l'ordre au choix (menu) : le plus récent en bas (par défaut) ou en haut
    if (App.prefs.logReverse) { box.prepend(div); while (box.children.length > 120) box.lastChild.remove(); box.scrollTop = 0; }
    else { box.append(div); while (box.children.length > 120) box.firstChild.remove(); box.scrollTop = box.scrollHeight; }
    if (!silent) Sfx.forLog(e, UI.busyLog);
    if (!silent && e.ref && e.ref.cache) {
      MapView.flash(e.ref.plane, e.ref.x, e.ref.y, CACHE_COLORS[e.ref.cache], 900);
      MapView.floatText(e.ref.plane, e.ref.x, e.ref.y, e.ref.gain, CACHE_COLORS[e.ref.cache]);
      if (e.ref.reveal) { MapView.flash(e.ref.plane, e.ref.reveal[0], e.ref.reveal[1], '#f3e6c0', 1600); MapView.invalidateVis(); MapView.bumpVis(); }
    }
    if (!silent && e.ref && e.ref.alert && e.ref.quiet) App.shown.add(e);
    else if (!silent && e.ref && e.ref.alert && !UI.busyLog && e.pid === App.pid) App.alertBanner(e);
    else if (!silent && !(e.ref && e.ref.minor) && !UI.busyLog && !(e.ref && e.ref.contact) && !(e.ref && e.ref.modal)) { App.shown.add(e); UI.toast(App.linkify(e).innerHTML); }
    if (!silent && e.ref && (e.ref.contact || e.ref.global) && e.pid === App.pid) { App.contacts.push(e.ref); if (!UI.busy && !CombatView.active) setTimeout(() => App.showContacts(), 250); }
  },
  // premier contact avec un sorcier : son portrait au centre de l'écran
  contacts: [],
  async showContacts() {
    const game = App.game; if (!game || App._contactOpen || !App.contacts.length) return;
    if (UI.busy || CombatView.active || App.moving) return;
    App._contactOpen = true;
    try {
      while (App.contacts.length) {
        const ref = App.contacts.shift(), o = game.players[ref.player]; if (!o) continue;
        // un rival lance un enchantement global : comme dans l'original, impossible de le rater
        if (ref.global) {
          const sp = DATA.spells[ref.spell], known = Players.knows(game, App.pid, o.id);
          const html = '<div class="contact-card" style="--pc:' + (known ? o.color : '#9a948a') + '"><canvas id="global-pic" width="320" height="320"></canvas><div>'
            + '<div class="contact-name" style="color:' + (known ? o.color : '#9a948a') + '">' + U.esc(U.cap(Players.nameFor(game, App.pid, o.id))) + '</div>'
            + '<div style="margin:6px 0 8px">lance <b class="gold">' + U.esc(sp.name) + '</b></div>'
            + '<div class="muted">' + U.esc(sp.desc || '') + '</div></div></div>';
          Sfx.play('legend');
          const pr = UI.choice('Enchantement global', html, [{ label: 'Continuer', value: true, primary: true }], { width: 620, cls: 'contact-modal' });
          setTimeout(() => { const c = $('#global-pic'); if (c) Sprites.paint(c, known ? 'wizard:' + o.portrait : 'spell:' + ref.spell); }, 10);
          await pr; continue;
        }
        if (ref.x != null) MapView.centerOn(ref.x, ref.y, ref.plane);
        const PERS = { maniac: 'Imprévisible et belliqueux', militarist: 'Militariste', expansionist: 'Bâtisseur d\'empire', perfectionist: 'Perfectionniste, plutôt pacifique', balanced: 'Mesuré' };
        const books = REALMS5.flatMap(r => Array.from({ length: o.books[r] || 0 }, () => '<i style="display:inline-block;width:9px;height:15px;border-radius:2px;margin-right:2px;background:' + REALM_COLORS[r] + ';' + UI.solid(REALM_COLORS[r]) + '"></i>')).join('');
        const html = '<div class="contact-card" style="--pc:' + o.color + '"><canvas id="contact-pic" width="320" height="320"' + (ref.x != null ? ' class="goto" title="Voir le lieu de la rencontre"' : '') + '></canvas><div class="contact-info">'
          + '<div class="contact-name" style="color:' + o.color + '">' + U.esc(o.name) + '</div>'
          + '<div class="contact-books">' + books + '</div>'
          + '<div class="muted">' + U.esc((o.retorts.map(r => DATA.retorts[r] ? DATA.retorts[r].name : r).join(', ') || 'Aucun don')) + '</div>'
          + '<div class="muted">Capitale : ' + U.esc(DATA.races[o.race].name) + (o.human ? '' : ' · ' + U.esc(PERS[o.aiPersonality] || 'Mesuré')) + '</div>'
          + (ref.x != null ? '<div class="dim" style="margin-top:6px">Rencontré ' + (ref.plane ? 'sur le Miroir' : 'sur Arcane') + ', près de (' + ref.x + ', ' + ref.y + ').</div>' : '')
          + '</div></div>';
        Sfx.play('turn');
        const opts = [{ label: 'Diplomatie', value: 'diplo' }];
        if (ref.x != null) opts.push({ label: 'Voir le lieu', value: 'goto' });
        opts.push({ label: 'Continuer', value: true, primary: true });
        const pr = UI.choice('Premier contact', html, opts, { width: 620, cls: 'contact-modal' });
        setTimeout(() => {
          const c = $('#contact-pic'); if (!c) return;
          Sprites.paint(c, 'wizard:' + o.portrait);
          if (ref.x != null) c.addEventListener('click', () => { const b = [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Voir le lieu'); if (b) b.click(); });
        }, 10);
        const v = await pr;
        if (v === 'diplo') Panels.wizards(o.id);
        if (v === 'goto') { MapView.centerOn(ref.x, ref.y, ref.plane); MapView.ping(ref.x, ref.y, ref.plane); App.refresh(); }
      }
    } finally { App._contactOpen = false; }
  },
  // Les noms propres du message deviennent des liens (cité, sorcier, sort) ; le reste du texte mène au lieu de l'événement.
  linkify(e) {
    const span = h('span');
    const r = e.ref || {};
    const game = App.game, text = e.text;
    const named = [];
    if (r.city != null && game.cities[r.city]) named.push({ label: game.cities[r.city].name, target: { type: 'city', id: r.city } });
    const who = r.player != null ? r.player : r.diplo;
    // une proposition encore en attente : le message la rouvre
    const offer = r.diplo != null && (r.offer || / vous propose /.test(e.fr || text)) && Diplomacy.offerFrom(game, App.me(), r.diplo);
    if (offer) { span.append(h('a', { onclick: () => { const o = Diplomacy.offerFrom(game, App.me(), r.diplo); if (o) App.offerPrompt(o); else Panels.wizards(r.diplo); } }, text)); return span; }
    if (who != null && game.players[who] && Players.knows(game, App.pid, who)) named.push({ label: game.players[who].name, target: { type: 'player', id: who } });
    if (r.spell && DATA.spells[r.spell]) named.push({ label: DATA.spells[r.spell].name, target: { type: 'spell', id: r.spell } });
    const place = r.x != null ? { type: 'tile', x: r.x, y: r.y, plane: r.plane } : null;
    if (!named.length && !place && r.unit != null && game.units[r.unit]) named.push({ label: text, target: { type: 'unit', id: r.unit } });
    const link = (label, target) => h('a', { 'data-goto': JSON.stringify(target), onclick: () => App.goto(target) }, label);
    // découpe du texte autour des noms trouvés
    const hits = [];
    for (const n of named) { const i = text.indexOf(n.label); if (i >= 0 && !hits.some(o => i < o.i + o.n.label.length && o.i < i + n.label.length)) hits.push({ i, n }); }
    hits.sort((a, b) => a.i - b.i);
    if (!hits.length && !place) {
      // seul un nom introuvable dans le texte : tout le message devient le lien
      if (named.length) span.append(link(text, named[0].target)); else span.textContent = text;
      return span;
    }
    let pos = 0;
    const plain = s => {
      if (!s) return;
      if (!place) { span.append(s); return; }
      // le texte libre mène au lieu ; espaces et ponctuation hors du lien
      const m = s.match(/^(\s*)(.*?)([\s.,:;!?]*)$/s);
      if (m[1]) span.append(m[1]);
      if (m[2]) span.append(link(m[2], place));
      if (m[3]) span.append(m[3]);
    };
    for (const hit of hits) { plain(text.slice(pos, hit.i)); span.append(link(hit.n.label, hit.n.target)); pos = hit.i + hit.n.label.length; }
    plain(text.slice(pos));
    return span;
  },
  goto(t) {
    const game = App.game;
    if (t.type === 'city') { const c = game.cities[t.id]; if (!c) return; MapView.centerOn(c.x, c.y, c.plane); if (c.owner === App.pid) CityUI.open(c.id); }
    else if (t.type === 'tile') MapView.centerOn(t.x, t.y, t.plane);
    else if (t.type === 'unit') { const u = game.units[t.id]; if (u) { MapView.centerOn(u.x, u.y, u.plane); if (u.owner === App.pid) App.selectTile(u.plane, u.x, u.y); } }
    else if (t.type === 'spell') MagicUI.spellbook();
    else if (t.type === 'player') Panels.wizards(t.id);
    App.refresh();
  },

  // ---------- barre du haut ----------
  buildTopbar() {
    const tb = $('#topbar');
    const pl = App.me();
    tb.innerHTML = '';
    const wiz = h('div', { class: 'wiz', style: '--pc:' + pl.color, onclick: () => MagicUI.spellbook() }, h('div', { class: 'medal', id: 'tb-medal' }, spriteCanvas('wizard:' + pl.portrait, 80)), h('div', null, h('div', { class: 'n' }, pl.name), h('div', { class: 'd', id: 'tb-date' })));
    UI.tipOn(wiz, () => { const p = App.me(); return '<h4>' + U.esc(p.name) + '</h4>Ouvrir votre grimoire pour lancer un sort <span class="kbd">G</span>.' + (p.casting ? '<div style="margin-top:4px">L\'anneau doré suit l\'incantation en cours : ' + U.esc(DATA.spells[p.casting.id].name) + ' (' + Math.floor(p.casting.progress / p.casting.cost * 100) + ' %, ' + Spells.castingTurnsText(App.game, p) + ').</div>' : '') + '<div class="dim" style="margin-top:4px">Les autres sorciers : bouton Sorciers <span class="kbd">D</span>.</div>'; });
    tb.append(wiz);
    const res = (id, ic, tip) => { const el = h('div', { class: 'res', id }, h('span', { html: ICONS[ic] }), h('span', { class: 'v' }), h('span', { class: 'p' })); UI.tipOn(el, tip); return el; };
    // les ressources rétrécissent (recherche et incantation d'abord, en points de suspension) ; les boutons, jamais : le menu reste à l'écran
    const resWrap = h('div', { class: 'tb-res' }), btnWrap = h('div', { class: 'tb-btns' });
    resWrap.append(
      res('tb-gold', 'gold', () => App.goldTip()), res('tb-mana', 'mana', () => App.manaTip()), (() => { const r = res('tb-food', 'food', () => App.foodTip()); r.style.cursor = 'pointer'; r.onclick = () => App.feedArmies(); return r; })(),
      res('tb-power', 'power', () => App.powerTip()), (() => { const r = res('tb-research', 'research', () => App.researchTip()); r.classList.add('wide'); r.style.cursor = 'pointer'; r.onclick = () => MagicUI.research(); return r; })(), res('tb-skill', 'skill', () => App.skillTip()), res('tb-fame', 'fame', () => App.fameTip()), res('tb-veil', 'veil', () => App.veilTip()),
      (() => { const r = res('tb-som', 'skill', () => App.somTip()); r.style.cursor = 'pointer'; r.style.display = 'none'; r.onclick = () => Panels.wizards(); return r; })(),
    );
    tb.append(resWrap, h('div', { class: 'sp' }), btnWrap);
    const btn = (label, ic, key, fn, tip) => { const b = h('button', { class: 'tbtn', onclick: fn }, h('span', { html: ICONS[ic] }), label ? h('span', { class: 'lbl' }, label) : null, key ? h('span', { class: 'k' }, key) : null); if (tip) UI.tipOn(b, () => '<b>' + (label || '') + '</b> ' + tip + (key ? ' <span class="kbd">' + key + '</span>' : '')); return b; };
    btnWrap.append(
      btn('Grimoire', 'book', 'G', () => MagicUI.spellbook(), 'Lancer un sort'),
      btn('Magie', 'wand', 'M', () => MagicUI.magic(), 'Répartition de la puissance, enchantements globaux'),
      btn('Recherche', 'research', 'R', () => MagicUI.research(), 'Choisir le prochain sort à étudier'),
      btn('Cités', 'city', '⇧C', () => Panels.cities(), 'Vue d\'ensemble des cités'),
      btn('Armées', 'army', 'A', () => Panels.armies(), 'Toutes vos unités'),
      btn('Sorciers', 'wizards', 'D', () => Panels.wizards(), 'Diplomatie'),
      btn('', 'chron', 'J', () => Panels.chronicle(App.game), 'Chronique de la partie : courbes de chaque sorcier, moments clés, grandes batailles'),
      btn('', 'plane', 'P', () => App.togglePlane(), 'Basculer la vue entre Arcane et Miroir (P)'),
      (() => { const b = btn('', Sfx.on ? 'sound' : 'mute', null, () => { Sfx.setOn(!Sfx.on); b.querySelector('span').innerHTML = ICONS[Sfx.on ? 'sound' : 'mute']; }, 'Activer ou couper le son et la musique (volume : menu)'); b.id = 'tb-sound'; return b; })(),
      btn('', 'menu', null, () => Panels.menu(), 'Menu : sauvegarder, charger, options'),
    );
  },
  me() { return App.game.players[App.pid]; },
  refresh() {
    const game = App.game; if (!game) return;
    const pl = App.me();
    const set = (id, v, p) => { const el = $('#' + id); if (!el) return; el.querySelector('.v').textContent = v; el.querySelector('.p').textContent = p || ''; };
    const gp = Players.goldPerTurn(game, pl);
    const sp = Magic.split(game, pl);
    const mpt = Magic.manaPerTurn(game, pl);
    set('tb-gold', U.fmt(pl.gold), (gp.gold >= 0 ? '+' : '') + gp.gold);
    set('tb-mana', U.fmt(pl.mana), (mpt >= 0 ? '+' : '') + mpt);
    set('tb-food', (gp.food >= 0 ? '+' : '') + gp.food, '');
    set('tb-power', sp.power, '');
    const r = pl.researching;
    if (r) { const cost = Magic.researchCost(pl, r); const rpt = Magic.effectiveResearch(game, pl, r); set('tb-research', DATA.spells[r].name, Math.min(100, Math.floor(pl.researchProgress / cost * 100)) + '% · ' + (rpt > 0 ? Math.max(1, Math.ceil((cost - pl.researchProgress) / rpt)) + ' t' : 'jamais')); }
    else set('tb-research', 'Aucune recherche', '');
    set('tb-skill', pl.skillLeft + '/' + Magic.totalSkill(game, pl), '');
    // l'incantation en cours : son nom s'efface quand la barre manque de place, le pourcentage reste
    { const sp = $('#tb-skill .p'); if (sp) { sp.innerHTML = ''; if (pl.casting) sp.append(h('span', { class: 'nm' }, DATA.spells[pl.casting.id].name + ' '), Math.floor(pl.casting.progress / pl.casting.cost * 100) + ' %'); } }
    set('tb-fame', U.cap(App.fameTier(Players.fame(game, pl)).name), '');
    {
      const k = game.crisis, due = Pacts.due(game, pl).length;
      const tag = k && k.state === 'active' ? 'Brèche' : k && k.state === 'pending' && k.at - game.turn <= 10 ? 'Crise : ' + Math.max(0, k.at - game.turn) + ' t' : due ? 'pacte dû' : '';
      set('tb-veil', Math.round(game.veil == null ? 100 : game.veil) + ' %', tag);
      const el = $('#tb-veil'); if (el) el.querySelector('.v').className = 'v ' + ((game.veil ?? 100) <= 40 ? 'danger' : '');
      if (el) el.querySelector('.p').className = 'p ' + (tag ? 'danger' : '');
    }
    {
      // la course à la Maîtrise : visible dès qu'un sorcier s'y engage
      const race = Endgame.race(game), el = $('#tb-som');
      if (el) {
        el.style.display = race.length ? '' : 'none';
        const top = race[0];
        if (top) {
          // compact : l'avancée du plus engagé ; le détail (qui, combien de tours) est dans l'infobulle
          set('tb-som', top.phase === 'cast' ? U.n(top.turns, 'tour') : top.phase === 'known' ? 'prêt' : Math.floor(top.pct * 100) + ' %', '');
          el.querySelector('.v').className = 'v ' + (top.phase === 'cast' && top.pid !== pl.id ? 'danger' : 'gold');
        }
      }
    }
    const d = $('#tb-date'); if (d) d.textContent = UI.dateOf(game.turn) + ' · tour ' + game.turn;
    const md = $('#tb-medal'); if (md) md.style.setProperty('--cast', pl.casting ? Math.floor(pl.casting.progress / pl.casting.cost * 100) + '%' : '0%');
    $('#tb-food').querySelector('.v').className = 'v ' + (gp.food < 0 ? 'danger' : '');
    $('#tb-food').classList.toggle('alert', gp.food < 0);
    App.renderSide();
    App.renderMinimap();
    if (game.over && App._overShown !== game && !UI.busy && !CombatView.active) setTimeout(() => { if (App.game === game && !UI.busy && !CombatView.active) App.gameOver(); }, 60);
  },
  somTip() {
    const game = App.game, pl = App.me();
    const rows = Endgame.race(game).map(r => '<div class="kv"><span>' + U.esc(r.pid === pl.id ? 'Vous' : U.cap(Players.nameFor(game, pl.id, r.pid))) + '</span><span class="' + (r.phase === 'cast' ? 'danger' : '') + '">'
      + (r.phase === 'cast' ? 'lance le sort : ' + Math.floor(r.pct * 100) + ' %, ' + U.n(r.turns, 'tour') + ' encore' : r.phase === 'known' ? 'connaît le sort, peut le lancer' : 'l\'étudie : ' + Math.floor(r.pct * 100) + ' %, environ ' + U.n(r.turns, 'tour')) + '</span></div>').join('');
    return '<h4>Course à la Maîtrise</h4>' + rows + '<div class="dim" style="margin-top:4px">Celui qui lance le Sort de Maîtrise gagne la partie quand l\'incantation s\'achève. Tous les sorciers lui déclarent la guerre : prendre sa forteresse l\'arrête.</div>';
  },
  goldTip() {
    const game = App.game, pl = App.me();
    let inc = 0, up = 0; for (const c of Cities.ofPlayer(game, pl.id)) { const e = Cities.econ(game, c); inc += e.goldIncome; up += e.buildingUpkeep; }
    const uu = Magic.goldUpkeepUnits(game, pl), gp = Players.goldPerTurn(game, pl);
    const nobles = 10 * Object.values(game.units).filter(u => u.owner === pl.id && u.hero && Units.abilities(game, u).noble).length;
    return '<h4>Or</h4><div class="kv"><span class="k">Revenus des cités</span><span>+' + inc + '</span></div><div class="kv"><span class="k">Entretien des bâtiments</span><span>-' + up + '</span></div><div class="kv"><span class="k">Solde des troupes</span><span>-' + uu + '</span></div>' + (nobles ? '<div class="kv"><span class="k">Héros nobles</span><span>+' + nobles + '</span></div>' : '') + '<div class="kv"><span class="k">Vente du surplus de nourriture</span><span>+' + Math.floor(Math.max(0, gp.food) / 2) + '</span></div><div class="kv"><span class="k">Impôts</span><span>' + TAX_RATES[pl.taxIdx] + ' or / citoyen</span></div><div class="dim" style="margin-top:4px">Ajustez les impôts dans l\'écran Magie.</div>';
  },
  manaTip() { const game = App.game, pl = App.me(), sp = Magic.split(game, pl); return '<h4>Mana</h4><div class="kv"><span class="k">Puissance vers le mana</span><span>+' + sp.mana + '</span></div><div class="kv"><span class="k">Entretien (créatures, enchantements)</span><span>-' + Magic.manaUpkeep(game, pl) + '</span></div>'; },
  foodTip() { const gp = Players.goldPerTurn(App.game, App.me()); return '<h4>Nourriture</h4>Surplus global après l\'entretien des troupes : <b class="' + (gp.food < 0 ? 'danger' : 'ok') + '">' + gp.food + '</b>. Dans les cités en répartition automatique, les fermiers sont ajustés pour nourrir vos armées ; un déficit dissout une unité par point manquant à la fin du tour.<div class="gold" style="margin-top:4px">Clic : allouer les fermiers nécessaires dans toutes vos cités, y compris celles réglées à la main.</div>'; },
  // la renommée en mots (le chiffre seul ne dit rien), et ce qu'elle rapporte en ce moment
  FAME_TIERS: [[0, 'nulle'], [1, 'basse'], [20, 'moyenne'], [50, 'haute'], [150, 'légendaire']],
  fameTier(f) { const T = App.FAME_TIERS; let i = 0; while (i + 1 < T.length && f >= T[i + 1][0]) i++; return { name: T[i][1], next: T[i + 1] || null }; },
  fameTip() {
    const game = App.game, pl = App.me(), f = Players.fame(game, pl), t = App.fameTier(f);
    const gross = Magic.goldUpkeepGross(game, pl);   // (Trône de Crânes compris, comme la solde réellement payée)
    const famous = pl.retorts.includes('famous'), merc = Math.min(10, (1 + Math.floor(f / 20)) * (famous ? 2 : 1));
    const heroes = Heroes.heroCount(game, pl), hero = heroes >= 6 ? null : Heroes.offerChance(game, pl);
    const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span>' + v + '</span></div>';
    const parts = Players.fameParts(game, pl);
    return '<h4>Renommée ' + t.name + ' (' + f + ')</h4>'
      + (parts.extra.length ? kv('Acquise', parts.base) + parts.extra.map(e => kv(U.esc(e.what), '+' + e.n)).join('') + '<div style="height:6px"></div>' : '')
      + kv('Solde des troupes', !gross ? 'aucune à payer' : !f ? 'aucune réduction (' + gross + ' or par tour)' : '−' + Math.min(f, gross) + ' or par tour' + (f >= gross ? ' (toute la solde)' : ' (sur ' + gross + ')'))
      + kv('Un héros se propose', hero == null ? 'six héros : plus personne' : hero + ' % de chances par tour')
      + kv('Héros qui peuvent venir', (() => { const all = Object.values(DATA.heroes).filter(h => h.id !== 'HeroTorin'), ok = h => (h.fame || 0) <= f && !(h.champion && f < 20);
        const o = all.filter(h => !h.champion), c = all.filter(h => h.champion);
        return o.filter(ok).length + ' héros sur ' + o.length + ', ' + c.filter(ok).length + ' champion' + (c.filter(ok).length > 1 ? 's' : '') + ' sur ' + c.length; })())
      + kv('Mercenaires', (game.turn < 30 ? 'dès le tour 31 : ' : '') + merc + ' % de chances par tour')
      + '<div class="dim" style="margin-top:6px">Paliers : ' + App.FAME_TIERS.slice(1).map(([v, n]) => n + ' ' + v).join(', ') + '.' + (t.next ? ' Prochain : ' + t.next[1] + ' à ' + t.next[0] + '.' : '') + '</div>'
      + '<div class="dim">Se gagne : cités prises, repaires riches vidés, légendes, sorts très rares, némésis abattues. Raser une cité : −5. Compte double dans le score du meneur de la partie.</div>';
  },
  powerTip() { const game = App.game, pl = App.me(), sp = Magic.split(game, pl); const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span>' + v + '</span></div>';
    return '<h4>Puissance magique : ' + sp.power + '</h4>' + kv('Vers le mana', pl.powerSplit.mana + ' %') + kv('Vers la recherche', pl.powerSplit.research + ' %') + kv('Vers la compétence', pl.powerSplit.skill + ' %')
      + '<div style="margin-top:6px" class="gold">D\'où elle vient</div>' + App.powerSources(game, pl); },
  // les sources de la puissance magique, poste par poste, puis les cités qui en donnent le plus
  powerSources(game, pl) {
    const P = Magic.powerParts(game, pl), kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span>' + v + '</span></div>';
    const tot = { religion: 0, fortress: 0, citizens: 0, minerals: 0, guilds: 0, governor: 0 };
    for (const { c } of P.cities) { const pp = Cities.econ(game, c).powerParts || {}; for (const k in tot) tot[k] += pp[k] || 0; }
    const rows = [['Lieux de culte (sanctuaires, temples…)', tot.religion], ['Forteresse (vos grimoires)', tot.fortress], ['Population', tot.citizens], ['Gisements', tot.minerals],
      ['Guildes (alchimistes +3, sorciers −3)', tot.guilds], ['Gouverneurs', tot.governor], ['Nœuds liés (' + P.nodes.length + ')', U.sum(P.nodes, x => x.n)], ['Volcans et autres', P.extra]]
      .filter(r => Math.round(r[1])).sort((a, b) => b[1] - a[1]);
    const cities = P.cities.filter(x => x.n > 0).sort((a, b) => b.n - a.n), top = cities.slice(0, 5), rest = cities.slice(5);
    return rows.map(r => kv(r[0], Math.round(r[1]))).join('')
      + (top.length ? '<div class="dim" style="margin-top:6px">Par cité : ' + top.map(x => U.esc(x.c.name) + ' ' + Math.round(x.n)).join(', ') + (rest.length ? ', ' + U.n(rest.length, 'autre') + ' ' + Math.round(U.sum(rest, x => x.n)) : '') + '.</div>' : '');
  },
  researchTip() { const game = App.game, pl = App.me(); const r = pl.researching; if (!r) return '<h4>Recherche</h4>Aucun sort en cours d\'étude. Cliquez sur Recherche.'; return UI.spellTip(r, pl, game) + '<div style="margin-top:6px">' + U.fmt(pl.researchProgress) + ' / ' + U.fmt(Magic.researchCost(pl, r)) + ' points · ' + Magic.effectiveResearch(game, pl, r) + ' par tour</div>'; },
  veilTip() {
    const game = App.game, pl = App.me(), v = game.veil == null ? 100 : game.veil;
    const nx = Veil.nextThreshold(game), rifts = Veil.rifts(game, 0).length;
    let html = '<h4>Le voile entre les plans : ' + Math.round(v) + ' % (' + Veil.stageName(game) + ')</h4>'
      + '<div>Le temps qui passe l\'use, comme chaque passage d\'un plan à l\'autre (0,8 par unité), chaque invocation (0,25) et chaque grand sort (rare 0,5, très rare 1). À 80, 60, 40 et 20 %, des failles s\'ouvrent : elles relient Arcane et le Miroir, et des créatures du Miroir en sortent.</div>'
      + '<div class="kv"><span class="k">Failles ouvertes</span><span>' + rifts + '</span></div>'
      + (nx != null ? '<div class="kv"><span class="k">Prochain seuil</span><span>' + nx + ' %</span></div>' : '')
      + (Veil.sealed(game) ? '<div class="ok">Sceau planaire actif : le voile ne s\'use plus et les failles se taisent.</div>' : '<div class="dim">Le sort Sceller une faille (arcanique) en referme une et recoud le voile de 6 %.</div>');
    const k = game.crisis;
    if (k) {
      html += '<h4 style="margin-top:8px">La Crise</h4>';
      if (k.state === 'off') html += '<div class="dim">Désactivée pour cette partie.</div>';
      else if (k.state === 'pending') html += '<div>La Brèche s\'ouvrira vers le tour <b>' + k.at + '</b>' + (k.at - game.turn <= 10 ? ', dans <b class="danger">' + Math.max(0, k.at - game.turn) + ' tours</b>' : '') + '. Elle corrompra les terres alentour et lancera des vagues de créatures sur le plus puissant des sorciers.</div>';
      else if (k.state === 'active') { const s = Crisis.site(game); html += '<div class="danger">La Brèche est ouverte' + (s ? ' (' + (s.plane ? 'Miroir' : 'Arcane') + ', ' + s.x + ', ' + s.y + ')' : '') + (game.turn > k.start ? ' depuis ' + U.n(game.turn - k.start, 'tour') : '') + '. Prochaine vague vers le tour ' + k.next + '.</div><div class="dim">Vaincre ses gardiens la referme et met fin à la Crise.</div>'; }
      else html += '<div class="ok">La Brèche est refermée.</div>';
    }
    const pacts = (pl.pacts || []).filter(p => p.state === 'active' || p.state === 'due');
    if (pacts.length) {
      html += '<h4 style="margin-top:8px">Vos pactes</h4>';
      for (const p of pacts) html += '<div class="kv"><span class="k">' + U.esc(Pacts.name(p.entity)) + '</span><span class="' + (p.state === 'due' ? 'danger' : '') + '">' + (p.state === 'due' ? 'à payer' : 'tour ' + p.due) + '</span></div>';
    }
    return html;
  },
  skillTip() { const game = App.game, pl = App.me(); return '<h4>Compétence de lancement</h4>Mana utilisable par tour pour les sorts : <b>' + Magic.totalSkill(game, pl) + '</b> (reste ' + pl.skillLeft + ' ce tour).' + (Magic.incarnate(game, pl) ? '<div style="margin-top:4px">Incarné sur la carte : la moitié de votre compétence (' + (Magic.castingSkill(pl) + Magic.heroSkillBonus(game, pl)) + ').</div>' : '') + (pl.casting ? '<div style="margin-top:4px">En cours : ' + DATA.spells[pl.casting.id].name + ' (' + pl.casting.progress + '/' + pl.casting.cost + ', ' + Spells.castingTurnsText(game, pl) + ')</div>' : ''); },

  // ---------- panneau latéral ----------
  renderSide() {
    const game = App.game, pl = App.me();
    const sel = $('#sel'); sel.innerHTML = '';
    if (App.sel) {
      const units = App.sel.all.map(id => game.units[id]).filter(u => u && u.owner === App.pid);
      if (units.length) {
        // les unités choisies ont disparu (fusion, combat) : on reprend la pile entière
        App.sel.ids = App.sel.ids.filter(id => units.some(u => u.id === id));
        if (!App.sel.ids.length) App.sel.ids = units.map(u => u.id);
        if (MapView.sel) MapView.sel.ids = App.sel.ids;
      }
      if (!units.length) { App.sel = null; MapView.sel = null; }
      else {
        const u0 = units[0];
        const city = Cities.at(game, u0.plane, u0.x, u0.y);
        const setSel = ids => { App.sel.ids = ids; MapView.sel.ids = ids; MapView.path = null; App.refresh(); };
        const one = () => { const first = App.sel.ids.map(id => game.units[id]).find(u => u && u.moves > 0) || game.units[App.sel.ids[0]] || units[0]; setSel([first.id]); };
        const selBtns = units.length > 1 ? h('span', { class: 'selbtns' },
          h('button', { class: 'abtn mini', disabled: App.sel.ids.length === units.length, onclick: () => setSel(units.map(u => u.id)) }, 'Tout sélectionner'),
          h('button', { class: 'abtn mini', disabled: App.sel.ids.length === 1, onclick: one }, 'Une unité')) : null;
        const head = h('div', { class: 'stackhead' }, h('h3', null, city ? city.name : World.terrainKey(game.world, u0.plane, u0.x, u0.y) && DATA.terrain[World.terrainKey(game.world, u0.plane, u0.x, u0.y)].name), h('span', { class: 'dim' }, units.length + ' unité' + (units.length > 1 ? 's' : '')));
        const grid = h('div', { class: 'ucards' });
        for (const u of units) {
          const s = Units.stats(game, u);
          const hp = Units.health(game, u) / s.maxHp;
          const lv = Units.levelInfo(game, u);
          const card = h('div', { class: 'ucard' + (App.sel.ids.includes(u.id) ? ' sel' : '') + (u.moves <= 0 ? ' done' : '') },
            UI.glowCanvas(spriteCanvas(Sprites.unitKey(u), 32), game, u), h('div', { class: 'nm' }, Units.label(u)), h('div', { class: 'hp' }, h('i', { style: 'width:' + Math.round(hp * 100) + '%;background:' + (hp > .6 ? 'var(--ok)' : hp > .3 ? 'var(--gold)' : 'var(--danger)') })),
            lv && Units.levelIndex(game, u) > 0 ? h('span', { class: 'lv' }, '★'.repeat(Math.min(3, Units.levelIndex(game, u)))) : null,
            h('span', { class: 'mv' }, (u.moves / 2).toString().replace('.', ',') + '/' + (Units.maxMoves(game, u) / 2).toString().replace('.', ',')),
            u.ench.length ? h('span', { class: 'ench' }) : null,
            Units.realmOf(u) ? h('span', { class: 'rgem', style: '--rc:' + REALM_COLORS[Units.realmOf(u)], title: UI.kindLabel(u).text }) : null);
          // héros : un clic ouvre sa fiche (Maj ou Ctrl + clic : le retirer ou l'ajouter à la sélection)
          card.addEventListener('click', (e) => { if (u.hero && !e.shiftKey && !e.ctrlKey) { UI.hideTip(); Panels.heroSheet(u); return; } App.toggleUnit(u.id, e.shiftKey || e.ctrlKey); });
          card.addEventListener('contextmenu', (e) => { if (!u.hero) return; e.preventDefault(); UI.hideTip(); Panels.heroSheet(u); });
          card.addEventListener('dblclick', () => { App.sel.ids = [u.id]; App.refresh(); });
          UI.tipOn(card, () => UI.unitTip(u, game));
          grid.append(card);
        }
        sel.append(head);
        if (selBtns) sel.append(selBtns);
        sel.append(grid);
        // expérience gagnée chaque tour par la pile, bonus compris
        {
          const parts = [], norm = units.filter(u => Units.isNormal(u)), heroes = units.filter(u => u.hero), other = units.filter(u => !u.hero && !Units.isNormal(u) && !Units.isFantastic(u));
          if (norm.length) { const x = Units.xpPerTurn(game, norm[0]); parts.push('<b>+' + x.total + '</b> par unité normale' + (x.arms ? ' (1 + ' + x.arms + ', maître d\'armes ' + App.de(U.esc(x.by.hero.name)) + ')' : '')); }
          if (heroes.length) parts.push('<b>+1</b> par héros');
          if (other.length) parts.push('<b>+1</b> pour ' + (other.length > 1 ? 'les autres' : 'l\'autre'));
          // les créatures invoquées n'en gagnent jamais ; un maître d'armes n'entraîne que les unités normales
          if (units.some(u => !u.hero && Units.isFantastic(u))) parts.push('<b>0</b> pour les créatures invoquées');
          const am = heroes.find(u => Units.armsmasterXp(game, u) > 0);
          if (am && !norm.length) parts.push('maître d\'armes ' + App.de(U.esc(am.hero.name)) + ' sans effet : pas d\'unité normale à entraîner');
          if (parts.length) sel.append(h('div', { class: 'dim', style: 'font-size:12px;margin:4px 0 2px', html: 'Expérience par tour : ' + parts.join(' · ') }));
        }
        // chantier de route en cours
        const eng = units.find(u => App.sel.ids.includes(u.id) && Units.isEngineer(u) && (u.status === 'road' || u.status === 'roadto'));
        if (eng) {
          const rp = Game.roadProgress(game, eng), parts = [];
          if (rp.here) parts.push('Chantier ' + rp.here.work + ' / ' + rp.here.need + ' · ' + U.n(rp.here.left, 'tour') + ' restant' + (rp.here.left > 1 ? 's' : ''));
          if (rp.total) parts.push('Itinéraire ' + rp.done + ' / ' + rp.total + ' cases · ≈ ' + U.n(rp.turns, 'tour'));
          if (parts.length) sel.append(h('div', { class: 'gold', style: 'font-size:12px;margin:4px 0 2px' }, parts.join(' — ')));
        }
        sel.append(App.actionButtons(units, city));
      }
    }
    // case survolée
    const ti = $('#tileinfo');
    const hv = MapView.hover;
    if (hv && pl.explored[MapView.plane][hv.y * game.world.w + hv.x]) ti.innerHTML = App.tileInfoHtml(MapView.plane, hv.x, hv.y);
    else ti.innerHTML = '<span class="dim">' + PLANE_NAMES[MapView.plane] + ' · survolez une case</span>';
    // bouton suivant
    const left = App.unitsWaiting();
    $('#btn-next').textContent = left.length ? 'Suivante (' + left.length + ')' : 'Suivante';
    const be = $('#btn-end'); if (be) { const warn = left.length && App.endWarned === game.turn; be.textContent = warn ? 'Passer quand même' : 'Fin du tour'; be.classList.toggle('warned', !!warn); }
  },
  tileInfoHtml(p, x, y) {
    const game = App.game, world = game.world;
    const key = World.terrainKey(world, p, x, y);
    const td = DATA.terrain[key];
    let html = '<b>' + td.name + '</b> <span class="dim">(' + x + ',' + y + ')</span>';
    const m = MIN_KEYS[World.get(world, p, 'mineral', x, y)];
    if (m) html += ' · <span class="gold">' + DATA.minerals[m].name + '</span>';
    if (World.hasRoad(world, p, x, y)) html += ' · route';
    else if (world.planes[p].roadWork[x + ',' + y]) html += ' · <span class="gold">route en chantier (' + world.planes[p].roadWork[x + ',' + y] + ' / ' + (td.roadTurns || 4) + ')</span>';
    if (World.get(world, p, 'corrupt', x, y)) html += ' · <span class="danger">corrompue</span>';
    const mtnShut = Move.blockedMountain(App.game, p, x, y);
    html += '<div class="dim">Nourriture ' + String(World.foodOf(world, p, x, y)).replace('.', ',') + (td.prodPct ? ' · production +' + td.prodPct + ' %' : '') + (mtnShut ? '' : ' · coût ' + td.move) + '</div>';
    if (mtnShut) html += '<div class="dim" style="color:#e8b46a">Infranchissable sans route, sauf pour les volants, les montagnards et les ingénieurs. Cache ce qu\'il y a derrière.</div>';
    else if (World.terr(world, p, x, y) === T.HILLS) html += '<div class="dim">Une unité sur une colline voit une case plus loin.</div>';
    const own = World.get(world, p, 'owner', x, y);
    if (own >= 0 && game.players[own]) html += Players.knows(game, App.pid, own) ? '<div>Territoire ' + App.de('<span style="color:' + game.players[own].color + '">' + U.esc(game.players[own].name) + '</span>') + '</div>' : '<div class="muted">Territoire d\'un sorcier inconnu</div>';
    const sv = App.settlerView();
    if (sv && sv.plane === p && !World.isWaterAt(world, p, x, y)) {
      const chk = Cities.canFoundAt(game, App.pid, p, x, y);
      if (!chk.ok) html += '<div class="danger">' + U.esc(chk.why) + '</div>';
      else {
        const s = Cities.siteInfo(game, App.pid, p, x, y);
        const best = sv.sites.find(o => o.x === x && o.y === y);
        html += '<div class="sitebox"><b class="gold">' + (best ? '★ Site recommandé' : 'Fonder une cité ici') + '</b><div>Population max <b>' + s.maxPop + '</b> · production +' + s.prodPct + ' % · commerce +' + s.goldPct + ' %</div>'
          + (s.minerals.length ? '<div>Ressources : ' + U.esc(U.uniq(s.minerals).map(k => DATA.minerals[k].name).join(', ')) + '</div>' : '')
          + (s.shared ? '<div class="warn">' + U.n(s.shared, 'case partagée', 'cases partagées') + ' avec une autre cité (rendement divisé par deux)</div>' : '')
          + (s.unknown ? '<div class="dim">' + U.n(s.unknown, 'case inexplorée', 'cases inexplorées') + ' non comptée' + (s.unknown > 1 ? 's' : '') + '</div>' : '') + '</div>';
      }
    }
    const fc = MapView.forecast;
    if (fc && fc.x === x && fc.y === y && fc.plane === p && App.sel && (!fc.sel || fc.sel === App.sel.ids.join(','))) {
      if (fc.refused) html += '<div class="danger"><b>Attaque impossible</b> : ' + U.esc(fc.refused) + '</div>';
      else if (fc.pending) html += '<div class="dim">Vos capitaines jaugent l\'adversaire…</div>';
      else if (fc.unknown) html += '<div class="muted"><b>Prévision</b> : forces inconnues, aucun rapport sur cette case. Envoyez un éclaireur.</div>';
      else {
        const col = fc.empty || fc.win >= .65 ? 'ok' : fc.win >= .4 ? 'gold' : 'danger';
        html += '<div class="' + col + '"><b>Prévision</b> : ' + (fc.reportAge != null && fc.empty ? 'aucun défenseur lors du dernier rapport.' : Game.forecastLabel(fc)) + '</div>';
        if (fc.reportAge != null) html += '<div class="dim">D\'après un rapport ' + UI.ago(fc.reportAge) + ' : la situation a pu changer.</div>';
      }
    }
    const cc = Game.cacheAt(game, p, x, y);
    if (cc) html += '<div><span class="gold">' + Game.CACHE[cc.kind].name + '</span> · trouvaille sans gardien : passez dessus pour la ramasser</div>';
    const si = World.get(world, p, 'site', x, y);
    const an = Game.auraAt(game, p, x, y);
    if (an && an.owner >= 0 && !(an.x === World.wx(world, x) && an.y === y)) html += '<div><span style="color:' + REALM_COLORS[an.realm] + '">Aura du ' + Game.siteName(an).toLowerCase() + '</span> <span class="dim">(' + (an.owner >= 0 && game.players[an.owner] ? 'lié à ' + U.esc(Players.nameFor(game, App.pid, an.owner)) : 'libre') + ', ' + an.x + ', ' + an.y + ')</span></div>';
    if (si >= 0) {
      const s = game.sites[si], kn = Game.isLair(s) ? Game.siteKnown(App.me(), s) : null;
      html += '<div><span class="gold">' + U.cap(Game.siteName(s)) + '</span>' + (s.type === 'node' ? ' (puissance ' + s.power + (s.owner >= 0 && game.players[s.owner] ? ', lié à ' + U.esc(Players.nameFor(game, App.pid, s.owner)) + (s.meldBy === 'GuardianSpirit' ? ' par un esprit gardien' : '') : '') + (s.awake ? ', éveil ' + s.awake + '/3' : '') + ')' + (s.owner === App.pid && (s.awake || 0) < 3 ? '<div class="dim">Prochain éveil dans ' + Math.max(0, Game.NODE_AWAKE_AT[s.awake || 0] - (game.turn - (s.heldSince || game.turn))) + ' tours</div>' : '') : '') + (s.type === 'node' && s.owner < 0 && kn && (kn.cleared || !kn.guards.length) ? ' · <span class="ok">sans gardien, à lier</span>' : Game.knownCleared(App.me(), s) ? ' · <span class="dim">exploré</span>' : kn && kn.loot && !kn.guards.length ? ' · <span class="ok">plus de gardiens, trésor à prendre</span>' : Game.isLair(s) && !kn ? ' · <span class="dim">inexploré</span>' : '') + '</div>';
      if (s.type === 'tower') html += '<div class="dim">' + (s.cleared ? 'Passage vers ' + (s.plane ? 'Arcane' : 'le Miroir') + ' : vos unités ici peuvent changer de plan (P).' : 'Prise, elle ouvre un passage vers ' + (s.plane ? 'Arcane' : 'le Miroir') + '.') + '</div>';
      if (kn && !kn.cleared && kn.guards.length) html += '<div class="danger">Gardé : ' + App.guardianHint(kn.guards, s) + ' <span class="dim">· vu au tour ' + kn.t + '</span></div>';
      if (s.type === 'node') html += App.nodeHtml(s);
      html += App.specialSiteHtml(s);
      html += App.questHtml(s);
    }
    const c = Cities.at(game, p, x, y);
    if (c) html += '<div>' + (c.fortress ? '<span class="gold">★</span> ' : '') + U.esc(c.name) + ' · ' + Cities.sizeName(c) + ' de ' + DATA.races[c.race].name + ' · ' + U.fmt(c.pop) + ' hab.' + (c.owner < 0 ? ' · <span class="dim">indépendante</span>' : '') + '</div>'
      + (c.fortress && game.players[c.owner] ? '<div class="gold">' + (c.owner === App.pid ? 'Votre capitale' : 'Capitale ' + App.de(U.esc(Players.nameFor(game, App.pid, c.owner)))) + ' : la forteresse du sorcier. La perdre, c\'est être banni.</div>' : '');
    const vis = MapView.vis && MapView.vis[p][y * world.w + x];
    if (vis) {
      const foes = Units.at(game, p, x, y).filter(u => u.owner !== App.pid && u.guardian == null && !Intel.hiddenFrom(game, App.pid, u));
      if (foes.length) html += '<div class="danger">' + U.n(foes.length, 'unité') + ' : ' + U.esc(U.uniq(foes.map(u => Units.label(u))).slice(0, 4).join(', ')) + '</div>';
    } else {
      const rep = App.intelAt(p, x, y);
      if (rep && rep.units.length) html += '<div class="muted">Rapport ' + UI.ago(game.turn - rep.t) + ' : ' + U.n(rep.units.length, 'unité') + ' (' + U.esc(U.uniq(rep.units.map(u => DATA.units[u.type].name)).slice(0, 4).join(', ')) + ')</div>';
      else if (rep && Cities.at(game, p, x, y)) html += '<div class="muted">Rapport ' + UI.ago(game.turn - rep.t) + ' : aucun défenseur</div>';
    }
    return html;
  },
  // nœud : son aura, ce qu'il rapporte, et ce qu'il change en combat
  nodeHtml(s) {
    const game = App.game, me = App.me(), n = Game.aura(game, s).length, rn = REALM_NAMES[s.realm].toLowerCase();
    if (s.devoured) return '<div class="danger">Dévoré : il n\'en reste rien.</div>';
    let html = '<div class="dim">' + (s.owner >= 0 ? (s.warped != null ? 'Aura de ' + n + ' cases, presque éteinte.' : 'Aura de ' + n + ' cases, qui scintille aux couleurs de son maître.') : 'Son aura se révélera quand un esprit le liera.') + '</div>';
    const gain = Magic.nodePower(game, me, s), gainFree = Magic.nodePower(game, me, Object.assign({}, s, { warped: null }));   // le lier efface la perversion
    if (s.warped != null) html += '<div class="danger">' + (s.warped === App.pid ? 'Vous l\'avez perverti' : 'Perverti par ' + U.esc(Players.nameFor(game, App.pid, s.warped))) + ' : ne produit rien et coûte 5 mana par tour à son maître. Un Désenchantement de zone peut le libérer.</div>';
    html += s.owner === App.pid ? (s.warped != null ? '' : '<div class="ok">Vous rapporte ' + gain + ' de puissance par tour' + (gain > s.power ? ' (doublée par vos dons)' : '') + '.</div>')
      : '<div class="dim">Lié par un esprit, il vous rapporterait ' + gainFree + ' de puissance par tour.</div>';
    html += '<div class="dim" style="margin-top:3px">Combat ici : créatures de ' + rn + ' +2 en attaque, défense et résistance ; les sorts des autres royaumes s\'y dissipent souvent (un sort de 10 mana n\'a que 17 % de chances de passer, un de 50 mana 50 %)' + (me.retorts.includes('nodeMastery') ? ', mais pas les vôtres : vous avez la Maîtrise des nœuds' : '') + '.</div>';
    return html;
  },
  specialSiteHtml(s) {
    const game = App.game, pl = App.me();
    if (s.type === 'rift') return '<div class="dim">Relie Arcane et le Miroir : une pile qui s\'y trouve peut changer de plan (P). Des créatures du Miroir en sortent de temps à autre. Le sort Sceller une faille la referme.</div>';
    if (s.type === 'breach') return '<div class="dim">Source de la Crise : elle corrompt les terres alentour, se renforce et lâche des vagues de créatures. Vaincre ses gardiens la referme.</div>';
    if (s.type === 'phylactery') return '<div class="dim">Détruit, le Seigneur liche ne se relève plus et ses morts s\'effondrent.</div>';
    if (s.type === 'citadel') return '<div class="dim">Tant qu\'elle tient, l\'Archimage frappe le meneur et lâche ses créatures. La prendre met fin à la crise.</div>';
    if (s.type === 'winterheart') return '<div class="dim">Le givre s\'étend autour de lui. Brisé, tout dégèle.</div>';
    if (s.type !== 'shrine') return '';
    const e = Pacts.ENT[s.entity]; if (!e) return '';
    const mine = Pacts.pactWith(pl, s.entity);
    let html = '<div class="dim" style="font-style:italic">' + U.esc(e.lore) + '</div><div>' + U.esc(e.hint) + '</div>';
    if (mine) html += '<div class="' + (mine.state === 'due' ? 'danger' : 'gold') + '">' + (mine.state === 'active' ? 'Pacte en cours : échéance au tour ' + mine.due : mine.state === 'due' ? 'Votre dette est échue' : mine.state === 'paid' ? 'Pacte soldé' : 'Pacte rompu') + '</div>';
    else html += '<div class="dim">Entrez dans le sanctuaire pour entendre son offre.</div>';
    return html;
  },
  // ce que les troupes ont vu en entrant : combien, et la créature la plus redoutable
  guardianHint(guards, s) {
    const n = guards.length; if (!n) return 'personne';
    const str = t => Units.strength(App.game, { type: t, ench: [], xp: 0, owner: -1, dmg: 0 });
    const main = guards.reduce((a, b) => str(b) > str(a) ? b : a), mn = DATA.units[main] ? DATA.units[main].name : main;
    const nem = s && s.nemesis && guards.includes(s.nemesis.type) ? ', et ' + s.nemesis.data.name + ' (' + DATA.units[s.nemesis.type].name + '), votre némésis' : '';
    return (n > 1 ? n + ' créatures, la plus redoutable : ' + mn : mn + ' (1 créature)') + nem;
  },
  guardUnits(guards, plane, x, y) { return guards.map(t => ({ id: 0, type: t, owner: -1, plane, x, y, dmg: 0, xp: 0, moves: 0, ench: [], weapon: 0, undead: false, summoned: true })); },
  actionButtons(units, city) {
    const game = App.game;
    const sel = units.filter(u => App.sel.ids.includes(u.id));
    const box = h('div', { class: 'actions' });
    const b = (label, key, fn, enabled = true, cls = '', tip) => { const e = h('button', { class: 'abtn ' + cls, onclick: fn, disabled: !enabled }, label, key ? h('span', { class: 'k' }, key) : null); if (tip) UI.tipOn(e, tip); box.append(e); };
    const settler = sel.find(u => Units.isSettler(u));
    if (settler) { const chk = Cities.canFoundAt(game, App.pid, settler.plane, settler.x, settler.y); b('Fonder', 'B', () => App.found(settler), chk.ok, 'primary', chk.ok ? 'Fonder une nouvelle cité ici' : chk.why); }
    if (sel.some(u => Units.isEngineer(u))) {
      { const has = World.hasRoad(game.world, sel[0].plane, sel[0].x, sel[0].y), tt = DATA.terrain && DATA.terrain[T_KEYS[World.terr(game.world, sel[0].plane, sel[0].x, sel[0].y)]], noRoad = tt && !tt.roadTurns;
        b('Route', 'R', () => { const r = Game.buildRoad(game, sel.map(u => u.id)); if (!r.ok) UI.toast(r.why, 'warn'); App.afterAction(); }, !has && !noRoad, '', has ? 'Il y a déjà une route ici.' : noRoad ? 'On ne bâtit pas de route sur ce terrain.' : 'Construire une route sur cette case' + (tt ? ' (' + U.n(tt.roadTurns, 'tour') + ')' : '')); }
      b('Route vers…', '⇧R', () => App.startRoadTo(sel), true, App.roadMode ? 'primary' : '', 'Tracer une route jusqu\'à une destination : les ingénieurs l\'empierrent case après case, tour après tour');
    }
    if (sel.some(u => Units.has(game, u, 'purify'))) {
      { const cor = !!World.get(game.world, sel[0].plane, 'corrupt', sel[0].x, sel[0].y), k0 = sel[0].plane + ',' + sel[0].x + ',' + sel[0].y, w0 = Math.max(0, ...sel.map(u => u.purifyAt === k0 ? u.purifyWork || 0 : 0));   // le travail compte pour cette case-ci seulement
        b('Purifier', null, () => { Game.purify(game, sel.map(u => u.id)); App.afterAction(); }, cor, '', cor ? 'Purifier cette terre (3 tours)' + (w0 ? ' : ' + w0 + ' / 3 déjà faits' : '') : 'Cette terre n\'est pas corrompue.'); }
      b('Purifier tout', null, () => App.autoPurify(sel), true, '', 'Purification automatique : l\'unité va d\'elle-même de terre corrompue en terre corrompue, celles de vos cités d\'abord, tour après tour');
    }
    const melder = sel.find(u => Units.has(game, u, 'meld'));
    // seulement sur un nœud ; grisé, avec la raison, quand la fusion ne servirait à rien (nœud déjà à vous et bien gardé…)
    const mc = melder && Game.canMeld(game, melder);
    if (melder && !mc.off) b('Fusionner', null, () => { const r = Game.meld(game, melder.id); if (!r.ok || r.failed) UI.toast(r.why, 'warn'); MapView.invalidate(); App.afterAction(); }, mc.ok, mc.ok ? 'primary' : '', mc.ok ? mc.what : mc.why);
    if (sel.some(u => (u.path && u.path.length) || u.status === 'roadto')) b('Annuler l\'ordre', null, () => App.cancelOrders(sel), true, '', sel.some(u => u.status === 'roadto') ? 'Abandonner la route en cours' : 'Oublier l\'itinéraire en cours');
    b('Explorer', 'X', () => App.explore(sel), true, '', 'Exploration automatique : la pile part d\'elle-même vers les terres inconnues, tour après tour');
    b('Sentinelle', 'S', () => { for (const u of sel) { u.status = 'sentry'; u.path = null; } App.selectNext(); });
    const promo = sel.length === 1 ? Game.promoteOptions(game, sel[0]) : [];
    if (promo.length) b('Promouvoir', null, () => App.promoteDialog(sel[0]), true, '', 'Ce vétéran peut être rééquipé en unité supérieure, en gardant son grade');
    const hero = sel.find(u => u.hero && !u.avatar);
    if (hero && city && city.owner === App.pid) {
      if (hero.status === 'governor' && hero.govCity === city.id) b('Relever', null, () => { hero.status = ''; hero.govCity = null; UI.toast(U.esc(hero.hero.name) + ' n\'est plus gouverneur de ' + U.esc(city.name) + '.'); App.refresh(); }, true, '', 'Retirer à ce héros le gouvernement de la cité');
      else b('Gouverner', null, () => App.governDialog(hero, city), true, '', 'Confier la cité à ce héros : bonus selon son niveau et ses talents, et il choisit la production quand la file est vide');
    }
    if (city && city.owner === App.pid && sel.some(u => Units.canHealInCity(game, u))) b('Soigner', 'H', () => App.healInCity(sel), true, '',
      (Cities.hasEnch(city, 'stream_of_life') || (App.me().globals || []).includes('herb_mastery') ? 'Rester dans la cité : entièrement soignée au prochain tour (' + (Cities.hasEnch(city, 'stream_of_life') ? 'Source de vie' : 'Maîtrise des simples') + ')' : 'Rester dans la cité jusqu\'à guérison complète (' + (city.buildings.animistsGuild ? 15 : 10) + ' % des points de vie par tour)') + ' ; l\'unité se réveille d\'elle-même une fois soignée');
    const shrine = Pacts.shrineAt(game, sel[0].plane, sel[0].x, sel[0].y);
    if (shrine && !Pacts.pactWith(App.me(), shrine.entity)) b('Pacte', null, async () => { await Pacts.propose(game, App.me(), shrine); MapView.bumpVis(); App.refresh(); }, true, 'primary', 'Écouter l\'offre de ' + Pacts.ENT[shrine.entity].name);
    if (App.canUndo()) b('Annuler', 'U', () => App.undoMove(), true, '', () => { const u = App.undo && App.game.units[App.undo.ids[0]]; return 'Annuler le dernier déplacement' + (u ? ' (' + U.esc(Units.label(u)) + ')' : '') + ' : il n\'a rien révélé'; });
    b('Attendre', 'W', () => App.selectNext(false, sel.map(u => u.id)), true, '', 'Plus tard dans ce tour : « Suivante » y reviendra');
    b('Passer', 'F', () => App.passTurn(sel), true, '', 'Rien pour cette unité ce tour-ci : « Suivante » ne la proposera plus et la fin du tour ne l\'attendra pas');
    const psWhy = Game.planeShiftBlock(game, sel, sel[0].plane, sel[0].x, sel[0].y);
    b('Plan', 'P', async () => { const r = Game.planeShift(game, sel.map(u => u.id)); if (!r.ok) UI.toast(r.why, 'warn'); else { MapView.plane = sel[0].plane; MapView.centerOn(sel[0].x, sel[0].y); MapView.bumpVis(); App.selectTile(sel[0].plane, sel[0].x, sel[0].y, sel.map(u => u.id)); } App.afterAction(); }, !psWhy, '', psWhy || 'Changer de plan (tour de sorcellerie dégagée, faille, porte astrale ou capacité)');
    if (city && city.owner === App.pid) b('Cité', null, () => CityUI.open(city.id));
    if (city && city.owner === App.pid && Cities.hasEnch(city, 'earth_gate') && Game.earthGateCities(game, city).length) b('Porte tellurique', null, async () => {
      const to = await UI.choice('Porte tellurique', '<p>Vers quelle cité ? (1 point de mouvement)</p>', Game.earthGateCities(game, city).map(c => ({ label: c.name, value: c.id })).concat([{ label: 'Annuler', value: null }]));
      if (to == null) return;
      const r = Game.earthGate(game, sel.map(u => u.id), to);
      if (!r.ok) UI.toast(r.why, 'warn'); else { const c = game.cities[to]; MapView.centerOn(c.x, c.y); App.selectTile(c.plane, c.x, c.y, sel.map(u => u.id)); MapView.bumpVis(); }
      App.refresh();
    }, sel.every(u => u.moves >= 2), '', 'Passer par la porte tellurique vers une autre de vos cités qui en est dotée');
    if (sel.some(u => u.hero) || App.me().vault.length) b('Objets', null, () => Panels.items(sel.find(u => u.hero) || null));
    const av = sel.find(u => u.avatar);
    if (av) { b('Regagner la tour', null, async () => { if (await UI.confirm('Regagner la tour', 'Quitter la carte et retrouver toute votre compétence de lancement ? Il faudra relancer le sort pour redescendre.')) { Game.disband(game, av.id); App.sel = null; MapView.bumpVis(); App.refresh(); } }, true, '', 'Quitter la carte sans danger'); return box; }
    b('Dissoudre', null, async () => { const u0 = sel[0], left = Units.at(game, u0.plane, u0.x, u0.y).filter(o => o.owner === u0.owner && !sel.includes(o));
      const sinks = World.isWaterAt(game.world, u0.plane, u0.x, u0.y) && sel.some(o => Units.stats(game, o).sailing) && left.some(o => { const s = Units.stats(game, o); return !s.flying && !s.swimming && !s.sailing && !s.ab.waterWalking; });
      if (await UI.confirm('Dissoudre', 'Renvoyer définitivement ' + U.n(sel.length, 'unité') + ' ?' + (sinks ? ' Les unités embarquées sans navire périront en mer.' : ''))) { for (const u of sel) Game.disband(game, u.id); App.sel = null; MapView.bumpVis(); App.refresh(); } }, true, 'danger');
    return box;
  },
  renderMinimap() {
    const cv = $('#minimap'); if (!cv || !App.game) return;
    MapView.drawMinimap(cv);
    $('#mm-plane').textContent = PLANE_NAMES[MapView.plane];
  },
  redraw() { MapView.draw(); },

  // ---------- préférences d'interface ----------
  prefs: (() => { try { return Object.assign({ autoNext: true, autoExport: 0, autoExportN: 10, scoutRevisit: true }, JSON.parse(localStorage.getItem('arcanes:ui') || '{}')); } catch (e) { return { autoNext: true, autoExport: 0, autoExportN: 10, scoutRevisit: true }; } })(),
  setPref(k, v) { App.prefs[k] = v; try { localStorage.setItem('arcanes:ui', JSON.stringify(App.prefs)); } catch (e) { /* stockage indisponible */ } },
  // la sélection n'a plus rien à faire ce tour-ci (mouvements épuisés, ou ordre en cours) : on passe à l'unité suivante
  autoAdvance(delay = 300) {
    if (!App.prefs.autoNext) return;
    const game = App.game, sel = App.sel;
    clearTimeout(App._autoT);
    App._autoT = setTimeout(() => {
      if (!App.game || App.game !== game || App.sel !== sel || App.moving || UI.busy || CombatView.active) return;
      const units = (sel ? sel.ids : []).map(id => game.units[id]).filter(Boolean);
      if (units.some(u => u.moves > 0 && !u.status && !(u.path && u.path.length))) return;
      App.selectNext();
    }, delay);
  },

  // ---------- sélection ----------
  selectTile(plane, x, y, keepIds) {
    const game = App.game;
    const units = Units.at(game, plane, x, y).filter(u => u.owner === App.pid);
    if (!units.length) { App.sel = null; MapView.sel = null; MapView.path = null; App.refresh(); return false; }
    // un clic sur une pile la sélectionne tout entière ; dans une cité, la garnison en sentinelle reste à son poste
    const city = Cities.at(game, plane, x, y);
    const army = city ? units.filter(u => u.status !== 'sentry' && u.status !== 'fortify' && u.status !== 'governor') : units;
    const ids = keepIds || (army.length ? army : units).map(u => u.id);
    App.sel = { plane, x, y, all: units.map(u => u.id), ids: ids.length ? ids : units.map(u => u.id) };
    MapView.sel = { tileKey: plane + ':' + x + ',' + y, ids: App.sel.ids };
    MapView.path = null;
    // une unité désignée nommément (unité suivante, liste) se réveille ; une simple sélection de la pile ne réveille personne
    if (keepIds) for (const u of units) if ((u.status === 'sentry' || u.status === 'explore' || u.status === 'heal') && App.sel.ids.includes(u.id)) u.status = '';
    App.refresh();
    return true;
  },
  toggleUnit(id, multi) {
    if (!App.sel) return;
    if (multi) { if (App.sel.ids.includes(id)) { if (App.sel.ids.length > 1) App.sel.ids = App.sel.ids.filter(x => x !== id); } else App.sel.ids.push(id); }
    else { App.sel.ids = App.sel.ids.length === 1 && App.sel.ids[0] === id ? App.sel.all.slice() : [id]; }
    MapView.sel.ids = App.sel.ids;
    App.refresh();
  },
  unitsWaiting() {
    const game = App.game;
    // une unité rapide qui a marché ce tour avec des plus lentes, à bout de mouvement à ses côtés, s'arrête avec elles
    const tied = u => u.groupMove && u.groupMove.turn === game.turn && u.groupMove.ids.some(id => { const o = id !== u.id && game.units[id]; return o && o.plane === u.plane && o.x === u.x && o.y === u.y && o.moves <= 0; });
    return Object.values(game.units).filter(u => u.owner === App.pid && u.moves > 0 && !u.status && !u.path && u.guardian == null && u.passed !== game.turn && !tied(u));
  },
  // passer son tour : l'unité reste où elle est, sans ordre durable (contrairement à Sentinelle) ; elle reviendra au tour suivant
  passTurn(sel) {
    const game = App.game; if (!sel || !sel.length) return;
    for (const u of sel) u.passed = game.turn;
    App.selectNext(false, sel.map(u => u.id));
  },
  selectNext(first, skipIds, other) {
    const game = App.game;
    if (skipIds) for (const id of skipIds) { const u = game.units[id]; if (u) u.waited = game.turn; }
    const curIds = other && App.sel ? App.sel.ids : [];
    let cands = App.unitsWaiting().filter(u => u.waited !== game.turn && !curIds.includes(u.id));
    if (!cands.length) cands = App.unitsWaiting().filter(u => u.waited !== game.turn);
    let cycle = false;
    if (!cands.length) {
      // tout le monde a déjà attendu : « Suivante » fait le tour des piles, une à une, sans rester sur la même
      cands = App.unitsWaiting().filter(u => !skipIds || !skipIds.includes(u.id));
      const others = cands.filter(u => !curIds.includes(u.id) && !(App.sel && u.plane === App.sel.plane && u.x === App.sel.x && u.y === App.sel.y));
      if (others.length) { cands = others; cycle = true; }
    }
    if (!cands.length) { App.sel = null; MapView.sel = null; MapView.path = null; App.refresh(); return; }
    let u = cands[0];
    const cur = !first && App.sel ? game.units[App.sel.ids[0]] : null;
    if (cur && cycle) { const ord = cands.slice().sort((a, b) => a.id - b.id); u = ord.find(c => c.id > cur.id) || ord[0]; }
    else if (cur) u = U.min(cands, c => (c.plane !== cur.plane ? 100 : 0) + World.dist(game.world, c.x, c.y, cur.x, cur.y) - (Units.isSettler(c) ? .5 : 0));
    else { const sc = cands.find(c => Units.isScout(c)); if (sc) u = sc; }  // début de tour : l'éclaireur d'abord
    MapView.centerOn(u.x, u.y, u.plane);
    // dans une cité, la garnison n'est pas une armée : on ne prend que l'unité désignée ;
    // en campagne, toute la pile qui attend des ordres sur la case part ensemble
    const inCity = !!Cities.at(game, u.plane, u.x, u.y);
    const waiting = App.unitsWaiting().filter(o => o.plane === u.plane && o.x === u.x && o.y === u.y).map(o => o.id);
    App.selectTile(u.plane, u.x, u.y, inCity ? [u.id] : waiting);
  },
  afterAction() { MapView.bumpVis(); App.refresh(); App.showContacts(); App.autoAdvance(250); },
  // colon sélectionné : meilleurs sites et cases interdites (mis en cache)
  settlerView() {
    const game = App.game; if (!game || !App.sel) return null;
    const st = App.sel.ids.map(id => game.units[id]).find(u => u && Units.isSettler(u));
    if (!st) return null;
    const key = [game.turn, st.id, st.plane, st.x, st.y, Object.keys(game.cities).length, MapView.visTurn].join(':');
    if (App._svKey !== key) {
      const world = game.world, forbid = new Uint8Array(world.w * world.h);
      for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) if (!World.isWaterAt(world, st.plane, x, y) && !Cities.canFoundAt(game, App.pid, st.plane, x, y).ok) forbid[y * world.w + x] = 1;
      App._sv = { plane: st.plane, settler: st, forbid, sites: Cities.bestSites(game, App.pid, st.plane, st.x, st.y) };
      App._svKey = key;
    }
    return App._sv;
  },

  // les troupes entrent dans un lieu inexploré (ou déjà vu) et regardent : combien de gardiens, quelles chances ; on décide
  async scoutPrompt(ids, site) {
    const game = App.game, units = ids.map(id => game.units[id]).filter(Boolean);
    Game.noteSite(game, App.pid, site); MapView.invalidate(); App.refresh();
    const k = Game.siteKnown(App.me(), site), f = Game.forecast(game, units.map(u => u.id), site.plane, site.x, site.y, 12, { defenders: App.guardUnits(k.guards, site.plane, site.x, site.y) });
    const col = f ? (f.win >= .65 ? 'ok' : f.win >= .4 ? 'gold' : 'danger') : '';
    const who = units.every(u => Units.isScout(u)) ? (units.length > 1 ? 'Vos éclaireurs découvrent ' : 'Votre éclaireur découvre ') : 'Vos troupes découvrent ';
    return UI.confirm(U.cap(Game.siteName(site)), who + App.guardianHint(k.guards, site) + '.' + (f ? '<p style="margin-top:8px">Chances de victoire <b class="' + col + '">' + Game.chanceWord(f.win) + '</b>' + Game.forecastLabel(f).replace(/^[^,]*/, '') + '.</p>' : ''), 'Attaquer', 'Repartir');
  },
  // l'éclaireur le plus proche d'un lieu où le joueur n'est jamais entré (hors Brèche), à moins de maxSteps pas
  lairToScout(units, maxSteps, avoid) {
    const game = App.game, pl = App.me(), u0 = units[0], w = game.world, ex = pl.explored[u0.plane];
    const cands = game.sites.filter(s => s.plane === u0.plane && s.type !== 'breach' && !s.finale && Game.isLair(s) && !Game.siteKnown(pl, s) && ex[s.y * w.w + s.x] && World.dist(w, s.x, s.y, u0.x, u0.y) <= maxSteps
      && !(avoid || []).some(a => a[0] === s.x && a[1] === s.y))
      .sort((a, b) => World.dist(w, a.x, a.y, u0.x, u0.y) - World.dist(w, b.x, b.y, u0.x, u0.y)).slice(0, 6);
    let best = null, bl = Infinity;
    for (const s of cands) { const p = Move.findPath(game, units, u0.plane, s.x, s.y, {}); if (p && p.length && p.length <= maxSteps && p.length < bl) { bl = p.length; best = s; } }
    return best;
  },
  // éclaireurs arrivés devant un lieu inexploré gardé : ils y entrent, et le joueur choisit
  async flushScouts() {
    const game = App.game;
    while ((App.pendingScouts || []).length) {
      const p = App.pendingScouts.shift();
      const units = p.ids.map(id => game.units[id]).filter(u => u && u.owner === App.pid), s = game.sites[p.site];
      if (!units.length || !s || !Game.siteHasGuardians(s) || Game.siteKnown(App.me(), s) || units[0].plane !== s.plane || World.dist(game.world, units[0].x, units[0].y, s.x, s.y) !== 1 || units.some(u => u.moves <= 0)) continue;
      MapView.centerOn(s.x, s.y, s.plane); MapView.ping(s.x, s.y, s.plane);
      App.selectTile(units[0].plane, units[0].x, units[0].y, units.map(u => u.id));
      if (await App.scoutPrompt(units.map(u => u.id), s)) {
        for (const u of units) { u.status = ''; u.path = null; }
        App._scoutOk = s.id; await App.moveSelected(s.x, s.y);
      } else { for (const u of units) u.status = 'explore'; await App.exploreStep(units); }   // ils ressortent et poursuivent leur exploration
    }
  },

  // purification automatique : les unités qui savent purifier vont de terre corrompue en terre corrompue
  async autoPurify(sel) {
    const game = App.game, units = sel.filter(u => Units.has(game, u, 'purify')); if (!units.length) return;
    for (const u of units) { u.status = 'autopurify'; u.path = null; u.dest = null; u.purifyTarget = null; u.purifyGroup = units[0].id; }
    const ok = await App.purifyStep(units);
    if (!ok) UI.toast('Aucune terre corrompue à purifier à sa portée.', 'warn');
    App.selectNext();
  },
  async purifyStep(units) {
    const game = App.game, w = game.world;
    units = units.filter(u => game.units[u.id] && u.status === 'autopurify');
    if (!units.length) return false;
    const u0 = units[0], p = u0.plane, me = App.me();
    // déjà sur une terre corrompue : le travail se fait en fin de tour
    if (World.get(w, p, 'corrupt', u0.x, u0.y)) { for (const u of units) u.purifyTarget = [u0.x, u0.y]; return true; }
    // les cibles des autres purificateurs, et les cases où l'on purifie déjà
    const gid = u0.purifyGroup != null ? u0.purifyGroup : u0.id;
    const taken = new Set();
    for (const o of Object.values(game.units)) if (o.owner === App.pid && o.plane === p && (o.purifyGroup != null ? o.purifyGroup : o.id) !== gid) {
      if (o.status === 'autopurify' && o.purifyTarget) taken.add(o.purifyTarget[1] * w.w + o.purifyTarget[0]);
      if ((o.status === 'purify' || o.status === 'autopurify') && World.get(w, p, 'corrupt', o.x, o.y)) taken.add(o.y * w.w + o.x);
    }
    // les terres de vos cités d'abord (elles y perdent leur rendement), puis les autres
    const own = new Set(); for (const c of Cities.ofPlayer(game, App.pid)) if (c.plane === p) for (const [x, y] of World.catchment(w, c.x, c.y)) own.add(y * w.w + x);
    const ex = me.explored[p], cands = [];
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const k = y * w.w + x;
      if (!ex[k] || !World.get(w, p, 'corrupt', x, y) || World.isWaterAt(w, p, x, y) || taken.has(k) || Move.hostileAt(game, App.pid, p, x, y)) continue;
      cands.push({ x, y, d: World.dist(w, x, y, u0.x, u0.y) + (own.has(k) ? 0 : 6) });
    }
    cands.sort((a, b) => a.d - b.d);
    const per = Math.max(1, Math.min(...Move.pacers(game, units).map(u => Units.maxMoves(game, u))));
    let best = null, bs = Infinity;
    for (const c of cands.slice(0, 10)) {
      const path = Move.findPath(game, units, p, c.x, c.y, { maxNodes: 6000 }); if (!path || !path.length) continue;
      const turns = Move.stepTurns(per, per, path).pop() + 1, sc = turns + (own.has(c.y * w.w + c.x) ? 0 : 3);
      if (sc < bs) { bs = sc; best = c; }
    }
    if (!best) {
      for (const u of units) { u.status = ''; u.purifyTarget = null; }
      Game.log(game, App.pid, U.cap(Units.label(u0)) + ' : plus aucune terre corrompue à purifier à sa portée.', { unit: u0.id, x: u0.x, y: u0.y, plane: p });
      return false;
    }
    for (const u of units) u.purifyTarget = [best.x, best.y];
    if (units.some(u => u.moves <= 0)) return true;
    await Game.moveGroup(game, units.map(u => u.id), best.x, best.y, { noAttack: true });
    // le plan se refait à chaque tour : pas d'itinéraire en reste (il serait poursuivi comme un ordre de marche)
    for (const u of units) if (game.units[u.id]) { u.status = 'autopurify'; u.path = null; u.dest = null; }
    return true;
  },
  // exploration automatique
  async explore(sel) {
    const game = App.game; if (!sel.length) return;
    // une sélection explore ensemble ; deux éclaireurs envoyés séparément restent séparés, même s'ils se croisent
    for (const u of sel) { u.status = 'explore'; u.path = null; u.exploreGroup = sel[0].id; u.exploreTarget = null; }
    const moved = await App.exploreStep(sel);
    if (!moved) UI.toast('Aucune terre inconnue accessible depuis ici.', 'warn');
    MapView.bumpVis(); MapView.invalidateVis();
    if ((App.pendingScouts || []).length) await App.flushScouts();
    App.selectNext();
  },
  // les fronts sans issue de ce sorcier, sur ce plan : la case et ses voisines (oubliés au bout de 40 tours)
  exploreDead(plane) {
    const game = App.game, me = App.me(), w = game.world, d = me.exploreDead = me.exploreDead || {}, out = new Set();
    for (const k in d) {
      if (game.turn - d[k] > 40) { delete d[k]; continue; }
      const [p, x, y] = k.split(',').map(Number); if (p !== plane) continue;
      out.add(y * w.w + x); for (const [nx, ny] of World.neighbors(w, x, y)) out.add(ny * w.w + nx);
    }
    return out;
  },
  REVISIT: 25,
  async exploreStep(units) {
    const game = App.game;
    units = units.filter(u => game.units[u.id] && u.status === 'explore');
    if (!units.length) return false;
    const start = units[0].plane + ',' + units[0].x + ',' + units[0].y, hadMoves = units.every(u => u.moves > 0);
    // ce que l'exploration dévoile : un éclaireur qui erre des tours sans rien découvrir a fini son plan
    const me = App.me(), plane0 = units[0].plane, exArr = me.explored[plane0];
    const seenCount = () => { let c = 0; for (let i = 0; i < exArr.length; i++) if (exArr[i]) c++; return c; };
    const seen0 = seenCount();
    const done = r => {
      const alive = units.filter(u => game.units[u.id]), gain = alive.length && alive[0].plane === plane0 ? seenCount() - seen0 : 1;
      for (const u of alive) { u.exploreIdle = gain > 0 ? 0 : (u.exploreIdle || 0) + 1; u.exploreGain = (u.exploreGain || 0) + Math.max(0, gain); }
      return r;
    };
    // arrivé à la cible sans rien avoir dévoilé en chemin, ou l'inconnu toujours hors de vue d'ici : ce front est sans issue
    { const u0 = units[0], tg = u0.exploreTarget, w = game.world;
      if (tg && u0.x === tg[0] && u0.y === tg[1] && World.get(w, u0.plane, 'site', tg[0], tg[1]) < 0
        && (!u0.exploreGain || World.neighbors(w, tg[0], tg[1]).some(([x, y]) => !exArr[y * w.w + x]))) (me.exploreDead = me.exploreDead || {})[u0.plane + ',' + tg[0] + ',' + tg[1]] = game.turn; }
    const spent = (units[0].exploreIdle || 0) >= 12, dead = App.exploreDead(plane0);
    for (let guard = 0; guard < 4; guard++) {
      if (!units.every(u => game.units[u.id]) || units.some(u => u.moves <= 0)) break;
      // trouvailles proches, puis lieux où l'on n'est jamais entré, puis terres inconnues ; enfin les lieux plus lointains
      // les cibles des autres éclaireurs : on ne court pas après la même chose
      const gid = units[0].exploreGroup != null ? units[0].exploreGroup : units[0].id;
      const avoid = Object.values(game.units).filter(o => o.owner === App.pid && o.status === 'explore' && o.exploreTarget && o.plane === units[0].plane && (o.exploreGroup != null ? o.exploreGroup : o.id) !== gid).map(o => o.exploreTarget);
      const far = (x, y, d) => !avoid.some(a => World.dist(game.world, a[0], a[1], x, y) <= d);
      let lair = null, t = null;
      // la cible d'avant reste la bonne tant qu'il y a encore de l'inconnu là-bas : sans quoi deux éclaireurs s'échangent leurs
      // cibles d'un tour à l'autre et piétinent côte à côte
      const w = game.world, pl0 = units[0].plane, ex = App.me().explored[pl0], tg = units[0].exploreTarget;
      if (tg && !(units[0].x === tg[0] && units[0].y === tg[1])) {
        const si = World.get(w, pl0, 'site', tg[0], tg[1]), st = si >= 0 ? game.sites[si] : null;
        if (st && Game.isLair(st)) { if (!Game.siteKnown(App.me(), st)) { t = tg; lair = st; } }   // un lieu déjà repéré n'est plus une cible
        else if (!ex[tg[1] * w.w + World.wx(w, tg[0])] || World.neighbors(w, tg[0], tg[1]).some(([x, y]) => !ex[y * w.w + x])) t = tg;
      }
      if (spent) t = null;   // des tours sans rien découvrir : on passe au plan suivant
      if (!t && !spent) t = Move.nearestCache(game, units, 8);
      if (t && !lair && !far(t[0], t[1], 0) && t !== tg) t = null;
      if (!t && !spent && (lair = App.lairToScout(units, 10, avoid))) t = [lair.x, lair.y];
      if (!t && !spent) t = Move.nearestFrontier(game, units, 4000, avoid, dead) || Move.nearestFrontier(game, units, undefined, null, dead);
      if (!t && !spent && (lair = App.lairToScout(units, 60, avoid) || App.lairToScout(units, 60))) t = [lair.x, lair.y];
      if (!t) {
        // ce plan n'a plus rien à dévoiler : par une tour, une faille ou une porte astrale, l'exploration continue de l'autre côté
        const p = Move.explorePortal(game, units);
        if (!p) {
          // plus rien nulle part : la ronde des antres (option), sinon on rend la main
          if (App.prefs.scoutRevisit !== false) {
            if (!units[0].exploreRound) { for (const u of units) u.exploreRound = true; Game.log(game, App.pid, U.cap(Units.label(units[0])) + ' : plus rien à explorer ; il fait la ronde des antres pour vérifier que leurs gardiens y sont toujours.', { unit: units[0].id, x: units[0].x, y: units[0].y, plane: units[0].plane, minor: true }); }
            return done(await App.revisitLair(units));
          }
          for (const u of units) { u.status = ''; u.exploreTarget = null; }
          return done(guard > 0);
        }
        if (p.here) {
          const r = Game.planeShift(game, units.map(u => u.id));
          if (!r.ok) { for (const u of units) u.status = ''; return done(guard > 0); }
          for (const u of units) if (game.units[u.id]) { u.status = 'explore'; u.exploreIdle = 0; u.exploreRound = false; u.exploreTarget = null; }
          Game.log(game, App.pid, U.cap(Units.label(units[0])) + (units.length > 1 ? ' (et ' + U.n(units.length - 1, 'autre unité', 'autres unités') + ')' : '') + ' : passage dans ' + (units[0].plane ? 'le Miroir' : 'Arcane') + ' pour poursuivre l\'exploration.', { unit: units[0].id, x: units[0].x, y: units[0].y, plane: units[0].plane, minor: true });
          return true;
        }
        t = [p.x, p.y];
      }
      const before = units[0].x + ',' + units[0].y;
      if (!tg || tg[0] !== t[0] || tg[1] !== t[1]) for (const u of units) u.exploreGain = 0;
      for (const u of units) u.exploreTarget = [t[0], t[1]];
      await Game.moveGroup(game, units.map(u => u.id), t[0], t[1], { noAttack: true });
      // l'éclaireur refait son plan à chaque tour : pas de trajet en reste (il serait poursuivi comme un ordre de marche et s'arrêterait)
      for (const u of units) if (game.units[u.id]) { u.status = 'explore'; u.path = null; u.dest = null; }
      // devant un lieu gardé où l'on n'est jamais entré : on y jette un œil (le joueur décide, une fois la main rendue)
      if (lair && Game.siteHasGuardians(lair) && units.every(u => game.units[u.id] && u.moves > 0) && World.dist(game.world, units[0].x, units[0].y, lair.x, lair.y) === 1) {
        (App.pendingScouts = App.pendingScouts || []).push({ ids: units.map(u => u.id), site: lair.id });
        return done(true);
      }
      // pas bougé (chemin coupé) : on oublie cette cible et l'on en cherche une autre
      if (units[0].x + ',' + units[0].y === before) { for (const u of units) u.exploreTarget = null; if (tg) continue; break; }
    }
    // deux tours de suite sans pouvoir avancer, avec tout son mouvement : plus rien d'accessible à explorer, on rend la main
    const alive = units.filter(u => game.units[u.id]);
    if (alive.length && hadMoves && alive[0].plane + ',' + alive[0].x + ',' + alive[0].y === start && !(App.pendingScouts || []).some(p => p.ids.includes(alive[0].id))) {
      const n = (alive[0].exploreStuck || 0) + 1;
      for (const u of alive) u.exploreStuck = n;
      if (n >= 2) {
        for (const u of alive) { u.status = ''; u.exploreTarget = null; u.exploreStuck = 0; }
        Game.log(game, App.pid, U.cap(Units.label(alive[0])) + ' : plus rien à explorer à sa portée.', { unit: alive[0].id, x: alive[0].x, y: alive[0].y, plane: alive[0].plane });
        return done(false);
      }
    } else for (const u of alive) u.exploreStuck = 0;
    return done(true);
  },
  // la ronde des antres : le repaire qu'on croit gardé et qu'on n'a pas revu depuis le plus longtemps ; l'éclaireur y entre et en
  // ressort aussitôt (tout son mouvement y passe) pour voir si les gardiens y sont encore. Rien à revoir : il attend sur place.
  async revisitLair(units) {
    const game = App.game, pl = App.me(), u0 = units[0], w = game.world, ids = units.map(u => u.id);
    const due = game.sites.filter(s => s.plane === u0.plane && s.type !== 'breach' && !s.finale && Game.isLair(s)).map(s => ({ s, k: Game.siteKnown(pl, s) }))
      .filter(({ k }) => k && !k.cleared && k.guards && k.guards.length && game.turn - k.t >= App.REVISIT)
      .sort((a, b) => a.k.t - b.k.t || World.dist(w, a.s.x, a.s.y, u0.x, u0.y) - World.dist(w, b.s.x, b.s.y, u0.x, u0.y));
    const peek = s => {
      Game.noteSite(game, App.pid, s); const k = Game.siteKnown(pl, s);
      for (const u of units) if (game.units[u.id]) { u.moves = 0; u.exploreTarget = null; }
      if (k.cleared) Game.log(game, App.pid, U.cap(Game.siteName(s)) + ' : vidé depuis votre dernier passage, il n\'y reste rien.', { x: s.x, y: s.y, plane: s.plane });
      else Game.log(game, App.pid, U.cap(Game.siteName(s)) + ' : ses gardiens y sont toujours.', { x: s.x, y: s.y, plane: s.plane, minor: true });
      return true;
    };
    for (const { s } of due.slice(0, 6)) {
      if (units.some(u => u.moves <= 0)) return true;
      if (World.dist(w, s.x, s.y, u0.x, u0.y) <= 1) return peek(s);
      if (Move.hostileAt(game, App.pid, s.plane, s.x, s.y) && !Game.siteHasGuardians(s)) continue;
      const path = Move.findPath(game, units, u0.plane, s.x, s.y, { maxNodes: 6000 }); if (!path || !path.length) continue;
      for (const u of units) u.exploreTarget = [s.x, s.y];
      await Game.moveGroup(game, ids, s.x, s.y, { noAttack: true });
      for (const u of units) if (game.units[u.id]) { u.status = 'explore'; u.path = null; u.dest = null; }
      if (game.units[u0.id] && u0.moves > 0 && World.dist(w, s.x, s.y, u0.x, u0.y) <= 1) return peek(s);
      return true;
    }
    return true;   // rien à revoir pour l'instant : il attend
  },

  async found(u) {
    const r = Game.foundCity(App.game, u.id);
    if (!r.ok) { UI.toast(r.why, 'warn'); return; }
    const def = CityUI.applyDefaultTemplate(r.city);
    if (def) UI.toast('File « ' + U.esc(def.name) + ' » appliquée à ' + U.esc(r.city.name) + '.');
    MapView.invalidate(); MapView.bumpVis();
    App.sel = null; MapView.sel = null;
    App.refresh();
    CityUI.open(r.city.id);
  },

  // ---------- déplacements ----------
  async moveSelected(x, y) {
    if (!App.sel || UI.busy || App.moving || App.peeking) return;
    const game = App.game;
    const all = App.sel.ids.filter(id => game.units[id]);
    if (!all.length) return;
    const ids = all.filter(id => game.units[id].moves > 0);
    const u0 = game.units[all[0]];
    // attaque d'un sorcier en paix : confirmation
    // seulement ce que le joueur connaît : une cité sous le brouillard, des troupes hors de vue ne font pas de l'ordre une attaque
    const known = Intel.knows(game, App.me(), u0.plane, x, y), seen = Move.visibility(game, App.pid)[u0.plane][y * game.world.w + World.wx(game.world, x)];
    const tgtCity = known ? Cities.at(game, u0.plane, x, y) : null, tgtUnit = seen ? Move.hostileAt(game, App.pid, u0.plane, x, y) : null;
    const victim = tgtCity && tgtCity.owner >= 0 && tgtCity.owner !== App.pid ? tgtCity.owner : tgtUnit && tgtUnit.owner >= 0 ? tgtUnit.owner : null;
    const near = World.dist(game.world, u0.x, u0.y, x, y) <= 1;
    if (victim != null) {
      const st = App.me().diplo[victim];
      if (st === 'peace' || st === 'alliance') { if (!await UI.confirm('Rompre le traité ?', 'Attaquer <b>' + U.esc(game.players[victim].name) + '</b> brisera votre ' + Diplomacy.stateName(st).toLowerCase() + ' et ternira votre réputation auprès de tous les sorciers.', 'Attaquer')) return; }
    }
    const si = World.get(game.world, u0.plane, x, y) >= 0 ? null : null;
    const site = known && World.get(game.world, u0.plane, 'site', x, y) >= 0 ? game.sites[World.get(game.world, u0.plane, 'site', x, y)] : null;
    // un lieu dont on ignore le contenu : on s'en approche ; une fois devant, les troupes entrent, voient, et l'on décide
    const lair = site && !tgtCity && !tgtUnit && Game.isLair(site) && !Game.knownCleared(App.me(), site);
    const approach = !!(lair && !near);
    if (lair && near && Game.siteHasGuardians(site)) {
      const ok = App._scoutOk === site.id ? true : await App.scoutPrompt(all, site);
      App._scoutOk = null;
      if (!ok) return;
    }
    // une attaque voulue (et confirmée) reste un ordre d'attaque si l'on n'arrive qu'au tour suivant
    const attack = !!(victim != null || tgtUnit || (tgtCity && tgtCity.owner !== App.pid) || (site && Game.siteHasGuardians(site) && !approach));
    if (ids.length < all.length) return App.orderLater(all, x, y, attack);
    for (const id of ids) { const u = game.units[id]; if (u.status === 'roadto' || u.status === 'road') u.roadPlan = null; }
    const start = [u0.x, u0.y];
    // de quoi annuler ce déplacement, s'il ne révèle rien (ni terre, ni troupe, ni rencontre, ni trouvaille, ni combat)
    const undo = { turn: game.turn, ids: ids.slice(), before: ids.map(id => { const u = game.units[id]; return { id, x: u.x, y: u.y, plane: u.plane, moves: u.moves, path: u.path, dest: u.dest, status: u.status, attackOrder: u.attackOrder, roadPlan: u.roadPlan }; }), sig: App.revealSig(), log: game.log[game.log.length - 1] || null };
    App.undo = null;
    UI.busyLog = false;
    Sfx.play('step');
    // chaque pas est animé : glissement d'une case à l'autre, figurine qui marche et se tourne dans le sens du trajet
    const walk0 = performance.now();
    const onStep = (sids, from, to) => {
      const dx = World.dxw(game.world, from[0], to[0]);
      for (const id of sids) if (dx) MapView.face[id] = dx > 0 ? 1 : -1;
      MapView.anim = { ids: sids, from, to, t0: performance.now(), dur: 170, walk0 };
      MapView.bumpVis();
      return new Promise(res => setTimeout(res, 170));
    };
    App.moving = true;
    let r;
    try { r = await Game.moveGroup(game, ids, x, y, { onStep, attackOrder: attack, noAttack: approach || undefined }); } finally { App.moving = false; }
    if (r.why && (!r.ok || r.blocked)) UI.toast(r.why, 'warn');
    const alive = ids.filter(id => game.units[id]), u1 = alive.length ? game.units[alive[0]] : null;
    if (r.ok && !r.attacked && alive.length === ids.length && (r.moved || 0) > 0 && (game.log[game.log.length - 1] || null) === undo.log && App.revealSig() === undo.sig)
      App.undo = Object.assign(undo, { after: ids.map(id => { const u = game.units[id]; return { id, x: u.x, y: u.y, moves: u.moves }; }) });
    if (MapView.anim && performance.now() - MapView.anim.t0 > MapView.anim.dur) MapView.anim = null;
    MapView.bumpVis(); MapView.invalidateVis();
    if (r.result && r.result.captured) MapView.invalidate();
    // la sélection suit le groupe
    if (u1) App.selectTile(u1.plane, u1.x, u1.y, alive);
    else App.selectNext();
    App.refresh();
    // arrivées devant le lieu avec du mouvement : elles y entrent et regardent
    if (approach && u1 && u1.plane === u0.plane && World.dist(game.world, u1.x, u1.y, x, y) === 1 && alive.some(id => game.units[id].moves > 0) && Game.siteHasGuardians(site) && !Game.siteKnown(App.me(), site)) return App.moveSelected(x, y);
    await App.showContacts();
    if (Object.values(game.units).some(u => u.owner === App.pid && u.hero && u.hero.pending && u.hero.pending.length)) await App.talentPrompts();
    if (u1) App.autoAdvance(350);
  },

  // ordre de marche pour des unités sans mouvement : itinéraire mémorisé, départ au prochain tour
  orderLater(ids, x, y, attack) {
    const game = App.game, units = ids.map(id => game.units[id]);
    const u0 = units[0];
    const path = Move.findPath(game, units, u0.plane, x, y, {});
    if (!path || !path.length) { UI.toast('Aucun chemin vers cette case.', 'warn'); return; }
    for (const u of units) { delete u.rallyHold; u.path = path.map(s => [s.x, s.y]); u.dest = [World.wx(game.world, x), y]; u.status = 'goto'; u.attackOrder = attack ? Game.attackTarget(game, App.pid, u0.plane, World.wx(game.world, x), y) || false : false; }
    const per = Math.max(1, Math.min(...Move.pacers(game, units).map(u => Units.maxMoves(game, u))));
    const turns = Move.stepTurns(0, per, path).pop() || 1;   // départ au prochain tour, avec le plein
    UI.toast(turns === 1 ? 'Ordre donné : les unités s\'y rendront au prochain tour.' : 'Ordre donné : départ au prochain tour, arrivée dans ' + U.n(turns, 'tour') + ' environ.');
    MapView.path = null;
    App.refresh();
    setTimeout(() => App.selectNext(), 200);
  },
  promoteDialog(u) {
    const game = App.game, opts = Game.promoteOptions(game, u), pl = App.me();
    const list = h('div', { class: 'list' });
    const m = UI.modal({ title: 'Promotion : ' + Units.label(u), width: 520, body: h('div', null, h('p', { class: 'muted', style: 'margin-bottom:8px' }, 'Le grade (' + Units.levelInfo(game, u).name + ') et l\'expérience sont conservés ; l\'unité ne bouge plus ce tour-ci.'), list) });
    for (const o of opts) {
      const d = DATA.units[o.type], ok = pl.gold >= o.cost;
      list.append(h('div', { class: 'row' + (ok ? '' : ' disabled'), onclick: () => { if (!ok) return; const r = Game.promote(game, u.id, o.type); if (!r.ok) UI.toast(r.why, 'warn'); else Sfx.play('build'); m.close(); App.refresh(); } },
        spriteCanvas('unit:' + o.type, 36), h('div', { class: 'grow' }, h('div', { class: 't1' }, d.name), h('div', { class: 't2' }, 'Attaque ' + d.melee + (d.ranged ? ' · tir ' + d.ranged : '') + ' · défense ' + d.def + ' · PV ' + Units.baseHp(d) + ' × ' + d.figures)),
        h('div', { class: ok ? 'gold' : 'danger' }, o.cost + ' or')));
    }
  },
  governDialog(hero, city) {
    const game = App.game;
    const r = Game.setGovernor(game, hero.id);
    if (!r.ok) { UI.toast(r.why, 'warn'); return; }
    const b = Cities.governorBonus(game, city);
    const parts = ['+' + b.prodPct + ' % de production', 'agitation -' + b.calm];
    if (b.gold) parts.push('+' + b.gold + ' or'); if (b.research) parts.push('+' + b.research + ' recherche'); if (b.growth) parts.push('+' + b.growth + ' croissance'); if (b.power) parts.push('+' + b.power + ' puissance');
    UI.toast(U.esc(hero.hero.name) + ' gouverne ' + U.esc(city.name) + ' : ' + parts.join(', ') + '. Il choisira la production quand la file sera vide.');
    App.selectNext();
  },
  healInCity(sel) {
    const game = App.game, n = sel.filter(u => Units.canHealInCity(game, u));
    if (!n.length) return;
    for (const u of n) { u.status = 'heal'; u.path = null; u.dest = null; }
    UI.toast('Soins en cours : ' + (n.length > 1 ? n.length + ' unités restent' : 'l\'unité reste') + ' dans la cité et ' + (n.length > 1 ? 'vous attendront' : 'vous attendra') + ' une fois ' + (n.length > 1 ? 'guéries' : 'guérie') + '.');
    App.selectNext();
  },
  cancelOrders(units) { for (const u of units) { u.path = null; u.dest = null; if (u.status === 'goto' || u.status === 'roadto') u.status = ''; u.roadPlan = null; } App.refresh(); },

  // ---------- fin de tour ----------
  async endTurn(force) {
    if (UI.busy || !App.game || App.moving || App.peeking) return;
    if (App.game.over) return App.gameOver(true);
    if (UI.modals.length && force !== true) return;   // (Entrée sur un bouton resté sous le focus : jamais derrière une fenêtre ouverte)
    const game = App.game;
    const waiting = App.unitsWaiting();
    if (waiting.length && force !== true && App.endWarned !== game.turn) {
      App.endWarned = game.turn;
      UI.toast((waiting.length > 1 ? waiting.length + ' unités attendent' : 'Une unité attend') + ' encore des ordres. Donnez-leur un ordre, ou <b>Sentinelle (S)</b> pour les laisser en place. Appuyez de nouveau sur Fin du tour pour passer quand même.', 'warn', 'endwarn');
      App.selectNext();
      App.refresh();
      return;
    }
    App.endWarned = null;
    // pertes annoncées (famine, désertions, créatures renvoyées) : on prévient avant de passer le tour
    for (let guard = 0; guard < 5; guard++) {
      const risk = Turn.forecastLosses(game, App.me()); if (!risk) break;
      const v = await App.lossPrompt(risk);
      if (v === 'feed') { App.feedArmies(); continue; }
      if (v === 'pass') break;
      App.refresh(); return;
    }
    UI.closeAll();
    UI.setBusy('Les sorciers rivaux préparent leurs desseins…');
    const lastE = game.log[game.log.length - 1];
    UI.busyLog = true;
    await new Promise(r => setTimeout(r, 30));
    try { await Turn.endTurn(game); } catch (e) { console.error(e); UI.toast('Erreur pendant le tour : ' + U.esc(e.message), 'warn'); }
    UI.busyLog = false;
    MapView.invalidate(); MapView.invalidateVis();
    // ordres de déplacement en cours (une erreur ici ne doit pas laisser l'écran d'attente en place : le jeu ne répondrait plus)
    UI.setBusy('Vos troupes se mettent en marche…');
    try {
    await App.advanceRoads();
    for (const u of Object.values(game.units)) {
      if (u.owner !== App.pid || !u.path || !u.path.length || !game.units[u.id] || u.status === 'explore') continue;
      const group = Units.at(game, u.plane, u.x, u.y).filter(o => o.owner === App.pid && o.path && o.path.length && o.dest && u.dest && o.dest[0] === u.dest[0] && o.dest[1] === u.dest[1]);
      const r = await Game.continueMove(game, group.map(o => o.id), { noAttack: true });
      if (r && r.blocked && r.why && group[0] && game.units[group[0].id]) Game.log(game, App.pid, U.cap(Units.label(group[0])) + ' : ' + r.why.charAt(0).toLowerCase() + r.why.slice(1), { unit: group[0].id, x: group[0].x, y: group[0].y, plane: group[0].plane });
    }
    // éclaireurs en exploration automatique
    const explorers = U.groupBy(Object.values(game.units).filter(u => u.owner === App.pid && u.status === 'explore'), u => u.plane + ',' + u.x + ',' + u.y + ':' + (u.exploreGroup != null ? u.exploreGroup : u.id));
    for (const k in explorers) await App.exploreStep(explorers[k]);
    // purificateurs automatiques
    const purifiers = U.groupBy(Object.values(game.units).filter(u => u.owner === App.pid && u.status === 'autopurify'), u => u.plane + ',' + u.x + ',' + u.y + ':' + (u.purifyGroup != null ? u.purifyGroup : u.id));
    for (const k in purifiers) await App.purifyStep(purifiers[k]);
    } catch (e) { App.oops(e); }
    UI.setBusy(null);
    if ((App.pendingScouts || []).length) await App.flushScouts();
    Sfx.afterTurn();
    App.save('auto');
    if (App.prefs.autoExport > 0 && game.turn % App.prefs.autoExport === 0 && !game.over) await App.autoExport();
    // 0.31.22 : au tour 10, une seule fois, la copie téléchargée tous les 10 tours est proposée (coupée tant qu'on n'a pas dit oui)
    else if (!(App.prefs.autoExport > 0) && !App.prefs.autoExportAsked && game.turn >= 10 && !game.over) {
      App.setPref('autoExportAsked', true);
      const n = App.prefs.autoExportN || 10;
      const txt = 'Vos parties sont gardées dans ce navigateur : effacer ses données les efface aussi. Garder une copie de la partie tous les ' + n + ' tours ?';
      const opts = SaveDir.supported()
        ? [{ value: 'dir', label: 'Choisir un dossier', primary: true }, { value: 'dl', label: 'Télécharger' }, { value: 0, label: 'Non merci' }]
        : [{ value: 'dl', label: 'Télécharger', primary: true }, { value: 0, label: 'Non merci' }];
      const c = await UI.choice('Copies de sauvegarde', txt + (SaveDir.supported() ? '<p class="muted">Dans un dossier, elles s\'écrivent sans rien vous demander. Sinon, elles arrivent dans vos téléchargements.</p>' : ''), opts);
      if (c === 'dir') { const p = await SaveDir.pick(); if (p.ok) App.setPref('saveDir', p.name); }
      if (c) { App.setPref('autoExport', n); await App.autoExport(); }
    }
    App.refresh();
    if (game.over) return App.gameOver();
    // les écrans du début de tour (cités à relancer, offres, talents) d'abord ; les nouvelles de l'intertour ensuite
    const upto = game.log.length;
    await App.turnPrompts();
    await App.talentPrompts();
    App.summary(lastE, upto);
    App.selectNext(true);
    // un rival a arrêté le temps : vos ordres attendent, le tour passe de lui-même
    if (Turn.frozen(game, App.me()) && !game.over) { UI.toast('Le temps est figé par un sorcier rival : vos troupes et vos cités attendent qu\'il reprenne son cours.', 'warn', 'timestop'); setTimeout(() => App.endTurn(true), 900); }
  },
  // ingénieurs en « route vers » : la case est faite, ils passent à la suivante de l'itinéraire
  async advanceRoads() {
    const game = App.game, done = new Set();
    for (const u of Object.values(game.units)) {
      if (u.owner !== App.pid || u.status !== 'roadto' || done.has(u.id) || !game.units[u.id]) continue;
      const next = Game.roadNext(game, u);
      const crew = Units.at(game, u.plane, u.x, u.y).filter(o => o.owner === App.pid && o.status === 'roadto' && JSON.stringify(o.roadPlan) === JSON.stringify(u.roadPlan));
      for (const o of crew) done.add(o.id);
      if (!next) {
        for (const o of crew) { o.status = ''; o.roadPlan = null; }
        Game.log(game, App.pid, 'Route achevée : ' + Units.label(u) + ' a terminé tout l\'itinéraire.', { unit: u.id, x: u.x, y: u.y, plane: u.plane });
        continue;
      }
      if (next[0] === u.x && next[1] === u.y) continue; // la case est encore en chantier
      const plan = u.roadPlan;
      const r = await Game.moveGroup(game, crew.map(o => o.id), next[0], next[1], { noAttack: true });
      for (const o of crew) if (game.units[o.id]) { o.status = 'roadto'; o.roadPlan = plan; }
      if (!r.ok && !r.moved) { for (const o of crew) if (game.units[o.id]) { o.status = ''; o.roadPlan = null; o.path = null; } Game.log(game, App.pid, 'Route interrompue : ' + (r.why || 'passage bloqué') + '.', { unit: u.id, x: u.x, y: u.y, plane: u.plane }); }
    }
  },
  // choix de la destination d'une route
  startRoadTo(sel) {
    const ids = sel.filter(u => Units.isEngineer(u)).map(u => u.id); if (!ids.length) return;
    App.roadMode = { ids };
    UI.toast('Cliquez sur la destination de la route : les ingénieurs l\'empierreront case après case. Échap ou clic droit pour annuler.', '', 'roadmode');
    App.refresh();
  },
  lossPrompt(risk) {
    const game = App.game, pl = App.me();
    const list = a => a.slice(0, 8).map(x => U.esc(x)).join(', ') + (a.length > 8 ? '…' : '');
    let html = '<p>Si vous passez le tour maintenant, vous allez perdre :</p>';
    if (risk.famine) html += '<div class="lossbox"><b class="danger">Famine</b> : il manque <b>' + risk.famine.deficit + '</b> nourriture pour vos armées. ' + U.n(risk.famine.units.length, 'unité sera dissoute', 'unités seront dissoutes') + ' : ' + list(risk.famine.units.map(u => { const lv = Units.levelInfo(game, u), c = Cities.at(game, u.plane, u.x, u.y); return Units.label(u) + ' (' + [lv && lv.name ? lv.name.toLowerCase() : null, c ? c.name : 'en campagne'].filter(Boolean).join(', ') + ')'; })) + '.</div>';
    if (risk.gold) html += '<div class="lossbox"><b class="danger">Trésor à sec</b> : il manquera <b>' + risk.gold.short + '</b> or. Des bâtiments seront vendus, puis des troupes déserteront.</div>';
    if (risk.mana) html += '<div class="lossbox"><b class="danger">Mana épuisé</b> : il manquera <b>' + risk.mana.short + '</b> mana. ' + (risk.mana.lost.length ? 'Perdus : ' + list(risk.mana.lost) + '.' : 'Des enchantements se dissiperont.') + '</div>';
    const fixable = risk.famine && Cities.ofPlayer(game, pl.id).some(c => Cities.econ(game, c).workers > 0);
    if (fixable) html += '<p class="dim">Des ouvriers peuvent devenir fermiers là où ils rapportent le plus de vivres, le temps de combler le déficit.</p>';
    const opts = [{ label: 'Annuler', value: null }];
    if (fixable) opts.push({ label: 'Passer quand même', value: 'pass', danger: true }, { label: 'Allouer les fermiers et finir le tour', value: 'feed', primary: true });
    else opts.push({ label: 'Passer quand même', value: 'pass', primary: true, danger: true });
    return UI.choice('Des pertes au prochain tour', html, opts, { width: 580 });
  },
  // des ouvriers deviennent fermiers pour combler la famine des armées
  feedArmies() {
    const game = App.game, r = Cities.feedArmies(game, App.pid);
    const parts = Object.entries(r.added).map(([id, n]) => U.esc(game.cities[id].name) + ' +' + n);
    if (parts.length) UI.toast('Fermiers alloués pour nourrir les armées : ' + parts.join(', ') + '.' + (r.left ? ' <span class="danger">Déficit restant : ' + r.left + '.</span>' : ''), r.left ? 'warn' : '');
    else UI.toast(r.left ? 'Plus aucun ouvrier à convertir : déficit de ' + r.left + ' nourriture.' : 'Aucune famine en vue : vos armées sont nourries.', r.left ? 'warn' : '');
    if (CityUI.cur) CityUI.render();
    App.refresh();
    return r;
  },
  // événements déjà montrés en bandeau ou en message (pour ne pas les répéter dans le résumé du tour)
  shown: new WeakSet(),
  // alerte : un bandeau rouge en haut de l'écran, quelques secondes ; un clic centre la carte sur le danger
  alertBanner(e) {
    const box = $('#toasts'); if (!box || App.shown.has(e)) return;
    App.shown.add(e);
    const t = h('div', { class: 'toast alertbar', html: '⚠ ' + App.linkify(e).innerHTML });
    const r = e.ref || {}, c = r.city != null && App.game.cities[r.city];
    t.onclick = () => { if (r.x != null) { MapView.centerOn(r.x, r.y, r.plane); MapView.ping(r.x, r.y, r.plane); } else if (c) { MapView.centerOn(c.x, c.y, c.plane); MapView.ping(c.x, c.y, c.plane); } App.refresh(); };
    box.prepend(t);
    if (typeof Sfx !== 'undefined' && Sfx.play) try { Sfx.play('bad'); } catch (err) { }
    setTimeout(() => { t.style.transition = 'opacity .6s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 600); }, 6500);
  },
  summary(lastE, upto) {
    const game = App.game;
    const from = lastE ? game.log.indexOf(lastE) + 1 : 0;
    // un événement déjà affiché au moment où il s'est produit (trouvaille d'un éclaireur en marche, etc.) ne revient pas
    const all = game.log.slice(from, upto == null ? game.log.length : upto).filter(e => (e.pid === App.pid || e.pid === -1) && !(e.ref && e.ref.minor) && !App.shown.has(e));
    // les alertes (ennemis sur le territoire, pillards en marche) : bandeaux rouges, en plus du journal
    for (const e of all.filter(e => e.ref && e.ref.alert && !e.ref.quiet && e.pid === App.pid).slice(-3)) App.alertBanner(e);
    const ev = all.filter(e => !(e.ref && e.ref.alert));
    // les événements marquants de l'intertour, puis un rappel s'il y en a d'autres
    const bad = /marchent sur|tombée|rasée|Famine|désertion|épuisé|peste|guerre|Défaite|rompu|banni|sec|révolte|indépendance|vos nœuds|tremblement|bâtiments? perdus?|Néant|suspendue|Brèche s'ouvre|Brèche s'est|vague de la Brèche marche sur vos|se déchire|astrologues|franchissent la faille|réclamer son dû/;
    const top = ev.slice().sort((a, b) => bad.test(b.fr || b.text) - bad.test(a.fr || a.text)).slice(0, 3);
    for (const e of top) UI.toast(App.linkify(e).innerHTML, bad.test(e.fr || e.text) ? 'warn' : '');
    if (ev.length > top.length) UI.toast('<b>' + UI.dateOf(game.turn) + '</b> · ' + (ev.length - top.length) + ' autre' + (ev.length - top.length > 1 ? 's' : '') + ' événement' + (ev.length - top.length > 1 ? 's' : '') + ' au journal (L)', '', 'summary');
  },
  // talents en attente : un choix entre deux capacités par niveau gagné
  async talentPrompts() {
    const game = App.game; if (!game || App._talentOpen) return;
    App._talentOpen = true;
    try {
      for (const u of Object.values(game.units)) {
        if (u.owner !== App.pid || !u.hero) continue;
        while (u.hero.pending && u.hero.pending.length && game.units[u.id]) {
          const p = u.hero.pending[0];
          const cards = p.opts.map(k => ({ label: Heroes.talentLabel(game, u, k), value: k, primary: false, desc: DATA.heroTalents[k].desc, gain: App.talentGain(game, u, k) }));
          const html = '<div style="display:flex;gap:12px;align-items:flex-start"><canvas id="tal-pic" width="80" height="80" class="portrait" style="width:80px;height:80px;flex:none"></canvas><div><b>' + U.esc(u.hero.name) + '</b> devient <b>' + HERO_LEVELS[p.level].name.toLowerCase() + '</b>.' + UI.statLine(Units.stats(game, u), u, game) + '<div style="margin-top:6px">Choisissez un talent :</div>'
            + cards.map(c => '<div class="box" style="margin-top:8px"><b class="gold">' + U.esc(c.label) + '</b><div class="muted">' + U.esc(c.desc) + '</div>' + (c.gain ? '<div class="ok" style="margin-top:2px">' + c.gain + '</div>' : '') + '</div>').join('') + '</div></div>';
          const pr = UI.choice('Nouveau talent', html, cards.map((c, i) => ({ label: c.label, value: c.value, primary: i === 0 })), { noClose: true });
          setTimeout(() => { const c = $('#tal-pic'); if (c) Sprites.paint(c, Sprites.heroPicOf(u)); }, 10);
          const k = await pr;
          Heroes.chooseTalent(game, u, k || p.opts[0]);
        }
      }
    } finally { App._talentOpen = false; }
    App.refresh();
  },
  // ce qu'un talent changerait tout de suite aux caractéristiques du héros (sur une copie)
  talentGain(game, u, k) {
    const copy = JSON.parse(JSON.stringify(u));
    Heroes.applyTalent(game, copy, k);
    const a = Units.stats(game, u), b = Units.stats(game, copy);
    const L = [['melee', 'Attaque'], ['ranged', 'Tir'], ['def', 'Défense'], ['res', 'Résistance'], ['hp', 'PV'], ['toHit', 'Précision', ' %'], ['move', 'Mouvement'], ['caster', 'Mana de combat']];
    const out = L.filter(([f]) => (b[f] || 0) !== (a[f] || 0)).map(([f, n, suf]) => n + ' ' + (a[f] || 0) + (suf || '') + ' → ' + (b[f] || 0) + (suf || '')
      + (f === 'toHit' && Units.pierce(b.toHit) ? ' (ignore ' + Units.pierce(a.toHit) + ' → ' + Units.pierce(b.toHit) + ' de défense)' : ''));
    const xa = Units.armsmasterXp(game, u), xb = Units.armsmasterXp(game, copy);
    if (xb !== xa) out.push('Unités normales de sa pile : +' + xa + ' → +' + xb + ' XP par tour (en plus du point de base)');
    return out.join(' · ');
  },
  // dettes échues : payer, ou refuser et subir la riposte
  async pactPrompts() {
    const game = App.game, pl = App.me();
    for (const pact of Pacts.due(game, pl)) {
      const e = Pacts.ENT[pact.entity];
      const opts = Pacts.payOptions(game, pl, pact);
      const art = await App.artBanner('pacts', pact.entity); if (App.game !== game) return;
      const html = art + '<div style="display:flex;gap:14px;align-items:flex-start"><canvas id="pact-pic" width="84" height="84" style="width:84px;height:84px;flex:none;border-radius:10px;background:#0c0b14"></canvas><div>'
        + '<div>' + U.cap(U.esc(e.name)) + ' vient réclamer son dû, comme convenu au tour ' + pact.turn + '.</div>'
        + '<div class="box" style="margin-top:8px"><b class="danger">La dette</b><div>' + U.esc(e.owed(pact.data)) + '</div></div>'
        + '<div class="dim" style="margin-top:6px">Si vous refusez : ' + U.esc(Pacts.refuseText(pact.entity, pact.data)) + '</div></div></div>';
      // la Mère des Essaims : on choisit soi-même les trois soldats livrés
      const pickable = pact.entity === 'swarm' && opts.some(o => o.id === 'soldiers' && o.can);
      const choices = opts.map((o, i) => ({ label: pickable ? 'Livrer les trois plus faibles' : o.label, value: o.id, primary: o.can && i === opts.findIndex(x => x.can), disabled: !o.can }));
      if (pickable) choices.push({ label: 'Choisir les soldats…', value: 'pick' });
      choices.unshift({ label: 'Refuser', value: 'refuse', danger: true });
      let v;
      for (;;) {
        const pr = UI.choice('L\'heure de payer', html, choices, { noClose: true, width: 640 });
        setTimeout(() => { const c = $('#pact-pic'); if (c) MapView.paintSigil(c, pact.entity); }, 10);
        v = await pr;
        if (v !== 'pick') break;
        const ids = await App.pickSoldiers(game, pl, Pacts.ENT.swarm.eligible(game, pl), 3);
        if (ids) { pact.data.pick = ids; v = 'soldiers'; break; }
      }
      Pacts.settle(game, pl, pact, v || 'refuse');
      delete pact.data.pick;
      MapView.bumpVis(); App.refresh();
    }
  },
  // choisir n unités dans une liste (null si l'on renonce)
  pickSoldiers(game, pl, units, n) {
    return new Promise(res => {
      const chosen = new Set(); let done = false;
      const where = u => { const c = Cities.at(game, u.plane, u.x, u.y); if (c) return 'à ' + c.name; const near = U.min(Cities.ofPlayer(game, pl.id).filter(o => o.plane === u.plane), o => World.dist(game.world, o.x, o.y, u.x, u.y)); return near ? 'près de ' + near.name : PLANE_NAMES[u.plane]; };
      const ok = h('button', { class: 'btn primary', disabled: true, onclick: () => { done = true; m.close(); res([...chosen]); } }, 'Livrer');
      const count = h('span', { class: 'dim' });
      const list = h('div', { class: 'list scroll', style: 'max-height:420px' });
      const upd = () => { count.textContent = chosen.size + ' / ' + n; ok.disabled = chosen.size !== n; };
      for (const u of units) {
        const lv = NORMAL_LEVELS[Math.min(NORMAL_LEVELS.length - 1, Units.levelIndex(game, u))].name, st = Units.stats(game, u);
        const box = h('input', { type: 'checkbox', style: 'width:18px;height:18px;flex:none' });
        const row = h('label', { class: 'row', style: 'cursor:pointer;gap:10px' }, box, spriteCanvas(Sprites.unitKey(u), 32),
          h('div', { class: 'grow' }, h('div', { class: 't1' }, Units.label(u)), h('div', { class: 't2' }, lv + ' · ' + where(u) + (u.dmg ? ' · blessé ' + (st.maxHp - u.dmg) + ' / ' + st.maxHp + ' PV' : ''))));
        box.onchange = () => { if (box.checked) { if (chosen.size >= n) { box.checked = false; return; } chosen.add(u.id); } else chosen.delete(u.id); upd(); };
        UI.tipOn(row, () => UI.unitTip(u, game));
        list.append(row);
      }
      upd();
      const m = UI.modal({ title: 'Les soldats livrés à l\'essaim', width: 560, body: h('div', null, h('div', { class: 'dim', style: 'margin-bottom:6px' }, 'Du plus faible au plus fort.'), list),
        footer: [count, h('button', { class: 'btn', onclick: () => { done = true; m.close(); res(null); } }, 'Retour'), ok], onClose: () => { if (!done) res(null); } });
    });
  },
  de(n) { if (!U.fr()) return n; return /^(un|une|le|les) /.test(n) ? (/^le /.test(n) ? 'du ' + n.slice(3) : /^les /.test(n) ? 'des ' + n.slice(4) : 'd\'' + n) : (/^(<[^>]*>)?[AEIOUYÉÈÊÂÎÔÛaeiouyéèêâîôû]/.test(n) ? 'd\'' : 'de ') + n; },
  // infobulle de la carte : les unités visibles de la case, avec leur nature magique
  // le « ! » sur la carte : ce lieu est l'objectif de la quête d'un de vos héros
  questHtml(s) {
    const game = App.game, out = [];
    for (const u of Object.values(game.units)) {
      const q = u.owner === App.pid && u.hero && u.hero.quest;
      if (!q || q.done || q.site !== s.id || (q.type === 'legend' && q.stage < 3)) continue;
      const R = Heroes.LEGEND_REWARD;
      out.push('<div class="questline"><span class="qbadge">!</span><div><b>Légende ' + App.de(U.esc(u.hero.name)) + ' : ' + U.esc(q.place || '') + '</b>. Vaincre ses gardiens avec ' + U.esc(u.hero.name) + ' dans l\'armée qui attaque.'
        + (u.hero.story ? '<div class="dim" style="font-style:italic">« ' + U.esc(u.hero.story) + ' »</div>' : '')
        + '<div class="gold">Récompense : ' + U.esc(Heroes.relicPreview(u)) + ', ' + R.xp + ' XP, ' + R.gold + ' or, +' + R.fame + ' de renommée, ' + R.troopXp + ' XP pour chaque unité de l\'armée, et le trésor du repaire.</div></div></div>');
    }
    return out.join('');
  },
  mapTip(x, y) {
    const game = App.game, plane = MapView.plane;
    const city = Cities.at(game, plane, x, y);
    const si = World.get(game.world, plane, 'site', x, y), qs = si >= 0 ? App.questHtml(game.sites[si]) : '';
    if (qs) return '<h4>' + U.esc(U.cap(game.sites[si].legend ? game.sites[si].legend.place : Game.siteName(game.sites[si]))) + '</h4>' + qs + ((k => k && !k.cleared && k.guards.length ? '<div class="danger" style="margin-top:4px">Gardé : ' + App.guardianHint(k.guards, game.sites[si]) + ' · vu au tour ' + k.t + '</div>' : '')(Game.siteKnown(App.me(), game.sites[si])));
    const cityHtml = city && city.owner === App.pid ? App.cityTip(city) : '';
    const units = Units.at(game, plane, x, y).filter(u => u.owner === App.pid || !Intel.hiddenFrom(game, App.pid, u)); if (!units.length) return cityHtml || null;
    const own = units[0].owner === App.pid;
    const vis = MapView.vis && MapView.vis[plane] && MapView.vis[plane][y * game.world.w + x];
    if (!own && !vis) return cityHtml || null;
    // une pile ennemie qui menace une de vos cités : laquelle, quand, à quelle force
    const thr = !own && MapView.threats ? MapView.threats(plane).find(t => t.sx === x && t.sy === y) : null;
    const thrHtml = thr ? '<div class="' + (thr.ratio >= 1 ? 'danger' : 'gold') + '" style="margin-top:5px">Menace sur ' + U.esc(thr.city.name) + ' : à ' + U.n(thr.eta, 'tour') + ', force ' + MapView.ratioText(thr.ratio) + ' celle de sa garnison.</div>' : '';
    if (units.length === 1 && !cityHtml) return UI.unitTip(units[0], game) + thrHtml;
    let html = cityHtml + '<h4' + (cityHtml ? ' style="margin-top:6px"' : '') + '>' + (city && !cityHtml ? U.esc(city.name) + ' · ' : '') + U.n(units.length, 'unité') + '</h4>';
    // une ligne par sorte d'unité (même type, même nature), avec les sorts qui la concernent
    const groups = [];
    for (const u of units) { const l = UI.kindLabel(u), key = u.type + '|' + l.text; let g = groups.find(x => x.key === key); if (!g) groups.push(g = { key, u, l, n: 0 }); g.n++; }
    for (const g of groups.slice(0, 8)) html += '<div class="mtrow"><span class="rgem" style="--rc:' + g.l.color + '"></span><b>' + (g.n > 1 ? g.n + ' × ' : '') + U.esc(Units.label(g.u)) + '</b><span class="dim">' + U.esc(g.l.text) + '</span></div>';
    if (groups.length > 8) html += '<div class="dim">… et d\'autres</div>';
    if (own) html += '<div class="dim" style="margin-top:5px;font-size:11px">Survolez les fiches à droite pour le détail de chaque unité.</div>';
    return html + thrHtml;
  },
  // croissance et production d'une de vos cités (survol de la carte)
  cityTip(c) {
    const inf = MapView.cityInfo(c), N = Cities.citizens(c);
    const grow = inf.growth < 0 ? '<span class="danger">' + (inf.starving ? 'Famine' : 'Déclin') + ' : ' + inf.growth + ' hab./tour, un citoyen perdu dans ' + U.n(inf.toGrow, 'tour') + '</span>'
      : inf.max ? '<span class="dim">Population maximale atteinte</span>'
      : inf.growth > 0 ? '<span class="ok">+' + inf.growth + ' hab./tour</span>, citoyen n° ' + (N + 1) + ' dans ' + U.n(inf.toGrow, 'tour') : '<span class="dim">Pas de croissance</span>';
    const prod = inf.cost ? U.esc(inf.name) + ', ' + (inf.turns === Infinity ? 'jamais à ce rythme' : U.n(inf.turns, 'tour')) : '<span class="dim">' + U.esc(inf.name) + '</span>';
    const en = MapView.cityEnchSeen(c), cur = en.filter(e => DATA.spells[e.spell].kind === 'cityCurse'), ok = en.filter(e => DATA.spells[e.spell].kind !== 'cityCurse');
    const nm = e => DATA.spells[e.spell].name + (e.realm && REALM_NAMES[e.realm] ? ' (' + REALM_NAMES[e.realm] + ')' : '');
    return '<h4>' + (c.fortress ? '<span class="gold">★</span> ' : '') + U.esc(c.name) + ' · ' + N + ' citoyen' + (N > 1 ? 's' : '') + '</h4><div>' + grow + '</div><div>Production : ' + prod + '</div>'
      + (ok.length ? '<div style="color:#bfe3a8">Enchantements : ' + ok.map(e => U.esc(nm(e))).join(', ') + '</div>' : '') + (cur.length ? '<div class="danger">Malédictions : ' + cur.map(e => U.esc(nm(e))).join(', ') + '</div>' : '');
  },
  // une cité qui garde un fragment du Livre de légende, ou le Livre
  bookNote(c) {
    const t = typeof Book !== 'undefined' && Book.cityNote(App.game, c);
    return t ? h('div', { style: 'margin-top:4px;color:#d8c79a;font-style:italic' }, t) : null;
  },
  // forteresse conquise en cours de démantèlement : la note affichée sur la cité
  fallNote(c) {
    const game = App.game;
    const p = game.players.find(q => q.fallen && q.fallen.city === c.id); if (!p) return null;
    const left = Game.fortressLeft(game, p); if (!left) return null;
    const n = FORTRESS_DISMANTLE - (game.turn - p.fallen.turn), pct = Math.round(left * 100);
    const txt = p.id === App.pid
      ? 'Votre forteresse est en cours de démantèlement (encore ' + U.n(n, 'tour') + '). La reprendre maintenant accomplirait ' + pct + ' % de votre Sort de Retour.'
      : 'Forteresse de ' + Players.nameFor(game, App.pid, p.id) + ' en cours de démantèlement (encore ' + U.n(n, 'tour') + '). S\'il la reprend d\'ici là, son retour sera hâté de ' + pct + ' %.';
    return h('div', { class: p.id === App.pid ? 'danger' : 'gold', style: 'margin-top:6px' }, txt);
  },
  // grand ouvrage achevé : son illustration au centre de l'écran, au premier de chaque sorte (avant que la cité ne demande la suite)
  // l'illustration : assets/landmarks/<id>.jpg (ou .png) ; à défaut, l'icône du bâtiment dans un halo
  LANDMARKS: {
    magicRelay: { color: '#8fc4ff', text: 'Un fil de lumière relie désormais la forteresse à chacune de vos armées, si loin qu\'elles marchent.',
      eff: 'Le surcoût de mana de vos sorts lancés en bataille loin de la forteresse est divisé par deux.' },
    // les ouvrages de race : leur effet est la description du bâtiment
    jarlsHall: { color: '#e0a060', text: 'Sous ses poutres sculptées, les jarls font prêter serment aux jeunes guerriers. Ils en ressortent prêts à mourir, et surtout à tuer.' },
    fangPit: { color: '#d8b070', text: 'Les hurlements de la meute montent de la fosse. Après chaque bataille, on y festoie sur les vaincus.' },
    harvestHall: { color: '#e8d27a', text: 'Les greniers débordent et les marchands se pressent sous la halle : même la dernière miche trouve preneur.' },
    motherTree: { color: '#8fe0a0', text: 'Ses racines courent sous toutes vos forêts, et chacune de ses feuilles murmure de la magie.' },
    chancery: { color: '#f0d68a', text: 'Scribes, banquiers et intendants : le royaume s\'administre enfin, et l\'or achète ce que les bras ne bâtissent pas assez vite.' },
    motherHive: { color: '#d8c060', text: 'Des milliers d\'ouvrières bourdonnent d\'une seule pensée. Plus personne ne songe à se plaindre.' },
    tideTemple: { color: '#6fd0c8', text: 'Les prêtres des marées chantent sous les eaux, et les courants portent vos guerriers.' },
    caravanserai: { color: '#ebb85c', text: 'Les caravanes des quatre horizons font halte sous ses arcades, et vos routes se couvrent d\'or.' },
    skullThrone: { color: '#d06a50', text: 'Assis sur les crânes de ses ennemis, le chef de guerre n\'a plus besoin de payer ses guerriers : ils se battent pour la gloire et le butin.' },
    labyrinth: { color: '#c89a6a', text: 'Couloirs sans fin, murs qui bougent, mugissements dans le noir : qui assiège la cité s\'y perd avant d\'atteindre les remparts.' },
    soulWell: { color: '#a070e0', text: 'Au fond du puits, des âmes gémissent. Chaque mort sur un champ de bataille vient grossir leur chœur.' },
    ancestorsAerie: { color: '#ff8a50', text: 'Les aînés des dragons y couvent leurs descendants. Le feu de vos guerriers en sort plus ardent.' },
    motherForge: { color: '#9fc8e8', text: 'Sous la montagne, le grand marteau bat sans relâche, et le mithril coule comme l\'eau.' },
    menhirCircle: { color: '#9ab07a', text: 'Les pierres levées ont parlé : les grands trolls viennent d\'eux-mêmes servir le sorcier.' },
  },
  // le royaume de magie dominant du joueur (le plus de livres) : les illustrations ont une version par royaume (vie : la version de base)
  realmOf(pl) { const b = (pl && pl.books) || {}; let best = null, n = 0; for (const r of ['life', 'death', 'chaos', 'nature', 'sorcery']) if ((b[r] || 0) > n) { n = b[r]; best = r; } return best; },
  landmarkArt(id) {
    const r = App.realmOf(App.me()), names = (r && r !== 'life' ? [id + '_' + r] : []).concat([id]);
    const tryOne = list => new Promise(res => {
      if (!list.length) return res(null);
      const [n, ext] = list[0], img = new Image(); img.onload = () => res(img); img.onerror = () => tryOne(list.slice(1)).then(res); img.src = 'assets/landmarks/' + n + '.' + ext;
    });
    return tryOne(names.flatMap(n => [[n, 'jpg'], [n, 'png']]));
  },
  async landmarkPrompts() {
    const game = App.game, pl = App.me(); if (!game || !pl) return;
    const fresh = c => { const ld = c.lastDone; return ld && ld.type === 'building' && App.LANDMARKS[ld.id] && !ld.shown && ld.turn >= game.turn - 1 ? ld.id : null; };
    // partie commencée avant ces annonces : les ouvrages déjà debout ne seront pas fêtés une seconde fois
    if (!pl.landmarksSeen) {
      pl.landmarksSeen = {};
      for (const c of Cities.ofPlayer(game, pl.id)) for (const id in App.LANDMARKS) if (c.buildings[id] && fresh(c) !== id) pl.landmarksSeen[id] = true;
    }
    for (const c of Cities.ofPlayer(game, pl.id)) {
      const ld = c.lastDone, lm = ld && ld.type === 'building' && App.LANDMARKS[ld.id], b = lm && DATA.buildings[ld.id];
      if (!b || ld.shown || ld.turn < game.turn - 1 || !c.buildings[ld.id]) continue;
      ld.shown = true;
      // une fois par sorte d'ouvrage : la cinquième cathédrale ne se fête plus
      const seen = pl.landmarksSeen; if (seen[ld.id]) continue;
      seen[ld.id] = true;
      if (window.AUTO_CHOICE) continue;
      // les unités que l'ouvrage vient d'ouvrir dans cette cité
      const units = Cities.buildableUnits(game, c).filter(t => (DATA.units[t].requires || []).includes(ld.id)).map(t => DATA.units[t].name);
      const eff = [lm.eff || (b.wonder ? b.desc : ''), units.length ? 'On peut désormais y former : ' + units.join(', ').toLowerCase() + '.' : ''].filter(Boolean).join(' ');
      const img = await App.landmarkArt(ld.id); if (App.game !== game) return;
      const art = h('div', { class: 'lm-art' + (img ? '' : ' none') });
      if (img) { img.alt = ''; art.append(img); }
      else art.append(h('div', { class: 'lm-halo' }), spriteCanvas(bldIcon(ld.id), 150));
      const body = h('div', { class: 'lm', style: '--lc:' + lm.color }, art,
        h('div', { class: 'lm-kicker' }, (b.wonder ? 'Ouvrage des ' + DATA.races[b.wonder].name : 'Grand ouvrage') + ' · ' + c.name),
        h('div', { class: 'lm-name' }, b.name),
        h('div', { class: 'lm-text' }, lm.text),
        eff ? h('div', { class: 'lm-eff' }, eff) : null);
      MapView.centerOn(c.x, c.y, c.plane); App.dirty = true;
      Sfx.play('legend');
      await new Promise(res => {
        const m = UI.modal({ title: '', body, width: 760, cls: 'landmark-modal', onClose: res,
          footer: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'Continuer')] });
      });
      if (App.game !== game) return;
    }
  },
  // événements aléatoires (Turn.randomEvents) : une fenêtre illustrée, comme les grands ouvrages ; assets/events/<id>.jpg
  EVENTS: {
    goldFound: { name: 'Filon d\'or', color: '#f0c860' }, manaDiscovery: { name: 'Cristaux de mana', color: '#8fc4ff' },
    donation: { name: 'Un généreux donateur', color: '#e8d27a' }, plague: { name: 'La peste', color: '#9ab07a' },
    popBoom: { name: 'Explosion démographique', color: '#f0b070' }, goodMoon: { name: 'Lune bienveillante', color: '#f3e6c4' },
    badMoon: { name: 'Lune maléfique', color: '#d06a50' }, earthquake: { name: 'Tremblement de terre', color: '#c89a6a' },
    newMinerals: { name: 'Nouveau gisement', color: '#9fc8e8' }, depletion: { name: 'Gisement épuisé', color: '#a8a8a8' },
    rebellion: { name: 'Révolte', color: '#e05a50' },
  },
  // une illustration en bandeau en tête d'une fenêtre de choix (chaîne HTML vide si l'image manque)
  async artBanner(dir, id) { const img = window.AUTO_CHOICE ? null : await App.eventArt(id, dir); return img ? '<div class="dil-art"><img src="' + img.src + '" alt=""></div>' : ''; },
  eventArt(id, dir) {
    return new Promise(res => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = 'assets/' + (dir || 'events') + '/' + id + '.jpg'; });
  },
  async eventPrompts() {
    const game = App.game, pl = App.me(); if (!game || !pl || window.AUTO_CHOICE) return;
    for (const e of game.log) {
      const ev = e.ref && e.ref.event, d = ev && App.EVENTS[ev];
      if (!d || e.ref.shown || e.turn < game.turn - 1 || (e.pid !== pl.id && e.pid !== -1)) continue;
      e.ref.shown = true;
      const c = e.ref.city != null ? game.cities[e.ref.city] : null;
      const img = await App.eventArt(ev); if (App.game !== game) return;
      const art = h('div', { class: 'lm-art' + (img ? '' : ' none') });
      if (img) { img.alt = ''; art.append(img); } else art.append(h('div', { class: 'lm-halo' }));
      const body = h('div', { class: 'lm', style: '--lc:' + d.color }, art,
        h('div', { class: 'lm-kicker' }, 'Événement' + (c ? ' · ' + c.name : '')),
        h('div', { class: 'lm-name' }, d.name),
        h('div', { class: 'lm-text' }, e.text));
      if (c) { MapView.centerOn(c.x, c.y, c.plane); App.dirty = true; }
      await new Promise(res => {
        const m = UI.modal({ title: '', body, width: 760, cls: 'landmark-modal', onClose: res,
          footer: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'Continuer')] });
      });
      if (App.game !== game) return;
    }
  },
  // capitale perdue : le grand message, une fois
  // 0.31.29 : un nœud volé par un rival, au centre de l'écran (illustration selon le royaume du nœud)
  async nodeLostPrompts() {
    const game = App.game, pl = App.me(); if (!game || !pl || !pl.nodesLost || !pl.nodesLost.length || App.nodeLostOpen) return;
    App.nodeLostOpen = true;
    try {
      while (pl.nodesLost.length) {
        const e = pl.nodesLost.shift(), s = game.sites[e.site]; if (!s) continue;
        const img = window.AUTO_CHOICE ? null : await App.eventArt('node_lost_' + (s.realm || 'sorcery')); if (App.game !== game) return;
        const art = h('div', { class: 'lm-art' + (img ? '' : ' none') });
        if (img) { img.alt = ''; art.append(img); } else art.append(h('div', { class: 'lm-halo' }));
        const color = { nature: '#5fbf5a', chaos: '#e2603a', sorcery: '#5a8ee8' }[s.realm] || '#c9a24a';
        const thief = U.cap(Players.nameFor(game, pl.id, e.by));
        const body = h('div', { class: 'lm', style: '--lc:' + color }, art,
          h('div', { class: 'lm-kicker' }, 'Nœud perdu'),
          h('div', { class: 'lm-name' }, Game.siteName(s)),
          h('div', { class: 'lm-text' }, thief + ' vous a pris ce nœud : son mana nourrit désormais sa magie.'),
          e.guardian ? h('div', { class: 'lm-text dim' }, 'Un esprit gardien le tient : un Désenchantement de zone ferait tomber sa garde.') : null);
        Sfx.play('defeat');
        const go = await new Promise(res => {
          const m = UI.modal({ title: '', body, width: 760, cls: 'landmark-modal', onClose: () => res(false),
            footer: [h('button', { class: 'btn', onclick: () => { res(false); m.close(); } }, 'Continuer'), h('button', { class: 'btn primary', onclick: () => { res(true); m.close(); } }, 'Voir le nœud')] });
        });
        if (App.game !== game) return;
        if (go) { MapView.centerOn(s.x, s.y, s.plane); App.refresh(); }
      }
    } finally { App.nodeLostOpen = false; }
  },
  // 0.31.30 : les crises de fin, au centre de l'écran (le début, le phylactère découvert, la fin)
  async finalePrompts() {
    const game = App.game, pl = App.me(); if (!game || !pl || !pl.finaleNews || !pl.finaleNews.length || App.finaleOpen) return;
    App.finaleOpen = true;
    try {
      while (pl.finaleNews.length) {
        const e = pl.finaleNews.shift(), f = game.finale || {};
        const img = window.AUTO_CHOICE ? null : await App.eventArt('finale_' + e.kind); if (App.game !== game) return;
        const art = h('div', { class: 'lm-art' + (img ? '' : ' none') });
        if (img) { img.alt = ''; art.append(img); } else art.append(h('div', { class: 'lm-halo' }));
        const color = { lich: '#5ae68c', archmage: '#aa6eff', winter: '#aadcff', eater: '#c45adc', prophet: '#e8b04a' }[e.kind] || '#c9a24a';
        let kicker, text, extra = null;
        if (e.type === 'begin') { kicker = 'Crise de fin'; text = Finale.beginText(game, pl.id); }
        else if (e.type === 'reveal') { kicker = 'Le phylactère est découvert'; text = 'Détruisez-le, et le Seigneur liche ne se relèvera plus.'; }
        else if (e.faded) { kicker = 'Crise éteinte'; text = 'Sa proie à terre, elle s\'éteint d\'elle-même.'; }
        else {
          kicker = 'Crise vaincue';
          text = e.by === pl.id ? 'Vous y avez mis fin.' : e.by != null ? U.cap(Players.nameFor(game, pl.id, e.by)) + ' y a mis fin.' : 'Elle s\'est éteinte.';
          if (e.found) extra = 'Récompense : ' + e.found.join(', ') + '.';
        }
        const at = e.type === 'end' ? (e.x != null ? { x: e.x, y: e.y, plane: e.plane } : null) : Finale.where(game, f);
        const body = h('div', { class: 'lm', style: '--lc:' + color }, art,
          h('div', { class: 'lm-kicker' }, kicker), h('div', { class: 'lm-name' }, Finale.title(e.kind)), h('div', { class: 'lm-text' }, text),
          extra ? h('div', { class: 'lm-text gold' }, extra) : null);
        Sfx.play(e.type === 'end' ? 'victory' : 'defeat');
        const go = await new Promise(res => {
          const m = UI.modal({ title: '', body, width: 760, cls: 'landmark-modal finale-modal', onClose: () => res(false),
            footer: [h('button', { class: 'btn', onclick: () => { res(false); m.close(); } }, 'Continuer'), at ? h('button', { class: 'btn primary', onclick: () => { res(true); m.close(); } }, 'Voir') : null].filter(Boolean) });
        });
        if (App.game !== game) return;
        if (go && at) { MapView.centerOn(at.x, at.y, at.plane); App.refresh(); }
      }
    } finally { App.finaleOpen = false; }
  },
  // le Démon légendaire abattu : le grand moment, au centre de l'écran
  async demonPrompt() {
    const game = App.game, pl = App.me(), s = pl && pl.demonSlain;
    if (!s || s.seen || App.demonOpen) return;
    s.seen = true; App.demonOpen = true;
    try {
      const r = App.realmOf(pl), art = (r && r !== 'life' ? await App.artBanner('endgame', 'demon_slain_' + r) : '') || await App.artBanner('endgame', 'demon_slain'); if (App.game !== game) return;
      Sfx.play('victory');
      const html = art + '<p style="font-size:17px">Sous vos coups, le Démon légendaire s\'effondre et retourne aux abîmes. Le pacte de vos rivaux vole en éclats.</p>'
        + '<p>Renom <b class="gold">+' + s.fame + '</b> · son essence vous rend <b class="gold">' + s.mana + ' mana</b>.</p>';
      await UI.choice('Le Démon légendaire est abattu !', html, [{ label: 'Victoire', value: true, primary: true }], { width: 680 });
    } finally { App.demonOpen = false; App.refresh(); }
  },
  async fallPrompt() {
    const game = App.game, pl = App.me(), f = pl.fallen;
    if (!f || f.seen || !game.cities[f.city]) return;
    f.seen = true;
    const c = game.cities[f.city], by = f.by != null && game.players[f.by] ? App.de(U.esc(game.players[f.by].name)) : 'des pillards';
    const art = await App.artBanner('endgame', 'fortress_fallen'); if (App.game !== game) return;
    const html = art + '<p>' + U.esc(c.name) + ' est tombée aux mains ' + by + '. Vous voilà <b class="danger">banni</b> : plus aucun sort, sinon le Sort de Retour, qui se lance de lui-même.</p>'
      + '<p>Les troupes ennemies s\'attellent à démanteler votre forteresse, ce qui leur prendra <b>' + FORTRESS_DISMANTLE + ' tours</b>. Plus vous reprendrez la cité vite, plus votre retour sera rapide : au tour prochain, votre Sort de Retour sera accompli à 90&nbsp;% ; dans 5 tours, à 50&nbsp;% ; passé ' + FORTRESS_DISMANTLE + ' tours, la reprendre ne servira plus à rien.</p>'
      + '<p class="muted">Sans reprise, votre forteresse renaîtra dans votre plus grande cité, une fois le sort payé (' + Magic.spellCost(game, pl, 'spell_of_return') + ' mana au rythme de votre compétence de lancement).</p>';
    const go = await UI.choice('Votre forteresse est tombée', html, [{ label: 'Compris', value: false }, { label: 'Voir ' + c.name, value: true, primary: true }]);
    if (go) { MapView.centerOn(c.x, c.y, c.plane); App.refresh(); }
  },
  // un héros appelé par un sort : on l'accueille comme une recrue, portrait à l'appui
  async heroArrivalPrompt() {
    const game = App.game, pl = App.me(), a = pl && pl.heroArrival;
    if (!a) return;
    pl.heroArrival = null;
    const u = game.units[a.unit]; if (!u || u.owner !== pl.id || !u.hero) return;
    MapView.centerOn(u.x, u.y, u.plane); App.refresh();
    const s = Units.stats(game, u), lv = Units.levelInfo(game, u);
    const line = a.kind === 'resurrection' ? 'revient d\'entre les morts et reprend sa place à vos côtés.' : 'répond à votre appel et rejoint votre cause.';
    const html = '<div style="display:flex;gap:14px;align-items:center"><canvas id="hero-arr" width="96" height="96" class="portrait" style="width:96px;height:96px;flex:none"></canvas><div>'
      + '<div class="serif" style="font-size:18px"><b>' + U.esc(u.hero.name) + '</b></div><div class="muted">' + U.esc(u.hero.title || DATA.units[u.type].name) + (lv ? ' · ' + U.esc(lv.name) : '') + '</div>'
      + '<p style="margin:8px 0 6px">' + U.esc(u.hero.name) + ' ' + line + '</p>' + UI.statLine(s, u, game) + '</div></div>';
    const p = UI.choice('Le sort a réussi', html, [{ label: 'Voir sa fiche', value: 'sheet' }, { label: 'Bienvenue', value: true, primary: true }], { width: 520 });
    setTimeout(() => { const c = $('#hero-arr'); if (c) Sprites.paint(c, Sprites.heroPicOf(u)); }, 10);
    Sfx.play('summon');
    if (await p === 'sheet') Panels.heroSheet(u);
  },
  async turnPrompts() {
    const game = App.game, pl = App.me();
    await App.heroArrivalPrompt();
    await App.fallPrompt();
    await App.demonPrompt();
    await App.nodeLostPrompts();
    await App.finalePrompts();
    await App.landmarkPrompts();
    await App.showContacts();
    await App.pactPrompts();
    await App.dilemmaPrompt();
    await App.offerPrompts();
  },
  // un dilemme : deux issues, leurs conséquences écrites en clair
  async dilemmaPrompt() {
    const game = App.game, pl = App.me();
    if (!pl.dilemma || !Dilemmas.def(pl)) return;
    const opts = Dilemmas.options(game, pl);
    // l'illustration (assets/dilemmas/<id>.jpg), si elle existe
    const art = window.AUTO_CHOICE ? null : await App.eventArt(pl.dilemma.id, 'dilemmas'); if (App.game !== game || !pl.dilemma) return;
    const html = (art ? '<div class="dil-art"><img src="' + art.src + '" alt=""></div>' : '') + '<p>' + Dilemmas.text(game, pl) + '</p>' + opts.map(o => '<div class="box dil' + (o.can ? '' : ' off') + '"><b>' + U.esc(o.label) + '</b><div>' + U.esc(o.text) + '</div>' + (o.can ? '' : '<div class="danger">' + U.esc(o.why || 'Impossible.') + '</div>') + '</div>').join('');
    Sfx.play('notify');
    const v = await UI.choice(Dilemmas.title(game, pl), html, opts.map((o, i) => ({ label: o.label, value: String(i), primary: i === 0 && o.can, disabled: !o.can })), { noClose: true, width: art ? 640 : 560 });
    if (App.game !== game || !pl.dilemma) return;
    Dilemmas.resolve(game, pl, Number(v) || 0);
    App.refresh();
  },
  // ce qui attend encore une réponse : héros, mercenaires, propositions des sorciers, recherche, cités sans ordre
  // (en fin de tour, et aussi au chargement d'une partie)
  async offerPrompts() {
    const game = App.game, pl = App.me();
    if (pl.heroOffer && pl.heroOffer.turn >= game.turn - 1) {
      const off = pl.heroOffer; const hd = DATA.heroes[off.hero];
      const fake = { type: hd.unit, ench: [], xp: 0, owner: pl.id, dmg: 0, weapon: 0, hero: { name: hd.name, title: hd.title, extra: {} } };
      fake.xp = HERO_LEVELS[off.level || 0].xp;
      const lvl = off.level ? ' (niveau ' + HERO_LEVELS[off.level].name.toLowerCase() + ')' : '';
      const html = '<div style="display:flex;gap:12px"><canvas id="hero-off" width="96" height="96" class="portrait" style="width:96px;height:96px;flex:none"></canvas><div><b>' + U.esc(hd.name) + '</b>, ' + U.esc(hd.title.toLowerCase()) + lvl + ', vous offre son épée pour <b class="gold">' + off.fee + ' or</b>.<div class="muted" style="margin-top:4px">' + U.esc(hd.desc || '') + '</div>' + UI.statLine(Units.stats(game, fake), null, game)
        // un sort d'appel en cours : ce héros-ci ne vient pas de lui, et prendre la sixième place le ferait échouer
        + (pl.casting && ['summon_hero', 'summon_champion', 'incarnation', 'resurrection'].includes(pl.casting.id) && Heroes.heroCount(game, pl) + 1 >= 6
          ? '<div class="danger" style="margin-top:8px">Il vient de lui-même, pas de votre sort. S\'il vous rejoint, vous aurez six héros et ' + U.esc(DATA.spells[pl.casting.id].name) + ', en cours, échouera (vous ne récupéreriez que la moitié du mana).</div>' : '')
        + '</div></div>';
      const p = UI.choice('Un héros se présente', html, [{ label: 'Refuser', value: false }, { label: 'Engager (' + off.fee + ' or)', value: true, primary: true }], { noClose: true });
      setTimeout(() => { const c = $('#hero-off'); if (c) Sprites.paint(c, Sprites.heroPic(hd.unit)); }, 10);
      const yes = await p;
      if (yes) { const r = Heroes.accept(game, pl); if (!r.ok) UI.toast(r.why, 'warn'); else MapView.bumpVis(); } else Heroes.refuse(game, pl);
    }
    if (pl.mercOffer && pl.mercOffer.turn >= game.turn - 1) {
      const off = pl.mercOffer; const d = DATA.units[off.type];
      const fake = { type: off.type, ench: [], xp: off.xp, owner: pl.id, dmg: 0, weapon: 0 };
      const html = '<div style="display:flex;gap:12px"><canvas id="merc-off" width="64" height="64" class="portrait" style="width:64px;height:64px"></canvas><div><b>' + U.n(off.count, 'unité') + ' de ' + U.esc(d.name.toLowerCase()) + ' ' + U.esc(Units.raceAdj(d.race)) + '</b> (' + U.esc(Units.levelInfo(game, fake).name.toLowerCase()) + ') proposent leurs services pour <b class="gold">' + off.cost + ' or</b>.' + UI.statLine(Units.stats(game, fake), null, game) + '</div></div>';
      const p = UI.choice('Des mercenaires se présentent', html, [{ label: 'Refuser', value: false }, { label: 'Engager (' + off.cost + ' or)', value: true, primary: true }], { noClose: true });
      setTimeout(() => { const c = $('#merc-off'); if (c) Sprites.paint(c, 'unit:' + off.type); }, 10);
      const yes = await p; pl.mercOffer = null;
      if (yes) { const r = Mercenaries.hire(game, pl, off); if (!r.ok) UI.toast(r.why, 'warn'); else MapView.bumpVis(); }
    }
    for (const off of Diplomacy.pendingOffers(game, pl).slice()) { if (App.game !== game) return; await App.offerPrompt(off); }
    if (pl.mustChooseResearch && pl.researchOptions.length) { pl.mustChooseResearch = false; await MagicUI.research(true); }
    const needing = Cities.ofPlayer(game, pl.id).filter(c => c.needsOrder);
    for (const c of needing) { c.needsOrder = false; MapView.centerOn(c.x, c.y, c.plane); await CityUI.open(c.id, true); }
  },
  // une proposition diplomatique : Accepter, Refuser, ou fermer pour décider plus tard (elle reste au journal jusqu'au tour suivant)
  async offerPrompt(off) {
    const game = App.game, pl = App.me();
    if (!off || App._offerOpen) return;
    App._offerOpen = true;
    try {
      const o = game.players[off.from], kind = off.kind;
      // le portrait et l'essentiel de la relation, pour se rappeler à qui l'on a affaire
      const rel = o.relations[pl.id] || 0, relTxt = rel > 50 ? 'amical' : rel > 15 ? 'cordial' : rel > -15 ? 'neutre' : rel > -50 ? 'méfiant' : 'hostile';
      const books = REALMS5.flatMap(r => Array.from({ length: o.books[r] || 0 }, () => '<i style="display:inline-block;width:9px;height:15px;border-radius:2px;margin-right:2px;background:' + REALM_COLORS[r] + ';' + UI.solid(REALM_COLORS[r]) + '"></i>')).join('');
      const what = { peace: 'Un pacte de paix : aucun de vous deux ne peut plus attaquer l\'autre sans rompre le traité, ce que les autres sorciers ne pardonnent pas.', alliance: 'Une alliance : une entente plus étroite qu\'un pacte de paix ; la rompre en attaquant coûte cher en réputation.' }[kind] || '';
      const relName = r => r > 50 ? 'amical' : r > 15 ? 'cordial' : r > -15 ? 'neutre' : r > -50 ? 'méfiant' : 'hostile';
      const booksOf = w => REALMS5.flatMap(r => Array.from({ length: w.books[r] || 0 }, () => '<i style="display:inline-block;width:9px;height:15px;border-radius:2px;margin-right:2px;background:' + REALM_COLORS[r] + ';' + UI.solid(REALM_COLORS[r]) + '"></i>')).join('');
      // l'adversaire visé par une alliance : connu ou non, sa capitale ou sa plus grande cité repérée
      const T = off.against != null && game.players[off.against] && off.against !== pl.id ? game.players[off.against] : null;
      const tKnown = !!(T && Players.knows(game, pl.id, T.id)), tRel = T ? (T.relations[pl.id] || 0) : 0;
      const tGoal = T && tKnown ? Panels.wizardGoal(game, pl, T) : null, tCap = !!(tGoal && tGoal.fortress && tGoal.id === T.fortress);
      const tLabel = tCap ? 'Voir sa capitale' : 'Voir sa plus grande cité repérée';
      // ce qu'il peut encore donner : son or a pu fondre, la cité changer de mains depuis l'offre
      const gold = off.gold ? Math.min(off.gold, Math.max(0, o.gold)) : 0, cityOk = off.city != null && game.cities[off.city] && game.cities[off.city].owner === o.id && !game.cities[off.city].fortress;
      const html = '<div class="contact-card small" style="--pc:' + o.color + '"><canvas id="offer-pic" width="240" height="240"></canvas><div class="contact-info">'
        + '<div class="contact-name" style="color:' + o.color + '">' + U.esc(o.name) + '</div>'
        + '<div class="contact-books">' + books + '</div>'
        + '<div class="muted">Traité actuel : <b>' + Diplomacy.stateName(pl.diplo[o.id]).toLowerCase() + '</b> · attitude envers vous : <b class="' + (rel > 15 ? 'ok' : rel < -15 ? 'danger' : '') + '">' + relTxt + ' (' + Math.round(rel) + ')</b></div>'
        // ce que l'écran des sorciers sait de lui : dons, cités, puissance, armée estimée, raisons de son attitude, émissaires…
        + '<div id="offer-intel" class="offer-intel"></div>'
        + (kind === 'demand' ? '<p style="margin:10px 0 4px">Il exige : <b>' + U.esc(Diplomacy.demandText(game, pl.id, off)) + '</b>.</p><div class="' + (off.ultimatum ? 'danger' : 'gold') + '">Si vous refusez : ' + (off.ultimatum ? 'il vous déclarera la guerre.' : 'il vous en voudra (−15).') + '</div>' + (off.gold > pl.gold ? '<div class="dim">Vous n\'avez pas cette somme.</div>' : '')
          : kind === 'trade' ? '<p style="margin:10px 0 4px">Il propose un échange : il vous apprend <b>' + U.esc(DATA.spells[off.give].name) + '</b> (' + U.fmt(Diplomacy.spellValue(off.give)) + ' RP) contre <b>' + U.esc(DATA.spells[off.get].name) + '</b> (' + U.fmt(Diplomacy.spellValue(off.get)) + ' RP).</p>'
          : '<p style="margin:10px 0 4px">Sa proposition : <b>' + Diplomacy.stateName(kind).toLowerCase() + '</b>' + (off.against != null && game.players[off.against] ? ' contre <b>' + U.esc(Players.nameFor(game, pl.id, off.against)) + '</b>, qui écrase la partie' : '') + (gold || cityOk ? ', et pour l\'obtenir :' : '.') + '</p>')
        + (gold ? '<div class="gold">• ' + gold + ' pièces d\'or</div>' : '')
        + (cityOk ? (() => { const cc = game.cities[off.city]; return '<div class="gold">• la cité de ' + U.esc(cc.name) + ' (' + Cities.sizeName(cc).toLowerCase() + ', ' + U.fmt(cc.pop) + ' habitants)</div>'; })() : '')
        + (what ? '<div class="dim">' + what + '</div>' : '') + '</div></div>'
        // celui contre qui il propose de s'allier : ce qu'on en sait, et un coup d'œil sur sa capitale (ou sa plus grande cité repérée)
        + (T ? '<div class="offer-target" style="--pc:' + (tKnown ? T.color : '#9a948a') + '"><canvas id="offer-tpic" width="160" height="160"></canvas><div class="contact-info">'
          + '<div class="contact-kicker">Contre</div><div class="offer-tname" style="color:' + (tKnown ? T.color : '#9a948a') + '">' + U.esc(U.cap(Players.nameFor(game, pl.id, T.id))) + '</div>'
          + (tKnown ? '<div class="contact-books">' + booksOf(T) + '</div><div class="muted">Traité : <b>' + Diplomacy.stateName(pl.diplo[T.id]).toLowerCase() + '</b> · attitude envers vous : <b class="' + (tRel > 15 ? 'ok' : tRel < -15 ? 'danger' : '') + '">' + relName(tRel) + ' (' + Math.round(tRel) + ')</b></div><div id="offer-tintel" class="offer-intel"></div>'
            : '<div class="dim">Vous ne l\'avez pas encore rencontré : vous ne savez rien de lui.</div>')
          + (tGoal ? '<button class="abtn" id="offer-tgo" style="margin-top:8px">' + tLabel + '</button>' : '') + '</div></div>' : '');
      // sa capitale si on l'a vue, sinon sa plus grande cité repérée : un coup d'œil sur la carte (le portrait ou le bouton), puis on revient à la proposition
      const goal = Panels.wizardGoal(game, pl, o), isCap = !!(goal && goal.fortress && goal.id === o.fortress), goLabel = isCap ? 'Voir la capitale' : 'Voir sa plus grande cité';
      const tradeOk = kind !== 'trade' || (o.known.includes(off.give) && Diplomacy.canLearn(pl, off.give) && pl.known.includes(off.get) && Diplomacy.canLearn(o, off.get));
      const choices = [{ label: 'Refuser', value: false }, { label: kind === 'demand' ? 'Céder' : 'Accepter', value: true, primary: kind !== 'demand', disabled: (kind === 'demand' && off.gold > pl.gold) || !tradeOk }];
      if (goal) choices.unshift({ label: goLabel, value: 'capital' });
      const TGO = '\u200bcible';   // bouton du pied de fenêtre caché : la cible se regarde depuis son propre encadré
      if (tGoal) choices.push({ label: TGO, value: 'target' });
      let yes;
      for (;;) {
        const pr = UI.choice((kind === 'demand' ? (off.ultimatum ? 'Ultimatum de ' : 'Exigence de ') : kind === 'trade' ? 'Échange proposé par ' : 'Proposition de ') + o.name, html, choices, { width: T ? 660 : 620, cls: 'contact-modal' });
        setTimeout(() => {
          const c = $('#offer-pic'); if (!c) return;
          Sprites.paint(c, 'wizard:' + o.portrait);
          const box = $('#offer-intel'); if (box) box.append(...Panels.wizardFacts(game, pl, o, { capital: true }).slice(), ...[Panels.forceLine(game, pl, o)].filter(Boolean), ...Panels.wizardSignals(game, pl, o));
          if (T) {
            const tc = $('#offer-tpic');
            if (tc && tKnown) Sprites.paint(tc, 'wizard:' + T.portrait);
            else if (tc) { const x = tc.getContext('2d'); x.fillStyle = '#9a948a'; x.font = 'bold 96px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 80, 86); }
            const tb = $('#offer-tintel'); if (tb) tb.append(...Panels.wizardFacts(game, pl, T, { capital: true }).slice(), ...[Panels.forceLine(game, pl, T)].filter(Boolean), ...Panels.wizardSignals(game, pl, T));
            const hid = [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === TGO);
            if (hid) { hid.style.display = 'none'; const go = () => hid.click(); const tg = $('#offer-tgo'); if (tg) tg.onclick = go; if (tc) { tc.style.cursor = 'pointer'; tc.title = tLabel; tc.addEventListener('click', go); } }
          }
          if (goal) { c.style.cursor = 'pointer'; c.title = isCap ? 'Voir sa capitale' : 'Voir sa plus grande cité repérée'; c.addEventListener('click', () => { const bt = [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === goLabel); if (bt) bt.click(); }); }
        }, 10);
        yes = await pr;
        if ((yes !== 'capital' && yes !== 'target') || App.game !== game) break;
        const w = yes === 'target' ? T : o, gl = yes === 'target' ? tGoal : goal, cap = yes === 'target' ? tCap : isCap, wn = U.esc(Players.nameFor(game, pl.id, w.id));
        MapView.centerOn(gl.x, gl.y, gl.plane); MapView.ping(gl.x, gl.y, gl.plane); App.refresh();
        await App.peek(U.esc(gl.name) + (cap ? ', capitale ' + App.de(wn) : ', la plus grande cité repérée ' + App.de(wn) + ' (sa capitale vous est inconnue)'), 'Revenir à la proposition');
      }
      if (yes === null || App.game !== game) return;
      Diplomacy.dropOffer(pl, off);
      if (yes) { Diplomacy.acceptOffer(game, pl, off); UI.toast(kind === 'demand' ? 'Vous cédez à ' + U.esc(o.name) + '.' : kind === 'trade' ? 'Vous apprenez ' + U.esc(DATA.spells[off.give].name) + '.' : 'Traité signé avec ' + U.esc(o.name) + '.'); MapView.invalidate(); MapView.bumpVis(); App.refresh(); }
      else Diplomacy.refuseOffer(game, pl, off);
    } finally { App._offerOpen = false; }
  },
  // un coup d'œil à la carte au milieu d'un dialogue : un bandeau en haut, et un bouton pour y revenir
  // (le jeu est en pause : on regarde, on fait défiler la carte, on ne donne aucun ordre)
  peek(text, label) {
    return new Promise(res => {
      const done = () => { if (!bar.parentNode) return; bar.remove(); App.peeking = false; App._peekDone = null; document.body.classList.remove('peek-offer'); window.removeEventListener('keydown', onKey, true); res(); };
      const onKey = e => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); e.stopPropagation(); done(); } else if (!e.key.startsWith('Arrow')) e.stopPropagation(); };
      const bar = h('div', { class: 'peekbar' }, h('span', { html: text }), h('button', { class: 'btn primary', onclick: done }, label));
      App.peeking = true; App._peekDone = done; document.body.classList.add('peek-offer');
      window.addEventListener('keydown', onKey, true);
      document.body.append(bar);
    });
  },
  // fin de partie : pourquoi, le classement final, la courbe des scores révélée, les grands moments ; la chronique complète en un clic.
  // « Voir la carte » referme la fenêtre ; elle revient à la fin du tour (Entrée).
  gameOver(force) {
    const game = App.game;
    if (!game || (App._overShown === game && !force) || App._overModal) return;
    App._overShown = game;
    const me = App.me(), win = game.winner === App.pid, w = game.winner != null ? game.players[game.winner] : null, ch = Chronicle.of(game);
    const ban = ch.ev.slice().reverse().find(e => e.k === 'banished' && e.a === me.id);
    const why = game.overWhy === 'mastery' ? (win ? 'Vous avez accompli le Sort de Maîtrise : toute magie vous obéit désormais.' : U.esc(w ? w.name : '?') + ' a accompli le Sort de Maîtrise : toute magie lui obéit désormais.')
      : game.overWhy === 'conquest' ? (win ? 'Vos rivaux sont tous tombés : vous régnez sans partage sur les deux plans.' : U.esc(w ? w.name : '?') + ' règne sans partage sur les deux plans.')
      : 'Votre règne s\'achève : vous avez perdu votre dernière cité' + (ban && ban.by >= 0 && game.players[ban.by] ? ', après la chute de votre forteresse face à ' + U.esc(game.players[ban.by].name) : '') + '.';
    const body = h('div');
    const artId = game.overWhy === 'mastery' ? (win ? 'win_mastery' : 'lose_mastery') : game.overWhy === 'conquest' && win ? 'win_conquest' : 'defeat';
    if (!window.AUTO_CHOICE) { const img = h('img', { src: 'assets/endgame/' + artId + '.jpg', alt: '' }), band = h('div', { class: 'end-art' }, img); img.onerror = () => band.remove(); body.append(band); }
    body.append(h('p', { class: 'serif', style: 'font-size:18px;margin:0 0 4px', html: why }), h('div', { class: 'dim', style: 'margin-bottom:10px' }, 'Partie achevée au tour ' + game.turn + '.'));
    // classement : la dernière ligne de chaque sorcier dans la chronique
    const last = new Map(); for (const row of ch.rows) for (const r of row.r) last.set(r[0], { t: row.t, r });
    const elim = new Map(ch.ev.filter(e => e.k === 'eliminated').map(e => [e.a, e.t]));
    const rank = game.players.map(p => ({ p, l: last.get(p.id) })).filter(x => x.l).sort((a, b) => (b.p.id === game.winner) - (a.p.id === game.winner) || b.p.alive - a.p.alive || b.l.r[1] - a.l.r[1]);
    const tbl = h('table', { class: 't', style: 'margin-bottom:8px' }, h('tr', null, ...['Sorcier', 'Score', 'Cités', 'Armée', 'Sorts', ''].map(t => h('th', { style: 'text-align:left' }, t))));
    for (const { p, l } of rank) tbl.append(h('tr', null, h('td', null, h('span', { class: 'realmdot', style: 'color:' + p.color }), p.name + (p.id === me.id ? ' (vous)' : '')), h('td', null, U.fmt(l.r[1])), h('td', null, l.r[3]), h('td', null, U.fmt(l.r[2])), h('td', null, l.r[6]),
      h('td', { class: p.id === game.winner ? 'gold' : p.alive ? 'dim' : 'danger' }, p.id === game.winner ? 'vainqueur' : p.alive ? (p.banished ? 'banni' : 'en vie') : 'vaincu' + (elim.has(p.id) ? ' au tour ' + elim.get(p.id) : ''))));
    body.append(tbl);
    const marks = ch.ev.filter(e => (Chronicle.KINDS[Chronicle.kindOf(e)] || {}).major).map(e => ({ t: e.t, text: Chronicle.text(game, e, me.id, true), icon: (Chronicle.KINDS[Chronicle.kindOf(e)] || {}).icon || '•', color: game.players[e.a] ? game.players[e.a].color : '#d9b25a' }));
    body.append(Panels.lineChart(game, Chronicle.series(game, me.id, 'score', true), { me: me.id, who: id => U.cap(Chronicle.who(game, me.id, id, true)), marks, fallen: new Set(elim.keys()), W: 760, H: 230, legend: false }));
    const big = ch.battles.slice().sort((a, b) => b.size - a.size)[0];
    if (big) { const tx = Chronicle.battleText(game, big, me.id, true); body.append(h('div', { style: 'margin-top:6px;font-size:12.5px' }, h('span', { class: 'gold' }, 'La plus grande bataille : '), tx.place + ', tour ' + big.t + ' (' + tx.sides + ', force ' + U.fmt(big.size) + ') : ' + tx.won + '.')); }
    const m = UI.modal({ title: win ? 'Victoire !' : 'Fin de partie', width: 820, body, onClose: () => { App._overModal = null; },
      footer: [
        h('button', { class: 'btn primary', onclick: () => Panels.chronicle(game, { reveal: true }) }, 'Chronique complète'),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Voir la carte'),
        h('button', { class: 'btn', onclick: () => { m.close(); Setup.loadMenu(); } }, 'Charger une partie'),
        h('button', { class: 'btn', onclick: () => { UI.closeAll(); Setup.titleScreen(); } }, 'Nouvelle partie'),
      ] });
    App._overModal = m;
  },

  // une légende accomplie : l'épilogue du héros, sa relique, ce que rapporte la quête
  async legendScreen(q) {
    const game = App.game, u = q.hero, it = q.item, R = q.reward || Heroes.LEGEND_REWARD;
    const title = (u.hero.title ? U.esc(u.hero.title) + ' · ' : '') + U.esc(U.cap(q.place));
    const rewards = [q.dead ? null : '<b>+' + R.xp + '</b> XP pour ' + U.esc(u.hero.name), '<b class="gold">+' + R.gold + '</b> pièces d\'or', '<b class="fame">+' + R.fame + '</b> de renommée', '<b>+' + R.troopXp + '</b> XP pour chaque ' + (q.dead ? 'survivant' : 'unité') + ' de son armée'].filter(Boolean);
    const html = '<div class="legend-card' + (q.dead ? ' fallen' : '') + '">'
      + '<div class="legend-banner">' + (q.dead ? 'Légende accomplie, au prix de sa vie' : 'Légende accomplie') + '</div>'
      + '<div class="legend-sub">' + U.esc(u.hero.name) + ' · ' + title + '</div>'
      + '<div class="legend-body"><div class="legend-pic"><canvas id="legend-pic" width="300" height="300"></canvas>' + (q.dead ? '<div class="legend-rip">Tombé' + (DATA.heroes[u.type] && DATA.heroes[u.type].female ? 'e' : '') + ' dans la victoire</div>' : '') + '</div>'
      + '<p class="legend-text">' + U.esc(q.ending) + '</p></div>'
      + '<div class="legend-relic"><canvas id="legend-relic" width="96" height="96"></canvas><div><div class="legend-relic-name">' + U.esc(it.name) + '</div><div class="muted">Arme légendaire · ' + U.esc(Items.describe(it)) + '</div>'
      + '<div class="dim">' + (q.dead ? 'Elle rejoint le coffre de votre forteresse.' : 'Elle est déjà entre ses mains.') + '</div></div></div>'
      + '<div class="legend-rewards">' + rewards.join('<span class="dim"> · </span>') + '</div></div>';
    try { Sfx.play('legend'); } catch (e) { }
    const opts = [{ label: q.dead ? 'Honorer sa mémoire' : 'Gloire à ' + u.hero.name + ' !', value: 'ok', primary: true }];
    if (!q.dead && game.units[u.id]) opts.unshift({ label: 'Voir sa fiche', value: 'sheet' });
    const pr = UI.choice('Légende ' + Heroes.dePlace(q.place), html, opts, { width: 720, cls: 'legend-modal' });
    setTimeout(() => { const c = $('#legend-pic'); if (c) Sprites.paint(c, Sprites.heroPicOf(u)); const r = $('#legend-relic'); if (r) Sprites.paint(r, it.icon); }, 10);
    const v = await pr;
    if (v === 'sheet' && game.units[u.id]) setTimeout(() => Panels.heroSheet(u), 50);
    App.refresh();
    return true;
  },
  // une cité prise : sa zone, les cases qu'elle partage avec les cités du joueur (à moitié rendement), et ce que sa
  // disparition rendrait à celles-ci (leur économie calculée sans elle)
  conquestZone(c) {
    const game = App.game, w = game.world;
    const mine = Cities.ofPlayer(game, App.pid).filter(o => o.id !== c.id && o.plane === c.plane && Math.abs(World.dxw(w, o.x, c.x)) <= 4 && Math.abs(o.y - c.y) <= 4);
    const tiles = World.catchment(w, c.x, c.y), shared = new Set(), touch = new Set();
    for (const o of mine) {
      const own = new Set(World.catchment(w, o.x, o.y).map(([x, y]) => y * w.w + x));
      for (const [x, y] of tiles) if (own.has(y * w.w + x)) { shared.add(y * w.w + x); touch.add(o); }
    }
    const out = { tiles, shared, names: [...touch].map(o => o.name), food: 0, prod: 0, gold: 0, pop: 0 };
    if (!touch.size) return out;
    const sum = list => list.reduce((a, e) => ({ food: a.food + e.foodSurplus, prod: a.prod + e.prod, gold: a.gold + e.gold, pop: a.pop + e.maxPop }), { food: 0, prod: 0, gold: 0, pop: 0 });
    const near = [...touch], before = sum(near.map(o => Cities.econ(game, o)));
    const saved = game.cities[c.id]; delete game.cities[c.id];
    let after; try { after = sum(near.map(o => Cities.econ(game, o))); } finally { game.cities[c.id] = saved; }
    for (const k of ['food', 'prod', 'gold', 'pop']) out[k] = Math.round(after[k] - before[k]);
    return out;
  },
  // réponses aux questions du moteur (conquête, trésor)
  async answer(q) {
    if (q.type === 'conquer') {
      // la fenêtre en haut, la cité au centre de la carte : sa zone, et les cases qu'elle partage avec vos cités
      const c = q.city, z = App.conquestZone(c);
      MapView.zone = { plane: c.plane, tiles: z.tiles, shared: z.shared }; MapView.centerOn(c.x, c.y - 1, c.plane); App.dirty = true;   // un rien plus bas que le centre : sous la fenêtre
      const gain = [z.food > 0 ? '+' + z.food + ' nourriture' : '', z.prod > 0 ? '+' + z.prod + ' production' : '', z.gold > 0 ? '+' + z.gold + ' or' : ''].filter(Boolean);
      let html = 'Vos troupes tiennent <b>' + U.esc(c.name) + '</b> (' + U.fmt(c.pop) + ' habitants). Que faire de la cité ?';
      if (z.shared.size) html += '<div class="box" style="margin-top:8px">Elle partage <b class="danger">' + U.n(z.shared.size, 'case') + '</b> avec ' + z.names.map(U.esc).join(', ') + ' : ces cases ne rendent que la moitié.'
        + (gain.length || z.pop > 0 ? ' La raser rendrait à vos cités ' + gain.join(', ') + (gain.length ? ' par tour' : '') + (z.pop > 0 ? (gain.length ? ', et ' : '') + '+' + U.n(z.pop, 'habitant') + ' au maximum' : '') + '.' : ' Aujourd\'hui, la raser ne changerait rien à leur rendement.') + '</div>';
      else html += '<div class="dim" style="margin-top:6px">Son territoire ne touche pas celui de vos cités.</div>';
      html += '<div class="dim" style="margin-top:4px">La raser coûte 5 de renommée.</div>';
      const v = await UI.choice('Conquête de ' + c.name, html, [{ label: 'La raser', value: 'raze' }, { label: 'L\'annexer', value: 'capture', primary: true }], { noClose: true, cls: 'at-top' });
      MapView.zone = null; App.dirty = true;
      return v;
    }
    if (q.type === 'pact') {
      const o = q.offer, e = Pacts.ENT[o.entity];
      const art = await App.artBanner('pacts', o.entity);
      const html = art + '<div style="display:flex;gap:14px;align-items:flex-start"><canvas id="pact-pic" width="84" height="84" style="width:84px;height:84px;flex:none;border-radius:10px;background:#0c0b14"></canvas><div>'
        + '<div class="dim" style="font-style:italic">' + U.esc(o.lore) + '</div>'
        + '<div class="box" style="margin-top:8px"><b class="gold">Le don</b><div>' + U.esc(o.boonText) + '</div></div>'
        + '<div class="box" style="margin-top:6px"><b class="danger">La dette</b><div>' + U.esc(o.debtText) + '</div></div>'
        + '<div class="dim" style="margin-top:6px">Si vous refusez de payer le moment venu : ' + U.esc(o.refuseText) + '</div></div></div>';
      const pr = UI.choice(U.cap(e.name) + ' vous fait une offre', html, [{ label: 'Décliner', value: false }, { label: 'Sceller le pacte', value: true, primary: true }], { noClose: true, width: art ? 640 : 600 });
      setTimeout(() => { const c = $('#pact-pic'); if (c) MapView.paintSigil(c, o.entity); }, 10);
      return pr;
    }
    if (q.type === 'legend') return App.legendScreen(q);
    if (q.type === 'treasure') {
      await UI.choice('Trésor : ' + Game.siteName(q.site), '<p>Vos troupes découvrent :</p><ul>' + q.found.map(f => '<li>' + U.esc(f) + '</li>').join('') + '</ul>', [{ label: 'Magnifique', value: true, primary: true }]);
      return true;
    }
    return null;
  },

  // ---------- sauvegarde ----------
  serialize() { const g = App.game; return JSON.stringify(Object.assign({}, g, { rng: g.rng.s })); },
  deserialize(s) { const g = JSON.parse(s); g.rng = new RNG(g.rng); g.rng.s = typeof g.rng.s === 'number' ? g.rng.s : g.rng; return g; },
  save(slot) {
    const g = App.game; if (!g.uid) g.uid = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    try {
      // la sauvegarde automatique d'une autre partie n'est pas écrasée : elle devient « Partie précédente »
      // (une sauvegarde d'avant la 0.30, sans identifiant, compte comme une autre partie tant que celle-ci n'a rien écrit)
      if (slot === 'auto') {
        const m = App.saveMeta('auto');
        if (m && (m.uid ? m.uid !== g.uid : App._autoOwned !== g.uid)) {
          const keep = () => { localStorage.setItem('arcanes:prev', localStorage.getItem('arcanes:auto')); localStorage.setItem('arcanes:prev:meta', JSON.stringify(m)); };
          // stockage plein : l'ancienne « Partie précédente » cède sa place ; à défaut, la partie en cours passe avant
          try { keep(); } catch (e1) { try { localStorage.removeItem('arcanes:prev'); localStorage.removeItem('arcanes:prev:meta'); keep(); } catch (e2) { UI.toast('Stockage plein : la sauvegarde automatique de la partie précédente n\'a pas pu être gardée.', 'warn'); } }
        }
      }
      localStorage.setItem('arcanes:' + slot, App.serialize()); localStorage.setItem('arcanes:' + slot + ':meta', JSON.stringify({ t: Date.now(), turn: g.turn, name: App.me().name, uid: g.uid }));
      if (slot === 'auto') App._autoOwned = g.uid;
      return true;
    } catch (e) {
      if (slot !== 'auto') UI.toast('Sauvegarde impossible : ' + U.esc(e.message), 'warn');
      else if (App._autoSaveWarned !== g.uid) { App._autoSaveWarned = g.uid; UI.toast('Sauvegarde automatique impossible (' + U.esc(e.message) + ') : exportez la partie depuis le menu.', 'warn'); }
      return false;
    }
  },
  saveMeta(slot) { try { return JSON.parse(localStorage.getItem('arcanes:' + slot + ':meta')); } catch (e) { return null; } },
  // un fichier de sauvegarde : dans le dossier choisi (Chrome, Edge) s'il y en a un, sinon dans les téléchargements
  // ask : le joueur vient de cliquer, on peut lui demander l'autorisation d'écrire dans son dossier
  async exportSave(ask) {
    const name = (App.me().name || 'sorcier').normalize('NFKD').replace(/[^\w-]+/g, '').toLowerCase() || 'sorcier';
    const file = 'arcanes-' + name + '-' + __k('@save_turn', 'tour') + App.game.turn + '.json', text = App.serialize();
    if (App.prefs.saveDir && SaveDir.supported()) {
      const r = await SaveDir.write(file, text, ask);
      if (r.ok) return { ok: true, file, dir: r.dir };
      if (r.why === 'ask') return { ok: false, file, why: 'ask', dir: r.dir };
      // le dossier a disparu, ou l'autorisation a été retirée : on retombe sur le téléchargement, une fois dit
      App.dirWarn(r);
    }
    App.download(file, text);
    return { ok: true, file };
  },
  download(file, text) {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: file });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  },
  dirWarn(r) {
    console.warn('dossier de sauvegarde : ' + (r && r.why));
    if (App._dirWarned) return; App._dirWarned = true;
    UI.toast('Impossible d\'écrire dans le dossier de sauvegarde : la copie part dans vos téléchargements.', 'warn', 'savedir');
  },
  // la copie du tour : écrite dans le dossier, ou téléchargée ; si le navigateur attend un clic, on le demande une fois
  async autoExport() {
    const r = await App.exportSave(false);
    if (r.ok) { UI.toast(r.dir ? 'Sauvegarde du tour ' + App.game.turn + ' écrite dans ' + U.esc(r.dir) + '.' : 'Sauvegarde du tour ' + App.game.turn + ' téléchargée.'); return; }
    // Chrome oublie l'autorisation au lancement : un clic la rend, pour toute la session
    const ok = await UI.confirm('Dossier de sauvegarde', 'Le navigateur demande de confirmer l\'accès au dossier <b>' + U.esc(r.dir || '') + '</b> pour y déposer les copies de la partie. Sans cela, elles iront dans vos téléchargements.', 'Autoriser', 'Télécharger');
    if (!ok) { App.download(r.file, App.serialize()); UI.toast('Sauvegarde du tour ' + App.game.turn + ' téléchargée.'); return; }
    const r2 = await App.exportSave(true);
    if (r2.ok) UI.toast(r2.dir ? 'Sauvegarde du tour ' + App.game.turn + ' écrite dans ' + U.esc(r2.dir) + '.' : 'Sauvegarde du tour ' + App.game.turn + ' téléchargée.');
  },
  load(slot) {
    const s = localStorage.getItem('arcanes:' + slot); if (!s) return false;
    const g = App.deserialize(s); App.start(g); return true;
  },

  // effets visibles sur la carte : la faille qu'on referme se résorbe sous les yeux du joueur
  onFx(ev) {
    const game = App.game; if (!game) return;
    if (ev.type === 'oblivion' || ev.type === 'mapKnowledge') { MapView.invalidate(); MapView.invalidateVis(); MapView.bumpVis(); App.dirty = true; return; }
    if (ev.type === 'spellCast' || ev.type === 'rite' || ev.type === 'bookFrag') { if (ev.player === App.pid) (App.spellFx = App.spellFx || []).push(ev); return; }
    if (ev.type !== 'riftClose') return;
    const mine = ev.by === App.pid, w = game.world, vis = MapView.vis && MapView.vis[ev.plane];
    if (!mine && !(vis && vis[ev.y * w.w + World.wx(w, ev.x)])) return;
    // l'animation attend que les fenêtres (résumé du tour, grimoire, bataille) soient fermées pour qu'on la voie
    (MapView.fx = MapView.fx || []).push({ type: 'riftClose', x: ev.x, y: ev.y, plane: ev.plane, id: ev.id, t0: null, center: mine && ev.main });
  },
  // un sort lancé sur la carte : en grand au centre, l'icône dans un halo aux couleurs de son royaume ; la carte se tourne
  // vers sa cible quand il en a une. On attend que les fenêtres (résumé du tour, grimoire, bataille) soient fermées.
  flushSpellFx() {
    if (App.spellShowing || (UI.modals || []).length || UI.busy || (typeof CombatView !== 'undefined' && CombatView.active)) return;
    const ev = App.spellFx.shift(); if (!ev) return;
    if (ev.type === 'bookFrag') return App.bookFragPrompt(ev);
    // le pacte contre le meneur : la même annonce, sous l'icône du Seigneur démon
    const game = App.game, rite = ev.type === 'rite', sp = rite ? { realm: ev.book ? 'arcane' : 'death', name: ev.title } : DATA.spells[ev.id]; if (!sp) return;
    const t = ev.target || {}, u = t.unit != null ? game.units[t.unit] : null, c = t.city != null ? game.cities[t.city] : null;
    const at = t.x != null ? [t.x, t.y, t.plane] : c ? [c.x, c.y, c.plane] : u ? [u.x, u.y, u.plane] : null;
    // la cible un peu sous le centre : la carte de l'annonce ne la cache pas
    if (at) { MapView.centerOn(at[0], at[1] - 2, at[2]); MapView.ping(at[0], at[1], at[2]); App.dirty = true; }
    const col = REALM_COLORS[sp.realm] || '#d8c79a';
    const card = h('div', { class: 'spell-cast', style: '--rc:' + col },
      h('div', { class: 'sc-icon' }, h('div', { class: 'sc-halo' }), spriteCanvas(rite ? (ev.icon || (ev.book ? 'item:book' : 'spell:demon_lord')) : 'spell:' + ev.id, 112)),
      h('div', { class: 'sc-realm' }, rite ? (ev.book ? 'Quête' : 'Pacte') : ({ arcane: 'Sort d\'Arcane', life: 'Sort de Vie', death: 'Sort de Mort', chaos: 'Sort de Chaos', nature: 'Sort de Nature', sorcery: 'Sort de Sorcellerie' }[sp.realm] || 'Sort')),
      h('div', { class: 'sc-name' }, sp.name),
      h('div', { class: 'sc-msg' }, ev.msg || ''));
    App.spellShowing = true;
    const done = () => { if (!card.isConnected) return; card.classList.add('out'); setTimeout(() => { card.remove(); App.spellShowing = false; }, 450); };
    card.onclick = done;
    document.body.append(card);
    if (typeof Sfx !== 'undefined') Sfx.play('spell', { realm: sp.realm });
    setTimeout(done, rite ? 5200 : 3400);
  },
  // un fragment du Livre de légende : au centre de l'écran, et ce qu'il signifie (une fenêtre, à fermer soi-même)
  bookFragPrompt(ev) {
    const game = App.game; if (!game || !game.book) return;
    App.spellShowing = true;
    const n = ev.held, F = Book.FRAGS, NEED = Book.NEED || 3;
    const frags = h('div', { class: 'bf-frags' });
    for (let i = 0; i < F; i++) { const c = spriteCanvas('item:bookfrag', 34); if (i >= n) c.style.opacity = '.18'; frags.append(c); }
    const body = h('div', { class: 'lm bookfrag', style: '--lc:#e6c47a' },
      h('div', { class: 'bf-icon' }, h('div', { class: 'lm-halo' }), spriteCanvas('item:bookfrag', 120)),
      h('div', { class: 'lm-kicker' }, 'Le Livre de légende'),
      h('div', { class: 'lm-name' }, 'Un fragment est à vous'),
      h('div', { class: 'lm-text' }, ev.how),
      h('div', { class: 'bf-clue' }, '« ' + ev.clue + ' »'),
      h('div', { class: 'lm-eff' }, 'Le Livre de légende renferme des sorts qu\'on ne trouve nulle part ailleurs. Ses ' + F + ' fragments sont dispersés : chacun dévoile un morceau de la carte qui mène à son caveau, et il en faut ' + NEED + ' pour en briser le sceau.'),
      frags, h('div', { class: 'lm-eff', style: 'margin-top:2px' }, 'Vous en détenez ' + n + ' sur ' + F + (n >= NEED ? ' : le sceau peut céder.' : '.')));
    if (typeof Sfx !== 'undefined') Sfx.play('legend');
    const m = UI.modal({ title: '', body, width: 620, cls: 'landmark-modal', onClose: () => { App.spellShowing = false; },
      footer: [h('button', { class: 'btn', onclick: () => { m.close(); MagicUI.puzzleModal(game, App.pid); } }, 'Voir la carte du Livre'), h('button', { class: 'btn primary', onclick: () => m.close() }, 'Continuer')] });
  },
  toggleLairs() {
    App.showLairs = !App.showLairs;
    const b = $('#mm-lairs'); if (b) b.classList.toggle('on', App.showLairs);
    if (App.showLairs) {
      const n = p => MapView.openLairs(App.game, App.me(), p).length, m = p => MapView.scoutedLairs(App.game, App.me(), p).length, cur = MapView.plane, oth = 1 - cur;
      const part = f => f(cur) + ' sur ' + PLANE_NAMES[cur] + (f(oth) ? ', ' + f(oth) + ' sur ' + PLANE_NAMES[oth] : '');
      UI.toast('<span style="color:#ffd66e">Inexplorés</span> : ' + part(n) + '. <span style="color:#cd8cff">Repérés, pas conquis</span> : ' + part(m) + '.', '', 'lairs');
    }
    App.renderMinimap();
  },
  toggleNodes() {
    App.showNodes = !App.showNodes;
    const b = $('#mm-nodes'); if (b) b.classList.toggle('on', App.showNodes);
    if (App.showNodes) {
      const cur = MapView.plane, oth = 1 - cur, me = App.me(), L = p => MapView.freeNodes(App.game, me, p);
      const desc = p => { const l = L(p), n = k => l.filter(s => MapView.nodeKind(me, s) === k).length, f = n('free'), gd = n('guarded'), e = n('rival');
        return [f ? '<span style="color:#6eebaa">' + U.n(f, 'libre', 'libres') + '</span>' : '', gd ? '<span style="color:#ffce5a">' + gd + ' gardé' + (gd > 1 ? 's' : '') + ' ou pas encore visité' + (gd > 1 ? 's' : '') + '</span>' : '',
          e ? '<span style="color:#ff7869">' + e + ' tenu' + (e > 1 ? 's' : '') + ' par des rivaux</span>' : ''].filter(Boolean).join(', ') || U.txt('aucun'); };
      UI.toast('Nœuds à prendre sur ' + PLANE_NAMES[cur] + ' : ' + desc(cur) + (L(oth).length ? ' ; sur ' + PLANE_NAMES[oth] + ' : ' + desc(oth) : '') + '.', '', 'nodes');
    }
    App.renderMinimap();
  },
  togglePlane() {
    const np = 1 - MapView.plane;
    if (!MapView.layers[np]) { App.preparing = true; UI.setBusy('Peinture des terres…'); setTimeout(() => { try { MapView.ensureLayer(np); } finally { App.preparing = false; UI.setBusy(null); } MapView.plane = np; MapView.bumpVis(); App.refresh(); }, 40); return; }
    MapView.plane = np; MapView.bumpVis(); App.refresh();
  },

  // ---------- saisie ----------
  bindInput() {
    const cv = $('#map');
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', e => {
      if (!App.game) return;
      App.drag = { x: e.clientX, y: e.clientY, camX: MapView.camX, camY: MapView.camY, moved: false, button: e.button };
    });
    window.addEventListener('mousemove', e => {
      if (!App.game) return;
      if (App.drag) {
        const dx = e.clientX - App.drag.x, dy = e.clientY - App.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) App.drag.moved = true;
        if (App.drag.moved) { MapView.camX = App.drag.camX - dx / MapView.ts; MapView.camY = App.drag.camY - dy / MapView.ts; MapView.clampCam(); cv.style.cursor = 'grabbing'; }
      }
      if (e.target === cv) {
        const t = MapView.screenToTile(e.clientX, e.clientY);
        App._tipEv = e;
        if (!MapView.hover || MapView.hover.x !== t.x || MapView.hover.y !== t.y) {
          MapView.hover = World.inY(App.game.world, t.y) ? t : null;
          App.updatePathPreview();
          App.renderSide();
          // infobulle des unités de la case, après un court arrêt du curseur
          clearTimeout(App._tipT); if (UI.tipOwner === cv) UI.hideTip();
          if (MapView.hover) App._tipT = setTimeout(() => {
            const hv = MapView.hover, ev = App._tipEv;
            if (!hv || hv.x !== t.x || hv.y !== t.y || (App.drag && App.drag.moved) || UI.modals.length || CombatView.active || !ev) return;
            const html = App.mapTip(t.x, t.y); if (html) UI.showTip(html, ev, cv);
          }, 420);
        } else if (UI.tipOwner === cv) UI.moveTip(e);
      } else clearTimeout(App._tipT);
    });
    window.addEventListener('mouseup', async e => {
      if (!App.game || !App.drag) return;
      const d = App.drag; App.drag = null; cv.style.cursor = '';
      // (0.31.43) « a bougé » restait vrai au moindre tremblement en cours d'appui, et le clic était perdu : ce qui compte
      // est l'écart au relâchement. Un double-clic rapide tremble plus qu'un double-clic posé ; c'est lui qu'on perdait.
      const far = Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6;
      if ((d.moved && far) || e.target !== cv || UI.busy || App.peeking || document.body.classList.contains('peeking')) return;
      const t = MapView.screenToTile(e.clientX, e.clientY);
      if (!World.inY(App.game.world, t.y)) return;
      // clic droit : annule le ciblage d'un sort, sinon désélectionne
      if (d.button === 2 && App.tilePick) { const tp = App.tilePick; App.tilePick = null; tp.resolve(null); return; }
      if (d.button === 2) { if (App.roadMode) { App.roadMode = null; MapView.roadPreview = null; UI.toast('Tracé de route annulé.', '', 'roadmode'); App.refresh(); return; } if (MagicUI.targeting) MagicUI.cancelTarget(); else App.deselect(); return; }
      await App.clickTile(t.x, t.y, e);
    });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const before = MapView.screenToTile(e.clientX, e.clientY);
      const z = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      MapView.ts = U.clamp(Math.round(MapView.ts * z), 24, 128);
      MapView.clampCam(); App.renderMinimap();
    }, { passive: false });
    $('#minimap').addEventListener('mousedown', e => {
      const r = e.target.getBoundingClientRect();
      const go = ev => { MapView.camX = (ev.clientX - r.left) / r.width * App.game.world.w; MapView.camY = (ev.clientY - r.top) / r.height * App.game.world.h; MapView.clampCam(); App.renderMinimap(); };
      go(e);
      const mv = ev => go(ev), up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    });
    window.addEventListener('keydown', e => App.onKey(e));
    setInterval(() => { if (!App.game) return; const k = App.keys; const sp = 0.35; let mv = false; if (k.ArrowLeft) { MapView.camX -= sp; mv = true; } if (k.ArrowRight) { MapView.camX += sp; mv = true; } if (k.ArrowUp) { MapView.camY -= sp; mv = true; } if (k.ArrowDown) { MapView.camY += sp; mv = true; } if (mv) { MapView.clampCam(); App.renderMinimap(); } }, 30);
    window.addEventListener('keyup', e => { App.keys[e.key] = false; });
  },
  deselect() { App.sel = null; App.prevSel = null; MapView.sel = null; MapView.path = null; MapView.roadPreview = null; App.refresh(); },
  // ce que le joueur connaît : terres explorées, et troupes étrangères en vue (un déplacement qui change cela ne s'annule pas)
  revealSig() {
    const game = App.game, pl = App.me(), w = game.world;
    let n = 0; for (const p of [0, 1]) { const ex = pl.explored[p]; for (let i = 0; i < ex.length; i++) if (ex[i]) n++; }
    const vis = Move.visibility(game, pl.id);
    const seen = Object.values(game.units).filter(u => u.owner !== pl.id && vis[u.plane][u.y * w.w + u.x]).map(u => u.id).sort((a, b) => a - b).join(',');
    return n + '|' + seen;
  },
  // le dernier déplacement peut-il être annulé ? (même tour, unités là où il les a laissées, rien fait depuis)
  canUndo(ids) {
    const game = App.game, u = App.undo;
    if (!u || u.turn !== game.turn || (ids && !ids.some(id => u.ids.includes(id)))) return false;
    return u.after.every(a => { const x = game.units[a.id]; return x && x.x === a.x && x.y === a.y && x.moves === a.moves; });
  },
  undoMove() {
    const game = App.game;
    if (!App.canUndo()) { App.undo = null; UI.toast('Plus rien à annuler.', 'warn'); return; }
    for (const b of App.undo.before) Object.assign(game.units[b.id], { x: b.x, y: b.y, plane: b.plane, moves: b.moves, path: b.path, dest: b.dest, status: b.status, attackOrder: b.attackOrder, roadPlan: b.roadPlan });
    const b0 = App.undo.before[0], ids = App.undo.ids; App.undo = null;
    MapView.bumpVis(); MapView.invalidateVis();
    App.selectTile(b0.plane, b0.x, b0.y, ids);
    UI.toast('Déplacement annulé.');
  },
  // désigner une case de la carte (point de ralliement…) : le prochain clic la donne, clic droit ou Échap annule
  pickTile(prompt) {
    if (App.tilePick) App.tilePick.resolve(null);
    UI.toast(prompt + ' <span class="dim">(clic droit ou Échap : annuler)</span>', '', 'tilepick');
    return new Promise(resolve => { App.tilePick = { resolve: v => { UI.toast(v ? 'Case choisie.' : 'Choix annulé.', '', 'tilepick'); resolve(v); } }; });
  },
  // Commandes : clic = sélectionner ou viser ; double-clic = ordre de marche ; clic droit = désélectionner
  async clickTile(x, y, e) {
    const game = App.game, p = MapView.plane;
    const now = performance.now(), key = p + ',' + x + ',' + y;
    // second clic d'un double-clic qui vient de fixer une route ou une cible de sort : ignoré, sinon il devient un ordre de marche
    if (App.swallow && App.swallow.key === key && now < App.swallow.until) { App.swallow = null; App.lastClick = 0; return; }
    App.swallow = null;
    const dbl = now - (App.lastClick || 0) < 340 && App.lastTile === key; App.lastClick = dbl ? 0 : now; App.lastTile = key;
    if (MagicUI.targeting) { App.swallow = { key, until: now + 450 }; MagicUI.pickTarget(p, x, y); return; }
    if (App.tilePick) { App.swallow = { key, until: now + 450 }; const tp = App.tilePick; App.tilePick = null; tp.resolve({ plane: p, x, y }); return; }
    if (App.roadMode) {
      App.swallow = { key, until: now + 450 };
      const eng = game.units[App.roadMode.ids[0]];
      if (eng && eng.plane !== p) { UI.toast('Vos ingénieurs sont sur l\'autre plan : revenez-y (P) pour tracer la route.', 'warn', 'roadmode'); return; }
      const ids = App.roadMode.ids; App.roadMode = null; MapView.roadPreview = null;
      const r = Game.roadTo(game, ids, x, y);
      if (!r.ok) UI.toast(r.why, 'warn', 'roadmode');
      else UI.toast('Route tracée : ' + U.n(r.todo, 'case') + ' à empierrer, environ ' + U.n(r.turns, 'tour') + '.', '', 'roadmode');
      App.afterAction(); return;
    }
    const mine = Units.at(game, p, x, y).filter(u => u.owner === App.pid);
    const city = Cities.at(game, p, x, y);
    // dans une cité, les unités ne se sélectionnent qu'en cliquant sur leur figurine ; le reste de la case, c'est la cité
    const onUnits = mine.length > 0 && (!city || !e || e.clientX == null || MapView.unitHitInCity(x, y, e.clientX, e.clientY));
    // double-clic sur une pile qu'on vient de sélectionner par erreur au premier clic : l'ordre vaut pour la sélection d'avant
    if (dbl && App.prevSel && App.prevSel.key === key && now - App.prevSel.t < 400) { App.sel = App.prevSel.sel; MapView.sel = { tileKey: App.sel.plane + ':' + App.sel.x + ',' + App.sel.y, ids: App.sel.ids }; App.prevSel = null; await App.moveSelected(x, y); return; }
    App.prevSel = null;
    if (App.sel && App.sel.plane === p && !(App.sel.x === x && App.sel.y === y)) {
      if (dbl) { clearTimeout(App._cityT); if (!App.prefs.movedOnce) App.setPref('movedOnce', true); await App.moveSelected(x, y); return; }
      if (onUnits) { App.prevSel = { sel: App.sel, key, t: now }; App.selectTile(p, x, y); return; }
      // simple clic ailleurs : on vise (l'itinéraire s'affiche), sans rien ordonner
      MapView.hover = { x, y }; App.updatePathPreview(); App.renderSide();
      // sa propre cité : elle s'ouvre, sauf si un second clic arrive (double-clic = y envoyer les unités)
      if (city && city.owner === App.pid) {
        clearTimeout(App._cityT);
        App._cityT = setTimeout(() => { if (App.lastTile === key && App.lastClick === now && !UI.busy && App.game === game) CityUI.open(city.id); }, 360);
        return;
      }
      // tant que le joueur n'a jamais déplacé d'unité, le rappel revient à chaque clic ; ensuite, une fois par session
      if (!App.prefs.movedOnce || !App.hintShown) { App.hintShown = true; UI.toast('<b>Double-clic</b> sur la case pour y envoyer les unités · clic droit pour désélectionner', '', 'movehint'); }
      return;
    }
    if (dbl && city && city.owner === App.pid) { CityUI.open(city.id); return; }
    if (onUnits) { App.selectTile(p, x, y); return; }
    if (city && city.owner === App.pid) { CityUI.open(city.id); return; }
    if (city) { Panels.foreignCity(city); return; }
    App.deselect();
  },
  updatePathPreview() {
    const game = App.game;
    if (!App.sel || !MapView.hover || MapView.plane !== App.sel.plane) { MapView.path = null; return; }
    const units = App.sel.ids.map(id => game.units[id]).filter(Boolean);
    if (!units.length) { MapView.path = null; return; }
    const hv = MapView.hover;
    if (hv.x === units[0].x && hv.y === units[0].y) { MapView.path = null; MapView.roadPreview = null; return; }
    // tracé de route : l'aperçu montre la route qui sera empierrée et sa durée, pas le trajet à pied
    if (App.roadMode) { MapView.path = null; const r = Game.roadPlanFor(game, App.roadMode.ids, hv.x, hv.y); MapView.roadPreview = r.ok ? r : null; return; }
    MapView.roadPreview = null;
    MapView.path = Move.findPath(game, units, units[0].plane, hv.x, hv.y, { maxNodes: Math.max(2500, game.world.w * game.world.h) });
    App.queueForecast(units, units[0].plane, hv.x, hv.y);
  },
  // renseignements : ce que nos troupes ont vu des forces étrangères, case par case, et quand
  recordIntel(vis) {
    const game = App.game, pl = App.me(); if (!game || !pl) return;
    Intel.record(game, pl, vis);
  },
  intelAt(plane, x, y) { const pl = App.me(); return pl && pl.intel ? pl.intel[plane + ',' + x + ',' + y] || null : null; },
  // prévision de bataille : calculée un instant après que la souris s'est posée sur une cible hostile, puis mise en cache.
  // Hors de vue, elle s'appuie sur le dernier rapport de nos éclaireurs, ou avoue ne rien savoir.
  queueForecast(units, plane, x, y) {
    const game = App.game;
    clearTimeout(App._fcT);
    const w = game.world, visible = MapView.vis && MapView.vis[plane][y * w.w + x];
    // une case jamais explorée ne dit rien : ni cité, ni lieu, ni prévision
    if (!App.me().explored[plane][y * w.w + x]) { MapView.forecast = null; return; }
    const city = Cities.at(game, plane, x, y), si = World.get(w, plane, 'site', x, y), site = si >= 0 ? game.sites[si] : null;
    // un lieu : on n'en sait que ce que nos troupes y ont vu en entrant
    const here = visible ? Units.at(game, plane, x, y).filter(u => u.owner !== App.pid && !Intel.hiddenFrom(game, App.pid, u)) : [];
    if (site && !city && !here.length && Game.isLair(site) && !Game.knownCleared(App.me(), site)) {
      const kn = Game.siteKnown(App.me(), site), sel = units.map(u => u.id).join(',');
      if (!MapView.path || !MapView.path.length || (kn && !kn.guards.length)) { MapView.forecast = null; return; }
      if (!kn) { MapView.forecast = { x, y, plane, sel, unknown: true }; return; }
      const key = ['site', game.turn, site.id, kn.t, units.map(u => u.id + ':' + u.dmg + ':' + u.xp + ':' + (u.ench || []).join('/')).join(',')].join('|');
      App._fcCache = App._fcCache || {};
      if (App._fcCache[key]) { MapView.forecast = Object.assign({ x, y, plane, sel }, App._fcCache[key]); return; }
      MapView.forecast = { x, y, plane, sel, pending: true };
      App._fcT = setTimeout(() => {
        if (!MapView.hover || MapView.hover.x !== x || MapView.hover.y !== y) return;
        const f = Game.forecast(game, units.map(u => u.id), plane, x, y, 12, { defenders: App.guardUnits(kn.guards, plane, x, y) });
        if (!f) { MapView.forecast = null; return; }
        f.reportAge = game.turn - kn.t || null;
        App._fcCache[key] = f; MapView.forecast = Object.assign({ x, y, plane, sel }, f); App.renderSide && App.renderSide();
      }, 140);
      return;
    }
    const guarded = false;
    const report = visible || guarded ? null : App.intelAt(plane, x, y);
    const hostile = visible ? AI.defendersAt(game, App.pid, plane, x, y).some(u => !Intel.hiddenFrom(game, App.pid, u)) || (city && city.owner !== App.pid)
      : guarded || (report && (report.units.length || city)) || (city && city.owner !== App.pid);
    if (!hostile || !MapView.path || !MapView.path.length) { MapView.forecast = null; return; }
    // la prévision appartient à la pile qui l'a demandée (passer à la suivante ne doit pas afficher celle de la précédente)
    const sel = units.map(u => u.id).join(',');
    // une attaque que le moteur refusera (Forteresse volante, garde magique) : la raison, pas des chances
    const refused = city && Game.attackRefusal(game, units, city);
    if (refused) { MapView.forecast = { x, y, plane, sel, refused }; return; }
    if (!visible && !guarded && !report) { MapView.forecast = { x, y, plane, sel, unknown: true }; return; }
    const dsig = visible ? AI.defendersAt(game, App.pid, plane, x, y).map(u => u.id + ':' + u.dmg + ':' + (u.ench || []).join('/')).join(',') : '';
    const key = [game.turn, plane, x, y, report ? 'r' + report.t : 'v', units.map(u => u.id + ':' + u.dmg + ':' + u.xp + ':' + (u.ench || []).join('/')).join(','), dsig, city ? city.ench.map(e => e.spell).join('/') + ':' + !!city.buildings.cityWalls : ''].join('|');
    App._fcCache = App._fcCache || {};
    if (App._fcCache[key]) { MapView.forecast = Object.assign({ x, y, plane, sel }, App._fcCache[key]); return; }
    MapView.forecast = { x, y, plane, sel, pending: true };
    App._fcT = setTimeout(() => {
      if (!MapView.hover || MapView.hover.x !== x || MapView.hover.y !== y) return;
      let f;
      if (report && !report.units.length && !(city && Battle.spire(game, city))) f = { win: 1, lossAvg: 0, n: 0, empty: true, losses: {} };
      else f = Game.forecast(game, units.map(u => u.id), plane, x, y, 12, report ? { defenders: report.units } : {});
      if (!f) { MapView.forecast = null; return; }
      if (report) f.reportAge = game.turn - report.t;
      App._fcCache[key] = f;
      MapView.forecast = Object.assign({ x, y, plane, sel }, f);
      App.renderSide && App.renderSide();
    }, 140);
  },
  // C : recentre la carte sur la pile sélectionnée (sinon sur la forteresse)
  centerSelection() {
    const game = App.game, sel = App.sel ? App.sel.ids.map(id => game.units[id]).filter(Boolean) : [];
    const t = sel[0] || game.cities[App.me().fortress] || Cities.ofPlayer(game, App.pid)[0];
    if (!t) return;
    if (t.plane !== MapView.plane) App.togglePlane();
    MapView.centerOn(t.x, t.y); MapView.bumpVis(); App.refresh();
  },
  onKey(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    if (!App.game) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // raccourcis du navigateur (Ctrl+R, Ctrl+S…) : pas d'ordre au passage
    App.keys[e.key] = true;
    if (App.moving) return;   // une pile en marche : on attend qu'elle arrive
    if (e.key === 'Escape' && App.tilePick) { const tp = App.tilePick; App.tilePick = null; tp.resolve(null); return; }
    if (e.key === 'Escape') { if (App.roadMode) { App.roadMode = null; MapView.roadPreview = null; UI.toast('Tracé de route annulé.', '', 'roadmode'); App.refresh(); return; } if (MagicUI.targeting) { MagicUI.cancelTarget(); return; } if (UI.closeTop()) return; App.sel = null; MapView.sel = null; MapView.path = null; App.refresh(); return; }
    if (UI.modals.length || UI.busy || CombatView.active) return;
    const k = e.key.toLowerCase();
    const game = App.game;
    const sel = App.sel ? App.sel.ids.map(id => game.units[id]).filter(Boolean) : [];
    if (e.key === 'Enter') { App.endTurn(); e.preventDefault(); }
    else if (k === ' ' || k === 'n') { App.selectNext(false, null, true); e.preventDefault(); }
    else if (k === 'w' && sel.length) App.selectNext(false, sel.map(u => u.id));
    else if (k === 'f' && sel.length) App.passTurn(sel);
    else if (k === 'x' && sel.length) App.explore(sel);
    else if (k === 'u' && App.undo) App.undoMove();
    else if (k === 'v') App.toggleLairs();
    else if (k === 'o') App.toggleNodes();
    else if (k === 't') { App.showThreats = App.showThreats === false; UI.toast(App.showThreats ? 'Menaces affichées sur la carte.' : 'Menaces masquées (T pour les réafficher).', '', 'threats'); }
    else if (k === 's' && sel.length) { for (const u of sel) { u.status = 'sentry'; u.path = null; } App.selectNext(); }
    else if (k === 'h' && sel.length) { const c = Cities.at(game, sel[0].plane, sel[0].x, sel[0].y); if (c && c.owner === App.pid) App.healInCity(sel); }
    else if (k === 'b') { const st = sel.find(u => Units.isSettler(u)); if (st) App.found(st); }
    else if (k === 'r' && e.shiftKey && sel.some(u => Units.isEngineer(u))) App.startRoadTo(sel);
    else if (k === 'r' && sel.some(u => Units.isEngineer(u))) { const r = Game.buildRoad(game, sel.map(u => u.id)); if (!r.ok) UI.toast(r.why, 'warn'); else App.afterAction(); }
    else if (k === 'r') MagicUI.research();
    else if (k === 'g') MagicUI.spellbook();
    else if (k === 'm') MagicUI.magic();
    else if (k === 'c' && e.shiftKey) Panels.cities();
    else if (k === 'c') App.centerSelection();
    else if (k === 'a') Panels.armies();
    else if (k === 'd') Panels.wizards();
    else if (k === 'j') Panels.chronicle(game);
    else if (k === 'l') $('#logbox').classList.toggle('hidden');
    else if (k === 'p') { if (sel.length) { const r = Game.planeShift(game, sel.map(u => u.id)); const u0 = sel[0], si = World.get(game.world, u0.plane, 'site', u0.x, u0.y), cty = Cities.at(game, u0.plane, u0.x, u0.y);
        // sur une tour, une faille ou une Porte tellurique, un passage refusé se dit (au lieu de simplement tourner la vue)
        if (!r.ok && r.why && ((si >= 0 && ['tower', 'rift'].includes(game.sites[si].type)) || (cty && Cities.hasEnch(cty, 'astral_gate')))) { UI.toast(U.esc(r.why), 'warn'); return; } if (r.ok) { MapView.plane = sel[0].plane; MapView.centerOn(sel[0].x, sel[0].y); MapView.bumpVis(); App.selectTile(sel[0].plane, sel[0].x, sel[0].y, sel.map(u => u.id)); App.refresh(); return; } } App.togglePlane(); }
    else if (k === '+' || k === '=') { MapView.ts = Math.min(128, Math.round(MapView.ts * 1.15)); }
    else if (k === '-') { MapView.ts = Math.max(24, Math.round(MapView.ts / 1.15)); }
    else if (k === 'f5') { /* laisser le navigateur */ }
  },
};

window.addEventListener('DOMContentLoaded', () => App.boot());
