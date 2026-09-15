import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JOINTS,K,IDLE,poseAt,mirrorPose,soleHeights} from '../src/throw-poses.js';import {THROWS} from '../src/physics.js';
const manifest=JSON.parse(readFileSync('assets/manifest.json','utf8'));assert.equal(Object.keys(THROWS).length,10);assert.deepEqual(Object.keys(K).sort(),Object.keys(THROWS).sort());
function read(path){const bytes=readFileSync('assets/'+path),n=bytes.readUInt32LE(12);return{d:JSON.parse(bytes.subarray(20,20+n)),bin:bytes.subarray(28+n)};}
function vals(g,i){const a=g.d.accessors[i],v=g.d.bufferViews[a.bufferView],width={SCALAR:1,VEC3:3,VEC4:4}[a.type],out=[];assert.equal(a.componentType,5126);for(let n=0;n<a.count;n++){const r=[];for(let k=0;k<width;k++)r.push(g.bin.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+n*(v.byteStride||4*width)+k*4));out.push(r);}return out;}
function quat([x,y,z]){const c1=Math.cos(x/2),c2=Math.cos(y/2),c3=Math.cos(z/2),s1=Math.sin(x/2),s2=Math.sin(y/2),s3=Math.sin(z/2);return[s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3];}
let checked=0;for(const id of Object.keys(THROWS))for(const left of [false,true]){const name=id+(left?'_left':''),g=read(manifest.models['golfer_'+name]);assert.equal(g.d.animations.length,1);assert.equal(g.d.animations[0].name,name);assert(!g.d.meshes?.length);assert(!g.d.textures?.length);assert(g.d.nodes.every(n=>!n.scale||n.scale.every(s=>s>0)),'positive authored transform');for(const phase of [0,.5,.62,.8,1]){let pose=poseAt(K[id],phase);if(left)pose=mirrorPose(pose);for(const joint of JOINTS){const a=g.d.animations[0],c=a.channels.find(c=>g.d.nodes[c.target.node].name===joint&&c.target.path==='rotation');assert(c,`rotation ${name}/${joint}`);const sampler=a.samplers[c.sampler],times=vals(g,sampler.input).flat(),i=times.findIndex(t=>Math.abs(t-phase)<1e-5),values=vals(g,sampler.output);assert(i>=0||values.every(v=>v.every((n,k)=>Math.abs(n-values[0][k])<1e-7)),`${name}/${joint} exact phase ${phase} or constant track`);const q=values[Math.max(0,i)],want=quat(pose[joint]);assert(Math.abs(Math.abs(q.reduce((s,v,i)=>s+v*want[i],0))-1)<1e-5,`${name}/${joint} matches shared pose at ${phase}`);checked++;}}}
console.log(`Animation contract OK: 20 distinct RH/LH throw clips, ${checked} authored joint samples; positive scales; exact .62 release.`);
// Release must be a moving frame, not an ease-in/ease-out stop inserted at every key.
for(const [id,keys] of Object.entries(K)){
 const eps=.00001,a=poseAt(keys,.62-eps),b=poseAt(keys,.62),c=poseAt(keys,.62+eps);
 const va=JOINTS.flatMap(j=>b[j].map((v,i)=>(v-a[j][i])/eps)),vb=JOINTS.flatMap(j=>c[j].map((v,i)=>(v-b[j][i])/eps));
 const speed=Math.hypot(...va),jump=Math.hypot(...va.map((v,i)=>vb[i]-v));
 assert(speed>1,`${id} retains body angular velocity at release`);assert(jump/speed<.005,`${id} continuous release velocity`);
}
console.log('All ten release poses preserve nonzero, continuous angular momentum.');

for(const [id,keys] of Object.entries(K)){
 for(let i=0;i<=100;i++)for(const left of [false,true]){let p=poseAt(keys,i/100);if(left)p=mirrorPose(p);const feet=soleHeights(p);assert(Math.abs(Math.min(...feet))<1e-7,`${id} support sole stays at floor`);assert(feet.every(h=>h>=-1e-7),`${id} no buried sole`);}
 assert(poseAt(keys,.5).rootY<-.08,`${id} visibly loads knees in windup`);
 const lead=['backhand','putt'].includes(id.split('_')[0])?0:1,feet=soleHeights(poseAt(keys,.8));assert(feet[lead]<.001&&feet[1-lead]>.06,`${id} braces lead leg and frees trailing foot`);
}
console.log('All ten throws and both hands: 2,020 support samples stay on the floor, visible knee loading, braced lead and lifted trailing foot.');
