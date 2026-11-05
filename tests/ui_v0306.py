"""v0.30.6 : des ingénieurs pour toutes les races (Maison des bâtisseurs requise) ; ils entrent sur les montagnes et y bâtissent la route."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 33, opponents: 2, crisis: 'off', human: { name: 'Gorm', portrait: 0, books: { nature: 6 }, retorts: [], race: 'gnoll' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3000)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # 1. l'écran de la cité : ingénieurs grisés tant qu'il manque la Maison des bâtisseurs
        await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; delete c.buildings.buildersHall; CityUI.open(c.id); }")
        await pg.wait_for_timeout(600)
        row = "(() => { const r = [...document.querySelectorAll('.modal *')].filter(e => e.children.length < 6 && /Ingénieurs/.test(e.textContent) && e.textContent.length < 120).sort((a, b) => a.textContent.length - b.textContent.length)[0]; return r ? r.closest('[class]').textContent.replace(/\\s+/g, ' ').trim() : null; })()"
        await pg.evaluate("() => CityUI.chooseProduction('now', App.game.cities[App.me().fortress])"); await pg.wait_for_timeout(600)
        print('MODALES', await pg.evaluate("[...document.querySelectorAll('.modal h2, .modal .title')].map(e => e.textContent)"), await pg.evaluate("document.querySelectorAll('.modal .row').length"))
        print('SANS MAISON', await pg.evaluate(row), await pg.evaluate("[...document.querySelectorAll('.row.dis .t1')].map(e => e.textContent + ' : ' + e.nextSibling.textContent)"))
        await pg.screenshot(path=os.path.join(SHOTS, 'v0306_cite.png'))
        await pg.evaluate("UI.closeAll()")
        await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; c.buildings.buildersHall = true; CityUI.open(c.id); }")
        await pg.wait_for_timeout(600)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(400); await pg.evaluate("() => { CityUI.open(App.me().fortress); }"); await pg.wait_for_timeout(500); await pg.evaluate("() => CityUI.chooseProduction('now', App.game.cities[App.me().fortress])"); await pg.wait_for_timeout(600)
        print('AVEC MAISON', await pg.evaluate(row), '| constructible :', await pg.evaluate("Cities.canBuildUnit(App.game, App.game.cities[App.me().fortress], 'GnollEngineers')"))
        await pg.evaluate("UI.closeAll()")
        # 2. l'ingénieur gnoll : figurine, montagne, route
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          const u = Units.create(g, 'GnollEngineers', me.id, c.plane, c.x, c.y);
          const sprite = Sprites.resolve('unit:GnollEngineers');
          const ok = Move.mountainOK(g, [u], Move.groupInfo(g, [u])), spear = Units.create(g, 'GnollSpearmen', me.id, c.plane, c.x, c.y);
          const ok2 = Move.mountainOK(g, [spear], Move.groupInfo(g, [spear]));
          return { sprite, montagne: ok, lancier: ok2, nom: DATA.units[u.type].name, stats: [u.type, DATA.units[u.type].melee, DATA.units[u.type].cost].join(' ') }; }""")
        print('INGENIEUR', r)
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
