"""v0.31.54, retours du forum (#18 à #21) : le navire d'une pile embarquée, la précision du héros qui ne se coupe plus,
« Suivante » qui ne fait plus A-B-A-B, l'export manuel horodaté, la cité offerte qu'on peut regarder sans que les fenêtres
la cachent, l'erreur qui reste affichée, la magie du sorcier en bataille et le coup d'œil au champ de bataille avant le résultat,
le double-clic plus tolérant."""
import asyncio, os, sys, http.server, threading, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
async def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist', 'arcanes')))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(2500)
        await pg.evaluate("""() => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {}; Music.jingle = () => true;
          const g = Game.newGame({ seed: 6, mapW: 60, mapH: 40, opponents: 3, otherPlane: 0, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 9, books: { nature: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # 1. le navire d'une pile embarquée
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), w = g.world; let at = null;
          for (let y = 2; y < w.h - 2 && !at; y++) for (let x = 0; x < w.w && !at; x++) if (World.terr(w, 0, x, y) === T.OCEAN && !Units.at(g, 0, x, y).length) at = [x, y];
          const ship = Units.create(g, 'Galley', me.id, 0, at[0], at[1]); const hero = Heroes.spawn(g, me, DATA.heroes.HeroBahgtru, 0, at[0], at[1], 300);
          const top = MapView.topUnit(Units.at(g, 0, at[0], at[1])); const land = MapView.topUnit([hero]); delete g.units[ship.id]; delete g.units[hero.id];
          return { top: top.type, land: land.type }; }""")
        ok(r['top'] == 'Galley' and r['land'] == 'HeroBahgtru', 'en mer, la pile montre son navire (%s)' % r)
        # 2. la précision du héros : la valeur d'un seul tenant, les précisions dans leur colonne
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), cap = Object.values(g.cities).find(c => c.owner === me.id);
          const hero = Heroes.spawn(g, me, DATA.heroes.HeroBahgtru, cap.plane, cap.x, cap.y, 700); hero.items = [{ kind: 'axe', slot: 'melee', name: 'H', melee: 5, toHit: 2, powers: [], icon: 'item:axe' }, null, null];
          Panels.heroSheet(hero); const rows = [...document.querySelectorAll('.hs-stat')]; const acc = rows.find(x => /Précision/.test(x.textContent));
          const bEl = acc && acc.querySelector(':scope > b'); const out = { val: bEl ? bEl.textContent : null, lines: bEl ? Math.round(bEl.getBoundingClientRect().height / 14) : 0, ex: !!(acc && acc.querySelector('.ex')) };
          UI.closeAll(); delete g.units[hero.id]; return out; }""")
        ok(r['val'] and r['lines'] <= 1 and r['ex'], 'précision du héros sur une ligne (%s)' % r)
        # 3. « Suivante » parcourt trois piles voisines sans aller-retour
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), cap = Object.values(g.cities).find(c => c.owner === me.id);
          for (const u of Object.values(g.units)) if (u.owner === me.id) u.moves = 0;
          const spots = []; for (let dx = -3; dx <= 3 && spots.length < 3; dx++) { const x = World.wx(g.world, cap.x + dx), y = cap.y + 2; if (!World.isWaterAt(g.world, cap.plane, x, y) && !Cities.at(g, cap.plane, x, y)) spots.push([x, y]); }
          const made = spots.map(([x, y]) => Units.create(g, 'HighMenSpearmen', me.id, cap.plane, x, y));
          App.selectTile(cap.plane, made[0].x, made[0].y); const seen = [made[0].id];
          for (let i = 0; i < 3; i++) { App.selectNext(false, null, true); seen.push(App.sel ? App.sel.ids[0] : null); }
          for (const u of made) delete g.units[u.id]; return seen; }""")
        ok(len(set(r[:3])) == 3, '« Suivante » fait le tour des trois piles : %s' % r)
        # 4. l'export manuel porte l'heure
        r = await pg.evaluate("""async () => { const d = App.download; let name = null; App.download = f => { name = f; }; const p = App.prefs.saveDir; App.prefs.saveDir = null;
          await App.exportSave(true, true); const manual = name; await App.exportSave(false); const auto = name; App.download = d; App.prefs.saveDir = p; return { manual, auto }; }""")
        ok(r['manual'] != r['auto'] and r['manual'].startswith(r['auto'][:-5] + '-'), 'export manuel horodaté : %s / %s' % (r['manual'], r['auto']))
        # 5. la cité offerte : un bouton, et le coup d'œil efface aussi les fenêtres restées dessous
        await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players.find(p => !p.human && p.alive); Players.meet && Players.meet(g, me.id, o.id); me.contact = me.contact || {}; me.contact[o.id] = true;
          const fc = Object.values(g.cities).find(c => c.owner === o.id); let spot = null;
          for (let r = 4; r < 12 && !spot; r++) for (let dx = -r; dx <= r && !spot; dx++) { const x = World.wx(g.world, fc.x + dx), y = fc.y + (r % 2 ? r : -r); if (y > 1 && y < g.world.h - 2 && !World.isWaterAt(g.world, fc.plane, x, y) && !Cities.at(g, fc.plane, x, y)) spot = [x, y]; }
          const c = Cities.create(g, o.id, o.race, fc.plane, spot[0], spot[1]);
          me.diploOffers = [{ from: o.id, kind: 'peace', turn: g.turn, gold: 30, city: c.id }]; Panels.wizards(); App.offerPrompt(me.diploOffers[0]); }""")
        await pg.wait_for_timeout(500)
        btns = await pg.evaluate("() => [...document.querySelectorAll('.contact-modal footer button')].map(b => b.textContent)")
        has = 'Voir la cité offerte' in btns
        ok(has, 'bouton « Voir la cité offerte » : %s' % btns)
        clicked = await pg.evaluate("() => { const b = [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Voir la cité offerte'); if (b) b.click(); return !!b; }")
        await pg.wait_for_timeout(800)
        st = await pg.evaluate("() => ({ peek: document.body.classList.contains('peek-offer'), op: getComputedStyle(document.querySelector('#modal-root')).opacity, bar: !!document.querySelector('.peekbar') })")
        ok(clicked and st['peek'] and float(st['op']) < 0.05 and st['bar'], "coup d'œil : les fenêtres dessous s'effacent (%s)" % st)
        await pg.evaluate("() => { const b = document.querySelector('.peekbar button'); if (b) b.click(); }"); await pg.wait_for_timeout(400)
        back = await pg.evaluate("() => ({ offer: !!document.querySelector('.contact-modal'), op: getComputedStyle(document.querySelector('#modal-root')).opacity })")
        ok(back['offer'] and float(back['op']) > 0.9, 'retour à la proposition (%s)' % back)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Refuser'); if (b) b.click(); UI.closeAll(); }")
        # 6. l'erreur reste affichée
        await pg.evaluate("() => App.oops(new Error('essai de bataille'))"); await pg.wait_for_timeout(3500)
        r = await pg.evaluate("() => [...document.querySelectorAll('#oops .oops-card')].map(c => c.innerText).join(' | ')")
        ok('essai de bataille' in r and 'Copier' in r, "l'erreur reste à l'écran après 3,5 s")
        await pg.evaluate("() => document.querySelectorAll('#oops .oops-card').forEach(c => c.remove())")
        # 7. bataille : la magie du sorcier dans l'en-tête, et le coup d'œil au champ de bataille avant le résultat
        await pg.evaluate("""() => { const g = App.game, me = App.me(), ai = g.players.find(p => !p.human && p.alive), cap = Object.values(g.cities).find(c => c.owner === me.id);
          let x = cap.x + 3, y = cap.y; for (const u of Object.values(g.units)) if (u.x === x && u.y === y) delete g.units[u.id];
          const A = [Units.create(g, 'HighMenSwordsmen', me.id, cap.plane, x, y), Units.create(g, 'HighMenSwordsmen', me.id, cap.plane, x, y)], D = [Units.create(g, 'HighMenSpearmen', ai.id, cap.plane, x, y)];
          window.AUTO_COMBAT = true; App.prefs.autoSpeed = 'fast'; window.__bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: ai.id, plane: cap.plane, x, y });
          window.__res = null; CombatView.run(g, window.__bt, {}).then(r => { window.__res = 'fini'; }); }""")
        await pg.wait_for_timeout(1200)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')].find(x => x.textContent === 'Résolution automatique'); if (b) b.click(); }")
        for _ in range(60):
            await pg.wait_for_timeout(500)
            if await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].some(b => b.textContent === 'Revoir le champ de bataille')"): break
        sub = await pg.evaluate("() => document.querySelector('#c-sub') ? document.querySelector('#c-sub').innerText : ''")
        ok('Compétence' in sub and 'mana' in sub, 'en-tête de bataille : %r' % sub[-60:])
        btns = await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].map(b => b.textContent)")
        ok('Revoir le champ de bataille' in btns, 'résultat : %s' % btns)
        await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Revoir le champ de bataille').click()"); await pg.wait_for_timeout(400)
        st = await pg.evaluate("() => ({ peeking: document.body.classList.contains('peeking'), bar: !!document.querySelector('#peekbar'), log: document.querySelector('#c-log') ? document.querySelector('#c-log').children.length : 0 })")
        ok(st['peeking'] and st['bar'] and st['log'] > 0, 'le champ de bataille et son journal (%s)' % st)
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v03154_champ.png'))
        await pg.evaluate("() => document.querySelector('#peekbar button').click()"); await pg.wait_for_timeout(400)
        again = await pg.evaluate("() => !!document.querySelector('.modal') && !document.body.classList.contains('peeking')")
        ok(again, 'retour au résultat')
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')].find(x => /Accepter|Continuer/.test(x.textContent)); if (b) b.click(); }"); await pg.wait_for_timeout(800)
        # 8. un double-clic un peu lent (420 ms) donne encore l'ordre de marche
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), cap = Object.values(g.cities).find(c => c.owner === me.id);
          const u = Units.create(g, 'HighMenSpearmen', me.id, cap.plane, cap.x, cap.y + 1); u.moves = 2; App.selectTile(cap.plane, u.x, u.y, [u.id]); MapView.plane = cap.plane;
          const tx = u.x + 1, ty = u.y; await App.clickTile(tx, ty, null); await new Promise(r => setTimeout(r, 420)); await App.clickTile(tx, ty, null); await new Promise(r => setTimeout(r, 600));
          return { moved: u.x === tx && u.y === ty, at: [u.x, u.y], to: [tx, ty] }; }""")
        ok(r['moved'], "double-clic à 420 ms : l'unité part (%s)" % r)
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
    srv.shutdown()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
