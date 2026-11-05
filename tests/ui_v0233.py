"""v0.23.3 : l'expérience gagnée et les promotions s'affichent à la fin d'une bataille."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []; pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 6, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const A = ['HighMenSwordsmen', 'HighMenSwordsmen', 'HighMenSpearmen'].map(k => Units.create(g, k, me.id, fc.plane, fc.x + 1, fc.y));
          A[0].xp = 19; A[1].xp = 5; A[2].xp = 58;
          const h = Units.create(g, 'HeroTorin', me.id, fc.plane, fc.x + 1, fc.y); h.hero = { name: 'Aurévan', title: 'Élu', extra: {} }; h.xp = 58; A.push(h);
          const D = [Units.create(g, 'GnollSpearmen', -1, fc.plane, fc.x + 1, fc.y)];
          const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: -1, plane: fc.plane, x: fc.x + 1, y: fc.y, rng: new RNG(3) });
          CombatView.run(g, bt, {}); }""")
        await pg.wait_for_timeout(700)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Résolution')); btn && btn.click(); }""")
        for _ in range(60):
            await pg.wait_for_timeout(400)
            t = await pg.evaluate("(document.querySelector('.modal h2, .modal h3, .modal .title') || {}).textContent || ''")
            if 'Victoire' in t or 'Défaite' in t: break
        print('FIN', await pg.evaluate("document.querySelector('.modal').innerText.replace(/\\n+/g, ' | ').slice(0, 400)"))
        await pg.screenshot(path=os.path.join(SHOTS, '263-battle-xp.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
