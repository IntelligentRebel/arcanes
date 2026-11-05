"""Animations des unités : repos et marche sur la carte, attaque et mort en combat (captures successives + erreurs)."""
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
        info = await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = App.me(), cap = g.cities[pl.fortress], w = g.world;
          // une case libre et plate à l'est de la capitale
          let spot = null;
          for (const [dx, dy] of [[2, 0], [2, 1], [1, 2], [-2, 0], [0, 2], [2, -1]]) { const x = World.wx(w, cap.x + dx), y = cap.y + dy; if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length) { spot = [x, y]; break; } }
          const u = Units.create(g, 'HighMenSwordsmen', pl.id, 0, spot[0], spot[1]);
          Move.revealAllFor(g, pl);
          MapView.ts = 150; MapView.centerOn(spot[0], spot[1], 0); MapView.bumpVis();
          window._u = u.id; window._spot = spot;
          return { anim: Anim.has('HighMenSwordsmen'), meta: Anim.meta.HighMenSwordsmen && [Anim.meta.HighMenSwordsmen.w, Anim.meta.HighMenSwordsmen.h], spot };
        }""")
        print('SETUP', info)
        await pg.wait_for_timeout(2600)
        await pg.evaluate("UI.closeAll(); App.deselect()")
        for i in range(3):
            await pg.wait_for_timeout(260)
            await pg.screenshot(path=os.path.join(SHOTS, f'80-map-idle-{i}.png'), clip={'x': 500, 'y': 250, 'width': 400, 'height': 360})
        # un pas vers l'est : capture en pleine marche
        await pg.evaluate("App.selectTile(0, window._spot[0], window._spot[1], [window._u]); window._mv = App.moveSelected(window._spot[0] + 1, window._spot[1])")
        await pg.wait_for_timeout(90)
        await pg.screenshot(path=os.path.join(SHOTS, '81-map-walk.png'))
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '82-map-after.png'))
        print('POS', await pg.evaluate("(() => { const u = App.game.units[window._u]; return [u.x, u.y, window._spot]; })()"))
        print('FACE', await pg.evaluate("MapView.face[window._u]"))
        # combat : des épéistes attaquent une pile ennemie faible
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), u = g.units[window._u];
          const foe = g.players[1]; pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          let tgt = null; for (const [x, y] of World.neighbors(g.world, u.x, u.y)) if (!World.isWaterAt(g.world, 0, x, y) && World.terr(g.world, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { tgt = [x, y]; break; }
          for (let i = 0; i < 3; i++) Units.create(g, 'HighMenSwordsmen', pl.id, 0, u.x, u.y);
          Units.create(g, 'BarbarianSpearmen', foe.id, 0, tgt[0], tgt[1]);
          u.moves = 2; window._tgt = tgt;
          const ids = Units.at(g, 0, u.x, u.y).filter(x => x.owner === pl.id).map(x => x.id);
          for (const id of ids) g.units[id].moves = 2;
          App.selectTile(0, u.x, u.y, ids);
          window._fight = App.moveSelected(tgt[0], tgt[1]);
        }""")
        await pg.wait_for_timeout(1800)
        print('COMBAT', await pg.evaluate("CombatView.active"))
        await pg.evaluate("UI.closeAll()")
        await pg.screenshot(path=os.path.join(SHOTS, '83-combat-idle.png'))
        # lancer le combat automatique et capturer pendant les échanges
        await pg.evaluate("CombatView.toggleAuto && CombatView.toggleAuto()")
        for i in range(6):
            await pg.wait_for_timeout(180)
            await pg.screenshot(path=os.path.join(SHOTS, f'84-combat-{i}.png'))
        for _ in range(60):
            if not await pg.evaluate("CombatView.active"): break
            await pg.wait_for_timeout(300)
        print('END', await pg.evaluate("CombatView.active"))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
