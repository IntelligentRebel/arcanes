"""v0.20.0 : dernière chance (Relever les morts quand toutes vos unités tombent), ciblage des sorts annulé par un clic hors cible, alerte d'intrusion."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def title(pg):
    return await pg.evaluate("(document.querySelector('.modal h2, .modal h3, .modal .title') || {}).textContent || ''")


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
        # 1. dernière chance : 2 lanciers contre 3 hallebardiers gnolls, en automatique
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          if (!me.known.includes('raise_dead')) me.known.push('raise_dead'); me.mana = 400; me.skillPoints = 9000;
          const A = [0, 1].map(() => Units.create(g, 'HighMenSpearmen', me.id, fc.plane, fc.x + 1, fc.y));
          const D = [0, 1, 2].map(() => Units.create(g, 'GnollHalberdiers', -1, fc.plane, fc.x + 1, fc.y));
          const bt = new Battle(g, { attackers: D, defenders: A, attackerPid: -1, defenderPid: me.id, plane: fc.plane, x: fc.x + 1, y: fc.y, rng: new RNG(7) });
          window._bt = bt; window._done = null; CombatView.run(g, bt, {}).then(r => { window._done = r; }); }""")
        await pg.wait_for_timeout(600)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Résolution')); btn && btn.click(); }""")
        seen = None
        for _ in range(120):
            await pg.wait_for_timeout(400)
            t = await title(pg)
            if 'Relever' in t or 'Victoire' in t or 'Défaite' in t: seen = t; break
        print('FIN DE BATAILLE', seen, await pg.evaluate("document.querySelector('.modal') && document.querySelector('.modal').textContent.slice(0, 160)"))
        if seen and 'Relever' in seen:
            await pg.screenshot(path=os.path.join(SHOTS, '240-last-stand.png'))
            await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Relever')); btn.click(); }""")
            await pg.wait_for_timeout(1200)
            print('REPRISE', await pg.evaluate("[_bt.over, _bt.alive(CombatView.humanSide).length]"))
            for _ in range(120):
                await pg.wait_for_timeout(400)
                t = await title(pg)
                if 'Victoire' in t or 'Défaite' in t or 'Relever' in t: break
            print('PUIS', await title(pg))
        for _ in range(4):
            await pg.evaluate("""() => { const bs = [...document.querySelectorAll('.modal button')]; const b = bs.find(x => /Accepter|Continuer|Laisser/.test(x.textContent)); b && b.click(); }""")
            await pg.wait_for_timeout(500)
        await pg.wait_for_timeout(800)
        # 2. ciblage : Guérison sur des unités en pleine santé, puis un clic sur une case libre = sort annulé et déplacement
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          if (!me.known.includes('healing')) me.known.push('healing');
          const A = [0, 1].map(() => Units.create(g, 'HighMenSpearmen', me.id, fc.plane, fc.x + 1, fc.y));
          const D = [Units.create(g, 'Skeleton', -1, fc.plane, fc.x + 1, fc.y)];
          const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: -1, plane: fc.plane, x: fc.x + 1, y: fc.y, rng: new RNG(3) });
          window._bt2 = bt; CombatView.run(g, bt, {}); }""")
        await pg.wait_for_timeout(600)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1500)
        await pg.evaluate("CombatView.spellMenu()"); await pg.wait_for_timeout(400)
        print('MENU', await pg.evaluate("[...document.querySelectorAll('.modal .row')].map(r => r.className + ' | ' + r.textContent.slice(0, 50))"))
        await pg.evaluate("UI.closeTop()")
        r = await pg.evaluate("""() => { const bt = _bt2, sel = CombatView.sel; CombatView.mode = { id: 'healing', caster: null, tt: 'friendlyUnit' };
          const reach = [...bt.reachable(sel).values()].find(n => !bt.unitAt(n.c, n.r)); const P = CombatView.iso(reach.c, reach.r);
          CombatView.onClick({ clientX: P.x, clientY: P.y, button: 0 }); return { from: [sel.c, sel.r], to: [reach.c, reach.r], mode: CombatView.mode }; }""")
        await pg.wait_for_timeout(900)
        print('CLIC HORS CIBLE', r, await pg.evaluate("[CombatView.sel && [CombatView.sel.c, CombatView.sel.r]]"))
        await pg.evaluate("() => { _bt2.finish(0); CombatView.finished = true; CombatView.close(); }")
        await pg.wait_for_timeout(600)
        # 3. alerte d'intrusion
        info = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress]; UI.closeAll();
          const t = [[2, 1], [1, 2], [-2, 1], [2, -1]].map(([dx, dy]) => [fc.x + dx, fc.y + dy]).find(([x, y]) => !World.isWaterAt(g.world, fc.plane, x, y) && g.world.planes[fc.plane].owner[y * g.world.w + x] === me.id);
          for (let i = 0; i < 3; i++) Units.create(g, 'OrcSpearmen', -1, fc.plane, t[0], t[1]);
          MapView.invalidateVis && MapView.invalidateVis(); g._intelStamp = (g._intelStamp || 0) + 1;
          const lastE = g.log[g.log.length - 1]; Turn.intrusions(g); App.summary(lastE); App.refresh();
          return g.log.slice(-1)[0].text; }""")
        print('ALERTE', info)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '241-intrusion-alert.png'))
        print('BANDEAU', await pg.evaluate("[...document.querySelectorAll('.toast.alertbar')].map(t => t.textContent)"), 'JOURNAL', await pg.evaluate("[...document.querySelectorAll('#logbox .e.alert')].length"))
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
