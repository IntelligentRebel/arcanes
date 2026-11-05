"""Robot joueur : joue des parties entières par l'interface (déplacements, combats en manuel ou automatique, sorts, cités,
fenêtres et choix au hasard, sauvegarde puis rechargement), et relève tout ce qui cloche : erreurs de page, erreurs de
console, contrôles d'intégrité (tous les 5 tours), aller-retour de la sauvegarde (tous les 10 tours), partie bloquée.
  py tests/robot.py [graine] [tours] [parties]      (résultats : tests/robot/robot_<graine>.json)
  ROBOT_DIFF=easy : niveau imposé ; ROBOT_WARMUP=150 : l'IA joue d'abord 150 tours à la place du robot (fin de partie) ;
  ROBOT_ASSIST=1 : à chaque tour l'IA joue aussi l'empire du robot (parties complètes)"""
import asyncio, os, sys, json, time, random
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'robot')

# un pas du robot : il traite d'abord le combat, puis les fenêtres, puis agit sur la carte ; renvoie ce qu'il a fait
STEP = r"""
() => {
  const R = window.__R = window.__R || { log: [], modalSteps: 0, turnActs: 0, lastTurn: -1, busy: false, castTries: 0 };
  const rnd = n => Math.floor(Math.random() * n), pick = a => a[rnd(a.length)], chance = p => Math.random() < p;
  const g = App.game; if (!g) return 'pas de partie';
  const note = s => { R.log.push('t' + g.turn + ' ' + s); if (R.log.length > 300) R.log.shift(); const k = s.split(/[ «:]/)[0] + (s.startsWith('combat') ? ' ' + (s.split(' ')[2] || '') : ''); R.counts = R.counts || {}; R.counts[k] = (R.counts[k] || 0) + 1; return s; };
  if (g.over) return 'FIN';
  if (R.lastTurn !== g.turn) { R.lastTurn = g.turn; R.turnActs = 0; }
  const vis = el => el && el.offsetParent !== null;
  const clickIn = (m, inCombat) => {
    const btns = [...m.querySelectorAll('button')].filter(b => !b.disabled && vis(b) && !/^×$/.test(b.textContent.trim()));
    const rows = [...m.querySelectorAll('.row, .tab, .card.pick, [data-pick]')].filter(r => vis(r) && typeof r.onclick === 'function');
    const foot = btns.filter(b => b.closest('footer'));
    let el = null;
    if (rows.length && chance(inCombat ? 0.5 : 0.35)) el = pick(rows);
    else if (foot.length && chance(0.75)) {
      // en combat : « Commander » une fois sur deux, sinon la résolution automatique ; à la fin, accepter le plus souvent
      const pref = foot.find(b => /Commander/.test(b.textContent)), auto = foot.find(b => /automatique/i.test(b.textContent));
      if (pref && auto) el = chance(0.5) ? pref : auto;
      else { const acc = foot.find(b => /Accepter|Continuer/.test(b.textContent)); el = acc && chance(0.8) ? acc : pick(foot); }
    } else if (btns.length) el = pick(btns);
    if (!el) { if (!UI.closeTop()) { const x = m.querySelector('.x, .close'); if (x) x.click(); else UI.closeAll(); } return 'fermer'; }
    const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    el.click(); return 'clic « ' + txt + ' »';
  };
  // 1. le combat
  if (typeof CombatView !== 'undefined' && CombatView.active) {
    const mods = [...document.querySelectorAll('.modal')].filter(vis);
    if (mods.length) { R.modalSteps++; if (R.modalSteps > 40) { UI.closeAll(); R.modalSteps = 0; return note('combat : fenêtres fermées de force'); } return note('combat ' + clickIn(mods[mods.length - 1], true)); }
    R.modalSteps = 0;
    const bt = CombatView.bt;
    if (!bt || bt.over || CombatView.busy || CombatView.auto || bt.side !== CombatView.humanSide) return 'attente combat';
    const me = CombatView.humanSide, at = (c, r) => { const P = CombatView.stand(c, r); return { clientX: P.x, clientY: P.y - 4, button: 0 }; };
    // un sort en cours de visée : une cible au hasard parmi les valables (ou une case quelconque)
    if (CombatView.mode) {
      const ts = CombatView.targetObjects();
      const t = ts.length && chance(0.85) ? pick(ts) : { c: rnd(CW), r: rnd(CH) };
      CombatView.onClick(at(t.c, t.r)); return note('combat : cible de sort ' + t.c + ',' + t.r);
    }
    const bar = [...document.querySelectorAll('#c-bar button')].filter(b => !b.disabled);
    const btn = l => bar.find(b => b.textContent.trim().startsWith(l));
    const r = Math.random();
    if (r < 0.03 && btn('Fuir')) { btn('Fuir').click(); return note('combat : fuir'); }
    if (r < 0.05 && btn('Automatique')) { btn('Automatique').click(); return note('combat : automatique'); }
    if (r < 0.12 && btn('Sorts')) { btn('Sorts').click(); return note('combat : grimoire'); }
    if (r < 0.16 && btn('Garder')) { btn('Garder').click(); return note('combat : garder'); }
    if (r < 0.19 && btn('Attendre')) { btn('Attendre').click(); return note('combat : attendre'); }
    const ready = bt.alive(me).filter(b => b.moves > 0 && !b.dead);
    if (!ready.length || r > 0.96) { const e = btn('Fin du tour'); if (e) { e.click(); return note('combat : fin du tour'); } return 'combat : rien'; }
    const u = pick(ready);
    CombatView.onClick(at(u.c, u.r));
    if (CombatView.sel !== u) return note('combat : sélection refusée');
    const foes = bt.alive(1 - me).filter(f => bt.canMelee(u, f) || bt.canShoot(u, f));
    if (foes.length && chance(0.7)) { const f = pick(foes); CombatView.onClick(at(f.c, f.r)); return note('combat : ' + u.u.type + ' attaque ' + f.u.type); }
    const reach = [...(CombatView.reach || new Map()).keys()];
    const near = bt.alive(1 - me);
    if (near.length && chance(0.4)) { const f = pick(near); CombatView.onClick(at(f.c, f.r)); return note('combat : ' + u.u.type + ' vers ' + f.u.type); }
    if (reach.length) { const [c, rr] = pick(reach).split(',').map(Number); CombatView.onClick(at(c, rr)); return note('combat : ' + u.u.type + ' va en ' + c + ',' + rr); }
    const e = btn('Fin du tour'); if (e) { e.click(); return note('combat : fin du tour'); }
    return 'combat : rien';
  }
  // 2. les fenêtres de la carte
  const mods = [...document.querySelectorAll('.modal')].filter(vis);
  if (mods.length) { R.modalSteps++; if (R.modalSteps > 12) { UI.closeAll(); R.modalSteps = 0; return note('fenêtres fermées de force'); } if (R.modalSteps > 3 && chance(0.25) && UI.closeTop()) return note('fermer'); return note(clickIn(mods[mods.length - 1], false)); }
  R.modalSteps = 0;
  if (R.busy || UI.busy || App.moving) return 'attente';
  const me = App.me(), pid = App.pid, w = g.world;
  // une visée de sort en cours sur la carte
  if (typeof MagicUI !== 'undefined' && MagicUI.targeting) {
    if (R.castTries++ > 3) { MagicUI.cancelTarget(); R.castTries = 0; return note('visée abandonnée'); }
    const tt = MagicUI.targeting.tt, units = Object.values(g.units);
    let t = null;
    if (MagicUI.targeting.cities) { const c = g.cities[pick([...MagicUI.targeting.cities])]; if (c) t = [c.plane, c.x, c.y]; }
    else if (tt === 'friendlyUnit') { const u = pick(units.filter(u => u.owner === pid)); if (u) t = [u.plane, u.x, u.y]; }
    else if (tt === 'enemyUnit' || tt === 'anyUnit') { const u = pick(units.filter(u => u.owner !== pid && Intel.sees(g, me, u.plane, u.x, u.y))); if (u) t = [u.plane, u.x, u.y]; }
    if (!t) { const u = pick(units.filter(u => u.owner === pid)) || g.cities[me.fortress]; t = u ? [u.plane, World.wx(w, u.x + rnd(7) - 3), Math.max(1, Math.min(w.h - 2, u.y + rnd(7) - 3))] : [0, rnd(w.w), rnd(w.h)]; }
    MagicUI.pickTarget(t[0], t[1], t[2]); return note('visée ' + (MagicUI.targeting ? 'refusée' : 'faite'));
  }
  R.castTries = 0;
  const mineAll = Object.values(g.units).filter(u => u.owner === pid);
  const ready = mineAll.filter(u => u.moves > 0 && !(u.path && u.path.length) && u.status !== 'sentry' && u.status !== 'explore');
  if (R.turnActs > 12 || (!ready.length && chance(0.5)) || chance(0.02)) { R.busy = true; App.endTurn(true).catch(e => console.error('robot endTurn', e)).finally(() => { R.busy = false; }); return note('fin du tour'); }
  R.turnActs++;
  const r = Math.random();
  if (r < 0.55 && ready.length) {
    const u = pick(ready); App.selectTile(u.plane, u.x, u.y);
    const d = 1 + rnd(4); let tx = World.wx(w, u.x + rnd(2 * d + 1) - d), ty = Math.max(1, Math.min(w.h - 2, u.y + rnd(2 * d + 1) - d));
    // une fois sur cinq, droit sur l'ennemi connu le plus proche
    if (chance(0.4)) { const foes = Object.values(g.units).filter(o => o.owner !== pid && o.plane === u.plane && Intel.sees(g, me, o.plane, o.x, o.y)); const f = U.min(foes, o => World.dist(w, o.x, o.y, u.x, u.y)); if (f && World.dist(w, f.x, f.y, u.x, u.y) <= 8) { tx = f.x; ty = f.y; } }
    if (tx === u.x && ty === u.y) tx = World.wx(w, u.x + 1);
    R.busy = true; Promise.resolve(App.moveSelected(tx, ty)).catch(e => console.error('robot move', e)).finally(() => { R.busy = false; });
    return note('marche ' + Units.label(u) + ' ' + u.x + ',' + u.y + ' → ' + tx + ',' + ty);
  }
  if (r < 0.65 && ready.length) {
    const u = pick(ready); App.selectTile(u.plane, u.x, u.y); App.refresh();
    const bs = [...document.querySelectorAll('.actions button')].filter(b => !b.disabled && vis(b) && (!/Dissoudre/.test(b.textContent) || chance(0.05)));
    if (!bs.length) return note('pas d\'action pour ' + Units.label(u));
    const b = pick(bs), txt = b.textContent.trim().slice(0, 30); b.click(); return note('action « ' + txt + ' » ' + Units.label(u));
  }
  if (r < 0.73) { const cs = Cities.ofPlayer(g, pid); if (cs.length) { CityUI.open(pick(cs).id); return note('ouvre une cité'); } }
  if (r < 0.86 && !me.casting) {
    const ids = Spells.castable(g, me).filter(id => { try { return Magic.spellCost(g, me, id) <= me.mana; } catch (e) { return false; } });
    if (ids.length) { const id = pick(ids); R.busy = true; Promise.resolve(MagicUI.beginCast(id)).catch(e => console.error('robot cast', e)).finally(() => { R.busy = false; }); return note('lance ' + id); }
  }
  if (r < 0.93) { const f = pick([() => MagicUI.magic(), () => MagicUI.research(), () => MagicUI.spellbook(), () => Panels.wizards(), () => Panels.cities(), () => Panels.armies(), () => Panels.chronicle(g, { tab: pick(['curves', 'moments', 'battles']) })]); try { f(); } catch (e) { console.error('robot panneau', e); } return note('ouvre un panneau'); }
  R.busy = true; App.endTurn(true).catch(e => console.error('robot endTurn', e)).finally(() => { R.busy = false; }); return note('fin du tour');
}
"""

# contrôles d'intégrité (les mêmes que le banc d'essai, tests/match.js)
CHECK = r"""
() => {
  const g = App.game, out = [], bad = (k, ex) => out.push(k + ' : ' + ex), w = g.world, num = v => typeof v === 'number' && Number.isFinite(v);
  for (const p of g.players) { if (!num(p.gold)) bad('or non numérique', p.name); if (!num(p.mana)) bad('mana non numérique', p.name); else if (p.alive && p.mana < 0) bad('mana négatif', p.name + ' ' + p.mana); }
  const water = {};
  for (const [k, u] of Object.entries(g.units)) {
    if (String(u.id) !== k) { bad('identifiant incohérent', k); continue; }
    if (!DATA.units[u.type]) { bad('type inconnu', u.type); continue; }
    if (u.owner >= 0 && (!g.players[u.owner] || !g.players[u.owner].alive)) bad('unité d\'un sorcier éliminé', u.type);
    if (!(u.plane === 0 || u.plane === 1) || !num(u.x) || !num(u.y) || u.y < 0 || u.y >= w.h || u.x < 0 || u.x >= w.w) { bad('hors du monde', u.type); continue; }
    if (!num(u.dmg) || u.dmg < 0) bad('dégâts invalides', u.type + ' ' + u.dmg); else if (Units.health(g, u) <= 0) bad('unité morte sur la carte', u.type + ' ' + u.x + ',' + u.y);
    if (World.isWaterAt(w, u.plane, u.x, u.y) && !Cities.at(g, u.plane, u.x, u.y)) { const key = u.owner + '|' + u.plane + ',' + u.x + ',' + u.y; (water[key] = water[key] || []).push(u); }
  }
  for (const [key, us] of Object.entries(water)) { let cap = 0, land = 0; for (const u of us) { const st = Units.stats(g, u); if (st.sailing) cap += Move.capacity(u); else if (!st.flying && !st.swimming && !(st.ab && (st.ab.waterWalking || st.ab.nonCorporeal))) land++; } if (land > cap) bad('sur l\'eau sans navire', key + ' ' + us.map(u => u.type).join(',')); }
  for (const c of Object.values(g.cities)) { if (!num(c.pop) || c.pop <= 0) bad('population invalide', c.name); if (c.owner >= 0 && (!g.players[c.owner] || !g.players[c.owner].alive)) bad('cité d\'un éliminé', c.name); }
  return out;
}
"""

# aller-retour de la sauvegarde : ce qu'on recharge doit se sérialiser à l'identique
ROUNDTRIP = r"""
() => {
  const s1 = App.serialize(); App.save('robot'); if (!App.load('robot')) return 'rechargement impossible';
  UI.closeAll(); const s2 = App.serialize();
  if (s1 === s2) return null;
  let i = 0; while (i < s1.length && s1[i] === s2[i]) i++;
  return 'différence au caractère ' + i + ' : ' + s1.slice(Math.max(0, i - 80), i + 60) + ' ≠ ' + s2.slice(Math.max(0, i - 80), i + 60);
}
"""


async def play(p, seed, turns, minutes):
    rng = random.Random(seed)
    races = ['highmen', 'highelf', 'orc', 'dwarf', 'barbarian', 'gnoll', 'halfling', 'klackon', 'lizardman', 'nomad', 'beastmen', 'darkelf', 'draconian', 'troll']
    realms = ['life', 'death', 'chaos', 'nature', 'sorcery']
    books = {}
    for r_ in rng.sample(realms, rng.choice([1, 2, 2, 3])): books[r_] = 0
    left = 11
    for k in books: books[k] = 1
    left -= len(books)
    while left > 0: books[rng.choice(list(books))] += 1; left -= 1
    cfg = {'seed': seed, 'race': rng.choice(races), 'books': books, 'difficulty': os.environ.get('ROBOT_DIFF') or rng.choice(['normal', 'hard', 'hardcore']), 'opponents': rng.choice([2, 3, 4])}
    b = await p.chromium.launch()
    pg = await b.new_page(viewport={'width': 1500, 'height': 920})
    errors, res = [], {'cfg': cfg, 'errors': [], 'integrity': [], 'roundtrip': [], 'stuck': [], 'turns': 0, 'steps': 0}
    pg.on('pageerror', lambda e: errors.append(('page', str(e) + ' @ ' + (e.stack or '')[:600])))
    pg.on('console', lambda m: errors.append(('console', m.text[:600])) if m.type == 'error' else None)
    await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
    cfg['warmup'] = int(os.environ.get('ROBOT_WARMUP') or 0); cfg['assist'] = bool(os.environ.get('ROBOT_ASSIST'))
    await pg.evaluate("""async (cfg) => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) { Music.jingle = () => true; Music.play = () => {}; }
      App.exportSave = () => {};   // pas de téléchargements pendant le test
      const g = Game.newGame({ seed: cfg.seed, opponents: cfg.opponents, difficulty: cfg.difficulty, crisis: 'normal', human: { name: 'Robot', portrait: 0, books: cfg.books, retorts: [], race: cfg.race } });
      // ROBOT_WARMUP : l'IA joue d'abord la place du robot (pour tester l'interface en fin de partie)
      if (cfg.warmup) { const p0 = g.players[0]; p0.human = false; p0.aiLevel = 'hard'; p0.aiPersonality = 'balanced'; for (let t = 0; t < cfg.warmup && !g.over && p0.alive; t++) await Turn.endTurn(g); p0.human = true; }
      // (après le tour d'avance : sinon le joueur redevient humain pendant le tour d'avance) ROBOT_ASSIST : chaque fin de tour, l'IA joue d'abord l'empire du robot (le robot, lui, clique partout) : la partie dure jusqu'aux 300 tours
      if (cfg.assist) { const orig = Turn.endTurn; Turn.endTurn = async function (gg) { const p0 = gg.players[0]; if (p0 && p0.alive && !gg.over) { p0.human = false; p0.aiLevel = p0.aiLevel || 'hard'; p0.aiPersonality = p0.aiPersonality || 'balanced'; try { await AI.takeTurn(gg, p0); } catch (e) { console.error('assistance IA', e && e.stack || e); } p0.human = true; } return orig.apply(this, arguments); }; }
      App.start(g); }""", cfg)
    await pg.wait_for_timeout(1500)
    t0, last_turn, last_change, seen = time.time(), -1, time.time(), 0
    while time.time() - t0 < minutes * 60:
        try:
            act = await pg.evaluate(STEP)
        except Exception as e:
            act = 'EXCEPTION ' + str(e)[:200]
        res['steps'] += 1
        if len(errors) > seen:
            log = await pg.evaluate("(window.__R || {}).log || []")
            for kind, msg in errors[seen:]: res['errors'].append({'kind': kind, 'msg': msg, 'turn': last_turn, 'log': log[-15:]})
            seen = len(errors)
        turn = await pg.evaluate("App.game ? App.game.turn : -1")
        if turn != last_turn:
            last_turn, last_change = turn, time.time()
            if turn % 5 == 0:
                bad = await pg.evaluate(CHECK)
                for x in bad: res['integrity'].append({'turn': turn, 'msg': x})
            if turn % 10 == 0 and turn > 0:
                d = await pg.evaluate(ROUNDTRIP)
                if d: res['roundtrip'].append({'turn': turn, 'msg': d[:600]})
        if act == 'FIN' or turn >= turns: break
        if time.time() - last_change > 240:
            st = await pg.evaluate("() => JSON.stringify({ busy: UI.busy, moving: App.moving, combat: CombatView.active, cbusy: CombatView.busy, side: CombatView.bt && CombatView.bt.side, mode: !!CombatView.mode, auto: CombatView.auto, robot: window.__R && window.__R.busy, modals: [...document.querySelectorAll('.modal')].map(m => m.innerText.slice(0, 160)), log: (window.__R || {}).log.slice(-12) })")
            res['stuck'].append({'turn': turn, 'state': st, 'last': act})
            await pg.screenshot(path=os.path.join(OUT, 'bloque_%d_t%d.png' % (seed, turn)))
            break
        await pg.wait_for_timeout(60 if act.startswith('attente') else 15)
    res['turns'] = last_turn
    res['over'] = await pg.evaluate("App.game ? (App.game.over ? (App.game.overWhy || '?') + (App.game.winner != null ? ' (vainqueur ' + App.game.players[App.game.winner].name + ')' : '') : 'en cours') : 'pas de partie'")
    res['log'] = await pg.evaluate("(window.__R || {}).log || []")
    res['counts'] = await pg.evaluate("(window.__R || {}).counts || {}")
    res['minutes'] = round((time.time() - t0) / 60, 1)
    await b.close()
    return res


async def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    turns = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    games = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    minutes = float(os.environ.get('ROBOT_MIN', '40'))
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        for k in range(games):
            r = await play(p, seed + k, turns, minutes)
            json.dump(r, open(os.path.join(OUT, 'robot_%d.json' % (seed + k)), 'w'), ensure_ascii=False, indent=1)
            print('partie', seed + k, json.dumps(r['cfg'], ensure_ascii=False), 'tours', r['turns'], 'pas', r['steps'], 'min', r['minutes'], 'erreurs', len(r['errors']), 'intégrité', len(r['integrity']), 'sauvegarde', len(r['roundtrip']), 'blocages', len(r['stuck']), 'fin', r.get('over'), flush=True)

asyncio.run(main())
