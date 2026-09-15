import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({headless:true});const result=[];
for(const quality of ['low','high']){
const context=await browser.newContext({viewport:{width:430,height:932}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://localhost:8093');await page.waitForFunction(()=>window.__chains);await page.evaluate(async quality=>{const C=window.__chains;C.G.settings.quality=quality;await(await import('/src/models.js')).loadModels(C.renderer,quality);await C.loadCourse('pine');C.makeHero();await C.startGame({mode:'solo',holeCount:3,players:[{name:'You'}]});C.G.introT=10;},quality);await page.waitForFunction(()=>window.__chains.G.phase==='aim');await page.waitForTimeout(3000);
const metrics=await page.evaluate(()=>{const C=window.__chains;let treeTriangles=0,treeDraws=0;C.scene.traverse(o=>{if(o.isInstancedMesh){treeTriangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*o.count;treeDraws++;}});return{treeTriangles,treeDraws,renderer:{...C.renderer.info.render},geometryCount:C.renderer.info.memory.geometries};});await page.screenshot({path:`docs/qa/r3/texture-canopy-${process.env.CANOPY_STAGE}-${quality}.png`});result.push({quality,...metrics,errors});await context.close();}
await browser.close();await writeFile(`docs/qa/r3/texture-canopy-${process.env.CANOPY_STAGE}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
