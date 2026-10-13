import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JITTER, moved, createTemporal } from '../src/temporal.js';
// Sub-pixel Halton jitter: inside the pixel, distinct, centred.
assert.equal(new Set(JITTER.map(String)).size, JITTER.length);
for (const [x, y] of JITTER) assert(Math.abs(x) < .5 && Math.abs(y) < .5);
assert(Math.abs(JITTER.reduce((s, [x]) => s + x, 0) / JITTER.length) < .07 && Math.abs(JITTER.reduce((s, [, y]) => s + y, 0) / JITTER.length) < .07);
assert(!moved([1, 2], [1, 2 + 1e-6]) && moved([1, 2], [1, 2.001]));
// Jitter only once the camera holds still, and the projection always comes back exactly.
const t = createTemporal(), renderer = { getDrawingBufferSize: v => v.set(200, 100) }, cam = new THREE.PerspectiveCamera(50, 2, .1, 100);
const p0 = cam.projectionMatrix.clone();
assert.equal(t.begin(renderer, cam), false); t.end(cam);
assert.equal(t.begin(renderer, cam), true); assert(!cam.projectionMatrix.equals(p0)); t.end(cam); assert(cam.projectionMatrix.equals(p0));
assert.equal(t.begin(renderer, cam), true); t.end(cam); assert.equal(t.frames, 2);
cam.position.x += .01; assert.equal(t.begin(renderer, cam), false); t.end(cam); assert.equal(t.frames, 0); assert(cam.projectionMatrix.equals(p0));
t.begin(renderer, cam); t.end(cam); assert.equal(t.begin(renderer, cam, false), false); t.end(cam); assert.equal(t.frames, 0);   // fast action in front of a held camera drops the history
console.log('Temporal resolve: Halton jitter in-pixel and centred, jitter only on held frames, projection restored.');
