// Invite matches end to end in real headless Chrome: two players on separate "phones" (isolated browser contexts, so separate
// storage like two devices) create, join by link, take turns hole by hole, and finish a 3-hole match through the real UI and
// the real API (serve.mjs runs api/match.js with file storage). Throws are real physics; to keep it quick each turn's lie is
// moved next to the basket first and a putt that holes is found with the game's own simulator.
//   node tools/verify-matches.mjs [--url https://chains-disc-golf.vercel.app] [--share <_vercel_share token for a protected preview>]   (CHROME=/path/to/chrome)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CHROME } from './chrome-path.mjs';

const root = resolve(import.meta.dirname, '..'), port = 8180, dbg = 9180;
const arg = k => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null;
const external = arg('--url'), share = arg('--share'), base = external || `http://localhost:${port}`;
let cookie = '';   // a protected preview: the share link's auth cookie, for the runner's own API reads
const data = mkdtempSync(join(tmpdir(), 'chains-matches-')), profile = mkdtempSync(join(tmpdir(), 'chains-mchrome-'));
const out = join(root, 'docs/qa/matches'); mkdirSync(out, { recursive: true });
const server = external ? null : spawn(process.execPath, ['serve.mjs', '--dist'], { cwd: root, env: { ...process.env, PORT: '' + port, CHAINS_DATA_DIR: data }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
const pause = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, label, ms = 45000) => { for (const t = Date.now(); Date.now() - t < ms; await pause(150)) if (await fn()) return; throw new Error('Timed out: ' + label); };
const errors = [], report = { url: base, checks: [] };
const pass = name => { report.checks.push(name); console.log('PASS', name); };
let bsend;

async function phone(name) {
  const { browserContextId } = await bsend('Target.createBrowserContext', {});
  const { targetId } = await bsend('Target.createTarget', { url: 'about:blank', browserContextId });
  const t = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find(x => x.id === targetId);
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let seq = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(Error(m.error.message)) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(`${name}: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`${name}: ${m.params.args.map(a => a.value || a.description).join(' ')}`); };
  const send = (method, params = {}) => new Promise((res, rej) => { pend.set(++seq, { res, rej }); ws.send(JSON.stringify({ id: seq, method, params })); });
  const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const p = { name, js, send, wait: (expr, label, ms) => until(() => js(expr).catch(() => false), label || expr, ms),
    async open(path = '/') { if (share) { await send('Page.navigate', { url: `${base}/?_vercel_share=${share}` }); await pause(2500); } await send('Page.navigate', { url: base + path }); await p.wait('!!window.__chains', 'game boot', 90000); },
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); writeFileSync(join(out, file + '.jpg'), Buffer.from(r.data, 'base64')); },
    visible: id => js(`!document.getElementById('${id}').classList.contains('hidden') && !document.getElementById('${id}').closest('.hidden')`),
    text: id => js(`document.getElementById('${id}').textContent`) };
  return p;
}
// Play the current turn's hole: wait for aim, move the lie beside the basket, find a putt that holes, throw it, wait for the scorecard.
async function playHole(p) {
  await p.wait(`__chains.G.mode==='async' && __chains.G.phase==='aim' && __chains.G.cur===0`, `${p.name} aims`);
  await p.js(`(()=>{const c=__chains,g=c.G,h=c.holes[g.holeIdx],dx=h.tee[0]-h.basket[0],dz=h.tee[1]-h.basket[1],l=Math.hypot(dx,dz),x=h.basket[0]+dx/l*4.5,z=h.basket[1]+dz/l*4.5,p=g.players[0];p.lie=[x,c.world.height(x,z),z];p.lieDist=4.5;c.setupTurn(0)})()`);
  const params = await p.js(`(()=>{const c=__chains,g=c.G,p=g.players[0],b=c.world.basket,dx=b.x-p.lie[0],dz=b.z-p.lie[2],l=Math.hypot(dx,dz),dir=[dx/l,dz/l];for(let power=.25;power<=1;power+=.015)for(const yawOffset of [0,-4,4,-8,8])for(const launchOffset of [0,8,16,-6]){const q={throwType:'putt',discId:'putter',dir,pos:[p.lie[0]+dir[0]*.4,c.world.height(p.lie[0],p.lie[2])+1.15,p.lie[2]+dir[1]*.4],power,hyzer:0,yawOffset,launchOffset,lefty:false};if(c.runSim(q).result.holed)return q;}return null})()`);
  assert(params, 'a holing putt exists');
  await p.js(`__chains.doThrow(0, ${JSON.stringify(params)})`);
  await p.wait(`!document.getElementById('matchView').classList.contains('hidden') && !document.getElementById('matches').classList.contains('hidden') && !document.getElementById('matchView').dataset.busy && document.getElementById('matchTitle').textContent !== 'Saving your score…'`, `${p.name} back on the match card, score saved`, 30000);
}
const apiState = async id => (await (await fetch(`${base}/api/match?id=${id}`, { headers: cookie ? { cookie } : {} })).json()).match;

try {
  if (share) { const r = await fetch(`${base}/?_vercel_share=${share}`, { redirect: 'manual' }); cookie = (r.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; '); assert(cookie, 'share link sets a cookie'); }
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${dbg}/json/version`)).ok; } catch { return false; } }, 'Chrome');
  const ver = await (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json(); const bws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise(r => bws.onopen = r);
  let bid = 0; const bp = new Map(); bws.onmessage = e => { const m = JSON.parse(e.data); bp.get(m.id)?.(m.result); };
  bsend = (method, params) => new Promise(r => { bp.set(++bid, r); bws.send(JSON.stringify({ id: bid, method, params })); });

  const host = await phone('Matt'); await host.open('/');
  await host.js(`(()=>{const g=__chains.G;g.avatar.name='Matt';g.settings.holes='3';document.getElementById('btnOnline').click()})()`);
  await host.wait(`!document.getElementById('matchHome').classList.contains('hidden')`, 'invite home');
  await host.js(`document.getElementById('btnMatchNew').click()`);
  await host.wait(`!!localStorage.getItem('chains.seats') && !document.getElementById('matchView').classList.contains('hidden') && document.getElementById('matchTitle').textContent==='Your turn'`, 'new match, host up');
  const id = await host.js(`Object.keys(JSON.parse(localStorage.getItem('chains.seats')))[0]`);
  assert.match(id, /^[A-HJ-NP-Z2-9]{8}$/); await host.shot('1-new-match'); pass(`Host creates a 3-hole invite match (${id}) and is up first`);

  await host.js(`document.getElementById('btnMatchPlay').click()`);
  await playHole(host);
  let m = await apiState(id); assert.deepEqual(m.players[0].scores, [1]); await host.shot('2-after-hole-1');
  pass('Host plays hole 1 in 3D; the score lands on the server');

  const guest = await phone('Alex'); await guest.open(`/?match=${id}`);
  await guest.wait(`!document.getElementById('matchJoin').classList.contains('hidden') && /invited you/.test(document.getElementById('matchJoinTitle').textContent)`, 'invite screen');
  await guest.shot('3-invite'); await guest.js(`document.getElementById('matchName').value='Alex';document.getElementById('btnMatchJoin').click()`);
  await guest.wait(`!document.getElementById('matchView').classList.contains('hidden') && document.querySelectorAll('#matchTable tr').length===3`, 'guest joined');
  assert.equal(await guest.js(`location.search`), '', 'the invite link is cleared from the address bar');
  pass('Guest opens the invite link on another phone and joins by name');

  await host.wait(`document.getElementById('matchTitle').textContent==='Your turn'`, 'host still up (a join never steals the turn)');
  await host.js(`document.getElementById('btnMatchPlay').click()`); await playHole(host);
  m = await apiState(id); assert.equal(m.players.find(p => p.id === m.turn.pid).name, 'Alex');
  await guest.wait(`document.getElementById('matchTitle').textContent==='Your turn'`, 'guest sees it is their turn (polling)', 20000);
  pass("After the host's next hole the turn passes to the late joiner, who sees it without reloading");

  for (let h = 0; h < 2; h++) { await guest.js(`document.getElementById('btnMatchPlay').click()`); await playHole(guest); }
  m = await apiState(id); assert.deepEqual(m.players.map(p => p.scores.length), [2, 2]); assert.equal(m.players.find(p => p.id === m.turn.pid).name, 'Matt');
  pass('The late joiner catches up holes 1 and 2 back to back, then the turn returns to the host');

  await host.wait(`document.getElementById('matchTitle').textContent==='Your turn'`, 'host up for hole 3', 20000);
  await host.js(`document.getElementById('btnMatchPlay').click()`); await playHole(host);
  await guest.wait(`document.getElementById('matchTitle').textContent==='Your turn'`, 'guest up for hole 3', 20000);
  await guest.js(`document.getElementById('btnMatchPlay').click()`); await playHole(guest);
  m = await apiState(id); assert.equal(m.finished, true); assert.deepEqual(m.players.map(p => p.scores), [[1, 1, 1], [1, 1, 1]]);
  await guest.wait(`document.getElementById('matchTitle').textContent==='Final results'`, 'final results');
  await host.wait(`document.getElementById('matchTitle').textContent==='Final results'`, 'host sees final', 20000);
  await guest.shot('4-final'); pass('Both finish hole 3: the match is final on both phones with identical scorecards');

  await host.js(`document.getElementById('btnMatchBack').click()`);
  await host.wait(`document.querySelectorAll('#matchList .match-item').length===1 && /Final/.test(document.querySelector('#matchList .match-item').textContent)`, 'match list');
  pass('The match list shows the finished match');
  assert.deepEqual(errors, [], errors.join('\n')); pass('No browser errors on either phone');
  report.passed = true;
} catch (e) { report.passed = false; report.failure = String(e.stack || e); console.error(report.failure); console.error(errors.join('\n')); process.exitCode = 1; }
finally {
  writeFileSync(join(out, external ? 'live-results.json' : 'results.json'), JSON.stringify({ ...report, errors }, null, 2));
  chrome.kill(); server?.kill();
  for (const d of [data, profile]) if (d.startsWith(tmpdir())) try { rmSync(d, { recursive: true, force: true }); } catch {}
  process.exit(process.exitCode || 0);
}
