import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlightTrail } from '../src/flight-trail.js';

// The ribbon must appear from the second sample of a flight (a first version cleared itself every frame while it held
// one sample and never drew), keep a fixed angular width at any distance, fade into the lens, and clear when the flight ends.
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(58, 16 / 9, .2, 1600), trail = createFlightTrail(scene);
const mesh = scene.children[0], fade = () => mesh.geometry.attributes.fade.array, pos = () => mesh.geometry.attributes.position.array;
camera.position.set(0, 2, 0);
trail.start('#ff2e88');
trail.push([0, 1.5, -2], 0); trail.update(camera, true);
assert.equal(mesh.visible, false, 'one sample draws nothing');
for (let i = 1; i <= 60; i++) { trail.push([0, 1.5 + i * .05, -2 - i * .5], i / 60); trail.update(camera, true); }
assert.equal(mesh.visible, true, 'a flight draws its ribbon');
const f = fade(), p = pos(), tail = 0, head = Math.max(...[...Array(64).keys()].filter(i => f[i * 2] > 0));   // spare slots past the newest sample stay empty
assert(f[head * 2] > .7, 'opaque at the disc');
assert(f[tail * 2] < f[head * 2], 'fading toward the tail');
const width = i => Math.hypot(p[i * 6] - p[i * 6 + 3], p[i * 6 + 1] - p[i * 6 + 4], p[i * 6 + 2] - p[i * 6 + 5]);
const dist = i => Math.hypot((p[i * 6] + p[i * 6 + 3]) / 2 - camera.position.x, (p[i * 6 + 1] + p[i * 6 + 4]) / 2 - camera.position.y, (p[i * 6 + 2] + p[i * 6 + 5]) / 2 - camera.position.z);
assert(Math.abs(width(head) / dist(head) - .0064) < 1e-3, 'fixed angular width at the disc');
trail.push([0, 1.5, -2.5], 1.1); trail.update(camera, true);
{ const g = fade(), h = Math.max(...[...Array(64).keys()].filter(i => g[i * 2] > 0 || i === 0)); assert(g[h * 2] < .2, 'a ribbon passing under the lens fades out'); }
trail.update(camera, false);
assert.equal(mesh.visible, false, 'the ribbon clears when the flight ends');
trail.dispose(); assert.equal(scene.children.length, 0, 'disposed');
console.log('Flight trail OK: draws from its second sample, fixed angular width, fades at the lens, clears after the flight.');
