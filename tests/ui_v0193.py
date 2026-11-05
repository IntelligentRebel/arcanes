"""v0.19.3 : la légende de chaque héros (repaire de difficulté maximale, indices progressifs, récompense épique)."""
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
        print('ENGAGE', await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const u = Heroes.spawn(g, me, DATA.heroes.HeroBrax, fc.plane, fc.x, fc.y); window._u = u; const q = u.hero.quest, s = g.sites[q.site];
          return [q.place, q.stage, Heroes.questText(g, u), s.budget, s.guardians.join(',')]; }"""))
        # rang Capitaine : la région
        await pg.evaluate("""() => { const g = App.game; Heroes.LEGEND_RUMOR = 1; _u.xp = 60; Heroes.questTick(g); const q = _u.hero.quest; MapView.centerOn(q.cx, q.cy, g.sites[q.site].plane); App.refresh(); }""")
        await pg.wait_for_timeout(700)
        print('REGION', await pg.evaluate("[App.me().hero, Heroes.questText(App.game, _u)][1]"))
        await pg.screenshot(path=os.path.join(SHOTS, '232-legend-region.png'))
        # fiche du héros
        await pg.evaluate("Panels.heroSheet(_u)"); await pg.wait_for_timeout(500)
        print('FICHE', await pg.evaluate("[...document.querySelectorAll('.modal button')].map(b => b.textContent).filter(t => t.startsWith('Voir'))"))
        await pg.screenshot(path=os.path.join(SHOTS, '233-legend-hero-sheet.png'))
        await pg.evaluate("UI.closeAll()")
        # rang Commandant : le repaire
        await pg.evaluate("""() => { const g = App.game; _u.xp = 120; Heroes.questTick(g); const s = g.sites[_u.hero.quest.site]; MapView.centerOn(s.x, s.y, s.plane); App.refresh(); }""")
        await pg.wait_for_timeout(700)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        print('TIP', await pg.evaluate("""() => { const s = App.game.sites[_u.hero.quest.site]; const d = document.createElement('div'); d.innerHTML = App.mapTip(s.x, s.y) || ''; return d.textContent; }"""))
        await pg.screenshot(path=os.path.join(SHOTS, '234-legend-found.png'))
        # victoire
        print('VICTOIRE', await pg.evaluate("""() => { const g = App.game, s = g.sites[_u.hero.quest.site]; Heroes.onBattle(g, { units: [{ u: _u, side: ATT_SIDE, dead: false }] }, { site: s }, { winner: ATT_SIDE }, true); return [_u.hero.quest.done, _u.hero.quest.reward, _u.xp]; }"""))
        await pg.evaluate("UI.closeAll()")
        # ancienne sauvegarde : quête « slay » convertie
        print('MIGRATION', await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const v = Heroes.spawn(g, me, DATA.heroes.HeroTheria, fc.plane, fc.x, fc.y); v.hero.quest = { type: 'slay', site: 3 }; Game.upgrade(g); return [v.hero.quest.type, v.hero.quest.place]; }"""))
        await pg.evaluate("window.AUTO_CHOICE = true; void App.endTurn(true)")
        await pg.wait_for_timeout(8000)
        print('TOUR', await pg.evaluate("App.game.turn"))
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
