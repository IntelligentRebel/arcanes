"""v0.31.47 : Toile sur des Spectres. Le sort refuse (ils sont incorporels) et le dit, reste prêt, et le clic ne devient pas un ordre
d'attaque (avant : « Sort annulé. » puis « Hors d'atteinte : cette unité vole. »). Sur un griffon volant, la Toile prend."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for lang in ('fr-FR', 'en-US'):
            pg = await (await b.new_context(viewport={'width': 1500, 'height': 1000}, locale=lang)).new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
            await pg.evaluate("""() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
              const g = Game.newGame({ seed: 12, opponents: 3, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'Aldoran', portrait: 0, books: { nature: 6 }, retorts: [], race: 'highmen' } });
              App.start(g); UI.closeAll(); }""")
            await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
            await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
              if (!me.known.includes('web')) me.known.push('web'); me.mana = 400; me.skillPoints = 9000;
              const A = [0, 1].map(() => Units.create(g, 'GnollHalberdiers', me.id, fc.plane, fc.x + 1, fc.y));
              const D = ['Wraith', 'Griffin'].map(t => Units.create(g, t, -1, fc.plane, fc.x + 1, fc.y));
              const bt = new Battle(g, { attackers: A, defenders: D, attackerPid: me.id, defenderPid: -1, plane: fc.plane, x: fc.x + 1, y: fc.y, rng: new RNG(3) });
              window._bt = bt; CombatView.run(g, bt, {}); }""")
            await pg.wait_for_timeout(600)
            await pg.evaluate("""() => { const btn = [...document.querySelectorAll('.modal button')].find(b => /^(Commander|Command)/.test(b.textContent)); btn && btn.click(); }""")
            await pg.wait_for_timeout(1500)
            click = """(t) => { const bt = _bt, w = bt.alive().find(x => x.u.type === t); document.querySelectorAll('.toast').forEach(e => e.remove());
              const sel = CombatView.sel, from = [sel.c, sel.r], hp = w.u.dmg;
              CombatView.mode = { id: 'web', caster: null, tt: 'enemyUnit' }; const P = CombatView.iso(w.c, w.r);
              CombatView.onClick({ clientX: P.x, clientY: P.y, button: 0 });
              return { mode: CombatView.mode && CombatView.mode.id, moved: sel.c !== from[0] || sel.r !== from[1], web: w.web || 0 }; }"""
            r = await pg.evaluate(click, 'Wraith'); await pg.wait_for_timeout(500)
            toasts = await pg.evaluate("() => [...document.querySelectorAll('.toast')].map(e => e.innerText)")
            fr = lang == 'fr-FR'
            ok(any(('incorporelle' if fr else 'incorporeal') in t for t in toasts), 'la vraie raison : %r' % toasts)
            ok(not any(('vole' if fr else 'flies') in t or ('annulé' if fr else 'cancelled') in t for t in toasts), 'ni « elle vole » ni « sort annulé »')
            ok(r['mode'] == 'web' and not r['moved'] and r['web'] == 0, 'le sort reste prêt, aucune unité ne bouge : %r' % r)
            await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v03147_toile_%s.png' % lang[:2]))
            r = await pg.evaluate(click, 'Griffin'); await pg.wait_for_timeout(2500)
            web = await pg.evaluate("() => (_bt.alive().find(x => x.u.type === 'Griffin') || {}).web || 0")
            ok(web > 0, 'sur un griffon qui vole, la Toile prend (%r)' % web)
            ok(not errs, 'aucune erreur de page %r' % errs[:2])
            await pg.evaluate("() => { _bt.finish(0); CombatView.finished = true; CombatView.close(); }")
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
