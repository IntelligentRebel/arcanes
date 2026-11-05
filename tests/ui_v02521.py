"""v0.25.21 : liste des cités (production, file, cases à cocher, modèles de file sur plusieurs cités), Relais de magie."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:600]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          try { localStorage.removeItem('arcanes:queues'); } catch (e) {}
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # trois cités de plus, dont une d'un autre peuple
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const spots = []; for (let r = 4; r < 14 && spots.length < 3; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) { const x = World.wx(g.world, fc.x + dx), y = fc.y + dy;
            if (spots.length < 3 && World.inY(g.world, y) && !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y) && spots.every(([a, b]) => World.dist(g.world, a, b, x, y) > 3)) spots.push([x, y]); }
          window._cs = spots.map(([x, y], i) => { const c = Cities.create(g, me.id, i === 2 ? 'orc' : 'highmen', 0, x, y, { pop: 3000 }); c.buildings.buildersHall = true; c.buildings.smithy = true; return c.id; });
          fc.buildings.buildersHall = true; fc.buildings.shrine = true; me.gold = 3000; Cities.updateTerritory(g); }""")
        await pg.evaluate("() => { UI.closeAll(); Panels.cities(); }"); await pg.wait_for_timeout(300)
        r = await pg.evaluate("""() => { const m = document.querySelector('.modal'); return { cases: m.querySelectorAll('table input[type=checkbox]').length, boutons: [...m.querySelectorAll('.bulkbar button')].map(b => b.textContent + (b.disabled ? ' (grisé)' : '')) }; }""")
        print('LISTE', r)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'cities_list.png'))

        # 1. un clic sur la production d'une cité : l'écran de production de cette cité
        await pg.evaluate("() => { document.querySelectorAll('.modal .prodpick')[1].click(); }"); await pg.wait_for_timeout(300)
        t = await pg.evaluate("[...document.querySelectorAll('.modal h2')].map(h => h.textContent)")
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); const row = [...m.querySelectorAll('.row')].find(r => r.querySelector('.t1') && r.querySelector('.t1').textContent.startsWith('Caserne')); row.click(); }")
        await pg.wait_for_timeout(300)
        r = await pg.evaluate("""() => { const rows = [...document.querySelectorAll('.modal table tr')].slice(1); return { fenetres: [...document.querySelectorAll('.modal h2')].map(h => h.textContent), prods: rows.map(r => r.children[1].textContent + ' : ' + r.querySelector('.prodpick').textContent) }; }""")
        print('UNE CITE', t, r)

        # 2. trois cités cochées : changer la production
        await pg.evaluate("() => { const boxes = [...document.querySelectorAll('.modal table tr')].slice(1).map(r => r.querySelector('input')); boxes[1].click(); }"); await pg.wait_for_timeout(150)
        await pg.evaluate("() => { const boxes = [...document.querySelectorAll('.modal table tr')].slice(1).map(r => r.querySelector('input')); boxes[2].click(); }"); await pg.wait_for_timeout(150)
        await pg.evaluate("() => { const boxes = [...document.querySelectorAll('.modal table tr')].slice(1).map(r => r.querySelector('input')); boxes[3].click(); }"); await pg.wait_for_timeout(150)
        print('COCHEES', await pg.evaluate("document.querySelector('.modal .bulkbar span').textContent"))
        await pg.evaluate("() => { [...document.querySelectorAll('.modal .bulkbar button')].find(b => b.textContent === 'Changer la production').click(); }"); await pg.wait_for_timeout(300)
        r = await pg.evaluate("""() => { const m = [...document.querySelectorAll('.modal')].pop(); return { titre: m.querySelector('h2').textContent, lignes: [...m.querySelectorAll('.row')].map(r => r.querySelector('.t1').textContent + ' | ' + r.querySelector('.t2').textContent).slice(0, 40) }; }""")
        print('MULTI TITRE', r['titre'])
        for l in r['lignes']: print('   ', l)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'multi_prod.png'))
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('.row')].find(r => r.querySelector('.t1').textContent.startsWith('Lanciers')).click(); }")
        await pg.wait_for_timeout(300)
        print('LANCIERS', await pg.evaluate("_cs.map(id => App.game.cities[id]).map(c => c.name + ':' + c.race + ':' + (c.prod.id || c.prod.type))"), await pg.evaluate("[...document.querySelectorAll('#toasts > *')].map(t => t.textContent).slice(-1)"))

        # 3. ajouter à la file de ces cités : Remparts, Caserne, puis Épéistes (qui attendent la caserne)
        await pg.evaluate("() => { [...document.querySelectorAll('.modal .bulkbar button')].find(b => b.textContent === 'Ajouter à la file').click(); }"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('.row')].find(r => r.querySelector('.t1').textContent.startsWith('Remparts')).click(); }"); await pg.wait_for_timeout(150)
        print('EPEISTES AVANT CASERNE', await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); return [...m.querySelectorAll('.row')].some(r => r.querySelector('.t1').textContent.startsWith('Épéistes')); }"))
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('.row')].find(r => r.querySelector('.t1').textContent.startsWith('Caserne')).click(); }"); await pg.wait_for_timeout(150)
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('.row')].find(r => r.querySelector('.t1').textContent.startsWith('Épéistes')).click(); }"); await pg.wait_for_timeout(150)
        badge = await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); return [...m.querySelectorAll('.row')].filter(r => r.querySelector('.abl')).map(r => r.querySelector('.t1').textContent); }")
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('footer button')].find(b => b.textContent === 'Terminé').click(); }"); await pg.wait_for_timeout(300)
        print('FILES', badge, await pg.evaluate("_cs.map(id => App.game.cities[id]).map(c => c.name + ' : ' + (c.queue || []).map(it => it.id).join(', '))"))

        # 4. modèle : une cité cochée, on enregistre sa production et sa file
        await pg.evaluate("() => { [...document.querySelectorAll('.modal .bulkbar button')].find(b => b.textContent === 'Tout décocher').click(); }"); await pg.wait_for_timeout(150)
        await pg.evaluate("() => { const rows = [...document.querySelectorAll('.modal table tr')].slice(1); const r = rows.find(r => r.children[1].textContent.includes(App.game.cities[_cs[0]].name)); r.querySelector('input').click(); }"); await pg.wait_for_timeout(150)
        await pg.evaluate("() => { [...document.querySelectorAll('.modal .bulkbar button')].find(b => b.textContent === 'Modèles de file').click(); }"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); m.querySelector('input[type=text]').value = 'Défense'; [...m.querySelectorAll('button')].find(b => b.textContent === 'Enregistrer').click(); }"); await pg.wait_for_timeout(200)
        print('MODELE', await pg.evaluate("CityUI.loadTemplates().map(t => t.name + ' = ' + t.items.map(i => i.id).join(', '))"))
        await pg.evaluate("() => { UI.closeTop(); }"); await pg.wait_for_timeout(200)
        # les trois cités : vidées, puis le modèle appliqué (remplacer la file), puis ajouté à la suite
        for k in (1, 2):
            await pg.evaluate("(k) => { const rows = [...document.querySelectorAll('.modal table tr')].slice(1); rows.find(r => r.children[1].textContent.includes(App.game.cities[_cs[k]].name)).querySelector('input').click(); }", k); await pg.wait_for_timeout(150)
        print('COCHEES 3', await pg.evaluate("document.querySelector('.modal .bulkbar span').textContent"))
        await pg.evaluate("() => { [...document.querySelectorAll('.modal .bulkbar button')].find(b => b.textContent === 'Vider la file').click(); }"); await pg.wait_for_timeout(200)
        print('VIDEES', await pg.evaluate("_cs.map(id => (App.game.cities[id].queue || []).length)"))
        await pg.evaluate("() => { App.game.cities[_cs[1]].prod = { type: 'housing' }; App.game.cities[_cs[1]].progress = 0; }")
        await pg.evaluate("() => { [...document.querySelectorAll('.modal .bulkbar button')].find(b => b.textContent === 'Modèles de file').click(); }"); await pg.wait_for_timeout(300)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'multi_tpl.png'))
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('button')].find(b => b.textContent === 'Remplacer la file').click(); }"); await pg.wait_for_timeout(300)
        print('REMPLACER', await pg.evaluate("_cs.map(id => App.game.cities[id]).map(c => c.name + ' [' + (c.prod.id || c.prod.type) + '] ' + (c.queue || []).map(it => it.id).join(', '))"))
        await pg.evaluate("() => { [...document.querySelectorAll('.modal .bulkbar button')].find(b => b.textContent === 'Modèles de file').click(); }"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('button')].find(b => b.textContent === 'Ajouter à la file').click(); }"); await pg.wait_for_timeout(300)
        print('AJOUTER', await pg.evaluate("_cs.map(id => App.game.cities[id]).map(c => c.name + ' [' + (c.prod.id || c.prod.type) + '] ' + (c.queue || []).map(it => it.id).join(', '))"))
        print('SELECTION GARDEE', await pg.evaluate("document.querySelector('.modal .bulkbar span').textContent"))
        await pg.evaluate("() => { document.querySelector('.modal table th input').click(); }"); await pg.wait_for_timeout(150)
        print('TOUT COCHER', await pg.evaluate("document.querySelector('.modal .bulkbar span').textContent"))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'cities_after.png'))

        # 5. Relais de magie : dans la forteresse seulement
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress], o = g.cities[_cs[0]]; o.buildings.shrine = true;
          return { forteresse: Cities.buildableBuildings(g, fc).includes('magicRelay'), autre: Cities.buildableBuildings(g, o).includes('magicRelay') }; }""")
        print('RELAIS', r)
        await pg.evaluate("() => { UI.closeAll(); CityUI.open(App.me().fortress); }"); await pg.wait_for_timeout(400)
        await pg.evaluate("() => CityUI.chooseProduction()"); await pg.wait_for_timeout(300)
        print('RELAIS LISTE', await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); const r = [...m.querySelectorAll('.row')].find(r => r.textContent.includes('Relais de magie')); return r ? r.textContent : null; })()"))
        await pg.evaluate("() => { UI.closeAll(); CityUI.open(_cs[0]); }"); await pg.wait_for_timeout(400)
        await pg.evaluate("() => CityUI.chooseProduction()"); await pg.wait_for_timeout(300)
        print('RELAIS AILLEURS', await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); return m.textContent.includes('Relais'); })()"))
        await pg.evaluate("() => UI.closeAll()")
        # combat loin de la forteresse : le multiplicateur affiché
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), fc = g.cities[me.fortress], foe = g.players[1];
          let x = fc.x, y = fc.y; for (let d = 12; d < 30; d++) { const xx = World.wx(g.world, fc.x + d); if (!World.isWaterAt(g.world, 0, xx, fc.y) && !Cities.at(g, 0, xx, fc.y)) { x = xx; break; } }
          const a = Units.create(g, 'HighMenSpearmen', me.id, 0, x, y), d = Units.create(g, 'OrcSpearmen', foe.id, 0, x, y);
          window._bt = new Battle(g, { attackers: [a], defenders: [d], attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(3) });
          CombatView.run(g, _bt, {}); return World.dist(g.world, fc.x, fc.y, x, y); }""")
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        await pg.evaluate("() => CombatView.spellMenu()"); await pg.wait_for_timeout(200)
        sans = await pg.evaluate("[...document.querySelectorAll('.modal .muted')].map(d => d.textContent).find(t => t.includes('distance'))")
        await pg.evaluate("() => { UI.closeTop(); App.game.cities[App.me().fortress].buildings.magicRelay = true; CombatView.spellMenu(); }"); await pg.wait_for_timeout(200)
        avec = await pg.evaluate("[...document.querySelectorAll('.modal .muted')].map(d => d.textContent).find(t => t.includes('distance'))")
        print('COMBAT distance', r, '|', sans, '|', avec)
        await pg.evaluate("() => { UI.closeTop(); CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
