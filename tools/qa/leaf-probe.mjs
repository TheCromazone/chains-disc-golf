// Drives that clip a crown and fly on, the case the chase's leaf hold must let go of (r4 verifier: the held lens parked behind
// the leaves while the disc flew 18 m off). On each hole it searches the tee's drives (runSim over yaw, power, hyzer, backhand and
// forehand) for ones that go into a crown after the follow-through and come to rest at least --far m past it (the longest per
// crown, --max a hole), then replays each from the tee on the virtual clock (tools/vclock.mjs) as the human's own throw ('own') and
// as a watched one ('watched': p.runUp set, so the tee camera holds to camAt and cuts to the chase). Per 30 fps frame: the lens's
// distance to the disc, the disc inside the frame (projected, not depth-tested), the disc in the leaves, the hold, the lens in a
// crown's leaf cards or near a trunk. Summed over the frames from the disc's first entry into a crown to its first touch.
//   node tools/qa/leaf-probe.mjs [--port 8440] [--size 844x390] [--dpr 1] [--courses pine,meadow,lake,bluff] [--holes 1,...,9]
//        [--far 12] [--max 2] [--who own,watched] [--shots dir] [--every 2] [--cost] [--out file.json] [--root checkout]
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
  port: { type: 'string', default: '8440' }, size: { type: 'string', default: '844x390' }, dpr: { type: 'string', default: '1' }, courses: { type: 'string', default: 'pine,meadow,lake,bluff' },
  holes: { type: 'string', default: '1,2,3,4,5,6,7,8,9' }, far: { type: 'string', default: '12' }, max: { type: 'string', default: '2' }, who: { type: 'string', default: 'own,watched' },
  shots: { type: 'string' }, every: { type: 'string', default: '2' }, cost: { type: 'boolean', default: false }, out: { type: 'string' }, root: { type: 'string' }, seed: { type: 'string', default: '4' },
} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h] = o.size.split('x').map(Number), port = +o.port, cdp = port + 1000;
if (o.shots) mkdirSync(o.shots, { recursive: true });
const server = spawn(process.execPath, ['serve.mjs'], { cwd: resolve(o.root || ROOT), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'chains-leaf-'));
const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit',
  `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(130));
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
const shot = async name => { const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); writeFileSync(join(o.shots, name + '.jpg'), Buffer.from(data, 'base64')); };

// Page side: the drive search, and one frame's sample (cheap: no extra render passes, so a run of ~100 drives takes minutes)
const PAGE = `window.__lp = (() => {
  const c = __chains, W = () => c.world, q = v => Math.round(v * 100) / 100;
  const inLeaves = p => W().treesNear(p[0], p[2]).some(t => Math.hypot(p[0] - t.x, p[2] - t.z, p[1] - t.y - t.fy) < t.fr);
  return {
    search(hi, far, max) {   // the tee's drives that go into a crown after .33 s, come out, and rest >= far m past the entry: the longest per crown
      const h = c.holes[hi], L = Math.hypot(h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]), d0 = [(h.basket[0] - h.tee[0]) / L, (h.basket[1] - h.tee[1]) / L], out = [];
      for (let yaw = -.45; yaw <= .45; yaw += .03) for (const power of [.75, .9, 1]) for (const hyzer of [-.3, 0, .3]) for (const throwType of ['backhand', 'forehand']) {
        const cs = Math.cos(yaw), sn = Math.sin(yaw), dir = [d0[0] * cs - d0[1] * sn, d0[0] * sn + d0[1] * cs];
        const params = { throwType, discId: 'driver', power, hyzer, yawOffset: 0, launchOffset: .12, dir, pos: [h.tee[0] + dir[0] * .6, h.teeY + 1.2, h.tee[1] + dir[1] * .6], lefty: false };
        const sim = c.runSim(params), T = sim.traj; let ei = -1, xi = -1;
        for (let i = 0; i < T.length; i++) { const l = inLeaves(T[i]); if (l && ei < 0) ei = i; if (ei >= 0 && !l) { xi = i; break; } }
        if (ei <= 20 || xi < 0) continue; const E = T[ei], R = T[T.length - 1], d = Math.hypot(R[0] - E[0], R[2] - E[2]);
        if (d >= far) out.push({ throwType, yaw: q(yaw), power, hyzer, far: q(d), entryT: q(ei / 60), inFor: q((xi - ei) / 60), crown: W().treesNear(E[0], E[2]).filter(t => Math.hypot(E[0] - t.x, E[2] - t.z, E[1] - t.y - t.fy) < t.fr).map(t => t.x.toFixed(1)).join(), sim: { ...sim, params } });
      }
      out.sort((a, b) => b.far - a.far); const seen = new Set();
      return out.filter(x => !seen.has(x.crown) && seen.add(x.crown)).slice(0, max);
    },
    frame() {
      const G = c.G, p = G.players[G.cur], f = G.flight, cp = c.camera.position, r = { ph: G.phase, mode: c.cam.mode, cam: cp.toArray().map(q) };
      r.leafy = q(Math.min(9, ...W().treesNear(cp.x, cp.z).map(t => Math.hypot(t.x - cp.x, t.z - cp.z, cp.y - t.y - t.fy) - t.fr)));   // < 0: the lens inside a crown's leaf cards
      r.near = q(Math.min(9, ...W().treesNear(cp.x, cp.z).map(t => { const d = Math.hypot(t.x - cp.x, t.z - cp.z); return Math.min(cp.y > t.y - .5 && cp.y < t.y + t.h ? d - t.r : 9, Math.hypot(d, cp.y - t.y - t.fy) - t.fr * .8); })));
      if (f?.pos && p?.discMesh) { const d = p.discMesh.position, v = d.clone(); c.camera.updateMatrixWorld(); v.project(c.camera);
        r.dist = q(cp.distanceTo(d)); r.inFrame = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1; r.lv = inLeaves(f.pos); r.held = !!f.cam?.leaf; r.leafAt = f.cam?.leafAt ?? null; r.ev = f.events.slice(0, f.ei).map(e => e[1]); }
      return r;
    },
    cost() { const info = c.renderer.info; info.autoReset = false; info.reset(); c.renderFrame(); const r = [info.render.calls, info.render.triangles]; info.autoReset = true; return r; },
  };
})()`;
const AIR = /^(land|skip|roll|flop|splash|chains|drop|pole|band|rim|chainout)$/;
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
function sum(rows) {   // from the disc's first entry into a crown to its first touch
  const air = rows.filter(r => r.dist != null && !r.ev.some(e => AIR.test(e))), i0 = air.findIndex(r => r.lv), after = i0 < 0 ? [] : air.slice(i0).filter(r => r.mode === 'flight'), out = after.filter(r => !r.lv);
  const steps = rows.slice(1).map((r, i) => Math.hypot(r.cam[0] - rows[i].cam[0], r.cam[1] - rows[i].cam[1], r.cam[2] - rows[i].cam[2]));
  return { frames: after.length, over8: after.filter(r => r.dist > 8).length, over12: after.filter(r => r.dist > 12).length, maxDist: Math.max(0, ...after.map(r => r.dist)), dist: med(after.map(r => r.dist)),
    heldOut: out.filter(r => r.held).length, inFrame: out.filter(r => r.inFrame).length, out: out.length, under15: after.filter(r => r.dist < 1.5).length,
    leafy: rows.filter(r => r.mode === 'flight' && r.leafy < 0).length, close: rows.filter(r => r.mode === 'flight' && r.near < .6).length, dropped: after.some(r => r.leafAt != null),
    cuts: steps.map((d, i) => d > 3 ? `${i + 1}:${d.toFixed(1)}` : null).filter(Boolean).join(' '), cost: after.filter(r => r.cost).map(r => r.cost) };
}

const results = [];
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: +o.dpr, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('chains.coach', '["aim","throw","both"]'); } catch {}` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${clock})(${+o.seed})` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { const m = location.search.match(/probeCourse=(\\w+)/); if (m) localStorage.setItem('chains.course', m[1]); } catch {}` });   // a fresh page per course
  for (const course of o.courses.split(',')) {
    for (let k = 0; ; k++) {   // a boot on a GPU shared with other captures can stall: one more navigation before giving up
      await send('Page.navigate', { url: `http://localhost:${port}/?mute=1&probeCourse=${course}` }); await sleep(800);
      try { await until(`!!(window.__chains && __chains.course && __chains.hero) && __chains.course.def.id === '${course}'`, 90000); break; } catch (e) { if (k) throw e; console.log(`${course}: boot stalled, navigating again`); }
    }
    if (await js('__chains.G.settings.quality') !== 'low') { await js(`document.querySelector('#qualSeg [data-v="low"]').click()`); await until(`__chains.course.quality === 'low' && __chains.G.settings.quality === 'low'`); }
    await settle(js); await js(PAGE); await step(30);
    await js(`document.getElementById('btnSolo').click()`);
    for (let i = 0; i < 900 && await js(`__chains.G.phase !== 'intro'`); i++) await step();
    await js(`(() => { const c = __chains; while (c.G.phase === 'intro') { c.G.introT = 99; c.nextTurn(); } })()`); await step(30);
    const nh = await js('__chains.holes.length');
    for (const hole of o.holes.split(',').map(Number).filter(n => n <= nh)) {
      const hi = hole - 1, reset = `(() => { const c = __chains, G = c.G, h = c.holes[${hi}], W = c.world; G.flight = G.pending = G.tween = null; G.skipResult = null; G.holeIdx = ${hi}; c.course.setHole(${hi}); c.cam.hold = null;
        const L = Math.hypot(h.basket[0] - h.tee[0], h.basket[1] - h.tee[1]), d = [(h.basket[0] - h.tee[0]) / L, (h.basket[1] - h.tee[1]) / L], r = [-d[1], d[0]];
        G.players.forEach((p, i) => { p.done = false; p.strokes = 0; p.scores = []; p.lie = [h.tee[0], h.teeY, h.tee[1]]; p.lieDist = L;   // beside the pad, as startHole stands them
          const sx = h.tee[0] - d[0] * (1.2 + i * 1.3) - r[0] * 2.8, sz = h.tee[1] - d[1] * (1.2 + i * 1.3) - r[1] * 2.8; p.char.group.position.set(sx, W.height(sx, sz), sz); p.char.faceDir(d[0], d[1]); p.char.setPhase(null); p.char.snap?.(); });
        G.players[0].isBot = false; c.setupTurn(0); c.cam.snap = true; })()`;
      await js(reset); await step(20);
      const drives = await js(`__lp.search(${hi}, ${+o.far}, ${+o.max})`);
      for (const [k, dv] of drives.entries()) for (const who of o.who.split(',')) {
        const name = `${course}-${hole}-${k}-${who}`;
        await js(reset); await step(40);
        await js(`(() => { const c = __chains, G = c.G, p = G.players[0]; G.throwType = '${dv.throwType}'; G.phase = 'windup'; p.char.setThrow('${dv.throwType}'); p.char.setPhase(.42); })()`); await step(3);
        await js(`(() => { const c = __chains, p = c.G.players[0]; ${who === 'watched' ? 'p.runUp = true;' : ''} c.doThrow(0, { power: ${dv.power}, hyzer: 0, yawOffset: 0, launchOffset: 0 }, ${JSON.stringify(dv.sim)}); })()`);
        const rows = []; let restAt = -1;
        for (let i = 0; i < 420; i++) {
          await step(); const r = await js('__lp.frame()'); r.f = i; if (o.cost && r.mode === 'flight' && r.dist != null) r.cost = await js('__lp.cost()'); rows.push(r);
          if (o.shots && i % +o.every === 0) await shot(`${name}-${String(i).padStart(3, '0')}`);
          if (restAt < 0 && r.ph === 'result') restAt = i; if (restAt >= 0 && i - restAt >= 6) break;
        }
        const s = sum(rows), { cost, ...line } = s;
        console.log(name.padEnd(20), `${dv.throwType} yaw ${dv.yaw} p ${dv.power} hz ${dv.hyzer}: ${dv.far} m on, entry ${dv.entryT} s`, JSON.stringify(line));
        results.push({ name, drive: { ...dv, sim: undefined }, summary: s, rows });
      }
    }
  }
  const all = results.map(r => r.summary), n = k => all.reduce((a, x) => a + x[k], 0), costs = all.flatMap(x => x.cost), pc = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const agg = { throws: all.length, frames: n('frames'), over8: n('over8'), over12: n('over12'), maxDist: Math.max(0, ...all.map(x => x.maxDist)), heldOut: n('heldOut'), inFrame: +(n('inFrame') / (n('out') || 1)).toFixed(3), under15: n('under15'), leafy: n('leafy'), close: n('close'), dropped: all.filter(x => x.dropped).length,
    ...(costs.length ? { calls: [.5, .9, 1].map(p => pc(costs.map(x => x[0]), p)), tris: [.5, .9, 1].map(p => pc(costs.map(x => x[1]), p)) } : {}) };
  console.log('ALL', JSON.stringify(agg));
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  if (o.out) writeFileSync(o.out, JSON.stringify({ size: o.size, agg, results, errors }));
  process.exit(0);
} catch (e) { console.error('probe failed:', e?.stack || e, errors.slice(0, 5)); process.exit(1); }
