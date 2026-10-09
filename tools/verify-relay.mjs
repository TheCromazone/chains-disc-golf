// Live rooms over the MQTT relay while phones lock, in real headless Chrome. A host, a direct guest and a guest whose WebRTC cannot
// open (no ICE servers and a relay-only policy: the phone on cellular with no TURN) play a round from separate browser contexts.
// "Locking" a phone is CDP's page freeze, which also drops the page's sockets (WebSockets close as they do on iOS); unlocking it
// unfreezes the page and shows it again. Signalling is a local PeerServer; the relay is the public brokers in src/relay.js.
//   node tools/verify-relay.mjs [--dist] [--case 1|2|3]        (CHROME=/path/to/chrome; --case runs one of the three checks alone)
// Checks: the relay guest locks for 10 s on its own turn and throws the moment it is back; the host locks for 15 s while the relay
// guest throws; both throws must land (a throw the game hands back to be thrown again is allowed, a stuck "Confirming your throw…"
// is not) with every client agreeing. A throw request the host holds back for 9 s must hand the guest its turn back and still
// count once. Also: the screen wake lock is held in a room, asked for again on return and let go on leaving.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PeerServer } from 'peer';
import { CHROME } from './chrome-path.mjs';

const only = process.argv.includes('--case') ? process.argv[process.argv.indexOf('--case') + 1] : null;
const port = 8170, peerPort = 8171, dbg = 9170, root = resolve(import.meta.dirname, '..'), base = `http://localhost:${port}`;
for (const p of [port, peerPort, dbg]) if (await fetch(`http://127.0.0.1:${p}/`).then(() => true, () => false)) { console.error(`Port ${p} is already in use: stop whatever serves it first.`); process.exit(1); }
const profile = mkdtempSync(join(tmpdir(), 'chains-relay-'));
const server = spawn(process.execPath, ['serve.mjs', ...(process.argv.includes('--dist') ? ['--dist'] : [])], { cwd: root, env: { ...process.env, PORT: '' + port }, stdio: 'ignore' });
let signalServer; PeerServer({ port: peerPort, path: '/' }, s => { signalServer = s; });
const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
const pause = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, label, ms = 30000) => { for (const t = Date.now(); Date.now() - t < ms; await pause(150)) if (await fn()) return; throw new Error('Timed out: ' + label); };
const T0 = Date.now(), ts = () => ((Date.now() - T0) / 1000).toFixed(1) + 's';
const errors = [], results = [];
const pass = (name, detail = '') => { results.push({ name, ok: true, detail }); console.log(`[${ts()}] PASS ${name}${detail ? ' — ' + detail : ''}`); };
const fail = (name, detail) => { results.push({ name, ok: false, detail }); console.log(`[${ts()}] FAIL ${name} — ${detail}`); process.exitCode = 1; };
let bsend;

// A stand-in wake lock that counts requests and is let go when the page hides, as a browser's is.
const WAKE = `(()=>{let held=null;window.__wake={asked:0,released:0,get held(){return !!held}};
  const lock={request:async()=>{__wake.asked++;const s=new EventTarget();s.released=false;s.type='screen';s.release=async()=>{if(s.released)return;s.released=true;__wake.released++;if(held===s)held=null;s.dispatchEvent(new Event('release'))};held=s;return s}};
  Object.defineProperty(navigator,'wakeLock',{value:lock,configurable:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&held)held.release()});})();`;
async function phone(name, { relayOnly = false } = {}) {
  const { browserContextId } = await bsend('Target.createBrowserContext', {});
  const { targetId } = await bsend('Target.createTarget', { url: 'about:blank', browserContextId });
  const t = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find(x => x.id === targetId);
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let seq = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p?.rej(Error(m.error.message)) : p?.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(`${name}: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`${name}: ${m.params.args.map(a => a.value ?? a.description).join(' ')}`); };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; const to = setTimeout(() => { pend.delete(id); rej(Error('CDP timed out: ' + method)); }, 30000);
    pend.set(id, { res: v => { clearTimeout(to); res(v); }, rej: e => { clearTimeout(to); rej(e); } }); ws.send(JSON.stringify({ id, method, params })); });
  const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const config = `{iceServers:[]${relayOnly ? ",iceTransportPolicy:'relay'" : ''}}`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.CHAINS_PEER_CONFIG={host:'127.0.0.1',port:${peerPort},path:'/',secure:false,config:${config}};${WAKE}` });
  const p = { name, js, send, wait: (expr, label, ms) => until(() => js(expr).catch(() => false), `${name}: ${label || expr}`, ms),
    async lock() { await send('Emulation.setFocusEmulationEnabled', { enabled: false }); await send('Page.setWebLifecycleState', { state: 'frozen' }); },
    async unlock() { await send('Page.setWebLifecycleState', { state: 'active' }); await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } };
  return p;
}
const visible = id => `(()=>{const e=document.getElementById('${id}');return !!e&&!e.classList.contains('hidden')&&!e.closest('.hidden')})()`;
const stateExpr = `JSON.stringify({cur:__chains.G.cur,hole:__chains.G.holeIdx,players:__chains.G.players.map(p=>({strokes:p.strokes,lie:p.lie,done:p.done,scores:p.scores}))})`;
// the power that leaves the disc nearest the basket, from the game's own simulator (a putt that holes when one exists)
const PICK = `(()=>{const c=__chains,g=c.G,p=g.players[g.cur],b=c.world.basket,dx=b.x-p.lie[0],dz=b.z-p.lie[2],l=Math.hypot(dx,dz),dir=[dx/l,dz/l];let best=null;
  for(let k=6;k<=40;k++){const power=Math.min(1,k*25/1000);for(const yawOffset of l<12?[0,-3,3,-6,6]:[0]){const q={throwType:g.throwType,discId:g.discId,dir,pos:[p.lie[0]+dir[0]*.4,c.world.height(p.lie[0],p.lie[2])+1.15,p.lie[2]+dir[1]*.4],power,hyzer:0,yawOffset,launchOffset:0,lefty:false};
  const r=c.runSim(q),e=r.traj[r.traj.length-1],d=r.result.holed?-1:Math.hypot(e[0]-b.x,e[2]-b.z)+(r.result.ob?50:0);if(!best||d<best.d)best={d,power,yawOffset}}}return best})()`;
const playable = pi => `__chains.G.phase==='aim'&&__chains.G.cur===${pi}&&!__chains.G.syncing&&__chains.G.net?.conns.size>0`;

try {
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${dbg}/json/version`)).ok; } catch { return false; } }, 'Chrome');
  const ver = await (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json(); const bws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => bws.onopen = r);
  let bid = 0; const bp = new Map(); bws.onmessage = e => { const m = JSON.parse(e.data); bp.get(m.id)?.(m.result); };
  bsend = (method, params) => new Promise(r => { bp.set(++bid, r); bws.send(JSON.stringify({ id: bid, method, params })); });

  const host = await phone('Host'), g1 = await phone('Guest1'), g2 = await phone('Guest2', { relayOnly: true }), all = [host, g1, g2];
  await Promise.all(all.map(p => p.send('Page.navigate', { url: `${base}/?mute=1` })));
  for (const p of all) await p.wait('!!window.__chains && !!window.__chains.G', 'game boot', 90000);
  await host.js(`document.getElementById('btnOnline').click()`); await host.wait(visible('matchHome'), 'Friends');
  await host.js(`document.getElementById('btnLive').click();document.getElementById('onlineName').value='Host';document.getElementById('btnCreate').click()`);
  await host.wait(`__chains.G.lobby.length===1 && ${visible('lobby')}`, 'room created');
  const code = await host.js('__chains.G.net.code');
  await host.wait('!!__chains.G.net.relay', 'host relay listening', 20000);
  for (const [i, g] of [g1, g2].entries()) {
    await g.send('Page.navigate', { url: `${base}/?room=${code}&mute=1` }); await g.wait('!!window.__chains && !!window.__chains.G', 'game boot', 90000);
    await g.wait(visible('btnJoin'), 'invite opens Join');
    await g.js(`document.getElementById('onlineName').value='${g.name}';document.getElementById('btnJoin').click()`);
    await g.wait(`__chains.G.lobby.length===${i + 2}`, 'joined', 45000); await host.wait(`__chains.G.lobby.length===${i + 2}`, `host sees ${g.name}`);
  }
  const vias = await Promise.all([g1, g2].map(g => g.js('__chains.G.net.via')));
  assert.deepEqual(vias, ['direct', 'relay'], 'transports: ' + vias);
  pass('Host, a direct guest and a relay guest share a room', `room ${code}; Guest2 joined through the relay`);
  const wakes = await Promise.all(all.map(p => p.js('JSON.stringify(__wake)')));
  if (wakes.every(w => JSON.parse(w).asked >= 1 && JSON.parse(w).held)) pass('Every player holds the screen wake lock in the room');
  else fail('Every player holds the screen wake lock in the room', wakes.join(' '));

  await host.js(`__chains.G.settings.holes='3';document.getElementById('btnLobbyStart').click()`);
  for (const p of all) await p.wait(`__chains.G.players.length===3 && __chains.G.phase==='aim'`, 'round at aim', 60000);
  const ids = await Promise.all(all.map(p => p.js('__chains.G.net.id()')));
  const ownerOf = async pi => all[ids.indexOf(await host.js(`__chains.G.players[${pi}].peerId`))];
  const agree = async label => { const s = await Promise.all(all.map(p => p.js(stateExpr))); if (!s.every(x => x === s[0])) throw new Error(`${label}: clients disagree\n${s.join('\n')}`); };
  const settle = async () => { for (const p of all) await p.wait(`(__chains.G.phase==='aim'||__chains.G.phase==='holeEnd') && !__chains.G.syncing && !__chains.G.flight`, 'settles', 45000); await pause(300); };
  // Throw for the player who is up, from their own client, as soon as the game lets them; if the game hands the turn back
  // (a resync), throw again. Fails on a stuck "Confirming your throw…" or when nothing lands within the time limit.
  async function throwUp({ limit = 60000, pi, before } = {}) {
    pi ??= await host.js('__chains.G.cur'); before ??= await host.js(`__chains.G.players[${pi}].strokes`);
    const owner = await ownerOf(pi), t0 = Date.now();
    const landed = () => host.js(`__chains.G.players[${pi}].strokes===${before + 1}`);
    let attempts = 0, waitingSince = 0;
    while (!(await landed())) {
      if (Date.now() - t0 > limit) throw new Error(`${owner.name}'s throw did not land within ${limit / 1000} s (${attempts} tries; phase ${await owner.js('__chains.G.phase')}, "${await owner.js("document.getElementById('waiting').textContent")}")`);
      if (await owner.js(playable(pi)).catch(() => false)) {
        const q = await owner.js(PICK); attempts++;
        await owner.js(`__chains.doThrow(${pi},{power:${q.power},hyzer:0,yawOffset:${q.yawOffset},launchOffset:0})`);
        await owner.wait(`__chains.G.phase!=='aim'`, 'leaves aim', 5000).catch(() => {});
        waitingSince = 0;
      }
      const phase = await owner.js('__chains.G.phase').catch(() => '?');
      if (phase === 'awaitThrow') { waitingSince ||= Date.now(); if (Date.now() - waitingSince > 25000) throw new Error(`${owner.name} stuck on "Confirming your throw…" for 25 s (${attempts} tries)`); }
      else waitingSince = 0;
      await pause(200);
    }
    for (const p of all) await p.wait(`__chains.G.players[${pi}].strokes===${before + 1}`, 'sees the throw', 30000);
    await settle(); await agree(`after ${owner.name}'s throw`);
    return { owner, attempts, ms: Date.now() - t0 };
  }
  async function untilTurnOf(g) {
    for (let k = 0; k < 10; k++) {
      if ((await host.js('__chains.G.phase')) === 'holeEnd') { await host.js(`document.getElementById('btnScoreNext').click()`); for (const p of all) await p.wait(`__chains.G.phase==='aim'`, 'next hole', 60000); continue; }
      const pi = await host.js('__chains.G.cur'); if ((await ownerOf(pi)) === g) return pi;
      await throwUp();
    }
    throw new Error('never reached ' + g.name);
  }

  // 1. The relay guest locks its phone for 10 s on its own turn and throws as soon as it is back.
  if (!only || only === '1') try {
    const pi = await untilTurnOf(g2); await g2.wait(playable(pi), 'own turn');
    await g2.lock(); await pause(10000); await g2.unlock();
    const r = await throwUp();
    pass('Relay guest locked 10 s on its turn, throws on return: the throw lands and all clients agree', `${(r.ms / 1000).toFixed(1)} s, ${r.attempts} ${r.attempts === 1 ? 'try' : 'tries'}`);
  } catch (e) { fail('Relay guest locked 10 s on its turn, throws on return', e.message); }

  // 2. The host locks its phone for 15 s; 3 s in, the relay guest throws.
  if (!only || only === '2') try {
    const pi = await untilTurnOf(g2); await g2.wait(playable(pi), 'own turn');
    const asked = JSON.parse(await host.js('JSON.stringify(__wake)')).asked, before = await host.js(`__chains.G.players[${pi}].strokes`);
    await host.lock(); await pause(3000);
    const t0 = Date.now(); const q = await g2.js(PICK);
    await g2.js(`__chains.doThrow(${pi},{power:${q.power},hyzer:0,yawOffset:${q.yawOffset},launchOffset:0})`);
    await pause(12000); await host.unlock();
    const r = await throwUp({ pi, before });
    pass('Host locked 15 s while the relay guest throws: the throw lands and all clients agree', `${((Date.now() - t0) / 1000).toFixed(1)} s after the throw, ${r.attempts + 1} ${r.attempts ? 'tries' : 'try'}`);
    const w = JSON.parse(await host.js('JSON.stringify(__wake)'));
    if (w.asked > asked && w.held) pass('Host asks for the wake lock again when it is back on screen'); else fail('Host asks for the wake lock again when it is back on screen', JSON.stringify(w));
  } catch (e) { fail('Host locked 15 s while the relay guest throws', e.message); }

  // 3. The host holds a guest's throw request back for 9 s (lost, then late): the guest gets its turn back after about 7 s, throws
  //    again, and the throw counts once even though the first request still arrives.
  if (!only || only === '3') try {
    const pi = await untilTurnOf(g1); await g1.wait(playable(pi), 'own turn');
    const before = await host.js(`__chains.G.players[${pi}].strokes`);
    await host.js(`(()=>{const n=__chains.G.net,o=n.onEvent;let held=false;n.onEvent=ev=>{if(!held&&ev.type==='msg'&&ev.data?.t==='throw-request'){held=true;setTimeout(()=>o(ev),9000);return}return o(ev)};window.__unhold=()=>{n.onEvent=o}})()`);
    const r = await throwUp({ pi, before });
    await pause(6000); await settle(); await agree('after the late request');
    const after = await host.js(`__chains.G.players[${pi}].strokes`);
    await host.js('window.__unhold()');
    if (after === before + 1 && r.attempts >= 2) pass('A lost throw request hands the guest its turn back; the late copy does not count twice', `${r.attempts} tries, ${(r.ms / 1000).toFixed(1)} s, strokes ${before} → ${after}`);
    else fail('A lost throw request hands the guest its turn back; the late copy does not count twice', `${r.attempts} tries, strokes ${before} → ${after}`);
  } catch (e) { fail('A lost throw request hands the guest its turn back', e.message); }

  const lobby = await host.js(`JSON.stringify(__chains.G.lobby.map(m=>m.name+(m.disconnected?' (disconnected)':'')+(m.isBot?' (bot)':'')))`);
  if (/disconnected|bot/.test(lobby)) fail('Nobody is left disconnected or replaced by a bot', lobby); else pass('Nobody is left disconnected or replaced by a bot', lobby);
  await g1.js(`document.getElementById('btnLeave').click()`); await g1.wait('__chains.G.phase==="menu"', 'menu');
  const w1 = JSON.parse(await g1.js('JSON.stringify(__wake)'));
  if (!w1.held && w1.released >= 1) pass('Leaving the room lets the wake lock go'); else fail('Leaving the room lets the wake lock go', JSON.stringify(w1));
  if (errors.length) fail('No page errors', errors.join('\n')); else pass('No page errors');
} catch (e) { fail('run', String(e.stack || e)); if (errors.length) console.log(errors.join('\n')); }
finally {
  chrome.kill('SIGKILL'); server.kill(); signalServer?.close();
  await pause(300);
  if (profile.startsWith(join(tmpdir(), 'chains-relay-'))) try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
  console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
  process.exit(process.exitCode || 0);
}
