"""v0.31.73 : les sorts inédits à l'écran. En combat : le Glas (cases marquées, cloche et compte à rebours), la Démence contagieuse ;
sur la carte : Ennemi juré (le héros, puis le rival), Réveil du charnier (le charnier cerclé), la Grande Inversion annoncée (la région
sur la carte, puis la fenêtre illustrée quand elle a lieu), la Trêve de Dieu (l'attaque refusée)."""
import asyncio, os, http.server, threading, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except (ConnectionResetError, BrokenPipeError): pass

async def idle(pg):
    for _ in range(60):
        if not await pg.evaluate("CombatView.busy"): return
        await pg.wait_for_timeout(200)

HOMM = ['slow', 'mass_slow', 'force_field', 'fire_curtain', 'fire_mines', 'mist', 'teleport', 'gust', 'magic_mirror', 'clone', 'chain_lightning', 'fire_shield', 'martyr', 'divine_vengeance', 'sacrifice', 'vampirism', 'shackles', 'twilight', 'dimension_door', 'town_portal', 'fire_rain', 'frost_ring', 'meteor_shower', 'plague_cloud', 'holy_dawn']

NOVEL = ['knell', 'contagious_madness', 'sworn_enemy', 'charnel_rising', 'truce_of_god', 'unleashed_beast', 'blood_debt', 'node_trap', 'great_inversion']

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist', 'arcanes')))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 860}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(2500)
        await pg.evaluate("""(N) => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {}; Music.jingle = () => true;
          const g = Game.newGame({ seed: 5, opponents: 2, crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { death: 4, chaos: 4, sorcery: 3 }, retorts: [], race: 'highmen' } });
          App.start(g); const me = App.me(); for (const id of N) if (id !== 'great_inversion' && !me.known.includes(id)) me.known.push(id); me.mana = 5000; }""", NOVEL)
        await pg.wait_for_timeout(2000); await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("(N) => N.filter(id => !Sprites.hasHD('spell:' + id))", NOVEL)
        ok(not r, 'icônes des 9 sorts dans l\'atlas' + (' (manquent : %r)' % r if r else ''))
        # un combat en rase campagne
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), w = g.world, foe = g.players[1], fc = g.cities[pl.fortress];
          pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          let at = null;
          for (let d = 3; d < 12 && !at; d++) for (let dx = -d; dx <= d && !at; dx++) for (const dy of [-d, d]) { const x = World.wx(w, fc.x + dx), y = fc.y + dy;
            if (!World.inY(w, y) || World.terr(w, 0, x, y) !== T.GRASS || Cities.at(g, 0, x, y) || Units.at(g, 0, x, y).length || World.get(w, 0, 'site', x, y) >= 0) continue;
            const nb = World.neighbors(w, x, y).find(([nx, ny]) => World.terr(w, 0, nx, ny) === T.GRASS && !Units.at(g, 0, nx, ny).length && !Cities.at(g, 0, nx, ny) && World.get(w, 0, 'site', nx, ny) < 0);
            if (nb) { at = [x, y, nb[0], nb[1]]; break; } }
          for (const t of ['OrcSwordsmen', 'OrcBowmen', 'OrcSpearmen', 'OrcCavalry']) Units.create(g, t, foe.id, 0, at[0], at[1]);
          const ids = ['HighMenSwordsmen', 'HighMenBowmen', 'HighMenSpearmen', 'HighMenCavalry'].map(t => Units.create(g, t, pl.id, 0, at[2], at[3]).id);
          for (const id of ids) g.units[id].moves = 2;
          Move.revealAllFor(g, pl); MapView.centerOn(at[0], at[1], 0);
          App.selectTile(0, at[2], at[3], ids); void App.moveSelected(at[0], at[1]); }""")
        await pg.wait_for_timeout(2200); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("!!CombatView.bt && CombatView.active"), 'le combat s\'ouvre')
        await idle(pg)
        # le Glas : visée 3 × 3, puis la zone marquée, la cloche et le compte à rebours
        r = await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide; bt.castThisRound[me] = false; bt.side = me; bt.skillLeft[me] = 999;
          const e = bt.alive(1 - me)[0]; CombatView.prepareCast('knell', null); CombatView.hover = { c: e.c, r: e.r };
          const z = [...CombatView.zoneOf('knell', e.c, e.r, 0)].length; return { z, c: e.c, r: e.r }; }""")
        await pg.wait_for_timeout(400); await pg.screenshot(path=os.path.join(SHOTS, '03173-glas-visee.png'))
        r = await pg.evaluate("""(t) => { const bt = CombatView.bt, me = CombatView.humanSide; const e = bt.alive(1 - me)[0];
          CombatView.useTarget({ c: e.c, r: e.r }, e); return { k: !!bt.knells[me], n: bt.knells[me] && bt.knells[me].tiles.length, why: CombatSpells.uselessWhy(bt, me, 'knell'), note: bt.terrainNotes(e.c, e.r, me).find(n => /Glas/.test(n)) || '' }; }""", r)
        ok(r['k'] and r['n'] >= 4 and r['why'] and 'Glas' in r['note'], 'le Glas est posé, un seul à la fois, la case le dit (%r)' % r)
        await pg.wait_for_timeout(900); await idle(pg); await pg.screenshot(path=os.path.join(SHOTS, '03173-glas.png'))
        # la Démence contagieuse : le porteur est marqué
        r = await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide; bt.castThisRound[me] = false; bt.side = me; bt.skillLeft[me] = 999;
          const e = bt.alive(1 - me).find(b => !b.confused); for (let i = 0; i < 12 && !e.confused; i++) { bt.castThisRound[me] = false; CombatSpells.cast(bt, me, 'contagious_madness', e, null, 0); }
          return { conf: !!e.confused, carrier: bt.madness[me] === e }; }""")
        ok(r['conf'] and r['carrier'], 'Démence contagieuse : l\'unité perd la raison et porte la démence (%r)' % r)
        await pg.wait_for_timeout(600); await pg.screenshot(path=os.path.join(SHOTS, '03173-demence.png'))
        # la liste des sorts de combat montre les nouveaux
        await pg.evaluate("(() => { const bt = CombatView.bt; bt.castThisRound[CombatView.humanSide] = false; bt.side = CombatView.humanSide; CombatView.spellMenu(); })()"); await pg.wait_for_timeout(500)
        txt = await pg.evaluate("document.querySelector('.modal') ? document.querySelector('.modal').innerText : ''")
        ok('Le Glas' in txt and 'Démence contagieuse' in txt, 'la liste des sorts de combat montre le Glas et la Démence')
        await pg.evaluate("UI.closeAll()")
        await pg.evaluate("(() => { if (CombatView.bt && !CombatView.auto) CombatView.toggleAuto(); })()")
        for _ in range(160):
            await pg.wait_for_timeout(250)
            if not await pg.evaluate("CombatView.active"): break
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        # Ennemi juré : le héros, puis le rival (une fenêtre de choix)
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
          const hs = Object.values(DATA.heroes).filter(h => !h.champion && h.unit !== 'HeroTorin' && !Object.values(g.units).some(u => u.type === h.unit));
          const a = Heroes.spawn(g, me, hs[0], fc.plane, fc.x, fc.y, 0), b = Heroes.spawn(g, foe, hs[1], fc.plane, fc.x, fc.y + 30, 0);
          me.metHeroes = { [b.id]: g.turn }; me.casting = null; me.skillLeft = 999; me.mana = 5000;
          UI.closeAll(); MagicUI.beginCast('sworn_enemy'); const m = [...document.querySelectorAll('.modal')].find(x => /perte/.test(x.innerText)); return { modal: !!m, txt: m ? m.innerText.slice(0, 200) : '', a: a.id, b: b.id }; }""")
        ok(r['modal'] and 'perte' in r['txt'], 'Ennemi juré : on choisit le héros rival (%s)' % r['txt'].replace('\n', ' | ')[:120])
        await pg.screenshot(path=os.path.join(SHOTS, '03173-serment.png'))
        await pg.evaluate("""(b) => { const el = [...document.querySelectorAll('.modal button, .modal .row, .modal .choice')].find(x => x.textContent.includes(App.game.units[b].hero.name)); if (el) el.click(); }""", r['b'])
        await pg.wait_for_timeout(500); await pg.evaluate("UI.closeAll()")
        r2 = await pg.evaluate("(r) => [App.game.units[r.a].sworn, App.game.units[r.b].sworn]", r)
        ok(r2[0] == r['b'] and r2[1] == r['a'], 'le serment lie les deux héros (%r)' % r2)
        # Réveil du charnier : le charnier est cerclé
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const spot = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, fc.plane, x, y) && !Units.at(g, fc.plane, x, y).length && !Cities.at(g, fc.plane, x, y));
          g.graves = { [fc.plane + ',' + spot[0] + ',' + spot[1]]: { n: 40, hero: true } }; me.casting = null; me.skillLeft = 999; MapView.bumpVis();
          MagicUI.beginCast('charnel_rising'); const T = MagicUI.targeting && MagicUI.targeting.tiles; return { n: T ? T.length : 0, spot, info: App.tileInfoHtml(fc.plane, spot[0], spot[1]) }; }""")
        ok(r['n'] >= 1 and 'Charnier' in r['info'], 'Réveil du charnier : le charnier est cerclé, la case le dit (%d)' % r['n'])
        await pg.wait_for_timeout(400); await pg.screenshot(path=os.path.join(SHOTS, '03173-charnier.png'))
        r = await pg.evaluate("""(s) => { const g = App.game, me = App.me(); const n0 = Units.at(g, 0, s[0], s[1]).length; MagicUI.pickTarget(App.game.cities[me.fortress].plane, s[0], s[1]); return Units.at(g, App.game.cities[me.fortress].plane, s[0], s[1]).filter(u => u.owner === me.id).length - n0; }""", r['spot'])
        ok(r >= 4, 'les morts se relèvent (%d unités)' % r)
        await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        # la Grande Inversion annoncée : la région sur la carte ; puis elle a lieu, et la fenêtre illustrée s'ouvre
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          let t = null; const forts = Object.values(g.cities).filter(c => c.fortress || g.players.some(o => o.fortress === c.id));
          for (let d = 6; d < 14 && !t; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const x = World.wx(g.world, fc.x + dx), y = fc.y + dy; if (World.inY(g.world, y) && forts.every(c => World.dist(g.world, c.x, c.y, x, y) > 3)) { t = { plane: fc.plane, x, y }; break; } }
          Novel.invAnnounce(g, g.players[1], t.x, t.y, t.plane); MapView.centerOn(t.x, t.y, t.plane); App.refresh(); return { t, info: App.tileInfoHtml(t.plane, t.x, t.y) }; }""")
        ok('Grande Inversion' in r['info'], 'la case annonce la Grande Inversion')
        await pg.wait_for_timeout(700); await pg.screenshot(path=os.path.join(SHOTS, '03173-inversion-annonce.png'))
        await pg.evaluate("""() => { const g = App.game; g.inversion.at = g.turn; Novel.invPerform(g); g.turn++; void App.eventPrompts(); }""")
        await pg.wait_for_timeout(1500)
        txt = await pg.evaluate("document.querySelector('.modal') ? document.querySelector('.modal').innerText : ''")
        img = await pg.evaluate("!!document.querySelector('.modal .lm-art img')")
        ok('Grande Inversion' in txt and img, 'la Grande Inversion a lieu : fenêtre illustrée')
        await pg.screenshot(path=os.path.join(SHOTS, '03173-inversion.png'))
        await pg.evaluate("UI.closeAll()")
        # la Trêve de Dieu : l'attaque est refusée, la prévision le dit
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), fc = g.cities[me.fortress]; me.casting = null; me.skillLeft = 999; me.mana = 5000;
          Spells.apply(g, me, 'truce_of_god', null);
          const spot = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, fc.plane, x, y) && !Units.at(g, fc.plane, x, y).length && !Cities.at(g, fc.plane, x, y));
          const foe = Units.create(g, 'OrcSpearmen', 1, fc.plane, spot[0], spot[1]);
          const nb = World.neighbors(g.world, spot[0], spot[1]).find(([x, y]) => !World.isWaterAt(g.world, fc.plane, x, y) && !Units.at(g, fc.plane, x, y).length && !Cities.at(g, fc.plane, x, y));
          const u = Units.create(g, 'HighMenSwordsmen', me.id, fc.plane, nb[0], nb[1]); u.moves = 2;
          const res = await Game.attack(g, [u.id], spot[0], spot[1], { auto: true });
          return { ok: res.ok, why: res.why || '' }; }""")
        ok(r['ok'] is False and 'Trêve' in r['why'], 'Trêve de Dieu : pas de bataille ce tour-ci (%s)' % r['why'])
        ok(not errs, 'aucune erreur de page' + (' : ' + ' | '.join(errs[:3]) if errs else ''))
        await b.close()
    srv.shutdown()
    if FAIL: raise SystemExit(1)

asyncio.run(main())
