'use strict';
// Grimoire, recherche et gestion de la puissance magique.

const MagicUI = {
  targeting: null,

  // ---------- grimoire ----------
  spellbook(filterSection) {
    const game = App.game, pl = App.me();
    let tab = filterSection || 'summoning';
    const known = Spells.knownFor ? Spells.knownFor(game, pl) : pl.known;
    const sections = ['summoning', 'special', 'city', 'unit', 'global', 'combat'].concat(known.some(id => DATA.spells[id] && DATA.spells[id].section === 'legend') ? ['legend'] : []);
    const tabs = h('div', { class: 'tabs' });
    const pages = h('div', { class: 'pages' });
    const head = h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' });
    const m = UI.modal({ title: 'Grimoire de ' + pl.name, cls: 'book', body: h('div', null, head, tabs, pages) });
    const render = () => {
      tabs.innerHTML = '';
      for (const s of sections) {
        const n = known.filter(id => DATA.spells[id] && DATA.spells[id].section === s && DATA.spells[id].inGame !== false).length;
        tabs.append(h('div', { class: 'tab' + (s === tab ? ' on' : ''), onclick: () => { tab = s; render(); } }, SECTION_NAMES[s] + ' (' + n + ')'));
      }
      head.innerHTML = '';
      head.append(h('div', { class: 'muted' }, 'Compétence restante ce tour : ', h('b', { class: 'research' }, pl.skillLeft), ' / ' + Magic.totalSkill(game, pl) + ' · Mana : ', h('b', { class: 'mana' }, U.fmt(pl.mana))),
        pl.casting ? h('div', null, 'En cours : ', h('b', null, DATA.spells[pl.casting.id].name), ' ' + pl.casting.progress + '/' + pl.casting.cost + ' ', h('span', { class: Spells.castingTurns(game, pl) === Infinity ? 'danger' : 'gold' }, '· ' + Spells.castingTurnsText(game, pl)),
          Spells.castingWarning(game, pl) ? h('span', { class: 'danger', title: 'L\'incantation n\'avance plus (pas de mana dépensé) tant que la cible ne vaut rien ; elle reprend dès qu\'elle redevient valable.' }, ' · suspendue : ' + Spells.castingWarning(game, pl).replace(/\.$/, '').replace(/^./, ch => ch.toLowerCase())) : null, ' ', MagicUI.canRetarget(game, pl, pl.casting.id) ? h('button', { class: 'abtn', title: 'Viser ailleurs, sans rien perdre du mana investi.', onclick: () => { const id = pl.casting.id; m.close(); MagicUI.beginCast(id); } }, 'Nouvelle cible') : null, ' ', h('button', { class: 'abtn danger', onclick: async () => { const c = pl.casting; if (!c || !await UI.confirm('Abandonner ' + DATA.spells[c.id].name, 'Abandonner l\'incantation ? Vous ne récupérerez que ' + Math.floor(c.progress / 2) + ' mana sur les ' + c.progress + ' investis.', 'Abandonner')) return; Spells.cancelCasting(game, pl); render(); App.refresh(); } }, 'Abandonner')) : h('div', { class: 'dim' }, 'Aucune incantation en cours'));
      pages.innerHTML = '';
      const list = known.filter(id => DATA.spells[id] && DATA.spells[id].section === tab && DATA.spells[id].inGame !== false)
        .sort((a, b) => REALMS_ORDER(DATA.spells[a].realm) - REALMS_ORDER(DATA.spells[b].realm) || (DATA.spells[a].cost || 0) - (DATA.spells[b].cost || 0));
      const half = Math.ceil(list.length / 2);
      const col = (arr) => {
        const p = h('div', { class: 'page' });
        for (const id of arr) {
          const s = DATA.spells[id];
          const castable = Spells.implementedOverland(id) && (!pl.banished || id === 'spell_of_return') && (id !== 'spell_of_return' || pl.banished);
          const cost = s.overland ? Magic.spellCost(game, pl, id, false) : null;
          const skill = Magic.totalSkill(game, pl), mpt = Magic.manaPerTurn(game, pl);
          // la compétence et le mana limitent tous deux l'incantation
          const skT = cost == null || cost <= pl.skillLeft ? 0 : Math.max(1, Math.ceil((cost - pl.skillLeft) / Math.max(1, skill)));
          const mnT = cost == null || cost <= pl.mana ? 0 : mpt > 0 ? Math.max(1, Math.ceil((cost - pl.mana) / mpt)) : Infinity;
          const tt = Math.max(skT, mnT);
          const turns = cost != null ? (tt === 0 ? 'ce tour' : tt === Infinity ? 'mana insuffisant' : (tt + 1) + ' tours') : '';
          const upk = Magic.spellUpkeep(game, pl, id);
          // sans cible à choisir, on sait d'avance si le sort est possible (avatar déjà sur la carte, global déjà actif, six héros…)
          const vt = Spells.overlandTarget(id), bookPre = s.book && typeof Book !== 'undefined' ? Book.validate(game, pl, id, null) : null;
          const pre = bookPre || (castable && s.overland && (vt === 'none' || vt === 'deadHero') ? Spells.validate(game, pl, id, null)
            : castable && id === 'spell_binding' && !game.players.some(o => o !== pl && o.alive && pl.contact[o.id] && o.globals.length) ? { ok: false, why: 'Aucun rival connu n\'entretient d\'enchantement global.' } : { ok: true });
          // une incantation suspendue de ce sort peut recevoir une nouvelle cible
          const retarget = MagicUI.canRetarget(game, pl, id);
          const open = castable && (!pl.casting || retarget) && pre.ok;
          const row = h('div', { class: 'spell' + (open ? '' : ' dis') }, spriteCanvas('spell:' + id, 40),
            h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'nm' }, h('span', { class: 'realmdot', style: 'color:' + REALM_COLORS[s.realm] }), s.name), h('div', { class: 'ds' }, s.desc)),
            h('div', { class: 'cs', style: 'text-align:right' }, cost != null ? cost + ' mana' + (s.kind === 'stackEnchant' ? ' / unité' : '') : (s.combat ? 'Combat ' + Magic.spellCost(game, pl, id, true) : ''), h('div', { style: 'opacity:.75' }, !pre.ok ? 'impossible' : retarget ? 'nouvelle cible' : castable ? turns : s.combat && !s.overland ? 'en combat' : 'non lançable'), upk ? h('div', { style: 'opacity:.75' }, upk + '/tour') : null));
          UI.tipOn(row, () => UI.spellTip(id, pl, game) + (pre.ok ? '' : '<div class="danger" style="margin-top:4px">' + U.esc(pre.why) + '</div>'));
          if (open) row.onclick = () => { m.close(); MagicUI.beginCast(id); };
          p.append(row);
        }
        if (!arr.length) p.append(h('div', { class: 'dim', style: 'padding:10px' }, 'Aucun sort connu dans cette section.'));
        return p;
      };
      pages.append(col(list.slice(0, half)), col(list.slice(half)));
    };
    render();
  },

  // l'incantation en cours de ce sort est suspendue faute de cible, et le sort se vise : on peut lui en donner une autre
  canRetarget(game, pl, id) { return !!(pl.casting && pl.casting.id === id && Spells.castingWarning(game, pl) && (Spells.overlandTarget(id) !== 'none' || ['disjunction', 'disjunction_true'].includes(id))); },
  beginCast(id) {
    const game = App.game, pl = App.me();
    const tt = Spells.overlandTarget(id);
    // Disjonction : l'enchantement global visé, avec sa chance d'être brisé
    if (id === 'disjunction' || id === 'disjunction_true') {
      const ts = Spells.disjTargets(game, pl); if (!ts.length) { UI.toast('Aucun enchantement global adverse.', 'warn'); return; }
      const str = (DATA.spells[id].cost || 200) * (id === 'disjunction_true' ? 3 : 1);
      UI.choice('Cible : ' + DATA.spells[id].name, 'Quel enchantement global briser ?', ts.map(x => ({ label: DATA.spells[x.g].name + ' (' + Players.nameFor(game, pl.id, x.o.id) + ', ' + Math.round(Spells.dispelChance(game, str, x.g, x.o.id) * 100) + ' %)', value: x.o.id + '|' + x.g })).concat([{ label: 'Annuler', value: null }]))
        .then(v => { if (v) { const [p, g] = v.split('|'); MagicUI.doCast(id, { player: +p, spell: g }); } });
      return;
    }
    // Captation de sort : l'enchantement global que l'on vole
    if (id === 'spell_binding') {
      const ts = []; for (const o of game.players) if (o !== pl && o.alive && pl.contact[o.id]) for (const g of o.globals) if (DATA.spells[g]) ts.push({ o, g });
      if (!ts.length) { UI.toast('Aucun rival connu n\'entretient d\'enchantement global.', 'warn'); return; }
      UI.choice('Cible : ' + DATA.spells[id].name, 'Quel enchantement global capter ?', ts.map(x => ({ label: DATA.spells[x.g].name + ' (' + x.o.name + ')', value: x.o.id + '|' + x.g })).concat([{ label: 'Annuler', value: null }]))
        .then(v => { if (v) { const [p, g] = v.split('|'); MagicUI.doCast(id, { player: +p, spell: g }); } });
      return;
    }
    if (tt === 'none') return MagicUI.doCast(id, null);
    if (tt === 'enemyWizard') {
      const foes = game.players.filter(o => o.alive && o !== pl && pl.contact[o.id]);
      if (!foes.length) { UI.toast('Aucun sorcier rival connu.', 'warn'); return; }
      // les rivaux où le sort ne servirait à rien : grisés, avec la raison
      const opts = foes.map(o => { const v = Spells.validate(game, pl, id, { player: o.id }); return { label: o.name + (v.ok ? '' : ' : ' + v.why.replace(/\.$/, '').replace(/^./, ch => ch.toLowerCase())), value: o.id, disabled: !v.ok }; });
      UI.choice('Cible : ' + DATA.spells[id].name, 'Choisissez le sorcier visé.', opts.concat([{ label: 'Annuler', value: null }])).then(v => { if (v != null) MagicUI.doCast(id, { player: v }); });
      return;
    }
    if (tt === 'deadHero') {
      // Résurrection : le héros que l'on veut ramener
      const dead = (pl.deadHeroes || []).filter(d => !Object.values(game.units).some(u => u.type === d.type));
      if (dead.length <= 1) return MagicUI.doCast(id, dead.length ? { hero: dead[0].type } : null);
      UI.choice('Résurrection', 'Quel héros ramener d\'entre les morts ?', dead.map(d => ({ label: d.hero.name + (d.hero.title ? ', ' + d.hero.title : '') + ' (' + (HERO_LEVELS[Units.levelIndex(game, { type: d.type, hero: d.hero, xp: d.xp, ench: [], owner: pl.id }) || 0] || { name: '' }).name + ', ' + (d.xp || 0) + ' XP)', value: d.type })).concat([{ label: 'Annuler', value: null }]))
        .then(v => { if (v) MagicUI.doCast(id, { hero: v }); });
      return;
    }
    if (tt === 'friendlyCity' || tt === 'enemyCity') {
      // choix direct dans une liste (plus rapide que la carte)
      const all = Object.values(game.cities).filter(c => tt === 'friendlyCity' ? c.owner === pl.id : (c.owner !== pl.id && pl.explored[c.plane][c.y * game.world.w + c.x]));
      // seulement les cités où le sort ferait quelque chose (Mur de pierre : pas celles qui ont déjà des murailles) ;
      // les autres, regroupées sous la liste avec la raison
      const why = c => { const v = Spells.validate(game, pl, id, { city: c.id, realm: id === 'spell_ward' ? 'chaos' : undefined }); return v.ok ? null : v.why; };
      const cities = all.filter(c => !why(c)), out = all.filter(c => why(c));
      if (!cities.length) {
        const ws = [...new Set(out.map(why))], whose = tt === 'friendlyCity' ? 'vos cités' : 'les cités connues';
        const one = ws.length !== 1 ? 'aucune cité où il servirait.' : !U.fr() ? ws[0] : /^La cité a déjà/.test(ws[0]) ? 'toutes ' + whose + ' ont déjà ' + ws[0].replace(/^La cité a déjà /, '')
          : /^Cet enchantement est déjà actif/.test(ws[0]) ? 'déjà actif dans toutes ' + whose + '.' : ws[0];
        UI.toast(out.length ? DATA.spells[id].name + ' : ' + one : 'Aucune cité ciblable.', 'warn'); return;
      }
      const list = h('div', { class: 'list scroll', style: 'max-height:60vh' });
      const notes = Object.entries(U.groupBy(out, why)).map(([w, cs]) => h('div', { class: 'dim', style: 'font-size:12px;margin-top:8px' },
        U.n(cs.length, 'cité écartée', 'cités écartées') + ' (' + w.replace(/\.$/, '').replace(/^./, x => x.toLowerCase()) + ') : ' + cs.map(c => c.name).join(', ') + '.'));
      const m = UI.modal({ title: DATA.spells[id].name + ' : choisir une cité', width: 520, body: h('div', null, list, ...notes),
        footer: [h('button', { class: 'btn', onclick: () => { m.close(); MagicUI.mapTargetCity(id, tt, cities); } }, 'Choisir sur la carte')] });
      for (const c of cities.sort((a, b) => b.pop - a.pop)) {
        const owner = game.players[c.owner]; let seen;   // ce qu'on voit d'elle en ce moment (une cité hors de vue ne dit ni sa taille ni ses sorts)
        list.append(h('div', { class: 'row', onclick: () => { m.close(); MagicUI.doCast(id, { city: c.id }); } }, h('div', { class: 'grow' }, h('div', { class: 't1' }, c.name), h('div', { class: 't2' }, ((seen = c.owner === pl.id || (MapView.vis && MapView.vis[c.plane][c.y * game.world.w + c.x])) ? Cities.sizeName(c) + ' · ' + U.fmt(c.pop) + ' hab. · ' : 'hors de vue · ') + (owner ? Players.nameFor(game, pl.id, owner.id) : 'indépendante') + (seen && c.ench.length ? ' · ' + c.ench.map(e => DATA.spells[e.spell].name + (e.spell === 'spell_ward' && e.realm ? ' (' + REALM_NAMES[e.realm].toLowerCase() + ')' : '')).join(', ') : '')))));
      }
      return;
    }
    // cibles sur la carte
    MagicUI.targeting = { id, tt };
    // tout sort visé sur la carte : les cases où il servirait, cerclées (sauf ceux qui valent partout, comme Connaissance de la terre)
    const tiles = MagicUI.mapTargets(game, pl, id, tt);
    if (tiles) {
      if (!tiles.length) { MagicUI.targeting = null; UI.toast(DATA.spells[id].name + ' : aucune cible connue où il servirait.', 'warn'); return; }
      MagicUI.targeting.tiles = tiles;
      if (!tiles.some(t => t[0] === MapView.plane)) MapView.centerOn(tiles[0][1], tiles[0][2], tiles[0][0]);
    }
    const graded = tiles && tiles.some(t => t[3]);
    UI.toast('Choisissez la cible de <b>' + DATA.spells[id].name + '</b> sur la carte' + (tiles ? (graded ? ' (or : gain, orange : perte, gris : sans effet)' : ' (cases cerclées d\'or)') : '') + ' (Échap pour annuler).');
    $('#map').style.cursor = 'crosshair';
  },
  RING_ANYWHERE: ['earth_lore'],   // valent sur n'importe quelle case : rien à cercler
  LOSS_RGB: '255,140,70', GAIN_RGB: '255,214,110', NONE_RGB: '170,170,170',
  // les cases à cercler pour un sort visé sur la carte, ou null (pas de cercles)
  mapTargets(game, pl, id, tt) {
    if (MagicUI.RING_ANYWHERE.includes(id)) return null;
    if (tt === 'tile' || tt === 'node') return MagicUI.tileTargets(game, pl, id);
    if (tt === 'friendlyStack') { const out = [], seen = new Set(); for (const u of Object.values(game.units)) { const k = u.plane + ',' + u.x + ',' + u.y; if (u.owner !== pl.id || seen.has(k)) continue; seen.add(k); if (Spells.validate(game, pl, id, { plane: u.plane, x: u.x, y: u.y }).ok) out.push([u.plane, u.x, u.y]); } return out; }
    if (tt === 'friendlyUnit' || tt === 'enemyUnit' || tt === 'anyUnit') {
      const out = [], seen = new Set(), vis = MapView.vis;
      for (const u of Object.values(game.units)) {
        const k = u.plane + ',' + u.x + ',' + u.y; if (seen.has(k)) continue;
        const mine = u.owner === pl.id, visible = mine || (vis && vis[u.plane][u.y * game.world.w + u.x] && !Intel.hiddenFrom(game, pl.id, u));
        if (!visible || (tt === 'friendlyUnit' && !mine) || (tt === 'enemyUnit' && mine)) continue;
        if (Spells.validate(game, pl, id, { unit: u.id }).ok) { seen.add(k); out.push([u.plane, u.x, u.y]); }
      }
      return out;
    }
    return null;
  },
  // les cases où ce sort servirait : piles, cités et lieux connus, filtrés par Spells.validate
  tileTargets(game, pl, id) {
    const seen = new Set(), out = [], w = game.world;
    const tryAt = (p, x, y) => { const k = p + ',' + x + ',' + y; if (seen.has(k)) return; seen.add(k); if (!pl.explored[p][y * w.w + x]) return; if (Spells.validate(game, pl, id, { plane: p, x, y }).ok) out.push([p, x, y]); };
    for (const u of Object.values(game.units)) tryAt(u.plane, u.x, u.y);
    for (const c of Object.values(game.cities)) tryAt(c.plane, c.x, c.y);
    for (const s of game.sites) tryAt(s.plane, s.x, s.y);
    if (id === 'purify_land') for (let p = 0; p < 2; p++) for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (World.get(w, p, 'corrupt', x, y)) tryAt(p, x, y);
    // sorts de terrain : les terres de vos cités (Changement de terrain, Transmutation, Route enchantée), celles des cités
    // ennemies connues (Corruption, Volcan) ; l'Île flottante : l'océan au bord de vos cités et de vos troupes
    const zone = cs => { for (const c of cs) for (const [x, y] of World.catchment(w, c.x, c.y)) tryAt(c.plane, World.wx(w, x), y); };
    if (['corruption', 'raise_volcano'].includes(id)) zone(Object.values(game.cities).filter(c => c.owner !== pl.id && pl.explored[c.plane][c.y * w.w + c.x]));
    else if (DATA.spells[id].kind === 'terrain') zone(Cities.ofPlayer(game, pl.id));
    if (id === 'floating_island') { zone(Cities.ofPlayer(game, pl.id)); for (const u of Object.values(game.units)) if (u.owner === pl.id) for (const [x, y] of World.neighbors(w, u.x, u.y)) if (World.inY(w, y)) tryAt(u.plane, World.wx(w, x), y); }
    // Transmutation, Changement de terrain : chaque case dit d'emblée ce qu'on y gagne (or), ce qu'on y perd (orange), ou rien (gris),
    // avec le principal en quelques signes (t[4])
    if (id === 'transmute' || id === 'change_terrain') for (const t of out) {
      const e = id === 'transmute' ? Spells.transmuteEffect(game, pl, t[0], t[1], t[2]) : Spells.changeTerrainEffect(game, pl, t[0], t[1], t[2]);
      if (!e) continue;
      const g = id === 'transmute' ? (e.gain ? 1 : -1) : e.gain;
      t[3] = g > 0 ? MagicUI.GAIN_RGB : g < 0 ? MagicUI.LOSS_RGB : MagicUI.NONE_RGB; t[4] = e.short || '';
    }
    return out;
  },
  // sort de cité visé sur la carte : les cités où il servirait sont cerclées d'or (MapView)
  mapTargetCity(id, tt, cities) {
    MagicUI.targeting = { id, tt, cities: new Set(cities.map(c => c.id)) };
    if (!cities.some(c => c.plane === MapView.plane)) { const c = U.max(cities, c => c.pop); MapView.centerOn(c.x, c.y, c.plane); }
    UI.toast('Cliquez sur une cité cerclée d\'or pour <b>' + DATA.spells[id].name + '</b> (Échap pour annuler).');
    $('#map').style.cursor = 'crosshair'; App.refresh();
  },
  cancelTarget() { MagicUI.targeting = null; $('#map').style.cursor = ''; },
  pickTarget(plane, x, y) {
    const game = App.game, pl = App.me();
    if (!MagicUI.targeting) return;
    const { id, tt } = MagicUI.targeting;
    if (tt === 'tile' || tt === 'node' || tt === 'friendlyStack') {
      // une case où le sort échouerait : la raison, et la visée reste ouverte
      const v = Spells.validate(game, pl, id, { plane, x, y }); if (!v.ok) { UI.toast(U.esc(v.why), 'warn'); return; }
      MagicUI.cancelTarget(); return MagicUI.doCast(id, { plane, x, y });
    }
    if (tt === 'friendlyCity' || tt === 'enemyCity') {
      const c = Cities.at(game, plane, x, y), ok = c && MagicUI.targeting.cities && MagicUI.targeting.cities.has(c.id);
      if (!ok) { const v = c && c.owner === pl.id ? Spells.validate(game, pl, id, { city: c.id, realm: id === 'spell_ward' ? 'chaos' : undefined }) : null; UI.toast(v && !v.ok ? U.esc(c.name) + ' : ' + U.esc(v.why) : 'Cliquez sur une cité cerclée d\'or.', 'warn'); return; }
      MagicUI.cancelTarget(); return MagicUI.doCast(id, { city: c.id });
    }
    const seenHere = MapView.vis && MapView.vis[plane][y * game.world.w + x];
    const units = Units.at(game, plane, x, y).filter(u => (u.owner === pl.id || (seenHere && !Intel.hiddenFrom(game, pl.id, u))) && (tt === 'friendlyUnit' ? u.owner === pl.id : tt === 'enemyUnit' ? u.owner !== pl.id : true));
    if (!units.length) { UI.toast('Aucune unité valide ici.', 'warn'); return; }
    MagicUI.cancelTarget();
    // les soins portent sur toute la pile : pas besoin de choisir une unité
    if (units.length === 1 || DATA.spells[id].kind === 'heal') return MagicUI.doCast(id, { unit: units[0].id });
    const list = h('div', { class: 'list' });
    const m = UI.modal({ title: DATA.spells[id].name + ' : quelle unité ?', width: 460, body: list });
    for (const u of units) {
      const v = Spells.validate(game, pl, id, { unit: u.id });
      const row = h('div', { class: 'row' + (v.ok ? '' : ' dis') }, spriteCanvas(Sprites.unitKey(u), 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, Units.label(u)), h('div', { class: 't2' }, v.ok ? (u.ench.length ? u.ench.map(e => DATA.spells[e].name).join(', ') : 'Aucun enchantement') : v.why)));
      if (v.ok) row.onclick = () => { m.close(); MagicUI.doCast(id, { unit: u.id }); };
      list.append(row);
    }
  },
  async doCast(id, target) {
    const game = App.game, pl = App.me();
    // Garde magique : le royaume dont la cité sera protégée
    if (id === 'spell_ward' && target && target.city != null && !target.realm) {
      const realm = await UI.choice(DATA.spells[id].name, '<p>Contre quel royaume ' + U.esc(game.cities[target.city].name) + ' sera-t-elle gardée ? Ses sorts de ville y échoueront, ses sorts de combat y seront interdits à l\'assaillant et ses créatures ne pourront pas l\'attaquer.</p>',
        REALMS5.map(r => ({ label: REALM_NAMES[r], value: r })).concat([{ label: 'Annuler', value: null }]));
      if (!realm) return;
      target = Object.assign({}, target, { realm });
    }
    const r = Spells.cast(game, pl, id, target);
    if (!r.ok) UI.toast(r.why || 'Impossible de lancer ce sort.', 'warn');
    else if (r.pending) UI.toast(DATA.spells[id].name + ' : ' + r.why);
    else { if (target && target.x != null) MapView.flash(target.plane, target.x, target.y, REALM_COLORS[DATA.spells[id].realm]); }
    MapView.invalidate(); MapView.bumpVis();
    App.refresh();
    if (r.ok && !r.pending) App.heroArrivalPrompt();
  },

  // ---------- recherche ----------
  eureka(game, pl, id) {
    const s = DATA.spells[id], col = REALM_COLORS[s.realm];
    const pic = spriteCanvas('wizard:' + pl.portrait, 96); pic.className = 'eureka-wiz'; PortraitAnim.attach(pic, pl.portrait);
    const icon = spriteCanvas('spell:' + id, 56); icon.className = 'eureka-icon';
    return h('div', { class: 'eureka', style: '--rc:' + col },
      pic,
      h('div', { class: 'grow' },
        h('div', { class: 'eureka-k serif' }, 'Eurêka !'),
        h('div', { class: 'eureka-t' }, pl.name + (s.lore ? ' achève les plans d\'un grand ouvrage.' : ' perce le secret d\'un nouveau sort.')),
        h('div', { style: 'display:flex;gap:12px;align-items:center;margin-top:8px' }, icon,
          h('div', null, h('div', { class: 'eureka-n serif' }, s.name), h('div', { class: 'dim', style: 'font-size:12px' }, s.lore ? 'Ouvrage des ' + DATA.races[s.params.race].name : RARITY_NAMES[s.rarity] + ' · ' + SECTION_NAMES[s.section]),
            h('div', { class: 'muted', style: 'font-size:12.5px;margin-top:2px' }, s.desc || '')))));
  },
  research(must) {
    return new Promise(res => {
      const game = App.game, pl = App.me();
      Magic.refreshResearchOptions(game, pl);
      const list = h('div', { class: 'list' });
      // à choisir obligatoirement : fermer sans choisir perdrait les points de recherche du tour
      const m = UI.modal({ title: 'Recherche magique', width: 720, body: list, onClose: () => res(), noClose: !!must && pl.researchOptions.length > 0 });
      // un sort vient d'être trouvé : on le célèbre avant de choisir le suivant
      const jl = pl.justLearned && DATA.spells[pl.justLearned.id] && pl.justLearned.turn >= game.turn - 1 ? pl.justLearned.id : null;
      if (jl) { delete pl.justLearned; list.append(MagicUI.eureka(game, pl, jl)); try { Sfx.play('research'); } catch (e) { } }
      if (!pl.researchOptions.length) list.append(h('div', { class: 'dim' }, 'Vous avez percé tous les secrets à votre portée.'));
      const rpt = Magic.researchPerTurn(game, pl);
      list.append(h('div', { class: 'muted', style: 'margin-bottom:4px' }, 'Points de recherche : ' + Math.floor(rpt) + ' par tour (bibliothèques, sages et puissance allouée). Choisissez le prochain sort à étudier.'));
      const opts = pl.researchOptions.slice();
      if (pl.known.includes('spell_of_mastery') === false && pl.researchPool.includes('spell_of_mastery') && !opts.includes('spell_of_mastery') && pl.known.length >= 20) opts.push('spell_of_mastery');
      let loreHead = false;
      // les ouvrages après tous les sorts, Sort de Maîtrise compris
      const isLore = id => !!(DATA.spells[id] && DATA.spells[id].lore);
      for (const id of opts.filter(x => !isLore(x)).concat(opts.filter(isLore))) {
        const s = DATA.spells[id]; const cost = Magic.researchCost(pl, id);
        // les ouvrages, à part : deux au plus dans toute la partie
        if (s.lore && !loreHead) { loreHead = true; const nb = Wonders.built(pl);
          list.append(h('div', { class: 'gold', style: 'font-family:var(--sans);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:10px 0 2px' }, 'Ouvrages de vos peuples · ' + Wonders.CAP + ' au plus dans la partie' + (nb ? ' (' + nb + ' bâti' + (nb > 1 ? 's' : '') + ')' : ''))); }
        const eff = Magic.effectiveResearch(game, pl, id);
        const prog = pl.researching === id ? pl.researchProgress : 0;
        const turns = eff > 0 ? Math.max(1, Math.ceil((cost - prog) / eff)) : Infinity;   // sans recherche : jamais
        const row = h('div', { class: 'row' + (pl.researching === id ? ' sel' : '') }, spriteCanvas('spell:' + id, 40),
          h('div', { class: 'grow' }, h('div', { class: 't1' }, h('span', { class: 'realmdot', style: 'color:' + REALM_COLORS[s.realm] }), s.name, h('span', { class: 'dim', style: 'font-weight:normal;margin-left:6px' }, s.lore ? 'Ouvrage des ' + DATA.races[s.params.race].name : RARITY_NAMES[s.rarity] + ' · ' + SECTION_NAMES[s.section])), h('div', { class: 't2' }, s.desc)),
          h('div', { style: 'text-align:right;white-space:nowrap' }, h('div', { class: 'research' }, U.fmt(cost)), h('div', { class: 'dim', style: 'font-size:11px' }, turns === Infinity ? 'jamais' : turns + ' tour' + (turns > 1 ? 's' : ''))));
        UI.tipOn(row, () => UI.spellTip(id, pl, game));
        row.onclick = () => { if (pl.researching !== id) { pl.researching = id; pl.researchProgress = Math.min(pl.researchProgress, 0); } m.close(); App.refresh(); };
        list.append(row);
      }
    });
  },

  // rebelles et or de l'empire à un taux d'impôt donné (la répartition des fermiers suit, comme en changeant vraiment de taux)
  taxAt(game, pl, idx) {
    const keep = pl.taxIdx, saved = Cities.ofPlayer(game, pl.id).map(c => [c, c.farmers]);
    pl.taxIdx = idx;
    try {
      for (const c of Cities.ofPlayer(game, pl.id)) if (c.autoFarmers) Cities.resetFarmers(game, c);
      let rebels = 0, citizens = 0;
      for (const c of Cities.ofPlayer(game, pl.id)) { const e = Cities.econ(game, c); rebels += e.rebels; citizens += e.citizens; }
      return { rebels, citizens, gold: Players.goldPerTurn(game, pl).gold };
    } finally { pl.taxIdx = keep; for (const [c, f] of saved) c.farmers = f; }
  },
  // ---------- puissance, impôts, enchantements globaux ----------
  magic() {
    const game = App.game, pl = App.me();
    const body = h('div');
    const m = UI.modal({ title: 'Magie et trésor', width: 860, body });
    const render = () => {
      body.innerHTML = '';
      const sp = Magic.split(game, pl);
      const sl = (key, label, cls) => {
        const val = h('b', { class: cls }, pl.powerSplit[key] + ' %');
        const out = { mana: sp.mana + ' mana', research: Math.floor(sp.research) + ' recherche', skill: sp.skill + ' compétence' }[key];
        const input = h('input', { type: 'range', min: 0, max: 100, value: pl.powerSplit[key] });
        input.oninput = () => { MagicUI.setSplit(pl, key, +input.value); render(); App.refresh(); };
        return h('div', { style: 'margin-bottom:10px' }, h('div', { class: 'kv' }, h('span', null, label), h('span', null, val, ' · ', h('span', { class: 'muted' }, out))), input);
      };
      void sl;
      const left = h('div', null,
        h('div', { class: 'sect' }, h('h4', null, 'Puissance magique : ' + sp.power), MagicUI.staves(game, pl, () => { render(); App.refresh(); }),
          h('div', { class: 'dim', style: 'font-size:11.5px;margin-top:6px' }, 'Faites glisser le niveau de chaque sceptre ; un clic sur la tête d\'un sceptre le verrouille, les deux autres se partagent alors le reste. Compétence actuelle ' + Magic.castingSkill(pl) + (Magic.heroSkillBonus(game, pl) ? ' (+' + Magic.heroSkillBonus(game, pl) + ' héros à la forteresse)' : '') + ' ; elle progresse avec les points investis.' + (Magic.incarnate(game, pl) ? ' Incarné sur la carte, vous n\'en disposez que de la moitié : ' + Magic.totalSkill(game, pl) + ' par tour.' : ''))),
        h('div', { class: 'sect' }, h('h4', null, 'Impôts'), h('div', { class: 'tabs' }, ...TAX_RATES.map((t, i) => { const tab = h('div', { class: 'tab' + (pl.taxIdx === i ? ' on' : ''), onclick: () => { pl.taxIdx = i; for (const c of Cities.ofPlayer(game, pl.id)) if (c.autoFarmers) Cities.resetFarmers(game, c); Cities.rebalanceFood(game, pl.id); render(); App.refresh(); } }, t + ' or');
            UI.tipOn(tab, () => { const r = MagicUI.taxAt(game, pl, i); return '<h4>Impôts à ' + t + ' or</h4>' + r.rebels + ' rebelle' + (r.rebels > 1 ? 's' : '') + ' sur ' + r.citizens + ' citoyens · or ' + (r.gold >= 0 ? '+' : '') + r.gold + ' par tour'; });
            return tab; })),
          (() => { const r = MagicUI.taxAt(game, pl, pl.taxIdx); return h('div', { style: 'font-size:12.5px;margin-top:2px', html: 'Rebelles dans l\'empire : <b class="' + (r.rebels ? 'danger' : 'ok') + '">' + r.rebels + '</b> sur ' + r.citizens + ' citoyens · or ' + (r.gold >= 0 ? '+' : '') + r.gold + ' par tour' }); })(),
          h('div', { class: 'dim', style: 'font-size:11.5px' }, 'Agitation de base : ' + Math.round(TAX_UNREST[pl.taxIdx] * 100) + ' % des citoyens. Survolez un taux pour voir ses rebelles et son or.')),
        h('div', { class: 'sect' }, h('h4', null, pl.retorts.includes('alchemy') ? 'Alchimie (taux 1:1)' : 'Conversion (taux 2:1)'),
          h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
            ...[50, 100, 250].map(n => h('button', { class: 'abtn', disabled: pl.gold < n, onclick: () => { pl.gold -= n; pl.mana += pl.retorts.includes('alchemy') ? n : Math.floor(n / 2); render(); App.refresh(); } }, n + ' or → mana')),
            ...[50, 100, 250].map(n => h('button', { class: 'abtn', disabled: pl.mana < n, onclick: () => { pl.mana -= n; pl.gold += pl.retorts.includes('alchemy') ? n : Math.floor(n / 2); render(); App.refresh(); } }, n + ' mana → or')))),
      );
      const globals = h('div', { class: 'list' });
      for (const g of pl.globals) { const s = DATA.spells[g]; globals.append(h('div', { class: 'row' }, spriteCanvas('spell:' + g, 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, s.name), h('div', { class: 't2' }, s.desc)), h('div', { class: 'mana', style: 'white-space:nowrap;margin-right:8px' }, Magic.spellUpkeep(game, pl, g) + ' mana / tour'), h('button', { class: 'abtn danger', onclick: async () => { if (await UI.confirm('Rompre ' + s.name, 'Mettre fin à cet enchantement global ?')) { pl.globals = pl.globals.filter(x => x !== g); Units.fixAll(game, pl.id); render(); App.refresh(); } } }, 'Rompre'))); }
      if (!pl.globals.length) globals.append(h('div', { class: 'dim' }, 'Aucun enchantement global.'));
      const others = h('div', { class: 'list' });
      // Détection de la magie : les enchantements globaux et l'incantation en cours de chaque rival (anonyme tant qu'on ne l'a pas rencontré)
      const detect = pl.globals.includes('detect_magic');
      for (const o of game.players) if (o !== pl && o.alive && (pl.contact[o.id] || detect)) {
        const who = Players.nameFor(game, pl.id, o.id), col = pl.contact[o.id] ? o.color : '#9a948a';
        for (const g of o.globals) others.append(h('div', { class: 't2' }, h('span', { style: 'color:' + col }, U.cap(who)), ' : ' + DATA.spells[g].name));
        if (detect && o.casting && DATA.spells[o.casting.id]) others.append(h('div', { class: 't2' }, h('span', { style: 'color:' + col }, U.cap(who)), ' incante ' + DATA.spells[o.casting.id].name + ' (' + Math.floor(100 * o.casting.progress / Math.max(1, o.casting.cost)) + ' %)'));
      }
      const UP = Magic.manaUpkeepParts(game, pl);
      const prodRow = h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Mana produit'), h('span', { class: 'mana' }, '+' + sp.mana));
      const upRow = h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Entretien magique'), h('span', { class: UP.total ? 'danger' : 'muted' }, UP.total ? '-' + UP.total : '0'));
      UI.tipOn(prodRow, () => MagicUI.manaTip(game, pl)); UI.tipOn(upRow, () => MagicUI.upkeepTip(game, pl));
      const upk = h('div', { class: 'box' }, prodRow, upRow,
        h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Nœuds liés'), h('span', null, game.sites.filter(s => s.type === 'node' && s.owner === pl.id).length)),
        h('div', { class: 'kv' }, h('span', { class: 'k' }, 'Sorts connus'), h('span', null, pl.known.length)),
      );
      // les créatures invoquées : repliées par défaut, la plus chère en tête une fois dépliées ; chacune peut être renvoyée
      // (l'entretien de leurs enchantements est compté plus bas, avec les autres sorts entretenus)
      const enchUp = u => U.sum(u.ench, e => DATA.spells[e] && DATA.spells[e].upkeep ? Magic.spellUpkeep(game, pl, e) : 0);
      const crea = UP.creatures.map(x => ({ u: x.u, n: x.n - enchUp(x.u) })).filter(x => x.n > 0).sort((a, b) => b.n - a.n || Units.label(a.u).localeCompare(Units.label(b.u)));
      const mine = Cities.ofPlayer(game, pl.id);
      const whereOf = u => { const c = Cities.at(game, u.plane, u.x, u.y), near = c || U.min(mine.filter(o => o.plane === u.plane), o => World.dist(game.world, o.x, o.y, u.x, u.y)); return c ? 'à ' + c.name : near ? 'près de ' + near.name : PLANE_NAMES[u.plane]; };
      const goTo = u => { m.close(); MapView.centerOn(u.x, u.y, u.plane); App.selectTile(u.plane, u.x, u.y); App.refresh(); };
      const stop = f => e => { e.stopPropagation(); f(); };
      const summons = h('div', { class: 'sect' });
      if (crea.length) {
        const open = !!MagicUI.showSummons, tot = U.sum(crea, x => x.n);
        const head = h('h4', { style: 'cursor:pointer;display:flex;align-items:center;gap:6px', onclick: () => { MagicUI.showSummons = !open; render(); } },
          h('span', { style: 'width:12px' }, open ? '▾' : '▸'), h('span', { style: 'flex:1' }, 'Vos créatures invoquées (' + crea.length + ')'), h('span', { class: 'mana', style: 'font-size:13px;text-transform:none;letter-spacing:0;font-weight:normal' }, tot + ' mana / tour'));
        summons.append(head);
        if (open) {
          const list = h('div', { class: 'list scroll', style: 'max-height:260px' });
          for (const { u, n } of crea) {
            list.append(h('div', { class: 'row', style: 'cursor:pointer', onclick: () => goTo(u) },
              spriteCanvas(Sprites.unitKey(u), 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, Units.label(u)), h('div', { class: 't2' }, whereOf(u))), h('div', { class: 'mana', style: 'white-space:nowrap;margin-right:8px' }, n + ' mana / tour'),
              h('button', { class: 'abtn danger', title: 'Renvoyer cette créature dans le néant : elle disparaît, son entretien cesse.', onclick: stop(async () => {
                if (!await UI.confirm('Renvoyer ' + Units.label(u), U.cap(Units.label(u)) + ' ' + whereOf(u) + ' retourne dans le néant, définitivement. Vous économisez ' + n + ' mana par tour.', 'Renvoyer')) return;
                Game.disband(game, u.id); MapView.bumpVis(); render(); App.refresh(); }) }, 'Renvoyer')));
          }
          summons.append(list);
        }
      }
      // les sorts entretenus : enchantements de vos unités et de vos cités, chacun peut être rompu ; l'incantation en cours, abandonnée
      const kept = [];
      for (const u of Object.values(game.units)) if (u.owner === pl.id) for (const e of u.ench) if (DATA.spells[e] && DATA.spells[e].upkeep) kept.push({ id: e, n: Magic.spellUpkeep(game, pl, e), where: 'sur ' + Units.label(u) + ' (' + whereOf(u) + ')', go: () => goTo(u),
        warn: (e === 'water_walking' || e === 'flight' || e === 'wind_walking') && World.isWaterAt(game.world, u.plane, u.x, u.y) && !Cities.at(game, u.plane, u.x, u.y) ? (e === 'wind_walking' ? ' La pile est au-dessus de l\'eau : sans navire pour la porter, elle se noiera.' : ' L\'unité est au-dessus de l\'eau : sans navire pour la porter, elle se noiera.') : '',
        end: () => { u.ench = u.ench.filter(x => x !== e); Units.fixHp(game, u); Game.drownStranded(game, u.plane, u.x, u.y); } });
      for (const { c, id, n } of UP.cityEnch) kept.push({ id, n, where: 'à ' + c.name, go: () => { m.close(); MapView.centerOn(c.x, c.y, c.plane); App.refresh(); }, end: () => { const e = c.ench.find(x => x.spell === id && x.owner === pl.id); c.ench = c.ench.filter(x => x !== e); } });
      kept.sort((a, b) => b.n - a.n || DATA.spells[a.id].name.localeCompare(DATA.spells[b.id].name));
      const spellsSect = h('div', { class: 'sect' });
      if (kept.length || pl.casting) {
        const tot = U.sum(kept, x => x.n);
        spellsSect.append(h('h4', { style: 'display:flex;align-items:center;gap:6px' }, h('span', { style: 'flex:1' }, 'Vos sorts en cours'), kept.length ? h('span', { class: 'mana', style: 'font-size:13px;text-transform:none;letter-spacing:0;font-weight:normal' }, tot + ' mana / tour') : null));
        const list = h('div', { class: 'list scroll', style: 'max-height:260px' });
        if (pl.casting && DATA.spells[pl.casting.id]) list.append(h('div', { class: 'row' }, spriteCanvas('spell:' + pl.casting.id, 32),
          h('div', { class: 'grow' }, h('div', { class: 't1' }, DATA.spells[pl.casting.id].name), h('div', { class: 't2' }, 'incantation ' + pl.casting.progress + ' / ' + pl.casting.cost + ' · ' + Spells.castingTurnsText(game, pl)), Spells.castingWarning(game, pl) ? h('div', { class: 't2 danger' }, 'Suspendue : ' + Spells.castingWarning(game, pl)) : null),
          h('button', { class: 'abtn danger', title: 'Abandonner l\'incantation en cours.', onclick: async () => { if (!await UI.confirm('Abandonner ' + DATA.spells[pl.casting.id].name, 'Abandonner l\'incantation en cours ? Vous ne récupérerez que ' + Math.floor(pl.casting.progress / 2) + ' mana sur les ' + pl.casting.progress + ' investis.', 'Abandonner')) return; Spells.cancelCasting(game, pl); render(); App.refresh(); } }, 'Abandonner')));
        for (const k of kept) {
          const sp = DATA.spells[k.id];
          list.append(h('div', { class: 'row', style: 'cursor:pointer', onclick: k.go }, spriteCanvas('spell:' + k.id, 32),
            h('div', { class: 'grow' }, h('div', { class: 't1' }, sp.name), h('div', { class: 't2' }, k.where)), h('div', { class: 'mana', style: 'white-space:nowrap;margin-right:8px' }, k.n + ' mana / tour'),
            h('button', { class: 'abtn danger', title: 'Mettre fin à ce sort : son effet et son entretien cessent.', onclick: stop(async () => {
              if (!await UI.confirm('Rompre ' + sp.name, 'Mettre fin à ' + sp.name + ' ' + k.where + ' ? Vous économisez ' + k.n + ' mana par tour.' + (k.warn || ''), 'Rompre')) return;
              k.end(); MapView.invalidate(); render(); App.refresh(); }) }, 'Rompre')));
        }
        spellsSect.append(list);
      }
      const right = h('div', null, MagicUI.riteSection(game, pl, render, m), MagicUI.bookSection(game, pl, m), h('div', { class: 'sect' }, h('h4', null, 'Bilan'), upk), h('div', { class: 'sect' }, h('h4', null, 'Vos enchantements globaux'), globals), crea.length ? summons : null, spellsSect.children.length ? spellsSect : null, others.children.length ? h('div', { class: 'sect' }, h('h4', null, 'Enchantements rivaux'), others) : null);
      body.append(h('div', { class: 'grid2' }, left, right));
    };
    render();
  },
  // Hardcore : le pacte contre le sorcier qui écrase la partie (rituel en cours, ou démon en marche), vu de la cible ou d'un membre
  riteSection(game, pl, render, m) {
    const r = typeof Rite !== 'undefined' && Rite.active(game); if (!r) return null;
    const isTarget = r.target === pl.id, member = Rite.members(game, r.target).includes(pl);
    if (!isTarget && !member && !pl.contact[r.target]) return null;
    const tname = isTarget ? U.txt('vous') : Players.nameFor(game, pl.id, r.target);
    const sec = h('div', { class: 'sect' }, h('h4', null, 'Pacte contre ' + tname));
    // la coalition : les IA qui voient en lui le sorcier qui domine la partie
    { const co = typeof Rite.coalitionOf === 'function' && Rite.cfg(game, 'coalition') ? Rite.coalitionOf(game, r.target).map(p => p.id) : [];
      sec.append(h('div', { class: 't2', style: 'margin-bottom:4px' }, co.length ? U.cap(Rite.names(game, pl.id, co)) + (co.filter(id => id !== pl.id).length > 1 ? ' voient en ' : ' voit en ') + (isTarget ? U.txt('vous') : tname) + ' le sorcier qui domine la partie.' : isTarget ? 'Vous dominez la partie.' : U.cap(tname) + ' domine la partie.')); }
    if (r.phase === 'ritual') {
      const pct = Math.min(100, Math.floor(100 * r.progress / Math.max(1, r.cost))), left = Rite.turnsLeft(r);
      const ids = Rite.contributors(game, r).map(p => p.id);
      sec.append(h('div', { style: 'font-size:12.5px' }, 'Invocation du Démon légendaire : ' + r.progress + ' / ' + r.cost + ' mana' + (left ? ', environ ' + U.n(left, 'tour') : '') + '.'),
        h('div', { class: 'bar', style: 'margin:5px 0' }, h('i', { style: 'width:' + pct + '%' })),
        h('div', { class: 't2' }, ids.length ? 'Y contribuent : ' + Rite.names(game, pl.id, ids) + '.' : 'Personne n\'y contribue ce tour.'));
      if (member && pl.human) {
        const on = !!r.join[pl.id];
        // à qui irait le démon : la question qui décide d'y entrer
        const own = Rite.ownerOf(game, r, pl), ownIf = own === pl ? 'à vous' : own ? 'à ' + Players.nameFor(game, pl.id, own.id) : null;
        sec.append(h('div', { class: 't2', style: 'margin-top:4px' }, (on ? 'Vous y participez' : 'Vous n\'y participez pas') + (ownIf ? ' ; ' + (on ? 'le démon irait ' : 'en y participant, le démon irait ') + ownIf + '.' : '.')));
        const btn = h('button', { class: 'abtn', style: 'margin-top:6px', onclick: () => { r.join[pl.id] = !on; render(); App.refresh(); } }, on ? 'Se retirer du rituel' : 'Participer au rituel');
        UI.tipOn(btn, () => '<h4>Le rituel</h4>Il avance chaque tour de la somme des compétences de lancement des participants. Le mana se partage selon la puissance magique de chacun.' + (r.paid[pl.id] ? '<br>Votre part versée : ' + r.paid[pl.id] + ' mana.' : ''));
        sec.append(btn);
      }
      if (isTarget) sec.append(h('div', { class: 't2', style: 'margin-top:4px' }, 'Explosion de sort sur un participant détruit sa part déjà versée.'));
    } else {
      const d = game.units[r.demon], owner = game.players[r.owner];
      const hp = d ? Units.stats(game, d).maxHp : 0;
      const row = h('div', { class: 'row', style: d ? 'cursor:pointer' : '' }, d ? spriteCanvas(Sprites.unitKey(d), 32) : null,
        h('div', { class: 'grow' }, h('div', { class: 't1' }, 'Le Démon légendaire'), h('div', { class: 't2' }, (r.owner === pl.id ? 'À vos ordres' : 'Aux côtés de ' + Players.nameFor(game, pl.id, r.owner)) + (d ? ' · ' + (hp - d.dmg) + ' / ' + hp + ' PV' : ''))));
      if (d && (r.owner === pl.id || Intel.sees(game, pl, d.plane, d.x, d.y))) row.onclick = () => { m.close(); MapView.centerOn(d.x, d.y, d.plane); App.selectTile(d.plane, d.x, d.y); App.refresh(); };
      sec.append(row, h('div', { class: 't2', style: 'margin-top:4px' }, 'Il retourne aux abîmes quand ' + (isTarget ? 'vous ne dominez plus la partie' : tname + ' ne domine plus la partie') + '.'));
      void owner;
    }
    return sec;
  },
  // le Livre de légende : les énigmes lues, la carte en puzzle, où sont les fragments que l'on connaît
  bookSection(game, pl, m) {
    const b = typeof Book !== 'undefined' && game.book; if (!b) return null;
    const read = Book.readBy(game, pl.id), mine = Book.holder(game) === pl.id;
    if (!read.length && !b.heard[pl.id] && !mine) return null;
    const sec = h('div', { class: 'sect' }, h('h4', null, 'Le Livre de légende'));
    if (b.claimed) {
      const hd = Book.holder(game), c = game.cities[b.city];
      if (mine) sec.append(h('div', { style: 'display:flex;gap:8px;align-items:center;font-size:12.5px;margin-bottom:6px' }, spriteCanvas('item:book', 44),
        h('div', null, 'Il est à vous, gardé ' + (c && c.buildings.library ? 'dans la bibliothèque de ' : 'à ') + (c ? c.name : '?') + '. Qui prend la cité prend le Livre.')));
      else if (hd != null && hd >= 0 && (pl.contact[hd] || read.length)) sec.append(h('div', { style: 'font-size:12.5px;margin-bottom:6px' }, U.cap(Players.nameFor(game, pl.id, hd)) + ' le détient' + (c && Intel.knows(game, pl, c.plane, c.x, c.y) ? ', à ' + c.name : '') + '.'));
    }
    if (!read.length) { if (!b.claimed) sec.append(h('div', { class: 't2' }, 'Des fragments d\'un livre ancien circulent entre les sorciers. Vous n\'en avez lu aucun.')); return sec; }
    // la carte : un clic l'agrandit
    const cv = h('canvas', { style: 'display:block;cursor:zoom-in;border:1px solid #6b5636;border-radius:3px;margin:2px 0 6px' });
    MagicUI.drawPuzzle(cv, game, pl.id, 14);
    cv.onclick = () => MagicUI.puzzleModal(game, pl.id);
    UI.tipOn(cv, () => '<h4>La carte du Livre</h4>Chaque fragment lu en dévoile une part.');
    if (!b.claimed || !mine) sec.append(cv);
    if (!b.claimed) {
      const held = Book.held(game, pl.id);
      const frags = h('div', { style: 'display:flex;gap:2px;margin-bottom:2px' });
      for (let i = 0; i < Book.FRAGS; i++) { const cvf = spriteCanvas('item:bookfrag', 26); if (i >= held) cvf.style.opacity = i < read.length ? '.45' : '.15'; frags.append(cvf); }
      sec.append(frags, h('div', { style: 'font-size:12.5px' }, 'Fragments détenus : ' + held + ' sur ' + Book.FRAGS + (read.length > held ? ' (vous en avez lu ' + read.length + ')' : '') + '.'));
      if (b.sealSeen[pl.id] || b.revealedBy === pl.id) sec.append(h('div', { class: 't2' }, 'Le sceau ne cède qu\'à qui détient trois fragments.'));
    }
    const list = h('div', { style: 'margin-top:6px' });
    for (const f of read) list.append(h('div', { style: 'font-size:12.5px;font-style:italic;color:#d8c79a;margin:3px 0' }, '« ' + Book.clueOf(game, f) + ' »'));
    sec.append(list);
    // où sont les fragments : chez soi, et dans les cités connues d'autrui
    if (!b.claimed) {
      const here = {}, there = {};
      for (const f of b.frags) {
        const c = f.city != null ? game.cities[f.city] : null; if (!c) continue;
        if (c.owner === pl.id) here[c.id] = (here[c.id] || 0) + 1;
        else if (Intel.knows(game, pl, c.plane, c.x, c.y) && (read.includes(f) || c.owner < 0 || pl.contact[c.owner])) there[c.id] = (there[c.id] || 0) + 1;
      }
      const fmt = o => Object.keys(o).map(id => game.cities[id].name + (o[id] > 1 ? ' (' + o[id] + ')' : '')).join(', ');
      if (Object.keys(here).length) sec.append(h('div', { class: 't2', style: 'margin-top:4px' }, 'Chez vous : ' + fmt(here) + '.'));
      if (Object.keys(there).length) sec.append(h('div', { class: 't2' }, 'Ailleurs : ' + Object.keys(there).map(id => { const c = game.cities[id]; return c.name + (there[id] > 1 ? ' (' + there[id] + ')' : '') + (c.owner >= 0 ? ', chez ' + Players.nameFor(game, pl.id, c.owner) : ''); }).join(' ; ') + '.'));
    }
    void m;
    return sec;
  },
  // la carte en puzzle : le terrain des pièces dévoilées, à la plume, sans aucun nom ; les autres restent du parchemin
  drawPuzzle(cv, game, pid, px) {
    const b = game.book, P = b.puzzle, w = game.world, p = b.plane;
    cv.width = P.w * px; cv.height = P.h * px;
    const ctx = cv.getContext('2d'), shown = new Set(Book.puzzleShown(game, pid));
    const INK = '#5b4630', pw = P.w / P.cols, ph = P.h / P.rows;
    const COL = { [T.OCEAN]: '#8fa3a6', [T.LAKE]: '#9cb0b0', [T.GRASS]: '#c9bf86', [T.FOREST]: '#a9a874', [T.HILLS]: '#c4ad78', [T.MOUNTAIN]: '#ab977a', [T.DESERT]: '#e2cc94',
      [T.SWAMP]: '#a3a07a', [T.TUNDRA]: '#e6e0cf', [T.RIVER]: '#c9bf86', [T.SNODE]: '#c9bf86', [T.NNODE]: '#c9bf86', [T.CNODE]: '#c9bf86', [T.VOLCANO]: '#b07a5c' };
    const tx = i => World.wx(w, P.x0 + i), ter = (i, j) => World.terr(w, p, tx(i), P.y0 + j);
    const open = (i, j) => shown.has(Math.floor(j / ph) * P.cols + Math.floor(i / pw));
    ctx.fillStyle = '#d6bf8f'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.lineCap = 'round';
    for (let j = 0; j < P.h; j++) for (let i = 0; i < P.w; i++) {
      if (!open(i, j)) continue;
      const t = ter(i, j), X = i * px, Y = j * px, c = px / 2;
      ctx.fillStyle = COL[t] || '#c9bf86'; ctx.fillRect(X, Y, px, px);
      ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = Math.max(1, px / 14);
      if (t === T.OCEAN || t === T.LAKE) { ctx.globalAlpha = .45; for (const k of [0.33, 0.7]) { ctx.beginPath(); ctx.moveTo(X + px * .15, Y + px * k); ctx.quadraticCurveTo(X + px * .32, Y + px * (k - .12), X + c, Y + px * k); ctx.quadraticCurveTo(X + px * .68, Y + px * (k + .12), X + px * .85, Y + px * k); ctx.stroke(); } ctx.globalAlpha = 1; }
      else if (t === T.MOUNTAIN || t === T.VOLCANO) { ctx.beginPath(); ctx.moveTo(X + px * .12, Y + px * .85); ctx.lineTo(X + c, Y + px * .15); ctx.lineTo(X + px * .88, Y + px * .85); ctx.stroke(); if (t === T.VOLCANO) { ctx.fillStyle = '#9a3b22'; ctx.beginPath(); ctx.arc(X + c, Y + px * .2, px * .1, 0, 7); ctx.fill(); } }
      else if (t === T.HILLS) { ctx.beginPath(); ctx.arc(X + px * .35, Y + px * .7, px * .22, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(X + px * .68, Y + px * .55, px * .18, Math.PI, 0); ctx.stroke(); }
      else if (t === T.FOREST) { for (const [a, d] of [[.3, .45], [.68, .38], [.5, .75]]) { ctx.beginPath(); ctx.arc(X + px * a, Y + px * d - px * .08, px * .13, 0, 7); ctx.fill(); ctx.fillRect(X + px * a - .5, Y + px * d, 1, px * .12); } }
      else if (t === T.SWAMP) { ctx.globalAlpha = .6; for (const [a, d] of [[.2, .4], [.55, .62], [.3, .82]]) { ctx.beginPath(); ctx.moveTo(X + px * a, Y + px * d); ctx.lineTo(X + px * (a + .25), Y + px * d); ctx.stroke(); } ctx.globalAlpha = 1; }
      else if (t === T.DESERT) { ctx.globalAlpha = .5; for (const [a, d] of [[.25, .3], [.7, .45], [.4, .7], [.8, .8]]) ctx.fillRect(X + px * a, Y + px * d, Math.max(1, px / 12), Math.max(1, px / 12)); ctx.globalAlpha = 1; }
      else if (t === T.TUNDRA) { ctx.globalAlpha = .35; for (const [a, d] of [[.3, .35], [.65, .6]]) { ctx.beginPath(); ctx.moveTo(X + px * (a - .1), Y + px * d); ctx.lineTo(X + px * (a + .1), Y + px * d); ctx.moveTo(X + px * a, Y + px * (d - .1)); ctx.lineTo(X + px * a, Y + px * (d + .1)); ctx.stroke(); } ctx.globalAlpha = 1; }
      // les rivières : un trait vers chaque case voisine où l'eau continue
      if (World.get(w, p, 'river', tx(i), P.y0 + j)) {
        ctx.strokeStyle = '#4f7590'; ctx.lineWidth = Math.max(1, px / 9);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx(i + dx), ny = P.y0 + j + dy; if (ny < 0 || ny >= w.h) continue;
          if (World.get(w, p, 'river', nx, ny) || World.isWater(World.terr(w, p, nx, ny))) { ctx.beginPath(); ctx.moveTo(X + c, Y + c); ctx.lineTo(X + c + dx * c, Y + c + dy * c); ctx.stroke(); }
        }
      }
    }
    // les nœuds, les tours, les repaires (ce dont parlent les énigmes)
    const LAIRS = ['cave', 'ruins', 'temple', 'keep', 'dungeon', 'fallenTemple', 'lair'];
    for (const st of game.sites) {
      if (st.plane !== p) continue;
      const i = ((st.x - P.x0) % w.w + w.w) % w.w, j = st.y - P.y0;
      if (i >= P.w || j < 0 || j >= P.h || !open(i, j)) continue;
      const X = i * px + px / 2, Y = j * px + px / 2;
      ctx.lineWidth = Math.max(1, px / 12);
      if (st.type === 'node') { ctx.fillStyle = REALM_COLORS[st.realm] || '#888'; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(X, Y, px * .26, 0, 7); ctx.fill(); ctx.stroke(); }
      else if (st.type === 'tower') { ctx.fillStyle = INK; ctx.fillRect(X - px * .14, Y - px * .32, px * .28, px * .62); ctx.fillRect(X - px * .22, Y - px * .38, px * .44, px * .12); }
      else if (LAIRS.includes(st.type)) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(X, Y + px * .18, px * .24, Math.PI, 0); ctx.fill(); }
    }
    // les pièces : traits du découpage, parchemin sur celles qui restent cachées
    for (let r = 0; r < P.rows; r++) for (let q = 0; q < P.cols; q++) {
      const X = q * pw * px, Y = r * ph * px, W = pw * px, H = ph * px;
      if (!shown.has(r * P.cols + q)) {
        ctx.fillStyle = (q + r) % 2 ? '#cdb487' : '#d3bb8c'; ctx.fillRect(X, Y, W, H);
        ctx.fillStyle = 'rgba(91,70,48,.12)'; ctx.beginPath(); ctx.arc(X + W / 2, Y + H / 2, W * .12, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(91,70,48,.45)'; ctx.lineWidth = 1; ctx.strokeRect(X + .5, Y + .5, W - 1, H - 1);
    }
    // le X : quand la dernière pièce est là
    if (shown.size === P.order.length) {
      const i = ((b.x - P.x0) % w.w + w.w) % w.w, j = b.y - P.y0, X = i * px + px / 2, Y = j * px + px / 2, r = px * .38;
      ctx.strokeStyle = '#a3241a'; ctx.lineWidth = Math.max(2, px / 6);
      ctx.beginPath(); ctx.moveTo(X - r, Y - r); ctx.lineTo(X + r, Y + r); ctx.moveTo(X + r, Y - r); ctx.lineTo(X - r, Y + r); ctx.stroke();
    }
  },
  puzzleModal(game, pid) {
    const cv = h('canvas', { style: 'display:block;margin:0 auto;border:1px solid #6b5636;border-radius:4px' });
    MagicUI.drawPuzzle(cv, game, pid, 40);
    UI.modal({ title: 'La carte du Livre de légende', width: 700, body: h('div', null, cv) });
  },
  // d'où vient le mana du tour, et où il part
  manaTip(game, pl) {
    const sp = Magic.split(game, pl);
    return '<h4>Mana produit : +' + sp.mana + '</h4><div>' + pl.powerSplit.mana + ' % de votre puissance magique (' + sp.power + ')' + (pl.retorts.includes('manaFocusing') ? ', +25 % par la ' + DATA.retorts.manaFocusing.name : '') + '.</div>'
      + '<div style="margin-top:6px" class="gold">D\'où vient la puissance</div>' + App.powerSources(game, pl);
  },
  upkeepTip(game, pl) {
    const U2 = Magic.manaUpkeepParts(game, pl), kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span>' + v + '</span></div>';
    if (U2.timeStop != null) return '<h4>Entretien magique : ' + U2.total + '</h4><div>L\'Arrêt du temps suspend tout le reste : vous ne payez que lui.</div>';
    let out = '<h4>Entretien magique : ' + U2.total + ' mana / tour</h4>';
    if (U2.creatures.length) out += kv('Créatures invoquées (' + U2.creatures.length + ')', U.sum(U2.creatures, x => x.n));
    for (const g of U2.globals) out += kv(U.esc(DATA.spells[g.id].name), g.n);
    for (const e of U2.cityEnch.slice().sort((a, b) => b.n - a.n)) out += kv(U.esc(DATA.spells[e.id].name) + ' (' + U.esc(e.c.name) + ')', e.n);
    if (U2.warped.length) out += kv('Nœuds pervertis (' + U2.warped.length + ')', U.sum(U2.warped, x => x.n));
    if (!U2.total) out += '<div class="dim">Rien à entretenir.</div>';
    else if (pl.retorts.includes('channeler')) out += '<div class="dim">' + DATA.retorts.channeler.name + ' : l\'entretien des sorts est divisé par deux.</div>';
    return out;
  },
  // les trois sceptres de Master of Magic : on fait glisser le niveau de chacun, les deux autres s'ajustent
  STAVES: [
    { key: 'mana', name: 'Mana', unit: 'mana', fill: ['#2f6fe0', '#8fc4ff'], glow: '#5aa0ff' },
    { key: 'research', name: 'Recherche', unit: 'recherche', fill: ['#1f9a45', '#8ff0a6'], glow: '#4fdc7a' },
    { key: 'skill', name: 'Compétence', unit: 'compétence', fill: ['#d8461e', '#ffbf6b'], glow: '#ff7a3c' },
  ],
  staves(game, pl, done) {
    const W = 104, H = 300, top = 92, bot = 262;
    const box = h('div', { class: 'staves' });
    const cols = [];
    const update = () => {
      const sp = Magic.split(game, pl);
      for (const c of cols) {
        const v = pl.powerSplit[c.st.key];
        MagicUI.drawStaff(c.cv, c.st, v / 100, W, H, top, bot, pl.powerLock === c.st.key);
        c.val.textContent = v + ' %';
        c.out.textContent = (c.st.key === 'research' ? Math.floor(sp.research) : sp[c.st.key]) + ' ' + c.st.unit + ' / tour';
      }
    };
    for (const st of MagicUI.STAVES) {
      const dpr = window.devicePixelRatio || 1;
      const cv = h('canvas', { width: W * dpr, height: H * dpr, style: 'width:' + W + 'px;height:' + H + 'px;cursor:ns-resize;touch-action:none' });
      const yOf = ev => { const r = cv.getBoundingClientRect(); return (ev.clientY - r.top) * H / r.height; };
      const val = h('div', { class: 'stv-val', style: 'color:' + st.fill[1] }), out = h('div', { class: 'stv-out' });
      const nameEl = h('div', { class: 'stv-name', style: 'color:' + st.fill[1] + ';cursor:help' }, st.name);
      const col = h('div', { class: 'stv' }, nameEl, cv, val, out);
      UI.tipOn(nameEl, () => MagicUI.staffTip(game, pl, st.key));
      UI.tipOn(cv, () => MagicUI.staffTip(game, pl, st.key));
      cv.addEventListener('pointerdown', () => UI.hideTip(), true);
      cols.push({ st, cv, val, out });
      const set = ev => {
        MagicUI.setSplit(pl, st.key, Math.round(U.clamp((bot - yOf(ev)) / (bot - top), 0, 1) * 100));
        update();
      };
      // un clic sur la tête verrouille le sceptre (comme dans Master of Magic) : les deux autres se partagent le reste
      cv.addEventListener('pointerdown', ev => {
        if (yOf(ev) < top - 4) { MagicUI.toggleLock(pl, st.key); Sfx.play('click'); update(); return; }
        if (pl.powerLock === st.key) return;
        cv.setPointerCapture(ev.pointerId); cv._drag = true; set(ev);
      });
      cv.addEventListener('pointermove', ev => {
        if (cv._drag) return set(ev);
        cv.style.cursor = yOf(ev) < top - 4 ? 'pointer' : pl.powerLock === st.key ? 'not-allowed' : 'ns-resize';
      });
      const end = () => { if (!cv._drag) return; cv._drag = false; done && done(); };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      box.append(col);
    }
    setTimeout(update, 0);
    return box;
  },
  drawStaff(cv, st, pct, W, H, top, bot, locked) {
    const ctx = cv.getContext('2d'), dpr = cv.width / W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const cx = W / 2, tw = 16, gw = 9;
    // fût : tube de cristal cerclé d'or
    const tube = ctx.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
    tube.addColorStop(0, '#2a1c10'); tube.addColorStop(.35, '#6b4a26'); tube.addColorStop(.6, '#8a6332'); tube.addColorStop(1, '#2a1c10');
    ctx.fillStyle = tube; ctx.fillRect(cx - tw / 2, top - 4, tw, bot - top + 8);
    ctx.fillStyle = '#0b0d14'; ctx.fillRect(cx - gw / 2, top, gw, bot - top);
    // niveau : liquide lumineux
    const lvl = bot - (bot - top) * pct;
    if (pct > 0) {
      const lg = ctx.createLinearGradient(0, bot, 0, lvl);
      lg.addColorStop(0, st.fill[0]); lg.addColorStop(1, st.fill[1]);
      ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 12;
      ctx.fillStyle = lg; ctx.fillRect(cx - gw / 2, lvl, gw, bot - lvl);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(cx - gw / 2, lvl, gw, 1.5);
    }
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(cx - gw / 2 + 1.5, top, 2, bot - top);
    // bagues d'or et graduations
    for (let i = 0; i <= 4; i++) {
      const y = top + (bot - top) * i / 4;
      const bg = ctx.createLinearGradient(cx - tw / 2 - 2, 0, cx + tw / 2 + 2, 0);
      bg.addColorStop(0, '#7a5a18'); bg.addColorStop(.5, '#f3d27a'); bg.addColorStop(1, '#7a5a18');
      ctx.fillStyle = bg; ctx.fillRect(cx - tw / 2 - 2, y - 2, tw + 4, 4);
    }
    // poignée de réglage (absente quand le sceptre est verrouillé)
    if (!locked) {
      ctx.fillStyle = '#f3d27a'; ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx + tw / 2 + 3, lvl); ctx.lineTo(cx + tw / 2 + 11, lvl - 6); ctx.lineTo(cx + tw / 2 + 11, lvl + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // tête et pied : images de l'atelier si présentes, sinon dessin ; verrouillée, la tête s'éteint et porte un cadenas
    const head = 'staff:' + st.key, foot = 'staff:foot';
    ctx.save();
    if (locked) ctx.filter = 'grayscale(.75) brightness(.7)';
    if (Sprites.hasHD(head)) Sprites.drawFoot(ctx, head, cx, top + 6, 92);
    else MagicUI.drawStaffHead(ctx, st, cx, top);
    ctx.restore();
    if (locked) MagicUI.drawPadlock(ctx, cx, top - 34);
    if (Sprites.hasHD(foot)) Sprites.drawFoot(ctx, foot, cx, H - 4, 36);
    else {
      const fg = ctx.createLinearGradient(cx - 10, 0, cx + 10, 0); fg.addColorStop(0, '#7a5a18'); fg.addColorStop(.5, '#f3d27a'); fg.addColorStop(1, '#7a5a18');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(cx - 10, bot + 4); ctx.lineTo(cx + 10, bot + 4); ctx.lineTo(cx + 5, bot + 26); ctx.lineTo(cx, bot + 34); ctx.lineTo(cx - 5, bot + 26); ctx.closePath(); ctx.fill();
    }
  },
  drawPadlock(ctx, x, y) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 6;
    ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.arc(x, y - 5, 7, Math.PI, 0); ctx.lineTo(x + 7, y + 1); ctx.moveTo(x - 7, y - 5); ctx.lineTo(x - 7, y + 1); ctx.stroke();
    const g = ctx.createLinearGradient(x - 11, 0, x + 11, 0); g.addColorStop(0, '#7a5a18'); g.addColorStop(.5, '#ffe08a'); g.addColorStop(1, '#7a5a18');
    ctx.fillStyle = g; ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 11, y, 22, 17, 3) : ctx.rect(x - 11, y, 22, 17); ctx.fill(); ctx.shadowBlur = 0; ctx.stroke();
    ctx.fillStyle = '#2a1c08'; ctx.beginPath(); ctx.arc(x, y + 7, 2.6, 0, 7); ctx.fill(); ctx.fillRect(x - 1.2, y + 8, 2.4, 5);
    ctx.restore();
  },
  // à quoi sert chaque sceptre
  staffTip(game, pl, key) {
    const sp = Magic.split(game, pl), has = r => pl.retorts.includes(r);
    let html;
    if (key === 'mana') html = '<h4>Mana</h4>La part de votre puissance magique versée chaque tour dans votre réserve de mana' + (has('manaFocusing') ? ' (+25 % grâce à la ' + DATA.retorts.manaFocusing.name + ')' : '') + '. Le mana paie tout : le lancement des sorts, sur la carte comme en bataille, et l\'entretien de vos créatures invoquées et de vos enchantements.'
      + '<div style="margin-top:4px">Actuellement <b class="mana">+' + sp.mana + ' mana / tour</b> ; réserve ' + pl.mana + '.</div>';
    else if (key === 'research') html = '<h4>Recherche</h4>La part de votre puissance consacrée à l\'étude de nouveaux sorts. Elle s\'ajoute à ce que produisent vos bibliothèques, vos sages et vos héros érudits.'
      + '<div style="margin-top:4px">Ce sceptre apporte <b class="research">' + Math.floor(sp.research) + '</b> points ; au total ' + Math.floor(Magic.researchPerTurn(game, pl)) + ' par tour. Le sort étudié se choisit avec <span class="kbd">R</span>.</div>';
    else {
      const base = Magic.castingSkill(pl) - (has('archmage') ? 10 : 0), need = (base + 1) * (base + 1) - (base + 1) + 1 - (pl.skillPoints || 0);
      const t = sp.skill > 0 ? Math.ceil(need / sp.skill) : null;
      html = '<h4>Compétence de lancement</h4>La part de votre puissance qui fait grandir votre compétence de lancement : le mana que vous pouvez investir chaque tour dans vos sorts sur la carte, et celui que vous pouvez dépenser à chaque bataille. Plus elle est haute, plus vos grands sorts partent vite.'
        + (has('archmage') ? ' Archimage : +50 % sur ces points.' : '')
        + '<div style="margin-top:4px">Compétence actuelle <b class="research">' + Magic.castingSkill(pl) + '</b> ; encore ' + need + ' points pour gagner 1 (' + (t ? '≈ ' + U.n(t, 'tour') + ' à ce rythme' : 'aucun point investi') + ').</div>';
    }
    return html + '<div class="dim" style="margin-top:5px">Faites glisser le niveau du sceptre. Un clic sur sa tête le ' + (pl.powerLock === key ? 'libère (il est verrouillé)' : 'verrouille') + '.</div>';
  },
  toggleLock(pl, key) { pl.powerLock = pl.powerLock === key ? null : key; },
  drawStaffHead(ctx, st, cx, top) {
    const gold = (x0, x1) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, '#7a5a18'); g.addColorStop(.5, '#ffe08a'); g.addColorStop(1, '#7a5a18'); return g; };
    const gem = (x, y, r, c0, c1) => {
      ctx.save(); ctx.shadowColor = c1; ctx.shadowBlur = 16;
      const g = ctx.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r); g.addColorStop(0, '#ffffff'); g.addColorStop(.3, c1); g.addColorStop(1, c0);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore();
    };
    // collier
    ctx.fillStyle = gold(cx - 12, cx + 12); ctx.fillRect(cx - 12, top - 14, 24, 10);
    if (st.key === 'mana') {
      ctx.strokeStyle = gold(cx - 30, cx + 30); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(cx, top - 44, 26, Math.PI * .15, Math.PI * .85, true); ctx.stroke();
      gem(cx, top - 46, 16, '#0d2a7a', '#6fb0ff');
    } else if (st.key === 'research') {
      ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (const a of [-0.9, 0, 0.9]) { ctx.beginPath(); ctx.moveTo(cx, top - 14); ctx.quadraticCurveTo(cx + Math.sin(a) * 30, top - 40, cx + Math.sin(a) * 14, top - 66); ctx.stroke(); }
      gem(cx, top - 44, 14, '#0b5a24', '#7dffa0');
    } else {
      ctx.fillStyle = gold(cx - 28, cx + 28);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 13 : 28; ctx.lineTo(cx + Math.cos(a) * r, top - 44 + Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      gem(cx, top - 44, 12, '#7a0d0d', '#ff6a4a');
    }
  },
  setSplit(pl, key, v) {
    const keys = ['mana', 'research', 'skill'].filter(k => k !== key);
    v = U.clamp(v, 0, 100);
    // sceptre verrouillé : il ne bouge pas ; s'il en verrouille un autre, seul le troisième compense
    if (pl.powerLock === key) return;
    if (pl.powerLock && keys.includes(pl.powerLock)) {
      const L = pl.powerLock, F = keys.find(k => k !== L), room = 100 - pl.powerSplit[L];
      pl.powerSplit[key] = Math.min(v, room); pl.powerSplit[F] = room - pl.powerSplit[key];
      return;
    }
    const rest = 100 - v;
    const a = pl.powerSplit[keys[0]], b = pl.powerSplit[keys[1]];
    const tot = a + b;
    pl.powerSplit[key] = v;
    if (tot <= 0) { pl.powerSplit[keys[0]] = Math.round(rest / 2); pl.powerSplit[keys[1]] = rest - Math.round(rest / 2); }
    else { pl.powerSplit[keys[0]] = Math.round(rest * a / tot); pl.powerSplit[keys[1]] = rest - pl.powerSplit[keys[0]]; }
  },
};
function REALMS_ORDER(r) { return ['arcane', 'life', 'death', 'chaos', 'nature', 'sorcery'].indexOf(r); }
