"""v0.30.9 : éclaireurs en exploration automatique. Plan épuisé : par une tour (ou une faille) vers l'autre plan ; front sans issue
oublié ; plus rien nulle part : la ronde des antres (option du menu), qui vérifie que les gardiens y sont toujours.
Barre du haut : le menu reste visible sur un écran étroit."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SETUP = """() => { const g = App.game, w = g.world, me = App.me(); UI.closeAll();
  g.caches = []; for (let i = 0; i < w.w * w.h; i++) { me.explored[0][i] = 1; me.explored[1][i] = 0; }
  const tw = g.sites.find(s => s.type === 'tower' && s.plane === 0);
  for (const s of g.sites) if (s.type === 'tower' && s.x === tw.x && s.y === tw.y) { s.cleared = true; s.guardians = []; Game.noteSite(g, me.id, s); }
  for (const s of g.sites) if (s.plane === 0 && Game.isLair(s) && !Game.siteKnown(me, s)) Game.noteSite(g, me.id, s);
  let st = null; for (let r = 3; r <= 7 && !st; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) { const x = World.wx(w, tw.x + dx), y = tw.y + dy; if (World.inY(w, y) && !World.isWaterAt(w, 0, x, y) && !Cities.at(g, 0, x, y) && World.get(w, 0, 'site', x, y) < 0 && !Units.at(g, 0, x, y).length && Move.findPath(g, [{ type: 'HighMenScouts', owner: me.id, plane: 0, x, y, ench: [], xp: 0, dmg: 0 }], 0, tw.x, tw.y)) { st = [x, y]; break; } }
  const u = Units.create(g, 'HighMenScouts', me.id, 0, st[0], st[1]); window._sc = u.id; window._tw = [tw.x, tw.y]; return st; }"""
TURNS = """async (n) => { const g = App.game, u = g.units[_sc], out = [];
  for (let t = 0; t < n; t++) { if (!g.units[u.id]) break; u.moves = Units.maxMoves(g, u); if (!u.status) break; await App.exploreStep([u]); out.push(u.plane + ':' + u.x + ',' + u.y + ' ' + u.status); }
  return { pas: out, journal: g.log.slice(-4).map(l => l.text) }; }"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } }); App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("App.setPref('scoutRevisit', true)")

        # 1. Arcane connu, le Miroir non : l'éclaireur passe par la tour
        print('DEPART', await pg.evaluate(SETUP), 'tour', await pg.evaluate("_tw"))
        await pg.evaluate("() => { App.game.units[_sc].status = 'explore'; }")
        print('PASSAGE', await pg.evaluate(TURNS, 6))

        # 2. un front sans issue (l'inconnu reste hors de vue) : noté, et l'éclaireur cherche ailleurs
        r = await pg.evaluate("""async () => { const g = App.game, w = g.world, me = App.me(), u = g.units[_sc];
          if (u.plane !== 0) Game.planeShift(g, [u.id]);
          for (let i = 0; i < w.w * w.h; i++) { me.explored[0][i] = 1; me.explored[1][i] = 1; }
          const [nx, ny] = World.neighbors(w, u.x, u.y).find(([x, y]) => !World.isWaterAt(w, 0, x, y)); me.explored[0][ny * w.w + nx] = 0;
          u.exploreTarget = [u.x, u.y]; u.exploreGain = 0; u.status = 'explore'; u.moves = Units.maxMoves(g, u); me.exploreDead = {};
          await App.exploreStep([u]);
          return { morts: Object.keys(me.exploreDead), front: Move.nearestFrontier(g, [u], 4000, null, App.exploreDead(0)), statut: u.status }; }""")
        print('FRONT SANS ISSUE', r)

        # 3. plus rien nulle part : la ronde des antres (gardiens toujours là, puis un repaire vidé en douce)
        r = await pg.evaluate("""async () => { const g = App.game, w = g.world, me = App.me(), u = g.units[_sc];
          for (let i = 0; i < w.w * w.h; i++) { me.explored[0][i] = 1; me.explored[1][i] = 1; }
          me.exploreDead = {};
          const lairs = g.sites.filter(s => s.plane === u.plane && Game.isLair(s) && Game.siteHasGuardians(s) && s.type !== 'tower').sort((a, b) => World.dist(w, a.x, a.y, u.x, u.y) - World.dist(w, b.x, b.y, u.x, u.y)).slice(0, 2);
          for (const s of g.sites) if (Game.isLair(s)) { Game.noteSite(g, me.id, s); me.siteKnow[s.id].t = g.turn; }
          for (const s of lairs) me.siteKnow[s.id].t = g.turn - 40;
          lairs[1].cleared = true; lairs[1].guardians = [];   // vidé par un autre, sans que le joueur le sache
          window._lairs = lairs.map(s => s.id); u.status = 'explore'; u.exploreIdle = 0; u.exploreRound = false;
          return lairs.map(s => Game.siteName(s) + ' ' + s.x + ',' + s.y + ' à ' + World.dist(w, s.x, s.y, u.x, u.y)); }""")
        print('ANTRES', r)
        r = await pg.evaluate(TURNS, 40)
        print('RONDE', r['pas'][-3:], len(r['pas']), 'tours')
        print('  journal :', await pg.evaluate("App.game.log.filter(l => /ronde|gardiens y sont|vidé depuis/.test(l.text)).map(l => l.text)"))
        print('  connaissance :', await pg.evaluate("_lairs.map(id => { const k = Game.siteKnown(App.me(), App.game.sites[id]); return [k.t, k.cleared]; })"), 'tour', await pg.evaluate("App.game.turn"))

        # 4. option coupée : l'éclaireur rend la main
        await pg.evaluate("App.setPref('scoutRevisit', false)")
        r = await pg.evaluate("""async () => { const g = App.game, u = g.units[_sc]; u.status = 'explore'; u.moves = Units.maxMoves(g, u); await App.exploreStep([u]); return u.status; }""")
        print('OPTION COUPEE', repr(r))
        await pg.evaluate("App.setPref('scoutRevisit', true)")
        await pg.evaluate("Panels.menu()"); await pg.wait_for_timeout(300)
        print('MENU', await pg.evaluate("[...document.querySelectorAll('.modal .t1')].map(e => e.textContent).filter(t => /Ronde/.test(t))"))
        await pg.evaluate("UI.closeAll()")

        # 5. barre du haut étroite : le menu reste à l'écran
        for W in (1280, 1600):
            await pg.set_viewport_size({'width': W, 'height': 860}); await pg.wait_for_timeout(300)
            print('BARRE', W, await pg.evaluate("(() => { const b = [...document.querySelectorAll('#topbar .tbtn')].pop().getBoundingClientRect(); return Math.round(b.right) + ' / ' + innerWidth; })()"))
        print('ERREURS', errors)
        await b.close()

asyncio.run(main())
