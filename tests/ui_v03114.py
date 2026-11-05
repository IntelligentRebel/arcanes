"""v0.31.14 : bataille commandée → « Automatiser toute la bataille » (A) puis « Reprendre la main » (A), même pendant l'animation ;
« Automatiser cette unité » (U) ; la résolution automatique choisie au début reste sans retour."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'

SETUP = """(n) => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
  const A = Array.from({ length: n }, () => Units.create(g, 'HighMenSpearmen', me.id, fc.plane, fc.x + 1, fc.y)).concat([Units.create(g, 'HighMenEngineer', me.id, fc.plane, fc.x + 1, fc.y)]);
  const D = [0, 1, 2, 3].map(() => Units.create(g, 'Skeleton', -1, fc.plane, fc.x + 1, fc.y));
  const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: -1, plane: fc.plane, x: fc.x + 1, y: fc.y, rng: new RNG(3) }); window._bt = bt; window._done = false; CombatView.run(g, bt, {}).then(() => { window._done = true; }); }"""
BAR = "() => [...document.querySelectorAll('#c-bar button')].map(b => b.textContent + (b.disabled ? ' [grisé]' : ''))"
CLICK = "(lab) => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith(lab)); btn && btn.click(); return !!btn; }"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 6 }, retorts: [], race: 'highmen' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # 1. bataille commandée
        await pg.evaluate(SETUP, 3); await pg.wait_for_timeout(700)
        print('COMMANDER', await pg.evaluate(CLICK, 'Commander')); await pg.wait_for_timeout(1200)
        print('BARRE MANUELLE', await pg.evaluate(BAR))
        # automatiser cette unité (la sélection), puis toute la bataille, puis reprendre la main pendant que ça joue
        print('SÉLECTION', await pg.evaluate("() => CombatView.sel && _bt.name(CombatView.sel)"))
        await pg.keyboard.press('u'); await pg.wait_for_timeout(1500)
        print('UNITÉ AUTO', await pg.evaluate("() => _bt.alive(_bt.humanSide != null ? _bt.humanSide : 0).filter(b => b.autoCtl).map(b => _bt.name(b) + ' mvt ' + b.moves)"), '| sélection', await pg.evaluate("() => CombatView.sel && _bt.name(CombatView.sel)"))
        await pg.screenshot(path=os.path.join(OUT, 'combat_unite_auto.png'))
        await pg.keyboard.press('a'); await pg.wait_for_timeout(250)
        print('BARRE AUTO', await pg.evaluate(BAR), 'auto', await pg.evaluate("() => CombatView.auto"))
        await pg.keyboard.press('a'); await pg.wait_for_timeout(2500)
        print('REPRISE', await pg.evaluate("() => ({ auto: CombatView.auto, busy: CombatView.busy, tour: _bt.side === CombatView.humanSide ? 'à vous' : 'adverse', fini: _bt.over })"), await pg.evaluate(BAR))
        print('CLIC POSSIBLE', await pg.evaluate("() => !CombatView.busy && !CombatView.auto && _bt.side === CombatView.humanSide"))
        await pg.evaluate("() => { const bt = _bt; for (const f of bt.alive(1)) { f.dead = true; bt.dead.push(f); } bt.checkEnd(); CombatView.finish(); }"); await pg.wait_for_timeout(1500)
        await pg.evaluate("() => UI.closeAll()"); await pg.wait_for_timeout(800)
        # 2. résolution automatique choisie au début : sans retour
        await pg.evaluate(SETUP, 3); await pg.wait_for_timeout(700)
        print('AUTO AU DÉBUT', await pg.evaluate(CLICK, 'Résolution automatique')); await pg.wait_for_timeout(300)
        print('BARRE AUTO DÉBUT', await pg.evaluate(BAR)); await pg.keyboard.press('a'); await pg.wait_for_timeout(200)
        print('TOUJOURS AUTO', await pg.evaluate("() => CombatView.auto"))
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
