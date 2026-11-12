"""v0.31.40 : le dossier de sauvegarde (Chrome et Edge).
Un dossier choisi une fois reçoit les copies de la partie sans rien demander ; le navigateur qui redemande l'accès au lancement
obtient un clic, une fois ; sans dossier ou sans l'API (Firefox, Safari), la copie part dans les téléchargements."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)

# un faux dossier : showDirectoryPicker, l'autorisation et les fichiers écrits, tenus dans window.__fs
FAKE = """(perm) => { window.__fs = { files: {}, perm, asked: 0, picks: 0 };
  const file = name => ({ createWritable: async () => ({ write: async t => { window.__fs.files[name] = t; }, close: async () => {} }) });
  const dir = { name: 'Parties Arcanes', kind: 'directory',
    queryPermission: async () => window.__fs.perm,
    requestPermission: async () => { window.__fs.asked++; window.__fs.perm = 'granted'; return 'granted'; },
    getFileHandle: async (name, o) => file(name) };
  window.showDirectoryPicker = async () => { window.__fs.picks++; return dir; };
  // la poignée d'un vrai navigateur se recopie dans IndexedDB ; celle-ci porte des fonctions, donc on la garde en mémoire
  window.__fs.real = { keep: SaveDir.keep, handle: SaveDir.handle, forget: SaveDir.forget };
  SaveDir.keep = async d => { window.__fs.kept = d; }; SaveDir.handle = async () => window.__fs.kept || null; SaveDir.forget = async () => { window.__fs.kept = null; }; }"""
NOAPI = "() => { delete window.showDirectoryPicker; }"
START = """() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
  const g = Game.newGame({ seed: 12, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'Eloine', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
  App.start(g); }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        url = 'file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')
        for lang in ('fr-FR', 'en-US'):
            fr = lang == 'fr-FR'
            ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale=lang)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            dl = []
            pg.on('download', lambda d: dl.append(d.suggested_filename))
            await pg.add_init_script("window.__noapi = false")
            await pg.goto(url); await pg.wait_for_timeout(1500)
            await pg.evaluate(FAKE, 'granted')
            await pg.evaluate(START); await pg.wait_for_timeout(1800)
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(200); await pg.evaluate("UI.closeAll()")

            # le mot « tour » du nom de fichier suit la langue (@save_turn)
            tw = await pg.evaluate("() => __k('@save_turn', 'tour')")

            # 1. choisir le dossier depuis le menu
            await pg.evaluate("() => { App.setPref('saveDir', null); App.setPref('autoExport', 0); Panels.menu(); }"); await pg.wait_for_timeout(300)
            txt = await pg.evaluate("() => [...document.querySelectorAll('.modal .row .t1')].map(e => e.innerText).find(t => /Dossier de sauvegarde|Save folder/.test(t)) || ''")
            ok(('aucun' in txt) if fr else ('none' in txt), '%s : le menu propose un dossier (%r)' % (lang, txt))
            await pg.evaluate("""() => [...document.querySelectorAll('.modal .row')].find(r => /Dossier de sauvegarde|Save folder/.test(r.innerText)).click()"""); await pg.wait_for_timeout(500)
            st = await pg.evaluate("() => ({ pref: App.prefs.saveDir, picks: window.__fs.picks, row: [...document.querySelectorAll('.modal .row .t1')].map(e => e.innerText).find(t => /Dossier|folder/.test(t)) })")
            ok(st['pref'] == 'Parties Arcanes' and st['picks'] == 1 and 'Parties Arcanes' in st['row'], 'dossier choisi et affiché : %r' % st['row'])
            await pg.evaluate("UI.closeAll()")
            idb = await pg.evaluate("""async () => { const R = window.__fs.real;   // les vraies, sur IndexedDB
              await R.keep({ name: 'Essai' }); const a = await R.handle(); await R.forget(); const b = await R.handle();
              return { a: a && a.name, b }; }""")
            ok(idb['a'] == 'Essai' and idb['b'] is None, 'IndexedDB garde puis oublie la poignée (%r)' % idb)

            # 2. la copie du tour s'y écrit, sans fenêtre et sans téléchargement
            await pg.evaluate("() => { App.setPref('autoExport', 1); App.game.turn = 24; }")
            await pg.evaluate("() => App.autoExport()"); await pg.wait_for_timeout(600)
            st = await pg.evaluate("() => ({ names: Object.keys(window.__fs.files), len: Object.values(window.__fs.files).map(t => t.length)[0] || 0, modals: UI.modals.length, toast: [...document.querySelectorAll('.toast')].map(t => t.innerText).join(' | ') })")
            ok(len(st['names']) == 1 and (tw + '24') in st['names'][0] and st['len'] > 500 and st['modals'] == 0 and not dl, 'écrite dans le dossier, sans fenêtre ni téléchargement : %r' % st['names'])
            ok(('Parties Arcanes' in st['toast']) and (('écrite dans' in st['toast']) if fr else ('written to' in st['toast'])), '%s : le jeu dit où (%r)' % (lang, st['toast'][:80]))
            # la sauvegarde est relisible
            good = await pg.evaluate("() => { try { const t = Object.values(window.__fs.files)[0]; const g = App.deserialize(t); return !!(g && g.turn === 24 && Object.keys(g.cities).length); } catch (e) { return String(e); } }")
            ok(good is True, 'le fichier écrit est une partie relisible (%r)' % good)

            # 3. le navigateur a oublié l'autorisation : un clic la rend, une seule fois
            await pg.evaluate("() => { window.__fs.perm = 'prompt'; window.__fs.files = {}; window.__fs.asked = 0; App.game.turn = 30; }")
            t = asyncio.create_task(pg.evaluate("() => App.autoExport()"))
            await pg.wait_for_timeout(500)
            body = await pg.evaluate("() => { const m = document.querySelector('.modal'); return m ? m.innerText : ''; }")
            ok('Parties Arcanes' in body and (('Autoriser' in body) if fr else ('Allow' in body)), 'le jeu demande le clic, en nommant le dossier (%r)' % body.replace('\n', ' ')[:80])
            await pg.evaluate("() => [...document.querySelectorAll('.modal .btn')].pop().click()")
            await t; await pg.wait_for_timeout(400)
            st = await pg.evaluate("() => ({ names: Object.keys(window.__fs.files), asked: window.__fs.asked, perm: window.__fs.perm })")
            ok(st['asked'] == 1 and len(st['names']) == 1 and (tw + '30') in st['names'][0] and not dl, 'autorisation redonnée, copie écrite (%r)' % st['names'])
            await pg.evaluate("() => { App.game.turn = 31; }"); await pg.evaluate("() => App.autoExport()"); await pg.wait_for_timeout(400)
            st = await pg.evaluate("() => ({ n: Object.keys(window.__fs.files).length, asked: window.__fs.asked, modals: UI.modals.length })")
            ok(st['n'] == 2 and st['asked'] == 1 and st['modals'] == 0, 'les tours suivants ne redemandent rien')

            # 4. « Télécharger » plutôt qu'autoriser : la copie part dans les téléchargements
            await pg.evaluate("() => { window.__fs.perm = 'prompt'; App.game.turn = 40; }")
            t = asyncio.create_task(pg.evaluate("() => App.autoExport()"))
            await pg.wait_for_timeout(500)
            await pg.evaluate("() => [...document.querySelectorAll('.modal .btn')][0].click()")
            await t; await pg.wait_for_timeout(600)
            ok(len(dl) == 1 and (tw + '40') in dl[0], 'refus du clic : téléchargement (%r)' % dl)

            # 5. le dossier oublié, puis un navigateur sans l'API
            await pg.evaluate("() => { window.__fs.perm = 'granted'; Panels.menu(); }"); await pg.wait_for_timeout(300)
            await pg.evaluate("""() => [...document.querySelectorAll('.modal .row button')].find(b => /Oublier|Forget/.test(b.innerText)).click()"""); await pg.wait_for_timeout(400)
            ok(await pg.evaluate("() => !App.prefs.saveDir"), 'le dossier s\'oublie')
            await pg.evaluate("UI.closeAll()")
            await pg.evaluate("() => { App.game.turn = 50; }"); await pg.evaluate("() => App.autoExport()"); await pg.wait_for_timeout(700)
            ok(len(dl) == 2 and (tw + '50') in dl[1], 'sans dossier : téléchargement (%r)' % dl[-1])
            await pg.evaluate(NOAPI)
            await pg.evaluate("Panels.menu()"); await pg.wait_for_timeout(300)
            txt = await pg.evaluate("() => [...document.querySelectorAll('.modal .row')].map(e => e.innerText).find(t => /Dossier de sauvegarde|Save folder/.test(t)) || ''")
            ok((('indisponible' in txt) if fr else ('unavailable' in txt)) and 'Chrome' in txt, 'sans l\'API : dit indisponible et pourquoi (%r)' % txt.replace('\n', ' ')[:100])
            if fr: await pg.screenshot(path=os.path.join(SHOTS, 'v03140_dossier.png'))
            await pg.evaluate("UI.closeAll()")
            ok(not errs, 'aucune erreur %s' % errs[:2])
            await ctx.close()
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
