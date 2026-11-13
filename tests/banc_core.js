'use strict';
// Banc de test : la liste des parties d'un plan et le rapport, partagés par tests/nuit.js (Node) et le banc dans le navigateur.

// une variante : « niveau{"exp"}@adversaires », ou un objet { nom, niveau, exp, signes } (plans d'entraînement)
function bancVariant(l) {
  if (typeof l === 'object') return { level: l.niveau, exp: l.exp || {}, opp: l.adversaires || null, oppexp: l.expAdversaires || null, noRite: !!l.sansRituel, rite: l.rituel || null, bookGuard: l.gardiens || null, label: l.nom, finale: l.crise || null, finaleCfg: l.reglagesCrise || null, signs: l.signes || null, otherPlane: l.autrePlan != null ? l.autrePlan : null, noWonders: !!l.sansOuvrages, flatOverstretch: !!l.malusFixes, propOverstretch: !!l.malusProportionnels };
  const m = l.match(/^(\w+)(\{.*\})?(@(\w+))?$/);
  if (!m) throw new Error('variante illisible : ' + l);
  return { level: m[1], exp: m[2] ? JSON.parse(m[2]) : {}, opp: m[4] || null, label: l };
}

// les parties à jouer, entrelacées pour qu'à tout moment chaque expérience ait avancé au même rythme
function bancJobs(plan) {
  const jobs = [];
  for (const ex of plan.experiences) {
    const vs = ex.variantes.map(bancVariant);
    for (let s = 0; s < ex.graines; s++) for (const v of vs) {
      const seed = ex.graine + s;
      jobs.push({ key: ex.id + '|' + v.label + '|' + seed, exp_id: ex.id, seed, level: v.level, exp: v.exp, label: v.label, opp: v.opp || ex.adversaires, subjexp: true,
        turns: ex.tours, checkpoints: bancPoints(ex), bossPoints: !!ex.boss, benchHuman: ex.joueurHumain !== false, otherPlane: v.otherPlane, order: (s + 0.5) / ex.graines, oppmix: ex.melange || null, oppexp: v.oppexp || ex.expAdversaires || null, noRite: v.noRite || null, rite: v.rite || null, noWonders: v.noWonders || null, flatOverstretch: v.flatOverstretch || null, propOverstretch: v.propOverstretch || null, race: ex.races ? ex.races[s % ex.races.length] : null, boost: !!ex.avance, bookGuard: v.bookGuard || null, bookGift: ex.cadeauLivre || null, finale: v.finale || null, finaleCfg: v.finaleCfg || null });
    }
  }
  return jobs.sort((a, b) => a.order - b.order);
}
function bancPoints(ex) { return (ex.points || [100, 150, 200]).filter(t => t < ex.tours); }

function bancMean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function bancPaired(rs, base, k) {
  const by = new Map(base.filter(r => r[k] != null).map(r => [r.seed, r[k]]));
  const d = rs.filter(r => r[k] != null && by.has(r.seed)).map(r => r[k] - by.get(r.seed));
  if (d.length < 2) return null;
  const m = bancMean(d), sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1));
  return { m, se: sd / Math.sqrt(d.length), n: d.length, wins: d.filter(x => x > 0).length, losses: d.filter(x => x < 0).length };
}

// plan factoriel : l'effet de chaque réglage (moyenne des variantes où il est haut moins celles où il est bas, carte par carte)
function bancEffects(ex, rs, cps) {
  const vs = ex.variantes.map(bancVariant).filter(v => v.signs), n = vs.length;
  const sig = new Map(vs.map(v => [v.label, v.signs]));
  const bySeed = new Map();
  for (const r of rs) if (sig.has(r.label)) { if (!bySeed.has(r.seed)) bySeed.set(r.seed, []); bySeed.get(r.seed).push(r); }
  const full = [...bySeed.values()].filter(a => a.length === n);
  const L = ['', '  Effet de chaque réglage (haut moins bas, sur ' + full.length + ' cartes jouées par les ' + n + ' variantes ; empire = score sans l\'armée ; rang : négatif = mieux classé) :'];
  if (full.length < 3) { L.push('  (pas encore assez de cartes complètes)'); return L; }
  const keys = ['score'].concat(cps.map(c => 'score' + c), full[0].some(r => r.empire != null) ? ['empire'] : [], ['rank']);
  const rows = ex.facteurs.map((f, i) => {
    const o = { f };
    for (const k of keys) {
      const d = full.map(a => { let hi = 0, lo = 0, nh = 0, nl = 0; for (const r of a) { const s = sig.get(r.label)[i], v = +r[k] || 0; if (s > 0) { hi += v; nh++; } else { lo += v; nl++; } } return hi / nh - lo / nl; });
      const m = bancMean(d), sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1));
      o[k] = { m, se: sd / Math.sqrt(d.length) };
    }
    return o;
  }).sort((a, b) => Math.abs(b.score.m / b.score.se) - Math.abs(a.score.m / a.score.se));
  const sgn = x => (x >= 0 ? '+' : '') + Math.round(x);
  for (const o of rows) {
    const t = o.score.m / o.score.se;
    let line = '    ' + o.f.nom.padEnd(14) + (o.f.bas + ' → ' + o.f.haut).padEnd(13) + ' final ' + (sgn(o.score.m) + ' ± ' + Math.round(o.score.se)).padEnd(10);
    for (const c of cps) line += '  t' + c + ' ' + (sgn(o['score' + c].m) + ' ± ' + Math.round(o['score' + c].se)).padEnd(10);
    if (o.empire) line += '  empire ' + (sgn(o.empire.m) + ' ± ' + Math.round(o.empire.se)).padEnd(10);
    line += '  rang ' + (o.rank.m >= 0 ? '+' : '') + o.rank.m.toFixed(2) + ' ± ' + o.rank.se.toFixed(2);
    L.push(line + (Math.abs(t) >= 2.5 ? '  ← ' + (t > 0 ? 'monter' : 'baisser') : ''));
  }
  return L;
}

// chaque variante comparée à la première de son expérience, carte par carte
function bancReport(plan, all, total, errCount) {
  const sgn = x => (x >= 0 ? '+' : '') + Math.round(x);
  const L = ['Arcanes, banc de test : ' + (plan.nom || '') + '  (' + new Date().toLocaleString('fr-FR') + ')', all.length + ' parties jouées sur ' + total, ''];
  for (const ex of plan.experiences) {
    const rs = all.filter(r => r.exp_id === ex.id); if (!rs.length) continue;
    L.push('== ' + ex.id + ' : ' + ex.tours + ' tours contre 3 IA ' + (ex.melange || ex.adversaires) + (ex.note ? '  (' + ex.note + ')' : ''));
    const labs = ex.variantes.map(v => bancVariant(v).label), lab0 = labs[0];
    const base = rs.filter(r => r.label === lab0), cps = bancPoints(ex);
    for (const lab of labs) {
      const a = rs.filter(r => r.label === lab); if (!a.length) continue;
      const m = k => bancMean(a.map(r => +r[k] || 0));
      let line = '  ' + lab.padEnd(44) + String(a.length).padStart(5) + ' parties  score ' + m('score').toFixed(0).padStart(5) + (a.some(r => r.empire != null) ? '  empire ' + m('empire').toFixed(0).padStart(4) : '') + '  rang ' + m('rank').toFixed(2) + '  survie ' + Math.round(100 * m('alive')) + '%  cités ' + m('cities').toFixed(1) + '  prises ' + m('caps').toFixed(1) + '  pertes ' + m('lost').toFixed(1);
      for (const c of cps) line += '  t' + c + ' ' + m('score' + c).toFixed(0) + ' (rang ' + m('rank' + c).toFixed(2) + ')';
      const rd = a.filter(r => r.raid); if (rd.length) line += '  raids/partie ' + (rd.reduce((s, r) => s + r.raid.hunts, 0) / a.length).toFixed(1) + ' dont réussis ' + (rd.reduce((s, r) => s + r.raid.wins, 0) / a.length).toFixed(1) + ' (colons ' + (rd.reduce((s, r) => s + r.raid.civ, 0) / a.length).toFixed(2) + ')';
      if (a.some(r => r.tailored)) line += '  troupes taillées/partie ' + m('tailored').toFixed(1);
      if (ex.corruption && a.some(r => r.corrupt != null)) line += '  terres corrompues autour de ses cités à la fin ' + m('corrupt').toFixed(1) + ' (parties touchées ' + Math.round(100 * bancMean(a.map(r => r.corrupt > 0 ? 1 : 0))) + ' %)';
      if (a.some(r => r.rite)) { const rm = k => bancMean(a.map(r => (r.rite && r.rite[k]) || 0)).toFixed(2); line += '  rituels ' + rm('rituals') + ', démons ' + rm('demons') + ' (abattus ' + rm('slain') + ')';
        // (v0.31.23) par démon : son escorte la plus forte, les cités prises, les tours qu'il a tenus
        const dn = a.reduce((s, r) => s + ((r.rite && r.rite.demons) || 0), 0), per = k => dn ? (a.reduce((s, r) => s + ((r.rite && r.rite[k]) || 0), 0) / dn).toFixed(1) : '-';
        if (a.some(r => r.rite && r.rite.life != null)) line += ' ; par démon : escorte ' + per('escorts') + ', cités prises ' + per('demonCaps') + ', tours ' + per('life'); }
      const bk = a.filter(r => r.book); if (bk.length && ex.livre) { const bm = f => bancMean(bk.map(f)); line += '  Livre : fragments trouvés ' + bm(r => r.book.found).toFixed(1) + '/5, sceau brisé ' + Math.round(100 * bm(r => r.book.revealed ? 1 : 0)) + ' %, pris ' + Math.round(100 * bm(r => r.book.claimed ? 1 : 0)) + ' % (par le sujet ' + Math.round(100 * bm(r => r.book.by === 0 ? 1 : 0)) + ' %), artefacts ' + bm(r => r.book.artifacts).toFixed(2)
        + (ex.cadeauLivre ? ' ; sujet : sceau brisé ' + Math.round(100 * bm(r => r.book.revBy === 0 ? 1 : 0)) + ' %, Livre pris ' + Math.round(100 * bm(r => r.book.by === 0 ? 1 : 0)) + ' %' + (bk.some(r => r.book.by === 0) ? ', en ' + Math.round(bancMean(bk.filter(r => r.book.by === 0).map(r => r.book.claimed - (r.book.gift || 0)))) + ' tours après le don' : '') : ''); }
      if (ex.id === 'palais') { const g = a.filter(r => r.governor != null).map(r => r.governor).sort((x, y) => x - y); line += '  palais bâti dans ' + Math.round(100 * g.length / a.length) + ' %' + (g.length ? ' (tour médian ' + g[g.length >> 1] + ')' : ''); }
      if (ex.id === 'cols') { const c = a.filter(r => r.pass); line += '  cols repérés dans ' + Math.round(100 * c.length / a.length) + ' % (' + bancMean(a.map(r => r.passRoad || 0)).toFixed(1) + ' chantiers en montagne par partie)'; }
      if (ex.agitation && a.some(r => r.rebels != null)) line += '  rebelles ' + (100 * m('rebels')).toFixed(1) + ' % des citoyens (sujet ' + (100 * m('rebels0')).toFixed(1) + ' %), plus grand empire ' + m('maxCities').toFixed(1) + ' cités';
      // (v0.31.30) la crise de fin : dans quelle part des parties, au bout de combien de tours, finie ou non, et le sujet visé
      { const fn = a.filter(r => r.finale && r.finale.start); if (fn.length) { const over = fn.filter(r => r.finale.state === 'over'), md = l => { const b = l.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : '-'; };
        const won = over.filter(r => r.finale.by != null);
        line += '  crise de fin dans ' + Math.round(100 * fn.length / a.length) + ' % (tour médian ' + md(fn.map(r => r.finale.start)) + ', vaincue ' + Math.round(100 * won.length / fn.length) + ' %' + (won.length ? ' en ' + md(won.map(r => r.finale.end - r.finale.start)) + ' tours' : '') + (over.length > won.length ? ', éteinte (cible éliminée) ' + Math.round(100 * (over.length - won.length) / fn.length) + ' %' : '') + ', contre le sujet ' + Math.round(100 * bancMean(fn.map(r => r.finale.subj ? 1 : 0))) + ' %'
          + (fn.some(r => r.finale.tFirst != null) ? ', cible encore 1re à la fin ' + Math.round(100 * bancMean(fn.map(r => r.finale.tFirst || 0))) + ' %' : '')
          + (ex.crise && lab !== lab0 ? (() => { const bs = new Map(base.map(r => [r.seed, r])), pr = fn.filter(r => r.lead200Kept != null && bs.has(r.seed) && bs.get(r.seed).lead200Kept != null);
              return pr.length ? ', meneur du t200 encore 1er ' + Math.round(100 * bancMean(pr.map(r => r.lead200Kept))) + ' % (' + lab0 + ', mêmes cartes : ' + Math.round(100 * bancMean(pr.map(r => bs.get(r.seed).lead200Kept))) + ' %)' : ''; })() : '')
          + (fn.some(r => r.finale.tier) ? ', paliers 1/2/3 : ' + [1, 2, 3].map(t => Math.round(100 * bancMean(fn.map(r => r.finale.tier === t ? 1 : 0))) + ' %').join(' / ') : '')
          + (fn.some(r => r.finale.might) ? ', cran médian du monstre ' + md(fn.filter(r => r.finale.might).map(r => r.finale.might)) : '')
          + ', ' + ['prophet', 'eater', 'winter', 'lich', 'archmage'].map(k => k + ' ' + fn.filter(r => r.finale.kind === k).length).join(' ')
          + (fn.some(r => r.finale.eaten) ? ', nœuds dévorés ' + bancMean(fn.map(r => r.finale.eaten || 0)).toFixed(1) : '') + (fn.some(r => r.finale.seceded) ? ', sécessions ' + bancMean(fn.map(r => r.finale.seceded || 0)).toFixed(1) : '') + ')'; } }
      // (v0.31.32) le meneur du tour 200 : l'est-il encore à la fin, et de combien mène-t-il (parties où il menait de 1,5 fois et plus au tour 200)
      if (ex.crise) { const lk = a.filter(r => r.lead200Kept != null), big = lk.filter(r => r.gap200 >= 1.5);
        const med = l => { const s = l.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
        if (lk.length) line += '  meneur du t200 encore 1er : ' + Math.round(100 * bancMean(lk.map(r => r.lead200Kept))) + ' % (avance médiane ×' + med(lk.map(r => r.gap200)).toFixed(2) + ' au t200, ×' + med(lk.map(r => r.gapEnd)).toFixed(2) + ' à la fin)'
          + (big.length ? ' ; s\'il menait de ×1,5 au t200 (' + big.length + ' parties) : encore 1er ' + Math.round(100 * bancMean(big.map(r => r.lead200Kept))) + ' %, avance finale médiane ×' + med(big.map(r => r.gapEnd)).toFixed(2) : ''); }
      const lk = a.filter(r => r.lead100Kept != null); if (lk.length && ex.meneur) line += '  meneur du t100 encore 1er : ' + Math.round(100 * bancMean(lk.map(r => r.lead100Kept ? 1 : 0))) + ' %, avance finale ×' + bancMean(lk.map(r => r.gapEnd)).toFixed(2);
      if (ex.croisade) line += '  croisade : failles ouvertes par sort ' + m('riftsCast').toFixed(2) + ' par partie, cités prises d\'un plan à l\'autre ' + m('xcaps').toFixed(2) + ' (au meneur du moment ' + m('xcapsL').toFixed(2) + ')';
      L.push(line);
      if (lab !== lab0) {
        const name = k => k === 'score' ? 'final' : k === 'rank' ? 'rang final' : k === 'lead200Kept' ? 'meneur du t200 encore 1er' : k === 'lead100Kept' ? 'meneur du t100 encore 1er' : k === 'gapEndLn' ? 'avance finale du 1er (log)' : 't' + k.slice(5);
        const fine = k => k === 'rank' || k === 'lead200Kept' || k === 'lead100Kept' || k === 'gapEndLn';
        let d = '      écart à ' + lab0 + ' (même carte) :';
        for (const k of ['score'].concat(cps.map(c => 'score' + c), ['rank'], ex.crise ? ['lead200Kept', 'gapEndLn'] : [], ex.meneur ? ['lead100Kept'] : [])) {
          const p = bancPaired(a, base, k); if (!p) continue;
          d += '  ' + name(k) + ' ' + (fine(k) ? (p.m >= 0 ? '+' : '') + p.m.toFixed(2) + ' ± ' + p.se.toFixed(2) : sgn(p.m) + ' ± ' + Math.round(p.se)) + (k === 'score' ? ' (mieux ' + p.wins + ', pire ' + p.losses + ' sur ' + p.n + ')' : '');
        }
        L.push(d);
      }
    }
    if (ex.facteurs) L.push(...bancEffects(ex, rs, cps));
    // ouvrages de race : par peuple du sorcier observé, l'écart à la référence (même carte), et quand il a bâti le sien
    if (ex.races) {
      const medT = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
      for (const lab of labs) {
        const a = rs.filter(r => r.label === lab && r.wonder); if (!a.length) continue;
        const built = a.filter(r => r.wonder.built != null), lore = a.filter(r => r.wonder.lore != null);
        const tm = xs => xs.length ? ' (tour médian ' + medT(xs) + ')' : '';
        L.push('  ouvrages (' + lab + ') : ' + bancMean(a.map(r => r.wonder.all)).toFixed(1) + ' bâtis par partie, tous sorciers ; le sujet achève la recherche dans ' + Math.round(100 * lore.length / a.length) + ' % des parties' + tm(lore.map(r => r.wonder.lore)) + ', bâtit le sien dans ' + Math.round(100 * built.length / a.length) + ' %' + tm(built.map(r => r.wonder.built)));
      }
      if (labs.length > 1) for (const lab of labs.slice(1)) {
        L.push('  par peuple du sujet, ' + lab + ' moins ' + lab0 + ' (même carte, score final) :');
        for (const race of ex.races) {
          const a = rs.filter(r => r.label === lab && r.race === race), b = base.filter(r => r.race === race), p = bancPaired(a, b, 'score');
          if (p) L.push('    ' + race.padEnd(10) + ' ' + sgn(p.m) + ' ± ' + Math.round(p.se) + '  (mieux ' + p.wins + ', pire ' + p.losses + ' sur ' + p.n + ')');
        }
      }
    }
    // le plan d'en face (variante de référence) : le « boss final » s'y est-il imposé ?
    // au fil des tours (expériences « boss ») : la même mesure à chaque point de passage
    // (chaque variante, et l'écart à la référence carte par carte sur la part du plus fort)
    if (ex.boss) for (const v of ex.variantes.map(bancVariant)) {
      const bt = rs.filter(r => r.label === v.label && r.bossAt); if (!bt.length) continue;
      const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
      const one = (t, xs) => { const bm = f => bancMean(xs.map(f)), am = med(xs.map(b => b.armyVsNear)), ao = med(xs.map(b => b.armyVsObs));
        return 't' + t + ' : ' + Math.round(100 * bm(b => b.share)) + ' % des cités (≥ 60 % dans ' + Math.round(100 * bm(b => b.share >= 0.6 ? 1 : 0)) + ' % des parties, ≥ 75 % dans ' + Math.round(100 * bm(b => b.share >= 0.75 ? 1 : 0)) + ' %), neutres ' + bm(b => b.neutral).toFixed(1) + ', 1er au score ' + Math.round(100 * bm(b => b.first ? 1 : 0)) + ' %'
          + (am != null ? ', armée ×' + am.toFixed(1) + ' la plus forte IA du plan observé, ×' + ao.toFixed(1) + ' le sorcier observé (médianes)' : '') + (xs.some(b => b.over) ? ', cités prises sur le plan observé ' + bm(b => b.over || 0).toFixed(1) : ''); };
      L.push('  plan d\'en face (' + v.label + ') :');
      for (const t of Object.keys(bt[0].bossAt)) L.push('    ' + one(t, bt.filter(r => r.bossAt[t]).map(r => r.bossAt[t])));
      L.push('    ' + one(ex.tours, bt.map(r => r.boss)));
      { const bb = bt.map(r => r.boss), st = bb.filter(b => b.somStudy), ca = bb.filter(b => b.somCast), pc = x => Math.round(100 * x / bb.length);
        L.push('    Sort de Maîtrise : étudié par lui dans ' + pc(st.length) + ' % des parties' + (st.length ? ' (tour médian ' + med(st.map(b => b.somStudy)) + ')' : '') + ', lancé dans ' + pc(ca.length) + ' %' + (ca.length ? ' (tour médian ' + med(ca.map(b => b.somCast)) + ')' : '')
          + ' ; il gagne la partie dans ' + pc(bb.filter(b => b.won).length) + ' % (par la Maîtrise ' + pc(bt.filter(r => r.boss.won && r.overWhy === 'mastery').length) + ' %) ; quelqu\'un gagne avant la fin dans ' + pc(bt.filter(r => r.winner != null).length) + ' %'); }
      if (v.label !== lab0) { const by = new Map(base.filter(r => r.boss).map(r => [r.seed, r.boss.share])); const d = bt.filter(r => by.has(r.seed)).map(r => r.boss.share - by.get(r.seed));
        if (d.length > 1) { const m = bancMean(d), sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1)); L.push('    part du plus fort à la fin, écart à ' + lab0 + ' (même carte) : ' + (m >= 0 ? '+' : '') + Math.round(100 * m) + ' ± ' + Math.round(100 * sd / Math.sqrt(d.length)) + ' points'); } }
    }
    const bs = base.filter(r => r.boss); if (bs.length) { const bm = f => bancMean(bs.map(f)), vs = bs.filter(r => r.boss.vsObs != null);
      L.push('  plan d\'en face à la fin (' + lab0 + ') : le plus fort y tient ' + Math.round(100 * bm(r => r.boss.share)) + ' % des cités (' + bm(r => r.boss.top).toFixed(1) + ' sur ' + bm(r => r.boss.cities).toFixed(1) + ', ' + bm(r => r.boss.neutral).toFixed(1) + ' neutres restantes), au moins 60 % dans ' + Math.round(100 * bm(r => r.boss.share >= 0.6 ? 1 : 0)) + ' % des parties ; 1er au score dans ' + Math.round(100 * bm(r => r.boss.first ? 1 : 0)) + ' % ; score ×' + (vs.length ? bancMean(vs.map(r => r.boss.vsObs)).toFixed(2) : '?') + ' celui du sorcier observé'); }
    const secs = rs.map(r => r.secs || 0);
    L.push('  (durée moyenne d\'une partie : ' + Math.round(bancMean(secs)) + ' s par cœur)', '');
  }
  L.push('± = erreur type. Un écart vaut quelque chose au-delà de deux erreurs types environ.');
  if (errCount) L.push(errCount + ' partie(s) en erreur.');
  // contrôles d'intégrité : les anomalies relevées tous les 10 tours, toutes expériences confondues, avec un exemple de chaque
  const inv = {}, ex = {}, games = {};
  for (const r of all) if (r.inv) for (const k in r.inv) { inv[k] = (inv[k] || 0) + r.inv[k]; games[k] = (games[k] || 0) + 1; if (!ex[k] && r.invEx) ex[k] = r.key + ' ' + r.invEx[k]; }
  const ks = Object.keys(inv).sort((a, b) => games[b] - games[a]);
  L.push('', 'Contrôles d\'intégrité (tous les 10 tours) : ' + (ks.length ? ks.length + ' type(s) d\'anomalie' : 'aucune anomalie sur ' + all.length + ' parties'));
  for (const k of ks) L.push('  ' + k + ' : ' + inv[k] + ' fois dans ' + games[k] + ' partie(s) ; ex. ' + ex[k]);
  const df = all.filter(r => r.deadFix);
  if (df.length) L.push('  unités à 0 PV retirées en fin de tour : ' + df.length + ' partie(s) ; ex. ' + df[0].key + ' ' + df[0].deadEx);
  const st = all.filter(r => r.stranded);
  if (st.length) L.push('  troupes repêchées en mer (fin de tour) : ' + bancMean(st.map(r => r.stranded)).toFixed(1) + ' en moyenne dans ' + st.length + ' partie(s) ; ex. ' + st[0].key + ' ' + st[0].strandedEx);
  return L.join('\n') + '\n';
}

if (typeof module !== 'undefined') module.exports = { bancVariant, bancJobs, bancPoints, bancReport, bancEffects };
