import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAimLine } from '../src/aim-line.js';

// The aim guide is one unbroken strip (the dashed LineMaterial broke into floating bars at phone size): every flight point
// is a vertex pair, repeated points collapse (a disc at rest repeats its point), the strip runs the whole flight, and the
// distance along it grows from the player, so the fades and the swell are measured in metres.
const parent = new THREE.Group(), line = createAimLine(parent), mesh = parent.children[0], g = mesh.geometry;
const pts = Array.from({ length: 40 }, (_, i) => [0, 1.2 + Math.sin(i / 39 * Math.PI) * 3, -i * 1.5]);
const len = line.set([...pts, pts.at(-1), pts.at(-1)], { fadeIn: 1.5, fadeOut: 4, end: .5 });
assert.equal(g.drawRange.count, 39 * 6, 'one strip, two triangles per segment, no gaps');
assert.ok(Math.abs(len - pts.reduce((d, q, i) => i ? d + Math.hypot(...q.map((v, k) => v - pts[i - 1][k])) : 0, 0)) < 1e-4, 'its length is the flight\'s');
const along = g.attributes.along.array;
for (let i = 1; i < 40; i++) assert.ok(along[i * 2] > along[i * 2 - 2] && along[i * 2] === along[i * 2 + 1], 'distance grows from the player, the same on both sides');
assert.deepEqual([...g.attributes.side.array.slice(0, 4)], [1, -1, 1, -1], 'the pair straddles the line');
const f32 = q => [...new Float32Array(q)];
assert.deepEqual([...g.attributes.prev.array.slice(0, 3)], f32(pts[0]), 'the first point is its own previous');
assert.deepEqual([...g.attributes.next.array.slice(39 * 6, 39 * 6 + 3)], f32(pts[39]), 'the last its own next');
assert.equal(mesh.visible, true);
line.set([[0, 1, 0], [0, 1, 0]]); assert.equal(mesh.visible, false, 'a single point draws nothing');
const long = line.set(Array.from({ length: 500 }, (_, i) => [0, 1, -i * .1]));
assert.ok(g.drawRange.count <= 199 * 6 && Math.abs(long - 49.9) < 1e-3, 'a long flight is thinned to the buffer, end to end');
line.dispose(); assert.equal(parent.children.length, 0, 'disposed');
console.log('Aim line OK: one unbroken strip per flight, measured in metres from the player.');
