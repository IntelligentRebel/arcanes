'use strict';
// Écrans secondaires : cités, armées, sorciers et diplomatie, objets, menu.

const Panels = {
  // vos cités : un tableau de bord, et la production de plusieurs cités à la fois (cases à cocher)
  cities() {
    const game = App.game, pl = App.me();
    const sel = new Set();
    const body = h('div');
    const m = UI.modal({ title: 'Vos cités', width: 1120, body });
    const render = () => {
      const top = m.body.scrollTop;
      body.innerHTML = '';
      // tri : clic sur un en-tête (une seconde fois : l'ordre inverse) ; retenu d'une ouverture à l'autre
      const ec = new Map(Cities.ofPlayer(game, pl.id).map(c => [c.id, Cities.econ(game, c)]));
      const S = Panels.citySort, col = Panels.CITY_COLS.find(k => k.key === S.key) || Panels.CITY_COLS[2];
      const cities = Cities.ofPlayer(game, pl.id).sort((a, b) => { const va = col.v(a, ec.get(a.id)), vb = col.v(b, ec.get(b.id));
        const d = typeof va === 'string' ? va.localeCompare(vb, 'fr') : va - vb; return (S.dir === 'asc' ? d : -d) || b.pop - a.pop; });
      for (const id of [...sel]) if (!cities.some(c => c.id === id)) sel.delete(id);
      const picked = () => cities.filter(c => sel.has(c.id));
      // actions sur les cités cochées
      const n = sel.size, none = !n, why = 'Cochez une ou plusieurs cités';
      const act = (label, fn, cls) => h('button', { class: 'abtn' + (cls ? ' ' + cls : ''), disabled: none, title: none ? why : '', onclick: fn }, label);
      body.append(h('div', { class: 'bulkbar', style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px' },
        h('span', { class: n ? 'gold' : 'dim', style: 'margin-right:4px' }, n ? U.n(n, 'cité cochée', 'cités cochées') : 'Aucune cité cochée'),
        act('Changer la production', () => Panels.multiProd(picked(), 'prod', render)),
        act('Ajouter à la file', () => Panels.multiProd(picked(), 'queue', render)),
        act('Modèles de file', () => Panels.multiTemplates(picked(), render)),
        act('Vider la file', () => { for (const c of picked()) c.queue = (c.queue || []).filter(it => it.progress > 0); UI.toast('Files vidées (les ouvrages entamés restent).'); render(); }),
        act('Rôle', () => Panels.multiRole(picked(), render)),
        n ? h('button', { class: 'abtn', onclick: () => { sel.clear(); render(); } }, 'Tout décocher') : null));
      const tbl = h('table', { class: 't' });
      const all = h('input', { type: 'checkbox', title: 'Tout cocher', checked: cities.length > 0 && sel.size === cities.length, onchange: ev => { if (ev.target.checked) for (const c of cities) sel.add(c.id); else sel.clear(); render(); } });
      const th = k => { const on = k.key === col.key;
        return h('th', { class: 'sortable' + (on ? ' sorted' : ''), title: 'Trier', onclick: () => { Panels.citySort = on ? { key: k.key, dir: S.dir === 'asc' ? 'desc' : 'asc' } : { key: k.key, dir: k.text ? 'asc' : 'desc' }; try { localStorage.setItem('arcanes-citysort', JSON.stringify(Panels.citySort)); } catch (e) {} render(); } },
          k.label, on ? h('span', { class: 'sortmark' }, S.dir === 'asc' ? ' ▲' : ' ▼') : null); };
      tbl.append(h('tr', null, h('th', null, all), ...Panels.CITY_COLS.map(th), h('th', null, ''), h('th', null, '')));
      const tot = { pop: 0, gold: 0, power: 0, research: 0, prod: 0 };
      for (const c of cities) {
        const e = ec.get(c.id);
        tot.pop += c.pop; tot.gold += e.gold; tot.power += e.power; tot.research += e.research; tot.prod += e.prod;
        const turns = Cities.turnsLeft(game, c, e), q = c.queue || [];
        const box = h('input', { type: 'checkbox', checked: sel.has(c.id), onclick: ev => ev.stopPropagation(), onchange: ev => { if (ev.target.checked) sel.add(c.id); else sel.delete(c.id); render(); } });
        // la production : un clic pour la changer ou remplir la file
        const prodCell = h('span', { class: 'prodpick', title: '' }, Cities.prodName(c), turns ? h('span', { class: 'dim' }, ' (' + (turns === Infinity ? 'jamais' : turns + ' t') + ')') : null,
          q.length ? h('span', { class: 'abl e', style: 'margin-left:6px' }, '+' + q.length) : null);
        prodCell.onclick = ev => { ev.stopPropagation(); CityUI.chooseProduction('prod', c, render); };
        UI.tipOn(prodCell, () => '<h4>' + U.esc(Cities.prodName(c)) + '</h4>' + (q.length ? '<div>File : ' + q.map(it => U.esc(CityUI.itemName(it))).join(' → ') + '</div>' : '<div class="dim">File vide</div>') + '<div class="dim" style="margin-top:4px">Clic : changer la production ou ajouter à la file.</div>');
        const tr = h('tr', { class: sel.has(c.id) ? 'on' : '' },
          h('td', { onclick: ev => { ev.stopPropagation(); box.click(); } }, box),
          h('td', null, c.fortress ? h('span', { class: 'gold', title: 'Capitale : la forteresse du sorcier' }, '★ ') : null, h('b', null, c.name),
            (() => { const cu = c.ench.filter(x => DATA.spells[x.spell] && DATA.spells[x.spell].kind === 'cityCurse'); return cu.length ? h('span', { class: 'danger', style: 'margin-left:5px', title: 'Malédiction : ' + cu.map(x => DATA.spells[x.spell].name).join(', ') }, '◆') : null; })()),
          h('td', { class: 'muted' }, DATA.races[c.race].name), h('td', { title: e.growth ? (e.growth > 0 ? '+' : '') + e.growth + ' habitants par tour' : 'Pas de croissance' }, Cities.citizens(c) + '/' + e.maxPop, e.growth ? h('span', { class: e.growth > 0 ? 'ok' : 'danger', style: 'font-size:11px;margin-left:3px' }, (e.growth > 0 ? '+' : '') + e.growth) : null),
          h('td', { class: e.foodSurplus < 0 ? 'danger' : 'food' }, (e.foodSurplus >= 0 ? '+' : '') + e.foodSurplus), h('td', { class: 'prod' }, e.prod), h('td', { class: 'gold' }, e.gold), h('td', { class: 'power' }, e.power), h('td', { class: 'research' }, e.research), (() => { const td = h('td', { class: e.unrest ? 'danger' : 'dim' }, e.unrest); UI.tipOn(td, () => CityUI.unrestTip(Cities.econ(game, c), c)); return td; })(),
          h('td', { class: c.role ? 'gold' : 'dim', style: 'font-size:12px' }, c.role ? Cities.ROLES[c.role].name : '—'),
          h('td', null, prodCell),
          h('td', null, (() => {
            // acheter le reste de la production, sans ouvrir la cité
            const cost = Cities.prodCost(game, c, e), price = Cities.buyPrice(game, c, e);
            if (!cost) return null;
            if (c.progress >= cost) return h('span', { class: c.bought ? 'ok' : 'dim', style: 'font-size:12px' }, c.bought ? 'acheté' : 'achevé au tour prochain');
            return h('button', { class: 'abtn', disabled: pl.gold < price, title: pl.gold < price ? 'Il vous manque ' + (price - pl.gold) + ' or.' : '', onclick: ev => { ev.stopPropagation(); const r = Game.buy(game, c.id); if (!r.ok) { UI.toast(r.why, 'warn'); return; } Sfx.play('build'); App.refresh(); render(); } }, 'Acheter ' + price + ' or');
          })()),
          h('td', null, h('button', { class: 'abtn', onclick: ev => { ev.stopPropagation(); m.close(); MapView.centerOn(c.x, c.y, c.plane); } }, 'Voir')));
        tr.onclick = () => { m.close(); MapView.centerOn(c.x, c.y, c.plane); CityUI.open(c.id).then(r => { if (r !== 'map') Panels.cities(); }); };
        tbl.append(tr);
      }
      body.append(tbl, h('div', { class: 'muted', style: 'margin-top:8px' }, h('span', null, 'Trésor ' + U.fmt(pl.gold) + ' or'), ' · ' + U.n(cities.length, 'cité') + ' · ' + U.fmt(tot.pop) + ' habitants · production ' + tot.prod + ' · or +' + tot.gold + ' · puissance ' + tot.power + ' · recherche ' + tot.research));
      m.body.scrollTop = top;
    };
    render();
  },
  CITY_COLS: [
    { key: 'name', label: 'Cité', text: true, v: c => c.name },
    { key: 'race', label: 'Race', text: true, v: c => DATA.races[c.race].name },
    { key: 'pop', label: 'Pop.', v: c => c.pop },
    { key: 'food', label: 'Nourr.', v: (c, e) => e.foodSurplus },
    { key: 'prod', label: 'Prod.', v: (c, e) => e.prod },
    { key: 'gold', label: 'Or', v: (c, e) => e.gold },
    { key: 'power', label: 'Puiss.', v: (c, e) => e.power },
    { key: 'research', label: 'Rech.', v: (c, e) => e.research },
    { key: 'unrest', label: 'Agit.', v: (c, e) => e.unrest },
    { key: 'role', label: 'Rôle', text: true, v: c => c.role ? Cities.ROLES[c.role].name : '' },
    { key: 'production', label: 'Production', text: true, v: c => Cities.prodName(c) },
  ],
  citySort: (() => { try { const v = JSON.parse(localStorage.getItem('arcanes-citysort')); if (v && v.key) return v; } catch (e) {} return { key: 'pop', dir: 'desc' }; })(),
  // un rôle pour plusieurs cités d'un coup
  multiRole(cities, after) {
    const list = h('div', { class: 'list' });
    const m = UI.modal({ title: 'Rôle de ' + U.n(cities.length, 'cité'), width: 520, body: h('div', null, h('p', { class: 'muted' }, 'Quand leur file est vide, ces cités choisiront d\'elles-mêmes dans ce sens. Leurs files passent toujours en premier.'), list) });
    for (const k of [null, 'growth', 'gold', 'army', 'magic']) {
      list.append(h('div', { class: 'row', onclick: () => { for (const c of cities) CityUI.setRole(c, k); m.close(); UI.toast(U.n(cities.length, 'cité') + ' : ' + (k ? 'rôle ' + Cities.ROLES[k].name.toLowerCase() : 'sans rôle') + '.'); App.refresh(); if (after) after(); } },
        h('div', { class: 'grow' }, h('div', { class: 't1' }, k ? Cities.ROLES[k].name : 'Aucun rôle'), h('div', { class: 't2' }, k ? CityUI.ROLE_TIPS[k] : 'la cité attend vos ordres quand sa file est vide'))));
    }
  },
  // ce que plusieurs cités peuvent produire, réuni : les unités par rôle (les Lanciers de chaque peuple), les bâtiments par nom
  multiOptions(cities, mode) {
    const game = App.game, opts = new Map();
    const put = (key, c, prod, name, icon) => { let o = opts.get(key); if (!o) opts.set(key, o = { key, name, icon, kind: prod.type, per: new Map() }); o.per.set(c.id, prod); };
    for (const c of cities) {
      const race = DATA.races[c.race];
      const units = mode === 'queue' ? race.units.filter(t => Cities.canBuildUnitLater(game, c, t)) : Cities.buildableUnits(game, c);
      for (const t of units) put('u:' + DATA.units[t].en, c, { type: 'unit', id: t }, DATA.units[t].name, 'unit:' + t);
      const blds = mode === 'queue' ? Object.keys(DATA.buildings).filter(b => Cities.canBuildLater(game, c, b)) : Cities.buildableBuildings(game, c);
      for (const b of blds) put('b:' + b, c, { type: 'building', id: b }, DATA.buildings[b].name, bldIcon(b));
      if (c.buildings.alchemistsGuild && (mode === 'queue' ? Cities.canQueue(game, c, { type: 'rearm' }) : Cities.rearmTargets(game, c).length)) put('rearm', c, { type: 'rearm' }, Cities.REARM_NAME, 'item:sword:1');
      if (mode !== 'queue') { if (Cities.citizens(c) < Cities.econ(game, c).maxPop) put('housing', c, { type: 'housing' }, 'Logements', bldIcon('housing')); put('tradeGoods', c, { type: 'tradeGoods' }, 'Biens de commerce', bldIcon('tradeGoods')); }
    }
    const list = [...opts.values()];
    const cost = o => o.kind === 'building' ? DATA.buildings[o.key.slice(2)].cost : 0;
    return { units: list.filter(o => o.kind === 'unit'), buildings: list.filter(o => o.kind === 'building').sort((a, b) => cost(a) - cost(b)), other: list.filter(o => o.kind === 'rearm' || o.kind === 'housing' || o.kind === 'tradeGoods') };
  },
  // changer la production (ou remplir la file) de plusieurs cités d'un coup ; une seule cité : l'écran de production habituel
  multiProd(cities, mode, after) {
    if (!cities.length) return;
    if (cities.length === 1) { CityUI.chooseProduction(mode, cities[0], after); return; }
    const game = App.game, queueMode = mode === 'queue', N = cities.length;
    const list = h('div', { class: 'list' });
    const names = cities.map(c => c.name).join(', ');
    const m = UI.modal({ title: (queueMode ? 'Ajouter à la file de ' : 'Production de ') + U.n(N, 'cité'), width: 760,
      body: h('div', null, h('div', { class: 'muted', style: 'margin-bottom:8px' }, names), h('div', { class: 'muted', style: 'margin-bottom:8px' }, queueMode ? 'Cliquez sur les éléments dans l\'ordre voulu : ils s\'ajoutent à la file de chaque cité qui peut les produire.' : 'Clic : produire maintenant dans chaque cité qui le peut · « + file » : ajouter à leur file.'), h('div', { class: 'scroll', style: 'max-height:62vh' }, list)),
      footer: queueMode ? [h('button', { class: 'btn primary', onclick: () => m.close() }, 'Terminé')] : null, onClose: () => { App.refresh(); if (after) after(); } });
    // ajoute à la file de chaque cité qui le peut ; une cité qui ne produit rien de réel s'y met tout de suite
    const enqueue = o => {
      let k = 0;
      for (const c of cities) {
        const prod = o.per.get(c.id); if (!prod || !Cities.canQueue(game, c, prod)) continue;
        c.queue = c.queue || [];
        if (c.prod.type === 'housing' || c.prod.type === 'tradeGoods') Cities.setProduction(game, c, prod); else c.queue.push(prod);
        k++;
      }
      return k;
    };
    const fill = () => {
      list.innerHTML = '';
      const { units, buildings, other } = Panels.multiOptions(cities, mode);
      const head = t => list.append(h('h4', { class: 'gold', style: 'font-family:var(--sans);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:8px 0 2px' }, t));
      const row = o => {
        const k = o.per.size, first = cities.find(c => o.per.has(c.id)), prod = o.per.get(first.id);
        const producing = cities.filter(c => { const p = o.per.get(c.id); return p && c.prod.type === p.type && c.prod.id === p.id; }).length;
        const queued = cities.filter(c => { const p = o.per.get(c.id); return p && (c.queue || []).some(it => it.type === p.type && it.id === p.id); }).length;
        const costs = o.kind === 'unit' || o.kind === 'building' || o.kind === 'rearm' ? cities.filter(c => o.per.has(c.id)).map(c => CityUI.itemCost(game, c, o.per.get(c.id), Cities.econ(game, c)) || 0) : [0];
        const lo = Math.min(...costs), hi = Math.max(...costs);
        const r = h('div', { class: 'row' }, spriteCanvas(o.icon, 32),
          h('div', { class: 'grow' }, h('div', { class: 't1' }, o.name, producing ? h('span', { class: 'abl e', style: 'margin-left:6px' }, 'en cours ×' + producing) : null, queued ? h('span', { class: 'abl e', style: 'margin-left:6px' }, 'en file ×' + queued) : null),
            h('div', { class: 't2' + (k < N ? ' gold' : '') }, k === N ? 'Toutes les cités cochées' : U.n(k, 'cité', 'cités') + ' sur ' + N + ' : ' + cities.filter(c => o.per.has(c.id)).map(c => c.name).join(', '))),
          hi ? h('div', { class: 'prod', style: 'text-align:right' }, lo === hi ? String(lo) : lo + '–' + hi) : null,
          !queueMode && (o.kind === 'unit' || o.kind === 'building' || o.kind === 'rearm') ? h('button', { class: 'abtn qadd', title: 'Ajouter à la file d\'attente', onclick: ev => { ev.stopPropagation(); const n = enqueue(o); UI.toast(n ? U.esc(o.name) + ' ajouté à la file de ' + U.n(n, 'cité') + '.' : 'Déjà prévu partout.', n ? '' : 'warn'); fill(); } }, '+ file') : null);
        r.onclick = () => {
          if (queueMode) { const n = enqueue(o); if (!n) UI.toast('Déjà prévu partout.', 'warn'); fill(); return; }
          let n = 0, shelved = 0;
          for (const c of cities) { const p = o.per.get(c.id); if (!p) continue; if (c.prod.type === p.type && c.prod.id === p.id) continue; if (Cities.setProduction(game, c, p)) shelved++; n++; }
          m.close();
          UI.toast(U.esc(o.name) + (n ? ' : production lancée dans ' + U.n(n, 'cité') : ' : déjà en production') + (k < N ? ' ; impossible dans ' + U.n(N - k, 'autre') : '') + (shelved ? ' (' + U.n(shelved, 'ouvrage entamé retourne', 'ouvrages entamés retournent') + ' en tête de file)' : '') + '.');
        };
        UI.tipOn(r, () => CityUI.itemTip(first, prod));
        list.append(r);
      };
      if (units.length) { head('Unités'); units.forEach(row); }
      if (buildings.length) { head('Bâtiments'); buildings.forEach(row); }
      if (other.length) { head('Autres'); other.forEach(row); }
      if (!units.length && !buildings.length && !other.length) list.append(h('div', { class: 'dim' }, 'Rien à ajouter.'));
    };
    fill();
  },
  // modèles de file : les appliquer à une ou plusieurs cités (et enregistrer celui d'une cité)
  multiTemplates(cities, after) {
    if (!cities.length) return;
    const game = App.game, N = cities.length, body = h('div');
    const m = UI.modal({ title: 'Modèles de file · ' + (N === 1 ? cities[0].name : U.n(N, 'cité')), width: 720, body, onClose: () => { App.refresh(); if (after) after(); } });
    let interrupt = false;
    const append = (c, tpl) => {
      let k = 0;
      for (const it of CityUI.fromTemplateItems(c, tpl.items)) {
        if (it.type === 'building' && (c.buildings[it.id] || (c.prod.type === 'building' && c.prod.id === it.id))) continue;
        if (!Cities.canQueue(game, c, it)) continue;
        c.queue = c.queue || [];
        if (c.prod.type === 'housing' || c.prod.type === 'tradeGoods') Cities.setProduction(game, c, it); else c.queue.push(it);
        k++;
      }
      Cities.dedupeQueue(c);
      return k;
    };
    const render = () => {
      body.innerHTML = '';
      if (N === 1) {
        // la production et la file de cette cité deviennent un modèle
        const c = cities[0], items = CityUI.toTemplateItems(c);
        const nameIn = h('input', { type: 'text', placeholder: 'Nom du modèle', style: 'flex:1;min-width:0' });
        body.append(h('div', { class: 'box', style: 'display:flex;flex-direction:column;gap:6px;margin-bottom:8px' },
          h('div', { class: 't1' }, 'Enregistrer la production et la file de ' + c.name),
          items.length ? h('div', { class: 't2' }, items.map(it => CityUI.itemName(it)).join(' → ')) : h('div', { class: 'dim' }, 'Rien à enregistrer : ni production ni file.'),
          h('div', { style: 'display:flex;gap:6px' }, nameIn, h('button', { class: 'btn', disabled: !items.length, onclick: () => {
            const name = nameIn.value.trim() || ('Modèle ' + (CityUI.loadTemplates().length + 1));
            const list = CityUI.loadTemplates().filter(x => x.name !== name); list.push({ name, items, def: false });
            if (CityUI.saveTemplates(list)) { UI.toast('Modèle « ' + U.esc(name) + ' » enregistré.'); render(); }
          } }, 'Enregistrer'))));
      }
      const list = CityUI.loadTemplates();
      if (!list.length) { body.append(h('div', { class: 'dim' }, N === 1 ? 'Aucun modèle pour l\'instant.' : 'Aucun modèle pour l\'instant : cochez une seule cité pour enregistrer sa production et sa file comme modèle.')); return; }
      body.append(h('label', { style: 'display:block;margin:2px 0 8px;cursor:pointer' }, h('input', { type: 'checkbox', checked: interrupt, onchange: ev => { interrupt = ev.target.checked; } }), ' Remplacer la file : interrompre aussi la production en cours'));
      const ref = cities[0];
      list.forEach(tpl => {
        const preview = CityUI.fromTemplateItems(ref, tpl.items).map(CityUI.itemName).join(' → ') || 'Rien de réalisable pour ce peuple';
        body.append(h('div', { class: 'row', style: 'cursor:default;align-items:flex-start' },
          h('div', { class: 'grow' }, h('div', { class: 't1' }, tpl.name, tpl.def ? h('span', { class: 'abl e', style: 'margin-left:6px' }, 'nouvelles cités') : null), h('div', { class: 't2' }, preview)),
          h('div', { style: 'display:flex;flex-direction:column;gap:4px;align-items:stretch' },
            h('button', { class: 'abtn', onclick: () => { for (const c of cities) CityUI.applyTemplate(c, tpl, !interrupt); m.close(); UI.toast('Modèle « ' + U.esc(tpl.name) + ' » appliqué à ' + U.n(N, 'cité') + '.'); } }, 'Remplacer la file'),
            h('button', { class: 'abtn', onclick: () => { let k = 0; for (const c of cities) k += append(c, tpl); m.close(); UI.toast('Modèle « ' + U.esc(tpl.name) + ' » ajouté à la file de ' + U.n(N, 'cité') + (k ? '' : ' (rien de nouveau)') + '.'); } }, 'Ajouter à la file'))));
      });
    };
    render();
  },

  armies() {
    const game = App.game, pl = App.me();
    const units = Object.values(game.units).filter(u => u.owner === pl.id);
    const groups = U.groupBy(units, u => u.plane + ',' + u.x + ',' + u.y);
    const list = h('div', { class: 'list' });
    const upk = { gold: Magic.goldUpkeepUnits(game, pl), food: 0, mana: 0 }; for (const u of units) { const x = Units.upkeep(game, u); upk.food += x.food; upk.mana += x.mana; }   // l'or : solde réduite par la renommée
    list.append(h('div', { class: 'muted' }, units.length + ' unités · entretien ' + upk.gold + ' or, ' + upk.food + ' nourriture, ' + upk.mana + ' mana par tour'));
    const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
    for (const k of keys) {
      const g = groups[k], u0 = g[0];
      const c = Cities.at(game, u0.plane, u0.x, u0.y);
      const icons = h('div', { style: 'display:flex;gap:2px;flex-wrap:wrap' }, ...g.map(u => { const cv = spriteCanvas(Sprites.unitKey(u), 32); cv.style.width = '28px'; cv.style.height = '28px'; UI.tipOn(cv, () => UI.unitTip(u, game)); return cv; }));
      const row = h('div', { class: 'row' }, h('div', { style: 'width:150px' }, h('div', { class: 't1' }, c ? c.name : 'En campagne'), h('div', { class: 't2' }, PLANE_NAMES[u0.plane] + ' (' + u0.x + ',' + u0.y + ') · ' + g.length + ' unité' + (g.length > 1 ? 's' : ''))), h('div', { class: 'grow' }, icons));
      row.onclick = () => { m.close(); MapView.centerOn(u0.x, u0.y, u0.plane); App.selectTile(u0.plane, u0.x, u0.y); };
      list.append(row);
    }
    // l'avatar (vous, en personne) n'est pas un de vos six héros : il a sa propre rubrique
    const heroes = units.filter(u => u.hero && !u.avatar), avatar = units.find(u => u.avatar);
    const card = u => { const el = h('div', { class: 'box', style: 'display:flex;gap:8px;align-items:center;cursor:pointer' }, spriteCanvas(Sprites.heroPicOf(u), 40, 'portrait'), h('div', null, h('b', null, u.hero.name), h('div', { class: 't2 muted' }, u.hero.title + ' · ' + (Units.levelInfo(game, u) || {}).name))); UI.tipOn(el, () => UI.unitTip(u, game)); el.onclick = () => { m.close(); Panels.items(u); }; return el; };
    const m = UI.modal({ title: 'Armées', width: 820, body: h('div', null,
      avatar ? h('div', { class: 'sect' }, h('h4', null, 'Vous, en personne'), h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, card(avatar))) : null,
      heroes.length ? h('div', { class: 'sect' }, h('h4', null, 'Héros ', h('span', { class: 'dim', style: 'font-weight:400' }, heroes.length + '/6')), h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, ...heroes.map(card))) : null, list) });
  },

  // fiche d'un héros, façon Heroes of Might and Magic : portrait, équipement, coffre, caractéristiques détaillées
  heroSheet(u0) {
    const game = App.game, pl = App.me();
    const body = h('div', { class: 'herosheet' });
    const m = UI.modal({ title: u0.hero.name, width: 1020, body });
    const SLOT = { melee: 'Arme', ranged: 'Arme à distance', magic: 'Arme magique', anyWeapon: 'Arme', armor: 'Armure', jewelry: 'Bijou' };
    const itemTip = it => '<h4>' + U.esc(it.name) + '</h4><div>' + U.esc(Items.describe(it)) + '</div>' + it.powers.map(p => '<div class="gold">' + U.esc(ITEM_POWERS[p].name) + (ITEM_POWERS[p].ability && ABILITY_NAMES[ITEM_POWERS[p].ability] ? ' : ' + U.esc(ABILITY_NAMES[ITEM_POWERS[p].ability]) : '') + '</div>').join('') + (it.bookArtifact ? '<div class="dim">Artefact du Livre de légende, unique au monde.</div>' : it.legendary ? '<div class="dim">Objet légendaire, gagné en accomplissant une quête.</div>' : '') + '<div class="dim">Valeur ' + (it.value || 100) + ' or</div>';
    const render = () => {
      const u = game.units[u0.id]; if (!u) { m.close(); return; }
      body.innerHTML = '';
      const s = Units.stats(game, u), bare = Units.stats(game, Object.assign({}, u, { items: [] }));
      const raw = Heroes.rawLevel(u), cur = HERO_LEVELS[raw], nxt = HERO_LEVELS[raw + 1];
      const lvName = (Units.levelInfo(game, u) || cur).name;
      // Seigneur de guerre, Croisade : le niveau effectif devance l'expérience ; le prochain palier se nomme d'après lui
      const eff = Units.levelIndex(game, u), nxtName = nxt && eff < HERO_LEVELS.length - 1 ? HERO_LEVELS[Math.min(HERO_LEVELS.length - 1, raw + 1 + (eff - raw))].name : null;
      // colonne 1 : portrait et identité
      const pic = h('canvas', { width: 480, height: 480, class: 'hs-pic', style: '--pc:' + (game.players[u.owner] ? game.players[u.owner].color : '#888') });
      setTimeout(() => Sprites.paint(pic, Sprites.heroPicOf(u)), 0);
      const xpPct = nxt ? Math.round((u.xp - cur.xp) / (nxt.xp - cur.xp) * 100) : 100;
      const left = h('div', { class: 'hs-left' }, pic,
        h('div', { class: 'hs-name' }, u.hero.name),
        h('div', { class: 'muted' }, U.esc(u.hero.title) + ' · ' + lvName),
        h('div', { class: 'bar', style: 'margin:6px 0 2px' }, h('i', { style: 'width:' + xpPct + '%' })),
        h('div', { class: 'dim', style: 'font-size:11.5px' }, u.xp + ' XP' + (nxtName ? ' · ' + nxtName + ' à ' + nxt.xp + ' XP' : ' · niveau maximal')),
        h('div', { html: UI.kindLine(u) }),
        u.hero.quest ? h('div', { style: 'margin-top:6px;font-size:12px', html: '<span class="gold">Quête</span> : ' + U.esc(Heroes.questText(game, u)) + (u.hero.quest.done || u.hero.quest.type !== 'legend' ? '' : '<div class="dim" style="margin-top:2px">Récompense : ' + U.esc(Heroes.relicPreview(u)) + ', ' + Heroes.LEGEND_REWARD.xp + ' XP, ' + Heroes.LEGEND_REWARD.gold + ' or, +' + Heroes.LEGEND_REWARD.fame + ' de renommée, et le trésor du repaire.</div>') }) : null,
        u.owner === App.pid && u.hero.quest && !u.hero.quest.done && u.hero.quest.stage >= 2 && game.sites[u.hero.quest.site] ? h('button', { class: 'abtn', style: 'margin-top:6px', title: 'Centrer la carte sur la légende', onclick: () => { const q = u.hero.quest, st = game.sites[q.site], x = q.stage >= 3 ? st.x : q.cx, y = q.stage >= 3 ? st.y : q.cy; UI.closeAll(); App.selectTile(u.plane, u.x, u.y, [u.id]); MapView.centerOn(x, y, st.plane); MapView.ping(x, y, st.plane); App.refresh(); } }, u.hero.quest.stage >= 3 ? 'Voir le repaire' : 'Voir la région') : null,
        u.hero.story ? h('div', { class: 'dim', style: 'font-style:italic;font-size:12px;margin-top:4px' }, '« ' + u.hero.story + ' »') : null,
        App.sel && App.sel.ids && App.sel.ids.includes(u.id) && App.sel.ids.length > 1 ? h('button', { class: 'abtn', style: 'margin-top:10px', title: 'Ne garder que ce héros dans la sélection (Maj + clic sur une fiche pour composer la sélection)', onclick: () => { App.sel.ids = [u.id]; MapView.sel.ids = App.sel.ids; m.close(); App.refresh(); } }, 'Sélectionner seul') : null);
      // colonne 2 : équipement et coffre
      const slots = h('div', { class: 'hs-slots' });
      (u.hero.slots || []).forEach((slot, i) => {
        const it = u.items && u.items[i];
        const tile = h('div', { class: 'hs-slot' + (it ? ' full' : '') },
          h('div', { class: 'hs-slotname' }, SLOT[slot] || slot),
          it ? spriteCanvas(it.icon || 'item:' + it.kind, 64) : h('div', { class: 'hs-empty' }),
          h('div', { class: 'hs-itname' }, it ? it.name : 'vide'),
          it ? h('div', { class: 'hs-itdesc' }, Items.describe(it)) : null,
          it && u.owner === pl.id ? h('button', { class: 'abtn', onclick: () => { pl.vault.push(it); u.items[i] = null; Units.fixHp(game, u); render(); App.refresh(); } }, 'Ranger au coffre') : null);
        if (it) UI.tipOn(tile, () => itemTip(it));
        slots.append(tile);
      });
      const vault = h('div', { class: 'hs-vault' });
      if (u.owner === pl.id) for (const it of pl.vault) {
        const ok = Items.canEquip(u, it);
        const t = h('div', { class: 'hs-vit' + (ok ? '' : ' no') }, spriteCanvas(it.icon || 'item:' + it.kind, 44));
        UI.tipOn(t, () => itemTip(it) + (ok ? '<div class="ok" style="margin-top:4px">Clic : équiper ' + U.esc(u.hero.name) + '</div>' : '<div class="danger" style="margin-top:4px">' + U.esc(u.hero.name) + ' ne peut pas porter cet objet.</div>'));
        if (ok) t.onclick = () => {
          let i = Items.freeSlot(u, it); if (i < 0) i = (u.hero.slots || []).findIndex(sl => Items.slotAccepts(sl, it, u)); if (i < 0) return;
          if (u.items[i]) pl.vault.push(u.items[i]);
          u.items[i] = it; pl.vault = pl.vault.filter(x => x !== it); Units.fixHp(game, u); UI.hideTip(); render(); App.refresh();
        };
        vault.append(t);
      }
      const mid = h('div', { class: 'hs-mid' }, h('h4', null, 'Équipement'), slots,
        u.owner === pl.id ? h('h4', { style: 'margin-top:12px' }, 'Coffre de la forteresse') : null,
        u.owner === pl.id ? (pl.vault.length ? vault : h('div', { class: 'dim' }, 'Le coffre est vide. Les objets trouvés sans place libre y sont rangés.')) : null);
      // colonne 3 : caractéristiques détaillées
      const row = (ic, label, v, b, extra) => h('div', { class: 'hs-stat' }, h('span', { class: 'ic', html: ICONS[ic] || '' }), h('span', { class: 'lab' }, label), h('b', null, v), v !== b ? h('span', { class: 'gold', title: 'Apport des objets' }, ' (' + (v - b > 0 ? '+' : '') + (v - b) + ' objets)') : null, extra ? h('span', { class: 'dim' }, ' ' + extra) : null);
      const stats = h('div', { class: 'hs-stats' },
        s.melee ? row('melee', 'Attaque', s.melee, bare.melee) : null,
        s.ranged ? row(s.rangedType === 'magic' ? 'magic' : 'ranged', s.rangedType === 'magic' ? 'Tir magique' : 'Tir', s.ranged, bare.ranged, s.ammo ? '×' + s.ammo : '') : null,
        s.thrown ? row('ranged', 'Lancer', s.thrown, bare.thrown) : null,
        row('def', 'Défense', s.def, bare.def),
        row('res', 'Résistance', s.res, bare.res),
        row('hp', 'Points de vie', s.maxHp, bare.maxHp, Units.health(game, u) < s.maxHp ? '(' + Units.health(game, u) + ' restants)' : ''),
        row(s.flying ? 'fly' : 'move', 'Mouvement', s.move, bare.move, s.flying ? 'en volant' : ''),
        h('div', { class: 'hs-stat' }, h('span', { class: 'ic' }), h('span', { class: 'lab' }, 'Précision'), h('b', null, s.toHit + ' %'), s.toHit !== bare.toHit ? h('span', { class: 'gold' }, ' (+' + (s.toHit - bare.toHit) + ' % objets)') : null,
          Units.pierce(s.toHit) ? h('span', { class: 'dim', title: 'Au-delà de 100 %, chaque tranche de 10 % ignore 1 point de défense de la cible' }, ' · ignore ' + Units.pierce(s.toHit) + ' de défense') : null),
        s.caster ? row('mana', 'Mana de combat', s.caster, bare.caster) : null);
      const tal = new Set(u.hero.talents || []);
      const ab = Object.keys(s.ab).filter(k => ABILITY_NAMES[k]);
      const abil = h('div', { class: 'hs-abil' }, ...ab.map(k => {
        const base = k.replace(/^super(.)/, (_, c) => c.toLowerCase()), t = DATA.heroTalents[base];
        const el = h('span', { class: 'abl' + (tal.has(base) ? ' tal' : '') }, ABILITY_NAMES[k] + (typeof s.ab[k] === 'number' && !['toHit', 'caster'].includes(k) ? ' ' + Math.abs(s.ab[k]) : ''));
        const xpLine = base === 'armsmaster' ? '<div style="margin-top:4px"><b>+' + Units.armsmasterXp(game, u) + ' XP par tour</b> à chaque unité normale de sa pile, en plus du point de base (' + (k === 'superArmsmaster' ? 3 : 2) + ' par niveau de ' + U.esc(u.hero.name) + ').</div>' : '';
        UI.tipOn(el, abilityTip(k, s.ab[k]) + xpLine + (tal.has(base) ? '<div class="gold">Talent choisi en montant de niveau</div>' : ''));
        return el;
      }));
      const spells = (DATA.units[u.type].spells || []).filter(id => DATA.spells[id]);
      const up = Units.upkeep(game, u);
      const right = h('div', { class: 'hs-right' }, h('h4', null, 'Caractéristiques'), stats,
        h('h4', { style: 'margin-top:10px' }, 'Capacités'), ab.length ? abil : h('div', { class: 'dim' }, 'Aucune'),
        spells.length ? h('h4', { style: 'margin-top:10px' }, 'Sorts') : null,
        spells.length ? h('div', { class: 'hs-abil' }, ...spells.map(id => h('span', { class: 'abl e' }, DATA.spells[id].name))) : null,
        h('div', { class: 'dim', style: 'margin-top:10px;font-size:12px' }, 'Entretien : ' + ([up.gold ? up.gold + ' or' : '', up.mana ? up.mana + ' mana' : ''].filter(Boolean).join(', ') || 'aucun') + ' par tour'),
        DATA.units[u.type].desc ? h('div', { class: 'muted', style: 'margin-top:6px;font-size:12px' }, DATA.units[u.type].desc) : null);
      body.append(left, mid, right);
    };
    render();
  },
  items(hero) {
    const game = App.game, pl = App.me();
    const body = h('div');
    const m = UI.modal({ title: 'Objets magiques', width: 760, body });
    const heroes = Object.values(game.units).filter(u => u.owner === pl.id && u.hero);
    const render = () => {
      body.innerHTML = '';
      const vault = h('div', { class: 'list' });
      for (const it of pl.vault) {
        const row = h('div', { class: 'row' }, spriteCanvas(it.icon || 'item:' + it.kind, 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, it.name), h('div', { class: 't2' }, Items.describe(it))));
        const sel = h('select', null, h('option', { value: '' }, 'Équiper…'), ...heroes.filter(u => Items.canEquip(u, it)).map(u => h('option', { value: u.id }, u.hero.name)));
        sel.onchange = () => { const u = game.units[+sel.value]; if (!u) return; let i = Items.freeSlot(u, it); if (i < 0) i = (u.hero.slots || []).findIndex(s => Items.slotAccepts(s, it, u)); if (i < 0) return; if (u.items[i]) pl.vault.push(u.items[i]); u.items[i] = it; pl.vault = pl.vault.filter(x => x !== it); Units.fixHp(game, u); render(); App.refresh(); };
        row.append(sel);
        if (!it.bookArtifact) row.append(h('button', { class: 'abtn', onclick: async () => { const g = Math.floor((it.value || 100) / 2); if (!await UI.confirm('Vendre ' + it.name, 'Vendre ' + U.esc(it.name) + (it.legendary ? ', objet légendaire,' : '') + ' pour ' + g + ' or ? On ne le rachète pas.', 'Vendre')) return; pl.vault = pl.vault.filter(x => x !== it); pl.gold += g; render(); App.refresh(); } }, 'Vendre ' + Math.floor((it.value || 100) / 2)));
        vault.append(row);
      }
      if (!pl.vault.length) vault.append(h('div', { class: 'dim' }, 'Le coffre est vide.'));
      const hs = h('div', { class: 'list' });
      for (const u of heroes) {
        const slots = (u.hero.slots || []).map((s, i) => { const it = u.items && u.items[i]; const el = h('div', { class: 'box', style: 'min-width:150px;font-size:12px' }, h('div', { class: 'dim' }, { melee: 'Arme', ranged: 'Arme à distance', magic: 'Arme magique', anyWeapon: 'Arme', armor: 'Armure', jewelry: 'Bijou' }[s] || s), it ? h('div', null, h('b', null, it.name), h('div', { class: 'muted' }, Items.describe(it)), h('span', { class: 'link', onclick: () => { pl.vault.push(it); u.items[i] = null; Units.fixHp(game, u); render(); App.refresh(); } }, 'retirer')) : h('div', { class: 'dim' }, 'vide')); return el; });
        // clic sur le héros : la carte se centre sur lui et le sélectionne (avec sa pile s'il en fait partie)
        const who = h('div', { class: 'hero-go' }, spriteCanvas(Sprites.heroPicOf(u), 48, 'portrait'), h('div', { style: 'width:130px' }, h('div', { class: 't1' }, u.hero.name), h('div', { class: 't2' }, u.hero.title)));
        who.onclick = () => {
          m.close(); MapView.centerOn(u.x, u.y, u.plane); MapView.ping(u.x, u.y, u.plane);
          App.selectTile(u.plane, u.x, u.y); if (App.sel && !App.sel.ids.includes(u.id)) App.selectTile(u.plane, u.x, u.y, [u.id]);
        };
        hs.append(h('div', { class: 'row', style: 'cursor:default;align-items:flex-start' }, who, h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, ...slots)));
      }
      body.append(h('div', { class: 'sect' }, h('h4', null, 'Coffre de la forteresse'), vault), h('div', { class: 'sect' }, h('h4', null, 'Héros'), heroes.length ? hs : h('div', { class: 'dim' }, 'Aucun héros à votre service.')));
    };
    render();
  },

  wizards(focus) {
    const game = App.game, pl = App.me();
    const body = h('div');
    const m = UI.modal({ title: 'Sorciers', width: 980, body });
    const render = () => {
      body.innerHTML = '';
      const card = (o) => {
        const known = o === pl || pl.contact[o.id];
        if (!known) {
          // sorcier jamais rencontré : aucun indice (ni nom, ni portrait, ni couleur)
          const q = h('div', { class: 'portrait unknown' }, '?');
          return h('div', { class: 'box', style: 'display:flex;gap:12px;align-items:center' }, q,
            h('div', null, h('div', { class: 'serif', style: 'font-size:17px' }, 'Sorcier inconnu'), h('div', { class: 'dim' }, 'Jamais rencontré')));
        }
        const portrait = spriteCanvas('wizard:' + o.portrait, 32); portrait.className = 'portrait'; portrait.style.cssText = 'width:64px;height:64px;cursor:pointer;--pc:' + o.color;
        // un clic : sa capitale si on la connaît, sinon la plus grande de ses cités repérées
        const goal = Panels.wizardGoal(game, pl, o);
        portrait.title = goal ? (goal.fortress ? 'Aller à sa capitale, ' : 'Aller à sa plus grande cité connue, ') + goal.name : 'Aucune cité connue';
        portrait.onclick = () => {
          const c = Panels.wizardGoal(game, pl, o);
          if (!c) { UI.toast('Vous ne connaissez aucune cité ' + App.de(U.esc(o.name)) + '.', 'warn'); return; }
          UI.closeAll(); MapView.centerOn(c.x, c.y, c.plane); MapView.ping(c.x, c.y, c.plane); App.refresh();
        };
        const books = h('div', { class: 'wbooks', style: 'display:flex;gap:2px;flex-wrap:wrap;margin:3px 0' });
        for (const r of REALMS5) for (let i = 0; i < (o.books[r] || 0); i++) books.append(h('span', { class: r, style: 'width:7px;height:12px;border-radius:1px;background:' + REALM_COLORS[r] + ';' + UI.solid(REALM_COLORS[r]) + 'display:inline-block' }));
        const info = h('div', { style: 'flex:1;min-width:0' },
          h('div', { class: 'serif', style: 'font-size:17px;color:' + o.color }, o.name, !o.alive ? h('span', { class: 'dim' }, ' (vaincu)') : o.banished ? h('span', { class: 'danger' }, ' (banni)') : null),
          known ? books : h('div', { class: 'dim' }, 'Jamais rencontré'),
          ...(known ? Panels.wizardFacts(game, pl, o) : []));
        const box = h('div', { class: 'box' + (focus === o.id ? ' focus' : ''), style: 'display:flex;gap:12px;align-items:flex-start' }, portrait, info);
        if (focus === o.id) setTimeout(() => box.scrollIntoView({ block: 'nearest' }), 30);
        if (o !== pl && known && o.alive) {
          const rel = o.relations[pl.id] || 0;
          const relTxt = rel > 50 ? 'Amical' : rel > 15 ? 'Cordial' : rel > -15 ? 'Neutre' : rel > -50 ? 'Méfiant' : 'Hostile';
          const st = pl.diplo[o.id] || 'none';
          const act = h('div', { style: 'display:flex;flex-direction:column;gap:5px;width:220px' },
            h('div', null, 'Traité : ', h('b', null, Diplomacy.stateName(st)), pl.closedTo && pl.closedTo[o.id] && (st === 'peace' || st === 'alliance') ? h('span', { class: 'gold' }, ' · territoire interdit') : null),
            h('div', null, 'Attitude : ', h('b', { class: rel > 15 ? 'ok' : rel < -15 ? 'danger' : '' }, relTxt + ' (' + Math.round(rel) + ')')),
            h('div', { class: 'bar' }, h('i', { style: 'width:' + ((rel + 100) / 2) + '%' })),
            ...Panels.wizardSignals(game, pl, o),
            h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' },
              st !== 'peace' && st !== 'alliance' ? h('button', { class: 'abtn', onclick: () => { const r = Diplomacy.propose(game, pl.id, o.id, 'peace'); UI.toast(U.esc(r.text)); render(); } }, 'Proposer la paix') : null,
              st === 'peace' && !(pl.denounced && pl.denounced[o.id] != null) ? h('button', { class: 'abtn', onclick: () => { const r = Diplomacy.propose(game, pl.id, o.id, 'alliance'); UI.toast(U.esc(r.text)); render(); } }, 'Alliance') : null,
              (st === 'peace' || st === 'alliance') ? (() => { const shut = !!(pl.closedTo && pl.closedTo[o.id]);
                const bt = h('button', { class: 'abtn', onclick: () => { const r = Diplomacy.closeBorders(game, pl.id, o.id, !shut); if (r.ok) { UI.toast(shut ? 'Votre territoire est rouvert à ' + U.esc(o.name) + '.' : 'Territoire interdit à ' + U.esc(o.name) + (r.moved ? ' : ' + U.n(r.moved, 'unité reconduite', 'unités reconduites') + ' à la frontière.' : '.')); MapView.bumpVis(); App.refresh(); } else UI.toast(U.esc(r.why), 'warn'); render(); } }, shut ? 'Rouvrir le territoire' : 'Interdire le territoire');
                UI.tipOn(bt, shut ? 'Ses troupes pourront de nouveau traverser votre territoire.' : 'Ses troupes, éclaireurs compris, n\'entrent plus sur votre territoire ; celles qui s\'y trouvent sont reconduites à la frontière. Il ne l\'apprécie guère.');
                return bt; })() : null,
              h('button', { class: 'abtn', disabled: pl.gold < 50, onclick: () => { const r = Diplomacy.propose(game, pl.id, o.id, 'tribute', 50); UI.toast(U.esc(r.text)); render(); App.refresh(); } }, 'Offrir 50 or'),
              st !== 'war' && !o.human ? h('button', { class: 'abtn', onclick: () => Panels.spellTrade(o, render) }, 'Sorts') : null,
              // un traité se dénonce : il prend fin quelques tours plus tard, et la guerre qui suit ne coûte pas l'estime des autres sorciers
              (st === 'peace' || st === 'alliance') && !(pl.denounced && pl.denounced[o.id] != null) ? (() => {
                const bt = h('button', { class: 'abtn', onclick: async () => { if (await UI.confirm('Dénoncer le traité', 'Dénoncer votre ' + Diplomacy.stateName(st).toLowerCase() + ' avec ' + U.esc(o.name) + ' ? Il prendra fin dans ' + Diplomacy.DENOUNCE_TURNS + ' tours, et ' + U.esc(o.name) + ' en sera averti.', 'Dénoncer')) { Diplomacy.denounce(game, pl.id, o.id); UI.toast('Traité dénoncé : il prendra fin dans ' + Diplomacy.DENOUNCE_TURNS + ' tours.'); render(); App.refresh(); } } }, 'Dénoncer');
                UI.tipOn(bt, 'Le traité prend fin dans ' + Diplomacy.DENOUNCE_TURNS + ' tours. Une guerre déclarée ensuite ne ternit pas votre réputation, mais il le prend mal.');
                return bt; })() : null,
              st !== 'war' ? h('button', { class: 'abtn danger', onclick: async () => { const pend = pl.denounced && pl.denounced[o.id] != null; if (await UI.confirm('Déclarer la guerre', 'Déclarer la guerre à ' + U.esc(o.name) + ' ?' + (st === 'peace' || st === 'alliance'
                ? (pend ? ' Votre traité court encore ' + U.n(Math.max(1, pl.denounced[o.id] - game.turn), 'tour') + ' : le rompre maintenant ternira votre réputation auprès de tous les sorciers.'
                  : ' Rompre votre ' + Diplomacy.stateName(st).toLowerCase() + ' ternira votre réputation auprès de tous les sorciers. Pour l\'éviter, dénoncez-le : il prendra fin dans ' + Diplomacy.DENOUNCE_TURNS + ' tours.') : ''))) { const r = Diplomacy.propose(game, pl.id, o.id, 'war'); if (r && r.text) UI.toast(U.esc(r.text)); render(); } } }, 'Guerre') : null));
          box.append(act);
        }
        return box;
      };
      // les inconnus en dernier, pour ne rien laisser deviner de l'ordre des joueurs
      // les sorciers nés sur l'autre plan n'apparaissent qu'une fois rencontrés
      const order = game.players.filter(o => o === pl || Players.knows(game, pl.id, o.id) || o.plane === pl.plane)
        .sort((a, b) => (Players.knows(game, pl.id, b.id) - Players.knows(game, pl.id, a.id)));
      const list = h('div', { class: 'list' }, ...order.map(card));
      body.append(Panels.forces(game, pl), list);
    };
    render();
  },
  // ce qu'on sait d'un sorcier rencontré (écran des sorciers, propositions) : dons et peuple ; cités repérées, puissance, sorts, renommée
  wizardFacts(game, pl, o, opts = {}) {
    const cap = game.cities[o.fortress], capKnown = opts.capital && cap && cap.owner === o.id && Intel.knows(game, pl, cap.plane, cap.x, cap.y);
    return [h('div', { class: 'muted', style: 'font-size:12px' }, (o.retorts.map(r => DATA.retorts[r] ? DATA.retorts[r].name : r).join(', ') || 'Aucun don') + ' · ' + DATA.races[o.race].name),
      h('div', { class: 'muted', style: 'font-size:12px' }, (o === pl ? U.n(Cities.ofPlayer(game, o.id).length, 'cité') : U.n(Intel.locatedOf(game, pl, o.id), 'cité repérée', 'cités repérées')) + (opts.capital ? (capKnown ? ' (capitale : ' + cap.name + ')' : ' (capitale inconnue)') : '') + ' · puissance ' + Magic.power(game, o) + ' · ' + U.n(o.known.length, 'sort') + ' · renommée ' + Players.fame(game, o))];
  },
  // son armée et son score estimés face aux vôtres (comme au rapport de forces), et la qualité du renseignement
  forceLine(game, pl, o) {
    const v = Intel.overview(game, pl, o.id), me = Intel.overview(game, pl, pl.id); if (!v || !me) return null;
    const n = x => U.fmt(Math.round(x)), est = (x, lo, hi) => v.exact || lo == null ? n(x) : '≈ ' + n(x) + ' (' + n(lo) + ' à ' + n(hi) + ')';
    const a = v.a, lab = !v.exact && a ? Intel.intelLabel(a.precision) : null;
    return h('div', { class: 'muted', style: 'font-size:12px', html: 'Armée ' + est(v.army, v.armyLo, v.armyHi) + ', la vôtre ' + n(me.army) + ' · score ' + est(v.score, v.scoreLo, v.scoreHi) + ', le vôtre ' + n(me.score)
      + (lab ? ' · renseignement <b class="' + (a.precision >= 0.6 ? 'ok' : a.precision >= 0.35 ? 'gold' : 'danger') + '">' + lab + '</b>' : '') });
  },
  // ce qui pèse sur ses décisions envers vous : raisons de son attitude, traité dénoncé, ce que disent ses émissaires, guerre qui lui coûte, meneur à abattre
  wizardSignals(game, pl, o) {
    const st = pl.diplo[o.id] || 'none';
    const rite = typeof Rite !== 'undefined' && Rite.active(game);
    return [
      // Hardcore : le pacte contre celui qui domine la partie
      rite && rite.target === o.id ? h('div', { class: 'gold', style: 'font-size:12px' }, rite.phase === 'ritual' ? 'Visé par un pacte : le Démon légendaire est en invocation (' + rite.progress + ' / ' + rite.cost + ' mana).' : 'Visé par un pacte : le Démon légendaire marche contre lui.') : null,
      Panels.reasonsBox(game, o, pl),
      o.denounced && o.denounced[pl.id] != null ? h('div', { class: 'danger', style: 'font-size:12px' }, 'A dénoncé votre traité : il prend fin dans ' + U.n(Math.max(1, o.denounced[pl.id] - game.turn), 'tour') + '.') : null,
      pl.denounced && pl.denounced[o.id] != null ? h('div', { class: 'gold', style: 'font-size:12px' }, 'Vous avez dénoncé ce traité : fin dans ' + U.n(Math.max(1, pl.denounced[o.id] - game.turn), 'tour') + '.') : null,
      (() => { const said = o.aiPlanSaid && o.aiPlanSaid[pl.id]; if (!said || game.turn - said.turn > 30) return null;
        const tg = said.target === pl.id ? U.txt('vous') : said.target != null ? Players.nameFor(game, pl.id, said.target) : '';
        const txt = said.kind === 'war' ? 'Ses émissaires : une campagne contre ' + tg + '.' : said.kind === 'defend' ? 'Ses émissaires : il se retranche face à ' + tg + '.' : said.kind === 'expand' ? 'Ses émissaires : il fonde de nouvelles cités.' : null;
        return txt ? h('div', { class: said.kind === 'war' && said.target === pl.id ? 'danger' : 'muted', style: 'font-size:12px' }, txt + ' (tour ' + said.turn + ')') : null; })(),
      st === 'war' && !o.human && Diplomacy.weariness(game, o, pl) > 0.3 ? h('div', { class: 'ok', style: 'font-size:12px' }, 'Cette guerre lui coûte cher : il est prêt à la paix.') : null,
      // dès Difficile : ce sorcier voit-il un meneur à abattre ?
      (() => { if (o.human || !AI.feat(o, 'coalition', 2)) return null; const L = Diplomacy.leaderFor(game, o); if (!L || L.id === o.id) return null;
        return h('div', { class: L.id === pl.id ? 'danger' : 'gold', style: 'font-size:12px' }, L.id === pl.id ? 'Votre avance l\'inquiète : il cherche à se liguer contre vous.' : 'Voit en ' + Players.nameFor(game, pl.id, L.id) + ' la menace commune.'); })(),
    ].filter(Boolean);
  },
  // pourquoi il vous aime ou vous déteste : les principales raisons, la liste complète au survol
  reasonsBox(game, o, pl) {
    const rs = Diplomacy.reasons(game, o.id, pl.id); if (!rs.length) return null;
    const line = x => '<div><b class="' + (x.v > 0 ? 'ok' : 'danger') + '">' + (x.v > 0 ? '+' : '−') + Math.round(Math.abs(x.v)) + '</b> ' + U.esc(x.label) + '</div>';
    const box = h('div', { class: 'reasons', html: rs.slice(0, 3).map(line).join('') + (rs.length > 3 ? '<div class="dim">… et ' + (rs.length - 3) + ' autre' + (rs.length > 4 ? 's' : '') + '</div>' : '') });
    UI.tipOn(box, () => '<h4>Ce qui fait son attitude envers vous</h4>' + rs.map(line).join(''));
    return box;
  },
  // échanger des sorts avec un sorcier : ce qu'il peut vous apprendre, ce que vous pouvez lui apprendre
  spellTrade(o, after) {
    const game = App.game, pl = App.me();
    const theirs = Diplomacy.tradeable(game, o, pl), mine = Diplomacy.tradeable(game, pl, o);
    let give = theirs[0] || null, get = null;
    const body = h('div');
    const m = UI.modal({ title: 'Échange de sorts avec ' + o.name, width: 720, body });
    const sp = id => DATA.spells[id];
    const item = (id, on, pick) => { const e = h('div', { class: 'tradeitem' + (on ? ' on' : ''), onclick: pick }, h('b', { style: 'color:' + (REALM_COLORS[sp(id).realm] || '#ddd') }, sp(id).name), h('span', { class: 'dim' }, ' · ' + RARITY_NAMES[sp(id).rarity] + ' · ' + U.fmt(Diplomacy.spellValue(id)) + ' RP')); UI.tipOn(e, () => UI.spellTip(id, pl, game)); return e; };
    const draw = () => {
      body.innerHTML = '';
      const left = h('div', { class: 'tradecol' }, h('h4', null, 'Il vous apprend'), ...(theirs.length ? theirs.map(id => item(id, give === id, () => { give = give === id ? null : id; draw(); })) : [h('div', { class: 'dim' }, 'Rien que vous puissiez apprendre.')]));
      const right = h('div', { class: 'tradecol' }, h('h4', null, 'Vous lui apprenez'), ...(mine.length ? mine.map(id => item(id, get === id, () => { get = get === id ? null : id; draw(); })) : [h('div', { class: 'dim' }, 'Rien qu\'il puisse apprendre.')]));
      body.append(h('div', { class: 'tradegrid' }, left, right));
      const vg = give ? Diplomacy.spellValue(give) : 0, vr = get ? Diplomacy.spellValue(get) : 0;
      const ans = get ? Diplomacy.tradeAnswer(game, pl, o, give, get) : null;
      const verdict = !get ? 'Choisissez au moins un sort à lui apprendre.' : !give ? 'Un présent : il vous en saura gré.' : ans.ok ? 'Il acceptera ce marché.' : ans.why;
      body.append(h('div', { class: ans && ans.ok ? 'ok' : 'dim', style: 'margin-top:8px' }, verdict + (give && get ? ' (vous recevez ' + U.fmt(vg) + ' RP, il reçoit ' + U.fmt(vr) + ' RP)' : '')),
        h('div', { style: 'display:flex;gap:6px;justify-content:flex-end;margin-top:8px' },
          h('button', { class: 'abtn', onclick: () => m.close() }, 'Fermer'),
          h('button', { class: 'abtn primary', disabled: !get, onclick: () => { const r = Diplomacy.proposeTrade(game, pl.id, o.id, give, get); UI.toast(U.esc(r.text), r.ok ? '' : 'warn'); if (r.ok) { m.close(); App.refresh(); if (after) after(); } else draw(); } }, give ? 'Proposer l\'échange' : 'Offrir ce sort')));
    };
    draw();
  },
  // la cité où mène le portrait d'un sorcier : sa capitale si on en connaît l'emplacement, sinon la plus grande de ses cités repérées
  wizardGoal(game, pl, o) {
    const mine = Cities.ofPlayer(game, o.id).filter(c => o === pl || Intel.knows(game, pl, c.plane, c.x, c.y));
    if (!mine.length) return null;
    return mine.find(c => c.fortress && c.id === o.fortress) || mine.slice().sort((a, b) => b.pop - a.pop)[0];
  },
  // l'évolution du rapport de forces, telle que vous l'avez perçue tour après tour (bande : la fourchette de l'estimation)
  // le graphique des forces : désormais l'onglet Courbes de la chronique
  forcesChart(game, pl) { return Panels.chronicle(game, { tab: 'curves' }); },
  // courbes : une série par sorcier ({ t, v, lo, hi, ex }) ; bande pour les estimations, réticule au survol, repères des moments clés
  lineChart(game, series, o) {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    const n = v => U.fmt(Math.round(v)), hidden = o.hidden || new Set();
    const ids = [...series.keys()].sort((a, b) => (b === o.me) - (a === o.me) || a - b);
    const turns = [...new Set([].concat(...[...series.values()].map(s => s.map(p => p.t))))].sort((a, b) => a - b);
    const box = h('div');
    if (turns.length < 2) { box.append(h('div', { class: 'dim', style: 'padding:30px 0;text-align:center' }, 'La courbe se remplit tour après tour : revenez dans quelques tours.')); return box; }
    const W = o.W || 900, H = o.H || 340, L = 52, R = 14, T = 10, B = o.marks ? 40 : 26;
    const t0 = turns[0], t1 = turns[turns.length - 1];
    let ymax = 1; for (const id of ids) if (!hidden.has(id)) for (const p of series.get(id)) ymax = Math.max(ymax, p.hi);
    const mag = Math.pow(10, Math.floor(Math.log10(ymax))), f = ymax / mag, step = mag * (f > 5 ? 2 : f > 2 ? 1 : 0.5);
    ymax = Math.ceil(ymax / step) * step;
    const X = t => L + (t1 === t0 ? 0 : (t - t0) / (t1 - t0)) * (W - L - R), Y = v => T + (1 - v / ymax) * (H - T - B);
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', style: 'display:block;font:11px system-ui;color:#8f8a80' });
    for (let v = 0; v <= ymax + 1e-9; v += step) {
      svg.append(el('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), stroke: 'currentColor', 'stroke-opacity': v ? 0.16 : 0.4 }));
      const tx = el('text', { x: L - 6, y: Y(v) + 4, 'text-anchor': 'end', fill: 'currentColor' }); tx.textContent = step < 1 ? String(Math.round(v * 10) / 10).replace('.', ',') : n(v); svg.append(tx);
    }
    const span = Math.max(1, t1 - t0), tstep = [1, 2, 5, 10, 20, 25, 50, 100, 200].find(s => span / s <= 10) || 500;
    for (let t = Math.ceil(t0 / tstep) * tstep; t <= t1; t += tstep) { const tx = el('text', { x: X(t), y: H - (o.marks ? 22 : 8), 'text-anchor': 'middle', fill: 'currentColor' }); tx.textContent = t; svg.append(tx); }
    const col = id => game.players[id] ? game.players[id].color : '#888';
    for (const id of ids) {
      const pts = series.get(id); if (hidden.has(id) || !pts.some(p => !p.ex)) continue;
      svg.append(el('path', { d: pts.map((p, i) => (i ? 'L' : 'M') + X(p.t) + ' ' + Y(p.hi)).join(' ') + ' ' + pts.slice().reverse().map(p => 'L' + X(p.t) + ' ' + Y(p.lo)).join(' ') + ' Z', fill: col(id), 'fill-opacity': 0.1, stroke: 'none' }));
    }
    for (const id of ids.slice().reverse()) {
      if (hidden.has(id)) continue;
      const pts = series.get(id);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.t) + ' ' + Y(p.v)).join(' ') + (pts.length === 1 ? ' l 0.1 0' : '');
      svg.append(el('path', { d, fill: 'none', stroke: col(id), 'stroke-width': id === o.me ? 2.6 : 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': id === o.me || !pts.some(p => !p.ex) ? 'none' : '6 4' }));
      // la fin d'une courbe avant la fin de la partie : un sorcier tombé
      const last = pts[pts.length - 1]; if (last.t < t1 && o.fallen && o.fallen.has(id)) { const tx = el('text', { x: X(last.t), y: Y(last.v) - 5, 'text-anchor': 'middle', fill: col(id), 'font-size': 13 }); tx.textContent = '✝'; svg.append(tx); }
    }
    // repères des moments clés, sous l'axe des tours
    const marks = o.marks || [], byT = new Map();
    for (const mk of marks) { if (mk.t < t0 || mk.t > t1) continue; if (!byT.has(mk.t)) byT.set(mk.t, []); byT.get(mk.t).push(mk); }
    for (const [t, l] of byT) { const x = X(t), y = H - 10; svg.append(el('path', { d: 'M' + x + ' ' + (y - 6) + ' l5 6 l-5 6 l-5 -6 Z', fill: l[0].color || '#d9b25a', stroke: '#141821', 'stroke-width': 1 })); if (l.length > 1) { const tx = el('text', { x: x + 7, y: y + 4, fill: 'currentColor', 'font-size': 10 }); tx.textContent = l.length; svg.append(tx); } }
    const axis = el('text', { x: L - 6, y: H - (o.marks ? 22 : 8), 'text-anchor': 'end', fill: 'currentColor' }); axis.textContent = U.txt('tour'); svg.append(axis);
    const cross = el('line', { y1: T, y2: H - B, stroke: 'currentColor', 'stroke-opacity': 0.55, visibility: 'hidden' }); svg.append(cross);
    const dots = el('g', { visibility: 'hidden' }); svg.append(dots);
    const wrap = h('div', { style: 'position:relative' });
    const tip = h('div', { style: 'position:absolute;top:12px;display:none;pointer-events:none;padding:7px 10px;border-radius:8px;background:rgba(12,16,22,.97);border:1px solid var(--line2);font-size:12px;z-index:5;max-width:360px' });
    const move = ev => {
      const bx = svg.getBoundingClientRect(), sx = (ev.clientX - bx.left) * W / bx.width;
      let best = turns[0], bd = Infinity; for (const t of turns) { const d = Math.abs(X(t) - sx); if (d < bd) { bd = d; best = t; } }
      // un repère proche l'emporte sur le tour le plus proche, pour qu'on puisse lire chaque moment
      for (const t of byT.keys()) if (Math.abs(X(t) - sx) < 5 && Math.abs(X(t) - sx) <= bd) best = t;
      cross.setAttribute('x1', X(best)); cross.setAttribute('x2', X(best)); cross.setAttribute('visibility', 'visible');
      dots.innerHTML = ''; dots.setAttribute('visibility', 'visible');
      tip.innerHTML = ''; tip.append(h('div', { class: 'dim', style: 'margin-bottom:3px' }, 'Tour ' + best));
      const rows = [];
      for (const id of ids) {
        if (hidden.has(id)) continue;
        const p = series.get(id).find(q => q.t === best); if (!p) continue;
        dots.append(el('circle', { cx: X(p.t), cy: Y(p.v), r: 4, fill: col(id), stroke: '#141821', 'stroke-width': 2 }));
        rows.push({ p, id });
      }
      rows.sort((a, b) => b.p.v - a.p.v);
      for (const { p, id } of rows) {
        const nm = h('span', { class: 'dim' }); nm.textContent = ' ' + o.who(id);
        tip.append(h('div', { style: 'white-space:nowrap' }, h('i', { style: 'display:inline-block;width:12px;height:2px;vertical-align:middle;margin-right:6px;background:' + col(id) }), h('b', null, (p.ex ? '' : '≈ ') + n(p.v)), p.ex ? null : h('span', { class: 'dim' }, ' (' + n(p.lo) + ' à ' + n(p.hi) + ')'), nm));
      }
      for (const mk of byT.get(best) || []) tip.append(h('div', { style: 'margin-top:3px;white-space:normal;color:var(--gold)' }, mk.icon + ' ' + mk.text));
      tip.style.display = 'block';
      const px = X(best) * bx.width / W, right = px > bx.width * 0.6;
      tip.style.left = right ? '' : (px + 14) + 'px'; tip.style.right = right ? (bx.width - px + 14) + 'px' : '';
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); dots.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; });
    wrap.append(svg, tip); box.append(wrap);
    if (o.legend !== false) box.append(h('div', { style: 'display:flex;gap:6px 16px;flex-wrap:wrap;margin-top:6px;font-size:12.5px' }, ...ids.map(id => {
      const off = hidden.has(id);
      const s = h('span', { style: 'cursor:pointer;user-select:none;' + (off ? 'opacity:.4;text-decoration:line-through' : ''), title: off ? 'Afficher' : 'Masquer', onclick: () => { if (off) hidden.delete(id); else hidden.add(id); if (o.redraw) o.redraw(); } },
        h('i', { style: 'display:inline-block;width:18px;height:0;vertical-align:middle;margin-right:5px;border-top:' + (id === o.me || !series.get(id).some(p => !p.ex) ? '3px solid ' : '2px dashed ') + col(id) }));
      s.append(document.createTextNode(o.who(id)));
      return s;
    })));
    return box;
  },
  // la chronique de la partie : courbes de chaque sorcier, moments clés, grandes batailles. En cours de partie, ce que vous savez ;
  // une fois la partie finie, tout.
  chronicle(game, opts) {
    opts = opts || {};
    const me = App.me(), viewer = me.id, reveal = !!(opts.reveal || game.over), ch = Chronicle.of(game);
    const body = h('div', { style: 'min-height:420px' });
    const m = UI.modal({ title: 'Chronique de la partie', width: 960, body });
    let tab = opts.tab || 'curves', field = 'score', details = false;
    const hidden = new Set();
    const who = id => U.cap(Chronicle.who(game, viewer, id, reveal)) + (id === viewer ? '' : '');
    const goTo = x => { if (x.x == null) return; UI.closeAll(); MapView.plane = x.plane || 0; MapView.centerOn(x.x, x.y, x.plane || 0); App.refresh(); };
    const evs = () => ch.ev.filter(e => Chronicle.visible(game, e, viewer, reveal) && (details || !(Chronicle.KINDS[Chronicle.kindOf(e)] || {}).minor));
    const evColor = e => { const p = game.players[e.a]; return p && (reveal || e.a === viewer || (me.contact && me.contact[e.a])) ? p.color : '#d9b25a'; };
    const draw = () => {
      body.innerHTML = '';
      body.append(h('div', { class: 'tabs' }, ...[['curves', 'Courbes'], ['moments', 'Moments clés'], ['battles', 'Grandes batailles']].map(([k, l]) => h('div', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; draw(); } }, l))));
      if (ch.from > 1) body.append(h('div', { class: 'dim', style: 'font-size:11.5px;margin-bottom:6px' }, 'La chronique commence au tour ' + ch.from + ' : la partie a débuté avant qu\'elle n\'existe.'));
      if (tab === 'curves') {
        const fields = Chronicle.FIELDS;
        body.append(h('div', { class: 'tabs', style: 'margin-bottom:6px' }, ...fields.map(k => h('div', { class: 'tab' + (field === k ? ' on' : ''), style: 'font-size:11.5px;padding:4px 9px', onclick: () => { field = k; draw(); } }, Chronicle.LABELS[k]))));
        const series = Chronicle.series(game, viewer, field, reveal);
        const marks = evs().filter(e => (Chronicle.KINDS[Chronicle.kindOf(e)] || {}).major).map(e => ({ t: e.t, text: Chronicle.text(game, e, viewer, reveal), icon: (Chronicle.KINDS[Chronicle.kindOf(e)] || {}).icon || '•', color: evColor(e) }));
        const fallen = new Set(ch.ev.filter(e => e.k === 'eliminated' && Chronicle.visible(game, e, viewer, reveal)).map(e => e.a));
        body.append(Panels.lineChart(game, series, { me: viewer, who, hidden, marks, fallen, redraw: draw }));
        const note = reveal ? 'Les vraies valeurs de chaque sorcier, tour après tour. Les losanges sous l\'axe marquent les moments clés : survolez-les.'
          : field === 'score' || field === 'army' ? 'Vos rivaux en pointillé, tels que vos renseignements les estimaient à chaque tour ; la bande colorée montre la fourchette. À la fin de la partie, la chronique révélera leurs vraies courbes.'
          : Chronicle.PUBLIC.includes(field) ? 'Les rivaux que vous avez rencontrés, depuis la rencontre (ces chiffres sont publics). Les autres restent dans l\'ombre jusqu\'à la fin de la partie.'
          : 'Vos chiffres seulement : ceux de vos rivaux ne seront révélés qu\'à la fin de la partie.';
        body.append(h('div', { class: 'dim', style: 'font-size:11.5px;margin-top:4px' }, note + ' Un clic sur un nom le masque.'));
      } else if (tab === 'moments') {
        const cb = h('input', { type: 'checkbox' }); cb.checked = details; cb.onchange = () => { details = cb.checked; draw(); };
        body.append(h('label', { class: 'dim', style: 'font-size:12px;display:inline-flex;gap:6px;align-items:center;margin-bottom:6px;cursor:pointer' }, cb, 'Détails : fondations de cités, héros recrutés'));
        const list = h('div', { class: 'list scroll', style: 'max-height:58vh' });
        const all = evs();
        if (!all.length) list.append(h('div', { class: 'dim' }, 'Rien de marquant pour l\'instant.'));
        let lastT = null;
        for (const e of all) {
          if (e.t !== lastT) { list.append(h('div', { class: 'gold', style: 'font-size:11.5px;margin:8px 0 2px;letter-spacing:.04em' }, 'Tour ' + e.t)); lastT = e.t; }
          const K = Chronicle.KINDS[Chronicle.kindOf(e)] || {};
          const row = h('div', { class: 'row', style: 'padding:3px 6px;gap:8px;' + (K.major ? '' : 'opacity:.85') + (e.x != null ? ';cursor:pointer' : '') },
            h('span', { style: 'width:18px;text-align:center;color:' + evColor(e) }, K.icon || '•'), h('div', { class: 'grow', style: K.major ? 'font-weight:600' : '' }, Chronicle.text(game, e, viewer, reveal)),
            e.x != null ? h('span', { class: 'dim', style: 'font-size:11px' }, 'Voir') : null);
          if (e.x != null) row.onclick = () => goTo(e);
          list.append(row);
        }
        body.append(list);
        if (!game.over) setTimeout(() => { list.scrollTop = list.scrollHeight; }, 0);
      } else {
        const bs = ch.battles.filter(b => Chronicle.battleVisible(game, b, viewer, reveal)).sort((a, b) => b.size - a.size).slice(0, 15);
        const list = h('div', { class: 'list scroll', style: 'max-height:62vh' });
        if (!bs.length) list.append(h('div', { class: 'dim' }, reveal ? 'Aucune grande bataille.' : 'Aucune grande bataille pour vos armées, pour l\'instant.'));
        for (const b of bs) {
          const tx = Chronicle.battleText(game, b, viewer, reveal);
          const side = (id, S, N, K, L) => h('div', { style: 'flex:1;min-width:0' }, h('div', { style: 'font-weight:600;color:' + (game.players[id] && (reveal || id === viewer || me.contact[id]) ? game.players[id].color : '#c66') }, U.cap(Chronicle.sideName(game, b, id === b.a ? 0 : 1, viewer, reveal))),
            h('div', { class: 'dim', style: 'font-size:11.5px' }, 'Force ' + U.fmt(S) + ' · ' + U.n(N, 'unité') + ' · pertes ' + K + (L ? ' (force ' + U.fmt(L) + ')' : '')));
          const row = h('div', { class: 'row', style: 'flex-direction:column;align-items:stretch;gap:4px;padding:8px 10px;cursor:pointer' },
            h('div', { style: 'display:flex;gap:8px;align-items:baseline' }, h('span', { class: 'gold', style: 'font-size:11.5px' }, 'Tour ' + b.t), h('b', { class: 'grow' }, tx.place), h('span', { class: b.w == null ? 'dim' : (b.w === 0 ? b.a : b.d) === viewer ? 'ok' : (b.a === viewer || b.d === viewer) ? 'danger' : '' }, tx.won)),
            h('div', { style: 'display:flex;gap:16px' }, side(b.a, b.aS, b.aN, b.aK, b.aL), h('div', { class: 'dim', style: 'align-self:center' }, 'contre'), side(b.d, b.dS, b.dN, b.dK, b.dL)),
            b.heroes ? h('div', { class: 'danger', style: 'font-size:11.5px' }, 'Tombés : ' + b.heroes.join(', ')) : null);
          row.onclick = () => goTo(b);
          list.append(row);
        }
        body.append(list, h('div', { class: 'dim', style: 'font-size:11.5px;margin-top:4px' }, 'Les batailles les plus grandes par la force engagée des deux camps (à pleine santé). ' + (reveal ? '' : 'Seulement celles de vos armées : les autres seront révélées à la fin de la partie.')));
      }
    };
    draw();
    return m;
  },
  // rapport de forces : votre score et votre armée, ceux des rivaux rencontrés estimés d'après vos renseignements
  forces(game, pl) {
    const rows = game.players.filter(o => o.alive && (o === pl || pl.contact[o.id])).map(o => ({ o, v: Intel.overview(game, pl, o.id) })).filter(r => r.v);
    if (rows.length < 2) return null;
    rows.sort((a, b) => b.v.score - a.v.score);
    const n = v => U.fmt(Math.round(v));
    const est = (x, lo, hi, exact) => exact || lo == null ? '<b>' + n(x) + '</b>' : '<b>≈ ' + n(x) + '</b> <span class="dim">(' + n(lo) + ' à ' + n(hi) + ')</span>';
    const tbl = h('table', { class: 't' });
    const th = h('tr', null, h('th', null, 'Sorcier'), h('th', null, 'Score'), h('th', null, 'Armée'), h('th', null, 'Renseignement'));
    UI.tipOn(th.children[1], '<h4>Score</h4>Cités ×40, puissance magique ×3, sorts connus ×4, renommée ×2, armée ÷10. C\'est la mesure qu\'emploient les sorciers rivaux pour désigner le meneur de la partie. Pour un rival, le nombre de ses cités et son armée sont estimés.');
    UI.tipOn(th.children[2], '<h4>Armée</h4>Force cumulée des unités. Pour un rival : les unités vues ces 20 derniers tours, plus une estimation de ce qui vous échappe, d\'après ses cités repérées, sa puissance magique et les terres que vous n\'avez pas explorées. La fourchette se resserre à mesure que vos renseignements s\'améliorent.');
    tbl.append(th);
    for (const { o, v } of rows) {
      // la qualité du renseignement en mots : on ne sait pas exactement ce qu'on ignore
      const a = v.a, lab = a ? Intel.intelLabel(a.precision) : null;
      const intel = v.exact ? '<span class="dim">exact</span>' : '<b class="' + (a.precision >= 0.6 ? 'ok' : a.precision >= 0.35 ? 'gold' : 'danger') + '">' + lab + '</b> <span class="dim">· ' + (a.lastSeen != null ? 'troupes vues il y a ' + (a.lastSeen ? U.n(a.lastSeen, 'tour') : 'moins d\'un tour') : 'aucune troupe vue récemment') + '</span>';
      tbl.append(h('tr', null, h('td', null, h('b', { style: 'color:' + o.color }, o === pl ? o.name + ' (vous)' : o.name)),
        h('td', { html: est(v.score, v.scoreLo, v.scoreHi, v.exact) }), h('td', { html: est(v.army, v.armyLo, v.armyHi, v.exact) }), h('td', { html: intel })));
    }
    return h('div', { class: 'sect', style: 'margin-bottom:10px' }, h('div', { style: 'display:flex;align-items:center;gap:10px' }, h('h4', { style: 'margin:0' }, 'Rapport de forces'), h('button', { class: 'abtn mini', onclick: () => Panels.forcesChart(game, pl) }, 'Graphique')), tbl,
      h('div', { class: 'dim', style: 'font-size:11.5px;margin-top:4px' }, 'Le renseignement s\'améliore quand vous voyez ses cités et ses troupes, et à mesure que vous explorez le monde.'));
  },

  foreignCity(c) {
    const game = App.game;
    const owner = game.players[c.owner];
    const vis = MapView.vis && MapView.vis[c.plane][c.y * game.world.w + c.x];
    const garrison = vis ? Units.at(game, c.plane, c.x, c.y).filter(u => !Intel.hiddenFrom(game, App.pid, u)) : [];
    // le sorcier qui la tient : son portrait, et un clic mène à la diplomatie (inconnu : ni portrait ni nom)
    let wiz = null, m = null;
    if (owner) {
      const known = !!App.me().contact[owner.id];
      if (known) {
        const pic = spriteCanvas('wizard:' + owner.portrait, 32); pic.className = 'portrait'; pic.style.cssText = 'width:64px;height:64px;cursor:pointer;--pc:' + owner.color;
        const st = App.me().diplo[owner.id] || 'none';
        wiz = h('div', { style: 'display:flex;gap:12px;align-items:center;margin-bottom:10px;cursor:pointer', title: 'Diplomatie avec ' + owner.name, onclick: () => { if (m) m.close(); Panels.wizards(owner.id); } }, pic,
          h('div', null, h('div', { class: 'serif', style: 'font-size:17px;color:' + owner.color }, owner.name), h('div', { class: 'muted', style: 'font-size:12px' }, 'Traité : ' + Diplomacy.stateName(st) + ' · cliquez pour lui parler')));
      } else wiz = h('div', { style: 'display:flex;gap:12px;align-items:center;margin-bottom:10px' }, h('div', { class: 'portrait unknown' }, '?'), h('div', { class: 'dim' }, 'Un sorcier que vous n\'avez jamais rencontré'));
    }
    const body = h('div', null,
      wiz,
      h('div', { class: 'muted' }, (vis ? Cities.sizeName(c) + ' de ' + DATA.races[c.race].name + ' · ' + U.fmt(c.pop) + ' habitants · ' : 'Cité de ' + DATA.races[c.race].name + ' (hors de vue) · ') + (owner ? 'cité ' + App.de(Players.nameFor(game, App.pid, owner.id)) : 'cité indépendante')),
      c.buildings.cityWalls ? h('div', { class: 'gold' }, c.buildings.defenseTowers ? 'Protégée par des murailles et des tours de défense.' : 'Protégée par des murailles.') : null,
      App.fallNote(c),
      App.bookNote(c),
      !vis ? (() => { const rep = App.intelAt(c.plane, c.x, c.y); return h('div', { class: 'muted', style: 'margin-top:6px' }, rep ? 'Dernier rapport ' + UI.ago(game.turn - rep.t) + ' : ' + (rep.units.length ? U.n(rep.units.length, 'défenseur') + ' (' + U.uniq(rep.units.map(u => DATA.units[u.type].name)).join(', ') + ')' : 'aucun défenseur') + '.' : 'Hors de vue : garnison inconnue.'); })() : null,
      vis ? h('div', { class: 'ucards', style: 'grid-template-columns:repeat(6,1fr);margin-top:8px' }, ...garrison.map(u => { const el = h('div', { class: 'ucard' }, UI.glowCanvas(spriteCanvas(Sprites.unitKey(u), 32), game, u), h('div', { class: 'nm' }, Units.label(u))); UI.tipOn(el, () => UI.unitTip(u, game)); return el; })) : h('div', { class: 'dim', style: 'margin-top:6px' }, 'Garnison invisible : envoyez une unité à proximité.'),
      vis && c.ench.length ? h('div', { style: 'margin-top:6px' }, ...c.ench.filter(e => DATA.spells[e.spell]).map(e => { const sp = DATA.spells[e.spell], curse = sp.kind === 'cityCurse';
        const el = h('span', { class: 'abl ' + (curse ? '' : 'e'), style: curse ? 'border-color:#7a2a2a;color:#ffb0b0' : '' }, sp.name + (e.realm && REALM_NAMES[e.realm] ? ' (' + REALM_NAMES[e.realm] + ')' : ''));
        UI.tipOn(el, () => UI.spellTip(e.spell, game.players[e.owner], game) + (e.owner !== c.owner && game.players[e.owner] ? '<div class="danger">Lancée par ' + U.esc(Players.nameFor(game, App.pid, e.owner)) + '</div>' : '')); return el; })) : null);
    m = UI.modal({ title: c.name, width: 560, body });
  },

  // top : rouvert après un réglage, au même défilement (le clic suivant tombe sur la même ligne, pas sur une autre) ; le second
  // clic d'un double-clic n'y bascule pas le réglage une deuxième fois
  menu(top) {
    const body = h('div', { class: 'list' });
    const m = UI.modal({ title: 'Menu', width: 520, body }), t0 = performance.now();
    const again = () => { const y = m.body.scrollTop; m.close(); Panels.menu(y); };
    const row = (t, d, fn) => body.append(h('div', { class: 'row', onclick: e => { if (top != null && performance.now() - t0 < 400) return; fn(e); } }, h('div', { class: 'grow' }, h('div', { class: 't1' }, t), h('div', { class: 't2' }, d))));
    row('Sauvegarder', 'Enregistrer dans le navigateur', async () => {
      const old = App.saveMeta('manual');
      if (old && old.uid !== App.game.uid && !await UI.confirm('Sauvegarder', 'Remplacer la sauvegarde manuelle d\'une autre partie (' + U.esc(old.name || '?') + ', tour ' + old.turn + ') ?', 'Remplacer')) return;
      const ok = App.save('manual'); UI.toast(ok ? 'Partie sauvegardée.' : 'Échec de la sauvegarde.', ok ? '' : 'warn'); m.close(); });
    row('Charger', 'Reprendre la dernière sauvegarde manuelle ou automatique', () => { m.close(); Setup.loadMenu(); });
    row('Exporter la partie', 'Télécharger un fichier de sauvegarde', () => App.exportSave());
    // la sauvegarde téléchargée tous les N tours (10 par défaut)
    { const on = App.prefs.autoExport > 0, n = App.prefs.autoExportN || 10;
      const num = h('input', { type: 'number', min: 1, max: 200, step: 1, value: n, style: 'width:64px', onclick: e => e.stopPropagation(),
        onchange: e => { const v = Math.max(1, Math.min(200, Math.round(+e.target.value) || 10)); e.target.value = v; App.setPref('autoExportN', v); if (App.prefs.autoExport > 0) App.setPref('autoExport', v); lab.textContent = App.prefs.autoExport > 0 ? 'tous les ' + v + ' tours' : 'coupée'; } });
      const lab = h('span', null, on ? 'tous les ' + n + ' tours' : 'coupée');
      body.append(h('div', { class: 'row', onclick: () => { App.setPref('autoExport', App.prefs.autoExport > 0 ? 0 : (App.prefs.autoExportN || 10)); again(); } },
        h('div', { class: 'grow' }, h('div', { class: 't1' }, 'Sauvegarde téléchargée automatiquement : ', lab),
          h('div', { class: 't2' }, 'Un fichier de sauvegarde arrive dans vos téléchargements à la fin du tour, tous les ', num, ' tours.')))); }
    // la copie locale : les nouvelles versions publiées sur GitHub (src/ui/update.js)
    if (Update.isLocalCopy()) {
      if (Update.newer.length) row('Nouvelle version disponible : ' + Update.newer[0].version, 'Notes de version et téléchargement', () => { m.close(); Update.dialog(); });
      const on = Update.enabled();
      row('Recherche des nouvelles versions : ' + (on ? 'activée' : 'coupée'), 'Au lancement, le jeu demande à GitHub si une version plus récente est parue', async () => {
        App.setPref('checkUpdates', !on); m.close();
        if (!on) { const r = await Update.check(true); if (r && r.length) { Update.dialog(); return; } if (r) UI.toast('Vous avez la dernière version (' + GAME_VERSION + ').', '', 'update'); }
        Panels.menu(); });
    }
    row('Encyclopédie', 'Unités, sorts, bâtiments et races', () => { m.close(); Panels.encyclopedia(); });
    if (I18N.available().length > 1) row('Langue : ' + (I18N.LANGS.find(l => l.id === I18N.lang) || {}).name, 'Le jeu se recharge dans la langue choisie ; la partie en cours est sauvegardée', async () => {
      const v = await UI.choice('Langue', '', I18N.available().map(l => ({ label: l.name, value: l.id, primary: l.id === I18N.lang })));
      if (v) I18N.switchTo(v); });
    row('Aide et raccourcis', 'Contrôles du jeu', () => { m.close(); Panels.help(); });
    row('Son : ' + (Sfx.on ? 'activé' : 'coupé'), 'Effets de combat, de magie et d\'interface, synthétisés dans le navigateur (coupe aussi la musique)', () => { Sfx.setOn(!Sfx.on); const t = $('#tb-sound span'); if (t) t.innerHTML = ICONS[Sfx.on ? 'sound' : 'mute']; again(); });
    row('Musique : ' + (Sfx.music ? 'activée' : 'coupée'), Music.hasTracks() ? 'Bande originale orchestrale : titre, Arcane, Miroir, combats, victoire et défaite' + (Music.nowPlaying() ? ' (en cours : ' + Music.nowPlaying() + ')' : '') : 'Nappes génératives discrètes (jamais la même boucle)', () => { Sfx.setMusic(!Sfx.music); again(); });
    const vol = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(Sfx.mvol * 100), style: 'width:100%', onclick: e => e.stopPropagation(), oninput: e => { Sfx.setMusicVolume(e.target.value / 100); vlab.textContent = e.target.value + ' %'; } });
    const vlab = h('span', { class: 'dim' }, Math.round(Sfx.mvol * 100) + ' %');
    body.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't1' }, 'Volume de la musique ', vlab), h('div', { class: 't2' }, vol))));
    row('Unité suivante automatique : ' + (App.prefs.autoNext ? 'activée' : 'coupée'), 'Quand une unité a épuisé ses mouvements, la sélection passe d\'elle-même à la prochaine unité qui attend des ordres', () => { App.setPref('autoNext', !App.prefs.autoNext); again(); });
    row('Ronde des éclaireurs : ' + (App.prefs.scoutRevisit !== false ? 'activée' : 'coupée'), 'Quand il n\'y a plus rien à explorer, les éclaireurs en exploration automatique revisitent les antres qu\'on croit gardés, pour vérifier que leurs gardiens y sont toujours', () => { App.setPref('scoutRevisit', App.prefs.scoutRevisit === false); again(); });
    row('Journal', 'Afficher ou masquer le journal des événements (L)', () => { $('#logbox').classList.toggle('hidden'); m.close(); });
    row('Nouvelle partie', 'Abandonner et revenir à l\'écran titre', async () => { if (await UI.confirm('Nouvelle partie', 'Quitter la partie en cours ? Sa sauvegarde automatique restera disponible : « Continuer » tant que vous ne jouez pas de tour, puis « Partie précédente ».')) { UI.closeAll(); Setup.titleScreen(); } });
    if (top) m.body.scrollTop = top;
    return m;
  },

  help() {
    const html = `<div class="grid2"><div>
      <h4 class="gold" style="margin-bottom:6px">Carte</h4>
      <div class="kv"><span>Sélectionner une pile</span><span>clic gauche</span></div>
      <div class="kv"><span>Déplacer / attaquer</span><span>double-clic sur la destination</span></div>
      <div class="kv"><span>Ordre à plusieurs tours</span><span>double-clic, même sans mouvement restant</span></div>
      <div class="kv"><span>Désélectionner</span><span>clic droit ou <span class="kbd">Échap</span></span></div>
      <div class="kv"><span>Faire défiler</span><span>glisser, flèches, mini-carte</span></div>
      <div class="kv"><span>Zoom</span><span>molette, + / -</span></div>
      <div class="kv"><span>Unité suivante</span><span class="kbd">Espace</span></div>
      <div class="kv"><span>Centrer sur la sélection</span><span class="kbd">C</span></div>
      <div class="kv"><span>Attendre / Sentinelle</span><span><span class="kbd">W</span> <span class="kbd">S</span></span></div>
      <div class="kv"><span>Exploration automatique</span><span class="kbd">X</span></div>
      <div class="kv"><span>Fonder une cité</span><span class="kbd">B</span></div>
      <div class="kv"><span>Route (ingénieurs)</span><span class="kbd">R</span></div>
      <div class="kv"><span>Changer de plan</span><span class="kbd">P</span></div>
      <div class="kv"><span>Fin du tour</span><span class="kbd">Entrée</span></div>
      </div><div>
      <h4 class="gold" style="margin-bottom:6px">Écrans</h4>
      <div class="kv"><span>Grimoire</span><span class="kbd">G</span></div><div class="kv"><span>Magie</span><span class="kbd">M</span></div><div class="kv"><span>Recherche</span><span class="kbd">R</span></div>
      <div class="kv"><span>Cités / Armées / Sorciers</span><span><span class="kbd">Maj+C</span> <span class="kbd">A</span> <span class="kbd">D</span></span></div><div class="kv"><span>Journal</span><span class="kbd">L</span></div>
      <div class="kv"><span>Menaces sur vos cités</span><span class="kbd">T</span></div><div class="kv"><span>Lieux inexplorés</span><span class="kbd">V</span></div><div class="kv"><span>Nœuds à prendre</span><span class="kbd">O</span></div><div class="kv"><span>Annuler le dernier déplacement</span><span class="kbd">U</span></div>
      <h4 class="gold" style="margin:10px 0 6px">Combat</h4>
      <div class="kv"><span>Attaquer</span><span>clic sur un ennemi encerclé</span></div><div class="kv"><span>Sorts</span><span class="kbd">S</span></div><div class="kv"><span>Automatique</span><span class="kbd">A</span></div><div class="kv"><span>Fin du tour</span><span class="kbd">Entrée</span></div>
      </div></div>
      <p class="muted" style="margin-top:10px">Nouveautés par rapport à l'original : frontières culturelles (impossible de fonder une cité en territoire étranger, 4 cases minimum entre cités ; l'espace entre des cités voisines d'un même sorcier, jusqu'à 10 cases, est à lui), répartition automatique des fermiers pour nourrir les armées, liste des cités qui revient après consultation, combats automatiques à tout moment.</p>
      <p class="muted"><b>Le voile</b> (indicateur en haut) s'use avec le temps, les passages entre les plans et les grands sorts ; à chaque seuil, des failles s'ouvrent : elles servent de passage entre Arcane et le Miroir, mais des créatures en sortent. <b>Les sanctuaires</b> (deux sur Arcane, quatre sur le Miroir) offrent un pacte : un don tout de suite, une dette plus tard. <b>La Crise</b> (réglable à la création de la partie) ouvre la Brèche, qui envoie des vagues sur le plus puissant des sorciers jusqu'à ce qu'on la referme.</p>
      <p class="muted"><b>Terrain de combat</b> (survolez une case pour ses effets) : les arbres couvrent des tirs (+2 défense) mais brûlent et le feu se propage ; une colline donne +10 % pour toucher à distance et +1 défense en mêlée ; les rochers bloquent le passage ; l'eau profonde d'une rivière ne se franchit qu'à la nage, en volant ou par l'un des deux gués, qui coûtent tout le mouvement et exposent (-1 défense) ; les fondrières des marais engluent.</p>
      <p class="muted"><b>Précision</b> : à 100 %, chaque coup porte ; au-delà, chaque tranche de 10 % ignore 1 point de défense de la cible (pas celle de la muraille).</p>
      <p class="muted"><b>Dilemmes</b> : tous les 8 à 12 tours, une situation à trancher, deux issues dont les conséquences sont écrites. <b>Némésis</b> : qui abat un de vos héros reçoit un nom, se renforce (+1 par rang en attaque, défense et résistance) et peut revenir vous chercher ; l'abattre à votre tour rapporte or, renommée et expérience.</p>
      <p class="muted"><b>Diplomatie</b> : l'écran des sorciers détaille ce qui fait l'attitude de chacun envers vous (traités, attaques, frontières, voies de magie, ennemi commun…). Un sorcier bien plus fort peut exiger de l'or ou un sort ; s'il pose un ultimatum, refuser, c'est la guerre. Les sorts s'échangent entre sorciers qui peuvent les apprendre. Un sorcier d'honneur dénonce un traité six tours avant de pouvoir attaquer ; seul un fourbe le rompt sans prévenir. Une guerre qui coûte trop rend la paix plus facile à obtenir.</p>
      <p class="muted"><b>Course à la Maîtrise</b> : qui étudie ou lance le Sort de Maîtrise, et dans combien de tours, est connu de tous (indicateur en haut). Celui qui le lance s'attire la guerre de tous les sorciers ; prendre sa forteresse l'arrête. <b>Empire étendu</b> : une cité à plus de 20 cases de la forteresse, ou sur l'autre plan, compte un rebelle de plus ; à partir de 20 cités, toutes (sauf la forteresse) en comptent un de plus.</p>
      <p class="muted"><b>Flanc et dos</b> : le chevron au sol montre où regarde l'unité (son dernier pas, sa dernière cible ; frappée, elle se retourne). Frapper de flanc donne +1 en attaque ; dans le dos, +1 et la défense de la cible divisée par deux. Une unité en garde n'a ni flanc ni dos. En cliquant sur un ennemi hors de portée, votre unité choisit d'elle-même la meilleure case.</p>
      <p class="muted"><b>Les nœuds</b> (comme dans l'original) : chaque nœud rayonne sur une aura d'autant de cases que sa puissance. Un Esprit magique ou gardien qui fusionne avec lui le lie à votre magie : son aura scintille alors à vos couleurs et vous rapporte sa puissance chaque tour (doublée par la Maîtrise des nœuds, et encore par la maîtrise de son royaume). Un combat livré sur le nœud donne +2 en attaque, défense et résistance aux créatures de son royaume, et dissipe souvent les sorts des autres royaumes (force 50 : un sort de 10 mana n'a que 17 % de chances de passer) ; la Maîtrise des nœuds en protège.</p>`;
    UI.modal({ title: 'Aide', width: 820, body: h('div', { html }) });
  },

  encyclopedia() {
    const game = App.game;
    let tab = 'units', filter = '';
    const body = h('div');
    const m = UI.modal({ title: 'Encyclopédie', width: 980, body });
    const render = () => {
      body.innerHTML = '';
      const tabs = h('div', { class: 'tabs' }, ...[['units', 'Unités'], ['creatures', 'Créatures'], ['heroes', 'Héros'], ['spells', 'Sorts'], ['buildings', 'Bâtiments'], ['races', 'Races'], ['retorts', 'Dons']].map(([k, l]) => h('div', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; render(); } }, l)));
      const search = h('input', { type: 'text', placeholder: 'Filtrer…', value: filter, style: 'width:220px;margin-bottom:8px' });
      search.oninput = () => { filter = search.value.toLowerCase(); renderList(); };
      const list = h('div', { class: 'list scroll', style: 'max-height:62vh' });
      body.append(tabs, search, list);
      const renderList = () => {
        list.innerHTML = '';
        const match = s => !filter || s.toLowerCase().includes(filter);
        if (tab === 'units' || tab === 'creatures' || tab === 'heroes') {
          const us = Object.values(DATA.units).filter(u => tab === 'units' ? !['fantastic', 'hero'].includes(u.race) : tab === 'creatures' ? u.race === 'fantastic' : u.race === 'hero');
          for (const d of us) {
            const fake = { type: d.id, ench: [], xp: 0, owner: App.pid, dmg: 0, weapon: 0, hero: d.race === 'hero' ? { name: DATA.heroes[d.id] ? DATA.heroes[d.id].name : d.name, title: DATA.heroes[d.id] ? DATA.heroes[d.id].title : '', extra: {} } : null };
            const label = (fake.hero ? fake.hero.name + ' (' + fake.hero.title + ')' : d.name) + (d.race && DATA.races[d.race] ? ' · ' + DATA.races[d.race].name : d.realm ? ' · ' + REALM_NAMES[d.realm] : '');
            if (!match(label)) continue;
            const s = Units.stats(game, fake);
            const row = h('div', { class: 'row', style: 'cursor:default' }, spriteCanvas('unit:' + d.id, 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, label), h('div', { html: UI.statLine(s, null, game) })), h('div', { class: 'dim', style: 'text-align:right;font-size:11.5px' }, d.cost ? 'Coût ' + d.cost : d.castCost ? 'Invocation ' + d.castCost : ''));
            UI.tipOn(row, () => UI.unitTip(fake, game));
            list.append(row);
          }
        } else if (tab === 'spells') {
          // les sorts du Livre de légende restent secrets tant que le joueur n'en a lu aucun fragment
          const me = App.game && App.me ? App.me() : null, bookSeen = !!(me && typeof Book !== 'undefined' && (Book.readBy(App.game, me.id).length || Book.holder(App.game) === me.id));
          const ss = Object.values(DATA.spells).filter(s => s.inGame !== false && (!s.book || bookSeen || (me && me.known.includes(s.id)))).sort((a, b) => REALMS_ORDER(a.realm) - REALMS_ORDER(b.realm) || ['common', 'uncommon', 'rare', 'veryrare'].indexOf(a.rarity) - ['common', 'uncommon', 'rare', 'veryrare'].indexOf(b.rarity));
          for (const s of ss) {
            if (!match(s.name + ' ' + REALM_NAMES[s.realm])) continue;
            const row = h('div', { class: 'row', style: 'cursor:default' }, spriteCanvas('spell:' + s.id, 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, h('span', { class: 'realmdot', style: 'color:' + REALM_COLORS[s.realm] }), s.name, h('span', { class: 'dim', style: 'font-weight:normal' }, ' · ' + RARITY_NAMES[s.rarity] + ' · ' + SECTION_NAMES[s.section])), h('div', { class: 't2' }, s.desc)), h('div', { class: 'dim', style: 'font-size:11.5px;text-align:right;white-space:nowrap' }, (s.cost != null ? s.cost + ' mana' : '') + (s.research ? h('br') && '' : ''), h('div', null, s.research ? U.fmt(s.research) + ' RP' : '')));
            list.append(row);
          }
        } else if (tab === 'buildings') {
          for (const b of Object.values(DATA.buildings).filter(b => b.buildable !== false).sort((a, b) => a.cost - b.cost)) {
            if (!match(b.name)) continue;
            list.append(h('div', { class: 'row', style: 'cursor:default' }, spriteCanvas(bldIcon(b.id), 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, b.name), h('div', { class: 't2' }, (b.desc || '') + (b.requires && b.requires.length ? ' · requiert ' + b.requires.map(r => DATA.buildings[r].name).join(', ') : ''))), h('div', { class: 'dim', style: 'text-align:right;font-size:11.5px' }, 'Coût ' + b.cost, h('br'), 'Entretien ' + b.upkeep)));
          }
        } else if (tab === 'races') {
          for (const r of Object.values(DATA.races)) {
            if (!match(r.name)) continue;
            list.append(h('div', { class: 'row', style: 'cursor:default;align-items:flex-start' }, spriteCanvas('unit:' + r.units[0], 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, r.name, h('span', { class: 'dim', style: 'font-weight:normal' }, ' · ' + (r.plane === 'myrror' ? 'Miroir' : 'Arcane'))), h('div', { class: 't2' }, r.desc + ' ' + (r.traits || []).join(' ')), h('div', { class: 't2' }, 'Unités : ' + r.units.map(t => DATA.units[t].name).join(', ')), r.cannotBuild && r.cannotBuild.length ? h('div', { class: 't2 danger' }, 'Ne peut construire : ' + r.cannotBuild.map(b => DATA.buildings[b] ? DATA.buildings[b].name : b).join(', ')) : null)));
          }
        } else if (tab === 'retorts') {
          for (const [k, r] of Object.entries(DATA.retorts)) { if (!match(r.name)) continue; list.append(h('div', { class: 'row', style: 'cursor:default' }, h('div', { class: 'grow' }, h('div', { class: 't1' }, r.name, h('span', { class: 'dim', style: 'font-weight:normal' }, ' · ' + r.cost + ' choix')), h('div', { class: 't2' }, r.desc)))); }
        }
      };
      renderList();
    };
    render();
  },
};
