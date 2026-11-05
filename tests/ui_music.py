"""Bande originale : déverrouillage au premier geste, titre, carte (Arcanus puis Myrror), combat, jingle, volume, erreurs."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')

STATE = """(() => { const m = Music.jing || Music.cur; return m ? { f: m.f, ctx: Music.ctx, t: +m.el.currentTime.toFixed(2), paused: m.el.paused, vol: +m.el.volume.toFixed(2), err: m.el.error && m.el.error.code } : { f: null, ctx: Music.ctx }; })()"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        print('TRACKS', await pg.evaluate("Object.keys(MUSIC_JSON).length"), 'MUSIC ON', await pg.evaluate("Sfx.music"))
        await pg.mouse.click(700, 120)  # premier geste : déverrouille l'audio
        await pg.wait_for_timeout(3000)
        print('TITLE', await pg.evaluate(STATE))
        await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()")
        print('ARCANUS', await pg.evaluate(STATE))
        await pg.evaluate("MapView.plane = 1; MapView.bumpVis && MapView.bumpVis()")
        await pg.wait_for_timeout(3500)
        print('MYRROR', await pg.evaluate(STATE))
        await pg.evaluate("MapView.plane = 0")
        # volume
        await pg.evaluate("Sfx.setMusicVolume(.3)")
        await pg.wait_for_timeout(300)
        print('VOL30', await pg.evaluate(STATE))
        await pg.evaluate("Sfx.setMusicVolume(.7)")
        # combat
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), cap = g.cities[pl.fortress], w = g.world;
          let spot = null;
          for (const [dx, dy] of [[2, 0], [2, 1], [1, 2], [-2, 0], [0, 2], [2, -1]]) { const x = World.wx(w, cap.x + dx), y = cap.y + dy; if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length) { spot = [x, y]; break; } }
          const foe = g.players[1]; pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          let tgt = null; for (const [x, y] of World.neighbors(w, spot[0], spot[1])) if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { tgt = [x, y]; break; }
          const ids = [];
          for (let i = 0; i < 4; i++) ids.push(Units.create(g, 'HighMenSwordsmen', pl.id, 0, spot[0], spot[1]).id);
          Units.create(g, 'BarbarianSpearmen', foe.id, 0, tgt[0], tgt[1]);
          for (const id of ids) g.units[id].moves = 2;
          Move.revealAllFor(g, pl);
          App.selectTile(0, spot[0], spot[1], ids);
          window._fight = App.moveSelected(tgt[0], tgt[1]);
        }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()")
        print('COMBAT', await pg.evaluate("CombatView.active"), await pg.evaluate(STATE))
        await pg.evaluate("CombatView.toggleAuto && CombatView.toggleAuto()")
        jingle = None
        for _ in range(80):
            st = await pg.evaluate("Music.jing ? Music.jing.f : null")
            if st:
                jingle = st; break
            await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(800)
        print('JINGLE', jingle, await pg.evaluate(STATE))
        await pg.evaluate("UI.closeAll()")
        # le menu
        await pg.evaluate("Panels.menu()")
        await pg.wait_for_timeout(300)
        print('MENU', await pg.evaluate("[...document.querySelectorAll('.modal .row .t1')].map(e => e.textContent).filter(t => /Musique|Volume/.test(t))"))
        await pg.screenshot(path=os.path.join(SHOTS, '90-menu-music.png'))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
