'use strict';
// Générateur pseudo-aléatoire déterministe (mulberry32). Son état tient dans un entier,
// ce qui le rend sauvegardable avec la partie.
class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  range(a, b) { return a + this.int(b - a + 1); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  weighted(items, weightFn) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightFn(it));
    if (total <= 0) return items.length ? items[this.int(items.length)] : null;
    let r = this.next() * total;
    for (const it of items) { r -= Math.max(0, weightFn(it)); if (r < 0) return it; }
    return items[items.length - 1];
  }
  // nombre de succès sur n dés à p % (règle du 30 % de Master of Magic)
  rolls(n, pct) { let k = 0; for (let i = 0; i < n; i++) if (this.next() * 100 < pct) k++; return k; }
}
