"""Musique : jamais deux morceaux audibles en même temps (changements de contexte rapides), coupure du son et volume."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TRACK = """(() => { const A = window.Audio; window.__aud = []; window.Audio = function (src) { const a = new A(src); window.__aud.push(a); return a; }; window.Audio.prototype = A.prototype; })()"""
LIVE = """window.__aud.filter(a => !a.paused && !a.ended).map(a => ({ f: a.src.split('/').pop(), v: +a.volume.toFixed(2) }))"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        await pg.add_init_script(TRACK)
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(700)
        await pg.mouse.click(700, 120)
        await pg.wait_for_timeout(150)
        await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        worst = 0
        # bascules rapides de plan (Arcanus <-> Myrror) pendant les fondus
        for i in range(14):
            await pg.evaluate(f"MapView.plane = {i % 2}")
            await pg.wait_for_timeout(350 + 120 * (i % 3))
            await pg.wait_for_timeout(300); n = len([a for a in await pg.evaluate(LIVE) if a['v'] > 0.02])
            worst = max(worst, n)
        await pg.evaluate("MapView.plane = 0")
        await pg.wait_for_timeout(4000)
        print('APRES BASCULES', await pg.evaluate(LIVE), 'pire instant :', worst)
        # musique coupée puis remise vite (avant la fin du fondu)
        await pg.evaluate("Sfx.setMusic(false)"); await pg.wait_for_timeout(200)
        await pg.evaluate("Sfx.setMusic(true)"); await pg.wait_for_timeout(4000)
        print('OFF/ON', await pg.evaluate(LIVE))
        # bouton son de la barre : coupe tout
        await pg.evaluate('UI.closeAll()'); await pg.click('#tb-sound'); await pg.wait_for_timeout(600)
        print('MUET', await pg.evaluate("Sfx.on"), await pg.evaluate(LIVE))
        await pg.evaluate("MapView.plane = 1"); await pg.wait_for_timeout(3500)
        print('MUET + changement', await pg.evaluate(LIVE))
        await pg.click('#tb-sound'); await pg.wait_for_timeout(3000)
        print('SON', await pg.evaluate("Sfx.on"), await pg.evaluate(LIVE))
        # volume du menu
        await pg.evaluate("Panels.menu()"); await pg.wait_for_timeout(300)
        await pg.evaluate("(() => { const r = document.querySelector('.modal input[type=range]'); r.value = 20; r.dispatchEvent(new Event('input', { bubbles: true })); })()")
        await pg.wait_for_timeout(400)
        print('VOL 20', await pg.evaluate(LIVE))
        await pg.evaluate("UI.closeAll()")
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
