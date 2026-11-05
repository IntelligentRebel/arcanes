"""v0.26.1 : dilemmes (deux issues aux conséquences écrites) et némésis (le tueur d'un héros reçoit un nom, revient, sa chute est récompensée)."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def shot(pg, name):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, name + '.png'))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))

        # 0. le terrain de chaque dilemme : un héros, de l'or, une recherche, une guerre, du contact
        await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress], foe = g.players[1];
          me.gold = 600; c.pop = 7000; g.turn = 30;
          Heroes.spawn(g, me, Object.values(DATA.heroes).find(h => h.unit === 'HeroRakir'), c.plane, c.x, c.y, 0);
          if (!me.researching) { me.researching = me.researchOptions[0]; me.researchProgress = 0; }
          me.contact[foe.id] = true; foe.contact[me.id] = true; me.diplo[foe.id] = 'war'; foe.diplo[me.id] = 'war'; }""")
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), out = {};
          for (const id of Object.keys(Dilemmas.DEFS)) {
            const D = Dilemmas.DEFS[id]; let data = null;
            try { data = D.when(g, me); } catch (e) { out[id] = 'ERREUR ' + e.message; continue; }
            if (!data) { out[id] = 'non applicable'; continue; }
            me.dilemma = { id, data, turn: g.turn };
            out[id] = { titre: D.title, texte: Dilemmas.text(g, me).replace(/<[^>]+>/g, ''), options: Dilemmas.options(g, me).map(o => o.label + ' → ' + o.text + (o.can ? '' : ' [impossible]')) };
          }
          me.dilemma = null; return out; }""")
        for k, v in r.items(): print('DILEMME', k, v)

        # 1. la fenêtre d'un dilemme (le duel), puis le choix
        await pg.evaluate("""() => { const g = App.game, me = App.me(); me.dilemma = { id: 'duel', data: Dilemmas.DEFS.duel.when(g, me), turn: g.turn }; App.dilemmaPrompt(); }""")
        await pg.wait_for_timeout(700); await shot(pg, 'dilemma_duel')
        print('FENETRE', await pg.evaluate("() => [...document.querySelectorAll('.modal button')].map(b => b.textContent + (b.disabled ? ' (grisé)' : ''))"))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Relever le défi'); b.click(); }")
        await pg.wait_for_timeout(500)
        print('DUEL', await pg.evaluate("() => ({ reste: App.me().dilemma, log: App.game.log.slice(-2).map(e => e.text) })"))
        # un dilemme dont une issue est hors de portée
        await pg.evaluate("""() => { const g = App.game, me = App.me(); me.gold = 5; const d = Dilemmas.DEFS.plague.when(g, me); me.dilemma = { id: 'plague', data: d, turn: g.turn }; App.dilemmaPrompt(); }""")
        await pg.wait_for_timeout(600); await shot(pg, 'dilemma_plague')
        print('FIEVRE', await pg.evaluate("() => [...document.querySelectorAll('.modal button')].map(b => b.textContent + (b.disabled ? ' (grisé)' : ''))"))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => !b.disabled); b.click(); }")
        await pg.wait_for_timeout(400)
        print('FIEVRE APRES', await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; return { pop: c.pop, humeur: c.moods, agitation: Cities.econ(App.game, c).unrest, log: App.game.log.slice(-1)[0].text }; }"))
        # l'IA tranche ses dilemmes d'elle-même, au fil des tours
        r = await pg.evaluate("""() => { const g = App.game, ai = g.players[1]; ai.nextDilemma = g.turn; const n0 = g.log.length; Dilemmas.tick(g); return { reste: ai.dilemma, prochain: ai.nextDilemma - g.turn, log: g.log.slice(n0).filter(e => e.pid === ai.id).map(e => e.text) }; }""")
        print('IA', r)

        # 2. un héros tombe : son tueur reçoit un nom
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          const [x, y] = World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y) && !Units.at(g, 0, x, y).length && World.get(g.world, 0, 'site', x, y) < 0);
          const hero = Object.values(g.units).find(u => u.owner === me.id && u.type === 'HeroRakir'); hero.dmg = 0; hero.moves = Units.maxMoves(g, hero);
          const drake = Units.create(g, 'GreatDrake', -1, 0, x, y); drake.rampage = true;
          let tries = 0, res = null;
          while (g.units[hero.id] && tries++ < 6) { hero.dmg = 0; hero.moves = Units.maxMoves(g, hero); hero.x = c.x; hero.y = c.y; res = await Game.attack(g, [hero.id], x, y, { auto: true }); }
          MapView.bumpVis(); MapView.invalidateVis(); MapView.ts = 72; MapView.centerOn(x, y, 0); App.refresh();
          return { mort: !g.units[hero.id], nemesis: drake.nemesis, label: Units.label(drake), x, y, log: g.log.slice(-3).map(e => e.text) }; }""")
        print('NEMESIS', r)
        await pg.wait_for_timeout(700); await shot(pg, 'nemesis_map')
        print('INFOBULLE', await pg.evaluate("(r) => { const d = Units.at(App.game, 0, r.x, r.y)[0]; return d ? UI.unitTip(d, App.game).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 400) : null; }", r))
        print('FORCE', await pg.evaluate("(r) => { const d = Units.at(App.game, 0, r.x, r.y)[0], s = Units.stats(App.game, d), b = Units.stats(App.game, Object.assign({}, d, { nemesis: null })); return { attaque: [b.melee, s.melee], def: [b.def, s.def], res: [b.res, s.res] }; }", r))

        # 3. vengeance : une armée l'abat
        r = await pg.evaluate("""async (r) => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          const army = ['Paladin', 'Paladin', 'Paladin', 'Paladin', 'Paladin', 'Paladin'].map(t => { const u = Units.create(g, t, me.id, 0, c.x, c.y); u.moves = Units.maxMoves(g, u); return u; });
          const dr = Units.at(g, 0, r.x, r.y).find(u => u.nemesis); if (dr) dr.dmg = Units.stats(g, dr).maxHp - 4;
          const gold0 = me.gold, fame0 = me.fame, xp0 = army[0].xp;
          let res = null, tries = 0;
          while (Units.at(g, 0, r.x, r.y).some(u => u.owner < 0) && tries++ < 4) { for (const u of army) if (g.units[u.id]) { u.moves = Units.maxMoves(g, u); u.x = c.x; u.y = c.y; } res = await Game.attack(g, army.filter(u => g.units[u.id]).map(u => u.id), r.x, r.y, { auto: true }); }
          return { or: me.gold - gold0, renommee: me.fame - fame0, xp: army.find(u => g.units[u.id]).xp - xp0, vengeances: me.avenged, log: g.log.slice(-4).map(e => e.text) }; }""", r)
        print('VENGEANCE', r)

        # 4. une némésis tapie dans un repaire garde son nom d'un combat à l'autre, et l'indice du repaire la nomme
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me();
          const s = g.sites.find(s => !s.cleared && s.plane === 0 && (s.guardians || []).length >= 1 && s.type !== 'node' && s.type !== 'tower');
          const t = s.guardians[0];
          s.nemesis = { type: t, data: { name: 'Krakul', victims: ['Torin'], lvl: 2, foe: me.id, foes: [me.id], turn: g.turn } };
          const hint = App.guardianHint(s);
          const gs = []; s.guardians.forEach(tt => { const u = Units.create(g, tt, -1, 0, s.x, s.y); u.guardian = s.id; gs.push(u); });
          Nemesis.restoreAtSite(s, gs);
          const tagged = gs.filter(u => u.nemesis).map(u => Units.label(u));
          Nemesis.saveAtSite(s, gs); for (const u of gs) delete g.units[u.id];
          return { hint, tagged, garde: !!s.nemesis }; }""")
        print('REPAIRE', r)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
