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
  if(/^golfer(_f)?(_lod)?$/.test(name)){
    // athlete v3: Draco body (12.4k / 6.2k tris) plus 12 hair, 6 headwear and 3 glasses variants; one of each draws. Male and female bodies share the contract.
    const lod=name.endsWith('_lod'), prefix=name.startsWith('golfer_f')?'body_f_':'body_';
    assert(gltf.extensionsRequired?.includes('KHR_draco_mesh_compression'),name+' body is Draco compressed');
    const drawn=(gltf.meshes||[]).reduce((n,m)=>n+m.primitives.reduce((a,p)=>a+(p.extensions?.KHR_draco_mesh_compression?0:gltf.accessors[p.indices].count/3),0),0);
    assert.equal(drawn,0,'every primitive is Draco encoded');
    assert(bin.length<(lod?330000:380000),'body/LOD byte budget');
    assert.equal(gltf.animations?.length||0,0,'body does not duplicate animation clips');
    assert.equal(gltf.textures?.length||0,0,'body textures ship separately (manifest textures.body_*)');
    const actual=[...new Set(gltf.skins.flatMap(s=>s.joints.map(i=>gltf.nodes[i].name)))].sort();assert.deepEqual(actual,[...joints].sort());
    for(const slot of ['body','hair','trim','headwear','frame'])assert(gltf.materials.some(m=>m.name===slot),slot);
    const rig=gltf.nodes.find(n=>n.name==='ChainsRig');assert(rig?.extras?.handOffset&&rig.extras.regionLum&&rig.extras.eyeY&&rig.extras.chestY&&rig.extras.legScale,'rig extras carry the grip, eye line, chest line, region luminance and leg scale');
    if(prefix==='body_f_')assert(rig.extras.legScale<1&&rig.extras.legScale>.8,'female rig scales the clip hip drops');
    for(const v of ['hair_wavy','hair_afro','headwear_cap','headwear_visor','glasses_round','glasses_sport','accessory_wristbandR'])assert(gltf.nodes.some(n=>n.name===v),v);
    for(const t of ['albedo','mask1','mask2','normal','albedo_lod','mask1_lod','mask2_lod'])assert(manifest.textures[prefix+t],prefix+t);
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
  } else if(['pine','deciduous','bush'].includes(name)) {assert(gltf.extensionsRequired?.includes('KHR_draco_mesh_compression'),name+' Draco');assert.equal(gltf.images?.length||0,0,name+' leaf textures ship separately');assert(triangles<3200&&bin.length<60000,name+' tree budget');assert(gltf.materials.some(m=>m.name==='bark'),name+' bark material');assert(gltf.nodes.filter(n=>n.mesh!==undefined).length>=2,name+' has variants');
  } else if(name==='disc') {assert(triangles>800&&triangles<8000,'disc lathe budget');assert.equal(gltf.textures?.length||0,0,'disc is runtime-tinted plastic');assert(bin.length<200000,'disc byte budget');
  } else {assert(gltf.extensionsRequired.includes('KHR_draco_mesh_compression'),name+' Draco');assert(gltf.extensionsRequired.includes('KHR_texture_basisu'),name+' KTX2');assert.equal(gltf.images.length,3,name+' baked PBR maps');}
  console.log(name,triangles,'triangles',bin.length,'bytes');
}
console.log('Asset manifest OK:',entries,'entries,',bytes,'bytes (initial load uses a subset)');
