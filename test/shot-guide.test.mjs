import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShotGuide } from '../src/shot-guide.js';
import { createAimChevrons } from '../src/aim-line.js';

// The landing ring is one closed screen-space strip round the planned landing (the 1 px LineLoop vanished on phones): a vertex
// pair per step round the circle, the last pair closing on the first, its centre and ground normal handed to the shader, mint
// in bounds and salmon out, sitting on the water's surface over a pond.
const world = { height: (x, z) => .1 * x, normal: () => [-.1, 1, 0], inWater: x => x > 50, waterLevel: () => -1, rough: () => 0 };
const parent = new THREE.Group(), guide = createShotGuide(parent), ring = guide.group.children[0], g = ring.geometry, u = guide.material.uniforms;
assert.equal(guide.group.children.length, 1, 'one draw: the ring (the cross went with the hairline)');
const n = g.attributes.ang.count;
assert.equal(g.index.count, (n / 2 - 1) * 6, 'two triangles per step, no gaps');
assert.ok(Math.abs(g.attributes.ang.array[n - 1] - Math.PI * 2) < 1e-6 && g.attributes.ang.array[0] === 0, 'the strip closes on itself');
assert.deepEqual([...g.attributes.side.array.slice(0, 4)], [1, -1, 1, -1], 'each pair straddles the ring');
let est = guide.set({ rest: [20, 0, 5], thrown: 40, dist: 3, ob: false, holed: false }, world, false);
assert.deepEqual(est, { range: 40, left: 3, surface: 'Fairway', danger: false });
assert.deepEqual(u.centre.value.toArray(), [20, 2, 5], 'on the ground under the landing');
assert.ok(Math.abs(u.ground.value.length() - 1) < 1e-6 && u.ground.value.x < 0, 'laid on the slope');
assert.equal(u.radius.value, 1.25); assert.equal(u.color.value.getHexString(), '5cf0a8');
est = guide.set({ rest: [60, 0, 5], thrown: 80, dist: 20, ob: true, holed: false }, world, false);
assert.equal(est.surface, 'Water · penalty'); assert.equal(est.danger, true);
assert.deepEqual(u.centre.value.toArray(), [60, -1, 5], 'on the pond'); assert.deepEqual(u.ground.value.toArray(), [0, 1, 0], 'flat on the water');
assert.equal(u.color.value.getHexString(), 'ff9275', 'salmon out of bounds');
guide.dispose(); assert.equal(parent.children.length, 0, 'disposed');

// The short putt's chevrons: one quad, its far apex where main.js asks for it.
const chev = createAimChevrons(parent);
assert.equal(chev.mesh.visible, false, 'hidden until the putt line stands down');
const [step, depth] = chev.span;
assert.ok(Math.abs(chev.centre(1.75) + step / 2 + depth / 2 - 1.75) < 1e-9, 'centred so the far apex lands where asked');
chev.mesh.geometry.computeBoundingBox(); const bb = chev.mesh.geometry.boundingBox;
assert.ok(bb.max.z - bb.min.z > step + depth && Math.abs(bb.max.y - bb.min.y) < 1e-9, 'flat, long enough for both chevrons and their halo');
chev.dispose(); assert.equal(parent.children.length, 0);
console.log('Shot guide OK: a closed ring strip on the ground, the chevrons placed by their far apex.');
