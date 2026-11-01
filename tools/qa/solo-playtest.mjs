// A solo round on an emulated iPhone with real touch: taps through the menu and the flyovers, swipes every throw of the human to
// the power the shot guide suggests, and watches the bots throw in between. While anyone's disc is in the air it samples whether
// the disc is inside the frame and how far it is from the lens (the watcher's view against the thrower's), shoots the screen at
// set beats, and fails on any page error.
//   node tools/qa/solo-playtest.mjs [--port 8448] [--size 390x844] [--holes 3] [--course pine] [--out dir] [--root checkout]
//   (server on port, Chrome's debugging port on port + 1000)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, pause } from './cdp.mjs';

const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const port = +arg('--port', 8448), [w, h] = arg('--size', '390x844').split('x').map(Number), holes = +arg('--holes', 3), course = arg('--course', 'pine');
const root = resolve(import.meta.dirname, '../..'), served = resolve(arg('--root', root)), out = resolve(arg('--out', join(root, 'docs/qa/solo-playtest'))); mkdirSync(out, { recursive: true });
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const server = spawn(process.execPath, ['serve.mjs'], { cwd: served, env: { ...process.env, PORT: '' + port }, stdio: 'ignore' });
process.once('exit', () => { try { server.kill(); } catch {} });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(130));
const T0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s]`, ...a);
const SWIPE = { backhand: [1, 0], backhand_io: [1, 0], backhand_oi: [1, 0], forehand: [-1, 0], forehand_io: [-1, 0], forehand_oi: [-1, 0], putt: [0, -1], tomahawk: [0, 1], blade: [-.7071, .7071], hammer: [.7071, .7071], scoober: [-.7071, -.7071] };
// while a disc is in the air: [thrower is a bot, disc in frame, metres from the lens]
const TRACE = `(()=>{window.__fly=[];clearInterval(window.__flyT);window.__flyT=setInterval(()=>{const c=__chains,g=c.G,f=g.flight;if(!f?.pos||f.events.slice(0,f.ei).some(e=>/^(land|skip|roll|flop|splash|chains|drop)$/.test(e[1])))return;
  const v=new c.THREE.Vector3(...f.pos),d=v.distanceTo(c.camera.position);c.camera.updateMatrixWorld();v.project(c.camera);__fly.push([g.players[f.pi].isBot?1:0,v.z<1&&Math.abs(v.x)<.95&&Math.abs(v.y)<.95?1:0,Math.round(d*10)/10])},30)})()`;

let b, p, ok = true;
try {
  for (let i = 0; i < 100 && !(await fetch(`http://localhost:${port}/`).then(r => r.ok, () => false)); i++) await pause(200);
  b = await launch({ port: port + 1000 }); p = await b.newPage();
  await p.device({ width: w, height: h, dpr: 3, mobile: true, touch: true, ua: IPHONE_UA });
  await p.addInit(`try { localStorage.setItem('chains.course', ${JSON.stringify(course)}); } catch {}`);
  await p.goto(`http://localhost:${port}/?mute=1`); await p.waitFor('!!window.__chains && !!__chains.course && !!__chains.hero', 120000); await pause(2500);
  const tap = async sel => { for (let k = 0, last = ''; k < 30; k++) { const r = await p.eval(`(()=>{const b=document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect();return b?[b.x,b.y,b.width].map(Math.round).join():''})()`); if (r && r === last) break; last = r; await pause(120); } return p.tapSel(sel); };
  await p.eval(`document.querySelector('#holesSeg [data-v="${holes}"]')?.click(); 1`);
  await tap('#btnSolo'); log('Solo tapped');
  await p.eval(TRACE);
  let throws = 0, botThrows = 0, last = '', shots = 0, hole = -1, lastShot = 0;
  const shoot = async name => { await p.shot(join(out, `${String(++shots).padStart(3, '0')}-${name}.jpg`)); };
  for (let guard = 0; guard < 4000; guard++) {
    const s = await p.eval(`(()=>{const g=__chains.G,c=g.players[g.cur];return {ph:g.phase,hole:g.holeIdx,cur:g.cur,bot:!!c?.isBot,mine:!!c&&!c.isBot,tw:g.throwType,dist:c?.lieDist,score:!document.getElementById('score').classList.contains('hidden'),final:!!document.querySelector('#score.final, #score [data-final]')||document.getElementById('btnScoreNext')?.textContent?.match(/again|menu|done/i)!=null,flight:!!g.flight}})()`);
    const key = `${s.hole}:${s.ph}:${s.cur}`; if (key !== last) { last = key; if (s.hole !== hole) { hole = s.hole; log(`hole ${hole + 1}`); } }
    if (s.ph === 'intro') { await pause(900); await p.tap(w / 2, h * .4); await pause(400); continue; }   // tap to skip the flyover
    if (s.ph === 'aim' && s.mine) {
      await pause(700); await p.eval(`__chains.G.previewPower`); await shoot(`h${hole + 1}-aim-${s.tw}-${Math.round(s.dist)}m`);
      const sw = await p.eval(`(()=>{const g=__chains.G,r=document.getElementById('pad').getBoundingClientRect();return {type:g.throwType,power:g.previewPower,pad:[r.x,r.y,r.width,r.height]}})()`);
      const dir = SWIPE[sw.type] || [1, 0], target = Math.max(.18, Math.min(1, (sw.power ?? .6) * (sw.type === 'putt' ? 1.04 : 1)));
      const [x, y, pw, ph] = sw.pad, x0 = x + pw * (dir[0] > 0 ? .2 : dir[0] < 0 ? .8 : .5), y0 = y + ph * (dir[1] < 0 ? .62 : dir[1] > 0 ? .15 : .55);
      await p.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] }); let k = 0;
      for (; k < 220; k++) { await pause(6); await p.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dir[0] * 4 * k, y: y0 + dir[1] * 4 * k }] }); if (k % 2 === 0 && await p.eval('__chains.G.gesture.power') >= target) break; }
      await p.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); throws++;
      await pause(300); if (await p.eval(`__chains.G.phase==='aim'`)) log(`swipe did not throw (${sw.type})`);
      continue;
    }
    if (s.flight && Date.now() - lastShot > 700) { lastShot = Date.now(); await shoot(`h${hole + 1}-${s.bot ? 'watch' : 'own'}-flight`); }
    if (s.ph === 'windup' && s.bot && Date.now() - lastShot > 1500) { lastShot = Date.now(); botThrows++; await shoot(`h${hole + 1}-watch-runup`); }
    if (s.ph === 'result') { await pause(800); await p.tap(w / 2, h * .35); await pause(300); continue; }   // tap: the verdict short
    if (s.ph === 'holeEnd' && s.score) {
      await pause(900); await shoot(`h${hole + 1}-scorecard`);
      if (hole >= holes - 1) { log('final scorecard'); break; }
      await tap('#btnScoreNext'); await pause(800); continue;
    }
    await pause(120);
  }
  const fly = await p.eval(`(()=>{clearInterval(window.__flyT);return window.__fly})()`);
  const stat = bot => { const f = fly.filter(x => x[0] === bot), d = f.map(x => x[2]).sort((a, c) => a - c); return f.length ? `disc in frame ${Math.round(100 * f.filter(x => x[1]).length / f.length)}% of ${f.length} samples, ${d[d.length >> 1]} m from the lens (median), ${Math.round(100 * d.filter(x => x > 12).length / f.length)}% over 12 m` : 'none'; };
  log(`your throws: ${throws}; the bots' flights watched: ${stat(1)}; your own flights: ${stat(0)}`);
  const scores = await p.eval(`JSON.stringify(__chains.G.players.map(q=>[q.name,q.scores.join('/')]))`); log('scores', scores);
  ok = !p.errors.length; log(ok ? 'PASS no page errors' : `FAIL page errors: ${p.errors.slice(0, 5).join(' | ')}`);
} catch (e) { ok = false; log('FAIL', e.stack || e); if (p) await p.shot(join(out, 'error.jpg')).catch(() => {}); }
finally { try { b?.close(); } catch {} server.kill(); await pause(300); process.exit(ok ? 0 : 1); }
