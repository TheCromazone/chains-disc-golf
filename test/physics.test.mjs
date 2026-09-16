// Run: node test/physics.test.mjs
import assert from 'node:assert/strict';
import { simulate, flatWorld, discById, THROWS } from '../src/physics.js';

const w = flatWorld({ x: 0, y: 0, z: -100 });
const throwIt = (o) => simulate({ pos: [0, 1.2, 0], dir: [0, -1], power: 1, throwType: 'backhand', disc: discById('driver'), ...o }, w, { record: true }).result;

// Full-power backhand driver: long, fades left (RHBH => -x).
const drive = throwIt({});
console.log('driver', drive.thrown.toFixed(1), 'm, rest x', drive.rest[0].toFixed(1), 'maxH', drive.maxH.toFixed(1), 'air', drive.airTime.toFixed(1));
assert(drive.thrown > 90 && drive.thrown < 150, `driver range ${drive.thrown}`);
assert(drive.rest[0] < -2, 'RHBH driver should fade left');

// Forehand mirrors the fade.
const fh = throwIt({ throwType: 'forehand' });
console.log('forehand', fh.thrown.toFixed(1), 'm, rest x', fh.rest[0].toFixed(1));
assert(fh.rest[0] > 2, 'RHFH should fade right');

// A left-hander's backhand is the righty's mirror image: same distance, fade to the other side.
const lh = throwIt({ lefty: true });
console.log('lefty backhand', lh.thrown.toFixed(1), 'm, rest x', lh.rest[0].toFixed(1));
assert(Math.abs(lh.rest[0] + drive.rest[0]) < 0.5 && Math.abs(lh.thrown - drive.thrown) < 0.5, 'LHBH should mirror RHBH');

// Inside-out and outside-in presets bend the same motion to opposite sides of a flat release.
const io = throwIt({ throwType: 'backhand_io' }), oi = throwIt({ throwType: 'backhand_oi' });
console.log('backhand io / oi rest x', io.rest[0].toFixed(1), '/', oi.rest[0].toFixed(1));
assert(io.rest[0] < drive.rest[0] - 3, 'IO backhand should finish further left than flat');
assert(oi.rest[0] > drive.rest[0] + 3, 'OI backhand should finish right of flat');

// A blade knifes: shorter than a forehand and curving hard, never a long glide.
const blade = throwIt({ throwType: 'blade' });
console.log('blade', blade.thrown.toFixed(1), 'm, rest x', blade.rest[0].toFixed(1), 'maxH', blade.maxH.toFixed(1));
assert(blade.thrown > 15 && blade.thrown < fh.thrown, `blade range ${blade.thrown}`);
assert(Math.abs(blade.rest[0]) > 6, 'blade should curve hard');

// Half power putter goes much shorter than a driver.
const short = throwIt({ throwType: 'putt', disc: discById('putter'), power: 0.5 });
console.log('half putt', short.thrown.toFixed(1), 'm');
assert(short.thrown > 3 && short.thrown < 12, `putt range ${short.thrown}`);

// A putt from 6 m straight at the basket should hole out (basket at -6, pole at 0.78..1.3m chains).
const wp = flatWorld({ x: 0, y: 0, z: -6 });
let holedAny = false, best = 99;
for (let p = 0.3; p <= 0.8; p += 0.05) {
  const r = simulate({ pos: [0, 1.0, 0], dir: [0, -1], power: p, throwType: 'putt', disc: discById('putter') }, wp).result;
  best = Math.min(best, r.dist);
  if (r.holed) { holedAny = true; console.log('putt holed at power', p.toFixed(2)); break; }
}
assert(holedAny, `no putt holed, best dist ${best}`);

// Turn: a full power midrange (turn -1) should move right first (RHBH), then fade left.
const mid = simulate({ pos: [0, 1.2, 0], dir: [0, -1], power: 1, throwType: 'backhand', disc: discById('mid') }, w, { record: true });
const xs = mid.traj.map(p => p[0]);
console.log('mid max right', Math.max(...xs).toFixed(1), 'final x', xs.at(-1).toFixed(1), 'thrown', mid.result.thrown.toFixed(1));
assert(Math.max(...xs) > 0.5, 'midrange should turn right at high speed');

// Tomahawk / scoober fly and land.
for (const t of ['tomahawk', 'scoober', 'hammer']) {
  const r = throwIt({ throwType: t, disc: discById('mid') });
  console.log(t, r.thrown.toFixed(1), 'm, x', r.rest[0].toFixed(1), 'maxH', r.maxH.toFixed(1));
  assert(r.thrown > 15, `${t} too short`);
}
// A hammer arcs high, flies inverted through the apex and comes down steeply: a lob over trees, not a driver.
const hammer = simulate({ pos: [0, 1.2, 0], dir: [0, -1], power: 1, throwType: 'hammer', disc: discById('mid') }, w, { record: true });
const apex = hammer.traj.reduce((b, p) => p[1] > b[1] ? p : b);
console.log('hammer', hammer.result.thrown.toFixed(1), 'm, x', hammer.result.rest[0].toFixed(1), 'maxH', hammer.result.maxH.toFixed(1), 'apex n.y', apex[4].toFixed(2));
assert(hammer.result.maxH > 9 && hammer.result.maxH < 18, `hammer apex ${hammer.result.maxH}`);
assert(apex[4] < -0.7, 'hammer is upside down at the top of its arc');
assert(hammer.result.thrown > 35 && hammer.result.thrown < drive.thrown * 0.6, `hammer range ${hammer.result.thrown}`);
// Wind is a real force: a headwind lifts the disc and a tailwind starves it; rough grass kills the ground run.
const windy = wind => simulate({ pos: [0, 1.2, 0], dir: [0, -1], power: 1, throwType: 'backhand', disc: discById('driver') }, { ...w, wind }).result;
const calm = windy([0, 0]), head = windy([0, 6]), tail = windy([0, -6]);
console.log('wind calm/head/tail maxH', calm.maxH.toFixed(1), head.maxH.toFixed(1), tail.maxH.toFixed(1), 'thrown', calm.thrown.toFixed(1), head.thrown.toFixed(1), tail.thrown.toFixed(1));
assert(head.maxH > calm.maxH + 0.8 && tail.maxH < calm.maxH - 0.8, 'headwind lifts, tailwind drops');
assert(tail.thrown < calm.thrown - 10, 'tailwind shortens the drive');
const onFairway = simulate({ pos: [0, 1.2, 0], dir: [0, -1], power: .8, throwType: 'backhand', disc: discById('mid') }, w).result;
const inRough = simulate({ pos: [0, 1.2, 0], dir: [0, -1], power: .8, throwType: 'backhand', disc: discById('mid') }, { ...w, rough: () => 1 }).result;
assert(inRough.thrown < onFairway.thrown - 1.5, `rough should shorten the ground run (${onFairway.thrown.toFixed(1)} vs ${inRough.thrown.toFixed(1)})`);
// All eleven authored motions retain finite flight and mirror under handedness,
// including the overhand turnover rate (not only the initial release bank).
assert.equal(Object.keys(THROWS).length, 11);
for (const throwType of Object.keys(THROWS)) {
  for (const power of [0.4, 1]) {
    const params = { throwType, power, hyzer: 9 };
    const right = throwIt(params), left = throwIt({ ...params, lefty: true });
    for (const r of [right, left]) {
      assert([...r.rest, r.thrown, r.maxH, r.airTime].every(Number.isFinite), `${throwType}: finite flight`);
      assert(r.thrown > 0 && r.airTime < 25, `${throwType}: lands before timeout`);
    }
    assert(Math.abs(right.rest[0] + left.rest[0]) < 1e-6, `${throwType}: mirrored lateral finish`);
    assert(Math.abs(right.rest[2] - left.rest[2]) < 1e-6, `${throwType}: equal forward finish`);
    assert(Math.abs(right.maxH - left.maxH) < 1e-6, `${throwType}: equal height`);
    assert(Math.abs(right.airTime - left.airTime) < 1e-6, `${throwType}: equal flight time`);
  }
}
const fhIO = throwIt({ throwType: 'forehand_io' }), fhOI = throwIt({ throwType: 'forehand_oi' });
assert(fhIO.rest[0] > fh.rest[0] + 2, 'IO forehand finishes further right than flat');
assert(fhOI.rest[0] < fh.rest[0] - 3, 'OI forehand finishes left of flat');
console.log('physics OK — eleven throws, both hands, two powers');
