"""v0.18.6 : aura des nœuds liés (scintille aux couleurs du sorcier), contour au survol, flux du nœud en combat."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        info = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), cap = g.cities[pl.fortress];
          const nodes = g.sites.filter(s => s.type === 'node' && s.plane === 0).sort((a, b) => World.dist(g.world, a.x, a.y, cap.x, cap.y) - World.dist(g.world, b.x, b.y, cap.x, cap.y));
          const s = nodes[0], s2 = nodes[1];
          for (const n of [s, s2]) for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const y = n.y + dy; if (y < 0 || y >= g.world.h) continue; pl.explored[0][y * g.world.w + World.wx(g.world, n.x + dx)] = 1; }
          s.owner = pl.id; s.cleared = true; s.guardians = [];
          s2.owner = 1; s2.cleared = true; s2.guardians = [];
          window._node = s.id;
          MapView.centerOn(s.x, s.y, 0); MapView.invalidate && MapView.invalidate(); App.refresh();
          return { realm: s.realm, power: s.power, aura: Game.aura(g, s).length, at: [s.x, s.y], other: [s2.realm, s2.x, s2.y] };
        }""")
        print('NOEUD', info)
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, '223-node-aura.png'))
        # survol d'une case de l'aura : contour + info
        tip = await pg.evaluate("""() => { const g = App.game, s = g.sites[window._node], t = Game.aura(g, s)[2];
          MapView.hover = { x: t[0], y: t[1] }; App.refresh(); return document.querySelector('#tileinfo').textContent; }""")
        print('INFO AURA', tip)
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SHOTS, '224-node-aura-hover.png'))
        tip2 = await pg.evaluate("""() => { const g = App.game, s = g.sites[window._node]; MapView.hover = { x: s.x, y: s.y }; App.refresh(); return document.querySelector('#tileinfo').textContent; }""")
        print('INFO NOEUD', tip2)
        # combat sur le nœud : risque de dissipation affiché, IA qui en tient compte
        res = await pg.evaluate("""() => { const g = App.game, pl = App.me(), s = g.sites[window._node];
          const bt = new Battle(g, { plane: 0, x: s.x, y: s.y, attackers: [], defenders: [], attackerPid: pl.id, defenderPid: 1, site: s, sim: true });
          const out = { realm: bt.nodeRealm, log: bt.log.slice(-1)[0] };
          for (const id of ['fire_bolt', 'healing', 'web', 'earth_to_mud']) if (DATA.spells[id]) out[id] = Math.round(CombatSpells.nodeFizzle(bt, 0, id) * 100);
          return out; }""")
        print('COMBAT', res)
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
