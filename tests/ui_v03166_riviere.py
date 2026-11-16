"""v0.31.66 (et 0.31.67, ponts) : la rivière du champ de bataille a ses textures (eau profonde qui coule, gué à galets), une par plan ; Sarrek a son
nouveau portrait (atlas complémentaire) ; les colons à 0 mouvement ne restent plus dans les unités en attente."""
import asyncio, os, http.server, threading, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except (ConnectionResetError, BrokenPipeError): pass


async def battle(pg, plane):
    """Un combat sur une case de rivière du plan donné ; renvoie le nombre de cases d'eau et de gués."""
    await pg.evaluate("""() => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {}; Music.jingle = () => true;
      const g = Game.newGame({ seed: 7, opponents: 2, crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'lizardman' } });
      App.start(g); }""")
    await pg.wait_for_timeout(2000); await pg.evaluate("UI.closeAll()")
    at = await pg.evaluate("""(P) => {
      const g = App.game, pl = App.me(), w = g.world, foe = g.players[1];
      pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
      let at = null;
      for (let y = 3; y < w.h - 3 && !at; y++) for (let x = 0; x < w.w && !at; x++) {
        if (World.terr(w, P, x, y) !== T.RIVER || Cities.at(g, P, x, y) || World.get(w, P, 'site', x, y) >= 0 || Units.at(g, P, x, y).length) continue;
        for (const [nx, ny] of World.neighbors(w, x, y)) if (!World.isWaterAt(w, P, nx, ny) && World.terr(w, P, nx, ny) !== T.MOUNTAIN && !Units.at(g, P, nx, ny).length && !Cities.at(g, P, nx, ny) && World.get(w, P, 'site', nx, ny) < 0) { at = [x, y, nx, ny]; break; }
      }
      if (!at) return null;
      Units.create(g, 'HighMenSpearmen', foe.id, P, at[0], at[1]);
      const ids = ['LizardSpearmen', 'LizardSpearmen'].map(t => Units.create(g, t, pl.id, P, at[2], at[3]).id);
      for (const id of ids) g.units[id].moves = 2;
      if (P) App.plane = 1;
      Move.revealAllFor(g, pl); MapView.centerOn(at[0], at[1], P);
      App.selectTile(P, at[2], at[3], ids); void App.moveSelected(at[0], at[1]);
      return at;
    }""", plane)
    await pg.wait_for_timeout(2200); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
    return at, await pg.evaluate("""() => { const bt = CombatView.bt; return bt ? { river: Object.keys(bt.river).length, ford: Object.keys(bt.ford).length, bridge: Object.keys(bt.bridge || {}).length, plane: bt.plane,
      pat: !!CombatView.waterPat, deep: !!Tex.get('criver', bt.plane), mirror: bt.plane === 1 ? Sprites.hasHD('tex:criver~m') : null } : null; }""")


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist', 'arcanes')))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 860}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(2500)
        for plane in (0, 1):
            at, st = await battle(pg, plane)
            ok(at is not None and st and st['river'] > 0 and st['ford'] + st['bridge'] == 4, 'plan %d : combat sur une rivière, deux passages (%r)' % (plane, st))
            ok(st and st['pat'] and st['deep'], 'plan %d : textures de la rivière chargées' % plane)
            if plane: ok(st and st['mirror'], 'Miroir : sa propre texture de rivière')
            await pg.screenshot(path=os.path.join(SHOTS, '03166-riviere-%d.png' % plane))
            # le dessin continue d'une image à l'autre (l'eau coule) sans planter
            await pg.wait_for_timeout(500)
            ok(await pg.evaluate("CombatView.active"), 'plan %d : le combat se dessine toujours' % plane)
            # (0.31.67) un pont : les gués deviennent des ponts, le dessin suit
            await pg.evaluate("(() => { const bt = CombatView.bt; for (const k of Object.keys(bt.ford)) { delete bt.ford[k]; delete bt.river[k]; bt.bridge[k] = true; } })()")
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=os.path.join(SHOTS, '03167-pont-%d.png' % plane))
            ok(await pg.evaluate("CombatView.active && Object.keys(CombatView.bt.bridge).length === 4"), 'plan %d : deux ponts dessinés' % plane)
            await pg.evaluate("(() => { if (CombatView.bt && !CombatView.auto) CombatView.toggleAuto(); })()")
            for _ in range(80):
                await pg.wait_for_timeout(250)
                if not await pg.evaluate("CombatView.active"): break
            await pg.evaluate("UI.closeAll()")
        # portrait de Sarrek : celui de l'atlas complémentaire
        r = await pg.evaluate("({ hd2: !!(window.HD2_JSON || {})['portrait:HeroTumu'], pic: Sprites.heroPic('HeroTumu') })")
        ok(r['hd2'] and r['pic'] == 'portrait:HeroTumu', 'Sarrek : nouveau portrait (%r)' % r)
        # colons à 0 mouvement : plus dans les unités en attente
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          let spot = null; for (let d = 4; d < 12 && !spot; d++) for (let dx = -d; dx <= d && !spot; dx++) for (const dy of [-d, d]) { const x = World.wx(g.world, fc.x + dx), y = fc.y + dy; if (World.inY(g.world, y) && Cities.canFoundAt(g, me.id, 0, x, y).ok) { spot = [x, y]; break; } }
          const s = Units.create(g, 'LizardSettlers', me.id, 0, spot[0], spot[1]); s.moves = 0;
          return App.unitsWaiting().includes(s); }""")
        ok(not r, 'colons à 0 mouvement : pas dans les unités en attente')
        ok(not errs, 'aucune erreur de page (%s)' % errs[:3])
        await b.close()
    srv.shutdown()
    print('ÉCHECS :', FAIL if FAIL else 'aucun')
    raise SystemExit(1 if FAIL else 0)

asyncio.run(main())
