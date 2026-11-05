"""v0.29.8 : la dette de la Mère des Essaims, avec les trois soldats choisis par le joueur."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: (errors.append(str(e)), print('PAGEERROR', str(e)[:300], flush=True)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'hard', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2200); await pg.evaluate("UI.closeAll()")
        # six soldats de niveaux différents, et une dette échue
        print(await pg.evaluate("""() => { const g = App.game, me = App.me(), f = g.cities[me.fortress];
          ['HighElfSpearmen', 'HighElfSwordsmen', 'HighElfHalberdiers', 'Longbowmen', 'HighElfCavalry', 'HighElfSpearmen'].forEach((t, i) => { const u = Units.create(g, t, 0, f.plane, f.x, f.y); u.xp = i * 30; });
          me.pacts = [{ entity: 'swarm', state: 'due', turn: 6, due: g.turn, data: { ids: [] } }];
          return Pacts.ENT.swarm.eligible(g, me).map(u => u.id + ':' + Units.label(u)).join(', '); }"""), flush=True)
        await pg.evaluate("() => { window._p = App.pactPrompts(); }"); await pg.wait_for_timeout(600)
        print('BOUTONS', await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].map(b => b.textContent).join(' | ')"), flush=True)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0298_dette.png'))
        await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].find(b => /Choisir/.test(b.textContent)).click()"); await pg.wait_for_timeout(500)
        # les trois plus forts : les trois dernières lignes
        await pg.evaluate("() => { const boxes = [...document.querySelectorAll('.modal .list input[type=checkbox]')]; boxes.slice(-4).forEach(b => b.click()); }"); await pg.wait_for_timeout(300)
        print('COMPTE', await pg.evaluate("() => [...document.querySelectorAll('.modal footer span')].map(s => s.textContent).join(' ')"), 'cochés', await pg.evaluate("document.querySelectorAll('.modal .list input:checked').length"), flush=True)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0298_choix.png'))
        chosen = await pg.evaluate("() => { const rows = [...document.querySelectorAll('.modal .list .row')]; return rows.filter(r => r.querySelector('input') && r.querySelector('input').checked).map(r => r.querySelector('.t1').textContent); }")
        print('CHOISIS', chosen, flush=True)
        before = await pg.evaluate("() => Pacts.ENT.swarm.eligible(App.game, App.me()).map(u => u.id)")
        await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Livrer').click()"); await pg.wait_for_timeout(600)
        after = await pg.evaluate("() => Pacts.ENT.swarm.eligible(App.game, App.me()).map(u => u.id)")
        print('LIVRÉS', [i for i in before if i not in after], 'sur', before, '· pacte', await pg.evaluate("App.me().pacts[0].state"), flush=True)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
