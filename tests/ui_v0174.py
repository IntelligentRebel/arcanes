"""v0.17.4 : capitale prise, démantèlement de la forteresse en 10 tours, reprise rapide = retour accéléré."""
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
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        # une seconde cité, puis la capitale tombe aux mains d'un rival
        await pg.evaluate("""async () => {
          const g = App.game, pl = App.me(), cap = g.cities[pl.fortress];
          const other = Object.values(g.cities).find(c => c.owner !== pl.id && c.owner !== 1); other.owner = pl.id;
          window._cap = cap.id;
          for (const u of Units.at(g, cap.plane, cap.x, cap.y)) Units.remove(g, u);
          await Game.captureCity(g, cap, 1);
          g.turn++;
          App.refresh();
          void App.turnPrompts();
        }""")
        await pg.wait_for_timeout(800)
        print('MODALE', await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.querySelector('h2').textContent + ' | ' + m.textContent.slice(0, 420))"))
        await pg.screenshot(path=os.path.join(SHOTS, '170-fortress-fell.png'))
        await pg.click('.modal button:has-text("Voir")')
        await pg.wait_for_timeout(500)
        await pg.evaluate("UI.closeAll()")
        # fiche de l'ancienne capitale, tenue par l'ennemi
        await pg.evaluate("Panels.foreignCity(App.game.cities[window._cap])")
        await pg.wait_for_timeout(300)
        print('FICHE', await pg.evaluate("document.querySelector('.modal').textContent.slice(0, 300)"))
        await pg.evaluate("UI.closeAll()")
        # reprise deux tours après la chute
        r = await pg.evaluate("""async () => {
          const g = App.game, pl = App.me(), cap = g.cities[window._cap];
          g.turn++;
          window.AUTO_CHOICE = true;
          await Game.captureCity(g, cap, pl.id);
          window.AUTO_CHOICE = false;
          App.refresh();
          const c = pl.casting;
          return { banished: pl.banished, pct: c ? Math.round(c.progress / c.cost * 100) : null, target: c && c.target && g.cities[c.target.city].name, log: g.log.filter(e => e.pid === pl.id).slice(-2).map(e => e.text) };
        }""")
        print('REPRISE', r)
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '171-fortress-retaken.png'))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
