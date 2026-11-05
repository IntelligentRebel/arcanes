"""Partie longue dans Chromium : l'IA joue aussi le camp humain, l'interface tourne pour de vrai
(combats animés en automatique, journal, sauvegardes). Puis capture des écrans de milieu de partie."""
import asyncio, os, sys, time
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
TURNS = int(sys.argv[1]) if len(sys.argv) > 1 else 80
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 77
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(600)
        await pg.evaluate("""(seed) => {
          window.AUTO_CHOICE = true; window.AUTO_COMBAT = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed, opponents: 3, human: { name: 'Morwen', portrait: 5, books: { nature: 5, sorcery: 5 }, retorts: ['sageMaster'], race: 'highelf' } });
          App.start(g); UI.closeAll();
          App.turnPrompts = async () => {};
          window._battles = 0; const old = Game.hooks.battle; Game.hooks.battle = (g2, bt, info) => { window._battles++; return old(g2, bt, info); };
        }""", SEED)
        t0 = time.time(); battles = 0
        for t in range(TURNS):
            await pg.evaluate("UI.closeAll()")
            await pg.evaluate("""async () => { const g = App.game; const pl = App.me();
              for (const c of Cities.ofPlayer(g, pl.id)) if (c.needsOrder) { c.needsOrder = false; c.prod = AI.chooseProduction(g, c) || c.prod; }
              if (pl.mustChooseResearch || !pl.researching) { pl.mustChooseResearch = false; pl.researching = AI.pickResearch(g, pl); }
              await AI.takeTurn(g, pl); }""")
            battles = await pg.evaluate("window._battles")
            await pg.evaluate("UI.closeAll()")
            await pg.evaluate("App.endTurn(true)")
            if await pg.evaluate("App.game.over"): break
            if t % 20 == 19:
                s = await pg.evaluate("(() => { const g = App.game; return g.players.map(p => p.name + ':' + Cities.ofPlayer(g, p.id).length + 'c/' + Object.values(g.units).filter(u => u.owner === p.id).length + 'u').join('  '); })()")
                print('T', await pg.evaluate("App.game.turn"), s, 'combats UI', battles, '%.0fs' % (time.time() - t0), flush=True)
        await pg.evaluate("UI.closeAll()")
        await pg.evaluate("() => { const pl = App.me(); const c = App.game.cities[pl.fortress] || Cities.ofPlayer(App.game, pl.id)[0]; if (c) MapView.centerOn(c.x, c.y, c.plane); }")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '20-late-map.png'))
        shots = [('21-cities', 'Panels.cities()'), ('22-armies', 'Panels.armies()'), ('23-wizards', 'Panels.wizards()'), ('24-magic', 'MagicUI.magic()'), ('25-book', 'MagicUI.spellbook()'),
                 ('26-city', 'void CityUI.open((App.game.cities[App.me().fortress] || Cities.ofPlayer(App.game, App.pid)[0]).id)'), ('27-ency', 'Panels.encyclopedia()'), ('28-items', 'Panels.items()')]
        for name, js in shots:
            await pg.evaluate("UI.closeAll()")
            try:
                await pg.evaluate(js)
            except Exception as ex:
                print('FAIL', name, ex); continue
            await pg.wait_for_timeout(350)
            await pg.screenshot(path=os.path.join(SHOTS, name + '.png'))
        await pg.evaluate("UI.closeAll()")
        print('SAVE', await pg.evaluate("(() => { const ok = App.save('manual'); return ok + ' ' + Math.round(App.serialize().length / 1024) + ' Ko'; })()"))
        print('LOAD', await pg.evaluate("(() => { const ok = App.load('manual'); return ok + ' turn ' + App.game.turn; })()"))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e[:300])
        await b.close()
asyncio.run(main())
