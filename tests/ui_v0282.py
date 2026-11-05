"""v0.28.2 : dénoncer un traité depuis l'écran des sorciers ; il prend fin 6 tours plus tard, et la guerre qui suit ne ternit pas la réputation."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1];
          me.contact[o.id] = o.contact[me.id] = true; Diplomacy.setState(g, me.id, o.id, 'peace'); Panels.wizards(o.id); }""")
        await pg.wait_for_timeout(500)
        btns = lambda: pg.evaluate("() => [...document.querySelectorAll('.modal .abtn')].map(b => b.textContent)")
        print('BOUTONS', await btns())
        await pg.click('.modal .abtn:has-text("Dénoncer")'); await pg.wait_for_timeout(300)
        print('CONFIRMATION', await pg.evaluate("() => [...document.querySelectorAll('.modal')].pop().innerText.replace(/\\n+/g, ' | ')"))
        await pg.click('.modal footer button:has-text("Dénoncer")'); await pg.wait_for_timeout(400)
        print('ÉTAT', await pg.evaluate("() => ({ fin: App.me().denounced[1], tour: App.game.turn, traité: App.me().diplo[1], relation: App.game.players[1].relations[0] })"))
        print('PANNEAU', await pg.evaluate("() => [...document.querySelectorAll('.modal .gold')].map(e => e.textContent).filter(t => /dénoncé/.test(t))"), await btns())
        await pg.click('.modal .abtn:has-text("Guerre")'); await pg.wait_for_timeout(300)
        print('GUERRE PENDANT', await pg.evaluate("() => [...document.querySelectorAll('.modal')].pop().innerText.replace(/\\n+/g, ' | ')"))
        await pg.click('.modal footer button:has-text("Annuler")'); await pg.wait_for_timeout(300)
        # six tours plus tard
        await pg.evaluate("() => { App.game.turn += 6; Diplomacy.denounceTick(App.game); UI.closeAll(); Panels.wizards(1); }"); await pg.wait_for_timeout(400)
        print('APRÈS 6 TOURS', await pg.evaluate("() => App.me().diplo[1]"), await btns())
        await pg.click('.modal .abtn:has-text("Guerre")'); await pg.wait_for_timeout(300)
        print('GUERRE APRÈS', await pg.evaluate("() => [...document.querySelectorAll('.modal')].pop().innerText.replace(/\\n+/g, ' | ')"))
        r2 = await pg.evaluate("() => App.game.players[2].relations[0]")
        await pg.click('.modal footer button:has-text("Confirmer")'); await pg.wait_for_timeout(400)
        print('TIERS AVANT/APRÈS', r2, await pg.evaluate("() => App.game.players[2].relations[0]"), 'traité', await pg.evaluate("() => App.me().diplo[1]"))
        await pg.evaluate("() => { const g = App.game; App.me().contact[2] = g.players[2].contact[0] = true; Diplomacy.setState(g, 0, 2, 'peace'); UI.closeAll(); Panels.wizards(2); }"); await pg.wait_for_timeout(400)
        await pg.click('.modal .abtn:has-text("Guerre")'); await pg.wait_for_timeout(300)
        print('GUERRE SANS DÉNONCER', await pg.evaluate("() => [...document.querySelectorAll('.modal')].pop().innerText.replace(/\\n+/g, ' | ')"))
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v0282_denonce.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
