import * as THREE from 'three';

// The disc's flight ribbon. Reference round against Disc Golf Masters (2026-10-07): a 21 cm disc 40 m out is a few
// pixels on the turf, and nothing showed where a throw went; their discs draw a coloured ribbon. A camera-facing strip
// over the last TAIL seconds of flight in the disc's own colour, widest and most opaque at the disc. Its width is a fixed
// angle (WIDE x the eye distance: ~7 px at the disc on a 1080p screen), so a drive reads the same at 80 m, and it fades
// out within a few metres of the lens: the chase camera sits on the line, and a ribbon passing under it filled the frame.
// Unfogged and unlit: it is a readout drawn into the world. Time is flight time, so the chain-hit slow motion keeps the ribbon's length.
// A putt in its locked aim frame (start's pin, the basket's [x, z]) gets a short, faint, thin wisp instead: blind critics lost the
// disc between the hand and the chains, and that frame sees the line nearly end-on, which faded the ribbon to nothing. Its
// end-on fade is off (from behind the thrower the line runs hand to chains on screen, not a stick under the disc), and it is
// gone within 1.6 m of the basket, so the catch is the chains, never a streak across them.
const N = 64, TAIL = .8, WIDE = .0032, _white = new THREE.Color(1, 1, 1);
export function createFlightTrail(scene) {
  const pos = new Float32Array(N * 6), fade = new Float32Array(N * 2), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('fade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
  const color = new THREE.Color();
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uColor: { value: color } },
    vertexShader: 'attribute float fade;varying float vFade;void main(){vFade=fade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 uColor;varying float vFade;void main(){gl_FragColor=linearToOutputTexel(vec4(uColor,vFade));}' });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 4; scene.add(mesh);
  const samples = []; let now = 0, pin = null, tail = TAIL;   // { p: [x, y, z], t } oldest first; the last one rides the disc
  const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  return {
    start(hex, basket = null) { samples.length = 0; color.set(hex).lerp(_white, .12); pin = basket; tail = pin ? .32 : TAIL; },
    push(p, t) {
      now = t;
      if (samples.length < 2 || t - samples[samples.length - 2].t >= tail / (N - 2)) samples.push({ p: [...p], t });
      else Object.assign(samples[samples.length - 1], { p: [...p], t });
      while (samples.length > 2 && samples[0].t < t - tail) samples.shift();
      while (samples.length > N) samples.shift();
    },
    update(camera, flying) {
      if (!flying) samples.length = 0;
      const n = samples.length; mesh.visible = n >= 2; if (!mesh.visible) return;
      for (let i = 0; i < N; i++) {
        const k = Math.min(i, n - 1), s = samples[k], a = samples[Math.max(0, k - 1)].p, b = samples[Math.min(n - 1, k + 1)].p;   // spare slots fold onto the disc
        _p.set(s.p[0], s.p[1], s.p[2]); _t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _v.subVectors(camera.position, _p);
        const head = 1 - Math.min(1, Math.max(0, now - s.t) / tail), d = _v.length(), w = d * WIDE * (pin ? .55 : 1) * (.35 + .65 * head);
        _s.crossVectors(_t, _v).normalize().multiplyScalar(w);
        pos.set([_p.x + _s.x, _p.y + _s.y, _p.z + _s.z, _p.x - _s.x, _p.y - _s.y, _p.z - _s.z], i * 6);
        // seen end-on (the chase camera rides the line, so the trail runs from the disc back toward the lens) a ribbon collapses to a
        // thin line hanging under the disc, a "vertical stick" (QA on a phone): segments fade as they turn end-on, and stay from the
        // side (the aim camera, a run-up's three-quarter view, the landing shot), where the curve of the flight reads
        const tl = _t.length(), endOn = tl > 1e-6 ? Math.abs(_t.dot(_v)) / (tl * d) : 0;
        fade[i * 2] = fade[i * 2 + 1] = i < n ? head ** 1.6 * THREE.MathUtils.smoothstep(d, 1.5, 6) * (pin ? .42 * THREE.MathUtils.smoothstep(Math.hypot(s.p[0] - pin[0], s.p[2] - pin[1]), .6, 1.6) : .82 * (1 - THREE.MathUtils.smoothstep(endOn, .72, .94))) : 0;
      }
      geo.attributes.position.needsUpdate = geo.attributes.fade.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
