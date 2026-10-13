// Imported only by Full graphics. Lite allocates none of these render targets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { Water } from 'three/addons/objects/Water.js';

// The course's own sky dome is prefiltered into the environment on both tiers (course.js), so its blue fill and the
// sun's aureole agree with what the frame shows; the old course HDRIs baked their sun somewhere else. Nothing to fetch.
export async function loadSky() { return null; }

// Broadcast finish for Full: render -> aerial perspective -> light shafts -> bloom (the sun's halo, lit cloud tops, chalk,
// glossy plastic) -> output (ACES) -> grade. The grade is one fullscreen pass in display space: a warm gain over a lifted
// toe, a gentle S-curve (at .5 it sank dark mulch in shade under the toe), saturation about luma with greens' hue pushed
// toward summer olive (uHue) and a little of their saturation off (uOlive), a split tone (shade toward the sky's blue,
// sunlit tones toward the key's warmth, so sun and shade read apart at a glance), a thin cool veil over the deepest darks,
// film grain, corner vignette. d-look r2 (0/2: "neon-green grass, punchy contrast", "a stylized game"): the lawn's green
// sat at hue ~100 deg against Disc Golf Masters' ~77 (yellow-olive), so uHue .25 -> 1.1 (lawn ~86 deg), uOlive 0 -> .28, uSat 1.12 -> .97,
// curve .4 -> .25 and a warmer gain with a lifted toe: a muted, slightly warm filmic print instead of a punchy game grade.
// Screen-space AO: see the AO pass below (r5's version was dropped as too faint at thin contacts, grime in the lawn); the
// contact rings under trunks and baskets (course.js) and the canopy's baked occlusion still carry the near field.
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uGain: { value: new THREE.Vector3(1.01, .975, .9) }, uLift: { value: new THREE.Vector3(.009, .009, .013) }, uSat: { value: .97 }, uOlive: { value: .28 }, uHue: { value: 1.1 },
    uCool: { value: new THREE.Vector3(.94, .99, 1.06) }, uWarm: { value: new THREE.Vector3(1.04, 1, .92) }, uVeil: { value: new THREE.Vector3(.018, .022, .03) }, uCurve: { value: .25 }, uGrain: { value: .018 }, uVignette: { value: .28 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform vec3 uGain,uLift,uCool,uWarm,uVeil;uniform float uSat,uOlive,uHue,uCurve,uGrain,uVignette,uTime;varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); c.rgb=clamp(c.rgb*uGain+uLift,0.,1.);
      c.rgb=mix(c.rgb,c.rgb*c.rgb*(3.-2.*c.rgb),uCurve);
      float l=dot(c.rgb,vec3(.2126,.7152,.0722)), lead=clamp((c.g-max(c.r,c.b))*3.,0.,1.);   // how far green leads: turf and leaves
      c.rgb=mix(vec3(l),c.rgb,uSat*(1.-uOlive*lead)); c.r+=(c.g-c.r)*lead*uHue;
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
    super(); this.needsSwap = false; this.scene = scene; this.camera = camera; this.strength = 2.5; this.glare = .2;   // glare round: .5 left a cream disc over the tee's upper-left canopy with no leaf edges in it; the shafts and the sun disc carry the backlight
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
    const fade = THREE.MathUtils.smoothstep(facing, .2, .55) * (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(_sun.x), Math.abs(_sun.y)), 1.08, 1.3))   // further off frame the blur has no occluders left to cut, only a flat beam
      * (1 - (sun.air?.value ?? 0) * (1 - (sun.putt?.shafts ?? 1)));   // round the pin only PUTT_AIR.shafts of it: the putt looks into the sun through the canopy and its streaks read as a milky wash over the woods (w11-1)
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

// Aerial perspective for Full, from the scene's own depth: past uShape.x metres of true eye distance every solid pixel
// is veiled toward sunlit air (the course fog's haze, warming toward the disc, a forward-scatter glare round it), up to
// uShape.z, at a density of uShape.y per metre. The materials' fog clears the first 34 m (28 at the pin) for Lite's sake,
// so on a big monitor the arch, the 30-60 m woods and the hill behind them kept the near rows' contrast and saturation
// ("a dense CG diorama", d-look 0/2); this starts at 12 m and grades each row back. Drawn into the scene target with
// blending (dst*(1-f) + air*f), so it needs no target or buffer swap of its own; the sky (no depth) is left alone.
class Aerial extends Pass {
  constructor(scene, camera) {
    super(); this.needsSwap = false; this.scene = scene; this.camera = camera;
    this.u = { tDepth: { value: null }, uProjInv: { value: camera.projectionMatrixInverse }, uSun: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() },
      uHaze: { value: new THREE.Color() }, uWarm: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uShape: { value: new THREE.Vector4(15, .013, .52, 10) }, uGain: { value: new THREE.Vector3(.75, .8, .85) } };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: QUAD_VS, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      fragmentShader: `uniform sampler2D tDepth;uniform mat4 uProjInv;uniform vec3 uSun,uUp,uHaze,uWarm,uGlow,uGain;uniform vec4 uShape;varying vec2 vUv;
      void main(){ float z=texture2D(tDepth,vUv).x; if(z>.99999) discard;
        vec4 p=uProjInv*vec4(vUv*2.-1.,z*2.-1.,1.); p.xyz/=p.w; float d=length(p.xyz); vec3 ray=p.xyz/d; float s=max(dot(ray,uSun),0.);
        float f=uShape.z*(1.-exp(-uShape.y*max(d-uShape.x,0.)))*mix(1.,.7,smoothstep(0.,.6,dot(ray,uUp)));   // a little thinner looking up into the crowns than across the ground
        vec3 air=(mix(uHaze,uWarm,pow(s,uShape.w))+uGlow*pow(s,24.))*uGain;
        gl_FragColor=vec4(air*f,f); }` }));
  }
  render(renderer, writeBuffer, readBuffer) {
    const sun = this.scene.userData.sun; if (!sun || !readBuffer.depthTexture || this.u.uShape.value.z <= 0) return;
    const u = this.u, fog = sun.fog, v = this.camera.matrixWorldInverse, k = sun.air?.value ?? 0;
    // Round the pin (k: course.js's putt factor) the air clears to 30 m and its warm lobe narrows to the disc itself:
    // from 15 m it laid a milky cream veil over the bushes and birches 10-25 m behind the basket and the whole upper-left
    // quarter ("a milky veil washes out the upper half", fn-d-look r1), and past it the density drops 45% ("cut the haze about in
    // half so the far trunks keep their contrast"). The rows past 30 m still step back into the air, a shallower step.
    u.uShape.value.x = 15 + 15 * k; u.uShape.value.y = .013 * (1 - .45 * k); u.uShape.value.w = 10 + 20 * k;
    u.tDepth.value = readBuffer.depthTexture; u.uSun.value.copy(sun.dir).transformDirection(v); u.uUp.value.set(0, 1, 0).transformDirection(v);
    u.uHaze.value.setRGB(fog.haze.r, fog.haze.g, fog.haze.b); u.uWarm.value.setRGB(fog.warm.r, fog.warm.g, fog.warm.b); u.uGlow.value.setRGB(fog.glow.r, fog.glow.g, fog.glow.b);
    const auto = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(readBuffer); this.quad.render(renderer); renderer.autoClear = auto;
  }
  dispose() { this.quad.material.dispose(); this.quad.dispose(); }
}

// Ambient occlusion for Full, from the scene's own depth (no normal pass, so no second scene draw): half resolution,
// 12 taps on a spiral over a ~0.45 m world radius, normals rebuilt from the nearer depth neighbour on each axis, then
// a depth-aware 4x4 blur, multiplied into the scene ahead of the aerial pass (the haze veils it with distance like any
// shade). It is what gives the bushes and crowns their inner self-shadow, and the litter, tufts, sign feet and basket
// base their contact darkening. r5's attempt read "too faint at thin contacts, grime in the lawn": the falloff here
// ignores occluders under 4 cm above the tangent plane (the blade carpet) and the result fades out past 60 m.
class AO extends Pass {
  constructor(camera) {
    super(); this.needsSwap = false; this.camera = camera; this.strength = 1;
    this.a = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }); this.b = this.a.clone();
    const u = this.u = { tDepth: { value: null }, tAO: { value: null }, uProj: { value: camera.projectionMatrix }, uProjInv: { value: camera.projectionMatrixInverse }, uTexel: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2() }, uStrength: { value: 1 } };
    const VIEW = `uniform sampler2D tDepth;uniform mat4 uProj,uProjInv;uniform vec2 uTexel;
      vec3 viewAt(vec2 uv){ vec4 p=uProjInv*vec4(uv*2.-1.,texture2D(tDepth,uv).x*2.-1.,1.); return p.xyz/p.w; }`;
    this.ao = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, depthTest: false, depthWrite: false, fragmentShader: `${VIEW}varying vec2 vUv;
      void main(){ float z=texture2D(tDepth,vUv).x; if(z>.99999){ gl_FragColor=vec4(1.); return; }
        vec3 p=viewAt(vUv),px=viewAt(vUv+vec2(uTexel.x,0.))-p,nx=p-viewAt(vUv-vec2(uTexel.x,0.)),py=viewAt(vUv+vec2(0.,uTexel.y))-p,ny=p-viewAt(vUv-vec2(0.,uTexel.y));
        vec3 n=normalize(cross(abs(px.z)<abs(nx.z)?px:nx,abs(py.z)<abs(ny.z)?py:ny));   // the flatter side on each axis: no seams along silhouettes
        float R=.45,rs=R*uProj[1][1]*.5/-p.z,occ=0.,a=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)*6.2832;
        rs=min(rs,.08);   // up close a 0.45 m disc would span the screen: keep it to a tenth of the height
        for(int i=0;i<12;i++){ float t=(float(i)+.5)/12.; vec2 o=vec2(cos(a),sin(a))*rs*t*vec2(uTexel.x/uTexel.y,1.); a+=2.3998;
          vec3 v=viewAt(vUv+o)-p; float d2=dot(v,v),h=dot(v,n);
          occ+=max(h-.04,0.)/(sqrt(d2)+.05)*(1.-smoothstep(R*R*.6,R*R*2.,d2)); }   // only what stands 4 cm proud of the surface, within the radius
        float ao=1.-clamp(occ/12.*6.,0.,.6)*smoothstep(4.5,7.,-p.z)*(1.-smoothstep(40.,60.,-p.z));   // at most 60% of the light (3.6/.5 read faint inside the putt's bushes, cycle 2); none on the athlete within 7 m of the lens (his arm against his torso went black) or past 60 m
        gl_FragColor=vec4(vec3(ao),1.); }` }));
    // Separable, depth-aware: a tap counts only if its depth sits within 3% of the centre's, so occlusion never bleeds across a silhouette.
    this.blur = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, depthTest: false, depthWrite: false, fragmentShader: `${VIEW}uniform sampler2D tAO;uniform vec2 uDir;varying vec2 vUv;
      void main(){ float z0=-viewAt(vUv).z,s=0.,w=0.;
        for(int i=-3;i<=3;i++){ vec2 uv=vUv+uDir*float(i); float k=(1.-smoothstep(.0,.03,abs(-viewAt(uv).z-z0)/z0))*(1.-abs(float(i))/4.); s+=texture2D(tAO,uv).r*k; w+=k; }
        gl_FragColor=vec4(vec3(s/max(w,1e-4)),1.); }` }));
    this.apply = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      fragmentShader: 'uniform sampler2D tAO;uniform float uStrength;varying vec2 vUv;void main(){ gl_FragColor=vec4(vec3(max(mix(1.,texture2D(tAO,vUv).r,uStrength),0.)),1.); }' }));
  }
  setSize(w, h) { this.a.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); this.b.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); }
  render(renderer, writeBuffer, readBuffer) {
    if (!readBuffer.depthTexture || this.strength <= 0) return;
    const u = this.u, auto = renderer.autoClear; renderer.autoClear = false;
    u.tDepth.value = readBuffer.depthTexture; u.uStrength.value = this.strength; u.uTexel.value.set(1 / this.a.width, 1 / this.a.height);
    renderer.setRenderTarget(this.a); this.ao.render(renderer);
    u.tAO.value = this.a.texture; u.uDir.value.set(u.uTexel.value.x, 0); renderer.setRenderTarget(this.b); this.blur.render(renderer);
    u.tAO.value = this.b.texture; u.uDir.value.set(0, u.uTexel.value.y); renderer.setRenderTarget(this.a); this.blur.render(renderer);
    u.tAO.value = this.a.texture; renderer.setRenderTarget(readBuffer); this.apply.render(renderer);
    renderer.autoClear = auto;
  }
  dispose() { this.a.dispose(); this.b.dispose(); for (const q of [this.ao, this.blur, this.apply]) { q.material.dispose(); q.dispose(); } }
}

export function postprocessing(renderer, scene, camera, { photographic = false } = {}) {
  if (!photographic) return { render: () => renderer.render(scene, camera), resize() {}, dispose() {} };
  // The scene target keeps its depth as a texture for the shafts, and takes 4x MSAA: the renderer's own antialias only
  // covers the default framebuffer, so Full used to go through post with stair-stepped edges. The RenderPass must land in
  // renderTarget2 every frame (render() below); renderTarget1 only takes the later passes' fullscreen quads, so it keeps
  // neither samples nor a depth texture. d-look r2: FXAA made three swapping passes, so the composer's buffers came back
  // crossed every other frame and the scene drew into renderTarget1: no MSAA, no aerial haze, no shafts on alternate frames
  // (a 30 Hz flicker; a still caught either "volumetric haze" or "no sense of air" at random).
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType }));
  Object.assign(composer.renderTarget2, { samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y) });
  composer.addPass(new RenderPass(scene, camera));
  const ao = new AO(camera); composer.addPass(ao);
  const aerial = new Aerial(scene, camera); composer.addPass(aerial);
  const shafts = new LightShafts(scene, camera); composer.addPass(shafts);
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .35, .6, 2); composer.addPass(bloom);   // wide enough that the 20x sun disc spreads into a halo; the threshold sits above lit turf and the haze
  composer.addPass(new OutputPass());
  // FXAA over the 4x MSAA resolve, in display space ahead of the grade's grain: MSAA leaves alpha-to-coverage leaf, tuft and
  // hair edges as 4-level dither and thin chains as broken dots; this finishes them into soft partial coverage (gauntlet r2 d-crisp).
  const fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa);
  const grade = new ShaderPass(GRADE); composer.addPass(grade);
  return { passes: { ao, aerial, shafts, bloom, fxaa, grade }, render: () => { grade.uniforms.uTime.value = performance.now() / 1000 % 100; if (composer.readBuffer !== composer.renderTarget2) composer.swapBuffers(); composer.render(); }, resize(w, h) { composer.setPixelRatio(1); composer.setSize(w, h); fxaa.uniforms.resolution.value.set(1 / w, 1 / h); }, dispose() {
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
