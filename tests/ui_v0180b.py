"""v0.18.0 : « Route vers… » : les ingénieurs empierrent tout un itinéraire."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


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
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), cap = g.cities[pl.fortress], w = g.world;
          for (const u of Object.values(g.units)) if (u.owner === pl.id) u.status = 'sentry';
          const ids = [0, 1, 2].map(() => Units.create(g, 'HighMenEngineer', pl.id, 0, cap.x, cap.y).id);
          // une destination à 4-5 cases, sur la terre ferme
          let dest = null;
          for (const [dx, dy] of [[5, 0], [-5, 0], [4, 3], [-4, 3], [0, 4], [3, -4]]) { const x = World.wx(w, cap.x + dx), y = cap.y + dy; if (World.inY(w, y) && !World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Cities.at(g, 0, x, y) && Move.findPath(g, [g.units[ids[0]]], 0, x, y, {})) { dest = [x, y]; break; } }
          App.selectTile(0, cap.x, cap.y, ids);
          App.startRoadTo(ids.map(id => g.units[id]));
          window._ids = ids; window._dest = dest;
          return { dest, mode: !!App.roadMode };
        }""")
        print('MODE', r)
        # clic sur la destination
        await pg.evaluate("(async () => { await App.clickTile(window._dest[0], window._dest[1], null); })()")
        await pg.wait_for_timeout(300)
        plan = await pg.evaluate("(() => { const u = App.game.units[window._ids[0]]; return { status: u.status, tiles: u.roadPlan && u.roadPlan.tiles.length, toast: [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).slice(-1)[0] }; })()")
        print('PLAN', plan)
        await pg.screenshot(path=os.path.join(SHOTS, '211-roadto-plan.png'))
        for t in range(40):
            await pg.evaluate("void App.endTurn(true)")
            for _ in range(60):
                await pg.wait_for_timeout(200)
                if await pg.evaluate("!UI.busy"): break
            await pg.evaluate("UI.closeAll()")
            st = await pg.evaluate("(() => { const g = App.game, u = g.units[window._ids[0]]; if (!u) return { gone: true }; const t = u.roadPlan ? u.roadPlan.tiles : null; return { turn: g.turn, at: [u.x, u.y], status: u.status, roads: t ? t.filter(([x, y]) => World.hasRoad(g.world, 0, x, y)).length + '/' + t.length : null }; })()")
            if t % 4 == 0 or st.get('status') != 'roadto': print('TOUR', st)
            if st.get('status') != 'roadto': break
        print('ROUTE FINIE', await pg.evaluate("(() => { const g = App.game, d = window._dest; return World.hasRoad(g.world, 0, d[0], d[1]); })()"), await pg.evaluate("App.game.log.filter(e => e.pid === App.pid && /Route achevée : /.test(e.text)).map(e => e.text)"))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
