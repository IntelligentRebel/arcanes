import asyncio, os, json
from playwright.async_api import async_playwright
HTML = 'file://' + os.path.abspath('dist/arcanes/index.html')
JS = r"""
async () => {
  const names = ['click','step','clash','arrow','boulder','zap','fire','lightning','spell','summon','death','heal','victory','defeat','turn','build','research','notify','bad','gold'];
  const out = {};
  for (const n of names) {
    const off = new OfflineAudioContext(2, 44100 * 3, 44100);
    Sfx.on = true; Sfx.setup(off); Sfx.last = {};
    Sfx.play(n, { realm: 'chaos' });
    const buf = await off.startRendering();
    const d = buf.getChannelData(0); let pk = 0, ss = 0, nan = 0, last = 0;
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (Number.isNaN(v)) nan++; const a = Math.abs(v); if (a > pk) pk = a; ss += v * v; if (a > .001) last = i; }
    out[n] = { peak: +pk.toFixed(3), rms: +Math.sqrt(ss / d.length).toFixed(4), nan, tail: +(last / 44100).toFixed(2) };
  }
  // musique : un accord
  const off = new OfflineAudioContext(2, 44100 * 10, 44100);
  Sfx.setup(off); GenMusic.playing = false; GenMusic.start(); GenMusic.playing = false; clearTimeout(GenMusic.timer);
  const buf = await off.startRendering(); const d = buf.getChannelData(0); let pk = 0, ss = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; ss += d[i] * d[i]; }
  out.music = { peak: +pk.toFixed(3), rms: +Math.sqrt(ss / d.length).toFixed(4) };
  return out;
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(HTML); await pg.wait_for_timeout(800)
        res = await pg.evaluate(JS)
        for k, v in res.items(): print(k, v)
        print('ERRORS', len(errs), errs[:3])
        await b.close()
asyncio.run(main())
