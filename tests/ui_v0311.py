"""v0.31.1 : proposition d'alliance contre un tiers. L'adversaire visé a son encadré (ce qu'on sait de lui) et son bouton
pour voir sa capitale ou sa plus grande cité repérée ; inconnu, il reste anonyme."""
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
          const g = Game.newGame({ seed: 21, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # deux rivaux rencontrés, la capitale du second repérée
        setup = """(known) => { const g = App.game, me = App.me(), a = g.players[1], t = g.players[2];
          for (const p of [a, t]) { if (p.id === 2 && !known) continue; me.contact[p.id] = true; p.contact[me.id] = true; }
          if (!known) { delete me.contact[2]; delete t.contact[me.id]; }
          const fc = g.cities[t.fortress]; if (known) { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) Move.reveal(g, me, fc.plane, World.wx(g.world, fc.x + dx), fc.y + dy, 1); }
          Diplomacy.offer(g, me, { from: 1, kind: 'alliance', turn: g.turn, against: 2 });
          window._off = Diplomacy.offerFrom(g, me, 1); App.offerPrompt(window._off); return [t.name, fc.name]; }"""
        print('CIBLE', await pg.evaluate(setup, True)); await pg.wait_for_timeout(600)
        r = await pg.evaluate("""() => { const t = document.querySelector('.offer-target'); return t && { nom: t.querySelector('.offer-tname').textContent, faits: t.querySelectorAll('#offer-tintel > *').length, bouton: (t.querySelector('#offer-tgo') || {}).textContent,
          piedVisible: [...document.querySelectorAll('.contact-modal footer button')].filter(b => b.offsetParent).map(b => b.textContent) }; }""")
        print('ENCADRE', r)
        await pg.screenshot(path=os.path.join(OUT, 'alliance_cible.png'))
        await pg.set_viewport_size({'width': 1280, 'height': 720}); await pg.wait_for_timeout(300)
        print('720', await pg.evaluate("() => { const m = document.querySelector('.contact-modal').getBoundingClientRect(); return [Math.round(m.top), Math.round(m.bottom)]; }"))
        await pg.screenshot(path=os.path.join(OUT, 'alliance_720.png'))
        await pg.set_viewport_size({'width': 1400, 'height': 900}); await pg.wait_for_timeout(300)
        await pg.click('#offer-tgo'); await pg.wait_for_timeout(500)
        print('COUP D\'OEIL', await pg.evaluate("() => (document.querySelector('.peekbar') || {}).textContent"))
        await pg.click('.peekbar button'); await pg.wait_for_timeout(500)
        print('RETOUR', await pg.evaluate("() => !!document.querySelector('.offer-target')"))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Refuser'); b.click(); }"); await pg.wait_for_timeout(400)
        # cible jamais rencontrée : anonyme, rien de plus
        await pg.evaluate("() => { const g = App.game; for (const p of g.players) p.offers = []; App.me().offers = []; }")
        print('CIBLE INCONNUE', await pg.evaluate(setup, False)); await pg.wait_for_timeout(600)
        print('ENCADRE', await pg.evaluate("""() => { const t = document.querySelector('.offer-target'); return t && [t.querySelector('.offer-tname').textContent, t.querySelector('.dim') && t.querySelector('.dim').textContent, !!t.querySelector('#offer-tgo')]; }"""))
        await pg.screenshot(path=os.path.join(OUT, 'alliance_inconnu.png'))
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
