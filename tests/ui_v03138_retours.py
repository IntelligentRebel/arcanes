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
        ok(await pg.evaluate("() => Sprites.failed.length === 0 && !!Sprites.hd && Sprites.hasHD(Sprites.resolve('spell:seal_rift'))"), 'planches HD chargées, icône de Sceller une faille comprise')
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
        ok(n['hd'] >= 2 and await pg.evaluate("() => !!Sprites.hd"), 'un échec passager : réessayé (%d essais), graphismes HD en place' % n['hd'])
        await ctx.close()

        # (0.31.39) une planche HD introuvable : plus de graphismes de secours ; l'écran d'attente le dit et propose de réessayer
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='en-US'); pg = await ctx.new_page()
        block = {'on': True}
        async def gate(route):
            if block['on']: await route.abort()
            else: await route.continue_()
        await pg.route('**/assets/hd.png', gate)
        await pg.goto(url); await pg.wait_for_selector('#boot button', timeout=40000)
        w = await pg.evaluate("() => document.getElementById('boot').innerText")
        ok('failed to download' in w and 'Retry' in w and not await pg.evaluate("() => !!document.querySelector('.title-screen')"), 'planche HD introuvable : pas de jeu, « Réessayer » (%r)' % w.replace('\n', ' ')[:70])
        await pg.screenshot(path=os.path.join(SHOTS, 'v03139_reessayer.png'))
        block['on'] = False
        await pg.click('#boot button'); await pg.wait_for_selector('.title-screen', timeout=40000)
        ok(await pg.evaluate("() => !!Sprites.hd && !document.getElementById('boot')"), 'après « Réessayer » : graphismes en place, le titre s\'ouvre')
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

        # ---------- 6. (0.31.39) cité suivante, journal, batailles automatiques, rythme ----------
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='en-US'); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(url); await pg.wait_for_selector('.title-screen', timeout=30000)
        await pg.evaluate("() => Setup.newGame()"); await pg.wait_for_timeout(500)
        opt = await pg.evaluate("() => [...document.querySelectorAll('.modal select')].map(s => [...s.options].map(o => o.text).join('/')).find(t => /Epic/.test(t)) || ''")
        ok(opt == 'Quick/Normal/Epic', 'nouvelle partie : rythme %r' % opt)
        await pg.evaluate("UI.closeAll()")
        n = await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 12, opponents: 2, difficulty: 'normal', crisis: 'off', finale: 'off', pace: 'epic', human: { name: 'Eloine', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); const c0 = Cities.ofPlayer(g, 0)[0], w = g.world; let k = 0;
          for (let y = 3; y < w.h - 3 && k < 2; y += 4) for (let x = 0; x < w.w && k < 2; x += 5) { if (World.isWaterAt(w, c0.plane, x, y) || Cities.at(g, c0.plane, x, y) || Cities.ofPlayer(g, 0).some(c => World.dist(w, c.x, c.y, x, y) < 4)) continue; try { Cities.create(g, 0, 'highmen', c0.plane, x, y); k++; } catch (e) {} }
          return { n: Cities.ofPlayer(g, 0).length, granary: DATA.buildings.granary.cost }; }""")
        await pg.wait_for_timeout(1800); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(200); await pg.evaluate("UI.closeAll()")
        ok(n['n'] == 3 and n['granary'] == 60, 'partie Épique : %d cités, grenier à %d' % (n['n'], n['granary']))
        r = await pg.evaluate("""async () => { const cs = Cities.ofPlayer(App.game, 0); CityUI.open(cs[0].id); await new Promise(r => setTimeout(r, 300));
          const head = [...document.querySelectorAll('.citymodal header .cityhead')].map(b => b.title || b.innerText); const t0 = document.querySelector('.citymodal h2').innerText;
          [...document.querySelectorAll('.citymodal header .cityhead')].find(b => b.title === 'Next city').click(); await new Promise(r => setTimeout(r, 300));
          const t1 = document.querySelector('.citymodal h2').innerText, cur1 = CityUI.cur;
          [...document.querySelectorAll('.citymodal header .cityhead')].find(b => b.title === 'Previous city').click(); await new Promise(r => setTimeout(r, 300));
          return { head, t0, t1, cur1, back: CityUI.cur === cs[0].id, n: UI.modals.length, want: cs[1].id }; }""")
        ok('Next city' in r['head'] and 'Previous city' in r['head'] and r['cur1'] == r['want'] and r['t0'] != r['t1'] and r['back'] and r['n'] == 1, 'écran de cité : suivante puis précédente, dans la même fenêtre (%s → %s)' % (r['t0'], r['t1']))
        await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""() => { const g = App.game, box = document.getElementById('logbox'); Game.log(g, 0, 'ligne A'); Game.log(g, 0, 'ligne B');
          const last0 = box.lastElementChild.innerText; App.setLogOrder(true); Game.log(g, 0, 'ligne C'); const first1 = box.firstElementChild.innerText, last1 = box.lastElementChild.innerText;
          App.setLogOrder(false); return { last0, first1, back: box.lastElementChild.innerText, wrap: !!document.getElementById('logwrap') }; }""")
        ok('ligne B' in r['last0'] and 'ligne C' in r['first1'] and 'ligne C' in r['back'] and r['wrap'], 'journal : le plus récent en haut, puis de nouveau en bas')
        grip = await pg.locator('#log-grip').bounding_box(); wr0 = await pg.locator('#logwrap').bounding_box()
        await pg.mouse.move(grip['x'] + 20, grip['y'] + 6); await pg.mouse.down(); await pg.mouse.move(grip['x'] + 220, grip['y'] - 194, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(200)
        wr1 = await pg.locator('#logwrap').bounding_box()
        ok(abs(wr1['x'] - wr0['x'] - 200) < 4 and abs(wr1['y'] - wr0['y'] + 200) < 4, 'journal déplacé à la poignée (%d,%d → %d,%d)' % (wr0['x'], wr0['y'], wr1['x'], wr1['y']))
        sz = await pg.locator('#log-size').bounding_box()
        await pg.mouse.move(sz['x'] + 6, sz['y'] + 6); await pg.mouse.down(); await pg.mouse.move(sz['x'] + 86, sz['y'] - 54, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(200)
        wr2 = await pg.locator('#logwrap').bounding_box()
        ok(abs(wr2['width'] - wr1['width'] - 80) < 6 and abs(wr2['height'] - wr1['height'] - 60) < 6 and await pg.evaluate("() => !!App.prefs.logPos"), 'journal redimensionné au coin (%dx%d → %dx%d), place retenue' % (wr1['width'], wr1['height'], wr2['width'], wr2['height']))
        await pg.dblclick('#log-grip'); await pg.wait_for_timeout(200)
        wr3 = await pg.locator('#logwrap').bounding_box()
        ok(abs(wr3['x'] - wr0['x']) < 2 and abs(wr3['width'] - wr0['width']) < 2, 'double-clic sur la poignée : retour à sa place')
        r = await pg.evaluate("() => { CombatView.auto = true; const out = {}; for (const k of ['fast', 'medium', 'slow']) { App.setPref('autoSpeed', k); out[k] = Math.round(CombatView.af(60, 400)); } CombatView.auto = false; App.setPref('autoSpeed', 'fast'); return out; }")
        ok(r['fast'] == 60 and r['slow'] == 400 and 60 < r['medium'] < 400, 'batailles automatiques : rapide %d ms, moyenne %d, lente %d' % (r['fast'], r['medium'], r['slow']))
        await pg.evaluate("Panels.menu()"); await pg.wait_for_timeout(200)
        rows = await pg.evaluate("() => [...document.querySelectorAll('.modal .row .t1')].map(e => e.innerText)")
        ok(any(t.startswith('Automatic battles: fast') for t in rows) and any(t.startswith('Log: newest at the bottom') for t in rows), 'menu : batailles automatiques et ordre du journal')
        ok(not errs, 'aucune erreur %s' % errs[:2])
        await ctx.close()
        await b.close()
    httpd.shutdown()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
