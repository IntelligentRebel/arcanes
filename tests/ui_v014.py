"""v0.14 : talents au passage de niveau (fenêtre de choix), quêtes de héros (bulle, marqueur, accomplissement), avatar du sorcier."""
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
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, chaos: 6 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = App.me(), c = g.cities[pl.fortress];
          const h = Heroes.spawn(g, pl, DATA.heroes.HeroDethStryke, c.plane, c.x, c.y);
          window._h = h.id; window._c = c;
          const s = g.sites[h.hero.quest.site];
          Move.reveal(g, pl, s.plane, s.x, s.y, 2); Move.reveal(g, pl, c.plane, c.x, c.y, 6); MapView.invalidateVis(); MapView.bumpVis();
          MapView.ts = 64; MapView.centerOn(Math.round((c.x + s.x) / 2), Math.round((c.y + s.y) / 2), 0);
          return { quest: Heroes.questText(g, h), story: h.hero.story };
        }""")
        print('QUEST', info)
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll(); App.selectTile(_c.plane, _c.x, _c.y, [_h])")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '120-quest-marker.png'))
        # passage de niveau : fenêtre de choix (sans choix automatique)
        await pg.evaluate("(() => { const u = App.game.units[_h]; u.xp = 65; Heroes.checkLevels(App.game); window.AUTO_CHOICE = false; void App.talentPrompts(); })()")
        await pg.wait_for_timeout(500)
        print('MODAL', await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 200))"))
        await pg.screenshot(path=os.path.join(SHOTS, '121-talent.png'))
        for _ in range(4):
            if not await pg.evaluate("!!document.querySelector('.modal .btn.primary')"):
                break
            await pg.evaluate("document.querySelector('.modal .btn.primary').click()")
            await pg.wait_for_timeout(300)
        print('TALENTS', await pg.evaluate("(() => { const u = App.game.units[_h]; return [u.hero.talents, (u.hero.pending || []).length]; })()"))
        await pg.evaluate("window.AUTO_CHOICE = true")
        # avatar
        r = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(); UI.closeAll();
          pl.known.push('wizard_avatar'); pl.mana = 600; pl.skillLeft = 600;
          const r = Spells.cast(g, pl, 'wizard_avatar', null);
          const av = Game.avatarOf(g, pl);
          MapView.centerOn(av.x, av.y, av.plane); App.selectTile(av.plane, av.x, av.y, [av.id]);
          return { r, anim: Anim.has(av.type), stats: (() => { const s = Units.stats(g, av); return [s.melee, s.ranged, s.def, s.maxHp, s.caster]; })(), buttons: [...document.querySelectorAll('.actions .abtn')].map(b => b.textContent) };
        }""")
        print('AVATAR', r)
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=os.path.join(SHOTS, '122-avatar.png'))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
