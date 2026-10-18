// The solved throws (tools/author-throws.mjs -> src/throw-keys.js): run-ups hand over to their drive exactly, planted feet hold
// their spot through the hit, the disc leaves the hand at chest height, and the travel stays continuous.
import assert from 'node:assert/strict';
import { K, RUNUPS, poseAt, JOINTS, soleHeights } from '../src/throw-poses.js';
import { fk, GROUND } from '../tools/throw-fk.mjs';

// 1. Each run-up ends on its drive's full coil (.35): every joint angle and the pelvis travel, so the handover cannot pop.
for (const [run, drive] of [['xstep', 'backhand'], ['fxstep', 'forehand']]) {
  const a = poseAt(RUNUPS[run], 1), b = poseAt(K[drive], .35);
  for (const j of JOINTS) for (let c = 0; c < 3; c++) assert(Math.abs(a[j][c] - b[j][c]) < 1e-3, `${run} ends on ${drive} .35 (${j}[${c}])`);
  assert(Math.abs(a.rootX - b.rootX) < 1e-3 && Math.abs(a.rootZ - b.rootZ) < 1e-3, `${run} hands over the travel`);
  assert(poseAt(RUNUPS[run], 0).rootZ > 1.2, `${run} starts behind the lie`);
}
console.log('Run-ups hand over to their drives at the full coil.');

// 2. A planted foot holds its spot while the hips turn over it: the drive's front foot from the plant through the hit, and the
// putt's feet through the whole stroke (the hand-keyed putt slid them 25-60 cm).
const slide = (keys, side, t0, t1) => { const p0 = fk(poseAt(keys, t0))['sole' + side]; let worst = 0;
  for (let t = t0; t <= t1 + 1e-9; t += .01) { const p = fk(poseAt(keys, t))['sole' + side]; worst = Math.max(worst, Math.hypot(p[0] - p0[0], p[2] - p0[2])); } return worst; };
assert(slide(K.backhand, 'R', .43, .9) < .05, `backhand front foot holds through the hit (${slide(K.backhand, 'R', .43, .9).toFixed(3)} m)`);
assert(slide(K.forehand, 'L', .43, 1) < .05, `forehand front foot holds (${slide(K.forehand, 'L', .43, 1).toFixed(3)} m)`);
for (const s of ['R', 'L']) assert(slide(K.putt, s, 0, .62) < .04, `putt ${s} foot holds through the stroke (${slide(K.putt, s, 0, .62).toFixed(3)} m)`);
// ...and both of the drive's feet touch the ground from the plant to the release: the front heel lands at .43, and the rear foot
// pivots on its toe rather than hovering (a sole target's y is its lowest point, so "heel up" written as a raised y lifted the
// whole foot 2-6 cm off the pad through the hit)
for (let t = .43; t <= .62 + 1e-9; t += .01) { const h = soleHeights(poseAt(K.backhand, t), false, GROUND), m = Math.min(...h);
  assert(h[0] - m < .015 && h[1] - m < .015, `backhand feet on the ground at ${t.toFixed(2)} (front ${(h[0] - m).toFixed(3)}, rear ${(h[1] - m).toFixed(3)} m)`); }
console.log('Planted feet hold their spot through the hit.');

// 3. The hit: the throwing hand at chest height and ahead of the body (the hand-keyed drive released at the waist, 1.0 m), and
// the reach-back straight back at chest height, not down by the hip.
for (const id of ['backhand', 'forehand', 'putt']) {
  const r = fk(poseAt(K[id], .62)); assert(r.handR[1] > 1.0 && r.handR[1] < 1.35, `${id} releases at chest height (${r.handR[1].toFixed(2)} m)`);
  assert(r.handR[2] < -.2, `${id} releases ahead of the body (${r.handR[2].toFixed(2)} m)`);
}
{ const r = fk(poseAt(K.backhand, .43)); assert(r.handR[1] > 1.05 && r.handR[2] > .45, `backhand reach-back peaks behind at chest height (${r.handR.map(v => v.toFixed(2))})`); }
console.log('Releases at chest height; the reach-back peaks straight back.');

// 4. Travel is smooth: no step of more than 4 cm between 1% phase samples (the root never teleports between keys).
for (const keys of [K.backhand, K.forehand, K.putt, RUNUPS.xstep, RUNUPS.fxstep]) {
  let prev = poseAt(keys, 0);
  for (let i = 1; i <= 100; i++) { const p = poseAt(keys, i / 100); assert(Math.hypot(p.rootX - prev.rootX, p.rootZ - prev.rootZ) < .04, 'smooth travel'); prev = p; }
}
console.log('Pelvis travel is continuous.');
