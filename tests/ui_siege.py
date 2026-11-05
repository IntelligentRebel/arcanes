"""Siège d'une cité fortifiée avec le combat tactique (capture d'écran)."""
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
        await pg.wait_for_timeout(600)
        info = await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 99, opponents: 2, human: { name: 'Morwen', portrait: 3, books: { chaos: 6, death: 4 }, retorts: ['warlord'], race: 'orc' } });
          App.start(g); UI.closeAll();
          const pl = App.me();
          const foe = g.players[1];
          const c = g.cities[foe.fortress];
          c.buildings.cityWalls = true;
          for (const t of ['Swordsmen', 'Bowmen', 'Spearmen']) { const d = Object.keys(DATA.units).find(k => DATA.units[k].race === foe.race && k.endsWith(t)); if (d) Units.create(g, d, foe.id, c.plane, c.x, c.y); }
          let spot = null;
          for (const [x, y] of World.neighbors(g.world, c.x, c.y)) if (!World.isWaterAt(g.world, c.plane, x, y) && !Units.at(g, c.plane, x, y).length) { spot = [x, y]; break; }
          const ids = ['OrcSwordsmen', 'OrcSwordsmen', 'OrcHalberdiers', 'OrcShamans', 'OrcCavalry', 'OrcSwordsmen', 'HellHounds', 'FireGiant', 'Catapult'].filter(t => DATA.units[t]).map(t => Units.create(g, t, pl.id, c.plane, spot[0], spot[1]).id);
          pl.known.push('fire_bolt', 'fireball', 'warp_lightning', 'disrupt');
          pl.mana = 400; pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          Move.reveal(g, pl, c.plane, c.x, c.y, 3);
          MapView.centerOn(c.x, c.y, c.plane); App.selectTile(c.plane, spot[0], spot[1]); MapView.bumpVis();
          window._c = c;
          return { city: c.name, spot, units: ids.length };
        }""")
        print('SETUP', info)
        await pg.wait_for_timeout(500)
        await pg.evaluate("UI.closeAll()")
        await pg.screenshot(path=os.path.join(SHOTS, '30-siege-before.png'))
        await pg.evaluate("void App.moveSelected(window._c.x, window._c.y)")
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=os.path.join(SHOTS, '31-siege.png'))
        st = await pg.evaluate("({ active: CombatView.active, side: CombatView.bt && CombatView.bt.side, walls: CombatView.bt && CombatView.bt.hasWalls })")
        print('COMBAT', st)
        # cast fireball on a defender if possible
        await pg.evaluate("""() => { const bt = CombatView.bt; const tgt = bt.alive(DEF_SIDE)[0]; const r = CombatSpells.cast(bt, ATT_SIDE, 'fireball', tgt); window._cast = r; return CombatView.playEvents(); }""")
        await pg.wait_for_timeout(250)
        await pg.screenshot(path=os.path.join(SHOTS, '32-siege-fireball.png'))
        print('CAST', await pg.evaluate("JSON.stringify(window._cast)"))
        await pg.evaluate("CombatView.toggleAuto()")
        for _ in range(100):
            await pg.wait_for_timeout(300)
            if not await pg.evaluate("CombatView.active"): break
        print('AFTER', await pg.evaluate("App.game.log.slice(-4).map(e => e.text).join(' | ')"))
        await pg.screenshot(path=os.path.join(SHOTS, '33-siege-after.png'))
        print('ERRORS', len(errors))
        for e in errors[:8]: print('  ', e[:300])
        await b.close()
asyncio.run(main())
