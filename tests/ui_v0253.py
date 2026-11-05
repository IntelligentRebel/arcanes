"""v0.25.3 : cibles d'un sort en surbrillance ; portes fermées aux assaillants, qu'il faut enfoncer."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []; pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e) + ' ' + str(e.stack)[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 99, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'Morwen', portrait: 3, books: { chaos: 6, life: 4 }, retorts: [], race: 'orc' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(), foe = g.players[1], c = g.cities[foe.fortress];
          c.buildings.cityWalls = true; c.buildings.defenseTowers = true;
          for (const u of Units.at(g, c.plane, c.x, c.y)) Units.remove(g, u);
          const D = ['Spearmen', 'Bowmen', 'Swordsmen'].map(t => Object.keys(DATA.units).find(k => DATA.units[k].race === foe.race && k.endsWith(t))).filter(Boolean).map(t => Units.create(g, t, foe.id, c.plane, c.x, c.y));
          const A = ['OrcSwordsmen', 'OrcSwordsmen', 'OrcHalberdiers', 'BatteringRam', 'OrcSwordsmen'].map(t => Units.create(g, t, pl.id, c.plane, c.x, c.y));
          pl.known.push('fire_bolt', 'disrupt'); pl.mana = 300; pl.skillPoints = 900;
          const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: pl.id, defenderPid: foe.id, plane: c.plane, x: c.x, y: c.y, city: c, rng: new RNG(5) });
          window._bt = bt; CombatView.run(g, bt, { city: c }); return { gates: bt.towers.filter(t => t.kind === 'gate').map(t => t.id + ' ' + t.hp) }; }""")
        print('PORTES', r)
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1500)
        # 1. ciblage du Trait de feu : anneaux autour des cibles
        await pg.evaluate("CombatView.prepareCast('fire_bolt', null)"); await pg.wait_for_timeout(400)
        print('CIBLES', await pg.evaluate("CombatView.targetObjects().map(o => (o.u ? o.u.type : o.id))"))
        await pg.screenshot(path=os.path.join(SHOTS, '290-spell-targets.png'))
        await pg.evaluate("CombatView.mode = null")
        await pg.evaluate("CombatView.prepareCast('disrupt', null)"); await pg.wait_for_timeout(300)
        print('DISRUPTION', len(await pg.evaluate("CombatView.targetObjects()")))
        await pg.screenshot(path=os.path.join(SHOTS, '291-disrupt-targets.png'))
        await pg.evaluate("CombatView.mode = null")
        # 2. la porte bloque : un épéiste devant la porte ne peut pas entrer ; il l'enfonce
        r = await pg.evaluate("""async () => { const bt = window._bt; const sw = bt.units.find(b => b.u.type === 'OrcSwordsmen' && b.side === ATT_SIDE);
          sw.c = 9; sw.r = 5; CombatView.pos[sw.id].c = 9; CombatView.pos[sw.id].r = 5; sw.moves = sw.maxMoves || 2;
          const reach = bt.reachable(sw); const inside = [...reach.values()].some(n => bt.inCity(n.c, n.r));
          const gate = bt.gateAt(8, 5); const can = bt.canMeleeTower(sw, gate);
          let hits = 0; while (bt.standing(gate) && hits < 8) { sw.moves = 2; bt.meleeTower(sw, gate); hits++; }
          await CombatView.playEvents();
          const after = bt.reachable(Object.assign(sw, { moves: 2 })); 
          return { entreAvant: inside, peutFrapper: can, coups: hits, porte: gate.hp, breche: bt.walls['8,5'].broken, entreApres: [...after.values()].some(n => bt.inCity(n.c, n.r)), log: bt.log.slice(-2) }; }""")
        print('PORTE', r)
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '292-gate-broken.png'))
        await pg.evaluate("CombatView.toggleAuto()")
        for _ in range(150):
            await pg.wait_for_timeout(300)
            t = await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ')")
            if 'Victoire' in t or 'Défaite' in t: break
        print('FIN', (await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ')")).replace('\n', ' | ')[:300])
        print('ERRORS', len(errors))
        for e in errors[:6]: print('  ', e[:400])
        await b.close()

asyncio.run(main())
