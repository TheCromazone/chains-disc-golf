import * as THREE from 'three';

// The aim and putt guide: one continuous ribbon, not dashes. LineMaterial's dashes were measured in metres along the flight,
// so near the lens a 70 cm dash spanned 120 px and far down the fairway a few: at phone size the putt line broke into
// "chunky white bars floating in the air" and the drive's into a string of beads (gauntlet r4, iOS). Here every point of the
// flight is one pair of vertices offset across the line in screen space, so the strip has no gaps and no overlapping segment
// caps (LineMaterial's joints doubled a translucent edge into dark nodes): a white core inside a soft dark halo (legible on sky,
// turf and leaves), tapering with depth from WIDTH[0] css px at NEAR m to WIDTH[1] at FAR, faded in where it leaves the player
// and out where it stops. Direction reads from a slow, low swell of the core along the line (`flow`, metres), faded out where its
// wavelength drops under ~40 px so the far end never shimmers. One draw, ~2 vertices per flight point.
const MAX = 200, NEAR = 3, FAR = 45, WIDTH = [4.2, 1.6], WAVE = 3.2;
export const HALO = 1.5, HALO_COLOR = 0x06140c;   // the soft dark edge every guide wears (css px, colour): shot-guide.js's landing ring too
// One pixel's core ramp and the halo's fall-off, x px from the centre of a stroke whose core is `core` px across its half
// (buffer px; px = the pixel ratio). Shared by the line, the chevrons and the landing ring.
export const STROKE = `vec2 stroke(float x, float core, float px) { return vec2(clamp(core - x + .5, 0., 1.), .42 * (1. - smoothstep(core - .5, core + ${HALO.toFixed(2)} * px, x))); }`;
export function createAimLine(parent) {
  const pos = new Float32Array(MAX * 6), prev = new Float32Array(MAX * 6), next = new Float32Array(MAX * 6), along = new Float32Array(MAX * 2), side = new Float32Array(MAX * 2), geo = new THREE.BufferGeometry();
  for (let i = 0; i < MAX; i++) { side[i * 2] = 1; side[i * 2 + 1] = -1; }
  for (const [k, a, n] of [['position', pos, 3], ['prev', prev, 3], ['next', next, 3], ['along', along, 1]]) geo.setAttribute(k, new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('side', new THREE.BufferAttribute(side, 1));
  const idx = []; for (let i = 0; i < MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
  const u = { color: { value: new THREE.Color(1, 1, 1) }, halo: { value: new THREE.Color(HALO_COLOR) }, resolution: { value: new THREE.Vector2(1, 1) }, px: { value: 1 },
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

// The short putt's ground guide. Inside 4 m main.js hides the putt line (its stub stood up from behind his shoulder like a white
// pole), so two chevrons on the turf point the aim, in the line's own hand: a white core CORE css px wide inside the same soft
// dark halo, constant on screen, depth tested so his shoes and the tufts stand in front of them. They replace a flat white arrow
// decal (0.7 x 1.15 m at .82 opacity, every throw) that read as a stray sticker pasted on the grass beside the new line (r4 iOS).
// One quad on the ground's tangent plane: the fragment measures its distance to each chevron's two arms in metres and turns it
// into pixels along the arm's normal (the plane's own screen derivatives), so the strokes keep their width at any slant.
const ARM = [.24, .24], STEP = .32, CORE = 3.4;   // a chevron's half width and depth (m), the gap between the two (m), the core (css px)
export function createAimChevrons(parent) {
  const L = STEP + ARM[1] + .24, geo = new THREE.PlaneGeometry(2 * ARM[0] + .24, L).rotateX(-Math.PI / 2);   // local -z points down the aim
  const u = { color: { value: new THREE.Color(1, 1, 1) }, halo: { value: new THREE.Color(HALO_COLOR) }, resolution: { value: new THREE.Vector2(1, 1) }, px: { value: 1 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: 'varying vec2 vP;void main(){vP=vec2(position.x,-position.z);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 color, halo;uniform float px;varying vec2 vP;
      ${STROKE}
      void main() { vec2 dx = dFdx(vP), dy = dFdy(vP), best = vec2(0.);
        for (int i = 0; i < 2; i++) { vec2 a = vec2(0., ${(STEP / 2 + ARM[1] / 2).toFixed(3)} - float(1 - i) * ${STEP.toFixed(3)});   // apexes: the near one, then the far
          for (int s = -1; s <= 1; s += 2) { vec2 b = vec2(float(s) * ${ARM[0].toFixed(3)}, -${ARM[1].toFixed(3)}), q = vP - a, n = normalize(vec2(-b.y, b.x));
            vec2 e = q - b * clamp(dot(q, b) / dot(b, b), 0., 1.);   // to the arm, metres
            float x = length(e) / max(length(vec2(dot(dx, n), dot(dy, n))), 1e-6);   // ... in buffer pixels across the arm
            vec2 k = stroke(x, ${(CORE / 2).toFixed(2)} * px, px) * (i == 0 ? .72 : 1.);   // the near chevron a step quieter: the eye runs to the far one
            best = max(best, k); } }
        float a = best.x + best.y * (1. - best.x);
        if (a < .004) discard;
        gl_FragColor = vec4((color * best.x + halo * best.y * (1. - best.x)) / max(a, 1e-4), a * .96);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 4; mesh.frustumCulled = false; mesh.name = 'aim_chevrons'; mesh.visible = false; parent.add(mesh);
  mat.resolution = u.resolution.value;   // main.js's resize() sets every line material's buffer size
  return { mesh, material: mat, color: u.color.value,
    // far: metres from the lie to the far chevron's apex; centred there so the near one sits STEP behind it
    span: [STEP, ARM[1]], centre: far => far - STEP / 2 - ARM[1] / 2,
    dispose() { parent.remove(mesh); geo.dispose(); mat.dispose(); } };
}
