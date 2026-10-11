// Aim camera vs. trunks, tents and banners: the iPhone QA lie (Lakeshore Links hole 1, an 11.8 m putt with a birch behind the
// rig's shoulder and a feather flag ahead) must move the rig off its spot with the athlete in view, and across every course the
// rig must keep its own spot on the great majority of lies (a frame that swaps shoulders for nothing is worse than the bug).
//   node tools/verify-aimcam.mjs [--url https://chains-disc-golf.vercel.app]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { launch } from './qa/cdp.mjs';

const root = resolve(import.meta.dirname, '..'), port = 8195;
const external = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null, base = external || `http://localhost:${port}`;
const server = external ? null : spawn(process.execPath, ['serve.mjs'], { cwd: root, env: { ...process.env, PORT: '' + port }, stdio: 'ignore' });
const b = await launch({ port: 9195 });
try {
  const p = await b.newPage(); await p.device({ width: 402, height: 874, dpr: 1, mobile: true, touch: true });
  await p.goto(base + '/?mute=1'); await p.waitFor('window.__chains && __chains.G.phase==="menu"', 120000);
  await p.eval(`(async()=>{const c=__chains;await c.loadCourse('lake');await c.startGame({mode:'solo',courseId:'lake',holeCount:3,players:[{name:'Matt'}]})})()`);
  await p.waitFor(`['intro','aim'].includes(__chains.G.phase)`, 90000); await p.eval('__chains.G.introT=99'); await p.waitFor(`__chains.G.phase==='aim'`, 30000);
  await p.eval(`(()=>{const c=__chains,p=c.G.players[0];p.lie=[-193.29,0.19,-48.06];p.strokes=1;c.setupTurn(0);c.cam.snap=true})()`);
  await p.waitFor('__chains.aimSpot.key.includes("|-193.3|")', 10000);
  await new Promise(r => setTimeout(r, 1500)); const qa = await p.eval(`(()=>{const c=__chains,cp=c.camera.position,g=c.G.players[0].char.group.position;return {k:c.aimSpot.k,scores:c.aimSpot.scores,dist:cp.distanceTo(g)}})()`); console.log(JSON.stringify(qa));
  assert.notEqual(qa.k, 0, 'the QA putt moves off the rig spot behind the birch');
  assert.ok(qa.dist > 1.5 && qa.dist < 3.6, `the lens stays a putt's distance from the athlete (${qa.dist.toFixed(2)} m)`);
  console.log(`PASS QA lie: spot ${qa.k}, ${qa.dist.toFixed(2)} m from the athlete`);
  for (const id of ['pine', 'meadow', 'lake', 'bluff']) {
    const s = await p.eval(`(async()=>{const c=__chains;await c.loadCourse('${id}');const W=c.world;let lies=0,moved=0;
      for(let hi=0;hi<c.holes.length;hi++){c.G.holeIdx=hi;const h=c.holes[hi],L=Math.hypot(h.basket[0]-h.tee[0],h.basket[1]-h.tee[1]);
        for(const f of [.1,.3,.5,.7,.85,.95])for(const lat of [-6,0,6]){const x=h.tee[0]+(h.basket[0]-h.tee[0])*f-(h.basket[1]-h.tee[1])/L*lat,z=h.tee[1]+(h.basket[1]-h.tee[1])*f+(h.basket[0]-h.tee[0])/L*lat;
          if(W.inWater(x,z))continue;const lie={x,y:W.height(x,z),z},putt=Math.hypot(h.basket[0]-x,h.basket[1]-z)<15;
          for(const [P,hw] of [[putt?c.AIM.putt:c.AIM.drive,.42],[putt?c.AIM.tall.putt:c.AIM.tall.drive,.24]]){c.aimSpot.key='';lies++;if(c.aimSpotFor(lie,P,P.side,putt,hw))moved++}}}
      return {lies,moved}})()`, 180000);
    assert.ok(s.moved / s.lies < .1, `${id}: the rig keeps its spot on 90%+ of lies (${s.moved}/${s.lies} moved)`);
    console.log(`PASS ${id}: ${s.moved} of ${s.lies} lies move the rig`);
  }
  assert.deepEqual(p.errors || [], [], 'no page errors');
  console.log('PASS no page errors');
} catch (e) { console.error(String(e.stack || e)); process.exitCode = 1; }
finally { b.close(); server?.kill(); process.exit(process.exitCode || 0); }
