import * as THREE from 'three';
import { texture } from './assets.js';
export const windTime = { value: 0 };

// A tiny nearest-filtered light ramp gives every solid the same clear, three-tone language.
// Shared across courses/characters; no image requests, environment maps, or PBR response.
const ramp = new THREE.DataTexture(new Uint8Array([115, 192, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.generateMipmaps = false; ramp.needsUpdate = true; ramp.__shared = true;
export function toonMaterial(options = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: ramp, ...options });
}

export function cartoonSky() {
  return new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color('#d6f4fa') }, zenith: { value: new THREE.Color('#329ce9') } },
    vertexShader: 'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 horizon;uniform vec3 zenith;varying vec3 vDirection;void main(){float h=clamp(normalize(vDirection).y,0.,1.);gl_FragColor=vec4(mix(horizon,zenith,smoothstep(0.,.72,h)),1.);\n#include <colorspace_fragment>\n}',
  }));
}

export function terrainSplat(material, geometry, weights) {
  const dirt=texture('dirt'),sand=texture('sand'); if(!dirt||!sand)return;
  geometry.setAttribute('splat',new THREE.BufferAttribute(weights,2));
  material.onBeforeCompile=s=>{
    s.uniforms.dirtTile={value:dirt};s.uniforms.sandTile={value:sand};
    s.vertexShader='attribute vec2 splat;varying vec2 vSplat;varying vec2 vGround;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSplat=splat;vGround=position.xz;');
    s.fragmentShader='uniform sampler2D dirtTile;uniform sampler2D sandTile;varying vec2 vSplat;varying vec2 vGround;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 dirtColor=texture2D(dirtTile,vGround*.25).rgb;
      vec3 sandColor=texture2D(sandTile,vGround*.32).rgb;
      diffuseColor.rgb=mix(diffuseColor.rgb,dirtColor,vSplat.x);
      diffuseColor.rgb=mix(diffuseColor.rgb,sandColor,vSplat.y);`);
  };
  material.customProgramCacheKey=()=> 'chains-splat-v1';
}

// ---------- painted detail ----------
// Wii-style surfaces are flat colour plus a faint hand-painted grain. These tiles are drawn on a
// canvas at boot (grey 128 = no change) so nothing is requested; a mid-grey tile listed in the
// manifest as textures.<kind>_detail replaces the canvas one.
// ponytail: canvas grain now, painted tiles from the asset pass later.
const PAINT = {   // strength ≈ peak luminance swing of the fine grain; broad mottling is a third of it
  grass:    { tile: 2.2, strength: .16, mode: 'ground', marks: [{ n: 420, amp: 60, w: [14, 30], h: [8, 16], alpha: .5 }, { n: 1500, amp: 128, w: [2.5, 4.5], h: [10, 22], tilt: .6 }] },
  leaf:     { tile: 2.0, strength: .18, mode: 'leaf',   marks: [{ n: 300, amp: 110, w: [12, 24], h: [9, 18], alpha: .7 }, { n: 800, amp: 90, w: [3.5, 7], h: [3.5, 7] }] },
  bark:     { tile: 1.4, strength: .22, mode: 'vertical', marks: [{ n: 220, amp: 120, w: [3, 6], h: [30, 90], alpha: .8 }] },
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
  const uv = P.mode === 'vertical' ? 'vec2(p.x * .7 + p.z * .7, p.y)' : 'p.xz';
  const grain = P.mode === 'leaf' ? `(texture2D(paintMap, puv).r + texture2D(paintMap, (p.xy + vec2(p.z * .4, 0.)) / ${P.tile.toFixed(3)}).r) * .5` : 'texture2D(paintMap, puv).r';
  material.onBeforeCompile = s => {
    prev.call(material, s);
    s.uniforms.paintMap = { value: paintTile(kind) }; s.uniforms.paintTime = windTime;
    s.vertexShader = 'varying vec3 vPaintPos;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vPaintPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
      #else
      vPaintPos = (modelMatrix * vec4(transformed, 1.)).xyz;
      #endif`);
    s.fragmentShader = 'uniform sampler2D paintMap;uniform float paintTime;varying vec3 vPaintPos;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 p = vPaintPos; vec2 puv = ${uv} / ${P.tile.toFixed(3)}${P.scroll ? ' + paintTime * vec2(.018, .011)' : ''};
        float grain = ${grain};
        float broad = texture2D(paintMap, ${uv} / ${(P.tile * 6.3).toFixed(3)} + .37).r;
        diffuseColor.rgb *= 1. + (grain - .5) * ${(2 * P.strength).toFixed(3)} + (broad - .5) * ${(0.7 * P.strength).toFixed(3)}; }`);
  };
  material.customProgramCacheKey = () => prevKey.call(material) + '|paint-' + kind;
  return material;
}

export function windMaterial(source, clock, grass=false) {
  const m=source.clone();m.__shared=false;
  m.onBeforeCompile=s=>{
    s.uniforms.windTime=clock;
    s.vertexShader='uniform float windTime;\n'+s.vertexShader;
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
      transformed.x+=wave*bend*${grass?'.15':'.18'};
      transformed.z+=cos(windTime*1.1+origin.z*.2)*bend*.075;`);
  };
  m.customProgramCacheKey=()=> 'chains-wind-'+grass;return m;
}
