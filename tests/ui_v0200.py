"""v0.20.0 : après une bataille gagnée en résolution automatique, proposer Relever les morts pour les unités tombées."""
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
        # plusieurs essais : il faut une victoire avec des pertes
        for attempt in range(8):
            await pg.evaluate("""(k) => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
              if (!me.known.includes('raise_dead')) me.known.push('raise_dead'); me.mana = 300; me.skillPoints = 4000; Music && Music.jingle && (Music.jingle = () => true);
              const A = []; for (let i = 0; i < 8; i++) A.push(Units.create(g, i < 4 ? 'HighMenSwordsmen' : 'HighMenSpearmen', me.id, fc.plane, fc.x, fc.y));
              const D = ['Skeleton', 'Skeleton'].map(t => Units.create(g, t, -1, fc.plane, fc.x, fc.y));
              const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: -1, plane: fc.plane, x: fc.x, y: fc.y, rng: new RNG(1000 + k) });
              window._done = null; CombatView.run(g, bt, {}).then(r => { window._done = r; }); }""", attempt)
            await pg.wait_for_timeout(600)
            await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Résolution')); btn && btn.click(); }""")
            for _ in range(60):
                await pg.wait_for_timeout(500)
                t = await pg.evaluate("(document.querySelector('.modal h2, .modal h3, .modal .title') || {}).textContent || ''")
                if 'Relever' in t or 'Victoire' in t or 'Défaite' in t: break
            title = await pg.evaluate("(document.querySelector('.modal h2, .modal h3, .modal .title') || {}).textContent || ''")
            print('ESSAI', attempt, 'fenêtre :', title, await pg.evaluate("(() => { const bt = CombatView.bt, s = CombatView.humanSide; return { morts: bt.dead.filter(b => b.side === s).length, cibles: CombatSpells.validTargets(bt, s, 'raise_dead').length, comp: bt.skillLeft[s], auto: CombatView.auto, cout: Magic.spellCost(App.game, App.me(), 'raise_dead', true) }; })()"))
            if 'Relever' in title:
                print('TEXTE', await pg.evaluate("document.querySelector('.modal').textContent"))
                await pg.screenshot(path=os.path.join(SHOTS, '239-raise-dead-offer.png'))
                before = await pg.evaluate("CombatView.bt.dead.filter(b => b.side === CombatView.humanSide).length")
                await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Relever')); btn.click(); }""")
                await pg.wait_for_timeout(2500)
                after = await pg.evaluate("CombatView.bt.dead.filter(b => b.side === CombatView.humanSide).length")
                print('MORTS avant/après', before, after, 'mana', await pg.evaluate("App.me().mana"))
                # fermer la suite (autres propositions, puis victoire)
                for _ in range(6):
                    await pg.evaluate("""() => { const bs = [...document.querySelectorAll('.modal button')]; const b = bs.find(x => x.textContent === 'Laisser') || bs.find(x => x.textContent.startsWith('Accepter') || x.textContent === 'Continuer'); b && b.click(); }""")
                    await pg.wait_for_timeout(500)
                await pg.wait_for_timeout(800)
                print('FIN', await pg.evaluate("window._done ? window._done.results().survivors[0].length : null"))
                break
            await pg.evaluate("""() => { const bs = [...document.querySelectorAll('.modal button')]; const b = bs.find(x => x.textContent.startsWith('Accepter') || x.textContent === 'Continuer'); b && b.click(); }""")
            await pg.wait_for_timeout(800)
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
