"""v0.30.0 : la chronique de la partie (courbes, moments clés, grandes batailles) et l'écran de fin de partie."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        # une partie jouée par l'IA pendant 60 tours, puis reprise par le joueur
        print(await pg.evaluate("""async () => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true; window.AUTO_CHOICE = true;
          const g = Game.newGame({ seed: 11, mapW: 60, mapH: 40, opponents: 3, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { chaos: 6, death: 5 }, retorts: [], race: 'highelf' } });
          const me = g.players[0]; me.human = false;
          for (let i = 0; i < 60 && !g.over; i++) { try { await AI.takeTurn(g, me); } catch (e) { } await Turn.endTurn(g); }
          me.human = true; App.start(g); UI.closeAll();
          return 'tour ' + g.turn + ', ' + g.chron.rows.length + ' relevés, ' + g.chron.ev.length + ' moments, ' + g.chron.battles.length + ' batailles'; }"""))
        await pg.wait_for_timeout(1500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        await pg.keyboard.press('j'); await pg.wait_for_timeout(500)
        print('MODALE', await pg.evaluate("document.querySelector('.modal header h2').textContent"))
        print('COURBES', await pg.evaluate("document.querySelector('.modal .body').innerText.slice(0, 300).replace(/\\n+/g, ' | ')"))
        # survol d'un repère
        box = await pg.evaluate("(() => { const s = document.querySelector('.modal svg'); const r = s.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()")
        await pg.mouse.move(box[0] + box[2] * 0.7, box[1] + box[3] * 0.5); await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0300_courbes.png'))
        for k in ['Armée', 'Cités', 'Habitants']:
            await pg.evaluate("(k) => [...document.querySelectorAll('.modal .tab')].find(t => t.textContent === k).click()", k); await pg.wait_for_timeout(200)
            print(k, await pg.evaluate("document.querySelectorAll('.modal svg path[stroke-dasharray]').length"), 'courbes ;', await pg.evaluate("[...document.querySelectorAll('.modal .body .dim')].pop().textContent.slice(0, 90)"))
        await pg.evaluate("[...document.querySelectorAll('.modal .tab')].find(t => t.textContent === 'Moments clés').click()"); await pg.wait_for_timeout(300)
        print('MOMENTS', await pg.evaluate("document.querySelector('.modal .list').innerText.split('\\n').slice(-12).join(' | ')"))
        await pg.screenshot(path=os.path.join(SHOTS, 'v0300_moments.png'))
        await pg.evaluate("[...document.querySelectorAll('.modal .tab')].find(t => t.textContent === 'Grandes batailles').click()"); await pg.wait_for_timeout(300)
        print('BATAILLES', await pg.evaluate("document.querySelector('.modal .list').innerText.split('\\n').slice(0, 8).join(' | ')"))
        await pg.screenshot(path=os.path.join(SHOTS, 'v0300_batailles.png'))
        # fin de partie : la fenêtre, le classement, la courbe révélée ; « Voir la carte » puis Entrée la rouvre
        await pg.evaluate("UI.closeAll(); App.game.over = true; App.game.winner = 1; App.game.overWhy = 'conquest'; App.gameOver()"); await pg.wait_for_timeout(400)
        print('FIN', await pg.evaluate("document.querySelector('.modal .body').innerText.slice(0, 400).replace(/\\n+/g, ' | ')"))
        await pg.screenshot(path=os.path.join(SHOTS, 'v0300_fin.png'))
        await pg.evaluate("[...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Voir la carte').click()"); await pg.wait_for_timeout(200)
        print('FERMÉE', await pg.evaluate("UI.modals.length"))
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        print('ROUVERTE', await pg.evaluate("document.querySelector('.modal header h2') && document.querySelector('.modal header h2').textContent"))
        await pg.evaluate("[...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Chronique complète').click()"); await pg.wait_for_timeout(300)
        print('RÉVÉLÉE', await pg.evaluate("document.querySelectorAll('.modal')[1].querySelectorAll('svg path[stroke-dasharray]').length"), 'courbes')
        await pg.screenshot(path=os.path.join(SHOTS, 'v0300_revelee.png'))
        # l'encyclopédie : les sorts du Livre cachés tant qu'aucun fragment n'est lu, visibles ensuite
        livre = "() => { Panels.encyclopedia(); const t = [...document.querySelectorAll('.modal .tab')].find(t => t.textContent === 'Sorts'); t.click(); const txt = [...document.querySelectorAll('.modal')].pop().innerText; UI.closeAll(); return ['Rature', 'Palimpseste', 'Deus ex machina'].filter(n => txt.includes(n)); }"
        await pg.evaluate("() => { UI.closeAll(); App.game.over = false; App._overShown = null; App._overModal = null; for (const f of App.game.book.frags) f.read = f.read.filter(p => p !== App.pid); }")
        print('LIVRE AVANT', await pg.evaluate(livre))
        await pg.evaluate("() => { App.game.book.frags[0].read.push(App.pid); }")
        print('LIVRE APRES', await pg.evaluate(livre))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
