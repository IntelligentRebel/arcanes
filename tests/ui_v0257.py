import asyncio, os
from playwright.async_api import async_playwright
# v0.25.7 : champ de bataille 13x13, cité 7x7 (intérieur 5x5), murailles fines, tireurs postés au sommet des murs
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' ' + str(e.stack)[:300]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 99, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'Morwen', portrait: 3, books: { chaos: 6, life: 4 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), foe = g.players[1], c = g.cities[me.fortress];
          c.buildings.cityWalls = true; c.buildings.defenseTowers = true;
          for (const u of Units.at(g, c.plane, c.x, c.y)) Units.remove(g, u);
          const D = ['HighMenBowmen', 'HighMenBowmen', 'HighMenSpearmen', 'HighMenSwordsmen', 'HighMenSwordsmen', 'HighMenSpearmen', 'HighMenPikemen', 'HighMenMagician', 'HighMenCavalry'].map(t => Units.create(g, t, me.id, c.plane, c.x, c.y));
          const A = ['OrcSwordsmen', 'OrcBowmen', 'OrcSwordsmen', 'OrcShamans', 'BatteringRam'].map(t => Units.create(g, t, foe.id, c.plane, c.x, c.y));
          const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: foe.id, defenderPid: me.id, plane: c.plane, x: c.x, y: c.y, city: c, rng: new RNG(5) });
          window._bt = bt; CombatView.run(g, bt, { city: c });
          const def = bt.units.filter(b => b.side === DEF_SIDE);
          let free = 0; for (let q = CITY_MIN + 1; q < CITY_MAX; q++) for (let t = CITY_MIN + 1; t < CITY_MAX; t++) if (!bt.unitAt(q, t) && !bt.blocked(q, t)) free++;
          return { grille: [CW, CH], cite: [CITY_MIN, CITY_MAX], portes: bt.towers.filter(t => t.kind === 'gate').map(t => t.c + ',' + t.r),
            tours: bt.towers.filter(t => t.kind !== 'gate').map(t => t.kind + '@' + t.c + ',' + t.r),
            remparts: def.filter(b => bt.onRampart(b.c, b.r)).map(b => b.u.type + '@' + b.c + ',' + b.r),
            interieur: def.filter(b => !bt.onRampart(b.c, b.r)).map(b => b.u.type + '@' + b.c + ',' + b.r), casesLibres: free,
            assaillants: bt.units.filter(b => b.side === ATT_SIDE).map(b => b.c + ',' + b.r) }; }""")
        print('DÉPLOIEMENT', r)
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1300)
        await pg.screenshot(path=os.path.join(SHOTS, '300-city13.png'))
        # clic sur le corps d'un archer posté : il est sélectionné
        r = await pg.evaluate("""() => { const bt = window._bt, a = bt.units.find(b => b.side === DEF_SIDE && bt.onRampart(b.c, b.r));
          CombatView.sel = null; const P = CombatView.stand(a.c, a.r), rect = CombatView.cv.getBoundingClientRect();
          return { id: a.id, x: rect.left + P.x, y: rect.top + P.y - CombatView.TW * .3, tile: [a.c, a.r] }; }""")
        await pg.mouse.click(r['x'], r['y']); await pg.wait_for_timeout(300)
        print('CLIC SUR LE REMPART', await pg.evaluate("(id) => CombatView.sel && CombatView.sel.id === id", r['id']), r['tile'])
        await pg.evaluate("() => { CombatView.zoom = 2.2; CombatView.setFocus({ c: 7.5, r: 6.5 }); }"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, '301-ramparts-zoom.png'))
        # descente d'un archer de la muraille : la figurine glisse sans saut
        r = await pg.evaluate("""async () => { const bt = window._bt, a = bt.units.find(b => b.side === DEF_SIDE && bt.onRampart(b.c, b.r));
          const ys = []; const p = CombatView.pos[a.id]; const tc = a.c === CITY_MAX ? a.c - 1 : a.c, tr = a.c === CITY_MAX ? a.r : a.r - 1;
          const tw = CombatView.tween(p, tc, tr, 400); const t0 = performance.now();
          while (performance.now() - t0 < 450) { ys.push(CombatView.stand(p.c, p.r).y); await new Promise(r => requestAnimationFrame(r)); }
          await tw; let jump = 0; for (let i = 1; i < ys.length; i++) jump = Math.max(jump, Math.abs(ys[i] - ys[i - 1]));
          await CombatView.tween(p, a.c, a.r, 1); return { pasMax: +jump.toFixed(1), TW: CombatView.TW }; }""")
        print('DESCENTE', r)
        await pg.evaluate("() => { CombatView.zoom = 1; CombatView.setFocus({ c: 6, r: 6 }); }")
        await pg.evaluate("CombatView.toggleAuto()")
        for i in range(120):
            await pg.wait_for_timeout(500)
            if await pg.evaluate("!CombatView.active || !!window._bt.over"): break
        print('FIN', await pg.evaluate("({ fini: !!window._bt.over, vainqueur: window._bt.winner, rounds: window._bt.round })"))
        print('ERR', errors)
        await b.close()
asyncio.run(main())
