import { simulate } from './physics.js';

// A starting power for the preview, not an automatic throw. It is recalculated
// when equipment or lie changes, and after aiming settles. The player still
// chooses power with their swipe.
export function suggestPower(params, world) {
  let best = .72, cost = Infinity;
  const evaluate = power => {
    const r = simulate({ ...params, power }, world, { maxT: 12 }).result;
    const b = world.basket;
    const miss = b ? Math.hypot(r.rest[0] - b.x, r.rest[2] - b.z) : r.dist;
    const score = r.holed ? -1 : miss + (r.ob ? 30 : 0) + power * .01;
    if (score < cost) { cost = score; best = power; }
  };
  for (const power of [.18, .30, .42, .54, .66, .78, .90, 1]) evaluate(power);
  const centre = best;
  for (const offset of [-.06, -.03, .03, .06]) evaluate(Math.max(.10, Math.min(1, centre + offset)));
  return best;
}
