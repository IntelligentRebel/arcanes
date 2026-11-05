"""Colon : aperçu d'une cité qui empiète sur une autre (cases partagées ½, étiquette), et case interdite."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(800)
        info = await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 7, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = App.me(), cap = g.cities[pl.fortress], w = g.world;
          const st = Object.values(g.units).find(u => u.owner === pl.id && Units.isSettler(u));
          Move.reveal(g, pl, 0, cap.x, cap.y, 9);
          // une case fondable dont la zone recoupe celle de la capitale
          let hv = null, best = 0;
          for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
            const x = World.wx(w, cap.x + dx), y = cap.y + dy;
            if (!Cities.canFoundAt(g, pl.id, 0, x, y).ok) continue;
            const s = Cities.siteInfo(g, pl.id, 0, x, y);
            if (s.shared > best) { best = s.shared; hv = { x, y }; }
          }
          App.selectTile(st.plane, st.x, st.y, [st.id]);
          MapView.ts = 88; MapView.centerOn(hv.x - 1, hv.y, 0); MapView.bumpVis();
          window._hv = hv; window._cap = cap;
          return { hv, shared: best, cap: [cap.x, cap.y] };
        }""")
        print('SETUP', info)
        await pg.wait_for_timeout(2600)
        await pg.evaluate("UI.closeAll(); MapView.hover = window._hv")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '60-overlap.png'))
        await pg.evaluate("MapView.hover = { x: window._cap.x + 1, y: window._cap.y }")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, '61-forbidden.png'))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
