import assert from 'node:assert/strict';
import * as THREE from 'three';
import {partitionStaticMesh} from '../src/static-chunks.js';
const geo=new THREE.PlaneGeometry(256,256,16,16).rotateX(-Math.PI/2);
const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,Math.sin(p.getX(i)/30)*2);geo.computeVertexNormals();
geo.setAttribute('zone',new THREE.Uint8BufferAttribute(Array.from({length:p.count*4},(_,i)=>i%251),4,true));
const source=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());source.receiveShadow=source.castShadow=true;source.renderOrder=2;
source.customDepthMaterial=new THREE.MeshDepthMaterial();source.onBeforeRender=()=>{};
const signatures=g=>{const result=[];for(let i=0;i<(g.index?.count??g.attributes.position.count);i+=3){const tri=[];for(let j=0;j<3;j++){const v=g.index?g.index.getX(i+j):i+j;for(const a of Object.values(g.attributes))for(let k=0;k<a.itemSize;k++)tri.push(a.array[v*a.itemSize+k]);}result.push(JSON.stringify(tri));}return result};
const before=signatures(geo).sort();let disposed=0;geo.addEventListener('dispose',()=>disposed++);
let randomCalls=0;const random=Math.random;Math.random=()=>{randomCalls++;return random()};let chunks;try{chunks=partitionStaticMesh(source,{cellSize:64})}finally{Math.random=random}
assert.equal(randomCalls,0,'partition UUIDs do not perturb the game random stream');
assert(chunks.length>4);assert.equal(disposed,1,'replaced geometry releases any GPU allocation');assert.deepEqual(chunks.flatMap(c=>signatures(c.geometry)).sort(),before,'every triangle, winding and attribute survives exactly once');
for(const c of chunks){assert.equal(c.material,source.material);assert.equal(c.customDepthMaterial,source.customDepthMaterial);assert(c.castShadow&&c.receiveShadow);assert.equal(c.renderOrder,2);assert.equal(c.onBeforeRender,source.onBeforeRender);assert(c.frustumCulled);assert.equal(c.geometry.attributes.zone.normalized,true);assert(c.geometry.boundingSphere&&c.geometry.boundingBox)}
const camera=new THREE.PerspectiveCamera(40,1,.1,70);camera.position.set(0,18,20);camera.lookAt(0,0,0);camera.updateMatrixWorld();const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));const visible=chunks.filter(c=>frustum.intersectsObject(c));assert(visible.length<chunks.length,'off-screen terrain can now cull');
const ray=new THREE.Raycaster(new THREE.Vector3(0,100,0),new THREE.Vector3(0,-1,0));source.updateMatrixWorld();chunks.forEach(c=>c.updateMatrixWorld());assert(Math.abs(ray.intersectObject(source)[0].distance-ray.intersectObjects(chunks)[0].distance)<1e-6,'seam raycast retains original ground');
const non=new THREE.Mesh(new THREE.PlaneGeometry(100,100,4,4).toNonIndexed(),source.material);const expected=signatures(non.geometry).sort();const parts=partitionStaticMesh(non,{cellSize:32});assert.deepEqual(parts.flatMap(c=>signatures(c.geometry)).sort(),expected,'non-indexed geometry also preserved');
const small=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),source.material);assert.deepEqual(partitionStaticMesh(small,{cellSize:64}),[small],'small meshes do not gain draws');
const partial=new THREE.Mesh(new THREE.PlaneGeometry(200,200,4,4),source.material);partial.geometry.setDrawRange(3,6);assert.deepEqual(partitionStaticMesh(partial),[partial],'partial draw ranges remain intact');
console.log('Static chunks preserve triangles, attributes, shadows, seams and RNG while enabling native frustum culling.');
