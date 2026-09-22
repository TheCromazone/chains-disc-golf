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
  };
  material.onBeforeCompile = s => {
    Object.assign(s.uniforms, u);
    // per-region roughness: skin keeps a soft sheen, hair and cloth stay matte (a glossy jersey or scalp reads as plastic).
    // Skin also scatters: direct light wraps a little past the terminator with a warm tint, the cheap stand-in for
    // subsurface that keeps a face from looking like painted vinyl.
    s.fragmentShader = 'uniform sampler2D uMask1, uMask2; uniform vec3 uPal[7]; uniform float uMean[7]; uniform float uDetail[7]; uniform vec3 uBeard, uHair, uSkinMean;\nfloat chainsSkin = 0.;\n' + s.fragmentShader.replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
      void RE_Direct_Chains(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
        RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
        float nl = dot(geometryNormal, directLight.direction), wrap = saturate((nl + .5) / 1.5) - saturate(nl);
        reflectedLight.directDiffuse += chainsSkin * wrap * directLight.color * BRDF_Lambert(material.diffuseColor) * vec3(1., .38, .24);
      }
      #undef RE_Direct
      #define RE_Direct RE_Direct_Chains`).replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n material.specularColor *= 1. - .3 * chainsSkin;   // skin reflects ~3 %, not the 4 % of a plastic').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= chainsRough;').replace('#include <map_fragment>', `float chainsJersey = 0., chainsRough = 1.;
      #include <map_fragment>
      { vec4 m1 = texture2D(uMask1, vMapUv), m2 = texture2D(uMask2, vMapUv);
        vec3 base = diffuseColor.rgb; float lum = dot(base, vec3(.2126, .7152, .0722));
        float w[7]; w[0] = m1.r; w[1] = m1.g; w[2] = m1.b; w[3] = m1.a; w[4] = m2.r; w[5] = m2.g; w[6] = m2.b;
        vec3 col = base;
        // skin keeps the scan's own variation (cheeks, knuckles, veins): shift it by the ratio of the chosen tone to the scan's mean skin, with a light pull toward the tone itself
        { vec3 ratio = clamp(uPal[0] / max(uSkinMean, vec3(.01)), vec3(.25), vec3(3.)); vec3 shifted = mix(base * ratio, uPal[0] * clamp(lum / uMean[0], .35, 1.7), .3); col = mix(col, shifted, w[0]); }
        for (int i = 1; i < 7; i++) { float d = mix(1., clamp(lum / uMean[i], .25, 1.8), uDetail[i]); col = mix(col, uPal[i] * d, w[i]); }
        float bz = m2.a; float zi = floor(bz * 4. + .002); float soft = clamp(fract(bz * 4. + .002) / .96, 0., 1.);   // zone id + feather share one channel
        float zone = (zi > 2.5 ? uBeard.z : zi > 1.5 ? uBeard.y : zi > .5 ? uBeard.x : 0.) * soft;
        float grain = fract(sin(dot(floor(vMapUv * 1100.), vec2(12.9898, 78.233))) * 43758.5453);
        col = mix(col, uHair * (.5 + .5 * clamp(lum / uMean[0], .3, 1.4)), zone * (.6 + .4 * grain));
        chainsJersey = w[1]; chainsSkin = w[0]; chainsRough = 1. - .12 * w[0] + .14 * w[3] + .2 * (w[1] + w[2] + w[4]); diffuseColor.rgb = col; }`);
  };
  material.customProgramCacheKey = () => 'chains-body';
  jerseyStyle(material, avatar.jerseyStyle, avatar.accent, 1, [0, 0, 0], 'chainsJersey');
  rimLight(material, { strength: .1 });   // a whisper of edge light: stronger, it outlined the jaw and the dark shorts in white
  const setPalette = a => {
    const p = u.uPal.value; p[0].set(a.skin); p[1].set(a.jersey); p[2].set(a.shorts); p[3].set(a.hair === 'none' ? a.skin : a.hairColor);
    p[4].set(a.socks || a.accent); p[5].set(a.shoes); p[6].set(a.eyeColor || '#2b2b2b');
    u.uHair.value.set(a.hairColor); u.uBeard.value.fromArray(BEARD[a.facialHair] || BEARD.none);
    material.userData.jerseyAccent?.value.set(a.accent);
  };
  setPalette(avatar);
  return { material, setPalette };
}
