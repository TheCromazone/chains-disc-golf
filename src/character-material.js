import * as THREE from 'three';
// Bright three-step toy shading. The lowest band keeps faces readable under trees.
const pixels=new Uint8Array([182,182,182,255,222,222,222,255,255,255,255,255]);
export const characterRamp=new THREE.DataTexture(pixels,3,1,THREE.RGBAFormat);
characterRamp.minFilter=characterRamp.magFilter=THREE.LinearFilter;
characterRamp.generateMipmaps=false;characterRamp.needsUpdate=true;characterRamp.__shared=true;
