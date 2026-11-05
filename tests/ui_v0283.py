"""v0.28.3 : Purification, sort d'Arcanes accessible à tous (case visée et ses huit voisines) ; icônes de Sceller une faille et de Purification."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        # un sorcier gnoll du chaos et de la mort : ni prêtres, ni chamanes, ni Vie, ni Nature
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { chaos: 6, death: 5 }, retorts: [], race: 'gnoll' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        print('À LA PORTÉE DE TOUS', await pg.evaluate("() => App.me().researchPool.includes('purify_land') || App.me().researchOptions.includes('purify_land')"))
        print('ICÔNES', await pg.evaluate("() => [Sprites.resolve('spell:purify_land'), Sprites.resolve('spell:seal_rift')]"))
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], w = g.world;
          window._t = { plane: c.plane, x: c.x + 2, y: c.y };
          for (const [x, y] of [[c.x + 2, c.y]].concat(World.neighbors(w, c.x + 2, c.y))) if (!World.isWaterAt(w, c.plane, x, y) && !Cities.at(g, c.plane, x, y)) World.set(w, c.plane, 'corrupt', x, y, 1);
          me.known.push('purify_land'); me.mana = 500; me.skill = 200; MapView.centerOn(c.x + 2, c.y, c.plane); App.refresh(); }""")
        await pg.wait_for_timeout(500)
        avant = await pg.evaluate("() => Spells.corruptAround(App.game, _t.plane, _t.x, _t.y).length")
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v0283_avant.png'))
        await pg.evaluate("() => { MagicUI.beginCast('purify_land'); MagicUI.pickTarget(_t.plane, _t.x, _t.y); }"); await pg.wait_for_timeout(600)
        print('TOAST', await pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent).slice(-2)"))
        for _ in range(3):
            if not await pg.evaluate("() => !!App.me().casting"): break
            await pg.evaluate("() => { UI.closeAll(); App.endTurn(true); }")
            for _ in range(40):
                await pg.wait_for_timeout(500)
                if await pg.evaluate("() => !App.busy && App.game.current === App.pid"): break
            await pg.evaluate("UI.closeAll()")
        print('TOUR', await pg.evaluate("App.game.turn"), 'journal', await pg.evaluate("() => App.game.log.filter(l => /purifi/.test(l.text || l.msg || '')).map(l => l.text || l.msg).slice(-2)"))
        print('CORROMPUES AVANT/APRÈS', avant, await pg.evaluate("() => Spells.corruptAround(App.game, _t.plane, _t.x, _t.y).length"), 'mana', await pg.evaluate("App.me().mana"))
        await pg.evaluate("() => { MagicUI.beginCast('purify_land'); MagicUI.pickTarget(_t.plane, _t.x, _t.y); }"); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { UI.closeAll(); MapView.centerOn(_t.x, _t.y, _t.plane); }"); await pg.wait_for_timeout(300)
        print('SANS CORRUPTION', await pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.textContent).slice(-1)"))
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v0283_apres.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
