"""v0.25.28 : logements et biens de commerce chiffrés dans le choix de production ; plus de logements à la population maximale."""
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
        rows = "(() => { const m = [...document.querySelectorAll('.modal')].pop(); return [...m.querySelectorAll('.row')].filter(r => /Logements|Biens de commerce/.test(r.textContent)).map(r => r.innerText.replace(/\\n/g, ' | ')); })()"
        # cité qui peut grandir
        r = await pg.evaluate("() => { const g = App.game, c = g.cities[App.me().fortress]; const e = Cities.econ(g, c); CityUI.open(c.id); CityUI.chooseProduction(); return { citoyens: Cities.citizens(c), max: e.maxPop, croissance: e.growth, prod: e.prod }; }")
        await pg.wait_for_timeout(400)
        print('CITE', r)
        print('CHOIX', await pg.evaluate(rows))
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); m.querySelector('.list').scrollTop = 1e6; }")
        await pg.wait_for_timeout(200)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'housing.png'))
        # logements en cours : le texte de la production
        await pg.evaluate("() => { UI.closeAll(); const c = App.game.cities[App.me().fortress]; Cities.setProduction(App.game, c, { type: 'housing' }); CityUI.open(c.id); }")
        await pg.wait_for_timeout(300)
        print('EN COURS', await pg.evaluate("document.querySelector('.prodbox').innerText.replace(/\\n/g, ' | ')"))
        # population maximale : plus de logements proposés, et la cité passe d'elle-même au commerce
        r = await pg.evaluate("""() => { UI.closeAll(); const g = App.game, c = g.cities[App.me().fortress]; const e = Cities.econ(g, c); c.pop = e.maxPop * 1000 + 500;
          CityUI.open(c.id); const txt = document.querySelector('.prodbox').innerText.replace(/\\n/g, ' | '); CityUI.chooseProduction(); return { citoyens: Cities.citizens(c), max: Cities.econ(g, c).maxPop, enCours: txt }; }""")
        await pg.wait_for_timeout(300)
        print('PLEINE', r, await pg.evaluate(rows))
        r = await pg.evaluate("() => { UI.closeAll(); const g = App.game, me = App.me(), c = g.cities[me.fortress]; const n = g.log.length; Turn.processCity(g, c, me); return { prod: c.prod.type, journal: g.log.slice(n).map(l => l.text).filter(t => t.includes('logements')) }; }")
        print('TOUR', r)
        # plusieurs cités : la ligne Logements disparaît pour une cité pleine
        r = await pg.evaluate("() => { const g = App.game, c = g.cities[App.me().fortress]; const o = Panels.multiOptions([c]); return o.other.map(x => x.name); }")
        print('MULTI', r)
        # combat : Trait de feu et Boule de feu visés, les dégâts attendus au-dessus de la cible et dans le panneau
        await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
          for (const s of ['fire_bolt', 'fireball', 'warp_lightning']) if (!me.known.includes(s)) me.known.push(s); me.mana = 500;
          const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const a = Units.create(g, 'HighMenSwordsmen', me.id, 0, x, y), d = Units.create(g, 'HighMenSpearmen', foe.id, 0, x, y), d2 = Units.create(g, 'Paladin', foe.id, 0, x, y);
          window._bt = new Battle(g, { attackers: [a], defenders: [d, d2], attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(5) });
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(600)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        for sp in ['fire_bolt', 'fireball', 'warp_lightning']:
            r = await pg.evaluate("""(sp) => { const t = _bt.alive(1 - CombatView.humanSide).find(b => b.u.type === 'HighMenSpearmen');
              CombatView.mode = { id: sp, caster: null, tt: 'enemyUnit' }; CombatView.hover = { c: t.c, r: t.r }; CombatView._spfc = null; CombatView.draw();
              const od = CombatView._spfc && CombatView._spfc.od; const d = document.createElement('div'); d.innerHTML = CombatView.oddsHtml(t);
              return { degats: od && od.dmg != null ? od.dmg.toFixed(2) : null, sansEffet: od && od.zero, detruite: od && od.kill, panneau: d.innerText.replace(/\\n/g, ' | ') }; }""", sp)
            print('SORT', sp, r)
            if SHOTS and sp == 'fire_bolt': await pg.screenshot(path=os.path.join(SHOTS, 'firebolt.png'))
        r = await pg.evaluate("""() => { const t = _bt.alive(1 - CombatView.humanSide).find(b => b.u.type === 'Paladin'); CombatView.mode = { id: 'fire_bolt', caster: null, tt: 'enemyUnit' };
          const d = document.createElement('div'); d.innerHTML = CombatView.oddsHtml(t); return d.innerText.replace(/\\n/g, ' | '); }""")
        print('PALADIN', r)
        # puissance : le réglage apparaît, la prévision suit, le coût aussi ; le sort part avec son supplément
        r = await pg.evaluate("""() => { const side = CombatView.humanSide, me = App.me(); _bt.skillLeft[side] = 60; me.mana = 500; _bt.castThisRound[side] = false;
          if (!me.known.includes('counter_magic')) me.known.push('counter_magic');
          CombatView.mode = null; CombatView.prepareCast('fire_bolt', null); CombatView.draw();
          const t = _bt.alive(1 - side).find(b => b.u.type === 'HighMenSpearmen'); CombatView.hover = { c: t.c, r: t.r }; CombatView._spfc = null; CombatView.draw();
          const a = CombatView._spfc.od.dmg, panel = document.querySelector('#c-power') && document.querySelector('#c-power').innerText.replace(/\\n/g, ' ');
          CombatView.setPower(20); CombatView.draw(); const b = CombatView._spfc.od.dmg, panel2 = document.querySelector('#c-power-txt').textContent;
          return { max: CombatView.mode.maxExtra, base: a.toFixed(2), plein: b.toFixed(2), reglage: panel, reglage20: panel2 }; }""")
        print('PUISSANCE', r)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'power.png'))
        r = await pg.evaluate("""async () => { const side = CombatView.humanSide, me = App.me(), t = _bt.alive(1 - side).find(b => b.u.type === 'HighMenSpearmen');
          const m0 = me.mana, s0 = _bt.skillLeft[side], hp0 = _bt.hp(t);
          CombatView.useTarget({ c: t.c, r: t.r }, t); await new Promise(r => setTimeout(r, 1500));
          return { mana: m0 - me.mana, competence: s0 - _bt.skillLeft[side], degats: hp0 - _bt.hp(t), journal: _bt.log.slice(-3), reglageParti: !document.querySelector('#c-power') }; }""")
        print('LANCE', r)
        await pg.wait_for_function("() => !CombatView.busy", timeout=20000)
        # Contre-magie : la puissance se règle dans une fenêtre avant de lancer
        r = await pg.evaluate("""async () => { const side = CombatView.humanSide; _bt.castThisRound[side] = false; _bt.skillLeft[side] = 60;
          CombatView.prepareCast('counter_magic', null); const m = [...document.querySelectorAll('.modal')].pop(); const rg = m.querySelector('input[type=range]');
          rg.value = 15; rg.dispatchEvent(new Event('input')); const txt = m.innerText.replace(/\\n/g, ' | ');
          [...m.querySelectorAll('button')].find(b => b.textContent === 'Lancer').click(); await new Promise(r => setTimeout(r, 1200));
          return { fenetre: txt.slice(0, 300), reserve: _bt.counterMagic[side] }; }""")
        print('CONTRE', r)
        await pg.evaluate("() => { CombatView.mode = null; CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
