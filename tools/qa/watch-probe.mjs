// What a player sees while someone else throws, and whether the athlete hides the target while he aims, measured in pixels on
// the virtual clock (tools/vclock.mjs), so the same build gives the same numbers.
//   node tools/qa/watch-probe.mjs [--port 8440] [--size 844x390] [--dpr 1] [--quality low] [--courses pine,meadow,lake,bluff]
//        [--holes 1,2,3] [--mode watch|framing] [--lies tee,40] [--who bot,own] [--shots dir] [--every 6] [--out file.json] [--seed 4] [--root checkout]
// watch: on each hole and lie a bot (players[1]) plans and throws while the human waits, as a desktop host watches a phone guest
// (the guest's replay takes the same path: windUp, run-up, doThrow with its flight); `own` is the human's own swipe from the
// same lie, the view the watcher should match. Every 30 fps frame renders three extra passes into an offscreen target: the
// scene without the disc (depth), then the disc alone depth-tested (its visible pixels) and untested (its pixels in frame), so a
// disc behind a trunk, a crown or the athlete counts as hidden. Per frame: camera, disc, visible/total disc px, the lens's height
// over the disc's plane (edge-on = 0), its clearance over the turf and to the nearest trunk, crown or arch/flag/tent capsule,
// and during the run-up the thrower's pixels and whether a frame edge cuts him.
// framing: the human's own aim on each lie (tee, 40, 70 = metres-fraction along the hole's way; rough = 70% and 9 m off the line;
// putt12 = 12 m short of the pin on its approach): his body rendered alone, then a basket proxy (cage and pole) and a 0.6 m pad at
// the landing spot the aim line shows, each depth-tested against him: the share of the basket and of the landing spot he hides,
// in the stance and over the swipe's reach-back (phase 0 -> .5) and the release.
// --shots: every --every'th recorded frame as a jpg (named course-hole-lie-who-frame).
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
  port: { type: 'string', default: '8440' }, size: { type: 'string', default: '844x390' }, dpr: { type: 'string', default: '1' }, quality: { type: 'string', default: 'low' },
  courses: { type: 'string', default: 'pine,meadow,lake,bluff' }, holes: { type: 'string', default: '1,2,3' }, mode: { type: 'string', default: 'watch' },
  lies: { type: 'string' }, who: { type: 'string', default: 'bot,own' }, shots: { type: 'string' }, every: { type: 'string', default: '6' }, out: { type: 'string' }, seed: { type: 'string', default: '4' },
  root: { type: 'string' }, chrome: { type: 'string', default: CHROME },   // --root: serve another checkout's game (an A/B against an older tree)
} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h] = o.size.split('x').map(Number), port = +o.port, cdp = port + 1000, mobile = o.quality === 'low', every = +o.every;
const lies = (o.lies || (o.mode === 'watch' ? 'tee,40' : 'tee,40,70,rough,putt12')).split(','), who = o.who.split(',');
if (o.shots) mkdirSync(o.shots, { recursive: true });
const server = spawn(process.execPath, ['serve.mjs'], { cwd: resolve(o.root || ROOT), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'chains-watch-'));
const chrome = spawn(o.chrome, ['--headless=new', '--mute-audio', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit',
  `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(130));   // a stopped run still takes its Chrome and server with it
process.on('exit', () => { chrome.kill(); server.kill(); try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir */ } });
async function poll(fn, what, ms = 30000) { for (const t = Date.now(); Date.now() - t < ms; await sleep(100)) { const v = await fn().catch(() => null); if (v) return v; } throw new Error('timed out: ' + what); }
await poll(async () => (await fetch(`http://localhost:${port}/`)).ok, 'static server');
const wsUrl = await poll(async () => (await (await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl, 'chrome');
const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pending = new Map(), errors = [];
ws.onmessage = ev => { const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); return m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 500)); };
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })); });
const js = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const until = (expr, ms = 60000) => poll(() => js(expr), expr, ms);
const step = (n = 1) => js(`__motion.step(${1000 / 30 * n}, ${2 * n})`);   // 30 fps frames of two 60 Hz ticks
const shot = async name => { if (!o.shots) return; const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); writeFileSync(join(o.shots, name + '.jpg'), Buffer.from(data, 'base64')); };

// Page side: offscreen passes on probe layer 31 and the per-frame sample.
const PAGE = `window.__wp = (() => {
  const c = __chains, T = c.THREE, R = c.renderer, L = 31, W = innerWidth, H = innerHeight;
  const rt = new T.WebGLRenderTarget(W, H), buf = new Uint8Array(W * H * 4);
  const solid = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), free = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false });
  const basket = new T.Group(), cage = new T.Mesh(new T.CylinderGeometry(.33, .3, 1.05, 16), solid), pole = new T.Mesh(new T.CylinderGeometry(.03, .03, 1.75, 6), solid), pad = new T.Mesh(new T.CircleGeometry(.6, 20).rotateX(-Math.PI / 2), solid);
  cage.position.y = .62 + .52; pole.position.y = .875; basket.add(cage, pole); for (const m of [basket, cage, pole, pad]) m.layers.set(L); basket.visible = pad.visible = false; c.scene.add(basket, pad);
  const on = (o, v) => o.traverse(x => v ? x.layers.enable(L) : x.layers.disable(L));
  const count = () => { R.readRenderTargetPixels(rt, 0, 0, W, H, buf); let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (buf[(y * W + x) * 4] > 127) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { n, box: n ? [x0 / W, 1 - (y1 + 1) / H, (x1 + 1) / W, 1 - y0 / H] : null }; };
  // depth from 'occluders' (null: the whole scene as drawn, minus 'target'), then 'target' alone: visible and total pixels
  function cover(occluders, target) {
    const keep = { rt: R.getRenderTarget(), auto: R.autoClear, layers: c.camera.layers.mask, ov: c.scene.overrideMaterial, sm: R.shadowMap.autoUpdate, cc: R.getClearColor(new T.Color()), ca: R.getClearAlpha() };
    R.shadowMap.autoUpdate = false; R.setRenderTarget(rt); R.autoClear = false; R.setClearColor(0, 0); R.clear(true, true, true);
    const tv = target.map(t => t.visible); target.forEach(t => t.visible = false);
    if (occluders) { occluders.forEach(x => on(x, true)); c.camera.layers.set(L); c.scene.overrideMaterial = solid; }
    R.render(c.scene, c.camera); if (occluders) occluders.forEach(x => on(x, false));
    R.clear(true, false, false); target.forEach((t, i) => { t.visible = true; on(t, true); }); c.camera.layers.set(L); c.scene.overrideMaterial = solid; R.render(c.scene, c.camera);
    const vis = count(); R.clear(true, false, false); c.scene.overrideMaterial = free; R.render(c.scene, c.camera); const tot = count();
    target.forEach((t, i) => { on(t, false); t.visible = tv[i]; });
    c.camera.layers.mask = keep.layers; c.scene.overrideMaterial = keep.ov; R.setRenderTarget(keep.rt); R.autoClear = keep.auto; R.shadowMap.autoUpdate = keep.sm; R.setClearColor(keep.cc, keep.ca);
    return { vis: vis.n, tot: tot.n, box: tot.box };
  }
  const q = v => Math.round(v * 100) / 100;
  // metres from the lens to the nearest collider surface (a trunk inside its height, a crown at the share the cameras use, a capsule)
  const near = p => { let m = 99; for (const t of c.world.treesNear(p.x, p.z)) { const d = Math.hypot(t.x - p.x, t.z - p.z); if (p.y > t.y - .5 && p.y < t.y + t.h) m = Math.min(m, d - t.r); m = Math.min(m, Math.hypot(d, p.y - t.y - t.fy) - t.fr * .8); }
    for (const k of c.world.camBlockers || []) { const e = [k.b[0] - k.a[0], k.b[1] - k.a[1], k.b[2] - k.a[2]], s = Math.max(0, Math.min(1, ((p.x - k.a[0]) * e[0] + (p.y - k.a[1]) * e[1] + (p.z - k.a[2]) * e[2]) / (e[0] ** 2 + e[1] ** 2 + e[2] ** 2 || 1)));
      m = Math.min(m, Math.hypot(p.x - k.a[0] - e[0] * s, p.y - k.a[1] - e[1] * s, p.z - k.a[2] - e[2] * s) - k.r); } return m; };
  return {
    watch() {   // one frame of someone's throw
      const G = c.G, p = G.players[G.cur], f = G.flight, cp = c.camera.position, r = { ph: G.phase, mode: c.cam.mode, cam: cp.toArray().map(q), fov: q(c.camera.fov) };
      r.clear = q(cp.y - c.world.height(cp.x, cp.z)); r.near = q(near(cp)); r.leafy = q(Math.min(9, ...c.world.treesNear(cp.x, cp.z).map(t => Math.hypot(t.x - cp.x, t.z - cp.z, cp.y - t.y - t.fy) - t.fr)));   // < 0: the lens inside a crown's leaf cards
      if (f?.pos && p?.discMesh) { const d = p.discMesh.position, a = cover(null, [p.discMesh]); r.disc = d.toArray().map(q); r.vis = a.vis; r.tot = a.tot; r.dist = q(cp.distanceTo(d));
        const n = new T.Vector3(0, 1, 0).applyQuaternion(p.discMesh.quaternion); r.elev = q(Math.asin(Math.abs(n.dot(new T.Vector3().subVectors(cp, d).normalize()))) * 180 / Math.PI);
        r.ev = f.events.slice(0, f.ei).map(e => e[1]); if (f.cam) { r.pull = q(f.cam.pull); r.leaf = !!f.cam.leaf; } }
      else if (G.phase === 'result' && p?.discMesh?.visible) { const a = cover(null, [p.discMesh]); r.rest = [a.vis, a.tot]; }
      if (p && /windup|release/.test(G.phase) || (f && f.t < .8)) { const a = cover([], [p.char.group]); r.man = a.tot; r.manBox = a.box && a.box.map(q); }
      return r;
    },
    framing() {   // the human's own aim frame: his body against the basket proxy and the landing pad
      const G = c.G, p = G.players[G.cur], b = c.world.basket, sp = G.shotPreview, r = { ph: G.phase, setPhase: q(p.char.getPhase() ?? -1) };
      basket.position.set(b.x, b.y, b.z); const bk = cover([p.char.group, p.discMesh], [basket]); r.basket = [bk.vis, bk.tot]; r.basketBox = bk.box && bk.box.map(q);
      if (sp?.rest && G.throwType !== 'putt') { pad.position.set(sp.rest[0], sp.rest[1] + .04, sp.rest[2]); const ld = cover([p.char.group, p.discMesh], [pad]); r.land = [ld.vis, ld.tot]; }
      const man = cover([], [p.char.group]); r.manBox = man.box && man.box.map(q); r.cam = c.camera.position.toArray().map(q);
      return r;
    },
  };
})()`;

// a lie on hole hi: tee, a fraction of the way along the hole's own line, the rough beside 70%, or 12 m short of the pin
const LIE = (hi, lie) => `(() => { const c = __chains, h = c.holes[${hi}], W = c.world, way = h.way, len = way.reduce((s, q, i) => i ? s + Math.hypot(q[0] - way[i - 1][0], q[1] - way[i - 1][1]) : 0, 0);
  const at = a => { let i = 0; for (; i < way.length - 2; i++) { const L = Math.hypot(way[i + 1][0] - way[i][0], way[i + 1][1] - way[i][1]); if (a <= L) break; a -= L; } const p = way[i], q = way[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [p[0] + (q[0] - p[0]) / L * a, p[1] + (q[1] - p[1]) / L * a, (q[0] - p[0]) / L, (q[1] - p[1]) / L]; };
  const k = ${JSON.stringify(lie)}; let x, z;
  if (k === 'tee') return [h.tee[0], h.teeY, h.tee[1]];
  if (k === 'putt12') { const [bx, bz] = h.basket, a = way[way.length - 2], L = Math.hypot(bx - a[0], bz - a[1]); x = bx - (bx - a[0]) / L * 12; z = bz - (bz - a[1]) / L * 12; }
  else { const f = k === 'rough' ? .7 : +k / 100, [px, pz, ux, uz] = at(len * f); x = px; z = pz;
    if (k === 'rough') for (const s of [9, -9, 12, -12, 6, -6]) { const rx = px - uz * s, rz = pz + ux * s; if (W.rough(rx, rz) > .5 && !W.inWater(rx, rz) && !W.treesNear(rx, rz).some(t => Math.hypot(t.x - rx, t.z - rz) < t.r + 1)) { x = rx; z = rz; break; } } }
  for (let i = 0; i < 12 && (W.inWater(x, z) || W.treesNear(x, z).some(t => Math.hypot(t.x - x, t.z - z) < t.r + .8)); i++) { x += (h.basket[0] - x) * .04; z += (h.basket[1] - z) * .04; }
  return [x, W.height(x, z), z]; })()`;

const results = [];
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: +o.dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('chains.coach', '["aim","throw","both"]'); } catch {}` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${clock})(${+o.seed})` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { const m = location.search.match(/probeCourse=(\\w+)/); if (m) localStorage.setItem('chains.course', m[1]); } catch {}` });   // a fresh page per course
  for (const course of o.courses.split(',')) {
    await send('Page.navigate', { url: `http://localhost:${port}/?mute=1&probeCourse=${course}` }); await sleep(800);
    await until(`!!(window.__chains && __chains.course && __chains.hero) && __chains.course.def.id === '${course}'`, 40000);
    if (await js('__chains.G.settings.quality') !== o.quality) { await js(`document.querySelector('#qualSeg [data-v="${o.quality}"]').click()`); await until(`__chains.course.quality === '${o.quality}' && __chains.G.settings.quality === '${o.quality}'`); }
    await settle(js); await js(PAGE); await step(30);
    await js(`document.getElementById('btnSolo').click()`);
    for (let i = 0; i < 900 && await js(`__chains.G.phase !== 'intro'`); i++) await step();
    await js(`(() => { const c = __chains; while (c.G.phase === 'intro') { c.G.introT = 99; c.nextTurn(); } })()`); await step(30);
    for (const hole of o.holes.split(',').map(Number)) {
      const hi = hole - 1;
      await js(`(() => { const c = __chains, G = c.G, h = c.holes[${hi}], W = c.world; G.flight = G.pending = G.tween = null; G.skipResult = null; G.holeIdx = ${hi}; c.course.setHole(${hi});
        const L = Math.hypot(h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]), d = [(h.basket[0] - h.tee[0]) / L, (h.basket[1] - h.tee[1]) / L], r = [-d[1], d[0]];
        G.players.forEach((p, i) => { p.done = false; p.strokes = 0; p.scores = []; p.lie = [h.tee[0], h.teeY, h.tee[1]];   // beside the pad, as startHole stands them
          const sx = h.tee[0] - d[0] * (1.2 + i * 1.3) - r[0] * 2.8, sz = h.tee[1] - d[1] * (1.2 + i * 1.3) - r[1] * 2.8; p.char.group.position.set(sx, W.height(sx, sz), sz); p.char.faceDir(d[0], d[1]); p.char.setPhase(null); p.char.snap?.(); }); })()`);
      for (const lie of lies) for (const by of (o.mode === 'watch' ? who : ['own'])) {
        const pi = by === 'bot' ? 1 : 0, name = `${course}-${hole}-${lie}-${by}`;
        const L = await js(LIE(hi, lie));
        await js(`(() => { const c = __chains, G = c.G, h = c.holes[${hi}]; G.flight = G.pending = G.tween = null; G.skipResult = null; c.cam.hold = null;
          G.players.forEach((p, i) => { p.done = false; p.strokes = i === ${pi} && ${JSON.stringify(lie)} !== 'tee' ? 1 : 0; p.lie = i === ${pi} ? ${JSON.stringify(L)} : [h.tee[0], h.teeY, h.tee[1]]; p.lieDist = Math.hypot(h.basket[0] - p.lie[0], h.basket[1] - p.lie[2]); });
          G.players[0].isBot = false; c.setupTurn(${pi}); c.cam.snap = true; __motion.reseed(${+o.seed * 1000 + hole * 37 + lies.indexOf(lie) * 7}); })()`);
        const rows = [];
        if (o.mode === 'framing') {
          await step(45);   // the rig eases in and the shot guide plans
          rows.push({ beat: 'aim', ...await js('__wp.framing()') }); await shot(`${name}-aim`);
          await js(`(() => { const c = __chains, G = c.G, p = G.players[0]; G.phase = 'windup'; p.char.setThrow(G.throwType); p.char.setPhase(0); })()`);
          for (let i = 1; i <= 10; i++) { await js(`__chains.G.players[0].char.setPhase(${(.5 * Math.sin(i / 10 * Math.PI / 2)).toFixed(4)})`); await step(); rows.push({ beat: 'windup', ...await js('__wp.framing()') }); if (i === 10) await shot(`${name}-reach`); }
          await js(`__chains.doThrow(0, { power: __chains.G.previewPower ?? .7, hyzer: 0, yawOffset: 0, launchOffset: 0 })`);
          for (let i = 0; i < 6 && await js(`__chains.G.phase === 'release'`); i++) { await step(); rows.push({ beat: 'release', ...await js('__wp.framing()') }); }
        } else {
          if (by === 'own') { await step(30);
            await js(`(() => { const c = __chains, G = c.G, p = G.players[0]; G.phase = 'windup'; p.char.setThrow(G.throwType); p.char.setPhase(0); })()`);
            for (let i = 1; i <= 10; i++) { await js(`__chains.G.players[0].char.setPhase(${(.85 * .5 * Math.sin(i / 10 * Math.PI / 2)).toFixed(4)})`); await step(); }
            await js(`__chains.doThrow(0, { power: __chains.G.previewPower ?? .8, hyzer: 0, yawOffset: 0, launchOffset: 0 })`); }
          let restAt = -1;
          for (let i = 0; i < 600; i++) {
            await step(); const r = await js('__wp.watch()'); r.f = i; rows.push(r);
            if (o.shots && (i % every === 0)) await shot(`${name}-${String(i).padStart(3, '0')}`);
            if (restAt < 0 && r.ph === 'result') restAt = i; if (restAt >= 0 && i - restAt >= 24) break;
          }
        }
        const s = o.mode === 'framing' ? sumFraming(rows) : sumWatch(rows); s.name = name; s.lie = L.map(v => Math.round(v * 10) / 10);
        console.log(name.padEnd(22), JSON.stringify(s, (k, v) => k === 'name' || k === 'lie' ? undefined : v));
        results.push({ name, summary: s, rows });
      }
    }
  }
  const all = results.map(r => r.summary), agg = o.mode === 'framing' ? aggFraming(all) : aggWatch(all);
  console.log('ALL', JSON.stringify(agg));
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  if (o.out) writeFileSync(o.out, JSON.stringify({ size: o.size, quality: o.quality, mode: o.mode, agg, results, errors }));
  process.exit(0);
} catch (e) { console.error('probe failed:', e?.stack || e, errors.slice(0, 5), await js(`location.href + ' · ' + !!window.__chains + ' · ' + document.body.innerText.replace(/\\s+/g, ' ').slice(0, 200)`).catch(x => x.message)); process.exit(1); }

function med(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; }
function pct(a, p) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; }
function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }
// the disc in the air: from launch to its first touch of the ground (or the basket), the frames the chase must show it
function sumWatch(rows) {
  const air = rows.filter(r => r.disc && !r.ev?.some(e => /^(land|skip|roll|flop|splash|chains|drop|pole|band|rim|chainout)$/.test(e)));
  const chase = air.filter(r => r.mode === 'flight'), seen = a => a.filter(r => r.vis >= 6);
  const steps = rows.slice(1).map((r, i) => Math.hypot(r.cam[0] - rows[i].cam[0], r.cam[1] - rows[i].cam[1], r.cam[2] - rows[i].cam[2]));
  const run = rows.filter(r => r.man !== undefined && (r.ph === 'windup' || r.ph === 'release'));
  const rest = rows.filter(r => r.rest).slice(-1)[0];
  return { air: air.length, chase: chase.length, seen: r2(seen(air).length / (air.length || 1)), chaseSeen: r2(seen(chase).length / (chase.length || 1)),
    px: r2(med(air.map(r => Math.sqrt(r.vis)))), pxP10: r2(pct(air.map(r => Math.sqrt(r.vis)), .1)), dist: r2(med(chase.map(r => r.dist))), elev: r2(med(chase.map(r => r.elev))),
    clearMin: r2(Math.min(...chase.map(r => r.clear))), low: chase.filter(r => r.clear < 1.6).length, leafy: chase.filter(r => r.leafy < 0).length, nearMin: r2(Math.min(...chase.map(r => r.near))), close: chase.filter(r => r.near < .6).length,
    stepMax: r2(Math.max(...steps)), runFrames: run.length, runCut: run.filter(r => !r.manBox || r.manBox[0] <= 0 || r.manBox[2] >= 1 || r.manBox[1] <= 0).length,
    restSeen: rest ? rest.rest[0] >= 6 : null };
}
function aggWatch(all) {
  const n = k => all.reduce((s, x) => s + (x[k] || 0), 0);
  return { throws: all.length, air: n('air'), seen: r2(all.reduce((s, x) => s + x.seen * x.air, 0) / (n('air') || 1)), chaseSeen: r2(all.reduce((s, x) => s + x.chaseSeen * x.chase, 0) / (n('chase') || 1)),
    pxMed: r2(med(all.map(x => x.px))), elevMed: r2(med(all.map(x => x.elev).filter(v => v != null))), low: n('low'), leafy: n('leafy'), close: n('close'), nearMin: r2(Math.min(...all.map(x => x.nearMin))), clearMin: r2(Math.min(...all.map(x => x.clearMin))),
    stepMax: r2(Math.max(...all.map(x => x.stepMax))), runCut: n('runCut'), restMissed: all.filter(x => x.restSeen === false).length };
}
function sumFraming(rows) {
  const hid = r => r.basket[1] ? 1 - r.basket[0] / r.basket[1] : null, lhid = r => r.land?.[1] ? 1 - r.land[0] / r.land[1] : null;
  const by = b => rows.filter(r => r.beat === b), mx = (a, f) => r2(Math.max(0, ...a.map(f).filter(v => v != null)));
  const aim = by('aim')[0];
  return { basketIn: !!aim.basket[1], aimHid: r2(hid(aim)), reachHid: mx(by('windup'), hid), releaseHid: mx(by('release'), hid), landIn: !!aim.land?.[1], aimLandHid: r2(lhid(aim)), reachLandHid: mx(by('windup'), lhid), man: aim.manBox };
}
function aggFraming(all) {
  const bad = k => all.filter(x => x[k] > .5).length;
  return { lies: all.length, basketOut: all.filter(x => !x.basketIn).length, aimHid50: bad('aimHid'), reachHid50: bad('reachHid'), releaseHid50: bad('releaseHid'), aimLandHid50: bad('aimLandHid'), reachLandHid50: bad('reachLandHid'),
    reachHidAny: all.filter(x => x.reachHid > .1).length, worst: all.filter(x => x.reachHid > .5 || x.aimHid > .5 || x.reachLandHid > .5).map(x => `${x.name} ${x.aimHid}/${x.reachHid}/${x.releaseHid} land ${x.aimLandHid}/${x.reachLandHid}`) };
}
