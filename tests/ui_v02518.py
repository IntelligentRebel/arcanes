"""v0.25.18 : « Attendre » (W) sans limite, expérience par tour d'une pile, rapport de forces, frontières fermées, rebelles de l'empire."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # combat : trois unités, W sept fois
        await pg.evaluate("""() => { const g = App.game, me = App.me(), foe = g.players[1], c = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const A = ['HighMenSpearmen', 'HighMenSwordsmen', 'HighMenBowmen'].map(t => Units.create(g, t, me.id, 0, x, y));
          const d = Units.create(g, 'OrcSpearmen', foe.id, 0, x, y);
          window._bt = new Battle(g, { attackers: A, defenders: [d], attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(3) });
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        seq = []
        for i in range(7):
            seq.append(await pg.evaluate("CombatView.sel ? CombatView.sel.u.type.replace('HighMen', '') : null"))
            await pg.keyboard.press('w'); await pg.wait_for_timeout(120)
        print('COMBAT W', seq)
        await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        await pg.wait_for_timeout(600); await pg.evaluate("UI.closeAll()")
        # carte : trois piles qui attendent, W sept fois
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          for (const u of Object.values(g.units)) if (u.owner === me.id) u.status = 'sentry';
          const spots = []; for (let r = 2; r <= 4 && spots.length < 3; r++) for (let dx = -r; dx <= r && spots.length < 3; dx++) { const x = World.wx(g.world, c.x + dx), y = c.y + r; if (World.inY(g.world, y) && !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y) && !Units.at(g, 0, x, y).length && World.get(g.world, 0, 'site', x, y) < 0 && !Move.blockedMountain(g, 0, x, y)) spots.push([x, y]); }
          window._ids = spots.map(([x, y]) => Units.create(g, 'HighMenSpearmen', me.id, 0, x, y).id);
          App.selectNext(true); }""")
        await pg.wait_for_timeout(300)
        seq = []
        for i in range(7):
            seq.append(await pg.evaluate("App.sel ? _ids.indexOf(App.sel.ids[0]) : null"))
            await pg.keyboard.press('w'); await pg.wait_for_timeout(150)
        print('CARTE W', seq)
        # expérience par tour d'une pile avec un super maître d'armes
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          const h = Object.values(DATA.heroes).find(x => x.unit === 'HeroTheria');
          const hero = Heroes.spawn(g, me, h, c.plane, c.x, c.y, 130); hero.hero.extra = Object.assign({}, hero.hero.extra, { superArmsmaster: true });
          const sw = Units.create(g, 'HighMenSwordsmen', me.id, c.plane, c.x, c.y);
          App.selectTile(c.plane, c.x, c.y, [hero.id, sw.id]); App.renderSide();
          return [...document.querySelectorAll('#sel div')].map(d => d.textContent).find(t => t.startsWith('Expérience par tour')); }""")
        print('XP PILE', r)
        # rapport de forces et frontières fermées
        r = await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), o = g.players[1];
          Game.contact(g, me.id, o.id); Diplomacy.setState(g, me.id, o.id, 'peace');
          const c = g.cities[me.fortress]; const [x, y] = World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y) && !Units.at(g, 0, x, y).length);
          window._sc = Units.create(g, 'HighMenScouts', o.id, 0, x, y).id; UI.closeAll(); Panels.wizards();
          return { table: (document.querySelector('.modal .sect table') || {}).innerText }; }""")
        print('FORCES', r['table'])
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Interdire le territoire'); b.click(); }")
        await pg.wait_for_timeout(300)
        print('FRONTIERES', await pg.evaluate("() => { const g = App.game, u = g.units[_sc]; return { owner: World.get(g.world, u.plane, 'owner', u.x, u.y), bouton: [...document.querySelectorAll('.modal button')].some(b => b.textContent === 'Rouvrir le territoire') }; }"))
        await pg.evaluate("() => { UI.closeAll(); MagicUI.magic(); }"); await pg.wait_for_timeout(300)
        print('REBELLES', await pg.evaluate("[...document.querySelectorAll('.modal div')].map(d => d.textContent).find(t => t.startsWith('Rebelles dans'))"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
