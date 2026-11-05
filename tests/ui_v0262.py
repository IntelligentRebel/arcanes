"""v0.26.2 : diplomatie raisonnée. Raisons de l'attitude, exigences et ultimatums, échange de sorts, dénonciation d'un traité,
lassitude de la guerre."""
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None


async def shot(pg, name):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, name + '.png'))


async def buttons(pg):
    return await pg.evaluate("() => [...document.querySelectorAll('.modal button')].map(b => b.textContent + (b.disabled ? ' (grisé)' : ''))")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e) + ' @ ' + (e.stack or '')[:400]))
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'arcanes', 'index.html')); await pg.wait_for_timeout(900)
        await pg.evaluate("""() => { document.querySelector('.title-screen').remove(); Sfx.play = () => {}; if (window.Music) Music.jingle = () => true;
          const g = Game.newGame({ seed: 21, opponents: 2, crisis: 'off', human: { name: 'Céleste', portrait: 0, books: { life: 6, sorcery: 5 }, retorts: [], race: 'highmen' } });
          App.start(g); UI.closeAll(); }""")
        await pg.wait_for_timeout(2500); await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300); await pg.evaluate("UI.closeAll()")
        print('VERSION', await pg.evaluate("GAME_VERSION"))

        # 1. des raisons : un traité signé, un péage, une frontière, un ennemi commun
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1], o2 = g.players[2];
          for (const [x, y] of [[me, o], [o, me], [me, o2], [o2, me], [o, o2], [o2, o]]) x.contact[y.id] = true;
          g.turn = 40;
          Diplomacy.propose(g, me.id, o.id, 'tribute', 0);
          Diplomacy.setState(g, me.id, o.id, 'peace'); Diplomacy.adjust(g, o.id, me.id, 10, 'treaty');
          Diplomacy.adjust(g, o.id, me.id, -8, 'toll');
          Diplomacy.setState(g, me.id, o2.id, 'war'); Diplomacy.setState(g, o.id, o2.id, 'war');
          for (let t = 0; t < 12; t++) { Diplomacy.driftTurn(g, o, me); Diplomacy.accrue(g, o.id, me.id, 'peace', 0.5, 100); }
          return { rel: o.relations[me.id], raisons: Diplomacy.reasons(g, o.id, me.id).map(x => x.label + ' ' + Math.round(x.v * 10) / 10) }; }""")
        print('RAISONS', r)
        await pg.evaluate("() => { Panels.wizards(1); }"); await pg.wait_for_timeout(700)
        print('PANNEAU', await pg.evaluate("() => [...document.querySelectorAll('.modal .reasons')].map(e => e.innerText.replace(/\\n/g, ' | '))"))
        await shot(pg, 'diplo_reasons')

        # 2. échange de sorts : la fenêtre, un marché, un présent
        await pg.evaluate("""() => { const g = App.game, o = g.players[1];
          // de quoi échanger : un sort qu'il connaît et que vous pouvez apprendre
          const me = App.me(); const can = me.researchPool.filter(id => !me.known.includes(id) && DATA.spells[id].research > 0).sort((a, b) => DATA.spells[a].research - DATA.spells[b].research);
          for (const id of can.slice(0, 3)) if (!o.known.includes(id)) o.known.push(id);
          // et qu'il pourrait apprendre de vous : deux de vos sorts entrent dans son champ d'étude
          for (const id of me.known.filter(id => DATA.spells[id].research > 0 && !o.known.includes(id)).slice(0, 2)) if (!o.researchPool.includes(id)) o.researchPool.push(id);
          o.relations[me.id] = 45; }""")
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Sorts'); b.click(); }")
        await pg.wait_for_timeout(600)
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1];
          return { ilDonne: Diplomacy.tradeable(g, o, me).map(id => DATA.spells[id].name + ' ' + DATA.spells[id].research), jeDonne: Diplomacy.tradeable(g, me, o).slice(0, 5).map(id => DATA.spells[id].name + ' ' + DATA.spells[id].research), items: document.querySelectorAll('.tradeitem').length }; }""")
        print('ECHANGE', r)
        # choisir le plus cher de mes sorts (il accepte), puis valider
        await pg.evaluate("() => { const cols = document.querySelectorAll('.tradecol'); cols[1].querySelector('.tradeitem').click(); }")
        await pg.wait_for_timeout(300)
        print('VERDICT', await pg.evaluate("() => [...document.querySelectorAll('.modal .ok, .modal .dim')].map(e => e.textContent).filter(t => /marché|présent|inégal|accepte|Choisissez/.test(t))"))
        await shot(pg, 'diplo_trade')
        before = await pg.evaluate("() => App.me().known.length")
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => /Proposer l'échange|Offrir ce sort/.test(b.textContent)); b.click(); }")
        await pg.wait_for_timeout(400)
        print('APRES ECHANGE', await pg.evaluate("(n) => ({ appris: App.me().known.length - n, toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).slice(-1), raisons: Diplomacy.reasons(App.game, 1, App.me().id).map(x => x.label + ' ' + Math.round(x.v)) })", before))
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)

        # 3. une exigence de l'IA : la fenêtre, céder
        await pg.evaluate("""() => { const g = App.game, me = App.me(); me.gold = 300;
          Diplomacy.offer(g, me, { from: 2, kind: 'demand', turn: g.turn, gold: 80, ultimatum: false }); App.offerPrompt(Diplomacy.offerFrom(g, me, 2)); }""")
        await pg.wait_for_timeout(700); await shot(pg, 'diplo_demand')
        print('EXIGENCE', await buttons(pg))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Céder'); b.click(); }")
        await pg.wait_for_timeout(400)
        print('CEDE', await pg.evaluate("() => ({ or: App.me().gold, raison: Diplomacy.reasons(App.game, 2, App.me().id).map(x => x.label + ' ' + Math.round(x.v)) })"))
        # un ultimatum refusé : la guerre (traité 'none' d'abord)
        await pg.evaluate("""() => { const g = App.game, me = App.me(); Diplomacy.setState(g, me.id, 2, 'none');
          Diplomacy.offer(g, me, { from: 2, kind: 'demand', turn: g.turn, gold: 5000, ultimatum: true }); App.offerPrompt(Diplomacy.offerFrom(g, me, 2)); }""")
        await pg.wait_for_timeout(700); await shot(pg, 'diplo_ultimatum')
        print('ULTIMATUM', await buttons(pg))
        await pg.evaluate("() => { const b = [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Refuser'); b.click(); }")
        await pg.wait_for_timeout(400)
        print('REFUS', await pg.evaluate("() => ({ etat: App.me().diplo[2], log: App.game.log.slice(-2).map(e => e.text) })"))
        # une exigence ignorée expire en refus au tour suivant
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(); Diplomacy.setState(g, me.id, 1, 'none');
          Diplomacy.offer(g, me, { from: 1, kind: 'demand', turn: g.turn - 2, gold: 10, ultimatum: false }); const r0 = g.players[1].relations[me.id];
          Diplomacy.expireDemands(g); return { avant: r0, apres: g.players[1].relations[me.id], restantes: (me.diploOffers || []).length }; }""")
        print('EXPIRE', r)

        # 4. une proposition d'échange venue de l'IA
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1]; Diplomacy.setState(g, me.id, o.id, 'peace');
          const sw = Diplomacy.bestSwap(g, o, me) || { bGets: Diplomacy.tradeable(g, o, me)[0], aGets: Diplomacy.tradeable(g, me, o)[0] }; if (!sw.bGets || !sw.aGets) return null;
          Diplomacy.offer(g, me, { from: o.id, kind: 'trade', turn: g.turn, give: sw.bGets, get: sw.aGets }); App.offerPrompt(Diplomacy.offerFrom(g, me, o.id));
          return { recoit: DATA.spells[sw.bGets].name, donne: DATA.spells[sw.aGets].name }; }""")
        print('OFFRE ECHANGE', r)
        await pg.wait_for_timeout(700); await shot(pg, 'diplo_trade_offer')
        print('OFFRE BOUTONS', await buttons(pg))
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)

        # 5. dénonciation : un sorcier d'honneur prévient, le traité expire 6 tours plus tard ; le perfide rompt d'emblée
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1], o2 = g.players[2];
          Diplomacy.setState(g, me.id, o.id, 'peace'); o.aiPersonality = 'balanced';
          const a1 = Diplomacy.breakOrDenounce(g, o, me); const st1 = me.diplo[o.id], when = o.denounced[me.id];
          g.turn = when; Diplomacy.denounceTick(g); const st2 = me.diplo[o.id];
          Diplomacy.setState(g, me.id, o2.id, 'peace'); o2.aiPersonality = 'maniac';
          const a2 = Diplomacy.breakOrDenounce(g, o2, me);
          return { honnete: a1, pendant: st1, apres: st2, perfide: a2, etatPerfide: me.diplo[o2.id], log: g.log.slice(-4).map(e => e.text) }; }""")
        print('DENONCIATION', r)

        # 6. lassitude : une guerre qui coûte rend l'IA conciliante
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1]; Diplomacy.setState(g, me.id, o.id, 'war');
          const w = o.warLog[me.id]; const p0 = Diplomacy.weariness(g, o, me);
          w.lost = Diplomacy.power(g, o) * 0.6; w.citiesLost = 1;
          return { avant: p0, apres: Math.round(Diplomacy.weariness(g, o, me) * 100) / 100 }; }""")
        print('LASSITUDE', r)
        await pg.evaluate("() => { Panels.wizards(1); }"); await pg.wait_for_timeout(600)
        print('PANNEAU GUERRE', await pg.evaluate("() => [...document.querySelectorAll('.modal .ok')].map(e => e.textContent).filter(t => /coûte/.test(t))"))
        await shot(pg, 'diplo_war')
        await pg.evaluate("UI.closeAll()"); await pg.wait_for_timeout(300)

        # 7. la course à la Maîtrise : l'étude, puis le lancement, annoncés à tous ; tous déclarent la guerre au lanceur
        r = await pg.evaluate("""() => { const g = App.game, me = App.me(), o = g.players[1], o2 = g.players[2];
          Diplomacy.setState(g, o.id, o2.id, 'peace'); Diplomacy.setState(g, me.id, o.id, 'peace');
          o.researching = 'spell_of_mastery'; o.researchProgress = Math.floor(Magic.researchCost(o, 'spell_of_mastery') * 0.4);
          const n0 = g.log.length; Endgame.tick(g); App.refresh();
          const etude = { race: Endgame.race(g).map(x => x.phase + ' ' + Math.round(x.pct * 100) + '% ' + x.turns + 't'), log: g.log.slice(n0).filter(e => e.pid === me.id).map(e => e.text), barre: document.querySelector('#tb-som').style.display !== 'none' ? document.querySelector('#tb-som').innerText.replace(/\\n/g, ' ') : 'cachée' };
          Magic.learn(g, o, 'spell_of_mastery'); o.mana = 5000;
          const res = Spells.startCasting ? null : null;
          o.casting = { id: 'spell_of_mastery', target: null, progress: 0, cost: Magic.spellCost(g, o, 'spell_of_mastery', false) };
          const n1 = g.log.length; Endgame.tick(g); App.refresh();
          return { etude, lance: { race: Endgame.race(g).map(x => x.phase + ' ' + Math.round(x.pct * 100) + '% ' + x.turns + 't'), log: g.log.slice(n1).filter(e => e.pid === me.id).map(e => e.text), guerre: o2.diplo[o.id], humain: me.diplo[o.id], barre: document.querySelector('#tb-som').innerText.replace(/\\n/g, ' ') } }; }""")
        print('MAITRISE', r)
        await pg.hover('#tb-som'); await pg.wait_for_timeout(500); await shot(pg, 'mastery_tip')
        print('INFOBULLE MAITRISE', await pg.evaluate("() => { const t = document.querySelector('.tip, #tip, .tooltip'); return t ? t.innerText.replace(/\\n/g, ' | ').slice(0, 300) : null; }"))
        await pg.mouse.move(700, 600)

        # 8. l'agitation, raison par raison ; l'empire étendu
        await pg.evaluate("() => { const c = App.game.cities[App.me().fortress]; App.me().taxIdx = 4; CityUI.open(c.id); }"); await pg.wait_for_timeout(600)
        print('AGITATION', await pg.evaluate("() => CityUI.unrestTip(Cities.econ(App.game, App.game.cities[App.me().fortress])).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ')"))
        print('EMPIRE', await pg.evaluate("""() => { const g = App.game, me = App.me(), fc = g.cities[me.fortress];
          const far = { fortress: false, plane: fc.plane, x: (fc.x + 30) % g.world.w, y: fc.y }, other = { fortress: false, plane: 1 - fc.plane, x: fc.x, y: fc.y };
          return { loin: Cities.overstretch(g, far, me), autrePlan: Cities.overstretch(g, other, me), capitale: Cities.overstretch(g, fc, me) }; }"""))
        await pg.evaluate("UI.closeAll()")
        print('ERRORS', len(errors), errors[:3])
        await b.close()

asyncio.run(main())
