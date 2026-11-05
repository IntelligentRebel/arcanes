"""v0.19.7 : tracé de route propre aux ingénieurs (longueur puis durée des travaux), aperçu de la route et de sa durée au survol."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        info = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          for (const pp of [0, 1]) me.explored[pp].fill(1);
          const e = Units.create(g, 'HighMenEngineer', me.id, fc.plane, fc.x, fc.y);
          // une destination à 7 cases ou plus, sur la terre ferme
          let t = null; for (let r = 7; r < 12 && !t; r++) for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, -3], [-r, 3]]) { const x = World.wx(g.world, fc.x + dx), y = fc.y + dy; if (y > 2 && y < g.world.h - 2 && !World.isWaterAt(g.world, fc.plane, x, y) && !Cities.at(g, fc.plane, x, y)) { t = [x, y]; break; } }
          App.selectTile(fc.plane, fc.x, fc.y, [e.id]); App.startRoadTo([e]); MapView.hover = { x: t[0], y: t[1] }; App.updatePathPreview(); MapView.centerOn(Math.round((fc.x + t[0]) / 2), Math.round((fc.y + t[1]) / 2), fc.plane); App.refresh(); MapView.draw();
          const walk = Move.findPath(g, [e], fc.plane, t[0], t[1]);
          return { t, preview: MapView.roadPreview && MapView.roadPreview.tiles.length, turns: MapView.roadPreview && MapView.roadPreview.turns, walk: walk && walk.length + 1, path: MapView.path }; }""")
        print('APERCU', info)
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '237-road-preview.png'))
        r = await pg.evaluate("""async () => { const t = MapView.hover; await App.clickTile(t.x, t.y, {}); const e = Object.values(App.game.units).find(u => u.type === 'HighMenEngineer' && u.owner === App.pid); return [e.status, e.roadPlan && e.roadPlan.tiles.length, !!MapView.roadPreview]; }""")
        print('ORDRE', r)
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
