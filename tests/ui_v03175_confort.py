"""v0.31.75 : confort de jeu. Touches personnalisables, sauvegarde et chargement rapides (avec garde à la fermeture de la page),
patrouille de zone, mouvements adverses vus, repères, recherche sur la carte, file d'incantations, sorts rapides en combat,
comparaison des objets du coffre, filtres du journal."""
import asyncio, os, http.server, threading, functools, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
FAIL = []
ONLY = sys.argv[1:]
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except (ConnectionResetError, BrokenPipeError): pass

async def idle(pg):
    for _ in range(80):
        if not await pg.evaluate("CombatView.busy"): return
        await pg.wait_for_timeout(200)

async def fresh(pg, port, seed=5):
    await pg.goto('http://127.0.0.1:%d/index.html' % port); await pg.wait_for_timeout(2200)
    await pg.evaluate("""(seed) => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {}; Music.jingle = () => true;
      localStorage.removeItem('arcanes:quick'); localStorage.removeItem('arcanes:quick:meta'); App.setPref('keys', {});
      const g = Game.newGame({ seed, opponents: 2, crisis: 'off', finale: 'off', human: { name: 'X', portrait: 0, books: { sorcery: 6, chaos: 5 }, retorts: [], race: 'highmen' } });
      App.start(g); App.me().mana = 3000; }""", seed)
    await pg.wait_for_timeout(1800); await pg.evaluate("UI.closeAll()")

# une case d'herbe libre à distance d de la forteresse, et une autre à côté
FIND = """(d) => { const g = App.game, pl = App.me(), w = g.world, fc = g.cities[pl.fortress];
  for (let r = d; r < d + 8; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [-r, r]) { const x = World.wx(w, fc.x + dx), y = fc.y + dy;
    const free = (x, y) => World.inY(w, y) && World.terr(w, 0, x, y) === T.GRASS && !Cities.at(g, 0, x, y) && !Units.at(g, 0, x, y).length && World.get(w, 0, 'site', x, y) < 0;
    if (!free(x, y)) continue;
    const nb = World.neighbors(w, x, y).filter(([nx, ny]) => free(nx, ny));
    if (nb.length >= 2) return [x, y, nb[0][0], nb[0][1], nb[1][0], nb[1][1]]; }
  return null; }"""

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Q, directory=os.path.join(ROOT, 'dist', 'arcanes')))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); port = srv.server_address[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 860}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await fresh(pg, port)

        # ---------- touches ----------
        if not ONLY or 'touches' in ONLY:
            await pg.evaluate("Panels.menu()"); await pg.wait_for_timeout(300)
            txt = await pg.evaluate("document.querySelector('.modal').innerText")
            ok('Touches' in txt, 'le menu propose « Touches »')
            await pg.evaluate("UI.closeAll(); Keys.panel()"); await pg.wait_for_timeout(300)
            n = await pg.evaluate("document.querySelectorAll('.keyset .kbtn').length")
            ok(n >= 40, 'l\'écran des touches liste les ordres de la carte et du combat (%d)' % n)
            await pg.screenshot(path=os.path.join(SHOTS, '03175-touches.png'))
            # Grimoire : G -> Q ; puis Q ouvre le grimoire, G ne fait plus rien
            await pg.evaluate("""() => { const row = [...document.querySelectorAll('.keyset .kv')].find(r => r.firstChild.textContent === 'Grimoire'); row.querySelector('button').click(); }""")
            await pg.keyboard.press('q'); await pg.wait_for_timeout(200)
            r = await pg.evaluate("() => ({ k: Keys.get('spellbook'), lab: [...document.querySelectorAll('.keyset .kv')].find(r => r.firstChild.textContent === 'Grimoire').querySelector('button').textContent })")
            ok(r['k'] == 'q' and r['lab'] == 'Q', 'une touche se change (%r)' % r)
            # échange : Magie (M) prend Q, le grimoire reçoit M
            await pg.evaluate("""() => { const row = [...document.querySelectorAll('.keyset .kv')].find(r => r.firstChild.textContent === 'Magie'); row.querySelector('button').click(); }""")
            await pg.keyboard.press('q'); await pg.wait_for_timeout(200)
            r = await pg.evaluate("() => ({ g: Keys.get('spellbook'), m: Keys.get('magic') })")
            ok(r['g'] == 'm' and r['m'] == 'q', 'une touche déjà prise s\'échange (%r)' % r)
            # Échap annule l'attente sans rien changer
            await pg.evaluate("""() => { const row = [...document.querySelectorAll('.keyset .kv')].find(r => r.firstChild.textContent === 'Armées'); row.querySelector('button').click(); }""")
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
            r = await pg.evaluate("() => ({ a: Keys.get('armies'), open: UI.modals.length })")
            ok(r['a'] == 'a' and r['open'] == 1, 'Échap annule sans fermer l\'écran (%r)' % r)
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(100)
            await pg.keyboard.press('m'); await pg.wait_for_timeout(300)
            t = await pg.evaluate("UI.modals.length ? document.querySelector('.modal h2').textContent : ''")
            ok('Grimoire' in t, 'M ouvre désormais le grimoire (%r)' % t)
            await pg.evaluate("UI.closeAll()"); await pg.keyboard.press('g'); await pg.wait_for_timeout(300)
            ok(await pg.evaluate("UI.modals.length") == 0, 'G ne fait plus rien')
            # l'aide montre la touche changée
            await pg.evaluate("UI.closeAll(); Panels.help()"); await pg.wait_for_timeout(200)
            r = await pg.evaluate("[...document.querySelectorAll('.modal .kbd')].map(e => e.textContent)")
            ok(r[10] == 'M' and r[11] == 'Q' and 'F5' in r and 'Ctrl+F' in r, 'l\'aide suit les touches et liste les nouvelles (%r)' % r[9:13])
            await pg.evaluate("UI.closeAll(); Keys.reset()")
            ok(await pg.evaluate("Keys.get('spellbook') === 'g' && Keys.get('magic') === 'm'"), 'les touches par défaut reviennent')

        # ---------- sauvegarde rapide ----------
        if not ONLY or 'rapide' in ONLY:
            ok(await pg.evaluate("App.unsaved()"), 'une partie neuve n\'est pas encore sauvegardée')
            await pg.keyboard.press('F5'); await pg.wait_for_timeout(300)
            r = await pg.evaluate("() => ({ meta: App.saveMeta('quick'), unsaved: App.unsaved(), url: location.href })")
            ok(r['meta'] and r['meta']['turn'] == 1 and not r['unsaved'], 'F5 sauvegarde au lieu de recharger la page (%r)' % r['meta'])
            # survoler la carte (prévisions de bataille) ne compte pas comme un coup joué
            await pg.mouse.move(700, 400); await pg.mouse.move(760, 430); await pg.wait_for_timeout(300)
            ok(not await pg.evaluate("App.unsaved()"), 'survoler la carte ne rend pas la partie « non sauvegardée »')
            # un coup joué, puis F9 : confirmation, et retour à la sauvegarde
            await pg.evaluate("() => { const u = Object.values(App.game.units).find(u => u.owner === App.pid); App._q = { id: u.id, x: u.x }; u.x = World.wx(App.game.world, u.x + 1); }")
            ok(await pg.evaluate("App.unsaved()"), 'un coup joué rend la partie non sauvegardée')
            await pg.keyboard.press('F9'); await pg.wait_for_timeout(300)
            t = await pg.evaluate("UI.modals.length ? document.querySelector('.modal').innerText : ''")
            ok('Chargement rapide' in t and 'perdu' in t, 'F9 demande confirmation')
            await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Charger').click()")
            await pg.wait_for_timeout(1500); await pg.evaluate("UI.closeAll()")
            r = await pg.evaluate("() => App.game.units[App._q.id].x === App._q.x")
            ok(r, 'F9 ramène la partie à la sauvegarde rapide')
            ok(await pg.evaluate("[...['quick','auto','manual','prev']].filter(s => localStorage.getItem('arcanes:' + s)).includes('quick')"), 'l\'emplacement rapide figure parmi les sauvegardes')
            await pg.evaluate("Setup.loadMenu()"); await pg.wait_for_timeout(200)
            t = await pg.evaluate("document.querySelector('.modal').innerText")
            ok('Sauvegarde rapide' in t, '« Charger » propose la sauvegarde rapide')
            await pg.evaluate("UI.closeAll()")
            # Ctrl+S : même chose, sans la fenêtre du navigateur
            await pg.evaluate("() => { const u = Object.values(App.game.units).find(u => u.owner === App.pid); u.x = World.wx(App.game.world, u.x + 1); }")
            await pg.keyboard.press('Control+s'); await pg.wait_for_timeout(300)
            ok(not await pg.evaluate("App.unsaved()"), 'Ctrl+S sauvegarde aussi')

        # ---------- patrouille ----------
        if not ONLY or 'patrouille' in ONLY:
            await fresh(pg, port, 7)
            at = await pg.evaluate(FIND, 4)
            ok(at is not None, 'un terrain dégagé pour la patrouille')
            r = await pg.evaluate("""(at) => { const g = App.game, pl = App.me(), foe = g.players[1];
              pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war';
              const ids = ['HighMenCavalry', 'HighMenCavalry', 'HighMenSwordsmen', 'HighMenSwordsmen'].map(t => Units.create(g, t, pl.id, 0, at[0], at[1]).id);
              for (const id of ids) g.units[id].moves = Units.maxMoves(g, g.units[id]);
              Move.revealAllFor(g, pl); MapView.invalidateVis(); MapView.centerOn(at[0], at[1], 0);
              App.selectTile(0, at[0], at[1], ids); App._pat = ids; return ids.length; }""", at)
            await pg.keyboard.press('z'); await pg.wait_for_timeout(300)
            t = await pg.evaluate("UI.modals.length ? document.querySelector('.modal').innerText : ''")
            ok('Patrouille' in t and '3 cases' in t, 'Z ouvre le choix du rayon')
            await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].find(b => b.textContent === '2 cases').click()")
            await pg.wait_for_timeout(300)
            r = await pg.evaluate("() => App._pat.map(id => App.game.units[id]).map(u => [u.status, u.patrol && u.patrol.r])")
            ok(all(x == ['patrol', 2] for x in r), 'la pile passe en patrouille, rayon 2 (%r)' % r)
            ok(await pg.evaluate("!App.unitsWaiting().some(u => App._pat.includes(u.id))"), 'une pile en patrouille n\'attend plus d\'ordre')
            await pg.evaluate("(at) => { App.selectTile(0, at[0], at[1], App._pat); App.refresh(); }", at)
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=os.path.join(SHOTS, '03175-patrouille.png'))
            # un ennemi hors de la zone : rien ; un ennemi faible dans la zone : attaqué
            r = await pg.evaluate("""(at) => { const g = App.game, foe = g.players[1], w = g.world;
              const far = [World.wx(w, at[0] + 4), at[1]];
              const o = Units.create(g, 'OrcSpearmen', foe.id, 0, far[0], far[1]);
              return { foes: App.patrolFoes(App._pat.map(id => g.units[id])).length, id: o.id }; }""", at)
            ok(r['foes'] == 0, 'un ennemi à 4 cases échappe à une zone de 2')
            r = await pg.evaluate("""(at) => { const g = App.game, foe = g.players[1], w = g.world;
              const o = Units.create(g, 'OrcSpearmen', foe.id, 0, at[4], at[5]); App._foe = o.id; MapView.invalidateVis();
              const grp = App._pat.map(id => g.units[id]);
              return { foes: App.patrolFoes(grp).length, reach: App.patrolReach(grp, at[4], at[5]) }; }""", at)
            ok(r['foes'] == 1 and r['reach'], 'l\'ennemi entré dans la zone est vu et atteignable (%r)' % r)
            # au début du tour : l'attaque, la fenêtre de bataille habituelle
            await pg.evaluate("() => { App._pst = App.patrolStep(); }")
            for _ in range(30):
                await pg.wait_for_timeout(300)
                if await pg.evaluate("[...document.querySelectorAll('.modal footer button')].some(b => b.textContent === 'Résolution automatique')"): break
            ok(await pg.evaluate("[...document.querySelectorAll('.modal footer button')].some(b => b.textContent === 'Résolution automatique')"), 'la patrouille attaque : la fenêtre de bataille s\'ouvre')
            await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Résolution automatique').click()")
            for _ in range(60):
                await pg.wait_for_timeout(400)
                if not await pg.evaluate("CombatView.active"): break
            for _ in range(20):
                await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
                if await pg.evaluate("Promise.race([App._pst.then(() => true), new Promise(r => setTimeout(() => r(false), 50))])"): break
            r = await pg.evaluate("() => ({ foe: !!App.game.units[App._foe], st: App._pat.filter(id => App.game.units[id]).map(id => App.game.units[id].status) })")
            ok(not r['foe'] and r['st'] and all(s == 'patrol' for s in r['st']), 'l\'ennemi est vaincu et la pile reste en patrouille (%r)' % r)
            # sans cible, elle regagne son poste au tour suivant
            await pg.evaluate("() => { for (const id of App._pat) { const u = App.game.units[id]; if (u) u.moves = Units.maxMoves(App.game, u); } return App.patrolStep(); }")
            await pg.wait_for_timeout(800)
            r = await pg.evaluate("(at) => App._pat.filter(id => App.game.units[id]).every(id => { const u = App.game.units[id]; return u.x === at[0] && u.y === at[1]; })", at)
            ok(r, 'sans cible, la patrouille regagne son poste')
            # trop fort pour elle : elle tient, et le journal le dit
            r = await pg.evaluate("""(at) => { const g = App.game, foe = g.players[1];
              for (let i = 0; i < 6; i++) Units.create(g, 'GreatDrake', foe.id, 0, at[4], at[5]);
              for (const id of App._pat) { const u = g.units[id]; if (u) u.moves = Units.maxMoves(g, u); }
              const n0 = g.log.length; return App.patrolStep().then(() => ({ log: g.log.slice(n0).map(e => e.text).join(' | '), still: App._pat.filter(id => g.units[id]).every(id => g.units[id].x === at[0]) })); }""", at)
            ok('tient sa position' in r['log'] and r['still'], 'devant plus fort qu\'elle, la patrouille tient et le journal le dit (%r)' % r['log'][:160])
            # un ordre de marche donné à la main lève la patrouille
            await pg.evaluate("""(at) => { const g = App.game; for (const u of Object.values(g.units)) if (u.owner === 1 && u.type === 'GreatDrake') delete g.units[u.id];
              App.selectTile(0, at[0], at[1], App._pat.filter(id => g.units[id])); return App.moveSelected(at[2], at[3]); }""", at)
            await pg.wait_for_timeout(800)
            r = await pg.evaluate("() => App._pat.filter(id => App.game.units[id]).map(id => App.game.units[id].status)")
            ok(r and all(s != 'patrol' for s in r), 'un déplacement ordonné à la main lève la patrouille (%r)' % r)

        # ---------- mouvements adverses, repères, recherche ----------
        if not ONLY or 'carte' in ONLY:
            await fresh(pg, port, 9)
            at = await pg.evaluate(FIND, 3)
            # une pile ennemie en vue marche pendant l'intertour : ses pas sont relevés et dessinés au début du tour
            r = await pg.evaluate("""(at) => { const g = App.game, pl = App.me(), foe = g.players[1], w = g.world;
              Move.revealAllFor(g, pl); MapView.invalidateVis();
              const o = Units.create(g, 'OrcCavalry', foe.id, 0, at[2], at[3]); o.moves = 4;
              Units.create(g, 'HighMenSpearmen', pl.id, 0, at[0], at[1]);   // de quoi voir la route
              App._trail = { vis: Move.visibility(g, App.pid), segs: [] };
              return Game.moveGroup(g, [o.id], at[4], at[5], { auto: true, noAttack: true }).then(r => {
                const segs = App._trail.segs.length; App.foeTrail = { segs: App._trail.segs, t0: null, turn: g.turn, hold: true }; App._trail = null;
                MapView.centerOn(at[2] + 1, at[3], 0); return { segs, moved: r.moved }; }); }""", at)
            ok(r['segs'] >= 1 and r['segs'] == r['moved'], 'les pas d\'une pile adverse en vue sont relevés (%r)' % r)
            await pg.wait_for_timeout(400)
            ok(await pg.evaluate("App.foeTrail.t0 == null"), 'les flèches attendent que les fenêtres se ferment')
            await pg.evaluate("UI.closeAll(); App.foeTrail.hold = false"); await pg.wait_for_timeout(500)   # (le premier contact avec ce sorcier)
            await pg.screenshot(path=os.path.join(SHOTS, '03175-mouvements-adverses.png'))
            ok(await pg.evaluate("App.foeTrail.t0 != null"), 'les flèches s\'affichent dès qu\'aucune fenêtre ne les cache')
            await pg.evaluate("App.foeTrail.t0 = performance.now() - 9000"); await pg.keyboard.press('y'); await pg.wait_for_timeout(100)
            ok(await pg.evaluate("performance.now() - App.foeTrail.t0 < 1000"), 'Y les remontre')
            # le moteur ne relève rien pour les pas de vos propres troupes
            r = await pg.evaluate("""(at) => { const g = App.game, pl = App.me(), u = Units.create(g, 'HighMenSpearmen', pl.id, 0, at[4], at[5]); u.moves = 2;
              App._trail = { vis: Move.visibility(g, App.pid), segs: [] };
              return Game.moveGroup(g, [u.id], at[0], at[1], { auto: true, noAttack: true }).then(() => { const n = App._trail.segs.length; App._trail = null; return n; }); }""", at)
            ok(r == 0, 'vos propres pas ne sont pas relevés')
            # repère : K sur la case survolée, une note, l'épingle sur la carte et la mini-carte, la fiche de la case
            await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
            await pg.evaluate("(at) => { MapView.hover = { x: at[0], y: at[1] }; }", at)
            await pg.keyboard.press('k'); await pg.wait_for_timeout(250)
            ok(await pg.evaluate("!!document.querySelector('.modal input[type=text]')"), 'K ouvre la note du repère')
            await pg.keyboard.type('Antre à reprendre avec Garth'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
            r = await pg.evaluate("(at) => { const q = App.pinAt(0, at[0], at[1]); MapView.hover = { x: at[0], y: at[1] }; App.refresh(); return { note: q && q.note, info: document.querySelector('#tileinfo').innerText }; }", at)
            ok(r['note'] == 'Antre à reprendre avec Garth' and 'Antre à reprendre' in r['info'], 'le repère et sa note, dans la fiche de la case (%r)' % r['note'])
            await pg.wait_for_timeout(200)
            await pg.screenshot(path=os.path.join(SHOTS, '03175-repere.png'))
            # le repère est sauvegardé avec la partie
            ok(await pg.evaluate("JSON.parse(App.serialize()).players[App.pid].pins.length === 1"), 'le repère est gardé dans la sauvegarde')
            # retirer
            await pg.evaluate("(at) => { MapView.hover = { x: at[0], y: at[1] }; }", at)
            await pg.keyboard.press('k'); await pg.wait_for_timeout(200)
            await pg.evaluate("() => [...document.querySelectorAll('.modal footer button')].find(b => b.textContent === 'Retirer le repère').click()")
            ok(await pg.evaluate("(at) => !App.pinAt(0, at[0], at[1])", at), 'un repère se retire')
            # recherche : Ctrl+F, par nom (sans accents), Entrée centre la carte sur le premier résultat
            await pg.evaluate("(at) => { App.me().pins = [{ plane: 0, x: at[0], y: at[1], note: 'Gué des Ombres', t: 1 }]; MapView.centerOn(0, 0, 0); }", at)
            await pg.keyboard.press('Control+f'); await pg.wait_for_timeout(250)
            t = await pg.evaluate("UI.modals.length ? document.querySelector('.modal h2').textContent : ''")
            ok(t == 'Rechercher', 'Ctrl+F ouvre la recherche')
            cname = await pg.evaluate("App.game.cities[App.me().fortress].name")
            await pg.keyboard.type(cname[:4].lower()); await pg.wait_for_timeout(150)
            r = await pg.evaluate("[...document.querySelectorAll('.modal .row .t1')].map(e => e.textContent)")
            ok(cname in r, 'la capitale se trouve par le début de son nom (%r)' % r[:4])
            await pg.evaluate("() => { const i = document.querySelector('.modal input'); i.value = 'gue des'; i.dispatchEvent(new Event('input')); }"); await pg.wait_for_timeout(100)
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
            r = await pg.evaluate("(at) => ({ open: UI.modals.length, cam: [Math.round(MapView.camX), Math.round(MapView.camY)] })", at)
            ok(r['open'] == 0 and abs(r['cam'][0] - at[0]) <= 1 and abs(r['cam'][1] - at[1]) <= 1, 'Entrée va au repère trouvé (accents ignorés) (%r, %r)' % (r, at[:2]))
            # un lieu jamais vu ne se trouve pas
            r = await pg.evaluate("""() => { const g = App.game, pl = App.me(), w = g.world; const hidden = g.sites.find(s => !pl.explored[s.plane][s.y * w.w + s.x]);
              return hidden ? App.searchItems().some(it => it.x === hidden.x && it.y === hidden.y && it.plane === hidden.plane && !it.pin) : false; }""")
            ok(not r, 'un lieu jamais vu ne figure pas dans la recherche')

        # ---------- file d'incantations ----------
        if not ONLY or 'file' in ONLY:
            await fresh(pg, port, 11)
            r = await pg.evaluate("""() => { const g = App.game, pl = App.me();
              for (const k of ['giant_spiders', 'hell_hounds', 'fire_bolt', 'guardian_wind']) if (DATA.spells[k] && !pl.known.includes(k)) pl.known.push(k);
              pl.mana = 5000; pl.skillLeft = 5; MagicUI.doCast('giant_spiders', null); App.refresh(); return { c: pl.casting && pl.casting.id }; }""")
            ok(r['c'] == 'giant_spiders', 'une incantation en cours')
            await pg.keyboard.press('g'); await pg.wait_for_timeout(300)
            name = await pg.evaluate("DATA.spells.hell_hounds.name")
            r = await pg.evaluate("""(nm) => { const row = [...document.querySelectorAll('.modal .spell')].find(e => e.querySelector('.nm').textContent.includes(nm)); return row ? { dis: row.classList.contains('dis'), txt: row.innerText } : null; }""", name)
            ok(r and not r['dis'] and 'mettre en file' in r['txt'], 'pendant une incantation, un autre sort se met en file (%r)' % (r and r['txt'][-40:]))
            await pg.screenshot(path=os.path.join(SHOTS, '03175-grimoire-file.png'))
            await pg.evaluate("""(nm) => [...document.querySelectorAll('.modal .spell')].find(e => e.querySelector('.nm').textContent.includes(nm)).click()""", name)
            await pg.wait_for_timeout(300)
            r = await pg.evaluate("() => ({ q: (App.me().castQueue || []).map(q => q.id), c: App.me().casting.id, top: document.querySelector('#tb-skill .p') ? document.querySelector('#tb-skill .p').textContent : '' })")
            ok(r['q'] == ['hell_hounds'] and r['c'] == 'giant_spiders' and '+1' in r['top'], 'le sort attend son tour, la barre du haut le compte (%r)' % r)
            await pg.evaluate("UI.closeAll(); MagicUI.magic()"); await pg.wait_for_timeout(300)
            t = await pg.evaluate("document.querySelector('.modal').innerText")
            ok('en file (1)' in t and 'Retirer' in t, 'l\'écran de la magie montre la file')
            await pg.screenshot(path=os.path.join(SHOTS, '03175-magie-file.png'))
            await pg.evaluate("UI.closeAll()")
            # au début du tour suivant : l'incantation aboutit, la suivante commence
            r = await pg.evaluate("() => { const pl = App.me(); pl.casting.progress = pl.casting.cost; Game.startTurnFor(App.game, pl); return { c: pl.casting && pl.casting.id, q: (pl.castQueue || []).length }; }")
            ok(r['q'] == 0 and r['c'] in ('hell_hounds', None), 'au début du tour, le sort suivant prend la place (%r)' % r)

        # ---------- sorts rapides en combat ----------
        if not ONLY or 'combat' in ONLY:
            await fresh(pg, port, 5)
            await pg.evaluate("""() => { const g = App.game, pl = App.me(), w = g.world, foe = g.players[1], fc = g.cities[pl.fortress];
              for (const k of ['fire_bolt', 'warp_wood', 'shatter']) if (DATA.spells[k] && !pl.known.includes(k)) pl.known.push(k);
              pl.diplo[foe.id] = 'war'; foe.diplo[pl.id] = 'war'; pl.mana = 5000;
              let at = null;
              for (let d = 3; d < 12 && !at; d++) for (let dx = -d; dx <= d && !at; dx++) for (const dy of [-d, d]) { const x = World.wx(w, fc.x + dx), y = fc.y + dy;
                if (!World.inY(w, y) || World.terr(w, 0, x, y) !== T.GRASS || Cities.at(g, 0, x, y) || Units.at(g, 0, x, y).length || World.get(w, 0, 'site', x, y) >= 0) continue;
                const nb = World.neighbors(w, x, y).find(([nx, ny]) => World.terr(w, 0, nx, ny) === T.GRASS && !Units.at(g, 0, nx, ny).length && !Cities.at(g, 0, nx, ny) && World.get(w, 0, 'site', nx, ny) < 0);
                if (nb) { at = [x, y, nb[0], nb[1]]; break; } }
              for (const t of ['OrcSwordsmen', 'OrcSwordsmen', 'OrcSpearmen']) Units.create(g, t, foe.id, 0, at[0], at[1]);
              const ids = ['HighMenSwordsmen', 'HighMenBowmen'].map(t => Units.create(g, t, pl.id, 0, at[2], at[3]).id);
              for (const id of ids) g.units[id].moves = 2;
              Move.revealAllFor(g, pl); MapView.centerOn(at[0], at[1], 0);
              App.selectTile(0, at[2], at[3], ids); void App.moveSelected(at[0], at[1]); }""")
            await pg.wait_for_timeout(2200); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
            ok(await pg.evaluate("!!CombatView.bt && CombatView.active"), 'le combat s\'ouvre')
            await idle(pg)
            ok(await pg.evaluate("document.querySelectorAll('#c-bar .qspell').length") == 0, 'aucun sort rapide tant qu\'on n\'a rien lancé')
            r = await pg.evaluate("""() => { const bt = CombatView.bt, me = CombatView.humanSide; bt.castThisRound[me] = false; bt.side = me; bt.skillLeft[me] = 999;
              const e = bt.alive(1 - me)[0]; CombatView.prepareCast('fire_bolt', null); CombatView.useTarget({ c: e.c, r: e.r }, e); return App.me().quickSpells; }""")
            ok(r and r[0] == 'fire_bolt', 'un sort lancé rejoint les sorts rapides (%r)' % r)
            await pg.wait_for_timeout(1200); await idle(pg)
            await pg.evaluate("() => { const bt = CombatView.bt, me = CombatView.humanSide; bt.castThisRound[me] = false; bt.side = me; CombatView.mode = null; CombatView.refreshPanels(); }")
            await pg.wait_for_timeout(200)
            n = await pg.evaluate("document.querySelectorAll('#c-bar .qspell').length")
            ok(n == 1, 'la barre montre le sort rapide, numéroté (%d)' % n)
            await pg.keyboard.press('1'); await pg.wait_for_timeout(200)
            r = await pg.evaluate("CombatView.mode && CombatView.mode.id")
            ok(r == 'fire_bolt', 'la touche 1 le prépare (%r)' % r)
            await pg.screenshot(path=os.path.join(SHOTS, '03175-sorts-rapides.png'))
            await pg.keyboard.press('Escape')
            # déjà lancé ce tour : la touche le dit au lieu de viser
            await pg.evaluate("() => { const bt = CombatView.bt; bt.castThisRound[CombatView.humanSide] = true; CombatView.mode = null; }")
            await pg.keyboard.press('1'); await pg.wait_for_timeout(200)
            r = await pg.evaluate("({ m: CombatView.mode, t: [...document.querySelectorAll('#toasts > *')].map(e => e.textContent).join(' | ') })")
            ok(r['m'] is None and 'déjà lancé' in r['t'], 'sort déjà lancé ce tour : la touche le dit')
            await pg.evaluate("() => { CombatView.bt.flee(CombatView.humanSide); }")

        # ---------- comparaison d'objets, filtres du journal ----------
        if not ONLY or 'objets' in ONLY:
            await fresh(pg, port, 6)
            r = await pg.evaluate("""() => { const g = App.game, pl = App.me(), fc = g.cities[pl.fortress];
              const u = Heroes.spawn(g, pl, DATA.heroes.HeroBrax, fc.plane, fc.x, fc.y, 0);
              // deux objets réels tirés au hasard jusqu'à en avoir un que le héros peut porter
              let it = null; for (let i = 0; i < 80 && !it; i++) { const x = Items.random(g, 3); if (Items.canEquip(u, x)) it = x; }
              pl.vault.push(it); App._hero = u.id; App._it = it;
              const c = Panels.itemCompare(g, u, it); return { ok: !!c, diffs: c && c.diffs.map(d => d.text), name: it.name }; }""")
            ok(r['ok'] and len(r['diffs']) >= 1, 'un objet du coffre se compare à ce que porte le héros (%r)' % r)
            await pg.evaluate("() => Panels.hero(App._hero)") if await pg.evaluate("typeof Panels.hero === 'function'") else None
            html = await pg.evaluate("() => Panels.itemCompareHtml(App.game, App.game.units[App._hero], App._it)")
            ok(('ok' in html or 'danger' in html) and ('place libre' in html or 'la place de' in html), 'le détail : gains en vert, pertes en rouge')
            await pg.evaluate("UI.closeAll()")
            # filtres du journal
            await pg.evaluate("""() => { const g = App.game; Game.log(g, App.pid, 'Victoire contre Brisecol (3 ennemis tués, 1 perte).'); Game.log(g, App.pid, 'Valcourt a construit : Caserne de Zébulon.', { city: 0 }); Game.log(g, App.pid, 'Recherche achevée : Boule de feu.'); }""")
            await pg.wait_for_timeout(200)
            r = await pg.evaluate("[...document.querySelectorAll('#log-filters .lf')].map(e => e.textContent)")
            ok(r == ['Batailles', 'Cités', 'Magie', 'Diplomatie', 'Autres'], 'les filtres du journal (%r)' % r)
            await pg.evaluate("() => [...document.querySelectorAll('#log-filters .lf')].find(e => e.textContent === 'Cités').click()")
            await pg.wait_for_timeout(150)
            t = await pg.evaluate("document.querySelector('#logbox').innerText")
            ok('Brisecol' in t and 'Zébulon' not in t and 'Boule de feu' in t, 'masquer les cités retire leurs lignes, garde les autres')
            await pg.evaluate("() => App.game && Game.log(App.game, App.pid, 'Valcourt a construit : Atelier de Zéphirin.', { city: 0 })")
            t = await pg.evaluate("document.querySelector('#logbox').innerText")
            ok('Zéphirin' not in t, 'une nouvelle ligne d\'une catégorie masquée n\'apparaît pas')
            await pg.evaluate("() => [...document.querySelectorAll('#log-filters .lf')].find(e => e.textContent === 'Cités').click()")
            t = await pg.evaluate("document.querySelector('#logbox').innerText")
            ok('Zébulon' in t and 'Zéphirin' in t, 'réafficher la catégorie rend ses lignes')
            await pg.screenshot(path=os.path.join(SHOTS, '03175-journal.png'))
            await pg.evaluate("App.setPref('logHide', [])")

        ok(not errs, 'aucune erreur de page' + (' : ' + ' | '.join(errs[:3]) if errs else ''))
        await b.close()
    srv.shutdown()
    if FAIL: raise SystemExit(1)

asyncio.run(main())
