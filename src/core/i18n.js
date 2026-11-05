'use strict';
// Langues. Le code est écrit en français ; tools/i18n_build.js enveloppe au moment de l'assemblage chaque texte affiché
// dans __t('…') ou __tf('… {0} …', [valeurs]). Les traductions (i18n/<langue>.json, texte français -> traduction) sont
// livrées dans lang/<langue>.js et chargées avant le jeu. Sans dictionnaire (banc, tests sous Node) : le français, tel quel.
const I18N = {
  LANGS: [
    { id: 'en', name: 'English', locale: 'en-US' },
    { id: 'zh', name: '简体中文', locale: 'zh-CN' },
    { id: 'de', name: 'Deutsch', locale: 'de-DE' },
    { id: 'es', name: 'Español', locale: 'es-ES' },
    { id: 'pt', name: 'Português', locale: 'pt-BR' },
    { id: 'ru', name: 'Русский', locale: 'ru-RU' },
    { id: 'fr', name: 'Français', locale: 'fr-FR' },
    { id: 'ja', name: '日本語', locale: 'ja-JP' },
    { id: 'ko', name: '한국어', locale: 'ko-KR' },
    { id: 'it', name: 'Italiano', locale: 'it-IT' },
    { id: 'pl', name: 'Polski', locale: 'pl-PL' },
  ],
  KEY: 'arcanes:lang',
  // la langue choisie, sinon celle du navigateur, sinon l'anglais ; le français quand rien n'est traduit (Node)
  detect() {
    const W = typeof window !== 'undefined' ? window : null;
    if (!W || !W.I18N_DICT) return 'fr';
    const ok = id => id === 'fr' || !!W.I18N_DICT[id];
    try { const s = W.localStorage && W.localStorage.getItem(I18N.KEY); if (s && I18N.LANGS.some(l => l.id === s) && ok(s)) return s; } catch (e) { /* stockage indisponible */ }
    const nav = W.navigator ? (W.navigator.languages && W.navigator.languages.length ? W.navigator.languages : [W.navigator.language]) : [];
    for (const n of nav) { const id = String(n || '').toLowerCase().split(/[-_]/)[0]; if (I18N.LANGS.some(l => l.id === id) && ok(id)) return id; }
    return ok('en') ? 'en' : 'fr';
  },
  set(id) { try { localStorage.setItem(I18N.KEY, id); } catch (e) { /* stockage indisponible */ } },
  // les langues livrées (lang/<langue>.js), et le français
  available() { const s = typeof window !== 'undefined' && window.I18N_SHIPPED || []; return I18N.LANGS.filter(l => l.id === 'fr' || s.includes(l.id)); },
  // changer de langue : la page se recharge (la partie en cours est d'abord sauvegardée)
  switchTo(id) { if (id === I18N.lang) return; I18N.set(id); try { if (typeof App !== 'undefined' && App.game && !App.game.over) App.save('auto'); } catch (e) { /* sans sauvegarde */ } location.reload(); },
  // pluriel : le français met le singulier à 0 et 1 ; ailleurs, les règles de la langue (Intl.PluralRules)
  cat(k) {
    if (I18N.lang === 'fr' || !I18N.rules) return Math.abs(k) >= 2 ? 'other' : 'one';
    try { return I18N.rules.select(Math.abs(k)); } catch (e) { return Math.abs(k) === 1 ? 'one' : 'other'; }
  },
  many(k) { return I18N.cat(k) !== 'one'; },
  // un pluriel traduit « 2 à 4¦5 et plus » (russe, polonais) : la seconde forme sert partout, la première après 2, 3, 4…
  few: new Map(),
  pick(k, one, many) { const c = I18N.cat(k); return c === 'one' ? one : c === 'few' && I18N.few.has(many) ? I18N.few.get(many) : many; },
  // traduction -> texte français (les derniers textes produits) : ce qui lit le texte d'un message pour en juger le ton
  back: new Map(),
  fr(s) { return I18N.back.get(s) || s; },
};
I18N.lang = I18N.detect();
I18N.locale = (I18N.LANGS.find(l => l.id === I18N.lang) || I18N.LANGS[6]).locale;
// séparateur décimal de la langue (« 2,5 » en français, « 2.5 » en anglais)
try { I18N.rules = typeof Intl !== 'undefined' && Intl.PluralRules ? new Intl.PluralRules(I18N.locale) : null; } catch (e) { I18N.rules = null; }
I18N.dec = (() => { try { return (1.5).toLocaleString(I18N.locale).charAt(1) || ','; } catch (e) { return ','; } })();
I18N.dict = I18N.lang !== 'fr' && typeof window !== 'undefined' && window.I18N_DICT ? window.I18N_DICT[I18N.lang] || null : null;
// repli : l'anglais pour ce qui manque dans une autre langue
I18N.alt = I18N.lang !== 'en' && I18N.lang !== 'fr' && typeof window !== 'undefined' && window.I18N_DICT ? window.I18N_DICT.en || null : null;
if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = I18N.lang;

function __t(s) {
  const d = I18N.dict; if (!d) return s;
  let t = d[s] != null ? d[s] : I18N.alt && I18N.alt[s] != null ? I18N.alt[s] : s;
  if (t.indexOf('¦') >= 0) { const i = t.indexOf('¦'), m = t.slice(i + 1); I18N.few.set(m, t.slice(0, i)); t = m; }
  if (t !== s) { if (I18N.back.size > 600) I18N.back.clear(); I18N.back.set(t, s); }
  return t;
}
function __tf(s, a) {
  const fill = x => x.replace(/\{(\d+)\}/g, (m, i) => { const v = a[+i]; return v === undefined ? 'undefined' : String(v); });
  const d = I18N.dict; if (!d) return fill(s);
  const t = d[s] != null ? d[s] : I18N.alt && I18N.alt[s] != null ? I18N.alt[s] : null;
  if (t == null) return fill(s);
  const out = fill(t);
  if (I18N.back.size > 600) I18N.back.clear(); I18N.back.set(out, fill(s));
  return out;
}
// une clé posée à la main (i18n/manual.json) : son modèle dans la langue, sinon le modèle français fourni
function __k(id, fr, a) {
  const d = I18N.dict, t = d && d[id] != null ? d[id] : I18N.alt && I18N.alt[id] != null ? I18N.alt[id] : fr;
  return t.replace(/\{(\d+)\}/g, (m, i) => String(a[+i]));
}
// textes de la page elle-même (index.html), traduits une fois au chargement
I18N.page = function () {
  if (!I18N.dict || typeof document === 'undefined') return;
  const walk = el => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { const v = n.nodeValue, t = v.trim(); if (t && /[A-Za-zÀ-ÿ]/.test(t)) n.nodeValue = v.replace(t, __t(t)); }
      else if (n.nodeType === 1 && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') { if (n.title) n.title = __t(n.title); walk(n); }
    }
  };
  walk(document.body);
};
