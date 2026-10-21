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

// The putt's line (and any throw from inside the circle): the flight cut where it reaches the basket's plane, flown in an open
// world so it never caroms off the pole and loops back. It used to carry 70% of a fixed 72% flight, which from 6.5 m sailed
// over the cage, far up and left, and came back down out of frame. `cross` is its height over the basket's foot there (null:
// it lands short).
export const CHAIN_MID = 1.03;   // physics.js hitBasket: the chains catch from .72 to 1.34 m
export function basketLine(params, world, every = 3) {
  const b = world.basket, { traj } = simulate(params, { ...world, treesNear: () => [], basket: null }, { record: true, every, maxT: 6 });
  if (!b) return { traj, cross: null };
  const [dx, dz] = params.dir, [x0, , z0] = params.pos, along = q => (q[0] - x0) * dx + (q[2] - z0) * dz, D = along([b.x, 0, b.z]);
  for (let i = 1; i < traj.length; i++) {
    const a = traj[i - 1], q = traj[i], ta = along(a), tq = along(q);
    if (tq >= D && tq > ta) { const u = (D - ta) / (tq - ta), p = a.map((v, k) => v + (q[k] - v) * u); return { traj: [...traj.slice(0, i), p], cross: p[1] - b.y }; }
  }
  return { traj, cross: null };
}
// The idle line's power: the flight that meets the middle of the chains. Only the line uses it; no power mark is shown, so the
// swipe still decides the putt (and during the swipe the line follows the swipe's own power).
export function puttPower(params, world) {
  let lo = .12, hi = 1;
  for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2, c = basketLine({ ...params, power: mid }, world, 8).cross; if (c == null || c < CHAIN_MID) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
