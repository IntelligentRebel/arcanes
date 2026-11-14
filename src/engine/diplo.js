'use strict';
// Diplomatie raisonnée (ajouts d'Arcanes) : les raisons de chaque attitude, les exigences et ultimatums, l'échange de sorts,
// la lassitude de la guerre, la dénonciation d'un traité avant de le rompre.

Object.assign(Diplomacy, {
  // ---------- les raisons d'une attitude ----------
  // pa.relWhy[b][clé] : ce qui a fait varier l'opinion de a sur b ; « other » (souvenirs anciens) complète jusqu'au total
  WHY: {
    treaty_broken: 'Vous avez rompu un traité avec lui', betrayal: 'Vous avez trahi un autre sorcier', attacked: 'Vous l\'avez attaqué',
    declared: 'Vous lui avez déclaré la guerre', gift: 'Vos présents', treaty: 'Les traités signés', peace: 'La paix entre vous', alliance: 'Votre alliance',
    aura: 'Votre Aura de majesté', refused: 'Vous avez repoussé ses offres', borders_closed: 'Vous lui avez fermé votre territoire',
    hostile_spell: 'Vos sorts contre lui', subversion: 'Les rumeurs de Subversion', breach: 'Vous avez refermé la Brèche', finale: 'Vous avez mis fin à la crise',
    demand_met: 'Vous avez cédé à ses exigences', demand_refused: 'Vous avez rejeté ses exigences', trade: 'Vos échanges de sorts',
    border: 'Vos frontières se touchent', realm_same: 'La même voie de magie', realm_opp: 'Vie contre Mort', common_enemy: 'Un ennemi commun',
    coalition_lead: 'Votre avance l\'inquiète', coalition_ally: 'Front commun contre le meneur', deserters: 'L\'affaire des déserteurs',
    toll: 'Votre péage sur ses caravanes', escort: 'Vous avez escorté ses caravanes', denounced: 'Le traité dénoncé',
    mutual_neg: 'Rancœur réciproque', mutual_pos: 'Sympathie réciproque', other: 'Souvenirs anciens',
  },
  why(game, a, b, key, n) {
    const pa = game.players[a]; if (!pa || !n) return;
    const w = (pa.relWhy = pa.relWhy || {}), r = (w[b] = w[b] || {});
    r[key] = (r[key] || 0) + n;
  },
  // une raison qui s'accumule tour après tour, sans dépasser cap (en valeur absolue) : la relation suit
  accrue(game, a, b, key, n, cap) {
    const pa = game.players[a]; if (!pa) return;
    const cur = ((pa.relWhy || {})[b] || {})[key] || 0;
    const room = cap > 0 ? Math.max(0, cap - cur) : Math.min(0, cap - cur);
    const d = cap > 0 ? Math.min(n, room) : Math.max(n, room);
    if (!d) return;
    const before = pa.relations[b] || 0;
    pa.relations[b] = U.clamp(before + d, -100, 100);
    Diplomacy.why(game, a, b, key, pa.relations[b] - before);
  },
  // ce que a pense de b, raison par raison (la somme fait la relation)
  reasons(game, a, b) {
    const pa = game.players[a]; if (!pa) return [];
    const r = ((pa.relWhy || {})[b]) || {}, total = pa.relations[b] || 0;
    const out = Object.entries(r).map(([k, v]) => ({ key: k, label: Diplomacy.WHY[k] || k, v }));
    const rest = total - U.sum(out, x => x.v);
    if (Math.abs(rest) >= 1) out.push({ key: 'other', label: Diplomacy.WHY.other, v: rest });
    return out.filter(x => Math.abs(x.v) >= 1).sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  },
  // la dérive vers la neutralité efface les souvenirs du même signe que la relation, au prorata de leur poids
  spreadDrift(game, a, b, d) {
    const r = a.relWhy && a.relWhy[b]; if (!r) return;
    const same = Object.keys(r).filter(k => Math.sign(r[k]) === -Math.sign(d)), S = U.sum(same, k => Math.abs(r[k]));
    if (S <= 0) return;
    const take = Math.min(Math.abs(d), S);
    for (const k of same) { r[k] += Math.sign(d) * take * Math.abs(r[k]) / S; if (Math.abs(r[k]) < 0.3) delete r[k]; }
  },
  // les liens qui se tissent ou s'usent chaque tour entre deux sorciers qui se connaissent
  driftTurn(game, a, b) {
    // frontières qui se touchent : frottements
    const touch = Cities.ofPlayer(game, a.id).some(m => Cities.ofPlayer(game, b.id).some(c => c.plane === m.plane && World.dist(game.world, c.x, c.y, m.x, m.y) <= 7));
    if (touch) Diplomacy.accrue(game, a.id, b.id, 'border', -0.25, -12);
    // voies de magie : la même rapproche, la Vie et la Mort se haïssent
    const dom = p => { const bk = p.books || {}; let best = null, n = 0; for (const r of REALMS5) if ((bk[r] || 0) > n) { n = bk[r]; best = r; } return best; };
    const ra = dom(a), rb = dom(b);
    if (ra && ra === rb) Diplomacy.accrue(game, a.id, b.id, 'realm_same', 0.2, 8);
    else if ((ra === 'life' && rb === 'death') || (ra === 'death' && rb === 'life')) Diplomacy.accrue(game, a.id, b.id, 'realm_opp', -0.3, -12);
    // un ennemi commun
    if (game.players.some(o => o.alive && o.id !== a.id && o.id !== b.id && a.diplo[o.id] === 'war' && b.diplo[o.id] === 'war')) Diplomacy.accrue(game, a.id, b.id, 'common_enemy', 0.4, 15);
  },

  // ---------- guerre : ce qu'elle coûte ----------
  // pa.warLog[b] : depuis quand, force perdue et infligée, cités prises et perdues
  warRec(pa, b, game) {
    const w = (pa.warLog = pa.warLog || {});
    if (!w[b] || w[b].ended) w[b] = { since: game.turn, lost: 0, dealt: 0, citiesLost: 0, citiesTaken: 0 };
    return w[b];
  },
  recordBattle(game, battle, info) {
    const a = battle.owner(ATT_SIDE), d = battle.owner(DEF_SIDE), pa = game.players[a], pd = game.players[d];
    if (!pa || !pd || a === d) return;
    const lost = [0, 0];
    for (const b of battle.dead) if (!b.temp) lost[b.side] += Units.strength(game, b.u);
    const ra = Diplomacy.warRec(pa, d, game), rd = Diplomacy.warRec(pd, a, game);
    ra.lost += lost[ATT_SIDE]; ra.dealt += lost[DEF_SIDE]; rd.lost += lost[DEF_SIDE]; rd.dealt += lost[ATT_SIDE];
    if (info && info.city && battle.winner === ATT_SIDE) { ra.citiesTaken++; rd.citiesLost++; }
  },
  // lassitude de a dans sa guerre contre b : au-delà de 0,3, la paix vaut mieux (pertes nettes rapportées à sa puissance,
  // cités perdues, guerre qui s'éternise)
  weariness(game, a, b) {
    const w = a.warLog && a.warLog[b.id]; if (!w || w.ended || a.diplo[b.id] !== 'war') return 0;
    const pow = Math.max(50, Diplomacy.power(game, a));
    const net = (w.lost - w.dealt * 0.8) / pow;
    const long = Math.max(0, game.turn - w.since - 30) / 100;
    return Math.max(0, net + 0.25 * (w.citiesLost - w.citiesTaken) + long);
  },
  endWar(game, a, b) { for (const [x, y] of [[a, b], [b, a]]) { const p = game.players[x]; if (p && p.warLog && p.warLog[y]) p.warLog[y].ended = true; } },

  // ---------- dénonciation : un sorcier d'honneur prévient avant de rompre ----------
  TREACHEROUS: ['maniac'],
  DENOUNCE_TURNS: 6,
  treacherous(pl) { return Diplomacy.TREACHEROUS.includes(pl.aiPersonality); },
  denounce(game, a, b) {
    const pa = game.players[a], pb = game.players[b];
    pa.denounced = pa.denounced || {};
    if (pa.denounced[b] != null) return false;
    pa.denounced[b] = game.turn + Diplomacy.DENOUNCE_TURNS;
    Diplomacy.why(game, b, a, 'denounced', -5); pb.relations[a] = U.clamp((pb.relations[a] || 0) - 5, -100, 100);
    Game.log(game, b, pa.name + ' dénonce votre ' + Diplomacy.stateName(pa.diplo[b]).toLowerCase() + ' : dans ' + Diplomacy.DENOUNCE_TURNS + ' tours, plus rien ne vous protège de lui.', { diplo: a, alert: true });
    Game.log(game, a, 'Vous dénoncez votre traité avec ' + pb.name + ' : il prendra fin dans ' + Diplomacy.DENOUNCE_TURNS + ' tours.', { minor: true });
    return true;
  },
  denounceTick(game) {
    for (const pa of game.players) {
      if (!pa.denounced) continue;
      for (const b in pa.denounced) {
        const pb = game.players[b], st = pa.diplo[b];
        if (!pb || !pb.alive || (st !== 'peace' && st !== 'alliance')) { delete pa.denounced[b]; continue; }
        if (game.turn < pa.denounced[b]) continue;
        delete pa.denounced[b];
        Diplomacy.setState(game, pa.id, pb.id, 'none');
        Game.log(game, pb.id, 'Le traité qui vous liait à ' + pa.name + ' a pris fin.', { diplo: pa.id, alert: true });
        Game.log(game, pa.id, 'Votre traité avec ' + pb.name + ' a pris fin.', { minor: true });
      }
    }
  },
  // une IA veut la guerre contre un sorcier avec qui elle a un traité : le perfide le rompt, les autres le dénoncent d'abord
  breakOrDenounce(game, a, b) {
    if (Diplomacy.treacherous(a)) { Diplomacy.declareWar(game, a.id, b.id, -20); Game.log(game, b.id, a.name + ' rompt votre traité et vous déclare la guerre !', { diplo: a.id, alert: true }); Game.log(game, a.id, 'Guerre déclarée à ' + b.name + '.'); return 'war'; }
    Diplomacy.denounce(game, a.id, b.id);
    return 'denounced';
  },

  // ---------- sorts : ce qui peut s'échanger ----------
  canLearn(pl, id) {
    const sp = DATA.spells[id];
    if (!sp || sp.research == null || id === 'spell_of_mastery' || pl.known.includes(id)) return false;
    return (sp.realm === 'arcane' && !(sp.params && sp.params.gate)) || (pl.researchPool || []).includes(id);
  },
  tradeable(game, giver, receiver) { return giver.known.filter(id => Diplomacy.canLearn(receiver, id)).sort((x, y) => DATA.spells[y].research - DATA.spells[x].research); },
  spellValue(id) { return DATA.spells[id] ? DATA.spells[id].research || 0 : 0; },
  learnFrom(game, pl, id, from) {
    if (!Diplomacy.canLearn(pl, id)) return false;
    Magic.learn(game, pl, id);
    return true;
  },
  // ce que l'IA b exige pour donner give contre get : facteur sur la valeur (plus elle vous aime, moins elle compte)
  tradeFactor(game, b, a) {
    const r = b.relations[a.id] || 0;
    let k = r > 40 ? 0.9 : r > 10 ? 1.1 : 1.35;
    const L = AI.feat(b, 'coalition', 2) ? Diplomacy.leaderFor(game, b) : null;
    if (L && L.id === a.id) k *= 1.4;   // on n'arme pas celui qui écrase la partie
    return k;
  },
  // (0.31.55) un marché : plusieurs sorts de chaque côté, et de l'or pour équilibrer.
  // L'or se compte en points de recherche au taux des événements (acheter du savoir coûte 1,2 or le point, en vendre en rapporte 0,8) :
  // l'or reçu vaut 0,8 point la pièce, l'or donné 1,25 ; un sorcier ne cède pas plus de la moitié de son trésor.
  GOLD_IN: 0.8, GOLD_OUT: 1.25,
  list(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]).filter(Boolean); },
  goldSpare(pl) { return Math.max(0, Math.floor((pl.gold || 0) * 0.5 / 5) * 5); },
  // ce que b donne (vg) et reçoit (vr), en points de recherche ; gold > 0 : a paie b, gold < 0 : b paie a
  dealValue(give, get, gold) {
    const sum = L => L.reduce((t, id) => t + Diplomacy.spellValue(id), 0);
    return { vg: sum(Diplomacy.list(give)) + Math.max(0, -(gold || 0)) * Diplomacy.GOLD_OUT, vr: sum(Diplomacy.list(get)) + Math.max(0, gold || 0) * Diplomacy.GOLD_IN };
  },
  // l'IA b accepte-t-elle de donner give à a contre get (et l'or) ? (raison si refus)
  tradeAnswer(game, a, b, give, get, gold) {
    gold = Math.round(gold || 0);
    const G = Diplomacy.list(give), R = Diplomacy.list(get);
    if (b.diplo[a.id] === 'war') return { ok: false, why: b.name + ' ne traite pas avec un ennemi.' };
    if ((b.relations[a.id] || 0) < -30) return { ok: false, why: b.name + ' se méfie trop de vous.' };
    if (G.some(id => !b.known.includes(id))) return { ok: false, why: 'Il ne connaît pas ce sort.' };
    if (R.some(id => !Diplomacy.canLearn(b, id))) return { ok: false, why: 'Ce sort ne lui sert à rien.' };
    if (gold > 0 && gold > (a.gold || 0)) return { ok: false, why: 'Vous n\'avez pas autant d\'or.' };
    if (gold < 0 && -gold > Diplomacy.goldSpare(b)) return { ok: false, why: b.name + ' ne peut pas verser autant d\'or.' };
    const { vg, vr } = Diplomacy.dealValue(G, R, gold);
    if (!vg) return { ok: true };   // un cadeau s'accepte toujours
    if (vr < vg * Diplomacy.tradeFactor(game, b, a)) return { ok: false, why: b.name + ' estime ce marché trop inégal.' };
    return { ok: true };
  },
  // l'or qui rend le marché acceptable pour b : > 0, ce que a doit ajouter au minimum ; < 0, ce que b verserait au plus (par 5)
  fairGold(game, a, b, give, get) {
    const { vg, vr } = Diplomacy.dealValue(give, get, 0), k = Diplomacy.tradeFactor(game, b, a);
    if (!vg && !vr) return 0;
    if (vr < vg * k) return Math.ceil((vg * k - vr) / Diplomacy.GOLD_IN / 5) * 5;
    return -Math.min(Diplomacy.goldSpare(b), Math.floor((vr / k - vg) / Diplomacy.GOLD_OUT / 5) * 5);
  },
  // a propose à l'IA b : elle donne give, reçoit get, et l'or (give vide, sans or de sa part : cadeau)
  proposeTrade(game, a, b, give, get, gold) {
    gold = Math.round(gold || 0);
    const pa = game.players[a], pb = game.players[b], G = Diplomacy.list(give), R = Diplomacy.list(get);
    const asked = (pb.aiAsked = pb.aiAsked || {});
    const key = a + ':trade:' + G.slice().sort().join(',') + ':' + R.slice().sort().join(',') + ':' + gold;
    if (asked[key] === game.turn) return { ok: false, text: pb.name + ' vous a déjà répondu.' };
    asked[key] = game.turn;
    const ans = Diplomacy.tradeAnswer(game, pa, pb, G, R, gold);
    if (!ans.ok) return { ok: false, text: ans.why };
    Diplomacy.doTrade(game, pa, pb, G, R, gold);
    const names = L => L.map(id => DATA.spells[id].name).join(', ');
    if (!G.length && gold >= 0) return { ok: true, text: pb.name + ' accepte votre présent : ' + [names(R), gold ? gold + ' or' : ''].filter(Boolean).join(', ') + '.' };
    const you = [G.length ? 'vous apprenez ' + names(G) : '', gold < 0 ? 'vous recevez ' + (-gold) + ' or' : ''].filter(Boolean).join(' et ');
    const him = pb.name + ' ' + [R.length ? 'apprend ' + names(R) : '', gold > 0 ? 'reçoit ' + gold + ' or' : ''].filter(Boolean).join(' et ');
    return { ok: true, text: 'Marché conclu : ' + [you, R.length || gold > 0 ? him : ''].filter(Boolean).join(', ') + '.' };
  },
  // l'échange : a reçoit give de b, b reçoit get de a ; gold > 0 : a paie b, gold < 0 : b paie a
  doTrade(game, pa, pb, give, get, gold) {
    const G = Diplomacy.list(give), R = Diplomacy.list(get);
    gold = Math.round(gold || 0);
    for (const id of G) Diplomacy.learnFrom(game, pa, id, pb);
    for (const id of R) Diplomacy.learnFrom(game, pb, id, pa);
    if (gold > 0) { const g = Math.min(gold, pa.gold); pa.gold -= g; pb.gold += g; }
    else if (gold < 0) { const g = Math.min(-gold, pb.gold); pb.gold -= g; pa.gold += g; }
    const gift = !G.length && gold >= 0;
    const bonus = !gift ? 5 : Math.min(20, (R.length ? Math.round(R.reduce((t, id) => t + Diplomacy.spellValue(id), 0) / 40) + 3 : 0) + Math.round(gold / 10));
    Diplomacy.adjust(game, pb.id, pa.id, bonus, gift ? 'gift' : 'trade');
    if (!gift) Diplomacy.adjust(game, pa.id, pb.id, bonus, 'trade');
  },
  // le meilleur échange équitable entre deux sorciers (pour l'IA) : ce que chacun gagne le plus, à valeur voisine
  bestSwap(game, a, b) {
    const ga = Diplomacy.tradeable(game, b, a).slice(0, 12), gb = Diplomacy.tradeable(game, a, b).slice(0, 12);
    let best = null;
    for (const x of ga) for (const y of gb) {
      const vx = Diplomacy.spellValue(x), vy = Diplomacy.spellValue(y); if (!vx || !vy) continue;
      const ratio = vx / vy; if (ratio < 0.8 || ratio > 1.25) continue;
      const v = Math.min(vx, vy); if (!best || v > best.v) best = { aGets: x, bGets: y, v };
    }
    return best;
  },

  // ---------- exigences et ultimatums ----------
  // l'IA a, bien plus forte que b et peu amicale, exige de l'or ou un sort ; ultimatum : refuser, c'est la guerre
  demandTurn(game, a) {
    if (game.turn < 30 || !AI.feat(a, 'demands', 1)) return;
    a.lastDemand = a.lastDemand || {};
    for (const b of game.players) {
      if (!b.alive || b.id === a.id || !a.contact[b.id] || b.banished) continue;
      const st = a.diplo[b.id] || 'none';
      if (st === 'war' || st === 'alliance' || game.turn - (a.lastDemand[b.id] || -99) < 30) continue;
      const r = a.relations[b.id] || 0, myPow = Diplomacy.power(game, a), hisPow = Intel.powerOf(game, a, b.id);
      // Hardcore : exiger quand l'autre est déjà en guerre ailleurs (il ne peut guère refuser)
      const busy = AI.feat(a, 'timing', 3) && game.players.some(o => o.alive && o.id !== a.id && o.id !== b.id && b.diplo[o.id] === 'war');
      if (r >= 15 || myPow < hisPow * (busy ? 1.25 : 1.5) || !game.rng.chance(busy ? 0.05 : 0.03)) continue;
      if (b.human && a.aiLevel === 'easy') continue;
      const spells = Diplomacy.tradeable(game, b, a).filter(id => Diplomacy.spellValue(id) <= 200 + game.turn * 15);
      const off = { from: a.id, kind: 'demand', turn: game.turn };
      if (spells.length && game.rng.chance(0.5)) off.spell = spells[0];
      else if (b.gold >= 40) off.gold = Math.max(25, Math.min(Math.round(b.gold * 0.3 / 5) * 5, 50 + game.turn * 2));
      else if (spells.length) off.spell = spells[0];
      else continue;
      // ultimatum : un belliqueux (ou un ennemi déclaré) n'attend pas de traité pour frapper
      off.ultimatum = AI.feat(a, 'wars', 1) && (a.aiPersonality === 'militarist' || a.aiPersonality === 'maniac' || r < -20) && (st === 'none' || Diplomacy.treacherous(a));
      a.lastDemand[b.id] = game.turn;
      if (b.human) {
        Diplomacy.offer(game, b, off);
        Game.log(game, b.id, a.name + (off.ultimatum ? ' vous adresse un ultimatum.' : ' exige un tribut.'), { diplo: a.id, offer: true, alert: true });
      } else Diplomacy.settleDemand(game, b, off, Diplomacy.aiAcceptsDemand(game, b, a, off));
    }
  },
  demandText(game, viewer, off) {
    return off.gold ? off.gold + ' pièces d\'or' : off.spell ? 'le sort ' + DATA.spells[off.spell].name : '?';
  },
  // une IA à qui l'on fait une exigence : céder si la guerre lui coûterait plus (la force de l'autre, la menace explicite)
  aiAcceptsDemand(game, b, a, off) {
    const fear = Intel.powerOf(game, b, a.id) / Math.max(1, Diplomacy.power(game, b));
    if (off.gold && off.gold > b.gold) return false;
    return fear >= 2 || (off.ultimatum && fear >= 1.3);
  },
  // b répond à l'exigence off : céder ou refuser (et subir la menace)
  settleDemand(game, b, off, yes) {
    const a = game.players[off.from]; if (!a || !a.alive) return;
    if (yes) {
      if (off.gold) { const g = Math.min(off.gold, b.gold); b.gold -= g; a.gold += g; }
      if (off.spell) Diplomacy.learnFrom(game, a, off.spell, b);
      Diplomacy.adjust(game, a.id, b.id, 8, 'demand_met');
      if (!b.human) Game.log(game, a.id, b.name + ' cède à votre exigence : ' + Diplomacy.demandText(game, a.id, off) + '.', { minor: true });
      return;
    }
    Diplomacy.adjust(game, a.id, b.id, -15, 'demand_refused');
    if (off.ultimatum && (a.diplo[b.id] || 'none') !== 'war') {
      Diplomacy.declareWar(game, a.id, b.id, -10);
      Game.log(game, b.id, a.name + ' met sa menace à exécution : c\'est la guerre.', { diplo: a.id, alert: true });
      Game.log(game, a.id, b.name + ' rejette votre ultimatum : guerre déclarée.');
    }
  },
  // exigences restées sans réponse au tour suivant : c'est un refus
  // (posée en fin de tour T, elle se lit au tour T+1 et tombe à la fin de celui-ci : au tour T+2, pendingOffers ne la montre plus)
  expireDemands(game) {
    for (const b of game.players) {
      if (!b.human || !b.diploOffers) continue;
      for (const off of b.diploOffers.slice()) {
        if (off.kind !== 'demand' || off.turn >= game.turn) continue;
        Diplomacy.dropOffer(b, off);
        Game.log(game, b.id, 'Sans réponse de votre part, ' + game.players[off.from].name + ' tient son exigence pour rejetée.', { diplo: off.from });
        Diplomacy.settleDemand(game, b, off, false);
      }
    }
  },

  // ---------- échanges proposés par l'IA ----------
  tradeTurn(game, a) {
    if (!AI.feat(a, 'spelltrade', 1)) return;
    for (const b of game.players) {
      if (!b.alive || b.id === a.id || !a.contact[b.id] || b.banished) continue;
      const st = a.diplo[b.id] || 'none', r = a.relations[b.id] || 0;
      if (st === 'war' || r < (b.human ? 0 : 5) || !game.rng.chance(0.03)) continue;
      const L = AI.feat(a, 'coalition', 2) ? Diplomacy.leaderFor(game, a) : null; if (L && L.id === b.id) continue;
      const sw = Diplomacy.bestSwap(game, a, b); if (!sw) continue;
      if (b.human) {
        if (Diplomacy.offerFrom(game, b, a.id)) continue;
        Diplomacy.offer(game, b, { from: a.id, kind: 'trade', turn: game.turn, give: sw.bGets, get: sw.aGets });
        Game.log(game, b.id, a.name + ' vous propose un échange de sorts.', { diplo: a.id, offer: true });
      } else if ((b.relations[a.id] || 0) >= 5 && Diplomacy.tradeAnswer(game, a, b, sw.aGets, sw.bGets).ok) {
        Diplomacy.doTrade(game, a, b, sw.aGets, sw.bGets);
      }
    }
  },
});
