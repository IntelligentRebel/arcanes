"""v0.29.10-11 : la Toile se voit en combat : de la soie sur chaque figurine prise, plus pâle et déchirée à mesure qu'elle s'en dégage."""
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
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const A = ['HighElfSpearmen', 'HighElfLongbowmen'].filter(t => DATA.units[t]).map(t => Units.create(g, t, me.id, 0, x, y));
          const D = ['OrcSwordsmen', 'OrcSpearmen', 'GreatDrake'].filter(t => DATA.units[t]).map(t => Units.create(g, t, foe.id, 0, x, y));
          window._bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(5) });
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(900)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        # la Toile sur les trois unités adverses : intacte (12), entamée (7), presque défaite (3)
        r = await pg.evaluate("""() => { const bt = _bt, foes = bt.alive(1 - CombatView.humanSide);
          foes.forEach((f, i) => { f.web = [12, 7, 3][i] || 12; f.moves = 0; });
          return foes.map(f => f.u.type + ' toile ' + f.web).join(', '); }""")
        print('TOILES', r)
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=os.path.join(SHOTS, 'v02910_toile.png'))
        # sans l'image (installation sans hd2) : les fils tracés
        await pg.evaluate("() => { window._keep = [Sprites.hdMap['ov:web'], Sprites.hdMap['ov:web_torn']]; delete Sprites.hdMap['ov:web']; delete Sprites.hdMap['ov:web_torn']; }")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=os.path.join(SHOTS, 'v02910_toile_fils.png'))
        await pg.evaluate("() => { Sprites.hdMap['ov:web'] = _keep[0]; Sprites.hdMap['ov:web_torn'] = _keep[1]; }")
        print('IMAGE UTILISÉE', await pg.evaluate("Sprites.hasHD('ov:web') && Sprites.hasHD('ov:web_torn')"))
        await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
