import * as THREE from 'three';

// The aim and putt guide: one continuous ribbon, not dashes. LineMaterial's dashes were measured in metres along the flight,
// so near the lens a 70 cm dash spanned 120 px and far down the fairway a few: at phone size the putt line broke into
// "chunky white bars floating in the air" and the drive's into a string of beads (gauntlet r4, iOS). Here every point of the
// flight is one pair of vertices offset across the line in screen space, so the strip has no gaps and no overlapping segment
// caps (LineMaterial's joints doubled a translucent edge into dark nodes): a white core inside a soft dark halo (legible on sky,
// turf and leaves), tapering with depth from WIDTH[0] css px at NEAR m to WIDTH[1] at FAR, faded in where it leaves the player
// and out where it stops. Direction reads from a slow, low swell of the core along the line (`flow`, metres), faded out where its
// wavelength drops under ~40 px so the far end never shimmers. One draw, ~2 vertices per flight point.
const MAX = 200, NEAR = 3, FAR = 45, WIDTH = [4.2, 1.6], HALO = 1.5, WAVE = 3.2;
export function createAimLine(parent) {
  const pos = new Float32Array(MAX * 6), prev = new Float32Array(MAX * 6), next = new Float32Array(MAX * 6), along = new Float32Array(MAX * 2), side = new Float32Array(MAX * 2), geo = new THREE.BufferGeometry();
  for (let i = 0; i < MAX; i++) { side[i * 2] = 1; side[i * 2 + 1] = -1; }
  for (const [k, a, n] of [['position', pos, 3], ['prev', prev, 3], ['next', next, 3], ['along', along, 1]]) geo.setAttribute(k, new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('side', new THREE.BufferAttribute(side, 1));
  const idx = []; for (let i = 0; i < MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
  const u = { color: { value: new THREE.Color(1, 1, 1) }, halo: { value: new THREE.Color(0x06140c) }, resolution: { value: new THREE.Vector2(1, 1) }, px: { value: 1 },
    total: { value: 1 }, fade: { value: new THREE.Vector3(1, 1, 1) }, flow: { value: 0 }, swell: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: `uniform vec2 resolution;uniform float px;attribute vec3 prev, next;attribute float along, side;varying float vAcross, vAlong, vHalf;
      vec2 scr(vec4 c) { return c.xy / max(c.w, .2) * resolution * .5; }
      void main() { mat4 pmv = projectionMatrix * modelViewMatrix; vec4 c = pmv * vec4(position, 1.);
        vec2 s = scr(c), a = s - scr(pmv * vec4(prev, 1.)), b = scr(pmv * vec4(next, 1.)) - s;
        a = dot(a, a) > 1e-8 ? normalize(a) : vec2(0.); b = dot(b, b) > 1e-8 ? normalize(b) : a; if (dot(a, a) < .5) a = b;
        vec2 t = a + b; t = dot(t, t) > 1e-6 ? normalize(t) : a; vec2 n = vec2(-t.y, t.x);
        float miter = 1. / max(dot(n, vec2(-a.y, a.x)), .6);   // a joint's corner sits a half-width from both segments (capped: a flight never turns sharply on screen)
        vHalf = px * (.5 * mix(${WIDTH[0].toFixed(2)}, ${WIDTH[1].toFixed(2)}, smoothstep(${NEAR.toFixed(1)}, ${FAR.toFixed(1)}, c.w)) + ${HALO.toFixed(2)});   // half the strip, buffer px: the core's half-width plus the halo
        c.xy += n * side * vHalf * miter / (resolution * .5) * max(c.w, .2);
        vAcross = side; vAlong = along; gl_Position = c; }`,
    fragmentShader: `uniform vec3 color, halo;uniform float px, total, flow, swell;uniform vec3 fade;varying float vAcross, vAlong, vHalf;
      void main() { float x = abs(vAcross) * vHalf, core = vHalf - ${HALO.toFixed(2)} * px;
        float ca = clamp(core - x + .5, 0., 1.), ha = .42 * (1. - smoothstep(core - .5, vHalf, x));   // a one-pixel ramp on the core's edge; the halo falls off over its width
        float lam = ${WAVE.toFixed(1)} / max(fwidth(vAlong), 1e-5);   // the swell's wavelength here, px
        ca *= 1. - swell * smoothstep(40., 90., lam) * (.5 + .5 * sin((vAlong - flow) * ${(2 * Math.PI / WAVE).toFixed(4)}));
        float a = ca + ha * (1. - ca), along = smoothstep(0., fade.x, vAlong) * mix(1., fade.z, smoothstep(total - fade.y, total, vAlong));
        gl_FragColor = vec4((color * ca + halo * ha * (1. - ca)) / max(a, 1e-4), a * .96 * along);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = 'aim_line'; parent.add(mesh);
  mat.resolution = u.resolution.value;   // main.js's resize() sets every line material's buffer size
  return { mesh, material: mat, color: u.color.value,
    // pts: [x, y, z, ...] in order from the player. fadeIn: metres to full strength; fadeOut: metres it fades over at the end, to `end` (0 gone, 1 none).
    set(pts, { fadeIn = 1, fadeOut = 1, end = 0, swell = 0 } = {}) {
      const P = []; for (const q of pts) { const l = P.at(-1); if (!l || Math.hypot(q[0] - l[0], q[1] - l[1], q[2] - l[2]) > .01) P.push(q); }
      const step = Math.max(1, Math.ceil(P.length / MAX)), Q = P.filter((q, i) => i % step === 0 || i === P.length - 1).slice(0, MAX), n = Q.length;
      let d = 0;
      Q.forEach((q, i) => { const a = Q[Math.max(0, i - 1)], b = Q[Math.min(n - 1, i + 1)]; if (i) d += Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]);
        for (const k of [0, 1]) { const j = (i * 2 + k) * 3; pos.set(q.slice(0, 3), j); prev.set(a.slice(0, 3), j); next.set(b.slice(0, 3), j); along[i * 2 + k] = d; } });
      for (const k of ['position', 'prev', 'next', 'along']) geo.attributes[k].needsUpdate = true;
      geo.setDrawRange(0, Math.max(0, n - 1) * 6); u.total.value = d; u.fade.value.set(Math.min(fadeIn, d * .3), Math.min(fadeOut, d * .5), end); u.swell.value = swell;
      mesh.visible = n >= 2;
      return d;
    },
    advance(dt, speed = 1.6) { u.flow.value += dt * speed; },
    dispose() { parent.remove(mesh); geo.dispose(); mat.dispose(); } };
}
