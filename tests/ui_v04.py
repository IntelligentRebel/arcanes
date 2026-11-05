"""v0.4 : taille de carte, colon (sites et zones), alerte de fin de tour, file de construction et modèles, écran de cité."""
import asyncio, os, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e) + ' ' + str(getattr(e, 'stack', ''))[:300]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(800)
        # écran de création : option de taille
        await pg.click('text=Nouvelle partie'); await pg.wait_for_timeout(300)
        print('MAP SIZE OPTIONS', await pg.evaluate("[...document.querySelectorAll('select')].map(s => [...s.options].map(o => o.text).join('|'))"))
        await pg.evaluate("UI.closeAll()")
        await pg.evaluate("""() => { window.AUTO_CHOICE = true; const t = document.querySelector('.title-screen'); if (t) t.remove();
          const g = Game.newGame({ seed: 4242, mapW: 72, mapH: 48, opponents: 3, human: { name: 'Morwen', portrait: 2, books: { chaos: 5, sorcery: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); App.turnPrompts = async () => {}; }""")
        await pg.wait_for_timeout(1200)
        await pg.evaluate("() => { const pl = App.me(); pl.researching = pl.researchOptions[0]; pl.mustChooseResearch = false; UI.closeAll(); }")
        await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('WORLD', await pg.evaluate("[App.game.world.w, App.game.world.h, App.game.sites.filter(s => s.type === 'tower').length / 2, Object.keys(App.game.cities).length, MapView.LT]"))
        # colon
        r = await pg.evaluate("""() => { const g = App.game; const s = Object.values(g.units).find(u => u.owner === App.pid && Units.isSettler(u));
          const pl = App.me(); Move.reveal(g, pl, s.plane, s.x, s.y, 8); MapView.bumpVis();
          MapView.centerOn(s.x, s.y, s.plane); MapView.ts = 56; App.selectTile(s.plane, s.x, s.y, [s.id]); const sv = App.settlerView(); return sv.sites.map(o => [o.x, o.y, o.maxPop, Math.round(o.score)]); }""")
        print('SITES', r)
        if r:
            await pg.evaluate(f"() => {{ MapView.hover = {{ x: {r[0][0]}, y: {r[0][1]} }}; App.renderSide(); }}")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '50-settler.png'))
        print('SV AGAIN', await pg.evaluate("(() => { const sv = App.settlerView(); const s0 = sv.sites[0]; const si = Cities.siteInfo(App.game, App.pid, sv.plane, s0.x, s0.y); return [sv.sites.map(o => [o.x, o.y, o.maxPop]), si.maxPop, si.unknown, s0.unknown]; })()"))
        print('TILEINFO', await pg.evaluate("document.querySelector('#tileinfo').innerText.slice(0, 200)"))
        # alerte de fin de tour
        await pg.evaluate("App.endTurn()"); await pg.wait_for_timeout(300)
        print('END WARN', await pg.evaluate("({ turn: App.game.turn, btn: document.querySelector('#btn-end').textContent, toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).pop() })"))
        await pg.evaluate("App.endTurn()"); await pg.wait_for_timeout(600)
        print('SECOND PRESS turn', await pg.evaluate("App.game.turn"))
        # file de construction
        await pg.evaluate("UI.closeAll()")
        await pg.evaluate("void CityUI.open(App.game.cities[App.me().fortress].id)"); await pg.wait_for_timeout(400)
        await pg.evaluate("""() => { const c = App.game.cities[CityUI.cur]; CityUI.enqueue(c, { type: 'building', id: 'library' }); CityUI.enqueue(c, { type: 'unit', id: 'HighMenSettlers' }); CityUI.enqueue(c, { type: 'building', id: 'sagesGuild' }); CityUI.render(); }""")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, '51-city-queue.png'))
        print('QUEUE', await pg.evaluate("App.game.cities[CityUI.cur].queue.map(q => q.id)"))
        await pg.evaluate("void CityUI.chooseProduction('queue')"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, '52-queue-add.png'))
        print('QUEUE MODE has sagesGuild-dependent?', await pg.evaluate("[...document.querySelectorAll('.modal .row .t1')].map(e => e.textContent).filter(t => /Université|Guilde des sages|Bibliothèque/.test(t))"))
        await pg.evaluate("UI.closeTop()"); await pg.wait_for_timeout(200)
        # modèles
        await pg.evaluate("void CityUI.templates()"); await pg.wait_for_timeout(300)
        await pg.fill('#tpl-name', 'Nouvelle cité'); await pg.check('#tpl-def')
        await pg.click('.modal button.btn.primary:has-text("Enregistrer")'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, '53-templates.png'))
        print('TEMPLATES', await pg.evaluate("localStorage.getItem('arcanes:queues')"))
        await pg.evaluate("UI.closeAll()")
        # progression de la file : on termine la production en cours plusieurs fois
        st = await pg.evaluate("""async () => { const g = App.game, c = g.cities[App.me().fortress]; const out = [];
          for (let k = 0; k < 4; k++) { c.progress = 9999; Turn.processCity(g, c, g.players[c.owner]); out.push(c.prod.type + ':' + (c.prod.id || '') + ' q=' + c.queue.length + ' needs=' + !!c.needsOrder); }
          return out; }""")
        print('PROGRESS', st)
        # fondation avec modèle par défaut
        f = await pg.evaluate("""async () => { const g = App.game; const s = Object.values(g.units).find(u => u.owner === App.pid && Units.isSettler(u)); if (!s) return 'no settler';
          const sv = App.settlerView(); let t = sv && sv.sites[0]; if (!t) return 'no site';
          s.x = t.x; s.y = t.y; await App.found(s); const c = Cities.at(g, s.plane, t.x, t.y); return c ? c.name + ' prod=' + (c.prod.id || c.prod.type) + ' queue=' + c.queue.map(q => q.id).join(',') : 'fail'; }""")
        print('FOUND', f)
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SHOTS, '54-new-city.png'))
        print('ERRORS', len(errors))
        for e in errors[:8]: print('  ', e[:400])
        await b.close()
asyncio.run(main())
