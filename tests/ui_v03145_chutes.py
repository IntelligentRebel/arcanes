"""v0.31.45 : la chute d'un rival au centre de l'écran. Banni quand sa forteresse tombe, vaincu quand il perd sa dernière cité,
avec son illustration (assets/falls) ; un sorcier jamais rencontré reste anonyme et sans image ; forteresse = dernière cité :
une seule annonce. Dans l'onglet Sorciers, les vaincus passent tout en bas. En français et en anglais."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots'); os.makedirs(SHOTS, exist_ok=True)
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)

START = """() => { document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
  const g = Game.newGame({ seed: 6, mapW: 60, mapH: 40, opponents: 3, otherPlane: 0, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'Éloïne', portrait: 9, books: { nature: 6 }, retorts: [], race: 'highmen' } });
  App.start(g); }"""
MODAL = """() => { const m = document.querySelector('.landmark-modal'); if (!m) return null;
  const img = m.querySelector('.lm-art img');
  return { kicker: m.querySelector('.lm-kicker').innerText, name: m.querySelector('.lm-name').innerText, text: m.querySelector('.lm-text').innerText, img: img ? img.src.split('/').slice(-2).join('/') : null }; }"""
CLOSE = "() => { const b = document.querySelector('.landmark-modal .btn.primary'); if (b) b.click(); }"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        url = 'file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')
        for lang in ('fr-FR', 'en-US'):
            ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, locale=lang)
            pg = await ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(url); await pg.wait_for_timeout(1500)
            fr = lang == 'fr-FR'
            await pg.evaluate(START); await pg.wait_for_timeout(2500)
            await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
            # trois rivaux : A (rencontré) sera banni par moi, B (rencontré) vaincu par A... et C jamais rencontré
            ids = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players.filter(p => p !== me);
              me.contact[o[0].id] = true; me.contact[o[1].id] = true; delete me.contact[o[2].id];
              return o.map(p => ({ id: p.id, name: p.name, key: App.FALL_IDS[p.portrait], fort: g.cities[p.fortress].name })); }""")
            A, B, C = ids
            # 1. je prends la forteresse de A, qui garde d'autres cités : banni, illustration « banished »
            await pg.evaluate("""(a) => { const g = App.game, me = App.me(), pl = g.players[a], c = g.cities[pl.fortress];
              const extra = Object.values(g.cities).find(x => x.owner < 0 || (x.owner !== me.id && x.owner !== a)); if (extra) extra.owner = a;
              Game.banish(g, pl, me, c); App.refresh(); }""", A['id'])
            await pg.wait_for_timeout(1200)
            m = await pg.evaluate(MODAL)
            ok(m and m['kicker'].lower() == ('forteresse tombée' if fr else 'fortress fallen'), 'bannissement annoncé au centre : %r' % (m and m['kicker']))
            ok(m and m['name'] == A['name'] and A['fort'] in m['text'], 'son nom et sa forteresse : %r' % (m and m['text']))
            ok(m and (('est à vous' in m['text'] and 'néant' in m['text']) if fr else ('is yours' in m['text'] and 'void' in m['text'])), 'texte dans la langue')
            ok(m and m['img'] == 'falls/banished_' + A['key'] + '.jpg', 'illustration du banni : %r' % (m and m['img']))
            await pg.screenshot(path=os.path.join(SHOTS, 'v03145_banni_%s.png' % lang[:2]))
            await pg.evaluate(CLOSE); await pg.wait_for_timeout(500)
            ok(await pg.evaluate(MODAL) is None, 'une seule fois')
            # 2. B perd sa forteresse, sa dernière cité, face à A : une seule annonce, la défaite
            await pg.evaluate("""([a, bb]) => { const g = App.game, pl = g.players[bb], c = g.cities[pl.fortress];
              for (const x of Object.values(g.cities)) if (x.owner === bb && x !== c) x.owner = -1;
              pl.lastLostTo = a; c.owner = a; Game.banish(g, pl, g.players[a], c); Game.checkElimination(g); App.refresh(); }""", [A['id'], B['id']])
            await pg.wait_for_timeout(1200)
            m = await pg.evaluate(MODAL)
            ok(m and m['kicker'].lower() == ("chute d'un sorcier" if fr else 'a wizard falls'), 'défaite annoncée : %r' % (m and m['kicker']))
            ok(m and m['name'] == B['name'] and A['name'] in m['text'] and (('disparaît' in m['text']) if fr else ('vanishes' in m['text'])), 'qui, et par qui : %r' % (m and m['text']))
            ok(m and m['img'] == 'falls/defeated_' + B['key'] + '.jpg', 'illustration du vaincu : %r' % (m and m['img']))
            await pg.screenshot(path=os.path.join(SHOTS, 'v03145_vaincu_%s.png' % lang[:2]))
            await pg.evaluate(CLOSE); await pg.wait_for_timeout(500)
            ok(await pg.evaluate(MODAL) is None, 'pas de bannissement en double')
            # 3. C, jamais rencontré, est vaincu : annonce anonyme, sans image
            await pg.evaluate("""(c) => { const g = App.game, pl = g.players[c];
              for (const x of Object.values(g.cities)) if (x.owner === c) x.owner = -1;
              pl.fortress = null; Game.checkElimination(g); App.refresh(); }""", C['id'])
            await pg.wait_for_timeout(1200)
            m = await pg.evaluate(MODAL)
            ok(m and C['name'] not in m['name'] and C['name'] not in m['text'] and m['img'] is None, 'inconnu : ni nom ni image (%r)' % (m and m['name']))
            await pg.evaluate(CLOSE); await pg.wait_for_timeout(400)
            # 4. l'onglet Sorciers : moi, les connus en lice, les inconnus, les vaincus en bas
            await pg.evaluate("() => Panels.wizards()"); await pg.wait_for_timeout(500)
            names = await pg.evaluate("() => [...document.querySelectorAll('.modal .list > .box .serif')].map(e => e.innerText)")
            ok(len(names) == 4 and names[0].startswith('Éloïne') and names[1].startswith(A['name']) and names[3].startswith(B['name']), 'ordre des sorciers : %r' % names)
            await pg.screenshot(path=os.path.join(SHOTS, 'v03145_sorciers_%s.png' % lang[:2]))
            ok(not errs, 'aucune erreur de page %r' % errs[:2])
            await ctx.close()
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL)
    sys.exit(1 if FAIL else 0)
asyncio.run(main())
