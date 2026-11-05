"""v0.31.16 : les événements aléatoires ont leur fenêtre illustrée (assets/events/<id>.jpg), comme les grands ouvrages."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
EV = sys.argv[2] if len(sys.argv) > 2 else 'plague'


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(1500)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 21, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highelf' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        n = await pg.evaluate("""(ev) => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          g.turn = 30; Game.log(g, ev.endsWith('Moon') ? -1 : me.id, 'La peste frappe ' + c.name + '.', { city: c.id, event: ev }); g.log[g.log.length - 1].turn = 29;
          App.eventPrompts(); return document.querySelectorAll('.landmark-modal').length; }""", EV)
        await pg.wait_for_timeout(1500)
        print('fenêtres', n, await pg.evaluate("() => { const m = document.querySelector('.landmark-modal'); return m ? m.innerText.replace(/\\n+/g, ' | ') : 'aucune'; }"))
        await pg.screenshot(path=os.path.join(OUT, 'evenement_' + EV + '.png'))
        again = await pg.evaluate("() => { UI.closeAll(); App.eventPrompts(); return document.querySelectorAll('.landmark-modal').length; }")
        print('une seule fois :', again == 0)
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
