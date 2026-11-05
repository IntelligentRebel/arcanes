"""v0.20.4 : portée des tirs adoucie, prévision du tir au survol d'une cible."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 6, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const A = [Units.create(g, 'HighMenBowmen', me.id, fc.plane, fc.x + 1, fc.y), Units.create(g, 'HighMenSpearmen', me.id, fc.plane, fc.x + 1, fc.y)];
          const D = [0, 1].map(() => Units.create(g, 'HighMenSpearmen', -1, fc.plane, fc.x + 1, fc.y));
          const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: -1, plane: fc.plane, x: fc.x + 1, y: fc.y, rng: new RNG(3) });
          window._bt = bt; CombatView.run(g, bt, {}); }""")
        await pg.wait_for_timeout(600)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1500)
        info = await pg.evaluate("""() => { const bt = _bt, a = bt.alive(0).find(b => b.u.type === 'HighMenBowmen'), d = bt.alive(1)[0];
          CombatView.sel = a; CombatView.reach = bt.reachable(a); CombatView.hover = { c: d.c, r: d.r }; CombatView.draw();
          const f = CombatAI.rangedForecast(bt, a, d, 2000); return { dist: bt.dist(a, d), can: bt.canShoot(a, d), dmg: f.dmg.toFixed(2), zero: Math.round(f.zero * 100), th: f.toHit }; }""")
        print('PREVISION', info)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, '243-shot-forecast.png'))
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
