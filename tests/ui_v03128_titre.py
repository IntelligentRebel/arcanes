"""v0.31.28 : l'écran titre s'ouvre d'un clic quand le navigateur refuse le son sans geste, et ce clic lance la musique du titre ;
quand le navigateur l'autorise, la musique part d'elle-même, sans voile."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
async def main():
    url = 'file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')
    async with async_playwright() as p:
        for policy, gated in (('user-gesture-required', True), ('no-user-gesture-required', False)):
            b = await p.chromium.launch(args=['--autoplay-policy=' + policy])
            ctx = await b.new_context(viewport={'width': 1400, 'height': 860}, locale='fr-FR')
            await ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', { get: () => false })")
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(url); await pg.wait_for_timeout(2500)
            has = await pg.evaluate("!!document.querySelector('.title-gate')")
            ok(has == gated, '%s : voile %s' % (policy, 'présent' if has else 'absent'))
            if gated:
                ok(await pg.evaluate("getComputedStyle(document.querySelector('.title-actions')).opacity") == '0', 'boutons cachés sous le voile')
                ok(not await pg.evaluate("Music.playing"), 'pas de musique avant le clic')
                await pg.screenshot(path=os.path.join(SHOTS, 'v03128_voile.png'))
                await pg.mouse.click(700, 300); await pg.wait_for_timeout(1500)
                ok(not await pg.evaluate("!!document.querySelector('.title-gate')"), 'le clic ouvre l\'écran')
                ok(await pg.evaluate("getComputedStyle(document.querySelector('.title-actions')).opacity") == '1', 'les boutons apparaissent')
                ok(await pg.evaluate("!!document.querySelector('.title-screen')") and not await pg.evaluate("!!document.querySelector('.modal')"), 'le clic n\'a déclenché aucun bouton')
            ok(await pg.evaluate("Music.playing"), 'musique lancée')
            ok(await pg.evaluate("[...Music.live].some(m => m.f === 'titre')"), 'le thème du titre joue (%s)' % await pg.evaluate("[...Music.live].map(m => m.f).join(',')"))
            ok(not errs, 'aucune erreur %s' % errs[:2])
            await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
