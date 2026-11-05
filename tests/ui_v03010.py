"""v0.30.10 : grand ouvrage achevé (Relais de magie) : l'annonce au centre, une fois, avec l'illustration si elle est là,
sinon l'icône dans un halo ; elle passe avant l'écran de la cité qui demande la suite."""
import asyncio, os, shutil, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # le relais s'achève dans la capitale, file vide : fin de tour
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          c.buildings.shrine = true; c.queue = []; c.prod = { type: 'building', id: 'magicRelay' }; c.progress = 99999;
          const pr = App.endTurn ? null : null; return c.name; }""")
        print('CAPITALE', r)
        await pg.evaluate("() => { App.game.players.forEach(p => { if (!p.human) p.dead = p.dead; }); }")
        # on fait jouer le tour comme le bouton
        await pg.evaluate("() => { App.endTurn(true); }")
        for _ in range(40):
            await pg.wait_for_timeout(500)
            if await pg.evaluate("!!document.querySelector('.landmark-modal')"): break
        print('ANNONCE', await pg.evaluate("""() => { const m = document.querySelector('.landmark-modal'); if (!m) return null;
          return { titre: m.querySelector('.lm-name').textContent, kicker: m.querySelector('.lm-kicker').textContent, image: !!m.querySelector('.lm-art img'), icone: !!m.querySelector('.lm-art canvas'),
            modales: UI.modals.length, cite: !!document.querySelector('.citymodal') }; }"""))
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=os.path.join(OUT, 'relais_sans_image.png'))
        await pg.evaluate("() => document.querySelector('.landmark-modal footer button').click()")
        await pg.wait_for_timeout(800)
        print('APRES', await pg.evaluate("() => ({ annonce: !!document.querySelector('.landmark-modal'), cite: !!document.querySelector('.citymodal'), vu: App.game.cities[App.me().fortress].lastDone })"))
        await pg.evaluate("UI.closeAll()")
        # rechargement : pas deux fois
        await pg.evaluate("() => App.landmarkPrompts()"); await pg.wait_for_timeout(400)
        print('UNE FOIS', await pg.evaluate("!document.querySelector('.landmark-modal')"))
        # avec une illustration posée dans assets/landmarks
        img = os.path.join(ROOT, 'dist', 'arcanes', 'assets', 'landmarks')
        os.makedirs(img, exist_ok=True)
        shutil.copyfile(os.path.join(ROOT, 'assets', 'title.jpg'), os.path.join(img, 'magicRelay.jpg'))
        await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; c.lastDone.shown = false; App.me().landmarksSeen.magicRelay = false; App.landmarkPrompts(); }")
        await pg.wait_for_timeout(1800)
        print('IMAGE', await pg.evaluate("() => !!document.querySelector('.landmark-modal .lm-art img')"))
        await pg.screenshot(path=os.path.join(OUT, 'relais_image.png'))
        await pg.set_viewport_size({'width': 1280, 'height': 720}); await pg.wait_for_timeout(300)
        print('1280x720', await pg.evaluate("() => { const r = document.querySelector('.landmark-modal').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; }"))
        await pg.screenshot(path=os.path.join(OUT, 'relais_720.png'))
        os.remove(os.path.join(img, 'magicRelay.jpg'))
        await pg.evaluate("UI.closeAll()")
        # une fois par sorte : la première guilde des mécaniciens (et sa catapulte), pas la seconde
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), c = g.cities[me.fortress], out = [];
          const show = async () => { const p = App.landmarkPrompts(); await new Promise(r => setTimeout(r, 300)); const m = document.querySelector('.landmark-modal');
            const t = m ? m.querySelector('.lm-name').textContent + ' / ' + (m.querySelector('.lm-eff') || {}).textContent : null; if (m) m.querySelector('footer button').click(); await p; return t; };
          for (const b of ['minersGuild', 'university', 'buildersHall']) c.buildings[b] = true;
          c.buildings.mechaniciansGuild = true; c.lastDone = { type: 'building', id: 'mechaniciansGuild', turn: g.turn }; out.push(await show());
          c.lastDone = { type: 'building', id: 'mechaniciansGuild', turn: g.turn }; out.push(await show());
          return out; }""")
        print('BATIMENTS GENERIQUES SANS ANNONCE', r)
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
