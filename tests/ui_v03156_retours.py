"""v0.31.56, retours de Cor'e : l'export manuel le dit ; des troupes arrêtées par une rencontre gardent leur route (tracée)
et « Reprendre la route » les relance ; un marché proposé par l'IA avec de l'or se lit et se conclut ; le Mot de rappel
dit qu'il ramène au cercle d'invocation."""
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
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale='fr-FR', accept_downloads=True)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(2500)
        await pg.evaluate("""() => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {}; Music.jingle = () => true;
          const g = Game.newGame({ seed: 6, mapW: 60, mapH: 40, opponents: 3, otherPlane: 0, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 9, books: { sorcery: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # 1. l'export manuel le dit
        await pg.evaluate("() => { App.setPref('saveDir', null); Panels.menu(); [...document.querySelectorAll('.modal .row')].find(x => /Exporter la partie/.test(x.textContent)).click(); }")
        await pg.wait_for_timeout(600)
        t = await pg.evaluate("() => [...document.querySelectorAll('#toasts .toast')].map(x => x.textContent).join(' | ')")
        ok('Partie exportée' in t and '.json' in t, 'export : %r' % t[:120])
        await pg.evaluate("UI.closeAll()")
        # 2. arrêtées par une rencontre : la route reste, et se reprend
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), w = g.world, cap = Object.values(g.cities).find(c => c.owner === me.id), p = cap.plane;
          // une ligne droite de 8 cases de terre depuis la capitale
          let line = null;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const L = []; for (let k = 1; k <= 8; k++) { const x = World.wx(w, cap.x + dx * k), y = cap.y + dy * k; const t = World.terr(w, p, x, y); if (y < 2 || y > w.h - 3 || World.isWater(t) || t === T.MOUNTAIN || Cities.at(g, p, x, y)) break; L.push([x, y, dx, dy]); }
            if (L.length === 8) { line = L; break; }
          }
          if (!line) return { skip: true };
          for (const q of [0, 1]) me.explored[q].fill(1);
          const u = Units.create(g, 'HighMenCavalry', me.id, p, cap.x, cap.y); u.moves = 40;
          // un ennemi tout près de la route, aux deux tiers, hors de vue au départ
          const [mx, my, dx, dy] = line[5], ex = World.wx(w, mx - dy), ey = my + dx;   // à une case de la route : la cavalerie le voit en passant
          const ai = g.players.find(q => !q.human && q.alive); me.contact[ai.id] = ai.contact[me.id] = true; me.diplo[ai.id] = ai.diplo[me.id] = 'war';
          Units.create(g, 'HighMenSpearmen', ai.id, p, ex, ey);
          const vis0 = Move.visibility(g, me.id)[p][ey * w.w + ex];
          App.selectTile(p, cap.x, cap.y, [u.id]); const dest = line[7];
          await App.moveSelected(dest[0], dest[1]); await new Promise(r => setTimeout(r, 300));
          const out = { vis0, enemy: [ex, ey], line: line.map(q => q[0] + ',' + q[1]).join(' '), halted: !!u.halted, path: u.path ? u.path.length : 0, dest: u.dest, at: [u.x, u.y], waiting: App.unitsWaiting().includes(u),
            btn: [...document.querySelectorAll('.actions .abtn')].map(b => b.textContent).filter(t => /Reprendre la route/.test(t)).length, toasts: [...document.querySelectorAll('#toasts .toast')].map(x => x.textContent).join(' | ') };
          // reprendre : la troupe repart vers sa destination
          App.selectTile(p, u.x, u.y, [u.id]); App.refresh(); await new Promise(r => setTimeout(r, 100));
          const b = [...document.querySelectorAll('.actions .abtn')].find(b => /Reprendre la route/.test(b.textContent)); out.btn2 = !!b;
          const before = [u.x, u.y]; if (b) b.click(); await new Promise(r => setTimeout(r, 2500));
          out.after = [u.x, u.y]; out.moved = before[0] !== u.x || before[1] !== u.y; out.halted2 = !!u.halted; out.reached = u.x === dest[0] && u.y === dest[1];
          return out; }""")
        if r.get('skip'): ok(True, '(pas de ligne droite de terre ici)')
        else:
            ok(r['halted'] and r['path'] > 0 and r['waiting'], 'arrêtée par une rencontre : route gardée (%s cases), attend un ordre (%s) [vis0 %s, ennemi %s, ligne %s]' % (r['path'], r['toasts'][:80], r['vis0'], r['enemy'], r['line']))
            ok(r['btn2'], 'bouton « Reprendre la route »')
            ok(r['moved'] and not r['halted2'], 'reprise : la troupe repart (%s → %s, arrivée %s)' % (r['at'], r['after'], r['reached']))
        await pg.evaluate("UI.closeAll()")
        # 3. un marché proposé par l'IA, avec de l'or
        r = await pg.evaluate("""async () => { const g = App.game, me = App.me(), a = g.players.find(q => !q.human && q.alive);
          me.contact[a.id] = a.contact[me.id] = true; me.diplo[a.id] = a.diplo[me.id] = 'none'; me.relations[a.id] = a.relations[me.id] = 10; me.gold = 5000; a.gold = 900;
          const arc = Object.keys(DATA.spells).filter(id => { const s = DATA.spells[id]; return s.realm === 'arcane' && s.research > 0 && !/^lore_/.test(id) && !(s.params && s.params.gate) && id !== 'spell_of_mastery' && !me.known.includes(id) && !a.known.includes(id); }).sort((x, y) => DATA.spells[y].research - DATA.spells[x].research);
          a.known.push(arc[0]); me.known.push(arc[arc.length - 1]);
          const d = { give: [arc[0]], get: [arc[arc.length - 1]], tgold: Diplomacy.fairGold(g, me, a, [arc[0]], [arc[arc.length - 1]], 1) };
          const off = { from: a.id, kind: 'trade', turn: g.turn, give: d.give, get: d.get, tgold: d.tgold }; Diplomacy.offer(g, me, off);
          const pr = App.offerPrompt(off); await new Promise(r => setTimeout(r, 600));
          const txt = [...document.querySelectorAll('.modal')].map(m => m.textContent).join(' ');
          const g0 = me.gold; const acc = [...document.querySelectorAll('.modal footer button')].find(b => /Accepter/.test(b.textContent)); if (acc) acc.click();
          await new Promise(r => setTimeout(r, 400));
          return { txt: txt.slice(txt.indexOf('Il propose'), txt.indexOf('Il propose') + 160), paid: g0 - me.gold, tgold: d.tgold, learned: me.known.includes(arc[0]) && a.known.includes(arc[arc.length - 1]) }; }""")
        ok('Il propose un marché' in r['txt'] and ('or' in r['txt']), 'offre lue : %r' % r['txt'])
        ok(r['learned'] and r['paid'] == r['tgold'] and r['tgold'] > 0, 'acceptée : sorts échangés, %s or versés' % r['paid'])
        await pg.evaluate("UI.closeAll()")
        # 4. le Mot de rappel le dit
        d = await pg.evaluate("() => DATA.spells.word_of_recall.desc + ' / ' + DATA.spells.recall_hero.desc")
        ok('cercle d\'invocation' in d, 'descriptions : %r' % d[:90])
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
    srv.shutdown()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
