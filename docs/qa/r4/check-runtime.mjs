import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({headless:true});const results=[];
for(const quality of ['low','high'])for(const empty of [false,true]){
 const context=await browser.newContext({viewport:{width:430,height:932}});
 if(empty)await context.route('**/assets/manifest.json',route=>route.fulfill({contentType:'application/json',body:'{}'}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://localhost:8093');await page.waitForFunction(()=>window.__chains);
 await page.evaluate(async quality=>{const C=window.__chains;C.G.settings.quality=quality;await(await import('/src/models.js')).loadModels(C.renderer,quality);},quality);
 for(const course of ['pine','meadow','lake']){
  await page.evaluate(async course=>{const C=window.__chains;await C.loadCourse(course);C.makeHero();},course);await page.waitForTimeout(600);
  const state=await page.evaluate(()=>{const C=window.__chains,variants=new Set(),bad=[];let groups=0;const matrix=new C.THREE.Matrix4();C.course.group.traverse(o=>{
   if(!o.isInstancedMesh||!o.geometry.userData.canopy)return;
   groups++;const {canopy,variant}=o.geometry.userData;variants.add(canopy+variant);const cells=new Set();
   for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);cells.add(Math.floor(matrix.elements[12]/64)+','+Math.floor(matrix.elements[14]/64));}
   if(cells.size!==1)bad.push('crossed64mcell');if(!o.material.customProgramCacheKey().includes('chains-wind-false'))bad.push('missingwind');
   for(const attr of ['position','normal','color'])if(!o.geometry.attributes[attr].array.every(Number.isFinite))bad.push('nonfinite'+attr);
  });return{variants:[...variants].sort(),groups,bad,render:{...C.renderer.info.render}};});
  assert.equal(state.variants.length,6);assert.equal(state.bad.length,0);results.push({quality,empty,course,...state,errors:[...errors]});
 }
 assert.equal(errors.length,0);await context.close();
}
await browser.close();await writeFile(new URL('runtime.json',import.meta.url),JSON.stringify(results,null,2));console.log('Canopy runtime passes all3courses, bothqualities, populated/empty manifests; six variants,64m groups, wind shaders, finite attributes, no application/shader errors.');
