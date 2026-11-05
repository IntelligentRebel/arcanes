"""v0.28.7 : la renommée en mots dans la barre du haut ; l'info-bulle donne le chiffre et ce qu'elle rapporte."""
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
        for f in [0, 7, 25, 85, 200]:
            await pg.evaluate("f => { App.me().fame = f; App.refresh(); }", f); await pg.wait_for_timeout(150)
            barre = await pg.evaluate("() => document.querySelector('#tb-fame .v').textContent")
            tip = await pg.evaluate("() => { const d = document.createElement('div'); d.innerHTML = App.fameTip(); return d.innerText.replace(/\\n+/g, ' | '); }")
            print(f, '→', barre, '||', tip)
        await pg.evaluate("() => { App.me().fame = 85; App.refresh(); }")
        await pg.hover('#tb-fame'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v0287_renommee.png'), clip={'x': 300, 'y': 0, 'width': 1100, 'height': 330})
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
