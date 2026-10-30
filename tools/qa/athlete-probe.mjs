// Athlete motion probe: steps the virtual clock (tools/vclock.mjs) one 60 Hz frame at a time through the moments an athlete is
// seen in, records the world positions of the pelvis, head, both wrists and hands, both soles and the disc, and flags the glitches
// a phone shows: pops (a joint's frame-to-frame move spiking far over its neighbours'), foot sliding (a loaded sole drifting along
// the ground), the disc leaving the throwing hand before launch, a hand inside the torso or a thigh, and idle jitter.
//   node tools/qa/athlete-probe.mjs [--port 8302] [--quality low|high] [--out dir] [--size 844x390] [--seed 4]
//                                   [--scenes menu,tee,swipe-backhand,swipe-forehand,backhand,forehand,putt,runup,react,turn]
// swipe-*: the player's own drive from the aim stance; backhand/forehand: his tee drive thrown as a bot (from the run-up), as
// tools/capture-motion.mjs --throw does; runup: the first bot's drive; react: celebrate, slump and clap; turn: a drive through
// to the next player's turn.
// Writes <out>/probe.json (every frame of every scene) and prints one summary row per scene and flag. Deterministic like the
// capture tools: the same build gives the same numbers.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CHROME } from '../chrome-path.mjs';
import { clock, settle } from '../vclock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values: o } = parseArgs({ options: {
  out: { type: 'string', default: 'art/qa/athlete-probe' }, port: { type: 'string', default: '8302' }, size: { type: 'string', default: '844x390' },
  quality: { type: 'string', default: 'low' }, seed: { type: 'string', default: '4' }, scenes: { type: 'string', default: 'menu,tee,swipe-backhand,swipe-forehand,backhand,forehand,putt,runup,react,turn' },
  chrome: { type: 'string', default: CHROME },
} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h] = o.size.split('x').map(Number), port = +o.port, cdp = port + 1000, out = resolve(ROOT, o.out), want = new Set(o.scenes.split(',')), mobile = o.quality === 'low';
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'chains-probe-'));
const chrome = spawn(o.chrome, ['--headless=new', '--mute-audio', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit',
  `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { chrome.kill(); server.kill(); try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir */ } });
async function poll(fn, what, ms = 30000) { for (const t = Date.now(); Date.now() - t < ms; await sleep(100)) { const v = await fn().catch(() => null); if (v) return v; } throw new Error('timed out: ' + what); }
await poll(async () => (await fetch(`http://localhost:${port}/`)).ok, 'static server');
const wsUrl = await poll(async () => (await (await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl, 'chrome');
const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pending = new Map(), errors = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })); });
const js = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const until = (expr, ms = 60000) => poll(() => js(expr), expr, ms);

// Page side: a sampler per athlete. Soles: every vertex of the shoe's underside in bind pose (lowest 3 cm of each foot), skinned
// each frame; their centroid is where the foot stands, their lowest point whether it carries weight.
const SAMPLER = `window.__probe = (() => {
  const c = __chains, T = c.THREE, v = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), info = new WeakMap();
  const prep = ch => { if (info.has(ch)) return info.get(ch); let skin = null; ch.group.traverse(o => { if (o.isSkinnedMesh && o.material?.customProgramCacheKey?.().startsWith('chains-body')) skin = o; });
    const spec = ch.group.getObjectByName('ChainsRig')?.userData || {}, ho = spec.handOffset || [0, -.25, 0], soles = {};
    if (skin) { const p = skin.geometry.attributes.position; for (const [s, k] of [[1, 'R'], [-1, 'L']]) { const idx = []; for (let i = 0; i < p.count; i++) if (p.getX(i) * s > .02 && p.getY(i) < .03) idx.push(i); soles[k] = idx; } }
    const r = { skin, soles, wrist: { R: new T.Vector3(ho[0], ho[1] + .075, ho[2] + .012), L: new T.Vector3(-ho[0], ho[1] + .075, ho[2] + .012) } }; info.set(ch, r); return r; };
  const q3 = x => [+x.x.toFixed(4), +x.y.toFixed(4), +x.z.toFixed(4)];
  const segDist = (p, s0, s1) => { b.subVectors(s1, s0); const t = Math.max(0, Math.min(1, a.subVectors(p, s0).dot(b) / b.lengthSq())); return p.distanceTo(a.copy(s0).addScaledVector(b, t)); };
  return (ch, disc) => {
    const I = prep(ch), J = ch.joints; ch.group.updateMatrixWorld(true); const r = { t: performance.now(), gp: c.G.phase, ph: ch.getPhase?.() ?? null };
    const W = n => J[n].getWorldPosition(new T.Vector3());
    const root = W('root'), head = W('head'), spine = W('spine'); r.root = q3(root); r.head = q3(head);
    for (const k of ['R', 'L']) { const el = J['el' + k], wr = el.localToWorld(I.wrist[k].clone()), eb = W('el' + k), hand = wr.clone().addScaledVector(wr.clone().sub(eb).normalize(), .07);
      r['wrist' + k] = q3(wr); r['hand' + k] = q3(hand);
      // inside the body: the hand centre within 9 cm of the spine line (pelvis to head) or 5 cm of a thigh's bone line
      r['inTorso' + k] = +segDist(hand, root, head).toFixed(3); r['inThigh' + k] = +Math.min(segDist(hand, W('hipR'), W('knR')), segDist(hand, W('hipL'), W('knL'))).toFixed(3); }
    // sole: the centroid of the shoe's underside; low: its lowest clearance over the ground under each vertex (the rig has no
    // ankle, so on a slope one end of a flat foot lifts); contact: the mean of the vertices within 1 cm of that lowest one, the
    // point a planted foot turns on, which must hold still while it carries weight
    if (I.skin) { I.skin.skeleton.update(); for (const k of ['R', 'L']) { const s = new T.Vector3(), pts = []; let lo = Infinity;
      for (const i of I.soles[k]) { I.skin.getVertexPosition(i, v); I.skin.localToWorld(v); s.add(v); const cl = v.y - c.world.height(v.x, v.z); pts.push([v.x, v.y, v.z, cl]); lo = Math.min(lo, cl); }
      s.divideScalar(I.soles[k].length || 1); const near = pts.filter(q => q[3] < lo + .01), ct = near.reduce((a, q) => [a[0] + q[0] / near.length, a[1] + q[1] / near.length, a[2] + q[2] / near.length], [0, 0, 0]);
      r['sole' + k] = q3(s); r['low' + k] = +lo.toFixed(4); r['contact' + k] = ct.map(x => +x.toFixed(4)); } }
    if (disc?.visible) { r.disc = q3(disc.getWorldPosition(new T.Vector3())); r.socket = q3(ch.hand.getWorldPosition(new T.Vector3())); }
    r.cam = q3(c.camera.position); r.vis = (() => { c.camera.updateMatrixWorld(); const f = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.camera.projectionMatrix, c.camera.matrixWorldInverse)); return f.containsPoint(spine); })();
    r.launch = !!(c.G.flight && c.G.flight.t > 0);
    return r; };
})()`;

const scenes = {};
async function record(name, who, frames, { done = null, pre = null } = {}) {   // who: JS expression for [char, disc]; pre(i): JS run before frame i
  const rows = [];
  for (let i = 0; i < frames; i++) {
    if (pre?.(i)) await js(pre(i));
    await js(`__motion.step(${1000 / 60}, 1)`);
    rows.push(await js(`(() => { const [ch, d] = ${who}; return __probe(ch, d); })()`));
    if (done && await js(done)) break;
  }
  scenes[name] = rows; return rows;
}
const step = (ms, frames = Math.max(1, Math.round(ms * .06))) => js(`__motion.step(${ms}, ${frames})`);
const P = i => `[__chains.G.players[${i}].char, __chains.G.players[${i}].discMesh]`;
// the hero throws his own tee shot as a bot with the type forced (tools/capture-motion.mjs --throw)
const forced = (T, setup) => `(async () => { const c = __chains, G = c.G, p = G.players[0]; p.isBot = true; p.difficulty = 'hard';
  Object.defineProperty(G, 'throwType', { configurable: true, enumerable: true, get: () => ${JSON.stringify(T)}, set() {} });
  ${setup || ''} c.setupTurn(0); })()`;
const release = `(() => { const G = __chains.G; delete G.throwType; G.throwType = 'backhand'; G.flight = G.pending = G.tween = null; })()`;

try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('chains.coach', '["aim","throw","both"]'); } catch {}` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${clock})(${+o.seed})` });
  await send('Page.navigate', { url: `http://localhost:${port}/` });
  await until(`!!(window.__chains && __chains.course && __chains.hero)`, 120000);
  if (await js('__chains.G.settings.quality') !== o.quality) { await js(`document.querySelector('#qualSeg [data-v="${o.quality}"]').click()`); await until(`__chains.course.quality === '${o.quality}' && __chains.G.settings.quality === '${o.quality}'`); }
  await settle(js); await js(SAMPLER);
  await step(1500);
  if (want.has('menu')) await record('menu', `[__chains.hero, null]`, 180);
  await js(`document.getElementById('btnSolo').click()`);
  for (let i = 0; i < 900 && await js(`__chains.G.phase !== 'intro'`); i++) await step(1000 / 60, 1);
  for (let i = 0; i < 900 && await js(`__chains.G.phase === 'intro'`); i++) await step(1000 / 60, 1);   // the flyover plays out: its end cuts to the tee (main.js nextTurn)
  if (want.has('tee')) await record('tee', P(0), 180);
  for (const T of ['backhand', 'forehand']) if (want.has(T)) {
    await js(release); await js(`__motion.reseed(${+o.seed * 1000 + 3})`); await js(forced(T)); await step(200);
    await record(T, P(0), 600, { done: `(() => { const f = __chains.G.flight; return !!f && f.t > 2.5; })()` });
    await js(release); await js(`(() => { const c = __chains, p = c.G.players[0], h = c.holes[c.G.holeIdx]; p.isBot = false; p.lie = [h.tee[0], h.teeY, h.tee[1]]; p.strokes = 0; c.setupTurn(0); })()`); await step(1000);
  }
  for (const T of ['swipe-backhand', 'swipe-forehand']) if (want.has(T)) {   // the player's own drive from the aim stance: a .35 s swipe (main.js onGesture), released at 85 %
    const type = T.split('-')[1];
    await js(release); await js(`(() => { const c = __chains, p = c.G.players[0], h = c.holes[c.G.holeIdx]; p.isBot = false; p.lie = [h.tee[0], h.teeY, h.tee[1]]; p.strokes = 0; c.setupTurn(0); c.G.throwType = '${type}'; })()`); await step(1500);
    await record(T, P(0), 600, { done: `(() => { const f = __chains.G.flight; return !!f && f.t > 2.5; })()`, pre: i => i === 30 ? `(() => { const c = __chains, G = c.G, p = G.players[0]; G.phase = 'windup'; p.char.setThrow(G.throwType); p.char.setPhase(0); })()`
      : i > 30 && i <= 51 ? `__chains.G.players[0].char.setPhase(${(.85 * .5 * Math.sin((i - 30) / 21 * Math.PI / 2)).toFixed(4)})` : i === 52 ? `__chains.doThrow(0, { power: .85, hyzer: 0, yawOffset: 0, launchOffset: 0 })` : null });
  }
  if (want.has('putt')) {
    await js(release);
    await js(`(() => { const c = __chains, G = c.G, p = G.players[0], h = c.holes[G.holeIdx], b = h.basket, dx = h.tee[0] - b[0], dz = h.tee[1] - b[1], L = Math.hypot(dx, dz); p.isBot = true; p.difficulty = 'hard';
      const x = b[0] + dx / L * 6.5, z = b[1] + dz / L * 6.5; p.lie = [x, c.world.height(x, z), z]; p.strokes = 2; c.setupTurn(0); })()`);
    await step(300);
    await record('putt', P(0), 600, { done: `(() => { const f = __chains.G.flight; return !!f && f.t > 2.5; })()` });
    await js(`(() => { const c = __chains, p = c.G.players[0], h = c.holes[c.G.holeIdx]; p.isBot = false; p.lie = [h.tee[0], h.teeY, h.tee[1]]; p.strokes = 0; c.G.flight = c.G.pending = c.G.tween = null; c.setupTurn(0); })()`); await step(500);
  }
  if (want.has('runup')) {   // the first bot's drive from the tee: the x-step run-up the aim camera watches
    await js(release); await js(`__motion.reseed(${+o.seed * 1000 + 5})`);
    await js(`(() => { const c = __chains, G = c.G, h = c.holes[G.holeIdx], p = G.players[1]; p.lie = [h.tee[0], h.teeY, h.tee[1]]; p.strokes = 0; c.setupTurn(1); })()`);
    await record('runup', P(1), 600, { done: `(() => { const f = __chains.G.flight; return !!f && f.t > 2.5; })()` });
    scenes.runup.runUp = await js(`!!__chains.G.players[1].runUp || __chains.G.players[1].char.getPhase() !== null`);
  }
  if (want.has('react')) {   // the tee's bystanders: celebrate, slump, clap, each from a standing idle
    await js(release); await js(`(() => { const c = __chains, h = c.holes[c.G.holeIdx]; for (const p of c.G.players) { p.lie = [h.tee[0], h.teeY, h.tee[1]]; p.strokes = 0; } c.setupTurn(0); })()`); await step(1000);
    for (const [k, i] of [['celebrate', 1], ['slump', 2], ['clap', 1]]) { await js(`__chains.G.players[${i}].char.react('${k}')`); await record('react-' + k, P(i), k === 'clap' ? 200 : 240); await step(800); }
  }
  if (want.has('turn')) {   // a turn change: the thrower's follow-through hands over to the idle (the .35 s hold, then keepTravel) and the others are parked
    await js(release); await js(`__motion.reseed(${+o.seed * 1000 + 7})`); await js(forced('backhand')); await step(200);
    await record('turn', P(0), 900, { done: `(() => { const G = __chains.G; return G.cur !== 0 && G.phase === 'aim'; })()` });
    const after = await record('turn-after', P(0), 120);
  }
  const summary = analyse(scenes);
  writeFileSync(join(out, 'probe.json'), JSON.stringify({ quality: o.quality, size: o.size, summary, scenes }));
  for (const [k, s] of Object.entries(summary)) console.log(k.padEnd(16), JSON.stringify(s));
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  process.exit(0);
} catch (e) { console.error('probe failed:', e?.stack || e, errors.slice(0, 5)); process.exit(1); }

// ---------- analysis ----------
function analyse(all) {
  const out = {}, d = (a, b) => a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0, med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] || 0; };
  for (const [name, rows] of Object.entries(all)) {
    if (!rows.length) continue;
    const s = { frames: rows.length }, cut = i => i > 0 && d(rows[i].cam, rows[i - 1].cam) > 1;   // a camera cut hides whatever jumps on that frame
    // pops: a joint's move this frame against the median move of the 6 frames around it (a cross-fade or state change that jumps)
    const pops = [];
    for (const j of ['root', 'head', 'wristR', 'wristL', 'soleR', 'soleL']) {
      const m = rows.map((r, i) => i ? d(r[j], rows[i - 1][j]) : 0);
      for (let i = 1; i < m.length - 1; i++) { if (cut(i)) continue; const around = med([...m.slice(Math.max(1, i - 3), i), ...m.slice(i + 1, i + 4)]); if (m[i] > .015 && m[i] > 3.5 * Math.max(around, .002)) pops.push({ j, f: i, cm: +(m[i] * 100).toFixed(1), around: +(around * 100).toFixed(2), gp: rows[i].gp, ph: rows[i].ph === null ? null : +rows[i].ph.toFixed(3), seen: rows[i].vis }); }
    }
    s.pops = pops.sort((a, b) => b.cm / Math.max(b.around, .2) - a.cm / Math.max(a.around, .2)).slice(0, 6);
    // foot sliding: while a sole stands loaded (its lowest point within 2.5 cm of the ground, moving < 1 cm a frame vertically),
    // how far its centre drifts along the ground from where it was planted
    const slides = [];
    for (const k of ['R', 'L']) { let start = null, worst = 0, at = 0;
      const end = i => { if (start !== null && i - start >= 6) slides.push({ foot: k, from: start, to: i - 1, cm: +(worst * 100).toFixed(1), at, seen: rows[at].vis }); start = null; worst = 0; };
      rows.forEach((r, i) => { const jump = i > 0 && r['contact' + k] && Math.hypot(r['contact' + k][0] - rows[i - 1]['contact' + k][0], r['contact' + k][2] - rows[i - 1]['contact' + k][2]) > .08;   // a foot that jumps 8 cm in a frame was placed (a pop), not slid
        const loaded = r['low' + k] !== undefined && r['low' + k] < .02 && !cut(i) && !jump;
        if (!loaded) return end(i); if (start === null) { start = i; return; } const p0 = rows[start]['contact' + k], p = r['contact' + k], dd = Math.hypot(p[0] - p0[0], p[2] - p0[2]); if (dd > worst) { worst = dd; at = i; } });
      end(rows.length); }
    s.slide = slides.sort((a, b) => b.cm - a.cm).slice(0, 4);
    // the disc against the hand that throws it, until launch: its offset from the socket should hold steady (the grip), never jump
    const held = rows.filter(r => r.disc && !r.launch && r.ph !== null), gap = held.map(r => d(r.disc, r.socket));
    if (held.length > 4) { const g0 = med(gap); let jump = 0, jf = -1; for (let i = 1; i < held.length; i++) { const dj = Math.abs(gap[i] - gap[i - 1]); if (dj > jump) { jump = dj; jf = rows.indexOf(held[i]); } }
      s.disc = { medianCm: +(g0 * 100).toFixed(1), maxCm: +(Math.max(...gap) * 100).toFixed(1), maxStepCm: +(jump * 100).toFixed(1), atFrame: jf }; }
    // a hand inside the body
    const inside = []; rows.forEach((r, i) => { for (const k of ['R', 'L']) { if (r['inTorso' + k] < .09) inside.push({ f: i, hand: k, part: 'torso', cm: +(r['inTorso' + k] * 100).toFixed(1) }); if (r['inThigh' + k] < .05) inside.push({ f: i, hand: k, part: 'thigh', cm: +(r['inThigh' + k] * 100).toFixed(1) }); } });
    s.inside = { frames: new Set(inside.map(x => x.f)).size, worst: inside.sort((a, b) => a.cm - b.cm).slice(0, 2) };
    // idle jitter: the mean second difference of the wrists and head over frames that stand still otherwise (mm)
    const jit = []; for (let i = 1; i < rows.length - 1; i++) for (const j of ['head', 'wristR', 'wristL']) { const a = rows[i - 1][j], b = rows[i][j], c = rows[i + 1][j]; jit.push(Math.hypot(a[0] - 2 * b[0] + c[0], a[1] - 2 * b[1] + c[1], a[2] - 2 * b[2] + c[2])); }
    s.jitterMm = +(med(jit) * 1000).toFixed(2); s.jitterP95Mm = +([...jit].sort((x, y) => x - y)[Math.floor(jit.length * .95)] * 1000).toFixed(2);
    s.visibleFrames = rows.filter(r => r.vis).length;
    out[name] = s;
  }
  return out;
}
