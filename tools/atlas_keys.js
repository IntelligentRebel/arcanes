// Contrôle : toutes les clés d'images que le code peut demander ont-elles une planche HD ?
// Les clés littérales du code et des données, plus celles construites par préfixe (unit:<type>, bld:<id>, spell:<id>...).
// node tools/atlas_keys.js   → liste ce qui ne tiendrait que sur l'atlas de dépannage.
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const J = p => JSON.parse(read(p));
const hd = new Set([...Object.keys(J('assets/hd.json')), ...Object.keys(J('assets/hd2.json'))]);
const atlas = new Set(Object.keys(J('assets/atlas.json')));
const files = [];
(function walk(d) { for (const f of fs.readdirSync(path.join(ROOT, d))) { const p = d + '/' + f; if (f.endsWith('.orig')) continue; if (fs.statSync(path.join(ROOT, p)).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } })('src');
for (const f of fs.readdirSync(path.join(ROOT, 'data'))) if (f.endsWith('.js')) files.push('data/' + f);
const src = files.map(read).join('\n');
const want = new Set(); const want0 = [];
// 1. clés écrites en toutes lettres
for (const m of src.matchAll(/['"`]((?:unit|bld|spell|item|feat|tree|ter|tex|city|cwall|chouse|site|node|mountain|hill|volcano|portrait|staff|wizard|cache|outcrop|detail|edge|min|decal|ov)(?::[\w.~-]+)+)['"`]/g)) want.add(m[1]);
// 2. clés construites : préfixe + identifiant connu
const { loadEngine } = require(path.join(ROOT, 'tests/load'));
const DATA = loadEngine().DATA;
const D = { unit: Object.keys(DATA.units), bld: Object.keys(DATA.buildings), spell: Object.keys(DATA.spells) };
// les icônes que les données imposent (objets trouvés, bâtiments sans illustration)
for (const k in DATA.items || {}) if (DATA.items[k].icon) want0.push(DATA.items[k].icon);
for (const p in D) for (const id of D[p]) want.add(p + ':' + id);
for (const k of want0) want.add(k);
// les icônes fabriquées au vol : une invocation prend l'image de sa créature (Sprites.buildVirtual), un sort sans image celle
// de son modèle (params.icon), et un bâtiment son illustration bld:<id> quand elle existe (bldIcon)
const virt = new Set();
for (const id in DATA.spells) {
  const sp = DATA.spells[id], pa = sp.params || {};
  if (pa.icon && !hd.has('spell:' + id)) { virt.add('spell:' + id); continue; }
  const u = pa.unit || pa.type;
  if (sp.kind === 'summon' && u && hd.has('unit:' + u)) virt.add('spell:' + id);
}
for (const id in DATA.buildings) if (hd.has('bld:' + id)) virt.add('bld:' + id);
// les deux bâtiments sans illustration empruntent celle de l'ouvrage qu'ils figurent (BLD_BORROWED, src/ui/city.js)
for (const m of read('src/ui/city.js').matchAll(/BLD_BORROWED = \{([^}]*)\}/g)) for (const b of m[1].matchAll(/(\w+):\s*'([^']+)'/g)) { virt.add('bld:' + b[1]); want.add(b[2]); }
const BLD_FALLBACK = new Set(Object.keys(DATA.buildings).filter(id => hd.has('bld:' + id)));
const miss = [...want].filter(k => !virt.has(k)).filter(k => !hd.has(k) && !hd.has(k.replace(/:\d+$/, '')));
const onlyAtlas = miss.filter(k => atlas.has(k));
console.log('clés examinées :', want.size, '| sans HD :', miss.length, '| dont servies par l\'atlas :', onlyAtlas.length);
for (const k of onlyAtlas.sort()) console.log('  atlas :', k);
for (const k of miss.filter(k => !atlas.has(k)).sort().slice(0, 40)) console.log('  nulle part :', k);
