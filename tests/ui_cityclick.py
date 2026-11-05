"""Clic sur une cité : la cité s'ouvre (la garnison en sentinelle reste en sentinelle) ; clic sur la figurine : la garnison est sélectionnée ;
double-clic sur la cité avec une pile sélectionnée ailleurs : la pile y va. Plus l'éclaireur animé sur la carte."""
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
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()")
        print('SCOUT ANIMATED', await pg.evaluate("Anim.has('HighMenScouts')"))
        # garnison en sentinelle, rien de sélectionné
        info = await pg.evaluate("""() => {
          const g = App.game, c = g.cities[App.me().fortress];
          for (const u of Units.at(g, c.plane, c.x, c.y)) if (u.owner === App.pid && !Units.isScout(u)) u.status = 'sentry';
          App.deselect(); MapView.centerOn(c.x, c.y, c.plane); MapView.bumpVis();
          const P = MapView.tileToScreen(c.x, c.y), ts = MapView.ts;
          window._c = c;
          return { city: [P.x + ts * .72, P.y + ts * .45], unit: [P.x + ts * .2, P.y + ts * .3] };
        }""")
        await pg.wait_for_timeout(300)
        STATUS = "Units.at(App.game, _c.plane, _c.x, _c.y).filter(u => u.owner === App.pid).map(u => u.status || '-').join(',')"
        print('TARGET', await pg.evaluate("(() => { const el = document.elementFromPoint(%f, %f); return el && (el.id || el.className || el.tagName); })()" % tuple(info['city'])), await pg.evaluate("JSON.stringify(MapView.screenToTile(%f, %f)) + ' ' + _c.x + ',' + _c.y" % tuple(info['city'])), 'sel', await pg.evaluate("!!App.sel"))
        await pg.mouse.click(*info['city'])
        await pg.wait_for_timeout(700)
        print('CLICK CITY -> open', await pg.evaluate("CityUI.cur != null"), 'sel', await pg.evaluate("!!App.sel"), 'statuts', await pg.evaluate(STATUS))
        await pg.evaluate("UI.closeAll()")
        await pg.wait_for_timeout(300)
        await pg.mouse.click(*info['unit'])
        await pg.wait_for_timeout(700)
        print('CLICK UNIT -> open', await pg.evaluate("CityUI.cur != null"), 'sel', await pg.evaluate("App.sel && App.sel.ids.length"))
        await pg.screenshot(path=os.path.join(SHOTS, '96-city-unit-click.png'))
        # une pile sélectionnée hors de la cité : simple clic sur la cité = ouverture différée ; double-clic = la pile y rentre
        await pg.evaluate("""() => {
          const g = App.game, c = _c, sc = Object.values(g.units).find(u => u.owner === App.pid && Units.isScout(u));
          const w = g.world;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]) { const x = World.wx(w, c.x + dx), y = c.y + dy;
            if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length) { sc.x = x; sc.y = y; break; } }
          UI.closeAll(); App.selectTile(sc.plane, sc.x, sc.y); window._sc = sc.id;
        }""")
        await pg.wait_for_timeout(300)
        await pg.mouse.click(*info['city'])
        await pg.wait_for_timeout(700)
        print('SEL ELSEWHERE + CLICK CITY -> open', await pg.evaluate("CityUI.cur != null"))
        await pg.evaluate("UI.closeAll()")
        await pg.wait_for_timeout(300)
        await pg.evaluate("App.selectTile(App.game.units[_sc].plane, App.game.units[_sc].x, App.game.units[_sc].y)")
        await pg.mouse.dblclick(*info['city'])
        await pg.wait_for_timeout(1200)
        print('DBLCLICK CITY -> open', await pg.evaluate("CityUI.cur != null"), 'éclaireur dans la cité', await pg.evaluate("(() => { const u = App.game.units[_sc]; return u.x === _c.x && u.y === _c.y; })()"))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
