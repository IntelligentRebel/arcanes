'use strict';
// Sprites de l'atlas CC0, tuiles de terrain procédurales et icônes vectorielles.

const Sprites = {
  img: null, map: null, hd: null, hdMap: null, title: null, cache: {}, ready: false,
  loadImg(src) {
    return new Promise(res => { if (!src) return res(null); const img = new Image(); img.onload = () => res(img); img.onerror = () => { console.warn('Image introuvable : ' + String(src).slice(0, 60)); res(null); }; img.src = src; });
  },
  // (0.31.38) les grandes planches (plus de 120 Mo en tout) : téléchargées en flux, pour dire où l'on en est, et réessayées
  // jusqu'à trois fois ; si l'une manque encore, le jeu ne démarre pas (0.31.39 : plus de graphismes de secours). Hors http (la copie locale), l'image se charge directement.
  prog: { got: 0, total: 0, cb: null },
  async fetchImg(src) {
    if (!src) return null;
    const P = Sprites.prog, size = (window.ASSET_SIZES || {})[src] || 0; P.total += size;
    let mine = 0; const bump = n => { mine += n; P.got += n; if (P.cb) P.cb(); };
    const plain = url => new Promise(res => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = url; });
    const stream = /^https?:/.test(location.protocol) && window.fetch && window.ReadableStream && !/^data:/.test(src);
    for (let attempt = 0; attempt < 3; attempt++) {
      let img = null;
      if (stream) {
        try {
          const r = await fetch(src, attempt ? { cache: 'reload' } : undefined); if (!r.ok) throw new Error('HTTP ' + r.status);
          const reader = r.body.getReader(), chunks = [];
          for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); bump(value.length); }
          const url = URL.createObjectURL(new Blob(chunks, { type: r.headers.get('content-type') || '' }));
          img = await plain(url); URL.revokeObjectURL(url);
        } catch (e) { img = null; }
      } else img = await plain(src);
      if (img) { if (size > mine) bump(size - mine); return img; }
      bump(-mine);
      if (attempt < 2) await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
    console.warn('Image introuvable : ' + String(src).slice(0, 60)); bump(size);
    return null;
  },
  // l'écran d'attente : ce qui se télécharge, et où l'on en est
  bootScreen() {
    if (typeof document === 'undefined') return { remove() {} };
    const bar = h('i'), txt = h('div', { class: 'boot-txt' }, 'Chargement des graphismes…');
    const el = h('div', { id: 'boot' }, h('div', { class: 'boot-box' }, h('div', { class: 'boot-title' }, 'Arcanes'), h('div', { class: 'boot-bar' }, bar), txt));
    document.body.append(el);
    const mo = n => String(Math.round(n / 1048576));
    Sprites.prog.cb = () => { const P = Sprites.prog; if (!P.total) return; bar.style.width = Math.min(100, 100 * P.got / P.total) + '%'; if (P.got > 0 && P.got < P.total) txt.textContent = 'Chargement des graphismes : ' + mo(P.got) + ' / ' + mo(P.total) + ' Mo'; };
    return el;
  },
  // les animations des figurines (90 Mo) : après l'écran titre, sans faire attendre ; d'ici là, les figurines restent immobiles
  async loadAnim() {
    const pages = String(window.ANIM_PNG || '').split(',').filter(Boolean); if (!pages.length) return;
    const el = typeof document !== 'undefined' ? h('div', { id: 'bgload' }) : null; if (el) document.body.append(el);
    Sprites.prog = { got: 0, total: 0, cb: null };
    for (const p of pages) Sprites.prog.total += (window.ASSET_SIZES || {})[p] || 0;
    const total = Sprites.prog.total; Sprites.prog.total = 0;
    Sprites.prog.cb = () => { if (el && total && Sprites.prog.got < total) el.textContent = 'Animations : ' + Math.round(100 * Sprites.prog.got / total) + ' %'; };
    const imgs = [];
    for (const p of pages) { const im = await Sprites.fetchImg(p); if (!im) break; imgs.push(im); }
    if (el) el.remove();
    if (imgs.length !== pages.length) return;
    Anim.img = imgs; Anim.meta = window.ANIM_JSON || {};
    if (typeof App !== 'undefined') App.dirty = true;
    if (typeof MapView !== 'undefined' && MapView.invalidate && MapView.cv) MapView.invalidate();
  },
  // planches introuvables après trois essais : pas de jeu sans elles (plus de graphismes de secours) ; on le dit, et on réessaie
  bootRetry(boot) {
    return new Promise(res => {
      const txt = boot.querySelector ? boot.querySelector('.boot-txt') : null; if (!txt) return res();
      txt.textContent = 'Le téléchargement des graphismes a échoué.';
      const b = h('button', { class: 'btn primary', style: 'margin-top:14px', onclick: () => { b.remove(); txt.textContent = 'Chargement des graphismes…'; res(); } }, 'Réessayer');
      txt.parentNode.append(b);
    });
  },
  failed: [],
  async load() {
    Sprites.map = window.ATLAS_JSON || {};
    Sprites.hdMap = window.HD_JSON || {};
    const boot = Sprites.bootScreen();
    let img, hd, title, hd2, wpn, fx;
    for (;;) {
      [img, hd, title, hd2, wpn, fx] = await Promise.all([img || Sprites.fetchImg(window.ATLAS_PNG), hd || Sprites.fetchImg(window.HD_PNG), title || Sprites.fetchImg(window.TITLE_IMG), hd2 || Sprites.fetchImg(window.HD2_PNG), wpn || Sprites.fetchImg(window.WEAPONS_PNG), fx || Sprites.fetchImg(window.FX_PNG)]);
      Sprites.failed = [!img && window.ATLAS_PNG ? 'atlas' : null, !hd && window.HD_PNG ? 'hd' : null, !hd2 && window.HD2_PNG ? 'hd2' : null].filter(Boolean);
      if (!Sprites.failed.length || !boot.querySelector) break;
      Sprites.prog.got = 0; Sprites.prog.total = 0;
      await Sprites.bootRetry(boot);
    }
    const anim = null;
    Weapons.img = wpn; Weapons.meta = wpn ? Object.assign({ s: {}, a: {} }, window.WEAPONS_JSON || {}) : { s: {}, a: {} };
    Fx.img = fx; Fx.meta = fx ? (window.FX_JSON || {}) : {};
    Sprites.img = img; Sprites.hd = hd; Sprites.title = title;
    Anim.img = anim; Anim.meta = anim ? (window.ANIM_JSON || {}) : {};
    if (!hd) Sprites.hdMap = {};
    Sprites.virt = {};
    // atlas complémentaire : chaque sprite devient une image à part, rangée comme les sprites composés
    if (hd && hd2) for (const [k, r] of Object.entries(window.HD2_JSON || {})) {
      const c = document.createElement('canvas'); c.width = r[2]; c.height = r[3];
      c.getContext('2d').drawImage(hd2, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
      Sprites.virt[k] = c; Sprites.hdMap[k] = [0, 0, r[2], r[3], 1];
    }
    // figurines d'appoint (provisoires) intégrées au fichier
    if (hd) for (const [k, src] of Object.entries(window.EXTRA_SPRITES || {})) {
      if (Sprites.hdMap[k]) continue;
      const im = await Sprites.loadImg(src); if (!im) continue;
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      c.getContext('2d').drawImage(im, 0, 0);
      Sprites.virt[k] = c; Sprites.hdMap[k] = [0, 0, im.width, im.height, 1];
    }
    // éclaireurs sans figurine dédiée : cavalier (ou lancier) de la race, en attendant le lot 3
    if (window.DATA) for (const id in DATA.units) {
      const d = DATA.units[id]; if (!d.abilities.scout || Sprites.alias['unit:' + id]) continue;
      const r = DATA.races[d.race]; if (!r) continue;
      const pick = r.units.find(k => DATA.units[k] && ['Cavalry', 'Horsebowemen', 'Wolf Riders'].includes(DATA.units[k].en)) || r.units.find(k => DATA.units[k] && DATA.units[k].en === 'Spearmen') || r.units[0];
      Sprites.alias['unit:' + id] = 'unit:' + pick;
    }
    // ingénieurs ajoutés aux races qui n'en avaient pas : la figurine de l'ingénieur des Hommes, en attendant la leur
    if (window.DATA) for (const id in DATA.units) { const d = DATA.units[id]; if (d.abilities.construction && !Sprites.alias['unit:' + id] && !Sprites.has('unit:' + id)) Sprites.alias['unit:' + id] = 'unit:HighMenEngineer'; }
    // recherches d'ouvrage : l'icône de leur bâtiment (à défaut, une figurine du peuple)
    if (window.DATA && DATA.wonderList) for (const w of DATA.wonderList) Sprites.alias['spell:lore_' + w.race] = Sprites.has('bld:' + w.id) ? 'bld:' + w.id : w.icon;
    // le Démon légendaire du pacte : la figurine du Seigneur démon
    Sprites.alias['unit:RiteDemon'] = 'unit:DemonLord'; Sprites.alias['portrait:RiteDemon'] = 'portrait:DemonLord';
    // les monstres des crises de fin : des figurines existantes
    for (const [k, v] of Object.entries(Anim.alias)) if (/^(LichLord|FinaleArchmage|FrostGiant|NodeEater|Prophet)$/.test(k)) { Sprites.alias['unit:' + k] = 'unit:' + v; Sprites.alias['portrait:' + k] = 'portrait:' + v; }
    // les sorts du Livre de légende
    Object.assign(Sprites.alias, { 'spell:palimpsest': 'spell:dispel_magic_true', 'spell:erasure': 'spell:disjunction_true', 'spell:oblivion': 'spell:confusion',
      'spell:annals': 'spell:earth_lore', 'spell:deus_ex_machina': 'spell:spell_ward', 'spell:mise_en_abyme': 'spell:mass_invisibility', 'spell:legendary_artifact': 'spell:create_artifact' });
    if (hd) Sprites.buildVirtual();
    Sprites.ready = true;
    Sprites.prog.cb = null; boot.remove();
    Sprites.loadAnim();   // sans attendre
  },
  // sprites composés à la volée et rangés comme des sprites HD : icônes des sorts d'invocation (la créature sur une vignette du royaume)
  REALM_VIG: {
    arcane: ['#262c38', '#aab4c4', '#9aa4b4'], life: ['#3a2a14', '#e2c06a', '#e8d39a'], death: ['#1e1428', '#8a5cc4', '#a07ad8'],
    chaos: ['#3a120c', '#e8673c', '#e8673c'], nature: ['#10301a', '#5fbf5f', '#6fbf5f'], sorcery: ['#0e1a3a', '#5d9de8', '#5d9de8'],
  },
  buildVirtual() {
    const S = 96;
    for (const id in (window.DATA ? DATA.spells : {})) {
      const sp = DATA.spells[id], key = 'spell:' + id;
      // un sort sans image à lui prend celle de son modèle (Marche sur l'eau majeure : celle de la mineure)
      if (sp.params && sp.params.icon && !Sprites.hdMap[key]) { Sprites.alias[key] = 'spell:' + sp.params.icon; continue; }
      if (sp.kind !== 'summon' || Sprites.hdMap[key]) continue;
      const uk = Sprites.resolve('unit:' + ((sp.params && (sp.params.unit || sp.params.type)) || ''));
      if (!uk || !Sprites.hdMap[uk]) continue;
      const [bg, glow, edge] = Sprites.REALM_VIG[sp.realm] || Sprites.REALM_VIG.arcane;
      const c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d');
      x.fillStyle = '#0b0d12'; x.fillRect(0, 0, S, S);
      x.fillStyle = edge; x.fillRect(2, 2, S - 4, S - 4);
      x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(4, 4, S - 8, S - 8);
      const g = x.createRadialGradient(S / 2, S * .52, 4, S / 2, S / 2, S * .62);
      g.addColorStop(0, glow); g.addColorStop(.45, bg); g.addColorStop(1, '#07080b');
      x.fillStyle = g; x.fillRect(5, 5, S - 10, S - 10);
      x.globalAlpha = .55; x.fillStyle = bg; x.fillRect(5, 5, S - 10, S - 10); x.globalAlpha = 1;
      x.save(); x.beginPath(); x.rect(5, 5, S - 10, S - 10); x.clip();
      x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(S / 2, S - 14, S * .3, 6, 0, 0, 7); x.fill();
      const r = Sprites.hdMap[uk]; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(Sprites.img4(uk), r[0], r[1], r[2], r[3], 8, 4, S - 16, S - 16);
      x.restore();
      Sprites.virt[key] = c; Sprites.hdMap[key] = [0, 0, S, S, 1];
    }
  },
  img4(k) { const r = Sprites.hdMap[k]; return r && r[4] ? Sprites.virt[k] : Sprites.hd; },
  // portrait d'un héros s'il existe, sinon sa figurine
  heroPic(type) { return Sprites.hasHD('portrait:' + type) ? 'portrait:' + type : 'unit:' + type; },
  hasHD(key) { return !!(Sprites.hd && Sprites.hdMap[key]); },
  // le décor du Miroir (arbres, reliefs, détails) : clé '~m' quand elle existe
  planeKey(key, plane) { return plane === 1 && Sprites.hasHD(key + '~m') ? key + '~m' : key; },
  hasMirror() { return Sprites.hasHD('tex:grass~m'); },
  has(key) { return Sprites.hasHD(key) || !!(Sprites.map && Sprites.map[key]); },
  // figurines provisoires des héros, en attendant leurs propres images (lot 2)
  alias: {
    'spell:jericho_trumpets': 'spell:high_prayer', 'spell:haunted_ramparts': 'spell:terror', 'spell:flux_rupture': 'spell:dispel_magic',
    'unit:HeroTorin': 'unit:ElvenLord', 'unit:HeroFang': 'unit:DraconianSwordsmen', 'unit:HeroBShan': 'unit:NomadBowmen', 'unit:HeroMorgana': 'unit:Warlocks',
    'unit:HeroWarrax': 'unit:DraconianMagician', 'unit:HeroMysticX': 'unit:NomadRangers', 'unit:HeroBahgtru': 'unit:OrcSwordsmen', 'unit:HeroDethStryke': 'unit:HighElfSwordsmen',
    'unit:HeroSpyder': 'unit:Nightblades', 'unit:HeroSirHarold': 'unit:HighMenCavalry', 'unit:HeroBrax': 'unit:DwarfSwordsmen', 'unit:HeroRavashack': 'unit:OrcShamans',
    'unit:HeroGreyfairer': 'unit:BarbarianShaman', 'unit:HeroShalla': 'unit:BarbarianSwordsmen', 'unit:HeroRoland': 'unit:Paladin', 'unit:HeroMalleus': 'unit:HighMenMagician',
    'unit:HeroMortu': 'unit:DeathKnights', 'unit:HeroGunther': 'unit:Berserkers', 'unit:HeroRakir': 'unit:BarbarianBowmen', 'unit:HeroJaer': 'unit:HighElfMagician',
    'unit:HeroTaki': 'unit:NomadSwordsmen', 'unit:HeroYramrag': 'unit:Warlocks', 'unit:HeroValana': 'unit:NomadPriest', 'unit:HeroElana': 'unit:HighMenPriest',
    'unit:HeroAerie': 'unit:DarkElfPriests', 'unit:HeroMarcus': 'unit:HighMenBowmen', 'unit:HeroReywind': 'unit:HighMenMagician', 'unit:HeroAlorra': 'unit:Longbowmen',
    'unit:HeroZaldron': 'unit:HighMenMagician', 'unit:HeroShinBo': 'unit:Nightblades', 'unit:HeroSerena': 'unit:HalflingShamans', 'unit:HeroShuri': 'unit:Longbowmen',
    'unit:HeroTheria': 'unit:Nightblades', 'unit:HeroTumu': 'unit:Nightblades', 'unit:HeroAureus': 'unit:Angel',
    'bld:fortress': 'city:fortress', 'spell:purify_land': 'spell:tranquility', 'spell:field_healing': 'spell:healing', 'spell:open_rift': 'spell:chaos_rift', 'unit:WizardAvatar': 'unit:HighMenMagician', 'spell:wizard_avatar': 'unit:HighMenMagician',
  },
  resolve(key) {
    if (Sprites.hasHD(key)) return key;
    const al = Sprites.alias[key]; if (al && Sprites.hasHD(al)) return al;
    if (Sprites.has(key)) return key;
    if (al && Sprites.has(al)) return al;
    const base = key.replace(/:\d+$/, '');
    if (Sprites.has(base)) return base;
    return null;
  },
  // dessine un sprite ; renvoie false s'il manque. Les sprites HD sont lissés quand on les réduit.
  draw(ctx, key, x, y, w, h) {
    const k = Sprites.resolve(key);
    if (!k) return false;
    if (Sprites.hasHD(k)) {
      const r = Sprites.hdMap[k];
      let dw = w || r[2], dh = h || r[3];
      // pans de muraille et tours (non carrés) : proportions gardées, posés en bas au centre du cadre
      if (w && h && /^c(wall|house):/.test(k)) { const sc = Math.min(w / r[2], h / r[3]); x += (w - r[2] * sc) / 2; y += h - r[3] * sc; dw = r[2] * sc; dh = r[3] * sc; }
      const prev = ctx.imageSmoothingEnabled;
      const down = dw < r[2] - 0.5;
      ctx.imageSmoothingEnabled = down; if (down) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(Sprites.img4(k), r[0], r[1], r[2], r[3], x, y, dw, dh);
      ctx.imageSmoothingEnabled = prev;
      return true;
    }
    if (!Sprites.img) return false;
    const r = Sprites.map[k];
    ctx.drawImage(Sprites.img, r[0], r[1], r[2], r[3], x, y, w || r[2], h || r[3]);
    return true;
  },
  // carré d'un sprite posé par le bas : (cx, bottom) = milieu du pied
  drawFoot(ctx, key, cx, bottom, size, glow) {
    const ok = Sprites.draw(ctx, key, cx - size / 2, bottom - size, size, size);
    if (ok && glow) Weapons.onStill(ctx, key, cx - size / 2, bottom - size, size, glow);
    return ok;
  },
  // canvas mis en cache (pour les cartes d'unités DOM)
  canvas(key, size = 32) {
    const id = key + '@' + size;
    if (Sprites.cache[id]) return Sprites.cache[id];
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
    Sprites.draw(ctx, key, 0, 0, size, size);
    Sprites.cache[id] = c;
    return c;
  },
  // copie dans un <canvas> du DOM
  paint(canvasEl, key) {
    const ctx = canvasEl.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const k = Sprites.resolve(key);
    if (k && Sprites.hasHD(k) && canvasEl.width < 96 && !canvasEl.classList.contains('hd')) {
      // canevas créé ailleurs à petite taille : on passe en HD sans changer sa taille affichée
      const w = canvasEl.width, hh = canvasEl.height;
      if (!canvasEl.style.width) { canvasEl.style.width = (canvasEl.clientWidth || w) + 'px'; canvasEl.style.height = (canvasEl.clientHeight || hh) + 'px'; }
      canvasEl.width = w * 3; canvasEl.height = hh * 3; canvasEl.classList.add('hd');
    }
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    Sprites.draw(ctx, key, 0, 0, canvasEl.width, canvasEl.height);
  },
  // l'avatar d'un sorcier prend une silhouette qui ressemble à son portrait (femme, homme-lézard, liche…)
  AVATAR_LOOKS: ['HeroGreyfairer', 'NomadPriest', 'HeroMorgana', 'HeroMalleus', 'HighMenMagician', 'BarbarianShaman', 'HeroYramrag', 'DraconianMagician', 'HeroReywind', 'HeroSerena', 'HighMenPriest', 'HeroElana', 'HeroRakir', 'HeroJaer'],
  avatarOwner(u) { const g = (typeof App !== 'undefined' && App.game) || (typeof UI !== 'undefined' && UI.game); return u && u.type === 'WizardAvatar' && g ? g.players[u.owner] : null; },
  lookOf(u) { const pl = Sprites.avatarOwner(u), l = pl && Sprites.AVATAR_LOOKS[pl.portrait]; return l && Sprites.has('unit:' + l) ? l : u.type; },
  unitKey(u) { return 'unit:' + Sprites.lookOf(u); },
  // grand portrait : le visage du sorcier pour son avatar, celui du héros sinon
  heroPicOf(u) { const pl = Sprites.avatarOwner(u); return pl && Sprites.hasHD('wizard:' + pl.portrait) ? 'wizard:' + pl.portrait : Sprites.heroPic(Sprites.lookOf(u)); },
  spellKey(id) { return 'spell:' + id; },
};

// ---------- armes magiques : seules les armes des figurines luisent, comme dans l'original ----------
// Masques des armes (tools/build_weapons.py) : un rectangle de l'atlas assets/weapons.png par figurine fixe et par image
// d'animation, posé à (ox, oy) dans l'image d'origine. La lueur (l'arme teintée et son halo) est calculée une fois par
// taille et par couleur, puis ajoutée par-dessus la figurine en mode additif.
// effets dessinés (tools/build_fx.py) : projectiles du champ de bataille et taches de sol corrompu
const Fx = {
  img: null, meta: {},
  has(k) { return !!(Fx.img && Fx.meta[k]); },
  // dessine le sprite k centré en (x, y), tourné de ang, à la longueur (ou au diamètre) size en pixels d'écran
  draw(ctx, k, x, y, ang, size, alpha) {
    const r = Fx.meta[k]; if (!r || !Fx.img) return false;
    const s = size / Math.max(r[2], r[3]);
    ctx.save(); ctx.translate(x, y); if (ang) ctx.rotate(ang); if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(Fx.img, r[0], r[1], r[2], r[3], -r[2] * s / 2, -r[3] * s / 2, r[2] * s, r[3] * s);
    ctx.restore();
    return true;
  },
};

const Weapons = {
  img: null, meta: { s: {}, a: {} }, cache: new Map(), MAX: 600,
  // masque d'une figurine fixe (clé résolue : un éclaireur prend celui du cavalier dont il emprunte l'image)
  still(key) { const k = Sprites.resolve(key); return k ? Weapons.meta.s[k] || null : null; },
  frame(type, i) { const l = Weapons.meta.a[Anim.key(type)]; return l ? l[i] || null : null; },
  // lueur d'un masque à la taille (tw, th) ; fig = taille de la figurine (règle le flou)
  build(rect, tw, th, fig, rgb) {
    const k = rect.join(',') + '|' + tw + 'x' + th + '|' + rgb;
    let e = Weapons.cache.get(k);
    if (e) { Weapons.cache.delete(k); Weapons.cache.set(k, e); return e; }
    const blur = Math.max(2, Math.round(fig * .045)), pad = blur * 3;
    // l'arme teintée
    const t = document.createElement('canvas'); t.width = tw; t.height = th;
    const g = t.getContext('2d'); g.imageSmoothingEnabled = true;
    g.drawImage(Weapons.img, rect[0], rect[1], rect[2], rect[3], 0, 0, tw, th);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(' + rgb + ')'; g.fillRect(0, 0, tw, th);
    // le halo (l'ombre floue de l'arme, l'arme elle-même hors du cadre), puis l'arme par-dessus
    const c = document.createElement('canvas'); c.width = tw + pad * 2; c.height = th + pad * 2;
    const x = c.getContext('2d');
    x.shadowColor = 'rgb(' + rgb + ')'; x.shadowBlur = blur; x.shadowOffsetX = c.width * 2;
    x.drawImage(t, pad - c.width * 2, pad); x.drawImage(t, pad - c.width * 2, pad); x.drawImage(t, pad - c.width * 2, pad);
    x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetX = 0;
    x.globalAlpha = .85; x.drawImage(t, pad, pad);
    e = { c, pad };
    Weapons.cache.set(k, e);
    if (Weapons.cache.size > Weapons.MAX) Weapons.cache.delete(Weapons.cache.keys().next().value);
    return e;
  },
  // pose la lueur d'un masque sur une image dessinée en (x, y), à l'échelle sc (pixels de l'image d'origine → écran)
  draw(ctx, rect, x, y, sc, fig, glow) {
    if (!rect || !Weapons.img || !glow) return;
    const tw = Math.max(1, Math.round(rect[2] * sc)), th = Math.max(1, Math.round(rect[3] * sc));
    const e = Weapons.build(rect, tw, th, fig, glow.rgb);
    const op = ctx.globalCompositeOperation, a = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    // au-delà de 1 : une seconde passe, plus vive (sur la carte, où les figurines sont petites)
    for (let k = glow.alpha; k > 0.02; k -= 1) { ctx.globalAlpha = a * Math.min(1, k); ctx.drawImage(e.c, Math.round(x + rect[4] * sc - e.pad), Math.round(y + rect[5] * sc - e.pad)); }
    ctx.globalCompositeOperation = op; ctx.globalAlpha = a;
  },
  // figurine fixe dessinée en (x, y, w, w)
  onStill(ctx, key, x, y, w, glow) {
    const k = Sprites.resolve(key), r = k && Sprites.hdMap[k]; if (!r || !glow) return;
    Weapons.draw(ctx, Weapons.still(k), x, y, w / r[2], w, glow);
  },
};

// ---------- animations des unités (planches de 16 images : repos, marche, attaque, mort) ----------
// Chaque image est à l'échelle de la figurine fixe (base 128) et calée par les pieds au centre bas de son cadre.
const Anim = {
  img: null, meta: {},   // img : les pages de l'atlas (anim.png, anim1.png, ...)
  ROW: { idle: 0, walk: 1, attack: 2, death: 3 },
  // durée d'une image (ms) et bouclage par action
  SPEED: { idle: 260, walk: 110, attack: 105, death: 150 },
  alias: { WizardAvatar: 'HighMenMagician', RiteDemon: 'DemonLord', LichLord: 'Wraith', FinaleArchmage: 'DarkElfPriests', FrostGiant: 'StormGiant', NodeEater: 'ChaosSpawn', Prophet: 'HighMenPriest' },
  key(type) { return Anim.meta[type] ? type : Anim.alias[type]; },
  has(type) { return !!(Anim.img && Anim.meta[Anim.key(type)]); },
  // image à afficher : action en boucle (repos, marche) ou jouée une fois puis figée (attaque, mort)
  frame(action, t) {
    const n = Math.floor(Math.max(0, t) / Anim.SPEED[action]);
    if (action === 'idle') return [0, 1, 2, 3, 2, 1][n % 6];   // va-et-vient : respiration sans saut
    if (action === 'walk') return n % 4;
    return Math.min(3, n);
  },
  duration(action) { return Anim.SPEED[action] * 4; },
  // dessine l'unité : (cx, bottom) = milieu du bas, comme Sprites.drawFoot ; size = côté de la figurine fixe équivalente ; flip = regarde à droite
  draw(ctx, type, action, t, cx, bottom, size, flip, glow) {
    const m = Anim.meta[Anim.key(type)]; if (!m || !Anim.img) return false;
    const i = Anim.ROW[action] * 4 + Anim.frame(action, t), [sx, sy] = m.f[i];
    const k = size / 128, dw = m.w * k, dh = m.h * k;
    ctx.save();
    ctx.imageSmoothingEnabled = k < 1; if (k < 1) ctx.imageSmoothingQuality = 'high';
    if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    ctx.drawImage(Anim.img[m.p || 0], sx, sy, m.w, m.h, cx - dw / 2, bottom - dh, dw, dh);
    // armes magiques : l'arme de cette image luit
    if (glow) Weapons.draw(ctx, Weapons.frame(type, i), cx - dw / 2, bottom - dh, k, size, glow);
    ctx.restore();
    return true;
  },
};

// ---------- textures HD et masques de transition ----------
const Tex = {
  cache: {},
  // texture 256x256 de l'atlas HD (null si absente)
  // plane 1 (le Miroir) : sa propre version de la texture (clé '~m') quand elle existe
  get(name, plane) {
    let k = 'tex:' + name;
    if (plane === 1 && Sprites.hasHD(k + '~m')) k += '~m';
    if (Tex.cache[k] !== undefined) return Tex.cache[k];
    let c = null;
    if (Sprites.hasHD(k)) {
      const r = Sprites.hdMap[k];
      c = document.createElement('canvas'); c.width = r[2]; c.height = r[3];
      c.getContext('2d').drawImage(Sprites.img4(k), r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    }
    Tex.cache[k] = c;
    return c;
  },
  // masques 64x64 : opaques du côté du voisin, s'effaçant en bord irrégulier vers l'intérieur
  masks: null,
  mask(dir) {
    if (!Tex.masks) {
      Tex.masks = {};
      const S = 64;
      const dirs = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0], nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };
      for (const d in dirs) {
        const [dx, dy] = dirs[d];
        const c = document.createElement('canvas'); c.width = S; c.height = S;
        const g = c.getContext('2d'), img = g.createImageData(S, S);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          // distance au bord (ou au coin) du voisin, en fraction de case
          const ex = dx > 0 ? (S - 1 - x) / S : dx < 0 ? x / S : null;
          const ey = dy > 0 ? (S - 1 - y) / S : dy < 0 ? y / S : null;
          let dist = dx && dy ? Math.hypot(ex, ey) * 1.25 : (ex != null ? ex : ey);
          const along = dx && !dy ? y : !dx && dy ? x : x + y;
          const noise = Math.sin(along * 0.45 + d.length) * 0.05 + Math.sin(along * 1.7 + 2) * 0.03 + (Tiles.hash(x, y, 77) % 100) / 100 * 0.07;
          const t = (dist - 0.07 - noise) / 0.2;
          const a = t <= 0 ? 255 : t >= 1 ? 0 : Math.round(255 * (1 - t));
          // tramage ordonné sur la frange : bord net façon pixel art
          const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16;
          img.data[(y * S + x) * 4 + 3] = a / 255 > bayer ? 255 : 0;
        }
        g.putImageData(img, 0, 0);
        Tex.masks[d] = c;
      }
    }
    return Tex.masks[dir];
  },
};

// ---------- tuiles de terrain (32x32, style pixel) ----------
const Tiles = {
  cache: {},
  hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; },
  mk(fn) { const c = document.createElement('canvas'); c.width = 32; c.height = 32; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; fn(ctx); return c; },
  variants(prefix) { let n = 0; while (Sprites.has(prefix + ':' + n)) n++; return Math.max(1, n); },
  base(kind, v) {
    const id = 'b:' + kind + ':' + v;
    if (Tiles.cache[id]) return Tiles.cache[id];
    const src = { grass: 'ter:grass', desert: 'ter:sand', tundra: 'ter:snow', swamp: 'ter:swamp', ocean: 'ter:water', shore: 'ter:shallow', lava: 'ter:lava', rock: 'ter:rock', hills: 'ter:hills', dirt: 'ter:dirt' }[kind] || 'ter:grass';
    const n = Tiles.variants(src);
    const c = Tiles.mk(ctx => { if (!Sprites.draw(ctx, src + ':' + (v % n), 0, 0, 32, 32)) { ctx.fillStyle = '#3a6b2c'; ctx.fillRect(0, 0, 32, 32); } });
    Tiles.cache[id] = c;
    return c;
  },
  // montagne pixel-art générée : deux sommets ombrés avec neige
  mountain(v, snow) {
    const id = 'mt:' + v + ':' + snow;
    if (Tiles.cache[id]) return Tiles.cache[id];
    const c = Tiles.mk(ctx => {
      const rnd = (k) => (Tiles.hash(v, k, 7) % 1000) / 1000;
      const peaks = [{ x: 9 + rnd(1) * 6, h: 18 + rnd(2) * 6, w: 11 }, { x: 19 + rnd(3) * 6, h: 22 + rnd(4) * 7, w: 13 }];
      if (rnd(5) > 0.5) peaks.push({ x: 4 + rnd(6) * 24, h: 12 + rnd(7) * 5, w: 8 });
      peaks.sort((a, b) => a.h - b.h);
      for (const pk of peaks) {
        const top = 30 - pk.h;
        for (let y = top; y < 31; y++) {
          const t = (y - top) / pk.h;
          const half = Math.round(pk.w * t);
          for (let x = Math.round(pk.x - half); x <= Math.round(pk.x + half); x++) {
            if (x < 0 || x > 31) continue;
            const left = x < pk.x;
            let col = left ? [148, 140, 128] : [96, 90, 84];
            const snowLine = top + pk.h * (snow ? 0.38 : 0.22);
            if (y < snowLine) col = left ? [240, 242, 246] : [196, 204, 216];
            const n = (Tiles.hash(x, y, v) % 16) - 8;
            ctx.fillStyle = `rgb(${col[0] + n},${col[1] + n},${col[2] + n})`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
        // arête
        ctx.fillStyle = 'rgba(40,36,34,.55)';
        for (let y = top; y < 31; y++) { const t = (y - top) / pk.h; ctx.fillRect(Math.round(pk.x - pk.w * t) - 1, y, 1, 1); ctx.fillRect(Math.round(pk.x + pk.w * t) + 1, y, 1, 1); }
      }
    });
    Tiles.cache[id] = c;
    return c;
  },
  hill(v) {
    const id = 'hl:' + v;
    if (Tiles.cache[id]) return Tiles.cache[id];
    const c = Tiles.mk(ctx => {
      const rnd = (k) => (Tiles.hash(v, k, 11) % 1000) / 1000;
      const mounds = [{ x: 9 + rnd(1) * 5, y: 22, rx: 9, ry: 6 }, { x: 21 + rnd(2) * 4, y: 18 + rnd(3) * 4, rx: 10, ry: 7 }];
      for (const m of mounds) for (let y = m.y - m.ry; y <= m.y + 2; y++) for (let x = m.x - m.rx; x <= m.x + m.rx; x++) {
        const dx = (x - m.x) / m.rx, dy = (y - m.y) / m.ry;
        if (dx * dx + dy * dy > 1 || x < 0 || x > 31 || y < 0 || y > 31) continue;
        const lit = dx < -0.1 ? 1 : dx > 0.3 ? -1 : 0;
        const n = (Tiles.hash(x, y, v + 3) % 12) - 6;
        const col = lit > 0 ? [128, 140, 76] : lit < 0 ? [74, 82, 46] : [104, 114, 60];
        ctx.fillStyle = `rgb(${col[0] + n},${col[1] + n},${col[2] + n})`;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    Tiles.cache[id] = c;
    return c;
  },
};

// ---------- icônes vectorielles ----------
const ICONS = {
  chron: '<svg viewBox="0 0 16 16"><rect x="1.5" y="2" width="13" height="12" rx="1.5" fill="#d9c79a" stroke="#6b5a35"/><path d="M3.5 12 H12.5" stroke="#6b5a35" stroke-width=".8"/><path d="M3.5 10.5 L6.3 7.6 L8.8 9 L12.5 4.5" fill="none" stroke="#8a2a2a" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  gold: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="#e6b450" stroke="#8a6420"/><text x="8" y="11.5" font-size="9" text-anchor="middle" fill="#5a3e10" font-family="serif" font-weight="bold">o</text></svg>',
  mana: '<svg viewBox="0 0 16 16"><path d="M8 1 L13 8 L8 15 L3 8 Z" fill="#6eaaff" stroke="#2c5aa8"/><path d="M8 3 L10.5 8 L8 13" fill="#b9d6ff" opacity=".6"/></svg>',
  food: '<svg viewBox="0 0 16 16"><path d="M8 15 V5" stroke="#c8a64a" stroke-width="1.5"/><ellipse cx="6" cy="6" rx="2" ry="3" fill="#e2c35a"/><ellipse cx="10" cy="6" rx="2" ry="3" fill="#e2c35a"/><ellipse cx="6" cy="10.5" rx="2" ry="2.6" fill="#d8b44a"/><ellipse cx="10" cy="10.5" rx="2" ry="2.6" fill="#d8b44a"/></svg>',
  prod: '<svg viewBox="0 0 16 16"><path d="M3 13 L9 7" stroke="#8a6240" stroke-width="2.4"/><rect x="7" y="2" width="7" height="5" rx="1" transform="rotate(45 10.5 4.5)" fill="#a7a9ad" stroke="#555"/></svg>',
  research: '<svg viewBox="0 0 16 16"><path d="M2 3 Q8 1 8 4 Q8 1 14 3 V13 Q8 11 8 14 Q8 11 2 13 Z" fill="#b892ff" stroke="#5b3fa8"/><path d="M8 4 V14" stroke="#5b3fa8"/></svg>',
  power: '<svg viewBox="0 0 16 16"><path d="M9 1 L3 9 H8 L6 15 L13 6 H8 Z" fill="#5fd4d0" stroke="#1f7d7a"/></svg>',
  skill: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#b892ff" stroke-width="1.5"/><path d="M8 3 L9.3 6.7 L13 8 L9.3 9.3 L8 13 L6.7 9.3 L3 8 L6.7 6.7 Z" fill="#e0d2ff"/></svg>',
  veil: '<svg viewBox="0 0 16 16"><path d="M2 1.5 C4.5 4 1.5 7.5 3.5 10.5 C4.6 12.3 2.6 14.5 2.6 14.5 L7 14.5 C7.2 11.5 8.8 9.5 7.2 6.5 C6.3 4.6 7.3 1.5 7.3 1.5 Z" fill="#a98cff"/><path d="M14 1.5 C11.5 4 14.5 7.5 12.5 10.5 C11.4 12.3 13.4 14.5 13.4 14.5 L9 14.5 C8.8 11.5 7.2 9.5 8.8 6.5 C9.7 4.6 8.7 1.5 8.7 1.5 Z" fill="#6ec3ff"/><path d="M8 2.5 L8.7 5.5 L7.4 8 L8.6 10.8 L8 13.5" stroke="#fff3b0" stroke-width="1" fill="none"/></svg>',
  fame: '<svg viewBox="0 0 16 16"><path d="M8 1 L10 6 L15 6 L11 9.5 L12.5 15 L8 11.8 L3.5 15 L5 9.5 L1 6 L6 6 Z" fill="#f08bd1" stroke="#9a3f81"/></svg>',
  melee: '<svg viewBox="0 0 16 16"><path d="M3 13 L12 4 L13.5 2.5 L13.5 4 L4.5 13 Z" fill="#d8dde6" stroke="#666"/><path d="M2.5 11 L5 13.5" stroke="#c9a14a" stroke-width="2"/></svg>',
  ranged: '<svg viewBox="0 0 16 16"><path d="M4 2 Q13 8 4 14" fill="none" stroke="#b08850" stroke-width="1.6"/><path d="M4 2 V14" stroke="#ddd" stroke-width=".7"/><path d="M2 8 H14 L12 6.5 M14 8 L12 9.5" stroke="#ddd" fill="none"/></svg>',
  magic: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="#ff9a4a"/><circle cx="8" cy="8" r="6.5" fill="none" stroke="#ffcf6a" stroke-dasharray="2 2"/></svg>',
  boulder: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="5" fill="#8d8a84" stroke="#4a4844"/></svg>',
  def: '<svg viewBox="0 0 16 16"><path d="M8 1 L14 3 V8 Q14 13 8 15 Q2 13 2 8 V3 Z" fill="#7d93b3" stroke="#3c4c66"/></svg>',
  res: '<svg viewBox="0 0 16 16"><path d="M6 1 H10 V6 H15 V10 H10 V15 H6 V10 H1 V6 H6 Z" fill="#cfd8e8" stroke="#5a6680"/></svg>',
  hp: '<svg viewBox="0 0 16 16"><path d="M8 14 L2.5 8.5 Q0 5 3.5 3 Q6.5 2 8 5 Q9.5 2 12.5 3 Q16 5 13.5 8.5 Z" fill="#e35d5d" stroke="#7a2525"/></svg>',
  move: '<svg viewBox="0 0 16 16"><path d="M4 14 Q3 9 6 8 Q9 7 9 3 L12 3 Q12 9 8 10 Q7 11 8 14 Z" fill="#c9b48a" stroke="#6b5a38"/></svg>',
  fly: '<svg viewBox="0 0 16 16"><path d="M1 9 Q5 3 8 8 Q11 3 15 9 Q11 7 8 11 Q5 7 1 9 Z" fill="#cfd8e8" stroke="#5a6680"/></svg>',
  figs: '<svg viewBox="0 0 16 16"><circle cx="5" cy="5" r="2" fill="#ccc"/><circle cx="11" cy="5" r="2" fill="#ccc"/><path d="M2 13 Q5 7 8 13 M8 13 Q11 7 14 13" stroke="#ccc" fill="none" stroke-width="1.5"/></svg>',
  book: '<svg viewBox="0 0 16 16"><path d="M3 2 H12 Q13 2 13 3 V14 H4 Q3 14 3 13 Z" fill="#8a5a2b" stroke="#3d260f"/><path d="M5 4 H11" stroke="#e6b450"/></svg>',
  city: '<svg viewBox="0 0 16 16"><path d="M2 14 V8 L5 5 L8 8 V14 Z M8 14 V6 L11 3 L14 6 V14 Z" fill="#c9b48a" stroke="#5a4a2a"/></svg>',
  army: '<svg viewBox="0 0 16 16"><path d="M8 1 L14 3 V8 Q14 13 8 15 Q2 13 2 8 V3 Z" fill="#a33" stroke="#511"/><path d="M5 10 L11 4 M5 4 L11 10" stroke="#fff" stroke-width="1.3"/></svg>',
  wizards: '<svg viewBox="0 0 16 16"><path d="M8 1 L11 8 H5 Z" fill="#6c4fc4"/><circle cx="8" cy="10" r="3" fill="#e2c9a6"/><path d="M4 15 Q8 10 12 15" fill="#6c4fc4"/></svg>',
  log: '<svg viewBox="0 0 16 16"><rect x="3" y="2" width="10" height="12" rx="1.5" fill="#d9cba7" stroke="#6b5a38"/><path d="M5 5 H11 M5 8 H11 M5 11 H9" stroke="#6b5a38"/></svg>',
  sound: '<svg viewBox="0 0 16 16"><path d="M2 6 H5 L9 2.5 V13.5 L5 10 H2 Z" fill="#ccc"/><path d="M11 5.5 Q13 8 11 10.5 M12.5 3.5 Q16 8 12.5 12.5" stroke="#ccc" fill="none" stroke-width="1.3"/></svg>',
  mute: '<svg viewBox="0 0 16 16"><path d="M2 6 H5 L9 2.5 V13.5 L5 10 H2 Z" fill="#777"/><path d="M11 5.5 L15 10.5 M15 5.5 L11 10.5" stroke="#e35d5d" stroke-width="1.5"/></svg>',
  menu: '<svg viewBox="0 0 16 16"><path d="M2 4 H14 M2 8 H14 M2 12 H14" stroke="#ccc" stroke-width="1.6"/></svg>',
  plane: '<svg viewBox="0 0 16 16"><circle cx="6" cy="8" r="5" fill="none" stroke="#6eaaff" stroke-width="1.5"/><circle cx="10" cy="8" r="5" fill="none" stroke="#b892ff" stroke-width="1.5"/></svg>',
  unrest: '<svg viewBox="0 0 16 16"><path d="M3 14 L5 4 L8 9 L11 2 L13 14 Z" fill="#e35d5d"/></svg>',
  wand: '<svg viewBox="0 0 16 16"><path d="M3 13 L11 5" stroke="#b98a5a" stroke-width="2"/><path d="M12 1 L12.8 3.2 L15 4 L12.8 4.8 L12 7 L11.2 4.8 L9 4 L11.2 3.2 Z" fill="#ffe08a"/></svg>',
};
// ---------- icônes enluminées : dégradés partagés (définis une fois dans la page), reflets, liserés d'or ----------
const ICON_DEFS = '<svg id="icon-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>'
  + '<radialGradient id="ai-gold" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#f3c64e"/><stop offset=".75" stop-color="#c8901e"/><stop offset="1" stop-color="#7a5410"/></radialGradient>'
  + '<linearGradient id="ai-goldl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".45" stop-color="#e9b84a"/><stop offset="1" stop-color="#8a5e14"/></linearGradient>'
  + '<linearGradient id="ai-mana" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2f2ff"/><stop offset=".4" stop-color="#7ab4ff"/><stop offset="1" stop-color="#2346b8"/></linearGradient>'
  + '<linearGradient id="ai-power" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0ffff"/><stop offset=".45" stop-color="#6fe6e0"/><stop offset="1" stop-color="#16808a"/></linearGradient>'
  + '<linearGradient id="ai-purple" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8bcff"/><stop offset=".5" stop-color="#8a5ae0"/><stop offset="1" stop-color="#3e2480"/></linearGradient>'
  + '<linearGradient id="ai-parch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdf3d8"/><stop offset="1" stop-color="#d4b97e"/></linearGradient>'
  + '<radialGradient id="ai-food" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff3b0"/><stop offset=".55" stop-color="#e6bf48"/><stop offset="1" stop-color="#94701c"/></radialGradient>'
  + '<radialGradient id="ai-skill" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#d9c2ff"/><stop offset="1" stop-color="#6b45c8"/></radialGradient>'
  + '<radialGradient id="ai-fame" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff0fa"/><stop offset=".45" stop-color="#f59ad8"/><stop offset="1" stop-color="#a0307e"/></radialGradient>'
  + '<linearGradient id="ai-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c3ccd8"/><stop offset="1" stop-color="#5e6878"/></linearGradient>'
  + '<linearGradient id="ai-shield" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9d8ee"/><stop offset=".5" stop-color="#6f88b0"/><stop offset="1" stop-color="#2c3c58"/></linearGradient>'
  + '<linearGradient id="ai-leather" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b0743a"/><stop offset="1" stop-color="#4e2a0e"/></linearGradient>'
  + '<linearGradient id="ai-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d09a60"/><stop offset="1" stop-color="#6e4420"/></linearGradient>'
  + '<radialGradient id="ai-red" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffc0b8"/><stop offset=".45" stop-color="#e8564e"/><stop offset="1" stop-color="#7e1414"/></radialGradient>'
  + '<linearGradient id="ai-stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efe2c0"/><stop offset=".6" stop-color="#b59c70"/><stop offset="1" stop-color="#6e5a3a"/></linearGradient>'
  + '<radialGradient id="ai-fire" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffc24a"/><stop offset=".8" stop-color="#e8541e"/><stop offset="1" stop-color="#8a1e08"/></radialGradient>'
  + '<radialGradient id="ai-arcanus" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#e8f4ff"/><stop offset=".5" stop-color="#5a9cf0"/><stop offset="1" stop-color="#173a8a"/></radialGradient>'
  + '<radialGradient id="ai-myrror" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#f4e6ff"/><stop offset=".5" stop-color="#a070e0"/><stop offset="1" stop-color="#3e1c7a"/></radialGradient>'
  + '</defs></svg>';
const SPARK = (x, y, r, c) => '<path d="M' + x + ' ' + (y - r) + ' L' + (x + r * .28) + ' ' + (y - r * .28) + ' L' + (x + r) + ' ' + y + ' L' + (x + r * .28) + ' ' + (y + r * .28) + ' L' + x + ' ' + (y + r) + ' L' + (x - r * .28) + ' ' + (y + r * .28) + ' L' + (x - r) + ' ' + y + ' L' + (x - r * .28) + ' ' + (y - r * .28) + ' Z" fill="' + (c || '#fff') + '"/>';
Object.assign(ICONS, {
  gold: '<svg viewBox="0 0 16 16"><ellipse cx="8.4" cy="12.6" rx="6" ry="2" fill="#5a3c08" opacity=".55"/><circle cx="8" cy="8" r="6.6" fill="url(#ai-gold)" stroke="#6b4a10" stroke-width=".8"/><circle cx="8" cy="8" r="4.7" fill="none" stroke="#fff3b8" stroke-opacity=".6" stroke-width=".7"/><circle cx="8" cy="8" r="4.7" fill="none" stroke="#8a5e14" stroke-opacity=".5" stroke-width=".5" stroke-dasharray=".6 .9"/><path d="M8 5.1 L8.9 7 L10.9 7.2 L9.4 8.5 L9.8 10.5 L8 9.5 L6.2 10.5 L6.6 8.5 L5.1 7.2 L7.1 7 Z" fill="#9a6a14"/><ellipse cx="5.9" cy="4.9" rx="2" ry=".9" fill="#fff" opacity=".55" transform="rotate(-35 5.9 4.9)"/></svg>',
  mana: '<svg viewBox="0 0 16 16"><path d="M8 .7 L12.8 6 L8 15.3 L3.2 6 Z" fill="url(#ai-mana)" stroke="#1a3a8c" stroke-width=".7" stroke-linejoin="round"/><path d="M8 .7 L6.1 6 L8 15.3 Z" fill="#fff" opacity=".3"/><path d="M8 .7 L9.9 6 L8 15.3 Z" fill="#06205e" opacity=".28"/><path d="M3.2 6 H12.8" stroke="#e6f3ff" stroke-width=".6" opacity=".8"/>' + SPARK(4.2, 2.6, 1.7, '#ffffff') + '</svg>',
  food: '<svg viewBox="0 0 16 16"><path d="M8 15 V6.5 M8 11 Q5.5 9.5 4.6 6.5 M8 11 Q10.5 9.5 11.4 6.5" stroke="#9a7a2a" stroke-width="1.1" fill="none" stroke-linecap="round"/><ellipse cx="8" cy="3.6" rx="1.6" ry="2.6" fill="url(#ai-food)" stroke="#7a5a14" stroke-width=".5"/><ellipse cx="4.4" cy="5.2" rx="1.5" ry="2.4" fill="url(#ai-food)" stroke="#7a5a14" stroke-width=".5" transform="rotate(-25 4.4 5.2)"/><ellipse cx="11.6" cy="5.2" rx="1.5" ry="2.4" fill="url(#ai-food)" stroke="#7a5a14" stroke-width=".5" transform="rotate(25 11.6 5.2)"/><ellipse cx="6" cy="8.6" rx="1.3" ry="2" fill="url(#ai-food)" stroke="#7a5a14" stroke-width=".5" transform="rotate(-20 6 8.6)"/><ellipse cx="10" cy="8.6" rx="1.3" ry="2" fill="url(#ai-food)" stroke="#7a5a14" stroke-width=".5" transform="rotate(20 10 8.6)"/></svg>',
  prod: '<svg viewBox="0 0 16 16"><path d="M3 14.2 L10 7.2" stroke="url(#ai-wood)" stroke-width="2.2" stroke-linecap="round"/><path d="M3 14.2 L10 7.2" stroke="#3a2008" stroke-width=".5" opacity=".5"/><g transform="rotate(45 10.6 4.6)"><rect x="6.4" y="2.6" width="8.4" height="4.2" rx=".8" fill="url(#ai-steel)" stroke="#3a4250" stroke-width=".6"/><rect x="9.6" y="2.6" width="2" height="4.2" fill="#7a5a18"/></g></svg>',
  research: '<svg viewBox="0 0 16 16"><path d="M1.5 4 Q5 2.6 8 4.4 Q11 2.6 14.5 4 V13.4 Q11 12 8 13.8 Q5 12 1.5 13.4 Z" fill="url(#ai-purple)" stroke="#2e1a66" stroke-width=".6"/><path d="M2.3 4.4 Q5 3.3 7.6 4.9 V12.9 Q5 11.6 2.3 12.6 Z M8.4 4.9 Q11 3.3 13.7 4.4 V12.6 Q11 11.6 8.4 12.9 Z" fill="url(#ai-parch)"/><path d="M8 4.9 V13.4" stroke="#6b4a20" stroke-width=".5"/><path d="M3.4 6.4 H6.4 M3.4 8 H6.6 M3.4 9.6 H6 M9.6 6.4 H12.6 M9.4 8 H12.4" stroke="#8a6a3a" stroke-width=".45" opacity=".8"/>' + SPARK(11.8, 2.2, 1.8, '#f3e4ff') + '</svg>',
  power: '<svg viewBox="0 0 16 16"><path d="M9.6 .8 L3 9.2 H7.6 L5.8 15.2 L13.2 6 H8.4 Z" fill="url(#ai-power)" stroke="#0f5a62" stroke-width=".7" stroke-linejoin="round"/><path d="M9 3 L5.4 8.2 H8.4" stroke="#fff" stroke-width=".6" fill="none" opacity=".75"/></svg>',
  skill: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="#1b1036" stroke="url(#ai-goldl)" stroke-width="1.1"/><circle cx="8" cy="8" r="5.2" fill="url(#ai-skill)" opacity=".85"/><path d="M8 3.6 L9.3 10.6 L3.6 6.3 H12.4 L6.7 10.6 Z" fill="none" stroke="#fff" stroke-width=".7" stroke-linejoin="round" opacity=".9"/></svg>',
  fame: '<svg viewBox="0 0 16 16"><path d="M8 .8 L10.1 5.6 L15.2 6 L11.3 9.4 L12.5 14.6 L8 11.9 L3.5 14.6 L4.7 9.4 L.8 6 L5.9 5.6 Z" fill="url(#ai-fame)" stroke="#7a1e5e" stroke-width=".6" stroke-linejoin="round"/><path d="M8 2.8 L9.4 6.3 L8 9.4 Z" fill="#fff" opacity=".45"/></svg>',
  book: '<svg viewBox="0 0 16 16"><path d="M3.2 1.6 H12.6 Q13.6 1.6 13.6 2.6 V14.4 H4.2 Q3.2 14.4 3.2 13.4 Z" fill="url(#ai-leather)" stroke="#2a1404" stroke-width=".6"/><path d="M4.4 13 H13.6 V14.4 H4.2 Q3.4 14.4 3.4 13.6 Q3.4 13 4.4 13 Z" fill="url(#ai-parch)"/><path d="M3.2 1.6 H5.6 L3.2 4 Z M13.6 1.6 H11.2 L13.6 4 Z M13.6 13 H11.4 L13.6 10.8 Z" fill="url(#ai-goldl)"/><circle cx="8.4" cy="7.2" r="2.5" fill="none" stroke="url(#ai-goldl)" stroke-width=".8"/><circle cx="8.4" cy="7.2" r="1.4" fill="url(#ai-red)"/><circle cx="7.9" cy="6.7" r=".45" fill="#fff" opacity=".8"/></svg>',
  wand: '<svg viewBox="0 0 16 16"><path d="M2.2 14 L10.2 6" stroke="url(#ai-wood)" stroke-width="1.9" stroke-linecap="round"/><path d="M3.6 12.6 L4.6 11.6 M5.2 11 L6.2 10" stroke="url(#ai-goldl)" stroke-width="2.2"/><circle cx="11.4" cy="4.8" r="3.4" fill="#ffe9a0" opacity=".25"/>' + SPARK(11.4, 4.8, 3.6, '#fff5c8') + SPARK(14.2, 9.4, 1.3, '#cfe6ff') + SPARK(7.4, 2, 1.1, '#f3e4ff') + '</svg>',
  city: '<svg viewBox="0 0 16 16"><path d="M1.6 15 V7.4 H2.8 V6.2 H4 V7.4 H5.2 V6.2 H6.4 V7.4 H7 V15 Z" fill="url(#ai-stone)" stroke="#4a3a22" stroke-width=".5"/><path d="M6.6 15 V4.8 H7.8 V3.6 H9 V4.8 H10.2 V3.6 H11.4 V4.8 H12.6 V3.6 H13.8 V4.8 H14.6 V15 Z" fill="url(#ai-stone)" stroke="#4a3a22" stroke-width=".5"/><path d="M9.4 15 V12 Q10.6 10.4 11.8 12 V15 Z" fill="#2a1c0c"/><path d="M3.6 9.6 h1.2 v1.8 h-1.2 Z M9.6 7 h1 v1.6 h-1 Z M12 7 h1 v1.6 h-1 Z" fill="#3a2a14"/><path d="M10.6 3.6 V.8" stroke="#6b5434" stroke-width=".5"/><path d="M10.6 .8 L13.4 1.6 L10.6 2.4 Z" fill="#4a8be0"/></svg>',
  army: '<svg viewBox="0 0 16 16"><path d="M2 2 L12.6 12.6 M14 2 L3.4 12.6" stroke="url(#ai-steel)" stroke-width="1.5" stroke-linecap="round"/><path d="M10.8 13.8 L13.8 10.8 M2.2 10.8 L5.2 13.8" stroke="url(#ai-goldl)" stroke-width="1.4" stroke-linecap="round"/><path d="M8 4.4 L12 5.8 V9 Q12 12.6 8 14.2 Q4 12.6 4 9 V5.8 Z" fill="url(#ai-red)" stroke="url(#ai-goldl)" stroke-width=".9"/><path d="M8 6.2 L9.8 8.6 L8 11.4 L6.2 8.6 Z" fill="#f6e2a8" opacity=".85"/></svg>',
  wizards: '<svg viewBox="0 0 16 16"><path d="M8.6 .8 Q7.4 4 5 9.6 H12.6 Q10.6 6 11.6 3.4 Q10.2 3.8 8.6 .8 Z" fill="url(#ai-purple)" stroke="#2a1660" stroke-width=".6"/><ellipse cx="8.8" cy="10.6" rx="6.4" ry="1.9" fill="url(#ai-purple)" stroke="#2a1660" stroke-width=".6"/><path d="M5.6 8.4 Q8.8 9.4 12.2 8.4" stroke="url(#ai-goldl)" stroke-width="1" fill="none"/>' + SPARK(8.2, 5.2, 1.3, '#ffe9a0') + SPARK(10, 2.8, .8, '#fff') + '<path d="M5.4 12.4 Q8.8 15.6 12.2 12.4" stroke="#e8e0d0" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  plane: '<svg viewBox="0 0 16 16"><circle cx="5.8" cy="8.4" r="4.4" fill="url(#ai-arcanus)" stroke="#0e2a66" stroke-width=".5"/><circle cx="10.6" cy="7" r="3.9" fill="url(#ai-myrror)" stroke="#2a1060" stroke-width=".5" opacity=".95"/><ellipse cx="8" cy="8" rx="7.4" ry="2.1" fill="none" stroke="url(#ai-goldl)" stroke-width=".8" transform="rotate(-18 8 8)"/></svg>',
  sound: '<svg viewBox="0 0 16 16"><path d="M1.8 6 H4.6 L8.8 2.4 V13.6 L4.6 10 H1.8 Z" fill="url(#ai-goldl)" stroke="#5a3a0c" stroke-width=".6" stroke-linejoin="round"/><path d="M10.8 5.4 Q12.6 8 10.8 10.6 M12.6 3.8 Q15.6 8 12.6 12.2" stroke="#f3d27a" stroke-width="1.1" fill="none" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 16 16"><path d="M1.8 6 H4.6 L8.8 2.4 V13.6 L4.6 10 H1.8 Z" fill="#6c6658" stroke="#2c2618" stroke-width=".6" stroke-linejoin="round"/><path d="M11 5.6 L15 10.4 M15 5.6 L11 10.4" stroke="#e35d5d" stroke-width="1.4" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 16 16"><path d="M3.2 3 H12.4 Q13.6 3 13.6 4.4 V12 Q13.6 13.4 12.2 13.4 H4.6" fill="url(#ai-parch)" stroke="#6b5434" stroke-width=".6"/><path d="M3.2 3 Q1.8 3 1.8 4.4 Q1.8 5.8 3.2 5.8 H4.6 V13.4 Q3.2 13.4 3.2 12 Z" fill="#c9ad72" stroke="#6b5434" stroke-width=".6"/><path d="M6.4 6.4 H11.4 M6.4 8.4 H11.4 M6.4 10.4 H10" stroke="#7a5a2a" stroke-width=".8" stroke-linecap="round"/></svg>',
  log: '<svg viewBox="0 0 16 16"><path d="M3.2 3 H12.4 Q13.6 3 13.6 4.4 V12 Q13.6 13.4 12.2 13.4 H4.6" fill="url(#ai-parch)" stroke="#6b5434" stroke-width=".6"/><path d="M3.2 3 Q1.8 3 1.8 4.4 Q1.8 5.8 3.2 5.8 H4.6 V13.4 Q3.2 13.4 3.2 12 Z" fill="#c9ad72" stroke="#6b5434" stroke-width=".6"/><path d="M6.4 6.4 H11.4 M6.4 8.4 H11.4 M6.4 10.4 H10" stroke="#7a5a2a" stroke-width=".8" stroke-linecap="round"/></svg>',
  melee: '<svg viewBox="0 0 16 16"><path d="M13.8 1.4 L14.6 2.2 L6.6 10.4 L5.6 9.4 Z" fill="url(#ai-steel)" stroke="#4a5262" stroke-width=".5"/><path d="M13.8 1.4 L6.1 9.9" stroke="#fff" stroke-width=".4" opacity=".7"/><path d="M3.6 8.2 L7.8 12.4" stroke="url(#ai-goldl)" stroke-width="1.5" stroke-linecap="round"/><path d="M5.4 10.6 L2.6 13.4" stroke="url(#ai-leather)" stroke-width="1.6" stroke-linecap="round"/><circle cx="2.2" cy="13.8" r=".9" fill="url(#ai-gold)"/></svg>',
  def: '<svg viewBox="0 0 16 16"><path d="M8 .9 L14.2 3 V8 Q14.2 13 8 15.2 Q1.8 13 1.8 8 V3 Z" fill="url(#ai-shield)" stroke="url(#ai-goldl)" stroke-width="1"/><path d="M8 2.6 V13.4 M3.4 7 H12.6" stroke="#e9d9a6" stroke-width=".9" opacity=".85"/><path d="M8 .9 L14.2 3 V8 Q14.2 9 14 9.8 Q11 5 8 .9 Z" fill="#fff" opacity=".18"/></svg>',
  res: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="#1a2234" stroke="url(#ai-steel)" stroke-width=".9"/><path d="M6.5 2.6 H9.5 V6.5 H13.4 V9.5 H9.5 V13.4 H6.5 V9.5 H2.6 V6.5 H6.5 Z" fill="url(#ai-steel)" stroke="#4a5262" stroke-width=".4"/><circle cx="8" cy="8" r="1.2" fill="#9ad0ff"/></svg>',
  hp: '<svg viewBox="0 0 16 16"><path d="M8 14.4 L2.2 8.6 Q-.4 5 3.2 2.8 Q6.4 1.6 8 4.8 Q9.6 1.6 12.8 2.8 Q16.4 5 13.8 8.6 Z" fill="url(#ai-red)" stroke="#5a0a0a" stroke-width=".6" stroke-linejoin="round"/><ellipse cx="4.6" cy="5" rx="1.4" ry=".8" fill="#fff" opacity=".6" transform="rotate(-35 4.6 5)"/></svg>',
  move: '<svg viewBox="0 0 16 16"><path d="M5 1.6 H9.4 V8.6 Q13.6 9.2 14.4 12 V14.2 H3.4 Q2.6 14.2 2.8 13 L4.2 8.6 Z" fill="url(#ai-leather)" stroke="#2a1404" stroke-width=".6" stroke-linejoin="round"/><path d="M4.4 3.8 H9.4 M3.6 12.2 H14.4" stroke="url(#ai-goldl)" stroke-width=".9"/></svg>',
  fly: '<svg viewBox="0 0 16 16"><path d="M8 11 Q5 5.6 .6 6.4 Q2.6 7.4 2.2 8.6 Q4 8.4 4.6 9.6 Q6 9.6 8 11 Q10 9.6 11.4 9.6 Q12 8.4 13.8 8.6 Q13.4 7.4 15.4 6.4 Q11 5.6 8 11 Z" fill="url(#ai-steel)" stroke="#4a5262" stroke-width=".5" stroke-linejoin="round"/></svg>',
  ranged: '<svg viewBox="0 0 16 16"><path d="M3.4 1.6 Q13.4 8 3.4 14.4" fill="none" stroke="url(#ai-wood)" stroke-width="1.6" stroke-linecap="round"/><path d="M3.4 1.6 V14.4" stroke="#e8e0d0" stroke-width=".5"/><path d="M1.6 8 H14" stroke="#c8b48a" stroke-width=".8"/><path d="M15 8 L12.4 6.6 L12.4 9.4 Z" fill="url(#ai-steel)"/><path d="M1.2 6.8 L3 8 L1.2 9.2" stroke="#d14a3a" stroke-width=".9" fill="none"/></svg>',
  magic: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.8" fill="#ff9a4a" opacity=".22"/><circle cx="8" cy="8" r="4.6" fill="url(#ai-fire)"/>' + SPARK(8, 8, 6.6, 'rgba(255,240,200,.55)') + '</svg>',
  figs: '<svg viewBox="0 0 16 16"><path d="M2 14 Q2 9.8 5.2 9.8 Q8.4 9.8 8.4 14 Z M7.6 14 Q7.6 9.8 10.8 9.8 Q14 9.8 14 14 Z" fill="url(#ai-shield)" stroke="#2c3c58" stroke-width=".5"/><path d="M3.2 7.6 Q3.2 4.4 5.2 4.4 Q7.2 4.4 7.2 7.6 Z M8.8 7.6 Q8.8 4.4 10.8 4.4 Q12.8 4.4 12.8 7.6 Z" fill="url(#ai-steel)" stroke="#4a5262" stroke-width=".5"/><path d="M5.2 4.4 V2.8 M10.8 4.4 V2.8" stroke="#d14a3a" stroke-width="1"/></svg>',
});
function icon(name, cls) { return '<span class="ic ' + (cls || '') + '" style="display:inline-flex">' + (ICONS[name] || '') + '</span>'; }
