import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadManifest, texture, washedTexture, atlasImage } from '../src/assets.js';
const originalFetch = globalThis.fetch, originalImage = globalThis.Image, originalDocument = globalThis.document;
const originalLoad = THREE.TextureLoader.prototype.load;
try {
  globalThis.fetch = async () => ({ok:true,json:async()=>({textures:{sample:'sample.webp'},atlas:{turf:'turf.webp',missing:'missing.webp'}})});
  globalThis.document = { createElement: () => ({width:4,height:4,getContext:()=>({fillRect(){},drawImage(){}})}) };
  let imageLoads=0;
  globalThis.Image = class {set src(url){imageLoads++;queueMicrotask(()=>url.includes('missing')?this.onerror():this.onload());}};
  THREE.TextureLoader.prototype.load = () => new THREE.Texture();
  await loadManifest();
  const base=texture('sample');
  assert.equal(base,texture('sample',{repeat:[1,1]}),'equivalent defaults share a GPU texture');
  const data=texture('sample',{srgb:false,clamp:true,flipY:false,repeat:[3,2]});
  assert.notEqual(base,data,'different sampling/color configurations do not alias');
  assert.equal(data.colorSpace,THREE.NoColorSpace);assert.equal(data.wrapS,THREE.ClampToEdgeWrapping);assert.equal(data.flipY,false);assert.deepEqual(data.repeat.toArray(),[3,2]);
  assert.equal(base.colorSpace,THREE.SRGBColorSpace);assert.deepEqual(base.repeat.toArray(),[1,1]);
  const wash=washedTexture('sample',{repeat:[2,4]});assert.equal(wash,washedTexture('sample',{repeat:[2,4]}));assert.notEqual(wash,washedTexture('sample',{repeat:[3,4]}));assert.deepEqual(wash.repeat.toArray(),[2,4]);
  const a=atlasImage('turf'),b=atlasImage('turf');assert.equal(a,b,'atlas image request is coalesced');assert.ok(await a);assert.equal(await atlasImage('missing'),null,'failed optional artwork falls back');assert.equal(await atlasImage('unknown'),null);assert.equal(imageLoads,4);
  console.log('Texture options remain independent; optional atlas image loads coalesce and fail safely.');
} finally {globalThis.fetch=originalFetch;globalThis.Image=originalImage;globalThis.document=originalDocument;THREE.TextureLoader.prototype.load=originalLoad;}
