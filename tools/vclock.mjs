// The capture tools' virtual clock (tools/capture.mjs stills, tools/capture-motion.mjs clips): clock() is injected into the page
// ahead of every script with Page.addScriptToEvaluateOnNewDocument, `(${clock})(seed)`, and window.__motion.step(ms, frames) is then
// the only thing that moves game time, so two captures of one build draw the same pixels. settle(js) waits out boot's loads.
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Page side, injected ahead of every script. Boot runs on real timers against a clock frozen at 0: no frame is drawn yet, so the
// asset loads and the quality switch's fade take whatever real time they need without any of it leaking into the game. start()
// then hands every timer, rAF callback and CSS animation to step(), the only thing that moves time from there on.
export function clock(seed) {
  const W = window, N = { st: W.setTimeout.bind(W), ct: W.clearTimeout.bind(W), raf: W.requestAnimationFrame.bind(W) }, timers = new Map();
  let now = 0, live = false, seq = 0, frames = [], loads = 0, s = seed >>> 0;
  Math.random = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };   // mulberry32: the bot's aim noise, tree kicks, puffs, wind ribbons, idle offsets
  performance.now = () => now; Date.now = () => 1767268800000 + Math.floor(now);
  const call = (fn, a) => { try { typeof fn === 'function' ? fn(...a) : (0, eval)(String(fn)); } catch (e) { reportError(e); } };   // a throwing callback is reported like a real one and the rest still run
  const fire = (id, t) => { if (t.every) t.due += t.every; else timers.delete(id); call(t.fn, t.a); };
  const arm = (id, t, ms) => { t.native = N.st(() => { if (timers.get(id) !== t) return; fire(id, t); if (t.every && !live) arm(id, t, t.every); }, ms); };
  const add = (fn, d, a, every) => { const id = ++seq, ms = Math.max(0, +d || 0), t = { fn, a, due: now + ms, every: every ? Math.max(1, ms) : 0 }; timers.set(id, t); if (!live) arm(id, t, ms); return id; };
  W.setTimeout = (fn, d, ...a) => add(fn, d, a, false); W.setInterval = (fn, d, ...a) => add(fn, d, a, true);
  W.clearTimeout = W.clearInterval = id => { const t = timers.get(id); if (t) { N.ct(t.native); timers.delete(id); } };
  W.requestAnimationFrame = fn => { frames.push({ id: ++seq, fn }); return seq; }; W.cancelAnimationFrame = id => { frames = frames.filter(f => f.id !== id); };
  // Loads in flight (images by their src setter, which three's ImageLoader uses; fetch for everything else): step() waits them out.
  const img = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src'), f0 = W.fetch;
  Object.defineProperty(HTMLImageElement.prototype, 'src', { ...img, set(v) { let open = true; const done = () => { if (open) { open = false; loads--; } }; loads++; this.addEventListener('load', done, { once: true }); this.addEventListener('error', done, { once: true }); img.set.call(this, v); } });
  W.fetch = function (...a) { loads++; return f0.apply(this, a).finally(() => loads--); };
  const mc = new MessageChannel(), wake = []; mc.port1.onmessage = () => wake.shift()();
  const turn = () => new Promise(r => { wake.push(r); mc.port2.postMessage(0); });   // a full task boundary, so every promise chain a callback started settles (setTimeout(0) would clamp to 4 ms)
  const css = ms => { for (const a of document.getAnimations()) {   // the HUD's transitions (toast, fade, hole title, power ring) on game time too
    if (a.playState === 'finished') continue; if (a.__t === undefined) { a.pause(); a.__t = 0; }
    a.__t += ms; if (a.__t >= (a.effect?.getComputedTiming().endTime ?? Infinity)) a.finish(); else a.currentTime = a.__t; } };
  W.__motion = {
    quiet: () => loads === 0 && document.fonts.status === 'loaded' ? performance.getEntriesByType('resource').length : -1,   // boot is over once this holds still
    start() { if (live) return; live = true; for (const t of timers.values()) N.ct(t.native); for (const a of document.getAnimations()) try { a.finish(); } catch { /* infinite: step() drives it */ } },   // boot's fades land at their end state
    reseed(n) { s = n >>> 0; },   // each throw draws from its own stream: a change elsewhere that eats a few more randoms (w10's shadow material) must not turn a made putt into a lob off the band
    mark: () => seq, delay(ms, after) { for (const [id, t] of timers) if (id > after) t.due += ms; },   // hold the timers set since mark() (the bot's 700 ms think), not the toasts already running
    async step(ms, n) {
      this.start(); const t0 = now;
      for (let k = 1; k <= n; k++) {
        while (loads) await new Promise(r => N.st(r, 4));   // a texture asked for last frame lands before this one draws, however slow the disk
        const to = t0 + ms * k / n;
        for (let i = 0; i < 1e4; i++) {   // due timers in order; a zero-delay chain (the bot planner yields every 12 candidates) finishes inside the tick
          let id = 0, t = null; for (const [j, u] of timers) if (u.due <= to && (!t || u.due < t.due)) { id = j; t = u; }
          if (!t) break; now = Math.max(now, t.due); fire(id, t); await turn();
        }
        now = to; const q = frames; frames = []; for (const f of q) call(f.fn, [now]); await turn(); css(ms / n);
      }
      await new Promise(r => N.raf(() => N.raf(r)));   // two real frames, so the canvas and the HUD over it are both composited before the screenshot
      return this.probe?.();
    },
  };
}

export async function settle(js, ms = 1000, limit = 60000) {   // boot is over once nothing is loading and the resource count holds for a second
  for (let last, since = Date.now(), t = Date.now(); Date.now() - t < limit; await sleep(100)) {
    const q = await js('__motion.quiet()'); if (q < 0 || q !== last) { last = q; since = Date.now(); } else if (Date.now() - since >= ms) return;
  }
  console.warn('assets never went quiet; recording anyway');
}
