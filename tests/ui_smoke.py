"""Test de fumée de l'interface dans Chromium headless : démarrage, nouvelle partie, écrans, fins de tour."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.evaluate("window.AUTO_CHOICE = false; window.AUTO_COMBAT = true")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=os.path.join(SHOTS, '01-title.png'))
        await pg.click('text=Nouvelle partie')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '02-newgame.png'))
        await pg.click('#ng-go')
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=os.path.join(SHOTS, '03-intro.png'))
        try:
            await pg.click('text=Commencer', timeout=4000)
        except Exception as ex:
            print('NO INTRO', ex.__class__.__name__)
            for e in errors[:30]: print(' ', e)
        await pg.wait_for_timeout(600)
        # fermer d'éventuelles modales (recherche)
        for _ in range(3):
            if await pg.locator('.overlay').count():
                await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(SHOTS, '04-map.png'))
        # écran de cité
        await pg.evaluate("void CityUI.open(App.me().fortress)")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '05-city.png'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.evaluate("MagicUI.spellbook()"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '06-book.png'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.evaluate("void MagicUI.research()"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '07-research.png'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # quelques tours (choix automatiques)
        await pg.evaluate("window.AUTO_CHOICE = true")
        for t in range(5):
            await pg.evaluate("void App.endTurn(true)")
            for _ in range(60):
                await pg.wait_for_timeout(250)
                busy = await pg.evaluate("UI.busy")
                n = await pg.locator('.overlay').count()
                if n:
                    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
                if not busy and not n: break
        await pg.screenshot(path=os.path.join(SHOTS, '08-turn6.png'))
        info = await pg.evaluate("({turn: App.game.turn, cities: Cities.ofPlayer(App.game, App.pid).length, units: Object.values(App.game.units).filter(u=>u.owner===App.pid).length})")
        print('INFO', json.dumps(info))
        print('ERRORS', len(errors))
        for e in errors[:30]: print(' ', e)
        await b.close()
asyncio.run(main())
