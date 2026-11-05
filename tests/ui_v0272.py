"""v0.27.2 : refermer une faille centre la carte dessus et la montre se résorber (contraction, éclair, onde de choc)."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


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
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), w = g.world; const a = Veil.openRift(g);
          for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (World.dist(w, x, y, a.x, a.y) <= 8) me.explored[0][y * w.w + x] = 1;
          const c = g.cities[me.fortress]; MapView.centerOn(c.x, c.y, c.plane); MapView.bumpVis(); App.refresh();
          window._r = a; return { faille: [a.x, a.y], camera: [Math.floor(MapView.camX), Math.floor(MapView.camY)] }; }""")
        print('AVANT', r)
        await pg.wait_for_timeout(600)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'rift_0.png'))
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), a = _r; const res = Spells.apply(g, me, 'seal_rift', { plane: a.plane, x: a.x, y: a.y });
          return { msg: res && res.msg, fermee: a.closed, effets: (MapView.fx || []).length, camera: [Math.floor(MapView.camX), Math.floor(MapView.camY)], plan: MapView.plane }; }""")
        print('SORT', r)
        # images figées à des instants choisis (la boucle d'affichage est suspendue le temps de la capture)
        fx = await pg.evaluate("() => (MapView.fx || []).map(f => Object.assign({}, f))")
        for i, e in enumerate([0.1, 0.7, 1.15, 1.4, 1.8, 2.4]):
            await pg.evaluate("([fx, e]) => { App.preparing = true; MapView.fx = fx.map(f => Object.assign({}, f, { t0: performance.now() - e * 1000 })); MapView.draw(); }", [fx, e])
            if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'rift_%d.png' % (i + 1)), clip={'x': 500, 'y': 250, 'width': 400, 'height': 350})
        await pg.evaluate("() => { App.preparing = false; }"); await pg.wait_for_timeout(3500)
        print('EFFETS RESTANTS', await pg.evaluate("(MapView.fx || []).length"))
        # sort achevé derrière une fenêtre (résumé du tour) : l'animation attend qu'elle se ferme, puis la carte se centre
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), a = Veil.openRift(g), c = g.cities[me.fortress];
          MapView.centerOn(c.x, c.y, c.plane); UI.confirm('Résumé', 'Fenêtre ouverte', 'OK'); Spells.apply(g, me, 'seal_rift', { plane: a.plane, x: a.x, y: a.y });
          window._a = a; return { faille: [a.x, a.y] }; }""")
        await pg.wait_for_timeout(800)
        print('PENDANT LA FENETRE', await pg.evaluate("() => ({ attente: (MapView.fx || []).map(f => f.t0 == null), camera: [Math.floor(MapView.camX), Math.floor(MapView.camY)] })"), r)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(500)
        print('APRES FERMETURE', await pg.evaluate("() => ({ demarre: (MapView.fx || []).map(f => f.t0 != null), camera: [Math.floor(MapView.camX), Math.floor(MapView.camY)] })"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
