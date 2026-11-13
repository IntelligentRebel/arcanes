// Portraits animés des sorciers (0.31.48) : sur le portrait de l'atlas, deux calques tirés de retouches du même portrait
// (tools/portrait_anim.py) : les paupières, pour un clignement de temps en temps, et la magie du sorcier, qui monte et
// redescend lentement. Le portrait du bandeau en haut à gauche reste fixe : il est sous les yeux toute la partie.
const PortraitAnim = {
  img: null, loading: false, live: new Map(), raf: 0, last: 0,
  meta() { return (window.EXTRA_META || {}).portraits || {}; },
  // l'ordre des portraits de l'atlas (wizard:N), celui des sorciers prédéfinis
  IDS: ['aldoran', 'isvaran', 'malivra', 'tsevan', 'azhemir', 'thalgren', 'vorgath', 'zirrakh', 'brakkon', 'sylvaine', 'solenkh', 'celestine', 'itzanor', 'nerissa'],
  enabled() {
    if (typeof App !== 'undefined' && App.prefs && App.prefs.animPortraits === false) return false;
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches) return false; } catch (e) { /* rien */ }
    return true;
  },
  load() {
    if (PortraitAnim.img || PortraitAnim.loading || typeof Image === 'undefined') return;
    PortraitAnim.loading = true;
    const tryLoad = n => { const im = new Image(); im.onload = () => { PortraitAnim.img = im; PortraitAnim.loading = false; PortraitAnim.kick(); };
      im.onerror = () => { if (n < 2) setTimeout(() => tryLoad(n + 1), 1500); else PortraitAnim.loading = false; }; im.src = 'assets/portraits.png'; };
    tryLoad(0);
  },
  // anime ce canevas (déjà peint avec le portrait n) ; hover : seulement quand la souris est sur cet élément
  attach(canvas, n, opts) {
    const id = PortraitAnim.IDS[n]; if (!canvas || !id || !PortraitAnim.meta()[id]) return canvas;
    const o = opts || {}, r = Math.random;
    const st = { id, n, base: null, hover: o.hover || null, on: !o.hover, glowP: 5200 + r() * 2600, glowT0: r() * 8000, blinkAt: 0, drawn: false };
    if (o.hover) { o.hover.addEventListener('mouseenter', () => { st.on = true; PortraitAnim.kick(); }); o.hover.addEventListener('mouseleave', () => { st.on = false; }); }
    PortraitAnim.live.set(canvas, st);
    PortraitAnim.load(); PortraitAnim.kick();
    return canvas;
  },
  kick() { if (!PortraitAnim.raf && PortraitAnim.live.size && typeof requestAnimationFrame !== 'undefined') PortraitAnim.raf = requestAnimationFrame(PortraitAnim.tick); },
  tick(now) {
    PortraitAnim.raf = 0;
    if (!PortraitAnim.live.size) return;
    if (now - PortraitAnim.last >= 33 && PortraitAnim.img && !document.hidden) {   // une trentaine d'images par seconde suffisent
      PortraitAnim.last = now;
      const on = PortraitAnim.enabled();
      for (const [c, st] of PortraitAnim.live) {
        if (!c.isConnected) { PortraitAnim.live.delete(c); continue; }
        if (!c.offsetParent && getComputedStyle(c).position !== 'fixed') continue;
        PortraitAnim.draw(c, st, now, on && st.on);
      }
    }
    PortraitAnim.kick();
  },
  draw(c, st, now, active) {
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    if (!st.base) { st.base = document.createElement('canvas'); st.base.width = W; st.base.height = H; st.base.getContext('2d').drawImage(c, 0, 0); }
    if (!active) { if (st.drawn) { ctx.clearRect(0, 0, W, H); ctx.drawImage(st.base, 0, 0); st.drawn = false; } return; }
    // la magie : une lente respiration, jamais tout à fait éteinte ni tout à fait à son comble
    const g = 0.08 + 0.72 * (0.5 - 0.5 * Math.cos((now + st.glowT0) / st.glowP * 2 * Math.PI));
    // le clignement : toutes les 2,5 à 6 secondes, 60 ms pour fermer, 90 fermé, 80 pour rouvrir
    if (!st.blinkAt) st.blinkAt = now + 1200 + Math.random() * 3500;
    let b = 0; const t = now - st.blinkAt;
    if (t >= 0) { b = t < 60 ? t / 60 : t < 150 ? 1 : t < 230 ? 1 - (t - 150) / 80 : 0; if (t >= 230) st.blinkAt = now + 2500 + Math.random() * 3500; }
    const m = PortraitAnim.meta()[st.id], img = PortraitAnim.img, S = 160;
    // même rendu que le portrait de l'atlas (Sprites.draw) : lissé quand on réduit, net quand on agrandit
    const down = W < S; ctx.imageSmoothingEnabled = down; if (down) ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, W, H); ctx.drawImage(st.base, 0, 0);
    ctx.globalAlpha = g; ctx.drawImage(img, m.glow[0], m.glow[1], S, S, 0, 0, W, H);
    if (b > 0 && m.blink) { ctx.globalAlpha = b; ctx.drawImage(img, m.blink[0], m.blink[1], S, S, 0, 0, W, H); }
    ctx.globalAlpha = 1; st.drawn = true;
  },
};
