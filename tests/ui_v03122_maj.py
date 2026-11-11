"""v0.31.22 : la copie locale cherche les nouvelles versions sur GitHub (réponse simulée), l'écran titre et le menu les
proposent ; le jeu en ligne ne demande rien ; au tour 10, la copie de sauvegarde tous les 10 tours est proposée une fois."""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def ok(c, what):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + what, flush=True)
    if not c: FAIL.append(what)

BODY = ("**Play in your browser:** https://intelligentrebel.github.io/arcanes/\n\n### New in this version\n\n- **Faster** turns.\n- A <script>x</script> line.\n\n"
        "<details><summary>En français</summary>\n\n### Nouveau dans cette version\n\n- Des tours **plus rapides**.\n\n</details>\n")
# les versions simulées suivent la version du jeu : la prochaine (NEXT), la suivante en préversion, et celle d'avant
CUR = re.search(r"GAME_VERSION = '([\d.]+)'", open(os.path.join(ROOT, 'src', 'engine', 'game.js')).read()).group(1)
_m = CUR.split('.'); NEXT = '.'.join(_m[:-1] + [str(int(_m[-1]) + 1)]); PRE = '.'.join(_m[:-1] + [str(int(_m[-1]) + 2)])
RELEASES = [
    {'tag_name': 'v' + PRE, 'draft': False, 'prerelease': True, 'body': '', 'assets': []},
    {'tag_name': 'v' + NEXT, 'draft': False, 'prerelease': False, 'published_at': '2026-11-20T10:00:00Z', 'body': BODY, 'html_url': 'https://github.com/IntelligentRebel/arcanes/releases/tag/v' + NEXT,
     'assets': [{'name': 'arcanes-' + NEXT + '.zip', 'browser_download_url': 'https://github.com/IntelligentRebel/arcanes/releases/download/v' + NEXT + '/arcanes-' + NEXT + '.zip', 'size': 200458251}]},
    {'tag_name': 'v' + CUR, 'draft': False, 'prerelease': False, 'published_at': '2026-11-05T10:00:00Z', 'body': 'x', 'assets': []},
]


async def page(b, locale, url, releases):
    ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale=locale, accept_downloads=True)
    pg = await ctx.new_page()
    pg.errors = []; pg.calls = []
    pg.on('pageerror', lambda e: (pg.errors.append(str(e)), print('PAGEERROR', str(e)[:300], flush=True)))
    async def api(route):
        pg.calls.append(route.request.url)
        await route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(releases))
    await ctx.route('https://api.github.com/**', api)
    await pg.goto(url)
    # (0.31.38) l'écran titre n'arrive qu'une fois les planches chargées : on l'attend au lieu d'un délai fixe
    try: await pg.wait_for_selector('.title-screen', timeout=40000)
    except Exception: pass
    await pg.wait_for_timeout(1200)
    return ctx, pg


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        local = 'file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')
        ok(await (await b.new_page()).evaluate("1") == 1, 'navigateur')
        # 1. copie locale, en français : le bouton de l'écran titre, puis la fenêtre
        ctx, pg = await page(b, 'fr-FR', local, RELEASES)
        ok(len(pg.calls) == 1, 'une demande à GitHub (%d)' % len(pg.calls))
        cmp = await pg.evaluate("[Update.cmp('0.31.22b','0.31.22'), Update.cmp('0.31.9','0.31.22'), Update.cmp('v0.31.22','0.31.22'), Update.cmp('0.32','0.31.99')]")
        ok(cmp[0] > 0 and cmp[1] < 0 and cmp[2] == 0 and cmp[3] > 0, 'comparaison des versions %s' % cmp)
        btn = await pg.evaluate("(document.querySelector('.title-screen .update-btn') || {}).innerText || ''")
        ok(NEXT in btn and 'Nouvelle version' in btn, 'bouton de l\'écran titre : %r' % btn)
        ok(await pg.evaluate("Update.newer.map(r => r.version).join(',')") == NEXT, 'versions plus récentes (sans la préversion)')
        await pg.click('.title-screen .update-btn'); await pg.wait_for_timeout(400)
        info = await pg.evaluate("""() => { const m = document.querySelector('.update-modal'); return m ? { title: m.querySelector('h2').innerText, text: m.innerText, href: m.querySelector('.update-get a').href, scripts: m.querySelectorAll('script').length, bold: [...m.querySelectorAll('.release-notes b')].map(b => b.innerText) } : null; }""")
        ok(info and info['title'] == 'Nouvelle version : ' + NEXT, 'titre de la fenêtre : %r' % (info and info['title']))
        ok(info and 'plus rapides' in info['text'] and 'Faster' not in info['text'], 'notes en français')
        ok(info and info['href'].endswith('arcanes-' + NEXT + '.zip') and '200 Mo' in info['text'], 'lien du zip et taille')
        ok(info and info['scripts'] == 0, 'aucun HTML venu de GitHub inséré')
        await pg.screenshot(path=os.path.join(SHOTS, 'v03122_maj_fr.png'))
        # 2. relancée dans la journée : le cache sert, pas de nouvelle demande
        await pg.reload(); await pg.wait_for_timeout(2600)
        ok(len(pg.calls) == 1 and NEXT in await pg.evaluate("(document.querySelector('.title-screen .update-btn') || {}).innerText || ''"), 'cache de 12 h (demandes : %d)' % len(pg.calls))
        # 3. le menu en partie : la ligne de la version, la recherche coupée puis rallumée
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 31, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'Éloïne', portrait: 0, books: { nature: 6, life: 5 }, retorts: [], race: 'highelf' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2000); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("Panels.menu()"); await pg.wait_for_timeout(300)
        rows = await pg.evaluate("() => [...document.querySelectorAll('.modal .row .t1')].map(r => r.innerText)")
        ok(any('Nouvelle version disponible : ' + NEXT in r for r in rows), 'ligne du menu (version)')
        ok(any(r == 'Recherche des nouvelles versions : activée' for r in rows), 'ligne du menu (recherche)')
        await pg.evaluate("() => [...document.querySelectorAll('.modal .row')].find(r => /Recherche des nouvelles/.test(r.innerText)).click()"); await pg.wait_for_timeout(400)
        ok(await pg.evaluate("App.prefs.checkUpdates") is False, 'recherche coupée')
        await pg.evaluate("() => [...document.querySelectorAll('.modal .row')].find(r => /Recherche des nouvelles/.test(r.innerText)).click()"); await pg.wait_for_timeout(800)
        ok(await pg.evaluate("App.prefs.checkUpdates") is True and len(pg.calls) == 2 and await pg.evaluate("!!document.querySelector('.update-modal')"), 'recherche rallumée : demande immédiate, fenêtre')
        await pg.evaluate("UI.closeAll()")
        # 4. au tour 10 : la copie tous les 10 tours, proposée une fois
        downloads = []; pg.on('download', lambda d: downloads.append(d.suggested_filename))
        ok(not (await pg.evaluate("App.prefs.autoExport")), 'copie automatique coupée par défaut')
        await pg.evaluate("App.game.turn = 9"); await pg.evaluate("() => { App.endTurn(true); }")
        asked = False
        for _ in range(120):
            await pg.wait_for_timeout(500)
            t = await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' | ')")
            if 'Copies de sauvegarde' in t: asked = True; break
            await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); if (m && !/Copies de sauvegarde/.test(m.innerText)) { const b = m.querySelector('footer .btn.primary, footer .btn'); if (b) b.click(); else UI.closeTop(); } }")
        ok(asked, 'question posée au tour 10')
        await pg.screenshot(path=os.path.join(SHOTS, 'v03122_copie.png'))
        await pg.evaluate("() => [...document.querySelectorAll('.modal footer .btn')].find(b => /Télécharger|Oui/.test(b.innerText)).click()"); await pg.wait_for_timeout(1200)
        ok(await pg.evaluate("App.prefs.autoExport") == 10 and await pg.evaluate("App.prefs.autoExportAsked") is True, 'oui : tous les 10 tours')
        ok(len(downloads) == 1, 'copie téléchargée tout de suite (%d)' % len(downloads))
        ok(not pg.errors, 'aucune erreur (fr)')
        await ctx.close()
        # 5. en anglais, sans version plus récente : rien à l'écran titre
        ctx, pg = await page(b, 'en-US', local, RELEASES[2:])
        ok(len(pg.calls) == 1 and not await pg.evaluate("!!document.querySelector('.title-screen .update-btn')"), 'à jour : pas de bouton')
        ok(await pg.evaluate("Update.newer.length") == 0 and not pg.errors, 'aucune erreur (en, à jour)')
        await ctx.close()
        # 6. en anglais, version plus récente : notes anglaises
        ctx, pg = await page(b, 'en-US', local, RELEASES)
        await pg.click('.title-screen .update-btn'); await pg.wait_for_timeout(400)
        t = await pg.evaluate("document.querySelector('.update-modal').innerText")
        ok('Faster' in t and 'plus rapides' not in t and ('New version: ' + NEXT) in t and 'Play in your browser' not in t, 'notes en anglais')
        await pg.screenshot(path=os.path.join(SHOTS, 'v03122_maj_en.png'))
        ok(not pg.errors, 'aucune erreur (en)')
        await ctx.close()
        # 7. le jeu en ligne (http) : aucune demande
        import http.server, threading, functools
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8767), functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.path.join(ROOT, 'dist', 'arcanes')))
        srv.RequestHandlerClass.log_message = lambda *a: None
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        ctx, pg = await page(b, 'fr-FR', 'http://127.0.0.1:8767/index.html', RELEASES)
        ok(len(pg.calls) == 0 and not await pg.evaluate("!!document.querySelector('.title-screen .update-btn')"), 'en ligne : aucune demande')
        await ctx.close(); srv.shutdown()
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL, flush=True)
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
