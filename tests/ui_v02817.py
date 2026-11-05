"""v0.28.17 : « Fusionner » n'apparaît que sur un nœud, grisé avec la raison quand la fusion ne servirait à rien."""
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
        state = lambda: pg.evaluate("() => { const b = [...document.querySelectorAll('.actions .abtn')].find(b => /Fusionner/.test(b.textContent)); return b ? (b.disabled ? 'grisé' : 'actif') : 'absent'; }")
        await pg.evaluate("""() => { const g = App.game, me = App.me(), s = g.sites.find(s => s.type === 'node'); s.guardians = []; s.cleared = true; s.owner = -1; s.meldBy = null; window._s = s;
          const c = g.cities[me.fortress]; window._u = Units.create(g, 'GuardianSpirit', me.id, c.plane, c.x, c.y); App.selectTile(c.plane, c.x, c.y, [_u.id]); App.refresh(); }""")
        print('HORS NŒUD', await state())
        await pg.evaluate("() => { _u.plane = _s.plane; _u.x = _s.x; _u.y = _s.y; App.selectTile(_s.plane, _s.x, _s.y, [_u.id]); App.refresh(); }"); await pg.wait_for_timeout(200)
        print('NŒUD LIBRE', await state(), await pg.evaluate("() => Game.canMeld(App.game, _u).what"))
        await pg.evaluate("() => { _s.owner = App.pid; _s.meldBy = 'MagicSpirit'; App.refresh(); }"); await pg.wait_for_timeout(200)
        print('À VOUS, ESPRIT MAGIQUE', await state(), await pg.evaluate("() => Game.canMeld(App.game, _u).what"))
        await pg.evaluate("() => { _s.meldBy = 'GuardianSpirit'; App.refresh(); }"); await pg.wait_for_timeout(200)
        print('À VOUS, ESPRIT GARDIEN', await state(), await pg.evaluate("() => Game.canMeld(App.game, _u).why"))
        print('MOTEUR', await pg.evaluate("() => JSON.stringify(Game.meld(App.game, _u.id))"), 'esprit toujours là', await pg.evaluate("() => !!App.game.units[_u.id]"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
