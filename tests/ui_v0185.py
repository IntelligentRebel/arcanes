"""v0.18.5 : fiche de héros (portrait, équipement, coffre, caractéristiques) ; demande de paix avec concessions."""
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
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), cap = g.cities[pl.fortress];
          const h = Object.values(DATA.heroes).find(x => x.unit === 'HeroTheria');
          const u = Heroes.spawn(g, pl, h, 0, cap.x, cap.y); u.xp = 124; window._hid = u.id;
          u.items[0] = Items.random(g, 3);
          for (let i = 0; i < 5; i++) pl.vault.push(Items.random(g, 2));
          App.selectTile(0, cap.x, cap.y); App.refresh();
        }""")
        await pg.wait_for_timeout(500)
        cards = await pg.query_selector_all('.ucard')
        hero_card = None
        for c in cards:
            if 'Mirka' in (await c.text_content()): hero_card = c
        await hero_card.click()
        await pg.wait_for_timeout(600)
        print('FICHE', await pg.evaluate("(() => { const m = document.querySelector('.herosheet'); return m ? m.textContent.slice(0, 400) : null; })()"))
        print('SELECTION INCHANGEE', await pg.evaluate("App.sel.ids.length"))
        await pg.screenshot(path=os.path.join(SHOTS, '220-hero-sheet.png'))
        # équiper un objet du coffre
        before = await pg.evaluate("App.me().vault.length")
        vits = await pg.query_selector_all('.hs-vit:not(.no)')
        if vits:
            await vits[0].click(); await pg.wait_for_timeout(300)
        print('EQUIPE', before, '->', await pg.evaluate("App.me().vault.length"), await pg.evaluate("App.game.units[window._hid].items.map(i => i && i.name)"))
        await pg.screenshot(path=os.path.join(SHOTS, '221-hero-sheet-equip.png'))
        await pg.evaluate("UI.closeAll()")
        # demande de paix avec concessions
        await pg.evaluate("""() => { const g = App.game, pl = App.me(), o = g.players[1]; pl.contact[o.id] = o.contact[pl.id] = true; Diplomacy.setState(g, pl.id, o.id, 'war');
          const c = Object.values(g.cities).find(c => c.owner < 0); c.owner = o.id; o.gold = 400;
          Diplomacy.offer(g, pl, { from: o.id, kind: 'peace', turn: g.turn, gold: 200, city: c.id }); void App.turnPrompts(); }""")
        await pg.wait_for_timeout(900)
        print('OFFRE', await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.textContent.slice(0, 400))"))
        await pg.screenshot(path=os.path.join(SHOTS, '222-peace-sweeteners.png'))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
