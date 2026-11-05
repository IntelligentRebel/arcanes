"""v0.27.1 : l'exploration automatique passe par les lieux où l'on n'est jamais entré ; devant un lieu gardé, l'éclaireur
y entre et la fenêtre de repérage s'affiche ; « Repartir » le laisse reprendre son exploration."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


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
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), w = g.world, c = g.cities[me.fortress], pl = c.plane;
          for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (World.dist(w, x, y, c.x, c.y) <= 14) me.explored[pl][y * w.w + x] = 1;
          const s = g.sites.find(s => s.plane === pl && ['cave', 'ruins', 'lair', 'keep'].includes(s.type) && Game.siteHasGuardians(s) && World.dist(w, s.x, s.y, c.x, c.y) <= 12);
          let sp = null;
          for (let y = 0; y < w.h && !sp; y++) for (let x = 0; x < w.w && !sp; x++) if (World.dist(w, x, y, s.x, s.y) === 2 && !World.isWaterAt(w, pl, x, y) && !Units.at(g, pl, x, y).length && World.get(w, pl, 'site', x, y) < 0 && !Cities.at(g, pl, x, y)) sp = [x, y];
          const sc = Units.create(g, 'HighMenScouts' in DATA.units ? 'HighMenScouts' : Object.keys(DATA.units).find(k => DATA.units[k].abilities.scout && DATA.units[k].race === 'highmen'), me.id, pl, sp[0], sp[1]);
          sc.moves = Units.maxMoves(g, sc);
          g.caches = [];   // pas de trouvaille à ramasser en premier : la cible est le lieu
          MapView.plane = pl; App.selectTile(pl, sp[0], sp[1], [sc.id]); MapView.centerOn(s.x, s.y, pl); App.refresh();
          window._t = { site: s.id, scout: sc.id };
          return { lieu: Game.siteName(s), gardiens: s.guardians.length, eclaireur: Units.label(sc), cible: App.lairToScout([sc], 10) && App.lairToScout([sc], 10).id === s.id }; }""")
        print('AVANT', r)
        await pg.evaluate("() => { App.explore([App.game.units[_t.scout]]); }"); await pg.wait_for_timeout(2500)
        print('ETAT', await pg.evaluate("() => { const g = App.game, u = g.units[_t.scout], s = g.sites[_t.site]; return { pos: [u.x, u.y], moves: u.moves, statut: u.status, dist: World.dist(g.world, u.x, u.y, s.x, s.y), en_attente: App.pendingScouts, connu: Game.siteKnown(App.me(), s) }; }"))
        print('FENETRE', await pg.evaluate("() => { const m = document.querySelector('.modal'); return m ? m.innerText.replace(/\\n+/g, ' | ') : null; }"))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'explore_scout.png'))
        await pg.click('.modal footer button:has-text("Repartir")'); await pg.wait_for_timeout(1500)
        print('APRES', await pg.evaluate("""() => { const g = App.game, me = App.me(), s = g.sites[_t.site], u = g.units[_t.scout];
          return { connu: !!Game.siteKnown(me, s), statut: u && u.status, position: u && [u.x, u.y], distance: u && World.dist(g.world, u.x, u.y, s.x, s.y) }; }"""))
        # un lieu vidé par d'autres : l'éclaireur y entre et l'apprend
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), u = g.units[_t.scout], w = g.world;
          const s2 = g.sites.find(s => s.plane === u.plane && Game.isLair(s) && s.type !== 'node' && s.type !== 'tower' && !Game.siteKnown(me, s) && World.dist(w, s.x, s.y, u.x, u.y) <= 10 && Move.findPath(g, [u], u.plane, s.x, s.y, {}));
          if (!s2) return 'aucun lieu proche';
          s2.cleared = true; s2.guardians = []; u.moves = 30; u.status = 'explore'; const n0 = g.log.length;
          for (const o of g.sites) if (o !== s2 && Game.isLair(o) && World.dist(w, o.x, o.y, u.x, u.y) <= 12) Game.noteSite(g, me.id, o);   // seul s2 reste inconnu alentour
          const d0 = World.dist(w, s2.x, s2.y, u.x, u.y), c0 = (App.lairToScout([u], 10) || {}).id === s2.id;
          await App.exploreStep([u]);
          return { lieu: Game.siteName(s2), dist_avant: d0, cible: c0, connu: Game.siteKnown(me, s2), journal: g.log.slice(n0).map(e => e.text), pos: [u.x, u.y], attente: App.pendingScouts }; }""")
        print('LIEU PILLE', r)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
