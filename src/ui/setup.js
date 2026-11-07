'use strict';
// Écran titre et création du sorcier.

const Setup = {
  titleScreen() {
    UI.closeAll();
    const old = $('.title-screen'); if (old) old.remove();
    App.game = null;
    const hasAuto = !!localStorage.getItem('arcanes:auto'), hasManual = !!localStorage.getItem('arcanes:manual');
    const meta = s => { try { const m = JSON.parse(localStorage.getItem('arcanes:' + s + ':meta')); return m ? m.name + ', tour ' + m.turn : ''; } catch (e) { return ''; } };
    const scr = h('div', { class: 'title-screen' },
      h('div', { style: 'text-align:center' },
        h('div', { class: 'logo' }, 'ARCANES'),
        h('div', { class: 'sub' }, 'Deux plans, quatorze sorciers, une seule maîtrise'),
        h('div', { class: 'title-actions', style: 'display:flex;flex-direction:column;gap:10px;width:320px;margin:0 auto' },
          h('button', { class: 'btn primary', style: 'height:46px;font-size:16px', onclick: () => Setup.newGame() }, 'Nouvelle partie'),
          hasAuto ? h('button', { class: 'btn', style: 'height:40px', onclick: () => { scr.remove(); App.load('auto'); } }, 'Continuer (' + meta('auto') + ')') : null,
          hasManual ? h('button', { class: 'btn', style: 'height:40px', onclick: () => { scr.remove(); App.load('manual'); } }, 'Charger la sauvegarde (' + meta('manual') + ')') : null,
          localStorage.getItem('arcanes:prev') ? h('button', { class: 'btn', style: 'height:40px', onclick: () => { scr.remove(); App.load('prev'); } }, 'Partie précédente (' + meta('prev') + ')') : null,
          h('button', { class: 'btn ghost', style: 'height:36px', onclick: () => Setup.importFile(scr) }, 'Importer un fichier…'),
        ),
        h('div', { class: 'dim credits', style: 'margin-top:30px;font-size:11.5px;max-width:520px' }, 'v' + GAME_VERSION + ' · Règles inspirées de Master of Magic (1994). Données de règles : projet open source kazzmir/master-of-magic (BSD-3). Graphismes générés pour Arcanes ; icônes de sorts : tuiles CC0 de Dungeon Crawl Stone Soup. Musique composée pour Arcanes, jouée avec la SoundFont GeneralUser GS de S. Christian Collins.')));
    const bg = h('canvas', { class: 'title-bg' });
    scr.prepend(bg);
    // la langue (celle du navigateur par défaut)
    if (I18N.available().length > 1) {
      const sel = h('select', { class: 'lang-pick', title: 'Langue', onchange: e => I18N.switchTo(e.target.value) }, ...I18N.available().map(l => h('option', { value: l.id, selected: l.id === I18N.lang }, l.name)));
      scr.append(sel);
    }
    // même contexte d'empilement que les fenêtres, pour que la création de partie s'affiche par-dessus
    ($('#modal-root').parentNode || document.body).append(scr);
    Update.titleButton(scr);
    Setup.titleGate(scr);
    setTimeout(() => Setup.titleBackground(scr, bg), 30);
  },

  // 0.31.28 : la musique du titre. Le navigateur ne laisse partir le son qu'après un geste du joueur ; on essaie d'abord sans
  // (un site déjà fréquenté y a souvent droit), et s'il refuse, l'écran s'ouvre d'un clic, ce qui lance la musique
  titleGate(scr) {
    if (!Sfx.music || !Music.hasTracks() || Music.playing) return;
    const start = () => { Sfx.ensure(); Music.start(); };
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;   // (tests automatisés : pas de voile)
    let probe; try { probe = new Audio(Music.base + 'titre.ogg'); probe.volume = 0.001; } catch (e) { return; }
    const gate = () => {
      if (!scr.isConnected || scr.querySelector('.title-gate') || Music.playing) return;
      scr.classList.add('gated');
      const g = h('div', { class: 'title-gate' }, h('div', { class: 'gate-text' }, 'Cliquez pour entrer'));
      const open = e => { if (!g.isConnected) return; if (e) { e.preventDefault(); e.stopPropagation(); } start(); scr.classList.remove('gated'); g.classList.add('out'); setTimeout(() => g.remove(), 800); window.removeEventListener('keydown', open, true); };
      g.addEventListener('click', open);
      window.addEventListener('keydown', open, true);
      scr.append(g);
    };
    const p = probe.play();
    const stopProbe = () => { try { probe.pause(); probe.removeAttribute('src'); probe.load(); } catch (e) { /* rien */ } };
    if (p && p.then) p.then(() => { stopProbe(); start(); }).catch(() => { stopProbe(); gate(); });
    else { stopProbe(); gate(); }
  },

  // fond animé : un monde généré pour l'occasion, survolé lentement, et des étincelles de magie
  titleBackground(scr, cv) {
    // l'illustration de l'écran titre si elle est là, sinon un monde généré pour l'occasion
    let layer = Sprites.title, art = !!layer;
    if (!art) {
      try {
        const seed = (Math.random() * 1e9) >>> 0;
        const demo = { rng: new RNG(seed), turn: 1, cities: {}, units: {}, players: [], sites: [] };
        MapGen.generate(demo, { mapW: 60, mapH: 40, landSize: 'large' });
        layer = MapView.renderLayer(demo.world, 0);
      } catch (e) { console.warn('fond titre', e); return; }
    }
    const ctx = cv.getContext('2d');
    const motes = [];
    const cols = Object.values(REALM_COLORS);
    const t0 = performance.now();
    const frame = () => {
      if (!scr.isConnected) return;
      const W = innerWidth, H = innerHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = !art; ctx.imageSmoothingQuality = 'high';
      const t = (performance.now() - t0) / 1000;
      if (art) {
        // illustration plein écran, lent zoom avant
        const z = 1.04 + Math.sin(t / 18) * .03, sc = Math.max(W / layer.width, H / layer.height) * z;
        const dw = layer.width * sc, dh = layer.height * sc;
        ctx.imageSmoothingEnabled = sc < 1;
        ctx.drawImage(layer, (W - dw) / 2, (H - dh) / 2 + Math.sin(t / 25) * 8, dw, dh);
        const g = ctx.createRadialGradient(W / 2, H * .45, H * .12, W / 2, H / 2, Math.max(W, H) * .78);
        g.addColorStop(0, 'rgba(8,10,16,.55)'); g.addColorStop(.6, 'rgba(8,10,16,.35)'); g.addColorStop(1, 'rgba(4,5,8,.85)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      } else {
      // survol lent : la carte se déplace en diagonale, en boucle (le monde est cylindrique)
      const scale = Math.max(W / (layer.width * .62), H / (layer.height * .62));
      const sw = W / scale, sh = H / scale;
      const ox = (t * 9) % layer.width, oy = (layer.height - sh) / 2 + Math.sin(t / 23) * (layer.height - sh) * .35;
      for (const dx of [0, layer.width]) {
        const sx = ox - dx;
        if (sx + sw < 0 || sx > layer.width) continue;
        ctx.drawImage(layer, 0, 0, layer.width, layer.height, -sx * scale, -oy * scale, layer.width * scale, layer.height * scale);
      }
      // voile sombre et vignette
      const g = ctx.createRadialGradient(W / 2, H * .42, H * .1, W / 2, H / 2, Math.max(W, H) * .75);
      g.addColorStop(0, 'rgba(10,14,22,.66)'); g.addColorStop(.55, 'rgba(8,10,16,.8)'); g.addColorStop(1, 'rgba(4,5,8,.96)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      // étincelles des cinq royaumes
      if (motes.length < 70 && Math.random() < .5) motes.push({ x: Math.random() * W, y: H + 10, vy: .25 + Math.random() * .6, vx: (Math.random() - .5) * .25, r: 1 + Math.random() * 2.2, c: cols[Math.floor(Math.random() * cols.length)], ph: Math.random() * 6 });
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i]; m.y -= m.vy; m.x += m.vx + Math.sin(t * 1.3 + m.ph) * .25;
        if (m.y < -10) { motes.splice(i, 1); continue; }
        const a = Math.min(1, (H - m.y) / 200) * (.45 + .35 * Math.sin(t * 3 + m.ph));
        ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = m.c; ctx.shadowColor = m.c; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      requestAnimationFrame(frame);
    };
    cv.style.opacity = 0; requestAnimationFrame(() => { cv.style.transition = 'opacity 1.6s'; cv.style.opacity = 1; });
    frame();
  },
  importFile(scr) {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const g = App.deserialize(r.result); if (scr) scr.remove(); App.start(g); } catch (e) { UI.toast('Fichier invalide.', 'warn'); } }; r.readAsText(f); };
    inp.click();
  },
  loadMenu() {
    const opts = ['auto', 'manual', 'prev'].filter(s => localStorage.getItem('arcanes:' + s));
    const meta = s => { const m = App.saveMeta(s); return m ? ' (' + m.name + ', tour ' + m.turn + ')' : ''; };
    const name = { auto: 'Automatique', manual: 'Manuelle', prev: 'Partie précédente' };
    UI.choice('Charger', opts.length ? 'Quelle sauvegarde reprendre ?' : 'Aucune sauvegarde dans ce navigateur.', opts.map(s => ({ label: name[s] + meta(s), value: s })).concat([{ label: 'Importer un fichier…', value: 'file' }]))
      .then(v => { if (v === 'file') Setup.importFile(null); else if (v) App.load(v); });
  },

  newGame() {
    const st = {
      mode: 'preset', preset: 0, name: 'Morwen', portrait: 0, books: { life: 0, death: 0, chaos: 0, nature: 0, sorcery: 0 }, retorts: [], race: 'highmen',
      difficulty: 'normal', landSize: 'medium', mapSize: 'normal', opponents: 3, seed: '', color: 0, mountainsBlock: true, crisis: 'normal', finale: 'random',
    };
    Setup.applyPreset(st, 0);
    const body = h('div');
    const m = UI.modal({ title: 'Nouvelle partie', width: 1040, body, noClose: false, onClose: () => { if (!App.game && !st.launching && !$('.title-screen')) Setup.titleScreen(); },
      footer: [h('span', { class: 'muted', id: 'ng-picks', style: 'margin-right:auto' }), h('button', { class: 'btn primary', id: 'ng-go', onclick: () => Setup.launch(st, m) }, 'Commencer la partie')] });
    const render = () => {
      body.innerHTML = '';
      // sorciers prédéfinis
      const pick = h('div', { class: 'wizpick' });
      DATA.wizards.forEach((w, i) => {
        const el = h('div', { class: 'w' + (st.mode === 'preset' && st.preset === i ? ' on' : '') }, spriteCanvas('wizard:' + w.portrait, 32), h('div', { style: 'font-size:12px' }, w.name), h('div', { class: 'wbooks', style: 'display:flex;gap:1px;justify-content:center;margin-top:2px' }, ...REALMS5.flatMap(r => Array.from({ length: w.books[r] || 0 }, () => h('span', { class: r, style: 'width:4px;height:8px;background:' + REALM_COLORS[r] + ';' + UI.solid(REALM_COLORS[r]) + 'display:inline-block' })))));
        el.onclick = () => { Setup.applyPreset(st, i); render(); };
        UI.tipOn(el, () => '<h4>' + w.name + '</h4>' + REALMS5.filter(r => w.books[r]).map(r => w.books[r] + ' ' + REALM_NAMES[r]).join(', ') + (w.retorts.length ? '<br>' + w.retorts.map(r => DATA.retorts[r].name).join(', ') : ''));
        pick.append(el);
      });
      // personnalisation
      const nameIn = h('input', { type: 'text', value: st.name, style: 'width:180px' }); nameIn.oninput = () => { st.name = nameIn.value; const go = $('#ng-go'); if (go) go.disabled = Setup.picks(st) !== 11 || !st.name.trim(); };
      const portraits = h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' }, ...DATA.wizards.map((w, i) => { const c = spriteCanvas('wizard:' + i, 32); c.style.cssText = 'width:36px;height:36px;border-radius:5px;cursor:pointer;border:2px solid ' + (st.portrait === i ? 'var(--gold)' : 'transparent'); c.onclick = () => { st.portrait = i; render(); }; return c; }));
      const colors = h('div', { style: 'display:flex;gap:5px' }, ...PLAYER_COLORS.slice(0, 6).map((c, i) => h('span', { style: 'width:22px;height:22px;border-radius:50%;cursor:pointer;background:' + c + ';border:2px solid ' + (st.color === i ? '#fff' : 'transparent'), onclick: () => { st.color = i; render(); } })));
      const books = h('div', { class: 'books' });
      for (const r of REALMS5) {
        const row = h('div', { class: 'bookrow' }, h('span', { class: 'nm', style: 'color:' + REALM_COLORS[r] }, REALM_NAMES[r]));
        const bk = h('div', { class: 'bk ' + r, style: 'color:' + REALM_COLORS[r] });
        for (let i = 1; i <= 11; i++) { const b = h('i', { class: i <= st.books[r] ? 'on' : '', style: UI.solid(REALM_COLORS[r]) }); b.onclick = () => Setup.setBooks(st, r, st.books[r] === i ? i - 1 : i, render); bk.append(b); }
        row.append(bk, h('span', { class: 'dim', style: 'width:28px;text-align:right' }, st.books[r]));
        UI.tipOn(row, () => Setup.realmTip(r, st.books[r]));
        books.append(row);
      }
      const retorts = h('div');
      for (const [k, r] of Object.entries(DATA.retorts)) {
        const ok = Setup.retortAllowed(st, k);
        const el = h('span', { class: 'retort' + (st.retorts.includes(k) ? ' on' : '') + (!ok && !st.retorts.includes(k) ? ' dis' : '') }, r.name + ' (' + r.cost + ')');
        el.onclick = () => { if (st.retorts.includes(k)) st.retorts = st.retorts.filter(x => x !== k); else if (ok) st.retorts.push(k); st.mode = 'custom'; Setup.fixRace(st); render(); };
        UI.tipOn(el, () => '<h4>' + r.name + ' · ' + r.cost + ' choix</h4>' + U.esc(r.desc) + Setup.reqText(r));
        retorts.append(el);
      }
      const myr = st.retorts.includes('myrran');
      const races = h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px' }, ...Object.values(DATA.races).filter(r => myr ? r.plane === 'myrror' : r.plane === 'arcanus').map(r => { const el = h('span', { class: 'retort' + (st.race === r.id ? ' on' : '') }, r.name + (r.plane === 'myrror' ? ' ✦' : '')); el.onclick = () => { st.race = r.id; render(); }; UI.tipOn(el, () => '<h4>' + r.name + '</h4>' + U.esc(r.desc) + '<div class="muted" style="margin-top:4px">' + (r.traits || []).map(U.esc).join('<br>') + '</div>'); return el; }));
      const sel = (label, key, opts) => h('label', { style: 'display:flex;flex-direction:column;gap:3px' }, h('span', { class: 'muted', style: 'font-size:12px' }, label), (() => { const s = h('select', null, ...opts.map(([v, t]) => h('option', { value: v, selected: String(st[key]) === String(v) }, t))); s.onchange = () => { st[key] = isNaN(+s.value) ? s.value : +s.value; }; return s; })());
      const seedIn = h('input', { type: 'text', placeholder: 'aléatoire', value: st.seed, style: 'width:110px' }); seedIn.oninput = () => { st.seed = seedIn.value; };
      body.append(
        h('div', { class: 'sect' }, h('h4', null, 'Choisir un sorcier'), pick),
        h('div', { class: 'grid2' },
          h('div', null,
            h('div', { class: 'sect' }, h('h4', null, 'Identité'), h('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:6px' }, nameIn, colors), portraits),
            h('div', { class: 'sect' }, h('h4', null, 'Livres de magie'), books, h('div', { class: 'dim', style: 'font-size:11.5px;margin-top:4px' }, 'Vie et Mort s\'excluent. Plus de livres dans un royaume = plus de sorts accessibles et des sorts rares ; à partir de 8 livres, ces sorts coûtent moins cher.'))),
          h('div', null,
            h('div', { class: 'sect' }, h('h4', null, 'Dons'), retorts),
            h('div', { class: 'sect' }, h('h4', null, 'Race de la capitale'), races),
            h('div', { class: 'sect' }, h('h4', null, 'Partie'), h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end' },
              (() => { const l = sel('Difficulté', 'difficulty', AI.LEVELS.map(k => [k, AI.LEVEL_NAMES[k]])); UI.tipOn(l, () => Setup.difficultyTip(st.difficulty)); return l; })(),
              sel('Taille de la carte', 'mapSize', Object.entries(MAP_SIZES).map(([k, v]) => [k, v.name + ' · ' + v.w + '×' + v.h])),
              sel('Terres émergées', 'landSize', [['small', 'Peu'], ['medium', 'Moyennes'], ['large', 'Beaucoup']]),
              sel('Adversaires sur votre plan', 'opponents', [[1, '1'], [2, '2'], [3, '3'], [4, '4']]),
              sel('La Crise', 'crisis', [['normal', 'Vers le tour 150'], ['early', 'Précoce : tour 100'], ['late', 'Tardive : tour 200'], ['off', 'Désactivée']]),
              (() => { const l = sel('Crise de fin', 'finale', [['random', 'Contre le meneur'], ['off', 'Désactivée']]); UI.tipOn(l, () => 'Après le tour 200, si un sorcier écrase la partie, une crise tirée au sort se lève contre lui.'); return l; })(),
              h('label', { style: 'display:flex;flex-direction:column;gap:3px' }, h('span', { class: 'muted', style: 'font-size:12px' }, 'Graine'), seedIn)),
              (() => { const cb = h('input', { type: 'checkbox', id: 'ng-mtn' }); cb.checked = st.mountainsBlock; cb.onchange = () => { st.mountainsBlock = cb.checked; };
                const lab = h('label', { style: 'display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:13px;cursor:pointer' }, cb, h('span', null, 'Montagnes infranchissables sans route', h('div', { class: 'dim', style: 'font-size:11.5px' }, 'Seuls les volants, les montagnards (nains…) et les ingénieurs y passent ; une route ouvre le col à tous.')));
                return lab; })()))),
      );
      const used = Setup.picks(st);
      const pc = $('#ng-picks'); if (pc) pc.innerHTML = 'Choix utilisés : <b class="' + (used === 11 ? 'ok' : 'danger') + '">' + used + ' / 11</b>';
      const go = $('#ng-go'); if (go) go.disabled = used !== 11 || !st.name.trim();
    };
    Setup.render = render;
    render();
  },
  // ---------- explications au survol ----------
  REALM_BLURB: {
    life: 'Protection, guérison et foi. Renforce vos troupes (Héroïsme, Arme bénie, Prière, Invulnérabilité), les soigne (Guérison, Guérison de masse), fait prospérer les cités (Prospérité, Source de vie, Consécration) et frappe morts-vivants et démons (Exorcisme, Parole sacrée). Peu de dégâts directs ; des créatures rares mais nobles (Licornes, Ange, Archange).',
    death: 'Nécromancie et malédictions. Lève des morts-vivants (Squelettes, Goules, Spectres, Animation des morts), affaiblit ou tue sans combattre (Faiblesse, Sommeil noir, Drain de vie, Mot de mort), ruine les cités adverses (Famine, Pestilence, Terres maudites) et invoque des démons (Seigneur démon). Ses troupes craignent la magie de Vie.',
    chaos: 'Feu, foudre et destruction. Les meilleurs sorts de dégâts (Trait de feu, Éclair, Boule de feu, Trait funeste, Pluie de météores), des créatures brutales (Chiens infernaux, Chimères, Éfrit, Grand Drake, Hydre) et de quoi ruiner l\'ennemi (Corruption, Bois tordu, Bris d\'armes, Armageddon). Presque rien pour soigner ou protéger.',
    nature: 'La terre, les bêtes et l\'endurance. Rend vos troupes très résistantes (Peau de pierre, Peau de fer, Régénération), entrave l\'ennemi (Toile, Bourbier, Pétrification), fait fructifier les cités (Bénédiction de Gaïa, Modelage du terrain, Mur de pierre) et invoque des créatures solides (Ours de guerre, Géant de pierre, Béhémoth, Grande Vouivre, Colosse).',
    sorcery: 'Air, illusions et contre-magie. Le royaume qui défait la magie des autres (Contre-magie, Brise-sort, Suppression de la magie), donne la mobilité (Vol, Célérité, Invisibilité), trouble les esprits (Confusion, Tempête mentale) et invoque créatures de l\'air et illusions (Nagas, Guerriers fantômes, Djinn, Drake céleste).',
  },
  realmTip(r, n) {
    const RAR = [['common', 'commun'], ['uncommon', 'peu commun'], ['rare', 'rare'], ['veryrare', 'très rare']];
    const pl = (k, l) => k + ' ' + (k > 1 ? l.replace(/(\w+)$/, '$1s') : l);
    let html = '<h4 style="color:' + REALM_COLORS[r] + '">' + REALM_NAMES[r] + '</h4><div style="max-width:380px">' + Setup.REALM_BLURB[r] + '</div>';
    if (r === 'life' || r === 'death') html += '<div class="dim" style="margin-top:4px">Incompatible avec la ' + (r === 'life' ? 'Mort' : 'Vie') + ' : prendre l\'un retire l\'autre.</div>';
    if (r === 'chaos' || r === 'nature' || r === 'sorcery') html += '<div class="dim" style="margin-top:4px">Ses nœuds naissent ' + { chaos: 'dans les montagnes et les collines', nature: 'dans les forêts et les prairies', sorcery: 'dans les prairies et au bord des rivières' }[r] + '. Lors d\'un combat livré sur l\'un d\'eux, ses créatures gagnent +2 en attaque, défense et résistance, et ses sorts échappent au flux du nœud.</div>';
    const pc = k => k > 0 ? Magic.poolCounts(k, r) : { common: 0, uncommon: 0, rare: 0, veryrare: 0 };
    const now = pc(n), nxt = n < 11 ? pc(n + 1) : null, g = n > 0 ? Magic.guaranteed(n) : { common: 0, uncommon: 0, rare: 0, veryrare: 0 };
    html += '<div style="margin-top:6px"><b>' + (n ? 'Avec ' + U.n(n, 'livre') : 'Aucun livre') + '</b> : ' + (n ? RAR.map(([k, l]) => pl(now[k], l)).join(', ') + ' accessibles (sur ' + (tot => tot.every(t => t === tot[0]) ? tot[0] + ' de chaque' : tot.join(', '))(RAR.map(([k]) => Magic.spellsOf(r, k).length)) + ')' + (U.sum(Object.values(g)) ? ', dont ' + U.sum(Object.values(g)) + ' connus dès le départ' : '') : 'aucun sort de ce royaume') + '.</div>';
    if (nxt) { const add = RAR.filter(([k]) => nxt[k] > now[k]).map(([k, l]) => '+' + pl(nxt[k] - now[k], l)); if (add.length) html += '<div class="dim">Un livre de plus : ' + add.join(', ') + '.</div>'; }
    html += '<div class="dim">Au-delà de 7 livres, chaque livre accélère la recherche de ce royaume de 10 % et baisse le coût de ses sorts de 10 %' + (n > 7 ? ' (ici ' + (n - 7) * 10 + ' %)' : '') + '.</div>';
    const rets = Object.values(DATA.retorts).filter(x => x.req && x.req.realms && x.req.realms[r] >= 4);
    if (rets.length) html += '<div class="dim">Débloque à ' + rets[0].req.realms[r] + ' livres : ' + rets.map(x => x.name).join(', ') + '.</div>';
    return html;
  },
  difficultyTip(cur) {
    const L = [['easy', 'Vous partez avec 250 or et 100 mana (vos rivaux, 150 et 50). Les rivaux jouent l\'IA historique d\'Arcanes, plus simple.'],
      ['normal', 'Personne n\'a d\'avantage. Les rivaux fondent dès 3 habitants, choisissent leurs sites parmi les terres explorées sans viser à deux le même, envoient leurs colons seuls quand aucun danger n\'est en vue, lèvent les troupes les plus fortes par point d\'entretien en tenant compte de votre armée, lient les nœuds libres et vont vider les nœuds gardés, équipent leurs héros, défendent une cité menacée (murs magiques, défenseur acheté) et suivent un plan (expansion, campagne, défense) que leurs émissaires laissent entendre. Ils font la paix quand la guerre leur coûte trop. En combat, ils frappent là où leurs coups portent le plus, contournent pour prendre de flanc ou de dos, dosent leurs sorts, mettent leurs héros blessés à l\'abri et fuient une bataille perdue d\'avance.'],
      ['hard', 'Comme Normale, et ils se liguent contre le sorcier qui écrase la partie. En meilleurs gestionnaires : chaque bâtiment est choisi pour ce qu\'il rapporte, l\'impôt et la part de puissance s\'ajustent aux besoins, la recherche vise les invocations qui surpassent les leurs, et les renforts arrivent avant l\'ennemi qu\'ils ont vu venir. Ils lancent aussi leurs héros à l\'assaut de leur légende et passent sur l\'autre plan par les tours de magie.'],
      ['hardcore', 'Comme Difficile, en prédateurs : armées composées pour vaincre la cité qu\'ils visent, guerre dès un léger avantage, plus encore quand vous êtes déjà pris ailleurs, mais une seule à la fois ; chasse aux colons, ingénieurs et héros sans escorte ; exigences au pire moment pour vous ; plusieurs fronts ouverts à la fois ; malédiction de la cité qu\'ils vont assaillir ; héros engagés dès qu\'ils peuvent les payer.']];
    return '<h4>Difficulté</h4><div style="max-width:430px">' + L.map(([k, t]) => '<div style="margin-bottom:4px"' + (k === cur ? ' class="gold"' : ' class="dim"') + '><b>' + AI.LEVEL_NAMES[k] + '</b> : ' + t + '</div>').join('')
      + '<div class="ok" style="margin-top:6px">Aucun niveau ne triche : mêmes règles que vous, sans bonus de production, de recherche ni de ressources, et les rivaux ne savent que ce que leurs troupes et leurs cités voient, ou ont vu.</div></div>';
  },
  applyPreset(st, i) {
    const w = DATA.wizards[i];
    st.mode = 'preset'; st.preset = i; st.name = w.name; st.portrait = w.portrait;
    st.books = Object.assign({ life: 0, death: 0, chaos: 0, nature: 0, sorcery: 0 }, w.books);
    st.retorts = w.retorts.slice();
    Setup.fixRace(st);
  },
  fixRace(st) {
    const myr = st.retorts.includes('myrran');
    if (!myr && DATA.races[st.race].plane === 'myrror') st.race = 'highmen';
    if (myr && DATA.races[st.race].plane !== 'myrror') st.race = 'darkelf';
  },
  picks(st) { return U.sum(Object.values(st.books)) + U.sum(st.retorts, r => DATA.retorts[r].cost); },
  setBooks(st, realm, n, render) {
    const other = realm === 'life' ? 'death' : realm === 'death' ? 'life' : null;
    const before = Object.assign({}, st.books);
    st.books[realm] = n;
    if (other && n > 0) st.books[other] = 0;
    if (Setup.picks(st) > 11) { st.books = before; render(); return; }   // refusé : rien ne change
    st.mode = 'custom';
    st.retorts = st.retorts.filter(r => Setup.retortAllowed(st, r, true));
    render();
  },
  reqText(r) {
    const q = r.req || {}; const parts = [];
    if (q.books) parts.push(q.books + ' livres dans un même royaume');
    if (q.realms) parts.push(Object.entries(q.realms).map(([k, v]) => v + ' ' + REALM_NAMES[k]).join(' et '));
    if (q.distinctRealms) parts.push(U.n(q.booksEach, 'livre') + ' dans ' + q.distinctRealms + ' royaumes');
    return parts.length ? '<div class="dim" style="margin-top:4px">Requiert : ' + parts.join(', ') + '</div>' : '';
  },
  retortAllowed(st, k, ignoreCost) {
    const r = DATA.retorts[k]; const q = r.req || {};
    if (!ignoreCost && Setup.picks(st) + r.cost > 11) return false;
    if (q.books && Math.max(0, ...Object.values(st.books)) < q.books) return false;   // dans un même royaume
    if (q.realms) for (const [rr, v] of Object.entries(q.realms)) if ((st.books[rr] || 0) < v) return false;
    if (q.distinctRealms && REALMS5.filter(rr => (st.books[rr] || 0) >= (q.booksEach || 1)).length < q.distinctRealms) return false;
    return true;
  },
  launch(st, m) {
    if (Setup.picks(st) !== 11 || !String(st.name || '').trim()) return;
    st.launching = true;
    m.close();
    const seed = st.seed ? (parseInt(st.seed, 10) || Array.from(st.seed).reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7)) >>> 0 : undefined;
    UI.setBusy('Façonnage des deux plans…');
    setTimeout(() => {
      try {
        const ms = MAP_SIZES[st.mapSize] || MAP_SIZES.normal;
        const game = Game.newGame({ seed, mapW: ms.w, mapH: ms.h, landSize: st.landSize, opponents: st.opponents, difficulty: st.difficulty, mountainsBlock: st.mountainsBlock, crisis: st.crisis, finale: st.finale,
          human: { name: st.name.trim(), portrait: st.portrait, books: st.books, retorts: st.retorts, race: st.race } });
        // couleur choisie
        const human = game.players[0];
        const c = PLAYER_COLORS[st.color];
        const clash = game.players.find(p => p !== human && p.color === c);
        if (clash) clash.color = human.color;
        human.color = c;
        UI.setBusy(null);
        App.start(game, { intro: true });
      } catch (e) { UI.setBusy(null); console.error(e); UI.toast('Erreur de création : ' + U.esc(e.message), 'warn'); }
    }, 50);
  },
  intro(game) {
    const pl = game.players[App.pid];
    const fc = game.cities[pl.fortress];
    // seuls les rivaux de son propre plan sont annoncés : ceux de l'autre plan sont une surprise
    const n = game.players.filter(o => o !== pl && o.plane === pl.plane).length;
    const rivals = n === 1 ? 'Un sorcier rival convoite' : (['', '', 'Deux', 'Trois', 'Quatre', 'Cinq'][n] || n) + ' sorciers rivaux convoitent';
    return UI.choice('Bienvenue, ' + pl.name, '<p class="serif" style="font-size:16px">Votre forteresse de <b>' + U.esc(fc.name) + '</b> se dresse sur le plan ' + (fc.plane ? 'du Miroir' : 'd\'Arcane') + '. ' + rivals + ' la maîtrise des deux mondes.</p><p>Explorez, fondez des cités, liez les nœuds magiques et étudiez la magie. On l\'emporte en éliminant tous ses rivaux ou en lançant le <b>Sort de Maîtrise</b>.</p><p class="muted">Clic : sélectionner une pile · double-clic sur une destination : l\'y envoyer · clic droit : désélectionner. Un colon sélectionné affiche les meilleurs sites (★). <b>Entrée</b> termine le tour. Menu ▸ Aide pour les raccourcis.</p>', [{ label: 'Commencer', value: true, primary: true }]);
  },
};
