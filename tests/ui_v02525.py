"""v0.25.25 : « Garder jusqu'à la brèche » en siège, projectiles propres à chaque tireur (flèches, javelots, pierres, boulets, rochers, traits)."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")

        # 1. siège : cinq fantassins en garde jusqu'à la brèche
        await pg.evaluate("""() => { const g = App.game, me = App.me(), foe = g.players[1], c = g.cities[foe.fortress];
          c.buildings.cityWalls = true;
          for (const u of Units.at(g, c.plane, c.x, c.y)) Units.remove(g, u);
          const D = ['OrcSpearmen', 'OrcBowmen'].map(t => Units.create(g, t, foe.id, c.plane, c.x, c.y));
          const A = ['HighMenSwordsmen', 'HighMenSwordsmen', 'HighMenSpearmen', 'HighMenSpearmen', 'HighMenPikemen', 'Catapult'].map(t => Units.create(g, t, me.id, c.plane, c.x, c.y));
          window._bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: foe.id, plane: c.plane, x: c.x, y: c.y, city: c, rng: new RNG(4) });
          CombatView.run(g, _bt, { city: c }); }""")
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        print('MURAILLE', await pg.evaluate("({ murs: _bt.hasWalls, breche: _bt.breached(), bouton: [...document.querySelectorAll('#c-bar button')].map(b => b.textContent).find(t => t.includes('brèche')) })"))
        # cinq fantassins : G sur chacun
        for i in range(5):
            await pg.evaluate("(i) => { const inf = _bt.alive(CombatView.humanSide).filter(b => b.u.type !== 'Catapult'); CombatView.sel = inf[i]; CombatView.refreshPanels(); }", i)
            await pg.keyboard.press('g'); await pg.wait_for_timeout(250)
        r = await pg.evaluate("({ garde: _bt.alive(CombatView.humanSide).filter(b => b.holdBreach).length, sel: CombatView.sel && CombatView.sel.u.type, tour: _bt.round, side: _bt.side })")
        print('EN GARDE', r)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'hold.png'))
        # la catapulte passe ; tour suivant : les cinq restent en garde, sans ordre à donner
        await pg.evaluate("() => { const cat = _bt.alive(CombatView.humanSide).find(b => b.u.type === 'Catapult'); cat.moves = 0; CombatView.act(() => { }); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy && _bt.round >= 2", timeout=60000)
        await pg.wait_for_timeout(300)
        r = await pg.evaluate("({ tour: _bt.round, garde: _bt.alive(CombatView.humanSide).filter(b => b.holdBreach).length, enMouvement: _bt.alive(CombatView.humanSide).filter(b => b.moves > 0).map(b => b.u.type), sel: CombatView.sel && CombatView.sel.u.type })")
        print('TOUR 2', r)
        # lever la garde d'une unité : elle retrouve son mouvement
        r = await pg.evaluate("() => { const b = _bt.alive(CombatView.humanSide).find(b => b.holdBreach); CombatView.sel = b; CombatView.holdBreach(); return [b.holdBreach, b.moves, b.maxMoves]; }")
        print('LEVER', r)
        await pg.evaluate("() => { const b = CombatView.sel; CombatView.holdBreach(); }"); await pg.wait_for_timeout(300)
        # la muraille tombe pendant le tour : tous reprennent le combat aussitôt
        r = await pg.evaluate("""async () => { const k = Object.keys(_bt.walls).find(k => !_bt.walls[k].gate);
          await CombatView.act(() => { _bt.walls[k].broken = true; });
          return { breche: _bt.breached(), garde: _bt.alive(CombatView.humanSide).filter(b => b.holdBreach).length, mouvements: _bt.alive(CombatView.humanSide).filter(b => b.u.type !== 'Catapult').map(b => b.moves), toast: [...document.querySelectorAll('#toasts > *')].map(t => t.textContent).slice(-1), bouton: [...document.querySelectorAll('#c-bar button')].some(b => b.textContent.includes('brèche')) }; }""")
        print('BRECHE', r)
        await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        await pg.wait_for_timeout(500); await pg.evaluate("UI.closeAll()")

        # 2. projectiles : une capture en plein vol pour chaque tireur
        for shooter in ['HighMenBowmen', 'Slingers', 'LizardJavelineers', 'Catapult', 'SteamCannon', 'HighMenMagician', 'Longbowmen']:
            await pg.evaluate("""(t) => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
              const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
              const a = Units.create(g, t, me.id, 0, x, y), d = Units.create(g, 'OrcSpearmen', foe.id, 0, x, y), z = Units.create(g, 'HighMenSpearmen', me.id, 0, x, y);
              window._bt = new Battle(g, { attackers: [a, z], defenders: [d], attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(5) });
              CombatView.run(g, _bt, {}); }""", shooter)
            await pg.wait_for_timeout(600)
            await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
            await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
            r = await pg.evaluate("""() => { const a = _bt.alive(CombatView.humanSide).find(b => b.u.type !== 'HighMenSpearmen' || _bt.alive(CombatView.humanSide).length === 1), d = _bt.alive(1 - CombatView.humanSide)[0];
              a.c = 3; a.r = 9; d.c = 9; d.r = 3; CombatView.pos[a.id].c = 3; CombatView.pos[a.id].r = 9; CombatView.pos[d.id].c = 9; CombatView.pos[d.id].r = 3;
              const ok = _bt.canShoot(a, d) || _bt.stats(a).ab.siegeOnly; if (ok) CombatView.act(() => { if (_bt.canShoot(a, d)) _bt.shoot(a, d); else { _bt.ev({ type: 'ranged', a: a.id, d: d.id, kind: 'boulder', dealt: 0 }); } }); return { tir: ok, style: CombatView.projStyle(a, _bt.stats(a).rangedType === 'magic' ? 'magic' : _bt.stats(a).rangedType === 'boulder' ? 'boulder' : 'missile'), figures: _bt.figures(a) }; }""")
            await pg.wait_for_timeout(560 if shooter in ('HighMenBowmen', 'Longbowmen', 'HighMenMagician') else 480)
            print('TIR', shooter, r)
            if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'proj_' + shooter + '.png'))
            await pg.wait_for_function("() => !CombatView.busy", timeout=20000)
            await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
            await pg.wait_for_timeout(400); await pg.evaluate("UI.closeAll()")
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
