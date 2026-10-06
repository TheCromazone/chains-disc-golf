// Cross-device smoke (node tools/qa/devices.mjs [url] [outdir] [device,...]): menu -> solo round -> aim -> swipe throw -> flight -> result, screenshots + errors per device.
import { launch, pause } from './cdp.mjs';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:8093/';
const out = process.argv[3] || './qa'; mkdirSync(out, { recursive: true });
const only = process.argv[4];
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const devices = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1 },
  { name: 'iphone-portrait', width: 390, height: 844, dpr: 3, mobile: true, touch: true, ua: IPHONE_UA },
  { name: 'iphone-landscape', width: 844, height: 390, dpr: 3, mobile: true, touch: true, ua: IPHONE_UA },
  { name: 'android-portrait', width: 412, height: 915, dpr: 2.6, mobile: true, touch: true, ua: ANDROID_UA },
  { name: 'ipad', width: 820, height: 1180, dpr: 2, mobile: true, touch: true, ua: IPHONE_UA.replace('iPhone', 'iPad') },
  { name: 'small-phone', width: 360, height: 640, dpr: 2, mobile: true, touch: true, ua: ANDROID_UA },
].filter(d => !only || only.split(',').includes(d.name));
const b = await launch();
const report = {};
for (const d of devices) {
  const p = await b.newPage(); const r = report[d.name] = { steps: [] };
  const step = s => { r.steps.push(s); console.log(d.name, s); };
  try {
    await p.device(d);
    await p.goto(base);
    await p.waitFor('!!window.__chains', 90000); await pause(1200);
    await p.shot(`${out}/${d.name}-1-menu.jpg`);
    // overflow check on menu
    r.menuOverflow = await p.eval(`(()=>{const o=[];for(const e of document.querySelectorAll('#menu *')){const b=e.getBoundingClientRect();if(b.width&&getComputedStyle(e).visibility!=='hidden'&&(b.right>innerWidth+1||b.bottom>innerHeight+1||b.left<-1))o.push(e.id||e.className||e.tagName)}return o.slice(0,8)})()`);
    await p.eval(`document.querySelector('#holeSeg [data-v="3"], [data-v="3"]')?.click()`);
    const sel = '#btnSolo';
    if (d.touch) await p.tapSel(sel); else await p.clickSel(sel);
    step('start');
    await p.waitFor(`__chains.G.phase==='aim' && !!__chains.G.players[__chains.G.cur] && !__chains.G.players[__chains.G.cur].isBot`, 90000);
    await pause(800);
    await p.shot(`${out}/${d.name}-2-aim.jpg`);
    r.hudOverflow = await p.eval(`(()=>{const o=[];for(const e of document.querySelectorAll('#hud *')){const b=e.getBoundingClientRect();const cs=getComputedStyle(e);if(b.width&&cs.visibility!=='hidden'&&cs.display!=='none'&&(b.right>innerWidth+1||b.bottom>innerHeight+1||b.left<-1||b.top<-1))o.push(e.id||e.className?.baseVal||e.className||e.tagName)}return o.slice(0,8)})()`);
    // swipe right in the pad
    const pad = await p.eval(`(()=>{const b=document.getElementById('pad').getBoundingClientRect();return [b.x,b.y,b.width,b.height]})()`);
    r.pad = pad;
    const cx = pad[0] + pad[2] * 0.3, cy = pad[1] + pad[3] * 0.5;
    await p.swipe(cx, cy, cx + Math.min(260, pad[2] * 0.65), cy, 14, 300, !!d.touch);
    step('swiped');
    await p.waitFor(`['flight','result'].includes(__chains.G.phase) || __chains.G.flight`, 8000).catch(() => step('NO FLIGHT after swipe; phase=' ));
    await pause(1500);
    await p.shot(`${out}/${d.name}-3-flight.jpg`);
    await p.waitFor(`__chains.G.phase==='aim' || __chains.G.phase==='holeEnd'`, 60000).catch(() => {});
    await pause(1200);
    await p.shot(`${out}/${d.name}-4-next.jpg`);
    r.phase = await p.eval('__chains.G.phase');
    r.throws = await p.eval('JSON.stringify(__chains.G.players.map(p=>({n:p.name,s:p.strokes??p.throws,score:p.scores})))');
    r.perf = await p.eval('__chains.performance()');
  } catch (e) { r.error = String(e.message || e); step('ERROR ' + r.error); try { await p.shot(`${out}/${d.name}-error.jpg`); } catch {} }
  r.errors = p.errors.slice(0, 10); r.logs = p.logs.filter(l => /warn|error/i.test(l)).slice(0, 10);
  await p.close();
}
console.log(JSON.stringify(report, null, 1));
b.close(); process.exit(0);
