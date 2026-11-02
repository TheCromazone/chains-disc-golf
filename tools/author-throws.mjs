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
import { SOLVED as SHIPPED } from '../src/throw-keys.js';

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
// a joint rotation's twist about its bone (the rest bone hangs along -Y): swing-twist split of its quaternion, radians
function boneTwist(m) {
  const tr = m[0] + m[4] + m[8]; let w, y;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; y = (m[2] - m[6]) / s; }
  else if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; w = (m[7] - m[5]) / s; y = (m[1] + m[3]) / s; }
  else if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; w = (m[2] - m[6]) / s; y = s / 4; }
  else { const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; w = (m[3] - m[1]) / s; y = (m[5] + m[7]) / s; }
  return w < 0 ? 2 * Math.atan2(-y, -w) : 2 * Math.atan2(y, w);
}

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
    // untwist (a beat channel, 0 unless a beat sets it): a near-straight arm leaves the upper arm's roll about its own bone free,
    // and the reach-back drifted to ~170 deg of it, which the skin shows as a candy-wrapper shoulder and a thin stretched sleeve
    const ut = side === 'R' && s.untwistR > 0 ? s.untwistR : 0;
    const a = solve(warm['sh' + side].concat([warm['el' + side][0]]), p => { const { E, H } = arm(p); return [...sub(H, hand), ...scale(sub(E, elbowHint), .35), soft(p[3], .03, 2.5), ...p.map((x, j) => (x - (warm["sh" + side].concat([warm["el" + side][0]]))[j]) * CONT), ...(ut ? [boneTwist(euler(p.slice(0, 3))) * ut] : [])]; });
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
// lead (optional): other beats that the samples up to lead.upto are eased from, so a follow-through can change without moving
// the stroke before it (each beat's easing tangent reads its neighbours, so a new finish nudged the release key by ~.003 rad)
// end (optional): a run-up is solved backwards from its drive's own key, so its last samples lie on the same branch as the key it
// hands over to (solved forwards, the x-step reached the coil with the upper arm ~1 rad off in every Euler angle, the same hand by
// another twist, and the last 1/40 swung the wrist through 6.5 cm in one frame to get onto the drive's)
// The legs are still solved forwards (a swing foot recovering behind the hip folds the knee the way the stride before it left it;
// solved back from the coil's forward-reaching leg it missed its path by up to 7 cm).
function clip(name, beats, start, lead, end = null) {
  const B = fill(beats), L = lead ? fill(lead.beats) : B;
  // the 1/40 grid plus every beat, minus grid samples crowding a beat (.62 beside .625 made a 5 ms segment whose curvature broke the
  // release's velocity continuity)
  const ts = new Set(B.map(b => b.t)); for (let i = 0; i <= 40; i++) { const t = +(i / 40).toFixed(4); if (B.every(b => Math.abs(b.t - t) > .009 || b.t === t)) ts.add(t); }
  const pass = (order, warm) => order.map(t => {
    const s = { t }, S = lead && t <= lead.upto ? L : B; for (const ch of Object.keys(B[0])) if (ch !== 't') s[ch] = channel(S, ch, t);
    const k = pose(s, warm); warm = k; return k;
  });
  const order = [...ts].sort((a, b) => a - b), fwd = pass(order, start), back = end && pass([...order].reverse(), end).reverse();
  const keys = order.map((t, i) => { const k = back ? { ...fwd[i], shR: back[i].shR, elR: back[i].elR, shL: back[i].shL, elL: back[i].elL, err: Math.max(fwd[i].err, back[i].err) } : fwd[i];
    return { t, ...Object.fromEntries(Object.entries(k).map(([j, v]) => [j, Array.isArray(v) ? v.map(x => +x.toFixed(4)) : +(+v).toFixed(4)])) }; });
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
    soleR: [-.14, 0, -.38], footR: 70, soleL: [-.27, 0, .29], footL: 70, untwistR: 0 },
  // r3 athlete c3 (all four m-throw critics: "frames 1-4 hold almost the same pose for 0.45 s", "a static hold, not a coil",
  // "no wrap across the chest"): the address already reaches 56 cm across the chest, so the old windup moved the hand ~10 cm
  // and turned the chest 54 deg over the whole .9 s a bot takes. Now the disc first comes in to the chest, elbow out (.12: the
  // wrap), then reaches back nearly straight-armed as the shoulders coil past where they were (~214 deg, .35, one beat at full
  // reach while the front foot lands, .40), and the hips fire at once with the elbow leading the disc back in (.44), so every
  // 0.15 s of the windup shows a different shape: in, out, back, and the hips opening ahead of the arm
  { t: .12, at: [-.01, -.085, .035], pelvis: [-7, 78, 0], chest: [-17, 84, 5], head: [-12, -96, -5],
    handR: [.09, -.10, .26], elbowR: [-.17, -.18, -.05], handL: [.10, -.42, -.26], elbowL: [-.05, -.26, -.10] },
  { t: .24, at: [-.02, -.10, .08], pelvis: [-8, 92, -1], chest: [-19, 93, 5], head: [-3, -88, -2],
    handR: [.04, -.08, .50], elbowR: [.06, -.04, .26], handL: [.16, -.36, -.34], elbowL: [-.06, -.25, -.14] },
  // r3 athlete c2: the coil keeps the x-step's chest drop (-18 read "upright and square, no coil") and its slightly low hand
  // g18 c2 (m-throw 0/2: "the arm is a straight stick behind the body for frames 2-4 while the legs step, then the pull, wrap
  // and release all fall between frames 4 and 5"): the run-up's strip samples the x-step at .58/.79/.96, this drive at ~.45 and
  // the release. The full coil is now one beat (.30; the x-step peaks at its .73, strip frame 2), the hips open first with the arm
  // trailing and its elbow starting to bend as the run-up hands over (.35, frame 3), the front foot plants with the elbow leading
  // (.40) and the disc is pulled in tight across the chest at pec height by .45 (frame 4), so the pull spans three frames
  // g18 final (m-throw 2/4 vs DGM: "the reach-back arm is rigid and plank-straight like a held mannequin pose", "the torso turns
  // as one block", "frame 3 the arm is still nearly straight while the hips are already moving forward"): the reach is ~6 cm
  // shorter with the elbow hinted down (~150 deg, soft, not locked) and the disc ~5 cm lower, toward the trailing hip; from the
  // full coil the hips open ~30 deg ahead of the chest (the chest holds ~205 deg world through the plant) while the elbow drops
  // under the shoulder and leads, the disc trailing up behind it, so strip frame 3 is a bent, loaded arm and frame 4 the pocket
  // g19 c2: the coil as the x-step's (.74) and from it the chest unwinds steadily behind the hips (~184 deg world at .35, ~150
  // at the pocket, strip frame 4) instead of holding ~209 to .45 and whipping 95 deg in the last frame before the hit
  { t: .30, pelvis: [-10, 106, -2], chest: [-28, 110, 4], head: [6, -86, 0],
    handR: [-.30, -.18, .47], elbowR: [-.18, .01, .26], handL: [.18, -.30, -.32], elbowL: [-.05, -.24, -.16], untwistR: .1 },
  { t: .35, at: [-.035, -.13, .12], pelvis: [-10, 68, -2], chest: [-23, 116, 4], head: [4, -92, 0],
    handR: [-.12, -.19, .30], elbowR: [.03, -.21, .10], handL: [.17, -.30, -.29], elbowL: [-.05, -.24, -.15],
    soleR: [-.11, .035, -.39], footR: 96, untwistR: .1 },
  { t: .40, at: [-.03, -.135, .05], pelvis: [-9, 56, -2], chest: [-20, 106, 3], head: [2, -96, 0],
    handR: [-.02, -.15, .20], elbowR: [.08, -.15, -.06], handL: [.15, -.29, -.24], elbowL: [-.05, -.23, -.12],
    soleR: [-.10, 0, -.42], footR: 90, soleL: [-.27, 0, .29], footL: 70, untwistR: .05 },
  { t: .45, at: [-.02, -.145, .01], pelvis: [-8, 46, 0], chest: [-16, 98, 2], head: [0, -90, 0],
    handR: [.03, -.115, .14], elbowR: [.09, -.07, -.22], handL: [.15, -.25, -.19], elbowL: [-.04, -.22, -.10], rollR: 10, untwistR: 0 },
  { t: .5, pelvis: [-8, 41, 0], chest: [-16, 92, 1], head: [0, -88, 0], handR: [-.05, -.12, .13], elbowR: [.06, -.085, -.24] },
  { t: .53, pelvis: [-8, 38, 0], chest: [-16, 84, 0], head: [0, -84, 0], handR: [-.12, -.12, .11], elbowR: [.05, -.09, -.25], soleL: [-.27, 0, .28], footL: 60 },   // the rear heel turns in as the hips fire (a sole's y is its lowest point: the toe stays down)   // the disc swings in front of the sternum, not through the shoulder
  { t: .565, at: [-.01, -.13, -.005], pelvis: [-8, 34, 0], chest: [-15, 72, -2], head: [0, -72, 0],
    handR: [-.23, -.10, -.06], elbowR: [.06, -.09, -.26], handL: [.04, -.32, -.14], elbowL: [-.06, -.25, -.06], rollR: 20 },
  { t: .62, at: [0, -.115, -.01], pelvis: [-7, 30, 0], chest: [-14, 64, -6], head: [0, -60, 0],
    handR: [-.04, -.12, -.48], elbowR: [.04, -.08, -.22], handL: [-.02, -.36, -.08], elbowL: [-.07, -.25, .0], rollR: 30 },
  { t: .66, soleL: [-.28, .01, .26], footL: 48, handR: [.04, -.10, -.50], elbowR: [.02, -.07, -.24] },   // the rear foot pivots on its ball as the hips finish opening; the arm flies on along the line
  // r3 athlete c1 (all four m-throw critics: "both arms open into a rigid T / airplane spread after the release, the off arm
  // mirrors the throwing arm"): the throwing elbow folds once the hand passes the far shoulder, so the arm wraps high round
  // the body instead of sweeping out flat at full length, and the off arm stays tucked, elbow bent with the forearm across
  // the belly, instead of swinging out behind (it was 56 cm from its shoulder, almost straight, opposite the throwing arm)
  // g18 final (m-throw: "frames 5-7 the arm is hidden behind the body", "a stiff arm swung behind the torso", "the hips and
  // shoulders barely rotate past square"; DGM: "the arm finishing wide and then wrapping back across the torso"): after the hit
  // the arm carries on round the throwing side at shoulder height, out wide on the right where the run-up camera sees it (.74),
  // then the elbow folds and the forearm wraps back across the chest to the far shoulder (.8-.9) as the chest turns ~80 deg
  // past the line and the hips ~50
  { t: .7, at: [-.015, -.10, -.06], pelvis: [-9, 6, 0], chest: [-18, 34, -6], head: [0, -36, 0],
    handR: [.24, -.08, -.50], elbowR: [.12, -.05, -.24], handL: [.06, -.34, -.14], elbowL: [-.08, -.24, -.02],
    soleL: [-.30, .04, .20], footL: 32, footR: 80 },
  // r9 athlete c2 (m-throw critics: "the arm snaps overhead at the end"; DGM's arm carries on round the front of the body at
  // shoulder height): after the hit the hand stays a few cm under the shoulder and nearly at full reach as the chest turns past
  // square, instead of rising 12-16 cm over it (seen from the run-up camera on his chest side, that read as the arm thrown over his head)
  { t: .74, soleL: [-.33, .15, .04], footL: 20, handR: [.46, -.07, -.36], elbowR: [.24, -.05, -.18] },   // ...and only then lets go and swings round the posted front leg
  // g18 c2 (m-throw: "the arm ends stretched out behind him", "no wrap"): the hand swept on round to 26 cm behind the right
  // shoulder at full reach. Now the elbow folds once the arm is across the front (.8) and the hand wraps round to the far
  // shoulder, 12 cm outside and ~18 cm behind it (.9-1), the upper arm across the chest: the camera behind him sees the forearm
  // round his far shoulder (tucked just in front of it, the arm vanished behind his back)
  // g19 c2 (m-throw: "frames 7-8 a hunched crouch with the arm folded at the chest", "folds abruptly, like a jump cut"): the
  // fold was done by .8 and the chest stopped at ~-85 deg by .89, so strip frames 7 and 8 (.87, .96) were one held crouch
  // (~41 deg of forward pitch). Now the wrap spans frames 6-8: wide on the throwing side (.77), sweeping across the front at
  // shoulder height with the elbow still soft (.87), round the far shoulder (.95); the chest keeps turning to ~-100 at the end,
  // the trunk stands taller over the posted leg and the head follows the disc down the line
  { t: .8, at: [-.06, -.11, -.20], pelvis: [-10, -22, 0], chest: [-17, 2, -2], head: [-2, 18, 0],
    handR: [.36, -.08, -.42], elbowR: [.24, -.08, -.18], handL: [.10, -.32, -.16], elbowL: [-.08, -.24, -.02],
    soleL: [-.38, .15, -.26], footL: 6, footR: 34 },
  { t: .87, pelvis: [-10, -38, 0], chest: [-16, -22, -1], head: [-2, 40, 0], handR: [.29, -.07, -.36], elbowR: [.32, -.09, -.08] },
  { t: .9, at: [-.13, -.14, -.36], handL: [.10, -.34, -.14], elbowL: [-.08, -.25, -.02], soleL: [-.40, 0, -.62], footL: -24, footR: 4 },
  { t: .95, pelvis: [-10, -48, 0], chest: [-16, -42, 0], head: [-2, 56, 0], handR: [-.05, -.10, -.42], elbowR: [.22, -.10, -.10] },
  { t: 1, at: [-.16, -.155, -.40], pelvis: [-10, -52, 0], chest: [-15, -46, 0], head: [-2, 62, 0],
    handR: [-.06, -.11, -.43], elbowR: [.22, -.11, -.10], handL: [.06, -.38, -.12], elbowL: [-.08, -.26, -.02],
    soleL: [-.40, 0, -.62], footL: -28, footR: 0 },
];

// ============ the x-step run-up (bots, remote players) ============
// Played before the drive by anyone the camera watches throw from a run-up: from standing ~1.5 m behind the lie, disc at the
// chest in both hands, the throwing-side foot steps (.24), the off foot crosses behind it as the hips turn side-on and the arm
// starts back (.58), and the throwing-side foot swings through toward the plant with the arm reaching back. It ends exactly
// on the drive's .35 beat (full coil, the front foot just off the ground), so the drive takes over from .35 and plants at .43.
const coil = stateAt(BH, .35);
// One beat past the end, the drive's next key (.375) at the time the pull reaches it (main.js windUp starts it at RUNUP.v0, drive phase
// per second): poseAt never samples past 1, but every channel's tangent at 1 reads it, so the body carries its speed through the
// handover. Eased to rest at the coil and pulled from rest, the pelvis slowed from 1.4 to 0.1 cm a frame and the swinging foot from
// 9 to 0.2 in mid-stride, then surged to 3: a beat's hitch before the plant.
const RUNUP_DUR = .8, PULL_V0 = .45, PAST = { t: .375, at: +(1 + .025 / RUNUP_DUR / PULL_V0).toFixed(4) };   // main.js RUNUP.dur, RUNUP.v0
// The feet step: each one peels up off its spot, swings through high and comes down onto the next nearly vertically, and the
// other foot stays planted until it has landed. The strides used to be eased straight between the footfalls, so a foot came in
// skimming the last few centimetres of the ground and dragged its toe out again, and each stayed down until the body was ~.6 m past
// it, on its toe at full stretch: the probe measured 24 cm of loaded-sole slide on the x-step and 41 on the crow hop (whose front
// foot then crossed 78 cm of ground in the last 96 ms). Now each foot leaves before the body is ~.4 m past it.
// step(side, t0, a, t1, b, h0, h1, via, land): leaves a (heading h0) at t0, lands on b (heading h1) at t1, crossing at via ([x, z]
// half way, for a foot passing behind the other) ~15 cm up; land false: still in the air at t1, where the next beat takes it on
const step = (side, t0, a, t1, b, h0, h1, via = null, land = true) => {
  const k = 'sole' + side, f = 'foot' + side, at = (u, y) => [a[0] + (b[0] - a[0]) * u, y, a[2] + (b[2] - a[2]) * u], r = t => +t.toFixed(4), cm = 1 / Math.hypot(b[0] - a[0], b[2] - a[2]) / 100;   // a foot leaves and lands within 1 cm of its spot while it rises or drops the 5 cm nearest the ground
  return [{ t: r(t0), [k]: a, [f]: h0 }, { t: r(t0 + .035), [k]: at(cm, .05) }, { t: r((t0 + t1) / 2), [k]: via ? [via[0], via[2] ?? .15, via[1]] : at(.5, .15) },
    ...(land ? [{ t: r(t1 - .035), [k]: at(1 - cm, .05) }, { t: r(t1), [k]: b, [f]: h1 }] : [])];
};
const merge = (...beats) => { const m = new Map(); for (const b of beats.flat()) m.set(b.t, { ...m.get(b.t), ...b }); return [...m.values()].sort((a, b) => a.t - b.t); };
// athletic through the approach: knees flexed and the chest over the feet (critics read 3 cm higher and 4 deg prouder as "upright, passive")
// Feet: the right foot lands at .24 (.78 m from the lie) as the left leaves its standing spot, the left crosses behind it and lands
// on the drive's rear-foot spot at .58, and the right leaves at .60 and is in the air at the coil (the drive plants it at .40). The
// right lands turned 50 deg: once side-on its leg is crossed behind the left, and turned 35 the hip ran out of twist and adduction
// swinging it out again (its path missed by up to 7 cm).
const XSTEP = merge([
  { t: 0, at: [0, -.07, 1.50], pelvis: [-6, 22, 0], chest: [-16, 8, 0], head: [2, -26, 0],
    handR: [-.24, -.32, -.18], elbowR: [.02, -.28, .05], rollR: 0, handL: [.12, -.38, -.24], elbowL: [-.04, -.27, -.04], rollL: 0,
    soleR: [.12, 0, 1.52], footR: 22, soleL: [-.12, 0, 1.64], footL: 22, untwistR: 0 },
  { t: .12, at: [-.02, -.09, 1.40] },
  { t: .30, at: [0, -.15, 1.12], pelvis: [-8, 38, 0], chest: [-20, 22, 0], head: [2, -44, 0],
    handR: [-.22, -.16, -.08], elbowR: [.04, -.22, .08] },
  { t: .46, at: [.02, -.10, .80], pelvis: [-8, 70, -1], chest: [-20, 36, 2], head: [4, -62, 0],
    handR: [-.16, -.10, .24], elbowR: [.02, -.17, .14], handL: [.16, -.30, -.30], untwistR: 0 },
  // r3 athlete c2 (both m-throw critics: "the reach-back is frozen: the disc holds one shoulder-height spot behind him for
  // four frames while only the legs step", "no coil before the throw"): the arm now travels, from the tuck at the chest
  // (.46) through half way back at the cross-step (.62) to a full, slightly low extension behind with the chest turned past
  // the hips and dropped over the feet (.8-.9), the loaded coil the drive's .35 carries on from
  // g18 (m-throw 1/4: "frames 1-4 the disc stays parked in front of the chest, elbow bent, walking with a plate"): the hand went
  // straight back along the line, which the run-up camera (behind, ~30 deg off the line; on hole 1 it sits on the throwing side)
  // saw pointing into its lens at half its length, low by the hip. It now leaves the chest from .46, is straight by .62 and holds
  // a full reach at shoulder height ~30 deg off the line behind the trailing side through the plant (reads at ~85% of its length).
  // Tried and dropped: bending the elbow to lead from the plant (.40) - from that camera it read as the disc held at the hip again.
  { t: .62, at: [-.02, -.16, .40], pelvis: [-9, 90, -1], chest: [-22, 64, 3], head: [2, -80, 0], handR: [-.26, -.10, .46], elbowR: [-.09, -.12, .26], untwistR: .1 },
  // g18 c2 (m-throw 0/2: "a rigid T-arm held for strip frames 2-4 while the legs x-step"): the full coil is one moment, at .73
  // (strip frame 2 at .79 is just past it), hips turned furthest back; from there the hips open and the elbow starts the pull into
  // the drive's .35 (frame 3) at up to 4 cm a frame
  // g18 final: the strip samples the x-step at .54/.71/.92 (drive.json events), so the coil peaks at .70 with the soft, lower
  // reach of the drive's .30, and from .86 the hips open while the chest holds and the elbow drops to lead
  // g19 c2 (m-throw: "frames 2-4 hold one pose: a rigid arm straight out at shoulder height, the chest square to the lens"):
  // the chest held ~209 deg world from .70 to the drive's .42 (strip frames 2, 3 and 4) while only the hips, hidden by the
  // shorts, turned. Now the coil peaks at frame 2 (.74) with the disc at chest height and the elbow soft and up, and by frame 3
  // the chest has already unwound ~25 deg behind hips ~30 deg open, the elbow dropping to lead with the disc trailing
  { t: .74, pelvis: [-10, 102, -1], chest: [-28, 110, 4], head: [6, -86, 0], handR: [-.30, -.18, .47], elbowR: [-.18, .01, .26] },
  { t: .8, at: [-.03, -.12, .22] },
  { t: .89, pelvis: [-10, 79, -1], chest: [-24, 110, 4], head: [4, -91, 0], handR: [-.17, -.20, .35], elbowR: [-.01, -.21, .15] },
  { ...coil, t: 1 }, { ...stateAt(BH, PAST.t), t: PAST.at },
], step('R', 0, [.12, 0, 1.52], .24, [.14, 0, .78], 22, 50), step('L', .28, [-.12, 0, 1.64], .58, [-.27, 0, .29], 22, 70, [.24, .80]),
  // g19 c2 (m-throw: "the back leg kicked out" in frames 2-3): the swing to the plant skims 9 cm up instead of 15, so its knee
  // folds less and the shin no longer flicks out behind
  step('R', .60, [.14, 0, .78], 1, coil.soleR, 50, null, [.04, .22, .09], false));

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
  // r3 athlete c2 (m-putt critics: "after release his arms drop limp to his sides, the stroke barely reads"): from behind,
  // the putting arm hides behind his back whatever it does, so the stroke shows in what the camera does see: the push
  // finishes at shoulder height toward his midline (the hand clears his head's edge instead of sitting behind his shoulder)
  // and the off arm, on the camera's side, swings out from the ribs, elbow bent, as the counterweight, instead of hanging
  // r3 athlete c4 (m-putt critics: "the arm opens out to the side, a sideways wave, not a push along the line"; DGM's arm
  // "extends straight at the chains and holds"): from the putt camera (behind his left side) the finish above, 16 cm inside
  // the right shoulder at its height, hid behind his head, and the only arm in view was the off arm swinging out low: the wave.
  // After the release the right shoulder drives through (the chest opens ~25 deg over the planted feet) and the arm extends
  // fully toward the chains, the hand ~12 cm under the shoulder and ~10 cm past his midline, so the forearm and hand show
  // past his left side sloping down onto the basket and hold there; the off arm hangs by the hip instead of competing.
  // The release beat's throwing arm and torso are untouched: the aim stance seats the disc from the clip's .62 hand
  // (gltf-player.js releaseFrame), and a changed .62 changed the putt camera's still (r3 c1: camera 0/4).
  { t: .62, at: [0, -.03, -.07], pelvis: [-5, 10, 0], chest: [-6, -2, 0], head: [6, -2, 0],
    handR: [-.12, -.14, -.55], elbowR: [-.01, -.10, -.25], handL: [-.14, -.43, -.03], elbowL: [-.09, -.26, .04] },
  { t: .7, at: [0, -.02, -.10], pelvis: [-5, 11, 0], chest: [-6, 7, 0], head: [6, -15, 0],
    handR: [-.22, -.11, -.60], elbowR: [-.08, -.06, -.29] },
  { t: .8, at: [0, -.01, -.12], pelvis: [-5, 12, 0], chest: [-6, 13, 0], head: [6, -22, 0],
    handR: [-.28, -.12, -.58], elbowR: [-.11, -.05, -.29], handL: [-.12, -.49, -.01], elbowL: [-.08, -.27, .03], soleL: [-.24, .03, -.12] },
  { t: 1, at: [0, -.02, -.12], handR: [-.28, -.13, -.57], elbowR: [-.11, -.06, -.29], handL: [-.12, -.50, -.01], soleL: [-.24, .015, -.12] },
];
// the stroke up to the release is eased toward the r3 c2 finish (its throwing arm and torso), so the release key and the
// disc the aim stance seats from it stay exactly as shipped; the new finish takes over after .62
const PUTT_STROKE = [...PUTT.filter(b => b.t <= .62),
  { t: .8, at: [0, -.01, -.10], pelvis: [-4, 6, 0], chest: [-4, 0, 0], head: [4, 0, 0], handR: [-.16, .0, -.60], elbowR: [-.04, -.03, -.30],
    handL: [-.12, -.49, -.01], elbowL: [-.08, -.27, .03], soleL: [-.24, .03, -.12] },
  { t: 1, at: [0, -.02, -.10], handR: [-.16, -.02, -.60], elbowR: [-.04, -.05, -.30], handL: [-.12, -.50, -.01], soleL: [-.24, .015, -.12] }];

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
// Feet: the right foot lands at .20 (.97 m from the lie) as the left leaves, the left lands at .50 (.42 m), the right hops past it
// onto the drive's back-foot spot at .76 already turned to its heading, and the left leaves at .80 and swings through to the plant.
const FXSTEP = merge([
  { ...XSTEP[0] },
  { t: .12, at: [0, -.05, 1.42] },
  { t: .32, at: [.02, -.07, 1.02], pelvis: [-4, 5, 0], chest: [-8, -5, 0], head: [-2, 10, 0] },
  { t: .5, at: [.03, -.06, .66], handR: [.16, -.34, -.05], elbowR: [.02, -.26, .10], handL: [.12, -.42, -.24] },
  { t: .62, at: [.04, -.07, .42], pelvis: [-4, -25, 0], chest: [-7, -22, 0], head: [6, 45, 0] },
  { t: .78, at: [.07, -.05, .18] },
  { t: .88, at: [.08, -.09, .08] },
  { ...load, t: 1 }, { ...stateAt(FH, PAST.t), t: PAST.at },
], step('R', 0, [.12, 0, 1.52], .20, [.15, 0, .97], 22, 0), step('L', .23, [-.12, 0, 1.64], .50, [-.12, 0, .42], 22, -20),
  step('R', .53, [.15, 0, .97], .76, [.25, 0, -.04], 0, -20), step('L', .80, [-.12, 0, .42], 1, load.soleL, -20, null, null, false));

const SOLVED = { backhand: clip('backhand', BH, warmFrom('backhand')), xstep: null };   // the run-ups after their drives (solved back from them), listed in the old order
// The drive's release key (.62) as shipped: the aim stance seats the disc from it (gltf-player.js releaseFrame) and the solve's
// warm start drifts it by ~.001-.003 rad whenever the windup before it changes, which would move the athlete still for nothing.
// ponytail: the key is carried over from the last solve; PIN_RELEASE=0 re-solves it (do that when the release beat itself changes).
if (process.env.PIN_RELEASE !== '0') { const shipped = SHIPPED.backhand.find(k => k.t === .62), i = SOLVED.backhand.findIndex(k => k.t === .62), d = Math.max(...Object.keys(shipped).filter(j => Array.isArray(shipped[j])).flatMap(j => shipped[j].map((x, c) => Math.abs(x - SOLVED.backhand[i][j][c]))));
  console.log('backhand .62 drift from the shipped key', d.toFixed(4), 'rad (pinned)'); SOLVED.backhand[i] = shipped; }
SOLVED.putt = clip('putt', PUTT, warmFrom('putt'), { beats: PUTT_STROKE, upto: .62 });
SOLVED.forehand = clip('forehand', FH, warmFrom('forehand'));
SOLVED.xstep = clip('xstep', XSTEP, warmFrom('putt'), null, SOLVED.backhand.find(k => k.t === .35));
SOLVED.fxstep = clip('fxstep', FXSTEP, warmFrom('putt'), null, SOLVED.forehand.find(k => k.t === .35));
// a run-up's last key is its drive's .35 key itself: the same targets solved from another warm start can land on an equivalent
// arm with a few degrees more upper-arm twist, which would pop at the handover
for (const [run, drive] of [['xstep', 'backhand'], ['fxstep', 'forehand']]) SOLVED[run][SOLVED[run].findIndex(k => k.t === 1)] = { ...SOLVED[drive].find(k => k.t === .35), t: 1 };
// ...and the key past it (the drive's next) is the drive's own too
for (const [run, drive] of [['xstep', 'backhand'], ['fxstep', 'forehand']]) { const k = SOLVED[run].at(-1); SOLVED[run][SOLVED[run].length - 1] = { ...SOLVED[drive].find(d => d.t === PAST.t), t: k.t }; }

writeFileSync(new URL('../src/throw-keys.js', import.meta.url), `// Generated by tools/author-throws.mjs (the throw solver); edit the beats there, not these keys.\nexport const SOLVED = ${JSON.stringify(SOLVED)};\n`);
