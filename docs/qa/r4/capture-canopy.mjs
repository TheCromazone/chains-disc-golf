import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const stage=process.env.CANOPY_STAGE||'after';
const browser=await chromium.launch({headless:true});const results=[];
for(const quality of ['low','high']){
 const context=await browser.newContext({viewport:{width:430,height:932}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(stage==='before')await page.route('**/src/course.js',route=>route.fulfill({contentType:'text/javascript',body:execFileSync('git',['show','c15b0ee:src/course.js'],{encoding:'utf8'})}));
 await page.goto('http://localhost:8093/?fps=1');await page.waitForFunction(()=>window.__chains);
 const startup=await page.evaluate(()=>[...performance.getEntriesByType('navigation'),...performance.getEntriesByType('resource')].map(r=>({url:r.name,encoded:r.encodedBodySize,transfer:r.transferSize})));
 await page.evaluate(async quality=>{const C=window.__chains;C.G.settings.quality=quality;await(await import('/src/models.js')).loadModels(C.renderer,quality);await C.loadCourse('pine');C.makeHero();await C.startGame({mode:'solo',holeCount:3,players:[{name:'You'}]});C.G.introT=10;},quality);
 await page.waitForFunction(()=>window.__chains.G.phase==='aim');await page.waitForTimeout(3000);
 await page.addStyleTag({content:'body > :not(canvas){visibility:hidden!important}'});
 for(const view of ['tee','tee-landscape','flyover']){
  if(view!=='tee')await page.setViewportSize({width:812,height:375});
  await page.evaluate(view=>{const C=window.__chains;
   if(view==='flyover'){C.G.phase='qa';C.G.introT=4.0;C.cam.mode='intro';}else{C.cam.mode='aim';}
  },view);await page.waitForTimeout(1500);
  const metrics=await page.evaluate(()=>{const C=window.__chains;let tris=0,batches=0;C.scene.traverse(o=>{if(o.isInstancedMesh){tris+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*o.count;batches++;}});const collisions=new Map();for(let x=-600;x<=600;x+=12)for(let z=-600;z<=600;z+=12)for(const t of C.world.treesNear(x,z))collisions.set(t.x+','+t.z,t);return{camera:C.camera.position.toArray(),instancedTriangles:tris,batches,render:{...C.renderer.info.render},terrain:Array.from(C.course.terrain.geometry.attributes.position.array),collisions:[...collisions.values()],collisionCount:collisions.size};});
  metrics.terrainHash=createHash('sha256').update(JSON.stringify(metrics.terrain)).digest('hex');delete metrics.terrain;
  metrics.collisionHash=createHash('sha256').update(JSON.stringify(metrics.collisions)).digest('hex');delete metrics.collisions;
  await page.screenshot({path:`docs/qa/r4/${stage}-${quality}-${view}.png`});
  results.push({quality,view,...metrics,errors,startup});
 }
 await context.close();
}
await browser.close();await writeFile(`docs/qa/r4/${stage}-canopy.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({startup,...r})=>r),null,2));if(results.some(r=>r.errors.length))process.exitCode=1;
