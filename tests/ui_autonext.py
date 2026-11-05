"""Sélection : l'éclaireur seul en début de partie, puis passage automatique à l'unité suivante quand les mouvements sont épuisés
(déplacement simple et ordre sur plusieurs tours), et option pour le couper."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')

SEL = "(() => { const g = App.game; return App.sel ? App.sel.ids.map(id => g.units[id] ? g.units[id].type + '#' + id + (g.units[id].moves > 0 ? '' : '(0)') : '?') : null; })()"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()")
        print('START', await pg.evaluate(SEL), 'pile :', await pg.evaluate("App.sel && App.sel.all.length"))
        await pg.screenshot(path=os.path.join(SHOTS, '95-start-selection.png'))
        # l'éclaireur fait deux pas vers une case libre à 2 cases : ses mouvements sont épuisés
        r = await pg.evaluate("""() => {
          const g = App.game, u = g.units[App.sel.ids[0]], w = g.world;
          for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2]]) {
            const x = World.wx(w, u.x + dx), y = u.y + dy;
            if (y < 1 || y >= w.h - 1 || World.isWaterAt(w, 0, x, y) || World.terr(w, 0, x, y) === T.MOUNTAIN || Units.at(g, 0, x, y).length) continue;
            const path = Move.findPath(g, [u], 0, x, y, {});
            if (path && path.length && path[path.length - 1].cost <= u.moves) { window._mv = App.moveSelected(x, y); return [x, y, u.id]; }
          }
          return null;
        }""")
        print('SCOUT MOVE', r)
        await pg.wait_for_timeout(1400)
        print('AFTER SCOUT', await pg.evaluate(SEL))
        # ordre lointain (plusieurs tours) pour l'unité sélectionnée : elle marche, épuise ses mouvements, garde son ordre
        r2 = await pg.evaluate("""() => {
          const g = App.game, u = g.units[App.sel.ids[0]], w = g.world;
          let best = null;
          for (let y = 1; y < w.h - 1; y++) for (let x = 0; x < w.w; x++) {
            const d = World.dist(w, x, y, u.x, u.y);
            if (d < 5 || d > 8 || World.isWaterAt(w, 0, x, y) || Units.at(g, 0, x, y).length || Cities.at(g, 0, x, y)) continue;
            const path = Move.findPath(g, [u], 0, x, y, { noAttack: true });
            if (path && path.length && path[path.length - 1].cost > u.moves + 1) { best = [x, y]; break; }
          }
          if (!best) return null;
          window._first = u.id;
          window._mv = App.moveSelected(best[0], best[1]);
          return [u.type, best];
        }""")
        print('LONG ORDER', r2)
        await pg.wait_for_timeout(2500)
        print('WAITING', await pg.evaluate("App.unitsWaiting().map(u => u.type + '#' + u.id)"))
        print('AFTER LONG', await pg.evaluate(SEL), 'ordre gardé :', await pg.evaluate("(() => { const u = App.game.units[window._first]; return !!(u && u.path && u.path.length); })()"))
        # option coupée : la sélection reste sur l'unité
        await pg.evaluate("App.setPref('autoNext', false)")
        r3 = await pg.evaluate("""() => {
          const g = App.game; if (!App.sel) return null; const u = g.units[App.sel.ids[0]], w = g.world;
          for (const [dx, dy] of U.DIRS8) { const x = World.wx(w, u.x + dx), y = u.y + dy;
            if (World.isWaterAt(w, 0, x, y) || World.terr(w, 0, x, y) === T.MOUNTAIN || Units.at(g, 0, x, y).length || Cities.at(g, 0, x, y)) continue;
            u.moves = Math.min(u.moves, 1); window._mv = App.moveSelected(x, y); window._third = u.id; return u.type; }
          return null;
        }""")
        await pg.wait_for_timeout(1400)
        print('OPTION OFF', r3, await pg.evaluate("App.sel && App.sel.ids.includes(window._third)"))
        await pg.evaluate("App.setPref('autoNext', true)")
        await pg.evaluate("Panels.menu()")
        await pg.wait_for_timeout(300)
        print('MENU', await pg.evaluate("[...document.querySelectorAll('.modal .row .t1')].map(e => e.textContent).filter(t => /suivante/.test(t))"))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
