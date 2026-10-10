// Real Chrome + WebRTC integration tests. No mocks of the renderer, input or game.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PeerServer } from 'peer';
import { CHROME } from './chrome-path.mjs';

const port = 8150, debugPort = 9150, peerPort = 8151;
const external = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null;
const base = external || `http://localhost:${port}`;
const root = resolve(import.meta.dirname, '..'), out = process.argv.includes('--out') ? resolve(process.argv[process.argv.indexOf('--out') + 1]) : join(root, 'docs/qa/playability'); mkdirSync(out, { recursive: true });
const report = { timestamp: new Date().toISOString(), url: base, checks: [], errors: [], transport: process.argv.includes('--public-signal') ? 'PeerJS public signaling + real WebRTC' : 'local signaling + real WebRTC', physicalPhoneFPS: 'unverified' };
const profile = mkdtempSync(join(tmpdir(), 'chains-verify-'));
const server = spawn(process.execPath, ['serve.mjs', ...(process.argv.includes('--dist') ? ['--dist'] : [])], { cwd: root, env: { ...process.env, PORT: '' + port }, stdio: 'ignore' });
let signalServer;
const signal = report.transport.startsWith('local') ? PeerServer({ port: peerPort, path: '/' }, server => { signalServer = server; }) : null;
const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label, ms = 30000) { for (const t = Date.now(); Date.now() - t < ms; await pause(100)) { if (await fn()) return; } throw new Error('Timed out: ' + label); }
const sessions = [];
let browserSocket, browserSend;
function record(name, detail = true) { report.checks.push({ name, detail }); console.log('PASS', name); }
async function page({ mobile = false, thin = false } = {}) {
  const { targetId } = await browserSend('Target.createTarget', { url: 'about:blank', newWindow: true });
  const target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.id === targetId);
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.reject(Error(m.error.message)); else p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') report.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') report.errors.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const timeout = setTimeout(() => { pending.delete(id); reject(Error('CDP timed out: ' + method)); }, 20000); pending.set(id, { resolve: v => { clearTimeout(timeout); resolve(v); }, reject: e => { clearTimeout(timeout); reject(e); } }); ws.send(JSON.stringify({ id, method, params })); });
  const js = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const p = { send, js, ws, thin, id: target.id, async wait(expr, ms) { return until(() => js(expr), expr, ms); }, async screenshot(name) { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); writeFileSync(join(out, name + '.jpg'), Buffer.from(r.data, 'base64')); } };
  sessions.push(p); await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1280, height: mobile ? 844 : 720, deviceScaleFactor: mobile ? 3 : 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const peerConfig = signal ? `window.CHAINS_PEER_CONFIG = { host:'127.0.0.1',port:${peerPort},path:'/',secure:false,config:{iceServers:[]} };` : '';
  // Each tab represents a separate foreground device; emulate visibility independently.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: peerConfig + `Object.defineProperty(document,'hidden',{get:()=>!!window.__qaHidden});` });
  if (thin) {
    // Separate guest PeerJS sessions, without twelve GPUs competing for the desktop.
    await send('Page.navigate', { url: `${base}/icon.svg` });
    await js(`new Promise((r,j)=>{const s=document.createElementNS('http://www.w3.org/1999/xhtml','script');s.src='${base}/${external || process.argv.includes('--dist') ? 'vendor' : 'node_modules/peerjs/dist'}/peerjs.min.js';s.onload=r;s.onerror=j;document.documentElement.appendChild(s)})`);
  } else {
    await send('Page.navigate', { url: `${base}/` }); await p.wait('!!window.__chains', 60000);
  }
  return p;
}
async function touch(p, type, x, y) { await p.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }] }); }
try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok; } catch { return false; } }, 'Chrome');
  const version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
  browserSocket = new WebSocket(version.webSocketDebuggerUrl); await new Promise(r => browserSocket.onopen = r);
  let id = 0; const pending = new Map(); browserSocket.onmessage = e => { const m = JSON.parse(e.data); const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); };
  browserSend = (method, params) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); browserSocket.send(JSON.stringify({ id, method, params })); });
  const host = await page({ mobile: true });
  await host.js(`document.getElementById('btnOnline').click(); document.getElementById('onlineName').value='Host'; document.getElementById('btnCreate').click()`);
  await host.wait('__chains.G.lobby.length === 1', 25000); const code = await host.js('__chains.G.net.code');
  const guests = [];
  for (let i = 1; i <= 3; i++) {
    const p = await page({ mobile: i !== 2 }); guests.push(p);
    await p.js(`document.getElementById('btnOnline').click();document.getElementById('onlineName').value='Guest ${i}';document.getElementById('joinCode').value='${code}';document.getElementById('btnJoin').click()`);
    await host.wait(`__chains.G.lobby.length === ${i + 1}`); await p.wait(`__chains.G.lobby.length === ${i + 1}`);
  }
  record('Four independent rendered players join one room');
  await host.screenshot('four-player-lobby');
  await guests[0].js(`__chains.G.net.toHost({t:'start',config:{}});__chains.G.net.toHost({t:'next'});__chains.G.net.toHost({t:'throw',pi:0,result:{holed:true}})`);
  await pause(150); assert.equal(await host.js('__chains.G.phase'), 'menu'); record('Host rejects guest lobby/score/trajectory spoofing');
  // Fill all twelve slots using real PeerJS connections, then test rejection of slot 13.
  const thinPeers = [];
  for (let i = 0; i < 9; i++) {
    const p = await page({ thin: true }); thinPeers.push(p);
    await p.js(`(async()=>{window.events=[];window.peer=new Peer(window.CHAINS_PEER_CONFIG||{});window.token=crypto.randomUUID();window.conn=await new Promise((r,j)=>{peer.on('open',()=>{const c=peer.connect('chains-dg-${code}',{reliable:true,serialization:'binary',metadata:{name:'Extra ${i}',version:3,token}});c.on('data',d=>events.push(d));c.on('open',()=>r(c));c.on('error',j)});});return true})()`);
    if (i < 8) await host.wait(`__chains.G.lobby.length === ${5 + i}`);
    else await p.wait(`events.some(e=>e.t==='rejected')`);
  }
  assert.equal(await host.js('__chains.G.lobby.length'), 12); record('12-player real WebRTC room admits 12 and rejects player 13'); await host.screenshot('twelve-player-lobby');
  for (const p of thinPeers) { await p.js('peer.destroy()'); await fetch(`http://127.0.0.1:${debugPort}/json/close/${p.id}`); }
  await host.wait('__chains.G.lobby.length===4', 60000);   // a dropped lobby member keeps its place for 30 s
  await host.js(`__chains.G.settings.holes='3';document.getElementById('btnLobbyStart').click()`);
  const all = [host, ...guests]; for (const p of all) await p.wait('__chains.G.players.length===4 && __chains.G.phase===\'aim\'', 30000);
  record('Host starts the same four-player course on all clients');
  const pad = await host.js(`(()=>{const r=document.getElementById('pad').getBoundingClientRect();return {x:r.left+30,y:r.top+r.height*.4}})()`);
  await touch(host,'touchStart',pad.x,pad.y); await touch(host,'touchMove',pad.x+100,pad.y);
  assert.equal(await host.js('__chains.G.phase'), 'windup'); assert.equal(await host.js('document.getElementById("gestureTrace").classList.contains("active")'), true); await host.screenshot('mobile-swipe');
  await touch(host,'touchCancel'); assert.equal(await host.js('__chains.G.phase'), 'aim'); assert.equal(await host.js('__chains.G.players[0].strokes'), 0); record('Real touch swipe animates athlete/trail; OS cancel returns to aim without throwing');
  await touch(host,'touchStart',pad.x,pad.y); await touch(host,'touchMove',pad.x+165,pad.y); await touch(host,'touchEnd');
  for (const p of all) await p.wait('__chains.G.players[0].strokes === 1', 30000);
  const lies = await Promise.all(all.map(p => p.js('JSON.stringify(__chains.G.players[0].lie)'))); assert(lies.every(l => l === lies[0])); record('Mobile throw uses one authoritative replay: identical strokes and lies on four clients');
  for (const p of all) await p.wait('__chains.G.phase===\'aim\' && __chains.G.cur===1', 10000);
  // Ownership and range checks, without poisoning the valid turn.
  await guests[1].js(`__chains.G.net.toHost({t:'throw-request',turn:[__chains.G.sessionId,0,1,0].join(':'),params:{throwType:'backhand',discId:'driver',dir:[1,0],power:99,hyzer:0,yawOffset:0,launchOffset:0}})`);
  await pause(100); assert.equal(await host.js('__chains.G.players[1].strokes'), 0); record('Host rejects wrong-player and out-of-range throw commands');
  // Brief connection loss must retain the same player and scores.
  await guests[0].js(`__chains.G.net.conns.values().next().value.close()`);
  await guests[0].wait('__chains.G.phase===\'aim\' && !__chains.G.syncing && __chains.G.net.conns.size===1', 15000);
  await host.wait('__chains.G.lobby[1].disconnected===false', 15000);
  assert.equal(await guests[0].js('__chains.G.players[0].strokes'), 1); record('Disconnected guest reconnects and restores authoritative scores');
  const gpad = await guests[0].js(`(()=>{const r=document.getElementById('pad').getBoundingClientRect();return {x:r.left+30,y:r.top+r.height*.4}})()`);
  await touch(guests[0],'touchStart',gpad.x,gpad.y); await touch(guests[0],'touchMove',gpad.x+180,gpad.y); await touch(guests[0],'touchEnd');
  for (const p of all) await p.wait('__chains.G.players[1].strokes === 1', 30000);
  const results = await Promise.all(all.map(p => p.js('JSON.stringify(__chains.G.players.map(p=>({strokes:p.strokes,lie:p.lie,done:p.done,scores:p.scores})))'))); assert(results.every(r => r === results[0])); record('Guest mobile throw is validated by host and resolves identically on all four clients');
  for (const p of all) await p.wait('__chains.G.phase===\'aim\' && __chains.G.cur===2', 10000);
  const desktop = guests[1]; await desktop.js('document.activeElement.blur()');
  const yaw = await desktop.js('__chains.G.aim.yaw'); await desktop.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyD',key:'d'}); await pause(180); await desktop.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyD',key:'d'}); assert((await desktop.js('__chains.G.aim.yaw')) > yaw);
  await desktop.send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' '}); await pause(450); assert.equal(await desktop.js('__chains.G.phase'), 'windup');
  await desktop.send('Input.dispatchKeyEvent',{type:'keyDown',code:'Escape',key:'Escape'}); await desktop.send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' '}); assert.equal(await desktop.js('__chains.G.phase'), 'aim'); record('Real desktop keyboard aims, charges and cancels');
  await host.js(`window.__qaHidden=true;document.dispatchEvent(new Event('visibilitychange'))`);
  await guests[0].js(`window.__qaHidden=true;document.dispatchEvent(new Event('visibilitychange'))`);
  await desktop.send('Input.dispatchKeyEvent',{type:'keyDown',code:'Space',key:' '}); await pause(550); await desktop.send('Input.dispatchKeyEvent',{type:'keyUp',code:'Space',key:' '});
  for (const p of [host, desktop, guests[2]]) await p.wait('__chains.G.players[2].strokes===1', 30000);
  await host.js(`window.__qaHidden=false;document.dispatchEvent(new Event('visibilitychange'))`);
  await guests[0].js(`window.__qaHidden=false;document.dispatchEvent(new Event('visibilitychange'))`);
  await guests[0].wait('__chains.G.players[2].strokes===1 && !__chains.G.syncing', 15000);
  record('Desktop Space throw resolves with hidden host; returning guest catches up');
  // Resize during a gesture cannot release it; render dimensions stay within the mobile cap.
  await host.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:3,mobile:true}); await pause(150);
  assert.equal(await host.js('__chains.G.players[0].strokes'),1); assert((await host.js('__chains.renderer.getPixelRatio()')) <= 1.5); record('Portrait-to-landscape keeps round state and caps mobile rendering resolution');
  await host.screenshot('mobile-landscape');
  // Near-basket fixture exercises actual catch physics, celebrations, scorecards and advancing holes.
  await host.js(`(()=>{const c=__chains,g=c.G,h=c.holes[0],dx=h.tee[0]-h.basket[0],dz=h.tee[1]-h.basket[1],l=Math.hypot(dx,dz);g.flight=null;g.pending=null;g.tween=null;g.players.forEach(p=>{const x=h.basket[0]+dx/l*4.5,z=h.basket[1]+dz/l*4.5;p.lie=[x,c.world.height(x,z),z];p.lieDist=4.5;p.strokes=0;p.scores=[];p.done=false});c.setupTurn(0)})()`);
  for (const p of guests) { await p.js(`__chains.G.net.toHost({t:'sync-request'})`); await p.wait(`__chains.G.cur===0 && __chains.G.players[0].strokes===0 && !__chains.G.syncing`); }
  for (let i=0;i<4;i++) {
    for (const p of all) await p.wait(`__chains.G.cur===${i} && __chains.G.phase==='aim'`,10000);
    const params = await host.js(`(()=>{const c=__chains,g=c.G,p=g.players[g.cur],b=c.world.basket,dx=b.x-p.lie[0],dz=b.z-p.lie[2],l=Math.hypot(dx,dz),dir=[dx/l,dz/l];for(let power=.25;power<=1;power+=.015)for(const yawOffset of [0,-4,4,-8,8])for(const launchOffset of [0,8,16,-6]){const q={throwType:'putt',discId:'putter',dir,pos:[p.lie[0]+dir[0]*.4,c.world.height(p.lie[0],p.lie[2])+1.15,p.lie[2]+dir[1]*.4],power,hyzer:0,yawOffset,launchOffset,lefty:false};if(c.runSim(q).result.holed)return q;}return null})()`);
    assert(params,'A real putt must be able to enter the basket');
    if (i===0) await host.js(`__chains.doThrow(0,${JSON.stringify(params)})`);
    else await guests[i-1].js(`__chains.G.net.toHost({t:'throw-request',turn:[__chains.G.sessionId,0,${i},0].join(':'),params:${JSON.stringify(params)}})`);
    for (const p of all) await p.wait(`__chains.G.players[${i}].done`,15000);
    if(i===0){await pause(200);await host.screenshot('celebration');}
  }
  for(const p of all)await p.wait(`__chains.G.phase==='holeEnd'`,10000);
  const cards=await Promise.all(all.map(p=>p.js('JSON.stringify(__chains.G.players.map(p=>p.scores))')));assert(cards.every(c=>c===cards[0]));record('Four real holed putts trigger celebrations and identical completed scorecards');
  await host.screenshot('scorecard');await host.js(`document.getElementById('btnScoreNext').click()`);
  for(const p of all)await p.wait(`__chains.G.holeIdx===1`,10000);record('Host advances the next hole on all four clients');
  report.rendering = await desktop.js(`({gpu:__chains.renderer.getContext().getParameter(__chains.renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL),quality:__chains.G.settings.quality,ratio:__chains.renderer.getPixelRatio()})`);
  assert.equal(report.errors.length, 0, report.errors.join('\n')); record('No browser or shader errors'); report.passed = true;
} catch (e) { report.passed = false; report.failure = String(e.stack || e); console.error(report.failure); process.exitCode = 1;
  report.states = await Promise.all(sessions.filter(p => !p.thin && p.ws.readyState===1).map(p => p.js(`({phase:window.__chains?.G.phase,syncing:window.__chains?.G.syncing,players:window.__chains?.G.players.length,cur:window.__chains?.G.cur,introT:window.__chains?.G.introT,hidden:document.hidden})`).catch(e => String(e))));
}
finally {
  writeFileSync(join(out, external ? 'live-browser-results.json' : 'browser-results.json'), JSON.stringify(report, null, 2));
  for (const p of sessions) p.ws.close(); browserSocket?.close(); chrome.kill(); server.kill(); signalServer?.close();
  // Only delete the verified disposable directory created by this script.
  if (profile.startsWith(join(tmpdir(), 'chains-verify-'))) { try { rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100}); } catch {} }
  process.exit(process.exitCode || 0);
}
