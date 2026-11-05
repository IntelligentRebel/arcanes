"""v0.28.6 : trajets comptés en tours ; conquête : fenêtre en haut, la cité centrée, sa zone et les cases partagées avec vos cités, ce que la raser rendrait."""
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
        # une cité rivale fondée à 3 cases de la capitale, sur des prairies
        info = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], w = g.world, p = c.plane;
          for (let dx = -2; dx <= 5; dx++) for (let dy = -2; dy <= 2; dy++) if (dx || dy) { World.setTerr(w, p, World.wx(w, c.x + dx), c.y + dy, T.GRASS); World.set(w, p, 'site', World.wx(w, c.x + dx), c.y + dy, -1); }
          for (let k = 0; k < me.explored[p].length; k++) me.explored[p][k] = 1;
          for (const [dx, dy] of [[1, 0], [1, 1], [2, -1], [2, 0], [2, 1], [1, -1]]) World.setTerr(w, p, World.wx(w, c.x + dx), c.y + dy, T.FOREST);
          World.set(w, p, 'mineral', World.wx(w, c.x + 2), c.y, Object.keys(DATA.minerals).indexOf('gold') + 1);
          const foe = Cities.create(g, 1, 'orc', p, World.wx(w, c.x + 3), c.y); foe.pop = 4000;
          window._foe = foe; const z = App.conquestZone(foe); return { zone: z.tiles.length, partagées: z.shared.size, gain: [z.food, z.prod, z.gold, z.pop], noms: z.names }; }""")
        print('ZONE', info)
        await pg.evaluate("() => { window._ans = App.answer({ type: 'conquer', city: _foe }); }"); await pg.wait_for_timeout(900)
        print('FENÊTRE', await pg.evaluate("() => [...document.querySelectorAll('.modal')].pop().innerText.replace(/\\n+/g, ' | ')"))
        print('POSITION', await pg.evaluate("() => { const r = [...document.querySelectorAll('.modal')].pop().getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }"))
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v0286_conquete.png'))
        await pg.click('.modal footer button:has-text("La raser")'); await pg.wait_for_timeout(300)
        print('RÉPONSE', await pg.evaluate("_ans"), 'zone effacée', await pg.evaluate("MapView.zone === null"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
