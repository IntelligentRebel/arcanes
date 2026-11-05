"""v0.16.6 : prévision de bataille hors de vue = dernier rapport (avec son âge) ou forces inconnues ; plus de nombre de simulations."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def hover(pg, x, y):
    P = await pg.evaluate(f"(() => {{ const P = MapView.tileToScreen({x}, {y}); return [P.x + MapView.ts / 2, P.y + MapView.ts / 2]; }})()")
    await pg.mouse.move(P[0] - 4, P[1] - 4); await pg.mouse.move(P[0], P[1])
    await pg.wait_for_timeout(900)
    dbg = await pg.evaluate(f"(() => {{ const el = document.elementFromPoint({P[0]}, {P[1]}); return [P => 0, el && (el.id || el.className), JSON.stringify(MapView.hover), MapView.plane]; }})()")
    print('   dbg', P, dbg)
    return await pg.evaluate("document.querySelector('#tileinfo').textContent")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 880})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        info = await pg.evaluate("""() => {
          window.AUTO_CHOICE = true; document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = App.me(), fc = g.cities[pl.fortress], w = g.world;
          const ncs = Object.values(g.cities).filter(c => c.owner < 0 && c.plane === fc.plane).sort((a, b) => World.dist(w, a.x, a.y, fc.x, fc.y) - World.dist(w, b.x, b.y, fc.x, fc.y));
          window._A = ncs[0]; window._B = ncs[1];
          return { A: [ncs[0].x, ncs[0].y, Units.at(g, 0, ncs[0].x, ncs[0].y).length], B: [ncs[1].x, ncs[1].y] };
        }""")
        print('CITIES', info)
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()")
        # un éclaireur voit A : rapport ; puis il s'éloigne, le temps passe et A se renforce
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), w = g.world;
          const spy = Units.create(g, 'HighMenScouts', pl.id, 0, World.wx(w, _A.x + 1), _A.y); Move.reveal(g, pl, 0, _A.x, _A.y, 1);
          MapView.invalidateVis(); MapView.bumpVis(); MapView.centerOn(_A.x, _A.y, 0);
          window._spy = spy.id;
        }""")
        await pg.wait_for_timeout(600)
        print('REPORT', await pg.evaluate("(() => { const r = App.intelAt(0, _A.x, _A.y); return r && [r.t, r.units.map(u => u.type)]; })()"))
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me();
          Units.remove(g, g.units[_spy]);
          g.turn += 14;
          for (let i = 0; i < 4; i++) Units.create(g, 'HighMenPikemen', -1, 0, _A.x, _A.y);
          Move.reveal(g, pl, 0, _B.x, _B.y, 1);
          // une armée à quelques cases, sélectionnée
          const w = g.world; let spot = null;
          for (let d = 2; d < 6 && !spot; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) { const x = World.wx(w, _A.x + dx), y = _A.y + dy; if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { spot = [x, y]; break; } }
          const ids = ['HighMenSwordsmen', 'HighMenSwordsmen', 'HighMenBowmen'].map(t => Units.create(g, t, pl.id, 0, spot[0], spot[1]).id);
          // la vue de l'armée ne doit pas atteindre A : on l'aveugle pour le test
          for (const id of ids) g.units[id].blindTest = true;
          App.selectTile(0, spot[0], spot[1], ids);
          MapView.invalidateVis(); MapView.bumpVis(); MapView.centerOn(_A.x, _A.y, 0); App.refresh();
          return spot;
        }""")
        await pg.wait_for_timeout(500)
        visA = await pg.evaluate("MapView.vis[0][_A.y * App.game.world.w + _A.x]")
        print('A visible now ?', visA)
        if not visA:
            print('TILE A', (await hover(pg, *info['A'][:2]))[:400])
            await pg.screenshot(path=os.path.join(SHOTS, '160-report.png'))
        await pg.evaluate("MapView.centerOn(_B.x, _B.y, 0); App.refresh()")
        await pg.wait_for_timeout(300)
        print('TILE B', (await hover(pg, *info['B']))[:300])
        await pg.screenshot(path=os.path.join(SHOTS, '161-unknown.png'))
        # case jamais explorée : rien
        unk = await pg.evaluate("(() => { const g = App.game, pl = App.me(), w = g.world; const c = Object.values(g.cities).find(c => c.plane === 0 && !pl.explored[0][c.y * w.w + c.x]); if (!c) return null; MapView.centerOn(c.x, c.y, 0); return [c.x, c.y]; })()")
        if unk:
            await pg.wait_for_timeout(300)
            await hover(pg, *unk)
            print('UNEXPLORED forecast', await pg.evaluate("JSON.stringify(MapView.forecast)"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
