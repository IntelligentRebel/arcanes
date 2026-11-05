"""v0.18.7 : explications au survol des livres de magie et de la difficulté (écran de création)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("Setup.newGame()")
        await pg.wait_for_timeout(500)
        rows = await pg.query_selector_all('.bookrow')
        for i, name in [(0, 'vie'), (2, 'chaos'), (4, 'sorcellerie')]:
            await rows[i].hover(); await pg.wait_for_timeout(350)
            print(name.upper(), await pg.evaluate("(document.querySelector('#tooltip, .tooltip, .tip') || {}).textContent"))
            if i == 0: await pg.screenshot(path=os.path.join(SHOTS, '225-book-tip.png'))
        lab = await pg.query_selector('xpath=//label[span[text()="Difficulté"]]')
        await lab.hover(); await pg.wait_for_timeout(350)
        print('DIFF', await pg.evaluate("(document.querySelector('#tooltip, .tooltip, .tip') || {}).textContent"))
        await pg.screenshot(path=os.path.join(SHOTS, '226-difficulty-tip.png'))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
