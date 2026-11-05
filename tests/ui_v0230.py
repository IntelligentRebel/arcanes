"""v0.23.0 : sorciers de l'autre plan cachés, sélection de toute la pile, accueil d'un héros appelé par un sort."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1500, 'height': 1000})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 7, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 6, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('PLANS', await pg.evaluate("App.game.players.map(p => p.name + ':' + (App.game.cities[p.fortress].plane ? 'Miroir' : 'Arcane')).join(' ')"))
        await pg.evaluate("() => { Setup.intro(App.game); }")
        await pg.wait_for_timeout(400)
        print('INTRO', await pg.evaluate("document.querySelector('.modal').innerText.slice(0, 160).replace(/\\n/g, ' ')"))
        await pg.evaluate("UI.closeAll()")
        await pg.evaluate("Panels.wizards()"); await pg.wait_for_timeout(400)
        print('ECRAN SORCIERS', await pg.evaluate("[...document.querySelectorAll('.modal .box .serif')].map(d => d.textContent).join(' | ')"))
        await pg.evaluate("UI.closeAll()")
        # pile de 4 unités hors cité, deux sans mouvement
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const t = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, fc.plane, x, y) && !Cities.at(g, fc.plane, x, y) && World.get(g.world, fc.plane, 'site', x, y) < 0);
          const us = ['HighMenSwordsmen', 'HighMenSpearmen', 'HighMenBowmen', 'HighMenCavalry'].map(k => Units.create(g, k, me.id, fc.plane, t[0], t[1]));
          us[0].moves = 0; us[1].moves = 0; us[2].status = 'sentry';
          window._t = t; App.selectTile(fc.plane, t[0], t[1]); MapView.centerOn(t[0], t[1], fc.plane); }""")
        await pg.wait_for_timeout(400)
        cnt = "() => [App.sel.ids.length, App.sel.all.length, App.sel.all.map(id => App.game.units[id].status || '-').join(',')]"
        print('CLIC SUR LA PILE', await pg.evaluate(cnt))
        await pg.screenshot(path=os.path.join(SHOTS, '260-stack-select.png'), clip={'x': 1150, 'y': 60, 'width': 350, 'height': 420})
        await pg.evaluate("() => [...document.querySelectorAll('#sel .selbtns button')].find(b => b.textContent === 'Une unité').click()")
        await pg.wait_for_timeout(200)
        print('UNE UNITE', await pg.evaluate(cnt))
        await pg.evaluate("() => [...document.querySelectorAll('#sel .selbtns button')].find(b => b.textContent === 'Tout sélectionner').click()")
        await pg.wait_for_timeout(200)
        print('TOUT', await pg.evaluate(cnt))
        # Appel du héros, lancé d'un coup
        await pg.evaluate("""() => { const me = App.me(); if (!me.known.includes('summon_hero')) me.known.push('summon_hero'); me.mana = 900; me.skillLeft = 900; MagicUI.doCast('summon_hero', null); }""")
        await pg.wait_for_timeout(900)
        print('ACCUEIL', await pg.evaluate("(() => { const m = document.querySelector('.modal'); return m ? m.innerText.replace(/\\n+/g, ' | ').slice(0, 220) : null; })()"))
        await pg.screenshot(path=os.path.join(SHOTS, '261-hero-arrival.png'))
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
