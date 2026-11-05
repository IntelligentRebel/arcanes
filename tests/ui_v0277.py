"""v0.27.7-8 : la résolution automatique est sans retour en cours de bataille (plus de « Reprendre la main ») ; « Rejouer manuellement » reste proposé à la fin."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        # des épéistes contre une petite bande de pillards, à côté de la capitale
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          const nb = World.neighbors(g.world, c.x, c.y).filter(([x, y]) => !World.isWaterAt(g.world, c.plane, x, y) && !Units.at(g, c.plane, x, y).length && World.get(g.world, c.plane, 'site', x, y) < 0);
          for (let i = 0; i < 3; i++) { const u = Units.create(g, 'HighMenSwordsmen', me.id, c.plane, nb[0][0], nb[0][1]); u.moves = Units.maxMoves(g, u); }
          Units.create(g, 'HighMenSpearmen', -1, c.plane, nb[1][0], nb[1][1]);
          App.selectTile(c.plane, nb[0][0], nb[0][1]); window._t = nb[1]; App.moveSelected(nb[1][0], nb[1][1]); }""")
        await pg.wait_for_timeout(1500)
        print('INTRO', await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].map(b => b.textContent)"))
        await pg.click('.modal footer button:has-text("Résolution automatique")'); await pg.wait_for_timeout(700)
        print('BOUTON', await pg.evaluate("() => { const b = [...document.querySelectorAll('.abtn')].find(b => /Automatique|Reprendre/.test(b.textContent)); return b && { texte: b.textContent, inactif: b.disabled }; }"))
        await pg.keyboard.press('a'); await pg.wait_for_timeout(200)
        print('TOUJOURS AUTO', await pg.evaluate("CombatView.auto"))
        for _ in range(60):
            await pg.wait_for_timeout(500)
            fin = await pg.evaluate("() => [...document.querySelectorAll('.modal')].map(m => m.innerText).find(t => /Victoire|Défaite/.test(t))")
            if fin: break
        print('FIN', await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].map(b => b.textContent)"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
