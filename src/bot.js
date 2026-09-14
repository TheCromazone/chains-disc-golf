// Bot planner: simulates candidate throws with the real physics and picks the best, then adds
// difficulty-dependent execution error. Chunked with setTimeout so the frame never stalls.
import { simulate, discById } from './physics.js';

const NOISE = { easy: { yaw: 7, power: 0.13, hyzer: 8 }, medium: { yaw: 3.5, power: 0.07, hyzer: 4 }, hard: { yaw: 1.4, power: 0.03, hyzer: 1.5 } };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const yieldFrame = () => new Promise(r => setTimeout(r, 0));

export async function planBotThrow({ pos, world, difficulty = 'medium', wind }) {
  const b = world.basket;
  const dx = b.x - pos[0], dz = b.z - pos[2], dist = Math.hypot(dx, dz);
  const dir = [dx / dist, dz / dist];
  const cands = [];
  const base = { pos: [pos[0], pos[1] + 1.15, pos[2]], dir };
  if (dist <= 15) {
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
  const maxT = dist <= 15 ? 4 : 12;
  let best = null, bestScore = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const r = simulate(c, world, { maxT }).result;
    let score = r.dist + (r.ob ? 45 : 0) + (r.holed ? -1000 : 0);
    if (!r.holed && r.dist < 10) score += 0;                 // fine
    if (score < bestScore) { bestScore = score; best = c; }
    if (i % 12 === 11) await yieldFrame();
  }
  const n = NOISE[difficulty] || NOISE.medium;
  return {
    throwType: best.throwType, discId: best.disc.id,
    power: Math.min(1, Math.max(0.12, best.power + gauss() * n.power)),
    yawOffset: best.yawOffset + gauss() * n.yaw,
    hyzer: best.hyzer + gauss() * n.hyzer,
    dir,
  };
}
