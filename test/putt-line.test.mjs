import assert from 'node:assert/strict';
import { flatWorld, discById, simulate } from '../src/physics.js';
import { basketLine, puttPower, CHAIN_MID } from '../src/shot-planning.js';

// The putt's aim line ends at the basket, and its idle power meets the chains. The capture's 6.5 m putt used to draw 70% of a
// fixed 72% flight: over the cage, off to the left and back down out of frame.
const w = flatWorld({ x: 0, y: 0, z: -6.5 });
const putt = { throwType: 'putt', disc: discById('putter'), dir: [0, -1], pos: [0, 1.15, -.4], hyzer: 0, yawOffset: 0, launchOffset: 0 };
const power = puttPower(putt, w), line = basketLine({ ...putt, power }, w), end = line.traj.at(-1);
assert.ok(Math.abs(line.cross - CHAIN_MID) < .05, `idle line meets the chains' middle (${line.cross?.toFixed(3)} m)`);
assert.ok(Math.abs(end[2] - -6.5) < 1e-6, 'the line stops on the basket plane');
assert.ok(line.traj.every(q => q[2] >= -6.5 - 1e-6), 'nothing past the basket');
assert.ok(simulate({ ...putt, power }, w).result.holed, 'that power holes the putt in the real world');
const soft = basketLine({ ...putt, power: .15 }, w), hard = basketLine({ ...putt, power: 1 }, w);
assert.ok(soft.cross == null || soft.cross < CHAIN_MID, 'a soft swipe drops short or low');
assert.ok(hard.cross > CHAIN_MID, 'a hard swipe crosses high');
console.log(`putt line ok: ${Math.round(power * 100)}% from 6.5 m, ${line.traj.length} points`);
