"""v0.18.0 : avertissement de pertes avant la fin du tour (famine), allocation automatique des fermiers."""
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
          const pl = App.me(), cap = g.cities[pl.fortress];
          cap.pop = 8200;
          for (let i = 0; i < 7; i++) { const u = Units.create(g, 'HighMenSpearmen', pl.id, 0, cap.x, cap.y); u.status = 'sentry'; }
          for (const u of Object.values(g.units)) if (u.owner === pl.id) u.status = 'sentry';
          cap.autoFarmers = false; cap.farmers = 0; // réglée à la main, au minimum
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        st = "(() => { const pl = App.me(); return { food: Players.goldPerTurn(App.game, pl).food, units: Object.values(App.game.units).filter(u => u.owner === pl.id).length, alert: document.querySelector('#tb-food').classList.contains('alert') }; })()"
        print('AVANT', await pg.evaluate(st))
        await pg.evaluate("void App.endTurn(true)")
        await pg.wait_for_timeout(700)
        print('DIALOGUE', await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.querySelector('h2').textContent + ' | ' + m.querySelector('.body').textContent.slice(0, 260) + ' | ' + [...m.querySelectorAll('footer button')].map(b => b.textContent).join(' / '))"))
        await pg.screenshot(path=os.path.join(SHOTS, '210-loss-warning.png'))
        units0 = await pg.evaluate("Object.values(App.game.units).filter(u => u.owner === App.pid).length")
        await pg.click('.modal footer button:has-text("Allouer les fermiers")')
        for _ in range(60):
            await pg.wait_for_timeout(300)
            if await pg.evaluate("!UI.busy && App.game.turn > 1"): break
        await pg.wait_for_timeout(500)
        print('APRES', await pg.evaluate(st), 'unités avant', units0, 'tour', await pg.evaluate("App.game.turn"))
        print('FAMINE AU JOURNAL', await pg.evaluate("App.game.log.filter(e => e.pid === App.pid && /Famine/.test(e.text)).length"))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
