"""v0.15 : sanctuaires et pactes (offre, échéance), voile et failles (passage, sceau), la Crise (Brèche, vague, fermeture)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def settle(pg, n=60):
    for _ in range(n):
        await pg.wait_for_timeout(250)
        if not await pg.evaluate("UI.busy"):
            break


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        # écran de création : l'option de la Crise
        print('SETUP', await pg.evaluate("""() => { Setup.newGame(); const s = [...document.querySelectorAll('.modal label')].find(l => /La Crise/.test(l.textContent)); const r = s ? [...s.querySelectorAll('option')].map(o => o.textContent) : null; UI.closeAll(); return r; }"""))
        info = await pg.evaluate("""() => {
          document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'normal', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const shrines = g.sites.filter(s => s.type === 'shrine').map(s => [s.entity, s.plane, s.x, s.y]);
          return { shrines, veil: g.veil, crisis: g.crisis };
        }""")
        print('INIT', info)
        await pg.wait_for_timeout(2500)
        # 1. un éclaireur entre dans le sanctuaire de l'Usurier
        r = await pg.evaluate("""() => {
          window.AUTO_CHOICE = false; UI.closeAll();
          const g = App.game, pl = App.me(), s = g.sites.find(x => x.type === 'shrine' && x.entity === 'usurer');
          let spot = null; for (const [x, y] of World.neighbors(g.world, s.x, s.y)) if (!World.isWaterAt(g.world, 0, x, y) && World.terr(g.world, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length) { spot = [x, y]; break; }
          const u = Units.create(g, 'HighMenSwordsmen', pl.id, 0, spot[0], spot[1]);
          Move.reveal(g, pl, 0, s.x, s.y, 3); MapView.invalidateVis(); MapView.bumpVis(); MapView.ts = 72; MapView.centerOn(s.x, s.y, 0);
          App.selectTile(0, u.x, u.y, [u.id]);
          window._s = s; window._g0 = pl.gold;
          void App.moveSelected(s.x, s.y);
          return { tile: App.tileInfoHtml(0, s.x, s.y).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 300) };
        }""")
        print('SHRINE', r)
        await pg.wait_for_timeout(1500)
        print('PACT MODAL', await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 260))"))
        await pg.screenshot(path=os.path.join(SHOTS, '130-pact-offer.png'))
        await pg.evaluate("[...document.querySelectorAll('.modal button')].find(b => /Sceller le pacte/.test(b.textContent)).click()")
        await pg.wait_for_timeout(500)
        print('PACT', await pg.evaluate("(() => { const pl = App.me(); return { pacts: pl.pacts, gold: pl.gold - _g0 }; })()"))
        # 2. échéance : la fenêtre de paiement
        await pg.evaluate("UI.closeAll(); App.me().pacts[0].due = App.game.turn; App.me().mustChooseResearch = false; App.me().gold += 2000; void App.endTurn(true)")
        await pg.wait_for_timeout(1500)
        await settle(pg)
        await pg.wait_for_timeout(800)
        print('DUE MODAL', await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 300))"))
        await pg.screenshot(path=os.path.join(SHOTS, '131-pact-due.png'))
        await pg.evaluate("(() => { const b = [...document.querySelectorAll('.modal button')].find(b => /Rembourser/.test(b.textContent)); if (b) b.click(); })()")
        await pg.wait_for_timeout(600)
        await pg.evaluate("UI.closeAll()")
        print('PAID', await pg.evaluate("App.me().pacts.map(p => p.state)"))
        # 3. le voile se déchire : failles
        rf = await pg.evaluate("""() => {
          window.AUTO_CHOICE = true; UI.closeAll();
          const g = App.game, pl = App.me();
          Veil.thin(g, 25);
          const rifts = Veil.rifts(g, 0);
          const s = rifts[0];
          MapView.invalidateVis(); MapView.bumpVis(); MapView.centerOn(s.x, s.y, 0); App.refresh();
          // une pile sur la faille change de plan
          const u = Units.create(g, 'HighMenSpearmen', pl.id, 0, s.x, s.y); u.moves = 2;
          App.selectTile(0, s.x, s.y, [u.id]);
          window._rift = s; window._ru = u.id;
          return { veil: g.veil, stage: g.veilStage, rifts: rifts.map(r => [r.x, r.y]), tb: document.querySelector('#tb-veil').textContent, tile: App.tileInfoHtml(0, s.x, s.y).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 260) };
        }""")
        print('RIFTS', rf)
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, '132-rift.png'))
        sh = await pg.evaluate("""() => {
          const g = App.game, u = g.units[_ru], v0 = g.veil;
          const r = Game.planeShift(g, [u.id]);
          return { ok: r.ok, why: r.why, plane: u.plane, veil: [v0, g.veil] };
        }""")
        print('SHIFT', sh)
        # sceller la faille
        se = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), s = _rift;
          if (!pl.known.includes('seal_rift')) pl.known.push('seal_rift');
          pl.mana += 500; pl.skillLeft = 500;
          const r = Spells.cast(g, pl, 'seal_rift', { plane: 0, x: s.x, y: s.y });
          return { r, closed: s.closed, veil: g.veil, left: Veil.rifts(g, 0).length };
        }""")
        print('SEAL', se)
        # 4. la Crise
        await pg.evaluate("UI.closeAll(); App.game.crisis.at = App.game.turn; App.me().mustChooseResearch = false; void App.endTurn(true)")
        await pg.wait_for_timeout(1500)
        await settle(pg)
        await pg.evaluate("UI.closeAll()")
        cr = await pg.evaluate("""() => {
          const g = App.game, s = Crisis.site(g);
          if (!s) return { state: g.crisis.state };
          MapView.plane = s.plane; MapView.invalidateVis(); MapView.bumpVis(); MapView.centerOn(s.x, s.y, s.plane); App.refresh();
          return { state: g.crisis.state, at: [s.plane, s.x, s.y], guardians: s.guardians, tb: document.querySelector('#tb-veil').textContent, tile: App.tileInfoHtml(s.plane, s.x, s.y).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 260), log: g.log.filter(e => /Brèche/.test(e.text)).map(e => e.text).slice(-2) };
        }""")
        print('CRISIS', cr)
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=os.path.join(SHOTS, '133-breach.png'))
        # infobulle du voile
        box = await pg.evaluate("(() => { const r = document.querySelector('#tb-veil').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
        await pg.mouse.move(box[0], box[1])
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, '134-veil-tip.png'))
        await pg.mouse.move(700, 500)
        # une vague, puis la Brèche refermée par une armée
        wv = await pg.evaluate("""async () => {
          const g = App.game, s = Crisis.site(g), pl = App.me();
          Crisis.wave(g);
          const wave = Object.values(g.units).filter(u => u.crisis).map(u => [u.type, u.crisisTarget]);
          s.guardians = ['Skeleton'];
          let spot = null; for (const [x, y] of World.neighbors(g.world, s.x, s.y)) if (!World.isWaterAt(g.world, s.plane, x, y) && World.terr(g.world, s.plane, x, y) !== T.MOUNTAIN && !Units.at(g, s.plane, x, y).length) { spot = [x, y]; break; }
          const ids = ['Paladin', 'Paladin', 'Paladin'].map(t => Units.create(g, t, pl.id, s.plane, spot[0], spot[1]).id);
          const f0 = pl.fame;
          const r = await Game.attack(g, ids, s.x, s.y, { auto: true });
          return { wave, won: r && r.won, state: g.crisis.state, fame: pl.fame - f0, crisisLeft: Object.values(g.units).filter(u => u.crisis).length, log: g.log.filter(e => /Brèche/.test(e.text)).map(e => e.text).slice(-2) };
        }""")
        print('CLOSE', wv)
        await pg.wait_for_timeout(500)
        await pg.evaluate("UI.closeAll()")
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
