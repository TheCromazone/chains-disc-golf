// Bot planner: simulates candidate throws with the real physics and picks the best, then adds
// difficulty-dependent execution error. Chunked with setTimeout so the frame never stalls.
// The best line thrown perfectly is often the one that shaves a trunk, and the execution error then finds the trunk (a hard
// bot's tee shot on Pine 1 touched a tree two times in three). So past putting range the leading lines are thrown again
// through a few samples of a good strike's error (the hard bot's own), and the line with the best average lie is the one
// thrown; touching a tree or the event arch costs metres on top, so a line that only works off the bark loses to a clean
// one. Every bot leaves that margin; the weaker ones then throw wider than they planned for, as weaker players do.
import { simulate, discById, releasePos } from './physics.js';

const NOISE = { easy: { yaw: 7, power: 0.13, hyzer: 8 }, medium: { yaw: 3.5, power: 0.07, hyzer: 4 }, hard: { yaw: 1.4, power: 0.03, hyzer: 1.5 } };
const PLAN = NOISE.hard;       // the error every bot plans for
const LEAD = 8, SAMPLES = 6;   // lines re-thrown through it, error samples each (mirrored pairs: both sides of a line)
const TOUCH = 10;              // metres added for touching a tree, a crown or the arch
const HOLED = -15;             // an ace in the averages: worth about the putt it saves, not a lottery ticket
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const yieldFrame = () => new Promise(r => setTimeout(r, 0));
const touched = s => s.events.some(e => e === 'tree' || e === 'branch' || e === 'arch');
const withError = (c, n, [ep, ey, eh]) => ({ ...c, power: Math.min(1, Math.max(0.12, c.power + ep * n.power)), yawOffset: c.yawOffset + ey * n.yaw, hyzer: c.hyzer + eh * n.hyzer });

export async function planBotThrow({ pos, world, difficulty = 'medium', wind, lefty = false }) {
  const b = world.basket;
  const dx = b.x - pos[0], dz = b.z - pos[2], dist = Math.hypot(dx, dz);
  const dir = [dx / dist, dz / dist];
  const cands = [];
  const base = { pos: releasePos(world, pos, dir), dir, lefty };   // the release point the throw will really leave from
  const putt = dist <= 15;
  if (putt) {
    const p0 = Math.min(1, 0.22 + dist * 0.072);
    for (const yaw of [-4, -2, 0, 2, 4]) for (const dp of [-0.1, -0.05, 0, 0.05, 0.1])
      cands.push({ ...base, throwType: 'putt', disc: discById('putter'), power: Math.min(1, Math.max(0.15, p0 + dp)), yawOffset: yaw, hyzer: 0 });
  } else {
    const discId = dist > 82 ? 'driver' : dist > 50 ? 'fairway' : dist > 26 ? 'mid' : 'putter';
    const throws = dist > 26 ? ['backhand', 'forehand'] : ['backhand'];
    const powers = dist > 82 ? [0.8, 0.9, 1] : dist > 50 ? [0.62, 0.75, 0.88, 1] : dist > 26 ? [0.45, 0.58, 0.72, 0.86] : [0.3, 0.36, 0.42, 0.48, 0.55, 0.63];
    for (const throwType of throws) for (const yaw of [-28, -18, -9, 0, 9, 18, 28]) for (const power of powers) for (const hyzer of [0, 14])
      cands.push({ ...base, throwType, disc: discById(discId), power, yawOffset: yaw, hyzer });
    // an easy layup with the mid too
    for (const yaw of [-8, 0, 8]) cands.push({ ...base, throwType: 'backhand', disc: discById('mid'), power: 0.6, yawOffset: yaw, hyzer: 0 });
  }
  const maxT = putt ? 4 : 12, n = NOISE[difficulty] || NOISE.medium;
  // metres from the basket the throw leaves you, +45 out of bounds (+TOUCH off the woodwork, past putting range). A holed
  // throw scores `holed` plus its own sliver of dist (how far off the pole it dropped in), so of the lines that go in, the
  // one through the middle of the chains wins: every putt from close range holes thrown perfectly.
  const score = (sim, holed) => { const r = sim.result; return r.dist + (r.holed ? holed : (r.ob ? 45 : 0) + (!putt && touched(sim.state) ? TOUCH : 0)); };
  let sliceStart = performance.now();
  const breathe = async () => { if (performance.now() - sliceStart > 4) { await yieldFrame(); sliceStart = performance.now(); } };
  for (const c of cands) {
    const sim = simulate(c, world, { maxT });
    c.score = score(sim, -1000); c.mean = score(sim, HOLED);   // thrown perfectly, a holed line wins outright
    await breathe();
  }
  let best = cands.reduce((a, c) => c.score < a.score ? c : a);
  if (!putt) {
    const errs = [];
    for (let k = 0; k < SAMPLES / 2; k++) { const e = [gauss(), gauss(), gauss()]; errs.push(e, e.map(v => -v)); }
    const lead = [...cands].sort((p, q) => p.score - q.score).slice(0, LEAD);
    for (const c of lead) {
      let sum = c.mean;   // the perfect throw counts as one more sample
      for (const e of errs) { sum += score(simulate(withError(c, PLAN, e), world, { maxT }), HOLED); await breathe(); }
      c.mean = sum / (errs.length + 1);
    }
    best = lead.reduce((a, c) => c.mean < a.mean ? c : a);
  }
  const thrown = withError(best, n, [gauss(), gauss(), gauss()]);
  return { throwType: best.throwType, discId: best.disc.id, power: thrown.power, yawOffset: thrown.yawOffset, hyzer: thrown.hyzer, dir };
}
