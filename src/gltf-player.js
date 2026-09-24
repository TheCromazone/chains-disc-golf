// Blender-authored athletes (tools/build-golfer-v3.py) driven by the shared clip set. The rig node carries
// extras (hand socket, head ellipsoid, eye and chest lines, region luminance, leg scale) so the disc grip,
// prints and recolouring follow whatever body Blender exported. The male and female bodies share the rig,
// the clips and every hair, headwear and glasses variant.
import * as THREE from 'three';
import { cloneModel, model } from './models.js';
import { rimLight } from './materials.js';
import { bodyMaterial, skinDirect, skinShade, NOISE_GLSL, PORES_GLSL } from './body-material.js';
import { JOINTS, RIGS, readyPose, heroPose, mirrorPose, poseAt, keysFor, soleHeights, STANCE_FADE, stanceFade, STANCE_F } from './throw-poses.js';

const HEIGHT = { short: .94, average: 1, tall: 1.06 };
const SLOT = { hair: { roughness: .7, rim: .22 }, headwear: { roughness: .8 }, trim: { roughness: .78 }, frame: { roughness: .42, color: '#1a1c22' }, lens: { roughness: .15, color: '#14171c', metalness: .3, opacity: .86 } };
const DOME_HATS = new Set(['cap', 'backcap', 'beanie', 'bucket']), BIG_HAIR = new Set(['curly', 'wavy', 'sidepart', 'afro', 'mohawk']);   // volume no hat could sit over; 'short' is the scan's own hair, no mesh
const _v = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _gi = new THREE.Quaternion(), _q = new THREE.Quaternion(), _eu = new THREE.Euler();
const FLIP = new THREE.Quaternion(0, 1, 0, 0), UP = new THREE.Vector3(0, 1, 0);   // FLIP: half turn about the forearm, puts the carried disc's face on the knuckle side, where a lens in front sees it
const glassesOf = a => a.glasses && a.glasses !== 'none' ? a.glasses : a.shades ? 'sport' : 'none';
const REACH = new THREE.Sphere(new THREE.Vector3(0, .95, 0), 1.6);
// The female scan keeps folded slivers and ~1600 flipped triangles; Blender's vertex normals follow them and the cloth
// shades as dark shards (the male scan has a few too: dark ticks by his collar and chest print). Rebuild them once per
// loaded body: every face oriented to agree with the normals it replaces, area-weighted, shared across UV-seam
// duplicates, then relaxed over the neighbours (the head keeps its own detail).
// ponytail: a flood-filled consistent winding looked the same here; the one remaining dark wedge on her upper back is a
// real fold of the scan, which only a mesh fix removes.
function relaxNormals(g, headBone, passes = 3) {
  if (g.userData.relaxed) return; g.userData.relaxed = true;
  const pos = g.attributes.position, nrm = g.attributes.normal, idx = g.index.array, n = pos.count, weld = new Int32Array(n), key = new Map();
  for (let i = 0; i < n; i++) { const k = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4); let w = key.get(k); if (w === undefined) key.set(k, w = key.size); weld[i] = w; }
  const W = key.size, was = new Float32Array(W * 3), acc = new Float32Array(W * 3), head = new Uint8Array(W), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  for (let i = 0; i < n; i++) { const w = weld[i] * 3; was[w] += nrm.getX(i); was[w + 1] += nrm.getY(i); was[w + 2] += nrm.getZ(i); for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === headBone && sw.getComponent(i, k) > .5) head[weld[i]] = 1; }
  const links = Array.from({ length: W }, () => new Set());
  for (let f = 0; f < idx.length; f += 3) {
    const p = [idx[f], idx[f + 1], idx[f + 2]], q = p.map(i => weld[i]);
    a.fromBufferAttribute(pos, p[0]); b.fromBufferAttribute(pos, p[1]).sub(a); c.fromBufferAttribute(pos, p[2]).sub(a); b.cross(c);   // area-weighted face normal
    const s = q.reduce((d, w) => d + b.x * was[w * 3] + b.y * was[w * 3 + 1] + b.z * was[w * 3 + 2], 0) < 0 ? -1 : 1;
    for (const w of q) { acc[w * 3] += s * b.x; acc[w * 3 + 1] += s * b.y; acc[w * 3 + 2] += s * b.z; }
    links[q[0]].add(q[1]).add(q[2]); links[q[1]].add(q[0]).add(q[2]); links[q[2]].add(q[0]).add(q[1]);
  }
  const unit = v => { for (let w = 0; w < W; w++) { const l = Math.hypot(v[w * 3], v[w * 3 + 1], v[w * 3 + 2]) || 1; v[w * 3] /= l; v[w * 3 + 1] /= l; v[w * 3 + 2] /= l; } return v; };
  let cur = unit(acc);
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.slice();
    for (let w = 0; w < W; w++) if (!head[w]) for (const o of links[w]) { next[w * 3] += .5 * cur[o * 3]; next[w * 3 + 1] += .5 * cur[o * 3 + 1]; next[w * 3 + 2] += .5 * cur[o * 3 + 2]; }
    cur = unit(next);
  }
  for (let i = 0; i < n; i++) { const w = weld[i] * 3; nrm.setXYZ(i, cur[w], cur[w + 1], cur[w + 2]); }
  nrm.needsUpdate = true;
}

// Hands. The rig has no finger or wrist bones, and the scan's hands hang half open (the build leaves them so), which is what
// the off hand and every bystander show. Built once per body from its bind pose, hand-local and mirrored so the palm faces
// -x on either side (fingers along -y, thumb toward -z), with lengths in units of the hand's own wrist-to-fingertip drop L
// so the female scan and the phone LODs fit too.
//  2/3 hook (R/L) morph: the scanned fingers curled round a rim, whenever the hand holds a disc outside the backhand set-up
//      (the carry at the thigh, the other stances, the throw until release).
//  0/1 tuck (R/L) morph + grip hand: in the backhand set-up the scanned hand folds away into the wrist and a modelled hand,
//      a child of the forearm bone, takes its place: the rim in the crease of the palm, four separate fingers hooked under it
//      into the cavity below the flight plate, the thumb along the top of the plate. The scan's fingers are fused, so any fold
//      of them read as a mitten or a fist at the tee (every losing critic named it); these are tubes with real gaps and
//      knuckles. The stance pairs it with a seat (disc centre and normal in the forearm bone's frame).
// Joints as shares of the hanging hand's wrist-to-fingertip drop: knuckles .55, middle joints .79, end joints .9.
const HOOK = [[.9, .5], [.79, 1.2], [.55, .7]];   // (joint, angle), distal first
// The grip hand, in metres for a 19 cm hand (scaled by L): the rim's mid-plane `rim` below the wrist, the wrist flexed `flex`
// (radians, toward the palm) blended over `wrist` (shares of L either side of the joint): past ~30° the hand hung off the
// forearm like a claw. Fingers: knuckle (x, y, z), phalanx lengths, radii at knuckle/middle/end joint/tip, curl at the three
// joints (degrees, toward the palm). Thumb: joint points.
// taper: the forearm's last 11 cm narrow by this share into the wrist (critics read the scan's forearm as a tube of one width
// down into the hand, "no clear wrist")
// cock (round 11): solved with the stance so the forearm can reach level toward the tee camera with the plate level and the
// disc reaching back across the chest (the old cock held it level only at the end of a forearm dropping ~33°, which the tee
// camera, above the shoulder, saw as an arm hanging to the hip). Round 12: re-solved with the screen-space stance; round 14
// re-solved jointly with it again (throw-poses.js STANCE.backhand) so the hand, not the elbow, leads toward the target.
const GRIP = { rim: -.092, flex: .5, tilt: .6, cock: [-1.375, -.567, -.169], wrist: [.12, -.12], press: .003, chroma: .6, tone: .8, taper: .16,
  fingers: [[[.002, -.098, -.029], [.041, .025, .019], [.0098, .009, .008, .0068], [62, 100, 66]], [[.002, -.100, -.009], [.045, .028, .02], [.0102, .0094, .0083, .007], [60, 102, 66]],
    [[.002, -.098, .01], [.042, .026, .02], [.0096, .0088, .0078, .0066], [62, 102, 66]], [[.001, -.091, .027], [.034, .02, .017], [.0084, .0077, .0068, .0058], [66, 104, 66]]],
  thumb: [[-.003, -.012, -.022], [-.007, -.03, -.033], [-.013, -.058, -.043], [-.035, .014, -.048], [-.06, .015, -.044]], thumbR: [.0125, .0118, .0105, .0095, .0082] };   // thumb y after the MCP is relative to the rim
// The same hand at rest, for the free hand in the set-up: the scan's hanging hand is one fused mitten ("a mitten under a
// swollen wrist knob"). Fingers in a loose cascade, more curl toward the little finger; the thumb lies along the index. Curled
// about twice as far as it first was: straighter, the four fingers read at the tee as "a flat paddle".
const REST = { curl: [[22, 42, 24], [26, 50, 28], [30, 56, 30], [34, 62, 32]], thumb: [[-.003, -.012, -.022], [-.007, -.03, -.033], [-.013, -.058, -.043], [-.016, -.079, -.045], [-.019, -.103, -.04]] };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const taperAt = y => 1 - GRIP.taper * smooth(.11, 0, y);   // y: metres above the wrist joint
function turn(p, o, axis, ang) { const x = p.x - o.x, y = p.y - o.y, z = p.z - o.z; _v.set(x, y, z).applyAxisAngle(axis, ang); return p.set(o.x + _v.x, o.y + _v.y, o.z + _v.z); }
// Lofted tube through a centreline (C: points, R: radius per point, or [a, b, U, V] per ring for the palm), `seg` round,
// closed with a rounded cap at the end. Pushes positions and indices (outward winding) into `out`.
function loft(out, rings, seg, capLen) {
  const base = out.p.length / 3;
  // bump (optional, per ring): t -> [radius share, ridge 0..1] pushes the ring out (tendons, knuckles) and records how far down in a valley the texel sits, for occlusion
  const ring = (c, u, v, a, b, bump) => { for (let j = 0; j < seg; j++) { const t = j / seg * Math.PI * 2, [m, h] = bump ? bump(t) : [0, 0], cs = Math.cos(t) * a * (1 + m), sn = Math.sin(t) * b * (1 + m); out.h?.push(h); out.p.push(c.x + u.x * cs + v.x * sn, c.y + u.y * cs + v.y * sn, c.z + u.z * cs + v.z * sn); } };
  for (const r of rings) ring(r.c, r.u, r.v, r.a, r.b, r.bump);
  const last = rings[rings.length - 1], t = last.u.clone().cross(last.v).normalize(), caps = 3;
  for (let k = 1; k <= caps; k++) { const phi = k / (caps + 1) * Math.PI / 2; ring(last.c.clone().addScaledVector(t, capLen * Math.sin(phi)), last.u, last.v, last.a * Math.cos(phi), last.b * Math.cos(phi)); }
  const n = rings.length + caps; out.p.push(...last.c.clone().addScaledVector(t, capLen).toArray());
  for (let k = 0; k < n - 1; k++) for (let j = 0; j < seg; j++) { const a = base + k * seg + j, b = base + k * seg + (j + 1) % seg, c = b + seg, d = a + seg; out.i.push(a, b, c, a, c, d); }
  const tipI = base + n * seg; for (let j = 0; j < seg; j++) out.i.push(base + (n - 1) * seg + j, base + (n - 1) * seg + (j + 1) % seg, tipI);
}
function tube(out, pts, radii, seg, steps) {   // a finger: centripetal Catmull-Rom through the joints, radius eased between them
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), fr = curve.computeFrenetFrames(steps, false);
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const rad = s => { const d = s * cum[cum.length - 1]; let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; return THREE.MathUtils.lerp(radii[i - 1], radii[i], smooth(cum[i - 1], cum[i], d)); };
  const rings = []; for (let k = 0; k <= steps; k++) { const s = k / steps, r = rad(s); rings.push({ c: curve.getPointAt(s), u: fr.normals[k], v: fr.binormals[k], a: r, b: r }); }
  loft(out, rings, seg, radii[radii.length - 1]);
}
// The grip hand in hand-local metres (before the wrist flex), for a hand of drop L and a measured wrist (half sizes a along z,
// b along x, centre cx, cz). Returns positions, indices, a per-vertex occlusion (dark between the digits) and the seat.
function gripHand(L, wrist, lod, rest = false) {
  // the free hand hung at the tee "oversized, a spade" next to the forearm: its digits run a little shorter than the grip's
  const k = L / .19 * (rest ? .9 : 1), seg = lod ? 7 : 10, steps = lod ? 7 : 16, out = { p: [], i: [] }, axes = [];
  const V = (x, y, z) => new THREE.Vector3(x * k, y * k, z * k);
  // palm: from inside the forearm, through the scan's own wrist, out to the knuckle ridge
  const U = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(-1, 0, 0), palm = [[.02, wrist.a * .9 / k, wrist.b * .9 / k], [0, wrist.a * .98 / k, wrist.b * .98 / k], [-.025, .033, .019], [-.055, .039, .0165], [-.08, .043, .0155], [-.096, .0435, .015]];
  // the back of the hand: four extensor tendons fanning from the wrist to raised knuckles, the valleys between them shaded
  // (a smooth ellipse there read as "a flat spade-shaped paddle"). The palm faces -x, so its back is sin(t) < 0; z = cos(t) a
  out.h = []; const backOfHand = (t, y, a, b) => {
    const dors = smooth(.1, .7, -Math.sin(t)) * smooth(-.012, -.045, y), z = Math.cos(t) * a, spread = .5 + .5 * smooth(-.02, -.09, y);
    let ridge = 0; for (const [kn] of GRIP.fingers) ridge = Math.max(ridge, Math.exp(-(((z - kn[2] * spread) / .0045) ** 2)));
    return [dors * ridge * (.0014 + .0022 * smooth(-.07, -.092, y)) / b, dors * (1 - ridge)];
  };
  loft(out, palm.map(([y, a, b], j) => ({ c: new THREE.Vector3(wrist.cx * (1 - smooth(0, -.04 * k, y * k)), y * k, wrist.cz * (1 - smooth(0, -.04 * k, y * k)) - .004 * k * smooth(0, -.04 * k, y * k)), u: U, v: X, a: a * k * (j < 2 ? taperAt(y * k) : 1), b: b * k * (j < 2 ? taperAt(y * k) : 1), bump: t => backOfHand(t, y, a, b) })), lod ? seg + 4 : 30, .014 * k);   // the wrist rings follow the tapered forearm
  const valley = out.h; out.h = null;
  const partEnd = [out.p.length / 3];
  // the rim touches the palm at C; the disc's far side rises `tilt` (radians) from square to the hand, toward the forearm,
  // so the hand can lean off vertical with a level disc; the fingers past the knuckle and the thumb's tip turn with the rim
  const rimY = GRIP.rim * k, x0 = palm[palm.length - 1][2] * k, C = new THREE.Vector3(-x0, rimY, 0), Zt = new THREE.Vector3(0, 0, 1), t = rest ? 0 : GRIP.tilt;
  for (const [f, [kn, len, r, grip]] of GRIP.fingers.entries()) {
    const curl = rest ? REST.curl[f] : grip;
    const mcp = V(...kn), pts = [mcp.clone().add(V(0, .018, 0)), mcp]; let ang = 0, at = mcp.clone();
    for (let j = 0; j < 3; j++) { ang += curl[j] * Math.PI / 180; at = at.clone().add(new THREE.Vector3(-Math.sin(ang), -Math.cos(ang), 0).multiplyScalar(len[j] * k - (j === 2 ? r[3] * k : 0))); pts.push(at); }
    for (const p of pts.slice(2)) turn(p, C, Zt, -t);
    tube(out, pts, [r[0], ...r].map(x => x * k * .88), seg, steps); axes.push({ pts, r: r[1] * k * .88 }); partEnd.push(out.p.length / 3);   // slimmer than measured, so a dark gap shows between each pair ("fused, no finger separation")
  }
  const tp = (rest ? REST.thumb : GRIP.thumb).map(([x, y, z], j) => j < 3 || rest ? V(x, y, z) : turn(new THREE.Vector3(x * k, rimY + y * k, z * k), C, Zt, -t));
  tube(out, tp, GRIP.thumbR.map(x => x * k * .9), seg, steps); axes.push({ pts: tp, r: GRIP.thumbR[2] * k * .9 }); partEnd.push(out.p.length / 3);
  // occlusion: a digit's surface darkens where another digit's surface is within a centimetre (the gaps that separate them)
  const ao = new Float32Array(out.p.length / 3).fill(1), q = new THREE.Vector3(), segDist = (p, a, b) => { const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(q.copy(p).sub(a).dot(ab) / ab.lengthSq(), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  for (let part = 1; part < partEnd.length; part++) for (let i = partEnd[part - 1]; i < partEnd[part]; i++) {
    const p = new THREE.Vector3(out.p[i * 3], out.p[i * 3 + 1], out.p[i * 3 + 2]); let clear = 1;
    axes.forEach((ax, j) => { if (j === part - 1) return; for (let s = 1; s < ax.pts.length; s++) clear = Math.min(clear, segDist(p, ax.pts[s - 1], ax.pts[s]) - ax.r); });
    ao[i] = .3 + .7 * smooth(0, .014 * k, clear);   // at .5 the gaps vanished at 640 px and critics saw "one fused block"
  }
  valley.forEach((v, i) => { ao[i] *= 1 - .4 * v; });
  // knuckle creases and nails on the four fingers: a vertex's arc length along its finger's joint polyline says how near a
  // joint it sits (creases darken, and redden via the shader's AO tint); past the last joint, the side away from the curl
  // takes a paler nail. Critics: "no knuckles, nails or creases", "a smooth rubber mitten"
  for (let f = 0; f < 4; f++) {
    const P = axes[f].pts, cum = [0]; for (let s = 1; s < P.length; s++) cum.push(cum[s - 1] + P[s].distanceTo(P[s - 1]));
    const T = P[P.length - 1].clone().sub(P[P.length - 2]).normalize(), D = new THREE.Vector3(-T.y, T.x, 0).normalize();
    for (let i = partEnd[f]; i < partEnd[f + 1]; i++) {
      const p = new THREE.Vector3(out.p[i * 3], out.p[i * 3 + 1], out.p[i * 3 + 2]); let best = 1e9, arc = 0, foot = null;
      for (let s = 1; s < P.length; s++) { const ab = P[s].clone().sub(P[s - 1]), t = THREE.MathUtils.clamp(q.copy(p).sub(P[s - 1]).dot(ab) / ab.lengthSq(), 0, 1), c = P[s - 1].clone().addScaledVector(ab, t), d = p.distanceTo(c); if (d < best) { best = d; arc = cum[s - 1] + t * ab.length(); foot = c; } }
      let crease = 0; for (const j of [2, 3]) crease = Math.max(crease, Math.exp(-(((arc - cum[j]) / (.0032 * k)) ** 2)));
      crease = Math.max(crease, .6 * Math.exp(-(((arc - cum[1]) / (.004 * k)) ** 2)));
      ao[i] *= 1 - .32 * crease;
      if (arc > cum[3] + .35 * (cum[4] - cum[3]) && p.clone().sub(foot).normalize().dot(D) > .35) ao[i] = Math.max(ao[i], 1.16);   // nail: >1 so the shader's crease tint leaves it pale
    }
  }
  const seat = C.clone().add(new THREE.Vector3(-Math.cos(t), Math.sin(t), 0).multiplyScalar(.105 - GRIP.press * k)).setZ(-.006 * k);
  return { p: out.p, i: out.i, ao, seat, seatN: new THREE.Vector3(Math.sin(t), Math.cos(t), 0) };
}
function handMorphs(mesh, handOffset, lod) {
  const g = mesh.geometry; if (g.userData.grip) return g.userData.grip;
  const pos = g.attributes.position, nrm = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = pos.count, seats = {}, hands = {}, rests = {}, tucks = [], hooks = [];
  const Z = new THREE.Vector3(0, 0, -1), m = new THREE.Matrix4(), p = new THREE.Vector3(), o = new THREE.Vector3();
  for (const [name, side] of [['elR', 1], ['elL', -1]]) {
    const b = mesh.skeleton.bones.findIndex(x => x.name === name), E = new THREE.Vector3().setFromMatrixPosition(m.copy(mesh.skeleton.boneInverses[b]).invert());
    const W = E.clone().add(_v.set(handOffset.x * side, handOffset.y + .075, handOffset.z + .012));   // the wrist joint (build-golfer-v3.py: handOffset = wrist - elbow + (0, -.075, -.012))
    const local = i => p.set((pos.getX(i) - W.x) * side, pos.getY(i) - W.y, pos.getZ(i) - W.z);
    const hand = [], arm = [], fore = []; let tip = 0;
    for (let i = 0; i < n; i++) { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === b) w += sw.getComponent(i, k); if (w > .3 && local(i).y < .02) { hand.push(i); tip = Math.min(tip, p.y); } else if (w > .5 && p.y < .11) fore.push(i); if (w > .5 && p.y > .005 && p.y < .035) arm.push(p.clone()); }
    const P = hand.map(i => local(i).clone()), N = hand.map(i => new THREE.Vector3(nrm.getX(i) * side, nrm.getY(i), nrm.getZ(i)));
    // everything past the hinge line (weighted by mask, blended over ±band) rotates toward the palm about the line's centre;
    // R is the shape the weights and pivot are read from, so hinges applied distal first compose like a finger's joints
    const hinge = (R, y0, band, ang, mask) => {
      let sx = 0, c = 0; R.forEach((r, k) => { if (Math.abs(r.y - y0) < band * .75 && mask(k) > .5) { sx += r.x; c++; } });
      if (!c) return; o.set(sx / c, y0, 0);
      R.forEach((r, k) => { const w = mask(k) * smooth(y0 + band, y0 - band, r.y); if (w > 0) { turn(P[k], o, Z, w * ang); N[k].applyAxisAngle(Z, w * ang); } });
    };
    const L = -tip, R = P.map(v => v.clone());
    // fingers vs thumb: split at the gap in front of the index finger (~.25 L forward of the wrist)
    const F = R.map(r => smooth(-.28 * L, -.22 * L, r.z));
    const fingers = hand.length > 200;   // the female scan's hands are ~30-point mittens that folds break into shards: a gentler hook
    for (const [f, a] of HOOK) hinge(R, -f * L, (fingers ? .03 : .06) * L, a * (fingers ? 1 : .6), k => F[k]);
    const hook = [P.map(v => v.clone()), N.map(v => v.clone())];
    // the forearm, as measured on the scan just above the wrist, so the grip hand's palm continues it (measured below the
    // joint, the spreading hand and thumb base made the palm flare out of the sleeve of skin like a glove's cuff)
    let ax = 0, bx = 0, cx = 0, cz = 0; arm.forEach(r => { cx += r.x; cz += r.z; }); cx /= arm.length || 1; cz /= arm.length || 1;
    arm.forEach(r => { ax = Math.max(ax, Math.abs(r.z - cz)); bx = Math.max(bx, Math.abs(r.x - cx)); });
    const gh = gripHand(L, { a: ax || .03, b: bx || .02, cx, cz }, lod);
    // the wrist flex, blended across the joint; the grip hand and the tucked scan bend together
    const qw = new THREE.Quaternion().setFromAxisAngle(Z, GRIP.flex), qi = new THREE.Quaternion(), qk = new THREE.Quaternion();
    const bend = (v, q = qw) => { const w = smooth(GRIP.wrist[0] * L, GRIP.wrist[1] * L, v.y); if (w > 0) v.applyQuaternion(qk.copy(qi).slerp(q, w)); return v; };
    // the gripping hand is also cocked (GRIP.cock, before the flex, blended across the same band so the wrist bends rather
    // than steps): the plate's normal leaves the flex plane, so a thumb-up hand holds the disc level at the end of a forearm
    // lying across the chest. With flex and tilt alone the disc was level only with the palm turned down, which a forearm
    // reaching toward the target from an elbow in front of the ribs cannot do (the solve folded it into a chicken wing)
    const qg = qw.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...GRIP.cock, 'XYZ')));
    // tuck: the scanned hand folds into a small core inside the grip hand's palm
    const taper = v => { const s = taperAt(v.y); v.x = cx + (v.x - cx) * s; v.z = cz + (v.z - cz) * s; return v; };
    const TP = R.map(r => { const t = smooth(.014, -.004, r.y); return bend(taper(new THREE.Vector3(r.x + (cx + (r.x - cx) * .15 - r.x) * t, r.y + (-.016 + (r.y + .016) * .08 - r.y) * t, r.z + (cz + (r.z - cz) * .15 - r.z) * t))); });   // all of it inside the grip palm: half-tucked, the scan's thumb base stood out of it as a flap
    const FP = fore.map(i => bend(taper(local(i).clone()))), FN = fore.map(i => new THREE.Vector3(nrm.getX(i) * side, nrm.getY(i), nrm.getZ(i)));   // the forearm above the hand: tapered only
    const c = gh.seat.clone().applyQuaternion(qg), cn = gh.seatN.applyQuaternion(qg);
    seats[name] = { c: new THREE.Vector3(c.x * side + W.x - E.x, c.y + W.y - E.y, c.z + W.z - E.z), n: new THREE.Vector3(cn.x * side, cn.y, cn.z) };
    // the grip hand's geometry in the forearm bone's frame (bind orientation is identity), mirrored for the left
    const handGeo = (h, q) => {
      const gp = new Float32Array(h.p.length); for (let i = 0; i < h.p.length; i += 3) { bend(_v.set(h.p[i], h.p[i + 1], h.p[i + 2]), q); gp[i] = _v.x * side + W.x - E.x; gp[i + 1] = _v.y + W.y - E.y; gp[i + 2] = _v.z + W.z - E.z; }
      const gi = side > 0 ? h.i : h.i.map((v, i) => i % 3 === 1 ? h.i[i + 1] : i % 3 === 2 ? h.i[i - 1] : v);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(gp, 3)); geo.setIndex(gi); geo.computeVertexNormals();
      // a vertex whose triangles all collapsed (a cap ring shrunk to its tip) gets a zero normal, normalize() in the shader
      // turns it into NaN, and bloom spreads that one pixel into a glowing white square on the hand
      const nm = geo.attributes.normal; for (let i = 0; i < nm.count; i++) if (!(Math.hypot(nm.getX(i), nm.getY(i), nm.getZ(i)) > 1e-6)) nm.setXYZ(i, 0, 1, 0);
      const ao = new Float32Array(h.ao.length * 3); h.ao.forEach((v, i) => ao.set([v, v, v], i * 3)); geo.setAttribute('color', new THREE.BufferAttribute(ao, 3));
      return geo;
    };
    hands[name] = handGeo(gh, qg); rests[name] = handGeo(gripHand(L, { a: ax || .03, b: bx || .02, cx, cz }, lod, true));   // the rest hand shares the grip's wrist flex, so the tucked scan wrist bends to meet either
    const delta = (Q, M, idx = hand) => {
      const dp = new Float32Array(n * 3), dn = new Float32Array(n * 3);
      idx.forEach((i, k) => {
        dp[i * 3] = Q[k].x * side + W.x - pos.getX(i); dp[i * 3 + 1] = Q[k].y + W.y - pos.getY(i); dp[i * 3 + 2] = Q[k].z + W.z - pos.getZ(i);
        dn[i * 3] = M[k].x * side - nrm.getX(i); dn[i * 3 + 1] = M[k].y - nrm.getY(i); dn[i * 3 + 2] = M[k].z - nrm.getZ(i);
      });
      return [new THREE.BufferAttribute(dp, 3), new THREE.BufferAttribute(dn, 3)];
    };
    tucks.push(delta(TP.concat(FP), hook[1].concat(FN), hand.concat(fore))); hooks.push(delta(...hook));
  }
  const all = [...tucks, ...hooks];   // 0/1 tuck R/L, 2/3 hook R/L
  g.morphAttributes.position = all.map(t => t[0]); g.morphAttributes.normal = all.map(t => t[1]); g.morphTargetsRelative = true;
  return g.userData.grip = { seats, hands, rests };
}

// Hair cards over the scan's own short hair. Its cap is painted on the skull, and every tee critic read it (and the noise
// shells that followed it) as "a smooth dark shell with a hard outline, no strands": now a mop of alpha-tested cards, strips
// rooted on the scalp that grow away from the crown and fall under gravity (a fringe forward over the brow, the sides over
// the ears' tops, the back to the nape), lying in layers over the head and textured from a strand atlas, so the outline
// breaks into strands and clumps against the sky. One skinned mesh (one draw) on the head bone, built once per loaded body
// in its bind space; a card whose root lands off the hair mask collapses in the vertex shader, so the face stays clear.
function hairCards(skin, spec, count) {
  const g = skin.geometry; if (g.userData.cards?.count === count) return g.userData.cards.geo;
  const head = skin.skeleton.bones.findIndex(b => b.name === 'head'), si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index.array, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
  const onHead = i => { for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === head && sw.getComponent(i, k) > .5) return true; return false; };
  const hc = new THREE.Vector3(...(spec.headCentre || [0, 1.69, -.016])), R = new THREE.Vector3(...(spec.headRadii || [.083, .142, .102])), eyeY = spec.eyeY || hc.y + .03;
  const tris = [], cum = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let area = 0, topY = -1e9;
  for (let f = 0; f < idx.length; f += 3) {
    if (!(onHead(idx[f]) && onHead(idx[f + 1]) && onHead(idx[f + 2]))) continue;
    a.fromBufferAttribute(P, idx[f]); b.fromBufferAttribute(P, idx[f + 1]); c.fromBufferAttribute(P, idx[f + 2]); topY = Math.max(topY, a.y, b.y, c.y);
    const cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
    if (cy < eyeY - .13 || (cz < hc.z - .03 && cy < eyeY + .04)) continue;   // neck and face: never hair
    area += b.clone().sub(a).cross(c.clone().sub(a)).length(); tris.push(f); cum.push(area);
  }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const crown = new THREE.Vector3(hc.x, topY - .015, hc.z + .02), ell = v => Math.hypot((v.x - hc.x) / R.x, (v.y - hc.y) / R.y, (v.z - hc.z) / R.z);
  const S = 5, pos = [], nrm = [], uv = [], root = [], tan = [], col = [], index = [], p = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3(), t = new THREE.Vector3(), w = new THREE.Vector3(), rad = new THREE.Vector3();
  for (let card = 0; card < count; card++) {
    const r = rnd() * area; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
    const f = tris[lo]; let u1 = rnd(), u2 = rnd(); if (u1 + u2 > 1) { u1 = 1 - u1; u2 = 1 - u2; } const bw = [1 - u1 - u2, u1, u2];
    p.set(0, 0, 0); n.set(0, 0, 0); let ru = 0, rv = 0;
    for (let k = 0; k < 3; k++) { const i = idx[f + k]; p.x += bw[k] * P.getX(i); p.y += bw[k] * P.getY(i); p.z += bw[k] * P.getZ(i); n.x += bw[k] * N.getX(i); n.y += bw[k] * N.getY(i); n.z += bw[k] * N.getZ(i); ru += bw[k] * UV.getX(i); rv += bw[k] * UV.getY(i); }
    n.normalize(); const lift = .002 + .01 * rnd(); p.addScaledVector(n, lift);
    const front = p.z < hc.z - .03, side = Math.abs(p.x - hc.x) > .05, back = p.z > hc.z + .035;
    const stopY = (front && !side ? eyeY + .05 : front ? eyeY + .03 : back ? eyeY - .045 : eyeY + .026) + .02 * rnd(), stop = Math.min(stopY, p.y - .012);   // a ragged fringe above the brows, the temples, the sides over the ears' tops, the back at the nape; rooted below its line, a card still lies ~1 cm down (the painted cap's edge showed as a hard line at the nape)
    t.subVectors(p, crown); t.addScaledVector(n, -t.dot(n)); if (t.lengthSq() < 1e-6) t.set(rnd() - .5, 0, rnd() - .5); t.normalize();
    let len = .03 + .045 * rnd(), pts = null; const e0 = ell(p), jit = new THREE.Vector3(rnd() - .5, 0, rnd() - .5).multiplyScalar(.5);
    for (let tries = 0; tries < 5 && !pts; tries++, len *= .75) {   // too long for its stop line: shorter, else dropped
      const q = [p.clone()]; d.copy(t).multiplyScalar(.8).addScaledVector(n, .25).add(jit).normalize();
      for (let k = 1; k <= S; k++) {
        const x = q[k - 1].clone().addScaledVector(d, len / S);
        const e = ell(x), want = e0 * (1.01 + .035 * k / S) + lift * 2; if (e < want) x.sub(hc).multiplyScalar(want / e).add(hc);   // kept off the skull, each layer a little further out toward the tips
        q.push(x); d.subVectors(x, q[k - 1]).normalize(); d.y -= .32; d.normalize();   // gravity
      }
      if (q[S].y >= stop) pts = q;
    }
    if (!pts) continue;
    const base = pos.length / 3, col0 = Math.floor(rnd() * 4), wid = .014 + .008 * rnd(), shade = .75 + .25 * (lift - .002) / .01;
    for (let k = 0; k <= S; k++) {
      const x = pts[k]; d.subVectors(pts[Math.min(S, k + 1)], pts[Math.max(0, k - 1)]).normalize(); rad.subVectors(x, hc).divide(R).divide(R).normalize();
      w.crossVectors(d, rad).normalize().multiplyScalar(wid * (1 - .5 * k / S) / 2);
      for (const s of [-1, 1]) { pos.push(x.x + s * w.x, x.y + s * w.y, x.z + s * w.z); nrm.push(rad.x, rad.y, rad.z); tan.push(d.x, d.y, d.z); uv.push((col0 + (s < 0 ? .02 : .98)) / 4, k / S); root.push(ru, rv); const v = shade * (.75 + 1. * k / S); col.push(v, v, v); }
      if (k < S) { const i0 = base + k * 2; index.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3); }
    }
  }
  const geo = new THREE.BufferGeometry(), nv = pos.length / 3;
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('rootUv', new THREE.Float32BufferAttribute(root, 2)); geo.setAttribute('strand', new THREE.Float32BufferAttribute(tan, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(nv * 4).map((_, i) => i % 4 ? 0 : head), 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(nv * 4).map((_, i) => i % 4 ? 0 : 1), 4));
  geo.setIndex(index); g.userData.cards = { count, geo }; return geo;
}
// Strand atlas, four columns (one card each): ~40 strands per card in three or four clumps that gather toward the tips,
// each a wavy line thinning and fading out at its own length, darker at the root. Drawn once, grey (the hair colour tints it).
let strandAtlas = null;
function strands() {
  if (strandAtlas) return strandAtlas;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const x = cv.getContext('2d'); let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.lineCap = 'round';
  for (let col = 0; col < 4; col++) {
    const clumps = Array.from({ length: 3 + (col & 1) }, () => 8 + rnd() * 48);
    for (let s = 0; s < 40; s++) {
      const cx = clumps[s % clumps.length], x0 = col * 64 + 4 + rnd() * 56, x1 = col * 64 + cx + (rnd() - .5) * 10, end = 150 + rnd() * 104, ph = rnd() * 6, lum = 125 + rnd() * 130;
      for (let y = 0; y < end; y += 6) {
        const k = y / end, k2 = (y + 6) / end, xa = x0 + (x1 - x0) * k * k + Math.sin(ph + y * .045) * 2.2, xb = x0 + (x1 - x0) * k2 * k2 + Math.sin(ph + (y + 6) * .045) * 2.2, l = lum * (.55 + .45 * k);
        x.strokeStyle = `rgba(${l | 0},${l | 0},${l | 0},${(1 - Math.pow(k, 3)).toFixed(3)})`; x.lineWidth = (.9 + rnd() * 1.3) * (1 - .55 * k); x.beginPath(); x.moveTo(xa, y); x.lineTo(xb, y + 6); x.stroke();
      }
    }
  }
  strandAtlas = new THREE.CanvasTexture(cv); strandAtlas.colorSpace = THREE.SRGBColorSpace; strandAtlas.anisotropy = 4; return strandAtlas;
}
function hairCardMaterial(mask) {
  const m = new THREE.MeshStandardMaterial({ roughness: .55, map: strands(), alphaTest: .42, alphaToCoverage: true, side: THREE.DoubleSide, vertexColors: true }), u = { uHairMask: { value: mask } };
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, u);
    s.vertexShader = 'uniform sampler2D uHairMask; attribute vec2 rootUv; attribute vec3 strand; varying vec3 vStrand;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      if (texture2D(uHairMask, rootUv).a < .5) transformed = vec3(0.);`)   // rooted off the hair (brow, ear, neck): the whole card collapses to a point
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
      vec3 st = strand;
      #ifdef USE_SKINNING
        st = (skinMatrix * vec4(st, 0.)).xyz;
      #endif
      vStrand = normalize((modelViewMatrix * vec4(st, 0.)).xyz);`);
    // alpha test on the atlas thins a card to nothing a few mips down: the coverage is raised with the mip level instead;
    // the normal stays the head's own (radial) on both faces, so the cards shade as one volume; a strand-aligned (Kajiya-Kay)
    // sheen, a white primary and a hair-tinted secondary a little down the strand, is where the sun catches them
    s.fragmentShader = 'varying vec3 vStrand;\n' + s.fragmentShader.replace('#include <alphatest_fragment>', `{ vec2 dm = vec2(length(dFdx(vMapUv * 256.)), length(dFdy(vMapUv * 256.))); diffuseColor.a *= 1. + .35 * max(0., log2(max(dm.x, dm.y))); }
      #include <alphatest_fragment>`).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(vNormal);')
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
      void RE_Direct_Hair(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
        RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
        vec3 H = normalize(directLight.direction + geometryViewDir), t1 = normalize(vStrand - .12 * geometryNormal), t2 = normalize(vStrand + .1 * geometryNormal);
        float d1 = dot(t1, H), d2 = dot(t2, H), lit = smoothstep(-.2, .35, dot(geometryNormal, directLight.direction));
        reflectedLight.directSpecular += directLight.color * lit * (.16 * pow(sqrt(max(0., 1. - d1 * d1)), 110.) + .3 * material.diffuseColor * pow(sqrt(max(0., 1. - d2 * d2)), 28.));
      }
      #undef RE_Direct
      #define RE_Direct RE_Direct_Hair`);
  };
  m.customProgramCacheKey = () => 'chains-hair-cards';
  return m;
}

export function createGLTFCharacter(avatar) {
  const female = avatar.figure === 'female', key = female ? 'golfer_f' : 'golfer';
  // the phone LOD has its own texture set (its UVs differ). Lite loads the LOD under the full name too, so ask the loader
  // rather than guess from the triangle count: the female LOD keeps ~9.7k triangles and passed for the full body (patchwork)
  const lod = !!avatar.lod || model(key) === model(key + '_lod');
  const src = cloneModel(key + (avatar.lod ? '_lod' : '')); if (!src) return null;
  const group = new THREE.Group(), actor = src.scene; group.add(actor);
  const joints = {}, owned = new Set(), glasses = [];
  const colors = { hair: avatar.hairColor, headwear: avatar.headwearColor, trim: avatar.accent };
  const spec = actor.getObjectByName('ChainsRig')?.userData || {}, handOffset = new THREE.Vector3(...(spec.handOffset || [0, -.25, 0]));
  let body = null, skin = null;
  actor.traverse(o => {
    if (o.isBone) joints[o.name] = o;
    if (o.name.startsWith('hair_')) o.visible = o.name === 'hair_' + avatar.hair && !(DOME_HATS.has(avatar.headwear) && BIG_HAIR.has(avatar.hair));
    if (o.name.startsWith('headwear_')) o.visible = o.name === 'headwear_' + avatar.headwear;
    if (o.name.startsWith('glasses_')) { glasses.push(o); o.visible = o.name === 'glasses_' + glassesOf(avatar); }
    if (o.name.startsWith('accessory_wristband')) o.visible = avatar.wristband === 'both' || avatar.wristband === (o.name.endsWith('R') ? 'right' : 'left');
    if (!o.isMesh) return;
    const slotKey = [].concat(o.material)[0].name.replace(/\.\d+$/, '');
    if (slotKey === 'body') { body = bodyMaterial(spec, avatar, lod, female ? 'body_f_' : 'body_'); o.material = body.material; if (o.isSkinnedMesh) { relaxNormals(o.geometry, o.skeleton.bones.findIndex(b => b.name === 'head')); handMorphs(o, handOffset, lod); o.updateMorphTargets(); skin = o; const ai = ['shR', 'elR', 'shL', 'elL'].map(n => o.skeleton.bones.findIndex(b => b.name === n)); body.arms(ai); const by = i => new THREE.Matrix4().copy(o.skeleton.boneInverses[i]).invert().elements[13]; body.sleeve(by(ai[1]) + .4 * (by(ai[0]) - by(ai[1]))); } }
    else { const slot = SLOT[slotKey] || { roughness: .8 }; o.material = new THREE.MeshStandardMaterial({ color: colors[slotKey] || slot.color || '#ffffff', roughness: slot.roughness, metalness: slot.metalness || 0, transparent: slot.opacity < 1, opacity: slot.opacity ?? 1 }); if (slot.rim) rimLight(o.material, { strength: slot.rim }); }
    // culled against one static sphere round every pose (skinned bounds measured over the clips reach 1.5 m from it): the
    // waiting players behind the tee camera stop drawing, and the bind-pose bounds never clip a throw at the frame edge.
    // Receives the sun's shadow too: an athlete standing in a tree's shade stayed fully sunlit and read as pasted in.
    owned.add(o.material); o.castShadow = true; o.receiveShadow = true; if (o.isSkinnedMesh) o.boundingSphere = REACH;
  });
  if (!joints.elR || !joints.root || !body || !skin) return null;
  // the modelled grip hands (handMorphs), children of the forearm bones, shown in the backhand set-up in place of the tucked
  // scan hand; their skin takes the palette tone the way the body shader turns the scan's (a quarter of the chroma gone)
  const gripMat = new THREE.MeshStandardMaterial({ roughness: .74, vertexColors: true }); owned.add(gripMat);
  // The scan's skin carries pores, mottling and a broken sheen; the modelled hands had none and read as "smooth rubber gloves,
  // lighter and more matte than the forearm": the body's pores, 3 cm / 1 cm blotches and roughness breakup in hand-local metres
  gripMat.onBeforeCompile = s => { s.vertexShader = 'varying vec3 vHandPos;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vHandPos = position;');
    s.fragmentShader = 'varying vec3 vHandPos; float chainsMot = .5;\n' + NOISE_GLSL + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      chainsMot = chainsNoise(vHandPos * 33.) * .65 + chainsNoise(vHandPos * 95.) * .35;
      diffuseColor.rgb *= mix(vec3(1.), vec3(1.02, .72, .72), saturate(1.15 - vColor.g)) * (1. + (chainsMot - .5) * vec3(.34, .06, .0));`)   // its AO creases (knuckles, between the fingers) go red like the body's
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + (chainsMot - .5) * .3 + .12 * saturate(1. - vColor.g), .5, .95);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n material.specularColor *= .45;')   // as the body's skin: well under a plastic's 4 %
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + PORES_GLSL('vHandPos', '1.'))
    .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
      ${skinDirect('RE_Direct_Grip', '1.')}`).replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + skinShade('1.')); };   // the body shader's skin scatter and warm shade (body-material.js): without them the hand turned away from the sun read as a brown glove
  gripMat.customProgramCacheKey = () => 'chains-grip'; rimLight(gripMat, { strength: .1 });
  const gripSkin = a => { const c = gripMat.color.set(a.skin), l = c.r * .2126 + c.g * .7152 + c.b * .0722; c.setRGB((l + (c.r - l) * GRIP.chroma) * .93, (l + (c.g - l) * GRIP.chroma) * .96, (l + (c.b - l) * GRIP.chroma) * 1.25).multiplyScalar(GRIP.tone); };   // the body's cooler white balance
  gripSkin(avatar);
  const gripHands = {};
  const restHands = {}, mount = (geo, name, into, tag) => { const h = new THREE.Mesh(geo, gripMat); h.name = tag + name; h.castShadow = h.receiveShadow = true; h.visible = false; joints[name].add(h); into[name] = h; };
  for (const [name, geo] of Object.entries(skin.geometry.userData.grip.hands)) mount(geo, name, gripHands, 'grip_');
  for (const [name, geo] of Object.entries(skin.geometry.userData.grip.rests)) mount(geo, name, restHands, 'rest_');
  // rig extras hairCards: the body's share of cards. The m2 scan (male) has none: its hair is sculpted volume in locks, and
  // cards of any length or density over it read at 640 px as the "helmet-like curly hair" critics named, and as a bright
  // fuzz against the menu's backlight; without them it reads as a real short haircut
  const cardShare = spec.hairCards ?? 1, shellMat = hairCardMaterial(body.mask), shells = new THREE.SkinnedMesh(hairCards(skin, spec, Math.round((lod ? 700 : 2200) * cardShare)), shellMat); owned.add(shellMat);
  shells.name = 'hair_cards'; shells.position.copy(skin.position); shells.quaternion.copy(skin.quaternion); shells.scale.copy(skin.scale); skin.parent.add(shells);
  shells.bind(skin.skeleton, skin.bindMatrix); shells.boundingSphere = REACH; shells.receiveShadow = true;
  const hairShow = a => { shells.visible = cardShare > 0 && a.hair === 'short' && (a.headwear || 'none') === 'none'; shellMat.color.set(a.hairColor); };
  hairShow(avatar);
  actor.updateMatrixWorld(true);
  const headC = spec.headCentre;   // the chest and back prints are part of the body material (body-material.js PRINT)
  // Disc socket: a roll-free wrist frame under the group rather than a child of the forearm bone. The clips roll the arm
  // through the pull (palm up at the reach-back, palm down at release), so a bone-mounted disc wobbles and ends up on the
  // open palm; this frame takes the forearm's heading and pitch only, so the plate stays level from the coiled stance to
  // release while the grip offset still follows the arm. Its -Y is the forearm (wrist to fingertips).
  const lefty = avatar.hand === 'left', forearm = joints[lefty ? 'elL' : 'elR'];
  const hand = new THREE.Group(); hand.name = 'disc_socket'; group.add(hand);
  let heading = 0;
  function placeSocket() {   // returns the forearm direction in group space
    _gi.copy(group.quaternion).invert();
    forearm.localToWorld(_v.copy(handOffset)); forearm.getWorldPosition(_e);
    _f.copy(_v).sub(_e).applyQuaternion(_gi).normalize();
    hand.position.copy(group.worldToLocal(_v));
    const pitch = Math.acos(THREE.MathUtils.clamp(-_f.y, -1, 1));
    if (Math.sin(pitch) > .05) heading = Math.atan2(-_f.x, -_f.z);   // a vertical forearm keeps the last heading
    hand.quaternion.setFromEuler(_eu.set(pitch, heading, 0, 'YXZ')).multiply(FLIP);
    hand.updateMatrixWorld(true);
    return _f;
  }
  const build = { slim: .95, athletic: 1, broad: 1.07 }[avatar.build] || 1, tall = HEIGHT[avatar.height] || 1;
  actor.scale.set(build * tall, tall, tall);
  // the clips were authored for the male rig's legs; a shorter rig scales their hip drops so the soles still meet the ground
  const legScale = spec.legScale || 1, rootRestY = joints.root.position.y;
  const handed = name => lefty && actions.has(name + '_left') ? name + '_left' : name;
  const mixer = new THREE.AnimationMixer(actor);
  const actions = new Map(src.animations.map(c => [c.name, mixer.clipAction(c)]));
  let phase = null, throwType = handed('backhand'), active = null, time = Math.random() * 8, mood = null, previous = null, blend = 1, frameDt = 0, locomotion = null;
  // Aim stance. main.js steers faceDir every frame for the player lining up a throw and for the menu hero; only the player
  // also grips the disc for a throw (holdDisc asks releaseFrame for the selected type), so two steered frames plus a grip
  // request mean "aiming" and the coiled stance blends over the idle clip, following the throw picker through aimType.
  // The menu hero, whose disc holdDisc carries outside any throw (carry()), gets the cover-shot pose instead; bystanders,
  // who hold no visible disc, keep the relaxed idle clip rather than raising an empty hand. ponytail: inferred rather than
  // a setStance() call because main.js is shared; add the call if a second consumer needs the state.
  let aimHit = false, aimFrames = 0, gripHit = false, grips = 0, carryHit = false, carries = 0, readyW = 0, heroW = 0, hookW = 0, aimType = 'backhand';
  function settle() { if (legScale !== 1) joints.root.position.y = rootRestY + (joints.root.position.y - rootRestY) * legScale; group.updateMatrixWorld(true); }
  function blendTo(pose, w, base = null) {   // slerp the bones toward a shared-contract pose: over the mixer output, or over the windup pose the clip was baked from
    // (the mixer skips bones whose value did not change, so a held windup phase is rebuilt from the shared keys instead of read back)
    for (const j of JOINTS) {
      const b = joints[j]; if (!b) continue;
      if (base) b.quaternion.setFromEuler(_eu.set(base[j][0], base[j][1], base[j][2], 'XYZ'));
      b.quaternion.slerp(_q.setFromEuler(_eu.set(pose[j][0], pose[j][1], pose[j][2], 'XYZ')), w);
    }
    const baseY = base ? -Math.min(...soleHeights(base, false, RIGS.glb)) : (joints.root.position.y - rootRestY) / legScale;
    joints.root.position.y = rootRestY + (baseY + (pose.rootY - baseY) * w) * legScale; group.updateMatrixWorld(true);
  }
  function overlay() {
    const cw = coilW();
    if (cw > 0) {
      let pose = readyPose(aimType, time, RIGS.glb, female ? STANCE_F : null), base = phase === null ? null : poseAt(keysFor(throwType.replace(/_left$/, '')), phase);
      if (lefty) { pose = mirrorPose(pose); if (base) base = mirrorPose(base); }
      blendTo(pose, cw, base);
    }
    if (heroW > 0) { let pose = heroPose(time, RIGS.glb); if (lefty) pose = mirrorPose(pose); blendTo(pose, heroW); }
    // Backhand grip roll through the windup. The scan's palms face forward, so the clip's bent elbow turns the palm up and the
    // disc would sit on it like a tray; rolling the forearm a quarter turn puts the palm against the rim with the thumb on
    // top. The clip's release hand is already thumb-up with the palm trailing, so the roll unwinds through the pull. The set-up
    // stance carries its own forearm (and the grip morph), so the roll grows only as the clip takes over. Cosmetic: the socket ignores roll.
    const family = phase === null ? aimType : throwType, k = phase === null ? 0 : (1 - cw) * (phase < .45 ? 1 : phase < .6 ? 1 - (phase - .45) / .15 : 0);
    if (k > 0 && family.startsWith('backhand')) { forearm.quaternion.multiply(_q.setFromAxisAngle(UP, (lefty ? -1 : 1) * k * Math.PI / 2)); group.updateMatrixWorld(true); }
    placeSocket();
  }
  function sample(name, at) {
    const action = actions.get(name); if (!action) return;
    if (active !== action) { previous?.stop(); previous = active; active = action; blend = phase === null ? 0 : 1; action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); }
    blend = Math.min(1, blend + frameDt / .22); active.setEffectiveWeight(blend); previous?.setEffectiveWeight(1 - blend); if (blend === 1) { previous?.stop(); previous = null; }
    action.paused = true; action.time = THREE.MathUtils.clamp(at, 0, action.getClip().duration - .00001); mixer.update(0);
  }
  const frames = new Map();
  // Socket frame at the release phase (.62) in the group's own space: the disc grip is derived from it so the disc rides the
  // wrist through the windup and is exactly level with the planned release at the moment it leaves. dir is the offset from
  // the socket to the disc centre in units of the 7.5 cm main.js scales it by, with its 1.5 cm drop pre-added: the backhand
  // family holds the rim in the palm with the plate level across the body (palm side of the wrist, thumb on top, fingers
  // curled under), everything else pinches the rim beyond the fingertips.
  function releaseFrame(t) {
    const name = actions.has(handed(t)) ? handed(t) : handed('backhand');
    if (phase === null) { aimType = t; gripHit = true; }
    if (frames.has(name)) return frames.get(name);
    const action = actions.get(name); if (!action) return null;
    const snap = [...actions.values()].map(a => ({ a, w: a.getEffectiveWeight(), time: a.time, running: a.isRunning() }));
    for (const s of snap) s.a.setEffectiveWeight(0);
    const wasRunning = action.isRunning(); if (!wasRunning) { action.reset().play(); action.paused = true; }
    action.setEffectiveWeight(1); action.time = .62 * action.getClip().duration; mixer.update(0); settle();
    const f = placeSocket(), q = hand.quaternion.clone(), side = lefty ? -1 : 1, L = Math.hypot(f.x, f.z) || 1;
    const dir = t.startsWith('backhand') ? new THREE.Vector3(f.z / L * side * .085, 0, -f.x / L * side * .085).addScaledVector(f, .02) : f.clone().multiplyScalar(.075);
    dir.y += .015; dir.divideScalar(.075);
    if (!wasRunning) action.stop();
    for (const s of snap) { s.a.setEffectiveWeight(s.w); s.a.time = s.time; }
    mixer.update(0); settle(); overlay();
    const frame = { qInv: q.invert(), dir }; frames.set(name, frame); return frame;
  }
  const coilW = () => phase === null ? readyW : readyW * stanceFade(phase);
  const gripW = () => (phase === null ? aimType : throwType).startsWith('backhand') ? coilW() : 0;   // the seated grip belongs to the backhand set-up and hands over to the release frame through the windup
  const seat = () => skin.geometry.userData.grip.seats[forearm.name];
  const api = {
    group, hand, elbow: forearm, joints, avatar, source: 'glb', releaseFrame, headY: (spec.eyeY || headC[1]) * tall, clips: [...actions.keys()], faceParts: {},
    setFace(value) { body.setPalette(value); gripSkin(value); hairShow(value); const g = glassesOf(value); for (const o of glasses) o.visible = o.name === 'glasses_' + g; },
    setThrow(t) { throwType = actions.has(handed(t)) ? handed(t) : handed('backhand'); }, setPhase(p) { phase = p; if (p !== null) mood = null; },
    getPhase() { return phase ?? (aimFrames >= 2 ? 0 : null); },   // steered toward a target counts as windup start so the disc is gripped, not carried
    get heroWeight() { return heroW; },   // how far into the cover-shot pose: holdDisc spins the disc on the raised hand past half
    gripPose(pos, nrm) { const w = gripW(); if (w > 0) { const s = seat(); forearm.localToWorld(pos.copy(s.c)); nrm.copy(s.n).transformDirection(forearm.matrixWorld); } return w; },   // holdDisc: the disc seated in the gripping hand, and how much of it to use
    carry() { carryHit = true; },   // holdDisc, every frame it shows this character's disc outside a throw
    react(kind) { mood = { name: handed(kind), t: 0 }; phase = null; },
    play(name) { if (actions.has(name)) { locomotion = name; phase = null; mood = null; time = 0; } },
    update(dt) {
      frameDt = dt; time += dt; aimFrames = aimHit ? aimFrames + 1 : 0; aimHit = false; grips = gripHit ? grips + 1 : 0; gripHit = false; carries = carryHit ? carries + 1 : 0; carryHit = false;
      const aiming = phase === null && !mood && !locomotion && aimFrames >= 2 && grips >= 1;
      let name = null;
      if (phase !== null) { const a = actions.get(throwType); sample(throwType, phase * (a?.getClip().duration || 1)); }
      else if (mood) { mood.t += dt; sample(mood.name, mood.t); if (mood.t >= (actions.get(mood.name)?.getClip().duration || 2.4)) mood = null; }
      else { name = handed(locomotion || 'idle'); sample(name, time % (actions.get(name)?.getClip().duration || 4)); }   // ponytail: no more practice-swing cycle; the cover-shot pose holds, play('practice') still works
      settle();
      readyW = aiming ? Math.min(1, readyW + dt / .22) : phase !== null && phase < STANCE_FADE ? readyW : Math.max(0, readyW - dt / .22);
      heroW = name?.startsWith('idle') && !locomotion && !aiming && carries >= 1 ? Math.min(1, heroW + dt / .35) : Math.max(0, heroW - dt / .35);
      // the disc hand hooks round the rim while it holds one (a bystander's hands hang open) and lets go just after release;
      // the free hand keeps half the curl (straight scanned fingers, and a third of the curl, read as a flat paddle; the female scan's mitten shards past a third). In the set-up the
      // modelled grip hand takes over from the tucked scan hand (a crossfade would show two hands); it hands
      // the disc back to the hooked scan hand in the first few percent of the swipe, before the seat drifts toward the release
      const grip = gripW() > .9, holding = phase !== null ? phase < .68 : carries >= 1 || grips >= 1, mi = skin.morphTargetInfluences;
      hookW = THREE.MathUtils.clamp(hookW + (holding ? 1 : -1) * dt * 8, 0, 1);
      // the free hand too: in the set-up its fused scan hand tucks away under a modelled one at rest (separate fingers)
      mi[lefty ? 1 : 0] = grip ? 1 : 0; mi[lefty ? 0 : 1] = grip ? 1 : 0; mi[lefty ? 3 : 2] = grip ? 0 : Math.max(.35, hookW); mi[lefty ? 2 : 3] = grip ? 0 : female ? .35 : .5;
      gripHands.elR.visible = grip && !lefty; gripHands.elL.visible = grip && lefty; restHands.elL.visible = grip && !lefty; restHands.elR.visible = grip && lefty;
      overlay();
    },
    faceDir(dx, dz) { group.rotation.y = Math.atan2(-dx, -dz); aimHit = true; },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(actor); body.dispose(); for (const m of owned) m.dispose(); actor.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); }
  };
  api.update(0); return api;
}
