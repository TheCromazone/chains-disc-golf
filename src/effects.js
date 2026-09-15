// Imported only by Full graphics. Lite allocates none of these render targets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
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

export function postprocessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new SSAOPass(scene, camera, 512, 512); ao.kernelRadius = .65; ao.minDistance = .001; ao.maxDistance = .035; composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(512,512), .13, .35, 1.15); composer.addPass(bloom);
  const output = new OutputPass(); composer.addPass(output);
  return { render: () => composer.render(), resize(w,h) { composer.setPixelRatio(1); composer.setSize(w,h); ao.setSize(Math.ceil(w*.65),Math.ceil(h*.65)); }, dispose() { for (const p of composer.passes) p.dispose?.(); composer.dispose(); } };
}

export function reflectiveWater(geometry, normals, def, sunDir) {
  const water = new Water(geometry, { textureWidth: 256, textureHeight: 256, waterNormals: normals, sunDirection: sunDir, sunColor: def.sunColor, waterColor: def.water, distortionScale: 1.4, fog: true });
  const reflect = water.onBeforeRender; let frame = 0;
  water.onBeforeRender = function(...args) { const camera=args[2]; if (camera.position.distanceToSquared(this.position)<180*180 && frame++%3===0) reflect.apply(this,args); };
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
