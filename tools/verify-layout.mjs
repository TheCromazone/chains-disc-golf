// Headless capture of the gauntlet moments (menu, flyover, tee, putt, scorecard) with zero dependencies: Node's
// built-in WebSocket speaks the Chrome DevTools Protocol to a private headless Chrome. Parallel-safe: each run owns
// its static-server port, its debugging port (port + 1000) and a throwaway profile, so worktrees never share a tab.
//   node tools/capture.mjs --out art/qa/r4 [--port 8101] [--size 1280x720] [--dpr 1] [--quality high|low]
//                          [--moments menu,flyover,tee,putt,scorecard] [--mobile]
// Writes <moment>.jpeg per requested moment and stats.json: draw calls and triangles for one full frame (shadow map
// and post passes included), mean rAF interval, GPU string, and every console error / exception (shader failures).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: o } = parseArgs({ options: {
  out: { type: 'string', default: 'art/qa/capture' }, port: { type: 'string', default: '8101' },
  size: { type: 'string', default: '1280x720' }, dpr: { type: 'string', default: '1' }, quality: { type: 'string' },
  moments: { type: 'string', default: 'menu,flyover,tee,putt,scorecard' }, mobile: { type: 'boolean', default: false },
  presentation: { type: 'boolean', default: false },
  chrome: { type: 'string', default: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [w, h] = o.size.split('x').map(Number), port = +o.port, cdp = port + 1000, out = resolve(ROOT, o.out);
const ORDER = ['menu', 'flyover', 'tee', 'putt', 'scorecard'], want = new Set(o.moments.split(','));
const upto = Math.max(...[...want].map(m => ORDER.indexOf(m)));
if (upto < 0) throw new Error('moments must be from ' + ORDER.join(','));
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'chains-capture-'));
const chrome = spawn(o.chrome, ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
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

const source = readFileSync(join(ROOT, 'docs/qa/overlap-audit.js'), 'utf8');
const auditSource = source.slice(0, source.lastIndexOf('JSON.stringify(')) + 'return { vw: innerWidth, vh: innerHeight, res };';
const layouts = [];
try {
  await send('Runtime.enable'); await send('Page.enable');
  for (const [width, height] of (o.presentation ? [[430,932],[1280,720]] : [[360,740],[430,932],[812,375],[568,320],[768,1024],[1366,768]])) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 1000 });
    await send('Emulation.setTouchEmulationEnabled', { enabled: width < 1000, maxTouchPoints: 5 });
    await send('Page.navigate', { url: `http://localhost:${port}/` });
    await until('!!window.__chains', 60000);
    if (o.presentation) {
      await js(`(async()=>{const c=__chains;await c.startGame({mode:'solo',holeCount:3,players:[{name:'You'}]});c.nextTurn();c.resolveThrow(0,{holed:true,dist:0,thrown:85});})()`);
      await sleep(450);
      const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:90});writeFileSync(join(out,`celebration-${width}.jpg`),Buffer.from(shot.data,'base64'));
      const frame=await js(`({width:innerWidth,height:innerHeight,fov:__chains.camera.fov,phase:__chains.G.phase,toastTop:document.getElementById('toast').getBoundingClientRect().top})`);
      layouts.push(frame);console.log('presentation',JSON.stringify(frame));continue;
    }
    const result = await js(`(async()=>{${auditSource}})()`);
    for (const r of result.res) {
      // The transparent throw pad intentionally sits beneath the gauge and equipment.
      r.actionableOverlaps = r.overlaps.filter(s => !s.includes('#pad x ') && !s.includes(' x #pad') && !s.includes('#power x #powerLabel'));
    }
    layouts.push(result);
    console.log(`${width}x${height}: ${result.res.length} UI states, ${result.res.reduce((n,r)=>n+r.actionableOverlaps.length+r.offscreen.length+r.clippedLabels.length,0)} findings`);
  }
  const findings = layouts.flatMap(v => (v.res || []).filter(r=>r.actionableOverlaps.length||r.offscreen.length||r.clippedLabels.length).map(r=>({size:`${v.vw}x${v.vh}`, ...r})));
  writeFileSync(join(out,o.presentation?'presentation-results.json':'layout-results.json'),JSON.stringify({layouts,findings,errors,passed:findings.length===0&&errors.length===0},null,2));
  process.exit(findings.length || errors.length ? 1 : 0);
} catch(e) { writeFileSync(join(out,o.presentation?'presentation-results.json':'layout-results.json'),JSON.stringify({layouts,errors,failure:String(e.stack||e)},null,2));console.error(e);process.exit(1); }
