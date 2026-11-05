"""v0.28.11 : l'Élu monté au rang Commandant connaît l'emplacement de sa légende, comme un héros arrivé à ce rang."""
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
        # nouvelle incarnation au tour 240
        print('NOUVEAU', await pg.evaluate("""() => { const g = App.game, me = App.me(); g.turn = 240; Spells.apply(g, me, 'incarnation', null);
          const u = Object.values(g.units).find(u => u.type === 'HeroTorin'); return [u.xp, u.hero.quest && u.hero.quest.stage, Heroes.questText(g, u)]; }"""))
        # le cas d'Olivier : incarné au niveau 1 (quête au stade 1), monté Commandant par la 0.28.10, puis chargé en 0.28.11
        print('ANCIEN', await pg.evaluate("""() => { const g = App.game; const u = Object.values(g.units).find(u => u.type === 'HeroTorin');
          u.hero.quest.stage = 1; delete g.v02811; g.v02810 = true; Game.upgrade(g); return [u.xp, u.hero.quest.stage, Heroes.questText(g, u)]; }"""))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
