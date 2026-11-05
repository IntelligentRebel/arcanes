"""v0.8 : éclaireurs, ligne de vue (collines, montagnes), montagnes infranchissables sans route, option de partie."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(800)
        # écran de nouvelle partie : la case à cocher existe et est cochée
        await pg.evaluate("Setup.newGame()")
        await pg.wait_for_timeout(400)
        print('OPTION', await pg.evaluate("(() => { const c = document.getElementById('ng-mtn'); return c ? c.checked : null; })()"))
        await pg.screenshot(path=os.path.join(SHOTS, '70-setup.png'))
        await pg.evaluate("UI.closeAll()")
        info = await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          const ts = document.querySelector('.title-screen'); if (ts) ts.remove();
          const g = Game.newGame({ seed: 12, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = App.me(), w = g.world, cap = g.cities[pl.fortress];
          const units = Object.values(g.units).filter(u => u.owner === pl.id);
          const scout = units.find(u => Units.isScout(u)), spear = units.find(u => DATA.units[u.type].en === 'Spearmen');
          // une colline au bord d'une chaîne de montagnes, pas trop loin
          let best = null, bd = 1e9;
          for (let y = 3; y < w.h - 3; y++) for (let x = 0; x < w.w; x++) {
            if (World.terr(w, 0, x, y) !== T.HILLS) continue;
            let m = 0; for (const [dx, dy] of U.DIRS8) if (World.terr(w, 0, x + dx, y + dy) === T.MOUNTAIN) m++;
            if (m < 2) continue;
            const d = World.dist(w, x, y, cap.x, cap.y); if (d < bd) { bd = d; best = [x, y]; }
          }
          scout.x = best[0]; scout.y = best[1]; spear.x = best[0]; spear.y = best[1];
          Move.revealAllFor(g, pl);
          MapView.ts = 80; MapView.centerOn(best[0], best[1], 0); MapView.bumpVis();
          window._best = best; window._spear = spear.id; window._scout = scout.id;
          const mt = []; for (const [dx, dy] of U.DIRS8) if (World.terr(w, 0, best[0] + dx, best[1] + dy) === T.MOUNTAIN) mt.push([best[0] + dx, best[1] + dy]);
          window._mtn = mt[0];
          return { scout: scout.type, best, mountain: mt[0], sight: (() => { let n = 0; Move.sightCells(g, scout, () => n++); return n; })() };
        }""")
        print('SETUP', info)
        await pg.wait_for_timeout(2600)
        await pg.evaluate("UI.closeAll(); App.selectTile(0, window._best[0], window._best[1], [window._scout]); MapView.bumpVis()")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '71-scout-hill.png'))
        # un lancier ne peut pas entrer sur la montagne
        r = await pg.evaluate("Game.moveGroup(App.game, [window._spear], window._mtn[0], window._mtn[1]).then(r => r.why || 'ok')")
        print('SPEAR -> MOUNTAIN', r)
        # info de case sur la montagne
        await pg.evaluate("MapView.hover = { x: window._mtn[0], y: window._mtn[1] }; App.refresh && App.refresh()")
        await pg.wait_for_timeout(300)
        print('TILE', await pg.evaluate("App.tileInfoHtml(0, window._mtn[0], window._mtn[1]).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 220)"))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
