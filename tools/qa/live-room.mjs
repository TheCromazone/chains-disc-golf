// Live room playtest with real input: a host on an emulated desktop (mouse swipes) and a guest on an emulated iPhone (touch
// swipes), each in its own muted headless Chrome, play a room through a local PeerServer (and, with --relay, a guest whose WebRTC
// cannot open, so it plays through the MQTT relay). Every throw is swiped on the thrower's own screen to the power the shot
// guide suggests; the watcher's screen is sampled while it plays (run-up, release, flight) and both screens must agree on the
// disc's path, where it lands and the scorecard. Between throws it backgrounds the guest for 10 s, reloads the guest mid-hole,
// lets a third player knock after the start and has the host leave. Screens go to --out.
//   node tools/qa/live-room.mjs [--port 8364] [--holes 3] [--relay] [--out dir] [--root other-checkout]   (server on port, PeerServer on port+1, Chromes on port+1000..1002)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PeerServer } from 'peer';
import { launch, pause } from './cdp.mjs';

const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const port = +arg('--port', 8364), holes = +arg('--holes', 3), relay = process.argv.includes('--relay'), root = resolve(import.meta.dirname, '../..'), served = resolve(arg('--root', root));   // --root: play another checkout's game (an A/B against an older tree)
const out = resolve(arg('--out', join(root, 'docs/qa/live-room'))); mkdirSync(out, { recursive: true });
// a Chrome already answering on one of these ports would take this run's pages as extra tabs (hidden, so their loop stalls)
for (const p of [port, port + 1, port + 1000, port + 1001, port + 1002]) if (await fetch(`http://127.0.0.1:${p}/`).then(() => true, () => false)) { console.error(`Port ${p} is already in use: pick another --port.`); process.exit(1); }
const base = `http://localhost:${port}`, IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const server = spawn(process.execPath, ['serve.mjs'], { cwd: served, env: { ...process.env, PORT: '' + port }, stdio: 'ignore' });
process.once('exit', () => { try { server.kill(); } catch {} });
let signal; PeerServer({ port: port + 1, path: '/' }, s => { signal = s; });
const T0 = Date.now(), ts = () => ((Date.now() - T0) / 1000).toFixed(1).padStart(6) + 's';
const results = [], log = (...a) => console.log(`[${ts()}]`, ...a);
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); log(ok ? 'PASS' : 'FAIL', name, detail ? '— ' + detail : ''); if (!ok) process.exitCode = 1; };
const until = async (fn, label, ms = 45000) => { for (const t = Date.now(); Date.now() - t < ms; await pause(150)) if (await fn().catch(() => false)) return true; throw new Error('Timed out: ' + label); };

async function phone(name, dbg, device, { relayOnly = false } = {}) {
  const b = await launch({ port: dbg }), p = await b.newPage();
  await p.device(device); await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await p.addInit(`window.CHAINS_PEER_CONFIG={host:'127.0.0.1',port:${port + 1},path:'/',secure:false,config:{iceServers:[]${relayOnly ? ",iceTransportPolicy:'relay'" : ''}}};`);
  return Object.assign(p, { name, browser: b, touch: !!device.touch, wait: (expr, label, ms) => until(() => p.eval(expr), `${name}: ${label || expr}`, ms) });
}
const visible = id => `(()=>{const e=document.getElementById('${id}');return !!e&&!e.classList.contains('hidden')&&!e.closest('.hidden')})()`;
// a real tap (or click) once the button has stopped moving: panels slide in, and a tap mid-slide lands beside it
async function tap(p, sel) {
  const rect = `(()=>{const b=document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect();return b?[b.x,b.y,b.width].map(Math.round).join():''})()`;
  for (let k = 0, last = ''; k < 30; k++) { const r = await p.eval(rect); if (r && r === last) break; last = r; await pause(120); }
  return p.touch ? p.tapSel(sel) : p.clickSel(sel);
}
const STATE = `JSON.stringify({hole:__chains.G.holeIdx,cur:__chains.G.cur,players:__chains.G.players.map(p=>({name:p.name,strokes:p.strokes,done:p.done,lie:p.lie.map(v=>Math.round(v*100)/100),scores:p.scores}))})`;
const SWIPE = { backhand: [1, 0], backhand_io: [1, 0], backhand_oi: [1, 0], forehand: [-1, 0], forehand_io: [-1, 0], forehand_oi: [-1, 0], putt: [0, -1], tomahawk: [0, 1], blade: [-.7071, .7071], hammer: [.7071, .7071], scoober: [-.7071, -.7071] };

// The watcher's view of a throw, sampled every frame-ish: phase, the thrower's run-up flag and swing phase, the camera mode,
// and the flight's path (its length and last point, the same on every screen when the host's replay arrives intact). While the
// disc is in the air: whether it is inside the frame and how far it is from the lens (__fly: [in frame, metres]).
const TRACE_ON = `(()=>{window.__trace=[];window.__fly=[];window.__path=null;clearInterval(window.__traceT);window.__traceT=setInterval(()=>{const c=__chains,g=c.G,p=g.players[g.cur];if(!p)return;
  if(g.flight&&!window.__path)window.__path=g.flight.traj.length+':'+g.flight.traj.at(-1).join(',');
  const f=g.flight;if(f?.pos&&!f.events.slice(0,f.ei).some(e=>/^(land|skip|roll|flop|splash|chains|drop)$/.test(e[1]))){const v=new c.THREE.Vector3(...f.pos),d=v.distanceTo(c.camera.position);c.camera.updateMatrixWorld();v.project(c.camera);__fly.push([v.z<1&&Math.abs(v.x)<.95&&Math.abs(v.y)<.95?1:0,Math.round(d*10)/10])}
  const s=[g.phase,p.runUp?1:0,Math.round((p.char.getPhase?.()??-1)*100)/100,c.cam.mode,document.getElementById('waiting').classList.contains('hidden')?'':document.getElementById('waiting').textContent];
  const k=JSON.stringify(s);if(window.__traceK!==k){window.__traceK=k;__trace.push([Math.round(performance.now()),...s])}},30)})()`;
const TRACE_OFF = `(()=>{clearInterval(window.__traceT);return {trace:window.__trace,path:window.__path,fly:window.__fly}})()`;
const flyStat = tr => { const f = tr.fly || [], d = f.map(x => x[1]).sort((a, b) => a - b); return f.length ? `disc in frame ${Math.round(100 * f.filter(x => x[0]).length / f.length)}%, ${d[d.length >> 1]} m from the lens (median), ${d.filter(x => x > 12).length}/${f.length} samples over 12 m` : 'no flight samples'; };

// Swipe the throw the way a thumb (or mouse) does: down in the pad, along the throw's direction, until the power meter reads
// the shot guide's suggestion, then up.
async function swipeThrow(p) {
  await p.wait(`__chains.G.previewPower!=null`, 'shot guide', 4000).catch(() => {});
  const s = await p.eval(`(()=>{const g=__chains.G,r=document.getElementById('pad').getBoundingClientRect();return {type:g.throwType,disc:g.discId,power:g.previewPower,pad:[r.x,r.y,r.width,r.height],dist:g.players[g.cur].lieDist}})()`);
  const dir = SWIPE[s.type] || [1, 0], target = Math.max(.18, Math.min(1, (s.power ?? .6) * (s.type === 'putt' ? 1.04 : 1)));
  const [x, y, w, h] = s.pad, x0 = x + w * (dir[0] > 0 ? .2 : dir[0] < 0 ? .8 : .5), y0 = y + h * (dir[1] < 0 ? .62 : dir[1] > 0 ? .15 : .55);   // a putt starts mid-pad: lower, the throw and disc buttons sit over it
  const ev = (type, px, py) => p.touch ? p.send('Input.dispatchTouchEvent', { type: { down: 'touchStart', move: 'touchMove', up: 'touchEnd' }[type], touchPoints: type === 'up' ? [] : [{ x: px, y: py }] })
    : p.send('Input.dispatchMouseEvent', { type: { down: 'mousePressed', move: 'mouseMoved', up: 'mouseReleased' }[type], x: px, y: py, button: 'left', buttons: type === 'up' ? 0 : 1, clickCount: 1 });
  if (!p.touch) await p.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
  await ev('down', x0, y0); let k = 0, got = 0;
  for (; k < 220; k++) { await pause(6); const px = x0 + dir[0] * 4 * k, py = y0 + dir[1] * 4 * k; await ev('move', px, py); if (k % 2 === 0 && (got = await p.eval('__chains.G.gesture.power')) >= target) break; }
  await ev('up', x0 + dir[0] * 4 * k, y0 + dir[1] * 4 * k);
  if (!(await p.eval(`!['aim','windup'].includes(__chains.G.phase)`).catch(() => false))) { await pause(300); if (await p.eval(`['aim','windup'].includes(__chains.G.phase)`)) log(`${p.name}: the swipe did not throw (${s.type}, start ${Math.round(x0)},${Math.round(y0)}, power ${got})`); }
  return { ...s, target: Math.round(target * 100) / 100, got: Math.round(got * 100) / 100, px: 4 * k };
}

let host, guest, late;
try {
  await until(() => fetch(base + '/').then(r => r.ok), 'dev server', 20000);
  host = await phone('Desktop host', port + 1000, { width: 1440, height: 900, dpr: 1 });
  guest = await phone('iPhone guest', port + 1001, { width: 390, height: 844, dpr: 3, mobile: true, touch: true, ua: IPHONE_UA }, { relayOnly: relay });
  const all = [host, guest];
  await Promise.all(all.map(p => p.send('Page.navigate', { url: `${base}/?mute=1` })));
  for (const p of all) await p.wait('!!window.__chains&&!!window.__chains.G', 'boot', 120000);
  await tap(host, '#btnOnline'); await host.wait(visible('matchHome'), 'Friends'); await pause(700);   // panels slide in: a tap mid-slide lands beside the button
  await tap(host, '#btnLive'); await host.wait(visible('btnCreate'), 'Live room'); await pause(700);
  await host.eval(`document.getElementById('onlineName').value='Desk'`); await tap(host, '#btnCreate');
  await host.wait(`__chains.G.lobby.length===1&&${visible('lobby')}`, 'room created', 30000);
  const code = await host.eval('__chains.G.net.code');
  await host.wait('!!__chains.G.net.relay', 'host relay listening', 30000).catch(() => log('host relay not listening (no broker answered)'));
  await guest.send('Page.navigate', { url: `${base}/?room=${code}&mute=1` }); await guest.wait('!!window.__chains&&!!window.__chains.G', 'boot', 120000);
  await guest.wait(visible('btnJoin'), 'invite opens Join');
  await guest.eval(`document.getElementById('onlineName').value='Phone'`); await tap(guest, '#btnJoin');
  const tj = Date.now(); await guest.wait(`__chains.G.lobby.length===2&&${visible('lobby')}`, 'joined', 60000);
  check('iPhone guest joins the desktop host from the invite link', true, `room ${code} via ${await guest.eval('__chains.G.net.via')} in ${((Date.now() - tj) / 1000).toFixed(1)} s`);
  await guest.shot(join(out, `${relay ? 'relay-' : ''}0-guest-lobby.jpg`));
  await tap(host, '#roomHoles [data-v="3"]'); await guest.wait('__chains.G.room?.holes===3', 'room settings reach the guest', 15000);
  await tap(guest, '#btnReady'); await host.wait('__chains.G.lobby.every(p=>p.host||p.isBot||p.ready)', 'guest ready', 15000);
  await tap(host, '#btnLobbyStart');
  for (const p of all) await p.wait(`__chains.G.players.length===2&&['intro','aim'].includes(__chains.G.phase)`, 'round starts', 90000);
  check('Both start the round', true);

  const ids = await Promise.all(all.map(p => p.eval('__chains.G.net.id()')));
  const ownerOf = async pi => all[ids.indexOf(await host.eval(`__chains.G.players[${pi}].peerId`))];
  const settle = async (ms = 60000) => { for (const p of all) await p.wait(`['aim','holeEnd'].includes(__chains.G.phase)&&!__chains.G.syncing&&!__chains.G.flight&&!__chains.G.tween`, 'settles', ms); await pause(400); };
  const agree = async label => { const s = await Promise.all(all.map(p => p.eval(STATE))); const ok = s[0] === s[1]; if (!ok) log('DISAGREE', label, '\n ', s.join('\n  ')); return ok; };
  let throws = 0, disagreements = 0, watchIssues = [], shots = new Set();
  const events = { background: false, reload: false, late: false };

  // One throw by whoever is up, swiped on their own screen, sampled on the other's.
  async function playThrow() {
    for (const p of all) await p.wait(`__chains.G.phase==='aim'&&!__chains.G.syncing`, 'aim', 60000);
    const pi = await host.eval('__chains.G.cur'), owner = await ownerOf(pi), watcher = all.find(p => p !== owner), before = await host.eval(`__chains.G.players[${pi}].strokes`);
    await owner.wait(`__chains.G.phase==='aim'&&__chains.G.cur===${pi}&&!__chains.G.syncing&&(__chains.G.net.isHost||__chains.G.net.conns.size>0)`, 'own turn', 30000);
    const waitText = await watcher.eval(`document.getElementById('waiting').classList.contains('hidden')?'(none)':document.getElementById('waiting').textContent`);
    await Promise.all(all.map(p => p.eval(TRACE_ON)));
    const sw = await swipeThrow(owner), t0 = Date.now();
    const kind = `${owner === host ? 'host' : 'guest'}-${sw.type === 'putt' ? 'putt' : 'drive'}`;
    if (!shots.has(kind) && sw.type !== 'putt') { await watcher.wait(`__chains.G.phase==='windup'||__chains.G.phase==='release'`, 'watcher sees the windup', 15000).catch(() => {}); await pause(450); await watcher.shot(join(out, `${relay ? 'relay-' : ''}watch-${kind}-windup.jpg`)); }
    if (!shots.has(kind)) { await watcher.wait('!!__chains.G.flight', 'watcher sees the flight', 20000).catch(() => {}); const tf = Date.now();   // and a strip through the flight: 0.3, 0.9, 1.5, 2.1 s in
      for (const [k, ms] of [[1, 300], [0, 900], [2, 1500], [3, 2100]]) { await pause(Math.max(0, ms - (Date.now() - tf))); await watcher.shot(join(out, `${relay ? 'relay-' : ''}watch-${kind}-flight${k ? '-' + k : ''}.jpg`)); }
      shots.add(kind); }
    for (const p of all) await p.wait(`__chains.G.players[${pi}].strokes>=${before + 1}`, 'the throw counts', 60000);
    await settle(); throws++;
    const [mine, theirs] = await Promise.all([owner, watcher].map(p => p.eval(TRACE_OFF)));
    const phases = theirs.trace.map(t => t[1]).filter((v, i, a) => v !== a[i - 1]);
    const follow = tr => Math.max(-1, ...tr.trace.filter(t => ['release', 'flight'].includes(t[1])).map(t => t[3]));   // how far the swing got: 1 is the end of the follow-through
    const swing = follow(theirs), ownSwing = follow(mine);
    const ran = theirs.trace.some(t => t[2] === 1 && t[1] === 'windup');
    const issue = [!phases.includes('windup') && 'no windup', !phases.includes('release') && 'no release', !phases.includes('flight') && 'no flight', swing < .95 && `follow-through only to ${swing}`, mine.path !== theirs.path && 'paths differ'].filter(Boolean);
    if (issue.length) watchIssues.push(`${kind} #${throws}: ${issue.join(', ')}`);
    const same = await agree(`after throw ${throws}`); if (!same) disagreements++;
    log(`throw ${throws}: ${owner.name} ${sw.type}/${sw.disc} ${sw.dist.toFixed(1)} m, swiped ${sw.px}px to ${sw.got} (guide ${sw.target}); landed on both in ${((Date.now() - t0) / 1000).toFixed(1)} s; watcher: ${phases.join('>')}${ran ? ' (run-up)' : ''}, follow-through to ${swing} (thrower's own ${ownSwing}); waiting text "${waitText}"; ${same ? 'agree' : 'DISAGREE'}; watcher's flight: ${flyStat(theirs)}; thrower's: ${flyStat(mine)}`);
    return { owner, sw };
  }

  for (let hole = 0; hole < holes; hole++) {
    for (let n = 0; n < 40; n++) {
      await host.wait(`['aim','holeEnd'].includes(__chains.G.phase)&&__chains.G.cur>=0`, 'a turn or the hole end', 60000);   // past the flyover
      if ((await host.eval('__chains.G.phase')) === 'holeEnd') break;
      const cur = await host.eval('__chains.G.cur'), owner = await ownerOf(cur), strokes = await host.eval(`__chains.G.players[${cur}].strokes`);
      // the guest backgrounds the tab for 10 s while the host throws (first host throw after the guest has thrown)
      if (!events.background && owner === host && hole === 0 && n > 0) {
        events.background = true;
        await guest.eval(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'))})()`);
        await guest.send('Emulation.setFocusEmulationEnabled', { enabled: false }); await guest.send('Page.setWebLifecycleState', { state: 'frozen' });
        const tb = Date.now(); await host.wait(`__chains.G.phase==='aim'`, 'host aim'); await swipeThrow(host); await pause(Math.max(0, 10000 - (Date.now() - tb)));
        await guest.send('Page.setWebLifecycleState', { state: 'active' }); await guest.send('Emulation.setFocusEmulationEnabled', { enabled: true });
        await guest.eval(`(()=>{delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))})()`);
        await host.wait(`__chains.G.players[${cur}].strokes>=${strokes + 1}`, 'host throw lands', 60000);
        let ok = false; try { await guest.wait(`__chains.G.players[${cur}].strokes>=${strokes + 1}`, 'guest catches up', 30000); await settle(); ok = await agree('after background'); } catch (e) { log(e.message); }
        await guest.shot(join(out, `${relay ? 'relay-' : ''}1-guest-back-from-background.jpg`));
        check('Guest backgrounded 10 s while the host threw: back in sync on return', ok, `toast "${await guest.eval(`document.getElementById('toastTitle').textContent`)}"`);
        continue;
      }
      // the guest reloads mid-hole on its own turn, then taps Join again
      if (!events.reload && owner === guest && hole === Math.min(1, holes - 1) && strokes > 0) {
        events.reload = true; const tr = Date.now();
        await guest.send('Page.reload', {}); await pause(800); await guest.wait('!!window.__chains&&!!window.__chains.G', 'reboot', 120000);
        const booted = Date.now() - tr; await pause(600);
        const screen = await guest.eval(`(${visible('btnJoin')}?'join':${visible('menu')}?'menu':'other')+' · '+document.getElementById('onlineTitle').textContent+(__chains.G.net?' · rejoining by itself':'')`);
        await guest.shot(join(out, `${relay ? 'relay-' : ''}2-guest-after-reload.jpg`));
        if (!(await guest.eval('!!__chains.G.net')) && await guest.eval(visible('btnJoin'))) { await guest.eval(`document.getElementById('onlineName').value||='Phone'`); await tap(guest, '#btnJoin'); }
        let ok = false, back = 0; try { await guest.wait(`__chains.G.players.length===2&&['aim','windup'].includes(__chains.G.phase)&&!__chains.G.syncing`, 'back in the round', 60000); back = Date.now() - tr; await settle(); ok = await agree('after reload'); } catch (e) { log(e.message); }
        ids[1] = await guest.eval('__chains.G.net?.id()');
        check('Guest reloads mid-hole and gets back into the round with its scores', ok, `game booted ${(booted / 1000).toFixed(1)} s, back in the round ${(back / 1000).toFixed(1)} s, settled ${((Date.now() - tr) / 1000).toFixed(1)} s after the reload; the guest saw: ${screen}`);
        continue;
      }
      await playThrow();
    }
    await host.wait(`__chains.G.phase==='holeEnd'`, 'hole end', 30000); await guest.wait(`__chains.G.phase==='holeEnd'&&${visible('score')}`, 'guest scorecard', 30000);
    const cards = await Promise.all(all.map(p => p.eval(`document.getElementById('scoreTable').innerText.replace(/\\s+/g,' ').replace(/\\(you\\)/g,'')`)));
    check(`Hole ${hole + 1}: both scorecards match`, cards[0] === cards[1] && await agree('scorecard'), cards[0].slice(0, 120));
    if (hole === 0) for (const p of all) await p.shot(join(out, `${relay ? 'relay-' : ''}3-${p === host ? 'host' : 'guest'}-scorecard.jpg`));
    // a third player knocks once the round is under way
    if (!events.late && !relay) {
      events.late = true; late = await phone('Late phone', port + 1002, { width: 390, height: 844, dpr: 3, mobile: true, touch: true, ua: IPHONE_UA });
      await late.send('Page.navigate', { url: `${base}/?room=${code}&mute=1` }); await late.wait('!!window.__chains&&!!window.__chains.G', 'boot', 120000);
      await late.wait(visible('btnJoin'), 'Join'); await late.eval(`document.getElementById('onlineName').value='Late'`); await tap(late, '#btnJoin');
      let msg = ''; try { await late.wait(visible('onlineError'), 'a reason', 40000); msg = await late.eval(`document.getElementById('onlineError').textContent`); } catch {}
      await late.shot(join(out, '4-late-joiner.jpg'));
      check('A player arriving after the start is told why they cannot join', /started/.test(msg), msg);
      const lobby = await host.eval(`__chains.G.players.length`); check('The late knock leaves the round alone', lobby === 2, `${lobby} players`);
      late.browser.close(); late = null;
    }
    if (hole < holes - 1) { await tap(host, '#btnScoreNext'); for (const p of all) await p.wait(`__chains.G.holeIdx===${hole + 1}&&['intro','aim'].includes(__chains.G.phase)`, 'next hole', 60000); }
  }
  check('Every throw played on both screens with the same path, landing and scores', !disagreements, `${throws} throws, ${disagreements} disagreements`);
  check("The watcher sees each remote throw's windup, release and flight", !watchIssues.length, watchIssues.join('; '));
  // the host leaves: the guest is told and lands in the clubhouse
  await tap(host, '#btnScoreMenu'); await host.wait(`__chains.G.phase==='menu'`, 'host in the clubhouse');
  let toastText = ''; try { await guest.wait(`__chains.G.phase==='menu'`, 'guest sent home', 20000); toastText = await guest.eval(`document.getElementById('toastTitle').textContent+' · '+document.getElementById('toastSub').textContent`); } catch {}
  await guest.shot(join(out, `${relay ? 'relay-' : ''}5-guest-after-host-left.jpg`));
  check('When the host leaves the guest is told and returns to the clubhouse', /host left/i.test(toastText), toastText);
  for (const p of all) check(`${p.name}: no page errors`, !p.errors.length, p.errors.slice(0, 3).join(' | '));
} catch (e) {
  check('run', false, String(e.stack || e));
  for (const p of [host, guest].filter(Boolean)) { log(p.name, 'errors:', p.errors.slice(0, 5).join(' | '), '· screen:', await p.eval(`document.body.innerText.replace(/\\s+/g,' ').slice(0,240)`).catch(() => '?')); await p.shot(join(out, `${relay ? 'relay-' : ''}error-${p === host ? 'host' : 'guest'}.jpg`)).catch(() => {}); }
}
finally {
  for (const p of [host, guest, late].filter(Boolean)) try { p.browser.close(); } catch {}
  server.kill(); signal?.close(); await pause(300);
  console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
  process.exit(process.exitCode || 0);
}
