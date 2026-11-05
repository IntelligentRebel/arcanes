"""Empaquette le banc de test : une page HTML autonome (moteur du jeu + plan + ouvriers) qui joue des centaines de parties
IA contre IA dans le navigateur, sur tous les cœurs, sans rien installer. Archive : dist/arcanes-banc-<nom>.zip.
  py tools/package_banc.py nuit1 [plan.json] [deja.jsonl]
deja.jsonl : résultats déjà joués de ce plan (mêmes clés, même moteur), joints à la page pour ne pas les rejouer."""
import json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANC = os.path.join(ROOT, 'tools', 'banc')


def read(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()


def build(plan_path, done_path=None):
    load = read('tests/load.js')
    files = re.findall(r"'((?:data|src)/[\w/]+\.js)'", load[load.index('const FILES'):load.index('];')])
    engine = '\n'.join(read(f) for f in files if os.path.exists(os.path.join(ROOT, f)))
    version = re.search(r"GAME_VERSION = '([^']+)'", engine).group(1)
    match = read('tests/match.js')
    worker = ('self.window = self;\n' + engine +
              '\n;AI.LAB = true;\nconst E = { AI, Game, Turn, Units, Cities, Magic, Heroes, U, World, Move, DATA: self.DATA, GAME_VERSION, Book: typeof Book !== \'undefined\' ? Book : null };\n' + match +
              # la sonde : un calcul fixe chronométré avant chaque partie, pour distinguer un moteur plus lent d'un processeur bridé
              '\nfunction cpuProbe() { const t = performance.now(); let x = 1; for (let i = 0; i < 4e6; i++) x = (x * 48271) % 2147483647; return Math.round((performance.now() - t) * 10) / 10 + (x < 0 ? 1 : 0); }\n'
              '\nonmessage = async ev => { const job = ev.data; job.onTurn = t => postMessage({ progress: t });\n'
              '  try { const cpu = cpuProbe(); postMessage({ ok: Object.assign(await playOne(E, job), { cpu }) }); } catch (e) { postMessage({ error: String(e && e.stack || e) }); } };\n')
    core = read('tests/banc_core.js')
    plan = json.load(open(plan_path, encoding='utf-8'))
    done = open(done_path, encoding='utf-8').read() if done_path else ''
    for name, txt in (('moteur', worker), ('core', core), ('résultats joints', done)):
        if re.search(r'</script|<!--', txt, re.I): sys.exit(f'{name} contient une séquence qui casserait la page')
    html = open(os.path.join(BANC, 'banc.template.html'), encoding='utf-8').read()
    for k, v in (('@@WORKER@@', worker), ('@@PLAN@@', json.dumps(plan, ensure_ascii=False)), ('@@CORE@@', core), ('@@VERSION@@', version), ('@@DONE@@', done)):
        assert html.count(k) == 1, k
        html = html.replace(k, v)
    return html, version


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'nuit'
    plan = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'tests', 'nuit_plan.json')
    html, version = build(plan, sys.argv[3] if len(sys.argv) > 3 else None)
    out_html = os.path.join(ROOT, 'dist', 'banc.html')
    open(out_html, 'w', encoding='utf-8').write(html)
    out = os.path.join(ROOT, 'dist', f'arcanes-banc-{name}.zip')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(out_html, 'arcanes-banc/banc.html')
        for f in ('LANCER.bat', 'eveil.ps1', 'LISEZMOI.txt'): z.write(os.path.join(BANC, f), 'arcanes-banc/' + f)
    print(f'{out} : moteur {version}, page {len(html) / 1e6:.2f} Mo, archive {os.path.getsize(out) / 1e6:.2f} Mo')


if __name__ == '__main__':
    main()
