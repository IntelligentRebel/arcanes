"""v0.19.9 : le premier héros se présente à prix réduit, avec une solde, entre les tours 4 et 10 (et dès le tour suivant dans une partie déjà avancée sans héros)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # partie déjà avancée, sans héros : l'offre arrive au tour suivant
        info = await pg.evaluate("""() => { const g = App.game, me = App.me(); g.turn = 51; delete me.firstHeroTurn; delete me.firstHeroDone; delete me.hadHero; me.gold = 300;
          Heroes.offers(g); const o = me.heroOffer; void App.turnPrompts(); return o ? { hero: o.hero, fee: o.fee, level: HERO_LEVELS[o.level].name, upkeep: DATA.units[DATA.heroes[o.hero].unit].upkeep.gold } : null; }""")
        await pg.wait_for_timeout(700)
        print('OFFRE', info, await pg.evaluate("(document.querySelector('.modal') || {}).textContent"))
        await pg.screenshot(path=os.path.join(SHOTS, '238-first-hero.png'))
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Engager')); btn && btn.click(); }""")
        await pg.wait_for_timeout(500)
        print('RECRUE', await pg.evaluate("""() => { const u = Object.values(App.game.units).find(u => u.owner === App.pid && u.hero); return u ? [u.hero.name, u.xp, App.me().gold] : null; }"""))
        # une seule fois
        print('ENCORE', await pg.evaluate("() => { const g = App.game, me = App.me(); me.heroOffer = null; g.turn = 52; return Heroes.firstHero(g, me); }"))
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
