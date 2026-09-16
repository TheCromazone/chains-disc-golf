// Ground-contact debris: a small pool of soft point sprites kicked up when the disc lands, skips, rolls or flops.
// One draw call, CPU-integrated, works in Lite.
import * as THREE from 'three';

const MAX = 96;
export function createPuffs(scene) {
  const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), size = new Float32Array(MAX), tint = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('life', new THREE.BufferAttribute(life, 1)); geo.setAttribute('psize', new THREE.BufferAttribute(size, 1)); geo.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    vertexShader: 'attribute float life;attribute float psize;attribute vec3 tint;varying float vLife;varying vec3 vTint;void main(){vLife=life;vTint=tint;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=life>0.?psize*(1.+ (1.-life)*.8)*220./max(1.,-mv.z):0.;}',
    fragmentShader: 'varying float vLife;varying vec3 vTint;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=smoothstep(.5,.15,d)*vLife*.85;gl_FragColor=vec4(vTint,a);}' });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 4; scene.add(points);
  let head = 0, active = 0;
  const PALETTE = { grass: [[.45, .72, .3], [.6, .8, .35], [.36, .58, .26]], dirt: [[.62, .52, .38], [.72, .62, .46]], sand: [[.9, .83, .6], [.84, .76, .55]], water: [[.7, .86, .95], [.85, .93, 1]] };
  // kind: land | skip | roll | flop | splash. strength scales count and launch speed.
  function burst(p, kind = 'land', strength = 1, surface = 'grass') {
    const n = Math.round((kind === 'skip' ? 14 : kind === 'flop' ? 8 : kind === 'roll' ? 6 : kind === 'splash' ? 22 : 12) * Math.min(1.6, .5 + strength));
    const colors = PALETTE[surface] || PALETTE.grass;
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % MAX; active = Math.min(MAX, active + 1);
      const a = Math.random() * Math.PI * 2, r = Math.random() * .12, up = (kind === 'roll' ? .6 : 1.4) * (.5 + Math.random()) * Math.min(2, strength + .4);
      pos[i * 3] = p[0] + Math.cos(a) * r; pos[i * 3 + 1] = p[1] + .02; pos[i * 3 + 2] = p[2] + Math.sin(a) * r;
      vel[i * 3] = Math.cos(a) * (.4 + Math.random() * 1.2) * strength; vel[i * 3 + 1] = up; vel[i * 3 + 2] = Math.sin(a) * (.4 + Math.random() * 1.2) * strength;
      life[i] = 1; size[i] = kind === 'splash' ? .08 : .035 + Math.random() * .035;
      const c = colors[k % colors.length]; tint[i * 3] = c[0]; tint[i * 3 + 1] = c[1]; tint[i * 3 + 2] = c[2];
    }
    geo.attributes.position.needsUpdate = geo.attributes.life.needsUpdate = geo.attributes.psize.needsUpdate = geo.attributes.tint.needsUpdate = true;
  }
  function update(dt) {
    if (!active) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt * 1.6; if (life[i] <= 0) { life[i] = 0; continue; }
      alive++;
      vel[i * 3 + 1] -= 6 * dt; vel[i * 3] *= 1 - 1.5 * dt; vel[i * 3 + 2] *= 1 - 1.5 * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(pos[i * 3 + 1] + vel[i * 3 + 1] * dt, 0.0); pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    active = alive;
    geo.attributes.position.needsUpdate = geo.attributes.life.needsUpdate = true;
  }
  return { burst, update, dispose() { scene.remove(points); geo.dispose(); mat.dispose(); } };
}
