"""v0.29.1 : trois sorts de plus au Livre de légende. L'onglet du grimoire, Deus ex machina qui renvoie une armée
(annonce côté défenseur), Annales (la carte se complète), Mise en abyme."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: (errors.append(str(e)), print('PAGEERROR', str(e)[:300], flush=True)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 3, difficulty: 'hard', crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"), flush=True)
        await pg.evaluate("() => { const g = App.game; for (const o of g.players) for (const q of g.players) if (o !== q) o.contact[q.id] = true; Book.claim(g, 0, { plane: g.book.plane, x: g.book.x, y: g.book.y }); }")
        await pg.evaluate("() => { UI.closeAll(); App.spellFx = []; document.querySelectorAll('.spell-cast').forEach(c => c.remove()); App.spellShowing = false; }"); await pg.wait_for_timeout(300)
        await pg.evaluate("UI.closeAll(); MagicUI.spellbook('legend')"); await pg.wait_for_timeout(500)
        print('SORTS', await pg.evaluate("() => [...document.querySelectorAll('.spell .nm')].map(t => t.textContent).join(' | ')"), flush=True)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0291_onglet.png'))
        await pg.evaluate("UI.closeAll()")
        # Annales sur le sorcier 1
        print('ANNALES', await pg.evaluate("() => { const g = App.game; g.players[1].explored[0].fill(1); const r = Spells.apply(g, App.me(), 'annals', { player: 1 }); App.refresh(); return r.msg; }"), flush=True)
        await pg.wait_for_timeout(900)
        await pg.evaluate("() => { document.querySelectorAll('.spell-cast').forEach(c => c.click()); }"); await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0291_annales.png'))
        await pg.evaluate("() => { App.spellFx = []; document.querySelectorAll('.spell-cast').forEach(c => c.remove()); App.spellShowing = false; }")
        # Deus ex machina sur la forteresse, puis le sorcier 1 attaque
        print('DEUS', await pg.evaluate("() => { const g = App.game, f = g.cities[App.me().fortress]; return Spells.apply(g, App.me(), 'deus_ex_machina', { city: f.id }).msg + ' / à nouveau : ' + Spells.validate(g, App.me(), 'deus_ex_machina', { city: f.id }).why; }"), flush=True)
        await pg.evaluate("() => { App.spellFx = []; document.querySelectorAll('.spell-cast').forEach(c => c.remove()); App.spellShowing = false; }")
        r = await pg.evaluate("""async () => { const g = App.game, f = g.cities[App.me().fortress]; g.players[1].diplo[0] = 'war'; App.me().diplo[1] = 'war';
          const nb = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Units.at(g, f.plane, x, y).length && !Cities.at(g, f.plane, x, y));
          const a = [Units.create(g, 'GreatDrake', 1, f.plane, nb[0], nb[1]), Units.create(g, 'GreatDrake', 1, f.plane, nb[0], nb[1])];
          const r = await Game.attack(g, a.map(u => u.id), f.x, f.y); App.refresh(); return JSON.stringify(r) + ' armée à ' + a[0].x + ',' + a[0].y; }""")
        print('ATTAQUE', r, flush=True)
        await pg.wait_for_timeout(900)
        print('ANNONCE', await pg.evaluate("() => { const c = document.querySelector('.spell-cast'); return c ? c.innerText.replace(/\\n+/g, ' | ') : null; }"), flush=True)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0291_deus.png'))
        await pg.evaluate("() => { App.spellFx = []; document.querySelectorAll('.spell-cast').forEach(c => c.remove()); App.spellShowing = false; }")
        # Mise en abyme sur une unité de la forteresse
        print('ABYME', await pg.evaluate("() => { const g = App.game, f = g.cities[App.me().fortress]; const u = Units.at(g, f.plane, f.x, f.y).find(u => u.owner === 0 && !u.hero); const n = Units.at(g, f.plane, f.x, f.y).length; const r = Spells.apply(g, App.me(), 'mise_en_abyme', { unit: u.id }); App.refresh(); return r.msg + ' ' + n + ' → ' + Units.at(g, f.plane, f.x, f.y).length; }"), flush=True)
        await pg.wait_for_timeout(700)
        # Artefact légendaire : un héros pour le porter, le coffre
        print('ARTEFACT', await pg.evaluate("() => { const g = App.game, me = App.me(); const r = Spells.apply(g, me, 'legendary_artifact', null); return r.msg; }"), flush=True)
        await pg.wait_for_timeout(500)
        await pg.evaluate("() => { App.spellFx = []; document.querySelectorAll('.spell-cast').forEach(c => c.remove()); App.spellShowing = false; UI.closeAll(); }")
        print('HÉROS', await pg.evaluate("""() => { const g = App.game, f = g.cities[App.me().fortress]; const h = Object.values(DATA.heroes).find(h => !h.champion && h.unit !== 'HeroTorin'); const u = Heroes.spawn(g, App.me(), h, f.plane, f.x, f.y, 0); return Units.label(u) + ' ' + JSON.stringify(u.hero && u.hero.slots); }"""), flush=True)
        await pg.evaluate("() => { const g = App.game, f = g.cities[App.me().fortress]; const u = Units.at(g, f.plane, f.x, f.y).find(u => u.hero); Panels.items(u); }"); await pg.wait_for_timeout(600)
        await pg.evaluate("() => { const t = document.querySelector('.hs-vault > *'); if (t) t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); }"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0292_artefact.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
