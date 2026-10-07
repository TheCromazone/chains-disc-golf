// Minimal Chrome DevTools Protocol harness for QA scripts (tools/qa): launch headless Chrome, open pages, eval, screenshot, emulate devices.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME } from '../chrome-path.mjs';

export const pause = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ port = 9333, headless = true, gpu = true } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'chains-cdp-'));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-fake-ui-for-media-stream', 'about:blank'];   // muted: the game's sound still runs, the Mac's speakers stay quiet
  if (headless) args.unshift('--headless=new');
  if (gpu) args.unshift('--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal');
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  process.once('exit', () => proc.kill());   // a script that throws still takes its Chrome with it (crashed runs had left ~20 behind)
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {} await pause(150); }
  const browser = { port, proc, close: () => proc.kill() };
  browser.newPage = () => newPage(browser);
  return browser;
}

async function newPage(browser) {
  const t = await (await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let seq = 0; const pend = new Map(); const logs = []; const errors = []; const listeners = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(Error(m.error.message)) : p.res(m.result); }
    if (m.method && listeners.has(m.method)) for (const fn of listeners.get(m.method)) fn(m.params);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled') { const s = m.params.args.map(a => a.value ?? a.description ?? '').join(' '); logs.push(`[${m.params.type}] ${s}`); if (m.params.type === 'error') errors.push(s); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  const page = {
    id: t.id, send, logs, errors,
    on(method, fn) { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); },
    async eval(expr, timeout = 60000) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async goto(url) { await send('Page.navigate', { url }); await pause(500); },
    async waitFor(expr, ms = 60000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await page.eval(expr)) return true; } catch {} await pause(250); } throw Error('timeout waiting for ' + expr); },
    async shot(path, opts = {}) { const r = await send('Page.captureScreenshot', { format: path.endsWith('.png') ? 'png' : 'jpeg', quality: 80, ...opts }); writeFileSync(path, Buffer.from(r.data, 'base64')); return path; },
    async device({ width, height, dpr = 1, mobile = false, touch = false, ua } = {}) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile, screenOrientation: width > height ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
      await send('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      if (ua) await send('Emulation.setUserAgentOverride', { userAgent: ua });
    },
    async addInit(source) { await send('Page.addScriptToEvaluateOnNewDocument', { source }); },
    async tap(x, y) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await pause(60); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); },
    async click(x, y) { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); },
    async clickSel(sel) { const r = await page.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const b=e.getBoundingClientRect(); return [b.x+b.width/2,b.y+b.height/2];})()`); if (!r) throw Error('no element ' + sel); await page.click(r[0], r[1]); return r; },
    async tapSel(sel) { const r = await page.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const b=e.getBoundingClientRect(); return [b.x+b.width/2,b.y+b.height/2];})()`); if (!r) throw Error('no element ' + sel); await page.tap(r[0], r[1]); return r; },
    async swipe(x0, y0, x1, y1, steps = 12, ms = 250, touch = true) {
      if (touch) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
        for (let i = 1; i <= steps; i++) { await pause(ms / steps); await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] }); }
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
        for (let i = 1; i <= steps; i++) { await pause(ms / steps); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, button: 'left', buttons: 1 }); }
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
      }
    },
    close: () => fetch(`http://127.0.0.1:${browser.port}/json/close/${t.id}`),
  };
  return page;
}
