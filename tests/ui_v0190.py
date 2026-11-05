"""v0.19.0 : niveaux d'IA sans triche ; infobulle de difficulté, coalition visible dans l'écran des sorciers, sauvegarde « Impossible » convertie."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("Setup.newGame()")
        await pg.wait_for_timeout(400)
        print('OPTIONS', await pg.evaluate("[...document.querySelectorAll('select option')].filter(o => ['easy','normal','hard','hardcore'].includes(o.value)).map(o => o.textContent)"))
        lab = await pg.query_selector('xpath=//label[span[text()="Difficulté"]]')
        await lab.hover(); await pg.wait_for_timeout(350)
        print('TIP', await pg.evaluate("(document.querySelector('#tooltip, .tooltip, .tip') || {}).textContent"))
        await pg.screenshot(path=os.path.join(SHOTS, '227-difficulty-levels.png'))
        await pg.evaluate("UI.closeAll()")
        # partie en Difficile : un rival voit dans le joueur le meneur
        await pg.evaluate("""() => {
          document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 31, opponents: 3, difficulty: 'hard', crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3000)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(500); await pg.evaluate("UI.closeAll()")
        info = await pg.evaluate("""() => { const g = App.game, me = App.me();
          for (const o of g.players) if (o !== me) { me.contact[o.id] = o.contact[me.id] = true; for (const q of g.players) if (q !== o) o.contact[q.id] = true; }
          g.turn = 60;
          // le joueur écrase la partie : beaucoup de cités
          const free = Object.values(g.cities).filter(c => c.owner < 0); for (const c of free.slice(0, 8)) c.owner = me.id;
          const o = g.players[1]; const L = Diplomacy.leaderFor(g, o);
          return { levels: g.players.map(p => p.aiLevel || 'humain'), leader: L ? g.players[L.id].name : null };
        }""")
        print('COALITION', info)
        await pg.evaluate("Panels.wizards()")
        await pg.wait_for_timeout(500)
        print('SORCIERS', await pg.evaluate("[...document.querySelectorAll('.modal .box')].map(b => b.textContent).filter(t => t.includes('inquiète') || t.includes('menace commune')).length"))
        await pg.screenshot(path=os.path.join(SHOTS, '228-coalition.png'))
        await pg.evaluate("UI.closeAll()")
        # ancienne sauvegarde en « Impossible »
        print('UPGRADE', await pg.evaluate("""() => { const g = App.game; g.difficulty = 'impossible'; for (const p of g.players) delete p.aiLevel; Game.upgrade(g); return [g.difficulty, g.players.map(p => p.aiLevel || '-').join(',')]; }"""))
        # un tour complet avec les IA sans triche
        await pg.evaluate("window.AUTO_CHOICE = true; void App.endTurn(true)")
        await pg.wait_for_timeout(9000)
        print('TOUR', await pg.evaluate("App.game.turn"))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
