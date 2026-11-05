"""v0.17.9 : après une résolution automatique, accepter le résultat ou rejouer la bataille à la main (même terrain, mêmes troupes)."""
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
          const g = Game.newGame({ seed: 7, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        info = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), w = g.world, foe = g.players[1];
          pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          let at = null;
          for (let y = 3; y < w.h - 3 && !at; y++) for (let x = 0; x < w.w && !at; x++) {
            if (World.terr(w, 0, x, y) !== T.FOREST || Cities.at(g, 0, x, y) || World.get(w, 0, 'site', x, y) >= 0 || Units.at(g, 0, x, y).length) continue;
            for (const [nx, ny] of World.neighbors(w, x, y)) if (!World.isWaterAt(w, 0, nx, ny) && World.terr(w, 0, nx, ny) !== T.MOUNTAIN && !Units.at(g, 0, nx, ny).length && !Cities.at(g, 0, nx, ny) && World.get(w, 0, 'site', nx, ny) < 0) { at = [x, y, nx, ny]; break; }
          }
          ['HighMenSwordsmen', 'HighMenSpearmen', 'HighMenBowmen'].forEach(t => Units.create(g, t, foe.id, 0, at[0], at[1]));
          const ids = ['HighMenSwordsmen', 'HighMenSpearmen', 'HighMenBowmen'].map(t => Units.create(g, t, pl.id, 0, at[2], at[3]).id);
          for (const id of ids) g.units[id].moves = 2;
          window._ids = ids; window._mana0 = pl.mana; window._nunits0 = Object.keys(g.units).length;
          Move.revealAllFor(g, pl); MapView.centerOn(at[0], at[1], 0);
          App.selectTile(0, at[2], at[3], ids);
          window._done = false; App.moveSelected(at[0], at[1]).then(() => { window._done = true; });
          return at;
        }""")
        await pg.wait_for_timeout(2000)
        props0 = await pg.evaluate("JSON.stringify(Object.keys(CombatView.bt.props).sort())")
        await pg.click('.modal button:has-text("Résolution automatique")')
        for _ in range(160):
            await pg.wait_for_timeout(250)
            if await pg.evaluate("!!document.querySelector('.modal button') && [...document.querySelectorAll('.modal button')].some(b => /Rejouer|Continuer/.test(b.textContent))"):
                break
        await pg.wait_for_timeout(300)
        print('FIN AUTO', await pg.evaluate("[...document.querySelectorAll('.modal footer button')].map(b => b.textContent)"), await pg.evaluate("document.querySelector('.modal .body').textContent.slice(0, 120)"))
        print('DEGATS APRES AUTO', await pg.evaluate("window._ids.map(id => App.game.units[id] ? App.game.units[id].dmg : 'mort')"))
        await pg.screenshot(path=os.path.join(SHOTS, '200-auto-result.png'))
        await pg.click('.modal button:has-text("Rejouer manuellement")')
        await pg.wait_for_timeout(800)
        st = await pg.evaluate("""() => { const bt = CombatView.bt; return { active: CombatView.active, auto: CombatView.auto, replayed: CombatView.replayed, units: bt.units.length, dead: bt.dead.length, dmg: window._ids.map(id => App.game.units[id].dmg), mana: App.me().mana === window._mana0, nunits: Object.keys(App.game.units).length === window._nunits0, sameTerrain: JSON.stringify(Object.keys(bt.props).sort()) }; }""")
        print('REJEU', {k: v for k, v in st.items() if k != 'sameTerrain'}, 'terrain identique', st['sameTerrain'] == props0)
        await pg.screenshot(path=os.path.join(SHOTS, '201-replay.png'))
        # on joue en automatique cette fois pour finir vite : plus de proposition de rejouer
        await pg.evaluate("CombatView.toggleAuto()")
        for _ in range(160):
            await pg.wait_for_timeout(250)
            if await pg.evaluate("[...document.querySelectorAll('.modal footer button')].some(b => /Continuer|Accepter/.test(b.textContent))"):
                break
        print('FIN REJEU', await pg.evaluate("[...document.querySelectorAll('.modal footer button')].map(b => b.textContent)"))
        expect = await pg.evaluate("CombatView.bt.dead.filter(b => b.side === CombatView.humanSide).map(b => b.u.id)")
        await pg.click('.modal footer button')
        for _ in range(40):
            await pg.wait_for_timeout(250)
            if await pg.evaluate("window._done"): break
        await pg.evaluate("UI.closeAll()")
        gone = await pg.evaluate("window._ids.filter(id => !App.game.units[id])")
        print('RESULTAT APPLIQUE', sorted(gone) == sorted(expect), gone, expect)
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
