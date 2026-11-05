"""v0.27.5 : bouton « Nœuds libres » (O) : les nœuds sans gardien qu'on peut encore lier pulsent (vert : libres, rouge : tenus
par un rival hors traité) ; bouton Repaires et Changer de plan sur deux lignes."""
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
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), w = g.world, c = g.cities[me.fortress], pl = c.plane, o = g.players[1];
          for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (World.dist(w, x, y, c.x, c.y) <= 16) me.explored[pl][y * w.w + x] = 1;
          const nodes = g.sites.filter(s => s.type === 'node' && s.plane === pl && me.explored[pl][s.y * w.w + s.x]).sort((a, b) => World.dist(w, a.x, a.y, c.x, c.y) - World.dist(w, b.x, b.y, c.x, c.y));
          // un nœud vu sans gardien, un nœud vidé par nos troupes, un nœud tenu par un rival en guerre, un nœud encore inconnu
          nodes[0].guardians = []; Game.noteSite(g, me.id, nodes[0]);
          if (nodes[1]) { nodes[1].cleared = true; nodes[1].guardians = []; Game.noteSite(g, me.id, nodes[1]); }
          if (nodes[2]) { nodes[2].owner = o.id; nodes[2].cleared = true; me.contact[o.id] = true; me.diplo[o.id] = 'war'; o.diplo[me.id] = 'war'; }
          MapView.centerOn(nodes[0].x, nodes[0].y, pl); App.refresh();
          return { noeuds: nodes.length, libres: MapView.freeNodes(g, me, pl).map(s => [s.x, s.y, s.owner]) }; }""")
        print('NOEUDS', r)
        await pg.keyboard.press('o'); await pg.wait_for_timeout(700)
        print('TOAST', await pg.evaluate("() => [...document.querySelectorAll('.toast')].map(e => e.textContent).filter(t => /Nœuds/.test(t))"),
              'ACTIF', await pg.evaluate("document.querySelector('#mm-nodes').classList.contains('on')"))
        await pg.evaluate("() => { const n = MapView.freeNodes(App.game, App.me(), MapView.plane)[0]; MapView.hover = { x: n.x, y: n.y }; App.renderSide(); }"); await pg.wait_for_timeout(300)
        print('INFOBULLE', await pg.evaluate("() => (document.querySelector('#side') || document.body).innerText.split('\\n').filter(t => /Nœud/.test(t)).slice(0, 2)"))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'nodes_on.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
