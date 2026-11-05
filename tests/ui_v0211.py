"""v0.21.1 : un double-clic sur la destination d'une route ne transforme plus l'ordre de route en ordre de marche."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = '/home/claude/arcanes'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto('file://' + ROOT + '/dist/arcanes/index.html'); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 6, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const e = Units.create(g, 'HighMenEngineer', me.id, fc.plane, fc.x, fc.y); e.moves = 2;
          for (const o of Units.at(g, fc.plane, fc.x, fc.y)) if (o !== e) o.status = 'sentry';
          App.selectTile(fc.plane, fc.x, fc.y, [e.id]);
          // cible : une case connue à 5 cases, sans eau
          let t = null; for (let d = 5; d <= 7 && !t; d++) for (const [dx, dy] of [[d,0],[-d,0],[0,d],[0,-d],[d,d],[-d,d]]) { const x = fc.x + dx, y = fc.y + dy; if (!World.isWaterAt(g.world, fc.plane, x, y) && Move.findPath(g, [e], fc.plane, x, y)) { t = [x, y]; break; } }
          App.startRoadTo([e]);
          const p1 = App.clickTile(t[0], t[1], null); await new Promise(r => setTimeout(r, 120)); await p1;
          await App.clickTile(t[0], t[1], null); await new Promise(r => setTimeout(r, 1500));
          return { status: e.status, path: e.path ? e.path.length : 0, pos: [e.x, e.y], from: [fc.x, fc.y], to: t, plan: e.roadPlan ? e.roadPlan.tiles.length : 0 }; }""")
        print('APRES DOUBLE-CLIC', r)
        # déroulé du chantier, tour par tour (travaux de fin de tour puis avancée des ingénieurs)
        log = await pg.evaluate("""async () => { const g = App.game, e = Object.values(g.units).find(u => u.status === 'roadto'), out = [];
          const tiles = e.roadPlan.tiles;
          for (let i = 0; i < 40 && e.status === 'roadto'; i++) { Turn.workRoad(g, e); e.moves = 2; await App.advanceRoads();
            out.push([e.x, e.y].join(',') + ':' + tiles.filter(([x, y]) => World.hasRoad(g.world, e.plane, x, y)).length); }
          return { steps: out.join(' '), status: e.status, done: tiles.every(([x, y]) => World.hasRoad(g.world, e.plane, x, y)), end: [e.x, e.y] }; }""")
        print('CHANTIER', log)
        print('ERRORS', len(errors), errors[:3])
        await b.close()
asyncio.run(main())
