"""v0.29.17-18 : fuir un combat : le risque de chaque unité d'être rattrapée, selon sa vitesse et celle du plus rapide des poursuivants."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { nature: 6, chaos: 4 }, retorts: [], race: 'highelf' } });
          App.start(g); UI.closeAll(); const me = App.me(); for (const id of ['earth_to_mud', 'magic_vortex']) if (!me.known.includes(id)) me.known.push(id); me.mana = 500; }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const A = ['HighElfSpearmen', 'HighElfLongbowmen', 'HighElfSwordsmen'].filter(t => DATA.units[t]).map(t => Units.create(g, t, me.id, 0, x, y));
          const D = ['OrcSwordsmen', 'OrcSpearmen', 'OrcCavalry'].filter(t => DATA.units[t]).map(t => Units.create(g, t, foe.id, 0, x, y));
          window._bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(5) });
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(900)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.abtn, button')].find(b => b.textContent.trim().startsWith('Fuir')); b.click(); }"); await pg.wait_for_timeout(500)
        print('FUITE', await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); return m ? m.innerText.replace(/\\n+/g, ' | ') : null; }"))
        await pg.screenshot(path=os.path.join(SHOTS, 'v02917_fuite.png'))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Fuir'); b.click(); }"); await pg.wait_for_timeout(2500)
        print('JOURNAL', await pg.evaluate("() => _bt.log.slice(-4).join(' / ')"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
