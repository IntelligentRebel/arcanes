"""v0.28.12 : V entoure en jaune les lieux jamais explorés, en violet ceux où l'on est entré sans les conquérir."""
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
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], p = c.plane;
          for (let k = 0; k < me.explored[p].length; k++) me.explored[p][k] = 1;
          const lairs = g.sites.filter(s => s.plane === p && Game.isLair(s) && !s.cleared).sort((a, b) => World.dist(g.world, a.x, a.y, c.x, c.y) - World.dist(g.world, b.x, b.y, c.x, c.y));
          // le plus proche : on y est entré, gardiens vus ; le suivant : jamais visité
          Game.noteSite(g, me.id, lairs[0]);
          MapView.centerOn(lairs[0].x, lairs[0].y, p); App.toggleLairs();
          return { repéré: [lairs[0].x - c.x, lairs[0].y - c.y], inexplorés: MapView.openLairs(g, me, p).length, repérés: MapView.scoutedLairs(g, me, p).length }; }""")
        print(r)
        await pg.wait_for_timeout(800)
        print('TOAST', await pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent).slice(-1)"))
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v02812_repaires.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
