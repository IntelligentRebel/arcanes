"""v0.27.4 : les éclaireurs en exploration automatique entrent dans les lieux inexplorés (fenêtre de repérage) et ne se
regroupent plus ; un rival qui lance un enchantement global est annoncé."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = '/home/claude/arcanes'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:300]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 33, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # deux éclaireurs en exploration, partis de la capitale
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          for (let i = 0; i < 2; i++) { const u = Units.create(g, 'HighMenScouts', me.id, c.plane, c.x, c.y); u.moves = Units.maxMoves(g, u); }
          const sc = Object.values(g.units).filter(u => u.owner === me.id && u.type === 'HighMenScouts');
          App.selectTile(c.plane, c.x, c.y, sc.map(u => u.id)); window._sc = sc.map(u => u.id);
          for (const u of sc) { App.explore([u]); } }""")
        await pg.wait_for_timeout(1500)
        for turn in range(6):
            # fenêtres : on note le repérage et on répond « Repartir »
            for _ in range(6):
                m = await pg.evaluate("() => { const ms = [...document.querySelectorAll('.modal')]; return ms.length ? ms.map(m => m.innerText.replace(/\\n+/g, ' | ').slice(0, 120)).join(' ### ') : null; }")
                if m: print('  MODALES', m)
                if not m: break
                if 'découvre' in m:
                    await pg.click('.modal footer button:has-text("Repartir")')
                else:
                    await pg.evaluate("UI.closeAll()")
                await pg.wait_for_timeout(500)
            st = await pg.evaluate("""() => { const g = App.game, me = App.me(); return _sc.map(id => { const u = g.units[id]; if (!u) return 'mort';
              const si = World.neighbors(g.world, u.x, u.y).map(([x, y]) => World.get(g.world, u.plane, 'site', x, y)).filter(i => i >= 0).map(i => g.sites[i]).filter(s => Game.isLair(s));
              return [u.x, u.y, u.status, u.moves, si.map(s => Game.siteName(s) + (Game.siteKnown(me, s) ? '(connu)' : '(inconnu)' + (Game.siteHasGuardians(s) ? ' gardé' : ''))).join('/')].join(' '); }); }""")
            print('T', await pg.evaluate("App.game.turn"), st, await pg.evaluate("() => { const g = App.game, us = _sc.map(id => g.units[id]).filter(Boolean); return { front: Move.nearestFrontier(g, us), lair: (App.lairToScout(us, 10) || {}).id, attente: App.pendingScouts }; }"))
            await pg.evaluate("() => { App.endTurn(); }")
            for _ in range(60):
                await pg.wait_for_timeout(500)
                busy = await pg.evaluate("() => UI.busy || App.moving")
                modal = await pg.evaluate("() => !!document.querySelector('.modal')")
                if not busy or modal: break
        # un rival lance un enchantement global : annonce
        r = await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), o = g.players[1]; me.contact[o.id] = true; o.contact[me.id] = true;
          o.mana = 2000; Spells.apply(g, o, 'just_cause', null); return o.globals; }""")
        await pg.wait_for_timeout(1200)
        print('ANNONCE', r, await pg.evaluate("() => { const m = document.querySelector('.contact-modal'); return m ? m.innerText.replace(/\\n+/g, ' | ') : null; }"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()
asyncio.run(main())
