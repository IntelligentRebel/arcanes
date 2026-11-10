// Contrôle des langues : textes restés hors traduction à côté de textes traduits (issues d'un même « ? : », cases d'un même tableau).
// node tools/i18n_audit.js build/i18n   (après tools/build.py). Les lignes TERN sont des oublis ; ARR et LOG mêlent souvent clés et libellés.
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname);
const acorn = require(ROOT + '/tools/vendor/acorn.js');
const dir = process.argv[2];
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } })(dir);
const isT = n => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && /^(__t|__tf)$/.test(n.callee.name);
const isS = n => n && n.type === 'Literal' && typeof n.value === 'string' && /[A-Za-zÀ-ÿ]{3}/.test(n.value);
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  (function visit(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'ConditionalExpression') {
      // aplatit la chaîne de ternaires
      const br = []; (function fl(c) { if (c.type === 'ConditionalExpression') { fl(c.consequent); fl(c.alternate); } else br.push(c); })(n);
      if (br.some(isT) && br.some(isS)) console.log('TERN ' + path.relative(dir, f) + ':' + n.loc.start.line + ' ' + br.filter(isS).map(b => JSON.stringify(b.value)).join(' ') + '  || ' + br.filter(isT).map(b => JSON.stringify(b.arguments[0].value).slice(0, 30)).join(' '));
      br.forEach(visit); (function tests(c) { if (c.type === 'ConditionalExpression') { visit(c.test); tests(c.consequent); tests(c.alternate); } })(n);
      return;
    }
    if (n.type === 'ArrayExpression' && n.elements.some(isT) && n.elements.some(isS)) console.log('ARR  ' + path.relative(dir, f) + ':' + n.loc.start.line + ' ' + n.elements.filter(isS).map(b => JSON.stringify(b.value)).join(' ') + '  || ' + n.elements.filter(isT).slice(0, 4).map(b => JSON.stringify(b.arguments[0].value).slice(0, 25)).join(' '));
    if (n.type === 'LogicalExpression' && ((isT(n.left) && isS(n.right)) || (isS(n.left) && isT(n.right)))) console.log('LOG  ' + path.relative(dir, f) + ':' + n.loc.start.line + ' ' + JSON.stringify((isS(n.left) ? n.left : n.right).value));
    for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); }
  })(ast);
}
