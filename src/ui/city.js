'use strict';
// Écran de cité : population, ressources, bâtiments, production, garnison, enchantements.

const BUILDING_ICON = {
  barracks: 'item:shield', armory: 'item:sword:1', fightersGuild: 'item:sword:2', armorersGuild: 'item:plate', warCollege: 'item:helm:1', smithy: 'item:mace', stables: 'unit:HighMenCavalry',
  animistsGuild: 'unit:WarBear', fantasticStable: 'unit:Griffin', shipwrightsGuild: 'unit:Trireme', shipYard: 'unit:Galley', maritimeGuild: 'unit:Warship', sawmill: 'item:axe', library: 'spell:earth_lore',
  sagesGuild: 'spell:detect_magic', oracle: 'spell:awareness', alchemistsGuild: 'spell:transmute', university: 'spell:spell_blast', wizardsGuild: 'wizard:3', shrine: 'feat:altar', temple: 'feat:temple',
  parthenon: 'spell:prayer', cathedral: 'spell:high_prayer', marketplace: 'item:misc', bank: 'item:ring', merchantsGuild: 'item:amulet', granary: 'spell:gaias_blessing', farmersMarket: 'spell:herb_mastery',
  forestersGuild: 'tree:3', buildersHall: 'item:mace:1', mechaniciansGuild: 'unit:Catapult', minersGuild: 'item:axe:1', cityWalls: 'spell:wall_of_stone', defenseTowers: 'cwall:tower', fortress: 'feat:keep', summoningCircle: 'spell:summoning_circle', magicRelay: 'spell:spell_ward',
  housing: 'feat:statue', tradeGoods: 'item:misc:1',
};

// icône d'un bâtiment : son illustration (lot 2) ou, à défaut, l'ancienne icône de dépannage
function bldIcon(id) { return Sprites.hasHD(Sprites.resolve('bld:' + id) || '') ? 'bld:' + id : BUILDING_ICON[id] || (DATA.buildings[id] && DATA.buildings[id].icon) || 'item:misc'; }

const CityUI = {
  cur: null,
  // queueDone : ouverte parce que la file est terminée (bandeau sur la production)
  open(cid, queueDone) {
    return new Promise(res => {
      const game = App.game;
      const c = game.cities[cid]; if (!c) return res();
      if (CityUI.cur != null && CityUI.modalApi) CityUI.modalApi.close();   // un seul écran de cité à la fois
      CityUI.cur = cid; CityUI.queueDone = !!queueDone; CityUI.toMap = false;
      // résout « map » quand on quitte la cité pour la carte (une unité de la garnison sélectionnée) : l'écran d'origine ne se rouvre pas
      const m = UI.modal({ title: c.name, width: 1080, cls: 'citymodal', onClose: () => { const toMap = CityUI.toMap; CityUI.cur = null; CityUI.queueDone = false; CityUI.toMap = false; MapView.invalidate(); res(toMap ? 'map' : undefined); } });
      CityUI.modalApi = m;
      const head = m.el.querySelector('header'), x = head.querySelector('.x');
      head.insertBefore(h('button', { class: 'abtn', title: 'Voir où se trouve la cité (Échap pour revenir)', onclick: () => UI.peek(c.x, c.y, c.plane, c.name) }, 'Voir sur la carte'), x);
      if (c.owner === App.pid) head.insertBefore(h('button', { class: 'abtn', title: 'Donner un autre nom à la cité', onclick: () => CityUI.rename(c) }, 'Renommer'), x);
      CityUI.render();
    });
  },
  render() {
    const game = App.game, c = game.cities[CityUI.cur]; if (!c || !CityUI.modalApi) return;
    const m = CityUI.modalApi; const body = m.body; body.innerHTML = '';
    const e = Cities.econ(game, c);
    const race = DATA.races[c.race];
    const pl = game.players[c.owner];
    m.setTitle((c.fortress ? '★ ' : '') + c.name + (c.fortress ? ' · Capitale' : ''));
    // ---- en-tête : carte du bassin + identité ----
    const dpr = window.devicePixelRatio || 1, MS = 320;
    const mapC = h('canvas', { width: MS * dpr, height: MS * dpr, class: 'citymap', style: 'width:' + MS + 'px;height:' + MS + 'px' });
    CityUI.drawCatchment(mapC, c, e);
    CityUI.bindCatchmentTips(mapC, c);
    const mapBox = h('div', { class: 'citymapbox' }, h('div', { class: 'zonehead' }, 'Toute la zone travaille pour la cité'), mapC, CityUI.zoneSummary(c, e));
    const id = h('div', { style: 'flex:1;min-width:0' },
      h('div', { class: 'serif', style: 'font-size:17px' }, Cities.sizeName(c) + ' de ' + race.name),
      h('div', { class: 'muted' }, U.fmt(c.pop) + ' habitants · max ' + e.maxPop + ' citoyens · ', (() => { const g = h('span', { class: e.growth >= 0 ? 'ok' : 'danger', style: 'cursor:help;border-bottom:1px dotted currentColor' }, (e.growth >= 0 ? '+' : '') + e.growth + ' hab./tour'); UI.tipOn(g, () => CityUI.growthTip(e)); return g; })()),
      h('div', { class: 'dim', style: 'margin-top:3px' }, race.traits ? race.traits.join(' ') : ''),
      App.fallNote(c),
      App.bookNote(c),
    );
    // population : une ligne de fermiers, une ligne d'ouvriers (et les rebelles), à la manière de Master of Orion 2
    id.append(CityUI.citizensPanel(c, e));
    if (e.governor) {
      const b = e.governor, parts = ['+' + b.prodPct + ' % production', 'agitation -' + b.calm];
      if (b.gold) parts.push('+' + b.gold + ' or'); if (b.research) parts.push('+' + b.research + ' recherche'); if (b.growth) parts.push('+' + b.growth + ' croissance'); if (b.power) parts.push('+' + b.power + ' puissance');
      id.append(h('div', { class: 'gold', style: 'margin-top:6px;font-size:12.5px' }, 'Gouverneur : ' + b.name + ' (niveau ' + b.L + ') · ' + parts.join(' · '),
        h('label', { class: 'muted', style: 'margin-left:8px;cursor:pointer' }, h('input', { type: 'checkbox', checked: c.govChoose !== false, onchange: ev => { c.govChoose = ev.target.checked; } }), ' choisit la production')));
    }
    // ressources
    const res = h('div', { class: 'box', style: 'width:290px;flex:none' });
    const kv = (ic, label, val, cls, tip) => { const r = h('div', { class: 'kv' }, h('span', { class: 'k', html: ICONS[ic] + ' ' + label }), h('span', { class: cls || '' }, val)); if (tip) UI.tipOn(r, tip); return r; };
    const lines = (parts, unit) => parts.map(([k, v]) => '<div class="kv"><span class="k">' + U.esc(k) + '</span><span>' + (typeof v === 'number' ? (v >= 0 ? '+' : '') + v + (unit || '') : v) + '</span></div>').join('');
    const PP = e.powerParts || {}, powerLines = [['Forteresse', PP.fortress], ['Guildes', PP.guilds], ['Citoyens', PP.citizens], ['Gouverneur', PP.governor], ['Gisements', PP.minerals], ['Lieux de culte', PP.religion], ['Arbre-Mère', PP.wonder]].filter(([, v]) => v);
    res.append(
      kv('food', 'Nourriture', e.food + ' (besoin ' + e.foodNeed + ')', e.foodSurplus < 0 ? 'danger' : 'food', () => '<h4>Nourriture</h4>' + lines(e.foodParts || []) + (e.foodOver ? '<div class="dim">Au-delà de la capacité du terrain (' + e.foodLevel + '), les fermiers ne rendent que moitié.</div>' : '') + (e.famine ? '<div class="danger">Famine : divisée par deux.</div>' : '') + '<div style="margin-top:4px">Besoin : ' + e.foodNeed + ' · surplus ' + e.foodSurplus + '</div>'),
      kv('prod', 'Production', e.prod, 'prod', () => '<h4>Production</h4>Base ' + e.baseProd + ' (ouvriers ×' + race.workerProd + ', fermiers ×0,5)' + lines(e.prodParts || [], ' %') + (e.cursedLands ? '<div class="danger">Terres maudites : divisée par deux.</div>' : '')),
      kv('gold', 'Or', (e.gold >= 0 ? '+' : '') + e.gold, 'gold', () => '<h4>Or</h4>' + lines(e.goldParts || []) + '<div class="kv"><span class="k">Entretien des bâtiments</span><span>-' + e.buildingUpkeep + '</span></div>'),
      kv('power', 'Puissance', e.power, 'power', () => '<h4>Puissance magique</h4>' + (powerLines.length ? lines(powerLines) : '<div class="dim">Aucune source dans cette cité.</div>') + ((e.religionWhy || []).length ? '<div class="dim">Lieux de culte : ' + U.esc(e.religionWhy.join(', ')) + '.</div>' : '')),
      kv('research', 'Recherche', e.research, 'research', () => '<h4>Recherche</h4>' + ((e.researchParts || []).length ? lines(e.researchParts) : '<div class="dim">Ni bibliothèque ni guilde savante ici.</div>')),
      kv('unrest', 'Agitation', e.unrest + ' rebelle' + (e.unrest > 1 ? 's' : ''), e.unrest ? 'danger' : 'muted', () => CityUI.unrestTip(e, c)),
    );
    if (e.unitCostReduction) res.append(h('div', { class: 'dim', style: 'font-size:11px' }, 'Troupes ' + Math.round(e.unitCostReduction * 100) + ' % moins chères (fer et charbon)'));
    if (e.weapon) res.append(h('div', { class: 'dim', style: 'font-size:11px' }, 'Nouvelles troupes : armes ' + Units.WEAPON_WORDS[e.weapon]));
    body.append(h('div', { class: 'city-top' }, mapBox, id, res));

    // ---- production ----
    const prodSect = h('div', { class: 'sect', style: 'margin-top:12px' }, h('h4', null, 'Production'));
    const cost = Cities.prodCost(game, c, e);
    const turns = Cities.turnsLeft(game, c, e);
    const icon = c.prod.type === 'rearm' ? 'item:sword:1' : c.prod.type === 'unit' ? 'unit:' + c.prod.id : bldIcon(c.prod.type === 'building' ? c.prod.id : c.prod.type);
    const price = Cities.buyPrice(game, c, e);
    const idle = CityUI.queueDone && c.prod.type === 'tradeGoods' && !(c.queue || []).length;
    // ouverte en fin de file : ce qui vient d'être achevé reste affiché jusqu'à la fermeture
    const ld = CityUI.queueDone && c.lastDone && c.lastDone.turn >= game.turn - 1 && (c.lastDone.type === 'unit' ? DATA.units[c.lastDone.id] : DATA.buildings[c.lastDone.id]);
    if (ld || idle) prodSect.append(h('div', { class: 'qdone', style: 'display:flex;gap:10px;align-items:center' }, ld ? spriteCanvas(c.lastDone.type === 'unit' ? 'unit:' + c.lastDone.id : bldIcon(c.lastDone.id), 28) : null,
      h('div', null, ld ? h('div', null, (c.lastDone.type === 'unit' ? 'Recrutement achevé : ' : 'Construction achevée : '), h('b', null, ld.name), '.') : null,
        idle ? h('div', null, 'La file est terminée : en attendant vos ordres, la cité fait du commerce.') : null)));
    const pbox = h('div', { class: 'box prodbox' + (idle ? ' alert' : '') }, spriteCanvas(icon, 32),
      h('div', { style: 'flex:1' },
        h('div', { class: 't1 serif', style: 'font-size:16px' }, Cities.prodName(c)),
        cost ? h('div', null, h('div', { class: 'bar', style: 'margin:4px 0' }, h('i', { style: 'width:' + Math.min(100, c.progress / cost * 100) + '%' })), h('span', { class: 'muted' }, c.progress + ' / ' + cost + ' · ' + (turns === Infinity ? 'jamais' : turns + ' tour' + (turns > 1 ? 's' : '')))) :
          h('div', { class: 'muted' }, c.prod.type === 'rearm' ? 'Personne à équiper : la cité passera à la suite.' : c.prod.type === 'housing' ? CityUI.housingText(game, c) : 'Convertit la moitié de la production en or (' + e.tradeGoods + ').')),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
        h('button', { class: 'btn primary', onclick: () => CityUI.chooseProduction() }, 'Changer'),
        cost ? h('button', { class: 'btn', disabled: !price || pl.gold < price || c.progress >= cost, onclick: () => { const r = Game.buy(game, c.id); if (!r.ok) UI.toast(r.why, 'warn'); CityUI.render(); App.refresh(); } }, 'Acheter (' + price + ' or)') : null),
    );
    if (c.prod.type === 'unit') pbox.append(h('label', { class: 'dim', style: 'font-size:11.5px;position:absolute;margin-top:62px' }));
    // garnison pleine : l'unité en cours sortira hors les murs
    if (c.prod.type === 'unit' && Units.at(game, c.plane, c.x, c.y).filter(u => u.owner === c.owner).length >= MAX_STACK)
      pbox.children[1].append(h('div', { class: 'gold', style: 'font-size:11.5px;margin-top:4px' }, 'Garnison pleine (' + MAX_STACK + ' unités) : la nouvelle unité attendra hors les murs.'));
    // la production en cours redescend dans la file
    if ((c.queue || []).length && ['building', 'unit', 'rearm'].includes(c.prod.type)) {
      const nx = CityUI.itemName(c.queue[0]);
      pbox.children[1].append(h('div', { class: 'pdemote' }, h('span', { class: 'dim' }, 'Dans la file :'),
        h('button', { class: 'qb', title: 'Redescendre juste après ' + nx + ', qui passe en production', onclick: () => CityUI.demote(c, false) }, '↓'),
        h('button', { class: 'qb', title: 'Redescendre tout en bas de la file (' + nx + ' passe en production)', onclick: () => CityUI.demote(c, true) }, '⤓')));
    }
    // survol de l'ouvrage en cours : ses caractéristiques (sans gêner les boutons)
    if (c.prod.type === 'building' || c.prod.type === 'unit' || c.prod.type === 'rearm') { const it = { type: c.prod.type, id: c.prod.id }; UI.tipOn(pbox.firstChild, () => CityUI.itemTip(c, it)); UI.tipOn(pbox.children[1], () => CityUI.itemTip(c, it)); }
    prodSect.append(pbox);
    const queue = c.queue || [];
    if (c.prod.type === 'unit' && !queue.length) prodSect.append(h('label', { class: 'muted', style: 'font-size:12px;display:block;margin-top:4px;cursor:pointer' }, h('input', { type: 'checkbox', checked: !c.prodOnce, onchange: ev => { c.prodOnce = !ev.target.checked; } }), ' Répéter la production de cette unité'));
    prodSect.append(CityUI.queueBox(c, e));
    prodSect.append(CityUI.roleRow(c, () => CityUI.render()));
    prodSect.append(CityUI.rallyRow(c));

    // ---- bâtiments ----
    const bsect = h('div', { class: 'sect' }, h('h4', null, 'Bâtiments'));
    const grid = h('div', { class: 'bgrid' });
    const owned = Object.keys(c.buildings).filter(b => DATA.buildings[b]);
    owned.sort((a, b) => (DATA.buildings[a].buildable === false ? -1 : 0) - (DATA.buildings[b].buildable === false ? -1 : 0) || DATA.buildings[a].cost - DATA.buildings[b].cost);
    for (const b of owned) {
      const bd = DATA.buildings[b];
      const el = h('div', { class: 'bld' }, spriteCanvas(bldIcon(b), 40, 'bimg'), h('div', { class: 'bt' }, h('div', null, bd.name), h('div', { class: 'c' }, bd.upkeep ? 'Entretien ' + bd.upkeep + ' or' : 'Sans entretien')));
      const block = bd.buildable !== false && !c.sold ? Game.sellBlock(c, b) : null;
      if (block) el.append(h('span', { class: 'sell', style: 'opacity:.45;cursor:default', title: 'Invendable : ' + block }, 'vendre'));
      else if (bd.buildable !== false && !c.sold) el.append(h('span', { class: 'sell', onclick: async (ev) => { ev.stopPropagation(); if (await UI.confirm('Vendre ' + bd.name, 'Vendre ce bâtiment pour ' + Math.floor(bd.cost / 3) + ' or ? (une vente par tour et par cité)')) { const r = Game.sell(game, c.id, b); if (!r.ok) UI.toast(r.why, 'warn'); CityUI.render(); App.refresh(); } } }, 'vendre'));
      UI.tipOn(el, () => '<h4>' + bd.name + '</h4>' + U.esc(bd.desc || '') + CityUI.effectsHtml(bd, c));
      grid.append(el);
    }
    bsect.append(grid);

    // ---- garnison & enchantements ----
    const gsect = h('div', { class: 'sect' }, h('h4', null, 'Garnison'));
    const units = Units.at(game, c.plane, c.x, c.y).filter(u => u.owner === c.owner);
    const ug = h('div', { class: 'ucards', style: 'grid-template-columns:repeat(9,1fr)' });
    for (const u of units) { const card = h('div', { class: 'ucard' }, UI.glowCanvas(spriteCanvas(Sprites.unitKey(u), 32), game, u), h('div', { class: 'nm' }, Units.label(u))); UI.tipOn(card, () => UI.unitTip(u, game)); card.onclick = () => { CityUI.toMap = true; m.close(); App.selectTile(c.plane, c.x, c.y, [u.id]); }; ug.append(card); }
    if (!units.length) ug.append(h('div', { class: 'dim', style: 'grid-column:1/-1' }, 'Aucune troupe ne garde la cité.'));
    gsect.append(ug);
    if (c.ench.length) {
      const es = h('div', { style: 'margin-top:8px' });
      for (const en of c.ench) { const sp = DATA.spells[en.spell]; const mine = en.owner === App.pid; const el = h('span', { class: 'abl ' + (sp.kind === 'cityCurse' ? '' : 'e'), style: sp.kind === 'cityCurse' ? 'border-color:#7a2a2a;color:#ffb0b0' : '' }, sp.name); if (en.realm && REALM_NAMES[en.realm]) el.textContent = sp.name + ' (' + REALM_NAMES[en.realm] + ')';
        const by = en.owner !== c.owner && game.players[en.owner] ? '<div class="danger">Lancée par ' + U.esc(Players.nameFor(game, App.pid, en.owner)) + '</div>' : '';
        UI.tipOn(el, () => UI.spellTip(en.spell, game.players[en.owner], game) + by + (mine ? '<div class="dim">Clic droit pour rompre l\'enchantement</div>' : ''));
        el.addEventListener('contextmenu', async ev => { ev.preventDefault(); if (!mine) return; if (!await UI.confirm('Rompre ' + sp.name, 'Mettre fin à ' + sp.name + ' à ' + U.esc(c.name) + ' ?', 'Rompre')) return; c.ench = c.ench.filter(x => x !== en); CityUI.render(); App.refresh(); }); es.append(el); }
      gsect.append(h('h4', { style: 'margin-top:8px' }, 'Enchantements'), es);
    }
    body.append(h('div', { class: 'grid2' }, h('div', null, prodSect, gsect), bsect));
  },
  rename(c) {
    const game = App.game, inp = h('input', { type: 'text', value: c.name, maxlength: 28, style: 'width:100%' });
    const err = h('div', { class: 'danger', style: 'font-size:12px;min-height:16px;margin-top:4px' });
    const ok = () => {
      const v = inp.value.replace(/<[^>]*>?/g, '').replace(/[<>&"\\]/g, '').trim().replace(/\s+/g, ' ');   // un nom, pas du balisage
      if (!v) { err.textContent = 'Le nom ne peut pas être vide.'; return; }
      if (Object.values(game.cities).some(o => o !== c && o.name.toLowerCase() === v.toLowerCase())) { err.textContent = 'Une autre cité porte déjà ce nom.'; return; }
      c.name = v; m.close(); CityUI.render(); App.refresh();
    };
    inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } };
    const m = UI.modal({ title: 'Renommer ' + c.name, width: 380, body: h('div', null, inp, err), footer: [h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Annuler'), h('button', { class: 'btn primary', onclick: ok }, 'Renommer')] });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  },
  growthTip(e) {
    return '<h4>Croissance</h4>' + (e.growthWhy || []).map(([k, v]) => '<div class="kv"><span class="k">' + U.esc(k) + '</span><span>' + (typeof v === 'number' ? (v >= 0 ? '+' : '') + v : v) + '</span></div>').join('') + '<div style="margin-top:4px">Total : <b>' + (e.growth >= 0 ? '+' : '') + e.growth + '</b> habitants par tour (arrondi à la dizaine)</div>';
  },
  // ---------- file de construction ----------
  itemName(it) { return it.type === 'rearm' ? Cities.REARM_NAME : it.type === 'building' ? DATA.buildings[it.id].name : DATA.units[it.id].name; },
  itemIcon(it) { return it.type === 'rearm' ? 'item:sword:1' : it.type === 'unit' ? 'unit:' + it.id : bldIcon(it.id); },
  itemCost(game, c, it, e) { return it.type === 'rearm' ? Cities.rearmCost(game, c, e) : it.type === 'building' ? DATA.buildings[it.id].cost : Cities.unitCost(game, c, it.id, e); },
  // armes magiques pour la garnison : qui en recevra, et à quel prix
  // point de ralliement : les troupes produites s'y rendent d'elles-mêmes
  rallyRow(c) {
    const game = App.game, r = c.rally;
    const row = h('div', { class: 'rolerow' }, h('span', { class: 'dim' }, 'Ralliement :'));
    if (r) {
      const there = Cities.at(game, r.plane, r.x, r.y);
      row.append(h('span', { class: 'gold' }, there ? there.name : '(' + r.x + ', ' + r.y + ')' + (r.plane !== c.plane ? ' · ' + PLANE_NAMES[r.plane] : '')),
        h('button', { class: 'chip', onclick: () => CityUI.pickRally(c) }, 'Changer'), h('button', { class: 'chip', onclick: () => { c.rally = null; CityUI.render(); App.refresh(); } }, 'Retirer'));
    } else row.append(h('span', { class: 'dim' }, 'aucun'), h('button', { class: 'chip', onclick: () => CityUI.pickRally(c) }, 'Choisir sur la carte'));
    UI.tipOn(row, () => '<h4>Point de ralliement</h4>Les troupes recrutées ici partent d\'elles-mêmes vers cette case et y attendent en sentinelle.');
    return row;
  },
  async pickRally(c) {
    CityUI.toMap = true; if (CityUI.modalApi) CityUI.modalApi.close();
    const t = await App.pickTile('Cliquez sur le point de ralliement de ' + U.esc(c.name) + '.');
    if (t) { if (t.plane !== c.plane) UI.toast('Le point de ralliement doit être sur le même plan que la cité.', 'warn'); else c.rally = { plane: t.plane, x: t.x, y: t.y }; }
    App.refresh();
    CityUI.open(c.id);
  },
  // rôle de la cité : ce qu'elle choisira d'elle-même quand la file sera vide
  ROLE_TIPS: { growth: 'greniers, halles aux grains, scieries ; sinon des logements', gold: 'marchés, banques, guildes ; sinon des biens de commerce', army: 'casernes, armureries, écuries, murailles ; sinon sa meilleure troupe tant que le trésor suit', magic: 'sanctuaires, bibliothèques, temples, universités ; sinon des biens de commerce' },
  setRole(c, role) {
    c.role = role || null;
    const idle = !(c.queue || []).length && (c.prod.type === 'tradeGoods' || c.prod.type === 'housing' || c.needsOrder);
    if (c.role && idle) Cities.applyRole(App.game, c);
  },
  roleRow(c, after) {
    const row = h('div', { class: 'rolerow' }, h('span', { class: 'dim' }, 'Rôle :'));
    for (const k of [null, 'growth', 'gold', 'army', 'magic']) {
      const el = h('button', { class: 'chip' + ((c.role || null) === k ? ' on' : ''), onclick: () => { CityUI.setRole(c, k); App.refresh(); if (after) after(); } }, k ? Cities.ROLES[k].name : 'Aucun');
      UI.tipOn(el, () => k ? '<h4>Rôle : ' + Cities.ROLES[k].name + '</h4>Quand la file est vide, la cité choisit d\'elle-même : ' + CityUI.ROLE_TIPS[k] + '. Votre file passe toujours en premier.' : '<h4>Sans rôle</h4>La cité attend vos ordres quand sa file est vide.');
      row.append(el);
    }
    return row;
  },
  // l'agitation, raison par raison
  unrestTip(e, c) {
    const f = v => (v > 0 ? '+' : '−') + String(Math.round(Math.abs(v) * 10) / 10).replace('.', ',');
    const rows = (e.unrestWhy || []).map(([k, v]) => '<div class="kv"><span>' + U.esc(k) + '</span><b class="' + (v > 0 ? 'danger' : 'ok') + '">' + f(v) + '</b></div>').join('');
    const less = c ? CityUI.unrestLevers(c, e) : [];
    return '<h4>Agitation</h4>' + (rows || '<div class="dim">Rien ne trouble la cité.</div>') + (e.unrestCap != null
      ? '<div class="dim" style="margin-top:4px">La somme donnerait ' + e.unrestRaw + ' rebelles, mais il en reste ' + e.unrest + ' : les autres doivent cultiver pour que la cité mange.</div>'
      : '<div class="dim" style="margin-top:4px">Rebelles : la somme, arrondie à l\'entier inférieur (' + e.unrest + ').</div>')
      + (less.length ? '<div class="ok" style="margin-top:4px">Un rebelle de moins : ' + less.map(U.esc).join(' · ') + '</div>' : '');
  },
  // ce qui suffit, seul, à libérer un citoyen : des soldats en garnison (½ chacun), un cran d'impôts de moins, un bâtiment à bâtir ici
  unrestLevers(c, e) {
    const game = App.game, pl = game.players[c.owner];
    if (!e.unrest || e.unrestSum == null || !pl) return [];
    const need = e.unrestSum - e.unrest, out = [];
    const k = Math.floor(need / 0.5 + 1e-9) + 1;
    out.push(U.n(k, 'soldat') + ' de plus en garnison');
    if (pl.taxIdx > 0) {
      const was = pl.taxIdx;
      try { for (let i = was - 1; i >= 0; i--) { pl.taxIdx = i; if (Cities.econ(game, c).unrest < e.unrest) { out.push('impôts à ' + String(TAX_RATES[i]).replace('.', ',') + ' or'); break; } } }
      finally { pl.taxIdx = was; }
    }
    const blds = Cities.buildableBuildings(game, c).sort((a, b) => DATA.buildings[a].cost - DATA.buildings[b].cost);
    for (const b of blds) if (Cities.econ(game, Object.assign({}, c, { buildings: Object.assign({}, c.buildings, { [b]: true }) })).unrest < e.unrest) { out.push(DATA.buildings[b].name); break; }
    return out;
  },
  // logements en cours : ce qu'ils ajoutent à la croissance, ou qu'ils ne servent plus à rien
  housingText(game, c) {
    const eH = Cities.econ(game, Object.assign({}, c, { prod: { type: 'housing' } })), eT = Cities.econ(game, Object.assign({}, c, { prod: { type: 'tradeGoods' } }));
    if (Cities.citizens(c) >= eH.maxPop) return 'Population maximale atteinte : les logements ne servent plus (le commerce rapporterait ' + eT.tradeGoods + ' or).';
    return 'Accélère la croissance : +' + (eH.growth - eT.growth) + ' hab./tour.';
  },
  rearmTip(c) {
    const game = App.game, e = Cities.econ(game, c), tier = Cities.rearmTier(game, c, e), list = Cities.rearmTargets(game, c, e);
    const kind = Units.WEAPON_WORDS[tier] || Units.WEAPON_WORDS[1];
    let html = '<h4>' + Cities.REARM_NAME + '</h4>Les forges de la Guilde des alchimistes équipent d\'armes ' + kind + ' les unités normales en station dans la cité qui n\'en ont pas encore. Coût : un quart du prix de chaque unité par rang d\'armes gagné.';
    html += list.length ? '<div style="margin-top:6px">' + list.map(u => U.esc(Units.label(u)) + ' <span class="dim">(' + Cities.rearmUnitCost(u, tier) + ')</span>').join('<br>') + '</div><div class="gold" style="margin-top:4px">Total : ' + Cities.rearmCost(game, c, e) + '</div>'
      : '<div class="dim" style="margin-top:6px">Aucune unité à équiper pour l\'instant. Dans la file, l\'ouvrage attend son tour et sera sauté si personne n\'est à équiper.</div>';
    return html;
  },
  // la production en cours redescend dans la file (juste après la tête de file, ou tout en bas) ; la tête de file monte en production.
  // Le travail déjà accompli suit chacun des deux ouvrages.
  demote(c, toEnd) {
    const game = App.game, q = c.queue || (c.queue = []);
    const real = t => t === 'building' || t === 'unit' || t === 'rearm';
    if (!q.length || !real(c.prod.type)) return;
    const top = q.shift(), was = c.prod;
    const shelved = Cities.setProduction(game, c, { type: top.type, id: top.id, progress: top.progress || 0 });
    const item = shelved || { type: was.type, id: was.id };
    if (shelved) { const i = c.queue.indexOf(shelved); if (i >= 0) c.queue.splice(i, 1); }
    if (toEnd) c.queue.push(item); else c.queue.unshift(item);
    Cities.dedupeQueue(c);
    UI.toast(U.esc(CityUI.itemName(c.prod)) + ' passe en production ; ' + U.esc(CityUI.itemName(was)) + (toEnd ? ' va en fin de file' : ' attend juste après') + (shelved ? ' (' + shelved.progress + ' déjà fait).' : '.'));
    CityUI.render(); App.refresh();
  },
  queueBox(c, e) {
    const game = App.game, q = c.queue || (c.queue = []);
    const box = h('div', { class: 'queue' });
    const head = h('div', { class: 'qhead' }, h('span', { class: 'qtitle' }, 'File d\'attente'), h('span', { class: 'dim' }, q.length ? U.n(q.length, 'élément') : 'vide'));
    box.append(head);
    let t = Cities.turnsLeft(game, c, e) || 0;
    q.forEach((it, i) => {
      const cost = CityUI.itemCost(game, c, it, e);
      t += e.prod > 0 ? Math.ceil(Math.max(0, cost - (it.progress || 0)) / e.prod) : Infinity;
      const row = h('div', { class: 'qrow' }, spriteCanvas(CityUI.itemIcon(it), 24), h('span', { class: 'qn' }, CityUI.itemName(it), it.progress ? h('span', { class: 'dim', style: 'margin-left:6px;font-size:11px', title: 'Travail déjà accompli, conservé' }, 'entamé ' + Math.min(it.progress, cost) + '/' + cost) : null),
        h('span', { class: 'dim qt' }, t === Infinity ? '—' : 'tour ' + t),
        h('button', { class: 'qb', title: i === 0 ? 'Produire maintenant (la production en cours passe en tête de file, avec son avancement)' : 'Monter', onclick: () => {
          if (i > 0) { [q[i - 1], q[i]] = [q[i], q[i - 1]]; CityUI.render(); return; }
          // le premier de la file prend la place de la production en cours, qui passe en tête de file
          const top = q.shift();   // il quitte la file (sinon il serait produit deux fois)
          const was = c.prod, shelved = Cities.setProduction(App.game, c, { type: top.type, id: top.id, progress: top.progress || 0 });
          const real = was.type === 'building' || was.type === 'unit' || was.type === 'rearm';
          // échange de places : même sans travail commencé, l'ancienne production reste dans la file
          if (!shelved && real) { c.queue = c.queue || []; c.queue.unshift({ type: was.type, id: was.id }); Cities.dedupeQueue(c); }
          UI.toast(U.esc(CityUI.itemName(c.prod)) + ' passe en production' + (real ? ' ; ' + U.esc(CityUI.itemName(was)) + ' attend en tête de file' + (shelved ? ' (' + shelved.progress + ' déjà fait).' : '.') : '.'));
          CityUI.render(); App.refresh();
        } }, '↑'),
        h('button', { class: 'qb', title: 'Descendre', disabled: i === q.length - 1, onclick: () => { [q[i + 1], q[i]] = [q[i], q[i + 1]]; CityUI.render(); } }, '↓'),
        h('button', { class: 'qb', title: 'En tête de file (produit juste après l\'ouvrage en cours)', disabled: i === 0, onclick: () => { q.unshift(q.splice(i, 1)[0]); CityUI.render(); } }, '⤒'),
        h('button', { class: 'qb', title: 'Tout en bas de la file', disabled: i === q.length - 1, onclick: () => { q.push(q.splice(i, 1)[0]); CityUI.render(); } }, '⤓'),
        h('button', { class: 'qb x', title: 'Retirer', onclick: async () => { if (it.progress > 0 && !await UI.confirm('Retirer de la file', 'Abandonner ' + U.esc(CityUI.itemName(it)) + ' et les ' + Math.floor(it.progress) + ' points de production déjà faits ?', 'Retirer')) return; q.splice(i, 1); CityUI.render(); } }, '×'));
      { const qn = row.querySelector('.qn'); if (qn) UI.tipOn(qn, () => CityUI.itemTip(c, it)); }
      box.append(row);
    });
    const tpls = CityUI.loadTemplates();
    const def = tpls.find(x => x.def);
    box.append(h('div', { class: 'qactions' },
      h('button', { class: 'abtn', onclick: () => CityUI.chooseProduction('queue') }, '+ Ajouter à la file'),
      q.length ? h('button', { class: 'abtn', title: 'Retirer de la file les ouvrages pas encore commencés (ceux qui sont entamés restent)', onclick: () => { c.queue = q.filter(it => it.progress > 0); CityUI.render(); } }, 'Vider') : null,
      h('button', { class: 'abtn', onclick: () => CityUI.templates() }, 'Modèles de file' + (tpls.length ? ' (' + tpls.length + ')' : ''))));
    if (def) box.append(h('div', { class: 'dim', style: 'font-size:11px' }, 'Nouvelles cités : modèle « ' + def.name + ' »'));
    return box;
  },
  enqueue(c, prod) {
    const game = App.game;
    c.queue = c.queue || [];
    if (!Cities.canQueue(game, c, prod)) { UI.toast('Déjà prévu dans cette cité.', 'warn'); return false; }
    if (c.prod.type === 'housing' || c.prod.type === 'tradeGoods') Cities.setProduction(game, c, prod);
    else c.queue.push(prod);
  },
  // modèles de file : enregistrés dans le navigateur, valables d'une partie à l'autre
  loadTemplates() { try { return JSON.parse(localStorage.getItem('arcanes:queues') || '[]'); } catch (e) { return []; } },
  saveTemplates(list) { try { localStorage.setItem('arcanes:queues', JSON.stringify(list)); return true; } catch (e) { UI.toast('Enregistrement impossible : ' + U.esc(e.message), 'warn'); return false; } },
  toTemplateItems(c) {
    const items = [];
    if (c.prod.type === 'building' || c.prod.type === 'unit' || c.prod.type === 'rearm') items.push(c.prod);
    for (const it of c.queue || []) items.push(it);
    return items.map(it => it.type === 'rearm' ? { type: 'rearm' } : it.type === 'unit' ? { type: 'unit', en: DATA.units[it.id].en, id: it.id } : { type: 'building', id: it.id });
  },
  // les unités sont retrouvées par leur rôle (Lanciers, Colons…) dans la race de la cité
  fromTemplateItems(c, items) {
    const race = DATA.races[c.race], out = [];
    for (const it of items) {
      if (it.type === 'rearm') { out.push({ type: 'rearm' }); continue; }
      if (it.type === 'building') { if (DATA.buildings[it.id]) out.push({ type: 'building', id: it.id }); continue; }
      const t = race.units.includes(it.id) ? it.id : race.units.find(u => DATA.units[u].en === it.en);
      if (t) out.push({ type: 'unit', id: t });
    }
    return out;
  },
  applyTemplate(c, tpl, keepCurrent) {
    const game = App.game;
    // les ouvrages mis de côté gardent leur avancement ; un bâtiment déjà construit ne revient pas dans la file
    const kept = (c.queue || []).filter(it => it.progress > 0);
    const fresh = CityUI.fromTemplateItems(c, tpl.items).filter(it => !(it.type === 'building' && c.buildings[it.id]) && !(it.type === 'rearm' && !c.buildings.alchemistsGuild) && !kept.some(k => k.type === it.type && k.id === it.id));
    c.queue = kept.concat(fresh);
    const idle = c.prod.type === 'housing' || c.prod.type === 'tradeGoods';
    if (idle || !keepCurrent) { const nx = Cities.nextFromQueue(game, c); if (nx) Cities.setProduction(game, c, nx); }
    else c.queue = c.queue.filter(it => !(it.type === c.prod.type && it.id === c.prod.id));
    Cities.dedupeQueue(c);
  },
  applyDefaultTemplate(c) {
    const def = CityUI.loadTemplates().find(x => x.def);
    if (def) CityUI.applyTemplate(c, def, false);
    return def;
  },
  templates() {
    const game = App.game, c = game.cities[CityUI.cur]; if (!c) return;
    const body = h('div', { class: 'list' });
    const m = UI.modal({ title: 'Modèles de file de construction', width: 640, body });
    const render = () => {
      body.innerHTML = '';
      const items = CityUI.toTemplateItems(c);
      const nameIn = h('input', { type: 'text', id: 'tpl-name', placeholder: 'Nom du modèle (ex. Nouvelle cité)', style: 'flex:1;min-width:0' });
      const defIn = h('input', { type: 'checkbox', id: 'tpl-def' });
      body.append(h('div', { class: 'box', style: 'display:flex;flex-direction:column;gap:6px' },
        h('div', { class: 't1' }, 'Enregistrer la production actuelle et la file (' + U.n(items.length, 'élément') + ')'),
        items.length ? h('div', { class: 't2' }, items.map(it => CityUI.itemName(it)).join(' → ')) : h('div', { class: 'dim' }, 'Ajoutez d\'abord des éléments à la file.'),
        h('div', { style: 'display:flex;gap:6px;align-items:center' }, nameIn,
          h('button', { class: 'btn primary', disabled: !items.length, onclick: () => {
            const name = nameIn.value.trim() || ('Modèle ' + (CityUI.loadTemplates().length + 1));
            let list = CityUI.loadTemplates().filter(x => x.name !== name);
            if (defIn.checked) list = list.map(x => Object.assign(x, { def: false }));
            list.push({ name, items, def: defIn.checked });
            if (CityUI.saveTemplates(list)) { UI.toast('Modèle « ' + U.esc(name) + ' » enregistré.'); render(); CityUI.render(); }
          } }, 'Enregistrer')),
        h('label', { style: 'cursor:pointer' }, defIn, ' Appliquer ce modèle à chaque nouvelle cité')));
      const list = CityUI.loadTemplates();
      if (!list.length) body.append(h('div', { class: 'dim', style: 'padding:6px' }, 'Aucun modèle pour l\'instant.'));
      list.forEach((tpl, i) => {
        const names = CityUI.fromTemplateItems(c, tpl.items).map(CityUI.itemName);
        body.append(h('div', { class: 'row', style: 'cursor:default;align-items:flex-start' },
          h('div', { class: 'grow' }, h('div', { class: 't1' }, tpl.name, tpl.def ? h('span', { class: 'abl e', style: 'margin-left:6px' }, 'nouvelles cités') : null),
            h('div', { class: 't2' }, names.join(' → ') || 'Rien de réalisable pour cette race')),
          h('div', { style: 'display:flex;flex-direction:column;gap:4px;align-items:stretch' },
            h('button', { class: 'abtn', onclick: () => { CityUI.applyTemplate(c, tpl, true); m.close(); CityUI.render(); App.refresh(); } }, 'Charger dans cette cité'),
            h('label', { class: 'dim', style: 'font-size:12px;cursor:pointer' }, h('input', { type: 'checkbox', checked: !!tpl.def, onchange: ev => { const l = CityUI.loadTemplates().map((x, k) => Object.assign(x, { def: k === i ? ev.target.checked : (ev.target.checked ? false : x.def) })); CityUI.saveTemplates(l); render(); CityUI.render(); } }), ' nouvelles cités'),
            h('button', { class: 'abtn danger', onclick: () => { const l = CityUI.loadTemplates(); l.splice(i, 1); CityUI.saveTemplates(l); render(); CityUI.render(); } }, 'Supprimer'))));
      });
    };
    render();
  },
  // l'unité telle qu'elle sortira de cette cité (expérience des écoles ou de l'Autel de bataille, armes de la cité)
  fakeUnit(c, t, e) {
    return { type: t, ench: [], xp: Cities.hasEnch(c, 'altar_of_battle') ? 120 : c.buildings.warCollege ? 60 : c.buildings.fightersGuild ? 20 : 0, owner: c.owner, dmg: 0, weapon: Units.weaponFor(t, e.weapon) };
  },
  // infobulle d'un ouvrage (en production, en file) : ses caractéristiques
  itemTip(c, it) {
    const game = App.game, e = Cities.econ(game, c);
    if (it.type === 'building' && DATA.buildings[it.id]) { const bd = DATA.buildings[it.id]; return '<h4>' + bd.name + '</h4>' + U.esc(bd.desc || '') + CityUI.effectsHtml(bd, c) + '<div class="dim" style="margin-top:4px">Coût ' + bd.cost + ' · entretien ' + bd.upkeep + ' or/tour</div>' + CityUI.unlocksHtml(it.id, c); }
    if (it.type === 'unit' && DATA.units[it.id]) return UI.unitTip(CityUI.fakeUnit(c, it.id, e), game);   // (l'entretien y figure)
    if (it.type === 'rearm') return CityUI.rearmTip(c);
    return null;
  },
  effectsHtml(bd, c) {
    const e = bd.effects || {}; const parts = [];
    const farmers = c && App.game ? Cities.econ(App.game, c).farmers : null;
    if (e.research) parts.push('+' + e.research + ' recherche'); if (e.power) parts.push((e.power > 0 ? '+' : '') + e.power + ' puissance');
    if (e.food) parts.push('+' + e.food + (bd.id === 'forestersGuild' ? ' nourriture pour les armées (bilan de l\'empire)' : ' nourriture'));
    if (bd.id === 'temple' || bd.id === 'oracle') parts.push('frontières +1 case (une fois, avec l\'un ou l\'autre)'); if (e.maxPop) parts.push('+' + e.maxPop + ' population max.'); if (e.growth) parts.push('+' + e.growth + ' croissance');
    if (e.goldPct) parts.push('+' + e.goldPct + ' % or'); if (e.prodPct) parts.push('+' + e.prodPct + ' % production'); if (e.unrest) parts.push('-' + e.unrest + ' agitation');
    if (e.farmerFood) parts.push('+' + e.farmerFood + ' nourriture par fermier' + (farmers != null ? ' (+' + farmers * e.farmerFood + ' ici)' : ''));
    if (e.healing) parts.push('soins des unités dans la cité : ' + e.healing + ' % des PV par tour (10 % sans)');
    if (e.housingPct) parts.push('logements +' + e.housingPct + ' %');
    if (e.mineralPct) parts.push('gisements +' + e.mineralPct + ' %');
    if (e.sight) parts.push('vue à ' + e.sight + ' cases');
    if (e.nightshade) parts.push('la belladone des environs dissipe les malédictions');
    if (e.xp) parts.push('troupes à ' + e.xp + ' XP'); if (e.magicWeapons) parts.push(U.txt('armes magiques')); if (e.walls) parts.push(U.txt('murailles')); if (e.towers) parts.push(e.towers + ' tours qui tirent en siège');
    if (e.magicRelay) parts.push('surcoût de distance des sorts de combat divisé par deux');
    return (parts.length ? '<div class="gold" style="margin-top:4px">' + parts.join(' · ') + '</div>' : '') + CityUI.gainHtml(bd, c);
  },
  // ce que le bâtiment rapporterait dans cette cité, aujourd'hui (bâtiments déjà là et entretien compris) : la cité recalculée avec lui
  gainHtml(bd, c) {
    const game = App.game; if (!c || !game || c.buildings[bd.id] || !DATA.buildings[bd.id] || bd.id === 'housing' || bd.id === 'tradeGoods') return '';
    let e0, e1;
    try { e0 = Cities.econ(game, c); e1 = Cities.econ(game, Object.assign({}, c, { buildings: Object.assign({}, c.buildings, { [bd.id]: true }) })); } catch (err) { return ''; }
    const sg = v => (v > 0 ? '+' : '−') + Math.abs(Math.round(v)), out = [];
    const inc = e1.goldIncome - e0.goldIncome, up = bd.upkeep || 0, net = e1.gold - e0.gold;
    if (inc || up) out.push('<span class="' + (net > 0 ? 'ok' : net < 0 ? 'danger' : '') + '">or ' + sg(net) + ' par tour</span>' + (inc && up ? ' (rapporte ' + sg(inc) + ', entretien −' + up + ')' : !inc && up ? ' (entretien)' : ''));
    const d = (k, lab) => { const v = (e1[k] || 0) - (e0[k] || 0); if (Math.round(v)) out.push(lab + ' ' + sg(v)); };
    const GOV_WORDS = { prod: 'production', research: 'recherche', power: 'puissance', foodSurplus: 'nourriture', growth: 'croissance' };
    for (const k in GOV_WORDS) d(k, GOV_WORDS[k]);
    const rb = e1.rebels - e0.rebels; if (rb) out.push((rb < 0 ? '−' : '+') + U.n(Math.abs(rb), 'rebelle'));
    return out.length ? '<div class="muted" style="margin-top:3px">Ici, aujourd\'hui : ' + out.join(' · ') + '</div>' : '';
  },
  setFarmers(c, n) {
    const game = App.game; const e = Cities.econ(game, c);
    c.autoFarmers = false;
    c.farmers = U.clamp(n, e.minFarmers, e.citizens - e.rebels);
    // ce que le changement apporte, affiché quelques instants à côté des totaux
    const e2 = Cities.econ(game, c), t1 = Cities.turnsLeft(game, c, e), t2 = Cities.turnsLeft(game, c, e2);
    CityUI.flash = { city: c.id, until: performance.now() + 2600, food: e2.foodSurplus - e.foodSurplus, prod: e2.prod - e.prod, growth: e2.growth - e.growth, turns: (t1 === Infinity || t2 === Infinity) ? 0 : t2 - t1 };
    CityUI.render(); App.refresh();
  },
  // l'économie de la cité si elle avait F fermiers
  econWith(c, F) { return Cities.econ(App.game, Object.assign({}, c, { farmers: F, autoFarmers: false })); },
  citizensPanel(c, e) {
    const game = App.game, race = DATA.races[c.race];
    const F = e.farmers, W = e.workers, R = e.rebels, N = e.citizens;
    const cost = Cities.prodCost(game, c, e), turns = cost ? Cities.turnsLeft(game, c, e) : null;
    const fl = CityUI.flash && CityUI.flash.city === c.id && performance.now() < CityUI.flash.until ? CityUI.flash : null;
    const chip = (v, goodUp = true, suffix = '') => !fl || !v ? '' : '<span class="dchip ' + ((v > 0) === goodUp ? 'up' : 'down') + '">' + (v > 0 ? '+' : '') + v + suffix + '</span>';
    const sgn = v => (v > 0 ? '+' : '') + v;
    const grow = ee => ee.growth > 0 ? '<span class="ok">' + sgn(ee.growth) + ' hab./tour</span>' : ee.growth < 0 ? '<span class="danger">' + ee.growth + ' hab./tour</span>' : (N >= ee.maxPop ? '<span class="dim">plafond atteint</span>' : '<span class="dim">pas de croissance</span>');
    const tn = t => t === Infinity ? 'jamais' : U.n(t, 'tour');
    const empire = c.owner >= 0 && game.players[c.owner] ? Players.goldPerTurn(game, game.players[c.owner]).food : null;
    const emp = v => '<b class="' + (v < 0 ? 'danger' : 'ok') + '">' + sgn(v) + '</b>';
    // aperçu au survol : ce que donnerait le passage d'un citoyen dans l'autre ligne
    const preview = toFarm => {
      const F2 = F + (toFarm ? 1 : -1);
      if (!toFarm && F2 < e.minFarmers) return '<h4>Fermier indispensable</h4>Il faut au moins ' + U.n(e.minFarmers, 'fermier') + ' pour nourrir ' + U.n(N, 'citoyen') + ' : sans lui, la cité aurait faim.';
      if (toFarm && F2 > N - R) return null;
      const e2 = CityUI.econWith(c, F2), t2 = cost ? Cities.turnsLeft(game, Object.assign({}, c, { farmers: F2, autoFarmers: false }), e2) : null;
      const cmp = (a, b, goodUp = true) => a === b ? '<b>' + b + '</b>' : a + ' → <b class="' + ((b > a) === goodUp ? 'ok' : 'danger') + '">' + b + '</b>';
      return '<h4>' + (toFarm ? 'Faire de cet ouvrier un fermier' : 'Faire de ce fermier un ouvrier') + '</h4>'
        + '<div>Production ' + cmp(e.prod, e2.prod) + (cost ? ' · ' + U.esc(Cities.prodName(c)) + ' : ' + (turns === t2 ? tn(t2) : tn(turns) + ' → <b class="' + (t2 < turns ? 'ok' : 'danger') + '">' + tn(t2) + '</b>') : '') + '</div>'
        + '<div>Surplus de nourriture ' + (e.foodSurplus === e2.foodSurplus ? '<b>' + sgn(e2.foodSurplus) + '</b>' : sgn(e.foodSurplus) + ' → <b class="' + (e2.foodSurplus > e.foodSurplus ? 'ok' : 'danger') + '">' + sgn(e2.foodSurplus) + '</b>') + (e2.foodSurplus < 0 ? ' <span class="danger">(famine)</span>' : '') + '</div>'
        + '<div>Croissance ' + (e.growth === e2.growth ? grow(e2) : grow(e) + ' → ' + grow(e2)) + '</div>'
        + (empire != null ? '<div>Bilan de l\'empire, armées nourries : ' + (e2.foodSurplus === e.foodSurplus ? emp(empire) : emp(empire) + ' → ' + emp(empire + e2.foodSurplus - e.foodSurplus)) + '</div>' : '')
        + '<div class="dim" style="margin-top:4px">Clic ou glisser-déposer dans l\'autre ligne.</div>';
    };
    const box = h('div', { class: 'citizens' });
    const rowOf = {};
    const person = (kind, i) => {
      const need = kind === 'f' && i < e.minFarmers;
      const el = h('span', { class: 'cz ' + kind + (need ? ' need' : ''), html: ICONS[kind === 'f' ? 'food' : kind === 'w' ? 'prod' : 'unrest'] });
      if (kind !== 'r') {
        UI.tipOn(el, () => CityUI._dragging ? null : preview(kind === 'w'));
        el.addEventListener('pointerdown', ev => CityUI.dragCitizen(ev, el, c, kind, rowOf));
      } else UI.tipOn(el, '<h4>Rebelle</h4>Ne produit rien et ne paie pas l\'impôt. Temples, garnison et impôts plus bas calment la cité.');
      return el;
    };
    const row = (kind, label, icon, people, out) => {
      const r = h('div', { class: 'crow ' + kind }, h('div', { class: 'lab', html: ICONS[icon] + '<span>' + label + '</span>' }), h('div', { class: 'ppl' }, ...people), h('div', { class: 'out', html: out }));
      rowOf[kind] = r;
      // clic sur la ligne : y faire venir un citoyen de l'autre ligne
      if (kind !== 'r') r.addEventListener('click', ev => { if (ev.target.closest('.cz') || performance.now() - (CityUI._dragT || 0) < 350) return; CityUI.setFarmers(c, F + (kind === 'f' ? 1 : -1)); });
      return r;
    };
    const fOut = 'Nourriture <b class="food">' + e.food + '</b> <span class="dim">/ ' + N + '</span> · surplus <b class="' + (e.foodSurplus < 0 ? 'danger' : 'ok') + '">' + sgn(e.foodSurplus) + '</b>' + chip(fl && fl.food)
      + ' · croissance ' + grow(e) + chip(fl && fl.growth)
      + (empire != null ? '<br><span class="dim">Bilan de l\'empire, armées nourries :</span> ' + emp(empire) : '');
    const wOut = 'Production <b class="prod">' + e.prod + '</b>' + chip(fl && fl.prod)
      + ' · ' + (cost ? U.esc(Cities.prodName(c)) + ' : ' + tn(turns) + chip(fl && fl.turns, false, ' t') : '<span class="dim">' + U.esc(Cities.prodName(c)) + '</span>');
    box.append(
      row('f', 'Fermiers', 'food', Array.from({ length: F }, (_, i) => person('f', i)), fOut),
      row('w', 'Ouvriers', 'prod', Array.from({ length: W }, (_, i) => person('w', i)), wOut));
    if (R) box.append(row('r', 'Rebelles', 'unrest', Array.from({ length: R }, (_, i) => person('r', i)), '<span class="dim">ne produisent rien</span>'));
    box.append(h('div', { class: 'cfoot dim' },
      'Fermier : ' + e.farmerFood + ' nourriture et ½ production · ouvrier : ' + (race.workerProd || 2) + ' production. Le surplus de nourriture nourrit vos armées ; la croissance dépend surtout du plafond de population. Point doré : fermier indispensable.',
      empire != null && empire < 0 ? h('button', { class: 'abtn danger', style: 'margin-left:8px', title: 'Des ouvriers deviennent fermiers là où ils rapportent le plus, dans toutes vos cités', onclick: () => App.feedArmies() }, 'Nourrir les armées (' + empire + ')') : null,
      h('label', { style: 'margin-left:8px;cursor:pointer;white-space:nowrap' }, h('input', { type: 'checkbox', checked: c.autoFarmers, onchange: ev => { c.autoFarmers = ev.target.checked; if (c.autoFarmers) Cities.rebalanceFood(game, c.owner); else c.farmers = e.farmers; CityUI.render(); App.refresh(); } }), ' répartition automatique')));
    return box;
  },
  // glisser un citoyen d'une ligne à l'autre ; un simple clic le fait passer aussi
  dragCitizen(ev, el, c, kind, rowOf) {
    ev.preventDefault(); UI.hideTip();
    const x0 = ev.clientX, y0 = ev.clientY;
    let ghost = null, over = null;
    const target = kind === 'f' ? rowOf.w : rowOf.f;
    const move = e2 => {
      if (!ghost && Math.abs(e2.clientX - x0) + Math.abs(e2.clientY - y0) > 5) { ghost = el.cloneNode(true); ghost.classList.add('czghost'); document.body.append(ghost); el.style.opacity = '.35'; CityUI._dragging = true; UI.hideTip(); }
      if (!ghost) return;
      ghost.style.left = e2.clientX + 'px'; ghost.style.top = e2.clientY + 'px';
      const r = document.elementFromPoint(e2.clientX, e2.clientY); over = r && r.closest('.crow');
      target.classList.toggle('drop', over === target);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      CityUI._dragT = performance.now(); CityUI._dragging = false;
      if (ghost) ghost.remove(); el.style.opacity = ''; target.classList.remove('drop');
      if (ghost && over !== target) return; // lâché ailleurs : rien ne change
      const e = Cities.econ(App.game, c);
      if (kind === 'f' && e.farmers - 1 < e.minFarmers) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); UI.toast('Ce fermier est indispensable : sans lui, la cité aurait faim.', 'warn'); return; }
      CityUI.setFarmers(c, e.farmers + (kind === 'f' ? -1 : 1));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  },
  iconImgs: {},
  iconImg(name, onload) {
    if (CityUI.iconImgs[name]) return CityUI.iconImgs[name];
    const img = new Image(); img.onload = onload; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICONS[name].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" '));
    CityUI.iconImgs[name] = img; return img;
  },
  // ce que la zone apporte, en clair : dans Master of Magic, les 21 cases comptent toutes, quel que soit le nombre d'habitants
  zoneSummary(c, e) {
    const game = App.game, race = DATA.races[c.race], tiles = Cities.catchment(game, c);
    let pct = 0, shared = 0; const mins = new Map();
    for (const t of tiles) {
      const yl = CityUI.tileYield(game, c, t.x, t.y);
      if (t.shared) shared++;
      if (yl.corrupt) continue;
      pct += yl.prod;
      if (yl.mineral) mins.set(yl.mineral, (mins.get(yl.mineral) || 0) + 1);
    }
    const extra = [];
    if (c.buildings.granary) extra.push('grenier +2'); if (c.buildings.farmersMarket) extra.push('halle aux grains +3');
    const row = (ic, html, tip) => { const r = h('div', { class: 'zrow' }, h('span', { class: 'zic', html: ICONS[ic] || '' }), h('span', { html })); if (tip) UI.tipOn(r, tip); return r; };
    const box = h('div', { class: 'zonebox' },
      row('food', 'Nourriture du terrain <b class="food">' + e.foodLevel + '</b> → population maximale <b class="food">' + e.maxPop + '</b>' + (extra.length ? ' <span class="dim">(' + extra.join(', ') + ')</span>' : '') + (e.foodLevel + (c.buildings.granary ? 2 : 0) + (c.buildings.farmersMarket ? 3 : 0) > e.maxPop ? ' <span class="dim">(' + e.maxPop + ' au plus)</span>' : ''),
        '<h4>Plafond de population</h4>La nourriture de toutes les cases de la zone s\'additionne : elle fixe le nombre maximal de citoyens. Ce ne sont pas les cases qui nourrissent les habitants mais les fermiers ; au-delà de ce plafond, leur rendement est divisé par deux.'),
      row('prod', 'Relief <b class="prod">+' + Math.round(pct) + ' %</b> de production pour la cité',
        '<h4>Bonus du relief</h4>Forêts, collines et montagnes de la zone ajoutent chacune quelques pour cent à la production de tous les ouvriers et fermiers. Bâtiments compris, le bonus total est de +' + e.prodPct + ' %.'),
      mins.size ? row('gold', 'Gisements : ' + [...mins.entries()].map(([k, n]) => '<b class="gold">' + U.esc(DATA.minerals[k].name) + (n > 1 ? ' ×' + n : '') + '</b>').join(', '),
        '<h4>Gisements</h4>' + [...mins.keys()].map(k => '<div><b>' + U.esc(DATA.minerals[k].name) + '</b> : ' + U.esc(DATA.minerals[k].desc || '') + '</div>').join('')) : null,
      shared ? row('city', '<span style="color:#ffb060">' + U.n(shared, 'case partagée') + '</span> avec une cité voisine (pointillés orange) : elles comptent pour moitié.') : null,
      h('div', { class: 'dim', style: 'font-size:11.5px;line-height:1.35;margin-top:2px' }, 'Pas de case exploitée une à une comme dans Civilization : les citoyens sont fermiers (' + e.farmerFood + ' nourriture chacun) ou ouvriers (' + (race.workerProd || 2) + ' production chacun), et le terrain donne le plafond et le bonus.'));
    return box;
  },
  tileYield(game, c, x, y) {
    const world = game.world, p = c.plane;
    const t = Cities.catchment(game, c).find(o => o.x === x && o.y === y);
    const f = t ? t.f : 1;
    const mk = MIN_KEYS[World.get(world, p, 'mineral', x, y)];
    return { food: World.foodOf(world, p, x, y) * f, prod: World.prodPctOf(world, p, x, y, Cities.hasEnch(c, 'gaias_blessing')) * f, shared: t && t.shared, mineral: mk, corrupt: !!World.get(world, p, 'corrupt', x, y) };
  },
  drawCatchment(cv, c, e) {
    const game = App.game, ctx = cv.getContext('2d'), dpr = cv.width / 320;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, 320, 320);
    const ts = 64;
    const L = MapView.ensureLayer(c.plane), LT = MapView.LT;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = World.wx(game.world, c.x + dx), y = c.y + dy;
      if (!World.inY(game.world, y)) continue;
      ctx.drawImage(L, x * LT, y * LT, LT, LT, (dx + 2) * ts, (dy + 2) * ts, ts, ts);
    }
    // coins hors zone
    ctx.fillStyle = 'rgba(5,7,10,.78)';
    for (const [a, b] of [[0, 0], [4, 0], [0, 4], [4, 4]]) ctx.fillRect(a * ts, b * ts, ts, ts);
    // la zone entière : un liseré d'or autour des 21 cases
    ctx.save();
    ctx.beginPath();
    for (const [a, b] of [[1, 0], [4, 0], [4, 1], [5, 1], [5, 4], [4, 4], [4, 5], [1, 5], [1, 4], [0, 4], [0, 1], [1, 1]]) ctx.lineTo(a * ts, b * ts);
    ctx.closePath();
    ctx.shadowColor = 'rgba(255,214,110,.8)'; ctx.shadowBlur = 8; ctx.strokeStyle = '#f3d27a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    MapView.drawCity(ctx, c, 2 * ts, 2 * ts, ts);
    // apports de chaque case de la zone
    const redraw = () => { if (cv.isConnected) CityUI.drawCatchment(cv, c, e); };
    const food = CityUI.iconImg('food', redraw), prod = CityUI.iconImg('prod', redraw);
    ctx.font = '700 12px system-ui'; ctx.textBaseline = 'middle';
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
      const x = World.wx(game.world, c.x + dx), y = c.y + dy; if (!World.inY(game.world, y)) continue;
      const X = (dx + 2) * ts, Y = (dy + 2) * ts, yl = CityUI.tileYield(game, c, x, y);
      ctx.strokeStyle = yl.shared ? 'rgba(255,150,40,.85)' : 'rgba(255,255,255,.22)'; ctx.lineWidth = yl.shared ? 2 : 1;
      ctx.setLineDash(yl.shared ? [5, 4] : []); ctx.strokeRect(X + .5, Y + .5, ts - 1, ts - 1); ctx.setLineDash([]);
      if (dx === 0 && dy === 0) continue;
      const parts = [];
      if (yl.food) parts.push([food, String(Math.round(yl.food * 100) / 100).replace('.', ','), '#f1d27a']);
      if (yl.prod) parts.push([prod, '+' + Math.round(yl.prod) + '%', '#f0a860']);
      let by = Y + ts - 4 - parts.length * 15;
      for (const [img, txt, col] of parts) {
        const tw = ctx.measureText(txt).width + 20;
        ctx.fillStyle = 'rgba(8,10,14,.78)'; ctx.fillRect(X + 3, by, tw, 14);
        if (img.complete && img.naturalWidth) ctx.drawImage(img, X + 4, by + 1, 12, 12);
        ctx.fillStyle = col; ctx.fillText(txt, X + 18, by + 7.5);
        by += 15;
      }
      if (yl.shared) { ctx.fillStyle = 'rgba(8,10,14,.78)'; ctx.fillRect(X + ts - 17, Y + 3, 14, 14); ctx.fillStyle = '#ffb060'; ctx.fillText('½', X + ts - 14, Y + 10.5); }
    }
    ctx.textBaseline = 'alphabetic';
  },
  bindCatchmentTips(cv, c) {
    const game = App.game;
    cv.addEventListener('mousemove', ev => {
      const r = cv.getBoundingClientRect(), dx = Math.floor((ev.clientX - r.left) / (r.width / 5)) - 2, dy = Math.floor((ev.clientY - r.top) / (r.height / 5)) - 2;
      if (Math.abs(dx) === 2 && Math.abs(dy) === 2) { UI.showTip('<span class="dim">Hors de la zone de la cité</span>', ev, cv); return; }
      const x = World.wx(game.world, c.x + dx), y = c.y + dy; if (!World.inY(game.world, y)) return;
      const yl = CityUI.tileYield(game, c, x, y), td = DATA.terrain[World.terrainKey(game.world, c.plane, x, y)];
      let html = '<h4>' + td.name + '</h4>' + (dx === 0 && dy === 0 ? '<div class="dim">Case de la cité.</div>' : '') + 'Ajoute <b class="food">' + String(Math.round(yl.food * 100) / 100).replace('.', ',') + '</b> au plafond de population et <b class="prod">+' + Math.round(yl.prod) + ' %</b> à la production de la cité.<div class="dim">Elle compte en permanence, sans citoyen assigné.</div>';
      if (yl.mineral) html += '<div class="gold">' + DATA.minerals[yl.mineral].name + ' : ' + U.esc(DATA.minerals[yl.mineral].desc || '') + '</div>';
      if (yl.shared) html += '<div style="color:#ffb060">Partagée avec une cité voisine : apports divisés par deux.</div>';
      if (yl.corrupt) html += '<div class="danger">Terre corrompue : ne produit rien.</div>';
      UI.showTip(html, ev, cv);
    });
    cv.addEventListener('mouseleave', () => UI.hideTip());
  },

  // ---------- choix de production ----------
  chooseProduction(mode, city, after) {
    const game = App.game, c = city || game.cities[CityUI.cur]; if (!c) return;
    const queueMode = mode === 'queue';
    const e = Cities.econ(game, c);
    const list = h('div', { class: 'list' });
    const sideInfo = h('div', { class: 'box', style: 'min-height:220px' }, h('span', { class: 'dim' }, 'Survolez un élément pour le détail.'));
    const intro = queueMode ? h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Cliquez sur les éléments dans l\'ordre voulu : ils s\'ajoutent à la file. Les bâtiments qui dépendent d\'un autre déjà en file sont proposés.')
      : h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Clic : produire maintenant · bouton « + file » : ajouter à la file d\'attente.');
    const m = UI.modal({ title: (queueMode ? 'Ajouter à la file de ' : 'Production de ') + c.name, width: 900, body: h('div', null, intro, h('div', { style: 'display:grid;grid-template-columns:1.3fr 1fr;gap:12px' }, h('div', { class: 'scroll', style: 'max-height:62vh' }, list), sideInfo)),
      footer: queueMode ? [h('button', { class: 'btn primary', onclick: () => m.close() }, 'Terminé')] : [h('button', { class: 'btn', onclick: () => UI.peek(c.x, c.y, c.plane, c.name) }, 'Voir la cité sur la carte')], onClose: () => { CityUI.render(); App.refresh(); if (after) after(); } });
    const fill = () => {
    list.innerHTML = '';
    const add = (prod, icon, name, detail, cost, info) => {
      const start = c.prod.type === prod.type && c.prod.id === prod.id ? c.progress : Cities.savedProgress(c, prod);
      const turns = cost ? (e.prod > 0 ? Math.max(1, Math.ceil(Math.max(0, cost - start) / e.prod)) : start >= cost ? 1 : Infinity) : null;   // sans production : jamais
      const inQueue = (c.queue || []).filter(it => it.type === prod.type && it.id === prod.id).length;
      const canQueue = Cities.canQueue(game, c, prod);
      const row = h('div', { class: 'row' + (!queueMode && c.prod.type === prod.type && c.prod.id === prod.id ? ' sel' : '') }, spriteCanvas(icon, 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, name, inQueue ? h('span', { class: 'abl e', style: 'margin-left:6px' }, 'en file' + (inQueue > 1 ? ' ×' + inQueue : '')) : null), h('div', { class: 't2' }, detail)),
        cost ? h('div', { style: 'text-align:right' }, h('div', { class: 'prod' }, cost), h('div', { class: 'dim', style: 'font-size:11px' }, turns === Infinity ? 'jamais' : turns + ' t')) : null,
        !queueMode && canQueue ? h('button', { class: 'abtn qadd', title: 'Ajouter à la file d\'attente', onclick: ev => { ev.stopPropagation(); if (CityUI.enqueue(c, prod) !== false) UI.toast(U.esc(name) + ' ajouté à la file.'); CityUI.render(); fill(); } }, '+ file') : null);
      row.onclick = () => {
        if (queueMode) { if (canQueue) { CityUI.enqueue(c, prod); CityUI.render(); fill(); } return; }
        const was = c.prod;
        const shelved = Cities.setProduction(game, c, prod); m.close();
        if (shelved) UI.toast(U.esc(CityUI.itemName(was)) + ' retourne en tête de file, avec le travail déjà accompli (' + shelved.progress + ').');
      };
      row.onmouseenter = () => { sideInfo.innerHTML = info; };
      list.append(row);
    };
    const sameKind = prod => !queueMode && ['building', 'unit'].includes(prod.type) && ['building', 'unit'].includes(c.prod.type);
    list.append(h('h4', { class: 'gold', style: 'font-family:var(--sans);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:2px 0' }, 'Unités'));
    const unitList = queueMode ? DATA.races[c.race].units.filter(t => Cities.canBuildUnitLater(game, c, t)) : Cities.buildableUnits(game, c);
    for (const t of unitList) {
      const d = DATA.units[t]; const cost = Cities.unitCost(game, c, t, e);
      // tel qu'il sortira : expérience de l'Autel de bataille ou des écoles, entretien réel (colons sans vivres, Conjurateur…)
      const fake = CityUI.fakeUnit(c, t, e);
      const s = Units.stats(game, fake), up = Units.upkeep(game, fake);
      add({ type: 'unit', id: t }, 'unit:' + t, d.name, (s.melee ? s.melee + ' att · ' : '') + (s.ranged ? s.ranged + ' tir · ' : '') + s.def + ' déf · ' + s.figures + ' fig. · entretien ' + ([up.gold ? up.gold + ' or' : '', up.food ? up.food + ' nourr.' : '', up.mana ? up.mana + ' mana' : ''].filter(Boolean).join(', ') || 'aucun'), cost, UI.unitTip(fake, game));
    }
    // unités de ce peuple pas encore disponibles ici : ce qu'il faut bâtir d'abord
    if (!queueMode) {
      // les navires d'une cité sans accès à la mer : inutile de les montrer
      const later = DATA.races[c.race].units.filter(t => !unitList.includes(t) && !(DATA.units[t].sailing && !Cities.seaAccess(game, c))).map(t => ({ t, need: Cities.unitNeeds(game, c, t) })).filter(x => x.need);
      for (const { t, need } of later) {
        const d = DATA.units[t];
        const txt = need.impossible ? 'Impossible ici : ' + need.impossible
          : need.list.length ? 'Nécessite : ' + need.list.map(b => DATA.buildings[b].name).join(' → ') : 'La cité doit atteindre ' + U.fmt(need.pop) + ' habitants';
        const row = h('div', { class: 'row dis' }, spriteCanvas('unit:' + t, 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, d.name), h('div', { class: 't2' }, txt)));
        row.onmouseenter = () => { sideInfo.innerHTML = UI.unitTip({ type: t, ench: [], xp: 0, owner: c.owner, dmg: 0, weapon: Units.weaponFor(t, e.weapon) }, game) + '<div class="muted" style="margin-top:6px">' + U.esc(txt) + '</div>'; };
        list.append(row);
      }
    }
    list.append(h('h4', { class: 'gold', style: 'font-family:var(--sans);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:8px 0 2px' }, 'Bâtiments'));
    const blds = (queueMode ? Object.keys(DATA.buildings).filter(b => Cities.canBuildLater(game, c, b)) : Cities.buildableBuildings(game, c)).sort((a, b) => DATA.buildings[a].cost - DATA.buildings[b].cost);
    for (const b of blds) { const bd = DATA.buildings[b]; add({ type: 'building', id: b }, bldIcon(b), bd.name, (bd.desc || '').slice(0, 80) + (bd.upkeep ? ' · entretien ' + bd.upkeep : ''), bd.cost, '<h4>' + bd.name + '</h4>' + U.esc(bd.desc || '') + CityUI.effectsHtml(bd, c) + '<div class="dim" style="margin-top:4px">Coût ' + bd.cost + ' · entretien ' + bd.upkeep + ' or/tour</div>' + CityUI.unlocksHtml(b, c)); }
    // bâtiments verrouillés (informatif)
    const sea = Cities.seaAccess(game, c), naval = b => DATA.buildings[b].terrain === 'water' && !Object.keys(DATA.buildings[b].effects || {}).length;
    const locked = Object.keys(DATA.buildings).filter(b => DATA.buildings[b].buildable !== false && !['housing', 'tradeGoods'].includes(b) && !c.buildings[b] && !blds.includes(b) && !(DATA.races[c.race].cannotBuild || []).includes(b) && (sea || !naval(b)) && (c.fortress || !DATA.buildings[b].fortressOnly) && (!DATA.buildings[b].wonder || (DATA.buildings[b].wonder === c.race && !Wonders.off(game))));
    // armes magiques pour la garnison : avec la Guilde des alchimistes ; maintenant s'il y a quelqu'un à équiper, en file toujours
    if (c.buildings.alchemistsGuild) {
      const n = Cities.rearmTargets(game, c, e).length, rc = Cities.rearmCost(game, c, e);
      list.append(h('h4', { class: 'gold', style: 'font-family:var(--sans);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:8px 0 2px' }, 'Garnison'));
      if (n || queueMode) add({ type: 'rearm' }, 'item:sword:1', Cities.REARM_NAME, n ? U.n(n, 'unité à équiper', 'unités à équiper') : 'Personne à équiper pour l\'instant', rc, CityUI.rearmTip(c));
      else list.append(h('div', { class: 'row dis' }, spriteCanvas('item:sword:1', 32), h('div', { class: 'grow' }, h('div', { class: 't1' }, Cities.REARM_NAME), h('div', { class: 't2' }, 'Aucune unité de la garnison à équiper'))));
    }
    if (!queueMode) {
      list.append(h('h4', { class: 'gold', style: 'font-family:var(--sans);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin:8px 0 2px' }, 'Autres'));
      // ce que chacun rapporterait, comparé à l'autre : habitants en plus pour les logements, or pour le commerce
      const as = t => Cities.econ(game, Object.assign({}, c, { prod: { type: t } }));
      const eH = as('housing'), eT = as('tradeGoods'), more = eH.growth - eT.growth;
      // à la population maximale, loger plus de monde ne sert à rien
      if (Cities.citizens(c) < eH.maxPop && more > 0) add({ type: 'housing' }, bldIcon('housing'), 'Logements', '+' + more + ' hab./tour (croissance ' + eT.growth + ' → ' + eH.growth + ')', 0, '<h4>Logements</h4>La production sert à loger de nouveaux habitants : la croissance augmente selon la proportion d\'ouvriers.<div class="ok" style="margin-top:4px">+' + more + ' habitants par tour</div>');
      add({ type: 'tradeGoods' }, bldIcon('tradeGoods'), 'Biens de commerce', '+' + eT.tradeGoods + ' or/tour', 0, '<h4>Biens de commerce</h4>La moitié de la production est convertie en or.<div class="gold" style="margin-top:4px">+' + eT.tradeGoods + ' or par tour</div>');
    }
    if (locked.length && !queueMode) {
      list.append(h('div', { class: 'dim', style: 'font-size:11.5px;margin-top:6px' }, 'Verrouillés : ' + locked.map(b => {
        const pt = Cities.pathTo(game, c, b), before = pt.list.filter(x => x !== b).map(x => DATA.buildings[x].name);
        return DATA.buildings[b].name + ' (' + (pt.impossible ? 'impossible ici : ' + pt.impossible.replace(DATA.buildings[b].name + ' : ', '') : before.join(' → ')) + ')';
      }).join(' · ')));
    }
    };
    fill();
  },
  // ce que ce bâtiment ouvre : directement (avec les autres prérequis et leur état dans cette cité), puis plus loin
  BLD_FEM: ['Caserne', 'Forge', 'Armurerie', 'Guilde', 'Université', 'Scierie', 'Maison', 'Bibliothèque', 'Banque', 'Ménagerie', 'Cathédrale', 'Halle', 'École', 'Écuries', 'Tours'],
  builtWord(name) {
    const w = name.split(' ')[0], f = CityUI.BLD_FEM.includes(w), pl = /s$/.test(w) && ['Écuries', 'Tours', 'Remparts'].includes(w);
    return 'déjà construit' + (f ? 'e' : '') + (pl ? 's' : '');
  },
  unlocksHtml(b, c) {
    const game = App.game, race = DATA.races[c.race], no = race.cannotBuild || [];
    const queued = new Set((c.queue || []).filter(it => it.type === 'building').map(it => it.id));
    const cur = c.prod && c.prod.type === 'building' ? c.prod.id : null;
    const okHere = x => DATA.buildings[x] && DATA.buildings[x].buildable !== false && !no.includes(x) && (c.fortress || !DATA.buildings[x].fortressOnly) && (!DATA.buildings[x].wonder || DATA.buildings[x].wonder === c.race);
    // la cité comme si b y était : ce qui resterait impossible l'est pour d'autres raisons (terrain, mer)
    const withB = Object.assign({}, c, { buildings: Object.assign({}, c.buildings, { [b]: true }) });
    const state = r => {
      const n = DATA.buildings[r].name;
      if (c.buildings[r]) return n + ' : ' + CityUI.builtWord(n);
      if (cur === r) return n + ' : en chantier';
      if (queued.has(r)) return n + ' : en file';
      const before = Cities.pathTo(game, c, r).list.filter(x => x !== r && x !== b).map(x => DATA.buildings[x].name + (x === cur ? ', déjà en chantier' : queued.has(x) ? ', déjà en file' : ''));
      return n + ' : à construire' + (before.length ? ', après ' + before.join(' → ') : '');
    };
    const item = (name, reqs, imp) => {
      const others = reqs.filter(r => r !== b);
      const m = imp && /^(.+?) : (.+)$/.exec(imp);
      if (m && (m[1] === name || Object.values(DATA.buildings).some(x => x.name === m[1]))) imp = m[2];
      return '<b>' + U.esc(name) + '</b>' + (imp ? ' (impossible ici : ' + U.esc(imp) + ')' : others.length ? ' (avec ' + others.map(state).join(' ; avec ') + ')' : '');
    };
    const direct = Object.keys(DATA.buildings).filter(x => (DATA.buildings[x].requires || []).includes(b) && okHere(x) && !c.buildings[x]);
    const bl = direct.map(x => item(DATA.buildings[x].name, DATA.buildings[x].requires, Cities.pathTo(game, withB, x).impossible));
    const units = race.units.filter(t => (DATA.units[t].requires || []).includes(b));
    const ul = units.map(t => { const d = DATA.units[t], need = Cities.unitNeeds(game, withB, t); return item(d.name, d.requires, need && need.impossible); });
    // plus loin : ce dont b n'est qu'une étape (bâtiments et unités possibles ici, une fois le reste bâti)
    const far = [], seen = new Set([b, ...direct]);
    for (let frontier = direct.slice(); frontier.length;) {
      const next = [];
      for (const x of frontier) for (const y of Object.keys(DATA.buildings)) {
        if (seen.has(y) || !(DATA.buildings[y].requires || []).includes(x) || !okHere(y) || c.buildings[y]) continue;
        seen.add(y); next.push(y);
        if (!Cities.pathTo(game, withB, y).impossible) far.push(DATA.buildings[y].name);
      }
      frontier = next;
    }
    for (const t of race.units) if (!units.includes(t) && (DATA.units[t].requires || []).some(r => seen.has(r) && r !== b)) { const need = Cities.unitNeeds(game, withB, t); if (!(need && need.impossible)) far.push(DATA.units[t].name); }
    let s = '';
    if (bl.length) s += '<div class="muted" style="margin-top:4px">Permet la construction de : ' + bl.join(', ') + '</div>';
    if (ul.length) s += '<div class="muted"' + (bl.length ? '' : ' style="margin-top:4px"') + '>Permet de former : ' + ul.join(', ') + '</div>';
    if (far.length) s += '<div class="dim">Étape vers : ' + far.slice(0, 10).map(U.esc).join(', ') + (far.length > 10 ? ' et ' + U.n(far.length - 10, 'autre', 'autres') : '') + '</div>';
    return s;
  },
};
