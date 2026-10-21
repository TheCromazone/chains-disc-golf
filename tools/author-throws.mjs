// The throw solver: writes src/throw-keys.js, the drive, putt and run-up clips of the shared pose contract, from a
// description of the body rather than of joint angles. Each clip is a handful of beats (the reach-back, the plant, the hit,
// the follow-through...) saying where the pelvis is and which way it and the chest face, where each hand is with a hint for
// its elbow, and where each sole is (on the ground or lifted). Every channel is eased between the beats with the same
// monotone Hermite as poseAt, sampled every 1/40 of the clip, and each sample is solved with inverse kinematics on ChainsRig
// (tools/throw-fk.mjs): the arms reach their hands, the legs put each sole where it was asked and keep a planted foot's
// heading, so a planted foot never skates while the hips turn over it. The pelvis travels (rootX/rootZ): the weight goes
// back into the rear leg, through the brace and on over the front foot, as it does in a real throw.
//   node tools/author-throws.mjs            (then node tools/extract-poses.mjs and the Blender bake, tools/author-golfer-clips.py)
// Frame: the actor's, metres, facing -Z (the target), +X the athlete's right, the lie at the origin; right-handed throws
// (left-handers are mirrored at runtime). Physics releases the disc 1.15 m up and .4 m toward the target (physics.js
// releasePos), so the hand meets that point at the hit (.62).
import { writeFileSync } from 'node:fs';
import { RIG, euler, toEuler, mul, apply, add, sub, len, scale } from './throw-fk.mjs';
import { readyPose, STANCE, RIGS } from '../src/throw-poses.js';

const T = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];   // transpose = inverse of a rotation
const D = Math.PI / 180;
// The pelvis, chest and head are authored as the contract's own Euler angles (degrees): root [x, y, z] (y: + turned left
// off the target line, x: - leans toward the target), spine and head relative to their parent. A chest given as a world
// heading decomposes near the 'XYZ' gimbal (y ~ 90 deg once the chest turns past the hips), and poseAt eases each angle on its own.
const rad = v => v.map(x => x * D);

// ---- easing between beats: the monotone cubic Hermite of throw-poses.js poseAt, per scalar
function ease(keys, get, t) {
  let n = 0; while (n < keys.length - 2 && t > keys[n + 1].t) n++;
  const a = keys[n], b = keys[n + 1], h = b.t - a.t, u = Math.max(0, Math.min(1, (t - a.t) / h));
  const tangent = k => { if (k === 0 || k === keys.length - 1) return 0; const h0 = keys[k].t - keys[k - 1].t, h1 = keys[k + 1].t - keys[k].t, d0 = (get(keys[k]) - get(keys[k - 1])) / h0, d1 = (get(keys[k + 1]) - get(keys[k])) / h1; if (d0 * d1 <= 0) return 0; const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; return (w1 + w2) / (w1 / d0 + w2 / d1); };
  return (2 * u ** 3 - 3 * u ** 2 + 1) * get(a) + (u ** 3 - 2 * u ** 2 + u) * h * tangent(n) + (-2 * u ** 3 + 3 * u ** 2) * get(b) + (u ** 3 - u ** 2) * h * tangent(n + 1);
}
// every beat lists every channel (a channel left out carries the previous beat's value), and remembers which channels it set
// itself: a channel eases only between the beats that set it, so a beat that just lifts a foot does not freeze the rest of the
// body (it used to: the .66 "rear foot lets go" beat held the arm and chest still for 25 ms right at the release)
function fill(beats) {
  const out = []; let last = {};
  for (const b of beats) { last = { ...structuredClone(last), ...structuredClone(b) }; out.push(Object.defineProperty({ ...last }, 'own', { value: new Set(Object.keys(b)) })); }
  return out;
}
const channel = (beats, name, t) => { const ks = beats.filter((k, i) => i === 0 || k.own?.has(name)), v = ks[0][name]; if (ks.length < 2) return structuredClone(v); return Array.isArray(v) ? v.map((_, i) => ease(ks, k => k[name][i], t)) : ease(ks, k => k[name], t); };
// a beat holding the clip's own eased state at t (every channel), for a run-up that must end exactly where its drive is
const stateAt = (beats, t) => { const B = fill(beats); return { t, ...Object.fromEntries(Object.keys(B[0]).filter(c => c !== 't').map(c => [c, channel(B, c, t)])) }; };

// ---- Levenberg-Marquardt on a few joint angles
function solve(params, residual, iters = 60) {
  let p = params.slice(), r = residual(p), cost = r.reduce((s, x) => s + x * x, 0), lambda = 1e-3;
  for (let it = 0; it < iters && cost > 1e-12; it++) {
    const J = p.map((_, j) => { const q = p.slice(); q[j] += 1e-5; return residual(q).map((x, i) => (x - r[i]) / 1e-5); });   // J[j][i] = dr_i/dp_j
    const n = p.length, A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a].reduce((s, x, i) => s + x * J[b][i], 0))), g = J.map(col => col.reduce((s, x, i) => s + x * r[i], 0));
    for (let tries = 0; tries < 8; tries++) {
      const M = A.map((row, a) => row.map((x, b) => x + (a === b ? lambda * (A[a][a] + 1e-6) : 0)));
      const step = gauss(M, g.map(x => -x)), q = p.map((x, j) => x + step[j]), rq = residual(q), cq = rq.reduce((s, x) => s + x * x, 0);
      if (cq < cost) { p = q; r = rq; cost = cq; lambda = Math.max(1e-7, lambda / 3); break; }
      lambda *= 4;
    }
  }
  return { p, cost };
}
function gauss(A, b) {   // small dense solve with partial pivoting
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let m = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r; [M[c], M[m]] = [M[m], M[c]]; const d = M[c][c] || 1e-12; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}
// Continuity: each sample's limbs are pulled toward the previous sample's angles (residual per radian), so the solve cannot hop to
// another branch of the same reach between neighbouring keys (at .004 the off shoulder flipped ~1.5 rad in one 1/40 step, a
// visible spin once poseAt eased between them)
const CONT = +(process.env.CONT || .03);
const soft = (x, lo, hi, w = 8) => x < lo ? (lo - x) * w : x > hi ? (x - hi) * w : 0;   // a joint limit as a residual

// ---- one sample: the pelvis and chest as given, the four limbs solved
function pose(s, warm) {
  const out = { root: rad(s.pelvis), spine: rad(s.chest), head: rad(s.head), rootY: s.at[1], rootX: s.at[0], rootZ: s.at[2] };
  const rootM = euler(out.root), chestM = mul(rootM, euler(out.spine));
  const rootP = [RIG.root[0] + s.at[0], RIG.root[1] + s.at[1], RIG.root[2] + s.at[2]], spineP = add(rootP, apply(rootM, RIG.spine));
  for (const side of ['R', 'L']) {
    // arm: shoulder (3) and elbow flex (1) put the grip point on the target with the elbow drawn toward its hint; the
    // forearm's roll (elbow y) is authored: it turns the palm and the thumb, which the position leaves free
    // the throwing hand (R) is placed in world axes from its shoulder (the disc travels along the target line), the off hand
    // in the chest's own axes (it hangs and swings with the torso); both as offsets, so every target is within reach
    const S = add(spineP, apply(chestM, RIG['sh' + side])), roll = s['roll' + side] * D, off = v => side === 'R' ? add(S, v) : add(S, apply(chestM, v));
    const hand = off(s['hand' + side]), elbowHint = off(s['elbow' + side]);
    const arm = p => { const m = mul(chestM, euler([p[0], p[1], p[2]])), E = add(S, apply(m, RIG['el' + side])), H = add(E, apply(mul(m, euler([p[3], roll, 0])), RIG.hand)); return { E, H }; };
    const a = solve(warm['sh' + side].concat([warm['el' + side][0]]), p => { const { E, H } = arm(p); return [...sub(H, hand), ...scale(sub(E, elbowHint), .35), soft(p[3], .03, 2.5), ...p.map((x, j) => (x - (warm["sh" + side].concat([warm["el" + side][0]]))[j]) * CONT)]; });
    out['sh' + side] = a.p.slice(0, 3); out['el' + side] = [a.p[3], roll, 0];
    // leg: hip (3) and knee (1) put the sole's centre over its spot at the asked height and turn the foot to its heading
    const Hp = add(rootP, apply(rootM, RIG['hip' + side])), sole = s['sole' + side], heading = s['foot' + side] * D;
    const leg = p => { const m = mul(mul(rootM, euler([p[0], p[1], p[2]])), euler([p[3], 0, 0])), K = add(Hp, apply(mul(rootM, euler([p[0], p[1], p[2]])), RIG['kn' + side])), C = add(K, apply(m, RIG.sole));
      const r = Math.hypot(apply(m, [RIG.soleRadii[0], 0, 0])[1], apply(m, [0, RIG.soleRadii[1], 0])[1], apply(m, [0, 0, RIG.soleRadii[2]])[1]), f = apply(m, [0, 0, -1]); return { C, bottom: C[1] - r, yaw: Math.atan2(-f[0], -f[2]) }; };
    const w0 = warm['hip' + side].concat([warm['kn' + side][0]]);
    const legFit = start => solve(start, p => { const { C, bottom, yaw } = leg(p); let dy = yaw - heading; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); return [C[0] - sole[0], bottom - sole[1], C[2] - sole[2], dy * .25, soft(p[3], -2.4, -.02), soft(p[1], -1.1, 1.1, 2), soft(p[0], -.9, 1.7, 4), soft(p[2], -.7, .7, 4), ...p.map((x, j) => (x - w0[j]) * CONT)]; });   // hip flexion and abduction kept anatomical: an overstretched leg found a 126-degree twisted fold that still put the sole on its spot
    // a straight knee has no gradient toward bending (a foot lifted under the hip): retry from a bent one when the fit misses
    let l = legFit(w0); if (l.cost > 1e-4) { const b = legFit([w0[0] + .5, w0[1], w0[2], Math.min(w0[3], -1)]); if (b.cost < l.cost) l = b; }
    out['hip' + side] = l.p.slice(0, 3); out['kn' + side] = [l.p[3], 0, 0];
    const { H } = arm(a.p), { C, bottom } = leg(l.p);
    const mh = len(sub(H, hand)), ms = Math.hypot(C[0] - sole[0], bottom - sole[1], C[2] - sole[2]);
    out.err = Math.max(out.err || 0, mh, ms); if (process.env.DEBUG && (mh > .02 || ms > .02)) console.log('  t', s.t.toFixed(3), side, 'hand miss', (mh * 100).toFixed(1), 'sole miss', (ms * 100).toFixed(1), 'reach', len(sub(hand, S)).toFixed(2), 'leg', len(sub([sole[0], sole[1], sole[2]], Hp)).toFixed(2));
  }
  return out;
}

// ---- clips: beats -> keys every 1/40
function clip(name, beats, start) {
  const B = fill(beats), keys = []; let warm = start;
  // the 1/40 grid plus every beat, minus grid samples crowding a beat (.62 beside .625 made a 5 ms segment whose curvature broke the
  // release's velocity continuity)
  const ts = new Set(B.map(b => b.t)); for (let i = 0; i <= 40; i++) { const t = +(i / 40).toFixed(4); if (B.every(b => Math.abs(b.t - t) > .009 || b.t === t)) ts.add(t); }
  for (const t of [...ts].sort((a, b) => a - b)) {
    const s = { t }; for (const ch of Object.keys(B[0])) if (ch !== 't') s[ch] = channel(B, ch, t);
    const k = pose(s, warm); warm = k;
    keys.push({ t, ...Object.fromEntries(Object.entries(k).map(([j, v]) => [j, Array.isArray(v) ? v.map(x => +x.toFixed(4)) : +(+v).toFixed(4)])) });
  }
  const worst = Math.max(...keys.map(k => k.err)); console.log(name.padEnd(10), keys.length, 'keys, worst miss', (worst * 100).toFixed(1), 'cm');
  for (const k of keys) delete k.err;
  return keys;
}
// The aim stance as the solver's warm start: the clips begin where the athlete stands lining the throw up.
const warmFrom = family => { const r = readyPose(family, 0, RIGS.glb); return { ...r, shR: r.shR, elR: r.elR, shL: r.shL, elL: r.elL }; };

// ============ the backhand drive (standstill) ============
// Phase contract (main.js, gltf-player.js): .00-.50 the windup the swipe scrubs (full coil at .35), .62 the hit, 1 the end of
// the follow-through. Beats keyed to drive footage: weight back into the rear leg with the back to the target (.35), a short
// stride lands the front foot closed as the arm peaks straight back at chest height (.43: "peak reach-back at the plant, then
// fire with no pause", both critics), the hips open ~26 deg while the chest stays back and the elbow leads with the disc
// trailing at the chest (.50), the chest whips through (.565), the arm extends and the disc leaves at the brace (.62), the
// rear foot lets go at once (.66) and swings round to land past the front foot (.90) as the arm wraps past the far shoulder.
// Round 2 (Gemini: "zero coiling", "the hips must fire first"): the shoulders coil to ~200 deg (the back to the target) and keep
// turning back as the front foot plants while the hips start to open; from the plant to the pocket the hips turn 34 deg and the
// chest 28, then the chest whips 38 deg into the hit; the finish leans 6-8 deg further over the plant leg.
// The pelvis stops over the braced front knee through the hit (ChatGPT: "the body keeps drifting instead of rotating round a
// stable plant") and only travels on as the rear leg swings through.
// Round 3 (both critics: "no plant-and-brace moment", "the back foot steps through at once", "upright finish"): the front knee
// absorbs at the plant and posts up through the hit (the pelvis rises 3 cm into the release), the rear foot pivots on its ball
// while the hips open and leaves the ground only at .74, the off arm swings out behind as a counterweight, and the finish
// stays low over the plant leg. ChatGPT, after: "no distinct elbow-led pocket", "the off-arm hangs away": the elbow now starts for
// the target at .47 with the disc still back, the pocket is tighter at the chest, and the off arm tucks across the sternum
// through the pull and opens only after the release. Gemini, after (7/10): "the elbow is still bent at the reach-back", "the
// head eyes the target": the arm reaches out nearly straight at the plant and the head turns back with the coil (Gemini: 7.5/10).
// Rounds 10-12 chased each critique's notes (a brace dip, the off arm driven down, a later reach-back, the weight forward, a
// 45-degree camera) and both critics' scores fell (Gemini 6, 5.5, 5.5), so this is the round-9 drive again, plus the rear
// toe kept on the pad through the hit (a raised sole y lifted the whole foot 2-6 cm).
const BH = [
  { t: 0, at: [0, -.08, 0], pelvis: [-7, 70, 0], chest: [-17, 80, 6], head: [-16, -100, -7],
    handR: [-.23, 0, .53], elbowR: [.04, -.02, .29], rollR: 0, handL: [-.04, -.58, -.10], elbowL: [-.03, -.29, .02], rollL: 0,
    soleR: [-.14, 0, -.38], footR: 70, soleL: [-.27, 0, .29], footL: 70 },
  { t: .2, at: [-.02, -.09, .07], pelvis: [-7, 86, 0], chest: [-16, 86, 5], head: [-8, -90, -4],
    handR: [0, -.05, .58], elbowR: [.08, 0, .29], handL: [.16, -.36, -.34], elbowL: [-.06, -.25, -.14] },
  { t: .35, at: [-.03, -.12, .11], pelvis: [-9, 104, -2], chest: [-18, 96, 4], head: [2, -82, 0],
    handR: [.10, -.10, .57], elbowR: [.08, -.05, .28], handL: [.18, -.30, -.32], elbowL: [-.05, -.24, -.16],
    soleR: [-.11, .035, -.39], footR: 96 },
  { t: .43, at: [-.03, -.13, .04], pelvis: [-9, 95, -2], chest: [-18, 105, 3], head: [2, -86, 0],
    handR: [.12, -.10, .63], elbowR: [.09, -.06, .31], handL: [.15, -.29, -.24], elbowL: [-.05, -.23, -.12],
    soleR: [-.10, 0, -.42], footR: 100, soleL: [-.27, 0, .29], footL: 70 },
  { t: .47, pelvis: [-9, 80, -1], chest: [-17, 120, 2], head: [1, -94, 0], handR: [.10, -.11, .42], elbowR: [.07, -.07, .0] },   // the hips go first: the chest holds its coil ~40 ms longer, and the elbow starts for the target while the disc stays back
  { t: .5, at: [-.02, -.145, .01], pelvis: [-8, 55, 0], chest: [-16, 128, 2], head: [0, -100, 0],
    handR: [.03, -.13, .15], elbowR: [.06, -.08, -.22], handL: [.15, -.25, -.19], elbowL: [-.04, -.22, -.10], rollR: 10 },
  { t: .53, pelvis: [-8, 45, 0], chest: [-16, 112, 0], head: [0, -90, 0], handR: [-.12, -.12, .12], elbowR: [.04, -.09, -.25], soleL: [-.27, 0, .28], footL: 60 },   // the rear heel turns in as the hips fire (a sole's y is its lowest point: the toe stays down)   // the disc swings in front of the sternum, not through the shoulder
  { t: .565, at: [-.01, -.13, -.005], pelvis: [-8, 38, 0], chest: [-15, 82, -2], head: [0, -76, 0],
    handR: [-.23, -.10, -.06], elbowR: [.06, -.09, -.26], handL: [.04, -.32, -.14], elbowL: [-.06, -.25, -.06], rollR: 20 },
  { t: .62, at: [0, -.115, -.01], pelvis: [-7, 30, 0], chest: [-14, 64, -6], head: [0, -60, 0],
    handR: [-.04, -.12, -.48], elbowR: [.04, -.08, -.22], handL: [-.02, -.36, -.08], elbowL: [-.07, -.25, .0], rollR: 30 },
  { t: .66, soleL: [-.28, .01, .26], footL: 48, handR: [-.28, -.10, -.50], elbowR: [-.10, -.06, -.25] },   // the rear foot pivots on its ball as the hips finish opening; the arm flies on across
  // r3 athlete c1 (all four m-throw critics: "both arms open into a rigid T / airplane spread after the release, the off arm
  // mirrors the throwing arm"): the throwing elbow folds once the hand passes the far shoulder, so the arm wraps high round
  // the body instead of sweeping out flat at full length, and the off arm stays tucked, elbow bent with the forearm across
  // the belly, instead of swinging out behind (it was 56 cm from its shoulder, almost straight, opposite the throwing arm)
  { t: .7, at: [-.015, -.10, -.06], pelvis: [-9, 10, 0], chest: [-18, 45, -6], head: [0, -42, 0],
    handR: [-.42, -.04, -.38], elbowR: [-.18, -.03, -.22], handL: [.06, -.34, -.14], elbowL: [-.08, -.24, -.02],
    soleL: [-.30, .04, .20], footL: 32, footR: 80 },
  { t: .74, soleL: [-.33, .15, .04], footL: 20, handR: [-.52, .03, -.18], elbowR: [-.24, -.02, -.20] },   // ...and only then lets go and swings round the posted front leg
  { t: .8, at: [-.06, -.10, -.20], pelvis: [-14, -20, 0], chest: [-27, 16, -2], head: [4, -6, 0],
    handR: [-.50, .12, .02], elbowR: [-.30, -.04, -.16], handL: [.10, -.32, -.16], elbowL: [-.08, -.24, -.02],
    soleL: [-.38, .15, -.26], footL: 6, footR: 34 },
  { t: .9, at: [-.13, -.11, -.36], pelvis: [-13, -38, 0], chest: [-25, -14, 0], head: [6, 18, 0],
    handR: [-.40, .16, .22], elbowR: [-.30, -.02, -.12], handL: [.10, -.34, -.14], elbowL: [-.08, -.25, -.02],
    soleL: [-.40, 0, -.62], footL: -24, footR: 4 },
  { t: 1, at: [-.16, -.11, -.40], pelvis: [-12, -42, 0], chest: [-21, -16, 0], head: [5, 22, 0],
    handR: [-.36, .10, .22], elbowR: [-.30, -.06, -.10], handL: [.06, -.38, -.12], elbowL: [-.08, -.26, -.02],
    soleL: [-.40, 0, -.62], footL: -28, footR: 0 },
];

// ============ the x-step run-up (bots, remote players) ============
// Played before the drive by anyone the camera watches throw from a run-up: from standing ~1.5 m behind the lie, disc at the
// chest in both hands, the throwing-side foot steps (.30), the off foot crosses behind it as the hips turn side-on and the arm
// starts back (.62), and the throwing-side foot swings through toward the plant with the arm reaching back. It ends exactly
// on the drive's .35 beat (full coil, the front foot just off the ground), so the drive takes over from .35 and plants at .43.
const coil = stateAt(BH, .35);
// athletic through the approach: knees flexed and the chest over the feet (critics read 3 cm higher and 4 deg prouder as "upright, passive")
const XSTEP = [
  { t: 0, at: [0, -.07, 1.50], pelvis: [-6, 22, 0], chest: [-16, 8, 0], head: [2, -26, 0],
    handR: [-.24, -.32, -.18], elbowR: [.02, -.28, .05], rollR: 0, handL: [.12, -.38, -.24], elbowL: [-.04, -.27, -.04], rollL: 0,
    soleR: [.12, 0, 1.52], footR: 22, soleL: [-.12, 0, 1.64], footL: 22 },
  { t: .12, at: [-.02, -.09, 1.40], soleR: [.10, .08, 1.30] },
  { t: .30, at: [0, -.15, 1.12], pelvis: [-8, 38, 0], chest: [-20, 22, 0], head: [2, -44, 0], soleR: [.06, 0, .95], footR: 38, soleL: [-.12, 0, 1.64],
    handR: [-.22, -.16, -.08], elbowR: [.04, -.22, .08] },
  { t: .46, at: [.02, -.10, .80], pelvis: [-8, 70, -1], chest: [-20, 36, 2], head: [4, -62, 0], soleL: [.04, .08, .86], footL: 60,
    handR: [-.20, -.13, .02], elbowR: [.05, -.18, .14], handL: [.16, -.30, -.30] },
  { t: .62, at: [-.02, -.16, .40], pelvis: [-9, 90, -1], chest: [-21, 56, 3], head: [2, -76, 0], soleL: [-.27, 0, .29], footL: 70,
    soleR: [.06, 0, .95], handR: [-.12, -.10, .17], elbowR: [.05, -.10, .08] },
  { t: .8, at: [-.03, -.11, .22], pelvis: [-9, 96, -1], chest: [-20, 82, 3], head: [2, -78, 0],
    soleR: [-.05, .09, .28], footR: 85, handR: [.04, -.12, .45], elbowR: [.07, -.06, .22] },   // the arm and shoulders go back in the last step: full coil at the plant (the drive's .43), not walked there
  { ...coil, t: 1 },
];

// ============ the putt ============
// A push putt from the staggered stance (throwing-side foot a half step ahead, square to the pin): the knees load with the
// disc drawn in to the belly in both hands (.50), the legs drive up as the arm pushes straight out at the chains, the off hand
// lets go (.62), and the arm finishes high and held on the line with the weight on the front foot and the rear heel up.
// Both feet stay planted (the hand-keyed putt slid them 25-60 cm through the stroke).
const PUTT = [
  { t: 0, at: [0, -.05, 0], pelvis: [-7, 12, 0], chest: [-9, -10, 0], head: [8, -3, 0],
    handR: [-.23, -.36, -.21], elbowR: [0, -.29, .06], rollR: 0, handL: [-.05, -.38, -.25], elbowL: [-.08, -.27, .10], rollL: 0,
    soleR: [.10, 0, -.29], footR: 12, soleL: [-.24, 0, -.12], footL: 12 },
  { t: .3, at: [0, -.08, .03], chest: [-14, -10, 0], handR: [-.21, -.38, -.17], handL: [-.06, -.40, -.21] },
  { t: .5, at: [0, -.11, .04], pelvis: [-8, 12, 0], chest: [-16, -8, 0], head: [12, -3, 0],
    handR: [-.19, -.40, -.13], elbowR: [.02, -.28, .10], handL: [-.06, -.40, -.17], elbowL: [-.08, -.27, .10] },
  { t: .565, at: [0, -.07, -.03], chest: [-10, -4, 0], head: [9, -2, 0], handR: [-.13, -.30, -.38], elbowR: [.02, -.20, -.10], handL: [-.08, -.46, -.05] },
  // r3 athlete c1 tried a finish held high over the chains so the putt camera (1.4 m to his left, 3.6 m back, at head height)
  // could see it: any forward reach from the right shoulder projects onto his head and torso from there, and a hand raised
  // clear of the head read as a hand on the head. Unchanged; the visible stroke needs the camera on the throwing side.
  { t: .62, at: [0, -.03, -.07], pelvis: [-5, 10, 0], chest: [-6, -2, 0], head: [6, -2, 0],
    handR: [-.08, -.20, -.52], elbowR: [0, -.12, -.24], handL: [-.06, -.52, .02], elbowL: [-.06, -.28, .05] },
  { t: .8, at: [0, -.01, -.10], pelvis: [-4, 6, 0], chest: [-4, 0, 0], head: [4, 0, 0],
    handR: [-.06, -.06, -.60], elbowR: [-.01, -.03, -.30], handL: [-.08, -.55, .04], elbowL: [-.05, -.28, .04], soleL: [-.24, .03, -.12] },
  { t: 1, at: [0, -.02, -.10], handR: [-.06, -.09, -.59], elbowR: [-.01, -.05, -.30], soleL: [-.24, .015, -.12] },
];

// ============ the forehand (sidearm) ============
// Right-handed: loaded on the right (back) foot with the hips and shoulders turned away and the disc drawn back beside the
// right hip, the elbow at the ribs (.35); the left foot steps out and plants closed (.43); the hips open first, the elbow leads
// the forearm through (.50-.565), the disc leaves in front of the right hip with the chest square (.62), and the arm runs on
// across the waist while the right foot lets go and steps through (.9).
const FH = [
  { t: 0, at: [0, -.035, 0], pelvis: [-7, -20, 0], chest: [-9, -20, 0], head: [12, 40, 0],
    handR: [.26, -.39, -.01], elbowR: [-.01, -.24, .17], rollR: 0, handL: [.10, -.55, -.20], elbowL: [0, -.28, -.06], rollL: 0,
    soleR: [.25, 0, -.04], footR: -20, soleL: [-.14, 0, -.26], footL: -20 },
  { t: .2, at: [.05, -.06, .03], pelvis: [-4, -40, 0], chest: [-6, -30, 0], head: [10, 62, 0],
    handR: [.30, -.32, .18], elbowR: [.05, -.21, .19], handL: [.15, -.40, -.30], elbowL: [0, -.25, -.12], soleL: [-.14, .02, -.30] },
  { t: .35, at: [.07, -.10, .05], pelvis: [-4, -55, 0], chest: [-6, -35, 0], head: [8, 75, 0],
    handR: [.25, -.38, .35], elbowR: [.12, -.22, .12], handL: [.20, -.30, -.35], elbowL: [.02, -.22, -.16], soleL: [-.12, .05, -.42], footL: -40 },
  { t: .43, at: [.05, -.12, -.02], pelvis: [-5, -45, 0], chest: [-7, -38, 0], handR: [.24, -.36, .30], elbowR: [.12, -.24, .06],
    soleL: [-.10, 0, -.55], footL: -50 },
  { t: .5, at: [.02, -.12, -.08], pelvis: [-6, -20, 0], chest: [-8, -40, 0], head: [6, 58, 0],
    handR: [.24, -.32, .10], elbowR: [.10, -.24, -.12], handL: [.05, -.42, -.15], elbowL: [0, -.27, -.06] },
  { t: .565, at: [0, -.10, -.13], pelvis: [-7, 0, 0], chest: [-8, -25, 0], head: [4, 30, 0],
    handR: [.18, -.25, -.18], elbowR: [.12, -.25, -.15], handL: [-.05, -.45, 0], elbowL: [-.03, -.28, 0] },
  { t: .62, at: [-.02, -.08, -.17], pelvis: [-7, 10, 0], chest: [-8, -5, 0], head: [3, 10, 0],
    handR: [.08, -.22, -.45], elbowR: [.14, -.18, -.18], handL: [-.10, -.48, .08], elbowL: [-.05, -.28, .04] },
  { t: .7, at: [-.04, -.07, -.22], pelvis: [-6, 22, 0], chest: [-8, 12, 0], head: [0, -5, 0],
    handR: [-.10, -.18, -.52], elbowR: [.06, -.15, -.26], soleR: [.22, .06, -.06], footR: 0 },
  { t: .8, at: [-.06, -.06, -.27], pelvis: [-5, 30, 0], chest: [-6, 20, 0], head: [0, -15, 0],
    handR: [-.32, -.20, -.38], elbowR: [-.05, -.16, -.25], soleR: [.12, .08, -.30], footR: 20 },
  { t: .9, at: [-.05, -.05, -.32], handR: [-.38, -.30, -.20], elbowR: [-.10, -.22, -.15], soleR: [.12, 0, -.45], footR: 25 },
  { t: 1, at: [-.05, -.04, -.33], pelvis: [-5, 30, 0], chest: [-6, 18, 0], handR: [-.30, -.42, -.10], elbowR: [-.06, -.26, -.05], handL: [-.05, -.55, .02], elbowL: [-.03, -.29, .02] },
];
// The forehand's run-up from the same standing start as the x-step: right, left, a hop onto the right (the load), and the
// forehand takes over at .35 with the left foot in the air for the plant.
const load = stateAt(FH, .35);
const FXSTEP = [
  { ...XSTEP[0] },
  { t: .12, at: [0, -.05, 1.42], soleR: [.13, .07, 1.30] },
  { t: .32, at: [.02, -.07, 1.02], pelvis: [-4, 5, 0], chest: [-8, -5, 0], head: [-2, 10, 0], soleR: [.16, 0, .78], footR: 0, soleL: [-.12, 0, 1.64] },
  { t: .5, at: [.03, -.06, .66], soleL: [-.12, .07, .62], handR: [.16, -.34, -.05], elbowR: [.02, -.26, .10], handL: [.12, -.42, -.24] },
  { t: .62, at: [.04, -.07, .42], pelvis: [-4, -25, 0], chest: [-7, -22, 0], head: [6, 45, 0], soleL: [-.12, 0, .36], footL: -20, soleR: [.16, 0, .78] },
  { t: .78, at: [.07, -.05, .18], soleR: [.25, .08, .22], footR: -30 },
  { t: .88, at: [.08, -.09, .08], soleR: [.25, 0, -.04], footR: -45, soleL: [-.12, 0, .36] },
  { ...load, t: 1 },
];

const SOLVED = {};
SOLVED.backhand = clip('backhand', BH, warmFrom('backhand'));
SOLVED.xstep = clip('xstep', XSTEP, warmFrom('putt'));
SOLVED.putt = clip('putt', PUTT, warmFrom('putt'));
SOLVED.forehand = clip('forehand', FH, warmFrom('forehand'));
SOLVED.fxstep = clip('fxstep', FXSTEP, warmFrom('putt'));
// a run-up's last key is its drive's .35 key itself: the same targets solved from another warm start can land on an equivalent
// arm with a few degrees more upper-arm twist, which would pop at the handover
for (const [run, drive] of [['xstep', 'backhand'], ['fxstep', 'forehand']]) SOLVED[run][SOLVED[run].length - 1] = { ...SOLVED[drive].find(k => k.t === .35), t: 1 };

writeFileSync(new URL('../src/throw-keys.js', import.meta.url), `// Generated by tools/author-throws.mjs (the throw solver); edit the beats there, not these keys.\nexport const SOLVED = ${JSON.stringify(SOLVED)};\n`);
