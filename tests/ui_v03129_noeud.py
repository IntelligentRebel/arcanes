"""v0.31.29 : un nœud volé au joueur s'annonce au centre de l'écran, avec l'illustration du royaume du nœud."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for lang in ('fr-FR', 'en-US'):
            ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale=lang)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(1500)
            await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
              const g = Game.newGame({ seed: 31, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'Éloïne', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
              App.start(g); }""")
            await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
            realm = await pg.evaluate("""() => { const g = App.game, P = App.me(), R = g.players.find(x => x.id !== P.id);
              const s = g.sites.find(x => x.type === 'node' && x.realm === 'chaos') || g.sites.find(x => x.type === 'node');
              s.cleared = true; s.guardians = null; s.owner = P.id; s.meldBy = 'MagicSpirit'; P.diplo[R.id] = R.diplo[P.id] = 'war';
              for (let i = 0; i < 10 && s.owner === P.id; i++) { const u = Units.create(g, 'GuardianSpirit', R.id, s.plane, s.x, s.y); Game.meld(g, u.id); }
              return s.owner === R.id ? s.realm : null; }""")
            ok(realm is not None, '%s : nœud pris par le rival (%s)' % (lang, realm))
            await pg.evaluate("() => { App.nodeLostPrompts(); }"); await pg.wait_for_timeout(1500)
            info = await pg.evaluate("""() => { const m = document.querySelector('.landmark-modal'); if (!m) return null; const img = m.querySelector('.lm-art img');
              return { text: m.innerText, img: img ? img.src.split('/').pop() : null, loaded: img ? img.naturalWidth : 0 }; }""")
            ok(info and info['img'] == 'node_lost_%s.jpg' % realm and info['loaded'] > 1000, 'illustration %s' % (info and info['img']))
            ok(info and (('Nœud perdu' in info['text'] or 'NŒUD PERDU' in info['text']) if lang == 'fr-FR' else ('Node lost' in info['text'] or 'NODE LOST' in info['text'])), 'titre du message')
            await pg.screenshot(path=os.path.join(SHOTS, 'v03129_noeud_%s.png' % lang[:2]))
            await pg.evaluate("() => [...document.querySelectorAll('.landmark-modal .btn')].pop().click()"); await pg.wait_for_timeout(500)
            ok(not await pg.evaluate("!!document.querySelector('.landmark-modal')") and await pg.evaluate("App.me().nodesLost.length") == 0, 'fermé, file vidée')
            ok(not errs, 'aucune erreur %s' % errs[:2])
            await ctx.close()
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
