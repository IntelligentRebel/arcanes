// ---------- Dossier de sauvegarde (Chrome et Edge) ----------
// L'API File System Access laisse choisir un dossier une fois pour toutes, puis y écrire sans aucune fenêtre : les copies
// de sauvegarde s'y déposent silencieusement à la fin du tour. Firefox et Safari ne l'ont pas, et le jeu y retombe sur le
// téléchargement habituel. La poignée du dossier n'est pas du JSON : elle ne tient pas dans localStorage, d'où IndexedDB.
// Le navigateur oublie l'autorisation d'une session à l'autre : à la première écriture d'une session, il faut un clic.
const SaveDir = {
  supported() { return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined'; },

  // ---------- la poignée, gardée dans IndexedDB ----------
  db() {
    if (SaveDir._db) return SaveDir._db;
    return (SaveDir._db = new Promise((res, rej) => {
      const r = indexedDB.open('arcanes', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('dir')) r.result.createObjectStore('dir'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).catch(e => { SaveDir._db = null; throw e; }));
  },
  async store(mode, fn) {
    const db = await SaveDir.db();
    return new Promise((res, rej) => {
      const tx = db.transaction('dir', mode), rq = fn(tx.objectStore('dir'));
      tx.onerror = () => rej(tx.error);
      if (rq) { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); } else tx.oncomplete = () => res();
    });
  },
  async handle() { try { return (await SaveDir.store('readonly', s => s.get('saves'))) || null; } catch (e) { return null; } },
  async keep(dir) { await SaveDir.store('readwrite', s => s.put(dir, 'saves')); },

  // ---------- choisir, oublier ----------
  // au clic du joueur : la fenêtre du navigateur, puis l'autorisation d'écriture
  async pick() {
    if (!SaveDir.supported()) return { ok: false, why: 'unsupported' };
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'arcanes-saves', mode: 'readwrite', startIn: 'documents' }); }
    catch (e) { return { ok: false, why: e && e.name === 'AbortError' ? 'cancel' : (e && e.message) || 'denied' }; }
    if (await SaveDir.perm(dir, true) !== 'granted') return { ok: false, why: 'denied' };
    try { await SaveDir.keep(dir); } catch (e) { return { ok: false, why: (e && e.message) || 'store' }; }
    return { ok: true, name: dir.name };
  },
  async forget() { try { await SaveDir.store('readwrite', s => s.delete('saves')); } catch (e) { /* rien à oublier */ } },

  async perm(dir, ask) {
    if (!dir || !dir.queryPermission) return 'granted';   // navigateur sans contrôle d'autorisation
    const o = { mode: 'readwrite' };
    let st = await dir.queryPermission(o);
    if (st !== 'granted' && ask && dir.requestPermission) st = await dir.requestPermission(o);
    return st;
  },

  // ---------- écrire ----------
  // ask : on a le droit d'ouvrir la demande d'autorisation (il faut un clic du joueur juste avant)
  async write(name, text, ask) {
    if (!SaveDir.supported()) return { ok: false, why: 'unsupported' };
    const dir = await SaveDir.handle();
    if (!dir) return { ok: false, why: 'nodir' };
    const st = await SaveDir.perm(dir, ask);
    if (st !== 'granted') return { ok: false, why: st === 'prompt' ? 'ask' : 'denied', dir: dir.name };
    try {
      const fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable();
      await w.write(text); await w.close();
      return { ok: true, dir: dir.name };
    } catch (e) { return { ok: false, why: (e && e.message) || 'write', dir: dir.name }; }
  },
};
