"""v0.31.16 : chaque dilemme a son illustration (assets/dilemmas/<id>.jpg) en tête de la fenêtre de choix.
python3 tests/ui_v03116b.py [dossier des captures] [id du dilemme, sinon tous ceux que la partie permet]"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
ONLY = sys.argv[2] if len(sys.argv) > 2 else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(1500)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 21, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highelf' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # une partie un peu avancée, pour que les dilemmes trouvent leurs conditions (cité, héros, voisin connu…)
        await pg.evaluate("""async () => { const g = App.game, me = App.me(); me.human = false; me.aiLevel = 'hard'; me.aiPersonality = 'balanced';
          for (let t = 0; t < 40; t++) await Turn.endTurn(g); me.human = true; me.dilemma = null; UI.closeAll(); }""")
        await pg.wait_for_timeout(500); await pg.evaluate("UI.closeAll()")
        ids = await pg.evaluate("Object.keys(Dilemmas.DEFS)")
        seen = []
        for k in ids:
            if ONLY and k != ONLY: continue
            ok = await pg.evaluate("""(k) => { const g = App.game, me = App.me(); let d = null; try { d = Dilemmas.DEFS[k].when(g, me); } catch (e) { return 'erreur ' + e; }
              if (!d) return null; me.dilemma = { id: k, data: d, turn: g.turn }; App.dilemmaPrompt(); return 'ok'; }""", k)
            if ok != 'ok':
                print(k, ': conditions absentes' if ok is None else ok); continue
            await pg.wait_for_timeout(700)
            r = await pg.evaluate("""() => { const m = [...document.querySelectorAll('.modal')].pop(); if (!m) return null; const img = m.querySelector('.dil-art img');
              return { title: (m.querySelector('.modal-title, h2, .title') || {}).innerText || '', img: img ? img.naturalWidth + 'x' + img.naturalHeight : 'aucune', h: Math.round(m.getBoundingClientRect().height) }; }""")
            print(k, r)
            seen.append(k)
            if len(seen) <= 2: await pg.screenshot(path=os.path.join(OUT, 'dilemme_' + k + '.png'))
            await pg.evaluate("() => { App.me().dilemma = null; UI.closeAll(); }")
            await pg.wait_for_timeout(200)
        print('montrés', len(seen), '/', len(ids))
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
