import * as THREE from 'three';
import { texture } from './assets.js';

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
      float bend=${grass?'clamp(position.y,0.,1.)':'smoothstep(1.8,8.,position.y)'};
      float wave=sin(windTime*1.5+origin.x*.23+origin.z*.17+position.y*.4);
      transformed.x+=wave*bend*${grass?'.15':'.18'};
      transformed.z+=cos(windTime*1.1+origin.z*.2)*bend*.075;`);
  };
  m.customProgramCacheKey=()=> 'chains-wind-'+grass;return m;
}
