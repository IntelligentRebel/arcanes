"""v0.29.14 : les sorts de zone en combat : la zone entière s'affiche pendant la visée (Bourbier 5 × 5, Vortex magique 3 × 3), et la boue se voit après."""
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
        foe = await pg.evaluate("() => { const f = _bt.alive(1 - CombatView.humanSide)[0]; return [f.c, f.r]; }")
        for sid in ('earth_to_mud', 'magic_vortex'):
            await pg.evaluate("(a) => { CombatView.prepareCast(a[0], null); CombatView.hover = { c: a[1], r: a[2] }; }", [sid, foe[0], foe[1]])
            await pg.wait_for_timeout(500)
            await pg.screenshot(path=os.path.join(SHOTS, 'v02914_' + sid + '.png'))
            print(sid, 'zone', await pg.evaluate("(a) => { const z = CombatView.zoneOf(a[0], a[1], a[2]); return z ? z.size : null; }", [sid, foe[0], foe[1]]),
                  'bulle', await pg.evaluate("() => (document.querySelector('#c-left') || {}).innerText"))
            await pg.evaluate("() => { CombatView.mode = null; }")
        # la boue lancée : les 25 cases (ou ce qu'il en reste dans le champ) sont marquées
        r = await pg.evaluate("""(f) => { const bt = _bt; CombatSpells.cast(bt, CombatView.humanSide, 'earth_to_mud', [f[0], f[1]], null, 0); return Object.keys(bt.mud).filter(k => { const [c, r] = k.split(',').map(Number); return c >= 0 && r >= 0 && c < 13 && r < 13; }).length; }""", foe)
        print('BOUE', r)
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=os.path.join(SHOTS, 'v02914_boue.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
