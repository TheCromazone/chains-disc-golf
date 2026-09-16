// Visible wind: streamlines around the action, windsocks on every tee and a shared direction vector the grass
// and canopy shaders bend toward. Pure visuals; the flight model reads world.wind directly.
// Each streamline is a tapered, camera-facing ribbon that carries its own history: the head is advected by the
// wind plus a gentle curl so lines swell and dip like smoke in a wind tunnel, the tail follows, and the whole
// ribbon fades in, brightens toward the head and dissolves before it respawns upwind of the focus.
import * as THREE from 'three';
import { windVec } from './materials.js';

const RIBBONS = 26, POINTS = 22, RANGE = 30, SEG = .34;   // metres between stored tail points: ~7 m ribbons at any frame rate
const _dir = new THREE.Vector3(), _side = new THREE.Vector3(), _tan = new THREE.Vector3(), _toCam = new THREE.Vector3(), _p = new THREE.Vector3();

export function createWindFx(scene, holes, height) {
  const verts = RIBBONS * POINTS * 2;
  const positions = new Float32Array(verts * 3), alphas = new Float32Array(verts), index = [];
  for (let r = 0; r < RIBBONS; r++) for (let i = 0; i < POINTS - 1; i++) { const a = (r * POINTS + i) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(index);
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color('#f4fbff') }, strength: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform vec3 color; uniform float strength; varying float vA; void main(){ gl_FragColor = vec4(color, vA * strength);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  const streaks = new THREE.Mesh(geo, mat); streaks.frustumCulled = false; streaks.renderOrder = 3; scene.add(streaks);
  const ribbons = Array.from({ length: RIBBONS }, () => ({ pts: new Float32Array(POINTS * 3), n: 0, life: Math.random(), dur: 3 + Math.random() * 2.5, seed: Math.random() * 100, speed: 1.15 + Math.random() * .7, lift: 0, x: 0, y: 0, z: 0 }));
  const spawn = (rb, focus, upwind) => {
    rb.n = 0; rb.life = 0; rb.dur = 3 + Math.random() * 2.5; rb.seed = Math.random() * 100; rb.speed = 1.15 + Math.random() * .7;
    const side = (Math.random() - .5) * RANGE * 1.2, back = upwind ? -RANGE * (.35 + Math.random() * .45) : (Math.random() - .5) * RANGE * 1.2;   // always inside the far radius below
    rb.x = focus.x + _dir.x * back - _dir.z * side; rb.z = focus.z + _dir.z * back + _dir.x * side;
    rb.lift = .35 + Math.random() * 2.6; rb.y = height(rb.x, rb.z) + rb.lift;
  };
  // windsocks: orange and white cone on a pole beside each tee pad
  const sockCanvas = document.createElement('canvas'); sockCanvas.width = 8; sockCanvas.height = 64; const ink = sockCanvas.getContext('2d');
  for (let i = 0; i < 5; i++) { ink.fillStyle = i % 2 ? '#fff4e6' : '#ff7a1f'; ink.fillRect(0, i * 12.8, 8, 12.8); }
  const sockMap = new THREE.CanvasTexture(sockCanvas); sockMap.colorSpace = THREE.SRGBColorSpace;
  const sockGeo = new THREE.CylinderGeometry(.045, .12, .95, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, .475);   // open cone pointing +z from its ring
  const sockMat = new THREE.MeshStandardMaterial({ map: sockMap, side: THREE.DoubleSide, roughness: .9 });
  const poleGeo = new THREE.CylinderGeometry(.025, .03, 2.6, 8), poleMat = new THREE.MeshStandardMaterial({ color: '#e8eef0', metalness: .6, roughness: .35 });
  const socks = [], group = new THREE.Group(); scene.add(group);
  for (const h of holes) {
    const dx = h.way[1][0] - h.tee[0], dz = h.way[1][1] - h.tee[1], L = Math.hypot(dx, dz) || 1, rx = -dz / L, rz = dx / L;   // right of the fairway
    const x = h.tee[0] - rx * 4.4 - dx / L * 2.2, z = h.tee[1] - rz * 4.4 - dz / L * 2.2, y = height(x, z);   // left of and behind the pad, opposite the sign
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(x, y + 1.3, z); group.add(pole);
    const pivot = new THREE.Group(); pivot.position.set(x, y + 2.55, z); group.add(pivot);
    const sock = new THREE.Mesh(sockGeo, sockMat); pivot.add(sock); socks.push({ pivot, seed: Math.random() * 9 });
  }
  let calm = true, camPos = new THREE.Vector3();
  const update = (t, dt, wind, focus, camera) => {
    const ws = Math.hypot(wind[0], wind[1]), k = Math.min(1, ws / 7);
    windVec.value.set(wind[0] / 7, wind[1] / 7);   // grass and leaves lean downwind
    _dir.set(wind[0], 0, wind[1]).normalize();
    mat.uniforms.strength.value = Math.min(1, Math.max(0, (ws - 1.0) / 4.5));
    if (camera) camera.getWorldPosition(camPos);
    if (mat.uniforms.strength.value > 0 || !calm) {
      calm = mat.uniforms.strength.value <= 0;
      const step = Math.min(dt, .05), active = Math.round(RIBBONS * (.35 + .65 * k));
      for (let r = 0; r < RIBBONS; r++) {
        const rb = ribbons[r];
        if (r >= active) { rb.n = 0; for (let i = 0; i < POINTS * 2; i++) alphas[r * POINTS * 2 + i] = 0; continue; }
        if (rb.n === 0) spawn(rb, focus, r % 3 !== 0);
        rb.life += step / rb.dur;
        const far = Math.hypot(rb.x - focus.x, rb.z - focus.z) > RANGE * 1.7;
        if (rb.life >= 1 || far) { spawn(rb, focus, true); continue; }
        // advect the head: wind, a slow curl and a breath of lift so lines swell and settle
        const v = ws * rb.speed, s = rb.seed, ph = t * .9 + s;
        const curl = Math.sin(ph * 1.3 + rb.x * .12) * .28 + Math.sin(ph * .37 + rb.z * .07) * .18;
        const rise = Math.sin(ph * .8 + rb.z * .1) * .16 + Math.cos(ph * .23) * .1;
        rb.x += (_dir.x * v - _dir.z * curl * v) * step; rb.z += (_dir.z * v + _dir.x * curl * v) * step;
        rb.y += rise * v * step * .6;
        const floor = height(rb.x, rb.z) + .25; if (rb.y < floor) rb.y = floor; if (rb.y > floor + 4) rb.y = floor + 4;
        // the head slides continuously; a new tail point is stored every SEG metres so the ribbon length is spatial
        if (rb.n === 0 || Math.hypot(rb.x - rb.pts[3], rb.y - rb.pts[4], rb.z - rb.pts[5]) > SEG || rb.n === 1) {
          if (rb.n < POINTS) rb.n++;
          for (let i = rb.n - 1; i > 0; i--) { rb.pts[i * 3] = rb.pts[(i - 1) * 3]; rb.pts[i * 3 + 1] = rb.pts[(i - 1) * 3 + 1]; rb.pts[i * 3 + 2] = rb.pts[(i - 1) * 3 + 2]; }
        }
        rb.pts[0] = rb.x; rb.pts[1] = rb.y; rb.pts[2] = rb.z;
        const env = Math.sin(Math.PI * Math.min(1, rb.life)) * Math.min(1, rb.n / 5), width = .09 + k * .09;
        for (let i = 0; i < POINTS; i++) {
          const j = Math.min(i, rb.n - 1), o = (r * POINTS + i) * 2;
          _p.set(rb.pts[j * 3], rb.pts[j * 3 + 1], rb.pts[j * 3 + 2]);
          const a = Math.max(0, Math.min(rb.n - 1, j)), b = Math.max(0, Math.min(rb.n - 1, j + 1)), c = Math.max(0, j - 1);
          _tan.set(rb.pts[c * 3] - rb.pts[b * 3], rb.pts[c * 3 + 1] - rb.pts[b * 3 + 1], rb.pts[c * 3 + 2] - rb.pts[b * 3 + 2]);
          if (_tan.lengthSq() < 1e-8) _tan.copy(_dir);
          _toCam.copy(camPos).sub(_p); _side.crossVectors(_tan, _toCam).normalize();
          const u = j / (POINTS - 1), taper = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * .35), w = width * taper * (.6 + .4 * Math.sin(u * 9 + s));
          positions[o * 3] = _p.x + _side.x * w; positions[o * 3 + 1] = _p.y + _side.y * w; positions[o * 3 + 2] = _p.z + _side.z * w;
          positions[o * 3 + 3] = _p.x - _side.x * w; positions[o * 3 + 4] = _p.y - _side.y * w; positions[o * 3 + 5] = _p.z - _side.z * w;
          const fade = i >= rb.n ? 0 : env * (1 - u * u) * (.75 + .25 * (1 - Math.abs(u - .15) * 2));
          alphas[o] = fade; alphas[o + 1] = fade;
        }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.alpha.needsUpdate = true;
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
