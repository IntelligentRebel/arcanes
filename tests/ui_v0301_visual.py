"""v0.30.1 : revue visuelle. Chaque marque d'unité en combat (stase, sommeil, toile, confusion, terreur, entrave,
possession, bris, déformation, tour muette), chaque zone de sort (Boue, Vortex), les cibles en or et les chances au survol
(Confusion, Dissipation), les corps à relever, puis sur la carte : la stase d'une pile, les cases cerclées d'or de chaque
sort de case et l'aperçu des sorts de zone. Une capture par élément, dans tests/shots/v0301_*.png, à regarder une à une."""
import asyncio, os, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
W, H = 1400, 900


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': W, 'height': H})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        print('VERSION', await pg.evaluate("GAME_VERSION"))
        shots = []
        async def shot(name, clip=None):
            path = os.path.join(SHOTS, 'v0301_' + name + '.png')
            await pg.screenshot(path=path, clip=clip) if clip else await pg.screenshot(path=path)
            shots.append(name)

        # ---------- la partie ----------
        print(await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true; window.AUTO_CHOICE = true;
          const g = Game.newGame({ seed: 21, mapW: 50, mapH: 34, opponents: 1, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { chaos: 4, death: 4, sorcery: 3 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll();
          const pl = g.players[0];
          for (const id of Object.keys(DATA.spells)) if (!pl.known.includes(id) && DATA.spells[id].inGame !== false && !DATA.spells[id].book) pl.known.push(id);
          pl.mana = 99999; pl.skillLeft = 99999; Game.contact(g, 0, 1); Diplomacy.setState(g, 0, 1, 'war');
          return 'ok ' + g.turn; }"""))
        await pg.wait_for_timeout(500)

        # ---------- combat : les marques d'état ----------
        st = await pg.evaluate("""async () => {
          const g = App.game, pl = App.me(), f = g.cities[pl.fortress];
          const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
          const mk = (t, o) => Units.create(g, t, o, f.plane, x, y);
          const mine = ['HighMenSwordsmen', 'HighMenBowmen', 'HighMenSpearmen', 'WarBear', 'HighMenMagician'].map(t => mk(t, 0));
          const theirs = ['HighMenSwordsmen', 'HighMenSpearmen', 'HighMenBowmen', 'HighMenCavalry', 'OrcSwordsmen', 'OrcSpearmen', 'Gargoyle', 'Skeleton', 'HighMenHalberdiers'].filter(t => DATA.units[t]).slice(0, 9).map(t => mk(t, 1));
          theirs[0].ench.push('bless');
          const bt = new Battle(g, { attackers: mine, defenders: theirs, attackerPid: 0, defenderPid: 1, plane: f.plane, x, y, rng: new RNG(4) });
          window._bt = bt; CombatView.run(g, bt, {}); return theirs.length; }""")
        print('ENNEMIS', st)
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')].find(x => /Commander/.test(x.textContent)); if (b) b.click(); }")
        await pg.wait_for_timeout(600)
        marks = await pg.evaluate("""() => {
          const bt = window._bt, es = bt.alive(1), out = [];
          const set = [['stase', b => { b.stasis = true; }], ['sommeil', b => { b.asleep = true; }], ['toile', b => { b.web = 12; }], ['confusion', b => { b.confused = true; }],
            ['terreur', b => { b.feared = true; }], ['entrave', b => { b.entangled = true; }], ['possession', b => { b.possessed = true; b.origSide = 1; b.side = 0; }],
            ['bris_deforme', b => { b.curses.push('shatter', 'warp_creature_def'); }]];
          set.forEach(([n, f], i) => { const b = es[i]; if (b) { f(b); out.push([n, b.id, b.c, b.r, bt.name(b)]); } });
          bt.side = 0; CombatView.zoom = 1; CombatView.focus = null; CombatView.layout();
          return out; }""")
        await pg.wait_for_timeout(500)
        await shot('combat_vue_generale')
        for n, bid, c, r, nm in marks:
            await pg.evaluate("([c, r]) => { CombatView.zoom = 2.3; CombatView.setFocus({ c, r }); }", [c, r])
            await pg.wait_for_timeout(250)
            await shot('marque_' + n, {'x': W / 2 - 170, 'y': H / 2 - 200, 'width': 340, 'height': 280})
            print('MARQUE', n, nm)
        await pg.evaluate("() => { CombatView.zoom = 1; CombatView.focus = null; CombatView.layout(); }")

        # ---------- combat : cibles en or et chances au survol ----------
        # (les états posés ci-dessus sont levés : une cible endormie ou figée n'éclaire rien sur les chances)
        await pg.evaluate("() => { const bt = window._bt; for (const b of bt.units) { b.stasis = false; b.asleep = false; b.web = 0; b.confused = false; b.feared = false; b.entangled = false; if (b.possessed) { b.side = b.origSide; b.possessed = false; delete b.origSide; } b.curses = []; } bt.castThisRound[0] = false; bt.skillLeft[0] = 9999; }")
        async def hover_unit(pick):
            pt = await pg.evaluate("""(pick) => { const bt = window._bt, b = pick === 'blessed' ? bt.alive(1).find(x => x.u.ench.includes('bless')) : bt.alive(1)[pick];
              const p = CombatView.pos[b.id] || b, sx = CombatView.ox + (p.c - p.r) * CombatView.TW / 2, sy = CombatView.oy + (p.c + p.r) * CombatView.TH / 2; return [sx, sy - CombatView.TH * .3]; }""", pick)
            await pg.mouse.move(pt[0], pt[1]); await pg.wait_for_timeout(300)
            return pt
        for sid, pick in [('confusion', 2), ('dispel_magic', 'blessed'), ('fire_bolt', 3), ('word_of_death', 4)]:
            await pg.evaluate("(id) => { UI.closeAll(); CombatView.mode = null; CombatView.prepareCast(id, null); }", sid)
            await pg.wait_for_timeout(300)
            await shot('cibles_' + sid)
            await hover_unit(pick)
            await shot('survol_' + sid)
            panel = await pg.evaluate("() => { const r = document.querySelector('#c-right'); return r && r.style.display !== 'none' ? r.innerText.slice(0, 260).replace(/\\n+/g, ' | ') : '(aucun panneau)'; }")
            print('SURVOL', sid, ':', panel)
        # zones
        for sid in ['earth_to_mud', 'magic_vortex']:
            await pg.evaluate("(id) => { CombatView.mode = null; CombatView.prepareCast(id, null); }", sid)
            await pg.wait_for_timeout(200)
            await pg.mouse.move(W / 2, H / 2 + 40); await pg.wait_for_timeout(300)
            await shot('zone_' + sid)
            print('ZONE', sid, await pg.evaluate("() => { const z = CombatView.zoneOf(CombatView.mode.id, CombatView.hover.c, CombatView.hover.r); return z ? z.size + ' cases' : 'aucune'; }"))
        # relever un mort : deux corps sur une même case
        await pg.evaluate("""() => { const bt = window._bt; CombatView.mode = null; const ours = bt.alive(0).filter(b => !b.u.hero && Units.isNormal(b.u)).slice(0, 2);
          for (const b of ours) { bt.takeDamage(b, 999); bt.checkDeath(b); } ours[1].c = ours[0].c; ours[1].r = ours[0].r; window._corpse = [ours[0].c, ours[0].r];
          CombatView.prepareCast('raise_dead', null); }""")
        await pg.wait_for_timeout(300)
        cpt = await pg.evaluate("() => { const [c, r] = window._corpse; return [CombatView.ox + (c - r) * CombatView.TW / 2, CombatView.oy + (c + r) * CombatView.TH / 2]; }")
        await pg.mouse.move(cpt[0], cpt[1]); await pg.wait_for_timeout(300)
        await shot('relever_survol')
        print('RELEVER', await pg.evaluate("() => { const r = document.querySelector('#c-right'); return r && r.style.display !== 'none' ? r.innerText.replace(/\\n+/g, ' | ') : '(aucun panneau)'; }"))
        await pg.evaluate("() => { window.AUTO_CHOICE = false; }")
        await pg.mouse.click(cpt[0], cpt[1]); await pg.wait_for_timeout(400)
        await shot('relever_choix')
        print('CHOIX', await pg.evaluate("() => { const m = document.querySelector('.modal'); return m ? m.innerText.replace(/\\n+/g, ' | ') : '(pas de choix)'; }"))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')].find(x => /Annuler/.test(x.textContent)); if (b) b.click(); UI.closeAll(); CombatView.mode = null; window.AUTO_CHOICE = true; }")
        # le menu des sorts : raisons des sorts grisés
        greys = await pg.evaluate("""() => { const bt = window._bt, out = {};
          for (const id of ['warp_creature', 'shatter', 'healing', 'mass_healing', 'star_fires', 'raise_dead', 'spell_lock', 'giant_strength', 'wall_of_fire', 'disrupt']) out[id] = CombatView.whyNot(bt, 0, id);
          return out; }""")
        for k, v in greys.items():
            print('GRISÉ', k, ':', v)
        await pg.evaluate("() => { CombatView.renderSpells && CombatView.renderSpells(); }")
        await shot('menu_sorts')

        # ---------- siège : tour muette ----------
        await pg.evaluate("() => { CombatView.active = false; const r = document.querySelector('#combat-root'); r.hidden = true; r.innerHTML = ''; UI.closeAll(); }")
        st = await pg.evaluate("""async () => {
          const g = App.game, pl = App.me(), foe = g.players[1], c = g.cities[foe.fortress];
          c.buildings.cityWalls = true; c.buildings.defenseTowers = true;
          const [x, y] = World.neighbors(g.world, c.x, c.y).find(([x, y]) => !World.isWaterAt(g.world, c.plane, x, y) && !Cities.at(g, c.plane, x, y));
          const mine = ['HighMenSwordsmen', 'HighMenBowmen'].map(t => Units.create(g, t, 0, c.plane, x, y));
          const theirs = ['HighMenSpearmen', 'HighMenBowmen'].map(t => Units.create(g, t, 1, c.plane, c.x, c.y));
          const bt = new Battle(g, { attackers: mine, defenders: theirs, attackerPid: 0, defenderPid: 1, plane: c.plane, x: c.x, y: c.y, city: c, rng: new RNG(4) });
          window._bt2 = bt; CombatView.run(g, bt, { city: c }); return (bt.towers || []).map(t => t.kind + '@' + t.c + ',' + t.r).join(' '); }""")
        print('TOURS', st)
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal footer button')].find(x => /Commander/.test(x.textContent)); if (b) b.click(); }")
        await pg.wait_for_timeout(500)
        tw = await pg.evaluate("() => { const bt = window._bt2, t = (bt.towers || []).find(t => t.kind === 'stone') || (bt.towers || [])[0]; if (!t) return null; t.mute = 3; CombatView.initTowers(bt); return [t.c, t.r, t.kind]; }")
        if tw:
            await pg.evaluate("([c, r]) => { CombatView.zoom = 2; CombatView.setFocus({ c, r }); }", tw)
            await pg.wait_for_timeout(300)
            await shot('tour_muette', {'x': W / 2 - 200, 'y': H / 2 - 260, 'width': 400, 'height': 340})
        await pg.evaluate("() => { CombatView.zoom = 1; CombatView.focus = null; CombatView.layout(); }")
        await pg.wait_for_timeout(200)
        await shot('siege_vue')
        await pg.evaluate("() => { CombatView.active = false; const r = document.querySelector('#combat-root'); r.hidden = true; r.innerHTML = ''; UI.closeAll(); }")

        # ---------- carte ----------
        setup = await pg.evaluate("""() => {
          const g = App.game, pl = App.me(), foe = g.players[1], f = g.cities[pl.fortress], ec = g.cities[foe.fortress];
          for (const p of [0, 1]) pl.explored[p].fill(1);
          const free = (c, k) => World.neighbors(g.world, c.x, c.y).filter(([x, y]) => !World.isWaterAt(g.world, c.plane, x, y) && !Cities.at(g, c.plane, x, y) && World.get(g.world, c.plane, 'site', x, y) < 0)[k];
          // une pile à nous dont seule la 2e unité est figée ; une pile ennemie enchantée en vue ; une terre corrompue ; des blessés
          const [ax, ay] = free(f, 0); const a1 = Units.create(g, 'HighMenSwordsmen', 0, f.plane, ax, ay), a2 = Units.create(g, 'HighMenSpearmen', 0, f.plane, ax, ay); a2.stasis = 2; a1.dmg = 2;
          const [ex, ey] = free(ec, 0); const e1 = Units.create(g, 'HighMenSwordsmen', 1, ec.plane, ex, ey); e1.ench.push('bless');
          const [sx, sy] = free(ec, 1); Units.create(g, 'HighMenScouts' in DATA.units ? 'HighMenScouts' : 'HighMenSpearmen', 0, ec.plane, sx, sy);
          const [cx, cy] = free(f, 1); World.set(g.world, f.plane, 'corrupt', cx, cy, 1);
          MapView.invalidate(); MapView.invalidateVis(); MapView.bumpVis(); MapView.ts = 72;
          MapView.centerOn(ax, ay, f.plane);
          return { a: [ax, ay], e: [ex, ey], c: [cx, cy], plane: f.plane, ep: ec.plane, f: [f.x, f.y] }; }""")
        await pg.wait_for_timeout(600)
        await shot('carte_stase', {'x': W / 2 - 220, 'y': H / 2 - 180, 'width': 440, 'height': 360})
        rings = {}
        for sid in ['fire_storm', 'ice_storm', 'black_wind', 'stasis', 'disenchant_area', 'warp_node', 'purify_land', 'plane_shift', 'field_healing', 'seal_rift']:
            r = await pg.evaluate("""(id) => { UI.closeAll(); MagicUI.cancelTarget(); try { MagicUI.beginCast(id); } catch (e) { return 'ERREUR ' + e.message; }
              const t = MagicUI.targeting; return t ? (t.tiles ? t.tiles.length + ' cases cerclées' : 'visée sans cercles') : 'refusé (toast)'; }""", sid)
            rings[sid] = r
            await pg.wait_for_timeout(350)
            await shot('cercles_' + sid)
            await pg.evaluate("() => { MagicUI.cancelTarget(); }")
        for k, v in rings.items():
            print('CERCLES', k, ':', v)
        # aperçus de zone au survol
        for sid, at in [('purify_land', 'c'), ('enchant_road', 'f'), ('earth_lore', 'a'), ('change_terrain', 'a'), ('transmute', 'a')]:
            res = await pg.evaluate("""([id, at, S]) => { MagicUI.cancelTarget(); MagicUI.targeting = { id, tt: 'tile' }; const [x, y] = S[at]; MapView.centerOn(x, y, S.plane); MapView.hover = { x, y };
              const a = Spells.areaOf(App.game, App.me(), id, S.plane, x, y); return a ? a.tiles.length + ' cases, ' + a.label : 'pas d\\'aperçu'; }""", [sid, at, setup])
            await pg.wait_for_timeout(350)
            await shot('apercu_' + sid, {'x': W / 2 - 260, 'y': H / 2 - 220, 'width': 520, 'height': 440})
            print('APERÇU', sid, ':', res)
        await pg.evaluate("() => { MagicUI.cancelTarget(); MapView.hover = null; }")
        print('CAPTURES', len(shots))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        await b.close()

asyncio.run(main())
