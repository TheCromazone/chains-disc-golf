// Fair-play check for a course layout: the game's own medium bot (src/bot.js, the real physics and its execution error)
// plays every hole N times in a headless page, nothing rendered, wind calm. Math.random is seeded per hole and run, so two
// layouts compared run for run throw identically until a tree changes a flight. Prints, per hole and for the course:
// mean strokes against par, tee shots that touch a tree, tee shots resting on the fairway, throws that touch a tree, OB.
//   node tools/qa/fairness.mjs <pine|meadow|lake|bluff> [--runs 40] [--port 8460] [--json out.json]
import { launch, pause } from './cdp.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2), course = args[0] || 'pine', opt = (k, d) => args.includes(k) ? args[args.indexOf(k) + 1] : d;
const runs = +opt('--runs', 40), port = +opt('--port', 8460), out = opt('--json', null);
const server = spawn(process.execPath, ['serve.mjs'], { cwd: resolve(import.meta.dirname, '../..'), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const b = await launch({ port: port + 1000 }), page = await b.newPage(), url = `http://localhost:${port}/?mute=1`;
try {
  await pause(800); await page.device({ width: 640, height: 360 });
  await page.goto(url); await page.eval(`localStorage.setItem('chains.course', '${course}')`); await page.goto(url);
  await page.waitFor('!!window.__chains && !!__chains.course && !!__chains.holes', 120000);
  const res = await page.eval(`(async () => {
    const { planBotThrow } = await import('/src/bot.js'), { simulate, discById, releasePos } = await import('/src/physics.js');
    const C = __chains, world = C.world, holes = C.holes, real = Math.random; let seed = 1;
    Math.random = () => (seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296;
    const calm = [0, 0]; Object.defineProperty(world, 'wind', { get: () => calm, set: () => {}, configurable: true });
    const rows = [];
    for (const [i, h] of holes.entries()) {
      C.course.setHole(i);
      const row = { hole: i + 1, par: h.par, strokes: 0, teeTree: 0, teeFair: 0, throws: 0, tree: 0, ob: 0 };
      for (let run = 0; run < ${runs}; run++) {
        seed = (i + 1) * 7919 + run * 104729 + 1;
        let pos = [h.tee[0], world.height(h.tee[0], h.tee[1]), h.tee[1]], n = 0;
        for (;;) {
          const plan = await planBotThrow({ pos, world, difficulty: 'medium' }), dir = plan.dir;
          const sim = simulate({ throwType: plan.throwType, disc: discById(plan.discId), power: plan.power, hyzer: plan.hyzer, yawOffset: plan.yawOffset, launchOffset: 0, dir, pos: releasePos(world, pos, dir), lefty: false }, world);
          const r = sim.result, hit = sim.state.events.some(e => e === 'tree' || e === 'branch');
          if (n === 0) { row.teeTree += hit; row.teeFair += !r.ob && !r.holed && world.rough(r.rest[0], r.rest[2]) < .5; }
          n++; row.throws++; row.tree += hit;
          if (r.holed) break;
          if (r.ob) { n++; row.ob++; pos = r.lie; } else pos = r.rest;
          if (n >= h.par + 5) { n = h.par + 6; break; }
        }
        row.strokes += n;
      }
      rows.push(row);
    }
    Math.random = real; delete world.wind;
    return rows;
  })()`, 3600000);
  const pct = (a, n) => (100 * a / n).toFixed(0).padStart(3) + '%', tot = { par: 0, strokes: 0, teeTree: 0, teeFair: 0, throws: 0, tree: 0, ob: 0 };
  console.log(`${course}, ${runs} medium-bot plays a hole, calm\nhole par  mean  tee:tree fairway  throws:tree  OB`);
  for (const r of res) { for (const k in tot) tot[k] += r[k] * (k === 'par' ? runs : 1);
    console.log(`${String(r.hole).padStart(4)} ${String(r.par).padStart(3)} ${(r.strokes / runs).toFixed(2).padStart(5)}      ${pct(r.teeTree, runs)}    ${pct(r.teeFair, runs)}         ${pct(r.tree, r.throws)} ${String(r.ob).padStart(3)}`); }
  const n = runs * res.length;
  console.log(` all ${(tot.par / n).toFixed(2)} ${(tot.strokes / n).toFixed(2).padStart(5)}      ${pct(tot.teeTree, n)}    ${pct(tot.teeFair, n)}         ${pct(tot.tree, tot.throws)} ${String(tot.ob).padStart(3)}   (over par per hole ${((tot.strokes - tot.par) / n).toFixed(2)})`);
  if (out) writeFileSync(out, JSON.stringify({ course, runs, holes: res }, null, 2));
  if (page.errors.length) console.log('errors', page.errors);
} finally { await page.close(); b.close(); server.kill(); }
