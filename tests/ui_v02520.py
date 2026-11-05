"""v0.25.20 : rapport de forces sans compte de cités ni pourcentage, graphique de l'évolution des forces,
cartes des sorciers (cités repérées seulement), achat de la production depuis la liste des cités."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 860})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Aldoran', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('HISTOIRE AU DEPART', await pg.evaluate("(App.me().seenHistory || []).length"))

        # quelques tours joués (tout en sentinelle), contact avec deux rivaux
        await pg.evaluate("""() => { const g = App.game, me = App.me();
          for (const o of g.players) if (o !== me) Game.contact(g, me.id, o.id);
          for (const u of Object.values(g.units)) if (u.owner === me.id) u.status = 'sentry';
          me.researching = me.researching || me.researchOptions[0]; }""")
        for i in range(6):
            await pg.evaluate("() => { UI.closeAll(); for (const u of Object.values(App.game.units)) if (u.owner === App.pid) u.status = 'sentry'; const me = App.me(); if (!me.researching && me.researchOptions && me.researchOptions.length) me.researching = me.researchOptions[0]; App.endTurn(true); }")
            await pg.wait_for_function("() => !UI.busy", timeout=120000)
            await pg.wait_for_timeout(300)
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(200); await pg.evaluate("UI.closeAll()")
        h = await pg.evaluate("(() => { const hs = App.me().seenHistory; return { n: hs.length, tours: hs.map(e => e.t), lignes: hs[hs.length - 1].r.length, ex: hs[hs.length - 1].r }; })()")
        print('HISTOIRE', h)

        # rapport de forces : ni pourcentage ni compte de cités
        await pg.evaluate("() => { UI.closeAll(); Panels.wizards(); }"); await pg.wait_for_timeout(300)
        tab = await pg.evaluate("(document.querySelector('.modal .sect table') || {}).innerText")
        print('FORCES', tab)
        print('POURCENT OU COMPTE', any(s in tab for s in ['%', 'repérées', '/']))
        cards = await pg.evaluate("[...document.querySelectorAll('.modal .box .muted')].map(d => d.textContent).filter(t => t.includes('puissance'))")
        print('CARTES', cards)
        truth = await pg.evaluate("App.game.players.map(o => Cities.ofPlayer(App.game, o.id).length)")
        print('VRAIS NOMBRES', truth)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'forces.png'))

        # le graphique
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Graphique'); b.click(); }")
        await pg.wait_for_timeout(300)
        g1 = await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); const svg = m.querySelector('svg'); return { titre: m.querySelector('h2').textContent, chemins: svg ? svg.querySelectorAll('path').length : 0, legende: [...m.querySelectorAll('span')].map(s => s.textContent).filter(t => t) }; })()")
        print('GRAPHIQUE SCORE', g1)
        box = await pg.evaluate("(() => { const r = [...document.querySelectorAll('.modal')].pop().querySelector('svg').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        await pg.mouse.move(box[0] + box[2] * 0.7, box[1] + box[3] * 0.5); await pg.wait_for_timeout(150)
        print('RETICULE', await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); const d = [...m.querySelectorAll('div')].find(d => d.textContent.startsWith('Tour ') && d.style.position === 'absolute'); return d ? [...d.children].map(c => c.textContent) : null; })()"))
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'chart_score.png'))
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('span[title]')].find(s => (s.textContent.includes('(vous)') || s.textContent === 'Vous')).click(); }")
        await pg.wait_for_timeout(150)
        print('MASQUE', await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); return [m.querySelectorAll('svg path').length, [...m.querySelectorAll('span[title]')].find(s => (s.textContent.includes('(vous)') || s.textContent === 'Vous')).style.textDecoration]; })()"))
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('span[title]')].find(s => (s.textContent.includes('(vous)') || s.textContent === 'Vous')).click(); }")
        await pg.evaluate("() => { const m = [...document.querySelectorAll('.modal')].pop(); [...m.querySelectorAll('.tab')].find(t => t.textContent === 'Armée').click(); }")
        await pg.wait_for_timeout(200)
        g2 = await pg.evaluate("(() => { const m = [...document.querySelectorAll('.modal')].pop(); return { on: m.querySelector('.tab.on').textContent, chemins: m.querySelectorAll('svg path').length }; })()")
        print('GRAPHIQUE ARMEE', g2)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'chart_army.png'))

        # un vieux tour sans historique : le graphique l'annonce
        await pg.evaluate("() => { UI.closeAll(); const me = App.me(); window._h = me.seenHistory; me.seenHistory = [me.seenHistory[0]]; Panels.forcesChart(App.game, me); }")
        await pg.wait_for_timeout(200)
        print('GRAPHIQUE VIDE', await pg.evaluate("[...document.querySelectorAll('.modal')].pop().innerText.slice(0, 120)"))
        await pg.evaluate("() => { UI.closeAll(); App.me().seenHistory = _h; }")

        # liste des cités : acheter la production
        await pg.evaluate("""() => { const g = App.game, me = App.me(); me.gold = 5000;
          const c = g.cities[me.fortress]; c.prod = { type: 'building', id: Cities.buildableBuildings(g, c)[0] }; c.progress = 0; c.bought = false;
          window._c = c.id; UI.closeAll(); Panels.cities(); }""")
        await pg.wait_for_timeout(300)
        r = await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Acheter'));
          const c = App.game.cities[_c]; return { bouton: btn && btn.textContent, prix: Cities.buyPrice(App.game, c), or: App.me().gold, tresor: document.querySelector('.modal .muted span').textContent }; }""")
        print('ACHAT AVANT', r)
        if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, 'cities_buy.png'))
        await pg.evaluate("() => { [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Acheter')).click(); }")
        await pg.wait_for_timeout(300)
        r = await pg.evaluate("""() => { const c = App.game.cities[_c]; return { progres: c.progress, cout: Cities.prodCost(App.game, c), or: App.me().gold, tresor: document.querySelector('.modal .muted span').textContent,
          cellule: [...document.querySelectorAll('.modal td span')].map(s => s.textContent).filter(t => t === 'acheté'), citeOuverte: CityUI.cur != null, modales: document.querySelectorAll('.modal').length }; }""")
        print('ACHAT APRES', r)
        # trésor trop maigre : bouton grisé
        await pg.evaluate("() => { UI.closeAll(); const g = App.game, me = App.me(), c = g.cities[_c]; c.progress = 1; me.gold = 3; Panels.cities(); }")
        await pg.wait_for_timeout(300)
        print('ACHAT PAUVRE', await pg.evaluate("(() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Acheter')); return b ? [b.disabled, b.title] : null; })()"))
        # combat : survol d'un sort en cours, les unités touchées s'allument
        await pg.evaluate("""() => { UI.closeAll(); const g = App.game, me = App.me(), foe = g.players[1], c = g.cities[me.fortress];
          me.globals.push('holy_arms', 'crusade');
          const [x, y] = World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, 0, x, y) && !Cities.at(g, 0, x, y));
          const A = ['HighMenSpearmen', 'HighMenSwordsmen', 'HighMenBowmen'].map(t => Units.create(g, t, me.id, 0, x, y));
          A[0].ench.push('heroism'); A.push(Units.create(g, 'Unicorn', me.id, 0, x, y));
          const D = ['OrcSpearmen', 'OrcSwordsmen', 'Skeleton'].map(t => Units.create(g, t, foe.id, 0, x, y));
          window._bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: foe.id, plane: 0, x, y, rng: new RNG(3) });
          _bt.ench[ATT_SIDE].push('prayer', 'true_light'); _bt.ench[DEF_SIDE].push('wrack');
          const sk = _bt.units.find(b => b.u.type === 'Skeleton'); sk.curses.push('weakness');
          CombatView.run(g, _bt, {}); }""")
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent.startsWith('Commander')); if (b) b.click(); }")
        await pg.wait_for_function("() => _bt.side === CombatView.humanSide && !CombatView.busy", timeout=60000)
        await pg.wait_for_timeout(300)
        rows = await pg.evaluate("[...document.querySelectorAll('#c-spells .cspell')].map(r => r._spell.id)")
        print('SORTS EN COURS', rows)
        res = {}
        for sid in rows:
            box = await pg.evaluate("(id) => { const r = [...document.querySelectorAll('#c-spells .cspell')].find(r => r._spell.id === id); r.scrollIntoView({ block: 'nearest' }); const r2 = r.getBoundingClientRect(); return [r2.left + r2.width / 2, r2.top + r2.height / 2]; }", sid)
            await pg.mouse.move(box[0], box[1]); await pg.wait_for_timeout(250)
            res[sid] = await pg.evaluate("[CombatView.hlKey, Math.round(" + str(box[1]) + ")].concat((CombatView.hlCache ? CombatView.hlCache.hits : []).map(h => (h.good ? '+' : '-') + h.b.u.type.replace(/^(HighMen|Orc)/, '')))")
            if SHOTS and sid in ('true_light', 'wrack', 'crusade'): await pg.screenshot(path=os.path.join(SHOTS, 'hl_' + sid + '.png'))
        print('SURLIGNAGE', res)
        await pg.mouse.move(5, 5); await pg.wait_for_timeout(200)
        print('APRES SORTIE', await pg.evaluate("CombatView.hlRow ? CombatView.hlRow.matches(':hover') : null"))
        t0 = await pg.evaluate("(() => { const t = performance.now(); for (let i = 0; i < 20; i++) CombatView.activeSpells(); return (performance.now() - t) / 20; })()")
        print('COUT activeSpells ms', round(t0, 2))
        await pg.evaluate("() => { CombatView.bt.over = true; CombatView.close && CombatView.close(); UI.closeAll(); }")
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
