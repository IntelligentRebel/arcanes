"""v0.13 : prévision de bataille (survol d'un repaire), promotion d'un vétéran, gouverneur, tombeau d'un sorcier vaincu, nœud éveillé."""
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
          const pl = App.me(), c = g.cities[pl.fortress], w = g.world;
          // une armée près d'un repaire
          const lair = U.min(g.sites.filter(s => s.plane === c.plane && Game.siteHasGuardians(s) && s.type !== 'node' && s.type !== 'tower'), s => World.dist(w, s.x, s.y, c.x, c.y));
          let spot = null;
          for (const [x, y] of World.neighbors(w, lair.x, lair.y)) if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && World.get(w, 0, 'site', x, y) < 0) { spot = [x, y]; break; }
          const ids = ['Paladin', 'Paladin', 'HighMenSwordsmen', 'HighMenBowmen', 'HighMenSwordsmen'].map(t => Units.create(g, t, pl.id, 0, spot[0], spot[1]).id);
          Move.reveal(g, pl, 0, lair.x, lair.y, 3); MapView.invalidateVis(); MapView.bumpVis();
          MapView.ts = 72; MapView.centerOn(lair.x, lair.y, 0);
          window._lair = lair; window._ids = ids; window._c = c;
          return { lair: Game.siteName(lair), guardians: lair.guardians };
        }""")
        print('SETUP', info)
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll(); App.selectTile(0, App.game.units[_ids[0]].x, App.game.units[_ids[0]].y, _ids)")
        P = await pg.evaluate("(() => { const P = MapView.tileToScreen(_lair.x, _lair.y); return [P.x + MapView.ts / 2, P.y + MapView.ts / 2]; })()")
        await pg.mouse.move(P[0] - 3, P[1] - 3)
        await pg.mouse.move(P[0], P[1])
        await pg.wait_for_timeout(1200)
        print('FORECAST', await pg.evaluate("MapView.forecast && Game.forecastLabel(MapView.forecast)"))
        print('TILEINFO', await pg.evaluate("document.querySelector('#tileinfo').textContent.slice(0, 220)"))
        await pg.screenshot(path=os.path.join(SHOTS, '110-forecast.png'))
        # promotion
        r = await pg.evaluate("""() => {
          const g = App.game, c = _c, pl = App.me();
          c.buildings.armory = true; c.buildings.fightersGuild = true; pl.gold = 400;
          const u = Units.create(g, 'HighMenSpearmen', pl.id, c.plane, c.x, c.y); u.xp = 80;
          MapView.centerOn(c.x, c.y, c.plane); App.selectTile(c.plane, c.x, c.y, [u.id]);
          const btn = [...document.querySelectorAll('.actions .abtn')].find(b => /Promouvoir/.test(b.textContent));
          if (btn) btn.click();
          window._pu = u.id;
          return { button: !!btn, rows: [...document.querySelectorAll('.modal .row .t1')].map(e => e.textContent) };
        }""")
        print('PROMO', r)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, '111-promote.png'))
        await pg.evaluate("[...document.querySelectorAll('.modal .row')].pop().click()")
        await pg.wait_for_timeout(300)
        print('PROMOTED', await pg.evaluate("(() => { const u = App.game.units[_pu]; return [u.type, Units.levelInfo(App.game, u).name, App.me().gold]; })()"))
        # gouverneur
        g = await pg.evaluate("""() => {
          const g = App.game, c = _c, pl = App.me();
          UI.closeAll();
          const h = Heroes.spawn(g, pl, DATA.heroes.HeroZaldron, c.plane, c.x, c.y); h.xp = 130;
          App.selectTile(c.plane, c.x, c.y, [h.id]);
          const btn = [...document.querySelectorAll('.actions .abtn')].find(b => /Gouverner/.test(b.textContent));
          if (btn) btn.click();
          const e = Cities.econ(g, c);
          window._h = h.id;
          return { button: !!btn, status: h.status, governor: e.governor && e.governor.name, research: e.research };
        }""")
        print('GOV', g)
        await pg.evaluate("void CityUI.open(_c.id)")
        await pg.wait_for_timeout(500)
        print('CITY', await pg.evaluate("[...document.querySelectorAll('.modal .gold')].map(e => e.textContent).filter(t => /Gouverneur/.test(t))"))
        await pg.screenshot(path=os.path.join(SHOTS, '112-governor.png'))
        await pg.evaluate("UI.closeAll()")
        # tombeau
        t = await pg.evaluate("""() => {
          const g = App.game, foe = g.players[1];
          Game.banish(g, foe, App.me());
          for (const cc of Cities.ofPlayer(g, foe.id)) Game.destroyCity(g, cc);
          Game.checkElimination(g);
          const s = g.sites.find(x => x.type === 'tomb');
          Move.reveal(g, App.me(), s.plane, s.x, s.y, 2); MapView.invalidateVis(); MapView.bumpVis(); MapView.centerOn(s.x, s.y, s.plane);
          return { name: Game.siteName(s), guardians: s.guardians, spells: s.relic.spells.length, tile: App.tileInfoHtml(s.plane, s.x, s.y).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 160) };
        }""")
        print('TOMB', t)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '113-tomb.png'))
        # nœud éveillé
        n = await pg.evaluate("""() => {
          const g = App.game, pl = App.me();
          const node = U.min(g.sites.filter(s => s.type === 'node' && s.plane === 0), s => World.dist(g.world, s.x, s.y, _c.x, _c.y));
          node.owner = pl.id; node.guardians = []; node.cleared = true;
          for (let i = 0; i < 50; i++) { Game.nodesTick(g); g.turn++; }
          Move.reveal(g, pl, 0, node.x, node.y, 3); MapView.invalidateVis(); MapView.bumpVis(); MapView.centerOn(node.x, node.y, 0);
          return { power: node.power, awake: node.awake, bound: Object.values(g.units).filter(u => u.nodeBound === node.id).map(u => u.type), tile: App.tileInfoHtml(0, node.x, node.y).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 200) };
        }""")
        print('NODE', n)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '114-node.png'))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
