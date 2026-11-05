"""v0.26.7 : bouton Repaires (V) qui fait pulser les lieux encore gardés ; trajet à travers un territoire étranger
(pastilles cerclées de la couleur du sorcier, étiquette paix/guerre) et territoire interdit signalé au survol."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def shot(pg, name):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, name + '.png'))


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

        # 1. Repaires : on dévoile la carte autour de la capitale, puis V
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], w = g.world;
          for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (World.dist(w, x, y, c.x, c.y) <= 12) me.explored[c.plane][y * w.w + x] = 1;
          App.sel = null; MapView.sel = null; MapView.centerOn(c.x, c.y, c.plane); MapView.bumpVis(); App.refresh();
          return { arcane: MapView.openLairs(g, me, 0).length, miroir: MapView.openLairs(g, me, 1).length }; }""")
        print('REPAIRES CONNUS', r)
        await pg.keyboard.press('v'); await pg.wait_for_timeout(700)
        print('TOAST', await pg.evaluate("() => [...document.querySelectorAll('.toast')].map(e => e.textContent).filter(t => /Repaires/.test(t))"),
              'BOUTON ACTIF', await pg.evaluate("document.querySelector('#mm-lairs').classList.contains('on')"))
        await shot(pg, 'lairs_on')
        # (v0.27 : V ne montre plus que les lieux où vos troupes ne sont jamais entrées, quel que soit leur état réel)
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), before = MapView.openLairs(g, me, 0), s = before.find(x => x.type !== 'node' && x.type !== 'tower');
          s.guardians = []; s.lootPending = true; MapView.hover = { x: s.x, y: s.y }; App.renderSide();
          return { avant: before.length, apres: MapView.openLairs(g, me, 0).length, infobulle: (document.querySelector('.ok') || {}).textContent || null }; }""")
        print('REPAIRE VIDE', r)
        await pg.click('#mm-lairs'); await pg.wait_for_timeout(300)
        print('APRES 2e CLIC', await pg.evaluate("App.showLairs"))

        # 2. trajet vers le territoire d'un sorcier en paix
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1], w = g.world, oc = g.cities[o.fortress], pl = oc.plane;
          me.contact[o.id] = true; o.contact[me.id] = true; me.diplo[o.id] = 'peace'; o.diplo[me.id] = 'peace';
          for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (World.dist(w, x, y, oc.x, oc.y) <= 14) me.explored[pl][y * w.w + x] = 1;
          const own = (x, y) => World.get(w, pl, 'owner', x, y);
          let start = null, goal = null;
          for (let d = 5; d <= 9 && !start; d++) for (let y = 0; y < w.h && !start; y++) for (let x = 0; x < w.w && !start; x++)
            if (World.dist(w, x, y, oc.x, oc.y) === d && own(x, y) < 0 && !World.isWaterAt(w, pl, x, y) && !Units.at(g, pl, x, y).length && !World.get(w, pl, 'site', x, y) >= 0) start = [x, y];
          for (let y = 0; y < w.h && !goal; y++) for (let x = 0; x < w.w && !goal; x++)
            if (own(x, y) === o.id && World.dist(w, x, y, oc.x, oc.y) === 2 && !World.isWaterAt(w, pl, x, y) && !Cities.at(g, pl, x, y) && !Units.at(g, pl, x, y).length) goal = [x, y];
          const u = Units.create(g, 'HighMenSwordsmen', me.id, pl, start[0], start[1]); u.moves = Units.maxMoves(g, u);
          MapView.plane = pl; App.selectTile(pl, start[0], start[1]); MapView.centerOn((start[0] + goal[0]) / 2, (start[1] + goal[1]) / 2, pl);
          MapView.hover = { x: goal[0], y: goal[1] }; App.updatePathPreview(); App.refresh();
          return { start, goal, chemin: MapView.path && MapView.path.length, nom: o.name }; }""")
        print('TRAJET EN PAIX', r)
        await pg.wait_for_timeout(500); await shot(pg, 'path_peace')

        # 3. le même sorcier ferme son territoire : plus de chemin, croix rouge et raison au survol
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1]; o.closedTo = o.closedTo || {}; o.closedTo[me.id] = true;
          App.updatePathPreview(); App.refresh(); return { chemin: MapView.path ? MapView.path.length : null, ferme: [...Move.closedBy(g, me.id)] }; }""")
        print('TERRITOIRE FERME', r)
        await pg.wait_for_timeout(500); await shot(pg, 'path_closed')

        # 4. en guerre
        await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1]; o.closedTo[me.id] = false; me.diplo[o.id] = 'war'; o.diplo[me.id] = 'war'; App.updatePathPreview(); App.refresh(); }""")
        await pg.wait_for_timeout(500); await shot(pg, 'path_war')
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
