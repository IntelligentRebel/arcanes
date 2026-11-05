"""v0.28.14 : Esprit gardien à 2 sur la carte ; les flèches de menace ne montrent que les piles qui pèsent et se rapprochent."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:300]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"), 'esprit gardien', await pg.evaluate("() => Units.maxMoves(App.game, { type: 'GuardianSpirit', ench: [], xp: 0, owner: 0, dmg: 0 }) / 2"), 'mouvements')
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], w = g.world, p = c.plane, X = dx => World.wx(w, c.x + dx);
          for (let dx = -7; dx <= 7; dx++) for (let dy = -7; dy <= 7; dy++) if (dx || dy) { World.setTerr(w, p, X(dx), c.y + dy, T.GRASS); World.set(w, p, 'site', X(dx), c.y + dy, -1); }
          for (let k = 0; k < me.explored[p].length; k++) me.explored[p][k] = 1;
          for (const u of Object.values(g.units)) if (u.owner !== me.id && World.dist(w, u.x, u.y, c.x, c.y) <= 9) delete g.units[u.id];
          me.contact[1] = g.players[1].contact[0] = true; Diplomacy.setState(g, 0, 1, 'war');
          const mk = (t, n, dx, dy) => { const us = []; for (let i = 0; i < n; i++) us.push(Units.create(g, t, 1, p, X(dx), c.y + dy)); return us; };
          const S = { faible: mk('HighMenSpearmen', 1, 0, -6), fort: mk('Paladin', 6, 6, 0), immobile: mk('Paladin', 6, -6, 0), collé: mk('Paladin', 4, 0, 2) };
          const all = () => [0, 1].map(() => new Uint8Array(w.w * w.h).fill(1)); MapView.vis = all(); MapView.threats(p);
          // le tour suivant : le faible et le fort se sont approchés de deux cases, l'immobile n'a pas bougé
          g.turn++; for (const u of S.faible) u.y += 2; for (const u of S.fort) u.x = X(4);
          MapView.vis = all();
          return MapView.threats(p).map(t => (t.sx === X(0) && t.sy === c.y - 4 ? 'faible' : t.sx === X(4) ? 'fort' : t.sx === X(-6) ? 'immobile' : 'collé') + ' ×' + t.ratio.toFixed(2)); }""")
        print('FLÈCHES', r)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
