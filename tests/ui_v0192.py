"""v0.19.2 : niveau des héros fixé par l'époque (tous les 50 tours) ; étoile d'or de la capitale sur la carte, la minicarte, les infobulles."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('ERES', await pg.evaluate("""() => { const g = App.game, t0 = g.turn, r = {};
          for (const t of [1, 50, 51, 100, 101, 150, 151, 400]) { g.turn = t; r[t] = HERO_LEVELS[Heroes.eraLevel(g)].name; }
          g.turn = t0; return r; }"""))
        # prisonniers : pas de champion avant le tour 51, jamais l'Élu
        print('PRISON', await pg.evaluate("""() => { const g = App.game, me = App.me(), t0 = g.turn, out = {};
          for (const t of [10, 120]) { g.turn = t; let champ = 0, torin = 0; for (let i = 0; i < 400; i++) { const h = Heroes.randomAvailable(g, me, true); if (h && h.champion) champ++; if (h && h.id === 'HeroTorin') torin++; } out[t] = { champ, torin }; }
          g.turn = t0; return out; }"""))
        # capitale : vue sur la forteresse, une ville voisine pour comparer
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const c2 = Cities.create(g, me.id, 'highmen', fc.plane, fc.x + 3, fc.y + 1, { pop: 4000 }); if (c2) c2.name = c2.name || 'Bourg';
          MapView.centerOn(fc.x + 1, fc.y, fc.plane); App.refresh(); }""")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=os.path.join(SHOTS, '229-capital-star.png'))
        print('TUILE', await pg.evaluate("""() => { const fc = App.game.cities[App.me().fortress]; const d = document.createElement('div'); d.innerHTML = App.tileInfoHtml(fc.plane, fc.x, fc.y); return d.textContent.slice(-160); }"""))
        print('TIP', await pg.evaluate("""() => { const fc = App.game.cities[App.me().fortress]; const d = document.createElement('div'); d.innerHTML = App.cityTip(fc); return d.textContent.slice(0, 60); }"""))
        mm = await pg.query_selector('#minimap')
        if mm: await mm.screenshot(path=os.path.join(SHOTS, '230-minimap-capitals.png'))
        await pg.evaluate("Panels.cities()"); await pg.wait_for_timeout(400)
        print('LISTE', await pg.evaluate("[...document.querySelectorAll('.modal td')].map(t => t.textContent).filter(t => t.includes('★')).slice(0, 2)"))
        await pg.evaluate("UI.closeAll()")
        # offre d'un héros au tour 75 : Myrmidon, prix majoré d'un quart
        info = await pg.evaluate("""() => { const g = App.game, me = App.me(); g.turn = 75; me.gold = 2000;
          const h = DATA.heroes.HeroBrax, lv = Heroes.levelOf(g, h.id), fee = Heroes.hireFee(g, me, h, lv);
          me.heroOffer = { hero: h.id, fee, turn: g.turn, level: lv }; void App.turnPrompts(); return { lv, fee }; }""")
        await pg.wait_for_timeout(700)
        print('OFFRE', info, await pg.evaluate("(document.querySelector('.modal') || {}).textContent"))
        await pg.screenshot(path=os.path.join(SHOTS, '231-hero-offer-era.png'))
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Engager')); btn && btn.click(); }""")
        await pg.wait_for_timeout(500)
        print('ENGAGE', await pg.evaluate("""() => { const u = Object.values(App.game.units).find(u => u.type === 'HeroBrax' && u.owner === App.pid); return u ? [u.xp, Heroes.rawLevel(u)] : null; }"""))
        await pg.evaluate("UI.closeAll()")
        await pg.evaluate("window.AUTO_CHOICE = true; void App.endTurn(true)")
        await pg.wait_for_timeout(8000)
        print('TOUR', await pg.evaluate("App.game.turn"))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
