"""v0.25.22 : lueur des armes magiques (carte, combat, vignettes), armes magiques pour la garnison (production, file, plusieurs cités)."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; window.AUTO_CHOICE = true; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")

        # 1. carte : quatre piles côte à côte, armes ordinaires, magiques, mithril, adamantium, et Lame de feu
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const spots = []; for (let dx = 2; dx < 12 && spots.length < 5; dx++) { const x = World.wx(g.world, fc.x + dx), y = fc.y + 2; if (!World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y) && !Units.at(g, 0, x, y).length) spots.push([x, y]); }
          window._ids = spots.map(([x, y], i) => { const u = Units.create(g, 'HighMenSwordsmen', me.id, 0, x, y); if (i < 4) u.weapon = i; else u.ench.push('flame_blade'); return u.id; });
          MapView.centerOn(spots[2][0], spots[2][1], 0); App.refresh(); }""")
        await pg.wait_for_timeout(800)
        print('LUEURS', await pg.evaluate("_ids.map(id => UI.weaponGlow(App.game, App.game.units[id]))"))
        print('SANS LUEUR', await pg.evaluate("""() => { const g = App.game, me = App.me(); return ['HighMenSettlers', 'HighMenMagician', 'Unicorn'].map(t => { const u = Units.create(g, t, me.id, 0, 0, 0); u.weapon = 1; const r = UI.weaponGlow(g, u); Units.remove(g, u); return t + ':' + r; }); }"""))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'glow_map.png'))
        # vignettes de la pile
        await pg.evaluate("() => { const u = App.game.units[_ids[3]]; App.selectTile(u.plane, u.x, u.y, [u.id]); App.renderSide(); }"); await pg.wait_for_timeout(300)
        print('MASQUES', await pg.evaluate("({ img: !!Weapons.img, figurines: Object.keys(Weapons.meta.s).length, anims: Object.keys(Weapons.meta.a).length, epeiste: Weapons.still('unit:HighMenSwordsmen'), eclaireur: !!Weapons.still('unit:HighMenScouts'), cache: Weapons.cache.size })"))

        # 2. combat : neuf contre neuf, armes magiques d'un côté ; coût du dessin avec et sans lueur
        await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const A = []; for (let i = 0; i < 9; i++) { const u = Units.create(g, i % 2 ? 'HighMenSwordsmen' : 'HighMenSpearmen', me.id, 0, x, y); u.weapon = 1 + (i % 3); A.push(u); }
          const D = []; for (let i = 0; i < 9; i++) D.push(Units.create(g, 'OrcSwordsmen', foe.id, 0, x, y));
          window._bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(3) });
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        await pg.wait_for_timeout(400)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'glow_combat.png'))
        t = await pg.evaluate("""() => { const run = n => { const t = performance.now(); for (let i = 0; i < n; i++) CombatView.draw(); return (performance.now() - t) / n; };
          run(5); const avec = run(40); const keep = UI.weaponGlow; UI.weaponGlow = () => null; run(5); const sans = run(40); UI.weaponGlow = keep; return [avec.toFixed(2), sans.toFixed(2)]; }""")
        print('DESSIN COMBAT ms avec / sans lueur', t)
        await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        await pg.wait_for_timeout(500); await pg.evaluate("UI.closeAll()")

        # 3. armes magiques pour la garnison
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          for (const id of _ids) { const u = g.units[id]; if (u) Units.remove(g, u); }
          for (const u of Object.values(g.units)) if (u.owner === me.id && u.x === fc.x && u.y === fc.y) Units.remove(g, u);
          fc.buildings.alchemistsGuild = true; fc.buildings.sagesGuild = true; fc.buildings.library = true;
          const mk = (t, w) => { const u = Units.create(g, t, me.id, fc.plane, fc.x, fc.y); u.weapon = w; return u.id; };
          window._g = [mk('HighMenSwordsmen', 0), mk('HighMenSpearmen', 0), mk('HighMenBowmen', 0), mk('HighMenSettlers', 0), mk('HighMenSwordsmen', 1)];
          const e = Cities.econ(g, fc);
          return { rang: Cities.rearmTier(g, fc, e), cibles: Cities.rearmTargets(g, fc, e).map(u => u.type.replace('HighMen', '')), cout: Cities.rearmCost(g, fc, e) }; }""")
        print('GARNISON', r)
        await pg.evaluate("() => { CityUI.open(App.me().fortress); }"); await pg.wait_for_timeout(400)
        await pg.evaluate("() => CityUI.chooseProduction()"); await pg.wait_for_timeout(300)
        row = await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); const r = [...m.querySelectorAll('.row')].find(r => r.textContent.includes('Armes magiques')); return r ? r.innerText.replace(/\\n/g, ' | ') : null; })()")
        print('CHOIX', row)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'rearm_choice.png'))
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('.row')].find(r => r.textContent.includes('Armes magiques')).click(); }"); await pg.wait_for_timeout(300)
        r = await pg.evaluate("""() => { const c = App.game.cities[App.me().fortress]; const pb = document.querySelector('.prodbox'); return { prod: c.prod, nom: Cities.prodName(c), boite: pb ? pb.innerText.replace(/\\n/g, ' | ') : null }; }""")
        print('PRODUCTION', r)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'rearm_city.png'))
        # achat, puis fin de tour : les unités sont équipées
        await pg.evaluate("() => { App.me().gold = 2000; const r = Game.buy(App.game, App.me().fortress); window._buy = r; UI.closeAll(); }")
        t0 = await pg.evaluate("App.game.turn")
        print('ETAT', await pg.evaluate("({ busy: UI.busy, moving: App.moving, peeking: App.peeking, over: App.game.over, modals: UI.modals.length, combat: CombatView.active })"))
        await pg.evaluate("() => { for (const u of Object.values(App.game.units)) if (u.owner === App.pid) u.status = 'sentry'; const me = App.me(); if (!me.researching && me.researchOptions && me.researchOptions.length) me.researching = me.researchOptions[0]; App.endTurn(true); }")
        await pg.wait_for_function("(t0) => !UI.busy && App.game.turn > t0", arg=t0, timeout=120000); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('TOUR', t0, await pg.evaluate("App.game.turn"))
        r = await pg.evaluate("""() => { const g = App.game, c = g.cities[App.me().fortress]; return { achat: _buy, armes: _g.map(id => g.units[id] ? g.units[id].type.replace('HighMen', '') + ':' + g.units[id].weapon : 'disparue'), prodApres: c.prod, journal: g.log.slice(-15).map(l => l.text || l.msg || l).filter(t => typeof t === 'string' && t.includes('armes')) }; }""")
        print('APRES', r)
        # file : en attente, sautée si personne n'est à équiper
        r = await pg.evaluate("""() => { const g = App.game, c = g.cities[App.me().fortress];
          c.prod = { type: 'building', id: 'cityWalls' }; c.progress = 0; c.queue = [];
          const q1 = Cities.canQueue(g, c, { type: 'rearm' }); c.queue.push({ type: 'rearm' }); const q2 = Cities.canQueue(g, c, { type: 'rearm' });
          c.queue.push({ type: 'building', id: 'granary' });
          const nx = Cities.nextFromQueue(g, c);
          return { avant: q1, deuxieme: q2, suivant: nx, file: c.queue }; }""")
        print('FILE SANS CIBLE', r)
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress]; const u = Units.create(g, 'HighMenSpearmen', me.id, c.plane, c.x, c.y); u.weapon = 0;
          c.queue = [{ type: 'rearm' }, { type: 'building', id: 'granary' }]; const nx = Cities.nextFromQueue(g, c); return { suivant: nx, file: c.queue }; }""")
        print('FILE AVEC CIBLE', r)
        # plusieurs cités : l'option apparaît dans la liste
        await pg.evaluate("() => { UI.closeAll(); Panels.cities(); }"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { document.querySelector('.modal table tr:nth-child(2) input').click(); }"); await pg.wait_for_timeout(150)
        await pg.evaluate("() => { [...document.querySelectorAll('.modal .bulkbar button')].find(b => b.textContent === 'Ajouter à la file').click(); }"); await pg.wait_for_timeout(300)
        print('LISTE FILE', await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); return [...m.querySelectorAll('.row')].map(r => r.querySelector('.t1') ? r.querySelector('.t1').textContent : '').filter(t => t.includes('Armes')); })()"))
        await pg.evaluate("() => UI.closeAll()")
        # modèle de file contenant les armes
        r = await pg.evaluate("""() => { const g = App.game, c = g.cities[App.me().fortress]; c.prod = { type: 'rearm' }; c.queue = [{ type: 'building', id: 'granary' }];
          const items = CityUI.toTemplateItems(c); return { items, retour: CityUI.fromTemplateItems(c, items) }; }""")
        print('MODELE', r)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
