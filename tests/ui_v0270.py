"""v0.27.0 : les lieux ne livrent leur contenu qu'aux troupes qui y entrent (comme dans l'original) ; les chances de victoire
s'expriment en mots ; V montre les lieux où vos troupes ne sont jamais entrées."""
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

        # une grotte gardée à 4 cases d'une pile de cavaliers, sur une carte dévoilée
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), w = g.world, c = g.cities[me.fortress], pl = c.plane;
          for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (World.dist(w, x, y, c.x, c.y) <= 14) me.explored[pl][y * w.w + x] = 1;
          const s = g.sites.find(s => s.plane === pl && ['cave', 'ruins', 'lair', 'keep'].includes(s.type) && Game.siteHasGuardians(s) && World.dist(w, s.x, s.y, c.x, c.y) <= 12);
          const spot = [];
          for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (World.dist(w, x, y, s.x, s.y) === 2 && !World.isWaterAt(w, pl, x, y) && !Units.at(g, pl, x, y).length && World.get(w, pl, 'site', x, y) < 0 && !Cities.at(g, pl, x, y)) spot.push([x, y]);
          const sp = spot.find(([x, y]) => Move.findPath(g, [Units.create(g, 'HighMenCavalry', me.id, pl, x, y)], pl, s.x, s.y, {}) ) ;
          for (const u of Object.values(g.units)) if (u.owner === me.id && u.type === 'HighMenCavalry' && !(u.x === sp[0] && u.y === sp[1])) delete g.units[u.id];
          const cav = Units.at(g, pl, sp[0], sp[1]).filter(u => u.owner === me.id); Units.create(g, 'HighMenCavalry', me.id, pl, sp[0], sp[1]);
          for (const u of Units.at(g, pl, sp[0], sp[1])) u.moves = Units.maxMoves(g, u);
          MapView.plane = pl; App.selectTile(pl, sp[0], sp[1]); MapView.centerOn(s.x, s.y, pl);
          MapView.hover = { x: s.x, y: s.y }; App.updatePathPreview(); App.renderSide(); App.refresh();
          return { site: Game.siteName(s), gardiens: s.guardians.length, depart: sp, cible: [s.x, s.y], connu: !!Game.siteKnown(me, s), inexplores: MapView.openLairs(g, me, pl).length }; }""")
        print('AVANT', r)
        await pg.wait_for_timeout(500)
        print('INFOBULLE', await pg.evaluate("() => (document.querySelector('#side') || document.body).innerText.split('\\n').filter(t => /Grotte|Ruines|Antre|Donjon|Gardé|inexploré/.test(t)).slice(0, 4)"),
              'PREVISION', await pg.evaluate("() => MapView.forecast && { inconnu: !!MapView.forecast.unknown }"))
        await shot(pg, 'lair_unknown')

        # ordre de marche : la pile s'approche, s'arrête devant, entre et voit : fenêtre de choix
        tx, ty = r['cible']
        await pg.evaluate(f"() => {{ App.moveSelected({tx}, {ty}); }}"); await pg.wait_for_timeout(2500)
        txt = await pg.evaluate("() => { const m = document.querySelector('.modal'); return m ? m.innerText : null; }")
        print('POSITION', await pg.evaluate("() => { const g = App.game, u = App.sel && g.units[App.sel.ids[0]]; return u && [u.x, u.y, u.moves]; }"))
        print('FENETRE', txt)
        await shot(pg, 'lair_scout')
        await pg.click('.modal footer button:has-text("Repartir")'); await pg.wait_for_timeout(400)
        r2 = await pg.evaluate(f"""() => {{ const g = App.game, me = App.me(), s = Game.siteAt ? null : g.sites[World.get(g.world, MapView.plane, 'site', {tx}, {ty})];
          const u = App.sel && g.units[App.sel.ids[0]];
          MapView.hover = {{ x: {tx}, y: {ty} }}; App.updatePathPreview(); App.renderSide(); App.refresh();
          return {{ distance: u ? World.dist(g.world, u.x, u.y, {tx}, {ty}) : null, connu: Game.siteKnown(me, s), inexplores: MapView.openLairs(g, me, MapView.plane).length, garde: Game.siteHasGuardians(s) }}; }}""")
        print('APRES REPARTIR', r2)
        await pg.wait_for_timeout(700)
        print('INFOBULLE', await pg.evaluate("() => (document.querySelector('#side') || document.body).innerText.split('\\n').filter(t => /Gardé|Prévision|rapport/.test(t)).slice(0, 4)"),
              'ETIQUETTE', await pg.evaluate("() => MapView.forecast && !MapView.forecast.pending ? Game.chanceWord(MapView.forecast.win) : MapView.forecast"))
        await shot(pg, 'lair_known')
        # on y retourne et cette fois on attaque : l'écran de bataille annonce les chances en mots
        await pg.evaluate(f"() => {{ App.moveSelected({tx}, {ty}); }}"); await pg.wait_for_timeout(1200)
        await pg.click('.modal footer button:has-text("Attaquer")'); await pg.wait_for_timeout(2500)
        print('BATAILLE', await pg.evaluate("() => { const m = document.querySelector('.modal'); return m ? m.innerText.split('\\n').filter(t => /Résolution automatique :|Situation/.test(t)) : null; }"))
        await shot(pg, 'lair_battle')
        print('LIBELLES', await pg.evaluate("() => [0.99, 0.85, 0.7, 0.5, 0.3, 0.1, 0.01].map(p => Game.chanceWord(p))"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
