"""v0.31.36 : le sort Ouvrir une faille à l'écran. Lancé sous ses troupes, il dessine la faille sur les deux plans ; refusé ailleurs,
avec la raison. Icône du grimoire. En français et en anglais."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)

START = """() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
  const g = Game.newGame({ seed: 6, mapW: 60, mapH: 40, opponents: 3, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'Éloïne', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
  App.start(g); }"""
SETUP = """() => { const g = App.game, me = App.me(), w = g.world; me.known.push('open_rift'); me.mana = 1000;
  let spot = null;
  for (let y = 2; y < w.h - 2 && !spot; y++) for (let x = 0; x < w.w && !spot; x++)
    if (!Veil.riftSpotWhy(g, x, y) && Intel.knows(g, me, me.plane, x, y) && !Units.at(g, me.plane, x, y).length) spot = { plane: me.plane, x, y };
  if (!spot) return null;
  window._spot = spot; MapView.centerOn(spot.x, spot.y, spot.plane); App.refresh(); return spot; }"""

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
            await pg.evaluate(START); await pg.wait_for_timeout(2500)
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
            spot = await pg.evaluate(SETUP)
            ok(spot is not None, 'une case possible : %r' % spot)
            name = await pg.evaluate("() => DATA.spells.open_rift.name")
            ok(name == ('Ouvrir une faille' if fr else 'Open Rift'), 'nom : %s' % name)
            ok(await pg.evaluate("() => Sprites.resolve('spell:open_rift') === 'spell:chaos_rift'"), 'icône du grimoire')
            # refusé sans troupes
            await pg.evaluate("() => MagicUI.doCast('open_rift', _spot)"); await pg.wait_for_timeout(500)
            toast = await pg.evaluate("() => [...document.querySelectorAll('.toast')].map(t => t.innerText).join(' | ')")
            ok(('vos troupes' in toast) if fr else ('your troops' in toast), 'refus, avec la raison : %r' % toast[:120])
            # lancé sous ses troupes
            n0 = await pg.evaluate("() => { const g = App.game, me = App.me(); Units.create(g, 'HighMenSpearmen', me.id, _spot.plane, _spot.x, _spot.y); App.refresh(); return g.sites.length; }")
            await pg.evaluate("() => MagicUI.doCast('open_rift', _spot)"); await pg.wait_for_timeout(300)
            # l'incantation peut durer plusieurs tours : on la finit
            await pg.evaluate("() => { const g = App.game, me = App.me(); if (me.casting && me.casting.id === 'open_rift') { me.casting.progress = 1e6; Spells.progressCasting && Spells.progressCasting(g, me); } }")
            await pg.wait_for_timeout(300)
            info = await pg.evaluate("""(n0) => { const g = App.game; const r = g.sites.slice(n0).filter(s => s.type === 'rift'); return { n: r.length, planes: r.map(s => s.plane).sort().join(','), casting: App.me().casting && App.me().casting.id }; }""", n0)
            if info['n'] == 0 and info['casting']:
                await pg.evaluate("async () => { await Turn.endTurn(App.game); App.refresh(); }"); await pg.wait_for_timeout(1500)
                await pg.evaluate("UI.closeAll()")
                info = await pg.evaluate("""(n0) => { const g = App.game; const r = g.sites.slice(n0).filter(s => s.type === 'rift'); return { n: r.length, planes: r.map(s => s.plane).sort().join(','), casting: App.me().casting && App.me().casting.id }; }""", n0)
            ok(info['n'] == 2 and info['planes'] == '0,1', 'la faille s\'ouvre sur les deux plans : %r' % info)
            await pg.evaluate("() => { MapView.centerOn(_spot.x, _spot.y, _spot.plane); MapView.invalidate(); App.refresh(); }"); await pg.wait_for_timeout(800)
            await pg.screenshot(path=os.path.join(SHOTS, 'v03136_faille_%s.png' % lang[:2]))
            tip = await pg.evaluate("() => { const s = App.game.sites.find(x => x.type === 'rift' && x.by === App.pid); return s ? (App.specialSiteHtml ? App.specialSiteHtml(s) : '') : ''; }")
            ok(isinstance(tip, str), 'infobulle de la faille')
            ok(not errs, 'aucune erreur %s' % errs[:2])
            await ctx.close()
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
