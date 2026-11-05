"""v0.15 : rendu des failles (deux plans), des sanctuaires et de la Brèche, en gros plan."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          Veil.thin(g, 45);
          for (const pp of [0, 1]) App.me().explored[pp].fill(1);
          Move.revealAllFor(g, App.me());
          window._r = Veil.rifts(g, 0)[0];
          MapView.invalidateVis(); MapView.bumpVis(); MapView.ts = 110; MapView.centerOn(_r.x, _r.y, 0);
        }""")
        await pg.wait_for_timeout(3000)
        await pg.evaluate("UI.closeAll()")
        await pg.screenshot(path=os.path.join(SHOTS, '135-rift-arcanus.png'), clip={'x': 300, 'y': 200, 'width': 600, 'height': 460})
        await pg.evaluate("App.togglePlane(); MapView.centerOn(_r.x, _r.y, 1)")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()")
        await pg.screenshot(path=os.path.join(SHOTS, '136-rift-myrror.png'), clip={'x': 300, 'y': 200, 'width': 600, 'height': 460})
        await pg.evaluate("(() => { const s = App.game.sites.find(x => x.type === 'shrine' && x.plane === 1); MapView.centerOn(s.x, s.y, 1); })()")
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, '137-shrine.png'), clip={'x': 300, 'y': 200, 'width': 600, 'height': 460})
        await pg.evaluate("(() => { const g = App.game; g.crisis.at = g.turn; Crisis.tick(g); const s = Crisis.site(g); if (s.plane !== MapView.plane) App.togglePlane(); MapView.centerOn(s.x, s.y, s.plane); MapView.invalidateVis(); MapView.bumpVis(); })()")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()")
        await pg.screenshot(path=os.path.join(SHOTS, '138-breach.png'), clip={'x': 300, 'y': 200, 'width': 600, 'height': 460})
        print('ERRORS', len(errors), errors[:5])
        await b.close()

asyncio.run(main())
