"""v0.21.0 : capacités d'unité grisées avec leur raison, sorts déjà actifs grisés, panneau des sorts en cours."""
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
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 6, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          for (const id of ['true_light', 'bless', 'healing', 'prayer']) if (!me.known.includes(id)) me.known.push(id);
          me.mana = 400; me.skillPoints = 9000;
          const mk = t => Units.create(g, t, me.id, fc.plane, fc.x + 1, fc.y);
          const A = [mk('HeroTorin'), mk('HighMenPriest'), mk('HighMenMagician'), mk('HighMenSpearmen'), mk('HighMenSpearmen')];
          const D = [0, 1, 2].map(() => Units.create(g, 'GnollHalberdiers', -1, fc.plane, fc.x + 1, fc.y));
          const bt = new Battle(g, { attackers: D, defenders: A, attackerPid: -1, defenderPid: me.id, plane: fc.plane, x: fc.x + 1, y: fc.y, rng: new RNG(5) });
          window._bt = bt; CombatView.run(g, bt, {}); }""")
        await pg.wait_for_timeout(600)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1500)
        print('PANNEAU AU DEPART', await pg.evaluate("getComputedStyle(document.querySelector('#c-spells')).display"))
        # Lumière vraie par le sorcier, Bénédiction sur un lancier, une malédiction ennemie, une capacité déjà utilisée
        await pg.evaluate("""() => { const bt = _bt, s = CombatView.humanSide, mine = bt.alive(s);
          CombatSpells.cast(bt, s, 'true_light', null, null, 0); bt.castThisRound[s] = false;
          const sp = mine.filter(b => b.u.type === 'HighMenSpearmen');
          sp[0].tempEnch.push('bless'); sp[1].tempEnch.push('bless'); sp[1].curses.push('weakness');
          bt.alive(1 - s)[0].tempEnch.push('holy_armor');
          mine.find(b => b.u.type === 'HighMenMagician').usedAbility.fireball = true;
          const tor = mine.find(b => b.u.type === 'HeroTorin'); tor.casterMana = 12; tor.moves = 2;
          CombatView.sel = tor; CombatView.refreshPanels(); }""")
        await pg.wait_for_timeout(400)
        print('PANNEAU', await pg.evaluate("document.querySelector('#c-spells').innerText.replace(/\\n+/g, ' | ')"))
        await pg.screenshot(path=os.path.join(SHOTS, '250-active-spells.png'))
        await pg.evaluate("CombatView.spellMenu()"); await pg.wait_for_timeout(400)
        print('MENU TORIN')
        for r in await pg.evaluate("[...document.querySelectorAll('.modal .row')].map(r => (r.classList.contains('dis') ? 'GRIS ' : 'ok   ') + r.innerText.replace(/\\n+/g, ' / ').slice(0, 110))"): print('  ', r)
        rows = await pg.query_selector_all('.modal .row.dis')
        await rows[-1].hover(); await pg.wait_for_timeout(500)
        print('BULLE', await pg.evaluate("document.querySelector('#tooltip').innerText.slice(0, 200)"))
        await pg.screenshot(path=os.path.join(SHOTS, '251-unit-abilities.png'))
        await pg.evaluate("UI.closeTop()")
        for t in ['HighMenMagician', 'HighMenPriest']:
            await pg.evaluate("t => { const b = _bt.alive(CombatView.humanSide).find(x => x.u.type === t); b.moves = 2; CombatView.sel = b; CombatView.spellMenu(); }", t)
            await pg.wait_for_timeout(300)
            print('MENU', t, await pg.evaluate("[...document.querySelectorAll('.modal .row')].slice(-1).map(r => (r.classList.contains('dis') ? 'GRIS ' : 'ok ') + r.innerText.replace(/\\n+/g, ' / ').slice(0, 90))"))
            await pg.evaluate("UI.closeTop()")
        print('IA SANS DOUBLON', await pg.evaluate("CombatSpells.wizardOptions(_bt, CombatView.humanSide).some(o => o.id === 'true_light')"), await pg.evaluate("_bt.unitSpells(_bt.alive(CombatView.humanSide).find(b => b.u.type === 'HeroTorin')).map(o => o.id).join(',')"))
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
