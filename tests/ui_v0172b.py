"""v0.17.2 : une attaque subie pendant le tour des sorciers rivaux ne reste pas masquée par le voile d'attente."""
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
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()")
        await pg.wait_for_timeout(800)
        await pg.evaluate("UI.closeAll()")
        # un héros rival attaque la capitale pendant l'intertour (voile d'attente affiché)
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), foe = g.players[1], w = g.world, cap = g.cities[pl.fortress];
          pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          let spot = null;
          for (const [x, y] of World.neighbors(w, cap.x, cap.y)) if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { spot = [x, y]; break; }
          const u = Units.create(g, 'HeroBahgtru', foe.id, 0, spot[0], spot[1]); u.moves = 2;
          UI.setBusy('Les sorciers rivaux préparent leurs desseins…');
          window._done = false;
          Game.attack(g, [u.id], cap.x, cap.y).then(() => { window._done = true; });
        }""")
        await pg.wait_for_timeout(1500)
        print('VOILE pendant intro', await pg.evaluate("!document.querySelector('#busy').hidden"))
        # le joueur choisit de commander la bataille (vrai clic)
        print('MODALES intro', await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 80))"))
        await pg.click('.modal button:has-text("Commander la bataille")')
        await pg.wait_for_timeout(800)
        top = await pg.evaluate("(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && (e.id || e.tagName) + ' busyHidden=' + document.querySelector('#busy').hidden; })()")
        print('CENTRE', top)
        print('MODALES', await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 160))"))
        await pg.screenshot(path=os.path.join(SHOTS, '162-defense-ai-turn.png'))
        # un vrai clic sur Automatique doit passer
        await pg.click('#c-bar button:has-text("Automatique")')
        for _ in range(120):
            await pg.wait_for_timeout(250)
            if await pg.evaluate("window._done || (CombatView.finished)"):
                break
        await pg.wait_for_timeout(500)
        await pg.evaluate("(() => { for (const bt of document.querySelectorAll('.modal button')) if (/Continuer|Fermer|OK/.test(bt.textContent)) { bt.click(); break; } })()")
        for _ in range(40):
            await pg.wait_for_timeout(250)
            if await pg.evaluate("window._done"):
                break
        print('FIN', await pg.evaluate("({ done: window._done, active: CombatView.active, veil: !document.querySelector('#busy').hidden })"))
        await pg.evaluate("UI.setBusy(null)")
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
