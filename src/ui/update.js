'use strict';
// 0.31.22 : la copie du jeu ouverte depuis le disque (le zip d'une version publiée) demande à GitHub, deux fois par jour
// au plus, si une version plus récente est parue. Si oui, l'écran titre et le menu la proposent, avec les notes de chaque
// version depuis celle-ci. Seule la copie locale demande (le jeu en ligne est toujours le dernier) ; la recherche se
// coupe dans le menu. Elle lit la liste publique des versions et n'envoie rien.
const Update = {
  RELEASES_URL: 'https://github.com/IntelligentRebel/arcanes/releases',
  API_URL: 'https://api.github.com/repos/IntelligentRebel/arcanes/releases?per_page=30',
  ONLINE_URL: 'https://intelligentrebel.github.io/arcanes/',
  KEY: 'arcanes:update',
  EVERY: 12 * 3600 * 1000,
  newer: [],
  checking: false,
  listeners: [],

  isLocalCopy() { return typeof location !== 'undefined' && location.protocol === 'file:'; },
  enabled() { return App.prefs.checkUpdates !== false; },

  // « 0.31.22b » > « 0.31.22 » > « 0.31.9 » : nombre par nombre, puis la lettre
  cmp(a, b) {
    const parts = v => String(v).replace(/^v/, '').split('.').map(p => { const m = p.match(/^(\d*)([a-z]*)/i) || []; return [parseInt(m[1], 10) || 0, (m[2] || '').toLowerCase()]; });
    const x = parts(a), y = parts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i] || [0, ''], q = y[i] || [0, ''];
      if (p[0] !== q[0]) return p[0] - q[0];
      if (p[1] !== q[1]) return p[1] < q[1] ? -1 : 1;
    }
    return 0;
  },

  // les versions publiées (la plus récente d'abord), d'après la réponse de l'API de GitHub
  parse(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(r => r && !r.draft && !r.prerelease && /^v?\d+(\.\d+)*[a-z]?$/i.test(r.tag_name || '')).map(r => {
      // deux archives par version : le jeu entier, et la mise à jour depuis la version d'avant (arcanes-update-<avant>-to-<version>.zip)
      const zips = (Array.isArray(r.assets) ? r.assets : []).filter(a => /\.zip$/i.test(a.name || '')), isUpd = a => /^arcanes-update-/i.test(a.name);
      const zip = zips.find(a => !isUpd(a)), up = zips.find(isUpd), from = up ? (up.name.match(/^arcanes-update-(.+)-to-/i) || [])[1] : null;
      return { version: String(r.tag_name).replace(/^v/, ''), date: String(r.published_at || ''), body: String(r.body || ''), page: String(r.html_url || Update.RELEASES_URL), zip: zip ? zip.browser_download_url : null, size: zip ? zip.size : 0,
        upd: up && from ? { from, url: up.browser_download_url, size: up.size || 0 } : null };
    }).sort((a, b) => Update.cmp(b.version, a.version));
  },

  readCache() { try { const c = JSON.parse(localStorage.getItem(Update.KEY) || 'null'); return c && Array.isArray(c.releases) ? c : null; } catch (e) { return null; } },
  writeCache(c) { try { localStorage.setItem(Update.KEY, JSON.stringify(c)); } catch (e) { /* stockage indisponible */ } },
  publish(list) { Update.newer = list.filter(r => Update.cmp(r.version, GAME_VERSION) > 0); for (const f of Update.listeners) { try { f(); } catch (e) { /* écran fermé */ } } },
  onChange(f) { Update.listeners.push(f); },

  // demande à GitHub (deux fois par jour au plus, ou tout de suite si force) ; la réponse est gardée pour les lancements suivants
  async check(force) {
    if (!Update.isLocalCopy() || Update.checking) return Update.newer;
    if (!force && !Update.enabled()) return Update.newer;
    const cache = Update.readCache();
    if (cache) Update.publish(cache.releases);
    if (!force && cache && Date.now() - cache.checked < Update.EVERY) return Update.newer;
    Update.checking = true;
    try {
      const r = await fetch(Update.API_URL, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) return null;
      const list = Update.parse(await r.json());
      // toutes les versions récentes, pas seulement les plus neuves que cette copie : une copie plus ancienne ouverte le même jour lit ce cache
      Update.writeCache({ checked: Date.now(), releases: list.slice(0, 20) });
      Update.publish(list);
      return Update.newer;
    } catch (e) { return null; } finally { Update.checking = false; }
  },

  // les notes d'une version dans la langue du joueur : la partie « En français » pour le français, l'anglaise sinon
  notes(body) {
    const FR = /<details>\s*<summary>\s*En français\s*<\/summary>([\s\S]*?)<\/details>/i, fr = body.match(FR);
    const text = (I18N.lang === 'fr' && fr ? fr[1] : body.replace(FR, '')).replace(/\r/g, '');
    const lines = text.split('\n'), start = lines.findIndex(l => /^#{2,3}\s/.test(l));
    return (start >= 0 ? lines.slice(start) : lines).join('\n').trim();
  },
  // titres, puces et paragraphes ; le gras et les liens dans une ligne (texte venu de GitHub : jamais de HTML inséré)
  render(text) {
    const inline = s => {
      const out = [], re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g; let last = 0, m;
      while ((m = re.exec(s))) {
        if (m.index > last) out.push(s.slice(last, m.index));
        out.push(m[1] !== undefined ? h('b', null, m[1]) : h('a', { href: m[3], target: '_blank', rel: 'noopener noreferrer' }, m[2]));
        last = re.lastIndex;
      }
      if (last < s.length) out.push(s.slice(last));
      return out;
    };
    const box = h('div', { class: 'release-notes' }); let list = null, para = [];
    const flush = () => { if (para.length) { box.append(h('p', null, ...inline(para.join(' ')))); para = []; } list = null; };
    for (const raw of text.split('\n')) {
      const l = raw.trim();
      if (!l) { flush(); continue; }
      const hd = l.match(/^#{1,6}\s+(.*)$/), bl = l.match(/^[-*]\s+(.*)$/);
      if (hd) { flush(); box.append(h('h5', null, ...inline(hd[1]))); }
      else if (bl) { if (para.length) flush(); if (!list) { list = h('ul'); box.append(list); } list.append(h('li', null, ...inline(bl[1]))); }
      else if (list && list.lastChild) list.lastChild.append(' ', ...inline(l));
      else para.push(l);
    }
    flush();
    return box;
  },

  dialog() {
    const list = Update.newer, latest = list[0];
    if (!latest) { UI.toast('Vous avez la dernière version (' + GAME_VERSION + ').', '', 'update'); return; }
    const mb = latest.size ? Math.round(latest.size / 1e6) : 0;
    const date = d => { const t = Date.parse(d); return isNaN(t) ? '' : new Date(t).toLocaleDateString(I18N.locale); };
    const ext = { target: '_blank', rel: 'noopener noreferrer' };
    // la mise à jour seule ne vaut que depuis la version juste avant
    const upd = latest.upd && latest.upd.from === GAME_VERSION ? latest.upd : null;
    const umb = upd ? (upd.size >= 1e6 ? Math.round(upd.size / 1e6) : Math.max(0.1, Math.round(upd.size / 1e5) / 10).toLocaleString(I18N.locale)) : 0;
    const body = h('div', null,
      h('p', null, list.length > 1 ? 'Vous jouez la version ' + GAME_VERSION + ' : ' + list.length + ' versions sont parues depuis.' : 'Vous jouez la version ' + GAME_VERSION + '.'),
      h('div', { class: 'update-get' },
        upd ? h('a', Object.assign({ class: 'btn primary', href: upd.url }, ext), 'Mise à jour seule (.zip, ' + umb + ' Mo)') : null,
        h('a', Object.assign({ class: upd ? 'btn' : 'btn primary', href: latest.zip || latest.page }, ext), latest.zip ? (mb ? 'Télécharger le jeu (.zip, ' + mb + ' Mo)' : 'Télécharger le jeu (.zip)') : 'Page de la version'),
        h('a', Object.assign({ class: 'btn', href: Update.ONLINE_URL }, ext), 'Jouer en ligne')),
      upd ? h('p', { class: 'dim', style: 'font-size:12px' }, 'La mise à jour seule ne contient que les fichiers modifiés : décompressez-la à côté de votre dossier arcanes, en acceptant de remplacer les fichiers.') : null,
      h('p', { class: 'dim', style: 'font-size:12px' }, upd ? 'Le jeu entier se décompresse à la place de l\'ancien dossier, sous le même nom. Dans les deux cas, vos parties restent dans ce navigateur ; par précaution, exportez d\'abord celles qui comptent.' : 'Décompressez l\'archive à la place de l\'ancien dossier, sous le même nom : vos parties restent dans ce navigateur. Par précaution, exportez d\'abord celles qui comptent.'),
      ...list.map(r => h('section', { class: 'release' }, h('h4', null, 'Version ' + r.version, ' ', h('small', { class: 'dim' }, date(r.date))), Update.render(Update.notes(r.body)))),
      h('p', { style: 'font-size:12px;margin-top:12px' }, h('a', Object.assign({ href: Update.RELEASES_URL }, ext), 'Toutes les versions sur GitHub')));
    const m = UI.modal({ title: 'Nouvelle version : ' + latest.version, width: 680, body, cls: 'update-modal', footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Plus tard') });
  },

  // 0.31.50 : une copie locale à laquelle il manque une mise à jour se signale. Chaque image livrée doit exister et avoir
  // la taille attendue, et le dictionnaire de la langue doit être celui de cette version (tools/build.py, ASSET_CHECK).
  async verify(force) {
    const want = typeof window !== 'undefined' && window.ASSET_CHECK;
    if (!want || (!force && !Update.isLocalCopy())) return [];
    const bad = [], sig = window.I18N_SIG || {}, ask = window.I18N_WANT;
    for (const lg of ask && ask !== 'fr' ? (ask !== 'en' && want.lang.en ? [ask, 'en'] : [ask]) : [])
      if (want.lang[lg] && sig[lg] !== want.lang[lg]) bad.push('lang/' + lg + '.js');
    const probe = (p, wh) => new Promise(res => { const im = new Image();
      im.onload = () => res(im.naturalWidth === wh[0] && im.naturalHeight === wh[1] ? null : p); im.onerror = () => res(p); im.src = p; });
    const list = Object.entries(want.img);
    for (let i = 0; i < list.length; i += 6) bad.push(...(await Promise.all(list.slice(i, i + 6).map(([p, wh]) => probe(p, wh)))).filter(Boolean));
    return bad;
  },
  async verifyAndWarn() { const bad = await Update.verify(); if (bad.length) Update.incomplete(bad); },
  incomplete(bad) {
    const ext = { target: '_blank', rel: 'noopener noreferrer' };
    const body = h('div', null,
      h('p', null, bad.length === 1 ? 'Un fichier de votre copie manque ou date d\'une version antérieure :' : bad.length + ' fichiers de votre copie manquent ou datent d\'une version antérieure :'),
      h('ul', { class: 'dim', style: 'font-size:12px' }, ...bad.slice(0, 8).map(p => h('li', null, p)), bad.length > 8 ? h('li', null, '…') : null),
      h('p', null, 'Une mise à jour a sans doute été sautée. Le jeu entier remet tout en ordre, sans toucher à vos parties.'),
      h('div', { class: 'update-get' }, h('a', Object.assign({ class: 'btn primary', href: Update.RELEASES_URL + '/latest' }, ext), 'Télécharger le jeu entier')));
    const m = UI.modal({ title: 'Copie incomplète', width: 560, body, cls: 'update-modal', footer: h('button', { class: 'btn', onclick: () => m.close() }, 'Plus tard') });
  },

  // l'écran titre : un bouton sous les autres quand une version plus récente est connue
  titleButton(scr) {
    const put = () => {
      const old = scr.querySelector('.update-btn'); if (old) old.remove();
      if (!Update.newer.length || !scr.isConnected) return;
      const col = scr.querySelector('.title-actions'); if (!col) return;
      col.append(h('button', { class: 'btn update-btn', style: 'height:36px', onclick: () => Update.dialog() }, 'Nouvelle version disponible : ' + Update.newer[0].version));
    };
    put(); Update.onChange(put);
  },
};
