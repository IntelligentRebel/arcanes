"""v0.31.15 : Changement de terrain et Transmutation : un cercle dans chaque case visable (plus de cadres carrés), en or si on y gagne,
en orange si on y perd, en gris si rien ne change, avec le principal écrit dessous (+0,5 nour., +3 % prod., +3 or…) ; l'aperçu dit le détail."""
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
        await pg.wait_for_timeout(1500)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 21, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highelf' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], w = g.world;
          const zone = World.catchment(w, c.x, c.y).filter(([x, y]) => !(x === c.x && y === c.y));
          const T0 = [T.MOUNTAIN, T.HILLS, T.SWAMP, T.DESERT, T.FOREST, T.TUNDRA];
          zone.slice(0, 6).forEach(([x, y], i) => World.set(w, c.plane, 'terr', World.wx(w, x), y, T0[i]));
          World.set(w, c.plane, 'mineral', World.wx(w, zone[7][0]), zone[7][1], M.mithril); World.set(w, c.plane, 'mineral', World.wx(w, zone[8][0]), zone[8][1], M.iron);
          me.known.push('transmute', 'change_terrain'); me.mana = 5000; me.skill = 500;
          const out = {};
          MagicUI.beginCast('change_terrain'); const t = MagicUI.targeting.tiles;
          out.cases = t.length; out.couleurs = { or: t.filter(x => x[3] === MagicUI.GAIN_RGB).length, orange: t.filter(x => x[3] === MagicUI.LOSS_RGB).length, gris: t.filter(x => x[3] === MagicUI.NONE_RGB).length };
          out.etiquettes = [...new Set(t.map(x => x[4]).filter(Boolean))].slice(0, 8);
          out.montagne = Spells.areaOf(g, me, 'change_terrain', c.plane, World.wx(w, zone[0][0]), zone[0][1]).label;
          out.marais = Spells.areaOf(g, me, 'change_terrain', c.plane, World.wx(w, zone[2][0]), zone[2][1]).label;
          MapView.centerOn(c.x, c.y, c.plane); if (MapView.setZoom) MapView.setZoom(1.6);
          return out; }""")
        for k, v in r.items(): print(k, ':', v)
        await pg.wait_for_timeout(500)
        await pg.evaluate("() => document.querySelectorAll('.toast, #toasts > *').forEach(e => e.remove())")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(OUT, 'terrain_cercles.png'), clip={'x': 300, 'y': 120, 'width': 800, 'height': 600})
        t2 = await pg.evaluate("""() => { MagicUI.cancelTarget(); MagicUI.beginCast('transmute'); const t = MagicUI.targeting.tiles; return t.map(x => x[4] + ' [' + (x[3] === MagicUI.LOSS_RGB ? 'orange' : 'or') + ']'); }""")
        print('transmutation :', t2)
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(OUT, 'transmutation_cercles.png'), clip={'x': 300, 'y': 120, 'width': 800, 'height': 600})
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
