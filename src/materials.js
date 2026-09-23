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

// ---------- ground ----------
// Photo turf carries blade detail and local hue swings; the vertex palette sets each zone's mean albedo, because every
// tile is divided by its linear mean (numpy over the shipped JPEGs), so the palette is what the turf averages to.
// Anti-tiling: two rotated scales of each tile blended by value noise with the variance kept, times a big mottle
// tile, times macro drift; fairways add mown stripes along the tee-basket line. Worn gravel, sand and leaf litter
// cover the turf by splat weight (gravel/earth, sand, litter, dry) through one shared noisy edge with a damp rim.
// GROUND_GLSL is shared with the blade carpet (grass.js): its vertex shader tints and thins each blade with the same
// functions at the blade's root, so the carpet is the ground it grows from.
const TILE_MEAN = { lawn: [.1715, .2665, .0543], rough: [.129, .1734, .0524], mottle: [.1503, .2229, .0626] };
const vec3s = a => `vec3(${a.map(x => x.toFixed(4)).join(',')})`;
export const GROUND_GLSL = `
float gHash(vec2 p){vec3 q=fract(p.xyx*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}   // no sin(): cheap and stable on phones
float gNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gHash(i),gHash(i+vec2(1,0)),f.x),mix(gHash(i+vec2(0,1)),gHash(i+vec2(1,1)),f.x),f.y);}
#ifdef GROUND_LITE   // Lite: one octave each for the edge fingers and the drift, no warm patches, clover or patchy litter, so the phone shader stays under the old one
float gBreak(vec2 p){return gNoise(p*1.3+5.)-.5;}
#define gMacro(p) gNoise(p/19.+5.)
#define gWarm(p,rough) 1.
#define gPatch(p) .5
#else
float gBreak(vec2 p){return gNoise(p*1.3+5.)*.6+gNoise(p*4.1+17.)*.4-.5;}   // fingers along every splat edge
#define gMacro(p) (gNoise(p/37.)*.6+gNoise(p/11.+5.)*.4)
#define gWarm(p,rough) mix(vec3(1.),vec3(1.1,1.02,.78),smoothstep(.5,.8,gNoise(p/23.+40.)))*mix(vec3(1.),vec3(.76,.9,.78),smoothstep(.6,.76,gNoise(p/1.9+13.))*rough*.8)   /* sun-warmed patches; clover and weed clumps in the rough */
#define gPatch(p) (gNoise(p/1.3+23.)*.65+gNoise(p/.45+7.)*.35)   /* damp and sun-bleached patches in the litter */
#endif
float gDry(float w,float b){return smoothstep(.3,.85,w+b*.5);}
vec3 gCover(vec4 s,vec2 trail,float b){   // gravel, sand, litter over the turf; the trail is gravel too, 1 m wide
  float t=trail.y*(1.-smoothstep(.35,.75,abs(trail.x)+b*.5));
  return vec3(max(smoothstep(.3,.7,s.x+b*.6),t*.95),s.y,smoothstep(.25,.7,s.z+b*.5));
}
vec3 gTurf(vec2 p,vec3 zone,vec2 turf,float dry){   // zone albedo -> turf: 10-40 m drift, sun-warmed patches, stripes, straw
  vec3 c=zone*(.78+gMacro(p)*.44)*gWarm(p,1.-turf.x);
  c*=1.+(smoothstep(-.08,.08,abs(fract(turf.y/7.)-.5)-.25)-.5)*.16*turf.x;   // 3.5 m mown stripes, fairway only
  c=mix(c,dot(c,vec3(.3,.59,.11))*vec3(1.42,1.18,.62),dry*.65);
  return mix(vec3(dot(c,vec3(.3,.59,.11))),c,.8)*vec3(1.05,1.,.9);   // summer olive, not lime: a fifth less saturation, a touch warmer
}`;
// Full also shades a contact band where each tee pad meets the ground (pads: [x, z, cos yaw, sin yaw], 1.6 x 3.2 m).
// No derivative bump: dFdx is constant per 2x2 pixel quad, so pebble-scale bumps render as blocky speckle.
// Fallback when the manifest has no ground tiles: the vertex palette alone (the default color_fragment).
export function terrainSplat(material, geometry, { splat, turf, pads, lite = false }) {
  geometry.setAttribute('splat', new THREE.BufferAttribute(splat, 4)); geometry.setAttribute('turf', new THREE.BufferAttribute(turf, 4));
  const tiles = { gLawn: texture('grass'), gRough: texture('turf_rough'), gMottle: texture('turf_mottle'), gGravel: texture('gravel'), gSand: texture('sand'), gDuff: texture('litter') };
  if (!Object.values(tiles).every(Boolean)) return material;
  if (!lite) for (const t of Object.values(tiles)) t.anisotropy = 8;   // the tee camera sees the ground at a grazing angle; phones keep 4 (bandwidth)
  const tile = (name, s) => `gTile(${name},p,${s},${vec3s(TILE_MEAN[name.slice(1).toLowerCase()])})`;
  material.onBeforeCompile = s => {
    for (const k in tiles) s.uniforms[k] = { value: tiles[k] };
    s.uniforms.gPads = { value: pads.map(p => new THREE.Vector4(...p)) };
    s.vertexShader = 'attribute vec4 splat,turf;varying vec4 vSplat,vTurf;varying vec2 vGround;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat=splat;vTurf=turf;vGround=position.xz;');
    s.fragmentShader = `${lite ? '#define GROUND_LITE\n' : ''}uniform sampler2D gLawn,gRough,gMottle,gGravel,gSand,gDuff;uniform vec4 gPads[${pads.length}];varying vec4 vSplat,vTurf;varying vec2 vGround;${GROUND_GLSL}
      vec3 gTile(sampler2D t,vec2 p,float s,vec3 mean){
        vec3 a=texture2D(t,p/s).rgb;
        ${lite ? '' : `vec3 b=texture2D(t,mat2(.8,-.6,.6,.8)*p/(s*1.9)+.37).rgb; float w=smoothstep(.3,.7,gNoise(p/(s*2.7)+11.));
        a=mean+(mix(a,b,w)-mean)*inversesqrt(w*w+(1.-w)*(1.-w));`}
        return a/mean;
      }\n` + s.fragmentShader.replace('#include <color_fragment>', `{ vec2 p=vGround; float br=gBreak(p),dry=gDry(vSplat.w,br);
        vec3 detail=${lite ? tile('gRough', 1.7) : `mix(${tile('gRough', 1.7)},${tile('gLawn', .9)},vTurf.x)`};   // Lite: one turf photo, the palette still lightens the fairway
        ${lite ? '' : `detail*=mix(vec3(1.),gTile(gMottle,mat2(.6,.8,-.8,.6)*p,8.,${vec3s(TILE_MEAN.mottle)}),.7);   // two orientations break the photo's diagonal mowing bands into patches
        detail*=mix(1.,dot(gTile(gRough,mat2(-.28,.96,-.96,-.28)*p,5.5,${vec3s(TILE_MEAN.rough)}),vec3(.33)),.45);   // clumps 0.5-2 m wide that still read at 20-80 m, where the fine tiles have gone to their mean`}
        vec3 c=gTurf(p,vColor,vTurf.xy,dry)*mix(detail,vec3(dot(detail,vec3(.33))),dry*.4);
        float d=length(vViewPosition),u=${lite ? 'clamp((5.8-d)/2.8,0.,1.)*.55' : 'clamp((8.5-d)/5.,0.,1.)*.9+.12*(1.-smoothstep(9.,15.,d))'};
        c=mix(c,dot(c,vec3(.3,.59,.11))*vec3(.62,1.25,.28),u*.75)*(1.-u*.18);   // under the blade carpet the gaps are shaded green undergrowth, not the flat photo or bare soil
        vec3 cov=gCover(vSplat,vTurf.zw,br);
        float reach=${lite ? 'cov.z' : 'smoothstep(.02,.4,vSplat.z+br*.5)'};   // beyond the litter's edge single leaves stray into the turf (Full)
        if(reach>0.){ vec3 l=texture2D(gDuff,p/2.3).rgb; float dp=gPatch(p);
          ${lite ? '' : 'l=mix(l,texture2D(gDuff,mat2(.6,-.8,.8,.6)*p/1.2+.3).rgb,smoothstep(.35,.65,gNoise(p/.9+41.)));   // finer, fresher shreds in drifts: chip size varies'}
          float ll=dot(l,vec3(.3,.59,.11));
          l=mix(l,vec3(ll),.2+dp*.3)*vec3(1.8,2.05,1.75)*mix(.62,1.3,dp);   // shredded bark and leaves, 2-6 cm, sampled to DGM's #6f593f: damp dark patches, sun-bleached ones
          c=mix(c,l,max(cov.z,reach*smoothstep(.1,.2,ll)*.85)); }
        if(cov.x>0.){ vec3 g=texture2D(gGravel,p/1.3).rgb;   // packed pea gravel, shaded per pebble in the tile; its contrast eases with distance so it cannot speckle
          g=mix(g,${vec3s([.328, .306, .271])},smoothstep(3.,16.,d)*.55)*vec3(1.5,1.43,1.25)${lite ? '' : '*mix(1.,.62,smoothstep(.55,.85,gNoise(p*.8+3.)))'};   // packed earth shows in patches
          c=mix(c,g,cov.x)*(1.-cov.x*(1.-cov.x)*.6); }   // a damp trodden rim at the turf
        if(cov.y>0.) c=mix(c,texture2D(gSand,p*.32).rgb,cov.y);
        ${lite ? '' : `float pd=1e3; for(int i=0;i<${pads.length};i++){ vec2 q=p-gPads[i].xy; q=vec2(q.x*gPads[i].z-q.y*gPads[i].w,q.x*gPads[i].w+q.y*gPads[i].z); pd=min(pd,max(abs(q.x)-.8,abs(q.y)-1.6)); }
        c*=1.-.45*(1.-smoothstep(0.,.25,pd));   // contact shade where the pad sits on the ground`}
        diffuseColor.rgb=c; }`);
  };
  material.customProgramCacheKey = () => 'chains-ground-v8' + (lite ? '-lite' : '');
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
    if(grass){   // blade cards darken toward the root (neighbouring blades shade it) so they sit in the turf instead of floating on it
      s.vertexShader='varying float vBladeY;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBladeY=position.y;');
      s.fragmentShader='varying float vBladeY;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(.4,1.,smoothstep(-.04,.45,vBladeY));');
    }
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
