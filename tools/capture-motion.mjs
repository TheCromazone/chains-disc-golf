// Deterministic motion capture: capture.mjs's moments as video, so the gauntlet can judge motion instead of stills. A virtual
// clock injected ahead of every page script owns performance.now, Date.now, requestAnimationFrame, the timers and the CSS
// animations, and Math.random is seeded, so each video frame advances exactly 1000/fps ms of game time however slowly the GPU and
// the screenshot run, and two runs draw the same frames. Zero npm dependencies (Node's WebSocket speaks CDP to a private headless
// Chrome); ffmpeg encodes the clips and Python + Pillow lays out the contact sheets.
//   node tools/capture-motion.mjs --out art/qa/motion [--port 8212] [--clips flyover,drive,putt,idle] [--fps 30] [--size 1280x720]
//                                 [--dpr 1] [--quality high|low] [--mobile] [--seed 4] [--difficulty hard] [--throw backhand|bot|<THROWS key>]
// --throw forces the drive's throw type (bot = the planner's own pick); the putt stays a putt.
// Per clip: <clip>/frames/NNNN.jpg, <clip>.mp4, <clip>-sheet.jpg (8 frames, 4x2) and <clip>.json: the throw (type, disc, power,
// hyzer, yaw offset), the event timeline (intro-start, intro-end, windup, release = doThrow, launch = the disc leaves the hand, the
// physics' own tree/land/skip/roll/chains/drop..., rest) at frame index and virtual ms, the biggest per-frame camera jumps (cuts
// and snaps) and a per-frame camera/disc track.
// motion.json: console errors by stage, real ms per step, GPU. The timeline never changes with --clips (menu 3 s, Solo, hole 1's
// intro, tee address 3 s, the hero's drive thrown as a bot, a 6.5 m putt): stretches nobody asked for are stepped without
// screenshots, so a clip's frames never depend on which others were recorded.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CHROME } from './chrome-path.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: o } = parseArgs({ options: {
  out: { type: 'string', default: 'art/qa/motion' }, port: { type: 'string', default: '8212' }, size: { type: 'string', default: '1280x720' },
  dpr: { type: 'string', default: '1' }, quality: { type: 'string' }, mobile: { type: 'boolean', default: false }, fps: { type: 'string', default: '30' },
  clips: { type: 'string', default: 'flyover,drive,putt,idle' }, seed: { type: 'string', default: '4' }, difficulty: { type: 'string', default: 'hard' }, throw: { type: 'string', default: 'backhand' },   // the reference drive is a backhand
  chrome: { type: 'string', default: CHROME },
} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h] = o.size.split('x').map(Number), port = +o.port, cdp = port + 1000, out = resolve(ROOT, o.out), fps = +o.fps, dt = 1000 / fps;
const ticks = Math.ceil(60 / fps);   // game frames per video frame, each <= 1/60 s: main.js's adaptive resolution reads a 33 ms frame as a slow GPU and drops to 65%
const STAGE = { flyover: 1, idle: 2, drive: 3, putt: 4 }, want = new Set(o.clips.split(',')), upto = Math.max(...[...want].map(c => STAGE[c] ?? -1));
if ([...want].some(c => !(c in STAGE))) throw new Error('clips must be from ' + Object.keys(STAGE).join(','));
mkdirSync(out, { recursive: true });

// Page side, injected ahead of every script. Boot runs on real timers against a clock frozen at 0: no frame is drawn yet, so the
// asset loads and the quality switch's fade take whatever real time they need without any of it leaking into the game. start()
// then hands every timer, rAF callback and CSS animation to step(), the only thing that moves time from there on.
function clock(seed) {
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

const server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'chains-motion-'));
const chrome = spawn(o.chrome, ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist',
  '--disable-gpu-vsync', '--disable-frame-rate-limit',   // the step's one real rAF (compositor hand-off) returns at once instead of waiting on a 60 Hz beat
  `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { chrome.kill(); server.kill(); try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir, harmless */ } });

async function poll(fn, what, ms = 30000) { for (const t = Date.now(); Date.now() - t < ms; await sleep(100)) { const v = await fn().catch(() => null); if (v) return v; } throw new Error('timed out: ' + what); }
await poll(async () => (await fetch(`http://localhost:${port}/`)).ok, `static server on ${port}`);
const wsUrl = await poll(async () => (await (await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl, 'chrome at ' + o.chrome);

const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0, stage = 'boot'; const pending = new Map(), errors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); return m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push({ stage, text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push({ stage, text: m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 4000) });
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const until = (expr, ms = 60000) => poll(() => js(expr), expr, ms);
async function settle(ms = 1000, limit = 60000) {   // boot is over once nothing is loading and the resource count holds for a second
  for (let last, since = Date.now(), t = Date.now(); Date.now() - t < limit; await sleep(100)) {
    const q = await js('__motion.quiet()'); if (q < 0 || q !== last) { last = q; since = Date.now(); } else if (Date.now() - since >= ms) return;
  }
  console.warn('assets never went quiet; recording anyway');
}

// Events: what a frame shows for the first time, polled from the game's own state (never by editing it).
const PHASE = { intro: 'intro-start', windup: 'windup', release: 'release', flight: 'launch', result: 'rest' };
const GROUND = ['land', 'skip', 'roll', 'flop', 'splash', 'ob'], BASKET = ['chains', 'drop', 'chainout', 'band', 'rim', 'pole', 'arch'];
let prev = { phase: 'menu', ev: null };
function changes(s) {
  const n = [];
  if (s.phase !== prev.phase) { if (prev.phase === 'intro') n.push('intro-end'); n.push(PHASE[s.phase] || s.phase); }
  if (s.ev) n.push(...s.ev.slice(prev.ev && s.ev.length >= prev.ev.length ? prev.ev.length : 0));
  prev = s; return n;
}
const first = (seen, names) => Math.min(...names.map(k => seen[k] ?? Infinity));
const recs = {}, unrecorded = [], pad = i => String(i).padStart(4, '0');
const open = clip => { const dir = join(out, clip, 'frames'); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); return { dir, n: 0, events: [], track: [], real: [] }; };
async function seg(clip, { cap, done = () => false, label }) {   // step video frames (shooting them when the clip was asked for) until done() or cap ms
  const rec = want.has(clip) ? recs[clip] ||= open(clip) : null, seen = {};
  stage = clip; if (rec && label) rec.events.push({ name: label, frame: rec.n, ms: +(rec.n * dt).toFixed(1) });
  for (let i = 0, n = Math.round(cap / dt); i < n; i++) {
    const a = performance.now(), s = await js(`__motion.step(${dt}, ${ticks})`), names = changes(s);
    for (const k of names) seen[k] ??= s.t;
    if (rec) {
      if (s.thr) rec.throw ??= s.thr;   // the flight's own launch params: what was really thrown
      const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      writeFileSync(join(rec.dir, pad(rec.n) + '.jpg'), Buffer.from(data, 'base64'));
      for (const name of names) rec.events.push({ name, frame: rec.n, ms: +(rec.n * dt).toFixed(1), vt: +s.t.toFixed(1) });
      rec.track.push([rec.n, s.phase, s.cam, s.disc]); rec.real.push(performance.now() - a); rec.n++;
    } else unrecorded.push(performance.now() - a);
    if (done(s, seen)) break;
  }
}
const mean = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
const SHEET = `import sys
from PIL import Image, ImageDraw, ImageFont, ImageOps
out, cells = sys.argv[1], sys.argv[2:]
sheet = Image.new('RGB', (1280, 360)); d = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('arial.ttf', 17)
except OSError: font = ImageFont.load_default()
for i, cell in enumerate(cells):
    path, label = cell.rsplit('|', 1); x, y = i % 4 * 320, i // 4 * 180
    sheet.paste(ImageOps.pad(Image.open(path).convert('RGB'), (320, 180)), (x, y))
    b = d.textbbox((x + 7, y + 5), label, font=font); d.rectangle((b[0] - 4, b[1] - 3, b[2] + 4, b[3] + 3), fill=(0, 0, 0)); d.text((x + 7, y + 5), label, fill=(255, 255, 255), font=font)
sheet.save(out, quality=90)`;

const stats = { size: o.size, dpr: +o.dpr, mobile: o.mobile, fps, ticks, seed: +o.seed, difficulty: o.difficulty, throw: o.throw, clips: {} };
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${clock})(${+o.seed})` });
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: +o.dpr, mobile: o.mobile });
  if (o.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: `http://localhost:${port}/` });
  await until(`!!(window.__chains && __chains.course && __chains.hero)`, 120000);
  const q = { full: 'high', lite: 'low' }[o.quality] || o.quality;
  if (q && await js('__chains.G.settings.quality') !== q) {   // still on boot's real timers: the course swap sleeps through its fade
    await js(`document.querySelector('#qualSeg [data-v="${q}"]').click()`);
    await until(`__chains.course.quality === '${q}' && __chains.G.settings.quality === '${q}'`);
  }
  await settle();
  stats.quality = await js('__chains.G.settings.quality');
  stats.gpu = await js(`(() => { const g = __chains.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
  await js(`__motion.probe = () => { const c = __chains, G = c.G, f = G.flight, q = v => Math.round(v * 100) / 100;
    return { t: performance.now(), phase: G.phase, ev: f ? f.events.slice(0, f.ei).map(e => e[1]) : null, disc: f?.pos ? f.pos.map(q) : null, cam: c.camera.position.toArray().map(q),
      thr: f && { throwType: f.params.throwType, discId: f.params.discId, power: q(f.params.power), hyzer: q(f.params.hyzer), yawOffset: q(f.params.yawOffset),
        thrown: q(f.result.thrown), toPin: q(f.result.dist), holed: f.result.holed, ob: f.result.ob, lieRough: q(c.world.rough(f.result.lie[0], f.result.lie[2])) } }; }`);   // lieRough: world.rough at the lie, 0 on the fairway, 1 five metres past its edge

  await seg('idle', { cap: 3000, label: 'menu' });   // the clubhouse hero
  if (upto >= 1) { await js(`document.getElementById('btnSolo').click()`); await seg('flyover', { cap: 8000, done: (s, e) => e['intro-start'] != null && s.phase !== 'intro' }); }
  if (upto >= 2) await seg('idle', { cap: 3000, label: 'tee' });   // the human's tee address before anything starts
  if (upto >= 3) {   // the hero throws his own tee shot as a bot, his think held 0.8 s longer so the clip opens 1.5 s before the wind-up
    // --throw: G.throwType becomes a fixed accessor, so the bot's plan can't swap it and the wind-up, HUD and launchNow's physics all
    // read the forced type; the moment botTurn hands over its wind-up tween, the release is re-aimed with bot.js's own search (its
    // candidate grid, score and execution noise) run for that throw alone, so the flight is planned for the throw it really is.
    await js(`(async () => { const c = __chains, G = c.G, p = G.players[0], P = await import('/src/physics.js'), T = ${JSON.stringify(o.throw === 'bot' ? null : o.throw)};
      p.isBot = true; p.difficulty = ${JSON.stringify(o.difficulty)};
      if (T && !P.THROWS[T]) throw new Error('--throw must be bot or one of ' + Object.keys(P.THROWS).join(','));
      // the noise is drawn from its own stream at the wind-up: three's uuids for a material or texture first used during the 4 s
      // before the bot plans (w10's shadow-pass material) shifted the shared stream and turned a made putt into a lob off the band
      const replan = window.__replan = (T, seed, noise = 1) => { __motion.reseed(seed); const w = c.world, b = w.basket, L = p.lie, dx = b.x - L[0], dz = b.z - L[2], dist = Math.hypot(dx, dz), dir = [dx / dist, dz / dist], disc = P.discById(G.discId), lefty = p.appearance?.hand === 'left';
          const powers = dist > 82 ? [.8, .9, 1] : dist > 50 ? [.62, .75, .88, 1] : dist > 26 ? [.45, .58, .72, .86] : [.3, .36, .42, .48, .55, .63]; let best = null, low = Infinity;
          for (const yawOffset of [-28, -18, -9, 0, 9, 18, 28]) for (const power of powers) for (const hyzer of [0, 14]) {
            const r = P.simulate({ pos: [L[0], L[1] + 1.15, L[2]], dir, lefty, throwType: T, disc, power, yawOffset, hyzer }, w, { maxT: 12 }).result, s = r.dist + (r.ob ? 45 : 0) - (r.holed ? 1000 : 0);
            if (s < low) { low = s; best = { power, yawOffset, hyzer }; } }
          const [ny, np, nh] = { easy: [7, .13, 8], medium: [3.5, .07, 4], hard: [1.4, .03, 1.5] }[p.difficulty] || [3.5, .07, 4], g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15 * noise;   // bot.js NOISE and gauss
          return { power: Math.min(1, Math.max(.12, best.power + g() * np)), yawOffset: best.yawOffset + g() * ny, hyzer: best.hyzer + g() * nh, launchOffset: 0 }; };
      if (T) {
        let tw = G.tween, plan = null;
        Object.defineProperty(G, 'throwType', { configurable: true, enumerable: true, get: () => T, set() {} });
        Object.defineProperty(G, 'tween', { configurable: true, enumerable: true, get: () => tw, set(v) {
          if (v?.done && !plan) { plan = replan(T, ${+o.seed * 1000 + 11}); v.done = () => c.doThrow(G.cur, plan); document.getElementById('waiting').textContent = p.name + ' · ' + P.THROWS[T].name + ', ' + P.discById(G.discId).type.toLowerCase(); }   // botTurn's label named its own pick
          tw = v; } });
      }
      __motion.reseed(${+o.seed * 1000 + 1}); const m = __motion.mark(); c.setupTurn(0); __motion.delay(800, m); })()`);
    await seg('drive', { cap: 12000, done: (s, e) => s.t >= first(e, GROUND) + 1000 });
  }
  if (upto >= 4) {   // capture.mjs's putt, 6.5 m short on the tee side, thrown by the bot: 3 s unrecorded while the camera flies in and the drive's result toast clears, then 1 s before the stroke
    await js(`(() => { const c = __chains, G = c.G, p = G.players[0], h = c.holes[G.holeIdx], b = h.basket, dx = h.tee[0] - b[0], dz = h.tee[1] - b[1], L = Math.hypot(dx, dz);
      delete G.throwType; delete G.tween; G.throwType = 'backhand';   // back to plain fields (setupTurn picks the putt)
      G.flight = G.pending = G.tween = null; const x = b[0] + dx / L * 6.5, z = b[1] + dz / L * 6.5; p.lie = [x, c.world.height(x, z), z]; p.strokes = 2;
      let tw = null, plan = null;   // the putt is thrown with one fixed plan (the bot's own that went in on run 10's baseline): judged are the stroke and the camera, the reference putt goes in, and a 6.5 m putt is so sensitive that any shift in the shared random stream turned the bot's pick into a lob off the band
      Object.defineProperty(G, 'tween', { configurable: true, enumerable: true, get: () => tw, set(v) { if (v?.done && !plan && G.phase === 'windup') { plan = { power: .58, yawOffset: 1.44, hyzer: .76, launchOffset: 0 }; v.done = () => c.doThrow(G.cur, plan); } tw = v; } });
      __motion.reseed(${+o.seed * 1000 + 2}); const m = __motion.mark(); c.setupTurn(0); __motion.delay(3300, m); })()`);
    await seg('putt-settle', { cap: 3000 });
    await seg('putt', { cap: 10000, done: (s, e) => s.t >= first(e, [...GROUND, ...BASKET]) + 1500 });
  }
  stage = 'encode';
  for (const [clip, r] of Object.entries(recs)) {
    const at = i => `${(i * dt / 1000).toFixed(2)} s`, dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const joins = new Set(r.events.filter(e => e.vt === undefined).map(e => e.frame));   // idle's menu -> tee splice is the tool's cut, not the game's
    const jumps = r.track.slice(1).map((t, i) => [t[0], +dist(t[2], r.track[i][2]).toFixed(2)]).filter(j => !joins.has(j[0])).sort((a, b) => b[1] - a[1]).slice(0, 5);   // [frame, metres]: a cut or a snap stands out from the smooth moves
    const meta = { clip, fps, frames: r.n, seconds: +(r.n * dt / 1000).toFixed(2), size: o.size, dpr: +o.dpr, quality: stats.quality, seed: +o.seed, difficulty: o.difficulty, throw: r.throw ?? null, realMsPerFrame: { mean: mean(r.real), max: +Math.max(...r.real).toFixed(1) }, events: r.events, camJumps: jumps, track: 0 };
    writeFileSync(join(out, clip + '.json'), JSON.stringify(meta, null, 2).replace('"track": 0', `"track": [\n${r.track.map(t => '    ' + JSON.stringify(t)).join(',\n')}\n  ]`));   // [frame, phase, camera xyz, disc xyz | null]
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-start_number', '0', '-i', join(r.dir, '%04d.jpg'), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', join(out, clip + '.mp4')], { encoding: 'utf8' });
    if (ff.status !== 0) errors.push({ stage, text: `ffmpeg ${clip}: ${ff.error || ff.stderr}` });
    const py = spawnSync('python', ['-c', SHEET, join(out, clip + '-sheet.jpg'), ...Array.from({ length: 8 }, (_, i) => Math.round(i * (r.n - 1) / 7)).map(i => `${join(r.dir, pad(i) + '.jpg')}|${at(i)}  #${i}`)], { encoding: 'utf8' });
    if (py.status !== 0) errors.push({ stage, text: `sheet ${clip}: ${py.error || py.stderr}` });
    stats.clips[clip] = { frames: r.n, seconds: meta.seconds, realMsPerFrame: meta.realMsPerFrame, events: r.events.map(e => `${e.name}@${e.frame}`).join(' ') };
    console.log(`${clip}: ${r.n} frames (${meta.seconds} s)  ${r.throw ? r.throw.throwType + '/' + r.throw.discId + '  ' : ''}${stats.clips[clip].events}  ${meta.realMsPerFrame.mean} ms/frame  ${join(out, clip + '.mp4')}`);
  }
  stats.unrecordedMsPerStep = mean(unrecorded); stats.errors = errors;
  writeFileSync(join(out, 'motion.json'), JSON.stringify(stats, null, 2));
  if (errors.length) console.log(`${errors.length} console error(s), see motion.json`);
  process.exit(0);
} catch (e) {
  stats.errors = errors; stats.failure = String(e?.stack || e);
  writeFileSync(join(out, 'motion.json'), JSON.stringify(stats, null, 2));
  console.error('motion capture failed:', e?.message || e, errors.length ? `\n${errors.map(x => x.text).join('\n')}` : '');
  process.exit(1);
}
