"""v0.31.48 : portraits animés. Le portrait bouge (magie qui pulse, clignement) à l'écran de nouvelle partie (le sorcier choisi),
dans la diplomatie et au premier contact ; le portrait du bandeau reste fixe ; l'option du menu les fige ; aucun vaincu ne s'anime."""
import asyncio, os, sys, threading, http.server, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
SIG = """(sel) => { const c = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; }"""

async def changes(pg, sel, n=12, gap=250):
    seen = set()
    for _ in range(n):
        seen.add(await pg.evaluate(SIG, sel)); await pg.wait_for_timeout(gap)
    return len(seen)

def serve():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Q, directory=os.path.join(ROOT, 'dist', 'arcanes'))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]

async def main():
    port = serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(1500)
        # 1. nouvelle partie : le sorcier choisi s'anime, les autres non
        await pg.evaluate("() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Setup.newGame ? Setup.newGame() : Setup.open(); }")
        await pg.wait_for_timeout(1200)
        await pg.evaluate("() => { const w = document.querySelectorAll('.wizpick .w')[3]; w && w.click(); }"); await pg.wait_for_timeout(1500)
        on = await changes(pg, '.wizpick .w.on canvas')
        off = await changes(pg, '.wizpick .w:not(.on) canvas', 6)
        ok(on > 2, 'le sorcier choisi s\'anime (%d images différentes)' % on)
        ok(off == 1, 'les autres restent fixes sans survol (%d)' % off)
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v03148_choix.png'))
        await pg.evaluate("() => UI.closeAll()")
        # 2. une partie : bandeau fixe, diplomatie et premier contact animés
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 6, mapW: 60, mapH: 40, opponents: 3, otherPlane: 0, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'Éloïne', portrait: 9, books: { nature: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        ok(await changes(pg, '#tb-medal canvas', 8) == 1, 'le portrait du bandeau reste fixe')
        await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players.filter(p => p !== me); me.contact[o[0].id] = true; me.contact[o[1].id] = true;
          o[1].alive = false; Panels.wizards(); }""")
        await pg.wait_for_timeout(800)
        cards = await pg.evaluate("() => [...document.querySelectorAll('.modal canvas.portrait')].length")
        a = await pg.evaluate("() => document.querySelectorAll('.modal canvas.portrait')[0]") is not None
        first = await changes(pg, '.modal .list > .box:nth-child(2) canvas.portrait')
        ok(first > 2, 'diplomatie : un sorcier en lice s\'anime (%d)' % first)
        dead = await pg.evaluate("""() => { const c = [...document.querySelectorAll('.modal .list > .box')].pop().querySelector('canvas.portrait'); return !!c && !PortraitAnim.live.has(c); }""")
        ok(dead, 'diplomatie : le vaincu reste figé')
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v03148_diplo.png'))
        await pg.evaluate("UI.closeAll()")
        # 3. option du menu : tout se fige
        await pg.evaluate("App.setPref('animPortraits', false); Panels.wizards();"); await pg.wait_for_timeout(800)
        ok(await changes(pg, '.modal .list > .box:nth-child(2) canvas.portrait', 8) == 1, 'option coupée : portraits figés')
        await pg.evaluate("App.setPref('animPortraits', true); UI.closeAll();")
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
