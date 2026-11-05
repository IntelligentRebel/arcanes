"""v0.16 : terrain tactique en combat (forêt, collines, rochers, gué, feu), rendu et panneau de terrain."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def battle_on(pg, terr, shot, burn=False):
    info = await pg.evaluate("""(terr) => {
      const g = App.game, pl = App.me(), w = g.world, foe = g.players[1];
      UI.closeAll();
      pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
      let at = null;
      for (let y = 3; y < w.h - 3 && !at; y++) for (let x = 0; x < w.w && !at; x++) {
        if (World.terr(w, 0, x, y) !== T[terr] || Cities.at(g, 0, x, y) || World.get(w, 0, 'site', x, y) >= 0 || Units.at(g, 0, x, y).length) continue;
        for (const [nx, ny] of World.neighbors(w, x, y)) if (!World.isWaterAt(w, 0, nx, ny) && World.terr(w, 0, nx, ny) !== T.MOUNTAIN && !Units.at(g, 0, nx, ny).length && !Cities.at(g, 0, nx, ny) && World.get(w, 0, 'site', nx, ny) < 0) { at = [x, y, nx, ny]; break; }
      }
      if (!at) return null;
      ['HighMenBowmen', 'HighMenSwordsmen', 'FireGiant'].forEach(t => Units.create(g, t, foe.id, 0, at[0], at[1]));
      const ids = ['HighMenBowmen', 'HighMenSwordsmen', 'HighMenSpearmen', 'Paladin', 'HighMenMagician'].map(t => Units.create(g, t, pl.id, 0, at[2], at[3]).id);
      for (const id of ids) g.units[id].moves = 2;
      Move.revealAllFor(g, pl); MapView.centerOn(at[0], at[1], 0);
      App.selectTile(0, at[2], at[3], ids);
      void App.moveSelected(at[0], at[1]);
      return at;
    }""", terr)
    await pg.wait_for_timeout(2500)
    await pg.evaluate("UI.closeAll()")
    st = await pg.evaluate("""(burn) => {
      const bt = CombatView.bt; if (!bt) return null;
      if (burn) { const k = Object.keys(bt.props).filter(k => bt.props[k].kind === 'tree'); for (const kk of k.slice(0, 3)) { const [c, r] = kk.split(',').map(Number); bt.ignite(c, r); } bt.burnTick(); }
      const kinds = {}; for (const k in bt.props) kinds[bt.props[k].kind] = (kinds[bt.props[k].kind] || 0) + 1;
      return { kinds, hills: Object.keys(bt.hills).length, river: Object.keys(bt.river).length, fire: Object.keys(bt.fire).length };
    }""", burn)
    await pg.wait_for_timeout(600)
    # survol d'une case de terrain
    pt = await pg.evaluate("""() => {
      const bt = CombatView.bt; if (!bt) return null;
      const k = Object.keys(bt.fire).find(k => !bt.unitAt(...k.split(',').map(Number))) || Object.keys(bt.props).find(k => bt.props[k].kind === 'tree' && !bt.unitAt(...k.split(',').map(Number))) || Object.keys(bt.hills).find(k => !bt.unitAt(...k.split(',').map(Number))) || Object.keys(bt.river)[0] || Object.keys(bt.props)[0];
      if (!k) return null;
      const [c, r] = k.split(',').map(Number); const p = CombatView.iso(c, r); const rect = CombatView.cv.getBoundingClientRect();
      return [rect.left + p.x, rect.top + p.y];
    }""")
    if pt:
        await pg.mouse.move(pt[0], pt[1] - 2)
        await pg.mouse.move(pt[0], pt[1])
        await pg.wait_for_timeout(400)
    panel = await pg.evaluate("(() => { const e = document.querySelector('#c-right'); return e && e.style.display !== 'none' ? e.textContent.slice(0, 200) : null; })()")
    await pg.screenshot(path=os.path.join(SHOTS, shot))
    print(terr, info, st, 'PANEL', panel)
    # combat automatique jusqu'au bout
    await pg.evaluate("(() => { if (CombatView.bt && !CombatView.auto) CombatView.toggleAuto(); })()")
    for _ in range(80):
        await pg.wait_for_timeout(250)
        if await pg.evaluate("!CombatView.active || CombatView.finished"):
            break
    await pg.wait_for_timeout(600)
    await pg.evaluate("UI.closeAll()")
    await pg.wait_for_timeout(400)
    print('   fini', await pg.evaluate("!CombatView.active || CombatView.finished"))


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
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 7, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(2500)
        await battle_on(pg, 'FOREST', '140-combat-forest.png', burn=True)
        await battle_on(pg, 'HILLS', '141-combat-hills.png')
        await battle_on(pg, 'RIVER', '142-combat-river.png')
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
