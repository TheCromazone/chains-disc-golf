// Integration proof: all original detail files load, actual material shaders sample them,
// and the game renders with both quality modes and an empty manifest.
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
await mkdir('docs/qa/r3',{recursive:true});
const results=[];
for(const [quality,empty] of [['low',false],['high',false],['low',true]]) {
  const context=await browser.newContext({viewport:{width:430,height:932},deviceScaleFactor:1});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(empty) await page.route('**/assets/manifest.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  await page.goto('http://localhost:8093');await page.waitForFunction(()=>window.__chains);
  await page.waitForTimeout(1200);
  await page.evaluate(async quality=>{const C=window.__chains;C.G.settings.quality=quality;await (await import('/src/models.js')).loadModels(C.renderer,quality);await C.loadCourse('pine');C.makeHero();},quality);
  await page.evaluate(()=>window.__chains.startGame({mode:'solo',holeCount:3,players:[{name:'You'}]}));
  await page.evaluate(()=>window.__chains.G.introT=10);
  await page.waitForFunction(()=>window.__chains.G.phase==='aim');
  await page.waitForTimeout(3000);
  await page.screenshot({path:`docs/qa/r3/texture-${quality}${empty?'-fallback':''}.png`});
  const startupBytes=await page.evaluate(()=>[...performance.getEntriesByType('navigation'),...performance.getEntriesByType('resource')].reduce((s,r)=>s+r.encodedBodySize,0));
  // Pine has no rendered pond; Lake exercises the twelfth (water) material.
  await page.evaluate(()=>window.__chains.loadCourse('lake'));
  await page.waitForTimeout(1200);
  const result=await page.evaluate(()=>{
    const mats=new Set();window.__chains.scene.traverse(o=>{for(const m of [].concat(o.material||[]))mats.add(m);});
    const paintShaders=[];for(const m of mats){if(!/paint/.test(m.customProgramCacheKey?.()||''))continue;const s={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};m.onBeforeCompile(s);paintShaders.push({type:m.type,maps:Object.values(s.uniforms).filter(u=>u.value?.isTexture).map(u=>({url:u.value.image?.src||'canvas',width:u.value.image?.width||0,height:u.value.image?.height||0})),ground:s.fragmentShader.includes('fairDetail')});}
    const entries=[...performance.getEntriesByType('navigation'),...performance.getEntriesByType('resource')];
    return {quality:window.__chains.G.settings.quality,paintShaders,encodedBytes:entries.reduce((s,r)=>s+r.encodedBodySize,0),detailRequests:entries.filter(r=>r.name.includes('/textures/r3/')).map(r=>({name:r.name,encoded:r.encodedBodySize}))};
  });
  results.push({...result,startupBytes,empty,errors});await context.close();
}
await browser.close();await writeFile('docs/qa/r3/texture-results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({quality:r.quality,empty:r.empty,errors:r.errors,encodedBytes:r.encodedBytes,loaded:r.detailRequests.length,shaders:r.paintShaders.length})),null,2));
if(results.some(r=>r.errors.length || (!r.empty && r.detailRequests.length!==12)))process.exitCode=1;
