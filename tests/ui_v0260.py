"""v0.26.0 : rôles de cité, point de ralliement, radar des menaces, annulation d'un déplacement, résolution auto mise en avant,
flanc et dos en combat (chevron d'orientation, prévision de mêlée, case d'approche)."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def shot(pg, name):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, name + '.png'))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))

        # 1. rôles : la puce choisit d'elle-même la production quand la file est vide
        r = await pg.evaluate("""() => { const g = App.game, c = g.cities[App.me().fortress]; c.queue = []; c.prod = { type: 'tradeGoods' };
          const out = {};
          for (const k of ['growth', 'gold', 'army', 'magic']) { const ch = Cities.roleChoice(g, c, k); out[k] = ch ? ch.type + ':' + (ch.id || '') : null; }
          return out; }""")
        print('ROLES', r)
        await pg.evaluate("() => { CityUI.open(App.me().fortress); }"); await pg.wait_for_timeout(600)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.rolerow .chip')].find(b => b.textContent === 'Or'); b.click(); }")
        await pg.wait_for_timeout(400)
        r = await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; return { role: c.role, prod: c.prod.type + ':' + (c.prod.id || ''), on: [...document.querySelectorAll('.rolerow .chip.on')].map(b => b.textContent) }; }")
        print('ROLE OR', r)
        await shot(pg, 'role_city')
        # une construction achevée : le rôle enchaîne sans demander d'ordre
        r = await pg.evaluate("""() => { const g = App.game, c = g.cities[App.me().fortress], pl = App.me();
          c.queue = []; const before = c.prod.id; c.progress = 99999; const logs = g.log.length;
          Turn.processCity(g, c, pl);
          return { before, after: c.prod.type + ':' + (c.prod.id || ''), built: !!c.buildings[before], needsOrder: !!c.needsOrder, log: g.log.slice(logs).map(e => e.text).filter(t => / lance : /.test(t)) }; }""")
        print('ROLE SUITE', r)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        # tableau des cités : colonne Rôle
        await pg.evaluate("() => { Panels.cities(); }"); await pg.wait_for_timeout(500)
        print('TABLE ROLE', await pg.evaluate("() => [...document.querySelectorAll('.modal th')].some(t => t.textContent === 'Rôle') && [...document.querySelectorAll('.modal td')].some(t => t.textContent === 'Or')"))
        await shot(pg, 'role_table')
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)

        # 2. point de ralliement : la recrue y marche seule, puis monte la garde
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          let spot = null;
          for (let d = 3; d <= 4 && !spot; d++) for (let dx = -d; dx <= d && !spot; dx++) for (let dy = -d; dy <= d && !spot; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            const x = World.wx(g.world, c.x + dx), y = c.y + dy;
            if (World.inY(g.world, y) && !World.isWaterAt(g.world, 0, x, y) && me.explored[0][y * g.world.w + x] && !Cities.at(g, 0, x, y) && !Units.at(g, 0, x, y).length && Move.findPath(g, [Units.at(g, 0, c.x, c.y)[0]], 0, x, y, {})) spot = { plane: 0, x, y };
          }
          c.rally = spot;
          const e = Cities.econ(g, c);
          Turn.completeUnit(g, c, 'HighMenSpearmen', me, e);
          const u = Object.values(g.units).filter(u => u.owner === me.id && u.type === 'HighMenSpearmen').sort((a, b) => b.id - a.id)[0];
          const st0 = { status: u.status, dest: u.dest, hold: !!u.rallyHold };
          for (let t = 0; t < 6 && u.status === 'goto'; t++) { u.moves = u.maxMoves; await Game.continueMove(g, [u.id], {}); }
          return { spot, st0, at: [u.x, u.y], status: u.status }; }""")
        print('RALLY', r)
        await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; MapView.ts = 64; MapView.centerOn(c.x, c.y, 0); App.refresh(); }")
        await pg.wait_for_timeout(500); await shot(pg, 'rally_map')
        await pg.evaluate("() => { CityUI.open(App.me().fortress); }"); await pg.wait_for_timeout(500)
        print('RALLY ROW', await pg.evaluate("() => [...document.querySelectorAll('.modal *')].some(e => /ralliement/i.test(e.textContent) && e.children.length < 6)"))
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)

        # 4. annuler un déplacement qui n'a rien révélé
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          const u = Units.create(g, 'HighMenSwordsmen', me.id, 0, c.x, c.y); u.moves = Units.maxMoves(g, u);
          const nb = World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y));
          App.selectTile(0, c.x, c.y, [u.id]);
          await App.moveSelected(nb[0], nb[1]);
          const moved = [u.x, u.y], can = App.canUndo([u.id]);
          return { id: u.id, from: [c.x, c.y], moved, can, moves: u.moves }; }""")
        print('UNDO AVANT', r)
        await pg.wait_for_timeout(400)
        await shot(pg, 'undo_button')
        await pg.keyboard.press('u'); await pg.wait_for_timeout(300)
        print('UNDO APRES', await pg.evaluate("(id) => { const u = App.game.units[id]; return { at: [u.x, u.y], moves: u.moves, max: Units.maxMoves(App.game, u), again: App.canUndo([id]) }; }", r['id']))

        # 3. radar des menaces : une pile ennemie à quelques cases de la capitale
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), foe = g.players[1], c = g.cities[me.fortress];
          let at = null;
          for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [-2, -1], [1, -2], [-1, 2]]) { const x = World.wx(g.world, c.x + dx), y = c.y + dy; if (World.inY(g.world, y) && !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y) && !Units.at(g, 0, x, y).length) { at = [x, y]; break; } }
          me.diplo[foe.id] = 'war'; foe.diplo[me.id] = 'war';
          for (const t of ['OrcSwordsmen', 'OrcSwordsmen', 'OrcCavalry']) Units.create(g, t, foe.id, 0, at[0], at[1]);
          MapView._thrKey = null; App.showThreats = true; MapView.bumpVis(); MapView.invalidateVis(); App.refresh(); MapView.centerOn(c.x + 2, c.y, 0);
          return at; }""")
        await pg.wait_for_timeout(700)
        print('THREAT VIS', await pg.evaluate("(at) => { const w = App.game.world; return { vis: MapView.vis && MapView.vis[0][at[1] * w.w + at[0]], units: Units.at(App.game, 0, at[0], at[1]).length }; }", r))
        r = await pg.evaluate("() => MapView.threats(0).map(t => ({ city: t.city && t.city.name, eta: t.eta, ratio: Math.round(t.ratio * 10) / 10, n: t.n }))")
        print('THREATS', r)
        await shot(pg, 'threats')
        await pg.keyboard.press('t'); await pg.wait_for_timeout(300)
        print('THREATS OFF', await pg.evaluate("App.showThreats"))
        await pg.keyboard.press('t'); await pg.wait_for_timeout(200)

        # 5. combat gagné d'avance : la résolution automatique passe en premier
        await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const A = ['Paladin', 'Paladin', 'Paladin'].map(t => Units.create(g, t, me.id, 0, x, y)), D = [Units.create(g, 'OrcSpearmen', foe.id, 0, x, y)];
          window._bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(5) });
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(900)
        print('INTRO SUR', await pg.evaluate("() => [...document.querySelectorAll('.modal button')].map(b => b.textContent + (b.classList.contains('primary') ? '*' : ''))"))
        await shot(pg, 'intro_sure')
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        await pg.wait_for_timeout(500); await pg.evaluate("UI.closeAll()")

        # 6. flanc et dos : la cavalerie contourne, frappe dans le dos
        await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const A = ['HighMenCavalry', 'HighMenSwordsmen'].map(t => Units.create(g, t, me.id, 0, x, y)), D = ['HighMenSpearmen', 'HighMenBowmen'].map(t => Units.create(g, t, foe.id, 0, x, y));
          window._bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(9) });
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(900)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        r = await pg.evaluate("""() => { const bt = _bt, me = CombatView.humanSide;
          const cav = bt.alive(me).find(b => b.u.type === 'HighMenCavalry'), sw = bt.alive(me).find(b => b.u.type === 'HighMenSwordsmen');
          const sp = bt.alive(1 - me).find(b => b.u.type === 'HighMenSpearmen'), bw = bt.alive(1 - me).find(b => b.u.type === 'HighMenBowmen');
          const put = (b, c, r) => { b.c = c; b.r = r; const p = CombatView.pos[b.id]; if (p) { p.c = c; p.r = r; } };
          // le piquier regarde vers le bas de l'écran (+1, +1) ; la cavalerie arrive par l'arrière-gauche
          put(sp, 6, 5); sp.fdir = [1, 1]; put(bw, 3, 3); put(cav, 4, 3); put(sw, 8, 8);
          cav.moves = cav.maxMoves; sw.moves = sw.maxMoves; cav.movedTiles = 0;
          CombatView.sel = cav; CombatView.reach = bt.reachable(cav);
          const at = CombatView.approachTile(cav, sp);
          const fc = CombatAI.meleeForecast(bt, cav, sp, at, 300);
          const p = CombatView.stand(sp.c, sp.r); CombatView.hover = { c: sp.c, r: sp.r };
          return { at: at && [at.c, at.r, at.flank], fc, front: bt.flankOf(sw, sp, 7, 6), side: bt.flankOf(sw, sp, 7, 4), back: bt.flankOf(sw, sp, 5, 4) }; }""")
        print('FLANC PREVISION', r)
        await pg.wait_for_timeout(500); await shot(pg, 'flank_forecast')
        # mesure : défense effective du piquier, de face et de dos
        print('DEF FACE/DOS', await pg.evaluate("""() => { const bt = _bt, me = CombatView.humanSide;
          const cav = bt.alive(me).find(b => b.u.type === 'HighMenCavalry'), sp = bt.alive(1 - me).find(b => b.u.type === 'HighMenSpearmen');
          const oc = cav.c, or = cav.r; cav.c = 7; cav.r = 6; const face = bt.defFor(sp, 'melee', null, bt.meleeMods(cav, sp));
          cav.c = 5; cav.r = 4; const dos = bt.defFor(sp, 'melee', null, bt.meleeMods(cav, sp)); cav.c = oc; cav.r = or; return { face, dos }; }"""))
        await pg.evaluate("""() => { const bt = _bt, cav = CombatView.sel, sp = bt.alive(1 - CombatView.humanSide).find(b => b.u.type === 'HighMenSpearmen'); CombatView.onClickTile ? CombatView.onClickTile({ c: sp.c, r: sp.r }) : null; }""")
        # le clic passe par la même logique que la souris
        r = await pg.evaluate("""async () => { const bt = _bt, cav = CombatView.sel, sp = bt.alive(1 - CombatView.humanSide).find(b => b.u.type === 'HighMenSpearmen');
          const n0 = bt.events.length;
          if (!bt.events.slice(n0).some(e => e.type === 'melee')) { const best = CombatView.approachTile(cav, sp); CombatView.act(() => { bt.moveUnit(cav, best.c, best.r); if (cav.moves > 0 && bt.canMelee(cav, sp)) bt.melee(cav, sp); }); }
          await new Promise(r => setTimeout(r, 200));
          const ev = bt.events.slice(n0).find(e => e.type === 'melee');
          return { ev: ev && { flank: ev.flank, dealt: ev.dealt, received: ev.received }, log: bt.log.slice(-2), spFacing: sp.fdir, cavAt: [cav.c, cav.r] }; }""")
        print('FLANC ATTAQUE', r)
        await pg.wait_for_timeout(250); await shot(pg, 'flank_float')
        await pg.wait_for_function("() => !CombatView.busy", timeout=20000)
        await pg.wait_for_timeout(400); await shot(pg, 'flank_after')
        # un fantassin en garde n'a ni flanc ni dos
        print('GARDE', await pg.evaluate("""() => { const bt = _bt, sw = bt.alive(CombatView.humanSide).find(b => b.u.type === 'HighMenSwordsmen'), bw = bt.alive(1 - CombatView.humanSide).find(b => b.u.type === 'HighMenBowmen');
          if (!bw) return 'archer mort'; const before = bt.flankOf(sw, bw, bw.c - bt.fdirOf(bw)[0], bw.r - bt.fdirOf(bw)[1]); bw.guarding = true; const after = bt.flankOf(sw, bw, bw.c - bt.fdirOf(bw)[0], bw.r - bt.fdirOf(bw)[1]); bw.guarding = false; return { before, after }; }"""))
        await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        await pg.wait_for_timeout(400); await pg.evaluate("UI.closeAll()")
        await pg.evaluate("() => { Panels.help(); }"); await pg.wait_for_timeout(400)
        print('AIDE FLANC', await pg.evaluate("() => /Flanc et dos/.test(document.body.innerText)"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
