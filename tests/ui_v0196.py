"""v0.19.6 : l'aura d'un nœud ne se voit qu'une fois lié par un esprit (pas de contour au survol avant)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


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
          const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        async def probe(label):
            r = await pg.evaluate("""() => { const g = App.game, s = g.sites.find(x => x.type === 'node' && x.plane === 0); window._n = s;
              const me = App.me(); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) Move.reveal(g, me, 0, s.x + dx, s.y + dy, 0);
              const t = Game.aura(g, s).find(([x, y]) => x !== s.x || y !== s.y) || [s.x, s.y];
              MapView.centerOn(s.x, s.y, 0); MapView.hover = { x: t[0], y: t[1] }; MapView._auraHoverKey = null; App.refresh(); MapView.draw();
              const d = document.createElement('div'); d.innerHTML = App.tileInfoHtml(0, t[0], t[1]); const n = document.createElement('div'); n.innerHTML = App.nodeHtml(s);
              return { owner: s.owner, outline: !!MapView._auraHover, info: d.textContent.includes('Aura du'), node: n.textContent.slice(0, 70) }; }""")
            print(label, r)
        await probe('LIBRE')
        await pg.screenshot(path=os.path.join(SHOTS, '235-node-unmelded-hover.png'))
        await pg.evaluate("() => { window._n.owner = App.pid; window._n.guardians = []; }")
        await probe('LIE')
        await pg.screenshot(path=os.path.join(SHOTS, '236-node-melded-hover.png'))
        print('ERRORS', len(errors))
        for e in errors[:5]: print('  ', e)
        await b.close()

asyncio.run(main())
