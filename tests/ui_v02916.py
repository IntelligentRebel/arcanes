"""v0.29.15-16 : les sorts de cité ne proposent que les cités où ils serviraient (Mur de pierre : pas celles qui ont des murailles) ;
au choix sur la carte, ces cités-là sont cerclées d'or."""
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
        # trois cités : la capitale avec murailles, deux sans
        print(await pg.evaluate("""() => { const g = App.game, me = App.me(), f = g.cities[me.fortress], w = g.world; f.buildings.cityWalls = true; let n = 0;
          for (let d = 4; d < 14 && n < 2; d++) for (let dx = -d; dx <= d && n < 2; dx += 4) { const x = World.wx(w, f.x + dx), y = f.y + d; if (y > w.h - 3) continue;
            if (World.isWaterAt(w, f.plane, x, y) || Cities.at(g, f.plane, x, y) || World.get(w, f.plane, 'site', x, y) >= 0) continue;
            const c = Cities.create(g, me.id, me.race, f.plane, x, y, { pop: 2000 + n * 1000 }); c.name = ['Ilvane', 'Sorelle'][n]; n++; }
          me.mana = 999; if (!me.known.includes('wall_of_stone')) me.known.push('wall_of_stone'); return Cities.ofPlayer(g, me.id).map(c => c.name + (c.buildings.cityWalls ? ' (murailles)' : '')).join(', '); }"""))
        await pg.evaluate("MagicUI.beginCast('wall_of_stone')"); await pg.wait_for_timeout(400)
        print('LISTE', await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); return m ? m.innerText.replace(/\\n+/g, ' | ') : null; }"))
        await pg.screenshot(path=os.path.join(SHOTS, 'v02915_mur.png'))
        # sur la carte : les cités possibles cerclées d'or ; la capitale murée refuse, Ilvane accepte
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')].find(b => /carte/.test(b.textContent)); b.click(); }"); await pg.wait_for_timeout(500)
        print('VISÉE', await pg.evaluate("() => JSON.stringify({ sort: MagicUI.targeting && MagicUI.targeting.id, cités: MagicUI.targeting && [...MagicUI.targeting.cities].map(i => App.game.cities[i].name) })"))
        await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; MapView.centerOn(c.x, c.y + 3, c.plane); }"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=os.path.join(SHOTS, 'v02916_carte.png'))
        await pg.evaluate("() => { window._t = []; const ot = UI.toast; UI.toast = (m, k) => { _t.push(m); return ot(m, k); }; const c = App.game.cities[App.me().fortress]; MagicUI.pickTarget(c.plane, c.x, c.y); }")
        print('CLIC CAPITALE', await pg.evaluate("_t.join(' / ')"), '| visée toujours active :', await pg.evaluate("!!MagicUI.targeting"))
        await pg.evaluate("() => { const c = Cities.ofPlayer(App.game, App.me().id).find(c => c.name === 'Ilvane'); MagicUI.pickTarget(c.plane, c.x, c.y); }"); await pg.wait_for_timeout(300)
        print('CLIC ILVANE', await pg.evaluate("() => { const g = App.game, me = App.me(), c = Cities.ofPlayer(g, me.id).find(c => c.name === 'Ilvane'); return JSON.stringify({ murailles: !!c.buildings.cityWalls, enCours: me.casting ? me.casting.id + ' sur ' + (me.casting.target && g.cities[me.casting.target.city] ? g.cities[me.casting.target.city].name : '?') : null, visée: !!MagicUI.targeting }); }"))
        await pg.evaluate("UI.closeAll()")
        # toutes murées : un simple message
        await pg.evaluate("() => { for (const c of Cities.ofPlayer(App.game, App.me().id)) c.buildings.cityWalls = true; window._t = []; const ot = UI.toast; UI.toast = (m, k) => { _t.push(m); return ot(m, k); }; MagicUI.beginCast('wall_of_stone'); }")
        await pg.wait_for_timeout(300)
        print('MESSAGE', await pg.evaluate("_t.join(' / ')"), '| fenêtre ouverte :', await pg.evaluate("document.querySelectorAll('.modal').length"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
