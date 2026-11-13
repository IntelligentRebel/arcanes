"""v0.31.51 : sous Clairvoyance, une cité étrangère hors de vue montre la garnison rapportée ce tour-ci (cartes d'unités et
leurs bulles), sans le conseil « envoyez une unité à proximité » ; sans rapport du tour, rien ne change."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1500, 'height': 1000}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(1500)
        await pg.evaluate("""() => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 6, mapW: 60, mapH: 40, opponents: 3, otherPlane: 0, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 9, books: { sorcery: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        OPEN = """() => { const g = App.game, me = App.me(); MapView.vis = Move.visibility(g, me.id);
          const c = Object.values(g.cities).find(c => c.owner !== me.id && c.owner >= 0 && !MapView.vis[c.plane][c.y * g.world.w + c.x]); UI.closeAll(); Panels.foreignCity(c);
          const m = document.querySelector('.modal'); return { txt: m.textContent, cards: m.querySelectorAll('.ucard').length, real: Units.at(g, c.plane, c.x, c.y).length }; }"""
        await pg.evaluate("() => { const me = App.me(); for (const c of Object.values(App.game.cities)) Move.reveal(App.game, me, c.plane, c.x, c.y, 1); }")
        before = await pg.evaluate(OPEN)
        ok(before['cards'] == 0 and 'Garnison invisible' in before['txt'], 'sans Clairvoyance : garnison inconnue')
        await pg.evaluate("() => Spells.apply(App.game, App.me(), 'awareness', null)")
        after = await pg.evaluate(OPEN)
        ok(after['cards'] == after['real'] and after['cards'] > 0, 'Clairvoyance : la garnison rapportée en cartes (%d/%d)' % (after['cards'], after['real']))
        ok('Garnison invisible' not in after['txt'] and 'Dernier rapport' in after['txt'], 'plus de conseil d\'envoyer une unité')
        tip = await pg.evaluate("() => { const g = App.game, me = App.me(); const k = Object.keys(me.intel).find(k => me.intel[k].units.length); return UI.unitTip(me.intel[k].units[0], g).length; }")
        ok(tip > 50, 'la bulle d\'une unité rapportée se construit')
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v03151_clairvoyance.png'))
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
