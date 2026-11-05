"""v0.26.6 : dans l'écran des objets magiques, un clic sur un héros ferme l'écran, centre la carte sur lui et le sélectionne.
Les essais d'IA en cours (armées taillées, harceleur) sont absents du jeu livré."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"), 'ESSAIS ACTIFS', await pg.evaluate("[AI.feat({ aiLevel: 'hardcore' }, 'tailor', 3), AI.feat({ aiLevel: 'hardcore' }, 'raid', 3), AI.feat({ aiLevel: 'hardcore' }, 'predator', 3)]"))
        # un héros loin de la capitale, seul sur sa case, et un second dans une pile
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          const far = World.neighbors(g.world, c.x, c.y).flatMap(([x, y]) => World.neighbors(g.world, x, y)).flatMap(([x, y]) => World.neighbors(g.world, x, y))
            .find(([x, y]) => World.dist(g.world, x, y, c.x, c.y) === 3 && !World.isWaterAt(g.world, c.plane, x, y) && !Units.at(g, c.plane, x, y).length && !Cities.at(g, c.plane, x, y));
          const h1 = Heroes.spawn(g, me, DATA.heroes.HeroRakir, c.plane, far[0], far[1]);
          Units.create(g, 'HighMenSwordsmen', me.id, c.plane, far[0], far[1]);
          MapView.centerOn(c.x, c.y, c.plane); App.selectTile(c.plane, c.x, c.y); App.refresh();
          return { hero: h1.id, x: far[0], y: far[1] }; }""")
        await pg.evaluate("() => Panels.items()"); await pg.wait_for_timeout(500)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'items_heroes.png'))
        names = await pg.evaluate("() => [...document.querySelectorAll('.hero-go .t1')].map(e => e.textContent)")
        print('HEROS CLIQUABLES', names)
        await pg.click('.hero-go >> text=' + names[-1] if names else '.hero-go'); await pg.wait_for_timeout(500)
        print('APRES CLIC', await pg.evaluate("""() => { const g = App.game; return { modale: !!document.querySelector('.modal'), cam: [Math.floor(MapView.camX), Math.floor(MapView.camY)],
          sel: App.sel && App.sel.ids.map(id => Units.label(g.units[id])) }; }"""), 'attendu', (r['x'], r['y']))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'items_goto.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
