"""v0.28.13 : un sort lancé sur la carte s'annonce en grand au centre (icône, royaume, effet), la carte se tourne vers sa cible."""
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
        # un sort qui demande plus d'un tour : Mur de feu sur la capitale, avec peu de compétence ce tour-ci
        await pg.evaluate("() => { const me = App.me(); me.known.push('wall_of_fire', 'heroism'); me.mana = 500; me.skillLeft = 5; MagicUI.doCast('wall_of_fire', { city: me.fortress }); }"); await pg.wait_for_timeout(400)
        print('EN COURS', await pg.evaluate("() => App.me().casting && App.me().casting.id"), 'carte', await pg.evaluate("() => !!document.querySelector('.spell-cast')"))
        for t in range(12):
            await pg.evaluate("() => { UI.closeAll(); App.endTurn(true); }")
            for _ in range(40):
                await pg.wait_for_timeout(250)
                if await pg.evaluate("() => !App.busy && !UI.busy"): break
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(500)
            if await pg.evaluate("() => !!document.querySelector('.spell-cast')"): break
        print('TOUR', await pg.evaluate("App.game.turn"), 'ANNONCE', await pg.evaluate("() => { const c = document.querySelector('.spell-cast'); return c && c.innerText.replace(/\\n+/g, ' | '); }"))
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v02813_sort.png'))
        await pg.wait_for_timeout(4200)
        print('DISPARUE', await pg.evaluate("() => !document.querySelector('.spell-cast')"))
        # un sort immédiat sur une unité
        await pg.evaluate("() => { const g = App.game, me = App.me(); me.skillLeft = 500; const u = Object.values(g.units).find(u => u.owner === me.id); MagicUI.doCast('heroism', { unit: u.id }); }"); await pg.wait_for_timeout(700)
        print('IMMÉDIAT', await pg.evaluate("() => { const c = document.querySelector('.spell-cast'); return c && c.innerText.replace(/\\n+/g, ' | '); }"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
