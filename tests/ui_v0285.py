"""v0.28.5 : une cité amie pleine (9 unités) se traverse quand on en ressort dans le tour ; sinon l'unité attend le plein à côté."""
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
        # une route est-ouest à travers la capitale, des montagnes de part et d'autre ; 9 lanciers dans la cité
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], w = g.world, p = c.plane, X = dx => World.wx(w, c.x + dx);
          for (let dx = -5; dx <= 5; dx++) for (let dy = -2; dy <= 2; dy++) { if (!dx && !dy) continue; World.setTerr(w, p, X(dx), c.y + dy, dy ? T.MOUNTAIN : T.GRASS); World.set(w, p, 'road', X(dx), c.y + dy, dy ? 0 : 1); }
          for (const u of Object.values(g.units)) if (u.owner === me.id) delete g.units[u.id];
          for (let i = 0; i < 9; i++) Units.create(g, 'HighMenSpearmen', me.id, p, c.x, c.y);
          const a = Units.create(g, 'HighMenCavalry', me.id, p, X(-3), c.y); a.moves = Units.maxMoves(g, a);
          for (let k = 0; k < me.explored[p].length; k++) me.explored[p][k] = 1;
          window._c = c; window._a = a; MapView.invalidate(); MapView.invalidateVis(); MapView.centerOn(c.x, c.y, p); App.selectTile(p, a.x, a.y); App.refresh(); }""")
        await pg.wait_for_timeout(500)
        print('APERÇU', await pg.evaluate("""() => { const c = _c, path = Move.findPath(App.game, [_a], c.plane, World.wx(App.game.world, c.x + 3), c.y);
          return path.map(s => (s.x - c.x) + ',' + (s.y - c.y)).join(' ') + ' | tours ' + Move.stepTurns(_a.moves, Units.maxMoves(App.game, _a), path).join(','); }"""))
        await pg.evaluate("() => App.moveSelected(World.wx(App.game.world, _c.x + 3), _c.y)"); await pg.wait_for_timeout(2500)
        print('APRÈS UN TOUR', await pg.evaluate("() => [_a.x - _c.x, _a.y - _c.y, 'cité', Units.at(App.game, _c.plane, _c.x, _c.y).length]"))
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v0285_traverse.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
