"""v0.31.11 : tout sort visé sur la carte cercle ses cibles (sorts de terrain, d'unité) ; Transmutation : en orange les cases à perte,
et l'aperçu dit ce qu'on y gagne ou y perd (Mithril → Argent : +2 or, −1 puissance, plus d'armes en mithril à …)."""
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
          const g = Game.newGame({ seed: 21, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highelf' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], w = g.world;
          const zone = World.catchment(w, c.x, c.y).filter(([x, y]) => !(x === c.x && y === c.y));
          const [a, b2, d] = zone; World.set(w, c.plane, 'mineral', World.wx(w, a[0]), a[1], M.mithril); World.set(w, c.plane, 'mineral', World.wx(w, b2[0]), b2[1], M.silver); World.set(w, c.plane, 'mineral', World.wx(w, d[0]), d[1], M.iron);
          c.buildings.alchemistsGuild = true;
          me.known.push('transmute', 'change_terrain', 'righteousness'); me.mana = 5000; me.skill = 500;
          const out = {};
          for (const id of ['transmute', 'change_terrain', 'righteousness', 'earth_lore']) {
            MagicUI.beginCast(id); const t = MagicUI.targeting; out[id] = t ? (t.tiles ? t.tiles.length + ' cases' + (t.tiles.some(x => x[3] === MagicUI.LOSS_RGB) ? ', dont ' + t.tiles.filter(x => x[3] === MagicUI.LOSS_RGB).length + ' en orange' : '') : 'pas de cercles') : 'annulé'; MagicUI.cancelTarget(); }
          const lab = (x, y) => Spells.areaOf(g, me, 'transmute', c.plane, World.wx(w, x), y);
          out.mithril = lab(a[0], a[1]).label + (lab(a[0], a[1]).warn ? ' [orange]' : '');
          out.argent = lab(b2[0], b2[1]).label + (lab(b2[0], b2[1]).warn ? ' [orange]' : '');
          out.fer = lab(d[0], d[1]).label;
          MagicUI.beginCast('transmute'); MapView.centerOn(c.x, c.y, c.plane); MapView.hover = { x: World.wx(w, a[0]), y: a[1] };
          return out; }""")
        for k, v in r.items(): print(k, ':', v)
        await pg.wait_for_timeout(300)
        await pg.evaluate("() => document.querySelectorAll('.toast, #toasts > *').forEach(e => e.remove())")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(OUT, 'transmutation.png'), clip={'x': 250, 'y': 150, 'width': 900, 'height': 520})
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
