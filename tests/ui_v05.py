"""v0.5 : graphismes du lot 2 (lisières, bâtiments, héros, sorts, combat en cité). Captures d'écran + erreurs."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(800)
        info = await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 7, opponents: 2, human: { name: 'Morwen', portrait: 3, books: { nature: 5, chaos: 5 }, retorts: ['warlord'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = App.me(); const w = g.world;
          // une case de prairie bordée de forêt, près de la capitale
          const cap = g.cities[pl.fortress];
          let best = null, bd = 1e9;
          for (let y = 2; y < w.h - 2; y++) for (let x = 0; x < w.w; x++) {
            if (World.terr(w, 0, x, y) !== T.GRASS) continue;
            let f = 0; for (const [dx, dy] of U.DIRS8) if (World.terr(w, 0, x + dx, y + dy) === T.FOREST) f++;
            if (f < 3) continue;
            const d = Math.abs(x - cap.x) + Math.abs(y - cap.y); if (d < bd) { bd = d; best = [x, y]; }
          }
          for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) Move.reveal(g, pl, 0, x, y, 0);
          pl.explored && pl.explored[0] && pl.explored[0].fill && pl.explored[0].fill(1);
          window._best = best; window._cap = cap;
          return { best, cap: [cap.x, cap.y], virt: Object.keys(Sprites.virt).length, bld: Sprites.hasHD('bld:library'), edge: Sprites.hasHD('edge:0'), tex: !!Tex.get('forestedge') };
        }""")
        print('SETUP', info)
        await pg.wait_for_timeout(2600)
        await pg.evaluate("""() => { UI.closeAll(); App.deselect(); const ov = Move.visibility; Move.visibility = (g, pid) => { const v = ov(g, pid); v.forEach(a => a.fill(1)); return v; }; App.me().explored.forEach(a => a.fill(1)); MapView.ts = 128; MapView.centerOn(window._best[0], window._best[1], 0); MapView.bumpVis(); }""")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=os.path.join(SHOTS, '50-forest-edge.png'))
        await pg.evaluate("MapView.ts = 64; MapView.centerOn(window._best[0], window._best[1], 0); MapView.bumpVis()")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '51-forest-edge-far.png'))
        # écran de ville avec bâtiments
        await pg.evaluate("""() => { const c = window._cap; for (const b of ['barracks','smithy','library','sagesGuild','marketplace','granary','shrine','temple','builders' + 'Hall','stables','sawmill','alchemistsGuild']) if (DATA.buildings[b]) c.buildings[b] = true; UI.closeAll(); CityUI.open(c.id); }""")
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, '52-city.png'))
        await pg.evaluate("UI.closeAll()")
        # liste de production
        await pg.evaluate("CityUI.chooseProduction && CityUI.cur ? 0 : 0")
        # recherche / grimoire : sorts de la nature et du chaos (invocations composées)
        await pg.evaluate("""() => { const pl = App.me(); for (const id of ['war_bears','sprites','fire_bolt','fireball','web','giant_spiders','hell_hounds','stone_skin','change_terrain','corruption','fire_elemental','earth_lore']) if (!pl.known.includes(id)) pl.known.push(id); }""")
        opened = await pg.evaluate("""() => { const fns = Object.keys(Panels).filter(k => /spell|book|grimoire/i.test(k)); MagicUI.spellbook(); return 'spellbook'; }""")
        print('BOOK', opened)
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=os.path.join(SHOTS, '53-spellbook.png'))
        await pg.evaluate("UI.closeAll()")
        # offre de héros (portrait)
        await pg.evaluate("""() => { const g = App.game, pl = App.me(); const hid = Object.keys(DATA.heroes).find(k => DATA.heroes[k].unit === 'HeroBrax'); window.AUTO_CHOICE = false; pl.gold = 500; pl.heroOffer = { hero: hid, fee: 120, turn: g.turn, level: 0 }; window._tp = App.turnPrompts(); }""")
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, '54-hero-offer.png'))
        await pg.evaluate("window.AUTO_CHOICE = true; const bs = [...document.querySelectorAll('.modal button')]; const r = bs.find(b => /Refuser/.test(b.textContent)); if (r) r.click(); UI.closeAll()")
        await pg.wait_for_timeout(300)
        # liste des armées (portraits des héros)
        await pg.evaluate("Units.create(App.game, 'HeroValana', App.me().id, 0, window._cap.x, window._cap.y); Units.create(App.game, 'HeroBShan', App.me().id, 0, window._cap.x, window._cap.y); Panels.armies && Panels.armies()")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '56-armies.png'))
        await pg.evaluate("UI.closeAll()")
        # siège d'une cité fortifiée
        st = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(); const foe = g.players[1]; const c = g.cities[foe.fortress];
          c.buildings.cityWalls = true;
          for (const t of ['Swordsmen', 'Bowmen']) { const d = Object.keys(DATA.units).find(k => DATA.units[k].race === foe.race && k.endsWith(t)); if (d) Units.create(g, d, foe.id, c.plane, c.x, c.y); }
          let spot = null;
          for (const [x, y] of World.neighbors(g.world, c.x, c.y)) if (!World.isWaterAt(g.world, c.plane, x, y) && !Units.at(g, c.plane, x, y).length) { spot = [x, y]; break; }
          for (const t of ['HighMenSwordsmen', 'HeroFang', 'HeroBrax', 'HeroJaer', 'HeroTorin']) Units.create(g, t, pl.id, c.plane, spot[0], spot[1]);
          pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          Move.reveal(g, pl, c.plane, c.x, c.y, 3);
          MapView.centerOn(c.x, c.y, c.plane); App.selectTile(c.plane, spot[0], spot[1]); MapView.bumpVis();
          window._c = c; return spot;
        }""")
        await pg.wait_for_timeout(300)
        await pg.evaluate("UI.closeAll(); void App.moveSelected(window._c.x, window._c.y)")
        await pg.wait_for_timeout(2200)
        await pg.evaluate("UI.closeAll()")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '55-siege.png'))
        print('COMBAT', await pg.evaluate("({ active: CombatView.active, walls: CombatView.bt && CombatView.bt.hasWalls })"))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
