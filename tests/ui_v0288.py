"""v0.28.8 : la renommée détaille ses sources (Juste cause, héros légendaires) ; les enchantements globaux affichent leur entretien."""
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
        await pg.evaluate("""() => { const g = App.game, me = App.me(); me.fame = 37; me.globals.push('just_cause', 'holy_arms');
          const h = Object.values(DATA.heroes).find(h => (DATA.units[h.unit].abilities || {}).legendary); const c = g.cities[me.fortress];
          if (h) { const u = Heroes.spawn(g, me, h, c.plane, c.x, c.y, 0); } App.refresh(); }""")
        print('BARRE', await pg.evaluate("() => document.querySelector('#tb-fame .v').textContent"), 'total', await pg.evaluate("Players.fame(App.game, App.me())"))
        print('INFO-BULLE', await pg.evaluate("() => { const d = document.createElement('div'); d.innerHTML = App.fameTip(); return d.innerText.replace(/\\n+/g, ' | ').slice(0, 260); }"))
        await pg.evaluate("MagicUI.magic()"); await pg.wait_for_timeout(500)
        print('GLOBAUX', await pg.evaluate("() => [...document.querySelectorAll('.modal .row')].filter(r => r.querySelector('.abtn.danger')).map(r => r.innerText.replace(/\\n+/g, ' | '))"))
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v0288_globaux.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
