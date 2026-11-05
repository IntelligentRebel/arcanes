"""v0.17.6 : statut des cités sur la carte, infobulles des sceptres, contact -> lieu, trésor sans doublon, coup d'oeil sur la carte."""
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
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 6, chaos: 4 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        # 1. deux cités : la capitale qui grandit, une seconde qui meurt de faim
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), cap = g.cities[pl.fortress];
          cap.pop = 4620;
          Cities.setProduction(g, cap, { type: 'building', id: Cities.buildableBuildings(g, cap)[0] });
          let spot = null; const w = g.world;
          for (const [dx, dy] of [[4, 2], [-4, 2], [4, -2], [-4, -2], [3, 3], [-3, 3]]) { const x = World.wx(w, cap.x + dx), y = cap.y + dy; if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Cities.at(g, 0, x, y) && World.get(w, 0, 'site', x, y) < 0) { spot = [x, y]; break; } }
          const c2 = Cities.create(g, pl.id, 'highmen', 0, spot[0], spot[1], { pop: 3300 });
          window._c2 = c2 && c2.id;
          if (c2) { c2.ench.push({ spell: 'pestilence', owner: 1 }); Cities.setProduction(g, c2, { type: 'unit', id: 'HighMenSpearmen' }); }
          Move.revealAllFor(g, pl); MapView.ts = 64; MapView.centerOn(cap.x + 2, cap.y + 1, 0); App.refresh();
          return !!c2;
        }""")
        await pg.wait_for_timeout(600)
        print('C2', await pg.evaluate("(() => { const i = MapView.cityInfo(App.game.cities[window._c2]); return { growth: i.growth, toGrow: i.toGrow, frac: i.frac }; })()"))
        await pg.screenshot(path=os.path.join(SHOTS, '190-city-status.png'))
        # survol de la capitale
        pos = await pg.evaluate("""() => { const c = App.game.cities[App.me().fortress]; for (let sy = 60; sy < innerHeight; sy += 4) for (let sx = 0; sx < innerWidth - 320; sx += 4) { const el = document.elementFromPoint(sx, sy); if (!el || el.id !== 'map') continue; const t = MapView.screenToTile(sx, sy); if (t.x === c.x && t.y === c.y) return [sx + 12, sy + 12]; } return null; }""")
        await pg.mouse.move(pos[0] - 40, pos[1]); await pg.mouse.move(pos[0], pos[1]); await pg.wait_for_timeout(700)
        print('TIP CITE', await pg.evaluate("(() => { const t = document.querySelector('#tooltip'); return t.style.display !== 'none' ? t.textContent.slice(0, 260) : null; })()"))
        await pg.screenshot(path=os.path.join(SHOTS, '191-city-tip.png'))
        await pg.mouse.move(5, 500)
        # 2. sceptres
        await pg.evaluate("void MagicUI.magic()"); await pg.wait_for_timeout(500)
        for i in range(3):
            el = (await pg.query_selector_all('.stv-name'))[i]
            bb = await el.bounding_box()
            await pg.mouse.move(bb['x'] + 5, bb['y'] + 5); await pg.mouse.move(bb['x'] + 10, bb['y'] + 8); await pg.wait_for_timeout(250)
            print('SCEPTRE', i, await pg.evaluate("document.querySelector('#tooltip').textContent.slice(0, 200)"))
        await pg.screenshot(path=os.path.join(SHOTS, '192-staff-tip.png'))
        await pg.mouse.move(5, 500); await pg.evaluate("UI.closeAll()")
        # 3. premier contact -> lieu
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), foe = g.players[1], w = g.world;
          const sc = Object.values(g.units).find(u => u.owner === pl.id && Units.isScout(u));
          let spot = null;
          for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, -3]]) { const x = World.wx(w, sc.x + dx), y = sc.y + dy; if (World.inY(w, y) && !World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { spot = [x, y, dx, dy]; break; } }
          Units.create(g, 'HighMenSpearmen', foe.id, 0, spot[0], spot[1]);
          sc.moves = 6; MapView.centerOn(0, 0, 0);
          App.selectTile(0, sc.x, sc.y, [sc.id]);
          void App.moveSelected(World.wx(w, sc.x + Math.sign(spot[2])), sc.y + Math.sign(spot[3]));
        }""")
        await pg.wait_for_timeout(2200)
        print('CONTACT', await pg.evaluate("[...document.querySelectorAll('.modal footer button')].map(b => b.textContent)"))
        await pg.click('#contact-pic')
        await pg.wait_for_timeout(500)
        print('APRES CLIC PORTRAIT', await pg.evaluate("({ modals: UI.modals.length, cam: [Math.round(MapView.camX), Math.round(MapView.camY)], pings: (MapView.pings || []).map(p => [p.x, p.y]) })"))
        await pg.screenshot(path=os.path.join(SHOTS, '193-contact-place.png'))
        await pg.evaluate("UI.closeAll()")
        # 4. trésor : une seule annonce (la fenêtre), pas de bandeau
        n = await pg.evaluate("""async () => {
          const g = App.game, pl = App.me();
          document.querySelectorAll('#toasts .toast').forEach(t => t.remove());
          const site = g.sites.find(s => s.type !== 'node' && s.type !== 'tower' && s.type !== 'breach' && s.type !== 'shrine' && s.type !== 'rift' && s.plane === 0);
          site.budget = 300;
          const p = Game.lootSite(g, site, pl.id, []);
          await new Promise(r => setTimeout(r, 300));
          const res = { toasts: [...document.querySelectorAll('#toasts .toast')].filter(t => /pillé/.test(t.textContent)).length, modals: [...document.querySelectorAll('.modal header h2')].map(h => h.textContent) };
          UI.closeAll(); await p; return res;
        }""")
        print('TRESOR', n)
        # 5. fenêtre de production automatique : coup d'oeil sur la carte
        await pg.evaluate("void CityUI.chooseProduction(null, App.game.cities[App.me().fortress])")
        await pg.wait_for_timeout(600)
        print('PIED', await pg.evaluate("[...document.querySelectorAll('.modal footer button')].map(b => b.textContent)"))
        await pg.click('.modal footer button:has-text("Voir la cité sur la carte")')
        await pg.wait_for_timeout(400)
        print('COUP D OEIL', await pg.evaluate("({ peeking: document.body.classList.contains('peeking'), bar: !!document.querySelector('#peekbar'), modals: UI.modals.length })"))
        await pg.screenshot(path=os.path.join(SHOTS, '194-peek.png'))
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(300)
        print('RETOUR', await pg.evaluate("({ peeking: document.body.classList.contains('peeking'), modals: UI.modals.length })"))
        await pg.evaluate("UI.closeAll()")
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
