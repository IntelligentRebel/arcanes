"""v0.31.73 : les sorts de départ se choisissent, comme dans Master of Magic. Après les livres et les dons, une fenêtre propose, royaume par
royaume, les sorts que les livres donnent d'office ; les places laissées vides sont tirées au hasard."""
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


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist', 'arcanes')))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(2500)
        await pg.evaluate("() => { Sfx.play = () => {}; Music.jingle = () => true; UI.closeAll(); Setup.newGame(); }")
        await pg.wait_for_timeout(600)
        # un sorcier de 6 livres de Vie et 5 de Nature : 2 communs et 2 peu communs de Nature, 2 communs, 2 peu communs et 1 rare de Vie
        r = await pg.evaluate("""() => { const btn = document.querySelector('#ng-go'); const books = document.querySelectorAll('.bookrow'); return { go: !!btn, rows: books.length }; }""")
        ok(r['go'] and r['rows'] == 5, 'l\'écran de création est ouvert')
        # le sorcier prédéfini choisi par défaut, puis « Commencer la partie » : la fenêtre des sorts de départ
        await pg.click('#ng-go'); await pg.wait_for_timeout(500)
        txt = await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ¦ ')")
        ok('Sorts de départ' in txt and 'Communs' in txt, 'la fenêtre des sorts de départ s\'ouvre')
        n = await pg.evaluate("document.querySelectorAll('.spick .s').length")
        ok(n >= 10, 'les sorts proposés, avec leur icône (%d)' % n)
        await pg.screenshot(path=os.path.join(SHOTS, '03173-sorts-depart.png'))
        # on choisit les deux premiers sorts de la première rareté
        picked = await pg.evaluate("""() => { const cards = [...document.querySelectorAll('.spick')][0].querySelectorAll('.s'); cards[0].click(); return 1; }""")
        await pg.wait_for_timeout(200)
        picked = await pg.evaluate("""() => { const cards = [...document.querySelectorAll('.spick')][0].querySelectorAll('.s'); cards[1].click(); return [...document.querySelectorAll('.spick')][0].querySelectorAll('.s.on').length; }""")
        names = await pg.evaluate("""() => [...[...document.querySelectorAll('.spick')][0].querySelectorAll('.s.on .t1')].map(e => e.textContent)""")
        ok(picked >= 1, 'les sorts se choisissent (%r)' % names)
        # Commencer : la partie démarre, les sorts choisis sont connus
        await pg.evaluate("""() => { const b = [...document.querySelectorAll('.modal button')].find(x => /Commencer la partie/.test(x.textContent) && x.closest('.modal').innerText.includes('Sorts de départ')); b.click(); }""")
        for _ in range(40):
            await pg.wait_for_timeout(500)
            if await pg.evaluate("!!(App.game && App.me())"): break
        r = await pg.evaluate("(names) => { const me = App.me(); const known = me.known.map(id => DATA.spells[id] && DATA.spells[id].name); return { all: names.every(n => known.includes(n)), known: known.length }; }", names)
        ok(r['all'], 'la partie commence avec les sorts choisis (%r)' % r)
        ok(not errs, 'aucune erreur de page' + (' : ' + ' | '.join(errs[:3]) if errs else ''))
        await b.close()
    srv.shutdown()
    if FAIL: raise SystemExit(1)

asyncio.run(main())
