"""v0.31.53 : l'écran de fin montre le sorcier concerné : sa victoire (conquête ou Sort de Maîtrise), la victoire du rival qui
accomplit la Maîtrise, ou sa propre chute ; une image manquante retombe sur l'image commune."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL = []
def ok(c, w):
    print(('OK   ' if c else 'ÉCHEC') + ' ' + w, flush=True)
    if not c: FAIL.append(w)
CASES = [  # (overWhy, gagnant : moi / rival / personne, image attendue)
    ('conquest', 'me', 'victory/conquest_sylvaine.jpg'),
    ('mastery', 'me', 'victory/mastery_sylvaine.jpg'),
    ('mastery', 'rival', 'victory/mastery_aldoran.jpg'),
    ('defeat', None, 'falls/defeated_sylvaine.jpg'),
]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1400, 'height': 950}, locale='fr-FR')
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(1500)
        await pg.evaluate("""() => { UI.closeAll(); document.querySelector('.title-screen') && document.querySelector('.title-screen').remove(); Sfx.play = () => {};
          const g = Game.newGame({ seed: 6, mapW: 60, mapH: 40, opponents: 3, otherPlane: 0, difficulty: 'normal', crisis: 'off', finale: 'off', human: { name: 'X', portrait: 9, books: { nature: 6 }, retorts: [], race: 'highmen' } });
          App.start(g); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        for why, who, want in CASES:
            await pg.evaluate("""([why, who]) => { const g = App.game, me = App.me(), r = g.players.find(p => p !== me); r.portrait = 0;
              g.over = true; g.overWhy = why; g.winner = who === 'me' ? me.id : who === 'rival' ? r.id : null; UI.closeAll(); App._overModal = null; App.gameOver(true); }""", [why, who])
            await pg.wait_for_timeout(900)
            src = await pg.evaluate("() => { const i = document.querySelector('.end-art img'); return i && i.naturalWidth ? i.getAttribute('src') : null; }")
            ok(src and src.endswith(want), '%s, %s : %s' % (why, who, src))
            await pg.screenshot(path=os.path.join(ROOT, 'tests', 'shots', 'v03153_%s_%s.png' % (why, who or 'x')))
        # un sorcier sans illustration propre (portrait inconnu) : l'image commune
        await pg.evaluate("""() => { const g = App.game, me = App.me(); me.portrait = 99; g.overWhy = 'conquest'; g.winner = me.id; UI.closeAll(); App._overModal = null; App.gameOver(true); }""")
        await pg.wait_for_timeout(900)
        src = await pg.evaluate("() => { const i = document.querySelector('.end-art img'); return i && i.naturalWidth ? i.getAttribute('src') : null; }")
        ok(src and src.endswith('endgame/win_conquest.jpg'), 'portrait inconnu : image commune (%s)' % src)
        ok(not errs, 'aucune erreur de page %r' % errs[:2])
        await b.close()
    print('ÉCHECS :', len(FAIL), FAIL); sys.exit(1 if FAIL else 0)
asyncio.run(main())
