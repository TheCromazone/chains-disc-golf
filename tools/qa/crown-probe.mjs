// Crown probe: the course's trees as a player sees them, one still per tree, plus a walk across the 3D/impostor swap.
// Deterministic like the capture tools (tools/vclock.mjs owns the clock): the same build draws the same pixels.
//   node tools/qa/crown-probe.mjs --out dir [--port 8404] [--size 844x390] [--dpr 3] [--quality low|high] [--mobile]
//                                 [--course pine] [--kinds spruce,scots] [--near 2] [--far 1] [--iso 2] [--walk spruce] [--seed 4]
// The eye is 1.7 m over the player (so the near-tree cull keeps everything round it) and the HUD is hidden. For each kind:
// from the first tee, the `near` nearest trees 12-36 m out and the `far` nearest 48-90 m out (<kind>-near<i>, <kind>-far<i>);
// then `iso` trees seen alone: the player moved to a spot 22 m (or 1.35 heights) from a tree of that kind with nothing standing in the sightline
// (<kind>-iso<i>), each framed whole, trunk foot to tip. --walk <kind>: from the tee, the eye backs away from the nearest tree
// of that kind closer than the 3D range, along the ray from the tree through the player (so the tree stays ahead of the player
// and is never culled), in 0.5 m steps from 4 m inside the 3D range to 4 m past it, a quarter second (the LOD tick) per step (walk-NN.png).
// --swap <m>: the 3D range for this run (course.js treeNear, every tree: 40 m on Mobile, 62 on Desktop), to try another swap.
// --ring <kind>: the swap's tone step. The eye stands half a metre inside the 3D range of a tree of that kind, on up to 8 bearings
// round it with a clear sightline, and shoots it twice from the same spot, framed on its crown: in 3D (ring-NN-3d.png) and as its
// far card (the 3D range pulled a metre short of it, ring-NN-far.png). --pairs of them (8), over as many trees as it takes;
// probe.ring lists each with its bearing off the sun (0 = looking into it). tools/qa/swap-tone.py measures the pairs.
// --eval <js>: statements run in the page before the stills (`c` is __chains, `T` is THREE), to try a material or texture change live;
// what they leave in window.__evalOut is printed.
// Writes probe.json: eye, target, distance, draw calls and triangles per still, and the walk's steps.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CHROME } from '../chrome-path.mjs';
import { clock, settle } from '../vclock.mjs';
import { IMPOSTOR } from '../../src/impostors.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values: o } = parseArgs({ options: {
  out: { type: 'string', default: 'art/qa/crown-probe' }, port: { type: 'string', default: '8404' }, size: { type: 'string', default: '844x390' }, dpr: { type: 'string', default: '3' },
  quality: { type: 'string', default: 'low' }, mobile: { type: 'boolean', default: false }, course: { type: 'string', default: 'pine' }, seed: { type: 'string', default: '4' },
  kinds: { type: 'string', default: 'spruce,scots' }, near: { type: 'string', default: '2' }, far: { type: 'string', default: '1' }, iso: { type: 'string', default: '2' }, walk: { type: 'string' }, swap: { type: 'string' }, eval: { type: 'string' }, ring: { type: 'string' }, pairs: { type: 'string', default: '8' },
  chrome: { type: 'string', default: CHROME },
} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h] = o.size.split('x').map(Number), port = +o.port, cdp = port + 1000, out = resolve(ROOT, o.out);
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'chains-crowns-'));
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
async function js(expression) { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const until = (expr, ms = 120000) => poll(() => js(expr), expr, ms);
const step = (ms, frames = Math.round(ms * .06)) => js(`__motion.step(${ms}, ${frames})`);
const shot = async (name, fmt = 'jpeg') => { const { data } = await send('Page.captureScreenshot', { format: fmt, quality: 92 }); writeFileSync(join(out, `${name}.${fmt}`), Buffer.from(data, 'base64')); };
const count = () => js(`(() => { const c = __chains, info = c.renderer.info; info.autoReset = false; info.reset(); c.renderFrame(); const r = { calls: info.render.calls, tris: info.render.triangles }; info.autoReset = true; return r; })()`);
const CELL = Object.fromEntries(Object.entries(IMPOSTOR).map(([k, v]) => [v[3], k.replace(/\d+$/, '')]));

try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: +o.dpr, mobile: o.mobile });
  if (o.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('chains.coach', '["aim","throw","both"]'); localStorage.setItem('chains.course', ${JSON.stringify(o.course)}); } catch {}` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${clock})(${+o.seed})` });
  await send('Page.navigate', { url: `http://localhost:${port}/` });
  await until(`!!(window.__chains && __chains.course && __chains.hero)`);
  if (await js('__chains.G.settings.quality') !== o.quality) { await js(`document.querySelector('#qualSeg [data-v="${o.quality}"]').click()`); await until(`__chains.course.quality === '${o.quality}'`); }
  await settle(js); await step(4500);
  await js(`document.getElementById('btnSolo').click()`);
  for (let i = 0; !(await js(`__chains.G.phase === 'intro'`)); i++) { if (i > 1800) throw new Error('no intro'); await step(1000 / 60, 1); }
  await js(`(() => { const c = __chains; while (c.G.phase === 'intro') { c.G.introT = 10; c.nextTurn(); } })()`); await step(3500);
  // the HUD off (the canvas and what holds it stay), the lens ours: the frame loop's copy() and lookAt() land on our eye and target
  const trees = await js(`(() => { const c = __chains, cv = c.renderer.domElement;
    for (const el of document.body.querySelectorAll('*')) if (el !== cv && !el.contains(cv)) el.style.visibility = 'hidden';
    const T = c.THREE, P = window.__probeEye = new T.Vector3(), L = window.__probeLook = new T.Vector3(); window.__probeFov = 50;
    c.camera.position.copy = function () { return T.Vector3.prototype.copy.call(this, P); }; c.camera.lookAt = function () { return T.Object3D.prototype.lookAt.call(this, L); };
    Object.defineProperty(c.camera, 'fov', { get: () => window.__probeFov, set() {}, configurable: true });
    const out = []; c.scene.traverse(m => { const a = m.isInstancedMesh && m.geometry.attributes.impCell; if (!a) return;
      for (let i = 0; i < m.count; i++) { const e = new T.Matrix4(); m.getMatrixAt(i, e); const k = e.elements; out.push([a.getX(i), +k[12].toFixed(2), +k[13].toFixed(2), +k[14].toFixed(2), +k[5].toFixed(2)]); } });
    let imp = null; c.scene.traverse(m => { if (!imp && m.isInstancedMesh && m.geometry.attributes.impCell) imp = m; });
    window.__treeNear = c.renderer.properties.get(imp.material).uniforms.treeNear;   // the uniform course.js shares with every tree material and its LOD tick
    ${o.swap ? `__treeNear.value = ${+o.swap};` : ''}
    ${o.eval || ''}
    const p = c.G.players[0].lie; return { lie: p, trees: out, evalOut: window.__evalOut }; })()`);
  if (trees.evalOut !== undefined) console.log('eval:', JSON.stringify(trees.evalOut));
  const [px, py, pz] = trees.lie, eye = [px, py + 1.7, pz], probe = { course: o.course, quality: o.quality, size: o.size, eye, views: [], errors };
  const H0 = { spruce: 20, scots: 21, birch: 18, broad: 15, bush: 3 };   // each kind's nominal height: framing never follows a rebuilt card's extent, so two builds shoot the same views
  const list = trees.trees.map(([cell, x, y, z, hh]) => { const v = Object.keys(IMPOSTOR).find(k => IMPOSTOR[k][3] === cell), kind = CELL[cell];
    return { kind, x, y, z, h: hh / IMPOSTOR[v][1] * H0[kind], d: Math.hypot(x - px, z - pz) }; }).sort((a, b) => a.d - b.d);
  const aim = async (e, t, fov) => { await js(`(() => { __probeEye.set(${e.join(',')}); __probeLook.set(${t.join(',')}); window.__probeFov = ${fov}; __chains.camera.updateProjectionMatrix(); })()`); };
  const frame = t => { const fov = Math.min(75, Math.max(28, 2 * Math.atan(t.h * .62 / Math.max(1, t.d)) * 180 / Math.PI)); return { look: [t.x, t.y + t.h * .5, t.z], fov: +fov.toFixed(1) }; };
  const still = async (name, e, t) => { const f = frame(t); await aim(e, f.look, f.fov); await step(1000);   // a second still: the tree LOD refreshes and the phone's temporal resolve settles
    const stats = await count(); await shot(name); probe.views.push({ name, kind: t.kind, d: +t.d.toFixed(1), eye: e.map(v => +v.toFixed(2)), tree: [t.x, t.y, t.z, t.h], look: f.look, fov: f.fov, ...stats }); console.log(name, `${t.d.toFixed(1)} m`, stats); };
  for (const kind of o.kinds.split(',')) for (const [band, lo, hi, n] of [['near', 12, 36, +o.near], ['far', 48, 90, +o.far]])
    for (const [i, t] of list.filter(t => t.kind === kind && t.d >= lo && t.d <= hi).slice(0, n).entries()) await still(`${kind}-${band}${i}`, eye, t);
  // a tree alone: the nearest of the kind with a spot 22 m (1.35 heights) off it (in bounds, dry, no tree within 5 m) whose sightline to the
  // crown passes no other stem or crown (a tree as a column 0.25 x its height wide)
  const clear = (ex, ez, t) => list.every(u => { if (u === t || u.kind === 'bush') return true; if (Math.hypot(u.x - ex, u.z - ez) < 5) return false;
    const dx = t.x - ex, dz = t.z - ez, L2 = dx * dx + dz * dz, k = ((u.x - ex) * dx + (u.z - ez) * dz) / L2; if (k <= .02 || k >= .9) return true;
    return Math.hypot(ex + dx * k - u.x, ez + dz * k - u.z) > u.h * .25 + .8; });
  for (const kind of o.kinds.split(',')) { let found = 0;
    for (const t of list.filter(t => t.kind === kind)) { if (found >= +o.iso) break;
      const D = Math.max(22, t.h * 1.35);
      for (let a = 0; a < 16; a++) { const ex = t.x + Math.cos(a * Math.PI / 8) * D, ez = t.z + Math.sin(a * Math.PI / 8) * D;
        if (!await js(`__chains.world.inBounds(${ex}, ${ez}) && !__chains.world.inWater(${ex}, ${ez})`) || !clear(ex, ez, t)) continue;
        const ey = await js(`__chains.world.height(${ex}, ${ez})`);
        await js(`(() => { const c = __chains, p = c.G.players[0]; p.lie = [${ex}, ${ey}, ${ez}]; c.setupTurn(0); })()`); await step(500);
        await still(`${kind}-iso${found++}`, [ex, ey + 1.7, ez], { ...t, d: D }); break; } } }
  await js(`(() => { const c = __chains, p = c.G.players[0]; p.lie = ${JSON.stringify(trees.lie)}; c.setupTurn(0); })()`); await step(500);
  if (o.walk) {   // the 3D/impostor swap: back away from a tree across the 3D range
    const near = await js(`__treeNear.value`), t = list.find(t => t.kind === o.walk && t.d > 8 && t.d < near - 6);
    if (t) { const ux = (px - t.x) / t.d, uz = (pz - t.z) / t.d, steps = []; const f = frame({ ...t, d: near });
      for (let k = 0, d = near - 4; d <= near + 4 + 1e-6; k++, d += .5) {
        const e = [t.x + ux * d, py + 1.7, t.z + uz * d]; await aim(e, f.look, f.fov); await step(250, 15); await shot(`walk-${String(k).padStart(2, '0')}`, 'png'); steps.push(+d.toFixed(2));   // a quarter second a step: the LOD tick re-reads the eye every step
      }
      probe.walk = { kind: o.walk, tree: [t.x, t.y, t.z, t.h], from: +t.d.toFixed(1), near, steps }; console.log('walk', o.walk, steps.length, 'steps, swap at', near, 'm');
    } else console.log('walk: no', o.walk, 'inside', near, 'm of the tee');
  }
  if (o.ring) {
    const near = await js(`__treeNear.value`), D = near - .5, want = +o.pairs, per = Math.max(2, Math.ceil(want / 4)); probe.ring = [];
    const sun = await js(`(() => { let d = null; __chains.scene.traverse(l => { if (l.isDirectionalLight && !d) d = [l.position.x - l.target.position.x, l.position.z - l.target.position.z]; }); return d; })()`);
    for (const [ti, t] of list.filter(t => t.kind === o.ring).entries()) { if (probe.ring.length >= want) break; let got = 0;
      for (let j = 0; j < 8 && got < per && probe.ring.length < want; j++) { const a = (j * 3 + ti * 5) % 8, ex = t.x + Math.cos(a * Math.PI / 4) * D, ez = t.z + Math.sin(a * Math.PI / 4) * D;
        if (!await js(`__chains.world.inBounds(${ex}, ${ez}) && !__chains.world.inWater(${ex}, ${ez})`) || !clear(ex, ez, t)) continue;
        const ey = await js(`__chains.world.height(${ex}, ${ez})`), k = String(probe.ring.length).padStart(2, '0'), fov = +(2 * Math.atan(t.h * .6 / D) * 180 / Math.PI).toFixed(1);
        await js(`(() => { const c = __chains, p = c.G.players[0]; p.lie = [${ex}, ${ey}, ${ez}]; c.setupTurn(0); })()`); await step(500);
        await aim([ex, ey + 1.7, ez], [t.x, t.y + t.h * .55, t.z], fov); await step(500); await shot(`ring-${k}-3d`, 'png');
        await js(`__treeNear.value = ${D - 1}`); await step(500); await shot(`ring-${k}-far`, 'png'); await js(`__treeNear.value = ${near}`);
        const off = sun ? Math.acos(Math.max(-1, Math.min(1, ((t.x - ex) * sun[0] + (t.z - ez) * sun[1]) / (D * Math.hypot(...sun))))) * 180 / Math.PI : null;   // 0: the tree stands against the sun
        probe.ring.push({ pair: k, kind: t.kind, tree: [t.x, t.y, t.z, +t.h.toFixed(1)], eye: [+ex.toFixed(1), +(ey + 1.7).toFixed(1), +ez.toFixed(1)], d: D, sun: off == null ? null : Math.round(off) }); got++; } }
    await js(`(() => { const c = __chains, p = c.G.players[0]; p.lie = ${JSON.stringify(trees.lie)}; c.setupTurn(0); })()`);
    console.log('ring', o.ring, probe.ring.length, 'pairs at', D, 'm:', probe.ring.map(r => r.sun).join(' '));
  }
  writeFileSync(join(out, 'probe.json'), JSON.stringify(probe, null, 2)); if (errors.length) console.log(errors.length, 'page error(s), see probe.json');
  process.exit(0);
} catch (e) { console.error('crown probe failed:', e?.message || e, errors.join('\n')); process.exit(1); }
