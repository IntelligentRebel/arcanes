"""v0.31.16 : bandeaux illustrés des puissances du Voile (offre et échéance d'un pacte), de la forteresse tombée et de la fin de partie."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1366, 'height': 768})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(1500)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 21, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highelf' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        band = """() => { const m = [...document.querySelectorAll('.modal')].pop(); if (!m) return 'aucune fenêtre';
          const i = m.querySelector('.dil-art img, .end-art img'); return ((m.querySelector('.modal-title, h2, .title') || {}).innerText || '') + ' | ' + (i ? i.getAttribute('src') + ' ' + i.naturalWidth + 'x' + i.naturalHeight : 'sans image') + ' | hauteur ' + Math.round(m.getBoundingClientRect().height); }"""
        for e in ['usurer', 'swarm', 'archivist', 'ashes', 'faceless', 'mists']:
            await pg.evaluate("(e) => { const g = App.game, me = App.me(), c = g.cities[me.fortress]; App.answer({ type: 'pact', offer: Pacts.offer(g, me, e) }); }", e)
            await pg.wait_for_timeout(600)
            print('offre', e, await pg.evaluate(band))
            if e == 'archivist': await pg.screenshot(path=os.path.join(OUT, 'pacte_offre.png'))
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(150)
        # une échéance
        await pg.evaluate("""() => { const g = App.game, me = App.me(), o = Pacts.offer(g, me, 'ashes'); me.pacts = [{ entity: 'ashes', turn: 1, due: g.turn, state: 'due', data: Object.assign({}, o.boon) }]; App.pactPrompts(); }""")
        await pg.wait_for_timeout(700)
        print('échéance', await pg.evaluate(band)); await pg.screenshot(path=os.path.join(OUT, 'pacte_du.png'))
        await pg.evaluate("() => { App.me().pacts = []; UI.closeAll(); }"); await pg.wait_for_timeout(150)
        # forteresse tombée
        await pg.evaluate("() => { const me = App.me(); me.fallen = { city: me.fortress, by: 1 }; App.fallPrompt(); }")
        await pg.wait_for_timeout(700)
        print('forteresse', await pg.evaluate(band))
        await pg.evaluate("() => { App.me().fallen = null; UI.closeAll(); }"); await pg.wait_for_timeout(150)
        # fins de partie
        for why, win in [('conquest', True), ('mastery', True), ('mastery', False), ('defeat', False)]:
            await pg.evaluate("([why, win]) => { const g = App.game; g.over = true; g.overWhy = why; g.winner = win ? App.pid : (why === 'defeat' ? null : 1); App._overShown = null; App._overModal = null; App.gameOver(true); }", [why, win])
            await pg.wait_for_timeout(800)
            print('fin', why, win, await pg.evaluate(band))
            if why == 'mastery' and win: await pg.screenshot(path=os.path.join(OUT, 'fin_maitrise.png'))
            await pg.evaluate("() => { UI.closeAll(); App._overModal = null; }"); await pg.wait_for_timeout(150)
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
