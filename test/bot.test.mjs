// Run: node test/bot.test.mjs
// The bot plans with the real physics, then throws with its difficulty's execution error. The best line thrown perfectly is
// often the one that shaves a trunk, and the error then finds the trunk: a hard bot must pick a line its own error clears.
import assert from 'node:assert/strict';
import { simulate, flatWorld, discById, releasePos } from '../src/physics.js';
import { planBotThrow } from '../src/bot.js';

let seed = 1;
Math.random = () => (seed = Math.imul(seed ^ (seed >>> 15), 2246822519) + 0x6d2b79f5 >>> 0) / 4294967296;
const pos = [0, 0, 0], open = flatWorld({ x: 0, y: 0, z: -90 });
const play = async (world, run) => {
  seed = 1000 + run * 7919;
  const p = await planBotThrow({ pos, world, difficulty: 'hard' });
  return simulate({ ...p, disc: discById(p.discId), launchOffset: 0, pos: releasePos(world, pos, p.dir), lefty: false }, world, { record: true, every: 1 });
};

// An open 90 m hole: the hard bot throws a forehand driver out left and lets it fade back to the pin.
const first = await play(open, 0);
assert(first.result.dist < 8, `the open hole's drive finishes near the pin (${first.result.dist.toFixed(1)} m)`);
// Thrown perfectly, the best of those lines (the planner's grid of yaws, flat release) is the one it aims to copy.
const lines = [0, 9, 18].map(yawOffset => ({ throwType: 'forehand', disc: discById('driver'), power: 1, yawOffset, hyzer: 0, dir: [0, -1], pos: releasePos(open, pos, [0, -1]) }));
const flights = lines.map(l => simulate(l, open, { record: true, every: 1 })), best = flights.indexOf(flights.reduce((a, s) => s.result.dist < a.result.dist ? s : a));
// A trunk stands at that line's widest point with its bark 15 cm outside the disc's flight: the perfect throw clears it,
// and a throw that drifts a little wider hits it.
const apex = flights[best].traj.reduce((a, q) => q[0] < a[0] ? q : a), trunk = { x: apex[0] - (0.3 + 0.09 + 0.15), z: apex[2], y: 0, r: 0.3, h: 14, fy: 9, fr: 0 };
const wooded = { ...open, treesNear: () => [trunk] };
assert(!simulate(lines[best], wooded).state.events.includes('tree'), 'the perfect throw clears the trunk');
let hits = 0, far = 0;
for (let run = 0; run < 100; run++) {
  const s = await play(wooded, run);
  hits += s.state.events.includes('tree'); far += s.result.dist;
}
console.log(`hard bot past a trunk by its line: ${hits}/100 drives touch it, finishing ${(far / 100).toFixed(1)} m out on average`);
assert(hits <= 10, `the hard bot takes a line its own error clears (${hits}/100 drives touched the trunk; planning the perfect throw alone, about 20)`);
assert(far / 100 < 12, 'and still drives close');
// Putting: of the putts that drop thrown perfectly, the bot takes the one through the middle of the chains (not the first
// that scrapes in), so a hard bot holes everything from 3 and 6 m.
for (const d of [3, 6]) {
  const green = flatWorld({ x: 0, y: 0, z: -d }); let made = 0;
  for (let run = 0; run < 40; run++) {
    seed = 500 + run * 7919;
    const p = await planBotThrow({ pos, world: green, difficulty: 'hard' });
    made += simulate({ ...p, disc: discById(p.discId), launchOffset: 0, pos: releasePos(green, pos, p.dir), lefty: false }, green).result.holed;
  }
  assert.equal(made, 40, `a hard bot holes every putt from ${d} m (${made}/40)`);
}
console.log('bot OK — a hard bot plans around its own execution error and putts at the middle of the chains');
