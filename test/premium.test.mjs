import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAthleteMotion } from '../src/athlete-motion.js';
import { suggestPower } from '../src/shot-planning.js';
import { createShotGuide } from '../src/shot-guide.js';
import { discById, simulate, flatWorld } from '../src/physics.js';

// Recovery must begin in the actual previous pose, with no one-frame snap, and
// converge to the target without disturbing the authored release quaternion.
const group = new THREE.Group(), actor = new THREE.Group(); group.add(actor);
const root = new THREE.Bone(), head = new THREE.Bone(); root.add(head); actor.add(root);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([.08,.015,0,-.08,.015,0,0,1,0],3));
geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],4));
geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); actor.add(skin);
skin.bind(new THREE.Skeleton([root,head]));
const motion = createAthleteMotion({joints:{root,head},actor,skin,group});
root.rotation.y = 1.1; const release = root.quaternion.clone();
motion.update(1/60,'throw:backhand',.62);
assert(root.quaternion.angleTo(release)<1e-7,'release pose remains exact');
root.quaternion.identity(); motion.update(0,'idle',null);
assert(root.quaternion.angleTo(release)<1e-7,'idle begins at the outgoing throw pose');
root.quaternion.identity(); motion.update(.16,'idle',null);
assert(Math.abs(new THREE.Euler().setFromQuaternion(root.quaternion).y-.55)<1e-6,'halfway recovery blends to target');
root.quaternion.identity(); motion.update(.16,'idle',null);
assert(root.quaternion.angleTo(new THREE.Quaternion())<1e-7,'recovery completes at target');
motion.setGround((x)=>x>0?.12:.02);motion.update(0,'idle',null);
assert(Math.abs(actor.position.y-.117)<1e-5,'actual sole samples clear the higher ground');
motion.lookAt(new THREE.Vector3(100,100,0));motion.update(.1,'idle',null);
assert(Number.isFinite(head.quaternion.lengthSq()),'bounded gaze stays finite');

for(const [distance,type,disc] of [[6.5,'putt','putter'],[45,'backhand','mid'],[85,'backhand','driver']]){
 const w=flatWorld({x:0,y:0,z:-distance}),params={pos:[0,1.15,0],dir:[0,-1],throwType:type,disc:discById(disc)};
 const power=suggestPower(params,w),r=simulate({...params,power},w).result,baseline=simulate({...params,power:.72},w).result;
 assert(power>=.1&&power<=1,'suggested power is legal');
 assert(r.dist<=baseline.dist+1,'suggested power improves the starting estimate');
 if(type==='putt')assert(r.dist<.5,'short putt estimate lands within half a metre');
}
geometry.dispose();skin.material.dispose();skin.skeleton.dispose();
// Hazard styling and contact must use the landing point, not the safe drop lie.
const parent=new THREE.Group(),guide=createShotGuide(parent);
const world={height:(x,z)=>.1*x+.03*z,inWater:()=>true,waterLevel:()=>.8,rough:()=>0};
const result={rest:[3,.8,5],lie:[0,0,0],thrown:18,dist:12,ob:true,holed:false};
const wet=guide.set(result,world,false);
assert.equal(wet.surface,'Water · penalty');assert.equal(wet.danger,true);
const ring=guide.group.children[0];
assert(Math.abs(ring.geometry.attributes.position.getY(0)-.85)<1e-6,'water reticle rests on the actual water surface');
assert(ring.geometry.attributes.position.getX(0)>3,'reticle surrounds the actual landing rather than the drop lie');
const dry=guide.set({...result,ob:false},{...world,inWater:()=>false,rough:()=>1},true);
assert.equal(dry.surface,'Rough');assert.equal(dry.danger,false);
assert.notEqual(ring.material.color.getHex(),0xff9275,'safe estimate clears the hazard color');
guide.dispose();assert.equal(parent.children.length,0,'guide resources detach when disposed');
console.log('Premium motion OK: exact release, smooth recovery, terrain contact, bounded gaze, physics-backed power suggestions, and terrain/water landing guidance.');
