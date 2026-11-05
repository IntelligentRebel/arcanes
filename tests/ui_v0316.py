"""v0.31.6 : l'infobulle d'un bâtiment dit ce qu'il permet de construire, avec les autres prérequis et leur état dans la cité,
et ce dont il n'est qu'une étape."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 21, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""() => { const g = App.game, c = g.cities[App.me().fortress];
          Object.assign(c.buildings, { buildersHall: true, smithy: true, barracks: true, library: true, granary: true, shrine: true, temple: true });
          c.queue = [{ type: 'building', id: 'sagesGuild' }];
          const strip = h => { const d = document.createElement('div'); d.innerHTML = h; return [...d.children].map(x => x.textContent); };
          return { marche: strip(CityUI.unlocksHtml('marketplace', c)), forge: strip(CityUI.unlocksHtml('smithy', c)), parthenon: strip(CityUI.unlocksHtml('parthenon', c)),
            ecuries: strip(CityUI.unlocksHtml('stables', c)), scierie: strip(CityUI.unlocksHtml('sawmill', c)), mer: Cities.seaAccess(g, c) }; }""")
        for k, v in r.items(): print(k, v)
        # dans le choix de production : l'infobulle du Marché
        await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; CityUI.chooseProduction(null, c); }"); await pg.wait_for_timeout(500)
        row = await pg.evaluate("() => { const r = [...document.querySelectorAll('.row')].find(x => /^Marché/.test((x.querySelector('.t1') || {}).textContent || '')); if (!r) return null; r.dispatchEvent(new MouseEvent('mouseenter')); return true; }")
        await pg.wait_for_timeout(300)
        print('LIGNE', row)
        await pg.screenshot(path=os.path.join(OUT, 'unlocks_marche.png'))
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
