// Imported only by Full graphics. Lite allocates none of these render targets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Water } from 'three/addons/objects/Water.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export async function loadSky(renderer, url) {
  if(!url)return null;
  try { const texture=await new EXRLoader().loadAsync(url);texture.mapping=THREE.EquirectangularReflectionMapping;
    const generator=new THREE.PMREMGenerator(renderer),target=generator.fromEquirectangular(texture);generator.dispose();return {texture,target};
  } catch {return null;}
}

// Broadcast finish for Full: render -> bloom (the sun's halo, lit cloud tops, chalk, glossy plastic) -> output -> grade.
// The grade is one fullscreen pass: lift and gain, saturation about luma, film grain, corner vignette.
// SSAO is deliberately absent; the baked canopy occlusion and real shadows carry the ground.
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uGain: { value: new THREE.Vector3(1.04, 1, .97) }, uLift: { value: new THREE.Vector3(.012, .014, .018) }, uSat: { value: .82 }, uGrain: { value: .02 }, uVignette: { value: .3 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform vec3 uGain,uLift;uniform float uSat,uGrain,uVignette,uTime;varying vec2 vUv;
    void main(){ vec4 c=texture2D(tDiffuse,vUv); c.rgb=c.rgb*uGain+uLift;
      float l=dot(c.rgb,vec3(.2126,.7152,.0722)); c.rgb=mix(vec3(l),c.rgb,uSat);
      float n=fract(sin(dot(gl_FragCoord.xy+vec2(uTime*61.,uTime*37.),vec2(12.9898,78.233)))*43758.5453); c.rgb+=(n-.5)*uGrain*(1.-l*.6);
      vec2 d=(vUv-.5)*vec2(1.,.85); float v=1.-smoothstep(.35,.95,dot(d,d)*2.2)*uVignette; gl_FragColor=vec4(c.rgb*v,c.a); }`,
};
export function postprocessing(renderer, scene, camera, { photographic = false } = {}) {
  if (!photographic) return { render: () => renderer.render(scene, camera), resize() {}, dispose() {} };
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .3, .6, .9); composer.addPass(bloom);   // wide enough that the 8x sun disc spreads into a halo
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE); composer.addPass(grade);
  return { render: () => { grade.uniforms.uTime.value = performance.now() / 1000 % 100; composer.render(); }, resize(w, h) { composer.setPixelRatio(1); composer.setSize(w, h); }, dispose() {
    for (const p of composer.passes) p.dispose?.(); composer.dispose();
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
