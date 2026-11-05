"""Commandes de la carte : sélection, visée, double-clic, ordre différé, clic droit ; liens du journal ; sorciers inconnus."""
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
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(800)
        await pg.evaluate("""() => { window.AUTO_CHOICE = true; document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 4242, opponents: 3, human: { name: 'Morwen', portrait: 2, books: { chaos: 5, sorcery: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); App.turnPrompts = async () => {}; }""")
        await pg.wait_for_timeout(900)
        await pg.evaluate("() => { const pl = App.me(); pl.researching = pl.researchOptions[0]; pl.mustChooseResearch = false; UI.closeAll(); }")
        await pg.wait_for_timeout(400)
        await pg.evaluate("UI.closeAll()")
        async def tile_xy(x, y):
            return await pg.evaluate(f"(() => {{ const P = MapView.tileToScreen({x}, {y}); return [P.x + MapView.ts / 2, P.y + MapView.ts / 2]; }})()")
        info = await pg.evaluate("""() => { const g = App.game, pl = App.me(); const u = Object.values(g.units).find(u => u.owner === pl.id && !Units.isSettler(u));
          MapView.centerOn(u.x, u.y, u.plane); App.selectTile(u.plane, u.x, u.y, [u.id]);
          // une case de terre à 3 cases
          let t = null; for (let r = 3; r <= 4 && !t; r++) for (let dx = -r; dx <= r && !t; dx++) for (let dy = -r; dy <= r && !t; dy++) { const x = World.wx(g.world, u.x + dx), y = u.y + dy; if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !World.inY(g.world, y)) continue; if (!World.isWaterAt(g.world, u.plane, x, y) && !Units.at(g, u.plane, x, y).length && !Cities.at(g, u.plane, x, y) && World.get(g.world, u.plane, 'site', x, y) < 0) t = [x, y]; }
          return { id: u.id, from: [u.x, u.y], to: t, moves: u.moves }; }""")
        print('INFO', info)
        tx, ty = info['to']
        sx, sy = await tile_xy(tx, ty)
        print('AT', sx, sy, await pg.evaluate(f"(() => {{ const e = document.elementFromPoint({sx}, {sy}); return e.tagName + '#' + e.id + '.' + e.className; }})()"))
        await pg.mouse.click(sx, sy); await pg.wait_for_timeout(450)
        st = await pg.evaluate(f"(() => {{ const u = App.game.units[{info['id']}]; return {{ sel: !!App.sel, pos: [u.x, u.y], path: MapView.path ? MapView.path.length : 0 }}; }})()")
        print('SINGLE CLICK', st)
        await pg.mouse.dblclick(sx, sy); await pg.wait_for_timeout(600)
        st = await pg.evaluate(f"(() => {{ const u = App.game.units[{info['id']}]; return {{ pos: [u.x, u.y], moves: u.moves, path: u.path, status: u.status }}; }})()")
        print('DOUBLE CLICK', st)
        # ordre différé : unité sans mouvement
        await pg.evaluate(f"(() => {{ const u = App.game.units[{info['id']}]; u.moves = 0; App.selectTile(u.plane, u.x, u.y, [u.id]); }})()")
        fx, fy = info['from']
        sx2, sy2 = await tile_xy(fx, fy)
        await pg.mouse.dblclick(sx2, sy2); await pg.wait_for_timeout(500)
        st = await pg.evaluate(f"(() => {{ const u = App.game.units[{info['id']}]; return {{ pos: [u.x, u.y], path: u.path, status: u.status, toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent).slice(-2) }}; }})()")
        print('ORDER LATER', st)
        await pg.evaluate(f"(() => {{ const u = App.game.units[{info['id']}]; App.selectTile(u.plane, u.x, u.y, [u.id]); }})()")
        await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(SHOTS, '40-order.png'))
        # clic droit : désélection
        await pg.mouse.click(sx, sy, button='right'); await pg.wait_for_timeout(200)
        print('RIGHT CLICK sel =', await pg.evaluate("App.sel"))
        # fin de tour : l'ordre s'exécute
        await pg.evaluate("App.endTurn(true)"); await pg.wait_for_timeout(300)
        st = await pg.evaluate(f"(() => {{ const u = App.game.units[{info['id']}]; return {{ pos: [u.x, u.y], path: u.path, status: u.status }}; }})()")
        print('AFTER TURN', st)
        # sorciers : inconnus anonymes
        await pg.evaluate("UI.closeAll(); Panels.wizards()"); await pg.wait_for_timeout(300)
        print('WIZARDS', await pg.evaluate("[...document.querySelectorAll('.modal .box')].map(b => b.textContent.slice(0, 40))"))
        await pg.screenshot(path=os.path.join(SHOTS, '41-wizards-unknown.png'))
        await pg.evaluate("UI.closeAll()")
        # premier contact : liens
        html = await pg.evaluate("""() => { const g = App.game; const o = g.players[1]; Game.contact(g, App.pid, 1, { plane: 0, x: 10, y: 10 }); const e = g.log.filter(e => e.pid === App.pid && /Premier contact/.test(e.text)).pop(); return App.linkify(e).innerHTML; }""")
        print('CONTACT LINK', html)
        await pg.evaluate("document.querySelector('#logbox').lastElementChild.querySelectorAll('a')[1].click()"); await pg.wait_for_timeout(300)
        print('FOCUS', await pg.evaluate("document.querySelector('.box.focus') ? document.querySelector('.box.focus').textContent.slice(0, 30) : null"))
        await pg.screenshot(path=os.path.join(SHOTS, '42-contact.png'))
        print('ERRORS', len(errors))
        for e in errors[:6]: print('  ', e[:300])
        await b.close()
asyncio.run(main())
