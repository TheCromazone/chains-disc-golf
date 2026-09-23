// Photoreal body surface (tools/build-golfer-v3.py): one skinned mesh, one baked albedo, two region masks.
// Every locker colour is applied in the shader: region weight × palette colour × (baked luminance / region mean),
// so the photographic skin pores and cloth folds survive under any colour. Iris and beard zones are masked too,
// which is what lets eye colour and facial hair stay live options on a scanned face.
import * as THREE from 'three';
import { texture } from './assets.js';
import { rimLight, jerseyStyle } from './materials.js';

export const REGIONS = ['skin', 'jersey', 'shorts', 'hair', 'socks', 'shoes', 'iris'];
const DETAIL = [.95, .9, .35, .7, .75, .55, .85];   // how much of the baked shading each region keeps (near-black shorts are mostly sensor noise)
const BEARD = { none: [0, 0, 0], stubble: [.5, .5, .5], mustache: [1, 0, 0], goatee: [1, 1, 0], beard: [1, 1, 1] };   // mustache, chin, jaw
const opts = { clamp: true, flipY: false };
// Region means of the cleaned bakes where the rig extras predate the clean-up (tools/pack-body-textures.py --clean): the
// scan's own hair only became a region there, and the near-black shorts and shoes lost their bake noise.
const MEAN_FIX = { body_: { 2: .0045, 3: .011, 5: .0105 }, body_f_: { 2: .0053, 3: .0062, 5: .011 } };
// Club mark and number, screen-printed: drawn once in the HUD's condensed face (alpha only, the accent colour is applied in
// the shader) and projected along z in bind-pose space, so the print stretches and folds with the cloth. Planes riding the
// spine bone sank into the skin or hung off it by centimetres as the torso twisted. Boxes: centre height, width, height in
// metres and the share of the canvas used from the top. His chest takes the crest and number; on hers the bust would
// swallow a number, so the CHAINS line alone rides the upper chest. The back carries a player-number-sized print.
const PRINT = { body_: { front: [.03, .16, .16, 1], back: [0, .24, .24, 1] }, body_f_: { front: [.115, .15, .036, .24], back: [0, .2, .2, 1] } };
function printTexture(number) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ink = c.getContext('2d'), face = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif', t = new THREE.CanvasTexture(c);
  const draw = () => {
    ink.clearRect(0, 0, 256, 256); ink.fillStyle = '#fff'; ink.textAlign = 'center';
    ink.font = `800 36px ${face}`; ink.letterSpacing = '5px'; ink.fillText('CHAINS', 130, 52);
    ink.font = `800 176px ${face}`; ink.letterSpacing = '0px'; ink.fillText(String(number), 128, 222); t.needsUpdate = true;
  };
  draw(); document.fonts?.load('800 100px "Barlow Condensed"').then(draw, () => {});   // the face loads lazily: redraw once it lands
  return t;
}

// Dyed polyester reflects at most ~75 % in its strongest channel and never a pure primary: the locker palette's screen
// colours (#ff4d3d is 100 % red) rendered as a neon, flat shell. Cap the linear albedo and take a little of the chroma.
function cloth(c) { const m = Math.max(c.r, c.g, c.b), l = c.r * .2126 + c.g * .7152 + c.b * .0722; if (m > .74) c.multiplyScalar(.74 / m); const k = .12, g = l * Math.min(1, .74 / m); c.r += (g - c.r) * k; c.g += (g - c.g) * k; c.b += (g - c.b) * k; return c; }

export function bodyMaterial(spec, avatar, lod, prefix = 'body_') {
  const suffix = lod ? '_lod' : '';   // the LOD body has its own bake: its UV layout differs
  const tex = (name, o = opts) => texture(prefix + name, o) || texture('body_' + name, o);   // a figure without its own bake borrows the male set rather than losing its shader
  // normal map: the male bake carries clean folds; the female bake caught stray scan surfaces (her mesh keeps holes and
  // folded faces) and glints as crumpled foil at any strength, so she shades from her geometry alone, like the LOD
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .74, metalness: 0, map: tex('albedo' + suffix), normalMap: lod || prefix === 'body_f_' ? null : tex('normal', { ...opts, srgb: false }) });
  if (material.normalMap) material.normalScale.set(1, 1);   // full-strength baked folds and pores
  const u = {
    uMask1: { value: tex('mask1' + suffix, { ...opts, srgb: false }) }, uMask2: { value: tex('mask2' + suffix, { ...opts, srgb: false }) },
    uPal: { value: REGIONS.map(() => new THREE.Color()) }, uMean: { value: new Float32Array(REGIONS.map((r, i) => Math.max(.004, MEAN_FIX[prefix]?.[i] ?? (Array.isArray(spec.regionLum) ? spec.regionLum[i] : spec.regionLum?.[r]) ?? .5))) },
    uDetail: { value: new Float32Array(DETAIL) }, uBeard: { value: new THREE.Vector3() }, uHair: { value: new THREE.Color() },
    uSkinMean: { value: new THREE.Color().setRGB(...(spec.skinMean || [.35, .22, .16]), THREE.LinearSRGBColorSpace) },   // the scan's own skin colour (linear)
    uKnit: { value: texture('jersey_pattern', { srgb: false }) },   // athletic mesh knit (mean .49): the cloth reads as fabric up close and mips to nothing far away
    uPrint: { value: printTexture(avatar.number) },
    uArm: { value: new THREE.Vector4(-1, -1, -1, -1) },   // skeleton indices of the four arm bones (gltf-player.js): the 'pro' shirt's panels need arm vs torso
    uPanelN: { value: prefix === 'body_f_' ? 0 : 1 },
  };
  const chestY = spec.chestY || 1.3, box = (PRINT[prefix] || PRINT.body_);
  u.uPrintF = { value: new THREE.Vector4(chestY + box.front[0], ...box.front.slice(1)) }; u.uPrintB = { value: new THREE.Vector4(chestY + box.back[0], ...box.back.slice(1)) };
  const knitAmp = u.uKnit.value ? 1.2 : 0;
  material.onBeforeCompile = s => {
    Object.assign(s.uniforms, u);
    // bind-pose normal and arm weight: which cloth faces sideways off the torso and which is the arm's underside
    s.vertexShader = 'uniform vec4 uArm; varying vec3 vBindN; varying float vArmW;\n' + s.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      vBindN = objectNormal; vArmW = 0.;
      #ifdef USE_SKINNING
        vArmW = dot(skinWeight, vec4(equal(skinIndex, uArm.xxxx)) + vec4(equal(skinIndex, uArm.yyyy)) + vec4(equal(skinIndex, uArm.zzzz)) + vec4(equal(skinIndex, uArm.wwww)));
      #endif`);
    // per-region roughness: skin keeps a soft sheen, hair and cloth stay matte (a glossy jersey or scalp reads as plastic).
    // Skin also scatters: direct light wraps a little past the terminator with a warm tint, the cheap stand-in for
    // subsurface that keeps a face from looking like painted vinyl.
    s.fragmentShader = 'uniform sampler2D uMask1, uMask2, uKnit, uPrint; uniform vec3 uPal[7]; uniform float uMean[7]; uniform float uDetail[7]; uniform vec3 uBeard, uHair, uSkinMean; uniform vec4 uPrintF, uPrintB; uniform float uPanelN; varying vec3 vBindN; varying float vArmW;\nfloat chainsSkin = 0.;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 j = vJerseyPos; bool back = j.z > 0.; vec4 b = back ? uPrintB : uPrintF;   // after the jersey style, so the print sits on its panels; seen from its own side, the print reads left to right
        vec2 q = vec2((back ? j.x : -j.x) / b.y + .5, (j.y - b.x) / b.z + .5);
        if (q.x > 0. && q.x < 1. && q.y > 0. && q.y < 1.) diffuseColor.rgb = mix(diffuseColor.rgb, jerseyAccent, texture2D(uPrint, vec2(q.x, 1. - b.w + b.w * q.y)).a * chainsJersey); }
      diffuseColor.rgb *= 1. + chainsKnit;   // the knit runs under the print too`).replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
      void RE_Direct_Chains(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
        RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
        float nl = dot(geometryNormal, directLight.direction), wrap = saturate((nl + .5) / 1.5) - saturate(nl);
        reflectedLight.directDiffuse += chainsSkin * wrap * directLight.color * BRDF_Lambert(material.diffuseColor) * vec3(1., .5, .36);
      }
      #undef RE_Direct
      #define RE_Direct RE_Direct_Chains`).replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n material.specularColor *= 1. - .3 * chainsSkin;   // skin reflects ~3 %, not the 4 % of a plastic').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= chainsRough;')
      // the scan's shirt normals are pocked with pinhole dimples (dark specks round the collar), so the jersey takes 85 % of them:
      // at a quarter, and at half, critics read the fitted shirt as a smooth painted shell with no cloth in it
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * (1. - .15 * chainsJersey);')).replace('#include <map_fragment>', `float chainsJersey = 0., chainsRough = 1., chainsKnit = 0.;
      #include <map_fragment>
      { vec4 m1 = texture2D(uMask1, vMapUv), m2 = texture2D(uMask2, vMapUv);
        vec3 base = diffuseColor.rgb; float lum = dot(base, vec3(.2126, .7152, .0722));
        float w[7]; w[0] = m1.r; w[1] = m1.g; w[2] = m1.b; w[3] = m1.a; w[4] = m2.r; w[5] = m2.g; w[6] = m2.b;
        vec3 col = base;
        // skin keeps the scan's own variation (cheeks, knuckles, veins): shift it by the ratio of the chosen tone to the scan's mean skin, with a light pull toward the tone itself
        // then a quarter of its chroma goes: under the warm course sun the palette tones rendered as orange, fake-tanned skin
        { vec3 ratio = clamp(uPal[0] / max(uSkinMean, vec3(.01)), vec3(.25), vec3(3.)); vec3 shifted = mix(base * ratio, uPal[0] * clamp(lum / uMean[0], .35, 1.7), .3);
          shifted = mix(vec3(dot(shifted, vec3(.2126, .7152, .0722))), shifted, .75); col = mix(col, shifted, w[0]); }
        for (int i = 1; i < 7; i++) { float d = mix(1., clamp(lum / uMean[i], .25, 1.8), uDetail[i]); col = mix(col, uPal[i] * d, w[i]); }
        float bz = m2.a; float zi = floor(bz * 4. + .002); float soft = clamp(fract(bz * 4. + .002) / .96, 0., 1.);   // zone id + feather share one channel
        float zone = (zi > 2.5 ? uBeard.z : zi > 1.5 ? uBeard.y : zi > .5 ? uBeard.x : 0.) * soft;
        float grain = fract(sin(dot(floor(vMapUv * 1100.), vec2(12.9898, 78.233))) * 43758.5453);
        col = mix(col, uHair * (.5 + .5 * clamp(lum / uMean[0], .3, 1.4)), zone * (.6 + .4 * grain));
        chainsKnit = (texture2D(uKnit, vec2(vJerseyPos.x * .7 + vJerseyPos.z * .7, vJerseyPos.y) * 16.).r - .49) * ${knitAmp.toFixed(2)} * (w[1] + .5 * w[2] + .6 * w[4]);   // bind-pose projection: ~3 mm cells, the same scale on every island
        chainsJersey = w[1]; chainsSkin = w[0]; chainsRough = 1. - .12 * w[0] + .14 * w[3] + .2 * (w[1] + w[2] + w[4]); diffuseColor.rgb = col;
        chainsPanel = uPanelN > .5 ? max(smoothstep(.5, .78, abs(vBindN.x)) * (1. - smoothstep(.3, .6, vArmW)), smoothstep(.4, .8, vArmW) * smoothstep(.3, .45, -vBindN.x * sign(vJerseyPos.x))) : -1.; }`);   // the side panels follow the torso's turn (a hard cut flattened the back into one tone, a wide blend read as a shadow); her folded scan's normals scatter them into shards, so she takes the width-based panels
  };
  material.customProgramCacheKey = () => 'chains-body';
  jerseyStyle(material, avatar.jerseyStyle, avatar.accent, 1, [0, 0, 0], 'chainsJersey');
  rimLight(material, { strength: .1 });   // a whisper of edge light: stronger, it outlined the jaw and the dark shorts in white
  const setPalette = a => {
    const p = u.uPal.value; p[0].set(a.skin); p[1].set(a.jersey); p[2].set(a.shorts); p[3].set(a.hair === 'none' ? a.skin : a.hairColor);
    p[4].set(a.socks || a.accent); p[5].set(a.shoes); p[6].set(a.eyeColor || '#2b2b2b');
    for (const i of [1, 2, 4]) cloth(p[i]);
    u.uHair.value.set(a.hairColor); u.uBeard.value.fromArray(BEARD[a.facialHair] || BEARD.none);
    material.userData.jerseyAccent?.value.set(a.accent);
  };
  setPalette(avatar);
  return { material, setPalette, arms: ix => u.uArm.value.set(...ix), dispose: () => u.uPrint.value.dispose() };
}
