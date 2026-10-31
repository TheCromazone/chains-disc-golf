// Staged athlete close-ups on hole 1's tee: each round athlete (the hero, then the Solo bots Ricky and Paige) alone on the same
// spot in his aim stance, shot from four sides at full height and at the torso, in the sun and in
// shade (the key off: what a tree's shadow leaves him), plus the first bot's run-up through the game's own camera. Game time is
// frozen while the lens moves (tools/vclock.mjs), so each athlete stands in one pose for all of his shots and two builds draw
// the same frames. Staged shots are the canvas alone (no HUD), read in the task that drew them.
//   node tools/qa/athlete-closeup.mjs --out dir [--port 8480] [--size 390x844] [--dpr 3] [--quality low|high] [--mobile]
//                                     [--who 0,1,2] [--views 0,90,180,270] [--runup] [--seed 4] [--avatar '{"figure":"female"}']
// --avatar: the hero's locker overrides (players[0]), so either body can be shot in the other's palette.
// Writes <who>-<view>-<full|torso>-<sun|shade>.png per shot, runup-NN.jpg, and closeup.json (who wears which body, errors).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { launch, pause } from './cdp.mjs';
import { clock, settle } from '../vclock.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values: o } = parseArgs({ options: {
  out: { type: 'string', default: 'art/qa/closeup' }, port: { type: 'string', default: '8480' }, size: { type: 'string', default: '390x844' }, dpr: { type: 'string', default: '1' },
  quality: { type: 'string', default: 'low' }, mobile: { type: 'boolean', default: false }, who: { type: 'string', default: '0,1,2' }, views: { type: 'string', default: '0,90,180,270' },
  runup: { type: 'boolean', default: false }, seed: { type: 'string', default: '4' }, avatar: { type: 'string' },
} });
const [w, h] = o.size.split('x').map(Number), port = +o.port, out = resolve(ROOT, o.out);
mkdirSync(out, { recursive: true });
// a server left on the port would answer instead of ours (r4: a stale one served another checkout's code without a word)
if (await fetch(`http://localhost:${port}/`).then(() => true, () => false)) { console.error(`port ${port} is taken`); process.exit(2); }
const server = spawn(process.execPath, ['serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
process.once('exit', () => server.kill());
for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${port}/`)).ok) break; } catch {} await pause(100); }
const browser = await launch({ port: port + 1000 }), page = await browser.newPage(), js = e => page.eval(e), step = (ms, n = Math.max(1, Math.round(ms * .06))) => js(`__motion.step(${ms}, ${n})`);
const report = { size: o.size, dpr: +o.dpr, quality: o.quality, athletes: [], shots: [] };
try {
  await page.device({ width: w, height: h, dpr: +o.dpr, mobile: o.mobile, touch: o.mobile });
  await page.addInit(`try { localStorage.setItem('chains.coach', '["aim","throw","both"]'); } catch {}`);
  if (o.avatar) await page.addInit(`try { localStorage.setItem('chains.avatar', ${JSON.stringify(o.avatar)}); } catch {}`);
  await page.addInit(`(${clock})(${+o.seed})`);
  await page.goto(`http://localhost:${port}/`);
  await page.waitFor(`!!(window.__chains && __chains.course && __chains.hero)`, 120000);
  if (await js('__chains.G.settings.quality') !== o.quality) { await js(`document.querySelector('#qualSeg [data-v="${o.quality}"]').click()`); await page.waitFor(`__chains.course.quality === '${o.quality}' && __chains.G.settings.quality === '${o.quality}'`); }
  await settle(js); await step(1500);
  // Mobile: wait in the clubhouse (one frame at a time, real time between) until the full bodies are in, so every athlete is
  // built on his full body and none is swapped mid-round, where the swap's frame (and so his pose) followed the disk's speed
  for (let i = 0; i < 300 && await js('!!__chains.hero.lod'); i++) { await step(1000 / 60, 1); await pause(100); }
  await pause(1500);
  await js(`document.getElementById('btnSolo').click()`);
  for (let i = 0; i < 900 && await js(`__chains.G.phase !== 'intro'`); i++) await step(1000 / 60, 1);
  await js(`(() => { const c = __chains; while (c.G.phase === 'intro') { c.G.introT = 10; c.nextTurn(); } })()`); await step(1000);
  // Mobile's full bodies land after the round starts (models.js fullBodies); a turn change swaps them in (main.js upgradeBody)
  for (let i = 0; i < 60 && await js(`__chains.G.players.some(p => p.char.lod)`); i++) { await js(`__chains.setupTurn(0)`); await step(500); await pause(200); report.swaps = i + 1; }
  report.athletes = await js(`__chains.G.players.map(p => ({ name: p.name, figure: p.char.avatar.figure, lod: !!p.char.lod, jersey: p.char.avatar.jersey, style: p.char.avatar.jerseyStyle, accent: p.char.avatar.accent, skin: p.char.avatar.skin }))`);
  console.log(report.athletes);
  // page side: stage one athlete alone, frozen, and shoot the canvas from a lens around him
  await js(`window.__stage = (() => { const c = __chains, T = c.THREE, cam = c.camera, v = new T.Vector3(), f = new T.Vector3();
    const sun = []; c.scene.traverse(l => { if (l.isDirectionalLight && l.intensity > 0) sun.push([l, l.intensity]); });
    return { shot(i, view, frame, shade) {
      // views round the athlete's heading in degrees (the aim stance stands side-on to it: 90 is his chest, 270 his back)
      const p = c.G.players[i], g = p.char.group; g.updateMatrixWorld(true); g.getWorldDirection(f); f.y = 0; f.normalize();
      const r = new T.Vector3(-f.z, 0, f.x), a = +view * Math.PI / 180, d = frame === 'full' ? 4.2 : 1.7, y = frame === 'full' ? .95 : 1.3;
      const dir = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(r, Math.sin(a));
      g.getWorldPosition(v); const t = v.clone(); t.y += y; cam.position.copy(t).addScaledVector(dir, d); cam.position.y += frame === 'full' ? .25 : .15;
      cam.fov = 30; cam.updateProjectionMatrix(); cam.lookAt(t); cam.updateMatrixWorld(true);
      for (const [l, k] of sun) l.intensity = shade ? 0 : k;
      let url; for (let k = 0; k < 12; k++) { c.renderFrame(); if (k === 11) url = c.renderer.domElement.toDataURL('image/png'); }   // the held-frame resolve converges, as on a still lens
      for (const [l, k] of sun) l.intensity = k;
      return url; } }; })()`);
  const who = o.who.split(',').map(Number), views = o.views.split(',');
  for (const i of who) {
    await js(`(() => { const c = __chains, G = c.G; delete G.maxDt; G.players.forEach(p => { p.isBot = false; }); c.setupTurn(${i}); })()`); await step(1500);
    await js(`(() => { const c = __chains, G = c.G; G.maxDt = 1e-9; G.players.forEach((p, j) => { p.char.group.visible = j === ${i}; if (p.discMesh) p.discMesh.visible = j === ${i}; p.marker.visible = false; }); })()`);
    for (const view of views) for (const frame of ['full', 'torso']) for (const shade of [false, true]) {
      const url = await js(`__stage.shot(${i}, '${view}', '${frame}', ${shade})`), name = `${i}-${view}-${frame}-${shade ? 'shade' : 'sun'}.png`;
      writeFileSync(join(out, name), Buffer.from(url.split(',')[1], 'base64')); report.shots.push(name);
    }
    await js(`(() => { const G = __chains.G; G.players.forEach(p => { p.char.group.visible = true; }); delete G.maxDt; })()`);
  }
  console.log(`${report.shots.length} staged shots in ${out}`);
  if (o.runup) {   // the first bot's drive from the tee through the run-up camera (tools/qa/athlete-probe.mjs runup), every 4th frame
    // as in a round: the hero has thrown and stands at his lie down the fairway, Paige waits beside the pad
    await js(`(() => { const c = __chains, G = c.G, h = c.holes[G.holeIdx], b = h.basket, L = Math.hypot(b[0] - h.tee[0], b[1] - h.tee[1]), x = h.tee[0] + (b[0] - h.tee[0]) / L * 45, z = h.tee[1] + (b[1] - h.tee[1]) / L * 45;
      G.players.forEach((q, j) => { q.isBot = j > 0; q.lie = j ? [h.tee[0], h.teeY, h.tee[1]] : [x, c.world.height(x, z), z]; q.strokes = j ? 0 : 1; }); G.flight = G.pending = G.tween = null; c.setupTurn(1); __motion.reseed(${+o.seed * 1000 + 5}); })()`);
    for (let f = 0; f < 160; f++) {
      await step(1000 / 60, 1);
      if (f >= 40 && f % 4 === 0) await page.shot(join(out, `runup-${String(f).padStart(3, '0')}.jpg`), { quality: 90 });
      if (await js(`!!__chains.G.flight && __chains.G.flight.t > .5`)) break;
    }
  }
  report.errors = page.errors;
  writeFileSync(join(out, 'closeup.json'), JSON.stringify(report, null, 2));
  if (page.errors.length) console.log(page.errors.length + ' console error(s)', page.errors.slice(0, 3));
  browser.close(); process.exit(0);
} catch (e) {
  report.errors = page.errors; report.failure = String(e?.stack || e); writeFileSync(join(out, 'closeup.json'), JSON.stringify(report, null, 2));
  console.error('closeup failed:', e?.message || e); browser.close(); process.exit(1);
}
