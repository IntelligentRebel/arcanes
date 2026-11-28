'use strict';
// Raccourcis clavier (0.31.75). Chaque ordre a sa touche par défaut ; le joueur peut la changer (Menu > Touches), le choix est
// gardé dans les préférences du navigateur. Une touche s'écrit comme KeyboardEvent.key en minuscules, précédée au besoin de
// « ctrl+ », « alt+ », « shift+ » : 'w', 'shift+c', 'ctrl+f', 'f5', ' ', 'enter'. Maj ne compte que pour les lettres (sur un
// clavier AZERTY, les chiffres demandent Maj). Une même touche peut servir deux ordres d'un même écran quand le premier ne
// s'applique pas toujours (R : la route d'un ingénieur, sinon la recherche) : l'ordre de la liste décide.
const KEY_WORDS = { ' ': 'Espace', enter: 'Entrée', escape: 'Échap', backspace: 'Retour arrière', delete: 'Suppr', insert: 'Inser', home: 'Début', end: 'Fin', pageup: 'Page préc.', pagedown: 'Page suiv.', ctrl: 'Ctrl', alt: 'Alt', shift: 'Maj' };
const Keys = {
  ACTIONS: [
    { id: 'next', ctx: 'map', key: ' ', alias: ['n'], label: 'Unité suivante' },
    { id: 'endTurn', ctx: 'map', key: 'enter', label: 'Fin du tour' },
    { id: 'center', ctx: 'map', key: 'c', label: 'Centrer sur la sélection' },
    { id: 'wait', ctx: 'map', key: 'w', label: 'Attendre' },
    { id: 'sentry', ctx: 'map', key: 's', label: 'Sentinelle' },
    { id: 'pass', ctx: 'map', key: 'f', label: 'Passer le tour de l\'unité' },
    { id: 'explore', ctx: 'map', key: 'x', label: 'Exploration automatique' },
    { id: 'patrol', ctx: 'map', key: 'z', label: 'Patrouille' },
    { id: 'undo', ctx: 'map', key: 'u', label: 'Annuler le dernier déplacement' },
    { id: 'heal', ctx: 'map', key: 'h', label: 'Soigner dans la cité' },
    { id: 'found', ctx: 'map', key: 'b', label: 'Fonder une cité' },
    { id: 'roadTo', ctx: 'map', key: 'shift+r', label: 'Route vers… (ingénieurs)' },
    { id: 'road', ctx: 'map', key: 'r', label: 'Route (ingénieurs)' },
    { id: 'plane', ctx: 'map', key: 'p', label: 'Changer de plan' },
    { id: 'zoomIn', ctx: 'map', key: '+', alias: ['='], label: 'Zoom avant' },
    { id: 'zoomOut', ctx: 'map', key: '-', label: 'Zoom arrière' },
    { id: 'research', ctx: 'map', key: 'r', label: 'Recherche' },
    { id: 'spellbook', ctx: 'map', key: 'g', label: 'Grimoire' },
    { id: 'magic', ctx: 'map', key: 'm', label: 'Magie' },
    { id: 'cities', ctx: 'map', key: 'shift+c', label: 'Cités' },
    { id: 'armies', ctx: 'map', key: 'a', label: 'Armées' },
    { id: 'wizards', ctx: 'map', key: 'd', label: 'Sorciers' },
    { id: 'chronicle', ctx: 'map', key: 'j', label: 'Chronique' },
    { id: 'log', ctx: 'map', key: 'l', label: 'Journal' },
    { id: 'threats', ctx: 'map', key: 't', label: 'Menaces sur vos cités' },
    { id: 'lairs', ctx: 'map', key: 'v', label: 'Lieux inexplorés' },
    { id: 'nodes', ctx: 'map', key: 'o', label: 'Nœuds à prendre' },
    { id: 'foeMoves', ctx: 'map', key: 'y', label: 'Revoir les mouvements adverses' },
    { id: 'pin', ctx: 'map', key: 'k', label: 'Repère sur la case survolée' },
    { id: 'search', ctx: 'map', key: 'ctrl+f', label: 'Rechercher sur la carte' },
    { id: 'quickSave', ctx: 'map', key: 'f5', alias: ['ctrl+s'], label: 'Sauvegarde rapide' },
    { id: 'quickLoad', ctx: 'map', key: 'f9', label: 'Chargement rapide' },
    { id: 'c_spells', ctx: 'combat', key: 's', label: 'Sorts' },
    { id: 'c_end', ctx: 'combat', key: 'enter', label: 'Fin du tour' },
    { id: 'c_wait', ctx: 'combat', key: 'w', label: 'Attendre' },
    { id: 'c_guard', ctx: 'combat', key: 'd', label: 'Garder' },
    { id: 'c_breach', ctx: 'combat', key: 'g', label: 'Garder jusqu\'à la brèche' },
    { id: 'c_auto', ctx: 'combat', key: 'a', label: 'Automatiser toute la bataille' },
    { id: 'c_unitAuto', ctx: 'combat', key: 'u', label: 'Automatiser cette unité' },
    { id: 'c_center', ctx: 'combat', key: 'c', label: 'Centrer sur l\'unité' },
    { id: 'c_zoom', ctx: 'combat', key: '0', label: 'Rétablir le zoom' },
    { id: 'c_rotate', ctx: 'combat', key: 'r', label: 'Tourner la ligne d\'un sort' },
  ],
  // touches qu'on ne prend pas : elles ont déjà un rôle fixe (fermer, faire défiler, sorts rapides du combat)
  RESERVED: new Set(['escape', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '1', '2', '3', '4', '5', '6', '7', '8', '9']),
  byId(id) { return Keys.ACTIONS.find(a => a.id === id) || null; },
  custom() { return (typeof App !== 'undefined' && App.prefs && App.prefs.keys) || {}; },
  get(id) { const a = Keys.byId(id); if (!a) return ''; const c = Keys.custom()[id]; return c != null ? c : a.key; },
  // la touche d'un événement clavier, dans la même écriture
  combo(e) {
    let k = String(e.key || '').toLowerCase();
    if (!k || ['control', 'shift', 'alt', 'meta', 'altgraph', 'dead', 'unidentified', 'os'].includes(k)) return '';
    if (k === 'spacebar') k = ' ';
    let pre = '';
    if (e.ctrlKey || e.metaKey) pre += 'ctrl+';
    if (e.altKey) pre += 'alt+';
    if (e.shiftKey && /^[a-z]$/.test(k)) pre += 'shift+';
    return pre + k;
  },
  // les ordres de cet écran que déclenche cette touche, dans l'ordre de la liste
  match(e, ctx) {
    const k = Keys.combo(e); if (!k) return [];
    return Keys.ACTIONS.filter(a => a.ctx === ctx && (Keys.get(a.id) === k || (a.alias || []).includes(k))).map(a => a.id);
  },
  // « Maj+C », « Ctrl+F », « Espace », « F5 »
  label(k) {
    if (k == null) return '';
    const parts = k === ' ' || k === '+' ? [k] : k.split('+').map((p, i, a) => p === '' && i === a.length - 1 ? '+' : p).filter(p => p !== '');
    return parts.map(p => KEY_WORDS[p] || (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1))).join('+');
  },
  labelOf(id) { return Keys.label(Keys.get(id)); },
  // la marque d'un bouton : « S », « ⇧R », « ↵ »
  badge(id) {
    const k = Keys.get(id); if (!k) return null;
    if (k === 'enter') return '↵';
    if (k === ' ') return KEY_WORDS[' '];
    if (/^shift\+[a-z]$/.test(k)) return '⇧' + k.slice(-1).toUpperCase();
    return Keys.label(k);
  },
  changed(id) { const a = Keys.byId(id); return !!a && Keys.get(id) !== a.key; },
  // une nouvelle touche pour un ordre : ceux du même écran qui l'avaient prennent l'ancienne (échange)
  assign(id, k) {
    const a = Keys.byId(id); if (!a || !k) return [];
    const old = Keys.get(id), map = Object.assign({}, Keys.custom()), moved = [];
    for (const o of Keys.ACTIONS) if (o.ctx === a.ctx && o.id !== id && Keys.get(o.id) === k) { map[o.id] = old; moved.push(o.id); }
    map[id] = k;
    for (const o of Keys.ACTIONS) if (map[o.id] === o.key) delete map[o.id];
    App.setPref('keys', map); Keys.applied();
    return moved;
  },
  reset() { App.setPref('keys', {}); Keys.applied(); },
  // les marques des boutons (barre du haut, ordres de la pile) suivent le réglage
  applied() { if (typeof App !== 'undefined' && App.game) { App.buildTopbar(); App.refresh(); } },
  // pourquoi cette touche ne peut pas servir (ou null)
  refuse(k) {
    if (!k) return 'Touche non reconnue.';
    if (Keys.RESERVED.has(k)) return 'Cette touche a déjà un rôle fixe.';
    if (['ctrl+w', 'ctrl+t', 'ctrl+n', 'ctrl+tab', 'ctrl+shift+n', 'ctrl+shift+t', 'ctrl+shift+w'].includes(k)) return 'Le navigateur garde cette combinaison pour lui.';
    return null;
  },

  // ---------- l'écran de réglage ----------
  panel() {
    const body = h('div');
    let waiting = null;
    const stop = () => { if (waiting) { window.removeEventListener('keydown', waiting, true); waiting = null; } };
    const m = UI.modal({ title: 'Touches', width: 720, body, onClose: stop, footer: [h('button', { class: 'btn ghost', onclick: () => { Keys.reset(); render(); } }, 'Touches par défaut'), h('button', { class: 'btn primary', onclick: () => m.close() }, 'Fermer')] });
    const render = () => {
      stop(); body.innerHTML = '';
      body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, 'Cliquez sur une touche, puis appuyez sur la nouvelle. Échap annule. Les chiffres 1 à 9 lancent en combat vos derniers sorts.'));
      const cols = h('div', { class: 'grid2 keyset' });
      for (const [ctx, title] of [['map', 'Carte'], ['combat', 'Combat']]) {
        const col = h('div', null, h('h4', { class: 'gold', style: 'margin-bottom:6px' }, title));
        for (const a of Keys.ACTIONS.filter(x => x.ctx === ctx)) {
          const btn = h('button', { class: 'abtn kbtn' + (Keys.changed(a.id) ? ' changed' : ''), title: Keys.changed(a.id) ? 'Par défaut : ' + Keys.label(a.key) : '' }, Keys.labelOf(a.id));
          btn.onclick = () => {
            stop(); btn.textContent = '…'; btn.classList.add('wait');
            const fn = e => {
              e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
              if (e.key === 'Escape') { render(); return; }
              const k = Keys.combo(e); if (!k) return;
              const why = Keys.refuse(k); if (why) { UI.toast(why, 'warn', 'keys'); return; }
              const moved = Keys.assign(a.id, k);
              if (moved.length) UI.toast(Keys.label(k) + ' servait déjà à : ' + moved.map(id => Keys.byId(id).label).join(', ') + '. Nouvelle touche : ' + Keys.labelOf(moved[0]) + '.', '', 'keys');
              render();
            };
            waiting = fn; window.addEventListener('keydown', fn, true);
          };
          col.append(h('div', { class: 'kv' }, h('span', null, a.label), btn));
        }
        cols.append(col);
      }
      body.append(cols);
    };
    render();
    return m;
  },
};
