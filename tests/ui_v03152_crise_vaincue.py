"""v0.31.52 : une crise vaincue montre sa propre illustration (le monstre abattu), pas celle de son début ; une crise éteinte
d'elle-même garde celle du début."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 950}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(1500)
        await pg.evaluate("""() => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 6, mapW: 60, mapH: 40, opponents: 3, otherPlane: 0, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 9, books: { nature: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        for kind in ['prophet', 'lich', 'archmage', 'winter', 'eater']:
            await pg.evaluate("(k) => { const me = App.me(); me.finaleNews = [{ type: 'end', kind: k, by: me.id, found: ['600 pièces d\\'or'] }]; App.finalePrompts(); }", kind)
            await pg.wait_for_timeout(700)
            src = await pg.evaluate("() => { const i = document.querySelector('.finale-modal .lm-art img'); return i ? i.getAttribute('src') : null; }")
            ok(src and src.endswith('finale_%s_end.jpg' % kind), '%s vaincu : %s' % (kind, src))
            if kind == 'prophet': await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v03152_prophete_vaincu.png'))
            await pg.evaluate("() => UI.closeAll()"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const me = App.me(); me.finaleNews = [{ type: 'end', kind: 'prophet', faded: true }]; App.finalePrompts(); }")
        await pg.wait_for_timeout(700)
        src = await pg.evaluate("() => { const i = document.querySelector('.finale-modal .lm-art img'); return i ? i.getAttribute('src') : null; }")
        ok(src and src.endswith('finale_prophet.jpg'), 'crise éteinte : illustration du début (%s)' % src)
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
