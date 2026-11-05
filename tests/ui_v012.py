"""v0.12 : trouvailles sans gardiens (carte, info de case, ramassage par l'éclaireur), bouton Soigner dans les cités,
fin de bataille dès que le dernier ennemi tombe."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        info = await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 21, opponents: 2, human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = App.me(), c = g.cities[pl.fortress];
          // tout le voisinage exploré pour la capture d'écran
          Move.reveal(g, pl, c.plane, c.x, c.y, 9); MapView.invalidateVis(); MapView.bumpVis();
          MapView.ts = 64; MapView.centerOn(c.x, c.y, c.plane);
          const near = g.caches.filter(k => k.plane === c.plane && World.dist(g.world, k.x, k.y, c.x, c.y) <= 9).map(k => [k.kind, k.x, k.y, World.dist(g.world, k.x, k.y, c.x, c.y)]);
          window._c = c;
          return { total: g.caches.length, near };
        }""")
        print('CACHES', info)
        await pg.wait_for_timeout(2600)
        await pg.evaluate("UI.closeAll()")
        await pg.screenshot(path=os.path.join(SHOTS, '100-caches-map.png'))
        k0 = info['near'][0]
        print('TILEINFO', await pg.evaluate(f"App.tileInfoHtml(0, {k0[1]}, {k0[2]}).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ')"))
        # l'éclaireur va chercher la trouvaille la plus proche
        r = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), sc = Object.values(g.units).find(u => u.owner === pl.id && Units.isScout(u));
          const t = Move.nearestCache(g, [sc], 10); if (!t) return null;
          sc.moves = 20;
          App.selectTile(sc.plane, sc.x, sc.y, [sc.id]);
          window._gold0 = pl.gold; window._mv = App.moveSelected(t[0], t[1]);
          MapView.centerOn(t[0], t[1], sc.plane);
          return t;
        }""")
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=os.path.join(SHOTS, '101-cache-pickup.png'))
        await pg.wait_for_timeout(1000)
        print('PICKUP', r, await pg.evaluate("App.game.log.filter(e => /Trouvaille/.test(e.text)).map(e => e.text)"))
        # soins : lancier blessé dans la capitale
        h = await pg.evaluate("""() => {
          const g = App.game, c = window._c, pl = App.me();
          const u = Units.at(g, c.plane, c.x, c.y).find(x => x.owner === pl.id && DATA.units[x.type].en === 'Spearmen');
          u.dmg = Units.stats(g, u).maxHp - 1; u.status = ''; u.moves = 2;
          UI.closeAll(); App.selectTile(c.plane, c.x, c.y, [u.id]);
          const btn = [...document.querySelectorAll('.actions .abtn')].find(b => /Soigner/.test(b.textContent));
          if (btn) btn.click();
          window._hu = u.id;
          return { button: !!btn, status: u.status, hp: Units.health(g, u) + '/' + Units.stats(g, u).maxHp };
        }""")
        print('HEAL', h)
        for t in range(12):
            st = await pg.evaluate("(() => { const u = App.game.units[window._hu]; return [u.status, Units.health(App.game, u)]; })()")
            if st[0] != 'heal':
                break
            await pg.evaluate("UI.closeAll(); void App.endTurn(true)")
            await pg.wait_for_timeout(400)
            for _ in range(60):
                await pg.wait_for_timeout(250)
                await pg.evaluate("UI.closeAll()")
                if not await pg.evaluate("UI.busy"):
                    break
            await pg.evaluate("UI.closeAll()")
        print('HEALED after', t, 'tours :', await pg.evaluate("(() => { const u = App.game.units[window._hu]; return [u.status || '-', Units.health(App.game, u), Units.stats(App.game, u).maxHp]; })()"),
              await pg.evaluate("App.game.log.filter(e => /soins terminés/.test(e.text)).map(e => e.text).slice(-1)"))
        # bataille : le dernier ennemi tombe alors qu'il reste des unités à jouer
        await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), c = window._c, w = g.world;
          UI.closeAll();
          let spot = null;
          for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, 3]]) { const x = World.wx(w, c.x + dx), y = c.y + dy; if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { spot = [x, y]; break; } }
          const foe = g.players[1]; pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          let tgt = null; for (const [x, y] of World.neighbors(w, spot[0], spot[1])) if (!World.isWaterAt(w, 0, x, y) && World.terr(w, 0, x, y) !== T.MOUNTAIN && !Units.at(g, 0, x, y).length && !Cities.at(g, 0, x, y)) { tgt = [x, y]; break; }
          const ids = []; for (let i = 0; i < 4; i++) ids.push(Units.create(g, 'HighMenSwordsmen', pl.id, 0, spot[0], spot[1]).id);
          const e = Units.create(g, 'BarbarianSpearmen', foe.id, 0, tgt[0], tgt[1]);
          for (const id of ids) g.units[id].moves = 2;
          Move.revealAllFor(g, pl);
          App.selectTile(0, spot[0], spot[1], ids);
          window._fight = App.moveSelected(tgt[0], tgt[1]);
        }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()")
        res = await pg.evaluate("""async () => {
          const bt = CombatView.bt; if (!bt) return 'pas de combat';
          // tour du joueur : une unité se place au contact de l'unique ennemi, très affaibli, et frappe
          for (let i = 0; i < 40 && (bt.side !== CombatView.humanSide || CombatView.busy); i++) await new Promise(r => setTimeout(r, 150));
          const mine = bt.alive(CombatView.humanSide), foes = bt.alive(1 - CombatView.humanSide);
          const d = foes[0], a = mine[0];
          d.u.dmg = Units.stats(App.game, d.u).maxHp - 1;
          a.c = d.c + (d.c > 0 ? -1 : 1); a.r = d.r; a.moves = a.maxMoves;
          const before = mine.filter(b => b.moves > 0).length;
          await CombatView.act(() => bt.melee(a, d));
          await new Promise(r => setTimeout(r, 300));
          return { over: bt.over, winner: bt.winner === CombatView.humanSide, finished: CombatView.finished, ownWithMovesBefore: before, ownWithMovesAfter: bt.alive(CombatView.humanSide).filter(b => b.moves > 0).length };
        }""")
        print('BATTLE', res)
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=os.path.join(SHOTS, '102-battle-end.png'))
        await pg.evaluate("UI.closeAll()")
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
