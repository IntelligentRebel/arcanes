"""Langues : captures des écrans principaux dans la langue choisie (localStorage arcanes:lang), et erreurs de page.
python3 tests/ui_i18n.py <dossier des captures> <langue> [graine]
Avec un pseudo-dictionnaire (⟦texte⟧), tout texte resté en français se voit d'un coup d'œil."""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
LANG = sys.argv[2] if len(sys.argv) > 2 else 'en'
SEED = int(sys.argv[3]) if len(sys.argv) > 3 else 21
TURNS = int(sys.argv[4]) if len(sys.argv) > 4 else 30
# vraie langue : un texte est suspect s'il est une clé du catalogue traduite autrement, ou s'il contient des mots français
CAT = json.load(open(os.path.join(ROOT, 'i18n', 'catalog.json'), encoding='utf-8'))
try: LD = json.load(open(os.path.join(ROOT, 'i18n', LANG + '.json'), encoding='utf-8'))
except FileNotFoundError: LD = {}
FRW = re.compile(r"(?<![\w'])(des|du|une|est|pour|avec|dans|vous|aux|sont|cette|êtes|être|leurs?|tours|sorts|cités?|unités?|héros|ville|attaque|défense|mouvement|portée|chaque|déjà|où|très)(?![\w'])", re.I)
def suspect(t):
    if '⟦' in t or '⟧' in t: return False
    if PSEUDO: return bool(re.search(r'[A-Za-zÀ-ÿ]{2}', t))
    if t in CAT and LD.get(t, t) != t: return True
    return bool(FRW.search(t))
PSEUDO = False


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1500, 'height': 900}, locale='en-US')
        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html'))
        await pg.evaluate("(l) => localStorage.setItem('arcanes:lang', l)", LANG)
        await pg.reload(); await pg.wait_for_timeout(2500)
        global PSEUDO
        PSEUDO = await pg.evaluate("Object.values(I18N.dict || {}).slice(0, 80).some(v => v.includes('⟦'))")
        print('langue', await pg.evaluate("I18N.lang"), 'dictionnaire', await pg.evaluate("I18N.dict ? Object.keys(I18N.dict).length : 0"))
        left = {}
        SCAN = """() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) { const el = n.parentElement; if (!el || el.closest('script,style,#icon-defs')) continue;
            const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
            const t = n.nodeValue.trim(); if (t) out.push(t.slice(0, 160)); }
          for (const el of document.querySelectorAll('[title]')) { const t = el.title.trim(); if (t) out.push('title: ' + t.slice(0, 160)); }
          return out; }"""
        async def shot(n):
            await pg.screenshot(path=os.path.join(OUT, LANG + '_' + n + '.png'))
            for t in await pg.evaluate(SCAN):
                if suspect(t[7:] if t.startswith('title: ') else t): left.setdefault(t, n)
        await shot('titre')
        await pg.evaluate("Setup.newGame()"); await pg.wait_for_timeout(1500); await shot('creation')
        await pg.evaluate("""(seed) => { UI.closeAll(); const t = document.querySelector('.title-screen'); if (t) t.remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed, opponents: 3, crisis: 'off', human: { name: 'A', portrait: 0, books: { life: 5, nature: 5 }, retorts: [], race: 'highelf' } }); App.start(g); }""", SEED)
        await pg.evaluate("(n) => { window.__TURNS = n; }", TURNS)
        await pg.wait_for_timeout(2500); await shot('debut'); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        # quelques tours joués par l'IA pour avoir de la matière (journal, cités, recherche)
        await pg.evaluate("""async () => { const g = App.game, me = App.me(); me.human = false; me.aiLevel = 'hard'; me.aiPersonality = 'balanced';
          for (let t = 0; t < (window.__TURNS || 30); t++) await Turn.endTurn(g); me.human = true; me.dilemma = null; UI.closeAll(); App.refresh(); }""")
        await pg.wait_for_timeout(1200); await pg.evaluate("UI.closeAll()"); await shot('carte')
        logs = await pg.evaluate("() => App.game.log.filter(e => e.pid === App.pid || e.pid === -1).map(e => e.text)")
        bad = [t for t in logs if ((any(ch.isalpha() for ch in t.replace('⟦', '').replace('⟧', '')) and '⟦' not in t) if PSEUDO else suspect(t))]
        print('journal', len(logs), 'messages ; sans traduction :', len(bad))
        for t in bad[:25]: print('   journal |', t[:120])
        for name, js in [('cite', "CityUI.open(App.me().fortress)"), ('magie', "MagicUI.magic()"), ('grimoire', "MagicUI.spellbook()"), ('recherche', "MagicUI.research(false)"),
                         ('cites', "Panels.cities()"), ('armees', "Panels.armies()"), ('menu', "Panels.menu()"), ('aide', "Panels.help()"), ('encyclo', "Panels.encyclopedia()")]:
            try:
                await pg.evaluate("() => { " + js + "; }"); await pg.wait_for_timeout(900); await shot(name)
            except Exception as e:
                errors.append(name + ': ' + str(e)[:200])
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)
        # une bataille
        await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const A = [0, 1, 2].map(() => Units.create(g, 'HighElfSpearmen', me.id, fc.plane, fc.x + 1, fc.y));
          const D = [0, 1, 2].map(() => Units.create(g, 'Skeleton', -1, fc.plane, fc.x + 1, fc.y));
          const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: -1, plane: fc.plane, x: fc.x + 1, y: fc.y, rng: new RNG(3) }); window._bt = bt; CombatView.run(g, bt, {}); }""")
        await pg.wait_for_timeout(900); await shot('combat_choix')
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')][1]; b && b.click(); }")
        await pg.wait_for_timeout(1500); await shot('combat')
        print('RESTÉS EN FRANÇAIS', len(left))
        for t, n in sorted(left.items(), key=lambda x: x[1]): print('  ', n, '|', t)
        print('ERREURS', errors[:20])
        await b.close()

asyncio.run(main())
