// Visible wind: drifting streaks around the action, windsocks on every tee and a shared direction vector
// the grass and canopy shaders bend toward. Pure visuals; the flight model reads world.wind directly.
import * as THREE from 'three';
import { windVec } from './materials.js';

const STREAKS = 56, RANGE = 34;
const _dir = new THREE.Vector3(), _tmp = new THREE.Vector3();

export function createWindFx(scene, holes, height) {
  // streaks: line segments that ride the wind, fade in with its strength and wrap around the focus
  const positions = new Float32Array(STREAKS * 6);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  const streaks = new THREE.LineSegments(geo, mat); streaks.frustumCulled = false; streaks.renderOrder = 3; scene.add(streaks);
  const seeds = Array.from({ length: STREAKS }, (_, i) => ({ x: (Math.random() - .5) * RANGE * 2, y: .4 + Math.random() * 3.2, z: (Math.random() - .5) * RANGE * 2, phase: Math.random() * 7, speed: .7 + Math.random() * .6 }));
  // windsocks: orange and white cone on a pole beside each tee pad
  const sockCanvas = document.createElement('canvas'); sockCanvas.width = 8; sockCanvas.height = 64; const ink = sockCanvas.getContext('2d');
  for (let i = 0; i < 5; i++) { ink.fillStyle = i % 2 ? '#fff4e6' : '#ff7a1f'; ink.fillRect(0, i * 12.8, 8, 12.8); }
  const sockMap = new THREE.CanvasTexture(sockCanvas); sockMap.colorSpace = THREE.SRGBColorSpace;
  const sockGeo = new THREE.CylinderGeometry(.045, .12, .95, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, .475);   // open cone pointing +z from its ring
  const sockMat = new THREE.MeshToonMaterial({ map: sockMap, side: THREE.DoubleSide });
  const poleGeo = new THREE.CylinderGeometry(.025, .03, 2.6, 8), poleMat = new THREE.MeshToonMaterial({ color: '#f0f4f6' });
  const socks = [], group = new THREE.Group(); scene.add(group);
  for (const h of holes) {
    const dx = h.way[1][0] - h.tee[0], dz = h.way[1][1] - h.tee[1], L = Math.hypot(dx, dz) || 1, rx = -dz / L, rz = dx / L;   // right of the fairway
    const x = h.tee[0] - rx * 4.4 - dx / L * 2.2, z = h.tee[1] - rz * 4.4 - dz / L * 2.2, y = height(x, z);   // left of and behind the pad, opposite the sign
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(x, y + 1.3, z); group.add(pole);
    const pivot = new THREE.Group(); pivot.position.set(x, y + 2.55, z); group.add(pivot);
    const sock = new THREE.Mesh(sockGeo, sockMat); pivot.add(sock); socks.push({ pivot, seed: Math.random() * 9 });
  }
  let calm = true;
  const update = (t, dt, wind, focus) => {
    const ws = Math.hypot(wind[0], wind[1]), k = Math.min(1, ws / 7);
    windVec.value.set(wind[0] / 7, wind[1] / 7);   // grass and leaves lean downwind
    _dir.set(wind[0], 0, wind[1]).normalize();
    mat.opacity = Math.max(0, (ws - 1.2) / 6) * .5;
    if (mat.opacity > 0 || !calm) {
      calm = mat.opacity <= 0;
      const len = .8 + ws * .5;
      for (let i = 0; i < STREAKS; i++) {
        const s = seeds[i];
        s.x += wind[0] * s.speed * dt; s.z += wind[1] * s.speed * dt;
        if (s.x - focus.x > RANGE) s.x -= RANGE * 2; if (s.x - focus.x < -RANGE) s.x += RANGE * 2;
        if (s.z - focus.z > RANGE) s.z -= RANGE * 2; if (s.z - focus.z < -RANGE) s.z += RANGE * 2;
        const y = height(s.x, s.z) + s.y + Math.sin(t * 1.7 + s.phase) * .25;
        positions[i * 6] = s.x; positions[i * 6 + 1] = y; positions[i * 6 + 2] = s.z;
        positions[i * 6 + 3] = s.x + _dir.x * len; positions[i * 6 + 4] = y + Math.cos(t * 1.7 + s.phase) * .08; positions[i * 6 + 5] = s.z + _dir.z * len;
      }
      geo.attributes.position.needsUpdate = true;
    }
    for (const s of socks) {
      const flutter = Math.sin(t * 5.1 + s.seed) * .06 * k + Math.sin(t * 2.3 + s.seed * 2) * .04;
      const yaw = Math.atan2(_dir.x, _dir.z) + flutter;                       // cone points downwind
      const droop = (1 - k) * 1.35 + Math.sin(t * 3.7 + s.seed) * .05 * (1 - k);   // hangs when calm, flies level in a gale
      s.pivot.rotation.set(0, 0, 0); s.pivot.rotateY(yaw); s.pivot.rotateX(droop);
    }
  };
  const dispose = () => { scene.remove(streaks, group); geo.dispose(); mat.dispose(); sockGeo.dispose(); sockMat.dispose(); sockMap.dispose(); poleGeo.dispose(); poleMat.dispose(); };
  return { update, dispose, streaks, group };
}
