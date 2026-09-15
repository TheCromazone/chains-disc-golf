import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const root=new URL('../assets/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
let bytes=0,entries=0;
for(const group of Object.values(manifest))for(const path of Object.values(group)){
  assert(!path.includes('..'),'manifest paths stay inside assets');
  const info=await stat(new URL(path,root));assert(info.size>0,path);bytes+=info.size;entries++;
}
const joints=['root','spine','head','shR','elR','shL','elL','hipR','knR','hipL','knL'];
for(const [name,path] of Object.entries(manifest.models)){
  const bin=await readFile(new URL(path,root));assert.equal(bin.readUInt32LE(0),0x46546c67);assert.equal(bin.readUInt32LE(4),2);assert.equal(bin.readUInt32LE(8),bin.length);
  const gltf=JSON.parse(bin.subarray(20,20+bin.readUInt32LE(12)).toString());
  assert(gltf.extensionsRequired.includes('KHR_draco_mesh_compression'),name+' Draco');
  const triangles=gltf.meshes.reduce((n,m)=>n+m.primitives.reduce((a,p)=>a+gltf.accessors[p.indices].count/3,0),0);
  if(name==='golfer'){
    assert(triangles<12000,'golfer triangle budget');
    const actual=[...new Set(gltf.skins.flatMap(s=>s.joints.map(i=>gltf.nodes[i].name)))].sort();assert.deepEqual(actual,[...joints].sort());
    for(const slot of ['skin','hair','jersey','trim','shorts','shoes','headwear'])assert(gltf.materials.some(m=>m.name===slot),slot);
    for(const clip of ['backhand','forehand','tomahawk','scoober','putt','idle_weight','idle_look','idle_practice','celebrate','slump'])assert(gltf.animations.some(a=>a.name===clip),clip);
    for(const clip of gltf.animations.filter(a=>['backhand','forehand','tomahawk','scoober','putt'].includes(a.name)))assert(Math.abs(Math.max(...clip.samplers.map(s=>gltf.accessors[s.input].max[0]))-1)<.02,'one-second normalized throw');
  } else {assert(gltf.extensionsRequired.includes('KHR_texture_basisu'),name+' KTX2');assert.equal(gltf.images.length,3,name+' baked PBR maps');}
  console.log(name,triangles,'triangles',bin.length,'bytes');
}
console.log('Asset manifest OK:',entries,'entries,',bytes,'bytes (initial load uses a subset)');
