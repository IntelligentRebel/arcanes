'use strict';
// La chronique de la partie : chaque tour, l'état réel de chaque sorcier ; les grandes batailles ; les moments clés.
// Pendant la partie, un joueur n'en voit que ce qu'il sait (ses batailles, ce qui est public, ses rivaux estimés) ;
// une fois la partie finie, tout est révélé.

const Chronicle = {
  // colonnes d'une ligne : [sorcier, score, armée, cités, habitants, puissance magique, sorts connus, renommée, unités]
  FIELDS: ['score', 'army', 'cities', 'pop', 'power', 'spells', 'fame', 'units'],
  LABELS: { score: 'Score', army: 'Armée', cities: 'Cités', pop: 'Habitants', power: 'Puissance magique', spells: 'Sorts connus', fame: 'Renommée', units: 'Unités' },
  // ce qu'un sorcier sait de ses rivaux rencontrés : public (cités, puissance, sorts, renommée), estimé (score, armée), caché (le reste)
  PUBLIC: ['cities', 'power', 'spells', 'fame'],
  of(game) { return game.chron || (game.chron = { from: game.turn, rows: [], ev: [], battles: [] }); },

  // l'état de chaque sorcier vivant, une ligne par tour (au début du tour)
  record(game) {
    const ch = Chronicle.of(game), r = [];
    for (const pl of game.players) {
      if (!pl.alive) continue;
      const cities = Cities.ofPlayer(game, pl.id), units = Object.values(game.units).filter(u => u.owner === pl.id && !u.riteDemon);
      const army = Math.round(U.sum(units, u => Units.strength(game, u))), power = Magic.power(game, pl), fame = Players.fame(game, pl);
      // le score des IA et du rapport de forces : cités ×40, puissance ×3, sorts ×4, renommée ×2, armée ÷10
      const score = Math.round(power * 3 + pl.known.length * 4 + fame * 2 + cities.length * 40 + army / 10);
      r.push([pl.id, score, army, cities.length, U.sum(cities, c => Cities.citizens(c)), power, pl.known.length, fame, units.length]);
    }
    // les héros arrivés depuis le dernier relevé (embauche, invocation, quête, pacte…)
    const heroes = ch.heroes || (ch.heroes = {}), now = {};
    for (const u of Object.values(game.units)) if (u.hero && u.owner >= 0 && !u.avatar) { now[u.id] = u.owner; if (heroes[u.id] !== u.owner && ch.rows.length) Chronicle.note(game, 'hero_join', { a: u.owner, h: u.hero.name, plane: u.plane, x: u.x, y: u.y }); }
    ch.heroes = now;
    if (ch.rows.length && ch.rows[ch.rows.length - 1].t === game.turn) ch.rows.pop();
    ch.rows.push({ t: game.turn, r });
    // au-delà de 400 tours notés, un tour sur deux pour les plus anciens : la courbe reste lisible, la sauvegarde légère
    if (ch.rows.length > 400) ch.rows = ch.rows.filter((x, i) => i >= ch.rows.length - 200 || i % 2 === 0);
  },

  // un moment clé : k = sorte, who = sorciers concernés (eux seuls le voient en cours de partie), pub = connu de tous
  note(game, k, d) {
    const ch = Chronicle.of(game);
    ch.ev.push(Object.assign({ t: game.turn, k }, d));
    if (ch.ev.length > 900) ch.ev.splice(0, ch.ev.length - 900);
  },
  // une bataille : on garde celles où un sorcier est engagé (contre des monstres, seulement si elles comptent)
  battle(game, b) {
    if (!(b.a >= 0 || b.d >= 0)) return;
    const size = b.aS + b.dS;
    if (!(b.city || (b.a >= 0 && b.d >= 0) || size >= 250 || b.heroes)) return;
    const ch = Chronicle.of(game);
    ch.battles.push(Object.assign({ t: game.turn, size }, b));
    // plafond : on écarte la plus petite (les grandes batailles restent)
    if (ch.battles.length > 300) { let k = 0; for (let i = 1; i < ch.battles.length - 20; i++) if (ch.battles[i].size < ch.battles[k].size) k = i; ch.battles.splice(k, 1); }
  },
  // tour de la rencontre de deux sorciers (null : jamais ; 0 : avant le début de la chronique)
  metTurn(game, a, b) {
    if (a === b) return 0;
    const pa = game.players[a]; if (!pa || !pa.contact || !pa.contact[b]) return null;
    const e = Chronicle.of(game).ev.find(x => x.k === 'met' && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    return e ? e.t : 0;
  },
  // ce que le spectateur voit d'un moment clé
  visible(game, e, viewer, reveal) {
    if (reveal || viewer == null) return true;
    if (e.pub) return true;
    return [e.a, e.b, e.d].includes(viewer);
  },
  battleVisible(game, b, viewer, reveal) { return reveal || viewer == null || b.a === viewer || b.d === viewer; },

  // les séries d'un indicateur, sorcier par sorcier : [{ t, v, lo, hi, ex }] ; reveal : les vraies valeurs de tous
  series(game, viewer, field, reveal) {
    const ch = Chronicle.of(game), col = Chronicle.FIELDS.indexOf(field) + 1, out = new Map();
    const push = (id, p) => { if (!out.has(id)) out.set(id, []); out.get(id).push(p); };
    const me = viewer != null ? game.players[viewer] : null;
    // score et armée des rivaux, en cours de partie : ce que les renseignements estimaient à chaque tour
    if (!reveal && me && (field === 'score' || field === 'army')) {
      for (const e of me.seenHistory || []) for (const r of e.r) {
        if (r[0] === viewer) continue;
        const [id, sc, ar, slo, shi, alo, ahi] = r, ex = r.length <= 3, v = field === 'score' ? [sc, slo, shi] : [ar, alo, ahi];
        push(id, { t: e.t, v: v[0], lo: ex ? v[0] : v[1], hi: ex ? v[0] : v[2], ex });
      }
    }
    for (const row of ch.rows) for (const r of row.r) {
      const id = r[0];
      if (!reveal && me && id !== viewer) {
        if (field === 'score' || field === 'army' || !Chronicle.PUBLIC.includes(field)) continue;
        const m = Chronicle.metTurn(game, viewer, id); if (m == null || row.t < m) continue;
      }
      push(id, { t: row.t, v: r[col], lo: r[col], hi: r[col], ex: true });
    }
    for (const s of out.values()) s.sort((a, b) => a.t - b.t);
    return out;
  },

  // ---------- les textes ----------
  // le nom d'un sorcier pour ce spectateur (révélé à la fin de la partie)
  who(game, viewer, id, reveal) {
    if (id == null || id < 0) return 'des monstres';
    const p = game.players[id]; if (!p) return '?';
    if (viewer === id) return U.txt('vous');
    return reveal || viewer == null ? p.name : Players.nameFor(game, viewer, id);
  },
  DIPLO: { war: 'entrent en guerre', peace: 'signent la paix', alliance: 'concluent une alliance', none: 'rompent leur traité' },
  // les sortes de moments, de la plus marquante à la plus anodine (major : affiché aussi sur la courbe)
  KINDS: {
    mastery: { icon: '✶', major: true }, eliminated: { icon: '✝', major: true }, banished: { icon: '⚑', major: true }, mastery_cast: { icon: '✶', major: true },
    city_taken: { icon: '♜', major: true }, city_razed: { icon: '✖', major: true }, war: { icon: '⚔', major: true }, global: { icon: '✦', major: true },
    crisis: { icon: '☄', major: true }, finale: { icon: '☠', major: true }, finale_end: { icon: '☀', major: true }, legend: { icon: '♛', major: true }, avatar_fall: { icon: '⚑', major: true },
    peace: { icon: '☮' }, alliance: { icon: '⚭' }, none: { icon: '✕' }, met: { icon: '◎' }, city_ceded: { icon: '✎' }, mastery_study: { icon: '✶' },
    hero_fall: { icon: '✝' }, city_new: { icon: '⌂', minor: true }, hero_join: { icon: '♟', minor: true },
  },
  kindOf(e) { return e.k === 'diplo' ? e.st === 'war' ? 'war' : e.st : e.k; },
  text(game, e, viewer, reveal) {
    const W = id => Chronicle.who(game, viewer, id, reveal), C = s => U.cap(s);
    const sp = id => DATA.spells[id] ? DATA.spells[id].name : id;
    switch (e.k) {
      case 'met': return e.a === viewer || e.b === viewer ? 'Vous rencontrez ' + W(e.a === viewer ? e.b : e.a) + '.' : C(W(e.a)) + ' et ' + W(e.b) + ' se rencontrent.';
      case 'diplo': {
        const brk = e.broke ? ' (traité rompu)' : '';
        if (e.a === viewer || e.b === viewer) { const o = W(e.a === viewer ? e.b : e.a); return ({ war: 'Vous entrez en guerre contre ', peace: 'Vous signez la paix avec ', alliance: 'Vous concluez une alliance avec ', none: 'Vous rompez votre traité avec ' }[e.st] || 'Vous et ') + o + brk + '.'; }
        return C(W(e.a)) + ' et ' + W(e.b) + ' ' + (Chronicle.DIPLO[e.st] || e.st) + brk + '.';
      }
      case 'city_new': return e.a === viewer ? 'Vous fondez ' + e.c + '.' : C(W(e.a)) + ' fonde ' + e.c + '.';
      case 'city_taken': return e.d === viewer ? C(W(e.a)) + ' vous prend ' + e.c + (e.fort ? ', votre forteresse !' : '.') : (e.a === viewer ? 'Vous prenez ' + e.c : C(W(e.a)) + ' prend ' + e.c) + (e.d >= 0 ? ' à ' + W(e.d) : '') + (e.fort ? ', sa forteresse !' : '.');
      case 'city_razed': return (e.a === viewer ? 'Vous rasez ' + e.c : C(W(e.a)) + ' rase ' + e.c) + (e.d >= 0 ? (e.d === viewer ? ', votre cité' : ', cité ' + U.de(W(e.d))) : '') + '.';
      case 'city_ceded': return e.a === viewer ? C(W(e.d)) + ' vous cède ' + e.c + ' par traité.' : C(W(e.d)) + (e.d === viewer ? ' cédez ' : ' cède ') + e.c + ' à ' + W(e.a) + ' par traité.';
      case 'global': return e.a === viewer ? 'Vous lancez ' + sp(e.s) + '.' : C(W(e.a)) + ' lance ' + sp(e.s) + '.';
      case 'mastery_study': return C(W(e.a)) + (e.a === viewer ? ' étudiez' : ' étudie') + ' le Sort de Maîtrise.';
      case 'mastery_cast': return C(W(e.a)) + (e.a === viewer ? ' commencez' : ' commence') + ' à lancer le Sort de Maîtrise.';
      case 'mastery': return C(W(e.a)) + (e.a === viewer ? ' accomplissez' : ' accomplit') + ' le Sort de Maîtrise.';
      case 'banished': return e.why === 'avatar' ? C(W(e.a)) + (e.a === viewer ? ' tombez au combat, en personne : vous êtes banni.' : ' tombe au combat, en personne : il est banni.') : C(W(e.a)) + (e.a === viewer ? ' êtes banni' : ' est banni') + (e.by != null && e.by >= 0 ? ' par ' + W(e.by) : '') + ' : ' + (e.a === viewer ? 'votre' : 'sa') + ' forteresse est tombée.';
      case 'avatar_fall': return C(W(e.a)) + (e.a === viewer ? ' tombez' : ' tombe') + ' au combat, en personne.';
      case 'eliminated': return C(W(e.a)) + (e.a === viewer ? ' disparaissez' : ' disparaît') + ' de ce monde.';
      case 'hero_join': return e.h + (e.a === viewer ? ' vous rejoint.' : ' rejoint ' + W(e.a) + '.');
      case 'hero_fall': return (e.a === viewer ? 'Votre héros ' + e.h : e.h + ', héros ' + U.de(W(e.a)) + ',') + ' tombe' + (e.lv ? ' (' + e.lv + ')' : '') + '.';
      case 'legend': return e.h + ' accomplit sa légende' + (e.place ? ' ' + e.place : '') + (e.item ? ' : ' + e.item : '') + '.';
      case 'crisis': return 'La Brèche s\'ouvre : la Crise commence.';
      case 'finale': return (typeof Finale !== 'undefined' ? Finale.title(e.kind) : '') + ' : la crise de fin commence, contre ' + W(e.d) + '.';
      case 'finale_end': { const T = typeof Finale !== 'undefined' ? Finale.title(e.kind) : ''; return e.a == null ? 'La crise de fin s\'achève.' : e.a === viewer ? 'Vous mettez fin à la crise (' + T + ').' : C(W(e.a)) + ' met fin à la crise (' + T + ').'; }
      default: return e.k;
    }
  },
  // une bataille en une ligne
  // un camp d'une bataille : le sorcier, ou les défenseurs neutres d'une cité, les gardiens d'un lieu, des monstres
  sideName(game, b, side, viewer, reveal) {
    const id = side ? b.d : b.a;
    if (id != null && id >= 0) return Chronicle.who(game, viewer, id, reveal);
    return side && b.city ? 'la garnison de ' + b.city : side && b.site ? 'les gardiens' : 'des monstres';
  },
  battleText(game, b, viewer, reveal) {
    const W = id => id === b.a ? Chronicle.sideName(game, b, 0, viewer, reveal) : Chronicle.sideName(game, b, 1, viewer, reveal);
    const place = b.city ? (b.siege ? 'Siège de ' : 'Bataille de ') + b.city : b.site ? U.cap(b.site) : 'Bataille en rase campagne';
    const won = b.w === 0 ? b.a : b.w === 1 ? b.d : null;
    return { place, sides: U.cap(W(b.a)) + ' contre ' + W(b.d), won: b.w == null ? 'issue indécise' : (won === viewer ? 'Vous l\'emportez' : /^(des|les) /.test(W(won)) ? U.cap(W(won)) + ' l\'emportent' : U.cap(W(won)) + ' l\'emporte') };
  },
};
