"""v0.31.38 : retours des premiers joueurs (CivFanatics).
1. Premier chargement servi en http : écran d'attente avec la progression, le titre s'ouvre sans attendre les animations (90 Mo),
   qui arrivent ensuite ; une planche HD en échec est réessayée, puis signalée (bandeau « Recharger ») au lieu d'un repli muet.
2. Menu : un réglage basculé garde le défilement, et le second clic d'un double-clic ne le rebascule pas.
3. En anglais, plus de français dans la prévision de bataille, la conquête, la chronique, la diplomatie.
4. Une erreur d'affichage n'arrête plus la boucle : le jeu continue de répondre."""
import asyncio, os, sys, threading, http.server, functools, socket
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist', 'arcanes')
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Quiet, directory=DIST))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port

START = """() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
  const g = Game.newGame({ seed: 12, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'Eloine', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
  App.start(g); }"""

async def main():
    httpd, port = serve()
    url = 'http://127.0.0.1:%d/index.html' % port
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- 1. chargement ----------
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        seen = {'boot': False, 'txt': ''}
        # les planches d'animation retenues un instant : le titre doit s'ouvrir avant elles
        async def slow(route):
            await asyncio.sleep(2.5); await route.continue_()
        await pg.route('**/assets/anim*.png', slow)
        await pg.goto(url, wait_until='commit')
        for _ in range(200):
            st = await pg.evaluate("() => ({ boot: !!document.getElementById('boot'), txt: (document.querySelector('#boot .boot-txt') || {}).textContent || '', title: !!document.querySelector('.title-screen'), ready: typeof Sprites !== 'undefined' && Sprites.ready, anim: typeof Anim !== 'undefined' && !!Anim.img, bg: (document.getElementById('bgload') || {}).textContent || '' })")
            if st['boot']: seen['boot'] = True; seen['txt'] = st['txt'] or seen['txt']
            if st['title']: break
            await pg.wait_for_timeout(50)
        ok(seen['boot'], 'écran d\'attente affiché pendant le chargement (%r)' % seen['txt'])
        ok(st['title'] and not st['boot'] and st['ready'], 'le titre s\'ouvre, l\'écran d\'attente disparaît')
        ok(not st['anim'], 'sans attendre les animations')
        await pg.screenshot(path=os.path.join(SHOTS, 'v03138_titre.png'))
        for _ in range(300):
            if await pg.evaluate("() => !!Anim.img"): break
            await pg.wait_for_timeout(100)
        ok(await pg.evaluate("() => !!Anim.img && Anim.img.length >= 1 && Object.keys(Anim.meta).length > 10 && !document.getElementById('bgload')"), 'les animations arrivent ensuite')
        ok(await pg.evaluate("() => Sprites.failed.length === 0 && !document.getElementById('gfxwarn') && !!Sprites.hd && Sprites.hasHD(Sprites.resolve('spell:seal_rift'))"), 'planches HD chargées, icône de Sceller une faille comprise')
        ok(not errs, 'aucune erreur %s' % errs[:2]); await ctx.close()

        # une planche HD qui échoue une fois : réessayée, rien à signaler
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='fr-FR'); pg = await ctx.new_page()
        n = {'hd': 0}
        async def flaky(route):
            n['hd'] += 1
            if n['hd'] == 1: await route.abort()
            else: await route.continue_()
        await pg.route('**/assets/hd.png', flaky)
        await pg.goto(url); await pg.wait_for_selector('.title-screen', timeout=30000)
        ok(n['hd'] >= 2 and await pg.evaluate("() => !!Sprites.hd && !document.getElementById('gfxwarn')"), 'un échec passager : réessayé (%d essais), graphismes HD en place' % n['hd'])
        await ctx.close()

        # une planche HD introuvable : le jeu démarre quand même, et le dit
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='en-US'); pg = await ctx.new_page()
        await pg.route('**/assets/hd.png', lambda route: route.abort())
        await pg.goto(url); await pg.wait_for_selector('.title-screen', timeout=40000)
        w = await pg.evaluate("() => (document.getElementById('gfxwarn') || {}).innerText || ''")
        ok('high-definition' in w and 'Reload' in w, 'planche HD introuvable : bandeau et bouton Recharger (%r)' % w[:70])
        await pg.screenshot(path=os.path.join(SHOTS, 'v03138_secours.png'))
        await ctx.close()

        # ---------- 2. menu ----------
        ctx = await b.new_context(viewport={'width': 1400, 'height': 620}, locale='en-US'); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_selector('.title-screen', timeout=30000)
        await pg.evaluate(START); await pg.wait_for_timeout(2000)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(200); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("() => { Sfx.setOn(true); Sfx.setMusic(true); Panels.menu(); }"); await pg.wait_for_timeout(200)
        row = pg.locator('.modal .row', has_text='Music:').first
        await pg.evaluate("() => { const b = UI.modals[UI.modals.length - 1].body; b.scrollTop = 150; }"); await pg.wait_for_timeout(100)
        top0 = await pg.evaluate("() => UI.modals[UI.modals.length - 1].body.scrollTop")
        box = await row.bounding_box()
        ok(top0 > 0, 'le menu défile (%d px)' % top0)
        await pg.mouse.click(box['x'] + 60, box['y'] + 10); await pg.wait_for_timeout(600)
        st = await pg.evaluate("() => ({ music: Sfx.music, on: Sfx.on, top: UI.modals[UI.modals.length - 1].body.scrollTop, n: UI.modals.length })")
        ok(st['music'] is False and st['on'] is True and st['n'] == 1, 'un clic : musique coupée, son gardé')
        ok(abs(st['top'] - top0) <= 2, 'le menu rouvert garde son défilement (%d → %d)' % (top0, st['top']))
        # un second clic au même endroit retombe sur la même ligne
        await pg.mouse.click(box['x'] + 60, box['y'] + 10); await pg.wait_for_timeout(600)
        st = await pg.evaluate("() => ({ music: Sfx.music, on: Sfx.on })")
        ok(st['music'] is True and st['on'] is True, 'même endroit, même ligne : musique remise, rien d\'autre ne bouge')
        # double-clic : une seule bascule
        await pg.mouse.dblclick(box['x'] + 60, box['y'] + 10); await pg.wait_for_timeout(700)
        st = await pg.evaluate("() => ({ music: Sfx.music, on: Sfx.on })")
        ok(st['music'] is False and st['on'] is True, 'double-clic : une seule bascule')
        await pg.evaluate("UI.closeAll()")

        # ---------- 3. plus de français en anglais ----------
        txt = await pg.evaluate("""() => { const g = App.game, me = App.me(), out = {};
          out.rel = [60, 20, 0, -30, -60].map(r => r > 50 ? __t('amical') : r > 15 ? __t('cordial') : r > -15 ? __t('neutre') : r > -50 ? __t('méfiant') : __t('hostile')).join(',');
          out.intel = [0.1, 0.2, 0.5, 0.7, 0.9].map(p => Intel.intelLabel(p)).join(',');
          out.veil = Veil.stageName(g); out.cit = Veil.citizensText(3);
          const c = Cities.ofPlayer(g, 0)[0];
          out.chron = [Chronicle.text(g, { k: 'city_new', a: 0, c: 'Varn' }, 0), Chronicle.text(g, { k: 'city_new', a: 1, c: 'Varn' }, 0, true), Chronicle.text(g, { k: 'city_razed', a: 1, c: 'Varn', d: -1 }, 0, true), Chronicle.text(g, { k: 'global', a: 0, s: 'armageddon' }, 0)].join(' | ');
          out.item = Items.describe({ melee: 2, ranged: 1, def: 1, res: 1, move: 1, toHit: 1, hp: 3, skill: 5, powers: [] });
          return out; }""")
        ok(txt['rel'] == 'friendly,cordial,neutral,wary,hostile', 'diplomatie : %s' % txt['rel'])
        ok(txt['intel'] == 'very weak,weak,fair,good,excellent', 'renseignement : %s' % txt['intel'])
        ok(txt['veil'] == 'intact' and txt['cit'] == 'three citizens', 'voile et citoyens : %s, %s' % (txt['veil'], txt['cit']))
        ok('You found Varn.' in txt['chron'] and ' founds Varn.' in txt['chron'] and ' razes Varn' in txt['chron'] and 'You cast ' in txt['chron'], 'chronique : %s' % txt['chron'])
        ok('+2 attack' in txt['item'] and '+3 HP' in txt['item'] and 'attaque' not in txt['item'] and 'PV' not in txt['item'], 'artefact : %s' % txt['item'])
        await pg.evaluate("Panels.chronicle(App.game)"); await pg.wait_for_timeout(300)
        tabs = await pg.evaluate("() => [...document.querySelectorAll('.modal .tab, .modal .tabs button')].map(t => t.innerText).join(',')")
        ok('Graphs' in tabs and 'Curves' not in tabs, 'onglet de la chronique : %s' % tabs)
        await pg.evaluate("UI.closeAll()")

        # ---------- 4. une erreur d'affichage n'arrête plus la boucle ----------
        r = await pg.evaluate("""async () => { const d = MapView.draw; let n = 0, boom = 0; MapView.draw = function () { n++; if (boom < 2) { boom++; throw new Error('essai'); } return d.apply(this, arguments); };
          await new Promise(r => setTimeout(r, 600)); MapView.draw = d; return { n, toast: [...document.querySelectorAll('.toast')].map(t => t.innerText).join(' | ') }; }""")
        ok(r['n'] > 5 and 'Unexpected error: essai' in r['toast'], 'la boucle continue après une erreur (%d images), dite au joueur' % r['n'])
        ok(not [e for e in errs if 'essai' not in e], 'aucune autre erreur %s' % errs[:2])
        await ctx.close()

        # ---------- 5. thème à contraste élevé : les dons choisis se voient ----------
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='en-US', forced_colors='active'); pg = await ctx.new_page()
        await pg.goto(url); await pg.wait_for_selector('.title-screen', timeout=30000)
        await pg.evaluate("() => Setup.newGame()"); await pg.wait_for_timeout(600)
        info = await pg.evaluate("""() => { const el = [...document.querySelectorAll('.retort:not(.dis)')][0]; if (!el) return null; el.click(); const on = document.querySelector('.retort.on'); if (!on) return { on: false };
          const cs = getComputedStyle(on), bf = getComputedStyle(on, '::before'); return { on: true, outline: cs.outlineStyle + ' ' + cs.outlineWidth, mark: bf.content, bg: getComputedStyle(document.querySelector('.modal')).backgroundImage.slice(0, 20) }; }""")
        ok(info and info.get('on') and 'solid' in info['outline'] and '✓' in info['mark'], 'contraste élevé : don choisi coché et cerné (%r)' % info)
        await pg.screenshot(path=os.path.join(SHOTS, 'v03138_contraste.png'))
        await ctx.close()
        await b.close()
    httpd.shutdown()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
