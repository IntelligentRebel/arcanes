"""v0.31.71 : les sorts venus de Heroes à l'écran. En combat : champs de force, rideaux de flammes, mines (visibles de son seul camp),
brume, la ligne qu'on tourne avec R, les sorts en deux temps (Téléportation, Rafale, Sacrifice), le chemin de la Chaîne d'éclairs ;
sur la carte : la Porte dimensionnelle (la pile, puis la case d'arrivée) et le Portail urbain (la pile, puis la cité)."""
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

async def idle(pg):
    for _ in range(60):
        if not await pg.evaluate("CombatView.busy"): return
        await pg.wait_for_timeout(200)

HOMM = ['slow', 'mass_slow', 'force_field', 'fire_curtain', 'fire_mines', 'mist', 'teleport', 'gust', 'magic_mirror', 'clone', 'chain_lightning', 'fire_shield', 'martyr', 'divine_vengeance', 'sacrifice', 'vampirism', 'shackles', 'twilight', 'dimension_door', 'town_portal', 'fire_rain', 'frost_ring', 'meteor_shower', 'plague_cloud', 'holy_dawn']


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist', 'arcanes')))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 860}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(2500)
        await pg.evaluate("""(H) => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {}; Music.jingle = () => true;
          const g = Game.newGame({ seed: 5, opponents: 2, crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 4, chaos: 4, death: 3 }, retorts: [], race: 'highmen' } });
          App.start(g); const me = App.me(); for (const id of H) if (!me.known.includes(id)) me.known.push(id); me.mana = 5000; }""", HOMM)
        await pg.wait_for_timeout(2000); await pg.evaluate("UI.closeAll()")
        # icônes : toutes dans l'atlas
        r = await pg.evaluate("(H) => H.filter(id => !Sprites.hasHD('spell:' + id))", HOMM)
        ok(not r, 'icônes des 25 sorts dans l\'atlas' + (' (manquent : %r)' % r if r else ''))
        # un combat en rase campagne
        at = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), w = g.world, foe = g.players[1], fc = g.cities[pl.fortress];
          pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          let at = null;
          for (let d = 3; d < 12 && !at; d++) for (let dx = -d; dx <= d && !at; dx++) for (const dy of [-d, d]) { const x = World.wx(w, fc.x + dx), y = fc.y + dy;
            if (!World.inY(w, y) || World.terr(w, 0, x, y) !== T.GRASS || Cities.at(g, 0, x, y) || Units.at(g, 0, x, y).length || World.get(w, 0, 'site', x, y) >= 0) continue;
            const nb = World.neighbors(w, x, y).find(([nx, ny]) => World.terr(w, 0, nx, ny) === T.GRASS && !Units.at(g, 0, nx, ny).length && !Cities.at(g, 0, nx, ny) && World.get(w, 0, 'site', nx, ny) < 0);
            if (nb) { at = [x, y, nb[0], nb[1]]; break; } }
          for (const t of ['OrcSwordsmen', 'OrcBowmen', 'OrcSpearmen', 'OrcCavalry']) Units.create(g, t, foe.id, 0, at[0], at[1]);
          const ids = ['HighMenSwordsmen', 'HighMenBowmen', 'HighMenSpearmen', 'HighMenCavalry', 'HighMenMagician'].map(t => Units.create(g, t, pl.id, 0, at[2], at[3]).id);
          for (const id of ids) g.units[id].moves = 2;
          Move.revealAllFor(g, pl); MapView.centerOn(at[0], at[1], 0);
          App.selectTile(0, at[2], at[3], ids); void App.moveSelected(at[0], at[1]);
          return at; }""")
        await pg.wait_for_timeout(2200); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("!!CombatView.bt && CombatView.active"), 'le combat s\'ouvre')
        await idle(pg)
        # 1. Champ de force : la ligne suit le curseur, R la tourne, le clic la pose
        r = await pg.evaluate("""() => { const bt = CombatView.bt; bt.side = CombatView.humanSide; bt.castThisRound[bt.side] = false; bt.skillLeft[bt.side] = 999;
          CombatView.prepareCast('force_field', null); CombatView.hover = { c: 6, r: 6 };
          const z0 = [...CombatView.zoneOf('force_field', 6, 6, CombatView.mode.rot)];
          CombatView.onKey({ key: 'r', preventDefault() {}, stopPropagation() {} });
          const z1 = [...CombatView.zoneOf('force_field', 6, 6, CombatView.mode.rot)];
          return { rot: CombatView.mode.rot, z0, z1 }; }""")
        ok(r['rot'] == 1 and r['z0'] != r['z1'] and len(r['z1']) == 3, 'R tourne la ligne de trois cases (%r)' % r)
        await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(SHOTS, '03171-visee-champ.png'))
        r = await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide; const m0 = JSON.stringify(CombatView.mode); const res = CombatView.useTarget({ c: 6, r: 6 }, bt.unitAt(6, 6)); return [m0, Object.keys(bt.field).length, res, CombatView.busy, bt.side, me, bt.castThisRound[me], CombatSpells.zonePlace(bt, me, 'force_field', [6, 6, 1]).length, CombatSpells.wizardOptions(bt, me).map(o => o.id).includes('force_field'), bt.log.slice(-2)]; }""")
        r = r[1]
        await pg.wait_for_timeout(900)
        ok(r >= 2, 'le champ de force est posé (%d cases)' % r)
        # 2. les autres zones, posées par le moteur pour la photo : flammes, mines (du joueur), brume
        await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide;
          for (const [id, t] of [['fire_curtain', [4, 8, 0]], ['fire_mines', [8, 4]], ['mist', [9, 9]]]) { bt.castThisRound[me] = false; bt.side = me; CombatSpells.cast(bt, me, id, t, null, 0); }
          bt.mines['2,2'] = 1 - me; }""")
        await pg.wait_for_timeout(1200)
        r = await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide; return { flames: Object.keys(bt.flames).length, mines: Object.values(bt.mines).filter(s => s === me).length, mist: Object.keys(bt.mist).length,
          noteMine: bt.terrainNotes(8, 4, me).some(n => /mine/i.test(n)), noteFoe: bt.terrainNotes(2, 2, me).some(n => /mine/i.test(n)) }; }""")
        ok(r['flames'] == 3 and r['mines'] >= 3 and r['mist'] == 9, 'flammes, mines et brume posées (%r)' % r)
        ok(r['noteMine'] and not r['noteFoe'], 'on voit ses mines, pas celles de l\'ennemi')
        await pg.screenshot(path=os.path.join(SHOTS, '03171-zones.png'))
        await idle(pg)
        # 3. Téléportation en deux temps
        r = await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide; bt.castThisRound[me] = false; bt.side = me;
          const u = bt.alive(me).find(b => b.u.type === 'HighMenSwordsmen'); CombatView.prepareCast('teleport', null);
          CombatView.useTarget({ c: u.c, r: u.r }, u); const first = CombatView.mode && CombatView.mode.first === u, tiles = CombatView.targetTiles().size;
          const dest = CombatSpells.teleportDests(bt, me, u).find(([c, r]) => c === 6 && r === 3) || CombatSpells.teleportDests(bt, me, u)[0];
          CombatView.useTarget({ c: dest[0], r: dest[1] }, null);
          return { first, tiles, moved: u.c === dest[0] && u.r === dest[1], mode: !!CombatView.mode }; }""")
        ok(r['first'] and r['tiles'] > 50 and r['moved'] and not r['mode'], 'Téléportation : l\'unité, puis la case (%r)' % r)
        await pg.wait_for_timeout(1500)
        # 4. Chaîne d'éclairs : le chemin s'affiche au survol
        await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide; bt.castThisRound[me] = false; bt.side = me;
          const e = bt.alive(1 - me)[0]; CombatView.prepareCast('chain_lightning', null); CombatView.hover = { c: e.c, r: e.r }; }""")
        await pg.wait_for_timeout(400); await pg.screenshot(path=os.path.join(SHOTS, '03171-chaine.png'))
        ok(await pg.evaluate("CombatView.active && CombatView.mode && CombatView.mode.id === 'chain_lightning'"), 'Chaîne d\'éclairs : visée affichée')
        await pg.evaluate("CombatView.mode = null")
        await idle(pg)
        # 4b. (0.31.72) sorts de zone : la Pluie de feu se vise, la Nuée pestilentielle se pose au clic
        await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide; bt.castThisRound[me] = false; bt.side = me; bt.skillLeft[me] = 999;
          const e = bt.alive(1 - me)[0]; CombatView.prepareCast('fire_rain', null); CombatView.hover = { c: e.c, r: e.r }; }""")
        await pg.wait_for_timeout(400); await pg.screenshot(path=os.path.join(SHOTS, '03172-pluie.png'))
        r = await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide; const e = bt.alive(1 - me)[0];
          const z = [...CombatView.zoneOf('fire_rain', e.c, e.r, 0)].length; CombatView.mode = null; bt.castThisRound[me] = false; bt.side = me; bt.skillLeft[me] = 999;
          CombatView.prepareCast('plague_cloud', null); CombatView.useTarget({ c: e.c, r: e.r }, e);
          return { z, plague: Object.keys(bt.plague).length, mode: !!CombatView.mode, log: bt.log.slice(-2) }; }""")
        ok(r['z'] == 9 and r['plague'] >= 4 and not r['mode'], 'zones : Pluie de feu visée sur 3 × 3, Nuée posée (%r)' % r)
        await pg.wait_for_timeout(1500); await idle(pg); await pg.screenshot(path=os.path.join(SHOTS, '03172-nuee.png'))
        # 5. la liste des sorts : les nouveaux y sont, avec leur icône
        await pg.evaluate("(() => { const bt = CombatView.bt; bt.castThisRound[CombatView.humanSide] = false; bt.side = CombatView.humanSide; CombatView.spellMenu(); })()"); await pg.wait_for_timeout(500)
        txt = await pg.evaluate("document.querySelector('.modal') ? document.querySelector('.modal').innerText : ''")
        ok('Rideau de flammes' in txt and 'Téléportation' in txt and 'Rafale' in txt, 'la liste des sorts de combat montre les nouveaux sorts')
        await pg.screenshot(path=os.path.join(SHOTS, '03171-grimoire-combat.png'))
        await pg.evaluate("UI.closeAll()")
        # fin du combat, en automatique
        await pg.evaluate("(() => { if (CombatView.bt && !CombatView.auto) CombatView.toggleAuto(); })()")
        for _ in range(120):
            await pg.wait_for_timeout(250)
            if not await pg.evaluate("CombatView.active"): break
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        # 6. carte : Porte dimensionnelle (la pile, puis l'arrivée), Portail urbain (la pile, puis la cité)
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const spot = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y));
          const us = ['HighMenSpearmen', 'HighMenSwordsmen'].map(t => Units.create(g, t, me.id, 0, spot[0], spot[1]));
          me.skillLeft = 999; me.mana = 5000; me.casting = null; MapView.bumpVis();
          MagicUI.beginCast('dimension_door'); const T0 = MagicUI.targeting && MagicUI.targeting.tiles.length;
          MagicUI.pickTarget(0, spot[0], spot[1]); const T1 = MagicUI.targeting && MagicUI.targeting.from ? MagicUI.targeting.tiles.length : 0;
          const d = MagicUI.targeting.tiles.map(t => [t[1], t[2]]).sort((a, b) => World.dist(g.world, b[0], b[1], spot[0], spot[1]) - World.dist(g.world, a[0], a[1], spot[0], spot[1]))[0];
          MagicUI.pickTarget(0, d[0], d[1]);
          return { T0, T1, jumped: us.every(u => u.x === d[0] && u.y === d[1] && u.moves === 0), d, spot }; }""")
        ok(r['T0'] > 0 and r['T1'] > 0 and r['jumped'], 'Porte dimensionnelle : la pile saute (%r)' % r)
        await pg.wait_for_timeout(600); await pg.screenshot(path=os.path.join(SHOTS, '03171-porte.png'))
        r = await pg.evaluate("""(d) => { const g = App.game, me = App.me(), fc = g.cities[me.fortress]; me.skillLeft = 999; me.casting = null;
          MagicUI.beginCast('town_portal'); const T0 = MagicUI.targeting && MagicUI.targeting.tiles.length;
          MagicUI.pickTarget(0, d[0], d[1]); return { T0, modal: !!document.querySelector('.modal') }; }""", r['d'])
        ok(r['T0'] > 0 and r['modal'], 'Portail urbain : la pile, puis le choix de la cité (%r)' % r)
        await pg.screenshot(path=os.path.join(SHOTS, '03171-portail.png'))
        await pg.evaluate("""() => { const b = [...document.querySelectorAll('.modal button, .modal .row, .modal .choice')].find(x => /forteresse/.test(x.textContent)); if (b) b.click(); }""")
        await pg.wait_for_timeout(500)
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress]; return Units.at(g, 0, fc.x, fc.y).filter(u => u.owner === me.id && ['HighMenSpearmen', 'HighMenSwordsmen'].includes(u.type)).length; }""")
        ok(r >= 2, 'la pile rentre à la forteresse (%d unités)' % r)
        ok(not errs, 'aucune erreur de page' + (' : ' + ' | '.join(errs[:3]) if errs else ''))
        await b.close()
    srv.shutdown()
    if FAIL: raise SystemExit(1)

asyncio.run(main())
