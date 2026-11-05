"""v0.25.4 : zoom à la molette et cadrage au glisser sur le champ de bataille ; murailles qui arrêtent les tirs."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []; pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e) + ' ' + str(e.stack)[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 99, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'Morwen', portrait: 3, books: { chaos: 6, life: 4 }, retorts: [], race: 'orc' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("""() => { const g = App.game, pl = App.me(), foe = g.players[1], c = g.cities[foe.fortress];
          c.buildings.cityWalls = true; c.buildings.defenseTowers = true;
          for (const u of Units.at(g, c.plane, c.x, c.y)) Units.remove(g, u);
          const D = ['Spearmen', 'Bowmen'].map(t => Object.keys(DATA.units).find(k => DATA.units[k].race === foe.race && k.endsWith(t))).filter(Boolean).map(t => Units.create(g, t, foe.id, c.plane, c.x, c.y));
          const A = ['OrcSwordsmen', 'OrcBowmen', 'OrcShamans', 'BatteringRam'].map(t => Units.create(g, t, pl.id, c.plane, c.x, c.y));
          const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: pl.id, defenderPid: foe.id, plane: c.plane, x: c.x, y: c.y, city: c, rng: new RNG(5) });
          window._bt = bt; CombatView.run(g, bt, { city: c }); }""")
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1300)
        # 1. molette : zoom sur le point visé, qui reste sous le curseur
        before = await pg.evaluate("({ TW: CombatView.TW, g: CombatView.gridAt(1000, 600) })")
        await pg.mouse.move(1000, 600)
        for _ in range(4): await pg.mouse.wheel(0, -240); await pg.wait_for_timeout(60)
        after = await pg.evaluate("({ TW: CombatView.TW, g: CombatView.gridAt(1000, 600), zoom: CombatView.zoom })")
        print('ZOOM', round(before['TW'], 1), '->', round(after['TW'], 1), 'zoom', round(after['zoom'], 2), 'point fixe', [round(before['g']['c'], 2), round(before['g']['r'], 2)], [round(after['g']['c'], 2), round(after['g']['r'], 2)])
        await pg.screenshot(path=os.path.join(SHOTS, '300-zoom-in.png'))
        # 2. glisser : le plateau suit la souris ; un clic sans glisser sélectionne toujours
        f0 = await pg.evaluate("CombatView.focusNow()")
        await pg.mouse.move(800, 500); await pg.mouse.down(); await pg.mouse.move(700, 450, steps=6); await pg.mouse.up()
        f1 = await pg.evaluate("CombatView.focusNow()")
        print('GLISSER', [round(f0['c'], 2), round(f0['r'], 2)], '->', [round(f1['c'], 2), round(f1['r'], 2)])
        pos = await pg.evaluate("""() => { const u = window._bt.units.find(b => b.side === ATT_SIDE && b.u.type === 'OrcBowmen'); const P = CombatView.iso(u.c, u.r); return [P.x, P.y, u.id]; }""")
        await pg.mouse.click(pos[0], pos[1]); await pg.wait_for_timeout(200)
        print('CLIC', await pg.evaluate("CombatView.sel && CombatView.sel.u.type"), 'id', await pg.evaluate("CombatView.sel && CombatView.sel.id"), '==', pos[2])
        await pg.mouse.move(800, 470)
        for _ in range(6): await pg.mouse.wheel(0, 300); await pg.wait_for_timeout(60)
        print('DÉZOOM', round(await pg.evaluate("CombatView.zoom"), 2))
        await pg.screenshot(path=os.path.join(SHOTS, '301-zoom-out.png'))
        await pg.keyboard.press('0'); await pg.wait_for_timeout(100)
        print('RESET', await pg.evaluate("[CombatView.zoom, CombatView.focus]"))
        # 3. les archers dehors ne voient pas la garnison derrière la muraille
        print('TIR', await pg.evaluate("""() => { const bt = window._bt; const a = bt.units.find(b => b.u.type === 'OrcBowmen'); a.moves = 2; a.c = 8; a.r = 4;
          return bt.alive(DEF_SIDE).map(d => d.u.type + '@' + d.c + ',' + d.r + ' : ' + (bt.canShoot(a, d) ? 'visible' : 'à couvert')); }"""))
        print('ERRORS', len(errors))
        for e in errors[:6]: print('  ', e[:400])
        await b.close()

asyncio.run(main())
