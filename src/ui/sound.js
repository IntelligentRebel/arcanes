'use strict';
// Sons synthétisés à la volée (WebAudio) : aucun fichier audio, aucun téléchargement.
// Effets courts + musique d'ambiance générative optionnelle.

const Sfx = {
  ctx: null, quietUntil: 0, master: null, sfxBus: null, musicBus: null, verb: null, noiseBuf: null,
  on: true, music: false, mvol: .7, last: {},

  init() {
    // avec la bande originale, la musique est active par défaut ; sinon (nappes génératives) elle reste en option
    Sfx.music = Music.hasTracks();
    try {
      const st = JSON.parse(localStorage.getItem('arcanes:sound') || '{}');
      if (st.on === false) Sfx.on = false;
      if (Music.hasTracks()) { if (st.music2 === false) Sfx.music = false; } else if (st.music === true) Sfx.music = true;
      if (typeof st.mvol === 'number') Sfx.mvol = Math.max(0, Math.min(1, st.mvol));
    } catch (e) { /* stockage indisponible */ }
    // l'audio ne peut démarrer qu'après un geste de l'utilisateur
    const unlock = () => { Sfx.ensure(); if (Sfx.music) Music.start(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button, .btn, .tbtn'); if (b && !b.disabled) Sfx.play('click'); }, true);
  },
  save() { try { localStorage.setItem('arcanes:sound', JSON.stringify({ on: Sfx.on, music: Sfx.music, music2: Sfx.music, mvol: Sfx.mvol })); } catch (e) { /* rien */ } },
  ensure() {
    if (Sfx.ctx) { if (Sfx.ctx.state === 'suspended' && Sfx.ctx.resume && !(window.OfflineAudioContext && Sfx.ctx instanceof OfflineAudioContext)) Sfx.ctx.resume().catch(() => { }); return Sfx.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { Sfx.ctx = new AC(); } catch (e) { return null; }
    return Sfx.setup(Sfx.ctx);
  },
  setup(ctx) {
    Sfx.ctx = ctx;
    Sfx.master = ctx.createGain(); Sfx.master.gain.value = Sfx.on ? .55 : 0; Sfx.master.connect(ctx.destination);
    Sfx.sfxBus = ctx.createGain(); Sfx.sfxBus.gain.value = 1; Sfx.sfxBus.connect(Sfx.master);
    Sfx.musicBus = ctx.createGain(); Sfx.musicBus.gain.value = .0; Sfx.musicBus.connect(Sfx.master);
    // réverbération synthétique (bruit à décroissance exponentielle)
    const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    Sfx.verb = ctx.createConvolver(); Sfx.verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = .32; Sfx.verb.connect(wet); wet.connect(Sfx.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    Sfx.noiseBuf = nb;
    return ctx;
  },
  setOn(v) { Sfx.on = v; Sfx.save(); Sfx.ensure(); if (Sfx.master) Sfx.master.gain.value = v ? .55 : 0; Music.setVolume(); if (v) Sfx.play('notify'); },
  setMusicVolume(v) { Sfx.mvol = Math.max(0, Math.min(1, v)); Sfx.save(); Music.setVolume(); },
  setMusic(v) { Sfx.music = v; Sfx.save(); if (v) { Sfx.ensure(); Music.start(); } else Music.stop(); },

  // ---------- briques ----------
  env(g, t, a, peak, d, end = .0001) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); },
  tone(type, f0, f1, t, dur, vol, opt = {}) {
    const ctx = Sfx.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (opt.detune) o.detune.value = opt.detune;
    Sfx.env(g, t, opt.a || .005, vol, dur);
    let node = o;
    if (opt.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opt.lp; o.connect(f); node = f; }
    node.connect(g); g.connect(opt.bus || Sfx.sfxBus); if (opt.verb) g.connect(Sfx.verb);
    o.start(t); o.stop(t + (opt.a || .005) + dur + .05);
  },
  noise(t, dur, vol, type, f0, f1, opt = {}) {
    const ctx = Sfx.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = Sfx.noiseBuf; s.loop = true;
    f.type = type || 'lowpass'; f.frequency.setValueAtTime(f0 || 1000, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = opt.q || 1;
    Sfx.env(g, t, opt.a || .004, vol, dur);
    s.connect(f); f.connect(g); g.connect(Sfx.sfxBus); if (opt.verb) g.connect(Sfx.verb);
    s.start(t, Math.random() * .5); s.stop(t + (opt.a || .004) + dur + .05);
  },
  note(n) { return 440 * Math.pow(2, (n - 69) / 12); },

  // ---------- catalogue ----------
  play(name, opt = {}) {
    if (!Sfx.on) return;
    const ctx = Sfx.ensure(); if (!ctx || (ctx.state !== 'running' && !(window.OfflineAudioContext && ctx instanceof OfflineAudioContext))) return;
    const now = ctx.currentTime;
    const gap = { click: .04, step: .09, notify: .25, clash: .05, arrow: .05 }[name] || .03;
    if (Sfx.last[name] && now - Sfx.last[name] < gap) return;
    Sfx.last[name] = now;
    const t = now + .01, r = (a, b) => a + Math.random() * (b - a), N = Sfx.note;
    switch (name) {
      case 'click': Sfx.tone('sine', 1250, 900, t, .035, .05); break;
      case 'step': Sfx.noise(t, .06, .45, 'lowpass', 800, 300); Sfx.noise(t + .11, .06, .32, 'lowpass', 700, 260); break;
      case 'clash':
        Sfx.noise(t, .07, .22, 'highpass', 2500, 1500);
        for (const f of [r(1500, 1900), r(2400, 2900), r(3500, 4200)]) Sfx.tone('triangle', f, f * .98, t, r(.18, .3), .06, { verb: true });
        Sfx.noise(t + .02, .12, .2, 'bandpass', 500, 220, { q: 2 });
        break;
      case 'arrow': Sfx.noise(t, .2, .45, 'bandpass', 3200, 700, { q: 4 }); Sfx.noise(t + .2, .05, .3, 'lowpass', 900); break;
      case 'boulder': Sfx.noise(t, .35, .35, 'lowpass', 400, 80); Sfx.tone('sine', 90, 40, t, .3, .2); break;
      case 'zap': {
        const f = opt.realm === 'death' ? 220 : opt.realm === 'life' ? 880 : opt.realm === 'nature' ? 440 : opt.realm === 'sorcery' ? 660 : 520;
        Sfx.tone('sawtooth', f * 2.2, f * .6, t, .25, .07, { lp: 2400, verb: true }); Sfx.tone('sine', f * 1.5, f * .5, t, .3, .08, { verb: true });
        break;
      }
      case 'fire': Sfx.noise(t, .5, .35, 'lowpass', 300, 1800, { a: .08 }); Sfx.noise(t + .25, .6, .25, 'lowpass', 1600, 200, { verb: true }); break;
      case 'lightning': Sfx.noise(t, .04, .3, 'highpass', 3000); Sfx.noise(t + .03, .9, .35, 'lowpass', 1200, 60, { verb: true }); break;
      case 'spell': {
        const base = { life: 72, death: 57, chaos: 62, nature: 67, sorcery: 74, arcane: 69 }[opt.realm] || 69;
        const minor = opt.realm === 'death' || opt.realm === 'chaos';
        const steps = minor ? [0, 3, 7, 10, 15] : [0, 4, 7, 11, 16];
        steps.forEach((s, i) => Sfx.tone(i % 2 ? 'triangle' : 'sine', N(base + s), N(base + s), t + i * .065, .45, .07, { verb: true, a: .01 }));
        Sfx.noise(t, .5, .05, 'highpass', 6000, 9000, { a: .1, verb: true });
        break;
      }
      case 'summon': Sfx.tone('sawtooth', 110, 220, t, .7, .08, { lp: 700, a: .2, verb: true }); Sfx.tone('sine', N(76), N(88), t + .3, .6, .05, { verb: true }); break;
      case 'death': Sfx.tone('sine', 170, 45, t, .45, .22); Sfx.noise(t, .25, .15, 'lowpass', 500, 120); break;
      case 'heal': [79, 83, 86, 91].forEach((n, i) => Sfx.tone('sine', N(n), N(n), t + i * .08, .5, .05, { verb: true })); break;
      case 'legend': {
        // fanfare : quatre accords qui montent, le dernier tenu, sur un bourdon grave et un voile scintillant
        [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]].forEach((ch, i) => ch.forEach(n => Sfx.tone(i === 3 ? 'triangle' : 'sawtooth', N(n), N(n), t + i * .34, i === 3 ? 2.4 : .36, i === 3 ? .07 : .035, { lp: 2600, verb: true, a: .02 })));
        Sfx.tone('sine', N(36), N(36), t, 3.2, .1, { verb: true });
        Sfx.noise(t + 1.02, 1.8, .05, 'highpass', 5000, 9000, { a: .35, verb: true });
        break;
      }
      case 'victory': [60, 64, 67, 72, 76, 79].forEach((n, i) => Sfx.tone('triangle', N(n), N(n), t + i * .11, i === 5 ? 1.2 : .35, .09, { verb: true })); Sfx.tone('sine', N(48), N(48), t, 1.6, .08); break;
      case 'defeat': [69, 65, 62, 57].forEach((n, i) => Sfx.tone('triangle', N(n), N(n), t + i * .22, i === 3 ? 1.4 : .4, .08, { verb: true, lp: 1800 })); break;
      case 'turn': Sfx.tone('sine', 523, 523, t, 1.6, .08, { verb: true }); Sfx.tone('sine', 1046, 1046, t, 1.1, .03, { verb: true }); Sfx.tone('sine', 1568, 1568, t, .6, .012, { verb: true }); break;
      case 'build': Sfx.tone('triangle', N(72), N(72), t, .25, .06, { verb: true }); Sfx.tone('triangle', N(79), N(79), t + .12, .45, .06, { verb: true }); break;
      case 'research': [74, 78, 81, 86, 90].forEach((n, i) => Sfx.tone('sine', N(n), N(n), t + i * .06, .5, .045, { verb: true })); break;
      case 'notify': Sfx.tone('sine', 660, 880, t, .12, .05, { verb: true }); break;
      case 'bad': Sfx.tone('triangle', 330, 250, t, .3, .07, { lp: 1200 }); Sfx.tone('triangle', 262, 196, t + .14, .4, .06, { lp: 1200 }); break;
      case 'gold': [88, 93, 96].forEach((n, i) => Sfx.tone('square', N(n), N(n), t + i * .05, .14, .05, { lp: 4000, verb: true })); break;
    }
  },
  // son associé à une entrée du journal
  forLog(e, deferred) {
    const t = e.text || '';
    if (Sfx.quietUntil && performance.now() < Sfx.quietUntil) return; // le combat a déjà sonné
    if (deferred) { const n = Sfx.classify(e); if (n) Sfx.queue.add(n); return; }
    const n = Sfx.classify(e); if (n) Sfx.play(n, { realm: Sfx.realmOf(e) });
  },
  queue: new Set(),
  // fin du tour : cloche, puis l'événement le plus marquant de l'intertour
  afterTurn() {
    Sfx.play('turn');
    const best = ['bad', 'research', 'victory', 'build', 'gold', 'summon'].find(n => Sfx.queue.has(n));
    Sfx.queue.clear();
    if (best) setTimeout(() => Sfx.play(best), 650);
  },
  realmOf(e) { return e.ref && e.ref.spell && DATA.spells[e.ref.spell] ? DATA.spells[e.ref.spell].realm : null; },
  classify(e) {
    const t = e.fr || e.text || '';   // le ton se lit sur le texte français (e.fr quand le jeu est dans une autre langue)
    if (/^Recherche achevée/.test(t)) return 'research';
    if (/a construit/.test(t)) return 'build';
    if (/^Victoire|conquise|libéré|Nous avons repoussé|refermé la Brèche/.test(t)) return 'victory';
    if (/^Défaite|marchent sur|tombée|rasée par|banni|Famine|désertion|Mana épuisé|peste|Trésor à sec|rompu|déclare la guerre|Brèche s'est ouverte|vague de la Brèche marche sur vos|se déchire|astrologues|refusez de payer|franchissent la faille/.test(t)) return 'bad';
    if (/pillé|filon|marchand|Butin|Trouvaille/.test(t)) return 'gold';
    if (/est lancé|lancé /.test(t)) return 'spell';
    if (/Invocation réussie|recruté|Pacte scellé/.test(t)) return 'summon';
    return e.ref && e.ref.minor ? null : 'notify';
  },
};


// ---------- bande originale ----------
// Morceaux orchestraux pré-rendus (assets/music/*.ogg, décrits par MUSIC_JSON) : un contexte par situation
// (titre, Arcanus, Myrror, combat), enchaînements en fondu, jingles de victoire et de défaite.
// Lecture par des éléments <audio> : fonctionne aussi quand le jeu est ouvert depuis le disque (file://).
const Music = {
  meta: window.MUSIC_JSON || {}, base: 'assets/music/',
  playing: false, ctx: null, cur: null, jing: null, timer: null, poll: null, rot: {},
  // tous les morceaux encore vivants (en cours, en fondu de sortie, en attente de lecture) : un seul est audible
  live: new Set(),
  hasTracks() { return Object.keys(Music.meta).length > 0; },
  // morceaux d'un contexte ; sur la carte, le thème du peuple du joueur s'ajoute à ceux de son plan d'origine
  tracks(ctx) {
    let list = Object.keys(Music.meta).filter(f => Music.meta[f].ctx === ctx);
    if ((ctx === 'arcanus' || ctx === 'myrror') && typeof App !== 'undefined' && App.game && App.me) {
      const me = App.me(), r = me && DATA.races[me.race];
      if (r && r.plane === ctx) list = list.concat(Music.tracks('race:' + me.race));
    }
    return list;
  },
  // morceaux mis de côté (carte pendant la visite d'une cité, thème d'un peuple entre deux cités) : ils reprennent où ils en étaient
  held: {}, HOLD_MS: 180000,
  holdable(ctx) { return ctx === 'arcanus' || ctx === 'myrror' || (ctx && ctx.startsWith('race:')); },
  _city: null, _cityT: 0,
  level() { return Sfx.on ? Sfx.mvol * .8 : 0; },
  start() {
    if (!Music.hasTracks()) return GenMusic.start();
    if (Music.playing) return;
    Music.playing = true;
    clearInterval(Music.poll); Music.poll = setInterval(Music.update, 600);
    Music.update();
  },
  stop() {
    if (!Music.hasTracks()) return GenMusic.stop();
    Music.playing = false; clearInterval(Music.poll); clearTimeout(Music.timer);
    Music.retireAll(1000, true);
    Music.ctx = null;
  },
  // situation de jeu -> contexte musical
  context() {
    // (les modules sont des const globales : pas des propriétés de window)
    if (typeof CombatView !== 'undefined' && CombatView.active) return CombatView.finished ? 'post' : 'combat';
    if (typeof App === 'undefined' || !App.game || document.querySelector('.title-screen')) return 'title';
    // une cité ouverte plus d'un instant : le thème de son peuple
    const cid = typeof CityUI !== 'undefined' ? CityUI.cur : null;
    if (cid != null) {
      if (Music._city !== cid) { Music._city = cid; Music._cityT = performance.now(); }
      const c = App.game.cities[cid];
      if (c && performance.now() - Music._cityT > 1200 && Music.tracks('race:' + c.race).length) return 'race:' + c.race;
    } else Music._city = null;
    return typeof MapView !== 'undefined' && MapView.plane === 1 ? 'myrror' : 'arcanus';
  },
  update() {
    // filet de sécurité : tout morceau qui n'est ni le morceau courant ni le jingle s'éteint
    for (const m of Music.live) if (m !== Music.cur && m !== Music.jing && !m.out && !m.held) Music.retire(m, 400);
    for (const k in Music.held) if (performance.now() - Music.held[k].heldAt > Music.HOLD_MS) Music.retire(Music.held[k], 300);
    if (!Music.playing || Music.jing) return;
    const c = Music.context();
    if (c === Music.ctx) return;
    const prev = Music.ctx;
    Music.ctx = c;
    // entre la carte et les cités, le morceau en cours est mis de côté plutôt qu'arrêté
    if (Music.holdable(prev) && Music.holdable(c)) {
      // le même morceau convient aux deux (le thème du joueur dans l'une de ses cités) : il continue
      if (Music.cur && !Music.cur.out && (Music.cur.ctx === c || Music.tracks(c).includes(Music.cur.f))) return;
      if (Music.cur && !Music.cur.out) Music.hold(Music.cur);
      const h = Music.held[c];
      if (h && Music.resume(h)) return;
      Music.next(c.startsWith('race:') ? 1500 : 2000);
      return;
    }
    for (const k in Music.held) Music.retire(Music.held[k], 400);
    Music.next(c === 'combat' ? 900 : 2500);
  },
  hold(m) {
    if (Music.cur === m) Music.cur = null;
    const old = Music.held[m.ctx]; if (old && old !== m) Music.retire(old, 300);
    m.held = true; m.heldAt = performance.now(); Music.held[m.ctx] = m;
    Music.fade(m, 0, 1200, false, () => { try { m.el.pause(); } catch (e) { /* rien */ } });
  },
  resume(m) {
    delete Music.held[m.ctx];
    if (m.out || !Music.live.has(m)) return false;
    clearTimeout(Music.timer);
    Music.retireAll(1200);
    m.held = false; Music.cur = m;
    const p = m.el.play();
    const go = () => { if (!m.out) Music.fade(m, 1, 1500); };
    if (p && p.then) p.then(go).catch(() => { if (Music.cur === m) Music.cur = null; Music.kill(m); Music.next(0); });
    else go();
    return true;
  },
  // rotation dans le contexte, sans répéter le même morceau deux fois de suite
  pick(ctx) {
    const list = Music.tracks(ctx); if (!list.length) return null;
    const i = Music.rot[ctx] == null ? Math.floor(Math.random() * list.length) : (Music.rot[ctx] + 1) % list.length;
    Music.rot[ctx] = i; return list[i];
  },
  // crée un morceau ; il ne devient audible qu'une fois la lecture réellement lancée, et seulement s'il n'a pas été congédié entre-temps
  spawn(f, g) {
    const el = new Audio(Music.base + f + '.ogg'); el.preload = 'auto';
    const me = { el, f, ctx: Music.ctx, g, out: false };
    try { el.volume = Math.max(0, Math.min(1, g * Music.level())); } catch (e) { /* rien */ }
    Music.live.add(me);
    return me;
  },
  retire(m, ms) {
    if (!m || m.out) return;
    if (m.held) { m.held = false; if (Music.held[m.ctx] === m) delete Music.held[m.ctx]; }
    m.out = true;
    if (Music.cur === m) Music.cur = null;
    if (Music.jing === m) Music.jing = null;
    Music.fade(m, 0, ms, true);
  },
  // un morceau déjà en sortie est pressé : au plus deux morceaux s'entendent, l'un qui part et l'autre qui arrive
  retireAll(ms, all) { for (const m of Music.live) if (m.out) Music.fade(m, 0, 250, true); else if (all || !m.held) Music.retire(m, ms); },
  kill(m) {
    clearInterval(m.fi); m.out = true;
    try { m.el.pause(); m.el.removeAttribute('src'); m.el.load(); } catch (e) { /* rien */ }
    Music.live.delete(m);
  },
  next(xfade) {
    clearTimeout(Music.timer);
    Music.retireAll(xfade || 600);
    const f = Music.pick(Music.ctx);
    if (!f) return;
    const me = Music.spawn(f, 0);
    Music.cur = me;
    me.el.addEventListener('ended', () => {
      const was = Music.cur === me;
      Music.kill(me);
      if (!was) return;
      Music.cur = null;
      // combat : enchaîne aussitôt ; exploration : un temps de silence, comme dans les jeux d'époque
      const gap = me.ctx === 'combat' ? 0 : me.ctx === 'title' ? 2500 : 4000 + Math.random() * 7000;
      Music.timer = setTimeout(() => { if (Music.playing && !Music.jing && !Music.cur && (Music.ctx === me.ctx || Music.holdable(Music.ctx))) Music.next(0); }, gap);
    });
    const go = () => { if (me.out) Music.kill(me); else Music.fade(me, 1, Math.max(300, xfade || 0)); };
    const p = me.el.play();
    if (p && p.then) p.then(go).catch(() => { const was = Music.cur === me; Music.kill(me); if (was) { Music.cur = null; Music.ctx = null; } });
    else go();
  },
  fade(m, to, ms, kill, done) {
    clearInterval(m.fi);
    if (m.out && !kill) return;   // un morceau congédié ne remonte jamais
    const from = m.g, t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
      m.g = from + (to - from) * k;
      try { m.el.volume = Math.max(0, Math.min(1, m.g * Music.level())); } catch (e) { /* élément détruit */ }
      if (k >= 1) { clearInterval(m.fi); if (kill) Music.kill(m); else if (done) done(); }
    };
    m.fi = setInterval(step, 50); step();
  },
  setVolume() {
    if (!Music.hasTracks()) { if (Sfx.musicBus && Sfx.ctx) Sfx.musicBus.gain.value = GenMusic.playing ? .32 * (Sfx.mvol / .7) * (Sfx.on ? 1 : 0) : 0; return; }
    for (const m of Music.live) try { m.el.volume = Math.max(0, Math.min(1, m.g * Music.level())); } catch (e) { /* rien */ }
  },
  // jingle de fin de combat ; renvoie false s'il n'a pas pu être joué (le bruitage synthétique prend le relais)
  jingle(kind) {
    if (!Music.playing || !Music.hasTracks()) return false;
    const f = Music.tracks(kind)[0]; if (!f) return false;
    clearTimeout(Music.timer);
    Music.retireAll(450);
    const me = Music.spawn(f, 1);
    Music.jing = me;
    const done = () => { const was = Music.jing === me; Music.kill(me); if (!was) return; Music.jing = null; Music.ctx = null; Music.update(); };
    me.el.addEventListener('ended', done);
    const p = me.el.play();
    if (p && p.then) p.then(() => { if (me.out) Music.kill(me); }).catch(done);
    return true;
  },
  nowPlaying() { const m = Music.jing || Music.cur; return m && Music.meta[m.f] ? Music.meta[m.f].title : null; },
};

// ---------- musique générative de secours (sans les fichiers de la bande originale) ----------
// Nappes lentes sur une progression modale, notes pincées éparses. Volume bas.
const GenMusic = {
  timer: null, step: 0, playing: false,
  prog: [[50, 57, 62, 65], [46, 53, 58, 62], [41, 48, 57, 60], [48, 55, 60, 64], [50, 57, 62, 65], [43, 50, 58, 62], [45, 52, 57, 61], [50, 57, 62, 69]],
  scale: [62, 64, 65, 67, 69, 70, 72, 74, 76, 77],
  start() {
    const ctx = Sfx.ensure(); if (!ctx || GenMusic.playing) return;
    GenMusic.playing = true;
    Sfx.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    Sfx.musicBus.gain.setValueAtTime(Math.max(.0001, Sfx.musicBus.gain.value), ctx.currentTime);
    Sfx.musicBus.gain.linearRampToValueAtTime(.32, ctx.currentTime + 3);
    GenMusic.tick();
  },
  stop() {
    GenMusic.playing = false; clearTimeout(GenMusic.timer);
    if (Sfx.ctx) { const t = Sfx.ctx.currentTime; Sfx.musicBus.gain.cancelScheduledValues(t); Sfx.musicBus.gain.setValueAtTime(Sfx.musicBus.gain.value, t); Sfx.musicBus.gain.linearRampToValueAtTime(0, t + 1.5); }
  },
  pad(notes, t, dur) {
    const ctx = Sfx.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1100, t + dur * .5); f.frequency.linearRampToValueAtTime(450, t + dur); f.Q.value = .7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + dur * .35); g.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(g); g.connect(Sfx.musicBus); g.connect(Sfx.verb);
    for (const n of notes) for (const det of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = Sfx.note(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + .1);
    }
  },
  pluck(n, t) {
    const ctx = Sfx.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = Sfx.note(n);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.035, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 1.8);
    o.connect(g); g.connect(Sfx.musicBus); g.connect(Sfx.verb); o.start(t); o.stop(t + 2);
  },
  tick() {
    if (!GenMusic.playing || !Sfx.ctx) return;
    const ctx = Sfx.ctx, t = ctx.currentTime + .05, dur = 8;
    const chord = GenMusic.prog[GenMusic.step % GenMusic.prog.length]; GenMusic.step++;
    GenMusic.pad(chord, t, dur + 1.5);
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const pool = GenMusic.scale.filter(x => chord.some(c => (x - c) % 12 === 0) || Math.random() < .3);
      GenMusic.pluck(pool[Math.floor(Math.random() * pool.length)], t + 1 + Math.random() * (dur - 2));
    }
    GenMusic.timer = setTimeout(GenMusic.tick, dur * 1000);
  },
};
