"""v0.31.30 : les crises de fin à l'écran. Le début s'annonce au centre (illustration de la crise), le lieu se dessine sur la
carte et la mini-carte, le givre recouvre les terres, un nœud dévoré s'éteint ; la fin s'annonce aussi. Option de partie."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)

START = """(kind) => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
  const g = Game.newGame({ seed: 31, opponents: 2, difficulty: 'normal', crisis: 'off', finale: kind, human: { name: 'Éloïne', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highelf' } });
  App.start(g); }"""
BEGIN = """() => { const g = App.game, f = g.finale; g.turn = 200; f.target = App.pid; f.state = 'omen'; f.at = 200; Finale.begin(g); return f.state; }"""
MODAL = """() => { const m = document.querySelector('.finale-modal'); if (!m) return null; const img = m.querySelector('.lm-art img');
  return { text: m.innerText, img: img ? img.src.split('/').pop() : null, loaded: img ? img.naturalWidth : 0 }; }"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        url = 'file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')
        for lang in ('fr-FR', 'en-US'):
            ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale=lang)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(url); await pg.wait_for_timeout(1500)
            fr = lang == 'fr-FR'
            # 1. l'option de partie
            if fr:
                await pg.evaluate("() => Setup.newGame()"); await pg.wait_for_timeout(500)
                opt = await pg.evaluate("() => [...document.querySelectorAll('.modal select')].map(s => [...s.options].map(o => o.text).join('/')).find(t => /meneur/.test(t)) || ''")
                ok('Contre le meneur' in opt and 'Désactivée' in opt, 'option de partie : %r' % opt)
                await pg.evaluate("UI.closeAll()")
            # 2. le Grand Hiver : l'annonce, le Cœur, le givre
            await pg.evaluate(START, 'winter'); await pg.wait_for_timeout(2500)
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
            ok(await pg.evaluate(BEGIN) == 'active', '%s : le Grand Hiver commence' % lang)
            await pg.evaluate("() => { App.finalePrompts(); }"); await pg.wait_for_timeout(1500)
            info = await pg.evaluate(MODAL)
            ok(info and info['img'] == 'finale_winter.jpg' or (info and info['img'] is None), 'annonce au centre (%s)' % (info and info['img']))
            ok(info and (('Grand Hiver' in info['text'] and 'Brisez-le' in info['text']) if fr else ('Great Winter' in info['text'] and 'Shatter it' in info['text'])), 'texte de l\'annonce')
            await pg.screenshot(path=os.path.join(SHOTS, 'v03130_hiver_%s.png' % lang[:2]))
            await pg.evaluate("() => [...document.querySelectorAll('.finale-modal .btn')].pop().click()"); await pg.wait_for_timeout(600)
            ok(not await pg.evaluate("!!document.querySelector('.finale-modal')") and await pg.evaluate("App.me().finaleNews.length") == 0, '« Voir » : fermé, file vidée')
            await pg.evaluate("() => { const g = App.game; for (let t = 0; t < 10; t++) { g.turn++; Finale.tick(g); } App.refresh(); }"); await pg.wait_for_timeout(800)
            frost = await pg.evaluate("() => { const s = App.game.sites[App.game.finale.site]; return (App.game.world.planes[s.plane].frost || []).filter(Boolean).length; }")
            ok(frost > 20, 'le givre s\'étend (%d cases)' % frost)
            await pg.screenshot(path=os.path.join(SHOTS, 'v03130_givre_%s.png' % lang[:2]))
            tip = await pg.evaluate("() => App.specialSiteHtml(App.game.sites[App.game.finale.site])")
            ok(('dégèle' in tip) if fr else ('thaws' in tip), 'infobulle du Cœur de l\'Hiver')
            # la fin : le Cœur brisé par le joueur
            await pg.evaluate("() => { const g = App.game; Finale.siteCleared(g, g.sites[g.finale.site], App.pid, []); }"); await pg.wait_for_timeout(1500)
            info = await pg.evaluate(MODAL)
            ok(info and (('Vous y avez mis fin' in info['text'] and '600' in info['text']) if fr else ('You ended it' in info['text'] and '600' in info['text'])), 'annonce de la fin, récompense')
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
            ok(await pg.evaluate("() => !App.game.world.planes[0].frost && !App.game.world.planes[1].frost"), 'tout dégèle')
            # 3. le Dévoreur : un nœud dévoré
            await pg.evaluate("() => { const g = App.game, s = g.sites.find(x => x.type === 'node'); s.devoured = true; s.owner = -1; return s.id; }")
            node = await pg.evaluate("() => App.nodeHtml(App.game.sites.find(x => x.devoured))")
            ok(('Dévoré' in node) if fr else ('Devoured' in node), 'nœud dévoré : infobulle')
            # 4. les autres crises s'annoncent et se dessinent sans erreur
            for kind in ('lich', 'archmage', 'eater', 'prophet'):
                await pg.evaluate(START, kind); await pg.wait_for_timeout(1800)
                await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(200); await pg.evaluate("UI.closeAll()")
                st = await pg.evaluate(BEGIN)
                await pg.evaluate("() => { App.finalePrompts(); }"); await pg.wait_for_timeout(1200)
                info = await pg.evaluate(MODAL)
                ok(st == 'active' and info is not None and info['text'], '%s : annonce (%s)' % (kind, info and info['img']))
                await pg.evaluate("() => [...document.querySelectorAll('.finale-modal .btn')].pop().click()"); await pg.wait_for_timeout(500)
                await pg.screenshot(path=os.path.join(SHOTS, 'v03130_%s_%s.png' % (kind, lang[:2])))
            ok(not errs, 'aucune erreur %s' % errs[:2])
            await ctx.close()
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
