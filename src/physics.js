// Disc flight model. Plain math, no THREE, so bots and the node test can run it headless.
// Lift/drag vs angle of attack + gyroscopic roll: above the disc's stable speed it "turns"
// (rolls toward anhyzer), below it "fades" (rolls toward hyzer). Spin sign flips for forehand.

const RHO = 1.225, AREA = 0.0346, MASS = 0.175, G = 9.81, R_DISC = 0.105;
export const DT = 1 / 240;

export const DISCS = [
  { id: 'driver',  name: 'VORTEX',   type: 'Distance Driver', speed: 12, glide: 5, turn: -1, fade: 3, color: '#ff2e88' },
  { id: 'fairway', name: 'FALCON',   type: 'Fairway Driver',  speed: 7,  glide: 5, turn: 0,  fade: 2, color: '#2f80ff' },
  { id: 'mid',     name: 'MERIDIAN', type: 'Midrange',        speed: 5,  glide: 4, turn: -1, fade: 1, color: '#ffcc00' },
  { id: 'putter',  name: 'ANCHOR',   type: 'Putter',          speed: 2,  glide: 3, turn: 0,  fade: 1, color: '#f4f4f4' },
];
export const discById = id => DISCS.find(d => d.id === id);

// swipe/lat are screen-space (y down). latMode: what the perpendicular offset controls.
const flat = (name, spin, maxSpeed, nose, swipe, hint) => ({ name, spin, maxSpeed, launch: 7, nose, bank: 0, liftMul: 1, dragMul: 1, flip: 0, swipe, lat: [0, 1], latMode: 'hyzer', hint });
const BH = flat('Backhand', +1, 33, -3, [1, 0], 'swipe right →'), FH = flat('Forehand', -1, 30, -2, [-1, 0], 'swipe left ←');
// preset = degrees of hyzer baked into the release: inside-out tilts toward the fade side, outside-in away from it.
export const THROWS = {
  backhand: BH,
  backhand_io: { ...BH, name: 'Backhand IO', preset: 22, hint: 'swipe right → · inside-out' },
  backhand_oi: { ...BH, name: 'Backhand OI', preset: -22, hint: 'swipe right → · outside-in' },
  forehand: FH,
  forehand_io: { ...FH, name: 'Forehand IO', preset: 22, hint: 'swipe left ← · inside-out' },
  forehand_oi: { ...FH, name: 'Forehand OI', preset: -22, hint: 'swipe left ← · outside-in' },
  blade:    { ...FH, name: 'Blade', maxSpeed: 23, launch: 30, nose: 3, liftMul: 0.8, dragMul: 1.4, preset: -68, swipe: [-0.7071, 0.7071], lat: [0.7071, 0.7071], latMode: 'yaw', hint: 'swipe down-left ↙' },
  tomahawk: { name: 'Tomahawk', icon: '⤓', spin: -1, maxSpeed: 30, launch: 23, nose: 0,  bank: -85, liftMul: 0.85, dragMul: 1.2, flip: 1.2, swipe: [0, 1],  lat: [1, 0],  latMode: 'yaw',   hint: 'swipe down ↓' },
  scoober:  { name: 'Scoober',  icon: '⤴', spin: -1, maxSpeed: 22, launch: 30, nose: 8,  bank: 160, liftMul: 0.7,  dragMul: 1.3, flip: -1.9,  swipe: [-0.7071, -0.7071], lat: [0.7071, -0.7071], latMode: 'hyzer', hint: 'swipe up-left ↖' },
  // Ultimate's hammer: forehand grip over the top, released past vertical so it flies inverted, flattens at the apex and drops. RH drifts left.
  hammer:   { ...FH, name: 'Hammer', maxSpeed: 28, launch: 36, nose: 0, bank: -130, liftMul: 0.9, dragMul: 1.15, flip: -0.35, swipe: [0.7071, 0.7071], lat: [-0.7071, 0.7071], latMode: 'yaw', hint: 'swipe down-right ↘' },
  putt:     { name: 'Putt',     icon: '⇡', spin: +1, maxSpeed: 14, launch: 12, nose: 7,  bank: 0,   liftMul: 1,    dragMul: 1,   flip: 0,    swipe: [0, -1], lat: [1, 0],  latMode: 'yaw',   hint: 'swipe up ↑' },
};

const len = a => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function rotAxis(v, axis, ang) { // Rodrigues rotation, right-hand rule
  const k = norm(axis), c = Math.cos(ang), s = Math.sin(ang), kv = cross(k, v), kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}
export const stableSpeed = disc => 6 + 1.35 * disc.speed;
export const speedFor = (throwType, power) => THROWS[throwType].maxSpeed * clamp(power, 0.12, 1);

// params: { pos:[x,y,z], dir:[dx,dz], power, throwType, disc, hyzer(deg, +=toward fade side), yawOffset(deg), launchOffset(deg) }
export function launch(p) {
  const th = THROWS[p.throwType], disc = p.disc;
  const speed = speedFor(p.throwType, p.power);
  const yaw = ((p.yawOffset || 0)) * Math.PI / 180;
  const hdg = rotAxis(norm([p.dir[0], 0, p.dir[1]]), [0, 1, 0], yaw);
  const la = clamp(th.launch + (p.launchOffset || 0), -5, 60) * Math.PI / 180;
  const right = cross(hdg, [0, 1, 0]);
  const v = [hdg[0] * Math.cos(la) * speed, Math.sin(la) * speed, hdg[2] * Math.cos(la) * speed];
  const pitch = la + th.nose * Math.PI / 180;
  let n = rotAxis([0, 1, 0], right, pitch);                               // nose up pitches normal backward
  const fwd = rotAxis(hdg, right, pitch);                                 // roll about the disc's own forward axis
  const side = p.lefty ? -1 : 1, spin = th.spin * side;                    // a left-hander's backhand spins the other way, so it fades the other way
  const bank = th.bank * side - spin * ((p.hyzer || 0) + (th.preset || 0)); // hyzer = tilt toward the fade side
  n = rotAxis(n, fwd, bank * Math.PI / 180);
  return {
    p: [p.pos[0], p.pos[1], p.pos[2]], v, n, spin, spinRate: 4 + speed * 3,
    t: 0, mode: 'fly', throwType: p.throwType, disc, events: [], contacts: 0, restT: 0,
    lastIn: [p.pos[0], p.pos[1], p.pos[2]], lean: 0, chained: false, maxH: 0, start: [p.pos[0], p.pos[1], p.pos[2]],
  };
}

export const isDone = s => s.mode === 'rest' || s.mode === 'water' || s.mode === 'ob';

export function step(s, w, dt = DT) {
  if (isDone(s)) return;
  s.t += dt;
  const th = THROWS[s.throwType], d = s.disc;
  if (s.mode === 'holed') {
    const b = w.basket, tgt = [b.x, b.y + 0.68, b.z], k = Math.min(1, 10 * dt);
    s.p = [s.p[0] + (tgt[0] - s.p[0]) * k, s.p[1] + (tgt[1] - s.p[1]) * k, s.p[2] + (tgt[2] - s.p[2]) * k];
    s.n = norm([s.n[0] * (1 - k), s.n[1] * (1 - k) + k, s.n[2] * (1 - k)]);
    s.spinRate *= (1 - 3 * dt);
    s.restT += dt; if (s.restT > 0.7) { s.mode = 'rest'; s.holed = true; }
    return;
  }
  if (s.mode === 'fly') {
    const wind = w.wind || [0, 0];
    const va = [s.v[0] - wind[0], s.v[1], s.v[2] - wind[1]];
    const sp = len(va);
    let a = [0, -G, 0];
    if (sp > 0.4) {
      const vh = scale(va, 1 / sp);
      const aoa = -Math.asin(clamp(dot(s.n, vh), -1, 1));
      const CL = clamp(0.01 + 0.016 * d.glide + 1.15 * aoa, -0.4, 1.0) * th.liftMul;
      const CD = (0.08 - 0.0035 * d.speed + 2.2 * (aoa + 0.05) ** 2) * th.dragMul;
      const q = 0.5 * RHO * AREA * sp * sp;
      const nv = dot(s.n, vh);
      const Ld = [s.n[0] - nv * vh[0], s.n[1] - nv * vh[1], s.n[2] - nv * vh[2]];
      const Ll = len(Ld);
      if (Ll > 1e-4) { const f = q * CL / MASS / Ll; a[0] += Ld[0] * f; a[1] += Ld[1] * f; a[2] += Ld[2] * f; }
      const fd = q * CD / MASS; a[0] -= vh[0] * fd; a[1] -= vh[1] * fd; a[2] -= vh[2] * fd;
      // gyroscopic roll: turn above stable speed, fade below
      const vs = stableSpeed(d), ex = (sp - vs) / vs;
      // Overhand turnover mirrors with the thrower's spin, just like turn/fade.
      let roll = th.flip * (s.spin / th.spin);
      if (ex > 0) roll += s.spin * (0.05 + (-d.turn) * 0.3) * Math.min(ex, 1.0);
      const fadeK = clamp((vs * 1.3 - sp) / vs, 0, 1);            // fade blends in early, dominates when slow
      roll -= s.spin * (0.45 + d.fade * 0.5) * fadeK * clamp((s.n[1] - 0.55) / 0.45, 0, 1);   // stops banking past ~55°
      const hs = Math.hypot(s.v[0], s.v[2]);
      const axis = hs > 0.3 ? [s.v[0] / hs, 0, s.v[2] / hs] : [1, 0, 0];
      s.n = rotAxis(s.n, axis, roll * dt);
      s.spinRate *= (1 - 0.04 * dt);
    }
    s.v = [s.v[0] + a[0] * dt, s.v[1] + a[1] * dt, s.v[2] + a[2] * dt];
    s.p = [s.p[0] + s.v[0] * dt, s.p[1] + s.v[1] * dt, s.p[2] + s.v[2] * dt];
    s.maxH = Math.max(s.maxH, s.p[1]);
    hitTrees(s, w, dt);
    hitCapsules(s, w);
    hitBasket(s, w);
    if (s.mode !== 'fly') return;
    groundContact(s, w);
  } else if (s.mode === 'roll') {
    rollStep(s, w, dt);
    if (s.mode === 'holed') return;
  } else if (s.mode === 'ground') {
    const gy = w.height(s.p[0], s.p[2]), N = w.normal(s.p[0], s.p[2]), F = s.face || 1;   // a roller that toppled onto its top settles upside down
    const vn = dot(s.v, N);
    s.v = [s.v[0] - vn * N[0], s.v[1] - vn * N[1], s.v[2] - vn * N[2]];
    const gt = [G * N[1] * N[0], -G + G * N[1] * N[1], G * N[1] * N[2]];
    const sp = len(s.v);
    if (sp > 0.05) {
      const mu = 0.75 * (1 + 0.9 * (w.rough ? w.rough(s.p[0], s.p[2]) : 0)), vh = scale(s.v, 1 / sp);
      s.v = [s.v[0] + (gt[0] - mu * G * vh[0]) * dt, s.v[1] + (gt[1] - mu * G * vh[1]) * dt, s.v[2] + (gt[2] - mu * G * vh[2]) * dt];
      if (dot(s.v, vh) < 0) s.v = [0, 0, 0];
    } else s.v = [0, 0, 0];
    s.p = [s.p[0] + s.v[0] * dt, 0, s.p[2] + s.v[2] * dt];
    if (s.wobble > 0.01) {   // settling like a dropped coin: the rim rings around faster as the tilt dies
      s.wobbleA += (7 + 22 * (1 - s.wobble / 0.55)) * dt; s.wobble *= 1 - 3.2 * dt;
      const tilt = s.wobble, cx = Math.cos(s.wobbleA), sx = Math.sin(s.wobbleA);
      s.n = norm([F * N[0] + cx * tilt, F * N[1], F * N[2] + sx * tilt]);
    } else s.n = norm([s.n[0] + (F * N[0] - s.n[0]) * 6 * dt, s.n[1] + (F * N[1] - s.n[1]) * 6 * dt, s.n[2] + (F * N[2] - s.n[2]) * 6 * dt]);
    s.p[1] = w.height(s.p[0], s.p[2]) + 0.015 + 0.03 * (s.wobble || 0);
    s.spinRate *= (1 - (s.wobble > 0.05 ? 1.5 : 4) * dt);
    if (len(s.v) < 0.08) { s.restT += dt; if (s.restT > 0.25) s.mode = 'rest'; } else s.restT = 0;
  }
  // water / bounds (any mode)
  if (w.inWater(s.p[0], s.p[2]) && s.p[1] <= w.waterLevel(s.p[0], s.p[2]) + 0.04) {
    s.mode = 'water'; s.ob = true; s.p[1] = w.waterLevel(s.p[0], s.p[2]); s.v = [0, 0, 0]; s.n = [0, 1, 0]; s.events.push('splash'); return;
  }
  if (!w.inBounds(s.p[0], s.p[2])) { s.mode = 'ob'; s.ob = true; s.v = [0, 0, 0]; s.events.push('ob'); return; }
  if (!w.inWater(s.p[0], s.p[2])) s.lastIn = [s.p[0], s.p[1], s.p[2]];
}

function groundContact(s, w) {
  const gy = w.height(s.p[0], s.p[2]);
  const tilt = Math.sqrt(Math.max(0, 1 - s.n[1] * s.n[1]));
  const low = gy + 0.015 + R_DISC * tilt;
  if (s.p[1] > low) return;
  const N = w.normal(s.p[0], s.p[2]);
  const vn = dot(s.v, N);
  s.p[1] = low;
  if (vn >= 0) return;
  const vt = [s.v[0] - vn * N[0], s.v[1] - vn * N[1], s.v[2] - vn * N[2]];
  const spd = len(s.v), steep = -vn / (spd || 1), rough = w.rough ? w.rough(s.p[0], s.p[2]) : 0;
  if (startRoll(s, N, vn, vt, gy, rough)) return;
  const shallow = steep < 0.42;
  const e = (shallow ? 0.38 : 0.1) * (1 - 0.65 * rough), keep = (shallow ? 0.7 : 0.35) * (1 - 0.4 * rough);
  s.v = [vt[0] * keep - vn * e * N[0], vt[1] * keep - vn * e * N[1], vt[2] * keep - vn * e * N[2]];
  s.n = norm([s.n[0] * 0.35 + N[0] * 0.65, s.n[1] * 0.35 + N[1] * 0.65, s.n[2] * 0.35 + N[2] * 0.65]);
  s.contacts++;
  s.events.push(s.contacts === 1 ? 'land' : 'skip');
  if (len(s.v) < 1.5 || s.contacts > 5) { s.mode = 'ground'; s.v = scale(vt, keep); const tilt = Math.sqrt(Math.max(0, 1 - s.n[1] * s.n[1])); if (tilt > 0.12) { s.wobble = Math.min(0.55, tilt * 0.9); s.wobbleA = Math.atan2(s.n[2], s.n[0]); } }
}

// Rollers. A disc that meets the ground on its rim, banked 41°+ from the turf, rolls along the line its rim meets the
// ground. Whether it does depends on the spin: the side a disc turns over to (anhyzer: s.spin * f > 0) is the side whose
// rim spins backwards at the contact, so the spin rolls it forward (why rollers are thrown on anhyzer); a hyzer landing's
// rim spins forwards against the turf, so it skips and skids unless it comes down almost vertical. The roll state is
// a heading on the ground plane (rollH), a speed (rollV) and a signed lean of the disc plane from the ground normal
// (lean, + toward r = heading x normal) with f = which face looks toward r; the disc normal is n = f(cos lean r - sin lean N).
// Lean steers it the way a coin steers: steady rolling at lean L needs a curve of radius 3v^2 / (2 g tan L), so it
// curves toward the low side, tighter as it slows, while the lean grows (fastest when slow) until it topples ('flop').
const ROLL_BANK = 0.75, ROLL_VERTICAL = 0.4;                      // |n.N| below: banked enough to roll / vertical enough to roll against its spin
const ROLL_MIN = 4, ROLL_MIN_ROUGH = 4;                           // speed along the rim needed to roll, m/s (+ in full rough)
const ROLL_I = 0.5;                                               // spin inertia / (m R^2) of a plate: rolling takes g sin / (1 + 0.5) = 2/3 of the slope
const ROLL_DEC = [1.0, 0.05], ROLL_DEC_ROUGH = 1.5;               // rolling resistance a = c0 + c2 v^2 on fairway (a fast rim bounces and scrubs), x(1 + 1.5 rough)
const ROLL_FALL = 1.15;                                           // lean (rad from upright) where it topples

function startRoll(s, N, vn, vt, gy, rough) {
  const nN = dot(s.n, N), bank = Math.abs(nN);
  if (bank >= ROLL_BANK) return false;
  let h = norm(cross(N, s.n)), along = dot(vt, h);              // the disc's own heading: its plane meets the ground along h
  if (along < 0) { h = scale(h, -1); along = -along; }
  if (along < ROLL_MIN + ROLL_MIN_ROUGH * rough) return false;      // too slow, or landing crossways to its plane
  const r = cross(h, N), f = dot(s.n, r) >= 0 ? 1 : -1, match = f * s.spin;
  if (match < 0 && bank >= ROLL_VERTICAL) return false;            // hyzer landing: the spin fights the roll, so it skips instead
  // The rim strike scrubs speed in proportion to how hard it comes down, then the rim trades speed with the spin until it
  // rolls without slipping: v = (v_in + k wR) / (1 + k), wR signed by whether the spin rolls it forward or back.
  const wR = Math.min(Math.abs(s.spinRate) * R_DISC, along);
  const v0 = (along + 0.5 * vn + match * ROLL_I * wR) / (1 + ROLL_I) * (1 - 0.2 * rough);
  if (v0 < 2.5) return false;
  const lean = Math.asin(clamp(-f * nN, -1, 1));                  // the landing tilt, so the disc doesn't pop upright
  s.mode = 'roll'; s.rollH = h; s.rollV = v0; s.rollFace = f; s.rollSide = f; s.rollT = 0;
  s.lean = lean; s.leanTgt = lean * clamp(0.6 - 0.03 * v0, 0.25, 0.55);   // the strike stands it part way up, more when fast
  s.v = scale(h, v0); s.p[1] = gy + 0.015 + R_DISC * Math.cos(lean);
  s.spinRate = -f * s.spin * v0 / R_DISC;
  s.events.push('roll');
  return true;
}

function rollStep(s, w, dt) {
  s.rollT += dt;
  const x = s.p[0], z = s.p[2], N = w.normal(x, z), rough = w.rough ? w.rough(x, z) : 0;
  let h = s.rollH; const hN = dot(h, N);
  h = norm([h[0] - hN * N[0], h[1] - hN * N[1], h[2] - hN * N[2]]);         // follow the turf as it tilts
  const g = [G * N[1] * N[0], -G + G * N[1] * N[1], G * N[1] * N[2]];        // gravity along the ground plane (downhill)
  const gUp = G * N[1], v = s.rollV, lean = s.lean;
  // a cross slope tips it toward downhill: lean is judged against gravity, not the turf
  const eff = lean + Math.atan2(dot(g, cross(h, N)), gUp);
  // speed: a disc rolling on its rim takes 2/3 of the slope's pull (a = g sin / (1 + ROLL_I)); grass, rough and lean drag
  const dec = (ROLL_DEC[0] + ROLL_DEC[1] * v * v) * (1 + ROLL_DEC_ROUGH * rough) * (1 + 0.3 * Math.abs(Math.sin(lean)));
  const nv = Math.max(0, v + (dot(g, h) / (1 + ROLL_I) - dec) * dt);
  // steer toward the low side: yaw rate = v / radius = (2/3) g tan(lean) / v
  const yaw = clamp((2 / 3) * gUp * Math.tan(clamp(eff, -1.3, 1.3)) / Math.max(nv, 1.5), -1.4, 1.4);
  h = rotAxis(h, N, -yaw * dt);
  const r = cross(h, N);
  // lean grows the way it already leans, faster as the roll dies; the first moments stand it part way up
  const fall = eff > 0 ? 1 : eff < 0 ? -1 : -s.rollFace;
  let dl = fall * (0.05 + 0.55 * Math.abs(Math.sin(eff))) * (3 / (nv + 0.4)) * (1 + 0.8 * rough);
  if (s.rollT < 0.5) dl += (s.leanTgt - lean) * 6;
  s.lean = lean + dl * dt; s.rollH = h; s.rollV = nv;
  s.v = scale(h, nv);
  const px = x + s.v[0] * dt, pz = z + s.v[2] * dt;
  s.p = [px, w.height(px, pz) + 0.015 + R_DISC * Math.cos(s.lean), pz];
  const f = s.rollFace, c = Math.cos(s.lean), sn = Math.sin(s.lean);
  s.n = [f * (c * r[0] - sn * N[0]), f * (c * r[1] - sn * N[1]), f * (c * r[2] - sn * N[2])];
  // rolling without slipping: the rim at the contact is still, so v = w x (R u) (u: contact to centre). main.js turns
  // the disc about n at spinRate * s.spin, which puts that w along -f r: forward.
  s.spinRate = -f * s.spin * nv / R_DISC;
  const ne = s.events.length;
  hitTrees(s, w, dt);
  hitCapsules(s, w);
  hitBasket(s, w);
  if (s.mode !== 'roll') return;
  if (s.events.length > ne || Math.abs(s.lean) > ROLL_FALL || s.rollT > 12) fallOver(s, N);   // knocked over, or toppled
}

// Down it goes: the coin-like settle in 'ground' takes over from the tilt it falls with, face up or (rolled past
// upright) face down.
function fallOver(s, N) {
  const F = dot(s.n, N) >= 0 ? 1 : -1;
  s.mode = 'ground'; s.face = F; s.v = scale(s.v, 0.5);
  // 'ground' draws the settle as n = F N + wobble (cos A, 0, sin A): solve for the offset that is today's n, so a roll that
  // topples on a slope doesn't jump
  let ex = s.n[0], ez = s.n[2];
  if (F * s.n[1] > 0.05) { const a = F * N[1] / s.n[1]; ex = s.n[0] * a - F * N[0]; ez = s.n[2] * a - F * N[2]; }
  s.wobble = Math.min(0.55, Math.hypot(ex, ez)); s.wobbleA = Math.atan2(ez, ex);
  s.events.push('flop');
}

function hitTrees(s, w, dt) {
  const list = w.treesNear(s.p[0], s.p[2]);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const dx = s.p[0] - t.x, dz = s.p[2] - t.z, d2 = dx * dx + dz * dz;
    const tr = t.r + 0.09;
    if (d2 < tr * tr && s.p[1] < t.y + t.h && s.p[1] > t.y - 0.5) {
      const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d;
      const vr = s.v[0] * nx + s.v[2] * nz;
      if (vr < 0) {
        s.v[0] -= 1.35 * vr * nx; s.v[2] -= 1.35 * vr * nz;
        s.v[0] *= 0.35; s.v[2] *= 0.35; s.v[1] *= 0.45;
        s.spinRate *= 0.5;
        s.n = norm([s.n[0] + (Math.random() - 0.5) * 0.7, s.n[1] + 0.3, s.n[2] + (Math.random() - 0.5) * 0.7]);
        s.events.push('tree');
      }
      s.p[0] = t.x + nx * tr; s.p[2] = t.z + nz * tr;
    }
    const fy = s.p[1] - (t.y + t.fy), fd2 = d2 + fy * fy;
    if (fd2 < t.fr * t.fr && s.mode === 'fly') {
      const sp = len(s.v);
      s.v = scale(s.v, Math.max(0, 1 - 2.2 * dt));
      if (sp > 4 && Math.random() < 2.2 * dt) {
        s.v = [s.v[0] * 0.25 + (Math.random() - 0.5) * 3, s.v[1] * 0.25 - 1.5, s.v[2] * 0.25 + (Math.random() - 0.5) * 3];
        s.n = norm([s.n[0] + (Math.random() - 0.5), s.n[1] + 0.5, s.n[2] + (Math.random() - 0.5)]);
        s.events.push('branch');
      }
    }
  }
}

// Built props the disc can hit (the event arch's legs and beam): w.capsules = [{ a, b, r, tag }], a segment swollen by
// r. Printed fabric over a truss is a dead thud: the disc is set back on the skin, rebounds with a fifth of the speed it
// hit with and keeps half its glancing speed, and the event is the prop's tag ('arch': main.js toasts "Off the arch").
function hitCapsules(s, w) {
  const list = w.capsules; if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const c = list[i], ab = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]], ap = [s.p[0] - c.a[0], s.p[1] - c.a[1], s.p[2] - c.a[2]];
    const t = clamp(dot(ap, ab) / dot(ab, ab), 0, 1), d = [ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t], dl = len(d), R = c.r + R_DISC;
    if (dl >= R) continue;
    const n = dl > 1e-6 ? scale(d, 1 / dl) : [0, 1, 0], vn = dot(s.v, n);
    s.p = [s.p[0] + n[0] * (R - dl), s.p[1] + n[1] * (R - dl), s.p[2] + n[2] * (R - dl)];
    if (vn >= 0) continue;
    s.v = [(s.v[0] - vn * n[0]) * 0.5 - vn * 0.2 * n[0], (s.v[1] - vn * n[1]) * 0.5 - vn * 0.2 * n[1], (s.v[2] - vn * n[2]) * 0.5 - vn * 0.2 * n[2]];
    s.spinRate *= 0.5;
    s.n = norm([s.n[0] + n[0] * 0.6, s.n[1] + n[1] * 0.6 + 0.2, s.n[2] + n[2] * 0.6]);
    s.events.push(c.tag);
  }
}

function hitBasket(s, w) {
  const b = w.basket; if (!b) return;
  const dx = s.p[0] - b.x, dz = s.p[2] - b.z, d = Math.hypot(dx, dz), h = s.p[1] - b.y;
  if (d > 0.6 || h < 0 || h > 1.8) return;
  const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
  const vr = s.v[0] * nx + s.v[2] * nz, hs = Math.hypot(s.v[0], s.v[2]);
  if (h > 0.72 && h < 1.34 && d < 0.25) {             // chains
    if (vr < 0 || hs < 1.2) {
      if (hs < 13 && !s.chained) { s.mode = 'holed'; s.restT = 0; s.events.push('chains'); return; }
      s.v = [-s.v[0] * 0.12 + nx * 0.6, Math.min(s.v[1], 0) - 0.6, -s.v[2] * 0.12 + nz * 0.6];
      s.chained = true; s.events.push('chainout');
    }
    return;
  }
  if (h >= 1.34 && h < 1.46 && d < 0.28) {            // top band
    if (s.v[1] < 0 && h > 1.40) {
      s.v = [s.v[0] * 0.55, -s.v[1] * 0.3, s.v[2] * 0.55]; s.p[1] = b.y + 1.46;
      // a disc settling on the lid would bounce in place until the 25 s cap: once it has slowed, it slides off the domed lid's edge
      s.lidHits = (s.lidHits || 0) + 1;
      if (Math.hypot(s.v[0], s.v[2]) < 1.2 || s.lidHits > 3) { const ox = d > 1e-3 ? nx : (s.v[0] || 1), oz = d > 1e-3 ? nz : s.v[2], ol = Math.hypot(ox, oz) || 1; s.v[0] = ox / ol * 1.3; s.v[2] = oz / ol * 1.3; }
      if (s.lidHits <= 2) s.events.push('band');
    }
    else if (vr < 0) { s.v[0] -= 1.4 * vr * nx; s.v[2] -= 1.4 * vr * nz; s.v[0] *= 0.45; s.v[2] *= 0.45; s.events.push('band'); }
    return;
  }
  if (h > 0.55 && h < 0.72) {                         // tray
    if (d < 0.30) { if (s.v[1] <= 0.2 && h < 0.74) { s.mode = 'holed'; s.restT = 0; s.events.push('drop'); } }
    else if (d < 0.42 && vr < 0) { s.v[0] -= 1.5 * vr * nx; s.v[2] -= 1.5 * vr * nz; s.v[0] *= 0.4; s.v[2] *= 0.4; s.v[1] = Math.abs(s.v[1]) * 0.3 + 0.4; s.events.push('rim'); }
    return;
  }
  if (d < 0.13 && h < 1.34 && vr < 0) { s.v[0] -= 1.5 * vr * nx; s.v[2] -= 1.5 * vr * nz; s.v[0] *= 0.4; s.v[2] *= 0.4; s.events.push('pole'); }
}

export function resultOf(s, w) {
  const b = w.basket;
  const holed = !!s.holed;
  const ob = !!s.ob;
  const rest = [s.p[0], s.p[1], s.p[2]];
  let lie = rest;
  if (ob) { const li = s.lastIn; lie = [li[0], w.height(li[0], li[2]) + 0.015, li[2]]; }
  const dist = b ? Math.hypot(lie[0] - b.x, lie[2] - b.z) : 0;
  const thrown = Math.hypot(rest[0] - s.start[0], rest[2] - s.start[2]);
  return { holed, ob, rest, lie, dist, thrown, maxH: s.maxH, airTime: s.t };
}

export function simulate(params, w, opts = {}) {
  const s = launch(params);
  const every = opts.every || 4, maxT = opts.maxT || 25, rec = opts.record ? [] : null;
  let i = 0;
  while (!isDone(s) && s.t < maxT) {
    step(s, w, DT);
    if (rec && (i++ % every) === 0) rec.push([s.p[0], s.p[1], s.p[2], s.n[0], s.n[1], s.n[2], s.spinRate]);
  }
  if (!isDone(s)) s.mode = 'rest';
  if (rec) rec.push([s.p[0], s.p[1], s.p[2], s.n[0], s.n[1], s.n[2], s.spinRate]);
  return { state: s, traj: rec, result: resultOf(s, w) };
}

// Where a throw from a lie leaves the hand: 0.4 m out along the aim (the reach), shortened inside the circle so a tap-in
// never releases beyond the pole and flies out the far side. The aim, preview, online host and bots all launch from here.
export function releasePos(w, lie, dir) {
  const b = w.basket, reach = b ? Math.min(0.4, Math.max(0, Math.hypot(b.x - lie[0], b.z - lie[2]) - 0.5)) : 0.4;
  return [lie[0] + dir[0] * reach, w.height(lie[0], lie[2]) + 1.15, lie[2] + dir[1] * reach];
}

// Flat, empty world for tests/previews.
export function flatWorld(basket = { x: 0, y: 0, z: -30 }) {
  return {
    height: () => 0, normal: () => [0, 1, 0], treesNear: () => [], basket,
    inWater: () => false, waterLevel: () => -10, inBounds: () => true, wind: [0, 0], rough: () => 0,
  };
}
