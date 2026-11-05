"""v0.28.20 : le pacte contre le meneur (Hardcore) : la section du grimoire, la participation du joueur, l'annonce,
le Démon légendaire (figurine, refus de combattre un autre que la cible)."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:300]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 3, difficulty: 'hardcore', crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"), 'règle active', await pg.evaluate("Rite.on(App.game)"))
        # un rituel en cours contre le sorcier 1, le joueur en est membre
        await pg.evaluate("""() => { const g = App.game; for (const o of g.players) for (const q of g.players) if (o !== q) { o.contact[q.id] = true; }
          g.players[2].diplo[1] = 'war'; g.players[1].diplo[2] = 'war';
          g.rite = { phase: 'ritual', target: 1, progress: 300, cost: 900, paid: { 2: 180, 3: 120 }, join: {}, start: g.turn, lastGot: 60 }; }""")
        await pg.evaluate("MagicUI.magic()"); await pg.wait_for_timeout(500)
        sec = await pg.evaluate("() => { const h = [...document.querySelectorAll('.sect h4')].find(x => /Pacte/.test(x.textContent)); return h ? h.parentElement.innerText : null; }")
        print('SECTION', sec)
        await pg.screenshot(path=os.path.join(SHOTS, 'v02820_grimoire.png'))
        await pg.evaluate("() => [...document.querySelectorAll('button')].find(x => /Participer au rituel/.test(x.textContent)).click()"); await pg.wait_for_timeout(300)
        print('PARTICIPE', await pg.evaluate("App.game.rite.join[0]"), 'contributeurs', await pg.evaluate("Rite.contributors(App.game, App.game.rite).map(p => p.id).join(',')"))
        await pg.evaluate("UI.closeAll()")
        # le rituel avance d'un tour (le joueur paie de son mana)
        await pg.evaluate("() => { App.game.players[0].mana = 200; Rite.advance(App.game, App.game.rite); }")
        print('APRÈS UN TOUR', await pg.evaluate("() => { const r = App.game.rite; return r.progress + '/' + r.cost + ' payé par le joueur ' + (r.paid[0] || 0) + ', mana restant ' + App.game.players[0].mana; }"))
        # l'invocation : le démon pour le joueur (le plus fort des membres en guerre est forcé ici)
        await pg.evaluate("""() => { const g = App.game, r = g.rite; g.players[0].diplo[1] = 'war'; g.players[1].diplo[0] = 'war'; r.progress = r.cost;
          const st = Rite.standing; Rite.standing = (game, p) => p.id === 0 ? 1e6 : p.id === 1 ? 2e6 : st(game, p); Rite.summon(g, r); Rite.standing = st; }""")
        await pg.wait_for_timeout(600)
        print('PHASE', await pg.evaluate("App.game.rite.phase"), 'maître', await pg.evaluate("App.game.rite.owner"), 'démon', await pg.evaluate("() => { const d = App.game.units[App.game.rite.demon]; return d && Units.label(d) + ' force ' + Math.round(Units.strength(App.game, d)); }"))
        print('FIGURINE', await pg.evaluate("Sprites.resolve('unit:RiteDemon')"))
        await pg.wait_for_timeout(700)
        card = await pg.evaluate("() => { const c = document.querySelector('.spell-cast'); return c ? c.innerText.replace(/\\n+/g, ' | ') : null; }")
        print('ANNONCE', card)
        await pg.screenshot(path=os.path.join(SHOTS, 'v02820_annonce.png'))
        await pg.evaluate("() => { const c = document.querySelector('.spell-cast'); if (c) c.click(); }"); await pg.wait_for_timeout(600)
        # il refuse d'attaquer un autre que la cible : un pillard posé à côté
        print('REFUS', await pg.evaluate("""async () => { const g = App.game, d = g.units[g.rite.demon]; d.moves = 3;
          const nb = World.neighbors(g.world, d.x, d.y).find(([x, y]) => !Units.at(g, d.plane, x, y).length && !Cities.at(g, d.plane, x, y) && !World.isWaterAt(g.world, d.plane, x, y));
          const m = Units.create(g, 'Spearmen' in DATA.units ? 'Spearmen' : 'HighMenSpearmen', -1, d.plane, nb[0], nb[1]);
          const r = await Game.attack(g, [d.id], nb[0], nb[1]); return JSON.stringify(r); }"""))
        # sélection du démon : le panneau d'unité
        await pg.evaluate("() => { const g = App.game, d = g.units[g.rite.demon]; MapView.centerOn(d.x, d.y, d.plane); App.selectTile(d.plane, d.x, d.y); App.refresh(); }"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=os.path.join(SHOTS, 'v02820_demon.png'))
        # la dissolution : la cible n'est plus le plus fort
        await pg.evaluate("() => { const g = App.game; const st = Rite.standing; Rite.standing = (game, p) => p.id === 1 ? 10 : 100; Rite.tick(g); Rite.standing = st; }"); await pg.wait_for_timeout(300)
        print('DISSOUS', await pg.evaluate("App.game.rite.phase + ' ' + App.game.rite.why"), 'démon encore là', await pg.evaluate("() => Object.values(App.game.units).some(u => u.riteDemon)"))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
