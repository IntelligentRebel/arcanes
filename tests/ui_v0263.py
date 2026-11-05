"""v0.26.3 : IA stratégique (plan annoncé par les émissaires, troupes adaptées à l'adversaire, recherches qui répondent à ses sorts
globaux) et bouton Annuler visible quelle que soit la sélection."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def shot(pg, name):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, name + '.png'))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))

        # 1. les émissaires : le plan d'un sorcier, et ce qu'en retient l'écran des sorciers
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1]; me.contact[o.id] = true; o.contact[me.id] = true;
          const n0 = g.log.length; AI.announcePlan(g, o, { kind: 'war', target: me.id }); o.aiPlan = { kind: 'war', target: me.id, since: g.turn, review: g.turn + 10 };
          return g.log.slice(n0).map(e => e.text); }""")
        print('EMISSAIRES', r)
        await pg.evaluate("() => { Panels.wizards(1); }"); await pg.wait_for_timeout(600)
        print('PANNEAU', await pg.evaluate("() => [...document.querySelectorAll('.modal .danger, .modal .muted')].map(e => e.textContent).filter(t => /émissaires/.test(t))"))
        await shot(pg, 'emissaries')
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)

        # 2. le choix d'un plan selon la situation (renseignement de l'IA)
        r = await pg.evaluate("""() => { const g = App.game, o = g.players[1]; const p0 = AI.choosePlan(g, o); return p0; }""")
        print('PLAN', r)

        # 3. troupes adaptées : face à des volants, les tireurs valent plus, la mêlée au sol moins
        r = await pg.evaluate("""() => { const g = App.game, o = g.players[1];
          o._foeMix = { turn: g.turn, mix: { fly: 0.6, ranged: 0.1, fantastic: 0.6, magic: 0.4, n: 6 } };
          const f = t => Math.round(AI.adaptFactor(g, o, t) * 100) / 100;
          return { archers: f('HighMenBowmen'), epeistes: f('HighMenSwordsmen'), paladins: f('Paladin'), cavaliers: f('HighMenCavalry') }; }""")
        print('ADAPTATION', r)

        # 4. la Disjonction devient urgente contre un sorcier aux sorts globaux nuisibles
        r = await pg.evaluate("""() => { const g = App.game, o = g.players[1], me = App.me(); const before = AI.counterResearch(g, o, 'disjunction');
          me.globals.push('armageddon'); const after = AI.counterResearch(g, o, 'disjunction'); me.globals.pop(); return { avant: before, apres: after }; }""")
        print('CONTRE', r)

        # 5. Annuler : visible même quand la sélection passe à une autre unité
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          const u = Units.create(g, 'HighMenSwordsmen', me.id, 0, c.x, c.y); u.moves = Units.maxMoves(g, u);
          const nb = World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y));
          App.selectTile(0, c.x, c.y, [u.id]); await App.moveSelected(nb[0], nb[1]);
          await new Promise(r => setTimeout(r, 700));
          return { selection: App.sel && App.sel.ids.map(id => Units.label(g.units[id])), bouton: [...document.querySelectorAll('.actions button')].some(b => b.textContent.startsWith('Annuler')) }; }""")
        print('ANNULER', r)
        await shot(pg, 'undo_visible')
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
