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

// Broadcast finish for Full: render -> bloom (chalk, sky band, glossy plastic) -> output -> grade.
// The grade is one fullscreen pass: lift and gain, saturation about luma, film grain, corner vignette.
// SSAO is deliberately absent; the baked canopy occlusion and real shadows carry the ground.
const GRADE = {
  uniforms: { tDiffuse: { value: null }, uGain: { value: new THREE.Vector3(1.04, 1, .97) }, uLift: { value: new THREE.Vector3(.012, .014, .018) }, uSat: { value: 1.08 }, uGrain: { value: .02 }, uVignette: { value: .3 }, uTime: { value: 0 } },
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .22, .4, .93); composer.addPass(bloom);
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

const noiseGLSL = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}`;
export function atmosphere(group, def, holes) {
  const uniforms={ time:{value:0}, tint:{value:new THREE.Color(def.id==='meadow'?'#ffe5bf':'#f0f5fa')} };
  const mat=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform float time;uniform vec3 tint;${noiseGLSL} void main(){vec2 p=vUv*9.+vec2(time*.007,0.);float n=noise(p)*.55+noise(p*2.1)*.28+noise(p*4.3)*.17;float a=smoothstep(.48,.74,n)*.58;float edge=smoothstep(0.,.15,vUv.x)*smoothstep(0.,.15,vUv.y)*smoothstep(0.,.15,1.-vUv.x)*smoothstep(0.,.15,1.-vUv.y);gl_FragColor=vec4(tint,a*edge);}`});
  const clouds=new THREE.Mesh(new THREE.PlaneGeometry(1600,1600),mat); clouds.rotation.x=-Math.PI/2;clouds.position.y=135;group.add(clouds);
  const shafts=[];
  if(def.id==='meadow') {
    const rayMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv;void main(){float a=sin(vUv.x*3.14159)*sin(vUv.y*3.14159);gl_FragColor=vec4(1.,.7,.32,a*.025);}'});
    for(const h of holes) for(let i=0;i<3;i++){const ray=new THREE.Mesh(new THREE.PlaneGeometry(3+i,32),rayMat);ray.position.set(h.tee[0]+12+i*7,h.teeY+14,h.tee[1]+22);ray.rotation.z=-.6;group.add(ray);shafts.push(ray);}
  }
  return {update(t){uniforms.time.value=t;},clouds,shafts};
}
