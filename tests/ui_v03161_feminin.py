"""v0.31.61 : une proposition de paix de Malivra parle d'elle au féminin (et de son attitude, de ses raisons) ; l'écran des
sorciers aussi ; en anglais, « she »."""
import asyncio, os, sys, http.server, threading, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except (ConnectionResetError, BrokenPipeError): pass
SETUP = """() => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {}; Music.jingle = () => true;
  const g = Game.newGame({ seed: 6, mapW: 60, mapH: 40, opponents: 3, otherPlane: 0, difficulty: 'hard', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 6 }, retorts: [], race: 'highmen' } });
  App.start(g); }"""
OFFER = """async () => { const g = App.game, me = App.me(), a = g.players.find(q => !q.human && q.alive);
  a.portrait = 2; a.name = 'Malivra';
  me.contact[a.id] = a.contact[me.id] = true; me.diplo[a.id] = a.diplo[me.id] = 'war'; a.relations[me.id] = -100;
  Diplomacy.why(g, a.id, me.id, 'attacked', -90);
  a.aiPlanSaid = { [me.id]: { kind: 'defend', target: me.id, turn: g.turn } };
  const off = { from: a.id, kind: 'peace', turn: g.turn }; Diplomacy.offer(g, me, off);
  App.offerPrompt(off); await new Promise(r => setTimeout(r, 700));
  return [...document.querySelectorAll('.modal')].map(m => m.innerText).join(' '); }"""
async def run(p, port, locale, shot):
    b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale=locale)
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(2500)
    await pg.evaluate(SETUP); await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
    t = await pg.evaluate(OFFER)
    await pg.screenshot(path=shot)
    await pg.evaluate("UI.closeAll()")
    return t, errs, pg, b
async def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist', 'arcanes')))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
    async with async_playwright() as p:
        t, errs, pg, b = await run(p, port, 'fr-FR', '/tmp/fem_fr.png')
        ok('Vous l\'avez attaquée' in t, 'raisons au féminin')
        ok('elle se retranche face à vous' in t, 'émissaires : elle se retranche')
        ok('il ' not in t.split('Sa proposition')[0].split('Malivra', 1)[1].replace('il y', ''), 'aucun « il » à son sujet')
        # l'écran des sorciers
        await pg.evaluate("Panels.wizards ? Panels.wizards() : Panels.diplomacy()"); await pg.wait_for_timeout(600)
        w = await pg.evaluate("() => [...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ')")
        ok('Hostile' in w and 'elle se retranche' in w, 'écran des sorciers : %r' % w[w.find('Malivra'):w.find('Malivra') + 60])
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
        t, errs, pg, b = await run(p, port, 'en-US', '/tmp/fem_en.png')
        ok('You attacked her' in t and 'she is digging in' in t, 'en anglais : %r' % t[t.find('You attacked'):t.find('You attacked') + 30])
        ok(not errs, 'aucune erreur de page (en) %r' % errs[:2])
        await b.close()
    srv.shutdown()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
