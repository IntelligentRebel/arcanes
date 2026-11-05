"""v0.29.4 : la sauvegarde téléchargée tous les N tours (option du menu), et les animations des Hauts-Elfes (N32, N33)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True); pg = await ctx.new_page()
        errors = []; pg.on('pageerror', lambda e: (errors.append(str(e)), print('PAGEERROR', str(e)[:300], flush=True)))
        downloads = []; pg.on('download', lambda d: downloads.append(d.suggested_filename))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 31, opponents: 3, difficulty: 'hardcore', crisis: 'off', human: { name: 'Éloïne', portrait: 0, books: { nature: 6, life: 5 }, retorts: [], race: 'highelf' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"), flush=True)
        # le menu : l'option, coupée par défaut, puis activée sur 2 tours
        await pg.evaluate("Panels.menu()"); await pg.wait_for_timeout(300)
        print('LIGNE', await pg.evaluate("() => [...document.querySelectorAll('.modal .row')].map(r => r.innerText.replace(/\\n+/g, ' / ')).find(t => /téléchargée automatiquement/.test(t))"), flush=True)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0294_menu.png'))
        await pg.evaluate("() => { const i = [...document.querySelectorAll('.modal .row input[type=number]')][0]; i.value = 2; i.dispatchEvent(new Event('change')); }")
        await pg.evaluate("() => [...document.querySelectorAll('.modal .row')].find(r => /téléchargée automatiquement/.test(r.innerText)).click()"); await pg.wait_for_timeout(300)
        print('APRÈS CLIC', await pg.evaluate("() => [...document.querySelectorAll('.modal .row')].map(r => r.innerText.replace(/\\n+/g, ' / ')).find(t => /téléchargée automatiquement/.test(t))"), 'préférences', await pg.evaluate("JSON.stringify({ a: App.prefs.autoExport, n: App.prefs.autoExportN })"), flush=True)
        await pg.evaluate("UI.closeAll()")
        # quatre tours : deux téléchargements attendus (tours 2 et 4)
        for t in range(4):
            t0 = await pg.evaluate("App.game.turn")
            await pg.evaluate("() => { UI.closeAll(); App.endTurn(true); }")
            for k in range(240):
                await pg.wait_for_timeout(250)
                await pg.evaluate("() => { UI.closeAll(); for (const c of document.querySelectorAll('.spell-cast')) c.click(); }")
                if await pg.evaluate("App.game.turn") > t0 and not await pg.evaluate("!!UI.busy"): break
            print('  tour', await pg.evaluate("App.game.turn"), 'téléchargements', len(downloads), flush=True)
        await pg.wait_for_timeout(1500)
        print('TOUR', await pg.evaluate("App.game.turn"), 'TÉLÉCHARGEMENTS', downloads, flush=True)
        # les Hauts-Elfes animés
        print('ANIMÉS', await pg.evaluate("['Longbowmen', 'HighElfHalberdiers', 'HighElfCavalry', 'ElvenLord', 'HighElfMagician', 'Pegasai', 'HighElfSettlers', 'HighElfScouts', 'Trireme', 'Galley', 'Catapult'].map(k => k + ':' + !!(Anim.meta && Anim.meta[k])).join(' ')"), flush=True)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
