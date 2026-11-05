"""v0.17.5 : nature magique des unités dans les infobulles (carte et bataille) et sorts qui les touchent."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 6, chaos: 4 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        spot = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), w = g.world, cap = g.cities[pl.fortress], foe = g.players[1];
          for (const id of ['dispel_evil', 'heroism', 'holy_word', 'banish', 'holy_weapon', 'fire_bolt', 'star_fires', 'healing']) if (DATA.spells[id] && !pl.known.includes(id)) pl.known.push(id);
          let spot = null;
          for (const [dx, dy] of [[2, 0], [2, 1], [1, 2], [-2, 0], [0, 2], [2, -1], [-2, 1]]) { const x = World.wx(w, cap.x + dx), y = cap.y + dy; if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { spot = [x, y]; break; } }
          Units.create(g, 'Skeleton', foe.id, 0, spot[0], spot[1]);
          Units.create(g, 'Skeleton', foe.id, 0, spot[0], spot[1]);
          Units.create(g, 'HighMenSwordsmen', foe.id, 0, spot[0], spot[1]);
          Units.create(g, 'MagicSpirit', pl.id, 0, cap.x, cap.y);
          Move.revealAllFor(g, pl); MapView.centerOn(spot[0], spot[1], 0); App.refresh();
          const s = MapView.tileToScreen ? MapView.tileToScreen(spot[0], spot[1]) : null;
          return { spot, s };
        }""")
        print('SPOT', spot)
        # survol de la case ennemie sur la carte
        pos = await pg.evaluate("""([x, y]) => { for (let sy = 60; sy < innerHeight; sy += 4) for (let sx = 0; sx < innerWidth; sx += 4) { const el = document.elementFromPoint(sx, sy); if (el && el.id !== 'map') continue; const t = MapView.screenToTile(sx, sy); if (t.x === x && t.y === y) return [sx + 10, sy + 10]; } return null; }""", spot['spot'])
        await pg.mouse.move(pos[0] - 30, pos[1] - 30); await pg.mouse.move(pos[0], pos[1]); await pg.wait_for_timeout(700)
        print('TIP CARTE', await pg.evaluate("(() => { const t = document.querySelector('#tooltip'); return t.style.display !== 'none' ? t.textContent.slice(0, 300) : null; })()"))
        await pg.screenshot(path=os.path.join(SHOTS, '180-maptip-stack.png'))
        # fiche d'un squelette (infobulle complète)
        print('SQUELETTE', await pg.evaluate("""(() => { const g = App.game; const u = Object.values(g.units).find(u => u.type === 'Skeleton'); const d = document.createElement('div'); d.innerHTML = UI.unitTip(u, g); return d.textContent.slice(0, 400); })()"""))
        print('ESPRIT (ami)', await pg.evaluate("""(() => { const g = App.game; const u = Object.values(g.units).find(u => u.type === 'MagicSpirit'); const d = document.createElement('div'); d.innerHTML = UI.unitTip(u, g); return d.textContent.slice(0, 300); })()"""))
        print('LANCIER (ami)', await pg.evaluate("""(() => { const g = App.game; const u = Object.values(g.units).find(u => u.type === 'HighMenSpearmen' && u.owner === App.pid); const d = document.createElement('div'); d.innerHTML = UI.unitTip(u, g); return d.textContent.slice(0, 300); })()"""))
        # bataille : survol d'un squelette
        await pg.mouse.move(5, 500)
        await pg.evaluate("""([x, y]) => {
          const g = App.game, pl = App.me(), cap = g.cities[pl.fortress], foe = g.players[1];
          pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          const ids = Units.at(g, 0, cap.x, cap.y).filter(u => u.owner === pl.id).map(u => u.id);
          for (const id of ids) { g.units[id].moves = 2; g.units[id].x = World.wx(g.world, x - 1); }
          const nx = World.wx(g.world, x - 1);
          for (const id of ids) { const u = g.units[id]; u.x = nx; u.y = y; }
          App.selectTile(0, nx, y, ids);
          void App.moveSelected(x, y);
        }""", spot['spot'])
        await pg.wait_for_timeout(2000)
        await pg.click('.modal button:has-text("Commander la bataille")')
        await pg.wait_for_timeout(1200)
        pt = await pg.evaluate("""() => { const bt = CombatView.bt; const b = bt.units.find(b => b.u.type === 'Skeleton' && !b.dead); const p = CombatView.iso(b.c, b.r); const r = CombatView.cv.getBoundingClientRect(); return [r.left + p.x, r.top + p.y - 10]; }""")
        await pg.mouse.move(pt[0], pt[1] - 3); await pg.mouse.move(pt[0], pt[1]); await pg.wait_for_timeout(400)
        print('BATAILLE', await pg.evaluate("(() => { const e = document.querySelector('#c-right'); return e && e.style.display !== 'none' ? e.textContent.slice(0, 300) : null; })()"))
        await pg.screenshot(path=os.path.join(SHOTS, '181-combat-kind.png'))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
