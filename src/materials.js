import * as THREE from 'three';
import { texture } from './assets.js';
export const windTime = { value: 0 };
export const windVec = { value: new THREE.Vector2(0, 0) };   // world.wind / 7, shared by every swaying material

// Physically based surfaces on stylised shapes: real light response, textures where the manifest has them.
// The name survives from the toon rounds so every prop call site upgrades at once.
export function toonMaterial(options = {}) {
  return new THREE.MeshStandardMaterial({ roughness: .88, metalness: 0, ...options });
}
export const surface = toonMaterial;

// Fresnel rim added as a light (not a tint), damped on bright surfaces: separates figures from the ground
// the way broadcast lighting does. A dark jersey keeps its edge; a white sock does not bloom.
export function rimLight(material, { color = '#e6f0f7', strength = .38, power = 3 } = {}) {
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.userData.rim = { value: new THREE.Vector4(...new THREE.Color(color).toArray(), strength) };
  material.onBeforeCompile = s => {
    prev.call(material, s);
    s.uniforms.rimLight = material.userData.rim;
    s.fragmentShader = 'uniform vec4 rimLight;\n' + s.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float f = 1. - saturate(dot(normalize(normal), normalize(vViewPosition))); f = pow(f, ${power.toFixed(1)});
        float lum = dot(diffuseColor.rgb, vec3(.3, .59, .11));
        reflectedLight.directSpecular += rimLight.rgb * f * rimLight.a * (1. - .55 * lum); }`);
  };
  material.customProgramCacheKey = () => prevKey.call(material) + '|rim';
  return material;
}

export function cartoonSky() {
  return new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color('#d6f4fa') }, zenith: { value: new THREE.Color('#329ce9') } },
    vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 horizon;uniform vec3 zenith;varying vec3 vDirection;void main(){float h=clamp(normalize(vDirection).y,0.,1.);gl_FragColor=vec4(mix(horizon,zenith,smoothstep(0.,.72,h)),1.);\n#include <colorspace_fragment>\n}',
  }));
}

// Ground: worn dirt and sand blend in by splat weight, and two octaves of value noise vary the grass tone so the
// photo tile never reads as a repeating pattern from the tee. Splat weights are optional (empty manifest).
export function terrainSplat(material, geometry, weights) {
  const dirt=texture('dirt'),sand=texture('sand');
  const splat=!!(weights&&dirt&&sand);
  if(splat)geometry.setAttribute('splat',new THREE.BufferAttribute(weights,2));
  material.onBeforeCompile=s=>{
    if(splat){s.uniforms.dirtTile={value:dirt};s.uniforms.sandTile={value:sand};}
    s.vertexShader=(splat?'attribute vec2 splat;varying vec2 vSplat;':'')+'varying vec2 vGround;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+(splat?'vSplat=splat;':'')+'vGround=position.xz;');
    s.fragmentShader=(splat?'uniform sampler2D dirtTile;uniform sampler2D sandTile;varying vec2 vSplat;':'')+'varying vec2 vGround;\n'+
      'float chainsHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat chainsNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(chainsHash(i),chainsHash(i+vec2(1,0)),f.x),mix(chainsHash(i+vec2(0,1)),chainsHash(i+vec2(1,1)),f.x),f.y);}\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      { float macro = chainsNoise(vGround / 23.) * .6 + chainsNoise(vGround / 6.5 + 3.) * .4;
        diffuseColor.rgb *= .86 + macro * .28; }
      ${splat ? `vec3 dirtColor=texture2D(dirtTile,vGround*.25).rgb;
      vec3 sandColor=texture2D(sandTile,vGround*.32).rgb;
      diffuseColor.rgb=mix(diffuseColor.rgb,dirtColor,vSplat.x);
      diffuseColor.rgb=mix(diffuseColor.rgb,sandColor,vSplat.y);` : ''}`);
  };
  material.customProgramCacheKey=()=> 'chains-ground-v2-'+splat;
  return material;
}

// ---------- painted detail ----------
// Original painted256pxJPEG detail tiles modulate the bright palette without PBR.
// A missing manifest entry uses deterministic canvas grain; grey128 means no change.
const PAINT = {   // strength ≈ peak luminance swing of the fine grain; broad mottling is a third of it
  jersey:   { tile: .13, strength: .14, mode: 'local', marks: [] },
  skin:     { tile: .24, strength: .055, mode: 'local', marks: [] },
  rough:    { tile: 1.7, strength: .52, mode: 'ground', marks: [] },
  green:    { tile: 1.2, strength: .28, mode: 'ground', marks: [] },
  sand:     { tile: 3.0, strength: .42, mode: 'ground', marks: [] },
  pine:     { tile: 4.0, strength: .90, mode: 'leaf', marks: [] },
  metal:    { tile: .30, strength: .25, mode: 'vertical', marks: [] },
  grass:    { tile: 2.2, strength: .16, mode: 'ground', marks: [{ n: 420, amp: 60, w: [14, 30], h: [8, 16], alpha: .5 }, { n: 1500, amp: 128, w: [2.5, 4.5], h: [10, 22], tilt: .6 }] },
  leaf:     { tile: 5.0, strength: .90, mode: 'leaf',   marks: [{ n: 300, amp: 110, w: [12, 24], h: [9, 18], alpha: .7 }, { n: 800, amp: 90, w: [3.5, 7], h: [3.5, 7] }] },
  bark:     { tile: 1.4, strength: .48, mode: 'vertical', marks: [{ n: 220, amp: 120, w: [3, 6], h: [30, 90], alpha: .8 }] },
  concrete: { tile: 1.0, strength: .09, mode: 'ground', marks: [{ n: 1400, amp: 120, w: [3, 6], h: [3, 6] }] },
  water:    { tile: 3.0, strength: .14, mode: 'ground', scroll: true, marks: [{ n: 360, amp: 120, w: [14, 36], h: [2, 4], alpha: .7 }] },
};
const paintCache = {};
function paintTile(kind) {
  if (paintCache[kind]) return paintCache[kind];
  const painted = texture(kind + '_detail', { srgb: false }); if (painted) return (paintCache[kind] = painted);
  const size = 256, c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  let s = kind.length * 7919; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (const m of PAINT[kind].marks) for (let i = 0; i < m.n; i++) {
    const x = rnd() * size, y = rnd() * size, l = Math.round(128 + (rnd() - .5) * 2 * m.amp);
    g.fillStyle = `rgb(${l},${l},${l})`; g.globalAlpha = m.alpha ?? 1;
    const w = m.w[0] + rnd() * (m.w[1] - m.w[0]), h = m.h[0] + rnd() * (m.h[1] - m.h[0]), a = (m.tilt || 0) * (rnd() - .5);
    const ox = x < size / 2 ? size : -size, oy = y < size / 2 ? size : -size;   // wrapped copies keep the tile seamless
    for (const [dx, dy] of [[0, 0], [ox, 0], [0, oy], [ox, oy]]) { g.save(); g.translate(x + dx, y + dy); g.rotate(a); g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.__shared = true;
  return (paintCache[kind] = t);
}
export function paintDetail(material, kind) {
  const P = PAINT[kind], prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  const uv = P.mode === 'vertical' ? 'vec2(p.x * .7 + p.z * .7, p.y)' : P.mode === 'local' ? 'vec2(p.x + p.z * .35, p.y)' : 'p.xz';
  const grain = P.mode === 'leaf' ? `(texture2D(paintMap, puv).r + texture2D(paintMap, (p.xy + vec2(p.z * .4, 0.)) / ${P.tile.toFixed(3)}).r) * .5` : 'texture2D(paintMap, puv).r';
  material.onBeforeCompile = s => {
    prev.call(material, s);
    s.uniforms.paintMap = { value: paintTile(kind) }; s.uniforms.paintTime = windTime;
    s.vertexShader = 'varying vec3 vPaintPos;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${P.mode === 'local' ? 'vPaintPos = position; /* bind-pose coordinates follow skinning; no world-space swim */' : `#ifdef USE_INSTANCING
      vPaintPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
      #else
      vPaintPos = (modelMatrix * vec4(transformed, 1.)).xyz;
      #endif`}`);
    s.fragmentShader = 'uniform sampler2D paintMap;uniform float paintTime;varying vec3 vPaintPos;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 p = vPaintPos; vec2 puv = ${uv} / ${P.tile.toFixed(3)}${P.scroll ? ' + paintTime * vec2(.018, .011)' : ''};
        float grain = ${grain};
        float broad = texture2D(paintMap, ${uv} / ${(P.tile * 6.3).toFixed(3)} + .37).r;
        diffuseColor.rgb *= 1. + (grain - .5) * ${(2 * P.strength).toFixed(3)} + (broad - .5) * ${(0.7 * P.strength).toFixed(3)}; }`);
  };
  material.customProgramCacheKey = () => prevKey.call(material) + '|paint-' + kind;
  return material;
}

// Blend four painted surface tiles using the same masks as the existing vertex palette.
// This does not alter terrain height, bounds, collision, lie type, or friction.
export function paintTerrain(material, geometry, weights) {
  geometry.setAttribute('paintWeights', new THREE.BufferAttribute(weights, 3));
  material.onBeforeCompile = s => {
    s.uniforms.fairPaint = { value: paintTile('grass') };
    s.uniforms.roughPaint = { value: paintTile('rough') };
    s.uniforms.greenPaint = { value: paintTile('green') };
    s.uniforms.sandPaint = { value: paintTile('sand') };
    s.vertexShader = 'attribute vec3 paintWeights;varying vec3 vPaintWeights;varying vec2 vTileGround;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintWeights=paintWeights;vTileGround=position.xz;');
    s.fragmentShader = 'uniform sampler2D fairPaint;uniform sampler2D roughPaint;uniform sampler2D greenPaint;uniform sampler2D sandPaint;varying vec3 vPaintWeights;varying vec2 vTileGround;\n' +
      s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float fairDetail = (texture2D(fairPaint, vTileGround / 3.8).r - .5) * 2.30;
        float roughDetail = (texture2D(roughPaint, vTileGround / 2.4).r - .5) * 2.20;
        float greenDetail = (texture2D(greenPaint, vTileGround / 1.8).r - .5) * 1.40;
        float sandDetail = (texture2D(sandPaint, vTileGround / 3.5).r - .5) * 1.80;
        float detail = mix(roughDetail, fairDetail, vPaintWeights.x);
        detail = mix(detail, greenDetail, vPaintWeights.y);
        detail = mix(detail, sandDetail, vPaintWeights.z);
        diffuseColor.rgb *= 1. + detail;`);
  };
  material.customProgramCacheKey = () => 'chains-painted-ground-v1';
  return material;
}

export function windMaterial(source, clock, grass=false) {
  const m=source.clone();m.__shared=false;
  m.onBeforeCompile=s=>{
    s.uniforms.windTime=clock;s.uniforms.windVec=windVec;
    s.vertexShader='uniform float windTime;uniform vec2 windVec;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 origin=vec3(0.);
      #ifdef USE_INSTANCING
      origin=instanceMatrix[3].xyz;
      #endif
      float bend=0.;
      #ifdef USE_INSTANCING
      bend=${grass?'clamp(position.y,0.,1.)':'smoothstep(1.8,8.,position.y)'};
      #endif
      float wave=sin(windTime*1.5+origin.x*.23+origin.z*.17+position.y*.4);
      float gust=.55+.45*sin(windTime*3.1+origin.x*.31-origin.z*.27);
      transformed.x+=wave*bend*${grass?'.15':'.18'}+windVec.x*bend*${grass?'.22':'.3'}*gust;
      transformed.z+=cos(windTime*1.1+origin.z*.2)*bend*.075+windVec.y*bend*${grass?'.22':'.3'}*gust;`);
  };
  m.customProgramCacheKey=()=> 'chains-wind-'+grass;return m;
}

// ---------- jersey styles ----------
// Accent pattern from bind-pose position, so the skinned athlete and the Lite ellipsoid share one look
// without UVs. unit = metres per position unit (the Lite torso is a unit sphere: pass its radius and centre).
export const JERSEY_STYLES = ['solid', 'hoops', 'stripes', 'sash', 'sleeves', 'split', 'chevron'];
const JERSEY_MASKS = ['m = 0.;', 'm = step(.5, fract((j.y - 1.31) / .15));', 'm = step(.5, fract((j.x + .055) / .11));', 'm = 1. - smoothstep(.045, .06, abs(j.x * .8 + (j.y - 1.24) * .6));',
  'm = step(.17, abs(j.x));', 'm = step(0., j.x);', 'm = 1. - smoothstep(.05, .065, abs(abs(j.x) * .7 + (j.y - 1.36)));'];
export function jerseyStyle(material, style, accent, unit = 1, center = [0, 0, 0], gate = '1.') {
  const index = Math.max(0, JERSEY_STYLES.indexOf(style));
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.userData.jerseyAccent = { value: new THREE.Color(accent) };
  material.onBeforeCompile = s => {
    prev.call(material, s);
    s.uniforms.jerseyAccent = material.userData.jerseyAccent;
    s.vertexShader = 'varying vec3 vJerseyPos;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vJerseyPos = position * ${unit.toFixed(4)} + vec3(${center.map(v => v.toFixed(3)).join(',')});`);
    s.fragmentShader = 'uniform vec3 jerseyAccent;varying vec3 vJerseyPos;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 j = vJerseyPos; float m = 0.; ${JERSEY_MASKS[index]}
        diffuseColor.rgb = mix(diffuseColor.rgb, jerseyAccent, m * (${gate})); }`);
  };
  material.customProgramCacheKey = () => prevKey.call(material) + '|jersey-' + index;
  return material;
}
