"""v0.17.9 : le « ! » d'une quête de héros s'explique au survol et au clic."""
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
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        site = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), cap = g.cities[pl.fortress];
          const h = Object.values(DATA.heroes).find(x => x.unit === 'HeroValana');
          const u = Heroes.spawn(g, pl, h, 0, cap.x, cap.y);
          const s = g.sites.filter(s => s.plane === 0 && Game.siteHasGuardians(s) && s.type !== 'node').sort((a, b) => World.dist(g.world, a.x, a.y, cap.x, cap.y) - World.dist(g.world, b.x, b.y, cap.x, cap.y))[0];
          u.hero.quest = { type: 'slay', site: s.id, n: 0, count: 0 };
          Move.revealAllFor(g, pl); MapView.centerOn(s.x, s.y, 0); App.refresh();
          return [s.x, s.y];
        }""")
        pos = await pg.evaluate("""([x, y]) => { for (let sy = 60; sy < innerHeight; sy += 4) for (let sx = 0; sx < innerWidth - 320; sx += 4) { const el = document.elementFromPoint(sx, sy); if (!el || el.id !== 'map') continue; const t = MapView.screenToTile(sx, sy); if (t.x === x && t.y === y) return [sx + 30, sy + 14]; } return null; }""", site)
        await pg.mouse.move(pos[0] - 40, pos[1]); await pg.mouse.move(pos[0], pos[1]); await pg.wait_for_timeout(700)
        print('SURVOL', await pg.evaluate("(() => { const t = document.querySelector('#tooltip'); return t.style.display !== 'none' ? t.textContent : null; })()"))
        await pg.screenshot(path=os.path.join(SHOTS, '202-quest-tip.png'))
        await pg.mouse.click(pos[0], pos[1]); await pg.wait_for_timeout(500)
        print('PANNEAU', await pg.evaluate("[...document.querySelectorAll('#side .card')].map(c => c.textContent).join(' | ').slice(0, 500)"))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
