"""v0.21.2 : avancement visible des chantiers de route (barre sous la case, ligne dans le panneau, info de case)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 12, opponents: 1, difficulty: 'easy', crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 6, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); window._iv = setInterval(() => { if (UI.modals.length) UI.closeAll(); }, 200); }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("""async () => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          for (const o of Object.values(g.units)) if (o.owner === me.id) o.status = 'sentry';
          const e = Units.create(g, 'HighMenEngineer', me.id, fc.plane, fc.x, fc.y); e.moves = 2; window._e = e;
          const f = Units.create(g, 'HighMenEngineer', me.id, fc.plane, fc.x, fc.y - 2); f.status = 'road'; window._f = f;
          App.selectTile(fc.plane, fc.x, fc.y, [e.id]);
          App.startRoadTo([e]); await App.clickTile(fc.x - 4, fc.y, null); }""")
        for _ in range(3):
            await pg.evaluate("App.endTurn(true)")
            await pg.wait_for_timeout(200)
            await pg.wait_for_function("!UI.busy", timeout=60000)
        await pg.evaluate("() => { clearInterval(_iv); UI.closeAll(); const e = _e; App.selectTile(e.plane, e.x, e.y, [e.id]); MapView.centerOn(e.x - 1, e.y - 1); MapView.hover = { x: e.x, y: e.y }; App.refresh(); }")
        await pg.wait_for_timeout(600)
        print('ETAT', await pg.evaluate("[_e.x + ',' + _e.y, _e.status, _f.status, JSON.stringify(App.game.world.planes[_e.plane].roadWork)]"))
        print('PANNEAU', await pg.evaluate("[...document.querySelectorAll('#sel .gold')].map(d => d.textContent)"))
        print('CASE', await pg.evaluate("document.querySelector('#tileinfo').textContent.slice(0, 120)"))
        await pg.screenshot(path=os.path.join(SHOTS, '252-road-progress.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
