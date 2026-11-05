"""v0.28.15 : chaque capacité d'unité ou de héros s'explique au survol (fiche de héros, panneau de la cité)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:300]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        # toutes les capacités affichables, de toutes les unités, héros (talents compris) et objets : une explication chacune
        r = await pg.evaluate("""() => { const keys = new Set();
          for (const u of Object.values(DATA.units)) for (const k in u.abilities) keys.add(k);
          for (const k in DATA.heroTalents) { keys.add(k); keys.add('super' + k[0].toUpperCase() + k.slice(1)); }
          for (const k in ABILITY_NAMES) keys.add(k);
          const shown = [...keys].filter(k => ABILITY_NAMES[k]);
          const empty = shown.filter(k => abilityTip(k, 3).replace(/<h4>.*?<\\/h4>/, '').trim().length < 8);
          return { affichées: shown.length, sans_texte: empty }; }""")
        print('COUVERTURE', r)
        for k, v in [('forester', None), ('poisonTouch', 6), ('fireBreath', 4), ('toHit', 20), ('deathGaze', 2), ('legendary', None)]:
            print(' ', await pg.evaluate("([k, v]) => { const d = document.createElement('div'); d.innerHTML = abilityTip(k, v == null ? true : v); return d.innerText.replace(/\\n+/g, ' : '); }", [k, v]))
        # fiche de héros : survol d'une capacité sans talent
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress]; const u = Heroes.spawn(g, me, DATA.heroes.HeroGreyfairer || Object.values(DATA.heroes)[0], c.plane, c.x, c.y, 300); window._h = u; Panels.heroSheet(u); }""")
        await pg.wait_for_timeout(500)
        chips = await pg.evaluate("() => [...document.querySelectorAll('.modal .abl')].map(e => e.textContent)")
        print('FICHE', chips)
        await pg.hover('.modal .abl >> nth=2'); await pg.wait_for_timeout(300)
        print('SURVOL FICHE', await pg.evaluate("() => document.querySelector('#tooltip').innerText.replace(/\\n+/g, ' : ')"))
        await pg.evaluate("UI.closeAll()")
        # une fiche d'unité affichée dans un panneau fixe (comme le panneau de production de la cité) : survol d'une capacité
        await pg.evaluate("() => { const d = document.createElement('div'); d.id = 'fiche'; d.style.cssText = 'position:fixed;left:20px;top:120px;width:300px;z-index:70;background:#111;padding:8px'; d.innerHTML = UI.unitTip({ type: 'HighMenPriest', ench: [], xp: 0, owner: 0, dmg: 0 }, App.game); document.body.append(d); }")
        print('PANNEAU', await pg.evaluate("() => [...document.querySelectorAll('#fiche .abl')].map(e => e.dataset.abl)"))
        await pg.hover('#fiche .abl >> nth=1'); await pg.wait_for_timeout(300)
        print('SURVOL PANNEAU', await pg.evaluate("() => document.querySelector('#tooltip').style.display + ' : ' + document.querySelector('#tooltip').textContent"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
