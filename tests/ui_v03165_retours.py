"""v0.31.65 (remarques de Cor'e) : un bosquet en feu ne fait plus planter le dessin du combat (il appelait les flammes du Mur de
feu, qui l'écrasaient) ; le coût d'une
unité dans l'infobulle de la file ; le marché de sorts dit « l'équivalent de N RP ».
(0.31.66 : l'ajout des colons à 0 mouvement dans les unités en attente est retiré ; le test vérifie qu'ils n'y sont plus.)"""
import asyncio, os, sys, http.server, threading, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except (ConnectionResetError, BrokenPipeError): pass
async def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist', 'arcanes')))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(2500)
        await pg.evaluate("""() => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {}; Music.jingle = () => true;
          const g = Game.newGame({ seed: 4, mapW: 60, mapH: 40, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { chaos: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""() => ({ grove: CombatView.drawGroveFire && CombatView.drawGroveFire.length, wall: CombatView.drawFlames.length })""")
        ok(r['grove'] == 3 and r['wall'] == 2, 'les flammes du bosquet ont leur propre fonction : %r' % r)
        # colons à bout de mouvement sur une case où fonder
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          let spot = null; for (let d = 4; d < 12 && !spot; d++) for (let dx = -d; dx <= d && !spot; dx++) for (const dy of [-d, d]) { const x = World.wx(g.world, fc.x + dx), y = fc.y + dy; if (World.inY(g.world, y) && Cities.canFoundAt(g, me.id, 0, x, y).ok) { spot = [x, y]; break; } }
          const s = Units.create(g, 'HighMenSettlers', me.id, 0, spot[0], spot[1]); s.moves = 0;
          const a = App.unitsWaiting().includes(s);
          const s2 = Units.create(g, 'HighMenSpearmen', me.id, 0, spot[0], spot[1]); s2.moves = 0;
          return { a, b: App.unitsWaiting().includes(s2) }; }""")
        ok(not r['a'] and not r['b'], 'colons ou lancier à 0 mouvement : plus dans les unités en attente (%r)' % r)
        # coût d'une unité dans l'infobulle de la file
        t = await pg.evaluate("""() => { const c = App.game.cities[App.me().fortress]; return CityUI.itemTip(c, { type: 'unit', id: 'HighMenSpearmen' }); }""")
        ok('Coût de production' in t, "infobulle d'une unité en file : son coût")
        # un bosquet en feu dessiné sans planter (combat de test)
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          try { const bt = { fire: { '3,4': 3 }, props: { '3,4': { kind: 'tree', v: 1 } } }; const ctx = document.createElement('canvas').getContext('2d');
            const save = CombatView.ctx; CombatView.ctx = ctx; CombatView.TW = CombatView.TW || 80; CombatView.TH = CombatView.TW / 2; CombatView.ox = CombatView.ox || 400; CombatView.oy = CombatView.oy || 200;
            CombatView.drawGroveFire(3, 4, performance.now()); const mode = ctx.globalCompositeOperation; CombatView.ctx = save; return mode; } catch (e) { return 'ERR ' + e.message; } }""")
        ok(r == 'source-over', 'bosquet en feu dessiné, contexte rendu intact (%s)' % r)
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
    srv.shutdown()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
