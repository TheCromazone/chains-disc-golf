// Ground guides and sky probe: stills of the lies where the aim arrow, the landing ring and the sky are judged on a phone
// (tee, a 36 m approach, a 3 m and a 9.4 m putt on hole 1, 9.4 m putts and a 40 m approach on holes 2 and 3), each with a
// sky mask from the dome's own panorama alpha (magenta clear sky, cyan cloud), the screen spots of the arrow's tip and the
// landing ring, and one full frame's draw calls and triangles. Deterministic like tools/capture.mjs (tools/vclock.mjs).
//   node tools/qa/guides-probe.mjs --out dir [--port 8423] [--size 390x844] [--dpr 3] [--quality low] [--mobile]
//                                  [--courses pine,meadow,lake,bluff] [--shots tee,app36,putt3,putt9,putt9h2,putt9h3,app40h2] [--no-mask]
// Writes <out>/<course>-<shot>.jpeg, <course>-<shot>-mask.png and <out>/stats.json.
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
  out: { type: 'string', default: 'art/qa/guides-probe' }, port: { type: 'string', default: '8423' }, size: { type: 'string', default: '390x844' },
  dpr: { type: 'string', default: '3' }, quality: { type: 'string', default: 'low' }, mobile: { type: 'boolean', default: false }, seed: { type: 'string', default: '4' },
  courses: { type: 'string', default: 'pine,meadow,lake,bluff' }, shots: { type: 'string', default: 'tee,app36,putt3,putt9,putt9h2,putt9h3,app40h2' }, mask: { type: 'boolean', default: true }, 'no-mask': { type: 'boolean', default: false },
  chrome: { type: 'string', default: CHROME },
} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h] = o.size.split('x').map(Number), port = +o.port, cdp = port + 1000, out = resolve(ROOT, o.out), shots = o.shots.split(',');
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'chains-guides-'));
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
const step = (ms, frames = Math.round(ms * .06)) => js(`__motion.step(${ms}, ${frames})`);
const save = async (path, png) => { const { data } = await send('Page.captureScreenshot', png ? { format: 'png' } : { format: 'jpeg', quality: 92 }); writeFileSync(path, Buffer.from(data, 'base64')); };

// shot -> [hole index, metres from the basket toward the tee, metres to the side]
const LIES = { app36: [0, 36, 0], putt3: [0, 3, 0], putt9: [0, 9.4, 0], putt9h2: [1, 9.4, 0], putt9h3: [2, 9.4, 0], app40h2: [1, 40, 0] };
const stats = { size: o.size, dpr: +o.dpr, quality: o.quality, shots: {} };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: +o.dpr, mobile: o.mobile });
if (o.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('chains.coach', '["aim","throw","both"]'); } catch {}` });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${clock})(${+o.seed})` });
try {
  for (const course of o.courses.split(',')) {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('chains.course', ${JSON.stringify(course)}); } catch {}` });
    await send('Page.navigate', { url: `http://localhost:${port}/` });
    await until(`!!(window.__chains && __chains.course && __chains.hero && __chains.course.def.id === ${JSON.stringify(course)})`, 120000);
    if (await js('__chains.G.settings.quality') !== o.quality) { await js(`document.querySelector('#qualSeg [data-v="${o.quality}"]').click()`); await until(`__chains.course.quality === '${o.quality}'`); }
    await settle(js); await step(4500);
    await js(`document.getElementById('btnSolo').click()`);
    for (let i = 0; !(await js(`__chains.G.phase === 'intro'`)); i++) { if (i > 1800) throw new Error('no intro'); await step(1000 / 60, 1); }
    await js(`(() => { const c = __chains; while (c.G.phase === 'intro') { c.G.introT = 10; c.nextTurn(); } })()`); await step(3500);
    for (const shot of shots) {
      if (shot !== 'tee') {
        const [hole, back, side] = LIES[shot];
        await js(`(() => { const c = __chains, G = c.G, p = G.players[0]; G.holeIdx = ${hole}; c.course.setHole(${hole}); const hl = c.holes[${hole}], b = hl.basket, dx = hl.tee[0] - b[0], dz = hl.tee[1] - b[1], L = Math.hypot(dx, dz);
          const x = b[0] + dx / L * ${back} - dz / L * ${side}, z = b[1] + dz / L * ${back} + dx / L * ${side}; p.lie = [x, c.world.height(x, z), z]; p.lieDist = Math.hypot(x - b[0], z - b[1]); p.strokes = 2; G.players.forEach((q, i) => { if (i) { q.strokes = 1; q.lie = [hl.tee[0] - dx / L * 3, hl.teeY, hl.tee[1] - dz / L * 3]; } }); c.setupTurn(0); })()`);
        await step(3500);
      }
      const m = await js(`(() => { const c = __chains, info = c.renderer.info; info.autoReset = false; info.reset(); c.renderFrame(); const calls = info.render.calls, tris = info.render.triangles; info.autoReset = true;
        const G = c.G, p = G.players[G.cur], d = [Math.cos(G.aim.yaw), Math.sin(G.aim.yaw)], T = c.THREE, proj = (x, y, z) => { const v = new T.Vector3(x, y, z).project(c.camera); return [+((v.x * .5 + .5) * innerWidth).toFixed(1), +((.5 - v.y * .5) * innerHeight).toFixed(1), v.z < 1]; };
        const ax = p.lie[0] + d[0] * 1.7, az = p.lie[2] + d[1] * 1.7, r = G.shotPreview?.rest;
        return { calls, tris, phase: G.phase, throwType: G.throwType, lieDist: +p.lieDist.toFixed(1), arrow: proj(ax, c.world.height(ax, az), az), lie: proj(p.lie[0], p.lie[1], p.lie[2]), ring: r && G.shotPreview.guided ? proj(r[0], r[1], r[2]) : null, fov: +c.camera.fov.toFixed(1), camY: +c.camera.position.y.toFixed(2), pitch: +(Math.asin(c.camera.getWorldDirection(new T.Vector3()).y) * 57.3).toFixed(1) }; })()`);
      stats.shots[`${course}-${shot}`] = m;
      await save(join(out, `${course}-${shot}.jpeg`));
      if (o.mask && !o['no-mask']) {   // the dome swapped for its own panorama alpha, untone-mapped: magenta clear sky, cyan cloud; everything else draws as it does
        await js(`(() => { const s = __chains.course.sky, m = s.material; s.userData.keep = m; s.material = m.clone(); s.material.uniforms = m.uniforms;
          s.material.fragmentShader = m.fragmentShader.replace(/gl_FragColor=vec4\\(col,1\\.\\);/, 'gl_FragColor=vec4(1.-step(.5,cov),step(.5,cov),1.,1.);').replace(/#include <(tonemapping|colorspace)_fragment>/g, ''); s.material.needsUpdate = true; })()`);
        await step(400, 24); await save(join(out, `${course}-${shot}-mask.png`), true);
        await js(`(() => { const s = __chains.course.sky; s.material.dispose(); s.material = s.userData.keep; })()`); await step(400, 24);
      }
      console.log(`${course} ${shot}: calls ${m.calls} tris ${m.tris} ${m.throwType} ${m.lieDist} m, arrow ${m.arrow}, ring ${m.ring}`);
    }
  }
  stats.errors = errors; writeFileSync(join(out, 'stats.json'), JSON.stringify(stats, null, 2));
  if (errors.length) console.log(`${errors.length} page error(s), see stats.json`);
  process.exit(0);
} catch (e) { stats.errors = errors; stats.failure = String(e?.stack || e); writeFileSync(join(out, 'stats.json'), JSON.stringify(stats, null, 2)); console.error('probe failed:', e?.message || e); process.exit(1); }
