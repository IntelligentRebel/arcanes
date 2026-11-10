'use strict';
// Langues, à l'assemblage : chaque texte affiché du code (écrit en français) passe par __t('…') ou __tf('… {0} …', [valeurs]).
//   node tools/i18n_build.js <dossier de sortie> <fichier.js>...
// Écrit les fichiers transformés dans <dossier de sortie>/<même chemin> et le catalogue i18n/catalog.json :
// { "texte français": { "at": ["fichier:ligne", …], "args": ["expression du {0}", …], "hint": "…" } }.
// Le code source n'est pas touché : le banc et les tests (Node) jouent le français tel quel.
const fs = require('fs'), path = require('path');
const acorn = require('./vendor/acorn.js');
const ROOT = path.dirname(__dirname);

// mots français courants : un texte en minuscules sans accent n'est du texte que s'il en contient un
const FR = new Set(('de du des la le les un une et ou en à au aux pour par sur sous dans avec sans ne pas plus moins très son sa ses leur leurs votre vos vous nous notre nos il elle ils elles on qui que quoi quand où est sont été être a ont avoir fait faire peut doit '
  + 'tour tours cité cités sort sorts unité unités mana or nourriture puissance recherche armée armées héros sorcier sorciers ville villes case cases plan dégâts attaque défense mouvement vie mort nature chaos sorcellerie '
  + 'aucun aucune tout toute tous toutes rien encore déjà toujours jamais ici là ce cet cette ces se sa lui y vers depuis contre entre chez après avant si mais car donc puis alors comme même autre autres '
  + 'coupé coupée activé activée oui non choisir annuler fermer retour suivant précédent voir aller garder attendre passer partie jouer').split(' '));
// propriétés dont la valeur est une clé, jamais un texte affiché
const KEY_PROPS = new Set(['en', 'id', 'key', 'icon', 'sprite', 'img', 'type', 'kind', 'realm', 'race', 'color', 'cls', 'class', 'className', 'style', 'anim', 'sfx', 'sound', 'tag', 'cmd', 'k', 'ref', 'file', 'src', 'font', 'family', 'align', 'dir', 'side', 'action', 'mode', 'status', 'state', 'value', 'target', 'effect', 'fx', 'unit', 'spell', 'building', 'terrain', 'mineral', 'shape', 'pose', 'act', 'lineCap', 'lineJoin', 'textAlign', 'textBaseline', 'cursor', 'display', 'position', 'event', 'Accept']);
// zones où tout texte est affiché, même un mot seul en minuscules (fonctions, méthodes ou propriétés de ce nom)
const FORCE_NAMES = new Set(['PLAN_NAMES', 'GOV_WORDS', 'RARITY_WORDS', 'raceAdj', 'FAME_TIERS', 'levelWord', 'fameWord', 'chanceWord', 'moodWord', 'relWord', 'sizeWord', 'ODDS_WORDS', 'MONTHS', 'REALM_NAMES', 'SECTION_NAMES', 'ABILITY_NAMES', 'CHANNEL_NAMES', 'NUM', 'WEAPON_WORDS']);
const DISPLAY_PROPS = new Set(['name', 'label', 'title', 'text', 'desc', 'tip', 'msg', 'why', 'hint', 'note', 'sub', 'body', 'kicker', 'lore', 'story', 'epithet', 'quote', 'help', 'caption', 'short', 'long', 'verb', 'one', 'many', 'plural', 'singular', 'placeholder']);

// identifiants du jeu (types d'unités, sorts, bâtiments…) et noms anglais d'origine : des clés, même s'ils ressemblent à des mots
let KEYWORDS = new Set(), conjPlural = s => s;
function loadKeywords() {
  try {
    const vm = require('vm'), { loadEngine } = require(path.join(ROOT, 'tests', 'load.js'));
    const E = loadEngine(), D = vm.runInContext('DATA', E);
    // le pluriel français d'un verbe de journal (« attaque » -> « attaquent ») : Units.conj sur une troupe de plusieurs figurines
    const many = Object.keys(D.units).find(k => D.units[k].figures > 1 && !D.units[k].hero);
    conjPlural = s => { try { return E.Units.conj({ type: many }, s); } catch (e) { return s; } };
    for (const [k, v] of Object.entries(D)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      for (const [id, o] of Object.entries(v)) { KEYWORDS.add(id); if (o && typeof o === 'object') for (const p of Object.keys(o)) if (/En$|^en$/.test(p) && typeof o[p] === 'string') KEYWORDS.add(o[p]); }
    }
  } catch (e) { console.error('i18n : identifiants du jeu illisibles', e.message); }
}
// les classes de la feuille de style : « 'row ' + (sel ? 'sel' : '') » construit une classe, pas un texte
const CSS_CLASSES = new Set((fs.readFileSync(path.join(ROOT, 'src', 'ui', 'style.css'), 'utf8').match(/\.[a-zA-Z][\w-]*/g) || []).map(c => c.slice(1)));
// textes que les règles ci-dessous prennent pour des clés (minuscules, sans accent, un mot ou deux) : affichés, à coup sûr.
// Un mot qui sert AUSSI de clé ailleurs (« rare », « production », « impossible ») n'a pas sa place ici : le ranger dans une
// table nommée (FORCE_NAMES) ou l'écrire avec une majuscule. tools/i18n_audit.js liste ce qui reste hors traduction.
const EXTRA_TEXTS = new Set(['agitation -{0}', 'cible invisible', '+{0} tir', '+{0} PV', '+{0} mana', 'deux citoyens', 'trois citoyens', 'quatre citoyens', 'cinq citoyens',
  'grain revendu', 'jamais', 'personne', 'porte -', 'morte-vivante', 'rien',
  'stase', 'terreur', 'bris', 'riposte ≈ {0}{1}{2}', 'PV', ' PV']);
let forcing = 0;
function natural(s, ctx) {
  if (EXTRA_TEXTS.has(s)) return true;
  if (/^ ?(\{\d+\})? t$/.test(s)) return true;   // « 12 t » : tours, en abrégé
  // un morceau de balise ouverte (« <path d="M ») : du code, sauf une infobulle
  if (/<[a-z][\w-]*(\s[^>]*)?$/i.test(s) && !/\btitle="[^"]*[A-Za-zÀ-ÿ]{2}/.test(s)) return false;
  // un morceau d'attributs (« Z" fill=" ») sans infobulle : du code
  if (/[\w-]+="/.test(s) && !/</.test(s) && !/\btitle="[^"]*[A-Za-zÀ-ÿ]{2}/.test(s)) return false;
  if (forcing > 0 && /[A-Za-zÀ-ÿ]{2}/.test(s) && !/^[\w-]+:[\w:~.-]*$|^#[0-9a-f]{3,8}$/i.test(s) && !KEYWORDS.has(s)) ctx = Object.assign({}, ctx, { forced: true });
  if (KEYWORDS.has(s) && !(ctx && ctx.display)) return false;
  // les balises s'effacent, sauf le texte de leurs infobulles (title, alt…)
  const tip = tag => ' ' + (tag.match(/\b(?:title|alt|placeholder|aria-label)="[^"]*"/g) || []).map(m => m.replace(/^[^"]*"|"$/g, '')).join(' ') + ' ';
  const t = s.replace(/<[^>]*>/g, tip).replace(/\b(?:title|alt|placeholder)="([^"]*)"/g, ' $1 ').replace(/\s*[\w-]+="[^"]*"/g, ' ').replace(/\{\d+\}/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').trim();
  if (!/[A-Za-zÀ-ÿ]{2}/.test(t) && !(/\{\d+\}/.test(s) && /^(à|a|y)$/.test(t) && /[àÀ]/.test(t))) return false;   // « à {0} »
  // du texte entre deux balises, ou dans une infobulle : affiché à coup sûr
  if ((/<[a-z][^>]*>/i.test(s) || /\btitle="[^"]*[A-Za-zÀ-ÿ]{2}/.test(s)) && /[A-Za-zÀ-ÿ]{2}/.test(t) && !/^[\w-]+:[\w:~.-]*$/.test(t)) return !/^\s*[\w.-]+\.(png|jpe?g|svg)\s*$/.test(t);
  if (/^#[0-9a-f]{3,8}$/i.test(t) || /var\(--|^--[\w-]+:|\[[\w-]+|^(assets|lang|art|src|data|tools)\/|^\w*_\w*$/.test(t)) return false;
  if (!/[À-ÿ]/.test(t) && !/^\{\d+\} [a-zà-ÿ]/.test(s) && t.split(/\s+/).every(w => CSS_CLASSES.has(w))) return false;   // une liste de classes (« {0} mana » reste un texte)
  if (/\{\d+\}/.test(s) && /\s/.test(s) && t.split(/\s+/).some(w => w.length > 1 && FR.has(w.toLowerCase()))) return true;   // « {0} de {1} »
  if (!/\s/.test(s.trim()) && /^[a-z0-9_-]+$/.test(t) && !(ctx && ctx.forced)) return false;   // clé, identifiant, classe
  // identifiant construit : « lore_{0} », « {0}Mastery »
  if (/[A-Za-z_]\{\d+\}|\{\d+\}[A-Za-z_]/.test(s) && !/\s/.test(s.replace(/\{\d+\}/g, '')) && !/[À-ÿ]/.test(s)) return false;
  if (!/\s/.test(s) && /:/.test(s) && /^[\w{}:;%~.#()-]+$/.test(s)) return false;   // « {0}:trade:{1} », « width:{0}% »
  if (/^[a-z]{2}-[A-Z]{2}$/.test(s)) return false;   // fr-FR
  if (/^(https?:|data:|file:|mailto:)/.test(t) || /\.(png|jpe?g|js|json|css|ogg|mp3|woff2?)$/i.test(t)) return false;
  const words = t.split(/[^A-Za-zÀ-ÿœŒæÆ']+/).filter(Boolean);
  const fr = words.some(w => w.length > 1 && FR.has(w.toLowerCase()));
  const acc = /[àâäéèêëîïôöùûüçœæÀÂÉÈÊÎÔÛÇŒ«»…]/.test(t);
  // CSS, sélecteurs, clés
  if (/[{}]|\w;|^[#.][\w-]|\brgba?\(|\b\d+(px|em|rem|vh|vw)\b/.test(t) && !acc && !fr) return false;
  if (/^[\w-]+:[\w:~.-]*$/.test(t)) return false;                       // unit:X, arcanes:auto
  if (/^[A-Za-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(t)) return false;      // HighMenSpearmen, camelCase
  if (/^[A-Z0-9_]+$/.test(t)) return false;                              // CONSTANTE
  if (words.length === 1) {
    const w = words[0];
    if (ctx && ctx.forced) return true;
    if (acc) return true;
    if (/^[LDNSJMTCldnsjmtc]'[aeiouyhéèêàâîôûAEIOUYHÉ][a-zà-ÿ]{2,}$/.test(w)) return true;   // « L'annexer », « l'emporte » : une élision, donc du texte
    if (/^[a-z]/.test(w) && /\{\d+\} [a-zà-ÿ]{3,}|[a-zà-ÿ]{3,} \{\d+\}/.test(s)) return true;   // « {0} rebelle »
    if (/^[a-z]/.test(w)) return w.length >= 4 && /[·:+%0-9()\[\]«»?!…,.\/]/.test(s.replace(/<[^>]*>/g, '').replace(/\{\d+\}/g, ''));
    return /^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(w) || /^[A-ZÀ-Ý][a-zà-ÿ]+[ ,.!?…:]*$/.test(t);
  }
  if (/^[a-z0-9 _-]+$/.test(t) && !fr) return !!(ctx && (ctx.display || ctx.forced));   // liste de classes CSS
  return true;
}

function transform(src, file) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true });
  const edits = [], entries = [], cmp = [];
  const lines = []; { let p = 0; for (const l of src.split('\n')) { lines.push(p); p += l.length + 1; } }
  const line = pos => { let lo = 0, hi = lines.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lines[m] <= pos) lo = m; else hi = m - 1; } return lo + 1; };
  const J = s => JSON.stringify(s);
  const isStr = n => n && n.type === 'Literal' && typeof n.value === 'string';
  const isPlus = n => n && n.type === 'BinaryExpression' && n.operator === '+';
  const esc = s => s;   // les accolades du texte : rares, gardées telles quelles (aucun texte ne contient {chiffre})
  const add = (start, end, text, depth, kind) => edits.push({ start, end, text, depth, kind: kind || 'open' });
  const record = (tpl, node, args, hint) => entries.push({ s: tpl, at: file + ':' + line(node.start), args: args.map(a => src.slice(a.start, a.end).replace(/\s+/g, ' ').slice(0, 90)), hint });

  // parties d'une chaîne de « + » (associativité à gauche : ce qui précède le premier texte reste une seule valeur)
  function flat(n) {
    if (isPlus(n)) {
      const L = flat(n.left);
      if (L.stringy) return { stringy: true, parts: L.parts.concat(part(n.right)) };
      if (isStr(n.right) || n.right.type === 'TemplateLiteral') return { stringy: true, parts: [{ expr: n.left }].concat(part(n.right)) };
      return { stringy: false, parts: [{ expr: n }] };
    }
    if (isStr(n)) return { stringy: true, parts: [{ str: n.value, node: n }] };
    if (n.type === 'TemplateLiteral') return { stringy: true, parts: part(n) };
    return { stringy: false, parts: [{ expr: n }] };
  }
  function part(n) {
    if (isStr(n)) return [{ str: n.value, node: n }];
    if (n.type === 'TemplateLiteral') { const out = []; n.quasis.forEach((q, i) => { out.push({ str: q.value.cooked, node: q }); if (i < n.expressions.length) out.push({ expr: n.expressions[i], tpl: true }); }); return out; }
    return [{ expr: n }];
  }
  // un modèle « texte {0} texte » et ses valeurs
  function build(parts) {
    let tpl = '', args = [];
    for (const p of parts) { if (p.str != null) tpl += esc(p.str); else { tpl += '{' + args.length + '}'; args.push(p.expr); } }
    return { tpl, args };
  }
  // remplace le nœud n (chaîne, gabarit ou littéral) par __tf(modèle, [valeurs]) en gardant le code des valeurs en place
  function emitTF(n, tpl, args, depth) {
    if (!args.length) { add(n.start, n.end, '__t(' + J(tpl) + ')', depth); return; }
    add(n.start, args[0].start, '__tf(' + J(tpl) + ', [', depth, 'open');
    for (let i = 0; i < args.length - 1; i++) add(args[i].end, args[i + 1].start, ', ', depth, 'mid');
    add(args[args.length - 1].end, n.end, '])', depth, 'close');
  }
  const skipCall = c => {
    if (!c || c.type !== 'CallExpression' && c.type !== 'NewExpression') return false;
    const cal = c.callee;
    if (cal.type === 'MemberExpression' && cal.object.type === 'Identifier' && cal.object.name === 'console') return true;
    if (cal.type === 'Identifier' && /^(Error|RegExp|TypeError|RangeError|require|__t|__tf|__k)$/.test(cal.name)) return true;
    if (cal.type === 'MemberExpression' && cal.property && /^(getItem|setItem|removeItem|querySelector|querySelectorAll|getElementById|addEventListener|removeEventListener|createElement|setAttribute|getAttribute|toggle|contains|add|remove|play|hasHD|draw|drawFoot|get|has|getContext|toLocaleString)$/.test(cal.property.name)) return true;
    return false;
  };
  // une valeur glissée dans un texte affiché : affichée elle aussi (ses textes directs, ses alternatives), sauf dans une balise
  // (classe, style) ou collée à un mot (une terminaison française : « peu{1} », « tour{0} »)
  const argCtx = (tpl, i, a) => {
    if (!a || !/^(Literal|TemplateLiteral|ConditionalExpression|LogicalExpression|BinaryExpression)$/.test(a.type)) return null;
    if (a.type === 'BinaryExpression' && a.operator !== '+') return null;
    const at = tpl.indexOf('{' + i + '}'); if (at < 0) return null;
    const before = tpl.slice(0, at), after = tpl.slice(at + String(i).length + 2);
    if (before.lastIndexOf('<') > before.lastIndexOf('>')) return null;
    if (/[A-Za-zÀ-ÿ'’]$/.test(before) || /^[A-Za-zÀ-ÿ]/.test(after)) return null;
    return { display: true, forced: true };
  };
  const isPluralCall = c => c && c.type === 'CallExpression' && c.callee.type === 'MemberExpression' && c.callee.object.type === 'Identifier' && c.callee.object.name === 'U' && c.callee.property && (c.callee.property.name === 'n' || c.callee.property.name === 'plural');

  function visit(n, parent, key, depth, ctx) {
    if (!n || typeof n.type !== 'string') return;
    const nm = n.type === 'Property' || n.type === 'MethodDefinition' ? (n.key && (n.key.name || n.key.value)) : n.type === 'FunctionDeclaration' ? n.id && n.id.name : n.type === 'VariableDeclarator' ? n.id && n.id.name : null;
    if (nm && FORCE_NAMES.has(nm)) { forcing++; try { return visit2(n, parent, key, depth, ctx); } finally { forcing--; } }
    return visit2(n, parent, key, depth, ctx);
  }
  function visit2(n, parent, key, depth, ctx) {
    // contextes à ne jamais traduire
    if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration') return;
    if (n.type === 'ExpressionStatement' && n.directive) return;
    if (n.type === 'NewExpression' && n.callee.type === 'Identifier' && /^(Set|Map|WeakSet|WeakMap|RegExp|Error)$/.test(n.callee.name)) return;   // des clés
    if (skipCall(n)) { // l'appel lui-même reste ; ses arguments non (sauf ses sous-expressions qui ne sont pas des textes directs)
      visit(n.callee, n, 'callee', depth, null);
      for (const a of n.arguments) if (!isStr(a) && a.type !== 'TemplateLiteral' && !isPlus(a)) visit(a, n, 'arguments', depth, null);
      return;
    }
    // comparaisons : les deux côtés sont des clés (e.key === 'Escape') ; signalé pour relecture si c'est du texte
    if (n.type === 'BinaryExpression' && /^(===|!==|==|!=|in)$/.test(n.operator)) {
      // un texte de plusieurs mots comparé au libellé d'un bouton : traduit des deux côtés ; un mot seul est une clé
      for (const side of [n.left, n.right]) {
        if (isStr(side)) { if (natural(side.value, null)) { if (/\s/.test(side.value.trim())) { add(side.start, side.end, '__t(' + J(side.value) + ')', depth); record(side.value, side, []); } else cmp.push(file + ':' + line(side.start) + ' ' + J(side.value)); } }
        else visit(side, n, 'side', depth, null);
      }
      return;
    }
    // liste affichée : « a, b ou c » (le séparateur fait de lettres est du texte)
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property && n.callee.property.name === 'join' && n.arguments.length === 1 && isStr(n.arguments[0]) && /[a-zà-ÿ]{2}/i.test(n.arguments[0].value) && !/[<>="]/.test(n.arguments[0].value)) {
      visit(n.callee.object, n.callee, 'object', depth, null);
      add(n.arguments[0].start, n.arguments[0].end, '__t(' + J(n.arguments[0].value) + ')', depth); record(n.arguments[0].value, n.arguments[0], [], 'séparateur d\'une liste (« a, b ou c »)');
      return;
    }
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property && /^(includes|startsWith|endsWith|indexOf|lastIndexOf|split|join|localeCompare|test|match|search|matches|closest)$/.test(n.callee.property.name)) {
      if (n.callee.object.type !== 'ArrayExpression') visit(n.callee.object, n.callee, 'object', depth, null);
      for (const a of n.arguments) if (!isStr(a) && a.type !== 'ArrayExpression') visit(a, n, 'arguments', depth, null);
      return;
    }
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property && n.callee.property.name === 'replace' && n.arguments.length === 2 && isStr(n.arguments[0])) {
      visit(n.callee.object, n.callee, 'object', depth, null);
      // la virgule décimale française : le séparateur de la langue
      if (n.arguments[0].value === '.' && isStr(n.arguments[1]) && n.arguments[1].value === ',') { add(n.arguments[1].start, n.arguments[1].end, 'I18N.dec', depth); return; }
      visit(n.arguments[1], n, 'arguments', depth, null); return;
    }
    if (n.type === 'SwitchCase') { for (const c of n.consequent) visit(c, n, 'consequent', depth, null); return; }
    if (n.type === 'MemberExpression') { visit(n.object, n, 'object', depth, null); if (n.computed && !isStr(n.property)) visit(n.property, n, 'property', depth, null); return; }
    if (n.type === 'Property') {
      if (n.computed && !isStr(n.key)) visit(n.key, n, 'key', depth, null);
      const pk = n.key.type === 'Identifier' ? n.key.name : isStr(n.key) ? n.key.value : '';
      if (pk === 'en' || pk === 'id' || pk === 'key' || /En$|^en[A-Z]/.test(pk)) return;   // le nom anglais d'origine (MoM), les identifiants : jamais traduits
      // une clé : un seul mot sans accent (un texte de plusieurs mots ou accentué reste du texte)
      if (KEY_PROPS.has(pk) && isStr(n.value) && !/\s/.test(n.value.value.trim()) && !/[À-ÿ]/.test(n.value.value)) return;
      if (pk === 'name' && isStr(n.value) && /^[a-z][\w-]*$/.test(n.value.value)) return;
      if (/^(style|class|className|cls|icon|sprite|img|src|href|font)$/.test(pk)) return;   // du code (« width:{0}% », « item:{0}:1 »)   // name: 'walk' (une action, pas un nom)
      visit(n.value, n, 'value', depth, { display: DISPLAY_PROPS.has(pk) });
      return;
    }
    if (n.type === 'TaggedTemplateExpression') return;
    // U.n(k, 'tour') : singulier et pluriel, toujours du texte ; le pluriel par défaut (+ s) devient un texte à part
    if (isPluralCall(n)) {
      visit(n.callee, n, 'callee', depth, null);
      n.arguments.forEach((a, i) => visit(a, n, 'arguments', depth, i >= 1 ? { forced: true, display: true } : null));
      // pluriel donné : U.n(k, 'tour', 'tours'), U.plural(k, 'tour', 'tours')
      if (n.arguments.length === 3 && isStr(n.arguments[1]) && isStr(n.arguments[2])) record(n.arguments[2].value, n.arguments[2], [], 'pluriel de « ' + n.arguments[1].value + ' »');
      if (n.callee.property.name === 'n' && n.arguments.length === 2 && isStr(n.arguments[1])) {
        const pl = n.arguments[1].value + 's';
        add(n.arguments[1].end, n.arguments[1].end, ', __t(' + J(pl) + ')', depth + 1, 'close');
        record(pl, n, [], 'pluriel de « ' + n.arguments[1].value + ' »');
      }
      return;
    }
    // h('balise', {attributs}, enfants…) : les enfants textes sont affichés ; UI.toast(texte)
    if (n.type === 'CallExpression' && ((n.callee.type === 'Identifier' && n.callee.name === 'h') || (n.callee.type === 'MemberExpression' && n.callee.property && /^(toast|confirm|choice|alert|prompt|txt)$/.test(n.callee.property.name)))) {
      const first = n.callee.type === 'Identifier' ? 2 : 0;
      visit(n.callee, n, 'callee', depth, null);
      const last = n.callee.type === 'MemberExpression' && n.callee.property.name === 'toast' ? 0 : 99;
      n.arguments.forEach((a, i) => visit(a, n, 'arguments', depth, i >= first && i <= last ? { display: true, forced: !(isStr(a) && /^[a-z]+[-:][a-z]/.test(a.value)) } : null));
      return;
    }
    // x.subj(unité, 'verbe') : le verbe est toujours du texte ; son pluriel français aussi (la troupe de plusieurs figurines)
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property && n.callee.property.name === 'subj' && n.arguments.length >= 2) {
      visit(n.callee, n, 'callee', depth, null); visit(n.arguments[0], n, 'arguments', depth, null);
      const lits = []; const grab = a => { if (isStr(a)) lits.push(a); else if (a.type === 'ArrayExpression') a.elements.forEach(grab); else if (a.type === 'ConditionalExpression') { grab(a.consequent); grab(a.alternate); } else if (a.type === 'MemberExpression') grab(a.object); };
      grab(n.arguments[1]);
      visit(n.arguments[1], n, 'arguments', depth, { forced: true, display: true });
      for (const l of lits) { const pl = conjPlural(l.value); if (pl !== l.value) record(pl, l, [], 'pluriel de « ' + l.value + ' » (le sujet est une troupe de plusieurs figurines)'); }
      return;
    }
    // chaîne de « + » (sa racine seulement)
    if (isPlus(n) && !(isPlus(parent) && key === 'left')) {
      const F = flat(n);
      if (F.stringy && F.parts.some(p => p.str != null)) {
        const { tpl, args } = build(F.parts);
        if (natural(tpl, ctx)) {
          emitTF(n, tpl, args, depth);
          record(tpl, n, args);
          args.forEach((a, i) => visit(a, n, 'arg', depth + 1, argCtx(tpl, i, a)));
          return;
        }
        F.parts.forEach((p, j) => {
          if (p.expr) { visit(p.expr, n, 'arg', depth, null); return; }
          const prev = F.parts[j - 1];
          if (prev && prev.expr && /^[A-Za-z_]/.test(p.str)) return;   // « {0}Mastery »
          if (p.node && p.node.type === 'Literal' && natural(p.str, ctx)) { add(p.node.start, p.node.end, '__t(' + J(p.str) + ')', depth); record(p.str, p.node, []); }
        });
        return;
      }
    }
    if (n.type === 'TemplateLiteral' && !(parent && parent.type === 'TaggedTemplateExpression')) {
      const { tpl, args } = build(part(n));
      if (natural(tpl, ctx)) { emitTF(n, tpl, args, depth); record(tpl, n, args); args.forEach((a, i) => visit(a, n, 'arg', depth + 1, argCtx(tpl, i, a))); return; }
      for (const e of n.expressions) visit(e, n, 'arg', depth, null);
      return;
    }
    if (isStr(n)) {
      if (natural(n.value, ctx)) { add(n.start, n.end, '__t(' + J(n.value) + ')', depth); record(n.value, n, []); }
      return;
    }
    // une chaîne de « a ? x : b ? y : z » dont une issue est un texte : les autres issues écrites en toutes lettres le sont aussi
    // (« favorable », « incertaine » à côté de « écrasante »)
    if (n.type === 'ConditionalExpression' && !(ctx && ctx.forced)) {
      const br = []; (function fl(c) { if (c.type === 'ConditionalExpression') { fl(c.consequent); fl(c.alternate); } else br.push(c); })(n);
      const text = b => isStr(b) ? natural(b.value, ctx) : isPlus(b) ? (F => F.stringy && natural(build(F.parts).tpl, ctx))(flat(b)) : false;
      if (br.some(text) && br.some(b => isStr(b) && /[A-Za-zÀ-ÿ]{3}/.test(b.value) && !natural(b.value, ctx) && !KEYWORDS.has(b.value))) ctx = Object.assign({}, ctx, { display: true, forced: true });
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const c of v) visit(c, n, k, depth, (n.type === 'ArrayExpression' && ctx) ? ctx : null); }
      else if (v && typeof v.type === 'string') visit(v, n, k, depth, (n.type === 'ConditionalExpression' || n.type === 'LogicalExpression' || isPlus(n)) && k !== 'test' ? ctx : null);
    }
  }
  visit(ast, null, null, 0, null);
  // application : intervalles disjoints ; à position égale, l'extérieur avant l'intérieur
  // à position égale : les fermetures (la plus profonde d'abord), puis les séparateurs, puis les ouvertures (la moins profonde d'abord)
  const rank = e => e.kind === 'close' ? -1000 - e.depth : e.kind === 'mid' ? e.depth : 1000 + e.depth;
  edits.sort((a, b) => a.start - b.start || rank(a) - rank(b));
  let out = '', pos = 0;
  for (const e of edits) {
    if (e.start < pos) throw new Error(file + ':' + line(e.start) + ' : modifications qui se chevauchent');
    out += src.slice(pos, e.start) + e.text; pos = e.end;
  }
  out += src.slice(pos);
  return { code: out, entries, cmp };
}

function main() {
  const [outDir, ...files] = process.argv.slice(2);
  loadKeywords();
  const catalog = {}, comparisons = [];
  let n = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const { code, entries, cmp } = transform(src, f);
    comparisons.push(...cmp);
    // vérification : le code produit doit rester valide
    acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
    const dst = path.join(outDir, f); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, code);
    for (const e of entries) {
      const c = catalog[e.s] || (catalog[e.s] = { at: [] });
      if (c.at.length < 4) c.at.push(e.at);
      if (e.args.length && !c.args) c.args = e.args;
      if (e.hint) c.hint = e.hint;
      n++;
    }
  }
  // textes de la page (index.html) : ses nœuds de texte et ses infobulles
  const page = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  for (const m of page.matchAll(/>([^<>]+)</g)) { const v = m[1].trim(); if (/[A-Za-zÀ-ÿ]{2}/.test(v) && !catalog[v]) catalog[v] = { at: ['src/ui/index.html'] }; }
  for (const m of page.matchAll(/\btitle="([^"]+)"/g)) if (!catalog[m[1]]) catalog[m[1]] = { at: ['src/ui/index.html'] };
  // clés posées à la main (i18n/manual.json) : { "@clé": { "fr": "modèle français", "hint": "…" } }
  const manual = path.join(ROOT, 'i18n', 'manual.json');
  if (fs.existsSync(manual)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(manual, 'utf8')))) catalog[k] = { at: ['i18n/manual.json'], fr: v.fr, hint: v.hint };
  fs.mkdirSync(path.join(ROOT, 'i18n'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'i18n', 'catalog.json'), JSON.stringify(catalog, null, 1));
  fs.writeFileSync(path.join(outDir, 'comparaisons.txt'), comparisons.join('\n'));
  console.log('i18n :', n, 'textes,', Object.keys(catalog).length, 'distincts,', Object.keys(catalog).reduce((a, s) => a + s.length, 0), 'caractères');
}
if (require.main === module) main();
module.exports = { transform, natural };
