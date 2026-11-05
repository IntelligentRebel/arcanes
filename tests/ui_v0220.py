"""v0.22.0 : thème du peuple dans ses cités, reprise du morceau de la carte, thème du joueur dans la rotation."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 6, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); Sfx.ensure(); Sfx.setMusic(true); }""")
        await pg.wait_for_timeout(4000)
        st = lambda: pg.evaluate("() => ({ ctx: Music.ctx, cur: Music.cur && Music.cur.f, t: Music.cur ? Math.round(Music.cur.el.currentTime) : null, held: Object.keys(Music.held), live: Music.live.size })")
        print('CARTE', await st())
        print('ROTATION ARCANUS', await pg.evaluate("Music.tracks('arcanus')"))
        await pg.wait_for_timeout(3000)
        before = await st()
        await pg.evaluate("() => { CityUI.open(App.me().fortress); }")
        await pg.wait_for_timeout(700)
        print('CITE (0,7 s)', await st())
        await pg.wait_for_timeout(3500)
        print('CITE (4 s)', await st())
        await pg.evaluate("UI.closeAll()")
        await pg.wait_for_timeout(3500)
        after = await st()
        print('RETOUR', after, 'reprise' if after['cur'] == before['cur'] and after['t'] >= before['t'] else 'NOUVEAU MORCEAU')
        # une cité d'un autre peuple
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(); const c = Object.values(g.cities).find(c => c.owner !== me.id && c.race !== me.race);
          c.owner = me.id; CityUI.open(c.id); return c.race; }""")
        await pg.wait_for_timeout(4500)
        print('CITE', r, await st())
        await pg.evaluate("UI.closeAll()")
        await pg.wait_for_timeout(3500)
        print('RETOUR 2', await st())
        # le thème du joueur passe sur la carte, puis il ouvre l'une de ses cités : le morceau continue sans couture
        await pg.evaluate("() => { Music.rot.arcanus = 1; Music.next(300); }")
        await pg.wait_for_timeout(2500)
        a = await st()
        await pg.evaluate("() => { CityUI.open(App.me().fortress); }")
        await pg.wait_for_timeout(3500)
        c = await st()
        print('THEME DU JOUEUR', a['cur'], '->', c['cur'], c['ctx'], 'continue' if a['cur'] == c['cur'] and c['t'] >= a['t'] + 2 else 'COUPURE')
        await pg.evaluate("UI.closeAll()")
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
