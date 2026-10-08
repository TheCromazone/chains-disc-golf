// Headless capture of the gauntlet moments (menu, flyover, tee, putt, scorecard) with zero dependencies: Node's
// built-in WebSocket speaks the Chrome DevTools Protocol to a private headless Chrome. Parallel-safe: each run owns
// its static-server port, its debugging port (port + 1000) and a throwaway profile, so worktrees never share a tab.
//   node tools/capture.mjs --out art/qa/r4 [--port 8101] [--size 1280x720] [--dpr 1] [--quality high|low]
//                          [--moments menu,flyover,tee,putt,scorecard] [--mobile] [--course pine|meadow|lake|bluff]
// Writes <moment>.jpeg per requested moment and stats.json: draw calls and triangles for one full frame (shadow map
// and post passes included), mean rAF interval, GPU string, and every console error / exception (shader failures).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { CHROME } from './chrome-path.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: o } = parseArgs({ options: {
  out: { type: 'string', default: 'art/qa/capture' }, port: { type: 'string', default: '8101' },
  size: { type: 'string', default: '1280x720' }, dpr: { type: 'string', default: '1' }, quality: { type: 'string' },
  moments: { type: 'string', default: 'menu,flyover,tee,putt,scorecard' }, mobile: { type: 'boolean', default: false },
  url: { type: 'string' }, course: { type: 'string' },
  chrome: { type: 'string', default: CHROME },
} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h] = o.size.split('x').map(Number), port = +o.port, cdp = port + 1000, out = resolve(ROOT, o.out);
const ORDER = ['menu', 'flyover', 'tee', 'putt', 'scorecard'], want = new Set(o.moments.split(','));
const upto = Math.max(...[...want].map(m => ORDER.indexOf(m)));
if (upto < 0) throw new Error('moments must be from ' + ORDER.join(','));
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'chains-capture-'));
const chrome = spawn(o.chrome, ['--headless=new', '--mute-audio', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist',
  '--disable-gpu-vsync', '--disable-frame-rate-limit',   // uncapped rAF, so frameMs compares builds instead of reading the display's refresh
  `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { chrome.kill(); server.kill(); try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir, harmless */ } });

async function poll(fn, what, ms = 30000) { for (const t = Date.now(); Date.now() - t < ms; await sleep(100)) { const v = await fn().catch(() => null); if (v) return v; } throw new Error('timed out: ' + what); }
await poll(async () => (await fetch(`http://localhost:${port}/`)).ok, `static server on ${port}`);
const wsUrl = await poll(async () => (await (await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl, 'chrome at ' + o.chrome);

const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pending = new Map(), errors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); return m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 4000));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const until = (expr, ms = 60000) => poll(() => js(expr), expr, ms);

const stats = { size: o.size, dpr: +o.dpr, mobile: o.mobile, moments: {} };
// One full frame (shadow map, scene, bloom, grade) counted with info.autoReset off, then the mean rAF interval over 60 frames.
const measure = () => js(`(async () => { const c = __chains, info = c.renderer.info; info.autoReset = false; info.reset(); c.renderFrame();
  const calls = info.render.calls, tris = info.render.triangles; info.autoReset = true; const t0 = performance.now(); let n = 0;
  await new Promise(res => { const f = () => (++n < 60 ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); });
  return { calls, tris, frameMs: +((performance.now() - t0) / 60).toFixed(2), textures: info.memory.textures, geometries: info.memory.geometries }; })()`);
async function shoot(name) {
  if (!want.has(name)) return;
  stats.moments[name] = await measure();
  const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  writeFileSync(join(out, name + '.jpeg'), Buffer.from(data, 'base64'));
  console.log(`${name}: ${join(out, name + '.jpeg')}  calls ${stats.moments[name].calls}  tris ${stats.moments[name].tris}  ${stats.moments[name].frameMs} ms`);
}

try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: +o.dpr, mobile: o.mobile });
  if (o.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (o.course) await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('chains.course', ${JSON.stringify(o.course)}); } catch {}` });   // pine | meadow | lake | bluff
  await send('Page.navigate', { url: o.url || `http://localhost:${port}/` });
  await until(`!!(window.__chains && __chains.course && __chains.hero)`, 120000);
  const q = { full: 'high', lite: 'low' }[o.quality] || o.quality;
  if (q && await js('__chains.G.settings.quality') !== q) {
    await js(`document.querySelector('#qualSeg [data-v="${q}"]').click()`);
    await until(`__chains.course.quality === '${q}' && __chains.G.settings.quality === '${q}'`);
  }
  stats.quality = await js('__chains.G.settings.quality');
  stats.gpu = await js(`(() => { const g = __chains.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`);
  await sleep(4500); await shoot('menu');   // textures land and the clubhouse camera settles
  if (upto >= 1) {
    await js(`document.getElementById('btnSolo').click()`);
    await until(`__chains.G.phase === 'intro' && __chains.G.introT >= ${want.has('flyover') ? 1.7 : 0}`);
    if (want.has('flyover')) { await js('__chains.G.maxDt = 1e-9'); await sleep(300); await shoot('flyover'); }   // dt ~ 0 freezes the drone at 1.7 s
    await js('delete __chains.G.maxDt');
  }
  if (upto >= 2) { await js(`(() => { const c = __chains; while (c.G.phase === 'intro') { c.G.introT = 10; c.nextTurn(); } })()`); await sleep(3500); await shoot('tee'); }
  if (upto >= 3) {   // the human's third throw, 6.5 m short of the pin on the tee side
    await js(`(() => { const c = __chains, G = c.G, p = G.players[0], h = c.holes[G.holeIdx], b = h.basket, dx = h.tee[0] - b[0], dz = h.tee[1] - b[1], L = Math.hypot(dx, dz);
      const x = b[0] + dx / L * 6.5, z = b[1] + dz / L * 6.5; p.lie = [x, c.world.height(x, z), z]; p.strokes = 2; c.setupTurn(0); })()`);
    await sleep(3500); await shoot('putt');
  }
  if (upto >= 4) {
    await js(`(() => { const c = __chains, G = c.G; G.players.forEach((p, i) => { p.done = true; p.scores[G.holeIdx] = [3, 2, 4][i % 3]; p.strokes = p.scores[G.holeIdx]; }); c.nextTurn(); })()`);
    await sleep(2000); await shoot('scorecard');
  }
  stats.errors = errors;
  writeFileSync(join(out, 'stats.json'), JSON.stringify(stats, null, 2));
  if (errors.length) console.log(`${errors.length} console error(s), see stats.json`);
  process.exit(0);
} catch (e) {
  stats.errors = errors; stats.failure = String(e?.stack || e);
  writeFileSync(join(out, 'stats.json'), JSON.stringify(stats, null, 2));
  console.error('capture failed:', e?.message || e, errors.length ? `\n${errors.join('\n')}` : '');
  process.exit(1);
}
