// Imported only by Full graphics. Lite allocates none of these render targets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Water } from 'three/addons/objects/Water.js';

// The course's own sky dome is prefiltered into the environment on both tiers (course.js), so its blue fill and the
// sun's aureole agree with what the frame shows; the old course HDRIs baked their sun somewhere else. Nothing to fetch.
export async function loadSky() { return null; }

// Broadcast finish for Full: render -> light shafts -> bloom (the sun's halo, lit cloud tops, chalk, glossy plastic)
// -> output (ACES) -> grade. The grade is one fullscreen pass in display space: gain and lift, a gentle S-curve (at .5
// it sank dark mulch in shade under the toe), saturation about luma with greens eased toward summer olive (the lawn and
// leaves were a neon lime), a split tone (shade toward the sky's blue, sunlit tones toward the key's warmth, so sun and
// shade read apart at a glance), a thin cool veil over the deepest darks, film grain, corner vignette.
// Screen-space AO was tried and dropped (r5): too faint at thin contacts, grime in the lawn; the contact rings under trunks
// and baskets (course.js) and the canopy's baked occlusion carry it.
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uGain: { value: new THREE.Vector3(1.03, 1, .96) }, uLift: { value: new THREE.Vector3(0, .003, .01) }, uSat: { value: 1 }, uOlive: { value: .5 },
    uCool: { value: new THREE.Vector3(.94, .99, 1.06) }, uWarm: { value: new THREE.Vector3(1.04, 1, .92) }, uVeil: { value: new THREE.Vector3(.018, .022, .03) }, uCurve: { value: .4 }, uGrain: { value: .018 }, uVignette: { value: .28 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform vec3 uGain,uLift,uCool,uWarm,uVeil;uniform float uSat,uOlive,uCurve,uGrain,uVignette,uTime;varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); c.rgb=clamp(c.rgb*uGain+uLift,0.,1.);
      c.rgb=mix(c.rgb,c.rgb*c.rgb*(3.-2.*c.rgb),uCurve);
      float l=dot(c.rgb,vec3(.2126,.7152,.0722)), lead=clamp((c.g-max(c.r,c.b))*3.,0.,1.);   // how far green leads: turf and leaves
      c.rgb=mix(vec3(l),c.rgb,uSat*(1.-uOlive*lead)); c.r+=(c.g-c.r)*lead*.25;
      c.rgb*=mix(uCool,uWarm,smoothstep(.06,.5,l));
      c.rgb=mix(vec3(l),c.rgb,mix(.9,1.,smoothstep(.04,.3,l)))+uVeil*(1.-l)*(1.-l)*(1.-l);   // air between lens and shade: the deepest darks go a little grey and cool, never ink-black
      float n=fract(sin(dot(gl_FragCoord.xy+vec2(uTime*61.,uTime*37.),vec2(12.9898,78.233)))*43758.5453); c.rgb+=(n-.5)*uGrain*(1.-l*.6);
      vec2 d=(vUv-.5)*vec2(1.,.85); float v=1.-smoothstep(.35,.95,dot(d,d)*2.2)*uVignette; gl_FragColor=vec4(c.rgb*v,c.a); }`,
};

// Light shafts: sky pixels (depth left at the far plane: the dome never writes depth) round the sun's disc, marched
// radially toward the disc at quarter resolution and added back in linear HDR ahead of the bloom, so canopy gaps
// between the camera and a low sun stream light. When the disc sits just off frame (the putt tilts lower than the tee)
// the shafts fall in from that edge; they fade out as it leaves the view.
const QUAD_VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const _sun = new THREE.Vector3(), _fwd = new THREE.Vector3();
class LightShafts extends Pass {
  constructor(scene, camera) {
    super(); this.needsSwap = false; this.scene = scene; this.camera = camera; this.strength = 2.5; this.glare = .5;
    this.a = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }); this.b = this.a.clone();
    const u = this.u = { tDepth: { value: null }, tColor: { value: null }, tMask: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uTint: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() } };
    const quad = (fragmentShader, extra = {}) => new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, fragmentShader, depthTest: false, depthWrite: false, ...extra }));
    this.mask = quad(`uniform sampler2D tDepth,tColor;uniform vec2 uSun;uniform float uAspect;varying vec2 vUv;
      void main(){ vec2 d=(vUv-uSun)*vec2(uAspect,1.); float sky=step(.99999,texture2D(tDepth,vUv).x),f=exp(-dot(d,d)*12.);
        gl_FragColor=vec4(sky*clamp(dot(texture2D(tColor,vUv).rgb,vec3(.3,.59,.11))-1.,0.,4.)*f,sky,f,1.); }`);   // r: sky brighter than white by the disc (its glare, not the blue), g: sky, b: nearness to the disc
    // A ray only shows where something cut the light on its way from the disc: the march counts sky/solid changes near
    // the disc, so one crossing (the horizon, open sky over bluffs or the flyover) adds no flat veil while a canopy's
    // gaps break it into shafts.
    this.blur = quad(`uniform sampler2D tMask;uniform vec2 uSun;varying vec2 vUv;
      void main(){ vec2 dt=(uSun-vUv)/48.,uv=vUv+dt*fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453); float s=0.,cuts=0.,w=1.,last=texture2D(tMask,uv).g;
        for(int i=0;i<48;i++){ vec3 m=texture2D(tMask,uv).rgb; s+=m.r*w; cuts+=abs(m.g-last)*m.b; last=m.g; w*=.965; uv+=dt; }
        gl_FragColor=vec4(vec3(s/48.*clamp((cuts-.8)*.5,0.,1.)),1.); }`);
    // Second, short march along the same rays: smears the jitter grain of the long one into clean streaks.
    this.smooth = quad(`uniform sampler2D tMask;uniform vec2 uSun;varying vec2 vUv;
      void main(){ vec2 dt=(uSun-vUv)/256.; float s=0.; for(int i=0;i<16;i++) s+=texture2D(tMask,vUv+dt*(float(i)-4.)).r; gl_FragColor=vec4(vec3(s/16.),1.); }`);
    // Veiling glare: a sun just behind the leaves still floods the lens round it, whatever the gaps. A broad warm bloom
    // centred on the disc plus a tight core, so the frame shows where the sun sits (the tee's upper left) and the
    // canopy there hazes over, without the shafts' need for open sky. The broad part stays small and tight (it was twice as
    // wide and strong, and washed the tee's upper-left canopy into one flat cream-yellow sheet with no leaf edges in it). Only for a hidden disc: in open sky (the flyover) the
    // bloom already spreads it, and the veil on top washed half the frame milky.
    this.add = quad(`uniform sampler2D tMask,tDepth;uniform vec3 uTint,uGlow;uniform vec2 uSun;uniform float uAspect;varying vec2 vUv;
      void main(){ vec2 d=(vUv-uSun)*vec2(uAspect,1.); float r2=dot(d,d),open=0.;
        for(int i=0;i<12;i++){ float a=float(i)*2.3998,r=.004+.0025*float(i); open+=step(.99999,texture2D(tDepth,uSun+vec2(cos(a)/uAspect,sin(a))*r).x); }
        gl_FragColor=vec4(texture2D(tMask,vUv).r*uTint+uGlow*(1.-open/12.)*(exp(-r2*20.)*.3+exp(-r2*70.)*.6),1.); }`, { blending: THREE.AdditiveBlending, transparent: true });
  }
  setSize(w, h) { this.a.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); this.b.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); this.u.uAspect.value = w / h; }
  render(renderer, writeBuffer, readBuffer) {
    const sun = this.scene.userData.sun; if (!sun || !readBuffer.depthTexture) return;
    const facing = this.camera.getWorldDirection(_fwd).dot(sun.dir);
    _sun.copy(sun.dir).multiplyScalar(100).add(this.camera.position).project(this.camera);
    const fade = THREE.MathUtils.smoothstep(facing, .2, .55) * (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(_sun.x), Math.abs(_sun.y)), 1.08, 1.3));   // further off frame the blur has no occluders left to cut, only a flat beam
    if (fade <= 0) return;
    const u = this.u, auto = renderer.autoClear; renderer.autoClear = false;
    u.uSun.value.set(_sun.x * .5 + .5, _sun.y * .5 + .5); u.tDepth.value = readBuffer.depthTexture; u.tColor.value = readBuffer.texture;
    renderer.setRenderTarget(this.a); this.mask.render(renderer);
    u.tMask.value = this.a.texture; renderer.setRenderTarget(this.b); this.blur.render(renderer);
    u.tMask.value = this.b.texture; renderer.setRenderTarget(this.a); this.smooth.render(renderer);
    u.tMask.value = this.a.texture; u.uTint.value.copy(sun.color).multiplyScalar(this.strength * fade); u.uGlow.value.copy(sun.color).multiplyScalar(this.glare * fade);
    renderer.setRenderTarget(readBuffer); this.add.render(renderer);
    renderer.autoClear = auto;
  }
  dispose() { this.a.dispose(); this.b.dispose(); for (const q of [this.mask, this.blur, this.smooth, this.add]) { q.material.dispose(); q.dispose(); } }
}

export function postprocessing(renderer, scene, camera, { photographic = false } = {}) {
  if (!photographic) return { render: () => renderer.render(scene, camera), resize() {}, dispose() {} };
  // The scene target keeps its depth as a texture for the shafts, and takes 4x MSAA: the renderer's own antialias only
  // covers the default framebuffer, so Full used to go through post with stair-stepped edges. With two swapping passes
  // per frame the RenderPass always lands in renderTarget2 (the composer's first read buffer); renderTarget1 only takes
  // the OutputPass's fullscreen quad, so it keeps neither samples nor a depth texture.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType }));
  Object.assign(composer.renderTarget2, { samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y) });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new LightShafts(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .35, .6, 2); composer.addPass(bloom);   // wide enough that the 20x sun disc spreads into a halo; the threshold sits above lit turf and the haze
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE); composer.addPass(grade);
  return { render: () => { grade.uniforms.uTime.value = performance.now() / 1000 % 100; composer.render(); }, resize(w, h) { composer.setPixelRatio(1); composer.setSize(w, h); }, dispose() {
    for (const p of composer.passes) p.dispose?.(); composer.dispose();   // disposing a target frees its depth texture too
  } };
}

export function reflectiveWater(geometry, normals, def, sunDir) {
  const water = new Water(geometry, { textureWidth: 256, textureHeight: 256, waterNormals: normals, sunDirection: sunDir, sunColor: def.sunColor, waterColor: def.water, distortionScale: 1.4, fog: true });
  const reflect = water.onBeforeRender; let frame = 0, target = null;
  water.onBeforeRender = function(...args) {
    const renderer=args[0],camera=args[2];
    if(args[1].overrideMaterial)return;
    if(camera.position.distanceToSquared(this.position)>180*180 || frame++%3!==0)return;
    // Water's r170 closure owns the reflection target; capture it for course teardown.
    const set=renderer.setRenderTarget;
    renderer.setRenderTarget=function(rt,...rest){if(!target&&rt?.width===256&&rt?.height===256)target=rt;return set.call(this,rt,...rest);};
    try {reflect.apply(this,args);} finally {renderer.setRenderTarget=set;}
  };
  water.userData.dispose=()=>target?.dispose();
  return water;
}
