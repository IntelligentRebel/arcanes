"""v0.29.0 : le Livre de légende : la section du grimoire (énigmes, carte en puzzle), la carte agrandie, la note de cité,
l'onglet du grimoire pour le détenteur, l'annonce, l'Oubli subi."""
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
          const g = Game.newGame({ seed: 21, opponents: 3, difficulty: 'hard', crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"), 'Livre', await pg.evaluate("() => { const b = App.game.book; return b.plane + ':' + b.x + ',' + b.y + ' cases possibles au départ ' + b.cand; }"))
        # deux fragments de repaires pour le joueur : l'annonce, puis le grimoire
        await pg.evaluate("""async () => { const g = App.game; for (const f of g.book.frags.filter(f => f.site != null).slice(0, 2)) Book.onLoot(g, g.sites[f.site], 0, []); }""")
        await pg.wait_for_timeout(500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(700)
        card = await pg.evaluate("() => { const c = document.querySelector('.spell-cast'); return c ? c.innerText.replace(/\\n+/g, ' | ') : null; }")
        print('ANNONCE', card)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0290_annonce.png'))
        await pg.evaluate("() => { const c = document.querySelector('.spell-cast'); if (c) c.click(); }"); await pg.wait_for_timeout(600)
        await pg.evaluate("() => { for (let i = 0; i < 4; i++) { const c = document.querySelector('.spell-cast'); if (c) c.click(); } }"); await pg.wait_for_timeout(600)
        await pg.evaluate("UI.closeAll(); MagicUI.magic()"); await pg.wait_for_timeout(500)
        sec = await pg.evaluate("() => { const h = [...document.querySelectorAll('.sect h4')].find(x => /Livre de légende/.test(x.textContent)); return h ? h.parentElement.innerText : null; }")
        print('SECTION', sec)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0290_grimoire.png'))
        await pg.evaluate("() => { const h = [...document.querySelectorAll('.sect h4')].find(x => /Livre de légende/.test(x.textContent)); h.parentElement.querySelector('canvas').click(); }"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0290_carte_2.png'))
        await pg.evaluate("UI.closeAll()")
        # les cinq fragments : la carte complète, avec le X
        await pg.evaluate("""async () => { const g = App.game; for (const f of g.book.frags.filter(f => f.site != null && !f.taken)) Book.onLoot(g, g.sites[f.site], 0, []);
          const nf = g.book.frags.find(f => f.archive); g.cities[nf.city].owner = 0; Book.tick(g); }""")
        await pg.wait_for_timeout(400)
        await pg.evaluate("() => { UI.closeAll(); for (let i = 0; i < 9; i++) { const c = document.querySelector('.spell-cast'); if (c) c.click(); } App.spellFx = []; }"); await pg.wait_for_timeout(700)
        await pg.evaluate("UI.closeAll(); MagicUI.puzzleModal(App.game, 0)"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0290_carte_5.png'))
        await pg.evaluate("UI.closeAll()")
        # la note de la cité qui garde des fragments
        cid = await pg.evaluate("() => App.game.book.frags[0].city")
        print('NOTE', await pg.evaluate("(cid) => Book.cityNote(App.game, App.game.cities[cid])", cid))
        await pg.evaluate("(cid) => { CityUI.open(cid); }", cid); await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0290_cite.png'))
        print('NOTE AFFICHÉE', await pg.evaluate("() => /Livre de légende/.test(document.body.innerText)"))
        await pg.evaluate("UI.closeAll()")
        # le Livre au joueur : l'onglet du grimoire
        await pg.evaluate("() => { const g = App.game; Book.claim(g, 0, { plane: g.book.plane, x: g.book.x, y: g.book.y }); }"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { UI.closeAll(); for (let i = 0; i < 9; i++) { const c = document.querySelector('.spell-cast'); if (c) c.click(); } App.spellFx = []; }"); await pg.wait_for_timeout(600)
        await pg.evaluate("UI.closeAll(); MagicUI.spellbook('legend')"); await pg.wait_for_timeout(500)
        print('ONGLET', await pg.evaluate("() => [...document.querySelectorAll('.tab')].map(t => t.textContent).join(' | ')"))
        print('SORTS', await pg.evaluate("() => [...document.querySelectorAll('.spell .nm')].map(t => t.textContent).join(' | ')"))
        await pg.screenshot(path=os.path.join(SHOTS, 'v0290_onglet.png'))
        await pg.evaluate("UI.closeAll()")
        # l'Oubli lancé contre le joueur : ses cartes s'effacent autour des cités du lanceur
        r = await pg.evaluate("""() => { const g = App.game, me = g.players[0], o = g.players[1]; o.contact[0] = me.contact[1] = true;
          const c = Cities.ofPlayer(g, 1)[0]; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) me.explored[c.plane][(c.y + dy) * g.world.w + World.wx(g.world, c.x + dx)] = 1;
          const before = Intel.knows(g, me, c.plane, c.x, c.y);
          g.book.city = Cities.ofPlayer(g, 1)[0].id;   // le Livre passe au sorcier 1
          const a = Spells.apply(g, o, 'oblivion', null); MapView.centerOn(c.x, c.y, c.plane); App.refresh();
          return 'connue avant ' + before + ', après ' + Intel.knows(g, me, c.plane, c.x, c.y) + ' — ' + (a.msg || a.why); }""")
        print('OUBLI', r)
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=os.path.join(SHOTS, 'v0290_oubli.png'))
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
