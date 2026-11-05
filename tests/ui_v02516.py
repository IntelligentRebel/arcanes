"""v0.25.16 : Entrée sur une fenêtre du début de tour, victoire pendant son tour, coup d'œil en pause, raccourcis Ctrl,
pile en marche, approche en combat sans mouvement, liens des toasts sous une fenêtre, recherche obligatoire."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.wait_for_timeout(900)
        await pg.evaluate("""() => {
          document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll();
        }""")
        await pg.wait_for_timeout(3000)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(400); await pg.evaluate("UI.closeAll()")

        # 1. Entrée sur « Un héros se présente » juste après un clic sur Fin du tour : pas de second tour
        await pg.evaluate("""() => { const g = App.game, me = App.me();
          for (const u of Object.values(g.units)) if (u.owner === me.id) u.status = 'sentry';
          me.researching = me.researching || me.researchOptions[0];
          const h = Object.values(DATA.heroes).find(x => x.unit === 'HeroTheria');
          me.heroOffer = { hero: h.id, fee: 50, level: 0, turn: g.turn + 1 }; me.gold = 500; }""")
        t0 = await pg.evaluate("App.game.turn")
        await pg.click('#btn-end')
        await pg.wait_for_function("() => !UI.busy && [...document.querySelectorAll('.modal h2')].some(h => h.textContent.includes('héros'))", timeout=120000)
        focused = await pg.evaluate("document.activeElement && document.activeElement.id")
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1500)
        t1 = await pg.evaluate("App.game.turn")
        print('ENTREE', {'avant': t0, 'apres': t1, 'focus': focused})
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")

        # 2. une pile en marche : ni fin de tour ni ordre au clavier
        r = await pg.evaluate("""() => { const t = App.game.turn; App.moving = true; App.endTurn(); const t2 = App.game.turn; App.moving = false; return [t, t2, UI.busy]; }""")
        print('EN MARCHE', r)

        # 3. Ctrl+S ne met pas l'unité en sentinelle
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(); const u = Object.values(g.units).find(u => u.owner === me.id); u.status = ''; u.moves = 2; App.selectTile(u.plane, u.x, u.y, [u.id]); window._uid = u.id; return u.status; }""")
        await pg.keyboard.down('Control'); await pg.keyboard.press('s'); await pg.keyboard.up('Control'); await pg.wait_for_timeout(200)
        print('CTRL+S', await pg.evaluate("[App.game.units[_uid].status, !!App.sel]"))

        # 4. coup d'œil sur la capitale pendant une proposition : le jeu attend
        await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1], cap = g.cities[o.fortress];
          Game.contact(g, me.id, o.id); me.explored[cap.plane][cap.y * g.world.w + cap.x] = 1;
          window._off = { from: o.id, kind: 'peace', turn: g.turn, gold: 99999 }; Diplomacy.offer(g, me, _off); o.gold = 40;
          App.offerPrompt(_off); }""")
        await pg.wait_for_timeout(500)
        gold_txt = await pg.evaluate("(() => { const m = document.querySelector('.contact-modal'); return m ? (m.textContent.match(/(\\d+) pièces d'or/) || [])[1] : null; })()")
        await pg.evaluate("() => { const bt = [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Voir la capitale'); bt.click(); }")
        await pg.wait_for_timeout(400)
        st = await pg.evaluate("""() => { const t = App.game.turn; App.endTurn(); return { peeking: App.peeking, bar: !!document.querySelector('.peekbar'), tour: [t, App.game.turn] }; }""")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        back = await pg.evaluate("({ peeking: App.peeking, bar: !!document.querySelector('.peekbar'), offre: !!document.querySelector('.contact-modal') })")
        print('COUP D\'OEIL', st, back, 'or annoncé', gold_txt)
        await pg.evaluate("() => { const bt = [...document.querySelectorAll('.contact-modal footer button')].find(x => x.textContent === 'Refuser'); if (bt) bt.click(); }")
        await pg.wait_for_timeout(300)

        # 5. lien d'un toast cliqué pendant qu'un écran de cité est ouvert : pas de second écran
        await pg.evaluate("""() => { const c = App.game.cities[App.me().fortress]; CityUI.open(c.id);
          Game.log(App.game, App.pid, 'Essai : ' + c.name + '.', { city: c.id }); }""")
        await pg.wait_for_timeout(400)
        await pg.evaluate("() => { const a = document.querySelector('#toasts a[data-goto]'); if (a) a.click(); }")
        await pg.wait_for_timeout(400)
        print('TOAST', await pg.evaluate("({ cites: document.querySelectorAll('.citymodal').length, cur: CityUI.cur != null, lien: !!document.querySelector('#toasts a[data-goto]') })"))
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(200)

        # 6. recherche à choisir obligatoirement : la fenêtre ne se ferme pas sans choix
        await pg.evaluate("() => { MagicUI.research(true); }"); await pg.wait_for_timeout(300)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        print('RECHERCHE', await pg.evaluate("({ ouverte: [...document.querySelectorAll('.modal h2')].some(h => h.textContent === 'Recherche magique'), croix: !!document.querySelector('.modal header .x') })"))
        await pg.evaluate("() => { const r = document.querySelector('.modal .list .row'); if (r) r.click(); }"); await pg.wait_for_timeout(200)

        # 7. combat : une unité qui n'aura plus de mouvement en arrivant au contact n'affiche pas l'épée
        await pg.evaluate("""() => { const g = App.game, me = App.me(), foe = g.players[1], c = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const a = Units.create(g, 'HighMenSpearmen', me.id, 0, x, y), d = Units.create(g, 'OrcSpearmen', foe.id, 0, x, y);
          const bt = new Battle(g, { attackers: [a], defenders: [d], attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(3) });
          window._bt = bt; CombatView.run(g, bt, {}); }""")
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        r = await pg.evaluate("""() => { const bt = _bt, a = bt.alive(CombatView.humanSide)[0], d = bt.alive(1 - CombatView.humanSide)[0];
          a.c = 6; a.r = 6; d.c = 8; d.r = 6; CombatView.sel = a;
          a.moves = 2; const peu = CombatView.clickIntent({ c: 8, r: 6 });
          a.moves = 4; const assez = CombatView.clickIntent({ c: 8, r: 6 });
          return { unPas: peu, deuxPas: assez }; }""")
        print('APPROCHE', r)
        await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        await pg.wait_for_timeout(600)

        # 8. victoire acquise pendant son propre tour : l'écran de fin s'affiche
        await pg.evaluate("() => { UI.closeAll(); App.game.over = true; App.game.winner = App.pid; App.refresh(); }")
        await pg.wait_for_timeout(800)
        print('VICTOIRE', await pg.evaluate("[...document.querySelectorAll('.modal h2')].map(h => h.textContent)"))
        print('ERRORS', len(errors), errors[:5])
        await b.close()

asyncio.run(main())
