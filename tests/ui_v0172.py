"""v0.17.2 : verrou des sceptres, rivière (eau profonde et gués), taille des héros et colons, colons civils."""
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
        await pg.evaluate("""() => {
          window.AUTO_CHOICE = true;
          document.querySelector('.title-screen').remove();
          const g = Game.newGame({ seed: 7, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: ['sageMaster'], race: 'lizardman' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()")
        # 1. sceptres : verrouiller la compétence, tirer la mana
        await pg.evaluate("void MagicUI.magic()")
        await pg.wait_for_timeout(500)
        cvs = await pg.query_selector_all('.staves canvas')
        boxes = [await c.bounding_box() for c in cvs]
        before = await pg.evaluate("({ ...App.me().powerSplit })")
        sk = boxes[2]
        await pg.mouse.click(sk['x'] + sk['width'] / 2, sk['y'] + 40)  # tête du sceptre de compétence
        await pg.wait_for_timeout(200)
        lock = await pg.evaluate("App.me().powerLock")
        mb = boxes[0]
        await pg.mouse.move(mb['x'] + 52, mb['y'] + 200); await pg.mouse.down()
        await pg.mouse.move(mb['x'] + 52, mb['y'] + 110, steps=6); await pg.mouse.up()
        await pg.wait_for_timeout(300)
        after = await pg.evaluate("({ ...App.me().powerSplit })")
        # tirer le sceptre verrouillé : sans effet
        await pg.mouse.move(sk['x'] + 52, sk['y'] + 240); await pg.mouse.down(); await pg.mouse.move(sk['x'] + 52, sk['y'] + 120, steps=4); await pg.mouse.up()
        await pg.wait_for_timeout(200)
        after2 = await pg.evaluate("({ ...App.me().powerSplit })")
        await pg.screenshot(path=os.path.join(SHOTS, '160-staves-lock.png'), clip={'x': 250, 'y': 60, 'width': 900, 'height': 560})
        print('STAVES', before, 'lock', lock, '->', after, 'locked drag', after2, 'sum', sum(after.values()))
        await pg.mouse.click(sk['x'] + sk['width'] / 2, sk['y'] + 40)
        print('UNLOCK', await pg.evaluate("App.me().powerLock"))
        await pg.evaluate("UI.closeAll()")
        # 2. colons : PV de civils
        print('SETTLER HP', await pg.evaluate("['HighMenSettlers','LizardSettlers','TrollSettlers','DwarfSettlers'].map(t => t + ' ' + Units.baseHp(DATA.units[t]))"))
        # 3. combat sur une rivière : eau profonde infranchissable pour les piétons, gués praticables, nageurs libres
        info = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), w = g.world, foe = g.players[1];
          pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
          let at = null;
          for (let y = 3; y < w.h - 3 && !at; y++) for (let x = 0; x < w.w && !at; x++) {
            if (World.terr(w, 0, x, y) !== T.RIVER || Cities.at(g, 0, x, y) || World.get(w, 0, 'site', x, y) >= 0 || Units.at(g, 0, x, y).length) continue;
            for (const [nx, ny] of World.neighbors(w, x, y)) if (!World.isWaterAt(w, 0, nx, ny) && World.terr(w, 0, nx, ny) !== T.MOUNTAIN && !Units.at(g, 0, nx, ny).length && !Cities.at(g, 0, nx, ny) && World.get(w, 0, 'site', nx, ny) < 0) { at = [x, y, nx, ny]; break; }
          }
          ['HighMenSwordsmen', 'HighMenSpearmen'].forEach(t => Units.create(g, t, foe.id, 0, at[0], at[1]));
          const ids = ['LizardSpearmen', 'LizardSettlers', 'HeroValana', 'HighMenSwordsmen'].map(t => Units.create(g, t, pl.id, 0, at[2], at[3]).id);
          for (const id of ids) g.units[id].moves = 2;
          Move.revealAllFor(g, pl); MapView.centerOn(at[0], at[1], 0);
          App.selectTile(0, at[2], at[3], ids);
          void App.moveSelected(at[0], at[1]);
          return at;
        }""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("UI.closeAll()")
        st = await pg.evaluate("""() => {
          const bt = CombatView.bt; if (!bt) return null;
          const deep = Object.keys(bt.river).filter(k => !bt.ford[k]);
          const res = {};
          for (const b of bt.alive(bt.side)) {
            const s = bt.stats(b); const m0 = b.moves, c0 = b.c, r0 = b.r;
            const [dc, dr] = deep[Math.floor(deep.length / 2)].split(',').map(Number);
            const land = U.DIRS8.map(([a, z]) => [dc + a, dr + z]).find(([c, r]) => c >= 0 && r >= 0 && c < CW && r < CH && !bt.inRiver(c, r) && !bt.blocked(c, r) && !bt.unitAt(c, r));
            b.c = land[0]; b.r = land[1]; b.moves = 4; const r = bt.reachable(b); b.moves = m0; b.c = c0; b.r = r0;
            res[b.u.type] = { swims: !!s.swimming, deepReach: deep.filter(k => r.has(k)).length };
          }
          // un piéton loin du gué : la distance de marche contourne l'eau
          const fords = Object.keys(bt.ford);
          return { river: Object.keys(bt.river).length, fords, res };
        }""")
        print('RIVER', info, st)
        await pg.screenshot(path=os.path.join(SHOTS, '161-river-fords.png'))
        # survol d'une case d'eau profonde
        pt = await pg.evaluate("""() => { const bt = CombatView.bt; const k = Object.keys(bt.river).find(k => !bt.ford[k] && !bt.unitAt(...k.split(',').map(Number))); const [c, r] = k.split(',').map(Number); const p = CombatView.iso(c, r); const rect = CombatView.cv.getBoundingClientRect(); return [rect.left + p.x, rect.top + p.y]; }""")
        await pg.mouse.move(pt[0], pt[1] - 2); await pg.mouse.move(pt[0], pt[1]); await pg.wait_for_timeout(300)
        print('PANEL', await pg.evaluate("(() => { const e = document.querySelector('#c-right'); return e ? e.textContent.slice(0, 160) : null; })()"))
        # combat automatique : les piétons doivent franchir par les gués
        await pg.evaluate("(() => { if (CombatView.bt && !CombatView.auto) CombatView.toggleAuto(); })()")
        for _ in range(120):
            await pg.wait_for_timeout(250)
            if await pg.evaluate("!CombatView.active || CombatView.finished"):
                break
        bad = await pg.evaluate("""() => { const bt = CombatView.bt; if (!bt) return 'no bt'; return bt.units.filter(b => !b.dead && bt.deep(b.c, b.r) && !bt.wades(bt.stats(b))).map(b => b.u.type); }""")
        print('FINI', await pg.evaluate("!CombatView.active || CombatView.finished"), 'pietons en eau profonde', bad)
        await pg.evaluate("UI.closeAll()")
        print('ERRORS', len(errors))
        for e in errors[:10]: print('  ', e)
        await b.close()

asyncio.run(main())
