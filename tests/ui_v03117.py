"""v0.31.17 : le Miroir a ses propres sols et son propre décor. Captures des deux plans sur la même région, toute la carte révélée.
python3 tests/ui_v03117.py [dossier des captures] [graine]"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 21


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(1500)
        await pg.evaluate("""(seed) => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highelf' } }); App.start(g); UI.closeAll(); }""", SEED)
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("() => { const me = App.me(); for (const e of me.explored) e.fill(1); if (me.visible) for (const v of me.visible) v && v.fill && v.fill(1); MapView.bumpVis(); App.refresh(); }")
        info = await pg.evaluate("() => ({ mirror: Sprites.hasMirror(), grass: !!Tex.get('grass', 1), same: Tex.get('grass', 1) === Tex.get('grass', 0), tree: Sprites.planeKey('tree:3', 1) })")
        print('Miroir :', info)
        for plane in (0, 1):
            await pg.evaluate("(pl) => { if (MapView.plane !== pl) App.togglePlane(); }", plane)
            await pg.wait_for_timeout(2500)
            # une région variée : la case la plus riche en types de terrain dans un carré de 14 x 9
            await pg.evaluate("""(pl) => { const w = App.game.world, P = w.planes[pl]; let best = null, bs = -1;
              for (let y = 6; y < w.h - 6; y += 2) for (let x = 0; x < w.w; x += 3) { const s = new Set(); let land = 0;
                for (let dy = -4; dy <= 4; dy++) for (let dx = -7; dx <= 7; dx++) { const t = P.terr[(y + dy) * w.w + (x + dx + w.w) % w.w]; s.add(t); if (!World.isWater(t)) land++; }
                const sc = s.size * 10 + Math.min(land, 90); if (sc > bs) { bs = sc; best = [x, y]; } }
              MapView.centerOn(best[0], best[1], pl); App.dirty = true; }""", plane)
            await pg.wait_for_timeout(1200)
            await pg.screenshot(path=os.path.join(OUT, f'plan{plane}.png'))
        # une bataille sur chaque plan, en forêt (le sol et les arbres du plateau suivent le plan)
        for plane in (0, 1):
            ok = await pg.evaluate("""(pl) => { const g = App.game, w = g.world, me = App.me(); let at = null;
              for (let i = 0; i < w.w * w.h && !at; i++) if (w.planes[pl].terr[i] === T.FOREST) at = [i % w.w, Math.floor(i / w.w)];
              if (!at) return false;
              const A = [0, 1, 2].map(() => Units.create(g, 'HighElfSpearmen', me.id, pl, at[0], at[1]));
              const D = [0, 1, 2].map(() => Units.create(g, 'Skeleton', -1, pl, at[0], at[1]));
              const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: -1, plane: pl, x: at[0], y: at[1], rng: new RNG(3) }); window._bt = bt;
              CombatView.run(g, bt, {}); return true; }""", plane)
            await pg.wait_for_timeout(800)
            await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); b && b.click(); }")
            await pg.wait_for_timeout(1800)
            await pg.screenshot(path=os.path.join(OUT, f'combat{plane}.png'))
            print('bataille plan', plane, ok, await pg.evaluate("() => CombatView.groundKind"))
            await pg.evaluate("() => { const bt = _bt; for (const f of bt.alive(1)) { f.dead = true; bt.dead.push(f); } bt.checkEnd(); CombatView.finish(); }"); await pg.wait_for_timeout(1500)
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
