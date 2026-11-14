"""v0.31.55, demandes du forum validées par Olivier : passer d'un héros à l'autre dans sa fiche, un fond net derrière les
fenêtres (réglable), le marché de sorts à plusieurs sorts et à l'or, la bataille semi-automatique (vous lancez les sorts,
vos troupes jouent quand vous finissez le tour)."""
import asyncio, os, sys, http.server, threading, functools
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except (ConnectionResetError, BrokenPipeError): pass
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
        # 1. d'un héros à l'autre dans la fiche
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), cap = Object.values(g.cities).find(c => c.owner === me.id);
          const h1 = Heroes.spawn(g, me, DATA.heroes.HeroBahgtru, cap.plane, cap.x, cap.y, 100), h2 = Heroes.spawn(g, me, DATA.heroes.HeroGunther, cap.plane, cap.x, cap.y, 100);
          Panels.heroSheet(h1); const t = () => document.querySelector('.modal header h2').textContent;
          const btn = s => [...document.querySelectorAll('.modal header .herohead')].find(b => b.textContent === s);
          const out = { first: t(), has: !!btn('›') && !!btn('‹') }; btn('›').click(); await new Promise(r => setTimeout(r, 100)); out.next = t();
          btn('›').click(); await new Promise(r => setTimeout(r, 100)); out.back = t(); out.names = [h1.hero.name, h2.hero.name]; UI.closeAll(); return out; }""")
        ok(r['has'] and r['first'] == r['names'][0] and r['next'] == r['names'][1] and r['back'] == r['names'][0], 'fiche : héros suivant puis retour (%s)' % r)
        # 2. le fond des fenêtres : net par défaut, flou au choix
        r = await pg.evaluate("""async () => { App.setPref('backdrop', null); const m = UI.modal({ title: 'essai', body: h('div', null, 'x') }); await new Promise(r => setTimeout(r, 250));
          const ov = m.el.parentNode, s1 = getComputedStyle(ov), a = { blur: s1.backdropFilter, bg: s1.backgroundColor }; m.close();
          App.setPref('backdrop', 'blur'); const m2 = UI.modal({ title: 'essai', body: h('div', null, 'x') }); await new Promise(r => setTimeout(r, 250));
          a.blur2 = getComputedStyle(m2.el.parentNode).backdropFilter; m2.close(); App.setPref('backdrop', null);
          Panels.menu(); const row = () => [...document.querySelectorAll('.modal .row .t1')].map(x => x.textContent).find(x => /Fond des fenêtres/.test(x)); a.row = row();
          [...document.querySelectorAll('.modal .row')].find(x => /Fond des fenêtres/.test(x.textContent)).click(); await new Promise(r => setTimeout(r, 150)); a.row2 = row(); a.pref = App.prefs.backdrop;
          UI.closeAll(); App.setPref('backdrop', null); return a; }""")
        ok(r['blur'] in ('none', '') and '0.45' in r['bg'], 'fond net et assombri par défaut (%s, %s)' % (r['blur'], r['bg']))
        ok('blur' in (r['blur2'] or ''), 'réglage flou : %s' % r['blur2'])
        ok(r['row'] == 'Fond des fenêtres : net, assombri' and r['row2'] == 'Fond des fenêtres : net, à peine assombri' and r['pref'] == 'light', 'menu : %s → %s' % (r['row'], r['row2']))
        # 3. le marché de sorts : deux sorts contre un, l'or qui équilibre
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), o = g.players.find(p => !p.human && p.alive);
          me.contact[o.id] = o.contact[me.id] = true; me.diplo[o.id] = o.diplo[me.id] = 'none'; me.relations[o.id] = o.relations[me.id] = 20; me.gold = 6000;
          const arc = Object.keys(DATA.spells).filter(id => { const s = DATA.spells[id]; return s.realm === 'arcane' && s.research > 0 && !/^lore_/.test(id) && !(s.params && s.params.gate) && id !== 'spell_of_mastery' && !me.known.includes(id) && !o.known.includes(id); }).sort((x, y) => DATA.spells[y].research - DATA.spells[x].research);
          const [x1, x2, y1] = [arc[0], arc[1], arc[arc.length - 1]]; o.known.push(x1, x2); me.known.push(y1);
          Panels.spellTrade(o); const q = () => document.querySelector('.modal:last-child') || document.querySelector('.modal');
          const items = () => [...document.querySelectorAll('.modal .tradeitem')];
          const click = name => { const e = items().find(i => i.querySelector('b').textContent === name); e.click(); };
          // le premier sort est déjà choisi ; on ajoute le second, et le sort à lui apprendre
          click(DATA.spells[x2].name); click(DATA.spells[y1].name); await new Promise(r => setTimeout(r, 80));
          const on = items().filter(i => i.classList.contains('on')).length;
          const verdict0 = [...document.querySelectorAll('.modal .body > div > div')].map(d => d.textContent).find(t => /marché|présent|Choisissez/.test(t)) || '';
          const eq = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Équilibrer'); eq && eq.click(); await new Promise(r => setTimeout(r, 80));
          const pay = +[...document.querySelectorAll('.modal .tradegold')][1].value, fair = Diplomacy.fairGold(g, me, o, [x1, x2], [y1]);
          const verdict = [...document.querySelectorAll('.modal .body > div > div')].map(d => d.textContent).find(t => /marché/.test(t)) || '';
          const gold0 = me.gold; [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Proposer l\\'échange').click(); await new Promise(r => setTimeout(r, 150));
          return { on, verdict0, eq: !!eq, pay, fair, verdict, learned: me.known.includes(x1) && me.known.includes(x2) && o.known.includes(y1), paid: gold0 - me.gold, open: !!document.querySelector('.modal .tradeitem') }; }""")
        ok(r['on'] == 3, 'trois sorts choisis (%s)' % r['on'])
        ok('trop inégal' in r['verdict0'], 'sans or : trop inégal (%r)' % r['verdict0'][:60])
        ok(r['eq'] and r['pay'] == r['fair'] and r['fair'] > 0, '« Équilibrer » propose %s or (juste : %s)' % (r['pay'], r['fair']))
        ok('acceptera' in r['verdict'], 'avec l\'or : %r' % r['verdict'][:60])
        ok(r['learned'] and r['paid'] == r['fair'] and not r['open'], 'marché conclu, %s or versés' % r['paid'])
        await pg.evaluate("UI.closeAll()")
        # 4. bataille semi-automatique : la main au joueur à chaque tour, ses troupes jouent quand il le finit
        await pg.evaluate("""() => { const g = App.game, me = App.me(), ai = g.players.find(p => !p.human && p.alive), cap = Object.values(g.cities).find(c => c.owner === me.id);
          let x = cap.x + 3, y = cap.y; for (const u of Object.values(g.units)) if (u.x === x && u.y === y) delete g.units[u.id];
          const A = [Units.create(g, 'HighMenSwordsmen', me.id, cap.plane, x, y), Units.create(g, 'HighMenBowmen', me.id, cap.plane, x, y)], D = [Units.create(g, 'HighMenSpearmen', ai.id, cap.plane, x, y), Units.create(g, 'HighMenSpearmen', ai.id, cap.plane, x, y)];
          window.AUTO_COMBAT = false; App.prefs.autoSpeed = 'fast'; window.__bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: ai.id, plane: cap.plane, x, y });
          window.__res = null; CombatView.run(g, window.__bt, {}).then(r => { window.__res = 'fini'; }); }""")
        await pg.wait_for_timeout(1200)
        intro = await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].map(b => b.textContent)")
        ok('Semi-automatique' in intro, 'choix en ouverture : %s' % intro)
        await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].find(x => x.textContent === 'Semi-automatique').click()")
        wait_mine = "() => CombatView.bt && (CombatView.bt.over || (CombatView.bt.side === CombatView.humanSide && !CombatView.busy))"
        for _ in range(40):
            await pg.wait_for_timeout(250)
            if await pg.evaluate(wait_mine): break
        st = await pg.evaluate("() => { const bt = CombatView.bt; return { semi: CombatView.semi, auto: CombatView.auto, mine: bt.side === CombatView.humanSide, moves: bt.alive(CombatView.humanSide).map(b => b.moves), round: bt.round, bar: [...document.querySelectorAll('#c-bar button')].filter(b => b.classList.contains('on')).map(b => b.textContent) }; }")
        ok(st['semi'] and not st['auto'] and st['mine'] and all(m > 0 for m in st['moves']), 'votre tour : la main, les troupes attendent (%s)' % st)
        ok('Semi-automatique' in st['bar'], 'bouton Semi-automatique allumé (%s)' % st['bar'])
        r0 = st['round']
        pos0 = await pg.evaluate("() => JSON.stringify(CombatView.bt.alive(CombatView.humanSide).map(b => [b.c, b.r]).concat(CombatView.bt.units.filter(b => b.side !== CombatView.humanSide).map(b => [b.dmg || 0, b.dead ? 1 : 0, b.figs || 0])))")
        await pg.evaluate("() => CombatView.endTurn()")
        for _ in range(80):
            await pg.wait_for_timeout(250)
            if await pg.evaluate("() => CombatView.bt.over || (CombatView.bt.side === CombatView.humanSide && !CombatView.busy && CombatView.bt.round > %d)" % r0): break
        st2 = await pg.evaluate("() => { const bt = CombatView.bt; return { over: bt.over, round: bt.round, mine: bt.side === CombatView.humanSide, busy: CombatView.busy, moves: bt.alive(CombatView.humanSide).map(b => b.moves), acted: bt.log.length }; }")
        ok(st2['over'] or (st2['round'] > r0 and st2['mine'] and not st2['busy'] and all(m > 0 for m in st2['moves'])), 'après « Fin du tour » : vos troupes ont joué, puis la main revient (%s)' % st2)
        pos1 = await pg.evaluate("() => JSON.stringify(CombatView.bt.alive(CombatView.humanSide).map(b => [b.c, b.r]).concat(CombatView.bt.units.filter(b => b.side !== CombatView.humanSide).map(b => [b.dmg || 0, b.dead ? 1 : 0, b.figs || 0])))")
        ok(st2['over'] or pos0 != pos1, 'vos troupes ont bien agi (%s → %s)' % (pos0, pos1))
        await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v03155_semi.png'))
        # la suite en automatique pour finir
        await pg.evaluate("() => { if (!CombatView.bt.over) CombatView.toggleAuto(); }")
        for _ in range(80):
            await pg.wait_for_timeout(500)
            if await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].some(b => /Accepter|Continuer|Revoir/.test(b.textContent))"): break
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')].find(x => /Accepter|Continuer/.test(x.textContent)); if (b) b.click(); }"); await pg.wait_for_timeout(800)
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
    srv.shutdown()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
