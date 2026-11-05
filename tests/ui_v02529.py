"""v0.25.29 : projectiles et sol corrompu dessinés (atlas fx), réglage de puissance des sorts."""
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
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('ATLAS', await pg.evaluate("({ img: !!Fx.img, sprites: Object.keys(Fx.meta).length })"))

        # 1. sol corrompu autour de la capitale
        await pg.evaluate("""() => { const g = App.game, w = g.world, c = g.cities[App.me().fortress];
          for (let dy = -3; dy <= 3; dy++) for (let dx = 2; dx <= 5; dx++) { const x = World.wx(w, c.x + dx), y = c.y + dy; if (World.inY(w, y) && !World.isWaterAt(w, 0, x, y) && (dx + dy) % 3) World.set(w, 0, 'corrupt', x, y, 1); }
          MapView.ts = 72; MapView.centerOn(c.x + 3, c.y, 0); MapView.invalidate && MapView.invalidate(); App.refresh(); }""")
        await pg.wait_for_timeout(700)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'corruption.png'))

        # 2. un tir de chaque genre, capturé en plein vol
        for shooter in ['HighMenBowmen', 'HighElfLongbowmen', 'OrcBowmen', 'Slingers', 'LizardJavelineers', 'Catapult', 'SteamCannon', 'HighMenMagician', 'StoneGiant', 'Priest']:
            ok = await pg.evaluate("(t) => !!DATA.units[t]", shooter)
            if not ok:
                print('ABSENT', shooter); continue
            await pg.evaluate("""(t) => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
              const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
              const a = Units.create(g, t, me.id, 0, x, y), d = Units.create(g, 'OrcSpearmen', foe.id, 0, x, y), z = Units.create(g, 'HighMenSpearmen', me.id, 0, x, y);
              window._bt = new Battle(g, { attackers: [a, z], defenders: [d], attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(5) });
              CombatView.run(g, _bt, {}); }""", shooter)
            await pg.wait_for_timeout(600)
            await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
            await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
            r = await pg.evaluate("""() => { const a = _bt.alive(CombatView.humanSide).find(b => b.u.type !== 'HighMenSpearmen'), d = _bt.alive(1 - CombatView.humanSide)[0];
              a.c = 3; a.r = 9; d.c = 9; d.r = 3; CombatView.pos[a.id].c = 3; CombatView.pos[a.id].r = 9; CombatView.pos[d.id].c = 9; CombatView.pos[d.id].r = 3;
              const s = _bt.stats(a), kind = s.rangedType === 'magic' ? 'magic' : s.rangedType === 'boulder' ? 'boulder' : 'missile';
              const ok = _bt.canShoot(a, d) || s.ab.siegeOnly;
              if (ok) CombatView.act(() => { if (_bt.canShoot(a, d)) _bt.shoot(a, d); else _bt.ev({ type: 'ranged', a: a.id, d: d.id, kind: 'boulder', dealt: 0 }); });
              return { tir: ok, sprite: CombatView.projSprite(a, { kind, realm: s.rangedRealm }, CombatView.projStyle(a, kind)) }; }""")
            await pg.wait_for_timeout(520 if shooter not in ('Catapult', 'StoneGiant') else 640)
            print('TIR', shooter, r)
            if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'proj_' + shooter + '.png'))
            await pg.wait_for_function("() => !CombatView.busy", timeout=20000)
            await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
            await pg.wait_for_timeout(400); await pg.evaluate("UI.closeAll()")
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
