// Whole rounds, every course: real headless Chrome plays 3-hole solo rounds on each course with every seat handed to the
// bot planner (so the real physics, turn order, OB, holing, pick-up and scorecards run end to end), and checks each round
// reaches its final scorecard with a score for every player on every hole and no browser errors or stuck turns.
//   node tools/verify-rounds.mjs [--url https://chains-disc-golf.vercel.app] [--courses pine,meadow,lake,gull] [--holes 3] [--quality low|high] [--order away|through]
// With --order through ("All at once") it also checks each player's throws on a hole come in one unbroken run.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CHROME } from './chrome-path.mjs';

const root = resolve(import.meta.dirname, '..'), port = 8190, dbg = 9190;
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const external = arg('--url', null), base = external || `http://localhost:${port}`, courses = arg('--courses', 'pine,meadow,lake,bluff').split(','), holes = arg('--holes', '3'), quality = arg('--quality', 'low'), order = arg('--order', 'away');
const profile = mkdtempSync(join(tmpdir(), 'chains-rounds-'));
const server = external ? null : spawn(process.execPath, ['serve.mjs', '--dist'], { cwd: root, env: { ...process.env, PORT: '' + port }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${dbg}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' });
const pause = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${dbg}/json/version`)).ok) break; } catch {} await pause(150); }
  const tab = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let seq = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(Error(m.error.message)) : p.res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params = {}) => new Promise((res, rej) => { pend.set(++seq, { res, rej }); ws.send(JSON.stringify({ id: seq, method, params })); });
  const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + '/' });
  for (let t = Date.now(); !(await js('!!window.__chains').catch(() => false)); await pause(300)) if (Date.now() - t > 90000) throw Error('boot timeout');
  if (quality !== (await js('__chains.G.settings.quality'))) { await js(`document.querySelector('#qualSeg [data-v="${quality}"]').click()`); await pause(4000); }
  await js(`document.querySelector('#orderSeg [data-v="${order}"]').click()`);
  // every turn as it is set up: hole, thrower and the throw number, deduplicated
  await js(`window.__turns=[];setInterval(()=>{const g=__chains.G,p=g.players[g.cur];if(!p||!['aim','windup'].includes(g.phase))return;const k=g.holeIdx+':'+g.cur+':'+p.strokes;if(__turns.at(-1)!==k)__turns.push(k)},40)`);
  for (const id of courses) {
    const t0 = Date.now();
    await js(`__turns.length=0`);
    await js(`(async()=>{const c=__chains;c.G.settings.holes='${holes}';await c.loadCourse('${id}');document.getElementById('btnSolo').click()})()`);
    // hand the human seat to the planner as soon as the round exists
    for (let t = Date.now(); !(await js(`__chains.G.players.length===3`)); await pause(200)) if (Date.now() - t > 60000) throw Error(`${id}: round did not start`);
    await js(`(()=>{const p=__chains.G.players[0];p.isBot=true;p.difficulty='medium'})()`);
    let last = '', still = Date.now(), finals = false;
    while (!finals) {
      const st = await js(`(()=>{const g=__chains.G;return {phase:g.phase,hole:g.holeIdx,cur:g.cur,strokes:g.players.map(p=>p.strokes).join(','),final:!document.getElementById('score').classList.contains('hidden')&&/Final/.test(document.getElementById('scoreTitle').textContent)}})()`);
      const key = JSON.stringify(st);
      if (key !== last) { last = key; still = Date.now(); }
      if (st.phase === 'aim' && st.cur === 0 && Date.now() - still > 4000) { await js(`__chains.nextTurn()`); still = Date.now(); }   // the human seat was set up before it became a bot: hand it over once
      if (st.final) { finals = true; break; }
      if (st.phase === 'holeEnd') await js(`document.getElementById('btnScoreNext').click()`);
      if (Date.now() - still > 45000) throw Error(`${id}: stuck at ${key}`);
      await pause(400);
    }
    const cards = await js(`__chains.G.players.map(p=>({name:p.name,scores:p.scores.slice(0,${holes})}))`);
    for (const c of cards) assert.equal(c.scores.filter(s => Number.isInteger(s) && s >= 1).length, +holes, `${id}: ${c.name} has a score on every hole`);
    const turns = (await js('__turns')).map(k => k.split(':').map(Number)), runs = [];
    for (const [h, c] of turns) if (!runs.length || runs.at(-1)[0] !== h || runs.at(-1)[1] !== c) runs.push([h, c]);
    const broken = runs.filter(([h, c], i) => runs.findIndex(([h2, c2]) => h2 === h && c2 === c) !== i).length;   // a player who comes back to a hole after someone else threw
    assert.equal(order, await js('__chains.G.order'), `${id}: the round plays in ${order} order`);
    if (order === 'through') assert.equal(broken, 0, `${id}: each player plays out the hole in one run (${runs.map(r => r.join(':')).join(' ')})`);
    console.log(`  ${order} order: ${turns.length} turns, ${broken} returns to a hole after another player threw`);
    console.log(`PASS ${id}: ${holes} holes in ${Math.round((Date.now() - t0) / 1000)} s — ${cards.map(c => `${c.name} ${c.scores.join('-')}`).join(', ')}`);
    await js(`document.getElementById('btnScoreMenu').click()`); await pause(1500);
  }
  assert.deepEqual(errors, [], errors.join('\n')); console.log('PASS no browser errors');
} catch (e) { console.error(String(e.stack || e)); console.error(errors.slice(0, 10).join('\n')); process.exitCode = 1; }
finally { chrome.kill(); server?.kill(); if (profile.startsWith(tmpdir())) try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(process.exitCode || 0); }
