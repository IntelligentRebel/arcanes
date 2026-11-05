"""v0.31.0 : ouvrages de race. La recherche dans l'écran de recherche, l'ouvrage dans la liste de production de la cité,
les ouvrages des autres peuples absents des verrouillés, l'annonce à l'achèvement."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'dwarf' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # l'écran de recherche : la Forge-Mère proposée en plus des sorts
        await pg.evaluate("() => { MagicUI.research(false); }"); await pg.wait_for_timeout(500)
        print('RECHERCHE', await pg.evaluate("""() => [...document.querySelectorAll('.modal .row')].map(r => r.querySelector('.t1').textContent).filter(t => /Ouvrage/.test(t))"""))
        await pg.screenshot(path=os.path.join(OUT, 'ouvrage_recherche.png'))
        await pg.evaluate("UI.closeAll()")
        # recherche achevée : l'ouvrage dans la liste de production
        await pg.evaluate("() => { const g = App.game, me = App.me(); Magic.learn(g, me, 'lore_dwarf'); }")
        await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; CityUI.open(c.id); }"); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { CityUI.chooseProduction('now', App.game.cities[App.me().fortress]); }"); await pg.wait_for_timeout(500)
        r = await pg.evaluate("""() => { const t = document.body.innerText; return { forge: /Forge-Mère/.test(t), autres: ['Halle des Jarls', 'Ruche-Mère', 'Labyrinthe'].filter(n => t.includes(n)) }; }""")
        print('PRODUCTION', r)
        await pg.screenshot(path=os.path.join(OUT, 'ouvrage_production.png'))
        await pg.evaluate("UI.closeAll()")
        # achevé : l'annonce
        await pg.evaluate("() => { const g = App.game, me = App.me(), c = g.cities[me.fortress]; c.buildings.motherForge = true; Wonders.sync(g); c.lastDone = { type: 'building', id: 'motherForge', turn: g.turn }; App.landmarkPrompts(); }")
        await pg.wait_for_timeout(1500)
        print('ANNONCE', await pg.evaluate("""() => { const m = document.querySelector('.landmark-modal'); return m && [m.querySelector('.lm-kicker').textContent, m.querySelector('.lm-name').textContent, (m.querySelector('.lm-eff') || {}).textContent]; }"""))
        await pg.screenshot(path=os.path.join(OUT, 'ouvrage_annonce.png'))
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
