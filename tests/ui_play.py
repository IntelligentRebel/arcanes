"""Scénario de jeu scripté dans Chromium : fondation, exploration, combat tactique manuel, écrans."""
import asyncio, os, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
async def wait_idle(pg, tries=80):
    for _ in range(tries):
        await pg.wait_for_timeout(200)
        if not await pg.evaluate("UI.busy") and not await pg.evaluate("CombatView.active"): return
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type in ('error',) else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(700)
        await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 4242, opponents: 3, human: { name: 'Morwen', portrait: 2, books: { chaos: 5, sorcery: 6 }, retorts: [], race: 'highmen' } });
          App.start(g);
        }""")
        await pg.wait_for_timeout(500)
        await pg.evaluate("UI.closeAll()")
        # recherche
        await pg.evaluate("() => { const pl = App.me(); pl.researching = pl.researchOptions[0]; App.refresh(); }")
        # colon : trouver un site et fonder
        r = await pg.evaluate("""async () => {
          const g = App.game, pl = App.me();
          const s = Object.values(g.units).find(u => u.owner === pl.id && Units.isSettler(u));
          const site = AI.findCitySite(g, pl, s);
          if (!site) return 'pas de site';
          await Game.moveGroup(g, [s.id], site[0], site[1], {});
          return JSON.stringify(site) + ' -> ' + s.x + ',' + s.y;
        }""")
        print('SETTLER', r)
        for t in range(4):
            await pg.evaluate("void App.endTurn(true)"); await wait_idle(pg)
            await pg.evaluate("""async () => { const g = App.game, pl = App.me(); const s = Object.values(g.units).find(u => u.owner === pl.id && Units.isSettler(u)); if (!s) return; if (s.path && s.path.length) await Game.continueMove(g, [s.id], {}); const ok = Cities.canFoundAt(g, pl.id, s.plane, s.x, s.y); if (ok.ok && !(s.path && s.path.length)) { Game.foundCity(g, s.id); MapView.invalidate(); } }""")
        print('CITIES', await pg.evaluate("Cities.ofPlayer(App.game, App.pid).map(c => c.name).join(',')"))
        # révéler un large secteur pour juger le rendu
        await pg.evaluate("() => { const pl = App.me(); const fc = App.game.cities[pl.fortress]; Move.reveal(App.game, pl, fc.plane, fc.x, fc.y, 13); MapView.bumpVis(); MapView.ts = 44; App.refresh(); }")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '10-map-wide.png'))
        # combat : armée puissante près d'une tanière
        info = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(); const fc = g.cities[pl.fortress];
          const lair = U.min(g.sites.filter(s => s.plane === fc.plane && Game.siteHasGuardians(s) && s.type !== 'node' && s.type !== 'tower'), s => World.dist(g.world, s.x, s.y, fc.x, fc.y));
          let spot = null;
          for (const [x, y] of World.neighbors(g.world, lair.x, lair.y)) if (!World.isWaterAt(g.world, lair.plane, x, y) && !Units.at(g, lair.plane, x, y).length && World.get(g.world, lair.plane, 'site', x, y) < 0) { spot = [x, y]; break; }
          const types = ['HighMenSwordsmen', 'HighMenSwordsmen', 'HighMenBowmen', 'HighMenBowmen', 'Paladin', 'HighMenMagician', 'HighMenPriest', 'HighMenCavalry'];
          const ids = types.map(t => Units.create(g, t, pl.id, lair.plane, spot[0], spot[1]).id);
          Heroes.spawn(g, pl, DATA.heroes.HeroGunther, lair.plane, spot[0], spot[1]);
          pl.known.push('fire_bolt', 'lightning_bolt', 'prayer', 'haste');
          pl.mana = 500;
          Move.reveal(g, pl, lair.plane, lair.x, lair.y, 3);
          MapView.centerOn(spot[0], spot[1], lair.plane); App.selectTile(lair.plane, spot[0], spot[1]); MapView.bumpVis();
          window._lair = lair;
          return { lair: [lair.x, lair.y, lair.type, lair.guardians.join('+')], spot };
        }""")
        print('LAIR', info)
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '11-before-attack.png'))
        # combat manuel
        await pg.evaluate("window.AUTO_CHOICE = false; window.AUTO_COMBAT = false;")
        await pg.evaluate("void App.moveSelected(window._lair.x, window._lair.y)")
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, '12-confirm.png'))
        # confirmation d'exploration puis choix "Commander la bataille"
        btn = pg.locator('.modal footer .btn.primary')
        if await btn.count(): await btn.first.click(); await pg.wait_for_timeout(600)
        btn = pg.locator('.modal footer .btn.primary')
        if await btn.count(): await btn.first.click(); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=os.path.join(SHOTS, '13-combat.png'))
        # jouer un tour : tout passer en automatique après une capture
        st = await pg.evaluate("({active: CombatView.active, side: CombatView.bt && CombatView.bt.side, units: CombatView.bt && CombatView.bt.units.length})")
        print('COMBAT', st)
        await pg.evaluate("CombatView.spellMenu()"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '14-combat-spells.png'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.evaluate("window.AUTO_CHOICE = true"); 
        await pg.evaluate("CombatView.toggleAuto()")
        await wait_idle(pg, 150)
        await pg.screenshot(path=os.path.join(SHOTS, '15-after-combat.png'))
        print('LOG', await pg.evaluate("App.game.log.slice(-6).map(e=>e.text).join(' | ')"))
        print('ERRORS', len(errors))
        for e in errors[:30]: print(' ', e)
        await b.close()
asyncio.run(main())
