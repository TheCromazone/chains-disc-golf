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
  const triangles=(gltf.meshes||[]).reduce((n,m)=>n+m.primitives.reduce((a,p)=>a+gltf.accessors[p.indices].count/3,0),0);
  if(name==='golfer'||name==='golfer_lod'){
    assert(triangles<(name==='golfer'?18000:6500),'golfer triangle budget (athlete v2 carries 12 hair and 6 headwear variants; one of each draws)');
    assert(bin.length<(name==='golfer'?820000:340000),'body/LOD byte budget (UV set for fabric weave and skin pores)');
    assert.equal(gltf.animations?.length||0,0,'body does not duplicate animation clips');
    const actual=[...new Set(gltf.skins.flatMap(s=>s.joints.map(i=>gltf.nodes[i].name)))].sort();assert.deepEqual(actual,[...joints].sort());
    for(const slot of ['skin','hair','jersey','trim','shorts','shoes','headwear'])assert(gltf.materials.some(m=>m.name===slot),slot);
  } else if(name.startsWith('golfer_')) {
    assert.equal(gltf.meshes?.length||0,0,'animation-only GLB has zero meshes');
    assert.equal(gltf.materials?.length||0,0,'animation-only GLB has zero materials');
    assert.equal(gltf.textures?.length||0,0,'animation-only GLB has zero textures');
    assert.equal(gltf.animations.length,1,'one clip per file');
    assert.equal(gltf.animations[0].name,name.slice(7));
    assert(bin.length<40000,'clip byte budget');
    for(const bone of joints)assert(gltf.nodes.some(n=>n.name===bone),'clip keeps '+bone);
    if(!['idle','practice','celebrate','slump','walk'].includes(name.slice(7).replace(/_left$/, '')))assert(Math.abs(Math.max(...gltf.animations[0].samplers.map(s=>gltf.accessors[s.input].max[0]))-1)<.02,'one-second normalized throw');
    for(const accessor of gltf.accessors){assert(accessor.count>0,'nonempty accessor');assert(accessor.bufferView<gltf.bufferViews.length,'valid buffer view');}
  } else if(name==='disc') {assert(triangles>800&&triangles<8000,'disc lathe budget');assert.equal(gltf.textures?.length||0,0,'disc is runtime-tinted plastic');assert(bin.length<200000,'disc byte budget');
  } else {assert(gltf.extensionsRequired.includes('KHR_draco_mesh_compression'),name+' Draco');assert(gltf.extensionsRequired.includes('KHR_texture_basisu'),name+' KTX2');assert.equal(gltf.images.length,3,name+' baked PBR maps');}
  console.log(name,triangles,'triangles',bin.length,'bytes');
}
console.log('Asset manifest OK:',entries,'entries,',bytes,'bytes (initial load uses a subset)');
