"""v0.25.24 : écran de légende accomplie, portrait d'un sorcier qui mène à sa capitale, production redescendue dans la file."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")

        # 1. une légende accomplie au combat : l'écran s'ouvre après la bataille
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const hd = Object.values(DATA.heroes).find(x => x.unit === 'HeroBrax');
          const hero = Heroes.spawn(g, me, hd, fc.plane, fc.x, fc.y, 400); Heroes.assignQuest(g, hero);
          const q = hero.hero.quest, s = g.sites[q.site]; window._h = hero.id; window._s = s.id;
          const A = [hero]; for (let i = 0; i < 6; i++) { const u = Units.create(g, 'HighMenSwordsmen', me.id, s.plane, s.x, s.y); A.push(u); }
          hero.plane = s.plane; hero.x = s.x; hero.y = s.y;
          const G = [Units.create(g, 'Skeleton', -1, s.plane, s.x, s.y)];
          s.guardians = []; s.cleared = false;
          const bt = new Battle(g, { attackers: A, defenders: G, attackerPid: me.id, defenderPid: -1, plane: s.plane, x: s.x, y: s.y, site: s, rng: new RNG(5) });
          CombatAI.autoResolve(bt);
          window._done = false; window._goldBefore = me.gold;
          Game.applyBattle(g, bt, { attackers: A, defenders: G, pid: me.id, defenderPid: -1, site: s, city: null, tx: s.x, ty: s.y, plane: s.plane, guardianUnits: G }).then(() => { window._done = true; });
          return { place: q.place, gagne: bt.winner === ATT_SIDE }; }""")
        print('COMBAT', r)
        await pg.wait_for_timeout(800)
        # (le trésor du repaire d'abord, s'il y en a un)
        for _ in range(3):
            t = await pg.evaluate("[...document.querySelectorAll('.modal h2')].map(h => h.textContent)")
            if any(x.startswith('Trésor') for x in t):
                await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Magnifique'); b.click(); }"); await pg.wait_for_timeout(500)
        r = await pg.evaluate("""() => { const m = document.querySelector('.modal.legend-modal'); if (!m) return null;
          return { titre: m.querySelector('h2').textContent, banniere: m.querySelector('.legend-banner').textContent, sous: m.querySelector('.legend-sub').textContent,
            texte: m.querySelector('.legend-text').textContent, relique: m.querySelector('.legend-relic').innerText.replace(/\\n/g, ' | '), gains: m.querySelector('.legend-rewards').textContent,
            boutons: [...m.querySelectorAll('footer button')].map(b => b.textContent) }; }""")
        print('ECRAN', r)
        if SHOTS: await pg.wait_for_timeout(900); await pg.screenshot(path=os.path.join(SHOTS, 'legend.png'))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal.legend-modal footer button')].find(b => b.textContent.startsWith('Gloire')); b.click(); }")
        await pg.wait_for_function("() => _done", timeout=10000)
        print('APRES', await pg.evaluate("({ quete: App.game.units[_h].hero.quest.done, arme: App.game.units[_h].items.filter(Boolean).map(i => i.name), or: App.me().gold - _goldBefore, journal: App.game.log.slice(-6).map(e => e.text).filter(t => t.includes('Légende')) })"))
        # le même écran, au prix de sa vie
        await pg.evaluate("""() => { const g = App.game, u = g.units[_h]; const it = Object.assign({}, u.items.find(i => i && i.legendary));
          App.legendScreen({ type: 'legend', hero: u, item: it, place: 'la Forge engloutie', dead: true, reward: Heroes.LEGEND_REWARD, ending: Heroes.legendEnding(u, it.name, 'la Forge engloutie', true) }); }""")
        await pg.wait_for_timeout(900)
        print('TOMBE', await pg.evaluate("(() => { const m = document.querySelector('.modal.legend-modal'); return [m.querySelector('.legend-banner').textContent, m.querySelector('.legend-text').textContent, m.querySelector('.legend-rip') && m.querySelector('.legend-rip').textContent]; })()"))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'legend_dead.png'))
        await pg.evaluate("UI.closeAll()")
        # tous les épilogues : un par héros, sans trou
        print('EPILOGUES', await pg.evaluate("""(() => { const out = []; for (const k in DATA.heroQuests) { const hd = Object.values(DATA.heroes).find(x => x.unit === k); const t = Heroes.legendEnding({ type: k, hero: { name: hd.name } }, 'X', DATA.heroQuests[k].place, false); if (!t || /\\{|undefined/.test(t)) out.push(k); } return out; })()"""))

        # 2. portrait d'un sorcier : capitale, ou plus grande cité connue
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1]; Game.contact(g, me.id, o.id);
          const cap = g.cities[o.fortress];
          const c2 = Cities.create(g, o.id, o.race, cap.plane, World.wx(g.world, cap.x + 5), cap.y, { pop: 5000 });
          me.explored[c2.plane][c2.y * g.world.w + c2.x] = 1; me.explored[cap.plane][cap.y * g.world.w + cap.x] = 0;
          window._c2 = c2.id; window._cap = cap.id; return [Panels.wizardGoal(g, me, o).name, c2.name]; }""")
        print('BUT SANS CAPITALE', r)
        await pg.evaluate("() => { UI.closeAll(); Panels.wizards(); }"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { document.querySelectorAll('.modal canvas.portrait')[1].click(); }"); await pg.wait_for_timeout(300)
        print('CLIC RIVAL', await pg.evaluate("({ cam: [Math.floor(MapView.camX), Math.floor(MapView.camY)], cite: [App.game.cities[_c2].x, App.game.cities[_c2].y], fenetres: UI.modals.length })"))
        await pg.evaluate("() => { const g = App.game, cap = g.cities[_cap]; App.me().explored[cap.plane][cap.y * g.world.w + cap.x] = 1; Panels.wizards(); }"); await pg.wait_for_timeout(300)
        print('INFO-BULLE', await pg.evaluate("document.querySelectorAll('.modal canvas.portrait')[1].title"))
        await pg.evaluate("() => { document.querySelectorAll('.modal canvas.portrait')[1].click(); }"); await pg.wait_for_timeout(300)
        print('CLIC CAPITALE', await pg.evaluate("({ cam: [Math.floor(MapView.camX), Math.floor(MapView.camY)], cite: [App.game.cities[_cap].x, App.game.cities[_cap].y] })"))
        await pg.evaluate("() => { Panels.wizards(); document.querySelectorAll('.modal canvas.portrait')[0].click(); }"); await pg.wait_for_timeout(300)
        print('CLIC SOI', await pg.evaluate("({ cam: [Math.floor(MapView.camX), Math.floor(MapView.camY)], cite: [App.game.cities[App.me().fortress].x, App.game.cities[App.me().fortress].y] })"))
        await pg.evaluate("() => { const g = App.game, o = g.players[2]; Game.contact(g, App.pid, o.id); for (const c of Cities.ofPlayer(g, o.id)) App.me().explored[c.plane][c.y * g.world.w + c.x] = 0; Panels.wizards(); }"); await pg.wait_for_timeout(200)
        await pg.evaluate("() => { document.querySelectorAll('.modal canvas.portrait')[2].click(); }"); await pg.wait_for_timeout(200)
        print('INCONNU', await pg.evaluate("[document.querySelectorAll('.modal canvas.portrait')[2] && document.querySelectorAll('.modal canvas.portrait')[2].title, [...document.querySelectorAll('#toasts > *')].map(t => t.textContent).slice(-1)]"))
        await pg.evaluate("UI.closeAll()")

        # 3. production redescendue dans la file, boutons tout en haut, tout en bas
        await pg.evaluate("""() => { const g = App.game, c = g.cities[App.me().fortress]; c.buildings.buildersHall = true;
          c.prod = { type: 'building', id: 'granary' }; c.progress = 12; c.carry = false;
          c.queue = [{ type: 'building', id: 'library' }, { type: 'unit', id: 'HighMenSpearmen' }, { type: 'building', id: 'shrine' }];
          CityUI.open(c.id); }""")
        await pg.wait_for_timeout(500)
        st = "(() => { const c = App.game.cities[App.me().fortress]; return [(c.prod.id || c.prod.type) + ':' + c.progress, c.queue.map(i => i.id + (i.progress ? ':' + i.progress : '')).join(', ')]; })()"
        print('AVANT', await pg.evaluate(st), await pg.evaluate("[...document.querySelectorAll('.pdemote button')].map(b => b.textContent + ' ' + b.title)"))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'demote.png'))
        await pg.evaluate("() => document.querySelectorAll('.pdemote button')[0].click()"); await pg.wait_for_timeout(200)
        print('DESCENDRE', await pg.evaluate(st))
        await pg.evaluate("() => document.querySelectorAll('.pdemote button')[1].click()"); await pg.wait_for_timeout(200)
        print('TOUT EN BAS', await pg.evaluate(st))
        await pg.evaluate("() => { const rows = document.querySelectorAll('.queue .qrow'); [...rows[2].querySelectorAll('button')].find(b => b.textContent === '⤒').click(); }"); await pg.wait_for_timeout(200)
        print('FILE TOUT EN HAUT', await pg.evaluate(st))
        await pg.evaluate("() => { const rows = document.querySelectorAll('.queue .qrow'); [...rows[0].querySelectorAll('button')].find(b => b.textContent === '⤓').click(); }"); await pg.wait_for_timeout(200)
        print('FILE TOUT EN BAS', await pg.evaluate(st))
        print('GRISES', await pg.evaluate("[...document.querySelectorAll('.queue .qrow')].map(r => [...r.querySelectorAll('button')].map(b => b.textContent + (b.disabled ? '-' : '')).join(''))"))
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress]; const n = Units.at(g, c.plane, c.x, c.y).filter(u => u.owner === me.id).length;
          for (let i = n; i < MAX_STACK; i++) Units.create(g, 'HighMenSpearmen', me.id, c.plane, c.x, c.y);
          c.prod = { type: 'unit', id: 'HighMenSwordsmen' }; c.progress = 0; CityUI.render();
          return [...document.querySelectorAll('.prodbox .gold')].map(d => d.textContent); }""")
        print('GARNISON PLEINE', r)
        # 4. Exorcisme : les chances au survol de la cible
        await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], c = g.cities[me.fortress];
          if (!me.known.includes('dispel_evil')) me.known.push('dispel_evil'); me.mana = 500;
          const [x, y] = World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const A = ['HighMenSpearmen', 'HighMenSwordsmen'].map(t => Units.create(g, t, me.id, 0, x, y));
          const D = ['Skeleton', 'Zombie', 'OrcSpearmen'].map(t => Units.create(g, t, foe.id, 0, x, y));
          window._bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(3) });
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        await pg.evaluate("() => CombatView.prepareCast('dispel_evil')"); await pg.wait_for_timeout(200)
        for typ in ['Skeleton', 'OrcSpearmen']:
            pos = await pg.evaluate("(t) => { const b = _bt.alive(1 - CombatView.humanSide).find(b => b.u.type === t); const P = CombatView.stand(CombatView.pos[b.id].c, CombatView.pos[b.id].r); const r = CombatView.cv.getBoundingClientRect(); return [r.left + P.x, r.top + P.y - 10]; }", typ)
            await pg.mouse.move(pos[0], pos[1]); await pg.wait_for_timeout(300)
            print('SURVOL', typ, await pg.evaluate("(() => { const d = document.querySelector('#c-right .spellodds'); return d ? d.innerText.replace(/\\n/g, ' | ') : null; })()"))
            if SHOTS and typ == 'Skeleton': await pg.screenshot(path=os.path.join(SHOTS, 'odds.png'))
        await pg.evaluate("() => { CombatView.mode = null; CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
