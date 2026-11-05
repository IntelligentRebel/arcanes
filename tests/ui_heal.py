"""Sorts de soin sur la carte : Soins de campagne (case), Guérison (pile), refus sans blessé ; le grimoire les liste."""
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
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 6, chaos: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = App.me(); for (const id of ['field_healing', 'healing']) if (!pl.known.includes(id)) pl.known.push(id);
          pl.mana = 300; pl.skillLeft = 300;
          const c = g.cities[pl.fortress]; window._c = c;
          window._us = Units.at(g, c.plane, c.x, c.y).filter(u => u.owner === pl.id).map(u => u.id);
        }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()")
        HP = "window._us.map(id => { const u = App.game.units[id]; return Units.health(App.game, u) + '/' + Units.stats(App.game, u).maxHp; }).join(' ')"
        await pg.evaluate("MagicUI.spellbook()")
        await pg.wait_for_timeout(400)
        await pg.evaluate("[...document.querySelectorAll('button, .tab, [role=tab], div')].filter(b => /^Sorts spéciaux/.test(b.textContent.trim())).pop().click()")
        await pg.wait_for_timeout(300)
        print('GRIMOIRE', await pg.evaluate("document.body.textContent.match(/Soins de campagne|Guérison de masse|Guérison/g)"))
        await pg.screenshot(path=os.path.join(SHOTS, '105-spellbook-heal.png'))
        await pg.evaluate("UI.closeAll()")
        # sans blessé : refus
        await pg.evaluate("MagicUI.beginCast('field_healing'); MagicUI.pickTarget(_c.plane, _c.x, _c.y)")
        await pg.wait_for_timeout(300)
        print('REFUS', await pg.evaluate("[...document.querySelectorAll('.toast')].map(t => t.textContent).slice(-1)"))
        await pg.evaluate("for (const id of window._us) { const u = App.game.units[id]; u.dmg = Units.stats(App.game, u).maxHp - 1; } App.me().skillLeft = 300")
        print('AVANT', await pg.evaluate(HP))
        await pg.evaluate("UI.closeAll(); MagicUI.beginCast('field_healing'); MagicUI.pickTarget(_c.plane, _c.x, _c.y)")
        await pg.wait_for_timeout(500)
        print('SOINS DE CAMPAGNE', await pg.evaluate(HP))
        await pg.evaluate("UI.closeAll(); App.me().skillLeft = 300; MagicUI.beginCast('healing'); MagicUI.pickTarget(_c.plane, _c.x, _c.y)")
        await pg.wait_for_timeout(500)
        print('GUERISON', await pg.evaluate(HP))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
