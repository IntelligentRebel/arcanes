"""v0.28.4 : la description des prêtres et chamanes dit qu'ils purifient (écran de cité)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        for t in ['HighMenPriest', 'HighMenMagician']:
            tip = await pg.evaluate("t => { const g = App.game, c = g.cities[App.me().fortress]; const d = document.createElement('div'); d.innerHTML = UI.unitTip({ type: t, ench: [], xp: 0, owner: c.owner, dmg: 0 }, g); return d.innerText.replace(/\\n+/g, ' | '); }", t)
            print(t, '→', tip)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
