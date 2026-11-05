"""v0.20.1 : sorts de combat sans cible grisés, et la raison au survol."""
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
          for (const id of ['star_fires', 'healing', 'raise_dead', 'holy_weapon']) if (!me.known.includes(id)) me.known.push(id);
          me.mana = 200;
          const A = [0, 1].map(() => Units.create(g, 'HighMenSpearmen', me.id, fc.plane, fc.x + 1, fc.y));
          const D = [0, 1].map(() => Units.create(g, 'OrcSpearmen', -1, fc.plane, fc.x + 1, fc.y));
          const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: -1, plane: fc.plane, x: fc.x + 1, y: fc.y, rng: new RNG(3) });
          CombatView.run(g, bt, {}); }""")
        await pg.wait_for_timeout(600)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1500)
        await pg.evaluate("CombatView.spellMenu()"); await pg.wait_for_timeout(400)
        rows = await pg.evaluate("[...document.querySelectorAll('.modal .row')].map(r => (r.classList.contains('dis') ? 'GRIS ' : 'ok   ') + r.querySelector('.t1').textContent)")
        for r in rows: print(r)
        row = await pg.query_selector("xpath=//div[contains(@class,'row')][.//div[contains(@class,'t1')][contains(., 'Feux stellaires')]]")
        await row.hover(); await pg.wait_for_timeout(400)
        print('SURVOL', await pg.evaluate("document.querySelector('#tooltip').textContent.slice(0, 140)"))
        await pg.screenshot(path=os.path.join(SHOTS, '242-spell-why-not.png'))
        for name in ['Guérison', 'Relever']:
            row = await pg.query_selector("xpath=//div[contains(@class,'row')][.//div[contains(@class,'t1')][contains(., '" + name + "')]]")
            await row.hover(); await pg.wait_for_timeout(300)
            print('SURVOL', name, await pg.evaluate("document.querySelector('#tooltip').textContent.slice(0, 90)"))
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
