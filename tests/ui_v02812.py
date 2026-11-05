"""v0.28.12 : « Purifier tout » : prêtres et chamanes vont d'eux-mêmes de terre corrompue en terre corrompue, celles des cités d'abord."""
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
        # trois terres corrompues dans la zone de la capitale, une hors zone ; un prêtre à la capitale
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], w = g.world, p = c.plane;
          for (let k = 0; k < me.explored[p].length; k++) me.explored[p][k] = 1;
          const land = [[1, 0], [0, 1], [-1, 1], [4, 0], [0, 4], [-4, 0], [0, -4], [1, 1], [-1, -1]].map(([dx, dy]) => [World.wx(w, c.x + dx), c.y + dy]).filter(([x, y]) => !World.isWaterAt(w, p, x, y));
          window._bad = land.slice(0, 4); for (const [x, y] of _bad) World.set(w, p, 'corrupt', x, y, 1);
          const u = Units.create(g, 'HighMenPriest', me.id, p, c.x, c.y); u.moves = Units.maxMoves(g, u); window._u = u;
          App.selectTile(p, c.x, c.y, [u.id]); App.refresh(); }""")
        await pg.wait_for_timeout(300)
        print('BOUTONS', await pg.evaluate("() => [...document.querySelectorAll('.actions .abtn')].map(b => b.textContent)"))
        await pg.click('.actions .abtn:has-text("Purifier tout")'); await pg.wait_for_timeout(800)
        left = lambda: pg.evaluate("() => _bad.filter(([x, y]) => World.get(App.game.world, _u.plane, 'corrupt', x, y)).length")
        print('DÉPART', await pg.evaluate("() => [_u.status, _u.purifyTarget]"), 'corrompues', await left())
        for t in range(16):
            await pg.evaluate("() => { UI.closeAll(); App.endTurn(true); }")
            for _ in range(40):
                await pg.wait_for_timeout(300)
                if await pg.evaluate("() => !App.busy && !UI.busy"): break
            await pg.evaluate("UI.closeAll()")
            st = await pg.evaluate("() => _u.status")
            print('tour', await pg.evaluate("App.game.turn"), 'statut', st, 'cible', await pg.evaluate("() => _u.purifyTarget"), 'restantes', await left())
            if st != 'autopurify': break
        print('FIN', await pg.evaluate("async () => { for (const [x, y] of _bad) World.set(App.game.world, _u.plane, 'corrupt', x, y, 0); for (let p = 0; p < 2; p++) for (let k = 0; k < App.game.world.w * App.game.world.h; k++) App.game.world.planes[p].corrupt[k] = 0; _u.moves = Units.maxMoves(App.game, _u); const r = await App.purifyStep([_u]); return [r, _u.status]; }"))
        print('JOURNAL', await pg.evaluate("() => App.game.log.filter(l => /purifi/.test(l.text || '')).map(l => 'T' + l.turn + ' ' + l.text).slice(-6)"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
