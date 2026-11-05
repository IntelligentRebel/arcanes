"""v0.25.26 : la précision au-delà de 100 % perce la défense (talent, fiche du héros, bulle de tir) ; tours restants de l'incantation."""
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

        # 1. talent : Super maître lame à 130 %
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(), c = g.cities[pl.fortress];
          const h = Heroes.spawn(g, pl, DATA.heroes.HeroRakir, c.plane, c.x, c.y); window._h = h.id;
          h.xp = 600; h.hero.pending = []; h.hero.extra = h.hero.extra || {}; h.hero.extra.blademaster = true;
          h.items = [{ kind: 'sword', slot: 'melee', name: 'Épée du Matin', melee: 5, toHit: 3, def: 3, powers: [], icon: 'item:sword', value: 400 }, null, null];
          h.hero.pending = [{ level: 7, opts: ['blademaster', 'agility'] }];
          window.AUTO_CHOICE = false; void App.talentPrompts(); return Units.stats(g, h).toHit; }""")
        await pg.wait_for_timeout(500)
        print('PRECISION', r)
        print('TALENT', await pg.evaluate("[...document.querySelectorAll('.modal .box')].map(b => b.innerText.replace(/\\n/g, ' | '))"))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'talent.png'))
        await pg.evaluate("document.querySelector('.modal .btn.primary').click()"); await pg.wait_for_timeout(400)
        await pg.evaluate("window.AUTO_CHOICE = true; UI.closeAll()")
        r = await pg.evaluate("() => { const u = App.game.units[_h], s = Units.stats(App.game, u); return { talents: u.hero.talents, precision: s.toHit, perce: Units.pierce(s.toHit), force: Units.strength(App.game, u) }; }")
        print('CHOISI', r)
        # 2. fiche du héros et ligne de caractéristiques
        await pg.evaluate("() => Panels.heroSheet(App.game.units[_h])"); await pg.wait_for_timeout(400)
        print('FICHE', await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); const r = [...m.querySelectorAll('.hs-stat')].find(e => e.textContent.includes('Précision')); return r ? r.innerText.replace(/\\n/g, ' ') : null; })()"))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'sheet.png'))
        await pg.evaluate("UI.closeAll()")
        print('LIGNE', await pg.evaluate("(() => { const d = document.createElement('div'); d.innerHTML = UI.statLine(Units.stats(App.game, App.game.units[_h]), App.game.units[_h], App.game); const s = [...d.querySelectorAll('.stat')].pop(); return s.textContent + ' | ' + s.title; })()"))
        # moteur : défense effective et dégâts moyens d'une mêlée, avec et sans le surplus
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const h = App.game.units[_h], d = Units.create(g, 'Paladin', foe.id, 0, x, y);
          const bt = new Battle(g, { attackers: [h], defenders: [d], attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(1) });
          const A = bt.units.find(b => b.u === h), D = bt.units.find(b => b.u === d);
          const m = bt.meleeMods(A, D), def0 = bt.stats(D).def;
          const e1 = CombatAI.expMelee(bt, A, D, false); const keep = Units.pierce; Units.pierce = () => 0; const e0 = CombatAI.expMelee(bt, A, D, false); Units.pierce = keep;
          Units.remove(g, d); return { defense: def0, perce: m.pierce, effective: bt.defFor(D, 'melee', null, m), degatsAvec: e1.toFixed(2), degatsSans: e0.toFixed(2), riposte: bt.meleeMods(D, A, true).pierce }; }""")
        print('MELEE', r)

        # 3. grimoire : l'incantation en cours et les tours qui restent
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(); if (!pl.known.includes('angel')) pl.known.push('angel');
          pl.mana = 1113; pl.skillLeft = Magic.totalSkill(g, pl); pl.casting = { id: 'angel', target: null, progress: 300, cost: 385 };
          MagicUI.spellbook(); const m = [...document.querySelectorAll('.modal')].pop();
          return { tete: m.querySelector('.book .muted') ? [...m.querySelectorAll('div')].find(d => d.textContent.startsWith('En cours')).innerText : null, competence: Magic.totalSkill(g, pl), tours: Spells.castingTurns(g, pl) }; }""")
        print('GRIMOIRE', r)
        await pg.wait_for_timeout(500)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'grimoire.png'))
        await pg.evaluate("UI.closeAll()")
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(); const out = [];
          pl.casting = { id: 'angel', target: null, progress: 380, cost: 385 }; out.push(Spells.castingTurnsText(g, pl));
          pl.casting = { id: 'angel', target: null, progress: 0, cost: 385 }; pl.mana = 0; const keep = Magic.manaPerTurn; Magic.manaPerTurn = () => 0; out.push(Spells.castingTurnsText(g, pl)); Magic.manaPerTurn = keep;
          out.push(App.skillTip().replace(/<[^>]+>/g, ' ')); pl.casting = null; pl.mana = 1113; return out; }""")
        print('TEXTES', r)

        # 4. bulle de tir d'un archer à plus de 100 %
        await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], fc = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, fc.x, fc.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const a = Heroes.spawn(g, me, DATA.heroes.HeroAlorra, 0, x, y); a.xp = 600; a.hero.pending = []; a.hero.extra = a.hero.extra || {}; a.hero.extra.superBlademaster = true;
          a.items = [{ kind: 'bow', slot: 'ranged', name: 'Arc du Soir', ranged: 4, toHit: 3, def: 2, powers: [], icon: 'item:bow', value: 400 }, null, null];
          const z = Units.create(g, 'HighMenSpearmen', me.id, 0, x, y), d = Units.create(g, 'Paladin', foe.id, 0, x, y);
          window._bt = new Battle(g, { attackers: [a, z], defenders: [d], attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(5) });
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(600)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        r = await pg.evaluate("""() => { const a = _bt.alive(CombatView.humanSide).find(b => b.u.hero), d = _bt.alive(1 - CombatView.humanSide)[0];
          a.c = 4; a.r = 8; d.c = 8; d.r = 4; CombatView.pos[a.id].c = 4; CombatView.pos[a.id].r = 8; CombatView.pos[d.id].c = 8; CombatView.pos[d.id].r = 4;
          a.moves = a.maxMoves; CombatView.sel = a; CombatView.hover = { c: d.c, r: d.r }; CombatView._fcKey = null; CombatView.draw();
          const f = CombatView._fc; return f ? { precision: _bt.stats(a).toHit, affiche: f.toHit, perce: f.pierce, degats: f.dmg.toFixed(2), rate: f.zero.toFixed(2) } : null; }""")
        print('TIR', r)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'shot.png'))
        await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
