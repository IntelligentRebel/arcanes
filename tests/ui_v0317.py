"""v0.31.7 : tableau des cités triable (clic sur un en-tête, second clic : ordre inverse) ; infobulle de l'agitation : ce qui suffit à libérer un citoyen."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 21, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highelf' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # trois cités de plus, dont un village gnoll agité loin de la capitale
        made = await pg.evaluate("""() => { const g = App.game, me = App.me(), cap = g.cities[me.fortress], w = g.world, out = [];
          const races = ['gnoll', 'barbarian', 'halfling'];
          for (let r = 4, i = 0; r < 30 && i < 3; r += 3) for (const s of [1, -1]) { if (i >= 3) break; const x = World.wx(w, cap.x + s * r * (i === 0 ? 1 : 0.5) | 0), y = cap.y + (i === 0 ? 0 : s * 2);
            if (!World.inY(w, y) || World.isWaterAt(w, cap.plane, x, y) || Cities.at(g, cap.plane, x, y) || World.terr(w, cap.plane, x, y) === T.MOUNTAIN || (i === 0 && World.dist(w, cap.x, cap.y, x, y) <= 20)) continue;
            const c = Cities.create(g, me.id, races[i], cap.plane, x, y, { pop: [5700, 9000, 3000][i] }); out.push(c.name + ' ' + races[i] + ' d' + World.dist(w, cap.x, cap.y, x, y)); i++; }
          me.taxIdx = 2; return out; }""")
        print('CITES', made)
        await pg.evaluate("Panels.cities()"); await pg.wait_for_timeout(400)
        order = "() => [...document.querySelectorAll('.modal table.t tr')].slice(1).map(tr => tr.children[1].textContent.replace('★ ', ''))"
        print('DEFAUT (pop)', await pg.evaluate(order))
        click = "(lab) => { const th = [...document.querySelectorAll('.modal table.t th')].find(t => t.textContent.replace(/[ ▲▼]/g, '') === lab); th.click(); }"
        await pg.evaluate(click, 'Agit.'); await pg.wait_for_timeout(200)
        print('AGIT', await pg.evaluate(order), await pg.evaluate("() => [...document.querySelectorAll('.modal table.t tr')].slice(1).map(tr => tr.children[9].textContent)"))
        await pg.evaluate(click, 'Agit.'); await pg.wait_for_timeout(200)
        print('AGIT INVERSE', await pg.evaluate("() => [...document.querySelectorAll('.modal table.t tr')].slice(1).map(tr => tr.children[9].textContent)"))
        await pg.evaluate(click, 'Cité'); await pg.wait_for_timeout(200)
        print('NOM', await pg.evaluate(order), await pg.evaluate("() => document.querySelector('.modal th.sorted').textContent"))
        await pg.screenshot(path=os.path.join(OUT, 'tri_cites.png'))
        tip = await pg.evaluate("""() => { const g = App.game; let best = null; for (const c of Cities.ofPlayer(g, App.pid)) { const e = Cities.econ(g, c); if (!best || e.unrest > best[1].unrest) best = [c, e]; }
          const d = document.createElement('div'); d.innerHTML = CityUI.unrestTip(best[1], best[0]); return [best[0].name, best[1].unrest, best[1].unrestSum, [...d.children].map(x => x.textContent)]; }""")
        print('INFOBULLE', tip)
        print('RETENU', await pg.evaluate("() => localStorage.getItem('arcanes-citysort')"))
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
