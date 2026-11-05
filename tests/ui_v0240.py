"""v0.24.0 : tours de défense et tour du sorcier en siège, expérience selon la dureté, fiche de cité en fin de file."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []; pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e) + ' ' + str(e.stack)[:600]))
        pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 99, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'Morwen', portrait: 3, books: { chaos: 6, death: 4 }, retorts: [], race: 'orc' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # 1. fin de file : la fiche complète de la cité, centrée, avec le bandeau
        await pg.evaluate("""() => { const g = App.game, c = g.cities[App.me().fortress]; c.prod = { type: 'tradeGoods' }; c.queue = []; c.needsOrder = true; MapView.centerOn(0, 0, 0); void App.turnPrompts(); }""")
        await pg.wait_for_timeout(1200)
        print('FILE', await pg.evaluate("""({ modal: !!document.querySelector('.citymodal'), banner: (document.querySelector('.qdone') || {}).textContent || null, chooser: [...document.querySelectorAll('.modal h2, .modal header')].map(x => x.textContent.trim()).join(' / ').slice(0, 160) })"""))
        await pg.screenshot(path=os.path.join(SHOTS, '270-queue-done.png'))
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        # 2. siège d'une forteresse avec remparts et tours de défense
        info = await pg.evaluate("""() => { const g = App.game, pl = App.me(), foe = g.players[1], c = g.cities[foe.fortress];
          c.buildings.cityWalls = true; c.buildings.defenseTowers = true;
          for (const u of Units.at(g, c.plane, c.x, c.y)) Units.remove(g, u);
          for (const t of ['Spearmen', 'Bowmen']) { const d = Object.keys(DATA.units).find(k => DATA.units[k].race === foe.race && k.endsWith(t)); if (d) Units.create(g, d, foe.id, c.plane, c.x, c.y); }
          let spot = null;
          for (const [x, y] of World.neighbors(g.world, c.x, c.y)) if (!World.isWaterAt(g.world, c.plane, x, y) && !Units.at(g, c.plane, x, y).length && !Cities.at(g, c.plane, x, y)) { spot = [x, y]; break; }
          const ids = ['OrcSwordsmen', 'OrcSwordsmen', 'OrcHalberdiers', 'OrcEngineers', 'Catapult', 'OrcSwordsmen'].map(t => Units.create(g, t, pl.id, c.plane, spot[0], spot[1]).id);
          pl.known.push('fire_bolt', 'disrupt'); pl.mana = 400; pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          Move.reveal(g, pl, c.plane, c.x, c.y, 3);
          MapView.centerOn(c.x, c.y, c.plane); App.selectTile(c.plane, spot[0], spot[1]); MapView.bumpVis();
          window._c = c; return { city: c.name, spot, n: ids.length, spire: Battle.spire(g, c) }; }""")
        print('SETUP', info)
        await pg.evaluate("UI.closeAll()")
        await pg.evaluate("void App.moveSelected(window._c.x, window._c.y)")
        await pg.wait_for_timeout(1500)
        intro = await pg.evaluate("(document.querySelector('.modal') || {}).innerText || ''")
        print('INTRO', intro.replace('\n', ' | ')[:300])
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1500)
        st = await pg.evaluate("""() => { const bt = CombatView.bt; return { active: CombatView.active, towers: bt.towers.map(t => t.id + ':' + t.kind + '@' + t.c + ',' + t.r + ' ' + t.hp + '/' + t.maxHp), side: bt.side }; }""")
        print('COMBAT', st)
        await pg.screenshot(path=os.path.join(SHOTS, '271-siege-towers.png'))
        # survol de la tour de droite
        pos = await pg.evaluate("""() => { const t = CombatView.bt.towers.find(t => t.kind === 'stone'); const P = CombatView.iso(t.c, t.r); const r = CombatView.cv.getBoundingClientRect(); return [r.left + P.x * r.width / CombatView.cv.width, r.top + P.y * r.height / CombatView.cv.height]; }""")
        await pg.mouse.move(pos[0], pos[1]); await pg.wait_for_timeout(300)
        print('PANEL', (await pg.evaluate("document.querySelector('#c-right').innerText")).replace('\n', ' | ')[:300])
        # la catapulte tire sur une tour, puis Disruption rase l'autre
        r = await pg.evaluate("""async () => { const bt = CombatView.bt; const cat = bt.units.find(b => b.u.type === 'Catapult');
          const t = bt.towers.find(t => t.kind === 'stone'); const ok = bt.shootTower(cat, t); await CombatView.playEvents();
          const t2 = bt.towers.filter(t => t.kind === 'stone')[1]; const ok2 = CombatSpells.cast(bt, ATT_SIDE, 'disrupt', [t2.c, t2.r], null); await CombatView.playEvents();
          return { shot: ok, hp: t.hp, disrupt: ok2, t2dead: t2.dead, wall: bt.walls[t2.c + ',' + t2.r].broken, log: bt.log.slice(-4) }; }""")
        print('SIEGE', r)
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '272-siege-tower-down.png'))
        await pg.evaluate("CombatView.toggleAuto()")
        for _ in range(150):
            await pg.wait_for_timeout(300)
            t = await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ')")
            if 'Victoire' in t or 'Défaite' in t: break
        await pg.screenshot(path=os.path.join(SHOTS, '273-siege-end-xp.png'))
        print('FIN', (await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ')")).replace('\n', ' | ')[:500])
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => /Continuer|Accepter|OK|Fermer/.test(b.textContent)); btn && btn.click(); }""")
        await pg.wait_for_timeout(1500)
        # 3a. une forteresse vide ne tombe plus sans combat
        r = await pg.evaluate("""async () => { UI.closeAll(); const g = App.game, pl = App.me(), foe = g.players[2], c = g.cities[foe.fortress];
          for (const u of Units.at(g, c.plane, c.x, c.y)) Units.remove(g, u);
          let spot = null;
          for (const [x, y] of World.neighbors(g.world, c.x, c.y)) if (!World.isWaterAt(g.world, c.plane, x, y) && !Units.at(g, c.plane, x, y).length && !Cities.at(g, c.plane, x, y)) { spot = [x, y]; break; }
          const u = Units.create(g, 'OrcSpearmen', pl.id, c.plane, spot[0], spot[1]); pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          Move.reveal(g, pl, c.plane, c.x, c.y, 3); App.selectTile(c.plane, spot[0], spot[1]); window._c2 = c;
          void App.moveSelected(c.x, c.y); await new Promise(r => setTimeout(r, 1200));
          return { combat: CombatView.active, owner: c.owner === foe.id ? 'toujours ' + foe.name : 'prise' }; }""")
        print('ASSAUT VIDE', r)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Résolution')); btn && btn.click(); }""")
        for _ in range(80):
            await pg.wait_for_timeout(300)
            t = await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ')")
            if 'Victoire' in t or 'Défaite' in t: break
        print('FIN VIDE', (await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ')")).replace('\n', ' | ')[:300])
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => /Accepter|Continuer/.test(b.textContent)); btn && btn.click(); }""")
        await pg.wait_for_timeout(1500)
        print('APRES', await pg.evaluate("window._c2.owner === App.game.players[2].id ? 'forteresse tenue' : 'forteresse prise'"))
        # 3. forteresse vide : la tour du sorcier seule contre un lancier
        r = await pg.evaluate("""async () => { UI.closeAll(); const g = App.game, pl = App.me(), foe = g.players[2], c = g.cities[foe.fortress];
          for (const u of Units.at(g, c.plane, c.x, c.y)) Units.remove(g, u);
          let spot = null;
          for (const [x, y] of World.neighbors(g.world, c.x, c.y)) if (!World.isWaterAt(g.world, c.plane, x, y) && !Units.at(g, c.plane, x, y).length && !Cities.at(g, c.plane, x, y)) { spot = [x, y]; break; }
          const u = Units.create(g, 'OrcSpearmen', pl.id, c.plane, spot[0], spot[1]); pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          const bt = new Battle(g, { attackers: [u], defenders: [], attackerPid: pl.id, defenderPid: foe.id, plane: c.plane, x: c.x, y: c.y, city: c, rng: new RNG(4) });
          window._bt2 = bt; CombatView.run(g, bt, { city: c }); return { spire: bt.towers.map(t => t.kind + ' ' + t.shots + 'x' + t.ranged + ' ' + t.hp), over: bt.over }; }""")
        print('VIDE', r)
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1200)
        await pg.evaluate("""async () => { const bt = window._bt2, b = bt.units[0]; CombatView.sel = b; const reach = bt.reachable(b); let best = null; for (const n of reach.values()) if (!best || Math.max(Math.abs(n.c - 4), Math.abs(n.r - 4)) < Math.max(Math.abs(best.c - 4), Math.abs(best.r - 4))) best = n; if (best) { bt.moveUnit(b, best.c, best.r); await CombatView.playEvents(); } CombatView.endTurn(); }""")
        await pg.wait_for_timeout(2600)
        await pg.screenshot(path=os.path.join(SHOTS, '274-spire-beam.png'))
        print('LOG', await pg.evaluate("window._bt2.log.slice(-4)"))
        print('ERRORS', len(errors))
        for e in errors[:8]: print('  ', e[:300])
        await b.close()

asyncio.run(main())
