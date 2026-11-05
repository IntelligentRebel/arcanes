"""v0.25.0 : le Bélier (production, figurine, assaut des tours) et les sorts de siège dans le grimoire de combat."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 940})
        errors = []; pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e) + ' ' + str(e.stack)[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 99, opponents: 2, difficulty: 'normal', crisis: 'off', human: { name: 'Morwen', portrait: 3, books: { life: 4, death: 3, sorcery: 3 }, retorts: [], race: 'orc' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('SPRITE', await pg.evaluate("({ ram: Sprites.hasHD('unit:BatteringRam'), size: Sprites.hdMap['unit:BatteringRam'], icons: ['jericho_trumpets', 'haunted_ramparts', 'flux_rupture'].map(id => !!Sprites.resolve('spell:' + id)) })"))
        # le bélier dans la liste de production de la capitale (Caserne + Maison des bâtisseurs)
        await pg.evaluate("""() => { const c = App.game.cities[App.me().fortress]; c.buildings.buildersHall = true; CityUI.open(c.id); setTimeout(() => CityUI.chooseProduction(), 300); }""")
        await pg.wait_for_timeout(1200)
        print('PRODUCTION', await pg.evaluate("[...document.querySelectorAll('.modal .row')].map(r => r.innerText.split('\\n')[0]).filter(t => /Bélier|Catapulte/.test(t))"))
        await pg.screenshot(path=os.path.join(SHOTS, '280-ram-production.png'))
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(400); await pg.evaluate("UI.closeAll()")
        # siège avec béliers et sorts de siège
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(), foe = g.players[1], c = g.cities[foe.fortress];
          c.buildings.cityWalls = true; c.buildings.defenseTowers = true;
          for (const u of Units.at(g, c.plane, c.x, c.y)) Units.remove(g, u);
          const D = ['Spearmen', 'Bowmen'].map(t => Object.keys(DATA.units).find(k => DATA.units[k].race === foe.race && k.endsWith(t))).filter(Boolean).map(t => Units.create(g, t, foe.id, c.plane, c.x, c.y));
          const A = ['OrcSwordsmen', 'OrcSwordsmen', 'OrcSwordsmen', 'BatteringRam', 'BatteringRam'].map(t => Units.create(g, t, pl.id, c.plane, c.x, c.y));
          pl.known.push('jericho_trumpets', 'haunted_ramparts', 'flux_rupture'); pl.mana = 300; pl.skillPoints = 900;
          const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: pl.id, defenderPid: foe.id, plane: c.plane, x: c.x, y: c.y, city: c, rng: new RNG(5) });
          window._bt = bt; CombatView.run(g, bt, { city: c }); return { towers: bt.towers.map(t => t.kind + ' ' + t.hp), skill: bt.skillLeft[0] }; }""")
        print('SIEGE', r)
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); btn && btn.click(); }""")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=os.path.join(SHOTS, '281-ram-siege.png'))
        # grimoire de combat : les trois sorts de siège
        await pg.evaluate("CombatView.spellMenu()"); await pg.wait_for_timeout(500)
        print('GRIMOIRE', await pg.evaluate("[...document.querySelectorAll('.modal .row')].map(r => r.innerText.split('\\n')[0] + (r.classList.contains('dis') ? ' (grisé)' : '')).filter(t => /Trompettes|Hantise|Rupture/.test(t))"))
        await pg.screenshot(path=os.path.join(SHOTS, '282-siege-spells.png'))
        await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""async () => { const bt = window._bt; const ok = CombatSpells.cast(bt, ATT_SIDE, 'jericho_trumpets', null, null); await CombatView.playEvents();
          const ram = bt.units.find(b => b.u.type === 'BatteringRam'), foe = bt.alive(DEF_SIDE)[0];
          return { cast: ok, towers: bt.towers.map(t => t.kind + ' ' + t.hp), broken: Object.values(bt.walls).filter(w => w.broken).length, canHitUnit: bt.canMelee(ram, foe), log: bt.log.slice(-4) }; }""")
        print('JERICHO', r)
        await pg.evaluate("CombatView.toggleAuto()")
        for _ in range(150):
            await pg.wait_for_timeout(300)
            t = await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ')")
            if 'Victoire' in t or 'Défaite' in t: break
        print('FIN', (await pg.evaluate("[...document.querySelectorAll('.modal')].map(m => m.innerText).join(' ')")).replace('\n', ' | ')[:400])
        print('JOURNAL', await pg.evaluate("window._bt.log.filter(l => /Bélier|tour/.test(l)).slice(0, 8)"))
        await pg.screenshot(path=os.path.join(SHOTS, '283-ram-end.png'))
        print('ERRORS', len(errors))
        for e in errors[:6]: print('  ', e[:400])
        await b.close()

asyncio.run(main())
