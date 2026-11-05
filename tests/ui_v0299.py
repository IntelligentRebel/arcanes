"""v0.29.9 : une cité cachée par le brouillard sur la destination arrête la marche devant elle, sans combat ; une cité connue reste une attaque."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: (errors.append(str(e)), print('PAGEERROR', str(e)[:300], flush=True)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 14, opponents: 3, difficulty: 'hard', crisis: 'off', human: { name: 'X', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2200); await pg.evaluate("UI.closeAll()")
        # une cité ennemie à deux cases d'un éclaireur, sous le brouillard
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), w = g.world, f = g.cities[me.fortress];
          let spot = null;
          for (let d = 4; d < 12 && !spot; d++) for (let dx = -d; dx <= d && !spot; dx++) { const x = World.wx(w, f.x + dx), y = f.y + d;
            if (y < 2 || y > w.h - 3) continue; const ok = (xx, yy) => !World.isWaterAt(w, f.plane, xx, yy) && !Cities.at(g, f.plane, xx, yy) && World.get(w, f.plane, 'site', xx, yy) < 0 && !Units.at(g, f.plane, xx, yy).length && !Move.blockedMountain(g, f.plane, xx, yy);
            if (ok(x, y) && ok(World.wx(w, x + 2), y) && ok(World.wx(w, x + 1), y)) spot = [x, y]; }
          const cx = World.wx(w, spot[0] + 2), cy = spot[1];
          const c = Cities.create(g, 1, g.players[1].race, f.plane, cx, cy, { pop: 3000 }); c.name = 'Hissara'; Units.create(g, Object.keys(DATA.units).find(k => DATA.units[k].race === g.players[1].race && /Spearmen/.test(k)) || 'HighMenSpearmen', 1, f.plane, cx, cy); Cities.updateTerritory(g); 
          const u = Units.create(g, 'HighElfScouts', 0, f.plane, spot[0], spot[1]); u.moves = 4;
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) me.explored[f.plane][(cy + dy) * w.w + World.wx(w, cx + dx)] = 0;
          me.explored[f.plane][spot[1] * w.w + spot[0]] = 1;
          window._c = c.id; window._u = u.id; MapView.invalidateVis(); App.selectTile(f.plane, spot[0], spot[1]); App.refresh();
          return 'éclaireur ' + spot + ', cité ' + cx + ',' + cy + ' connue ? ' + Intel.knows(g, me, f.plane, cx, cy); }""")
        print(r, flush=True)
        await pg.evaluate("""() => { const g = App.game, c = g.cities[_c]; window._t = []; const ot = UI.toast; UI.toast = (m, k) => { _t.push(m); return ot(m, k); };
          window._done = false; App.moveSelected(c.x, c.y).then(() => { window._done = true; }); }""")
        for k in range(80):
            await pg.wait_for_timeout(250)
            mods = await pg.evaluate("() => [...document.querySelectorAll('.modal header h2')].map(x => x.textContent).join(' | ')")
            if mods: print('  fenêtre :', mods, flush=True); await pg.evaluate("() => { const b = document.querySelector('.modal footer button.primary') || document.querySelector('.modal footer button'); if (b) b.click(); else UI.closeAll(); }")
            if await pg.evaluate("window._done"): break
        res = await pg.evaluate("""() => { const g = App.game, c = g.cities[_c], u = g.units[_u];
          return JSON.stringify({ vivant: !!u, case: u && [u.x, u.y], distance: u && World.dist(g.world, u.x, u.y, c.x, c.y), propriétaire: c.owner, message: _t }); }""")
        print('CITÉ CACHÉE', res, flush=True)
        # une seconde fois, le contact déjà établi (cas réel) : la cité est de nouveau cachée par le brouillard
        await pg.evaluate("""() => { const g = App.game, me = App.me(), w = g.world, c = g.cities[_c], u = g.units[_u];
          u.x = World.wx(w, c.x - 2); u.y = c.y; u.moves = 4; u.path = null; u.status = '';
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) me.explored[c.plane][(c.y + dy) * w.w + World.wx(w, c.x + dx)] = 0;
          me.explored[c.plane][u.y * w.w + u.x] = 1; MapView.invalidateVis(); App.selectTile(u.plane, u.x, u.y); App.refresh();
          window._t = []; window._done = false; const mg = Game.moveGroup; Game.moveGroup = async function () { const r = await mg.apply(this, arguments); window._r = r; Game.moveGroup = mg; return r; }; App.moveSelected(c.x, c.y).then(() => { window._done = true; }); }""")
        for k in range(80):
            await pg.wait_for_timeout(250)
            if await pg.evaluate("document.querySelectorAll('.modal').length"): print('  fenêtre :', await pg.evaluate("[...document.querySelectorAll('.modal header h2')].map(x => x.textContent).join(' | ')"), flush=True); await pg.evaluate("UI.closeAll()")
            if await pg.evaluate("window._done"): break
        print('CONTACT ÉTABLI', await pg.evaluate("""() => { const g = App.game, c = g.cities[_c], u = g.units[_u];
          return JSON.stringify({ r: window._r, contact: !!App.me().contact[1], vivant: !!u, distance: u && World.dist(g.world, u.x, u.y, c.x, c.y), propriétaire: c.owner, message: _t }); }"""), flush=True)
        # la même cité, maintenant connue : l'ordre devient une attaque (Game.moveGroup espionné)
        res2 = await pg.evaluate("""async () => { const g = App.game, c = g.cities[_c], u = g.units[_u]; u.moves = 4;
          const mg = Game.moveGroup; let seen = null; Game.moveGroup = async (game, ids, x, y, opts) => { seen = opts; return { ok: true, moved: 0 }; };
          App.selectTile(u.plane, u.x, u.y); await App.moveSelected(c.x, c.y); Game.moveGroup = mg; return 'ordre d\\'attaque : ' + !!(seen && seen.attackOrder); }""")
        print('CITÉ CONNUE', res2, flush=True)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
