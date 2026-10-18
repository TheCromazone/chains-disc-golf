// Forward kinematics of ChainsRig (the eleven-joint athlete), in the actor's own frame: metres, +Y up, facing -Z (the target),
// +X the athlete's right. Mirrors what three.js does with the shared pose contract (src/throw-poses.js): every joint's rest
// orientation is identity, a pose angle is an 'XYZ' Euler, the root carries the authored travel (rootX/rootZ) and the height
// that puts the lower sole on the ground. Used by tools/author-throws.mjs (the throw solver) and by QA reports of a clip
// (sole slide, hand path, release height).
import { soleHeights } from '../src/throw-poses.js';

// Bone rest offsets (parent-relative) of the shipped male athlete (assets/models/golfer*.glb), handOffset to the grip point,
// and the sole ellipsoid the Blender bake grounds the clips with (tools/golfer-rig.json "ground").
export const RIG = {
  root: [.0069, .9699, .0147], spine: [-.0011, .147, -.0068], head: [-.0034, .3598, -.0164],
  shR: [.1697, .3178, .0022], elR: [0, -.2939, 0], shL: [-.1765, .312, .0023], elL: [0, -.2946, 0],
  hipR: [.091, -.0896, .0016], knR: [0, -.3601, 0], hipL: [-.0999, -.0898, .0017], knL: [0, -.3616, 0],
  hand: [0, -.3594, -.012], sole: [0, -.5202, -.0351], soleRadii: [.0673, .012, .1489],
};
// soleHeights() geometry for the same rig, so a pose's height is solved exactly as the bake solves it
export const GROUND = { root: .9699, hipDrop: .0896, hipX: .0979, thigh: .3601, sole: RIG.sole, soleRadii: RIG.soleRadii };
const PARENT = { spine: 'root', head: 'spine', shR: 'spine', elR: 'shR', shL: 'spine', elL: 'shL', hipR: 'root', knR: 'hipR', hipL: 'root', knL: 'hipL' };

// 3x3 rotation matrices as flat arrays (row-major)
const mul = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export function euler([x, y, z]) {   // three.js Euler 'XYZ': R = Rx * Ry * Rz
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  return [c * e, -c * f, d, a * f + b * e * d, a * e - b * f * d, -b * c, b * f - a * e * d, b * e + a * f * d, a * c];
}
export function toEuler(m) {   // inverse of euler() (three.js Euler.setFromRotationMatrix, order XYZ)
  const y = Math.asin(Math.max(-1, Math.min(1, m[2])));
  return Math.abs(m[2]) < .9999999 ? [Math.atan2(-m[5], m[8]), y, Math.atan2(-m[1], m[0])] : [Math.atan2(m[7], m[4]), y, 0];
}
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len = v => Math.hypot(...v), scale = (v, s) => v.map(x => x * s), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = v => scale(v, 1 / (len(v) || 1));
export { mul, apply };

// World transforms of every joint plus the grip points, the sole centres and the chest's facing, for a pose
// { root: [x,y,z], ..., rootY?, rootX?, rootZ? }. ground: true solves rootY the way poseAt/the bake do (lower sole on y = 0).
export function fk(pose, { ground = true } = {}) {
  const rootY = ground ? -Math.min(...soleHeights(pose, false, GROUND)) : (pose.rootY || 0);
  const W = { root: { p: [RIG.root[0] + (pose.rootX || 0), RIG.root[1] + rootY, RIG.root[2] + (pose.rootZ || 0)], m: euler(pose.root) } };
  for (const j of ['spine', 'head', 'shR', 'elR', 'shL', 'elL', 'hipR', 'knR', 'hipL', 'knL']) {
    const P = W[PARENT[j]]; W[j] = { p: add(P.p, apply(P.m, RIG[j])), m: mul(P.m, euler(pose[j])) };
  }
  const handR = add(W.elR.p, apply(W.elR.m, RIG.hand)), handL = add(W.elL.p, apply(W.elL.m, RIG.hand));
  const sole = side => { const k = W['kn' + side]; return add(k.p, apply(k.m, RIG.sole)); };
  const toe = side => { const k = W['kn' + side]; return add(k.p, apply(k.m, add(RIG.sole, [0, 0, -RIG.soleRadii[2]]))); };
  const facing = m => { const f = apply(m, [0, 0, -1]); return Math.atan2(-f[0], -f[2]); };   // yaw of a frame's -Z, 0 = at the target, + = turned left
  return { W, rootY, handR, handL, soleR: sole('R'), soleL: sole('L'), toeR: toe('R'), toeL: toe('L'), pelvisYaw: facing(W.root.m), chestYaw: facing(W.spine.m), headYaw: facing(W.head.m) };
}
