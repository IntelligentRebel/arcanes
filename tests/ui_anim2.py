"""Les 10 unités animées des Hauts-Hommes : alignées sur la carte, puis une armée mixte en combat (tirs, sorts, mêlée, morts)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
TYPES = ['HighMenSwordsmen', 'HighMenSpearmen', 'HighMenBowmen', 'HighMenPikemen', 'HighMenCavalry', 'Paladin', 'HighMenPriest',
         'HighMenMagician', 'HighMenEngineer', 'HighMenSettlers']


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 900})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        info = await pg.evaluate("""(types) => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 33, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, sorcery: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = App.me(), w = g.world, cap = g.cities[pl.fortress];
          // une rangée de cases libres et praticables près de la capitale
          let row = null;
          for (let dy = -6; dy <= 6 && !row; dy++) for (let dx = -12; dx <= 0 && !row; dx++) {
            const cells = [];
            for (let k = 0; k < types.length; k++) { const x = World.wx(w, cap.x + dx + k), y = cap.y + dy; if (y < 1 || y >= w.h - 1 || World.isWaterAt(w, 0, x, y) || World.terr(w, 0, x, y) === T.MOUNTAIN || Units.at(g, 0, x, y).length || Cities.at(g, 0, x, y)) break; cells.push([x, y]); }
            if (cells.length === types.length) row = cells;
          }
          if (!row) return { err: 'pas de rangée libre' };
          types.forEach((t, k) => Units.create(g, t, pl.id, 0, row[k][0], row[k][1]));
          Move.revealAllFor(g, pl);
          MapView.ts = 110; MapView.centerOn(row[4][0], row[4][1], 0); MapView.bumpVis();
          window._row = row;
          return { animated: types.filter(t => Anim.has(t)).length, row: row[0] };
        }""", TYPES)
        print('SETUP', info)
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll(); App.deselect()")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '91-map-highmen.png'))
        # combat : armée mixte contre une pile barbare
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), w = g.world, [x0, y0] = window._row[4];
          const foe = g.players[1]; pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          let tgt = null; for (const [x, y] of World.neighbors(w, x0, y0)) if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { tgt = [x, y]; break; }
          for (const u of Units.at(g, 0, x0, y0)) delete g.units[u.id];
          const ids = ['HighMenSwordsmen', 'HighMenSpearmen', 'HighMenBowmen', 'HighMenCavalry', 'Paladin', 'HighMenPriest', 'HighMenMagician', 'HighMenPikemen'].map(t => Units.create(g, t, pl.id, 0, x0, y0).id);
          for (const t of ['BarbarianSwordsmen', 'BarbarianSpearmen', 'BarbarianBowmen', 'BarbarianCavalry']) Units.create(g, t, foe.id, 0, tgt[0], tgt[1]);
          for (const id of ids) g.units[id].moves = 2;
          App.selectTile(0, x0, y0, ids);
          window._fight = App.moveSelected(tgt[0], tgt[1]);
        }""")
        await pg.wait_for_timeout(2200)
        await pg.evaluate("UI.closeAll()")
        print('COMBAT', await pg.evaluate("CombatView.active"))
        await pg.screenshot(path=os.path.join(SHOTS, '92-combat-highmen.png'))
        await pg.evaluate("CombatView.toggleAuto && CombatView.toggleAuto()")
        for i in range(8):
            await pg.wait_for_timeout(450)
            await pg.screenshot(path=os.path.join(SHOTS, f'93-combat-{i}.png'))
        for _ in range(120):
            if not await pg.evaluate("CombatView.active"): break
            await pg.wait_for_timeout(400)
            await pg.evaluate("UI.closeAll()")
        print('END', await pg.evaluate("CombatView.active"))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
