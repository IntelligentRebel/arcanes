"""v0.17.8 : lignes fermiers / ouvriers, clic et glisser-déposer, aperçu au survol, effets affichés."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 6, chaos: 4 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const c = g.cities[App.me().fortress]; c.pop = 7400; c.autoFarmers = true; Cities.rebalanceFood(g, c.owner);
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(500); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("void CityUI.open(App.game.cities[App.me().fortress].id)")
        await pg.wait_for_timeout(600)
        st = "(() => { const e = Cities.econ(App.game, App.game.cities[App.me().fortress]); return { F: e.farmers, W: e.workers, min: e.minFarmers, prod: e.prod, surplus: e.foodSurplus, growth: e.growth }; })()"
        print('DEPART', await pg.evaluate(st))
        # survol d'un ouvrier : aperçu
        w = (await pg.query_selector_all('.crow.w .cz'))[0]; bb = await w.bounding_box()
        await pg.mouse.move(bb['x'] + 5, bb['y'] + 5); await pg.mouse.move(bb['x'] + 10, bb['y'] + 10); await pg.wait_for_timeout(300)
        print('APERCU', await pg.evaluate("document.querySelector('#tooltip').textContent"))
        # clic sur un ouvrier -> fermier
        await pg.mouse.click(bb['x'] + 10, bb['y'] + 10); await pg.wait_for_timeout(300)
        print('CLIC OUVRIER', await pg.evaluate(st), await pg.evaluate("[...document.querySelectorAll('.dchip')].map(d => d.textContent)"))
        await pg.screenshot(path=os.path.join(SHOTS, '196-citizens-click.png'))
        # glisser un fermier non indispensable vers les ouvriers
        fs = await pg.query_selector_all('.crow.f .cz:not(.need)')
        fb = await fs[-1].bounding_box(); wr = await (await pg.query_selector('.crow.w .ppl')).bounding_box()
        await pg.mouse.move(fb['x'] + 10, fb['y'] + 10); await pg.mouse.down()
        await pg.mouse.move(fb['x'] + 30, fb['y'] + 30, steps=4); await pg.mouse.move(wr['x'] + 60, wr['y'] + wr['height'] / 2, steps=8)
        await pg.wait_for_timeout(150)
        print('SURVOL CIBLE', await pg.evaluate("!!document.querySelector('.crow.w.drop')"))
        await pg.screenshot(path=os.path.join(SHOTS, '197-citizens-drag.png'))
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        print('GLISSER FERMIER', await pg.evaluate(st))
        # un fermier indispensable refuse de partir
        await pg.evaluate("(() => { const c = App.game.cities[App.me().fortress]; const e = Cities.econ(App.game, c); CityUI.setFarmers(c, e.minFarmers); })()")
        await pg.wait_for_timeout(300)
        need = await pg.query_selector('.crow.f .cz.need')
        if need:
            nb = await need.bounding_box(); await pg.mouse.click(nb['x'] + 10, nb['y'] + 10); await pg.wait_for_timeout(300)
        print('INDISPENSABLE', await pg.evaluate(st), await pg.evaluate("[...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).slice(-1)"))
        # clic sur la ligne des fermiers : un ouvrier y vient
        fr = await (await pg.query_selector('.crow.f .out')).bounding_box()
        await pg.mouse.click(fr['x'] + 5, fr['y'] + 5); await pg.wait_for_timeout(300)
        print('CLIC LIGNE', await pg.evaluate(st))
        await pg.screenshot(path=os.path.join(SHOTS, '198-citizens.png'), clip={'x': 150, 'y': 0, 'width': 1100, 'height': 420})
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
