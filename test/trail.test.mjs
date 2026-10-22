import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlightTrail } from '../src/flight-trail.js';

// The ribbon must appear from the second sample of a flight (a first version cleared itself every frame while it held
// one sample and never drew), keep a fixed angular width at any distance, fade into the lens and where it is seen end-on, and clear when the flight ends.
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(58, 16 / 9, .2, 1600), trail = createFlightTrail(scene);
const mesh = scene.children[0], fade = () => mesh.geometry.attributes.fade.array, pos = () => mesh.geometry.attributes.position.array;
camera.position.set(0, 2, 0);
trail.start('#ff2e88');
trail.push([0, 1.5, -2], 0); trail.update(camera, true);
assert.equal(mesh.visible, false, 'one sample draws nothing');
for (let i = 1; i <= 60; i++) { trail.push([0, 1.5 + i * .05, -2 - i * .5], i / 60); trail.update(camera, true); }
assert.equal(mesh.visible, true, 'a flight draws its ribbon');
// from straight behind (the chase camera on the line) the ribbon is seen end-on and fades: it read as a stick under the disc
assert(Math.max(...fade()) < .2, 'end-on from behind it fades');
camera.position.set(12, 3, -24); trail.update(camera, true);   // the side view (aim camera, run-up, landing shot): drawn
const f = fade(), p = pos(), tail = 0, head = Math.max(...[...Array(64).keys()].filter(i => f[i * 2] > 0));   // spare slots past the newest sample stay empty
assert(f[head * 2] > .7, 'opaque at the disc');
assert(f[tail * 2] < f[head * 2], 'fading toward the tail');
const width = i => Math.hypot(p[i * 6] - p[i * 6 + 3], p[i * 6 + 1] - p[i * 6 + 4], p[i * 6 + 2] - p[i * 6 + 5]);
const dist = i => Math.hypot((p[i * 6] + p[i * 6 + 3]) / 2 - camera.position.x, (p[i * 6 + 1] + p[i * 6 + 4]) / 2 - camera.position.y, (p[i * 6 + 2] + p[i * 6 + 5]) / 2 - camera.position.z);
assert(Math.abs(width(head) / dist(head) - .0064) < 1e-3, 'fixed angular width at the disc');
camera.position.set(0, 2, 0); trail.push([0, 1.5, -2.5], 1.1); trail.update(camera, true);
{ const g = fade(), h = Math.max(...[...Array(64).keys()].filter(i => g[i * 2] > 0 || i === 0)); assert(g[h * 2] < .2, 'a ribbon passing under the lens fades out'); }
trail.update(camera, false);
assert.equal(mesh.visible, false, 'the ribbon clears when the flight ends');
// A putt (start with the basket's [x, z]): seen from the locked aim frame behind the thrower, nearly end-on, it still draws (the
// critics lost the disc between the hand and the chains), faint and thin, and never over the basket at the catch.
camera.position.set(1, 2.2, 3.5); camera.lookAt(0, 1, -8); camera.updateMatrixWorld();
trail.start('#ff7a1a', [0, -8]);
const putt = i => [.7 - Math.min(24, i) * .03, 1.1, -Math.min(8, i / 3)];   // 10 m/s, into the chains at i = 24
for (let i = 0; i <= 16; i++) { trail.push(putt(i), i / 30); trail.update(camera, true); }   // mid-flight, 2.7 m short of the basket
{ const g = fade(), on = [...Array(64).keys()].filter(i => g[i * 2] > 0), h = on.at(-1);
  assert(g[h * 2] > .2 && g[h * 2] < .5, 'a putt draws a faint trail from behind the thrower');
  assert(width(h) / dist(h) < .0064 * .7, 'thinner than a drive'); }
for (let i = 17; i <= 30; i++) { trail.push(putt(i), i / 30); trail.update(camera, true); }   // the catch
assert(Math.max(...fade()) < .05, 'gone over the basket at the catch');
trail.dispose(); assert.equal(scene.children.length, 0, 'disposed');
console.log('Flight trail OK: draws from its second sample, fixed angular width, fades at the lens, clears after the flight.');
