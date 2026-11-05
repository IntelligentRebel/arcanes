"""v0.30.5 : une proposition diplomatique montre ce que l'écran des sorciers sait du sorcier (dons, cités, puissance, armée estimée,
raisons de son attitude, émissaires) ; « Voir la capitale » si on la connaît, sinon « Voir sa plus grande cité », sinon rien."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3000)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(400); await pg.evaluate("UI.closeAll()")
        buttons = "[...document.querySelectorAll('.contact-modal footer button')].map(x => x.textContent)"
        intel = "(document.querySelector('#offer-intel') || {}).textContent || ''"

        # 1. en guerre, capitale jamais vue, une autre de ses cités repérée
        await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1];
          me.contact[o.id] = o.contact[me.id] = true; Diplomacy.setState(g, me.id, o.id, 'war'); o.relations[me.id] = -70;
          const n = Object.values(g.cities).find(c => c.owner < 0 && c.plane === g.cities[o.fortress].plane); n.owner = o.id; n.name = 'Tecalco';
          me.explored[n.plane][n.y * g.world.w + n.x] = 1; window._n = n.id;
          window._off = { from: o.id, kind: 'peace', turn: g.turn }; Diplomacy.offer(g, me, _off); App.offerPrompt(_off); }""")
        await pg.wait_for_timeout(600)
        print('INCONNUE', await pg.evaluate(buttons)); print('  infos :', await pg.evaluate(intel))
        await pg.screenshot(path=os.path.join(SHOTS, 'v0305_offre.png'))
        await pg.evaluate("() => [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Voir sa plus grande cité').click()")
        await pg.wait_for_timeout(400)
        print('  coup d oeil :', await pg.evaluate("(document.querySelector('.peekbar') || {}).textContent"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        print('  retour a l offre :', await pg.evaluate("!!document.querySelector('.contact-modal')"))
        await pg.evaluate("() => [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Refuser').click()")
        await pg.wait_for_timeout(300)

        # 2. capitale vue
        await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1], cap = g.cities[o.fortress];
          me.explored[cap.plane][cap.y * g.world.w + cap.x] = 1;
          window._off = { from: o.id, kind: 'peace', turn: g.turn }; Diplomacy.offer(g, me, _off); App.offerPrompt(_off); }""")
        await pg.wait_for_timeout(600)
        print('CAPITALE', await pg.evaluate(buttons)); print('  infos :', (await pg.evaluate(intel))[:140])
        await pg.evaluate("() => [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Voir la capitale').click()")
        await pg.wait_for_timeout(400)
        print('  coup d oeil :', await pg.evaluate("(document.querySelector('.peekbar') || {}).textContent"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        await pg.evaluate("() => [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Refuser').click()")
        await pg.wait_for_timeout(300)

        # 3. aucune cité connue : pas de bouton
        await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[2];
          me.contact[o.id] = o.contact[me.id] = true; for (const c of Object.values(g.cities).filter(c => c.owner === o.id)) me.explored[c.plane][c.y * g.world.w + c.x] = 0;
          window._off = { from: o.id, kind: 'peace', turn: g.turn }; Diplomacy.offer(g, me, _off); App.offerPrompt(_off); }""")
        await pg.wait_for_timeout(600)
        print('AUCUNE', await pg.evaluate(buttons))
        await pg.evaluate("() => [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Refuser').click()")
        await pg.wait_for_timeout(300)

        # 4. l'écran des sorciers, inchangé
        await pg.evaluate("Panels.wizards(1)"); await pg.wait_for_timeout(500)
        print('ECRAN SORCIERS', await pg.evaluate("(() => { const t = [...document.querySelectorAll('.modal')].map(m => m.textContent).join(' '); return ['puissance', 'Traité', 'Attitude', 'Rapport de forces'].map(k => k + ':' + t.includes(k)).join(' '); })()"))
        await pg.screenshot(path=os.path.join(SHOTS, 'v0305_sorciers.png'))
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
