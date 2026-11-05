"""v0.25.27 : l'intérieur d'un royaume (entre ses cités voisines) lui appartient : aucun rival n'y fonde de cité."""
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
          const g = Game.newGame({ seed: 35, mapW: 80, mapH: 50, opponents: 1, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")

        # trois cités du joueur en triangle (8 à 9 cases d'écart), sur une terre libre ; un colon rival au milieu
        r = await pg.evaluate("""() => { const g = App.game, w = g.world, me = App.me(), foe = g.players[1];
          const land = (x, y) => World.inY(w, y) && !World.isWaterAt(w, 0, x, y) && !Cities.at(g, 0, x, y) && World.get(w, 0, 'site', x, y) < 0 && World.terr(w, 0, x, y) !== T.MOUNTAIN;
          const freeOf = (x, y) => Object.values(g.cities).every(c => c.plane !== 0 || World.dist(w, c.x, c.y, x, y) > 5);
          let best = null;
          for (let y = 6; y < w.h - 6 && !best; y++) for (let x = 0; x < w.w && !best; x++) {
            const A = [x, y - 4], B = [x - 4, y + 4], C = [x + 4, y + 4];
            const pts = [A, B, C].map(([a, b]) => [World.wx(w, a), b]);
            if (pts.every(([a, b]) => land(a, b) && Cities.canFoundAt(g, me.id, 0, a, b).ok) && land(x, y + 1) && freeOf(x, y + 1) && World.get(w, 0, 'owner', x, y + 1) < 0) best = { pts, mid: [x, y + 1] };
          }
          if (!best) return null;
          window._cs = best.pts.map(([x, y], i) => Cities.create(g, me.id, 'highmen', 0, x, y, { pop: 1000 }).id);
          Cities.updateTerritory(g);
          const [mx, my] = best.mid; window._mid = best.mid;
          const own = World.get(w, 0, 'owner', mx, my);
          const after = Cities.canFoundAt(g, foe.id, 0, mx, my);
          const keep = Cities.claimInterior; Cities.claimInterior = () => {}; Cities.updateTerritory(g); const before = Cities.canFoundAt(g, foe.id, 0, mx, my); Cities.claimInterior = keep; Cities.updateTerritory(g);
          const mine = Cities.canFoundAt(g, me.id, 0, mx, my);
          for (const [x, y] of best.pts) Move.reveal(g, me, 0, x, y, 6);
          MapView.invalidateVis && MapView.invalidateVis(); MapView.bumpVis && MapView.bumpVis(); MapView.ts = 56; MapView.centerOn(mx, my, 0); App.refresh();
          return { cites: best.pts, milieu: best.mid, proprietaire: own, moi: me.id, sansInterieur: before, avecInterieur: after, pourMoi: mine }; }""")
        print('TRIANGLE', r)
        await pg.wait_for_timeout(600)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'interior.png'))
        # l'IA : un colon rival posé au milieu ne fonde pas et cherche ailleurs
        r = await pg.evaluate("""async () => { const g = App.game, foe = g.players[1], [x, y] = _mid;
          const u = Units.create(g, 'HighMenSettlers', foe.id, 0, x, y); u.aiTarget = [x, y];
          const f = Game.foundCity(g, u.id);
          return { fondation: f.ok, raison: f.why || null, toujoursLa: !!g.units[u.id] }; }""")
        print('COLON RIVAL', r)
        # une cité rivale déjà là garde sa première couronne ; le reste reste au joueur
        r = await pg.evaluate("""() => { const g = App.game, w = g.world, foe = g.players[1], [x, y] = _mid;
          const c = Cities.create(g, foe.id, 'orc', 0, x, y, { pop: 1000 }); Cities.updateTerritory(g);
          const ring = World.neighbors(w, x, y).every(([a, b]) => World.get(w, 0, 'owner', a, b) === foe.id);
          const out = World.get(w, 0, 'owner', x, y + 2);
          Game.destroyCity(g, c);
          return { couronneRivale: ring, deuxCasesPlusLoin: out }; }""")
        print('ENCLAVE', r)
        # temps de calcul du territoire sur la carte entière
        print('MS', await pg.evaluate("(() => { const t = performance.now(); for (let i = 0; i < 20; i++) Cities.updateTerritory(App.game); return ((performance.now() - t) / 20).toFixed(2); })()"))

        # exploration automatique : Arcane entièrement connu, le Miroir non ; l'éclaireur file vers la tour la plus proche et passe
        r = await pg.evaluate("""async () => { const g = App.game, w = g.world, me = App.me(); UI.closeAll();
          g.caches = []; for (let i = 0; i < w.w * w.h; i++) { me.explored[0][i] = 1; me.explored[1][i] = 0; }
          const tw = g.sites.find(s => s.type === 'tower' && s.plane === 0); if (!tw) return 'pas de tour';
          for (const s of g.sites) if (s.type === 'tower' && s.x === tw.x && s.y === tw.y) { s.cleared = true; s.guardians = []; }
          // un départ à quelques cases de la tour, sur la terre ferme
          let st = null; for (let r = 3; r <= 7 && !st; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) { const x = World.wx(w, tw.x + dx), y = tw.y + dy; if (World.inY(w, y) && !World.isWaterAt(w, 0, x, y) && !Cities.at(g, 0, x, y) && World.get(w, 0, 'site', x, y) < 0 && !Units.at(g, 0, x, y).length && Move.findPath(g, [{ type: 'HighMenScouts', owner: me.id, plane: 0, x, y, ench: [], xp: 0, dmg: 0 }], 0, tw.x, tw.y)) { st = [x, y]; break; } }
          if (!st) return 'pas de départ';
          const u = Units.create(g, 'HighMenScouts', me.id, 0, st[0], st[1]); window._sc = u.id;
          const steps = [];
          for (let turn = 0; turn < 6; turn++) {
            u.moves = Units.maxMoves(g, u); u.status = 'explore';
            const moved = await App.exploreStep([u]);
            steps.push({ moved, plan: u.plane, pos: u.x + ',' + u.y, statut: u.status });
            if (u.plane === 1 && turn > 0 && steps[steps.length - 2].plan === 1) break;
          }
          const log = g.log.slice(-6).map(l => l.text).filter(t => t.includes('poursuivre'));
          return { tour: [tw.x, tw.y], depart: st, etapes: steps, journal: log, mirroirDevoile: me.explored[1].filter(Boolean).length }; }""")
        print('EXPLORATION', r)
        # tout est connu des deux côtés : l'exploration s'arrête au lieu de faire des allers-retours
        r = await pg.evaluate("""async () => { const g = App.game, w = g.world, me = App.me(), u = g.units[_sc];
          for (let i = 0; i < w.w * w.h; i++) { me.explored[0][i] = 1; me.explored[1][i] = 1; }
          u.moves = Units.maxMoves(g, u); u.status = 'explore'; const moved = await App.exploreStep([u]);
          return { moved, statut: u.status, plan: u.plane }; }""")
        print('TOUT CONNU', r)

        # Incarnation en cours, et la sixième place prise par un héros trouvé dans un temple
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), c = g.cities[me.fortress];
          for (const u of Object.values(g.units)) if (u.owner === me.id && u.hero) Units.remove(g, u);
          const ids = ['HeroRakir', 'HeroSerena', 'HeroAureus', 'HeroTumu', 'HeroYramrag'].map(k => Heroes.spawn(g, me, DATA.heroes[k], c.plane, c.x, c.y).id);
          if (!me.known.includes('incarnation')) me.known.push('incarnation');
          me.casting = { id: 'incarnation', target: null, progress: 200, cost: 500 };
          const avant = Spells.castingWarning(g, me);
          const n0 = g.log.length; Heroes.spawn(g, me, DATA.heroes.HeroShuri, c.plane, c.x, c.y);
          const alerte = g.log.slice(n0).map(l => l.text).filter(t => t.includes('six héros'));
          MagicUI.spellbook(); const m = [...document.querySelectorAll('.modal')].pop();
          const tete = [...m.querySelectorAll('div')].find(d => d.textContent.startsWith('En cours')).innerText;
          return { heros: Heroes.heroCount(g, me), avant, apres: Spells.castingWarning(g, me), alerte, tete }; }""")
        print('INCARNATION', r)
        await pg.wait_for_timeout(500)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'incarnation.png'))
        # Armées : l'avatar à part, les héros comptés sur six
        r = await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(); me.casting = null; const a = Game.summonAvatar(g, me);
          Panels.armies(); const m = [...document.querySelectorAll('.modal')].pop();
          return { avatar: a.ok, rubriques: [...m.querySelectorAll('.sect')].map(s => s.querySelector('h4').textContent + ' : ' + [...s.querySelectorAll('.box b')].map(b => b.textContent).join(', ')) }; }""")
        print('ARMEES', r)
        await pg.wait_for_timeout(400)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'armies.png'))
        # un héros se présente pendant l'Appel du champion, à cinq héros : avertissement
        r = await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me();
          const hs = Object.values(g.units).filter(u => u.owner === me.id && u.hero && !u.avatar); Units.remove(g, hs[hs.length - 1]);
          if (!me.known.includes('summon_champion')) me.known.push('summon_champion');
          me.casting = { id: 'summon_champion', target: null, progress: 100, cost: 750 };
          me.heroOffer = { hero: 'HeroTaki', fee: 131, level: 3, turn: g.turn };
          void App.offerPrompts(); return Heroes.heroCount(g, me); }""")
        await pg.wait_for_timeout(500)
        print('OFFRE', r, await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); const d = m && m.querySelector('.danger'); return d ? d.textContent : null; })()"))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'offer.png'))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Refuser'); if (b) b.click(); }")
        await pg.wait_for_timeout(300)
        # un groupe lent + rapide qui s'arrête : le rapide ne demande pas d'ordre ; seul, il en redemande
        r = await pg.evaluate("""async () => { UI.closeAll(); const g = App.game, w = g.world, me = App.me();
          for (const u of Object.values(g.units)) if (u.owner === me.id) u.status = 'sentry';
          let st = null; for (let y = 3; y < w.h - 3 && !st; y++) for (let x = 0; x < w.w && !st; x++) { const n = [x + 1, y]; if ([[x, y], n].every(([a, b]) => !World.isWaterAt(w, 0, a, b) && !Cities.at(g, 0, a, b) && World.get(w, 0, 'site', a, b) < 0 && !Units.at(g, 0, a, b).length && World.terr(w, 0, a, b) === T.GRASS && !World.hasRoad(w, 0, a, b))) st = [x, y]; }
          const s = Units.create(g, 'HighMenSwordsmen', me.id, 0, st[0], st[1]), c = Units.create(g, 'HighMenCavalry', me.id, 0, st[0], st[1]);
          s.moves = Units.maxMoves(g, s); c.moves = Units.maxMoves(g, c);
          await Game.moveGroup(g, [s.id, c.id], st[0] + 1, st[1]);
          const w1 = App.unitsWaiting().map(u => u.type);
          const m1 = [s.moves, c.moves];
          const c2 = Units.create(g, 'HighMenCavalry', me.id, 0, st[0], st[1]); c2.moves = Units.maxMoves(g, c2);
          await Game.moveGroup(g, [c2.id], st[0] + 1, st[1]);
          const w2 = App.unitsWaiting().filter(u => u.id === c2.id).map(u => u.type);
          return { mouvements: m1, enAttenteApresGroupe: w1, cavalierSeul: w2, suivante: document.querySelector('#nextbtn, .nextbtn') ? document.querySelector('#nextbtn, .nextbtn').textContent : null }; }""")
        print('GROUPE', r)
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
