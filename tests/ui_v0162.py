"""v0.16.2 : pas de doublon de bâtiment dans la file, carte de premier contact, médaillon du sorcier (ouvre le grimoire)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Célestine', portrait: 11, books: { life: 10 }, retorts: ['charismatic'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()")
        # 1. file : la production en cours ne peut pas être ajoutée une seconde fois
        q = await pg.evaluate("""() => {
          const g = App.game, c = g.cities[App.me().fortress];
          const id = c.prod.id;
          const r1 = CityUI.enqueue(c, { type: 'building', id });
          const other = Cities.buildableBuildings(g, c).find(b => b !== id);
          CityUI.enqueue(c, { type: 'building', id: other });
          const r2 = CityUI.enqueue(c, { type: 'building', id: other });
          // passer en production un bâtiment déjà en file le retire de la file
          Cities.setProduction(g, c, { type: 'building', id: other });
          // ancienne sauvegarde abîmée : doublons nettoyés au chargement
          c.queue = [{ type: 'building', id: other }, { type: 'building', id }, { type: 'building', id }];
          Game.upgrade(g);
          return { prod: c.prod.id, refused: [r1, r2], queue: c.queue.map(x => x.id) };
        }""")
        print('QUEUE', q)
        await pg.evaluate("UI.closeAll(); void CityUI.open(App.game.cities[App.me().fortress].id)")
        await pg.wait_for_timeout(500)
        await pg.evaluate("void CityUI.chooseProduction()")
        await pg.wait_for_timeout(400)
        print('ROWS +file', await pg.evaluate("""(() => { const c = App.game.cities[App.me().fortress]; const rows = [...document.querySelectorAll('.modal .row')]; const cur = rows.find(r => r.classList.contains('sel')); return { current: cur && cur.querySelector('.t1').textContent, hasAdd: !!(cur && cur.querySelector('.qadd')) }; })()"""))
        await pg.evaluate("UI.closeAll()")
        # 2. premier contact
        await pg.evaluate("""() => {
          window.AUTO_CHOICE = false;
          const g = App.game, pl = App.me(), foe = g.players[1], w = g.world;
          const sc = Object.values(g.units).find(u => u.owner === pl.id && Units.isScout(u));
          let spot = null;
          for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, -3], [3, -3], [-3, 3]]) { const x = World.wx(w, sc.x + dx), y = sc.y + dy; if (World.inY(w, y) && !World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { spot = [x, y, dx, dy]; break; } }
          Units.create(g, 'HighMenSpearmen', foe.id, 0, spot[0], spot[1]);
          sc.moves = 6;
          App.selectTile(0, sc.x, sc.y, [sc.id]);
          void App.moveSelected(World.wx(w, sc.x + Math.sign(spot[2])), sc.y + Math.sign(spot[3]));
        }""")
        await pg.wait_for_timeout(2200)
        print('CONTACT', await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 200))"))
        await pg.screenshot(path=os.path.join(SHOTS, '150-contact.png'))
        await pg.evaluate("(() => { const b = [...document.querySelectorAll('.modal button')].find(b => /Continuer/.test(b.textContent)); if (b) b.click(); })()")
        await pg.wait_for_timeout(400)
        await pg.evaluate("UI.closeAll()")
        # 3. médaillon : progression d'un sort, clic = grimoire
        await pg.evaluate("(() => { const pl = App.me(); pl.casting = { id: pl.known.find(id => DATA.spells[id].overland) || pl.known[0], target: null, progress: 30, cost: 100 }; App.refresh(); })()")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, '151-medal.png'), clip={'x': 0, 'y': 0, 'width': 700, 'height': 140})
        await pg.click('#tb-medal')
        await pg.wait_for_timeout(500)
        print('MEDAL CLICK', await pg.evaluate("[...document.querySelectorAll('.modal header h2')].map(e => e.textContent)"))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
