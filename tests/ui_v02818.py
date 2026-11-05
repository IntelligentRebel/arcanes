"""v0.28.18 : « Passer » (F) : l'unité ne fait rien ce tour, « Suivante » ne la propose plus, la fin du tour ne l'attend pas."""
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
        print('EN ATTENTE', await pg.evaluate("() => App.unitsWaiting().length"), 'BOUTONS', await pg.evaluate("() => [...document.querySelectorAll('.actions .abtn')].map(b => b.textContent).join(' | ')"))
        for _ in range(6):
            n = await pg.evaluate("() => App.unitsWaiting().length")
            if not n: break
            await pg.keyboard.press('f'); await pg.wait_for_timeout(250)
        print('APRÈS PASSER', await pg.evaluate("() => App.unitsWaiting().length"), 'fin du tour', await pg.evaluate("() => document.querySelector('#btn-end').textContent"))
        await pg.evaluate("() => { App.endTurn(true); }")
        for _ in range(40):
            await pg.wait_for_timeout(300)
            if await pg.evaluate("() => !App.busy && !UI.busy"): break
        await pg.evaluate("UI.closeAll()")
        print('TOUR SUIVANT', await pg.evaluate("App.game.turn"), 'en attente', await pg.evaluate("() => App.unitsWaiting().length"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
