"""v0.31.50 : une copie hors ligne incomplète se signale (image absente ou d'une autre taille, dictionnaire d'une autre
version) ; une copie complète ne dit rien. Le menu dit l'état réel des portraits animés : coupés par le système (moins
d'animations demandées), et un clic les active quand même ; fichier manquant quand assets/portraits.png n'est pas là."""
import asyncio, os, sys, shutil, tempfile, hashlib
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)

def copy(tmp, name):
    d = os.path.join(tmp, name); shutil.copytree(os.path.join(ROOT, 'dist', 'arcanes'), d); return d

async def frames(pg, sel, n=12, gap=250):
    el = await pg.query_selector(sel); seen = set()
    for _ in range(n):
        seen.add(hashlib.md5(await el.screenshot()).hexdigest()); await pg.wait_for_timeout(gap)
    return len(seen)

MENU_ROW = """() => { const r = [...document.querySelectorAll('.modal .row')].find(x => /Portraits animés/.test(x.textContent)); return r ? r.querySelector('.t1').textContent : null; }"""
CLICK_ROW = """() => { [...document.querySelectorAll('.modal .row')].find(x => /Portraits animés/.test(x.textContent)).click(); }"""

async def main():
    tmp = tempfile.mkdtemp()
    full = copy(tmp, 'complete')
    bad = copy(tmp, 'incomplete')
    os.remove(os.path.join(bad, 'assets', 'portraits.png'))
    shutil.copyfile(os.path.join(bad, 'assets', 'fx.png'), os.path.join(bad, 'assets', 'falls', 'banished_aldoran.jpg'))
    de = os.path.join(bad, 'lang', 'de.js'); s = open(de, encoding='utf-8').read()
    open(de, 'w', encoding='utf-8').write(s[:s.index('(window.I18N_SIG')])
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 1. copie complète : rien à signaler
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='de-DE')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + full + '/index.html'); await pg.wait_for_timeout(5000)
        ok(await pg.evaluate("() => !document.querySelector('.update-modal')"), 'copie complète : aucun avertissement')
        ok(await pg.evaluate("() => Update.verify().then(b => b.length === 0)"), 'copie complète : rien ne manque')
        await ctx.close()
        # 2. copie incomplète : l'avertissement nomme les fichiers
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='de-DE')
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + bad + '/index.html'); await pg.wait_for_timeout(5000)
        txt = await pg.evaluate("() => { const m = document.querySelector('.update-modal'); return m ? m.textContent : ''; }")
        ok('Unvollständige Kopie' in txt, 'copie incomplète : avertissement traduit (%r)' % txt[:60])
        for f in ('assets/portraits.png', 'assets/falls/banished_aldoran.jpg', 'lang/de.js'):
            ok(f in txt, 'copie incomplète : %s nommé' % f)
        ok('assets/falls/banished_azhemir.jpg' not in txt and 'lang/en.js' not in txt, 'copie incomplète : les fichiers en ordre ne sont pas nommés')
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v03150_copie.png'))
        await ctx.close()
        # 3. menu, portraits introuvables (en français)
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='fr-FR')
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + bad + '/index.html'); await pg.wait_for_timeout(1500)
        await pg.evaluate("() => { UI.closeAll(); PortraitAnim.load(); }"); await pg.wait_for_timeout(4500)
        await pg.evaluate("() => { UI.closeAll(); Panels.menu(); }"); await pg.wait_for_timeout(300)
        ok(await pg.evaluate(MENU_ROW) == 'Portraits animés : fichier manquant', 'menu : fichier manquant (%r)' % await pg.evaluate(MENU_ROW))
        await ctx.close()
        # 4. menu, système qui demande moins d'animations : coupés par le système, un clic les active
        ctx = await b.new_context(viewport={'width': 1500, 'height': 1000}, locale='fr-FR', reduced_motion='reduce')
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + full + '/index.html'); await pg.wait_for_timeout(1500)
        await pg.evaluate("() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Setup.newGame ? Setup.newGame() : Setup.open(); }")
        await pg.wait_for_timeout(1500)
        ok(await frames(pg, '.wizpick .w.on canvas', 8) == 1, 'moins d\'animations demandées : portrait figé par défaut')
        await pg.evaluate("() => Panels.menu()"); await pg.wait_for_timeout(300)
        ok(await pg.evaluate(MENU_ROW) == 'Portraits animés : coupés par votre système', 'menu : coupés par votre système (%r)' % await pg.evaluate(MENU_ROW))
        await pg.evaluate(CLICK_ROW); await pg.wait_for_timeout(300)
        ok(await pg.evaluate(MENU_ROW) == 'Portraits animés : activés', 'menu : un clic les active (%r)' % await pg.evaluate(MENU_ROW))
        await pg.evaluate("() => { const ms = [...document.querySelectorAll('.modal')]; ms[ms.length - 1].querySelector('.close, .x, button') ; UI.modals[UI.modals.length - 1].close(); }"); await pg.wait_for_timeout(500)
        ok(await frames(pg, '.wizpick .w.on canvas') > 2, 'activés quand même : le portrait s\'anime')
        await pg.evaluate("() => Panels.menu()"); await pg.wait_for_timeout(300)
        await pg.evaluate(CLICK_ROW); await pg.wait_for_timeout(300)
        ok(await pg.evaluate(MENU_ROW) == 'Portraits animés : coupés', 'menu : un second clic les coupe (%r)' % await pg.evaluate(MENU_ROW))
        await ctx.close()
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
    shutil.rmtree(tmp, ignore_errors=True)
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
