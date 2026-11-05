"""v0.28.10 : Incarnation et les appels de héros donnent un héros au niveau de l'époque ; l'Élu d'une ancienne partie rattrape ce niveau."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:300]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        for turn in [10, 120, 240]:
            r = await pg.evaluate("""t => { const g = App.game, me = App.me(); g.turn = t;
              for (const u of Object.values(g.units)) if (u.type === 'HeroTorin') delete g.units[u.id];
              const res = Spells.apply(g, me, 'incarnation', null); const u = Object.values(g.units).find(u => u.type === 'HeroTorin');
              return [res.msg || res.why, u && u.xp, u && HERO_LEVELS[Heroes.levelIndex ? 0 : 0] && Units.levelName ? Units.levelName(g, u) : null, u && Math.round(Units.strength(g, u))]; }""", turn)
            print('tour', turn, r)
        # une partie sauvée avant : l'Élu niveau 1 au tour 240 rattrape le niveau Commandant au chargement
        r = await pg.evaluate("""() => { const g = App.game; const u = Object.values(g.units).find(u => u.type === 'HeroTorin'); u.xp = 0; delete g.v02810;
          Game.upgrade(g); return u.xp; }""")
        print('ANCIENNE PARTIE', r)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
