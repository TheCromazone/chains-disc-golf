// Run: node test/physics.test.mjs
import assert from 'node:assert/strict';
import { simulate, flatWorld, discById } from '../src/physics.js';

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
for (const t of ['tomahawk', 'scoober']) {
  const r = throwIt({ throwType: t, disc: discById('mid') });
  console.log(t, r.thrown.toFixed(1), 'm, x', r.rest[0].toFixed(1), 'maxH', r.maxH.toFixed(1));
  assert(r.thrown > 15, `${t} too short`);
}
console.log('physics OK');
