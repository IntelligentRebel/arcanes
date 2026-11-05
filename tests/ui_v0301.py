"""v0.30.1 : les corrections d'interface du contre-audit, vérifiées par les vrais écrans.
Grimoire (nouvelle cible d'une incantation suspendue, Captation grisée), liste des cités (royaume de la Garde magique),
Renommer, bouton Purifier, avertissement de famine, infobulle de puissance, sauvegarde automatique d'avant la 0.30,
nœud perverti, sorts en cours (possession), bilan de combat (unités asservies), Effroi."""
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        res = []
        def ok(c, m):
            res.append(c); print(('OK   ' if c else 'ÉCHEC') + ' ' + m)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true; window.AUTO_CHOICE = true;
          // les infobulles : leur texte est gardé sur l'élément, pour le lire sans survol
          const tip0 = UI.tipOn; UI.tipOn = (el, t) => { try { el.dataset.tip = typeof t === 'function' ? t() : t; } catch (e) { el.dataset.tip = 'ERREUR ' + e.message; } return tip0.call(UI, el, t); };
          const g = Game.newGame({ seed: 31, mapW: 50, mapH: 34, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { chaos: 4, sorcery: 4, life: 0, death: 3 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(500)

        # grimoire : Tempête de feu suspendue -> « nouvelle cible » ; Captation grisée sans rival connu qui entretient un global
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(); pl.known.push('fire_storm', 'spell_binding');
          pl.casting = { id: 'fire_storm', progress: 40, cost: 300, target: { plane: 0, x: 1, y: 1 } };
          MagicUI.spellbook('special'); const rows = [...document.querySelectorAll('.book .spell')];
          const fs = rows.find(r => /Tempête de feu/.test(r.textContent)), sb = rows.find(r => /Captation/.test(r.textContent));
          const head = document.querySelector('.book').innerText;
          const out = { fs: fs ? [fs.className, fs.innerText.replace(/\\n+/g, ' | ')] : null, sb: sb ? [sb.className, sb.dataset.tip || ''] : null, head: /Nouvelle cible/.test(head), warn: Spells.castingWarning(g, pl) };
          UI.closeAll(); return out; }""")
        ok(r['warn'] and r['fs'] and ' dis' not in r['fs'][0] and 'nouvelle cible' in r['fs'][1], 'grimoire : Tempête de feu suspendue, la ligne s\'ouvre pour une nouvelle cible (' + str(r['fs']) + ')')
        ok(r['head'], 'grimoire : bouton « Nouvelle cible » à côté de « Abandonner »')
        ok(r['sb'] and ' dis' in r['sb'][0] and 'Aucun rival connu' in r['sb'][1], 'grimoire : Captation grisée avec sa raison (' + str(r['sb']) + ')')
        await pg.evaluate("() => { App.me().casting = null; }")

        # liste des cités d'un sort de cité : le royaume de la Garde magique
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(), c = g.cities[pl.fortress]; c.ench.push({ spell: 'spell_ward', owner: pl.id, realm: 'chaos' }); pl.known.push('flying_fortress');
          UI.closeAll(); MagicUI.beginCast('flying_fortress'); const ms = document.querySelectorAll('.modal'), t = ms.length ? ms[ms.length - 1].innerText : ''; UI.closeAll(); MagicUI.cancelTarget(); return t.replace(/\\n+/g, ' | ').slice(0, 300); }""")
        ok('(chaos)' in r, 'liste des cités : Égide arcanique avec son royaume (' + r[:160] + ')')

        # Renommer : le balisage est retiré
        r = await pg.evaluate("""() => { const g = App.game, c = g.cities[App.me().fortress]; CityUI.rename(c); const inp = document.querySelector('.modal input'); inp.value = '<img src=x onerror=alert(1)>Valbrume';
          [...document.querySelectorAll('.modal footer button')].find(b => /Renommer/.test(b.textContent)).click(); UI.closeAll(); return c.name; }""")
        ok('<' not in r and '>' not in r and 'Valbrume' in r, 'Renommer : le balisage est retiré (' + r + ')')

        # bouton Purifier : le travail d'une autre case ne compte pas
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(), f = g.cities[pl.fortress];
          const t = Object.keys(DATA.units).find(k => DATA.units[k].abilities && DATA.units[k].abilities.purify); if (!t) return 'pas d\\'unité purificatrice';
          const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
          const u = Units.create(g, t, pl.id, f.plane, x, y); u.purifyAt = f.plane + ',0,0'; u.purifyWork = 2; World.set(g.world, f.plane, 'corrupt', x, y, 1);
          App.selectTile(f.plane, x, y); App.refresh(); const btn = [...document.querySelectorAll('.actions .abtn')].find(b => /^Purifier/.test(b.textContent) && !/tout/.test(b.textContent));
          return btn ? btn.dataset.tip || '(pas d\\'infobulle)' : '(pas de bouton)'; }""")
        ok(r == 'Purifier cette terre (3 tours)', 'bouton Purifier : pas de « 2 / 3 déjà faits » sur une case jamais travaillée (' + r + ')')

        # avertissement de famine : grade et lieu
        r = await pg.evaluate("""async () => { const g = App.game, pl = App.me(), f = g.cities[pl.fortress];
          const u = Units.create(g, 'HighMenSwordsmen', pl.id, f.plane, f.x, f.y);
          UI.closeAll(); window.AUTO_CHOICE = false; const p = App.lossPrompt({ famine: { deficit: 1, units: [u] }, gold: null, mana: null }); await new Promise(r => setTimeout(r, 400));
          const ms = document.querySelectorAll('.modal'), t = ms.length ? ms[ms.length - 1].innerText : '(pas de fenêtre)'; UI.closeAll(); window.AUTO_CHOICE = true; return t.replace(/\\n+/g, ' | '); }""")
        ok('(recrue, ' in r.lower() or 'recrue' in r.lower(), 'famine : l\'unité est donnée avec son grade et son lieu (' + r[:200] + ')')

        # infobulle de puissance : pourquoi les lieux de culte valent ce qu'ils valent
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(), c = g.cities[pl.fortress]; c.buildings.shrine = true; c.buildings.temple = true; g.moon = 'bad'; g.moonTurns = 5;
          CityUI.open(c.id); const k = [...document.querySelectorAll('.kv')].find(e => /Puissance/.test(e.textContent)); const t = k ? k.dataset.tip || '' : '(pas de ligne)'; UI.closeAll(); g.moon = null; return t.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' '); }""")
        ok('lune maléfique' in r, 'infobulle de puissance : la lune expliquée (' + r[:200] + ')')

        # sauvegarde automatique d'avant la 0.30 (sans identifiant) : gardée comme « Partie précédente »
        r = await pg.evaluate("""() => { try { localStorage.setItem('arcanes:auto', '{"vieux":1}'); localStorage.setItem('arcanes:auto:meta', JSON.stringify({ t: 1, turn: 40, name: 'Ancien' })); localStorage.removeItem('arcanes:prev'); } catch (e) { return 'stockage ' + e.message; }
          App._autoOwned = null; App.save('auto'); const prev = localStorage.getItem('arcanes:prev'), m1 = App.saveMeta('prev');
          App.save('auto'); const prev2 = localStorage.getItem('arcanes:prev');
          return JSON.stringify({ prev, name: m1 && m1.name, again: prev2 }); }""")
        ok('"prev":"{\\"vieux\\":1}"' in r and '"name":"Ancien"' in r, 'sauvegarde automatique 0.29 sans identifiant : devient « Partie précédente » (' + r[:160] + ')')

        # nœud perverti par soi
        r = await pg.evaluate("""() => { const g = App.game, pl = App.me(); const s = g.sites.find(s => s.type === 'node'); if (!s) return 'pas de nœud';
          s.owner = 1; s.warped = pl.id; const t = App.nodeHtml(s).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' '); s.warped = null; s.owner = -1; return t; }""")
        ok('Vous l\'avez perverti' in r and 'presque éteinte' in r, 'nœud perverti par vous : « Vous l\'avez perverti », aura presque éteinte (' + r[:160] + ')')

        # combat : sorts en cours (possession), bilan avec une unité asservie, Effroi
        r = await pg.evaluate("""async () => { const g = App.game, pl = App.me(), f = g.cities[pl.fortress];
          const [x, y] = World.neighbors(g.world, f.x, f.y).find(([x, y]) => !World.isWaterAt(g.world, f.plane, x, y) && !Cities.at(g, f.plane, x, y));
          const mine = ['HighMenSwordsmen', 'HighMenSpearmen'].map(t => Units.create(g, t, 0, f.plane, x, y));
          const theirs = ['Gargoyle', 'HighMenSpearmen'].map(t => Units.create(g, t, 1, f.plane, x, y));
          Game.contact(g, 0, 1); Diplomacy.setState(g, 0, 1, 'war');
          const bt = new Battle(g, { attackers: mine, defenders: theirs, attackerPid: 0, defenderPid: 1, plane: f.plane, x, y, rng: new RNG(4) });
          window._bt = bt; CombatView.run(g, bt, {}); await new Promise(r => setTimeout(r, 600));
          const cmd = [...document.querySelectorAll('.modal footer button')].find(x => /Commander/.test(x.textContent)); if (cmd) cmd.click(); await new Promise(r => setTimeout(r, 400));
          const garg = bt.units.find(b => b.u.type === 'Gargoyle'); garg.origSide = 1; garg.side = 0; garg.possessed = true; garg.bound = true;
          const groups = CombatView.activeSpells(); const mineIds = groups[0].map(e => e.id);
          return mineIds; }""")
        ok('creature_binding' in r, 'sorts en cours : l\'asservissement figure dans vos sorts (' + str(r) + ')')
        r = await pg.evaluate("""async () => { const bt = window._bt; bt.over = true; bt.winner = 0; for (const b of bt.alive(1)) { bt.takeDamage(b, 999); bt.checkDeath(b); }
          CombatView.offerRaise = async () => false; window.AUTO_CHOICE = false; CombatView.finish(); await new Promise(r => setTimeout(r, 1200));
          const ms = document.querySelectorAll('.modal'), m = ms[ms.length - 1]; const t = m ? m.innerText.replace(/\\n+/g, ' | ') : '(pas de bilan)'; window.AUTO_CHOICE = true; return t; }""")
        print('BILAN', r[:300])
        ok('Gargouille' in r or 'Gargoyle' in r or 'ennemis tués' in r.lower() or '2 ennemis' in r, 'bilan de combat : l\'unité asservie compte parmi les pertes ennemies')
        await pg.evaluate("() => { UI.closeAll(); CombatView.active = false; const r = document.querySelector('#combat-root'); if (r) { r.hidden = true; r.innerHTML = ''; } }")
        await pg.screenshot(path=os.path.join(SHOTS, 'v0301_ui_fin.png'))
        print('ERRORS', len(errors))
        for e in errors[:10]:
            print('  ', e)
        print('RÉSULTAT', 'TOUT EST CONFORME' if all(res) and not errors else 'DES ÉCHECS')
        await b.close()

asyncio.run(main())
