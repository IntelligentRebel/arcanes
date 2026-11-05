"""v0.28.9 : sources de la puissance magique, du mana et de l'entretien ; créatures invoquées repliables, la plus chère en tête."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:300]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, chaos: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          c.buildings.shrine = true; c.buildings.temple = true; me.globals.push('just_cause');
          c.ench.push({ spell: 'wall_of_fire', owner: me.id });
          for (const t of ['FireElemental', 'HellHounds', 'Efreet', 'HellHounds']) Units.create(g, t, me.id, c.plane, c.x, c.y);
          App.refresh(); }""")
        txt = lambda js: pg.evaluate("() => { const d = document.createElement('div'); d.innerHTML = " + js + "; return d.innerText.replace(/\\n+/g, ' | '); }")
        print('PUISSANCE', await txt("App.powerTip()"))
        print('MANA', await txt("MagicUI.manaTip(App.game, App.me())"))
        print('ENTRETIEN', await txt("MagicUI.upkeepTip(App.game, App.me())"), '| total moteur', await pg.evaluate("Magic.manaUpkeep(App.game, App.me())"))
        await pg.evaluate("MagicUI.magic()"); await pg.wait_for_timeout(400)
        print('REPLIÉ', await pg.evaluate("() => [...document.querySelectorAll('.modal h4')].map(e => e.innerText).filter(t => /invoquées/.test(t))"), 'lignes', await pg.evaluate("() => document.querySelectorAll('.modal .list.scroll .row').length"))
        await pg.click('.modal h4:has-text("créatures invoquées")'); await pg.wait_for_timeout(300)
        print('DÉPLIÉ', await pg.evaluate("() => [...document.querySelectorAll('.modal .list.scroll .row')].map(r => r.innerText.replace(/\\n+/g, ' · '))"))
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v0289_magie.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
