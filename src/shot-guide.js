import * as THREE from 'three';
import { HALO, HALO_COLOR, STROKE } from './aim-line.js';

// The landing reticle: a ring round the planned landing, drawn like the aim line (aim-line.js) so the two read as one guide: a
// mint core CORE css px wide in the same soft dark halo, constant on screen at any range. It was a 1 px GL LineLoop (and a cross)
// on the turf, which a phone's 2x buffer halved to a hairline: at 30-60 m it vanished into the grass under the landing tag's dot
// (r4 iOS). The ring is the landing's RADIUS m circle on the ground's tangent plane, projected about its centre in the vertex
// shader (one ellipse, the centre's depth): never under MIN css px across its long axis, so a far landing still frames the tag's
// dot, and its short axis opened to at least OPEN of the long one, so the grazing view down a fairway (a 2-6 deg slant) shows a
// ring instead of a dash. Drawn over the turf and tufts like the drive's line (no depth test). One draw, 2 x SEG vertices.
const SEG = 64, CORE = 2.4, MIN = 15, OPEN = .36;
export function createShotGuide(parent) {
  const group = new THREE.Group(); group.name = 'estimated_landing'; parent.add(group);
  const geo = new THREE.BufferGeometry(), ang = new Float32Array(SEG * 2 + 2), side = new Float32Array(SEG * 2 + 2), idx = [];
  for (let i = 0; i <= SEG; i++) { ang[i * 2] = ang[i * 2 + 1] = i / SEG * Math.PI * 2; side[i * 2] = 1; side[i * 2 + 1] = -1; if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG * 2 + 2) * 3), 3)); geo.setAttribute('ang', new THREE.BufferAttribute(ang, 1)); geo.setAttribute('side', new THREE.BufferAttribute(side, 1)); geo.setIndex(idx);
  const u = { color: { value: new THREE.Color('#5cf0a8') }, halo: { value: new THREE.Color(HALO_COLOR) }, resolution: { value: new THREE.Vector2(1, 1) }, px: { value: 1 },
    centre: { value: new THREE.Vector3() }, ground: { value: new THREE.Vector3(0, 1, 0) }, radius: { value: 1.25 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: `uniform vec2 resolution;uniform float px, radius;uniform vec3 centre, ground;attribute float ang, side;varying float vAcross, vHalf;
      vec2 scr(vec4 c) { return c.xy / max(c.w, .2) * resolution * .5; }
      void main() { mat4 pv = projectionMatrix * viewMatrix; vec4 c = pv * vec4(centre, 1.); vec2 s0 = scr(c);
        vec3 toEye = cameraPosition - centre, across = cross(ground, toEye); across = dot(across, across) > 1e-8 ? normalize(across) : vec3(1., 0., 0.);
        vec2 su = scr(pv * vec4(centre + across * radius, 1.)) - s0, sv = scr(pv * vec4(centre + cross(across, ground) * radius, 1.)) - s0;
        float lu = max(length(su), 1e-3), k = max(1., ${MIN.toFixed(1)} * .5 * px / lu);   // the long axis at least MIN css px across
        su *= k; sv *= k; lu *= k; vec2 eu = su / lu, en = vec2(-eu.y, eu.x);
        float b = dot(sv, en); sv = eu * dot(sv, eu) + en * (b < 0. ? -1. : 1.) * max(abs(b), lu * ${OPEN.toFixed(2)});   // opened to OPEN of it
        vec2 p = s0 + cos(ang) * su + sin(ang) * sv, t = -sin(ang) * su + cos(ang) * sv, n = normalize(vec2(-t.y, t.x));
        vHalf = px * (${(CORE / 2).toFixed(2)} + ${HALO.toFixed(2)}); vAcross = side;
        c.xy = (p + n * side * vHalf) / (resolution * .5) * max(c.w, .2); gl_Position = c; }`,
    fragmentShader: `uniform vec3 color, halo;uniform float px;varying float vAcross, vHalf;
      ${STROKE}
      void main() { vec2 k = stroke(abs(vAcross) * vHalf, ${(CORE / 2).toFixed(2)} * px, px); float a = k.x + k.y * (1. - k.x);
        gl_FragColor = vec4((color * k.x + halo * k.y * (1. - k.x)) / max(a, 1e-4), a * .92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const ring = new THREE.Mesh(geo, mat); ring.frustumCulled = false; ring.renderOrder = 5; ring.name = 'landing_ring'; group.add(ring);
  mat.resolution = u.resolution.value;   // main.js's resize() sets every line material's buffer size
  return { group, material: mat, set(result, world, putt) {
    const [x, , z] = result.rest, wet = world.inWater(x, z);
    const surface = result.holed ? 'Chains' : result.ob ? wet ? 'Water · penalty' : 'Out of bounds' : world.rough(x, z) > .5 ? 'Rough' : 'Fairway';
    u.color.value.set(result.ob ? '#ff9275' : '#5cf0a8'); u.radius.value = putt ? .42 : 1.25;
    const n = result.ob && wet || !world.normal ? [0, 1, 0] : world.normal(x, z);
    u.centre.value.set(x, result.ob && wet ? world.waterLevel(x, z) : world.height(x, z), z); u.ground.value.set(n[0], n[1], n[2]).normalize();
    return { range: result.thrown, left: result.dist, surface, danger: result.ob };
  }, dispose() { geo.dispose(); mat.dispose(); parent.remove(group); } };
}
