"""v0.28.16 : pendant la visée d'un sort qui touche plusieurs cases, sa zone apparaît en filigrane sous le curseur."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:300]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], w = g.world, p = c.plane;
          for (const [dx, dy] of [[2, 0], [3, 1], [2, 1], [3, -1]]) { const x = World.wx(w, c.x + dx), y = c.y + dy; if (!World.isWaterAt(w, p, x, y)) World.set(w, p, 'corrupt', x, y, 1); }
          me.known.push('purify_land', 'enchant_road', 'earth_lore'); MapView.centerOn(c.x + 2, c.y, p); window._c = c; }""")
        for sid, dx in [('purify_land', 3), ('enchant_road', 0), ('earth_lore', 1)]:
            r = await pg.evaluate("""([sid, dx]) => { const g = App.game, c = _c; MagicUI.beginCast(sid); MapView.hover = { x: World.wx(g.world, c.x + dx), y: c.y };
              const a = Spells.areaOf(g, App.me(), sid, c.plane, MapView.hover.x, MapView.hover.y); return [a.tiles.length, a.hot.length, a.label]; }""", [sid, dx])
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v02816_' + sid + '.png'))
            print(sid, r)
            await pg.evaluate("MagicUI.cancelTarget()")
        print('UNE CASE', await pg.evaluate("() => Spells.areaOf(App.game, App.me(), 'corruption', 0, 1, 1)"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
