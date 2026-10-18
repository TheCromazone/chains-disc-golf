// Ground-contact debris: a small pool of soft point sprites kicked up when the disc lands, skips, rolls or flops.
// One draw call, CPU-integrated, works in Lite.
import * as THREE from 'three';

const MAX = 96;
export function createPuffs(scene) {
  const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), size = new Float32Array(MAX), tint = new Float32Array(MAX * 3), floor = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('life', new THREE.BufferAttribute(life, 1)); geo.setAttribute('psize', new THREE.BufferAttribute(size, 1)); geo.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  // uPx: pixels per metre at 1 m (the buffer's height over 2 tan(fov/2), set by update()); a fixed 220 drew a 5 cm clod 7 m out
  // at ~2 px on a phone's 2x buffer, so landings kicked up nothing anyone could see (QA on a phone, 2026-10-17)
  const uPx = { value: 220 };
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uPx },
    vertexShader: 'uniform float uPx;attribute float life;attribute float psize;attribute vec3 tint;varying float vLife;varying vec3 vTint;void main(){vLife=life;vTint=tint;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=life>0.?psize*(1.+ (1.-life)*.8)*uPx/max(1.,-mv.z):0.;}',
    fragmentShader: 'varying float vLife;varying vec3 vTint;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=smoothstep(.5,.15,d)*vLife*.85;gl_FragColor=vec4(vTint,a);}' });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 4; scene.add(points);
  let head = 0, active = 0;
  const PALETTE = { grass: [[.66, .8, .42], [.8, .86, .52], [.74, .66, .44]],   // sun-caught clippings and a little dust: the old mid-greens vanished into the turf they flew off
    dirt: [[.62, .52, .38], [.72, .62, .46]], sand: [[.9, .83, .6], [.84, .76, .55]], water: [[.82, .93, 1], [.94, .98, 1], [.7, .86, .95]] };
  // A splash also rings the water: two ripples spreading from where the disc went in (the spray alone read as a few blue dots).
  const RINGS = 4, ringGeo = new THREE.RingGeometry(.9, 1, 48).rotateX(-Math.PI / 2), rings = [];
  for (let i = 0; i < RINGS; i++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#eaf8ff', transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 })); m.visible = false; m.renderOrder = 4; m.userData.age = -10; scene.add(m); rings.push(m); }
  let nextRing = 0;
  // kind: land | skip | roll | flop | splash. strength scales count and launch speed.
  function burst(p, kind = 'land', strength = 1, surface = 'grass') {
    const splash = kind === 'splash', n = Math.round((kind === 'skip' ? 14 : kind === 'flop' ? 8 : kind === 'roll' ? 6 : splash ? 34 : 12) * Math.min(1.6, .5 + strength));
    if (splash) for (const delay of [0, .22]) { const m = rings[nextRing]; nextRing = (nextRing + 1) % RINGS; m.position.set(p[0], p[1] + .015, p[2]); m.userData.age = -delay; m.userData.reach = 1.6 + strength * .9; }
    const colors = PALETTE[surface] || PALETTE.grass;
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % MAX; active = Math.min(MAX, active + 1);
      const a = Math.random() * Math.PI * 2, r = Math.random() * .12, up = (kind === 'roll' ? .6 : splash ? 2.4 : 1.4) * (.5 + Math.random()) * Math.min(2, strength + .4);   // a splash throws a crown of spray up
      pos[i * 3] = p[0] + Math.cos(a) * r; pos[i * 3 + 1] = p[1] + .02; pos[i * 3 + 2] = p[2] + Math.sin(a) * r;
      vel[i * 3] = Math.cos(a) * (.4 + Math.random() * 1.2) * strength * (splash ? .6 : 1); vel[i * 3 + 1] = up; vel[i * 3 + 2] = Math.sin(a) * (.4 + Math.random() * 1.2) * strength * (splash ? .6 : 1);
      life[i] = 1; size[i] = splash ? .05 + Math.random() * .07 : .035 + Math.random() * .035; floor[i] = p[1];
      const c = colors[k % colors.length]; tint[i * 3] = c[0]; tint[i * 3 + 1] = c[1]; tint[i * 3 + 2] = c[2];
    }
    geo.attributes.position.needsUpdate = geo.attributes.life.needsUpdate = geo.attributes.psize.needsUpdate = geo.attributes.tint.needsUpdate = true;
  }
  function update(dt, camera = null, renderer = null) {
    if (camera && renderer) uPx.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (const m of rings) { const g = m.userData; if (g.age < -5) continue; g.age += dt; const u = g.age / 1.5;
      if (u >= 1) { g.age = -10; m.visible = false; continue; } m.visible = g.age > 0; if (!m.visible) continue;
      m.scale.setScalar(.2 + g.reach * (1 - (1 - u) * (1 - u))); m.material.opacity = .6 * (1 - u) ** 1.5; }
    if (!active) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt * 1.6; if (life[i] <= 0) { life[i] = 0; continue; }
      alive++;
      vel[i * 3 + 1] -= 6 * dt; vel[i * 3] *= 1 - 1.5 * dt; vel[i * 3 + 2] *= 1 - 1.5 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(pos[i * 3 + 1] + vel[i * 3 + 1] * dt, floor[i]);   // the ground it was kicked from (it was world y 0: below it the debris popped up, above it it sank into the hill) pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    active = alive;
    geo.attributes.position.needsUpdate = geo.attributes.life.needsUpdate = true;
  }
  return { burst, update, dispose() { scene.remove(points); geo.dispose(); mat.dispose(); for (const m of rings) { scene.remove(m); m.material.dispose(); } ringGeo.dispose(); } };
}
