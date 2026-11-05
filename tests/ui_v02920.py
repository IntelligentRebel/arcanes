"""v0.29.20 : Magie et trésor : renvoyer une créature invoquée, rompre un sort entretenu (unité, cité), abandonner l'incantation."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true; window.AUTO_CHOICE = true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { nature: 6, life: 4 }, retorts: [], race: 'highelf' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        print(await pg.evaluate("""() => { const g = App.game, me = App.me(), f = g.cities[me.fortress];
          const bear = Units.create(g, 'WarBear', me.id, f.plane, f.x, f.y); const sp = Units.at(g, f.plane, f.x, f.y).find(u => u.owner === me.id && !u.hero && u.type !== 'WarBear');
          sp.ench.push('bless', 'heroism'); f.ench.push({ spell: 'prosperity', owner: me.id }); me.known.push('wall_of_stone'); me.mana = 400;
          Spells.cast(g, me, 'wall_of_stone', { city: f.id }); window._bear = bear.id; window._sp = sp.id;
          return 'entretien ' + Magic.manaUpkeep(g, me) + ', incantation ' + (me.casting && me.casting.id); }"""))
        await pg.evaluate("MagicUI.showSummons = true; MagicUI.magic()"); await pg.wait_for_timeout(500)
        txt = lambda: pg.evaluate("() => { const hs = [...document.querySelectorAll('.sect h4')].filter(h => /créatures invoquées|sorts en cours/.test(h.textContent)); return hs.map(h => h.parentElement.innerText.replace(/\\n+/g, ' | ')).join(' ## '); }")
        print('AVANT', await txt())
        await pg.screenshot(path=os.path.join(SHOTS, 'v02920_magie.png'))
        clic = "(lab) => { const h = [...document.querySelectorAll('.sect h4')].find(h => new RegExp(lab[0]).test(h.textContent)); const row = [...h.parentElement.querySelectorAll('.row')].find(r => r.innerText.includes(lab[1])); row.querySelector('button.danger').click(); }"
        await pg.evaluate(clic, ['créatures invoquées', 'Ours de guerre']); await pg.wait_for_timeout(300)
        await pg.evaluate(clic, ['sorts en cours', 'Héroïsme']); await pg.wait_for_timeout(300)
        await pg.evaluate(clic, ['sorts en cours', 'Prospérité']); await pg.wait_for_timeout(300)
        await pg.evaluate(clic, ['sorts en cours', 'Mur de pierre']); await pg.wait_for_timeout(300)
        print('APRÈS', await txt())
        print('ÉTAT', await pg.evaluate("""() => { const g = App.game, me = App.me(), f = g.cities[me.fortress]; return JSON.stringify({ ours: !!g.units[_bear], ench: g.units[_sp].ench, cité: f.ench.map(e => e.spell), incantation: me.casting && me.casting.id, entretien: Magic.manaUpkeep(g, me) }); }"""))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
